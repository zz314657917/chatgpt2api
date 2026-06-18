package httpapi

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"chatgpt2api/internal/protocol"
	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

const canvasTaskPollInterval = 600 * time.Millisecond

type canvasModelOption struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Kind         string   `json:"kind"`
	Capabilities []string `json:"capabilities"`
	GroupModes   []string `json:"group_modes,omitempty"`
	Enabled      bool     `json:"enabled"`
}

func (a *App) handleCanvasModels(w http.ResponseWriter, r *http.Request) {
	started := time.Now()
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		a.logFrontendCriticalRequest(r, "canvas_models", started, http.StatusMethodNotAllowed)
		return
	}
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		a.logFrontendCriticalRequest(r, "canvas_models", started, http.StatusUnauthorized)
		return
	}
	util.WriteJSON(w, http.StatusOK, map[string]any{
		"items": a.canvasModelCatalog(r.Context(), identity),
	})
	a.logFrontendCriticalRequest(r, "canvas_models", started, http.StatusOK)
}

func (a *App) handleCanvases(w http.ResponseWriter, r *http.Request) {
	started := time.Now()
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		if r.Method == http.MethodGet && r.URL.Path == "/api/canvases" {
			a.logFrontendCriticalRequest(r, "canvases", started, http.StatusUnauthorized)
		}
		return
	}
	if a.canvases == nil {
		util.WriteError(w, http.StatusServiceUnavailable, "canvas service is unavailable")
		if r.Method == http.MethodGet && r.URL.Path == "/api/canvases" {
			a.logFrontendCriticalRequest(r, "canvases", started, http.StatusServiceUnavailable)
		}
		return
	}
	parts := splitPath(r.URL.Path)
	if r.URL.Path == "/api/canvases" {
		switch r.Method {
		case http.MethodGet:
			util.WriteJSON(w, http.StatusOK, map[string]any{"items": a.canvases.ListCanvases(identity)})
			a.logFrontendCriticalRequest(r, "canvases", started, http.StatusOK)
		case http.MethodPost:
			body, err := readCanvasBody(r)
			if err != nil {
				util.WriteError(w, http.StatusBadRequest, err.Error())
				return
			}
			canvas, err := a.canvases.CreateCanvas(identity, body)
			if err != nil {
				util.WriteError(w, http.StatusBadRequest, err.Error())
				return
			}
			util.WriteJSON(w, http.StatusOK, map[string]any{"item": canvas})
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
		return
	}
	if len(parts) < 3 || parts[0] != "api" || parts[1] != "canvases" {
		http.NotFound(w, r)
		return
	}
	canvasID := parts[2]
	if len(parts) == 4 && parts[3] == "runs" {
		switch r.Method {
		case http.MethodGet:
			util.WriteJSON(w, http.StatusOK, map[string]any{"items": a.canvases.ListRuns(identity, canvasID)})
		case http.MethodPost:
			body, _ := readJSONMap(r)
			run, err := a.canvases.StartRun(identity, canvasID, service.CanvasRunRequest{
				NodeIDs: util.AsStringSlice(body["node_ids"]),
			}, a)
			if err != nil {
				util.WriteError(w, http.StatusBadRequest, err.Error())
				return
			}
			util.WriteJSON(w, http.StatusOK, map[string]any{"item": run})
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
		return
	}
	if len(parts) != 3 {
		http.NotFound(w, r)
		return
	}
	switch r.Method {
	case http.MethodGet:
		canvas, found := a.canvases.GetCanvas(identity, canvasID)
		if !found {
			util.WriteError(w, http.StatusNotFound, "canvas not found")
			return
		}
		util.WriteJSON(w, http.StatusOK, map[string]any{"item": canvas})
	case http.MethodPost:
		body, err := readCanvasBody(r)
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		canvas, err := a.canvases.SaveCanvas(identity, canvasID, body)
		if err != nil {
			util.WriteError(w, http.StatusNotFound, err.Error())
			return
		}
		util.WriteJSON(w, http.StatusOK, map[string]any{"item": canvas})
	case http.MethodDelete:
		if err := a.canvases.DeleteCanvas(identity, canvasID); err != nil {
			util.WriteError(w, http.StatusNotFound, err.Error())
			return
		}
		util.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (a *App) handleCanvasRuns(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	if a.canvases == nil {
		util.WriteError(w, http.StatusServiceUnavailable, "canvas service is unavailable")
		return
	}
	parts := splitPath(r.URL.Path)
	if len(parts) < 3 || parts[0] != "api" || parts[1] != "canvas-runs" {
		http.NotFound(w, r)
		return
	}
	runID := parts[2]
	if len(parts) == 4 && parts[3] == "cancel" {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		run, err := a.canvases.CancelRun(identity, runID)
		if err != nil {
			util.WriteError(w, http.StatusNotFound, err.Error())
			return
		}
		util.WriteJSON(w, http.StatusOK, map[string]any{"item": run})
		return
	}
	if len(parts) != 3 {
		http.NotFound(w, r)
		return
	}
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	run, found := a.canvases.GetRun(identity, runID)
	if !found {
		util.WriteError(w, http.StatusNotFound, "canvas run not found")
		return
	}
	util.WriteJSON(w, http.StatusOK, map[string]any{"item": run})
}

func (a *App) ExecuteCanvasNode(ctx context.Context, identity service.Identity, exec service.CanvasNodeExecution) (service.CanvasNodeOutput, error) {
	switch exec.Node.Type {
	case service.CanvasNodeTypeText:
		text := firstNonEmpty(util.Clean(exec.Node.Data["text"]), util.Clean(exec.Node.Data["prompt"]))
		if text == "" {
			return service.CanvasNodeOutput{}, fmt.Errorf("文本节点缺少内容")
		}
		return service.CanvasNodeOutput{Text: text}, nil
	case service.CanvasNodeTypeImage:
		output := canvasImageNodeOutput(exec.Node)
		if len(output.Images) == 0 {
			return service.CanvasNodeOutput{}, fmt.Errorf("图片节点缺少图片 URL")
		}
		return output, nil
	case service.CanvasNodeTypeResult:
		return canvasResultNodeOutput(exec.Inputs), nil
	case service.CanvasNodeTypeGroup:
		return canvasResultNodeOutput(exec.Inputs), nil
	case service.CanvasNodeTypePrompt:
		return a.executeCanvasPromptNode(ctx, identity, exec)
	case service.CanvasNodeTypeImageCreate:
		return a.executeCanvasImageGenerationNode(ctx, identity, exec)
	case service.CanvasNodeTypeImageEdit:
		return a.executeCanvasImageEditNode(ctx, identity, exec)
	case service.CanvasNodeTypeVideoCreate:
		return a.executeCanvasVideoGenerationNode(ctx, identity, exec)
	default:
		return service.CanvasNodeOutput{}, fmt.Errorf("unknown node type: %s", exec.Node.Type)
	}
}

func (a *App) executeCanvasPromptNode(ctx context.Context, identity service.Identity, exec service.CanvasNodeExecution) (service.CanvasNodeOutput, error) {
	prompt := canvasPrompt(exec.Node, exec.Inputs)
	if prompt == "" {
		return service.CanvasNodeOutput{}, fmt.Errorf("提示词优化节点缺少输入文本")
	}
	instruction := firstNonEmpty(util.Clean(exec.Node.Data["instruction"]), "优化下面的图片生成提示词，保留核心意图，输出一段可直接用于文生图的中文提示词，不要解释。")
	messages := []map[string]any{
		{"role": "system", "content": instruction},
		{"role": "user", "content": prompt},
	}
	taskID := canvasTaskID(exec.RunID, exec.Node.ID)
	metadata, err := a.canvasTaskMetadata(identity, exec.Node)
	if err != nil {
		return service.CanvasNodeOutput{}, err
	}
	task, err := a.tasks.SubmitChatWithMetadata(ctx, identity, taskID, prompt, canvasNodeModel(exec.Node, util.ImageModelAuto), messages, true, metadata)
	if err != nil {
		return service.CanvasNodeOutput{}, err
	}
	return a.waitCanvasTaskOutput(ctx, identity, taskID, task)
}

func (a *App) executeCanvasImageGenerationNode(ctx context.Context, identity service.Identity, exec service.CanvasNodeExecution) (service.CanvasNodeOutput, error) {
	prompt := canvasPrompt(exec.Node, exec.Inputs)
	if prompt == "" {
		return service.CanvasNodeOutput{}, fmt.Errorf("文生图节点缺少 prompt")
	}
	taskID := canvasTaskID(exec.RunID, exec.Node.ID)
	metadata, err := a.canvasTaskMetadata(identity, exec.Node)
	if err != nil {
		return service.CanvasNodeOutput{}, err
	}
	imageRefs, maskRefs := splitCanvasMaskRefs(canvasImageRefs(exec.Node, exec.Inputs))
	toolOptions := canvasImageToolOptions(exec.Node)
	if len(imageRefs) > 0 {
		images, err := a.canvasUploadedImagesFromRefs(identity, imageRefs)
		if err != nil {
			return service.CanvasNodeOutput{}, err
		}
		if len(images) == 0 {
			return service.CanvasNodeOutput{}, fmt.Errorf("图生图节点缺少上游图片")
		}
		if toolOptions.InputImageMask == "" && len(maskRefs) > 0 {
			mask, err := a.canvasMaskDataURL(identity, maskRefs[0])
			if err != nil {
				return service.CanvasNodeOutput{}, err
			}
			toolOptions.InputImageMask = mask
		}
		task, err := a.tasks.SubmitEditWithOptions(
			ctx,
			identity,
			taskID,
			prompt,
			canvasNodeModel(exec.Node, util.ImageModelAuto),
			protocol.NormalizeImageGenerationSize(util.Clean(exec.Node.Data["size"])),
			util.Clean(exec.Node.Data["quality"]),
			a.configuredBaseURL(),
			images,
			util.ToInt(exec.Node.Data["n"], 1),
			nil,
			metadata,
			canvasImageOutputOptions(exec.Node),
			toolOptions,
			canvasNodeVisibility(exec.Node),
		)
		if err != nil {
			return service.CanvasNodeOutput{}, err
		}
		return a.waitCanvasTaskOutput(ctx, identity, taskID, task)
	}
	if len(maskRefs) > 0 {
		return service.CanvasNodeOutput{}, fmt.Errorf("蒙版需要和原图一起作为输入")
	}
	task, err := a.tasks.SubmitGenerationWithOptions(
		ctx,
		identity,
		taskID,
		prompt,
		canvasNodeModel(exec.Node, util.ImageModelAuto),
		protocol.NormalizeImageGenerationSize(util.Clean(exec.Node.Data["size"])),
		util.Clean(exec.Node.Data["quality"]),
		a.configuredBaseURL(),
		util.ToInt(exec.Node.Data["n"], 1),
		nil,
		metadata,
		canvasImageOutputOptions(exec.Node),
		toolOptions,
		canvasNodeVisibility(exec.Node),
	)
	if err != nil {
		return service.CanvasNodeOutput{}, err
	}
	return a.waitCanvasTaskOutput(ctx, identity, taskID, task)
}

func (a *App) executeCanvasVideoGenerationNode(ctx context.Context, identity service.Identity, exec service.CanvasNodeExecution) (service.CanvasNodeOutput, error) {
	prompt := canvasPrompt(exec.Node, exec.Inputs)
	if prompt == "" {
		return service.CanvasNodeOutput{}, fmt.Errorf("视频生成节点缺少 prompt")
	}
	imageRefs, _ := splitCanvasMaskRefs(canvasImageRefs(exec.Node, exec.Inputs))
	images, err := a.canvasUploadedImagesFromRefs(identity, imageRefs)
	if err != nil {
		return service.CanvasNodeOutput{}, err
	}
	taskID := canvasTaskID(exec.RunID, exec.Node.ID)
	metadata, err := a.canvasTaskMetadata(identity, exec.Node)
	if err != nil {
		return service.CanvasNodeOutput{}, err
	}
	task, err := a.tasks.SubmitVideoWithMetadata(
		ctx,
		identity,
		taskID,
		prompt,
		canvasNodeModel(exec.Node, util.ImageModelAuto),
		images,
		service.VideoGenerationOptions{
			Duration:      util.ToInt(exec.Node.Data["duration"], 5),
			AspectRatio:   util.Clean(exec.Node.Data["aspect_ratio"]),
			Resolution:    util.Clean(exec.Node.Data["resolution"]),
			EnhancePrompt: util.ToBool(exec.Node.Data["enhance_prompt"]),
			GenerateAudio: util.ToBool(exec.Node.Data["generate_audio"]),
		},
		metadata,
		canvasNodeVisibility(exec.Node),
	)
	if err != nil {
		return service.CanvasNodeOutput{}, err
	}
	return a.waitCanvasTaskOutput(ctx, identity, taskID, task)
}

func (a *App) executeCanvasImageEditNode(ctx context.Context, identity service.Identity, exec service.CanvasNodeExecution) (service.CanvasNodeOutput, error) {
	prompt := canvasPrompt(exec.Node, exec.Inputs)
	if prompt == "" {
		return service.CanvasNodeOutput{}, fmt.Errorf("图生图节点缺少 prompt")
	}
	refs := canvasImageRefs(exec.Node, exec.Inputs)
	imageRefs, maskRefs := splitCanvasMaskRefs(refs)
	images, err := a.canvasUploadedImagesFromRefs(identity, imageRefs)
	if err != nil {
		return service.CanvasNodeOutput{}, err
	}
	if len(images) == 0 {
		return service.CanvasNodeOutput{}, fmt.Errorf("图生图节点缺少上游图片")
	}
	taskID := canvasTaskID(exec.RunID, exec.Node.ID)
	metadata, err := a.canvasTaskMetadata(identity, exec.Node)
	if err != nil {
		return service.CanvasNodeOutput{}, err
	}
	toolOptions := canvasImageToolOptions(exec.Node)
	if toolOptions.InputImageMask == "" && len(maskRefs) > 0 {
		mask, err := a.canvasMaskDataURL(identity, maskRefs[0])
		if err != nil {
			return service.CanvasNodeOutput{}, err
		}
		toolOptions.InputImageMask = mask
	}
	task, err := a.tasks.SubmitEditWithOptions(
		ctx,
		identity,
		taskID,
		prompt,
		canvasNodeModel(exec.Node, util.ImageModelAuto),
		protocol.NormalizeImageGenerationSize(util.Clean(exec.Node.Data["size"])),
		util.Clean(exec.Node.Data["quality"]),
		a.configuredBaseURL(),
		images,
		util.ToInt(exec.Node.Data["n"], 1),
		nil,
		metadata,
		canvasImageOutputOptions(exec.Node),
		toolOptions,
		canvasNodeVisibility(exec.Node),
	)
	if err != nil {
		return service.CanvasNodeOutput{}, err
	}
	return a.waitCanvasTaskOutput(ctx, identity, taskID, task)
}

func (a *App) canvasTaskMetadata(identity service.Identity, node service.CanvasNode) (map[string]any, error) {
	metadata := canvasImageTaskMetadata(node)
	if err := a.attachTaskSpace(identity, metadata, ""); err != nil {
		return nil, err
	}
	return metadata, nil
}

func (a *App) waitCanvasTaskOutput(ctx context.Context, identity service.Identity, taskID string, initial map[string]any) (service.CanvasNodeOutput, error) {
	task := initial
	ticker := time.NewTicker(canvasTaskPollInterval)
	defer ticker.Stop()
	for {
		status := util.Clean(task["status"])
		switch status {
		case service.TaskStatusSuccess:
			return canvasOutputFromTask(task), nil
		case service.TaskStatusError, service.TaskStatusCancelled:
			return service.CanvasNodeOutput{}, fmt.Errorf("%s", firstNonEmpty(util.Clean(task["error"]), "creation task failed"))
		}
		select {
		case <-ctx.Done():
			_, _ = a.tasks.CancelTask(identity, taskID)
			return service.CanvasNodeOutput{}, ctx.Err()
		case <-ticker.C:
			next, ok := a.tasks.GetTask(identity, taskID)
			if !ok {
				return service.CanvasNodeOutput{}, fmt.Errorf("creation task not found")
			}
			task = next
		}
	}
}

func (a *App) canvasUploadedImages(identity service.Identity, node service.CanvasNode, inputs []service.CanvasNodeInput) ([]protocol.UploadedImage, error) {
	return a.canvasUploadedImagesFromRefs(identity, canvasImageRefs(node, inputs))
}

func canvasImageRefs(node service.CanvasNode, inputs []service.CanvasNodeInput) []service.CanvasImageRef {
	var refs []service.CanvasImageRef
	for _, ref := range canvasImageNodeOutput(node).Images {
		refs = append(refs, ref)
	}
	for _, input := range inputs {
		refs = append(refs, input.Output.Images...)
	}
	return refs
}

func (a *App) canvasUploadedImagesFromRefs(identity service.Identity, refs []service.CanvasImageRef) ([]protocol.UploadedImage, error) {
	images := make([]protocol.UploadedImage, 0, len(refs))
	for index, ref := range refs {
		value := firstNonEmpty(ref.Path, ref.LocalURL, ref.URL)
		if value == "" {
			continue
		}
		data, contentType, err := a.imageBytesForIdentity(value, identity)
		if err != nil {
			return nil, fmt.Errorf("读取上游图片失败：%w", err)
		}
		images = append(images, protocol.UploadedImage{
			Data:        data,
			Filename:    firstNonEmpty(ref.Name, fmt.Sprintf("canvas-image-%d.png", index+1)),
			ContentType: firstNonEmpty(contentType, "image/png"),
		})
	}
	return images, nil
}

func (a *App) canvasMaskDataURL(identity service.Identity, ref service.CanvasImageRef) (string, error) {
	value := firstNonEmpty(ref.Path, ref.LocalURL, ref.URL)
	if value == "" {
		return "", nil
	}
	data, contentType, err := a.imageBytesForIdentity(value, identity)
	if err != nil {
		return "", fmt.Errorf("读取蒙版图片失败：%w", err)
	}
	return "data:" + firstNonEmpty(contentType, "image/png") + ";base64," + base64.StdEncoding.EncodeToString(data), nil
}

func splitCanvasMaskRefs(refs []service.CanvasImageRef) ([]service.CanvasImageRef, []service.CanvasImageRef) {
	var images []service.CanvasImageRef
	var masks []service.CanvasImageRef
	for _, ref := range refs {
		if isCanvasMaskRef(ref) {
			masks = append(masks, ref)
			continue
		}
		images = append(images, ref)
	}
	return images, masks
}

func isCanvasMaskRef(ref service.CanvasImageRef) bool {
	role := strings.ToLower(strings.TrimSpace(ref.Role))
	name := strings.ToLower(strings.TrimSpace(ref.Name))
	return role == "mask" || strings.HasSuffix(name, "_mask.png") || strings.HasSuffix(name, "-mask.png")
}

func (a *App) canvasModelCatalog(ctx context.Context, identity service.Identity) []canvasModelOption {
	if a != nil && a.config != nil && a.config.LuoyeIndependentMode() {
		var out []canvasModelOption
		seen := map[string]struct{}{}
		for _, mode := range []string{"chat", "generate", "video"} {
			binding, ok := a.sub2APIBindingForMode(ctx, identity, mode)
			if !ok || binding.GroupID == "" {
				continue
			}
			items, ok := a.sub2APIModelOptionsForBinding(ctx, binding, mode)
			if !ok {
				continue
			}
			groupMode := canvasModelGroupMode(mode)
			for _, item := range items {
				if !canvasModelAllowedForGroupMode(item, groupMode) {
					continue
				}
				item = canvasModelOptionForGroupMode(item, groupMode)
				key := groupMode + "\x00" + item.ID
				if _, ok := seen[key]; ok {
					continue
				}
				seen[key] = struct{}{}
				out = append(out, item)
			}
		}
		if len(out) > 0 {
			sortCanvasModelOptions(out)
			return out
		}
	}
	if binding, ok := a.sub2APIBindingForIdentity(identity); ok {
		if items, ok := a.sub2APIModelOptionsForBinding(ctx, binding, "generate"); ok {
			return items
		}
	}
	result, err := a.engine.ListModels(ctx)
	if err != nil {
		result = map[string]any{"data": []map[string]any{}}
	}
	return canvasModelOptionsFromModelList(result, true, false)
}

func (a *App) sub2APIModelOptionsForBinding(ctx context.Context, binding service.Sub2APIBinding, mode string) ([]canvasModelOption, bool) {
	if result, err := a.getSub2APIModelCatalog(ctx, binding); err == nil {
		items := canvasModelOptionsFromCatalog(result)
		if supplemental, ok := a.sub2APIConcreteModelOptionsForBinding(ctx, binding); ok {
			items = mergeCanvasModelOptions(items, supplemental)
		}
		if mode == "generate" || mode == "edit" {
			items = addBuiltInCanvasImageModels(items)
		}
		return items, true
	}
	if result, err := a.getSub2APIModels(ctx, binding); err == nil {
		allowVideo := mode == "video"
		items := canvasModelOptionsFromModelList(result, false, allowVideo)
		if mode == "generate" || mode == "edit" {
			items = addBuiltInCanvasImageModels(items)
		}
		return items, true
	}
	return nil, false
}

func (a *App) sub2APIConcreteModelOptionsForBinding(ctx context.Context, binding service.Sub2APIBinding) ([]canvasModelOption, bool) {
	if binding.GroupID == "" {
		return nil, false
	}
	result, err := a.getSub2APIModels(ctx, binding)
	if err != nil {
		return nil, false
	}
	return canvasModelOptionsFromModelList(result, false, true), true
}

func mergeCanvasModelOptions(primary []canvasModelOption, supplemental []canvasModelOption) []canvasModelOption {
	seen := make(map[string]canvasModelOption, len(primary)+len(supplemental))
	for _, item := range primary {
		if item.ID == "" || shouldHideCanvasModel(item.ID) {
			continue
		}
		seen[item.ID] = item
	}
	for _, item := range supplemental {
		if item.ID == "" || shouldHideCanvasModel(item.ID) {
			continue
		}
		if _, ok := seen[item.ID]; ok {
			continue
		}
		seen[item.ID] = item
	}
	return sortedCanvasModelOptions(seen)
}

func canvasModelGroupMode(mode string) string {
	switch strings.TrimSpace(mode) {
	case "chat":
		return "chat"
	case "video":
		return "video"
	default:
		return "image"
	}
}

func canvasModelOptionForGroupMode(item canvasModelOption, groupMode string) canvasModelOption {
	groupMode = canvasModelGroupMode(groupMode)
	item.GroupModes = []string{groupMode}
	item.Capabilities = []string{groupMode}
	item.Kind = canvasModelKindFromCapabilities(item.Capabilities)
	return item
}

func canvasModelAllowedForGroupMode(item canvasModelOption, groupMode string) bool {
	if item.ID == "" || shouldHideCanvasModel(item.ID) || item.Enabled == false {
		return false
	}
	groupMode = canvasModelGroupMode(groupMode)
	switch groupMode {
	case "chat":
		return (canvasModelHasCapability(item.Capabilities, "chat") || canvasModelLooksTextOnly(item.ID)) &&
			!canvasModelHasCapability(item.Capabilities, "video") &&
			!canvasModelLooksLikeImage(item.ID) &&
			!canvasModelLooksLikeVideo(item.ID)
	case "video":
		return canvasModelHasCapability(item.Capabilities, "video")
	default:
		return (canvasModelHasCapability(item.Capabilities, "image") || canvasModelLooksLikeImage(item.ID)) &&
			!canvasModelHasCapability(item.Capabilities, "video") &&
			!canvasModelLooksTextOnly(item.ID) &&
			!canvasModelLooksLikeVideo(item.ID)
	}
}

func (a *App) getSub2APIModelCatalog(ctx context.Context, binding service.Sub2APIBinding) (map[string]any, error) {
	return a.doSub2APIRequest(ctx, binding, http.MethodGet, "model-catalog", "", nil)
}

func (a *App) getSub2APIModels(ctx context.Context, binding service.Sub2APIBinding) (map[string]any, error) {
	return a.doSub2APIRequest(ctx, binding, http.MethodGet, "models", "", nil)
}

func canvasModelOptionsFromCatalog(result map[string]any) []canvasModelOption {
	seen := map[string]canvasModelOption{}
	for _, item := range util.AsMapSlice(result["items"]) {
		id := util.Clean(item["id"])
		if id == "" || shouldHideCanvasModel(id) {
			continue
		}
		capabilities := canvasModelCapabilities(item["capabilities"], id)
		seen[id] = canvasModelOption{
			ID:           id,
			Name:         firstNonEmpty(util.Clean(item["name"]), util.Clean(item["display_name"]), id),
			Kind:         canvasModelKindFromCapabilities(capabilities),
			Capabilities: capabilities,
			Enabled:      canvasModelEnabled(item["enabled"]),
		}
	}
	return sortedCanvasModelOptions(seen)
}

func addBuiltInCanvasImageModels(items []canvasModelOption) []canvasModelOption {
	seen := make(map[string]canvasModelOption, len(items)+6)
	for _, item := range items {
		if item.ID == "" || shouldHideCanvasModel(item.ID) {
			continue
		}
		seen[item.ID] = item
	}
	for _, id := range []string{
		util.ImageModelGPT,
		util.ImageModelGPTOfficial,
		util.ImageModelGeminiProPreview,
		util.ImageModelGeminiProPreviewOfficial,
		util.ImageModelGeminiFlashPreview,
		util.ImageModelGeminiFlashPreviewOfficial,
		util.ImageModelMidjourney,
		util.ImageModelGrokImagine,
	} {
		if _, ok := seen[id]; !ok {
			seen[id] = newCanvasModelOption(id, canvasModelDisplayName(id), false)
		}
	}
	return sortedCanvasModelOptions(seen)
}

func canvasModelOptionsFromModelList(result map[string]any, includeLocal bool, allowVideo bool) []canvasModelOption {
	seen := map[string]canvasModelOption{}
	for _, item := range util.AsMapSlice(result["data"]) {
		if id := util.Clean(item["id"]); id != "" && !shouldHideCanvasModel(id) {
			seen[id] = newCanvasModelOption(id, firstNonEmpty(util.Clean(item["display_name"]), util.Clean(item["name"]), id), allowVideo)
		}
	}
	if includeLocal {
		for _, id := range util.ModelList() {
			if shouldHideCanvasModel(id) {
				continue
			}
			if _, ok := seen[id]; !ok {
				seen[id] = newCanvasModelOption(id, canvasModelDisplayName(id), allowVideo)
			}
		}
	}
	return sortedCanvasModelOptions(seen)
}

func shouldHideCanvasModel(id string) bool {
	return strings.TrimSpace(id) == util.ImageModelCodex
}

func sortedCanvasModelOptions(seen map[string]canvasModelOption) []canvasModelOption {
	items := make([]canvasModelOption, 0, len(seen))
	for _, item := range seen {
		items = append(items, item)
	}
	sortCanvasModelOptions(items)
	return items
}

func readCanvasBody(r *http.Request) (service.CanvasDocument, error) {
	var canvas service.CanvasDocument
	body, err := readJSONMap(r)
	if err != nil {
		return canvas, fmt.Errorf("invalid json body")
	}
	if item := util.StringMap(body["item"]); len(item) > 0 {
		body = item
	}
	raw, _ := json.Marshal(body)
	if err := json.Unmarshal(raw, &canvas); err != nil {
		return canvas, fmt.Errorf("invalid canvas payload")
	}
	return canvas, nil
}

func canvasPrompt(node service.CanvasNode, inputs []service.CanvasNodeInput) string {
	var parts []string
	if prompt := firstNonEmpty(util.Clean(node.Data["prompt"]), util.Clean(node.Data["text"])); prompt != "" {
		parts = append(parts, prompt)
	}
	for _, input := range inputs {
		if text := util.Clean(input.Output.Text); text != "" {
			parts = append(parts, text)
		}
	}
	return strings.TrimSpace(strings.Join(parts, "\n"))
}

func canvasImageNodeOutput(node service.CanvasNode) service.CanvasNodeOutput {
	var refs []service.CanvasImageRef
	appendRef := func(ref service.CanvasImageRef) {
		if ref.URL == "" && ref.LocalURL == "" && ref.Path == "" {
			return
		}
		refs = append(refs, ref)
	}
	appendRef(service.CanvasImageRef{
		URL:      firstNonEmpty(util.Clean(node.Data["url"]), util.Clean(node.Data["image_url"])),
		LocalURL: util.Clean(node.Data["local_url"]),
		Path:     firstNonEmpty(util.Clean(node.Data["path"]), util.Clean(node.Data["image_path"])),
		Name:     util.Clean(node.Data["name"]),
		Role:     util.Clean(node.Data["role"]),
	})
	for _, key := range []string{"source_images", "images"} {
		for _, item := range util.AsMapSlice(node.Data[key]) {
			appendRef(service.CanvasImageRef{
				URL:          util.Clean(item["url"]),
				LocalURL:     util.Clean(item["local_url"]),
				Path:         util.Clean(item["path"]),
				Name:         util.Clean(item["name"]),
				ThumbnailURL: util.Clean(item["thumbnail_url"]),
				Role:         util.Clean(item["role"]),
			})
		}
	}
	return service.CanvasNodeOutput{Images: refs}
}

func canvasResultNodeOutput(inputs []service.CanvasNodeInput) service.CanvasNodeOutput {
	var out service.CanvasNodeOutput
	for _, input := range inputs {
		if input.Output.Text != "" {
			if out.Text == "" {
				out.Text = input.Output.Text
			} else {
				out.Text += "\n" + input.Output.Text
			}
		}
		out.Images = append(out.Images, input.Output.Images...)
		out.Videos = append(out.Videos, input.Output.Videos...)
	}
	return out
}

func canvasOutputFromTask(task map[string]any) service.CanvasNodeOutput {
	out := service.CanvasNodeOutput{TaskID: util.Clean(task["id"]), Raw: util.CopyMap(task)}
	mode := util.Clean(task["mode"])
	for _, item := range util.AsMapSlice(task["data"]) {
		if text := util.Clean(item["text_response"]); text != "" {
			if out.Text == "" {
				out.Text = text
			} else {
				out.Text += "\n" + text
			}
		}
		if ref := canvasVideoRefFromTaskItem(item, mode); ref.URL != "" || ref.LocalURL != "" {
			out.Videos = append(out.Videos, ref)
			continue
		}
		ref := service.CanvasImageRef{
			URL:          util.Clean(item["url"]),
			LocalURL:     firstNonEmpty(util.Clean(item["local_url"]), util.Clean(item["url"])),
			Path:         util.Clean(item["path"]),
			Name:         util.Clean(item["name"]),
			ThumbnailURL: util.Clean(item["thumbnail_url"]),
		}
		if ref.URL != "" || ref.LocalURL != "" || ref.Path != "" {
			out.Images = append(out.Images, ref)
		}
	}
	return out
}

func canvasVideoRefFromTaskItem(item map[string]any, mode string) service.CanvasVideoRef {
	videoURL := firstNonEmpty(util.Clean(item["video_url"]), util.Clean(item["url"]))
	localURL := firstNonEmpty(util.Clean(item["local_url"]), videoURL)
	if mode != "video" && util.Clean(item["video_url"]) == "" {
		return service.CanvasVideoRef{}
	}
	return service.CanvasVideoRef{
		URL:      videoURL,
		LocalURL: localURL,
		Name:     util.Clean(item["name"]),
	}
}

func canvasTaskID(runID, nodeID string) string {
	return "canvas-" + util.SHA1Short(runID+":"+nodeID, 24)
}

func canvasNodeModel(node service.CanvasNode, fallback string) string {
	return firstNonEmpty(util.Clean(node.Data["model"]), fallback)
}

func canvasNodeVisibility(node service.CanvasNode) string {
	return firstNonEmpty(util.Clean(node.Data["visibility"]), service.ImageVisibilityPrivate)
}

func canvasImageTaskMetadata(node service.CanvasNode) map[string]any {
	body := map[string]any{}
	for _, key := range []string{"image_resolution", "size", "share_prompt_parameters", "share_reference_images"} {
		if value := node.Data[key]; value != nil {
			body[key] = value
		}
	}
	return imageTaskRequestMetadata(body)
}

func canvasImageOutputOptions(node service.CanvasNode) service.ImageOutputOptions {
	return imageOutputOptionsFromBody(node.Data)
}

func canvasImageToolOptions(node service.CanvasNode) service.ImageToolOptions {
	return imageToolOptionsFromBody(node.Data)
}

func (a *App) configuredBaseURL() string {
	if a == nil || a.config == nil {
		return ""
	}
	return strings.TrimRight(a.config.BaseURL(), "/")
}

func sortCanvasModelOptions(items []canvasModelOption) {
	order := map[string]int{}
	for index, id := range util.ModelList() {
		order[id] = index
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].Kind != items[j].Kind {
			return items[i].Kind < items[j].Kind
		}
		left, lok := order[items[i].ID]
		right, rok := order[items[j].ID]
		if lok && rok {
			return left < right
		}
		if lok != rok {
			return lok
		}
		return items[i].ID < items[j].ID
	})
}

func canvasModelKind(id string) string {
	return canvasModelKindFromCapabilities(canvasModelCapabilities(nil, id))
}

func newCanvasModelOption(id string, name string, allowVideo bool) canvasModelOption {
	capabilities := canvasModelCapabilitiesForModelList(id, allowVideo)
	return canvasModelOption{
		ID:           id,
		Name:         firstNonEmpty(name, id),
		Kind:         canvasModelKindFromCapabilities(capabilities),
		Capabilities: capabilities,
		Enabled:      true,
	}
}

func canvasModelCapabilitiesForModelList(id string, allowVideo bool) []string {
	if allowVideo {
		return canvasModelCapabilities(nil, id)
	}
	switch id {
	case util.ImageModelAuto:
		return []string{"chat", "image"}
	case util.ImageModelGPT,
		util.ImageModelGPTOfficial,
		util.ImageModelCodex,
		util.ImageModelGeminiProPreview,
		util.ImageModelGeminiProPreviewOfficial,
		util.ImageModelGeminiFlashPreview,
		util.ImageModelGeminiFlashPreviewOfficial,
		util.ImageModelMidjourney,
		util.ImageModelGrokImagine:
		return []string{"image"}
	default:
		if canvasModelLooksLikeImage(id) {
			return []string{"image"}
		}
		return []string{"chat"}
	}
}

func canvasModelDisplayName(id string) string {
	return strings.TrimSpace(id)
}

func canvasModelOptionHasCapability(item canvasModelOption, capability string) bool {
	for _, itemCapability := range item.Capabilities {
		if itemCapability == capability {
			return true
		}
	}
	if capability == "chat" {
		return item.Kind == "text" || item.Kind == "both"
	}
	if capability == "image" {
		return item.Kind == "image" || item.Kind == "both"
	}
	if capability == "video" {
		return item.Kind == "video"
	}
	return false
}

func canvasModelCapabilities(value any, id string) []string {
	seen := map[string]struct{}{}
	var capabilities []string
	for _, capability := range util.AsStringSlice(value) {
		normalized := normalizeCanvasModelCapability(capability)
		if normalized == "" {
			continue
		}
		if _, ok := seen[normalized]; ok {
			continue
		}
		seen[normalized] = struct{}{}
		capabilities = append(capabilities, normalized)
	}
	if len(capabilities) > 0 {
		return capabilities
	}
	switch id {
	case util.ImageModelAuto:
		return []string{"chat", "image"}
	case util.ImageModelGPT,
		util.ImageModelGPTOfficial,
		util.ImageModelCodex,
		util.ImageModelGeminiProPreview,
		util.ImageModelGeminiProPreviewOfficial,
		util.ImageModelGeminiFlashPreview,
		util.ImageModelGeminiFlashPreviewOfficial,
		util.ImageModelMidjourney,
		util.ImageModelGrokImagine:
		return []string{"image"}
	default:
		if canvasModelLooksLikeVideo(id) {
			return []string{"video"}
		}
		if canvasModelLooksLikeImage(id) {
			return []string{"image"}
		}
		return []string{"chat"}
	}
}

func normalizeCanvasModelCapability(capability string) string {
	switch strings.ToLower(strings.TrimSpace(capability)) {
	case "text", "llm", "chat":
		return "chat"
	case "image", "images":
		return "image"
	case "video", "videos":
		return "video"
	default:
		return ""
	}
}

func canvasModelKindFromCapabilities(capabilities []string) string {
	hasChat := canvasModelHasCapability(capabilities, "chat")
	hasImage := canvasModelHasCapability(capabilities, "image")
	switch {
	case hasChat && hasImage:
		return "both"
	case hasImage:
		return "image"
	case canvasModelHasCapability(capabilities, "video"):
		return "video"
	default:
		return "text"
	}
}

func canvasModelHasCapability(capabilities []string, capability string) bool {
	for _, item := range capabilities {
		if item == capability {
			return true
		}
	}
	return false
}

func canvasModelEnabled(value any) bool {
	if value == nil {
		return true
	}
	return util.ToBool(value)
}

func canvasModelLooksLikeImage(id string) bool {
	lower := strings.ToLower(strings.TrimSpace(id))
	for _, hint := range []string{"image", "imagen", "flux", "stable-diffusion", "sdxl", "dall-e", "midjourney", "kolors", "ideogram", "recraft"} {
		if strings.Contains(lower, hint) {
			return true
		}
	}
	return false
}

func canvasModelLooksTextOnly(id string) bool {
	lower := strings.ToLower(strings.TrimSpace(id))
	if lower == "" || canvasModelLooksLikeImage(lower) {
		return false
	}
	for _, hint := range []string{
		"gpt-",
		"chatgpt-",
		"o1",
		"o3",
		"o4",
		"claude",
		"gemini-",
		"glm",
		"deepseek",
		"qwen",
		"moonshot",
		"kimi",
		"yi-",
		"doubao",
		"ernie",
		"hunyuan",
		"llama",
		"mistral",
		"mixtral",
		"command-",
		"baichuan",
		"internlm",
	} {
		if lower == hint || strings.HasPrefix(lower, hint) {
			return true
		}
	}
	return false
}

func canvasModelLooksLikeVideo(id string) bool {
	lower := strings.ToLower(strings.TrimSpace(id))
	for _, hint := range []string{"video", "text-to-video", "image-to-video", "t2v", "i2v", "sora", "veo", "kling", "hailuo", "runway", "luma", "seedance", "wan2", "wanx"} {
		if strings.Contains(lower, hint) {
			return true
		}
	}
	return false
}
