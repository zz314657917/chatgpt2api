package httpapi

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"sort"
	"strings"
	"sync"
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

func (a *App) sub2APIBindingForIdentity(identity service.Identity) (service.Sub2APIBinding, bool) {
	if a == nil || a.sub2Bindings == nil || identity.Provider != service.AuthProviderSub2API {
		return service.Sub2APIBinding{}, false
	}
	return a.sub2Bindings.Get(identityScope(identity))
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
			field, err := writer.CreateFormFile("image", firstNonEmpty(image.Filename, "image.png"))
			if err != nil {
				return nil, err
			}
			if _, err := field.Write(image.Data); err != nil {
				return nil, err
			}
		}
		if err := writer.Close(); err != nil {
			return nil, err
		}
		return a.postSub2APIMultipart(ctx, binding, "images/edits", writer.FormDataContentType(), &buf)
	})
}

const sub2APIImageBatchLimit = 1

func (a *App) callSub2APIImageBatches(ctx context.Context, identity service.Identity, payload map[string]any, call func(map[string]any) (map[string]any, error)) (map[string]any, error) {
	requested := sub2APIImageRequestedCount(payload)
	progress := sub2APIImageProgressCallback(payload)
	acquire := sub2APIImageOutputSlotAcquirer(payload)
	created := time.Now().Unix()
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	resultCh := make(chan sub2APIImageBatchOutput, requested)
	var wg sync.WaitGroup
	for index := 1; index <= requested; index++ {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()
			resultCh <- a.callSub2APIImageBatch(ctx, identity, payload, call, acquire, index)
		}(index)
	}
	go func() {
		wg.Wait()
		close(resultCh)
	}()
	results := make([]sub2APIImageBatchOutput, 0, requested)
	var firstErr error
	for result := range resultCh {
		results = append(results, result)
		if result.err != nil && firstErr == nil {
			firstErr = result.err
			cancel()
		}
		if result.created != 0 {
			created = result.created
		}
		if progress != nil {
			data := sub2APIIndexedImageData(results, true)
			if len(data) > 0 {
				progress(data)
			}
		}
	}
	allData := sub2APIIndexedImageData(results, firstErr != nil)
	if firstErr != nil {
		return sub2APIImageBatchResult(created, allData), firstErr
	}
	return sub2APIImageBatchResult(created, allData), nil
}

type sub2APIImageBatchOutput struct {
	index   int
	created int64
	data    []map[string]any
	err     error
}

func (a *App) callSub2APIImageBatch(ctx context.Context, identity service.Identity, payload map[string]any, call func(map[string]any) (map[string]any, error), acquire protocol.ImageOutputSlotAcquirer, index int) sub2APIImageBatchOutput {
	out := sub2APIImageBatchOutput{index: index}
	batchPayload := util.CopyMap(payload)
	batchPayload["n"] = sub2APIImageBatchLimit
	release, err := sub2APIAcquireBatchSlot(ctx, acquire, index)
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

func sub2APIIndexedImageData(results []sub2APIImageBatchOutput, keepPlaceholders bool) []map[string]any {
	if len(results) == 0 {
		return nil
	}
	sort.SliceStable(results, func(i, j int) bool {
		return results[i].index < results[j].index
	})
	if keepPlaceholders {
		maxIndex := 0
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
			data[result.index-1] = cloned[0]
			data = append(data, cloned[1:]...)
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

func sub2APIImageJSONPayload(payload map[string]any) map[string]any {
	out := map[string]any{
		"model":   sub2APIImageModel(payload["model"]),
		"prompt":  util.Clean(payload["prompt"]),
		"n":       util.ToInt(payload["n"], 1),
		"size":    util.Clean(payload["size"]),
		"quality": util.Clean(payload["quality"]),
	}
	for _, key := range []string{"background", "moderation", "style", "partial_images", "output_format", "output_compression", "input_image_mask"} {
		if value := payload[key]; value != nil && util.Clean(value) != "" {
			out[key] = value
		}
	}
	if size := firstNonEmpty(util.Clean(payload["requested_size"]), util.Clean(payload["image_resolution"])); size != "" && out["size"] == "" {
		out["size"] = size
	}
	for key, value := range out {
		if value == "" {
			delete(out, key)
		}
	}
	return out
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

func (a *App) doSub2APIRequest(ctx context.Context, binding service.Sub2APIBinding, method, endpoint, contentType string, body io.Reader) (map[string]any, error) {
	target := sub2APIEndpointURL(binding.GatewayBaseURL, endpoint)
	if target == "" {
		return nil, protocol.HTTPError{Status: http.StatusBadGateway, Message: "sub2api gateway_base_url is missing"}
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
			Message:    sub2APIImageRequestErrorMessage(resp.StatusCode, upstreamMessage),
			StatusCode: resp.StatusCode,
			Type:       "server_error",
			Code:       "upstream_error",
		}
	}
	var result map[string]any
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, &protocol.ImageGenerationError{Message: "sub2api image response is invalid", StatusCode: http.StatusBadGateway, Type: "server_error", Code: "upstream_error"}
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
	items := util.AsMapSlice(result["data"])
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
		if imageURL := util.Clean(item["url"]); imageURL != "" {
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
			if value := util.Clean(payload[key]); value != "" {
				return value
			}
			if nested := util.Clean(util.StringMap(payload[key])["message"]); nested != "" {
				return nested
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
	upstreamMessage = strings.TrimSpace(upstreamMessage)
	normalized := strings.ToLower(upstreamMessage)
	if status == http.StatusBadGateway || strings.Contains(normalized, "upstream service temporarily unavailable") || strings.Contains(normalized, "no available accounts") {
		if upstreamMessage == "" {
			upstreamMessage = "empty response"
		}
		return fmt.Sprintf("Sub2API 图片上游账号池暂不可用，请稍后重试或在 Sub2API 中检查图片账号/分组。原始错误：HTTP %d %s", status, upstreamMessage)
	}
	if upstreamMessage == "" {
		upstreamMessage = "empty response"
	}
	return fmt.Sprintf("Sub2API 图片请求失败：HTTP %d %s", status, upstreamMessage)
}
