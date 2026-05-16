package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

const sub2APIBindingsDocumentName = "sub2api_user_bindings.json"

type Sub2APILaunchConfig interface {
	Sub2APIRedeemURL() string
	Sub2APIRedeemSecret() string
	Sub2APIGatewayBaseURL() string
}

type Sub2APIBinding struct {
	OwnerID        string `json:"owner_id"`
	Sub2APIUserID  string `json:"sub2api_user_id"`
	UserEmail      string `json:"user_email"`
	UserName       string `json:"user_name"`
	APIKeyID       string `json:"api_key_id"`
	APIKey         string `json:"api_key"`
	APIKeyName     string `json:"api_key_name"`
	APIKeyLast4    string `json:"api_key_last4"`
	GroupID        string `json:"group_id"`
	GroupName      string `json:"group_name"`
	GroupPlatform  string `json:"group_platform"`
	GatewayBaseURL string `json:"gateway_base_url"`
	ExpiresAt      string `json:"expires_at"`
	UpdatedAt      string `json:"updated_at"`
}

func (b Sub2APIBinding) Valid() bool {
	return strings.TrimSpace(b.OwnerID) != "" &&
		strings.TrimSpace(b.APIKey) != "" &&
		strings.TrimSpace(b.GatewayBaseURL) != ""
}

func (b Sub2APIBinding) PublicMap() map[string]any {
	return map[string]any{
		"owner_id":          b.OwnerID,
		"sub2api_user_id":   b.Sub2APIUserID,
		"user_email":        b.UserEmail,
		"user_name":         b.UserName,
		"api_key_id":        b.APIKeyID,
		"api_key_name":      b.APIKeyName,
		"api_key_last4":     b.APIKeyLast4,
		"group_id":          b.GroupID,
		"group_name":        b.GroupName,
		"group_platform":    b.GroupPlatform,
		"gateway_base_url":  b.GatewayBaseURL,
		"expires_at":        b.ExpiresAt,
		"updated_at":        b.UpdatedAt,
		"has_bound_api_key": b.APIKey != "",
	}
}

type Sub2APIBindingStore struct {
	mu       sync.RWMutex
	store    storage.JSONDocumentBackend
	bindings map[string]Sub2APIBinding
}

func NewSub2APIBindingStore(store storage.JSONDocumentBackend) *Sub2APIBindingStore {
	s := &Sub2APIBindingStore{store: store, bindings: map[string]Sub2APIBinding{}}
	s.bindings = s.load()
	return s
}

func (s *Sub2APIBindingStore) Get(ownerID string) (Sub2APIBinding, bool) {
	ownerID = util.Clean(ownerID)
	if ownerID == "" || s == nil {
		return Sub2APIBinding{}, false
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	binding, ok := s.bindings[ownerID]
	return binding, ok && binding.Valid()
}

func (s *Sub2APIBindingStore) Save(binding Sub2APIBinding) error {
	if s == nil {
		return fmt.Errorf("sub2api binding store is unavailable")
	}
	binding = normalizeSub2APIBinding(binding)
	if !binding.Valid() {
		return fmt.Errorf("sub2api binding is incomplete")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.bindings[binding.OwnerID] = binding
	return s.saveLocked()
}

func (s *Sub2APIBindingStore) load() map[string]Sub2APIBinding {
	out := map[string]Sub2APIBinding{}
	raw := loadStoredJSON(s.store, sub2APIBindingsDocumentName)
	items := util.AsMapSlice(raw)
	if len(items) == 0 {
		items = util.AsMapSlice(util.StringMap(raw)["items"])
	}
	for _, item := range items {
		binding := normalizeSub2APIBinding(Sub2APIBinding{
			OwnerID:        util.Clean(item["owner_id"]),
			Sub2APIUserID:  util.Clean(item["sub2api_user_id"]),
			UserEmail:      util.Clean(item["user_email"]),
			UserName:       util.Clean(item["user_name"]),
			APIKeyID:       util.Clean(item["api_key_id"]),
			APIKey:         util.Clean(item["api_key"]),
			APIKeyName:     util.Clean(item["api_key_name"]),
			APIKeyLast4:    util.Clean(item["api_key_last4"]),
			GroupID:        util.Clean(item["group_id"]),
			GroupName:      util.Clean(item["group_name"]),
			GroupPlatform:  util.Clean(item["group_platform"]),
			GatewayBaseURL: util.Clean(item["gateway_base_url"]),
			ExpiresAt:      util.Clean(item["expires_at"]),
			UpdatedAt:      util.Clean(item["updated_at"]),
		})
		if binding.Valid() {
			out[binding.OwnerID] = binding
		}
	}
	return out
}

func (s *Sub2APIBindingStore) saveLocked() error {
	items := make([]map[string]any, 0, len(s.bindings))
	for _, binding := range s.bindings {
		items = append(items, binding.storedMap())
	}
	return saveStoredJSON(s.store, sub2APIBindingsDocumentName, map[string]any{"items": items})
}

func (b Sub2APIBinding) storedMap() map[string]any {
	return map[string]any{
		"owner_id":         b.OwnerID,
		"sub2api_user_id":  b.Sub2APIUserID,
		"user_email":       b.UserEmail,
		"user_name":        b.UserName,
		"api_key_id":       b.APIKeyID,
		"api_key":          b.APIKey,
		"api_key_name":     b.APIKeyName,
		"api_key_last4":    b.APIKeyLast4,
		"group_id":         b.GroupID,
		"group_name":       b.GroupName,
		"group_platform":   b.GroupPlatform,
		"gateway_base_url": b.GatewayBaseURL,
		"expires_at":       b.ExpiresAt,
		"updated_at":       b.UpdatedAt,
	}
}

func normalizeSub2APIBinding(binding Sub2APIBinding) Sub2APIBinding {
	binding.OwnerID = util.Clean(binding.OwnerID)
	binding.Sub2APIUserID = util.Clean(binding.Sub2APIUserID)
	binding.UserEmail = util.Clean(binding.UserEmail)
	binding.UserName = util.Clean(binding.UserName)
	binding.APIKeyID = util.Clean(binding.APIKeyID)
	binding.APIKey = util.Clean(binding.APIKey)
	binding.APIKeyName = util.Clean(binding.APIKeyName)
	binding.APIKeyLast4 = util.Clean(binding.APIKeyLast4)
	if binding.APIKeyLast4 == "" {
		binding.APIKeyLast4 = apiKeyLast4(binding.APIKey)
	}
	binding.GroupID = util.Clean(binding.GroupID)
	binding.GroupName = util.Clean(binding.GroupName)
	binding.GroupPlatform = util.Clean(binding.GroupPlatform)
	binding.GatewayBaseURL = strings.TrimRight(util.Clean(binding.GatewayBaseURL), "/")
	binding.ExpiresAt = util.Clean(binding.ExpiresAt)
	binding.UpdatedAt = firstNonEmpty(util.Clean(binding.UpdatedAt), util.NowISO())
	return binding
}

type Sub2APILaunchService struct {
	auth     *AuthService
	bindings *Sub2APIBindingStore
	config   Sub2APILaunchConfig
	client   *http.Client
}

type Sub2APILaunchResult struct {
	Identity Identity
	Token    string
	Binding  Sub2APIBinding
}

func NewSub2APILaunchService(auth *AuthService, bindings *Sub2APIBindingStore, cfg Sub2APILaunchConfig) *Sub2APILaunchService {
	return &Sub2APILaunchService{
		auth:     auth,
		bindings: bindings,
		config:   cfg,
		client:   &http.Client{Timeout: 20 * time.Second},
	}
}

func (s *Sub2APILaunchService) Redeem(ctx context.Context, token string) (*Sub2APILaunchResult, error) {
	token = util.Clean(token)
	if token == "" {
		return nil, fmt.Errorf("launch token is required")
	}
	if s == nil || s.auth == nil || s.bindings == nil || s.config == nil {
		return nil, fmt.Errorf("sub2api launch is not configured")
	}
	redeemURL := s.config.Sub2APIRedeemURL()
	secret := s.config.Sub2APIRedeemSecret()
	if redeemURL == "" || secret == "" {
		return nil, fmt.Errorf("sub2api launch redeem is not configured")
	}

	payload, _ := json.Marshal(map[string]any{"token": token})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, redeemURL, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Sub2API-OpenWebUI-Secret", secret)

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("sub2api launch redeem failed: HTTP %d %s", resp.StatusCode, sub2APIResponseMessage(data))
	}

	var envelope map[string]any
	if err := json.Unmarshal(data, &envelope); err != nil {
		return nil, fmt.Errorf("sub2api launch redeem payload is invalid")
	}
	if code, exists := envelope["code"]; exists && util.ToInt(code, 0) != 0 {
		return nil, fmt.Errorf("sub2api launch redeem failed: %s", sub2APIEnvelopeMessage(envelope))
	}
	body := util.StringMap(unwrapEnvelope(envelope))
	if len(body) == 0 {
		body = envelope
	}
	binding, err := s.bindingFromRedeemBody(body)
	if err != nil {
		return nil, err
	}
	owner := AuthOwner{ID: binding.OwnerID, Name: firstNonEmpty(binding.UserName, binding.UserEmail, binding.OwnerID), Provider: AuthProviderSub2API}
	sessionItem, rawSessionKey, err := s.auth.UpsertSub2APISession(owner)
	if err != nil {
		return nil, err
	}
	identity := identityForAuthItem(sessionItem)
	if identity == nil {
		return nil, fmt.Errorf("sub2api session was not created")
	}
	if err := s.bindings.Save(binding); err != nil {
		return nil, err
	}
	return &Sub2APILaunchResult{Identity: *identity, Token: rawSessionKey, Binding: binding}, nil
}

func (s *Sub2APILaunchService) bindingFromRedeemBody(body map[string]any) (Sub2APIBinding, error) {
	user := util.StringMap(body["user"])
	apiKey := util.StringMap(body["api_key"])
	userID := util.Clean(user["id"])
	apiKeyValue := util.Clean(apiKey["key"])
	gatewayBaseURL := firstNonEmpty(s.config.Sub2APIGatewayBaseURL(), util.Clean(body["gateway_base_url"]))
	if userID == "" {
		return Sub2APIBinding{}, fmt.Errorf("sub2api launch redeem payload missing user.id")
	}
	if apiKeyValue == "" {
		return Sub2APIBinding{}, fmt.Errorf("sub2api launch redeem payload missing api_key.key")
	}
	if strings.TrimSpace(gatewayBaseURL) == "" {
		return Sub2APIBinding{}, fmt.Errorf("sub2api launch redeem payload missing gateway_base_url")
	}
	ownerID := "sub2api:" + userID
	return normalizeSub2APIBinding(Sub2APIBinding{
		OwnerID:        ownerID,
		Sub2APIUserID:  userID,
		UserEmail:      util.Clean(user["email"]),
		UserName:       util.Clean(user["username"]),
		APIKeyID:       util.Clean(apiKey["id"]),
		APIKey:         apiKeyValue,
		APIKeyName:     util.Clean(apiKey["name"]),
		APIKeyLast4:    apiKeyLast4(apiKeyValue),
		GroupID:        util.Clean(apiKey["group_id"]),
		GroupName:      util.Clean(apiKey["group_name"]),
		GroupPlatform:  util.Clean(apiKey["group_platform"]),
		GatewayBaseURL: gatewayBaseURL,
		ExpiresAt:      util.Clean(body["expires_at"]),
		UpdatedAt:      util.NowISO(),
	}), nil
}

func apiKeyLast4(key string) string {
	key = strings.TrimSpace(key)
	if len(key) <= 4 {
		return key
	}
	return key[len(key)-4:]
}

func sub2APIEnvelopeMessage(payload map[string]any) string {
	for _, key := range []string{"message", "reason", "error"} {
		if value := util.Clean(payload[key]); value != "" {
			return value
		}
	}
	return "unexpected response"
}

func sub2APIResponseMessage(data []byte) string {
	var payload map[string]any
	if json.Unmarshal(data, &payload) == nil {
		return sub2APIEnvelopeMessage(payload)
	}
	text := strings.TrimSpace(string(data))
	if len(text) > 300 {
		text = text[:300]
	}
	if text == "" {
		return "empty response"
	}
	return text
}
