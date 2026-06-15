package service

import (
	"fmt"
	"strings"

	"chatgpt2api/internal/util"
)

const OfficialImageModel = util.ImageModelGPTOfficial

const (
	ProStudioMaxN               = 4
	ProStudioMaxReferenceImages = 16
)

var proStudioSizes = map[string]struct{}{
	"auto": {},
	"1:1":  {},
	"3:2":  {},
	"2:3":  {},
	"4:3":  {},
	"3:4":  {},
	"5:4":  {},
	"4:5":  {},
	"16:9": {},
	"9:16": {},
	"2:1":  {},
	"1:2":  {},
	"3:1":  {},
	"1:3":  {},
	"21:9": {},
	"9:21": {},
}

var proStudioQualities = map[string]struct{}{
	"auto":   {},
	"low":    {},
	"medium": {},
	"high":   {},
}

var proStudioFormats = map[string]struct{}{
	"png":  {},
	"jpeg": {},
	"webp": {},
}

func IsProStudioRequest(payload map[string]any) bool {
	if payload == nil {
		return false
	}
	if util.ToBool(payload["professional_mode"]) {
		return true
	}
	meta := util.StringMap(payload["pro_studio"])
	return util.ToBool(meta["enabled"])
}

func NormalizeProStudioRequest(payload map[string]any) {
	if payload == nil || !IsProStudioRequest(payload) {
		return
	}
	payload["professional_mode"] = true
	payload["model"] = OfficialImageModel
	normalizeProStudioMeta(payload)
	if size := strings.TrimSpace(util.Clean(payload["size"])); size == "" {
		payload["size"] = "1:1"
	}
	rawResolution := firstNonEmptyString(util.Clean(payload["resolution"]), util.Clean(payload["image_resolution"]))
	resolution := normalizeProStudioResolution(rawResolution)
	if resolution == "" && strings.TrimSpace(rawResolution) == "" {
		resolution = "1k"
	}
	if resolution != "" {
		payload["image_resolution"] = resolution
		payload["resolution"] = resolution
	}
	if quality := strings.TrimSpace(util.Clean(payload["quality"])); quality == "" {
		payload["quality"] = "auto"
	}
	if format := strings.TrimSpace(util.Clean(payload["output_format"])); format == "" {
		payload["output_format"] = "png"
	}
	if background := strings.TrimSpace(util.Clean(payload["background"])); background == "" {
		payload["background"] = "auto"
	}
	if moderation := strings.TrimSpace(util.Clean(payload["moderation"])); moderation == "" {
		payload["moderation"] = "auto"
	}
	if util.ToInt(payload["n"], 0) <= 0 {
		payload["n"] = 1
	}
	payload["official_settings"] = proStudioOfficialSettingsFromPayload(payload)
}

func ValidateProStudioRequest(payload map[string]any) error {
	if payload == nil || !IsProStudioRequest(payload) {
		return nil
	}
	if util.Clean(payload["model"]) != OfficialImageModel {
		return fmt.Errorf("professional_mode only supports %s", OfficialImageModel)
	}
	size := strings.ToLower(strings.TrimSpace(util.Clean(payload["size"])))
	if size == "" {
		size = "1:1"
	}
	if _, ok := proStudioSizes[size]; !ok {
		return fmt.Errorf("invalid pro_studio size: %s", size)
	}
	resolution := normalizeProStudioResolution(firstNonEmptyString(util.Clean(payload["resolution"]), util.Clean(payload["image_resolution"])))
	if resolution == "" {
		return fmt.Errorf("invalid pro_studio resolution")
	}
	quality := strings.ToLower(strings.TrimSpace(util.Clean(payload["quality"])))
	if quality == "" {
		quality = "auto"
	}
	if _, ok := proStudioQualities[quality]; !ok {
		return fmt.Errorf("invalid pro_studio quality: %s", quality)
	}
	format := NormalizeImageOutputFormat(util.Clean(payload["output_format"]))
	if _, ok := proStudioFormats[format]; !ok {
		return fmt.Errorf("invalid pro_studio output_format: %s", format)
	}
	if _, ok := NormalizeImageOutputCompressionValue(payload["output_compression"]); ok && !proStudioSupportsCompression(format) {
		return fmt.Errorf("output_compression is only supported for jpeg or webp")
	}
	background := strings.ToLower(strings.TrimSpace(util.Clean(payload["background"])))
	if background == "" {
		background = "auto"
	}
	if background != "auto" && background != "opaque" {
		return fmt.Errorf("invalid pro_studio background: %s", background)
	}
	moderation := strings.ToLower(strings.TrimSpace(util.Clean(payload["moderation"])))
	if moderation == "" {
		moderation = "auto"
	}
	if moderation != "auto" && moderation != "low" {
		return fmt.Errorf("invalid pro_studio moderation: %s", moderation)
	}
	n := util.ToInt(payload["n"], 1)
	if n < 1 || n > ProStudioMaxN {
		return fmt.Errorf("professional_mode n must be between 1 and %d", ProStudioMaxN)
	}
	references := ProStudioReferenceImageURLs(payload)
	if len(references) > ProStudioMaxReferenceImages {
		return fmt.Errorf("professional_mode reference images must be <= %d", ProStudioMaxReferenceImages)
	}
	if ProStudioMaskURL(payload) != "" && len(references) == 0 {
		return fmt.Errorf("professional_mode mask requires reference images")
	}
	return nil
}

func ProStudioReferenceImageURLs(payload map[string]any) []string {
	if payload == nil {
		return nil
	}
	urls := make([]string, 0, 4)
	urls = append(urls, util.AsStringSlice(payload["official_public_image_urls"])...)
	urls = append(urls, util.AsStringSlice(payload["image_urls"])...)
	if url := util.Clean(payload["image_url"]); url != "" {
		urls = append(urls, url)
	}
	urls = append(urls, util.AsStringSlice(payload["reference_image_ids"])...)
	return dedupeStrings(urls)
}

func ProStudioMaskURL(payload map[string]any) string {
	return firstNonEmptyString(util.Clean(payload["mask_url"]), util.Clean(payload["input_image_mask"]))
}

func normalizeProStudioMeta(payload map[string]any) {
	meta := util.StringMap(payload["pro_studio"])
	if len(meta) == 0 {
		meta = map[string]any{}
	}
	meta["enabled"] = true
	if util.Clean(meta["mode"]) == "" || util.Clean(meta["mode"]) == "off" {
		meta["mode"] = "preset"
	}
	if util.Clean(meta["intent"]) == "" {
		meta["intent"] = "free_canvas"
	}
	if util.Clean(meta["quality_tier"]) == "" {
		meta["quality_tier"] = "standard"
	}
	payload["pro_studio"] = meta
}

func proStudioOfficialSettingsFromPayload(payload map[string]any) map[string]any {
	format := NormalizeImageOutputFormat(util.Clean(payload["output_format"]))
	out := map[string]any{
		"model":         OfficialImageModel,
		"size":          strings.ToLower(strings.TrimSpace(util.Clean(payload["size"]))),
		"resolution":    normalizeProStudioResolution(firstNonEmptyString(util.Clean(payload["resolution"]), util.Clean(payload["image_resolution"]))),
		"quality":       strings.ToLower(strings.TrimSpace(util.Clean(payload["quality"]))),
		"output_format": format,
		"background":    strings.ToLower(strings.TrimSpace(util.Clean(payload["background"]))),
		"moderation":    strings.ToLower(strings.TrimSpace(util.Clean(payload["moderation"]))),
		"n":             util.ToInt(payload["n"], 1),
	}
	if compression, ok := NormalizeImageOutputCompressionValue(payload["output_compression"]); ok && proStudioSupportsCompression(format) {
		out["output_compression"] = compression
	}
	return out
}

func normalizeProStudioResolution(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "1k", "1080p":
		return "1k"
	case "2k", "4k":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return ""
	}
}

func proStudioSupportsCompression(format string) bool {
	return SupportsOfficialImageOutputCompression(format)
}

func dedupeStrings(values []string) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(values))
	for _, value := range values {
		cleaned := strings.TrimSpace(value)
		if cleaned == "" {
			continue
		}
		if _, ok := seen[cleaned]; ok {
			continue
		}
		seen[cleaned] = struct{}{}
		out = append(out, cleaned)
	}
	return out
}
