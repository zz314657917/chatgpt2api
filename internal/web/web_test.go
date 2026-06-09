package web

import (
	"io/fs"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func TestHandlerServesEmbeddedSPA(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/settings", nil)
	res := httptest.NewRecorder()
	Handler().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("SPA route status = %d body = %s", res.Code, res.Body.String())
	}
	if !strings.Contains(res.Body.String(), `<div id="root"></div>`) {
		t.Fatalf("SPA route body missing root element: %q", res.Body.String())
	}
}

func TestHandlerKeepsMissingAssetsOutOfSPA(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/assets/missing.js", nil)
	res := httptest.NewRecorder()
	Handler().ServeHTTP(res, req)
	if res.Code != http.StatusNotFound {
		t.Fatalf("missing asset status = %d body = %s", res.Code, res.Body.String())
	}
}

func TestHandlerSetsCacheControlForSPAAndAssets(t *testing.T) {
	handler := handlerForFS(fstest.MapFS{
		"index.html": {
			Data: []byte(`<div id="root"></div>`),
			Mode: fs.ModePerm,
		},
		"assets/index-abc123.js": {
			Data: []byte(`console.log("ok")`),
			Mode: fs.ModePerm,
		},
	})

	req := httptest.NewRequest(http.MethodGet, "/settings", nil)
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if got := res.Header().Get("Cache-Control"); got != "no-cache" {
		t.Fatalf("SPA Cache-Control = %q, want no-cache", got)
	}

	req = httptest.NewRequest(http.MethodGet, "/assets/index-abc123.js", nil)
	res = httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if got := res.Header().Get("Cache-Control"); got != "public, max-age=31536000, immutable" {
		t.Fatalf("asset Cache-Control = %q, want long-lived immutable cache", got)
	}
}

func TestHandlerServesPrecompressedAssets(t *testing.T) {
	handler := handlerForFS(fstest.MapFS{
		"index.html": {
			Data: []byte(`<div id="root"></div>`),
			Mode: fs.ModePerm,
		},
		"assets/index-abc123.js": {
			Data: []byte(`plain`),
			Mode: fs.ModePerm,
		},
		"assets/index-abc123.js.br": {
			Data: []byte(`brotli`),
			Mode: fs.ModePerm,
		},
		"assets/index-abc123.js.gz": {
			Data: []byte(`gzip`),
			Mode: fs.ModePerm,
		},
	})

	req := httptest.NewRequest(http.MethodGet, "/assets/index-abc123.js", nil)
	req.Header.Set("Accept-Encoding", "gzip, br")
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if got := res.Header().Get("Content-Encoding"); got != "br" {
		t.Fatalf("Content-Encoding = %q, want br", got)
	}
	if got := res.Body.String(); got != "brotli" {
		t.Fatalf("encoded body = %q, want brotli", got)
	}
	if got := res.Header().Get("Content-Type"); !strings.HasPrefix(got, "text/javascript") {
		t.Fatalf("Content-Type = %q, want JavaScript type", got)
	}

	req = httptest.NewRequest(http.MethodGet, "/assets/index-abc123.js", nil)
	req.Header.Set("Accept-Encoding", "gzip")
	res = httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if got := res.Header().Get("Content-Encoding"); got != "gzip" {
		t.Fatalf("Content-Encoding = %q, want gzip", got)
	}
	if got := res.Body.String(); got != "gzip" {
		t.Fatalf("encoded body = %q, want gzip", got)
	}
}

func TestHandlerSkipsDisabledPrecompressedEncoding(t *testing.T) {
	handler := handlerForFS(fstest.MapFS{
		"index.html": {
			Data: []byte(`<div id="root"></div>`),
			Mode: fs.ModePerm,
		},
		"assets/index-abc123.js": {
			Data: []byte(`plain`),
			Mode: fs.ModePerm,
		},
		"assets/index-abc123.js.br": {
			Data: []byte(`brotli`),
			Mode: fs.ModePerm,
		},
		"assets/index-abc123.js.gz": {
			Data: []byte(`gzip`),
			Mode: fs.ModePerm,
		},
	})

	req := httptest.NewRequest(http.MethodGet, "/assets/index-abc123.js", nil)
	req.Header.Set("Accept-Encoding", "br;q=0, gzip")
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if got := res.Header().Get("Content-Encoding"); got != "gzip" {
		t.Fatalf("Content-Encoding = %q, want gzip", got)
	}
	if got := res.Body.String(); got != "gzip" {
		t.Fatalf("encoded body = %q, want gzip", got)
	}
}

func TestHandlerSetsVaryForAssetsWithPrecompressedVariants(t *testing.T) {
	handler := handlerForFS(fstest.MapFS{
		"index.html": {
			Data: []byte(`<div id="root"></div>`),
			Mode: fs.ModePerm,
		},
		"assets/index-abc123.js": {
			Data: []byte(`plain`),
			Mode: fs.ModePerm,
		},
		"assets/index-abc123.js.br": {
			Data: []byte(`brotli`),
			Mode: fs.ModePerm,
		},
	})

	req := httptest.NewRequest(http.MethodGet, "/assets/index-abc123.js", nil)
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	if got := res.Header().Get("Content-Encoding"); got != "" {
		t.Fatalf("Content-Encoding = %q, want empty", got)
	}
	if got := res.Header().Values("Vary"); strings.Join(got, ",") != "Accept-Encoding" {
		t.Fatalf("Vary = %q, want Accept-Encoding", got)
	}
	if got := res.Body.String(); got != "plain" {
		t.Fatalf("body = %q, want plain", got)
	}
}
