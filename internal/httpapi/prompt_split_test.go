package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

func TestCreationTaskPromptSplitDirectHTTPUsesNormalizedImageRequest(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()
	user, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "prompt-split-http", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}
	var mu sync.Mutex
	payloads := make([]map[string]any, 0, 2)
	installPromptSplitHTTPTasks(t, app,
		func(_ context.Context, _ service.Identity, payload map[string]any) (map[string]any, error) {
			mu.Lock()
			payloads = append(payloads, util.CopyMap(payload))
			mu.Unlock()
			return map[string]any{"data": []map[string]any{{"url": "https://example.test/image.png"}}}, nil
		},
		func(context.Context, service.Identity, map[string]any) (map[string]any, error) {
			return map[string]any{"output_type": "text", "data": []map[string]any{{"text_response": `{"variation_axis":"版式","items":[{"variant_label":"版式一","prompt":"first card"},{"variant_label":"版式二","prompt":"second card"}]}`}}}, nil
		},
	)
	body := `{"client_task_id":"http-direct","prompt":"two cards","model":"gpt-5","split_count":2,"execution_mode":"direct","image_request":{"model":"gpt-image-2","size":"16:9","quality":"high","visibility":"private","output_format":"webp","output_compression":80,"background":"transparent","style":"vivid"}}`
	request := httptest.NewRequest(http.MethodPost, "/api/creation-tasks/prompt-splits", strings.NewReader(body))
	request.Header.Set("Authorization", "Bearer "+rawKey)
	response := httptest.NewRecorder()
	app.Handler().ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("create prompt split status = %d body = %s", response.Code, response.Body.String())
	}
	var created map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &created); err != nil {
		t.Fatalf("create prompt split json: %v", err)
	}
	splitTaskID := util.Clean(created["split_task_id"])
	if !strings.HasPrefix(splitTaskID, "prompt-split-internal:") || !strings.HasSuffix(splitTaskID, ":split") || created["execution_mode"] != service.PromptSplitExecutionModeDirect {
		t.Fatalf("created batch = %#v", created)
	}

	ownerID := util.Clean(user["id"])
	var completed map[string]any
	waitForHTTPTestCondition(t, func() bool {
		request = httptest.NewRequest(http.MethodGet, "/api/creation-tasks/prompt-splits/http-direct", nil)
		request.Header.Set("Authorization", "Bearer "+rawKey)
		response = httptest.NewRecorder()
		app.Handler().ServeHTTP(response, request)
		if response.Code != http.StatusOK {
			return false
		}
		if err := json.Unmarshal(response.Body.Bytes(), &completed); err != nil {
			t.Fatalf("get prompt split json: %v", err)
		}
		return completed["status"] == service.PromptSplitStatusSuccess
	})
	items := util.AsMapSlice(completed["items"])
	if completed["variation_axis"] != "版式" || len(items) != 2 {
		t.Fatalf("completed items = %#v", items)
	}
	wantLabels := []string{"版式一", "版式二"}
	taskIDs := make([]string, 0, len(items))
	for index, item := range items {
		if item["variant_label"] != wantLabels[index] {
			t.Fatalf("item %d semantic metadata = %#v", index+1, item)
		}
		taskID := util.Clean(item["task_id"])
		if !strings.HasPrefix(taskID, "prompt-split-internal:") || !strings.HasSuffix(taskID, ":image:"+strconv.Itoa(index+1)) {
			t.Fatalf("child task id %d = %q", index+1, taskID)
		}
		taskIDs = append(taskIDs, taskID)
	}
	for _, taskID := range taskIDs {
		task, ok := app.tasks.GetTask(service.Identity{ID: ownerID, Role: service.AuthRoleUser}, taskID)
		if !ok || task["status"] != service.TaskStatusSuccess {
			t.Fatalf("child task %s = %#v ok=%v", taskID, task, ok)
		}
	}
	mu.Lock()
	defer mu.Unlock()
	if len(payloads) != 2 {
		t.Fatalf("image payloads = %#v", payloads)
	}
	for _, payload := range payloads {
		if payload["n"] != 1 || payload["output_format"] != "webp" || payload["raw_output_compression"] != 80 || payload["background"] != "transparent" {
			t.Fatalf("normalized image payload = %#v", payload)
		}
	}

	other, otherKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "prompt-split-other", service.AuthOwner{})
	if err != nil || util.Clean(other["id"]) == "" {
		t.Fatalf("CreateAPIKey(other) error = %v user=%#v", err, other)
	}
	request = httptest.NewRequest(http.MethodGet, "/api/creation-tasks/prompt-splits/http-direct", nil)
	request.Header.Set("Authorization", "Bearer "+otherKey)
	response = httptest.NewRecorder()
	app.Handler().ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("other owner get status = %d body = %s", response.Code, response.Body.String())
	}
}

func TestWritePromptSplitErrorDoesNotMaskPersistenceFailureAsNotFound(t *testing.T) {
	response := httptest.NewRecorder()
	writePromptSplitError(response, errors.New("prompt split save failed"))
	if response.Code != http.StatusInternalServerError {
		t.Fatalf("persistence error status = %d body = %s", response.Code, response.Body.String())
	}
	response = httptest.NewRecorder()
	writePromptSplitError(response, service.ErrPromptSplitNotFound)
	if response.Code != http.StatusNotFound {
		t.Fatalf("not found status = %d body = %s", response.Code, response.Body.String())
	}
}

func TestCreationTaskPromptSplitHTTPRejectsInvalidTemplateAndCount(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()
	_, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "prompt-split-invalid", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}
	for _, body := range []string{
		`{"client_task_id":"too-many","prompt":"cards","split_count":11,"execution_mode":"nodes"}`,
		`{"client_task_id":"reference","prompt":"cards","split_count":2,"execution_mode":"direct","image_request":{"model":"gpt-image-2","image_url":"https://example.test/reference.png"}}`,
		`{"client_task_id":"fraction","prompt":"cards","split_count":2.5,"execution_mode":"nodes"}`,
	} {
		request := httptest.NewRequest(http.MethodPost, "/api/creation-tasks/prompt-splits", strings.NewReader(body))
		request.Header.Set("Authorization", "Bearer "+rawKey)
		response := httptest.NewRecorder()
		app.Handler().ServeHTTP(response, request)
		if response.Code != http.StatusBadRequest {
			t.Fatalf("invalid prompt split status = %d body = %s", response.Code, response.Body.String())
		}
	}
}

func TestPromptSplitImageRequestAllowsProStudioResolution(t *testing.T) {
	for _, resolution := range []string{"1k", "2k", "4k"} {
		t.Run(resolution, func(t *testing.T) {
			request, err := promptSplitImageRequestFromBody(map[string]any{
				"professional_mode": true,
				"pro_studio":        map[string]any{"enabled": true, "mode": "manual"},
				"official_settings": map[string]any{"resolution": resolution},
				"model":             "gpt-image-2",
				"size":              "16:9",
				"quality":           "high",
				"resolution":        resolution,
				"output_format":     "webp",
			}, nil, "https://example.test")
			if err != nil {
				t.Fatalf("promptSplitImageRequestFromBody(pro studio) error = %v", err)
			}
			if request.Model != service.OfficialImageModel || request.Size != "16:9" || request.Quality != "high" || request.ImageResolution != resolution {
				t.Fatalf("normalized pro studio request = %#v", request)
			}
			if util.Clean(request.Metadata["image_resolution"]) != resolution || util.StringMap(request.Metadata["official_settings"])["resolution"] != resolution {
				t.Fatalf("pro studio metadata = %#v", request.Metadata)
			}
		})
	}

	if _, err := promptSplitImageRequestFromBody(map[string]any{"model": "gpt-image-2", "resolution": "2k"}, nil, "https://example.test"); err == nil {
		t.Fatal("non-Pro-Studio resolution should remain rejected")
	}
	if _, err := promptSplitImageRequestFromBody(map[string]any{"professional_mode": true, "resolution": "720p"}, nil, "https://example.test"); err == nil {
		t.Fatal("video resolution should not pass Pro Studio validation")
	}
}

func TestCreationTaskPromptSplitDirectHTTPAllowsProStudioResolutions(t *testing.T) {
	for _, resolution := range []string{"1k", "2k", "4k"} {
		t.Run(resolution, func(t *testing.T) {
			app := newTestApp(t)
			defer app.Close()
			_, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "prompt-split-pro-studio-"+resolution, service.AuthOwner{})
			if err != nil {
				t.Fatalf("CreateAPIKey() error = %v", err)
			}

			payloads := make(chan map[string]any, 1)
			installPromptSplitHTTPTasks(t, app,
				func(_ context.Context, _ service.Identity, payload map[string]any) (map[string]any, error) {
					payloads <- util.CopyMap(payload)
					return map[string]any{"data": []map[string]any{{"url": "https://example.test/image.png"}}}, nil
				},
				func(context.Context, service.Identity, map[string]any) (map[string]any, error) {
					return map[string]any{"output_type": "text", "data": []map[string]any{{"text_response": `{"variation_axis":"构图","items":[{"variant_label":"方案一","prompt":"pro image"}]}`}}}, nil
				},
			)

			body, err := json.Marshal(map[string]any{
				"client_task_id": "http-pro-studio-" + resolution,
				"prompt":         "pro image",
				"model":          "gpt-5",
				"split_count":    1,
				"execution_mode": "direct",
				"image_request": map[string]any{
					"professional_mode": true,
					"pro_studio":        map[string]any{"enabled": true, "mode": "manual"},
					"official_settings": map[string]any{"resolution": resolution},
					"model":             "gpt-image-2",
					"size":              "16:9",
					"quality":           "high",
					"resolution":        resolution,
					"output_format":     "webp",
				},
			})
			if err != nil {
				t.Fatalf("marshal request body: %v", err)
			}
			request := httptest.NewRequest(http.MethodPost, "/api/creation-tasks/prompt-splits", strings.NewReader(string(body)))
			request.Header.Set("Authorization", "Bearer "+rawKey)
			response := httptest.NewRecorder()
			app.Handler().ServeHTTP(response, request)
			if response.Code != http.StatusOK {
				t.Fatalf("create prompt split status = %d body = %s", response.Code, response.Body.String())
			}

			var completed map[string]any
			waitForHTTPTestCondition(t, func() bool {
				request = httptest.NewRequest(http.MethodGet, "/api/creation-tasks/prompt-splits/http-pro-studio-"+resolution, nil)
				request.Header.Set("Authorization", "Bearer "+rawKey)
				response = httptest.NewRecorder()
				app.Handler().ServeHTTP(response, request)
				if response.Code != http.StatusOK {
					return false
				}
				if err := json.Unmarshal(response.Body.Bytes(), &completed); err != nil {
					t.Fatalf("get prompt split json: %v", err)
				}
				return completed["status"] == service.PromptSplitStatusSuccess
			})

			select {
			case payload := <-payloads:
				if payload["n"] != 1 || payload["model"] != service.OfficialImageModel || payload["professional_mode"] != true || payload["image_resolution"] != resolution {
					t.Fatalf("direct Pro Studio image payload = %#v", payload)
				}
				if util.StringMap(payload["official_settings"])["resolution"] != resolution {
					t.Fatalf("direct Pro Studio official settings = %#v", payload["official_settings"])
				}
			default:
				t.Fatal("missing direct Pro Studio image payload")
			}
		})
	}
}

func TestCreationTaskPromptSplitHTTPCancel(t *testing.T) {
	app := newTestApp(t)
	defer app.Close()
	_, rawKey, err := app.auth.CreateAPIKey(service.AuthRoleUser, "prompt-split-cancel", service.AuthOwner{})
	if err != nil {
		t.Fatalf("CreateAPIKey() error = %v", err)
	}
	started := make(chan struct{})
	installPromptSplitHTTPTasks(t, app,
		failingHTTPImageTaskHandler,
		func(ctx context.Context, _ service.Identity, _ map[string]any) (map[string]any, error) {
			close(started)
			<-ctx.Done()
			return nil, ctx.Err()
		},
	)
	request := httptest.NewRequest(http.MethodPost, "/api/creation-tasks/prompt-splits", strings.NewReader(`{"client_task_id":"http-cancel","prompt":"wait","split_count":1,"execution_mode":"nodes"}`))
	request.Header.Set("Authorization", "Bearer "+rawKey)
	response := httptest.NewRecorder()
	app.Handler().ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("create prompt split status = %d body = %s", response.Code, response.Body.String())
	}
	select {
	case <-started:
	case <-time.After(2 * time.Second):
		t.Fatal("split chat task did not start")
	}
	request = httptest.NewRequest(http.MethodPost, "/api/creation-tasks/prompt-splits/http-cancel/cancel", nil)
	request.Header.Set("Authorization", "Bearer "+rawKey)
	response = httptest.NewRecorder()
	app.Handler().ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("cancel prompt split status = %d body = %s", response.Code, response.Body.String())
	}
	var cancelled map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &cancelled); err != nil {
		t.Fatalf("cancel prompt split json: %v", err)
	}
	if cancelled["status"] != service.PromptSplitStatusCancelled {
		t.Fatalf("cancelled batch = %#v", cancelled)
	}
}

func installPromptSplitHTTPTasks(t *testing.T, app *App, generation service.ImageTaskHandler, chat service.ImageTaskHandler) {
	t.Helper()
	if app.promptSplits != nil {
		app.promptSplits.Close()
	}
	app.tasks = service.NewStoredImageTaskService(testJSONStoreFromApp(t, app), generation, failingHTTPImageTaskHandler, chat, func() int { return 30 })
	app.promptSplits = service.NewStoredPromptSplitService(testJSONStoreFromApp(t, app), app.tasks)
	app.promptSplits.Resume()
}
