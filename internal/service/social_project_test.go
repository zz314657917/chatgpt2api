package service

import "testing"

func TestSocialProjectServiceCreateSaveListDelete(t *testing.T) {
	backend := newTestStorageBackend(t)
	svc := NewSocialProjectService(backend)
	identity := Identity{ID: "user-1", Role: AuthRoleUser, OwnerID: "owner-1"}

	created, err := svc.CreateProject(identity, SocialProject{
		Platform:   SocialPlatformXHS,
		Topic:      "新品发布",
		SourceText: "素材正文",
		Tags:       []string{"#AI", "运营"},
		Cards: []SocialCard{{
			Title:      "封面",
			Body:       "核心卖点",
			VisualMode: SocialCardVisualAI,
		}},
	})
	if err != nil {
		t.Fatalf("CreateProject() error = %v", err)
	}
	if created.ID == "" || created.OwnerID != "owner-1" || created.Platform != SocialPlatformXHS || created.Status != SocialProjectStatusDraft {
		t.Fatalf("CreateProject() = %#v", created)
	}
	if len(created.Tags) != 2 || created.Tags[0] != "AI" {
		t.Fatalf("CreateProject() tags = %#v", created.Tags)
	}

	saved, err := svc.SaveProject(identity, created.ID, SocialProject{
		Platform: SocialPlatformXHS,
		Status:   SocialProjectStatusCopyReady,
		Topic:    "新品发布更新",
		Title:    "标题",
		Cards: []SocialCard{{
			ID:    "cover",
			Title: "更新封面",
			Body:  "更新内容",
		}},
	})
	if err != nil {
		t.Fatalf("SaveProject() error = %v", err)
	}
	if saved.CreatedAt != created.CreatedAt || saved.UpdatedAt == created.UpdatedAt || saved.Status != SocialProjectStatusCopyReady {
		t.Fatalf("SaveProject() timestamps/status = %#v", saved)
	}

	list := svc.ListProjects(identity)
	if len(list) != 1 || list[0].ID != created.ID || list[0].Topic != "新品发布更新" {
		t.Fatalf("ListProjects() = %#v", list)
	}

	reloaded := NewSocialProjectService(backend)
	got, ok := reloaded.GetProject(identity, created.ID)
	if !ok || got.Title != "标题" {
		t.Fatalf("GetProject() after reload = %#v found=%v", got, ok)
	}

	if err := reloaded.DeleteProject(identity, created.ID); err != nil {
		t.Fatalf("DeleteProject() error = %v", err)
	}
	if items := reloaded.ListProjects(identity); len(items) != 0 {
		t.Fatalf("ListProjects() after delete = %#v", items)
	}
}

func TestSocialProjectServiceOwnerIsolation(t *testing.T) {
	svc := NewSocialProjectService(newTestStorageBackend(t))
	alice := Identity{ID: "alice", Role: AuthRoleUser, OwnerID: "owner-alice"}
	bob := Identity{ID: "bob", Role: AuthRoleUser, OwnerID: "owner-bob"}

	created, err := svc.CreateProject(alice, SocialProject{Platform: SocialPlatformXHS, Topic: "Alice"})
	if err != nil {
		t.Fatalf("CreateProject() error = %v", err)
	}
	if _, ok := svc.GetProject(bob, created.ID); ok {
		t.Fatal("GetProject() should not cross owner boundary")
	}
	if err := svc.DeleteProject(bob, created.ID); err == nil {
		t.Fatal("DeleteProject() should not cross owner boundary")
	}
}

func TestSocialProjectServiceRejectsInvalidPlatform(t *testing.T) {
	svc := NewSocialProjectService(newTestStorageBackend(t))
	_, err := svc.CreateProject(Identity{ID: "user", Role: AuthRoleUser, OwnerID: "owner"}, SocialProject{
		Platform: "weibo",
		Topic:    "invalid",
	})
	if err == nil {
		t.Fatal("CreateProject() should reject unsupported platform")
	}
}
