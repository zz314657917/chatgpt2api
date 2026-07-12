package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"strings"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

func (a *App) handlePromptSplitTasks(w http.ResponseWriter, r *http.Request, identity service.Identity) {
	if a == nil || a.promptSplits == nil {
		util.WriteError(w, http.StatusServiceUnavailable, "prompt split service is unavailable")
		return
	}
	parts := splitPath(r.URL.Path)
	switch {
	case len(parts) == 3 && r.Method == http.MethodPost:
		a.createPromptSplitTask(w, r, identity)
	case len(parts) == 4 && r.Method == http.MethodGet:
		batch, err := a.promptSplits.Get(identity, parts[3])
		if err != nil {
			writePromptSplitError(w, err)
			return
		}
		util.WriteJSON(w, http.StatusOK, batch)
	case len(parts) == 5 && parts[4] == "cancel" && r.Method == http.MethodPost:
		batch, err := a.promptSplits.Cancel(identity, parts[3])
		if err != nil {
			writePromptSplitError(w, err)
			return
		}
		util.WriteJSON(w, http.StatusOK, batch)
	case len(parts) == 3 || len(parts) == 4 || (len(parts) == 5 && parts[4] == "cancel"):
		w.WriteHeader(http.StatusMethodNotAllowed)
	default:
		http.NotFound(w, r)
	}
}

func writePromptSplitError(w http.ResponseWriter, err error) {
	status := http.StatusInternalServerError
	if errors.Is(err, service.ErrPromptSplitNotFound) {
		status = http.StatusNotFound
	}
	util.WriteError(w, status, err.Error())
}

func (a *App) createPromptSplitTask(w http.ResponseWriter, r *http.Request, identity service.Identity) {
	body, err := readJSONMap(r)
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	if !a.attachCreationTaskSpace(w, identity, body) {
		return
	}
	request, err := promptSplitCreateRequestFromBody(body, a.resolveImageBaseURL(r))
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	batch, err := a.promptSplits.Create(r.Context(), identity, request)
	if err != nil {
		writeCreationTaskSubmitError(w, err)
		return
	}
	util.WriteJSON(w, http.StatusOK, batch)
}

func promptSplitCreateRequestFromBody(body map[string]any, baseURL string) (service.PromptSplitCreateRequest, error) {
	count, err := promptSplitCount(body["split_count"])
	if err != nil {
		return service.PromptSplitCreateRequest{}, err
	}
	executionMode := strings.ToLower(strings.TrimSpace(util.Clean(body["execution_mode"])))
	request := service.PromptSplitCreateRequest{
		ClientTaskID:  util.Clean(body["client_task_id"]),
		Prompt:        util.Clean(body["prompt"]),
		Model:         util.Clean(body["model"]),
		SplitCount:    count,
		ExecutionMode: executionMode,
		TaskMetadata:  promptSplitTaskMetadataFromBody(body),
	}
	if executionMode != service.PromptSplitExecutionModeDirect {
		return request, nil
	}
	imageRequest, err := promptSplitImageRequestFromBody(body["image_request"], body, baseURL)
	if err != nil {
		return service.PromptSplitCreateRequest{}, err
	}
	request.ImageRequest = imageRequest
	return request, nil
}

func promptSplitCount(value any) (int, error) {
	var count int
	switch typed := value.(type) {
	case int:
		count = typed
	case int64:
		count = int(typed)
	case float64:
		if math.Trunc(typed) != typed {
			return 0, fmt.Errorf("split_count must be an integer between 1 and 10")
		}
		count = int(typed)
	case json.Number:
		parsed, err := strconv.Atoi(strings.TrimSpace(typed.String()))
		if err != nil {
			return 0, fmt.Errorf("split_count must be an integer between 1 and 10")
		}
		count = parsed
	case string:
		parsed, err := strconv.Atoi(strings.TrimSpace(typed))
		if err != nil {
			return 0, fmt.Errorf("split_count must be an integer between 1 and 10")
		}
		count = parsed
	default:
		return 0, fmt.Errorf("split_count must be an integer between 1 and 10")
	}
	if count < 1 || count > 10 {
		return 0, fmt.Errorf("split_count must be between 1 and 10")
	}
	return count, nil
}

func promptSplitImageRequestFromBody(raw any, root map[string]any, baseURL string) (*service.PromptSplitImageRequest, error) {
	if raw == nil {
		return nil, fmt.Errorf("direct mode requires image_request")
	}
	input := util.StringMap(raw)
	if len(input) == 0 {
		return nil, fmt.Errorf("image_request must be an object")
	}
	if key := promptSplitUnsupportedImageInput(input); key != "" {
		return nil, fmt.Errorf("direct mode only supports text-to-image templates; %s is not supported", key)
	}
	body := map[string]any{}
	for _, key := range []string{
		"model",
		"size",
		"quality",
		"visibility",
		"image_resolution",
		"output_format",
		"output_compression",
		"professional_mode",
		"pro_studio",
		"official_settings",
		"midjourney_settings",
		"background",
		"moderation",
		"style",
		"partial_images",
		"official_fallback",
		"share_prompt_parameters",
		"share_reference_images",
		"frontend_conversation_id",
		"web_search",
		"web_search_query",
	} {
		if value, ok := input[key]; ok {
			body[key] = value
		}
	}
	if service.IsProStudioRequest(input) {
		if value, ok := input["resolution"]; ok {
			body["resolution"] = value
		}
	}
	for _, key := range []string{"team_id", "payer_user_id", "actor_user_id", "actor_name"} {
		if value := util.Clean(root[key]); value != "" {
			body[key] = value
		}
	}
	service.NormalizeProStudioRequest(body)
	if err := service.ValidateProStudioRequest(body); err != nil {
		return nil, err
	}
	model := firstNonEmpty(util.Clean(body["model"]), util.ImageModelAuto)
	output := imageOutputOptionsFromBody(body)
	tools := imageGenerationToolOptionsFromBody(model, 1, body)
	return &service.PromptSplitImageRequest{
		Model:                  model,
		Size:                   util.Clean(body["size"]),
		Quality:                util.Clean(body["quality"]),
		BaseURL:                baseURL,
		Visibility:             util.Clean(body["visibility"]),
		Metadata:               imageTaskRequestMetadata(body),
		OutputFormat:           output.Format,
		OutputCompression:      output.Compression,
		Background:             tools.Background,
		Moderation:             tools.Moderation,
		Style:                  tools.Style,
		PartialImages:          tools.PartialImages,
		OfficialFallback:       tools.OfficialFallback,
		ProfessionalMode:       service.IsProStudioRequest(body),
		ImageResolution:        util.Clean(body["image_resolution"]),
		SharePromptParameters:  util.ToBool(body["share_prompt_parameters"]),
		ShareReferenceImages:   util.ToBool(body["share_reference_images"]),
		FrontendConversationID: util.Clean(body["frontend_conversation_id"]),
		MidjourneySettings:     normalizeMidjourneySettings(body["midjourney_settings"]),
		OfficialSettings:       util.CopyMap(util.StringMap(body["official_settings"])),
		ProStudio:              util.CopyMap(util.StringMap(body["pro_studio"])),
	}, nil
}

func promptSplitUnsupportedImageInput(body map[string]any) string {
	for _, key := range []string{
		"images",
		"image",
		"input_image",
		"input_images",
		"source_images",
		"image_paths",
		"image_url",
		"image_urls",
		"official_public_image_urls",
		"reference_image",
		"reference_images",
		"reference_image_ids",
		"reference_urls",
		"fallback_reference_image",
		"initial_image",
		"init_image",
		"input_image_mask",
		"mask_url",
		"mask",
		"video",
		"videos",
		"video_url",
		"duration",
		"aspect_ratio",
		"generate_audio",
		"enhance_prompt",
	} {
		if value, ok := body[key]; ok && promptSplitHasValue(value) {
			return key
		}
	}
	if value, ok := body["resolution"]; ok && promptSplitHasValue(value) && !service.IsProStudioRequest(body) {
		return "resolution"
	}
	for _, key := range []string{"mode", "task_type", "generation_type"} {
		if value := strings.ToLower(strings.TrimSpace(util.Clean(body[key]))); value != "" && value != "generate" && value != "image" {
			return key
		}
	}
	return ""
}

func promptSplitHasValue(value any) bool {
	switch typed := value.(type) {
	case nil:
		return false
	case string:
		return strings.TrimSpace(typed) != ""
	case []any:
		return len(typed) > 0
	case []string:
		return len(typed) > 0
	case map[string]any:
		return len(typed) > 0
	default:
		return true
	}
}

func promptSplitTaskMetadataFromBody(body map[string]any) map[string]any {
	metadata := map[string]any{}
	for _, key := range []string{"team_id", "payer_user_id", "actor_user_id", "actor_name"} {
		if value := util.Clean(body[key]); value != "" {
			metadata[key] = value
		}
	}
	return metadata
}
