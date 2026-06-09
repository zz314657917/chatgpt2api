package service

import (
	"fmt"
	"sort"
	"strings"
	"sync"

	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

const teamsDocumentName = "teams.json"

type TeamService struct {
	mu      sync.Mutex
	store   storage.JSONDocumentBackend
	teams   map[string]map[string]any
	current map[string]string
}

type TeamTaskContext struct {
	TeamID      string
	PayerUserID string
	ActorUserID string
}

func NewTeamService(backend storage.Backend) *TeamService {
	s := &TeamService{store: jsonDocumentStoreFromBackend(backend), teams: map[string]map[string]any{}, current: map[string]string{}}
	s.mu.Lock()
	s.loadLocked()
	s.mu.Unlock()
	return s
}

func (s *TeamService) ListForIdentity(identity Identity) map[string]any {
	actor := teamActorID(identity)
	s.mu.Lock()
	defer s.mu.Unlock()
	currentID := util.Clean(s.current[actor])
	items := make([]map[string]any, 0)
	for _, team := range s.teams {
		if teamMember(team, actor) == nil {
			continue
		}
		items = append(items, publicTeamForActor(team, actor))
	}
	sort.SliceStable(items, func(i, j int) bool {
		return util.Clean(items[i]["updated_at"]) > util.Clean(items[j]["updated_at"])
	})
	if currentID != "" && teamMember(s.teams[currentID], actor) == nil {
		currentID = ""
	}
	return teamWorkspaceState(items, currentID)
}

func (s *TeamService) SwitchSpace(identity Identity, teamID string) (map[string]any, error) {
	actor := teamActorID(identity)
	if actor == "" {
		return nil, fmt.Errorf("user session is required")
	}
	teamID = util.Clean(teamID)
	s.mu.Lock()
	defer s.mu.Unlock()
	if teamID == "" {
		delete(s.current, actor)
		if err := s.saveLocked(); err != nil {
			return nil, err
		}
		return teamWorkspaceState(nil, ""), nil
	}
	if teamMember(s.teams[teamID], actor) == nil {
		return nil, fmt.Errorf("team not found")
	}
	s.current[actor] = teamID
	if err := s.saveLocked(); err != nil {
		return nil, err
	}
	return teamWorkspaceState(nil, teamID), nil
}

func (s *TeamService) Create(identity Identity, name string) (map[string]any, error) {
	actor := teamActorID(identity)
	if actor == "" {
		return nil, fmt.Errorf("user session is required")
	}
	name = strings.TrimSpace(name)
	if name == "" {
		name = identity.Name + "的团队"
	}
	now := util.NowISO()
	team := map[string]any{
		"id":             "team_" + util.NewHex(14),
		"name":           name,
		"owner_user_id":  actor,
		"invite_enabled": true,
		"invite_code":    util.RandomTokenURL(10),
		"members":        []map[string]any{teamMemberRecord(identity, "owner", now)},
		"created_at":     now,
		"updated_at":     now,
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.teams[util.Clean(team["id"])] = team
	if err := s.saveLocked(); err != nil {
		return nil, err
	}
	return publicTeamForActor(team, actor), nil
}

func (s *TeamService) JoinByInvite(identity Identity, code string) (map[string]any, error) {
	actor := teamActorID(identity)
	if actor == "" {
		return nil, fmt.Errorf("user session is required")
	}
	code = strings.TrimSpace(code)
	if code == "" {
		return nil, fmt.Errorf("invite code is required")
	}
	now := util.NowISO()
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, team := range s.teams {
		if !util.ToBool(team["invite_enabled"]) || util.Clean(team["invite_code"]) != code {
			continue
		}
		if existing := teamMember(team, actor); existing != nil {
			return publicTeamForActor(team, actor), nil
		}
		members := util.AsMapSlice(team["members"])
		members = append(members, teamMemberRecord(identity, "member", now))
		team["members"] = members
		team["updated_at"] = now
		if err := s.saveLocked(); err != nil {
			return nil, err
		}
		return publicTeamForActor(team, actor), nil
	}
	return nil, fmt.Errorf("invite code is invalid")
}

func (s *TeamService) DisableInvite(identity Identity, teamID string) (map[string]any, error) {
	actor := teamActorID(identity)
	teamID = util.Clean(teamID)
	s.mu.Lock()
	defer s.mu.Unlock()
	team, err := s.requireTeamOwnerLocked(teamID, actor)
	if err != nil {
		return nil, err
	}
	team["invite_enabled"] = false
	team["invite_code"] = ""
	team["updated_at"] = util.NowISO()
	if err := s.saveLocked(); err != nil {
		return nil, err
	}
	return publicTeamForActor(team, actor), nil
}

func (s *TeamService) RemoveMember(identity Identity, teamID, memberUserID string) (map[string]any, error) {
	actor := teamActorID(identity)
	teamID = util.Clean(teamID)
	memberUserID = util.Clean(memberUserID)
	if memberUserID == "" {
		return nil, fmt.Errorf("member user id is required")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	team, err := s.requireTeamOwnerLocked(teamID, actor)
	if err != nil {
		return nil, err
	}
	if memberUserID == util.Clean(team["owner_user_id"]) {
		return nil, fmt.Errorf("team owner cannot be removed")
	}
	members := util.AsMapSlice(team["members"])
	next := make([]map[string]any, 0, len(members))
	removed := false
	for _, member := range members {
		if util.Clean(member["user_id"]) == memberUserID {
			removed = true
			continue
		}
		next = append(next, member)
	}
	if !removed {
		return nil, fmt.Errorf("team member not found")
	}
	team["members"] = next
	team["updated_at"] = util.NowISO()
	if err := s.saveLocked(); err != nil {
		return nil, err
	}
	return publicTeamForActor(team, actor), nil
}

func (s *TeamService) TaskContext(identity Identity, teamID string) (TeamTaskContext, error) {
	actor := teamActorID(identity)
	if actor == "" {
		return TeamTaskContext{}, fmt.Errorf("user session is required")
	}
	teamID = util.Clean(teamID)
	if teamID == "" {
		return TeamTaskContext{PayerUserID: actor, ActorUserID: actor}, nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	team := s.teams[teamID]
	if team == nil || teamMember(team, actor) == nil {
		return TeamTaskContext{}, fmt.Errorf("team not found")
	}
	owner := util.Clean(team["owner_user_id"])
	if owner == "" {
		return TeamTaskContext{}, fmt.Errorf("team owner is missing")
	}
	return TeamTaskContext{TeamID: teamID, PayerUserID: owner, ActorUserID: actor}, nil
}

func (s *TeamService) requireTeamOwnerLocked(teamID, actor string) (map[string]any, error) {
	if teamID == "" {
		return nil, fmt.Errorf("team id is required")
	}
	team := s.teams[teamID]
	if team == nil {
		return nil, fmt.Errorf("team not found")
	}
	if util.Clean(team["owner_user_id"]) != actor {
		return nil, fmt.Errorf("team owner permission required")
	}
	return team, nil
}

func (s *TeamService) loadLocked() {
	raw := loadStoredJSON(s.store, teamsDocumentName)
	current := map[string]string{}
	if obj, ok := raw.(map[string]any); ok {
		for userID, value := range util.StringMap(obj["current"]) {
			if cleaned := util.Clean(value); cleaned != "" {
				current[util.Clean(userID)] = cleaned
			}
		}
		raw = obj["teams"]
	}
	out := map[string]map[string]any{}
	for _, item := range util.AsMapSlice(raw) {
		id := util.Clean(item["id"])
		owner := util.Clean(item["owner_user_id"])
		if id == "" || owner == "" {
			continue
		}
		team := util.CopyMap(item)
		team["id"] = id
		team["owner_user_id"] = owner
		team["name"] = firstNonEmpty(util.Clean(team["name"]), "团队")
		team["members"] = normalizeTeamMembers(team["members"])
		team["created_at"] = firstNonEmpty(util.Clean(team["created_at"]), util.NowISO())
		team["updated_at"] = firstNonEmpty(util.Clean(team["updated_at"]), util.Clean(team["created_at"]))
		out[id] = team
	}
	s.teams = out
	s.current = current
}

func (s *TeamService) saveLocked() error {
	items := make([]map[string]any, 0, len(s.teams))
	for _, team := range s.teams {
		items = append(items, util.CopyMap(team))
	}
	sort.SliceStable(items, func(i, j int) bool {
		return util.Clean(items[i]["updated_at"]) > util.Clean(items[j]["updated_at"])
	})
	current := map[string]any{}
	for userID, teamID := range s.current {
		if userID != "" && teamID != "" && s.teams[teamID] != nil {
			current[userID] = teamID
		}
	}
	return saveStoredJSON(s.store, teamsDocumentName, map[string]any{"teams": items, "current": current})
}

func teamActorID(identity Identity) string {
	if identity.Role != AuthRoleUser {
		return ""
	}
	if owner := util.Clean(identity.OwnerID); owner != "" {
		return owner
	}
	return util.Clean(identity.ID)
}

func teamMemberRecord(identity Identity, role, now string) map[string]any {
	return map[string]any{
		"user_id":   teamActorID(identity),
		"name":      firstNonEmpty(identity.Name, identity.CredentialName, teamActorID(identity)),
		"role":      role,
		"joined_at": now,
	}
}

func normalizeTeamMembers(raw any) []map[string]any {
	members := util.AsMapSlice(raw)
	out := make([]map[string]any, 0, len(members))
	seen := map[string]struct{}{}
	for _, member := range members {
		userID := util.Clean(member["user_id"])
		if userID == "" {
			continue
		}
		if _, ok := seen[userID]; ok {
			continue
		}
		seen[userID] = struct{}{}
		out = append(out, map[string]any{
			"user_id":   userID,
			"name":      firstNonEmpty(util.Clean(member["name"]), userID),
			"role":      firstNonEmpty(util.Clean(member["role"]), "member"),
			"joined_at": util.Clean(member["joined_at"]),
		})
	}
	return out
}

func teamMember(team map[string]any, userID string) map[string]any {
	if team == nil || userID == "" {
		return nil
	}
	for _, member := range util.AsMapSlice(team["members"]) {
		if util.Clean(member["user_id"]) == userID {
			return member
		}
	}
	return nil
}

func publicTeamForActor(team map[string]any, actor string) map[string]any {
	out := map[string]any{
		"id":             util.Clean(team["id"]),
		"name":           util.Clean(team["name"]),
		"owner_user_id":  util.Clean(team["owner_user_id"]),
		"invite_enabled": util.ToBool(team["invite_enabled"]),
		"created_at":     team["created_at"],
		"updated_at":     team["updated_at"],
		"members":        cloneTeamMembers(util.AsMapSlice(team["members"])),
		"member_role":    "",
	}
	if util.ToBool(team["invite_enabled"]) {
		out["invite_code"] = util.Clean(team["invite_code"])
	}
	if member := teamMember(team, actor); member != nil {
		out["member_role"] = util.Clean(member["role"])
	}
	return out
}

func cloneTeamMembers(items []map[string]any) []map[string]any {
	out := make([]map[string]any, 0, len(items))
	for _, item := range items {
		out = append(out, util.CopyMap(item))
	}
	return out
}

func teamSpace(teamID string) string {
	if strings.TrimSpace(teamID) == "" {
		return "personal"
	}
	return "team"
}

func teamWorkspaceState(items []map[string]any, currentID string) map[string]any {
	currentID = util.Clean(currentID)
	state := map[string]any{
		"items":           items,
		"teams":           items,
		"current_team_id": currentID,
		"current_space":   teamSpace(currentID),
	}
	if currentID == "" {
		state["scope"] = map[string]any{"type": "personal"}
	} else {
		state["scope"] = map[string]any{"type": "team", "team_id": currentID}
	}
	return state
}
