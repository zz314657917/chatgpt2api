"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CheckCircle2, Clock3, ClipboardList, LoaderCircle, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SMART_CANVAS_QUEUE_CHANGED_EVENT, type SmartCanvasQueueChangedDetail } from "@/app/canvas/canvas-events";
import { normalizeSmartCanvas, smartCanvasRuns } from "@/app/canvas/canvas-utils";
import type { SmartCanvasDocument, SmartCanvasRunRecord } from "@/app/canvas/types";
import { fetchCanvases, IMAGE_MODEL_ROUTE_DETAILS, type CanvasDocument, type CreationTask } from "@/lib/api";
import { formatImageSizeDisplay, getImageSizeRequirementLabel, isHighResolutionImageSize } from "@/lib/image-parameters";
import { cn } from "@/lib/utils";
import {
  ACTIVE_IMAGE_CONVERSATION_STORAGE_KEY,
  IMAGE_ACTIVE_CONVERSATION_REQUEST_EVENT,
  IMAGE_CONVERSATIONS_CHANGED_EVENT,
  listImageConversations,
  getImageTurnLoadingCounts,
  getImageTurnLoadingPhase,
  type ImageConversation,
  type ImageConversationMode,
  type ImageTurn,
  type ImageTurnLoadingPhase,
  type ImageTurnStatus,
} from "@/store/image-conversations";
import {
  getImageTurnProgressSnapshot,
  imageTurnStartedAtTimestamp,
  imageTurnProgressKey,
  subscribeImageTurnProgress,
} from "@/store/image-turn-progress";

type TaskQueueItem = {
  source: "image";
  conversationId: string;
  conversationTitle: string;
  turn: ImageTurn;
  totalCount: number;
  queuedCount: number;
  runningCount: number;
  completedCount: number;
  failedCount: number;
  cancelledCount: number;
};

type CanvasQueueItem = {
  source: "canvas";
  canvasId: string;
  canvasTitle: string;
  run: SmartCanvasRunRecord;
  totalCount: number;
  completedCount: number;
  failedCount: number;
  cancelledCount: number;
};

type QueueItemModel = TaskQueueItem | CanvasQueueItem;

type RecentQueueCompletion = QueueItemModel & {
  key: string;
  completedAt: number;
  finalStatus: ImageTurnStatus | CreationTask["status"];
};

function isTurnBusy(turn: ImageTurn) {
  return (
    turn.status === "queued" ||
    turn.status === "generating" ||
    turn.images.some((image) => image.status === "loading")
  );
}

function isTerminalTurnStatus(status: ImageTurnStatus) {
  return status === "success" || status === "message" || status === "error" || status === "cancelled";
}

function isCanvasRunBusy(run: SmartCanvasRunRecord) {
  return run.status === "queued" || run.status === "running";
}

function isTerminalCanvasRunStatus(status?: CreationTask["status"]) {
  return status === "success" || status === "error" || status === "cancelled";
}

function formatElapsedClock(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatQueueTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getModeLabel(mode: ImageConversationMode) {
  if (mode === "chat") {
    return "对话";
  }
  if (mode === "edit") {
    return "继续编辑";
  }
  if (mode === "image") {
    return "参考图";
  }
  return "文生图";
}

function getStatusLabel(status: ImageTurnStatus) {
  if (status === "queued") {
    return "排队中";
  }
  if (status === "generating") {
    return "处理中";
  }
  if (status === "success") {
    return "已完成";
  }
  if (status === "message") {
    return "文本回复";
  }
  if (status === "cancelled") {
    return "已终止";
  }
  return "失败";
}

function getCanvasStatusLabel(status?: CreationTask["status"]) {
  if (status === "queued") {
    return "排队中";
  }
  if (status === "running") {
    return "处理中";
  }
  if (status === "success") {
    return "已完成";
  }
  if (status === "cancelled") {
    return "已终止";
  }
  if (status === "error") {
    return "失败";
  }
  return "处理中";
}

function getStatusClass(status: ImageTurnStatus) {
  if (status === "queued") {
    return "bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-800";
  }
  if (status === "generating") {
    return "bg-sky-50 text-[#1456f0] ring-sky-100 dark:bg-sky-950/30 dark:text-sky-300 dark:ring-sky-800";
  }
  return "bg-muted text-muted-foreground ring-border";
}

function getCanvasStatusClass(status?: CreationTask["status"]) {
  if (status === "queued") {
    return "bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-800";
  }
  if (status === "running") {
    return "bg-sky-50 text-[#1456f0] ring-sky-100 dark:bg-sky-950/30 dark:text-sky-300 dark:ring-sky-800";
  }
  return "bg-muted text-muted-foreground ring-border";
}

function getQueueSizeLabel(turn: ImageTurn) {
  if (!turn.size) {
    return "";
  }
  const size = turn.size.includes("x") ? formatImageSizeDisplay(turn.size) : turn.size;
  const requirement = getImageSizeRequirementLabel(turn.size);
  return requirement === "Auto" ? size : `${size} / ${requirement}`;
}

function getQueueLongTaskHint(turn: ImageTurn, elapsedSeconds: number) {
  void elapsedSeconds;
  if (turn.mode === "chat") {
    return "";
  }
  if (isHighResolutionImageSize(turn.size)) {
    return "高分辨率目标已提交给上游判断";
  }
  return "";
}

function getImageModelRouteDetail(model?: string) {
  return model && model in IMAGE_MODEL_ROUTE_DETAILS
    ? IMAGE_MODEL_ROUTE_DETAILS[model as keyof typeof IMAGE_MODEL_ROUTE_DETAILS]
    : undefined;
}

function getQueueLoadingDetail(item: TaskQueueItem, loadingPhase: ImageTurnLoadingPhase) {
  if (item.turn.mode === "chat") {
    if (loadingPhase === "queued") {
      return "正在准备回复";
    }
    if (loadingPhase === "running") {
      return "对话任务处理中";
    }
    return "";
  }
  if (loadingPhase === "queued") {
    return `还有 ${item.queuedCount} 张图片排队中`;
  }
  if (loadingPhase === "running") {
    return `还有 ${item.runningCount} 张图片处理中`;
  }
  return "";
}

function getCompletionTone(status: RecentQueueCompletion["finalStatus"]) {
  if (status === "success" || status === "message") {
    return {
      iconClass: "bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-800",
      badgeClass: "bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-800",
      barClass: "bg-emerald-500",
      message: "任务已完成",
    };
  }
  if (status === "cancelled") {
    return {
      iconClass: "bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-800",
      badgeClass: "bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-800",
      barClass: "bg-amber-500",
      message: "任务已终止",
    };
  }
  return {
    iconClass: "bg-rose-50 text-rose-700 ring-rose-100 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-800",
    badgeClass: "bg-rose-50 text-rose-700 ring-rose-100 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-800",
    barClass: "bg-rose-500",
    message: "任务失败",
  };
}

function getQueueItemKey(item: QueueItemModel) {
  return item.source === "image"
    ? `image:${item.conversationId}:${item.turn.id}`
    : `canvas:${item.canvasId}:${item.run.id}:${item.run.taskId || ""}`;
}

function getQueueItemCreatedAt(item: QueueItemModel) {
  return item.source === "image" ? item.turn.createdAt : item.run.startedAt || item.run.createdAt;
}

function isQueueItemBusy(item: QueueItemModel) {
  return item.source === "image" ? isTurnBusy(item.turn) : isCanvasRunBusy(item.run);
}

function isQueueItemTerminal(item: QueueItemModel) {
  return item.source === "image"
    ? isTerminalTurnStatus(item.turn.status)
    : isTerminalCanvasRunStatus(item.run.status);
}

function getQueueItemFinalStatus(item: QueueItemModel): RecentQueueCompletion["finalStatus"] {
  return item.source === "image" ? item.turn.status : item.run.status;
}

function getQueueItem(conversation: ImageConversation, turn: ImageTurn): TaskQueueItem {
  const { queued: queuedCount, running: runningCount } = getImageTurnLoadingCounts(turn);
  const completedCount = turn.images.filter((image) => image.status === "success" || image.status === "message").length;
  const failedCount = turn.images.filter((image) => image.status === "error").length;
  const cancelledCount = turn.images.filter((image) => image.status === "cancelled").length;
  const totalCount = Math.max(1, turn.mode === "chat" ? 1 : turn.count || turn.images.length || 1);
  return {
    source: "image",
    conversationId: conversation.id,
    conversationTitle: conversation.title,
    turn,
    totalCount,
    queuedCount,
    runningCount,
    completedCount,
    failedCount,
    cancelledCount,
  };
}

function getCanvasQueueItem(canvas: SmartCanvasDocument, run: SmartCanvasRunRecord): CanvasQueueItem {
  const totalCount = Math.max(1, run.images.length || 1);
  return {
    source: "canvas",
    canvasId: canvas.id,
    canvasTitle: canvas.name,
    run,
    totalCount,
    completedCount: run.status === "success" ? totalCount : 0,
    failedCount: run.status === "error" ? totalCount : 0,
    cancelledCount: run.status === "cancelled" ? totalCount : 0,
  };
}

function getTaskQueueItems(conversations: ImageConversation[]) {
  const items = conversations.flatMap((conversation) =>
    conversation.turns.flatMap((turn) => {
      if (!isTurnBusy(turn)) {
        return [];
      }

      return [getQueueItem(conversation, turn)];
    }),
  );

  return items.sort((a, b) => a.turn.createdAt.localeCompare(b.turn.createdAt));
}

function getCanvasTaskQueueItems(canvases: SmartCanvasDocument[]) {
  const items = canvases.flatMap((canvas) =>
    smartCanvasRuns(canvas).flatMap((run) => {
      if (!isCanvasRunBusy(run)) {
        return [];
      }

      return [getCanvasQueueItem(canvas, run)];
    }),
  );

  return items.sort((a, b) => (a.run.startedAt || a.run.createdAt).localeCompare(b.run.startedAt || b.run.createdAt));
}

function findQueueItem(conversations: ImageConversation[], conversationId: string, turnId: string) {
  const conversation = conversations.find((item) => item.id === conversationId);
  const turn = conversation?.turns.find((item) => item.id === turnId);
  return conversation && turn ? getQueueItem(conversation, turn) : null;
}

function findCanvasQueueItem(canvases: SmartCanvasDocument[], canvasId: string, runId: string, taskId?: string) {
  const canvas = canvases.find((item) => item.id === canvasId);
  if (!canvas) {
    return null;
  }
  const run = smartCanvasRuns(canvas).find((item) => item.id === runId && (!taskId || item.taskId === taskId));
  return run ? getCanvasQueueItem(canvas, run) : null;
}

function useImageConversationsForQueue() {
  const [conversations, setConversations] = useState<ImageConversation[]>([]);

  useEffect(() => {
    let active = true;

    const loadConversations = async () => {
      try {
        const items = await listImageConversations();
        if (active) {
          setConversations(items);
        }
      } catch {
        if (active) {
          setConversations([]);
        }
      }
    };

    const handleRefresh = () => {
      void loadConversations();
    };

    void loadConversations();
    window.addEventListener("focus", handleRefresh);
    window.addEventListener(IMAGE_CONVERSATIONS_CHANGED_EVENT, handleRefresh);
    return () => {
      active = false;
      window.removeEventListener("focus", handleRefresh);
      window.removeEventListener(IMAGE_CONVERSATIONS_CHANGED_EVENT, handleRefresh);
    };
  }, []);

  return conversations;
}

function mergeCanvasQueueSnapshot(canvases: SmartCanvasDocument[], canvas: SmartCanvasDocument) {
  return canvases.some((item) => item.id === canvas.id)
    ? canvases.map((item) => item.id === canvas.id ? canvas : item)
    : [canvas, ...canvases];
}

function useCanvasesForQueue() {
  const [canvases, setCanvases] = useState<SmartCanvasDocument[]>([]);

  useEffect(() => {
    let active = true;

    const loadCanvases = async () => {
      try {
        const items = await fetchCanvases();
        if (!active) {
          return;
        }
        setCanvases(items.flatMap((item) => {
          const canvas = normalizeSmartCanvas(item);
          return canvas ? [canvas] : [];
        }));
      } catch {
        if (active) {
          setCanvases([]);
        }
      }
    };

    const handleRefresh = () => {
      void loadCanvases();
    };
    const handleCanvasQueueChanged = (event: Event) => {
      const canvas = normalizeSmartCanvas((event as CustomEvent<SmartCanvasQueueChangedDetail>).detail?.canvas as CanvasDocument | null | undefined);
      if (!canvas) {
        void loadCanvases();
        return;
      }
      setCanvases((items) => mergeCanvasQueueSnapshot(items, canvas));
    };

    void loadCanvases();
    window.addEventListener("focus", handleRefresh);
    window.addEventListener(SMART_CANVAS_QUEUE_CHANGED_EVENT, handleCanvasQueueChanged);
    return () => {
      active = false;
      window.removeEventListener("focus", handleRefresh);
      window.removeEventListener(SMART_CANVAS_QUEUE_CHANGED_EVENT, handleCanvasQueueChanged);
    };
  }, []);

  return canvases;
}

function ImageQueueItem({
  item,
  now,
  onOpenConversation,
}: {
  item: TaskQueueItem;
  now: number;
  onOpenConversation: (conversationId: string) => void;
}) {
  const progress = getImageTurnProgressSnapshot()[imageTurnProgressKey(item.conversationId, item.turn.id)];
  const settledCount = item.completedCount + item.failedCount + item.cancelledCount;
  const progressPercent =
    settledCount > 0
      ? Math.min(100, Math.round((settledCount / item.totalCount) * 100))
      : item.turn.status === "generating"
        ? 8
        : 0;
  const loadingPhase = getImageTurnLoadingPhase(item.turn);
  const isWaitingForQuota = loadingPhase === "queued";
  const isRunning = loadingPhase === "running";
  const elapsedSeconds = isRunning ? Math.max(0, Math.floor((now - imageTurnStartedAtTimestamp(item.turn.processingStartedAt, item.turn.createdAt)) / 1000)) : 0;
  const elapsed = isRunning ? formatElapsedClock(elapsedSeconds) : "";
  const routeDetail = getImageModelRouteDetail(item.turn.model);
  const sizeLabel = getQueueSizeLabel(item.turn);
  const detailParts = [
    getModeLabel(item.turn.mode),
    item.turn.model,
    routeDetail?.routeLabel || "",
    sizeLabel,
    item.turn.quality ? `Quality ${item.turn.quality}` : "",
  ].filter(Boolean);
  const progressMessage =
    progress?.message ||
    (isWaitingForQuota
      ? item.turn.mode === "chat"
        ? "正在思考"
        : "等待创作并发额度"
      : item.turn.mode === "chat"
        ? "等待对话回复"
        : "等待图片处理");
  const loadingDetail = getQueueLoadingDetail(item, loadingPhase);
  const progressDetail = loadingDetail || progress?.detail || "";
  const longTaskHint = getQueueLongTaskHint(item.turn, elapsedSeconds);

  return (
    <button
      type="button"
      className="w-full rounded-2xl border border-[#f2f3f5] bg-white p-3 text-left shadow-[0_4px_6px_rgba(0,0,0,0.05)] transition hover:border-[#dbe7ff] hover:bg-[#f8fbff] dark:border-border dark:bg-card dark:hover:bg-accent/40"
      onClick={() => onOpenConversation(item.conversationId)}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full ring-1",
            item.turn.status === "queued"
              ? "bg-amber-50 text-amber-700 ring-amber-100"
              : "bg-sky-50 text-[#1456f0] ring-sky-100",
          )}
        >
          {item.turn.status === "queued" ? <Clock3 className="size-4" /> : <LoaderCircle className="size-4 animate-spin" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <p className="truncate text-sm font-semibold text-[#222222] dark:text-foreground">
              {item.conversationTitle || item.turn.prompt || "未命名任务"}
            </p>
            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1", getStatusClass(item.turn.status))}>
              {getStatusLabel(item.turn.status)}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#45515e] dark:text-muted-foreground">
            {item.turn.prompt || "无提示词内容"}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-[#45515e] dark:text-muted-foreground">
            {detailParts.map((part, index) => (
              <span key={`${part}-${index}`} className="rounded-full bg-[#f0f0f0] px-2 py-0.5 dark:bg-muted">
                {part}
              </span>
            ))}
            <span className="rounded-full bg-[#f0f0f0] px-2 py-0.5 font-mono tabular-nums dark:bg-muted">
              {item.completedCount + item.failedCount + item.cancelledCount}/{item.totalCount}
            </span>
            {item.queuedCount > 0 ? (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 font-mono tabular-nums text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                排队 {item.queuedCount}
              </span>
            ) : null}
            {item.runningCount > 0 ? (
              <span className="rounded-full bg-sky-50 px-2 py-0.5 font-mono tabular-nums text-sky-700 dark:bg-sky-950/30 dark:text-sky-300">
                处理中 {item.runningCount}
              </span>
            ) : null}
          </div>

          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] text-[#45515e] dark:text-muted-foreground">
              <span className="truncate font-medium text-[#222222] dark:text-foreground">{progressMessage}</span>
              <span className="shrink-0 font-mono tabular-nums">{progressPercent}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[#edf2f7] dark:bg-muted">
              <div className="h-full rounded-full bg-[#1456f0] transition-[width] duration-300" style={{ width: `${progressPercent}%` }} />
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-[#8e8e93] dark:text-muted-foreground">
              <span className="truncate">{longTaskHint || progressDetail || formatQueueTime(item.turn.createdAt)}</span>
              {elapsed ? <span className="shrink-0 font-mono tabular-nums">已运行 {elapsed}</span> : null}
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

function CanvasQueueItemCard({
  item,
  now,
  onOpenCanvas,
}: {
  item: CanvasQueueItem;
  now: number;
  onOpenCanvas: (canvasId: string) => void;
}) {
  const isWaitingForQuota = item.run.status === "queued";
  const isRunning = item.run.status === "running";
  const progressPercent =
    item.run.status === "success"
      ? 100
      : item.run.status === "error" || item.run.status === "cancelled"
        ? 100
        : isRunning
          ? 8
          : 0;
  const runStartedAt = item.run.startedAt || item.run.createdAt;
  const elapsedSeconds = isRunning && runStartedAt
    ? Math.max(0, Math.floor((now - new Date(runStartedAt).getTime()) / 1000))
    : 0;
  const elapsed = isRunning ? formatElapsedClock(elapsedSeconds) : "";
  const routeDetail = getImageModelRouteDetail(item.run.model);
  const detailParts = [
    "画布",
    item.run.mode === "edit" ? "图生图" : "文生图",
    item.run.model,
    routeDetail?.routeLabel || "",
  ].filter(Boolean);
  const progressMessage = isWaitingForQuota ? "等待创作并发额度" : "等待图片处理";
  const progressDetail = isWaitingForQuota ? "画布任务排队中" : isRunning ? "画布任务处理中" : "";

  return (
    <button
      type="button"
      className="w-full rounded-2xl border border-[#f2f3f5] bg-white p-3 text-left shadow-[0_4px_6px_rgba(0,0,0,0.05)] transition hover:border-[#dbe7ff] hover:bg-[#f8fbff] dark:border-border dark:bg-card dark:hover:bg-accent/40"
      onClick={() => onOpenCanvas(item.canvasId)}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full ring-1",
            item.run.status === "queued"
              ? "bg-amber-50 text-amber-700 ring-amber-100"
              : "bg-sky-50 text-[#1456f0] ring-sky-100",
          )}
        >
          {item.run.status === "queued" ? <Clock3 className="size-4" /> : <LoaderCircle className="size-4 animate-spin" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <p className="truncate text-sm font-semibold text-[#222222] dark:text-foreground">
              {item.canvasTitle || item.run.prompt || "未命名画布任务"}
            </p>
            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1", getCanvasStatusClass(item.run.status))}>
              {getCanvasStatusLabel(item.run.status)}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#45515e] dark:text-muted-foreground">
            {item.run.prompt || "无提示词内容"}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-[#45515e] dark:text-muted-foreground">
            {detailParts.map((part, index) => (
              <span key={`${part}-${index}`} className="rounded-full bg-[#f0f0f0] px-2 py-0.5 dark:bg-muted">
                {part}
              </span>
            ))}
            {item.run.taskId ? (
              <span className="rounded-full bg-[#f0f0f0] px-2 py-0.5 font-mono tabular-nums dark:bg-muted">
                {item.run.taskId.slice(0, 12)}
              </span>
            ) : null}
          </div>

          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] text-[#45515e] dark:text-muted-foreground">
              <span className="truncate font-medium text-[#222222] dark:text-foreground">{progressMessage}</span>
              <span className="shrink-0 font-mono tabular-nums">{progressPercent}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[#edf2f7] dark:bg-muted">
              <div className="h-full rounded-full bg-[#1456f0] transition-[width] duration-300" style={{ width: `${progressPercent}%` }} />
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-[#8e8e93] dark:text-muted-foreground">
              <span className="truncate">{progressDetail || formatQueueTime(runStartedAt || item.run.createdAt)}</span>
              {elapsed ? <span className="shrink-0 font-mono tabular-nums">已运行 {elapsed}</span> : null}
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

function CompletionItem({
  item,
  onOpenConversation,
  onOpenCanvas,
}: {
  item: RecentQueueCompletion;
  onOpenConversation: (conversationId: string) => void;
  onOpenCanvas: (canvasId: string) => void;
}) {
  const tone = getCompletionTone(item.finalStatus);
  const settledCount = item.completedCount + item.failedCount + item.cancelledCount;
  const title = item.source === "image"
    ? item.conversationTitle || item.turn.prompt || "未命名任务"
    : item.canvasTitle || item.run.prompt || "未命名画布任务";
  const prompt = item.source === "image" ? item.turn.prompt : item.run.prompt;
  const error = item.source === "image" ? item.turn.error : item.run.error;
  const statusLabel = item.source === "image"
    ? getStatusLabel(item.finalStatus as ImageTurnStatus)
    : getCanvasStatusLabel(item.finalStatus as CreationTask["status"]);
  const resultText =
    item.finalStatus === "success" || item.finalStatus === "message"
      ? `${settledCount}/${item.totalCount} 已完成`
      : error || statusLabel;

  return (
    <button
      type="button"
      className="animate-in fade-in slide-in-from-top-1 zoom-in-95 w-full rounded-2xl border border-emerald-100 bg-white p-3 text-left shadow-[0_12px_24px_-18px_rgba(16,185,129,0.55)] duration-300 hover:border-emerald-200 hover:bg-emerald-50/45 dark:border-emerald-900/50 dark:bg-card dark:hover:bg-emerald-950/20"
      onClick={() => item.source === "image" ? onOpenConversation(item.conversationId) : onOpenCanvas(item.canvasId)}
    >
      <div className="flex items-start gap-3">
        <span className={cn("relative mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full ring-1", tone.iconClass)}>
          <span className="absolute inset-0 rounded-full bg-current opacity-15 animate-ping" />
          <CheckCircle2 className="relative size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <p className="truncate text-sm font-semibold text-[#222222] dark:text-foreground">
              {title}
            </p>
            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1", tone.badgeClass)}>
              {statusLabel}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#45515e] dark:text-muted-foreground">
            {prompt || "无提示词内容"}
          </p>
          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] text-[#45515e] dark:text-muted-foreground">
              <span className="truncate font-medium text-[#222222] dark:text-foreground">{tone.message}</span>
              <span className="shrink-0 font-mono tabular-nums">{resultText}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[#edf2f7] dark:bg-muted">
              <div className={cn("h-full animate-pulse rounded-full", tone.barClass)} style={{ width: "100%" }} />
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

export function ImageTaskQueue({ className }: { className?: string }) {
  const navigate = useNavigate();
  const conversations = useImageConversationsForQueue();
  const canvases = useCanvasesForQueue();
  const progressByTurnKey = useSyncExternalStore(
    subscribeImageTurnProgress,
    getImageTurnProgressSnapshot,
    getImageTurnProgressSnapshot,
  );
  const imageQueueItems = useMemo(() => getTaskQueueItems(conversations), [conversations]);
  const canvasQueueItems = useMemo(() => getCanvasTaskQueueItems(canvases), [canvases]);
  const queueItems = useMemo(
    () => [...imageQueueItems, ...canvasQueueItems].sort((a, b) => getQueueItemCreatedAt(a).localeCompare(getQueueItemCreatedAt(b))),
    [canvasQueueItems, imageQueueItems],
  );
  const activeCount = queueItems.length;
  const [recentCompletions, setRecentCompletions] = useState<RecentQueueCompletion[]>([]);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const previousQueueItemsRef = useRef<Map<string, QueueItemModel>>(new Map());
  const hasRecentCompletion = recentCompletions.length > 0;

  useEffect(() => {
    const currentItems = new Map(queueItems.map((item) => [getQueueItemKey(item), item]));
    const completedItems: RecentQueueCompletion[] = [];

    previousQueueItemsRef.current.forEach((previousItem, key) => {
      if (currentItems.has(key)) {
        return;
      }

      const completedItem = previousItem.source === "image"
        ? findQueueItem(conversations, previousItem.conversationId, previousItem.turn.id)
        : findCanvasQueueItem(canvases, previousItem.canvasId, previousItem.run.id, previousItem.run.taskId);
      if (!completedItem || isQueueItemBusy(completedItem) || !isQueueItemTerminal(completedItem)) {
        return;
      }

      completedItems.push({
        ...completedItem,
        key,
        completedAt: Date.now(),
        finalStatus: getQueueItemFinalStatus(completedItem),
      });
    });

    previousQueueItemsRef.current = currentItems;
    if (completedItems.length > 0) {
      setRecentCompletions((current) => [...completedItems, ...current].slice(0, 3));
    }
  }, [canvases, conversations, queueItems]);

  useEffect(() => {
    if (recentCompletions.length === 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      const cutoff = Date.now() - 4500;
      setRecentCompletions((current) => current.filter((item) => item.completedAt >= cutoff));
    }, 4500);
    return () => {
      window.clearTimeout(timer);
    };
  }, [recentCompletions]);

  useEffect(() => {
    if (!open && activeCount === 0 && Object.keys(progressByTurnKey).length === 0 && !hasRecentCompletion) {
      return;
    }

    setNow(Date.now());
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [activeCount, hasRecentCompletion, open, progressByTurnKey]);

  const handleOpenConversation = (conversationId: string) => {
    window.localStorage.setItem(ACTIVE_IMAGE_CONVERSATION_STORAGE_KEY, conversationId);
    window.dispatchEvent(
      new CustomEvent(IMAGE_ACTIVE_CONVERSATION_REQUEST_EVENT, {
        detail: { conversationId },
      }),
    );
    setOpen(false);
    navigate("/image");
  };

  const handleOpenCanvas = (_canvasId: string) => {
    setOpen(false);
    navigate("/canvas");
  };
  const renderQueueItem = (item: QueueItemModel) => {
    if (item.source === "image") {
      return (
        <ImageQueueItem
          key={getQueueItemKey(item)}
          item={item}
          now={now}
          onOpenConversation={handleOpenConversation}
        />
      );
    }
    return (
      <CanvasQueueItemCard
        key={getQueueItemKey(item)}
        item={item}
        now={now}
        onOpenCanvas={handleOpenCanvas}
      />
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "relative h-9 rounded-full px-2.5 shadow-none",
            activeCount > 0
              ? "border-sky-200 bg-sky-50 text-[#1456f0] hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-300"
              : hasRecentCompletion
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
              : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            className,
          )}
          aria-label={activeCount > 0 ? `查看 ${activeCount} 个处理中任务` : hasRecentCompletion ? "查看刚完成的任务" : "查看任务队列"}
          title="任务队列"
        >
          {hasRecentCompletion ? (
            <span className="pointer-events-none absolute -inset-1 rounded-full border border-emerald-300/70 animate-ping" />
          ) : null}
          {activeCount > 0 ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : hasRecentCompletion ? (
            <CheckCircle2 className="size-4 animate-in zoom-in-50 duration-300" />
          ) : (
            <ClipboardList className="size-4" />
          )}
          <span className="hidden text-xs font-medium xl:inline">任务队列</span>
          {activeCount > 0 ? (
            <span className="absolute -top-1 -right-1 inline-flex min-w-5 items-center justify-center rounded-full bg-[#1456f0] px-1.5 text-[10px] font-semibold leading-5 text-white">
              {activeCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[min(calc(100vw-2rem),460px)] p-0">
        <div className="flex items-center justify-between gap-3 border-b border-[#f2f3f5] px-4 py-3 dark:border-border">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#edf4ff] text-[#1456f0] dark:bg-sky-950/30 dark:text-sky-300">
              <ClipboardList className="size-4" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-[#222222] dark:text-foreground">任务处理队列</div>
              <div className="text-xs text-[#8e8e93] dark:text-muted-foreground">
                {activeCount > 0
                  ? `${activeCount} 个创作台/画布任务正在排队或处理`
                  : hasRecentCompletion
                    ? "最近完成的任务"
                    : "暂无处理中任务"}
              </div>
            </div>
          </div>
        </div>

        {queueItems.length > 0 || recentCompletions.length > 0 ? (
          <div aria-live="polite" className="max-h-[min(68vh,560px)] overflow-y-auto bg-[#fbfcfe] p-3 dark:bg-background">
            <div className="flex flex-col gap-3">
              {recentCompletions.map((item) => (
                <CompletionItem
                  key={`${item.key}:${item.completedAt}`}
                  item={item}
                  onOpenConversation={handleOpenConversation}
                  onOpenCanvas={handleOpenCanvas}
                />
              ))}
              {queueItems.map(renderQueueItem)}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-[#f0f0f0] text-[#45515e] dark:bg-muted dark:text-muted-foreground">
              <CheckCircle2 className="size-5" />
            </span>
            <div className="mt-3 text-sm font-semibold text-[#222222] dark:text-foreground">队列为空</div>
            <div className="mt-1 max-w-[260px] text-xs leading-5 text-[#8e8e93] dark:text-muted-foreground">
              在创作台或画布提交图片任务后，这里会显示对应的处理详情和进度。
            </div>
            <Button
              type="button"
              size="sm"
              className="mt-4 h-8 rounded-full bg-[#1456f0] px-3 text-xs text-white hover:bg-[#2563eb]"
              onClick={() => {
                setOpen(false);
                navigate("/image");
              }}
            >
              <Sparkles className="size-3.5" />
              打开创作台
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
