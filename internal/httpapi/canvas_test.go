package httpapi

import (
	"testing"

	"chatgpt2api/internal/util"
)

func TestCanvasModelOptionsHideCodexImageRoute(t *testing.T) {
	catalogItems := canvasModelOptionsFromCatalog(map[string]any{
		"items": []map[string]any{
			{"id": util.ImageModelCodex, "name": util.ImageModelCodex, "capabilities": []string{"image"}, "enabled": true},
			{"id": util.ImageModelGPT, "name": util.ImageModelGPT, "capabilities": []string{"image"}, "enabled": true},
		},
	})
	assertCanvasModelIDs(t, catalogItems, map[string]bool{
		util.ImageModelCodex: false,
		util.ImageModelGPT:   true,
	})

	modelListItems := canvasModelOptionsFromModelList(map[string]any{
		"data": []map[string]any{
			{"id": util.ImageModelCodex},
			{"id": "remote-image"},
		},
	}, true, false)
	assertCanvasModelIDs(t, modelListItems, map[string]bool{
		util.ImageModelCodex: false,
		util.ImageModelGPT:   true,
		"remote-image":       true,
	})
}

func TestAddBuiltInCanvasImageModelsIncludesOfficialRoute(t *testing.T) {
	items := addBuiltInCanvasImageModels(canvasModelOptionsFromCatalog(map[string]any{
		"items": []map[string]any{
			{"id": util.ImageModelGPT, "name": "remote gpt-image-2", "capabilities": []string{"image"}, "enabled": true},
			{"id": util.ImageModelCodex, "name": util.ImageModelCodex, "capabilities": []string{"image"}, "enabled": true},
			{"id": "gpt-image-1.5", "name": "gpt-image-1.5", "capabilities": []string{"image"}, "enabled": true},
		},
	}))

	assertCanvasModelIDs(t, items, map[string]bool{
		util.ImageModelGPT:         true,
		util.ImageModelGPTOfficial: true,
		util.ImageModelCodex:       false,
		"gpt-image-1.5":            true,
	})
	assertCanvasModelCapabilities(t, items, util.ImageModelGPTOfficial, "image")
}

func TestCanvasModelOptionsDoNotExposeVideoWithoutSub2APIBinding(t *testing.T) {
	modelListItems := canvasModelOptionsFromModelList(map[string]any{
		"data": []map[string]any{
			{"id": "sora-2"},
			{"id": "kling-v3-omni"},
		},
	}, true, false)

	kinds := map[string]string{}
	capabilities := map[string][]string{}
	for _, item := range modelListItems {
		kinds[item.ID] = item.Kind
		capabilities[item.ID] = item.Capabilities
	}
	for _, id := range []string{"sora-2", "kling-v3-omni"} {
		if kinds[id] == "video" {
			t.Fatalf("model %q kind = video, want non-video in %#v", id, modelListItems)
		}
		if hasCanvasTestCapability(capabilities[id], "video") {
			t.Fatalf("model %q capabilities = %#v, want no video", id, capabilities[id])
		}
	}
}

func TestCanvasModelOptionsAllowVideoForSub2APIModelList(t *testing.T) {
	modelListItems := canvasModelOptionsFromModelList(map[string]any{
		"data": []map[string]any{
			{"id": "sora-2"},
		},
	}, false, true)

	if len(modelListItems) != 1 {
		t.Fatalf("model list items = %#v", modelListItems)
	}
	if modelListItems[0].Kind != "video" || !hasCanvasTestCapability(modelListItems[0].Capabilities, "video") {
		t.Fatalf("model option = %#v, want video capability", modelListItems[0])
	}
}

func assertCanvasModelIDs(t *testing.T, items []canvasModelOption, wants map[string]bool) {
	t.Helper()
	seen := map[string]bool{}
	for _, item := range items {
		seen[item.ID] = true
	}
	for id, want := range wants {
		if seen[id] != want {
			t.Fatalf("model %q presence = %v, want %v in %#v", id, seen[id], want, items)
		}
	}
}

func assertCanvasModelCapabilities(t *testing.T, items []canvasModelOption, id string, capability string) {
	t.Helper()
	for _, item := range items {
		if item.ID == id {
			if !hasCanvasTestCapability(item.Capabilities, capability) {
				t.Fatalf("model %q capabilities = %#v, want %q in %#v", id, item.Capabilities, capability, items)
			}
			return
		}
	}
	t.Fatalf("model %q not found in %#v", id, items)
}

func hasCanvasTestCapability(capabilities []string, want string) bool {
	for _, item := range capabilities {
		if item == want {
			return true
		}
	}
	return false
}
