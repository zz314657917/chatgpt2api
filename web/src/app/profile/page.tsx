"use client";

import { useEffect, useState } from "react";
import {
  Copy,
  LoaderCircle,
  RefreshCcw,
  Save,
  UserPlus,
  UserCircle2,
  UserPen,
  Users,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  createTeam,
  fetchAuthProviders,
  fetchTeamWorkspace,
  joinTeam,
  switchWorkspace,
  updateProfileName,
  type TeamSummary,
  type TeamWorkspaceState,
} from "@/lib/api";
import { authSessionFromLoginResponse, setVerifiedAuthSession } from "@/lib/session";
import { accountDisplayLabel, accountDisplayName, editableAccountName, publicDisplayText } from "@/lib/session-display";
import { useAuthGuard } from "@/lib/use-auth-guard";
import { cn } from "@/lib/utils";
import type { StoredAuthSession } from "@/store/auth";

function formatDateTime(value?: string | null) {
  if (!value) {
    return "—";
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

function providerLabel(provider?: string) {
  if (provider === "sub2api") {
    return "账户中心";
  }
  if (provider === "linuxdo") {
    return "Linuxdo";
  }
  if (provider === "local") {
    return "本地账号";
  }
  return provider || "未知";
}

function sessionRoleLabel(session: StoredAuthSession) {
  if (session.role === "admin") {
    return "管理员";
  }
  return session.roleName || "普通用户";
}

function billingLabel(session: StoredAuthSession) {
  const billing = session.billing;
  if (!billing) {
    return "同步中";
  }
  if (billing.unlimited) {
    return "无限";
  }
  if (billing.unit === "cny_milli") {
    return `¥${(Math.max(0, Number(billing.available) || 0) / 1000).toFixed(2)}`;
  }
  return `${Math.max(0, Number(billing.available) || 0)}`;
}

type InfoRowProps = {
  label: string;
  value: string;
  code?: boolean;
};

function InfoRow({ label, value, code }: InfoRowProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-muted/30 px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      {code ? (
        <code className="truncate font-mono text-sm text-foreground">{value || "—"}</code>
      ) : (
        <span className="truncate text-sm font-medium text-foreground">{value || "—"}</span>
      )}
    </div>
  );
}

function ProfileContent({ session }: { session: StoredAuthSession }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [currentSession, setCurrentSession] = useState(session);
  const [profileName, setProfileName] = useState(editableAccountName(session));
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const savedProfileName = editableAccountName(currentSession);
  const isProfileNameDirty = profileName.trim() !== savedProfileName;
  const roleLabel = sessionRoleLabel(currentSession);
  const activeTab = new URLSearchParams(location.search).get("tab") || "profile";
  const accountLabel = accountDisplayLabel(currentSession);
  const displayName = accountDisplayName(currentSession, "用户");

  useEffect(() => {
    setCurrentSession(session);
    setProfileName(editableAccountName(session));
  }, [session]);

  const handleSaveProfile = async () => {
    const nextName = profileName.trim();
    if (!nextName) {
      toast.error("昵称不能为空");
      return;
    }
    if (!isProfileNameDirty) {
      return;
    }
    setIsSavingProfile(true);
    try {
      const data = await updateProfileName(nextName);
      const nextSession = authSessionFromLoginResponse(data, currentSession.key);
      await setVerifiedAuthSession(nextSession);
      setCurrentSession(nextSession);
      setProfileName(editableAccountName(nextSession));
      toast.success("昵称已保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存昵称失败");
    } finally {
      setIsSavingProfile(false);
    }
  };

  return (
    <section className="flex flex-col gap-5">
      <PageHeader
        eyebrow="落叶AI"
        title="个人中心"
      />

      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                    <UserCircle2 className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="truncate text-lg">{displayName}</CardTitle>
                    <CardDescription className="truncate">{accountLabel}</CardDescription>
                  </div>
                </div>
                <Badge variant={currentSession.role === "admin" ? "violet" : "secondary"} className="shrink-0 rounded-md">
                  {roleLabel}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <InfoRow label="账户" value={accountLabel} />
              <InfoRow label="登录来源" value={providerLabel(currentSession.provider)} />
              <InfoRow label="当前余额" value={billingLabel(currentSession)} />
              <InfoRow label="加入时间" value={formatDateTime(currentSession.sub2api?.updated_at)} />
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap gap-2">
            {[
              { id: "profile", label: "个人资料" },
              { id: "usage", label: "使用记录" },
              { id: "team", label: "团队空间" },
            ].map((item) => (
              <Button
                key={item.id}
                type="button"
                variant={activeTab === item.id ? "default" : "outline"}
                className={item.id === "team"
                  ? cn(
                      "h-9 rounded-full",
                      activeTab === "team"
                        ? "bg-emerald-600 text-white hover:bg-emerald-700"
                        : "border-emerald-500/30 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300",
                    )
                  : "h-9 rounded-full"}
                onClick={() => {
                  const params = new URLSearchParams(location.search);
                  params.set("tab", item.id);
                  navigate(`${location.pathname}?${params.toString()}`, { replace: true });
                }}
              >
                {item.label}
              </Button>
            ))}
          </div>

          {activeTab === "team" ? <TeamWorkspacePanel /> : null}
          {activeTab === "usage" ? <UsagePanel /> : null}
          {activeTab !== "team" && activeTab !== "usage" ? (
            <Card>
            <CardHeader>
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#edf4ff] text-[#1456f0] dark:bg-sky-950/30 dark:text-sky-300">
                  <UserPen className="size-5" />
                </div>
                <div className="min-w-0">
                  <CardTitle className="text-lg">账号资料</CardTitle>
                  <CardDescription className="truncate">{accountLabel}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="profile-display-name">昵称</FieldLabel>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      id="profile-display-name"
                      value={profileName}
                      onChange={(event) => setProfileName(event.target.value)}
                      placeholder="昵称"
                      className="h-10 rounded-lg"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 rounded-lg"
                      onClick={() => void handleSaveProfile()}
                      disabled={!isProfileNameDirty || isSavingProfile}
                    >
                      {isSavingProfile ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
                      保存
                    </Button>
                  </div>
                  <FieldDescription>昵称会显示在导航栏和创作记录中。</FieldDescription>
                </Field>
              </FieldGroup>
            </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function normalizeWorkspace(data: TeamWorkspaceState | undefined): TeamWorkspaceState {
  return {
    scope: data?.scope?.type === "team"
      ? { type: "team", team_id: data.scope.team_id || "" }
      : { type: "personal" },
    teams: Array.isArray(data?.teams) ? data.teams : [],
  };
}

function TeamCard({
  team,
  active,
  onSwitch,
  onCopy,
}: {
  team: TeamSummary;
  active: boolean;
  onSwitch: () => void;
  onCopy: () => void;
}) {
  const members = Array.isArray(team.members) ? team.members : [];
  return (
    <div className={active ? "rounded-xl border border-[#1456f0]/30 bg-[#edf4ff] p-3 dark:bg-sky-950/30" : "rounded-xl border border-border bg-muted/20 p-3"}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-foreground">{team.name || "未命名团队"}</h3>
            {active ? <Badge variant="info" className="rounded-md">当前空间</Badge> : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {team.member_count ?? members.length} 位成员{publicDisplayText(team.owner_name) ? ` · 队长 ${publicDisplayText(team.owner_name)}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg" onClick={onCopy} disabled={!team.invite_code}>
            <Copy className="size-3.5" />
            复制邀请码
          </Button>
          <Button type="button" size="sm" className="h-8 rounded-lg" onClick={onSwitch} disabled={active}>
            切换
          </Button>
        </div>
      </div>
      {members.length > 0 ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {members.slice(0, 6).map((member) => (
            <div key={member.user_id} className="rounded-lg bg-background/70 px-3 py-2">
              <div className="truncate text-sm font-medium text-foreground">{publicDisplayText(member.name) || "未命名成员"}</div>
              <div className="truncate text-xs text-muted-foreground">
                {member.role === "owner" ? "队长" : "成员"}{member.joined_at ? ` · ${formatDateTime(member.joined_at)}` : ""}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TeamWorkspacePanel() {
  const [workspace, setWorkspace] = useState<TeamWorkspaceState>(() => ({ scope: { type: "personal" }, teams: [] }));
  const [teamName, setTeamName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const load = async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      setWorkspace(await fetchTeamWorkspace());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "团队信息暂时不可用");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const refreshFromMutation = (next?: TeamWorkspaceState) => {
    if (next) {
      setWorkspace(normalizeWorkspace(next));
      return;
    }
    void load();
  };

  const handleCreateTeam = async () => {
    const name = teamName.trim();
    if (!name) {
      toast.error("请输入团队名称");
      return;
    }
    setPending("create");
    try {
      const result = await createTeam(name);
      setTeamName("");
      refreshFromMutation(result.workspace);
      toast.success("团队已创建");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建团队失败");
    } finally {
      setPending("");
    }
  };

  const handleJoinTeam = async () => {
    const code = inviteCode.trim();
    if (!code) {
      toast.error("请输入邀请码");
      return;
    }
    setPending("join");
    try {
      const result = await joinTeam(code);
      setInviteCode("");
      refreshFromMutation(result.workspace);
      toast.success("已加入团队");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加入团队失败");
    } finally {
      setPending("");
    }
  };

  const handleSwitch = async (team?: TeamSummary) => {
    setPending(team?.id || "personal");
    try {
      const next = await switchWorkspace(team ? { type: "team", team_id: team.id } : { type: "personal" });
      setWorkspace(normalizeWorkspace(next));
      toast.success(team ? `已切换到 ${team.name}` : "已切换到个人空间");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "切换空间失败");
    } finally {
      setPending("");
    }
  };

  const handleCopyInvite = async (team: TeamSummary) => {
    const code = String(team.invite_code || "").trim();
    if (!code) {
      toast.error("这个团队暂时没有邀请码");
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
      toast.success("邀请码已复制");
    } catch {
      toast.error("复制失败，请手动复制");
    }
  };

  const personalActive = workspace.scope.type !== "team";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-[0_10px_24px_rgba(16,185,129,0.24)]">
              <Users className="size-5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-lg">团队空间</CardTitle>
              <CardDescription className="truncate">创建团队、邀请成员，并在个人与团队空间间切换。</CardDescription>
            </div>
          </div>
          <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => void load()} disabled={loading}>
            {loading ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
          当前空间决定创作任务记到个人还是团队。切到团队后，成员创作会记录实际操作者，并按团队规则扣费。
        </div>

        {errorMessage ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            {errorMessage}
          </div>
        ) : null}

        <div className={personalActive ? "rounded-xl border border-[#1456f0]/30 bg-[#edf4ff] p-3 dark:bg-sky-950/30" : "rounded-xl border border-border bg-muted/20 p-3"}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-foreground">个人空间</div>
              <div className="text-xs text-muted-foreground">只使用自己的余额和创作记录。</div>
            </div>
            <Button type="button" size="sm" className="h-8 rounded-lg" disabled={personalActive || pending === "personal"} onClick={() => void handleSwitch()}>
              {pending === "personal" ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
              切换
            </Button>
          </div>
        </div>

        {workspace.teams.map((team) => (
          <TeamCard
            key={team.id}
            team={team}
            active={workspace.scope.type === "team" && workspace.scope.team_id === team.id}
            onSwitch={() => void handleSwitch(team)}
            onCopy={() => void handleCopyInvite(team)}
          />
        ))}

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-border bg-muted/20 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Users className="size-4" />
              创建团队
            </div>
            <div className="flex gap-2">
              <Input value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="团队名称" className="h-9 rounded-lg" />
              <Button type="button" className="h-9 rounded-lg" onClick={() => void handleCreateTeam()} disabled={pending === "create"}>
                {pending === "create" ? <LoaderCircle className="size-4 animate-spin" /> : null}
                创建
              </Button>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-muted/20 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
              <UserPlus className="size-4" />
              加入团队
            </div>
            <div className="flex gap-2">
              <Input value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} placeholder="邀请码" className="h-9 rounded-lg" />
              <Button type="button" className="h-9 rounded-lg" onClick={() => void handleJoinTeam()} disabled={pending === "join"}>
                {pending === "join" ? <LoaderCircle className="size-4 animate-spin" /> : null}
                加入
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function UsagePanel() {
  const [usageURL, setUsageURL] = useState("");

  useEffect(() => {
    let active = true;
    void fetchAuthProviders()
      .then((providers) => {
        if (!active) {
          return;
        }
        setUsageURL(String(providers.sub2api?.usage_url || "").trim());
      })
      .catch(() => {
        if (active) {
          setUsageURL("");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">使用记录</CardTitle>
        <CardDescription>消费明细与充值记录以账户中心为准。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm leading-6 text-muted-foreground">
          当前页面保留落叶AI创作记录入口；完整扣费、充值和余额流水请到账户中心查看。
        </div>
        <Button type="button" className="w-fit rounded-lg" onClick={() => window.open(usageURL || "https://ai.3zapi.top", "_blank", "noopener,noreferrer")}>
          查看使用记录
        </Button>
      </CardContent>
    </Card>
  );
}

export default function ProfilePage() {
  const { isCheckingAuth, session } = useAuthGuard(undefined, "/profile");
  if (isCheckingAuth || !session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-stone-400" />
      </div>
    );
  }
  return <ProfileContent session={session} />;
}
