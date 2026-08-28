package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"path"
	"sort"
	"strings"
	"sync"
	"unicode/utf8"

	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

const (
	BeadProjectSchemaVersion = 1
	BeadProjectMaxCount      = 30
	BeadProjectMaxSide       = 156
	BeadProjectMaxLayers     = 20
	BeadProjectMaxJSONBytes  = 5 << 20
	beadProjectPreviewSide   = 24
)

var (
	ErrBeadProjectNotFound = errors.New("bead project not found")
	ErrBeadProjectConflict = errors.New("bead project revision conflict")
)

type BeadProjectConflictError struct {
	LatestRevision int
}

func (e *BeadProjectConflictError) Error() string { return ErrBeadProjectConflict.Error() }
func (e *BeadProjectConflictError) Unwrap() error { return ErrBeadProjectConflict }

type BeadAssetReference struct {
	Path   string `json:"path"`
	Name   string `json:"name"`
	Scope  string `json:"scope"`
	TeamID string `json:"team_id,omitempty"`
}

type BeadLayer struct {
	ID             string  `json:"id"`
	Name           string  `json:"name"`
	CustomName     bool    `json:"custom_name,omitempty"`
	Visible        bool    `json:"visible"`
	Locked         bool    `json:"locked"`
	IncludeInUsage bool    `json:"include_in_usage"`
	Opacity        float64 `json:"opacity"`
	Cells          []any   `json:"cells"`
}

type BeadEditingSettings struct {
	ShowGrid               bool   `json:"show_grid"`
	ShowCoordinates        bool   `json:"show_coordinates"`
	ShowPegboardBoundaries bool   `json:"show_pegboard_boundaries"`
	ShowLayerOverlap       bool   `json:"show_layer_overlap"`
	ShowActiveLayerOnly    bool   `json:"show_active_layer_only"`
	ShowColorCodes         bool   `json:"show_color_codes"`
	BeadDisplayMode        string `json:"bead_display_mode"`
	BeadsPerPack           int    `json:"beads_per_pack"`
	RightClickAction       string `json:"right_click_action"`
}

type BeadBoardSettings struct {
	BoardWidth   int  `json:"board_width"`
	BoardHeight  int  `json:"board_height"`
	ShowBoardIDs bool `json:"show_board_ids"`
}

type BeadMakerState struct {
	ActiveBoardIndex int   `json:"active_board_index"`
	CompletedCells   []int `json:"completed_cells"`
}

type BeadConversionParams struct {
	Width             int    `json:"width"`
	MaxColors         int    `json:"max_colors"`
	PaletteMode       string `json:"palette_mode"`
	BackgroundMode    string `json:"background_mode"`
	BackgroundColor   []int  `json:"background_color"`
	Tolerance         int    `json:"tolerance"`
	DetailLevel       int    `json:"detail_level"`
	Dither            bool   `json:"dither"`
	SpeckleReduction  int    `json:"speckle_reduction"`
	ClusterStrength   int    `json:"cluster_strength"`
	MaxColorBlocks    int    `json:"max_color_blocks"`
	MinColorBlockSize int    `json:"min_color_block_size"`
	SourceBrightness  int    `json:"source_brightness"`
	SourceContrast    int    `json:"source_contrast"`
	GenerationStyle   string `json:"generation_style"`
}

type BeadReferenceSettings struct {
	Visible   bool      `json:"visible"`
	Opacity   float64   `json:"opacity"`
	Scale     float64   `json:"scale"`
	Offset    BeadPoint `json:"offset"`
	Placement string    `json:"placement"`
}

type BeadPoint struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type BeadProjectDocument struct {
	ID                string                `json:"id"`
	SchemaVersion     int                   `json:"schema_version"`
	Revision          int                   `json:"revision"`
	Name              string                `json:"name"`
	Width             int                   `json:"width"`
	Height            int                   `json:"height"`
	ActiveBrand       string                `json:"active_brand"`
	PaletteVersion    string                `json:"palette_version"`
	Cells             []any                 `json:"cells"`
	Layers            []BeadLayer           `json:"layers"`
	ActiveLayerID     string                `json:"active_layer_id"`
	EditingSettings   BeadEditingSettings   `json:"editing_settings"`
	BoardSettings     BeadBoardSettings     `json:"board_settings"`
	MakerState        BeadMakerState        `json:"maker_state"`
	ConversionParams  BeadConversionParams  `json:"conversion_params"`
	SourceImage       *BeadAssetReference   `json:"source_image,omitempty"`
	ReferenceImage    *BeadAssetReference   `json:"reference_image,omitempty"`
	ReferenceSettings BeadReferenceSettings `json:"reference_settings"`
	CreatedAt         string                `json:"created_at"`
	UpdatedAt         string                `json:"updated_at"`
}

type BeadProjectPreview struct {
	Width  int   `json:"width"`
	Height int   `json:"height"`
	Cells  []any `json:"cells"`
}

type BeadProjectSummary struct {
	ID        string             `json:"id"`
	Name      string             `json:"name"`
	Revision  int                `json:"revision"`
	Width     int                `json:"width"`
	Height    int                `json:"height"`
	BeadCount int                `json:"bead_count"`
	Preview   BeadProjectPreview `json:"preview"`
	CreatedAt string             `json:"created_at"`
	UpdatedAt string             `json:"updated_at"`
}

type beadProjectIndex struct {
	SchemaVersion int                  `json:"schema_version"`
	Items         []BeadProjectSummary `json:"items"`
}

type BeadProjectService struct {
	mu    sync.Mutex
	store storage.JSONDocumentBackend
}

func NewBeadProjectService(backend storage.Backend) *BeadProjectService {
	return &BeadProjectService{store: jsonDocumentStoreFromBackend(backend)}
}

func (s *BeadProjectService) List(identity Identity) ([]BeadProjectSummary, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	index, err := s.loadIndexLocked(identity)
	if err != nil {
		return nil, err
	}
	return cloneBeadProjectSummaries(index.Items), nil
}

func (s *BeadProjectService) Get(identity Identity, id string) (BeadProjectDocument, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.loadProjectLocked(identity, id)
}

func (s *BeadProjectService) Create(identity Identity, input *BeadProjectDocument) (BeadProjectDocument, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	index, err := s.loadIndexLocked(identity)
	if err != nil {
		return BeadProjectDocument{}, err
	}
	if len(index.Items) >= BeadProjectMaxCount {
		return BeadProjectDocument{}, fmt.Errorf("每个用户最多只能创建 %d 个拼豆工程", BeadProjectMaxCount)
	}
	project := newBeadProjectDocument()
	if input != nil {
		project = cloneBeadProject(*input)
	}
	now := util.NowLocal()
	project.ID = util.NewUUID()
	project.Revision = 1
	project.CreatedAt = now
	project.UpdatedAt = now
	if strings.TrimSpace(project.Name) == "" {
		project.Name = "未命名拼豆工程"
	}
	if err := validateBeadProject(project); err != nil {
		return BeadProjectDocument{}, err
	}
	summary := summarizeBeadProject(project)
	nextIndex := beadProjectIndex{SchemaVersion: BeadProjectSchemaVersion, Items: append(cloneBeadProjectSummaries(index.Items), summary)}
	sortBeadProjectSummaries(nextIndex.Items)
	projectName := s.projectDocumentName(identity, project.ID)
	if err := s.store.SaveJSONDocument(projectName, project); err != nil {
		return BeadProjectDocument{}, err
	}
	if err := s.store.SaveJSONDocument(s.indexDocumentName(identity), nextIndex); err != nil {
		_ = s.store.DeleteJSONDocument(projectName)
		return BeadProjectDocument{}, err
	}
	return cloneBeadProject(project), nil
}

func (s *BeadProjectService) Update(identity Identity, id string, revision int, input BeadProjectDocument) (BeadProjectDocument, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	existing, err := s.loadProjectLocked(identity, id)
	if err != nil {
		return BeadProjectDocument{}, err
	}
	if revision != existing.Revision {
		return BeadProjectDocument{}, &BeadProjectConflictError{LatestRevision: existing.Revision}
	}
	project := cloneBeadProject(input)
	if project.SchemaVersion != BeadProjectSchemaVersion {
		return BeadProjectDocument{}, fmt.Errorf("schema_version must be %d", BeadProjectSchemaVersion)
	}
	project.ID = existing.ID
	project.Revision = existing.Revision + 1
	project.CreatedAt = existing.CreatedAt
	project.UpdatedAt = util.NowLocal()
	if err := validateBeadProject(project); err != nil {
		return BeadProjectDocument{}, err
	}
	if err := s.replaceProjectLocked(identity, existing, project); err != nil {
		return BeadProjectDocument{}, err
	}
	return cloneBeadProject(project), nil
}

func (s *BeadProjectService) Rename(identity Identity, id string, revision int, name string) (BeadProjectDocument, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	existing, err := s.loadProjectLocked(identity, id)
	if err != nil {
		return BeadProjectDocument{}, err
	}
	if revision != existing.Revision {
		return BeadProjectDocument{}, &BeadProjectConflictError{LatestRevision: existing.Revision}
	}
	next := cloneBeadProject(existing)
	next.Name = strings.TrimSpace(name)
	next.Revision++
	next.UpdatedAt = util.NowLocal()
	if err := validateBeadProject(next); err != nil {
		return BeadProjectDocument{}, err
	}
	if err := s.replaceProjectLocked(identity, existing, next); err != nil {
		return BeadProjectDocument{}, err
	}
	return cloneBeadProject(next), nil
}

func (s *BeadProjectService) Copy(identity Identity, id string) (BeadProjectDocument, error) {
	s.mu.Lock()
	existing, err := s.loadProjectLocked(identity, id)
	s.mu.Unlock()
	if err != nil {
		return BeadProjectDocument{}, err
	}
	existing.Name = beadProjectCopyName(existing.Name)
	return s.Create(identity, &existing)
}

func (s *BeadProjectService) Delete(identity Identity, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	existing, err := s.loadProjectLocked(identity, id)
	if err != nil {
		return err
	}
	index, err := s.loadIndexLocked(identity)
	if err != nil {
		return err
	}
	next := beadProjectIndex{SchemaVersion: BeadProjectSchemaVersion, Items: make([]BeadProjectSummary, 0, len(index.Items)-1)}
	for _, item := range index.Items {
		if item.ID != existing.ID {
			next.Items = append(next.Items, item)
		}
	}
	docName := s.projectDocumentName(identity, existing.ID)
	if err := s.store.DeleteJSONDocument(docName); err != nil {
		return err
	}
	if err := s.store.SaveJSONDocument(s.indexDocumentName(identity), next); err != nil {
		_ = s.store.SaveJSONDocument(docName, existing)
		return err
	}
	return nil
}

func (s *BeadProjectService) replaceProjectLocked(identity Identity, existing, next BeadProjectDocument) error {
	index, err := s.loadIndexLocked(identity)
	if err != nil {
		return err
	}
	found := false
	for i := range index.Items {
		if index.Items[i].ID == existing.ID {
			index.Items[i] = summarizeBeadProject(next)
			found = true
			break
		}
	}
	if !found {
		return ErrBeadProjectNotFound
	}
	sortBeadProjectSummaries(index.Items)
	docName := s.projectDocumentName(identity, existing.ID)
	if err := s.store.SaveJSONDocument(docName, next); err != nil {
		return err
	}
	if err := s.store.SaveJSONDocument(s.indexDocumentName(identity), index); err != nil {
		_ = s.store.SaveJSONDocument(docName, existing)
		return err
	}
	return nil
}

func (s *BeadProjectService) loadIndexLocked(identity Identity) (beadProjectIndex, error) {
	value, err := s.store.LoadJSONDocument(s.indexDocumentName(identity))
	if err != nil {
		return beadProjectIndex{}, err
	}
	if value == nil {
		return beadProjectIndex{SchemaVersion: BeadProjectSchemaVersion, Items: []BeadProjectSummary{}}, nil
	}
	var index beadProjectIndex
	if err := remarshalBeadProject(value, &index); err != nil {
		return beadProjectIndex{}, fmt.Errorf("invalid bead project index: %w", err)
	}
	if index.SchemaVersion != BeadProjectSchemaVersion {
		return beadProjectIndex{}, fmt.Errorf("unsupported bead project index schema")
	}
	sortBeadProjectSummaries(index.Items)
	return index, nil
}

func (s *BeadProjectService) loadProjectLocked(identity Identity, id string) (BeadProjectDocument, error) {
	id = cleanBeadProjectID(id)
	if id == "" {
		return BeadProjectDocument{}, ErrBeadProjectNotFound
	}
	index, err := s.loadIndexLocked(identity)
	if err != nil {
		return BeadProjectDocument{}, err
	}
	found := false
	for _, item := range index.Items {
		if item.ID == id {
			found = true
			break
		}
	}
	if !found {
		return BeadProjectDocument{}, ErrBeadProjectNotFound
	}
	value, err := s.store.LoadJSONDocument(s.projectDocumentName(identity, id))
	if err != nil {
		return BeadProjectDocument{}, err
	}
	if value == nil {
		return BeadProjectDocument{}, ErrBeadProjectNotFound
	}
	var project BeadProjectDocument
	if err := remarshalBeadProject(value, &project); err != nil {
		return BeadProjectDocument{}, fmt.Errorf("invalid bead project document: %w", err)
	}
	if err := validateBeadProject(project); err != nil {
		return BeadProjectDocument{}, fmt.Errorf("invalid bead project document: %w", err)
	}
	return cloneBeadProject(project), nil
}

func (s *BeadProjectService) indexDocumentName(identity Identity) string {
	return path.Join("bead-projects", beadProjectOwnerHash(identity), "index.json")
}

func (s *BeadProjectService) projectDocumentName(identity Identity, id string) string {
	return path.Join("bead-projects", beadProjectOwnerHash(identity), cleanBeadProjectID(id)+".json")
}

func beadProjectOwnerHash(identity Identity) string {
	return util.SHA256Hex("bead-projects\x00" + ownerID(identity))[:24]
}

func cleanBeadProjectID(id string) string {
	id = strings.TrimSpace(id)
	if id == "" || len(id) > 80 {
		return ""
	}
	for _, r := range id {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			continue
		}
		return ""
	}
	return id
}

func newBeadProjectDocument() BeadProjectDocument {
	now := util.NowLocal()
	width, height := 52, 52
	cells := make([]any, width*height)
	return BeadProjectDocument{
		SchemaVersion:  BeadProjectSchemaVersion,
		Name:           "未命名拼豆工程",
		Width:          width,
		Height:         height,
		ActiveBrand:    "MARD",
		PaletteVersion: "mard-291-v1",
		Cells:          cloneBeadCells(cells),
		Layers: []BeadLayer{{
			ID: "base", Name: "图层 1", Visible: true, IncludeInUsage: true, Opacity: 1, Cells: cloneBeadCells(cells),
		}},
		ActiveLayerID: "base",
		EditingSettings: BeadEditingSettings{
			ShowGrid: true, ShowCoordinates: true, ShowPegboardBoundaries: true, BeadDisplayMode: "bead", BeadsPerPack: 500, RightClickAction: "pan",
		},
		BoardSettings: BeadBoardSettings{BoardWidth: 52, BoardHeight: 52, ShowBoardIDs: true},
		MakerState:    BeadMakerState{ActiveBoardIndex: 0, CompletedCells: []int{}},
		ConversionParams: BeadConversionParams{
			Width: 52, MaxColors: 32, PaletteMode: "291", BackgroundMode: "keep", BackgroundColor: []int{255, 255, 255}, Tolerance: 20, DetailLevel: 60, SpeckleReduction: 0, ClusterStrength: 1, MaxColorBlocks: 1200, MinColorBlockSize: 1, GenerationStyle: "cartoon",
		},
		ReferenceSettings: BeadReferenceSettings{Opacity: 0.5, Scale: 1, Placement: "below"},
		CreatedAt:         now,
		UpdatedAt:         now,
	}
}

func validateBeadProject(project BeadProjectDocument) error {
	if project.SchemaVersion != BeadProjectSchemaVersion {
		return fmt.Errorf("schema_version must be %d", BeadProjectSchemaVersion)
	}
	name := strings.TrimSpace(project.Name)
	if name == "" || utf8.RuneCountInString(name) > 80 {
		return fmt.Errorf("工程名称不能为空且最多 80 个字符")
	}
	if project.Width < 1 || project.Width > BeadProjectMaxSide || project.Height < 1 || project.Height > BeadProjectMaxSide {
		return fmt.Errorf("画布宽高必须在 1 到 %d 之间", BeadProjectMaxSide)
	}
	expected := project.Width * project.Height
	if err := validateBeadCells(project.Cells, expected, "组合格子"); err != nil {
		return err
	}
	if len(project.Layers) < 1 || len(project.Layers) > BeadProjectMaxLayers {
		return fmt.Errorf("图层数量必须在 1 到 %d 之间", BeadProjectMaxLayers)
	}
	activeFound := false
	ids := map[string]struct{}{}
	for i, layer := range project.Layers {
		if cleanBeadProjectID(layer.ID) == "" {
			return fmt.Errorf("第 %d 个图层 ID 无效", i+1)
		}
		if _, exists := ids[layer.ID]; exists {
			return fmt.Errorf("图层 ID 不能重复")
		}
		ids[layer.ID] = struct{}{}
		if layer.ID == project.ActiveLayerID {
			activeFound = true
		}
		if utf8.RuneCountInString(strings.TrimSpace(layer.Name)) > 80 || strings.TrimSpace(layer.Name) == "" {
			return fmt.Errorf("图层名称不能为空且最多 80 个字符")
		}
		if layer.Opacity < 0 || layer.Opacity > 1 {
			return fmt.Errorf("图层透明度必须在 0 到 1 之间")
		}
		if err := validateBeadCells(layer.Cells, expected, fmt.Sprintf("第 %d 个图层格子", i+1)); err != nil {
			return err
		}
	}
	if !activeFound {
		return fmt.Errorf("活动图层不存在")
	}
	if project.ActiveBrand != "MARD" {
		return fmt.Errorf("active_brand must be MARD")
	}
	if project.PaletteVersion == "" {
		return fmt.Errorf("palette_version is required")
	}
	if err := validateBeadConversionParams(project.ConversionParams); err != nil {
		return err
	}
	if err := validateBeadMakerState(project.MakerState, project.Cells, project.Width, project.Height, project.BoardSettings); err != nil {
		return err
	}
	if err := validateBeadAssetReference(project.SourceImage); err != nil {
		return fmt.Errorf("原图引用无效: %w", err)
	}
	if err := validateBeadAssetReference(project.ReferenceImage); err != nil {
		return fmt.Errorf("参考图引用无效: %w", err)
	}
	data, err := json.Marshal(project)
	if err != nil {
		return err
	}
	if len(data) > BeadProjectMaxJSONBytes {
		return fmt.Errorf("拼豆工程 JSON 不能超过 5 MiB")
	}
	return nil
}

func validateBeadConversionParams(params BeadConversionParams) error {
	if params.Width < 1 || params.Width > BeadProjectMaxSide {
		return fmt.Errorf("转换宽度必须在 1 到 %d 之间", BeadProjectMaxSide)
	}
	if params.MaxColors < 2 || params.MaxColors > 291 {
		return fmt.Errorf("转换色数必须在 2 到 291 之间")
	}
	if params.PaletteMode != "221" && params.PaletteMode != "291" {
		return fmt.Errorf("转换色卡模式无效")
	}
	if params.BackgroundMode != "keep" && params.BackgroundMode != "remove-white" {
		return fmt.Errorf("转换背景模式无效")
	}
	if len(params.BackgroundColor) != 3 {
		return fmt.Errorf("转换背景颜色必须包含 3 个通道")
	}
	for _, channel := range params.BackgroundColor {
		if channel < 0 || channel > 255 {
			return fmt.Errorf("转换背景颜色通道必须在 0 到 255 之间")
		}
	}
	if params.Tolerance < 0 || params.Tolerance > 120 {
		return fmt.Errorf("转换容差必须在 0 到 120 之间")
	}
	if params.DetailLevel < 0 || params.DetailLevel > 100 {
		return fmt.Errorf("转换精细度必须在 0 到 100 之间")
	}
	if params.SpeckleReduction < 0 || params.SpeckleReduction > 4 {
		return fmt.Errorf("转换平滑必须在 0 到 4 之间")
	}
	if params.ClusterStrength < 0 || params.ClusterStrength > 4 {
		return fmt.Errorf("转换主色聚类必须在 0 到 4 之间")
	}
	if params.MaxColorBlocks != 0 && (params.MaxColorBlocks < 1 || params.MaxColorBlocks > 5000) {
		return fmt.Errorf("转换最多色块必须在 1 到 5000 之间")
	}
	if params.MinColorBlockSize != 0 && (params.MinColorBlockSize < 1 || params.MinColorBlockSize > 500) {
		return fmt.Errorf("转换最少色块必须在 1 到 500 之间")
	}
	if params.SourceBrightness < -50 || params.SourceBrightness > 50 {
		return fmt.Errorf("转换亮度必须在 -50 到 50 之间")
	}
	if params.SourceContrast < -50 || params.SourceContrast > 50 {
		return fmt.Errorf("转换对比度必须在 -50 到 50 之间")
	}
	if params.GenerationStyle != "cartoon" && params.GenerationStyle != "realistic" {
		return fmt.Errorf("转换生成风格无效")
	}
	return nil
}

func validateBeadMakerState(state BeadMakerState, cells []any, width, height int, board BeadBoardSettings) error {
	boardWidth := board.BoardWidth
	if boardWidth < 1 {
		boardWidth = width
	}
	boardHeight := board.BoardHeight
	if boardHeight < 1 {
		boardHeight = height
	}
	boardCount := ((width + boardWidth - 1) / boardWidth) * ((height + boardHeight - 1) / boardHeight)
	if state.ActiveBoardIndex < 0 || state.ActiveBoardIndex >= boardCount {
		return fmt.Errorf("制作模式当前豆板无效")
	}
	seen := make(map[int]struct{}, len(state.CompletedCells))
	for _, index := range state.CompletedCells {
		if index < 0 || index >= len(cells) {
			return fmt.Errorf("制作模式完成格子超出画布范围")
		}
		if _, exists := seen[index]; exists {
			return fmt.Errorf("制作模式完成格子不能重复")
		}
		if cells[index] == nil {
			return fmt.Errorf("制作模式完成格子必须对应有色拼豆")
		}
		seen[index] = struct{}{}
	}
	return nil
}

func validateBeadCells(cells []any, expected int, label string) error {
	if len(cells) != expected {
		return fmt.Errorf("%s数量必须严格等于画布宽乘高", label)
	}
	for _, value := range cells {
		if value == nil {
			continue
		}
		color, ok := value.(string)
		if !ok || strings.TrimSpace(color) == "" || len(color) > 80 {
			return fmt.Errorf("%s只能包含颜色 ID 或 null", label)
		}
	}
	return nil
}

func validateBeadAssetReference(ref *BeadAssetReference) error {
	if ref == nil {
		return nil
	}
	ref.Path = strings.TrimSpace(ref.Path)
	ref.Name = strings.TrimSpace(ref.Name)
	ref.Scope = strings.TrimSpace(ref.Scope)
	ref.TeamID = strings.TrimSpace(ref.TeamID)
	lower := strings.ToLower(ref.Path)
	if strings.HasPrefix(lower, "data:") || strings.HasPrefix(lower, "blob:") || strings.HasPrefix(lower, "http:") || strings.HasPrefix(lower, "https:") {
		return fmt.Errorf("path must be a managed asset path")
	}
	cleaned := path.Clean(strings.ReplaceAll(ref.Path, "\\", "/"))
	if ref.Path == "" || ref.Name == "" || cleaned != strings.ReplaceAll(ref.Path, "\\", "/") || cleaned == "." || strings.HasPrefix(cleaned, "../") || strings.HasPrefix(cleaned, "/") || strings.ContainsAny(ref.Path, "?#\x00") {
		return fmt.Errorf("path is invalid")
	}
	if ref.Scope != "mine" && ref.Scope != "team" {
		return fmt.Errorf("scope must be mine or team")
	}
	if ref.Scope == "team" && ref.TeamID == "" {
		return fmt.Errorf("team_id is required for team assets")
	}
	if ref.Scope == "mine" && ref.TeamID != "" {
		return fmt.Errorf("team_id is only allowed for team assets")
	}
	return nil
}

func summarizeBeadProject(project BeadProjectDocument) BeadProjectSummary {
	return BeadProjectSummary{
		ID: project.ID, Name: project.Name, Revision: project.Revision, Width: project.Width, Height: project.Height,
		BeadCount: countBeadCells(project.Cells), Preview: beadProjectPreview(project), CreatedAt: project.CreatedAt, UpdatedAt: project.UpdatedAt,
	}
}

func beadProjectPreview(project BeadProjectDocument) BeadProjectPreview {
	previewWidth := min(project.Width, beadProjectPreviewSide)
	previewHeight := min(project.Height, beadProjectPreviewSide)
	result := make([]any, previewWidth*previewHeight)
	for y := 0; y < previewHeight; y++ {
		sourceY := y * project.Height / previewHeight
		for x := 0; x < previewWidth; x++ {
			sourceX := x * project.Width / previewWidth
			result[y*previewWidth+x] = project.Cells[sourceY*project.Width+sourceX]
		}
	}
	return BeadProjectPreview{Width: previewWidth, Height: previewHeight, Cells: result}
}

func countBeadCells(cells []any) int {
	count := 0
	for _, cell := range cells {
		if value, ok := cell.(string); ok && strings.TrimSpace(value) != "" {
			count++
		}
	}
	return count
}

func sortBeadProjectSummaries(items []BeadProjectSummary) {
	sort.Slice(items, func(i, j int) bool { return items[i].UpdatedAt > items[j].UpdatedAt })
}

func beadProjectCopyName(name string) string {
	base := strings.TrimSpace(name)
	suffix := " - 副本"
	for utf8.RuneCountInString(base+suffix) > 80 {
		runes := []rune(base)
		base = string(runes[:len(runes)-1])
	}
	return base + suffix
}

func cloneBeadProject(project BeadProjectDocument) BeadProjectDocument {
	var out BeadProjectDocument
	_ = remarshalBeadProject(project, &out)
	return out
}

func cloneBeadProjectSummaries(items []BeadProjectSummary) []BeadProjectSummary {
	var out []BeadProjectSummary
	_ = remarshalBeadProject(items, &out)
	if out == nil {
		out = []BeadProjectSummary{}
	}
	return out
}

func cloneBeadCells(cells []any) []any {
	return append([]any(nil), cells...)
}

func remarshalBeadProject(input, output any) error {
	raw, err := json.Marshal(input)
	if err != nil {
		return err
	}
	return json.Unmarshal(raw, output)
}
