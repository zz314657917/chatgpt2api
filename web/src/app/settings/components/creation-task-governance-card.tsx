"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Wrench,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import { useSettingsStore } from "../store";
import {
  SettingsCard,
  SettingsNotice,
  settingsPanelClassName,
} from "./settings-ui";

const DEFAULT_STALE_SECONDS = 600;

function normalizeStaleSeconds(value: string) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return DEFAULT_STALE_SECONDS;
  return Math.min(604800, Math.max(1, Math.round(seconds)));
}

function formatDuration(seconds: number) {
  if (seconds >= 3600 && seconds % 3600 === 0) return `${seconds / 3600} 小时`;
  if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60} 分钟`;
  return `${seconds} 秒`;
}

function formatAge(seconds: number) {
  if (seconds >= 86400) return `${Math.floor(seconds / 86400)} 天`;
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)} 小时`;
  if (seconds >= 60) return `${Math.floor(seconds / 60)} 分钟`;
  return `${Math.max(0, Math.floor(seconds))} 秒`;
}

function StatBlock({
  label,
  tone = "default",
  value,
}: {
  label: string;
  tone?: "default" | "danger" | "warning";
  value: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-20 flex-col justify-between rounded-[16px] border bg-background px-4 py-3 shadow-[0_4px_6px_rgba(0,0,0,0.04)]",
        tone === "danger"
          ? "border-red-200 bg-red-50/70"
          : tone === "warning"
            ? "border-amber-200 bg-amber-50/70"
            : "border-border/80",
      )}
    >
      <span className="text-xs leading-5 font-medium text-muted-foreground">
        {label}
      </span>
      <span className="truncate text-lg leading-7 font-semibold text-foreground">
        {value}
      </span>
    </div>
  );
}

export function CreationTaskGovernanceCard() {
  const [finalizeDialogOpen, setFinalizeDialogOpen] = useState(false);
  const [staleSecondsValue, setStaleSecondsValue] = useState(String(DEFAULT_STALE_SECONDS));
  const didLoadRef = useRef(false);
  const diagnostics = useSettingsStore((state) => state.creationTaskDiagnostics);
  const lastRepair = useSettingsStore((state) => state.lastCreationTaskRepair);
  const isLoading = useSettingsStore(
    (state) => state.isLoadingCreationTaskDiagnostics,
  );
  const isRepairing = useSettingsStore((state) => state.isRepairingCreationTasks);
  const loadDiagnostics = useSettingsStore(
    (state) => state.loadCreationTaskDiagnostics,
  );
  const repairStatuses = useSettingsStore(
    (state) => state.repairCreationTaskStatuses,
  );

  const dirtyCount = diagnostics?.dirty_terminal_tasks ?? 0;
  const activeCount = diagnostics?.active_tasks ?? 0;
  const staleSeconds = normalizeStaleSeconds(staleSecondsValue);
  const staleCount = diagnostics?.stale_active_tasks ?? 0;
  const suspiciousTasks = diagnostics?.suspicious_tasks ?? [];
  const canRepairDirty = dirtyCount > 0;
  const canFinalizeActive = staleCount > 0;

  useEffect(() => {
    if (didLoadRef.current) {
      return;
    }
    didLoadRef.current = true;
    void loadDiagnostics(false, staleSeconds);
  }, [loadDiagnostics, staleSeconds]);

  const handleRepairDirty = async () => {
    await repairStatuses(false, staleSeconds);
  };

  const handleFinalizeActive = async () => {
    await repairStatuses(true, staleSeconds);
    setFinalizeDialogOpen(false);
  };

  const handleRefresh = () => {
    void loadDiagnostics(false, staleSeconds);
  };

  return (
    <SettingsCard
      icon={Wrench}
      title="创作任务治理"
      description="诊断创作任务队列状态，修复历史脏状态或终止卡住的任务。"
      tone="amber"
      action={
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={handleRefresh}
          disabled={isLoading}
        >
          {isLoading ? (
            <LoaderCircle data-icon="inline-start" className="animate-spin" />
          ) : (
            <RefreshCw data-icon="inline-start" />
          )}
          刷新
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        {isLoading && !diagnostics ? (
          <div className="flex items-center justify-center rounded-[16px] border border-border/80 bg-background py-10">
            <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-3">
              <StatBlock
                label="活动任务"
                value={String(activeCount)}
                tone={activeCount > 0 ? "warning" : "default"}
              />
              <StatBlock
                label="疑似卡住"
                value={String(staleCount)}
                tone={staleCount > 0 ? "danger" : "default"}
              />
              <StatBlock
                label="脏终态任务"
                value={String(dirtyCount)}
                tone={dirtyCount > 0 ? "danger" : "default"}
              />
            </section>

            <section className={settingsPanelClassName}>
              <div className="grid gap-3 text-sm leading-6 sm:grid-cols-2 lg:grid-cols-3">
                <div className="min-w-0">
                  <span className="text-muted-foreground">queued / running</span>
                  <p className="font-semibold text-foreground">
                    {diagnostics?.queued_tasks ?? 0} / {diagnostics?.running_tasks ?? 0}
                  </p>
                </div>
                <div className="min-w-0">
                  <span className="text-muted-foreground">占用并发</span>
                  <p className="font-semibold text-foreground">
                    {diagnostics?.running_units ?? 0}
                  </p>
                </div>
                <div className="min-w-0">
                  <span className="text-muted-foreground">活动 output_statuses</span>
                  <p className="font-semibold text-foreground">
                    {diagnostics?.active_output_statuses ?? 0}
                  </p>
                </div>
                <div className="min-w-0">
                  <span className="text-muted-foreground">终态任务</span>
                  <p className="font-semibold text-foreground">
                    {diagnostics?.terminal_tasks ?? 0}
                  </p>
                </div>
                <div className="min-w-0">
                  <span className="text-muted-foreground">任务总数</span>
                  <p className="font-semibold text-foreground">
                    {diagnostics?.total_tasks ?? 0}
                  </p>
                </div>
              </div>
            </section>

            <section className={settingsPanelClassName}>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px] sm:items-end">
                <div>
                  <span className="text-sm font-medium text-foreground">卡住阈值</span>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    只有 updated_at 超过该阈值的 queued/running 任务会被终止。
                  </p>
                </div>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={604800}
                  value={staleSecondsValue}
                  onChange={(event) => setStaleSecondsValue(event.target.value)}
                  onBlur={handleRefresh}
                  aria-label="卡住阈值秒数"
                />
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                当前阈值：{formatDuration(staleSeconds)}
              </p>
            </section>

            {suspiciousTasks.length > 0 ? (
              <section className={settingsPanelClassName}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-foreground">可疑任务</span>
                  <span className="text-xs text-muted-foreground">最多显示 20 条</span>
                </div>
                <div className="space-y-2">
                  {suspiciousTasks.map((task) => (
                    <div
                      key={`${task.owner_id}:${task.id}`}
                      className="grid gap-2 rounded-[12px] border border-border/70 bg-background px-3 py-2 text-xs leading-5 sm:grid-cols-[minmax(0,1fr)_auto]"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">
                          {task.id} · {task.status} · {task.mode}
                        </p>
                        <p className="truncate text-muted-foreground">
                          {task.owner_id || "unknown"} · 更新于 {task.updated_at || "-"}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-muted-foreground sm:justify-end">
                        <span>{formatAge(task.age_seconds)}前</span>
                        {task.stale ? <span className="text-red-600">超阈值</span> : null}
                        {task.dirty_terminal ? <span className="text-amber-600">终态脏状态</span> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => void handleRepairDirty()}
                disabled={isRepairing || !canRepairDirty}
              >
                {isRepairing ? (
                  <LoaderCircle data-icon="inline-start" className="animate-spin" />
                ) : (
                  <RotateCcw data-icon="inline-start" />
                )}
                修复终态状态
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="w-full"
                onClick={() => setFinalizeDialogOpen(true)}
                disabled={isRepairing || !canFinalizeActive}
              >
                <AlertTriangle data-icon="inline-start" />
                终止卡住任务
              </Button>
            </div>

            {lastRepair ? (
              <SettingsNotice>
                上次修复终态任务 {lastRepair.repaired_terminal_tasks} 个，终止卡住任务{" "}
                {lastRepair.finalized_active_tasks} 个，跳过未超时活动任务{" "}
                {lastRepair.skipped_active_tasks} 个，取消运行处理器{" "}
                {lastRepair.cancelled_handlers} 个。
              </SettingsNotice>
            ) : (
              <SettingsNotice>
                默认修复只处理已经终态但 output_statuses 仍是 queued/running 的历史脏状态。
              </SettingsNotice>
            )}
          </>
        )}
      </div>

      <Dialog open={finalizeDialogOpen} onOpenChange={setFinalizeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>终止卡住的创作任务</DialogTitle>
            <DialogDescription>
              只会把超过阈值的 queued/running 创作任务标记为 error，并尝试取消仍在运行的处理器。
            </DialogDescription>
          </DialogHeader>
          <div className={settingsPanelClassName}>
            当前检测到 {activeCount} 个活动任务，其中 {staleCount} 个超过{" "}
            {formatDuration(staleSeconds)}。未超过阈值的任务会被跳过。
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                取消
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleFinalizeActive()}
              disabled={isRepairing}
            >
              {isRepairing ? (
                <LoaderCircle data-icon="inline-start" className="animate-spin" />
              ) : (
                <AlertTriangle data-icon="inline-start" />
              )}
              确认终止
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsCard>
  );
}
