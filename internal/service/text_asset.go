package service

import (
	"errors"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

const (
	textAssetsDocumentName            = "text_assets/index.json"
	textAssetCollectionsDocumentName  = "text_asset_collections/index.json"
	TextAssetKind                     = "text"
	TextAssetMaxContentLen            = 20000
	TextAssetCollectionUnclassifiedID = ImageCollectionUnclassifiedID
	textAssetMaxNameLen               = 80
	textAssetPreviewLen               = 160
	defaultTextAssetPageSize          = 50
	maxTextAssetPageSize              = 100
)

type TextAssetAccessScope struct {
	OwnerID     string
	OwnerName   string
	TeamID      string
	TeamName    string
	TeamManager bool
}

type TextAssetListOptions struct {
	PageSize     int
	Cursor       string
	Search       string
	CollectionID string
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

type TextAssetCollection struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	LibraryScope string `json:"library_scope"`
	OwnerID      string `json:"owner_id,omitempty"`
	TeamID       string `json:"team_id,omitempty"`
	TeamName     string `json:"team_name,omitempty"`
	CreatedAt    string `json:"created_at"`
	UpdatedAt    string `json:"updated_at"`
	TextsCount   int    `json:"texts_count"`
}

type TextAssetCollectionsResult struct {
	Items             []TextAssetCollection `json:"items"`
	UnclassifiedCount int                   `json:"unclassified_count"`
}

type textAssetCollectionDocument struct {
	Version   int                   `json:"version"`
	UpdatedAt string                `json:"updated_at"`
	Items     []TextAssetCollection `json:"items"`
}

type textAssetItem struct {
	ID             string `json:"id"`
	Kind           string `json:"kind"`
	Name           string `json:"name"`
	Content        string `json:"content"`
	CollectionID   string `json:"collection_id,omitempty"`
	CollectionName string `json:"collection_name,omitempty"`
	OwnerID        string `json:"owner_id,omitempty"`
	OwnerName      string `json:"owner_name,omitempty"`
	LibraryScope   string `json:"library_scope"`
	TeamID         string `json:"team_id,omitempty"`
	TeamName       string `json:"team_name,omitempty"`
	CreatedAt      string `json:"created_at"`
	UpdatedAt      string `json:"updated_at"`
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
	collectionID := normalizeImageCollectionID(options.CollectionID)
	items := s.loadLocked()
	sortTextAssets(items)

	result := TextAssetListResult{Items: []map[string]any{}, PageSize: pageSize}
	started := cursor == ""
	lastIncludedID := ""
	for _, item := range items {
		if !textAssetMatchesScope(item, scope) || !textAssetMatchesSearch(item, keyword) || !textAssetMatchesCollection(item, collectionID) {
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
	collectionID := normalizeImageCollectionID(util.Clean(body["collection_id"]))
	normalizedName, normalizedContent, err := normalizeTextAssetNameContent(name, content)
	if err != nil {
		return nil, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	collectionName := ""
	if collectionID == TextAssetCollectionUnclassifiedID {
		collectionID = ""
	} else if collectionID != "" {
		collection, ok := s.textAssetCollectionByIDLocked(collectionID, scope)
		if !ok {
			return nil, errors.New("collection not found")
		}
		collectionName = collection.Name
	}

	now := util.NowISO()
	item := textAssetItem{
		ID:             "ta_" + util.NewHex(24),
		Kind:           TextAssetKind,
		Name:           normalizedName,
		Content:        normalizedContent,
		CollectionID:   collectionID,
		CollectionName: collectionName,
		LibraryScope:   ImageLibraryScopePersonal,
		OwnerID:        scope.OwnerID,
		OwnerName:      scope.OwnerName,
		CreatedAt:      now,
		UpdatedAt:      now,
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

	collectionID := ""
	collectionName := ""
	updateCollection := false
	if _, ok := body["collection_id"]; ok {
		updateCollection = true
		collectionID = normalizeImageCollectionID(util.Clean(body["collection_id"]))
		if collectionID == TextAssetCollectionUnclassifiedID {
			collectionID = ""
		} else if collectionID != "" {
			collection, ok := s.textAssetCollectionByIDLocked(collectionID, scope)
			if !ok {
				return nil, errors.New("collection not found")
			}
			collectionName = collection.Name
		}
	}

	items := s.loadLocked()
	for index, item := range items {
		if item.ID != id || !textAssetMatchesScope(item, scope) {
			continue
		}
		item.Name = normalizedName
		item.Content = normalizedContent
		if updateCollection {
			item.CollectionID = collectionID
			item.CollectionName = collectionName
		}
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

func (s *TextAssetService) ListTextAssetCollections(scope TextAssetAccessScope) []TextAssetCollection {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.listTextAssetCollectionsLocked(scope)
}

func (s *TextAssetService) ListTextAssetCollectionsResult(scope TextAssetAccessScope) TextAssetCollectionsResult {
	s.mu.Lock()
	defer s.mu.Unlock()
	return TextAssetCollectionsResult{
		Items:             s.listTextAssetCollectionsLocked(scope),
		UnclassifiedCount: s.unclassifiedTextAssetCountLocked(scope),
	}
}

func (s *TextAssetService) CreateTextAssetCollection(name string, scope TextAssetAccessScope) (TextAssetCollection, error) {
	if err := ensureTextAssetWritableScope(scope); err != nil {
		return TextAssetCollection{}, err
	}
	name = normalizeImageCollectionName(name)
	if name == "" {
		return TextAssetCollection{}, errors.New("collection name is required")
	}
	collection, err := newTextAssetCollectionForScope(name, scope)
	if err != nil {
		return TextAssetCollection{}, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	collections := s.loadTextAssetCollectionsLocked()
	for _, existing := range collections {
		if textAssetCollectionMatchesScope(existing, scope) && strings.EqualFold(existing.Name, collection.Name) {
			return TextAssetCollection{}, errors.New("collection name already exists")
		}
	}
	collections = append(collections, collection)
	if err := s.saveTextAssetCollectionsLocked(collections); err != nil {
		return TextAssetCollection{}, err
	}
	return collection, nil
}

func (s *TextAssetService) RenameTextAssetCollection(id, name string, scope TextAssetAccessScope) (TextAssetCollection, error) {
	if err := ensureTextAssetWritableScope(scope); err != nil {
		return TextAssetCollection{}, err
	}
	id = normalizeImageCollectionID(id)
	name = normalizeImageCollectionName(name)
	if id == "" {
		return TextAssetCollection{}, errors.New("collection id is required")
	}
	if name == "" {
		return TextAssetCollection{}, errors.New("collection name is required")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	collections := s.loadTextAssetCollectionsLocked()
	index := -1
	for i, collection := range collections {
		if collection.ID == id && textAssetCollectionMatchesScope(collection, scope) {
			index = i
			break
		}
	}
	if index < 0 {
		return TextAssetCollection{}, errors.New("collection not found")
	}
	for _, existing := range collections {
		if existing.ID != id && textAssetCollectionMatchesScope(existing, scope) && strings.EqualFold(existing.Name, name) {
			return TextAssetCollection{}, errors.New("collection name already exists")
		}
	}
	previous := collections[index]
	if err := s.renameTextAssetCollectionOnAssetsLocked(id, name, scope); err != nil {
		return TextAssetCollection{}, err
	}
	collections[index].Name = name
	collections[index].UpdatedAt = util.NowISO()
	if err := s.saveTextAssetCollectionsLocked(collections); err != nil {
		_ = s.renameTextAssetCollectionOnAssetsLocked(id, previous.Name, scope)
		return TextAssetCollection{}, err
	}
	collections[index].TextsCount = s.textAssetCollectionCountsLocked(scope)[id]
	return collections[index], nil
}

func (s *TextAssetService) DeleteTextAssetCollection(id string, scope TextAssetAccessScope) (map[string]any, error) {
	if err := ensureTextAssetWritableScope(scope); err != nil {
		return nil, err
	}
	id = normalizeImageCollectionID(id)
	if id == "" {
		return nil, errors.New("collection id is required")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	collections := s.loadTextAssetCollectionsLocked()
	next := make([]TextAssetCollection, 0, len(collections))
	deleted := false
	deletedName := ""
	for _, collection := range collections {
		if collection.ID == id && textAssetCollectionMatchesScope(collection, scope) {
			deleted = true
			deletedName = collection.Name
			continue
		}
		next = append(next, collection)
	}
	if !deleted {
		return nil, errors.New("collection not found")
	}
	cleared, clearedIDs, err := s.clearTextAssetCollectionOnAssetsLocked(id, scope)
	if err != nil {
		return nil, err
	}
	if err := s.saveTextAssetCollectionsLocked(next); err != nil {
		if len(clearedIDs) > 0 {
			_ = s.restoreTextAssetCollectionOnAssetsLocked(id, deletedName, clearedIDs, scope)
		}
		return nil, err
	}
	return map[string]any{"deleted": true, "collection_id": id, "cleared": cleared}, nil
}

func (s *TextAssetService) UpdateTextAssetCollectionItems(collectionID string, ids []string, scope TextAssetAccessScope) (map[string]any, error) {
	if err := ensureTextAssetWritableScope(scope); err != nil {
		return nil, err
	}
	collectionID = normalizeImageCollectionID(collectionID)

	s.mu.Lock()
	defer s.mu.Unlock()

	collectionName := ""
	if collectionID == TextAssetCollectionUnclassifiedID {
		collectionID = ""
	} else if collectionID != "" {
		collection, ok := s.textAssetCollectionByIDLocked(collectionID, scope)
		if !ok {
			return nil, errors.New("collection not found")
		}
		collectionName = collection.Name
	}
	if len(ids) == 0 {
		return nil, errors.New("ids is required")
	}
	seen := make(map[string]struct{}, len(ids))
	targetIDs := make(map[string]struct{}, len(ids))
	for _, value := range ids {
		id := util.Clean(value)
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		targetIDs[id] = struct{}{}
	}
	if len(targetIDs) == 0 {
		return nil, errors.New("ids is required")
	}

	items := s.loadLocked()
	updated := 0
	missing := 0
	updatedIDs := make([]string, 0, len(targetIDs))
	for index, item := range items {
		if _, ok := targetIDs[item.ID]; !ok {
			continue
		}
		delete(targetIDs, item.ID)
		if !textAssetMatchesScope(item, scope) {
			missing++
			continue
		}
		item.CollectionID = collectionID
		item.CollectionName = collectionName
		item.UpdatedAt = util.NowISO()
		items[index] = item
		updated++
		updatedIDs = append(updatedIDs, item.ID)
	}
	missing += len(targetIDs)
	if updated > 0 {
		sortTextAssets(items)
		if err := s.saveLocked(items); err != nil {
			return nil, err
		}
	}
	return map[string]any{
		"updated":         updated,
		"missing":         missing,
		"ids":             updatedIDs,
		"collection_id":   collectionID,
		"collection_name": collectionName,
	}, nil
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

func (s *TextAssetService) loadTextAssetCollectionsLocked() []TextAssetCollection {
	raw := util.StringMap(loadStoredJSON(s.store, textAssetCollectionsDocumentName))
	rawItems := util.AsMapSlice(raw["items"])
	if len(rawItems) == 0 {
		rawItems = util.AsMapSlice(raw)
	}
	items := make([]TextAssetCollection, 0, len(rawItems))
	seen := map[string]struct{}{}
	for _, rawItem := range rawItems {
		item := normalizeTextAssetCollection(rawItem)
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

func (s *TextAssetService) saveTextAssetCollectionsLocked(items []TextAssetCollection) error {
	now := util.NowISO()
	out := make([]TextAssetCollection, 0, len(items))
	seen := map[string]struct{}{}
	for _, item := range items {
		item = normalizeTextAssetCollection(structToMapTextAssetCollection(item))
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
	return saveStoredJSON(s.store, textAssetCollectionsDocumentName, textAssetCollectionDocument{
		Version:   1,
		UpdatedAt: now,
		Items:     out,
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
		ID:             id,
		Kind:           TextAssetKind,
		Name:           name,
		Content:        content,
		CollectionID:   normalizeImageCollectionID(util.Clean(raw["collection_id"])),
		CollectionName: normalizeImageCollectionName(util.Clean(raw["collection_name"])),
		OwnerID:        util.Clean(raw["owner_id"]),
		OwnerName:      util.Clean(raw["owner_name"]),
		LibraryScope:   scope,
		TeamID:         teamID,
		TeamName:       util.Clean(raw["team_name"]),
		CreatedAt:      createdAt,
		UpdatedAt:      firstNonEmptyString(util.Clean(raw["updated_at"]), createdAt),
	}
	if item.LibraryScope == ImageLibraryScopeTeam {
		item.OwnerID = ""
		item.OwnerName = ""
	}
	return item, true
}

func newTextAssetCollectionForScope(name string, scope TextAssetAccessScope) (TextAssetCollection, error) {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	collection := TextAssetCollection{
		ID:        "tcol_" + util.SHA1Short(util.NewUUID()+":"+name, 20),
		Name:      name,
		CreatedAt: now,
		UpdatedAt: now,
	}
	if scope.TeamID != "" {
		collection.LibraryScope = ImageLibraryScopeTeam
		collection.TeamID = strings.TrimSpace(scope.TeamID)
		collection.TeamName = strings.TrimSpace(scope.TeamName)
		return collection, nil
	}
	if scope.OwnerID != "" {
		collection.LibraryScope = ImageLibraryScopePersonal
		collection.OwnerID = strings.TrimSpace(scope.OwnerID)
		return collection, nil
	}
	return TextAssetCollection{}, errors.New("collection scope is required")
}

func normalizeTextAssetCollection(raw map[string]any) TextAssetCollection {
	scope := normalizeImageLibraryScope(util.Clean(raw["library_scope"]))
	teamID := util.Clean(raw["team_id"])
	if scope != ImageLibraryScopeTeam || teamID == "" {
		scope = ImageLibraryScopePersonal
		teamID = ""
	}
	return TextAssetCollection{
		ID:           normalizeImageCollectionID(util.Clean(raw["id"])),
		Name:         normalizeImageCollectionName(util.Clean(raw["name"])),
		LibraryScope: scope,
		OwnerID:      util.Clean(raw["owner_id"]),
		TeamID:       teamID,
		TeamName:     util.Clean(raw["team_name"]),
		CreatedAt:    util.Clean(raw["created_at"]),
		UpdatedAt:    util.Clean(raw["updated_at"]),
		TextsCount:   util.ToInt(raw["texts_count"], 0),
	}
}

func structToMapTextAssetCollection(item TextAssetCollection) map[string]any {
	return map[string]any{
		"id":            item.ID,
		"name":          item.Name,
		"library_scope": item.LibraryScope,
		"owner_id":      item.OwnerID,
		"team_id":       item.TeamID,
		"team_name":     item.TeamName,
		"created_at":    item.CreatedAt,
		"updated_at":    item.UpdatedAt,
		"texts_count":   item.TextsCount,
	}
}

func textAssetCollectionMatchesScope(collection TextAssetCollection, scope TextAssetAccessScope) bool {
	if scope.TeamID != "" {
		return collection.LibraryScope == ImageLibraryScopeTeam && collection.TeamID == scope.TeamID
	}
	return scope.OwnerID != "" && collection.LibraryScope == ImageLibraryScopePersonal && collection.OwnerID == scope.OwnerID
}

func (s *TextAssetService) textAssetCollectionByIDLocked(id string, scope TextAssetAccessScope) (TextAssetCollection, bool) {
	id = normalizeImageCollectionID(id)
	if id == "" {
		return TextAssetCollection{}, false
	}
	for _, collection := range s.loadTextAssetCollectionsLocked() {
		if collection.ID == id && textAssetCollectionMatchesScope(collection, scope) {
			return collection, true
		}
	}
	return TextAssetCollection{}, false
}

func (s *TextAssetService) textAssetCollectionCountsLocked(scope TextAssetAccessScope) map[string]int {
	counts := map[string]int{}
	for _, item := range s.loadLocked() {
		if textAssetMatchesScope(item, scope) && item.CollectionID != "" {
			counts[item.CollectionID]++
		}
	}
	return counts
}

func (s *TextAssetService) unclassifiedTextAssetCountLocked(scope TextAssetAccessScope) int {
	count := 0
	for _, item := range s.loadLocked() {
		if textAssetMatchesScope(item, scope) && item.CollectionID == "" {
			count++
		}
	}
	return count
}

func (s *TextAssetService) listTextAssetCollectionsLocked(scope TextAssetAccessScope) []TextAssetCollection {
	collections := s.loadTextAssetCollectionsLocked()
	counts := s.textAssetCollectionCountsLocked(scope)
	byID := make(map[string]TextAssetCollection, len(collections)+len(counts))
	for _, collection := range collections {
		if !textAssetCollectionMatchesScope(collection, scope) {
			continue
		}
		collection.TextsCount = counts[collection.ID]
		byID[collection.ID] = collection
	}
	for _, item := range s.loadLocked() {
		if !textAssetMatchesScope(item, scope) || item.CollectionID == "" {
			continue
		}
		if _, ok := byID[item.CollectionID]; ok {
			continue
		}
		collection := TextAssetCollection{
			ID:           item.CollectionID,
			Name:         firstNonEmptyString(item.CollectionName, "素材集"),
			LibraryScope: normalizeImageLibraryScope(item.LibraryScope),
			OwnerID:      item.OwnerID,
			TeamID:       item.TeamID,
			TeamName:     item.TeamName,
			TextsCount:   counts[item.CollectionID],
		}
		byID[collection.ID] = collection
	}
	result := make([]TextAssetCollection, 0, len(byID))
	for _, collection := range byID {
		result = append(result, collection)
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].TextsCount != result[j].TextsCount {
			return result[i].TextsCount > result[j].TextsCount
		}
		return strings.ToLower(result[i].Name) < strings.ToLower(result[j].Name)
	})
	return result
}

func (s *TextAssetService) renameTextAssetCollectionOnAssetsLocked(collectionID, name string, scope TextAssetAccessScope) error {
	items := s.loadLocked()
	changed := false
	for index, item := range items {
		if item.CollectionID != collectionID || !textAssetMatchesScope(item, scope) {
			continue
		}
		item.CollectionName = name
		item.UpdatedAt = util.NowISO()
		items[index] = item
		changed = true
	}
	if !changed {
		return nil
	}
	return s.saveLocked(items)
}

func (s *TextAssetService) clearTextAssetCollectionOnAssetsLocked(collectionID string, scope TextAssetAccessScope) (int, []string, error) {
	items := s.loadLocked()
	cleared := 0
	clearedIDs := make([]string, 0)
	for index, item := range items {
		if item.CollectionID != collectionID || !textAssetMatchesScope(item, scope) {
			continue
		}
		clearedIDs = append(clearedIDs, item.ID)
		item.CollectionID = ""
		item.CollectionName = ""
		item.UpdatedAt = util.NowISO()
		items[index] = item
		cleared++
	}
	if cleared == 0 {
		return 0, nil, nil
	}
	if err := s.saveLocked(items); err != nil {
		return cleared, clearedIDs, err
	}
	return cleared, clearedIDs, nil
}

func (s *TextAssetService) restoreTextAssetCollectionOnAssetsLocked(collectionID, collectionName string, ids []string, scope TextAssetAccessScope) error {
	if len(ids) == 0 {
		return nil
	}
	targetIDs := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		id = util.Clean(id)
		if id != "" {
			targetIDs[id] = struct{}{}
		}
	}
	if len(targetIDs) == 0 {
		return nil
	}
	items := s.loadLocked()
	changed := false
	for index, item := range items {
		if _, ok := targetIDs[item.ID]; !ok || !textAssetMatchesScope(item, scope) {
			continue
		}
		item.CollectionID = collectionID
		item.CollectionName = collectionName
		item.UpdatedAt = util.NowISO()
		items[index] = item
		changed = true
	}
	if !changed {
		return nil
	}
	return s.saveLocked(items)
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

func textAssetMatchesCollection(item textAssetItem, collectionID string) bool {
	if collectionID == "" {
		return true
	}
	if collectionID == TextAssetCollectionUnclassifiedID {
		return item.CollectionID == ""
	}
	return item.CollectionID == collectionID
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
	if item.CollectionID != "" {
		value["collection_id"] = item.CollectionID
	}
	if item.CollectionName != "" {
		value["collection_name"] = item.CollectionName
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
