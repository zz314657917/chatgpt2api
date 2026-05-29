package httpapi

import (
	"context"
	"testing"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

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

func TestSub2APIImageBatchesPassesRequestedCountInOneCall(t *testing.T) {
	app := &App{}
	callCount := 0
	var gotN int
	result, err := app.callSub2APIImageBatches(context.Background(), service.Identity{}, map[string]any{"n": 10}, func(payload map[string]any) (map[string]any, error) {
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
