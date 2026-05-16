package imagestore

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
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

func TestStoreUploadAndDeleteUsesS3CompatibleRequests(t *testing.T) {
	var seenPut, seenDelete bool
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
	if err := store.Delete(context.Background(), "prefix/sample.png"); err != nil {
		t.Fatalf("Delete() error = %v", err)
	}
	if !seenPut || !seenDelete {
		t.Fatalf("seenPut=%v seenDelete=%v", seenPut, seenDelete)
	}
}
