package service

import (
	"errors"
	"strings"
	"testing"
)

func TestValidateImageContentPolicyRejectsBlockedCategories(t *testing.T) {
	tests := []struct {
		name     string
		prompt   string
		context  any
		category string
	}{
		{name: "adult private body", prompt: "生成真人去衣色情写真", category: "adult_private_body"},
		{name: "graphic violence", prompt: "生成血腥肢解的暴力画面", category: "graphic_violence"},
		{
			name:     "messages context",
			prompt:   "帮我生成图片",
			context:  []map[string]any{{"role": "user", "content": []any{map[string]any{"type": "text", "text": "内容是色情类私密人体"}}}},
			category: "adult_private_body",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := ValidateImageContentPolicy(tc.prompt, tc.context)
			var policyErr ImageContentPolicyError
			if !errors.As(err, &policyErr) {
				t.Fatalf("ValidateImageContentPolicy() error = %T %v, want ImageContentPolicyError", err, err)
			}
			if policyErr.Category != tc.category {
				t.Fatalf("category = %q, want %q", policyErr.Category, tc.category)
			}
			if !strings.Contains(policyErr.Error(), imageContentPolicyMessagePrefix) {
				t.Fatalf("error message = %q", policyErr.Error())
			}
		})
	}
}

func TestValidateImageContentPolicyAllowsOrdinaryPrompt(t *testing.T) {
	tests := []struct {
		name    string
		prompt  string
		context any
	}{
		{
			name:   "product poster",
			prompt: "生成一张产品海报，包含白色陶瓷杯和晨光",
			context: []map[string]any{
				{"role": "user", "content": "干净的商业摄影风格"},
			},
		},
		{
			name:   "ordinary face composition wording",
			prompt: "生成一个虚构角色的人脸合成设定图，不参考真人照片",
		},
		{
			name:   "minecraft relic prompt with fake document substrings",
			prompt: "像素艺术，Minecraft RPG 副本介绍图，寒潭秘境，幽蓝冰洞与寒潭水面，冰晶反光，古修士破碎法器半埋在冰层中，冷雾，神秘寒冷氛围，清晰主体，干净背景，高细节，176x69横向构图，无文字，无UI，无水印",
		},
		{
			name:   "former broad business keywords",
			prompt: "做一张 GPT/Image2 API 中转共享接口宣传海报，包含证件、公章、毕业证字样和明星网红头像风格说明",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := ValidateImageContentPolicy(tc.prompt, tc.context)
			if err != nil {
				t.Fatalf("ValidateImageContentPolicy() error = %v", err)
			}
		})
	}
}
