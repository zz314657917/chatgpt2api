package service

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"chatgpt2api/internal/storage"
	"chatgpt2api/internal/util"
)

const teamsDocumentName = "teams.json"
const teamInviteTTL = 7 * 24 * time.Hour

const (
	TeamRoleOwner   = "owner"
	TeamRoleManager = "manager"
	TeamRoleMember  = "member"
)

const (
	TeamInviteStatusPending  = "pending"
	TeamInviteStatusAccepted = "accepted"
	TeamInviteStatusRevoked  = "revoked"
)

const teamCurrentPersonal = "__personal__"

type TeamService struct {
	mu          sync.Mutex
	store       storage.JSONDocumentBackend
	teams       map[string]map[string]any
	current     map[string]string
	invites     map[string]map[string]any
	auditLogs   []map[string]any
	emailLookup func(ownerID string) string
}

type TeamTaskContext struct {
	TeamID      string
	PayerUserID string
	ActorUserID string
	ActorName   string
}

type TeamImageLibraryContext struct {
	TeamID            string
	TeamName          string
	Role              string
	StorageLimitBytes int64
}

func NewTeamService(backend storage.Backend) *TeamService {
	s := &TeamService{store: jsonDocumentStoreFromBackend(backend), teams: map[string]map[string]any{}, current: map[string]string{}, invites: map[string]map[string]any{}}
	s.mu.Lock()
	s.loadLocked()
	s.mu.Unlock()
	return s
}

func (s *TeamService) SetUserEmailLookup(lookup func(ownerID string) string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.emailLookup = lookup
}

func (s *TeamService) ListForIdentity(identity Identity) map[string]any {
	actor := teamActorID(identity)
	s.mu.Lock()
	defer s.mu.Unlock()
	currentID := s.actorTeamIDLocked(actor)
	return s.workspaceStateForActorLocked(identity, currentID)
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
		s.current[actor] = teamCurrentPersonal
		if err := s.saveLocked(); err != nil {
			return nil, err
		}
		return s.workspaceStateForActorLocked(identity, ""), nil
	}
	if teamMember(s.teams[teamID], actor) == nil {
		return nil, fmt.Errorf("team not found")
	}
	s.current[actor] = teamID
	if err := s.saveLocked(); err != nil {
		return nil, err
	}
	return s.workspaceStateForActorLocked(identity, teamID), nil
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
	s.mu.Lock()
	defer s.mu.Unlock()
	if existingTeamID := s.firstMembershipTeamIDLocked(actor); existingTeamID != "" {
		return nil, fmt.Errorf("user already belongs to a team")
	}
	team := map[string]any{
		"id":                  "team_" + util.NewHex(14),
		"name":                name,
		"owner_user_id":       actor,
		"members":             []map[string]any{teamMemberRecord(identity, TeamRoleOwner, s.identityEmailLocked(identity), now)},
		"storage_limit_bytes": DefaultTeamStorageLimitBytes,
		"created_at":          now,
		"updated_at":          now,
	}
	s.teams[util.Clean(team["id"])] = team
	s.current[actor] = util.Clean(team["id"])
	s.appendAuditLocked(team, identity, "team.created", "创建团队", map[string]any{"team_name": name})
	if err := s.saveLocked(); err != nil {
		return nil, err
	}
	return s.publicTeamForActorLocked(team, actor), nil
}

func (s *TeamService) CreateInvite(identity Identity, teamID, targetEmail, role string) (map[string]any, error) {
	actor := teamActorID(identity)
	if actor == "" {
		return nil, fmt.Errorf("user session is required")
	}
	targetEmail = normalizeTeamEmail(targetEmail)
	if targetEmail == "" {
		return nil, fmt.Errorf("invite email is required")
	}
	role = normalizeTeamInviteRole(role)
	if role == "" {
		return nil, fmt.Errorf("invite role is invalid")
	}
	teamID = util.Clean(teamID)
	now := util.NowISO()
	expiresAt := time.Now().UTC().Add(teamInviteTTL).Format(time.RFC3339Nano)
	s.mu.Lock()
	defer s.mu.Unlock()
	team, err := s.requireTeamRoleLocked(teamID, actor, TeamRoleOwner)
	if err != nil {
		return nil, err
	}
	if teamMemberByEmail(team, targetEmail) != nil {
		return nil, fmt.Errorf("user is already a team member")
	}
	for _, invite := range s.invites {
		if util.Clean(invite["team_id"]) != teamID || normalizeTeamEmail(util.Clean(invite["target_email"])) != targetEmail {
			continue
		}
		if !teamInvitePending(invite, time.Now().UTC()) {
			continue
		}
		invite["role"] = role
		invite["invited_by_user_id"] = actor
		invite["invited_by_name"] = teamIdentityName(identity)
		invite["expires_at"] = expiresAt
		invite["updated_at"] = now
		team["updated_at"] = now
		s.appendAuditLocked(team, identity, "invite.updated", "更新团队邀请", map[string]any{"target_email": targetEmail, "target_role": role, "invite_id": util.Clean(invite["id"])})
		if err := s.saveLocked(); err != nil {
			return nil, err
		}
		return publicInviteForActor(invite, actor, team), nil
	}
	invite := map[string]any{
		"id":                 "invite_" + util.NewHex(14),
		"team_id":            teamID,
		"team_name":          util.Clean(team["name"]),
		"target_email":       targetEmail,
		"role":               role,
		"status":             TeamInviteStatusPending,
		"invited_by_user_id": actor,
		"invited_by_name":    teamIdentityName(identity),
		"created_at":         now,
		"updated_at":         now,
		"expires_at":         expiresAt,
	}
	s.invites[util.Clean(invite["id"])] = invite
	team["updated_at"] = now
	s.appendAuditLocked(team, identity, "invite.created", "发起团队邀请", map[string]any{"target_email": targetEmail, "target_role": role, "invite_id": util.Clean(invite["id"])})
	if err := s.saveLocked(); err != nil {
		return nil, err
	}
	return publicInviteForActor(invite, actor, team), nil
}

func (s *TeamService) AcceptInvite(identity Identity, inviteID string) (map[string]any, error) {
	actor := teamActorID(identity)
	if actor == "" {
		return nil, fmt.Errorf("user session is required")
	}
	inviteID = util.Clean(inviteID)
	if inviteID == "" {
		return nil, fmt.Errorf("invite id is required")
	}
	nowTime := time.Now().UTC()
	now := nowTime.Format(time.RFC3339Nano)
	s.mu.Lock()
	defer s.mu.Unlock()
	invite := s.invites[inviteID]
	if invite == nil {
		return nil, fmt.Errorf("invite not found")
	}
	if !teamInvitePending(invite, nowTime) {
		return nil, fmt.Errorf("invite is not available")
	}
	team := s.teams[util.Clean(invite["team_id"])]
	if team == nil {
		return nil, fmt.Errorf("team not found")
	}
	targetEmail := normalizeTeamEmail(util.Clean(invite["target_email"]))
	userEmail := normalizeTeamEmail(s.identityEmailLocked(identity))
	if userEmail == "" {
		return nil, fmt.Errorf("sub2api email is required to accept invite")
	}
	if userEmail != targetEmail {
		return nil, fmt.Errorf("invite email does not match current user")
	}
	if existingTeamID := s.firstMembershipTeamIDLocked(actor); existingTeamID != "" {
		return nil, fmt.Errorf("user already belongs to a team")
	}
	if existing := teamMember(team, actor); existing == nil {
		members := util.AsMapSlice(team["members"])
		members = append(members, teamMemberRecord(identity, normalizeTeamInviteRole(util.Clean(invite["role"])), userEmail, now))
		team["members"] = members
	}
	invite["status"] = TeamInviteStatusAccepted
	invite["accepted_by_user_id"] = actor
	invite["accepted_at"] = now
	invite["updated_at"] = now
	team["updated_at"] = now
	s.current[actor] = util.Clean(team["id"])
	s.appendAuditLocked(team, identity, "invite.accepted", "接受团队邀请", map[string]any{"target_email": targetEmail, "invite_id": inviteID, "target_user_id": actor})
	if err := s.saveLocked(); err != nil {
		return nil, err
	}
	return s.publicTeamForActorLocked(team, actor), nil
}

func (s *TeamService) RevokeInvite(identity Identity, inviteID string) (map[string]any, error) {
	actor := teamActorID(identity)
	inviteID = util.Clean(inviteID)
	s.mu.Lock()
	defer s.mu.Unlock()
	invite := s.invites[inviteID]
	if invite == nil {
		return nil, fmt.Errorf("invite not found")
	}
	team, err := s.requireTeamRoleLocked(util.Clean(invite["team_id"]), actor, TeamRoleOwner)
	if err != nil {
		return nil, err
	}
	if util.Clean(invite["status"]) != TeamInviteStatusPending {
		return nil, fmt.Errorf("invite is not pending")
	}
	now := util.NowISO()
	invite["status"] = TeamInviteStatusRevoked
	invite["revoked_by_user_id"] = actor
	invite["revoked_at"] = now
	invite["updated_at"] = now
	team["updated_at"] = now
	s.appendAuditLocked(team, identity, "invite.revoked", "撤销团队邀请", map[string]any{"target_email": normalizeTeamEmail(util.Clean(invite["target_email"])), "invite_id": inviteID})
	if err := s.saveLocked(); err != nil {
		return nil, err
	}
	return publicInviteForActor(invite, actor, team), nil
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
	team, err := s.requireTeamManagerLocked(teamID, actor)
	if err != nil {
		return nil, err
	}
	if memberUserID == util.Clean(team["owner_user_id"]) {
		return nil, fmt.Errorf("team owner cannot be removed")
	}
	actorMember := teamMember(team, actor)
	if memberUserID == actor {
		return nil, fmt.Errorf("team managers cannot remove themselves")
	}
	if normalizeTeamMemberRole(util.Clean(actorMember["role"])) != TeamRoleOwner {
		targetMember := teamMember(team, memberUserID)
		if targetMember != nil && normalizeTeamMemberRole(util.Clean(targetMember["role"])) != TeamRoleMember {
			return nil, fmt.Errorf("team managers can only remove members")
		}
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
	now := util.NowISO()
	team["members"] = next
	team["updated_at"] = now
	if s.current[memberUserID] == teamID {
		delete(s.current, memberUserID)
	}
	s.appendAuditLocked(team, identity, "member.removed", "移除团队成员", map[string]any{"target_user_id": memberUserID})
	if err := s.saveLocked(); err != nil {
		return nil, err
	}
	return s.publicTeamForActorLocked(team, actor), nil
}

func (s *TeamService) Leave(identity Identity, teamID string) (map[string]any, error) {
	actor := teamActorID(identity)
	if actor == "" {
		return nil, fmt.Errorf("user session is required")
	}
	teamID = util.Clean(teamID)
	if teamID == "" {
		return nil, fmt.Errorf("team id is required")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	team := s.teams[teamID]
	member := teamMember(team, actor)
	if team == nil || member == nil {
		return nil, fmt.Errorf("team not found")
	}
	if actor == util.Clean(team["owner_user_id"]) || normalizeTeamMemberRole(util.Clean(member["role"])) == TeamRoleOwner {
		return nil, fmt.Errorf("team owner cannot leave")
	}
	members := util.AsMapSlice(team["members"])
	next := make([]map[string]any, 0, len(members))
	removed := false
	for _, item := range members {
		if util.Clean(item["user_id"]) == actor {
			removed = true
			continue
		}
		next = append(next, item)
	}
	if !removed {
		return nil, fmt.Errorf("team member not found")
	}
	now := util.NowISO()
	team["members"] = next
	team["updated_at"] = now
	if s.current[actor] == teamID {
		delete(s.current, actor)
	}
	s.appendAuditLocked(team, identity, "member.left", "退出团队", map[string]any{"target_user_id": actor})
	if err := s.saveLocked(); err != nil {
		return nil, err
	}
	return s.workspaceStateForActorLocked(identity, ""), nil
}

func (s *TeamService) UpdateMemberRole(identity Identity, teamID, memberUserID, role string) (map[string]any, error) {
	actor := teamActorID(identity)
	teamID = util.Clean(teamID)
	memberUserID = util.Clean(memberUserID)
	role = normalizeTeamMutableRole(role)
	if memberUserID == "" {
		return nil, fmt.Errorf("member user id is required")
	}
	if role == "" {
		return nil, fmt.Errorf("member role is invalid")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	team, err := s.requireTeamManagerLocked(teamID, actor)
	if err != nil {
		return nil, err
	}
	if memberUserID == util.Clean(team["owner_user_id"]) {
		return nil, fmt.Errorf("team owner role cannot be changed")
	}
	actorMember := teamMember(team, actor)
	if memberUserID == actor {
		return nil, fmt.Errorf("team managers cannot change their own role")
	}
	if normalizeTeamMemberRole(util.Clean(actorMember["role"])) != TeamRoleOwner {
		targetMember := teamMember(team, memberUserID)
		if targetMember != nil && normalizeTeamMemberRole(util.Clean(targetMember["role"])) != TeamRoleMember {
			return nil, fmt.Errorf("team managers can only change member roles")
		}
	}
	members := util.AsMapSlice(team["members"])
	updated := false
	for _, member := range members {
		if util.Clean(member["user_id"]) != memberUserID {
			continue
		}
		member["role"] = role
		updated = true
	}
	if !updated {
		return nil, fmt.Errorf("team member not found")
	}
	now := util.NowISO()
	team["members"] = members
	team["updated_at"] = now
	s.appendAuditLocked(team, identity, "member.role_updated", "调整成员角色", map[string]any{"target_user_id": memberUserID, "target_role": role})
	if err := s.saveLocked(); err != nil {
		return nil, err
	}
	return s.publicTeamForActorLocked(team, actor), nil
}

func (s *TeamService) UpdateMemberDailyLimit(identity Identity, teamID, memberUserID string, amount int) (map[string]any, error) {
	actor := teamActorID(identity)
	teamID = util.Clean(teamID)
	memberUserID = util.Clean(memberUserID)
	if memberUserID == "" {
		return nil, fmt.Errorf("member user id is required")
	}
	amount = normalizeTeamDailyLimitAmount(amount)
	s.mu.Lock()
	defer s.mu.Unlock()
	team, err := s.requireTeamManagerLocked(teamID, actor)
	if err != nil {
		return nil, err
	}
	if memberUserID == util.Clean(team["owner_user_id"]) {
		return nil, fmt.Errorf("team owner daily limit cannot be changed")
	}
	actorMember := teamMember(team, actor)
	if memberUserID == actor {
		return nil, fmt.Errorf("team managers cannot change their own daily limit")
	}
	if normalizeTeamMemberRole(util.Clean(actorMember["role"])) != TeamRoleOwner {
		targetMember := teamMember(team, memberUserID)
		if targetMember != nil && normalizeTeamMemberRole(util.Clean(targetMember["role"])) != TeamRoleMember {
			return nil, fmt.Errorf("team managers can only change member daily limits")
		}
	}
	members := util.AsMapSlice(team["members"])
	updated := false
	for _, member := range members {
		if util.Clean(member["user_id"]) != memberUserID {
			continue
		}
		if amount > 0 {
			member["daily_limit_amount"] = amount
		} else {
			delete(member, "daily_limit_amount")
		}
		updated = true
	}
	if !updated {
		return nil, fmt.Errorf("team member not found")
	}
	now := util.NowISO()
	team["members"] = members
	team["updated_at"] = now
	s.appendAuditLocked(team, identity, "member.daily_limit_updated", "调整成员每日额度", map[string]any{"target_user_id": memberUserID, "daily_limit_amount": amount})
	if err := s.saveLocked(); err != nil {
		return nil, err
	}
	return s.publicTeamForActorLocked(team, actor), nil
}

func (s *TeamService) ListAuditLogs(identity Identity, teamID string, limit int) ([]map[string]any, error) {
	actor := teamActorID(identity)
	teamID = util.Clean(teamID)
	s.mu.Lock()
	defer s.mu.Unlock()
	team, err := s.requireTeamManagerLocked(teamID, actor)
	if err != nil {
		return nil, err
	}
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	names := teamMemberNameMap(team)
	items := make([]map[string]any, 0)
	for _, item := range s.auditLogs {
		if util.Clean(item["team_id"]) != teamID {
			continue
		}
		if util.Clean(item["action"]) == "space.switched" {
			continue
		}
		out := util.CopyMap(item)
		if util.Clean(out["actor_name"]) == "" {
			out["actor_name"] = names[util.Clean(out["actor_user_id"])]
		}
		items = append(items, out)
		if len(items) >= limit {
			break
		}
	}
	return items, nil
}

func (s *TeamService) UsageActorFilter(identity Identity, teamID string) (string, error) {
	actor := teamActorID(identity)
	teamID = util.Clean(teamID)
	s.mu.Lock()
	defer s.mu.Unlock()
	team := s.teams[teamID]
	member := teamMember(team, actor)
	if team == nil || member == nil {
		return "", fmt.Errorf("team not found")
	}
	role := normalizeTeamMemberRole(util.Clean(member["role"]))
	if role == TeamRoleOwner || role == TeamRoleManager {
		return "", nil
	}
	return actor, nil
}

func (s *TeamService) MemberNameMap(identity Identity, teamID string) (map[string]string, error) {
	actor := teamActorID(identity)
	teamID = util.Clean(teamID)
	s.mu.Lock()
	defer s.mu.Unlock()
	team := s.teams[teamID]
	if team == nil || teamMember(team, actor) == nil {
		return nil, fmt.Errorf("team not found")
	}
	return teamMemberNameMap(team), nil
}

func (s *TeamService) MemberDailyLimitAmount(teamID, memberUserID string) int {
	teamID = util.Clean(teamID)
	memberUserID = util.Clean(memberUserID)
	if teamID == "" || memberUserID == "" {
		return 0
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return normalizeTeamDailyLimitAmount(teamMemberDailyLimitAmount(teamMember(s.teams[teamID], memberUserID)))
}

func (s *TeamService) ImageLibraryContext(identity Identity, teamID string) (TeamImageLibraryContext, error) {
	actor := teamActorID(identity)
	if actor == "" {
		return TeamImageLibraryContext{}, fmt.Errorf("user session is required")
	}
	teamID = util.Clean(teamID)
	s.mu.Lock()
	defer s.mu.Unlock()
	if teamID == "" {
		teamID = s.actorTeamIDLocked(actor)
	}
	team := s.teams[teamID]
	member := teamMember(team, actor)
	if team == nil || member == nil {
		return TeamImageLibraryContext{}, fmt.Errorf("team not found")
	}
	return TeamImageLibraryContext{
		TeamID:            teamID,
		TeamName:          util.Clean(team["name"]),
		Role:              normalizeTeamMemberRole(util.Clean(member["role"])),
		StorageLimitBytes: teamStorageLimitBytes(team),
	}, nil
}

func TeamRoleCanManageImages(role string) bool {
	role = normalizeTeamMemberRole(role)
	return role == TeamRoleOwner || role == TeamRoleManager
}

func (s *TeamService) TaskContext(identity Identity, teamID string) (TeamTaskContext, error) {
	actor := teamActorID(identity)
	if actor == "" {
		return TeamTaskContext{}, fmt.Errorf("user session is required")
	}
	teamID = util.Clean(teamID)
	s.mu.Lock()
	defer s.mu.Unlock()
	if teamID == "" {
		if s.current[actor] == teamCurrentPersonal {
			return TeamTaskContext{PayerUserID: actor, ActorUserID: actor}, nil
		}
		teamID = s.actorTeamIDLocked(actor)
		if teamID == "" {
			return TeamTaskContext{PayerUserID: actor, ActorUserID: actor}, nil
		}
	}
	team := s.teams[teamID]
	member := teamMember(team, actor)
	if team == nil || member == nil {
		return TeamTaskContext{}, fmt.Errorf("team not found")
	}
	owner := util.Clean(team["owner_user_id"])
	if owner == "" {
		return TeamTaskContext{}, fmt.Errorf("team owner is missing")
	}
	return TeamTaskContext{TeamID: teamID, PayerUserID: owner, ActorUserID: actor, ActorName: firstNonEmpty(util.Clean(member["name"]), teamIdentityName(identity))}, nil
}

func (s *TeamService) requireTeamRoleLocked(teamID, actor string, roles ...string) (map[string]any, error) {
	if teamID == "" {
		return nil, fmt.Errorf("team id is required")
	}
	team := s.teams[teamID]
	if team == nil {
		return nil, fmt.Errorf("team not found")
	}
	member := teamMember(team, actor)
	if member == nil {
		return nil, fmt.Errorf("team not found")
	}
	role := normalizeTeamMemberRole(util.Clean(member["role"]))
	for _, allowed := range roles {
		if role == allowed {
			return team, nil
		}
	}
	return nil, fmt.Errorf("team permission required")
}

func (s *TeamService) requireTeamManagerLocked(teamID, actor string) (map[string]any, error) {
	return s.requireTeamRoleLocked(teamID, actor, TeamRoleOwner, TeamRoleManager)
}

func (s *TeamService) actorTeamIDLocked(actor string) string {
	actor = util.Clean(actor)
	if actor == "" {
		return ""
	}
	if util.Clean(s.current[actor]) == teamCurrentPersonal {
		return ""
	}
	if currentID := util.Clean(s.current[actor]); currentID != "" && teamMember(s.teams[currentID], actor) != nil {
		return currentID
	}
	return s.firstMembershipTeamIDLocked(actor)
}

func (s *TeamService) firstMembershipTeamIDLocked(actor string) string {
	actor = util.Clean(actor)
	if actor == "" {
		return ""
	}
	for teamID, team := range s.teams {
		if teamMember(team, actor) != nil {
			return teamID
		}
	}
	return ""
}

func (s *TeamService) loadLocked() {
	raw := loadStoredJSON(s.store, teamsDocumentName)
	current := map[string]string{}
	invites := map[string]map[string]any{}
	var auditLogs []map[string]any
	if obj, ok := raw.(map[string]any); ok {
		for userID, value := range util.StringMap(obj["current"]) {
			if cleaned := util.Clean(value); cleaned == teamCurrentPersonal {
				current[util.Clean(userID)] = teamCurrentPersonal
			} else if cleaned != "" {
				current[util.Clean(userID)] = cleaned
			}
		}
		for _, item := range util.AsMapSlice(obj["invites"]) {
			invite := normalizeTeamInvite(item)
			if util.Clean(invite["id"]) != "" && util.Clean(invite["team_id"]) != "" {
				invites[util.Clean(invite["id"])] = invite
			}
		}
		for _, item := range util.AsMapSlice(obj["audit_logs"]) {
			logItem := normalizeTeamAuditLog(item)
			if util.Clean(logItem["id"]) != "" && util.Clean(logItem["team_id"]) != "" {
				auditLogs = append(auditLogs, logItem)
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
		if teamStorageLimitBytes(team) <= 0 {
			team["storage_limit_bytes"] = DefaultTeamStorageLimitBytes
		}
		team["created_at"] = firstNonEmpty(util.Clean(team["created_at"]), util.NowISO())
		team["updated_at"] = firstNonEmpty(util.Clean(team["updated_at"]), util.Clean(team["created_at"]))
		out[id] = team
	}
	sort.SliceStable(auditLogs, func(i, j int) bool {
		return util.Clean(auditLogs[i]["created_at"]) > util.Clean(auditLogs[j]["created_at"])
	})
	s.teams = out
	s.current = current
	s.invites = invites
	s.auditLogs = auditLogs
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
		if userID == "" {
			continue
		}
		if teamID == teamCurrentPersonal {
			current[userID] = teamCurrentPersonal
		} else if teamID != "" && s.teams[teamID] != nil {
			current[userID] = teamID
		}
	}
	invites := make([]map[string]any, 0, len(s.invites))
	for _, invite := range s.invites {
		invites = append(invites, util.CopyMap(invite))
	}
	sort.SliceStable(invites, func(i, j int) bool {
		return util.Clean(invites[i]["updated_at"]) > util.Clean(invites[j]["updated_at"])
	})
	return saveStoredJSON(s.store, teamsDocumentName, map[string]any{"teams": items, "current": current, "invites": invites, "audit_logs": s.auditLogs})
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

func teamMemberRecord(identity Identity, role, email, now string) map[string]any {
	return map[string]any{
		"user_id":   teamActorID(identity),
		"name":      firstNonEmpty(identity.Name, identity.CredentialName, teamActorID(identity)),
		"email":     normalizeTeamEmail(email),
		"role":      normalizeTeamMemberRole(role),
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
			"email":     normalizeTeamEmail(util.Clean(member["email"])),
			"role":      normalizeTeamMemberRole(util.Clean(member["role"])),
			"joined_at": util.Clean(member["joined_at"]),
		})
		if limit := normalizeTeamDailyLimitAmount(util.ToInt(member["daily_limit_amount"], 0)); limit > 0 {
			out[len(out)-1]["daily_limit_amount"] = limit
		}
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

func teamMemberNameMap(team map[string]any) map[string]string {
	names := map[string]string{}
	for _, member := range util.AsMapSlice(team["members"]) {
		userID := util.Clean(member["user_id"])
		if userID == "" {
			continue
		}
		names[userID] = firstNonEmpty(util.Clean(member["name"]), userID)
	}
	return names
}

func teamMemberDailyLimitAmount(member map[string]any) int {
	if member == nil {
		return 0
	}
	return normalizeTeamDailyLimitAmount(util.ToInt(member["daily_limit_amount"], 0))
}

func normalizeTeamDailyLimitAmount(amount int) int {
	if amount < 0 {
		return 0
	}
	if amount > 1_000_000_000 {
		return 1_000_000_000
	}
	return amount
}

func teamStorageLimitBytes(team map[string]any) int64 {
	if team == nil {
		return DefaultTeamStorageLimitBytes
	}
	switch value := team["storage_limit_bytes"].(type) {
	case int64:
		if value > 0 {
			return value
		}
	case int:
		if value > 0 {
			return int64(value)
		}
	case float64:
		if value > 0 {
			return int64(value)
		}
	case string:
		if parsed, err := strconv.ParseInt(strings.TrimSpace(value), 10, 64); err == nil && parsed > 0 {
			return parsed
		}
	}
	return DefaultTeamStorageLimitBytes
}

func teamMemberByEmail(team map[string]any, email string) map[string]any {
	email = normalizeTeamEmail(email)
	if team == nil || email == "" {
		return nil
	}
	for _, member := range util.AsMapSlice(team["members"]) {
		if normalizeTeamEmail(util.Clean(member["email"])) == email {
			return member
		}
	}
	return nil
}

func publicTeamForActor(team map[string]any, actor string) map[string]any {
	role := ""
	if member := teamMember(team, actor); member != nil {
		role = normalizeTeamMemberRole(util.Clean(member["role"]))
	}
	out := map[string]any{
		"id":                  util.Clean(team["id"]),
		"name":                util.Clean(team["name"]),
		"owner_user_id":       util.Clean(team["owner_user_id"]),
		"storage_limit_bytes": teamStorageLimitBytes(team),
		"created_at":          team["created_at"],
		"updated_at":          team["updated_at"],
		"member_role":         role,
	}
	if role != "" {
		members := cloneTeamMembers(util.AsMapSlice(team["members"]))
		out["members"] = members
		out["member_count"] = len(members)
	}
	return out
}

func (s *TeamService) publicTeamForActorLocked(team map[string]any, actor string) map[string]any {
	out := publicTeamForActor(team, actor)
	if normalizeTeamMemberRole(util.Clean(out["member_role"])) != TeamRoleOwner {
		return out
	}
	invites := make([]map[string]any, 0)
	now := time.Now().UTC()
	for _, invite := range s.invites {
		if util.Clean(invite["team_id"]) != util.Clean(team["id"]) || !teamInvitePending(invite, now) {
			continue
		}
		invites = append(invites, publicInviteForActor(invite, actor, team))
	}
	sort.SliceStable(invites, func(i, j int) bool {
		return util.Clean(invites[i]["created_at"]) > util.Clean(invites[j]["created_at"])
	})
	out["invites"] = invites
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

func (s *TeamService) workspaceStateForActorLocked(identity Identity, currentID string) map[string]any {
	actor := teamActorID(identity)
	items := make([]map[string]any, 0)
	for _, team := range s.teams {
		if teamMember(team, actor) != nil {
			items = append(items, s.publicTeamForActorLocked(team, actor))
		}
	}
	sort.SliceStable(items, func(i, j int) bool {
		return util.Clean(items[i]["updated_at"]) > util.Clean(items[j]["updated_at"])
	})
	state := teamWorkspaceState(items, currentID)
	state["pending_invites"] = s.pendingInvitesForActorLocked(identity)
	return state
}

func normalizeTeamMemberRole(role string) string {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case TeamRoleOwner:
		return TeamRoleOwner
	case TeamRoleManager:
		return TeamRoleManager
	default:
		return TeamRoleMember
	}
}

func normalizeTeamInviteRole(role string) string {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case TeamRoleManager:
		return TeamRoleManager
	case "", TeamRoleMember:
		return TeamRoleMember
	default:
		return ""
	}
}

func normalizeTeamMutableRole(role string) string {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case TeamRoleManager:
		return TeamRoleManager
	case TeamRoleMember:
		return TeamRoleMember
	default:
		return ""
	}
}

func normalizeTeamEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func (s *TeamService) identityEmailLocked(identity Identity) string {
	if s != nil && s.emailLookup != nil {
		if email := normalizeTeamEmail(s.emailLookup(teamActorID(identity))); email != "" {
			return email
		}
	}
	return ""
}

func teamIdentityName(identity Identity) string {
	return firstNonEmpty(util.Clean(identity.Name), util.Clean(identity.CredentialName), teamActorID(identity))
}

func normalizeTeamInvite(item map[string]any) map[string]any {
	status := util.Clean(item["status"])
	switch status {
	case TeamInviteStatusAccepted, TeamInviteStatusRevoked:
	default:
		status = TeamInviteStatusPending
	}
	role := normalizeTeamInviteRole(util.Clean(item["role"]))
	if role == "" {
		role = TeamRoleMember
	}
	return map[string]any{
		"id":                  util.Clean(item["id"]),
		"team_id":             util.Clean(item["team_id"]),
		"team_name":           util.Clean(item["team_name"]),
		"target_email":        normalizeTeamEmail(util.Clean(item["target_email"])),
		"role":                role,
		"status":              status,
		"invited_by_user_id":  util.Clean(item["invited_by_user_id"]),
		"invited_by_name":     util.Clean(item["invited_by_name"]),
		"accepted_by_user_id": util.Clean(item["accepted_by_user_id"]),
		"revoked_by_user_id":  util.Clean(item["revoked_by_user_id"]),
		"created_at":          util.Clean(item["created_at"]),
		"updated_at":          util.Clean(item["updated_at"]),
		"expires_at":          util.Clean(item["expires_at"]),
		"accepted_at":         util.Clean(item["accepted_at"]),
		"revoked_at":          util.Clean(item["revoked_at"]),
	}
}

func normalizeTeamAuditLog(item map[string]any) map[string]any {
	out := util.CopyMap(item)
	out["id"] = util.Clean(item["id"])
	out["team_id"] = util.Clean(item["team_id"])
	out["created_at"] = util.Clean(item["created_at"])
	return out
}

func teamInvitePending(invite map[string]any, now time.Time) bool {
	if util.Clean(invite["status"]) != TeamInviteStatusPending {
		return false
	}
	expiresAt := util.Clean(invite["expires_at"])
	if expiresAt == "" {
		return true
	}
	for _, layout := range []string{time.RFC3339Nano, time.RFC3339, "2006-01-02 15:04:05"} {
		if parsed, err := time.Parse(layout, expiresAt); err == nil {
			return now.Before(parsed)
		}
	}
	return true
}

func publicInviteForActor(invite map[string]any, actor string, team map[string]any) map[string]any {
	out := map[string]any{
		"id":                 util.Clean(invite["id"]),
		"team_id":            util.Clean(invite["team_id"]),
		"team_name":          firstNonEmpty(util.Clean(invite["team_name"]), util.Clean(team["name"])),
		"target_email":       normalizeTeamEmail(util.Clean(invite["target_email"])),
		"role":               normalizeTeamInviteRole(util.Clean(invite["role"])),
		"status":             util.Clean(invite["status"]),
		"invited_by_user_id": util.Clean(invite["invited_by_user_id"]),
		"invited_by_name":    util.Clean(invite["invited_by_name"]),
		"created_at":         util.Clean(invite["created_at"]),
		"updated_at":         util.Clean(invite["updated_at"]),
		"expires_at":         util.Clean(invite["expires_at"]),
	}
	if util.Clean(invite["accepted_at"]) != "" {
		out["accepted_at"] = util.Clean(invite["accepted_at"])
	}
	if util.Clean(invite["revoked_at"]) != "" {
		out["revoked_at"] = util.Clean(invite["revoked_at"])
	}
	if actor != "" && util.Clean(invite["invited_by_user_id"]) == actor {
		out["can_revoke"] = util.Clean(invite["status"]) == TeamInviteStatusPending
	}
	return out
}

func (s *TeamService) pendingInvitesForActorLocked(identity Identity) []map[string]any {
	if s.firstMembershipTeamIDLocked(teamActorID(identity)) != "" {
		return nil
	}
	email := normalizeTeamEmail(s.identityEmailLocked(identity))
	if email == "" {
		return nil
	}
	now := time.Now().UTC()
	out := make([]map[string]any, 0)
	for _, invite := range s.invites {
		if normalizeTeamEmail(util.Clean(invite["target_email"])) != email || !teamInvitePending(invite, now) {
			continue
		}
		out = append(out, publicInviteForActor(invite, teamActorID(identity), s.teams[util.Clean(invite["team_id"])]))
	}
	sort.SliceStable(out, func(i, j int) bool {
		return util.Clean(out[i]["created_at"]) > util.Clean(out[j]["created_at"])
	})
	return out
}

func (s *TeamService) appendAuditLocked(team map[string]any, identity Identity, action, summary string, detail map[string]any) {
	if s == nil || team == nil {
		return
	}
	if detail == nil {
		detail = map[string]any{}
	}
	item := map[string]any{
		"id":            "audit_" + util.NewHex(14),
		"team_id":       util.Clean(team["id"]),
		"actor_user_id": teamActorID(identity),
		"actor_name":    teamIdentityName(identity),
		"action":        action,
		"summary":       summary,
		"created_at":    util.NowISO(),
	}
	for key, value := range detail {
		item[key] = value
	}
	s.auditLogs = append([]map[string]any{item}, s.auditLogs...)
	if len(s.auditLogs) > 1000 {
		s.auditLogs = s.auditLogs[:1000]
	}
}
