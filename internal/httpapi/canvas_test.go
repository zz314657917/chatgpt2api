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
	}, true)
	assertCanvasModelIDs(t, modelListItems, map[string]bool{
		util.ImageModelCodex: false,
		util.ImageModelGPT:   true,
		"remote-image":       true,
	})
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
