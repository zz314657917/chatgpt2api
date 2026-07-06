package service

import (
	"reflect"
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

func TestSub2APIChargePayloadUsesRawAmount(t *testing.T) {
	svc := &Sub2APILaunchService{}

	payload := svc.chargePayload("sub2api:42", "sub2api:99", "team-1", "task-1", "generate", "gpt-image-2", "charge-1", 0.05, "apimart_cost", map[string]any{
		"image_count":          4,
		"image_size":           "1K",
		"image_size_source":    "input",
		"image_size_breakdown": map[string]any{"1K": 4},
	})

	if got := payload["amount"]; got != 0.05 {
		t.Fatalf("payload amount = %#v, want 0.05", got)
	}
	if got := payload["amount_unit"]; got != "apimart_cost" {
		t.Fatalf("payload amount_unit = %#v, want apimart_cost", got)
	}
	if payload["task_id"] != "task-1" || payload["mode"] != "generate" || payload["model"] != "gpt-image-2" || payload["actor_user_id"] != "sub2api:99" || payload["team_id"] != "team-1" {
		t.Fatalf("payload missing structured metadata: %#v", payload)
	}
	if payload["image_count"] != 4 || payload["image_size"] != "1K" || payload["image_size_source"] != "input" {
		t.Fatalf("payload missing image metadata: %#v", payload)
	}
	if got := payload["image_size_breakdown"]; !reflect.DeepEqual(got, map[string]int{"1K": 4}) {
		t.Fatalf("payload image_size_breakdown = %#v, want 1K:4", got)
	}

	payload = svc.chargePayload("sub2api:42", "", "", "task-2", "generate", "dall-e-3", "charge-2", 0.5, "", nil)
	if _, ok := payload["amount_unit"]; ok {
		t.Fatalf("payload should omit empty amount_unit: %#v", payload)
	}
}

func TestNormalizeSub2APIUsageItemsAddsAmountFromActualCost(t *testing.T) {
	items := []map[string]any{
		{"request_id": "usage-1", "model": "gpt-image-2", "actual_cost": 0.123},
		{"request_id": "usage-2", "model": "gpt-5", "amount": 0.5, "actual_cost": 0.7},
		{"request_id": "usage-3", "model": "gpt-5.4", "cost": "0.25"},
	}

	normalizeSub2APIUsageItems(items)

	if got := items[0]["amount"]; got != 0.123 {
		t.Fatalf("amount from actual_cost = %#v, want 0.123", got)
	}
	if got := items[1]["amount"]; got != 0.5 {
		t.Fatalf("existing amount = %#v, want 0.5", got)
	}
	if got := items[2]["amount"]; got != "0.25" {
		t.Fatalf("amount from cost = %#v, want 0.25", got)
	}
}
