package httpapi

import (
	"encoding/json"
	"net/http"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

type analyticsEventsRequest struct {
	Events []analyticsEventRequest `json:"events"`
}

type analyticsEventRequest struct {
	Type       string `json:"type"`
	Path       string `json:"path"`
	OccurredAt string `json:"occurred_at"`
	DurationMS int    `json:"duration_ms"`
	Count      int    `json:"count"`
}

func (a *App) handleAnalyticsEvents(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	var body analyticsEventsRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		util.WriteError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	events := make([]service.AnalyticsEvent, 0, len(body.Events))
	for _, event := range body.Events {
		events = append(events, service.AnalyticsEvent{
			Type:       event.Type,
			Path:       event.Path,
			OccurredAt: event.OccurredAt,
			DurationMS: event.DurationMS,
			Count:      event.Count,
		})
	}
	result, err := a.analytics.Record(identity, events)
	if err != nil {
		util.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	util.WriteJSON(w, http.StatusOK, result)
}

func (a *App) handleAdminUsageOverview(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	if identity.Role != service.AuthRoleAdmin {
		util.WriteError(w, http.StatusForbidden, "admin permission required")
		return
	}
	days := util.ToInt(r.URL.Query().Get("days"), 7)
	if days <= 0 {
		days = 7
	}
	if days > 90 {
		days = 90
	}
	analytics := a.analytics.Overview(days)
	tasks := a.tasks.UsageOverview(days)
	util.WriteJSON(w, http.StatusOK, map[string]any{
		"today":            mergeUsageOverviewMaps(tasks.Today, analytics.Today),
		"last_7_days":      mergeUsageOverviewDays(tasks.Last7Days, analytics.Last7Days),
		"pages":            analytics.Pages,
		"task_modes":       tasks.TaskModes,
		"recent_task_logs": tasks.RecentTaskLogs,
	})
}

func mergeUsageOverviewDays(left, right []map[string]any) []map[string]any {
	byDate := map[string]map[string]any{}
	order := make([]string, 0, len(left)+len(right))
	add := func(items []map[string]any) {
		for _, item := range items {
			date := util.Clean(item["date"])
			if date == "" {
				continue
			}
			if _, ok := byDate[date]; !ok {
				byDate[date] = map[string]any{"date": date}
				order = append(order, date)
			}
			byDate[date] = mergeUsageOverviewMaps(byDate[date], item)
		}
	}
	add(left)
	add(right)
	out := make([]map[string]any, 0, len(order))
	for _, date := range order {
		out = append(out, byDate[date])
	}
	return out
}

func mergeUsageOverviewMaps(left, right map[string]any) map[string]any {
	out := map[string]any{}
	for key, value := range left {
		out[key] = value
	}
	for key, value := range right {
		out[key] = value
	}
	return out
}
