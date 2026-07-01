package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

const (
	TaskStatusQueued    = "queued"
	TaskStatusRunning   = "running"
	TaskStatusSuccess   = "success"
	TaskStatusError     = "error"
	TaskStatusCancelled = "cancelled"

	defaultImageTaskTimeout        = 5 * time.Minute
	maxImageTaskCount              = 10
	defaultImageTaskStaleThreshold = 10 * time.Minute
	maxImageTaskStaleThreshold     = 7 * 24 * time.Hour
	maxImageTaskDiagnosticsItems   = 20

	ImageTaskAmountUnitAPIMartCost = "apimart_cost"

	imageTaskAmountUnitAPIMartCost = ImageTaskAmountUnitAPIMartCost

	imageOutputCallbackPayloadKey      = "image_output_callback"
	imageOutputSlotAcquirerPayloadKey  = "image_output_slot_acquirer"
	imageOutputBatchLimitPayloadKey    = "image_output_batch_limit"
	imageOutputSequentialPayloadKey    = "image_output_sequential"
	imageTaskBillingBillablePayloadKey = "billing_billable"
	imageTaskBillingChargedAmountKey   = "billing_charged_amount"
	imageTaskBillingChargeKey          = "billing_charge_key"
	imageTaskBillingUnitAmountKey      = "billing_unit_amount"
	imageTaskBillingProviderKey        = "billing_provider"
	imageTaskExternalChargedAmountKey  = "external_billing_charged_amount"
	imageTaskExternalChargedUnitKey    = "external_billing_charged_amount_unit"
	imageTaskExternalConsumedAmountKey = "external_billing_consumed_amount"
	imageTaskExternalAmountUnitKey     = "external_billing_amount_unit"
	imageTaskExternalModelKey          = "external_billing_model"
	imageTaskExternalUnitAmountKey     = "external_billing_unit_amount"
	imageTaskPayerUserIDPayloadKey     = "payer_user_id"
	imageTaskActorUserIDPayloadKey     = "actor_user_id"
	imageTaskActorNamePayloadKey       = "actor_name"
	imageTaskOwnerNamePayloadKey       = "owner_name"
	imageTaskTeamIDPayloadKey          = "team_id"

	imageTaskExternalAmountUnitBalance = "balance"
)

type ImageTaskHandler func(context.Context, Identity, map[string]any) (map[string]any, error)

type ExternalTaskBilling interface {
	ReserveTask(ctx context.Context, identity Identity, task map[string]any, amount float64, ref BillingReference) error
	CommitTask(ctx context.Context, identity Identity, task map[string]any, consumed float64, ref BillingReference) error
	RefundTask(ctx context.Context, identity Identity, task map[string]any, amount float64, ref BillingReference) error
}

type ImageOutputOptions struct {
	Format      string
	Compression *int
}

type VideoGenerationOptions struct {
	Duration      int
	AspectRatio   string
	Resolution    string
	EnhancePrompt bool
	GenerateAudio bool
}

type ImageToolOptions struct {
	Background        string
	Moderation        string
	Style             string
	PartialImages     *int
	InputImageMask    string
	OfficialFallback  *bool
	SequentialOutputs bool
}

type ImageTaskService struct {
	mu                   sync.RWMutex
	store                storage.JSONDocumentBackend
	docName              string
	generation           ImageTaskHandler
	edit                 ImageTaskHandler
	chat                 ImageTaskHandler
	video                ImageTaskHandler
	billing              *BillingService
	externalBilling      ExternalTaskBilling
	teamDailyLimitGetter func(teamID, actorUserID string) int
	retentionGetter      func() int
	taskTimeoutGetter    func() time.Duration
	userConcurrentLimit  func() int
	userRPMLimit         func() int
	tasks                map[string]map[string]any
	cancels              map[string]context.CancelFunc
	ownerSubmitTimes     map[string][]time.Time
	ownerRunningUnits    map[string]int
	creationUnitCond     *sync.Cond
}

type ImageTaskDiagnosticsItem struct {
	ID             string   `json:"id"`
	OwnerID        string   `json:"owner_id"`
	Status         string   `json:"status"`
	Mode           string   `json:"mode"`
	UpdatedAt      string   `json:"updated_at"`
	Error          string   `json:"error,omitempty"`
	OutputStatuses []string `json:"output_statuses,omitempty"`
	AgeSeconds     int64    `json:"age_seconds"`
	Stale          bool     `json:"stale"`
	DirtyTerminal  bool     `json:"dirty_terminal"`
}

type ImageTaskDiagnosticsSummary struct {
	TotalTasks                  int                        `json:"total_tasks"`
	ActiveTasks                 int                        `json:"active_tasks"`
	QueuedTasks                 int                        `json:"queued_tasks"`
	RunningTasks                int                        `json:"running_tasks"`
	TerminalTasks               int                        `json:"terminal_tasks"`
	StaleActiveTasks            int                        `json:"stale_active_tasks"`
	DirtyTerminalTasks          int                        `json:"dirty_terminal_tasks"`
	DirtyTerminalOutputStatuses int                        `json:"dirty_terminal_output_statuses"`
	ActiveOutputStatuses        int                        `json:"active_output_statuses"`
	RunningOwners               int                        `json:"running_owners"`
	RunningUnits                int                        `json:"running_units"`
	StaleThresholdSeconds       int64                      `json:"stale_threshold_seconds"`
	SuspiciousTasks             []ImageTaskDiagnosticsItem `json:"suspicious_tasks,omitempty"`
}

type ImageTaskRepairOptions struct {
	FinalizeActive bool
	StaleThreshold time.Duration
}

type ImageTaskRepairResult struct {
	RepairedTerminalTasks int                         `json:"repaired_terminal_tasks"`
	FinalizedActiveTasks  int                         `json:"finalized_active_tasks"`
	SkippedActiveTasks    int                         `json:"skipped_active_tasks"`
	CancelledHandlers     int                         `json:"cancelled_handlers"`
	Before                ImageTaskDiagnosticsSummary `json:"before"`
	After                 ImageTaskDiagnosticsSummary `json:"after"`
}

type ImageTaskUsageOverview struct {
	Today          map[string]any   `json:"today"`
	Last7Days      []map[string]any `json:"last_7_days"`
	TaskModes      []map[string]any `json:"task_modes"`
	RecentTaskLogs []map[string]any `json:"recent_task_logs"`
}

type ImageTaskLimitError struct {
	Message string
}

func (e ImageTaskLimitError) Error() string {
	return e.Message
}

func NewStoredImageTaskService(backend storage.Backend, generation ImageTaskHandler, edit ImageTaskHandler, chat ImageTaskHandler, retentionGetter func() int, limitGetters ...func() int) *ImageTaskService {
	return newImageTaskService(jsonDocumentStoreFromBackend(backend), generation, edit, chat, nil, retentionGetter, limitGetters...)
}

func (s *ImageTaskService) SetVideoHandler(handler ImageTaskHandler) {
	s.video = handler
}

func newImageTaskService(store storage.JSONDocumentBackend, generation ImageTaskHandler, edit ImageTaskHandler, chat ImageTaskHandler, video ImageTaskHandler, retentionGetter func() int, limitGetters ...func() int) *ImageTaskService {
	s := &ImageTaskService{store: store, docName: "image_tasks.json", generation: generation, edit: edit, chat: chat, video: video, retentionGetter: retentionGetter, tasks: map[string]map[string]any{}, cancels: map[string]context.CancelFunc{}, ownerSubmitTimes: map[string][]time.Time{}, ownerRunningUnits: map[string]int{}}
	s.creationUnitCond = sync.NewCond(&s.mu)
	if len(limitGetters) > 0 {
		s.userConcurrentLimit = limitGetters[0]
	}
	if len(limitGetters) > 1 {
		s.userRPMLimit = limitGetters[1]
	}
	s.mu.Lock()
	s.tasks = s.loadLocked()
	changed := s.recoverUnfinishedLocked()
	if s.cleanupLocked() || changed {
		_ = s.saveLocked()
	}
	s.mu.Unlock()
	return s
}

func (s *ImageTaskService) SetTaskTimeoutGetter(getter func() time.Duration) {
	if getter == nil {
		return
	}
	s.taskTimeoutGetter = getter
}

func (s *ImageTaskService) SetBillingService(billing *BillingService) {
	s.billing = billing
	if billing == nil {
		return
	}
	s.settlePendingTaskBilling()
}

func (s *ImageTaskService) SetExternalBilling(billing ExternalTaskBilling) {
	s.externalBilling = billing
	if billing == nil {
		return
	}
	s.settlePendingTaskBilling()
}

func (s *ImageTaskService) SetTeamDailyLimitGetter(getter func(teamID, actorUserID string) int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.teamDailyLimitGetter = getter
}

func (s *ImageTaskService) settlePendingTaskBilling() {
	var settleKeys []string
	s.mu.Lock()
	changed := false
	for key, task := range s.tasks {
		taskChanged := false
		if _, ok := task["billing_consumed_amount"]; !ok && !isActiveTaskStatus(util.Clean(task["status"])) && isBillableImageTaskMode(util.Clean(task["mode"]), task) && (util.ToInt(task[imageTaskBillingChargedAmountKey], 0) > 0 || imageTaskFloat(task[imageTaskExternalChargedAmountKey]) > 0) {
			settleKeys = append(settleKeys, key)
			continue
		}
		if _, ok := task["billing_consumed_amount"]; !ok && !isActiveTaskStatus(util.Clean(task["status"])) && isBillableImageTaskMode(util.Clean(task["mode"]), task) {
			unitAmount := util.ToInt(task[imageTaskBillingUnitAmountKey], 1)
			if unitAmount < 1 {
				unitAmount = 1
			}
			task["billing_consumed_amount"] = billableTaskOutputCount(task) * unitAmount
			taskChanged = true
		}
		if taskChanged {
			task["updated_at"] = util.NowLocal()
			s.tasks[key] = task
			changed = true
		}
	}
	if changed {
		_ = s.saveLocked()
	}
	s.mu.Unlock()
	for _, key := range settleKeys {
		s.settleTaskBilling(key)
	}
}

func (s *ImageTaskService) SubmitGeneration(ctx context.Context, identity Identity, clientTaskID, prompt, model, size, quality, baseURL string, n int, messages any, visibilityValues ...string) (map[string]any, error) {
	prompt = strings.TrimSpace(prompt)
	if prompt == "" {
		return nil, fmt.Errorf("prompt is required")
	}
	if err := ValidateImageContentPolicy(prompt, messages); err != nil {
		return nil, err
	}
	visibility, err := imageTaskVisibility(visibilityValues...)
	if err != nil {
		return nil, err
	}
	size = normalizeImageTaskSize(size)
	payload := map[string]any{"prompt": prompt, "model": model, "n": normalizedImageTaskCount(n), "size": size, "quality": quality, "response_format": "url", "base_url": baseURL, "visibility": visibility}
	if messages != nil {
		payload["messages"] = messages
	}
	return s.submit(ctx, identity, clientTaskID, "generate", payload)
}

func (s *ImageTaskService) SubmitGenerationWithMetadata(ctx context.Context, identity Identity, clientTaskID, prompt, model, size, quality, baseURL string, n int, messages any, metadata map[string]any, visibilityValues ...string) (map[string]any, error) {
	return s.submitImageWithMetadata(ctx, identity, clientTaskID, prompt, model, size, quality, baseURL, n, messages, metadata, "generate", nil, visibilityValues...)
}

func (s *ImageTaskService) SubmitGenerationWithOptions(ctx context.Context, identity Identity, clientTaskID, prompt, model, size, quality, baseURL string, n int, messages any, metadata map[string]any, options ImageOutputOptions, toolOptions ImageToolOptions, visibilityValues ...string) (map[string]any, error) {
	return s.submitImageWithMetadataAndOptions(ctx, identity, clientTaskID, prompt, model, size, quality, baseURL, n, messages, metadata, "generate", nil, options, toolOptions, visibilityValues...)
}

func (s *ImageTaskService) SubmitEdit(ctx context.Context, identity Identity, clientTaskID, prompt, model, size, quality, baseURL string, images any, n int, messages any, visibilityValues ...string) (map[string]any, error) {
	prompt = strings.TrimSpace(prompt)
	if prompt == "" {
		return nil, fmt.Errorf("prompt is required")
	}
	if err := ValidateImageContentPolicy(prompt, messages); err != nil {
		return nil, err
	}
	visibility, err := imageTaskVisibility(visibilityValues...)
	if err != nil {
		return nil, err
	}
	size = normalizeImageTaskSize(size)
	payload := map[string]any{"prompt": prompt, "images": images, "model": model, "n": normalizedImageTaskCount(n), "size": size, "quality": quality, "response_format": "url", "base_url": baseURL, "visibility": visibility}
	if messages != nil {
		payload["messages"] = messages
	}
	return s.submit(ctx, identity, clientTaskID, "edit", payload)
}

func (s *ImageTaskService) SubmitEditWithMetadata(ctx context.Context, identity Identity, clientTaskID, prompt, model, size, quality, baseURL string, images any, n int, messages any, metadata map[string]any, visibilityValues ...string) (map[string]any, error) {
	return s.submitImageWithMetadata(ctx, identity, clientTaskID, prompt, model, size, quality, baseURL, n, messages, metadata, "edit", images, visibilityValues...)
}

func (s *ImageTaskService) SubmitEditWithOptions(ctx context.Context, identity Identity, clientTaskID, prompt, model, size, quality, baseURL string, images any, n int, messages any, metadata map[string]any, options ImageOutputOptions, toolOptions ImageToolOptions, visibilityValues ...string) (map[string]any, error) {
	return s.submitImageWithMetadataAndOptions(ctx, identity, clientTaskID, prompt, model, size, quality, baseURL, n, messages, metadata, "edit", images, options, toolOptions, visibilityValues...)
}

func (s *ImageTaskService) SubmitChat(ctx context.Context, identity Identity, clientTaskID, prompt, model string, messages any, billable bool, nValues ...int) (map[string]any, error) {
	return s.SubmitChatWithMetadata(ctx, identity, clientTaskID, prompt, model, messages, billable, nil, nValues...)
}

func (s *ImageTaskService) SubmitChatWithMetadata(ctx context.Context, identity Identity, clientTaskID, prompt, model string, messages any, billable bool, metadata map[string]any, nValues ...int) (map[string]any, error) {
	prompt = strings.TrimSpace(prompt)
	if prompt == "" {
		return nil, fmt.Errorf("prompt is required")
	}
	if billable {
		if err := ValidateImageContentPolicy(prompt, messages); err != nil {
			return nil, err
		}
	}
	if len(util.AsMapSlice(messages)) == 0 {
		return nil, fmt.Errorf("messages are required")
	}
	n := 1
	if len(nValues) > 0 {
		n = normalizedImageTaskCount(nValues[0])
	}
	payload := map[string]any{"prompt": prompt, "model": firstNonEmpty(util.Clean(model), util.ImageModelAuto), "messages": messages, "n": n, "visibility": ImageVisibilityPrivate}
	if billable {
		payload[imageTaskBillingBillablePayloadKey] = true
	}
	mergeImageTaskMetadata(payload, metadata)
	return s.submit(ctx, identity, clientTaskID, "chat", payload)
}

func (s *ImageTaskService) SubmitVideo(ctx context.Context, identity Identity, clientTaskID, prompt, model string, images any, options VideoGenerationOptions, visibilityValues ...string) (map[string]any, error) {
	return s.SubmitVideoWithMetadata(ctx, identity, clientTaskID, prompt, model, images, options, nil, visibilityValues...)
}

func (s *ImageTaskService) SubmitVideoWithMetadata(ctx context.Context, identity Identity, clientTaskID, prompt, model string, images any, options VideoGenerationOptions, metadata map[string]any, visibilityValues ...string) (map[string]any, error) {
	prompt = strings.TrimSpace(prompt)
	if prompt == "" {
		return nil, fmt.Errorf("prompt is required")
	}
	if err := ValidateImageContentPolicy(prompt, nil); err != nil {
		return nil, err
	}
	visibility, err := imageTaskVisibility(visibilityValues...)
	if err != nil {
		return nil, err
	}
	duration := options.Duration
	if duration < 5 {
		duration = 5
	}
	if duration > 15 {
		duration = 15
	}
	payload := map[string]any{
		"prompt":         prompt,
		"model":          firstNonEmpty(util.Clean(model), util.ImageModelAuto),
		"images":         images,
		"duration":       duration,
		"aspect_ratio":   strings.TrimSpace(options.AspectRatio),
		"resolution":     strings.TrimSpace(options.Resolution),
		"n":              1,
		"visibility":     visibility,
		"enhance_prompt": options.EnhancePrompt,
		"generate_audio": options.GenerateAudio,
	}
	mergeImageTaskMetadata(payload, metadata)
	return s.submit(ctx, identity, clientTaskID, "video", payload)
}

func (s *ImageTaskService) submitImageWithMetadata(ctx context.Context, identity Identity, clientTaskID, prompt, model, size, quality, baseURL string, n int, messages any, metadata map[string]any, mode string, images any, visibilityValues ...string) (map[string]any, error) {
	return s.submitImageWithMetadataAndOptions(ctx, identity, clientTaskID, prompt, model, size, quality, baseURL, n, messages, metadata, mode, images, ImageOutputOptions{}, ImageToolOptions{}, visibilityValues...)
}

func (s *ImageTaskService) submitImageWithMetadataAndOptions(ctx context.Context, identity Identity, clientTaskID, prompt, model, size, quality, baseURL string, n int, messages any, metadata map[string]any, mode string, images any, options ImageOutputOptions, toolOptions ImageToolOptions, visibilityValues ...string) (map[string]any, error) {
	prompt = strings.TrimSpace(prompt)
	if prompt == "" {
		return nil, fmt.Errorf("prompt is required")
	}
	if err := ValidateImageContentPolicy(prompt, messages); err != nil {
		return nil, err
	}
	visibility, err := imageTaskVisibility(visibilityValues...)
	if err != nil {
		return nil, err
	}
	size = normalizeImageTaskSize(size)
	payload := map[string]any{"prompt": prompt, "model": model, "n": normalizedImageTaskCount(n), "size": size, "quality": quality, "response_format": "url", "base_url": baseURL, "visibility": visibility}
	if images != nil {
		payload["images"] = images
	}
	if messages != nil {
		payload["messages"] = messages
	}
	mergeImageTaskMetadata(payload, metadata)
	mergeImageOutputOptions(payload, options)
	mergeImageToolOptions(payload, toolOptions)
	return s.submit(ctx, identity, clientTaskID, mode, payload)
}

func (s *ImageTaskService) ListTasks(identity Identity, taskIDs []string) map[string]any {
	owner := ownerID(identity)
	requested := make([]string, 0, len(taskIDs))
	for _, id := range taskIDs {
		if id = strings.TrimSpace(id); id != "" {
			requested = append(requested, id)
		}
	}
	s.mu.Lock()
	if s.cleanupLocked() {
		_ = s.saveLocked()
	}
	items := make([]map[string]any, 0)
	missing := make([]string, 0)
	if len(requested) == 0 {
		for _, task := range s.tasks {
			if task["owner_id"] == owner {
				items = append(items, publicTask(task))
			}
		}
		sort.Slice(items, func(i, j int) bool { return util.Clean(items[i]["updated_at"]) > util.Clean(items[j]["updated_at"]) })
	} else {
		for _, id := range requested {
			task := s.tasks[taskKey(owner, id)]
			if task == nil {
				missing = append(missing, id)
			} else {
				items = append(items, publicTask(task))
			}
		}
	}
	s.mu.Unlock()
	return map[string]any{"items": items, "missing_ids": missing}
}

func (s *ImageTaskService) ListTeamTasks(identity Identity, teamID, actorFilter string, limit int) map[string]any {
	teamID = strings.TrimSpace(teamID)
	if teamID == "" {
		return map[string]any{"items": []map[string]any{}}
	}
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	actorFilter = strings.TrimSpace(actorFilter)
	s.mu.Lock()
	if s.cleanupLocked() {
		_ = s.saveLocked()
	}
	items := make([]map[string]any, 0)
	for _, task := range s.tasks {
		if util.Clean(task[imageTaskTeamIDPayloadKey]) != teamID {
			continue
		}
		if actorFilter != "" && util.Clean(task[imageTaskActorUserIDPayloadKey]) != actorFilter {
			continue
		}
		items = append(items, publicTask(task))
	}
	sort.Slice(items, func(i, j int) bool { return util.Clean(items[i]["updated_at"]) > util.Clean(items[j]["updated_at"]) })
	if len(items) > limit {
		items = items[:limit]
	}
	s.mu.Unlock()
	return map[string]any{"items": items}
}

func (s *ImageTaskService) TeamActorDailyUsageAmount(teamID, actorUserID string, now time.Time) int {
	teamID = strings.TrimSpace(teamID)
	actorUserID = strings.TrimSpace(actorUserID)
	if teamID == "" || actorUserID == "" {
		return 0
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cleanupLocked() {
		_ = s.saveLocked()
	}
	return s.teamActorDailyUsageAmountLocked(teamID, actorUserID, now)
}

func (s *ImageTaskService) GetTask(identity Identity, clientTaskID string) (map[string]any, bool) {
	taskID := strings.TrimSpace(clientTaskID)
	if taskID == "" {
		return nil, false
	}
	key := taskKey(ownerID(identity), taskID)
	s.mu.Lock()
	if s.cleanupLocked() {
		_ = s.saveLocked()
	}
	task := s.tasks[key]
	if task == nil {
		s.mu.Unlock()
		return nil, false
	}
	out := publicTask(task)
	s.mu.Unlock()
	return out, true
}

func (s *ImageTaskService) CancelTask(identity Identity, clientTaskID string) (map[string]any, error) {
	taskID := strings.TrimSpace(clientTaskID)
	if taskID == "" {
		return nil, fmt.Errorf("client_task_id is required")
	}
	key := taskKey(ownerID(identity), taskID)
	now := util.NowLocal()
	var cancel context.CancelFunc
	s.mu.Lock()
	task := s.tasks[key]
	cancelled := false
	if task == nil {
		s.mu.Unlock()
		return nil, fmt.Errorf("creation task not found")
	}
	if isActiveTaskStatus(util.Clean(task["status"])) {
		task["status"] = TaskStatusCancelled
		task["error"] = "任务已终止"
		if task["data"] == nil {
			task["data"] = []any{}
		}
		applyTerminalImageOutputStatuses(task, TaskStatusCancelled)
		task["updated_at"] = now
		cancel = s.cancels[key]
		delete(s.cancels, key)
		_ = s.saveLocked()
		cancelled = true
	}
	result := publicTask(task)
	s.mu.Unlock()
	if cancelled {
		s.settleTaskBilling(key)
	}
	if cancel != nil {
		cancel()
	}
	return result, nil
}

func NormalizeImageTaskStaleThreshold(threshold time.Duration) time.Duration {
	if threshold <= 0 {
		return defaultImageTaskStaleThreshold
	}
	if threshold > maxImageTaskStaleThreshold {
		return maxImageTaskStaleThreshold
	}
	return threshold
}

func ImageTaskStaleThresholdFromSeconds(seconds int) time.Duration {
	if seconds <= 0 {
		return defaultImageTaskStaleThreshold
	}
	maxSeconds := int(maxImageTaskStaleThreshold / time.Second)
	if seconds > maxSeconds {
		return maxImageTaskStaleThreshold
	}
	return time.Duration(seconds) * time.Second
}

func (s *ImageTaskService) DiagnosticsSummary(staleThresholds ...time.Duration) ImageTaskDiagnosticsSummary {
	staleThreshold := defaultImageTaskStaleThreshold
	if len(staleThresholds) > 0 {
		staleThreshold = NormalizeImageTaskStaleThreshold(staleThresholds[0])
	}
	s.mu.Lock()
	if s.cleanupLocked() {
		_ = s.saveLocked()
	}
	summary := s.diagnosticsSummaryLocked(staleThreshold, time.Now())
	s.mu.Unlock()
	return summary
}

func (s *ImageTaskService) RepairDiagnostics(options ImageTaskRepairOptions) ImageTaskRepairResult {
	var cancels []context.CancelFunc
	var settleKeys []string
	now := time.Now()
	nowText := util.NowLocal()
	staleThreshold := NormalizeImageTaskStaleThreshold(options.StaleThreshold)
	s.mu.Lock()
	if s.cleanupLocked() {
		_ = s.saveLocked()
	}
	result := ImageTaskRepairResult{Before: s.diagnosticsSummaryLocked(staleThreshold, now)}
	changed := false
	for key, task := range s.tasks {
		status := util.Clean(task["status"])
		if isActiveTaskStatus(status) {
			if !options.FinalizeActive {
				continue
			}
			if !staleActiveImageTask(task, staleThreshold, now) {
				result.SkippedActiveTasks++
				continue
			}
			task["status"] = TaskStatusError
			task["error"] = "管理员已终止卡住的创作任务"
			if task["data"] == nil {
				task["data"] = []any{}
			}
			applyTerminalImageOutputStatuses(task, TaskStatusError)
			task["updated_at"] = nowText
			if cancel := s.cancels[key]; cancel != nil {
				cancels = append(cancels, cancel)
			}
			delete(s.cancels, key)
			settleKeys = append(settleKeys, key)
			result.FinalizedActiveTasks++
			changed = true
			continue
		}
		if terminalTaskOutputStatusesDirty(task) {
			if applyTerminalImageOutputStatuses(task, status) {
				task["updated_at"] = nowText
				result.RepairedTerminalTasks++
				changed = true
			}
		}
	}
	if changed {
		_ = s.saveLocked()
	}
	result.CancelledHandlers = len(cancels)
	result.After = s.diagnosticsSummaryLocked(staleThreshold, now)
	s.mu.Unlock()
	for _, cancel := range cancels {
		cancel()
	}
	for _, key := range settleKeys {
		s.settleTaskBilling(key)
	}
	return result
}

func (s *ImageTaskService) UsageOverview(days int) ImageTaskUsageOverview {
	if days <= 0 {
		days = 7
	}
	if days > 90 {
		days = 90
	}
	now := time.Now()
	dates := imageTaskUsageDateRange(now, days)
	startDate := dates[0]
	endDate := dates[len(dates)-1]
	byDay := map[string]map[string]any{}
	for _, date := range dates {
		byDay[date] = newImageTaskUsageSummary(date)
	}
	modeTotals := map[string]map[string]any{}
	recent := make([]map[string]any, 0, 20)

	s.mu.Lock()
	if s.cleanupLocked() {
		_ = s.saveLocked()
	}
	for _, task := range s.tasks {
		createdDay := taskDay(task, "created_at")
		updatedDay := taskDay(task, "updated_at")
		day := createdDay
		if day == "" {
			day = updatedDay
		}
		if day < startDate || day > endDate {
			continue
		}
		addImageTaskToUsageSummary(byDay[day], task)
		mode := util.Clean(task["mode"])
		if mode == "" {
			mode = "unknown"
		}
		modeSummary := modeTotals[mode]
		if modeSummary == nil {
			modeSummary = newImageTaskUsageSummary("")
			modeSummary["mode"] = mode
			modeSummary["label"] = imageTaskModeLabel(mode)
			modeTotals[mode] = modeSummary
		}
		addImageTaskToUsageSummary(modeSummary, task)
		if day == endDate {
			recent = append(recent, imageTaskUsageLogItem(task))
		}
	}
	s.mu.Unlock()

	last7Days := make([]map[string]any, 0, len(dates))
	for _, date := range dates {
		last7Days = append(last7Days, byDay[date])
	}
	modes := make([]map[string]any, 0, len(modeTotals))
	for _, item := range modeTotals {
		modes = append(modes, item)
	}
	sort.SliceStable(modes, func(i, j int) bool {
		leftLocal := util.ToInt(modes[i]["local_consumed_amount"], 0)
		rightLocal := util.ToInt(modes[j]["local_consumed_amount"], 0)
		if leftLocal != rightLocal {
			return leftLocal > rightLocal
		}
		leftTasks := util.ToInt(modes[i]["task_count"], 0)
		rightTasks := util.ToInt(modes[j]["task_count"], 0)
		if leftTasks != rightTasks {
			return leftTasks > rightTasks
		}
		return util.Clean(modes[i]["mode"]) < util.Clean(modes[j]["mode"])
	})
	sort.SliceStable(recent, func(i, j int) bool {
		return util.Clean(recent[i]["updated_at"]) > util.Clean(recent[j]["updated_at"])
	})
	if len(recent) > 20 {
		recent = recent[:20]
	}
	return ImageTaskUsageOverview{
		Today:          byDay[endDate],
		Last7Days:      last7Days,
		TaskModes:      modes,
		RecentTaskLogs: recent,
	}
}

func (s *ImageTaskService) submit(ctx context.Context, identity Identity, clientTaskID, mode string, payload map[string]any) (map[string]any, error) {
	taskID := strings.TrimSpace(clientTaskID)
	if taskID == "" {
		return nil, fmt.Errorf("client_task_id is required")
	}
	owner := ownerID(identity)
	key := taskKey(owner, taskID)
	now := util.NowLocal()
	s.mu.Lock()
	cleaned := s.cleanupLocked()
	if existing := s.tasks[key]; existing != nil {
		if cleaned {
			_ = s.saveLocked()
		}
		result := publicTask(existing)
		s.mu.Unlock()
		return result, nil
	}
	count := taskCount(mode, payload)
	billingUnitAmount := imageTaskBillingUnitAmount(payload)
	billingChargeAmount := count * billingUnitAmount
	externalBillingModel := imageTaskExternalBillingModel(mode, payload)
	externalBillingUnitAmount := imageTaskExternalBillingUnitAmount(mode, payload)
	externalBillingChargeAmount := float64(count) * externalBillingUnitAmount
	billingUser := billingUserID(identity)
	useExternalBilling := s.externalBilling != nil && identity.Role == AuthRoleUser && identity.Provider == AuthProviderSub2API && isBillableImageTaskMode(mode, payload)
	shouldPrechargeBilling := s.billing != nil && identity.Role == AuthRoleUser && identity.Provider != AuthProviderSub2API && billingUser != "" && isBillableImageTaskMode(mode, payload)
	if shouldPrechargeBilling {
		if err := s.billing.CheckAvailable(identity, billingChargeAmount); err != nil {
			if cleaned {
				_ = s.saveLocked()
			}
			s.mu.Unlock()
			return nil, err
		}
	}
	if err := s.checkTeamDailyLimitLocked(payload, billingChargeAmount, time.Now()); err != nil {
		if cleaned {
			_ = s.saveLocked()
		}
		s.mu.Unlock()
		return nil, err
	}
	if err := s.checkUserTaskLimitsLocked(identity, owner, count, time.Now()); err != nil {
		if cleaned {
			_ = s.saveLocked()
		}
		s.mu.Unlock()
		return nil, err
	}
	billingChargedAmount := 0
	billingChargeKey := ""
	if shouldPrechargeBilling || useExternalBilling {
		billingChargeKey = imageTaskBillingChargeKeyFor(owner, taskID, "precharge")
	}
	if shouldPrechargeBilling {
		model := firstNonEmpty(util.Clean(payload["model"]), util.ImageModelAuto)
		if _, err := s.billing.ChargeUserID(billingUser, billingChargeAmount, imageTaskBillingReference(mode, taskID, model, billingChargeKey)); err != nil {
			if cleaned {
				_ = s.saveLocked()
			}
			s.mu.Unlock()
			return nil, err
		}
		billingChargedAmount = billingChargeAmount
	}
	taskCtx, cancel := context.WithCancel(context.Background())
	outputFormat := NormalizeImageOutputFormat(util.Clean(payload["output_format"]))
	task := map[string]any{"id": taskID, "owner_id": owner, "status": TaskStatusQueued, "mode": mode, "model": firstNonEmpty(util.Clean(payload["model"]), util.ImageModelAuto), "size": util.Clean(payload["size"]), "quality": util.Clean(payload["quality"]), "output_format": outputFormat, "visibility": util.Clean(payload["visibility"]), "count": count, "created_at": now, "updated_at": now}
	mergeTaskContextFields(task, payload, identity)
	if useExternalBilling {
		task[imageTaskBillingProviderKey] = AuthProviderSub2API
		task[imageTaskBillingChargedAmountKey] = billingChargeAmount
		task[imageTaskBillingChargeKey] = billingChargeKey
		task[imageTaskBillingUnitAmountKey] = billingUnitAmount
		task[imageTaskExternalChargedAmountKey] = externalBillingChargeAmount
		task[imageTaskExternalChargedUnitKey] = imageTaskExternalAmountUnitBalance
		task[imageTaskExternalModelKey] = externalBillingModel
		task[imageTaskExternalUnitAmountKey] = externalBillingUnitAmount
		ref := imageTaskBillingReference(mode, taskID, externalBillingModel, billingChargeKey)
		ref.Amount = externalBillingChargeAmount
		if err := s.externalBilling.ReserveTask(ctx, identity, task, externalBillingChargeAmount, ref); err != nil {
			if cleaned {
				_ = s.saveLocked()
			}
			s.mu.Unlock()
			cancel()
			return nil, err
		}
	}
	if billingChargedAmount > 0 {
		task[imageTaskBillingChargedAmountKey] = billingChargedAmount
		task[imageTaskBillingChargeKey] = billingChargeKey
		task[imageTaskBillingUnitAmountKey] = billingUnitAmount
	}
	if util.ToBool(payload[imageTaskBillingBillablePayloadKey]) {
		task[imageTaskBillingBillablePayloadKey] = true
	}
	if isBillableImageTaskMode(mode, payload) && billingUnitAmount > 0 {
		task[imageTaskBillingUnitAmountKey] = billingUnitAmount
	}
	if isMediaTaskMode(mode) {
		task["output_statuses"] = initialImageOutputStatuses(count)
	}
	compressionSupported := SupportsImageOutputCompression(outputFormat)
	if IsProStudioRequest(payload) {
		compressionSupported = SupportsOfficialImageOutputCompression(outputFormat)
	}
	if compressionSupported {
		if compression, ok := NormalizeImageOutputCompressionValue(payload["output_compression"]); ok {
			task["output_compression"] = compression
		}
	}
	mergePublicImageToolTaskFields(task, payload)
	s.tasks[key] = task
	s.cancels[key] = cancel
	if err := s.saveLocked(); err != nil {
		delete(s.tasks, key)
		delete(s.cancels, key)
		s.mu.Unlock()
		cancel()
		if useExternalBilling {
			ref := imageTaskBillingReference(mode, taskID, externalBillingModel, imageTaskBillingChargeKeyFor(owner, taskID, "rollback"))
			ref.RefundForKey = billingChargeKey
			ref.Amount = externalBillingChargeAmount
			_ = s.externalBilling.RefundTask(context.Background(), identity, publicTask(task), externalBillingChargeAmount, ref)
		} else if billingChargedAmount > 0 && s.billing != nil {
			ref := imageTaskBillingReference(mode, taskID, task["model"].(string), imageTaskBillingChargeKeyFor(owner, taskID, "rollback"))
			ref.RefundForKey = billingChargeKey
			_, _ = s.billing.RefundUserID(billingUser, billingChargedAmount, ref)
		}
		return nil, err
	}
	result := publicTask(task)
	s.mu.Unlock()
	go s.runTask(taskCtx, key, mode, identity, payload)
	return result, nil
}

func (s *ImageTaskService) runTask(ctx context.Context, key, mode string, identity Identity, payload map[string]any) {
	defer s.removeTaskCancel(key)
	runCtx, cancel := context.WithTimeout(ctx, s.taskTimeout())
	defer cancel()

	handler := s.generation
	if mode == "edit" {
		handler = s.edit
	} else if mode == "chat" {
		handler = s.chat
	} else if mode == "video" {
		handler = s.video
	}
	if handler == nil {
		s.updateActiveTask(key, map[string]any{"status": TaskStatusError, "error": mode + " task handler is unavailable", "data": []any{}})
		return
	}
	if isMediaTaskMode(mode) {
		if limit := s.userConcurrentLimitValue(); identity.Role == AuthRoleUser && limit > 0 {
			payload[imageOutputBatchLimitPayloadKey] = limit
		}
		payload[imageOutputCallbackPayloadKey] = func(data []map[string]any) {
			if len(data) == 0 {
				return
			}
			s.updateImageTaskPartialData(key, data)
		}
		payload[imageOutputSlotAcquirerPayloadKey] = func(ctx context.Context, index int) (func(), error) {
			release, err := s.AcquireCreationUnit(ctx, identity)
			if err != nil {
				return nil, NormalizeImageRequestError(err)
			}
			if !s.ensureTaskRunning(key) {
				release()
				return nil, context.Canceled
			}
			if !s.markImageOutputStatus(key, index, "running") {
				release()
				return nil, context.Canceled
			}
			return release, nil
		}
	} else if mode == "chat" {
		release, err := s.AcquireCreationUnit(runCtx, identity)
		if err != nil {
			err = NormalizeImageRequestError(err)
			status := TaskStatusError
			message := util.LocalizeErrorMessage(err.Error())
			if ctx.Err() != nil {
				status = TaskStatusCancelled
				message = "任务已终止"
			} else if runCtx.Err() == context.DeadlineExceeded {
				message = "图片生成超时，请稍后重试或降低分辨率"
			}
			updates := map[string]any{"status": status, "error": message, "data": []any{}}
			mergeImageTaskErrorFields(updates, err)
			s.updateActiveTask(key, updates)
			return
		}
		if !s.ensureTaskRunning(key) {
			release()
			return
		}
		defer release()
	}
	result, err := handler(runCtx, identity, payload)
	if err != nil {
		err = NormalizeImageRequestError(err)
		status := TaskStatusError
		message := util.LocalizeErrorMessage(err.Error())
		if ctx.Err() != nil {
			status = TaskStatusCancelled
			message = "任务已终止"
		} else if runCtx.Err() == context.DeadlineExceeded {
			message = taskTimeoutMessage(mode)
		}
		data := taskResultData(result)
		outputType := util.Clean(result["output_type"])
		if outputType == "text" && len(data) == 0 && ctx.Err() == nil && runCtx.Err() != context.DeadlineExceeded {
			if text := util.Clean(result["message"]); text != "" {
				data = []map[string]any{{"text_response": text}}
				status = TaskStatusSuccess
				message = ""
			}
		}
		updates := map[string]any{"status": status, "error": message, "data": data}
		if outputType != "" {
			updates["output_type"] = outputType
		}
		if model := util.Clean(result["model"]); model != "" {
			updates["model"] = model
		}
		if externalConsumed := imageTaskFloat(result[imageTaskExternalConsumedAmountKey]); externalConsumed > 0 {
			updates[imageTaskExternalConsumedAmountKey] = externalConsumed
		}
		if unit := imageTaskNormalizeAmountUnit(util.Clean(result[imageTaskExternalAmountUnitKey])); unit != "" {
			updates[imageTaskExternalAmountUnitKey] = unit
		}
		if usage := imageTaskUsage(result["usage"]); len(usage) > 0 {
			updates["usage"] = usage
		}
		if isMediaTaskMode(mode) {
			updates["output_statuses"] = finalImageOutputStatuses(taskCount(mode, payload), data, status)
		}
		mergeImageTaskErrorFields(updates, err)
		s.updateActiveTask(key, updates)
		s.settleTaskBilling(key)
		return
	}
	data := util.AsMapSlice(result["data"])
	outputType := util.Clean(result["output_type"])
	if outputType == "text" && len(data) == 0 {
		if text := util.Clean(result["message"]); text != "" {
			data = []map[string]any{{"text_response": text}}
		}
	}
	if len(data) == 0 {
		message := util.LocalizeErrorMessage(firstNonEmpty(util.Clean(result["message"]), "task returned no output data"))
		updates := map[string]any{"status": TaskStatusError, "error": message, "data": []any{}}
		if outputType != "" {
			updates["output_type"] = outputType
		}
		if isMediaTaskMode(mode) {
			updates["output_statuses"] = finalImageOutputStatuses(taskCount(mode, payload), nil, TaskStatusError)
		}
		s.updateActiveTask(key, updates)
		s.settleTaskBilling(key)
		return
	}
	updates := map[string]any{"status": TaskStatusSuccess, "data": data, "error": ""}
	if isMediaTaskMode(mode) {
		updates["output_statuses"] = finalImageOutputStatuses(taskCount(mode, payload), data, TaskStatusSuccess)
	}
	if outputType != "" {
		updates["output_type"] = outputType
	}
	if model := util.Clean(result["model"]); model != "" {
		updates["model"] = model
	}
	if externalConsumed := imageTaskFloat(result[imageTaskExternalConsumedAmountKey]); externalConsumed > 0 {
		updates[imageTaskExternalConsumedAmountKey] = externalConsumed
	}
	if unit := imageTaskNormalizeAmountUnit(util.Clean(result[imageTaskExternalAmountUnitKey])); unit != "" {
		updates[imageTaskExternalAmountUnitKey] = unit
	}
	if usage := imageTaskUsage(result["usage"]); len(usage) > 0 {
		updates["usage"] = usage
	}
	s.updateActiveTask(key, updates)
	s.settleTaskBilling(key)
}

func finalImageOutputStatuses(count int, data []map[string]any, status string) []string {
	statuses := initialImageOutputStatuses(count)
	if len(statuses) == 0 {
		return statuses
	}
	fallback := status
	if fallback != TaskStatusCancelled {
		fallback = TaskStatusError
	}
	for index := range statuses {
		statuses[index] = fallback
	}
	for index, item := range data {
		if index >= len(statuses) {
			break
		}
		if hasImageTaskOutputData(item) {
			statuses[index] = TaskStatusSuccess
		}
	}
	return statuses
}

func (s *ImageTaskService) taskTimeout() time.Duration {
	if s.taskTimeoutGetter == nil {
		return defaultImageTaskTimeout
	}
	timeout := s.taskTimeoutGetter()
	if timeout <= 0 {
		return defaultImageTaskTimeout
	}
	return timeout
}

func (s *ImageTaskService) checkUserTaskLimitsLocked(identity Identity, owner string, _ int, now time.Time) error {
	if identity.Role != AuthRoleUser {
		return nil
	}
	if limit := s.userRPMLimitValue(); limit > 0 {
		cutoff := now.Add(-time.Minute)
		times := s.ownerSubmitTimes[owner]
		kept := times[:0]
		for _, item := range times {
			if item.After(cutoff) {
				kept = append(kept, item)
			}
		}
		if len(kept) >= limit {
			s.ownerSubmitTimes[owner] = kept
			return ImageTaskLimitError{Message: fmt.Sprintf("用户 RPM 速率限制已达到（每分钟最多 %d 次）", limit)}
		}
		s.ownerSubmitTimes[owner] = append(kept, now)
	}
	return nil
}

func (s *ImageTaskService) checkTeamDailyLimitLocked(payload map[string]any, pendingAmount int, now time.Time) error {
	if s.teamDailyLimitGetter == nil || pendingAmount <= 0 {
		return nil
	}
	teamID := util.Clean(payload[imageTaskTeamIDPayloadKey])
	actorUserID := util.Clean(payload[imageTaskActorUserIDPayloadKey])
	if teamID == "" || actorUserID == "" {
		return nil
	}
	limit := s.teamDailyLimitGetter(teamID, actorUserID)
	if limit <= 0 {
		return nil
	}
	used := s.teamActorDailyUsageAmountLocked(teamID, actorUserID, now)
	if used+pendingAmount > limit {
		return ImageTaskLimitError{Message: fmt.Sprintf("团队成员今日额度不足（今日限额 %s，已用 %s，本次预计 %s）", formatMilliCNY(limit), formatMilliCNY(used), formatMilliCNY(pendingAmount))}
	}
	return nil
}

func (s *ImageTaskService) teamActorDailyUsageAmountLocked(teamID, actorUserID string, now time.Time) int {
	start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	end := start.Add(24 * time.Hour)
	total := 0
	for _, task := range s.tasks {
		if util.Clean(task[imageTaskTeamIDPayloadKey]) != teamID || util.Clean(task[imageTaskActorUserIDPayloadKey]) != actorUserID {
			continue
		}
		createdAt := parseTaskTime(task["created_at"])
		if createdAt.IsZero() || createdAt.Before(start) || !createdAt.Before(end) {
			continue
		}
		amount := util.ToInt(task["billing_consumed_amount"], -1)
		if amount < 0 {
			amount = util.ToInt(task[imageTaskBillingChargedAmountKey], 0)
		}
		if amount > 0 {
			total += amount
		}
	}
	return total
}

func (s *ImageTaskService) userConcurrentLimitValue() int {
	if s.userConcurrentLimit == nil {
		return 0
	}
	limit := s.userConcurrentLimit()
	if limit < 1 {
		return 0
	}
	return limit
}

func ImageOutputBatchLimit(payload map[string]any) int {
	if payload == nil {
		return 0
	}
	return util.ToInt(payload[imageOutputBatchLimitPayloadKey], 0)
}

func (s *ImageTaskService) AcquireCreationUnit(ctx context.Context, identity Identity) (func(), error) {
	if identity.Role != AuthRoleUser {
		return noopCreationUnitRelease, nil
	}
	owner := ownerID(identity)
	s.mu.Lock()
	defer s.mu.Unlock()
	for {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		limit := s.userConcurrentLimitValue()
		if limit <= 0 || s.ownerRunningUnits[owner] < limit {
			s.ownerRunningUnits[owner]++
			released := false
			return func() {
				s.mu.Lock()
				defer s.mu.Unlock()
				if released {
					return
				}
				released = true
				if s.ownerRunningUnits[owner] <= 1 {
					delete(s.ownerRunningUnits, owner)
				} else {
					s.ownerRunningUnits[owner]--
				}
				s.creationUnitCond.Broadcast()
			}, nil
		}
		timer := time.AfterFunc(100*time.Millisecond, func() {
			s.mu.Lock()
			s.creationUnitCond.Broadcast()
			s.mu.Unlock()
		})
		s.creationUnitCond.Wait()
		timer.Stop()
	}
}

func noopCreationUnitRelease() {}

func (s *ImageTaskService) ensureTaskRunning(key string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	task := s.tasks[key]
	if task == nil {
		return false
	}
	status := util.Clean(task["status"])
	if status == TaskStatusRunning {
		return true
	}
	if status != TaskStatusQueued {
		return false
	}
	task["status"] = TaskStatusRunning
	task["error"] = ""
	task["updated_at"] = util.NowLocal()
	_ = s.saveLocked()
	return true
}

func (s *ImageTaskService) markImageOutputStatus(key string, index int, status string) bool {
	if index < 1 {
		return false
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	task := s.tasks[key]
	if task == nil || !isActiveTaskStatus(util.Clean(task["status"])) {
		return false
	}
	count := storedImageOutputCount(task)
	if index > count {
		return false
	}
	statuses := normalizedImageOutputStatuses(util.Clean(task["mode"]), count, task["output_statuses"])
	if len(statuses) == 0 {
		return true
	}
	if statuses[index-1] == "success" {
		return true
	}
	statuses[index-1] = status
	task["output_statuses"] = statuses
	task["updated_at"] = util.NowLocal()
	_ = s.saveLocked()
	return true
}

func (s *ImageTaskService) userRPMLimitValue() int {
	if s.userRPMLimit == nil {
		return 0
	}
	limit := s.userRPMLimit()
	if limit < 1 {
		return 0
	}
	return limit
}

func (s *ImageTaskService) updateActiveTask(key string, updates map[string]any) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	task := s.tasks[key]
	if task == nil {
		return false
	}
	if !isActiveTaskStatus(util.Clean(task["status"])) {
		return false
	}
	for k, v := range updates {
		task[k] = v
	}
	task["updated_at"] = util.NowLocal()
	_ = s.saveLocked()
	return true
}

func (s *ImageTaskService) updateImageTaskPartialData(key string, data []map[string]any) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	task := s.tasks[key]
	if task == nil || !isActiveTaskStatus(util.Clean(task["status"])) {
		return false
	}
	count := storedImageOutputCount(task)
	statuses := normalizedImageOutputStatuses(util.Clean(task["mode"]), count, task["output_statuses"])
	for index, item := range data {
		if index >= len(statuses) {
			break
		}
		if hasImageTaskOutputData(item) {
			statuses[index] = "success"
		}
	}
	task["data"] = cloneTaskData(data)
	if len(statuses) > 0 {
		task["output_statuses"] = statuses
	}
	task["updated_at"] = util.NowLocal()
	_ = s.saveLocked()
	return true
}

type imageTaskBillingSettlement struct {
	owner                   string
	taskID                  string
	mode                    string
	model                   string
	provider                string
	chargeKey               string
	refundKey               string
	charged                 int
	consumed                int
	refundAmount            int
	externalCharged         float64
	externalConsumed        float64
	externalRefundAmount    float64
	externalRefundUnit      string
	externalSurchargeAmount float64
	externalSurchargeUnit   string
	externalModel           string
	externalChargeUnit      string
	task                    map[string]any
}

func (s *ImageTaskService) settleTaskBilling(key string) {
	settlement, ok := s.pendingTaskBillingSettlement(key)
	if !ok {
		return
	}
	if settlement.refundAmount > 0 || settlement.externalRefundAmount > 0 {
		ref := BillingReference{
			Endpoint:     creationTaskBillingEndpoint(settlement.mode),
			Model:        settlement.externalModel,
			TaskID:       settlement.taskID,
			ChargeKey:    settlement.refundKey,
			RefundForKey: settlement.chargeKey,
			AmountUnit:   settlement.externalRefundUnit,
		}
		if settlement.provider == AuthProviderSub2API {
			if s.externalBilling == nil {
				return
			}
			ref.Amount = settlement.externalRefundAmount
			if err := s.externalBilling.RefundTask(context.Background(), Identity{Role: AuthRoleUser, Provider: AuthProviderSub2API, OwnerID: settlement.owner}, settlement.task, settlement.externalRefundAmount, ref); err != nil {
				return
			}
		} else {
			if s.billing == nil {
				return
			}
			if _, err := s.billing.RefundUserID(settlement.owner, settlement.refundAmount, ref); err != nil {
				return
			}
		}
	}
	if settlement.provider == AuthProviderSub2API && settlement.consumed > 0 {
		if s.externalBilling == nil {
			return
		}
		commitAmount := settlement.externalConsumed
		if settlement.externalCharged > 0 {
			commitAmount = settlement.externalCharged
		}
		ref := BillingReference{
			Endpoint:   creationTaskBillingEndpoint(settlement.mode),
			Model:      settlement.externalModel,
			TaskID:     settlement.taskID,
			ChargeKey:  settlement.chargeKey,
			Amount:     commitAmount,
			AmountUnit: settlement.externalChargeUnit,
		}
		if err := s.externalBilling.CommitTask(context.Background(), Identity{Role: AuthRoleUser, Provider: AuthProviderSub2API, OwnerID: settlement.owner}, settlement.task, commitAmount, ref); err != nil {
			return
		}
		if settlement.externalSurchargeAmount > 0 {
			surchargeKey := imageTaskBillingChargeKeyFor(settlement.owner, settlement.taskID, "surcharge")
			surchargeTask := util.CopyMap(settlement.task)
			surchargeTask["id"] = settlement.taskID + ":surcharge"
			surchargeRef := BillingReference{
				Endpoint:   creationTaskBillingEndpoint(settlement.mode),
				Model:      settlement.externalModel,
				TaskID:     settlement.taskID + ":surcharge",
				ChargeKey:  surchargeKey,
				Amount:     settlement.externalSurchargeAmount,
				AmountUnit: settlement.externalSurchargeUnit,
			}
			if err := s.externalBilling.ReserveTask(context.Background(), Identity{Role: AuthRoleUser, Provider: AuthProviderSub2API, OwnerID: settlement.owner}, surchargeTask, settlement.externalSurchargeAmount, surchargeRef); err != nil {
				return
			}
			if err := s.externalBilling.CommitTask(context.Background(), Identity{Role: AuthRoleUser, Provider: AuthProviderSub2API, OwnerID: settlement.owner}, surchargeTask, settlement.externalSurchargeAmount, surchargeRef); err != nil {
				return
			}
		}
	}
	s.finishTaskBillingSettlement(key, settlement.consumed)
}

func (s *ImageTaskService) pendingTaskBillingSettlement(key string) (imageTaskBillingSettlement, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	task := s.tasks[key]
	if task == nil || !isBillableImageTaskMode(util.Clean(task["mode"]), task) || util.ToInt(task["billing_consumed_amount"], -1) >= 0 {
		return imageTaskBillingSettlement{}, false
	}
	mode := util.Clean(task["mode"])
	charged := util.ToInt(task[imageTaskBillingChargedAmountKey], 0)
	externalCharged := imageTaskFloat(task[imageTaskExternalChargedAmountKey])
	externalChargeUnit := imageTaskStoredExternalChargeUnit(task)
	provider := util.Clean(task[imageTaskBillingProviderKey])
	if provider == AuthProviderSub2API && externalCharged <= 0 {
		if charged <= 0 {
			charged = imageTaskEstimatedChargedAmount(task)
		}
		// Older queued tasks may only have the local precharge amount. Treat it as
		// the already-reserved Sub2API balance so APIMart cost overrides settle by delta.
		if charged > 0 {
			externalCharged = float64(charged) / 1000
			externalChargeUnit = imageTaskExternalAmountUnitBalance
		}
	}
	consumed := 0
	if task["status"] == TaskStatusSuccess {
		consumed = billableTaskOutputCount(task)
	}
	if charged > 0 && consumed > charged {
		consumed = charged
	}
	if unitAmount := util.ToInt(task[imageTaskBillingUnitAmountKey], 0); unitAmount > 0 {
		consumed *= unitAmount
		if charged > 0 && consumed > charged {
			consumed = charged
		}
	}
	externalConsumed := 0.0
	if task["status"] == TaskStatusSuccess {
		externalConsumed = imageTaskFloat(task[imageTaskExternalConsumedAmountKey])
		if externalConsumed <= 0 {
			externalConsumed = float64(billableTaskOutputCount(task)) * imageTaskFloat(task[imageTaskExternalUnitAmountKey])
		}
		if externalConsumed <= 0 {
			externalConsumed = float64(consumed) / 1000
		}
	}
	externalConsumedUnit := imageTaskNormalizeAmountUnit(util.Clean(task[imageTaskExternalAmountUnitKey]))
	externalChargedBalance := imageTaskExternalBalanceAmount(externalCharged, externalChargeUnit)
	externalConsumedBalance := imageTaskExternalBalanceAmount(externalConsumed, externalConsumedUnit)
	externalRefundBalance := maxImageTaskFloat(0, externalChargedBalance-externalConsumedBalance)
	externalSurchargeBalance := maxImageTaskFloat(0, externalConsumedBalance-externalChargedBalance)
	owner := util.Clean(task["owner_id"])
	taskID := util.Clean(task["id"])
	model := firstNonEmpty(util.Clean(task["model"]), util.ImageModelAuto)
	externalModel := firstNonEmpty(util.Clean(task[imageTaskExternalModelKey]), model)
	chargeKey := util.Clean(task[imageTaskBillingChargeKey])
	if chargeKey == "" && charged > 0 {
		chargeKey = imageTaskBillingChargeKeyFor(owner, taskID, "precharge")
	}
	return imageTaskBillingSettlement{
		owner:                   owner,
		taskID:                  taskID,
		mode:                    mode,
		model:                   model,
		provider:                provider,
		chargeKey:               chargeKey,
		refundKey:               imageTaskBillingChargeKeyFor(owner, taskID, "refund"),
		charged:                 charged,
		consumed:                consumed,
		refundAmount:            max(0, charged-consumed),
		externalCharged:         externalCharged,
		externalConsumed:        externalConsumed,
		externalRefundAmount:    imageTaskExternalRawAmount(externalRefundBalance, externalChargeUnit),
		externalRefundUnit:      imageTaskNormalizeAmountUnit(externalChargeUnit),
		externalSurchargeAmount: imageTaskExternalRawAmount(externalSurchargeBalance, externalConsumedUnit),
		externalSurchargeUnit:   imageTaskNormalizeAmountUnit(externalConsumedUnit),
		externalModel:           externalModel,
		externalChargeUnit:      imageTaskNormalizeAmountUnit(externalChargeUnit),
		task:                    publicTask(task),
	}, true
}

func (s *ImageTaskService) finishTaskBillingSettlement(key string, consumed int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	task := s.tasks[key]
	if task == nil || util.ToInt(task["billing_consumed_amount"], -1) >= 0 {
		return
	}
	if externalConsumed := imageTaskFloat(task[imageTaskExternalConsumedAmountKey]); externalConsumed > 0 {
		unit := imageTaskNormalizeAmountUnit(util.Clean(task[imageTaskExternalAmountUnitKey]))
		if amount := imageTaskCostToBillingAmount(externalConsumed, unit); amount > 0 {
			consumed = amount
		}
	}
	delete(task, imageTaskBillingChargedAmountKey)
	delete(task, imageTaskBillingChargeKey)
	delete(task, imageTaskBillingUnitAmountKey)
	delete(task, imageTaskExternalChargedAmountKey)
	delete(task, imageTaskExternalChargedUnitKey)
	delete(task, imageTaskExternalConsumedAmountKey)
	delete(task, imageTaskExternalAmountUnitKey)
	delete(task, imageTaskExternalUnitAmountKey)
	task["billing_consumed_amount"] = max(0, consumed)
	task["updated_at"] = util.NowLocal()
	_ = s.saveLocked()
}

func (s *ImageTaskService) removeTaskCancel(key string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.cancels, key)
}

func (s *ImageTaskService) loadLocked() map[string]map[string]any {
	raw := loadStoredJSON(s.store, s.docName)
	if obj, ok := raw.(map[string]any); ok {
		raw = obj["tasks"]
	}
	tasks := map[string]map[string]any{}
	for _, item := range anyList(raw) {
		task, ok := item.(map[string]any)
		if !ok {
			continue
		}
		id := util.Clean(task["id"])
		owner := util.Clean(task["owner_id"])
		if id == "" || owner == "" {
			continue
		}
		status := util.Clean(task["status"])
		if status != TaskStatusQueued && status != TaskStatusRunning && status != TaskStatusSuccess && status != TaskStatusError && status != TaskStatusCancelled {
			status = TaskStatusError
		}
		mode := "generate"
		if task["mode"] == "edit" {
			mode = "edit"
		} else if task["mode"] == "chat" {
			mode = "chat"
		} else if task["mode"] == "video" {
			mode = "video"
		}
		count := storedImageOutputCount(task)
		visibility, _ := NormalizeImageVisibility(util.Clean(task["visibility"]))
		outputFormat := NormalizeImageOutputFormat(util.Clean(task["output_format"]))
		normalized := map[string]any{"id": id, "owner_id": owner, "status": status, "mode": mode, "model": firstNonEmpty(util.Clean(task["model"]), util.ImageModelAuto), "size": util.Clean(task["size"]), "quality": util.Clean(task["quality"]), "output_format": outputFormat, "visibility": visibility, "count": count, "created_at": firstNonEmpty(util.Clean(task["created_at"]), util.NowLocal()), "updated_at": firstNonEmpty(util.Clean(task["updated_at"]), util.Clean(task["created_at"]), util.NowLocal())}
		if SupportsImageOutputCompression(outputFormat) {
			if compression, ok := NormalizeImageOutputCompressionValue(task["output_compression"]); ok {
				normalized["output_compression"] = compression
			}
		}
		if data := util.AsMapSlice(task["data"]); data != nil {
			normalized["data"] = data
		}
		if statuses := normalizedImageOutputStatuses(mode, count, task["output_statuses"]); len(statuses) > 0 {
			normalized["output_statuses"] = statuses
		}
		if !isActiveTaskStatus(status) {
			applyTerminalImageOutputStatuses(normalized, status)
		}
		if errText := util.Clean(task["error"]); errText != "" {
			normalized["error"] = errText
		}
		if outputType := util.Clean(task["output_type"]); outputType != "" {
			normalized["output_type"] = outputType
		}
		if usage := imageTaskUsage(task["usage"]); len(usage) > 0 {
			normalized["usage"] = usage
		}
		if util.ToBool(task[imageTaskBillingBillablePayloadKey]) {
			normalized[imageTaskBillingBillablePayloadKey] = true
		}
		if charged := util.ToInt(task[imageTaskBillingChargedAmountKey], 0); charged > 0 {
			normalized[imageTaskBillingChargedAmountKey] = charged
		}
		if chargeKey := util.Clean(task[imageTaskBillingChargeKey]); chargeKey != "" {
			normalized[imageTaskBillingChargeKey] = chargeKey
		}
		if unitAmount := util.ToInt(task[imageTaskBillingUnitAmountKey], 0); unitAmount > 0 {
			normalized[imageTaskBillingUnitAmountKey] = unitAmount
		}
		if externalCharged := imageTaskFloat(task[imageTaskExternalChargedAmountKey]); externalCharged > 0 {
			normalized[imageTaskExternalChargedAmountKey] = externalCharged
		}
		if unit := imageTaskNormalizeStoredAmountUnit(util.Clean(task[imageTaskExternalChargedUnitKey])); unit != "" {
			normalized[imageTaskExternalChargedUnitKey] = unit
		}
		if externalUnitAmount := imageTaskFloat(task[imageTaskExternalUnitAmountKey]); externalUnitAmount > 0 {
			normalized[imageTaskExternalUnitAmountKey] = externalUnitAmount
		}
		if externalModel := util.Clean(task[imageTaskExternalModelKey]); externalModel != "" {
			normalized[imageTaskExternalModelKey] = externalModel
		}
		if externalConsumed := imageTaskFloat(task[imageTaskExternalConsumedAmountKey]); externalConsumed > 0 {
			normalized[imageTaskExternalConsumedAmountKey] = externalConsumed
		}
		if unit := imageTaskNormalizeAmountUnit(util.Clean(task[imageTaskExternalAmountUnitKey])); unit != "" {
			normalized[imageTaskExternalAmountUnitKey] = unit
		}
		if provider := util.Clean(task[imageTaskBillingProviderKey]); provider != "" {
			normalized[imageTaskBillingProviderKey] = provider
		}
		copyStoredTaskContextFields(normalized, task)
		if consumed := util.ToInt(task["billing_consumed_amount"], -1); consumed >= 0 {
			normalized["billing_consumed_amount"] = consumed
		}
		tasks[taskKey(owner, id)] = normalized
	}
	return tasks
}

func (s *ImageTaskService) saveLocked() error {
	items := make([]map[string]any, 0, len(s.tasks))
	for _, task := range s.tasks {
		items = append(items, task)
	}
	sort.Slice(items, func(i, j int) bool { return util.Clean(items[i]["updated_at"]) > util.Clean(items[j]["updated_at"]) })
	value := map[string]any{"tasks": items}
	if s.store != nil {
		return s.store.SaveJSONDocument(s.docName, value)
	}
	return fmt.Errorf("storage document backend is required")
}

func (s *ImageTaskService) recoverUnfinishedLocked() bool {
	changed := false
	for _, task := range s.tasks {
		if task["status"] == TaskStatusQueued || task["status"] == TaskStatusRunning {
			task["status"] = TaskStatusError
			task["error"] = "服务已重启，未完成的任务已中断"
			applyTerminalImageOutputStatuses(task, TaskStatusError)
			task["updated_at"] = util.NowLocal()
			changed = true
		}
	}
	return changed
}

func (s *ImageTaskService) diagnosticsSummaryLocked(staleThreshold time.Duration, now time.Time) ImageTaskDiagnosticsSummary {
	staleThreshold = NormalizeImageTaskStaleThreshold(staleThreshold)
	summary := ImageTaskDiagnosticsSummary{
		TotalTasks:            len(s.tasks),
		RunningOwners:         len(s.ownerRunningUnits),
		StaleThresholdSeconds: int64(staleThreshold / time.Second),
	}
	for _, units := range s.ownerRunningUnits {
		summary.RunningUnits += units
	}
	for _, task := range s.tasks {
		status := util.Clean(task["status"])
		dirtyTerminal := false
		stale := false
		switch status {
		case TaskStatusQueued:
			summary.ActiveTasks++
			summary.QueuedTasks++
			stale = staleActiveImageTask(task, staleThreshold, now)
		case TaskStatusRunning:
			summary.ActiveTasks++
			summary.RunningTasks++
			stale = staleActiveImageTask(task, staleThreshold, now)
		case TaskStatusSuccess, TaskStatusError, TaskStatusCancelled:
			summary.TerminalTasks++
			if terminalTaskOutputStatusesDirty(task) {
				dirtyTerminal = true
				summary.DirtyTerminalTasks++
				for _, outputStatus := range util.AsStringSlice(task["output_statuses"]) {
					if isActiveTaskStatus(outputStatus) {
						summary.DirtyTerminalOutputStatuses++
					}
				}
			}
		}
		for _, outputStatus := range util.AsStringSlice(task["output_statuses"]) {
			if isActiveTaskStatus(outputStatus) {
				summary.ActiveOutputStatuses++
			}
		}
		if stale {
			summary.StaleActiveTasks++
		}
		if stale || dirtyTerminal {
			summary.SuspiciousTasks = append(summary.SuspiciousTasks, imageTaskDiagnosticsItem(task, stale, dirtyTerminal, now))
		}
	}
	sort.SliceStable(summary.SuspiciousTasks, func(i, j int) bool {
		left := summary.SuspiciousTasks[i]
		right := summary.SuspiciousTasks[j]
		if left.Stale != right.Stale {
			return left.Stale
		}
		if left.DirtyTerminal != right.DirtyTerminal {
			return left.DirtyTerminal
		}
		if left.AgeSeconds != right.AgeSeconds {
			return left.AgeSeconds > right.AgeSeconds
		}
		return left.ID < right.ID
	})
	if len(summary.SuspiciousTasks) > maxImageTaskDiagnosticsItems {
		summary.SuspiciousTasks = summary.SuspiciousTasks[:maxImageTaskDiagnosticsItems]
	}
	return summary
}

func imageTaskDiagnosticsItem(task map[string]any, stale, dirtyTerminal bool, now time.Time) ImageTaskDiagnosticsItem {
	updatedAt := util.Clean(task["updated_at"])
	ageSeconds := int64(0)
	if updated := parseTaskTime(updatedAt); !updated.IsZero() {
		ageSeconds = int64(now.Sub(updated).Seconds())
		if ageSeconds < 0 {
			ageSeconds = 0
		}
	}
	return ImageTaskDiagnosticsItem{
		ID:             util.Clean(task["id"]),
		OwnerID:        util.Clean(task["owner_id"]),
		Status:         util.Clean(task["status"]),
		Mode:           util.Clean(task["mode"]),
		UpdatedAt:      updatedAt,
		Error:          util.Clean(task["error"]),
		OutputStatuses: util.AsStringSlice(task["output_statuses"]),
		AgeSeconds:     ageSeconds,
		Stale:          stale,
		DirtyTerminal:  dirtyTerminal,
	}
}

func staleActiveImageTask(task map[string]any, staleThreshold time.Duration, now time.Time) bool {
	if !isActiveTaskStatus(util.Clean(task["status"])) {
		return false
	}
	updatedAt := parseTaskTime(task["updated_at"])
	if updatedAt.IsZero() {
		return true
	}
	return now.Sub(updatedAt) >= NormalizeImageTaskStaleThreshold(staleThreshold)
}

func terminalTaskOutputStatusesDirty(task map[string]any) bool {
	status := util.Clean(task["status"])
	if isActiveTaskStatus(status) {
		return false
	}
	switch status {
	case TaskStatusSuccess, TaskStatusError, TaskStatusCancelled:
	default:
		return false
	}
	for _, outputStatus := range util.AsStringSlice(task["output_statuses"]) {
		if isActiveTaskStatus(outputStatus) {
			return true
		}
	}
	return false
}

func (s *ImageTaskService) cleanupLocked() bool {
	days := 30
	if s.retentionGetter != nil {
		days = s.retentionGetter()
	}
	if days < 1 {
		days = 1
	}
	cutoff := time.Now().Add(-time.Duration(days) * 24 * time.Hour)
	removed := false
	for key, task := range s.tasks {
		status := task["status"]
		if status != TaskStatusSuccess && status != TaskStatusError && status != TaskStatusCancelled {
			continue
		}
		if parseTaskTime(task["updated_at"]).Before(cutoff) {
			delete(s.tasks, key)
			removed = true
		}
	}
	return removed
}

func publicTask(task map[string]any) map[string]any {
	item := map[string]any{"id": task["id"], "status": task["status"], "mode": task["mode"], "model": task["model"], "size": task["size"], "created_at": task["created_at"], "updated_at": task["updated_at"]}
	if seconds := taskDurationSeconds(task); seconds >= 0 {
		item["duration_seconds"] = seconds
	}
	if quality := util.Clean(task["quality"]); quality != "" {
		item["quality"] = quality
	}
	if format := NormalizeImageOutputFormat(util.Clean(task["output_format"])); format != "" {
		item["output_format"] = format
	}
	compressionSupported := SupportsImageOutputCompression(util.Clean(item["output_format"]))
	if IsProStudioRequest(task) {
		compressionSupported = SupportsOfficialImageOutputCompression(util.Clean(item["output_format"]))
	}
	if compressionSupported {
		if compression, ok := NormalizeImageOutputCompressionValue(task["output_compression"]); ok {
			item["output_compression"] = compression
		}
	}
	mergePublicImageToolTaskFields(item, task)
	if statuses := util.AsStringSlice(task["output_statuses"]); len(statuses) > 0 {
		item["output_statuses"] = append([]string(nil), statuses...)
	}
	if task["data"] != nil {
		item["data"] = task["data"]
	}
	if util.Clean(task["error"]) != "" {
		item["error"] = task["error"]
	}
	copyImageTaskErrorFields(item, task)
	if util.Clean(task["output_type"]) != "" {
		item["output_type"] = task["output_type"]
	}
	if usage := imageTaskUsage(task["usage"]); len(usage) > 0 {
		item["usage"] = usage
	}
	if consumed := util.ToInt(task["billing_consumed_amount"], -1); consumed >= 0 {
		item["billing_consumed_amount"] = consumed
	} else if charged := util.ToInt(task[imageTaskBillingChargedAmountKey], 0); charged > 0 {
		item[imageTaskBillingChargedAmountKey] = charged
	}
	copyStoredTaskContextFields(item, task)
	if unitAmount := util.ToInt(task[imageTaskBillingUnitAmountKey], 0); unitAmount > 0 {
		item[imageTaskBillingUnitAmountKey] = unitAmount
	}
	if visibility := util.Clean(task["visibility"]); visibility != "" {
		item["visibility"] = visibility
	}
	return item
}

func taskDurationSeconds(task map[string]any) int64 {
	if util.Clean(task["created_at"]) == "" {
		return -1
	}
	createdAt := parseTaskTime(task["created_at"])
	if createdAt.IsZero() || createdAt.Equal(time.Unix(0, 0)) {
		return -1
	}
	endAt := parseTaskTime(task["updated_at"])
	if isActiveTaskStatus(util.Clean(task["status"])) {
		endAt = time.Now()
	}
	if util.Clean(task["updated_at"]) == "" || endAt.IsZero() || endAt.Equal(time.Unix(0, 0)) || endAt.Before(createdAt) {
		return 0
	}
	return int64(endAt.Sub(createdAt) / time.Second)
}

func mergeTaskContextFields(task map[string]any, payload map[string]any, identity Identity) {
	if task == nil {
		return
	}
	actor := firstNonEmpty(util.Clean(payload[imageTaskActorUserIDPayloadKey]), billingUserID(identity))
	payer := firstNonEmpty(util.Clean(payload[imageTaskPayerUserIDPayloadKey]), actor)
	ownerName := firstNonEmpty(util.Clean(payload[imageTaskOwnerNamePayloadKey]), imageTaskIdentityDisplayName(identity))
	if teamID := util.Clean(payload[imageTaskTeamIDPayloadKey]); teamID != "" {
		task[imageTaskTeamIDPayloadKey] = teamID
	}
	if ownerName != "" {
		task[imageTaskOwnerNamePayloadKey] = ownerName
	}
	if payer != "" {
		task[imageTaskPayerUserIDPayloadKey] = payer
	}
	if actor != "" {
		task[imageTaskActorUserIDPayloadKey] = actor
	}
	if actorName := util.Clean(payload[imageTaskActorNamePayloadKey]); actorName != "" {
		task[imageTaskActorNamePayloadKey] = actorName
	}
}

func copyStoredTaskContextFields(target map[string]any, source map[string]any) {
	for _, key := range []string{imageTaskTeamIDPayloadKey, imageTaskPayerUserIDPayloadKey, imageTaskActorUserIDPayloadKey, imageTaskActorNamePayloadKey, imageTaskOwnerNamePayloadKey} {
		if value := util.Clean(source[key]); value != "" {
			target[key] = value
		}
	}
}

func imageTaskIdentityDisplayName(identity Identity) string {
	return firstNonEmpty(util.Clean(identity.Name), util.Clean(identity.CredentialName), util.Clean(identity.OwnerID), util.Clean(identity.ID))
}

func imageTaskVisibility(values ...string) (string, error) {
	if len(values) == 0 {
		return ImageVisibilityPrivate, nil
	}
	return NormalizePrivateImageVisibility(values[0])
}

func ownerID(identity Identity) string {
	if owner := util.Clean(identity.OwnerID); owner != "" {
		return owner
	}
	if id := util.Clean(identity.ID); id != "" {
		return id
	}
	return "anonymous"
}

func taskKey(owner, id string) string {
	return owner + ":" + id
}

func normalizedImageTaskCount(n int) int {
	if n < 1 {
		return 1
	}
	if n > maxImageTaskCount {
		return maxImageTaskCount
	}
	return n
}

func imageTaskCount(payload map[string]any) int {
	if payload["n"] == nil {
		return normalizedImageTaskCount(util.ToInt(payload["count"], 1))
	}
	return normalizedImageTaskCount(util.ToInt(payload["n"], 1))
}

func taskCount(mode string, payload map[string]any) int {
	return imageTaskCount(payload)
}

func isMediaTaskMode(mode string) bool {
	return mode == "generate" || mode == "edit" || mode == "video"
}

func normalizeImageTaskSize(size string) string {
	switch strings.ToLower(strings.TrimSpace(size)) {
	case "8:8":
		return "8x8"
	case "16:16":
		return "16x16"
	case "32:32":
		return "32x32"
	case "64:64":
		return "64x64"
	case "128:128":
		return "128x128"
	default:
		return strings.TrimSpace(size)
	}
}

func taskTimeoutMessage(mode string) string {
	if mode == "video" {
		return "视频生成超时，请稍后重试或降低分辨率"
	}
	return "图片生成超时，请稍后重试或降低分辨率"
}

func imageTaskBillingUnitAmount(payload map[string]any) int {
	model := firstNonEmpty(util.Clean(payload["model"]), util.ImageModelAuto)
	size := ""
	switch NormalizeImageResolutionPreset(util.Clean(payload["image_resolution"])) {
	case "2k":
		size = "2K"
	case "4k":
		size = "4K"
	}
	if size == "" {
		size = util.Clean(payload["requested_size"])
	}
	if size == "" {
		size = util.Clean(payload["size"])
	}
	return EstimateImageBillingUnitAmount(model, size, util.Clean(payload["quality"]))
}

func imageTaskExternalBillingModel(mode string, payload map[string]any) string {
	model := firstNonEmpty(util.Clean(payload["model"]), util.ImageModelAuto)
	if (mode == "generate" || mode == "edit") && (model == util.ImageModelAuto || model == util.ImageModelCodex) {
		return util.ImageModelGPT
	}
	return model
}

func imageTaskExternalBillingUnitAmount(mode string, payload map[string]any) float64 {
	return float64(imageTaskBillingUnitAmount(payload)) / 1000
}

func imageTaskEstimatedChargedAmount(task map[string]any) int {
	if task == nil || util.Clean(task[imageTaskBillingChargeKey]) == "" {
		return 0
	}
	count := storedImageOutputCount(task)
	if count <= 0 {
		count = billableTaskOutputCount(task)
	}
	unitAmount := util.ToInt(task[imageTaskBillingUnitAmountKey], 0)
	if unitAmount <= 0 {
		unitAmount = imageTaskBillingUnitAmount(task)
	}
	if count <= 0 || unitAmount <= 0 {
		return 0
	}
	return count * unitAmount
}

func imageTaskCostToBillingAmount(cost float64, unit string) int {
	if cost <= 0 {
		return 0
	}
	if imageTaskNormalizeAmountUnit(unit) == imageTaskAmountUnitAPIMartCost {
		return int(math.Ceil(cost * imagePriceMultiplier * imagePriceUSDCNYRate * 1000))
	}
	return int(math.Ceil(cost * 1000))
}

func imageTaskNormalizeStoredAmountUnit(unit string) string {
	unit = strings.ToLower(strings.TrimSpace(unit))
	switch unit {
	case imageTaskExternalAmountUnitBalance:
		return unit
	default:
		return imageTaskNormalizeAmountUnit(unit)
	}
}

func imageTaskNormalizeAmountUnit(unit string) string {
	unit = strings.ToLower(strings.TrimSpace(unit))
	switch unit {
	case imageTaskAmountUnitAPIMartCost:
		return unit
	default:
		return ""
	}
}

func imageTaskStoredExternalChargeUnit(task map[string]any) string {
	unit := imageTaskNormalizeStoredAmountUnit(util.Clean(task[imageTaskExternalChargedUnitKey]))
	if unit != "" {
		return unit
	}
	if imageTaskFloat(task[imageTaskExternalChargedAmountKey]) > 0 {
		return imageTaskExternalAmountUnitBalance
	}
	return ""
}

func imageTaskExternalBalanceAmount(amount float64, unit string) float64 {
	if amount <= 0 {
		return 0
	}
	switch imageTaskNormalizeStoredAmountUnit(unit) {
	case imageTaskAmountUnitAPIMartCost:
		return amount * imagePriceMultiplier * imagePriceUSDCNYRate
	default:
		return amount
	}
}

func imageTaskExternalRawAmount(balanceAmount float64, unit string) float64 {
	if balanceAmount <= 0 {
		return 0
	}
	switch imageTaskNormalizeStoredAmountUnit(unit) {
	case imageTaskAmountUnitAPIMartCost:
		return balanceAmount / (imagePriceMultiplier * imagePriceUSDCNYRate)
	default:
		return balanceAmount
	}
}

func imageTaskFloat(value any) float64 {
	switch v := value.(type) {
	case float64:
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return 0
		}
		return v
	case float32:
		out := float64(v)
		if math.IsNaN(out) || math.IsInf(out, 0) {
			return 0
		}
		return out
	case int:
		return float64(v)
	case int64:
		return float64(v)
	case json.Number:
		out, err := v.Float64()
		if err == nil && !math.IsNaN(out) && !math.IsInf(out, 0) {
			return out
		}
	case string:
		out, err := strconv.ParseFloat(strings.TrimSpace(v), 64)
		if err == nil && !math.IsNaN(out) && !math.IsInf(out, 0) {
			return out
		}
	}
	return 0
}

func maxImageTaskFloat(left, right float64) float64 {
	if left > right {
		return left
	}
	return right
}

func imageTaskUsage(value any) map[string]any {
	usage := util.StringMap(value)
	if len(usage) == 0 {
		return nil
	}
	return util.CopyMap(usage)
}

func mergeImageTaskErrorFields(updates map[string]any, err error) {
	if updates == nil || err == nil {
		return
	}
	var policyErr ImageContentPolicyError
	if errors.As(err, &policyErr) {
		updates["error_code"] = "content_policy_violation"
		updates["error_type"] = "invalid_request_error"
		updates["error_param"] = "prompt"
		details := map[string]any{"source": firstNonEmpty(policyErr.Category, "upstream")}
		if reason := strings.TrimSpace(policyErr.Reason); reason != "" {
			details["reason"] = reason
		}
		updates["error_details"] = details
		return
	}
	var tooLargeErr ImageTooLargeError
	if errors.As(err, &tooLargeErr) {
		updates["error_code"] = "image_too_large"
		updates["error_type"] = "invalid_request_error"
		updates["error_param"] = "image"
		updates["error_details"] = map[string]any{"source": "upstream", "limit": "1024KB"}
		return
	}
}

func copyImageTaskErrorFields(item map[string]any, task map[string]any) {
	for _, key := range []string{"error_code", "error_type", "error_param"} {
		if value := util.Clean(task[key]); value != "" {
			item[key] = value
		}
	}
	if details := util.StringMap(task["error_details"]); len(details) > 0 {
		item["error_details"] = util.CopyMap(details)
	}
}

func imageTaskBillingSize(payload map[string]any) string {
	switch NormalizeImageResolutionPreset(util.Clean(payload["image_resolution"])) {
	case "2k":
		return "2K"
	case "4k":
		return "4K"
	}
	if size := util.Clean(payload["requested_size"]); size != "" {
		return size
	}
	return util.Clean(payload["size"])
}

func imageTaskUsageDateRange(now time.Time, days int) []string {
	if days <= 0 {
		days = 7
	}
	start := now.AddDate(0, 0, -days+1)
	out := make([]string, 0, days)
	for i := 0; i < days; i++ {
		out = append(out, start.AddDate(0, 0, i).Format("2006-01-02"))
	}
	return out
}

func newImageTaskUsageSummary(date string) map[string]any {
	out := map[string]any{
		"task_count":               0,
		"success_count":            0,
		"failure_count":            0,
		"cancelled_count":          0,
		"running_count":            0,
		"queued_count":             0,
		"local_consumed_amount":    0,
		"external_consumed_amount": 0.0,
		"duration_seconds":         int64(0),
	}
	if date != "" {
		out["date"] = date
	}
	return out
}

func addImageTaskToUsageSummary(summary map[string]any, task map[string]any) {
	if summary == nil || task == nil {
		return
	}
	summary["task_count"] = util.ToInt(summary["task_count"], 0) + 1
	switch util.Clean(task["status"]) {
	case TaskStatusSuccess:
		summary["success_count"] = util.ToInt(summary["success_count"], 0) + 1
	case TaskStatusError:
		summary["failure_count"] = util.ToInt(summary["failure_count"], 0) + 1
	case TaskStatusCancelled:
		summary["cancelled_count"] = util.ToInt(summary["cancelled_count"], 0) + 1
	case TaskStatusRunning:
		summary["running_count"] = util.ToInt(summary["running_count"], 0) + 1
	case TaskStatusQueued:
		summary["queued_count"] = util.ToInt(summary["queued_count"], 0) + 1
	}
	if consumed := util.ToInt(task["billing_consumed_amount"], -1); consumed >= 0 {
		summary["local_consumed_amount"] = util.ToInt(summary["local_consumed_amount"], 0) + consumed
	} else if charged := util.ToInt(task[imageTaskBillingChargedAmountKey], 0); charged > 0 {
		summary["local_consumed_amount"] = util.ToInt(summary["local_consumed_amount"], 0) + charged
	}
	externalConsumed := imageTaskFloat(task[imageTaskExternalConsumedAmountKey])
	if externalConsumed <= 0 {
		externalConsumed = imageTaskFloat(task[imageTaskExternalChargedAmountKey])
	}
	if externalConsumed > 0 {
		summary["external_consumed_amount"] = imageTaskFloat(summary["external_consumed_amount"]) + externalConsumed
	}
	if seconds := taskDurationSeconds(task); seconds > 0 {
		summary["duration_seconds"] = int64(util.ToInt(summary["duration_seconds"], 0)) + seconds
	}
}

func imageTaskUsageLogItem(task map[string]any) map[string]any {
	if task == nil {
		return map[string]any{}
	}
	mode := util.Clean(task["mode"])
	userID := firstNonEmpty(util.Clean(task[imageTaskActorUserIDPayloadKey]), util.Clean(task[imageTaskPayerUserIDPayloadKey]), util.Clean(task["owner_id"]))
	userName := firstNonEmpty(util.Clean(task[imageTaskActorNamePayloadKey]), util.Clean(task[imageTaskOwnerNamePayloadKey]))
	item := map[string]any{
		"id":                       util.Clean(task["id"]),
		"user_id":                  userID,
		"user_name":                userName,
		"mode":                     mode,
		"label":                    imageTaskModeLabel(mode),
		"model":                    util.Clean(task["model"]),
		"status":                   util.Clean(task["status"]),
		"created_at":               util.Clean(task["created_at"]),
		"updated_at":               util.Clean(task["updated_at"]),
		"local_consumed_amount":    max(0, util.ToInt(task["billing_consumed_amount"], 0)),
		"external_consumed_amount": imageTaskFloat(task[imageTaskExternalConsumedAmountKey]),
	}
	if errText := util.Clean(task["error"]); errText != "" {
		item["error"] = errText
	}
	if item["external_consumed_amount"] == 0.0 {
		item["external_consumed_amount"] = imageTaskFloat(task[imageTaskExternalChargedAmountKey])
	}
	if seconds := taskDurationSeconds(task); seconds >= 0 {
		item["duration_seconds"] = seconds
	}
	if teamID := util.Clean(task[imageTaskTeamIDPayloadKey]); teamID != "" {
		item["team_id"] = teamID
	}
	if actorName := util.Clean(task[imageTaskActorNamePayloadKey]); actorName != "" {
		item["actor_name"] = actorName
	}
	if actorUserID := util.Clean(task[imageTaskActorUserIDPayloadKey]); actorUserID != "" {
		item["actor_user_id"] = actorUserID
	}
	if ownerName := util.Clean(task[imageTaskOwnerNamePayloadKey]); ownerName != "" {
		item["owner_name"] = ownerName
	}
	return item
}

func taskDay(task map[string]any, key string) string {
	text := util.Clean(task[key])
	if len(text) < len("2006-01-02") {
		return ""
	}
	return text[:len("2006-01-02")]
}

func imageTaskModeLabel(mode string) string {
	switch mode {
	case "generate":
		return "文生图"
	case "edit":
		return "图生图"
	case "chat":
		return "文本生成"
	case "video":
		return "视频生成"
	default:
		if mode == "" {
			return "未知任务"
		}
		return mode
	}
}

func storedImageOutputCount(task map[string]any) int {
	count := imageTaskCount(task)
	if statuses := util.AsStringSlice(task["output_statuses"]); len(statuses) > count {
		count = len(statuses)
	}
	if data := util.AsMapSlice(task["data"]); len(data) > count {
		count = len(data)
	}
	return normalizedImageTaskCount(count)
}

func initialImageOutputStatuses(count int) []string {
	if count < 1 {
		count = 1
	}
	statuses := make([]string, count)
	for index := range statuses {
		statuses[index] = "queued"
	}
	return statuses
}

func normalizedImageOutputStatuses(mode string, count int, value any) []string {
	if mode != "generate" && mode != "edit" && mode != "video" {
		return nil
	}
	if count < 1 {
		count = 1
	}
	source := util.AsStringSlice(value)
	statuses := make([]string, count)
	for index := range statuses {
		status := "queued"
		if index < len(source) {
			switch source[index] {
			case TaskStatusQueued, TaskStatusRunning, TaskStatusSuccess, TaskStatusError, TaskStatusCancelled:
				status = source[index]
			}
		}
		statuses[index] = status
	}
	return statuses
}

func applyTerminalImageOutputStatuses(task map[string]any, status string) bool {
	mode := util.Clean(task["mode"])
	if mode != "generate" && mode != "edit" && mode != "video" {
		return false
	}
	count := storedImageOutputCount(task)
	statuses := finalImageOutputStatusesWithExisting(count, util.AsMapSlice(task["data"]), status, util.AsStringSlice(task["output_statuses"]))
	if len(statuses) == 0 {
		return false
	}
	if sameStringSlice(util.AsStringSlice(task["output_statuses"]), statuses) {
		return false
	}
	task["output_statuses"] = statuses
	return true
}

func finalImageOutputStatusesWithExisting(count int, data []map[string]any, status string, existing []string) []string {
	statuses := finalImageOutputStatuses(count, data, status)
	for index, item := range existing {
		if index >= len(statuses) {
			break
		}
		if item == TaskStatusSuccess {
			statuses[index] = TaskStatusSuccess
		}
	}
	return statuses
}

func sameStringSlice(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for index := range a {
		if a[index] != b[index] {
			return false
		}
	}
	return true
}

func hasImageTaskOutputData(item map[string]any) bool {
	if item == nil {
		return false
	}
	return util.Clean(item["b64_json"]) != "" || util.Clean(item["url"]) != "" || util.Clean(item["video_url"]) != "" || util.Clean(item["local_url"]) != "" || util.Clean(item["text_response"]) != ""
}

func hasBillableImageTaskOutputData(item map[string]any) bool {
	if item == nil {
		return false
	}
	return util.Clean(item["b64_json"]) != "" || util.Clean(item["url"]) != "" || util.Clean(item["video_url"]) != "" || util.Clean(item["local_url"]) != ""
}

func billableTaskOutputCount(task map[string]any) int {
	if task == nil {
		return 0
	}
	if util.Clean(task["mode"]) == "chat" && util.Clean(task["output_type"]) == "text" && util.ToBool(task[imageTaskBillingBillablePayloadKey]) {
		count := 0
		for _, item := range util.AsMapSlice(task["data"]) {
			if util.Clean(item["text_response"]) != "" {
				count++
			}
		}
		if count > 0 {
			return count
		}
	}
	if util.Clean(task["output_type"]) == "text" {
		return 0
	}
	count := 0
	for _, item := range util.AsMapSlice(task["data"]) {
		if hasBillableImageTaskOutputData(item) {
			count++
		}
	}
	return count
}

func isBillableImageTaskMode(mode string, payload map[string]any) bool {
	if mode == "generate" || mode == "edit" || mode == "video" {
		return true
	}
	return mode == "chat" && util.ToBool(payload[imageTaskBillingBillablePayloadKey])
}

func creationTaskBillingEndpoint(mode string) string {
	switch mode {
	case "edit":
		return "/api/creation-tasks/image-edits"
	case "video":
		return "/api/creation-tasks/video-generations"
	case "chat":
		return "/api/creation-tasks/chat-completions"
	default:
		return "/api/creation-tasks/image-generations"
	}
}

func imageTaskBillingChargeKeyFor(owner, taskID, scope string) string {
	return strings.Join([]string{"task", strings.TrimSpace(owner), strings.TrimSpace(taskID), strings.TrimSpace(scope)}, ":")
}

func imageTaskBillingReference(mode, taskID, model, chargeKey string) BillingReference {
	return BillingReference{
		Endpoint:  creationTaskBillingEndpoint(mode),
		Model:     model,
		TaskID:    taskID,
		ChargeKey: chargeKey,
	}
}

func mergeImageTaskMetadata(payload map[string]any, metadata map[string]any) {
	if len(metadata) == 0 {
		return
	}
	preset := NormalizeImageResolutionPreset(util.Clean(metadata["image_resolution"]))
	if util.ToBool(metadata["professional_mode"]) {
		preset = normalizeProStudioResolution(util.Clean(metadata["image_resolution"]))
	}
	if preset != "" {
		payload["image_resolution"] = preset
	}
	if requestedSize := strings.TrimSpace(util.Clean(metadata["requested_size"])); requestedSize != "" {
		payload["requested_size"] = normalizeImageTaskSize(requestedSize)
	}
	if util.ToBool(metadata["share_prompt_parameters"]) {
		payload["share_prompt_parameters"] = true
		if util.ToBool(metadata["share_reference_images"]) {
			payload["share_reference_images"] = true
		}
	}
	if conversationID := util.Clean(metadata["frontend_conversation_id"]); conversationID != "" {
		payload["frontend_conversation_id"] = conversationID
	}
	if fallback := normalizedFallbackReferenceImage(metadata["fallback_reference_image"]); len(fallback) > 0 {
		payload["fallback_reference_image"] = fallback
	}
	if publicImageURLs := util.AsStringSlice(metadata["official_public_image_urls"]); len(publicImageURLs) > 0 {
		payload["official_public_image_urls"] = publicImageURLs
	}
	if util.ToBool(metadata["professional_mode"]) {
		payload["professional_mode"] = true
	}
	if meta := util.StringMap(metadata["pro_studio"]); len(meta) > 0 {
		payload["pro_studio"] = meta
	}
	if settings := util.StringMap(metadata["official_settings"]); len(settings) > 0 {
		payload["official_settings"] = settings
	}
	if util.ToBool(metadata["web_search"]) {
		payload["web_search"] = true
		if query := util.Clean(metadata["web_search_query"]); query != "" {
			payload["web_search_query"] = query
		}
	}
	if settings := util.StringMap(metadata["midjourney_settings"]); len(settings) > 0 {
		payload["midjourney_settings"] = settings
	}
	if compression, ok := NormalizeImageOutputCompressionValue(metadata["raw_output_compression"]); ok {
		payload["raw_output_compression"] = compression
	}
	for _, key := range []string{imageTaskTeamIDPayloadKey, imageTaskPayerUserIDPayloadKey, imageTaskActorUserIDPayloadKey, imageTaskActorNamePayloadKey} {
		if value := util.Clean(metadata[key]); value != "" {
			payload[key] = value
		}
	}
}

func normalizedFallbackReferenceImage(value any) map[string]any {
	raw := util.StringMap(value)
	if len(raw) == 0 {
		return nil
	}
	fallback := map[string]any{}
	for _, key := range []string{"path", "url", "b64_json", "outputFormat"} {
		if text := strings.TrimSpace(util.Clean(raw[key])); text != "" {
			fallback[key] = text
		}
	}
	return fallback
}

func mergeImageOutputOptions(payload map[string]any, options ImageOutputOptions) {
	format := NormalizeImageOutputFormat(options.Format)
	if format == "" {
		return
	}
	payload["output_format"] = format
	compressionSupported := SupportsImageOutputCompression(format)
	if IsProStudioRequest(payload) {
		compressionSupported = SupportsOfficialImageOutputCompression(format)
	}
	if !compressionSupported || options.Compression == nil {
		delete(payload, "output_compression")
		return
	}
	compression := *options.Compression
	if compression < 0 {
		compression = 0
	} else if compression > 100 {
		compression = 100
	}
	payload["output_compression"] = compression
}

func mergeImageToolOptions(payload map[string]any, options ImageToolOptions) {
	for key, value := range map[string]string{
		"background":       options.Background,
		"moderation":       options.Moderation,
		"style":            options.Style,
		"input_image_mask": options.InputImageMask,
	} {
		if strings.TrimSpace(value) != "" {
			payload[key] = strings.TrimSpace(value)
		}
	}
	if options.PartialImages != nil && *options.PartialImages > 0 {
		payload["partial_images"] = *options.PartialImages
	}
	if options.OfficialFallback != nil {
		payload["official_fallback"] = *options.OfficialFallback
	}
	if options.SequentialOutputs {
		payload[imageOutputSequentialPayloadKey] = true
	}
}

func mergePublicImageToolTaskFields(target, source map[string]any) {
	for _, key := range []string{"background", "moderation", "style", "input_image_mask", "image_resolution", "requested_size"} {
		if value := util.Clean(source[key]); value != "" {
			target[key] = value
		}
	}
	if util.ToBool(source["web_search"]) {
		target["web_search"] = true
	}
	if util.ToBool(source["professional_mode"]) {
		target["professional_mode"] = true
	}
	if meta := util.StringMap(source["pro_studio"]); len(meta) > 0 {
		target["pro_studio"] = meta
	}
	if settings := util.StringMap(source["official_settings"]); len(settings) > 0 {
		target["official_settings"] = settings
	}
	if settings := util.StringMap(source["midjourney_settings"]); len(settings) > 0 {
		target["midjourney_settings"] = settings
	}
	if value := util.ToInt(source["partial_images"], 0); value > 0 {
		target["partial_images"] = value
	}
	if _, ok := source["official_fallback"]; ok {
		target["official_fallback"] = util.ToBool(source["official_fallback"])
	}
}

func taskResultData(result map[string]any) []map[string]any {
	if result == nil {
		return []map[string]any{}
	}
	data := util.AsMapSlice(result["data"])
	if data == nil {
		return []map[string]any{}
	}
	return cloneTaskData(data)
}

func cloneTaskData(items []map[string]any) []map[string]any {
	if len(items) == 0 {
		return []map[string]any{}
	}
	out := make([]map[string]any, 0, len(items))
	for _, item := range items {
		if item == nil {
			out = append(out, map[string]any{})
			continue
		}
		out = append(out, util.CopyMap(item))
	}
	return out
}

func isActiveTaskStatus(status string) bool {
	return status == TaskStatusQueued || status == TaskStatusRunning
}

func parseTaskTime(value any) time.Time {
	text := util.Clean(value)
	for _, layout := range []string{"2006-01-02 15:04:05", "2006-01-02T15:04:05.999999", "2006-01-02T15:04:05"} {
		if t, err := time.ParseInLocation(layout, text, time.Local); err == nil {
			return t
		}
	}
	for _, layout := range []string{time.RFC3339Nano} {
		if t, err := time.Parse(layout, text); err == nil {
			return t
		}
	}
	return time.Unix(0, 0)
}

func formatMilliCNY(amount int) string {
	if amount <= 0 {
		return "✪0.000"
	}
	return fmt.Sprintf("✪%.3f", float64(amount)/1000)
}
