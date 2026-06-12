package service

import (
	"strings"
	"testing"

	"chatgpt2api/internal/storage"
)

func TestTextAssetServicePersonalCRUDSearchAndIsolation(t *testing.T) {
	service := NewTextAssetService(newTestStorageBackend(t))
	alice := TextAssetAccessScope{OwnerID: "user-alice", OwnerName: "Alice"}
	bob := TextAssetAccessScope{OwnerID: "user-bob", OwnerName: "Bob"}

	item, err := service.Create(map[string]any{
		"content": "第一行标题\n这是一段社媒文案素材",
	}, alice)
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}
	if item["kind"] != TextAssetKind || item["name"] != "第一行标题" || item["preview"] == "" || item["owner_id"] != "user-alice" {
		t.Fatalf("Create() = %#v", item)
	}

	if got := service.List(TextAssetListOptions{Search: "社媒"}, alice); len(got.Items) != 1 {
		t.Fatalf("List(search) items = %#v", got.Items)
	}
	if got := service.List(TextAssetListOptions{}, bob); len(got.Items) != 0 {
		t.Fatalf("bob List() items = %#v", got.Items)
	}

	updated, err := service.Update(item["id"].(string), map[string]any{
		"name":    "更新名称",
		"content": "更新后的素材正文",
	}, alice)
	if err != nil {
		t.Fatalf("Update() error = %v", err)
	}
	if updated["name"] != "更新名称" || updated["content"] != "更新后的素材正文" {
		t.Fatalf("Update() = %#v", updated)
	}
	if _, err := service.Update(item["id"].(string), map[string]any{"content": "Bob update"}, bob); err == nil {
		t.Fatalf("Update(other owner) error = nil")
	}

	if removed, err := service.Delete(item["id"].(string), bob); err != nil || removed {
		t.Fatalf("Delete(other owner) = true")
	}
	if removed, err := service.Delete(item["id"].(string), alice); err != nil || !removed {
		t.Fatalf("Delete(owner) = %v, %v", removed, err)
	}
	if got := service.List(TextAssetListOptions{}, alice); len(got.Items) != 0 {
		t.Fatalf("List(after delete) items = %#v", got.Items)
	}
}

func TestTextAssetServiceValidationAndPagination(t *testing.T) {
	service := NewTextAssetService(newTestStorageBackend(t))
	scope := TextAssetAccessScope{OwnerID: "user-alice"}
	if _, err := service.Create(map[string]any{"content": ""}, scope); err == nil {
		t.Fatalf("Create(empty content) error = nil")
	}
	if _, err := service.Create(map[string]any{"content": strings.Repeat("字", TextAssetMaxContentLen+1)}, scope); err == nil {
		t.Fatalf("Create(too long content) error = nil")
	}

	first, err := service.Create(map[string]any{"name": "A", "content": "alpha"}, scope)
	if err != nil {
		t.Fatalf("Create(first) error = %v", err)
	}
	second, err := service.Create(map[string]any{"name": "B", "content": "beta"}, scope)
	if err != nil {
		t.Fatalf("Create(second) error = %v", err)
	}
	page := service.List(TextAssetListOptions{PageSize: 1}, scope)
	if len(page.Items) != 1 || !page.HasMore || page.NextCursor == "" {
		t.Fatalf("first page = %#v", page)
	}
	next := service.List(TextAssetListOptions{PageSize: 1, Cursor: page.NextCursor}, scope)
	if len(next.Items) != 1 {
		t.Fatalf("second page = %#v", next)
	}
	seen := map[string]bool{
		first["id"].(string):  false,
		second["id"].(string): false,
	}
	seen[page.Items[0]["id"].(string)] = true
	seen[next.Items[0]["id"].(string)] = true
	for id, ok := range seen {
		if !ok {
			t.Fatalf("missing paged item %s, first=%#v second=%#v", id, page, next)
		}
	}
}

func TestTextAssetServiceTeamReadAndManagerWrite(t *testing.T) {
	service := NewTextAssetService(newTestStorageBackend(t))
	member := TextAssetAccessScope{TeamID: "team-1", TeamName: "Design Team"}
	manager := TextAssetAccessScope{TeamID: "team-1", TeamName: "Design Team", TeamManager: true}
	otherTeam := TextAssetAccessScope{TeamID: "team-2", TeamName: "Other Team", TeamManager: true}

	if _, err := service.Create(map[string]any{"content": "普通成员不能写"}, member); err == nil {
		t.Fatalf("Create(team member) error = nil")
	}
	item, err := service.Create(map[string]any{"name": "团队素材", "content": "团队可读文本"}, manager)
	if err != nil {
		t.Fatalf("Create(team manager) error = %v", err)
	}
	if item["library_scope"] != ImageLibraryScopeTeam || item["team_id"] != "team-1" || item["owner_id"] != nil {
		t.Fatalf("team item = %#v", item)
	}
	if got := service.List(TextAssetListOptions{}, member); len(got.Items) != 1 {
		t.Fatalf("member List() items = %#v", got.Items)
	}
	if got := service.List(TextAssetListOptions{}, otherTeam); len(got.Items) != 0 {
		t.Fatalf("other team List() items = %#v", got.Items)
	}
	if _, err := service.Update(item["id"].(string), map[string]any{"content": "普通成员不能改"}, member); err == nil {
		t.Fatalf("Update(team member) error = nil")
	}
	if _, err := service.Update(item["id"].(string), map[string]any{"content": "已更新"}, manager); err != nil {
		t.Fatalf("Update(team manager) error = %v", err)
	}
}

func TestTextAssetServiceDeleteReturnsSaveError(t *testing.T) {
	backend := newTestStorageBackend(t)
	service := NewTextAssetService(backend)
	scope := TextAssetAccessScope{OwnerID: "user-alice"}
	item, err := service.Create(map[string]any{"content": "待删除文本"}, scope)
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	store := &failingJSONDocumentStore{base: backend.(storage.JSONDocumentBackend), failName: textAssetsDocumentName}
	failingService := &TextAssetService{store: store}
	removed, err := failingService.Delete(item["id"].(string), scope)
	if err == nil {
		t.Fatalf("Delete(save failure) error = nil")
	}
	if removed {
		t.Fatalf("Delete(save failure) removed = true")
	}
	if got := service.List(TextAssetListOptions{}, scope); len(got.Items) != 1 {
		t.Fatalf("failed delete should remain visible: %#v", got.Items)
	}
}
