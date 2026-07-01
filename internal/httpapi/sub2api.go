package httpapi

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"mime"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"net/url"
	"path"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"chatgpt2api/internal/imagestore"
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

func (a *App) handleSub2APIWallet(w http.ResponseWriter, r *http.Request) {
	identity, ok := a.requireSub2APIIdentity(w, r)
	if !ok {
		return
	}
	switch {
	case r.URL.Path == "/api/sub2api/balance" && r.Method == http.MethodGet:
		body, err := a.sub2Launch.Balance(r.Context(), identity)
		if err != nil {
			util.WriteError(w, http.StatusBadGateway, err.Error())
			return
		}
		util.WriteJSON(w, http.StatusOK, body)
	case r.URL.Path == "/api/sub2api/usage" && r.Method == http.MethodGet:
		body, err := a.sub2Launch.Usage(r.Context(), identity, util.ToInt(r.URL.Query().Get("limit"), 20))
		if err != nil {
			util.WriteError(w, http.StatusBadGateway, err.Error())
			return
		}
		util.WriteJSON(w, http.StatusOK, body)
	default:
		http.NotFound(w, r)
	}
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
	binding, ok := a.sub2APISessionBindingForIdentity(identity)
	return binding, ok && binding.HasAPIKey()
}

func (a *App) sub2APISessionBindingForIdentity(identity service.Identity) (service.Sub2APIBinding, bool) {
	if a == nil || a.sub2Bindings == nil || identity.Provider != service.AuthProviderSub2API {
		return service.Sub2APIBinding{}, false
	}
	binding, ok := a.sub2Bindings.Get(identityScope(identity))
	return binding, ok
}

func (a *App) sub2APIBindingForMode(ctx context.Context, identity service.Identity, mode string) (service.Sub2APIBinding, bool) {
	if identity.Provider != service.AuthProviderSub2API {
		return service.Sub2APIBinding{}, false
	}
	if a != nil && a.config != nil && a.config.LuoyeIndependentMode() && a.sub2Launch != nil {
		binding, err := a.sub2Launch.DefaultBinding(identity, mode)
		return binding, err == nil
	}
	if binding, ok := a.sub2APIBindingForIdentity(identity); ok {
		return binding, true
	}
	return service.Sub2APIBinding{}, false
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
	body := sub2APIChatPayload(payload)
	if binding.SystemDefault {
		body["model"] = a.sub2APIChatModelForBinding(ctx, binding, body["model"])
	}
	model := util.Clean(body["model"])
	result, err := a.callSub2APIChatCompletionsWithBody(ctx, body, binding)
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
	return sub2APIChatTaskResult(result, text, model), nil
}

func (a *App) callSub2APIChatCompletions(ctx context.Context, payload map[string]any, binding service.Sub2APIBinding) (map[string]any, error) {
	body := sub2APIChatPayload(payload)
	if binding.SystemDefault {
		body["model"] = a.sub2APIChatModelForBinding(ctx, binding, body["model"])
	}
	return a.callSub2APIChatCompletionsWithBody(ctx, body, binding)
}

func (a *App) callSub2APIChatCompletionsWithBody(ctx context.Context, body map[string]any, binding service.Sub2APIBinding) (map[string]any, error) {
	return a.postSub2APIJSON(ctx, binding, "chat/completions", body)
}

func (a *App) callSub2APIImageGenerations(ctx context.Context, identity service.Identity, payload map[string]any, binding service.Sub2APIBinding) (map[string]any, error) {
	if sub2APIUsesMidjourneyGateway(payload) {
		return a.callSub2APIImageBatchesWithBinding(ctx, identity, payload, binding, func(ctx context.Context, batchPayload map[string]any) (map[string]any, error) {
			body, err := sub2APIMidjourneyImageGatewayPayload(batchPayload)
			if err != nil {
				return nil, err
			}
			return a.postSub2APIJSON(ctx, binding, "midjourney/generations", body)
		})
	}
	if sub2APIUsesGrokImagineGateway(payload) && sub2APIGrokImaginePayloadNeedsEdit(payload) {
		return a.callSub2APIImageBatchesWithBinding(ctx, identity, payload, binding, func(ctx context.Context, batchPayload map[string]any) (map[string]any, error) {
			body, err := sub2APIGrokImagineImageGatewayPayload(batchPayload, true)
			if err != nil {
				return nil, err
			}
			body["response_format"] = "b64_json"
			return a.postSub2APIJSON(ctx, binding, "images/edits", body)
		})
	}
	return a.callSub2APIImageBatchesWithBinding(ctx, identity, payload, binding, func(ctx context.Context, batchPayload map[string]any) (map[string]any, error) {
		body, err := sub2APIImageGatewayJSONPayload(batchPayload)
		if err != nil {
			return nil, err
		}
		body["response_format"] = "b64_json"
		return a.postSub2APIJSON(ctx, binding, "images/generations", body)
	})
}

func (a *App) callSub2APIImageEdits(ctx context.Context, identity service.Identity, payload map[string]any, binding service.Sub2APIBinding) (map[string]any, error) {
	if prepared, err := sub2APIPrepareOfficialImageEditPayload(ctx, payload); err != nil {
		return nil, err
	} else {
		payload = prepared
	}
	if sub2APIUsesMidjourneyGateway(payload) {
		return a.callSub2APIImageBatchesWithBinding(ctx, identity, payload, binding, func(ctx context.Context, batchPayload map[string]any) (map[string]any, error) {
			body, err := sub2APIMidjourneyImageGatewayPayload(batchPayload)
			if err != nil {
				return nil, err
			}
			return a.postSub2APIJSON(ctx, binding, "midjourney/generations", body)
		})
	}
	if sub2APIUsesGrokImagineGateway(payload) {
		return a.callSub2APIImageBatchesWithBinding(ctx, identity, payload, binding, func(ctx context.Context, batchPayload map[string]any) (map[string]any, error) {
			body, err := sub2APIGrokImagineImageGatewayPayload(batchPayload, true)
			if err != nil {
				return nil, err
			}
			body["response_format"] = "b64_json"
			return a.postSub2APIJSON(ctx, binding, "images/edits", body)
		})
	}
	if sub2APIUsesImageGenerationsJSONGateway(payload) && sub2APIImageEditSupportsJSONGateway(payload) {
		return a.callSub2APIImageBatchesWithBinding(ctx, identity, payload, binding, func(ctx context.Context, batchPayload map[string]any) (map[string]any, error) {
			body, err := sub2APIImageGatewayJSONPayload(batchPayload)
			if err != nil {
				return nil, err
			}
			body["response_format"] = "b64_json"
			return a.postSub2APIJSON(ctx, binding, "images/generations", body)
		})
	}
	if sub2APIUsesOfficialImageGateway(payload) {
		return nil, sub2APIOfficialPublicReferenceError()
	}
	if len(util.AsStringSlice(payload["official_public_image_urls"])) > 0 && len(nonEmptyUploadedImagesFromPayload(payload["images"])) == 0 {
		return a.callSub2APIImageBatchesWithBinding(ctx, identity, payload, binding, func(ctx context.Context, batchPayload map[string]any) (map[string]any, error) {
			body := sub2APIImageJSONPayload(batchPayload)
			body["response_format"] = "b64_json"
			return a.postSub2APIJSON(ctx, binding, "images/generations", body)
		})
	}
	images := uploadedImagesFromPayload(payload["images"])
	if len(images) == 0 {
		return nil, protocol.HTTPError{Status: http.StatusBadRequest, Message: "image file is required"}
	}
	return a.callSub2APIImageBatchesWithBinding(ctx, identity, payload, binding, func(ctx context.Context, batchPayload map[string]any) (map[string]any, error) {
		var buf bytes.Buffer
		writer := multipart.NewWriter(&buf)
		for key, value := range sub2APIRequestBodyWithGroup(binding, sub2APIImageMultipartPayload(batchPayload)) {
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

func sub2APIPrepareOfficialImageEditPayload(ctx context.Context, payload map[string]any) (map[string]any, error) {
	if !sub2APIUsesOfficialImageGateway(payload) || len(nonEmptyUploadedImagesFromPayload(payload["images"])) == 0 {
		return payload, nil
	}
	publicURLs := sub2APIOfficialPublicImageURLs(payload)
	images := nonEmptyUploadedImagesFromPayload(payload["images"])
	uploadedURLs, err := sub2APIUploadOfficialReferenceImages(ctx, images)
	if err != nil {
		return nil, err
	}
	publicURLs = dedupe(append(publicURLs, uploadedURLs...))
	if len(publicURLs) == 0 {
		return nil, sub2APIOfficialPublicReferenceError()
	}
	prepared := util.CopyMap(payload)
	prepared["official_public_image_urls"] = publicURLs
	prepared["images"] = make([]protocol.UploadedImage, len(publicURLs))
	return prepared, nil
}

func sub2APIUploadOfficialReferenceImages(ctx context.Context, images []protocol.UploadedImage) ([]string, error) {
	store, enabled, err := imagestore.NewFromEnv(ctx)
	if err != nil {
		return nil, fmt.Errorf("准备官方参考图对象存储失败：%w", err)
	}
	if !enabled {
		return nil, sub2APIOfficialPublicReferenceError()
	}
	urls := make([]string, 0, len(images))
	now := time.Now().UTC()
	for index, image := range images {
		if len(image.Data) == 0 {
			continue
		}
		contentType := sub2APIImageContentType(image)
		rel := path.Join("official-references", now.Format("2006/01/02"), fmt.Sprintf("%d_%s%s", now.UnixNano(), util.NewHex(12), sub2APIImageExtension(image)))
		key, err := store.ObjectKey(rel)
		if err != nil {
			return nil, fmt.Errorf("准备官方参考图对象路径失败：%w", err)
		}
		if _, err := store.UploadBytes(ctx, key, image.Data, contentType); err != nil {
			return nil, fmt.Errorf("上传官方参考图到对象存储失败：%w", err)
		}
		u, err := store.PresignGetDownloadURL(ctx, key, 30*time.Minute, firstNonEmpty(image.Filename, fmt.Sprintf("reference-%d%s", index+1, sub2APIImageExtension(image))))
		if err != nil {
			return nil, fmt.Errorf("签名官方参考图对象链接失败：%w", err)
		}
		if url := sub2APIOfficialPublicURL(u); url != "" {
			urls = append(urls, url)
		}
	}
	return dedupe(urls), nil
}

func sub2APIImageExtension(image protocol.UploadedImage) string {
	switch strings.ToLower(strings.TrimSpace(sub2APIImageContentType(image))) {
	case "image/jpeg", "image/jpg":
		return ".jpg"
	case "image/webp":
		return ".webp"
	case "image/gif":
		return ".gif"
	default:
		return ".png"
	}
}

const (
	sub2APIImageBatchLimit         = 10
	sub2APIOfficialImageBatchLimit = 4
)

const (
	sub2APIImageTaskPollInitialDelay = 500 * time.Millisecond
	sub2APIImageTaskPollInterval     = 3 * time.Second
)

func (a *App) callSub2APIImageBatches(ctx context.Context, identity service.Identity, payload map[string]any, call func(context.Context, map[string]any) (map[string]any, error)) (map[string]any, error) {
	return a.callSub2APIImageBatchesWithBinding(ctx, identity, payload, service.Sub2APIBinding{}, call)
}

func (a *App) callSub2APIImageBatchesWithBinding(ctx context.Context, identity service.Identity, payload map[string]any, binding service.Sub2APIBinding, call func(context.Context, map[string]any) (map[string]any, error)) (map[string]any, error) {
	requested := sub2APIImageRequestedCount(payload)
	batchSize := sub2APIImageBatchSize(payload)
	progress := sub2APIImageProgressCallback(payload)
	acquire := sub2APIImageOutputSlotAcquirer(payload)
	model := sub2APIImageModel(payload["model"])
	created := time.Now().Unix()
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	batches := sub2APIImageBatchRequests(requested, batchSize)
	results := make([]sub2APIImageBatchOutput, 0, len(batches))
	for _, batch := range batches {
		result := a.callSub2APIImageBatch(ctx, identity, payload, binding, call, acquire, batch.index, batch.count)
		results = append(results, result)
		if result.err != nil {
			cancel()
			return sub2APIImageBatchResult(created, sub2APIIndexedImageData(results, true, requested), model), result.err
		}
		if result.created != 0 && (created == 0 || result.created < created) {
			created = result.created
		}
		if progress != nil {
			data := sub2APIIndexedImageData(results, true, requested)
			if len(data) > 0 {
				progress(data)
			}
		}
	}
	out := sub2APIImageBatchResult(created, sub2APIIndexedImageData(results, false, requested), model)
	if amount, unit := sub2APIImageBatchBillingFields(results); amount > 0 && unit != "" {
		out["external_billing_consumed_amount"] = amount
		out["external_billing_amount_unit"] = unit
	}
	return out, nil
}

type sub2APIImageBatchRequest struct {
	index int
	count int
}

func sub2APIImageBatchRequests(requested, batchSize int) []sub2APIImageBatchRequest {
	if requested < 1 {
		requested = 1
	}
	if batchSize < 1 {
		batchSize = requested
	}
	requests := make([]sub2APIImageBatchRequest, 0, (requested+batchSize-1)/batchSize)
	for index := 1; index <= requested; index += batchSize {
		count := batchSize
		if remaining := requested - index + 1; remaining < count {
			count = remaining
		}
		requests = append(requests, sub2APIImageBatchRequest{index: index, count: count})
	}
	return requests
}

type sub2APIImageBatchOutput struct {
	index             int
	created           int64
	data              []map[string]any
	billingAmount     float64
	billingAmountUnit string
	err               error
}

func (a *App) callSub2APIImageBatch(ctx context.Context, identity service.Identity, payload map[string]any, binding service.Sub2APIBinding, call func(context.Context, map[string]any) (map[string]any, error), acquire protocol.ImageOutputSlotAcquirer, index int, count int) sub2APIImageBatchOutput {
	out := sub2APIImageBatchOutput{index: index}
	batchPayload := util.CopyMap(payload)
	batchPayload["n"] = count
	release, err := sub2APIAcquireBatchSlots(ctx, acquire, index, count)
	if err != nil {
		out.err = err
		return out
	}
	defer release()
	result, err := call(ctx, batchPayload)
	if err != nil {
		out.err = err
		return out
	}
	formatted, err := a.formatSub2APIImageResult(ctx, result, identity, batchPayload, binding)
	if err != nil {
		out.err = err
		return out
	}
	out.created = int64(util.ToInt(formatted["created"], int(time.Now().Unix())))
	out.data = util.AsMapSlice(formatted["data"])
	out.billingAmount = sub2APIBillingAmount(formatted["external_billing_consumed_amount"])
	out.billingAmountUnit = service.ImageTaskAmountUnitAPIMartCost
	if out.billingAmount <= 0 || util.Clean(formatted["external_billing_amount_unit"]) != service.ImageTaskAmountUnitAPIMartCost {
		out.billingAmountUnit = ""
	}
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

func sub2APIImageBatchResult(created int64, data []map[string]any, model string) map[string]any {
	if data == nil {
		data = []map[string]any{}
	}
	return map[string]any{"created": created, "data": data, "model": model}
}

func sub2APIImageBatchBillingFields(results []sub2APIImageBatchOutput) (float64, string) {
	total := 0.0
	unit := ""
	for _, result := range results {
		if result.err != nil || result.billingAmount <= 0 || result.billingAmountUnit == "" {
			continue
		}
		if unit == "" {
			unit = result.billingAmountUnit
		}
		if unit != result.billingAmountUnit {
			return 0, ""
		}
		total += result.billingAmount
	}
	return total, unit
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

func sub2APIImageBatchSize(payload map[string]any) int {
	limit := sub2APIImageBatchLimit
	if sub2APIImageModel(payload["model"]) == util.ImageModelGPTOfficial {
		limit = sub2APIOfficialImageBatchLimit
	}
	if configured := service.ImageOutputBatchLimit(payload); configured > 0 && configured < limit {
		limit = configured
	}
	return limit
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

func sub2APIImageGatewayJSONPayload(payload map[string]any) (map[string]any, error) {
	if sub2APIUsesMidjourneyGateway(payload) {
		return sub2APIMidjourneyImageGatewayPayload(payload)
	}
	if sub2APIUsesGrokImagineGateway(payload) {
		return sub2APIGrokImagineImageGatewayPayload(payload, sub2APIGrokImaginePayloadNeedsEdit(payload))
	}
	if sub2APIUsesOfficialImageGateway(payload) {
		return sub2APIOfficialImageGatewayPayload(payload)
	}
	if sub2APIUsesGeminiImageGateway(payload) {
		return sub2APIGeminiImageGatewayPayload(payload), nil
	}
	if sub2APIUsesSeedreamGateway(payload) {
		return sub2APISeedreamImageGatewayPayload(payload), nil
	}
	return sub2APIImageJSONPayload(payload), nil
}

func sub2APIUsesImageGenerationsJSONGateway(payload map[string]any) bool {
	return sub2APIUsesOfficialImageGateway(payload) || sub2APIUsesGeminiImageGateway(payload) || sub2APIUsesMidjourneyGateway(payload) || sub2APIUsesGrokImagineGateway(payload) || sub2APIUsesSeedreamGateway(payload)
}

func sub2APIImageEditSupportsJSONGateway(payload map[string]any) bool {
	model := sub2APIImageModel(payload["model"])
	if model != util.ImageModelGPTOfficial {
		return true
	}
	if len(nonEmptyUploadedImagesFromPayload(payload["images"])) > 0 {
		return false
	}
	if len(util.AsStringSlice(payload["reference_image_ids"])) > 0 {
		return false
	}
	rawURLs := sub2APIImageURLReferences(payload)
	if len(rawURLs) == 0 {
		return true
	}
	return len(publicJSONImageURLs(rawURLs)) == len(rawURLs)
}

func nonEmptyUploadedImagesFromPayload(value any) []protocol.UploadedImage {
	images := uploadedImagesFromPayload(value)
	out := make([]protocol.UploadedImage, 0, len(images))
	for _, image := range images {
		if len(image.Data) > 0 {
			out = append(out, image)
		}
	}
	return out
}

func sub2APIUsesOfficialImageGateway(payload map[string]any) bool {
	return sub2APIImageModel(payload["model"]) == util.ImageModelGPTOfficial
}

func sub2APIUsesGeminiImageGateway(payload map[string]any) bool {
	switch sub2APIImageModel(payload["model"]) {
	case util.ImageModelGeminiProPreview,
		util.ImageModelGeminiProPreviewOfficial,
		util.ImageModelGeminiFlashPreview,
		util.ImageModelGeminiFlashPreviewOfficial:
		return true
	default:
		return false
	}
}

func sub2APIUsesMidjourneyGateway(payload map[string]any) bool {
	return sub2APIImageModel(payload["model"]) == util.ImageModelMidjourney
}

func sub2APIUsesGrokImagineGateway(payload map[string]any) bool {
	return sub2APIImageModel(payload["model"]) == util.ImageModelGrokImagine
}

func sub2APIUsesSeedreamGateway(payload map[string]any) bool {
	switch sub2APIImageModel(payload["model"]) {
	case util.ImageModelSeedream40, util.ImageModelSeedream45:
		return true
	default:
		return false
	}
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
	for _, key := range []string{"background", "moderation", "style", "partial_images", "input_image_mask"} {
		if value := payload[key]; value != nil && util.Clean(value) != "" {
			out[key] = value
		}
	}
	if _, ok := payload["output_format"]; ok {
		outputFormat := service.NormalizeImageOutputFormat(util.Clean(payload["output_format"]))
		out["output_format"] = outputFormat
		if service.SupportsImageOutputCompression(outputFormat) {
			if compression, ok := service.NormalizeImageOutputCompressionValue(payload["output_compression"]); ok {
				out["output_compression"] = compression
			}
		}
	}
	if urls := sub2APIImageURLs(payload); len(urls) > 0 {
		out["image_urls"] = urls
	}
	for key, value := range out {
		if value == "" {
			delete(out, key)
		}
	}
	return out
}

func sub2APIImageMultipartPayload(payload map[string]any) map[string]any {
	out := sub2APIImageJSONPayload(payload)
	delete(out, "image_urls")
	return out
}

func sub2APISeedreamImageGatewayPayload(payload map[string]any) map[string]any {
	out := sub2APIImageJSONPayload(payload)
	delete(out, "quality")
	delete(out, "background")
	delete(out, "moderation")
	delete(out, "style")
	delete(out, "partial_images")
	delete(out, "input_image_mask")
	delete(out, "official_fallback")
	if resolution := sub2APIImageResolution(payload); resolution != "" {
		out["resolution"] = strings.ToLower(resolution)
	} else {
		delete(out, "resolution")
	}
	if urls := sub2APISeedreamImageURLs(payload); len(urls) > 0 {
		out["image_urls"] = urls
	}
	for _, key := range []string{"watermark", "optimize_prompt_options", "sequential_image_generation", "sequential_image_generation_options"} {
		if value := payload[key]; value != nil && util.Clean(value) != "" {
			out[key] = value
		}
	}
	return out
}

func sub2APIGeminiImageGatewayPayload(payload map[string]any) map[string]any {
	out := sub2APIImageJSONPayload(payload)
	delete(out, "quality")
	delete(out, "background")
	delete(out, "moderation")
	delete(out, "style")
	delete(out, "partial_images")
	delete(out, "input_image_mask")
	if size := sub2APIGeminiImageSize(payload); size != "" {
		out["size"] = size
	} else {
		delete(out, "size")
	}
	if resolution := sub2APIGeminiImageResolution(payload); resolution != "" {
		out["resolution"] = resolution
	} else {
		delete(out, "resolution")
	}
	if sub2APIGeminiOfficialModel(payload["model"]) {
		delete(out, "official_fallback")
	}
	if urls := sub2APIGeminiImageURLs(payload); len(urls) > 0 {
		out["image_urls"] = urls
	}
	if maskURL := sub2APIGeminiMaskURL(payload); maskURL != "" {
		out["mask_url"] = maskURL
	}
	if sub2APIGeminiFlashModel(payload["model"]) {
		for _, key := range []string{"google_search", "google_image_search"} {
			if _, ok := payload[key]; ok {
				out[key] = util.ToBool(payload[key])
			}
		}
	}
	return out
}

func sub2APIMidjourneyImageGatewayPayload(payload map[string]any) (map[string]any, error) {
	out := map[string]any{
		"model":  util.ImageModelMidjourney,
		"prompt": util.Clean(payload["prompt"]),
		"n":      sub2APIMidjourneyImagePayloadCount(payload),
	}
	if size := sub2APIMidjourneyImageSize(payload); size != "" {
		out["size"] = size
	}
	if urls := sub2APIMidjourneyImageURLs(payload); len(urls) > 0 {
		if len(urls) > sub2APIMidjourneyReferenceLimit {
			return nil, sub2APIMidjourneyReferenceLimitError()
		}
		out["image_urls"] = urls
	}
	settings := normalizeMidjourneySettings(payload["midjourney_settings"], true)
	for _, key := range []string{
		"version", "speed", "quality", "style", "seed", "negative_prompt",
		"stylize", "chaos", "weird", "iw", "cw", "sw", "dw",
		"cref", "sref", "dref", "repeat", "extra",
		"stop", "niji", "raw", "tile", "draft", "hd",
	} {
		if value, ok := settings[key]; ok {
			out[key] = value
		}
	}
	for key, value := range out {
		if value == "" {
			delete(out, key)
		}
	}
	return out, nil
}

const sub2APIMidjourneyReferenceLimit = 4

const sub2APIGrokImagineReferenceLimit = 1

const sub2APISeedreamInputOutputLimit = 15

func sub2APIGrokImagineImageGatewayPayload(payload map[string]any, edit bool) (map[string]any, error) {
	out := map[string]any{
		"model":  sub2APIGrokImagineUpstreamModel(edit),
		"prompt": util.Clean(payload["prompt"]),
		"n":      sub2APIGrokImagineImagePayloadCount(payload),
	}
	if size := sub2APIGrokImagineImageSize(payload); size != "" {
		out["size"] = size
	}
	urls := sub2APIGrokImagineImageURLs(payload)
	if edit {
		if len(urls) == 0 {
			return nil, protocol.HTTPError{Status: http.StatusBadRequest, Message: "Grok Imagine 参考图不能为空"}
		}
		if len(urls) > sub2APIGrokImagineReferenceLimit {
			return nil, sub2APIGrokImagineReferenceLimitError()
		}
		out["image_urls"] = urls
	}
	for key, value := range out {
		if value == "" {
			delete(out, key)
		}
	}
	return out, nil
}

func sub2APIGrokImagineUpstreamModel(edit bool) string {
	if edit {
		return "grok-imagine-1.5-edit-apimart"
	}
	return "grok-imagine-1.5-apimart"
}

func sub2APIGrokImagineImagePayloadCount(payload map[string]any) int {
	count := util.ToInt(payload["n"], 1)
	if count < 1 {
		return 1
	}
	if count > sub2APIImageBatchLimit {
		return sub2APIImageBatchLimit
	}
	return count
}

func sub2APIGrokImagineImageSize(payload map[string]any) string {
	size := firstNonEmpty(util.Clean(payload["size"]), util.Clean(payload["requested_size"]))
	size = protocol.NormalizeImageGenerationSize(size)
	normalized := strings.ToLower(strings.TrimSpace(size))
	if normalized == "" || normalized == "auto" {
		return "1:1"
	}
	return normalized
}

func sub2APIGrokImagineImageURLs(payload map[string]any) []string {
	urls := make([]string, 0, sub2APIGrokImagineReferenceLimit)
	appendURL := func(value string) {
		if value = strings.TrimSpace(value); value != "" {
			urls = append(urls, value)
		}
	}
	for _, url := range util.AsStringSlice(payload["official_public_image_urls"]) {
		appendURL(url)
	}
	for _, url := range util.AsStringSlice(payload["image_urls"]) {
		appendURL(url)
	}
	appendURL(util.Clean(payload["image_url"]))
	for _, image := range uploadedImagesFromPayload(payload["images"]) {
		appendURL(sub2APIUploadedImageDataURL(image))
	}
	return dedupe(urls)
}

func sub2APIGrokImaginePayloadNeedsEdit(payload map[string]any) bool {
	return len(sub2APIGrokImagineImageURLs(payload)) > 0 ||
		len(util.AsStringSlice(payload["reference_image_ids"])) > 0 ||
		payload["image"] != nil
}

func sub2APIGrokImagineReferenceLimitError() error {
	return protocol.HTTPError{Status: http.StatusBadRequest, Message: "Grok Imagine 参考图最多支持 1 张"}
}

func sub2APIImageURLs(payload map[string]any) []string {
	return sub2APIImageURLReferences(payload)
}

func sub2APIImageURLReferences(payload map[string]any) []string {
	urls := make([]string, 0, 16)
	appendURL := func(value string) {
		if value = strings.TrimSpace(value); value != "" {
			urls = append(urls, value)
		}
	}
	for _, url := range util.AsStringSlice(payload["official_public_image_urls"]) {
		appendURL(url)
	}
	for _, url := range util.AsStringSlice(payload["image_urls"]) {
		appendURL(url)
	}
	appendURL(util.Clean(payload["image_url"]))
	for _, image := range uploadedImagesFromPayload(payload["images"]) {
		appendURL(sub2APIUploadedImageDataURL(image))
	}
	return dedupe(urls)
}

func sub2APISeedreamImageURLs(payload map[string]any) []string {
	return sub2APIImageURLs(payload)
}

func sub2APIMidjourneyImagePayloadCount(payload map[string]any) int {
	count := util.ToInt(payload["n"], 1)
	if count < 1 {
		return 1
	}
	if count > sub2APIImageBatchLimit {
		return sub2APIImageBatchLimit
	}
	return count
}

func sub2APIMidjourneyImageSize(payload map[string]any) string {
	size := firstNonEmpty(util.Clean(payload["size"]), util.Clean(payload["requested_size"]))
	size = protocol.NormalizeImageGenerationSize(size)
	normalized := strings.ToLower(strings.TrimSpace(size))
	if normalized == "" || normalized == "auto" {
		return ""
	}
	if sub2APIImageRatioSize(normalized) {
		return normalized
	}
	switch normalized {
	case "1024x1024", "2048x2048":
		return "1:1"
	case "1536x864", "2048x1152":
		return "16:9"
	case "864x1536", "1152x2048":
		return "9:16"
	default:
		return normalized
	}
}

func sub2APIMidjourneyImageURLs(payload map[string]any) []string {
	urls := make([]string, 0, sub2APIMidjourneyReferenceLimit)
	appendURL := func(value string) {
		if value = strings.TrimSpace(value); value != "" {
			urls = append(urls, value)
		}
	}
	for _, url := range util.AsStringSlice(payload["official_public_image_urls"]) {
		appendURL(url)
	}
	for _, url := range util.AsStringSlice(payload["image_urls"]) {
		appendURL(url)
	}
	appendURL(util.Clean(payload["image_url"]))
	for _, image := range uploadedImagesFromPayload(payload["images"]) {
		appendURL(sub2APIUploadedImageDataURL(image))
	}
	return dedupe(urls)
}

func sub2APIMidjourneyReferenceLimitError() error {
	return protocol.HTTPError{Status: http.StatusBadRequest, Message: "Midjourney 参考图最多支持 4 张"}
}

func sub2APIOfficialImageGatewayPayload(payload map[string]any) (map[string]any, error) {
	out := map[string]any{
		"model":  sub2APIImageModel(payload["model"]),
		"prompt": util.Clean(payload["prompt"]),
		"n":      sub2APIOfficialImagePayloadCount(payload),
		"size":   sub2APIOfficialImageSize(payload),
	}
	if resolution := sub2APIImageResolution(payload); resolution != "" {
		out["resolution"] = resolution
	}
	if quality := util.Clean(payload["quality"]); quality != "" {
		out["quality"] = quality
	}
	if _, ok := payload["official_fallback"]; ok {
		out["official_fallback"] = util.ToBool(payload["official_fallback"])
	}
	for _, key := range []string{"background", "moderation", "style", "partial_images"} {
		if value := payload[key]; value != nil && util.Clean(value) != "" {
			out[key] = value
		}
	}
	if _, ok := payload["output_format"]; ok {
		outputFormat := service.NormalizeImageOutputFormat(util.Clean(payload["output_format"]))
		out["output_format"] = outputFormat
		if sub2APIOfficialImageOutputCompressionSupported(outputFormat) {
			if compression, ok := service.NormalizeImageOutputCompressionValue(firstNonNil(payload["output_compression"], payload["raw_output_compression"])); ok {
				out["output_compression"] = compression
			}
		}
	}
	imageURLs := sub2APIOfficialPublicImageURLs(payload)
	if sub2APIOfficialPayloadNeedsImageURLs(payload) {
		if len(imageURLs) == 0 {
			return nil, sub2APIOfficialPublicReferenceError()
		}
		out["image_urls"] = imageURLs
	}
	if sub2APIOfficialPayloadNeedsMaskURL(payload) {
		maskURL := sub2APIOfficialPublicMaskURL(payload)
		if maskURL == "" {
			return nil, sub2APIOfficialPublicReferenceError()
		}
		out["mask_url"] = maskURL
	}
	for key, value := range out {
		if value == "" {
			delete(out, key)
		}
	}
	return out, nil
}

func sub2APIOfficialImagePayloadCount(payload map[string]any) int {
	count := util.ToInt(payload["n"], 1)
	if count < 1 {
		return 1
	}
	if count > sub2APIOfficialImageBatchLimit {
		return sub2APIOfficialImageBatchLimit
	}
	return count
}

func sub2APIImageSize(payload map[string]any) string {
	size := firstNonEmpty(util.Clean(payload["size"]), util.Clean(payload["requested_size"]), util.Clean(payload["image_resolution"]))
	size = protocol.NormalizeImageGenerationSize(size)
	switch strings.ToLower(strings.TrimSpace(size)) {
	case "8x8", "16x16", "32x32", "64x64", "128x128":
		return "1:1"
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

func sub2APIGeminiImageSize(payload map[string]any) string {
	size := firstNonEmpty(util.Clean(payload["size"]), util.Clean(payload["requested_size"]))
	size = protocol.NormalizeImageGenerationSize(size)
	normalized := strings.ToLower(strings.TrimSpace(size))
	if normalized == "" {
		return "auto"
	}
	if normalized == "auto" || sub2APIGeminiImageSizeSupported(payload["model"], normalized) {
		return normalized
	}
	return "auto"
}

func sub2APIGeminiImageSizeSupported(model any, size string) bool {
	normalized := strings.ToLower(strings.TrimSpace(size))
	common := map[string]struct{}{
		"1:1":  {},
		"3:2":  {},
		"2:3":  {},
		"4:3":  {},
		"3:4":  {},
		"16:9": {},
		"9:16": {},
		"5:4":  {},
		"4:5":  {},
		"21:9": {},
	}
	if _, ok := common[normalized]; ok {
		return true
	}
	if !sub2APIGeminiFlashModel(model) {
		return false
	}
	switch normalized {
	case "1:4", "4:1", "1:8", "8:1":
		return true
	default:
		return false
	}
}

var sub2APIOfficialImageSizes = map[string]struct{}{
	"auto": {},
	"1:1":  {},
	"3:2":  {},
	"2:3":  {},
	"4:3":  {},
	"3:4":  {},
	"5:4":  {},
	"4:5":  {},
	"16:9": {},
	"9:16": {},
	"2:1":  {},
	"1:2":  {},
	"3:1":  {},
	"1:3":  {},
	"21:9": {},
	"9:21": {},
}

func sub2APIOfficialImageSize(payload map[string]any) string {
	size := firstNonEmpty(util.Clean(payload["size"]), util.Clean(payload["requested_size"]))
	size = protocol.NormalizeImageGenerationSize(size)
	normalized := strings.ToLower(strings.TrimSpace(size))
	switch normalized {
	case "8x8", "16x16", "32x32", "64x64", "128x128":
		return "1:1"
	case "":
		return "auto"
	default:
		if _, ok := sub2APIOfficialImageSizes[normalized]; ok {
			return normalized
		}
		if size, ok := sub2APIOfficialEquivalentImageRatio(normalized); ok {
			return size
		}
		if sub2APIImageDimensionSize(normalized) {
			return normalized
		}
		return "auto"
	}
}

func sub2APIOfficialEquivalentImageRatio(size string) (string, bool) {
	match := regexp.MustCompile(`^(\d+):(\d+)$`).FindStringSubmatch(strings.ToLower(strings.TrimSpace(size)))
	if len(match) != 3 {
		return "", false
	}
	width := util.ToInt(match[1], 0)
	height := util.ToInt(match[2], 0)
	if width <= 0 || height <= 0 {
		return "", false
	}
	for supported := range sub2APIOfficialImageSizes {
		supportedMatch := regexp.MustCompile(`^(\d+):(\d+)$`).FindStringSubmatch(supported)
		if len(supportedMatch) != 3 {
			continue
		}
		supportedWidth := util.ToInt(supportedMatch[1], 0)
		supportedHeight := util.ToInt(supportedMatch[2], 0)
		if supportedWidth > 0 && supportedHeight > 0 && width*supportedHeight == height*supportedWidth {
			return supported, true
		}
	}
	return "", false
}

func sub2APIImageRatioSize(size string) bool {
	match := regexp.MustCompile(`^(\d+):(\d+)$`).FindStringSubmatch(strings.ToLower(strings.TrimSpace(size)))
	if len(match) != 3 {
		return false
	}
	return util.ToInt(match[1], 0) > 0 && util.ToInt(match[2], 0) > 0
}

func sub2APIImageDimensionSize(size string) bool {
	match := regexp.MustCompile(`^(\d+)x(\d+)$`).FindStringSubmatch(strings.ToLower(strings.TrimSpace(size)))
	if len(match) != 3 {
		return false
	}
	return util.ToInt(match[1], 0) > 0 && util.ToInt(match[2], 0) > 0
}

func sub2APIImageResolution(payload map[string]any) string {
	resolution := service.NormalizeImageResolutionPreset(firstNonEmpty(util.Clean(payload["resolution"]), util.Clean(payload["image_resolution"])))
	switch resolution {
	case "1080p":
		return "1k"
	case "2k", "4k":
		return resolution
	default:
		return ""
	}
}

func sub2APIGeminiImageResolution(payload map[string]any) string {
	value := firstNonEmpty(util.Clean(payload["resolution"]), util.Clean(payload["image_resolution"]))
	resolution := service.NormalizeImageResolutionPreset(value)
	switch resolution {
	case "1080p":
		return "1K"
	case "2k":
		return "2K"
	case "4k":
		return "4K"
	default:
		if strings.EqualFold(strings.TrimSpace(value), "0.5K") && sub2APIGeminiFlashModel(payload["model"]) {
			return "0.5K"
		}
		return ""
	}
}

func sub2APIGeminiFlashModel(model any) bool {
	switch sub2APIImageModel(model) {
	case util.ImageModelGeminiFlashPreview, util.ImageModelGeminiFlashPreviewOfficial:
		return true
	default:
		return false
	}
}

func sub2APIGeminiOfficialModel(model any) bool {
	switch sub2APIImageModel(model) {
	case util.ImageModelGeminiProPreviewOfficial, util.ImageModelGeminiFlashPreviewOfficial:
		return true
	default:
		return false
	}
}

func sub2APIOfficialImageOutputCompressionSupported(format string) bool {
	switch service.NormalizeImageOutputFormat(format) {
	case "jpeg", "webp":
		return true
	default:
		return false
	}
}

func sub2APIGeminiImageURLs(payload map[string]any) []string {
	urls := make([]string, 0, 4)
	appendURL := func(value string) {
		if value = strings.TrimSpace(value); value != "" {
			urls = append(urls, value)
		}
	}
	for _, url := range util.AsStringSlice(payload["official_public_image_urls"]) {
		appendURL(url)
	}
	for _, url := range util.AsStringSlice(payload["image_urls"]) {
		appendURL(url)
	}
	appendURL(util.Clean(payload["image_url"]))
	for _, image := range uploadedImagesFromPayload(payload["images"]) {
		appendURL(sub2APIUploadedImageDataURL(image))
	}
	return dedupe(urls)
}

func sub2APIGeminiMaskURL(payload map[string]any) string {
	return firstNonEmpty(util.Clean(payload["mask_url"]), util.Clean(payload["input_image_mask"]))
}

func sub2APIOfficialPayloadNeedsImageURLs(payload map[string]any) bool {
	return len(uploadedImagesFromPayload(payload["images"])) > 0 ||
		len(util.AsStringSlice(payload["reference_image_ids"])) > 0 ||
		len(util.AsStringSlice(payload["official_public_image_urls"])) > 0 ||
		len(util.AsStringSlice(payload["image_urls"])) > 0 ||
		util.Clean(payload["image_url"]) != "" ||
		payload["image"] != nil
}

func sub2APIOfficialPayloadNeedsMaskURL(payload map[string]any) bool {
	return util.Clean(payload["input_image_mask"]) != "" || util.Clean(payload["mask_url"]) != ""
}

func sub2APIOfficialPublicImageURLs(payload map[string]any) []string {
	urls := make([]string, 0, 4)
	appendURL := func(value string) {
		if url := sub2APIOfficialPublicURL(value); url != "" {
			urls = append(urls, url)
		}
	}
	for _, url := range util.AsStringSlice(payload["official_public_image_urls"]) {
		appendURL(url)
	}
	for _, url := range util.AsStringSlice(payload["image_urls"]) {
		appendURL(url)
	}
	appendURL(util.Clean(payload["image_url"]))
	for _, key := range []string{"image", "images"} {
		appendOfficialPublicURLsFromValue(&urls, payload[key])
	}
	return dedupe(urls)
}

func appendOfficialPublicURLsFromValue(urls *[]string, value any) {
	switch typed := value.(type) {
	case []any:
		for _, item := range typed {
			appendOfficialPublicURLsFromValue(urls, item)
		}
	case []map[string]any:
		for _, item := range typed {
			appendOfficialPublicURLsFromValue(urls, item)
		}
	case []string:
		for _, item := range typed {
			if url := sub2APIOfficialPublicURL(item); url != "" {
				*urls = append(*urls, url)
			}
		}
	case string:
		if url := sub2APIOfficialPublicURL(typed); url != "" {
			*urls = append(*urls, url)
		}
	case map[string]any:
		for _, key := range []string{"url", "image_url", "public_url"} {
			if url := sub2APIOfficialPublicURL(util.Clean(typed[key])); url != "" {
				*urls = append(*urls, url)
			}
			nested := util.StringMap(typed[key])
			for _, nestedKey := range []string{"url", "image_url", "public_url"} {
				if url := sub2APIOfficialPublicURL(util.Clean(nested[nestedKey])); url != "" {
					*urls = append(*urls, url)
				}
			}
		}
	}
}

func sub2APIOfficialPublicMaskURL(payload map[string]any) string {
	for _, value := range []string{util.Clean(payload["mask_url"]), util.Clean(payload["input_image_mask"])} {
		if url := sub2APIOfficialPublicURL(value); url != "" {
			return url
		}
	}
	return ""
}

func sub2APIOfficialPublicURL(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	parsed, err := url.Parse(value)
	if err != nil {
		return ""
	}
	switch strings.ToLower(parsed.Scheme) {
	case "http", "https":
		if parsed.Host != "" {
			return value
		}
	}
	return ""
}

func sub2APIOfficialPublicReferenceError() error {
	return protocol.HTTPError{Status: http.StatusBadRequest, Message: "官方图生图需要可公开访问的参考图链接，请配置公开图片访问后重试"}
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

func sub2APIUploadedImageDataURL(image protocol.UploadedImage) string {
	if len(image.Data) == 0 {
		return ""
	}
	contentType := sub2APIImageContentType(image)
	return "data:" + contentType + ";base64," + base64.StdEncoding.EncodeToString(image.Data)
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

func (a *App) sub2APIChatModelForBinding(ctx context.Context, binding service.Sub2APIBinding, requested any) string {
	model := sub2APIChatModel(requested)
	if !binding.Valid() {
		return model
	}
	items, ok := a.sub2APIModelOptionsForBinding(ctx, binding, "chat")
	if !ok {
		return model
	}
	chatModels := make([]canvasModelOption, 0, len(items))
	for _, item := range items {
		if item.Enabled && canvasModelOptionHasCapability(item, "chat") {
			chatModels = append(chatModels, item)
		}
	}
	if len(chatModels) == 0 {
		return model
	}
	requestedModel := util.Clean(requested)
	if requestedModel != "" && requestedModel != util.ImageModelAuto {
		for _, item := range chatModels {
			if item.ID == requestedModel {
				return requestedModel
			}
		}
	}
	return chatModels[0].ID
}

func sub2APIChatTaskResult(result map[string]any, text string, model string) map[string]any {
	if result == nil {
		result = map[string]any{}
	}
	created := int64(util.ToInt(result["created"], int(time.Now().Unix())))
	model = firstNonEmpty(util.Clean(result["model"]), model)
	out := map[string]any{
		"created":     created,
		"output_type": "text",
		"model":       model,
		"data":        []map[string]any{{"text_response": text}},
	}
	if usage := util.StringMap(result["usage"]); len(usage) > 0 {
		out["usage"] = util.CopyMap(usage)
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
	body = sub2APIRequestBodyWithGroup(binding, body)
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
	if binding.SystemDefault {
		if secret := a.sub2Launch.InternalSecret(); secret != "" {
			req.Header.Set("X-Sub2API-Studio-Secret", secret)
		}
		if binding.Sub2APIUserID != "" {
			req.Header.Set("X-Sub2API-Studio-User-ID", binding.Sub2APIUserID)
		}
		if binding.GroupID != "" {
			req.Header.Set("X-Sub2API-Group-ID", binding.GroupID)
		}
	} else {
		req.Header.Set("Authorization", "Bearer "+binding.APIKey)
	}
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

func (a *App) ReserveTask(ctx context.Context, identity service.Identity, task map[string]any, amount float64, ref service.BillingReference) error {
	if a == nil || a.sub2Launch == nil || amount <= 0 {
		return nil
	}
	return a.sub2Launch.Reserve(ctx, taskPayerUserID(task, identity), taskActorUserID(task, identity), util.Clean(task["team_id"]), util.Clean(task["id"]), util.Clean(task["mode"]), taskBillingModel(task, ref), ref.ChargeKey, amount, ref.AmountUnit)
}

func (a *App) CommitTask(ctx context.Context, identity service.Identity, task map[string]any, consumed float64, ref service.BillingReference) error {
	if a == nil || a.sub2Launch == nil || consumed <= 0 {
		return nil
	}
	return a.sub2Launch.Commit(ctx, taskPayerUserID(task, identity), taskActorUserID(task, identity), util.Clean(task["team_id"]), util.Clean(task["id"]), util.Clean(task["mode"]), taskBillingModel(task, ref), ref.ChargeKey, consumed, ref.AmountUnit)
}

func (a *App) RefundTask(ctx context.Context, identity service.Identity, task map[string]any, amount float64, ref service.BillingReference) error {
	if a == nil || a.sub2Launch == nil || amount <= 0 {
		return nil
	}
	return a.sub2Launch.Refund(ctx, taskPayerUserID(task, identity), taskActorUserID(task, identity), util.Clean(task["team_id"]), util.Clean(task["id"]), util.Clean(task["mode"]), taskBillingModel(task, ref), ref.ChargeKey, ref.RefundForKey, amount, ref.AmountUnit)
}

func taskBillingModel(task map[string]any, ref service.BillingReference) string {
	return firstNonEmpty(util.Clean(ref.Model), util.Clean(task["model"]))
}

func taskPayerUserID(task map[string]any, identity service.Identity) string {
	return firstNonEmpty(util.Clean(task["payer_user_id"]), identityScope(identity))
}

func taskActorUserID(task map[string]any, identity service.Identity) string {
	return firstNonEmpty(util.Clean(task["actor_user_id"]), identityScope(identity))
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

func sub2APIRequestBodyWithGroup(binding service.Sub2APIBinding, body map[string]any) map[string]any {
	if !binding.SystemDefault || binding.GroupID == "" {
		return body
	}
	out := util.CopyMap(body)
	out["group_id"] = binding.GroupID
	return out
}

func sub2APITaskStatusEndpoint(baseURL, taskID string) string {
	taskID = strings.TrimSpace(taskID)
	if taskID == "" {
		return ""
	}
	endpoint := "tasks/" + url.PathEscape(taskID) + "?language=zh"
	if !strings.HasSuffix(strings.TrimRight(strings.TrimSpace(baseURL), "/"), "/v1") {
		endpoint = "v1/" + endpoint
	}
	return endpoint
}

func (a *App) formatSub2APIImageResult(ctx context.Context, result map[string]any, identity service.Identity, payload map[string]any, binding service.Sub2APIBinding) (map[string]any, error) {
	if taskID := sub2APIImageTaskID(result); taskID != "" {
		if !binding.Valid() {
			var ok bool
			binding, ok = a.sub2APIBindingForMode(ctx, identity, "generate")
			if !ok {
				binding, ok = a.sub2APIBindingForMode(ctx, identity, "edit")
			}
			if !ok {
				return nil, &protocol.ImageGenerationError{Message: "图片上游返回异步任务，但当前用户没有可用网关绑定", StatusCode: http.StatusBadGateway, Type: "server_error", Code: "upstream_error"}
			}
		}
		if !binding.Valid() {
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
	if cost, ok := sub2APITaskCost(result); ok && cost > 0 {
		result["external_billing_consumed_amount"] = cost
		result["external_billing_amount_unit"] = service.ImageTaskAmountUnitAPIMartCost
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
	outputOptions := protocol.ImageOutputOptionsFromPayload(payload)
	outputOptions.TrustUpstreamFormat = true
	formatted := a.engine.FormatImageResultWithOptions(normalized, util.Clean(payload["prompt"]), "url", util.Clean(payload["base_url"]), identityScope(identity), identityDisplayName(identity), created, "", outputOptions)
	if cost, ok := sub2APITaskCost(result); ok && cost > 0 {
		formatted["external_billing_consumed_amount"] = cost
		formatted["external_billing_amount_unit"] = service.ImageTaskAmountUnitAPIMartCost
	}
	return formatted, nil
}

func sub2APITaskCost(result map[string]any) (float64, bool) {
	for _, container := range []map[string]any{
		result,
		util.StringMap(result["data"]),
		util.StringMap(result["result"]),
		util.StringMap(result["billing"]),
		util.StringMap(result["usage"]),
		util.StringMap(util.StringMap(result["data"])["billing"]),
		util.StringMap(util.StringMap(result["data"])["usage"]),
		util.StringMap(util.StringMap(result["result"])["billing"]),
		util.StringMap(util.StringMap(result["result"])["usage"]),
	} {
		if unit := sub2APICostAmountUnit(container); unit == "credits" || unit == "credit" {
			for _, key := range []string{"credits_cost", "credit_cost", "credits", "used_credits", "total_credits", "price_credits", "credits_used", "cost", "price", "amount", "charged_amount", "consumed_amount", "fee"} {
				if creditsCost, ok := sub2APINumber(container[key]); ok && creditsCost > 0 {
					return creditsCost / 10, true
				}
			}
		}
		if cost, ok := sub2APINumber(container["cost"]); ok && cost > 0 {
			return cost, true
		}
		for _, key := range []string{"credits_cost", "credit_cost", "credits", "used_credits", "total_credits", "price_credits", "credits_used"} {
			if creditsCost, ok := sub2APINumber(container[key]); ok && creditsCost > 0 {
				return creditsCost / 10, true
			}
		}
	}
	return 0, false
}

func sub2APICostAmountUnit(container map[string]any) string {
	return strings.ToLower(strings.TrimSpace(util.Clean(firstNonNil(container["unit"], container["amount_unit"], container["currency"]))))
}

func sub2APIBillingAmount(value any) float64 {
	out, ok := sub2APINumber(value)
	if !ok || out <= 0 {
		return 0
	}
	return out
}

func sub2APINumber(value any) (float64, bool) {
	switch v := value.(type) {
	case float64:
		return v, !math.IsNaN(v) && !math.IsInf(v, 0)
	case float32:
		out := float64(v)
		return out, !math.IsNaN(out) && !math.IsInf(out, 0)
	case int:
		return float64(v), true
	case int64:
		return float64(v), true
	case json.Number:
		out, err := v.Float64()
		return out, err == nil
	case string:
		out, err := strconv.ParseFloat(strings.TrimSpace(v), 64)
		return out, err == nil
	default:
		return 0, false
	}
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
		result, err := a.getSub2APIJSON(ctx, binding, sub2APITaskStatusEndpoint(binding.GatewayBaseURL, taskID))
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
			return sanitizeSub2APIUserMessage(nested)
		}
		if value := util.Clean(result[key]); value != "" {
			return sanitizeSub2APIUserMessage(value)
		}
	}
	for _, container := range []map[string]any{util.StringMap(result["data"]), util.StringMap(result["result"])} {
		for _, key := range []string{"message", "error", "detail"} {
			if nested := util.Clean(util.StringMap(container[key])["message"]); nested != "" {
				return sanitizeSub2APIUserMessage(nested)
			}
			if value := util.Clean(container[key]); value != "" {
				return sanitizeSub2APIUserMessage(value)
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
				return sanitizeSub2APIUserMessage(nested)
			}
			if value := util.Clean(payload[key]); value != "" {
				return sanitizeSub2APIUserMessage(value)
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
	return sanitizeSub2APIUserMessage(text)
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
		return sanitizeSub2APIUserMessage(text)
	}
	body := strings.TrimSuffix(strings.TrimPrefix(text, "map["), "]")
	for _, key := range []string{"message", "error", "detail"} {
		if value := sub2APIMapStringField(body, key); value != "" {
			return sanitizeSub2APIUserMessage(value)
		}
	}
	return sanitizeSub2APIUserMessage(text)
}

var sub2APIUserVisibleBrandPattern = regexp.MustCompile(`(?i)\b(?:api[\s_-]*mart|apimart)\b`)

func sanitizeSub2APIUserMessage(message string) string {
	return strings.TrimSpace(sub2APIUserVisibleBrandPattern.ReplaceAllString(message, "上游服务"))
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
