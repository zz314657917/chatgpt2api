package httpapi

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"testing"

	"chatgpt2api/internal/protocol"
	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

const sub2APITestPNGBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

type testSub2APIImageConfig struct {
	root string
}

func (c testSub2APIImageConfig) ImagesDir() string {
	path := filepath.Join(c.root, "images")
	_ = os.MkdirAll(path, 0o755)
	return path
}

func (c testSub2APIImageConfig) ImageMetadataDir() string {
	path := filepath.Join(c.root, "image_metadata")
	_ = os.MkdirAll(path, 0o755)
	return path
}

func (testSub2APIImageConfig) BaseURL() string {
	return "https://example.test"
}

func TestSub2APIChatModelRoutesAutoToDefaultChatModel(t *testing.T) {
	tests := []struct {
		name  string
		model any
		want  string
	}{
		{name: "empty", model: "", want: util.DefaultChatModel},
		{name: "auto", model: util.ImageModelAuto, want: util.DefaultChatModel},
		{name: "explicit gpt 5.5", model: util.ImageModelGPT55, want: util.ImageModelGPT55},
		{name: "explicit gpt 5", model: util.ImageModelGPT5, want: util.ImageModelGPT5},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := sub2APIChatModel(tt.model); got != tt.want {
				t.Fatalf("sub2APIChatModel(%v) = %q, want %q", tt.model, got, tt.want)
			}
		})
	}
}

func TestSub2APIChatPayloadRoutesAutoToDefaultChatModel(t *testing.T) {
	payload := sub2APIChatPayload(map[string]any{"model": util.ImageModelAuto})
	if got := payload["model"]; got != util.DefaultChatModel {
		t.Fatalf("model = %q, want %q", got, util.DefaultChatModel)
	}
}

func TestSub2APIImagePayloadNormalizesDecimalRatio(t *testing.T) {
	payload := sub2APIImageJSONPayload(map[string]any{"prompt": "draw", "model": util.ImageModelGPT, "size": "1:1.4"})
	if payload["size"] != "5:7" {
		t.Fatalf("size = %#v, want 5:7", payload["size"])
	}
}

func TestSub2APIImageBatchesPassesRequestedCountInOneCall(t *testing.T) {
	app := &App{}
	callCount := 0
	var gotN int
	result, err := app.callSub2APIImageBatches(context.Background(), service.Identity{}, map[string]any{"model": util.ImageModelGPT, "n": 10}, func(_ context.Context, payload map[string]any) (map[string]any, error) {
		callCount++
		gotN = util.ToInt(payload["n"], 0)
		return map[string]any{
			"created": 123,
			"data": []map[string]any{
				{"b64_json": "a"},
				{"b64_json": "b"},
			},
		}, nil
	})
	if err != nil {
		t.Fatalf("callSub2APIImageBatches() error = %v", err)
	}
	if callCount != 1 || gotN != 10 {
		t.Fatalf("gateway calls = %d n = %d, want one call with n=10", callCount, gotN)
	}
	if result == nil {
		t.Fatal("result is nil")
	}
}

func TestSub2APIOfficialImageBatchesSplitAtFourOutputs(t *testing.T) {
	app := &App{engine: &protocol.Engine{Config: testSub2APIImageConfig{root: t.TempDir()}}}
	var mu sync.Mutex
	var calls []int
	result, err := app.callSub2APIImageBatches(context.Background(), service.Identity{}, map[string]any{"model": util.ImageModelGPTOfficial, "n": 10}, func(_ context.Context, payload map[string]any) (map[string]any, error) {
		n := util.ToInt(payload["n"], 0)
		mu.Lock()
		calls = append(calls, n)
		mu.Unlock()
		data := make([]map[string]any, 0, n)
		for offset := 0; offset < n; offset++ {
			data = append(data, map[string]any{"b64_json": sub2APITestPNGBase64, "revised_prompt": fmt.Sprintf("image-%d", offset+1)})
		}
		return map[string]any{"created": 123, "data": data}, nil
	})
	if err != nil {
		t.Fatalf("callSub2APIImageBatches() error = %v", err)
	}
	sort.Ints(calls)
	if fmt.Sprint(calls) != "[2 4 4]" {
		t.Fatalf("gateway batch sizes = %#v, want [2 4 4]", calls)
	}
	data := util.AsMapSlice(result["data"])
	if len(data) != 10 {
		t.Fatalf("result data len = %d, want 10: %#v", len(data), data)
	}
	for index := 0; index < 8; index += 4 {
		for offset := 0; offset < 4; offset++ {
			if got := util.Clean(data[index+offset]["revised_prompt"]); got != fmt.Sprintf("image-%d", offset+1) {
				t.Fatalf("result data[%d] = %#v, want image-%d", index+offset, data[index+offset], offset+1)
			}
		}
	}
	if got := util.Clean(data[8]["revised_prompt"]); got != "image-1" {
		t.Fatalf("result data[8] = %#v, want image-1", data[8])
	}
	if got := util.Clean(data[9]["revised_prompt"]); got != "image-2" {
		t.Fatalf("result data[9] = %#v, want image-2", data[9])
	}
}

func TestSub2APIImageBatchRequests(t *testing.T) {
	got := sub2APIImageBatchRequests(10, 4)
	want := []sub2APIImageBatchRequest{{index: 1, count: 4}, {index: 5, count: 4}, {index: 9, count: 2}}
	if len(got) != len(want) {
		t.Fatalf("sub2APIImageBatchRequests() = %#v, want %#v", got, want)
	}
	for index := range want {
		if got[index] != want[index] {
			t.Fatalf("sub2APIImageBatchRequests() = %#v, want %#v", got, want)
		}
	}
}

func TestSub2APIOfficialImageBatchSizeHonorsLowerOutputBatchLimit(t *testing.T) {
	payload := map[string]any{"model": util.ImageModelGPTOfficial, "image_output_batch_limit": 2}
	if got := sub2APIImageBatchSize(payload); got != 2 {
		t.Fatalf("sub2APIImageBatchSize() = %d, want 2", got)
	}
	if got := sub2APIImageBatchRequests(10, sub2APIImageBatchSize(payload)); len(got) != 5 || got[0].count != 2 || got[4].index != 9 || got[4].count != 2 {
		t.Fatalf("sub2APIImageBatchRequests() = %#v, want five batches of 2", got)
	}
}

func TestSub2APIImageBatchSizeHonorsLowerOutputBatchLimitForAllModels(t *testing.T) {
	payload := map[string]any{"model": util.ImageModelGPT, "image_output_batch_limit": 2}
	if got := sub2APIImageBatchSize(payload); got != 2 {
		t.Fatalf("sub2APIImageBatchSize() = %d, want 2", got)
	}
	if got := sub2APIImageBatchRequests(10, sub2APIImageBatchSize(payload)); len(got) != 5 || got[0].count != 2 || got[4].index != 9 || got[4].count != 2 {
		t.Fatalf("sub2APIImageBatchRequests() = %#v, want five batches of 2", got)
	}
}

func TestSub2APIImageBatchesAcquireSlotsSequentially(t *testing.T) {
	app := &App{engine: &protocol.Engine{Config: testSub2APIImageConfig{root: t.TempDir()}}}
	active := 0
	maxActive := 0
	var acquired []int
	payload := map[string]any{
		"model":                    "gpt-image-2",
		"n":                        5,
		"image_output_batch_limit": 2,
		protocol.ImageOutputSlotAcquirerPayloadKey: func(_ context.Context, index int) (func(), error) {
			active++
			if active > maxActive {
				maxActive = active
			}
			acquired = append(acquired, index)
			return func() {
				active--
			}, nil
		},
	}
	var calls []int
	result, err := app.callSub2APIImageBatches(context.Background(), service.Identity{}, payload, func(_ context.Context, batchPayload map[string]any) (map[string]any, error) {
		n := util.ToInt(batchPayload["n"], 0)
		calls = append(calls, n)
		data := make([]map[string]any, 0, n)
		for offset := 0; offset < n; offset++ {
			data = append(data, map[string]any{"b64_json": sub2APITestPNGBase64, "revised_prompt": fmt.Sprintf("batch-%d-image-%d", len(calls), offset+1)})
		}
		return map[string]any{"created": 123, "data": data}, nil
	})
	if err != nil {
		t.Fatalf("callSub2APIImageBatches() error = %v", err)
	}
	if fmt.Sprint(calls) != "[2 2 1]" {
		t.Fatalf("gateway batch sizes = %#v, want [2 2 1]", calls)
	}
	if fmt.Sprint(acquired) != "[1 2 3 4 5]" {
		t.Fatalf("acquired slots = %#v, want [1 2 3 4 5]", acquired)
	}
	if maxActive != 2 {
		t.Fatalf("max active slots = %d, want 2", maxActive)
	}
	if data := util.AsMapSlice(result["data"]); len(data) != 5 {
		t.Fatalf("result data len = %d, want 5: %#v", len(data), data)
	}
}

func TestSub2APIImageBatchesCancelContextAfterBatchFailure(t *testing.T) {
	app := &App{}
	expected := errors.New("gateway failed")
	var seenCancelled bool
	_, err := app.callSub2APIImageBatches(context.Background(), service.Identity{}, map[string]any{"model": util.ImageModelGPTOfficial, "n": 5}, func(ctx context.Context, payload map[string]any) (map[string]any, error) {
		if util.ToInt(payload["n"], 0) == 4 {
			return nil, expected
		}
		seenCancelled = ctx.Err() != nil
		return map[string]any{"created": 123, "data": []map[string]any{{"b64_json": "a"}}}, nil
	})
	if !errors.Is(err, expected) {
		t.Fatalf("callSub2APIImageBatches() error = %v, want %v", err, expected)
	}
	if seenCancelled {
		t.Fatal("later batch was called after first batch failed")
	}
}
