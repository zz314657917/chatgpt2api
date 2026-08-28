package service

import (
	"errors"
	"fmt"
	"strings"
	"testing"

	"chatgpt2api/internal/storage"
)

func TestBeadProjectServiceCRUDIsolationAndReload(t *testing.T) {
	backend := newTestStorageBackend(t)
	svc := NewBeadProjectService(backend)
	alice := Identity{ID: "alice", OwnerID: "alice", Role: AuthRoleUser}
	bob := Identity{ID: "bob", OwnerID: "bob", Role: AuthRoleUser}

	created, err := svc.Create(alice, nil)
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}
	if created.Revision != 1 || created.SchemaVersion != 1 || created.ID == "" {
		t.Fatalf("Create() = %#v", created)
	}
	created.Cells[0] = "MARD-A1"
	created.Layers[0].Cells[0] = "MARD-A1"
	created.SourceImage = &BeadAssetReference{Path: "images/alice/source.png", Name: "source.png", Scope: "mine"}
	updated, err := svc.Update(alice, created.ID, 1, created)
	if err != nil {
		t.Fatalf("Update() error = %v", err)
	}
	if updated.Revision != 2 || updated.Cells[0] != "MARD-A1" {
		t.Fatalf("Update() = %#v", updated)
	}

	items, err := svc.List(alice)
	if err != nil || len(items) != 1 {
		t.Fatalf("List() items=%#v err=%v", items, err)
	}
	if items[0].BeadCount != 1 || len(items[0].Preview.Cells) == 0 {
		t.Fatalf("summary = %#v", items[0])
	}
	if _, err := svc.Get(bob, created.ID); !errors.Is(err, ErrBeadProjectNotFound) {
		t.Fatalf("cross-owner Get() error = %v", err)
	}

	reloaded := NewBeadProjectService(backend)
	got, err := reloaded.Get(alice, created.ID)
	if err != nil || got.Revision != 2 || got.SourceImage == nil {
		t.Fatalf("reloaded Get() = %#v err=%v", got, err)
	}
	renamed, err := reloaded.Rename(alice, created.ID, 2, "新名称")
	if err != nil || renamed.Revision != 3 || renamed.Name != "新名称" {
		t.Fatalf("Rename() = %#v err=%v", renamed, err)
	}
	copy, err := reloaded.Copy(alice, created.ID)
	if err != nil || copy.ID == created.ID || copy.Revision != 1 || copy.Name != "新名称 - 副本" {
		t.Fatalf("Copy() = %#v err=%v", copy, err)
	}
	if err := reloaded.Delete(alice, created.ID); err != nil {
		t.Fatalf("Delete() error = %v", err)
	}
	if _, err := reloaded.Get(alice, created.ID); !errors.Is(err, ErrBeadProjectNotFound) {
		t.Fatalf("deleted Get() error = %v", err)
	}
}

func TestBeadProjectServiceRevisionConflict(t *testing.T) {
	svc := NewBeadProjectService(newTestStorageBackend(t))
	identity := Identity{ID: "user-1"}
	project, err := svc.Create(identity, nil)
	if err != nil {
		t.Fatal(err)
	}
	_, err = svc.Rename(identity, project.ID, 99, "冲突")
	var conflict *BeadProjectConflictError
	if !errors.As(err, &conflict) || conflict.LatestRevision != 1 {
		t.Fatalf("Rename() conflict = %#v, want latest revision 1", err)
	}
}

func TestBeadProjectServiceValidatesDocumentLimits(t *testing.T) {
	svc := NewBeadProjectService(newTestStorageBackend(t))
	identity := Identity{ID: "user-1"}
	base := newBeadProjectDocument()

	tests := []struct {
		name   string
		mutate func(*BeadProjectDocument)
		want   string
	}{
		{name: "schema", mutate: func(p *BeadProjectDocument) { p.SchemaVersion = 2 }, want: "schema_version"},
		{name: "name", mutate: func(p *BeadProjectDocument) { p.Name = strings.Repeat("名", 81) }, want: "80"},
		{name: "side", mutate: func(p *BeadProjectDocument) { p.Width = 157 }, want: "156"},
		{name: "composed cells", mutate: func(p *BeadProjectDocument) { p.Cells = p.Cells[:len(p.Cells)-1] }, want: "宽乘高"},
		{name: "layer cells", mutate: func(p *BeadProjectDocument) { p.Layers[0].Cells = nil }, want: "宽乘高"},
		{name: "layers", mutate: func(p *BeadProjectDocument) {
			p.Layers = make([]BeadLayer, 21)
		}, want: "20"},
		{name: "active layer", mutate: func(p *BeadProjectDocument) { p.ActiveLayerID = "missing" }, want: "活动图层"},
		{name: "data url", mutate: func(p *BeadProjectDocument) {
			p.SourceImage = &BeadAssetReference{Path: "data:image/png;base64,AA", Name: "x", Scope: "mine"}
		}, want: "managed asset"},
		{name: "blob url", mutate: func(p *BeadProjectDocument) {
			p.ReferenceImage = &BeadAssetReference{Path: "blob:https://example.invalid/id", Name: "x", Scope: "mine"}
		}, want: "managed asset"},
		{name: "signed url", mutate: func(p *BeadProjectDocument) {
			p.ReferenceImage = &BeadAssetReference{Path: "https://example.invalid/x?token=secret", Name: "x", Scope: "mine"}
		}, want: "managed asset"},
		{name: "team id", mutate: func(p *BeadProjectDocument) {
			p.ReferenceImage = &BeadAssetReference{Path: "images/team/x.png", Name: "x", Scope: "team"}
		}, want: "team_id"},
		{name: "conversion detail", mutate: func(p *BeadProjectDocument) { p.ConversionParams.DetailLevel = 101 }, want: "精细度"},
		{name: "conversion cluster", mutate: func(p *BeadProjectDocument) { p.ConversionParams.ClusterStrength = 5 }, want: "主色聚类"},
		{name: "conversion color blocks", mutate: func(p *BeadProjectDocument) { p.ConversionParams.MaxColorBlocks = 5001 }, want: "最多色块"},
		{name: "conversion min color blocks", mutate: func(p *BeadProjectDocument) { p.ConversionParams.MinColorBlockSize = 501 }, want: "最少色块"},
		{name: "maker invalid board", mutate: func(p *BeadProjectDocument) { p.MakerState.ActiveBoardIndex = 1 }, want: "当前豆板"},
		{name: "maker repeated cells", mutate: func(p *BeadProjectDocument) {
			p.Cells[0] = "MARD-A1"
			p.Layers[0].Cells[0] = "MARD-A1"
			p.MakerState.CompletedCells = []int{0, 0}
		}, want: "不能重复"},
		{name: "maker empty cell", mutate: func(p *BeadProjectDocument) { p.MakerState.CompletedCells = []int{0} }, want: "有色拼豆"},
		{name: "conversion brightness", mutate: func(p *BeadProjectDocument) { p.ConversionParams.SourceBrightness = 51 }, want: "亮度"},
		{name: "json size", mutate: func(p *BeadProjectDocument) {
			p.Width = 156
			p.Height = 156
			cell := strings.Repeat("C", 80)
			p.Cells = make([]any, p.Width*p.Height)
			for i := range p.Cells {
				p.Cells[i] = cell
			}
			p.Layers = make([]BeadLayer, 4)
			for i := range p.Layers {
				p.Layers[i] = BeadLayer{ID: fmt.Sprintf("layer-%d", i), Name: fmt.Sprintf("图层 %d", i), Visible: true, IncludeInUsage: true, Opacity: 1, Cells: cloneBeadCells(p.Cells)}
			}
			p.ActiveLayerID = p.Layers[0].ID
		}, want: "5 MiB"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			input := cloneBeadProject(base)
			tc.mutate(&input)
			_, err := svc.Create(identity, &input)
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("Create() error = %v, want contains %q", err, tc.want)
			}
		})
	}
}

func TestBeadProjectServiceEnforcesThirtyProjectLimit(t *testing.T) {
	svc := NewBeadProjectService(newTestStorageBackend(t))
	identity := Identity{ID: "user-1"}
	for i := 0; i < BeadProjectMaxCount; i++ {
		if _, err := svc.Create(identity, nil); err != nil {
			t.Fatalf("Create(%d) error = %v", i, err)
		}
	}
	if _, err := svc.Create(identity, nil); err == nil || !strings.Contains(err.Error(), "30") {
		t.Fatalf("31st Create() error = %v", err)
	}
}

func TestBeadProjectServiceRollsBackWhenIndexSaveFails(t *testing.T) {
	backend := newTestStorageBackend(t)
	base := backend.(storage.JSONDocumentBackend)
	identity := Identity{ID: "user-1"}
	probe := NewBeadProjectService(backend)
	failing := &beadProjectFailingBackend{Backend: backend, JSONDocumentBackend: base, failName: probe.indexDocumentName(identity)}
	svc := NewBeadProjectService(failing)

	if _, err := svc.Create(identity, nil); err == nil {
		t.Fatal("Create() succeeded, want forced index failure")
	}
	value, err := base.LoadJSONDocument(probe.indexDocumentName(identity))
	if err != nil || value != nil {
		t.Fatalf("index after failed create = %#v err=%v", value, err)
	}
	if len(failing.deletedNames) != 1 || !strings.HasPrefix(failing.deletedNames[0], "bead-projects/") || !strings.HasSuffix(failing.deletedNames[0], ".json") {
		t.Fatalf("rollback deletes = %#v", failing.deletedNames)
	}
}

type beadProjectFailingBackend struct {
	storage.Backend
	storage.JSONDocumentBackend
	failName     string
	deletedNames []string
}

func (s *beadProjectFailingBackend) SaveJSONDocument(name string, value any) error {
	if name == s.failName {
		return fmt.Errorf("forced save failure")
	}
	return s.JSONDocumentBackend.SaveJSONDocument(name, value)
}

func (s *beadProjectFailingBackend) DeleteJSONDocument(name string) error {
	s.deletedNames = append(s.deletedNames, name)
	return s.JSONDocumentBackend.DeleteJSONDocument(name)
}
