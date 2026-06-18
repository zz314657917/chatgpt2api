package service

import (
	"bytes"
	"context"
	"crypto/md5"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	_ "image/gif"
	"image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"chatgpt2api/internal/imagestore"
	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

const (
	ThumbnailSize            = 480
	ImagePreviewSize         = 1200
	thumbnailQuality         = 72
	imagePreviewQuality      = 82
	thumbnailCacheVersion    = 3
	imagePreviewCacheVersion = 1
	thumbnailExtension       = ".jpg"
	imageReferencePrefix     = "references"
	imageReferenceMarker     = ".refs/"
	tempImageReferencePrefix = "temp-references"

	ImageVisibilityPrivate = "private"
	ImageVisibilityPublic  = "public"

	ImageCollectionUnclassifiedID = "__unclassified__"

	imageIndexDocumentName         = "image_index.json"
	imageCollectionsDocumentName   = "image_collections.json"
	tempImageReferenceDocumentName = "temp_image_references.json"
	imageIndexVersion              = 1
	defaultImagePageSize           = 50
	maxImagePageSize               = 100
	tempImageReferenceRetention    = 48 * time.Hour
	ImageLibraryScopePersonal      = "personal"
	ImageLibraryScopeTeam          = "team"
	DefaultTeamStorageLimitBytes   = int64(2 * 1024 * 1024 * 1024)
	defaultImageDownloadURLTTL     = 5 * time.Minute
)

type ImageConfig interface {
	ImagesDir() string
	ImageThumbnailsDir() string
	ImagePreviewsDir() string
	ImageMetadataDir() string
	ImageRetentionDays() int
	ImageStorageLimitBytes() int64
	ImageMaxSavedPerUser() int
}

type ImageAccessScope struct {
	OwnerID     string
	TeamID      string
	TeamManager bool
	All         bool
	Public      bool
}

type TeamImageStorageSummary struct {
	TeamID         string `json:"team_id"`
	UsedBytes      int64  `json:"used_bytes"`
	LimitBytes     int64  `json:"limit_bytes"`
	RemainingBytes int64  `json:"remaining_bytes"`
	ImagesCount    int    `json:"images_count"`
}

type TeamStorageQuotaExceededError struct {
	UsedBytes     int64
	LimitBytes    int64
	RequiredBytes int64
}

func (e TeamStorageQuotaExceededError) Error() string {
	return "team storage quota exceeded"
}

type ImageDownloadURL struct {
	URL       string
	ExpiresAt string
	Direct    bool
}

type imageMetadata struct {
	OwnerID           string
	OwnerName         string
	LibraryScope      string
	CollectionID      string
	CollectionName    string
	TeamID            string
	TeamName          string
	MovedByUserID     string
	MovedAt           string
	Visibility        string
	PublishedAt       string
	StorageBackend    string
	ObjectKey         string
	ObjectURL         string
	Tags              []string
	Prompt            string
	Model             string
	Quality           string
	ResolutionPreset  string
	RequestedSize     string
	OutputFormat      string
	OutputCompression *int
	Background        string
	Moderation        string
	Style             string
	PartialImages     *int
	InputImageMask    string
	ReferenceImages   []imageReferenceMetadata
	ProfessionalMode  bool
	ProStudio         map[string]any
	OfficialSettings  map[string]any
	SharePromptParams bool
	ShareReferences   bool
}

type GeneratedImageMetadata struct {
	Prompt            string
	Model             string
	Quality           string
	ResolutionPreset  string
	RequestedSize     string
	OutputFormat      string
	OutputCompression *int
	Background        string
	Moderation        string
	Style             string
	PartialImages     *int
	InputImageMask    string
	ReferenceImages   []GeneratedImageReference
	ProfessionalMode  bool
	ProStudio         map[string]any
	OfficialSettings  map[string]any
	SharePromptParams bool
	ShareReferences   bool
}

type GeneratedImageReference struct {
	Filename    string
	ContentType string
	Data        []byte
}

type UploadedManagedImage struct {
	Filename    string
	ContentType string
	Data        []byte
}

type UploadedTempReferenceImage struct {
	ClientReferenceID string
	ConversationID    string
	TurnID            string
	Filename          string
	ContentType       string
	Data              []byte
}

type TempReferenceImage struct {
	ID                string
	OwnerID           string
	ClientReferenceID string
	ConversationID    string
	TurnID            string
	Filename          string
	ContentType       string
	Path              string
	Size              int64
	Width             int
	Height            int
	CreatedAt         string
	ExpiresAt         string
}

type ImageStorageCleanupOptions struct {
	RetentionDays    int
	MaxBytes         int64
	MaxImagesPerUser int
	ClearThumbnails  bool
	IncludePublic    bool
}

type ImageStorageGovernanceSummary struct {
	TotalBytes         int64  `json:"total_bytes"`
	ImagesBytes        int64  `json:"images_bytes"`
	ThumbnailsBytes    int64  `json:"thumbnails_bytes"`
	PreviewsBytes      int64  `json:"previews_bytes"`
	MetadataBytes      int64  `json:"metadata_bytes"`
	ReferenceBytes     int64  `json:"reference_bytes"`
	ImagesCount        int    `json:"images_count"`
	PublicImagesCount  int    `json:"public_images_count"`
	PrivateImagesCount int    `json:"private_images_count"`
	ThumbnailFiles     int    `json:"thumbnail_files"`
	PreviewFiles       int    `json:"previews_files"`
	MetadataFiles      int    `json:"metadata_files"`
	ReferenceFiles     int    `json:"reference_files"`
	LimitBytes         int64  `json:"limit_bytes"`
	OverLimitBytes     int64  `json:"over_limit_bytes"`
	OldestImageAt      string `json:"oldest_image_at,omitempty"`
	LatestImageAt      string `json:"latest_image_at,omitempty"`
}

type ImageStorageCleanupResult struct {
	RetentionDays         int    `json:"retention_days,omitempty"`
	MaxBytes              int64  `json:"max_bytes,omitempty"`
	MaxImagesPerUser      int    `json:"max_images_per_user,omitempty"`
	IncludePublic         bool   `json:"include_public,omitempty"`
	DeletedImages         int    `json:"deleted_images"`
	DeletedThumbnails     int    `json:"deleted_thumbnails"`
	DeletedPreviews       int    `json:"deleted_previews"`
	DeletedMetadataFiles  int    `json:"deleted_metadata_files"`
	DeletedReferenceFiles int    `json:"deleted_reference_files"`
	DeletedBytes          int64  `json:"deleted_bytes"`
	RemainingBytes        int64  `json:"remaining_bytes"`
	OverLimitBytes        int64  `json:"over_limit_bytes"`
	PreservedPublicImages int    `json:"preserved_public_images,omitempty"`
	Action                string `json:"action,omitempty"`
}

type imageReferenceMetadata struct {
	Path        string
	Filename    string
	ContentType string
	Size        int64
}

type ImageFileAccess struct {
	Rel          string
	Path         string
	Info         os.FileInfo
	Data         []byte
	ContentType  string
	Visibility   string
	OwnerID      string
	LibraryScope string
	TeamID       string
}

type ImageReferenceFileAccess struct {
	Rel          string
	SourceRel    string
	Path         string
	ContentType  string
	Visibility   string
	OwnerID      string
	LibraryScope string
	TeamID       string
	Shared       bool
}

type ImageVisibilityUpdateOptions struct {
	SharePromptParams bool
	ShareReferences   bool
}

type ImageListOptions struct {
	StartDate        string
	EndDate          string
	PageSize         int
	Cursor           string
	Search           string
	Visibility       string
	Format           string
	Orientation      string
	ResolutionPreset string
	AspectRatio      string
	CollectionID     string
	Tags             []string
}

type ImageCollection struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	LibraryScope string `json:"library_scope"`
	OwnerID      string `json:"owner_id,omitempty"`
	TeamID       string `json:"team_id,omitempty"`
	TeamName     string `json:"team_name,omitempty"`
	CreatedAt    string `json:"created_at"`
	UpdatedAt    string `json:"updated_at"`
	ImagesCount  int    `json:"images_count"`
}

type ImageCollectionsResult struct {
	Items             []ImageCollection `json:"items"`
	UnclassifiedCount int               `json:"unclassified_count"`
}

type imageCollectionDocument struct {
	Version   int               `json:"version"`
	UpdatedAt string            `json:"updated_at"`
	Items     []ImageCollection `json:"items"`
}

type ImageService struct {
	config        ImageConfig
	store         storage.JSONDocumentBackend
	logger        *Logger
	thumbnailMu   sync.Mutex
	thumbnailJobs map[string]*thumbnailJob
	indexMu       sync.RWMutex
	indexLoaded   bool
	imageIndex    map[string]imageIndexEntry
}

type imageFileRef struct {
	rel         string
	path        string
	info        os.FileInfo
	meta        imageMetadata
	data        []byte
	contentType string
	fromStore   bool
}

type memoryFileInfo struct {
	name    string
	size    int64
	modTime time.Time
}

func (i memoryFileInfo) Name() string       { return i.name }
func (i memoryFileInfo) Size() int64        { return i.size }
func (i memoryFileInfo) Mode() os.FileMode  { return 0 }
func (i memoryFileInfo) ModTime() time.Time { return i.modTime }
func (i memoryFileInfo) IsDir() bool        { return false }
func (i memoryFileInfo) Sys() any           { return nil }

type thumbnailJob struct {
	done   chan struct{}
	result map[string]any
}

type imageCleanupCandidate struct {
	rel       string
	path      string
	info      os.FileInfo
	meta      imageMetadata
	groupSize int64
}

type imageStorageRemovalStats struct {
	bytes          int64
	images         int
	thumbnails     int
	previews       int
	metadataFiles  int
	referenceFiles int
	imagePaths     []string
}

type imageIndexDocument struct {
	Version   int               `json:"version"`
	UpdatedAt string            `json:"updated_at"`
	Items     []imageIndexEntry `json:"items"`
}

type imageIndexEntry struct {
	Path              string   `json:"path"`
	Name              string   `json:"name"`
	Date              string   `json:"date"`
	Size              int64    `json:"size"`
	CreatedAt         string   `json:"created_at"`
	CreatedUnixNano   int64    `json:"created_unix_nano"`
	ModifiedUnixNano  int64    `json:"modified_unix_nano"`
	OwnerID           string   `json:"owner_id,omitempty"`
	OwnerName         string   `json:"owner_name,omitempty"`
	LibraryScope      string   `json:"library_scope,omitempty"`
	CollectionID      string   `json:"collection_id,omitempty"`
	CollectionName    string   `json:"collection_name,omitempty"`
	TeamID            string   `json:"team_id,omitempty"`
	TeamName          string   `json:"team_name,omitempty"`
	MovedByUserID     string   `json:"moved_by_user_id,omitempty"`
	MovedAt           string   `json:"moved_at,omitempty"`
	Visibility        string   `json:"visibility"`
	PublishedAt       string   `json:"published_at,omitempty"`
	PublishedUnixNano int64    `json:"published_unix_nano,omitempty"`
	StorageBackend    string   `json:"storage_backend,omitempty"`
	ObjectKey         string   `json:"object_key,omitempty"`
	ObjectURL         string   `json:"object_url,omitempty"`
	Tags              []string `json:"tags,omitempty"`
	OutputFormat      string   `json:"output_format,omitempty"`
	Width             int      `json:"width,omitempty"`
	Height            int      `json:"height,omitempty"`
}

type imageListCursor struct {
	SortUnixNano int64  `json:"sort_unix_nano"`
	Path         string `json:"path"`
}

func NewImageService(config ImageConfig, backend ...storage.Backend) *ImageService {
	return &ImageService{config: config, store: firstJSONDocumentStore(backend)}
}

func (s *ImageService) SetLogger(logger *Logger) {
	if s != nil {
		s.logger = logger
	}
}

func (s *ImageService) StorageGovernance() ImageStorageGovernanceSummary {
	summary := ImageStorageGovernanceSummary{LimitBytes: s.config.ImageStorageLimitBytes()}
	candidates := s.imageCleanupCandidates()
	for _, candidate := range candidates {
		summary.ImagesCount++
		summary.ImagesBytes += candidate.info.Size()
		if candidate.meta.Visibility == ImageVisibilityPublic {
			summary.PublicImagesCount++
		} else {
			summary.PrivateImagesCount++
		}
		created := candidate.info.ModTime().Format("2006-01-02 15:04:05")
		if summary.OldestImageAt == "" || created < summary.OldestImageAt {
			summary.OldestImageAt = created
		}
		if summary.LatestImageAt == "" || created > summary.LatestImageAt {
			summary.LatestImageAt = created
		}
	}
	summary.ThumbnailsBytes, summary.ThumbnailFiles, _ = thumbnailCacheStats(s.config.ImageThumbnailsDir())
	summary.PreviewsBytes, summary.PreviewFiles, _ = thumbnailCacheStats(s.config.ImagePreviewsDir())
	summary.MetadataBytes, summary.MetadataFiles = directorySize(s.config.ImageMetadataDir(), "")
	summary.ReferenceBytes, summary.ReferenceFiles = directorySize(s.imageReferencesDir(), "")
	summary.TotalBytes = summary.ImagesBytes + summary.ThumbnailsBytes + summary.PreviewsBytes + summary.MetadataBytes + summary.ReferenceBytes
	if summary.LimitBytes > 0 && summary.TotalBytes > summary.LimitBytes {
		summary.OverLimitBytes = summary.TotalBytes - summary.LimitBytes
	}
	return summary
}

func (s *ImageService) TeamStorageSummary(teamID string, limitBytes int64) TeamImageStorageSummary {
	teamID = strings.TrimSpace(teamID)
	if limitBytes <= 0 {
		limitBytes = DefaultTeamStorageLimitBytes
	}
	summary := TeamImageStorageSummary{TeamID: teamID, LimitBytes: limitBytes, RemainingBytes: limitBytes}
	if teamID == "" {
		return summary
	}
	for _, candidate := range s.imageCleanupCandidates() {
		if candidate.meta.LibraryScope != ImageLibraryScopeTeam || candidate.meta.TeamID != teamID {
			continue
		}
		summary.ImagesCount++
		summary.UsedBytes += candidate.groupSize
	}
	if limitBytes > 0 {
		summary.RemainingBytes = maxInt64(0, limitBytes-summary.UsedBytes)
	}
	return summary
}

func (s *ImageService) CleanupStorage(options ImageStorageCleanupOptions) (ImageStorageCleanupResult, error) {
	result := ImageStorageCleanupResult{
		RetentionDays:    options.RetentionDays,
		MaxBytes:         options.MaxBytes,
		MaxImagesPerUser: options.MaxImagesPerUser,
		IncludePublic:    options.IncludePublic,
	}
	if options.ClearThumbnails {
		stats, err := s.clearThumbnailCache()
		if err != nil {
			return result, err
		}
		previewStats, err := s.clearPreviewCache()
		if err != nil {
			return result, err
		}
		stats.add(previewStats)
		result.Action = "thumbnails"
		result.DeletedThumbnails += stats.thumbnails
		result.DeletedPreviews += stats.previews
		result.DeletedMetadataFiles += stats.metadataFiles
		result.DeletedBytes += stats.bytes
	}
	if options.RetentionDays > 0 {
		stats, preserved, err := s.cleanupByRetention(options.RetentionDays, options.IncludePublic)
		if err != nil {
			return result, err
		}
		if result.Action == "" {
			result.Action = "retention"
		}
		result.addRemovalStats(stats)
		s.removeImageIndexEntries(stats.imagePaths)
		result.PreservedPublicImages += preserved
	}
	if options.MaxImagesPerUser > 0 {
		stats, preserved, err := s.cleanupByUserImageLimit(options.MaxImagesPerUser, options.IncludePublic)
		if err != nil {
			return result, err
		}
		if result.Action == "" {
			result.Action = "user-limit"
		}
		result.addRemovalStats(stats)
		s.removeImageIndexEntries(stats.imagePaths)
		result.PreservedPublicImages += preserved
	}
	if options.MaxBytes > 0 {
		stats, preserved, err := s.cleanupByStorageLimit(options.MaxBytes, options.IncludePublic)
		if err != nil {
			return result, err
		}
		if result.Action == "" {
			result.Action = "quota"
		}
		result.addRemovalStats(stats)
		s.removeImageIndexEntries(stats.imagePaths)
		result.PreservedPublicImages += preserved
	}
	summary := s.StorageGovernance()
	result.RemainingBytes = summary.TotalBytes
	result.OverLimitBytes = summary.OverLimitBytes
	return result, nil
}

func (r *ImageStorageCleanupResult) addRemovalStats(stats imageStorageRemovalStats) {
	r.DeletedBytes += stats.bytes
	r.DeletedImages += stats.images
	r.DeletedThumbnails += stats.thumbnails
	r.DeletedPreviews += stats.previews
	r.DeletedMetadataFiles += stats.metadataFiles
	r.DeletedReferenceFiles += stats.referenceFiles
}

func (s *ImageService) ListImages(baseURL, startDate, endDate string, scope ImageAccessScope) map[string]any {
	return s.ListImagesPage(baseURL, ImageListOptions{StartDate: startDate, EndDate: endDate}, scope)
}

func (s *ImageService) ListImagesPage(baseURL string, options ImageListOptions, scope ImageAccessScope) map[string]any {
	pageSize := normalizedImagePageSize(options.PageSize)
	cursor, hasCursor := decodeImageListCursor(options.Cursor)
	s.ensureLocalImageIndexEntries()
	entries := s.imageIndexEntries()
	sort.Slice(entries, func(i, j int) bool {
		left := imageIndexSortUnixNano(entries[i], scope)
		right := imageIndexSortUnixNano(entries[j], scope)
		if left != right {
			return left > right
		}
		return strings.Compare(entries[i].Path, entries[j].Path) > 0
	})
	items := make([]map[string]any, 0, pageSize)
	nextCursor := ""
	lastCursor := imageListCursor{}
	hasMore := false
	missingIndexPaths := make([]string, 0)
	for _, entry := range entries {
		if !imageIndexEntryMatchesScope(entry, scope) || !imageIndexEntryMatchesOptions(entry, options) {
			continue
		}
		sortValue := imageIndexSortUnixNano(entry, scope)
		if hasCursor {
			if sortValue > cursor.SortUnixNano {
				continue
			}
			if sortValue == cursor.SortUnixNano && entry.Path >= cursor.Path {
				continue
			}
		}
		if !s.imageIndexEntryExists(entry) {
			missingIndexPaths = append(missingIndexPaths, entry.Path)
			continue
		}
		if len(items) >= pageSize {
			hasMore = true
			nextCursor = encodeImageListCursor(lastCursor)
			break
		}
		items = append(items, s.managedImageSummaryItem(baseURL, entry))
		lastCursor = imageListCursor{SortUnixNano: sortValue, Path: entry.Path}
	}
	s.removeImageIndexEntries(missingIndexPaths)
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
	return map[string]any{
		"items":       items,
		"groups":      groups,
		"next_cursor": nextCursor,
		"has_more":    hasMore,
		"page_size":   pageSize,
	}
}

func (s *ImageService) ensureLocalImageIndexEntries() {
	if s == nil || s.config == nil {
		return
	}
	_ = s.ensureImageIndexLoaded()
	root, err := filepath.Abs(s.config.ImagesDir())
	if err != nil {
		return
	}
	s.indexMu.RLock()
	known := make(map[string]struct{}, len(s.imageIndex))
	for rel := range s.imageIndex {
		known[rel] = struct{}{}
	}
	s.indexMu.RUnlock()
	var refs []imageFileRef
	_ = filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		rel, relErr := filepath.Rel(root, path)
		if relErr != nil {
			return nil
		}
		rel = filepath.ToSlash(rel)
		if _, ok := known[rel]; ok {
			return nil
		}
		ref, refErr := s.localImageFileRef(root, rel)
		if refErr != nil {
			return nil
		}
		refs = append(refs, ref)
		return nil
	})
	if len(refs) == 0 {
		return
	}
	s.indexMu.Lock()
	if s.imageIndex == nil {
		s.imageIndex = map[string]imageIndexEntry{}
	}
	for _, ref := range refs {
		s.imageIndex[ref.rel] = s.imageIndexEntryFromRef(ref)
	}
	s.indexLoaded = true
	entries := make([]imageIndexEntry, 0, len(s.imageIndex))
	for _, item := range s.imageIndex {
		entries = append(entries, item)
	}
	err = s.saveImageIndexEntriesLocked(entries)
	s.indexMu.Unlock()
	_ = err
}

func (s *ImageService) imageIndexEntryExists(entry imageIndexEntry) bool {
	if strings.TrimSpace(entry.Path) == "" {
		return false
	}
	if strings.TrimSpace(entry.ObjectKey) != "" {
		return true
	}
	imageRoot, err := filepath.Abs(s.config.ImagesDir())
	if err != nil {
		return false
	}
	_, err = s.localImageFileRef(imageRoot, entry.Path)
	return err == nil
}

func (s *ImageService) ImageDetail(baseURL, value string, scope ImageAccessScope) (map[string]any, error) {
	rel, err := imageRelativePathFromValue(value)
	if err != nil {
		return nil, err
	}
	imageRoot, err := filepath.Abs(s.config.ImagesDir())
	if err != nil {
		return nil, err
	}
	ref, err := s.imageFileRef(imageRoot, rel)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, errors.New("image not found")
		}
		return nil, err
	}
	meta := s.imageMetadata(ref.rel)
	if !imageMetadataAllowsAccess(meta, scope) {
		return nil, errors.New("image not found")
	}
	item := s.managedImageItem(baseURL, ref, ref.info, scope)
	s.refreshImageIndexEntry(ref.rel)
	return item, nil
}

func (s *ImageService) managedImageSummaryItem(baseURL string, entry imageIndexEntry) map[string]any {
	thumbURL := ""
	thumbPath := s.thumbnailPath(entry.Path)
	thumbRel := thumbnailRelativePath(s.config.ImageThumbnailsDir(), thumbPath)
	if thumbRel != "" {
		thumbURL = thumbnailURL(baseURL, thumbRel, time.Unix(0, entry.ModifiedUnixNano))
	}
	previewURLValue := ""
	previewPath := s.previewPath(entry.Path)
	previewRel := thumbnailRelativePath(s.config.ImagePreviewsDir(), previewPath)
	if previewRel != "" {
		previewURLValue = previewURL(baseURL, previewRel, time.Unix(0, entry.ModifiedUnixNano))
	}
	item := map[string]any{
		"name":        entry.Name,
		"path":        entry.Path,
		"date":        entry.Date,
		"size":        entry.Size,
		"preview_url": previewURLValue,
		"created_at":  unixNanoTimeString(entry.CreatedUnixNano),
		"visibility":  entry.Visibility,
		"tags":        append([]string(nil), entry.Tags...),
	}
	item["library_scope"] = normalizeImageLibraryScope(entry.LibraryScope)
	if entry.OwnerName != "" {
		item["owner_name"] = entry.OwnerName
	}
	if entry.CollectionID != "" {
		item["collection_id"] = entry.CollectionID
	}
	if entry.CollectionName != "" {
		item["collection_name"] = entry.CollectionName
	}
	if entry.TeamID != "" {
		item["team_id"] = entry.TeamID
	}
	if entry.TeamName != "" {
		item["team_name"] = entry.TeamName
	}
	if entry.MovedByUserID != "" {
		item["moved_by_user_id"] = entry.MovedByUserID
	}
	if entry.MovedAt != "" {
		item["moved_at"] = entry.MovedAt
	}
	if entry.PublishedAt != "" {
		item["published_at"] = entry.PublishedAt
	}
	if entry.Width > 0 && entry.Height > 0 {
		setImageItemDimensions(item, entry.Width, entry.Height)
	}
	item["thumbnail_url"] = thumbURL
	return item
}

func (s *ImageService) imageIndexEntries() []imageIndexEntry {
	if s == nil || s.config == nil {
		return nil
	}
	if err := s.ensureImageIndexLoaded(); err != nil {
		return nil
	}
	s.indexMu.RLock()
	defer s.indexMu.RUnlock()
	entries := make([]imageIndexEntry, 0, len(s.imageIndex))
	for _, entry := range s.imageIndex {
		entries = append(entries, entry)
	}
	return entries
}

func (s *ImageService) imageIndexEntry(rel string) (imageIndexEntry, bool) {
	rel = filepath.ToSlash(strings.TrimSpace(rel))
	if rel == "" || s == nil || s.config == nil {
		return imageIndexEntry{}, false
	}
	if err := s.ensureImageIndexLoaded(); err != nil {
		return imageIndexEntry{}, false
	}
	s.indexMu.RLock()
	defer s.indexMu.RUnlock()
	entry, ok := s.imageIndex[rel]
	return entry, ok
}

func (s *ImageService) resetImageIndex() {
	s.indexMu.Lock()
	s.indexLoaded = false
	s.imageIndex = nil
	s.indexMu.Unlock()
}

func (s *ImageService) ensureImageIndexLoaded() error {
	s.indexMu.RLock()
	loaded := s.indexLoaded
	s.indexMu.RUnlock()
	if loaded {
		return nil
	}
	s.indexMu.Lock()
	defer s.indexMu.Unlock()
	if s.indexLoaded {
		return nil
	}
	loadStarted := time.Now()
	entries, err := s.loadImageIndex()
	if err != nil {
		s.logImageIndexEvent("image index load failed", "error", err.Error(), "duration_ms", time.Since(loadStarted).Milliseconds())
		entries = nil
	} else {
		s.logImageIndexEvent("image index loaded", "items", len(entries), "duration_ms", time.Since(loadStarted).Milliseconds())
	}
	if len(entries) == 0 {
		rebuildStarted := time.Now()
		entries, err = s.rebuildImageIndexLocked()
		if err != nil {
			s.logImageIndexEvent("image index rebuild failed", "error", err.Error(), "duration_ms", time.Since(rebuildStarted).Milliseconds())
			return err
		}
		s.logImageIndexEvent("image index rebuilt", "items", len(entries), "duration_ms", time.Since(rebuildStarted).Milliseconds())
	}
	s.imageIndex = make(map[string]imageIndexEntry, len(entries))
	for _, entry := range entries {
		if entry.Path == "" {
			continue
		}
		s.imageIndex[entry.Path] = entry
	}
	s.indexLoaded = true
	return nil
}

func (s *ImageService) logImageIndexEvent(message string, attrs ...any) {
	if s == nil || s.logger == nil {
		return
	}
	s.logger.Info(message, attrs...)
}

func (s *ImageService) loadImageIndex() ([]imageIndexEntry, error) {
	if s.store != nil {
		value, err := s.store.LoadJSONDocument(imageIndexDocumentName)
		if err != nil || value == nil {
			return nil, err
		}
		return imageIndexEntriesFromValue(value)
	}
	path := s.imageIndexPath()
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var doc imageIndexDocument
	if err := json.Unmarshal(data, &doc); err != nil {
		return nil, err
	}
	if doc.Version != imageIndexVersion {
		return nil, errors.New("unsupported image index version")
	}
	return doc.Items, nil
}

func imageIndexEntriesFromValue(value any) ([]imageIndexEntry, error) {
	data, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	var doc imageIndexDocument
	if err := json.Unmarshal(data, &doc); err != nil {
		return nil, err
	}
	if doc.Version != imageIndexVersion {
		return nil, errors.New("unsupported image index version")
	}
	return doc.Items, nil
}

func (s *ImageService) rebuildImageIndexLocked() ([]imageIndexEntry, error) {
	root, err := filepath.Abs(s.config.ImagesDir())
	if err != nil {
		return nil, err
	}
	entries := make([]imageIndexEntry, 0)
	walkErr := filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		rel, err := filepath.Rel(root, path)
		if err != nil {
			return nil
		}
		rel = filepath.ToSlash(rel)
		ref, err := s.imageFileRef(root, rel)
		if err != nil {
			return nil
		}
		entries = append(entries, s.imageIndexEntryFromRef(ref))
		return nil
	})
	if walkErr != nil {
		return nil, walkErr
	}
	return entries, s.saveImageIndexEntriesLocked(entries)
}

func (s *ImageService) saveImageIndexEntriesLocked(entries []imageIndexEntry) error {
	doc := imageIndexDocument{
		Version:   imageIndexVersion,
		UpdatedAt: time.Now().UTC().Format(time.RFC3339Nano),
		Items:     entries,
	}
	if s.store != nil {
		return s.store.SaveJSONDocument(imageIndexDocumentName, doc)
	}
	path := s.imageIndexPath()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return writeJSONFile(path, doc)
}

func (s *ImageService) imageIndexPath() string {
	return filepath.Join(s.config.ImageMetadataDir(), imageIndexDocumentName)
}

func (s *ImageService) refreshImageIndexEntry(rel string) {
	ref, err := s.imageFileRef(s.config.ImagesDir(), rel)
	if err != nil {
		return
	}
	s.upsertImageIndexEntry(ref)
}

func (s *ImageService) upsertImageIndexEntry(ref imageFileRef) {
	if s == nil || s.config == nil || ref.rel == "" {
		return
	}
	_ = s.ensureImageIndexLoaded()
	entry := s.imageIndexEntryFromRef(ref)
	s.indexMu.Lock()
	if s.imageIndex == nil {
		s.imageIndex = map[string]imageIndexEntry{}
	}
	s.imageIndex[entry.Path] = entry
	s.indexLoaded = true
	entries := make([]imageIndexEntry, 0, len(s.imageIndex))
	for _, item := range s.imageIndex {
		entries = append(entries, item)
	}
	err := s.saveImageIndexEntriesLocked(entries)
	s.indexMu.Unlock()
	_ = err
}

func (s *ImageService) removeImageIndexEntries(paths []string) {
	if len(paths) == 0 || s == nil || s.config == nil {
		return
	}
	_ = s.ensureImageIndexLoaded()
	s.indexMu.Lock()
	if s.imageIndex == nil {
		s.imageIndex = map[string]imageIndexEntry{}
	}
	for _, rel := range paths {
		delete(s.imageIndex, rel)
	}
	s.indexLoaded = true
	entries := make([]imageIndexEntry, 0, len(s.imageIndex))
	for _, item := range s.imageIndex {
		entries = append(entries, item)
	}
	err := s.saveImageIndexEntriesLocked(entries)
	s.indexMu.Unlock()
	_ = err
}

func (s *ImageService) imageIndexEntryFromRef(ref imageFileRef) imageIndexEntry {
	meta := s.imageMetadata(ref.rel)
	if ref.meta.ObjectKey != "" && meta.ObjectKey == "" {
		meta = ref.meta
	}
	width, height, _ := imageRefDimensions(ref)
	created := ref.info.ModTime()
	publishedUnixNano := int64(0)
	if meta.PublishedAt != "" {
		if published, err := time.Parse(time.RFC3339Nano, meta.PublishedAt); err == nil {
			publishedUnixNano = published.UnixNano()
		}
	}
	visibility := meta.Visibility
	if visibility == "" {
		visibility = ImageVisibilityPrivate
	}
	outputFormat := meta.OutputFormat
	if outputFormat == "" {
		outputFormat = strings.TrimPrefix(strings.ToLower(filepath.Ext(ref.path)), ".")
		if outputFormat == "jpg" {
			outputFormat = "jpeg"
		}
	}
	return imageIndexEntry{
		Path:              ref.rel,
		Name:              filepath.Base(ref.path),
		Date:              imageDay(ref.rel, created),
		Size:              ref.info.Size(),
		CreatedAt:         created.Format("2006-01-02 15:04:05"),
		CreatedUnixNano:   created.UnixNano(),
		ModifiedUnixNano:  created.UnixNano(),
		OwnerID:           meta.OwnerID,
		OwnerName:         meta.OwnerName,
		LibraryScope:      meta.LibraryScope,
		CollectionID:      meta.CollectionID,
		CollectionName:    meta.CollectionName,
		TeamID:            meta.TeamID,
		TeamName:          meta.TeamName,
		MovedByUserID:     meta.MovedByUserID,
		MovedAt:           meta.MovedAt,
		Visibility:        visibility,
		PublishedAt:       meta.PublishedAt,
		PublishedUnixNano: publishedUnixNano,
		StorageBackend:    meta.StorageBackend,
		ObjectKey:         meta.ObjectKey,
		ObjectURL:         meta.ObjectURL,
		Tags:              append([]string(nil), meta.Tags...),
		OutputFormat:      outputFormat,
		Width:             width,
		Height:            height,
	}
}

func (s *ImageService) managedImageItem(baseURL string, ref imageFileRef, info os.FileInfo, scope ImageAccessScope) map[string]any {
	day := imageDay(ref.rel, info.ModTime())
	meta := s.imageMetadata(ref.rel)
	if ref.meta.ObjectKey != "" && meta.ObjectKey == "" {
		meta = ref.meta
	}
	thumb := s.thumbnailInfo(ref.rel, info)
	preview := s.previewInfo(ref.rel, info)
	item := map[string]any{
		"name":       filepath.Base(ref.path),
		"path":       ref.rel,
		"date":       day,
		"size":       info.Size(),
		"url":        publicAssetURL(baseURL, "images", ref.rel),
		"created_at": info.ModTime().Format("2006-01-02 15:04:05"),
		"visibility": meta.Visibility,
		"tags":       append([]string(nil), meta.Tags...),
	}
	item["library_scope"] = meta.LibraryScope
	addImageMetadataFields(item, meta, imageMetadataFieldOptions{
		BaseURL:                baseURL,
		IncludeReusableFields:  !scope.Public || meta.SharePromptParams,
		IncludeReferenceImages: !scope.Public || meta.ShareReferences,
	})
	if thumbRel, ok := thumb["thumbnail_rel"].(string); ok && thumbRel != "" {
		item["thumbnail_url"] = thumbnailURL(baseURL, thumbRel, info.ModTime())
	} else {
		item["thumbnail_url"] = ""
	}
	if previewRel, ok := preview["preview_rel"].(string); ok && previewRel != "" {
		item["preview_url"] = previewURL(baseURL, previewRel, info.ModTime())
	} else {
		item["preview_url"] = ""
	}
	if !setImageItemDimensions(item, thumb["width"], thumb["height"]) {
		if width, height, ok := imageRefDimensions(ref); ok {
			setImageItemDimensions(item, width, height)
		}
	}
	return item
}

func normalizedImagePageSize(value int) int {
	if value <= 0 {
		return defaultImagePageSize
	}
	if value > maxImagePageSize {
		return maxImagePageSize
	}
	return value
}

func imageIndexSortUnixNano(entry imageIndexEntry, scope ImageAccessScope) int64 {
	if scope.Public && entry.PublishedUnixNano > 0 {
		return entry.PublishedUnixNano
	}
	if entry.CreatedUnixNano > 0 {
		return entry.CreatedUnixNano
	}
	return entry.ModifiedUnixNano
}

func imageIndexEntryMatchesScope(entry imageIndexEntry, scope ImageAccessScope) bool {
	if scope.Public {
		return entry.Visibility == ImageVisibilityPublic
	}
	if scope.All {
		return true
	}
	if scope.TeamID != "" {
		return normalizeImageLibraryScope(entry.LibraryScope) == ImageLibraryScopeTeam && entry.TeamID == scope.TeamID
	}
	return scope.OwnerID != "" && normalizeImageLibraryScope(entry.LibraryScope) == ImageLibraryScopePersonal && entry.OwnerID == scope.OwnerID
}

func normalizeImageLibraryScope(scope string) string {
	if strings.TrimSpace(scope) == ImageLibraryScopeTeam {
		return ImageLibraryScopeTeam
	}
	return ImageLibraryScopePersonal
}

func imageIndexEntryMatchesOptions(entry imageIndexEntry, options ImageListOptions) bool {
	startDate := strings.TrimSpace(options.StartDate)
	endDate := strings.TrimSpace(options.EndDate)
	if startDate != "" && entry.Date < startDate {
		return false
	}
	if endDate != "" && entry.Date > endDate {
		return false
	}
	if visibility := strings.TrimSpace(options.Visibility); visibility != "" && visibility != "all" && entry.Visibility != visibility {
		return false
	}
	if format := strings.TrimSpace(strings.ToLower(options.Format)); format != "" && format != "all" && imageIndexFormat(entry) != format {
		return false
	}
	if orientation := strings.TrimSpace(strings.ToLower(options.Orientation)); orientation != "" && orientation != "all" && imageIndexOrientation(entry) != orientation {
		return false
	}
	if preset := NormalizeImageResolutionPreset(options.ResolutionPreset); preset != "" && imageIndexResolutionFilter(entry) != preset {
		return false
	}
	if ratio := strings.TrimSpace(strings.ToLower(options.AspectRatio)); ratio != "" && ratio != "all" && imageIndexAspectRatioFilter(entry) != ratio {
		return false
	}
	if collectionID := normalizeImageCollectionID(options.CollectionID); collectionID != "" {
		if collectionID == ImageCollectionUnclassifiedID {
			if entry.CollectionID != "" {
				return false
			}
		} else if entry.CollectionID != collectionID {
			return false
		}
	}
	if len(options.Tags) > 0 && !imageTagsContainAll(entry.Tags, options.Tags) {
		return false
	}
	keyword := strings.ToLower(strings.TrimSpace(options.Search))
	if keyword != "" && !imageIndexEntryContainsKeyword(entry, keyword) {
		return false
	}
	return true
}

func imageIndexEntryContainsKeyword(entry imageIndexEntry, keyword string) bool {
	values := []string{
		entry.Name,
		entry.Path,
		entry.Date,
		entry.CreatedAt,
		entry.OwnerID,
		entry.OwnerName,
		entry.CollectionID,
		entry.CollectionName,
		entry.Visibility,
		entry.OutputFormat,
		entry.StorageBackend,
		entry.ObjectKey,
		entry.ObjectURL,
	}
	values = append(values, entry.Tags...)
	if entry.Width > 0 && entry.Height > 0 {
		values = append(values, strconv.Itoa(entry.Width)+"x"+strconv.Itoa(entry.Height), simplifiedAspectRatio(entry.Width, entry.Height))
	}
	for _, value := range values {
		if strings.Contains(strings.ToLower(value), keyword) {
			return true
		}
	}
	return false
}

func imageIndexFormat(entry imageIndexEntry) string {
	format := strings.ToLower(strings.TrimSpace(entry.OutputFormat))
	switch format {
	case "jpeg":
		return "jpg"
	case "png", "jpg", "webp", "gif":
		return format
	}
	ext := strings.TrimPrefix(strings.ToLower(filepath.Ext(entry.Name)), ".")
	switch ext {
	case "jpeg":
		return "jpg"
	case "png", "jpg", "webp", "gif":
		return ext
	default:
		return "other"
	}
}

func imageIndexOrientation(entry imageIndexEntry) string {
	if entry.Width <= 0 || entry.Height <= 0 {
		return "unknown"
	}
	return imageOrientation(entry.Width, entry.Height)
}

func imageIndexResolutionFilter(entry imageIndexEntry) string {
	if entry.Width <= 0 || entry.Height <= 0 {
		return "unknown"
	}
	longSide := entry.Width
	shortSide := entry.Height
	if shortSide > longSide {
		longSide, shortSide = shortSide, longSide
	}
	if longSide >= 3200 || shortSide >= 2400 {
		return "4k"
	}
	if longSide >= 1600 || shortSide >= 1400 {
		return "2k"
	}
	return "1080p"
}

func imageIndexAspectRatioFilter(entry imageIndexEntry) string {
	if entry.Width <= 0 || entry.Height <= 0 {
		return "unknown"
	}
	ratio := simplifiedAspectRatio(entry.Width, entry.Height)
	switch ratio {
	case "1:1", "4:3", "3:4", "16:9", "9:16":
		return ratio
	default:
		return "other"
	}
}

func unixNanoTimeString(value int64) string {
	if value <= 0 {
		return ""
	}
	return time.Unix(0, value).Format("2006-01-02 15:04:05")
}

func encodeImageListCursor(cursor imageListCursor) string {
	if cursor.SortUnixNano <= 0 || cursor.Path == "" {
		return ""
	}
	data, err := json.Marshal(cursor)
	if err != nil {
		return ""
	}
	return base64.RawURLEncoding.EncodeToString(data)
}

func decodeImageListCursor(value string) (imageListCursor, bool) {
	text := strings.TrimSpace(value)
	if text == "" {
		return imageListCursor{}, false
	}
	data, err := base64.RawURLEncoding.DecodeString(text)
	if err != nil {
		return imageListCursor{}, false
	}
	var cursor imageListCursor
	if json.Unmarshal(data, &cursor) != nil || cursor.SortUnixNano <= 0 || strings.TrimSpace(cursor.Path) == "" {
		return imageListCursor{}, false
	}
	return cursor, true
}

func (s *ImageService) StoreUploadedImage(baseURL string, upload UploadedManagedImage, ownerID, ownerName, visibility string) (map[string]any, error) {
	if s == nil || s.config == nil {
		return nil, errors.New("image service is not initialized")
	}
	if len(upload.Data) == 0 {
		return nil, errors.New("image file is empty")
	}
	if _, _, err := image.DecodeConfig(bytes.NewReader(upload.Data)); err != nil {
		return nil, errors.New("unsupported image file")
	}
	normalizedVisibility, err := NormalizeImageVisibility(visibility)
	if err != nil {
		return nil, err
	}
	contentType := uploadedImageContentType(upload.Data, upload.ContentType)
	ext := uploadedImageExtension(upload.Filename, contentType)
	now := time.Now()
	sum := md5.Sum(upload.Data)
	filename := fmt.Sprintf("%d_%s%s", now.UnixNano(), hex.EncodeToString(sum[:])[:16], ext)
	rel := filepath.ToSlash(filepath.Join(now.Format("2006"), now.Format("01"), now.Format("02"), filename))
	target := filepath.Join(s.config.ImagesDir(), filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return nil, err
	}
	if err := os.WriteFile(target, upload.Data, 0o644); err != nil {
		return nil, err
	}
	ref, err := s.imageFileRef(s.config.ImagesDir(), rel)
	if err != nil {
		return nil, err
	}
	stored := s.uploadImageObject(rel, upload.Data, contentType)
	if err := s.writeUploadedImageMetadataForRef(ref, ownerID, ownerName, normalizedVisibility, strings.TrimPrefix(ext, "."), stored); err != nil {
		return nil, err
	}
	info, err := os.Stat(target)
	if err != nil {
		return nil, err
	}
	ref.info = info
	s.upsertImageIndexEntry(ref)
	item := s.managedImageItem(baseURL, ref, info, ImageAccessScope{OwnerID: strings.TrimSpace(ownerID)})
	s.removeLocalOriginalIfObjectStored(ref.rel)
	return item, nil
}

func (s *ImageService) StoreTempReferenceImage(upload UploadedTempReferenceImage, ownerID string) (TempReferenceImage, error) {
	if s == nil || s.config == nil {
		return TempReferenceImage{}, errors.New("image service is not initialized")
	}
	ownerID = strings.TrimSpace(ownerID)
	if ownerID == "" {
		return TempReferenceImage{}, errors.New("owner_id is required")
	}
	clientReferenceID := strings.TrimSpace(upload.ClientReferenceID)
	if clientReferenceID == "" {
		return TempReferenceImage{}, errors.New("client_reference_id is required")
	}
	if len(upload.Data) == 0 {
		return TempReferenceImage{}, errors.New("image file is empty")
	}
	_ = s.CleanupTempReferenceImages()
	if existing, ok := s.tempReferenceByClientID(ownerID, clientReferenceID); ok {
		return existing, nil
	}
	config, _, err := image.DecodeConfig(bytes.NewReader(upload.Data))
	if err != nil {
		return TempReferenceImage{}, errors.New("unsupported image file")
	}
	contentType := uploadedImageContentType(upload.Data, upload.ContentType)
	ext := uploadedImageExtension(upload.Filename, contentType)
	now := time.Now().UTC()
	sum := md5.Sum(upload.Data)
	id := "ref_" + util.SHA1Short(ownerID+":"+clientReferenceID, 24)
	filename := fmt.Sprintf("%d_%s%s", now.UnixNano(), hex.EncodeToString(sum[:])[:16], ext)
	rel := filepath.ToSlash(filepath.Join(now.Format("2006"), now.Format("01"), now.Format("02"), filename))
	root, err := filepath.Abs(s.tempReferencesDir())
	if err != nil {
		return TempReferenceImage{}, err
	}
	target := filepath.Join(root, filepath.FromSlash(rel))
	if !pathInsideRoot(root, target) {
		return TempReferenceImage{}, errors.New("invalid image path")
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return TempReferenceImage{}, err
	}
	if err := os.WriteFile(target, upload.Data, 0o644); err != nil {
		return TempReferenceImage{}, err
	}
	ref := TempReferenceImage{
		ID:                id,
		OwnerID:           ownerID,
		ClientReferenceID: clientReferenceID,
		ConversationID:    strings.TrimSpace(upload.ConversationID),
		TurnID:            strings.TrimSpace(upload.TurnID),
		Filename:          firstNonEmptyString(strings.TrimSpace(upload.Filename), "reference"+ext),
		ContentType:       contentType,
		Path:              rel,
		Size:              int64(len(upload.Data)),
		Width:             config.Width,
		Height:            config.Height,
		CreatedAt:         now.Format(time.RFC3339Nano),
		ExpiresAt:         now.Add(tempImageReferenceRetention).Format(time.RFC3339Nano),
	}
	if err := s.saveTempReferenceImage(ref); err != nil {
		_ = os.Remove(target)
		return TempReferenceImage{}, err
	}
	return ref, nil
}

func (s *ImageService) TempReferenceImageBytes(ids []string, ownerID string) ([]UploadedManagedImage, error) {
	ownerID = strings.TrimSpace(ownerID)
	if ownerID == "" {
		return nil, errors.New("owner_id is required")
	}
	if len(ids) == 0 {
		return nil, errors.New("reference_image_ids is required")
	}
	_ = s.CleanupTempReferenceImages()
	items := s.loadTempReferenceImages()
	byID := make(map[string]TempReferenceImage, len(items))
	for _, item := range items {
		byID[item.ID] = item
	}
	root, err := filepath.Abs(s.tempReferencesDir())
	if err != nil {
		return nil, err
	}
	out := make([]UploadedManagedImage, 0, len(ids))
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		item, ok := byID[id]
		if !ok {
			return nil, errors.New("reference image not found")
		}
		if item.OwnerID != ownerID {
			return nil, errors.New("permission denied")
		}
		path := filepath.Join(root, filepath.FromSlash(item.Path))
		if !pathInsideRoot(root, path) {
			return nil, errors.New("invalid image path")
		}
		data, err := os.ReadFile(path)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				return nil, errors.New("reference image not found")
			}
			return nil, err
		}
		if _, _, err := image.DecodeConfig(bytes.NewReader(data)); err != nil {
			return nil, errors.New("unsupported image file")
		}
		contentType := item.ContentType
		if !strings.HasPrefix(strings.ToLower(contentType), "image/") {
			contentType = http.DetectContentType(data)
		}
		out = append(out, UploadedManagedImage{
			Filename:    firstNonEmptyString(item.Filename, "reference.png"),
			ContentType: contentType,
			Data:        data,
		})
	}
	if len(out) == 0 {
		return nil, errors.New("reference_image_ids is required")
	}
	return out, nil
}

func (s *ImageService) CleanupTempReferenceImages() error {
	if s == nil || s.config == nil {
		return nil
	}
	now := time.Now().UTC()
	items := s.loadTempReferenceImages()
	next := make([]TempReferenceImage, 0, len(items))
	root, err := filepath.Abs(s.tempReferencesDir())
	if err != nil {
		return err
	}
	changed := false
	for _, item := range items {
		expiresAt, err := time.Parse(time.RFC3339Nano, item.ExpiresAt)
		expired := err != nil || !expiresAt.After(now)
		if expired {
			changed = true
			if item.Path != "" {
				path := filepath.Join(root, filepath.FromSlash(item.Path))
				if pathInsideRoot(root, path) {
					_ = os.Remove(path)
					removeEmptyParentDirs(root, filepath.Dir(path))
				}
			}
			continue
		}
		next = append(next, item)
	}
	if changed {
		return s.saveTempReferenceImages(next)
	}
	return nil
}

func (s *ImageService) UpdateImageVisibility(value, visibility string, scope ImageAccessScope, optionValues ...ImageVisibilityUpdateOptions) (map[string]any, error) {
	visibility, err := NormalizeImageVisibility(visibility)
	if err != nil {
		return nil, err
	}
	options := ImageVisibilityUpdateOptions{}
	if len(optionValues) > 0 {
		options = optionValues[0]
	}
	if visibility != ImageVisibilityPublic {
		options = ImageVisibilityUpdateOptions{}
	}
	rel, err := imageRelativePathFromValue(value)
	if err != nil {
		return nil, err
	}
	imageRoot, err := filepath.Abs(s.config.ImagesDir())
	if err != nil {
		return nil, err
	}
	ref, err := s.imageFileRef(imageRoot, rel)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, errors.New("image not found")
		}
		return nil, err
	}
	meta := s.imageMetadata(ref.rel)
	if !imageMetadataAllowsMutation(meta, scope) {
		return nil, errors.New("image not found")
	}
	if err := s.writeImageMetadataForRef(ref, "", "", visibility, GeneratedImageMetadata{
		SharePromptParams: options.SharePromptParams,
		ShareReferences:   options.ShareReferences,
	}); err != nil {
		return nil, err
	}
	s.upsertImageIndexEntry(ref)
	nextMeta := s.imageMetadata(ref.rel)
	item := map[string]any{
		"name":       filepath.Base(ref.path),
		"path":       ref.rel,
		"date":       imageDay(ref.rel, ref.info.ModTime()),
		"size":       ref.info.Size(),
		"visibility": nextMeta.Visibility,
		"created_at": ref.info.ModTime().Format("2006-01-02 15:04:05"),
	}
	addImageMetadataFields(item, nextMeta)
	if width, height, ok := imageRefDimensions(ref); ok {
		setImageItemDimensions(item, width, height)
	}
	return item, nil
}

func (s *ImageService) ImageFileAccess(value string, scope ImageAccessScope) (ImageFileAccess, error) {
	rel, err := imageRelativePathFromValue(value)
	if err != nil {
		return ImageFileAccess{}, err
	}
	imageRoot, err := filepath.Abs(s.config.ImagesDir())
	if err != nil {
		return ImageFileAccess{}, err
	}
	ref, err := s.imageFileRef(imageRoot, rel)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return ImageFileAccess{}, errors.New("image not found")
		}
		return ImageFileAccess{}, err
	}
	meta := s.imageMetadata(ref.rel)
	if !imageMetadataAllowsAccess(meta, scope) {
		return ImageFileAccess{}, errors.New("image not found")
	}
	return ImageFileAccess{
		Rel:          ref.rel,
		Path:         ref.path,
		Info:         ref.info,
		Data:         append([]byte(nil), ref.data...),
		ContentType:  ref.contentType,
		Visibility:   meta.Visibility,
		OwnerID:      meta.OwnerID,
		LibraryScope: meta.LibraryScope,
		TeamID:       meta.TeamID,
	}, nil
}

func (s *ImageService) ImageReferenceFileAccess(value string) (ImageReferenceFileAccess, error) {
	rel, err := imageReferenceRelativePathFromValue(value)
	if err != nil {
		return ImageReferenceFileAccess{}, err
	}
	sourceRel, err := sourceImageRelativePathFromReference(rel)
	if err != nil {
		return ImageReferenceFileAccess{}, err
	}
	meta := s.imageMetadata(sourceRel)
	var metadata imageReferenceMetadata
	for _, ref := range meta.ReferenceImages {
		if ref.Path == rel {
			metadata = ref
			break
		}
	}
	if metadata.Path == "" {
		return ImageReferenceFileAccess{}, errors.New("image not found")
	}
	root, err := filepath.Abs(s.imageReferencesDir())
	if err != nil {
		return ImageReferenceFileAccess{}, err
	}
	refPath := filepath.Join(root, filepath.FromSlash(rel))
	if !pathInsideRoot(root, refPath) {
		return ImageReferenceFileAccess{}, errors.New("invalid image path")
	}
	info, err := os.Stat(refPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return ImageReferenceFileAccess{}, errors.New("image not found")
		}
		return ImageReferenceFileAccess{}, err
	}
	if info.IsDir() {
		return ImageReferenceFileAccess{}, errors.New("image not found")
	}
	return ImageReferenceFileAccess{
		Rel:          rel,
		SourceRel:    sourceRel,
		Path:         refPath,
		ContentType:  metadata.ContentType,
		Visibility:   meta.Visibility,
		OwnerID:      meta.OwnerID,
		LibraryScope: meta.LibraryScope,
		TeamID:       meta.TeamID,
		Shared:       meta.ShareReferences,
	}, nil
}

func (s *ImageService) ImageBytes(value string, scope ImageAccessScope) ([]byte, string, error) {
	access, err := s.ImageFileAccess(value, scope)
	if err != nil {
		return nil, "", err
	}
	data := access.Data
	if len(data) == 0 {
		var err error
		data, err = os.ReadFile(access.Path)
		if err != nil {
			return nil, "", err
		}
	}
	mimeType := strings.TrimSpace(access.ContentType)
	if mimeType == "" {
		mimeType = http.DetectContentType(data)
	}
	if !strings.HasPrefix(mimeType, "image/") {
		return nil, "", errors.New("unsupported image file")
	}
	return data, mimeType, nil
}

func (s *ImageService) ImageDownloadURL(baseURL, value string, scope ImageAccessScope) (ImageDownloadURL, error) {
	rel, err := imageRelativePathFromValue(value)
	if err != nil {
		return ImageDownloadURL{}, err
	}
	meta := s.imageMetadata(rel)
	entry, hasEntry := s.imageIndexEntry(rel)
	if hasEntry {
		meta = mergeImageMetadataWithIndexEntry(meta, entry)
	}
	if !imageMetadataAllowsAccess(meta, scope) {
		return ImageDownloadURL{}, errors.New("image not found")
	}
	if meta.ObjectKey != "" {
		expires := imagestore.DownloadURLTTLFromEnv(defaultImageDownloadURLTTL)
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		u, enabled, signErr := imagestore.PresignGetDownloadURLFromEnv(ctx, meta.ObjectKey, expires, filepath.Base(filepath.FromSlash(rel)))
		cancel()
		if signErr != nil {
			return ImageDownloadURL{}, signErr
		}
		if enabled && strings.TrimSpace(u) != "" {
			return ImageDownloadURL{
				URL:       u,
				ExpiresAt: time.Now().UTC().Add(expires).Format(time.RFC3339),
				Direct:    true,
			}, nil
		}
	}
	imageRoot, err := filepath.Abs(s.config.ImagesDir())
	if err != nil {
		return ImageDownloadURL{}, err
	}
	if _, err := s.imageFileRef(imageRoot, rel); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return ImageDownloadURL{}, errors.New("image not found")
		}
		return ImageDownloadURL{}, err
	}
	return ImageDownloadURL{
		URL:    publicAssetURL(baseURL, "images", rel),
		Direct: false,
	}, nil
}

func (s *ImageService) DeleteImages(paths []string, scope ImageAccessScope) (map[string]any, error) {
	if len(paths) == 0 {
		return nil, errors.New("paths is required")
	}
	imageRoot, err := filepath.Abs(s.config.ImagesDir())
	if err != nil {
		return nil, err
	}

	seen := make(map[string]struct{}, len(paths))
	deleted := 0
	missing := 0
	removedPaths := make([]string, 0, len(paths))
	for _, value := range paths {
		rel, err := cleanImageRelativePath(value)
		if err != nil {
			return nil, err
		}
		if _, ok := seen[rel]; ok {
			continue
		}
		seen[rel] = struct{}{}

		ref, err := s.imageFileRef(imageRoot, rel)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				missing++
				continue
			}
			return nil, err
		}
		if !pathInsideRoot(imageRoot, filepath.Join(imageRoot, filepath.FromSlash(rel))) {
			return nil, errors.New("invalid image path")
		}
		meta := s.imageMetadata(ref.rel)
		if !imageMetadataAllowsMutation(meta, scope) {
			missing++
			continue
		}
		stats, err := s.removeImageGroup(rel)
		if err != nil {
			return nil, err
		}
		if stats.images == 0 && meta.ObjectKey == "" {
			missing++
		} else {
			deleted++
		}
		removedPaths = append(removedPaths, rel)
	}
	s.removeImageIndexEntries(removedPaths)
	return map[string]any{"deleted": deleted, "missing": missing, "paths": removedPaths}, nil
}

func (s *ImageService) removeLocalOriginalIfObjectStored(rel string) {
	rel, err := cleanImageRelativePath(rel)
	if err != nil {
		return
	}
	meta := s.imageMetadata(rel)
	if meta.ObjectKey == "" {
		return
	}
	imageRoot, err := filepath.Abs(s.config.ImagesDir())
	if err != nil {
		return
	}
	imagePath := filepath.Join(imageRoot, filepath.FromSlash(rel))
	if !pathInsideRoot(imageRoot, imagePath) {
		return
	}
	removed, _, err := removeFileWithStats(imagePath)
	if err != nil || !removed {
		return
	}
	removeEmptyParentDirs(imageRoot, filepath.Dir(imagePath))
}

func (s *ImageService) MoveImagesToTeamLibrary(paths []string, actorID, teamID, teamName string, limitBytes int64) (map[string]any, error) {
	actorID = strings.TrimSpace(actorID)
	teamID = strings.TrimSpace(teamID)
	teamName = strings.TrimSpace(teamName)
	if actorID == "" {
		return nil, errors.New("user session is required")
	}
	if teamID == "" {
		return nil, errors.New("team id is required")
	}
	if len(paths) == 0 {
		return nil, errors.New("paths is required")
	}
	if limitBytes <= 0 {
		limitBytes = DefaultTeamStorageLimitBytes
	}
	imageRoot, err := filepath.Abs(s.config.ImagesDir())
	if err != nil {
		return nil, err
	}
	type moveCandidate struct {
		ref       imageFileRef
		meta      imageMetadata
		groupSize int64
	}
	seen := make(map[string]struct{}, len(paths))
	candidates := make([]moveCandidate, 0, len(paths))
	requiredBytes := int64(0)
	for _, value := range paths {
		rel, err := cleanImageRelativePath(value)
		if err != nil {
			return nil, err
		}
		if _, ok := seen[rel]; ok {
			continue
		}
		seen[rel] = struct{}{}
		ref, err := s.imageFileRef(imageRoot, rel)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				return nil, errors.New("image not found")
			}
			return nil, err
		}
		meta := s.imageMetadata(ref.rel)
		if meta.LibraryScope == ImageLibraryScopeTeam {
			return nil, errors.New("image already in team library")
		}
		if meta.OwnerID == "" || meta.OwnerID != actorID {
			return nil, errors.New("image not found")
		}
		groupSize := s.imageGroupSize(ref.rel, ref.info.Size())
		candidates = append(candidates, moveCandidate{ref: ref, meta: meta, groupSize: groupSize})
		requiredBytes += groupSize
	}
	if len(candidates) == 0 {
		return nil, errors.New("paths is required")
	}
	storageBefore := s.TeamStorageSummary(teamID, limitBytes)
	if limitBytes > 0 && storageBefore.UsedBytes+requiredBytes > limitBytes {
		return nil, TeamStorageQuotaExceededError{
			UsedBytes:     storageBefore.UsedBytes,
			LimitBytes:    limitBytes,
			RequiredBytes: requiredBytes,
		}
	}
	movedPaths := make([]string, 0, len(candidates))
	movedAt := time.Now().UTC().Format(time.RFC3339Nano)
	for _, candidate := range candidates {
		meta := candidate.meta
		meta.LibraryScope = ImageLibraryScopeTeam
		meta.CollectionID = ""
		meta.CollectionName = ""
		meta.TeamID = teamID
		meta.TeamName = teamName
		meta.MovedByUserID = actorID
		meta.MovedAt = movedAt
		if err := s.writeImageMetadata(candidate.ref.rel, meta); err != nil {
			return nil, err
		}
		s.upsertImageIndexEntry(candidate.ref)
		movedPaths = append(movedPaths, candidate.ref.rel)
	}
	storageAfter := s.TeamStorageSummary(teamID, limitBytes)
	return map[string]any{
		"moved":          len(movedPaths),
		"paths":          movedPaths,
		"team_id":        teamID,
		"required_bytes": requiredBytes,
		"storage":        storageAfter,
	}, nil
}

func (s *ImageService) RecordImageOwners(values []string, ownerID string) {
	ownerID = strings.TrimSpace(ownerID)
	if ownerID == "" {
		return
	}
	for _, ref := range s.imageFileRefs(values) {
		if s.writeImageMetadataForRef(ref, ownerID, "", "") == nil {
			s.upsertImageIndexEntry(ref)
		}
	}
}

func (s *ImageService) RecordGeneratedImages(values []string, ownerID, ownerName, visibility string, metadataValues ...GeneratedImageMetadata) {
	ownerID = strings.TrimSpace(ownerID)
	ownerName = strings.TrimSpace(ownerName)
	metadata := GeneratedImageMetadata{}
	if len(metadataValues) > 0 {
		metadata = metadataValues[0]
	}
	visibility, err := NormalizeImageVisibility(visibility)
	if err != nil {
		visibility = ImageVisibilityPrivate
	}
	for _, ref := range s.imageFileRefs(values) {
		s.ensureThumbnailForRef(ref)
		if ownerID != "" && ownerID != "anonymous" {
			if s.writeImageMetadataForRef(ref, ownerID, ownerName, visibility, metadata) == nil {
				s.upsertImageIndexEntry(ref)
				s.removeLocalOriginalIfObjectStored(ref.rel)
			}
		}
	}
}

func (s *ImageService) EnsureThumbnails(values []string) {
	for _, ref := range s.imageFileRefs(values) {
		s.ensureThumbnailForRef(ref)
	}
}

func (s *ImageService) SourceImageRelativePathFromThumbnail(thumbnailRel string) (string, error) {
	return sourceImageRelativePathFromThumbnail(thumbnailRel)
}

func (s *ImageService) SourceImageRelativePathFromPreview(previewRel string) (string, error) {
	return sourceImageRelativePathFromPreview(previewRel)
}

func (s *ImageService) EnsureThumbnail(thumbnailRel string) error {
	sourceRel, err := s.SourceImageRelativePathFromThumbnail(thumbnailRel)
	if err != nil {
		return err
	}
	imageRoot, err := filepath.Abs(s.config.ImagesDir())
	if err != nil {
		return err
	}
	ref, err := s.imageFileRef(imageRoot, sourceRel)
	if err != nil {
		return err
	}
	thumb := s.ensureThumbnailForRef(ref)
	if toString(thumb["thumbnail_rel"]) == "" {
		return errors.New("thumbnail unavailable")
	}
	return nil
}

func (s *ImageService) EnsurePreview(previewRel string) error {
	sourceRel, err := s.SourceImageRelativePathFromPreview(previewRel)
	if err != nil {
		return err
	}
	imageRoot, err := filepath.Abs(s.config.ImagesDir())
	if err != nil {
		return err
	}
	ref, err := s.imageFileRef(imageRoot, sourceRel)
	if err != nil {
		return err
	}
	preview := s.ensurePreviewForRef(ref)
	if toString(preview["preview_rel"]) == "" {
		return errors.New("preview unavailable")
	}
	return nil
}

func (s *ImageService) thumbnailInfo(rel string, sourceInfo os.FileInfo) map[string]any {
	_, result, _ := s.thumbnailCacheInfo(rel, sourceInfo.ModTime())
	return result
}

func (s *ImageService) previewInfo(rel string, sourceInfo os.FileInfo) map[string]any {
	_, result, _ := s.previewCacheInfo(rel, sourceInfo.ModTime())
	return result
}

func (s *ImageService) ensureThumbnailForRef(ref imageFileRef) map[string]any {
	if _, result, ok := s.thumbnailCacheInfo(ref.rel, ref.info.ModTime()); ok {
		return result
	}
	return s.withThumbnailJob("thumbnail:"+ref.rel, func() map[string]any {
		if _, result, ok := s.thumbnailCacheInfo(ref.rel, ref.info.ModTime()); ok {
			return result
		}
		return s.generateThumbnail(ref)
	})
}

func (s *ImageService) ensurePreviewForRef(ref imageFileRef) map[string]any {
	if _, result, ok := s.previewCacheInfo(ref.rel, ref.info.ModTime()); ok {
		return result
	}
	return s.withThumbnailJob("preview:"+ref.rel, func() map[string]any {
		if _, result, ok := s.previewCacheInfo(ref.rel, ref.info.ModTime()); ok {
			return result
		}
		return s.generatePreview(ref)
	})
}

func (s *ImageService) withThumbnailJob(rel string, run func() map[string]any) map[string]any {
	s.thumbnailMu.Lock()
	if s.thumbnailJobs == nil {
		s.thumbnailJobs = make(map[string]*thumbnailJob)
	}
	if job, ok := s.thumbnailJobs[rel]; ok {
		done := job.done
		s.thumbnailMu.Unlock()
		<-done
		return job.result
	}
	job := &thumbnailJob{done: make(chan struct{})}
	s.thumbnailJobs[rel] = job
	s.thumbnailMu.Unlock()

	job.result = run()

	s.thumbnailMu.Lock()
	delete(s.thumbnailJobs, rel)
	close(job.done)
	s.thumbnailMu.Unlock()
	return job.result
}

func (s *ImageService) thumbnailCacheInfo(rel string, sourceModTime time.Time) (string, map[string]any, bool) {
	thumbPath := s.thumbnailPath(rel)
	thumbRel := thumbnailRelativePath(s.config.ImageThumbnailsDir(), thumbPath)
	result := map[string]any{"thumbnail_rel": thumbRel}
	thumbInfo, err := os.Stat(thumbPath)
	if err != nil || thumbInfo.ModTime().Before(sourceModTime) {
		return thumbPath, result, false
	}
	meta := s.readThumbnailMetadata(rel, thumbPath+".json", sourceModTime)
	if !isCurrentThumbnailMetadata(meta) {
		return thumbPath, result, false
	}
	for key, value := range meta {
		result[key] = value
	}
	return thumbPath, result, true
}

func (s *ImageService) previewCacheInfo(rel string, sourceModTime time.Time) (string, map[string]any, bool) {
	previewPath := s.previewPath(rel)
	previewRel := thumbnailRelativePath(s.config.ImagePreviewsDir(), previewPath)
	result := map[string]any{"preview_rel": previewRel}
	previewInfo, err := os.Stat(previewPath)
	if err != nil || previewInfo.ModTime().Before(sourceModTime) {
		return previewPath, result, false
	}
	meta := s.readPreviewMetadata(rel, previewPath+".json", sourceModTime)
	if !isCurrentPreviewMetadata(meta) {
		return previewPath, result, false
	}
	for key, value := range meta {
		result[key] = value
	}
	return previewPath, result, true
}

func (s *ImageService) generateThumbnail(ref imageFileRef) map[string]any {
	thumbPath, result, _ := s.thumbnailCacheInfo(ref.rel, ref.info.ModTime())
	file, closeReader, err := openImageRefReader(ref)
	if err != nil {
		return map[string]any{}
	}
	defer closeReader()
	img, _, err := image.Decode(file)
	if err != nil {
		return map[string]any{}
	}
	bounds := img.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	thumb := resizeToFit(flattenImage(img), ThumbnailSize, ThumbnailSize)
	if err := writeJPEGThumbnail(thumbPath, thumb, thumbnailQuality); err != nil {
		return map[string]any{}
	}
	_ = s.writeThumbnailMetadata(ref.rel, thumbPath+".json", map[string]any{
		"width":             width,
		"height":            height,
		"thumbnail_format":  "jpeg",
		"thumbnail_quality": thumbnailQuality,
		"thumbnail_size":    ThumbnailSize,
		"thumbnail_version": thumbnailCacheVersion,
	})
	result["width"] = width
	result["height"] = height
	return result
}

func (s *ImageService) generatePreview(ref imageFileRef) map[string]any {
	previewPath, result, _ := s.previewCacheInfo(ref.rel, ref.info.ModTime())
	file, closeReader, err := openImageRefReader(ref)
	if err != nil {
		return map[string]any{}
	}
	defer closeReader()
	img, _, err := image.Decode(file)
	if err != nil {
		return map[string]any{}
	}
	bounds := img.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	preview := resizeToFit(flattenImage(img), ImagePreviewSize, ImagePreviewSize)
	if err := writeJPEGThumbnail(previewPath, preview, imagePreviewQuality); err != nil {
		return map[string]any{}
	}
	_ = s.writePreviewMetadata(ref.rel, previewPath+".json", map[string]any{
		"width":           width,
		"height":          height,
		"preview_format":  "jpeg",
		"preview_quality": imagePreviewQuality,
		"preview_size":    ImagePreviewSize,
		"preview_version": imagePreviewCacheVersion,
	})
	result["width"] = width
	result["height"] = height
	return result
}

func (s *ImageService) imageFileRefs(values []string) []imageFileRef {
	if len(values) == 0 {
		return nil
	}
	imageRoot, err := filepath.Abs(s.config.ImagesDir())
	if err != nil {
		return nil
	}
	seen := make(map[string]struct{}, len(values))
	refs := make([]imageFileRef, 0, len(values))
	for _, value := range values {
		rel, err := imageRelativePathFromValue(value)
		if err != nil {
			continue
		}
		if _, ok := seen[rel]; ok {
			continue
		}
		seen[rel] = struct{}{}
		ref, err := s.imageFileRef(imageRoot, rel)
		if err != nil {
			continue
		}
		refs = append(refs, ref)
	}
	return refs
}

func (s *ImageService) imageFileRef(imageRoot, rel string) (imageFileRef, error) {
	ref, err := s.localImageFileRef(imageRoot, rel)
	if err == nil {
		return ref, nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return imageFileRef{}, err
	}
	storedRef, storedErr := s.storedImageFileRef(rel)
	if storedErr == nil {
		return storedRef, nil
	}
	return imageFileRef{}, err
}

func (s *ImageService) localImageFileRef(imageRoot, rel string) (imageFileRef, error) {
	rel, err := cleanImageRelativePath(rel)
	if err != nil {
		return imageFileRef{}, err
	}
	imagePath := filepath.Join(imageRoot, filepath.FromSlash(rel))
	if !pathInsideRoot(imageRoot, imagePath) {
		return imageFileRef{}, errors.New("invalid image path")
	}
	info, err := os.Stat(imagePath)
	if err != nil {
		return imageFileRef{}, err
	}
	if info.IsDir() {
		return imageFileRef{}, errors.New("image path is not a file")
	}
	return imageFileRef{rel: rel, path: imagePath, info: info}, nil
}

func (s *ImageService) storedImageFileRef(rel string) (imageFileRef, error) {
	rel, err := cleanImageRelativePath(rel)
	if err != nil {
		return imageFileRef{}, err
	}
	meta := s.imageMetadata(rel)
	if meta.ObjectKey == "" {
		entry, ok := s.imageIndexEntry(rel)
		if !ok || entry.ObjectKey == "" {
			return imageFileRef{}, errors.New("image not found")
		}
		meta.StorageBackend = entry.StorageBackend
		meta.ObjectKey = entry.ObjectKey
		meta.ObjectURL = entry.ObjectURL
		if meta.OutputFormat == "" {
			meta.OutputFormat = entry.OutputFormat
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	object, enabled, err := imagestore.GetBytesFromEnv(ctx, meta.ObjectKey)
	cancel()
	if err != nil {
		return imageFileRef{}, err
	}
	if !enabled || len(object.Data) == 0 {
		return imageFileRef{}, errors.New("image not found")
	}
	mtime := time.Now()
	entry, hasEntry := s.imageIndexEntry(rel)
	if hasEntry && entry.ModifiedUnixNano > 0 {
		mtime = time.Unix(0, entry.ModifiedUnixNano)
	}
	name := filepath.Base(filepath.FromSlash(rel))
	if hasEntry && entry.Name != "" {
		name = entry.Name
	}
	return imageFileRef{
		rel:         rel,
		path:        filepath.Join(s.config.ImagesDir(), filepath.FromSlash(rel)),
		info:        memoryFileInfo{name: name, size: int64(len(object.Data)), modTime: mtime},
		meta:        meta,
		data:        object.Data,
		contentType: strings.TrimSpace(object.ContentType),
		fromStore:   true,
	}, nil
}

func openImageRefReader(ref imageFileRef) (io.Reader, func(), error) {
	if len(ref.data) > 0 {
		return bytes.NewReader(ref.data), func() {}, nil
	}
	file, err := os.Open(ref.path)
	if err != nil {
		return nil, func() {}, err
	}
	return file, func() { _ = file.Close() }, nil
}

func (s *ImageService) thumbnailPath(rel string) string {
	return filepath.Join(s.config.ImageThumbnailsDir(), filepath.FromSlash(rel)+thumbnailExtension)
}

func (s *ImageService) previewPath(rel string) string {
	return filepath.Join(s.config.ImagePreviewsDir(), filepath.FromSlash(rel)+thumbnailExtension)
}

func (s *ImageService) imageOwner(rel string) string {
	return s.imageMetadata(rel).OwnerID
}

func imageMetadataAllowsAccess(meta imageMetadata, scope ImageAccessScope) bool {
	if meta.Visibility == ImageVisibilityPublic {
		return true
	}
	if scope.All {
		return true
	}
	if scope.TeamID != "" {
		return meta.LibraryScope == ImageLibraryScopeTeam && meta.TeamID == scope.TeamID
	}
	return scope.OwnerID != "" && meta.LibraryScope == ImageLibraryScopePersonal && meta.OwnerID == scope.OwnerID
}

func imageMetadataAllowsMutation(meta imageMetadata, scope ImageAccessScope) bool {
	if scope.All {
		return true
	}
	if scope.TeamID != "" {
		return scope.TeamManager && meta.LibraryScope == ImageLibraryScopeTeam && meta.TeamID == scope.TeamID
	}
	return scope.OwnerID != "" && meta.LibraryScope == ImageLibraryScopePersonal && meta.OwnerID == scope.OwnerID
}

func (s *ImageService) imageMetadata(rel string) imageMetadata {
	metaPath, err := s.imageOwnerMetadataPath(rel)
	if err != nil {
		return imageMetadata{Visibility: ImageVisibilityPrivate}
	}
	var raw map[string]any
	if s.store != nil {
		value, err := s.store.LoadJSONDocument(imageOwnerDocumentName(rel))
		if err == nil {
			if meta, ok := value.(map[string]any); ok {
				raw = meta
			}
		}
	}
	if raw == nil {
		data, err := os.ReadFile(metaPath)
		if err != nil {
			return imageMetadata{Visibility: ImageVisibilityPrivate}
		}
		if json.Unmarshal(data, &raw) != nil {
			return imageMetadata{Visibility: ImageVisibilityPrivate}
		}
	}
	return normalizeImageMetadata(raw)
}

func mergeImageMetadataWithIndexEntry(meta imageMetadata, entry imageIndexEntry) imageMetadata {
	if meta.OwnerID == "" {
		meta.OwnerID = entry.OwnerID
	}
	if meta.OwnerName == "" {
		meta.OwnerName = entry.OwnerName
	}
	if meta.LibraryScope == "" || meta.LibraryScope == ImageLibraryScopePersonal && entry.LibraryScope == ImageLibraryScopeTeam {
		meta.LibraryScope = entry.LibraryScope
	}
	if meta.CollectionID == "" {
		meta.CollectionID = entry.CollectionID
	}
	if meta.CollectionName == "" {
		meta.CollectionName = entry.CollectionName
	}
	if meta.TeamID == "" {
		meta.TeamID = entry.TeamID
	}
	if meta.TeamName == "" {
		meta.TeamName = entry.TeamName
	}
	if meta.Visibility == "" || meta.Visibility == ImageVisibilityPrivate && entry.Visibility == ImageVisibilityPublic {
		meta.Visibility = entry.Visibility
	}
	if meta.StorageBackend == "" {
		meta.StorageBackend = entry.StorageBackend
	}
	if meta.ObjectKey == "" {
		meta.ObjectKey = entry.ObjectKey
	}
	if meta.ObjectURL == "" {
		meta.ObjectURL = entry.ObjectURL
	}
	if meta.OutputFormat == "" {
		meta.OutputFormat = entry.OutputFormat
	}
	return meta
}

func normalizeImageMetadata(raw map[string]any) imageMetadata {
	visibility := strings.TrimSpace(toString(raw["visibility"]))
	if visibility != ImageVisibilityPublic {
		visibility = ImageVisibilityPrivate
	}
	libraryScope := normalizeImageLibraryScope(toString(raw["library_scope"]))
	teamID := strings.TrimSpace(toString(raw["team_id"]))
	if libraryScope != ImageLibraryScopeTeam || teamID == "" {
		libraryScope = ImageLibraryScopePersonal
		teamID = ""
	}
	professionalMode := boolMetadataValue(raw["professional_mode"])
	resolutionPreset := NormalizeImageResolutionPreset(toString(raw["resolution_preset"]))
	if professionalMode {
		resolutionPreset = normalizeProStudioResolution(toString(raw["resolution_preset"]))
	}
	return imageMetadata{
		OwnerID:           strings.TrimSpace(toString(raw["owner_id"])),
		OwnerName:         strings.TrimSpace(toString(raw["owner_name"])),
		LibraryScope:      libraryScope,
		CollectionID:      normalizeImageCollectionID(toString(raw["collection_id"])),
		CollectionName:    normalizeImageCollectionName(toString(raw["collection_name"])),
		TeamID:            teamID,
		TeamName:          strings.TrimSpace(toString(raw["team_name"])),
		MovedByUserID:     strings.TrimSpace(toString(raw["moved_by_user_id"])),
		MovedAt:           strings.TrimSpace(toString(raw["moved_at"])),
		Visibility:        visibility,
		PublishedAt:       strings.TrimSpace(toString(raw["published_at"])),
		StorageBackend:    strings.TrimSpace(toString(raw["storage_backend"])),
		ObjectKey:         strings.TrimSpace(toString(raw["object_key"])),
		ObjectURL:         strings.TrimSpace(toString(raw["object_url"])),
		Tags:              NormalizeImageTags(raw["tags"]),
		Prompt:            strings.TrimSpace(toString(raw["prompt"])),
		Model:             strings.TrimSpace(toString(raw["model"])),
		Quality:           strings.TrimSpace(toString(raw["quality"])),
		ResolutionPreset:  resolutionPreset,
		RequestedSize:     strings.TrimSpace(toString(raw["requested_size"])),
		OutputFormat:      NormalizeImageOutputFormat(strings.TrimSpace(toString(raw["output_format"]))),
		OutputCompression: imageOutputCompressionMetadata(raw["output_compression"]),
		Background:        strings.TrimSpace(toString(raw["background"])),
		Moderation:        strings.TrimSpace(toString(raw["moderation"])),
		Style:             strings.TrimSpace(toString(raw["style"])),
		PartialImages:     positiveImageMetadataInt(raw["partial_images"]),
		InputImageMask:    strings.TrimSpace(toString(raw["input_image_mask"])),
		ReferenceImages:   normalizeImageReferenceMetadata(raw["reference_images"]),
		ProfessionalMode:  professionalMode,
		ProStudio:         cleanMetadataMap(raw["pro_studio"]),
		OfficialSettings:  cleanMetadataMap(raw["official_settings"]),
		SharePromptParams: boolMetadataValue(raw["share_prompt_parameters"]),
		ShareReferences:   boolMetadataValue(raw["share_reference_images"]),
	}
}

func (s *ImageService) writeImageMetadataForRef(ref imageFileRef, ownerID, ownerName, visibility string, metadataValues ...GeneratedImageMetadata) error {
	meta := s.imageMetadata(ref.rel)
	if ownerID = strings.TrimSpace(ownerID); ownerID != "" {
		meta.OwnerID = ownerID
	}
	if ownerName = strings.TrimSpace(ownerName); ownerName != "" {
		meta.OwnerName = ownerName
	}
	if visibility = strings.TrimSpace(visibility); visibility != "" {
		normalized, err := NormalizeImageVisibility(visibility)
		if err != nil {
			return err
		}
		if normalized == ImageVisibilityPublic {
			if meta.PublishedAt == "" || meta.Visibility != ImageVisibilityPublic {
				meta.PublishedAt = time.Now().UTC().Format(time.RFC3339Nano)
			}
		} else {
			meta.PublishedAt = ""
		}
		meta.Visibility = normalized
	}
	if len(metadataValues) > 0 {
		metadata := metadataValues[0]
		if prompt := strings.TrimSpace(metadata.Prompt); prompt != "" {
			meta.Prompt = prompt
		}
		if model := strings.TrimSpace(metadata.Model); model != "" {
			meta.Model = model
		}
		if quality := strings.TrimSpace(metadata.Quality); quality != "" {
			meta.Quality = quality
		}
		preset := NormalizeImageResolutionPreset(metadata.ResolutionPreset)
		if metadata.ProfessionalMode {
			preset = normalizeProStudioResolution(metadata.ResolutionPreset)
		}
		if preset != "" {
			meta.ResolutionPreset = preset
		}
		if requestedSize := strings.TrimSpace(metadata.RequestedSize); requestedSize != "" {
			meta.RequestedSize = requestedSize
		}
		if outputFormat := NormalizeImageOutputFormat(metadata.OutputFormat); outputFormat != "" {
			meta.OutputFormat = outputFormat
		}
		if metadata.OutputCompression != nil {
			compression := *metadata.OutputCompression
			if compression < 0 {
				compression = 0
			} else if compression > 100 {
				compression = 100
			}
			meta.OutputCompression = &compression
		}
		if background := strings.TrimSpace(metadata.Background); background != "" {
			meta.Background = background
		}
		if moderation := strings.TrimSpace(metadata.Moderation); moderation != "" {
			meta.Moderation = moderation
		}
		if style := strings.TrimSpace(metadata.Style); style != "" {
			meta.Style = style
		}
		if metadata.PartialImages != nil && *metadata.PartialImages > 0 {
			partialImages := *metadata.PartialImages
			meta.PartialImages = &partialImages
		}
		if inputImageMask := strings.TrimSpace(metadata.InputImageMask); inputImageMask != "" {
			meta.InputImageMask = inputImageMask
		}
		if len(metadata.ReferenceImages) > 0 {
			meta.ReferenceImages = s.writeImageReferencesForRef(ref, metadata.ReferenceImages)
		}
		meta.ProfessionalMode = metadata.ProfessionalMode
		if len(metadata.ProStudio) > 0 {
			meta.ProStudio = util.CopyMap(metadata.ProStudio)
		}
		if len(metadata.OfficialSettings) > 0 {
			meta.OfficialSettings = util.CopyMap(metadata.OfficialSettings)
		}
		meta.SharePromptParams = metadata.SharePromptParams
		meta.ShareReferences = metadata.ShareReferences
	}
	if meta.Visibility == "" {
		meta.Visibility = ImageVisibilityPrivate
	}
	if meta.LibraryScope == "" {
		meta.LibraryScope = ImageLibraryScopePersonal
	}
	return s.writeImageMetadata(ref.rel, meta)
}

func (s *ImageService) writeUploadedImageMetadataForRef(ref imageFileRef, ownerID, ownerName, visibility, outputFormat string, stored imagestore.StoredObject) error {
	meta := s.imageMetadata(ref.rel)
	meta.OwnerID = strings.TrimSpace(ownerID)
	meta.OwnerName = strings.TrimSpace(ownerName)
	meta.LibraryScope = ImageLibraryScopePersonal
	meta.TeamID = ""
	meta.TeamName = ""
	meta.MovedByUserID = ""
	meta.MovedAt = ""
	normalized, err := NormalizeImageVisibility(visibility)
	if err != nil {
		return err
	}
	meta.Visibility = normalized
	if normalized == ImageVisibilityPublic {
		meta.PublishedAt = time.Now().UTC().Format(time.RFC3339Nano)
	} else {
		meta.PublishedAt = ""
	}
	meta.OutputFormat = NormalizeImageOutputFormat(outputFormat)
	if meta.OutputFormat == "" {
		meta.OutputFormat = strings.TrimSpace(outputFormat)
	}
	meta.StorageBackend = strings.TrimSpace(stored.Backend)
	meta.ObjectKey = strings.TrimSpace(stored.Key)
	meta.ObjectURL = strings.TrimSpace(stored.URL)
	return s.writeImageMetadata(ref.rel, meta)
}

func (s *ImageService) ListImageTags(scope ImageAccessScope) []string {
	entries := s.imageIndexEntries()
	seen := map[string]struct{}{}
	for _, entry := range entries {
		if !imageIndexEntryMatchesScope(entry, scope) {
			continue
		}
		for _, tag := range entry.Tags {
			tag = strings.TrimSpace(tag)
			if tag != "" {
				seen[tag] = struct{}{}
			}
		}
	}
	tags := make([]string, 0, len(seen))
	for tag := range seen {
		tags = append(tags, tag)
	}
	sort.Strings(tags)
	return tags
}

func (s *ImageService) UpdateImageTags(value any, tags []string, scope ImageAccessScope) (map[string]any, error) {
	rel, err := imageRelativePathFromValue(util.Clean(value))
	if err != nil {
		return nil, err
	}
	imageRoot, err := filepath.Abs(s.config.ImagesDir())
	if err != nil {
		return nil, err
	}
	ref, err := s.imageFileRef(imageRoot, rel)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, errors.New("image not found")
		}
		return nil, err
	}
	meta := s.imageMetadata(ref.rel)
	if !imageMetadataAllowsMutation(meta, scope) {
		return nil, errors.New("image not found")
	}
	meta.Tags = NormalizeImageTags(tags)
	if err := s.writeImageMetadata(ref.rel, meta); err != nil {
		return nil, err
	}
	s.upsertImageIndexEntry(ref)
	return s.managedImageItem("", ref, ref.info, scope), nil
}

func (s *ImageService) DeleteImageTag(tag string, scope ImageAccessScope) (map[string]any, error) {
	tag = normalizeImageTag(tag)
	if tag == "" {
		return nil, errors.New("tag is required")
	}
	imageRoot, err := filepath.Abs(s.config.ImagesDir())
	if err != nil {
		return nil, err
	}
	updated := 0
	paths := make([]string, 0)
	for _, entry := range s.imageIndexEntries() {
		if !imageIndexEntryMatchesScope(entry, scope) || !imageTagContains(entry.Tags, tag) {
			continue
		}
		ref, err := s.imageFileRef(imageRoot, entry.Path)
		if err != nil {
			continue
		}
		meta := s.imageMetadata(ref.rel)
		if !imageMetadataAllowsMutation(meta, scope) {
			continue
		}
		nextTags := removeImageTag(meta.Tags, tag)
		if len(nextTags) == len(meta.Tags) {
			continue
		}
		meta.Tags = nextTags
		if err := s.writeImageMetadata(ref.rel, meta); err != nil {
			return nil, err
		}
		s.upsertImageIndexEntry(ref)
		updated++
		paths = append(paths, ref.rel)
	}
	return map[string]any{"deleted": updated, "tag": tag, "paths": paths}, nil
}

func (s *ImageService) loadImageCollections() []ImageCollection {
	var value any
	if s.store != nil {
		value = loadStoredJSON(s.store, imageCollectionsDocumentName)
	} else {
		data, err := os.ReadFile(s.imageCollectionsDocumentPath())
		if err == nil {
			_ = json.Unmarshal(data, &value)
		}
	}
	rawItems := util.AsMapSlice(value)
	if len(rawItems) == 0 {
		rawItems = util.AsMapSlice(util.StringMap(value)["items"])
	}
	items := make([]ImageCollection, 0, len(rawItems))
	seen := map[string]struct{}{}
	for _, raw := range rawItems {
		item := normalizeImageCollection(raw)
		if item.ID == "" {
			continue
		}
		if _, ok := seen[item.ID]; ok {
			continue
		}
		seen[item.ID] = struct{}{}
		items = append(items, item)
	}
	return items
}

func (s *ImageService) saveImageCollections(items []ImageCollection) error {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	out := make([]ImageCollection, 0, len(items))
	seen := map[string]struct{}{}
	for _, item := range items {
		item = normalizeImageCollection(structToMapImageCollection(item))
		if item.ID == "" {
			continue
		}
		if item.CreatedAt == "" {
			item.CreatedAt = now
		}
		if item.UpdatedAt == "" {
			item.UpdatedAt = now
		}
		if _, ok := seen[item.ID]; ok {
			continue
		}
		seen[item.ID] = struct{}{}
		out = append(out, item)
	}
	doc := imageCollectionDocument{Version: 1, UpdatedAt: now, Items: out}
	if s.store != nil {
		return saveStoredJSON(s.store, imageCollectionsDocumentName, doc)
	}
	if err := os.MkdirAll(filepath.Dir(s.imageCollectionsDocumentPath()), 0o755); err != nil {
		return err
	}
	return writeJSONFile(s.imageCollectionsDocumentPath(), doc)
}

func (s *ImageService) imageCollectionsDocumentPath() string {
	return filepath.Join(s.config.ImageMetadataDir(), imageCollectionsDocumentName)
}

func (s *ImageService) imageCollectionByID(id string, scope ImageAccessScope) (ImageCollection, bool) {
	id = normalizeImageCollectionID(id)
	if id == "" {
		return ImageCollection{}, false
	}
	for _, collection := range s.loadImageCollections() {
		if collection.ID == id && imageCollectionMatchesScope(collection, scope) {
			return collection, true
		}
	}
	return ImageCollection{}, false
}

func (s *ImageService) imageCollectionCounts(scope ImageAccessScope) map[string]int {
	counts := map[string]int{}
	for _, entry := range s.imageIndexEntries() {
		if !imageIndexEntryMatchesScope(entry, scope) || entry.CollectionID == "" {
			continue
		}
		counts[entry.CollectionID]++
	}
	return counts
}

func (s *ImageService) unclassifiedImageCount(scope ImageAccessScope) int {
	count := 0
	for _, entry := range s.imageIndexEntries() {
		if imageIndexEntryMatchesScope(entry, scope) && entry.CollectionID == "" {
			count++
		}
	}
	return count
}

func (s *ImageService) renameImageCollectionOnImages(collectionID, name string, scope ImageAccessScope) error {
	imageRoot, err := filepath.Abs(s.config.ImagesDir())
	if err != nil {
		return err
	}
	for _, entry := range s.imageIndexEntries() {
		if entry.CollectionID != collectionID || !imageIndexEntryMatchesScope(entry, scope) {
			continue
		}
		ref, err := s.imageFileRef(imageRoot, entry.Path)
		if err != nil {
			continue
		}
		meta := s.imageMetadata(ref.rel)
		if !imageMetadataAllowsMutation(meta, scope) || meta.CollectionID != collectionID {
			continue
		}
		meta.CollectionName = name
		if err := s.writeImageMetadata(ref.rel, meta); err != nil {
			return err
		}
		s.upsertImageIndexEntry(ref)
	}
	return nil
}

func (s *ImageService) clearImageCollectionOnImages(collectionID string, scope ImageAccessScope) (int, error) {
	imageRoot, err := filepath.Abs(s.config.ImagesDir())
	if err != nil {
		return 0, err
	}
	cleared := 0
	for _, entry := range s.imageIndexEntries() {
		if entry.CollectionID != collectionID || !imageIndexEntryMatchesScope(entry, scope) {
			continue
		}
		ref, err := s.imageFileRef(imageRoot, entry.Path)
		if err != nil {
			continue
		}
		meta := s.imageMetadata(ref.rel)
		if !imageMetadataAllowsMutation(meta, scope) || meta.CollectionID != collectionID {
			continue
		}
		meta.CollectionID = ""
		meta.CollectionName = ""
		if err := s.writeImageMetadata(ref.rel, meta); err != nil {
			return cleared, err
		}
		s.upsertImageIndexEntry(ref)
		cleared++
	}
	return cleared, nil
}

func newImageCollectionForScope(name string, scope ImageAccessScope, teamName string) (ImageCollection, error) {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	collection := ImageCollection{
		ID:        "col_" + util.SHA1Short(util.NewUUID()+":"+name, 20),
		Name:      name,
		CreatedAt: now,
		UpdatedAt: now,
	}
	if scope.TeamID != "" {
		collection.LibraryScope = ImageLibraryScopeTeam
		collection.TeamID = strings.TrimSpace(scope.TeamID)
		collection.TeamName = strings.TrimSpace(teamName)
		return collection, nil
	}
	if scope.OwnerID != "" {
		collection.LibraryScope = ImageLibraryScopePersonal
		collection.OwnerID = strings.TrimSpace(scope.OwnerID)
		return collection, nil
	}
	return ImageCollection{}, errors.New("collection scope is required")
}

func normalizeImageCollection(raw map[string]any) ImageCollection {
	scope := normalizeImageLibraryScope(toString(raw["library_scope"]))
	teamID := strings.TrimSpace(toString(raw["team_id"]))
	if scope != ImageLibraryScopeTeam || teamID == "" {
		scope = ImageLibraryScopePersonal
		teamID = ""
	}
	id := normalizeImageCollectionID(toString(raw["id"]))
	return ImageCollection{
		ID:           id,
		Name:         normalizeImageCollectionName(toString(raw["name"])),
		LibraryScope: scope,
		OwnerID:      strings.TrimSpace(toString(raw["owner_id"])),
		TeamID:       teamID,
		TeamName:     strings.TrimSpace(toString(raw["team_name"])),
		CreatedAt:    strings.TrimSpace(toString(raw["created_at"])),
		UpdatedAt:    strings.TrimSpace(toString(raw["updated_at"])),
		ImagesCount:  util.ToInt(raw["images_count"], 0),
	}
}

func structToMapImageCollection(item ImageCollection) map[string]any {
	return map[string]any{
		"id":            item.ID,
		"name":          item.Name,
		"library_scope": item.LibraryScope,
		"owner_id":      item.OwnerID,
		"team_id":       item.TeamID,
		"team_name":     item.TeamName,
		"created_at":    item.CreatedAt,
		"updated_at":    item.UpdatedAt,
		"images_count":  item.ImagesCount,
	}
}

func imageCollectionMatchesScope(collection ImageCollection, scope ImageAccessScope) bool {
	if scope.All {
		return true
	}
	if scope.TeamID != "" {
		return collection.LibraryScope == ImageLibraryScopeTeam && collection.TeamID == scope.TeamID
	}
	if scope.Public {
		return false
	}
	return scope.OwnerID != "" && collection.LibraryScope == ImageLibraryScopePersonal && collection.OwnerID == scope.OwnerID
}

func (s *ImageService) ListImageCollections(scope ImageAccessScope) []ImageCollection {
	collections := s.loadImageCollections()
	counts := s.imageCollectionCounts(scope)
	byID := make(map[string]ImageCollection, len(collections)+len(counts))
	for _, collection := range collections {
		if !imageCollectionMatchesScope(collection, scope) {
			continue
		}
		collection.ImagesCount = counts[collection.ID]
		byID[collection.ID] = collection
	}
	for _, entry := range s.imageIndexEntries() {
		if !imageIndexEntryMatchesScope(entry, scope) || entry.CollectionID == "" {
			continue
		}
		if _, ok := byID[entry.CollectionID]; ok {
			continue
		}
		collection := ImageCollection{
			ID:           entry.CollectionID,
			Name:         firstNonEmptyString(entry.CollectionName, "素材集"),
			LibraryScope: normalizeImageLibraryScope(entry.LibraryScope),
			OwnerID:      entry.OwnerID,
			TeamID:       entry.TeamID,
			TeamName:     entry.TeamName,
			ImagesCount:  counts[entry.CollectionID],
		}
		byID[collection.ID] = collection
	}
	result := make([]ImageCollection, 0, len(byID))
	for _, collection := range byID {
		result = append(result, collection)
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].ImagesCount != result[j].ImagesCount {
			return result[i].ImagesCount > result[j].ImagesCount
		}
		return strings.ToLower(result[i].Name) < strings.ToLower(result[j].Name)
	})
	return result
}

func (s *ImageService) ListImageCollectionsResult(scope ImageAccessScope) ImageCollectionsResult {
	return ImageCollectionsResult{
		Items:             s.ListImageCollections(scope),
		UnclassifiedCount: s.unclassifiedImageCount(scope),
	}
}

func (s *ImageService) CreateImageCollection(name string, scope ImageAccessScope, teamName string) (ImageCollection, error) {
	name = normalizeImageCollectionName(name)
	if name == "" {
		return ImageCollection{}, errors.New("collection name is required")
	}
	collection, err := newImageCollectionForScope(name, scope, teamName)
	if err != nil {
		return ImageCollection{}, err
	}
	collections := s.loadImageCollections()
	for _, existing := range collections {
		if imageCollectionMatchesScope(existing, scope) && strings.EqualFold(existing.Name, collection.Name) {
			return ImageCollection{}, errors.New("collection name already exists")
		}
	}
	collections = append(collections, collection)
	if err := s.saveImageCollections(collections); err != nil {
		return ImageCollection{}, err
	}
	return collection, nil
}

func (s *ImageService) RenameImageCollection(id, name string, scope ImageAccessScope) (ImageCollection, error) {
	id = normalizeImageCollectionID(id)
	name = normalizeImageCollectionName(name)
	if id == "" {
		return ImageCollection{}, errors.New("collection id is required")
	}
	if name == "" {
		return ImageCollection{}, errors.New("collection name is required")
	}
	collections := s.loadImageCollections()
	index := -1
	for i, collection := range collections {
		if collection.ID == id && imageCollectionMatchesScope(collection, scope) {
			index = i
			break
		}
	}
	if index < 0 {
		return ImageCollection{}, errors.New("collection not found")
	}
	for _, existing := range collections {
		if existing.ID != id && imageCollectionMatchesScope(existing, scope) && strings.EqualFold(existing.Name, name) {
			return ImageCollection{}, errors.New("collection name already exists")
		}
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	collections[index].Name = name
	collections[index].UpdatedAt = now
	if err := s.saveImageCollections(collections); err != nil {
		return ImageCollection{}, err
	}
	if err := s.renameImageCollectionOnImages(id, name, scope); err != nil {
		return ImageCollection{}, err
	}
	counts := s.imageCollectionCounts(scope)
	collections[index].ImagesCount = counts[id]
	return collections[index], nil
}

func (s *ImageService) DeleteImageCollection(id string, scope ImageAccessScope) (map[string]any, error) {
	id = normalizeImageCollectionID(id)
	if id == "" {
		return nil, errors.New("collection id is required")
	}
	collections := s.loadImageCollections()
	next := make([]ImageCollection, 0, len(collections))
	deleted := false
	for _, collection := range collections {
		if collection.ID == id && imageCollectionMatchesScope(collection, scope) {
			deleted = true
			continue
		}
		next = append(next, collection)
	}
	if !deleted {
		return nil, errors.New("collection not found")
	}
	if err := s.saveImageCollections(next); err != nil {
		return nil, err
	}
	cleared, err := s.clearImageCollectionOnImages(id, scope)
	if err != nil {
		return nil, err
	}
	return map[string]any{"deleted": true, "collection_id": id, "cleared": cleared}, nil
}

func (s *ImageService) UpdateImageCollectionItems(collectionID string, paths []string, scope ImageAccessScope) (map[string]any, error) {
	collectionID = normalizeImageCollectionID(collectionID)
	collectionName := ""
	if collectionID != "" {
		collection, ok := s.imageCollectionByID(collectionID, scope)
		if !ok {
			return nil, errors.New("collection not found")
		}
		collectionName = collection.Name
	}
	if len(paths) == 0 {
		return nil, errors.New("paths is required")
	}
	imageRoot, err := filepath.Abs(s.config.ImagesDir())
	if err != nil {
		return nil, err
	}
	seen := make(map[string]struct{}, len(paths))
	updated := 0
	missing := 0
	updatedPaths := make([]string, 0, len(paths))
	for _, value := range paths {
		rel, err := cleanImageRelativePath(value)
		if err != nil {
			return nil, err
		}
		if _, ok := seen[rel]; ok {
			continue
		}
		seen[rel] = struct{}{}
		ref, err := s.imageFileRef(imageRoot, rel)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				missing++
				continue
			}
			return nil, err
		}
		meta := s.imageMetadata(ref.rel)
		if !imageMetadataAllowsMutation(meta, scope) {
			missing++
			continue
		}
		meta.CollectionID = collectionID
		meta.CollectionName = collectionName
		if err := s.writeImageMetadata(ref.rel, meta); err != nil {
			return nil, err
		}
		s.upsertImageIndexEntry(ref)
		updated++
		updatedPaths = append(updatedPaths, ref.rel)
	}
	return map[string]any{
		"updated":         updated,
		"missing":         missing,
		"paths":           updatedPaths,
		"collection_id":   collectionID,
		"collection_name": collectionName,
	}, nil
}

func (s *ImageService) uploadImageObject(rel string, data []byte, contentType string) imagestore.StoredObject {
	ctx, cancel := imagestore.UploadTimeoutContext()
	defer cancel()
	store, enabled, err := imagestore.NewFromEnv(ctx)
	if !enabled || err != nil {
		return imagestore.StoredObject{}
	}
	key, err := store.ObjectKey(rel)
	if err != nil {
		return imagestore.StoredObject{}
	}
	stored, err := store.UploadBytes(ctx, key, data, contentType)
	if err != nil {
		return imagestore.StoredObject{}
	}
	return stored
}

func (s *ImageService) writeImageMetadata(rel string, meta imageMetadata) error {
	metaPath, err := s.imageOwnerMetadataPath(rel)
	if err != nil {
		return err
	}
	value := map[string]any{
		"visibility": meta.Visibility,
		"updated_at": time.Now().UTC().Format(time.RFC3339Nano),
	}
	if meta.OwnerID != "" {
		value["owner_id"] = meta.OwnerID
	}
	if meta.OwnerName != "" {
		value["owner_name"] = meta.OwnerName
	}
	value["library_scope"] = normalizeImageLibraryScope(meta.LibraryScope)
	if meta.CollectionID != "" {
		value["collection_id"] = meta.CollectionID
	}
	if meta.CollectionName != "" {
		value["collection_name"] = meta.CollectionName
	}
	if meta.TeamID != "" {
		value["team_id"] = meta.TeamID
	}
	if meta.TeamName != "" {
		value["team_name"] = meta.TeamName
	}
	if meta.MovedByUserID != "" {
		value["moved_by_user_id"] = meta.MovedByUserID
	}
	if meta.MovedAt != "" {
		value["moved_at"] = meta.MovedAt
	}
	if meta.PublishedAt != "" {
		value["published_at"] = meta.PublishedAt
	}
	if meta.StorageBackend != "" {
		value["storage_backend"] = meta.StorageBackend
	}
	if meta.ObjectKey != "" {
		value["object_key"] = meta.ObjectKey
	}
	if meta.ObjectURL != "" {
		value["object_url"] = meta.ObjectURL
	}
	if len(meta.Tags) > 0 {
		value["tags"] = append([]string(nil), meta.Tags...)
	}
	if meta.Prompt != "" {
		value["prompt"] = meta.Prompt
	}
	if meta.Model != "" {
		value["model"] = meta.Model
	}
	if meta.Quality != "" {
		value["quality"] = meta.Quality
	}
	if meta.ResolutionPreset != "" {
		value["resolution_preset"] = meta.ResolutionPreset
	}
	if meta.RequestedSize != "" {
		value["requested_size"] = meta.RequestedSize
	}
	if meta.OutputFormat != "" {
		value["output_format"] = meta.OutputFormat
	}
	if meta.OutputCompression != nil {
		value["output_compression"] = *meta.OutputCompression
	}
	if meta.Background != "" {
		value["background"] = meta.Background
	}
	if meta.Moderation != "" {
		value["moderation"] = meta.Moderation
	}
	if meta.Style != "" {
		value["style"] = meta.Style
	}
	if meta.PartialImages != nil {
		value["partial_images"] = *meta.PartialImages
	}
	if meta.InputImageMask != "" {
		value["input_image_mask"] = meta.InputImageMask
	}
	if meta.SharePromptParams {
		value["share_prompt_parameters"] = true
	}
	if meta.ShareReferences {
		value["share_reference_images"] = true
	}
	if len(meta.ReferenceImages) > 0 {
		refs := make([]map[string]any, 0, len(meta.ReferenceImages))
		for _, ref := range meta.ReferenceImages {
			if ref.Path == "" {
				continue
			}
			item := map[string]any{"path": ref.Path}
			if ref.Filename != "" {
				item["filename"] = ref.Filename
			}
			if ref.ContentType != "" {
				item["content_type"] = ref.ContentType
			}
			if ref.Size > 0 {
				item["size"] = ref.Size
			}
			refs = append(refs, item)
		}
		if len(refs) > 0 {
			value["reference_images"] = refs
		}
	}
	if meta.ProfessionalMode {
		value["professional_mode"] = true
	}
	if len(meta.ProStudio) > 0 {
		value["pro_studio"] = util.CopyMap(meta.ProStudio)
	}
	if len(meta.OfficialSettings) > 0 {
		value["official_settings"] = util.CopyMap(meta.OfficialSettings)
	}
	if s.store != nil {
		return s.store.SaveJSONDocument(imageOwnerDocumentName(rel), value)
	}
	if err := os.MkdirAll(filepath.Dir(metaPath), 0o755); err != nil {
		return err
	}
	return writeJSONFile(metaPath, value)
}

func (s *ImageService) removeImageOwner(rel string) error {
	metaPath, err := s.imageOwnerMetadataPath(rel)
	if err != nil {
		return err
	}
	if s.store != nil {
		return s.store.DeleteJSONDocument(imageOwnerDocumentName(rel))
	}
	removeErr := os.Remove(metaPath)
	if removeErr != nil && !errors.Is(removeErr, os.ErrNotExist) {
		return removeErr
	}
	removeEmptyParentDirs(s.config.ImageMetadataDir(), filepath.Dir(metaPath))
	return nil
}

func (s *ImageService) imageReferencesDir() string {
	return filepath.Join(s.config.ImageMetadataDir(), imageReferencePrefix)
}

func (s *ImageService) tempReferencesDir() string {
	return filepath.Join(s.config.ImageMetadataDir(), tempImageReferencePrefix)
}

func (s *ImageService) tempReferenceDocumentPath() string {
	return filepath.Join(s.config.ImageMetadataDir(), tempImageReferenceDocumentName)
}

func (s *ImageService) loadTempReferenceImages() []TempReferenceImage {
	var value any
	if s.store != nil {
		value = loadStoredJSON(s.store, tempImageReferenceDocumentName)
	} else {
		data, err := os.ReadFile(s.tempReferenceDocumentPath())
		if err == nil {
			_ = json.Unmarshal(data, &value)
		}
	}
	raw := util.AsMapSlice(value)
	if len(raw) == 0 {
		raw = util.AsMapSlice(util.StringMap(value)["items"])
	}
	items := make([]TempReferenceImage, 0, len(raw))
	for _, item := range raw {
		ref := TempReferenceImage{
			ID:                strings.TrimSpace(util.Clean(item["id"])),
			OwnerID:           strings.TrimSpace(util.Clean(item["owner_id"])),
			ClientReferenceID: strings.TrimSpace(util.Clean(item["client_reference_id"])),
			ConversationID:    strings.TrimSpace(util.Clean(item["conversation_id"])),
			TurnID:            strings.TrimSpace(util.Clean(item["turn_id"])),
			Filename:          strings.TrimSpace(util.Clean(item["filename"])),
			ContentType:       strings.TrimSpace(util.Clean(item["content_type"])),
			Path:              strings.TrimSpace(util.Clean(item["path"])),
			Size:              int64(util.ToInt(item["size"], 0)),
			Width:             util.ToInt(item["width"], 0),
			Height:            util.ToInt(item["height"], 0),
			CreatedAt:         strings.TrimSpace(util.Clean(item["created_at"])),
			ExpiresAt:         strings.TrimSpace(util.Clean(item["expires_at"])),
		}
		if ref.ID == "" || ref.OwnerID == "" || ref.Path == "" {
			continue
		}
		items = append(items, ref)
	}
	return items
}

func (s *ImageService) saveTempReferenceImage(ref TempReferenceImage) error {
	items := s.loadTempReferenceImages()
	replaced := false
	for index, item := range items {
		if item.ID == ref.ID {
			items[index] = ref
			replaced = true
			break
		}
	}
	if !replaced {
		items = append(items, ref)
	}
	return s.saveTempReferenceImages(items)
}

func (s *ImageService) saveTempReferenceImages(items []TempReferenceImage) error {
	out := make([]map[string]any, 0, len(items))
	for _, item := range items {
		if item.ID == "" || item.OwnerID == "" || item.Path == "" {
			continue
		}
		out = append(out, map[string]any{
			"id":                  item.ID,
			"owner_id":            item.OwnerID,
			"client_reference_id": item.ClientReferenceID,
			"conversation_id":     item.ConversationID,
			"turn_id":             item.TurnID,
			"filename":            item.Filename,
			"content_type":        item.ContentType,
			"path":                item.Path,
			"size":                item.Size,
			"width":               item.Width,
			"height":              item.Height,
			"created_at":          item.CreatedAt,
			"expires_at":          item.ExpiresAt,
		})
	}
	doc := map[string]any{"items": out}
	if s.store != nil {
		return saveStoredJSON(s.store, tempImageReferenceDocumentName, doc)
	}
	if err := os.MkdirAll(filepath.Dir(s.tempReferenceDocumentPath()), 0o755); err != nil {
		return err
	}
	return writeJSONFile(s.tempReferenceDocumentPath(), doc)
}

func (s *ImageService) tempReferenceByClientID(ownerID, clientReferenceID string) (TempReferenceImage, bool) {
	clientReferenceID = strings.TrimSpace(clientReferenceID)
	if clientReferenceID == "" {
		return TempReferenceImage{}, false
	}
	key := util.SHA1Short(ownerID+":"+clientReferenceID, 24)
	items := s.loadTempReferenceImages()
	for _, item := range items {
		if item.OwnerID == ownerID && (item.ClientReferenceID == clientReferenceID || item.ID == "ref_"+key) {
			return item, true
		}
	}
	return TempReferenceImage{}, false
}

func (s *ImageService) writeImageReferencesForRef(ref imageFileRef, refs []GeneratedImageReference) []imageReferenceMetadata {
	if len(refs) == 0 {
		return nil
	}
	if err := s.removeImageReferences(ref.rel); err != nil {
		return nil
	}
	root, err := filepath.Abs(s.imageReferencesDir())
	if err != nil {
		return nil
	}
	dir := filepath.Join(root, filepath.FromSlash(ref.rel+".refs"))
	if !pathInsideRoot(root, dir) {
		return nil
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil
	}
	result := make([]imageReferenceMetadata, 0, len(refs))
	for index, source := range refs {
		if len(source.Data) == 0 {
			continue
		}
		filename := safeImageReferenceFilename(source.Filename, index)
		rel := filepath.ToSlash(filepath.Join(ref.rel+".refs", strconv.Itoa(index+1)+"-"+filename))
		if _, err := cleanImageReferenceRelativePath(rel); err != nil {
			continue
		}
		path := filepath.Join(root, filepath.FromSlash(rel))
		if !pathInsideRoot(root, path) {
			continue
		}
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			continue
		}
		if err := os.WriteFile(path, source.Data, 0o644); err != nil {
			continue
		}
		result = append(result, imageReferenceMetadata{
			Path:        rel,
			Filename:    strings.TrimSpace(source.Filename),
			ContentType: strings.TrimSpace(source.ContentType),
			Size:        int64(len(source.Data)),
		})
	}
	if len(result) == 0 {
		_ = os.Remove(dir)
		removeEmptyParentDirs(root, filepath.Dir(dir))
	}
	return result
}

func (s *ImageService) removeImageReferences(sourceRel string) error {
	sourceRel, err := cleanImageRelativePath(sourceRel)
	if err != nil {
		return err
	}
	root, err := filepath.Abs(s.imageReferencesDir())
	if err != nil {
		return err
	}
	dir := filepath.Join(root, filepath.FromSlash(sourceRel+".refs"))
	if !pathInsideRoot(root, dir) {
		return errors.New("invalid image path")
	}
	removeErr := os.RemoveAll(dir)
	if removeErr != nil && !errors.Is(removeErr, os.ErrNotExist) {
		return removeErr
	}
	removeEmptyParentDirs(root, filepath.Dir(dir))
	return nil
}

func (s *ImageService) imageCleanupCandidates() []imageCleanupCandidate {
	root, err := filepath.Abs(s.config.ImagesDir())
	if err != nil {
		return nil
	}
	candidates := make([]imageCleanupCandidate, 0)
	seen := map[string]struct{}{}
	_ = filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		rel, relErr := filepath.Rel(root, path)
		if relErr != nil {
			return nil
		}
		rel = filepath.ToSlash(rel)
		info, statErr := d.Info()
		if statErr != nil {
			return nil
		}
		seen[rel] = struct{}{}
		meta := s.imageMetadata(rel)
		candidates = append(candidates, imageCleanupCandidate{
			rel:       rel,
			path:      path,
			info:      info,
			meta:      meta,
			groupSize: s.imageGroupSize(rel, info.Size()),
		})
		return nil
	})
	for _, entry := range s.imageIndexEntries() {
		if entry.Path == "" || entry.ObjectKey == "" {
			continue
		}
		if _, ok := seen[entry.Path]; ok {
			continue
		}
		modTime := time.Now()
		if entry.ModifiedUnixNano > 0 {
			modTime = time.Unix(0, entry.ModifiedUnixNano)
		}
		meta := s.imageMetadata(entry.Path)
		if meta.ObjectKey == "" {
			meta.StorageBackend = entry.StorageBackend
			meta.ObjectKey = entry.ObjectKey
			meta.ObjectURL = entry.ObjectURL
		}
		info := memoryFileInfo{name: firstNonEmptyString(entry.Name, filepath.Base(filepath.FromSlash(entry.Path))), size: entry.Size, modTime: modTime}
		candidates = append(candidates, imageCleanupCandidate{
			rel:       entry.Path,
			path:      filepath.Join(root, filepath.FromSlash(entry.Path)),
			info:      info,
			meta:      meta,
			groupSize: s.imageGroupSize(entry.Path, entry.Size),
		})
	}
	return candidates
}

func (s *ImageService) cleanupByRetention(retentionDays int, includePublic bool) (imageStorageRemovalStats, int, error) {
	if retentionDays < 1 {
		retentionDays = 1
	}
	cutoff := time.Now().Add(-time.Duration(retentionDays) * 24 * time.Hour)
	var total imageStorageRemovalStats
	preservedPublic := 0
	for _, candidate := range s.imageCleanupCandidates() {
		if !candidate.info.ModTime().Before(cutoff) {
			continue
		}
		if candidate.meta.Visibility == ImageVisibilityPublic && !includePublic {
			preservedPublic++
			continue
		}
		stats, err := s.removeImageGroup(candidate.rel)
		if err != nil {
			return total, preservedPublic, err
		}
		total.add(stats)
	}
	return total, preservedPublic, nil
}

func (s *ImageService) cleanupByUserImageLimit(maxImagesPerUser int, includePublic bool) (imageStorageRemovalStats, int, error) {
	if maxImagesPerUser <= 0 {
		return imageStorageRemovalStats{}, 0, nil
	}
	owned := map[string][]imageCleanupCandidate{}
	for _, candidate := range s.imageCleanupCandidates() {
		if candidate.meta.LibraryScope == ImageLibraryScopeTeam {
			continue
		}
		ownerID := strings.TrimSpace(candidate.meta.OwnerID)
		if ownerID == "" {
			continue
		}
		owned[ownerID] = append(owned[ownerID], candidate)
	}
	var total imageStorageRemovalStats
	preservedPublic := 0
	for _, candidates := range owned {
		sort.Slice(candidates, func(i, j int) bool {
			return candidates[i].info.ModTime().After(candidates[j].info.ModTime())
		})
		for index, candidate := range candidates {
			if index < maxImagesPerUser {
				continue
			}
			stats, err := s.removeImageGroup(candidate.rel)
			if err != nil {
				return total, preservedPublic, err
			}
			total.add(stats)
		}
	}
	return total, preservedPublic, nil
}

func (s *ImageService) cleanupByStorageLimit(maxBytes int64, includePublic bool) (imageStorageRemovalStats, int, error) {
	if maxBytes <= 0 {
		return imageStorageRemovalStats{}, 0, nil
	}
	summary := s.StorageGovernance()
	if summary.TotalBytes <= maxBytes {
		return imageStorageRemovalStats{}, 0, nil
	}
	candidates := s.imageCleanupCandidates()
	sort.Slice(candidates, func(i, j int) bool {
		leftPublic := candidates[i].meta.Visibility == ImageVisibilityPublic
		rightPublic := candidates[j].meta.Visibility == ImageVisibilityPublic
		if leftPublic != rightPublic {
			return !leftPublic
		}
		return candidates[i].info.ModTime().Before(candidates[j].info.ModTime())
	})
	current := summary.TotalBytes
	var total imageStorageRemovalStats
	preservedPublic := 0
	for _, candidate := range candidates {
		if current <= maxBytes {
			break
		}
		if candidate.meta.Visibility == ImageVisibilityPublic && !includePublic {
			preservedPublic++
			continue
		}
		stats, err := s.removeImageGroup(candidate.rel)
		if err != nil {
			return total, preservedPublic, err
		}
		total.add(stats)
		if stats.bytes > 0 {
			current -= stats.bytes
		} else {
			current -= candidate.groupSize
		}
	}
	return total, preservedPublic, nil
}

func (s *ImageService) removeImageGroup(rel string) (imageStorageRemovalStats, error) {
	rel, err := cleanImageRelativePath(rel)
	if err != nil {
		return imageStorageRemovalStats{}, err
	}
	meta := s.imageMetadata(rel)
	entry, hasEntry := s.imageIndexEntry(rel)
	objectSize := int64(0)
	if hasEntry && entry.Size > 0 {
		objectSize = entry.Size
	}
	objectRemoved := false
	var stats imageStorageRemovalStats
	if meta.ObjectKey != "" {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		err := imagestore.DeleteFromEnv(ctx, meta.ObjectKey)
		cancel()
		if err != nil {
			return stats, err
		}
		objectRemoved = true
	}
	thumbnailRoot, err := filepath.Abs(s.config.ImageThumbnailsDir())
	if err != nil {
		return stats, err
	}
	if removed, bytes, err := s.removeImageThumbnailWithStats(thumbnailRoot, rel); err != nil {
		return stats, err
	} else if removed > 0 {
		stats.thumbnails++
		if removed > 1 {
			stats.metadataFiles += removed - 1
		}
		stats.bytes += bytes
	}
	previewRoot, err := filepath.Abs(s.config.ImagePreviewsDir())
	if err != nil {
		return stats, err
	}
	if removed, bytes, err := s.removeImagePreviewWithStats(previewRoot, rel); err != nil {
		return stats, err
	} else if removed > 0 {
		stats.previews++
		if removed > 1 {
			stats.metadataFiles += removed - 1
		}
		stats.bytes += bytes
	}
	if removed, bytes, err := s.removeImageReferencesWithStats(rel); err != nil {
		return stats, err
	} else {
		stats.referenceFiles += removed
		stats.bytes += bytes
	}
	if removed, bytes, err := s.removeImageOwnerWithStats(rel); err != nil {
		return stats, err
	} else {
		stats.metadataFiles += removed
		stats.bytes += bytes
	}
	imageRoot, err := filepath.Abs(s.config.ImagesDir())
	if err != nil {
		return stats, err
	}
	imagePath := filepath.Join(imageRoot, filepath.FromSlash(rel))
	if !pathInsideRoot(imageRoot, imagePath) {
		return stats, errors.New("invalid image path")
	}
	if removed, bytes, err := removeFileWithStats(imagePath); err != nil {
		return stats, err
	} else if removed {
		stats.images++
		stats.imagePaths = append(stats.imagePaths, rel)
		stats.bytes += bytes
		objectRemoved = false
	}
	if objectRemoved {
		stats.images++
		stats.imagePaths = append(stats.imagePaths, rel)
		stats.bytes += objectSize
	}
	removeEmptyParentDirs(imageRoot, filepath.Dir(imagePath))
	return stats, nil
}

func (s *ImageService) removeImageOwnerWithStats(rel string) (int, int64, error) {
	if s.store != nil {
		if err := s.store.DeleteJSONDocument(imageOwnerDocumentName(rel)); err != nil {
			return 0, 0, err
		}
		return 1, 0, nil
	}
	metaPath, err := s.imageOwnerMetadataPath(rel)
	if err != nil {
		return 0, 0, err
	}
	removed, bytes, err := removeFileWithStats(metaPath)
	if err != nil {
		return 0, 0, err
	}
	if removed {
		removeEmptyParentDirs(s.config.ImageMetadataDir(), filepath.Dir(metaPath))
		return 1, bytes, nil
	}
	return 0, 0, nil
}

func (s *ImageService) removeImageReferencesWithStats(sourceRel string) (int, int64, error) {
	sourceRel, err := cleanImageRelativePath(sourceRel)
	if err != nil {
		return 0, 0, err
	}
	root, err := filepath.Abs(s.imageReferencesDir())
	if err != nil {
		return 0, 0, err
	}
	dir := filepath.Join(root, filepath.FromSlash(sourceRel+".refs"))
	if !pathInsideRoot(root, dir) {
		return 0, 0, errors.New("invalid image path")
	}
	bytes, files := directorySize(dir, "")
	removeErr := os.RemoveAll(dir)
	if removeErr != nil && !errors.Is(removeErr, os.ErrNotExist) {
		return 0, 0, removeErr
	}
	removeEmptyParentDirs(root, filepath.Dir(dir))
	return files, bytes, nil
}

func (s *ImageService) removeImageThumbnailWithStats(root, rel string) (int, int64, error) {
	thumbPath := filepath.Join(root, filepath.FromSlash(rel)+thumbnailExtension)
	if !pathInsideRoot(root, thumbPath) {
		return 0, 0, errors.New("invalid image path")
	}
	removed := 0
	var bytes int64
	if didRemove, size, err := removeFileWithStats(thumbPath); err != nil {
		return 0, 0, err
	} else if didRemove {
		removed++
		bytes += size
	}
	if didRemove, size, err := removeFileWithStats(thumbPath + ".json"); err != nil {
		return 0, 0, err
	} else if didRemove {
		removed++
		bytes += size
	}
	if s.store != nil {
		if err := s.store.DeleteJSONDocument(thumbnailMetadataDocumentName(rel)); err != nil {
			return 0, 0, err
		}
	}
	removeEmptyParentDirs(root, filepath.Dir(thumbPath))
	return removed, bytes, nil
}

func (s *ImageService) removeImagePreviewWithStats(root, rel string) (int, int64, error) {
	previewPath := filepath.Join(root, filepath.FromSlash(rel)+thumbnailExtension)
	if !pathInsideRoot(root, previewPath) {
		return 0, 0, errors.New("invalid image path")
	}
	removed := 0
	var bytes int64
	if didRemove, size, err := removeFileWithStats(previewPath); err != nil {
		return 0, 0, err
	} else if didRemove {
		removed++
		bytes += size
	}
	if didRemove, size, err := removeFileWithStats(previewPath + ".json"); err != nil {
		return 0, 0, err
	} else if didRemove {
		removed++
		bytes += size
	}
	if s.store != nil {
		if err := s.store.DeleteJSONDocument(previewMetadataDocumentName(rel)); err != nil {
			return 0, 0, err
		}
	}
	removeEmptyParentDirs(root, filepath.Dir(previewPath))
	return removed, bytes, nil
}

func (s *ImageService) clearThumbnailCache() (imageStorageRemovalStats, error) {
	root := s.config.ImageThumbnailsDir()
	bytes, thumbnails, metadataFiles := thumbnailCacheStats(root)
	if err := os.RemoveAll(root); err != nil && !errors.Is(err, os.ErrNotExist) {
		return imageStorageRemovalStats{}, err
	}
	if err := os.MkdirAll(root, 0o755); err != nil {
		return imageStorageRemovalStats{}, err
	}
	return imageStorageRemovalStats{bytes: bytes, thumbnails: thumbnails, metadataFiles: metadataFiles}, nil
}

func (s *ImageService) clearPreviewCache() (imageStorageRemovalStats, error) {
	root := s.config.ImagePreviewsDir()
	bytes, previews, metadataFiles := thumbnailCacheStats(root)
	if err := os.RemoveAll(root); err != nil && !errors.Is(err, os.ErrNotExist) {
		return imageStorageRemovalStats{}, err
	}
	if err := os.MkdirAll(root, 0o755); err != nil {
		return imageStorageRemovalStats{}, err
	}
	return imageStorageRemovalStats{bytes: bytes, previews: previews, metadataFiles: metadataFiles}, nil
}

func (s *ImageService) imageGroupSize(rel string, imageSize int64) int64 {
	total := imageSize
	thumbPath := s.thumbnailPath(rel)
	previewPath := s.previewPath(rel)
	for _, path := range []string{thumbPath, thumbPath + ".json", previewPath, previewPath + ".json"} {
		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			total += info.Size()
		}
	}
	metaPath, err := s.imageOwnerMetadataPath(rel)
	if err == nil {
		if info, statErr := os.Stat(metaPath); statErr == nil && !info.IsDir() {
			total += info.Size()
		}
	}
	refDir := filepath.Join(s.imageReferencesDir(), filepath.FromSlash(rel+".refs"))
	refBytes, _ := directorySize(refDir, "")
	total += refBytes
	return total
}

func (s *ImageService) imageOwnerMetadataPath(rel string) (string, error) {
	rel, err := cleanImageRelativePath(rel)
	if err != nil {
		return "", err
	}
	root, err := filepath.Abs(s.config.ImageMetadataDir())
	if err != nil {
		return "", err
	}
	metaPath := filepath.Join(root, filepath.FromSlash(rel)+".json")
	if !pathInsideRoot(root, metaPath) {
		return "", errors.New("invalid image path")
	}
	return metaPath, nil
}

func (s *ImageService) readThumbnailMetadata(rel, metaPath string, sourceMtime time.Time) map[string]any {
	if s.store != nil {
		raw, err := s.store.LoadJSONDocument(thumbnailMetadataDocumentName(rel))
		if err == nil {
			if meta, ok := raw.(map[string]any); ok && meta["width"] != nil && meta["height"] != nil {
				return meta
			}
		}
	}
	return readImageMetadata(metaPath, sourceMtime)
}

func (s *ImageService) readPreviewMetadata(rel, metaPath string, sourceMtime time.Time) map[string]any {
	if s.store != nil {
		raw, err := s.store.LoadJSONDocument(previewMetadataDocumentName(rel))
		if err == nil {
			if meta, ok := raw.(map[string]any); ok && meta["width"] != nil && meta["height"] != nil {
				return meta
			}
		}
	}
	return readImageMetadata(metaPath, sourceMtime)
}

func (s *ImageService) writeThumbnailMetadata(rel, metaPath string, value map[string]any) error {
	if s.store != nil {
		return s.store.SaveJSONDocument(thumbnailMetadataDocumentName(rel), value)
	}
	return writeJSONFile(metaPath, value)
}

func (s *ImageService) writePreviewMetadata(rel, metaPath string, value map[string]any) error {
	if s.store != nil {
		return s.store.SaveJSONDocument(previewMetadataDocumentName(rel), value)
	}
	return writeJSONFile(metaPath, value)
}

func (s *ImageService) removeImageThumbnail(root, rel string) error {
	if s.store != nil {
		if err := s.store.DeleteJSONDocument(thumbnailMetadataDocumentName(rel)); err != nil {
			return err
		}
	}
	return removeImageThumbnail(root, rel)
}

func imageOwnerDocumentName(rel string) string {
	return "image_metadata/" + filepath.ToSlash(rel) + ".json"
}

type imageMetadataFieldOptions struct {
	BaseURL                string
	IncludeReusableFields  bool
	IncludeReferenceImages bool
}

func addImageMetadataFields(item map[string]any, meta imageMetadata, optionsValues ...imageMetadataFieldOptions) {
	options := imageMetadataFieldOptions{IncludeReusableFields: true, IncludeReferenceImages: true}
	if len(optionsValues) > 0 {
		options = optionsValues[0]
	}
	item["tags"] = append([]string(nil), meta.Tags...)
	if meta.OwnerID != "" {
		item["owner_id"] = meta.OwnerID
	}
	if meta.OwnerName != "" {
		item["owner_name"] = meta.OwnerName
	}
	item["library_scope"] = meta.LibraryScope
	if meta.CollectionID != "" {
		item["collection_id"] = meta.CollectionID
	}
	if meta.CollectionName != "" {
		item["collection_name"] = meta.CollectionName
	}
	if meta.TeamID != "" {
		item["team_id"] = meta.TeamID
	}
	if meta.TeamName != "" {
		item["team_name"] = meta.TeamName
	}
	if meta.MovedByUserID != "" {
		item["moved_by_user_id"] = meta.MovedByUserID
	}
	if meta.MovedAt != "" {
		item["moved_at"] = meta.MovedAt
	}
	if meta.PublishedAt != "" {
		item["published_at"] = meta.PublishedAt
	}
	item["share_prompt_parameters"] = meta.SharePromptParams
	item["share_reference_images"] = meta.ShareReferences
	if options.IncludeReusableFields {
		if meta.Prompt != "" {
			item["prompt"] = meta.Prompt
		}
		if meta.Model != "" {
			item["model"] = meta.Model
		}
		if meta.Quality != "" {
			item["quality"] = meta.Quality
		}
		if meta.ResolutionPreset != "" {
			item["resolution_preset"] = meta.ResolutionPreset
		}
		if meta.RequestedSize != "" {
			item["requested_size"] = meta.RequestedSize
		}
		if meta.OutputFormat != "" {
			item["output_format"] = meta.OutputFormat
		}
		if meta.OutputCompression != nil {
			item["output_compression"] = *meta.OutputCompression
		}
		if meta.Background != "" {
			item["background"] = meta.Background
		}
		if meta.Moderation != "" {
			item["moderation"] = meta.Moderation
		}
		if meta.Style != "" {
			item["style"] = meta.Style
		}
		if meta.PartialImages != nil {
			item["partial_images"] = *meta.PartialImages
		}
		if meta.InputImageMask != "" {
			item["input_image_mask"] = meta.InputImageMask
		}
		if meta.ProfessionalMode {
			item["professional_mode"] = true
		}
		if len(meta.ProStudio) > 0 {
			item["pro_studio"] = util.CopyMap(meta.ProStudio)
		}
		if len(meta.OfficialSettings) > 0 {
			item["official_settings"] = util.CopyMap(meta.OfficialSettings)
		}
	}
	if options.IncludeReferenceImages && len(meta.ReferenceImages) > 0 {
		baseURL := strings.TrimSpace(options.BaseURL)
		referenceItems := make([]map[string]any, 0, len(meta.ReferenceImages))
		referenceURLs := make([]string, 0, len(meta.ReferenceImages))
		for _, ref := range meta.ReferenceImages {
			if ref.Path == "" {
				continue
			}
			refItem := map[string]any{"path": ref.Path}
			if ref.Filename != "" {
				refItem["filename"] = ref.Filename
			}
			if ref.ContentType != "" {
				refItem["content_type"] = ref.ContentType
			}
			if ref.Size > 0 {
				refItem["size"] = ref.Size
			}
			if baseURL != "" {
				url := publicAssetURL(baseURL, "image-references", ref.Path)
				refItem["url"] = url
				referenceURLs = append(referenceURLs, url)
			}
			referenceItems = append(referenceItems, refItem)
		}
		if len(referenceItems) > 0 {
			item["reference_images"] = referenceItems
		}
		if len(referenceURLs) > 0 {
			item["reference_image_urls"] = referenceURLs
		}
	}
}

func NormalizeImageVisibility(value string) (string, error) {
	switch strings.TrimSpace(value) {
	case "", ImageVisibilityPrivate:
		return ImageVisibilityPrivate, nil
	case ImageVisibilityPublic:
		return ImageVisibilityPublic, nil
	default:
		return "", errors.New("visibility must be private or public")
	}
}

func NormalizeImageTags(value any) []string {
	var raw []string
	switch tags := value.(type) {
	case []string:
		raw = tags
	case []any:
		raw = make([]string, 0, len(tags))
		for _, item := range tags {
			raw = append(raw, toString(item))
		}
	case string:
		raw = strings.FieldsFunc(tags, func(r rune) bool {
			return r == ',' || r == '，' || r == '\n' || r == '\t'
		})
	default:
		return nil
	}
	seen := map[string]struct{}{}
	out := make([]string, 0, len(raw))
	for _, tag := range raw {
		tag = normalizeImageTag(tag)
		if tag == "" {
			continue
		}
		key := strings.ToLower(tag)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, tag)
		if len(out) >= 20 {
			break
		}
	}
	return out
}

func cleanMetadataMap(value any) map[string]any {
	raw := util.StringMap(value)
	if len(raw) == 0 {
		return nil
	}
	out := make(map[string]any, len(raw))
	for key, item := range raw {
		key = strings.TrimSpace(key)
		if key == "" || item == nil {
			continue
		}
		out[key] = item
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func normalizeImageTag(value string) string {
	value = strings.TrimSpace(value)
	value = strings.Join(strings.Fields(value), " ")
	if len([]rune(value)) > 32 {
		value = string([]rune(value)[:32])
	}
	return value
}

func imageTagsContainAll(tags []string, required []string) bool {
	if len(required) == 0 {
		return true
	}
	normalized := NormalizeImageTags(tags)
	for _, tag := range NormalizeImageTags(required) {
		if !imageTagContains(normalized, tag) {
			return false
		}
	}
	return true
}

func imageTagContains(tags []string, target string) bool {
	target = strings.ToLower(normalizeImageTag(target))
	if target == "" {
		return false
	}
	for _, tag := range tags {
		if strings.ToLower(normalizeImageTag(tag)) == target {
			return true
		}
	}
	return false
}

func removeImageTag(tags []string, target string) []string {
	target = strings.ToLower(normalizeImageTag(target))
	out := make([]string, 0, len(tags))
	for _, tag := range NormalizeImageTags(tags) {
		if strings.ToLower(normalizeImageTag(tag)) != target {
			out = append(out, tag)
		}
	}
	return out
}

func normalizeImageCollectionID(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	var builder strings.Builder
	for _, char := range value {
		switch {
		case char >= 'a' && char <= 'z':
			builder.WriteRune(char)
		case char >= 'A' && char <= 'Z':
			builder.WriteRune(char + ('a' - 'A'))
		case char >= '0' && char <= '9':
			builder.WriteRune(char)
		case char == '-' || char == '_':
			builder.WriteRune(char)
		}
		if builder.Len() >= 64 {
			break
		}
	}
	return builder.String()
}

func normalizeImageCollectionName(value string) string {
	value = strings.TrimSpace(value)
	value = strings.Join(strings.Fields(value), " ")
	if len([]rune(value)) > 40 {
		value = string([]rune(value)[:40])
	}
	return value
}

func uploadedImageContentType(data []byte, value string) string {
	detected := strings.TrimSpace(strings.ToLower(strings.Split(http.DetectContentType(data), ";")[0]))
	if detected == "image/jpg" {
		detected = "image/jpeg"
	}
	if strings.HasPrefix(detected, "image/") {
		return detected
	}
	switch strings.TrimSpace(strings.ToLower(value)) {
	case "image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp":
		if strings.TrimSpace(strings.ToLower(value)) == "image/jpg" {
			return "image/jpeg"
		}
		return strings.TrimSpace(strings.ToLower(value))
	}
	switch http.DetectContentType(data) {
	case "image/jpeg":
		return "image/jpeg"
	case "image/gif":
		return "image/gif"
	case "image/webp":
		return "image/webp"
	default:
		return "image/png"
	}
}

func uploadedImageExtension(filename, contentType string) string {
	switch strings.TrimSpace(strings.ToLower(contentType)) {
	case "image/jpeg", "image/jpg":
		return ".jpg"
	case "image/gif":
		return ".gif"
	case "image/webp":
		return ".webp"
	case "image/png":
		return ".png"
	}
	switch strings.ToLower(filepath.Ext(filename)) {
	case ".jpg", ".jpeg":
		return ".jpg"
	case ".gif":
		return ".gif"
	case ".webp":
		return ".webp"
	default:
		return ".png"
	}
}

func imageDay(rel string, modTime time.Time) string {
	parts := strings.Split(rel, "/")
	if len(parts) >= 4 {
		return strings.Join(parts[:3], "-")
	}
	return modTime.Format("2006-01-02")
}

func thumbnailMetadataDocumentName(rel string) string {
	return "image_thumbnails/" + filepath.ToSlash(rel) + thumbnailExtension + ".json"
}

func previewMetadataDocumentName(rel string) string {
	return "image_previews/" + filepath.ToSlash(rel) + thumbnailExtension + ".json"
}

func sourceImageRelativePathFromThumbnail(value string) (string, error) {
	return sourceImageRelativePathFromCache(value, "thumbnail")
}

func sourceImageRelativePathFromPreview(value string) (string, error) {
	return sourceImageRelativePathFromCache(value, "preview")
}

func sourceImageRelativePathFromCache(value, label string) (string, error) {
	cacheRel, err := cleanImageRelativePath(value)
	if err != nil {
		return "", err
	}
	if !strings.HasSuffix(cacheRel, thumbnailExtension) {
		return "", fmt.Errorf("invalid %s path", label)
	}
	return cleanImageRelativePath(strings.TrimSuffix(cacheRel, thumbnailExtension))
}

func setImageItemDimensions(item map[string]any, widthValue, heightValue any) bool {
	width, height, ok := imageDimensionsFromValues(widthValue, heightValue)
	if !ok {
		return false
	}
	item["width"] = width
	item["height"] = height
	item["resolution"] = strconv.Itoa(width) + "x" + strconv.Itoa(height)
	item["aspect_ratio"] = simplifiedAspectRatio(width, height)
	item["orientation"] = imageOrientation(width, height)
	item["megapixels"] = float64(width) * float64(height) / 1_000_000
	return true
}

func imageDimensionsFromValues(widthValue, heightValue any) (int, int, bool) {
	width := numericMetaValue(widthValue)
	height := numericMetaValue(heightValue)
	if width <= 0 || height <= 0 {
		return 0, 0, false
	}
	return width, height, true
}

func imageFileDimensions(path string) (int, int, bool) {
	file, err := os.Open(path)
	if err != nil {
		return 0, 0, false
	}
	defer file.Close()
	config, _, err := image.DecodeConfig(file)
	if err != nil || config.Width <= 0 || config.Height <= 0 {
		return 0, 0, false
	}
	return config.Width, config.Height, true
}

func imageRefDimensions(ref imageFileRef) (int, int, bool) {
	if len(ref.data) > 0 {
		config, _, err := image.DecodeConfig(bytes.NewReader(ref.data))
		if err != nil || config.Width <= 0 || config.Height <= 0 {
			return 0, 0, false
		}
		return config.Width, config.Height, true
	}
	return imageFileDimensions(ref.path)
}

func simplifiedAspectRatio(width, height int) string {
	divisor := greatestCommonDivisor(width, height)
	if divisor <= 0 {
		return ""
	}
	return strconv.Itoa(width/divisor) + ":" + strconv.Itoa(height/divisor)
}

func imageOrientation(width, height int) string {
	if width == height {
		return "square"
	}
	if width > height {
		return "landscape"
	}
	return "portrait"
}

func greatestCommonDivisor(a, b int) int {
	if a < 0 {
		a = -a
	}
	if b < 0 {
		b = -b
	}
	for b != 0 {
		a, b = b, a%b
	}
	return a
}

func thumbnailRelativePath(root, thumbPath string) string {
	rel, err := filepath.Rel(root, thumbPath)
	if err != nil {
		return ""
	}
	return filepath.ToSlash(rel)
}

func publicAssetURL(baseURL, prefix, rel string) string {
	parts := strings.Split(filepath.ToSlash(rel), "/")
	for i, part := range parts {
		parts[i] = url.PathEscape(part)
	}
	return strings.TrimRight(baseURL, "/") + "/" + strings.Trim(prefix, "/") + "/" + strings.Join(parts, "/")
}

func thumbnailURL(baseURL, thumbRel string, sourceModTime time.Time) string {
	return publicAssetURL(baseURL, "image-thumbnails", thumbRel) +
		"?v=" + strconv.Itoa(thumbnailCacheVersion) + "-" + strconv.FormatInt(sourceModTime.UnixNano(), 10)
}

func previewURL(baseURL, previewRel string, sourceModTime time.Time) string {
	return publicAssetURL(baseURL, "image-previews", previewRel) +
		"?v=" + strconv.Itoa(imagePreviewCacheVersion) + "-" + strconv.FormatInt(sourceModTime.UnixNano(), 10)
}

func cleanImageRelativePath(value string) (string, error) {
	rel := filepath.ToSlash(strings.TrimSpace(value))
	if rel == "" || strings.ContainsRune(rel, 0) || strings.HasPrefix(rel, "/") || filepath.IsAbs(filepath.FromSlash(rel)) {
		return "", errors.New("invalid image path")
	}
	if path.Clean(rel) != rel {
		return "", errors.New("invalid image path")
	}
	for _, part := range strings.Split(rel, "/") {
		if part == "" || part == "." || part == ".." || strings.Contains(part, ":") {
			return "", errors.New("invalid image path")
		}
	}
	return rel, nil
}

func imageRelativePathFromValue(value string) (string, error) {
	text := strings.TrimSpace(value)
	if text == "" {
		return "", errors.New("invalid image path")
	}
	if parsed, err := url.Parse(text); err == nil {
		pathValue := parsed.EscapedPath()
		if pathValue == "" {
			pathValue = parsed.Path
		}
		if parsed.Scheme != "" || strings.HasPrefix(pathValue, "/") {
			const imagePrefix = "/images/"
			index := strings.Index(pathValue, imagePrefix)
			if index < 0 {
				return "", errors.New("invalid image path")
			}
			rel, err := url.PathUnescape(pathValue[index+len(imagePrefix):])
			if err != nil {
				return "", errors.New("invalid image path")
			}
			return cleanImageRelativePath(rel)
		}
	}
	return cleanImageRelativePath(text)
}

func cleanImageReferenceRelativePath(value string) (string, error) {
	rel, err := cleanImageRelativePath(value)
	if err != nil {
		return "", err
	}
	if _, err := sourceImageRelativePathFromReference(rel); err != nil {
		return "", err
	}
	return rel, nil
}

func imageReferenceRelativePathFromValue(value string) (string, error) {
	text := strings.TrimSpace(value)
	if text == "" {
		return "", errors.New("invalid image path")
	}
	if parsed, err := url.Parse(text); err == nil {
		pathValue := parsed.EscapedPath()
		if pathValue == "" {
			pathValue = parsed.Path
		}
		if parsed.Scheme != "" || strings.HasPrefix(pathValue, "/") {
			const imageReferencePrefix = "/image-references/"
			index := strings.Index(pathValue, imageReferencePrefix)
			if index < 0 {
				return "", errors.New("invalid image path")
			}
			rel, err := url.PathUnescape(pathValue[index+len(imageReferencePrefix):])
			if err != nil {
				return "", errors.New("invalid image path")
			}
			return cleanImageReferenceRelativePath(rel)
		}
	}
	return cleanImageReferenceRelativePath(text)
}

func sourceImageRelativePathFromReference(value string) (string, error) {
	rel, err := cleanImageRelativePath(value)
	if err != nil {
		return "", err
	}
	index := strings.LastIndex(rel, imageReferenceMarker)
	if index <= 0 || index+len(imageReferenceMarker) >= len(rel) {
		return "", errors.New("invalid image path")
	}
	return cleanImageRelativePath(rel[:index])
}

func normalizeImageReferenceMetadata(value any) []imageReferenceMetadata {
	items := imageReferenceMetadataItems(value)
	if len(items) == 0 {
		return nil
	}
	refs := make([]imageReferenceMetadata, 0, len(items))
	for _, item := range items {
		rel, err := cleanImageReferenceRelativePath(toString(item["path"]))
		if err != nil {
			continue
		}
		refs = append(refs, imageReferenceMetadata{
			Path:        rel,
			Filename:    strings.TrimSpace(toString(item["filename"])),
			ContentType: strings.TrimSpace(toString(item["content_type"])),
			Size:        int64(numericMetaValue(item["size"])),
		})
	}
	return refs
}

func safeImageReferenceFilename(value string, index int) string {
	name := filepath.Base(filepath.ToSlash(strings.TrimSpace(value)))
	if name == "." || name == "/" || name == "" {
		name = "reference-" + strconv.Itoa(index+1) + ".png"
	}
	var b strings.Builder
	for _, r := range name {
		switch {
		case r >= 'a' && r <= 'z':
			b.WriteRune(r)
		case r >= 'A' && r <= 'Z':
			b.WriteRune(r)
		case r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == '.', r == '-', r == '_':
			b.WriteRune(r)
		default:
			b.WriteByte('-')
		}
	}
	clean := strings.Trim(b.String(), ".- _")
	if clean == "" {
		clean = "reference-" + strconv.Itoa(index+1) + ".png"
	}
	if !strings.Contains(filepath.Base(clean), ".") {
		clean += ".png"
	}
	if len(clean) > 96 {
		ext := filepath.Ext(clean)
		stem := strings.TrimSuffix(clean, ext)
		limit := 96 - len(ext)
		if limit < 1 {
			return clean[:96]
		}
		if len(stem) > limit {
			stem = stem[:limit]
		}
		clean = stem + ext
	}
	return clean
}

func imageReferenceMetadataItems(value any) []map[string]any {
	switch v := value.(type) {
	case []map[string]any:
		return v
	case []any:
		items := make([]map[string]any, 0, len(v))
		for _, item := range v {
			if m, ok := item.(map[string]any); ok {
				items = append(items, m)
			}
		}
		return items
	default:
		return nil
	}
}

func removeImageThumbnail(root, rel string) error {
	thumbPath := filepath.Join(root, filepath.FromSlash(rel)+thumbnailExtension)
	if !pathInsideRoot(root, thumbPath) {
		return errors.New("invalid image path")
	}
	removeErr := os.Remove(thumbPath)
	if removeErr != nil && !errors.Is(removeErr, os.ErrNotExist) {
		return removeErr
	}
	metaErr := os.Remove(thumbPath + ".json")
	if metaErr != nil && !errors.Is(metaErr, os.ErrNotExist) {
		return metaErr
	}
	removeEmptyParentDirs(root, filepath.Dir(thumbPath))
	return nil
}

func (s *imageStorageRemovalStats) add(next imageStorageRemovalStats) {
	s.bytes += next.bytes
	s.images += next.images
	s.thumbnails += next.thumbnails
	s.previews += next.previews
	s.metadataFiles += next.metadataFiles
	s.referenceFiles += next.referenceFiles
	s.imagePaths = append(s.imagePaths, next.imagePaths...)
}

func removeFileWithStats(path string) (bool, int64, error) {
	info, err := os.Stat(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return false, 0, nil
		}
		return false, 0, err
	}
	if info.IsDir() {
		return false, 0, nil
	}
	size := info.Size()
	if err := os.Remove(path); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return false, 0, nil
		}
		return false, 0, err
	}
	return true, size, nil
}

func directorySize(root, skipPrefix string) (int64, int) {
	root = strings.TrimSpace(root)
	if root == "" {
		return 0, 0
	}
	if skipPrefix != "" {
		if abs, err := filepath.Abs(skipPrefix); err == nil {
			skipPrefix = abs
		}
	}
	var total int64
	files := 0
	_ = filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if skipPrefix != "" {
			if abs, absErr := filepath.Abs(path); absErr == nil && (abs == skipPrefix || strings.HasPrefix(abs, skipPrefix+string(os.PathSeparator))) {
				if d.IsDir() && abs != root {
					return filepath.SkipDir
				}
				return nil
			}
		}
		if d.IsDir() {
			return nil
		}
		info, statErr := d.Info()
		if statErr != nil {
			return nil
		}
		total += info.Size()
		files++
		return nil
	})
	return total, files
}

func thumbnailCacheStats(root string) (int64, int, int) {
	var bytes int64
	thumbnails := 0
	metadataFiles := 0
	_ = filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		info, statErr := d.Info()
		if statErr != nil {
			return nil
		}
		bytes += info.Size()
		if strings.HasSuffix(path, ".json") {
			metadataFiles++
		} else {
			thumbnails++
		}
		return nil
	})
	return bytes, thumbnails, metadataFiles
}

func writeJPEGThumbnail(path string, img image.Image, qualityValues ...int) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	quality := thumbnailQuality
	if len(qualityValues) > 0 && qualityValues[0] > 0 {
		quality = qualityValues[0]
	}
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, "."+filepath.Base(path)+".*.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	encodeErr := jpeg.Encode(tmp, img, &jpeg.Options{Quality: quality})
	closeErr := tmp.Close()
	if encodeErr != nil || closeErr != nil {
		_ = os.Remove(tmpPath)
		if encodeErr != nil {
			return encodeErr
		}
		return closeErr
	}
	if err := os.Rename(tmpPath, path); err != nil {
		if removeErr := os.Remove(path); removeErr != nil && !errors.Is(removeErr, os.ErrNotExist) {
			_ = os.Remove(tmpPath)
			return err
		}
		if renameErr := os.Rename(tmpPath, path); renameErr != nil {
			_ = os.Remove(tmpPath)
			return renameErr
		}
	}
	return nil
}

func pathInsideRoot(root, target string) bool {
	targetAbs, err := filepath.Abs(target)
	if err != nil {
		return false
	}
	rel, err := filepath.Rel(root, targetAbs)
	if err != nil {
		return false
	}
	return rel != "." && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) && !filepath.IsAbs(rel)
}

func removeEmptyParentDirs(root, start string) {
	current, err := filepath.Abs(start)
	if err != nil {
		return
	}
	for pathInsideRoot(root, current) {
		err := os.Remove(current)
		if err != nil && !errors.Is(err, os.ErrNotExist) {
			return
		}
		current = filepath.Dir(current)
	}
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

func isCurrentThumbnailMetadata(meta map[string]any) bool {
	return numericMetaValue(meta["thumbnail_version"]) == thumbnailCacheVersion &&
		numericMetaValue(meta["thumbnail_size"]) == ThumbnailSize &&
		numericMetaValue(meta["thumbnail_quality"]) == thumbnailQuality
}

func isCurrentPreviewMetadata(meta map[string]any) bool {
	return numericMetaValue(meta["preview_version"]) == imagePreviewCacheVersion &&
		numericMetaValue(meta["preview_size"]) == ImagePreviewSize &&
		numericMetaValue(meta["preview_quality"]) == imagePreviewQuality
}

func numericMetaValue(value any) int {
	n, _ := imageMetadataIntValue(value)
	return n
}

func imageMetadataIntValue(value any) (int, bool) {
	switch v := value.(type) {
	case int:
		return v, true
	case int64:
		return int(v), true
	case float64:
		return int(v), true
	case json.Number:
		n, err := v.Int64()
		if err == nil {
			return int(n), true
		}
	case string:
		text := strings.TrimSpace(v)
		if text == "" {
			return 0, false
		}
		n, err := strconv.Atoi(text)
		if err == nil {
			return n, true
		}
	default:
		return 0, false
	}
	return 0, false
}

func imageOutputCompressionMetadata(value any) *int {
	compression, ok := imageMetadataIntValue(value)
	if !ok {
		return nil
	}
	if compression < 0 {
		compression = 0
	} else if compression > 100 {
		compression = 100
	}
	return &compression
}

func positiveImageMetadataInt(value any) *int {
	count, ok := imageMetadataIntValue(value)
	if !ok {
		return nil
	}
	if count <= 0 {
		return nil
	}
	return &count
}

func boolMetadataValue(value any) bool {
	switch v := value.(type) {
	case bool:
		return v
	case string:
		switch strings.ToLower(strings.TrimSpace(v)) {
		case "1", "true", "yes", "on":
			return true
		default:
			return false
		}
	case float64:
		return v != 0
	case int:
		return v != 0
	case json.Number:
		n, err := v.Int64()
		return err == nil && n != 0
	default:
		return false
	}
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
		fy := (float64(y)+0.5)*float64(h)/float64(nh) - 0.5
		y0 := int(fy)
		dy := fy - float64(y0)
		if y0 < 0 {
			y0 = 0
			dy = 0
		}
		y1 := y0 + 1
		if y1 >= h {
			y1 = h - 1
		}
		for x := 0; x < nw; x++ {
			fx := (float64(x)+0.5)*float64(w)/float64(nw) - 0.5
			x0 := int(fx)
			dx := fx - float64(x0)
			if x0 < 0 {
				x0 = 0
				dx = 0
			}
			x1 := x0 + 1
			if x1 >= w {
				x1 = w - 1
			}
			dst.Set(x, y, bilinearColor(
				src.At(b.Min.X+x0, b.Min.Y+y0),
				src.At(b.Min.X+x1, b.Min.Y+y0),
				src.At(b.Min.X+x0, b.Min.Y+y1),
				src.At(b.Min.X+x1, b.Min.Y+y1),
				dx,
				dy,
			))
		}
	}
	return dst
}

func bilinearColor(c00, c10, c01, c11 color.Color, dx, dy float64) color.RGBA {
	r00, g00, b00, a00 := c00.RGBA()
	r10, g10, b10, a10 := c10.RGBA()
	r01, g01, b01, a01 := c01.RGBA()
	r11, g11, b11, a11 := c11.RGBA()
	return color.RGBA{
		R: uint8(bilinearChannel(r00, r10, r01, r11, dx, dy) >> 8),
		G: uint8(bilinearChannel(g00, g10, g01, g11, dx, dy) >> 8),
		B: uint8(bilinearChannel(b00, b10, b01, b11, dx, dy) >> 8),
		A: uint8(bilinearChannel(a00, a10, a01, a11, dx, dy) >> 8),
	}
}

func bilinearChannel(c00, c10, c01, c11 uint32, dx, dy float64) uint32 {
	top := float64(c00)*(1-dx) + float64(c10)*dx
	bottom := float64(c01)*(1-dx) + float64(c11)*dx
	return uint32(top*(1-dy) + bottom*dy + 0.5)
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

func firstNonEmptyString(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func maxInt64(left, right int64) int64 {
	if left > right {
		return left
	}
	return right
}
