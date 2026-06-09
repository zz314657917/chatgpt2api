"use client";

import { useEffect, useState } from "react";
import {
  LoaderCircle,
  Save,
  UserCircle2,
  UserPen,
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
  fetchAuthProviders,
  updateProfileName,
} from "@/lib/api";
import { authSessionFromLoginResponse, setVerifiedAuthSession } from "@/lib/session";
import { accountDisplayLabel, accountDisplayName, editableAccountName } from "@/lib/session-display";
import { useAuthGuard } from "@/lib/use-auth-guard";
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
  return Math.max(0, Number(billing.available) || 0).toFixed(2);
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
  const activeTab = new URLSearchParams(location.search).get("tab") === "usage" ? "usage" : "profile";
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
        eyebrow="落叶创艺"
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
            ].map((item) => (
              <Button
                key={item.id}
                type="button"
                variant={activeTab === item.id ? "default" : "outline"}
                className="h-9 rounded-full"
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

          {activeTab === "usage" ? <UsagePanel /> : null}
          {activeTab !== "usage" ? (
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
          当前页面保留落叶创艺创作记录入口；完整扣费、充值和余额流水请到账户中心查看。
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
