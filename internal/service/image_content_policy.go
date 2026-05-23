package service

import (
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
}

func (e ImageContentPolicyError) Error() string {
	if e.Reason == "" {
		return imageContentPolicyMessagePrefix
	}
	return fmt.Sprintf("%s: %s", imageContentPolicyMessagePrefix, e.Reason)
}

func (e ImageContentPolicyError) OpenAIError() map[string]any {
	return map[string]any{"error": map[string]any{
		"message": e.Error(),
		"type":    "invalid_request_error",
		"param":   "prompt",
		"code":    "content_policy_violation",
	}}
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
		Reason:   "真人去衣、擦边性感、私密人体或情趣类内容不允许生成",
		Any: []string{
			"真人去衣", "去衣", "脱衣", "脱光", "脱掉衣服", "裸照", "裸体", "裸露", "全裸", "半裸", "露点",
			"走光", "漏点", "裙底", "偷拍", "擦边", "性感", "sexy", "色情", "情色", "成人内容", "成人图",
			"情趣", "情趣内衣", "丁字裤", "挑逗", "诱惑", "私密人体", "私密部位", "隐私部位", "私处", "下体",
			"生殖器", "阴部", "阴茎", "阴道", "乳头", "乳房", "裸胸", "床照", "私房照", "私密照",
		},
	},
	{
		Category: "face_abuse",
		Reason:   "人脸换脸、Deepfake 或恶搞真人肖像不允许生成",
		Any: []string{
			"人脸换脸", "ai换脸", "换脸", "脸部替换", "替换脸", "把脸换成", "脸换到",
			"deepfake", "deep fake", "恶搞真人", "恶搞肖像",
			"恶搞照片", "丑化真人", "侮辱肖像", "真人肖像恶搞",
		},
	},
	{
		Category: "fake_documents",
		Reason:   "证件、公章、票据、毕业证或假证类内容不允许生成",
		Any: []string{
			"证件", "证件照", "身份证", "护照", "驾驶证", "驾照", "行驶证", "营业执照", "许可证",
			"公章", "印章", "合同章", "发票章", "票据", "发票", "收据", "银行流水", "转账凭证",
			"毕业证", "学位证", "学历证", "学生证", "工作证", "假证", "假发票", "伪造证件",
			"伪造公章", "伪造票据", "仿制证书", "假合同",
		},
	},
	{
		Category: "api_relay",
		Reason:   "GPT/Image2 API 中转、代调用或共享接口引流不允许生成",
		Any: []string{
			"api中转", "接口中转", "中转api", "gpt中转", "openai中转", "image2api", "image2接口",
			"gptimage2api", "gptimage2接口", "gpt-image-2 api", "gpt-image-2接口", "代调用",
			"代调接口", "共享接口", "共享api", "接口共享", "api共享", "接口转发", "中转站",
			"逆向接口", "搭建中转", "api售卖", "接口售卖",
		},
	},
	{
		Category: "proxy_or_foreign_account",
		Reason:   "引流翻墙、售卖境外账号或搭建代理通道不允许生成",
		Any: []string{
			"翻墙", "科学上网", "梯子", "机场", "vpn", "代理通道", "代理节点", "节点订阅",
			"clash", "v2ray", "shadowsocks", "trojan节点", "境外账号", "海外账号", "售卖账号",
			"账号批发", "卖账号", "引流代理", "引流翻墙",
		},
	},
	{
		Category: "political_extremist_or_vulgar",
		Reason:   "反动、涉政、邪教、恐怖或低俗语录配图不允许生成",
		Any: []string{
			"反动", "涉政", "政治宣传", "政治口号", "政治海报", "政治讽刺", "领导人恶搞",
			"邪教", "法轮功", "恐怖主义", "暴恐", "圣战", "isis", "纳粹", "恐怖组织",
			"恐怖语录", "低俗语录", "低俗配图", "粗口配图", "脏话配图", "黄段子", "辱骂配图",
		},
	},
	{
		Category: "celebrity_or_ip_infringement",
		Reason:   "批量生成明星网红或动漫正版 IP 商用侵权图不允许生成",
		Any: []string{
			"批量明星", "批量网红", "明星写真", "明星头像", "明星海报", "网红写真", "网红头像",
			"名人肖像", "真人明星", "真人网红", "celebrity", "influencer", "正版ip", "动漫ip商用",
			"ip商用", "商用侵权", "商业侵权", "二创商用", "同人商用", "迪士尼商用", "漫威商用",
			"宝可梦商用", "皮卡丘商用", "哆啦a梦商用", "海贼王商用", "火影忍者商用", "hello kitty商用",
			"米老鼠商用",
		},
	},
	{
		Category: "private_photo_edit",
		Reason:   "上传私密照片后随意篡改、恶搞或扩散不允许处理",
		Any: []string{
			"私密照片篡改", "私密照篡改", "隐私照片篡改", "篡改私密照片", "修改私密照片",
			"恶搞私密照片", "恶搞私照", "私照改图", "私房照改图", "裸照改图", "床照改图",
			"把私密照片", "上传私密照片", "上传裸照", "泄露私密照", "扩散私密照",
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
		if rule.Category == "private_photo_edit" && imageContentPolicyRuleMatches(rule, normalized) {
			return ImageContentPolicyError{Category: rule.Category, Reason: rule.Reason}
		}
	}
	for _, rule := range imageContentPolicyRules {
		if rule.Category == "private_photo_edit" {
			continue
		}
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
