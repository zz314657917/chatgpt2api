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
  const canRepairDirty = dirtyCount > 0;
  const canFinalizeActive = activeCount > 0;

  useEffect(() => {
    if (didLoadRef.current) {
      return;
    }
    didLoadRef.current = true;
    void loadDiagnostics();
  }, [loadDiagnostics]);

  const handleRepairDirty = async () => {
    await repairStatuses(false);
  };

  const handleFinalizeActive = async () => {
    await repairStatuses(true);
    setFinalizeDialogOpen(false);
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
          onClick={() => void loadDiagnostics()}
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
                label="脏终态任务"
                value={String(dirtyCount)}
                tone={dirtyCount > 0 ? "danger" : "default"}
              />
              <StatBlock
                label="占用并发"
                value={String(diagnostics?.running_units ?? 0)}
                tone={(diagnostics?.running_units ?? 0) > 0 ? "warning" : "default"}
              />
            </section>

            <section className={settingsPanelClassName}>
              <div className="grid gap-3 text-sm leading-6 sm:grid-cols-2">
                <div className="min-w-0">
                  <span className="text-muted-foreground">queued / running</span>
                  <p className="font-semibold text-foreground">
                    {diagnostics?.queued_tasks ?? 0} / {diagnostics?.running_tasks ?? 0}
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
                上次修复终态任务 {lastRepair.repaired_terminal_tasks} 个，终止活动任务{" "}
                {lastRepair.finalized_active_tasks} 个，取消运行处理器{" "}
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
              会把当前 queued/running 的创作任务标记为 error，并尝试取消仍在运行的处理器。
            </DialogDescription>
          </DialogHeader>
          <div className={settingsPanelClassName}>
            当前检测到 {activeCount} 个活动任务。确认后这些任务不会继续占用创作并发额度。
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
