package service

import (
	"errors"
	"sort"
	"strings"
	"sync"

	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

const (
	videoAssetCollectionsDocumentName  = "video_asset_collections/index.json"
	videoAssetAssignmentsDocumentName  = "video_asset_collections/assignments.json"
	VideoAssetCollectionUnclassifiedID = ImageCollectionUnclassifiedID
	videoAssetMaxCollectionNameLen     = 80
)

type VideoAssetAccessScope struct {
	OwnerID   string
	OwnerName string
}

type VideoAssetCollection struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	LibraryScope string `json:"library_scope"`
	OwnerID      string `json:"owner_id,omitempty"`
	OwnerName    string `json:"owner_name,omitempty"`
	CreatedAt    string `json:"created_at"`
	UpdatedAt    string `json:"updated_at"`
	VideosCount  int    `json:"videos_count"`
}

type VideoAssetCollectionsResult struct {
	Items             []VideoAssetCollection `json:"items"`
	UnclassifiedCount int                    `json:"unclassified_count"`
}

type videoAssetCollectionDocument struct {
	Version   int                    `json:"version"`
	UpdatedAt string                 `json:"updated_at"`
	Items     []VideoAssetCollection `json:"items"`
}

type videoAssetAssignment struct {
	AssetID        string `json:"asset_id"`
	CollectionID   string `json:"collection_id,omitempty"`
	CollectionName string `json:"collection_name,omitempty"`
	OwnerID        string `json:"owner_id"`
	OwnerName      string `json:"owner_name,omitempty"`
	CreatedAt      string `json:"created_at"`
	UpdatedAt      string `json:"updated_at"`
}

type videoAssetAssignmentDocument struct {
	Version   int                    `json:"version"`
	UpdatedAt string                 `json:"updated_at"`
	Items     []videoAssetAssignment `json:"items"`
}

type VideoAssetService struct {
	mu    sync.Mutex
	store storage.JSONDocumentBackend
}

func NewVideoAssetService(backend ...storage.Backend) *VideoAssetService {
	return &VideoAssetService{store: firstJSONDocumentStore(backend)}
}

func (s *VideoAssetService) ListVideoAssetCollections(scope VideoAssetAccessScope, assetIDs []string) []VideoAssetCollection {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.listVideoAssetCollectionsLocked(scope, assetIDs)
}

func (s *VideoAssetService) ListVideoAssetCollectionsResult(scope VideoAssetAccessScope, assetIDs []string) VideoAssetCollectionsResult {
	s.mu.Lock()
	defer s.mu.Unlock()
	return VideoAssetCollectionsResult{
		Items:             s.listVideoAssetCollectionsLocked(scope, assetIDs),
		UnclassifiedCount: s.unclassifiedVideoAssetCountLocked(scope, assetIDs),
	}
}

func (s *VideoAssetService) CreateVideoAssetCollection(name string, scope VideoAssetAccessScope) (VideoAssetCollection, error) {
	name = normalizeVideoAssetCollectionName(name)
	if name == "" {
		return VideoAssetCollection{}, errors.New("collection name is required")
	}
	if err := ensureVideoAssetWritableScope(scope); err != nil {
		return VideoAssetCollection{}, err
	}
	collection := newVideoAssetCollectionForScope(name, scope)

	s.mu.Lock()
	defer s.mu.Unlock()

	collections := s.loadVideoAssetCollectionsLocked()
	for _, existing := range collections {
		if videoAssetCollectionMatchesScope(existing, scope) && strings.EqualFold(existing.Name, collection.Name) {
			return VideoAssetCollection{}, errors.New("collection name already exists")
		}
	}
	collections = append(collections, collection)
	if err := s.saveVideoAssetCollectionsLocked(collections); err != nil {
		return VideoAssetCollection{}, err
	}
	return collection, nil
}

func (s *VideoAssetService) RenameVideoAssetCollection(id, name string, scope VideoAssetAccessScope) (VideoAssetCollection, error) {
	id = normalizeImageCollectionID(id)
	name = normalizeVideoAssetCollectionName(name)
	if id == "" {
		return VideoAssetCollection{}, errors.New("collection id is required")
	}
	if name == "" {
		return VideoAssetCollection{}, errors.New("collection name is required")
	}
	if err := ensureVideoAssetWritableScope(scope); err != nil {
		return VideoAssetCollection{}, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	collections := s.loadVideoAssetCollectionsLocked()
	index := -1
	for i, collection := range collections {
		if collection.ID == id && videoAssetCollectionMatchesScope(collection, scope) {
			index = i
			break
		}
	}
	if index < 0 {
		return VideoAssetCollection{}, errors.New("collection not found")
	}
	for _, existing := range collections {
		if existing.ID != id && videoAssetCollectionMatchesScope(existing, scope) && strings.EqualFold(existing.Name, name) {
			return VideoAssetCollection{}, errors.New("collection name already exists")
		}
	}
	if err := s.renameVideoAssetCollectionOnAssignmentsLocked(id, name, scope); err != nil {
		return VideoAssetCollection{}, err
	}
	collections[index].Name = name
	collections[index].UpdatedAt = util.NowISO()
	if err := s.saveVideoAssetCollectionsLocked(collections); err != nil {
		return VideoAssetCollection{}, err
	}
	collections[index].VideosCount = s.videoAssetCollectionCountsLocked(scope, nil)[id]
	return collections[index], nil
}

func (s *VideoAssetService) DeleteVideoAssetCollection(id string, scope VideoAssetAccessScope) (map[string]any, error) {
	id = normalizeImageCollectionID(id)
	if id == "" {
		return nil, errors.New("collection id is required")
	}
	if err := ensureVideoAssetWritableScope(scope); err != nil {
		return nil, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	collections := s.loadVideoAssetCollectionsLocked()
	next := make([]VideoAssetCollection, 0, len(collections))
	deleted := false
	for _, collection := range collections {
		if collection.ID == id && videoAssetCollectionMatchesScope(collection, scope) {
			deleted = true
			continue
		}
		next = append(next, collection)
	}
	if !deleted {
		return nil, errors.New("collection not found")
	}
	cleared, err := s.clearVideoAssetCollectionOnAssignmentsLocked(id, scope)
	if err != nil {
		return nil, err
	}
	if err := s.saveVideoAssetCollectionsLocked(next); err != nil {
		return nil, err
	}
	return map[string]any{"deleted": true, "collection_id": id, "cleared": cleared}, nil
}

func (s *VideoAssetService) UpdateVideoAssetCollectionItems(collectionID string, assetIDs []string, scope VideoAssetAccessScope) (map[string]any, error) {
	collectionID = normalizeImageCollectionID(collectionID)
	assetIDs = NormalizeVideoAssetIDs(assetIDs)
	if len(assetIDs) == 0 {
		return nil, errors.New("asset ids are required")
	}
	if err := ensureVideoAssetWritableScope(scope); err != nil {
		return nil, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	collectionName := ""
	if collectionID == VideoAssetCollectionUnclassifiedID {
		collectionID = ""
	} else if collectionID != "" {
		collection, ok := s.videoAssetCollectionByIDLocked(collectionID, scope)
		if !ok {
			return nil, errors.New("collection not found")
		}
		collectionName = collection.Name
	}

	now := util.NowISO()
	assignments := s.loadVideoAssetAssignmentsLocked()
	byAssetID := make(map[string]int, len(assignments))
	for i, item := range assignments {
		byAssetID[videoAssetAssignmentKey(item.OwnerID, item.AssetID)] = i
	}
	for _, assetID := range assetIDs {
		if index, ok := byAssetID[videoAssetAssignmentKey(scope.OwnerID, assetID)]; ok {
			item := assignments[index]
			item.CollectionID = collectionID
			item.CollectionName = collectionName
			item.OwnerName = scope.OwnerName
			item.UpdatedAt = now
			assignments[index] = item
			continue
		}
		assignments = append(assignments, videoAssetAssignment{
			AssetID:        assetID,
			CollectionID:   collectionID,
			CollectionName: collectionName,
			OwnerID:        scope.OwnerID,
			OwnerName:      scope.OwnerName,
			CreatedAt:      now,
			UpdatedAt:      now,
		})
	}
	sortVideoAssetAssignments(assignments)
	if err := s.saveVideoAssetAssignmentsLocked(assignments); err != nil {
		return nil, err
	}
	return map[string]any{"collection_id": collectionID, "collection_name": collectionName, "asset_ids": assetIDs}, nil
}

func (s *VideoAssetService) CollectionMap(scope VideoAssetAccessScope, assetIDs []string) map[string]map[string]string {
	s.mu.Lock()
	defer s.mu.Unlock()

	allowed := VideoAssetIDSet(assetIDs)
	out := make(map[string]map[string]string)
	for _, item := range s.loadVideoAssetAssignmentsLocked() {
		if item.OwnerID != scope.OwnerID || item.CollectionID == "" {
			continue
		}
		if allowed != nil {
			if _, ok := allowed[item.AssetID]; !ok {
				continue
			}
		}
		out[item.AssetID] = map[string]string{"collection_id": item.CollectionID, "collection_name": item.CollectionName}
	}
	return out
}

func (s *VideoAssetService) loadVideoAssetCollectionsLocked() []VideoAssetCollection {
	raw := util.StringMap(loadStoredJSON(s.store, videoAssetCollectionsDocumentName))
	rawItems := util.AsMapSlice(raw["items"])
	items := make([]VideoAssetCollection, 0, len(rawItems))
	for _, rawItem := range rawItems {
		item := normalizeVideoAssetCollection(rawItem)
		if item.ID != "" && item.Name != "" {
			items = append(items, item)
		}
	}
	sortVideoAssetCollections(items)
	return items
}

func (s *VideoAssetService) saveVideoAssetCollectionsLocked(items []VideoAssetCollection) error {
	out := make([]VideoAssetCollection, 0, len(items))
	for _, item := range items {
		item = normalizeVideoAssetCollection(structToMapVideoAssetCollection(item))
		if item.ID != "" && item.Name != "" {
			out = append(out, item)
		}
	}
	sortVideoAssetCollections(out)
	return saveStoredJSON(s.store, videoAssetCollectionsDocumentName, videoAssetCollectionDocument{
		Version:   1,
		UpdatedAt: util.NowISO(),
		Items:     out,
	})
}

func (s *VideoAssetService) loadVideoAssetAssignmentsLocked() []videoAssetAssignment {
	raw := util.StringMap(loadStoredJSON(s.store, videoAssetAssignmentsDocumentName))
	rawItems := util.AsMapSlice(raw["items"])
	items := make([]videoAssetAssignment, 0, len(rawItems))
	for _, rawItem := range rawItems {
		item := normalizeVideoAssetAssignment(rawItem)
		if item.AssetID != "" && item.OwnerID != "" {
			items = append(items, item)
		}
	}
	sortVideoAssetAssignments(items)
	return items
}

func (s *VideoAssetService) saveVideoAssetAssignmentsLocked(items []videoAssetAssignment) error {
	out := make([]videoAssetAssignment, 0, len(items))
	for _, item := range items {
		item = normalizeVideoAssetAssignment(structToMapVideoAssetAssignment(item))
		if item.AssetID != "" && item.OwnerID != "" {
			out = append(out, item)
		}
	}
	sortVideoAssetAssignments(out)
	return saveStoredJSON(s.store, videoAssetAssignmentsDocumentName, videoAssetAssignmentDocument{
		Version:   1,
		UpdatedAt: util.NowISO(),
		Items:     out,
	})
}

func newVideoAssetCollectionForScope(name string, scope VideoAssetAccessScope) VideoAssetCollection {
	now := util.NowISO()
	return VideoAssetCollection{
		ID:           "vcol_" + util.NewHex(20),
		Name:         name,
		LibraryScope: ImageLibraryScopePersonal,
		OwnerID:      scope.OwnerID,
		OwnerName:    scope.OwnerName,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
}

func normalizeVideoAssetCollection(raw map[string]any) VideoAssetCollection {
	createdAt := util.Clean(raw["created_at"])
	updatedAt := util.Clean(raw["updated_at"])
	if createdAt == "" {
		createdAt = util.NowISO()
	}
	if updatedAt == "" {
		updatedAt = createdAt
	}
	return VideoAssetCollection{
		ID:           normalizeImageCollectionID(util.Clean(raw["id"])),
		Name:         normalizeVideoAssetCollectionName(util.Clean(raw["name"])),
		LibraryScope: ImageLibraryScopePersonal,
		OwnerID:      util.Clean(raw["owner_id"]),
		OwnerName:    util.Clean(raw["owner_name"]),
		CreatedAt:    createdAt,
		UpdatedAt:    updatedAt,
		VideosCount:  util.ToInt(raw["videos_count"], 0),
	}
}

func structToMapVideoAssetCollection(item VideoAssetCollection) map[string]any {
	return map[string]any{
		"id":            item.ID,
		"name":          item.Name,
		"library_scope": item.LibraryScope,
		"owner_id":      item.OwnerID,
		"owner_name":    item.OwnerName,
		"created_at":    item.CreatedAt,
		"updated_at":    item.UpdatedAt,
		"videos_count":  item.VideosCount,
	}
}

func normalizeVideoAssetAssignment(raw map[string]any) videoAssetAssignment {
	createdAt := util.Clean(raw["created_at"])
	updatedAt := util.Clean(raw["updated_at"])
	if createdAt == "" {
		createdAt = util.NowISO()
	}
	if updatedAt == "" {
		updatedAt = createdAt
	}
	return videoAssetAssignment{
		AssetID:        NormalizeVideoAssetID(util.Clean(raw["asset_id"])),
		CollectionID:   normalizeImageCollectionID(util.Clean(raw["collection_id"])),
		CollectionName: normalizeVideoAssetCollectionName(util.Clean(raw["collection_name"])),
		OwnerID:        util.Clean(raw["owner_id"]),
		OwnerName:      util.Clean(raw["owner_name"]),
		CreatedAt:      createdAt,
		UpdatedAt:      updatedAt,
	}
}

func structToMapVideoAssetAssignment(item videoAssetAssignment) map[string]any {
	return map[string]any{
		"asset_id":        item.AssetID,
		"collection_id":   item.CollectionID,
		"collection_name": item.CollectionName,
		"owner_id":        item.OwnerID,
		"owner_name":      item.OwnerName,
		"created_at":      item.CreatedAt,
		"updated_at":      item.UpdatedAt,
	}
}

func (s *VideoAssetService) listVideoAssetCollectionsLocked(scope VideoAssetAccessScope, assetIDs []string) []VideoAssetCollection {
	collections := s.loadVideoAssetCollectionsLocked()
	counts := s.videoAssetCollectionCountsLocked(scope, assetIDs)
	byID := make(map[string]VideoAssetCollection, len(collections)+len(counts))
	for _, collection := range collections {
		if !videoAssetCollectionMatchesScope(collection, scope) {
			continue
		}
		collection.VideosCount = counts[collection.ID]
		byID[collection.ID] = collection
	}
	for _, assignment := range s.loadVideoAssetAssignmentsLocked() {
		if assignment.OwnerID != scope.OwnerID || assignment.CollectionID == "" {
			continue
		}
		if _, ok := byID[assignment.CollectionID]; ok {
			continue
		}
		collection := VideoAssetCollection{
			ID:           assignment.CollectionID,
			Name:         assignment.CollectionName,
			LibraryScope: ImageLibraryScopePersonal,
			OwnerID:      scope.OwnerID,
			OwnerName:    scope.OwnerName,
			CreatedAt:    assignment.CreatedAt,
			UpdatedAt:    assignment.UpdatedAt,
			VideosCount:  counts[assignment.CollectionID],
		}
		if collection.ID != "" && collection.Name != "" {
			byID[collection.ID] = collection
		}
	}
	result := make([]VideoAssetCollection, 0, len(byID))
	for _, collection := range byID {
		result = append(result, collection)
	}
	sortVideoAssetCollections(result)
	return result
}

func (s *VideoAssetService) videoAssetCollectionByIDLocked(id string, scope VideoAssetAccessScope) (VideoAssetCollection, bool) {
	id = normalizeImageCollectionID(id)
	if id == "" {
		return VideoAssetCollection{}, false
	}
	for _, collection := range s.loadVideoAssetCollectionsLocked() {
		if collection.ID == id && videoAssetCollectionMatchesScope(collection, scope) {
			return collection, true
		}
	}
	return VideoAssetCollection{}, false
}

func (s *VideoAssetService) videoAssetCollectionCountsLocked(scope VideoAssetAccessScope, assetIDs []string) map[string]int {
	allowed := VideoAssetIDSet(assetIDs)
	counts := make(map[string]int)
	for _, assignment := range s.loadVideoAssetAssignmentsLocked() {
		if assignment.OwnerID != scope.OwnerID || assignment.CollectionID == "" {
			continue
		}
		if allowed != nil {
			if _, ok := allowed[assignment.AssetID]; !ok {
				continue
			}
		}
		counts[assignment.CollectionID]++
	}
	return counts
}

func (s *VideoAssetService) unclassifiedVideoAssetCountLocked(scope VideoAssetAccessScope, assetIDs []string) int {
	ids := NormalizeVideoAssetIDs(assetIDs)
	if len(ids) == 0 {
		return 0
	}
	classified := make(map[string]struct{})
	for _, assignment := range s.loadVideoAssetAssignmentsLocked() {
		if assignment.OwnerID == scope.OwnerID && assignment.CollectionID != "" {
			classified[assignment.AssetID] = struct{}{}
		}
	}
	count := 0
	for _, id := range ids {
		if _, ok := classified[id]; !ok {
			count++
		}
	}
	return count
}

func (s *VideoAssetService) renameVideoAssetCollectionOnAssignmentsLocked(collectionID, name string, scope VideoAssetAccessScope) error {
	assignments := s.loadVideoAssetAssignmentsLocked()
	changed := false
	for index, item := range assignments {
		if item.CollectionID != collectionID || item.OwnerID != scope.OwnerID {
			continue
		}
		item.CollectionName = name
		item.UpdatedAt = util.NowISO()
		assignments[index] = item
		changed = true
	}
	if !changed {
		return nil
	}
	return s.saveVideoAssetAssignmentsLocked(assignments)
}

func (s *VideoAssetService) clearVideoAssetCollectionOnAssignmentsLocked(collectionID string, scope VideoAssetAccessScope) (int, error) {
	assignments := s.loadVideoAssetAssignmentsLocked()
	cleared := 0
	for index, item := range assignments {
		if item.CollectionID != collectionID || item.OwnerID != scope.OwnerID {
			continue
		}
		item.CollectionID = ""
		item.CollectionName = ""
		item.UpdatedAt = util.NowISO()
		assignments[index] = item
		cleared++
	}
	if cleared == 0 {
		return 0, nil
	}
	return cleared, s.saveVideoAssetAssignmentsLocked(assignments)
}

func videoAssetCollectionMatchesScope(collection VideoAssetCollection, scope VideoAssetAccessScope) bool {
	return scope.OwnerID != "" && collection.LibraryScope == ImageLibraryScopePersonal && collection.OwnerID == scope.OwnerID
}

func ensureVideoAssetWritableScope(scope VideoAssetAccessScope) error {
	if scope.OwnerID == "" {
		return errors.New("video asset scope is required")
	}
	return nil
}

func NormalizeVideoAssetIDs(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	out := make([]string, 0, len(values))
	for _, value := range values {
		id := NormalizeVideoAssetID(value)
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	return out
}

func NormalizeVideoAssetID(value string) string {
	value = strings.TrimSpace(value)
	if value == "" || strings.ContainsRune(value, 0) {
		return ""
	}
	parts := strings.Split(value, ":")
	if len(parts) != 2 {
		return ""
	}
	taskID := strings.TrimSpace(parts[0])
	index := strings.TrimSpace(parts[1])
	if taskID == "" || index == "" {
		return ""
	}
	for _, r := range taskID {
		if !(r >= 'a' && r <= 'z') && !(r >= 'A' && r <= 'Z') && !(r >= '0' && r <= '9') && r != '_' && r != '-' {
			return ""
		}
	}
	for _, r := range index {
		if r < '0' || r > '9' {
			return ""
		}
	}
	return taskID + ":" + index
}

func VideoAssetIDSet(values []string) map[string]struct{} {
	ids := NormalizeVideoAssetIDs(values)
	if len(ids) == 0 {
		return nil
	}
	out := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		out[id] = struct{}{}
	}
	return out
}

func normalizeVideoAssetCollectionName(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	runes := []rune(value)
	if len(runes) > videoAssetMaxCollectionNameLen {
		value = string(runes[:videoAssetMaxCollectionNameLen])
	}
	return value
}

func sortVideoAssetCollections(items []VideoAssetCollection) {
	sort.Slice(items, func(i, j int) bool {
		if items[i].UpdatedAt == items[j].UpdatedAt {
			return items[i].Name < items[j].Name
		}
		return items[i].UpdatedAt > items[j].UpdatedAt
	})
}

func sortVideoAssetAssignments(items []videoAssetAssignment) {
	sort.Slice(items, func(i, j int) bool {
		if items[i].UpdatedAt == items[j].UpdatedAt {
			return videoAssetAssignmentKey(items[i].OwnerID, items[i].AssetID) < videoAssetAssignmentKey(items[j].OwnerID, items[j].AssetID)
		}
		return items[i].UpdatedAt > items[j].UpdatedAt
	})
}

func videoAssetAssignmentKey(ownerID, assetID string) string {
	return ownerID + "\x00" + assetID
}
