package httpapi

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"chatgpt2api/internal/backend"
	"chatgpt2api/internal/imagestore"
	"chatgpt2api/internal/protocol"
	"chatgpt2api/internal/service"
	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
	"chatgpt2api/internal/version"
	"chatgpt2api/internal/websearch"
)

func TestAppAuthAndSPACompatibility(t *testing.T) {
	originalVersion := version.Version
	version.Version = "test-build"
	t.Cleanup(func() { version.Version = originalVersion })

	app := newTestApp(t)
	defer app.Close()

	user, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "frontend", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}
	if user["role"] != "user" {
		t.Fatalf("created user = %#v", user)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/auth/users/"+user["id"].(string)+"/key", nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("reveal user key status = %d body = %s", res.Code, res.Body.String())
	}
	var revealed map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &revealed); err != nil {
		t.Fatalf("reveal json: %v", err)
	}
	if revealed["key"] != rawKey {
		t.Fatalf("revealed key = %#v, want raw key", revealed["key"])
	}

	req = httptest.NewRequest(http.MethodGet, "/auth/session", nil)
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("/auth/session status = %d body = %s", res.Code, res.Body.String())
	}
	var login map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &login); err != nil {
		t.Fatalf("login json: %v", err)
	}
	if login["role"] != "user" {
		t.Fatalf("login role = %#v", login)
	}
	if login["version"] != "test-build" {
		t.Fatalf("login version = %#v", login["version"])
	}

	req = httptest.NewRequest(http.MethodGet, "/version", nil)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("/version status = %d body = %s", res.Code, res.Body.String())
	}
	var versionBody map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &versionBody); err != nil {
		t.Fatalf("version json: %v", err)
	}
	if versionBody["version"] != "test-build" {
		t.Fatalf("/version body = %#v", versionBody)
	}

	req = httptest.NewRequest(http.MethodGet, "/health", nil)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("/health status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/announcements?target=login", nil)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("/api/announcements status = %d body = %s", res.Code, res.Body.String())
	}
	var announcementsBody map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &announcementsBody); err != nil {
		t.Fatalf("announcements json: %v", err)
	}
	if items := logItems(announcementsBody); len(items) != 0 {
		t.Fatalf("unexpected initial announcements = %#v", announcementsBody)
	}

	req = httptest.NewRequest(http.MethodPost, "/api/admin/announcements", strings.NewReader(`{"title":"通知 A","content":"今晚维护","show_login":true,"show_image":false}`))
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("create login announcement status = %d body = %s", res.Code, res.Body.String())
	}
	var createBody map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &createBody); err != nil {
		t.Fatalf("create announcement json: %v", err)
	}
	createdItem, _ := createBody["item"].(map[string]any)
	createdID, _ := createdItem["id"].(string)
	if createdID == "" {
		t.Fatalf("missing created announcement id: %#v", createBody)
	}

	req = httptest.NewRequest(http.MethodPost, "/api/admin/announcements", strings.NewReader(`{"title":"通知 B","content":"画图页公告","show_login":false,"show_image":true}`))
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("create image announcement status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/admin/announcements", nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("admin list announcements status = %d body = %s", res.Code, res.Body.String())
	}
	if err := json.Unmarshal(res.Body.Bytes(), &announcementsBody); err != nil {
		t.Fatalf("admin announcements json: %v", err)
	}
	if items := logItems(announcementsBody); len(items) != 2 {
		t.Fatalf("admin announcements length = %d body = %#v", len(items), announcementsBody)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/announcements?target=login", nil)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("public login announcements status = %d body = %s", res.Code, res.Body.String())
	}
	if err := json.Unmarshal(res.Body.Bytes(), &announcementsBody); err != nil {
		t.Fatalf("public login announcements json: %v", err)
	}
	items := logItems(announcementsBody)
	if len(items) != 1 || items[0]["title"] != "通知 A" {
		t.Fatalf("unexpected public login announcements = %#v", announcementsBody)
	}

	req = httptest.NewRequest(http.MethodPost, "/api/admin/announcements/"+createdID, strings.NewReader(`{"enabled":false}`))
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("disable announcement status = %d body = %s", res.Code, res.Body.String())
	}
	req = httptest.NewRequest(http.MethodGet, "/api/announcements?target=login", nil)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("public login announcements after disable status = %d body = %s", res.Code, res.Body.String())
	}
	if err := json.Unmarshal(res.Body.Bytes(), &announcementsBody); err != nil {
		t.Fatalf("public login announcements after disable json: %v", err)
	}
	if items := logItems(announcementsBody); len(items) != 0 {
		t.Fatalf("disabled announcement should be hidden: %#v", announcementsBody)
	}

	msgReq := httptest.NewRequest(http.MethodPost, "/v1/messages", strings.NewReader("{"))
	msgReq.Header.Set("x-api-key", rawKey)
	msgRes := httptest.NewRecorder()
	app.Handler().ServeHTTP(msgRes, msgReq)
	if msgRes.Code != http.StatusBadRequest {
		t.Fatalf("x-api-key auth did not reach JSON validation, status = %d body = %s", msgRes.Code, msgRes.Body.String())
	}

	for _, path := range []string{"/", "/settings"} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		res := httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		if res.Code != http.StatusOK || !strings.Contains(res.Body.String(), `<div id="root"></div>`) {
			t.Fatalf("%s status/body = %d %q", path, res.Code, res.Body.String())
		}
	}
	req = httptest.NewRequest(http.MethodGet, "/assets/missing.js", nil)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusNotFound {
		t.Fatalf("missing asset status = %d", res.Code)
	}
}

func TestAdminSystemCheckUpdates(t *testing.T) {
	releaseAPI := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/repos/ZyphrZero/chatgpt2api/releases/latest" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"tag_name": "v1.2.0",
			"name": "v1.2.0",
			"body": "release notes",
			"html_url": "https://github.com/ZyphrZero/chatgpt2api/releases/tag/v1.2.0",
			"published_at": "2026-01-01T00:00:00Z",
			"assets": [
				{"name":"chatgpt2api_1.2.0_linux_amd64.tar.gz","browser_download_url":"https://github.com/ZyphrZero/chatgpt2api/releases/download/v1.2.0/chatgpt2api_1.2.0_linux_amd64.tar.gz","size":123},
				{"name":"checksums.txt","browser_download_url":"https://github.com/ZyphrZero/chatgpt2api/releases/download/v1.2.0/checksums.txt","size":64}
			]
		}`))
	}))
	defer releaseAPI.Close()

	originalVersion := version.Version
	originalBuildType := version.BuildType
	version.Version = "1.1.0"
	version.BuildType = "release"
	t.Cleanup(func() {
		version.Version = originalVersion
		version.BuildType = originalBuildType
	})

	app := newTestApp(t)
	defer app.Close()
	app.update = service.NewUpdateService(service.UpdateOptions{
		APIBaseURL:     releaseAPI.URL,
		CurrentVersion: version.Get(),
		BuildType:      version.GetBuildType(),
	})

	req := httptest.NewRequest(http.MethodGet, "/api/admin/system/check-updates?force=true", nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("check updates status = %d body = %s", res.Code, res.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("check updates json: %v", err)
	}
	if body["current_version"] != "1.1.0" || body["latest_version"] != "1.2.0" || body["has_update"] != true || body["build_type"] != "release" {
		t.Fatalf("unexpected check updates body = %#v", body)
	}
}

func TestAnalyticsEventsAndAdminUsageOverviewAuth(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	req := httptest.NewRequest(http.MethodPost, "/api/analytics/events", strings.NewReader(`{"events":[{"type":"page_view","path":"/image"}]}`))
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous analytics status = %d body = %s", res.Code, res.Body.String())
	}

	_, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "usage-user", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}
	req = httptest.NewRequest(http.MethodPost, "/api/analytics/events", strings.NewReader(`{"events":[{"type":"page_view","path":"/image"},{"type":"page_click","path":"/image","count":2},{"type":"page_stay","path":"/image","duration_ms":30000},{"type":"bad","path":"/image"}]}`))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("user analytics status = %d body = %s", res.Code, res.Body.String())
	}
	var recordBody map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &recordBody); err != nil {
		t.Fatalf("record analytics json: %v", err)
	}
	if util.ToInt(recordBody["recorded"], 0) != 3 || util.ToInt(recordBody["ignored"], 0) != 1 {
		t.Fatalf("record analytics body = %#v", recordBody)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/admin/usage-overview?days=7", nil)
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusForbidden {
		t.Fatalf("user usage overview status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/admin/usage-overview?days=7", nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("admin usage overview status = %d body = %s", res.Code, res.Body.String())
	}
	var overview map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &overview); err != nil {
		t.Fatalf("usage overview json: %v", err)
	}
	today := util.StringMap(overview["today"])
	if util.ToInt(today["page_views"], 0) != 1 || util.ToInt(today["page_clicks"], 0) != 2 || util.ToInt(today["active_seconds"], 0) != 30 {
		t.Fatalf("usage overview today = %#v", today)
	}
	if _, ok := today["local_consumed_amount"]; !ok {
		t.Fatalf("usage overview missing local_consumed_amount: %#v", today)
	}
	if len(util.AsMapSlice(overview["last_7_days"])) != 7 {
		t.Fatalf("last_7_days = %#v", overview["last_7_days"])
	}
	if len(util.AsMapSlice(overview["pages"])) != 1 {
		t.Fatalf("pages = %#v", overview["pages"])
	}
}

func TestPasswordAccountLoginAndRegistrationToggle(t *testing.T) {
	t.Setenv("CHATGPT2API_USER_DEFAULT_CONCURRENT_LIMIT", "2")

	app := newTestApp(t)
	defer app.Close()

	req := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(`{"username":"admin","password":"AdminPass123!"}`))
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("admin password login status = %d body = %s", res.Code, res.Body.String())
	}
	var login map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &login); err != nil {
		t.Fatalf("login json: %v", err)
	}
	adminToken, _ := login["token"].(string)
	if adminToken == "" || login["role"] != service.AuthRoleAdmin || login["subject_id"] != "admin" {
		t.Fatalf("admin login body = %#v", login)
	}
	assertCreationConcurrentLimit(t, login, 0)

	req = httptest.NewRequest(http.MethodPost, "/auth/register", strings.NewReader(`{"username":"alice","password":"Password123","name":"Alice"}`))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusForbidden {
		t.Fatalf("disabled registration status = %d body = %s", res.Code, res.Body.String())
	}
	if !strings.Contains(res.Body.String(), "已关闭注册通道") {
		t.Fatalf("disabled registration body = %s", res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPost, "/api/settings", strings.NewReader(`{"registration_enabled":true}`))
	req.Header.Set("Authorization", "Bearer "+adminToken)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("enable registration status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPost, "/auth/register", strings.NewReader(`{"username":"alice","password":"Password123","name":"Alice"}`))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("enabled registration status = %d body = %s", res.Code, res.Body.String())
	}
	var registered map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &registered); err != nil {
		t.Fatalf("register json: %v", err)
	}
	userToken, _ := registered["token"].(string)
	if userToken == "" || registered["role"] != service.AuthRoleUser || registered["name"] != "Alice" {
		t.Fatalf("register body = %#v", registered)
	}
	if registered["role_id"] != service.DefaultManagedRoleID {
		t.Fatalf("registered role fields = %#v", registered)
	}
	assertCreationConcurrentLimit(t, registered, 2)

	req = httptest.NewRequest(http.MethodGet, "/auth/session", nil)
	req.Header.Set("Authorization", "Bearer "+userToken)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("registered session status = %d body = %s", res.Code, res.Body.String())
	}
	var session map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &session); err != nil {
		t.Fatalf("registered session json: %v", err)
	}
	assertCreationConcurrentLimit(t, session, 2)
}

func TestProfileAccountNameAndPasswordUpdates(t *testing.T) {
	t.Setenv("CHATGPT2API_USER_DEFAULT_CONCURRENT_LIMIT", "3")

	app := newTestApp(t)
	defer app.Close()

	user, token, err := app.auth.RegisterPasswordUser("alice", "Password123", "Alice")
	if err != nil {
		t.Fatalf("RegisterPasswordUser() error = %v", err)
	}
	if user.Name != "Alice" || token == "" {
		t.Fatalf("registered identity=%#v token=%q", user, token)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/profile", strings.NewReader(`{"name":"Alice Updated"}`))
	req.Header.Set("Authorization", "Bearer "+token)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("profile name update status = %d body = %s", res.Code, res.Body.String())
	}
	var profile map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &profile); err != nil {
		t.Fatalf("profile update json: %v", err)
	}
	if profile["name"] != "Alice Updated" || profile["subject_id"] != user.ID {
		t.Fatalf("profile update body = %#v", profile)
	}
	assertCreationConcurrentLimit(t, profile, 3)

	req = httptest.NewRequest(http.MethodGet, "/auth/session", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("session after profile update status = %d body = %s", res.Code, res.Body.String())
	}
	if err := json.Unmarshal(res.Body.Bytes(), &profile); err != nil {
		t.Fatalf("session after profile update json: %v", err)
	}
	if profile["name"] != "Alice Updated" {
		t.Fatalf("session did not reflect updated name: %#v", profile)
	}
	assertCreationConcurrentLimit(t, profile, 3)

	req = httptest.NewRequest(http.MethodPost, "/api/profile/password", strings.NewReader(`{"current_password":"wrong-password","new_password":"NewPassword123"}`))
	req.Header.Set("Authorization", "Bearer "+token)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("wrong current password status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPost, "/api/profile/password", strings.NewReader(`{"current_password":"Password123","new_password":"NewPassword123"}`))
	req.Header.Set("Authorization", "Bearer "+token)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("password update status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(`{"username":"alice","password":"Password123"}`))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("old password login status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(`{"username":"alice","password":"NewPassword123"}`))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("new password login status = %d body = %s", res.Code, res.Body.String())
	}
	if err := json.Unmarshal(res.Body.Bytes(), &profile); err != nil {
		t.Fatalf("new password login json: %v", err)
	}
	if profile["name"] != "Alice Updated" || profile["subject_id"] != user.ID {
		t.Fatalf("new password login body = %#v", profile)
	}
	assertCreationConcurrentLimit(t, profile, 3)
}

func TestCreationTaskFailureWritesCallLog(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	_, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "frontend", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/creation-tasks/image-generations", strings.NewReader(`{"client_task_id":"task-log-test","prompt":"test image"}`))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("submit creation task status = %d body = %s", res.Code, res.Body.String())
	}

	var logs map[string]any
	var item map[string]any
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		req = httptest.NewRequest(http.MethodGet, "/api/logs", nil)
		req.Header.Set("Authorization", adminAuthHeader(t, app))
		res = httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		if res.Code != http.StatusOK {
			t.Fatalf("logs status = %d body = %s", res.Code, res.Body.String())
		}
		if err := json.Unmarshal(res.Body.Bytes(), &logs); err != nil {
			t.Fatalf("logs json: %v", err)
		}
		item = findLogBySummary(logItems(logs), "文生图调用失败")
		if item != nil {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if item == nil {
		t.Fatalf("expected creation task failure to write a log event, got %#v", logs)
	}
	if _, ok := item["type"]; ok {
		t.Fatalf("log item should not expose type: %#v", item)
	}
	detail, _ := item["detail"].(map[string]any)
	if detail["endpoint"] != "/api/creation-tasks/image-generations" ||
		detail["path"] != "/api/creation-tasks/image-generations" ||
		detail["method"] != http.MethodPost ||
		detail["module"] != "creation-tasks" ||
		detail["outcome"] != "failed" {
		t.Fatalf("unexpected log detail: %#v", detail)
	}
	if _, ok := detail["status"].(float64); !ok {
		t.Fatalf("log status should use numeric HTTP-style status: %#v", detail)
	}
	if detail["key_name"] != "frontend" || detail["key_role"] != "user" {
		t.Fatalf("call log did not include user key identity: %#v", detail)
	}
}

func TestCreationTaskGPTImageGenerationRunsSequentialOutputs(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	_, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "frontend", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}

	requests := make(chan protocol.ConversationRequest, 4)
	installHTTPTestImageStreamFunc(t, app, func(ctx context.Context, client *backend.Client, request protocol.ConversationRequest, index, total int) (<-chan protocol.ImageOutput, <-chan error) {
		requests <- request
		return httpTestImageOutputStream(request, index)
	})

	req := httptest.NewRequest(http.MethodPost, "/api/creation-tasks/image-generations", strings.NewReader(`{"client_task_id":"task-sequential","prompt":"test image","model":"gpt-image-2","n":4}`))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("submit creation task status = %d body = %s", res.Code, res.Body.String())
	}

	var listed map[string]any
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		req = httptest.NewRequest(http.MethodGet, "/api/creation-tasks?ids=task-sequential", nil)
		req.Header.Set("Authorization", "Bearer "+rawKey)
		res = httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		if res.Code != http.StatusOK {
			t.Fatalf("list creation task status = %d body = %s", res.Code, res.Body.String())
		}
		if err := json.Unmarshal(res.Body.Bytes(), &listed); err != nil {
			t.Fatalf("list creation task json: %v", err)
		}
		items := util.AsMapSlice(listed["items"])
		if len(items) == 1 && items[0]["status"] == service.TaskStatusSuccess {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	items := util.AsMapSlice(listed["items"])
	if len(items) != 1 || items[0]["status"] != service.TaskStatusSuccess {
		t.Fatalf("creation task did not finish successfully: %#v", listed)
	}
	if data := util.AsMapSlice(items[0]["data"]); len(data) != 4 {
		t.Fatalf("task data len = %d, want 4: %#v", len(data), data)
	}
	for index := 0; index < 4; index++ {
		select {
		case request := <-requests:
			if !request.SequentialImageOutputs {
				t.Fatalf("request %d SequentialImageOutputs = false", index+1)
			}
			if request.N != 4 {
				t.Fatalf("request %d N = %d, want 4", index+1, request.N)
			}
		default:
			t.Fatalf("captured requests = %d, want 4", index)
		}
	}
}

func TestCreationTaskProStudioLocksOfficialModelAndMetadata(t *testing.T) {
	app := newTestAppWithBillingDefaults(t, "standard", "1000000", "1000000", "monthly")
	defer app.Close()

	_, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "frontend", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}
	requests := make(chan protocol.ConversationRequest, 1)
	installHTTPTestImageStreamFunc(t, app, func(ctx context.Context, client *backend.Client, request protocol.ConversationRequest, index, total int) (<-chan protocol.ImageOutput, <-chan error) {
		requests <- request
		return httpTestImageOutputStream(request, index)
	})

	body := jsonString(map[string]any{
		"client_task_id":     "task-pro-studio",
		"prompt":             "draw pro product",
		"professional_mode":  true,
		"model":              "gpt-image-2",
		"size":               "1:1",
		"image_resolution":   "1k",
		"quality":            "high",
		"output_format":      "webp",
		"output_compression": 72,
		"background":         "opaque",
		"moderation":         "low",
		"pro_studio": map[string]any{
			"enabled":      true,
			"mode":         "preset",
			"intent":       "product_main",
			"quality_tier": "production",
		},
	})
	req := httptest.NewRequest(http.MethodPost, "/api/creation-tasks/image-generations", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("submit pro studio status = %d body = %s", res.Code, res.Body.String())
	}

	var listed map[string]any
	waitForHTTPTestCondition(t, func() bool {
		req = httptest.NewRequest(http.MethodGet, "/api/creation-tasks?ids=task-pro-studio", nil)
		req.Header.Set("Authorization", "Bearer "+rawKey)
		res = httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		if res.Code != http.StatusOK {
			t.Fatalf("list pro studio status = %d body = %s", res.Code, res.Body.String())
		}
		if err := json.Unmarshal(res.Body.Bytes(), &listed); err != nil {
			t.Fatalf("list pro studio json: %v", err)
		}
		items := util.AsMapSlice(listed["items"])
		return len(items) == 1 && items[0]["status"] == service.TaskStatusSuccess
	})
	select {
	case request := <-requests:
		if request.Model != service.OfficialImageModel {
			t.Fatalf("request model = %#v, want official", request.Model)
		}
	default:
		t.Fatal("missing captured pro studio request")
	}
	items := util.AsMapSlice(listed["items"])
	item := items[0]
	if item["model"] != service.OfficialImageModel ||
		item["professional_mode"] != true ||
		item["image_resolution"] != "1k" ||
		item["output_format"] != "webp" ||
		util.ToInt(item["output_compression"], 0) != 72 {
		t.Fatalf("pro studio task = %#v", item)
	}
	proStudio := util.StringMap(item["pro_studio"])
	if proStudio["intent"] != "product_main" || proStudio["quality_tier"] != "production" {
		t.Fatalf("pro_studio = %#v", proStudio)
	}
	settings := util.StringMap(item["official_settings"])
	if settings["model"] != service.OfficialImageModel ||
		settings["resolution"] != "1k" ||
		settings["output_format"] != "webp" ||
		util.ToInt(settings["output_compression"], 0) != 72 {
		t.Fatalf("official_settings = %#v", settings)
	}
}

func TestCreationTaskProStudioRejectsBatchOverLimit(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	_, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "frontend", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/creation-tasks/image-generations", strings.NewReader(jsonString(map[string]any{
		"client_task_id":    "task-pro-studio-too-many",
		"prompt":            "draw pro product",
		"professional_mode": true,
		"size":              "1:1",
		"image_resolution":  "4k",
		"quality":           "high",
		"output_format":     "webp",
		"background":        "opaque",
		"moderation":        "low",
		"n":                 5,
	})))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("pro studio n>4 status = %d body = %s", res.Code, res.Body.String())
	}
	if !strings.Contains(res.Body.String(), "professional_mode n must be between 1 and 4") {
		t.Fatalf("pro studio n>4 body = %s", res.Body.String())
	}
}

func TestLogsEndpointUsesDefaultLogView(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()
	if _, err := app.config.Update(map[string]any{"default_log_view": "business"}); err != nil {
		t.Fatalf("Update(default_log_view) error = %v", err)
	}
	if err := app.logs.Add("新增账号", map[string]any{"module": "accounts", "operation_type": "新增"}); err != nil {
		t.Fatalf("Add(business log) error = %v", err)
	}
	if err := app.logs.Add("GET /api/profile", map[string]any{"method": "GET", "path": "/api/profile", "module": "profile", "status": 200, "log_level": "info"}); err != nil {
		t.Fatalf("Add(noisy audit log) error = %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/logs", nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("logs status = %d body = %s", res.Code, res.Body.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
		t.Fatalf("logs json: %v", err)
	}
	if summaries := logPayloadSummaries(logItems(payload)); !reflect.DeepEqual(summaries, []string{"新增账号"}) {
		t.Fatalf("default logs summaries = %#v", summaries)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/logs?view=all", nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("logs all status = %d body = %s", res.Code, res.Body.String())
	}
	if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
		t.Fatalf("logs all json: %v", err)
	}
	if summaries := logPayloadSummaries(logItems(payload)); !reflect.DeepEqual(summaries, []string{"GET /api/profile", "新增账号"}) {
		t.Fatalf("all logs summaries = %#v", summaries)
	}
}

func TestChatCompletionsCallLogIncludesUpstreamAccountPreview(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	const fullToken = "secret-upstream-token-for-log-test"
	ctx, tracker := protocol.WithAccountUsageTracker(context.Background())
	tracker.Record(fullToken)
	app.logCall(ctx, service.Identity{ID: "user-1", Role: service.AuthRoleUser, Name: "frontend"}, "文本生成", http.MethodPost, "/v1/chat/completions", "gpt-5", time.Now(), "success", http.StatusOK, "", nil, auditRequestCapture{})

	logs := app.logs.Search(service.LogQuery{Limit: 10})
	item := findLogBySummary(logs, "文本生成调用完成")
	if item == nil {
		t.Fatalf("expected chat completions log, got %#v", logs)
	}
	detail := util.StringMap(item["detail"])
	if util.Clean(detail["upstream_account_id"]) == "" || util.Clean(detail["upstream_token_preview"]) == "" {
		t.Fatalf("log detail missing upstream singleton fields: %#v", detail)
	}
	accounts := util.AsMapSlice(detail["upstream_accounts"])
	if len(accounts) != 1 || accounts[0]["account_id"] != detail["upstream_account_id"] || accounts[0]["token_preview"] != detail["upstream_token_preview"] {
		t.Fatalf("log detail upstream accounts = %#v, detail = %#v", accounts, detail)
	}
	encoded, err := json.Marshal(item)
	if err != nil {
		t.Fatalf("marshal log item: %v", err)
	}
	if strings.Contains(string(encoded), fullToken) {
		t.Fatalf("log JSON leaked full upstream token: %s", encoded)
	}
}

func TestRunLoggedChatTaskCreatesAccountUsageTrackerForLogs(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	const fullToken = "task-chat-upstream-token-for-log-test"
	app.engine.Accounts.AddAccounts([]string{fullToken})
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := app.runLoggedChatTask(ctx, service.Identity{ID: "user-1", Role: service.AuthRoleUser, Name: "frontend"}, map[string]any{
		"model":    "gpt-5",
		"messages": []any{map[string]any{"role": "user", "content": "hello"}},
	})
	if err == nil {
		t.Fatal("runLoggedChatTask() error = nil, want canceled upstream error")
	}
	logs := app.logs.Search(service.LogQuery{Limit: 20})
	item := findLogBySummary(logs, "文本生成调用失败")
	if item == nil {
		t.Fatalf("expected failed chat task log, got %#v", logs)
	}
	detail := util.StringMap(item["detail"])
	if detail["endpoint"] != "/api/creation-tasks/chat-completions" || util.Clean(detail["upstream_account_id"]) == "" || util.Clean(detail["upstream_token_preview"]) == "" {
		t.Fatalf("chat task log detail missing upstream account fields: %#v", detail)
	}
	encoded, err := json.Marshal(item)
	if err != nil {
		t.Fatalf("marshal log item: %v", err)
	}
	if strings.Contains(string(encoded), fullToken) {
		t.Fatalf("chat task log JSON leaked full upstream token: %s", encoded)
	}
}

func TestCreationTaskResponseImageRouteIsNotAnAdminTaskResource(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	_, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "frontend", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}

	body := `{"client_task_id":"response-image-route","prompt":"生成封面","model":"gpt-5.5","size":"2048x2048","image_resolution":"2k","quality":"high","output_format":"jpeg","output_compression":42,"n":2,"images":["data:image/png;base64,cG5n"],"messages":[{"role":"user","content":"生成封面"}],"visibility":"public"}`
	req := httptest.NewRequest(http.MethodPost, "/api/creation-tasks/response-image-generations", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusNotFound {
		t.Fatalf("response image creation task status = %d body = %s, want 404", res.Code, res.Body.String())
	}
}

func TestCreationTaskRejectsPublicImageVisibility(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	_, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "frontend", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}

	body := `{"client_task_id":"public-visibility-disabled","prompt":"生成封面","model":"gpt-image-2","visibility":"public"}`
	req := httptest.NewRequest(http.MethodPost, "/api/creation-tasks/image-generations", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("public visibility creation task status = %d body = %s", res.Code, res.Body.String())
	}
}

func TestCreationTaskRejectsBlockedImagePrompt(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	_, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "frontend", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/creation-tasks/image-generations", strings.NewReader(`{"client_task_id":"blocked-policy","prompt":"生成真人去衣性感写真"}`))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("blocked creation task status = %d body = %s", res.Code, res.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("blocked response json: %v", err)
	}
	errorBody := util.StringMap(body["error"])
	if errorBody["code"] != "content_policy_violation" {
		t.Fatalf("blocked response = %#v", body)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/creation-tasks?ids=blocked-policy", nil)
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("list creation tasks status = %d body = %s", res.Code, res.Body.String())
	}
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("list response json: %v", err)
	}
	if items := util.AsMapSlice(body["items"]); len(items) != 0 {
		t.Fatalf("blocked prompt should not create task: %#v", body)
	}
}

func TestRunLoggedImageTaskLogsTextOutputAsFailure(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	identity := service.Identity{ID: "admin", Role: service.AuthRoleAdmin, Name: "Admin"}
	result, err := app.runLoggedImageTask(
		context.Background(),
		identity,
		map[string]any{"model": "gpt-image-2"},
		"/api/creation-tasks/image-generations",
		"文生图",
		func(context.Context, map[string]any) (map[string]any, error) {
			return map[string]any{"output_type": "text", "message": "模型返回文本", "data": []map[string]any{}}, nil
		},
	)
	if err != nil {
		t.Fatalf("runLoggedImageTask() error = %v", err)
	}
	if result["output_type"] != "text" || result["message"] != "模型返回文本" {
		t.Fatalf("runLoggedImageTask() result = %#v", result)
	}
	logs := app.logs.Search(service.LogQuery{Limit: 10})
	item := findLogBySummary(logs, "文生图调用失败")
	if item == nil {
		t.Fatalf("expected text-only image result to write failure log, got %#v", logs)
	}
	detail := util.StringMap(item["detail"])
	if detail["outcome"] != "failed" || util.ToInt(detail["status"], 0) != http.StatusBadGateway {
		t.Fatalf("failure log detail = %#v", detail)
	}
}

func TestRecordGeneratedImagesForPayloadStoresReusableRequestMetadata(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	rel := "2026/05/12/reusable.png"
	imagePath := filepath.Join(app.config.ImagesDir(), filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(imagePath), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := writeHTTPTestPNG(imagePath); err != nil {
		t.Fatalf("writeHTTPTestPNG() error = %v", err)
	}

	app.recordGeneratedImagesForPayload(
		service.Identity{ID: "admin", Role: service.AuthRoleAdmin, Name: "Admin"},
		[]string{rel},
		service.ImageVisibilityPrivate,
		map[string]any{
			"prompt":             "复用这个提示词",
			"model":              "gpt-image-2",
			"quality":            "high",
			"image_resolution":   "2k",
			"size":               "2048x2048",
			"output_format":      "jpeg",
			"output_compression": 42,
			"background":         "transparent",
			"moderation":         "low",
			"style":              "vivid",
			"partial_images":     2,
			"input_image_mask":   "mask-id",
			"images": []protocol.UploadedImage{
				{Filename: "source.png", ContentType: "image/png", Data: []byte("reference-bytes")},
			},
			"share_prompt_parameters": true,
			"share_reference_images":  true,
		},
	)

	detail, err := app.images.ImageDetail("http://127.0.0.1:8000", rel, service.ImageAccessScope{All: true})
	if err != nil {
		t.Fatalf("ImageDetail() error = %v", err)
	}
	item := detail
	if item["prompt"] != "复用这个提示词" ||
		item["model"] != "gpt-image-2" ||
		item["quality"] != "high" ||
		item["resolution_preset"] != "2k" ||
		item["requested_size"] != "2048x2048" ||
		item["output_format"] != "jpeg" ||
		item["output_compression"] != 42 ||
		item["background"] != "transparent" ||
		item["moderation"] != "low" ||
		item["style"] != "vivid" ||
		item["partial_images"] != 2 ||
		item["input_image_mask"] != "mask-id" {
		t.Fatalf("reusable metadata = %#v", item)
	}
	referenceURLs, ok := item["reference_image_urls"].([]string)
	if !ok || len(referenceURLs) != 1 || !strings.Contains(referenceURLs[0], "/image-references/") {
		t.Fatalf("reference_image_urls = %#v", item["reference_image_urls"])
	}

	pngRel := "2026/05/12/reusable-png.png"
	pngPath := filepath.Join(app.config.ImagesDir(), filepath.FromSlash(pngRel))
	if err := os.MkdirAll(filepath.Dir(pngPath), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := writeHTTPTestPNG(pngPath); err != nil {
		t.Fatalf("writeHTTPTestPNG() error = %v", err)
	}
	app.recordGeneratedImagesForPayload(
		service.Identity{ID: "admin", Role: service.AuthRoleAdmin, Name: "Admin"},
		[]string{pngRel},
		service.ImageVisibilityPrivate,
		map[string]any{
			"prompt":                  "png compression ignored",
			"output_format":           "png",
			"output_compression":      88,
			"share_prompt_parameters": true,
		},
	)
	pngDetail, err := app.images.ImageDetail("http://127.0.0.1:8000", pngRel, service.ImageAccessScope{All: true})
	if err != nil {
		t.Fatalf("png ImageDetail() error = %v", err)
	}
	if pngDetail["output_format"] != "png" || pngDetail["output_compression"] != nil {
		t.Fatalf("png reusable metadata = %#v", pngDetail)
	}

	parsedReferenceURL, err := url.Parse(referenceURLs[0])
	if err != nil {
		t.Fatalf("parse reference url: %v", err)
	}
	req := httptest.NewRequest(http.MethodGet, parsedReferenceURL.RequestURI(), nil)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous reference status/body = %d %q, want 401", res.Code, res.Body.String())
	}
	req = httptest.NewRequest(http.MethodGet, parsedReferenceURL.RequestURI(), nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK || res.Body.String() != "reference-bytes" {
		t.Fatalf("admin reference status/body = %d %q", res.Code, res.Body.String())
	}
	if got := res.Header().Get("Content-Type"); got != "image/png" {
		t.Fatalf("reference Content-Type = %q, want image/png", got)
	}
}

func TestSub2APIImageRequestErrorMessageExplainsUpstreamPoolFailure(t *testing.T) {
	message := sub2APIImageRequestErrorMessage(http.StatusBadGateway, "map[message:Upstream service temporarily unavailable type:upstream_error]")
	if strings.Contains(strings.ToLower(message), "sub2api") {
		t.Fatalf("message = %q", message)
	}
	if strings.Contains(message, "map[") {
		t.Fatalf("message should not expose raw map formatting: %q", message)
	}
	if !strings.Contains(message, "图片上游账号池暂不可用") || !strings.Contains(message, "HTTP 502") || !strings.Contains(message, "Upstream service temporarily unavailable") {
		t.Fatalf("message should explain direct reason: %q", message)
	}
}

func TestSub2APIErrorMessagePrefersNestedMessage(t *testing.T) {
	message := sub2APIErrorMessage([]byte(`{"error":{"message":"Upstream service temporarily unavailable","type":"upstream_error"}}`))
	if message != "Upstream service temporarily unavailable" {
		t.Fatalf("message = %q", message)
	}
}

func TestSub2APIErrorMessageFiltersApimartBrand(t *testing.T) {
	message := sub2APIRequestErrorMessage("images/generations", http.StatusBadGateway, "APIMart task failed: api-mart account unavailable")
	if strings.Contains(strings.ToLower(message), "apimart") || strings.Contains(strings.ToLower(message), "api-mart") {
		t.Fatalf("message should not expose upstream brand: %q", message)
	}
	if !strings.Contains(message, "上游服务 task failed") || !strings.Contains(message, "上游服务 account unavailable") {
		t.Fatalf("message should preserve sanitized reason: %q", message)
	}

	payloadMessage := sub2APIErrorMessageFromPayload(map[string]any{
		"result": map[string]any{"error": map[string]any{"message": "Api Mart timeout"}},
	})
	if strings.Contains(strings.ToLower(payloadMessage), "api mart") || !strings.Contains(payloadMessage, "上游服务 timeout") {
		t.Fatalf("payload message should be sanitized: %q", payloadMessage)
	}
}

func TestSub2APIImagePayloadNormalizesRatioSizes(t *testing.T) {
	tests := []struct {
		name    string
		payload map[string]any
		want    string
	}{
		{name: "square ratio", payload: map[string]any{"prompt": "draw", "size": "1:1"}, want: "1024x1024"},
		{name: "wide ratio", payload: map[string]any{"prompt": "draw", "size": "16:9"}, want: "1536x864"},
		{name: "vertical ratio", payload: map[string]any{"prompt": "draw", "size": "9:16"}, want: "864x1536"},
		{name: "requested size fallback", payload: map[string]any{"prompt": "draw", "requested_size": "1:1"}, want: "1024x1024"},
		{name: "resolution preset", payload: map[string]any{"prompt": "draw", "image_resolution": "2k"}, want: "2048x2048"},
		{name: "pixel icon size uses square upstream ratio", payload: map[string]any{"prompt": "draw", "size": "64x64"}, want: "1:1"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := sub2APIImageJSONPayload(tt.payload)["size"]
			if got != tt.want {
				t.Fatalf("size = %#v, want %q", got, tt.want)
			}
		})
	}
}

func TestSub2APIImagePayloadPassesModelAndResolution(t *testing.T) {
	payload := sub2APIImageJSONPayload(map[string]any{
		"prompt":            "draw",
		"model":             "gpt-image-2",
		"size":              "16:9",
		"image_resolution":  "4k",
		"official_fallback": true,
	})

	if payload["model"] != "gpt-image-2" {
		t.Fatalf("model = %#v, want gpt-image-2", payload["model"])
	}
	if payload["resolution"] != "4k" {
		t.Fatalf("resolution = %#v, want 4k", payload["resolution"])
	}
	if payload["official_fallback"] != true {
		t.Fatalf("official_fallback = %#v, want true", payload["official_fallback"])
	}

	oneKPayload := sub2APIImageJSONPayload(map[string]any{
		"prompt":           "draw",
		"image_resolution": "1080p",
	})
	if oneKPayload["resolution"] != "1k" {
		t.Fatalf("1080p resolution = %#v, want 1k", oneKPayload["resolution"])
	}
}

func TestSub2APIImagePayloadNormalizesOutputOptions(t *testing.T) {
	jpegPayload := sub2APIImageJSONPayload(map[string]any{
		"prompt":             "draw",
		"output_format":      "jpg",
		"output_compression": 120,
	})
	if jpegPayload["output_format"] != "jpeg" || jpegPayload["output_compression"] != 100 {
		t.Fatalf("jpeg output options = %#v", jpegPayload)
	}

	pngPayload := sub2APIImageJSONPayload(map[string]any{
		"prompt":             "draw",
		"output_format":      "png",
		"output_compression": 80,
	})
	if pngPayload["output_format"] != "png" || pngPayload["output_compression"] != nil {
		t.Fatalf("png output options = %#v", pngPayload)
	}

	invalidPayload := sub2APIImageJSONPayload(map[string]any{
		"prompt":             "draw",
		"output_format":      "gif",
		"output_compression": 80,
	})
	if invalidPayload["output_format"] != "png" || invalidPayload["output_compression"] != nil {
		t.Fatalf("invalid output options = %#v", invalidPayload)
	}
}

func TestSub2APIOfficialImagePayloadUsesOfficialGatewayFields(t *testing.T) {
	payload, err := sub2APIImageGatewayJSONPayload(map[string]any{
		"prompt":           "draw",
		"model":            util.ImageModelGPTOfficial,
		"size":             "16:9",
		"image_resolution": "2k",
	})
	if err != nil {
		t.Fatalf("sub2APIImageGatewayJSONPayload() error = %v", err)
	}
	if payload["model"] != util.ImageModelGPTOfficial || payload["size"] != "16:9" || payload["resolution"] != "2k" {
		t.Fatalf("official payload = %#v", payload)
	}
}

func TestSub2APIOfficialImagePayloadMapsPixelIconSizeToSquare(t *testing.T) {
	payload, err := sub2APIImageGatewayJSONPayload(map[string]any{
		"prompt": "draw icon",
		"model":  util.ImageModelGPTOfficial,
		"size":   "128x128",
	})
	if err != nil {
		t.Fatalf("sub2APIImageGatewayJSONPayload() error = %v", err)
	}
	if payload["size"] != "1:1" {
		t.Fatalf("official pixel icon size = %#v, want 1:1", payload["size"])
	}
}

func TestSub2APIOfficialImagePayloadNormalizesOutputOptions(t *testing.T) {
	pngPayload, err := sub2APIImageGatewayJSONPayload(map[string]any{
		"prompt":             "draw",
		"model":              util.ImageModelGPTOfficial,
		"output_format":      "png",
		"output_compression": 80,
	})
	if err != nil {
		t.Fatalf("png official payload error = %v", err)
	}
	if pngPayload["output_format"] != "png" || pngPayload["output_compression"] != nil {
		t.Fatalf("png official output options = %#v", pngPayload)
	}

	jpegPayload, err := sub2APIImageGatewayJSONPayload(map[string]any{
		"prompt":             "draw",
		"model":              util.ImageModelGPTOfficial,
		"output_format":      "jpeg",
		"output_compression": 120,
	})
	if err != nil {
		t.Fatalf("jpeg official payload error = %v", err)
	}
	if jpegPayload["output_format"] != "jpeg" || jpegPayload["output_compression"] != 100 {
		t.Fatalf("jpeg official output options = %#v", jpegPayload)
	}

	webpPayload, err := sub2APIImageGatewayJSONPayload(map[string]any{
		"prompt":             "draw",
		"model":              util.ImageModelGPTOfficial,
		"output_format":      "webp",
		"output_compression": 42,
	})
	if err != nil {
		t.Fatalf("webp official payload error = %v", err)
	}
	if webpPayload["output_format"] != "webp" || webpPayload["output_compression"] != 42 {
		t.Fatalf("webp official output options = %#v", webpPayload)
	}
}

func TestSub2APIOfficialImagePayloadClampsBatchCount(t *testing.T) {
	payload, err := sub2APIImageGatewayJSONPayload(map[string]any{
		"prompt": "draw",
		"model":  util.ImageModelGPTOfficial,
		"n":      10,
	})
	if err != nil {
		t.Fatalf("official payload error = %v", err)
	}
	if payload["n"] != 4 {
		t.Fatalf("official n = %#v, want 4", payload["n"])
	}
}

func TestSub2APIOfficialImageEditPayloadUsesPublicReferences(t *testing.T) {
	payload, err := sub2APIImageGatewayJSONPayload(map[string]any{
		"prompt":                     "edit",
		"model":                      util.ImageModelGPTOfficial,
		"official_public_image_urls": []string{"https://cdn.example/source.png"},
		"images":                     []protocol.UploadedImage{{ContentType: "image/png", Data: []byte("private")}},
	})
	if err != nil {
		t.Fatalf("official edit payload error = %v", err)
	}
	urls := util.AsStringSlice(payload["image_urls"])
	if len(urls) != 1 || urls[0] != "https://cdn.example/source.png" {
		t.Fatalf("official image_urls = %#v", payload["image_urls"])
	}
}

func TestSub2APIOfficialInpaintPayloadUsesMaskURL(t *testing.T) {
	payload, err := sub2APIImageGatewayJSONPayload(map[string]any{
		"prompt":                     "inpaint",
		"model":                      util.ImageModelGPTOfficial,
		"official_public_image_urls": []string{"https://cdn.example/source.png"},
		"input_image_mask":           "https://cdn.example/mask.png",
		"images":                     []protocol.UploadedImage{{ContentType: "image/png", Data: []byte("private")}},
	})
	if err != nil {
		t.Fatalf("official inpaint payload error = %v", err)
	}
	if payload["mask_url"] != "https://cdn.example/mask.png" {
		t.Fatalf("official mask_url = %#v", payload["mask_url"])
	}
	urls := util.AsStringSlice(payload["image_urls"])
	if len(urls) != 1 || urls[0] != "https://cdn.example/source.png" {
		t.Fatalf("official image_urls = %#v", payload["image_urls"])
	}
}

func TestSub2APIGeminiImagePayloadUsesDataURIReferences(t *testing.T) {
	payload, err := sub2APIImageGatewayJSONPayload(map[string]any{
		"prompt":           "edit",
		"model":            util.ImageModelGeminiFlashPreview,
		"image_resolution": "0.5K",
		"google_search":    true,
		"images": []protocol.UploadedImage{
			{Filename: "source.png", ContentType: "image/png", Data: []byte("private")},
		},
	})
	if err != nil {
		t.Fatalf("gemini payload error = %v", err)
	}
	if payload["model"] != util.ImageModelGeminiFlashPreview || payload["resolution"] != "0.5K" || payload["google_search"] != true {
		t.Fatalf("gemini payload = %#v", payload)
	}
	urls := util.AsStringSlice(payload["image_urls"])
	if len(urls) != 1 || !strings.HasPrefix(urls[0], "data:image/png;base64,") {
		t.Fatalf("gemini image_urls = %#v", payload["image_urls"])
	}
	if _, ok := payload["quality"]; ok {
		t.Fatalf("gemini payload should omit unsupported quality: %#v", payload)
	}
}

func TestSub2APIGeminiProPayloadUsesMaskURL(t *testing.T) {
	payload, err := sub2APIImageGatewayJSONPayload(map[string]any{
		"prompt":           "inpaint",
		"model":            util.ImageModelGeminiProPreview,
		"image_resolution": "4k",
		"input_image_mask": "data:image/png;base64,bWFzaw==",
		"images": []protocol.UploadedImage{
			{Filename: "source.jpg", ContentType: "image/jpeg", Data: []byte("private")},
		},
	})
	if err != nil {
		t.Fatalf("gemini pro payload error = %v", err)
	}
	if payload["resolution"] != "4K" || payload["mask_url"] != "data:image/png;base64,bWFzaw==" {
		t.Fatalf("gemini pro payload = %#v", payload)
	}
	urls := util.AsStringSlice(payload["image_urls"])
	if len(urls) != 1 || !strings.HasPrefix(urls[0], "data:image/jpeg;base64,") {
		t.Fatalf("gemini pro image_urls = %#v", payload["image_urls"])
	}
}

func TestSub2APIOfficialImageEditPayloadRejectsPrivateReferences(t *testing.T) {
	_, err := sub2APIImageGatewayJSONPayload(map[string]any{
		"prompt": "edit",
		"model":  util.ImageModelGPTOfficial,
		"images": []protocol.UploadedImage{{ContentType: "image/png", Data: []byte("private")}},
	})
	if err == nil {
		t.Fatal("expected private reference error")
	}
	if !strings.Contains(err.Error(), "官方图生图需要可公开访问的参考图链接") {
		t.Fatalf("error = %q", err.Error())
	}
	if strings.Contains(strings.ToLower(err.Error()), "apimart") {
		t.Fatalf("error should not expose upstream brand: %q", err.Error())
	}
}

func TestProtocolImageBillingUnitAmountResolutionOverridesSize(t *testing.T) {
	got := protocolImageBillingUnitAmount("gpt-image-2", map[string]any{
		"size":             "16:9",
		"image_resolution": "4k",
		"quality":          "high",
	})
	if got != 152 {
		t.Fatalf("protocolImageBillingUnitAmount() = %d, want 152", got)
	}
}

func TestProtocolImageBillingUnitAmountGeminiProReferencePrice(t *testing.T) {
	got := protocolImageBillingUnitAmount(util.ImageModelGeminiProPreview, map[string]any{
		"size":             "16:9",
		"image_resolution": "4k",
	})
	if got != 525 {
		t.Fatalf("protocolImageBillingUnitAmount() = %d, want 525", got)
	}
}

func TestWriteSub2APIImagePartUsesImageContentType(t *testing.T) {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	err := writeSub2APIImagePart(writer, protocol.UploadedImage{
		Filename:    "source.png",
		ContentType: "application/octet-stream",
		Data:        []byte("reference-bytes"),
	})
	if err != nil {
		t.Fatalf("writeSub2APIImagePart() error = %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("multipart close: %v", err)
	}
	reader := multipart.NewReader(&body, writer.Boundary())
	part, err := reader.NextPart()
	if err != nil {
		t.Fatalf("NextPart() error = %v", err)
	}
	if got := part.Header.Get("Content-Type"); got != "image/png" {
		t.Fatalf("part Content-Type = %q, want image/png", got)
	}
	if got := part.FormName(); got != "image" {
		t.Fatalf("part form name = %q, want image", got)
	}
	if got := part.FileName(); got != "source.png" {
		t.Fatalf("part filename = %q, want source.png", got)
	}
}

func TestDirectImageGenerationUsesCreationLimiter(t *testing.T) {
	t.Setenv("CHATGPT2API_USER_DEFAULT_CONCURRENT_LIMIT", "2")
	app := newTestApp(t)
	defer app.Close()
	_, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "image-user", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}

	app.engine.ImageTokenProvider = func(context.Context) (string, error) {
		return "test-token", nil
	}
	app.engine.ImageClientFactory = func(string) *backend.Client {
		return nil
	}

	var mu sync.Mutex
	active := 0
	maxActive := 0
	release := make(chan struct{})
	app.engine.StreamImageOutputsFunc = func(ctx context.Context, client *backend.Client, request protocol.ConversationRequest, index, total int) (<-chan protocol.ImageOutput, <-chan error) {
		out := make(chan protocol.ImageOutput)
		errCh := make(chan error, 1)
		go func() {
			defer close(out)
			defer close(errCh)
			mu.Lock()
			active++
			if active > maxActive {
				maxActive = active
			}
			mu.Unlock()
			select {
			case <-release:
			case <-ctx.Done():
				errCh <- ctx.Err()
				return
			}
			out <- protocol.ImageOutput{
				Kind:    "result",
				Model:   request.Model,
				Index:   index,
				Total:   total,
				Created: int64(index),
				Data:    []map[string]any{{"url": fmt.Sprintf("https://example.test/%d.png", index)}},
			}
			mu.Lock()
			active--
			mu.Unlock()
			errCh <- nil
		}()
		return out, errCh
	}

	req := httptest.NewRequest(http.MethodPost, "/v1/images/generations", strings.NewReader(`{"prompt":"draw","model":"gpt-image-2","n":3,"response_format":"url"}`))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res := httptest.NewRecorder()
	done := make(chan struct{})
	go func() {
		defer close(done)
		app.Handler().ServeHTTP(res, req)
	}()

	waitForHTTPTestCondition(t, func() bool {
		mu.Lock()
		defer mu.Unlock()
		return maxActive >= 2
	})
	time.Sleep(120 * time.Millisecond)
	mu.Lock()
	gotMaxActive := maxActive
	mu.Unlock()
	if gotMaxActive != 2 {
		t.Fatalf("max concurrent direct image outputs = %d, want 2", gotMaxActive)
	}
	close(release)
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("direct image generation request did not finish")
	}
	if res.Code != http.StatusOK {
		t.Fatalf("direct image generation status = %d body = %s", res.Code, res.Body.String())
	}
}

func TestDirectImageGenerationRejectsBlockedPrompt(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()
	_, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "image-user", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/v1/images/generations", strings.NewReader(`{"prompt":"生成血腥肢解的暴力画面","model":"gpt-image-2","n":1}`))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("blocked image generation status = %d body = %s", res.Code, res.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("blocked response json: %v", err)
	}
	errorBody := util.StringMap(body["error"])
	if errorBody["code"] != "content_policy_violation" || errorBody["type"] != "invalid_request_error" {
		t.Fatalf("blocked response = %#v", body)
	}
}

func TestDirectImageGenerationNormalizesUpstreamContentPolicyError(t *testing.T) {
	const upstreamMessage = "内容不合规：「a painting of a woman wearing a yellow dress」，请修改提示词后重试"
	app := newTestApp(t)
	defer app.Close()
	installHTTPTestImageStreamFunc(t, app, func(ctx context.Context, client *backend.Client, request protocol.ConversationRequest, index, total int) (<-chan protocol.ImageOutput, <-chan error) {
		out := make(chan protocol.ImageOutput)
		errCh := make(chan error, 1)
		close(out)
		errCh <- errors.New(upstreamMessage)
		close(errCh)
		return out, errCh
	})
	_, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "image-user", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/v1/images/generations", strings.NewReader(`{"prompt":"draw","model":"gpt-image-2","n":1}`))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("upstream policy status = %d body = %s", res.Code, res.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("upstream policy response json: %v", err)
	}
	errorBody := util.StringMap(body["error"])
	if errorBody["code"] != "content_policy_violation" || errorBody["type"] != "invalid_request_error" || errorBody["param"] != "prompt" {
		t.Fatalf("upstream policy response = %#v", body)
	}
	if errorBody["message"] != upstreamMessage {
		t.Fatalf("message = %#v, want original upstream message", errorBody["message"])
	}
}

func TestDirectImageGenerationNormalizesUpstreamImageTooLargeError(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()
	installHTTPTestImageStreamFunc(t, app, func(ctx context.Context, client *backend.Client, request protocol.ConversationRequest, index, total int) (<-chan protocol.ImageOutput, <-chan error) {
		out := make(chan protocol.ImageOutput)
		errCh := make(chan error, 1)
		close(out)
		errCh <- errors.New("status_code=400, Part exceeded maximum size of 1024KB.")
		close(errCh)
		return out, errCh
	})
	_, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "image-user", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/v1/images/generations", strings.NewReader(`{"prompt":"draw","model":"gpt-image-2","n":1}`))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("upstream large image status = %d body = %s", res.Code, res.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("upstream large image response json: %v", err)
	}
	errorBody := util.StringMap(body["error"])
	if errorBody["code"] != "image_too_large" || errorBody["type"] != "invalid_request_error" || errorBody["param"] != "image" {
		t.Fatalf("upstream large image response = %#v", body)
	}
	if !strings.Contains(util.Clean(errorBody["message"]), "参考图片过大") {
		t.Fatalf("message = %#v, want user-facing size hint", errorBody["message"])
	}
}

func TestDirectImageEditAcceptsJSONImageURLInputs(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()
	var png bytes.Buffer
	if err := encodeHTTPTestPNG(&png); err != nil {
		t.Fatalf("encode png: %v", err)
	}
	installHTTPTestImageStreamFunc(t, app, func(ctx context.Context, client *backend.Client, request protocol.ConversationRequest, index, total int) (<-chan protocol.ImageOutput, <-chan error) {
		if len(request.Images) != 1 {
			t.Fatalf("request images = %d, want 1", len(request.Images))
		}
		for _, encoded := range request.Images {
			if data, err := base64.StdEncoding.DecodeString(encoded); err != nil || len(data) == 0 {
				t.Fatalf("encoded request image invalid: len=%d err=%v", len(data), err)
			}
		}
		return httpTestImageOutputStream(request, index)
	})
	_, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "json-image-edit", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}
	payload := map[string]any{
		"prompt": "edit this",
		"model":  "gpt-image-2",
		"n":      1,
		"images": []map[string]any{
			{"image_url": "data:image/png;base64," + base64.StdEncoding.EncodeToString(png.Bytes())},
		},
	}
	req := httptest.NewRequest(http.MethodPost, "/v1/images/edits", strings.NewReader(jsonString(payload)))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("json image edit status = %d body = %s", res.Code, res.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("json image edit response json: %v", err)
	}
	usage := util.StringMap(body["usage"])
	if util.ToInt(usage["input_tokens"], 0) <= 0 || util.ToInt(usage["output_tokens"], 0) <= 0 {
		t.Fatalf("usage = %#v", usage)
	}
}

func TestDirectImageEditRejectsLoopbackJSONImageURL(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write([]byte("png"))
	}))
	defer remote.Close()

	_, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "json-image-edit", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/v1/images/edits", strings.NewReader(jsonString(map[string]any{
		"prompt": "edit",
		"model":  "gpt-image-2",
		"images": []map[string]any{
			{"image_url": remote.URL + "/input.png"},
		},
	})))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("loopback image_url status = %d body = %s", res.Code, res.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("loopback response json: %v", err)
	}
	errorBody := util.StringMap(body["error"])
	if !strings.Contains(util.Clean(errorBody["message"]), "private or local network addresses") {
		t.Fatalf("loopback response = %#v", body)
	}
}

func TestDirectImageEditRejectsJSONFileIDReference(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()
	_, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "json-image-edit", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/v1/images/edits", strings.NewReader(`{"prompt":"edit","model":"gpt-image-2","images":[{"file_id":"file-abc"}]}`))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("file_id edit status = %d body = %s", res.Code, res.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("file_id response json: %v", err)
	}
	errorBody := util.StringMap(body["error"])
	if errorBody["type"] != "invalid_request_error" || !strings.Contains(util.Clean(errorBody["message"]), "file_id") {
		t.Fatalf("file_id response = %#v", body)
	}
}

func TestV1ErrorsUseOpenAIEnvelope(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()
	cases := []struct {
		name   string
		method string
		path   string
		auth   string
		body   string
		status int
	}{
		{name: "unauthorized", method: http.MethodGet, path: "/v1/models", status: http.StatusUnauthorized},
		{name: "bad request", method: http.MethodPost, path: "/v1/images/generations", auth: "admin", body: `{`, status: http.StatusBadRequest},
		{name: "not found", method: http.MethodPost, path: "/v1/not-found", auth: "admin", body: `{}`, status: http.StatusNotFound},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
			if tc.auth != "" {
				auth := tc.auth
				if auth == "admin" {
					auth = adminAuthHeader(t, app)
				}
				req.Header.Set("Authorization", auth)
			}
			res := httptest.NewRecorder()
			app.Handler().ServeHTTP(res, req)
			if res.Code != tc.status {
				t.Fatalf("status = %d body = %s", res.Code, res.Body.String())
			}
			var body map[string]any
			if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
				t.Fatalf("response json: %v", err)
			}
			errorBody := util.StringMap(body["error"])
			if util.Clean(errorBody["message"]) == "" || util.Clean(errorBody["type"]) == "" {
				t.Fatalf("response = %#v", body)
			}
		})
	}
}

func TestResponsesImageGenerationRejectsBlockedPrompt(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()
	_, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "responses-user", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}

	body := `{"model":"gpt-image-2","input":"生成色情类私密人体图片","tools":[{"type":"image_generation"}]}`
	req := httptest.NewRequest(http.MethodPost, "/v1/responses", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("blocked responses image status = %d body = %s", res.Code, res.Body.String())
	}
	var response map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &response); err != nil {
		t.Fatalf("blocked response json: %v", err)
	}
	errorBody := util.StringMap(response["error"])
	if errorBody["code"] != "content_policy_violation" {
		t.Fatalf("blocked response = %#v", response)
	}
}

func TestResponsesImageGenerationTextOnlyReturnsBadRequest(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()
	_, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "responses-text-user", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}
	installHTTPTestImageStreamFunc(t, app, func(ctx context.Context, client *backend.Client, request protocol.ConversationRequest, index, total int) (<-chan protocol.ImageOutput, <-chan error) {
		out := make(chan protocol.ImageOutput, 1)
		errCh := make(chan error, 1)
		out <- protocol.ImageOutput{
			Kind:    "message",
			Model:   request.Model,
			Index:   index,
			Total:   total,
			Text:    "威海旅游攻略",
			Created: time.Now().Unix(),
		}
		close(out)
		errCh <- nil
		close(errCh)
		return out, errCh
	})

	body := `{"model":"gpt-image-2","input":"生成一张海报","tools":[{"type":"image_generation"}],"tool_choice":{"type":"image_generation"}}`
	req := httptest.NewRequest(http.MethodPost, "/v1/responses", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("text-only responses image status = %d body = %s", res.Code, res.Body.String())
	}
	var response map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &response); err != nil {
		t.Fatalf("text-only responses image json: %v", err)
	}
	errorBody := util.StringMap(response["error"])
	if errorBody["code"] != "image_generation_text_response" || errorBody["message"] != "威海旅游攻略" {
		t.Fatalf("text-only responses image error = %#v", errorBody)
	}
}

func TestDirectImageGenerationDoesNotLimitAdminToken(t *testing.T) {
	t.Setenv("CHATGPT2API_USER_DEFAULT_CONCURRENT_LIMIT", "2")
	app := newTestApp(t)
	defer app.Close()

	app.engine.ImageTokenProvider = func(context.Context) (string, error) {
		return "test-token", nil
	}
	app.engine.ImageClientFactory = func(string) *backend.Client {
		return nil
	}

	var mu sync.Mutex
	active := 0
	maxActive := 0
	release := make(chan struct{})
	app.engine.StreamImageOutputsFunc = func(ctx context.Context, client *backend.Client, request protocol.ConversationRequest, index, total int) (<-chan protocol.ImageOutput, <-chan error) {
		out := make(chan protocol.ImageOutput)
		errCh := make(chan error, 1)
		go func() {
			defer close(out)
			defer close(errCh)
			mu.Lock()
			active++
			if active > maxActive {
				maxActive = active
			}
			mu.Unlock()
			select {
			case <-release:
			case <-ctx.Done():
				errCh <- ctx.Err()
				return
			}
			out <- protocol.ImageOutput{
				Kind:    "result",
				Model:   request.Model,
				Index:   index,
				Total:   total,
				Created: int64(index),
				Data:    []map[string]any{{"url": fmt.Sprintf("https://example.test/%d.png", index)}},
			}
			mu.Lock()
			active--
			mu.Unlock()
			errCh <- nil
		}()
		return out, errCh
	}

	req := httptest.NewRequest(http.MethodPost, "/v1/images/generations", strings.NewReader(`{"prompt":"draw","model":"gpt-image-2","n":3,"response_format":"url"}`))
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res := httptest.NewRecorder()
	done := make(chan struct{})
	go func() {
		defer close(done)
		app.Handler().ServeHTTP(res, req)
	}()

	waitForHTTPTestCondition(t, func() bool {
		mu.Lock()
		defer mu.Unlock()
		return maxActive >= 3
	})
	mu.Lock()
	gotMaxActive := maxActive
	mu.Unlock()
	if gotMaxActive != 3 {
		t.Fatalf("max concurrent admin image outputs = %d, want 3", gotMaxActive)
	}
	close(release)
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("admin image generation request did not finish")
	}
	if res.Code != http.StatusOK {
		t.Fatalf("admin image generation status = %d body = %s", res.Code, res.Body.String())
	}
}

func TestProtocolImageBillingInsufficientErrors(t *testing.T) {
	for _, tc := range []struct {
		name              string
		billingType       string
		standardBalance   string
		subscriptionQuota string
		wantCode          string
		wantMessage       string
	}{
		{
			name:              "standard",
			billingType:       service.BillingTypeStandard,
			standardBalance:   "0",
			subscriptionQuota: "100",
			wantCode:          "user_balance_insufficient",
			wantMessage:       "用户余额不足",
		},
		{
			name:              "subscription",
			billingType:       service.BillingTypeSubscription,
			standardBalance:   "100",
			subscriptionQuota: "0",
			wantCode:          "user_quota_exceeded",
			wantMessage:       "用户配额不足",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			app := newTestAppWithBillingDefaults(t, tc.billingType, tc.standardBalance, tc.subscriptionQuota, service.BillingPeriodMonthly)
			defer app.Close()

			_, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "billing-user", service.AuthOwner{})
			if err != nil {
				t.Fatalf("CreateAPIKey() error = %v", err)
			}

			req := httptest.NewRequest(http.MethodPost, "/v1/images/generations", strings.NewReader(`{"prompt":"draw","model":"gpt-image-2","n":1,"response_format":"url"}`))
			req.Header.Set("Authorization", "Bearer "+rawKey)
			res := httptest.NewRecorder()
			app.Handler().ServeHTTP(res, req)
			if res.Code != http.StatusTooManyRequests {
				t.Fatalf("image generation status = %d body = %s", res.Code, res.Body.String())
			}

			var payload map[string]any
			if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
				t.Fatalf("error json: %v", err)
			}
			errorBody := util.StringMap(payload["error"])
			if errorBody["type"] != "insufficient_quota" || errorBody["code"] != tc.wantCode || errorBody["message"] != tc.wantMessage {
				t.Fatalf("error body = %#v", payload)
			}
		})
	}
}

func TestProtocolBillableUnitsBoundaryAndEquivalenceClasses(t *testing.T) {
	tests := []struct {
		name     string
		endpoint string
		body     map[string]any
		want     int
	}{
		{
			name:     "image generation defaults to one",
			endpoint: "/v1/images/generations",
			body:     map[string]any{},
			want:     1,
		},
		{
			name:     "image generation zero clamps to one",
			endpoint: "/v1/images/generations",
			body:     map[string]any{"n": 0},
			want:     1,
		},
		{
			name:     "image generation negative clamps to one",
			endpoint: "/v1/images/generations",
			body:     map[string]any{"n": -3},
			want:     1,
		},
		{
			name:     "image generation upper bound",
			endpoint: "/v1/images/generations",
			body:     map[string]any{"n": 4},
			want:     4,
		},
		{
			name:     "image generation above upper bound clamps",
			endpoint: "/v1/images/generations",
			body:     map[string]any{"n": 5},
			want:     4,
		},
		{
			name:     "text chat is free even with n",
			endpoint: "/v1/chat/completions",
			body: map[string]any{
				"model":    "gpt-5",
				"n":        4,
				"messages": []any{map[string]any{"role": "user", "content": "hello"}},
			},
			want: 0,
		},
		{
			name:     "image chat defaults to one",
			endpoint: "/v1/chat/completions",
			body: map[string]any{
				"model":      "gpt-5",
				"modalities": []any{"image"},
				"messages":   []any{map[string]any{"role": "user", "content": "draw"}},
			},
			want: 1,
		},
		{
			name:     "image chat above upper bound clamps",
			endpoint: "/v1/chat/completions",
			body: map[string]any{
				"model":      "gpt-5",
				"modalities": []any{"image"},
				"n":          7,
				"messages":   []any{map[string]any{"role": "user", "content": "draw"}},
			},
			want: 4,
		},
		{
			name:     "text responses are free",
			endpoint: "/v1/responses",
			body: map[string]any{
				"model": "gpt-5",
				"input": "hello",
			},
			want: 0,
		},
		{
			name:     "responses image tool defaults to one",
			endpoint: "/v1/responses",
			body: map[string]any{
				"model": "gpt-image-2",
				"input": "draw",
				"tools": []any{map[string]any{"type": "image_generation"}},
			},
			want: 1,
		},
		{
			name:     "responses image tool choice uses n upper bound",
			endpoint: "/v1/responses",
			body: map[string]any{
				"model":       "gpt-image-2",
				"input":       "draw",
				"n":           4,
				"tool_choice": map[string]any{"type": "image_generation"},
			},
			want: 4,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := protocolBillableUnits(tc.endpoint, tc.body); got != tc.want {
				t.Fatalf("protocolBillableUnits(%q, %#v) = %d, want %d", tc.endpoint, tc.body, got, tc.want)
			}
		})
	}
}

func TestProtocolImageBillingStandardBalanceBoundary(t *testing.T) {
	app := newTestAppWithBillingDefaults(t, service.BillingTypeStandard, "204", "0", service.BillingPeriodMonthly)
	defer app.Close()
	_, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "billing-user", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}
	installHTTPTestImageStream(t, app)

	req := httptest.NewRequest(http.MethodPost, "/v1/images/generations", strings.NewReader(`{"prompt":"draw","model":"gpt-image-2","n":4,"response_format":"url"}`))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("image generation exact-balance status = %d body = %s", res.Code, res.Body.String())
	}
	state := profileBillingState(t, app, rawKey)
	standard := util.StringMap(state["standard"])
	if util.ToInt(standard["balance"], -1) != 0 || util.ToInt(standard["lifetime_consumed"], -1) != 204 || util.ToInt(state["available"], -1) != 0 {
		t.Fatalf("billing after exact-balance image generation = %#v", state)
	}

	req = httptest.NewRequest(http.MethodPost, "/v1/images/generations", strings.NewReader(`{"prompt":"draw","model":"gpt-image-2","n":1,"response_format":"url"}`))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusTooManyRequests {
		t.Fatalf("image generation drained-balance status = %d body = %s", res.Code, res.Body.String())
	}
}

func TestProtocolImageBillingRejectsBeforeUpstream(t *testing.T) {
	app := newTestAppWithBillingDefaults(t, service.BillingTypeStandard, "150", "0", service.BillingPeriodMonthly)
	defer app.Close()
	_, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "billing-user", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}
	streamCalls := 0
	installHTTPTestImageStreamFunc(t, app, func(ctx context.Context, client *backend.Client, request protocol.ConversationRequest, index, total int) (<-chan protocol.ImageOutput, <-chan error) {
		streamCalls++
		return httpTestImageOutputStream(request, index)
	})

	req := httptest.NewRequest(http.MethodPost, "/v1/images/generations", strings.NewReader(`{"prompt":"draw","model":"gpt-image-2","n":4,"response_format":"url"}`))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusTooManyRequests {
		t.Fatalf("image generation insufficient status = %d body = %s", res.Code, res.Body.String())
	}
	if streamCalls != 0 {
		t.Fatalf("insufficient request reached upstream stream %d times", streamCalls)
	}
	state := profileBillingState(t, app, rawKey)
	standard := util.StringMap(state["standard"])
	if util.ToInt(standard["balance"], -1) != 150 || util.ToInt(standard["lifetime_consumed"], -1) != 0 || util.ToInt(state["available"], -1) != 150 {
		t.Fatalf("billing after rejected image generation = %#v", state)
	}
}

func TestProtocolImageBillingChargesBeforeDelivery(t *testing.T) {
	t.Run("non-stream does not return generated image when delivery charge fails", func(t *testing.T) {
		app := newTestAppWithBillingDefaults(t, service.BillingTypeStandard, "51", "0", service.BillingPeriodMonthly)
		defer app.Close()
		user, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "billing-user", service.AuthOwner{})
		if err != nil {
			t.Fatalf("CreateAPIKey() error = %v", err)
		}
		userID := util.Clean(user["id"])
		installHTTPTestImageStreamFunc(t, app, func(ctx context.Context, client *backend.Client, request protocol.ConversationRequest, index, total int) (<-chan protocol.ImageOutput, <-chan error) {
			if _, err := app.billing.ChargeUserID(userID, 51, service.BillingReference{ChargeKey: "external:protocol:non-stream-drain"}); err != nil {
				t.Errorf("external ChargeUserID() error = %v", err)
			}
			return httpTestImageOutputStream(request, index)
		})

		req := httptest.NewRequest(http.MethodPost, "/v1/images/generations", strings.NewReader(`{"prompt":"draw","model":"gpt-image-2","n":1,"response_format":"url"}`))
		req.Header.Set("Authorization", "Bearer "+rawKey)
		res := httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		if res.Code != http.StatusTooManyRequests {
			t.Fatalf("image generation delivery charge status = %d body = %s", res.Code, res.Body.String())
		}
		if strings.Contains(res.Body.String(), "https://example.test/1.png") || strings.Contains(res.Body.String(), "image-1") {
			t.Fatalf("unpaid generated image leaked in response body: %s", res.Body.String())
		}
		state := profileBillingState(t, app, rawKey)
		standard := util.StringMap(state["standard"])
		if util.ToInt(standard["balance"], -1) != 0 || util.ToInt(standard["lifetime_consumed"], -1) != 51 || util.ToInt(state["available"], -1) != 0 {
			t.Fatalf("billing after failed delivery charge = %#v", state)
		}
	})

	t.Run("stream stops before unpaid image event", func(t *testing.T) {
		app := newTestAppWithBillingDefaults(t, service.BillingTypeStandard, "51", "0", service.BillingPeriodMonthly)
		defer app.Close()
		user, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "billing-user", service.AuthOwner{})
		if err != nil {
			t.Fatalf("CreateAPIKey() error = %v", err)
		}
		userID := util.Clean(user["id"])
		installHTTPTestImageStreamFunc(t, app, func(ctx context.Context, client *backend.Client, request protocol.ConversationRequest, index, total int) (<-chan protocol.ImageOutput, <-chan error) {
			if _, err := app.billing.ChargeUserID(userID, 51, service.BillingReference{ChargeKey: "external:protocol:stream-drain"}); err != nil {
				t.Errorf("external ChargeUserID() error = %v", err)
			}
			return httpTestImageOutputStream(request, index)
		})

		req := httptest.NewRequest(http.MethodPost, "/v1/images/generations", strings.NewReader(`{"prompt":"draw","model":"gpt-image-2","n":1,"response_format":"url","stream":true}`))
		req.Header.Set("Authorization", "Bearer "+rawKey)
		res := httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		body := res.Body.String()
		if res.Code != http.StatusOK {
			t.Fatalf("stream image generation status = %d body = %s", res.Code, body)
		}
		if strings.Contains(body, "image.generation.result") || strings.Contains(body, "https://example.test/1.png") || strings.Contains(body, "image-1") {
			t.Fatalf("unpaid generated image leaked in stream body: %s", body)
		}
		if !strings.Contains(body, `"code":"user_balance_insufficient"`) || !strings.Contains(body, "data: [DONE]") {
			t.Fatalf("stream body missing billing error or done marker: %s", body)
		}
		state := profileBillingState(t, app, rawKey)
		standard := util.StringMap(state["standard"])
		if util.ToInt(standard["balance"], -1) != 0 || util.ToInt(standard["lifetime_consumed"], -1) != 51 || util.ToInt(state["available"], -1) != 0 {
			t.Fatalf("billing after failed stream delivery charge = %#v", state)
		}
	})
}

func TestProtocolBillingChatAndResponsesEquivalenceClasses(t *testing.T) {
	t.Run("text chat does not require billing", func(t *testing.T) {
		app := newTestAppWithBillingDefaults(t, service.BillingTypeStandard, "0", "0", service.BillingPeriodMonthly)
		defer app.Close()
		_, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "billing-user", service.AuthOwner{})
		if err != nil {
			t.Fatalf("CreateAPIKey() error = %v", err)
		}

		req := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{"model":"gpt-5","messages":[{"role":"user","content":"hello"}]}`))
		req.Header.Set("Authorization", "Bearer "+rawKey)
		res := httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		if res.Code == http.StatusTooManyRequests {
			t.Fatalf("text chat was rejected by billing: %s", res.Body.String())
		}
		state := profileBillingState(t, app, rawKey)
		standard := util.StringMap(state["standard"])
		if util.ToInt(standard["balance"], -1) != 0 || util.ToInt(standard["lifetime_consumed"], -1) != 0 || util.ToInt(state["available"], -1) != 0 {
			t.Fatalf("billing changed after text chat = %#v", state)
		}
	})

	t.Run("image chat consumes actual outputs", func(t *testing.T) {
		app := newTestAppWithBillingDefaults(t, service.BillingTypeStandard, "102", "0", service.BillingPeriodMonthly)
		defer app.Close()
		_, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "billing-user", service.AuthOwner{})
		if err != nil {
			t.Fatalf("CreateAPIKey() error = %v", err)
		}
		installHTTPTestImageStreamFunc(t, app, func(ctx context.Context, client *backend.Client, request protocol.ConversationRequest, index, total int) (<-chan protocol.ImageOutput, <-chan error) {
			if index > 1 {
				return httpTestMessageOnlyImageOutputStream(request, index)
			}
			return httpTestImageOutputStream(request, index)
		})

		req := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{"model":"gpt-image-2","messages":[{"role":"user","content":"draw"}],"n":2}`))
		req.Header.Set("Authorization", "Bearer "+rawKey)
		res := httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		if res.Code != http.StatusOK {
			t.Fatalf("image chat status = %d body = %s", res.Code, res.Body.String())
		}
		state := profileBillingState(t, app, rawKey)
		standard := util.StringMap(state["standard"])
		if util.ToInt(standard["balance"], -1) != 51 || util.ToInt(standard["lifetime_consumed"], -1) != 51 || util.ToInt(state["available"], -1) != 51 {
			t.Fatalf("billing after partial image chat = %#v", state)
		}
	})

	t.Run("image chat insufficient rejects before upstream", func(t *testing.T) {
		app := newTestAppWithBillingDefaults(t, service.BillingTypeStandard, "0", "0", service.BillingPeriodMonthly)
		defer app.Close()
		_, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "billing-user", service.AuthOwner{})
		if err != nil {
			t.Fatalf("CreateAPIKey() error = %v", err)
		}
		streamCalls := 0
		installHTTPTestImageStreamFunc(t, app, func(ctx context.Context, client *backend.Client, request protocol.ConversationRequest, index, total int) (<-chan protocol.ImageOutput, <-chan error) {
			streamCalls++
			return httpTestImageOutputStream(request, index)
		})

		req := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{"model":"gpt-5","modalities":["image"],"messages":[{"role":"user","content":"draw"}],"n":1}`))
		req.Header.Set("Authorization", "Bearer "+rawKey)
		res := httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		if res.Code != http.StatusTooManyRequests {
			t.Fatalf("image chat insufficient status = %d body = %s", res.Code, res.Body.String())
		}
		if streamCalls != 0 {
			t.Fatalf("insufficient image chat reached upstream stream %d times", streamCalls)
		}
	})

	t.Run("text responses do not require billing", func(t *testing.T) {
		app := newTestAppWithBillingDefaults(t, service.BillingTypeStandard, "0", "0", service.BillingPeriodMonthly)
		defer app.Close()
		_, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "billing-user", service.AuthOwner{})
		if err != nil {
			t.Fatalf("CreateAPIKey() error = %v", err)
		}

		req := httptest.NewRequest(http.MethodPost, "/v1/responses", strings.NewReader(`{"model":"gpt-5","input":"hello"}`))
		req.Header.Set("Authorization", "Bearer "+rawKey)
		res := httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		if res.Code == http.StatusTooManyRequests {
			t.Fatalf("text responses was rejected by billing: %s", res.Body.String())
		}
		state := profileBillingState(t, app, rawKey)
		standard := util.StringMap(state["standard"])
		if util.ToInt(standard["balance"], -1) != 0 || util.ToInt(standard["lifetime_consumed"], -1) != 0 || util.ToInt(state["available"], -1) != 0 {
			t.Fatalf("billing changed after text responses = %#v", state)
		}
	})

	t.Run("responses image tool insufficient rejects before upstream", func(t *testing.T) {
		app := newTestAppWithBillingDefaults(t, service.BillingTypeStandard, "0", "0", service.BillingPeriodMonthly)
		defer app.Close()
		_, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "billing-user", service.AuthOwner{})
		if err != nil {
			t.Fatalf("CreateAPIKey() error = %v", err)
		}
		streamCalls := 0
		installHTTPTestImageStreamFunc(t, app, func(ctx context.Context, client *backend.Client, request protocol.ConversationRequest, index, total int) (<-chan protocol.ImageOutput, <-chan error) {
			streamCalls++
			return httpTestImageOutputStream(request, index)
		})

		req := httptest.NewRequest(http.MethodPost, "/v1/responses", strings.NewReader(`{"model":"gpt-image-2","input":"draw","tools":[{"type":"image_generation"}]}`))
		req.Header.Set("Authorization", "Bearer "+rawKey)
		res := httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		if res.Code != http.StatusTooManyRequests {
			t.Fatalf("responses image insufficient status = %d body = %s", res.Code, res.Body.String())
		}
		if streamCalls != 0 {
			t.Fatalf("insufficient responses image reached upstream stream %d times", streamCalls)
		}
	})
}

func TestProtocolBillingAdminBypassAndUserAdjustmentPermission(t *testing.T) {
	app := newTestAppWithBillingDefaults(t, service.BillingTypeStandard, "0", "0", service.BillingPeriodMonthly)
	defer app.Close()
	installHTTPTestImageStream(t, app)

	req := httptest.NewRequest(http.MethodPost, "/v1/images/generations", strings.NewReader(`{"prompt":"draw","model":"gpt-image-2","n":4,"response_format":"url"}`))
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("admin image generation status = %d body = %s", res.Code, res.Body.String())
	}

	user, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "billing-user", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}
	req = httptest.NewRequest(http.MethodPost, "/api/admin/users/"+url.PathEscape(util.Clean(user["id"]))+"/billing-adjustments", strings.NewReader(`{"type":"increase_balance","amount":1,"reason":"user attempt"}`))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusForbidden {
		t.Fatalf("user billing adjustment status = %d body = %s", res.Code, res.Body.String())
	}
}

func TestProfileAndManagedUsersExposeBillingState(t *testing.T) {
	app := newTestAppWithBillingDefaults(t, service.BillingTypeSubscription, "0", "12", service.BillingPeriodWeekly)
	defer app.Close()

	user, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "billing-user", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}
	userID, _ := user["id"].(string)

	req := httptest.NewRequest(http.MethodGet, "/api/profile", nil)
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("profile status = %d body = %s", res.Code, res.Body.String())
	}
	var profile map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &profile); err != nil {
		t.Fatalf("profile json: %v", err)
	}
	billing := util.StringMap(profile["billing"])
	subscription := util.StringMap(billing["subscription"])
	if billing["type"] != service.BillingTypeSubscription || util.ToInt(billing["available"], 0) != 12 || subscription["quota_period"] != service.BillingPeriodWeekly {
		t.Fatalf("profile billing = %#v", billing)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/admin/users", nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("admin users status = %d body = %s", res.Code, res.Body.String())
	}
	var users map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &users); err != nil {
		t.Fatalf("admin users json: %v", err)
	}
	item := findHTTPItem(logItems(users), userID)
	if item == nil {
		t.Fatalf("managed user %q missing from %#v", userID, users)
	}
	billing = util.StringMap(item["billing"])
	if billing["type"] != service.BillingTypeSubscription || util.ToInt(billing["available"], 0) != 12 {
		t.Fatalf("managed user billing = %#v", item["billing"])
	}
}

func TestDefaultBillingSettingsOnlyInitializeNewUsers(t *testing.T) {
	app := newTestAppWithBillingDefaults(t, service.BillingTypeStandard, "0", "0", service.BillingPeriodMonthly)
	defer app.Close()

	existing, existingKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "existing user", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey(existing) error = %v", err)
	}
	existingID := util.Clean(existing["id"])

	req := httptest.NewRequest(http.MethodPost, "/api/settings", strings.NewReader(`{
		"default_billing_type": "subscription",
		"default_standard_balance": 7,
		"default_subscription_quota": 12,
		"default_subscription_period": "weekly"
	}`))
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("update default billing settings status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/admin/users", nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("admin users status = %d body = %s", res.Code, res.Body.String())
	}
	var users map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &users); err != nil {
		t.Fatalf("admin users json: %v", err)
	}
	item := findHTTPItem(logItems(users), existingID)
	if item == nil {
		t.Fatalf("existing user %q missing from %#v", existingID, users)
	}
	billing := util.StringMap(item["billing"])
	if billing["type"] != service.BillingTypeStandard || util.ToInt(billing["available"], -1) != 0 {
		t.Fatalf("existing listed billing changed after settings update = %#v", billing)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/profile", nil)
	req.Header.Set("Authorization", "Bearer "+existingKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("existing profile status = %d body = %s", res.Code, res.Body.String())
	}
	var profile map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &profile); err != nil {
		t.Fatalf("existing profile json: %v", err)
	}
	billing = util.StringMap(profile["billing"])
	if billing["type"] != service.BillingTypeStandard || util.ToInt(billing["available"], -1) != 0 {
		t.Fatalf("existing profile billing changed after settings update = %#v", billing)
	}

	req = httptest.NewRequest(http.MethodPost, "/api/admin/users", strings.NewReader(`{"username":"newuser","password":"Password123","name":"New User"}`))
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("create new user status = %d body = %s", res.Code, res.Body.String())
	}
	var created map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &created); err != nil {
		t.Fatalf("create user json: %v", err)
	}
	newUser := util.StringMap(created["item"])
	billing = util.StringMap(newUser["billing"])
	subscription := util.StringMap(billing["subscription"])
	if billing["type"] != service.BillingTypeSubscription || util.ToInt(billing["available"], -1) != 12 || subscription["quota_period"] != service.BillingPeriodWeekly {
		t.Fatalf("new user billing did not use updated defaults = %#v", billing)
	}
}

func TestRegistrationInitializesDefaultBillingForNewUser(t *testing.T) {
	app := newTestAppWithBillingDefaults(t, service.BillingTypeSubscription, "0", "9", service.BillingPeriodDaily)
	defer app.Close()

	req := httptest.NewRequest(http.MethodPost, "/api/settings", strings.NewReader(`{"registration_enabled":true}`))
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("enable registration status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPost, "/auth/register", strings.NewReader(`{"username":"alice","password":"Password123","name":"Alice"}`))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("register status = %d body = %s", res.Code, res.Body.String())
	}
	var registered map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &registered); err != nil {
		t.Fatalf("register json: %v", err)
	}
	billing := util.StringMap(registered["billing"])
	subscription := util.StringMap(billing["subscription"])
	if billing["type"] != service.BillingTypeSubscription || util.ToInt(billing["available"], -1) != 9 || subscription["quota_period"] != service.BillingPeriodDaily {
		t.Fatalf("registered billing = %#v", billing)
	}
}

func TestAdminBulkBillingAdjustmentTargetsExplicitUsers(t *testing.T) {
	app := newTestAppWithBillingDefaults(t, service.BillingTypeStandard, "2", "0", service.BillingPeriodMonthly)
	defer app.Close()

	alice, err := app.auth.CreatePasswordUser("bulk_alice", "Password123", "Bulk Alice", service.DefaultManagedRoleID, true)
	if err != nil {
		t.Fatalf("CreatePasswordUser(alice) error = %v", err)
	}
	bob, err := app.auth.CreatePasswordUser("bulk_bob", "Password123", "Bulk Bob", service.DefaultManagedRoleID, true)
	if err != nil {
		t.Fatalf("CreatePasswordUser(bob) error = %v", err)
	}
	aliceID := util.Clean(alice["id"])
	bobID := util.Clean(bob["id"])

	req := httptest.NewRequest(http.MethodPost, "/api/admin/users/billing-adjustments/bulk", strings.NewReader(`{
		"scope": "users",
		"user_ids": [`+strconv.Quote(aliceID)+`, `+strconv.Quote(bobID)+`, `+strconv.Quote(aliceID)+`],
		"billing": {"type":"increase_balance","amount":5,"reason":"batch topup"}
	}`))
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("bulk users status = %d body = %s", res.Code, res.Body.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
		t.Fatalf("bulk users json: %v", err)
	}
	summary := util.StringMap(payload["summary"])
	if util.ToInt(summary["total"], 0) != 2 || util.ToInt(summary["succeeded"], 0) != 2 || util.ToInt(summary["failed"], -1) != 0 {
		t.Fatalf("bulk users summary = %#v", summary)
	}
	for _, userID := range []string{aliceID, bobID} {
		billing := app.billing.Get(userID)
		if util.ToInt(billing["available"], -1) != 7 {
			t.Fatalf("%s billing = %#v, want available 7", userID, billing)
		}
	}
	if adjustments := app.billing.ListAdjustments("", 10); len(adjustments) != 2 {
		t.Fatalf("bulk adjustments len = %d, want 2: %#v", len(adjustments), adjustments)
	}
}

func TestAdminBulkBillingAdjustmentTargetsRoleAndReportsFailures(t *testing.T) {
	app := newTestAppWithBillingDefaults(t, service.BillingTypeStandard, "2", "0", service.BillingPeriodMonthly)
	defer app.Close()

	role, err := app.auth.CreateRole(map[string]any{
		"name":            "bulk role",
		"menu_paths":      []string{},
		"api_permissions": []string{},
	})
	if err != nil {
		t.Fatalf("CreateRole() error = %v", err)
	}
	roleID := util.Clean(role["id"])
	alice, err := app.auth.CreatePasswordUser("bulk_role_alice", "Password123", "Bulk Role Alice", roleID, true)
	if err != nil {
		t.Fatalf("CreatePasswordUser(alice) error = %v", err)
	}
	bob, err := app.auth.CreatePasswordUser("bulk_role_bob", "Password123", "Bulk Role Bob", roleID, true)
	if err != nil {
		t.Fatalf("CreatePasswordUser(bob) error = %v", err)
	}
	other, err := app.auth.CreatePasswordUser("bulk_role_other", "Password123", "Bulk Role Other", service.DefaultManagedRoleID, true)
	if err != nil {
		t.Fatalf("CreatePasswordUser(other) error = %v", err)
	}
	aliceID := util.Clean(alice["id"])
	bobID := util.Clean(bob["id"])
	otherID := util.Clean(other["id"])
	if _, err := app.billing.ApplyAdjustment(bobID, service.Identity{ID: "admin", Name: "Admin", Role: service.AuthRoleAdmin}, map[string]any{"type": "decrease_balance", "amount": 1}); err != nil {
		t.Fatalf("pre-adjust bob error = %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/admin/users/billing-adjustments/bulk", strings.NewReader(`{
		"scope": "role",
		"role_id": `+strconv.Quote(roleID)+`,
		"billing": {"type":"decrease_balance","amount":2,"reason":"batch debit"}
	}`))
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("bulk role status = %d body = %s", res.Code, res.Body.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
		t.Fatalf("bulk role json: %v", err)
	}
	summary := util.StringMap(payload["summary"])
	if util.ToInt(summary["total"], 0) != 2 || util.ToInt(summary["succeeded"], 0) != 1 || util.ToInt(summary["failed"], 0) != 1 {
		t.Fatalf("bulk role summary = %#v", summary)
	}
	results := logItems(map[string]any{"items": payload["results"]})
	if len(results) != 2 {
		t.Fatalf("bulk role results = %#v", payload["results"])
	}
	if failed := findHTTPBulkBillingResult(results, bobID); failed == nil || util.Clean(failed["error"]) == "" {
		t.Fatalf("bob failed result = %#v", failed)
	}
	if got := app.billing.Get(aliceID); util.ToInt(got["available"], -1) != 0 {
		t.Fatalf("alice billing = %#v, want debited to 0", got)
	}
	if got := app.billing.Get(bobID); util.ToInt(got["available"], -1) != 1 {
		t.Fatalf("bob billing = %#v, want unchanged at 1", got)
	}
	if got := app.billing.Get(otherID); util.ToInt(got["available"], -1) != 2 {
		t.Fatalf("other billing = %#v, want unchanged at 2", got)
	}
}

func TestEmptyCollectionEndpointsReturnArrays(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	for _, tc := range []struct {
		name string
		path string
		keys []string
	}{
		{name: "accounts", path: "/api/accounts", keys: []string{"items"}},
		{name: "images", path: "/api/images", keys: []string{"items", "groups"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, tc.path, nil)
			req.Header.Set("Authorization", adminAuthHeader(t, app))
			res := httptest.NewRecorder()
			app.Handler().ServeHTTP(res, req)
			if res.Code != http.StatusOK {
				t.Fatalf("%s status = %d body = %s", tc.path, res.Code, res.Body.String())
			}
			var payload map[string]any
			if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
				t.Fatalf("%s json: %v", tc.path, err)
			}
			for _, key := range tc.keys {
				items, ok := payload[key].([]any)
				if !ok || items == nil || len(items) != 0 {
					t.Fatalf("%s %q = %#v, want empty array", tc.path, key, payload[key])
				}
			}
		})
	}
}

func TestRBACPermissionsGateManagementAPIs(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	user, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "operator", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/accounts", nil)
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusForbidden {
		t.Fatalf("default user accounts status = %d body = %s", res.Code, res.Body.String())
	}

	role, err := app.auth.CreateRole(map[string]any{
		"name":            "accounts viewer",
		"menu_paths":      []string{"/accounts"},
		"api_permissions": []string{service.APIPermissionKey(http.MethodGet, "/api/accounts")},
	})
	if err != nil {
		t.Fatalf("CreateRole() error = %v", err)
	}
	userID := user["id"].(string)
	updated := app.auth.UpdateUser(userID, map[string]any{"role_id": role["id"]})
	if updated == nil {
		t.Fatal("UpdateUser() returned nil")
	}

	req = httptest.NewRequest(http.MethodGet, "/auth/session", nil)
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("login after permission update status = %d body = %s", res.Code, res.Body.String())
	}
	var login map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &login); err != nil {
		t.Fatalf("login json: %v", err)
	}
	if paths := util.AsStringSlice(login["menu_paths"]); len(paths) != 1 || paths[0] != "/accounts" {
		t.Fatalf("login menu_paths = %#v", login["menu_paths"])
	}
	if login["role_id"] != role["id"] || login["role_name"] != "accounts viewer" {
		t.Fatalf("login role fields = %#v", login)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/accounts", nil)
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("granted user accounts status = %d body = %s", res.Code, res.Body.String())
	}

	app.accounts.AddAccounts([]string{"pool-token"})
	req = httptest.NewRequest(http.MethodGet, "/api/accounts", nil)
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("granted user accounts with token status = %d body = %s", res.Code, res.Body.String())
	}
	var accountsBody map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &accountsBody); err != nil {
		t.Fatalf("accounts json: %v", err)
	}
	accountItems := logItems(accountsBody)
	if len(accountItems) != 1 {
		t.Fatalf("accounts body = %#v", accountsBody)
	}
	if _, ok := accountItems[0]["access_token"]; ok {
		t.Fatalf("account list should not expose access_token without export permission: %#v", accountItems[0])
	}
	accountID, _ := accountItems[0]["id"].(string)
	if accountID == "" || accountItems[0]["token_preview"] == "" {
		t.Fatalf("account list missing id/token preview: %#v", accountItems[0])
	}

	req = httptest.NewRequest(http.MethodGet, "/api/accounts/tokens", nil)
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusForbidden {
		t.Fatalf("ungranted account token export status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPost, "/api/accounts", strings.NewReader(`{"tokens":["x"]}`))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusForbidden {
		t.Fatalf("ungranted write accounts status = %d body = %s", res.Code, res.Body.String())
	}

	if _, err := app.auth.UpdateRole(role["id"].(string), map[string]any{
		"api_permissions": []string{
			service.APIPermissionKey(http.MethodGet, "/api/accounts"),
			service.APIPermissionKey(http.MethodDelete, "/api/accounts"),
		},
	}); err != nil {
		t.Fatalf("UpdateRole(delete accounts) error = %v", err)
	}
	req = httptest.NewRequest(http.MethodDelete, "/api/accounts", strings.NewReader(`{"account_ids":["`+accountID+`"]}`))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("delete account by id status = %d body = %s", res.Code, res.Body.String())
	}

	app.accounts.AddAccounts([]string{"pool-token"})
	if _, err := app.auth.UpdateRole(role["id"].(string), map[string]any{
		"api_permissions": []string{
			service.APIPermissionKey(http.MethodGet, "/api/accounts"),
			service.APIPermissionKey(http.MethodGet, "/api/accounts/tokens"),
		},
	}); err != nil {
		t.Fatalf("UpdateRole(export tokens) error = %v", err)
	}
	req = httptest.NewRequest(http.MethodGet, "/api/accounts/tokens", nil)
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("granted account token export status = %d body = %s", res.Code, res.Body.String())
	}
	var tokenExport map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &tokenExport); err != nil {
		t.Fatalf("token export json: %v", err)
	}
	tokens := util.AsStringSlice(tokenExport["tokens"])
	if len(tokens) != 1 || tokens[0] != "pool-token" {
		t.Fatalf("exported tokens = %#v", tokenExport["tokens"])
	}
}

func TestSocialProjectsPermissionsGateAndDefaultAccess(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	user, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "social-user", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}
	if !containsHTTPTestString(util.AsStringSlice(user["menu_paths"]), "/social") {
		t.Fatalf("default user menu_paths missing /social: %#v", user["menu_paths"])
	}
	if !containsHTTPTestString(util.AsStringSlice(user["menu_paths"]), "/ecommerce-suite") {
		t.Fatalf("default user menu_paths missing /ecommerce-suite: %#v", user["menu_paths"])
	}

	req := httptest.NewRequest(http.MethodGet, "/social", nil)
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("default user /social status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPost, "/api/social-projects", strings.NewReader(`{"platform":"xhs","topic":"权限测试"}`))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("default user create social project status = %d body = %s", res.Code, res.Body.String())
	}
	var created map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &created); err != nil {
		t.Fatalf("create social project json: %v", err)
	}
	project := util.StringMap(created["item"])
	projectID := util.Clean(project["id"])
	if projectID == "" || project["platform"] != service.SocialPlatformXHS {
		t.Fatalf("created social project = %#v", project)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/social-projects/"+projectID, nil)
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("default user get social project status = %d body = %s", res.Code, res.Body.String())
	}

	role, err := app.auth.CreateRole(map[string]any{
		"name":            "no social",
		"menu_paths":      []string{"/image"},
		"api_permissions": []string{service.APIPermissionKey(http.MethodGet, "/v1/models")},
	})
	if err != nil {
		t.Fatalf("CreateRole() error = %v", err)
	}
	limited, limitedKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "limited-social-user", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey(limited) error = %v", err)
	}
	if app.auth.UpdateUser(util.Clean(limited["id"]), map[string]any{"role_id": role["id"]}) == nil {
		t.Fatal("UpdateUser(limited role) returned nil")
	}

	req = httptest.NewRequest(http.MethodGet, "/api/social-projects", nil)
	req.Header.Set("Authorization", "Bearer "+limitedKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusForbidden {
		t.Fatalf("limited user social API status = %d body = %s", res.Code, res.Body.String())
	}
}

func TestSocialProjectGenerateCardsCancelsSubmittedTasksOnPartialFailure(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	user, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "social-partial", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}
	callCount := 0
	ownerID := util.Clean(user["id"])
	app.tasks = service.NewStoredImageTaskService(testJSONStoreFromApp(t, app),
		func(ctx context.Context, identity service.Identity, payload map[string]any) (map[string]any, error) {
			callCount++
			<-ctx.Done()
			return nil, ctx.Err()
		},
		failingHTTPImageTaskHandler,
		failingHTTPImageTaskHandler,
		func() int { return 30 },
	)

	req := httptest.NewRequest(http.MethodPost, "/api/social-projects", strings.NewReader(`{"platform":"xhs","topic":"partial","cards":[{"title":"A","visual_mode":"ai","image_prompt":"draw a"},{"title":"B","visual_mode":"ai","image_prompt":"生成血腥肢解的暴力画面"}]}`))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("create social project status = %d body = %s", res.Code, res.Body.String())
	}
	var created map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &created); err != nil {
		t.Fatalf("create social project json: %v", err)
	}
	projectID := util.Clean(util.StringMap(created["item"])["id"])
	if projectID == "" {
		t.Fatalf("created social project missing id: %#v", created)
	}

	req = httptest.NewRequest(http.MethodPost, "/api/social-projects/"+projectID+"/generate-cards", strings.NewReader(`{}`))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("generate cards status = %d body = %s", res.Code, res.Body.String())
	}
	var failed map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &failed); err != nil {
		t.Fatalf("generate cards error json: %v", err)
	}
	detail := util.StringMap(failed["detail"])
	if partial := util.AsMapSlice(detail["partial_tasks"]); len(partial) != 1 {
		t.Fatalf("partial_tasks = %#v", detail["partial_tasks"])
	}
	if cancelErrors := util.AsStringSlice(detail["cancel_errors"]); len(cancelErrors) != 0 {
		t.Fatalf("cancel_errors = %#v", cancelErrors)
	}
	if callCount > 1 {
		t.Fatalf("handler calls = %d, want only the first queued task to reach handler", callCount)
	}
	item := util.StringMap(detail["item"])
	taskIDs := util.AsStringSlice(item["card_task_ids"])
	if len(taskIDs) != 1 {
		t.Fatalf("stored partial card_task_ids = %#v item=%#v", item["card_task_ids"], item)
	}
	waitForHTTPTestCondition(t, func() bool {
		task, ok := app.tasks.GetTask(service.Identity{ID: ownerID, Role: service.AuthRoleUser}, taskIDs[0])
		return ok && task["status"] == service.TaskStatusCancelled
	})
}

func TestCreationTaskChatCompletionDefaultsToChatModel(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	user, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "chat-task", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}
	ownerID := util.Clean(user["id"])
	seenPayload := make(chan map[string]any, 1)
	app.tasks = service.NewStoredImageTaskService(testJSONStoreFromApp(t, app),
		failingHTTPImageTaskHandler,
		failingHTTPImageTaskHandler,
		func(ctx context.Context, identity service.Identity, payload map[string]any) (map[string]any, error) {
			seenPayload <- payload
			return map[string]any{"output_type": "text", "data": []map[string]any{{"text_response": "ok"}}}, nil
		},
		func() int { return 30 },
	)

	req := httptest.NewRequest(http.MethodPost, "/api/creation-tasks/chat-completions", strings.NewReader(`{"client_task_id":"chat-default","prompt":"hello","messages":[{"role":"user","content":"hello"}]}`))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("submit chat task status = %d body = %s", res.Code, res.Body.String())
	}
	var submitted map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &submitted); err != nil {
		t.Fatalf("submit chat task json: %v", err)
	}
	if submitted["model"] != util.DefaultChatModel {
		t.Fatalf("submitted model = %#v, want %q", submitted["model"], util.DefaultChatModel)
	}
	waitForHTTPTestCondition(t, func() bool {
		task, ok := app.tasks.GetTask(service.Identity{ID: ownerID, Role: service.AuthRoleUser}, "chat-default")
		return ok && task["status"] == service.TaskStatusSuccess
	})
	select {
	case payload := <-seenPayload:
		if payload["model"] != util.DefaultChatModel {
			t.Fatalf("handler model = %#v, want %q", payload["model"], util.DefaultChatModel)
		}
	default:
		t.Fatal("chat task handler was not called")
	}
}

func TestCreationTaskChatCompletionStoresWebSearchFlag(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()
	searchServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"results":[{"title":"News","url":"https://example.test/news","snippet":"Today"}]}`)
	}))
	defer searchServer.Close()
	t.Setenv("CHATGPT2API_WEB_SEARCH_MODE", "external")
	t.Setenv("CHATGPT2API_WEB_SEARCH_URL", searchServer.URL+"/search")
	app.webSearch = websearch.NewClient(app.config.WebSearch())

	user, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "chat-web-search", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}
	ownerID := util.Clean(user["id"])
	seenPayload := make(chan map[string]any, 1)
	app.tasks = service.NewStoredImageTaskService(testJSONStoreFromApp(t, app),
		failingHTTPImageTaskHandler,
		failingHTTPImageTaskHandler,
		func(ctx context.Context, identity service.Identity, payload map[string]any) (map[string]any, error) {
			seenPayload <- payload
			return map[string]any{"output_type": "text", "data": []map[string]any{{"text_response": "ok"}}}, nil
		},
		func() int { return 30 },
	)

	req := httptest.NewRequest(http.MethodPost, "/api/creation-tasks/chat-completions", strings.NewReader(`{"client_task_id":"chat-search-flag","prompt":"查一下今天新闻","model":"gpt-5.5","web_search":true,"messages":[{"role":"user","content":"查一下今天新闻"}]}`))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("submit chat task status = %d body = %s", res.Code, res.Body.String())
	}
	waitForHTTPTestCondition(t, func() bool {
		task, ok := app.tasks.GetTask(service.Identity{ID: ownerID, Role: service.AuthRoleUser}, "chat-search-flag")
		return ok && task["status"] == service.TaskStatusSuccess && task["web_search"] == true
	})
	select {
	case payload := <-seenPayload:
		if payload["web_search"] != true {
			t.Fatalf("handler web_search = %#v, want true", payload["web_search"])
		}
	default:
		t.Fatal("chat task handler was not called")
	}
}

func TestPrepareChatPayloadWithWebSearchUsesNativeToolByDefault(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	prepared, err := app.prepareChatPayloadWithWebSearch(context.Background(), map[string]any{
		"model":      "gpt-5.5",
		"prompt":     "latest release",
		"web_search": true,
		"messages":   []any{map[string]any{"role": "user", "content": "latest release"}},
	}, true)
	if err != nil {
		t.Fatalf("prepareChatPayloadWithWebSearch() error = %v", err)
	}
	if prepared["web_search_native"] != true {
		t.Fatalf("web_search_native = %#v, want true", prepared["web_search_native"])
	}
	if _, ok := prepared["web_search_options"].(map[string]any); !ok {
		t.Fatalf("web_search_options = %T, want map[string]any", prepared["web_search_options"])
	}
	tools := anyList(prepared["tools"])
	if len(tools) != 1 || util.StringMap(tools[0])["type"] != "web_search_preview" {
		t.Fatalf("tools = %#v, want web_search_preview tool", prepared["tools"])
	}
	messages := util.AsMapSlice(prepared["messages"])
	if len(messages) != 1 || messages[0]["role"] != "user" {
		t.Fatalf("native search should not inject local search context: %#v", messages)
	}
}

func TestPrepareChatPayloadWithWebSearchRejectsNativeWithoutCompatibleUpstream(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	_, err := app.prepareChatPayloadWithWebSearch(context.Background(), map[string]any{
		"model":      "gpt-5.5",
		"prompt":     "latest release",
		"web_search": true,
		"messages":   []any{map[string]any{"role": "user", "content": "latest release"}},
	}, false)
	if err == nil || !strings.Contains(err.Error(), "Sub2API/OpenAI") {
		t.Fatalf("prepareChatPayloadWithWebSearch() error = %v, want compatible upstream message", err)
	}
}

func TestRunLoggedChatTaskInjectsExternalWebSearchResults(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	searchServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("q") != "latest release" {
			t.Fatalf("search query = %q, want latest release", r.URL.Query().Get("q"))
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"results":[{"title":"Release note","url":"https://example.test/release","snippet":"Version details"}]}`)
	}))
	defer searchServer.Close()
	t.Setenv("CHATGPT2API_WEB_SEARCH_MODE", "external")
	t.Setenv("CHATGPT2API_WEB_SEARCH_URL", searchServer.URL+"/search")
	app.webSearch = websearch.NewClient(app.config.WebSearch())

	prepared, err := app.prepareChatPayloadWithWebSearch(context.Background(), map[string]any{
		"model":      "gpt-5.5",
		"prompt":     "latest release",
		"web_search": true,
		"messages":   []any{map[string]any{"role": "user", "content": "latest release"}},
	}, false)
	if err != nil {
		t.Fatalf("prepareChatPayloadWithWebSearch() error = %v", err)
	}
	messages := util.AsMapSlice(prepared["messages"])
	if len(messages) < 2 || messages[0]["role"] != "system" || !strings.Contains(util.Clean(messages[0]["content"]), "https://example.test/release") {
		t.Fatalf("messages missing web search context: %#v", messages)
	}
	if util.ToInt(prepared["web_search_result_count"], 0) != 1 {
		t.Fatalf("web_search_result_count = %#v, want 1", prepared["web_search_result_count"])
	}
}

func TestSub2APIChatPayloadCarriesNativeWebSearch(t *testing.T) {
	payload := prepareChatPayloadWithNativeWebSearch(map[string]any{
		"model":      "gpt-5.5",
		"messages":   []any{map[string]any{"role": "user", "content": "news"}},
		"web_search": true,
	})

	body := sub2APIResponsesPayload(payload)
	tools := anyList(body["tools"])
	if len(tools) != 1 || util.StringMap(tools[0])["type"] != "web_search_preview" {
		t.Fatalf("sub2api tools = %#v, want web_search_preview tool", body["tools"])
	}
	if body["web_search_options"] != nil {
		t.Fatalf("web_search_options = %#v, want omitted when empty for Responses", body["web_search_options"])
	}
	input := util.AsMapSlice(body["input"])
	if len(input) != 1 || input[0]["role"] != "user" {
		t.Fatalf("input = %#v, want Responses user input", body["input"])
	}
}

func TestRunLoggedSub2APIChatTaskUsesResponsesForNativeWebSearch(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	var path string
	var body map[string]any
	gateway := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path = r.URL.Path
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode sub2api request: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"id":"resp_test","object":"response","created_at":123,"model":"gpt-5.5","output":[{"type":"message","content":[{"type":"output_text","text":"searched answer"}]}]}`)
	}))
	defer gateway.Close()

	result, err := app.runLoggedSub2APIChatTask(context.Background(), service.Identity{
		ID:       "sub2api:user-1",
		Role:     service.AuthRoleUser,
		Provider: service.AuthProviderSub2API,
	}, map[string]any{
		"model":      "gpt-5.5",
		"prompt":     "today news",
		"web_search": true,
		"messages":   []any{map[string]any{"role": "user", "content": "today news"}},
	}, service.Sub2APIBinding{
		OwnerID:        "sub2api:user-1",
		SessionToken:   "session",
		APIKey:         "sk-test",
		GatewayBaseURL: gateway.URL + "/v1",
	})
	if err != nil {
		t.Fatalf("runLoggedSub2APIChatTask() error = %v", err)
	}
	if path != "/v1/responses" {
		t.Fatalf("sub2api path = %q, want /v1/responses", path)
	}
	tools := anyList(body["tools"])
	if len(tools) != 1 || util.StringMap(tools[0])["type"] != "web_search_preview" {
		t.Fatalf("tools = %#v, want web_search_preview", body["tools"])
	}
	if util.Clean(result["output_type"]) != "text" {
		t.Fatalf("result = %#v, want text output", result)
	}
	data := util.AsMapSlice(result["data"])
	if len(data) != 1 || util.Clean(data[0]["text_response"]) != "searched answer" {
		t.Fatalf("data = %#v, want searched answer", result["data"])
	}
}

func TestAccountToggleEnabledEndpoint(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	app.accounts.AddAccounts([]string{"token-1", "token-2"})
	app.accounts.UpdateAccount("token-1", map[string]any{"status": "正常"})
	app.accounts.UpdateAccount("token-2", map[string]any{"status": "限流"})

	accounts := app.accounts.ListAccounts()
	account1 := findHTTPItem(accounts, util.SHA1Short("token-1", 16))
	account2 := findHTTPItem(accounts, util.SHA1Short("token-2", 16))
	if account1 == nil || account2 == nil {
		t.Fatalf("created accounts missing: %#v", accounts)
	}
	account1ID := util.Clean(account1["id"])
	account2ID := util.Clean(account2["id"])

	req := httptest.NewRequest(http.MethodPost, "/api/accounts/toggle-enabled", strings.NewReader(`{"account_ids":["`+account1ID+`","`+account2ID+`"],"enabled":false}`))
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("disable accounts status = %d body = %s", res.Code, res.Body.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
		t.Fatalf("disable accounts json: %v", err)
	}
	if util.ToInt(payload["updated"], -1) != 2 || util.ToInt(payload["skipped"], -1) != 0 {
		t.Fatalf("disable result = %#v", payload)
	}
	items := logItems(payload)
	updated2 := findHTTPItem(items, account2ID)
	if updated2 == nil || updated2["status"] != "限流" || updated2["enabled"] != false {
		t.Fatalf("disabled token-2 item = %#v in %#v", updated2, payload)
	}

	req = httptest.NewRequest(http.MethodPost, "/api/accounts/toggle-enabled", strings.NewReader(`{"account_id":"`+account2ID+`","enabled":true}`))
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("enable account status = %d body = %s", res.Code, res.Body.String())
	}
	if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
		t.Fatalf("enable account json: %v", err)
	}
	if util.ToInt(payload["updated"], -1) != 1 || util.ToInt(payload["skipped"], -1) != 0 {
		t.Fatalf("enable result = %#v", payload)
	}
	items = logItems(payload)
	updated2 = findHTTPItem(items, account2ID)
	if updated2 == nil || updated2["status"] != "限流" || updated2["enabled"] != true {
		t.Fatalf("enabled token-2 item = %#v in %#v", updated2, payload)
	}
}

func TestRedactAccountPayloadCoversRefreshResults(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	identity := service.Identity{
		Role: service.AuthRoleUser,
		APIPermissions: []string{
			service.APIPermissionKey(http.MethodGet, "/api/accounts"),
			service.APIPermissionKey(http.MethodPost, "/api/accounts/refresh"),
		},
	}
	payload := map[string]any{
		"items": []map[string]any{{
			"id":           "account-1",
			"access_token": "token-1",
		}},
		"errors": []map[string]string{{
			"access_token": "token-2",
			"error":        "failed",
		}},
		"results": []map[string]any{{
			"access_token": "token-3",
			"success":      false,
			"message":      "failed",
		}},
	}

	app.redactAccountPayloadForIdentity(identity, payload)

	items := payload["items"].([]map[string]any)
	if _, ok := items[0]["access_token"]; ok {
		t.Fatalf("items should not expose access_token: %#v", items[0])
	}
	errors := payload["errors"].([]map[string]string)
	if _, ok := errors[0]["access_token"]; ok {
		t.Fatalf("errors should not expose access_token: %#v", errors[0])
	}
	if errors[0]["account_id"] != util.SHA1Short("token-2", 16) {
		t.Fatalf("error account_id = %#v, want hash", errors[0]["account_id"])
	}
	results := payload["results"].([]map[string]any)
	if _, ok := results[0]["access_token"]; ok {
		t.Fatalf("results should not expose access_token: %#v", results[0])
	}
	if results[0]["account_id"] != util.SHA1Short("token-3", 16) {
		t.Fatalf("result account_id = %#v, want hash", results[0]["account_id"])
	}
}

func TestRBACImageDeletePermissionIsOwnerScopedForUsers(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	owner := service.AuthOwner{ID: "user:operator", Name: "image-operator", Provider: service.AuthProviderLocal}
	_, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "image-operator", owner)
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}
	ownRel := "delegated-own-delete.png"
	otherRel := "delegated-other-delete.png"
	for _, rel := range []string{ownRel, otherRel} {
		if err := writeHTTPTestPNG(filepath.Join(app.config.ImagesDir(), filepath.FromSlash(rel))); err != nil {
			t.Fatalf("write test image %s: %v", rel, err)
		}
	}
	app.images.RecordGeneratedImages([]string{ownRel}, owner.ID, owner.Name, service.ImageVisibilityPrivate)
	app.images.RecordGeneratedImages([]string{otherRel}, "another-owner", "Another Owner", service.ImageVisibilityPrivate)

	req := httptest.NewRequest(http.MethodDelete, "/api/images", strings.NewReader(`{"paths":["`+ownRel+`","`+otherRel+`"]}`))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("default user delete status = %d body = %s", res.Code, res.Body.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
		t.Fatalf("delete json: %v", err)
	}
	if payload["deleted"] != float64(1) || payload["missing"] != float64(1) {
		t.Fatalf("delete body = %#v", payload)
	}
	if _, err := os.Stat(filepath.Join(app.config.ImagesDir(), filepath.FromSlash(ownRel))); !os.IsNotExist(err) {
		t.Fatalf("own image should be deleted, stat error = %v", err)
	}
	if _, err := os.Stat(filepath.Join(app.config.ImagesDir(), filepath.FromSlash(otherRel))); err != nil {
		t.Fatalf("other image should not be deleted, stat error = %v", err)
	}
}

func TestSub2APIImageDeletePermissionIsOwnerScoped(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	owner := service.AuthOwner{ID: "sub2api:123", Name: "sub2api-user", Provider: service.AuthProviderSub2API}
	_, sessionKey, err := app.auth.UpsertSub2APISession(owner)
	if err != nil {
		t.Fatalf("UpsertSub2APISession() error = %v", err)
	}
	ownRel := "sub2api-own-delete.png"
	otherRel := "sub2api-other-delete.png"
	for _, rel := range []string{ownRel, otherRel} {
		if err := writeHTTPTestPNG(filepath.Join(app.config.ImagesDir(), filepath.FromSlash(rel))); err != nil {
			t.Fatalf("write test image %s: %v", rel, err)
		}
	}
	app.images.RecordGeneratedImages([]string{ownRel}, owner.ID, owner.Name, service.ImageVisibilityPrivate)
	app.images.RecordGeneratedImages([]string{otherRel}, "sub2api:456", "other-user", service.ImageVisibilityPrivate)

	req := httptest.NewRequest(http.MethodDelete, "/api/images", strings.NewReader(`{"paths":["`+ownRel+`","`+otherRel+`"]}`))
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("sub2api delete images status = %d body = %s", res.Code, res.Body.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
		t.Fatalf("sub2api delete images json: %v", err)
	}
	if payload["deleted"] != float64(1) || payload["missing"] != float64(1) {
		t.Fatalf("sub2api delete images body = %#v", payload)
	}
	if _, err := os.Stat(filepath.Join(app.config.ImagesDir(), filepath.FromSlash(ownRel))); !os.IsNotExist(err) {
		t.Fatalf("own image should be deleted by Sub2API user, stat error = %v", err)
	}
	if _, err := os.Stat(filepath.Join(app.config.ImagesDir(), filepath.FromSlash(otherRel))); err != nil {
		t.Fatalf("other image should not be deleted by Sub2API user, stat error = %v", err)
	}
}

func TestImageDownloadURLEndpointReturnsPresignedObjectURL(t *testing.T) {
	var uploadedPath string
	var uploadedBytes []byte
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPut:
			uploadedPath = r.URL.Path
			uploadedBytes, _ = io.ReadAll(r.Body)
			w.WriteHeader(http.StatusOK)
		case http.MethodGet:
			if r.URL.Path != uploadedPath {
				w.WriteHeader(http.StatusNotFound)
				return
			}
			w.Header().Set("Content-Type", "image/png")
			_, _ = w.Write(uploadedBytes)
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer server.Close()
	t.Setenv(imagestore.EnvImageStorageBackend, "cos")
	t.Setenv(imagestore.EnvImageObjectStorageEndpoint, server.URL)
	t.Setenv(imagestore.EnvImageObjectStorageRegion, "ap-guangzhou")
	t.Setenv(imagestore.EnvImageObjectStorageBucket, "bucket")
	t.Setenv(imagestore.EnvImageObjectStorageAccessKeyID, "ak")
	t.Setenv(imagestore.EnvImageObjectStorageSecretKey, "sk")
	t.Setenv(imagestore.EnvImageObjectStorageForcePath, "true")

	app := newTestApp(t)
	defer app.Close()

	var imageBuffer bytes.Buffer
	if err := encodeHTTPTestPNG(&imageBuffer); err != nil {
		t.Fatalf("encodeHTTPTestPNG() error = %v", err)
	}
	item, err := app.images.StoreUploadedImage("http://example.com", service.UploadedManagedImage{
		Filename:    "object-download.png",
		ContentType: "image/png",
		Data:        imageBuffer.Bytes(),
	}, "admin", "Admin", service.ImageVisibilityPrivate)
	if err != nil {
		t.Fatalf("StoreUploadedImage() error = %v", err)
	}
	rel, _ := item["path"].(string)
	if rel == "" {
		t.Fatalf("uploaded item = %#v", item)
	}
	if _, err := os.Stat(filepath.Join(app.config.ImagesDir(), filepath.FromSlash(rel))); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("local original stat error = %v, want os.ErrNotExist", err)
	}
	detail, err := app.images.ImageDetail("http://example.com", rel, service.ImageAccessScope{All: true})
	if err != nil {
		t.Fatalf("ImageDetail() error = %v", err)
	}
	if detail["object_key"] != nil || detail["object_url"] != nil || detail["storage_backend"] != nil {
		t.Fatalf("image detail exposed object storage fields = %#v", detail)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/images/download-url?path="+url.QueryEscape(rel), nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("download-url status = %d body = %s", res.Code, res.Body.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
		t.Fatalf("download-url json: %v", err)
	}
	downloadURL, _ := payload["download_url"].(string)
	if payload["direct"] != true || downloadURL == "" {
		t.Fatalf("download-url payload = %#v", payload)
	}
	if !strings.HasPrefix(downloadURL, server.URL+"/bucket/"+rel+"?") {
		t.Fatalf("download_url = %q", downloadURL)
	}
	for _, token := range []string{"X-Amz-Signature=", "X-Amz-Expires=", "response-content-disposition="} {
		if !strings.Contains(downloadURL, token) {
			t.Fatalf("download_url missing %s: %q", token, downloadURL)
		}
	}
	if payload["expires_at"] == "" {
		t.Fatalf("expires_at missing in %#v", payload)
	}
}

func TestSub2APIChatCreationTaskUsesGateway(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	var received map[string]any
	gateway := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/chat/completions" {
			t.Fatalf("gateway request = %s %s", r.Method, r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer sub2-key" {
			t.Fatalf("gateway Authorization = %q", got)
		}
		if err := json.NewDecoder(r.Body).Decode(&received); err != nil {
			t.Fatalf("gateway json: %v", err)
		}
		util.WriteJSON(w, http.StatusOK, map[string]any{
			"created": 123,
			"choices": []map[string]any{{
				"index":         0,
				"message":       map[string]any{"role": "assistant", "content": "sub2 reply"},
				"finish_reason": "stop",
			}},
		})
	}))
	defer gateway.Close()

	owner := service.AuthOwner{ID: "sub2api:chat-user", Name: "sub2api-chat", Provider: service.AuthProviderSub2API}
	_, sessionKey, err := app.auth.UpsertSub2APISession(owner)
	if err != nil {
		t.Fatalf("UpsertSub2APISession() error = %v", err)
	}
	if err := app.sub2Bindings.Save(service.Sub2APIBinding{
		OwnerID:        owner.ID,
		Sub2APIUserID:  "chat-user",
		SessionToken:   "session-chat-user",
		APIKey:         "sub2-key",
		GatewayBaseURL: gateway.URL,
	}); err != nil {
		t.Fatalf("Save(Sub2APIBinding) error = %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/creation-tasks/chat-completions", strings.NewReader(`{"client_task_id":"sub2-chat-task","prompt":"hello","model":"gpt-5","messages":[{"role":"user","content":"hello"}]}`))
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("submit sub2api chat task status = %d body = %s", res.Code, res.Body.String())
	}

	var listed map[string]any
	waitForHTTPTestCondition(t, func() bool {
		req = httptest.NewRequest(http.MethodGet, "/api/creation-tasks?ids=sub2-chat-task", nil)
		req.Header.Set("Authorization", "Bearer "+sessionKey)
		res = httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		if res.Code != http.StatusOK {
			t.Fatalf("list sub2api chat task status = %d body = %s", res.Code, res.Body.String())
		}
		if err := json.Unmarshal(res.Body.Bytes(), &listed); err != nil {
			t.Fatalf("list sub2api chat task json: %v", err)
		}
		items := util.AsMapSlice(listed["items"])
		return len(items) == 1 && items[0]["status"] == service.TaskStatusSuccess
	})

	if received["model"] != "gpt-5" || received["stream"] != false {
		t.Fatalf("gateway request body = %#v", received)
	}
	if messages := util.AsMapSlice(received["messages"]); len(messages) != 1 || messages[0]["role"] != "user" {
		t.Fatalf("gateway messages = %#v", received["messages"])
	}
	items := util.AsMapSlice(listed["items"])
	if len(items) != 1 {
		t.Fatalf("listed sub2api chat task = %#v", listed)
	}
	task := items[0]
	if task["output_type"] != "text" {
		t.Fatalf("sub2api chat output_type = %#v", task)
	}
	data := util.AsMapSlice(task["data"])
	if len(data) != 1 || data[0]["text_response"] != "sub2 reply" {
		t.Fatalf("sub2api chat task data = %#v", task)
	}
}

func TestSub2APIImageCreationTaskUsesOfficialFallbackAndPollsTask(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	var generationPayload map[string]any
	var imageBuf bytes.Buffer
	if err := encodeHTTPTestPNG(&imageBuf); err != nil {
		t.Fatalf("encodeHTTPTestPNG() error = %v", err)
	}
	imageBytes := imageBuf.Bytes()
	var gateway *httptest.Server
	gateway = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); r.URL.Path != "/files/image.png" && got != "Bearer sub2-key" {
			t.Fatalf("gateway Authorization = %q", got)
		}
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/images/generations":
			if err := json.NewDecoder(r.Body).Decode(&generationPayload); err != nil {
				t.Fatalf("gateway json: %v", err)
			}
			util.WriteJSON(w, http.StatusOK, map[string]any{
				"status":  "submitted",
				"task_id": "task-apimart",
			})
		case r.Method == http.MethodGet && r.URL.Path == "/v1/tasks/task-apimart" && r.URL.Query().Get("language") == "zh":
			util.WriteJSON(w, http.StatusOK, map[string]any{
				"status":    "completed",
				"created":   123,
				"completed": 124,
				"result": map[string]any{
					"images": []map[string]any{
						{"url": []any{gateway.URL + "/files/image.png"}},
					},
				},
			})
		case r.Method == http.MethodGet && r.URL.Path == "/files/image.png":
			w.Header().Set("Content-Type", "image/png")
			_, _ = w.Write(imageBytes)
		default:
			t.Fatalf("gateway request = %s %s", r.Method, r.URL.Path)
		}
	}))
	defer gateway.Close()

	owner := service.AuthOwner{ID: "sub2api:image-user", Name: "sub2api-image", Provider: service.AuthProviderSub2API}
	_, sessionKey, err := app.auth.UpsertSub2APISession(owner)
	if err != nil {
		t.Fatalf("UpsertSub2APISession() error = %v", err)
	}
	if err := app.sub2Bindings.Save(service.Sub2APIBinding{
		OwnerID:        owner.ID,
		Sub2APIUserID:  "image-user",
		SessionToken:   "session-image-user",
		APIKey:         "sub2-key",
		GatewayBaseURL: gateway.URL,
	}); err != nil {
		t.Fatalf("Save(Sub2APIBinding) error = %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/creation-tasks/image-generations", strings.NewReader(`{"client_task_id":"sub2-image-task","prompt":"draw","model":"gpt-image-2","size":"16:9","image_resolution":"2k","official_fallback":true}`))
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("submit sub2api image task status = %d body = %s", res.Code, res.Body.String())
	}

	var listed map[string]any
	waitForHTTPTestCondition(t, func() bool {
		req = httptest.NewRequest(http.MethodGet, "/api/creation-tasks?ids=sub2-image-task", nil)
		req.Header.Set("Authorization", "Bearer "+sessionKey)
		res = httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		if res.Code != http.StatusOK {
			t.Fatalf("list sub2api image task status = %d body = %s", res.Code, res.Body.String())
		}
		if err := json.Unmarshal(res.Body.Bytes(), &listed); err != nil {
			t.Fatalf("list sub2api image task json: %v", err)
		}
		items := util.AsMapSlice(listed["items"])
		return len(items) == 1 && items[0]["status"] == service.TaskStatusSuccess
	})

	if generationPayload["model"] != "gpt-image-2" || generationPayload["official_fallback"] != true || generationPayload["resolution"] != "2k" {
		t.Fatalf("gateway image request body = %#v", generationPayload)
	}
	items := util.AsMapSlice(listed["items"])
	data := util.AsMapSlice(items[0]["data"])
	if len(data) != 1 || util.Clean(data[0]["url"]) == "" {
		t.Fatalf("sub2api image task data = %#v", items[0])
	}
}

func TestSub2APITaskStatusCreditsCostBecomesExternalBillingCost(t *testing.T) {
	tests := []struct {
		name   string
		result map[string]any
		want   float64
	}{
		{
			name:   "top level credits cost field",
			result: map[string]any{"status": "completed", "credits_cost": 1.1055},
			want:   0.11055,
		},
		{
			name:   "top level cost with credits unit",
			result: map[string]any{"status": "completed", "cost": 0.86816, "unit": "credits"},
			want:   0.086816,
		},
		{
			name: "nested billing price with credits amount unit",
			result: map[string]any{
				"status": "completed",
				"data": map[string]any{
					"billing": map[string]any{
						"price":       "0.86816",
						"amount_unit": "credits",
					},
				},
			},
			want: 0.086816,
		},
		{
			name:   "plain cost remains apimart usd cost",
			result: map[string]any{"status": "completed", "cost": 0.086816},
			want:   0.086816,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			cost, ok := sub2APITaskCost(tc.result)
			if !ok || cost < tc.want-1e-12 || cost > tc.want+1e-12 {
				t.Fatalf("sub2APITaskCost() = %.12f ok=%v, want %.12f true", cost, ok, tc.want)
			}
		})
	}
}

func TestSub2APIOfficialImageEditTaskUsesJSONGatewayPayload(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	var received map[string]any
	gateway := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/images/generations" {
			t.Fatalf("gateway request = %s %s", r.Method, r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer sub2-key" {
			t.Fatalf("gateway Authorization = %q", got)
		}
		if !strings.Contains(r.Header.Get("Content-Type"), "application/json") {
			t.Fatalf("gateway Content-Type = %q, want JSON", r.Header.Get("Content-Type"))
		}
		if err := json.NewDecoder(r.Body).Decode(&received); err != nil {
			t.Fatalf("gateway json: %v", err)
		}
		util.WriteJSON(w, http.StatusOK, map[string]any{
			"created": 123,
			"data": []map[string]any{{
				"b64_json": sub2APITestPNGBase64,
			}},
		})
	}))
	defer gateway.Close()

	owner := service.AuthOwner{ID: "sub2api:official-edit-user", Name: "official-edit", Provider: service.AuthProviderSub2API}
	_, sessionKey, err := app.auth.UpsertSub2APISession(owner)
	if err != nil {
		t.Fatalf("UpsertSub2APISession() error = %v", err)
	}
	if err := app.sub2Bindings.Save(service.Sub2APIBinding{
		OwnerID:        owner.ID,
		Sub2APIUserID:  "official-edit-user",
		SessionToken:   "session-official-edit-user",
		APIKey:         "sub2-key",
		GatewayBaseURL: gateway.URL,
	}); err != nil {
		t.Fatalf("Save(Sub2APIBinding) error = %v", err)
	}

	body := jsonString(map[string]any{
		"client_task_id":     "sub2-official-edit-task",
		"prompt":             "edit image",
		"model":              util.ImageModelGPTOfficial,
		"image_url":          "https://cdn.example/source.png",
		"input_image_mask":   "https://cdn.example/mask.png",
		"size":               "16:9",
		"image_resolution":   "2k",
		"output_format":      "webp",
		"output_compression": 101,
	})
	req := httptest.NewRequest(http.MethodPost, "/api/creation-tasks/image-edits", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("submit official edit task status = %d body = %s", res.Code, res.Body.String())
	}

	var listed map[string]any
	waitForHTTPTestCondition(t, func() bool {
		req = httptest.NewRequest(http.MethodGet, "/api/creation-tasks?ids=sub2-official-edit-task", nil)
		req.Header.Set("Authorization", "Bearer "+sessionKey)
		res = httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		if res.Code != http.StatusOK {
			t.Fatalf("list official edit task status = %d body = %s", res.Code, res.Body.String())
		}
		if err := json.Unmarshal(res.Body.Bytes(), &listed); err != nil {
			t.Fatalf("list official edit task json: %v", err)
		}
		items := util.AsMapSlice(listed["items"])
		return len(items) == 1 && items[0]["status"] == service.TaskStatusSuccess
	})

	if received["model"] != util.ImageModelGPTOfficial || received["size"] != "16:9" || received["resolution"] != "2k" {
		t.Fatalf("official edit gateway body = %#v", received)
	}
	urls := util.AsStringSlice(received["image_urls"])
	if len(urls) != 1 || urls[0] != "https://cdn.example/source.png" {
		t.Fatalf("official edit image_urls = %#v", received["image_urls"])
	}
	if received["mask_url"] != "https://cdn.example/mask.png" {
		t.Fatalf("official edit mask_url = %#v", received["mask_url"])
	}
	if received["output_format"] != "webp" || received["output_compression"] != float64(100) {
		t.Fatalf("official edit output options = %#v", received)
	}
}

func TestSub2APIGPTImageEditUsesMultipartForMixedReferences(t *testing.T) {
	var multipartFields map[string]string
	var multipartImages [][]byte
	gateway := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/images/edits" {
			t.Fatalf("gateway request = %s %s", r.Method, r.URL.Path)
		}
		if !strings.Contains(r.Header.Get("Content-Type"), "multipart/form-data") {
			t.Fatalf("gateway Content-Type = %q, want multipart", r.Header.Get("Content-Type"))
		}
		if err := r.ParseMultipartForm(8 << 20); err != nil {
			t.Fatalf("gateway multipart: %v", err)
		}
		multipartFields = map[string]string{}
		for key, values := range r.MultipartForm.Value {
			if len(values) > 0 {
				multipartFields[key] = values[0]
			}
		}
		files := r.MultipartForm.File["image"]
		if len(files) != 1 {
			t.Fatalf("gateway image files = %d", len(files))
		}
		for _, header := range files {
			file, err := header.Open()
			if err != nil {
				t.Fatalf("open gateway image: %v", err)
			}
			data, err := io.ReadAll(file)
			_ = file.Close()
			if err != nil {
				t.Fatalf("read gateway image: %v", err)
			}
			multipartImages = append(multipartImages, data)
		}
		util.WriteJSON(w, http.StatusOK, map[string]any{
			"created": 123,
			"data":    []map[string]any{{"b64_json": sub2APITestPNGBase64}},
		})
	}))
	defer gateway.Close()

	app := &App{engine: &protocol.Engine{Config: testSub2APIImageConfig{root: t.TempDir()}}}
	referenceBytes := []byte("private-json-reference")
	result, err := app.callSub2APIImageEdits(context.Background(), service.Identity{}, map[string]any{
		"prompt":                     "edit image",
		"model":                      util.ImageModelGPT,
		"official_public_image_urls": []string{"https://cdn.example/source.png"},
		"images": []protocol.UploadedImage{{
			Filename:    "reference.png",
			ContentType: "image/png",
			Data:        referenceBytes,
		}},
		"size":             "16:9",
		"image_resolution": "2k",
	}, service.Sub2APIBinding{
		APIKey:         "sub2-key",
		GatewayBaseURL: gateway.URL,
	})
	if err != nil {
		t.Fatalf("callSub2APIImageEdits() error = %v", err)
	}
	if data := util.AsMapSlice(result["data"]); len(data) != 1 {
		t.Fatalf("mixed gpt image result data = %#v", result["data"])
	}

	if multipartFields["model"] != util.ImageModelGPT || multipartFields["size"] != "1536x864" || multipartFields["resolution"] != "2k" {
		t.Fatalf("gpt image mixed multipart fields = %#v", multipartFields)
	}
	if _, ok := multipartFields["image_urls"]; ok {
		t.Fatalf("gpt image mixed multipart should not forward image_urls: %#v", multipartFields)
	}
	if len(multipartImages) != 1 || string(multipartImages[0]) != string(referenceBytes) {
		t.Fatalf("gpt image mixed multipart images = %#v", multipartImages)
	}
}

func TestSub2APIGPTImageEditTaskKeepsMultipartTempReference(t *testing.T) {
	var objectPutPath string
	objectServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPut:
			objectPutPath = r.URL.Path
			_, _ = io.Copy(io.Discard, r.Body)
			w.WriteHeader(http.StatusOK)
		case http.MethodGet:
			if r.URL.Path != objectPutPath {
				t.Errorf("object GET path = %q, want %q", r.URL.Path, objectPutPath)
			}
			w.Header().Set("Content-Type", "image/png")
			_, _ = w.Write([]byte("reference"))
		default:
			t.Errorf("object method = %s", r.Method)
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	}))
	defer objectServer.Close()
	t.Setenv(imagestore.EnvImageStorageBackend, "cos")
	t.Setenv(imagestore.EnvImageObjectStorageEndpoint, objectServer.URL)
	t.Setenv(imagestore.EnvImageObjectStorageRegion, "ap-guangzhou")
	t.Setenv(imagestore.EnvImageObjectStorageBucket, "bucket")
	t.Setenv(imagestore.EnvImageObjectStorageAccessKeyID, "ak")
	t.Setenv(imagestore.EnvImageObjectStorageSecretKey, "sk")
	t.Setenv(imagestore.EnvImageObjectStorageForcePath, "true")

	app := newTestApp(t)
	defer app.Close()

	var multipartFields map[string]string
	var multipartImage []byte
	gateway := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/images/edits" {
			t.Fatalf("gateway request = %s %s", r.Method, r.URL.Path)
		}
		if !strings.Contains(r.Header.Get("Content-Type"), "multipart/form-data") {
			t.Fatalf("gateway Content-Type = %q, want multipart", r.Header.Get("Content-Type"))
		}
		if err := r.ParseMultipartForm(8 << 20); err != nil {
			t.Fatalf("gateway multipart: %v", err)
		}
		multipartFields = map[string]string{}
		for key, values := range r.MultipartForm.Value {
			if len(values) > 0 {
				multipartFields[key] = values[0]
			}
		}
		files := r.MultipartForm.File["image"]
		if len(files) != 1 {
			t.Fatalf("gateway image files = %d", len(files))
		}
		file, err := files[0].Open()
		if err != nil {
			t.Fatalf("open gateway image: %v", err)
		}
		defer file.Close()
		multipartImage, err = io.ReadAll(file)
		if err != nil {
			t.Fatalf("read gateway image: %v", err)
		}
		util.WriteJSON(w, http.StatusOK, map[string]any{
			"created": 123,
			"data":    []map[string]any{{"b64_json": sub2APITestPNGBase64}},
		})
	}))
	defer gateway.Close()

	owner := service.AuthOwner{ID: "sub2api:gpt-image-signed-ref-user", Name: "gpt-image-signed-ref", Provider: service.AuthProviderSub2API}
	_, sessionKey, err := app.auth.UpsertSub2APISession(owner)
	if err != nil {
		t.Fatalf("UpsertSub2APISession() error = %v", err)
	}
	if err := app.sub2Bindings.Save(service.Sub2APIBinding{
		OwnerID:        owner.ID,
		Sub2APIUserID:  "gpt-image-signed-ref-user",
		SessionToken:   "session-gpt-image-signed-ref-user",
		APIKey:         "sub2-key",
		GatewayBaseURL: gateway.URL,
	}); err != nil {
		t.Fatalf("Save(Sub2APIBinding) error = %v", err)
	}
	referenceBytes, err := base64.StdEncoding.DecodeString(sub2APITestPNGBase64)
	if err != nil {
		t.Fatalf("decode reference png: %v", err)
	}
	ref, err := app.images.StoreTempReferenceImage(service.UploadedTempReferenceImage{
		ClientReferenceID: "client-gpt-signed-ref-1",
		Filename:          "source.png",
		ContentType:       "image/png",
		Data:              referenceBytes,
	}, owner.ID)
	if err != nil {
		t.Fatalf("StoreTempReferenceImage() error = %v", err)
	}
	if ref.ObjectKey == "" {
		t.Fatalf("temp reference missing object key: %#v", ref)
	}

	body := jsonString(map[string]any{
		"client_task_id":      "sub2-gpt-image-signed-ref-task",
		"prompt":              "keep the product, change background",
		"model":               util.ImageModelGPT,
		"reference_image_ids": []string{ref.ID},
		"size":                "16:9",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/creation-tasks/image-edits", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("submit gpt image edit task status = %d body = %s", res.Code, res.Body.String())
	}

	var listed map[string]any
	waitForHTTPTestCondition(t, func() bool {
		req = httptest.NewRequest(http.MethodGet, "/api/creation-tasks?ids=sub2-gpt-image-signed-ref-task", nil)
		req.Header.Set("Authorization", "Bearer "+sessionKey)
		res = httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		if res.Code != http.StatusOK {
			t.Fatalf("list gpt image edit task status = %d body = %s", res.Code, res.Body.String())
		}
		if err := json.Unmarshal(res.Body.Bytes(), &listed); err != nil {
			t.Fatalf("list gpt image edit task json: %v", err)
		}
		items := util.AsMapSlice(listed["items"])
		return len(items) == 1 && items[0]["status"] == service.TaskStatusSuccess
	})

	if multipartFields["model"] != util.ImageModelGPT || multipartFields["size"] != "1536x864" {
		t.Fatalf("gpt image gateway multipart fields = %#v", multipartFields)
	}
	if len(multipartImage) == 0 {
		t.Fatalf("gateway multipart image is empty")
	}
}

func TestSub2APIGPTImageEditTaskConvertsJSONURLToMultipartReference(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	var multipartFields map[string]string
	var multipartImage []byte
	gateway := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/images/edits" {
			t.Fatalf("gateway request = %s %s", r.Method, r.URL.Path)
		}
		if !strings.Contains(r.Header.Get("Content-Type"), "multipart/form-data") {
			t.Fatalf("gateway Content-Type = %q, want multipart", r.Header.Get("Content-Type"))
		}
		if err := r.ParseMultipartForm(8 << 20); err != nil {
			t.Fatalf("gateway multipart: %v", err)
		}
		multipartFields = map[string]string{}
		for key, values := range r.MultipartForm.Value {
			if len(values) > 0 {
				multipartFields[key] = values[0]
			}
		}
		files := r.MultipartForm.File["image"]
		if len(files) != 1 {
			t.Fatalf("gateway image files = %d", len(files))
		}
		file, err := files[0].Open()
		if err != nil {
			t.Fatalf("open gateway image: %v", err)
		}
		defer file.Close()
		multipartImage, err = io.ReadAll(file)
		if err != nil {
			t.Fatalf("read gateway image: %v", err)
		}
		util.WriteJSON(w, http.StatusOK, map[string]any{
			"created": 123,
			"data":    []map[string]any{{"b64_json": sub2APITestPNGBase64}},
		})
	}))
	defer gateway.Close()

	owner := service.AuthOwner{ID: "sub2api:gpt-image-json-ref-user", Name: "gpt-image-json-ref", Provider: service.AuthProviderSub2API}
	_, sessionKey, err := app.auth.UpsertSub2APISession(owner)
	if err != nil {
		t.Fatalf("UpsertSub2APISession() error = %v", err)
	}
	if err := app.sub2Bindings.Save(service.Sub2APIBinding{
		OwnerID:        owner.ID,
		Sub2APIUserID:  "gpt-image-json-ref-user",
		SessionToken:   "session-gpt-image-json-ref-user",
		APIKey:         "sub2-key",
		GatewayBaseURL: gateway.URL,
	}); err != nil {
		t.Fatalf("Save(Sub2APIBinding) error = %v", err)
	}

	referenceBytes := []byte("json-reference-bytes")
	body := jsonString(map[string]any{
		"client_task_id": "sub2-gpt-image-json-ref-task",
		"prompt":         "keep the product, change background",
		"model":          util.ImageModelGPT,
		"image_urls":     []string{"data:image/png;base64," + base64.StdEncoding.EncodeToString(referenceBytes)},
		"size":           "16:9",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/creation-tasks/image-edits", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("submit gpt image edit task status = %d body = %s", res.Code, res.Body.String())
	}

	waitForHTTPTestCondition(t, func() bool {
		req = httptest.NewRequest(http.MethodGet, "/api/creation-tasks?ids=sub2-gpt-image-json-ref-task", nil)
		req.Header.Set("Authorization", "Bearer "+sessionKey)
		res = httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		if res.Code != http.StatusOK {
			t.Fatalf("list gpt image edit task status = %d body = %s", res.Code, res.Body.String())
		}
		var listed map[string]any
		if err := json.Unmarshal(res.Body.Bytes(), &listed); err != nil {
			t.Fatalf("list gpt image edit task json: %v", err)
		}
		items := util.AsMapSlice(listed["items"])
		return len(items) == 1 && items[0]["status"] == service.TaskStatusSuccess
	})

	if multipartFields["model"] != util.ImageModelGPT || multipartFields["size"] != "1536x864" {
		t.Fatalf("gpt image gateway multipart fields = %#v", multipartFields)
	}
	if _, ok := multipartFields["image_urls"]; ok {
		t.Fatalf("gpt image multipart should not forward image_urls: %#v", multipartFields)
	}
	if string(multipartImage) != string(referenceBytes) {
		t.Fatalf("gateway multipart image = %q", string(multipartImage))
	}
}

func TestSub2APIOfficialImageEditTaskUsesSignedTempReferenceURL(t *testing.T) {
	var objectPutPath string
	objectServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPut:
			objectPutPath = r.URL.Path
			_, _ = io.Copy(io.Discard, r.Body)
			w.WriteHeader(http.StatusOK)
		case http.MethodGet:
			if r.URL.Path != objectPutPath {
				t.Errorf("object GET path = %q, want %q", r.URL.Path, objectPutPath)
			}
			w.Header().Set("Content-Type", "image/png")
			_, _ = w.Write([]byte("reference"))
		default:
			t.Errorf("object method = %s", r.Method)
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	}))
	defer objectServer.Close()
	t.Setenv(imagestore.EnvImageStorageBackend, "cos")
	t.Setenv(imagestore.EnvImageObjectStorageEndpoint, objectServer.URL)
	t.Setenv(imagestore.EnvImageObjectStorageRegion, "ap-guangzhou")
	t.Setenv(imagestore.EnvImageObjectStorageBucket, "bucket")
	t.Setenv(imagestore.EnvImageObjectStorageAccessKeyID, "ak")
	t.Setenv(imagestore.EnvImageObjectStorageSecretKey, "sk")
	t.Setenv(imagestore.EnvImageObjectStorageForcePath, "true")

	app := newTestApp(t)
	defer app.Close()

	var received map[string]any
	gateway := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/images/generations" {
			t.Fatalf("gateway request = %s %s", r.Method, r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer sub2-key" {
			t.Fatalf("gateway Authorization = %q", got)
		}
		if !strings.Contains(r.Header.Get("Content-Type"), "application/json") {
			t.Fatalf("gateway Content-Type = %q, want JSON", r.Header.Get("Content-Type"))
		}
		if err := json.NewDecoder(r.Body).Decode(&received); err != nil {
			t.Fatalf("gateway json: %v", err)
		}
		util.WriteJSON(w, http.StatusOK, map[string]any{
			"created": 123,
			"data":    []map[string]any{{"b64_json": sub2APITestPNGBase64}},
		})
	}))
	defer gateway.Close()

	owner := service.AuthOwner{ID: "sub2api:official-signed-ref-user", Name: "official-signed-ref", Provider: service.AuthProviderSub2API}
	_, sessionKey, err := app.auth.UpsertSub2APISession(owner)
	if err != nil {
		t.Fatalf("UpsertSub2APISession() error = %v", err)
	}
	if err := app.sub2Bindings.Save(service.Sub2APIBinding{
		OwnerID:        owner.ID,
		Sub2APIUserID:  "official-signed-ref-user",
		SessionToken:   "session-official-signed-ref-user",
		APIKey:         "sub2-key",
		GatewayBaseURL: gateway.URL,
	}); err != nil {
		t.Fatalf("Save(Sub2APIBinding) error = %v", err)
	}
	referenceBytes, err := base64.StdEncoding.DecodeString(sub2APITestPNGBase64)
	if err != nil {
		t.Fatalf("decode reference png: %v", err)
	}
	ref, err := app.images.StoreTempReferenceImage(service.UploadedTempReferenceImage{
		ClientReferenceID: "client-official-signed-ref-1",
		Filename:          "source.png",
		ContentType:       "image/png",
		Data:              referenceBytes,
	}, owner.ID)
	if err != nil {
		t.Fatalf("StoreTempReferenceImage() error = %v", err)
	}
	if ref.ObjectKey == "" {
		t.Fatalf("temp reference missing object key: %#v", ref)
	}

	body := jsonString(map[string]any{
		"client_task_id":      "sub2-official-signed-ref-task",
		"prompt":              "edit image",
		"model":               util.ImageModelGPTOfficial,
		"reference_image_ids": []string{ref.ID},
		"size":                "16:9",
		"image_resolution":    "2k",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/creation-tasks/image-edits", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("submit official signed ref edit task status = %d body = %s", res.Code, res.Body.String())
	}

	var listed map[string]any
	waitForHTTPTestCondition(t, func() bool {
		req = httptest.NewRequest(http.MethodGet, "/api/creation-tasks?ids=sub2-official-signed-ref-task", nil)
		req.Header.Set("Authorization", "Bearer "+sessionKey)
		res = httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		if res.Code != http.StatusOK {
			t.Fatalf("list official signed ref edit task status = %d body = %s", res.Code, res.Body.String())
		}
		if err := json.Unmarshal(res.Body.Bytes(), &listed); err != nil {
			t.Fatalf("list official signed ref edit task json: %v", err)
		}
		items := util.AsMapSlice(listed["items"])
		return len(items) == 1 && items[0]["status"] == service.TaskStatusSuccess
	})

	if received["model"] != util.ImageModelGPTOfficial || received["size"] != "16:9" || received["resolution"] != "2k" {
		t.Fatalf("official signed ref gateway body = %#v", received)
	}
	urls := util.AsStringSlice(received["image_urls"])
	if len(urls) != 1 {
		t.Fatalf("official signed ref image_urls = %#v", received["image_urls"])
	}
	if strings.HasPrefix(urls[0], "data:") {
		t.Fatalf("official signed ref image_urls should not contain data URL: %#v", urls)
	}
	parsed, err := url.Parse(urls[0])
	if err != nil {
		t.Fatalf("parse signed reference URL: %v", err)
	}
	if parsed.Host == "" || parsed.Query().Get("X-Amz-Signature") == "" || !strings.Contains(parsed.Path, "/temp-references/") {
		t.Fatalf("signed reference URL = %q", urls[0])
	}
	if rawImages := util.AsMapSlice(received["images"]); len(rawImages) > 0 {
		t.Fatalf("gateway body should not include uploaded images: %#v", received["images"])
	}
}

func TestSub2APIOfficialImageEditTaskUploadsMultipartReferenceToObjectURL(t *testing.T) {
	var objectPutPath string
	objectServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPut:
			objectPutPath = r.URL.Path
			_, _ = io.Copy(io.Discard, r.Body)
			w.WriteHeader(http.StatusOK)
		case http.MethodGet:
			if r.URL.Path != objectPutPath {
				t.Errorf("object GET path = %q, want %q", r.URL.Path, objectPutPath)
			}
			w.Header().Set("Content-Type", "image/png")
			_, _ = w.Write([]byte("reference"))
		default:
			t.Errorf("object method = %s", r.Method)
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	}))
	defer objectServer.Close()
	t.Setenv(imagestore.EnvImageStorageBackend, "cos")
	t.Setenv(imagestore.EnvImageObjectStorageEndpoint, objectServer.URL)
	t.Setenv(imagestore.EnvImageObjectStorageRegion, "ap-guangzhou")
	t.Setenv(imagestore.EnvImageObjectStorageBucket, "bucket")
	t.Setenv(imagestore.EnvImageObjectStorageAccessKeyID, "ak")
	t.Setenv(imagestore.EnvImageObjectStorageSecretKey, "sk")
	t.Setenv(imagestore.EnvImageObjectStorageForcePath, "true")

	app := newTestApp(t)
	defer app.Close()

	var received map[string]any
	gateway := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/images/generations" {
			t.Fatalf("gateway request = %s %s", r.Method, r.URL.Path)
		}
		if !strings.Contains(r.Header.Get("Content-Type"), "application/json") {
			t.Fatalf("gateway Content-Type = %q, want JSON", r.Header.Get("Content-Type"))
		}
		if err := json.NewDecoder(r.Body).Decode(&received); err != nil {
			t.Fatalf("gateway json: %v", err)
		}
		util.WriteJSON(w, http.StatusOK, map[string]any{
			"created": 123,
			"data":    []map[string]any{{"b64_json": sub2APITestPNGBase64}},
		})
	}))
	defer gateway.Close()

	owner := service.AuthOwner{ID: "sub2api:official-uploaded-ref-user", Name: "official-uploaded-ref", Provider: service.AuthProviderSub2API}
	_, sessionKey, err := app.auth.UpsertSub2APISession(owner)
	if err != nil {
		t.Fatalf("UpsertSub2APISession() error = %v", err)
	}
	if err := app.sub2Bindings.Save(service.Sub2APIBinding{
		OwnerID:        owner.ID,
		Sub2APIUserID:  "official-uploaded-ref-user",
		SessionToken:   "session-official-uploaded-ref-user",
		APIKey:         "sub2-key",
		GatewayBaseURL: gateway.URL,
	}); err != nil {
		t.Fatalf("Save(Sub2APIBinding) error = %v", err)
	}

	referenceBytes, err := base64.StdEncoding.DecodeString(sub2APITestPNGBase64)
	if err != nil {
		t.Fatalf("decode reference png: %v", err)
	}
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	_ = writer.WriteField("client_task_id", "sub2-official-uploaded-ref-task")
	_ = writer.WriteField("prompt", "edit image")
	_ = writer.WriteField("model", util.ImageModelGPTOfficial)
	_ = writer.WriteField("size", "16:9")
	_ = writer.WriteField("image_resolution", "2k")
	part, err := writer.CreateFormFile("image", "source.png")
	if err != nil {
		t.Fatalf("CreateFormFile() error = %v", err)
	}
	_, _ = part.Write(referenceBytes)
	if err := writer.Close(); err != nil {
		t.Fatalf("close multipart writer: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/creation-tasks/image-edits", &body)
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("submit official uploaded ref edit task status = %d body = %s", res.Code, res.Body.String())
	}

	var listed map[string]any
	waitForHTTPTestCondition(t, func() bool {
		req = httptest.NewRequest(http.MethodGet, "/api/creation-tasks?ids=sub2-official-uploaded-ref-task", nil)
		req.Header.Set("Authorization", "Bearer "+sessionKey)
		res = httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		if res.Code != http.StatusOK {
			t.Fatalf("list official uploaded ref edit task status = %d body = %s", res.Code, res.Body.String())
		}
		if err := json.Unmarshal(res.Body.Bytes(), &listed); err != nil {
			t.Fatalf("list official uploaded ref edit task json: %v", err)
		}
		items := util.AsMapSlice(listed["items"])
		return len(items) == 1 && items[0]["status"] == service.TaskStatusSuccess
	})

	if received["model"] != util.ImageModelGPTOfficial || received["size"] != "16:9" || received["resolution"] != "2k" {
		t.Fatalf("official uploaded ref gateway body = %#v", received)
	}
	urls := util.AsStringSlice(received["image_urls"])
	if len(urls) != 1 {
		t.Fatalf("official uploaded ref image_urls = %#v", received["image_urls"])
	}
	parsed, err := url.Parse(urls[0])
	if err != nil {
		t.Fatalf("parse uploaded ref signed URL: %v", err)
	}
	if parsed.Host == "" || parsed.Query().Get("X-Amz-Signature") == "" || !strings.Contains(parsed.Path, "/official-references/") {
		t.Fatalf("uploaded ref signed URL = %q", urls[0])
	}
	if rawImages := util.AsMapSlice(received["images"]); len(rawImages) > 0 {
		t.Fatalf("gateway body should not include uploaded images: %#v", received["images"])
	}
}

func TestSub2APIGeminiImageEditTaskUsesDataURIReferences(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	var received map[string]any
	gateway := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/images/generations" {
			t.Fatalf("gateway request = %s %s", r.Method, r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer sub2-key" {
			t.Fatalf("gateway Authorization = %q", got)
		}
		if !strings.Contains(r.Header.Get("Content-Type"), "application/json") {
			t.Fatalf("gateway Content-Type = %q, want JSON", r.Header.Get("Content-Type"))
		}
		if err := json.NewDecoder(r.Body).Decode(&received); err != nil {
			t.Fatalf("gateway json: %v", err)
		}
		util.WriteJSON(w, http.StatusOK, map[string]any{
			"created": 123,
			"data": []map[string]any{
				{"b64_json": sub2APITestPNGBase64},
			},
		})
	}))
	defer gateway.Close()

	owner := service.AuthOwner{ID: "sub2api:gemini-edit-user", Name: "gemini-edit", Provider: service.AuthProviderSub2API}
	_, sessionKey, err := app.auth.UpsertSub2APISession(owner)
	if err != nil {
		t.Fatalf("UpsertSub2APISession() error = %v", err)
	}
	if err := app.sub2Bindings.Save(service.Sub2APIBinding{
		OwnerID:        owner.ID,
		Sub2APIUserID:  "gemini-edit-user",
		SessionToken:   "session-gemini-edit-user",
		APIKey:         "sub2-key",
		GatewayBaseURL: gateway.URL,
	}); err != nil {
		t.Fatalf("Save(Sub2APIBinding) error = %v", err)
	}
	referenceBytes, err := base64.StdEncoding.DecodeString(sub2APITestPNGBase64)
	if err != nil {
		t.Fatalf("decode reference png: %v", err)
	}
	ref, err := app.images.StoreTempReferenceImage(service.UploadedTempReferenceImage{
		ClientReferenceID: "client-ref-1",
		Filename:          "source.png",
		ContentType:       "image/png",
		Data:              referenceBytes,
	}, owner.ID)
	if err != nil {
		t.Fatalf("StoreTempReferenceImage() error = %v", err)
	}

	body := jsonString(map[string]any{
		"client_task_id":      "sub2-gemini-edit-task",
		"prompt":              "keep the product, change background",
		"model":               util.ImageModelGeminiFlashPreview,
		"reference_image_ids": []string{ref.ID},
		"image_resolution":    "2K",
		"n":                   2,
	})
	req := httptest.NewRequest(http.MethodPost, "/api/creation-tasks/image-edits", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("submit gemini edit task status = %d body = %s", res.Code, res.Body.String())
	}

	waitForHTTPTestCondition(t, func() bool {
		req = httptest.NewRequest(http.MethodGet, "/api/creation-tasks?ids=sub2-gemini-edit-task", nil)
		req.Header.Set("Authorization", "Bearer "+sessionKey)
		res = httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		if res.Code != http.StatusOK {
			t.Fatalf("list gemini edit task status = %d body = %s", res.Code, res.Body.String())
		}
		var listed map[string]any
		if err := json.Unmarshal(res.Body.Bytes(), &listed); err != nil {
			t.Fatalf("list gemini edit task json: %v", err)
		}
		items := util.AsMapSlice(listed["items"])
		return len(items) == 1 && items[0]["status"] == service.TaskStatusSuccess
	})

	if received["model"] != util.ImageModelGeminiFlashPreview || received["resolution"] != "2K" || received["n"] != float64(2) {
		t.Fatalf("gemini edit gateway body = %#v", received)
	}
	urls := util.AsStringSlice(received["image_urls"])
	if len(urls) != 1 || !strings.HasPrefix(urls[0], "data:image/png;base64,") {
		t.Fatalf("gemini edit image_urls = %#v", received["image_urls"])
	}
	if _, ok := received["quality"]; ok {
		t.Fatalf("gemini edit should omit unsupported quality: %#v", received)
	}
}

func TestSub2APIOfficialImageEditTaskRejectsTempReferenceIDs(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	gateway := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatalf("gateway should not be called for private official references: %s %s", r.Method, r.URL.Path)
	}))
	defer gateway.Close()

	owner := service.AuthOwner{ID: "sub2api:official-private-user", Name: "official-private", Provider: service.AuthProviderSub2API}
	_, sessionKey, err := app.auth.UpsertSub2APISession(owner)
	if err != nil {
		t.Fatalf("UpsertSub2APISession() error = %v", err)
	}
	if err := app.sub2Bindings.Save(service.Sub2APIBinding{
		OwnerID:        owner.ID,
		Sub2APIUserID:  "official-private-user",
		SessionToken:   "session-official-private-user",
		APIKey:         "sub2-key",
		GatewayBaseURL: gateway.URL,
	}); err != nil {
		t.Fatalf("Save(Sub2APIBinding) error = %v", err)
	}

	var png bytes.Buffer
	if err := encodeHTTPTestPNG(&png); err != nil {
		t.Fatalf("encode reference png: %v", err)
	}
	uploadReq := httptest.NewRequest(http.MethodPost, "/api/creation-tasks/reference-images", nil)
	var uploadBody bytes.Buffer
	writer := multipart.NewWriter(&uploadBody)
	_ = writer.WriteField("client_reference_id", "private-reference")
	part, err := writer.CreateFormFile("image", "reference.png")
	if err != nil {
		t.Fatalf("CreateFormFile() error = %v", err)
	}
	_, _ = part.Write(png.Bytes())
	if err := writer.Close(); err != nil {
		t.Fatalf("close multipart writer: %v", err)
	}
	uploadReq.Body = io.NopCloser(&uploadBody)
	uploadReq.Header.Set("Authorization", "Bearer "+sessionKey)
	uploadReq.Header.Set("Content-Type", writer.FormDataContentType())
	uploadRes := httptest.NewRecorder()
	app.Handler().ServeHTTP(uploadRes, uploadReq)
	if uploadRes.Code != http.StatusOK {
		t.Fatalf("upload reference status = %d body = %s", uploadRes.Code, uploadRes.Body.String())
	}
	var uploadPayload map[string]any
	if err := json.Unmarshal(uploadRes.Body.Bytes(), &uploadPayload); err != nil {
		t.Fatalf("upload reference json: %v", err)
	}
	refID := util.Clean(util.StringMap(uploadPayload["item"])["id"])
	if refID == "" {
		t.Fatalf("reference upload missing id: %#v", uploadPayload)
	}

	body := jsonString(map[string]any{
		"client_task_id":      "sub2-official-private-reference",
		"prompt":              "edit image",
		"model":               util.ImageModelGPTOfficial,
		"reference_image_ids": []string{refID},
	})
	req := httptest.NewRequest(http.MethodPost, "/api/creation-tasks/image-edits", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("submit private official edit task status = %d body = %s", res.Code, res.Body.String())
	}

	var listed map[string]any
	waitForHTTPTestCondition(t, func() bool {
		req = httptest.NewRequest(http.MethodGet, "/api/creation-tasks?ids=sub2-official-private-reference", nil)
		req.Header.Set("Authorization", "Bearer "+sessionKey)
		res = httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		if res.Code != http.StatusOK {
			t.Fatalf("list private official edit task status = %d body = %s", res.Code, res.Body.String())
		}
		if err := json.Unmarshal(res.Body.Bytes(), &listed); err != nil {
			t.Fatalf("list private official edit task json: %v", err)
		}
		items := util.AsMapSlice(listed["items"])
		return len(items) == 1 && items[0]["status"] == service.TaskStatusError
	})
	items := util.AsMapSlice(listed["items"])
	message := util.Clean(items[0]["error"])
	if !strings.Contains(message, "官方图生图需要可公开访问的参考图链接") {
		t.Fatalf("task error = %q", message)
	}
	if strings.Contains(strings.ToLower(message), "apimart") {
		t.Fatalf("task error should not expose upstream brand: %q", message)
	}
}

func TestSub2APIVideoCreationTaskUsesApimartTasksEndpoint(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	var generationPayload map[string]any
	var taskPolls int
	gateway := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer sub2-key" {
			t.Fatalf("gateway Authorization = %q", got)
		}
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/videos/generations":
			if err := json.NewDecoder(r.Body).Decode(&generationPayload); err != nil {
				t.Fatalf("gateway json: %v", err)
			}
			util.WriteJSON(w, http.StatusOK, map[string]any{
				"status":  "submitted",
				"task_id": "task-video-apimart",
			})
		case r.Method == http.MethodGet && r.URL.Path == "/v1/tasks/task-video-apimart" && r.URL.Query().Get("language") == "zh":
			taskPolls++
			util.WriteJSON(w, http.StatusOK, map[string]any{
				"status": "completed",
				"result": map[string]any{
					"videos": []map[string]any{
						{"url": "https://cdn.example/video.mp4"},
					},
				},
			})
		default:
			t.Fatalf("gateway request = %s %s", r.Method, r.URL.String())
		}
	}))
	defer gateway.Close()

	owner := service.AuthOwner{ID: "sub2api:video-user", Name: "sub2api-video", Provider: service.AuthProviderSub2API}
	_, sessionKey, err := app.auth.UpsertSub2APISession(owner)
	if err != nil {
		t.Fatalf("UpsertSub2APISession() error = %v", err)
	}
	if err := app.sub2Bindings.Save(service.Sub2APIBinding{
		OwnerID:        owner.ID,
		Sub2APIUserID:  "video-user",
		SessionToken:   "session-video-user",
		APIKey:         "sub2-key",
		GatewayBaseURL: gateway.URL,
	}); err != nil {
		t.Fatalf("Save(Sub2APIBinding) error = %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/creation-tasks/video-generations", strings.NewReader(`{"client_task_id":"sub2-video-task","prompt":"make a video","model":"doubao-seedance-2.0","duration":5,"aspect_ratio":"16:9","resolution":"720p","generate_audio":true}`))
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("submit sub2api video task status = %d body = %s", res.Code, res.Body.String())
	}

	var listed map[string]any
	waitForHTTPTestCondition(t, func() bool {
		req = httptest.NewRequest(http.MethodGet, "/api/creation-tasks?ids=sub2-video-task", nil)
		req.Header.Set("Authorization", "Bearer "+sessionKey)
		res = httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		if res.Code != http.StatusOK {
			t.Fatalf("list sub2api video task status = %d body = %s", res.Code, res.Body.String())
		}
		if err := json.Unmarshal(res.Body.Bytes(), &listed); err != nil {
			t.Fatalf("list sub2api video task json: %v", err)
		}
		items := util.AsMapSlice(listed["items"])
		return len(items) == 1 && items[0]["status"] == service.TaskStatusSuccess
	})

	if generationPayload["model"] != "doubao-seedance-2.0" || generationPayload["duration"] != float64(5) || generationPayload["size"] != "16:9" || generationPayload["resolution"] != "720p" || generationPayload["generate_audio"] != true {
		t.Fatalf("gateway video request body = %#v", generationPayload)
	}
	if _, ok := generationPayload["aspect_ratio"]; ok {
		t.Fatalf("gateway video request should use APIMart size instead of aspect_ratio: %#v", generationPayload)
	}
	if taskPolls == 0 {
		t.Fatalf("expected task polling through /v1/tasks/{task_id}")
	}
	items := util.AsMapSlice(listed["items"])
	data := util.AsMapSlice(items[0]["data"])
	if len(data) != 1 || util.Clean(data[0]["video_url"]) != "https://cdn.example/video.mp4" || util.Clean(data[0]["asset_id"]) != "sub2-video-task:0" {
		t.Fatalf("sub2api video task data = %#v", items[0])
	}

	req = httptest.NewRequest(http.MethodPost, "/api/video-asset-collections", strings.NewReader(`{"name":"广告视频"}`))
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("create video collection status = %d body = %s", res.Code, res.Body.String())
	}
	var createPayload map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &createPayload); err != nil {
		t.Fatalf("create video collection json: %v", err)
	}
	collection := util.StringMap(createPayload["item"])
	collectionID := util.Clean(collection["id"])
	if collectionID == "" || collection["name"] != "广告视频" || util.ToInt(createPayload["unclassified_count"], -1) != 1 {
		t.Fatalf("created video collection = %#v", createPayload)
	}

	req = httptest.NewRequest(http.MethodPatch, "/api/video-asset-collections/items", strings.NewReader(jsonString(map[string]any{
		"collection_id": collectionID,
		"asset_ids":     []string{"sub2-video-task:0"},
	})))
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("assign video collection status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/video-asset-collections", nil)
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("list video collections status = %d body = %s", res.Code, res.Body.String())
	}
	var listCollections map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &listCollections); err != nil {
		t.Fatalf("list video collections json: %v", err)
	}
	collectionItems := util.AsMapSlice(listCollections["items"])
	if len(collectionItems) != 1 || util.ToInt(collectionItems[0]["videos_count"], 0) != 1 || util.ToInt(listCollections["unclassified_count"], -1) != 0 {
		t.Fatalf("list video collections = %#v", listCollections)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/creation-tasks?ids=sub2-video-task", nil)
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("list decorated video task status = %d body = %s", res.Code, res.Body.String())
	}
	if err := json.Unmarshal(res.Body.Bytes(), &listed); err != nil {
		t.Fatalf("list decorated video task json: %v", err)
	}
	items = util.AsMapSlice(listed["items"])
	data = util.AsMapSlice(items[0]["data"])
	if util.Clean(data[0]["collection_id"]) != collectionID || util.Clean(data[0]["collection_name"]) != "广告视频" {
		t.Fatalf("decorated video task data = %#v", data[0])
	}

	req = httptest.NewRequest(http.MethodPatch, "/api/video-asset-collections/items", strings.NewReader(jsonString(map[string]any{
		"collection_id": collectionID,
		"asset_ids":     []string{},
	})))
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("assign empty video asset ids status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPatch, "/api/video-asset-collections/items", strings.NewReader(jsonString(map[string]any{
		"collection_id": collectionID,
		"asset_ids":     []string{"https://cdn.example/video.mp4"},
	})))
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusNotFound {
		t.Fatalf("assign url video asset id status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPatch, "/api/video-asset-collections/items", strings.NewReader(jsonString(map[string]any{
		"collection_id": collectionID,
		"asset_ids":     []string{"missing-task:0"},
	})))
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusNotFound {
		t.Fatalf("assign missing video asset status = %d body = %s", res.Code, res.Body.String())
	}

	otherOwner := service.AuthOwner{ID: "sub2api:video-other", Name: "sub2api-other", Provider: service.AuthProviderSub2API}
	_, otherSession, err := app.auth.UpsertSub2APISession(otherOwner)
	if err != nil {
		t.Fatalf("UpsertSub2APISession(other) error = %v", err)
	}
	req = httptest.NewRequest(http.MethodDelete, "/api/video-asset-collections/"+url.PathEscape(collectionID), nil)
	req.Header.Set("Authorization", "Bearer "+otherSession)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusNotFound {
		t.Fatalf("delete other video collection status = %d body = %s", res.Code, res.Body.String())
	}
}

func TestSub2APITaskStatusEndpoint(t *testing.T) {
	tests := []struct {
		name   string
		base   string
		taskID string
		want   string
	}{
		{name: "gateway root", base: "https://api.apimart.ai", taskID: "task-123", want: "v1/tasks/task-123?language=zh"},
		{name: "gateway v1", base: "https://api.apimart.ai/v1", taskID: "task-123", want: "tasks/task-123?language=zh"},
		{name: "escape task id", base: "https://api.apimart.ai", taskID: "task/with space", want: "v1/tasks/task%2Fwith%20space?language=zh"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := sub2APITaskStatusEndpoint(tt.base, tt.taskID); got != tt.want {
				t.Fatalf("sub2APITaskStatusEndpoint() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestSub2APIVideoPayloadUsesApimartFields(t *testing.T) {
	payload := sub2APIVideoPayload(map[string]any{
		"prompt":         "make a video",
		"model":          "doubao-seedance-2.0",
		"duration":       60,
		"aspect_ratio":   "adaptive",
		"resolution":     "2k",
		"generate_audio": true,
		"images": []protocol.UploadedImage{
			{ContentType: "image/png", Data: []byte("png")},
		},
	})

	if payload["duration"] != 15 || payload["size"] != "adaptive" || payload["generate_audio"] != true {
		t.Fatalf("video payload = %#v", payload)
	}
	if _, ok := payload["aspect_ratio"]; ok {
		t.Fatalf("video payload should use size instead of aspect_ratio: %#v", payload)
	}
	if _, ok := payload["resolution"]; ok {
		t.Fatalf("invalid video resolution should be omitted: %#v", payload)
	}
	if _, ok := payload["images"]; ok {
		t.Fatalf("video payload should use image_urls instead of images: %#v", payload)
	}
	imageURLs, ok := payload["image_urls"].([]string)
	if !ok || len(imageURLs) != 1 || !strings.HasPrefix(imageURLs[0], "data:image/png;base64,") {
		t.Fatalf("video image_urls = %#v", payload["image_urls"])
	}

	clamped := sub2APIVideoPayload(map[string]any{"prompt": "make a video", "duration": 1, "aspect_ratio": "bad", "resolution": "1080p"})
	if clamped["duration"] != 5 || clamped["size"] != "16:9" || clamped["resolution"] != "1080p" {
		t.Fatalf("clamped video payload = %#v", clamped)
	}
}

func TestSub2APIVideoPayloadDetectsModelSpecificFields(t *testing.T) {
	klingV3 := sub2APIVideoPayload(map[string]any{"prompt": "make", "model": "kling-v3-omni", "duration": 2, "aspect_ratio": "21:9", "resolution": "1080p", "generate_audio": true})
	if klingV3["duration"] != 3 || klingV3["aspect_ratio"] != "16:9" || klingV3["mode"] != "pro" || klingV3["audio"] != true || klingV3["size"] != nil {
		t.Fatalf("kling-v3 payload = %#v", klingV3)
	}

	klingV26 := sub2APIVideoPayload(map[string]any{
		"prompt":         "make",
		"model":          "kling-v2-6",
		"duration":       7,
		"aspect_ratio":   "1:1",
		"resolution":     "720p",
		"generate_audio": true,
		"images": []protocol.UploadedImage{
			{ContentType: "image/png", Data: []byte("first")},
			{ContentType: "image/png", Data: []byte("last")},
			{ContentType: "image/png", Data: []byte("ignored")},
		},
	})
	if klingV26["duration"] != 10 || klingV26["aspect_ratio"] != "1:1" || klingV26["mode"] != "pro" || klingV26["audio"] != nil {
		t.Fatalf("kling-v2-6 payload = %#v", klingV26)
	}
	if urls := util.AsStringSlice(klingV26["image_urls"]); len(urls) != 2 {
		t.Fatalf("kling-v2-6 image_urls = %#v", klingV26["image_urls"])
	}

	wan := sub2APIVideoPayload(map[string]any{"prompt": "make", "model": "wan2.7", "duration": 1, "aspect_ratio": "adaptive", "resolution": "720p", "enhance_prompt": true, "generate_audio": true})
	if wan["duration"] != 2 || wan["size"] != "16:9" || wan["resolution"] != "720P" || wan["prompt_extend"] != true || wan["generate_audio"] != nil || wan["audio"] != nil {
		t.Fatalf("wan2.7 payload = %#v", wan)
	}

	veo := sub2APIVideoPayload(map[string]any{"prompt": "make", "model": "veo3.1-fast", "duration": 15, "aspect_ratio": "1:1", "resolution": "4k", "generate_audio": true})
	if veo["duration"] != 8 || veo["aspect_ratio"] != "16:9" || veo["resolution"] != "4k" || veo["generate_audio"] != nil || veo["audio"] != nil || veo["size"] != nil {
		t.Fatalf("veo3.1-fast payload = %#v", veo)
	}
}

func TestCanvasModelsUseSub2APIGatewayForBoundUser(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	gateway := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/model-catalog" {
			t.Fatalf("gateway request = %s %s", r.Method, r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer sub2-key" {
			t.Fatalf("gateway Authorization = %q", got)
		}
		util.WriteJSON(w, http.StatusOK, map[string]any{
			"object": "model_catalog",
			"items": []map[string]any{
				{"id": "remote-chat", "name": "Remote Chat", "capabilities": []string{"chat"}, "enabled": true},
				{"id": util.ImageModelGPT, "name": util.ImageModelGPT, "capabilities": []string{"image"}, "enabled": true},
				{"id": "sora-2", "name": "sora-2", "capabilities": []string{"video"}, "enabled": false},
			},
		})
	}))
	defer gateway.Close()

	owner := service.AuthOwner{ID: "sub2api:canvas-user", Name: "sub2api-canvas", Provider: service.AuthProviderSub2API}
	_, sessionKey, err := app.auth.UpsertSub2APISession(owner)
	if err != nil {
		t.Fatalf("UpsertSub2APISession() error = %v", err)
	}
	if err := app.sub2Bindings.Save(service.Sub2APIBinding{
		OwnerID:        owner.ID,
		Sub2APIUserID:  "canvas-user",
		SessionToken:   "session-canvas-user",
		APIKey:         "sub2-key",
		GatewayBaseURL: gateway.URL,
	}); err != nil {
		t.Fatalf("Save(Sub2APIBinding) error = %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/canvas/models", nil)
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("canvas models status = %d body = %s", res.Code, res.Body.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
		t.Fatalf("canvas models json: %v", err)
	}
	items := util.AsMapSlice(payload["items"])
	if len(items) != 12 {
		t.Fatalf("canvas models items = %#v", items)
	}
	ids := map[string]string{}
	capabilities := map[string][]string{}
	enabled := map[string]bool{}
	for _, item := range items {
		ids[util.Clean(item["id"])] = util.Clean(item["kind"])
		capabilities[util.Clean(item["id"])] = util.AsStringSlice(item["capabilities"])
		enabled[util.Clean(item["id"])] = util.ToBool(item["enabled"])
	}
	if ids["remote-chat"] != "text" ||
		ids[util.ImageModelGPT] != "image" ||
		ids[util.ImageModelGPTOfficial] != "image" ||
		ids[util.ImageModelGeminiProPreview] != "image" ||
		ids[util.ImageModelGeminiProPreviewOfficial] != "image" ||
		ids[util.ImageModelGeminiFlashPreview] != "image" ||
		ids[util.ImageModelGeminiFlashPreviewOfficial] != "image" ||
		ids[util.ImageModelMidjourney] != "image" ||
		ids[util.ImageModelGrokImagine] != "image" ||
		ids[util.ImageModelSeedream40] != "image" ||
		ids[util.ImageModelSeedream45] != "image" ||
		ids["sora-2"] != "video" {
		t.Fatalf("canvas model kinds = %#v", ids)
	}
	if fmt.Sprint(capabilities["remote-chat"]) != "[chat]" ||
		fmt.Sprint(capabilities[util.ImageModelGPT]) != "[image]" ||
		fmt.Sprint(capabilities[util.ImageModelGPTOfficial]) != "[image]" ||
		fmt.Sprint(capabilities[util.ImageModelGeminiProPreview]) != "[image]" ||
		fmt.Sprint(capabilities[util.ImageModelGeminiProPreviewOfficial]) != "[image]" ||
		fmt.Sprint(capabilities[util.ImageModelGeminiFlashPreview]) != "[image]" ||
		fmt.Sprint(capabilities[util.ImageModelGeminiFlashPreviewOfficial]) != "[image]" ||
		fmt.Sprint(capabilities[util.ImageModelMidjourney]) != "[image]" ||
		fmt.Sprint(capabilities[util.ImageModelGrokImagine]) != "[image]" ||
		fmt.Sprint(capabilities[util.ImageModelSeedream40]) != "[image]" ||
		fmt.Sprint(capabilities[util.ImageModelSeedream45]) != "[image]" ||
		fmt.Sprint(capabilities["sora-2"]) != "[video]" {
		t.Fatalf("canvas model capabilities = %#v", capabilities)
	}
	if !enabled["remote-chat"] ||
		!enabled[util.ImageModelGPT] ||
		!enabled[util.ImageModelGPTOfficial] ||
		!enabled[util.ImageModelGeminiProPreview] ||
		!enabled[util.ImageModelGeminiProPreviewOfficial] ||
		!enabled[util.ImageModelGeminiFlashPreview] ||
		!enabled[util.ImageModelGeminiFlashPreviewOfficial] ||
		!enabled[util.ImageModelMidjourney] ||
		!enabled[util.ImageModelGrokImagine] ||
		!enabled[util.ImageModelSeedream40] ||
		!enabled[util.ImageModelSeedream45] ||
		enabled["sora-2"] {
		t.Fatalf("canvas model enabled flags = %#v", enabled)
	}
	if _, ok := ids[util.ImageModelAuto]; ok {
		t.Fatalf("sub2api model catalog should not inject local auto model: %#v", ids)
	}
}

func TestCanvasModelsFallbackToSub2APIModelsForBoundUser(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	requests := []string{}
	gateway := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests = append(requests, r.URL.Path)
		if got := r.Header.Get("Authorization"); got != "Bearer sub2-key" {
			t.Fatalf("gateway Authorization = %q", got)
		}
		switch r.URL.Path {
		case "/model-catalog":
			util.WriteError(w, http.StatusNotFound, "model catalog not found")
		case "/models":
			util.WriteJSON(w, http.StatusOK, map[string]any{
				"object": "list",
				"data": []map[string]any{
					{"id": "remote-chat"},
					{"id": util.ImageModelGPT},
				},
			})
		default:
			t.Fatalf("gateway request = %s %s", r.Method, r.URL.Path)
		}
	}))
	defer gateway.Close()

	owner := service.AuthOwner{ID: "sub2api:canvas-fallback-user", Name: "sub2api-canvas-fallback", Provider: service.AuthProviderSub2API}
	_, sessionKey, err := app.auth.UpsertSub2APISession(owner)
	if err != nil {
		t.Fatalf("UpsertSub2APISession() error = %v", err)
	}
	if err := app.sub2Bindings.Save(service.Sub2APIBinding{
		OwnerID:        owner.ID,
		Sub2APIUserID:  "canvas-fallback-user",
		SessionToken:   "session-canvas-fallback-user",
		APIKey:         "sub2-key",
		GatewayBaseURL: gateway.URL,
	}); err != nil {
		t.Fatalf("Save(Sub2APIBinding) error = %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/canvas/models", nil)
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("canvas models status = %d body = %s", res.Code, res.Body.String())
	}
	if fmt.Sprint(requests) != "[/model-catalog /models]" {
		t.Fatalf("gateway requests = %#v", requests)
	}
	var payload map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
		t.Fatalf("canvas models json: %v", err)
	}
	items := util.AsMapSlice(payload["items"])
	if len(items) != 11 {
		t.Fatalf("canvas models items = %#v", items)
	}
	ids := map[string]string{}
	for _, item := range items {
		ids[util.Clean(item["id"])] = util.Clean(item["kind"])
	}
	if ids["remote-chat"] != "text" ||
		ids[util.ImageModelGPT] != "image" ||
		ids[util.ImageModelGPTOfficial] != "image" ||
		ids[util.ImageModelGeminiProPreview] != "image" ||
		ids[util.ImageModelGeminiProPreviewOfficial] != "image" ||
		ids[util.ImageModelGeminiFlashPreview] != "image" ||
		ids[util.ImageModelGeminiFlashPreviewOfficial] != "image" ||
		ids[util.ImageModelMidjourney] != "image" ||
		ids[util.ImageModelGrokImagine] != "image" ||
		ids[util.ImageModelSeedream40] != "image" ||
		ids[util.ImageModelSeedream45] != "image" {
		t.Fatalf("canvas model kinds = %#v", ids)
	}
}

func TestAdminCreationTaskDiagnosticsAndRepair(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	_, userKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "limited", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}
	started := make(chan struct{})
	app.tasks = service.NewStoredImageTaskService(testJSONStoreFromApp(t, app),
		func(ctx context.Context, identity service.Identity, payload map[string]any) (map[string]any, error) {
			close(started)
			<-ctx.Done()
			return nil, ctx.Err()
		},
		failingHTTPImageTaskHandler,
		failingHTTPImageTaskHandler,
		func() int { return 30 },
	)

	req := httptest.NewRequest(http.MethodPost, "/api/creation-tasks/image-generations", strings.NewReader(`{"client_task_id":"active","prompt":"draw","model":"gpt-image-2"}`))
	req.Header.Set("Authorization", "Bearer "+userKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("submit active task status = %d body = %s", res.Code, res.Body.String())
	}
	select {
	case <-started:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for active task handler")
	}

	req = httptest.NewRequest(http.MethodGet, "/api/admin/creation-tasks/diagnostics", nil)
	req.Header.Set("Authorization", "Bearer "+userKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusForbidden {
		t.Fatalf("user diagnostics status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/admin/creation-tasks/diagnostics", nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("diagnostics status = %d body = %s", res.Code, res.Body.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
		t.Fatalf("diagnostics json: %v", err)
	}
	diagnostics, _ := payload["diagnostics"].(map[string]any)
	if diagnostics["active_tasks"] != float64(1) || diagnostics["dirty_terminal_tasks"] != float64(0) {
		t.Fatalf("diagnostics = %#v", diagnostics)
	}

	req = httptest.NewRequest(http.MethodPost, "/api/admin/creation-tasks/diagnostics", strings.NewReader(`{}`))
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("repair diagnostics status = %d body = %s", res.Code, res.Body.String())
	}
	if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
		t.Fatalf("repair diagnostics json: %v", err)
	}
	diagnostics, _ = payload["diagnostics"].(map[string]any)
	if diagnostics["active_tasks"] != float64(1) {
		t.Fatalf("repair diagnostics = %#v", diagnostics)
	}

	req = httptest.NewRequest(http.MethodPost, "/api/admin/creation-tasks/diagnostics", strings.NewReader(`{"finalize_active":true}`))
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("finalize active diagnostics status = %d body = %s", res.Code, res.Body.String())
	}
	if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
		t.Fatalf("finalize diagnostics json: %v", err)
	}
	diagnostics, _ = payload["diagnostics"].(map[string]any)
	if diagnostics["active_tasks"] != float64(1) || diagnostics["stale_active_tasks"] != float64(0) {
		t.Fatalf("fresh finalize diagnostics = %#v", diagnostics)
	}
	repair, _ := payload["repair"].(map[string]any)
	if repair["finalized_active_tasks"] != float64(0) || repair["skipped_active_tasks"] != float64(1) {
		t.Fatalf("fresh finalize repair = %#v", repair)
	}

	time.Sleep(1100 * time.Millisecond)
	req = httptest.NewRequest(http.MethodPost, "/api/admin/creation-tasks/diagnostics", strings.NewReader(`{"finalize_active":true,"stale_seconds":1}`))
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("finalize stale diagnostics status = %d body = %s", res.Code, res.Body.String())
	}
	if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
		t.Fatalf("finalize stale diagnostics json: %v", err)
	}
	diagnostics, _ = payload["diagnostics"].(map[string]any)
	if diagnostics["active_tasks"] != float64(0) || diagnostics["dirty_terminal_tasks"] != float64(0) {
		t.Fatalf("finalize stale diagnostics = %#v", diagnostics)
	}
	repair, _ = payload["repair"].(map[string]any)
	if repair["finalized_active_tasks"] != float64(1) || repair["skipped_active_tasks"] != float64(0) {
		t.Fatalf("finalize stale repair = %#v", repair)
	}
}

func TestLoginPageImageUploadSettings(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	req := httptest.NewRequest(http.MethodGet, "/api/app-meta", nil)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("app meta status = %d body = %s", res.Code, res.Body.String())
	}
	var meta map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &meta); err != nil {
		t.Fatalf("app meta json: %v", err)
	}
	if meta["login_page_image_url"] != "" || meta["login_page_image_mode"] != "contain" {
		t.Fatalf("initial app meta = %#v", meta)
	}

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	_ = writer.WriteField("login_page_image_action", "replace")
	_ = writer.WriteField("login_page_image_mode", "cover")
	_ = writer.WriteField("login_page_image_zoom", "1.25")
	_ = writer.WriteField("login_page_image_position_x", "40")
	_ = writer.WriteField("login_page_image_position_y", "60")
	part, err := writer.CreateFormFile("login_page_image_file", "panel.png")
	if err != nil {
		t.Fatalf("CreateFormFile() error = %v", err)
	}
	if err := encodeHTTPTestPNG(part); err != nil {
		t.Fatalf("encode upload png: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("multipart close: %v", err)
	}

	req = httptest.NewRequest(http.MethodPost, "/api/settings/login-page-image", body)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	req.Header.Set("Content-Type", writer.FormDataContentType())
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("upload status = %d body = %s", res.Code, res.Body.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
		t.Fatalf("upload json: %v", err)
	}
	config, _ := payload["config"].(map[string]any)
	imageURL, _ := config["login_page_image_url"].(string)
	if !strings.HasPrefix(imageURL, "/login-page-images/") {
		t.Fatalf("uploaded image url = %#v in %#v", imageURL, payload)
	}
	if config["login_page_image_mode"] != "cover" || config["login_page_image_zoom"] != float64(1.25) {
		t.Fatalf("login page image config = %#v", config)
	}

	req = httptest.NewRequest(http.MethodGet, imageURL, nil)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("uploaded image static status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/app-meta", nil)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("app meta after upload status = %d body = %s", res.Code, res.Body.String())
	}
	if err := json.Unmarshal(res.Body.Bytes(), &meta); err != nil {
		t.Fatalf("app meta after upload json: %v", err)
	}
	if meta["login_page_image_url"] != imageURL || meta["login_page_image_mode"] != "cover" {
		t.Fatalf("app meta after upload = %#v", meta)
	}
}

func TestManagedImageUploadsStoreOwnerScopedImages(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	owner := service.AuthOwner{ID: "linuxdo:upload", Name: "uploader", Provider: service.AuthProviderLinuxDo}
	_, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "uploader", owner)
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("image", "first.png")
	if err != nil {
		t.Fatalf("CreateFormFile(first) error = %v", err)
	}
	if err := encodeHTTPTestPNG(part); err != nil {
		t.Fatalf("encode first png: %v", err)
	}
	part, err = writer.CreateFormFile("image[]", "second.png")
	if err != nil {
		t.Fatalf("CreateFormFile(second) error = %v", err)
	}
	if err := encodeHTTPTestPNG(part); err != nil {
		t.Fatalf("encode second png: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("multipart close: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/images/uploads", body)
	req.Header.Set("Authorization", "Bearer "+rawKey)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("upload status = %d body = %s", res.Code, res.Body.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
		t.Fatalf("upload json: %v", err)
	}
	items := util.AsMapSlice(payload["items"])
	if len(items) != 2 {
		t.Fatalf("upload items = %#v", payload)
	}
	for _, item := range items {
		pathValue := util.Clean(item["path"])
		if pathValue == "" || util.Clean(item["visibility"]) != service.ImageVisibilityPrivate {
			t.Fatalf("upload item = %#v", item)
		}
		if _, err := os.Stat(filepath.Join(app.config.ImagesDir(), filepath.FromSlash(pathValue))); err != nil {
			t.Fatalf("uploaded image stat %q: %v", pathValue, err)
		}
		if _, _, err := app.images.ImageBytes(pathValue, service.ImageAccessScope{OwnerID: owner.ID}); err != nil {
			t.Fatalf("owner ImageBytes(%q) error = %v", pathValue, err)
		}
		if _, _, err := app.images.ImageBytes(pathValue, service.ImageAccessScope{OwnerID: "linuxdo:other"}); err == nil {
			t.Fatalf("other owner ImageBytes(%q) should fail", pathValue)
		}
	}

	list := app.images.ListImages("http://127.0.0.1:8000", "", "", service.ImageAccessScope{OwnerID: owner.ID})
	if got := len(list["items"].([]map[string]any)); got != 2 {
		t.Fatalf("owner list count = %d, list = %#v", got, list)
	}
}

func TestManagedImageUploadsRejectInvalidInput(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	_, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "uploader", service.AuthOwner{ID: "linuxdo:upload", Name: "uploader", Provider: service.AuthProviderLinuxDo})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("image", "note.txt")
	if err != nil {
		t.Fatalf("CreateFormFile() error = %v", err)
	}
	if _, err := part.Write([]byte("not an image")); err != nil {
		t.Fatalf("write part: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("multipart close: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/images/uploads", body)
	req.Header.Set("Authorization", "Bearer "+rawKey)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("invalid image upload status = %d body = %s", res.Code, res.Body.String())
	}

	emptyBody := &bytes.Buffer{}
	emptyWriter := multipart.NewWriter(emptyBody)
	if err := emptyWriter.Close(); err != nil {
		t.Fatalf("empty multipart close: %v", err)
	}
	req = httptest.NewRequest(http.MethodPost, "/api/images/uploads", emptyBody)
	req.Header.Set("Authorization", "Bearer "+rawKey)
	req.Header.Set("Content-Type", emptyWriter.FormDataContentType())
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("empty upload status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPost, "/api/images/uploads", nil)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous upload status = %d body = %s", res.Code, res.Body.String())
	}
}

func TestManagedImageTagsEndpointUpdatesAndFilters(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()
	_, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "tag-user", service.AuthOwner{ID: "linuxdo:tag-user", Name: "tag-user", Provider: service.AuthProviderLinuxDo})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}
	rel := "2026/04/29/tagged.png"
	imagePath := filepath.Join(app.config.ImagesDir(), filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(imagePath), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := writeHTTPTestPNG(imagePath); err != nil {
		t.Fatalf("writeHTTPTestPNG() error = %v", err)
	}
	app.images.RecordGeneratedImages([]string{rel}, "linuxdo:tag-user", "tag-user", service.ImageVisibilityPrivate)

	req := httptest.NewRequest(http.MethodPatch, "/api/images/tags", strings.NewReader(jsonString(map[string]any{"path": rel, "tags": []string{"avatar", "hero"}})))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("update tags status = %d body = %s", res.Code, res.Body.String())
	}
	var updatePayload map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &updatePayload); err != nil {
		t.Fatalf("update tags json: %v", err)
	}
	item := util.StringMap(updatePayload["item"])
	if got := util.AsStringSlice(item["tags"]); len(got) != 2 || got[0] != "avatar" || got[1] != "hero" {
		t.Fatalf("updated tags = %#v", item["tags"])
	}

	req = httptest.NewRequest(http.MethodGet, "/api/images?tags=avatar", nil)
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("filter tags status = %d body = %s", res.Code, res.Body.String())
	}
	var listPayload map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &listPayload); err != nil {
		t.Fatalf("filter tags json: %v", err)
	}
	items := util.AsMapSlice(listPayload["items"])
	if len(items) != 1 || util.Clean(items[0]["path"]) != rel {
		t.Fatalf("filtered items = %#v", listPayload)
	}

	req = httptest.NewRequest(http.MethodDelete, "/api/images/tags", strings.NewReader(`{"tag":"hero"}`))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("delete tag status = %d body = %s", res.Code, res.Body.String())
	}
	req = httptest.NewRequest(http.MethodGet, "/api/images/tags", nil)
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("list tags status = %d body = %s", res.Code, res.Body.String())
	}
	var tagsPayload map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &tagsPayload); err != nil {
		t.Fatalf("list tags json: %v", err)
	}
	tags := util.AsStringSlice(tagsPayload["tags"])
	if len(tags) != 1 || tags[0] != "avatar" {
		t.Fatalf("tags = %#v", tagsPayload)
	}
}

func TestImageCollectionsEndpointCreatesAssignsAndFilters(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()
	_, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "collection-user", service.AuthOwner{ID: "linuxdo:collection-user", Name: "collection-user", Provider: service.AuthProviderLinuxDo})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}
	rels := []string{
		"2026/04/29/collection-a.png",
		"2026/04/29/collection-b.png",
	}
	for _, rel := range rels {
		imagePath := filepath.Join(app.config.ImagesDir(), filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(imagePath), 0o755); err != nil {
			t.Fatalf("MkdirAll() error = %v", err)
		}
		if err := writeHTTPTestPNG(imagePath); err != nil {
			t.Fatalf("writeHTTPTestPNG() error = %v", err)
		}
	}
	app.images.RecordGeneratedImages(rels, "linuxdo:collection-user", "collection-user", service.ImageVisibilityPrivate)

	req := httptest.NewRequest(http.MethodPost, "/api/image-collections", strings.NewReader(`{"name":"角色"}`))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("create collection status = %d body = %s", res.Code, res.Body.String())
	}
	var createPayload map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &createPayload); err != nil {
		t.Fatalf("create collection json: %v", err)
	}
	collection := util.StringMap(createPayload["item"])
	collectionID := util.Clean(collection["id"])
	if collectionID == "" || collection["name"] != "角色" {
		t.Fatalf("created collection = %#v", createPayload)
	}
	if util.ToInt(createPayload["unclassified_count"], -1) != 2 {
		t.Fatalf("create collection unclassified_count = %#v", createPayload)
	}

	req = httptest.NewRequest(http.MethodPatch, "/api/image-collections/items", strings.NewReader(jsonString(map[string]any{"collection_id": collectionID, "paths": []string{rels[0]}})))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("assign collection status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/images?collection_id="+url.QueryEscape(collectionID), nil)
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("filter collection status = %d body = %s", res.Code, res.Body.String())
	}
	var listPayload map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &listPayload); err != nil {
		t.Fatalf("filter collection json: %v", err)
	}
	items := util.AsMapSlice(listPayload["items"])
	if len(items) != 1 || util.Clean(items[0]["path"]) != rels[0] || util.Clean(items[0]["collection_name"]) != "角色" {
		t.Fatalf("collection filtered items = %#v", listPayload)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/images?collection_id="+url.QueryEscape(service.ImageCollectionUnclassifiedID), nil)
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("filter unclassified status = %d body = %s", res.Code, res.Body.String())
	}
	if err := json.Unmarshal(res.Body.Bytes(), &listPayload); err != nil {
		t.Fatalf("filter unclassified json: %v", err)
	}
	items = util.AsMapSlice(listPayload["items"])
	if len(items) != 1 || util.Clean(items[0]["path"]) != rels[1] {
		t.Fatalf("unclassified filtered items = %#v", listPayload)
	}

	req = httptest.NewRequest(http.MethodDelete, "/api/image-collections/"+url.PathEscape(collectionID), nil)
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("delete collection status = %d body = %s", res.Code, res.Body.String())
	}
	req = httptest.NewRequest(http.MethodGet, "/api/images?collection_id="+url.QueryEscape(collectionID), nil)
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("filter deleted collection status = %d body = %s", res.Code, res.Body.String())
	}
	if err := json.Unmarshal(res.Body.Bytes(), &listPayload); err != nil {
		t.Fatalf("filter deleted collection json: %v", err)
	}
	if items := util.AsMapSlice(listPayload["items"]); len(items) != 0 {
		t.Fatalf("deleted collection should clear image assignment = %#v", listPayload)
	}
}

func TestImageCollectionsEndpointRejectsPublicMutation(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()
	_, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "collection-user", service.AuthOwner{ID: "linuxdo:collection-public", Name: "collection-public", Provider: service.AuthProviderLinuxDo})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/image-collections", strings.NewReader(`{"name":"公共","scope":"public"}`))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("public collection mutation status = %d body = %s", res.Code, res.Body.String())
	}
}

func TestCreationTaskReferenceImageUploadAndJSONEdit(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()
	installHTTPTestImageStreamFunc(t, app, func(ctx context.Context, client *backend.Client, request protocol.ConversationRequest, index, total int) (<-chan protocol.ImageOutput, <-chan error) {
		if len(request.Images) != 1 {
			t.Fatalf("request images = %d, want 1", len(request.Images))
		}
		if data, err := base64.StdEncoding.DecodeString(request.Images[0]); err != nil || len(data) == 0 {
			t.Fatalf("request image = %#v", request.Images[0])
		}
		return httpTestImageOutputStream(request, index)
	})

	owner := service.AuthOwner{ID: "linuxdo:temp-reference", Name: "temp-reference", Provider: service.AuthProviderLinuxDo}
	_, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "temp-reference", owner)
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	_ = writer.WriteField("client_reference_id", "ref-client-1")
	_ = writer.WriteField("conversation_id", "conversation-1")
	_ = writer.WriteField("turn_id", "turn-1")
	part, err := writer.CreateFormFile("image", "reference.png")
	if err != nil {
		t.Fatalf("CreateFormFile() error = %v", err)
	}
	if err := encodeHTTPTestPNG(part); err != nil {
		t.Fatalf("encode reference png: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("multipart close: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/creation-tasks/reference-images", body)
	req.Header.Set("Authorization", "Bearer "+rawKey)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("reference upload status = %d body = %s", res.Code, res.Body.String())
	}
	var uploadPayload map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &uploadPayload); err != nil {
		t.Fatalf("reference upload json: %v", err)
	}
	item := util.StringMap(uploadPayload["item"])
	refID := util.Clean(item["id"])
	if refID == "" || util.Clean(item["client_reference_id"]) != "ref-client-1" || util.ToInt(item["width"], 0) != 12 || util.ToInt(item["height"], 0) != 12 {
		t.Fatalf("reference upload item = %#v", item)
	}

	req = httptest.NewRequest(http.MethodPost, "/api/creation-tasks/image-edits", strings.NewReader(jsonString(map[string]any{
		"client_task_id":      "edit-from-reference",
		"prompt":              "edit this",
		"model":               "gpt-image-2",
		"reference_image_ids": []string{refID},
		"n":                   1,
	})))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	req.Header.Set("Content-Type", "application/json")
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("json edit submit status = %d body = %s", res.Code, res.Body.String())
	}

	var listed map[string]any
	waitForHTTPTestCondition(t, func() bool {
		req = httptest.NewRequest(http.MethodGet, "/api/creation-tasks?ids=edit-from-reference", nil)
		req.Header.Set("Authorization", "Bearer "+rawKey)
		res = httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		if res.Code != http.StatusOK {
			t.Fatalf("list task status = %d body = %s", res.Code, res.Body.String())
		}
		if err := json.Unmarshal(res.Body.Bytes(), &listed); err != nil {
			t.Fatalf("list task json: %v", err)
		}
		items := util.AsMapSlice(listed["items"])
		return len(items) == 1 && items[0]["status"] == service.TaskStatusSuccess
	})
	items := util.AsMapSlice(listed["items"])
	if len(items) != 1 || util.Clean(items[0]["mode"]) != "edit" {
		t.Fatalf("listed task = %#v", listed)
	}
}

func TestCreationTaskReferenceImageUploadIsOwnerScoped(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	_, aliceKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "alice", service.AuthOwner{ID: "linuxdo:alice", Name: "alice", Provider: service.AuthProviderLinuxDo})
	if err != nil {
		t.Fatalf("CreateAPIKey(alice) error = %v", err)
	}
	_, bobKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "bob", service.AuthOwner{ID: "linuxdo:bob", Name: "bob", Provider: service.AuthProviderLinuxDo})
	if err != nil {
		t.Fatalf("CreateAPIKey(bob) error = %v", err)
	}

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	_ = writer.WriteField("client_reference_id", "ref-client-2")
	part, err := writer.CreateFormFile("image", "reference.png")
	if err != nil {
		t.Fatalf("CreateFormFile() error = %v", err)
	}
	if err := encodeHTTPTestPNG(part); err != nil {
		t.Fatalf("encode reference png: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("multipart close: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/creation-tasks/reference-images", body)
	req.Header.Set("Authorization", "Bearer "+aliceKey)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("reference upload status = %d body = %s", res.Code, res.Body.String())
	}
	var uploadPayload map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &uploadPayload); err != nil {
		t.Fatalf("reference upload json: %v", err)
	}
	refID := util.Clean(util.StringMap(uploadPayload["item"])["id"])
	if refID == "" {
		t.Fatalf("reference upload payload = %#v", uploadPayload)
	}

	req = httptest.NewRequest(http.MethodPost, "/api/creation-tasks/image-edits", strings.NewReader(jsonString(map[string]any{
		"client_task_id":      "bob-edit-from-reference",
		"prompt":              "edit this",
		"model":               "gpt-image-2",
		"reference_image_ids": []string{refID},
	})))
	req.Header.Set("Authorization", "Bearer "+bobKey)
	req.Header.Set("Content-Type", "application/json")
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("bob json edit status = %d body = %s", res.Code, res.Body.String())
	}
}

func TestImageManagementIsScopedByOwner(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	owner := service.AuthOwner{ID: "linuxdo:123", Name: "alice", Provider: service.AuthProviderLinuxDo}
	_, sessionKey, err := app.auth.UpsertLinuxDoSession(owner)
	if err != nil {
		t.Fatalf("UpsertLinuxDoSession() error = %v", err)
	}
	aliceRel := "2026/04/29/alice.png"
	bobRel := "2026/04/29/bob.png"
	legacyRel := "2026/04/29/legacy.png"
	for _, rel := range []string{aliceRel, bobRel, legacyRel} {
		path := filepath.Join(app.config.ImagesDir(), filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatalf("mkdir image dir: %v", err)
		}
		if err := writeHTTPTestPNG(path); err != nil {
			t.Fatalf("write image %s: %v", rel, err)
		}
	}
	app.images.RecordGeneratedImages([]string{aliceRel}, owner.ID, owner.Name, service.ImageVisibilityPrivate)
	app.images.RecordGeneratedImages([]string{bobRel}, "linuxdo:456", "bob", service.ImageVisibilityPrivate)

	req := httptest.NewRequest(http.MethodGet, "/api/images", nil)
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("linuxdo images status = %d body = %s", res.Code, res.Body.String())
	}
	var list map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &list); err != nil {
		t.Fatalf("linuxdo images json: %v", err)
	}
	items := logItems(list)
	if len(items) != 1 || items[0]["path"] != aliceRel {
		t.Fatalf("linuxdo scoped images = %#v", list)
	}
	if items[0]["owner_name"] != owner.Name || items[0]["visibility"] != service.ImageVisibilityPrivate {
		t.Fatalf("linuxdo image metadata = %#v", items[0])
	}

	req = httptest.NewRequest(http.MethodPatch, "/api/images/visibility", strings.NewReader(`{"path":"`+aliceRel+`","visibility":"public"}`))
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusForbidden {
		t.Fatalf("linuxdo publish image status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPatch, "/api/images/visibility", strings.NewReader(`{"path":"`+bobRel+`","visibility":"public"}`))
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusForbidden {
		t.Fatalf("linuxdo publish other image status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/images?scope=public", nil)
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("disabled public image scope status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPatch, "/api/images/visibility", strings.NewReader(`{"path":"`+aliceRel+`","visibility":"public"}`))
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("admin publish image status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPatch, "/api/images/visibility", strings.NewReader(`{"path":"`+aliceRel+`","visibility":"private"}`))
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("admin set private image status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/images?scope=all", nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("admin all gallery status = %d body = %s", res.Code, res.Body.String())
	}
	if err := json.Unmarshal(res.Body.Bytes(), &list); err != nil {
		t.Fatalf("admin all gallery json: %v", err)
	}
	items = logItems(list)
	if len(items) != 3 {
		t.Fatalf("admin all gallery should see all images, got %#v", list)
	}
	if len(items) > 0 && (items[0]["url"] != nil || items[0]["object_url"] != nil || items[0]["prompt"] != nil || items[0]["reference_image_urls"] != nil) {
		t.Fatalf("admin all list item should stay lightweight = %#v", items[0])
	}
	seenPaths := make(map[string]bool, len(items))
	for _, item := range items {
		path, _ := item["path"].(string)
		seenPaths[path] = true
	}
	if !seenPaths[aliceRel] || !seenPaths[bobRel] || !seenPaths[legacyRel] {
		t.Fatalf("admin all gallery paths = %#v", items)
	}

	req = httptest.NewRequest(http.MethodDelete, "/api/images", strings.NewReader(`{"paths":["`+bobRel+`","`+aliceRel+`"]}`))
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("linuxdo delete images status = %d body = %s", res.Code, res.Body.String())
	}
	var scopedDeleteBody map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &scopedDeleteBody); err != nil {
		t.Fatalf("linuxdo delete images json: %v", err)
	}
	if scopedDeleteBody["deleted"] != float64(1) || scopedDeleteBody["missing"] != float64(1) {
		t.Fatalf("linuxdo delete images body = %#v", scopedDeleteBody)
	}
	if _, err := os.Stat(filepath.Join(app.config.ImagesDir(), filepath.FromSlash(aliceRel))); !os.IsNotExist(err) {
		t.Fatalf("alice image should be deleted by Linuxdo user, stat error = %v", err)
	}
	if _, err := os.Stat(filepath.Join(app.config.ImagesDir(), filepath.FromSlash(bobRel))); err != nil {
		t.Fatalf("bob image should not be deleted, stat error = %v", err)
	}

	_, localKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "local user", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey(local) error = %v", err)
	}
	req = httptest.NewRequest(http.MethodDelete, "/api/images", strings.NewReader(`{"paths":["`+bobRel+`"]}`))
	req.Header.Set("Authorization", "Bearer "+localKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("local user delete images status = %d body = %s", res.Code, res.Body.String())
	}
	if err := json.Unmarshal(res.Body.Bytes(), &scopedDeleteBody); err != nil {
		t.Fatalf("local user delete images json: %v", err)
	}
	if scopedDeleteBody["deleted"] != float64(0) || scopedDeleteBody["missing"] != float64(1) {
		t.Fatalf("local user delete images body = %#v", scopedDeleteBody)
	}
	if _, err := os.Stat(filepath.Join(app.config.ImagesDir(), filepath.FromSlash(bobRel))); err != nil {
		t.Fatalf("bob image should still exist after local user delete, stat error = %v", err)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/images", nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("admin images status = %d body = %s", res.Code, res.Body.String())
	}
	if err := json.Unmarshal(res.Body.Bytes(), &list); err != nil {
		t.Fatalf("admin images json: %v", err)
	}
	if items := logItems(list); len(items) != 2 {
		t.Fatalf("admin should see owned and legacy images, got %#v", list)
	}

	req = httptest.NewRequest(http.MethodDelete, "/api/images", strings.NewReader(`{"paths":["`+bobRel+`"]}`))
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("admin delete images status = %d body = %s", res.Code, res.Body.String())
	}
	var deleteBody map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &deleteBody); err != nil {
		t.Fatalf("admin delete images json: %v", err)
	}
	if deleteBody["deleted"] != float64(1) || deleteBody["missing"] != float64(0) {
		t.Fatalf("admin delete images body = %#v", deleteBody)
	}
	if _, err := os.Stat(filepath.Join(app.config.ImagesDir(), filepath.FromSlash(bobRel))); !os.IsNotExist(err) {
		t.Fatalf("bob image should be deleted by admin, stat error = %v", err)
	}
}

func TestManagedImagesTeamLibraryAccessAndPermissions(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	owner := service.AuthOwner{ID: "sub2api:team-owner", Name: "team-owner", Provider: service.AuthProviderSub2API}
	_, ownerKey, err := app.auth.UpsertSub2APISession(owner)
	if err != nil {
		t.Fatalf("UpsertSub2APISession(owner) error = %v", err)
	}
	member := service.AuthOwner{ID: "sub2api:team-member", Name: "team-member", Provider: service.AuthProviderSub2API}
	_, memberKey, err := app.auth.UpsertSub2APISession(member)
	if err != nil {
		t.Fatalf("UpsertSub2APISession(member) error = %v", err)
	}
	manager := service.AuthOwner{ID: "sub2api:team-manager", Name: "team-manager", Provider: service.AuthProviderSub2API}
	_, managerKey, err := app.auth.UpsertSub2APISession(manager)
	if err != nil {
		t.Fatalf("UpsertSub2APISession(manager) error = %v", err)
	}
	outsider := service.AuthOwner{ID: "sub2api:team-outsider", Name: "team-outsider", Provider: service.AuthProviderSub2API}
	_, outsiderKey, err := app.auth.UpsertSub2APISession(outsider)
	if err != nil {
		t.Fatalf("UpsertSub2APISession(outsider) error = %v", err)
	}
	saveTestSub2APIBinding(t, app, owner.ID, "team-owner@example.com")
	saveTestSub2APIBinding(t, app, member.ID, "team-member@example.com")
	saveTestSub2APIBinding(t, app, manager.ID, "team-manager@example.com")
	saveTestSub2APIBinding(t, app, outsider.ID, "team-outsider@example.com")

	teamID := createHTTPTestTeam(t, app, ownerKey)
	acceptHTTPTestInvite(t, app, managerKey, createHTTPTestInvite(t, app, ownerKey, teamID, "team-manager@example.com", "manager"))
	acceptHTTPTestInvite(t, app, memberKey, createHTTPTestInvite(t, app, ownerKey, teamID, "team-member@example.com", "member"))

	rel := "2026/04/29/team-shared.png"
	imagePath := filepath.Join(app.config.ImagesDir(), filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(imagePath), 0o755); err != nil {
		t.Fatalf("mkdir image dir: %v", err)
	}
	if err := writeHTTPTestPNG(imagePath); err != nil {
		t.Fatalf("write image: %v", err)
	}
	app.images.RecordGeneratedImages([]string{rel}, owner.ID, owner.Name, service.ImageVisibilityPrivate)

	req := httptest.NewRequest(http.MethodPatch, "/api/images/library-scope", strings.NewReader(jsonString(map[string]any{
		"paths":        []string{rel},
		"target_scope": "team",
		"team_id":      teamID,
	})))
	req.Header.Set("Authorization", "Bearer "+ownerKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("move to team status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/images?scope=mine", nil)
	req.Header.Set("Authorization", "Bearer "+ownerKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("owner personal images status = %d body = %s", res.Code, res.Body.String())
	}
	var list map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &list); err != nil {
		t.Fatalf("owner personal json: %v", err)
	}
	if items := logItems(list); len(items) != 0 {
		t.Fatalf("moved team image should leave personal gallery: %#v", list)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/images?scope=team&team_id="+url.QueryEscape(teamID), nil)
	req.Header.Set("Authorization", "Bearer "+memberKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("member team images status = %d body = %s", res.Code, res.Body.String())
	}
	if err := json.Unmarshal(res.Body.Bytes(), &list); err != nil {
		t.Fatalf("member team images json: %v", err)
	}
	items := logItems(list)
	if len(items) != 1 || items[0]["path"] != rel || items[0]["library_scope"] != service.ImageLibraryScopeTeam || items[0]["team_id"] != teamID || list["team_storage"] == nil {
		t.Fatalf("member team images = %#v", list)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/images/detail?scope=team&team_id="+url.QueryEscape(teamID)+"&path="+url.QueryEscape(rel), nil)
	req.Header.Set("Authorization", "Bearer "+memberKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("member team image detail status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/images/"+rel, nil)
	req.Header.Set("Authorization", "Bearer "+memberKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("member team image file status = %d body = %s", res.Code, res.Body.String())
	}
	if data, mimeType, err := app.imageBytesForIdentity(rel, service.Identity{Role: service.AuthRoleUser, OwnerID: member.ID, Name: member.Name}); err != nil || len(data) == 0 || !strings.HasPrefix(mimeType, "image/") {
		t.Fatalf("member imageBytesForIdentity() data=%d mime=%q err=%v", len(data), mimeType, err)
	}
	if _, _, err := app.imageBytesForIdentity(rel, service.Identity{Role: service.AuthRoleUser, OwnerID: outsider.ID, Name: outsider.Name}); err == nil {
		t.Fatalf("outsider imageBytesForIdentity() error = nil")
	}

	req = httptest.NewRequest(http.MethodGet, "/api/images?scope=team&team_id="+url.QueryEscape(teamID), nil)
	req.Header.Set("Authorization", "Bearer "+outsiderKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusNotFound {
		t.Fatalf("outsider team images status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodDelete, "/api/images", strings.NewReader(jsonString(map[string]any{
		"paths":   []string{rel},
		"scope":   "team",
		"team_id": teamID,
	})))
	req.Header.Set("Authorization", "Bearer "+memberKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusForbidden {
		t.Fatalf("member delete team image status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPatch, "/api/images/tags", strings.NewReader(jsonString(map[string]any{
		"path":    rel,
		"tags":    []string{"shared"},
		"scope":   "team",
		"team_id": teamID,
	})))
	req.Header.Set("Authorization", "Bearer "+managerKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("manager update team image tags status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPatch, "/api/images/visibility", strings.NewReader(jsonString(map[string]any{
		"path":       rel,
		"visibility": service.ImageVisibilityPublic,
		"scope":      "team",
		"team_id":    teamID,
	})))
	req.Header.Set("Authorization", "Bearer "+managerKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusForbidden {
		t.Fatalf("manager publish team image status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodDelete, "/api/images", strings.NewReader(jsonString(map[string]any{
		"paths":   []string{rel},
		"scope":   "team",
		"team_id": teamID,
	})))
	req.Header.Set("Authorization", "Bearer "+managerKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("manager delete team image status = %d body = %s", res.Code, res.Body.String())
	}
	var deleted map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &deleted); err != nil {
		t.Fatalf("manager delete team image json: %v", err)
	}
	if deleted["deleted"] != float64(1) || deleted["team_storage"] == nil {
		t.Fatalf("manager delete team image body = %#v", deleted)
	}
}

func TestTextAssetsHTTPPersonalAndPermissions(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	req := httptest.NewRequest(http.MethodGet, "/api/text-assets", nil)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous text assets status = %d body = %s", res.Code, res.Body.String())
	}

	alice := service.AuthOwner{ID: "linuxdo:ta-alice", Name: "Alice", Provider: service.AuthProviderLinuxDo}
	_, aliceKey, err := app.auth.UpsertLinuxDoSession(alice)
	if err != nil {
		t.Fatalf("UpsertLinuxDoSession(alice) error = %v", err)
	}
	bob := service.AuthOwner{ID: "linuxdo:ta-bob", Name: "Bob", Provider: service.AuthProviderLinuxDo}
	_, bobKey, err := app.auth.UpsertLinuxDoSession(bob)
	if err != nil {
		t.Fatalf("UpsertLinuxDoSession(bob) error = %v", err)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/text-assets?scope=public", nil)
	req.Header.Set("Authorization", "Bearer "+aliceKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("invalid scope status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPost, "/api/text-assets", strings.NewReader(jsonString(map[string]any{
		"content": "第一条文本素材\n用于追加到输入框",
	})))
	req.Header.Set("Authorization", "Bearer "+aliceKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("create text asset status = %d body = %s", res.Code, res.Body.String())
	}
	var created map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &created); err != nil {
		t.Fatalf("create text asset json: %v", err)
	}
	item := util.StringMap(created["item"])
	if item["kind"] != service.TextAssetKind || item["name"] != "第一条文本素材" || item["owner_id"] != alice.ID {
		t.Fatalf("created text asset = %#v", item)
	}
	id := util.Clean(item["id"])
	if id == "" {
		t.Fatalf("created text asset id missing: %#v", item)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/text-assets?search="+url.QueryEscape("追加"), nil)
	req.Header.Set("Authorization", "Bearer "+aliceKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("search text assets status = %d body = %s", res.Code, res.Body.String())
	}
	var list map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &list); err != nil {
		t.Fatalf("search text assets json: %v", err)
	}
	if items := util.AsMapSlice(list["items"]); len(items) != 1 || util.Clean(items[0]["id"]) != id {
		t.Fatalf("search text assets items = %#v", list)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/text-assets", nil)
	req.Header.Set("Authorization", "Bearer "+bobKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("bob list text assets status = %d body = %s", res.Code, res.Body.String())
	}
	if err := json.Unmarshal(res.Body.Bytes(), &list); err != nil {
		t.Fatalf("bob list text assets json: %v", err)
	}
	if items := util.AsMapSlice(list["items"]); len(items) != 0 {
		t.Fatalf("bob should not see alice text assets: %#v", list)
	}

	req = httptest.NewRequest(http.MethodPatch, "/api/text-assets/"+url.PathEscape(id), strings.NewReader(jsonString(map[string]any{
		"name":    "已更新",
		"content": "更新后的文本素材",
	})))
	req.Header.Set("Authorization", "Bearer "+aliceKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("update text asset status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodDelete, "/api/text-assets/"+url.PathEscape(id), nil)
	req.Header.Set("Authorization", "Bearer "+bobKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusNotFound {
		t.Fatalf("bob delete text asset status = %d body = %s", res.Code, res.Body.String())
	}
}

func TestTextAssetsHTTPTeamAccessAndManagerWrite(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	owner := service.AuthOwner{ID: "sub2api:ta-owner", Name: "team-owner", Provider: service.AuthProviderSub2API}
	_, ownerKey, err := app.auth.UpsertSub2APISession(owner)
	if err != nil {
		t.Fatalf("UpsertSub2APISession(owner) error = %v", err)
	}
	manager := service.AuthOwner{ID: "sub2api:ta-manager", Name: "team-manager", Provider: service.AuthProviderSub2API}
	_, managerKey, err := app.auth.UpsertSub2APISession(manager)
	if err != nil {
		t.Fatalf("UpsertSub2APISession(manager) error = %v", err)
	}
	member := service.AuthOwner{ID: "sub2api:ta-member", Name: "team-member", Provider: service.AuthProviderSub2API}
	_, memberKey, err := app.auth.UpsertSub2APISession(member)
	if err != nil {
		t.Fatalf("UpsertSub2APISession(member) error = %v", err)
	}
	outsider := service.AuthOwner{ID: "sub2api:ta-outsider", Name: "team-outsider", Provider: service.AuthProviderSub2API}
	_, outsiderKey, err := app.auth.UpsertSub2APISession(outsider)
	if err != nil {
		t.Fatalf("UpsertSub2APISession(outsider) error = %v", err)
	}
	saveTestSub2APIBinding(t, app, owner.ID, "ta-owner@example.com")
	saveTestSub2APIBinding(t, app, manager.ID, "ta-manager@example.com")
	saveTestSub2APIBinding(t, app, member.ID, "ta-member@example.com")
	saveTestSub2APIBinding(t, app, outsider.ID, "ta-outsider@example.com")

	teamID := createHTTPTestTeam(t, app, ownerKey)
	acceptHTTPTestInvite(t, app, managerKey, createHTTPTestInvite(t, app, ownerKey, teamID, "ta-manager@example.com", "manager"))
	acceptHTTPTestInvite(t, app, memberKey, createHTTPTestInvite(t, app, ownerKey, teamID, "ta-member@example.com", "member"))

	req := httptest.NewRequest(http.MethodPost, "/api/text-assets", strings.NewReader(jsonString(map[string]any{
		"scope":   "team",
		"team_id": teamID,
		"content": "成员不能创建",
	})))
	req.Header.Set("Authorization", "Bearer "+memberKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusForbidden {
		t.Fatalf("member create team text asset status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPost, "/api/text-assets", strings.NewReader(jsonString(map[string]any{
		"scope":   "team",
		"team_id": teamID,
		"name":    "团队文本",
		"content": "团队成员可读文本",
	})))
	req.Header.Set("Authorization", "Bearer "+managerKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("manager create team text asset status = %d body = %s", res.Code, res.Body.String())
	}
	var created map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &created); err != nil {
		t.Fatalf("manager create team text asset json: %v", err)
	}
	item := util.StringMap(created["item"])
	id := util.Clean(item["id"])
	if id == "" || item["library_scope"] != service.ImageLibraryScopeTeam || item["team_id"] != teamID {
		t.Fatalf("team text asset = %#v", item)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/text-assets?scope=team&team_id="+url.QueryEscape(teamID), nil)
	req.Header.Set("Authorization", "Bearer "+memberKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("member list team text assets status = %d body = %s", res.Code, res.Body.String())
	}
	var list map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &list); err != nil {
		t.Fatalf("member list team text assets json: %v", err)
	}
	if items := util.AsMapSlice(list["items"]); len(items) != 1 || util.Clean(items[0]["id"]) != id {
		t.Fatalf("member list team text assets = %#v", list)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/text-assets?scope=team&team_id="+url.QueryEscape(teamID), nil)
	req.Header.Set("Authorization", "Bearer "+outsiderKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusNotFound {
		t.Fatalf("outsider list team text assets status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPatch, "/api/text-assets/"+url.PathEscape(id), strings.NewReader(jsonString(map[string]any{
		"scope":   "team",
		"team_id": teamID,
		"content": "成员不能更新",
	})))
	req.Header.Set("Authorization", "Bearer "+memberKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusForbidden {
		t.Fatalf("member update team text asset status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodDelete, "/api/text-assets/"+url.PathEscape(id)+"?scope=team&team_id="+url.QueryEscape(teamID), nil)
	req.Header.Set("Authorization", "Bearer "+managerKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("manager delete team text asset status = %d body = %s", res.Code, res.Body.String())
	}
}

func TestTextAssetCollectionsEndpointCreatesAssignsAndFilters(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()
	alice := service.AuthOwner{ID: "linuxdo:tcol-alice", Name: "Alice", Provider: service.AuthProviderLinuxDo}
	_, aliceKey, err := app.auth.UpsertLinuxDoSession(alice)
	if err != nil {
		t.Fatalf("UpsertLinuxDoSession(alice) error = %v", err)
	}
	bob := service.AuthOwner{ID: "linuxdo:tcol-bob", Name: "Bob", Provider: service.AuthProviderLinuxDo}
	_, bobKey, err := app.auth.UpsertLinuxDoSession(bob)
	if err != nil {
		t.Fatalf("UpsertLinuxDoSession(bob) error = %v", err)
	}

	ids := make([]string, 0, 2)
	for _, content := range []string{"角色提示词", "场景提示词"} {
		req := httptest.NewRequest(http.MethodPost, "/api/text-assets", strings.NewReader(jsonString(map[string]any{"content": content})))
		req.Header.Set("Authorization", "Bearer "+aliceKey)
		res := httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		if res.Code != http.StatusOK {
			t.Fatalf("create text asset status = %d body = %s", res.Code, res.Body.String())
		}
		var payload map[string]any
		if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
			t.Fatalf("create text asset json: %v", err)
		}
		ids = append(ids, util.Clean(util.StringMap(payload["item"])["id"]))
	}

	req := httptest.NewRequest(http.MethodPost, "/api/text-asset-collections", strings.NewReader(`{"name":"角色"}`))
	req.Header.Set("Authorization", "Bearer "+aliceKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("create text collection status = %d body = %s", res.Code, res.Body.String())
	}
	var createPayload map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &createPayload); err != nil {
		t.Fatalf("create text collection json: %v", err)
	}
	collection := util.StringMap(createPayload["item"])
	collectionID := util.Clean(collection["id"])
	if collectionID == "" || collection["name"] != "角色" || util.ToInt(createPayload["unclassified_count"], -1) != 2 {
		t.Fatalf("created text collection = %#v", createPayload)
	}

	req = httptest.NewRequest(http.MethodPatch, "/api/text-asset-collections/items", strings.NewReader(jsonString(map[string]any{"collection_id": collectionID, "ids": []string{ids[0]}})))
	req.Header.Set("Authorization", "Bearer "+aliceKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("assign text collection status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/text-assets?collection_id="+url.QueryEscape(collectionID), nil)
	req.Header.Set("Authorization", "Bearer "+aliceKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("filter text collection status = %d body = %s", res.Code, res.Body.String())
	}
	var listPayload map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &listPayload); err != nil {
		t.Fatalf("filter text collection json: %v", err)
	}
	items := util.AsMapSlice(listPayload["items"])
	if len(items) != 1 || util.Clean(items[0]["id"]) != ids[0] || util.Clean(items[0]["collection_name"]) != "角色" {
		t.Fatalf("text collection filtered items = %#v", listPayload)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/text-assets?collection_id="+url.QueryEscape(service.TextAssetCollectionUnclassifiedID), nil)
	req.Header.Set("Authorization", "Bearer "+aliceKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("filter text unclassified status = %d body = %s", res.Code, res.Body.String())
	}
	if err := json.Unmarshal(res.Body.Bytes(), &listPayload); err != nil {
		t.Fatalf("filter text unclassified json: %v", err)
	}
	items = util.AsMapSlice(listPayload["items"])
	if len(items) != 1 || util.Clean(items[0]["id"]) != ids[1] {
		t.Fatalf("text unclassified filtered items = %#v", listPayload)
	}

	req = httptest.NewRequest(http.MethodPatch, "/api/text-asset-collections/"+url.PathEscape(collectionID), strings.NewReader(`{"name":"场景"}`))
	req.Header.Set("Authorization", "Bearer "+aliceKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("rename text collection status = %d body = %s", res.Code, res.Body.String())
	}
	req = httptest.NewRequest(http.MethodGet, "/api/text-assets?collection_id="+url.QueryEscape(collectionID), nil)
	req.Header.Set("Authorization", "Bearer "+aliceKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("filter renamed text collection status = %d body = %s", res.Code, res.Body.String())
	}
	if err := json.Unmarshal(res.Body.Bytes(), &listPayload); err != nil {
		t.Fatalf("filter renamed text collection json: %v", err)
	}
	items = util.AsMapSlice(listPayload["items"])
	if len(items) != 1 || util.Clean(items[0]["collection_name"]) != "场景" {
		t.Fatalf("renamed text collection items = %#v", listPayload)
	}

	req = httptest.NewRequest(http.MethodDelete, "/api/text-asset-collections/"+url.PathEscape(collectionID), nil)
	req.Header.Set("Authorization", "Bearer "+bobKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusNotFound {
		t.Fatalf("bob delete text collection status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodDelete, "/api/text-asset-collections/"+url.PathEscape(collectionID), nil)
	req.Header.Set("Authorization", "Bearer "+aliceKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("delete text collection status = %d body = %s", res.Code, res.Body.String())
	}
	req = httptest.NewRequest(http.MethodGet, "/api/text-assets?collection_id="+url.QueryEscape(collectionID), nil)
	req.Header.Set("Authorization", "Bearer "+aliceKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("filter deleted text collection status = %d body = %s", res.Code, res.Body.String())
	}
	if err := json.Unmarshal(res.Body.Bytes(), &listPayload); err != nil {
		t.Fatalf("filter deleted text collection json: %v", err)
	}
	if items := util.AsMapSlice(listPayload["items"]); len(items) != 0 {
		t.Fatalf("deleted text collection should clear assignments = %#v", listPayload)
	}
}

func TestTextAssetCollectionsEndpointTeamManagerWrite(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	owner := service.AuthOwner{ID: "sub2api:tcol-owner", Name: "team-owner", Provider: service.AuthProviderSub2API}
	_, ownerKey, err := app.auth.UpsertSub2APISession(owner)
	if err != nil {
		t.Fatalf("UpsertSub2APISession(owner) error = %v", err)
	}
	manager := service.AuthOwner{ID: "sub2api:tcol-manager", Name: "team-manager", Provider: service.AuthProviderSub2API}
	_, managerKey, err := app.auth.UpsertSub2APISession(manager)
	if err != nil {
		t.Fatalf("UpsertSub2APISession(manager) error = %v", err)
	}
	member := service.AuthOwner{ID: "sub2api:tcol-member", Name: "team-member", Provider: service.AuthProviderSub2API}
	_, memberKey, err := app.auth.UpsertSub2APISession(member)
	if err != nil {
		t.Fatalf("UpsertSub2APISession(member) error = %v", err)
	}
	saveTestSub2APIBinding(t, app, owner.ID, "tcol-owner@example.com")
	saveTestSub2APIBinding(t, app, manager.ID, "tcol-manager@example.com")
	saveTestSub2APIBinding(t, app, member.ID, "tcol-member@example.com")

	teamID := createHTTPTestTeam(t, app, ownerKey)
	acceptHTTPTestInvite(t, app, managerKey, createHTTPTestInvite(t, app, ownerKey, teamID, "tcol-manager@example.com", "manager"))
	acceptHTTPTestInvite(t, app, memberKey, createHTTPTestInvite(t, app, ownerKey, teamID, "tcol-member@example.com", "member"))

	req := httptest.NewRequest(http.MethodPost, "/api/text-asset-collections", strings.NewReader(jsonString(map[string]any{
		"scope":   "team",
		"team_id": teamID,
		"name":    "成员分类",
	})))
	req.Header.Set("Authorization", "Bearer "+memberKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusForbidden {
		t.Fatalf("member create team text collection status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPost, "/api/text-asset-collections", strings.NewReader(jsonString(map[string]any{
		"scope":   "team",
		"team_id": teamID,
		"name":    "团队分类",
	})))
	req.Header.Set("Authorization", "Bearer "+managerKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("manager create team text collection status = %d body = %s", res.Code, res.Body.String())
	}
	var created map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &created); err != nil {
		t.Fatalf("manager create team text collection json: %v", err)
	}
	collection := util.StringMap(created["item"])
	if collection["library_scope"] != service.ImageLibraryScopeTeam || collection["team_id"] != teamID {
		t.Fatalf("team text collection = %#v", collection)
	}
	collectionID := util.Clean(collection["id"])

	req = httptest.NewRequest(http.MethodGet, "/api/text-asset-collections?scope=team&team_id="+url.QueryEscape(teamID), nil)
	req.Header.Set("Authorization", "Bearer "+memberKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("member list team text collections status = %d body = %s", res.Code, res.Body.String())
	}
	var list map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &list); err != nil {
		t.Fatalf("member list team text collections json: %v", err)
	}
	if items := util.AsMapSlice(list["items"]); len(items) != 1 || util.Clean(items[0]["id"]) != collectionID {
		t.Fatalf("member list team text collections = %#v", list)
	}
}

func TestManagedImageFilesRequireOwnerOrTeamAccess(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	owner := service.AuthOwner{ID: "linuxdo:123", Name: "alice", Provider: service.AuthProviderLinuxDo}
	_, aliceKey, err := app.auth.UpsertLinuxDoSession(owner)
	if err != nil {
		t.Fatalf("UpsertLinuxDoSession(alice) error = %v", err)
	}
	_, bobKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "bob", service.AuthOwner{ID: "linuxdo:456", Name: "bob", Provider: service.AuthProviderLinuxDo})
	if err != nil {
		t.Fatalf("CreateAPIKey(bob) error = %v", err)
	}

	rel := "2026/05/01/1777664437_f5b9d1d2cd2a380307ca9fb32c1a84d1.png"
	imagePath := filepath.Join(app.config.ImagesDir(), filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(imagePath), 0o755); err != nil {
		t.Fatalf("mkdir image dir: %v", err)
	}
	if err := writeHTTPTestPNG(imagePath); err != nil {
		t.Fatalf("write image: %v", err)
	}
	app.images.RecordGeneratedImages([]string{rel}, owner.ID, owner.Name, service.ImageVisibilityPrivate, service.GeneratedImageMetadata{
		ReferenceImages: []service.GeneratedImageReference{
			{Filename: "private-source.png", ContentType: "image/png", Data: []byte("private-reference")},
		},
	})
	privateDetail, err := app.images.ImageDetail("http://127.0.0.1:8000", rel, service.ImageAccessScope{All: true})
	if err != nil {
		t.Fatalf("private image detail: %v", err)
	}
	privateReferenceURLs, ok := privateDetail["reference_image_urls"].([]string)
	if !ok || len(privateReferenceURLs) != 1 {
		t.Fatalf("private reference urls = %#v", privateDetail)
	}
	parsedPrivateReferenceURL, err := url.Parse(privateReferenceURLs[0])
	if err != nil {
		t.Fatalf("parse private reference url: %v", err)
	}
	privateReferencePath := parsedPrivateReferenceURL.RequestURI()

	req := httptest.NewRequest(http.MethodGet, "/images/2026/05/01", nil)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusNotFound {
		t.Fatalf("image directory listing status = %d body = %q, want 404", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/images/"+rel, nil)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous private image status = %d body = %q, want 401", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, privateReferencePath, nil)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous private reference status = %d body = %q, want 401", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, privateReferencePath, nil)
	req.Header.Set("Authorization", "Bearer "+bobKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusNotFound {
		t.Fatalf("other user private reference status = %d body = %q, want 404", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, privateReferencePath, nil)
	req.Header.Set("Authorization", "Bearer "+aliceKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK || res.Body.String() != "private-reference" {
		t.Fatalf("owner private reference status/body = %d %q", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/images/"+rel, nil)
	req.Header.Set("Authorization", "Bearer "+bobKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusNotFound {
		t.Fatalf("other user private image status = %d body = %q, want 404", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/images/"+rel, nil)
	req.Header.Set("Authorization", "Bearer "+aliceKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("owner private image status = %d body = %q", res.Code, res.Body.String())
	}
	if got := res.Header().Get("Content-Type"); !strings.Contains(got, "image/png") {
		t.Fatalf("owner private image Content-Type = %q, want image/png", got)
	}

	req = httptest.NewRequest(http.MethodGet, "/images/"+rel, nil)
	req.AddCookie(&http.Cookie{Name: authSessionCookieName, Value: aliceKey})
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("owner private image cookie status = %d body = %q", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodHead, "/images/"+rel, nil)
	req.Header.Set("Authorization", "Bearer "+aliceKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("owner private image HEAD status = %d body = %q", res.Code, res.Body.String())
	}
	if res.Body.Len() != 0 {
		t.Fatalf("owner private image HEAD body length = %d, want 0", res.Body.Len())
	}

	req = httptest.NewRequest(http.MethodGet, "/images/"+rel, nil)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous image status after disabled public library = %d body = %q, want 401", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, privateReferencePath, nil)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous reference status after disabled public library = %d body = %q, want 401", res.Code, res.Body.String())
	}

	if _, err := app.images.UpdateImageVisibility(rel, service.ImageVisibilityPublic, service.ImageAccessScope{OwnerID: owner.ID}, service.ImageVisibilityUpdateOptions{SharePromptParams: true, ShareReferences: true}); err == nil {
		t.Fatal("UpdateImageVisibility(public) error = nil")
	}
	req = httptest.NewRequest(http.MethodGet, privateReferencePath, nil)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous reference after rejected public visibility status/body = %d %q, want 401", res.Code, res.Body.String())
	}
}

func TestImageThumbnailsAreGeneratedOnDemand(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	rel := time.Now().Format("2006/01/02") + "/sample.png"
	imagePath := filepath.Join(app.config.ImagesDir(), filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(imagePath), 0o755); err != nil {
		t.Fatalf("mkdir image dir: %v", err)
	}
	if err := writeHTTPTestPNG(imagePath); err != nil {
		t.Fatalf("write image: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/images", nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("/api/images status = %d body = %s", res.Code, res.Body.String())
	}
	var list map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &list); err != nil {
		t.Fatalf("/api/images json: %v", err)
	}
	items := logItems(list)
	if len(items) != 1 {
		t.Fatalf("/api/images items = %#v", list)
	}
	thumbnailURL, _ := items[0]["thumbnail_url"].(string)
	if !strings.Contains(thumbnailURL, "/image-thumbnails/") {
		t.Fatalf("thumbnail_url = %q, want lazy thumbnail route", thumbnailURL)
	}
	previewURL, _ := items[0]["preview_url"].(string)
	if !strings.Contains(previewURL, "/image-previews/") {
		t.Fatalf("preview_url = %q, want lazy preview route", previewURL)
	}
	parsedThumbnailURL, err := url.Parse(thumbnailURL)
	if err != nil {
		t.Fatalf("parse thumbnail URL: %v", err)
	}
	parsedPreviewURL, err := url.Parse(previewURL)
	if err != nil {
		t.Fatalf("parse preview URL: %v", err)
	}
	if !strings.HasSuffix(parsedThumbnailURL.Path, ".jpg") {
		t.Fatalf("thumbnail path = %q, want .jpg suffix", parsedThumbnailURL.Path)
	}
	if !strings.HasSuffix(parsedPreviewURL.Path, ".jpg") {
		t.Fatalf("preview path = %q, want .jpg suffix", parsedPreviewURL.Path)
	}
	if parsedThumbnailURL.Query().Get("v") == "" {
		t.Fatalf("thumbnail URL = %q, want cache-busting query", thumbnailURL)
	}
	if parsedPreviewURL.Query().Get("v") == "" {
		t.Fatalf("preview URL = %q, want cache-busting query", previewURL)
	}
	thumbPath := filepath.Join(app.config.ImageThumbnailsDir(), filepath.FromSlash(rel)+".jpg")
	if _, err := os.Stat(thumbPath); !os.IsNotExist(err) {
		t.Fatalf("/api/images should not create thumbnail synchronously, stat error = %v", err)
	}
	previewPath := filepath.Join(app.config.ImagePreviewsDir(), filepath.FromSlash(rel)+".jpg")
	if _, err := os.Stat(previewPath); !os.IsNotExist(err) {
		t.Fatalf("/api/images should not create preview synchronously, stat error = %v", err)
	}

	req = httptest.NewRequest(http.MethodGet, parsedThumbnailURL.Path, nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("thumbnail status = %d body = %s", res.Code, res.Body.String())
	}
	if res.Body.Len() == 0 {
		t.Fatal("thumbnail body is empty")
	}
	if got := res.Header().Get("Cache-Control"); got != imageThumbnailCacheControl {
		t.Fatalf("thumbnail Cache-Control = %q, want %q", got, imageThumbnailCacheControl)
	}
	if got := res.Header().Get("Content-Type"); !strings.Contains(got, "image/jpeg") {
		t.Fatalf("thumbnail Content-Type = %q, want image/jpeg", got)
	}
	if _, err := os.Stat(thumbPath); err != nil {
		t.Fatalf("thumbnail was not created on demand: %v", err)
	}

	req = httptest.NewRequest(http.MethodGet, parsedPreviewURL.Path, nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("preview status = %d body = %s", res.Code, res.Body.String())
	}
	if res.Body.Len() == 0 {
		t.Fatal("preview body is empty")
	}
	if got := res.Header().Get("Cache-Control"); got != imageThumbnailCacheControl {
		t.Fatalf("preview Cache-Control = %q, want %q", got, imageThumbnailCacheControl)
	}
	if got := res.Header().Get("Content-Type"); !strings.Contains(got, "image/jpeg") {
		t.Fatalf("preview Content-Type = %q, want image/jpeg", got)
	}
	if _, err := os.Stat(previewPath); err != nil {
		t.Fatalf("preview was not created on demand: %v", err)
	}
}

func TestManagedImagesEndpointPaginatesAndKeepsListLightweight(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	rels := []string{
		"2026/04/29/old.png",
		"2026/04/29/middle.png",
		"2026/04/29/new.png",
	}
	baseTime := time.Date(2026, 4, 29, 9, 0, 0, 0, time.UTC)
	for index, rel := range rels {
		imagePath := filepath.Join(app.config.ImagesDir(), filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(imagePath), 0o755); err != nil {
			t.Fatalf("mkdir image dir: %v", err)
		}
		if err := writeHTTPTestPNG(imagePath); err != nil {
			t.Fatalf("write image: %v", err)
		}
		stamp := baseTime.Add(time.Duration(index) * time.Hour)
		if err := os.Chtimes(imagePath, stamp, stamp); err != nil {
			t.Fatalf("chtimes image: %v", err)
		}
	}
	app.images.RecordGeneratedImages(rels, "admin", "Admin", service.ImageVisibilityPrivate, service.GeneratedImageMetadata{
		Prompt: "heavy prompt",
		ReferenceImages: []service.GeneratedImageReference{
			{Filename: "source.png", ContentType: "image/png", Data: []byte("reference")},
		},
	})

	req := httptest.NewRequest(http.MethodGet, "/api/images?page_size=2", nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("/api/images first page status = %d body = %s", res.Code, res.Body.String())
	}
	var first map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &first); err != nil {
		t.Fatalf("first page json: %v", err)
	}
	firstItems := logItems(first)
	if len(firstItems) != 2 || firstItems[0]["path"] != rels[2] || firstItems[1]["path"] != rels[1] {
		t.Fatalf("first page items = %#v", first)
	}
	if firstItems[0]["prompt"] != nil || firstItems[0]["reference_image_urls"] != nil || firstItems[0]["url"] != nil || firstItems[0]["object_url"] != nil || firstItems[0]["object_key"] != nil || firstItems[0]["storage_backend"] != nil {
		t.Fatalf("list item exposed heavy metadata = %#v", firstItems[0])
	}
	previewURL, _ := firstItems[0]["preview_url"].(string)
	if !strings.Contains(previewURL, "/image-previews/") {
		t.Fatalf("preview_url = %q, want lightweight preview route", previewURL)
	}
	thumbnailURL, _ := firstItems[0]["thumbnail_url"].(string)
	if !strings.Contains(thumbnailURL, "/image-thumbnails/") {
		t.Fatalf("thumbnail_url = %q, want thumbnail route", thumbnailURL)
	}
	cursor, _ := first["next_cursor"].(string)
	if cursor == "" || first["has_more"] != true {
		t.Fatalf("first page cursor = %#v", first)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/images?page_size=2&cursor="+url.QueryEscape(cursor), nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("/api/images second page status = %d body = %s", res.Code, res.Body.String())
	}
	var second map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &second); err != nil {
		t.Fatalf("second page json: %v", err)
	}
	secondItems := logItems(second)
	if len(secondItems) != 1 || secondItems[0]["path"] != rels[0] || second["has_more"] != false {
		t.Fatalf("second page items = %#v", second)
	}
}

func TestManagedImageDetailEndpointReturnsReusableMetadata(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	rel := "2026/04/29/detail.png"
	imagePath := filepath.Join(app.config.ImagesDir(), filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(imagePath), 0o755); err != nil {
		t.Fatalf("mkdir image dir: %v", err)
	}
	if err := writeHTTPTestPNG(imagePath); err != nil {
		t.Fatalf("write image: %v", err)
	}
	app.images.RecordGeneratedImages([]string{rel}, "admin", "Admin", service.ImageVisibilityPrivate, service.GeneratedImageMetadata{
		Prompt: "detail prompt",
		Model:  "gpt-image-2",
	})

	req := httptest.NewRequest(http.MethodGet, "/api/images/detail?path="+url.QueryEscape(rel), nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("/api/images/detail status = %d body = %s", res.Code, res.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("detail json: %v", err)
	}
	item, _ := body["item"].(map[string]any)
	if item["path"] != rel || item["prompt"] != "detail prompt" || item["model"] != "gpt-image-2" || item["url"] == nil {
		t.Fatalf("detail item = %#v", item)
	}
	if previewURL, _ := item["preview_url"].(string); !strings.Contains(previewURL, "/image-previews/") {
		t.Fatalf("detail preview_url = %q, want preview route", previewURL)
	}
}

func TestManagedImageThumbnailsRequireOwnerOrTeamAccess(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	owner := service.AuthOwner{ID: "linuxdo:123", Name: "alice", Provider: service.AuthProviderLinuxDo}
	_, aliceKey, err := app.auth.UpsertLinuxDoSession(owner)
	if err != nil {
		t.Fatalf("UpsertLinuxDoSession(alice) error = %v", err)
	}
	_, bobKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "bob", service.AuthOwner{ID: "linuxdo:456", Name: "bob", Provider: service.AuthProviderLinuxDo})
	if err != nil {
		t.Fatalf("CreateAPIKey(bob) error = %v", err)
	}

	rel := "2026/05/01/private.png"
	imagePath := filepath.Join(app.config.ImagesDir(), filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(imagePath), 0o755); err != nil {
		t.Fatalf("mkdir image dir: %v", err)
	}
	if err := writeHTTPTestPNG(imagePath); err != nil {
		t.Fatalf("write image: %v", err)
	}
	app.images.RecordGeneratedImages([]string{rel}, owner.ID, owner.Name, service.ImageVisibilityPrivate)
	thumbnailPath := "/image-thumbnails/" + rel + ".jpg"
	previewPath := "/image-previews/" + rel + ".jpg"

	for _, assetPath := range []string{thumbnailPath, previewPath} {
		req := httptest.NewRequest(http.MethodGet, assetPath, nil)
		res := httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		if res.Code != http.StatusUnauthorized {
			t.Fatalf("anonymous private asset %s status = %d body = %q, want 401", assetPath, res.Code, res.Body.String())
		}

		req = httptest.NewRequest(http.MethodGet, assetPath, nil)
		req.Header.Set("Authorization", "Bearer "+bobKey)
		res = httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		if res.Code != http.StatusNotFound {
			t.Fatalf("other user private asset %s status = %d body = %q, want 404", assetPath, res.Code, res.Body.String())
		}

		req = httptest.NewRequest(http.MethodGet, assetPath, nil)
		req.Header.Set("Authorization", "Bearer "+aliceKey)
		res = httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		if res.Code != http.StatusOK {
			t.Fatalf("owner private asset %s status = %d body = %q", assetPath, res.Code, res.Body.String())
		}
		if got := res.Header().Get("Content-Type"); !strings.Contains(got, "image/jpeg") {
			t.Fatalf("owner private asset %s Content-Type = %q, want image/jpeg", assetPath, got)
		}

		req = httptest.NewRequest(http.MethodGet, assetPath, nil)
		req.AddCookie(&http.Cookie{Name: authSessionCookieName, Value: aliceKey})
		res = httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		if res.Code != http.StatusOK {
			t.Fatalf("owner private asset cookie %s status = %d body = %q", assetPath, res.Code, res.Body.String())
		}

		req = httptest.NewRequest(http.MethodGet, assetPath, nil)
		res = httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		if res.Code != http.StatusUnauthorized {
			t.Fatalf("anonymous asset after disabled public library %s status = %d body = %q, want 401", assetPath, res.Code, res.Body.String())
		}
	}
}

func TestAuthSessionCookieLifecycle(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	req := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(`{"username":"`+testAdminUsername+`","password":"`+testAdminPassword+`"}`))
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("login status = %d body = %s", res.Code, res.Body.String())
	}
	cookie := findResponseCookie(res.Result(), authSessionCookieName)
	if cookie == nil || cookie.Value == "" || cookie.Path != "/" || !cookie.HttpOnly {
		t.Fatalf("login cookie = %#v", cookie)
	}
	if got := cookie.SameSite; got != http.SameSiteLaxMode {
		t.Fatalf("login cookie SameSite = %v, want Lax", got)
	}

	req = httptest.NewRequest(http.MethodPost, "/auth/logout", nil)
	req.AddCookie(cookie)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("logout status = %d body = %s", res.Code, res.Body.String())
	}
	cleared := findResponseCookie(res.Result(), authSessionCookieName)
	if cleared == nil || cleared.MaxAge >= 0 || cleared.Value != "" {
		t.Fatalf("logout cookie = %#v", cleared)
	}
}

func TestSub2APIEmbeddedSessionCookieUsesIframeCompatiblePolicy(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/auth/sub2api/launch", nil)
	res := httptest.NewRecorder()

	setAuthSessionCookie(res, req, "session-token")

	cookie := findResponseCookie(res.Result(), authSessionCookieName)
	if cookie == nil || cookie.Value != "session-token" || cookie.Path != "/" || !cookie.HttpOnly {
		t.Fatalf("embedded cookie = %#v", cookie)
	}
	if !cookie.Secure {
		t.Fatalf("embedded cookie Secure = false, want true")
	}
	if got := cookie.SameSite; got != http.SameSiteNoneMode {
		t.Fatalf("embedded cookie SameSite = %v, want None", got)
	}
}

func TestAuthSessionCookieReadsForwardedProtoList(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/auth/login", nil)
	req.Header.Set("X-Forwarded-Proto", "https,http")
	res := httptest.NewRecorder()

	setAuthSessionCookie(res, req, "session-token")

	cookie := findResponseCookie(res.Result(), authSessionCookieName)
	if cookie == nil {
		t.Fatalf("login cookie missing")
	}
	if !cookie.Secure {
		t.Fatalf("login cookie Secure = false, want true")
	}
	if got := cookie.SameSite; got != http.SameSiteLaxMode {
		t.Fatalf("login cookie SameSite = %v, want Lax", got)
	}
}

func TestLoginAllowsCredentialedLoopbackFrontend(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	req := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(`{"username":"`+testAdminUsername+`","password":"`+testAdminPassword+`"}`))
	req.Host = "127.0.0.1:8000"
	req.Header.Set("Origin", "http://localhost:5173")
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("login status = %d body = %s", res.Code, res.Body.String())
	}
	if got := res.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:5173" {
		t.Fatalf("Access-Control-Allow-Origin = %q, want frontend origin", got)
	}
	if got := res.Header().Get("Access-Control-Allow-Credentials"); got != "true" {
		t.Fatalf("Access-Control-Allow-Credentials = %q, want true", got)
	}
	if cookie := findResponseCookie(res.Result(), authSessionCookieName); cookie == nil || cookie.Value == "" {
		t.Fatalf("login cookie = %#v", cookie)
	}
}

func TestCredentialedLoginPreflightAllowsContentType(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	req := httptest.NewRequest(http.MethodOptions, "/auth/login", nil)
	req.Host = "127.0.0.1:8000"
	req.Header.Set("Origin", "http://127.0.0.1:5173")
	req.Header.Set("Access-Control-Request-Method", http.MethodPost)
	req.Header.Set("Access-Control-Request-Headers", "content-type")
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusNoContent {
		t.Fatalf("preflight status = %d body = %s", res.Code, res.Body.String())
	}
	if got := res.Header().Get("Access-Control-Allow-Origin"); got != "http://127.0.0.1:5173" {
		t.Fatalf("Access-Control-Allow-Origin = %q, want request origin", got)
	}
	if got := res.Header().Get("Access-Control-Allow-Credentials"); got != "true" {
		t.Fatalf("Access-Control-Allow-Credentials = %q, want true", got)
	}
	if got := res.Header().Get("Access-Control-Allow-Headers"); got != "content-type" {
		t.Fatalf("Access-Control-Allow-Headers = %q, want content-type", got)
	}
}

func TestCredentialedImageVisibilityPreflightAllowsPatchAuthorization(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	req := httptest.NewRequest(http.MethodOptions, "/api/images/visibility", nil)
	req.Host = "127.0.0.1:8000"
	req.Header.Set("Origin", "http://localhost:5173")
	req.Header.Set("Access-Control-Request-Method", http.MethodPatch)
	req.Header.Set("Access-Control-Request-Headers", "authorization,content-type")
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusNoContent {
		t.Fatalf("preflight status = %d body = %s", res.Code, res.Body.String())
	}
	if got := res.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:5173" {
		t.Fatalf("Access-Control-Allow-Origin = %q, want request origin", got)
	}
	if got := res.Header().Get("Access-Control-Allow-Credentials"); got != "true" {
		t.Fatalf("Access-Control-Allow-Credentials = %q, want true", got)
	}
	if got := res.Header().Get("Access-Control-Allow-Methods"); got != http.MethodPatch {
		t.Fatalf("Access-Control-Allow-Methods = %q, want PATCH", got)
	}
	if got := res.Header().Get("Access-Control-Allow-Headers"); got != "authorization,content-type" {
		t.Fatalf("Access-Control-Allow-Headers = %q, want authorization,content-type", got)
	}
}

func TestImageThumbnailRejectsTraversal(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	outsideThumbnailRoot := filepath.Join(app.config.DataDir, "secret.png.jpg")
	if err := os.WriteFile(outsideThumbnailRoot, []byte("secret"), 0o644); err != nil {
		t.Fatalf("write outside thumbnail root: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/image-thumbnails/../secret.png.jpg", nil)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusNotFound {
		t.Fatalf("thumbnail traversal status = %d body = %q, want 404", res.Code, res.Body.String())
	}
}

func TestLinuxDoUserCanManageOwnKeys(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	owner := service.AuthOwner{ID: "linuxdo:123", Name: "linuxdo_user", Provider: service.AuthProviderLinuxDo, LinuxDoLevel: "3"}
	_, sessionKey, err := app.auth.UpsertLinuxDoSession(owner)
	if err != nil {
		t.Fatalf("UpsertLinuxDoSession() error = %v", err)
	}
	_, otherKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "other user key", service.AuthOwner{ID: "linuxdo:456", Name: "other", Provider: service.AuthProviderLinuxDo})
	if err != nil || otherKey == "" {
		t.Fatalf("CreateAPIKey(other) key=%q err=%v", otherKey, err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/auth/users", nil)
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("linuxdo initial list status = %d body = %s", res.Code, res.Body.String())
	}
	var list map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &list); err != nil {
		t.Fatalf("initial list json: %v", err)
	}
	if rawItems, ok := list["items"].([]any); !ok || len(rawItems) != 0 {
		t.Fatalf("linuxdo initial list should be empty array, got %#v", list)
	}

	req = httptest.NewRequest(http.MethodPost, "/api/auth/users", strings.NewReader(`{"name":"linuxdo api"}`))
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("linuxdo create key status = %d body = %s", res.Code, res.Body.String())
	}
	var created map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &created); err != nil {
		t.Fatalf("create key json: %v", err)
	}
	item, _ := created["item"].(map[string]any)
	if item["owner_id"] != owner.ID || item["provider"] != service.AuthProviderLinuxDo {
		t.Fatalf("created key owner = %#v", item)
	}
	firstKey, _ := created["key"].(string)
	firstID, _ := item["id"].(string)

	req = httptest.NewRequest(http.MethodPost, "/api/auth/users", strings.NewReader(`{"name":"linuxdo api refreshed"}`))
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("linuxdo reset key status = %d body = %s", res.Code, res.Body.String())
	}
	if err := json.Unmarshal(res.Body.Bytes(), &created); err != nil {
		t.Fatalf("reset key json: %v", err)
	}
	item, _ = created["item"].(map[string]any)
	resetKey, _ := created["key"].(string)
	if item["id"] != firstID || resetKey == "" || resetKey == firstKey {
		t.Fatalf("reset key did not rotate in place: item=%#v key=%q first=%q", item, resetKey, firstKey)
	}
	if app.auth.Authenticate(firstKey) != nil {
		t.Fatal("old Linuxdo API key still authenticated after reset")
	}

	req = httptest.NewRequest(http.MethodGet, "/api/auth/users", nil)
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("linuxdo list keys status = %d body = %s", res.Code, res.Body.String())
	}
	if err := json.Unmarshal(res.Body.Bytes(), &list); err != nil {
		t.Fatalf("list keys json: %v", err)
	}
	if items := logItems(list); len(items) != 1 || items[0]["owner_id"] != owner.ID {
		t.Fatalf("linuxdo scoped list = %#v", list)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/auth/users", nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("admin list keys status = %d body = %s", res.Code, res.Body.String())
	}
	if err := json.Unmarshal(res.Body.Bytes(), &list); err != nil {
		t.Fatalf("admin list json: %v", err)
	}
	if items := logItems(list); len(items) != 2 {
		t.Fatalf("admin should see all API keys, got %#v", list)
	}

	_, unownedKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "legacy user", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey(unowned) error = %v", err)
	}
	req = httptest.NewRequest(http.MethodPost, "/api/auth/users", strings.NewReader(`{"name":"should fail"}`))
	req.Header.Set("Authorization", "Bearer "+unownedKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusForbidden {
		t.Fatalf("unowned user key manage status = %d body = %s", res.Code, res.Body.String())
	}
}

func TestProfileAPIKeyIsPersonalAndPermissionIndependent(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	user, _, err := app.auth.RegisterPasswordUser("alice", "Password123", "Alice")
	if err != nil {
		t.Fatalf("RegisterPasswordUser() error = %v", err)
	}
	role, err := app.auth.CreateRole(map[string]any{
		"name":            "creative only",
		"menu_paths":      []string{"/image"},
		"api_permissions": []string{service.APIPermissionKey("GET", "/v1/models")},
	})
	if err != nil {
		t.Fatalf("CreateRole() error = %v", err)
	}
	if updated := app.auth.UpdateUser(user.ID, map[string]any{"role_id": role["id"]}); updated == nil {
		t.Fatal("UpdateUser(role) returned nil")
	}
	_, userSession, err := app.auth.LoginPassword("alice", "Password123")
	if err != nil {
		t.Fatalf("LoginPassword(user) error = %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/auth/users", nil)
	req.Header.Set("Authorization", "Bearer "+userSession)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusForbidden {
		t.Fatalf("restricted user /api/auth/users status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/profile/api-key", nil)
	req.Header.Set("Authorization", "Bearer "+userSession)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("profile key list status = %d body = %s", res.Code, res.Body.String())
	}
	var list map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &list); err != nil {
		t.Fatalf("profile key list json: %v", err)
	}
	if items := logItems(list); len(items) != 0 {
		t.Fatalf("new profile key list should be empty: %#v", list)
	}

	req = httptest.NewRequest(http.MethodPost, "/api/profile/api-key", strings.NewReader(`{"name":"Alice API"}`))
	req.Header.Set("Authorization", "Bearer "+userSession)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("profile key create status = %d body = %s", res.Code, res.Body.String())
	}
	var created map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &created); err != nil {
		t.Fatalf("profile key create json: %v", err)
	}
	item, _ := created["item"].(map[string]any)
	firstID, _ := item["id"].(string)
	firstKey, _ := created["key"].(string)
	if firstID == "" || firstKey == "" || item["owner_id"] != user.ID || item["role"] != service.AuthRoleUser {
		t.Fatalf("profile key create body = %#v", created)
	}

	req = httptest.NewRequest(http.MethodPost, "/api/profile/api-key", strings.NewReader(`{"name":"Alice API rotated"}`))
	req.Header.Set("Authorization", "Bearer "+userSession)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("profile key rotate status = %d body = %s", res.Code, res.Body.String())
	}
	if err := json.Unmarshal(res.Body.Bytes(), &created); err != nil {
		t.Fatalf("profile key rotate json: %v", err)
	}
	item, _ = created["item"].(map[string]any)
	rotatedKey, _ := created["key"].(string)
	if item["id"] != firstID || rotatedKey == "" || rotatedKey == firstKey {
		t.Fatalf("profile key rotate body = %#v first=%q", created, firstKey)
	}
	if app.auth.Authenticate(firstKey) != nil {
		t.Fatal("old profile API key still authenticated after rotation")
	}
	if identity := app.auth.Authenticate(rotatedKey); identity == nil || identity.ID != user.ID || identity.RoleID != role["id"] {
		t.Fatalf("rotated profile API identity = %#v", identity)
	}

	req = httptest.NewRequest(http.MethodPost, "/api/profile/api-key", strings.NewReader(`{"name":"Admin API"}`))
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("admin profile key create status = %d body = %s", res.Code, res.Body.String())
	}
	if err := json.Unmarshal(res.Body.Bytes(), &created); err != nil {
		t.Fatalf("admin profile key create json: %v", err)
	}
	adminKey, _ := created["key"].(string)
	item, _ = created["item"].(map[string]any)
	if adminKey == "" || item["role"] != service.AuthRoleAdmin || item["owner_id"] != service.AuthRoleAdmin {
		t.Fatalf("admin profile key body = %#v", created)
	}
	if identity := app.auth.Authenticate(adminKey); identity == nil || identity.Role != service.AuthRoleAdmin {
		t.Fatalf("admin profile API identity = %#v", identity)
	}
}

func TestProfilePromptFavoritesArePersonalAndPermissionIndependent(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	user, _, err := app.auth.RegisterPasswordUser("alice", "Password123", "Alice")
	if err != nil {
		t.Fatalf("RegisterPasswordUser(alice) error = %v", err)
	}
	role, err := app.auth.CreateRole(map[string]any{
		"name":            "models only",
		"menu_paths":      []string{"/image"},
		"api_permissions": []string{service.APIPermissionKey("GET", "/v1/models")},
	})
	if err != nil {
		t.Fatalf("CreateRole() error = %v", err)
	}
	if updated := app.auth.UpdateUser(user.ID, map[string]any{"role_id": role["id"]}); updated == nil {
		t.Fatal("UpdateUser(role) returned nil")
	}
	_, aliceToken, err := app.auth.LoginPassword("alice", "Password123")
	if err != nil {
		t.Fatalf("LoginPassword(alice) error = %v", err)
	}

	other, otherToken, err := app.auth.RegisterPasswordUser("bob", "Password123", "Bob")
	if err != nil {
		t.Fatalf("RegisterPasswordUser(bob) error = %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/profile/prompt-favorites", nil)
	req.Header.Set("Authorization", "Bearer "+aliceToken)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("initial list status = %d body = %s", res.Code, res.Body.String())
	}
	var list map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &list); err != nil {
		t.Fatalf("initial list json: %v", err)
	}
	if items := logItems(list); len(items) != 0 {
		t.Fatalf("initial list should be empty: %#v", list)
	}

	body := `{
		"prompt_id":"banana-prompt-quicker:title:author:1",
		"source":"banana-prompt-quicker",
		"title":"Prompt A",
		"preview":"https://example.test/a.png",
		"reference_image_urls":["https://example.test/ref.png"],
		"prompt":"draw a cat",
		"author":"Alice",
		"mode":"edit",
		"category":"Animals",
		"sub_category":"Cats",
		"source_label":"banana-prompt-quicker",
		"is_nsfw":false,
		"localizations":{"zh-CN":{"title":"提示词 A","prompt":"画猫","category":"动物","sub_category":"猫"}}
	}`
	req = httptest.NewRequest(http.MethodPost, "/api/profile/prompt-favorites", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+aliceToken)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("create favorite status = %d body = %s", res.Code, res.Body.String())
	}
	var created map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &created); err != nil {
		t.Fatalf("create favorite json: %v", err)
	}
	item, _ := created["item"].(map[string]any)
	favoriteID, _ := item["id"].(string)
	if favoriteID == "" || item["title"] != "Prompt A" || item["prompt_id"] != "banana-prompt-quicker:title:author:1" {
		t.Fatalf("create favorite body = %#v", created)
	}
	if items := logItems(created); len(items) != 1 {
		t.Fatalf("created items length = %d body = %#v", len(items), created)
	}

	req = httptest.NewRequest(http.MethodPost, "/api/profile/prompt-favorites", strings.NewReader(strings.Replace(body, "Prompt A", "Prompt A Updated", 1)))
	req.Header.Set("Authorization", "Bearer "+aliceToken)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("duplicate favorite status = %d body = %s", res.Code, res.Body.String())
	}
	if err := json.Unmarshal(res.Body.Bytes(), &created); err != nil {
		t.Fatalf("duplicate favorite json: %v", err)
	}
	if items := logItems(created); len(items) != 1 || items[0]["title"] != "Prompt A Updated" {
		t.Fatalf("duplicate favorite should update in place: %#v", created)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/profile/prompt-favorites", nil)
	req.Header.Set("Authorization", "Bearer "+otherToken)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("other list status = %d body = %s", res.Code, res.Body.String())
	}
	if err := json.Unmarshal(res.Body.Bytes(), &list); err != nil {
		t.Fatalf("other list json: %v", err)
	}
	if items := logItems(list); len(items) != 0 {
		t.Fatalf("other user saw favorites, user=%s other=%s list=%#v", user.ID, other.ID, list)
	}

	req = httptest.NewRequest(http.MethodDelete, "/api/profile/prompt-favorites/"+favoriteID, nil)
	req.Header.Set("Authorization", "Bearer "+otherToken)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusNotFound {
		t.Fatalf("other delete status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodDelete, "/api/profile/prompt-favorites/"+favoriteID, nil)
	req.Header.Set("Authorization", "Bearer "+aliceToken)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("delete favorite status = %d body = %s", res.Code, res.Body.String())
	}
	if err := json.Unmarshal(res.Body.Bytes(), &list); err != nil {
		t.Fatalf("delete favorite json: %v", err)
	}
	if items := logItems(list); len(items) != 0 {
		t.Fatalf("favorite remained after delete: %#v", list)
	}

	_, unownedKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "legacy user", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey(unowned) error = %v", err)
	}
	req = httptest.NewRequest(http.MethodGet, "/api/profile/prompt-favorites", nil)
	req.Header.Set("Authorization", "Bearer "+unownedKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusForbidden {
		t.Fatalf("unowned key list status = %d body = %s", res.Code, res.Body.String())
	}
}

func TestAdminUsersManageLinuxDoUsers(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	owner := service.AuthOwner{ID: "linuxdo:123", Name: "linuxdo_user", Provider: service.AuthProviderLinuxDo, LinuxDoLevel: "3"}
	_, sessionKey, err := app.auth.UpsertLinuxDoSession(owner)
	if err != nil {
		t.Fatalf("UpsertLinuxDoSession() error = %v", err)
	}
	_, ownerAPIKey, err := app.auth.UpsertAPIKeyForOwner("", owner)
	if err != nil {
		t.Fatalf("UpsertAPIKeyForOwner() error = %v", err)
	}
	local, localKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "local user", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey(local) error = %v", err)
	}
	localID, _ := local["id"].(string)
	app.logs.Add("文生图调用完成", map[string]any{
		"subject_id":  owner.ID,
		"key_id":      "linuxdo-session",
		"status":      "success",
		"endpoint":    "/v1/images/generations",
		"duration_ms": 120,
		"urls":        []string{"https://example.test/a.png", "https://example.test/b.png"},
	})
	app.logs.Add("文生图调用失败", map[string]any{
		"subject_id": owner.ID,
		"key_id":     "linuxdo-session",
		"status":     "failed",
		"endpoint":   "/v1/images/generations",
	})
	app.logs.Add("图生图调用完成", map[string]any{
		"key_id":   localID,
		"status":   "success",
		"endpoint": "/api/creation-tasks/image-edits",
	})

	req := httptest.NewRequest(http.MethodGet, "/api/admin/users", nil)
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusForbidden {
		t.Fatalf("linuxdo admin users status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/admin/users", nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("admin users status = %d body = %s", res.Code, res.Body.String())
	}
	var list map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &list); err != nil {
		t.Fatalf("admin users json: %v", err)
	}
	linuxdoUser := findHTTPItem(logItems(list), owner.ID)
	if linuxdoUser == nil || linuxdoUser["provider"] != service.AuthProviderLinuxDo || linuxdoUser["has_session"] != true || linuxdoUser["has_api_key"] != true {
		t.Fatalf("linuxdo managed user = %#v in %#v", linuxdoUser, list)
	}
	if linuxdoUser["linuxdo_level"] != "3" {
		t.Fatalf("linuxdo level = %#v", linuxdoUser)
	}
	localUser := findHTTPItem(logItems(list), localID)
	if localUser == nil || localUser["provider"] != service.AuthProviderLocal || localUser["has_api_key"] != true {
		t.Fatalf("local managed user = %#v in %#v", localUser, list)
	}
	if linuxdoUser["call_count"] != float64(2) || linuxdoUser["success_count"] != float64(1) || linuxdoUser["failure_count"] != float64(1) || linuxdoUser["quota_used"] != float64(2) {
		t.Fatalf("linuxdo usage stats = %#v", linuxdoUser)
	}
	if curve, ok := linuxdoUser["usage_curve"].([]any); !ok || len(curve) != 14 {
		t.Fatalf("linuxdo usage curve = %#v", linuxdoUser["usage_curve"])
	}
	if localUser["call_count"] != float64(1) || localUser["quota_used"] != float64(1) {
		t.Fatalf("local usage stats = %#v", localUser)
	}

	req = httptest.NewRequest(http.MethodPost, "/api/admin/users", strings.NewReader(`{"username":"created_local","name":"Created Local","password":"Password123","enabled":true}`))
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("create password user status = %d body = %s", res.Code, res.Body.String())
	}
	var created map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &created); err != nil {
		t.Fatalf("create password user json: %v", err)
	}
	createdItem, _ := created["item"].(map[string]any)
	if createdItem["username"] != "created_local" || createdItem["name"] != "Created Local" || createdItem["has_api_key"] != false || createdItem["has_session"] != false {
		t.Fatalf("create password user body = %#v", created)
	}
	if _, ok := created["key"]; ok {
		t.Fatalf("password user creation should not issue an API key: %#v", created)
	}
	createdID, _ := createdItem["id"].(string)
	createdPath := "/api/admin/users/" + url.PathEscape(createdID)

	req = httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(`{"username":"created_local","password":"Password123"}`))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("created password user login status = %d body = %s", res.Code, res.Body.String())
	}
	var createdLogin map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &createdLogin); err != nil {
		t.Fatalf("created password user login json: %v", err)
	}
	if createdLogin["subject_id"] != createdID || createdLogin["name"] != "Created Local" {
		t.Fatalf("created password user login body = %#v", createdLogin)
	}

	req = httptest.NewRequest(http.MethodGet, createdPath+"/key", nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusNotFound {
		t.Fatalf("initial password user key reveal status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPost, createdPath+"/reset-key", strings.NewReader(`{"name":"rotated local"}`))
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("reset local managed key status = %d body = %s", res.Code, res.Body.String())
	}
	var reset map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &reset); err != nil {
		t.Fatalf("reset local managed key json: %v", err)
	}
	rotatedLocalKey, _ := reset["key"].(string)
	if rotatedLocalKey == "" {
		t.Fatalf("reset local managed key body = %#v", reset)
	}
	if identity := app.auth.Authenticate(rotatedLocalKey); identity == nil || identity.ID != createdID {
		t.Fatalf("rotated local managed key identity = %#v", identity)
	}

	ownerPath := "/api/admin/users/" + url.PathEscape(owner.ID)
	req = httptest.NewRequest(http.MethodPost, ownerPath+"/reset-key", strings.NewReader(`{"name":"managed token"}`))
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusForbidden {
		t.Fatalf("reset linuxdo managed key status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, ownerPath+"/key", nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusForbidden {
		t.Fatalf("reveal linuxdo managed key status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPost, ownerPath, strings.NewReader(`{"enabled":false}`))
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("disable managed user status = %d body = %s", res.Code, res.Body.String())
	}
	if app.auth.Authenticate(sessionKey) != nil || app.auth.Authenticate(ownerAPIKey) != nil {
		t.Fatal("disabled linuxdo user credentials still authenticate")
	}
	if app.auth.Authenticate(localKey) == nil {
		t.Fatal("disabling linuxdo user should not affect local user")
	}
	disabledLoginItem, disabledLoginKey, err := app.auth.UpsertLinuxDoSession(owner)
	if err != nil {
		t.Fatalf("UpsertLinuxDoSession(disabled) error = %v", err)
	}
	if disabledLoginItem["enabled"] != false {
		t.Fatalf("disabled linuxdo login item = %#v", disabledLoginItem)
	}
	if app.auth.Authenticate(disabledLoginKey) != nil {
		t.Fatal("disabled linuxdo user authenticated after a new login")
	}

	req = httptest.NewRequest(http.MethodPost, ownerPath, strings.NewReader(`{"enabled":true}`))
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("enable managed user status = %d body = %s", res.Code, res.Body.String())
	}
	if app.auth.Authenticate(disabledLoginKey) == nil || app.auth.Authenticate(ownerAPIKey) == nil {
		t.Fatal("enabled linuxdo user credentials should authenticate")
	}

	req = httptest.NewRequest(http.MethodDelete, ownerPath, nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("delete managed user status = %d body = %s", res.Code, res.Body.String())
	}
	if app.auth.Authenticate(disabledLoginKey) != nil || app.auth.Authenticate(ownerAPIKey) != nil {
		t.Fatal("deleted linuxdo user credentials still authenticate")
	}
	if app.auth.Authenticate(localKey) == nil {
		t.Fatal("deleting linuxdo user should not affect local user")
	}
	if err := json.Unmarshal(res.Body.Bytes(), &list); err != nil {
		t.Fatalf("delete managed user json: %v", err)
	}
	if findHTTPItem(logItems(list), owner.ID) != nil {
		t.Fatalf("deleted linuxdo user still listed: %#v", list)
	}
}

func TestManagedUsersDefaultSortsByCreatedAtBeforePagination(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/admin/users?page=1&page_size=2", nil)
	query, err := parseManagedUsersQuery(req)
	if err != nil {
		t.Fatalf("parseManagedUsersQuery() error = %v", err)
	}
	if query.SortBy != "created_at" || query.SortOrder != "desc" {
		t.Fatalf("default sort = %s %s, want created_at desc", query.SortBy, query.SortOrder)
	}

	items := []map[string]any{
		{"id": "user_z", "created_at": "2026-01-01 10:00:00"},
		{"id": "user_a", "created_at": "2026-01-03 10:00:00"},
		{"id": "user_m", "created_at": "2026-01-02 10:00:00"},
	}
	sortManagedUsers(items, query)
	start := (query.Page - 1) * query.PageSize
	pageItems := items[start : start+query.PageSize]
	got := []string{util.Clean(pageItems[0]["id"]), util.Clean(pageItems[1]["id"])}
	want := []string{"user_a", "user_m"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("default page ids = %#v, want %#v; sorted items = %#v", got, want, items)
	}
}

func TestAdminUsersListPaginationAndFilters(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	enabledOne, err := app.auth.CreatePasswordUser("enabled_one", "Password123", "Enabled One", service.DefaultManagedRoleID, true)
	if err != nil {
		t.Fatalf("CreatePasswordUser(enabled_one) error = %v", err)
	}
	disabledOne, err := app.auth.CreatePasswordUser("disabled_one", "Password123", "Disabled One", service.DefaultManagedRoleID, false)
	if err != nil {
		t.Fatalf("CreatePasswordUser(disabled_one) error = %v", err)
	}
	enabledTwo, err := app.auth.CreatePasswordUser("enabled_two", "Password123", "Enabled Two", service.DefaultManagedRoleID, true)
	if err != nil {
		t.Fatalf("CreatePasswordUser(enabled_two) error = %v", err)
	}
	defaultUsers := []map[string]any{enabledOne, disabledOne, enabledTwo}
	sort.SliceStable(defaultUsers, func(i, j int) bool {
		leftCreated := util.Clean(defaultUsers[i]["created_at"])
		rightCreated := util.Clean(defaultUsers[j]["created_at"])
		if leftCreated != rightCreated {
			return leftCreated > rightCreated
		}
		return util.Clean(defaultUsers[i]["id"]) > util.Clean(defaultUsers[j]["id"])
	})
	expectedDefaultIDs := []string{
		util.Clean(defaultUsers[0]["id"]),
		util.Clean(defaultUsers[1]["id"]),
		util.Clean(defaultUsers[2]["id"]),
	}

	req := httptest.NewRequest(http.MethodGet, "/api/admin/users?page=1&page_size=3", nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("default sorted users status = %d body = %s", res.Code, res.Body.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
		t.Fatalf("default sorted users json: %v", err)
	}
	items := logItems(payload)
	if len(items) != len(expectedDefaultIDs) || payload["sort_by"] != "created_at" || payload["sort_order"] != "desc" {
		t.Fatalf("default sorted metadata/items = %#v", payload)
	}
	for index, item := range items {
		if item["id"] != expectedDefaultIDs[index] {
			t.Fatalf("default sorted ids = %#v, want %#v", items, expectedDefaultIDs)
		}
	}

	req = httptest.NewRequest(http.MethodGet, "/api/admin/users?page=2&page_size=2", nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("paged users status = %d body = %s", res.Code, res.Body.String())
	}
	payload = map[string]any{}
	if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
		t.Fatalf("paged users json: %v", err)
	}
	if payload["total"] != float64(3) || payload["page"] != float64(2) || payload["page_size"] != float64(2) || payload["total_pages"] != float64(2) {
		t.Fatalf("paged metadata = %#v", payload)
	}
	if items := logItems(payload); len(items) != 1 {
		t.Fatalf("paged items length = %d payload = %#v", len(items), payload)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/admin/users?page=1&page_size=3&sort_by=username&sort_order=asc", nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("username sorted users status = %d body = %s", res.Code, res.Body.String())
	}
	payload = map[string]any{}
	if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
		t.Fatalf("username sorted users json: %v", err)
	}
	items = logItems(payload)
	if payload["sort_by"] != "username" || payload["sort_order"] != "asc" || len(items) != 3 {
		t.Fatalf("username sorted payload = %#v", payload)
	}
	for index, username := range []string{"disabled_one", "enabled_one", "enabled_two"} {
		if items[index]["username"] != username {
			t.Fatalf("username sorted items = %#v", items)
		}
	}

	req = httptest.NewRequest(http.MethodGet, "/api/admin/users?page=99&page_size=2", nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("clamped users status = %d body = %s", res.Code, res.Body.String())
	}
	payload = map[string]any{}
	if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
		t.Fatalf("clamped users json: %v", err)
	}
	if payload["page"] != float64(2) || payload["total_pages"] != float64(2) {
		t.Fatalf("clamped metadata = %#v", payload)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/admin/users?page=1&page_size=20&provider=local&status=disabled&search=disabled_one", nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("filtered users status = %d body = %s", res.Code, res.Body.String())
	}
	payload = map[string]any{}
	if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
		t.Fatalf("filtered users json: %v", err)
	}
	items = logItems(payload)
	if payload["total"] != float64(1) || len(items) != 1 || items[0]["username"] != "disabled_one" {
		t.Fatalf("filtered users payload = %#v", payload)
	}
	if _, ok := items[0]["usage_curve"].([]any); !ok {
		t.Fatalf("filtered user missing usage stats: %#v", items[0])
	}

	req = httptest.NewRequest(http.MethodGet, "/api/admin/users?page=0", nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("invalid page status = %d body = %s", res.Code, res.Body.String())
	}
}

func TestLinuxDoOAuthCallbackCreatesSession(t *testing.T) {
	oauthServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/token":
			if err := r.ParseForm(); err != nil {
				t.Fatalf("ParseForm() error = %v", err)
			}
			if r.Form.Get("code") != "oauth-code" || r.Form.Get("client_id") != "client-id" || r.Form.Get("client_secret") != "client-secret" {
				t.Fatalf("unexpected token form = %#v", r.Form)
			}
			util.WriteJSON(w, http.StatusOK, map[string]any{"access_token": "linuxdo-access", "token_type": "Bearer", "expires_in": 3600})
		case "/user":
			if r.Header.Get("Authorization") != "Bearer linuxdo-access" {
				t.Fatalf("userinfo authorization = %q", r.Header.Get("Authorization"))
			}
			util.WriteJSON(w, http.StatusOK, map[string]any{"id": 123, "username": "linuxdo_user", "trust_level": 2})
		default:
			http.NotFound(w, r)
		}
	}))
	defer oauthServer.Close()

	t.Setenv("CHATGPT2API_LINUXDO_ENABLED", "true")
	t.Setenv("CHATGPT2API_LINUXDO_CLIENT_ID", "client-id")
	t.Setenv("CHATGPT2API_LINUXDO_CLIENT_SECRET", "client-secret")
	t.Setenv("CHATGPT2API_LINUXDO_AUTHORIZE_URL", oauthServer.URL+"/authorize")
	t.Setenv("CHATGPT2API_LINUXDO_TOKEN_URL", oauthServer.URL+"/token")
	t.Setenv("CHATGPT2API_LINUXDO_USERINFO_URL", oauthServer.URL+"/user")
	t.Setenv("CHATGPT2API_LINUXDO_REDIRECT_URL", "http://chatgpt2api.test/auth/linuxdo/oauth/callback")
	t.Setenv("CHATGPT2API_LINUXDO_FRONTEND_REDIRECT_URL", "/auth/linuxdo/callback")

	app := newTestApp(t)
	defer app.Close()
	if _, err := app.config.Update(map[string]any{"registration_enabled": true}); err != nil {
		t.Fatalf("enable registration: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/auth/linuxdo/start?redirect=/settings", nil)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusFound {
		t.Fatalf("start status = %d body = %s", res.Code, res.Body.String())
	}
	authorizeURL, err := url.Parse(res.Header().Get("Location"))
	if err != nil {
		t.Fatalf("parse authorize location: %v", err)
	}
	state := authorizeURL.Query().Get("state")
	if state == "" || authorizeURL.Query().Get("client_id") != "client-id" {
		t.Fatalf("authorize location = %s", authorizeURL.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/auth/linuxdo/oauth/callback?code=oauth-code&state="+url.QueryEscape(state), nil)
	for _, cookie := range res.Result().Cookies() {
		req.AddCookie(cookie)
	}
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusFound {
		t.Fatalf("callback status = %d body = %s", res.Code, res.Body.String())
	}
	callbackLocation := res.Header().Get("Location")
	if strings.Contains(callbackLocation, "%25") {
		t.Fatalf("callback location double-encoded fragment values: %s", callbackLocation)
	}
	callbackURL, err := url.Parse(callbackLocation)
	if err != nil {
		t.Fatalf("parse callback location: %v", err)
	}
	fragment, err := url.ParseQuery(callbackURL.Fragment)
	if err != nil {
		t.Fatalf("parse callback fragment: %v", err)
	}
	sessionKey := fragment.Get("key")
	if sessionKey == "" || fragment.Get("subject_id") != "linuxdo:123" || fragment.Get("redirect") != "/settings" {
		t.Fatalf("callback fragment = %#v", fragment)
	}

	req = httptest.NewRequest(http.MethodGet, "/auth/session", nil)
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("login with linuxdo session status = %d body = %s", res.Code, res.Body.String())
	}
	var login map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &login); err != nil {
		t.Fatalf("login json: %v", err)
	}
	if login["subject_id"] != "linuxdo:123" || login["provider"] != service.AuthProviderLinuxDo || login["name"] != "linuxdo_user" {
		t.Fatalf("login response = %#v", login)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/admin/users", nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("admin users after linuxdo oauth status = %d body = %s", res.Code, res.Body.String())
	}
	var users map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &users); err != nil {
		t.Fatalf("admin users json: %v", err)
	}
	linuxdoUser := findHTTPItem(logItems(users), "linuxdo:123")
	if linuxdoUser == nil || linuxdoUser["linuxdo_level"] != "2" {
		t.Fatalf("oauth linuxdo user level = %#v", linuxdoUser)
	}
}

func TestLinuxDoOAuthCallbackRejectsNewUserWhenRegistrationDisabled(t *testing.T) {
	oauthServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/token":
			util.WriteJSON(w, http.StatusOK, map[string]any{"access_token": "linuxdo-access", "token_type": "Bearer"})
		case "/user":
			util.WriteJSON(w, http.StatusOK, map[string]any{"id": 456, "username": "blocked_linuxdo", "trust_level": 1})
		default:
			http.NotFound(w, r)
		}
	}))
	defer oauthServer.Close()

	t.Setenv("CHATGPT2API_LINUXDO_ENABLED", "true")
	t.Setenv("CHATGPT2API_LINUXDO_CLIENT_ID", "client-id")
	t.Setenv("CHATGPT2API_LINUXDO_CLIENT_SECRET", "client-secret")
	t.Setenv("CHATGPT2API_LINUXDO_AUTHORIZE_URL", oauthServer.URL+"/authorize")
	t.Setenv("CHATGPT2API_LINUXDO_TOKEN_URL", oauthServer.URL+"/token")
	t.Setenv("CHATGPT2API_LINUXDO_USERINFO_URL", oauthServer.URL+"/user")
	t.Setenv("CHATGPT2API_LINUXDO_REDIRECT_URL", "http://chatgpt2api.test/auth/linuxdo/oauth/callback")
	t.Setenv("CHATGPT2API_LINUXDO_FRONTEND_REDIRECT_URL", "/auth/linuxdo/callback")

	app := newTestApp(t)
	defer app.Close()

	req := httptest.NewRequest(http.MethodGet, "/auth/linuxdo/start?redirect=/settings", nil)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusFound {
		t.Fatalf("start status = %d body = %s", res.Code, res.Body.String())
	}
	authorizeURL, err := url.Parse(res.Header().Get("Location"))
	if err != nil {
		t.Fatalf("parse authorize location: %v", err)
	}
	state := authorizeURL.Query().Get("state")
	if state == "" {
		t.Fatalf("authorize location missing state: %s", authorizeURL.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/auth/linuxdo/oauth/callback?code=oauth-code&state="+url.QueryEscape(state), nil)
	for _, cookie := range res.Result().Cookies() {
		req.AddCookie(cookie)
	}
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusFound {
		t.Fatalf("callback status = %d body = %s", res.Code, res.Body.String())
	}
	callbackURL, err := url.Parse(res.Header().Get("Location"))
	if err != nil {
		t.Fatalf("parse callback location: %v", err)
	}
	fragment, err := url.ParseQuery(callbackURL.Fragment)
	if err != nil {
		t.Fatalf("parse callback fragment: %v", err)
	}
	if fragment.Get("error") != "registration_disabled" || fragment.Get("error_message") != "已关闭注册通道" {
		t.Fatalf("callback fragment = %#v", fragment)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/admin/users", nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("admin users status = %d body = %s", res.Code, res.Body.String())
	}
	var users map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &users); err != nil {
		t.Fatalf("admin users json: %v", err)
	}
	if linuxdoUser := findHTTPItem(logItems(users), "linuxdo:456"); linuxdoUser != nil {
		t.Fatalf("disabled registration created linuxdo user: %#v", linuxdoUser)
	}

	if _, _, err := app.auth.UpsertLinuxDoSession(service.AuthOwner{
		ID:           "linuxdo:456",
		Name:         "blocked_linuxdo",
		Provider:     service.AuthProviderLinuxDo,
		LinuxDoLevel: "1",
	}); err != nil {
		t.Fatalf("seed existing linuxdo user: %v", err)
	}

	req = httptest.NewRequest(http.MethodGet, "/auth/linuxdo/start?redirect=/settings", nil)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusFound {
		t.Fatalf("second start status = %d body = %s", res.Code, res.Body.String())
	}
	authorizeURL, err = url.Parse(res.Header().Get("Location"))
	if err != nil {
		t.Fatalf("parse second authorize location: %v", err)
	}
	state = authorizeURL.Query().Get("state")
	if state == "" {
		t.Fatalf("second authorize location missing state: %s", authorizeURL.String())
	}
	req = httptest.NewRequest(http.MethodGet, "/auth/linuxdo/oauth/callback?code=oauth-code&state="+url.QueryEscape(state), nil)
	for _, cookie := range res.Result().Cookies() {
		req.AddCookie(cookie)
	}
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusFound {
		t.Fatalf("second callback status = %d body = %s", res.Code, res.Body.String())
	}
	callbackURL, err = url.Parse(res.Header().Get("Location"))
	if err != nil {
		t.Fatalf("parse second callback location: %v", err)
	}
	fragment, err = url.ParseQuery(callbackURL.Fragment)
	if err != nil {
		t.Fatalf("parse second callback fragment: %v", err)
	}
	if fragment.Get("error") != "" || fragment.Get("key") == "" || fragment.Get("subject_id") != "linuxdo:456" {
		t.Fatalf("existing user callback fragment = %#v", fragment)
	}
}

func TestCreationTaskPollingDisablesCaching(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	_, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "frontend", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/creation-tasks?ids=missing", nil)
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("creation task list status = %d body = %s", res.Code, res.Body.String())
	}
	if got := res.Header().Get("Cache-Control"); got != "no-store" {
		t.Fatalf("Cache-Control = %q, want no-store", got)
	}
	if got := res.Header().Get("Pragma"); got != "no-cache" {
		t.Fatalf("Pragma = %q, want no-cache", got)
	}
}

func TestModelsCallLogIncludesUserKeyName(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	_, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "frontend", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/v1/models", nil)
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("models status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/logs", nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("logs status = %d body = %s", res.Code, res.Body.String())
	}
	var logs map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &logs); err != nil {
		t.Fatalf("logs json: %v", err)
	}
	items := logItems(logs)
	if len(items) == 0 {
		t.Fatalf("expected models call to write a log event, got %#v", logs)
	}
	item := findLogByDetails(items, map[string]any{
		"endpoint": "/v1/models",
		"outcome":  "success",
	})
	if item == nil {
		t.Fatalf("expected models call log event, got %#v", items)
	}
	if _, ok := item["type"]; ok {
		t.Fatalf("log item should not expose type: %#v", item)
	}
	detail, _ := item["detail"].(map[string]any)
	if detail["endpoint"] != "/v1/models" ||
		detail["path"] != "/v1/models" ||
		detail["method"] != http.MethodGet ||
		detail["status"] != float64(http.StatusOK) ||
		detail["outcome"] != "success" ||
		detail["key_name"] != "frontend" ||
		detail["auth_kind"] != service.AuthKindAPIKey ||
		detail["key_role"] != "user" {
		t.Fatalf("models call log did not include user key identity: %#v", detail)
	}
	if _, ok := detail["session_name"]; ok {
		t.Fatalf("api key log should not include session_name: %#v", detail)
	}
}

func TestProtocolCallLogCapturesUnknownLengthRequestWithoutDuplicateAudit(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	_, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "frontend", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}
	app.engine.ImageTokenProvider = func(context.Context) (string, error) {
		return "test-token", nil
	}
	app.engine.ImageClientFactory = func(string) *backend.Client {
		return nil
	}
	app.engine.StreamImageOutputsFunc = func(ctx context.Context, client *backend.Client, request protocol.ConversationRequest, index, total int) (<-chan protocol.ImageOutput, <-chan error) {
		out := make(chan protocol.ImageOutput, 1)
		errCh := make(chan error, 1)
		out <- protocol.ImageOutput{
			Kind:    "result",
			Model:   request.Model,
			Index:   index,
			Total:   total,
			Created: 123,
			Data:    []map[string]any{{"url": "https://example.test/image.png"}},
		}
		close(out)
		errCh <- nil
		close(errCh)
		return out, errCh
	}

	body := `{"prompt":"draw a cat","model":"gpt-image-2","n":1,"response_format":"url"}`
	req := httptest.NewRequest(http.MethodPost, "/v1/images/generations?trace=1", io.NopCloser(strings.NewReader(body)))
	req.ContentLength = -1
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("image generation status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/logs", nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("logs status = %d body = %s", res.Code, res.Body.String())
	}
	var logs map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &logs); err != nil {
		t.Fatalf("logs json: %v", err)
	}
	items := logItems(logs)
	callLog := findLogByDetails(items, map[string]any{"endpoint": "/v1/images/generations", "outcome": "success"})
	if callLog == nil {
		t.Fatalf("expected image call log, got %#v", items)
	}
	detail, _ := callLog["detail"].(map[string]any)
	requestArgs, _ := detail["request_args"].(map[string]any)
	query, _ := requestArgs["query"].(map[string]any)
	requestBody, _ := requestArgs["body"].(map[string]any)
	if query["trace"] != "1" || requestBody["model"] != "gpt-image-2" || requestBody["prompt"] != "draw a cat" {
		t.Fatalf("request args not captured completely: %#v", requestArgs)
	}
	if detail["request_truncated"] != nil {
		t.Fatalf("small request should not be marked truncated: %#v", detail)
	}
	if auditLog := findHTTPAuditLogByPath(items, "/v1/images/generations"); auditLog != nil {
		t.Fatalf("protocol request should not also create generic audit log: %#v", auditLog)
	}
}

func TestAPIAuditLogCapturesRequestMetadata(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	req := httptest.NewRequest(http.MethodGet, "/api/settings?section=logging", nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	req.Header.Set("User-Agent", "chatgpt2api-test")
	req.RemoteAddr = "203.0.113.10:12345"
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("settings status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/logs?username=admin&method=GET&status=200&summary=%2Fapi%2Fsettings&view=all", nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("audit logs status = %d body = %s", res.Code, res.Body.String())
	}
	var logs map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &logs); err != nil {
		t.Fatalf("audit logs json: %v", err)
	}
	items := logItems(logs)
	if len(items) == 0 {
		t.Fatalf("expected audit log, got %#v", logs)
	}
	item := findLogByDetail(items, "path", "/api/settings")
	if item == nil {
		t.Fatalf("expected audit log for /api/settings, got %#v", items)
	}
	if _, ok := item["type"]; ok {
		t.Fatalf("log item should not expose type: %#v", item)
	}
	detail, _ := item["detail"].(map[string]any)
	if detail["method"] != http.MethodGet || detail["status"] != float64(http.StatusOK) || detail["log_level"] != "info" {
		t.Fatalf("unexpected audit detail = %#v", detail)
	}
	if detail["operation_type"] != "查询" || detail["subject_id"] != testAdminUsername || detail["user_agent"] != "chatgpt2api-test" {
		t.Fatalf("missing audit identity/request fields = %#v", detail)
	}
	if detail["username"] != "管理员" || detail["session_name"] != "登录会话" || detail["auth_kind"] != service.AuthKindSession {
		t.Fatalf("session audit detail should use username/session fields instead of token name: %#v", detail)
	}
	if _, ok := detail["key_name"]; ok {
		t.Fatalf("session audit detail should not expose 登录会话 as key_name: %#v", detail)
	}
	if _, ok := detail["duration_ms"].(float64); !ok {
		t.Fatalf("duration_ms not numeric in audit detail = %#v", detail)
	}
}

func TestCreationTaskSubmitLogsRequestAndPollingAvoidsGenericAuditNoise(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	_, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "frontend", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/creation-tasks/image-generations", strings.NewReader(`{"client_task_id":"noise-test","prompt":"test image"}`))
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("submit creation task status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/creation-tasks?ids=noise-test", nil)
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("poll creation task status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/logs?view=all", nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("logs status = %d body = %s", res.Code, res.Body.String())
	}
	var logs map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &logs); err != nil {
		t.Fatalf("logs json: %v", err)
	}
	items := logItems(logs)
	submitLog := findHTTPAuditLogByPath(items, "/api/creation-tasks/image-generations")
	if submitLog == nil {
		t.Fatalf("creation task submit should create a request log, got %#v", items)
	}
	detail, _ := submitLog["detail"].(map[string]any)
	requestArgs, _ := detail["request_args"].(map[string]any)
	if requestArgs["client_task_id"] != "noise-test" || requestArgs["prompt"] != "test image" {
		t.Fatalf("creation task submit request args = %#v", requestArgs)
	}
	if auditLog := findHTTPAuditLogByPath(items, "/api/creation-tasks"); auditLog != nil {
		t.Fatalf("creation task polling should not create generic audit log: %#v", auditLog)
	}
}

func TestLogGovernanceEndpointCleansOldLogs(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	backend, err := app.config.StorageBackend()
	if err != nil {
		t.Fatalf("StorageBackend() error = %v", err)
	}
	logStore, ok := backend.(storage.LogBackend)
	if !ok {
		t.Fatalf("storage backend %T does not implement LogBackend", backend)
	}
	for _, item := range []map[string]any{
		{"time": time.Now().AddDate(0, 0, -2).Format("2006-01-02 15:04:05"), "type": "event", "summary": "旧日志", "detail": map[string]any{"status": "success"}},
		{"time": time.Now().Format("2006-01-02 15:04:05"), "type": "event", "summary": "新日志", "detail": map[string]any{"status": 200}},
	} {
		if err := logStore.AppendLog(item); err != nil {
			t.Fatalf("AppendLog() error = %v", err)
		}
	}

	req := httptest.NewRequest(http.MethodGet, "/api/logs/governance", nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("governance status = %d body = %s", res.Code, res.Body.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
		t.Fatalf("governance json: %v", err)
	}
	governance, _ := payload["governance"].(map[string]any)
	if governance["total"] != float64(2) {
		t.Fatalf("governance total = %#v, want 2 in %#v", governance["total"], payload)
	}

	req = httptest.NewRequest(http.MethodPost, "/api/logs/governance", strings.NewReader(`{"retention_days":1}`))
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("cleanup status = %d body = %s", res.Code, res.Body.String())
	}
	payload = map[string]any{}
	if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
		t.Fatalf("cleanup json: %v", err)
	}
	cleanup, _ := payload["cleanup"].(map[string]any)
	if cleanup["deleted"] != float64(1) || cleanup["remaining"] != float64(1) {
		t.Fatalf("cleanup result = %#v, want deleted 1 remaining 1", cleanup)
	}
}

func TestNewAppStartsLogRetentionCleaner(t *testing.T) {
	root := t.TempDir()
	t.Setenv("CHATGPT2API_ROOT", root)
	t.Setenv("CHATGPT2API_ADMIN_USERNAME", testAdminUsername)
	t.Setenv("CHATGPT2API_ADMIN_PASSWORD", testAdminPassword)
	t.Setenv("STORAGE_BACKEND", "sqlite")
	t.Setenv("DATABASE_URL", "")
	t.Setenv("CHATGPT2API_LOG_RETENTION_DAYS", "1")
	unsetTestEnv(t, "CHATGPT2API_REGISTRATION_ENABLED")

	dataDir := filepath.Join(root, "data")
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		t.Fatalf("mkdir data dir: %v", err)
	}
	backend, err := storage.NewBackendFromEnv(dataDir)
	if err != nil {
		t.Fatalf("NewBackendFromEnv() error = %v", err)
	}
	logStore, ok := backend.(storage.LogBackend)
	if !ok {
		t.Fatalf("storage backend %T does not implement LogBackend", backend)
	}
	for _, item := range []map[string]any{
		{"time": "2000-01-01 00:00:00", "type": "event", "summary": "旧日志", "detail": map[string]any{"status": "success"}},
		{"time": time.Now().Format("2006-01-02 15:04:05"), "type": "event", "summary": "新日志", "detail": map[string]any{"status": 200}},
	} {
		if err := logStore.AppendLog(item); err != nil {
			t.Fatalf("AppendLog() error = %v", err)
		}
	}
	if closer, ok := backend.(interface{ Close() error }); ok {
		if err := closer.Close(); err != nil {
			t.Fatalf("close seed backend: %v", err)
		}
	}

	app, err := NewApp()
	if err != nil {
		t.Fatalf("NewApp() error = %v", err)
	}
	defer app.Close()

	waitForHTTPTestCondition(t, func() bool {
		items := app.logs.Search(service.LogQuery{Limit: 10})
		return len(items) == 1 && items[0]["summary"] == "新日志"
	})
}

func TestImageStorageGovernanceEndpointCleansThumbnails(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()

	rel := "2026/04/29/sample.png"
	imagePath := filepath.Join(app.config.ImagesDir(), filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(imagePath), 0o755); err != nil {
		t.Fatalf("mkdir image dir: %v", err)
	}
	if err := writeHTTPTestPNG(imagePath); err != nil {
		t.Fatalf("write image: %v", err)
	}
	app.images.RecordGeneratedImages([]string{rel}, "admin", "Admin", service.ImageVisibilityPrivate)
	app.images.EnsureThumbnails([]string{rel})
	if err := app.images.EnsurePreview(rel + ".jpg"); err != nil {
		t.Fatalf("EnsurePreview() error = %v", err)
	}
	thumbPath := filepath.Join(app.config.ImageThumbnailsDir(), filepath.FromSlash(rel)+".jpg")
	if _, err := os.Stat(thumbPath); err != nil {
		t.Fatalf("thumbnail was not created: %v", err)
	}
	previewPath := filepath.Join(app.config.ImagePreviewsDir(), filepath.FromSlash(rel)+".jpg")
	if _, err := os.Stat(previewPath); err != nil {
		t.Fatalf("preview was not created: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/images/storage-governance", nil)
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("storage governance status = %d body = %s", res.Code, res.Body.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
		t.Fatalf("storage governance json: %v", err)
	}
	governance, _ := payload["governance"].(map[string]any)
	if governance["images_count"] != float64(1) || governance["thumbnail_files"] != float64(1) || governance["previews_files"] != float64(1) {
		t.Fatalf("storage governance = %#v", governance)
	}

	req = httptest.NewRequest(http.MethodPost, "/api/images/storage-governance", strings.NewReader(`{"action":"thumbnails"}`))
	req.Header.Set("Authorization", adminAuthHeader(t, app))
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("thumbnail cleanup status = %d body = %s", res.Code, res.Body.String())
	}
	payload = map[string]any{}
	if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
		t.Fatalf("thumbnail cleanup json: %v", err)
	}
	cleanup, _ := payload["cleanup"].(map[string]any)
	if cleanup["deleted_thumbnails"] != float64(1) || cleanup["deleted_previews"] != float64(1) || cleanup["deleted_images"] != float64(0) {
		t.Fatalf("thumbnail cleanup = %#v", cleanup)
	}
	if _, err := os.Stat(imagePath); err != nil {
		t.Fatalf("image should remain after thumbnail cleanup: %v", err)
	}
	if _, err := os.Stat(thumbPath); !os.IsNotExist(err) {
		t.Fatalf("thumbnail still exists, stat error = %v", err)
	}
	if _, err := os.Stat(previewPath); !os.IsNotExist(err) {
		t.Fatalf("preview still exists, stat error = %v", err)
	}
}

func logPayloadSummaries(items []map[string]any) []string {
	out := make([]string, 0, len(items))
	for _, item := range items {
		out = append(out, util.Clean(item["summary"]))
	}
	return out
}

func logItems(payload map[string]any) []map[string]any {
	rawItems, _ := payload["items"].([]any)
	items := make([]map[string]any, 0, len(rawItems))
	for _, raw := range rawItems {
		if item, ok := raw.(map[string]any); ok {
			items = append(items, item)
		}
	}
	return items
}

func findLogBySummary(items []map[string]any, summary string) map[string]any {
	for _, item := range items {
		if item["summary"] == summary {
			return item
		}
	}
	return nil
}

func findHTTPItem(items []map[string]any, id string) map[string]any {
	for _, item := range items {
		if item["id"] == id {
			return item
		}
	}
	return nil
}

func findHTTPBulkBillingResult(items []map[string]any, userID string) map[string]any {
	for _, item := range items {
		if item["user_id"] == userID {
			return item
		}
	}
	return nil
}

func findResponseCookie(res *http.Response, name string) *http.Cookie {
	for _, cookie := range res.Cookies() {
		if cookie.Name == name {
			return cookie
		}
	}
	return nil
}

func assertCreationConcurrentLimit(t *testing.T, payload map[string]any, want int) {
	t.Helper()
	got, ok := payload["creation_concurrent_limit"].(float64)
	if !ok || got != float64(want) {
		t.Fatalf("creation_concurrent_limit = %#v, want %d in %#v", payload["creation_concurrent_limit"], want, payload)
	}
}

func findLogByDetail(items []map[string]any, key, value string) map[string]any {
	return findLogByDetails(items, map[string]any{key: value})
}

func findHTTPAuditLogByPath(items []map[string]any, path string) map[string]any {
	for _, item := range items {
		detail, _ := item["detail"].(map[string]any)
		if detail["path"] == path && detail["endpoint"] == nil {
			return item
		}
	}
	return nil
}

func findLogByDetails(items []map[string]any, values map[string]any) map[string]any {
	for _, item := range items {
		detail, _ := item["detail"].(map[string]any)
		matches := true
		for key, value := range values {
			if detail[key] != value {
				matches = false
				break
			}
		}
		if matches {
			return item
		}
	}
	return nil
}

const (
	testAdminUsername = "admin"
	testAdminPassword = "AdminPass123!"
)

func adminAuthHeader(t *testing.T, app *App) string {
	t.Helper()
	identity, token, err := app.auth.LoginPassword(testAdminUsername, testAdminPassword)
	if err != nil {
		t.Fatalf("admin LoginPassword() error = %v", err)
	}
	if identity == nil || identity.Role != service.AuthRoleAdmin || token == "" {
		t.Fatalf("admin LoginPassword() identity=%#v token=%q", identity, token)
	}
	return "Bearer " + token
}

func containsHTTPTestString(items []string, target string) bool {
	for _, item := range items {
		if item == target {
			return true
		}
	}
	return false
}

func waitForHTTPTestCondition(t *testing.T, ok func() bool) {
	t.Helper()
	deadline := time.Now().Add(6 * time.Second)
	for time.Now().Before(deadline) {
		if ok() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("timed out waiting for condition")
}

func failingHTTPImageTaskHandler(context.Context, service.Identity, map[string]any) (map[string]any, error) {
	return nil, errors.New("unexpected image task handler call")
}

func testJSONStoreFromApp(t *testing.T, app *App) storage.Backend {
	t.Helper()
	backend, err := app.config.StorageBackend()
	if err != nil {
		t.Fatalf("StorageBackend() error = %v", err)
	}
	if _, ok := backend.(storage.JSONDocumentBackend); !ok {
		t.Fatalf("storage backend %T does not implement JSONDocumentBackend", backend)
	}
	return backend
}

func waitForHTTPTestConditionResult(ok func() bool) bool {
	deadline := time.Now().Add(6 * time.Second)
	for time.Now().Before(deadline) {
		if ok() {
			return true
		}
		time.Sleep(10 * time.Millisecond)
	}
	return false
}

func TestLuoyeIndependentModeDisablesLocalUserAuth(t *testing.T) {
	app := newIndependentTestApp(t, "http://sub2.test/internal/redeem", "secret", "http://gateway.test")
	defer app.Close()

	for _, tc := range []struct {
		path string
		body string
	}{
		{path: "/auth/login", body: `{"username":"alice","password":"Password123"}`},
		{path: "/auth/register", body: `{"username":"alice","password":"Password123"}`},
	} {
		req := httptest.NewRequest(http.MethodPost, tc.path, strings.NewReader(tc.body))
		res := httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		if res.Code != http.StatusForbidden {
			t.Fatalf("%s status = %d body = %s", tc.path, res.Code, res.Body.String())
		}
	}

	req := httptest.NewRequest(http.MethodGet, "/auth/providers", nil)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("providers status = %d body = %s", res.Code, res.Body.String())
	}
	var providers map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &providers); err != nil {
		t.Fatalf("providers json: %v", err)
	}
	if registration := util.StringMap(providers["registration"]); util.ToBool(registration["enabled"]) {
		t.Fatalf("independent registration provider should be disabled: %#v", providers)
	}
	if linuxdo := util.StringMap(providers["linuxdo"]); util.ToBool(linuxdo["enabled"]) {
		t.Fatalf("independent linuxdo provider should be disabled: %#v", providers)
	}
}

func TestLuoyeIndependentModeRedirectsAnonymousWebPages(t *testing.T) {
	app := newIndependentTestApp(t, "http://sub2.test/internal/redeem", "secret", "http://gateway.test")
	defer app.Close()

	req := httptest.NewRequest(http.MethodGet, "/image", nil)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusFound || res.Header().Get("Location") != "/login" {
		t.Fatalf("anonymous /image status=%d location=%q body=%s", res.Code, res.Header().Get("Location"), res.Body.String())
	}

	owner := service.AuthOwner{ID: "sub2api:100", Name: "Alice", Provider: service.AuthProviderSub2API}
	_, sessionKey, err := app.auth.UpsertSub2APISession(owner)
	if err != nil {
		t.Fatalf("sub2api session: %v", err)
	}
	req = httptest.NewRequest(http.MethodGet, "/image", nil)
	req.AddCookie(&http.Cookie{Name: authSessionCookieName, Value: sessionKey})
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("authenticated /image status=%d location=%q body=%s", res.Code, res.Header().Get("Location"), res.Body.String())
	}
}

func TestSub2APISessionResponseIncludesSessionBinding(t *testing.T) {
	app := newIndependentTestApp(t, "http://sub2.test/internal/redeem", "secret", "http://gateway.test")
	defer app.Close()

	owner := service.AuthOwner{ID: "sub2api:100", Name: "Alice", Provider: service.AuthProviderSub2API}
	_, sessionKey, err := app.auth.UpsertSub2APISession(owner)
	if err != nil {
		t.Fatalf("sub2api session: %v", err)
	}
	if err := app.sub2Bindings.Save(service.Sub2APIBinding{
		OwnerID:        owner.ID,
		Sub2APIUserID:  "100",
		UserEmail:      "alice@example.com",
		UserName:       "Alice",
		SessionToken:   "studio-bridge:100",
		GatewayBaseURL: "http://gateway.test",
	}); err != nil {
		t.Fatalf("save sub2api binding: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/auth/session", nil)
	req.AddCookie(&http.Cookie{Name: authSessionCookieName, Value: sessionKey})
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("session status=%d body=%s", res.Code, res.Body.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
		t.Fatalf("session json: %v", err)
	}
	binding := util.StringMap(payload["sub2api"])
	if binding["sub2api_user_id"] != "100" || binding["owner_id"] != "sub2api:100" {
		t.Fatalf("session sub2api binding = %#v", binding)
	}
}

func TestLuoyeIndependentModeDisablesProtocolAPIForSub2APIUsers(t *testing.T) {
	app := newIndependentTestApp(t, "http://sub2.test/internal/redeem", "secret", "http://gateway.test")
	defer app.Close()

	owner := service.AuthOwner{ID: "sub2api:100", Name: "Alice", Provider: service.AuthProviderSub2API}
	_, sessionKey, err := app.auth.UpsertSub2APISession(owner)
	if err != nil {
		t.Fatalf("sub2api session: %v", err)
	}

	tests := []struct {
		name   string
		method string
		path   string
		body   string
	}{
		{name: "models", method: http.MethodGet, path: "/v1/models"},
		{name: "image generation", method: http.MethodPost, path: "/v1/images/generations", body: `{"model":"gpt-image-2","prompt":"draw"}`},
		{name: "image edit", method: http.MethodPost, path: "/v1/images/edits", body: `{"model":"gpt-image-2","prompt":"edit","images":[{"file_id":"file-abc"}]}`},
		{name: "chat completions", method: http.MethodPost, path: "/v1/chat/completions", body: `{"model":"gpt-5","messages":[{"role":"user","content":"hello"}]}`},
		{name: "responses", method: http.MethodPost, path: "/v1/responses", body: `{"model":"gpt-5","input":"hello"}`},
		{name: "messages", method: http.MethodPost, path: "/v1/messages", body: `{"model":"claude","messages":[{"role":"user","content":"hello"}]}`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(tt.method, tt.path, strings.NewReader(tt.body))
			req.Header.Set("Authorization", "Bearer "+sessionKey)
			res := httptest.NewRecorder()
			app.Handler().ServeHTTP(res, req)
			if res.Code != http.StatusForbidden {
				t.Fatalf("%s status = %d body = %s", tt.path, res.Code, res.Body.String())
			}
		})
	}
}

func TestLuoyeIndependentSub2APIDefaultGroupAndBilling(t *testing.T) {
	var calls []string
	var generationPayload map[string]any
	var generationGroupHeader string
	var generationUserHeader string
	var reserveAmount any
	var commitPayload map[string]any
	gateway := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Sub2API-Studio-Secret") != "secret" {
			t.Fatalf("gateway secret header = %q", r.Header.Get("X-Sub2API-Studio-Secret"))
		}
		generationGroupHeader = r.Header.Get("X-Sub2API-Group-ID")
		generationUserHeader = r.Header.Get("X-Sub2API-Studio-User-ID")
		if r.Method != http.MethodPost || r.URL.Path != "/images/generations" {
			t.Fatalf("gateway request = %s %s", r.Method, r.URL.Path)
		}
		if err := json.NewDecoder(r.Body).Decode(&generationPayload); err != nil {
			t.Fatalf("gateway json: %v", err)
		}
		util.WriteJSON(w, http.StatusOK, map[string]any{"created": 123, "data": []map[string]any{{"b64_json": "aW1hZ2U="}}})
	}))
	defer gateway.Close()

	bridge := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Sub2API-Studio-Secret") != "secret" {
			t.Fatalf("bridge secret header = %q", r.Header.Get("X-Sub2API-Studio-Secret"))
		}
		switch r.URL.Path {
		case "/internal/redeem":
			var payload map[string]any
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				t.Fatalf("bridge redeem json: %v", err)
			}
			if payload["app_id"] != "luoye-ai" || payload["launch_token"] != "launch-token" {
				t.Fatalf("bridge redeem payload = %#v", payload)
			}
			util.WriteJSON(w, http.StatusOK, map[string]any{"code": 0, "data": map[string]any{"user_id": 42, "email": "luoye@example.com", "username": "Luoye User", "default_image_group": "image-group", "gateway_base_url": gateway.URL}})
		case "/internal/charges/reserve", "/internal/charges/commit", "/internal/charges/refund":
			var payload map[string]any
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				t.Fatalf("bridge charge json: %v", err)
			}
			if payload["app_id"] != "luoye-ai" || payload["user_id"] != float64(42) || payload["charge_key"] == "" {
				t.Fatalf("bridge charge payload = %#v", payload)
			}
			call := strings.TrimPrefix(r.URL.Path, "/internal/charges/")
			if call == "reserve" {
				reserveAmount = payload["amount"]
			}
			if call == "commit" {
				commitPayload = util.CopyMap(payload)
			}
			calls = append(calls, call)
			util.WriteJSON(w, http.StatusOK, map[string]any{"code": 0, "data": map[string]any{"ok": true}})
		case "/internal/user-summary":
			util.WriteJSON(w, http.StatusOK, map[string]any{"code": 0, "data": map[string]any{"user_id": 42, "balance": 99, "recharge_url": "https://sub2.test/recharge"}})
		default:
			t.Fatalf("bridge request = %s %s", r.Method, r.URL.Path)
		}
	}))
	defer bridge.Close()

	app := newIndependentTestApp(t, bridge.URL+"/internal/redeem", "secret", gateway.URL)
	defer app.Close()

	req := httptest.NewRequest(http.MethodPost, "/auth/sub2api/launch", strings.NewReader(`{"token":"launch-token"}`))
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("launch status = %d body = %s", res.Code, res.Body.String())
	}
	var launch map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &launch); err != nil {
		t.Fatalf("launch json: %v", err)
	}
	sessionKey := util.Clean(launch["token"])
	if sessionKey == "" {
		t.Fatalf("launch token missing: %#v", launch)
	}

	req = httptest.NewRequest(http.MethodPost, "/api/creation-tasks/image-generations", strings.NewReader(`{"client_task_id":"luoye-image","prompt":"draw","model":"gpt-image-2","n":1}`))
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("submit status = %d body = %s", res.Code, res.Body.String())
	}
	waitForHTTPTestCondition(t, func() bool {
		req = httptest.NewRequest(http.MethodGet, "/api/creation-tasks?ids=luoye-image", nil)
		req.Header.Set("Authorization", "Bearer "+sessionKey)
		res = httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		var listed map[string]any
		_ = json.Unmarshal(res.Body.Bytes(), &listed)
		items := util.AsMapSlice(listed["items"])
		return len(items) == 1 && items[0]["status"] == service.TaskStatusSuccess
	})
	if generationGroupHeader != "image-group" || generationPayload["group_id"] != "image-group" {
		t.Fatalf("default group header=%q payload=%#v", generationGroupHeader, generationPayload)
	}
	if generationUserHeader != "42" {
		t.Fatalf("gateway user header = %q", generationUserHeader)
	}
	if reserveAmount != 0.051 {
		t.Fatalf("reserve amount = %#v, want 0.051", reserveAmount)
	}
	if !reflect.DeepEqual(calls, []string{"reserve", "commit"}) {
		t.Fatalf("billing calls = %#v", calls)
	}
	if util.ToInt(commitPayload["image_count"], 0) != 1 || commitPayload["image_size"] != "2K" || commitPayload["image_size_source"] != "default" {
		t.Fatalf("commit image metadata = %#v", commitPayload)
	}
}

func TestLuoyeIndependentCanvasModelsUseDefaultGroups(t *testing.T) {
	groupHeaders := []string{}
	gateway := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Sub2API-Studio-Secret") != "secret" {
			t.Fatalf("gateway secret header = %q", r.Header.Get("X-Sub2API-Studio-Secret"))
		}
		if r.Header.Get("X-Sub2API-Studio-User-ID") != "42" {
			t.Fatalf("gateway user header = %q", r.Header.Get("X-Sub2API-Studio-User-ID"))
		}
		groupID := r.Header.Get("X-Sub2API-Group-ID")
		switch r.URL.Path {
		case "/model-catalog":
			groupHeaders = append(groupHeaders, groupID)
			switch groupID {
			case "chat-group":
				util.WriteJSON(w, http.StatusOK, map[string]any{"items": []map[string]any{
					{"id": "chat-group-model", "name": "Chat Group Model", "capabilities": []string{"chat"}, "enabled": true},
					{"id": util.ImageModelGPT, "name": util.ImageModelGPT, "capabilities": []string{"image"}, "enabled": true},
					{"id": "video-group-model", "name": "Video Group Model", "capabilities": []string{"video"}, "enabled": true},
				}})
			case "image-group":
				util.WriteJSON(w, http.StatusOK, map[string]any{"items": []map[string]any{
					{"id": "chat-group-model", "name": "Chat Group Model", "capabilities": []string{"chat"}, "enabled": true},
					{"id": "glm-4.7", "name": "glm-4.7", "capabilities": []string{"image"}, "enabled": true},
					{"id": "gpt-4.1", "name": "gpt-4.1", "capabilities": []string{"image"}, "enabled": true},
					{"id": util.ImageModelGPT, "name": util.ImageModelGPT, "capabilities": []string{"image"}, "enabled": true},
					{"id": "video-group-model", "name": "Video Group Model", "capabilities": []string{"video"}, "enabled": true},
				}})
			case "video-group":
				util.WriteJSON(w, http.StatusOK, map[string]any{"items": []map[string]any{
					{"id": "chat-group-model", "name": "Chat Group Model", "capabilities": []string{"chat"}, "enabled": true},
					{"id": util.ImageModelGPT, "name": util.ImageModelGPT, "capabilities": []string{"image"}, "enabled": true},
					{"id": "video-group-model", "name": "Video Group Model", "capabilities": []string{"video"}, "enabled": true},
				}})
			default:
				t.Fatalf("unexpected group header %q", groupID)
			}
		case "/models":
			util.WriteJSON(w, http.StatusOK, map[string]any{"data": []map[string]any{}})
		default:
			t.Fatalf("gateway request = %s %s", r.Method, r.URL.Path)
		}
	}))
	defer gateway.Close()

	bridge := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/internal/redeem":
			util.WriteJSON(w, http.StatusOK, map[string]any{"code": 0, "data": map[string]any{"user_id": 42, "email": "luoye@example.com", "username": "Luoye User", "default_chat_group": "chat-group", "default_image_group": "image-group", "default_video_group": "video-group", "gateway_base_url": gateway.URL}})
		case "/internal/user-summary":
			util.WriteJSON(w, http.StatusOK, map[string]any{"code": 0, "data": map[string]any{"user_id": 42, "balance": 99}})
		default:
			t.Fatalf("bridge request = %s %s", r.Method, r.URL.Path)
		}
	}))
	defer bridge.Close()

	app := newIndependentTestApp(t, bridge.URL+"/internal/redeem", "secret", gateway.URL)
	defer app.Close()
	sessionKey := launchIndependentSub2APITestSession(t, app, "launch-token")

	req := httptest.NewRequest(http.MethodGet, "/api/canvas/models", nil)
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("canvas models status = %d body = %s", res.Code, res.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("canvas models json: %v", err)
	}
	ids := map[string]bool{}
	modelModes := map[string]map[string]bool{}
	groupModes := map[string][]string{}
	for _, item := range util.AsMapSlice(body["items"]) {
		id := util.Clean(item["id"])
		ids[id] = true
		modes := util.AsStringSlice(item["group_modes"])
		groupModes[id] = modes
		if modelModes[id] == nil {
			modelModes[id] = map[string]bool{}
		}
		for _, mode := range modes {
			modelModes[id][mode] = true
		}
	}
	for _, id := range []string{"chat-group-model", util.ImageModelGPT, util.ImageModelGPTOfficial, "video-group-model"} {
		if !ids[id] {
			t.Fatalf("model %q missing from %#v", id, body["items"])
		}
	}
	if !reflect.DeepEqual(groupModes["chat-group-model"], []string{"chat"}) ||
		!reflect.DeepEqual(groupModes[util.ImageModelGPT], []string{"image"}) ||
		!reflect.DeepEqual(groupModes["video-group-model"], []string{"video"}) {
		t.Fatalf("group modes = %#v items=%#v", groupModes, body["items"])
	}
	if modelModes["chat-group-model"]["image"] || modelModes["chat-group-model"]["video"] ||
		modelModes[util.ImageModelGPT]["chat"] || modelModes[util.ImageModelGPT]["video"] ||
		modelModes["video-group-model"]["chat"] || modelModes["video-group-model"]["image"] {
		t.Fatalf("model leaked across groups = %#v items=%#v", modelModes, body["items"])
	}
	if ids[util.ImageModelGPT55] || ids[util.ImageModelAuto] {
		t.Fatalf("independent model catalog leaked local chat defaults: %#v", body["items"])
	}
	if ids["glm-4.7"] || ids["gpt-4.1"] {
		t.Fatalf("text-only models leaked into image catalog: %#v", body["items"])
	}
	if !reflect.DeepEqual(groupHeaders, []string{"chat-group", "image-group", "video-group"}) {
		t.Fatalf("group headers = %#v", groupHeaders)
	}
}

func TestLuoyeIndependentCanvasModelsSupplementCatalogWithGroupModels(t *testing.T) {
	requests := []string{}
	gateway := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Sub2API-Studio-Secret") != "secret" {
			t.Fatalf("gateway secret header = %q", r.Header.Get("X-Sub2API-Studio-Secret"))
		}
		if r.Header.Get("X-Sub2API-Studio-User-ID") != "42" {
			t.Fatalf("gateway user header = %q", r.Header.Get("X-Sub2API-Studio-User-ID"))
		}
		groupID := r.Header.Get("X-Sub2API-Group-ID")
		requests = append(requests, groupID+":"+r.URL.Path)
		switch r.URL.Path {
		case "/model-catalog":
			switch groupID {
			case "chat-group":
				util.WriteJSON(w, http.StatusOK, map[string]any{"items": []map[string]any{
					{"id": "gpt-5.4", "name": "gpt-5.4", "capabilities": []string{"chat"}, "enabled": true},
					{"id": "claude-opus-4-6", "name": "claude-opus-4-6", "capabilities": []string{"chat", "image"}, "enabled": true},
				}})
			case "image-group":
				util.WriteJSON(w, http.StatusOK, map[string]any{"items": []map[string]any{
					{"id": util.ImageModelGPT, "name": util.ImageModelGPT, "capabilities": []string{"image"}, "enabled": true},
					{"id": "claude-opus-4-6", "name": "claude-opus-4-6", "capabilities": []string{"chat", "image"}, "enabled": true},
				}})
			case "video-group":
				util.WriteJSON(w, http.StatusOK, map[string]any{"items": []map[string]any{}})
			default:
				t.Fatalf("unexpected catalog group header %q", groupID)
			}
		case "/models":
			switch groupID {
			case "chat-group":
				util.WriteJSON(w, http.StatusOK, map[string]any{"data": []map[string]any{
					{"id": "claude-sonnet-4-5", "name": "Claude Sonnet 4.5"},
					{"id": "gpt-image-2"},
				}})
			case "image-group":
				util.WriteJSON(w, http.StatusOK, map[string]any{"data": []map[string]any{
					{"id": "claude-sonnet-4-5"},
					{"id": "gpt-image-2"},
				}})
			case "video-group":
				util.WriteJSON(w, http.StatusOK, map[string]any{"data": []map[string]any{}})
			default:
				t.Fatalf("unexpected models group header %q", groupID)
			}
		default:
			t.Fatalf("gateway request = %s %s", r.Method, r.URL.Path)
		}
	}))
	defer gateway.Close()

	bridge := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/internal/redeem":
			util.WriteJSON(w, http.StatusOK, map[string]any{"code": 0, "data": map[string]any{"user_id": 42, "email": "luoye@example.com", "username": "Luoye User", "default_chat_group": "chat-group", "default_image_group": "image-group", "default_video_group": "video-group", "gateway_base_url": gateway.URL}})
		case "/internal/user-summary":
			util.WriteJSON(w, http.StatusOK, map[string]any{"code": 0, "data": map[string]any{"user_id": 42, "balance": 99}})
		default:
			t.Fatalf("bridge request = %s %s", r.Method, r.URL.Path)
		}
	}))
	defer bridge.Close()

	app := newIndependentTestApp(t, bridge.URL+"/internal/redeem", "secret", gateway.URL)
	defer app.Close()
	sessionKey := launchIndependentSub2APITestSession(t, app, "launch-token")

	req := httptest.NewRequest(http.MethodGet, "/api/canvas/models", nil)
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("canvas models status = %d body = %s", res.Code, res.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("canvas models json: %v", err)
	}
	kinds := map[string]string{}
	groupModes := map[string][]string{}
	for _, item := range util.AsMapSlice(body["items"]) {
		id := util.Clean(item["id"])
		kinds[id] = util.Clean(item["kind"])
		groupModes[id] = util.AsStringSlice(item["group_modes"])
	}
	if kinds["claude-sonnet-4-5"] != "text" || !reflect.DeepEqual(groupModes["claude-sonnet-4-5"], []string{"chat"}) {
		t.Fatalf("claude model missing or misclassified: kinds=%#v group_modes=%#v items=%#v", kinds, groupModes, body["items"])
	}
	if kinds["claude-opus-4-6"] != "text" || !reflect.DeepEqual(groupModes["claude-opus-4-6"], []string{"chat"}) {
		t.Fatalf("mixed-capability claude model missing or misclassified: kinds=%#v group_modes=%#v items=%#v", kinds, groupModes, body["items"])
	}
	if kinds[util.ImageModelGPT] != "image" || !reflect.DeepEqual(groupModes[util.ImageModelGPT], []string{"image"}) {
		t.Fatalf("image model missing or misclassified: kinds=%#v group_modes=%#v items=%#v", kinds, groupModes, body["items"])
	}
	for _, item := range util.AsMapSlice(body["items"]) {
		if util.Clean(item["id"]) == "gpt-image-2" && reflect.DeepEqual(util.AsStringSlice(item["group_modes"]), []string{"chat"}) {
			t.Fatalf("image model leaked into chat group: %#v", body["items"])
		}
		if util.Clean(item["id"]) == "claude-opus-4-6" && reflect.DeepEqual(util.AsStringSlice(item["group_modes"]), []string{"image"}) {
			t.Fatalf("mixed-capability text model leaked into image group: %#v", body["items"])
		}
	}
	expectedRequests := []string{
		"chat-group:/model-catalog",
		"chat-group:/models",
		"image-group:/model-catalog",
		"image-group:/models",
		"video-group:/model-catalog",
		"video-group:/models",
	}
	if !reflect.DeepEqual(requests, expectedRequests) {
		t.Fatalf("gateway requests = %#v", requests)
	}
}

func TestLuoyeIndependentCanvasModelsSupplementVideoGroupModelsByName(t *testing.T) {
	requests := []string{}
	gateway := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Sub2API-Studio-Secret") != "secret" {
			t.Fatalf("gateway secret header = %q", r.Header.Get("X-Sub2API-Studio-Secret"))
		}
		if r.Header.Get("X-Sub2API-Studio-User-ID") != "42" {
			t.Fatalf("gateway user header = %q", r.Header.Get("X-Sub2API-Studio-User-ID"))
		}
		groupID := r.Header.Get("X-Sub2API-Group-ID")
		requests = append(requests, groupID+":"+r.URL.Path)
		switch r.URL.Path {
		case "/model-catalog":
			switch groupID {
			case "chat-group":
				util.WriteJSON(w, http.StatusOK, map[string]any{"items": []map[string]any{
					{"id": "gpt-5.4", "name": "gpt-5.4", "capabilities": []string{"chat"}, "enabled": true},
				}})
			case "image-group":
				util.WriteJSON(w, http.StatusOK, map[string]any{"items": []map[string]any{
					{"id": util.ImageModelGPT, "name": util.ImageModelGPT, "capabilities": []string{"image"}, "enabled": true},
				}})
			case "video-group":
				util.WriteJSON(w, http.StatusOK, map[string]any{"items": []map[string]any{
					{"id": "plain-text-label", "name": "Plain Text Label", "enabled": true},
					{"id": "wan2.7", "name": "wan2.7", "capabilities": []string{"video"}, "enabled": false},
					{"id": "kling-v2-6", "name": "kling-v2-6", "category": "video", "enabled": false},
				}})
			default:
				t.Fatalf("unexpected catalog group header %q", groupID)
			}
		case "/models":
			switch groupID {
			case "chat-group":
				util.WriteJSON(w, http.StatusOK, map[string]any{"data": []map[string]any{}})
			case "image-group":
				util.WriteJSON(w, http.StatusOK, map[string]any{"data": []map[string]any{}})
			case "video-group":
				util.WriteJSON(w, http.StatusOK, map[string]any{"data": []map[string]any{
					{"id": "doubao-seedance-2.0"},
					{"id": "sora-2"},
				}})
			default:
				t.Fatalf("unexpected models group header %q", groupID)
			}
		default:
			t.Fatalf("gateway request = %s %s", r.Method, r.URL.Path)
		}
	}))
	defer gateway.Close()

	bridge := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/internal/redeem":
			util.WriteJSON(w, http.StatusOK, map[string]any{"code": 0, "data": map[string]any{"user_id": 42, "email": "luoye@example.com", "username": "Luoye User", "default_chat_group": "chat-group", "default_image_group": "image-group", "default_video_group": "video-group", "gateway_base_url": gateway.URL}})
		case "/internal/user-summary":
			util.WriteJSON(w, http.StatusOK, map[string]any{"code": 0, "data": map[string]any{"user_id": 42, "balance": 99}})
		default:
			t.Fatalf("bridge request = %s %s", r.Method, r.URL.Path)
		}
	}))
	defer bridge.Close()

	app := newIndependentTestApp(t, bridge.URL+"/internal/redeem", "secret", gateway.URL)
	defer app.Close()
	sessionKey := launchIndependentSub2APITestSession(t, app, "launch-token")

	req := httptest.NewRequest(http.MethodGet, "/api/canvas/models", nil)
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("canvas models status = %d body = %s", res.Code, res.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("canvas models json: %v", err)
	}
	kinds := map[string]string{}
	groupModes := map[string][]string{}
	enabled := map[string]bool{}
	for _, item := range util.AsMapSlice(body["items"]) {
		id := util.Clean(item["id"])
		kinds[id] = util.Clean(item["kind"])
		groupModes[id] = util.AsStringSlice(item["group_modes"])
		enabled[id] = util.ToBool(item["enabled"])
	}
	if kinds["doubao-seedance-2.0"] != "video" || !reflect.DeepEqual(groupModes["doubao-seedance-2.0"], []string{"video"}) {
		t.Fatalf("seedance video model missing or misclassified: kinds=%#v group_modes=%#v items=%#v", kinds, groupModes, body["items"])
	}
	if kinds["sora-2"] != "video" || !reflect.DeepEqual(groupModes["sora-2"], []string{"video"}) {
		t.Fatalf("sora video model missing or misclassified: kinds=%#v group_modes=%#v items=%#v", kinds, groupModes, body["items"])
	}
	if kinds["wan2.7"] != "video" || !reflect.DeepEqual(groupModes["wan2.7"], []string{"video"}) {
		t.Fatalf("disabled catalog wan video model should be available in video group: kinds=%#v group_modes=%#v items=%#v", kinds, groupModes, body["items"])
	}
	if kinds["kling-v2-6"] != "video" || !reflect.DeepEqual(groupModes["kling-v2-6"], []string{"video"}) {
		t.Fatalf("disabled catalog kling video model should be available in video group: kinds=%#v group_modes=%#v items=%#v", kinds, groupModes, body["items"])
	}
	if !enabled["wan2.7"] || !enabled["kling-v2-6"] {
		t.Fatalf("video group models should be frontend-selectable even when catalog reports enabled=false: %#v", enabled)
	}
	if _, ok := kinds["plain-text-label"]; ok {
		t.Fatalf("catalog item without video capability should not be treated as video: %#v", body["items"])
	}
	expectedRequests := []string{
		"chat-group:/model-catalog",
		"chat-group:/models",
		"image-group:/model-catalog",
		"image-group:/models",
		"video-group:/model-catalog",
		"video-group:/models",
	}
	if !reflect.DeepEqual(requests, expectedRequests) {
		t.Fatalf("gateway requests = %#v", requests)
	}
}

func TestLuoyeIndependentChatAutoUsesDefaultGroupCatalogModel(t *testing.T) {
	var chatPayload map[string]any
	var chatGroupHeader string
	calls := []string{}
	gateway := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Sub2API-Studio-Secret") != "secret" {
			t.Fatalf("gateway secret header = %q", r.Header.Get("X-Sub2API-Studio-Secret"))
		}
		switch r.URL.Path {
		case "/model-catalog":
			if r.Header.Get("X-Sub2API-Group-ID") != "chat-group" {
				t.Fatalf("model catalog group header = %q", r.Header.Get("X-Sub2API-Group-ID"))
			}
			util.WriteJSON(w, http.StatusOK, map[string]any{"items": []map[string]any{{"id": "chat-group-model", "name": "Chat Group Model", "capabilities": []string{"chat"}, "enabled": true}}})
		case "/models":
			if r.Header.Get("X-Sub2API-Group-ID") != "chat-group" {
				t.Fatalf("models group header = %q", r.Header.Get("X-Sub2API-Group-ID"))
			}
			util.WriteJSON(w, http.StatusOK, map[string]any{"data": []map[string]any{}})
		case "/chat/completions":
			chatGroupHeader = r.Header.Get("X-Sub2API-Group-ID")
			if err := json.NewDecoder(r.Body).Decode(&chatPayload); err != nil {
				t.Fatalf("chat json: %v", err)
			}
			util.WriteJSON(w, http.StatusOK, map[string]any{"created": 123, "choices": []map[string]any{{"message": map[string]any{"content": "ok"}}}})
		default:
			t.Fatalf("gateway request = %s %s", r.Method, r.URL.Path)
		}
	}))
	defer gateway.Close()

	bridge := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/internal/redeem":
			util.WriteJSON(w, http.StatusOK, map[string]any{"code": 0, "data": map[string]any{"user_id": 42, "email": "luoye@example.com", "username": "Luoye User", "default_chat_group": "chat-group", "default_image_group": "image-group", "gateway_base_url": gateway.URL}})
		case "/internal/charges/reserve", "/internal/charges/commit", "/internal/charges/refund":
			var payload map[string]any
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				t.Fatalf("bridge charge json: %v", err)
			}
			if payload["app_id"] != "luoye-ai" || payload["user_id"] != float64(42) || payload["charge_key"] == "" || !strings.Contains(util.Clean(payload["reason"]), "mode=chat") {
				t.Fatalf("bridge charge payload = %#v", payload)
			}
			calls = append(calls, strings.TrimPrefix(r.URL.Path, "/internal/charges/"))
			util.WriteJSON(w, http.StatusOK, map[string]any{"code": 0, "data": map[string]any{"ok": true}})
		case "/internal/user-summary":
			util.WriteJSON(w, http.StatusOK, map[string]any{"code": 0, "data": map[string]any{"user_id": 42, "balance": 99}})
		default:
			t.Fatalf("bridge request = %s %s", r.Method, r.URL.Path)
		}
	}))
	defer bridge.Close()

	app := newIndependentTestApp(t, bridge.URL+"/internal/redeem", "secret", gateway.URL)
	defer app.Close()
	sessionKey := launchIndependentSub2APITestSession(t, app, "launch-token")

	req := httptest.NewRequest(http.MethodPost, "/api/creation-tasks/chat-completions", strings.NewReader(`{"client_task_id":"luoye-chat","prompt":"hello","model":"auto","messages":[{"role":"user","content":"hello"}]}`))
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("submit status = %d body = %s", res.Code, res.Body.String())
	}
	waitForHTTPTestCondition(t, func() bool {
		req = httptest.NewRequest(http.MethodGet, "/api/creation-tasks?ids=luoye-chat", nil)
		req.Header.Set("Authorization", "Bearer "+sessionKey)
		res = httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		var listed map[string]any
		_ = json.Unmarshal(res.Body.Bytes(), &listed)
		items := util.AsMapSlice(listed["items"])
		return len(items) == 1 && items[0]["status"] == service.TaskStatusSuccess
	})
	if chatGroupHeader != "chat-group" {
		t.Fatalf("chat group header = %q", chatGroupHeader)
	}
	if chatPayload["model"] != "chat-group-model" {
		t.Fatalf("chat model = %#v payload=%#v", chatPayload["model"], chatPayload)
	}
	if chatPayload["group_id"] != "chat-group" {
		t.Fatalf("chat group_id = %#v payload=%#v", chatPayload["group_id"], chatPayload)
	}
	if !reflect.DeepEqual(calls, []string{"reserve", "commit"}) {
		t.Fatalf("billing calls = %#v", calls)
	}
}

func TestLuoyeIndependentSocialCopyIsBillable(t *testing.T) {
	calls := []string{}
	gateway := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Sub2API-Studio-Secret") != "secret" {
			t.Fatalf("gateway secret header = %q", r.Header.Get("X-Sub2API-Studio-Secret"))
		}
		switch r.URL.Path {
		case "/model-catalog":
			util.WriteJSON(w, http.StatusOK, map[string]any{"items": []map[string]any{{"id": "chat-group-model", "name": "Chat Group Model", "capabilities": []string{"chat"}, "enabled": true}}})
		case "/models":
			util.WriteJSON(w, http.StatusOK, map[string]any{"data": []map[string]any{}})
		case "/chat/completions":
			util.WriteJSON(w, http.StatusOK, map[string]any{"created": 123, "choices": []map[string]any{{"message": map[string]any{"content": "copy ok"}}}})
		default:
			t.Fatalf("gateway request = %s %s", r.Method, r.URL.Path)
		}
	}))
	defer gateway.Close()

	bridge := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/internal/redeem":
			util.WriteJSON(w, http.StatusOK, map[string]any{"code": 0, "data": map[string]any{"user_id": 42, "email": "luoye@example.com", "username": "Luoye User", "default_chat_group": "chat-group", "gateway_base_url": gateway.URL}})
		case "/internal/charges/reserve", "/internal/charges/commit", "/internal/charges/refund":
			var payload map[string]any
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				t.Fatalf("bridge charge json: %v", err)
			}
			if payload["app_id"] != "luoye-ai" || payload["user_id"] != float64(42) || !strings.Contains(util.Clean(payload["reason"]), "mode=chat") {
				t.Fatalf("bridge charge payload = %#v", payload)
			}
			calls = append(calls, strings.TrimPrefix(r.URL.Path, "/internal/charges/"))
			util.WriteJSON(w, http.StatusOK, map[string]any{"code": 0, "data": map[string]any{"ok": true}})
		case "/internal/user-summary":
			util.WriteJSON(w, http.StatusOK, map[string]any{"code": 0, "data": map[string]any{"user_id": 42, "balance": 99}})
		default:
			t.Fatalf("bridge request = %s %s", r.Method, r.URL.Path)
		}
	}))
	defer bridge.Close()

	app := newIndependentTestApp(t, bridge.URL+"/internal/redeem", "secret", gateway.URL)
	defer app.Close()
	sessionKey := launchIndependentSub2APITestSession(t, app, "launch-token")

	req := httptest.NewRequest(http.MethodPost, "/api/social-projects", strings.NewReader(`{"platform":"xhs","topic":"新品发布","cards":[{"title":"A","body":"B"}]}`))
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("create social project status = %d body = %s", res.Code, res.Body.String())
	}
	var created map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &created); err != nil {
		t.Fatalf("create social project json: %v", err)
	}
	projectID := util.Clean(util.StringMap(created["item"])["id"])
	if projectID == "" {
		t.Fatalf("created social project missing id: %#v", created)
	}

	req = httptest.NewRequest(http.MethodPost, "/api/social-projects/"+projectID+"/generate-copy", strings.NewReader(`{"model":"auto","client_task_id":"social-copy-billable"}`))
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("generate copy status = %d body = %s", res.Code, res.Body.String())
	}
	waitForHTTPTestCondition(t, func() bool {
		req = httptest.NewRequest(http.MethodGet, "/api/creation-tasks?ids=social-copy-billable", nil)
		req.Header.Set("Authorization", "Bearer "+sessionKey)
		res = httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		var listed map[string]any
		_ = json.Unmarshal(res.Body.Bytes(), &listed)
		items := util.AsMapSlice(listed["items"])
		return len(items) == 1 && items[0]["status"] == service.TaskStatusSuccess
	})
	if !reflect.DeepEqual(calls, []string{"reserve", "commit"}) {
		t.Fatalf("billing calls = %#v", calls)
	}
}

func TestLuoyeIndependentSocialCopyInsufficientBalanceReturns429(t *testing.T) {
	gateway := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/model-catalog":
			util.WriteJSON(w, http.StatusOK, map[string]any{"items": []map[string]any{{"id": "chat-group-model", "name": "Chat Group Model", "capabilities": []string{"chat"}, "enabled": true}}})
		default:
			t.Fatalf("gateway request = %s %s", r.Method, r.URL.Path)
		}
	}))
	defer gateway.Close()

	bridge := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/internal/redeem":
			util.WriteJSON(w, http.StatusOK, map[string]any{"code": 0, "data": map[string]any{"user_id": 42, "email": "luoye@example.com", "username": "Luoye User", "default_chat_group": "chat-group", "gateway_base_url": gateway.URL}})
		case "/internal/charges/reserve":
			util.WriteJSON(w, http.StatusOK, map[string]any{"code": 1001, "message": "user balance insufficient"})
		case "/internal/user-summary":
			util.WriteJSON(w, http.StatusOK, map[string]any{"code": 0, "data": map[string]any{"user_id": 42, "balance": 0}})
		default:
			t.Fatalf("bridge request = %s %s", r.Method, r.URL.Path)
		}
	}))
	defer bridge.Close()

	app := newIndependentTestApp(t, bridge.URL+"/internal/redeem", "secret", gateway.URL)
	defer app.Close()
	sessionKey := launchIndependentSub2APITestSession(t, app, "launch-token")

	req := httptest.NewRequest(http.MethodPost, "/api/social-projects", strings.NewReader(`{"platform":"xhs","topic":"余额不足","cards":[{"title":"A","body":"B"}]}`))
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("create social project status = %d body = %s", res.Code, res.Body.String())
	}
	var created map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &created); err != nil {
		t.Fatalf("create social project json: %v", err)
	}
	projectID := util.Clean(util.StringMap(created["item"])["id"])

	req = httptest.NewRequest(http.MethodPost, "/api/social-projects/"+projectID+"/generate-copy", strings.NewReader(`{"model":"auto","client_task_id":"social-copy-insufficient"}`))
	req.Header.Set("Authorization", "Bearer "+sessionKey)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusTooManyRequests {
		t.Fatalf("generate copy insufficient status = %d body = %s", res.Code, res.Body.String())
	}
	if !strings.Contains(res.Body.String(), "user_balance_insufficient") {
		t.Fatalf("generate copy insufficient body = %s", res.Body.String())
	}
}

func TestLuoyeIndependentCanvasPromptNodeIsBillable(t *testing.T) {
	calls := []string{}
	gateway := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Sub2API-Studio-Secret") != "secret" {
			t.Fatalf("gateway secret header = %q", r.Header.Get("X-Sub2API-Studio-Secret"))
		}
		switch r.URL.Path {
		case "/model-catalog":
			util.WriteJSON(w, http.StatusOK, map[string]any{"items": []map[string]any{{"id": "chat-group-model", "name": "Chat Group Model", "capabilities": []string{"chat"}, "enabled": true}}})
		case "/models":
			util.WriteJSON(w, http.StatusOK, map[string]any{"data": []map[string]any{}})
		case "/chat/completions":
			util.WriteJSON(w, http.StatusOK, map[string]any{"created": 123, "choices": []map[string]any{{"message": map[string]any{"content": "optimized prompt"}}}})
		default:
			t.Fatalf("gateway request = %s %s", r.Method, r.URL.Path)
		}
	}))
	defer gateway.Close()

	bridge := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/internal/redeem":
			util.WriteJSON(w, http.StatusOK, map[string]any{"code": 0, "data": map[string]any{"user_id": 42, "email": "luoye@example.com", "username": "Luoye User", "default_chat_group": "chat-group", "gateway_base_url": gateway.URL}})
		case "/internal/charges/reserve", "/internal/charges/commit", "/internal/charges/refund":
			var payload map[string]any
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				t.Fatalf("bridge charge json: %v", err)
			}
			if payload["app_id"] != "luoye-ai" || payload["user_id"] != float64(42) || !strings.Contains(util.Clean(payload["reason"]), "mode=chat") {
				t.Fatalf("bridge charge payload = %#v", payload)
			}
			calls = append(calls, strings.TrimPrefix(r.URL.Path, "/internal/charges/"))
			util.WriteJSON(w, http.StatusOK, map[string]any{"code": 0, "data": map[string]any{"ok": true}})
		case "/internal/user-summary":
			util.WriteJSON(w, http.StatusOK, map[string]any{"code": 0, "data": map[string]any{"user_id": 42, "balance": 99}})
		default:
			t.Fatalf("bridge request = %s %s", r.Method, r.URL.Path)
		}
	}))
	defer bridge.Close()

	app := newIndependentTestApp(t, bridge.URL+"/internal/redeem", "secret", gateway.URL)
	defer app.Close()
	sessionKey := launchIndependentSub2APITestSession(t, app, "launch-token")
	identity := app.auth.Authenticate(sessionKey)
	if identity == nil {
		t.Fatal("independent session not found")
	}
	out, err := app.ExecuteCanvasNode(context.Background(), *identity, service.CanvasNodeExecution{
		RunID:    "run-billing",
		CanvasID: "canvas-billing",
		Node: service.CanvasNode{
			ID:   "prompt-node",
			Type: service.CanvasNodeTypePrompt,
			Data: map[string]any{"prompt": "make it concise", "model": "auto"},
		},
	})
	if err != nil {
		t.Fatalf("ExecuteCanvasNode() error = %v", err)
	}
	if out.Text != "optimized prompt" {
		t.Fatalf("canvas prompt output = %#v", out)
	}
	if !reflect.DeepEqual(calls, []string{"reserve", "commit"}) {
		t.Fatalf("billing calls = %#v", calls)
	}
}

func TestTeamInvitesRequireTargetEmailAndTaskContext(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()
	owner := service.AuthOwner{ID: "sub2api:100", Name: "Owner", Provider: service.AuthProviderSub2API}
	_, ownerSession, err := app.auth.UpsertSub2APISession(owner)
	if err != nil {
		t.Fatalf("owner session: %v", err)
	}
	member := service.AuthOwner{ID: "sub2api:200", Name: "Member", Provider: service.AuthProviderSub2API}
	_, memberSession, err := app.auth.UpsertSub2APISession(member)
	if err != nil {
		t.Fatalf("member session: %v", err)
	}
	other := service.AuthOwner{ID: "sub2api:300", Name: "Other", Provider: service.AuthProviderSub2API}
	_, otherSession, err := app.auth.UpsertSub2APISession(other)
	if err != nil {
		t.Fatalf("other session: %v", err)
	}
	saveTestSub2APIBinding(t, app, owner.ID, "owner@example.com")
	saveTestSub2APIBinding(t, app, member.ID, "member@example.com")
	saveTestSub2APIBinding(t, app, other.ID, "other@example.com")

	req := httptest.NewRequest(http.MethodPost, "/api/teams", strings.NewReader(`{"name":"Design Team"}`))
	req.Header.Set("Authorization", "Bearer "+ownerSession)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("create team status = %d body = %s", res.Code, res.Body.String())
	}
	var created map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &created); err != nil {
		t.Fatalf("create team json: %v", err)
	}
	team := util.StringMap(created["team"])
	teamID := util.Clean(team["id"])
	if teamID == "" || util.Clean(team["invite_code"]) != "" {
		t.Fatalf("created team = %#v", team)
	}

	req = httptest.NewRequest(http.MethodPost, "/api/teams", strings.NewReader(`{"name":"Second Team"}`))
	req.Header.Set("Authorization", "Bearer "+ownerSession)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest || !strings.Contains(res.Body.String(), "当前账号已加入团队") {
		t.Fatalf("create second team status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPost, "/api/teams/join", strings.NewReader(`{"invite_code":"legacy"}`))
	req.Header.Set("Authorization", "Bearer "+otherSession)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusGone {
		t.Fatalf("open join status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPost, "/api/teams/"+teamID+"/invites", strings.NewReader(`{"email":"member@example.com","role":"member"}`))
	req.Header.Set("Authorization", "Bearer "+memberSession)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("non-owner invite status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPost, "/api/teams/"+teamID+"/invites", strings.NewReader(`{"email":"member@example.com","role":"member"}`))
	req.Header.Set("Authorization", "Bearer "+ownerSession)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("create invite status = %d body = %s", res.Code, res.Body.String())
	}
	var invited map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &invited); err != nil {
		t.Fatalf("invite json: %v", err)
	}
	invite := util.StringMap(invited["invite"])
	inviteID := util.Clean(invite["id"])
	if inviteID == "" || invite["target_email"] != "member@example.com" {
		t.Fatalf("invite = %#v", invite)
	}

	req = httptest.NewRequest(http.MethodPost, "/api/team-invites/"+inviteID+"/accept", nil)
	req.Header.Set("Authorization", "Bearer "+otherSession)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("wrong email accept status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPost, "/api/team-invites/"+inviteID+"/accept", nil)
	req.Header.Set("Authorization", "Bearer "+memberSession)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("accept invite status = %d body = %s", res.Code, res.Body.String())
	}
	req = httptest.NewRequest(http.MethodPost, "/api/teams/current", strings.NewReader(jsonString(map[string]any{"team_id": ""})))
	req.Header.Set("Authorization", "Bearer "+memberSession)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("clear current team status = %d body = %s", res.Code, res.Body.String())
	}
	var currentWorkspace map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &currentWorkspace); err != nil {
		t.Fatalf("current workspace json: %v", err)
	}
	if currentWorkspace["current_space"] != "personal" || util.Clean(currentWorkspace["current_team_id"]) != "" {
		t.Fatalf("current workspace = %#v", currentWorkspace)
	}
	if teams := util.AsMapSlice(currentWorkspace["teams"]); len(teams) != 1 || util.Clean(teams[0]["id"]) != teamID {
		t.Fatalf("current workspace teams = %#v", teams)
	}
	req = httptest.NewRequest(http.MethodGet, "/api/teams", nil)
	req.Header.Set("Authorization", "Bearer "+memberSession)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("member list teams status = %d body = %s", res.Code, res.Body.String())
	}
	var memberWorkspace map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &memberWorkspace); err != nil {
		t.Fatalf("member list teams json: %v", err)
	}
	memberTeams := util.AsMapSlice(memberWorkspace["teams"])
	if len(memberTeams) != 1 {
		t.Fatalf("member teams = %#v", memberTeams)
	}
	if len(util.AsMapSlice(memberTeams[0]["members"])) != 2 || util.ToInt(memberTeams[0]["member_count"], 0) != 2 {
		t.Fatalf("member teams missing members: %#v", memberTeams)
	}
	req = httptest.NewRequest(http.MethodGet, "/api/teams", nil)
	req.Header.Set("Authorization", "Bearer "+ownerSession)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("owner list teams status = %d body = %s", res.Code, res.Body.String())
	}
	var ownerWorkspace map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &ownerWorkspace); err != nil {
		t.Fatalf("owner list teams json: %v", err)
	}
	ownerTeams := util.AsMapSlice(ownerWorkspace["teams"])
	if len(ownerTeams) != 1 || len(util.AsMapSlice(ownerTeams[0]["members"])) != 2 || util.ToInt(ownerTeams[0]["member_count"], 0) != 2 {
		t.Fatalf("owner teams missing members: %#v", ownerTeams)
	}
	req = httptest.NewRequest(http.MethodPost, "/api/team-invites/"+inviteID+"/accept", nil)
	req.Header.Set("Authorization", "Bearer "+memberSession)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("accept used invite status = %d body = %s", res.Code, res.Body.String())
	}
	revokedInviteID := createHTTPTestInvite(t, app, ownerSession, teamID, "other@example.com", "member")
	req = httptest.NewRequest(http.MethodDelete, "/api/team-invites/"+revokedInviteID, nil)
	req.Header.Set("Authorization", "Bearer "+ownerSession)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("revoke invite status = %d body = %s", res.Code, res.Body.String())
	}
	req = httptest.NewRequest(http.MethodPost, "/api/team-invites/"+revokedInviteID+"/accept", nil)
	req.Header.Set("Authorization", "Bearer "+otherSession)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("accept revoked invite status = %d body = %s", res.Code, res.Body.String())
	}
	expiredInviteID := createHTTPTestInvite(t, app, ownerSession, teamID, "other@example.com", "member")
	expireHTTPTestInvite(t, app, expiredInviteID)
	req = httptest.NewRequest(http.MethodPost, "/api/team-invites/"+expiredInviteID+"/accept", nil)
	req.Header.Set("Authorization", "Bearer "+otherSession)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("accept expired invite status = %d body = %s", res.Code, res.Body.String())
	}
	req = httptest.NewRequest(http.MethodPost, "/api/teams/current", strings.NewReader(jsonString(map[string]any{"team_id": teamID})))
	req.Header.Set("Authorization", "Bearer "+memberSession)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("switch team status = %d body = %s", res.Code, res.Body.String())
	}
	ctx, err := app.teams.TaskContext(service.Identity{Role: service.AuthRoleUser, Provider: service.AuthProviderSub2API, OwnerID: member.ID, Name: member.Name}, teamID)
	if err != nil {
		t.Fatalf("task context: %v", err)
	}
	if ctx.TeamID != teamID || ctx.PayerUserID != owner.ID || ctx.ActorUserID != member.ID {
		t.Fatalf("task context = %#v", ctx)
	}
	app.tasks = service.NewStoredImageTaskService(testJSONStoreFromApp(t, app),
		failingHTTPImageTaskHandler,
		failingHTTPImageTaskHandler,
		func(ctx context.Context, identity service.Identity, payload map[string]any) (map[string]any, error) {
			return map[string]any{"output_type": "text", "data": []map[string]any{{"text_response": "ok"}}}, nil
		},
		func() int { return 30 },
	)
	req = httptest.NewRequest(http.MethodPost, "/api/creation-tasks/chat-completions", strings.NewReader(`{"client_task_id":"team-chat-task","prompt":"hello","model":"gpt-5","messages":[{"role":"user","content":"hello"}]}`))
	req.Header.Set("Authorization", "Bearer "+memberSession)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("submit team chat task status = %d body = %s", res.Code, res.Body.String())
	}
	waitForHTTPTestCondition(t, func() bool {
		req = httptest.NewRequest(http.MethodGet, "/api/teams/"+teamID+"/usage", nil)
		req.Header.Set("Authorization", "Bearer "+memberSession)
		res = httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		var usageBody map[string]any
		_ = json.Unmarshal(res.Body.Bytes(), &usageBody)
		items := util.AsMapSlice(usageBody["items"])
		return res.Code == http.StatusOK &&
			len(items) == 1 &&
			util.Clean(items[0]["id"]) == "team-chat-task" &&
			util.Clean(items[0]["team_id"]) == teamID &&
			util.Clean(items[0]["payer_user_id"]) == owner.ID &&
			util.Clean(items[0]["actor_user_id"]) == member.ID &&
			util.Clean(items[0]["actor_name"]) == member.Name &&
			util.ToInt(items[0]["billing_consumed_amount"], 0) > 0
	})

	secondOwner := service.AuthOwner{ID: "sub2api:400", Name: "Second Owner", Provider: service.AuthProviderSub2API}
	_, secondOwnerSession, err := app.auth.UpsertSub2APISession(secondOwner)
	if err != nil {
		t.Fatalf("second owner session: %v", err)
	}
	saveTestSub2APIBinding(t, app, secondOwner.ID, "second-owner@example.com")
	secondTeamID := createHTTPTestTeam(t, app, secondOwnerSession)
	secondInviteID := createHTTPTestInvite(t, app, secondOwnerSession, secondTeamID, "member@example.com", "member")
	req = httptest.NewRequest(http.MethodPost, "/api/team-invites/"+secondInviteID+"/accept", nil)
	req.Header.Set("Authorization", "Bearer "+memberSession)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest || !strings.Contains(res.Body.String(), "当前账号已加入团队") {
		t.Fatalf("accept second team invite status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/teams/"+teamID+"/audit-logs", nil)
	req.Header.Set("Authorization", "Bearer "+ownerSession)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("owner audit status = %d body = %s", res.Code, res.Body.String())
	}
	var auditBody map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &auditBody); err != nil {
		t.Fatalf("owner audit json: %v", err)
	}
	for _, item := range util.AsMapSlice(auditBody["items"]) {
		if util.Clean(item["action"]) == "space.switched" {
			t.Fatalf("audit log contains space.switched: %#v", auditBody)
		}
	}
	if items := util.AsMapSlice(auditBody["items"]); len(items) == 0 || util.Clean(items[0]["actor_name"]) == "" {
		t.Fatalf("audit log missing actor_name: %#v", auditBody)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/teams/"+teamID+"/audit-logs", nil)
	req.Header.Set("Authorization", "Bearer "+memberSession)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("member audit status = %d body = %s", res.Code, res.Body.String())
	}
}

func TestTeamOwnerAndManagerRoleBoundaries(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()
	owner := service.AuthOwner{ID: "sub2api:owner", Name: "Owner", Provider: service.AuthProviderSub2API}
	manager := service.AuthOwner{ID: "sub2api:manager", Name: "Manager", Provider: service.AuthProviderSub2API}
	member := service.AuthOwner{ID: "sub2api:member", Name: "Member", Provider: service.AuthProviderSub2API}
	_, ownerSession, err := app.auth.UpsertSub2APISession(owner)
	if err != nil {
		t.Fatalf("owner session: %v", err)
	}
	_, managerSession, err := app.auth.UpsertSub2APISession(manager)
	if err != nil {
		t.Fatalf("manager session: %v", err)
	}
	_, memberSession, err := app.auth.UpsertSub2APISession(member)
	if err != nil {
		t.Fatalf("member session: %v", err)
	}
	saveTestSub2APIBinding(t, app, owner.ID, "owner@example.com")
	saveTestSub2APIBinding(t, app, manager.ID, "manager@example.com")
	saveTestSub2APIBinding(t, app, member.ID, "member@example.com")

	teamID := createHTTPTestTeam(t, app, ownerSession)
	managerInvite := createHTTPTestInvite(t, app, ownerSession, teamID, "manager@example.com", "manager")
	acceptHTTPTestInvite(t, app, managerSession, managerInvite)
	memberInvite := createHTTPTestInvite(t, app, ownerSession, teamID, "member@example.com", "member")
	acceptHTTPTestInvite(t, app, memberSession, memberInvite)

	req := httptest.NewRequest(http.MethodPost, "/api/teams/"+teamID+"/invites", strings.NewReader(`{"email":"new@example.com","role":"member"}`))
	req.Header.Set("Authorization", "Bearer "+managerSession)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("manager create invite status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPatch, "/api/teams/"+teamID+"/members/"+member.ID, strings.NewReader(`{"role":"manager"}`))
	req.Header.Set("Authorization", "Bearer "+managerSession)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("manager promote member status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPatch, "/api/teams/"+teamID+"/members/"+member.ID, strings.NewReader(`{"daily_limit_amount":51}`))
	req.Header.Set("Authorization", "Bearer "+managerSession)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("manager change manager daily limit status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPatch, "/api/teams/"+teamID+"/members/"+manager.ID, strings.NewReader(`{"role":"member"}`))
	req.Header.Set("Authorization", "Bearer "+managerSession)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("manager change self status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodDelete, "/api/teams/"+teamID+"/members/"+manager.ID, nil)
	req.Header.Set("Authorization", "Bearer "+managerSession)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("manager remove self status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPatch, "/api/teams/"+teamID+"/members/"+manager.ID, strings.NewReader(`{"daily_limit_amount":51}`))
	req.Header.Set("Authorization", "Bearer "+managerSession)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("manager change self daily limit status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPatch, "/api/teams/"+teamID+"/members/"+member.ID, strings.NewReader(`{"role":"member"}`))
	req.Header.Set("Authorization", "Bearer "+managerSession)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("manager change manager status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPost, "/api/teams/"+teamID+"/members/"+member.ID, strings.NewReader(`{"role":"member"}`))
	req.Header.Set("Authorization", "Bearer "+managerSession)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusMethodNotAllowed {
		t.Fatalf("post member role status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPatch, "/api/teams/"+teamID+"/members/"+owner.ID, strings.NewReader(`{"role":"member"}`))
	req.Header.Set("Authorization", "Bearer "+managerSession)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("manager change owner status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPatch, "/api/teams/"+teamID+"/members/"+owner.ID, strings.NewReader(`{"daily_limit_amount":51}`))
	req.Header.Set("Authorization", "Bearer "+managerSession)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("manager change owner daily limit status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodDelete, "/api/teams/"+teamID+"/members/"+owner.ID, nil)
	req.Header.Set("Authorization", "Bearer "+managerSession)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("manager remove owner status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPatch, "/api/teams/"+teamID+"/members/"+member.ID, strings.NewReader(`{"role":"member"}`))
	req.Header.Set("Authorization", "Bearer "+ownerSession)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("owner change manager status = %d body = %s", res.Code, res.Body.String())
	}
}

func TestTeamMemberRemarkAndDisplayName(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()
	owner := service.AuthOwner{ID: "sub2api:remark-owner", Name: "Remark Owner", Provider: service.AuthProviderSub2API}
	manager := service.AuthOwner{ID: "sub2api:remark-manager", Name: "Remark Manager", Provider: service.AuthProviderSub2API}
	member := service.AuthOwner{ID: "sub2api:remark-member", Name: "Original Member", Provider: service.AuthProviderSub2API}
	_, ownerSession, err := app.auth.UpsertSub2APISession(owner)
	if err != nil {
		t.Fatalf("owner session: %v", err)
	}
	_, managerSession, err := app.auth.UpsertSub2APISession(manager)
	if err != nil {
		t.Fatalf("manager session: %v", err)
	}
	_, memberSession, err := app.auth.UpsertSub2APISession(member)
	if err != nil {
		t.Fatalf("member session: %v", err)
	}
	saveTestSub2APIBinding(t, app, owner.ID, "remark-owner@example.com")
	saveTestSub2APIBinding(t, app, manager.ID, "remark-manager@example.com")
	saveTestSub2APIBinding(t, app, member.ID, "remark-member@example.com")

	teamID := createHTTPTestTeam(t, app, ownerSession)
	managerInvite := createHTTPTestInvite(t, app, ownerSession, teamID, "remark-manager@example.com", "manager")
	acceptHTTPTestInvite(t, app, managerSession, managerInvite)
	memberInvite := createHTTPTestInvite(t, app, ownerSession, teamID, "remark-member@example.com", "member")
	acceptHTTPTestInvite(t, app, memberSession, memberInvite)

	req := httptest.NewRequest(http.MethodPatch, "/api/teams/"+teamID+"/members/"+member.ID, strings.NewReader(`{"remark":"设计组 A"}`))
	req.Header.Set("Authorization", "Bearer "+managerSession)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("manager set member remark status = %d body = %s", res.Code, res.Body.String())
	}
	var patchBody map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &patchBody); err != nil {
		t.Fatalf("remark patch json: %v", err)
	}
	team := util.StringMap(patchBody["team"])
	foundRemark := false
	for _, item := range util.AsMapSlice(team["members"]) {
		if util.Clean(item["user_id"]) == member.ID {
			foundRemark = util.Clean(item["remark"]) == "设计组 A"
		}
	}
	if !foundRemark {
		t.Fatalf("member remark missing after patch: %#v", team)
	}

	req = httptest.NewRequest(http.MethodPatch, "/api/teams/"+teamID+"/members/"+member.ID, strings.NewReader(`{"remark":"自己改"}`))
	req.Header.Set("Authorization", "Bearer "+memberSession)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("member set own remark status = %d body = %s", res.Code, res.Body.String())
	}

	if updated := app.auth.UpdateUser(member.ID, map[string]any{"name": "Renamed Member"}); updated == nil {
		t.Fatal("UpdateUser(name) returned nil")
	}
	req = httptest.NewRequest(http.MethodGet, "/api/teams", nil)
	req.Header.Set("Authorization", "Bearer "+ownerSession)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("owner teams status = %d body = %s", res.Code, res.Body.String())
	}
	var workspace map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &workspace); err != nil {
		t.Fatalf("owner teams json: %v", err)
	}
	teams := util.AsMapSlice(workspace["teams"])
	if len(teams) != 1 {
		t.Fatalf("owner teams = %#v", workspace)
	}
	foundName := false
	for _, item := range util.AsMapSlice(teams[0]["members"]) {
		if util.Clean(item["user_id"]) == member.ID {
			foundName = util.Clean(item["name"]) == "Renamed Member" && util.Clean(item["remark"]) == "设计组 A"
		}
	}
	if !foundName {
		t.Fatalf("member display name or remark not refreshed: %#v", teams[0])
	}

	req = httptest.NewRequest(http.MethodGet, "/api/teams", nil)
	req.Header.Set("Authorization", "Bearer "+memberSession)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("member teams status = %d body = %s", res.Code, res.Body.String())
	}
	var memberWorkspace map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &memberWorkspace); err != nil {
		t.Fatalf("member teams json: %v", err)
	}
	memberTeams := util.AsMapSlice(memberWorkspace["teams"])
	if len(memberTeams) != 1 {
		t.Fatalf("member teams = %#v", memberWorkspace)
	}
	for _, item := range util.AsMapSlice(memberTeams[0]["members"]) {
		if _, ok := item["remark"]; ok {
			t.Fatalf("member response should not expose remark: %#v", memberTeams[0])
		}
	}
}

func TestTeamMembersCanLeaveButOwnerCannot(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()
	owner := service.AuthOwner{ID: "sub2api:leave-owner", Name: "Leave Owner", Provider: service.AuthProviderSub2API}
	manager := service.AuthOwner{ID: "sub2api:leave-manager", Name: "Leave Manager", Provider: service.AuthProviderSub2API}
	member := service.AuthOwner{ID: "sub2api:leave-member", Name: "Leave Member", Provider: service.AuthProviderSub2API}
	_, ownerSession, err := app.auth.UpsertSub2APISession(owner)
	if err != nil {
		t.Fatalf("owner session: %v", err)
	}
	_, managerSession, err := app.auth.UpsertSub2APISession(manager)
	if err != nil {
		t.Fatalf("manager session: %v", err)
	}
	_, memberSession, err := app.auth.UpsertSub2APISession(member)
	if err != nil {
		t.Fatalf("member session: %v", err)
	}
	saveTestSub2APIBinding(t, app, owner.ID, "leave-owner@example.com")
	saveTestSub2APIBinding(t, app, manager.ID, "leave-manager@example.com")
	saveTestSub2APIBinding(t, app, member.ID, "leave-member@example.com")

	teamID := createHTTPTestTeam(t, app, ownerSession)
	managerInvite := createHTTPTestInvite(t, app, ownerSession, teamID, "leave-manager@example.com", "manager")
	acceptHTTPTestInvite(t, app, managerSession, managerInvite)
	memberInvite := createHTTPTestInvite(t, app, ownerSession, teamID, "leave-member@example.com", "member")
	acceptHTTPTestInvite(t, app, memberSession, memberInvite)

	req := httptest.NewRequest(http.MethodPost, "/api/teams/"+teamID+"/leave", nil)
	req.Header.Set("Authorization", "Bearer "+managerSession)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("manager leave status = %d body = %s", res.Code, res.Body.String())
	}
	var leaveBody map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &leaveBody); err != nil {
		t.Fatalf("manager leave json: %v", err)
	}
	workspace := util.StringMap(leaveBody["workspace"])
	if scope := util.StringMap(workspace["scope"]); util.Clean(scope["type"]) != "personal" {
		t.Fatalf("manager leave scope = %#v", workspace)
	}
	if teams := util.AsMapSlice(workspace["teams"]); len(teams) != 0 {
		t.Fatalf("manager still has teams after leave: %#v", teams)
	}

	req = httptest.NewRequest(http.MethodPost, "/api/teams/"+teamID+"/leave", nil)
	req.Header.Set("Authorization", "Bearer "+memberSession)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("member leave status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPost, "/api/teams/"+teamID+"/leave", nil)
	req.Header.Set("Authorization", "Bearer "+ownerSession)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("owner leave status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/teams", nil)
	req.Header.Set("Authorization", "Bearer "+ownerSession)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("owner teams status = %d body = %s", res.Code, res.Body.String())
	}
	var ownerBody map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &ownerBody); err != nil {
		t.Fatalf("owner teams json: %v", err)
	}
	teams := util.AsMapSlice(ownerBody["teams"])
	if len(teams) != 1 || util.ToInt(teams[0]["member_count"], 0) != 1 {
		t.Fatalf("owner teams member count after leaves: %#v", ownerBody)
	}
}

func TestTeamMemberDailyLimitHTTP(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()
	owner := service.AuthOwner{ID: "sub2api:daily-owner", Name: "Daily Owner", Provider: service.AuthProviderSub2API}
	manager := service.AuthOwner{ID: "sub2api:daily-manager", Name: "Daily Manager", Provider: service.AuthProviderSub2API}
	member := service.AuthOwner{ID: "sub2api:daily-member", Name: "Daily Member", Provider: service.AuthProviderSub2API}
	_, ownerSession, err := app.auth.UpsertSub2APISession(owner)
	if err != nil {
		t.Fatalf("owner session: %v", err)
	}
	_, managerSession, err := app.auth.UpsertSub2APISession(manager)
	if err != nil {
		t.Fatalf("manager session: %v", err)
	}
	_, memberSession, err := app.auth.UpsertSub2APISession(member)
	if err != nil {
		t.Fatalf("member session: %v", err)
	}
	saveTestSub2APIBinding(t, app, owner.ID, "daily-owner@example.com")
	saveTestSub2APIBinding(t, app, manager.ID, "daily-manager@example.com")
	saveTestSub2APIBinding(t, app, member.ID, "daily-member@example.com")

	teamID := createHTTPTestTeam(t, app, ownerSession)
	managerInvite := createHTTPTestInvite(t, app, ownerSession, teamID, "daily-manager@example.com", "manager")
	acceptHTTPTestInvite(t, app, managerSession, managerInvite)
	memberInvite := createHTTPTestInvite(t, app, ownerSession, teamID, "daily-member@example.com", "member")
	acceptHTTPTestInvite(t, app, memberSession, memberInvite)

	app.tasks = service.NewStoredImageTaskService(testJSONStoreFromApp(t, app),
		failingHTTPImageTaskHandler,
		failingHTTPImageTaskHandler,
		func(ctx context.Context, identity service.Identity, payload map[string]any) (map[string]any, error) {
			return map[string]any{"output_type": "text", "data": []map[string]any{{"text_response": "ok"}}}, nil
		},
		func() int { return 30 },
	)
	app.tasks.SetTeamDailyLimitGetter(app.teams.MemberDailyLimitAmount)

	req := httptest.NewRequest(http.MethodPatch, "/api/teams/"+teamID+"/members/"+member.ID, strings.NewReader(`{"daily_limit_amount":2}`))
	req.Header.Set("Authorization", "Bearer "+managerSession)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("manager set member daily limit status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/teams", nil)
	req.Header.Set("Authorization", "Bearer "+memberSession)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("member workspace status = %d body = %s", res.Code, res.Body.String())
	}
	var workspace map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &workspace); err != nil {
		t.Fatalf("member workspace json: %v", err)
	}
	teams := util.AsMapSlice(workspace["teams"])
	if len(teams) != 1 {
		t.Fatalf("member teams = %#v", teams)
	}
	limitState := util.StringMap(teams[0]["my_daily_limit"])
	if util.ToInt(limitState["limit_amount"], 0) != 2 || util.ToBool(limitState["unlimited"]) {
		t.Fatalf("member daily limit state = %#v", limitState)
	}
	foundMemberLimit := false
	for _, item := range util.AsMapSlice(teams[0]["members"]) {
		if util.Clean(item["user_id"]) == member.ID {
			foundMemberLimit = util.ToInt(item["daily_limit_amount"], 0) == 2
		}
	}
	if !foundMemberLimit {
		t.Fatalf("member list missing daily limit: %#v", teams[0])
	}

	req = httptest.NewRequest(http.MethodPatch, "/api/teams/"+teamID+"/members/"+member.ID, strings.NewReader(`{"daily_limit_amount":51}`))
	req.Header.Set("Authorization", "Bearer "+memberSession)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusBadRequest {
		t.Fatalf("member set own daily limit status = %d body = %s", res.Code, res.Body.String())
	}

	req = httptest.NewRequest(http.MethodPost, "/api/creation-tasks/chat-completions", strings.NewReader(`{"client_task_id":"daily-chat-1","prompt":"hello","model":"gpt-5","messages":[{"role":"user","content":"hello"}]}`))
	req.Header.Set("Authorization", "Bearer "+memberSession)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("submit first limited team chat status = %d body = %s", res.Code, res.Body.String())
	}
	if !waitForHTTPTestConditionResult(func() bool {
		task, ok := app.tasks.GetTask(service.Identity{ID: member.ID, Role: service.AuthRoleUser, Provider: service.AuthProviderSub2API, OwnerID: member.ID}, "daily-chat-1")
		return ok && task["status"] == service.TaskStatusSuccess && util.Clean(task["team_id"]) == teamID && util.ToInt(task["billing_consumed_amount"], 0) == 1
	}) {
		task, ok := app.tasks.GetTask(service.Identity{ID: member.ID, Role: service.AuthRoleUser, Provider: service.AuthProviderSub2API, OwnerID: member.ID}, "daily-chat-1")
		t.Fatalf("daily-chat-1 did not settle as expected ok=%v task=%#v", ok, task)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/teams", nil)
	req.Header.Set("Authorization", "Bearer "+memberSession)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("member workspace after usage status = %d body = %s", res.Code, res.Body.String())
	}
	if err := json.Unmarshal(res.Body.Bytes(), &workspace); err != nil {
		t.Fatalf("member workspace after usage json: %v", err)
	}
	limitState = util.StringMap(util.AsMapSlice(workspace["teams"])[0]["my_daily_limit"])
	if util.ToInt(limitState["used_amount"], 0) != 1 || util.ToInt(limitState["remaining_amount"], 0) != 1 {
		t.Fatalf("member daily limit after usage = %#v", limitState)
	}

	req = httptest.NewRequest(http.MethodPost, "/api/creation-tasks/chat-completions", strings.NewReader(`{"client_task_id":"daily-chat-2","prompt":"hello again","model":"gpt-5","messages":[{"role":"user","content":"hello again"}]}`))
	req.Header.Set("Authorization", "Bearer "+memberSession)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("submit second limited team chat status = %d body = %s", res.Code, res.Body.String())
	}
	waitForHTTPTestCondition(t, func() bool {
		req = httptest.NewRequest(http.MethodGet, "/api/teams/"+teamID+"/usage", nil)
		req.Header.Set("Authorization", "Bearer "+memberSession)
		res = httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		var body map[string]any
		_ = json.Unmarshal(res.Body.Bytes(), &body)
		return res.Code == http.StatusOK && len(util.AsMapSlice(body["items"])) == 2
	})

	req = httptest.NewRequest(http.MethodPost, "/api/creation-tasks/chat-completions", strings.NewReader(`{"client_task_id":"daily-chat-3","prompt":"over","model":"gpt-5","messages":[{"role":"user","content":"over"}]}`))
	req.Header.Set("Authorization", "Bearer "+memberSession)
	res = httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusTooManyRequests || !strings.Contains(res.Body.String(), "团队成员今日额度不足") {
		t.Fatalf("submit over daily limit status = %d body = %s", res.Code, res.Body.String())
	}
}

func saveTestSub2APIBinding(t *testing.T, app *App, ownerID, email string) {
	t.Helper()
	if err := app.sub2Bindings.Save(service.Sub2APIBinding{
		OwnerID:        ownerID,
		Sub2APIUserID:  strings.TrimPrefix(ownerID, "sub2api:"),
		UserEmail:      email,
		UserName:       email,
		SessionToken:   "session-" + strings.TrimPrefix(ownerID, "sub2api:"),
		GatewayBaseURL: "http://gateway.test",
	}); err != nil {
		t.Fatalf("save sub2api binding: %v", err)
	}
}

func launchIndependentSub2APITestSession(t *testing.T, app *App, launchToken string) string {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/auth/sub2api/launch", strings.NewReader(jsonString(map[string]any{"token": launchToken})))
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("launch status = %d body = %s", res.Code, res.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("launch json: %v", err)
	}
	sessionKey := util.Clean(body["token"])
	if sessionKey == "" {
		t.Fatalf("launch session token missing: %#v", body)
	}
	return sessionKey
}

func createHTTPTestTeam(t *testing.T, app *App, session string) string {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/teams", strings.NewReader(`{"name":"Design Team"}`))
	req.Header.Set("Authorization", "Bearer "+session)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("create team status = %d body = %s", res.Code, res.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("create team json: %v", err)
	}
	teamID := util.Clean(util.StringMap(body["team"])["id"])
	if teamID == "" {
		t.Fatalf("created team missing id: %#v", body)
	}
	return teamID
}

func createHTTPTestInvite(t *testing.T, app *App, session, teamID, email, role string) string {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/teams/"+teamID+"/invites", strings.NewReader(jsonString(map[string]any{"email": email, "role": role})))
	req.Header.Set("Authorization", "Bearer "+session)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("create invite status = %d body = %s", res.Code, res.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatalf("create invite json: %v", err)
	}
	inviteID := util.Clean(util.StringMap(body["invite"])["id"])
	if inviteID == "" {
		t.Fatalf("created invite missing id: %#v", body)
	}
	return inviteID
}

func acceptHTTPTestInvite(t *testing.T, app *App, session, inviteID string) {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/team-invites/"+inviteID+"/accept", nil)
	req.Header.Set("Authorization", "Bearer "+session)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("accept invite status = %d body = %s", res.Code, res.Body.String())
	}
}

func expireHTTPTestInvite(t *testing.T, app *App, inviteID string) {
	t.Helper()
	backend := testJSONStoreFromApp(t, app)
	store := backend.(storage.JSONDocumentBackend)
	raw, err := store.LoadJSONDocument("teams.json")
	if err != nil {
		t.Fatalf("load teams document: %v", err)
	}
	doc := util.StringMap(raw)
	invites := util.AsMapSlice(doc["invites"])
	found := false
	for _, invite := range invites {
		if util.Clean(invite["id"]) != inviteID {
			continue
		}
		invite["expires_at"] = time.Now().UTC().Add(-time.Hour).Format(time.RFC3339Nano)
		invite["updated_at"] = time.Now().UTC().Format(time.RFC3339Nano)
		found = true
	}
	if !found {
		t.Fatalf("invite %q not found in teams document", inviteID)
	}
	if err := store.SaveJSONDocument("teams.json", doc); err != nil {
		t.Fatalf("save teams document: %v", err)
	}
	app.teams = service.NewTeamService(backend)
	app.teams.SetUserEmailLookup(func(ownerID string) string {
		binding, ok := app.sub2Bindings.Get(ownerID)
		if !ok {
			return ""
		}
		return binding.UserEmail
	})
	app.teams.SetUserNameLookup(func(ownerID string) string {
		return app.auth.DisplayNameForUser(ownerID)
	})
}

func newTestApp(t *testing.T) *App {
	return newTestAppWithBillingDefaults(t, "standard", "1000", "1000", "monthly")
}

func newIndependentTestApp(t *testing.T, redeemURL, secret, gatewayURL string) *App {
	t.Helper()
	root := t.TempDir()
	t.Setenv("CHATGPT2API_ROOT", root)
	t.Setenv("CHATGPT2API_ADMIN_USERNAME", testAdminUsername)
	t.Setenv("CHATGPT2API_ADMIN_PASSWORD", testAdminPassword)
	t.Setenv("CHATGPT2API_LUOYE_INDEPENDENT_MODE", "true")
	t.Setenv("CHATGPT2API_SUB2API_REDEEM_URL", redeemURL)
	t.Setenv("CHATGPT2API_SUB2API_REDEEM_SECRET", secret)
	t.Setenv("CHATGPT2API_SUB2API_GATEWAY_BASE_URL", gatewayURL)
	t.Setenv("CHATGPT2API_SUB2API_DEFAULT_CHAT_GROUP_ID", "chat-group")
	t.Setenv("CHATGPT2API_SUB2API_DEFAULT_IMAGE_GROUP_ID", "image-group")
	t.Setenv("CHATGPT2API_SUB2API_DEFAULT_VIDEO_GROUP_ID", "video-group")
	t.Setenv("STORAGE_BACKEND", "sqlite")
	t.Setenv("DATABASE_URL", "")
	app, err := NewApp()
	if err != nil {
		t.Fatalf("NewApp() error = %v", err)
	}
	return app
}

func newTestAppWithBillingDefaults(t *testing.T, billingType, standardBalance, subscriptionQuota, subscriptionPeriod string) *App {
	t.Helper()
	root := t.TempDir()
	t.Setenv("CHATGPT2API_ROOT", root)
	t.Setenv("CHATGPT2API_ADMIN_USERNAME", testAdminUsername)
	t.Setenv("CHATGPT2API_ADMIN_PASSWORD", testAdminPassword)
	t.Setenv("CHATGPT2API_DEFAULT_BILLING_TYPE", billingType)
	t.Setenv("CHATGPT2API_DEFAULT_STANDARD_BALANCE", standardBalance)
	t.Setenv("CHATGPT2API_DEFAULT_SUBSCRIPTION_QUOTA", subscriptionQuota)
	t.Setenv("CHATGPT2API_DEFAULT_SUBSCRIPTION_PERIOD", subscriptionPeriod)
	unsetTestEnv(t, "CHATGPT2API_REGISTRATION_ENABLED")
	unsetTestEnv(t, "CHATGPT2API_DEFAULT_LOG_VIEW")
	unsetTestEnv(t, "CHATGPT2API_LUOYE_INDEPENDENT_MODE")
	unsetTestEnv(t, "CHATGPT2API_SUB2API_REDEEM_URL")
	unsetTestEnv(t, "CHATGPT2API_SUB2API_REDEEM_SECRET")
	unsetTestEnv(t, "CHATGPT2API_SUB2API_GATEWAY_BASE_URL")
	unsetTestEnv(t, "CHATGPT2API_SUB2API_DEFAULT_CHAT_GROUP_ID")
	unsetTestEnv(t, "CHATGPT2API_SUB2API_DEFAULT_IMAGE_GROUP_ID")
	unsetTestEnv(t, "CHATGPT2API_SUB2API_DEFAULT_VIDEO_GROUP_ID")
	t.Setenv("STORAGE_BACKEND", "sqlite")
	t.Setenv("DATABASE_URL", "")
	app, err := NewApp()
	if err != nil {
		t.Fatalf("NewApp() error = %v", err)
	}
	app.engine.ListModelsFunc = func(context.Context) (map[string]any, error) {
		return map[string]any{"object": "list", "data": []map[string]any{}}, nil
	}
	return app
}

func installHTTPTestImageStream(t *testing.T, app *App) {
	t.Helper()
	installHTTPTestImageStreamFunc(t, app, func(ctx context.Context, client *backend.Client, request protocol.ConversationRequest, index, total int) (<-chan protocol.ImageOutput, <-chan error) {
		return httpTestImageOutputStream(request, index)
	})
}

func installHTTPTestImageStreamFunc(t *testing.T, app *App, fn func(context.Context, *backend.Client, protocol.ConversationRequest, int, int) (<-chan protocol.ImageOutput, <-chan error)) {
	t.Helper()
	app.engine.ImageTokenProvider = func(context.Context) (string, error) {
		return "test-token", nil
	}
	app.engine.ImageClientFactory = func(string) *backend.Client {
		return nil
	}
	app.engine.StreamImageOutputsFunc = fn
}

func httpTestImageOutputStream(request protocol.ConversationRequest, index int) (<-chan protocol.ImageOutput, <-chan error) {
	out := make(chan protocol.ImageOutput, 1)
	errCh := make(chan error, 1)
	out <- protocol.ImageOutput{
		Kind:    "result",
		Model:   request.Model,
		Index:   index,
		Total:   request.N,
		Created: int64(index),
		Data: []map[string]any{{
			"url":      fmt.Sprintf("https://example.test/%d.png", index),
			"b64_json": fmt.Sprintf("image-%d", index),
		}},
	}
	close(out)
	errCh <- nil
	close(errCh)
	return out, errCh
}

func httpTestMessageOnlyImageOutputStream(request protocol.ConversationRequest, index int) (<-chan protocol.ImageOutput, <-chan error) {
	out := make(chan protocol.ImageOutput, 1)
	errCh := make(chan error, 1)
	out <- protocol.ImageOutput{
		Kind:    "message",
		Model:   request.Model,
		Index:   index,
		Total:   request.N,
		Created: int64(index),
		Text:    "text only",
	}
	close(out)
	errCh <- nil
	close(errCh)
	return out, errCh
}

func profileBillingState(t *testing.T, app *App, rawKey string) map[string]any {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/profile", nil)
	req.Header.Set("Authorization", "Bearer "+rawKey)
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("profile status = %d body = %s", res.Code, res.Body.String())
	}
	var profile map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &profile); err != nil {
		t.Fatalf("profile json: %v", err)
	}
	return util.StringMap(profile["billing"])
}

func unsetTestEnv(t *testing.T, key string) {
	t.Helper()
	original, existed := os.LookupEnv(key)
	if err := os.Unsetenv(key); err != nil {
		t.Fatalf("Unsetenv(%s): %v", key, err)
	}
	t.Cleanup(func() {
		if existed {
			_ = os.Setenv(key, original)
			return
		}
		_ = os.Unsetenv(key)
	})
}

func writeHTTPTestPNG(path string) error {
	file, err := os.Create(path)
	if err != nil {
		return err
	}
	defer file.Close()
	return encodeHTTPTestPNG(file)
}

func encodeHTTPTestPNG(file interface {
	Write([]byte) (int, error)
}) error {
	img := image.NewRGBA(image.Rect(0, 0, 12, 12))
	for y := 0; y < 12; y++ {
		for x := 0; x < 12; x++ {
			img.Set(x, y, color.RGBA{R: uint8(x * 16), G: uint8(y * 16), B: 180, A: 255})
		}
	}
	return png.Encode(file, img)
}
