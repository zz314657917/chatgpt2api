package service

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

func TestParsePromptSplitResult(t *testing.T) {
	for _, test := range []struct {
		name     string
		value    string
		count    int
		wantAxis string
		want     []PromptSplitResultItem
		wantErr  bool
	}{
		{
			name:     "plain JSON",
			value:    `{"variation_axis":"颜色","items":[{"variant_label":"红色","prompt":"红色陶瓷瓶子"},{"variant_label":"蓝色","prompt":"蓝色陶瓷瓶子"}]}`,
			count:    2,
			wantAxis: "颜色",
			want:     []PromptSplitResultItem{{VariantLabel: "红色", Prompt: "红色陶瓷瓶子"}, {VariantLabel: "蓝色", Prompt: "蓝色陶瓷瓶子"}},
		},
		{
			name:     "single JSON fence",
			value:    "```json\n{\"variation_axis\":\"角度\",\"items\":[{\"variant_label\":\"正面\",\"prompt\":\"正面产品照\"}]}\n```",
			count:    1,
			wantAxis: "角度",
			want:     []PromptSplitResultItem{{VariantLabel: "正面", Prompt: "正面产品照"}},
		},
		{
			name:    "extra top-level key",
			value:   `{"variation_axis":"颜色","items":[{"variant_label":"红色","prompt":"红色瓶子"}],"note":"no"}`,
			count:   1,
			wantErr: true,
		},
		{
			name:    "extra item key",
			value:   `{"variation_axis":"颜色","items":[{"variant_label":"红色","prompt":"红色瓶子","note":"no"}]}`,
			count:   1,
			wantErr: true,
		},
		{
			name:    "empty axis",
			value:   `{"variation_axis":" ","items":[{"variant_label":"红色","prompt":"红色瓶子"}]}`,
			count:   1,
			wantErr: true,
		},
		{
			name:    "empty label",
			value:   `{"variation_axis":"颜色","items":[{"variant_label":" ","prompt":"红色瓶子"}]}`,
			count:   1,
			wantErr: true,
		},
		{
			name:    "duplicate normalized label",
			value:   `{"variation_axis":"颜色","items":[{"variant_label":"RED","prompt":"red bottle front"},{"variant_label":" red ","prompt":"red bottle side"}]}`,
			count:   2,
			wantErr: true,
		},
		{
			name:    "duplicate normalized prompt",
			value:   `{"variation_axis":"颜色","items":[{"variant_label":"红色","prompt":"SAME  PROMPT"},{"variant_label":"蓝色","prompt":" same prompt "}]}`,
			count:   2,
			wantErr: true,
		},
		{
			name:    "wrong count",
			value:   `{"variation_axis":"颜色","items":[{"variant_label":"红色","prompt":"红色瓶子"}]}`,
			count:   2,
			wantErr: true,
		},
		{
			name:    "multiple fences",
			value:   "```json\n{\"variation_axis\":\"颜色\",\"items\":[{\"variant_label\":\"红色\",\"prompt\":\"红色瓶子\"}]}\n```\n```",
			count:   1,
			wantErr: true,
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			got, err := ParsePromptSplitResult(test.value, test.count)
			if test.wantErr {
				if err == nil {
					t.Fatalf("ParsePromptSplitResult() error = nil, want error")
				}
				return
			}
			if err != nil {
				t.Fatalf("ParsePromptSplitResult() error = %v", err)
			}
			if got.VariationAxis != test.wantAxis || len(got.Items) != len(test.want) {
				t.Fatalf("result = %#v, want axis %q items %#v", got, test.wantAxis, test.want)
			}
			for index := range test.want {
				if got.Items[index] != test.want[index] {
					t.Fatalf("items[%d] = %#v, want %#v", index, got.Items[index], test.want[index])
				}
			}
		})
	}
}

func TestPromptSplitServiceNodesCreatesPromptsWithoutImageTasks(t *testing.T) {
	backend := newTestStorageBackend(t)
	var generationCalls int
	var chatCalls int
	var chatPayload map[string]any
	tasks := NewStoredImageTaskService(backend,
		func(context.Context, Identity, map[string]any) (map[string]any, error) {
			generationCalls++
			return map[string]any{"data": []map[string]any{{"url": "https://example.test/image.png"}}}, nil
		},
		failingImageTaskHandler,
		func(_ context.Context, _ Identity, payload map[string]any) (map[string]any, error) {
			chatCalls++
			chatPayload = util.CopyMap(payload)
			return map[string]any{"output_type": "text", "data": []map[string]any{{"text_response": `{"variation_axis":"颜色","items":[{"variant_label":"红色","prompt":"一只红色陶瓷瓶子，白色摄影棚背景"},{"variant_label":"蓝色","prompt":"一只蓝色陶瓷瓶子，白色摄影棚背景"},{"variant_label":"绿色","prompt":"一只绿色陶瓷瓶子，白色摄影棚背景"},{"variant_label":"黑色","prompt":"一只黑色陶瓷瓶子，白色摄影棚背景"},{"variant_label":"白色","prompt":"一只白色陶瓷瓶子，灰色摄影棚背景"}]}`}}}, nil
		},
		func() int { return 30 },
	)
	splits := NewStoredPromptSplitService(backend, tasks)
	defer splits.Close()
	identity := Identity{ID: "alice", Name: "Alice", Role: AuthRoleUser}

	if _, err := splits.Create(context.Background(), identity, PromptSplitCreateRequest{
		ClientTaskID:  "nodes-batch",
		Prompt:        "生成5个颜色的陶瓷瓶子",
		Model:         "gpt-5",
		SplitCount:    5,
		ExecutionMode: PromptSplitExecutionModeNodes,
	}); err != nil {
		t.Fatalf("Create() error = %v", err)
	}
	batch := waitForPromptSplitStatus(t, splits, identity, "nodes-batch", PromptSplitStatusReady)
	items := util.AsMapSlice(batch["items"])
	if batch["variation_axis"] != "颜色" || len(items) != 5 {
		t.Fatalf("batch = %#v, want color axis with 5 items", batch)
	}
	wantLabels := []string{"红色", "蓝色", "绿色", "黑色", "白色"}
	for index, item := range items {
		if item["index"] != index+1 || item["status"] != PromptSplitStatusReady || item["variant_label"] != wantLabels[index] {
			t.Fatalf("item %d = %#v", index, item)
		}
		if _, ok := item["task_id"]; ok {
			t.Fatalf("nodes item unexpectedly has task_id: %#v", item)
		}
	}
	if generationCalls != 0 {
		t.Fatalf("generation calls = %d, want 0", generationCalls)
	}
	messages := util.AsMapSlice(chatPayload["messages"])
	if len(messages) != 2 {
		t.Fatalf("split chat messages = %#v", chatPayload["messages"])
	}
	systemPrompt := util.Clean(messages[0]["content"])
	for _, required := range []string{
		"authoritative",
		"Prefer an explicitly quantified axis",
		"first strongly emphasized axis",
		"one color variant per prompt",
		"same frame",
		"Preserve explicit variant values and their order",
		"more values than required",
		"fewer",
		"explicitly restricts",
		"variation_axis",
		"exactly 5",
	} {
		if !strings.Contains(systemPrompt, required) {
			t.Fatalf("system prompt missing %q: %s", required, systemPrompt)
		}
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

func TestPromptSplitServiceNodeCountOverridesSourceTextNumber(t *testing.T) {
	backend := newTestStorageBackend(t)
	tasks := NewStoredImageTaskService(backend,
		failingImageTaskHandler,
		failingImageTaskHandler,
		func(context.Context, Identity, map[string]any) (map[string]any, error) {
			return map[string]any{"output_type": "text", "data": []map[string]any{{"text_response": `{"variation_axis":"颜色","items":[{"variant_label":"红色","prompt":"红色陶瓷瓶子"},{"variant_label":"蓝色","prompt":"蓝色陶瓷瓶子"},{"variant_label":"绿色","prompt":"绿色陶瓷瓶子"},{"variant_label":"黑色","prompt":"黑色陶瓷瓶子"}]}`}}}, nil
		},
		func() int { return 30 },
	)
	splits := NewStoredPromptSplitService(backend, tasks)
	defer splits.Close()
	identity := Identity{ID: "alice", Name: "Alice", Role: AuthRoleUser}

	if _, err := splits.Create(context.Background(), identity, PromptSplitCreateRequest{
		ClientTaskID:  "count-authority-batch",
		Prompt:        "生成5个颜色的陶瓷瓶子",
		SplitCount:    4,
		ExecutionMode: PromptSplitExecutionModeNodes,
	}); err != nil {
		t.Fatalf("Create() error = %v", err)
	}
	batch := waitForPromptSplitStatus(t, splits, identity, "count-authority-batch", PromptSplitStatusReady)
	if batch["variation_axis"] != "颜色" || len(util.AsMapSlice(batch["items"])) != 4 {
		t.Fatalf("count-authority batch = %#v", batch)
	}
}

func TestPromptSplitServiceInvalidSemanticResultCreatesNoImageTasks(t *testing.T) {
	backend := newTestStorageBackend(t)
	var generationCalls int
	tasks := NewStoredImageTaskService(backend,
		func(context.Context, Identity, map[string]any) (map[string]any, error) {
			generationCalls++
			return map[string]any{"data": []map[string]any{{"url": "https://example.test/image.png"}}}, nil
		},
		failingImageTaskHandler,
		func(context.Context, Identity, map[string]any) (map[string]any, error) {
			return map[string]any{"output_type": "text", "data": []map[string]any{{"text_response": `{"variation_axis":"颜色","items":[{"variant_label":"红色","prompt":"红色瓶子"},{"variant_label":" 红色 ","prompt":"蓝色瓶子"}]}`}}}, nil
		},
		func() int { return 30 },
	)
	splits := NewStoredPromptSplitService(backend, tasks)
	defer splits.Close()
	identity := Identity{ID: "alice", Name: "Alice", Role: AuthRoleUser}

	if _, err := splits.Create(context.Background(), identity, PromptSplitCreateRequest{
		ClientTaskID:  "invalid-semantic-batch",
		Prompt:        "两个颜色的瓶子",
		SplitCount:    2,
		ExecutionMode: PromptSplitExecutionModeDirect,
		ImageRequest:  &PromptSplitImageRequest{Model: "gpt-image-2", BaseURL: "https://example.test"},
	}); err != nil {
		t.Fatalf("Create() error = %v", err)
	}
	batch := waitForPromptSplitStatus(t, splits, identity, "invalid-semantic-batch", PromptSplitStatusError)
	if generationCalls != 0 || len(util.AsMapSlice(batch["items"])) != 0 {
		t.Fatalf("invalid semantic batch = %#v generationCalls=%d", batch, generationCalls)
	}
}

func TestPromptSplitServiceUsesInternalTaskNamespace(t *testing.T) {
	backend := newTestStorageBackend(t)
	tasks := NewStoredImageTaskService(backend,
		failingImageTaskHandler,
		failingImageTaskHandler,
		func(context.Context, Identity, map[string]any) (map[string]any, error) {
			return map[string]any{"output_type": "text", "data": []map[string]any{{"text_response": `{"variation_axis":"构图","items":[{"variant_label":"方案一","prompt":"split result"}]}`}}}, nil
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
			return map[string]any{"output_type": "text", "data": []map[string]any{{"text_response": `{"variation_axis":"场景","items":[{"variant_label":"场景一","prompt":"first scene"},{"variant_label":"场景二","prompt":"second scene"}]}`}}}, nil
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
			return map[string]any{"output_type": "text", "data": []map[string]any{{"text_response": `{"variation_axis":"构图","items":[{"variant_label":"方案一","prompt":"first"},{"variant_label":"方案二","prompt":"second"},{"variant_label":"方案三","prompt":"third"}]}`}}}, nil
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
		VariationAxis: "场景",
		ImageRequest:  &PromptSplitImageRequest{Model: "gpt-image-2", BaseURL: "https://example.test"},
		Items: []PromptSplitItem{
			{Index: 1, VariantLabel: "室内", Prompt: "first", TaskID: promptSplitChildTaskID("resume-batch", 1), Status: promptSplitItemStatusNotSubmitted},
			{Index: 2, VariantLabel: "室外", Prompt: "second", TaskID: promptSplitChildTaskID("resume-batch", 2), Status: promptSplitItemStatusNotSubmitted},
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
	items := util.AsMapSlice(batchResult["items"])
	if batchResult["variation_axis"] != "场景" || len(items) != 2 || items[0]["variant_label"] != "室内" || items[1]["variant_label"] != "室外" || calls != 2 {
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
