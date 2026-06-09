package web

import (
	"embed"
	"io"
	"io/fs"
	"mime"
	"net/http"
	"path"
	"strconv"
	"strings"
)

//go:embed all:dist
var dist embed.FS

var staticFS = mustSubFS(dist, "dist")

func Handler() http.Handler {
	return handlerForFS(staticFS)
}

func handlerForFS(fsys fs.FS) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		clean := strings.Trim(strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/"), "/")
		if serveAsset(w, r, fsys, clean) {
			return
		}
		last := path.Base(clean)
		if strings.HasPrefix(clean, "assets/") || strings.Contains(last, ".") {
			http.NotFound(w, r)
			return
		}
		if serveAsset(w, r, fsys, "index.html") {
			return
		}
		http.NotFound(w, r)
	})
}

func serveAsset(w http.ResponseWriter, r *http.Request, fsys fs.FS, name string) bool {
	if name == "" {
		name = "index.html"
	}
	for _, candidate := range assetCandidates(name) {
		info, err := fs.Stat(fsys, candidate)
		if err == nil && !info.IsDir() {
			serveAssetFile(w, r, fsys, candidate)
			return true
		}
	}
	return false
}

func serveAssetFile(w http.ResponseWriter, r *http.Request, fsys fs.FS, name string) {
	setAssetCacheControl(w, name)
	if hasEncodedAssetVariant(fsys, name) {
		w.Header().Add("Vary", "Accept-Encoding")
	}
	if encodedName, encoding, ok := encodedAssetCandidate(fsys, r, name); ok {
		w.Header().Set("Content-Encoding", encoding)
		if contentType := mime.TypeByExtension(path.Ext(name)); contentType != "" {
			w.Header().Set("Content-Type", contentType)
		}
		serveFSContent(w, r, fsys, encodedName)
		return
	}
	serveFSContent(w, r, fsys, name)
}

func hasEncodedAssetVariant(fsys fs.FS, name string) bool {
	for _, suffix := range []string{".br", ".gz"} {
		if info, err := fs.Stat(fsys, name+suffix); err == nil && !info.IsDir() {
			return true
		}
	}
	return false
}

func encodedAssetCandidate(fsys fs.FS, r *http.Request, name string) (string, string, bool) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		return "", "", false
	}
	acceptEncoding := r.Header.Get("Accept-Encoding")
	for _, candidate := range []struct {
		suffix   string
		encoding string
	}{
		{suffix: ".br", encoding: "br"},
		{suffix: ".gz", encoding: "gzip"},
	} {
		if !acceptsEncoding(acceptEncoding, candidate.encoding) {
			continue
		}
		encodedName := name + candidate.suffix
		if info, err := fs.Stat(fsys, encodedName); err == nil && !info.IsDir() {
			return encodedName, candidate.encoding, true
		}
	}
	return "", "", false
}

func acceptsEncoding(header, encoding string) bool {
	for _, item := range strings.Split(header, ",") {
		parts := strings.Split(item, ";")
		token := strings.TrimSpace(parts[0])
		if token == "" {
			continue
		}
		if strings.EqualFold(token, encoding) || token == "*" {
			return encodingQuality(parts[1:]) > 0
		}
	}
	return false
}

func encodingQuality(params []string) float64 {
	for _, param := range params {
		key, value, ok := strings.Cut(strings.TrimSpace(param), "=")
		if !ok || !strings.EqualFold(strings.TrimSpace(key), "q") {
			continue
		}
		quality, err := strconv.ParseFloat(strings.TrimSpace(value), 64)
		if err != nil {
			return 1
		}
		return quality
	}
	return 1
}

func serveFSContent(w http.ResponseWriter, r *http.Request, fsys fs.FS, name string) {
	file, err := fsys.Open(name)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || info.IsDir() {
		http.NotFound(w, r)
		return
	}
	reader, ok := file.(io.ReadSeeker)
	if !ok {
		http.ServeFileFS(w, r, fsys, name)
		return
	}
	http.ServeContent(w, r, path.Base(name), info.ModTime(), reader)
}

func setAssetCacheControl(w http.ResponseWriter, name string) {
	if name == "index.html" || strings.HasSuffix(name, ".html") {
		w.Header().Set("Cache-Control", "no-cache")
		return
	}
	if strings.HasPrefix(name, "assets/") || isLongLivedAsset(name) {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	}
}

func isLongLivedAsset(name string) bool {
	switch strings.ToLower(path.Ext(name)) {
	case ".js", ".css", ".webp", ".ico", ".svg", ".png", ".jpg", ".jpeg", ".woff", ".woff2":
		return true
	default:
		return false
	}
}

func assetCandidates(name string) []string {
	if name == "index.html" {
		return []string{name}
	}
	return []string{name, path.Join(name, "index.html"), name + ".html"}
}

func mustSubFS(fsys fs.FS, dir string) fs.FS {
	sub, err := fs.Sub(fsys, dir)
	if err != nil {
		panic(err)
	}
	return sub
}
