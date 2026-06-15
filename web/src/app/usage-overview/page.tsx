"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, BarChart3, Clock3, MousePointerClick, RefreshCw, Timer, UsersRound } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  fetchUsageOverview,
  type UsageOverviewPage,
  type UsageOverviewResponse,
  type UsageOverviewSummary,
  type UsageOverviewTaskLog,
  type UsageOverviewTaskMode,
} from "@/lib/api";
import { useAuthGuard } from "@/lib/use-auth-guard";
import { cn } from "@/lib/utils";

const emptySummary: UsageOverviewSummary = {
  task_count: 0,
  success_count: 0,
  failure_count: 0,
  cancelled_count: 0,
  running_count: 0,
  queued_count: 0,
  local_consumed_amount: 0,
  external_consumed_amount: 0,
  duration_seconds: 0,
  page_views: 0,
  page_clicks: 0,
  stay_ms: 0,
  active_seconds: 0,
  unique_user_count: 0,
};

const emptyOverview: UsageOverviewResponse = {
  today: emptySummary,
  last_7_days: [],
  pages: [],
  task_modes: [],
  recent_task_logs: [],
};

function numeric(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
}

function integer(value: unknown) {
  return Math.round(numeric(value)).toLocaleString("zh-CN");
}

function fixed(value: unknown, digits = 2) {
  return numeric(value).toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function percent(success: unknown, total: unknown) {
  const totalValue = numeric(total);
  if (totalValue <= 0) {
    return "0%";
  }
  return `${Math.round((numeric(success) / totalValue) * 100)}%`;
}

function duration(value: unknown) {
  const seconds = Math.max(0, Math.round(numeric(value)));
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;
  if (minutes < 60) {
    return restSeconds ? `${minutes}m ${restSeconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes ? `${hours}h ${restMinutes}m` : `${hours}h`;
}

function displayDate(value: string | undefined) {
  if (!value) {
    return "-";
  }
  const parts = value.split("-");
  if (parts.length === 3) {
    return `${parts[1]}/${parts[2]}`;
  }
  return value;
}

function displayTime(value: string | undefined) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.replace("T", " ").slice(0, 19);
  }
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(status: string) {
  switch (status) {
    case "success":
      return "成功";
    case "error":
      return "失败";
    case "cancelled":
      return "取消";
    case "running":
      return "运行中";
    case "queued":
      return "排队中";
    default:
      return status || "-";
  }
}

function statusVariant(status: string) {
  switch (status) {
    case "success":
      return "success";
    case "error":
      return "danger";
    case "cancelled":
      return "warning";
    case "running":
      return "info";
    default:
      return "secondary";
  }
}

function maxMetric<T>(items: T[], selector: (item: T) => number) {
  return Math.max(1, ...items.map(selector));
}

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="h-24 text-center text-sm text-muted-foreground">
        {text}
      </TableCell>
    </TableRow>
  );
}

function KpiCard({
  title,
  value,
  detail,
  icon: Icon,
  accent,
}: {
  title: string;
  value: string;
  detail?: string;
  icon: typeof Activity;
  accent: string;
}) {
  return (
    <Card className="overflow-hidden rounded-lg">
      <CardContent className="flex min-h-[124px] items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="text-xs font-medium text-muted-foreground">{title}</div>
          <div className="mt-2 truncate text-2xl font-semibold text-foreground">{value}</div>
          {detail ? <div className="mt-1 text-xs text-muted-foreground">{detail}</div> : null}
        </div>
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", accent)}>
          <Icon className="size-4" />
        </span>
      </CardContent>
    </Card>
  );
}

function RankingItem({
  label,
  value,
  max,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  tone: string;
}) {
  const width = `${Math.max(4, Math.round((Math.max(0, value) / max) * 100))}%`;
  return (
    <div className="grid gap-2">
      <div className="flex min-w-0 items-center justify-between gap-3 text-sm">
        <span className="min-w-0 truncate font-medium text-foreground">{label}</span>
        <span className="shrink-0 text-muted-foreground">{integer(value)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", tone)} style={{ width }} />
      </div>
    </div>
  );
}

function RankingPanel({
  title,
  items,
  value,
  label,
  tone,
  emptyText,
}: {
  title: string;
  items: Array<UsageOverviewPage | UsageOverviewTaskMode>;
  value: (item: UsageOverviewPage | UsageOverviewTaskMode) => number;
  label: (item: UsageOverviewPage | UsageOverviewTaskMode) => string;
  tone: string;
  emptyText: string;
}) {
  const sortedItems = [...items].sort((left, right) => value(right) - value(left)).slice(0, 5);
  const max = maxMetric(sortedItems, value);
  return (
    <Card className="rounded-lg">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {sortedItems.length > 0 ? (
          sortedItems.map((item) => (
            <RankingItem key={`${title}-${label(item)}`} label={label(item)} value={value(item)} max={max} tone={tone} />
          ))
        ) : (
          <div className="flex min-h-[118px] items-center justify-center text-sm text-muted-foreground">{emptyText}</div>
        )}
      </CardContent>
    </Card>
  );
}

function ConsumptionText({ local, external }: { local: unknown; external: unknown }) {
  return (
    <div className="grid gap-0.5">
      <span>{integer(local)} 本地额度</span>
      <span className="text-muted-foreground">{fixed(external, 4)} Sub2API</span>
    </div>
  );
}

function UsageOverviewPage() {
  const { isCheckingAuth, session } = useAuthGuard(["admin"], "/usage-overview");
  const [overview, setOverview] = useState<UsageOverviewResponse>(emptyOverview);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadOverview = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const data = await fetchUsageOverview(7);
      setOverview({
        today: { ...emptySummary, ...data.today },
        last_7_days: Array.isArray(data.last_7_days) ? data.last_7_days.map((item) => ({ ...emptySummary, ...item })) : [],
        pages: Array.isArray(data.pages) ? data.pages : [],
        task_modes: Array.isArray(data.task_modes) ? data.task_modes : [],
        recent_task_logs: Array.isArray(data.recent_task_logs) ? data.recent_task_logs : [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isCheckingAuth && session?.role === "admin") {
      void loadOverview();
    }
  }, [isCheckingAuth, loadOverview, session?.role]);

  const today = overview.today || emptySummary;
  const taskModeMax = useMemo(() => maxMetric(overview.task_modes, (item) => numeric(item.task_count)), [overview.task_modes]);
  const trendMax = useMemo(
    () =>
      maxMetric(overview.last_7_days, (item) =>
        Math.max(numeric(item.task_count), numeric(item.page_views), Math.ceil(numeric(item.active_seconds) / 60)),
      ),
    [overview.last_7_days],
  );
  const topTaskModes = useMemo(() => [...overview.task_modes].sort((left, right) => numeric(right.task_count) - numeric(left.task_count)), [overview.task_modes]);

  if (isCheckingAuth || !session) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center text-sm text-muted-foreground">
        正在加载
      </div>
    );
  }

  if (session.role !== "admin") {
    return (
      <div className="flex min-h-[45vh] items-center justify-center text-sm text-muted-foreground">
        需要管理员权限
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-6 py-4">
      <PageHeader
        eyebrow="Admin Analytics"
        title="使用分析"
        actions={
          <Button type="button" variant="outline" className="h-9 rounded-lg" onClick={() => void loadOverview()} disabled={isLoading}>
            <RefreshCw className={cn("size-4", isLoading && "animate-spin")} />
            刷新
          </Button>
        }
      />

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
          {error}
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="今日任务"
          value={integer(today.task_count)}
          detail={`成功率 ${percent(today.success_count, today.task_count)} · 失败 ${integer(today.failure_count)}`}
          icon={Activity}
          accent="bg-sky-50 text-[#1456f0] dark:bg-sky-950/30 dark:text-sky-300"
        />
        <KpiCard
          title="今日消耗"
          value={`${integer(today.local_consumed_amount)} 本地`}
          detail={`${fixed(today.external_consumed_amount, 4)} Sub2API`}
          icon={BarChart3}
          accent="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
        />
        <KpiCard
          title="页面访问"
          value={integer(today.page_views)}
          detail={`点击 ${integer(today.page_clicks)} · 匿名用户 ${integer(today.unique_user_count)}`}
          icon={MousePointerClick}
          accent="bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
        />
        <KpiCard
          title="活跃停留"
          value={duration(today.active_seconds)}
          detail={`任务耗时 ${duration(today.duration_seconds)}`}
          icon={Timer}
          accent="bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300"
        />
      </section>

      <section className="grid gap-3 xl:grid-cols-4">
        <RankingPanel
          title="点击最多页面"
          items={overview.pages}
          value={(item) => numeric((item as UsageOverviewPage).page_clicks)}
          label={(item) => (item as UsageOverviewPage).label || (item as UsageOverviewPage).path}
          tone="bg-[#1456f0]"
          emptyText="暂无页面点击"
        />
        <RankingPanel
          title="停留最长页面"
          items={overview.pages}
          value={(item) => numeric((item as UsageOverviewPage).active_seconds)}
          label={(item) => (item as UsageOverviewPage).label || (item as UsageOverviewPage).path}
          tone="bg-violet-500"
          emptyText="暂无停留数据"
        />
        <RankingPanel
          title="任务最多功能"
          items={topTaskModes}
          value={(item) => numeric((item as UsageOverviewTaskMode).task_count)}
          label={(item) => (item as UsageOverviewTaskMode).label || (item as UsageOverviewTaskMode).mode}
          tone="bg-emerald-500"
          emptyText="暂无任务数据"
        />
        <RankingPanel
          title="本地消耗最高功能"
          items={topTaskModes}
          value={(item) => numeric((item as UsageOverviewTaskMode).local_consumed_amount)}
          label={(item) => (item as UsageOverviewTaskMode).label || (item as UsageOverviewTaskMode).mode}
          tone="bg-amber-500"
          emptyText="暂无本地消耗数据"
        />
      </section>

      <section className="grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Card className="overflow-hidden rounded-lg">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Clock3 className="size-4 text-muted-foreground" />
              近 7 天趋势
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table className="min-w-[760px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>日期</TableHead>
                    <TableHead>任务</TableHead>
                    <TableHead>本地消耗</TableHead>
                    <TableHead>外部消耗</TableHead>
                    <TableHead>访问</TableHead>
                    <TableHead>停留</TableHead>
                    <TableHead className="w-[160px]">强度</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overview.last_7_days.length > 0 ? (
                    overview.last_7_days.map((item, index) => {
                      const barValue = Math.max(numeric(item.task_count), numeric(item.page_views), Math.ceil(numeric(item.active_seconds) / 60));
                      const width = `${Math.max(3, Math.round((barValue / trendMax) * 100))}%`;
                      return (
                        <TableRow key={String(item.date || `day-${index}`)} className="text-muted-foreground">
                          <TableCell className="whitespace-nowrap font-medium text-foreground">{displayDate(item.date)}</TableCell>
                          <TableCell>{integer(item.task_count)}</TableCell>
                          <TableCell>{integer(item.local_consumed_amount)}</TableCell>
                          <TableCell>{fixed(item.external_consumed_amount, 4)}</TableCell>
                          <TableCell>{integer(item.page_views)}</TableCell>
                          <TableCell>{duration(item.active_seconds)}</TableCell>
                          <TableCell>
                            <div className="h-2 overflow-hidden rounded-full bg-muted">
                              <div className="h-full rounded-full bg-[#1456f0]" style={{ width }} />
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <EmptyRow colSpan={7} text="暂无趋势数据" />
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-lg">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <UsersRound className="size-4 text-muted-foreground" />
              功能任务分布
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {topTaskModes.length > 0 ? (
              topTaskModes.slice(0, 6).map((item) => {
                const width = `${Math.max(4, Math.round((numeric(item.task_count) / taskModeMax) * 100))}%`;
                return (
                  <div key={item.mode} className="grid gap-2">
                    <div className="flex min-w-0 items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate font-medium text-foreground">{item.label || item.mode}</span>
                      <span className="shrink-0 text-muted-foreground">{integer(item.task_count)} 个</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width }} />
                    </div>
                    <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                      <Badge variant="success" className="rounded-md">成功 {integer(item.success_count)}</Badge>
                      <Badge variant="danger" className="rounded-md">失败 {integer(item.failure_count)}</Badge>
                      <span className="ml-auto">{integer(item.local_consumed_amount)} 本地 / {fixed(item.external_consumed_amount, 4)} 外部</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex min-h-[264px] items-center justify-center text-sm text-muted-foreground">暂无任务分布</div>
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className="overflow-hidden rounded-lg">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">今日最近任务日志</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table className="min-w-[900px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>时间</TableHead>
                    <TableHead>功能</TableHead>
                    <TableHead>模型</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>耗时</TableHead>
                    <TableHead>消耗</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overview.recent_task_logs.length > 0 ? (
                    overview.recent_task_logs.map((item: UsageOverviewTaskLog) => (
                      <TableRow key={item.id} className="text-muted-foreground">
                        <TableCell className="whitespace-nowrap text-foreground">{displayTime(item.updated_at || item.created_at)}</TableCell>
                        <TableCell>{item.label || item.mode || "-"}</TableCell>
                        <TableCell className="max-w-[220px] truncate">{item.model || "-"}</TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(item.status)} className="rounded-md">
                            {statusLabel(item.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>{typeof item.duration_seconds === "number" ? duration(item.duration_seconds) : "-"}</TableCell>
                        <TableCell>
                          <ConsumptionText local={item.local_consumed_amount} external={item.external_consumed_amount} />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <EmptyRow colSpan={6} text="今日暂无任务日志" />
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

export default UsageOverviewPage;
