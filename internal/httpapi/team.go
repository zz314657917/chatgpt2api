package httpapi

import (
	"net/http"

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
			util.WriteJSON(w, http.StatusOK, a.teams.ListForIdentity(identity))
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
			util.WriteJSON(w, http.StatusOK, map[string]any{"team": team, "teams": a.teams.ListForIdentity(identity)})
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
		return
	}
	if r.URL.Path == "/api/teams/join" && r.Method == http.MethodPost {
		body, err := readJSONMap(r)
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, "invalid json body")
			return
		}
		team, err := a.teams.JoinByInvite(identity, util.Clean(body["invite_code"]))
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		util.WriteJSON(w, http.StatusOK, map[string]any{"team": team, "teams": a.teams.ListForIdentity(identity)})
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
		util.WriteJSON(w, http.StatusOK, current)
		return
	}
	if len(parts) == 5 && parts[0] == "api" && parts[1] == "teams" && parts[3] == "invite" && parts[4] == "close" {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		team, err := a.teams.DisableInvite(identity, parts[2])
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		util.WriteJSON(w, http.StatusOK, map[string]any{"team": team})
		return
	}
	if len(parts) == 5 && parts[0] == "api" && parts[1] == "teams" && parts[3] == "members" {
		if r.Method != http.MethodDelete {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		team, err := a.teams.RemoveMember(identity, parts[2], parts[4])
		if err != nil {
			util.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		util.WriteJSON(w, http.StatusOK, map[string]any{"team": team})
		return
	}
	http.NotFound(w, r)
}
