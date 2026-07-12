package service

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

func TestParsePromptSplitPrompts(t *testing.T) {
	for _, test := range []struct {
		name    string
		value   string
		count   int
		want    []string
		wantErr bool
	}{
		{
			name:  "plain JSON",
			value: `{"prompts":["first","second"]}`,
			count: 2,
			want:  []string{"first", "second"},
		},
		{
			name:  "single JSON fence",
			value: "```json\n{\"prompts\":[\"first\",\"second\"]}\n```",
			count: 2,
			want:  []string{"first", "second"},
		},
		{
			name:    "extra key",
			value:   `{"prompts":["first"],"note":"no"}`,
			count:   1,
			wantErr: true,
		},
		{
			name:    "duplicate prompt",
			value:   `{"prompts":["same","same"]}`,
			count:   2,
			wantErr: true,
		},
		{
			name:    "wrong count",
			value:   `{"prompts":["only"]}`,
			count:   2,
			wantErr: true,
		},
		{
			name:    "multiple fences",
			value:   "```json\n{\"prompts\":[\"one\"]}\n```\n```",
			count:   1,
			wantErr: true,
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			got, err := ParsePromptSplitPrompts(test.value, test.count)
			if test.wantErr {
				if err == nil {
					t.Fatalf("ParsePromptSplitPrompts() error = nil, want error")
				}
				return
			}
			if err != nil {
				t.Fatalf("ParsePromptSplitPrompts() error = %v", err)
			}
			if len(got) != len(test.want) {
				t.Fatalf("prompts = %#v, want %#v", got, test.want)
			}
			for index := range test.want {
				if got[index] != test.want[index] {
					t.Fatalf("prompts[%d] = %q, want %q", index, got[index], test.want[index])
				}
			}
		})
	}
}

func TestPromptSplitServiceNodesCreatesPromptsWithoutImageTasks(t *testing.T) {
	backend := newTestStorageBackend(t)
	var generationCalls int
	var chatCalls int
	tasks := NewStoredImageTaskService(backend,
		func(context.Context, Identity, map[string]any) (map[string]any, error) {
			generationCalls++
			return map[string]any{"data": []map[string]any{{"url": "https://example.test/image.png"}}}, nil
		},
		failingImageTaskHandler,
		func(context.Context, Identity, map[string]any) (map[string]any, error) {
			chatCalls++
			return map[string]any{"output_type": "text", "data": []map[string]any{{"text_response": `{"prompts":["first scene","second scene","third scene"]}`}}}, nil
		},
		func() int { return 30 },
	)
	splits := NewStoredPromptSplitService(backend, tasks)
	defer splits.Close()
	identity := Identity{ID: "alice", Name: "Alice", Role: AuthRoleUser}

	if _, err := splits.Create(context.Background(), identity, PromptSplitCreateRequest{
		ClientTaskID:  "nodes-batch",
		Prompt:        "three scenes",
		Model:         "gpt-5",
		SplitCount:    3,
		ExecutionMode: PromptSplitExecutionModeNodes,
	}); err != nil {
		t.Fatalf("Create() error = %v", err)
	}
	batch := waitForPromptSplitStatus(t, splits, identity, "nodes-batch", PromptSplitStatusReady)
	items := util.AsMapSlice(batch["items"])
	if len(items) != 3 {
		t.Fatalf("items = %#v, want 3 items", items)
	}
	for index, item := range items {
		if item["index"] != index+1 || item["status"] != PromptSplitStatusReady {
			t.Fatalf("item %d = %#v", index, item)
		}
		if _, ok := item["task_id"]; ok {
			t.Fatalf("nodes item unexpectedly has task_id: %#v", item)
		}
	}
	if generationCalls != 0 {
		t.Fatalf("generation calls = %d, want 0", generationCalls)
	}
	if _, err := splits.Create(context.Background(), identity, PromptSplitCreateRequest{ClientTaskID: "nodes-batch"}); err != nil {
		t.Fatalf("duplicate Create() error = %v", err)
	}
	if chatCalls != 1 {
		t.Fatalf("chat calls = %d, want one idempotent split task", chatCalls)
	}
	if _, err := splits.Get(Identity{ID: "bob", Role: AuthRoleUser}, "nodes-batch"); err == nil {
		t.Fatal("other owner should not read prompt split batch")
	}
}

func TestPromptSplitServiceUsesInternalTaskNamespace(t *testing.T) {
	backend := newTestStorageBackend(t)
	tasks := NewStoredImageTaskService(backend,
		failingImageTaskHandler,
		failingImageTaskHandler,
		func(context.Context, Identity, map[string]any) (map[string]any, error) {
			return map[string]any{"output_type": "text", "data": []map[string]any{{"text_response": `{"prompts":["split result"]}`}}}, nil
		},
		func() int { return 30 },
	)
	splits := NewStoredPromptSplitService(backend, tasks)
	defer splits.Close()
	identity := Identity{ID: "alice", Name: "Alice", Role: AuthRoleUser}
	ordinaryTaskID := "namespace-batch:split"
	if _, err := tasks.SubmitChat(context.Background(), identity, ordinaryTaskID, "ordinary", "gpt-5", []map[string]any{{"role": "user", "content": "ordinary"}}, false); err != nil {
		t.Fatalf("SubmitChat(ordinary task) error = %v", err)
	}
	waitForTaskStatus(t, tasks, identity, ordinaryTaskID, TaskStatusSuccess)

	batch, err := splits.Create(context.Background(), identity, PromptSplitCreateRequest{
		ClientTaskID:  "namespace-batch",
		Prompt:        "split this",
		SplitCount:    1,
		ExecutionMode: PromptSplitExecutionModeNodes,
	})
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}
	if batch["split_task_id"] != promptSplitTaskID("namespace-batch") || batch["split_task_id"] == ordinaryTaskID {
		t.Fatalf("internal split task id = %#v, ordinary id = %q", batch["split_task_id"], ordinaryTaskID)
	}
	waitForPromptSplitStatus(t, splits, identity, "namespace-batch", PromptSplitStatusReady)
}

func TestPromptSplitServiceDirectForcesOneImageAndKeepsPartialFailure(t *testing.T) {
	backend := newTestStorageBackend(t)
	var mu sync.Mutex
	payloads := make([]map[string]any, 0, 2)
	tasks := NewStoredImageTaskService(backend,
		func(_ context.Context, _ Identity, payload map[string]any) (map[string]any, error) {
			mu.Lock()
			payloads = append(payloads, util.CopyMap(payload))
			mu.Unlock()
			if util.Clean(payload["prompt"]) == "second scene" {
				return nil, errors.New("second image failed")
			}
			return map[string]any{"data": []map[string]any{{"url": "https://example.test/first.png"}}}, nil
		},
		failingImageTaskHandler,
		func(context.Context, Identity, map[string]any) (map[string]any, error) {
			return map[string]any{"output_type": "text", "data": []map[string]any{{"text_response": `{"prompts":["first scene","second scene"]}`}}}, nil
		},
		func() int { return 30 },
	)
	splits := NewStoredPromptSplitService(backend, tasks)
	defer splits.Close()
	identity := Identity{ID: "alice", Name: "Alice", Role: AuthRoleUser}

	if _, err := splits.Create(context.Background(), identity, PromptSplitCreateRequest{
		ClientTaskID:  "direct-batch",
		Prompt:        "two scenes",
		Model:         "gpt-5",
		SplitCount:    2,
		ExecutionMode: PromptSplitExecutionModeDirect,
		ImageRequest: &PromptSplitImageRequest{
			Model:              "gpt-image-2-official",
			Size:               "16:9",
			Quality:            "high",
			BaseURL:            "https://example.test",
			Metadata:           map[string]any{"professional_mode": true},
			ProfessionalMode:   true,
			ImageResolution:    "2k",
			OfficialSettings:   map[string]any{"resolution": "2k"},
			ProStudio:          map[string]any{"enabled": true},
			MidjourneySettings: map[string]any{"version": "8.1"},
		},
	}); err != nil {
		t.Fatalf("Create() error = %v", err)
	}
	batch := waitForPromptSplitStatus(t, splits, identity, "direct-batch", PromptSplitStatusPartialSuccess)
	items := util.AsMapSlice(batch["items"])
	if len(items) != 2 {
		t.Fatalf("items = %#v, want 2 items", items)
	}
	if items[0]["task_id"] != promptSplitChildTaskID("direct-batch", 1) || items[0]["status"] != TaskStatusSuccess {
		t.Fatalf("first item = %#v", items[0])
	}
	if items[1]["task_id"] != promptSplitChildTaskID("direct-batch", 2) || items[1]["status"] != TaskStatusError {
		t.Fatalf("second item = %#v", items[1])
	}
	mu.Lock()
	defer mu.Unlock()
	if len(payloads) != 2 {
		t.Fatalf("generation payloads = %#v", payloads)
	}
	for _, payload := range payloads {
		if payload["n"] != 1 {
			t.Fatalf("generation n = %#v, want 1 in %#v", payload["n"], payload)
		}
		if payload["professional_mode"] != true || util.StringMap(payload["official_settings"])["resolution"] != "2k" {
			t.Fatalf("official metadata was not preserved: %#v", payload)
		}
	}
}

func TestPromptSplitServiceStopsAfterAdmissionFailure(t *testing.T) {
	backend := newTestStorageBackend(t)
	tasks := NewStoredImageTaskService(backend,
		func(context.Context, Identity, map[string]any) (map[string]any, error) {
			return map[string]any{"data": []map[string]any{{"url": "https://example.test/image.png"}}}, nil
		},
		failingImageTaskHandler,
		func(context.Context, Identity, map[string]any) (map[string]any, error) {
			return map[string]any{"output_type": "text", "data": []map[string]any{{"text_response": `{"prompts":["first","second","third"]}`}}}, nil
		},
		func() int { return 30 },
		nil,
		func() int { return 2 },
	)
	splits := NewStoredPromptSplitService(backend, tasks)
	defer splits.Close()
	identity := Identity{ID: "alice", Name: "Alice", Role: AuthRoleUser}

	if _, err := splits.Create(context.Background(), identity, PromptSplitCreateRequest{
		ClientTaskID:  "rpm-batch",
		Prompt:        "three scenes",
		SplitCount:    3,
		ExecutionMode: PromptSplitExecutionModeDirect,
		ImageRequest:  &PromptSplitImageRequest{Model: "gpt-image-2", BaseURL: "https://example.test"},
	}); err != nil {
		t.Fatalf("Create() error = %v", err)
	}
	batch := waitForPromptSplitStatus(t, splits, identity, "rpm-batch", PromptSplitStatusPartialSuccess)
	items := util.AsMapSlice(batch["items"])
	if len(items) != 3 || items[0]["status"] != TaskStatusSuccess || items[1]["status"] != TaskStatusError || items[2]["status"] != promptSplitItemStatusNotSubmitted {
		t.Fatalf("RPM batch items = %#v", items)
	}
	if util.Clean(items[2]["error"]) == "" {
		t.Fatalf("not submitted item should explain admission stop: %#v", items[2])
	}
}

func TestPromptSplitServiceCancelCancelsActiveSplitTask(t *testing.T) {
	backend := newTestStorageBackend(t)
	started := make(chan struct{})
	tasks := NewStoredImageTaskService(backend,
		failingImageTaskHandler,
		failingImageTaskHandler,
		func(ctx context.Context, _ Identity, _ map[string]any) (map[string]any, error) {
			close(started)
			<-ctx.Done()
			return nil, ctx.Err()
		},
		func() int { return 30 },
	)
	splits := NewStoredPromptSplitService(backend, tasks)
	defer splits.Close()
	identity := Identity{ID: "alice", Name: "Alice", Role: AuthRoleUser}

	if _, err := splits.Create(context.Background(), identity, PromptSplitCreateRequest{
		ClientTaskID:  "cancel-batch",
		Prompt:        "wait",
		SplitCount:    1,
		ExecutionMode: PromptSplitExecutionModeNodes,
	}); err != nil {
		t.Fatalf("Create() error = %v", err)
	}
	select {
	case <-started:
	case <-time.After(2 * time.Second):
		t.Fatal("split chat task did not start")
	}
	batch, err := splits.Cancel(identity, "cancel-batch")
	if err != nil {
		t.Fatalf("Cancel() error = %v", err)
	}
	if batch["status"] != PromptSplitStatusCancelled {
		t.Fatalf("cancelled batch = %#v", batch)
	}
	waitForTaskStatus(t, tasks, identity, promptSplitTaskID("cancel-batch"), TaskStatusCancelled)
}

func TestPromptSplitServiceCancelReturnsSaveFailureWithoutCancellingTasks(t *testing.T) {
	backend := newTestStorageBackend(t)
	started := make(chan struct{})
	tasks := NewStoredImageTaskService(backend,
		failingImageTaskHandler,
		failingImageTaskHandler,
		func(ctx context.Context, _ Identity, _ map[string]any) (map[string]any, error) {
			close(started)
			<-ctx.Done()
			return nil, ctx.Err()
		},
		func() int { return 30 },
	)
	splits := NewStoredPromptSplitService(backend, tasks)
	identity := Identity{ID: "alice", Name: "Alice", Role: AuthRoleUser}
	if _, err := splits.Create(context.Background(), identity, PromptSplitCreateRequest{
		ClientTaskID:  "save-failure-batch",
		Prompt:        "wait",
		SplitCount:    1,
		ExecutionMode: PromptSplitExecutionModeNodes,
	}); err != nil {
		t.Fatalf("Create() error = %v", err)
	}
	select {
	case <-started:
	case <-time.After(2 * time.Second):
		t.Fatal("split chat task did not start")
	}
	store := jsonDocumentStoreFromBackend(backend)
	splits.store = &failingJSONDocumentStore{base: store, failName: promptSplitDocumentName}
	if _, err := splits.Cancel(identity, "save-failure-batch"); err == nil {
		t.Fatal("Cancel() error = nil, want save error")
	}
	batch, err := splits.Get(identity, "save-failure-batch")
	if err != nil || batch["status"] != PromptSplitStatusSplitting {
		t.Fatalf("batch after failed cancel = %#v err=%v", batch, err)
	}
	task, ok := tasks.GetTask(identity, promptSplitTaskID("save-failure-batch"))
	if !ok || task["status"] == TaskStatusCancelled {
		t.Fatalf("split task should remain active after failed cancel: %#v ok=%v", task, ok)
	}
	splits.store = store
	if _, err := splits.Cancel(identity, "save-failure-batch"); err != nil {
		t.Fatalf("cleanup Cancel() error = %v", err)
	}
	splits.Close()
}

func TestPromptSplitServiceResumeSubmitsOnlyPersistedUnsubmittedChildren(t *testing.T) {
	backend := newTestStorageBackend(t)
	store := backend.(storage.JSONDocumentBackend)
	identity := Identity{ID: "alice", Name: "Alice", Role: AuthRoleUser}
	now := util.NowLocal()
	batch := promptSplitBatch{
		ID:            "resume-batch",
		OwnerID:       "alice",
		Identity:      promptSplitIdentityFrom(identity),
		SourcePrompt:  "already split",
		SplitModel:    "gpt-5",
		Status:        PromptSplitStatusSubmitting,
		ExecutionMode: PromptSplitExecutionModeDirect,
		SplitCount:    2,
		SplitTaskID:   promptSplitTaskID("resume-batch"),
		ImageRequest:  &PromptSplitImageRequest{Model: "gpt-image-2", BaseURL: "https://example.test"},
		Items: []PromptSplitItem{
			{Index: 1, Prompt: "first", TaskID: promptSplitChildTaskID("resume-batch", 1), Status: promptSplitItemStatusNotSubmitted},
			{Index: 2, Prompt: "second", TaskID: promptSplitChildTaskID("resume-batch", 2), Status: promptSplitItemStatusNotSubmitted},
		},
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := store.SaveJSONDocument(promptSplitDocumentName, promptSplitDocument{Items: []promptSplitBatch{batch}}); err != nil {
		t.Fatalf("SaveJSONDocument() error = %v", err)
	}
	var calls int
	var callsMu sync.Mutex
	tasks := NewStoredImageTaskService(backend,
		func(context.Context, Identity, map[string]any) (map[string]any, error) {
			callsMu.Lock()
			calls++
			callsMu.Unlock()
			return map[string]any{"data": []map[string]any{{"url": "https://example.test/image.png"}}}, nil
		},
		failingImageTaskHandler,
		failingImageTaskHandler,
		func() int { return 30 },
	)
	splits := NewStoredPromptSplitService(backend, tasks)
	defer splits.Close()
	splits.Resume()
	batchResult := waitForPromptSplitStatus(t, splits, identity, "resume-batch", PromptSplitStatusSuccess)
	callsMu.Lock()
	defer callsMu.Unlock()
	if len(util.AsMapSlice(batchResult["items"])) != 2 || calls != 2 {
		t.Fatalf("resume batch = %#v calls=%d", batchResult, calls)
	}
}

func TestPromptSplitServiceRestartDoesNotReissueActiveSplitTask(t *testing.T) {
	backend := newTestStorageBackend(t)
	identity := Identity{ID: "alice", Name: "Alice", Role: AuthRoleUser}
	started := make(chan struct{})
	release := make(chan struct{})
	var chatCalls int
	tasksBeforeRestart := NewStoredImageTaskService(backend,
		failingImageTaskHandler,
		failingImageTaskHandler,
		func(context.Context, Identity, map[string]any) (map[string]any, error) {
			chatCalls++
			close(started)
			<-release
			return nil, errors.New("simulated process stop")
		},
		func() int { return 30 },
	)
	splitsBeforeRestart := NewStoredPromptSplitService(backend, tasksBeforeRestart)
	if _, err := splitsBeforeRestart.Create(context.Background(), identity, PromptSplitCreateRequest{
		ClientTaskID:  "restart-batch",
		Prompt:        "wait",
		SplitCount:    1,
		ExecutionMode: PromptSplitExecutionModeNodes,
	}); err != nil {
		t.Fatalf("Create() error = %v", err)
	}
	select {
	case <-started:
	case <-time.After(2 * time.Second):
		t.Fatal("split chat task did not start")
	}
	splitsBeforeRestart.Close()

	tasksAfterRestart := NewStoredImageTaskService(backend, failingImageTaskHandler, failingImageTaskHandler, failingImageTaskHandler, func() int { return 30 })
	splitsAfterRestart := NewStoredPromptSplitService(backend, tasksAfterRestart)
	defer splitsAfterRestart.Close()
	splitsAfterRestart.Resume()
	batch := waitForPromptSplitStatus(t, splitsAfterRestart, identity, "restart-batch", PromptSplitStatusError)
	if util.Clean(batch["error"]) == "" {
		t.Fatalf("restart batch should retain an error: %#v", batch)
	}
	if chatCalls != 1 {
		t.Fatalf("chat calls = %d, want existing task only", chatCalls)
	}
	close(release)
}

func TestPromptSplitServiceRestartKeepsErroredChildAndSubmitsOnlyPendingChild(t *testing.T) {
	backend := newTestStorageBackend(t)
	identity := Identity{ID: "alice", Name: "Alice", Role: AuthRoleUser}
	oldStarted := make(chan struct{})
	oldRelease := make(chan struct{})
	tasksBeforeRestart := NewStoredImageTaskService(backend,
		func(context.Context, Identity, map[string]any) (map[string]any, error) {
			close(oldStarted)
			<-oldRelease
			return nil, errors.New("simulated process stop")
		},
		failingImageTaskHandler,
		failingImageTaskHandler,
		func() int { return 30 },
	)
	if _, err := tasksBeforeRestart.SubmitGeneration(context.Background(), identity, promptSplitChildTaskID("children-restart-batch", 1), "old child", "gpt-image-2", "", "", "https://example.test", 1, nil); err != nil {
		t.Fatalf("SubmitGeneration() error = %v", err)
	}
	select {
	case <-oldStarted:
	case <-time.After(2 * time.Second):
		t.Fatal("old child task did not start")
	}
	store := backend.(storage.JSONDocumentBackend)
	now := util.NowLocal()
	batch := promptSplitBatch{
		ID:            "children-restart-batch",
		OwnerID:       "alice",
		Identity:      promptSplitIdentityFrom(identity),
		SourcePrompt:  "already split",
		SplitModel:    "gpt-5",
		Status:        PromptSplitStatusRunning,
		ExecutionMode: PromptSplitExecutionModeDirect,
		SplitCount:    2,
		SplitTaskID:   promptSplitTaskID("children-restart-batch"),
		ImageRequest:  &PromptSplitImageRequest{Model: "gpt-image-2", BaseURL: "https://example.test"},
		Items: []PromptSplitItem{
			{Index: 1, Prompt: "old child", TaskID: promptSplitChildTaskID("children-restart-batch", 1), Status: TaskStatusRunning},
			{Index: 2, Prompt: "pending child", TaskID: promptSplitChildTaskID("children-restart-batch", 2), Status: promptSplitItemStatusNotSubmitted},
		},
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := store.SaveJSONDocument(promptSplitDocumentName, promptSplitDocument{Items: []promptSplitBatch{batch}}); err != nil {
		t.Fatalf("SaveJSONDocument() error = %v", err)
	}
	var newCalls int
	var newCallsMu sync.Mutex
	tasksAfterRestart := NewStoredImageTaskService(backend,
		func(context.Context, Identity, map[string]any) (map[string]any, error) {
			newCallsMu.Lock()
			newCalls++
			newCallsMu.Unlock()
			return map[string]any{"data": []map[string]any{{"url": "https://example.test/new.png"}}}, nil
		},
		failingImageTaskHandler,
		failingImageTaskHandler,
		func() int { return 30 },
	)
	splits := NewStoredPromptSplitService(backend, tasksAfterRestart)
	defer splits.Close()
	splits.Resume()
	batchResult := waitForPromptSplitStatus(t, splits, identity, "children-restart-batch", PromptSplitStatusPartialSuccess)
	items := util.AsMapSlice(batchResult["items"])
	if len(items) != 2 || items[0]["status"] != TaskStatusError || items[1]["status"] != TaskStatusSuccess {
		t.Fatalf("restart child items = %#v", items)
	}
	newCallsMu.Lock()
	if newCalls != 1 {
		newCallsMu.Unlock()
		t.Fatalf("restart generation calls = %d, want pending child only", newCalls)
	}
	newCallsMu.Unlock()
	close(oldRelease)
}

func waitForPromptSplitStatus(t *testing.T, splits *PromptSplitService, identity Identity, id, want string) map[string]any {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		batch, err := splits.Get(identity, id)
		if err == nil && batch["status"] == want {
			return batch
		}
		time.Sleep(10 * time.Millisecond)
	}
	batch, err := splits.Get(identity, id)
	t.Fatalf("prompt split %s did not reach %s; batch=%#v err=%v", id, want, batch, err)
	return nil
}
