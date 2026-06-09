package httpapi

import (
	"net/http"
	"time"

	"chatgpt2api/internal/service"
	"chatgpt2api/internal/util"
)

func (a *App) handleTeams(w http.ResponseWriter, r *http.Request) {
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	if identity.Role != service.AuthRoleUser {
		util.WriteError(w, http.StatusForbidden, "user session is required")
		return
	}
	parts := splitPath(r.URL.Path)
	if r.URL.Path == "/api/teams" {
		switch r.Method {
		case http.MethodGet:
			util.WriteJSON(w, http.StatusOK, a.teamWorkspaceResponse(identity))
		case http.MethodPost:
			body, err := readJSONMap(r)
			if err != nil {
				util.WriteError(w, http.StatusBadRequest, "invalid json body")
				return
			}
			team, err := a.teams.Create(identity, util.Clean(body["name"]))
			if err != nil {
				util.WriteError(w, http.StatusBadRequest, err.Error())
				return
			}
			util.WriteJSON(w, http.StatusOK, map[string]any{"team": team, "teams": a.teamWorkspaceTeams(identity)})
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
		return
	}
	if r.URL.Path == "/api/teams/join" && r.Method == http.MethodPost {
		util.WriteError(w, http.StatusGone, "open team join is disabled; invite is required")
		return
	}
	if r.URL.Path == "/api/teams/current" && r.Method == http.MethodPost {
		body, err := readJSONMap(r)
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, "invalid json body")
			return
		}
		current, err := a.teams.SwitchSpace(identity, util.Clean(body["team_id"]))
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		util.WriteJSON(w, http.StatusOK, a.attachTeamUsageSummaries(identity, current))
		return
	}
	if len(parts) == 4 && parts[0] == "api" && parts[1] == "teams" && parts[3] == "invites" {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		body, err := readJSONMap(r)
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, "invalid json body")
			return
		}
		invite, err := a.teams.CreateInvite(identity, parts[2], util.Clean(body["email"]), util.Clean(body["role"]))
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		util.WriteJSON(w, http.StatusOK, map[string]any{"invite": invite, "teams": a.teamWorkspaceTeams(identity)})
		return
	}
	if len(parts) == 5 && parts[0] == "api" && parts[1] == "teams" && parts[3] == "members" {
		switch r.Method {
		case http.MethodDelete:
			team, err := a.teams.RemoveMember(identity, parts[2], parts[4])
			if err != nil {
				util.WriteError(w, http.StatusBadRequest, err.Error())
				return
			}
			util.WriteJSON(w, http.StatusOK, map[string]any{"team": team, "teams": a.teamWorkspaceTeams(identity)})
		case http.MethodPatch:
			body, err := readJSONMap(r)
			if err != nil {
				util.WriteError(w, http.StatusBadRequest, "invalid json body")
				return
			}
			var team map[string]any
			if _, ok := body["daily_limit_amount"]; ok {
				team, err = a.teams.UpdateMemberDailyLimit(identity, parts[2], parts[4], util.ToInt(body["daily_limit_amount"], 0))
			} else {
				team, err = a.teams.UpdateMemberRole(identity, parts[2], parts[4], util.Clean(body["role"]))
			}
			if err != nil {
				util.WriteError(w, http.StatusBadRequest, err.Error())
				return
			}
			util.WriteJSON(w, http.StatusOK, map[string]any{"team": team, "teams": a.teamWorkspaceTeams(identity)})
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
		return
	}
	if len(parts) == 4 && parts[0] == "api" && parts[1] == "teams" && parts[3] == "audit-logs" {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		items, err := a.teams.ListAuditLogs(identity, parts[2], util.ToInt(r.URL.Query().Get("limit"), 100))
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		util.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
		return
	}
	if len(parts) == 4 && parts[0] == "api" && parts[1] == "teams" && parts[3] == "usage" {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		actorFilter, err := a.teams.UsageActorFilter(identity, parts[2])
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		result := a.tasks.ListTeamTasks(identity, parts[2], actorFilter, util.ToInt(r.URL.Query().Get("limit"), 100))
		names, err := a.teams.MemberNameMap(identity, parts[2])
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		for _, item := range util.AsMapSlice(result["items"]) {
			if util.Clean(item["actor_name"]) != "" {
				continue
			}
			if name := names[util.Clean(item["actor_user_id"])]; name != "" {
				item["actor_name"] = name
			}
		}
		util.WriteJSON(w, http.StatusOK, result)
		return
	}
	http.NotFound(w, r)
}

func (a *App) handleTeamInvites(w http.ResponseWriter, r *http.Request) {
	identity, ok := a.requireIdentity(w, r, "")
	if !ok {
		return
	}
	if identity.Role != service.AuthRoleUser {
		util.WriteError(w, http.StatusForbidden, "user session is required")
		return
	}
	parts := splitPath(r.URL.Path)
	if len(parts) == 4 && parts[0] == "api" && parts[1] == "team-invites" && parts[3] == "accept" {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		team, err := a.teams.AcceptInvite(identity, parts[2])
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		util.WriteJSON(w, http.StatusOK, map[string]any{"team": team, "teams": a.teamWorkspaceTeams(identity)})
		return
	}
	if len(parts) == 3 && parts[0] == "api" && parts[1] == "team-invites" {
		if r.Method != http.MethodDelete {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		invite, err := a.teams.RevokeInvite(identity, parts[2])
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		util.WriteJSON(w, http.StatusOK, map[string]any{"invite": invite, "teams": a.teamWorkspaceTeams(identity)})
		return
	}
	http.NotFound(w, r)
}

func (a *App) teamWorkspaceResponse(identity service.Identity) map[string]any {
	return a.attachTeamUsageSummaries(identity, a.teams.ListForIdentity(identity))
}

func (a *App) teamWorkspaceTeams(identity service.Identity) []map[string]any {
	return util.AsMapSlice(a.teamWorkspaceResponse(identity)["teams"])
}

func (a *App) attachTeamUsageSummaries(identity service.Identity, workspace map[string]any) map[string]any {
	if a == nil || a.tasks == nil || a.teams == nil || workspace == nil {
		return workspace
	}
	actor := firstNonEmpty(util.Clean(identity.OwnerID), util.Clean(identity.ID))
	now := time.Now()
	for _, team := range util.AsMapSlice(workspace["teams"]) {
		teamID := util.Clean(team["id"])
		if teamID == "" || actor == "" {
			continue
		}
		limit := a.teams.MemberDailyLimitAmount(teamID, actor)
		used := a.tasks.TeamActorDailyUsageAmount(teamID, actor, now)
		summary := map[string]any{
			"limit_amount":     limit,
			"used_amount":      used,
			"remaining_amount": 0,
			"unlimited":        limit <= 0,
		}
		if limit > 0 {
			summary["remaining_amount"] = max(0, limit-used)
		}
		team["my_daily_limit"] = summary
		if a.images != nil {
			limitBytes := service.DefaultTeamStorageLimitBytes
			if value := util.ToInt(team["storage_limit_bytes"], 0); value > 0 {
				limitBytes = int64(value)
			}
			team["storage"] = a.images.TeamStorageSummary(teamID, limitBytes)
		}
	}
	return workspace
}
