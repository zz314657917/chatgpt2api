package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

func TestBeadProjectAPIWorkflowConflictAndOwnerIsolation(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()
	_, aliceKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "Alice", service.AuthOwner{ID: "alice"})
	if err != nil {
		t.Fatal(err)
	}
	_, bobKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "Bob", service.AuthOwner{ID: "bob"})
	if err != nil {
		t.Fatal(err)
	}

	created := beadProjectAPIRequest(t, app, aliceKey, http.MethodPost, "/api/bead-projects", `{}`, http.StatusCreated)
	project := util.StringMap(created["item"])
	id := util.Clean(project["id"])
	if id == "" || util.ToInt(project["revision"], 0) != 1 {
		t.Fatalf("created item = %#v", project)
	}

	listed := beadProjectAPIRequest(t, app, aliceKey, http.MethodGet, "/api/bead-projects", "", http.StatusOK)
	items := util.AsMapSlice(listed["items"])
	if len(items) != 1 || items[0]["cells"] != nil || items[0]["layers"] != nil || util.StringMap(items[0]["preview"])["cells"] == nil {
		t.Fatalf("list should contain summary with preview only: %#v", items)
	}

	project["name"] = "API 保存"
	project["cells"] = beadProjectJSONCells(util.ToInt(project["width"], 0)*util.ToInt(project["height"], 0), "MARD-A1")
	layers := util.AsMapSlice(project["layers"])
	layers[0]["cells"] = project["cells"]
	project["layers"] = layers
	updatedBody := map[string]any{"revision": 1, "item": project}
	updatedJSON, _ := json.Marshal(updatedBody)
	updated := beadProjectAPIRequest(t, app, aliceKey, http.MethodPut, "/api/bead-projects/"+id, string(updatedJSON), http.StatusOK)
	updatedItem := util.StringMap(updated["item"])
	if util.ToInt(updatedItem["revision"], 0) != 2 || updatedItem["name"] != "API 保存" {
		t.Fatalf("updated item = %#v", updatedItem)
	}

	conflict := beadProjectAPIRequest(t, app, aliceKey, http.MethodPatch, "/api/bead-projects/"+id, `{"revision":1,"name":"冲突"}`, http.StatusConflict)
	if util.ToInt(conflict["latest_revision"], 0) != 2 || util.ToInt(util.StringMap(conflict["detail"])["latest_revision"], 0) != 2 {
		t.Fatalf("conflict payload = %#v", conflict)
	}

	beadProjectAPIRequest(t, app, bobKey, http.MethodGet, "/api/bead-projects/"+id, "", http.StatusNotFound)
	copied := beadProjectAPIRequest(t, app, aliceKey, http.MethodPost, "/api/bead-projects/"+id+"/copies", `{}`, http.StatusCreated)
	copyItem := util.StringMap(copied["item"])
	if util.Clean(copyItem["id"]) == id || util.ToInt(copyItem["revision"], 0) != 1 {
		t.Fatalf("copy item = %#v", copyItem)
	}
	beadProjectAPIRequest(t, app, aliceKey, http.MethodDelete, "/api/bead-projects/"+id, "", http.StatusOK)
	beadProjectAPIRequest(t, app, aliceKey, http.MethodGet, "/api/bead-projects/"+id, "", http.StatusNotFound)
}

func TestBeadProjectAPIDeniesRoleWithoutPermission(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()
	role, err := app.auth.CreateRole(map[string]any{
		"name":            "无拼豆权限",
		"menu_paths":      []string{"/image"},
		"api_permissions": []string{service.APIPermissionKey("GET", "/v1/models")},
	})
	if err != nil {
		t.Fatal(err)
	}
	user, key, err := app.auth.CreateAPIKey(service.AuthRoleUser, "limited", service.AuthOwner{})
	if err != nil {
		t.Fatal(err)
	}
	if updated := app.auth.UpdateUser(util.Clean(user["id"]), map[string]any{"role_id": util.Clean(role["id"])}); updated == nil {
		t.Fatal("UpdateUser() returned nil")
	}
	beadProjectAPIRequest(t, app, key, http.MethodGet, "/api/bead-projects", "", http.StatusForbidden)
}

func TestBeadProjectAPIRejectsOversizedAndUnknownJSON(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()
	_, key, err := app.auth.CreateAPIKey(service.AuthRoleUser, "Alice", service.AuthOwner{})
	if err != nil {
		t.Fatal(err)
	}
	beadProjectAPIRequest(t, app, key, http.MethodPost, "/api/bead-projects", `{"unknown":true}`, http.StatusBadRequest)
	oversized := `{"item":{"schema_version":1,"padding":"` + strings.Repeat("x", service.BeadProjectMaxJSONBytes) + `"}}`
	beadProjectAPIRequest(t, app, key, http.MethodPost, "/api/bead-projects", oversized, http.StatusRequestEntityTooLarge)
}

func beadProjectAPIRequest(t *testing.T, app *App, key, method, path, body string, wantStatus int) map[string]any {
	t.Helper()
	var reader *strings.Reader
	if body == "" {
		reader = strings.NewReader("")
	} else {
		reader = strings.NewReader(body)
	}
	req := httptest.NewRequest(method, path, reader)
	req.Header.Set("Authorization", "Bearer "+key)
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != wantStatus {
		t.Fatalf("%s %s status=%d want=%d body=%s", method, path, res.Code, wantStatus, res.Body.String())
	}
	if res.Body.Len() == 0 {
		return map[string]any{}
	}
	var payload map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode %s %s response: %v body=%s", method, path, err, res.Body.String())
	}
	return payload
}

func beadProjectJSONCells(size int, first string) []any {
	cells := make([]any, size)
	if size > 0 {
		cells[0] = first
	}
	return cells
}
