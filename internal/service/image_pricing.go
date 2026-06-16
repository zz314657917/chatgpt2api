package service

import (
	"math"
	"strings"

	"chatgpt2api/internal/util"
)

const (
	ImageBillingUnitCNYMilli = "cny_milli"

	imagePriceMultiplier = 1.2
	imagePriceUSDCNYRate = 7.0
)

var gptImage2BasePriceUSD = map[string]float64{
	"default": 0.006,
	"1K":      0.006,
	"2K":      0.012,
	"4K":      0.018,
}

var gptImage2OfficialBasePriceUSD = map[string]float64{
	"default":          0.16872,
	"1024x1024@auto":   0.00488,
	"1024x1024@high":   0.16872,
	"1024x1024@low":    0.00488,
	"1024x1024@medium": 0.04232,
	"1024x1280@auto":   0.00432,
	"1024x1280@high":   0.14696,
	"1024x1280@low":    0.00432,
	"1024x1280@medium": 0.0364,
	"1024x1536@auto":   0.00392,
	"1024x1536@high":   0.13184,
	"1024x1536@low":    0.00392,
	"1024x1536@medium": 0.03304,
	"1024x2048@auto":   0.00328,
	"1024x2048@high":   0.11344,
	"1024x2048@low":    0.00328,
	"1024x2048@medium": 0.02848,
	"1024x3072@auto":   0.00256,
	"1024x3072@high":   0.09496,
	"1024x3072@low":    0.00256,
	"1024x3072@medium": 0.02384,
	"1024x768@auto":    0.00336,
	"1024x768@high":    0.11568,
	"1024x768@low":     0.00336,
	"1024x768@medium":  0.02904,
	"1152x2048@auto":   0.00392,
	"1152x2048@high":   0.13576,
	"1152x2048@low":    0.00392,
	"1152x2048@medium": 0.03408,
	"1152x2688@auto":   0.0036,
	"1152x2688@high":   0.12056,
	"1152x2688@low":    0.0036,
	"1152x2688@medium": 0.03096,
	"1280x1024@auto":   0.00432,
	"1280x1024@high":   0.14696,
	"1280x1024@low":    0.00432,
	"1280x1024@medium": 0.0364,
	"1280x3840@auto":   0.00344,
	"1280x3840@high":   0.1276,
	"1280x3840@low":    0.00344,
	"1280x3840@medium": 0.032,
	"1344x2688@auto":   0.00448,
	"1344x2688@high":   0.15536,
	"1344x2688@low":    0.00448,
	"1344x2688@medium": 0.03896,
	"1360x2048@auto":   0.0052,
	"1360x2048@high":   0.17656,
	"1360x2048@low":    0.0052,
	"1360x2048@medium": 0.04424,
	"1536x1024@auto":   0.00392,
	"1536x1024@high":   0.13184,
	"1536x1024@low":    0.00392,
	"1536x1024@medium": 0.03304,
	"1536x2048@auto":   0.00608,
	"1536x2048@high":   0.21352,
	"1536x2048@low":    0.00608,
	"1536x2048@medium": 0.05352,
	"1536x512@auto":    0.01296,
	"1536x512@high":    0.05144,
	"1536x512@low":     0.00144,
	"1536x512@medium":  0.01296,
	"1536x864@auto":    0.00304,
	"1536x864@high":    0.1036,
	"1536x864@low":     0.00304,
	"1536x864@medium":  0.026,
	"1648x3840@auto":   0.00576,
	"1648x3840@high":   0.19688,
	"1648x3840@low":    0.00576,
	"1648x3840@medium": 0.05048,
	"1920x3840@auto":   0.00736,
	"1920x3840@high":   0.25928,
	"1920x3840@low":    0.00736,
	"1920x3840@medium": 0.06496,
	"2016x864@auto":    0.00264,
	"2016x864@high":    0.08848,
	"2016x864@low":     0.00264,
	"2016x864@medium":  0.0228,
	"2048x1024@auto":   0.00328,
	"2048x1024@high":   0.11344,
	"2048x1024@low":    0.00328,
	"2048x1024@medium": 0.02848,
	"2048x1152@auto":   0.00392,
	"2048x1152@high":   0.13576,
	"2048x1152@low":    0.00392,
	"2048x1152@medium": 0.03408,
	"2048x1360@auto":   0.0052,
	"2048x1360@high":   0.17656,
	"2048x1360@low":    0.0052,
	"2048x1360@medium": 0.04424,
	"2048x1536@auto":   0.00608,
	"2048x1536@high":   0.21352,
	"2048x1536@low":    0.00608,
	"2048x1536@medium": 0.05352,
	"2048x2048@auto":   0.00968,
	"2048x2048@high":   0.34264,
	"2048x2048@low":    0.00968,
	"2048x2048@medium": 0.08576,
	"2048x2560@auto":   0.0092,
	"2048x2560@high":   0.32136,
	"2048x2560@low":    0.0092,
	"2048x2560@medium": 0.07944,
	"2160x3840@auto":   0.00904,
	"2160x3840@high":   0.32032,
	"2160x3840@low":    0.00904,
	"2160x3840@medium": 0.08024,
	"2336x3520@auto":   0.01088,
	"2336x3520@high":   0.37696,
	"2336x3520@low":    0.01088,
	"2336x3520@medium": 0.09432,
	"2480x3312@auto":   0.01192,
	"2480x3312@high":   0.42368,
	"2480x3312@low":    0.01192,
	"2480x3312@medium": 0.106,
	"2560x2048@auto":   0.0092,
	"2560x2048@high":   0.32136,
	"2560x2048@low":    0.0092,
	"2560x2048@medium": 0.07944,
	"2576x3216@auto":   0.01296,
	"2576x3216@high":   0.45624,
	"2576x3216@low":    0.01296,
	"2576x3216@medium": 0.11264,
	"2688x1152@auto":   0.0036,
	"2688x1152@high":   0.12056,
	"2688x1152@low":    0.0036,
	"2688x1152@medium": 0.03096,
	"2688x1344@auto":   0.00448,
	"2688x1344@high":   0.15536,
	"2688x1344@low":    0.00448,
	"2688x1344@medium": 0.03896,
	"2880x2880@auto":   0.01592,
	"2880x2880@high":   0.56936,
	"2880x2880@low":    0.01592,
	"2880x2880@medium": 0.1424,
	"3072x1024@auto":   0.00256,
	"3072x1024@high":   0.09496,
	"3072x1024@low":    0.00256,
	"3072x1024@medium": 0.02384,
	"3216x2576@auto":   0.01296,
	"3216x2576@high":   0.45624,
	"3216x2576@low":    0.01296,
	"3216x2576@medium": 0.11264,
	"3312x2480@auto":   0.01192,
	"3312x2480@high":   0.42368,
	"3312x2480@low":    0.01192,
	"3312x2480@medium": 0.106,
	"3520x2336@auto":   0.01088,
	"3520x2336@high":   0.37696,
	"3520x2336@low":    0.01088,
	"3520x2336@medium": 0.09432,
	"3840x1280@auto":   0.00344,
	"3840x1280@high":   0.1276,
	"3840x1280@low":    0.00344,
	"3840x1280@medium": 0.032,
	"3840x1648@auto":   0.00576,
	"3840x1648@high":   0.19688,
	"3840x1648@low":    0.00576,
	"3840x1648@medium": 0.05048,
	"3840x1920@auto":   0.00736,
	"3840x1920@high":   0.25928,
	"3840x1920@low":    0.00736,
	"3840x1920@medium": 0.06496,
	"3840x2160@auto":   0.00904,
	"3840x2160@high":   0.32032,
	"3840x2160@low":    0.00904,
	"3840x2160@medium": 0.08024,
	"512x1536@auto":    0.00144,
	"512x1536@high":    0.05144,
	"512x1536@low":     0.00144,
	"512x1536@medium":  0.01296,
	"768x1024@auto":    0.00336,
	"768x1024@high":    0.11568,
	"768x1024@low":     0.00336,
	"768x1024@medium":  0.02904,
	"864x1536@auto":    0.00304,
	"864x1536@high":    0.1036,
	"864x1536@low":     0.00304,
	"864x1536@medium":  0.026,
	"864x2016@auto":    0.00264,
	"864x2016@high":    0.08848,
	"864x2016@low":     0.00264,
	"864x2016@medium":  0.0228,
}

var geminiFlashImageBasePriceUSD = map[string]float64{
	"default": 0.0375,
	"1K":      0.0375,
	"2K":      0.05,
	"4K":      0.075,
}

var geminiProImageBasePriceUSD = map[string]float64{
	"default": 0.05,
	"1K":      0.05,
	"2K":      0.05,
	"4K":      0.0625,
}

func EstimateImageBillingAmount(model string, count int, sizeOrResolution, quality string) int {
	if count < 1 {
		count = 1
	}
	return EstimateImageBillingUnitAmount(model, sizeOrResolution, quality) * count
}

func EstimateImageBillingUnitAmount(model, sizeOrResolution, quality string) int {
	priceUSD, ok := estimateImageUnitPriceUSD(model, sizeOrResolution, quality)
	if !ok {
		return 1
	}
	return int(math.Ceil(priceUSD * imagePriceMultiplier * imagePriceUSDCNYRate * 1000))
}

func EstimateImageUnitCost(model, sizeOrResolution, quality string) (float64, bool) {
	return estimateImageUnitPriceUSD(model, sizeOrResolution, quality)
}

func estimateImageUnitPriceUSD(model, sizeOrResolution, quality string) (float64, bool) {
	switch strings.TrimSpace(model) {
	case util.ImageModelAuto, util.ImageModelGPT:
		key := strings.TrimSpace(sizeOrResolution)
		if key != "1K" && key != "2K" && key != "4K" {
			key = "default"
		}
		return gptImage2BasePriceUSD[key], true
	case util.ImageModelGPTOfficial:
		size := imagePriceSizeKey(sizeOrResolution)
		q := normalizeImagePriceQuality(quality)
		if price, ok := gptImage2OfficialBasePriceUSD[size+"@"+q]; ok {
			return price, true
		}
		if price, ok := gptImage2OfficialBasePriceUSD[size+"@auto"]; ok {
			return price, true
		}
		return gptImage2OfficialBasePriceUSD["default"], true
	case util.ImageModelGeminiFlashPreview, util.ImageModelGeminiFlashPreviewOfficial:
		return imageResolutionTierPrice(geminiFlashImageBasePriceUSD, sizeOrResolution), true
	case util.ImageModelGeminiProPreview, util.ImageModelGeminiProPreviewOfficial:
		return imageResolutionTierPrice(geminiProImageBasePriceUSD, sizeOrResolution), true
	default:
		return 0, false
	}
}

func imageResolutionTierPrice(prices map[string]float64, sizeOrResolution string) float64 {
	key := strings.TrimSpace(sizeOrResolution)
	if key != "1K" && key != "2K" && key != "4K" {
		key = "default"
	}
	return prices[key]
}

func imagePriceSizeKey(size string) string {
	size = strings.TrimSpace(size)
	switch size {
	case "1:1":
		return "1024x1024"
	case "2:3":
		return "1024x1536"
	case "3:2":
		return "1536x1024"
	case "16:9":
		return "1536x864"
	case "9:16":
		return "864x1536"
	default:
		if size == "" {
			return "default"
		}
		return size
	}
}

func normalizeImagePriceQuality(quality string) string {
	switch strings.ToLower(strings.TrimSpace(quality)) {
	case "low", "medium", "high":
		return strings.ToLower(strings.TrimSpace(quality))
	default:
		return "auto"
	}
}
