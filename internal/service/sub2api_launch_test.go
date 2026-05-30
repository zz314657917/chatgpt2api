package service

import (
	"testing"

	"chatgpt2api/internal/storage"
)

func newTestSub2APIBindingStore(t *testing.T) *Sub2APIBindingStore {
	t.Helper()
	backend := newTestStorageBackend(t)
	store, ok := backend.(storage.JSONDocumentBackend)
	if !ok {
		t.Fatalf("storage backend %T does not implement JSONDocumentBackend", backend)
	}
	return NewSub2APIBindingStore(store)
}

func TestSub2APIBindingStorePreservesAPIKeyWhenSessionOnlyLaunchRefreshes(t *testing.T) {
	store := newTestSub2APIBindingStore(t)
	ownerID := "sub2api:42"

	if err := store.Save(Sub2APIBinding{
		OwnerID:        ownerID,
		Sub2APIUserID:  "42",
		UserEmail:      "user@example.com",
		UserName:       "user",
		SessionToken:   "session-old",
		APIKeyID:       "7",
		APIKey:         "sk-test-old",
		APIKeyName:     "image-key",
		APIKeyLast4:    "told",
		GroupID:        "9",
		GroupName:      "image-group",
		GroupPlatform:  "openai",
		GatewayBaseURL: "https://gateway.example.com/v1",
		ExpiresAt:      "2026-05-30T00:00:00Z",
	}); err != nil {
		t.Fatalf("Save(existing) error = %v", err)
	}

	if err := store.Save(preserveSub2APIKeyBinding(store, Sub2APIBinding{
		OwnerID:        ownerID,
		Sub2APIUserID:  "42",
		UserEmail:      "new@example.com",
		UserName:       "new-user",
		SessionToken:   "session-new",
		GatewayBaseURL: "https://gateway.example.com/v1",
		ExpiresAt:      "2026-05-31T00:00:00Z",
	})); err != nil {
		t.Fatalf("Save(refreshed) error = %v", err)
	}

	got, ok := store.Get(ownerID)
	if !ok {
		t.Fatal("Get() did not find refreshed binding")
	}
	if got.SessionToken != "session-new" || got.UserEmail != "new@example.com" || got.UserName != "new-user" || got.ExpiresAt != "2026-05-31T00:00:00Z" {
		t.Fatalf("session fields were not refreshed: %#v", got)
	}
	if got.APIKeyID != "7" || got.APIKey != "sk-test-old" || got.APIKeyName != "image-key" || got.APIKeyLast4 != "told" || got.GroupID != "9" || got.GroupName != "image-group" || got.GroupPlatform != "openai" {
		t.Fatalf("api key fields were not preserved: %#v", got)
	}
}

func TestSub2APIBindingStoreReplacesAPIKeyWhenLaunchIncludesAPIKey(t *testing.T) {
	store := newTestSub2APIBindingStore(t)
	ownerID := "sub2api:42"

	if err := store.Save(Sub2APIBinding{
		OwnerID:        ownerID,
		Sub2APIUserID:  "42",
		SessionToken:   "session-old",
		APIKeyID:       "7",
		APIKey:         "sk-test-old",
		APIKeyName:     "old-key",
		APIKeyLast4:    "told",
		GroupID:        "9",
		GroupName:      "old-group",
		GroupPlatform:  "openai",
		GatewayBaseURL: "https://gateway.example.com/v1",
	}); err != nil {
		t.Fatalf("Save(existing) error = %v", err)
	}

	if err := store.Save(preserveSub2APIKeyBinding(store, Sub2APIBinding{
		OwnerID:        ownerID,
		Sub2APIUserID:  "42",
		SessionToken:   "session-new",
		APIKeyID:       "8",
		APIKey:         "sk-test-new",
		APIKeyName:     "new-key",
		APIKeyLast4:    "tnew",
		GroupID:        "10",
		GroupName:      "new-group",
		GroupPlatform:  "openai",
		GatewayBaseURL: "https://gateway.example.com/v1",
	})); err != nil {
		t.Fatalf("Save(refreshed) error = %v", err)
	}

	got, ok := store.Get(ownerID)
	if !ok {
		t.Fatal("Get() did not find refreshed binding")
	}
	if got.APIKeyID != "8" || got.APIKey != "sk-test-new" || got.APIKeyName != "new-key" || got.APIKeyLast4 != "tnew" || got.GroupID != "10" || got.GroupName != "new-group" {
		t.Fatalf("api key fields were not replaced: %#v", got)
	}
}
