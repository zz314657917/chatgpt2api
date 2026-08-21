package service

import (
	"errors"
	"fmt"
	"strings"

	"chatgpt2api/internal/util"
)

const imageContentPolicyMessagePrefix = "image generation request rejected by content policy"
const imageTooLargeMessage = "参考图片过大，单张图片请压缩到 1MB 以内，或使用可公开访问的图片 URL"

type ImageContentPolicyError struct {
	Category string
	Reason   string
	Message  string
}

func (e ImageContentPolicyError) Error() string {
	if text := strings.TrimSpace(e.Message); text != "" {
		return text
	}
	if e.Reason == "" {
		return imageContentPolicyMessagePrefix
	}
	return fmt.Sprintf("%s: %s", imageContentPolicyMessagePrefix, e.Reason)
}

func (e ImageContentPolicyError) OpenAIError() map[string]any {
	return map[string]any{"error": map[string]any{
		"message": util.LocalizeErrorMessage(e.Error()),
		"type":    "invalid_request_error",
		"param":   "prompt",
		"code":    "content_policy_violation",
	}}
}

type ImageTooLargeError struct {
	Message string
}

func (e ImageTooLargeError) Error() string {
	if text := strings.TrimSpace(e.Message); text != "" {
		return text
	}
	return imageTooLargeMessage
}

func (e ImageTooLargeError) OpenAIError() map[string]any {
	return map[string]any{"error": map[string]any{
		"message": e.Error(),
		"type":    "invalid_request_error",
		"param":   "image",
		"code":    "image_too_large",
	}}
}

func NormalizeImageContentPolicyError(err error) error {
	return NormalizeImageRequestError(err)
}

func NormalizeImageRequestError(err error) error {
	if err == nil {
		return nil
	}
	var policyErr ImageContentPolicyError
	var tooLargeErr ImageTooLargeError
	if strings.TrimSpace(err.Error()) == "" || errors.As(err, &policyErr) || errors.As(err, &tooLargeErr) {
		return err
	}
	if IsUpstreamImageContentPolicyMessage(err.Error()) {
		return ImageContentPolicyError{Category: "upstream", Message: err.Error()}
	}
	if IsUpstreamImageTooLargeMessage(err.Error()) {
		return ImageTooLargeError{}
	}
	return err
}

func IsUpstreamImageContentPolicyMessage(message string) bool {
	text := strings.TrimSpace(message)
	if text == "" {
		return false
	}
	lower := strings.ToLower(text)
	return strings.Contains(lower, "content policy") ||
		strings.Contains(lower, "content_policy_violation") ||
		strings.Contains(lower, "safety policy") ||
		strings.Contains(text, "内容不合规") ||
		strings.Contains(text, "内容违规") ||
		strings.Contains(text, "安全策略") ||
		(strings.Contains(text, "修改提示词") && strings.Contains(text, "重试"))
}

func IsUpstreamImageTooLargeMessage(message string) bool {
	text := strings.TrimSpace(message)
	if text == "" {
		return false
	}
	lower := strings.ToLower(text)
	return strings.Contains(lower, "part exceeded maximum size") ||
		strings.Contains(lower, "maximum size of 1024kb") ||
		strings.Contains(lower, "max_part_size") ||
		strings.Contains(lower, "image_too_large") ||
		strings.Contains(lower, "image too large") ||
		strings.Contains(text, "图片过大") ||
		strings.Contains(text, "参考图过大")
}
