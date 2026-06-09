package service

import (
	"strings"
	"testing"

	"chatgpt2api/internal/storage"
)

type testSub2APILaunchConfig struct {
	gatewayBaseURL string
}

func (c testSub2APILaunchConfig) Sub2APIRedeemURL() string           { return "" }
func (c testSub2APILaunchConfig) Sub2APIRedeemSecret() string        { return "" }
func (c testSub2APILaunchConfig) Sub2APIGatewayBaseURL() string      { return c.gatewayBaseURL }
func (c testSub2APILaunchConfig) Sub2APIDefaultChatGroupID() string  { return "" }
func (c testSub2APILaunchConfig) Sub2APIDefaultImageGroupID() string { return "" }
func (c testSub2APILaunchConfig) Sub2APIDefaultVideoGroupID() string { return "" }

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

func TestSub2APIBindingStoreIgnoresNilStringSessionToken(t *testing.T) {
	store := newTestSub2APIBindingStore(t)

	if err := store.Save(Sub2APIBinding{
		OwnerID:        "sub2api:42",
		Sub2APIUserID:  "42",
		SessionToken:   "<nil>",
		APIKeyID:       "7",
		APIKey:         "sk-test-old",
		GatewayBaseURL: "https://gateway.example.com/v1",
	}); err == nil {
		t.Fatal("Save() succeeded with <nil> session token, want error")
	}

	if _, ok := store.Get("sub2api:42"); ok {
		t.Fatal("Get() returned binding with <nil> session token")
	}
}

func TestSub2APIPublicDisplayNameSkipsInternalID(t *testing.T) {
	if got := sub2APIPublicDisplayName("sub2api:42"); got != "" {
		t.Fatalf("sub2APIPublicDisplayName(internal) = %q, want empty", got)
	}
	if got := sub2APIPublicDisplayName("", "sub2api:42", "Alice"); got != "Alice" {
		t.Fatalf("sub2APIPublicDisplayName(fallback) = %q, want Alice", got)
	}
}

func TestSub2APIBindingFromRedeemBodyRequiresEmail(t *testing.T) {
	svc := &Sub2APILaunchService{config: testSub2APILaunchConfig{gatewayBaseURL: "https://gateway.example.com/v1"}}

	_, err := svc.bindingFromRedeemBody(map[string]any{"user_id": "42"})
	if err == nil || !strings.Contains(err.Error(), "missing email") {
		t.Fatalf("bindingFromRedeemBody() error = %v, want missing email", err)
	}

	binding, err := svc.bindingFromRedeemBody(map[string]any{"user_id": "42", "user": map[string]any{"email": "user@example.com"}})
	if err != nil {
		t.Fatalf("bindingFromRedeemBody(with email) error = %v", err)
	}
	if binding.UserEmail != "user@example.com" {
		t.Fatalf("binding email = %q, want user@example.com", binding.UserEmail)
	}
}

func TestSub2APIChargePayloadConvertsCNYMilliToYuan(t *testing.T) {
	svc := &Sub2APILaunchService{}

	payload := svc.chargePayload("sub2api:42", "sub2api:99", "team-1", "task-1", "generate", "gpt-image-2", "charge-1", 50)

	if got := payload["amount"]; got != 0.05 {
		t.Fatalf("payload amount = %#v, want 0.05", got)
	}
	if payload["task_id"] != "task-1" || payload["mode"] != "generate" || payload["model"] != "gpt-image-2" || payload["actor_user_id"] != "sub2api:99" || payload["team_id"] != "team-1" {
		t.Fatalf("payload missing structured metadata: %#v", payload)
	}
}
