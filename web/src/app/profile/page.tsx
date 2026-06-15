"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  LoaderCircle,
  ReceiptText,
  RefreshCw,
  Save,
  UserCircle2,
  UserPen,
  X,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  fetchAuthProviders,
  fetchSub2APIUsage,
  type Sub2APIUsageRecord,
  type Sub2APIUsageSummary,
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
    return `✪${(Math.max(0, Number(billing.available) || 0) / 1000).toFixed(2)}`;
  }
  return Math.max(0, Number(billing.available) || 0).toFixed(2);
}

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function firstRecordText(record: Sub2APIUsageRecord, keys: string[]) {
  for (const key of keys) {
    const value = cleanText(record[key]);
    if (value) {
      return value;
    }
  }
  return "";
}

function recordObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function amountValueFromRecord(record: Record<string, unknown>, depth = 0): { value: unknown; key: string } | null {
  const keys = [
    "amount",
    "actual_cost",
    "charged_amount",
    "consumed_amount",
    "consume_amount",
    "cost",
    "price",
    "fee",
    "total_fee",
    "payment_amount",
    "recharge_amount",
    "balance_change",
    "change_amount",
    "used_amount",
    "usage_amount",
    "quota_used",
    "value",
    "billing_consumed_amount",
    "billing_charged_amount",
    "total_actual_cost",
    "total_cost",
  ];
  for (const key of keys) {
    const value = record[key];
    if (value === undefined || value === null || value === "") {
      continue;
    }
    return { value, key };
  }
  if (depth >= 2) {
    return null;
  }
  for (const key of ["billing", "charge", "cost", "usage", "payment", "recharge", "data"]) {
    const nested = amountValueFromRecord(recordObject(record[key]), depth + 1);
    if (nested) {
      return nested;
    }
  }
  return null;
}

function formatCredits(value: number) {
  if (!Number.isFinite(value)) {
    return "--";
  }
  const sign = value < 0 ? "-" : "";
  const amount = Math.abs(value);
  if (amount === 0) {
    return "0";
  }
  return `${sign}${amount.toLocaleString("en-US", {
    maximumFractionDigits: 6,
    minimumFractionDigits: 0,
    useGrouping: false,
  })}`;
}

function usageAmountLabel(record: Sub2APIUsageRecord) {
  const item = amountValueFromRecord(record);
  if (!item) {
    return "--";
  }
  const numeric = Number(item.value);
  if (!Number.isFinite(numeric)) {
    return cleanText(item.value) || "--";
  }
  return formatCredits(numeric);
}

function usageModelLabel(record: Sub2APIUsageRecord, fallbackTitle = "--") {
  const model = firstRecordText(record, ["actual_model", "upstream_model", "resolved_model", "model_name", "model_id", "modelId", "model"]);
  if (model) {
    return model;
  }
  const nestedModel = firstRecordText(recordObject(record.model), ["name", "id"]) || firstRecordText(recordObject(record.task), ["model", "model_name"]);
  if (nestedModel) {
    return nestedModel;
  }
  return fallbackTitle;
}

function usageTypeLabel(record: Sub2APIUsageRecord, fallbackTitle = "记录") {
  const direct = firstRecordText(record, ["type", "media_type", "billing_mode", "mode", "task_type", "request_type", "inbound_endpoint", "request_path"]);
  const text = direct.toLowerCase();
  if (text.includes("recharge") || text.includes("payment") || fallbackTitle.includes("充值")) {
    return "充值";
  }
  if (text.includes("image") || text.includes("generate") || text.includes("edit")) {
    return "图片";
  }
  if (text.includes("video")) {
    return "视频";
  }
  if (text.includes("chat") || text.includes("text") || text.includes("token")) {
    return "推理";
  }
  const model = usageModelLabel(record, "");
  if (model.toLowerCase().includes("image")) {
    return "图片";
  }
  if (direct) {
    return direct;
  }
  return fallbackTitle.includes("充值") ? "充值" : "推理";
}

function usageTaskID(record: Sub2APIUsageRecord) {
  const id = firstRecordText(record, ["task_id", "request_id", "id", "order_id", "charge_key", "transaction_id"]);
  if (!id) {
    return "--";
  }
  return id.startsWith("studio:") ? id.slice("studio:".length) : id;
}

function firstRecordNumber(record: Sub2APIUsageRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value === undefined || value === null || value === "") {
      continue;
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }
  return null;
}

function usageDurationLabel(record: Sub2APIUsageRecord) {
  const seconds = firstRecordNumber(record, ["duration_seconds", "elapsed_seconds", "seconds"]);
  if (seconds !== null && seconds > 0) {
    return `${Math.max(1, Math.round(seconds))}s`;
  }
  const millis = firstRecordNumber(record, ["duration_ms", "elapsed_ms", "latency_ms"]);
  if (millis !== null && millis > 0) {
    return `${Math.max(1, Math.round(millis / 1000))}s`;
  }
  return "--";
}

function formatUsageDateTime(value?: string | null) {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const parts = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}/${part("month")}/${part("day")} ${part("hour")}:${part("minute")}:${part("second")}`;
}

function usageRecordTime(record: Sub2APIUsageRecord) {
  const raw = record.created_at ?? record.time ?? record.createdAt ?? record.created ?? record.updated_at ?? record.date;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const millis = raw > 1000000000000 ? raw : raw * 1000;
    return formatUsageDateTime(new Date(millis).toISOString());
  }
  return formatUsageDateTime(cleanText(raw));
}

type UsageStatusView = {
  label: string;
  tone: "success" | "failed" | "neutral";
  reason?: string;
};

function usageFailureReason(record: Sub2APIUsageRecord) {
  return firstRecordText(record, ["error_message", "error", "failure_reason", "reason", "message", "detail", "status_message"]) || "暂无失败原因";
}

function usageStatus(record: Sub2APIUsageRecord): UsageStatusView {
  const status = firstRecordText(record, ["status", "state", "result", "payment_status"]).toLowerCase();
  if (["success", "succeeded", "completed", "complete", "committed", "paid", "ok", "done"].includes(status)) {
    return { label: "查看", tone: "success" };
  }
  if (["failed", "failure", "error", "cancelled", "canceled", "expired", "refunded"].includes(status)) {
    return { label: "失败", tone: "failed", reason: usageFailureReason(record) };
  }
  if (cleanText(record.error) || cleanText(record.error_message)) {
    return { label: "失败", tone: "failed", reason: usageFailureReason(record) };
  }
  const amount = amountValueFromRecord(record);
  const numeric = amount ? Number(amount.value) : NaN;
  if (Number.isFinite(numeric)) {
    return numeric > 0 ? { label: "查看", tone: "success" } : { label: "失败", tone: "failed", reason: usageFailureReason(record) };
  }
  return { label: "--", tone: "neutral" };
}

function usageRecordKey(record: Sub2APIUsageRecord, index: number) {
  return `${firstRecordText(record, ["id", "task_id", "request_id", "order_id", "charge_key", "created_at", "time"]) || "usage"}-${index}`;
}

const usageRecordScrollClassName = "max-h-[min(52vh,420px)] overflow-y-auto overscroll-contain [scrollbar-color:rgba(142,142,147,.55)_transparent] [scrollbar-gutter:stable] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#8e8e93]/55 [&::-webkit-scrollbar-track]:bg-transparent";

async function copyUsageText(value: string, label: string) {
  const text = value.trim();
  if (!text || text === "--") {
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label}已复制`);
  } catch {
    toast.error(`${label}复制失败`);
  }
}

function CopyableUsageText({
  value,
  label,
  copyValue,
  className = "",
}: {
  value: string;
  label: string;
  copyValue?: string;
  className?: string;
}) {
  const textToCopy = (copyValue ?? value).trim();
  const canCopy = textToCopy !== "" && textToCopy !== "--";
  return (
    <div className={`flex min-w-0 items-center gap-2 ${className}`}>
      <span title={textToCopy || value} className="min-w-0 truncate font-mono text-[13px] text-foreground">
        {value || "--"}
      </span>
      <button
        type="button"
        title={`复制${label}`}
        aria-label={`复制${label}`}
        disabled={!canCopy}
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-background hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
        onClick={() => void copyUsageText(textToCopy, label)}
      >
        <Copy className="size-3.5" />
      </button>
    </div>
  );
}

function CopyUsageTaskIDButton({ taskID }: { taskID: string }) {
  const canCopy = taskID.trim() !== "" && taskID !== "--";
  return (
    <button
      type="button"
      title="复制任务 ID"
      aria-label="复制任务 ID"
      disabled={!canCopy}
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-background hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
      onClick={() => void copyUsageText(taskID, "任务 ID")}
    >
      <Copy className="size-3.5" />
    </button>
  );
}

function UsageStatusBadge({ status }: { status: UsageStatusView }) {
  if (status.tone === "success") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
        <Check className="size-3" />
        {status.label}
      </span>
    );
  }
  if (status.tone === "failed") {
    return (
      <span
        title={status.reason || "暂无失败原因"}
        className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-1.5 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"
      >
        <X className="size-3" />
        {status.label}
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">--</span>;
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

      <div className="grid min-w-0 gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
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

        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex min-w-0 flex-wrap gap-2">
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

          {activeTab === "usage" ? <UsagePanel session={currentSession} /> : null}
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

function UsagePanel({ session }: { session: StoredAuthSession }) {
  const [usage, setUsage] = useState<Sub2APIUsageSummary | null>(null);
  const [usageURL, setUsageURL] = useState("");
  const [isLoadingUsage, setIsLoadingUsage] = useState(true);
  const [usageError, setUsageError] = useState("");
  const isSub2APIUser = session.provider === "sub2api";

  const loadUsage = useCallback(() => {
    setIsLoadingUsage(true);
    setUsageError("");
    const usageRequest = isSub2APIUser ? fetchSub2APIUsage(50) : Promise.resolve<Sub2APIUsageSummary>({});
    void Promise.allSettled([fetchAuthProviders(), usageRequest])
      .then(([providersResult, usageResult]) => {
        if (providersResult.status === "fulfilled") {
          setUsageURL(String(providersResult.value.sub2api?.usage_url || "").trim());
        }
        if (usageResult.status === "fulfilled") {
          setUsage(usageResult.value);
          if (usageResult.value.recharge_url) {
            setUsageURL((current) => current || String(usageResult.value.recharge_url || "").trim());
          }
          return;
        }
        setUsage(null);
        setUsageError(usageResult.reason instanceof Error ? usageResult.reason.message : "使用记录暂时不可用");
      })
      .finally(() => setIsLoadingUsage(false));
  }, [isSub2APIUser]);

  useEffect(() => {
    loadUsage();
  }, [loadUsage]);

  const openUsageURL = () => {
    window.open(usageURL || usage?.recharge_url || "https://ai.3zapi.top", "_blank", "noopener,noreferrer");
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="text-lg">使用记录</CardTitle>
            <CardDescription>同步展示账户中心最近消费与充值流水。</CardDescription>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button type="button" variant="outline" className="h-9 rounded-lg" onClick={loadUsage} disabled={isLoadingUsage}>
              {isLoadingUsage ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              刷新
            </Button>
            <Button type="button" className="h-9 rounded-lg" onClick={openUsageURL}>
              <ExternalLink className="size-4" />
              账户中心
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {usageError ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/25 dark:text-amber-200">
            {usageError}
          </div>
        ) : null}
        {!isSub2APIUser ? (
          <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm leading-6 text-muted-foreground">
            当前账号是本地账号，本地完整账单流水尚未单独归档；如需查看 Sub2API 的扣费、充值和余额流水，请打开账户中心。
          </div>
        ) : null}
        {isLoadingUsage ? (
          <div className="flex min-h-48 items-center justify-center rounded-xl border border-border bg-muted/30 text-muted-foreground">
            <LoaderCircle className="size-5 animate-spin" />
          </div>
        ) : (
          <>
            <UsageRecordTable title="最近消费" items={usage?.items || []} emptyText="暂无消费记录" fallbackTitle="消费记录" />
            <UsageRecordTable title="充值记录" items={usage?.recent_recharges || []} emptyText="暂无充值记录" fallbackTitle="充值记录" />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function UsageRecordTable({
  title,
  items,
  emptyText,
  fallbackTitle,
}: {
  title: string;
  items: Sub2APIUsageRecord[];
  emptyText: string;
  fallbackTitle: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-[#f2f2f2]/55 dark:bg-muted/20">
      <div className="flex items-center gap-2 border-b border-border bg-muted/45 px-4 py-2.5 text-sm font-semibold text-foreground">
        <ReceiptText className="size-4 text-muted-foreground" />
        {title}
      </div>
      <div className={`divide-y divide-border sm:hidden ${usageRecordScrollClassName}`}>
        {items.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">{emptyText}</div>
        ) : (
          items.map((item, index) => (
            <UsageRecordMobileItem key={usageRecordKey(item, index)} item={item} fallbackTitle={fallbackTitle} />
          ))
        )}
      </div>
      <div className={`hidden overflow-x-auto sm:block ${usageRecordScrollClassName}`}>
        <Table className="min-w-[760px] text-[13px]">
          <TableHeader className="bg-[#e7e7e7] text-xs normal-case tracking-normal text-[#555] dark:bg-muted/55 dark:text-muted-foreground">
            <TableRow>
              <TableHead className="h-9 min-w-[166px] px-3 font-medium">时间</TableHead>
              <TableHead className="h-9 w-[92px] px-3 font-medium">类型</TableHead>
              <TableHead className="h-9 min-w-[190px] px-3 font-medium">模型</TableHead>
              <TableHead className="h-9 w-[110px] px-3 font-medium">消耗</TableHead>
              <TableHead className="h-9 w-[92px] px-3 font-medium">耗时</TableHead>
              <TableHead className="h-9 w-[110px] px-3 font-medium">状态</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  {emptyText}
                </TableCell>
              </TableRow>
            ) : (
              items.map((item, index) => {
                const amount = usageAmountLabel(item);
                const type = usageTypeLabel(item, fallbackTitle);
                const model = usageModelLabel(item);
                const taskID = usageTaskID(item);
                const duration = usageDurationLabel(item);
                const status = usageStatus(item);
                return (
                  <TableRow key={usageRecordKey(item, index)} className="bg-[#f4f4f4]/70 hover:bg-background/80 dark:bg-transparent dark:hover:bg-muted/45">
                    <TableCell className="h-11 whitespace-nowrap px-3 py-2 text-[#666] dark:text-muted-foreground">{usageRecordTime(item)}</TableCell>
                    <TableCell className="h-11 px-3 py-2">
                      <Badge variant="secondary" className="rounded-md bg-[#e3e3e3] px-2 py-0.5 text-xs font-medium text-[#333] dark:bg-muted dark:text-foreground">
                        {type}
                      </Badge>
                    </TableCell>
                    <TableCell className="h-11 px-3 py-2">
                      <CopyableUsageText value={model} label="模型" />
                    </TableCell>
                    <TableCell className="h-11 whitespace-nowrap px-3 py-2 font-mono font-semibold text-foreground">{amount}</TableCell>
                    <TableCell className="h-11 whitespace-nowrap px-3 py-2 font-mono text-[#666] dark:text-muted-foreground">{duration}</TableCell>
                    <TableCell className="h-11 whitespace-nowrap px-3 py-2">
                      <div className="inline-flex items-center gap-3">
                        <UsageStatusBadge status={status} />
                        <CopyUsageTaskIDButton taskID={taskID} />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function UsageRecordMobileItem({ item, fallbackTitle }: { item: Sub2APIUsageRecord; fallbackTitle: string }) {
  const amount = usageAmountLabel(item);
  const model = usageModelLabel(item);
  const type = usageTypeLabel(item, fallbackTitle);
  const taskID = usageTaskID(item);
  const duration = usageDurationLabel(item);
  const status = usageStatus(item);
  return (
    <div className="grid gap-2 bg-[#f4f4f4]/70 px-4 py-3 dark:bg-transparent">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{usageRecordTime(item)}</div>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant="secondary" className="rounded-md bg-[#e3e3e3] px-2 py-0.5 text-xs font-medium text-[#333] dark:bg-muted dark:text-foreground">
              {type}
            </Badge>
            <div className="inline-flex items-center gap-3">
              <UsageStatusBadge status={status} />
              <CopyUsageTaskIDButton taskID={taskID} />
            </div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[11px] text-muted-foreground">消耗</div>
          <div className="font-mono text-sm font-semibold text-foreground">{amount}</div>
        </div>
      </div>
      <div className="grid gap-1.5 rounded-md bg-background/70 px-2.5 py-2 dark:bg-muted/25">
        <div className="grid min-w-0 grid-cols-[48px_minmax(0,1fr)] items-center gap-2">
          <span className="text-xs text-muted-foreground">模型</span>
          <CopyableUsageText value={model} label="模型" />
        </div>
        <div className="grid min-w-0 grid-cols-[48px_minmax(0,1fr)] items-center gap-2">
          <span className="text-xs text-muted-foreground">耗时</span>
          <span className="font-mono text-[13px] text-foreground">{duration}</span>
        </div>
      </div>
    </div>
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
