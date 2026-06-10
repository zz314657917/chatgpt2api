"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ClipboardList,
  Copy,
  LoaderCircle,
  LogOut,
  RefreshCcw,
  Trash2,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  acceptTeamInvite,
  createTeam,
  createTeamInvite,
  fetchTeamAuditLogs,
  fetchTeamUsage,
  fetchTeamWorkspace,
  leaveTeam,
  removeTeamMember,
  revokeTeamInvite,
  updateTeamMemberDailyLimit,
  updateTeamMemberRole,
  type TeamAuditLog,
  type TeamInvite,
  type TeamMember,
  type TeamSummary,
  type TeamUsageTask,
  type TeamWorkspaceState,
} from "@/lib/api";
import { useAuthGuard } from "@/lib/use-auth-guard";

type TeamTab = "invite" | "members" | "logs" | "usage";
type PendingAction = {
  type: string;
  id?: string;
};

function formatDateTime(value?: string | null) {
  if (!value) {
    return "--";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function roleLabel(role?: string) {
  switch (role) {
    case "owner":
      return "创建者";
    case "manager":
      return "管理者";
    default:
      return "成员";
  }
}

function roleBadgeVariant(role?: string) {
  if (role === "owner") {
    return "violet" as const;
  }
  if (role === "manager") {
    return "info" as const;
  }
  return "secondary" as const;
}

function statusLabel(status?: string) {
  switch (status) {
    case "success":
      return "成功";
    case "error":
      return "失败";
    case "cancelled":
      return "已取消";
    case "running":
      return "运行中";
    case "queued":
      return "排队中";
    default:
      return status || "--";
  }
}

function usageModeLabel(mode?: string) {
  switch (mode) {
    case "chat":
      return "对话";
    case "generate":
      return "生图";
    case "edit":
      return "图生图";
    case "video":
      return "视频";
    default:
      return mode || "--";
  }
}

function formatCnyMilliAmount(value: number) {
  return `¥${(value / 1000).toFixed(3).replace(/(\.\d{2})0$/, "$1")}`;
}

function formatBillingAmount(value?: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "--";
  }
  return formatCnyMilliAmount(numeric);
}

function formatDurationSeconds(value?: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "--";
  }
  const totalSeconds = Math.max(0, Math.floor(numeric));
  if (totalSeconds < 60) {
    return `${totalSeconds} 秒`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return seconds > 0 ? `${minutes} 分 ${seconds} 秒` : `${minutes} 分`;
  }
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  return remainMinutes > 0 ? `${hours} 小时 ${remainMinutes} 分` : `${hours} 小时`;
}

function formatLimitAmount(value?: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return "¥0.00";
  }
  return formatCnyMilliAmount(numeric);
}

function usageBillingAmount(item: TeamUsageTask) {
  return item.billing_consumed_amount ?? item.billing_charged_amount;
}

function amountToInputValue(value?: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "";
  }
  return (numeric / 1000).toFixed(3).replace(/\.?0+$/, "");
}

function inputValueToAmount(value: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }
  return Math.round(numeric * 1000);
}

const teamScrollClassName = "max-h-[min(58vh,520px)] overflow-auto overscroll-contain [scrollbar-color:rgba(142,142,147,.45)_transparent] [scrollbar-gutter:stable] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#8e8e93]/45 [&::-webkit-scrollbar-track]:bg-transparent";
const stickyTableHeaderClassName = "sticky top-0 z-10";

function normalizeWorkspace(data?: TeamWorkspaceState): TeamWorkspaceState {
  const teams = Array.isArray(data?.teams) ? data.teams : [];
  return {
    scope: data?.scope?.type === "team"
      ? { type: "team", team_id: data.scope.team_id || "" }
      : { type: "personal" },
    teams,
    pending_invites: teams.length > 0 ? [] : Array.isArray(data?.pending_invites) ? data.pending_invites : [],
  };
}

function firstTeam(workspace: TeamWorkspaceState) {
  return workspace.teams[0] || null;
}

function TeamStatusCards({ team }: { team: TeamSummary }) {
  const daily = team.my_daily_limit;
  const members = team.member_count || team.members?.length || 0;
  const limitText = daily?.unlimited ? "不限额" : formatLimitAmount(daily?.limit_amount);
  const usedText = formatLimitAmount(daily?.used_amount);
  const remainingText = daily?.unlimited ? "不限额" : formatLimitAmount(daily?.remaining_amount);
  const limitAmount = Number(daily?.limit_amount) || 0;
  const usedAmount = Number(daily?.used_amount) || 0;
  const usagePercent = daily?.unlimited || limitAmount <= 0 ? 0 : Math.min(100, Math.max(0, (usedAmount / limitAmount) * 100));
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <div className="rounded-lg border border-sky-200 bg-sky-50/70 p-4 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/20">
        <div className="text-sm font-semibold">我的团队</div>
        <div className="mt-4 text-3xl font-bold">{members}</div>
        <div className="mt-2 truncate text-xs">{team.name || "未命名团队"}</div>
      </div>
      <div className="rounded-lg border border-violet-200 bg-violet-50/70 p-4 text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/20">
        <div className="text-sm font-semibold">今日额度</div>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div className="min-w-0">
            <div className="text-xs font-medium">限额</div>
            <div className="mt-1 truncate text-3xl font-bold">{limitText}</div>
          </div>
          <div className="min-w-0 text-amber-700 dark:text-amber-300">
            <div className="text-xs font-medium">剩余</div>
            <div className="mt-1 truncate text-3xl font-bold">{remainingText}</div>
          </div>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-violet-100 dark:bg-violet-950/60">
          <div className="h-full rounded-full bg-violet-500" style={{ width: `${usagePercent}%` }} />
        </div>
        <div className="mt-2 text-xs">团队空间每日可用额度</div>
      </div>
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-4 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/20">
        <div className="text-sm font-semibold">今日已用</div>
        <div className="mt-4 text-3xl font-bold">{usedText}</div>
        <div className="mt-2 text-xs">团队创作扣费累计</div>
      </div>
    </div>
  );
}

function PendingInvites({
  invites,
  pending,
  onAccept,
}: {
  invites: TeamInvite[];
  pending: PendingAction | null;
  onAccept: (invite: TeamInvite) => void;
}) {
  if (invites.length === 0) {
    return null;
  }
  return (
    <Card className="grid gap-2 p-3 md:grid-cols-2">
        {invites.map((invite) => (
          <div key={invite.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 p-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">{invite.team_name || "团队邀请"}</div>
              <div className="truncate text-xs text-muted-foreground">
                {roleLabel(invite.role)} · {invite.invited_by_name || "创建者"} 邀请
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              className="h-8 rounded-lg"
              disabled={pending?.type === "accept" && pending.id === invite.id}
              onClick={() => onAccept(invite)}
            >
              {pending?.type === "accept" && pending.id === invite.id ? <LoaderCircle className="size-4 animate-spin" /> : null}
              接受
            </Button>
          </div>
        ))}
    </Card>
  );
}

function InviteForm({
  team,
  pending,
  onInvite,
}: {
  team: TeamSummary | null;
  pending: PendingAction | null;
  onInvite: (email: string, role: "manager" | "member") => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"manager" | "member">("member");
  const canInvite = team?.member_role === "owner";
  return (
    <div className="grid gap-4">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="team-invite-email">登录邮箱</FieldLabel>
          <div className="grid gap-2 md:grid-cols-[1fr_160px_auto]">
            <Input
              id="team-invite-email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              className="h-10 rounded-lg"
              disabled={!canInvite}
            />
            <Select value={role} onValueChange={(value) => setRole(value === "manager" ? "manager" : "member")} disabled={!canInvite}>
              <SelectTrigger className="h-10 rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">成员</SelectItem>
                <SelectItem value="manager">管理者</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              className="h-10 rounded-lg"
              disabled={!canInvite || pending?.type === "invite"}
              onClick={() => {
                onInvite(email, role);
                setEmail("");
                setRole("member");
              }}
            >
              {pending?.type === "invite" ? <LoaderCircle className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
              邀请
            </Button>
          </div>
          <FieldDescription>{canInvite ? "邀请创建后，对方登录同一邮箱账号即可在本页接受。" : "当前角色不能发起邀请。"}</FieldDescription>
        </Field>
      </FieldGroup>
    </div>
  );
}

function DailyLimitControl({
  member,
  disabled,
  pending,
  onSave,
}: {
  member: TeamMember;
  disabled: boolean;
  pending: boolean;
  onSave: (member: TeamMember, value: string) => void;
}) {
  const [value, setValue] = useState(() => amountToInputValue(member.daily_limit_amount));
  useEffect(() => {
    setValue(amountToInputValue(member.daily_limit_amount));
  }, [member.daily_limit_amount]);
  return (
    <div className="flex items-center gap-2">
      <Input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            onSave(member, value);
          }
        }}
        inputMode="decimal"
        placeholder="不限额"
        className="h-9 w-28 rounded-lg"
        disabled={disabled}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 rounded-lg"
        disabled={disabled}
        onClick={() => onSave(member, value)}
      >
        {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
        保存
      </Button>
    </div>
  );
}

function MembersTable({
  team,
  currentUserID,
  pending,
  onRoleChange,
  onDailyLimitChange,
  onRemove,
}: {
  team: TeamSummary | null;
  currentUserID: string;
  pending: PendingAction | null;
  onRoleChange: (member: TeamMember, role: "manager" | "member") => void;
  onDailyLimitChange: (member: TeamMember, value: string) => void;
  onRemove: (member: TeamMember) => void;
}) {
  const members = team?.members || [];
  const canManageMembers = team?.member_role === "owner" || team?.member_role === "manager";
  const isOwnerView = team?.member_role === "owner";
  const isManagerView = team?.member_role === "manager";
  return (
    <div className={teamScrollClassName}>
      <Table>
        <TableHeader className={stickyTableHeaderClassName}>
          <TableRow>
            <TableHead>成员信息</TableHead>
            <TableHead>身份</TableHead>
            <TableHead>每日额度</TableHead>
            <TableHead>加入时间</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="h-28 text-center text-muted-foreground">暂无团队成员</TableCell>
            </TableRow>
          ) : members.map((member) => {
            const owner = member.role === "owner";
            const self = member.user_id === currentUserID;
            const manager = member.role === "manager";
            const canEditMember = canManageMembers && !owner && !self && (isOwnerView || (isManagerView && !manager));
            const displayName = member.name || member.email || "团队成员";
            const detailText = member.email && member.email !== displayName ? member.email : "";
            return (
              <TableRow key={member.user_id}>
                <TableCell>
                  <div className="font-medium text-foreground">{displayName}</div>
                  {detailText ? <div className="text-xs text-muted-foreground">{detailText}</div> : null}
                </TableCell>
                <TableCell>
                  {!canEditMember ? (
                    <Badge variant={roleBadgeVariant(member.role)} className="rounded-md">{roleLabel(member.role)}</Badge>
                  ) : (
                    <Select
                      value={member.role === "manager" ? "manager" : "member"}
                      onValueChange={(value) => onRoleChange(member, value === "manager" ? "manager" : "member")}
                      disabled={pending?.type === "role" && pending.id === member.user_id}
                    >
                      <SelectTrigger className="h-9 w-32 rounded-lg">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="member">成员</SelectItem>
                        <SelectItem value="manager">管理者</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </TableCell>
                <TableCell>
                  {!canEditMember ? (
                    <span className="text-muted-foreground">{member.daily_limit_amount ? formatBillingAmount(member.daily_limit_amount) : "不限额"}</span>
                  ) : (
                    <DailyLimitControl
                      member={member}
                      disabled={pending?.type === "limit" && pending.id === member.user_id}
                      pending={pending?.type === "limit" && pending.id === member.user_id}
                      onSave={onDailyLimitChange}
                    />
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{formatDateTime(member.joined_at)}</TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 rounded-lg text-muted-foreground hover:text-rose-600"
                    disabled={!canEditMember || pending?.type === "remove"}
                    onClick={() => onRemove(member)}
                    title="移除成员"
                  >
                    {pending?.type === "remove" && pending.id === member.user_id ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function TeamInvitesPanel({
  team,
  pending,
  onInvite,
  onRevokeInvite,
}: {
  team: TeamSummary | null;
  pending: PendingAction | null;
  onInvite: (email: string, role: "manager" | "member") => void;
  onRevokeInvite: (invite: TeamInvite) => void;
}) {
  const invites = team?.invites || [];
  return (
    <div className="grid gap-4 p-4">
      <InviteForm team={team} pending={pending} onInvite={onInvite} />
      <div className={`rounded-lg border border-border bg-muted/20 ${teamScrollClassName}`}>
        {invites.length === 0 ? (
          <div className="flex min-h-24 items-center justify-center px-4 py-6 text-sm text-muted-foreground">暂无待接受邀请</div>
        ) : invites.map((invite) => (
          <div key={invite.id} className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground">{invite.target_email}</div>
              <div className="truncate text-xs text-muted-foreground">{roleLabel(invite.role)} · 过期时间 {formatDateTime(invite.expires_at)}</div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-lg"
              disabled={pending?.type === "revoke" && pending.id === invite.id}
              onClick={() => onRevokeInvite(invite)}
            >
              {pending?.type === "revoke" && pending.id === invite.id ? <LoaderCircle className="size-4 animate-spin" /> : null}
              撤销
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function LogsTable({ logs, loading }: { logs: TeamAuditLog[]; loading: boolean }) {
  return (
    <div className={teamScrollClassName}>
      <Table>
        <TableHeader className={stickyTableHeaderClassName}>
          <TableRow>
            <TableHead>操作</TableHead>
            <TableHead>操作者</TableHead>
            <TableHead>时间</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={3} className="h-28 text-center text-muted-foreground">加载中...</TableCell>
            </TableRow>
          ) : logs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} className="h-28 text-center text-muted-foreground">暂无操作日志</TableCell>
            </TableRow>
          ) : logs.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                <div className="font-medium text-foreground">{item.summary || item.action || "团队操作"}</div>
                <div className="text-xs text-muted-foreground">{item.action || "--"}</div>
              </TableCell>
              <TableCell>{item.actor_name || "--"}</TableCell>
              <TableCell className="text-muted-foreground">{formatDateTime(item.created_at)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function UsageTable({ items, loading }: { items: TeamUsageTask[]; loading: boolean }) {
  const copyTaskID = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      toast.success("任务 ID 已复制");
    } catch {
      toast.error("复制失败");
    }
  };
  return (
    <div className={teamScrollClassName}>
      <Table className="min-w-[980px]">
        <TableHeader className={stickyTableHeaderClassName}>
          <TableRow>
            <TableHead>时间</TableHead>
            <TableHead>类型</TableHead>
            <TableHead>操作者</TableHead>
            <TableHead>模型</TableHead>
            <TableHead>价格</TableHead>
            <TableHead>耗时</TableHead>
            <TableHead>状态</TableHead>
            <TableHead className="text-right">任务 ID</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={8} className="h-28 text-center text-muted-foreground">加载中...</TableCell>
            </TableRow>
          ) : items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="h-28 text-center text-muted-foreground">暂无团队使用记录</TableCell>
            </TableRow>
          ) : items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(item.updated_at || item.created_at)}</TableCell>
              <TableCell><Badge variant="secondary" className="rounded-md">{usageModeLabel(item.mode)}</Badge></TableCell>
              <TableCell className="max-w-[140px] truncate text-muted-foreground" title={item.actor_name || undefined}>{item.actor_name || "--"}</TableCell>
              <TableCell className="max-w-[180px] truncate text-muted-foreground" title={item.model || undefined}>{item.model || "auto"}</TableCell>
              <TableCell className="text-muted-foreground">{formatBillingAmount(usageBillingAmount(item))}</TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">{formatDurationSeconds(item.duration_seconds)}</TableCell>
              <TableCell><Badge variant={item.status === "success" ? "success" : item.status === "error" ? "danger" : "secondary"} className="rounded-md">{statusLabel(item.status)}</Badge></TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <code className="max-w-[150px] truncate font-mono text-xs text-muted-foreground" title={item.id}>{item.id}</code>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 rounded-lg text-muted-foreground hover:text-foreground"
                    onClick={() => void copyTaskID(item.id)}
                    title="复制任务 ID"
                    aria-label="复制任务 ID"
                  >
                    <Copy className="size-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function TeamPage() {
  const { isCheckingAuth, session } = useAuthGuard(undefined, "/team");
  const [workspace, setWorkspace] = useState<TeamWorkspaceState>(() => ({ scope: { type: "personal" }, teams: [], pending_invites: [] }));
  const [teamName, setTeamName] = useState("");
  const [activeTab, setActiveTab] = useState<TeamTab>("members");
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<TeamAuditLog[]>([]);
  const [usage, setUsage] = useState<TeamUsageTask[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const activeTeam = useMemo(() => firstTeam(workspace), [workspace]);
  const activeTeamID = activeTeam?.id || "";
  const currentUserID = session?.sub2api?.owner_id || session?.subjectId || "";
  const canViewTeamManagement = activeTeam?.member_role === "owner" || activeTeam?.member_role === "manager";
  const visibleTabs = useMemo(() => {
    if (!activeTeam) {
      return [] as Array<{ id: TeamTab; label: string; icon: LucideIcon }>;
    }
    const usageTab = { id: "usage" as const, label: "使用记录", icon: Activity };
    if (activeTeam.member_role === "owner") {
      return [
        { id: "members" as const, label: "团队成员", icon: Users },
        usageTab,
        { id: "invite" as const, label: "邀请成员", icon: UserPlus },
        { id: "logs" as const, label: "操作日志", icon: ClipboardList },
      ];
    }
    return [
      { id: "members" as const, label: "团队成员", icon: Users },
      usageTab,
      ...(canViewTeamManagement ? [{ id: "logs" as const, label: "操作日志", icon: ClipboardList }] : []),
    ];
  }, [activeTeam, canViewTeamManagement]);
  const loadTeamDetails = async (team: TeamSummary | null) => {
    if (!team?.id) {
      setLogs([]);
      setUsage([]);
      return;
    }
    const teamID = team.id;
    const shouldLoadLogs = team.member_role === "owner" || team.member_role === "manager";
    setLoadingDetails(true);
    try {
      const [usageResult, logResult] = await Promise.allSettled([
        fetchTeamUsage(teamID),
        shouldLoadLogs ? fetchTeamAuditLogs(teamID) : Promise.resolve({ items: [] as TeamAuditLog[] }),
      ]);
      setUsage(usageResult.status === "fulfilled" ? usageResult.value.items || [] : []);
      setLogs(logResult.status === "fulfilled" ? logResult.value.items || [] : []);
    } finally {
      setLoadingDetails(false);
    }
  };

  const loadWorkspace = async () => {
    setLoading(true);
    try {
      setWorkspace(normalizeWorkspace(await fetchTeamWorkspace()));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载团队失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!session) {
      return;
    }
    void loadWorkspace();
  }, [session]);

  useEffect(() => {
    if (!activeTeamID) {
      setLogs([]);
      setUsage([]);
      return;
    }
    let active = true;
    const shouldLoadLogs = activeTeam?.member_role === "owner" || activeTeam?.member_role === "manager";
    setLoadingDetails(true);
    Promise.allSettled([
      fetchTeamUsage(activeTeamID),
      shouldLoadLogs ? fetchTeamAuditLogs(activeTeamID) : Promise.resolve({ items: [] as TeamAuditLog[] }),
    ]).then(([usageResult, logResult]) => {
      if (!active) {
        return;
      }
      setUsage(usageResult.status === "fulfilled" ? usageResult.value.items || [] : []);
      setLogs(logResult.status === "fulfilled" ? logResult.value.items || [] : []);
    }).finally(() => {
      if (active) {
        setLoadingDetails(false);
      }
    });
    return () => {
      active = false;
    };
  }, [activeTeamID, activeTeam?.member_role]);

  useEffect(() => {
    if (visibleTabs.length === 0) {
      return;
    }
    if (!visibleTabs.some((item) => item.id === activeTab)) {
      setActiveTab(visibleTabs[0].id);
    }
  }, [activeTab, visibleTabs]);

  const refreshAfterMutation = async (next?: TeamWorkspaceState | TeamSummary[]) => {
    let normalized: TeamWorkspaceState;
    if (Array.isArray(next)) {
      normalized = normalizeWorkspace({ ...workspace, teams: next });
    } else if (next) {
      normalized = normalizeWorkspace(next);
    } else {
      normalized = normalizeWorkspace(await fetchTeamWorkspace());
    }
    setWorkspace(normalized);
    await loadTeamDetails(firstTeam(normalized));
  };

  const handleCreateTeam = async () => {
    const name = teamName.trim();
    if (!name) {
      toast.error("请输入团队名称");
      return;
    }
    setPending({ type: "create" });
    try {
      const result = await createTeam(name);
      setTeamName("");
      await refreshAfterMutation(result.teams);
      toast.success("团队已创建");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建团队失败");
    } finally {
      setPending(null);
    }
  };

  const handleInvite = async (email: string, role: "manager" | "member") => {
    if (!activeTeam) {
      toast.error("请先创建或选择团队");
      return;
    }
    const targetEmail = email.trim();
    if (!targetEmail) {
      toast.error("请输入被邀请人的登录邮箱");
      return;
    }
    setPending({ type: "invite" });
    try {
      const result = await createTeamInvite(activeTeam.id, targetEmail, role);
      await refreshAfterMutation(result.teams);
      toast.success("邀请已创建");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建邀请失败");
    } finally {
      setPending(null);
    }
  };

  const handleAcceptInvite = async (invite: TeamInvite) => {
    setPending({ type: "accept", id: invite.id });
    try {
      const result = await acceptTeamInvite(invite.id);
      await refreshAfterMutation(result.workspace ?? result.teams);
      toast.success("已加入团队");
    } catch (error) {
      await refreshAfterMutation();
      toast.error(error instanceof Error ? error.message : "接受邀请失败");
    } finally {
      setPending(null);
    }
  };

  const handleRevokeInvite = async (invite: TeamInvite) => {
    setPending({ type: "revoke", id: invite.id });
    try {
      const result = await revokeTeamInvite(invite.id);
      await refreshAfterMutation(result.teams);
      toast.success("邀请已撤销");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "撤销邀请失败");
    } finally {
      setPending(null);
    }
  };

  const handleRoleChange = async (member: TeamMember, role: "manager" | "member") => {
    if (!activeTeam) {
      return;
    }
    setPending({ type: "role", id: member.user_id });
    try {
      const result = await updateTeamMemberRole(activeTeam.id, member.user_id, role);
      await refreshAfterMutation(result.teams);
      toast.success("成员角色已更新");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新角色失败");
    } finally {
      setPending(null);
    }
  };

  const handleDailyLimitChange = async (member: TeamMember, value: string) => {
    if (!activeTeam) {
      return;
    }
    const amount = inputValueToAmount(value);
    setPending({ type: "limit", id: member.user_id });
    try {
      const result = await updateTeamMemberDailyLimit(activeTeam.id, member.user_id, amount);
      await refreshAfterMutation(result.teams);
      toast.success(amount > 0 ? "每日额度已更新" : "每日额度已取消");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新每日额度失败");
    } finally {
      setPending(null);
    }
  };

  const handleRemove = async (member: TeamMember) => {
    if (!activeTeam) {
      return;
    }
    setPending({ type: "remove", id: member.user_id });
    try {
      const result = await removeTeamMember(activeTeam.id, member.user_id);
      await refreshAfterMutation(result.teams);
      toast.success("成员已移除");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "移除成员失败");
    } finally {
      setPending(null);
    }
  };

  const handleLeaveTeam = async () => {
    if (!activeTeam) {
      return;
    }
    if (!window.confirm("确定退出团队吗？退出后需要创建者重新邀请才能加入。")) {
      return;
    }
    setPending({ type: "leave", id: activeTeam.id });
    try {
      const result = await leaveTeam(activeTeam.id);
      setActiveTab("members");
      await refreshAfterMutation(result.workspace ?? result.teams);
      toast.success("已退出团队");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "退出团队失败");
    } finally {
      setPending(null);
    }
  };

  if (isCheckingAuth || !session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-stone-400" />
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-5">
      <PendingInvites invites={workspace.pending_invites || []} pending={pending} onAccept={handleAcceptInvite} />
      {activeTeam ? <TeamStatusCards team={activeTeam} /> : null}

      <Card className="overflow-hidden">
        <div className="grid gap-4 border-b border-border p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            {activeTeam ? (
              <div className="min-w-0">
                <div className="truncate text-base font-semibold text-foreground">{activeTeam.name || "未命名团队"}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant={roleBadgeVariant(activeTeam.member_role)} className="rounded-md">{roleLabel(activeTeam.member_role)}</Badge>
                  {activeTeam.member_count ? (
                    <span>{activeTeam.member_count} 位成员</span>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="grid flex-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                <Input
                  value={teamName}
                  onChange={(event) => setTeamName(event.target.value)}
                  placeholder="团队名称"
                  className="h-10 rounded-lg"
                />
                <Button type="button" className="h-10 rounded-lg" disabled={pending?.type === "create"} onClick={() => void handleCreateTeam()}>
                  {pending?.type === "create" ? <LoaderCircle className="size-4 animate-spin" /> : <Users className="size-4" />}
                  创建团队
                </Button>
              </div>
            )}
            <div className="flex items-center gap-2">
              {activeTeam && activeTeam.member_role !== "owner" ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 rounded-lg text-muted-foreground hover:text-rose-600"
                  onClick={() => void handleLeaveTeam()}
                  disabled={pending?.type === "leave"}
                >
                  {pending?.type === "leave" ? <LoaderCircle className="size-4 animate-spin" /> : <LogOut className="size-4" />}
                  退出团队
                </Button>
              ) : null}
              <Button type="button" variant="outline" size="icon" className="size-9 rounded-lg" onClick={() => void loadWorkspace()} disabled={loading}>
                {loading ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}
              </Button>
            </div>
          </div>
        </div>
        {!activeTeam ? (
          <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">
            暂无团队，创建团队后即可邀请成员。
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 border-b border-border bg-muted/20 p-3">
              {visibleTabs.map((item) => {
                const Icon = item.icon;
                return (
                  <Button
                    key={item.id}
                    type="button"
                    variant={activeTab === item.id ? "default" : "ghost"}
                    className="h-9 rounded-lg"
                    onClick={() => setActiveTab(item.id)}
                  >
                    <Icon className="size-4" />
                    {item.label}
                  </Button>
                );
              })}
            </div>
            <div className="min-h-[280px] overflow-hidden">
              {activeTab === "invite" && activeTeam.member_role === "owner" ? (
                <TeamInvitesPanel
                  team={activeTeam}
                  pending={pending}
                  onInvite={handleInvite}
                  onRevokeInvite={handleRevokeInvite}
                />
              ) : activeTab === "logs" && canViewTeamManagement ? (
                <LogsTable logs={logs} loading={loadingDetails} />
              ) : activeTab === "members" ? (
                <MembersTable
                  team={activeTeam}
                  currentUserID={currentUserID}
                  pending={pending}
                  onRoleChange={handleRoleChange}
                  onDailyLimitChange={handleDailyLimitChange}
                  onRemove={handleRemove}
                />
              ) : (
                <UsageTable items={usage} loading={loadingDetails} />
              )}
            </div>
          </>
        )}
      </Card>
    </section>
  );
}
