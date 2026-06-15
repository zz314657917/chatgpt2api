package service

import "testing"

func TestNormalizeProStudioRequestLocksOfficialModel(t *testing.T) {
	payload := map[string]any{
		"professional_mode":  true,
		"model":              "gpt-image-2",
		"size":               "1:1",
		"image_resolution":   "1080p",
		"quality":            "high",
		"output_format":      "webp",
		"output_compression": 88,
		"background":         "opaque",
		"moderation":         "low",
		"n":                  2,
	}

	NormalizeProStudioRequest(payload)
	if payload["model"] != OfficialImageModel {
		t.Fatalf("model = %#v, want %s", payload["model"], OfficialImageModel)
	}
	if payload["image_resolution"] != "1k" || payload["resolution"] != "1k" {
		t.Fatalf("resolution = %#v/%#v, want 1k", payload["image_resolution"], payload["resolution"])
	}
	settings := payload["official_settings"].(map[string]any)
	if settings["output_format"] != "webp" || settings["output_compression"] != 88 {
		t.Fatalf("official settings output = %#v", settings)
	}
	if err := ValidateProStudioRequest(payload); err != nil {
		t.Fatalf("ValidateProStudioRequest() error = %v", err)
	}
}

func TestValidateProStudioRequestRejectsInvalidValues(t *testing.T) {
	tests := []struct {
		name    string
		patch   map[string]any
		wantErr bool
	}{
		{name: "n too high", patch: map[string]any{"n": 5}, wantErr: true},
		{name: "invalid resolution", patch: map[string]any{"image_resolution": "5k"}, wantErr: true},
		{name: "invalid quality", patch: map[string]any{"quality": "ultra"}, wantErr: true},
		{name: "transparent background", patch: map[string]any{"background": "transparent"}, wantErr: true},
		{name: "png compression", patch: map[string]any{"output_format": "png", "output_compression": 80}, wantErr: true},
		{name: "webp compression", patch: map[string]any{"output_format": "webp", "output_compression": 80}, wantErr: false},
		{name: "mask without reference", patch: map[string]any{"input_image_mask": "https://cdn.example/mask.png"}, wantErr: true},
		{name: "mask with reference", patch: map[string]any{"input_image_mask": "https://cdn.example/mask.png", "image_urls": []string{"https://cdn.example/ref.png"}}, wantErr: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			payload := map[string]any{
				"professional_mode": true,
				"prompt":            "draw",
				"model":             "wrong",
				"size":              "1:1",
				"image_resolution":  "4k",
				"quality":           "high",
				"output_format":     "webp",
				"background":        "opaque",
				"moderation":        "auto",
				"n":                 1,
			}
			for key, value := range tt.patch {
				payload[key] = value
			}
			NormalizeProStudioRequest(payload)
			err := ValidateProStudioRequest(payload)
			if tt.wantErr && err == nil {
				t.Fatal("ValidateProStudioRequest() = nil, want error")
			}
			if !tt.wantErr && err != nil {
				t.Fatalf("ValidateProStudioRequest() error = %v", err)
			}
		})
	}
}
