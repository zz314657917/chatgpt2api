package service

import (
	"errors"
	"testing"
)

func TestNormalizeImageContentPolicyErrorDetectsUpstreamMessages(t *testing.T) {
	tests := []string{
		"内容不合规：「a painting of a woman wearing a yellow dress」，请修改提示词后重试",
		"image generation failed: content_policy_violation",
		"Your request was rejected by content policy.",
	}

	for _, message := range tests {
		t.Run(message, func(t *testing.T) {
			err := NormalizeImageContentPolicyError(errors.New(message))
			var policyErr ImageContentPolicyError
			if !errors.As(err, &policyErr) {
				t.Fatalf("NormalizeImageContentPolicyError() error = %T %v, want ImageContentPolicyError", err, err)
			}
			if policyErr.Category != "upstream" {
				t.Fatalf("category = %q, want upstream", policyErr.Category)
			}
			if policyErr.Error() != message {
				t.Fatalf("message = %q, want original", policyErr.Error())
			}
		})
	}
}

func TestNormalizeImageRequestErrorDetectsUpstreamImageTooLarge(t *testing.T) {
	tests := []string{
		"status_code=400, Part exceeded maximum size of 1024KB.",
		"Part exceeded maximum size of 1024KB",
		"image_too_large",
	}

	for _, message := range tests {
		t.Run(message, func(t *testing.T) {
			err := NormalizeImageRequestError(errors.New(message))
			var tooLargeErr ImageTooLargeError
			if !errors.As(err, &tooLargeErr) {
				t.Fatalf("NormalizeImageRequestError() error = %T %v, want ImageTooLargeError", err, err)
			}
			body := tooLargeErr.OpenAIError()["error"].(map[string]any)
			if body["code"] != "image_too_large" || body["param"] != "image" || body["type"] != "invalid_request_error" {
				t.Fatalf("OpenAIError() = %#v", body)
			}
		})
	}
}

func TestNormalizeImageContentPolicyErrorLeavesOrdinaryError(t *testing.T) {
	err := errors.New("upstream failed")
	if got := NormalizeImageContentPolicyError(err); got != err {
		t.Fatalf("NormalizeImageContentPolicyError() = %T %v, want original", got, got)
	}
}
