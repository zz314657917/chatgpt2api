package httpapi

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

const socialXHSCardSize = "1080x1440"

func (a *App) handleSocialProjects(w http.ResponseWriter, r *http.Request) {
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	if a.social == nil {
		util.WriteError(w, http.StatusServiceUnavailable, "social project service is unavailable")
		return
	}

	parts := splitPath(r.URL.Path)
	if r.URL.Path == "/api/social-projects" {
		switch r.Method {
		case http.MethodGet:
			util.WriteJSON(w, http.StatusOK, map[string]any{"items": a.social.ListProjects(identity)})
		case http.MethodPost:
			project, err := readSocialProjectBody(r)
			if err != nil {
				util.WriteError(w, http.StatusBadRequest, err.Error())
				return
			}
			created, err := a.social.CreateProject(identity, project)
			if err != nil {
				util.WriteError(w, http.StatusBadRequest, err.Error())
				return
			}
			util.WriteJSON(w, http.StatusOK, map[string]any{"item": created})
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
		return
	}
	if len(parts) < 3 || parts[0] != "api" || parts[1] != "social-projects" {
		http.NotFound(w, r)
		return
	}
	projectID := parts[2]
	if len(parts) == 3 {
		switch r.Method {
		case http.MethodGet:
			project, found := a.social.GetProject(identity, projectID)
			if !found {
				util.WriteError(w, http.StatusNotFound, "social project not found")
				return
			}
			util.WriteJSON(w, http.StatusOK, map[string]any{"item": project})
		case http.MethodPost:
			project, err := readSocialProjectBody(r)
			if err != nil {
				util.WriteError(w, http.StatusBadRequest, err.Error())
				return
			}
			saved, err := a.social.SaveProject(identity, projectID, project)
			if err != nil {
				writeSocialProjectMutationError(w, err)
				return
			}
			util.WriteJSON(w, http.StatusOK, map[string]any{"item": saved})
		case http.MethodDelete:
			if err := a.social.DeleteProject(identity, projectID); err != nil {
				writeSocialProjectMutationError(w, err)
				return
			}
			util.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
		return
	}
	if len(parts) != 4 || r.Method != http.MethodPost {
		http.NotFound(w, r)
		return
	}
	switch parts[3] {
	case "generate-copy":
		a.handleSocialProjectGenerateCopy(w, r, identity, projectID)
	case "generate-cards":
		a.handleSocialProjectGenerateCards(w, r, identity, projectID)
	case "export":
		a.handleSocialProjectExport(w, r, identity, projectID)
	default:
		http.NotFound(w, r)
	}
}

func (a *App) handleSocialProjectGenerateCopy(w http.ResponseWriter, r *http.Request, identity service.Identity, projectID string) {
	body, _ := readJSONMap(r)
	project, found := a.social.GetProject(identity, projectID)
	if !found {
		util.WriteError(w, http.StatusNotFound, "social project not found")
		return
	}
	model := firstNonEmpty(util.Clean(body["model"]), util.DefaultChatModel)
	prompt := buildSocialCopyPrompt(project)
	taskID := firstNonEmpty(util.Clean(body["client_task_id"]), "social-copy-"+util.NewHex(18))
	metadata, err := a.socialTaskMetadata(identity, nil)
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	task, err := a.tasks.SubmitChatWithMetadata(r.Context(), identity, taskID, prompt, model, socialCopyMessages(project, prompt), true, metadata)
	if err != nil {
		writeCreationTaskSubmitError(w, err)
		return
	}
	updated, err := a.social.PatchProject(identity, projectID, func(item *service.SocialProject) error {
		item.CopyTaskID = util.Clean(task["id"])
		item.Status = service.SocialProjectStatusGeneratingCopy
		return nil
	})
	if err != nil {
		writeSocialProjectMutationError(w, err)
		return
	}
	util.WriteJSON(w, http.StatusOK, map[string]any{"item": updated, "task": task})
}

func (a *App) handleSocialProjectGenerateCards(w http.ResponseWriter, r *http.Request, identity service.Identity, projectID string) {
	body, _ := readJSONMap(r)
	project, found := a.social.GetProject(identity, projectID)
	if !found {
		util.WriteError(w, http.StatusNotFound, "social project not found")
		return
	}
	model := firstNonEmpty(util.Clean(body["model"]), util.ImageModelGPT)
	taskIDs := []string{}
	tasks := []map[string]any{}
	nextCards := append([]service.SocialCard(nil), project.Cards...)
	for index := range nextCards {
		card := &nextCards[index]
		if card.VisualMode != service.SocialCardVisualAI || card.ImagePrompt == "" {
			continue
		}
		taskID := fmt.Sprintf("social-card-%s-%02d-%s", util.SHA1Short(project.ID, 8), index+1, util.SHA1Short(card.ImagePrompt, 10))
		metadata, err := a.socialTaskMetadata(identity, map[string]any{"requested_size": socialXHSCardSize})
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		task, err := a.tasks.SubmitGenerationWithOptions(
			r.Context(),
			identity,
			taskID,
			card.ImagePrompt,
			model,
			socialXHSCardSize,
			"",
			a.resolveImageBaseURL(r),
			1,
			nil,
			metadata,
			service.ImageOutputOptions{Format: "png"},
			service.ImageToolOptions{},
			service.ImageVisibilityPrivate,
		)
		if err != nil {
			updated, patchErr := a.persistSocialCardTaskState(identity, projectID, nextCards, taskIDs, len(taskIDs) > 0)
			cancelErrors := a.cancelSocialCardTasks(identity, taskIDs)
			status := http.StatusBadRequest
			var limitErr service.ImageTaskLimitError
			var billingErr service.BillingLimitError
			if errors.As(err, &billingErr) || errors.As(err, &limitErr) {
				status = http.StatusTooManyRequests
			}
			payload := util.ErrorPayload(err.Error())
			payload["partial_tasks"] = tasks
			payload["cancel_errors"] = cancelErrors
			if patchErr != nil {
				payload["project_update_error"] = patchErr.Error()
			} else if updated.ID != "" {
				payload["item"] = updated
			}
			util.WriteJSON(w, status, map[string]any{"detail": payload})
			return
		}
		card.TaskID = util.Clean(task["id"])
		card.Status = service.TaskStatusQueued
		taskIDs = append(taskIDs, card.TaskID)
		tasks = append(tasks, task)
	}
	updated, err := a.persistSocialCardTaskState(identity, projectID, nextCards, taskIDs, len(taskIDs) > 0)
	if err != nil {
		writeSocialProjectMutationError(w, err)
		return
	}
	util.WriteJSON(w, http.StatusOK, map[string]any{"item": updated, "tasks": tasks})
}

func (a *App) persistSocialCardTaskState(identity service.Identity, projectID string, cards []service.SocialCard, taskIDs []string, generating bool) (service.SocialProject, error) {
	return a.social.PatchProject(identity, projectID, func(item *service.SocialProject) error {
		item.Cards = cards
		item.CardTaskIDs = taskIDs
		if generating {
			item.Status = service.SocialProjectStatusGeneratingCards
		} else {
			item.Status = service.SocialProjectStatusCardsReady
		}
		return nil
	})
}

func (a *App) cancelSocialCardTasks(identity service.Identity, taskIDs []string) []string {
	var errors []string
	for _, taskID := range taskIDs {
		if taskID == "" {
			continue
		}
		if _, err := a.tasks.CancelTask(identity, taskID); err != nil {
			errors = append(errors, fmt.Sprintf("%s: %s", taskID, err.Error()))
		}
	}
	return errors
}

func (a *App) handleSocialProjectExport(w http.ResponseWriter, r *http.Request, identity service.Identity, projectID string) {
	body, _ := readJSONMap(r)
	fileName := util.Clean(body["file_name"])
	if fileName == "" {
		fileName = "social-export-" + util.NewHex(8) + ".zip"
	}
	updated, err := a.social.PatchProject(identity, projectID, func(item *service.SocialProject) error {
		item.Status = service.SocialProjectStatusExported
		item.LastExportedAt = util.NowISO()
		item.ExportedFile = fileName
		return nil
	})
	if err != nil {
		writeSocialProjectMutationError(w, err)
		return
	}
	util.WriteJSON(w, http.StatusOK, map[string]any{
		"item":       updated,
		"file_name":  fileName,
		"markdown":   socialProjectMarkdown(updated),
		"card_count": len(updated.Cards),
	})
}

func readSocialProjectBody(r *http.Request) (service.SocialProject, error) {
	var project service.SocialProject
	if err := util.DecodeJSON(r.Body, &project); err != nil {
		return project, fmt.Errorf("invalid json body")
	}
	return project, nil
}

func writeSocialProjectMutationError(w http.ResponseWriter, err error) {
	if strings.Contains(err.Error(), "not found") {
		util.WriteError(w, http.StatusNotFound, err.Error())
		return
	}
	util.WriteError(w, http.StatusBadRequest, err.Error())
}

func socialCopyMessages(project service.SocialProject, prompt string) []map[string]any {
	return []map[string]any{
		{"role": "system", "content": "你是社交媒体内容运营助手，只输出严格 JSON，不要 Markdown 代码块。"},
		{"role": "user", "content": prompt},
	}
}

func (a *App) socialTaskMetadata(identity service.Identity, metadata map[string]any) (map[string]any, error) {
	out := util.CopyMap(metadata)
	if out == nil {
		out = map[string]any{}
	}
	if err := a.attachTaskSpace(identity, out, ""); err != nil {
		return nil, err
	}
	return out, nil
}

func buildSocialCopyPrompt(project service.SocialProject) string {
	source := strings.TrimSpace(project.SourceText)
	if source == "" {
		source = project.Topic
	}
	return strings.TrimSpace(fmt.Sprintf(`请为小红书生成一篇通用运营图文内容方案。

要求：
- 面向真实人工发布，不要承诺自动发布。
- 标题 15-25 字，直接给核心钩子，不要夸张营销词。
- 正文结构清晰，有开头钩子、价值展开、行动建议。
- 标签 8-12 个，不带 #。
- 轮播卡片 3-8 页，1080x1440，3:4。
- 卡片 visual_mode 只能是 info 或 ai。只有封面氛围、抽象概念、生活方式画面才用 ai；数据、流程、清单、方法论用 info。
- 每张卡片只表达一个重点。图片不是正文重复，而是补充说明。

请只输出 JSON：
{
  "title": "标题",
  "caption": "可直接发布的正文",
  "tags": ["标签"],
  "cards": [
    {"title":"卡片标题","body":"卡片正文，尽量短","layout":"cover|list|quote|steps|summary","visual_mode":"info|ai","image_prompt":"如果 visual_mode=ai，写中文图像 prompt，否则空字符串","accent":"#1456f0"}
  ]
}

平台：小红书
主题：%s
目标人群：%s
语气：%s
素材：
%s`, firstNonEmpty(project.Topic, "未命名内容"), firstNonEmpty(project.Audience, "通用小红书用户"), firstNonEmpty(project.Tone, "专业、自然、可读"), source))
}

func socialProjectMarkdown(project service.SocialProject) string {
	var b strings.Builder
	if project.Title != "" {
		b.WriteString("# ")
		b.WriteString(project.Title)
		b.WriteString("\n\n")
	}
	if project.Caption != "" {
		b.WriteString(project.Caption)
		b.WriteString("\n\n")
	}
	if len(project.Tags) > 0 {
		for index, tag := range project.Tags {
			if index > 0 {
				b.WriteString(" ")
			}
			b.WriteString("#")
			b.WriteString(strings.TrimPrefix(tag, "#"))
		}
		b.WriteString("\n")
	}
	return strings.TrimSpace(b.String())
}
