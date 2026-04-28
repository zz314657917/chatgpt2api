package service

import (
	"encoding/json"
	"image"
	"image/color"
	"image/draw"
	_ "image/gif"
	_ "image/png"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/HugoSmits86/nativewebp"
)

const ThumbnailSize = 360

type ImageConfig interface {
	ImagesDir() string
	ImageThumbnailsDir() string
	CleanupOldImages() int
}

type ImageService struct {
	config ImageConfig
}

func NewImageService(config ImageConfig) *ImageService {
	return &ImageService{config: config}
}

func (s *ImageService) ListImages(baseURL, startDate, endDate string) map[string]any {
	s.config.CleanupOldImages()
	root := s.config.ImagesDir()
	items := make([]map[string]any, 0)
	_ = filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		rel, err := filepath.Rel(root, path)
		if err != nil {
			return nil
		}
		rel = filepath.ToSlash(rel)
		info, err := d.Info()
		if err != nil {
			return nil
		}
		parts := strings.Split(rel, "/")
		day := info.ModTime().Format("2006-01-02")
		if len(parts) >= 4 {
			day = strings.Join(parts[:3], "-")
		}
		if startDate != "" && day < startDate {
			return nil
		}
		if endDate != "" && day > endDate {
			return nil
		}
		thumb := s.ensureThumbnail(path, rel)
		item := map[string]any{
			"name":       filepath.Base(path),
			"date":       day,
			"size":       info.Size(),
			"url":        publicAssetURL(baseURL, "images", rel),
			"created_at": info.ModTime().Format("2006-01-02 15:04:05"),
		}
		if thumbRel, ok := thumb["thumbnail_rel"].(string); ok && thumbRel != "" {
			item["thumbnail_url"] = publicAssetURL(baseURL, "image-thumbnails", thumbRel)
		} else {
			item["thumbnail_url"] = ""
		}
		item["width"] = thumb["width"]
		item["height"] = thumb["height"]
		items = append(items, item)
		return nil
	})
	sort.Slice(items, func(i, j int) bool {
		return strings.Compare(toString(items[i]["created_at"]), toString(items[j]["created_at"])) > 0
	})
	groupMap := map[string][]map[string]any{}
	var order []string
	for _, item := range items {
		day := toString(item["date"])
		if _, ok := groupMap[day]; !ok {
			order = append(order, day)
		}
		groupMap[day] = append(groupMap[day], item)
	}
	groups := make([]map[string]any, 0, len(order))
	for _, day := range order {
		groups = append(groups, map[string]any{"date": day, "items": groupMap[day]})
	}
	return map[string]any{"items": items, "groups": groups}
}

func (s *ImageService) ensureThumbnail(sourcePath, rel string) map[string]any {
	thumbPath := filepath.Join(s.config.ImageThumbnailsDir(), filepath.FromSlash(rel)+".webp")
	metaPath := thumbPath + ".json"
	sourceInfo, err := os.Stat(sourcePath)
	if err != nil {
		return map[string]any{}
	}
	if thumbInfo, err := os.Stat(thumbPath); err == nil && !thumbInfo.ModTime().Before(sourceInfo.ModTime()) {
		meta := readImageMetadata(metaPath, sourceInfo.ModTime())
		result := map[string]any{"thumbnail_rel": filepath.ToSlash(strings.TrimPrefix(strings.TrimPrefix(thumbPath, s.config.ImageThumbnailsDir()), string(filepath.Separator)))}
		for key, value := range meta {
			result[key] = value
		}
		return result
	}
	file, err := os.Open(sourcePath)
	if err != nil {
		return map[string]any{}
	}
	defer file.Close()
	img, _, err := image.Decode(file)
	if err != nil {
		return map[string]any{}
	}
	bounds := img.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	thumb := resizeToFit(flattenImage(img), ThumbnailSize, ThumbnailSize)
	if err := os.MkdirAll(filepath.Dir(thumbPath), 0o755); err != nil {
		return map[string]any{}
	}
	out, err := os.Create(thumbPath)
	if err != nil {
		return map[string]any{}
	}
	encodeErr := nativewebp.Encode(out, thumb, nil)
	closeErr := out.Close()
	if encodeErr != nil || closeErr != nil {
		_ = os.Remove(thumbPath)
		return map[string]any{}
	}
	_ = writeJSONFile(metaPath, map[string]any{"width": width, "height": height})
	return map[string]any{"thumbnail_rel": filepath.ToSlash(strings.TrimPrefix(strings.TrimPrefix(thumbPath, s.config.ImageThumbnailsDir()), string(filepath.Separator))), "width": width, "height": height}
}

func publicAssetURL(baseURL, prefix, rel string) string {
	parts := strings.Split(filepath.ToSlash(rel), "/")
	for i, part := range parts {
		parts[i] = url.PathEscape(part)
	}
	return strings.TrimRight(baseURL, "/") + "/" + strings.Trim(prefix, "/") + "/" + strings.Join(parts, "/")
}

func readImageMetadata(path string, sourceMtime time.Time) map[string]any {
	info, err := os.Stat(path)
	if err != nil || info.ModTime().Before(sourceMtime) {
		return nil
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	var meta map[string]any
	if json.Unmarshal(data, &meta) != nil {
		return nil
	}
	if meta["width"] == nil || meta["height"] == nil {
		return nil
	}
	return meta
}

func flattenImage(src image.Image) image.Image {
	b := src.Bounds()
	dst := image.NewRGBA(b)
	draw.Draw(dst, b, &image.Uniform{C: color.White}, image.Point{}, draw.Src)
	draw.Draw(dst, b, src, b.Min, draw.Over)
	return dst
}

func resizeToFit(src image.Image, maxW, maxH int) image.Image {
	b := src.Bounds()
	w, h := b.Dx(), b.Dy()
	if w <= 0 || h <= 0 {
		return src
	}
	scale := float64(maxW) / float64(w)
	if sh := float64(maxH) / float64(h); sh < scale {
		scale = sh
	}
	if scale > 1 {
		scale = 1
	}
	nw, nh := int(float64(w)*scale), int(float64(h)*scale)
	if nw < 1 {
		nw = 1
	}
	if nh < 1 {
		nh = 1
	}
	dst := image.NewRGBA(image.Rect(0, 0, nw, nh))
	for y := 0; y < nh; y++ {
		for x := 0; x < nw; x++ {
			sx := b.Min.X + int(float64(x)*float64(w)/float64(nw))
			sy := b.Min.Y + int(float64(y)*float64(h)/float64(nh))
			dst.Set(x, y, src.At(sx, sy))
		}
	}
	return dst
}

func writeJSONFile(path string, value any) error {
	data, err := json.Marshal(value)
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}

func toString(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}
