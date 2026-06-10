package imagestore

import (
	"bytes"
	"context"
	"crypto/md5"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	v4 "github.com/aws/aws-sdk-go-v2/aws/signer/v4"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

const (
	EnvImageStorageBackend            = "CHATGPT2API_IMAGE_STORAGE_BACKEND"
	EnvImageObjectStorageEndpoint     = "CHATGPT2API_IMAGE_OBJECT_STORAGE_ENDPOINT"
	EnvImageObjectStorageRegion       = "CHATGPT2API_IMAGE_OBJECT_STORAGE_REGION"
	EnvImageObjectStorageBucket       = "CHATGPT2API_IMAGE_OBJECT_STORAGE_BUCKET"
	EnvImageObjectStorageAccessKeyID  = "CHATGPT2API_IMAGE_OBJECT_STORAGE_ACCESS_KEY_ID"
	EnvImageObjectStorageSecretKey    = "CHATGPT2API_IMAGE_OBJECT_STORAGE_SECRET_ACCESS_KEY"
	EnvImageObjectStoragePrefix       = "CHATGPT2API_IMAGE_OBJECT_STORAGE_PREFIX"
	EnvImageObjectStorageForcePath    = "CHATGPT2API_IMAGE_OBJECT_STORAGE_FORCE_PATH_STYLE"
	EnvImageObjectStoragePublicBase   = "CHATGPT2API_IMAGE_OBJECT_STORAGE_PUBLIC_BASE_URL"
	EnvImageObjectStorageACL          = "CHATGPT2API_IMAGE_OBJECT_STORAGE_ACL"
	EnvImageObjectStorageCDNAuthKey   = "CHATGPT2API_IMAGE_OBJECT_STORAGE_CDN_AUTH_KEY"
	EnvImageObjectStorageCDNAuthParam = "CHATGPT2API_IMAGE_OBJECT_STORAGE_CDN_AUTH_PARAM"
	EnvImageObjectStorageCDNAuthTTL   = "CHATGPT2API_IMAGE_OBJECT_STORAGE_CDN_AUTH_TTL_SECONDS"
	defaultImageObjectStorageRegion   = "auto"
	defaultImageObjectStorageEndpoint = ""
	defaultCDNAuthParam               = "sign"
	defaultCDNAuthTTL                 = 30 * time.Minute
)

var cosRegionPattern = regexp.MustCompile(`(?:^|\.)cos\.([a-z0-9-]+)\.myqcloud\.com$`)

type Config struct {
	Backend         string
	Endpoint        string
	Region          string
	Bucket          string
	AccessKeyID     string
	SecretAccessKey string
	Prefix          string
	ForcePathStyle  bool
	PublicBaseURL   string
	ACL             string
	CDNAuthKey      string
	CDNAuthParam    string
	CDNAuthTTL      time.Duration
}

type Store struct {
	client *s3.Client
	cfg    Config
}

type StoredObject struct {
	Backend string
	Key     string
	URL     string
}

type ObjectData struct {
	Data        []byte
	ContentType string
}

func LoadConfigFromEnv() Config {
	return Config{
		Backend:         strings.TrimSpace(os.Getenv(EnvImageStorageBackend)),
		Endpoint:        strings.TrimSpace(os.Getenv(EnvImageObjectStorageEndpoint)),
		Region:          strings.TrimSpace(os.Getenv(EnvImageObjectStorageRegion)),
		Bucket:          strings.TrimSpace(os.Getenv(EnvImageObjectStorageBucket)),
		AccessKeyID:     strings.TrimSpace(os.Getenv(EnvImageObjectStorageAccessKeyID)),
		SecretAccessKey: strings.TrimSpace(os.Getenv(EnvImageObjectStorageSecretKey)),
		Prefix:          strings.TrimSpace(os.Getenv(EnvImageObjectStoragePrefix)),
		ForcePathStyle:  envBool(EnvImageObjectStorageForcePath),
		PublicBaseURL:   strings.TrimSpace(os.Getenv(EnvImageObjectStoragePublicBase)),
		ACL:             strings.TrimSpace(os.Getenv(EnvImageObjectStorageACL)),
		CDNAuthKey:      strings.TrimSpace(os.Getenv(EnvImageObjectStorageCDNAuthKey)),
		CDNAuthParam:    strings.TrimSpace(os.Getenv(EnvImageObjectStorageCDNAuthParam)),
		CDNAuthTTL:      envDurationSeconds(EnvImageObjectStorageCDNAuthTTL),
	}
}

func NewFromEnv(ctx context.Context) (*Store, bool, error) {
	cfg := LoadConfigFromEnv()
	if !cfg.Enabled() {
		return nil, false, nil
	}
	store, err := New(ctx, cfg)
	return store, true, err
}

func DeleteFromEnv(ctx context.Context, key string) error {
	key = strings.TrimSpace(key)
	if key == "" {
		return nil
	}
	store, enabled, err := NewFromEnv(ctx)
	if !enabled {
		return nil
	}
	if err != nil {
		return err
	}
	return store.Delete(ctx, key)
}

func GetBytesFromEnv(ctx context.Context, key string) (ObjectData, bool, error) {
	key = strings.TrimSpace(key)
	if key == "" {
		return ObjectData{}, false, nil
	}
	store, enabled, err := NewFromEnv(ctx)
	if !enabled {
		return ObjectData{}, false, nil
	}
	if err != nil {
		return ObjectData{}, true, err
	}
	data, err := store.GetBytes(ctx, key)
	return data, true, err
}

func PresignGetURLFromEnv(ctx context.Context, key string, expires time.Duration) (string, bool, error) {
	return PresignGetDownloadURLFromEnv(ctx, key, expires, "")
}

func PresignGetDownloadURLFromEnv(ctx context.Context, key string, expires time.Duration, filename string) (string, bool, error) {
	key = strings.TrimSpace(key)
	if key == "" {
		return "", false, nil
	}
	store, enabled, err := NewFromEnv(ctx)
	if !enabled {
		return "", false, nil
	}
	if err != nil {
		return "", true, err
	}
	u, err := store.PresignGetDownloadURL(ctx, key, expires, filename)
	return u, true, err
}

func DownloadURLTTLFromEnv(fallback time.Duration) time.Duration {
	cfg := LoadConfigFromEnv().normalized()
	if strings.TrimSpace(cfg.PublicBaseURL) == "" || strings.TrimSpace(cfg.CDNAuthKey) == "" {
		return fallback
	}
	if cfg.CDNAuthTTL > 0 {
		return cfg.CDNAuthTTL
	}
	return fallback
}

func New(ctx context.Context, cfg Config) (*Store, error) {
	cfg = cfg.normalized()
	if !cfg.Enabled() {
		return nil, errors.New("image object storage is not configured")
	}
	awsCfg, err := awsconfig.LoadDefaultConfig(ctx,
		awsconfig.WithRegion(cfg.Region),
		awsconfig.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(cfg.AccessKeyID, cfg.SecretAccessKey, ""),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("load object storage config: %w", err)
	}
	client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		if cfg.Endpoint != "" {
			o.BaseEndpoint = &cfg.Endpoint
		}
		o.UsePathStyle = cfg.ForcePathStyle
		o.APIOptions = append(o.APIOptions, v4.SwapComputePayloadSHA256ForUnsignedPayloadMiddleware)
		o.RequestChecksumCalculation = aws.RequestChecksumCalculationWhenRequired
		o.ResponseChecksumValidation = aws.ResponseChecksumValidationWhenRequired
	})
	return &Store{client: client, cfg: cfg}, nil
}

func (c Config) Enabled() bool {
	backend := normalizeBackend(c.Backend)
	if backend == "local" || backend == "none" || backend == "off" || backend == "disabled" {
		return false
	}
	return strings.TrimSpace(c.Bucket) != "" &&
		strings.TrimSpace(c.AccessKeyID) != "" &&
		strings.TrimSpace(c.SecretAccessKey) != "" &&
		(strings.TrimSpace(c.Endpoint) != "" || backend == "s3")
}

func (c Config) BackendName() string {
	backend := normalizeBackend(c.Backend)
	if backend == "" || backend == "auto" {
		if strings.Contains(strings.ToLower(c.Endpoint), "myqcloud.com") {
			return "cos"
		}
		return "s3"
	}
	return backend
}

func (c Config) ObjectKey(rel string) (string, error) {
	rel = filepath.ToSlash(strings.TrimSpace(rel))
	if rel == "" || strings.HasPrefix(rel, "/") || path.Clean(rel) != rel {
		return "", errors.New("invalid image object path")
	}
	for _, part := range strings.Split(rel, "/") {
		if part == "" || part == "." || part == ".." || strings.Contains(part, ":") {
			return "", errors.New("invalid image object path")
		}
	}
	prefix := cleanObjectPrefix(c.Prefix)
	if prefix == "" {
		return rel, nil
	}
	return path.Join(prefix, rel), nil
}

func (c Config) PublicURL(key string) string {
	key = strings.TrimLeft(filepath.ToSlash(strings.TrimSpace(key)), "/")
	if key == "" {
		return ""
	}
	if base := strings.TrimSpace(c.PublicBaseURL); base != "" {
		return joinURLPath(base, key)
	}
	if c.Endpoint != "" {
		u, err := parseEndpointURL(c.Endpoint)
		if err != nil {
			return ""
		}
		if c.ForcePathStyle {
			return joinParsedURLPath(u, path.Join(c.Bucket, key))
		}
		if !strings.HasPrefix(strings.ToLower(u.Host), strings.ToLower(c.Bucket)+".") {
			u.Host = c.Bucket + "." + u.Host
		}
		return joinParsedURLPath(u, key)
	}
	region := strings.TrimSpace(c.Region)
	if region == "" || region == defaultImageObjectStorageRegion {
		region = "us-east-1"
	}
	return joinURLPath("https://"+c.Bucket+".s3."+region+".amazonaws.com", key)
}

func (s *Store) ObjectKey(rel string) (string, error) {
	return s.cfg.ObjectKey(rel)
}

func (s *Store) UploadBytes(ctx context.Context, key string, data []byte, contentType string) (StoredObject, error) {
	if s == nil || s.client == nil {
		return StoredObject{}, errors.New("image object storage is not initialized")
	}
	key = strings.TrimLeft(filepath.ToSlash(strings.TrimSpace(key)), "/")
	if key == "" {
		return StoredObject{}, errors.New("image object key is empty")
	}
	contentType = strings.TrimSpace(contentType)
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	input := &s3.PutObjectInput{
		Bucket:      aws.String(s.cfg.Bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(data),
		ContentType: aws.String(contentType),
	}
	if acl := normalizeACL(s.cfg.ACL); acl != "" {
		input.ACL = types.ObjectCannedACL(acl)
	}
	if _, err := s.client.PutObject(ctx, input); err != nil {
		return StoredObject{}, fmt.Errorf("put image object: %w", err)
	}
	return StoredObject{Backend: s.cfg.BackendName(), Key: key, URL: s.cfg.PublicURL(key)}, nil
}

func (s *Store) Delete(ctx context.Context, key string) error {
	if s == nil || s.client == nil {
		return errors.New("image object storage is not initialized")
	}
	key = strings.TrimLeft(filepath.ToSlash(strings.TrimSpace(key)), "/")
	if key == "" {
		return nil
	}
	if _, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(s.cfg.Bucket),
		Key:    aws.String(key),
	}); err != nil {
		return fmt.Errorf("delete image object: %w", err)
	}
	return nil
}

func (s *Store) GetBytes(ctx context.Context, key string) (ObjectData, error) {
	if s == nil || s.client == nil {
		return ObjectData{}, errors.New("image object storage is not initialized")
	}
	key = strings.TrimLeft(filepath.ToSlash(strings.TrimSpace(key)), "/")
	if key == "" {
		return ObjectData{}, errors.New("image object key is empty")
	}
	output, err := s.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.cfg.Bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return ObjectData{}, fmt.Errorf("get image object: %w", err)
	}
	defer output.Body.Close()
	data, err := io.ReadAll(output.Body)
	if err != nil {
		return ObjectData{}, fmt.Errorf("read image object: %w", err)
	}
	contentType := ""
	if output.ContentType != nil {
		contentType = strings.TrimSpace(*output.ContentType)
	}
	return ObjectData{Data: data, ContentType: contentType}, nil
}

func (s *Store) PresignGetURL(ctx context.Context, key string, expires time.Duration) (string, error) {
	return s.PresignGetDownloadURL(ctx, key, expires, "")
}

func (s *Store) PresignGetDownloadURL(ctx context.Context, key string, expires time.Duration, filename string) (string, error) {
	if s == nil || s.client == nil {
		return "", errors.New("image object storage is not initialized")
	}
	key = strings.TrimLeft(filepath.ToSlash(strings.TrimSpace(key)), "/")
	if key == "" {
		return "", errors.New("image object key is empty")
	}
	if strings.TrimSpace(s.cfg.PublicBaseURL) != "" && strings.TrimSpace(s.cfg.CDNAuthKey) != "" {
		signedURL, err := signTencentCDNTypeAURL(s.cfg.PublicURL(key), s.cfg.CDNAuthKey, s.cfg.CDNAuthParam)
		if err != nil {
			return "", fmt.Errorf("sign CDN image object: %w", err)
		}
		return signedURL, nil
	}
	if expires <= 0 {
		expires = 5 * time.Minute
	}
	input := &s3.GetObjectInput{
		Bucket: aws.String(s.cfg.Bucket),
		Key:    aws.String(key),
	}
	if disposition := downloadContentDisposition(filename); disposition != "" {
		input.ResponseContentDisposition = aws.String(disposition)
	}
	presigner := s3.NewPresignClient(s.client)
	output, err := presigner.PresignGetObject(ctx, input, s3.WithPresignExpires(expires))
	if err != nil {
		return "", fmt.Errorf("presign image object: %w", err)
	}
	return output.URL, nil
}

func signTencentCDNTypeAURL(rawURL, secretKey, paramName string) (string, error) {
	secretKey = strings.TrimSpace(secretKey)
	if secretKey == "" {
		return "", errors.New("CDN auth key is empty")
	}
	paramName = strings.TrimSpace(paramName)
	if paramName == "" {
		paramName = defaultCDNAuthParam
	}
	u, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil {
		return "", err
	}
	uri := u.EscapedPath()
	if uri == "" {
		uri = "/"
	}
	timestamp := strconv.FormatInt(time.Now().Unix(), 10)
	nonce, err := cdnAuthNonce()
	if err != nil {
		return "", err
	}
	uid := "0"
	sum := md5.Sum([]byte(uri + "-" + timestamp + "-" + nonce + "-" + uid + "-" + secretKey))
	sign := timestamp + "-" + nonce + "-" + uid + "-" + hex.EncodeToString(sum[:])
	query := u.Query()
	query.Set(paramName, sign)
	u.RawQuery = query.Encode()
	return u.String(), nil
}

func cdnAuthNonce() (string, error) {
	var buf [8]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf[:]), nil
}

func downloadContentDisposition(filename string) string {
	filename = strings.TrimSpace(filepath.Base(filepath.ToSlash(filename)))
	if filename == "" || filename == "." || filename == "/" {
		return ""
	}
	quoted := strings.ReplaceAll(filename, `\`, `\\`)
	quoted = strings.ReplaceAll(quoted, `"`, `\"`)
	return `attachment; filename="` + quoted + `"; filename*=UTF-8''` + url.PathEscape(filename)
}

func (c Config) normalized() Config {
	c.Backend = normalizeBackend(c.Backend)
	if c.Backend == "" {
		c.Backend = "auto"
	}
	if c.Endpoint == "" {
		c.Endpoint = defaultImageObjectStorageEndpoint
	}
	if c.Region == "" {
		c.Region = deriveRegionFromEndpoint(c.Endpoint)
	}
	if c.Region == "" {
		c.Region = defaultImageObjectStorageRegion
	}
	c.Prefix = cleanObjectPrefix(c.Prefix)
	c.ACL = normalizeACL(c.ACL)
	c.PublicBaseURL = strings.TrimSpace(c.PublicBaseURL)
	c.CDNAuthKey = strings.TrimSpace(c.CDNAuthKey)
	c.CDNAuthParam = strings.TrimSpace(c.CDNAuthParam)
	if c.CDNAuthParam == "" {
		c.CDNAuthParam = defaultCDNAuthParam
	}
	if c.CDNAuthKey != "" && c.CDNAuthTTL <= 0 {
		c.CDNAuthTTL = defaultCDNAuthTTL
	}
	return c
}

func normalizeBackend(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func normalizeACL(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "", "default":
		return ""
	case "private":
		return string(types.ObjectCannedACLPrivate)
	case "public-read":
		return string(types.ObjectCannedACLPublicRead)
	case "public-read-write":
		return string(types.ObjectCannedACLPublicReadWrite)
	case "authenticated-read":
		return string(types.ObjectCannedACLAuthenticatedRead)
	case "bucket-owner-read":
		return string(types.ObjectCannedACLBucketOwnerRead)
	case "bucket-owner-full-control":
		return string(types.ObjectCannedACLBucketOwnerFullControl)
	default:
		return strings.TrimSpace(value)
	}
}

func cleanObjectPrefix(value string) string {
	value = strings.Trim(filepath.ToSlash(strings.TrimSpace(value)), "/")
	if value == "" || value == "." {
		return ""
	}
	parts := make([]string, 0, len(strings.Split(value, "/")))
	for _, part := range strings.Split(value, "/") {
		if part == "" || part == "." || part == ".." {
			continue
		}
		parts = append(parts, part)
	}
	return strings.Join(parts, "/")
}

func envBool(name string) bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv(name))) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

func envDurationSeconds(name string) time.Duration {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return 0
	}
	seconds, err := strconv.Atoi(value)
	if err != nil || seconds <= 0 {
		return 0
	}
	return time.Duration(seconds) * time.Second
}

func deriveRegionFromEndpoint(endpoint string) string {
	u, err := parseEndpointURL(endpoint)
	if err != nil {
		return ""
	}
	host := strings.ToLower(u.Hostname())
	if match := cosRegionPattern.FindStringSubmatch(host); len(match) == 2 {
		return match[1]
	}
	return ""
}

func parseEndpointURL(value string) (*url.URL, error) {
	text := strings.TrimSpace(value)
	if text == "" {
		return nil, errors.New("empty endpoint")
	}
	if !strings.Contains(text, "://") {
		text = "https://" + text
	}
	u, err := url.Parse(text)
	if err != nil {
		return nil, err
	}
	if u.Scheme == "" {
		u.Scheme = "https"
	}
	if u.Host == "" {
		return nil, errors.New("invalid endpoint")
	}
	u.RawQuery = ""
	u.Fragment = ""
	return u, nil
}

func joinURLPath(base, rel string) string {
	u, err := parseEndpointURL(base)
	if err != nil {
		return strings.TrimRight(base, "/") + "/" + strings.TrimLeft(filepath.ToSlash(rel), "/")
	}
	return joinParsedURLPath(u, rel)
}

func joinParsedURLPath(u *url.URL, rel string) string {
	if u == nil {
		return ""
	}
	out := *u
	rel = strings.TrimLeft(filepath.ToSlash(strings.TrimSpace(rel)), "/")
	basePath := strings.TrimRight(out.Path, "/")
	if rel == "" {
		out.Path = basePath
	} else if basePath == "" {
		out.Path = "/" + rel
	} else {
		out.Path = basePath + "/" + rel
	}
	out.RawPath = ""
	out.RawQuery = ""
	out.Fragment = ""
	return out.String()
}

func UploadTimeoutContext() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 2*time.Minute)
}

func DeleteTimeoutContext() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 30*time.Second)
}
