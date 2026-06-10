package service

import (
	"bytes"
	"encoding/json"
	"errors"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"chatgpt2api/internal/imagestore"
)

type testImageConfig struct {
	root string
}

func (c testImageConfig) ImagesDir() string {
	path := filepath.Join(c.root, "images")
	_ = os.MkdirAll(path, 0o755)
	return path
}

func (c testImageConfig) ImageThumbnailsDir() string {
	path := filepath.Join(c.root, "image_thumbnails")
	_ = os.MkdirAll(path, 0o755)
	return path
}

func (c testImageConfig) ImagePreviewsDir() string {
	path := filepath.Join(c.root, "image_previews")
	_ = os.MkdirAll(path, 0o755)
	return path
}

func (c testImageConfig) ImageMetadataDir() string {
	path := filepath.Join(c.root, "image_metadata")
	_ = os.MkdirAll(path, 0o755)
	return path
}

func (c testImageConfig) ImageRetentionDays() int { return 30 }

func (c testImageConfig) ImageStorageLimitBytes() int64 { return 0 }

func (c testImageConfig) ImageMaxSavedPerUser() int { return 50 }

var allImages = ImageAccessScope{All: true}

func TestImageServiceListImagesReturnsEmptyArrays(t *testing.T) {
	service := NewImageService(testImageConfig{root: t.TempDir()})
	result := service.ListImages("http://127.0.0.1:8000", "", "", allImages)

	data, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}
	if string(data) != `{"groups":[],"has_more":false,"items":[],"next_cursor":"","page_size":50}` {
		t.Fatalf("ListImages() JSON = %s", data)
	}
}

func TestImageServiceListImagesReturnsDimensionsWithoutGeneratingThumbnails(t *testing.T) {
	root := t.TempDir()
	config := testImageConfig{root: root}
	imagePath := filepath.Join(config.ImagesDir(), "2026", "04", "29", "sample.png")
	if err := os.MkdirAll(filepath.Dir(imagePath), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := writeTestPNG(imagePath); err != nil {
		t.Fatalf("writeTestPNG() error = %v", err)
	}

	service := NewImageService(config)
	result := service.ListImages("http://127.0.0.1:8000", "", "", allImages)
	items := result["items"].([]map[string]any)
	if len(items) != 1 {
		t.Fatalf("items = %#v", items)
	}
	if got := toString(items[0]["path"]); got != "2026/04/29/sample.png" {
		t.Fatalf("path = %q, want relative image path", got)
	}
	thumbnailURL := toString(items[0]["thumbnail_url"])
	thumbnailPath := requireThumbnailURLPath(t, thumbnailURL)
	if !strings.HasSuffix(thumbnailPath, thumbnailExtension) {
		t.Fatalf("thumbnail_url path = %q, want %s suffix", thumbnailPath, thumbnailExtension)
	}
	if numericMetaValue(items[0]["width"]) != 32 || numericMetaValue(items[0]["height"]) != 24 {
		t.Fatalf("ListImages() dimensions = %#v, want 32x24", items[0])
	}
	if toString(items[0]["resolution"]) != "32x24" {
		t.Fatalf("ListImages() resolution = %#v, want 32x24", items[0]["resolution"])
	}
	if toString(items[0]["aspect_ratio"]) != "4:3" {
		t.Fatalf("ListImages() aspect_ratio = %#v, want 4:3", items[0]["aspect_ratio"])
	}
	if toString(items[0]["orientation"]) != "landscape" {
		t.Fatalf("ListImages() orientation = %#v, want landscape", items[0]["orientation"])
	}
	thumbPath := filepath.Join(config.ImageThumbnailsDir(), "2026", "04", "29", "sample.png"+thumbnailExtension)
	if _, err := os.Stat(thumbPath); !os.IsNotExist(err) {
		t.Fatalf("ListImages() should not create thumbnail synchronously, stat error = %v", err)
	}
	previewPath := filepath.Join(config.ImagePreviewsDir(), "2026", "04", "29", "sample.png"+thumbnailExtension)
	if _, err := os.Stat(previewPath); !os.IsNotExist(err) {
		t.Fatalf("ListImages() should not create preview synchronously, stat error = %v", err)
	}
}

func TestImageServiceStoreUploadedImageUsesObjectStorageAsPrimary(t *testing.T) {
	root := t.TempDir()
	config := testImageConfig{root: root}
	var uploadedPath string
	var uploadedBytes []byte
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPut:
			uploadedPath = r.URL.Path
			uploadedBytes, _ = io.ReadAll(r.Body)
			w.WriteHeader(http.StatusOK)
		case http.MethodGet:
			if r.URL.Path != uploadedPath {
				t.Errorf("GET path = %q, want %q", r.URL.Path, uploadedPath)
			}
			w.Header().Set("Content-Type", "image/png")
			_, _ = w.Write(uploadedBytes)
		default:
			t.Errorf("method = %s", r.Method)
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	}))
	defer server.Close()
	t.Setenv(imagestore.EnvImageStorageBackend, "cos")
	t.Setenv(imagestore.EnvImageObjectStorageEndpoint, server.URL)
	t.Setenv(imagestore.EnvImageObjectStorageRegion, "ap-guangzhou")
	t.Setenv(imagestore.EnvImageObjectStorageBucket, "bucket")
	t.Setenv(imagestore.EnvImageObjectStorageAccessKeyID, "ak")
	t.Setenv(imagestore.EnvImageObjectStorageSecretKey, "sk")
	t.Setenv(imagestore.EnvImageObjectStorageForcePath, "true")
	t.Setenv(imagestore.EnvImageObjectStoragePublicBase, "https://cdn.example.com/images")

	var imageBuffer bytes.Buffer
	img := image.NewRGBA(image.Rect(0, 0, 16, 12))
	for y := 0; y < 12; y++ {
		for x := 0; x < 16; x++ {
			img.Set(x, y, color.RGBA{R: 80, G: uint8(x * 10), B: uint8(y * 12), A: 255})
		}
	}
	if err := png.Encode(&imageBuffer, img); err != nil {
		t.Fatalf("png.Encode() error = %v", err)
	}

	service := NewImageService(config)
	item, err := service.StoreUploadedImage("http://127.0.0.1:8000", UploadedManagedImage{
		Filename:    "sample.png",
		ContentType: "image/png",
		Data:        imageBuffer.Bytes(),
	}, "linuxdo:123", "alice", ImageVisibilityPrivate)
	if err != nil {
		t.Fatalf("StoreUploadedImage() error = %v", err)
	}
	rel := toString(item["path"])
	if rel == "" {
		t.Fatalf("item path is empty: %#v", item)
	}
	if _, err := os.Stat(filepath.Join(config.ImagesDir(), filepath.FromSlash(rel))); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("local original stat error = %v, want os.ErrNotExist", err)
	}
	data, mimeType, err := service.ImageBytes(rel, ImageAccessScope{OwnerID: "linuxdo:123"})
	if err != nil {
		t.Fatalf("ImageBytes() error = %v", err)
	}
	if mimeType != "image/png" || len(data) != len(imageBuffer.Bytes()) {
		t.Fatalf("ImageBytes() mime=%q len=%d, want image/png len=%d", mimeType, len(data), len(imageBuffer.Bytes()))
	}
	detail, err := service.ImageDetail("http://127.0.0.1:8000", rel, ImageAccessScope{OwnerID: "linuxdo:123"})
	if err != nil {
		t.Fatalf("ImageDetail() error = %v", err)
	}
	if detail["url"] != "http://127.0.0.1:8000/images/"+rel {
		t.Fatalf("detail url = %#v", detail)
	}
	if detail["object_key"] != nil || detail["object_url"] != nil || detail["storage_backend"] != nil {
		t.Fatalf("detail exposed object metadata: %#v", detail)
	}
}

func TestImageServiceEnsureThumbnailCreatesJPEGThumbnails(t *testing.T) {
	root := t.TempDir()
	config := testImageConfig{root: root}
	imagePath := filepath.Join(config.ImagesDir(), "2026", "04", "29", "sample.png")
	if err := os.MkdirAll(filepath.Dir(imagePath), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := writeTestPNG(imagePath); err != nil {
		t.Fatalf("writeTestPNG() error = %v", err)
	}

	service := NewImageService(config)
	service.EnsureThumbnails([]string{"2026/04/29/sample.png"})
	thumbnailRel := "2026/04/29/sample.png" + thumbnailExtension
	if !strings.HasSuffix(thumbnailRel, thumbnailExtension) {
		t.Fatalf("thumbnail_rel = %q, want %s suffix", thumbnailRel, thumbnailExtension)
	}

	thumbPath := filepath.Join(config.ImageThumbnailsDir(), filepath.FromSlash(thumbnailRel))
	file, err := os.Open(thumbPath)
	if err != nil {
		t.Fatalf("open thumbnail: %v", err)
	}
	defer file.Close()
	decoded, err := jpeg.Decode(file)
	if err != nil {
		t.Fatalf("decode jpeg thumbnail: %v", err)
	}
	if decoded.Bounds().Dx() <= 0 || decoded.Bounds().Dy() <= 0 {
		t.Fatalf("decoded thumbnail has invalid bounds: %v", decoded.Bounds())
	}
	if decoded.Bounds().Dx() > ThumbnailSize || decoded.Bounds().Dy() > ThumbnailSize {
		t.Fatalf("decoded thumbnail bounds = %v, want max side <= %d", decoded.Bounds(), ThumbnailSize)
	}
	meta, err := os.ReadFile(thumbPath + ".json")
	if err != nil {
		t.Fatalf("read thumbnail metadata: %v", err)
	}
	var metadata map[string]any
	if err := json.Unmarshal(meta, &metadata); err != nil {
		t.Fatalf("unmarshal thumbnail metadata: %v", err)
	}
	if numericMetaValue(metadata["thumbnail_size"]) != ThumbnailSize {
		t.Fatalf("thumbnail_size metadata = %v, want %d", metadata["thumbnail_size"], ThumbnailSize)
	}
	if numericMetaValue(metadata["thumbnail_quality"]) != thumbnailQuality {
		t.Fatalf("thumbnail_quality metadata = %v, want %d", metadata["thumbnail_quality"], thumbnailQuality)
	}
}

func TestImageServiceEnsureThumbnailsKeepsLargeImageThumbnailSmall(t *testing.T) {
	root := t.TempDir()
	config := testImageConfig{root: root}
	imagePath := filepath.Join(config.ImagesDir(), "2026", "04", "29", "large.png")
	if err := os.MkdirAll(filepath.Dir(imagePath), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := writeLargeTestPNG(imagePath); err != nil {
		t.Fatalf("writeLargeTestPNG() error = %v", err)
	}

	service := NewImageService(config)
	service.EnsureThumbnails([]string{"2026/04/29/large.png"})

	thumbPath := filepath.Join(config.ImageThumbnailsDir(), "2026", "04", "29", "large.png"+thumbnailExtension)
	info, err := os.Stat(thumbPath)
	if err != nil {
		t.Fatalf("stat thumbnail: %v", err)
	}
	if info.Size() > 120*1024 {
		t.Fatalf("thumbnail size = %d bytes, want <= 120KiB", info.Size())
	}

	file, err := os.Open(thumbPath)
	if err != nil {
		t.Fatalf("open thumbnail: %v", err)
	}
	defer file.Close()
	decoded, err := jpeg.Decode(file)
	if err != nil {
		t.Fatalf("decode jpeg thumbnail: %v", err)
	}
	if decoded.Bounds().Dx() > ThumbnailSize || decoded.Bounds().Dy() > ThumbnailSize {
		t.Fatalf("decoded thumbnail bounds = %v, want max side <= %d", decoded.Bounds(), ThumbnailSize)
	}
}

func TestImageServiceEnsureThumbnailsCreatesCachedThumbnailFromImageURL(t *testing.T) {
	root := t.TempDir()
	config := testImageConfig{root: root}
	imagePath := filepath.Join(config.ImagesDir(), "2026", "04", "29", "sample.png")
	if err := os.MkdirAll(filepath.Dir(imagePath), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := writeTestPNG(imagePath); err != nil {
		t.Fatalf("writeTestPNG() error = %v", err)
	}

	service := NewImageService(config)
	service.EnsureThumbnails([]string{"http://127.0.0.1:8000/images/2026/04/29/sample.png"})

	thumbPath := filepath.Join(config.ImageThumbnailsDir(), "2026", "04", "29", "sample.png"+thumbnailExtension)
	if _, err := os.Stat(thumbPath); err != nil {
		t.Fatalf("thumbnail was not created: %v", err)
	}
	if _, err := os.Stat(thumbPath + ".json"); err != nil {
		t.Fatalf("thumbnail metadata was not created: %v", err)
	}

	result := service.ListImages("http://127.0.0.1:8000", "", "", allImages)
	items := result["items"].([]map[string]any)
	if len(items) != 1 {
		t.Fatalf("items = %#v", items)
	}
	if items[0]["width"] == nil || items[0]["height"] == nil {
		t.Fatalf("ListImages() did not read warmed thumbnail metadata: %#v", items[0])
	}
}

func TestImageServiceEnsureThumbnailsReusesFreshThumbnail(t *testing.T) {
	root := t.TempDir()
	config := testImageConfig{root: root}
	imagePath := filepath.Join(config.ImagesDir(), "2026", "04", "29", "sample.png")
	if err := os.MkdirAll(filepath.Dir(imagePath), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := writeTestPNG(imagePath); err != nil {
		t.Fatalf("writeTestPNG() error = %v", err)
	}

	service := NewImageService(config)
	service.EnsureThumbnails([]string{"2026/04/29/sample.png"})
	thumbPath := filepath.Join(config.ImageThumbnailsDir(), "2026", "04", "29", "sample.png"+thumbnailExtension)
	firstInfo, err := os.Stat(thumbPath)
	if err != nil {
		t.Fatalf("stat thumbnail: %v", err)
	}

	service.EnsureThumbnails([]string{"2026/04/29/sample.png"})
	secondInfo, err := os.Stat(thumbPath)
	if err != nil {
		t.Fatalf("stat thumbnail after reuse: %v", err)
	}
	if !secondInfo.ModTime().Equal(firstInfo.ModTime()) {
		t.Fatalf("fresh thumbnail was regenerated: first=%s second=%s", firstInfo.ModTime(), secondInfo.ModTime())
	}
}

func TestImageServiceEnsureThumbnailsRegeneratesStaleThumbnail(t *testing.T) {
	root := t.TempDir()
	config := testImageConfig{root: root}
	imagePath := filepath.Join(config.ImagesDir(), "2026", "04", "29", "sample.png")
	if err := os.MkdirAll(filepath.Dir(imagePath), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := writeTestPNG(imagePath); err != nil {
		t.Fatalf("writeTestPNG() error = %v", err)
	}

	service := NewImageService(config)
	service.EnsureThumbnails([]string{"2026/04/29/sample.png"})
	thumbPath := filepath.Join(config.ImageThumbnailsDir(), "2026", "04", "29", "sample.png"+thumbnailExtension)
	staleTime := time.Now().Add(-time.Hour).Truncate(time.Second)
	if err := os.Chtimes(thumbPath, staleTime, staleTime); err != nil {
		t.Fatalf("Chtimes() error = %v", err)
	}

	service.EnsureThumbnails([]string{"2026/04/29/sample.png"})
	info, err := os.Stat(thumbPath)
	if err != nil {
		t.Fatalf("stat regenerated thumbnail: %v", err)
	}
	if !info.ModTime().After(staleTime) {
		t.Fatalf("stale thumbnail was not regenerated: got %s, stale %s", info.ModTime(), staleTime)
	}
}

func TestImageServiceEnsureThumbnailsRefreshesInvalidMetadata(t *testing.T) {
	root := t.TempDir()
	config := testImageConfig{root: root}
	imagePath := filepath.Join(config.ImagesDir(), "2026", "04", "29", "sample.png")
	if err := os.MkdirAll(filepath.Dir(imagePath), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := writeTestPNG(imagePath); err != nil {
		t.Fatalf("writeTestPNG() error = %v", err)
	}

	service := NewImageService(config)
	service.EnsureThumbnails([]string{"2026/04/29/sample.png"})
	thumbPath := filepath.Join(config.ImageThumbnailsDir(), "2026", "04", "29", "sample.png"+thumbnailExtension)
	if err := os.WriteFile(thumbPath+".json", []byte(`{"width":1,"height":1,"thumbnail_size":1,"thumbnail_version":0}`), 0o644); err != nil {
		t.Fatalf("write stale metadata: %v", err)
	}

	service.EnsureThumbnails([]string{"2026/04/29/sample.png"})
	meta, err := os.ReadFile(thumbPath + ".json")
	if err != nil {
		t.Fatalf("read thumbnail metadata: %v", err)
	}
	var metadata map[string]any
	if err := json.Unmarshal(meta, &metadata); err != nil {
		t.Fatalf("unmarshal metadata: %v", err)
	}
	if numericMetaValue(metadata["thumbnail_size"]) != ThumbnailSize || numericMetaValue(metadata["thumbnail_version"]) != thumbnailCacheVersion || numericMetaValue(metadata["thumbnail_quality"]) != thumbnailQuality {
		t.Fatalf("metadata was not refreshed: %#v", metadata)
	}
}

func TestImageServiceEnsureThumbnailsHandlesConcurrentSameImage(t *testing.T) {
	root := t.TempDir()
	config := testImageConfig{root: root}
	imagePath := filepath.Join(config.ImagesDir(), "2026", "04", "29", "sample.png")
	if err := os.MkdirAll(filepath.Dir(imagePath), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := writeTestPNG(imagePath); err != nil {
		t.Fatalf("writeTestPNG() error = %v", err)
	}

	service := NewImageService(config)
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			service.EnsureThumbnails([]string{"2026/04/29/sample.png"})
		}()
	}
	wg.Wait()

	thumbPath := filepath.Join(config.ImageThumbnailsDir(), "2026", "04", "29", "sample.png"+thumbnailExtension)
	file, err := os.Open(thumbPath)
	if err != nil {
		t.Fatalf("open thumbnail: %v", err)
	}
	defer file.Close()
	if _, err := jpeg.Decode(file); err != nil {
		t.Fatalf("decode concurrent thumbnail: %v", err)
	}
}

func TestImageServiceEnsurePreviewCreatesJPEGPreviews(t *testing.T) {
	root := t.TempDir()
	config := testImageConfig{root: root}
	imagePath := filepath.Join(config.ImagesDir(), "2026", "04", "29", "large.png")
	if err := os.MkdirAll(filepath.Dir(imagePath), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := writeLargeTestPNG(imagePath); err != nil {
		t.Fatalf("writeLargeTestPNG() error = %v", err)
	}

	service := NewImageService(config)
	previewRel := "2026/04/29/large.png" + thumbnailExtension
	if err := service.EnsurePreview(previewRel); err != nil {
		t.Fatalf("EnsurePreview() error = %v", err)
	}

	previewPath := filepath.Join(config.ImagePreviewsDir(), filepath.FromSlash(previewRel))
	file, err := os.Open(previewPath)
	if err != nil {
		t.Fatalf("open preview: %v", err)
	}
	defer file.Close()
	decoded, err := jpeg.Decode(file)
	if err != nil {
		t.Fatalf("decode jpeg preview: %v", err)
	}
	if decoded.Bounds().Dx() > ImagePreviewSize || decoded.Bounds().Dy() > ImagePreviewSize {
		t.Fatalf("decoded preview bounds = %v, want max side <= %d", decoded.Bounds(), ImagePreviewSize)
	}
	meta, err := os.ReadFile(previewPath + ".json")
	if err != nil {
		t.Fatalf("read preview metadata: %v", err)
	}
	var metadata map[string]any
	if err := json.Unmarshal(meta, &metadata); err != nil {
		t.Fatalf("unmarshal preview metadata: %v", err)
	}
	if numericMetaValue(metadata["preview_size"]) != ImagePreviewSize {
		t.Fatalf("preview_size metadata = %v, want %d", metadata["preview_size"], ImagePreviewSize)
	}
	if numericMetaValue(metadata["preview_quality"]) != imagePreviewQuality {
		t.Fatalf("preview_quality metadata = %v, want %d", metadata["preview_quality"], imagePreviewQuality)
	}
}

func TestImageServiceDeleteImagesRemovesOriginalThumbnailAndPreview(t *testing.T) {
	root := t.TempDir()
	config := testImageConfig{root: root}
	imagePath := filepath.Join(config.ImagesDir(), "2026", "04", "29", "sample.png")
	if err := os.MkdirAll(filepath.Dir(imagePath), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := writeTestPNG(imagePath); err != nil {
		t.Fatalf("writeTestPNG() error = %v", err)
	}

	service := NewImageService(config)
	service.EnsureThumbnails([]string{"2026/04/29/sample.png"})
	if err := service.EnsurePreview("2026/04/29/sample.png" + thumbnailExtension); err != nil {
		t.Fatalf("EnsurePreview() error = %v", err)
	}
	thumbPath := filepath.Join(config.ImageThumbnailsDir(), "2026", "04", "29", "sample.png"+thumbnailExtension)
	if _, err := os.Stat(thumbPath); err != nil {
		t.Fatalf("thumbnail was not created: %v", err)
	}
	previewPath := filepath.Join(config.ImagePreviewsDir(), "2026", "04", "29", "sample.png"+thumbnailExtension)
	if _, err := os.Stat(previewPath); err != nil {
		t.Fatalf("preview was not created: %v", err)
	}

	result, err := service.DeleteImages([]string{"2026/04/29/sample.png"}, allImages)
	if err != nil {
		t.Fatalf("DeleteImages() error = %v", err)
	}
	if result["deleted"] != 1 || result["missing"] != 0 {
		t.Fatalf("DeleteImages() = %#v", result)
	}
	if _, err := os.Stat(imagePath); !os.IsNotExist(err) {
		t.Fatalf("original still exists, stat error = %v", err)
	}
	if _, err := os.Stat(thumbPath); !os.IsNotExist(err) {
		t.Fatalf("thumbnail still exists, stat error = %v", err)
	}
	if _, err := os.Stat(thumbPath + ".json"); !os.IsNotExist(err) {
		t.Fatalf("thumbnail metadata still exists, stat error = %v", err)
	}
	if _, err := os.Stat(previewPath); !os.IsNotExist(err) {
		t.Fatalf("preview still exists, stat error = %v", err)
	}
	if _, err := os.Stat(previewPath + ".json"); !os.IsNotExist(err) {
		t.Fatalf("preview metadata still exists, stat error = %v", err)
	}
}

func TestImageServiceScopesImagesByOwner(t *testing.T) {
	root := t.TempDir()
	config := testImageConfig{root: root}
	alicePath := filepath.Join(config.ImagesDir(), "2026", "04", "29", "alice.png")
	bobPath := filepath.Join(config.ImagesDir(), "2026", "04", "29", "bob.png")
	legacyPath := filepath.Join(config.ImagesDir(), "2026", "04", "29", "legacy.png")
	for _, path := range []string{alicePath, bobPath, legacyPath} {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatalf("MkdirAll() error = %v", err)
		}
		if err := writeTestPNG(path); err != nil {
			t.Fatalf("writeTestPNG(%s) error = %v", path, err)
		}
	}

	service := NewImageService(config)
	service.RecordImageOwners([]string{"2026/04/29/alice.png"}, "linuxdo:123")
	service.RecordImageOwners([]string{"http://127.0.0.1:8000/images/2026/04/29/bob.png"}, "linuxdo:456")

	alice := service.ListImages("http://127.0.0.1:8000", "", "", ImageAccessScope{OwnerID: "linuxdo:123"})
	aliceItems := alice["items"].([]map[string]any)
	if len(aliceItems) != 1 || aliceItems[0]["path"] != "2026/04/29/alice.png" {
		t.Fatalf("alice ListImages() = %#v", alice)
	}
	admin := service.ListImages("http://127.0.0.1:8000", "", "", allImages)
	if items := admin["items"].([]map[string]any); len(items) != 3 {
		t.Fatalf("admin ListImages() = %#v", admin)
	}

	result, err := service.DeleteImages([]string{"2026/04/29/bob.png", "2026/04/29/alice.png"}, ImageAccessScope{OwnerID: "linuxdo:123"})
	if err != nil {
		t.Fatalf("DeleteImages(owner) error = %v", err)
	}
	if result["deleted"] != 1 || result["missing"] != 1 {
		t.Fatalf("DeleteImages(owner) = %#v", result)
	}
	if _, err := os.Stat(alicePath); !os.IsNotExist(err) {
		t.Fatalf("alice image still exists, stat error = %v", err)
	}
	if _, err := os.Stat(bobPath); err != nil {
		t.Fatalf("bob image should not be deleted, stat error = %v", err)
	}
}

func TestImageServicePublicVisibility(t *testing.T) {
	root := t.TempDir()
	config := testImageConfig{root: root}
	aliceRel := "2026/04/29/alice.png"
	bobRel := "2026/04/29/bob.png"
	for _, rel := range []string{aliceRel, bobRel} {
		path := filepath.Join(config.ImagesDir(), filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatalf("MkdirAll() error = %v", err)
		}
		if err := writeTestPNG(path); err != nil {
			t.Fatalf("writeTestPNG(%s) error = %v", path, err)
		}
	}

	service := NewImageService(config)
	service.RecordGeneratedImages([]string{aliceRel}, "linuxdo:123", "alice", ImageVisibilityPublic)
	service.RecordGeneratedImages([]string{bobRel}, "linuxdo:456", "bob", ImageVisibilityPrivate)

	public := service.ListImages("http://127.0.0.1:8000", "", "", ImageAccessScope{Public: true})
	publicItems := public["items"].([]map[string]any)
	if len(publicItems) != 1 || publicItems[0]["path"] != aliceRel {
		t.Fatalf("public ListImages() = %#v", public)
	}
	if publicItems[0]["visibility"] != ImageVisibilityPublic || publicItems[0]["owner_name"] != "alice" || publicItems[0]["published_at"] == "" {
		t.Fatalf("public metadata = %#v", publicItems[0])
	}

	if _, err := service.UpdateImageVisibility(aliceRel, ImageVisibilityPrivate, ImageAccessScope{OwnerID: "linuxdo:456"}); err == nil {
		t.Fatal("UpdateImageVisibility(other owner) error = nil")
	}
	if _, err := service.UpdateImageVisibility("http://127.0.0.1:8000/images/"+aliceRel, ImageVisibilityPrivate, ImageAccessScope{OwnerID: "linuxdo:123"}); err != nil {
		t.Fatalf("UpdateImageVisibility(owner private) error = %v", err)
	}
	public = service.ListImages("http://127.0.0.1:8000", "", "", ImageAccessScope{Public: true})
	if items := public["items"].([]map[string]any); len(items) != 0 {
		t.Fatalf("private image should leave public gallery: %#v", public)
	}
}

func TestImageServiceListImagesReturnsRequestedResolutionPreset(t *testing.T) {
	root := t.TempDir()
	config := testImageConfig{root: root}
	rel := "2026/04/29/alice.png"
	path := filepath.Join(config.ImagesDir(), filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := writeTestPNG(path); err != nil {
		t.Fatalf("writeTestPNG() error = %v", err)
	}

	service := NewImageService(config)
	service.RecordGeneratedImages([]string{rel}, "linuxdo:123", "alice", ImageVisibilityPrivate, GeneratedImageMetadata{
		ResolutionPreset: "2k",
		RequestedSize:    "2048x2048",
	})

	list := service.ListImages("http://127.0.0.1:8000", "", "", allImages)
	items := list["items"].([]map[string]any)
	if len(items) != 1 {
		t.Fatalf("ListImages() = %#v", list)
	}
	if items[0]["resolution_preset"] != nil || items[0]["requested_size"] != nil {
		t.Fatalf("list item should not include request metadata = %#v", items[0])
	}
	if items[0]["resolution"] != "32x24" {
		t.Fatalf("actual resolution = %#v, want 32x24", items[0]["resolution"])
	}
	detail, err := service.ImageDetail("http://127.0.0.1:8000", rel, allImages)
	if err != nil {
		t.Fatalf("ImageDetail() error = %v", err)
	}
	if detail["resolution_preset"] != "2k" || detail["requested_size"] != "2048x2048" {
		t.Fatalf("detail request metadata = %#v", detail)
	}
}

func TestImageServiceListImagesReturnsGenerationReuseMetadata(t *testing.T) {
	root := t.TempDir()
	config := testImageConfig{root: root}
	rel := "2026/04/29/reusable.png"
	path := filepath.Join(config.ImagesDir(), filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := writeTestPNG(path); err != nil {
		t.Fatalf("writeTestPNG() error = %v", err)
	}

	outputCompression := 42
	partialImages := 2
	service := NewImageService(config)
	service.RecordGeneratedImages([]string{rel}, "linuxdo:123", "alice", ImageVisibilityPublic, GeneratedImageMetadata{
		Prompt:            "draw a reusable image",
		Model:             "gpt-image-2",
		Quality:           "high",
		ResolutionPreset:  "2k",
		RequestedSize:     "2048x2048",
		OutputFormat:      "jpeg",
		OutputCompression: &outputCompression,
		Background:        "transparent",
		Moderation:        "low",
		Style:             "vivid",
		PartialImages:     &partialImages,
		InputImageMask:    "mask-id",
		ReferenceImages: []GeneratedImageReference{
			{Filename: "原始参考图.png", ContentType: "image/png", Data: []byte("reference-bytes")},
		},
		SharePromptParams: true,
		ShareReferences:   true,
	})

	list := service.ListImages("http://127.0.0.1:8000", "", "", ImageAccessScope{Public: true})
	items := list["items"].([]map[string]any)
	if len(items) != 1 {
		t.Fatalf("ListImages() = %#v", list)
	}
	item := items[0]
	if item["prompt"] != nil || item["reference_image_urls"] != nil || item["model"] != nil {
		t.Fatalf("list item exposed reusable metadata = %#v", item)
	}
	item, err := service.ImageDetail("http://127.0.0.1:8000", rel, ImageAccessScope{Public: true})
	if err != nil {
		t.Fatalf("ImageDetail() error = %v", err)
	}
	if item["prompt"] != "draw a reusable image" ||
		item["model"] != "gpt-image-2" ||
		item["quality"] != "high" ||
		item["resolution_preset"] != "2k" ||
		item["requested_size"] != "2048x2048" ||
		item["output_format"] != "jpeg" ||
		item["output_compression"] != 42 ||
		item["background"] != "transparent" ||
		item["moderation"] != "low" ||
		item["style"] != "vivid" ||
		item["partial_images"] != 2 ||
		item["input_image_mask"] != "mask-id" {
		t.Fatalf("reuse metadata = %#v", item)
	}
	referenceURLs, ok := item["reference_image_urls"].([]string)
	if !ok || len(referenceURLs) != 1 || !strings.Contains(referenceURLs[0], "/image-references/") {
		t.Fatalf("reference_image_urls = %#v", item["reference_image_urls"])
	}
	referenceItems, ok := item["reference_images"].([]map[string]any)
	if !ok || len(referenceItems) != 1 || referenceItems[0]["url"] != referenceURLs[0] {
		t.Fatalf("reference_images = %#v", item["reference_images"])
	}
	access, err := service.ImageReferenceFileAccess(referenceURLs[0])
	if err != nil {
		t.Fatalf("ImageReferenceFileAccess() error = %v", err)
	}
	if access.SourceRel != rel || access.ContentType != "image/png" {
		t.Fatalf("reference access = %#v", access)
	}
	data, err := os.ReadFile(access.Path)
	if err != nil {
		t.Fatalf("ReadFile(reference) error = %v", err)
	}
	if string(data) != "reference-bytes" {
		t.Fatalf("reference data = %q", data)
	}
	if _, err := service.DeleteImages([]string{rel}, ImageAccessScope{OwnerID: "linuxdo:123"}); err != nil {
		t.Fatalf("DeleteImages() error = %v", err)
	}
	if _, err := os.Stat(access.Path); !os.IsNotExist(err) {
		t.Fatalf("reference path still exists or stat failed unexpectedly: %v", err)
	}
}

func TestImageServiceImageDetailKeepsObjectStorageInternal(t *testing.T) {
	root := t.TempDir()
	config := testImageConfig{root: root}
	rel := "2026/05/16/object.png"
	path := filepath.Join(config.ImagesDir(), filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := writeTestPNG(path); err != nil {
		t.Fatalf("writeTestPNG() error = %v", err)
	}
	metaPath := filepath.Join(config.ImageMetadataDir(), filepath.FromSlash(rel)+".json")
	if err := os.MkdirAll(filepath.Dir(metaPath), 0o755); err != nil {
		t.Fatalf("MkdirAll(metadata) error = %v", err)
	}
	meta := map[string]any{
		"owner_id":        "linuxdo:123",
		"visibility":      ImageVisibilityPrivate,
		"storage_backend": "cos",
		"object_key":      "chatgpt2api/" + rel,
		"object_url":      "https://cdn.example.com/chatgpt2api/" + rel,
		"updated_at":      time.Now().UTC().Format(time.RFC3339Nano),
	}
	data, _ := json.Marshal(meta)
	if err := os.WriteFile(metaPath, data, 0o644); err != nil {
		t.Fatalf("WriteFile(metadata) error = %v", err)
	}

	service := NewImageService(config)
	list := service.ListImages("http://127.0.0.1:8000", "", "", ImageAccessScope{OwnerID: "linuxdo:123"})
	items, _ := list["items"].([]map[string]any)
	if len(items) != 1 {
		t.Fatalf("ListImages() = %#v", list)
	}
	if items[0]["url"] != nil || items[0]["object_key"] != nil || items[0]["object_url"] != nil || items[0]["storage_backend"] != nil {
		t.Fatalf("image item = %#v", items[0])
	}
	detail, err := service.ImageDetail("http://127.0.0.1:8000", rel, ImageAccessScope{OwnerID: "linuxdo:123"})
	if err != nil {
		t.Fatalf("ImageDetail() error = %v", err)
	}
	if detail["url"] != "http://127.0.0.1:8000/images/"+rel {
		t.Fatalf("image detail url = %#v", detail)
	}
	if detail["object_key"] != nil || detail["object_url"] != nil || detail["storage_backend"] != nil {
		t.Fatalf("image detail = %#v", detail)
	}
}

func TestImageServiceImageDownloadURLUsesObjectStorageWhenLocalFileRemoved(t *testing.T) {
	root := t.TempDir()
	config := testImageConfig{root: root}
	var uploadedPath string
	var uploadedBytes []byte
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPut:
			uploadedPath = r.URL.Path
			uploadedBytes, _ = io.ReadAll(r.Body)
			w.WriteHeader(http.StatusOK)
		case http.MethodGet:
			if r.URL.Path != uploadedPath {
				t.Errorf("GET path = %q, want %q", r.URL.Path, uploadedPath)
			}
			w.Header().Set("Content-Type", "image/png")
			_, _ = w.Write(uploadedBytes)
		default:
			t.Errorf("method = %s", r.Method)
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	}))
	defer server.Close()
	t.Setenv(imagestore.EnvImageStorageBackend, "cos")
	t.Setenv(imagestore.EnvImageObjectStorageEndpoint, server.URL)
	t.Setenv(imagestore.EnvImageObjectStorageRegion, "ap-guangzhou")
	t.Setenv(imagestore.EnvImageObjectStorageBucket, "bucket")
	t.Setenv(imagestore.EnvImageObjectStorageAccessKeyID, "ak")
	t.Setenv(imagestore.EnvImageObjectStorageSecretKey, "sk")
	t.Setenv(imagestore.EnvImageObjectStorageForcePath, "true")

	var imageBuffer bytes.Buffer
	if err := png.Encode(&imageBuffer, image.NewRGBA(image.Rect(0, 0, 16, 12))); err != nil {
		t.Fatalf("png.Encode() error = %v", err)
	}
	service := NewImageService(config)
	item, err := service.StoreUploadedImage("http://127.0.0.1:8000", UploadedManagedImage{
		Filename:    "download.png",
		ContentType: "image/png",
		Data:        imageBuffer.Bytes(),
	}, "linuxdo:123", "alice", ImageVisibilityPrivate)
	if err != nil {
		t.Fatalf("StoreUploadedImage() error = %v", err)
	}
	rel := toString(item["path"])
	if rel == "" {
		t.Fatalf("item path is empty: %#v", item)
	}
	if _, err := os.Stat(filepath.Join(config.ImagesDir(), filepath.FromSlash(rel))); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("local original stat error = %v, want os.ErrNotExist", err)
	}

	download, err := service.ImageDownloadURL("http://127.0.0.1:8000", rel, ImageAccessScope{OwnerID: "linuxdo:123"})
	if err != nil {
		t.Fatalf("ImageDownloadURL() error = %v", err)
	}
	if !download.Direct || !strings.HasPrefix(download.URL, server.URL+"/bucket/") {
		t.Fatalf("ImageDownloadURL() = %#v", download)
	}
	for _, token := range []string{"X-Amz-Signature=", "X-Amz-Expires=", "response-content-disposition="} {
		if !strings.Contains(download.URL, token) {
			t.Fatalf("download URL missing %s: %q", token, download.URL)
		}
	}
	if _, err := time.Parse(time.RFC3339, download.ExpiresAt); err != nil {
		t.Fatalf("ExpiresAt = %q", download.ExpiresAt)
	}
	if _, err := service.ImageDownloadURL("http://127.0.0.1:8000", rel, ImageAccessScope{OwnerID: "linuxdo:other"}); err == nil {
		t.Fatalf("other owner ImageDownloadURL() error = nil")
	}
}

func TestImageServiceDeleteImagesDeletesObjectStorageImage(t *testing.T) {
	var deletedPath string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodDelete {
			t.Fatalf("method = %s, want DELETE", r.Method)
		}
		deletedPath = r.URL.Path
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()
	t.Setenv(imagestore.EnvImageStorageBackend, "cos")
	t.Setenv(imagestore.EnvImageObjectStorageEndpoint, server.URL)
	t.Setenv(imagestore.EnvImageObjectStorageRegion, "ap-guangzhou")
	t.Setenv(imagestore.EnvImageObjectStorageBucket, "bucket")
	t.Setenv(imagestore.EnvImageObjectStorageAccessKeyID, "ak")
	t.Setenv(imagestore.EnvImageObjectStorageSecretKey, "sk")
	t.Setenv(imagestore.EnvImageObjectStorageForcePath, "true")

	root := t.TempDir()
	config := testImageConfig{root: root}
	rel := "2026/05/16/delete.png"
	imagePath := filepath.Join(config.ImagesDir(), filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(imagePath), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := writeTestPNG(imagePath); err != nil {
		t.Fatalf("writeTestPNG() error = %v", err)
	}
	metaPath := filepath.Join(config.ImageMetadataDir(), filepath.FromSlash(rel)+".json")
	if err := os.MkdirAll(filepath.Dir(metaPath), 0o755); err != nil {
		t.Fatalf("MkdirAll(metadata) error = %v", err)
	}
	meta := map[string]any{
		"owner_id":        "linuxdo:123",
		"visibility":      ImageVisibilityPrivate,
		"storage_backend": "cos",
		"object_key":      "chatgpt2api/" + rel,
		"object_url":      "https://cdn.example.com/chatgpt2api/" + rel,
		"updated_at":      time.Now().UTC().Format(time.RFC3339Nano),
	}
	data, _ := json.Marshal(meta)
	if err := os.WriteFile(metaPath, data, 0o644); err != nil {
		t.Fatalf("WriteFile(metadata) error = %v", err)
	}

	service := NewImageService(config)
	result, err := service.DeleteImages([]string{rel}, allImages)
	if err != nil {
		t.Fatalf("DeleteImages() error = %v", err)
	}
	if result["deleted"] != 1 {
		t.Fatalf("DeleteImages() = %#v", result)
	}
	if deletedPath != "/bucket/chatgpt2api/"+rel {
		t.Fatalf("deletedPath = %q", deletedPath)
	}
	if _, err := os.Stat(imagePath); !os.IsNotExist(err) {
		t.Fatalf("image should be removed, stat error = %v", err)
	}
}

func TestImageServicePublicListHidesUnsharedGenerationMetadata(t *testing.T) {
	root := t.TempDir()
	config := testImageConfig{root: root}
	rel := "2026/04/29/unshared.png"
	path := filepath.Join(config.ImagesDir(), filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := writeTestPNG(path); err != nil {
		t.Fatalf("writeTestPNG() error = %v", err)
	}

	service := NewImageService(config)
	service.RecordGeneratedImages([]string{rel}, "linuxdo:123", "alice", ImageVisibilityPublic, GeneratedImageMetadata{
		Prompt: "private recipe",
		ReferenceImages: []GeneratedImageReference{
			{Filename: "source.png", ContentType: "image/png", Data: []byte("reference-bytes")},
		},
	})

	publicList := service.ListImages("http://127.0.0.1:8000", "", "", ImageAccessScope{Public: true})
	publicItems := publicList["items"].([]map[string]any)
	if len(publicItems) != 1 {
		t.Fatalf("public ListImages() = %#v", publicList)
	}
	if publicItems[0]["prompt"] != nil || publicItems[0]["reference_image_urls"] != nil || publicItems[0]["url"] != nil || publicItems[0]["object_url"] != nil || publicItems[0]["object_key"] != nil || publicItems[0]["storage_backend"] != nil {
		t.Fatalf("public item exposed unshared metadata = %#v", publicItems[0])
	}

	ownerList := service.ListImages("http://127.0.0.1:8000", "", "", ImageAccessScope{OwnerID: "linuxdo:123"})
	ownerItems := ownerList["items"].([]map[string]any)
	if len(ownerItems) != 1 || ownerItems[0]["prompt"] != nil || ownerItems[0]["reference_image_urls"] != nil || ownerItems[0]["url"] != nil || ownerItems[0]["object_url"] != nil || ownerItems[0]["object_key"] != nil || ownerItems[0]["storage_backend"] != nil {
		t.Fatalf("owner list item should stay lightweight = %#v", ownerList)
	}
	ownerDetail, err := service.ImageDetail("http://127.0.0.1:8000", rel, ImageAccessScope{OwnerID: "linuxdo:123"})
	if err != nil {
		t.Fatalf("ImageDetail(owner) error = %v", err)
	}
	if ownerDetail["prompt"] != "private recipe" || ownerDetail["reference_image_urls"] == nil {
		t.Fatalf("owner detail did not include private metadata = %#v", ownerDetail)
	}
}

func TestImageServiceListImagesPageUsesCursorAndLightweightItems(t *testing.T) {
	root := t.TempDir()
	config := testImageConfig{root: root}
	rels := []string{
		"2026/04/29/old.png",
		"2026/04/29/middle.png",
		"2026/04/29/new.png",
	}
	baseTime := time.Date(2026, 4, 29, 9, 0, 0, 0, time.UTC)
	for index, rel := range rels {
		path := filepath.Join(config.ImagesDir(), filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatalf("MkdirAll() error = %v", err)
		}
		if err := writeTestPNG(path); err != nil {
			t.Fatalf("writeTestPNG(%s) error = %v", rel, err)
		}
		stamp := baseTime.Add(time.Duration(index) * time.Hour)
		if err := os.Chtimes(path, stamp, stamp); err != nil {
			t.Fatalf("Chtimes(%s) error = %v", rel, err)
		}
	}
	service := NewImageService(config)
	service.RecordGeneratedImages(rels, "linuxdo:123", "alice", ImageVisibilityPrivate, GeneratedImageMetadata{
		Prompt: "heavy prompt",
	})

	first := service.ListImagesPage("http://127.0.0.1:8000", ImageListOptions{PageSize: 2}, ImageAccessScope{OwnerID: "linuxdo:123"})
	firstItems := first["items"].([]map[string]any)
	if len(firstItems) != 2 || firstItems[0]["path"] != rels[2] || firstItems[1]["path"] != rels[1] {
		t.Fatalf("first page = %#v", first)
	}
	if firstItems[0]["prompt"] != nil || firstItems[0]["reference_image_urls"] != nil || firstItems[0]["url"] != nil || firstItems[0]["object_url"] != nil || firstItems[0]["object_key"] != nil || firstItems[0]["storage_backend"] != nil {
		t.Fatalf("list item should be lightweight = %#v", firstItems[0])
	}
	if previewURL := toString(firstItems[0]["preview_url"]); !strings.Contains(previewURL, "/image-previews/") {
		t.Fatalf("preview_url = %q, want preview route", previewURL)
	}
	if thumbnailURL := toString(firstItems[0]["thumbnail_url"]); !strings.Contains(thumbnailURL, "/image-thumbnails/") {
		t.Fatalf("thumbnail_url = %q, want thumbnail route", thumbnailURL)
	}
	cursor := toString(first["next_cursor"])
	if cursor == "" || first["has_more"] != true {
		t.Fatalf("first page cursor = %#v", first)
	}
	second := service.ListImagesPage("http://127.0.0.1:8000", ImageListOptions{PageSize: 2, Cursor: cursor}, ImageAccessScope{OwnerID: "linuxdo:123"})
	secondItems := second["items"].([]map[string]any)
	if len(secondItems) != 1 || secondItems[0]["path"] != rels[0] || second["has_more"] != false {
		t.Fatalf("second page = %#v", second)
	}
}

func TestImageServiceRebuildsImageIndexWhenIndexIsCorrupt(t *testing.T) {
	root := t.TempDir()
	config := testImageConfig{root: root}
	rel := "2026/04/29/rebuild.png"
	path := filepath.Join(config.ImagesDir(), filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := writeTestPNG(path); err != nil {
		t.Fatalf("writeTestPNG() error = %v", err)
	}
	indexPath := filepath.Join(config.ImageMetadataDir(), imageIndexDocumentName)
	if err := os.WriteFile(indexPath, []byte(`not-json`), 0o644); err != nil {
		t.Fatalf("write corrupt index: %v", err)
	}

	service := NewImageService(config)
	list := service.ListImagesPage("http://127.0.0.1:8000", ImageListOptions{PageSize: 50}, allImages)
	items := list["items"].([]map[string]any)
	if len(items) != 1 || items[0]["path"] != rel {
		t.Fatalf("ListImagesPage() = %#v", list)
	}
	data, err := os.ReadFile(indexPath)
	if err != nil {
		t.Fatalf("read rebuilt index: %v", err)
	}
	if !strings.Contains(string(data), rel) {
		t.Fatalf("rebuilt index = %s", data)
	}
}

func TestImageServiceListImagesPagePrunesStaleIndexEntries(t *testing.T) {
	root := t.TempDir()
	config := testImageConfig{root: root}
	existingRel := "2026/04/29/existing.png"
	missingRel := "2026/04/29/missing.png"
	for _, rel := range []string{existingRel, missingRel} {
		path := filepath.Join(config.ImagesDir(), filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatalf("MkdirAll() error = %v", err)
		}
		if err := writeTestPNG(path); err != nil {
			t.Fatalf("writeTestPNG(%s) error = %v", rel, err)
		}
	}
	service := NewImageService(config)
	service.RecordGeneratedImages([]string{existingRel, missingRel}, "linuxdo:123", "alice", ImageVisibilityPrivate)
	if err := os.Remove(filepath.Join(config.ImagesDir(), filepath.FromSlash(missingRel))); err != nil {
		t.Fatalf("remove missing image fixture: %v", err)
	}

	list := service.ListImagesPage("http://127.0.0.1:8000", ImageListOptions{PageSize: 50}, ImageAccessScope{OwnerID: "linuxdo:123"})
	items := list["items"].([]map[string]any)
	if len(items) != 1 || items[0]["path"] != existingRel {
		t.Fatalf("ListImagesPage() = %#v", list)
	}
	data, err := os.ReadFile(filepath.Join(config.ImageMetadataDir(), imageIndexDocumentName))
	if err != nil {
		t.Fatalf("read pruned index: %v", err)
	}
	if strings.Contains(string(data), missingRel) {
		t.Fatalf("stale image remained in index = %s", data)
	}
}

func TestImageServiceTagsPersistFilterAndDelete(t *testing.T) {
	root := t.TempDir()
	config := testImageConfig{root: root}
	rels := []string{"2026/04/29/one.png", "2026/04/29/two.png"}
	for _, rel := range rels {
		path := filepath.Join(config.ImagesDir(), filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatalf("MkdirAll() error = %v", err)
		}
		if err := writeTestPNG(path); err != nil {
			t.Fatalf("writeTestPNG(%s) error = %v", rel, err)
		}
	}
	service := NewImageService(config)
	service.RecordGeneratedImages(rels, "linuxdo:123", "alice", ImageVisibilityPrivate)
	item, err := service.UpdateImageTags(rels[0], []string{"Avatar", "hero", "avatar"}, ImageAccessScope{OwnerID: "linuxdo:123"})
	if err != nil {
		t.Fatalf("UpdateImageTags() error = %v", err)
	}
	if got := item["tags"].([]string); len(got) != 2 || got[0] != "Avatar" || got[1] != "hero" {
		t.Fatalf("item tags = %#v", item["tags"])
	}
	list := service.ListImagesPage("http://127.0.0.1:8000", ImageListOptions{Tags: []string{"hero"}}, ImageAccessScope{OwnerID: "linuxdo:123"})
	items := list["items"].([]map[string]any)
	if len(items) != 1 || items[0]["path"] != rels[0] {
		t.Fatalf("filtered list = %#v", list)
	}
	tags := service.ListImageTags(ImageAccessScope{OwnerID: "linuxdo:123"})
	if len(tags) != 2 || tags[0] != "Avatar" || tags[1] != "hero" {
		t.Fatalf("ListImageTags() = %#v", tags)
	}
	result, err := service.DeleteImageTag("hero", ImageAccessScope{OwnerID: "linuxdo:123"})
	if err != nil {
		t.Fatalf("DeleteImageTag() error = %v", err)
	}
	if result["deleted"] != 1 {
		t.Fatalf("DeleteImageTag() = %#v", result)
	}
	tags = service.ListImageTags(ImageAccessScope{OwnerID: "linuxdo:123"})
	if len(tags) != 1 || tags[0] != "Avatar" {
		t.Fatalf("tags after delete = %#v", tags)
	}
}

func TestImageServiceCleanupStorageClearsThumbnailCacheOnly(t *testing.T) {
	root := t.TempDir()
	config := testImageConfig{root: root}
	rel := "2026/04/29/sample.png"
	imagePath := filepath.Join(config.ImagesDir(), filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(imagePath), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := writeTestPNG(imagePath); err != nil {
		t.Fatalf("writeTestPNG() error = %v", err)
	}

	service := NewImageService(config)
	service.RecordGeneratedImages([]string{rel}, "linuxdo:123", "alice", ImageVisibilityPrivate)
	service.EnsureThumbnails([]string{rel})
	if err := service.EnsurePreview(rel + thumbnailExtension); err != nil {
		t.Fatalf("EnsurePreview() error = %v", err)
	}
	thumbPath := filepath.Join(config.ImageThumbnailsDir(), filepath.FromSlash(rel)+thumbnailExtension)
	if _, err := os.Stat(thumbPath); err != nil {
		t.Fatalf("thumbnail was not created: %v", err)
	}
	previewPath := filepath.Join(config.ImagePreviewsDir(), filepath.FromSlash(rel)+thumbnailExtension)
	if _, err := os.Stat(previewPath); err != nil {
		t.Fatalf("preview was not created: %v", err)
	}

	result, err := service.CleanupStorage(ImageStorageCleanupOptions{ClearThumbnails: true})
	if err != nil {
		t.Fatalf("CleanupStorage(thumbnails) error = %v", err)
	}
	if result.DeletedThumbnails != 1 || result.DeletedPreviews != 1 || result.DeletedImages != 0 {
		t.Fatalf("CleanupStorage(thumbnails) = %#v", result)
	}
	if _, err := os.Stat(imagePath); err != nil {
		t.Fatalf("image should remain after thumbnail cleanup: %v", err)
	}
	if _, err := os.Stat(thumbPath); !os.IsNotExist(err) {
		t.Fatalf("thumbnail still exists, stat error = %v", err)
	}
	if _, err := os.Stat(previewPath); !os.IsNotExist(err) {
		t.Fatalf("preview still exists, stat error = %v", err)
	}
	list := service.ListImages("http://127.0.0.1:8000", "", "", ImageAccessScope{OwnerID: "linuxdo:123"})
	if items := list["items"].([]map[string]any); len(items) != 1 || items[0]["path"] != rel {
		t.Fatalf("image missing after thumbnail cleanup: %#v", list)
	}
}

func TestImageServiceCleanupStorageRetentionRemovesImageGroup(t *testing.T) {
	root := t.TempDir()
	config := testImageConfig{root: root}
	rel := "2026/04/29/old.png"
	imagePath := filepath.Join(config.ImagesDir(), filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(imagePath), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := writeTestPNG(imagePath); err != nil {
		t.Fatalf("writeTestPNG() error = %v", err)
	}

	service := NewImageService(config)
	service.RecordGeneratedImages([]string{rel}, "linuxdo:123", "alice", ImageVisibilityPrivate, GeneratedImageMetadata{
		ReferenceImages: []GeneratedImageReference{{Filename: "ref.png", ContentType: "image/png", Data: []byte("reference-bytes")}},
	})
	service.EnsureThumbnails([]string{rel})
	if err := service.EnsurePreview(rel + thumbnailExtension); err != nil {
		t.Fatalf("EnsurePreview() error = %v", err)
	}
	thumbPath := filepath.Join(config.ImageThumbnailsDir(), filepath.FromSlash(rel)+thumbnailExtension)
	previewPath := filepath.Join(config.ImagePreviewsDir(), filepath.FromSlash(rel)+thumbnailExtension)
	metaPath := filepath.Join(config.ImageMetadataDir(), filepath.FromSlash(rel)+".json")
	refDir := filepath.Join(config.ImageMetadataDir(), "references", filepath.FromSlash(rel+".refs"))
	old := time.Now().Add(-72 * time.Hour)
	for _, path := range []string{imagePath, thumbPath, thumbPath + ".json", previewPath, previewPath + ".json", metaPath} {
		if err := os.Chtimes(path, old, old); err != nil {
			t.Fatalf("Chtimes(%s) error = %v", path, err)
		}
	}

	result, err := service.CleanupStorage(ImageStorageCleanupOptions{RetentionDays: 1})
	if err != nil {
		t.Fatalf("CleanupStorage(retention) error = %v", err)
	}
	if result.DeletedImages != 1 || result.DeletedThumbnails != 1 || result.DeletedPreviews != 1 || result.DeletedReferenceFiles != 1 {
		t.Fatalf("CleanupStorage(retention) = %#v", result)
	}
	for _, path := range []string{imagePath, thumbPath, thumbPath + ".json", previewPath, previewPath + ".json", metaPath, refDir} {
		if _, err := os.Stat(path); !os.IsNotExist(err) {
			t.Fatalf("%s still exists or stat failed unexpectedly: %v", path, err)
		}
	}
	indexData, err := os.ReadFile(filepath.Join(config.ImageMetadataDir(), imageIndexDocumentName))
	if err != nil {
		t.Fatalf("read image index: %v", err)
	}
	if strings.Contains(string(indexData), rel) {
		t.Fatalf("deleted image remained in index = %s", indexData)
	}
}

func TestImageServiceCleanupStorageUserLimitKeepsNewestPrivateImages(t *testing.T) {
	root := t.TempDir()
	config := testImageConfig{root: root}
	rels := []string{
		"2026/04/29/alice-old.png",
		"2026/04/29/alice-middle.png",
		"2026/04/29/alice-new.png",
		"2026/04/29/bob-old.png",
	}
	baseTime := time.Now().Add(-4 * time.Hour)
	for index, rel := range rels {
		path := filepath.Join(config.ImagesDir(), filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatalf("MkdirAll() error = %v", err)
		}
		if err := writeTestPNG(path); err != nil {
			t.Fatalf("writeTestPNG(%s) error = %v", rel, err)
		}
		stamp := baseTime.Add(time.Duration(index) * time.Hour)
		if err := os.Chtimes(path, stamp, stamp); err != nil {
			t.Fatalf("Chtimes(%s) error = %v", rel, err)
		}
	}

	service := NewImageService(config)
	service.RecordGeneratedImages(rels[:3], "linuxdo:123", "alice", ImageVisibilityPrivate)
	service.RecordGeneratedImages([]string{rels[3]}, "linuxdo:456", "bob", ImageVisibilityPrivate)
	result, err := service.CleanupStorage(ImageStorageCleanupOptions{MaxImagesPerUser: 2})
	if err != nil {
		t.Fatalf("CleanupStorage(user limit) error = %v", err)
	}
	if result.DeletedImages != 1 || result.MaxImagesPerUser != 2 {
		t.Fatalf("CleanupStorage(user limit) = %#v", result)
	}
	if _, err := os.Stat(filepath.Join(config.ImagesDir(), filepath.FromSlash(rels[0]))); !os.IsNotExist(err) {
		t.Fatalf("oldest alice image should be deleted, stat error = %v", err)
	}
	for _, rel := range rels[1:] {
		if _, err := os.Stat(filepath.Join(config.ImagesDir(), filepath.FromSlash(rel))); err != nil {
			t.Fatalf("%s should remain, stat error = %v", rel, err)
		}
	}
}

func TestImageServiceMoveImagesToTeamLibraryScopesListsAndDeletes(t *testing.T) {
	root := t.TempDir()
	config := testImageConfig{root: root}
	rels := []string{
		"2026/04/29/team-a.png",
		"2026/04/29/team-b.png",
	}
	for _, rel := range rels {
		path := filepath.Join(config.ImagesDir(), filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatalf("MkdirAll() error = %v", err)
		}
		if err := writeTestPNG(path); err != nil {
			t.Fatalf("writeTestPNG(%s) error = %v", rel, err)
		}
	}

	service := NewImageService(config)
	service.RecordGeneratedImages(rels, "linuxdo:123", "alice", ImageVisibilityPrivate)
	result, err := service.MoveImagesToTeamLibrary([]string{rels[0]}, "linuxdo:123", "team-1", "Design Team", DefaultTeamStorageLimitBytes)
	if err != nil {
		t.Fatalf("MoveImagesToTeamLibrary() error = %v", err)
	}
	if result["moved"] != 1 || result["team_id"] != "team-1" {
		t.Fatalf("MoveImagesToTeamLibrary() = %#v", result)
	}

	personal := service.ListImagesPage("http://127.0.0.1:8000", ImageListOptions{PageSize: 50}, ImageAccessScope{OwnerID: "linuxdo:123"})
	if items := personal["items"].([]map[string]any); len(items) != 1 || items[0]["path"] != rels[1] {
		t.Fatalf("personal images after move = %#v", personal)
	}
	team := service.ListImagesPage("http://127.0.0.1:8000", ImageListOptions{PageSize: 50}, ImageAccessScope{TeamID: "team-1"})
	teamItems := team["items"].([]map[string]any)
	if len(teamItems) != 1 || teamItems[0]["path"] != rels[0] || teamItems[0]["library_scope"] != ImageLibraryScopeTeam || teamItems[0]["team_id"] != "team-1" {
		t.Fatalf("team images after move = %#v", team)
	}

	summary := service.TeamStorageSummary("team-1", DefaultTeamStorageLimitBytes)
	if summary.ImagesCount != 1 || summary.UsedBytes <= 0 || summary.RemainingBytes != DefaultTeamStorageLimitBytes-summary.UsedBytes {
		t.Fatalf("TeamStorageSummary() = %#v", summary)
	}
	deleted, err := service.DeleteImages([]string{rels[0]}, ImageAccessScope{TeamID: "team-1", TeamManager: true})
	if err != nil {
		t.Fatalf("DeleteImages(team manager) error = %v", err)
	}
	if deleted["deleted"] != 1 || deleted["missing"] != 0 {
		t.Fatalf("DeleteImages(team manager) = %#v", deleted)
	}
	if after := service.TeamStorageSummary("team-1", DefaultTeamStorageLimitBytes); after.ImagesCount != 0 || after.UsedBytes != 0 {
		t.Fatalf("TeamStorageSummary(after delete) = %#v", after)
	}
}

func TestImageServiceMoveImagesToTeamLibraryRequiresOwnerAndQuota(t *testing.T) {
	root := t.TempDir()
	config := testImageConfig{root: root}
	rel := "2026/04/29/quota.png"
	path := filepath.Join(config.ImagesDir(), filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := writeTestPNG(path); err != nil {
		t.Fatalf("writeTestPNG() error = %v", err)
	}

	service := NewImageService(config)
	service.RecordGeneratedImages([]string{rel}, "linuxdo:123", "alice", ImageVisibilityPrivate)
	if _, err := service.MoveImagesToTeamLibrary([]string{rel}, "linuxdo:456", "team-1", "Design Team", DefaultTeamStorageLimitBytes); err == nil {
		t.Fatalf("MoveImagesToTeamLibrary(other owner) error = nil")
	}
	if _, err := service.MoveImagesToTeamLibrary([]string{rel}, "linuxdo:123", "team-1", "Design Team", 1); err == nil {
		t.Fatalf("MoveImagesToTeamLibrary(quota) error = nil")
	} else {
		var quotaErr TeamStorageQuotaExceededError
		if !errors.As(err, &quotaErr) || quotaErr.LimitBytes != 1 || quotaErr.RequiredBytes <= 1 {
			t.Fatalf("quota error = %#v", err)
		}
	}
	personal := service.ListImagesPage("http://127.0.0.1:8000", ImageListOptions{PageSize: 50}, ImageAccessScope{OwnerID: "linuxdo:123"})
	if items := personal["items"].([]map[string]any); len(items) != 1 || items[0]["path"] != rel {
		t.Fatalf("quota failure should keep personal image = %#v", personal)
	}
}

func TestImageServiceCleanupStorageUserLimitSkipsTeamImages(t *testing.T) {
	root := t.TempDir()
	config := testImageConfig{root: root}
	rels := []string{
		"2026/04/29/team-old.png",
		"2026/04/29/personal-old.png",
		"2026/04/29/personal-new.png",
	}
	baseTime := time.Now().Add(-3 * time.Hour)
	for index, rel := range rels {
		path := filepath.Join(config.ImagesDir(), filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatalf("MkdirAll() error = %v", err)
		}
		if err := writeTestPNG(path); err != nil {
			t.Fatalf("writeTestPNG(%s) error = %v", rel, err)
		}
		stamp := baseTime.Add(time.Duration(index) * time.Hour)
		if err := os.Chtimes(path, stamp, stamp); err != nil {
			t.Fatalf("Chtimes(%s) error = %v", rel, err)
		}
	}

	service := NewImageService(config)
	service.RecordGeneratedImages(rels, "linuxdo:123", "alice", ImageVisibilityPrivate)
	if _, err := service.MoveImagesToTeamLibrary([]string{rels[0]}, "linuxdo:123", "team-1", "Design Team", DefaultTeamStorageLimitBytes); err != nil {
		t.Fatalf("MoveImagesToTeamLibrary() error = %v", err)
	}
	result, err := service.CleanupStorage(ImageStorageCleanupOptions{MaxImagesPerUser: 1})
	if err != nil {
		t.Fatalf("CleanupStorage(user limit) error = %v", err)
	}
	if result.DeletedImages != 1 {
		t.Fatalf("CleanupStorage(user limit) = %#v", result)
	}
	if _, err := os.Stat(filepath.Join(config.ImagesDir(), filepath.FromSlash(rels[0]))); err != nil {
		t.Fatalf("team image should remain, stat error = %v", err)
	}
	if _, err := os.Stat(filepath.Join(config.ImagesDir(), filepath.FromSlash(rels[1]))); !os.IsNotExist(err) {
		t.Fatalf("old personal image should be deleted, stat error = %v", err)
	}
}

func TestImageServiceCleanupStorageUserLimitIncludesPublicImages(t *testing.T) {
	root := t.TempDir()
	config := testImageConfig{root: root}
	rels := []string{
		"2026/04/29/alice-public-old.png",
		"2026/04/29/alice-private-new.png",
	}
	baseTime := time.Now().Add(-2 * time.Hour)
	for index, rel := range rels {
		path := filepath.Join(config.ImagesDir(), filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatalf("MkdirAll() error = %v", err)
		}
		if err := writeTestPNG(path); err != nil {
			t.Fatalf("writeTestPNG(%s) error = %v", rel, err)
		}
		stamp := baseTime.Add(time.Duration(index) * time.Hour)
		if err := os.Chtimes(path, stamp, stamp); err != nil {
			t.Fatalf("Chtimes(%s) error = %v", rel, err)
		}
	}

	service := NewImageService(config)
	service.RecordGeneratedImages([]string{rels[0]}, "linuxdo:123", "alice", ImageVisibilityPublic)
	service.RecordGeneratedImages([]string{rels[1]}, "linuxdo:123", "alice", ImageVisibilityPrivate)
	result, err := service.CleanupStorage(ImageStorageCleanupOptions{MaxImagesPerUser: 1})
	if err != nil {
		t.Fatalf("CleanupStorage(user limit) error = %v", err)
	}
	if result.DeletedImages != 1 || result.PreservedPublicImages != 0 {
		t.Fatalf("CleanupStorage(user limit) = %#v", result)
	}
	if _, err := os.Stat(filepath.Join(config.ImagesDir(), filepath.FromSlash(rels[0]))); !os.IsNotExist(err) {
		t.Fatalf("old public image should be deleted, stat error = %v", err)
	}
	if _, err := os.Stat(filepath.Join(config.ImagesDir(), filepath.FromSlash(rels[1]))); err != nil {
		t.Fatalf("new private image should remain, stat error = %v", err)
	}
}

func TestImageServiceCleanupStorageLimitPreservesPublicByDefault(t *testing.T) {
	root := t.TempDir()
	config := testImageConfig{root: root}
	publicRel := "2026/04/29/public.png"
	privateRel := "2026/04/29/private.png"
	for _, rel := range []string{publicRel, privateRel} {
		path := filepath.Join(config.ImagesDir(), filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatalf("MkdirAll() error = %v", err)
		}
		if err := writeLargeTestPNG(path); err != nil {
			t.Fatalf("writeLargeTestPNG(%s) error = %v", rel, err)
		}
	}

	service := NewImageService(config)
	service.RecordGeneratedImages([]string{publicRel}, "linuxdo:123", "alice", ImageVisibilityPublic)
	service.RecordGeneratedImages([]string{privateRel}, "linuxdo:123", "alice", ImageVisibilityPrivate)
	summary := service.StorageGovernance()
	if summary.ImagesCount != 2 || summary.PublicImagesCount != 1 || summary.PrivateImagesCount != 1 {
		t.Fatalf("StorageGovernance() = %#v", summary)
	}

	result, err := service.CleanupStorage(ImageStorageCleanupOptions{MaxBytes: summary.TotalBytes - 1})
	if err != nil {
		t.Fatalf("CleanupStorage(quota) error = %v", err)
	}
	if result.DeletedImages != 1 {
		t.Fatalf("CleanupStorage(quota) = %#v", result)
	}
	if _, err := os.Stat(filepath.Join(config.ImagesDir(), filepath.FromSlash(privateRel))); !os.IsNotExist(err) {
		t.Fatalf("private image should be deleted, stat error = %v", err)
	}
	if _, err := os.Stat(filepath.Join(config.ImagesDir(), filepath.FromSlash(publicRel))); err != nil {
		t.Fatalf("public image should remain, stat error = %v", err)
	}
}

func TestImageServiceCleanupStorageLimitCanIncludePublic(t *testing.T) {
	root := t.TempDir()
	config := testImageConfig{root: root}
	publicRel := "2026/04/29/public.png"
	path := filepath.Join(config.ImagesDir(), filepath.FromSlash(publicRel))
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := writeLargeTestPNG(path); err != nil {
		t.Fatalf("writeLargeTestPNG() error = %v", err)
	}

	service := NewImageService(config)
	service.RecordGeneratedImages([]string{publicRel}, "linuxdo:123", "alice", ImageVisibilityPublic)
	result, err := service.CleanupStorage(ImageStorageCleanupOptions{MaxBytes: 1, IncludePublic: true})
	if err != nil {
		t.Fatalf("CleanupStorage(include public) error = %v", err)
	}
	if result.DeletedImages != 1 {
		t.Fatalf("CleanupStorage(include public) = %#v", result)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("public image should be deleted when include_public=true, stat error = %v", err)
	}
}

func TestImageServiceDeleteImagesRejectsTraversal(t *testing.T) {
	root := t.TempDir()
	outsidePath := filepath.Join(root, "outside.png")
	if err := writeTestPNG(outsidePath); err != nil {
		t.Fatalf("writeTestPNG() error = %v", err)
	}

	service := NewImageService(testImageConfig{root: root})
	if _, err := service.DeleteImages([]string{"../outside.png"}, allImages); err == nil {
		t.Fatal("DeleteImages() error = nil, want traversal rejection")
	}
	if _, err := os.Stat(outsidePath); err != nil {
		t.Fatalf("outside file was changed: %v", err)
	}
}

func TestImageServiceTempReferenceImagesAreOwnerScopedAndIdempotent(t *testing.T) {
	root := t.TempDir()
	config := testImageConfig{root: root}
	service := NewImageService(config)

	imagePath := filepath.Join(root, "reference.png")
	if err := writeTestPNG(imagePath); err != nil {
		t.Fatalf("writeTestPNG() error = %v", err)
	}
	data, err := os.ReadFile(imagePath)
	if err != nil {
		t.Fatalf("ReadFile() error = %v", err)
	}

	ref, err := service.StoreTempReferenceImage(UploadedTempReferenceImage{
		ClientReferenceID: "client-1",
		Filename:          "source.png",
		ContentType:       "image/png",
		Data:              data,
	}, "owner-a")
	if err != nil {
		t.Fatalf("StoreTempReferenceImage() error = %v", err)
	}
	if ref.ID == "" || ref.ClientReferenceID != "client-1" || ref.Width != 32 || ref.Height != 24 || ref.Size == 0 {
		t.Fatalf("stored temp reference = %#v", ref)
	}

	again, err := service.StoreTempReferenceImage(UploadedTempReferenceImage{
		ClientReferenceID: "client-1",
		Filename:          "source-renamed.png",
		ContentType:       "image/png",
		Data:              data,
	}, "owner-a")
	if err != nil {
		t.Fatalf("StoreTempReferenceImage(idempotent) error = %v", err)
	}
	if again.ID != ref.ID || again.Filename != ref.Filename {
		t.Fatalf("idempotent temp reference = %#v, want %#v", again, ref)
	}

	images, err := service.TempReferenceImageBytes([]string{ref.ID}, "owner-a")
	if err != nil {
		t.Fatalf("TempReferenceImageBytes(owner) error = %v", err)
	}
	if len(images) != 1 || images[0].Filename != "source.png" || len(images[0].Data) == 0 {
		t.Fatalf("TempReferenceImageBytes(owner) = %#v", images)
	}
	if _, err := service.TempReferenceImageBytes([]string{ref.ID}, "owner-b"); err == nil {
		t.Fatalf("TempReferenceImageBytes(other owner) should fail")
	}
}

func requireThumbnailURLPath(t *testing.T, value string) string {
	t.Helper()
	parsed, err := url.Parse(value)
	if err != nil {
		t.Fatalf("parse thumbnail_url: %v", err)
	}
	if !strings.Contains(parsed.Path, "/image-thumbnails/") {
		t.Fatalf("thumbnail_url path = %q, want image thumbnail route", parsed.Path)
	}
	if parsed.Query().Get("v") == "" {
		t.Fatalf("thumbnail_url = %q, want cache-busting version query", value)
	}
	return parsed.Path
}

func writeTestPNG(path string) error {
	img := image.NewRGBA(image.Rect(0, 0, 32, 24))
	for y := 0; y < 24; y++ {
		for x := 0; x < 32; x++ {
			img.Set(x, y, color.RGBA{R: uint8(x * 8), G: uint8(y * 10), B: 120, A: 255})
		}
	}
	file, err := os.Create(path)
	if err != nil {
		return err
	}
	defer file.Close()
	return png.Encode(file, img)
}

func writeLargeTestPNG(path string) error {
	img := image.NewRGBA(image.Rect(0, 0, 1600, 1200))
	for y := 0; y < 1200; y++ {
		for x := 0; x < 1600; x++ {
			img.Set(x, y, color.RGBA{
				R: uint8((x*37 + y*17) & 0xff),
				G: uint8((x*13 ^ y*31) & 0xff),
				B: uint8((x*y + x*11 + y*7) & 0xff),
				A: 255,
			})
		}
	}
	file, err := os.Create(path)
	if err != nil {
		return err
	}
	defer file.Close()
	return png.Encode(file, img)
}
