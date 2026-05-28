package service

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

const (
	SocialPlatformXHS = "xhs"

	SocialProjectStatusDraft           = "draft"
	SocialProjectStatusGeneratingCopy  = "generating_copy"
	SocialProjectStatusCopyReady       = "copy_ready"
	SocialProjectStatusGeneratingCards = "generating_cards"
	SocialProjectStatusCardsReady      = "cards_ready"
	SocialProjectStatusExported        = "exported"

	SocialCardVisualInfo  = "info"
	SocialCardVisualAI    = "ai"
	SocialCardVisualImage = "image"

	socialProjectsDocumentName = "social_projects.json"
)

type SocialProject struct {
	ID             string           `json:"id"`
	OwnerID        string           `json:"owner_id"`
	Platform       string           `json:"platform"`
	Status         string           `json:"status"`
	Topic          string           `json:"topic,omitempty"`
	Audience       string           `json:"audience,omitempty"`
	Tone           string           `json:"tone,omitempty"`
	SourceText     string           `json:"source_text,omitempty"`
	SourceImages   []SocialImageRef `json:"source_images,omitempty"`
	Title          string           `json:"title,omitempty"`
	Caption        string           `json:"caption,omitempty"`
	Tags           []string         `json:"tags,omitempty"`
	CopyMarkdown   string           `json:"copy_markdown,omitempty"`
	Cards          []SocialCard     `json:"cards,omitempty"`
	CopyTaskID     string           `json:"copy_task_id,omitempty"`
	CardTaskIDs    []string         `json:"card_task_ids,omitempty"`
	LastExportedAt string           `json:"last_exported_at,omitempty"`
	ExportedFile   string           `json:"exported_file,omitempty"`
	CreatedAt      string           `json:"created_at"`
	UpdatedAt      string           `json:"updated_at"`
}

type SocialImageRef struct {
	URL          string `json:"url,omitempty"`
	LocalURL     string `json:"local_url,omitempty"`
	Path         string `json:"path,omitempty"`
	Name         string `json:"name,omitempty"`
	ThumbnailURL string `json:"thumbnail_url,omitempty"`
}

type SocialCard struct {
	ID          string `json:"id"`
	Index       int    `json:"index"`
	Title       string `json:"title,omitempty"`
	Body        string `json:"body,omitempty"`
	Layout      string `json:"layout,omitempty"`
	VisualMode  string `json:"visual_mode,omitempty"`
	ImagePrompt string `json:"image_prompt,omitempty"`
	ImageURL    string `json:"image_url,omitempty"`
	LocalURL    string `json:"local_url,omitempty"`
	Path        string `json:"path,omitempty"`
	TaskID      string `json:"task_id,omitempty"`
	Status      string `json:"status,omitempty"`
	Accent      string `json:"accent,omitempty"`
}

type SocialProjectService struct {
	mu       sync.RWMutex
	store    storage.JSONDocumentBackend
	projects map[string]SocialProject
}

func NewSocialProjectService(backend storage.Backend) *SocialProjectService {
	s := &SocialProjectService{
		store:    jsonDocumentStoreFromBackend(backend),
		projects: map[string]SocialProject{},
	}
	s.projects = s.loadProjects()
	return s
}

func (s *SocialProjectService) ListProjects(identity Identity) []SocialProject {
	owner := ownerID(identity)
	s.mu.RLock()
	defer s.mu.RUnlock()
	items := make([]SocialProject, 0)
	for _, project := range s.projects {
		if project.OwnerID == owner {
			items = append(items, cloneSocialProject(project))
		}
	}
	sortSocialProjects(items)
	return items
}

func (s *SocialProjectService) CreateProject(identity Identity, input SocialProject) (SocialProject, error) {
	owner := ownerID(identity)
	if owner == "" {
		return SocialProject{}, fmt.Errorf("owner_id is required")
	}
	now := util.NowISO()
	project, err := normalizeSocialProject(input, now)
	if err != nil {
		return SocialProject{}, err
	}
	project.ID = firstNonEmpty(project.ID, util.NewUUID())
	project.OwnerID = owner
	project.CreatedAt = now
	project.UpdatedAt = now
	key := socialProjectKey(owner, project.ID)

	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.projects[key]; exists {
		return SocialProject{}, fmt.Errorf("social project already exists")
	}
	s.projects[key] = project
	if err := s.saveProjectsLocked(); err != nil {
		return SocialProject{}, err
	}
	return cloneSocialProject(project), nil
}

func (s *SocialProjectService) GetProject(identity Identity, id string) (SocialProject, bool) {
	owner := ownerID(identity)
	id = util.Clean(id)
	if owner == "" || id == "" {
		return SocialProject{}, false
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	project, ok := s.projects[socialProjectKey(owner, id)]
	if !ok {
		return SocialProject{}, false
	}
	return cloneSocialProject(project), true
}

func (s *SocialProjectService) SaveProject(identity Identity, id string, input SocialProject) (SocialProject, error) {
	owner := ownerID(identity)
	id = util.Clean(id)
	if owner == "" {
		return SocialProject{}, fmt.Errorf("owner_id is required")
	}
	if id == "" {
		return SocialProject{}, fmt.Errorf("social project id is required")
	}
	key := socialProjectKey(owner, id)
	now := util.NowISO()

	s.mu.Lock()
	defer s.mu.Unlock()
	existing, ok := s.projects[key]
	if !ok {
		return SocialProject{}, fmt.Errorf("social project not found")
	}
	project, err := normalizeSocialProject(input, now)
	if err != nil {
		return SocialProject{}, err
	}
	project.ID = id
	project.OwnerID = owner
	project.CreatedAt = firstNonEmpty(existing.CreatedAt, now)
	project.UpdatedAt = nextSocialProjectUpdatedAt(project.CreatedAt, now)
	if project.UpdatedAt <= existing.UpdatedAt {
		project.UpdatedAt = existing.UpdatedAt + "\x00"
	}
	s.projects[key] = project
	if err := s.saveProjectsLocked(); err != nil {
		return SocialProject{}, err
	}
	return cloneSocialProject(project), nil
}

func (s *SocialProjectService) DeleteProject(identity Identity, id string) error {
	owner := ownerID(identity)
	id = util.Clean(id)
	if owner == "" {
		return fmt.Errorf("owner_id is required")
	}
	if id == "" {
		return fmt.Errorf("social project id is required")
	}
	key := socialProjectKey(owner, id)
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.projects[key]; !ok {
		return fmt.Errorf("social project not found")
	}
	delete(s.projects, key)
	return s.saveProjectsLocked()
}

func (s *SocialProjectService) PatchProject(identity Identity, id string, patch func(*SocialProject) error) (SocialProject, error) {
	if patch == nil {
		return SocialProject{}, fmt.Errorf("social project patch is required")
	}
	owner := ownerID(identity)
	id = util.Clean(id)
	if owner == "" {
		return SocialProject{}, fmt.Errorf("owner_id is required")
	}
	if id == "" {
		return SocialProject{}, fmt.Errorf("social project id is required")
	}
	key := socialProjectKey(owner, id)
	now := util.NowISO()
	s.mu.Lock()
	defer s.mu.Unlock()
	project, ok := s.projects[key]
	if !ok {
		return SocialProject{}, fmt.Errorf("social project not found")
	}
	if err := patch(&project); err != nil {
		return SocialProject{}, err
	}
	project.UpdatedAt = now
	normalized, err := normalizeSocialProject(project, now)
	if err != nil {
		return SocialProject{}, err
	}
	normalized.ID = id
	normalized.OwnerID = owner
	normalized.CreatedAt = firstNonEmpty(project.CreatedAt, now)
	normalized.UpdatedAt = nextSocialProjectUpdatedAt(normalized.CreatedAt, now)
	s.projects[key] = normalized
	if err := s.saveProjectsLocked(); err != nil {
		return SocialProject{}, err
	}
	return cloneSocialProject(normalized), nil
}

func (s *SocialProjectService) loadProjects() map[string]SocialProject {
	out := map[string]SocialProject{}
	for _, project := range decodeSocialProjects(loadStoredJSON(s.store, socialProjectsDocumentName)) {
		normalized, err := normalizeSocialProject(project, util.NowISO())
		if err != nil || normalized.ID == "" || normalized.OwnerID == "" {
			continue
		}
		out[socialProjectKey(normalized.OwnerID, normalized.ID)] = normalized
	}
	return out
}

func (s *SocialProjectService) saveProjectsLocked() error {
	items := make([]SocialProject, 0, len(s.projects))
	for _, project := range s.projects {
		items = append(items, project)
	}
	sortSocialProjects(items)
	return saveStoredJSON(s.store, socialProjectsDocumentName, map[string]any{"items": items})
}

func decodeSocialProjects(raw any) []SocialProject {
	var doc struct {
		Items []SocialProject `json:"items"`
	}
	if decodeStoredValue(raw, &doc) == nil && len(doc.Items) > 0 {
		return doc.Items
	}
	var items []SocialProject
	_ = decodeStoredValue(raw, &items)
	return items
}

func normalizeSocialProject(project SocialProject, now string) (SocialProject, error) {
	project.ID = util.Clean(project.ID)
	project.OwnerID = util.Clean(project.OwnerID)
	project.Platform = normalizeSocialPlatform(project.Platform)
	if project.Platform == "" {
		return SocialProject{}, fmt.Errorf("platform must be xhs")
	}
	project.Status = normalizeSocialProjectStatus(project.Status)
	project.Topic = util.Clean(project.Topic)
	project.Audience = util.Clean(project.Audience)
	project.Tone = util.Clean(project.Tone)
	project.SourceText = strings.TrimSpace(project.SourceText)
	project.Title = util.Clean(project.Title)
	project.Caption = strings.TrimSpace(project.Caption)
	project.CopyMarkdown = strings.TrimSpace(project.CopyMarkdown)
	project.CopyTaskID = util.Clean(project.CopyTaskID)
	project.SourceImages = normalizeSocialImageRefs(project.SourceImages)
	project.Tags = normalizeSocialTags(project.Tags)
	project.Cards = normalizeSocialCards(project.Cards)
	project.CardTaskIDs = normalizeSocialStringList(project.CardTaskIDs)
	project.LastExportedAt = util.Clean(project.LastExportedAt)
	project.ExportedFile = util.Clean(project.ExportedFile)
	project.CreatedAt = firstNonEmpty(util.Clean(project.CreatedAt), now)
	project.UpdatedAt = firstNonEmpty(util.Clean(project.UpdatedAt), now)
	if project.Topic == "" && project.Title == "" && project.SourceText == "" {
		project.Topic = "未命名内容"
	}
	return project, nil
}

func normalizeSocialPlatform(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "", SocialPlatformXHS:
		return SocialPlatformXHS
	default:
		return ""
	}
}

func normalizeSocialProjectStatus(value string) string {
	switch strings.TrimSpace(value) {
	case SocialProjectStatusGeneratingCopy, SocialProjectStatusCopyReady, SocialProjectStatusGeneratingCards, SocialProjectStatusCardsReady, SocialProjectStatusExported:
		return strings.TrimSpace(value)
	default:
		return SocialProjectStatusDraft
	}
}

func normalizeSocialImageRefs(items []SocialImageRef) []SocialImageRef {
	out := make([]SocialImageRef, 0, len(items))
	seen := map[string]struct{}{}
	for _, ref := range items {
		ref.URL = util.Clean(ref.URL)
		ref.LocalURL = util.Clean(ref.LocalURL)
		ref.Path = util.Clean(ref.Path)
		ref.Name = util.Clean(ref.Name)
		ref.ThumbnailURL = util.Clean(ref.ThumbnailURL)
		key := firstNonEmpty(ref.Path, ref.LocalURL, ref.URL, ref.Name)
		if key == "" {
			continue
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, ref)
	}
	return out
}

func normalizeSocialTags(items []string) []string {
	out := make([]string, 0, len(items))
	seen := map[string]struct{}{}
	for _, item := range items {
		tag := strings.TrimPrefix(util.Clean(item), "#")
		if tag == "" {
			continue
		}
		if _, ok := seen[tag]; ok {
			continue
		}
		seen[tag] = struct{}{}
		out = append(out, tag)
	}
	if len(out) > 12 {
		out = out[:12]
	}
	return out
}

func normalizeSocialCards(cards []SocialCard) []SocialCard {
	out := make([]SocialCard, 0, len(cards))
	seen := map[string]struct{}{}
	for index, card := range cards {
		card.ID = util.Clean(card.ID)
		if card.ID == "" {
			card.ID = fmt.Sprintf("card-%02d", index+1)
		}
		if _, ok := seen[card.ID]; ok {
			card.ID = card.ID + "-" + util.NewHex(4)
		}
		seen[card.ID] = struct{}{}
		card.Index = index + 1
		card.Title = util.Clean(card.Title)
		card.Body = strings.TrimSpace(card.Body)
		card.Layout = firstNonEmpty(util.Clean(card.Layout), "editorial")
		card.VisualMode = normalizeSocialCardVisualMode(card.VisualMode)
		card.ImagePrompt = strings.TrimSpace(card.ImagePrompt)
		card.ImageURL = util.Clean(card.ImageURL)
		card.LocalURL = util.Clean(card.LocalURL)
		card.Path = util.Clean(card.Path)
		card.TaskID = util.Clean(card.TaskID)
		card.Status = normalizeSocialCardStatus(card.Status)
		card.Accent = util.Clean(card.Accent)
		if card.Title == "" && card.Body == "" && card.ImagePrompt == "" && card.ImageURL == "" && card.LocalURL == "" && card.Path == "" {
			continue
		}
		out = append(out, card)
	}
	if len(out) > 8 {
		out = out[:8]
	}
	return out
}

func normalizeSocialCardVisualMode(value string) string {
	switch strings.TrimSpace(value) {
	case SocialCardVisualAI, SocialCardVisualImage:
		return strings.TrimSpace(value)
	default:
		return SocialCardVisualInfo
	}
}

func normalizeSocialCardStatus(value string) string {
	switch strings.TrimSpace(value) {
	case TaskStatusQueued, TaskStatusRunning, TaskStatusSuccess, TaskStatusError, TaskStatusCancelled:
		return strings.TrimSpace(value)
	default:
		return ""
	}
}

func normalizeSocialStringList(items []string) []string {
	out := make([]string, 0, len(items))
	seen := map[string]struct{}{}
	for _, item := range items {
		clean := util.Clean(item)
		if clean == "" {
			continue
		}
		if _, ok := seen[clean]; ok {
			continue
		}
		seen[clean] = struct{}{}
		out = append(out, clean)
	}
	return out
}

func sortSocialProjects(items []SocialProject) {
	sort.SliceStable(items, func(i, j int) bool {
		return strings.Compare(items[i].UpdatedAt, items[j].UpdatedAt) > 0
	})
}

func socialProjectKey(owner, id string) string {
	return util.Clean(owner) + ":" + util.Clean(id)
}

func nextSocialProjectUpdatedAt(createdAt, now string) string {
	if createdAt == "" || now != createdAt {
		return now
	}
	parsed, err := time.Parse(time.RFC3339Nano, now)
	if err != nil {
		return now
	}
	return parsed.Add(time.Nanosecond).UTC().Format(time.RFC3339Nano)
}

func cloneSocialProject(project SocialProject) SocialProject {
	data, _ := json.Marshal(project)
	var out SocialProject
	_ = json.Unmarshal(data, &out)
	return out
}
