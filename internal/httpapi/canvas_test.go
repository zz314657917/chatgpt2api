package httpapi

import (
	"bytes"
	"context"
	"strings"
	"testing"

	"chatgpt2api/internal/backend"
	"chatgpt2api/internal/protocol"
	"chatgpt2api/internal/service"
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
		util.ImageModelGeminiFlash: true,
		util.ImageModelGeminiPro:   true,
		util.ImageModelCodex:       false,
		"gpt-image-1.5":            true,
	})
	assertCanvasModelCapabilities(t, items, util.ImageModelGPTOfficial, "image")
	assertCanvasModelCapabilities(t, items, util.ImageModelGeminiFlash, "image")
	assertCanvasModelName(t, items, util.ImageModelGeminiFlash, "Nano Banana 2")
	assertCanvasModelName(t, items, util.ImageModelGeminiPro, "Nano Banana Pro")
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

func TestCanvasGenerationNodeUsesMaskAsInputImageMask(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()
	requests := make(chan protocol.ConversationRequest, 1)
	installHTTPTestImageStreamFunc(t, app, func(ctx context.Context, client *backend.Client, request protocol.ConversationRequest, index, total int) (<-chan protocol.ImageOutput, <-chan error) {
		requests <- request
		return httpTestImageOutputStream(request, index)
	})

	identity := service.Identity{ID: "admin", Name: "Admin", Role: service.AuthRoleAdmin, OwnerID: "admin"}
	var original bytes.Buffer
	if err := encodeHTTPTestPNG(&original); err != nil {
		t.Fatalf("encode original: %v", err)
	}
	originalItem, err := app.images.StoreUploadedImage("http://127.0.0.1:8000", service.UploadedManagedImage{
		Filename:    "source.png",
		ContentType: "image/png",
		Data:        original.Bytes(),
	}, identity.OwnerID, identity.Name, service.ImageVisibilityPrivate)
	if err != nil {
		t.Fatalf("StoreUploadedImage(original) error = %v", err)
	}
	var mask bytes.Buffer
	if err := encodeHTTPTestPNG(&mask); err != nil {
		t.Fatalf("encode mask: %v", err)
	}
	maskItem, err := app.images.StoreUploadedImage("http://127.0.0.1:8000", service.UploadedManagedImage{
		Filename:    "source_mask.png",
		ContentType: "image/png",
		Data:        mask.Bytes(),
	}, identity.OwnerID, identity.Name, service.ImageVisibilityPrivate)
	if err != nil {
		t.Fatalf("StoreUploadedImage(mask) error = %v", err)
	}

	out, err := app.ExecuteCanvasNode(context.Background(), identity, service.CanvasNodeExecution{
		RunID:    "run-mask",
		CanvasID: "canvas-mask",
		Node: service.CanvasNode{
			ID:   "generator",
			Type: service.CanvasNodeTypeImageCreate,
			Data: map[string]any{"prompt": "replace the selected area", "model": util.ImageModelGPT},
		},
		Inputs: []service.CanvasNodeInput{{
			NodeID: "mask-node",
			Output: service.CanvasNodeOutput{Images: []service.CanvasImageRef{
				{Path: util.Clean(originalItem["path"]), Name: "source.png"},
				{Path: util.Clean(maskItem["path"]), Name: "source_mask.png", Role: "mask"},
			}},
		}},
	})
	if err != nil {
		t.Fatalf("ExecuteCanvasNode() error = %v", err)
	}
	if len(out.Images) == 0 {
		t.Fatalf("ExecuteCanvasNode() output = %#v", out)
	}
	var request protocol.ConversationRequest
	select {
	case request = <-requests:
	default:
		t.Fatal("image request was not captured")
	}
	if len(request.Images) != 1 {
		t.Fatalf("request.Images length = %d, want 1", len(request.Images))
	}
	if !strings.HasPrefix(request.InputImageMask, "data:image/png;base64,") {
		t.Fatalf("InputImageMask = %q, want image data URL", request.InputImageMask)
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

func assertCanvasModelName(t *testing.T, items []canvasModelOption, id string, name string) {
	t.Helper()
	for _, item := range items {
		if item.ID != id {
			continue
		}
		if item.Name != name {
			t.Fatalf("model %q name = %q, want %q", id, item.Name, name)
		}
		return
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
