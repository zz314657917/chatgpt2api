package service

import "testing"

func TestImageParameterNormalization(t *testing.T) {
	for name, tc := range map[string]struct {
		value string
		want  string
	}{
		"blank":   {"", ""},
		"auto":    {"auto", ""},
		"1k":      {"1k", "1080p"},
		"1080p":   {"1080p", "1080p"},
		"2k":      {"2K", "2k"},
		"4k":      {"4k", "4k"},
		"invalid": {"8k", ""},
	} {
		t.Run("resolution "+name, func(t *testing.T) {
			if got := NormalizeImageResolutionPreset(tc.value); got != tc.want {
				t.Fatalf("NormalizeImageResolutionPreset(%q) = %q, want %q", tc.value, got, tc.want)
			}
		})
	}

	for name, tc := range map[string]struct {
		value string
		want  string
	}{
		"blank":   {"", "png"},
		"png":     {"png", "png"},
		"jpg":     {"jpg", "jpeg"},
		"jpeg":    {"jpeg", "jpeg"},
		"webp":    {"webp", "webp"},
		"invalid": {"gif", "png"},
	} {
		t.Run("format "+name, func(t *testing.T) {
			if got := NormalizeImageOutputFormat(tc.value); got != tc.want {
				t.Fatalf("NormalizeImageOutputFormat(%q) = %q, want %q", tc.value, got, tc.want)
			}
		})
	}

	if !SupportsImageOutputCompression("jpeg") {
		t.Fatal("jpeg should support output compression")
	}
	if SupportsImageOutputCompression("png") || SupportsImageOutputCompression("webp") {
		t.Fatal("png/webp should not support output compression")
	}
	if !SupportsOfficialImageOutputCompression("webp") {
		t.Fatal("official webp should support output compression")
	}
	if got, ok := NormalizeImageOutputCompressionValue("120"); !ok || got != 100 {
		t.Fatalf("NormalizeImageOutputCompressionValue(120) = %d, %v; want 100, true", got, ok)
	}
	if got, ok := NormalizeImageOutputCompressionValue(42); !ok || got != 42 {
		t.Fatalf("NormalizeImageOutputCompressionValue(42) = %d, %v; want 42, true", got, ok)
	}
	if _, ok := NormalizeImageOutputCompressionValue("-1"); ok {
		t.Fatal("negative output compression should be ignored")
	}
	if _, ok := NormalizeImageOutputCompressionValue(""); ok {
		t.Fatal("blank output compression should be ignored")
	}
}
