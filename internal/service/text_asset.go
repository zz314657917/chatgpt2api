package service

import (
	"errors"
	"sort"
	"strings"
	"sync"
	"unicode/utf8"

	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

const (
	textAssetsDocumentName   = "text_assets/index.json"
	TextAssetKind            = "text"
	TextAssetMaxContentLen   = 20000
	textAssetMaxNameLen      = 80
	textAssetPreviewLen      = 160
	defaultTextAssetPageSize = 50
	maxTextAssetPageSize     = 100
)

type TextAssetAccessScope struct {
	OwnerID     string
	OwnerName   string
	TeamID      string
	TeamName    string
	TeamManager bool
}

type TextAssetListOptions struct {
	PageSize int
	Cursor   string
	Search   string
}

type TextAssetListResult struct {
	Items      []map[string]any `json:"items"`
	NextCursor string           `json:"next_cursor"`
	HasMore    bool             `json:"has_more"`
	PageSize   int              `json:"page_size"`
}

type textAssetDocument struct {
	Version   int             `json:"version"`
	UpdatedAt string          `json:"updated_at"`
	Items     []textAssetItem `json:"items"`
}

type textAssetItem struct {
	ID           string `json:"id"`
	Kind         string `json:"kind"`
	Name         string `json:"name"`
	Content      string `json:"content"`
	OwnerID      string `json:"owner_id,omitempty"`
	OwnerName    string `json:"owner_name,omitempty"`
	LibraryScope string `json:"library_scope"`
	TeamID       string `json:"team_id,omitempty"`
	TeamName     string `json:"team_name,omitempty"`
	CreatedAt    string `json:"created_at"`
	UpdatedAt    string `json:"updated_at"`
}

type TextAssetService struct {
	mu    sync.Mutex
	store storage.JSONDocumentBackend
}

func NewTextAssetService(backend ...storage.Backend) *TextAssetService {
	return &TextAssetService{store: firstJSONDocumentStore(backend)}
}

func (s *TextAssetService) List(options TextAssetListOptions, scope TextAssetAccessScope) TextAssetListResult {
	s.mu.Lock()
	defer s.mu.Unlock()

	pageSize := normalizeTextAssetPageSize(options.PageSize)
	cursor := strings.TrimSpace(options.Cursor)
	keyword := strings.ToLower(strings.TrimSpace(options.Search))
	items := s.loadLocked()
	sortTextAssets(items)

	result := TextAssetListResult{Items: []map[string]any{}, PageSize: pageSize}
	started := cursor == ""
	lastIncludedID := ""
	for _, item := range items {
		if !textAssetMatchesScope(item, scope) || !textAssetMatchesSearch(item, keyword) {
			continue
		}
		if !started {
			if item.ID == cursor {
				started = true
			}
			continue
		}
		if len(result.Items) >= pageSize {
			result.HasMore = true
			result.NextCursor = lastIncludedID
			break
		}
		result.Items = append(result.Items, textAssetPayload(item))
		lastIncludedID = item.ID
	}
	return result
}

func (s *TextAssetService) Create(body map[string]any, scope TextAssetAccessScope) (map[string]any, error) {
	if err := ensureTextAssetWritableScope(scope); err != nil {
		return nil, err
	}
	content := util.Clean(body["content"])
	name := util.Clean(body["name"])
	normalizedName, normalizedContent, err := normalizeTextAssetNameContent(name, content)
	if err != nil {
		return nil, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	now := util.NowISO()
	item := textAssetItem{
		ID:           "ta_" + util.NewHex(24),
		Kind:         TextAssetKind,
		Name:         normalizedName,
		Content:      normalizedContent,
		LibraryScope: ImageLibraryScopePersonal,
		OwnerID:      scope.OwnerID,
		OwnerName:    scope.OwnerName,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	if scope.TeamID != "" {
		item.LibraryScope = ImageLibraryScopeTeam
		item.TeamID = scope.TeamID
		item.TeamName = scope.TeamName
		item.OwnerID = ""
		item.OwnerName = ""
	}
	items := append(s.loadLocked(), item)
	sortTextAssets(items)
	if err := s.saveLocked(items); err != nil {
		return nil, err
	}
	return textAssetPayload(item), nil
}

func (s *TextAssetService) Update(id string, body map[string]any, scope TextAssetAccessScope) (map[string]any, error) {
	id = util.Clean(id)
	if id == "" {
		return nil, errors.New("text asset id is required")
	}
	if err := ensureTextAssetWritableScope(scope); err != nil {
		return nil, err
	}
	content := util.Clean(body["content"])
	name := util.Clean(body["name"])
	normalizedName, normalizedContent, err := normalizeTextAssetNameContent(name, content)
	if err != nil {
		return nil, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	items := s.loadLocked()
	for index, item := range items {
		if item.ID != id || !textAssetMatchesScope(item, scope) {
			continue
		}
		item.Name = normalizedName
		item.Content = normalizedContent
		item.UpdatedAt = util.NowISO()
		items[index] = item
		sortTextAssets(items)
		if err := s.saveLocked(items); err != nil {
			return nil, err
		}
		return textAssetPayload(item), nil
	}
	return nil, errors.New("text asset not found")
}

func (s *TextAssetService) Delete(id string, scope TextAssetAccessScope) (bool, error) {
	id = util.Clean(id)
	if id == "" || ensureTextAssetWritableScope(scope) != nil {
		return false, nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	items := s.loadLocked()
	next := make([]textAssetItem, 0, len(items))
	removed := false
	for _, item := range items {
		if item.ID == id && textAssetMatchesScope(item, scope) {
			removed = true
			continue
		}
		next = append(next, item)
	}
	if !removed {
		return false, nil
	}
	if err := s.saveLocked(next); err != nil {
		return false, err
	}
	return true, nil
}

func (s *TextAssetService) loadLocked() []textAssetItem {
	raw := util.StringMap(loadStoredJSON(s.store, textAssetsDocumentName))
	rawItems := util.AsMapSlice(raw["items"])
	items := make([]textAssetItem, 0, len(rawItems))
	for _, rawItem := range rawItems {
		if item, ok := normalizeStoredTextAsset(rawItem); ok {
			items = append(items, item)
		}
	}
	sortTextAssets(items)
	return items
}

func (s *TextAssetService) saveLocked(items []textAssetItem) error {
	sortTextAssets(items)
	return saveStoredJSON(s.store, textAssetsDocumentName, textAssetDocument{
		Version:   1,
		UpdatedAt: util.NowISO(),
		Items:     items,
	})
}

func normalizeStoredTextAsset(raw map[string]any) (textAssetItem, bool) {
	id := util.Clean(raw["id"])
	content := util.Clean(raw["content"])
	name := util.Clean(raw["name"])
	name, content, err := normalizeTextAssetNameContent(name, content)
	if err != nil || id == "" {
		return textAssetItem{}, false
	}
	scope := normalizeImageLibraryScope(util.Clean(raw["library_scope"]))
	teamID := util.Clean(raw["team_id"])
	if scope != ImageLibraryScopeTeam || teamID == "" {
		scope = ImageLibraryScopePersonal
		teamID = ""
	}
	createdAt := firstNonEmptyString(util.Clean(raw["created_at"]), util.Clean(raw["updated_at"]), util.NowISO())
	item := textAssetItem{
		ID:           id,
		Kind:         TextAssetKind,
		Name:         name,
		Content:      content,
		OwnerID:      util.Clean(raw["owner_id"]),
		OwnerName:    util.Clean(raw["owner_name"]),
		LibraryScope: scope,
		TeamID:       teamID,
		TeamName:     util.Clean(raw["team_name"]),
		CreatedAt:    createdAt,
		UpdatedAt:    firstNonEmptyString(util.Clean(raw["updated_at"]), createdAt),
	}
	if item.LibraryScope == ImageLibraryScopeTeam {
		item.OwnerID = ""
		item.OwnerName = ""
	}
	return item, true
}

func ensureTextAssetWritableScope(scope TextAssetAccessScope) error {
	if scope.TeamID != "" {
		if !scope.TeamManager {
			return errors.New("team manager permission required")
		}
		return nil
	}
	if scope.OwnerID == "" {
		return errors.New("owner_id is required")
	}
	return nil
}

func textAssetMatchesScope(item textAssetItem, scope TextAssetAccessScope) bool {
	if scope.TeamID != "" {
		return item.LibraryScope == ImageLibraryScopeTeam && item.TeamID == scope.TeamID
	}
	return scope.OwnerID != "" && item.LibraryScope == ImageLibraryScopePersonal && item.OwnerID == scope.OwnerID
}

func textAssetMatchesSearch(item textAssetItem, keyword string) bool {
	if keyword == "" {
		return true
	}
	return strings.Contains(strings.ToLower(item.Name), keyword) || strings.Contains(strings.ToLower(item.Content), keyword)
}

func textAssetPayload(item textAssetItem) map[string]any {
	value := map[string]any{
		"id":            item.ID,
		"kind":          TextAssetKind,
		"name":          item.Name,
		"content":       item.Content,
		"preview":       truncateRunes(item.Content, textAssetPreviewLen),
		"library_scope": item.LibraryScope,
		"created_at":    item.CreatedAt,
		"updated_at":    item.UpdatedAt,
	}
	if item.OwnerID != "" {
		value["owner_id"] = item.OwnerID
	}
	if item.OwnerName != "" {
		value["owner_name"] = item.OwnerName
	}
	if item.TeamID != "" {
		value["team_id"] = item.TeamID
	}
	if item.TeamName != "" {
		value["team_name"] = item.TeamName
	}
	return value
}

func normalizeTextAssetNameContent(name, content string) (string, string, error) {
	content = strings.TrimSpace(content)
	if content == "" {
		return "", "", errors.New("content is required")
	}
	if utf8.RuneCountInString(content) > TextAssetMaxContentLen {
		return "", "", errors.New("content is too long")
	}
	name = truncateRunes(strings.TrimSpace(name), textAssetMaxNameLen)
	if name == "" {
		name = truncateRunes(firstTextAssetContentLine(content), textAssetMaxNameLen)
	}
	if name == "" {
		name = "文本素材"
	}
	return name, content, nil
}

func firstTextAssetContentLine(content string) string {
	for _, line := range strings.Split(content, "\n") {
		if value := strings.TrimSpace(line); value != "" {
			return value
		}
	}
	return ""
}

func normalizeTextAssetPageSize(value int) int {
	if value <= 0 {
		return defaultTextAssetPageSize
	}
	if value > maxTextAssetPageSize {
		return maxTextAssetPageSize
	}
	return value
}

func sortTextAssets(items []textAssetItem) {
	sort.SliceStable(items, func(i, j int) bool {
		if items[i].UpdatedAt == items[j].UpdatedAt {
			return items[i].ID > items[j].ID
		}
		return items[i].UpdatedAt > items[j].UpdatedAt
	})
}

func truncateRunes(value string, limit int) string {
	if limit <= 0 || utf8.RuneCountInString(value) <= limit {
		return value
	}
	runes := []rune(value)
	return string(runes[:limit])
}
