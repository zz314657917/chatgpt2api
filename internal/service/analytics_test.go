package service

import (
	"testing"
	"time"

	"chatgpt2api/internal/util"
)

func TestAnalyticsServiceAggregatesPageEvents(t *testing.T) {
	svc := NewAnalyticsService(newTestStorageBackend(t))
	identity := Identity{ID: "user-1", Role: AuthRoleUser, Provider: AuthProviderLocal}
	day := time.Now().Format("2006-01-02")

	result, err := svc.Record(identity, []AnalyticsEvent{
		{Type: AnalyticsEventPageView, Path: "/image", OccurredAt: day + "T09:00:00Z"},
		{Type: AnalyticsEventPageClick, Path: "/image", Count: 3, OccurredAt: day + "T09:01:00Z"},
		{Type: AnalyticsEventPageStay, Path: "/image", DurationMS: 65000, OccurredAt: day + "T09:02:00Z"},
		{Type: "bad", Path: "/image"},
		{Type: AnalyticsEventPageView, Path: "/unknown"},
	})
	if err != nil {
		t.Fatalf("Record() error = %v", err)
	}
	if result.Recorded != 3 || result.Ignored != 2 {
		t.Fatalf("Record() result = %#v", result)
	}

	overview := svc.Overview(7)
	if got := util.ToInt(overview.Today["page_views"], 0); got != 1 {
		t.Fatalf("today page_views = %d", got)
	}
	if got := util.ToInt(overview.Today["page_clicks"], 0); got != 3 {
		t.Fatalf("today page_clicks = %d", got)
	}
	if got := util.ToInt(overview.Today["active_seconds"], 0); got != 65 {
		t.Fatalf("today active_seconds = %d", got)
	}
	if got := util.ToInt(overview.Today["unique_user_count"], 0); got != 1 {
		t.Fatalf("today unique_user_count = %d", got)
	}
	if len(overview.Pages) != 1 {
		t.Fatalf("pages length = %d, pages = %#v", len(overview.Pages), overview.Pages)
	}
	page := overview.Pages[0]
	if page["path"] != "/image" || page["label"] != "创作台" {
		t.Fatalf("unexpected page = %#v", page)
	}
}

func TestAnalyticsServiceCountsUniqueUserOncePerDayPage(t *testing.T) {
	svc := NewAnalyticsService(newTestStorageBackend(t))
	identity := Identity{ID: "user-1", Role: AuthRoleUser, Provider: AuthProviderLocal}
	other := Identity{ID: "user-2", Role: AuthRoleUser, Provider: AuthProviderLocal}

	if _, err := svc.Record(identity, []AnalyticsEvent{
		{Type: AnalyticsEventPageView, Path: "/canvas"},
		{Type: AnalyticsEventPageClick, Path: "/canvas"},
	}); err != nil {
		t.Fatalf("Record(identity) error = %v", err)
	}
	if _, err := svc.Record(other, []AnalyticsEvent{{Type: AnalyticsEventPageView, Path: "/canvas"}}); err != nil {
		t.Fatalf("Record(other) error = %v", err)
	}

	overview := svc.Overview(7)
	if got := util.ToInt(overview.Today["unique_user_count"], 0); got != 2 {
		t.Fatalf("today unique_user_count = %d", got)
	}
	if len(overview.Pages) != 1 {
		t.Fatalf("pages length = %d", len(overview.Pages))
	}
	if got := util.ToInt(overview.Pages[0]["unique_user_count"], 0); got != 2 {
		t.Fatalf("page unique_user_count = %d", got)
	}
}
