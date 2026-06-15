package service

import (
	"strings"

	"chatgpt2api/internal/util"
)

func NormalizeImageResolutionPreset(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "1k", "1080p":
		return "1080p"
	case "2k":
		return "2k"
	case "4k":
		return "4k"
	default:
		return ""
	}
}

func NormalizeImageOutputFormat(format string) string {
	switch strings.ToLower(strings.TrimSpace(format)) {
	case "", "png":
		return "png"
	case "jpg", "jpeg":
		return "jpeg"
	case "webp":
		return "webp"
	default:
		return "png"
	}
}

func SupportsImageOutputCompression(format string) bool {
	return NormalizeImageOutputFormat(format) == "jpeg"
}

func SupportsOfficialImageOutputCompression(format string) bool {
	switch NormalizeImageOutputFormat(format) {
	case "jpeg", "webp":
		return true
	default:
		return false
	}
}

func NormalizeImageOutputCompressionValue(value any) (int, bool) {
	if value == nil || strings.TrimSpace(util.Clean(value)) == "" {
		return 0, false
	}
	compression := util.ToInt(value, -1)
	if compression < 0 {
		return 0, false
	}
	if compression > 100 {
		compression = 100
	}
	return compression, true
}
