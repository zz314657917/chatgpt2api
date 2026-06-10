package imagestore

import (
	"context"
	"crypto/md5"
	"encoding/hex"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

func TestConfigObjectKeyAndPublicURLForCOS(t *testing.T) {
	cfg := Config{
		Backend:         "cos",
		Endpoint:        "https://cos.ap-guangzhou.myqcloud.com",
		Bucket:          "bucket-1250000000",
		AccessKeyID:     "ak",
		SecretAccessKey: "sk",
		Prefix:          "/chatgpt2api/images/",
	}

	key, err := cfg.ObjectKey("2026/05/16/sample.png")
	if err != nil {
		t.Fatalf("ObjectKey() error = %v", err)
	}
	if key != "chatgpt2api/images/2026/05/16/sample.png" {
		t.Fatalf("ObjectKey() = %q", key)
	}
	if got := cfg.PublicURL(key); got != "https://bucket-1250000000.cos.ap-guangzhou.myqcloud.com/chatgpt2api/images/2026/05/16/sample.png" {
		t.Fatalf("PublicURL() = %q", got)
	}
	if got := cfg.normalized().Region; got != "ap-guangzhou" {
		t.Fatalf("region = %q, want ap-guangzhou", got)
	}
}

func TestStoreUploadGetAndDeleteUsesS3CompatibleRequests(t *testing.T) {
	var seenPut, seenGet, seenDelete bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") == "" {
			t.Errorf("missing Authorization header")
		}
		switch r.Method {
		case http.MethodPut:
			seenPut = true
			if r.URL.Path != "/bucket/prefix/sample.png" {
				t.Errorf("PUT path = %q", r.URL.Path)
			}
			if r.Header.Get("Content-Type") != "image/png" {
				t.Errorf("Content-Type = %q", r.Header.Get("Content-Type"))
			}
			body, _ := io.ReadAll(r.Body)
			if string(body) != "png-bytes" {
				t.Errorf("body = %q", body)
			}
			w.WriteHeader(http.StatusOK)
		case http.MethodGet:
			seenGet = true
			if r.URL.Path != "/bucket/prefix/sample.png" {
				t.Errorf("GET path = %q", r.URL.Path)
			}
			w.Header().Set("Content-Type", "image/png")
			_, _ = w.Write([]byte("png-bytes"))
		case http.MethodDelete:
			seenDelete = true
			if r.URL.Path != "/bucket/prefix/sample.png" {
				t.Errorf("DELETE path = %q", r.URL.Path)
			}
			w.WriteHeader(http.StatusNoContent)
		default:
			t.Errorf("method = %s", r.Method)
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	}))
	defer server.Close()

	store, err := New(context.Background(), Config{
		Backend:         "cos",
		Endpoint:        server.URL,
		Region:          "ap-guangzhou",
		Bucket:          "bucket",
		AccessKeyID:     "ak",
		SecretAccessKey: "sk",
		ForcePathStyle:  true,
		PublicBaseURL:   "https://cdn.example.com/images",
	})
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	stored, err := store.UploadBytes(context.Background(), "prefix/sample.png", []byte("png-bytes"), "image/png")
	if err != nil {
		t.Fatalf("UploadBytes() error = %v", err)
	}
	if stored.Backend != "cos" || stored.Key != "prefix/sample.png" || !strings.HasPrefix(stored.URL, "https://cdn.example.com/images/prefix/sample.png") {
		t.Fatalf("stored = %#v", stored)
	}
	data, err := store.GetBytes(context.Background(), "prefix/sample.png")
	if err != nil {
		t.Fatalf("GetBytes() error = %v", err)
	}
	if string(data.Data) != "png-bytes" || data.ContentType != "image/png" {
		t.Fatalf("GetBytes() = %#v", data)
	}
	if err := store.Delete(context.Background(), "prefix/sample.png"); err != nil {
		t.Fatalf("Delete() error = %v", err)
	}
	if !seenPut || !seenGet || !seenDelete {
		t.Fatalf("seenPut=%v seenGet=%v seenDelete=%v", seenPut, seenGet, seenDelete)
	}
}

func TestStorePresignGetDownloadURL(t *testing.T) {
	store, err := New(context.Background(), Config{
		Backend:         "cos",
		Endpoint:        "https://cos.ap-guangzhou.myqcloud.com",
		Region:          "ap-guangzhou",
		Bucket:          "bucket",
		AccessKeyID:     "ak",
		SecretAccessKey: "sk",
	})
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}

	u, err := store.PresignGetDownloadURL(context.Background(), "prefix/sample.png", 2*time.Minute, "sample.png")
	if err != nil {
		t.Fatalf("PresignGetDownloadURL() error = %v", err)
	}
	if !strings.HasPrefix(u, "https://bucket.cos.ap-guangzhou.myqcloud.com/prefix/sample.png?") {
		t.Fatalf("presigned url = %q", u)
	}
	for _, token := range []string{"X-Amz-Signature=", "X-Amz-Expires=", "response-content-disposition="} {
		if !strings.Contains(u, token) {
			t.Fatalf("presigned url missing %s: %q", token, u)
		}
	}
}

func TestStorePresignGetDownloadURLUsesCDNTypeA(t *testing.T) {
	store, err := New(context.Background(), Config{
		Backend:         "cos",
		Endpoint:        "https://cos.ap-guangzhou.myqcloud.com",
		Region:          "ap-guangzhou",
		Bucket:          "bucket",
		AccessKeyID:     "ak",
		SecretAccessKey: "sk",
		PublicBaseURL:   "https://cdn.example.com/images",
		CDNAuthKey:      "cdn-secret",
	})
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}

	signed, err := store.PresignGetDownloadURL(context.Background(), "prefix/sample.png", 2*time.Minute, "sample.png")
	if err != nil {
		t.Fatalf("PresignGetDownloadURL() error = %v", err)
	}
	if strings.Contains(signed, "X-Amz-Signature=") {
		t.Fatalf("CDN URL should not be S3-presigned: %q", signed)
	}
	parsed, err := url.Parse(signed)
	if err != nil {
		t.Fatalf("url.Parse() error = %v", err)
	}
	if parsed.Scheme != "https" || parsed.Host != "cdn.example.com" || parsed.EscapedPath() != "/images/prefix/sample.png" {
		t.Fatalf("signed URL = %q", signed)
	}
	parts := strings.Split(parsed.Query().Get("sign"), "-")
	if len(parts) != 4 {
		t.Fatalf("sign = %q", parsed.Query().Get("sign"))
	}
	if parts[0] == "" || parts[1] == "" || parts[2] != "0" || parts[3] == "" {
		t.Fatalf("sign parts = %#v", parts)
	}
	sum := md5.Sum([]byte(parsed.EscapedPath() + "-" + parts[0] + "-" + parts[1] + "-" + parts[2] + "-cdn-secret"))
	if got, want := parts[3], hex.EncodeToString(sum[:]); got != want {
		t.Fatalf("md5hash = %q, want %q", got, want)
	}
}

func TestDownloadURLTTLFromEnvUsesCDNAuthTTL(t *testing.T) {
	t.Setenv(EnvImageObjectStoragePublicBase, "")
	t.Setenv(EnvImageObjectStorageCDNAuthKey, "")
	t.Setenv(EnvImageObjectStorageCDNAuthTTL, "")

	fallback := 5 * time.Minute
	if got := DownloadURLTTLFromEnv(fallback); got != fallback {
		t.Fatalf("DownloadURLTTLFromEnv() = %v, want %v", got, fallback)
	}

	t.Setenv(EnvImageObjectStoragePublicBase, "https://cdn.example.com")
	t.Setenv(EnvImageObjectStorageCDNAuthKey, "cdn-secret")
	t.Setenv(EnvImageObjectStorageCDNAuthTTL, "1800")
	if got := DownloadURLTTLFromEnv(fallback); got != 30*time.Minute {
		t.Fatalf("DownloadURLTTLFromEnv() = %v, want 30m", got)
	}
}
