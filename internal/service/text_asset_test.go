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

func TestTextAssetServiceCollectionsAssignFilterRenameAndDelete(t *testing.T) {
	service := NewTextAssetService(newTestStorageBackend(t))
	scope := TextAssetAccessScope{OwnerID: "user-alice", OwnerName: "Alice"}
	other := TextAssetAccessScope{OwnerID: "user-bob", OwnerName: "Bob"}

	first, err := service.Create(map[string]any{"name": "A", "content": "alpha"}, scope)
	if err != nil {
		t.Fatalf("Create(first) error = %v", err)
	}
	second, err := service.Create(map[string]any{"name": "B", "content": "beta"}, scope)
	if err != nil {
		t.Fatalf("Create(second) error = %v", err)
	}
	collection, err := service.CreateTextAssetCollection("角色", scope)
	if err != nil {
		t.Fatalf("CreateTextAssetCollection() error = %v", err)
	}
	if collection.ID == "" || collection.Name != "角色" || collection.OwnerID != "user-alice" {
		t.Fatalf("CreateTextAssetCollection() = %#v", collection)
	}
	if _, err := service.CreateTextAssetCollection("角色", scope); err == nil {
		t.Fatalf("CreateTextAssetCollection(duplicate) error = nil")
	}
	if _, err := service.UpdateTextAssetCollectionItems(collection.ID, []string{first["id"].(string), "missing"}, other); err == nil {
		t.Fatalf("UpdateTextAssetCollectionItems(other owner) error = nil")
	}
	result, err := service.UpdateTextAssetCollectionItems(collection.ID, []string{first["id"].(string)}, scope)
	if err != nil {
		t.Fatalf("UpdateTextAssetCollectionItems() error = %v", err)
	}
	if result["updated"] != 1 || result["collection_name"] != "角色" {
		t.Fatalf("UpdateTextAssetCollectionItems() = %#v", result)
	}
	filtered := service.List(TextAssetListOptions{CollectionID: collection.ID}, scope)
	if len(filtered.Items) != 1 || filtered.Items[0]["id"] != first["id"] || filtered.Items[0]["collection_name"] != "角色" {
		t.Fatalf("List(collection) = %#v", filtered)
	}
	unclassified := service.List(TextAssetListOptions{CollectionID: TextAssetCollectionUnclassifiedID}, scope)
	if len(unclassified.Items) != 1 || unclassified.Items[0]["id"] != second["id"] {
		t.Fatalf("List(unclassified) = %#v", unclassified)
	}
	collections := service.ListTextAssetCollectionsResult(scope)
	if len(collections.Items) != 1 || collections.Items[0].TextsCount != 1 || collections.UnclassifiedCount != 1 {
		t.Fatalf("ListTextAssetCollectionsResult() = %#v", collections)
	}
	renamed, err := service.RenameTextAssetCollection(collection.ID, "场景", scope)
	if err != nil {
		t.Fatalf("RenameTextAssetCollection() error = %v", err)
	}
	if renamed.Name != "场景" || renamed.TextsCount != 1 {
		t.Fatalf("RenameTextAssetCollection() = %#v", renamed)
	}
	filtered = service.List(TextAssetListOptions{CollectionID: collection.ID}, scope)
	if len(filtered.Items) != 1 || filtered.Items[0]["collection_name"] != "场景" {
		t.Fatalf("List(after rename) = %#v", filtered)
	}
	deleted, err := service.DeleteTextAssetCollection(collection.ID, scope)
	if err != nil {
		t.Fatalf("DeleteTextAssetCollection() error = %v", err)
	}
	if deleted["deleted"] != true || deleted["cleared"] != 1 {
		t.Fatalf("DeleteTextAssetCollection() = %#v", deleted)
	}
	filtered = service.List(TextAssetListOptions{CollectionID: collection.ID}, scope)
	if len(filtered.Items) != 0 {
		t.Fatalf("List(deleted collection) = %#v", filtered)
	}
	unclassified = service.List(TextAssetListOptions{CollectionID: TextAssetCollectionUnclassifiedID}, scope)
	if len(unclassified.Items) != 2 {
		t.Fatalf("List(unclassified after delete) = %#v", unclassified)
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

func TestTextAssetServiceTeamCollectionsRequireManager(t *testing.T) {
	service := NewTextAssetService(newTestStorageBackend(t))
	member := TextAssetAccessScope{TeamID: "team-1", TeamName: "Design Team"}
	manager := TextAssetAccessScope{TeamID: "team-1", TeamName: "Design Team", TeamManager: true}
	otherTeam := TextAssetAccessScope{TeamID: "team-2", TeamName: "Other Team", TeamManager: true}

	if _, err := service.CreateTextAssetCollection("团队分类", member); err == nil {
		t.Fatalf("CreateTextAssetCollection(member) error = nil")
	}
	collection, err := service.CreateTextAssetCollection("团队分类", manager)
	if err != nil {
		t.Fatalf("CreateTextAssetCollection(manager) error = %v", err)
	}
	item, err := service.Create(map[string]any{"name": "团队素材", "content": "团队文本"}, manager)
	if err != nil {
		t.Fatalf("Create(team item) error = %v", err)
	}
	if _, err := service.UpdateTextAssetCollectionItems(collection.ID, []string{item["id"].(string)}, member); err == nil {
		t.Fatalf("UpdateTextAssetCollectionItems(member) error = nil")
	}
	if _, err := service.UpdateTextAssetCollectionItems(collection.ID, []string{item["id"].(string)}, manager); err != nil {
		t.Fatalf("UpdateTextAssetCollectionItems(manager) error = %v", err)
	}
	if got := service.List(TextAssetListOptions{CollectionID: collection.ID}, member); len(got.Items) != 1 {
		t.Fatalf("member List(collection) items = %#v", got.Items)
	}
	if got := service.List(TextAssetListOptions{CollectionID: collection.ID}, otherTeam); len(got.Items) != 0 {
		t.Fatalf("other team List(collection) items = %#v", got.Items)
	}
	if _, err := service.RenameTextAssetCollection(collection.ID, "其他团队改名", otherTeam); err == nil {
		t.Fatalf("RenameTextAssetCollection(other team) error = nil")
	}
}

func TestTextAssetServiceRenameCollectionRollsBackAssetsOnCollectionSaveError(t *testing.T) {
	backend := newTestStorageBackend(t)
	service := NewTextAssetService(backend)
	scope := TextAssetAccessScope{OwnerID: "user-alice", OwnerName: "Alice"}
	item, err := service.Create(map[string]any{"name": "A", "content": "alpha"}, scope)
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}
	collection, err := service.CreateTextAssetCollection("角色", scope)
	if err != nil {
		t.Fatalf("CreateTextAssetCollection() error = %v", err)
	}
	if _, err := service.UpdateTextAssetCollectionItems(collection.ID, []string{item["id"].(string)}, scope); err != nil {
		t.Fatalf("UpdateTextAssetCollectionItems() error = %v", err)
	}

	store := &failingJSONDocumentStore{base: backend.(storage.JSONDocumentBackend), failName: textAssetCollectionsDocumentName}
	failingService := &TextAssetService{store: store}
	if _, err := failingService.RenameTextAssetCollection(collection.ID, "场景", scope); err == nil {
		t.Fatalf("RenameTextAssetCollection(save failure) error = nil")
	}
	got := service.List(TextAssetListOptions{CollectionID: collection.ID}, scope)
	if len(got.Items) != 1 || got.Items[0]["collection_name"] != "角色" {
		t.Fatalf("failed rename should keep asset collection name: %#v", got.Items)
	}
	collections := service.ListTextAssetCollectionsResult(scope)
	if len(collections.Items) != 1 || collections.Items[0].Name != "角色" || collections.Items[0].TextsCount != 1 {
		t.Fatalf("failed rename should keep collection: %#v", collections)
	}
}

func TestTextAssetServiceDeleteCollectionRollsBackAssetsOnCollectionSaveError(t *testing.T) {
	backend := newTestStorageBackend(t)
	service := NewTextAssetService(backend)
	scope := TextAssetAccessScope{OwnerID: "user-alice", OwnerName: "Alice"}
	item, err := service.Create(map[string]any{"name": "A", "content": "alpha"}, scope)
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}
	collection, err := service.CreateTextAssetCollection("角色", scope)
	if err != nil {
		t.Fatalf("CreateTextAssetCollection() error = %v", err)
	}
	if _, err := service.UpdateTextAssetCollectionItems(collection.ID, []string{item["id"].(string)}, scope); err != nil {
		t.Fatalf("UpdateTextAssetCollectionItems() error = %v", err)
	}

	store := &failingJSONDocumentStore{base: backend.(storage.JSONDocumentBackend), failName: textAssetCollectionsDocumentName}
	failingService := &TextAssetService{store: store}
	if _, err := failingService.DeleteTextAssetCollection(collection.ID, scope); err == nil {
		t.Fatalf("DeleteTextAssetCollection(save failure) error = nil")
	}
	got := service.List(TextAssetListOptions{CollectionID: collection.ID}, scope)
	if len(got.Items) != 1 || got.Items[0]["collection_name"] != "角色" {
		t.Fatalf("failed delete should keep asset collection: %#v", got.Items)
	}
	collections := service.ListTextAssetCollectionsResult(scope)
	if len(collections.Items) != 1 || collections.Items[0].ID != collection.ID || collections.Items[0].TextsCount != 1 {
		t.Fatalf("failed delete should keep collection: %#v", collections)
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
