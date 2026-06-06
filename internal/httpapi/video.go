package httpapi

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"chatgpt2api/internal/protocol"
	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

const (
	videoTaskPollInitialDelay = 800 * time.Millisecond
	videoTaskPollInterval     = 3 * time.Second
)

type sub2APIVideoModelSpec struct {
	ratioField                    string
	durationMin                   int
	durationMax                   int
	durationFixed                 int
	allowedDurations              []int
	allowedRatios                 []string
	defaultRatio                  string
	allowedResolutions            []string
	defaultMode                   string
	modeFromResolution            map[string]string
	audioField                    string
	audioRequiresMode             string
	audioConflictsWithMultiImages bool
	promptEnhanceField            string
	maxImages                     int
}

func (a *App) runLoggedSub2APIVideoTask(ctx context.Context, identity service.Identity, payload map[string]any, binding service.Sub2APIBinding) (map[string]any, error) {
	return a.runLoggedMediaTask(ctx, identity, payload, "/api/creation-tasks/video-generations", "视频生成", func(ctx context.Context, payload map[string]any) (map[string]any, error) {
		return a.callSub2APIVideoGeneration(ctx, payload, binding)
	})
}

func (a *App) runLoggedMediaTask(ctx context.Context, identity service.Identity, payload map[string]any, endpoint, summary string, run func(context.Context, map[string]any) (map[string]any, error)) (map[string]any, error) {
	start := time.Now()
	requestCapture := payloadAuditCapture(payload)
	payload["owner_id"] = identityScope(identity)
	payload["owner_name"] = identityDisplayName(identity)
	model := firstNonEmpty(util.Clean(payload["model"]), util.ImageModelAuto)
	result, err := run(ctx, payload)
	urls := collectURLs(result)
	if err != nil {
		a.logCall(ctx, identity, summary, http.MethodPost, endpoint, model, start, "failed", protocolErrorHTTPStatus(err), err.Error(), urls, requestCapture)
		return result, err
	}
	if len(util.AsMapSlice(result["data"])) == 0 {
		message := firstNonEmpty(util.Clean(result["message"]), "media task returned no output data")
		a.logCall(ctx, identity, summary, http.MethodPost, endpoint, model, start, "failed", http.StatusBadGateway, message, urls, requestCapture)
		return result, nil
	}
	a.logCall(ctx, identity, summary, http.MethodPost, endpoint, model, start, "success", http.StatusOK, "", urls, requestCapture)
	return result, nil
}

func (a *App) callSub2APIVideoGeneration(ctx context.Context, payload map[string]any, binding service.Sub2APIBinding) (map[string]any, error) {
	body := sub2APIVideoPayload(payload)
	result, err := a.postSub2APIJSON(ctx, binding, "videos/generations", body)
	if err != nil {
		return result, err
	}
	return a.formatSub2APIVideoResult(ctx, result, binding)
}

func sub2APIVideoPayload(payload map[string]any) map[string]any {
	model := firstNonEmpty(util.Clean(payload["model"]), util.ImageModelAuto)
	spec := sub2APIVideoSpec(model)
	imageURLs := sub2APIVideoImageURLs(payload, spec)
	mode := normalizedVideoMode(payload["resolution"], spec)
	if spec.audioConflictsWithMultiImages && len(imageURLs) > 1 && mode == "std" {
		mode = "pro"
	}
	body := map[string]any{
		"prompt":   util.Clean(payload["prompt"]),
		"model":    model,
		"duration": normalizedVideoDuration(payload["duration"], spec),
	}
	body[spec.ratioField] = normalizedVideoRatio(payload["aspect_ratio"], spec)
	if resolution := normalizedVideoResolution(payload["resolution"], spec); resolution != "" {
		body["resolution"] = resolution
	}
	if mode != "" {
		body["mode"] = mode
	}
	if spec.promptEnhanceField != "" {
		body[spec.promptEnhanceField] = util.ToBool(payload["enhance_prompt"])
	}
	if spec.audioField != "" && util.ToBool(payload["generate_audio"]) && (spec.audioRequiresMode == "" || mode == spec.audioRequiresMode) && (!spec.audioConflictsWithMultiImages || len(imageURLs) <= 1) {
		body[spec.audioField] = true
	}
	if len(imageURLs) > 0 {
		body["image_urls"] = imageURLs
	}
	return body
}

func sub2APIVideoSpec(model string) sub2APIVideoModelSpec {
	switch strings.ToLower(strings.TrimSpace(model)) {
	case "kling-v3-omni":
		return sub2APIVideoModelSpec{ratioField: "aspect_ratio", durationMin: 3, durationMax: 15, allowedRatios: []string{"16:9", "9:16", "1:1"}, defaultRatio: "16:9", defaultMode: "std", modeFromResolution: map[string]string{"720p": "std", "1080p": "pro", "4k": "4k"}, audioField: "audio"}
	case "kling-v2-6":
		return sub2APIVideoModelSpec{ratioField: "aspect_ratio", allowedDurations: []int{5, 10}, allowedRatios: []string{"16:9", "9:16", "1:1"}, defaultRatio: "16:9", defaultMode: "std", modeFromResolution: map[string]string{"720p": "std", "1080p": "pro"}, audioField: "audio", audioRequiresMode: "pro", audioConflictsWithMultiImages: true, maxImages: 2}
	case "wan2.7":
		return sub2APIVideoModelSpec{ratioField: "size", durationMin: 2, durationMax: 15, allowedRatios: []string{"16:9", "9:16", "1:1", "4:3", "3:4"}, defaultRatio: "16:9", allowedResolutions: []string{"720P", "1080P"}, promptEnhanceField: "prompt_extend"}
	case "veo3.1-fast":
		return sub2APIVideoModelSpec{ratioField: "aspect_ratio", durationFixed: 8, allowedRatios: []string{"16:9", "9:16"}, defaultRatio: "16:9", allowedResolutions: []string{"720p", "1080p", "4k"}, maxImages: 3}
	case "doubao-seedance-2.0":
		return sub2APIVideoModelSpec{ratioField: "size", durationMin: 5, durationMax: 15, allowedRatios: []string{"16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive"}, defaultRatio: "16:9", allowedResolutions: []string{"480p", "720p", "1080p"}, audioField: "generate_audio"}
	case "doubao-seedance-2.0-fast":
		return sub2APIVideoModelSpec{ratioField: "size", durationMin: 5, durationMax: 15, allowedRatios: []string{"16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive"}, defaultRatio: "16:9", allowedResolutions: []string{"480p", "720p"}, audioField: "generate_audio"}
	default:
		return sub2APIVideoModelSpec{ratioField: "size", durationMin: 5, durationMax: 15, allowedRatios: []string{"16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive"}, defaultRatio: "16:9", allowedResolutions: []string{"480p", "720p", "1080p"}, audioField: "generate_audio"}
	}
}

func normalizedVideoDuration(value any, spec sub2APIVideoModelSpec) int {
	if spec.durationFixed > 0 {
		return spec.durationFixed
	}
	if len(spec.allowedDurations) > 0 {
		duration := util.ToInt(value, spec.allowedDurations[0])
		for _, allowed := range spec.allowedDurations {
			if duration <= allowed {
				return allowed
			}
		}
		return spec.allowedDurations[len(spec.allowedDurations)-1]
	}
	minDuration := spec.durationMin
	if minDuration <= 0 {
		minDuration = 5
	}
	maxDuration := spec.durationMax
	if maxDuration <= 0 {
		maxDuration = minDuration
	}
	duration := util.ToInt(value, 5)
	if duration < minDuration {
		return minDuration
	}
	if duration > maxDuration {
		return maxDuration
	}
	return duration
}

func normalizedVideoRatio(value any, spec sub2APIVideoModelSpec) string {
	ratio := strings.ToLower(strings.TrimSpace(util.Clean(value)))
	if ratio == "" {
		return firstNonEmpty(spec.defaultRatio, "16:9")
	}
	for _, allowed := range spec.allowedRatios {
		if ratio == strings.ToLower(strings.TrimSpace(allowed)) {
			return allowed
		}
	}
	return firstNonEmpty(spec.defaultRatio, "16:9")
}

func normalizedVideoResolution(value any, spec sub2APIVideoModelSpec) string {
	resolution := strings.ToLower(strings.TrimSpace(util.Clean(value)))
	if resolution == "" {
		return ""
	}
	for _, allowed := range spec.allowedResolutions {
		if resolution == strings.ToLower(strings.TrimSpace(allowed)) {
			return allowed
		}
	}
	return ""
}

func normalizedVideoMode(value any, spec sub2APIVideoModelSpec) string {
	if len(spec.modeFromResolution) == 0 {
		return spec.defaultMode
	}
	resolution := strings.ToLower(strings.TrimSpace(util.Clean(value)))
	if mode := spec.modeFromResolution[resolution]; mode != "" {
		return mode
	}
	return spec.defaultMode
}

func sub2APIVideoImageURLs(payload map[string]any, spec sub2APIVideoModelSpec) []string {
	images := uploadedImagesFromPayload(payload["images"])
	if len(images) == 0 {
		return nil
	}
	limit := len(images)
	if spec.maxImages > 0 && limit > spec.maxImages {
		limit = spec.maxImages
	}
	imageURLs := make([]string, 0, limit)
	for _, image := range images[:limit] {
		if dataURL := uploadedImageDataURL(image); dataURL != "" {
			imageURLs = append(imageURLs, dataURL)
		}
	}
	return imageURLs
}

func uploadedImageDataURL(image protocol.UploadedImage) string {
	if len(image.Data) == 0 {
		return ""
	}
	contentType := strings.TrimSpace(image.ContentType)
	if contentType == "" {
		contentType = http.DetectContentType(image.Data)
	}
	if !strings.HasPrefix(strings.ToLower(contentType), "image/") {
		contentType = "image/png"
	}
	return "data:" + contentType + ";base64," + base64.StdEncoding.EncodeToString(image.Data)
}

func (a *App) formatSub2APIVideoResult(ctx context.Context, result map[string]any, binding service.Sub2APIBinding) (map[string]any, error) {
	if taskID := videoTaskID(result); taskID != "" && len(videoOutputURLs(result)) == 0 {
		polled, err := a.pollSub2APIVideoTask(ctx, binding, taskID)
		if err != nil {
			return nil, err
		}
		if result == nil {
			result = map[string]any{}
		}
		result = util.CopyMap(result)
		for key, value := range polled {
			result[key] = value
		}
		result["task_id"] = taskID
	}
	urls := videoOutputURLs(result)
	if len(urls) == 0 {
		return map[string]any{"created": time.Now().Unix(), "data": []map[string]any{}}, nil
	}
	data := make([]map[string]any, 0, len(urls))
	for index, urlValue := range urls {
		data = append(data, map[string]any{
			"url":       urlValue,
			"video_url": urlValue,
			"local_url": urlValue,
			"name":      fmt.Sprintf("video-%d", index+1),
		})
	}
	return map[string]any{
		"created": time.Now().Unix(),
		"data":    data,
		"raw":     result,
	}, nil
}

func (a *App) pollSub2APIVideoTask(ctx context.Context, binding service.Sub2APIBinding, taskID string) (map[string]any, error) {
	if err := waitVideoTaskPoll(ctx, videoTaskPollInitialDelay); err != nil {
		return nil, err
	}
	for {
		result, err := a.getSub2APIJSON(ctx, binding, sub2APITaskStatusEndpoint(binding.GatewayBaseURL, taskID))
		if err != nil {
			return nil, err
		}
		status := videoTaskStatus(result)
		if status == "" && len(videoOutputURLs(result)) > 0 {
			return result, nil
		}
		switch status {
		case "completed", "success", "succeeded":
			if len(videoOutputURLs(result)) == 0 {
				return nil, &protocol.ImageGenerationError{Message: "视频上游任务已完成但没有返回视频", StatusCode: http.StatusBadGateway, Type: "server_error", Code: "upstream_error"}
			}
			return result, nil
		case "failed", "error", "cancelled", "canceled":
			message := firstNonEmpty(sub2APIErrorMessageFromPayload(result), "视频上游任务失败")
			return nil, &protocol.ImageGenerationError{Message: message, StatusCode: http.StatusBadGateway, Type: "server_error", Code: "upstream_error"}
		}
		if err := waitVideoTaskPoll(ctx, videoTaskPollInterval); err != nil {
			return nil, err
		}
	}
}

func waitVideoTaskPoll(ctx context.Context, delay time.Duration) error {
	if delay <= 0 {
		return ctx.Err()
	}
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func videoTaskID(result map[string]any) string {
	for _, container := range videoResultContainers(result) {
		for _, key := range []string{"task_id", "taskId", "id"} {
			if value := util.Clean(container[key]); value != "" {
				return value
			}
		}
	}
	return ""
}

func videoTaskStatus(result map[string]any) string {
	for _, container := range videoResultContainers(result) {
		if status := strings.ToLower(strings.TrimSpace(firstNonEmpty(util.Clean(container["status"]), util.Clean(container["state"])))); status != "" {
			return status
		}
	}
	return ""
}

func videoOutputURLs(result map[string]any) []string {
	seen := map[string]struct{}{}
	var urls []string
	var collect func(any)
	collect = func(value any) {
		switch item := value.(type) {
		case string:
			appendVideoURL(item, seen, &urls)
		case []any:
			for _, child := range item {
				collect(child)
			}
		case []map[string]any:
			for _, child := range item {
				collect(child)
			}
		case map[string]any:
			for _, key := range []string{"video_url", "videoUrl", "mp4_url", "mp4Url", "url", "local_url", "src", "uri", "path"} {
				collect(item[key])
			}
			for _, key := range []string{"videos", "outputs", "data", "result", "items"} {
				collect(item[key])
			}
		}
	}
	collect(result)
	return urls
}

func appendVideoURL(value string, seen map[string]struct{}, urls *[]string) {
	cleaned := strings.TrimSpace(value)
	if cleaned == "" {
		return
	}
	lower := strings.ToLower(cleaned)
	if !strings.HasPrefix(lower, "http://") && !strings.HasPrefix(lower, "https://") && !strings.HasPrefix(lower, "data:video/") && !strings.HasPrefix(lower, "/") {
		return
	}
	if _, ok := seen[cleaned]; ok {
		return
	}
	seen[cleaned] = struct{}{}
	*urls = append(*urls, cleaned)
}

func videoResultContainers(result map[string]any) []map[string]any {
	return []map[string]any{
		result,
		util.StringMap(result["data"]),
		util.StringMap(result["result"]),
		util.StringMap(util.StringMap(result["data"])["result"]),
		util.StringMap(util.StringMap(result["result"])["result"]),
	}
}

func (a *App) videoInputImages(body map[string]any, identity service.Identity) ([]protocol.UploadedImage, error) {
	if body == nil {
		return nil, nil
	}
	var refs []service.CanvasImageRef
	for _, item := range util.AsMapSlice(body["images"]) {
		refs = append(refs, service.CanvasImageRef{
			URL:      firstNonEmpty(util.Clean(item["url"]), util.Clean(item["local_url"])),
			LocalURL: util.Clean(item["local_url"]),
			Path:     util.Clean(item["path"]),
			Name:     util.Clean(item["name"]),
		})
	}
	if len(refs) == 0 {
		return nil, nil
	}
	scope := imageAccessScope(identity)
	out := make([]protocol.UploadedImage, 0, len(refs))
	for index, ref := range refs {
		value := firstNonEmpty(ref.Path, ref.LocalURL, ref.URL)
		if value == "" {
			continue
		}
		data, contentType, err := a.images.ImageBytes(value, scope)
		if err != nil {
			return nil, fmt.Errorf("读取视频输入图片失败：%w", err)
		}
		out = append(out, protocol.UploadedImage{
			Data:        data,
			Filename:    firstNonEmpty(ref.Name, fmt.Sprintf("video-input-%d.png", index+1)),
			ContentType: firstNonEmpty(contentType, "image/png"),
		})
	}
	return out, nil
}

func postJSON(ctx context.Context, client *http.Client, target string, body map[string]any, headers map[string]string) (map[string]any, error) {
	raw, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, target, bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	for key, value := range headers {
		if strings.TrimSpace(value) != "" {
			req.Header.Set(key, value)
		}
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(resp.Body, 128<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, &protocol.ImageGenerationError{Message: sub2APIRequestErrorMessage(target, resp.StatusCode, sub2APIErrorMessage(data)), StatusCode: resp.StatusCode, Type: "server_error", Code: "upstream_error"}
	}
	var result map[string]any
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, &protocol.ImageGenerationError{Message: "视频上游返回非 JSON 响应", StatusCode: http.StatusBadGateway, Type: "server_error", Code: "upstream_error"}
	}
	return result, nil
}
