package service

import (
	"testing"

	"chatgpt2api/internal/util"
)

func TestEstimateImageBillingAmount(t *testing.T) {
	tests := []struct {
		name    string
		model   string
		count   int
		size    string
		quality string
		want    int
	}{
		{
			name:    "regular gpt image single output",
			model:   util.ImageModelGPT,
			count:   1,
			size:    "1K",
			quality: "auto",
			want:    51,
		},
		{
			name:    "official common low tier",
			model:   util.ImageModelGPTOfficial,
			count:   1,
			size:    "1024x1024",
			quality: "low",
			want:    41,
		},
		{
			name:    "official default fallback",
			model:   util.ImageModelGPTOfficial,
			count:   1,
			size:    "",
			quality: "auto",
			want:    1418,
		},
		{
			name:    "official lowest tier multiple outputs",
			model:   util.ImageModelGPTOfficial,
			count:   2,
			size:    "512x1536",
			quality: "low",
			want:    26,
		},
		{
			name:    "auto image model uses regular image price",
			model:   "auto",
			count:   3,
			size:    "",
			quality: "",
			want:    153,
		},
		{
			name:    "unknown image model keeps legacy per-image unit",
			model:   "custom-image-model",
			count:   3,
			size:    "",
			quality: "",
			want:    3,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := EstimateImageBillingAmount(tc.model, tc.count, tc.size, tc.quality); got != tc.want {
				t.Fatalf("EstimateImageBillingAmount() = %d, want %d", got, tc.want)
			}
		})
	}
}

func TestEstimateImageBillingAmountResolutionTierOverridesRatio(t *testing.T) {
	got := EstimateImageBillingAmount(util.ImageModelGPT, 1, "4K", "high")
	if got != 152 {
		t.Fatalf("EstimateImageBillingAmount(4K) = %d, want 152", got)
	}
}
