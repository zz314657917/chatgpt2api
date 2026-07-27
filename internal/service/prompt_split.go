package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"reflect"
	"sort"
	"strings"
	"sync"
	"time"

	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

const (
	promptSplitDocumentName  = "prompt_splits.json"
	promptSplitPollInterval  = 50 * time.Millisecond
	promptSplitTaskNamespace = "prompt-split-internal"

	PromptSplitExecutionModeNodes  = "nodes"
	PromptSplitExecutionModeDirect = "direct"

	PromptSplitStatusSplitting      = "splitting"
	PromptSplitStatusReady          = "ready"
	PromptSplitStatusSubmitting     = "submitting"
	PromptSplitStatusRunning        = "running"
	PromptSplitStatusSuccess        = "success"
	PromptSplitStatusPartialSuccess = "partial_success"
	PromptSplitStatusError          = "error"
	PromptSplitStatusCancelled      = "cancelled"

	promptSplitItemStatusNotSubmitted = "not_submitted"
	promptSplitItemStatusSubmitting   = "submitting"
)

var ErrPromptSplitNotFound = errors.New("prompt split not found")

type PromptSplitImageRequest struct {
	Model                  string         `json:"model,omitempty"`
	Size                   string         `json:"size,omitempty"`
	Quality                string         `json:"quality,omitempty"`
	BaseURL                string         `json:"base_url,omitempty"`
	Visibility             string         `json:"visibility,omitempty"`
	Metadata               map[string]any `json:"metadata,omitempty"`
	OutputFormat           string         `json:"output_format,omitempty"`
	OutputCompression      *int           `json:"output_compression,omitempty"`
	Background             string         `json:"background,omitempty"`
	Moderation             string         `json:"moderation,omitempty"`
	Style                  string         `json:"style,omitempty"`
	PartialImages          *int           `json:"partial_images,omitempty"`
	OfficialFallback       *bool          `json:"official_fallback,omitempty"`
	ProfessionalMode       bool           `json:"professional_mode,omitempty"`
	ImageResolution        string         `json:"image_resolution,omitempty"`
	SharePromptParameters  bool           `json:"share_prompt_parameters,omitempty"`
	ShareReferenceImages   bool           `json:"share_reference_images,omitempty"`
	FrontendConversationID string         `json:"frontend_conversation_id,omitempty"`
	MidjourneySettings     map[string]any `json:"midjourney_settings,omitempty"`
	OfficialSettings       map[string]any `json:"official_settings,omitempty"`
	ProStudio              map[string]any `json:"pro_studio,omitempty"`
}

type PromptSplitCreateRequest struct {
	ClientTaskID  string                   `json:"client_task_id"`
	Prompt        string                   `json:"prompt"`
	Model         string                   `json:"model"`
	SplitCount    int                      `json:"split_count"`
	ExecutionMode string                   `json:"execution_mode"`
	ImageRequest  *PromptSplitImageRequest `json:"image_request,omitempty"`
	TaskMetadata  map[string]any           `json:"-"`
}

type PromptSplitItem struct {
	Index        int    `json:"index"`
	VariantLabel string `json:"variant_label,omitempty"`
	Prompt       string `json:"prompt"`
	TaskID       string `json:"task_id,omitempty"`
	Status       string `json:"status"`
	Error        string `json:"error,omitempty"`
}

type PromptSplitResult struct {
	VariationAxis string
	Items         []PromptSplitResultItem
}

type PromptSplitResultItem struct {
	VariantLabel string
	Prompt       string
}

type promptSplitIdentity struct {
	ID       string `json:"id"`
	Name     string `json:"name,omitempty"`
	Role     string `json:"role"`
	Provider string `json:"provider,omitempty"`
	OwnerID  string `json:"owner_id,omitempty"`
}

type promptSplitBatch struct {
	ID               string                   `json:"id"`
	OwnerID          string                   `json:"owner_id"`
	Identity         promptSplitIdentity      `json:"identity"`
	SourcePrompt     string                   `json:"source_prompt"`
	SplitModel       string                   `json:"split_model"`
	Status           string                   `json:"status"`
	ExecutionMode    string                   `json:"execution_mode"`
	SplitCount       int                      `json:"split_count"`
	SplitTaskID      string                   `json:"split_task_id"`
	VariationAxis    string                   `json:"variation_axis,omitempty"`
	ImageRequest     *PromptSplitImageRequest `json:"image_request,omitempty"`
	TaskMetadata     map[string]any           `json:"task_metadata,omitempty"`
	Items            []PromptSplitItem        `json:"items"`
	Error            string                   `json:"error,omitempty"`
	AdmissionStopped bool                     `json:"admission_stopped,omitempty"`
	CreatedAt        string                   `json:"created_at"`
	UpdatedAt        string                   `json:"updated_at"`
}

type promptSplitDocument struct {
	Items []promptSplitBatch `json:"items"`
}

type promptSplitWorker struct {
	id     uint64
	cancel context.CancelFunc
}

type PromptSplitService struct {
	mu        sync.RWMutex
	store     storage.JSONDocumentBackend
	tasks     *ImageTaskService
	batches   map[string]*promptSplitBatch
	workers   map[string]promptSplitWorker
	workerSeq uint64
}

func NewStoredPromptSplitService(backend storage.Backend, tasks *ImageTaskService) *PromptSplitService {
	return newPromptSplitService(jsonDocumentStoreFromBackend(backend), tasks)
}

func newPromptSplitService(store storage.JSONDocumentBackend, tasks *ImageTaskService) *PromptSplitService {
	s := &PromptSplitService{
		store:   store,
		tasks:   tasks,
		batches: map[string]*promptSplitBatch{},
		workers: map[string]promptSplitWorker{},
	}
	s.batches = s.loadLocked()
	return s
}

func (s *PromptSplitService) Resume() {
	if s == nil {
		return
	}
	keys := make([]string, 0)
	s.mu.RLock()
	for key, batch := range s.batches {
		if batch != nil && isActivePromptSplitStatus(batch.Status) {
			keys = append(keys, key)
		}
	}
	s.mu.RUnlock()
	for _, key := range keys {
		s.kick(key)
	}
}

func (s *PromptSplitService) Close() {
	if s == nil {
		return
	}
	s.mu.Lock()
	cancels := make([]context.CancelFunc, 0, len(s.workers))
	for _, worker := range s.workers {
		cancels = append(cancels, worker.cancel)
	}
	s.workers = map[string]promptSplitWorker{}
	s.mu.Unlock()
	for _, cancel := range cancels {
		cancel()
	}
}

func (s *PromptSplitService) Create(ctx context.Context, identity Identity, request PromptSplitCreateRequest) (map[string]any, error) {
	if s == nil || s.tasks == nil {
		return nil, fmt.Errorf("prompt split service is unavailable")
	}
	request.ClientTaskID = strings.TrimSpace(request.ClientTaskID)
	if request.ClientTaskID == "" {
		return nil, fmt.Errorf("client_task_id is required")
	}
	owner := ownerID(identity)
	key := promptSplitKey(owner, request.ClientTaskID)
	if existing, ok := s.batchSnapshot(key); ok {
		s.kick(key)
		return publicPromptSplitBatch(existing), nil
	}

	normalized, err := normalizePromptSplitCreateRequest(request)
	if err != nil {
		return nil, err
	}
	now := util.NowLocal()
	batch := &promptSplitBatch{
		ID:            normalized.ClientTaskID,
		OwnerID:       owner,
		Identity:      promptSplitIdentityFrom(identity),
		SourcePrompt:  normalized.Prompt,
		SplitModel:    normalized.Model,
		Status:        PromptSplitStatusSplitting,
		ExecutionMode: normalized.ExecutionMode,
		SplitCount:    normalized.SplitCount,
		SplitTaskID:   promptSplitTaskID(normalized.ClientTaskID),
		ImageRequest:  clonePromptSplitImageRequest(normalized.ImageRequest),
		TaskMetadata:  copyPromptSplitTaskMetadata(normalized.TaskMetadata),
		Items:         []PromptSplitItem{},
		CreatedAt:     now,
		UpdatedAt:     now,
	}

	s.mu.Lock()
	if existing := s.batches[key]; existing != nil {
		out := publicPromptSplitBatch(*existing)
		s.mu.Unlock()
		s.kick(key)
		return out, nil
	}
	s.batches[key] = batch
	if err := s.saveLocked(); err != nil {
		delete(s.batches, key)
		s.mu.Unlock()
		return nil, err
	}
	out := publicPromptSplitBatch(*batch)
	s.mu.Unlock()

	if err := s.ensureSplitTask(ctx, key); err != nil {
		if current, ok := s.batchSnapshot(key); ok {
			return publicPromptSplitBatch(current), err
		}
		return out, err
	}
	s.kick(key)
	return out, nil
}

func (s *PromptSplitService) Get(identity Identity, id string) (map[string]any, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return nil, fmt.Errorf("prompt split id is required")
	}
	key := promptSplitKey(ownerID(identity), id)
	batch, ok := s.batchSnapshot(key)
	if !ok {
		return nil, ErrPromptSplitNotFound
	}
	if isActivePromptSplitStatus(batch.Status) {
		s.kick(key)
	}
	return publicPromptSplitBatch(batch), nil
}

func (s *PromptSplitService) Cancel(identity Identity, id string) (map[string]any, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return nil, fmt.Errorf("prompt split id is required")
	}
	key := promptSplitKey(ownerID(identity), id)
	var cancel context.CancelFunc
	var splitTaskID string
	var childTaskIDs []string
	s.mu.Lock()
	batch := s.batches[key]
	if batch == nil {
		s.mu.Unlock()
		return nil, ErrPromptSplitNotFound
	}
	if !isActivePromptSplitStatus(batch.Status) {
		out := publicPromptSplitBatch(*batch)
		s.mu.Unlock()
		return out, nil
	}
	before := clonePromptSplitBatch(*batch)
	batch.Status = PromptSplitStatusCancelled
	batch.Error = "任务已终止"
	batch.UpdatedAt = util.NowLocal()
	splitTaskID = batch.SplitTaskID
	for index := range batch.Items {
		item := &batch.Items[index]
		if item.Status != TaskStatusSuccess && item.Status != TaskStatusError && item.Status != TaskStatusCancelled {
			item.Status = TaskStatusCancelled
			item.Error = "任务已终止"
		}
		if item.TaskID != "" {
			childTaskIDs = append(childTaskIDs, item.TaskID)
		}
	}
	if err := s.saveLocked(); err != nil {
		*batch = before
		s.mu.Unlock()
		return nil, err
	}
	cancel = s.workers[key].cancel
	delete(s.workers, key)
	out := publicPromptSplitBatch(*batch)
	s.mu.Unlock()
	if cancel != nil {
		cancel()
	}
	if s.tasks != nil {
		if splitTaskID != "" {
			_, _ = s.tasks.CancelTask(identity, splitTaskID)
		}
		for _, taskID := range childTaskIDs {
			_, _ = s.tasks.CancelTask(identity, taskID)
		}
	}
	return out, nil
}

func ParsePromptSplitResult(value string, splitCount int) (PromptSplitResult, error) {
	if splitCount < 1 || splitCount > maxImageTaskCount {
		return PromptSplitResult{}, fmt.Errorf("split_count must be between 1 and %d", maxImageTaskCount)
	}
	value, err := unwrapPromptSplitFence(value)
	if err != nil {
		return PromptSplitResult{}, err
	}
	decoder := json.NewDecoder(strings.NewReader(value))
	var payload map[string]json.RawMessage
	if err := decoder.Decode(&payload); err != nil {
		return PromptSplitResult{}, fmt.Errorf("splitter response must be JSON: %w", err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return PromptSplitResult{}, fmt.Errorf("splitter response must contain one JSON object")
	}
	if len(payload) != 2 || payload["variation_axis"] == nil || payload["items"] == nil {
		return PromptSplitResult{}, fmt.Errorf("splitter response must contain exactly variation_axis and items")
	}
	var axis string
	if err := json.Unmarshal(payload["variation_axis"], &axis); err != nil {
		return PromptSplitResult{}, fmt.Errorf("splitter variation_axis must be a string: %w", err)
	}
	axis = strings.TrimSpace(axis)
	if axis == "" {
		return PromptSplitResult{}, fmt.Errorf("splitter variation_axis is empty")
	}
	var rawItems []map[string]json.RawMessage
	if err := json.Unmarshal(payload["items"], &rawItems); err != nil {
		return PromptSplitResult{}, fmt.Errorf("splitter items must be an object array: %w", err)
	}
	if len(rawItems) != splitCount {
		return PromptSplitResult{}, fmt.Errorf("splitter returned %d items, expected %d", len(rawItems), splitCount)
	}
	items := make([]PromptSplitResultItem, 0, len(rawItems))
	seenLabels := map[string]struct{}{}
	seenPrompts := map[string]struct{}{}
	for index, rawItem := range rawItems {
		if len(rawItem) != 2 || rawItem["variant_label"] == nil || rawItem["prompt"] == nil {
			return PromptSplitResult{}, fmt.Errorf("splitter item %d must contain exactly variant_label and prompt", index+1)
		}
		var item PromptSplitResultItem
		if err := json.Unmarshal(rawItem["variant_label"], &item.VariantLabel); err != nil {
			return PromptSplitResult{}, fmt.Errorf("splitter item %d variant_label must be a string: %w", index+1, err)
		}
		if err := json.Unmarshal(rawItem["prompt"], &item.Prompt); err != nil {
			return PromptSplitResult{}, fmt.Errorf("splitter item %d prompt must be a string: %w", index+1, err)
		}
		item.VariantLabel = strings.TrimSpace(item.VariantLabel)
		item.Prompt = strings.TrimSpace(item.Prompt)
		if item.VariantLabel == "" {
			return PromptSplitResult{}, fmt.Errorf("splitter item %d variant_label is empty", index+1)
		}
		if item.Prompt == "" {
			return PromptSplitResult{}, fmt.Errorf("splitter item %d prompt is empty", index+1)
		}
		labelKey := normalizePromptSplitUniqueValue(item.VariantLabel)
		if _, ok := seenLabels[labelKey]; ok {
			return PromptSplitResult{}, fmt.Errorf("splitter variant labels must be unique")
		}
		promptKey := normalizePromptSplitUniqueValue(item.Prompt)
		if _, ok := seenPrompts[promptKey]; ok {
			return PromptSplitResult{}, fmt.Errorf("splitter prompts must be unique")
		}
		seenLabels[labelKey] = struct{}{}
		seenPrompts[promptKey] = struct{}{}
		items = append(items, item)
	}
	return PromptSplitResult{VariationAxis: axis, Items: items}, nil
}

func normalizePromptSplitUniqueValue(value string) string {
	return strings.ToLower(strings.Join(strings.Fields(value), " "))
}

func unwrapPromptSplitFence(value string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", fmt.Errorf("splitter response is empty")
	}
	fenceCount := strings.Count(value, "```")
	if fenceCount == 0 {
		return value, nil
	}
	if fenceCount != 2 || !strings.HasPrefix(value, "```") {
		return "", fmt.Errorf("splitter response may contain only one outer code fence")
	}
	firstNewline := strings.IndexByte(value, '\n')
	if firstNewline < 0 {
		return "", fmt.Errorf("splitter code fence is incomplete")
	}
	language := strings.TrimSpace(value[len("```"):firstNewline])
	if language != "" && !strings.EqualFold(language, "json") {
		return "", fmt.Errorf("splitter code fence must be json")
	}
	lastFence := strings.LastIndex(value, "```")
	if lastFence <= firstNewline || strings.TrimSpace(value[lastFence+len("```"):]) != "" {
		return "", fmt.Errorf("splitter code fence is incomplete")
	}
	content := strings.TrimSpace(value[firstNewline+1 : lastFence])
	if content == "" {
		return "", fmt.Errorf("splitter response is empty")
	}
	return content, nil
}

func (s *PromptSplitService) kick(key string) {
	if s == nil || key == "" {
		return
	}
	s.mu.Lock()
	batch := s.batches[key]
	if batch == nil || !isActivePromptSplitStatus(batch.Status) {
		s.mu.Unlock()
		return
	}
	if _, running := s.workers[key]; running {
		s.mu.Unlock()
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	s.workerSeq++
	workerID := s.workerSeq
	s.workers[key] = promptSplitWorker{id: workerID, cancel: cancel}
	s.mu.Unlock()
	go s.run(ctx, key, workerID)
}

func (s *PromptSplitService) run(ctx context.Context, key string, workerID uint64) {
	defer s.removeWorker(key, workerID)
	ticker := time.NewTicker(promptSplitPollInterval)
	defer ticker.Stop()
	for {
		if !s.advance(ctx, key) {
			return
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func (s *PromptSplitService) removeWorker(key string, workerID uint64) {
	s.mu.Lock()
	if current, ok := s.workers[key]; ok && current.id == workerID {
		delete(s.workers, key)
	}
	s.mu.Unlock()
}

func (s *PromptSplitService) advance(ctx context.Context, key string) bool {
	batch, ok := s.batchSnapshot(key)
	if !ok || !isActivePromptSplitStatus(batch.Status) {
		return false
	}
	switch batch.Status {
	case PromptSplitStatusSplitting:
		return s.advanceSplit(ctx, key, batch)
	case PromptSplitStatusSubmitting, PromptSplitStatusRunning:
		return s.advanceDirect(ctx, key, batch)
	default:
		return false
	}
}

func (s *PromptSplitService) advanceSplit(ctx context.Context, key string, batch promptSplitBatch) bool {
	if s.tasks == nil {
		s.markBatchError(key, "prompt split task service is unavailable")
		return false
	}
	task, found := s.tasks.GetTask(batch.Identity.identity(), batch.SplitTaskID)
	if !found {
		if err := s.ensureSplitTask(ctx, key); err != nil {
			return false
		}
		return true
	}
	switch util.Clean(task["status"]) {
	case TaskStatusQueued, TaskStatusRunning:
		return true
	case TaskStatusSuccess:
		result, err := ParsePromptSplitResult(promptSplitTaskText(task), batch.SplitCount)
		if err != nil {
			s.markBatchError(key, err.Error())
			return false
		}
		s.completeSplit(key, result)
		updated, ok := s.batchSnapshot(key)
		return ok && isActivePromptSplitStatus(updated.Status)
	case TaskStatusCancelled:
		s.markBatchCancelled(key, firstNonEmpty(util.Clean(task["error"]), "任务已终止"))
		return false
	default:
		s.markBatchError(key, firstNonEmpty(util.Clean(task["error"]), "提示词拆分失败"))
		return false
	}
}

func (s *PromptSplitService) advanceDirect(ctx context.Context, key string, batch promptSplitBatch) bool {
	if batch.ExecutionMode != PromptSplitExecutionModeDirect {
		return false
	}
	batch = s.reconcileDirectItems(key, batch)
	if !isActivePromptSplitStatus(batch.Status) {
		return false
	}
	if !batch.AdmissionStopped {
		for index, item := range batch.Items {
			if item.Status != promptSplitItemStatusNotSubmitted {
				continue
			}
			return s.submitDirectItem(ctx, key, index)
		}
	}
	return s.reconcileDirectBatchStatus(key)
}

func (s *PromptSplitService) ensureSplitTask(ctx context.Context, key string) error {
	batch, ok := s.batchSnapshot(key)
	if !ok || batch.Status != PromptSplitStatusSplitting {
		return nil
	}
	if s.tasks == nil {
		err := fmt.Errorf("prompt split task service is unavailable")
		s.markBatchError(key, err.Error())
		return err
	}
	if _, found := s.tasks.GetTask(batch.Identity.identity(), batch.SplitTaskID); found {
		return nil
	}
	_, err := s.tasks.SubmitChatWithMetadata(
		ctx,
		batch.Identity.identity(),
		batch.SplitTaskID,
		batch.SourcePrompt,
		batch.SplitModel,
		promptSplitMessages(batch.SourcePrompt, batch.SplitCount),
		true,
		copyPromptSplitTaskMetadata(batch.TaskMetadata),
		1,
	)
	if err != nil {
		s.markBatchError(key, err.Error())
	}
	return err
}

func (s *PromptSplitService) completeSplit(key string, result PromptSplitResult) {
	_, _ = s.mutateBatch(key, func(batch *promptSplitBatch) {
		if batch.Status != PromptSplitStatusSplitting {
			return
		}
		items := make([]PromptSplitItem, 0, len(result.Items))
		for index, splitItem := range result.Items {
			item := PromptSplitItem{Index: index + 1, VariantLabel: splitItem.VariantLabel, Prompt: splitItem.Prompt, Status: PromptSplitStatusReady}
			if batch.ExecutionMode == PromptSplitExecutionModeDirect {
				item.TaskID = promptSplitChildTaskID(batch.ID, item.Index)
				item.Status = promptSplitItemStatusNotSubmitted
			}
			items = append(items, item)
		}
		batch.VariationAxis = result.VariationAxis
		batch.Items = items
		if batch.ExecutionMode == PromptSplitExecutionModeDirect {
			batch.Status = PromptSplitStatusSubmitting
		} else {
			batch.Status = PromptSplitStatusReady
		}
		batch.Error = ""
		batch.UpdatedAt = util.NowLocal()
	})
}

func (s *PromptSplitService) reconcileDirectItems(key string, batch promptSplitBatch) promptSplitBatch {
	if s.tasks == nil {
		s.markBatchError(key, "prompt split task service is unavailable")
		updated, _ := s.batchSnapshot(key)
		return updated
	}
	tasks := make(map[string]map[string]any, len(batch.Items))
	for _, item := range batch.Items {
		if item.TaskID == "" {
			continue
		}
		if task, found := s.tasks.GetTask(batch.Identity.identity(), item.TaskID); found {
			tasks[item.TaskID] = task
		}
	}
	updated, err := s.mutateBatch(key, func(stored *promptSplitBatch) {
		if !isActivePromptSplitStatus(stored.Status) {
			return
		}
		changed := false
		for index := range stored.Items {
			item := &stored.Items[index]
			task, found := tasks[item.TaskID]
			if !found {
				switch item.Status {
				case promptSplitItemStatusSubmitting:
					if !stored.AdmissionStopped {
						item.Status = promptSplitItemStatusNotSubmitted
						item.Error = ""
						changed = true
					}
				case TaskStatusQueued, TaskStatusRunning:
					item.Status = TaskStatusError
					item.Error = "图片子任务不存在"
					changed = true
				}
				continue
			}
			status := util.Clean(task["status"])
			if status == "" {
				continue
			}
			if item.Status != status {
				item.Status = status
				changed = true
			}
			if taskError := util.Clean(task["error"]); taskError != "" && item.Error != taskError {
				item.Error = taskError
				changed = true
			} else if status == TaskStatusSuccess && item.Error != "" {
				item.Error = ""
				changed = true
			}
		}
		if changed {
			stored.UpdatedAt = util.NowLocal()
		}
	})
	if err != nil {
		return batch
	}
	return updated
}

func (s *PromptSplitService) submitDirectItem(ctx context.Context, key string, index int) bool {
	batch, ok := s.batchSnapshot(key)
	if !ok || (batch.Status != PromptSplitStatusSubmitting && batch.Status != PromptSplitStatusRunning) || batch.AdmissionStopped || index < 0 || index >= len(batch.Items) {
		return false
	}
	item := batch.Items[index]
	if item.Status != promptSplitItemStatusNotSubmitted || batch.ImageRequest == nil {
		if batch.ImageRequest == nil {
			s.markBatchError(key, "direct mode requires image_request")
		}
		return false
	}
	if _, err := s.mutateBatch(key, func(stored *promptSplitBatch) {
		if (stored.Status == PromptSplitStatusSubmitting || stored.Status == PromptSplitStatusRunning) && !stored.AdmissionStopped && index < len(stored.Items) && stored.Items[index].Status == promptSplitItemStatusNotSubmitted {
			stored.Items[index].Status = promptSplitItemStatusSubmitting
			stored.Items[index].Error = ""
			stored.UpdatedAt = util.NowLocal()
		}
	}); err != nil {
		return false
	}
	current, ok := s.batchSnapshot(key)
	if !ok || current.Status == PromptSplitStatusCancelled || current.AdmissionStopped || current.ImageRequest == nil || index >= len(current.Items) || current.Items[index].Status != promptSplitItemStatusSubmitting {
		return false
	}
	item = current.Items[index]
	task, err := s.submitImageTask(ctx, current, item)
	if err != nil {
		s.recordDirectAdmissionFailure(key, index, err)
		return s.reconcileDirectBatchStatus(key)
	}
	cancelAfterSubmit := false
	_, _ = s.mutateBatch(key, func(stored *promptSplitBatch) {
		if index >= len(stored.Items) {
			return
		}
		if stored.Status == PromptSplitStatusCancelled {
			cancelAfterSubmit = true
			return
		}
		stored.Items[index].Status = firstNonEmpty(util.Clean(task["status"]), TaskStatusQueued)
		stored.Items[index].Error = util.Clean(task["error"])
		stored.UpdatedAt = util.NowLocal()
	})
	if cancelAfterSubmit && s.tasks != nil {
		_, _ = s.tasks.CancelTask(current.Identity.identity(), item.TaskID)
	}
	return true
}

func (s *PromptSplitService) submitImageTask(ctx context.Context, batch promptSplitBatch, item PromptSplitItem) (map[string]any, error) {
	request := clonePromptSplitImageRequest(batch.ImageRequest)
	if request == nil {
		return nil, fmt.Errorf("direct mode requires image_request")
	}
	return s.tasks.SubmitGenerationWithOptions(
		ctx,
		batch.Identity.identity(),
		item.TaskID,
		item.Prompt,
		firstNonEmpty(request.Model, util.ImageModelAuto),
		request.Size,
		request.Quality,
		request.BaseURL,
		1,
		nil,
		promptSplitImageTaskMetadata(request),
		ImageOutputOptions{Format: request.OutputFormat, Compression: copyIntPointer(request.OutputCompression)},
		ImageToolOptions{
			Background:       request.Background,
			Moderation:       request.Moderation,
			Style:            request.Style,
			PartialImages:    copyIntPointer(request.PartialImages),
			OfficialFallback: copyBoolPointer(request.OfficialFallback),
		},
		request.Visibility,
	)
}

func promptSplitImageTaskMetadata(request *PromptSplitImageRequest) map[string]any {
	if request == nil {
		return nil
	}
	metadata := util.CopyMap(request.Metadata)
	if metadata == nil {
		metadata = map[string]any{}
	}
	if request.ProfessionalMode && !util.ToBool(metadata["professional_mode"]) {
		metadata["professional_mode"] = true
	}
	if request.ImageResolution != "" && util.Clean(metadata["image_resolution"]) == "" {
		metadata["image_resolution"] = request.ImageResolution
	}
	if request.SharePromptParameters && !util.ToBool(metadata["share_prompt_parameters"]) {
		metadata["share_prompt_parameters"] = true
		if request.ShareReferenceImages && !util.ToBool(metadata["share_reference_images"]) {
			metadata["share_reference_images"] = true
		}
	}
	if request.FrontendConversationID != "" && util.Clean(metadata["frontend_conversation_id"]) == "" {
		metadata["frontend_conversation_id"] = request.FrontendConversationID
	}
	if len(request.MidjourneySettings) > 0 && len(util.StringMap(metadata["midjourney_settings"])) == 0 {
		metadata["midjourney_settings"] = util.CopyMap(request.MidjourneySettings)
	}
	if len(request.OfficialSettings) > 0 && len(util.StringMap(metadata["official_settings"])) == 0 {
		metadata["official_settings"] = util.CopyMap(request.OfficialSettings)
	}
	if len(request.ProStudio) > 0 && len(util.StringMap(metadata["pro_studio"])) == 0 {
		metadata["pro_studio"] = util.CopyMap(request.ProStudio)
	}
	return metadata
}

func (s *PromptSplitService) recordDirectAdmissionFailure(key string, failedIndex int, err error) {
	_, _ = s.mutateBatch(key, func(batch *promptSplitBatch) {
		if !isActivePromptSplitStatus(batch.Status) {
			return
		}
		if failedIndex >= 0 && failedIndex < len(batch.Items) {
			batch.Items[failedIndex].Status = TaskStatusError
			batch.Items[failedIndex].Error = err.Error()
		}
		for index := failedIndex + 1; index < len(batch.Items); index++ {
			if batch.Items[index].Status == promptSplitItemStatusNotSubmitted {
				batch.Items[index].Error = "批次准入失败，未提交"
			}
		}
		batch.AdmissionStopped = true
		batch.Error = err.Error()
		batch.UpdatedAt = util.NowLocal()
	})
}

func (s *PromptSplitService) reconcileDirectBatchStatus(key string) bool {
	batch, ok := s.batchSnapshot(key)
	if !ok || !isActivePromptSplitStatus(batch.Status) {
		return false
	}
	status, message := promptSplitDirectStatus(batch)
	errorMessage := batch.Error
	if message != "" {
		errorMessage = message
	} else if status == PromptSplitStatusSuccess {
		errorMessage = ""
	}
	if batch.Status == status && batch.Error == errorMessage {
		return isActivePromptSplitStatus(batch.Status)
	}
	updated, err := s.mutateBatch(key, func(stored *promptSplitBatch) {
		if !isActivePromptSplitStatus(stored.Status) {
			return
		}
		stored.Status = status
		stored.Error = errorMessage
		stored.UpdatedAt = util.NowLocal()
	})
	if err != nil {
		return true
	}
	return isActivePromptSplitStatus(updated.Status)
}

func promptSplitDirectStatus(batch promptSplitBatch) (string, string) {
	active := false
	successes := 0
	cancelled := 0
	for _, item := range batch.Items {
		switch item.Status {
		case TaskStatusQueued, TaskStatusRunning, promptSplitItemStatusSubmitting:
			active = true
		case TaskStatusSuccess:
			successes++
		case TaskStatusCancelled:
			cancelled++
		}
	}
	if active {
		return PromptSplitStatusRunning, batch.Error
	}
	if len(batch.Items) > 0 && successes == len(batch.Items) {
		return PromptSplitStatusSuccess, ""
	}
	if successes > 0 {
		return PromptSplitStatusPartialSuccess, firstNonEmpty(batch.Error, "部分图片子任务未完成")
	}
	if len(batch.Items) > 0 && cancelled == len(batch.Items) {
		return PromptSplitStatusCancelled, firstNonEmpty(batch.Error, "任务已终止")
	}
	return PromptSplitStatusError, firstNonEmpty(batch.Error, "图片子任务未完成")
}

func (s *PromptSplitService) markBatchError(key, message string) {
	_, _ = s.mutateBatch(key, func(batch *promptSplitBatch) {
		if !isActivePromptSplitStatus(batch.Status) {
			return
		}
		batch.Status = PromptSplitStatusError
		batch.Error = strings.TrimSpace(message)
		batch.UpdatedAt = util.NowLocal()
	})
}

func (s *PromptSplitService) markBatchCancelled(key, message string) {
	_, _ = s.mutateBatch(key, func(batch *promptSplitBatch) {
		if !isActivePromptSplitStatus(batch.Status) {
			return
		}
		batch.Status = PromptSplitStatusCancelled
		batch.Error = strings.TrimSpace(message)
		batch.UpdatedAt = util.NowLocal()
	})
}

func (s *PromptSplitService) batchSnapshot(key string) (promptSplitBatch, bool) {
	if s == nil {
		return promptSplitBatch{}, false
	}
	s.mu.RLock()
	batch := s.batches[key]
	if batch == nil {
		s.mu.RUnlock()
		return promptSplitBatch{}, false
	}
	out := clonePromptSplitBatch(*batch)
	s.mu.RUnlock()
	return out, true
}

func (s *PromptSplitService) mutateBatch(key string, mutate func(*promptSplitBatch)) (promptSplitBatch, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	batch := s.batches[key]
	if batch == nil {
		return promptSplitBatch{}, ErrPromptSplitNotFound
	}
	before := clonePromptSplitBatch(*batch)
	mutate(batch)
	if reflect.DeepEqual(*batch, before) {
		return clonePromptSplitBatch(*batch), nil
	}
	if err := s.saveLocked(); err != nil {
		*batch = before
		return promptSplitBatch{}, err
	}
	return clonePromptSplitBatch(*batch), nil
}

func (s *PromptSplitService) loadLocked() map[string]*promptSplitBatch {
	out := map[string]*promptSplitBatch{}
	raw := loadStoredJSON(s.store, promptSplitDocumentName)
	if object, ok := raw.(map[string]any); ok {
		raw = object["items"]
	}
	encoded, err := json.Marshal(raw)
	if err != nil {
		return out
	}
	var items []promptSplitBatch
	if err := json.Unmarshal(encoded, &items); err != nil {
		return out
	}
	for index := range items {
		batch := normalizeStoredPromptSplitBatch(items[index])
		if batch.ID == "" || batch.OwnerID == "" {
			continue
		}
		out[promptSplitKey(batch.OwnerID, batch.ID)] = &batch
	}
	return out
}

func (s *PromptSplitService) saveLocked() error {
	if s.store == nil {
		return fmt.Errorf("storage document backend is required")
	}
	items := make([]promptSplitBatch, 0, len(s.batches))
	for _, batch := range s.batches {
		if batch != nil {
			items = append(items, clonePromptSplitBatch(*batch))
		}
	}
	sort.Slice(items, func(i, j int) bool {
		return items[i].UpdatedAt > items[j].UpdatedAt
	})
	return saveStoredJSON(s.store, promptSplitDocumentName, promptSplitDocument{Items: items})
}

func normalizePromptSplitCreateRequest(request PromptSplitCreateRequest) (PromptSplitCreateRequest, error) {
	request.ClientTaskID = strings.TrimSpace(request.ClientTaskID)
	request.Prompt = strings.TrimSpace(request.Prompt)
	request.Model = firstNonEmpty(strings.TrimSpace(request.Model), util.DefaultChatModel)
	request.ExecutionMode = strings.ToLower(strings.TrimSpace(request.ExecutionMode))
	if request.ClientTaskID == "" {
		return PromptSplitCreateRequest{}, fmt.Errorf("client_task_id is required")
	}
	if request.Prompt == "" {
		return PromptSplitCreateRequest{}, fmt.Errorf("prompt is required")
	}
	if request.SplitCount < 1 || request.SplitCount > maxImageTaskCount {
		return PromptSplitCreateRequest{}, fmt.Errorf("split_count must be between 1 and %d", maxImageTaskCount)
	}
	if request.ExecutionMode != PromptSplitExecutionModeNodes && request.ExecutionMode != PromptSplitExecutionModeDirect {
		return PromptSplitCreateRequest{}, fmt.Errorf("execution_mode must be nodes or direct")
	}
	if request.ExecutionMode == PromptSplitExecutionModeDirect && request.ImageRequest == nil {
		return PromptSplitCreateRequest{}, fmt.Errorf("direct mode requires image_request")
	}
	request.ImageRequest = clonePromptSplitImageRequest(request.ImageRequest)
	request.TaskMetadata = copyPromptSplitTaskMetadata(request.TaskMetadata)
	return request, nil
}

func normalizeStoredPromptSplitBatch(batch promptSplitBatch) promptSplitBatch {
	batch.ID = strings.TrimSpace(batch.ID)
	batch.OwnerID = strings.TrimSpace(batch.OwnerID)
	batch.SourcePrompt = strings.TrimSpace(batch.SourcePrompt)
	batch.SplitModel = firstNonEmpty(strings.TrimSpace(batch.SplitModel), util.DefaultChatModel)
	batch.VariationAxis = strings.TrimSpace(batch.VariationAxis)
	batch.ExecutionMode = strings.ToLower(strings.TrimSpace(batch.ExecutionMode))
	if batch.ExecutionMode != PromptSplitExecutionModeNodes && batch.ExecutionMode != PromptSplitExecutionModeDirect {
		batch.Status = PromptSplitStatusError
		batch.Error = "stored prompt split execution mode is invalid"
	}
	if batch.SplitCount < 1 || batch.SplitCount > maxImageTaskCount {
		batch.Status = PromptSplitStatusError
		batch.Error = "stored prompt split count is invalid"
	}
	if batch.SplitTaskID == "" && batch.ID != "" {
		batch.SplitTaskID = promptSplitTaskID(batch.ID)
	}
	batch.Identity = normalizePromptSplitIdentity(batch.Identity, batch.OwnerID)
	batch.ImageRequest = clonePromptSplitImageRequest(batch.ImageRequest)
	batch.TaskMetadata = copyPromptSplitTaskMetadata(batch.TaskMetadata)
	items := make([]PromptSplitItem, 0, len(batch.Items))
	for index, item := range batch.Items {
		item.Index = index + 1
		item.VariantLabel = strings.TrimSpace(item.VariantLabel)
		item.Prompt = strings.TrimSpace(item.Prompt)
		item.TaskID = strings.TrimSpace(item.TaskID)
		item.Status = strings.TrimSpace(item.Status)
		item.Error = strings.TrimSpace(item.Error)
		if batch.ExecutionMode == PromptSplitExecutionModeDirect && item.TaskID == "" && batch.ID != "" {
			item.TaskID = promptSplitChildTaskID(batch.ID, item.Index)
		}
		items = append(items, item)
	}
	if items == nil {
		items = []PromptSplitItem{}
	}
	batch.Items = items
	if batch.CreatedAt == "" {
		batch.CreatedAt = util.NowLocal()
	}
	if batch.UpdatedAt == "" {
		batch.UpdatedAt = batch.CreatedAt
	}
	return batch
}

func clonePromptSplitBatch(batch promptSplitBatch) promptSplitBatch {
	batch.Identity = normalizePromptSplitIdentity(batch.Identity, batch.OwnerID)
	batch.ImageRequest = clonePromptSplitImageRequest(batch.ImageRequest)
	batch.TaskMetadata = copyPromptSplitTaskMetadata(batch.TaskMetadata)
	batch.Items = append([]PromptSplitItem(nil), batch.Items...)
	if batch.Items == nil {
		batch.Items = []PromptSplitItem{}
	}
	return batch
}

func clonePromptSplitImageRequest(request *PromptSplitImageRequest) *PromptSplitImageRequest {
	if request == nil {
		return nil
	}
	copy := *request
	copy.Metadata = util.CopyMap(request.Metadata)
	copy.OutputCompression = copyIntPointer(request.OutputCompression)
	copy.PartialImages = copyIntPointer(request.PartialImages)
	copy.OfficialFallback = copyBoolPointer(request.OfficialFallback)
	copy.MidjourneySettings = util.CopyMap(request.MidjourneySettings)
	copy.OfficialSettings = util.CopyMap(request.OfficialSettings)
	copy.ProStudio = util.CopyMap(request.ProStudio)
	return &copy
}

func copyPromptSplitTaskMetadata(metadata map[string]any) map[string]any {
	if len(metadata) == 0 {
		return nil
	}
	out := map[string]any{}
	for _, key := range []string{imageTaskTeamIDPayloadKey, imageTaskPayerUserIDPayloadKey, imageTaskActorUserIDPayloadKey, imageTaskActorNamePayloadKey} {
		if value := strings.TrimSpace(util.Clean(metadata[key])); value != "" {
			out[key] = value
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func promptSplitIdentityFrom(identity Identity) promptSplitIdentity {
	return promptSplitIdentity{
		ID:       strings.TrimSpace(identity.ID),
		Name:     strings.TrimSpace(identity.Name),
		Role:     strings.TrimSpace(identity.Role),
		Provider: strings.TrimSpace(identity.Provider),
		OwnerID:  strings.TrimSpace(identity.OwnerID),
	}
}

func normalizePromptSplitIdentity(identity promptSplitIdentity, owner string) promptSplitIdentity {
	identity.ID = strings.TrimSpace(identity.ID)
	identity.Name = strings.TrimSpace(identity.Name)
	identity.Role = strings.TrimSpace(identity.Role)
	identity.Provider = strings.TrimSpace(identity.Provider)
	identity.OwnerID = firstNonEmpty(strings.TrimSpace(identity.OwnerID), strings.TrimSpace(owner))
	if identity.ID == "" {
		identity.ID = identity.OwnerID
	}
	return identity
}

func (identity promptSplitIdentity) identity() Identity {
	return Identity{
		ID:       identity.ID,
		Name:     identity.Name,
		Role:     identity.Role,
		Provider: identity.Provider,
		OwnerID:  identity.OwnerID,
	}
}

func promptSplitMessages(prompt string, splitCount int) []map[string]any {
	instruction := fmt.Sprintf(`You are a semantic text-to-image prompt splitter. Convert the user's request into exactly %d independent final prompts.

Rules:
1. The requested output count is exactly %d. This count is authoritative even when a number written in the user's text differs.
2. Infer one primary variation axis from the user's intent, such as color, camera angle, material, scene, style, season, flavor, packaging, or another explicit enumerable attribute. Prefer an explicitly quantified axis that matches the output count; otherwise prefer the first strongly emphasized axis.
3. Each item must represent exactly one distinct variant on that axis. Keep the subject identity, shape, material, branding, composition, lighting, and other essential context fixed unless one of them is the selected axis.
4. A request like "five colors of a ceramic bottle" means one color variant per prompt, not five colors or five bottles in every prompt. If the user explicitly says one image, same frame, together, group, or equivalent wording, preserve that multi-subject composition and vary the next eligible axis instead.
5. Preserve explicit variant values and their order. If there are more values than required, use the first required values. If there are fewer, add visually distinct values from the same axis. When the user explicitly restricts the allowed values, keep those values and use the closest secondary distinction to reach the required count.
6. Every prompt must be self-contained and ready for direct text-to-image generation. Use the user's language for variation_axis, variant_label, and prompt.
7. Return one JSON object with exactly this shape: {"variation_axis":"颜色","items":[{"variant_label":"红色","prompt":"一只红色陶瓷瓶子，保持用户要求的其余细节"}]}. The items array must contain exactly %d objects. Labels and prompts must be non-empty and unique after case and whitespace normalization.
8. Return JSON only. Do not use markdown, prose, analysis, numbered lists, or extra keys.`, splitCount, splitCount, splitCount)
	return []map[string]any{
		{"role": "system", "content": instruction},
		{"role": "user", "content": prompt},
	}
}

func promptSplitTaskText(task map[string]any) string {
	parts := make([]string, 0)
	for _, item := range util.AsMapSlice(task["data"]) {
		if text := strings.TrimSpace(util.Clean(item["text_response"])); text != "" {
			parts = append(parts, text)
		}
	}
	return strings.Join(parts, "\n")
}

func publicPromptSplitBatch(batch promptSplitBatch) map[string]any {
	items := make([]map[string]any, 0, len(batch.Items))
	for _, item := range batch.Items {
		publicItem := map[string]any{
			"index":  item.Index,
			"prompt": item.Prompt,
			"status": item.Status,
		}
		if item.VariantLabel != "" {
			publicItem["variant_label"] = item.VariantLabel
		}
		if item.TaskID != "" {
			publicItem["task_id"] = item.TaskID
		}
		if item.Error != "" {
			publicItem["error"] = item.Error
		}
		items = append(items, publicItem)
	}
	public := map[string]any{
		"id":             batch.ID,
		"status":         batch.Status,
		"execution_mode": batch.ExecutionMode,
		"split_count":    batch.SplitCount,
		"split_task_id":  batch.SplitTaskID,
		"items":          items,
		"created_at":     batch.CreatedAt,
		"updated_at":     batch.UpdatedAt,
	}
	if batch.VariationAxis != "" {
		public["variation_axis"] = batch.VariationAxis
	}
	if batch.Error != "" {
		public["error"] = batch.Error
	}
	return public
}

func isActivePromptSplitStatus(status string) bool {
	switch strings.TrimSpace(status) {
	case PromptSplitStatusSplitting, PromptSplitStatusSubmitting, PromptSplitStatusRunning:
		return true
	default:
		return false
	}
}

func promptSplitKey(owner, id string) string {
	return strings.TrimSpace(owner) + ":" + strings.TrimSpace(id)
}

func promptSplitTaskID(batchID string) string {
	return promptSplitTaskNamespacePrefix(batchID) + ":split"
}

func promptSplitChildTaskID(batchID string, index int) string {
	return fmt.Sprintf("%s:image:%d", promptSplitTaskNamespacePrefix(batchID), index)
}

func promptSplitTaskNamespacePrefix(batchID string) string {
	return promptSplitTaskNamespace + ":" + util.SHA1Short(strings.TrimSpace(batchID), 24)
}

func copyIntPointer(value *int) *int {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}

func copyBoolPointer(value *bool) *bool {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}
