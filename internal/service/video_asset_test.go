package service

import "testing"

func TestVideoAssetServiceCollectionsAssignFilterRenameDeleteAndIsolation(t *testing.T) {
	service := NewVideoAssetService(newTestStorageBackend(t))
	alice := VideoAssetAccessScope{OwnerID: "user-alice", OwnerName: "Alice"}
	bob := VideoAssetAccessScope{OwnerID: "user-bob", OwnerName: "Bob"}
	assetIDs := []string{"video-task:0", "video-task:1"}

	collection, err := service.CreateVideoAssetCollection("广告", alice)
	if err != nil {
		t.Fatalf("CreateVideoAssetCollection() error = %v", err)
	}
	if collection.ID == "" || collection.Name != "广告" || collection.OwnerID != "user-alice" {
		t.Fatalf("CreateVideoAssetCollection() = %#v", collection)
	}
	if _, err := service.CreateVideoAssetCollection("广告", alice); err == nil {
		t.Fatalf("CreateVideoAssetCollection(duplicate) error = nil")
	}
	if _, err := service.UpdateVideoAssetCollectionItems(collection.ID, []string{assetIDs[0]}, bob); err == nil {
		t.Fatalf("UpdateVideoAssetCollectionItems(other owner collection) error = nil")
	}
	result, err := service.UpdateVideoAssetCollectionItems(collection.ID, []string{assetIDs[0], "bad:id:extra", "video-task:x"}, alice)
	if err != nil {
		t.Fatalf("UpdateVideoAssetCollectionItems() error = %v", err)
	}
	if got := result["collection_name"]; got != "广告" {
		t.Fatalf("UpdateVideoAssetCollectionItems() collection_name = %#v", got)
	}
	collectionMap := service.CollectionMap(alice, assetIDs)
	if collectionMap[assetIDs[0]]["collection_name"] != "广告" {
		t.Fatalf("CollectionMap() = %#v", collectionMap)
	}
	if otherMap := service.CollectionMap(bob, assetIDs); len(otherMap) != 0 {
		t.Fatalf("bob CollectionMap() = %#v", otherMap)
	}

	listed := service.ListVideoAssetCollectionsResult(alice, assetIDs)
	if len(listed.Items) != 1 || listed.Items[0].VideosCount != 1 || listed.UnclassifiedCount != 1 {
		t.Fatalf("ListVideoAssetCollectionsResult() = %#v", listed)
	}
	renamed, err := service.RenameVideoAssetCollection(collection.ID, "短视频", alice)
	if err != nil {
		t.Fatalf("RenameVideoAssetCollection() error = %v", err)
	}
	if renamed.Name != "短视频" || renamed.VideosCount != 1 {
		t.Fatalf("RenameVideoAssetCollection() = %#v", renamed)
	}
	collectionMap = service.CollectionMap(alice, assetIDs)
	if collectionMap[assetIDs[0]]["collection_name"] != "短视频" {
		t.Fatalf("CollectionMap(after rename) = %#v", collectionMap)
	}

	if _, err := service.UpdateVideoAssetCollectionItems(VideoAssetCollectionUnclassifiedID, []string{assetIDs[0]}, alice); err != nil {
		t.Fatalf("UpdateVideoAssetCollectionItems(unclassified) error = %v", err)
	}
	listed = service.ListVideoAssetCollectionsResult(alice, assetIDs)
	if listed.UnclassifiedCount != 2 {
		t.Fatalf("ListVideoAssetCollectionsResult(after unclassified) = %#v", listed)
	}

	if _, err := service.UpdateVideoAssetCollectionItems(collection.ID, assetIDs, alice); err != nil {
		t.Fatalf("UpdateVideoAssetCollectionItems(reassign) error = %v", err)
	}
	deleted, err := service.DeleteVideoAssetCollection(collection.ID, alice)
	if err != nil {
		t.Fatalf("DeleteVideoAssetCollection() error = %v", err)
	}
	if deleted["deleted"] != true || deleted["cleared"] != 2 {
		t.Fatalf("DeleteVideoAssetCollection() = %#v", deleted)
	}
	listed = service.ListVideoAssetCollectionsResult(alice, assetIDs)
	if listed.UnclassifiedCount != 2 {
		t.Fatalf("ListVideoAssetCollectionsResult(after delete) = %#v", listed)
	}
}

func TestNormalizeVideoAssetID(t *testing.T) {
	if got := NormalizeVideoAssetID("task_01-abc:12"); got != "task_01-abc:12" {
		t.Fatalf("NormalizeVideoAssetID(valid) = %q", got)
	}
	for _, value := range []string{"", "task", "task:x", "task:1:url", "../task:1", "task/1:0"} {
		if got := NormalizeVideoAssetID(value); got != "" {
			t.Fatalf("NormalizeVideoAssetID(%q) = %q, want empty", value, got)
		}
	}
}
