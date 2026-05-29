package httpapi

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"sort"
	"strings"
	"time"

	"chatgpt2api/internal/protocol"
	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

func (a *App) handleSub2APILaunch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	body, err := readJSONMap(r)
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	if a == nil || a.sub2Launch == nil {
		util.WriteError(w, http.StatusServiceUnavailable, "sub2api launch is not configured")
		return
	}
	result, err := a.sub2Launch.Redeem(r.Context(), util.Clean(body["token"]))
	if err != nil {
		util.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	setAuthSessionCookie(w, r, result.Token)
	a.writeLoginResponseWithExtra(w, result.Identity, result.Token, map[string]any{
		"sub2api": result.Binding.PublicMap(),
	})
}

func (a *App) handleSub2APIKeys(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	identity, ok := a.requireSub2APIIdentity(w, r)
	if !ok {
		return
	}
	items, err := a.sub2Launch.ListAPIKeys(r.Context(), identity)
	if err != nil {
		util.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	var binding any
	if current, ok := a.sub2APIBindingForIdentity(identity); ok {
		binding = current.PublicMap()
	}
	util.WriteJSON(w, http.StatusOK, map[string]any{"items": items, "binding": binding})
}

func (a *App) handleSub2APIBinding(w http.ResponseWriter, r *http.Request) {
	identity, ok := a.requireSub2APIIdentity(w, r)
	if !ok {
		return
	}
	switch r.Method {
	case http.MethodGet:
		var binding any
		if current, ok := a.sub2APIBindingForIdentity(identity); ok {
			binding = current.PublicMap()
		}
		util.WriteJSON(w, http.StatusOK, map[string]any{"binding": binding})
	case http.MethodPost:
		body, err := readJSONMap(r)
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, "invalid json body")
			return
		}
		binding, err := a.sub2Launch.BindAPIKey(r.Context(), identity, util.Clean(body["api_key_id"]))
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		util.WriteJSON(w, http.StatusOK, map[string]any{"binding": binding.PublicMap()})
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (a *App) requireSub2APIIdentity(w http.ResponseWriter, r *http.Request) (service.Identity, bool) {
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return service.Identity{}, false
	}
	if identity.Provider != service.AuthProviderSub2API {
		util.WriteError(w, http.StatusForbidden, "sub2api session is required")
		return service.Identity{}, false
	}
	if a == nil || a.sub2Launch == nil {
		util.WriteError(w, http.StatusServiceUnavailable, "sub2api launch is not configured")
		return service.Identity{}, false
	}
	return identity, true
}

func (a *App) sub2APIBindingForIdentity(identity service.Identity) (service.Sub2APIBinding, bool) {
	if a == nil || a.sub2Bindings == nil || identity.Provider != service.AuthProviderSub2API {
		return service.Sub2APIBinding{}, false
	}
	binding, ok := a.sub2Bindings.Get(identityScope(identity))
	return binding, ok && binding.HasAPIKey()
}

func sub2APIKeyBindingRequiredError() error {
	return protocol.HTTPError{Status: http.StatusPreconditionRequired, Message: "请先选择 Sub2API API Key 后再开始创作"}
}

func (a *App) runLoggedSub2APIImageGenerationTask(ctx context.Context, identity service.Identity, payload map[string]any, binding service.Sub2APIBinding) (map[string]any, error) {
	return a.runLoggedImageTask(ctx, identity, payload, "/api/creation-tasks/image-generations", "文生图", func(ctx context.Context, payload map[string]any) (map[string]any, error) {
		return a.callSub2APIImageGenerations(ctx, identity, payload, binding)
	})
}

func (a *App) runLoggedSub2APIImageEditTask(ctx context.Context, identity service.Identity, payload map[string]any, binding service.Sub2APIBinding) (map[string]any, error) {
	return a.runLoggedImageTask(ctx, identity, payload, "/api/creation-tasks/image-edits", "图生图", func(ctx context.Context, payload map[string]any) (map[string]any, error) {
		return a.callSub2APIImageEdits(ctx, identity, payload, binding)
	})
}

func (a *App) runLoggedSub2APIChatTask(ctx context.Context, identity service.Identity, payload map[string]any, binding service.Sub2APIBinding) (map[string]any, error) {
	start := time.Now()
	requestCapture := payloadAuditCapture(payload)
	payload["owner_id"] = identityScope(identity)
	payload["owner_name"] = identityDisplayName(identity)
	payload["stream"] = false
	model := sub2APIChatModel(payload["model"])
	result, err := a.callSub2APIChatCompletions(ctx, payload, binding)
	if err != nil {
		a.logCall(ctx, identity, "文本生成", http.MethodPost, "/api/creation-tasks/chat-completions", model, start, "failed", protocolErrorHTTPStatus(err), err.Error(), nil, requestCapture)
		return result, err
	}
	text := chatCompletionResultText(result)
	if text == "" {
		err = errors.New("模型没有返回文本内容")
		a.logCall(ctx, identity, "文本生成", http.MethodPost, "/api/creation-tasks/chat-completions", model, start, "failed", http.StatusBadGateway, err.Error(), nil, requestCapture)
		return result, err
	}
	a.logCall(ctx, identity, "文本生成", http.MethodPost, "/api/creation-tasks/chat-completions", model, start, "success", http.StatusOK, "", nil, requestCapture)
	return sub2APIChatTaskResult(result, text), nil
}

func (a *App) callSub2APIChatCompletions(ctx context.Context, payload map[string]any, binding service.Sub2APIBinding) (map[string]any, error) {
	return a.postSub2APIJSON(ctx, binding, "chat/completions", sub2APIChatPayload(payload))
}

func (a *App) callSub2APIImageGenerations(ctx context.Context, identity service.Identity, payload map[string]any, binding service.Sub2APIBinding) (map[string]any, error) {
	return a.callSub2APIImageBatches(ctx, identity, payload, func(batchPayload map[string]any) (map[string]any, error) {
		body := sub2APIImageJSONPayload(batchPayload)
		body["response_format"] = "b64_json"
		return a.postSub2APIJSON(ctx, binding, "images/generations", body)
	})
}

func (a *App) callSub2APIImageEdits(ctx context.Context, identity service.Identity, payload map[string]any, binding service.Sub2APIBinding) (map[string]any, error) {
	images := uploadedImagesFromPayload(payload["images"])
	if len(images) == 0 {
		return nil, protocol.HTTPError{Status: http.StatusBadRequest, Message: "image file is required"}
	}
	return a.callSub2APIImageBatches(ctx, identity, payload, func(batchPayload map[string]any) (map[string]any, error) {
		var buf bytes.Buffer
		writer := multipart.NewWriter(&buf)
		for key, value := range sub2APIImageJSONPayload(batchPayload) {
			if value == nil {
				continue
			}
			_ = writer.WriteField(key, fmt.Sprint(value))
		}
		_ = writer.WriteField("response_format", "b64_json")
		for _, image := range images {
			if err := writeSub2APIImagePart(writer, image); err != nil {
				return nil, err
			}
		}
		if err := writer.Close(); err != nil {
			return nil, err
		}
		return a.postSub2APIMultipart(ctx, binding, "images/edits", writer.FormDataContentType(), &buf)
	})
}

const sub2APIImageBatchLimit = 10

const (
	sub2APIImageTaskPollInitialDelay = 500 * time.Millisecond
	sub2APIImageTaskPollInterval     = 3 * time.Second
)

func (a *App) callSub2APIImageBatches(ctx context.Context, identity service.Identity, payload map[string]any, call func(map[string]any) (map[string]any, error)) (map[string]any, error) {
	requested := sub2APIImageRequestedCount(payload)
	progress := sub2APIImageProgressCallback(payload)
	acquire := sub2APIImageOutputSlotAcquirer(payload)
	created := time.Now().Unix()
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	result := a.callSub2APIImageBatch(ctx, identity, payload, call, acquire, 1, requested)
	if result.err != nil {
		cancel()
		return sub2APIImageBatchResult(created, sub2APIIndexedImageData([]sub2APIImageBatchOutput{result}, true, requested)), result.err
	}
	if result.created != 0 {
		created = result.created
	}
	if progress != nil {
		data := sub2APIIndexedImageData([]sub2APIImageBatchOutput{result}, true, requested)
		if len(data) > 0 {
			progress(data)
		}
	}
	return sub2APIImageBatchResult(created, sub2APIIndexedImageData([]sub2APIImageBatchOutput{result}, false, requested)), nil
}

type sub2APIImageBatchOutput struct {
	index   int
	created int64
	data    []map[string]any
	err     error
}

func (a *App) callSub2APIImageBatch(ctx context.Context, identity service.Identity, payload map[string]any, call func(map[string]any) (map[string]any, error), acquire protocol.ImageOutputSlotAcquirer, index int, count int) sub2APIImageBatchOutput {
	out := sub2APIImageBatchOutput{index: index}
	batchPayload := util.CopyMap(payload)
	batchPayload["n"] = count
	release, err := sub2APIAcquireBatchSlots(ctx, acquire, index, count)
	if err != nil {
		out.err = err
		return out
	}
	defer release()
	result, err := call(batchPayload)
	if err != nil {
		out.err = err
		return out
	}
	formatted, err := a.formatSub2APIImageResult(ctx, result, identity, batchPayload)
	if err != nil {
		out.err = err
		return out
	}
	out.created = int64(util.ToInt(formatted["created"], int(time.Now().Unix())))
	out.data = util.AsMapSlice(formatted["data"])
	return out
}

func sub2APIIndexedImageData(results []sub2APIImageBatchOutput, keepPlaceholders bool, requested int) []map[string]any {
	if len(results) == 0 {
		return nil
	}
	sort.SliceStable(results, func(i, j int) bool {
		return results[i].index < results[j].index
	})
	if keepPlaceholders {
		maxIndex := requested
		for _, result := range results {
			if result.index > maxIndex {
				maxIndex = result.index
			}
		}
		data := make([]map[string]any, maxIndex)
		for i := range data {
			data[i] = map[string]any{}
		}
		for _, result := range results {
			if result.index < 1 || len(result.data) == 0 {
				continue
			}
			cloned := sub2APICloneImageData(result.data)
			for offset, item := range cloned {
				target := result.index - 1 + offset
				if target >= len(data) {
					data = append(data, item)
					continue
				}
				data[target] = item
			}
		}
		return data
	}
	data := make([]map[string]any, 0, len(results))
	for _, result := range results {
		data = append(data, sub2APICloneImageData(result.data)...)
	}
	return data
}

func sub2APICloneImageData(items []map[string]any) []map[string]any {
	if len(items) == 0 {
		return nil
	}
	out := make([]map[string]any, 0, len(items))
	for _, item := range items {
		if item == nil {
			out = append(out, map[string]any{})
			continue
		}
		out = append(out, util.CopyMap(item))
	}
	return out
}

func sub2APIImageBatchResult(created int64, data []map[string]any) map[string]any {
	if data == nil {
		data = []map[string]any{}
	}
	return map[string]any{"created": created, "data": data}
}

func sub2APIImageRequestedCount(payload map[string]any) int {
	count := util.ToInt(payload["n"], 1)
	if count < 1 {
		return 1
	}
	if count > sub2APIImageBatchLimit {
		return sub2APIImageBatchLimit
	}
	return count
}

func sub2APIImageProgressCallback(payload map[string]any) protocol.ImageOutputProgressCallback {
	switch callback := payload["image_output_callback"].(type) {
	case protocol.ImageOutputProgressCallback:
		return callback
	case func([]map[string]any):
		return callback
	default:
		return nil
	}
}

func sub2APIImageOutputSlotAcquirer(payload map[string]any) protocol.ImageOutputSlotAcquirer {
	switch acquire := payload[protocol.ImageOutputSlotAcquirerPayloadKey].(type) {
	case protocol.ImageOutputSlotAcquirer:
		return acquire
	case func(context.Context, int) (func(), error):
		return acquire
	default:
		return nil
	}
}

func sub2APIAcquireBatchSlot(ctx context.Context, acquire protocol.ImageOutputSlotAcquirer, index int) (func(), error) {
	if acquire == nil {
		return func() {}, nil
	}
	release, err := acquire(ctx, index)
	if err != nil {
		return nil, err
	}
	if release == nil {
		return func() {}, nil
	}
	return release, nil
}

func sub2APIAcquireBatchSlots(ctx context.Context, acquire protocol.ImageOutputSlotAcquirer, start int, count int) (func(), error) {
	if count < 1 {
		count = 1
	}
	releases := make([]func(), 0, count)
	for offset := 0; offset < count; offset++ {
		release, err := sub2APIAcquireBatchSlot(ctx, acquire, start+offset)
		if err != nil {
			for index := len(releases) - 1; index >= 0; index-- {
				releases[index]()
			}
			return nil, err
		}
		releases = append(releases, release)
	}
	return func() {
		for index := len(releases) - 1; index >= 0; index-- {
			releases[index]()
		}
	}, nil
}

func sub2APIImageJSONPayload(payload map[string]any) map[string]any {
	out := map[string]any{
		"model":   sub2APIImageModel(payload["model"]),
		"prompt":  util.Clean(payload["prompt"]),
		"n":       util.ToInt(payload["n"], 1),
		"size":    sub2APIImageSize(payload),
		"quality": util.Clean(payload["quality"]),
	}
	if resolution := sub2APIImageResolution(payload); resolution != "" {
		out["resolution"] = resolution
	}
	if _, ok := payload["official_fallback"]; ok {
		out["official_fallback"] = util.ToBool(payload["official_fallback"])
	}
	for _, key := range []string{"background", "moderation", "style", "partial_images", "output_format", "output_compression", "input_image_mask"} {
		if value := payload[key]; value != nil && util.Clean(value) != "" {
			out[key] = value
		}
	}
	for key, value := range out {
		if value == "" {
			delete(out, key)
		}
	}
	return out
}

func sub2APIImageSize(payload map[string]any) string {
	size := firstNonEmpty(util.Clean(payload["size"]), util.Clean(payload["requested_size"]), util.Clean(payload["image_resolution"]))
	size = protocol.NormalizeImageGenerationSize(size)
	switch strings.ToLower(strings.TrimSpace(size)) {
	case "1:1":
		return "1024x1024"
	case "16:9":
		return "1536x864"
	case "9:16":
		return "864x1536"
	default:
		return strings.TrimSpace(size)
	}
}

func sub2APIImageResolution(payload map[string]any) string {
	resolution := strings.ToLower(strings.TrimSpace(firstNonEmpty(util.Clean(payload["resolution"]), util.Clean(payload["image_resolution"]))))
	switch resolution {
	case "1k", "2k", "4k":
		return resolution
	default:
		return ""
	}
}

func writeSub2APIImagePart(writer *multipart.Writer, image protocol.UploadedImage) error {
	filename := firstNonEmpty(image.Filename, "image.png")
	header := make(textproto.MIMEHeader)
	header.Set("Content-Disposition", mime.FormatMediaType("form-data", map[string]string{
		"name":     "image",
		"filename": filename,
	}))
	header.Set("Content-Type", sub2APIImageContentType(image))
	part, err := writer.CreatePart(header)
	if err != nil {
		return err
	}
	_, err = part.Write(image.Data)
	return err
}

func sub2APIImageContentType(image protocol.UploadedImage) string {
	contentType := strings.TrimSpace(strings.Split(image.ContentType, ";")[0])
	if strings.HasPrefix(strings.ToLower(contentType), "image/") {
		return contentType
	}
	if detected := http.DetectContentType(image.Data); strings.HasPrefix(strings.ToLower(detected), "image/") {
		return detected
	}
	filename := strings.ToLower(strings.TrimSpace(image.Filename))
	switch {
	case strings.HasSuffix(filename, ".jpg"), strings.HasSuffix(filename, ".jpeg"):
		return "image/jpeg"
	case strings.HasSuffix(filename, ".webp"):
		return "image/webp"
	default:
		return "image/png"
	}
}

func sub2APIChatPayload(payload map[string]any) map[string]any {
	out := map[string]any{
		"model":    sub2APIChatModel(payload["model"]),
		"messages": util.AsMapSlice(payload["messages"]),
		"stream":   false,
	}
	if n := util.ToInt(payload["n"], 1); n > 1 {
		out["n"] = n
	}
	return out
}

func sub2APIChatModel(value any) string {
	model := firstNonEmpty(util.Clean(value), util.ImageModelAuto)
	if model == util.ImageModelAuto {
		return util.DefaultChatModel
	}
	return model
}

func sub2APIChatTaskResult(result map[string]any, text string) map[string]any {
	if result == nil {
		result = map[string]any{}
	}
	created := int64(util.ToInt(result["created"], int(time.Now().Unix())))
	return map[string]any{
		"created":     created,
		"output_type": "text",
		"data":        []map[string]any{{"text_response": text}},
	}
}

func sub2APIImageModel(value any) string {
	model := firstNonEmpty(util.Clean(value), util.ImageModelGPT)
	if model == util.ImageModelAuto || model == util.ImageModelCodex {
		return util.ImageModelGPT
	}
	return model
}

func (a *App) postSub2APIJSON(ctx context.Context, binding service.Sub2APIBinding, endpoint string, body map[string]any) (map[string]any, error) {
	raw, _ := json.Marshal(body)
	return a.doSub2APIRequest(ctx, binding, http.MethodPost, endpoint, "application/json", bytes.NewReader(raw))
}

func (a *App) postSub2APIMultipart(ctx context.Context, binding service.Sub2APIBinding, endpoint, contentType string, body io.Reader) (map[string]any, error) {
	return a.doSub2APIRequest(ctx, binding, http.MethodPost, endpoint, contentType, body)
}

func (a *App) getSub2APIJSON(ctx context.Context, binding service.Sub2APIBinding, endpoint string) (map[string]any, error) {
	return a.doSub2APIRequest(ctx, binding, http.MethodGet, endpoint, "", nil)
}

func (a *App) doSub2APIRequest(ctx context.Context, binding service.Sub2APIBinding, method, endpoint, contentType string, body io.Reader) (map[string]any, error) {
	target := sub2APIEndpointURL(binding.GatewayBaseURL, endpoint)
	if target == "" {
		return nil, protocol.HTTPError{Status: http.StatusBadGateway, Message: "upstream gateway_base_url is missing"}
	}
	req, err := http.NewRequestWithContext(ctx, method, target, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	req.Header.Set("Authorization", "Bearer "+binding.APIKey)
	client := a.sub2APIHTTPClient()
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(resp.Body, 128<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		upstreamMessage := sub2APIErrorMessage(data)
		return nil, &protocol.ImageGenerationError{
			Message:    sub2APIRequestErrorMessage(endpoint, resp.StatusCode, upstreamMessage),
			StatusCode: resp.StatusCode,
			Type:       "server_error",
			Code:       "upstream_error",
		}
	}
	var result map[string]any
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, &protocol.ImageGenerationError{Message: sub2APIInvalidResponseMessage(endpoint), StatusCode: http.StatusBadGateway, Type: "server_error", Code: "upstream_error"}
	}
	return result, nil
}

func (a *App) sub2APIHTTPClient() *http.Client {
	timeout := 5 * time.Minute
	if a != nil && a.config != nil {
		if configured := time.Duration(a.config.ImageTaskTimeoutSeconds()) * time.Second; configured > 0 {
			timeout = configured
		}
	}
	return &http.Client{Timeout: timeout}
}

func sub2APIEndpointURL(baseURL, endpoint string) string {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	endpoint = strings.TrimLeft(strings.TrimSpace(endpoint), "/")
	if baseURL == "" || endpoint == "" {
		return ""
	}
	return baseURL + "/" + endpoint
}

func (a *App) formatSub2APIImageResult(ctx context.Context, result map[string]any, identity service.Identity, payload map[string]any) (map[string]any, error) {
	if taskID := sub2APIImageTaskID(result); taskID != "" {
		binding, ok := a.sub2APIBindingForIdentity(identity)
		if !ok {
			return nil, &protocol.ImageGenerationError{Message: "图片上游返回异步任务，但当前用户没有可用网关绑定", StatusCode: http.StatusBadGateway, Type: "server_error", Code: "upstream_error"}
		}
		polled, err := a.pollSub2APIImageTask(ctx, binding, taskID)
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
	items := util.AsMapSlice(result["data"])
	if len(items) == 0 {
		items = sub2APIImageTaskResultItems(result)
	}
	if len(items) == 0 && util.Clean(result["b64_json"]) != "" {
		items = []map[string]any{result}
	}
	if len(items) == 0 {
		return map[string]any{"created": time.Now().Unix(), "data": []map[string]any{}}, nil
	}
	created := int64(util.ToInt(result["created"], int(time.Now().Unix())))
	normalized := make([]map[string]any, 0, len(items))
	for _, item := range items {
		b64 := util.Clean(item["b64_json"])
		if b64 != "" {
			normalized = append(normalized, map[string]any{
				"b64_json":       b64,
				"revised_prompt": util.Clean(item["revised_prompt"]),
				"output_format":  firstNonEmpty(util.Clean(item["output_format"]), service.NormalizeImageOutputFormat(util.Clean(payload["output_format"]))),
			})
			continue
		}
		if imageURL := sub2APIImageItemURL(item); imageURL != "" {
			b64 := fetchSub2APIImageAsBase64(ctx, imageURL)
			if b64 == "" {
				continue
			}
			normalized = append(normalized, map[string]any{
				"b64_json":       b64,
				"revised_prompt": util.Clean(item["revised_prompt"]),
			})
		}
	}
	return a.engine.FormatImageResultWithOptions(normalized, util.Clean(payload["prompt"]), "url", util.Clean(payload["base_url"]), identityScope(identity), identityDisplayName(identity), created, "", protocol.ImageOutputOptions{
		Format:              service.NormalizeImageOutputFormat(util.Clean(payload["output_format"])),
		TrustUpstreamFormat: true,
	}), nil
}

func sub2APIImageTaskID(result map[string]any) string {
	taskID := util.Clean(result["task_id"])
	if taskID != "" {
		return taskID
	}
	data := util.AsMapSlice(result["data"])
	if len(data) == 1 {
		return util.Clean(data[0]["task_id"])
	}
	return ""
}

func (a *App) pollSub2APIImageTask(ctx context.Context, binding service.Sub2APIBinding, taskID string) (map[string]any, error) {
	if err := waitSub2APIImageTaskPoll(ctx, sub2APIImageTaskPollInitialDelay); err != nil {
		return nil, err
	}
	for {
		result, err := a.getSub2APIJSON(ctx, binding, "tasks/"+taskID)
		if err != nil {
			return nil, err
		}
		switch sub2APIImageTaskStatus(result) {
		case "completed", "success", "succeeded":
			if len(sub2APIImageTaskResultItems(result)) == 0 {
				return nil, &protocol.ImageGenerationError{Message: "图片上游任务已完成但没有返回图片", StatusCode: http.StatusBadGateway, Type: "server_error", Code: "upstream_error"}
			}
			return result, nil
		case "failed", "error", "cancelled", "canceled":
			message := firstNonEmpty(sub2APIErrorMessageFromPayload(result), "图片上游任务失败")
			return nil, &protocol.ImageGenerationError{Message: message, StatusCode: http.StatusBadGateway, Type: "server_error", Code: "upstream_error"}
		}
		if err := waitSub2APIImageTaskPoll(ctx, sub2APIImageTaskPollInterval); err != nil {
			return nil, err
		}
	}
}

func waitSub2APIImageTaskPoll(ctx context.Context, delay time.Duration) error {
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

func sub2APIImageTaskStatus(result map[string]any) string {
	status := strings.ToLower(strings.TrimSpace(firstNonEmpty(util.Clean(result["status"]), util.Clean(result["state"]))))
	if status != "" {
		return status
	}
	data := util.StringMap(result["data"])
	return strings.ToLower(strings.TrimSpace(firstNonEmpty(util.Clean(data["status"]), util.Clean(data["state"]))))
}

func sub2APIImageTaskResultItems(result map[string]any) []map[string]any {
	for _, container := range []map[string]any{
		result,
		util.StringMap(result["result"]),
		util.StringMap(result["data"]),
		util.StringMap(util.StringMap(result["data"])["result"]),
		util.StringMap(util.StringMap(result["result"])["result"]),
	} {
		if len(container) == 0 {
			continue
		}
		if items := util.AsMapSlice(container["images"]); len(items) > 0 {
			return items
		}
		if items := util.AsMapSlice(container["data"]); len(items) > 0 {
			return items
		}
		if b64 := util.Clean(container["b64_json"]); b64 != "" {
			return []map[string]any{container}
		}
		if url := sub2APIImageItemURL(container); url != "" {
			return []map[string]any{container}
		}
	}
	if items := util.AsMapSlice(result["result"]); len(items) > 0 {
		return items
	}
	return nil
}

func sub2APIImageItemURL(item map[string]any) string {
	for _, key := range []string{"url", "image_url"} {
		for _, url := range util.AsStringSlice(item[key]) {
			if cleaned := util.Clean(url); cleaned != "" {
				return cleaned
			}
		}
		if url, ok := item[key].(string); ok {
			if cleaned := util.Clean(url); cleaned != "" {
				return cleaned
			}
		}
	}
	return ""
}

func sub2APIErrorMessageFromPayload(result map[string]any) string {
	for _, key := range []string{"message", "error", "detail"} {
		if nested := util.Clean(util.StringMap(result[key])["message"]); nested != "" {
			return nested
		}
		if value := util.Clean(result[key]); value != "" {
			return value
		}
	}
	for _, container := range []map[string]any{util.StringMap(result["data"]), util.StringMap(result["result"])} {
		for _, key := range []string{"message", "error", "detail"} {
			if nested := util.Clean(util.StringMap(container[key])["message"]); nested != "" {
				return nested
			}
			if value := util.Clean(container[key]); value != "" {
				return value
			}
		}
	}
	return ""
}

func fetchSub2APIImageAsBase64(ctx context.Context, imageURL string) string {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, imageURL, nil)
	if err != nil {
		return ""
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return ""
	}
	data, _ := io.ReadAll(io.LimitReader(resp.Body, 64<<20))
	if len(data) == 0 {
		return ""
	}
	return base64.StdEncoding.EncodeToString(data)
}

func sub2APIErrorMessage(data []byte) string {
	var payload map[string]any
	if json.Unmarshal(data, &payload) == nil {
		for _, key := range []string{"message", "error", "detail"} {
			if nested := util.Clean(util.StringMap(payload[key])["message"]); nested != "" {
				return nested
			}
			if value := util.Clean(payload[key]); value != "" {
				return value
			}
		}
	}
	text := strings.TrimSpace(string(data))
	if len(text) > 300 {
		text = text[:300]
	}
	if text == "" {
		return "empty response"
	}
	return text
}

func sub2APIImageRequestErrorMessage(status int, upstreamMessage string) string {
	return sub2APIRequestErrorMessage("images/generations", status, upstreamMessage)
}

func sub2APIRequestErrorMessage(endpoint string, status int, upstreamMessage string) string {
	upstreamMessage = sub2APIReadableErrorMessage(upstreamMessage)
	normalized := strings.ToLower(upstreamMessage)
	if status == http.StatusBadGateway || strings.Contains(normalized, "upstream service temporarily unavailable") || strings.Contains(normalized, "no available accounts") {
		if upstreamMessage == "" {
			upstreamMessage = "empty response"
		}
		if strings.Contains(endpoint, "chat/completions") {
			return fmt.Sprintf("对话上游账号池暂不可用：HTTP %d %s", status, upstreamMessage)
		}
		return fmt.Sprintf("图片上游账号池暂不可用：HTTP %d %s", status, upstreamMessage)
	}
	if upstreamMessage == "" {
		upstreamMessage = "empty response"
	}
	if strings.Contains(endpoint, "chat/completions") {
		return fmt.Sprintf("对话请求失败：HTTP %d %s", status, upstreamMessage)
	}
	return fmt.Sprintf("图片请求失败：HTTP %d %s", status, upstreamMessage)
}

func sub2APIReadableErrorMessage(message string) string {
	text := strings.TrimSpace(message)
	if !strings.HasPrefix(text, "map[") {
		return text
	}
	body := strings.TrimSuffix(strings.TrimPrefix(text, "map["), "]")
	for _, key := range []string{"message", "error", "detail"} {
		if value := sub2APIMapStringField(body, key); value != "" {
			return value
		}
	}
	return text
}

func sub2APIMapStringField(body string, key string) string {
	start := strings.Index(body, key+":")
	if start < 0 {
		return ""
	}
	value := body[start+len(key)+1:]
	end := len(value)
	for _, nextKey := range []string{" message:", " error:", " detail:", " type:", " code:", " param:"} {
		if index := strings.Index(value, nextKey); index >= 0 && index < end {
			end = index
		}
	}
	return strings.TrimSpace(value[:end])
}

func sub2APIInvalidResponseMessage(endpoint string) string {
	if strings.Contains(endpoint, "chat/completions") {
		return "对话上游响应格式无效"
	}
	return "图片上游响应格式无效"
}
