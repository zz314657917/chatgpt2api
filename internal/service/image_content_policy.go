package service

import (
	"errors"
	"fmt"
	"strings"
	"unicode"
	"unicode/utf8"

	"chatgpt2api/internal/util"
)

const imageContentPolicyMessagePrefix = "image generation request rejected by content policy"

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

func NormalizeImageContentPolicyError(err error) error {
	if err == nil {
		return nil
	}
	var policyErr ImageContentPolicyError
	if strings.TrimSpace(err.Error()) == "" || errors.As(err, &policyErr) {
		return err
	}
	if IsUpstreamImageContentPolicyMessage(err.Error()) {
		return ImageContentPolicyError{Category: "upstream", Message: err.Error()}
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

type imageContentPolicyRule struct {
	Category string
	Reason   string
	Any      []string
	All      []string
}

var imageContentPolicyRules = []imageContentPolicyRule{
	{
		Category: "adult_private_body",
		Reason:   "成人私密、色情或裸露人体内容不允许生成",
		Any: []string{
			"真人去衣", "去衣", "脱衣", "脱光", "脱掉衣服", "裸照", "裸体", "全裸", "露点",
			"走光", "漏点", "裙底", "偷拍裙底", "色情", "情色", "成人内容", "成人图", "黄图",
			"黄色内容", "黄色图片", "淫秽", "色情图片", "色情照片", "色情海报", "色情插画",
			"porn", "porno", "pornographic", "nsfw", "nude photo", "nude body",
			"情趣内衣", "丁字裤", "私密人体", "私密部位", "隐私部位", "私处", "下体",
			"生殖器", "阴部", "阴茎", "阴道", "乳头", "裸胸", "床照", "私房照", "私密照",
		},
	},
	{
		Category: "graphic_violence",
		Reason:   "暴力、血腥或严重伤害内容不允许生成",
		Any: []string{
			"血腥", "血淋淋", "暴力血腥", "暴力画面", "严重暴力", "酷刑", "虐杀", "肢解",
			"斩首", "砍头", "分尸", "断肢", "内脏外露", "枪杀", "刺杀", "砍杀", "屠杀",
			"gore", "graphic violence", "dismemberment", "decapitation",
		},
	},
}

func ValidateImageContentPolicy(prompt string, contextValues ...any) error {
	texts := append([]string{}, strings.TrimSpace(prompt))
	for _, value := range contextValues {
		texts = appendPolicyTexts(texts, value)
	}
	joined := strings.TrimSpace(strings.Join(texts, "\n"))
	if joined == "" {
		return nil
	}
	normalized := normalizeImagePolicyText(joined)
	for _, rule := range imageContentPolicyRules {
		if imageContentPolicyRuleMatches(rule, normalized) {
			return ImageContentPolicyError{Category: rule.Category, Reason: rule.Reason}
		}
	}
	return nil
}

func appendPolicyTexts(texts []string, value any) []string {
	switch typed := value.(type) {
	case nil:
		return texts
	case string:
		if text := strings.TrimSpace(typed); text != "" && !isDataImageURL(text) {
			texts = append(texts, text)
		}
	case []map[string]any:
		for _, item := range typed {
			texts = appendPolicyTexts(texts, item)
		}
	case []any:
		for _, item := range typed {
			texts = appendPolicyTexts(texts, item)
		}
	case map[string]any:
		texts = appendPolicyTextsFromMap(texts, typed)
	default:
		if text := strings.TrimSpace(util.Clean(value)); text != "" && !isDataImageURL(text) {
			texts = append(texts, text)
		}
	}
	return texts
}

func appendPolicyTextsFromMap(texts []string, item map[string]any) []string {
	for _, key := range []string{"prompt", "content", "text", "input_text", "instructions", "revised_prompt"} {
		if value, ok := item[key]; ok {
			texts = appendPolicyTexts(texts, value)
		}
	}
	return texts
}

func imageContentPolicyRuleMatches(rule imageContentPolicyRule, normalized string) bool {
	if len(rule.All) > 0 {
		for _, term := range rule.All {
			if !strings.Contains(normalized, normalizeImagePolicyText(term)) {
				return false
			}
		}
		return true
	}
	for _, term := range rule.Any {
		if strings.Contains(normalized, normalizeImagePolicyText(term)) {
			return true
		}
	}
	return false
}

func normalizeImagePolicyText(text string) string {
	text = strings.ToLower(strings.TrimSpace(text))
	var builder strings.Builder
	builder.Grow(len(text))
	for _, r := range text {
		switch {
		case r >= 'Ａ' && r <= 'Ｚ':
			r = r - 'Ａ' + 'a'
		case r >= 'ａ' && r <= 'ｚ':
			r = r - 'ａ' + 'a'
		case r >= '０' && r <= '９':
			r = r - '０' + '0'
		}
		if unicode.IsSpace(r) || unicode.IsPunct(r) || unicode.IsSymbol(r) || r == utf8.RuneError {
			continue
		}
		builder.WriteRune(r)
	}
	return builder.String()
}

func isDataImageURL(text string) bool {
	return strings.HasPrefix(strings.ToLower(strings.TrimSpace(text)), "data:image/")
}
