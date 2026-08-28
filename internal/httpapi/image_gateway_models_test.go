package httpapi

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"chatgpt2api/internal/protocol"
	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

func TestImageGatewayModelsMidjourneyPayloadPassesSettingsAndReferences(t *testing.T) {
	payload, err := sub2APIImageGatewayJSONPayload(map[string]any{
		"prompt": "draw a product poster",
		"model":  util.ImageModelMidjourney,
		"size":   "16:9",
		"n":      2,
		"midjourney_settings": map[string]any{
			"version":         "6.1",
			"speed":           "relax",
			"stylize":         100,
			"chaos":           12,
			"weird":           3,
			"quality":         "1",
			"style":           "cute",
			"seed":            12345,
			"negative_prompt": "blur",
			"iw":              0.5,
			"cw":              80,
			"sw":              250,
			"cref":            "https://example.test/character.png",
			"sref":            "https://example.test/style.png",
			"dref":            "https://example.test/diversity.png",
			"dw":              40,
			"repeat":          2,
			"raw":             true,
			"tile":            true,
			"draft":           true,
			"hd":              true,
			"stop":            80,
			"extra":           "--profile abc",
		},
		"images": []protocol.UploadedImage{
			{Filename: "source.png", ContentType: "image/png", Data: []byte("private")},
		},
	})
	if err != nil {
		t.Fatalf("midjourney payload error = %v", err)
	}
	if payload["model"] != nil || payload["n"] != nil || payload["size"] != "16:9" {
		t.Fatalf("midjourney payload basics = %#v", payload)
	}
	for key, want := range map[string]any{
		"version":         "6.1",
		"speed":           "relax",
		"stylize":         100,
		"chaos":           12,
		"weird":           3,
		"quality":         "1",
		"style":           "cute",
		"seed":            12345,
		"negative_prompt": "blur",
		"iw":              0.5,
		"cw":              float64(80),
		"sw":              float64(250),
		"cref":            "https://example.test/character.png",
		"sref":            "https://example.test/style.png",
		"dref":            "https://example.test/diversity.png",
		"dw":              float64(40),
		"repeat":          2,
		"raw":             true,
		"tile":            true,
		"draft":           true,
		"hd":              true,
		"stop":            80,
		"extra":           "--profile abc",
	} {
		if payload[key] != want {
			t.Fatalf("midjourney %s = %#v, want %#v in %#v", key, payload[key], want, payload)
		}
	}
	urls := util.AsStringSlice(payload["image_urls"])
	if len(urls) != 1 || !strings.HasPrefix(urls[0], "data:image/png;base64,") {
		t.Fatalf("midjourney image_urls = %#v", payload["image_urls"])
	}
}

func TestImageGatewayModelsMidjourneyPayloadDropsUnsupportedStop(t *testing.T) {
	payload, err := sub2APIImageGatewayJSONPayload(map[string]any{
		"prompt": "draw a product poster",
		"model":  util.ImageModelMidjourney,
		"midjourney_settings": map[string]any{
			"version": "8.1",
			"stop":    80,
		},
	})
	if err != nil {
		t.Fatalf("midjourney payload error = %v", err)
	}
	if _, ok := payload["stop"]; ok {
		t.Fatalf("midjourney v8.1 should not forward stop: %#v", payload)
	}
}

func TestImageGatewayModelsMidjourneyPayloadNormalizesNijiVersion(t *testing.T) {
	payload, err := sub2APIImageGatewayJSONPayload(map[string]any{
		"prompt": "draw anime",
		"model":  util.ImageModelMidjourney,
		"midjourney_settings": map[string]any{
			"version": "8.1",
			"niji":    true,
			"stop":    80,
		},
	})
	if err != nil {
		t.Fatalf("midjourney payload error = %v", err)
	}
	if payload["version"] != "7" || payload["niji"] != true {
		t.Fatalf("midjourney niji version = %#v", payload)
	}
	if _, ok := payload["stop"]; ok {
		t.Fatalf("midjourney niji v7 should not forward stop: %#v", payload)
	}
}

func TestImageGatewayModelsMidjourneyPayloadUsesDefaultSettings(t *testing.T) {
	payload, err := sub2APIImageGatewayJSONPayload(map[string]any{
		"prompt": "draw a product poster",
		"model":  util.ImageModelMidjourney,
	})
	if err != nil {
		t.Fatalf("midjourney payload error = %v", err)
	}
	for key, want := range map[string]any{
		"version": "8.1",
		"speed":   "relax",
		"stylize": 100,
		"chaos":   0,
		"weird":   0,
		"quality": "1",
		"niji":    false,
		"raw":     false,
		"tile":    false,
	} {
		if payload[key] != want {
			t.Fatalf("midjourney default %s = %#v, want %#v in %#v", key, payload[key], want, payload)
		}
	}
	if _, ok := payload["stop"]; ok {
		t.Fatalf("midjourney default v8.1 should not forward stop: %#v", payload)
	}
}

func TestImageGatewayModelsMidjourneyPayloadRejectsTooManyReferences(t *testing.T) {
	_, err := sub2APIImageGatewayJSONPayload(map[string]any{
		"prompt":     "draw",
		"model":      util.ImageModelMidjourney,
		"image_urls": []string{"https://example.test/1.png", "https://example.test/2.png", "https://example.test/3.png", "https://example.test/4.png", "https://example.test/5.png"},
	})
	if err == nil {
		t.Fatal("expected reference limit error")
	}
	if !strings.Contains(err.Error(), "参考图最多支持 4 张") {
		t.Fatalf("error = %q", err.Error())
	}
}

func TestImageGatewayModelsGPTImagePayloadPassesReferenceURLs(t *testing.T) {
	payload, err := sub2APIImageGatewayJSONPayload(map[string]any{
		"prompt":     "draw",
		"model":      util.ImageModelGPT,
		"image_urls": []string{"https://example.test/ref.png"},
	})
	if err != nil {
		t.Fatalf("gpt-image-2 payload error = %v", err)
	}
	urls := util.AsStringSlice(payload["image_urls"])
	if len(urls) != 1 || urls[0] != "https://example.test/ref.png" {
		t.Fatalf("gpt-image-2 image_urls = %#v", payload["image_urls"])
	}
}

func TestImageGatewayModelsSeedreamPayloadUsesImageGateway(t *testing.T) {
	payload, err := sub2APIImageGatewayJSONPayload(map[string]any{
		"prompt":                              "draw a product scene",
		"model":                               util.ImageModelSeedream45,
		"size":                                "16:9",
		"image_resolution":                    "2K",
		"n":                                   2,
		"image_urls":                          []string{"https://example.test/ref.png"},
		"quality":                             "high",
		"background":                          "transparent",
		"watermark":                           false,
		"sequential_image_generation":         "auto",
		"sequential_image_generation_options": map[string]any{"max_images": 3},
		"optimize_prompt_options": map[string]any{
			"enable": true,
		},
	})
	if err != nil {
		t.Fatalf("seedream payload error = %v", err)
	}
	if payload["model"] != util.ImageModelSeedream45 || payload["size"] != "16:9" || payload["resolution"] != "2k" || payload["n"] != 2 {
		t.Fatalf("seedream payload basics = %#v", payload)
	}
	if payload["watermark"] != false {
		t.Fatalf("seedream watermark = %#v in %#v", payload["watermark"], payload)
	}
	if payload["sequential_image_generation"] != "auto" {
		t.Fatalf("seedream sequential mode = %#v in %#v", payload["sequential_image_generation"], payload)
	}
	if options := util.StringMap(payload["sequential_image_generation_options"]); util.ToInt(options["max_images"], 0) != 3 {
		t.Fatalf("seedream sequential options = %#v in %#v", options, payload)
	}
	if _, ok := payload["quality"]; ok {
		t.Fatalf("seedream should not forward quality: %#v", payload)
	}
	if _, ok := payload["background"]; ok {
		t.Fatalf("seedream should not forward background: %#v", payload)
	}
	urls := util.AsStringSlice(payload["image_urls"])
	if len(urls) != 1 || urls[0] != "https://example.test/ref.png" {
		t.Fatalf("seedream image_urls = %#v", payload["image_urls"])
	}
}

func TestImageGatewayModelsSeedream50Profiles(t *testing.T) {
	lite, err := sub2APIImageGatewayJSONPayload(map[string]any{
		"model": "seedream-5-0-lite", "prompt": "draw", "size": "21:9", "resolution": "3K", "n": 3,
		"output_format": "jpg", "nsfw_check": true, "watermark": false,
		"sequential_image_generation": "auto", "sequential_image_generation_options": map[string]any{"max_images": 5},
	})
	if err != nil {
		t.Fatalf("lite payload error = %v", err)
	}
	if lite["size"] != "21:9" || lite["resolution"] != "3k" || lite["output_format"] != "jpeg" || lite["n"] != 3 || lite["nsfw_check"] != true {
		t.Fatalf("lite payload = %#v", lite)
	}
	if _, ok := lite["quality"]; ok {
		t.Fatalf("lite should not forward quality: %#v", lite)
	}

	pro, err := sub2APIImageGatewayJSONPayload(map[string]any{
		"model": util.ImageModelSeedream50Pro, "prompt": "draw", "size": "1024x1024", "resolution": "1.5K", "n": 1,
		"output_format": "png", "image_urls": []string{"https://example.test/ref.png"},
	})
	if err != nil {
		t.Fatalf("pro payload error = %v", err)
	}
	if pro["size"] != "1024x1024" || pro["resolution"] != "1.5k" || pro["output_format"] != "png" {
		t.Fatalf("pro payload = %#v", pro)
	}
	if _, ok := pro["sequential_image_generation"]; ok {
		t.Fatalf("pro should not include sequential fields: %#v", pro)
	}
}

func TestImageGatewayModelsSeedreamProfilesRejectUnsupportedValues(t *testing.T) {
	cases := []map[string]any{
		{"model": util.ImageModelSeedream45, "prompt": "draw", "resolution": "1K"},
		{"model": "seedream-5-0-lite", "prompt": "draw", "size": "9:21"},
		{"model": util.ImageModelSeedream50Pro, "prompt": "draw", "n": 2},
		{"model": util.ImageModelSeedream50Pro, "prompt": "draw", "size": "100x100"},
		{"model": util.ImageModelSeedream40, "prompt": "draw", "n": 2},
		{"model": util.ImageModelSeedream50Lite, "prompt": "draw", "n": 2, "sequential_image_generation": "bogus"},
		{"model": util.ImageModelSeedream40, "prompt": "draw", "sequential_image_generation": "auto", "sequential_image_generation_options": []any{}},
	}
	for _, input := range cases {
		if _, err := sub2APIImageGatewayJSONPayload(input); err == nil {
			t.Fatalf("expected Seedream validation error for %#v", input)
		}
	}
}

func TestImageGatewayModelsSeedreamMultipleOutputsForceSequentialAuto(t *testing.T) {
	lite, err := sub2APIImageGatewayJSONPayload(map[string]any{
		"model":                               util.ImageModelSeedream50Lite,
		"prompt":                              "draw",
		"n":                                   3,
		"sequential_image_generation":         "disabled",
		"sequential_image_generation_options": map[string]any{"max_images": 7},
	})
	if err != nil {
		t.Fatalf("lite payload error = %v", err)
	}
	if lite["sequential_image_generation"] != "auto" {
		t.Fatalf("lite sequential mode = %#v, want auto", lite["sequential_image_generation"])
	}
	if options := util.StringMap(lite["sequential_image_generation_options"]); util.ToInt(options["max_images"], 0) != 7 {
		t.Fatalf("lite sequential options = %#v", options)
	}

	seedream40, err := sub2APIImageGatewayJSONPayload(map[string]any{
		"model":                       util.ImageModelSeedream40,
		"prompt":                      "draw",
		"n":                           2,
		"image_urls":                  []string{"https://example.test/ref.png"},
		"sequential_image_generation": "disabled",
	})
	if err != nil {
		t.Fatalf("Seedream 4.0 payload error = %v", err)
	}
	if seedream40["sequential_image_generation"] != "auto" {
		t.Fatalf("Seedream 4.0 sequential mode = %#v, want auto", seedream40["sequential_image_generation"])
	}
}

func TestImageGatewayModelsImageToolOptionsAcceptsMaskURLAlias(t *testing.T) {
	options := imageToolOptionsFromBody(map[string]any{
		"mask_url": "https://cdn.example/mask.png",
	})
	if options.InputImageMask != "https://cdn.example/mask.png" {
		t.Fatalf("InputImageMask = %q, want mask_url alias", options.InputImageMask)
	}
}

func TestImageGatewayModelsImageToolOptionsIgnoresEmptyOfficialFallback(t *testing.T) {
	empty := imageToolOptionsFromBody(map[string]any{"official_fallback": ""})
	if empty.OfficialFallback != nil {
		t.Fatalf("empty official_fallback = %#v, want nil", empty.OfficialFallback)
	}

	explicitFalse := imageToolOptionsFromBody(map[string]any{"official_fallback": "false"})
	if explicitFalse.OfficialFallback == nil || *explicitFalse.OfficialFallback {
		t.Fatalf("explicit false official_fallback = %#v, want false", explicitFalse.OfficialFallback)
	}

	explicitTrue := imageToolOptionsFromBody(map[string]any{"official_fallback": true})
	if explicitTrue.OfficialFallback == nil || !*explicitTrue.OfficialFallback {
		t.Fatalf("explicit true official_fallback = %#v, want true", explicitTrue.OfficialFallback)
	}
}

func TestImageGatewayModelsReferenceLimits(t *testing.T) {
	grokRefs := []string{
		"https://example.test/grok-1.png",
		"https://example.test/grok-2.png",
		"https://example.test/grok-3.png",
		"https://example.test/grok-4.png",
	}
	if err := validateImageReferenceLimit(map[string]any{
		"model":      util.ImageModelGrokImagine,
		"image_urls": grokRefs,
	}, nil); err == nil || !strings.Contains(err.Error(), "Grok Imagine 参考图最多支持 3 张") {
		t.Fatalf("grok reference limit error = %v", err)
	}

	geminiRefs := make([]string, 15)
	for i := range geminiRefs {
		geminiRefs[i] = "https://example.test/gemini-" + strconv.Itoa(i) + ".png"
	}
	if err := validateImageReferenceLimit(map[string]any{
		"model":      util.ImageModelGeminiFlashPreview,
		"image_urls": geminiRefs,
	}, nil); err == nil || !strings.Contains(err.Error(), "Gemini 参考图最多支持 14 张") {
		t.Fatalf("gemini reference limit error = %v", err)
	}

	gptRefs := make([]string, 17)
	for i := range gptRefs {
		gptRefs[i] = "https://example.test/gpt-" + strconv.Itoa(i) + ".png"
	}
	if err := validateImageReferenceLimit(map[string]any{
		"model":      util.ImageModelGPT,
		"image_urls": gptRefs,
	}, nil); err == nil || !strings.Contains(err.Error(), "GPT-Image-2 参考图最多支持 16 张") {
		t.Fatalf("gpt reference limit error = %v", err)
	}

	seedreamRefs := make([]string, 15)
	for i := range seedreamRefs {
		seedreamRefs[i] = "https://example.test/seedream-" + strconv.Itoa(i) + ".png"
	}
	if err := validateImageReferenceLimit(map[string]any{
		"model":      util.ImageModelSeedream40,
		"image_urls": seedreamRefs,
	}, nil); err == nil || !strings.Contains(err.Error(), "Seedream 参考图数量和生成数量合计最多支持 15") {
		t.Fatalf("seedream reference limit error = %v", err)
	}
}

func TestImageGatewayModelsGrokImaginePayloadUsesImage2Profile(t *testing.T) {
	generation, err := sub2APIImageGatewayJSONPayload(map[string]any{
		"prompt":           " draw a product scene ",
		"model":            util.ImageModelGrokImagine,
		"size":             "16:9",
		"image_resolution": "2k",
		"quality":          "low",
		"nsfw_check":       true,
		"n":                2,
	})
	if err != nil {
		t.Fatalf("grok generation payload error = %v", err)
	}
	if generation["model"] != util.ImageModelGrokImagine || generation["aspect_ratio"] != "16:9" || generation["resolution"] != "2k" || generation["quality"] != "low" || generation["nsfw_check"] != true || generation["n"] != 2 {
		t.Fatalf("grok generation payload = %#v", generation)
	}
	if generation["prompt"] != "draw a product scene" {
		t.Fatalf("grok prompt = %#v", generation["prompt"])
	}
	if _, ok := generation["size"]; ok {
		t.Fatalf("grok generation should use aspect_ratio instead of size: %#v", generation)
	}
	if _, ok := generation["image_urls"]; ok {
		t.Fatalf("grok generation should not include image_urls: %#v", generation)
	}

	edit, err := sub2APIImageGatewayJSONPayload(map[string]any{
		"prompt":           "keep the product and change background",
		"model":            util.ImageModelGrokImagine,
		"image_urls":       []string{"https://example.test/ref-1.png", "https://example.test/ref-2.png", "https://example.test/ref-3.png"},
		"image_resolution": "1080p",
		"quality":          "medium",
	})
	if err != nil {
		t.Fatalf("grok edit payload error = %v", err)
	}
	if edit["model"] != util.ImageModelGrokImagine || edit["aspect_ratio"] != "auto" || edit["resolution"] != "1k" || edit["nsfw_check"] != false {
		t.Fatalf("grok edit payload = %#v", edit)
	}
	if _, ok := edit["quality"]; ok {
		t.Fatalf("grok edit should omit quality: %#v", edit)
	}
	urls := util.AsStringSlice(edit["image_urls"])
	if len(urls) != 3 || urls[0] != "https://example.test/ref-1.png" || urls[2] != "https://example.test/ref-3.png" {
		t.Fatalf("grok edit image_urls = %#v", edit["image_urls"])
	}
}

func TestImageGatewayModelsGrokImaginePayloadRejectsTooManyReferences(t *testing.T) {
	_, err := sub2APIImageGatewayJSONPayload(map[string]any{
		"prompt":     "draw",
		"model":      util.ImageModelGrokImagine,
		"image_urls": []string{"https://example.test/1.png", "https://example.test/2.png", "https://example.test/3.png", "https://example.test/4.png"},
	})
	if err == nil {
		t.Fatal("expected reference limit error")
	}
	if !strings.Contains(err.Error(), "参考图最多支持 3 张") {
		t.Fatalf("error = %q", err.Error())
	}
}

func TestImageGatewayModelsGrokImaginePayloadRejectsInvalidParameters(t *testing.T) {
	tests := []struct {
		name    string
		payload map[string]any
		want    string
	}{
		{name: "empty prompt", payload: map[string]any{"prompt": "  "}, want: "prompt 不能为空"},
		{name: "long prompt", payload: map[string]any{"prompt": strings.Repeat("图", 8001)}, want: "最多支持 8000"},
		{name: "fractional n", payload: map[string]any{"prompt": "draw", "n": 1.5}, want: "n 必须是 1 到 10 的整数"},
		{name: "large n", payload: map[string]any{"prompt": "draw", "n": 11}, want: "n 必须是 1 到 10 的整数"},
		{name: "invalid ratio", payload: map[string]any{"prompt": "draw", "size": "21:9"}, want: "aspect_ratio 不受支持"},
		{name: "pixel size", payload: map[string]any{"prompt": "draw", "size": "1024x1024"}, want: "aspect_ratio 不受支持"},
		{name: "invalid resolution", payload: map[string]any{"prompt": "draw", "image_resolution": "4k"}, want: "resolution 只支持 1k 或 2k"},
		{name: "invalid quality", payload: map[string]any{"prompt": "draw", "quality": "high"}, want: "quality 只支持 low 或 medium"},
		{name: "invalid nsfw check", payload: map[string]any{"prompt": "draw", "nsfw_check": "true"}, want: "nsfw_check 必须是布尔值"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.payload["model"] = util.ImageModelGrokImagine
			_, err := sub2APIImageGatewayJSONPayload(tt.payload)
			if err == nil || !strings.Contains(err.Error(), tt.want) {
				t.Fatalf("error = %v, want %q", err, tt.want)
			}
		})
	}
}

func TestImageGatewayModelsCreationTaskMidjourneyRejectsTooManyReferenceURLs(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	_, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "midjourney-limit", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/creation-tasks/image-generations", strings.NewReader(jsonString(map[string]any{
		"client_task_id": "midjourney-too-many-refs",
		"prompt":         "draw",
		"model":          util.ImageModelMidjourney,
		"image_urls":     []string{"https://example.test/1.png", "https://example.test/2.png", "https://example.test/3.png", "https://example.test/4.png", "https://example.test/5.png"},
	})))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("midjourney reference limit status = %d body = %s", res.Code, res.Body.String())
	}
	if !strings.Contains(res.Body.String(), "参考图最多支持 4 张") {
		t.Fatalf("midjourney reference limit body = %s", res.Body.String())
	}
}

func TestImageGatewayModelsCreationTaskGrokImagineRejectsTooManyReferenceURLs(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	_, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "grok-limit", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/creation-tasks/image-edits", strings.NewReader(jsonString(map[string]any{
		"client_task_id": "grok-too-many-refs",
		"prompt":         "draw",
		"model":          util.ImageModelGrokImagine,
		"image_urls": []string{
			"https://example.test/1.png",
			"https://example.test/2.png",
			"https://example.test/3.png",
			"https://example.test/4.png",
		},
	})))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("grok reference limit status = %d body = %s", res.Code, res.Body.String())
	}
	if !strings.Contains(res.Body.String(), "参考图最多支持 3 张") {
		t.Fatalf("grok reference limit body = %s", res.Body.String())
	}
}

func TestImageGatewayModelsMidjourneyImageEditTaskUsesDataURIReferences(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	var received map[string]any
	gateway := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/midjourney/generations" {
			t.Fatalf("gateway request = %s %s", r.Method, r.URL.Path)
		}
		if !strings.Contains(r.Header.Get("Content-Type"), "application/json") {
			t.Fatalf("gateway Content-Type = %q, want JSON", r.Header.Get("Content-Type"))
		}
		if err := json.NewDecoder(r.Body).Decode(&received); err != nil {
			t.Fatalf("gateway json: %v", err)
		}
		util.WriteJSON(w, http.StatusOK, map[string]any{
			"created": 123,
			"cost":    0.036,
			"data":    []map[string]any{{"b64_json": sub2APITestPNGBase64}},
		})
	}))
	defer gateway.Close()

	owner := service.AuthOwner{ID: "sub2api:midjourney-edit-user", Name: "midjourney-edit", Provider: service.AuthProviderSub2API}
	_, sessionKey, err := app.auth.UpsertSub2APISession(owner)
	if err != nil {
		t.Fatalf("UpsertSub2APISession() error = %v", err)
	}
	if err := app.sub2Bindings.Save(service.Sub2APIBinding{
		OwnerID:        owner.ID,
		Sub2APIUserID:  "midjourney-edit-user",
		SessionToken:   "session-midjourney-edit-user",
		APIKey:         "sub2-key",
		GatewayBaseURL: gateway.URL,
	}); err != nil {
		t.Fatalf("Save(Sub2APIBinding) error = %v", err)
	}
	referenceBytes, err := base64.StdEncoding.DecodeString(sub2APITestPNGBase64)
	if err != nil {
		t.Fatalf("decode reference png: %v", err)
	}
	ref, err := app.images.StoreTempReferenceImage(service.UploadedTempReferenceImage{
		ClientReferenceID: "client-midjourney-ref-1",
		Filename:          "source.png",
		ContentType:       "image/png",
		Data:              referenceBytes,
	}, owner.ID)
	if err != nil {
		t.Fatalf("StoreTempReferenceImage() error = %v", err)
	}

	body := jsonString(map[string]any{
		"client_task_id":      "sub2-midjourney-edit-task",
		"prompt":              "keep the product, change background",
		"model":               util.ImageModelMidjourney,
		"reference_image_ids": []string{ref.ID},
		"size":                "16:9",
		"midjourney_settings": map[string]any{
			"version": "7",
			"speed":   "relax",
			"stylize": 120,
			"chaos":   5,
			"weird":   2,
			"quality": "1",
			"raw":     true,
			"tile":    true,
			"stop":    90,
		},
	})
	req := httptest.NewRequest(http.MethodPost, "/api/creation-tasks/image-edits", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("submit midjourney edit task status = %d body = %s", res.Code, res.Body.String())
	}

	var listed map[string]any
	waitForHTTPTestCondition(t, func() bool {
		req = httptest.NewRequest(http.MethodGet, "/api/creation-tasks?ids=sub2-midjourney-edit-task", nil)
		req.Header.Set("Authorization", "Bearer "+sessionKey)
		res = httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		if res.Code != http.StatusOK {
			t.Fatalf("list midjourney edit task status = %d body = %s", res.Code, res.Body.String())
		}
		if err := json.Unmarshal(res.Body.Bytes(), &listed); err != nil {
			t.Fatalf("list midjourney edit task json: %v", err)
		}
		items := util.AsMapSlice(listed["items"])
		return len(items) == 1 && items[0]["status"] == service.TaskStatusSuccess
	})

	if received["model"] != nil || received["n"] != nil || received["size"] != "16:9" || received["stylize"] != float64(120) || received["raw"] != true || received["tile"] != true {
		t.Fatalf("midjourney edit gateway body = %#v", received)
	}
	urls := util.AsStringSlice(received["image_urls"])
	if len(urls) != 1 || !strings.HasPrefix(urls[0], "data:image/png;base64,") {
		t.Fatalf("midjourney edit image_urls = %#v", received["image_urls"])
	}
	items := util.AsMapSlice(listed["items"])
	if len(items) != 1 || util.ToInt(items[0]["billing_consumed_amount"], 0) != 303 {
		t.Fatalf("midjourney edit billing = %#v, want 303 in %#v", items, listed)
	}
}

func TestImageGatewayModelsMidjourneyImageEditTaskKeepsPublicURLReferences(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	var received map[string]any
	gateway := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/midjourney/generations" {
			t.Fatalf("gateway request = %s %s", r.Method, r.URL.Path)
		}
		if err := json.NewDecoder(r.Body).Decode(&received); err != nil {
			t.Fatalf("gateway json: %v", err)
		}
		util.WriteJSON(w, http.StatusOK, map[string]any{
			"created": 123,
			"data":    []map[string]any{{"b64_json": sub2APITestPNGBase64}},
		})
	}))
	defer gateway.Close()

	owner := service.AuthOwner{ID: "sub2api:midjourney-url-user", Name: "midjourney-url", Provider: service.AuthProviderSub2API}
	_, sessionKey, err := app.auth.UpsertSub2APISession(owner)
	if err != nil {
		t.Fatalf("UpsertSub2APISession() error = %v", err)
	}
	if err := app.sub2Bindings.Save(service.Sub2APIBinding{
		OwnerID:        owner.ID,
		Sub2APIUserID:  "midjourney-url-user",
		SessionToken:   "session-midjourney-url-user",
		APIKey:         "sub2-key",
		GatewayBaseURL: gateway.URL,
	}); err != nil {
		t.Fatalf("Save(Sub2APIBinding) error = %v", err)
	}

	publicURL := "https://example.test/reference.png"
	body := jsonString(map[string]any{
		"client_task_id": "sub2-midjourney-url-task",
		"prompt":         "keep the product, change background",
		"model":          util.ImageModelMidjourney,
		"image_urls":     []string{publicURL},
		"size":           "16:9",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/creation-tasks/image-edits", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("submit midjourney url edit task status = %d body = %s", res.Code, res.Body.String())
	}

	waitForHTTPTestCondition(t, func() bool {
		req = httptest.NewRequest(http.MethodGet, "/api/creation-tasks?ids=sub2-midjourney-url-task", nil)
		req.Header.Set("Authorization", "Bearer "+sessionKey)
		res = httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		if res.Code != http.StatusOK {
			t.Fatalf("list midjourney url edit task status = %d body = %s", res.Code, res.Body.String())
		}
		var listed map[string]any
		if err := json.Unmarshal(res.Body.Bytes(), &listed); err != nil {
			t.Fatalf("list midjourney url edit task json: %v", err)
		}
		items := util.AsMapSlice(listed["items"])
		return len(items) == 1 && items[0]["status"] == service.TaskStatusSuccess
	})

	urls := util.AsStringSlice(received["image_urls"])
	if len(urls) != 1 || urls[0] != publicURL {
		t.Fatalf("midjourney public image_urls = %#v", received["image_urls"])
	}
}

func TestImageGatewayModelsGrokImagineGenerationTaskUsesGenerationGateway(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	var received map[string]any
	gateway := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/images/generations" {
			t.Fatalf("gateway request = %s %s", r.Method, r.URL.Path)
		}
		if err := json.NewDecoder(r.Body).Decode(&received); err != nil {
			t.Fatalf("gateway json: %v", err)
		}
		util.WriteJSON(w, http.StatusOK, map[string]any{
			"created": 123,
			"cost":    0.024,
			"data":    []map[string]any{{"b64_json": sub2APITestPNGBase64}},
		})
	}))
	defer gateway.Close()

	owner := service.AuthOwner{ID: "sub2api:grok-gen-user", Name: "grok-gen", Provider: service.AuthProviderSub2API}
	_, sessionKey, err := app.auth.UpsertSub2APISession(owner)
	if err != nil {
		t.Fatalf("UpsertSub2APISession() error = %v", err)
	}
	if err := app.sub2Bindings.Save(service.Sub2APIBinding{
		OwnerID:        owner.ID,
		Sub2APIUserID:  "grok-gen-user",
		SessionToken:   "session-grok-gen-user",
		APIKey:         "sub2-key",
		GatewayBaseURL: gateway.URL,
	}); err != nil {
		t.Fatalf("Save(Sub2APIBinding) error = %v", err)
	}

	body := jsonString(map[string]any{
		"client_task_id": "sub2-grok-generation-task",
		"prompt":         "draw a cinematic product scene",
		"model":          util.ImageModelGrokImagine,
		"size":           "16:9",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/creation-tasks/image-generations", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("submit grok generation task status = %d body = %s", res.Code, res.Body.String())
	}

	var listed map[string]any
	waitForHTTPTestCondition(t, func() bool {
		req = httptest.NewRequest(http.MethodGet, "/api/creation-tasks?ids=sub2-grok-generation-task", nil)
		req.Header.Set("Authorization", "Bearer "+sessionKey)
		res = httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		if res.Code != http.StatusOK {
			t.Fatalf("list grok generation task status = %d body = %s", res.Code, res.Body.String())
		}
		if err := json.Unmarshal(res.Body.Bytes(), &listed); err != nil {
			t.Fatalf("list grok generation task json: %v", err)
		}
		items := util.AsMapSlice(listed["items"])
		return len(items) == 1 && items[0]["status"] == service.TaskStatusSuccess
	})

	if received["model"] != util.ImageModelGrokImagine || received["aspect_ratio"] != "16:9" || received["resolution"] != "1k" || received["quality"] != "medium" {
		t.Fatalf("grok generation gateway body = %#v", received)
	}
	if _, ok := received["response_format"]; ok {
		t.Fatalf("grok generation should not include response_format: %#v", received)
	}
	if _, ok := received["image_urls"]; ok {
		t.Fatalf("grok generation should not include image_urls: %#v", received)
	}
	items := util.AsMapSlice(listed["items"])
	if len(items) != 1 || util.ToInt(items[0]["billing_consumed_amount"], 0) != 202 {
		t.Fatalf("grok generation billing = %#v, want 202 in %#v", items, listed)
	}
}

func TestImageGatewayModelsGrokImagineImageEditTaskUsesDataURIReferences(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	var received map[string]any
	gateway := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/images/generations" {
			t.Fatalf("gateway request = %s %s", r.Method, r.URL.Path)
		}
		if !strings.Contains(r.Header.Get("Content-Type"), "application/json") {
			t.Fatalf("gateway Content-Type = %q, want JSON", r.Header.Get("Content-Type"))
		}
		if err := json.NewDecoder(r.Body).Decode(&received); err != nil {
			t.Fatalf("gateway json: %v", err)
		}
		util.WriteJSON(w, http.StatusOK, map[string]any{
			"created": 123,
			"data":    []map[string]any{{"b64_json": sub2APITestPNGBase64}},
		})
	}))
	defer gateway.Close()

	owner := service.AuthOwner{ID: "sub2api:grok-edit-user", Name: "grok-edit", Provider: service.AuthProviderSub2API}
	_, sessionKey, err := app.auth.UpsertSub2APISession(owner)
	if err != nil {
		t.Fatalf("UpsertSub2APISession() error = %v", err)
	}
	if err := app.sub2Bindings.Save(service.Sub2APIBinding{
		OwnerID:        owner.ID,
		Sub2APIUserID:  "grok-edit-user",
		SessionToken:   "session-grok-edit-user",
		APIKey:         "sub2-key",
		GatewayBaseURL: gateway.URL,
	}); err != nil {
		t.Fatalf("Save(Sub2APIBinding) error = %v", err)
	}
	referenceBytes, err := base64.StdEncoding.DecodeString(sub2APITestPNGBase64)
	if err != nil {
		t.Fatalf("decode reference png: %v", err)
	}
	ref, err := app.images.StoreTempReferenceImage(service.UploadedTempReferenceImage{
		ClientReferenceID: "client-grok-ref-1",
		Filename:          "source.png",
		ContentType:       "image/png",
		Data:              referenceBytes,
	}, owner.ID)
	if err != nil {
		t.Fatalf("StoreTempReferenceImage() error = %v", err)
	}

	body := jsonString(map[string]any{
		"client_task_id":      "sub2-grok-edit-task",
		"prompt":              "keep the product, change background",
		"model":               util.ImageModelGrokImagine,
		"reference_image_ids": []string{ref.ID},
		"size":                "1:1",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/creation-tasks/image-edits", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("submit grok edit task status = %d body = %s", res.Code, res.Body.String())
	}

	waitForHTTPTestCondition(t, func() bool {
		req = httptest.NewRequest(http.MethodGet, "/api/creation-tasks?ids=sub2-grok-edit-task", nil)
		req.Header.Set("Authorization", "Bearer "+sessionKey)
		res = httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		if res.Code != http.StatusOK {
			t.Fatalf("list grok edit task status = %d body = %s", res.Code, res.Body.String())
		}
		var listed map[string]any
		if err := json.Unmarshal(res.Body.Bytes(), &listed); err != nil {
			t.Fatalf("list grok edit task json: %v", err)
		}
		items := util.AsMapSlice(listed["items"])
		return len(items) == 1 && items[0]["status"] == service.TaskStatusSuccess
	})

	if received["model"] != util.ImageModelGrokImagine || received["aspect_ratio"] != "1:1" || received["resolution"] != "1k" {
		t.Fatalf("grok edit gateway body = %#v", received)
	}
	if _, ok := received["quality"]; ok {
		t.Fatalf("grok edit should omit quality: %#v", received)
	}
	urls := util.AsStringSlice(received["image_urls"])
	if len(urls) != 1 || !strings.HasPrefix(urls[0], "data:image/png;base64,") {
		t.Fatalf("grok edit image_urls = %#v", received["image_urls"])
	}
}
