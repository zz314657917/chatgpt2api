package service

import "testing"

func TestCanvasServiceCreateSaveAndRun(t *testing.T) {
	backend := newTestStorageBackend(t)
	svc := NewCanvasService(backend)
	identity := Identity{ID: "user-1", Role: AuthRoleUser, OwnerID: "user-1"}

	created, err := svc.CreateCanvas(identity, CanvasDocument{
		Name:          "Test Canvas",
		Kind:          "smart",
		SchemaVersion: 2,
		Nodes: []CanvasNode{
			{ID: "n1", Type: CanvasNodeTypeText, Name: "Text", Data: map[string]any{"text": "hello"}},
			{ID: "n2", Type: CanvasNodeTypeResult, Name: "Result"},
		},
		Edges: []CanvasEdge{{ID: "e1", Source: "n1", Target: "n2"}},
	})
	if err != nil {
		t.Fatalf("CreateCanvas() error = %v", err)
	}
	if created.OwnerID != identity.OwnerID {
		t.Fatalf("CreateCanvas() owner = %q, want %q", created.OwnerID, identity.OwnerID)
	}
	if created.Kind != "smart" || created.SchemaVersion != 2 {
		t.Fatalf("CreateCanvas() smart metadata = %q/%d, want smart/2", created.Kind, created.SchemaVersion)
	}

	got, ok := svc.GetCanvas(identity, created.ID)
	if !ok {
		t.Fatal("GetCanvas() = not found")
	}
	if got.Name != "Test Canvas" || len(got.Nodes) != 2 || len(got.Edges) != 1 {
		t.Fatalf("GetCanvas() = %#v", got)
	}
}

func TestCanvasServiceStripsRoutingSecretsFromNodeData(t *testing.T) {
	backend := newTestStorageBackend(t)
	svc := NewCanvasService(backend)
	identity := Identity{ID: "user-1", Role: AuthRoleUser, OwnerID: "user-1"}

	created, err := svc.CreateCanvas(identity, CanvasDocument{
		Name: "Routing Secrets",
		Nodes: []CanvasNode{
			{
				ID:   "n1",
				Type: CanvasNodeTypeImageCreate,
				Data: map[string]any{
					"prompt":      "draw",
					"model":       "gpt-image-2",
					"api_key":     "sk-secret",
					"apiKey":      "sk-secret",
					"base_url":    "https://example.test",
					"baseURL":     "https://example.test",
					"group_id":    "group-1",
					"groupId":     "group-1",
					"secret_key":  "secret",
					"gateway_url": "https://gateway.test",
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("CreateCanvas() error = %v", err)
	}
	assertCanvasNodeDataHasNoRoutingSecrets(t, created.Nodes[0].Data)
	if got := created.Nodes[0].Data["model"]; got != "gpt-image-2" {
		t.Fatalf("CreateCanvas() model = %v, want gpt-image-2", got)
	}

	saved, err := svc.SaveCanvas(identity, created.ID, CanvasDocument{
		Name: "Routing Secrets Updated",
		Nodes: []CanvasNode{
			{
				ID:   "n1",
				Type: CanvasNodeTypeImageCreate,
				Data: map[string]any{
					"prompt":   "draw updated",
					"model":    "auto",
					"api_key":  "sk-updated",
					"base_url": "https://updated.test",
					"group_id": "group-2",
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("SaveCanvas() error = %v", err)
	}
	assertCanvasNodeDataHasNoRoutingSecrets(t, saved.Nodes[0].Data)
	if got := saved.Nodes[0].Data["prompt"]; got != "draw updated" {
		t.Fatalf("SaveCanvas() prompt = %v, want draw updated", got)
	}

	got, ok := svc.GetCanvas(identity, created.ID)
	if !ok {
		t.Fatal("GetCanvas() = not found")
	}
	assertCanvasNodeDataHasNoRoutingSecrets(t, got.Nodes[0].Data)
}

func TestCanvasServiceAllowsGroupNode(t *testing.T) {
	backend := newTestStorageBackend(t)
	svc := NewCanvasService(backend)
	identity := Identity{ID: "user-1", Role: AuthRoleUser, OwnerID: "user-1"}

	created, err := svc.CreateCanvas(identity, CanvasDocument{
		Name:          "Group Canvas",
		Kind:          "smart",
		SchemaVersion: 2,
		Nodes: []CanvasNode{
			{ID: "img1", Type: CanvasNodeTypeImage, Name: "Image", Data: map[string]any{"path": "images/a.png"}},
			{ID: "prompt1", Type: CanvasNodeTypePrompt, Name: "Prompt", Data: map[string]any{"prompt": "keep style"}},
			{ID: "group1", Type: CanvasNodeTypeGroup, Name: "Group", Data: map[string]any{"group_item_ids": []any{"img1", "prompt1"}}},
			{ID: "out1", Type: CanvasNodeTypeResult, Name: "Output"},
		},
		Edges: []CanvasEdge{{ID: "e1", Source: "group1", Target: "out1"}},
	})
	if err != nil {
		t.Fatalf("CreateCanvas() error = %v", err)
	}

	saved, err := svc.SaveCanvas(identity, created.ID, created)
	if err != nil {
		t.Fatalf("SaveCanvas() error = %v", err)
	}
	if len(saved.Nodes) != 4 || saved.Nodes[2].Type != CanvasNodeTypeGroup {
		t.Fatalf("SaveCanvas() nodes = %#v", saved.Nodes)
	}
}

func assertCanvasNodeDataHasNoRoutingSecrets(t *testing.T, data map[string]any) {
	t.Helper()
	for _, key := range []string{"api_key", "apiKey", "base_url", "baseURL", "group_id", "groupId", "secret_key", "secretKey", "gateway_url", "gatewayURL"} {
		if _, ok := data[key]; ok {
			t.Fatalf("node data contains routing secret field %q: %#v", key, data)
		}
	}
}
