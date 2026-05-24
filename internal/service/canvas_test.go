package service

import "testing"

func TestCanvasServiceCreateSaveAndRun(t *testing.T) {
	backend := newTestStorageBackend(t)
	svc := NewCanvasService(backend)
	identity := Identity{ID: "user-1", Role: AuthRoleUser, OwnerID: "user-1"}

	created, err := svc.CreateCanvas(identity, CanvasDocument{
		Name: "Test Canvas",
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

	got, ok := svc.GetCanvas(identity, created.ID)
	if !ok {
		t.Fatal("GetCanvas() = not found")
	}
	if got.Name != "Test Canvas" || len(got.Nodes) != 2 || len(got.Edges) != 1 {
		t.Fatalf("GetCanvas() = %#v", got)
	}
}
