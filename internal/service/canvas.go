package service

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"sync"

	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

const (
	CanvasNodeTypeText        = "text"
	CanvasNodeTypeImage       = "image"
	CanvasNodeTypePrompt      = "prompt"
	CanvasNodeTypeLoop        = "loop"
	CanvasNodeTypeGroup       = "group"
	CanvasNodeTypeImageCreate = "image_generation"
	CanvasNodeTypeImageEdit   = "image_edit"
	CanvasNodeTypeResult      = "result"

	CanvasNodeStatusBlocked = "blocked"

	canvasDocumentName = "canvases.json"
	canvasRunDocName   = "canvas_runs.json"
	maxCanvasUserCount = 50
	maxCanvasNodeCount = 100
	maxCanvasRunCount  = 20
)

var canvasNodeBlockedDataFields = map[string]struct{}{
	"api_key":     {},
	"apiKey":      {},
	"base_url":    {},
	"baseURL":     {},
	"group_id":    {},
	"groupId":     {},
	"secret_key":  {},
	"secretKey":   {},
	"gateway_url": {},
	"gatewayURL":  {},
}

type CanvasDocument struct {
	ID            string            `json:"id"`
	OwnerID       string            `json:"owner_id"`
	Name          string            `json:"name"`
	Kind          string            `json:"kind,omitempty"`
	SchemaVersion int               `json:"schema_version,omitempty"`
	Nodes         []CanvasNode      `json:"nodes"`
	Edges         []CanvasEdge      `json:"edges"`
	Viewport      map[string]any    `json:"viewport,omitempty"`
	LastRun       *CanvasRunSummary `json:"last_run,omitempty"`
	CreatedAt     string            `json:"created_at"`
	UpdatedAt     string            `json:"updated_at"`
}

type CanvasNode struct {
	ID       string         `json:"id"`
	Type     string         `json:"type"`
	Name     string         `json:"name,omitempty"`
	Position map[string]any `json:"position,omitempty"`
	Data     map[string]any `json:"data,omitempty"`
}

type CanvasEdge struct {
	ID           string `json:"id"`
	Source       string `json:"source"`
	Target       string `json:"target"`
	SourceHandle string `json:"source_handle,omitempty"`
	TargetHandle string `json:"target_handle,omitempty"`
}

type CanvasRunRequest struct {
	NodeIDs []string `json:"node_ids,omitempty"`
}

type CanvasRun struct {
	ID              string                        `json:"id"`
	CanvasID        string                        `json:"canvas_id"`
	CanvasName      string                        `json:"canvas_name,omitempty"`
	OwnerID         string                        `json:"owner_id"`
	Mode            string                        `json:"mode"`
	SelectedNodeIDs []string                      `json:"selected_node_ids,omitempty"`
	Status          string                        `json:"status"`
	Error           string                        `json:"error,omitempty"`
	NodeStates      map[string]CanvasNodeRunState `json:"node_states"`
	Summary         CanvasRunSummary              `json:"summary"`
	CreatedAt       string                        `json:"created_at"`
	UpdatedAt       string                        `json:"updated_at"`
	CompletedAt     string                        `json:"completed_at,omitempty"`
}

type CanvasNodeRunState struct {
	ID          string           `json:"id"`
	Type        string           `json:"type"`
	Name        string           `json:"name,omitempty"`
	Status      string           `json:"status"`
	Error       string           `json:"error,omitempty"`
	TaskID      string           `json:"task_id,omitempty"`
	Output      CanvasNodeOutput `json:"output,omitempty"`
	StartedAt   string           `json:"started_at,omitempty"`
	CompletedAt string           `json:"completed_at,omitempty"`
}

type CanvasRunSummary struct {
	RunID        string           `json:"run_id,omitempty"`
	Status       string           `json:"status"`
	TotalNodes   int              `json:"total_nodes"`
	SuccessNodes int              `json:"success_nodes"`
	FailedNodes  int              `json:"failed_nodes"`
	BlockedNodes int              `json:"blocked_nodes"`
	TextOutput   string           `json:"text_output,omitempty"`
	ImageOutputs []CanvasImageRef `json:"image_outputs,omitempty"`
	StartedAt    string           `json:"started_at,omitempty"`
	CompletedAt  string           `json:"completed_at,omitempty"`
}

type CanvasNodeOutput struct {
	Text   string           `json:"text,omitempty"`
	Images []CanvasImageRef `json:"images,omitempty"`
	TaskID string           `json:"task_id,omitempty"`
	Raw    map[string]any   `json:"raw,omitempty"`
}

type CanvasImageRef struct {
	URL          string `json:"url,omitempty"`
	LocalURL     string `json:"local_url,omitempty"`
	Path         string `json:"path,omitempty"`
	Name         string `json:"name,omitempty"`
	ThumbnailURL string `json:"thumbnail_url,omitempty"`
}

type CanvasNodeInput struct {
	NodeID   string           `json:"node_id"`
	NodeType string           `json:"node_type"`
	Output   CanvasNodeOutput `json:"output"`
	Data     map[string]any   `json:"data,omitempty"`
}

type CanvasNodeExecution struct {
	RunID    string
	CanvasID string
	Node     CanvasNode
	Inputs   []CanvasNodeInput
}

type CanvasNodeExecutor interface {
	ExecuteCanvasNode(context.Context, Identity, CanvasNodeExecution) (CanvasNodeOutput, error)
}

type CanvasService struct {
	mu       sync.RWMutex
	store    storage.JSONDocumentBackend
	canvases map[string]CanvasDocument
	runs     map[string]CanvasRun
	cancels  map[string]context.CancelFunc
}

func NewCanvasService(backend storage.Backend) *CanvasService {
	s := &CanvasService{
		store:    jsonDocumentStoreFromBackend(backend),
		canvases: map[string]CanvasDocument{},
		runs:     map[string]CanvasRun{},
		cancels:  map[string]context.CancelFunc{},
	}
	s.canvases = s.loadCanvases()
	s.runs = s.loadRuns()
	if s.recoverUnfinishedRunsLocked() {
		_ = s.saveRunsLocked()
	}
	return s
}

func (s *CanvasService) ListCanvases(identity Identity) []CanvasDocument {
	owner := ownerID(identity)
	s.mu.RLock()
	defer s.mu.RUnlock()
	items := make([]CanvasDocument, 0)
	for _, canvas := range s.canvases {
		if canvas.OwnerID == owner {
			items = append(items, cloneCanvas(canvas))
		}
	}
	sort.Slice(items, func(i, j int) bool {
		return strings.Compare(items[i].UpdatedAt, items[j].UpdatedAt) > 0
	})
	return items
}

func (s *CanvasService) CreateCanvas(identity Identity, input CanvasDocument) (CanvasDocument, error) {
	owner := ownerID(identity)
	now := util.NowLocal()
	canvas := normalizeCanvasDocument(input)
	canvas.ID = firstNonEmpty(canvas.ID, util.NewUUID())
	canvas.OwnerID = owner
	canvas.Name = firstNonEmpty(canvas.Name, "未命名画布")
	canvas.CreatedAt = now
	canvas.UpdatedAt = now
	if err := validateCanvasNodeCount(canvas); err != nil {
		return CanvasDocument{}, err
	}
	key := canvasKey(owner, canvas.ID)

	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.canvases[key]; exists {
		return CanvasDocument{}, fmt.Errorf("canvas already exists")
	}
	if s.canvasCountLocked(owner) >= maxCanvasUserCount {
		return CanvasDocument{}, fmt.Errorf("每个用户最多只能创建 %d 个画布", maxCanvasUserCount)
	}
	s.canvases[key] = canvas
	if err := s.saveCanvasesLocked(); err != nil {
		return CanvasDocument{}, err
	}
	return cloneCanvas(canvas), nil
}

func validateCanvasNodeCount(canvas CanvasDocument) error {
	if len(canvas.Nodes) > maxCanvasNodeCount {
		return fmt.Errorf("每个画布最多只能包含 %d 个节点", maxCanvasNodeCount)
	}
	return nil
}

func (s *CanvasService) canvasCountLocked(owner string) int {
	count := 0
	for _, canvas := range s.canvases {
		if canvas.OwnerID == owner {
			count++
		}
	}
	return count
}

func (s *CanvasService) GetCanvas(identity Identity, id string) (CanvasDocument, bool) {
	owner := ownerID(identity)
	id = util.Clean(id)
	if id == "" {
		return CanvasDocument{}, false
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	canvas, ok := s.canvases[canvasKey(owner, id)]
	if !ok {
		return CanvasDocument{}, false
	}
	return cloneCanvas(canvas), true
}

func (s *CanvasService) SaveCanvas(identity Identity, id string, input CanvasDocument) (CanvasDocument, error) {
	owner := ownerID(identity)
	id = util.Clean(id)
	if id == "" {
		return CanvasDocument{}, fmt.Errorf("canvas id is required")
	}
	now := util.NowLocal()
	key := canvasKey(owner, id)

	s.mu.Lock()
	defer s.mu.Unlock()
	existing, ok := s.canvases[key]
	if !ok {
		return CanvasDocument{}, fmt.Errorf("canvas not found")
	}
	canvas := normalizeCanvasDocument(input)
	canvas.ID = id
	canvas.OwnerID = owner
	canvas.Name = firstNonEmpty(canvas.Name, existing.Name, "未命名画布")
	canvas.CreatedAt = firstNonEmpty(existing.CreatedAt, now)
	canvas.UpdatedAt = now
	canvas.LastRun = existing.LastRun
	if err := validateCanvasNodeCount(canvas); err != nil {
		return CanvasDocument{}, err
	}
	s.canvases[key] = canvas
	if err := s.saveCanvasesLocked(); err != nil {
		return CanvasDocument{}, err
	}
	return cloneCanvas(canvas), nil
}

func (s *CanvasService) DeleteCanvas(identity Identity, id string) error {
	owner := ownerID(identity)
	id = util.Clean(id)
	if id == "" {
		return fmt.Errorf("canvas id is required")
	}
	key := canvasKey(owner, id)
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.canvases[key]; !ok {
		return fmt.Errorf("canvas not found")
	}
	delete(s.canvases, key)
	for runKey, run := range s.runs {
		if run.OwnerID == owner && run.CanvasID == id {
			delete(s.runs, runKey)
		}
	}
	if err := s.saveCanvasesLocked(); err != nil {
		return err
	}
	return s.saveRunsLocked()
}

func (s *CanvasService) StartRun(identity Identity, canvasID string, request CanvasRunRequest, executor CanvasNodeExecutor) (CanvasRun, error) {
	if executor == nil {
		return CanvasRun{}, fmt.Errorf("canvas executor is required")
	}
	owner := ownerID(identity)
	canvasID = util.Clean(canvasID)
	if canvasID == "" {
		return CanvasRun{}, fmt.Errorf("canvas id is required")
	}

	s.mu.Lock()
	canvas, ok := s.canvases[canvasKey(owner, canvasID)]
	if !ok {
		s.mu.Unlock()
		return CanvasRun{}, fmt.Errorf("canvas not found")
	}
	selected := normalizeCanvasNodeIDs(request.NodeIDs)
	if err := validateCanvasForRun(canvas, selected); err != nil {
		s.mu.Unlock()
		return CanvasRun{}, err
	}
	now := util.NowLocal()
	runID := util.NewUUID()
	mode := "canvas"
	if len(selected) > 0 {
		mode = "nodes"
	}
	nodeStates := initialCanvasNodeStates(canvas, selected)
	run := CanvasRun{
		ID:              runID,
		CanvasID:        canvas.ID,
		CanvasName:      canvas.Name,
		OwnerID:         owner,
		Mode:            mode,
		SelectedNodeIDs: selected,
		Status:          TaskStatusQueued,
		NodeStates:      nodeStates,
		Summary: CanvasRunSummary{
			RunID:      runID,
			Status:     TaskStatusQueued,
			TotalNodes: len(nodeStates),
			StartedAt:  now,
		},
		CreatedAt: now,
		UpdatedAt: now,
	}
	runCtx, cancel := context.WithCancel(context.Background())
	s.runs[canvasRunKey(owner, runID)] = run
	s.cancels[canvasRunKey(owner, runID)] = cancel
	s.cleanupRunsLocked(owner, canvasID)
	if err := s.saveRunsLocked(); err != nil {
		delete(s.runs, canvasRunKey(owner, runID))
		delete(s.cancels, canvasRunKey(owner, runID))
		cancel()
		s.mu.Unlock()
		return CanvasRun{}, err
	}
	s.mu.Unlock()

	go s.executeRun(runCtx, identity, cloneCanvas(canvas), runID, selected, executor)
	return cloneCanvasRun(run), nil
}

func (s *CanvasService) ListRuns(identity Identity, canvasID string) []CanvasRun {
	owner := ownerID(identity)
	canvasID = util.Clean(canvasID)
	s.mu.RLock()
	defer s.mu.RUnlock()
	items := make([]CanvasRun, 0)
	for _, run := range s.runs {
		if run.OwnerID == owner && (canvasID == "" || run.CanvasID == canvasID) {
			items = append(items, cloneCanvasRun(run))
		}
	}
	sort.Slice(items, func(i, j int) bool {
		return strings.Compare(items[i].CreatedAt, items[j].CreatedAt) > 0
	})
	return items
}

func (s *CanvasService) GetRun(identity Identity, runID string) (CanvasRun, bool) {
	owner := ownerID(identity)
	runID = util.Clean(runID)
	if runID == "" {
		return CanvasRun{}, false
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	run, ok := s.runs[canvasRunKey(owner, runID)]
	if !ok {
		return CanvasRun{}, false
	}
	return cloneCanvasRun(run), true
}

func (s *CanvasService) CancelRun(identity Identity, runID string) (CanvasRun, error) {
	owner := ownerID(identity)
	runID = util.Clean(runID)
	if runID == "" {
		return CanvasRun{}, fmt.Errorf("run id is required")
	}
	key := canvasRunKey(owner, runID)
	now := util.NowLocal()
	var cancel context.CancelFunc
	s.mu.Lock()
	run, ok := s.runs[key]
	if !ok {
		s.mu.Unlock()
		return CanvasRun{}, fmt.Errorf("canvas run not found")
	}
	if isActiveTaskStatus(run.Status) {
		run.Status = TaskStatusCancelled
		run.Error = "运行已终止"
		run.UpdatedAt = now
		run.CompletedAt = now
		for nodeID, state := range run.NodeStates {
			if isActiveTaskStatus(state.Status) {
				state.Status = TaskStatusCancelled
				state.Error = "运行已终止"
				state.CompletedAt = now
				run.NodeStates[nodeID] = state
			}
		}
		run.Summary = summarizeCanvasRun(run)
		s.runs[key] = run
		cancel = s.cancels[key]
		delete(s.cancels, key)
		_ = s.saveRunsLocked()
	}
	out := cloneCanvasRun(run)
	s.mu.Unlock()
	if cancel != nil {
		cancel()
	}
	return out, nil
}

func (s *CanvasService) executeRun(ctx context.Context, identity Identity, canvas CanvasDocument, runID string, selected []string, executor CanvasNodeExecutor) {
	owner := ownerID(identity)
	key := canvasRunKey(owner, runID)
	s.updateRun(owner, runID, func(run *CanvasRun) {
		run.Status = TaskStatusRunning
		run.UpdatedAt = util.NowLocal()
		run.Summary.Status = TaskStatusRunning
	})
	defer func() {
		s.mu.Lock()
		delete(s.cancels, key)
		s.mu.Unlock()
	}()

	order, incoming, err := canvasExecutionPlan(canvas)
	if err != nil {
		s.failRun(owner, runID, util.LocalizeErrorMessage(err.Error()))
		return
	}
	executionSet := canvasExecutionSet(canvas, selected)
	fullRun := len(selected) == 0
	outputs := map[string]CanvasNodeOutput{}
	nodeByID := canvasNodesByID(canvas.Nodes)

	for _, nodeID := range order {
		if _, ok := executionSet[nodeID]; !ok {
			continue
		}
		node := nodeByID[nodeID]
		if ctx.Err() != nil {
			s.cancelRunInternal(owner, runID)
			return
		}
		if fullRun {
			blockedBy := firstBlockedCanvasInput(incoming[nodeID], outputs, func(id string) CanvasNodeRunState {
				return s.runNodeState(owner, runID, id)
			})
			if blockedBy != "" {
				s.updateNodeState(owner, runID, node, func(state *CanvasNodeRunState) {
					state.Status = CanvasNodeStatusBlocked
					state.Error = fmt.Sprintf("上游节点 %s 未成功，已阻断", blockedBy)
					state.CompletedAt = util.NowLocal()
				})
				continue
			}
		}
		inputs := canvasNodeInputs(nodeID, incoming, nodeByID, outputs)
		s.updateNodeState(owner, runID, node, func(state *CanvasNodeRunState) {
			state.Status = TaskStatusRunning
			state.Error = ""
			state.StartedAt = util.NowLocal()
		})
		output, err := executor.ExecuteCanvasNode(ctx, identity, CanvasNodeExecution{
			RunID:    runID,
			CanvasID: canvas.ID,
			Node:     node,
			Inputs:   inputs,
		})
		if ctx.Err() != nil {
			s.cancelRunInternal(owner, runID)
			return
		}
		if err != nil {
			s.updateNodeState(owner, runID, node, func(state *CanvasNodeRunState) {
				state.Status = TaskStatusError
				state.Error = util.LocalizeErrorMessage(err.Error())
				state.CompletedAt = util.NowLocal()
			})
			continue
		}
		outputs[nodeID] = output
		s.updateNodeState(owner, runID, node, func(state *CanvasNodeRunState) {
			state.Status = TaskStatusSuccess
			state.Error = ""
			state.TaskID = output.TaskID
			state.Output = output
			state.CompletedAt = util.NowLocal()
		})
	}

	s.finishRun(owner, runID)
}

func (s *CanvasService) updateRun(owner, runID string, fn func(*CanvasRun)) {
	key := canvasRunKey(owner, runID)
	s.mu.Lock()
	defer s.mu.Unlock()
	run, ok := s.runs[key]
	if !ok {
		return
	}
	fn(&run)
	run.UpdatedAt = util.NowLocal()
	s.runs[key] = run
	_ = s.saveRunsLocked()
}

func (s *CanvasService) updateNodeState(owner, runID string, node CanvasNode, fn func(*CanvasNodeRunState)) {
	s.updateRun(owner, runID, func(run *CanvasRun) {
		if run.NodeStates == nil {
			run.NodeStates = map[string]CanvasNodeRunState{}
		}
		state := run.NodeStates[node.ID]
		if state.ID == "" {
			state = newCanvasNodeState(node)
		}
		fn(&state)
		run.NodeStates[node.ID] = state
		run.Summary = summarizeCanvasRun(*run)
	})
}

func (s *CanvasService) runNodeState(owner, runID, nodeID string) CanvasNodeRunState {
	s.mu.RLock()
	defer s.mu.RUnlock()
	run := s.runs[canvasRunKey(owner, runID)]
	return run.NodeStates[nodeID]
}

func (s *CanvasService) failRun(owner, runID, message string) {
	now := util.NowLocal()
	s.updateRun(owner, runID, func(run *CanvasRun) {
		run.Status = TaskStatusError
		run.Error = message
		run.CompletedAt = now
		run.Summary = summarizeCanvasRun(*run)
	})
}

func (s *CanvasService) cancelRunInternal(owner, runID string) {
	now := util.NowLocal()
	s.updateRun(owner, runID, func(run *CanvasRun) {
		run.Status = TaskStatusCancelled
		run.Error = "运行已终止"
		run.CompletedAt = now
		for nodeID, state := range run.NodeStates {
			if isActiveTaskStatus(state.Status) {
				state.Status = TaskStatusCancelled
				state.Error = "运行已终止"
				state.CompletedAt = now
				run.NodeStates[nodeID] = state
			}
		}
		run.Summary = summarizeCanvasRun(*run)
	})
}

func (s *CanvasService) finishRun(owner, runID string) {
	now := util.NowLocal()
	var summary CanvasRunSummary
	var canvasID string
	s.mu.Lock()
	run, ok := s.runs[canvasRunKey(owner, runID)]
	if !ok {
		s.mu.Unlock()
		return
	}
	summary = summarizeCanvasRun(run)
	if summary.FailedNodes > 0 || summary.BlockedNodes > 0 {
		run.Status = TaskStatusError
	} else {
		run.Status = TaskStatusSuccess
	}
	run.CompletedAt = now
	run.UpdatedAt = now
	summary.Status = run.Status
	summary.CompletedAt = now
	run.Summary = summary
	s.runs[canvasRunKey(owner, runID)] = run
	canvasID = run.CanvasID
	if canvas, ok := s.canvases[canvasKey(owner, canvasID)]; ok {
		canvas.LastRun = &summary
		canvas.UpdatedAt = now
		s.canvases[canvasKey(owner, canvasID)] = canvas
		_ = s.saveCanvasesLocked()
	}
	_ = s.saveRunsLocked()
	s.mu.Unlock()
}

func (s *CanvasService) loadCanvases() map[string]CanvasDocument {
	out := map[string]CanvasDocument{}
	for _, canvas := range decodeCanvasDocuments(loadStoredJSON(s.store, canvasDocumentName)) {
		canvas = normalizeCanvasDocument(canvas)
		if canvas.ID == "" || canvas.OwnerID == "" {
			continue
		}
		out[canvasKey(canvas.OwnerID, canvas.ID)] = canvas
	}
	return out
}

func (s *CanvasService) loadRuns() map[string]CanvasRun {
	out := map[string]CanvasRun{}
	for _, run := range decodeCanvasRuns(loadStoredJSON(s.store, canvasRunDocName)) {
		run = normalizeCanvasRun(run)
		if run.ID == "" || run.OwnerID == "" {
			continue
		}
		out[canvasRunKey(run.OwnerID, run.ID)] = run
	}
	return out
}

func (s *CanvasService) saveCanvasesLocked() error {
	items := make([]CanvasDocument, 0, len(s.canvases))
	for _, canvas := range s.canvases {
		items = append(items, canvas)
	}
	sort.Slice(items, func(i, j int) bool {
		return strings.Compare(items[i].UpdatedAt, items[j].UpdatedAt) > 0
	})
	return saveStoredJSON(s.store, canvasDocumentName, map[string]any{"items": items})
}

func (s *CanvasService) saveRunsLocked() error {
	items := make([]CanvasRun, 0, len(s.runs))
	for _, run := range s.runs {
		items = append(items, run)
	}
	sort.Slice(items, func(i, j int) bool {
		return strings.Compare(items[i].CreatedAt, items[j].CreatedAt) > 0
	})
	return saveStoredJSON(s.store, canvasRunDocName, map[string]any{"items": items})
}

func (s *CanvasService) recoverUnfinishedRunsLocked() bool {
	changed := false
	now := util.NowLocal()
	for key, run := range s.runs {
		if !isActiveTaskStatus(run.Status) {
			continue
		}
		run.Status = TaskStatusError
		run.Error = "服务已重启，未完成的画布运行已中断"
		run.UpdatedAt = now
		run.CompletedAt = now
		for nodeID, state := range run.NodeStates {
			if isActiveTaskStatus(state.Status) {
				state.Status = TaskStatusError
				state.Error = run.Error
				state.CompletedAt = now
				run.NodeStates[nodeID] = state
			}
		}
		run.Summary = summarizeCanvasRun(run)
		s.runs[key] = run
		changed = true
	}
	return changed
}

func (s *CanvasService) cleanupRunsLocked(owner, canvasID string) {
	items := make([]CanvasRun, 0)
	for key, run := range s.runs {
		if run.OwnerID == owner && run.CanvasID == canvasID {
			items = append(items, run)
			continue
		}
		_ = key
	}
	sort.Slice(items, func(i, j int) bool {
		return strings.Compare(items[i].CreatedAt, items[j].CreatedAt) > 0
	})
	for index := maxCanvasRunCount; index < len(items); index++ {
		delete(s.runs, canvasRunKey(items[index].OwnerID, items[index].ID))
	}
}

func decodeCanvasDocuments(raw any) []CanvasDocument {
	var doc struct {
		Items []CanvasDocument `json:"items"`
	}
	if decodeStoredValue(raw, &doc) == nil && len(doc.Items) > 0 {
		return doc.Items
	}
	var items []CanvasDocument
	_ = decodeStoredValue(raw, &items)
	return items
}

func decodeCanvasRuns(raw any) []CanvasRun {
	var doc struct {
		Items []CanvasRun `json:"items"`
	}
	if decodeStoredValue(raw, &doc) == nil && len(doc.Items) > 0 {
		return doc.Items
	}
	var items []CanvasRun
	_ = decodeStoredValue(raw, &items)
	return items
}

func decodeStoredValue(raw any, out any) error {
	data, err := json.Marshal(raw)
	if err != nil {
		return err
	}
	return json.Unmarshal(data, out)
}

func normalizeCanvasDocument(canvas CanvasDocument) CanvasDocument {
	canvas.ID = util.Clean(canvas.ID)
	canvas.OwnerID = util.Clean(canvas.OwnerID)
	canvas.Name = util.Clean(canvas.Name)
	canvas.Kind = util.Clean(canvas.Kind)
	canvas.Nodes = normalizeCanvasNodes(canvas.Nodes)
	canvas.Edges = normalizeCanvasEdges(canvas.Edges)
	canvas.Viewport = cloneAnyMap(canvas.Viewport)
	canvas.CreatedAt = util.Clean(canvas.CreatedAt)
	canvas.UpdatedAt = util.Clean(canvas.UpdatedAt)
	if canvas.LastRun != nil {
		summary := *canvas.LastRun
		summary.ImageOutputs = cloneCanvasImageRefs(summary.ImageOutputs)
		canvas.LastRun = &summary
	}
	return canvas
}

func normalizeCanvasNodes(nodes []CanvasNode) []CanvasNode {
	out := make([]CanvasNode, 0, len(nodes))
	seen := map[string]struct{}{}
	for _, node := range nodes {
		node.ID = util.Clean(node.ID)
		node.Type = util.Clean(node.Type)
		node.Name = util.Clean(node.Name)
		if node.ID == "" || node.Type == "" {
			continue
		}
		if _, ok := seen[node.ID]; ok {
			continue
		}
		seen[node.ID] = struct{}{}
		node.Position = cloneAnyMap(node.Position)
		node.Data = sanitizeCanvasNodeData(node.Data)
		out = append(out, node)
	}
	return out
}

func sanitizeCanvasNodeData(data map[string]any) map[string]any {
	if len(data) == 0 {
		return nil
	}
	out := make(map[string]any, len(data))
	for key, value := range data {
		if _, blocked := canvasNodeBlockedDataFields[key]; blocked {
			continue
		}
		out[key] = value
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func normalizeCanvasEdges(edges []CanvasEdge) []CanvasEdge {
	out := make([]CanvasEdge, 0, len(edges))
	seen := map[string]struct{}{}
	for _, edge := range edges {
		edge.ID = util.Clean(edge.ID)
		edge.Source = util.Clean(edge.Source)
		edge.Target = util.Clean(edge.Target)
		edge.SourceHandle = util.Clean(edge.SourceHandle)
		edge.TargetHandle = util.Clean(edge.TargetHandle)
		if edge.Source == "" || edge.Target == "" {
			continue
		}
		if edge.ID == "" {
			edge.ID = edge.Source + "->" + edge.Target
		}
		if _, ok := seen[edge.ID]; ok {
			continue
		}
		seen[edge.ID] = struct{}{}
		out = append(out, edge)
	}
	return out
}

func normalizeCanvasRun(run CanvasRun) CanvasRun {
	run.ID = util.Clean(run.ID)
	run.CanvasID = util.Clean(run.CanvasID)
	run.OwnerID = util.Clean(run.OwnerID)
	run.CanvasName = util.Clean(run.CanvasName)
	run.Mode = firstNonEmpty(util.Clean(run.Mode), "canvas")
	run.Status = firstNonEmpty(util.Clean(run.Status), TaskStatusQueued)
	run.Error = util.Clean(run.Error)
	run.SelectedNodeIDs = normalizeCanvasNodeIDs(run.SelectedNodeIDs)
	if run.NodeStates == nil {
		run.NodeStates = map[string]CanvasNodeRunState{}
	}
	for nodeID, state := range run.NodeStates {
		state.ID = firstNonEmpty(util.Clean(state.ID), nodeID)
		state.Type = util.Clean(state.Type)
		state.Name = util.Clean(state.Name)
		state.Status = firstNonEmpty(util.Clean(state.Status), TaskStatusQueued)
		state.Error = util.Clean(state.Error)
		state.TaskID = util.Clean(state.TaskID)
		state.Output = cloneCanvasNodeOutput(state.Output)
		run.NodeStates[nodeID] = state
	}
	run.Summary.ImageOutputs = cloneCanvasImageRefs(run.Summary.ImageOutputs)
	return run
}

func validateCanvasForRun(canvas CanvasDocument, selected []string) error {
	if len(canvas.Nodes) == 0 {
		return fmt.Errorf("canvas has no nodes")
	}
	nodeSet := map[string]CanvasNode{}
	for _, node := range canvas.Nodes {
		if !isKnownCanvasNodeType(node.Type) {
			return fmt.Errorf("unknown node type: %s", node.Type)
		}
		nodeSet[node.ID] = node
	}
	for _, edge := range canvas.Edges {
		if _, ok := nodeSet[edge.Source]; !ok {
			return fmt.Errorf("edge source node not found: %s", edge.Source)
		}
		if _, ok := nodeSet[edge.Target]; !ok {
			return fmt.Errorf("edge target node not found: %s", edge.Target)
		}
	}
	if len(selected) > 0 {
		for _, id := range selected {
			if _, ok := nodeSet[id]; !ok {
				return fmt.Errorf("selected node not found: %s", id)
			}
		}
	}
	order, _, err := canvasExecutionPlan(canvas)
	if err != nil {
		return err
	}
	if len(order) == 0 {
		return fmt.Errorf("canvas has no entry node")
	}
	return nil
}

func canvasExecutionPlan(canvas CanvasDocument) ([]string, map[string][]CanvasEdge, error) {
	nodeSet := map[string]struct{}{}
	indegree := map[string]int{}
	outgoing := map[string][]string{}
	incoming := map[string][]CanvasEdge{}
	for _, node := range canvas.Nodes {
		nodeSet[node.ID] = struct{}{}
		indegree[node.ID] = 0
	}
	for _, edge := range canvas.Edges {
		if _, ok := nodeSet[edge.Source]; !ok {
			return nil, nil, fmt.Errorf("edge source node not found: %s", edge.Source)
		}
		if _, ok := nodeSet[edge.Target]; !ok {
			return nil, nil, fmt.Errorf("edge target node not found: %s", edge.Target)
		}
		indegree[edge.Target]++
		outgoing[edge.Source] = append(outgoing[edge.Source], edge.Target)
		incoming[edge.Target] = append(incoming[edge.Target], edge)
	}
	var queue []string
	for id, count := range indegree {
		if count == 0 {
			queue = append(queue, id)
		}
	}
	sort.Strings(queue)
	if len(canvas.Nodes) > 0 && len(queue) == 0 {
		return nil, nil, fmt.Errorf("canvas has no entry node")
	}
	var order []string
	for len(queue) > 0 {
		id := queue[0]
		queue = queue[1:]
		order = append(order, id)
		next := append([]string(nil), outgoing[id]...)
		sort.Strings(next)
		for _, target := range next {
			indegree[target]--
			if indegree[target] == 0 {
				queue = append(queue, target)
				sort.Strings(queue)
			}
		}
	}
	if len(order) != len(canvas.Nodes) {
		return nil, nil, fmt.Errorf("canvas contains a cycle")
	}
	return order, incoming, nil
}

func initialCanvasNodeStates(canvas CanvasDocument, selected []string) map[string]CanvasNodeRunState {
	set := canvasExecutionSet(canvas, selected)
	states := map[string]CanvasNodeRunState{}
	for _, node := range canvas.Nodes {
		if _, ok := set[node.ID]; !ok {
			continue
		}
		states[node.ID] = newCanvasNodeState(node)
	}
	return states
}

func newCanvasNodeState(node CanvasNode) CanvasNodeRunState {
	return CanvasNodeRunState{
		ID:     node.ID,
		Type:   node.Type,
		Name:   node.Name,
		Status: TaskStatusQueued,
	}
}

func canvasExecutionSet(canvas CanvasDocument, selected []string) map[string]struct{} {
	out := map[string]struct{}{}
	if len(selected) > 0 {
		for _, id := range selected {
			out[id] = struct{}{}
		}
		return out
	}
	for _, node := range canvas.Nodes {
		out[node.ID] = struct{}{}
	}
	return out
}

func firstBlockedCanvasInput(edges []CanvasEdge, outputs map[string]CanvasNodeOutput, state func(string) CanvasNodeRunState) string {
	for _, edge := range edges {
		if _, ok := outputs[edge.Source]; ok {
			continue
		}
		sourceState := state(edge.Source)
		switch sourceState.Status {
		case TaskStatusError, TaskStatusCancelled, CanvasNodeStatusBlocked:
			return edge.Source
		}
	}
	return ""
}

func canvasNodeInputs(nodeID string, incoming map[string][]CanvasEdge, nodes map[string]CanvasNode, outputs map[string]CanvasNodeOutput) []CanvasNodeInput {
	edges := incoming[nodeID]
	inputs := make([]CanvasNodeInput, 0, len(edges))
	for _, edge := range edges {
		source := nodes[edge.Source]
		output, ok := outputs[edge.Source]
		if !ok {
			output = staticCanvasNodeOutput(source)
		}
		inputs = append(inputs, CanvasNodeInput{
			NodeID:   source.ID,
			NodeType: source.Type,
			Output:   output,
			Data:     cloneAnyMap(source.Data),
		})
	}
	return inputs
}

func staticCanvasNodeOutput(node CanvasNode) CanvasNodeOutput {
	if raw := util.StringMap(node.Data["last_output"]); len(raw) > 0 {
		return canvasNodeOutputFromMap(raw)
	}
	switch node.Type {
	case CanvasNodeTypeText:
		return CanvasNodeOutput{Text: firstNonEmpty(util.Clean(node.Data["text"]), util.Clean(node.Data["prompt"]))}
	case CanvasNodeTypeImage:
		ref := CanvasImageRef{
			URL:      firstNonEmpty(util.Clean(node.Data["url"]), util.Clean(node.Data["image_url"])),
			LocalURL: util.Clean(node.Data["local_url"]),
			Path:     firstNonEmpty(util.Clean(node.Data["path"]), util.Clean(node.Data["image_path"])),
			Name:     util.Clean(node.Data["name"]),
		}
		if ref.URL != "" || ref.LocalURL != "" || ref.Path != "" {
			return CanvasNodeOutput{Images: []CanvasImageRef{ref}}
		}
	}
	return CanvasNodeOutput{}
}

func canvasNodeOutputFromMap(raw map[string]any) CanvasNodeOutput {
	output := CanvasNodeOutput{
		Text:   util.Clean(raw["text"]),
		TaskID: util.Clean(raw["task_id"]),
		Raw:    cloneAnyMap(util.StringMap(raw["raw"])),
	}
	for _, item := range util.AsMapSlice(raw["images"]) {
		ref := CanvasImageRef{
			URL:      util.Clean(item["url"]),
			LocalURL: util.Clean(item["local_url"]),
			Path:     util.Clean(item["path"]),
			Name:     util.Clean(item["name"]),
		}
		if ref.URL != "" || ref.LocalURL != "" || ref.Path != "" {
			output.Images = append(output.Images, ref)
		}
	}
	return output
}

func summarizeCanvasRun(run CanvasRun) CanvasRunSummary {
	summary := CanvasRunSummary{
		RunID:       run.ID,
		Status:      run.Status,
		TotalNodes:  len(run.NodeStates),
		StartedAt:   run.CreatedAt,
		CompletedAt: run.CompletedAt,
	}
	for _, state := range run.NodeStates {
		switch state.Status {
		case TaskStatusSuccess:
			summary.SuccessNodes++
		case TaskStatusError, TaskStatusCancelled:
			summary.FailedNodes++
		case CanvasNodeStatusBlocked:
			summary.BlockedNodes++
		}
		if state.Output.Text != "" {
			if summary.TextOutput == "" {
				summary.TextOutput = state.Output.Text
			} else {
				summary.TextOutput += "\n" + state.Output.Text
			}
		}
		summary.ImageOutputs = append(summary.ImageOutputs, cloneCanvasImageRefs(state.Output.Images)...)
	}
	if summary.Status == "" {
		summary.Status = run.Status
	}
	return summary
}

func isKnownCanvasNodeType(nodeType string) bool {
	switch nodeType {
	case CanvasNodeTypeText, CanvasNodeTypeImage, CanvasNodeTypePrompt, CanvasNodeTypeLoop, CanvasNodeTypeGroup, CanvasNodeTypeImageCreate, CanvasNodeTypeImageEdit, CanvasNodeTypeResult:
		return true
	default:
		return false
	}
}

func normalizeCanvasNodeIDs(values []string) []string {
	out := make([]string, 0, len(values))
	seen := map[string]struct{}{}
	for _, value := range values {
		id := util.Clean(value)
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	sort.Strings(out)
	return out
}

func canvasNodesByID(nodes []CanvasNode) map[string]CanvasNode {
	out := map[string]CanvasNode{}
	for _, node := range nodes {
		out[node.ID] = node
	}
	return out
}

func canvasKey(owner, id string) string {
	return util.Clean(owner) + ":" + util.Clean(id)
}

func canvasRunKey(owner, id string) string {
	return util.Clean(owner) + ":" + util.Clean(id)
}

func cloneCanvas(canvas CanvasDocument) CanvasDocument {
	data, _ := json.Marshal(canvas)
	var out CanvasDocument
	_ = json.Unmarshal(data, &out)
	return out
}

func cloneCanvasRun(run CanvasRun) CanvasRun {
	data, _ := json.Marshal(run)
	var out CanvasRun
	_ = json.Unmarshal(data, &out)
	return out
}

func cloneCanvasNodeOutput(output CanvasNodeOutput) CanvasNodeOutput {
	return CanvasNodeOutput{
		Text:   output.Text,
		Images: cloneCanvasImageRefs(output.Images),
		TaskID: output.TaskID,
		Raw:    cloneAnyMap(output.Raw),
	}
}

func cloneCanvasImageRefs(items []CanvasImageRef) []CanvasImageRef {
	if len(items) == 0 {
		return nil
	}
	out := make([]CanvasImageRef, len(items))
	copy(out, items)
	return out
}

func cloneAnyMap(in map[string]any) map[string]any {
	if len(in) == 0 {
		return nil
	}
	out := make(map[string]any, len(in))
	for key, value := range in {
		out[key] = value
	}
	return out
}
