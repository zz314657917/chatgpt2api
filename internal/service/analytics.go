package service

import (
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

const (
	AnalyticsEventPageView  = "page_view"
	AnalyticsEventPageClick = "page_click"
	AnalyticsEventPageStay  = "page_stay"

	analyticsDocumentName     = "usage_analytics.json"
	analyticsRetentionDays    = 90
	defaultAnalyticsRangeDays = 7
	maxAnalyticsBatchSize     = 50
	maxAnalyticsEventCount    = 500
	maxAnalyticsStayMS        = 30 * 60 * 1000
)

var analyticsAllowedPaths = map[string]string{
	"/image":           "创作台",
	"/canvas":          "无限画布",
	"/ecommerce-suite": "电商套图",
	"/social":          "社媒运营",
	"/image-manager":   "素材库",
	"/team":            "团队空间",
	"/profile":         "个人中心",
}

type AnalyticsEvent struct {
	Type       string
	Path       string
	OccurredAt string
	DurationMS int
	Count      int
}

type AnalyticsService struct {
	mu    sync.Mutex
	store storage.JSONDocumentBackend
	days  map[string]*analyticsDay
}

type analyticsDay struct {
	Date  string                    `json:"date"`
	Pages map[string]*analyticsPage `json:"pages"`
}

type analyticsPage struct {
	Path        string          `json:"path"`
	Views       int             `json:"views"`
	Clicks      int             `json:"clicks"`
	StayMS      int64           `json:"stay_ms"`
	UniqueUsers map[string]bool `json:"unique_users,omitempty"`
}

type AnalyticsRecordResult struct {
	Recorded int `json:"recorded"`
	Ignored  int `json:"ignored"`
}

type AnalyticsOverview struct {
	Today     map[string]any   `json:"today"`
	Last7Days []map[string]any `json:"last_7_days"`
	Pages     []map[string]any `json:"pages"`
}

func NewAnalyticsService(backend storage.Backend) *AnalyticsService {
	s := &AnalyticsService{
		store: jsonDocumentStoreFromBackend(backend),
		days:  map[string]*analyticsDay{},
	}
	s.mu.Lock()
	s.days = s.loadLocked()
	s.mu.Unlock()
	return s
}

func (s *AnalyticsService) Record(identity Identity, events []AnalyticsEvent) (AnalyticsRecordResult, error) {
	result := AnalyticsRecordResult{}
	if s == nil {
		result.Ignored = len(events)
		return result, nil
	}
	if len(events) > maxAnalyticsBatchSize {
		events = events[:maxAnalyticsBatchSize]
	}
	actorHash := analyticsIdentityHash(identity)
	now := time.Now()
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.days == nil {
		s.days = map[string]*analyticsDay{}
	}
	for _, event := range events {
		event = normalizeAnalyticsEvent(event, now)
		if event.Type == "" || event.Path == "" {
			result.Ignored++
			continue
		}
		day := analyticsDayForTime(event.OccurredAt, now)
		if day == "" {
			result.Ignored++
			continue
		}
		item := s.dayLocked(day).pageLocked(event.Path)
		count := event.Count
		if count <= 0 {
			count = 1
		}
		if count > maxAnalyticsEventCount {
			count = maxAnalyticsEventCount
		}
		switch event.Type {
		case AnalyticsEventPageView:
			item.Views += count
		case AnalyticsEventPageClick:
			item.Clicks += count
		case AnalyticsEventPageStay:
			item.StayMS += int64(clampAnalyticsStayMS(event.DurationMS) * count)
		default:
			result.Ignored++
			continue
		}
		if actorHash != "" {
			if item.UniqueUsers == nil {
				item.UniqueUsers = map[string]bool{}
			}
			item.UniqueUsers[actorHash] = true
		}
		result.Recorded++
	}
	s.cleanupLocked(now)
	if result.Recorded > 0 {
		return result, s.saveLocked()
	}
	return result, nil
}

func (s *AnalyticsService) Overview(days int) AnalyticsOverview {
	if days <= 0 {
		days = defaultAnalyticsRangeDays
	}
	if days > analyticsRetentionDays {
		days = analyticsRetentionDays
	}
	now := time.Now()
	dates := analyticsDateRange(now, days)
	s.mu.Lock()
	defer s.mu.Unlock()
	summaryByDay := make([]map[string]any, 0, len(dates))
	pageTotals := map[string]*analyticsPageTotals{}
	for _, date := range dates {
		day := s.days[date]
		daySummary := newAnalyticsMetricSummary()
		if day != nil {
			for path, page := range day.Pages {
				addAnalyticsPageToSummary(daySummary, page)
				total := pageTotals[path]
				if total == nil {
					total = &analyticsPageTotals{Path: path, Label: analyticsPathLabel(path), Users: map[string]bool{}}
					pageTotals[path] = total
				}
				total.Views += page.Views
				total.Clicks += page.Clicks
				total.StayMS += page.StayMS
				for hash := range page.UniqueUsers {
					total.Users[hash] = true
				}
			}
		}
		delete(daySummary, "_unique_user_set")
		daySummary["date"] = date
		summaryByDay = append(summaryByDay, daySummary)
	}
	today := map[string]any{"date": now.Format("2006-01-02")}
	if len(summaryByDay) > 0 {
		today = util.CopyMap(summaryByDay[len(summaryByDay)-1])
	}
	pages := analyticsPageTotalsList(pageTotals)
	return AnalyticsOverview{Today: today, Last7Days: summaryByDay, Pages: pages}
}

func (s *AnalyticsService) dayLocked(day string) *analyticsDay {
	item := s.days[day]
	if item == nil {
		item = &analyticsDay{Date: day, Pages: map[string]*analyticsPage{}}
		s.days[day] = item
	}
	if item.Pages == nil {
		item.Pages = map[string]*analyticsPage{}
	}
	return item
}

func (d *analyticsDay) pageLocked(path string) *analyticsPage {
	item := d.Pages[path]
	if item == nil {
		item = &analyticsPage{Path: path, UniqueUsers: map[string]bool{}}
		d.Pages[path] = item
	}
	if item.UniqueUsers == nil {
		item.UniqueUsers = map[string]bool{}
	}
	return item
}

func (s *AnalyticsService) cleanupLocked(now time.Time) {
	cutoff := now.AddDate(0, 0, -analyticsRetentionDays+1).Format("2006-01-02")
	for day := range s.days {
		if day < cutoff {
			delete(s.days, day)
		}
	}
}

func (s *AnalyticsService) loadLocked() map[string]*analyticsDay {
	out := map[string]*analyticsDay{}
	raw := loadStoredJSON(s.store, analyticsDocumentName)
	doc, _ := raw.(map[string]any)
	for day, value := range util.StringMap(doc["days"]) {
		day = strings.TrimSpace(day)
		if day == "" {
			continue
		}
		item := normalizeStoredAnalyticsDay(day, value)
		if item != nil {
			out[day] = item
		}
	}
	return out
}

func (s *AnalyticsService) saveLocked() error {
	days := map[string]any{}
	keys := make([]string, 0, len(s.days))
	for key := range s.days {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		days[key] = storedAnalyticsDay(s.days[key])
	}
	return saveStoredJSON(s.store, analyticsDocumentName, map[string]any{
		"days":       days,
		"updated_at": util.NowISO(),
	})
}

func normalizeAnalyticsEvent(event AnalyticsEvent, now time.Time) AnalyticsEvent {
	event.Type = strings.TrimSpace(event.Type)
	event.Path = normalizeAnalyticsPath(event.Path)
	event.OccurredAt = strings.TrimSpace(event.OccurredAt)
	if event.OccurredAt == "" {
		event.OccurredAt = now.Format(time.RFC3339Nano)
	}
	switch event.Type {
	case AnalyticsEventPageView, AnalyticsEventPageClick, AnalyticsEventPageStay:
	default:
		event.Type = ""
	}
	return event
}

func normalizeAnalyticsPath(raw string) string {
	path := strings.TrimSpace(raw)
	if path == "" {
		return ""
	}
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	path = strings.TrimRight(path, "/")
	if path == "" {
		path = "/"
	}
	for allowed := range analyticsAllowedPaths {
		if path == allowed || strings.HasPrefix(path, allowed+"/") {
			return allowed
		}
	}
	return ""
}

func analyticsDayForTime(value string, fallback time.Time) string {
	value = strings.TrimSpace(strings.ReplaceAll(value, "T", " "))
	if len(value) >= len("2006-01-02") {
		day := value[:len("2006-01-02")]
		if _, err := time.Parse("2006-01-02", day); err == nil {
			return day
		}
	}
	return fallback.Format("2006-01-02")
}

func analyticsIdentityHash(identity Identity) string {
	identityID := firstNonEmpty(util.Clean(identity.OwnerID), util.Clean(identity.ID), util.Clean(identity.CredentialID))
	if identityID == "" {
		return ""
	}
	return util.SHA256Hex(strings.Join([]string{"analytics", identity.Role, identity.Provider, identityID}, "\x00"))[:24]
}

func clampAnalyticsStayMS(value int) int {
	if value <= 0 {
		return 0
	}
	if value > maxAnalyticsStayMS {
		return maxAnalyticsStayMS
	}
	return value
}

func normalizeStoredAnalyticsDay(day string, value any) *analyticsDay {
	item := &analyticsDay{Date: day, Pages: map[string]*analyticsPage{}}
	for path, rawPage := range util.StringMap(util.StringMap(value)["pages"]) {
		normalizedPath := normalizeAnalyticsPath(path)
		if normalizedPath == "" {
			continue
		}
		pageMap := util.StringMap(rawPage)
		page := &analyticsPage{
			Path:        normalizedPath,
			Views:       max(0, util.ToInt(pageMap["views"], 0)),
			Clicks:      max(0, util.ToInt(pageMap["clicks"], 0)),
			StayMS:      int64(max(0, util.ToInt(pageMap["stay_ms"], 0))),
			UniqueUsers: map[string]bool{},
		}
		for hash, rawSeen := range util.StringMap(pageMap["unique_users"]) {
			hash = strings.TrimSpace(hash)
			if hash != "" && util.ToBool(rawSeen) {
				page.UniqueUsers[hash] = true
			}
		}
		item.Pages[normalizedPath] = page
	}
	return item
}

func storedAnalyticsDay(day *analyticsDay) map[string]any {
	pages := map[string]any{}
	date := ""
	if day != nil {
		date = util.Clean(day.Date)
		for path, page := range day.Pages {
			if page == nil {
				continue
			}
			users := map[string]bool{}
			for hash := range page.UniqueUsers {
				users[hash] = true
			}
			pages[path] = map[string]any{
				"path":         path,
				"views":        page.Views,
				"clicks":       page.Clicks,
				"stay_ms":      page.StayMS,
				"unique_users": users,
			}
		}
	}
	return map[string]any{
		"date":  date,
		"pages": pages,
	}
}

type analyticsPageTotals struct {
	Path   string
	Label  string
	Views  int
	Clicks int
	StayMS int64
	Users  map[string]bool
}

func newAnalyticsMetricSummary() map[string]any {
	return map[string]any{
		"page_views":        0,
		"page_clicks":       0,
		"stay_ms":           int64(0),
		"active_seconds":    int64(0),
		"unique_user_count": 0,
	}
}

func addAnalyticsPageToSummary(summary map[string]any, page *analyticsPage) {
	if summary == nil || page == nil {
		return
	}
	summary["page_views"] = util.ToInt(summary["page_views"], 0) + page.Views
	summary["page_clicks"] = util.ToInt(summary["page_clicks"], 0) + page.Clicks
	stayMS := int64(util.ToInt(summary["stay_ms"], 0)) + page.StayMS
	summary["stay_ms"] = stayMS
	summary["active_seconds"] = stayMS / 1000
	seen, _ := summary["_unique_user_set"].(map[string]bool)
	if seen == nil {
		seen = map[string]bool{}
		summary["_unique_user_set"] = seen
	}
	for hash := range page.UniqueUsers {
		seen[hash] = true
	}
	summary["unique_user_count"] = len(seen)
}

func analyticsPageTotalsList(totals map[string]*analyticsPageTotals) []map[string]any {
	items := make([]map[string]any, 0, len(totals))
	for _, item := range totals {
		if item == nil {
			continue
		}
		items = append(items, map[string]any{
			"path":              item.Path,
			"label":             item.Label,
			"page_views":        item.Views,
			"page_clicks":       item.Clicks,
			"stay_ms":           item.StayMS,
			"active_seconds":    item.StayMS / 1000,
			"unique_user_count": len(item.Users),
		})
	}
	sort.SliceStable(items, func(i, j int) bool {
		leftClicks := util.ToInt(items[i]["page_clicks"], 0)
		rightClicks := util.ToInt(items[j]["page_clicks"], 0)
		if leftClicks != rightClicks {
			return leftClicks > rightClicks
		}
		leftStay := util.ToInt(items[i]["active_seconds"], 0)
		rightStay := util.ToInt(items[j]["active_seconds"], 0)
		if leftStay != rightStay {
			return leftStay > rightStay
		}
		return util.Clean(items[i]["path"]) < util.Clean(items[j]["path"])
	})
	return items
}

func analyticsDateRange(now time.Time, days int) []string {
	if days <= 0 {
		days = defaultAnalyticsRangeDays
	}
	start := now.AddDate(0, 0, -days+1)
	out := make([]string, 0, days)
	for i := 0; i < days; i++ {
		out = append(out, start.AddDate(0, 0, i).Format("2006-01-02"))
	}
	return out
}

func analyticsPathLabel(path string) string {
	if label := analyticsAllowedPaths[path]; label != "" {
		return label
	}
	return path
}

func AnalyticsKnownPageLabels() map[string]string {
	out := make(map[string]string, len(analyticsAllowedPaths))
	for path, label := range analyticsAllowedPaths {
		out[path] = label
	}
	return out
}

func (e AnalyticsEvent) String() string {
	return fmt.Sprintf("%s %s", e.Type, e.Path)
}
