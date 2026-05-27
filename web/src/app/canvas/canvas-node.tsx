"use client";

import { forwardRef, memo, useCallback, useLayoutEffect, useMemo, useState, type HTMLAttributes, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { VirtuosoGrid } from "react-virtuoso";
import {
  Bot,
  BoxSelect,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleDot,
  Clock3,
  Cuboid,
  FileText,
  Grid2X2,
  History,
  Image as ImageIcon,
  ImagePlus,
  Images,
  Layers3,
  LoaderCircle,
  Maximize2,
  Minimize2,
  PanelRightOpen,
  Pencil,
  Pin,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Save,
  Sparkles,
  Trash2,
  WandSparkles,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { AuthenticatedImage } from "@/components/authenticated-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { CanvasImageRef, CanvasModelOption, ImageVisibility, ManagedImage } from "@/lib/api";
import { cn } from "@/lib/utils";

import {
  canvasImageKey,
  canvasImageLabel,
  canvasImagePreviewSource,
  canvasImageSource,
  canvasImagesFromItem,
  canvasPromptFromItem,
  dedupeCanvasImageRefs,
  incomingItems,
  isActiveTask,
  saveStateLabel,
  smartCanvasRuns,
  statusLabel,
} from "./canvas-utils";
import type {
  SmartCanvasConnectState,
  SmartCanvasAngleControlValues,
  SmartCanvasDocument,
  SmartCanvasHistoryEntry,
  SmartCanvasItem,
  SmartCanvasRunRecord,
  SmartCanvasSaveState,
  SmartCanvasTool,
  SmartCanvasViewport,
} from "./types";

const NODE_SIZE: Record<SmartCanvasItem["type"], { w: number; h: number }> = {
  image: { w: 270, h: 260 },
  prompt: { w: 310, h: 210 },
  llm: { w: 380, h: 420 },
  image_generation: { w: 390, h: 330 },
  result: { w: 440, h: 245 },
};
const EMPTY_SMART_CANVAS_NODES: SmartCanvasItem[] = [];

type SmartCanvasNodeSizeMap = Record<string, { w: number; h: number }>;

const canvasPanelClass = "border-border bg-card/92 text-card-foreground shadow-[0_18px_46px_rgba(44,74,116,0.16)] backdrop-blur dark:border-zinc-800 dark:bg-[#181818]/92 dark:text-zinc-100 dark:shadow-[0_18px_46px_rgba(0,0,0,0.36)]";
const canvasFieldClass = "border-border bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-sky-400 dark:border-slate-700 dark:bg-[#0c1220] dark:text-slate-100 dark:placeholder:text-slate-600";
const canvasSubtleTextClass = "text-muted-foreground dark:text-slate-500";
const canvasLabelClass = "text-muted-foreground dark:text-slate-400";
const canvasAccentTextClass = "text-sky-700 dark:text-sky-200";
const canvasDashedClass = "border-dashed border-border bg-muted/50 text-muted-foreground dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-500";
const canvasGhostButtonClass = "border-border bg-background/70 text-foreground hover:bg-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800";
const canvasSelectClass = "h-9 rounded-xl border-border bg-background text-xs text-foreground dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200";
const canvasIconButtonClass = "text-muted-foreground hover:bg-accent hover:text-foreground dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white";

type SmartCanvasShellProps = {
  children: ReactNode;
};

export function SmartCanvasShell({ children }: SmartCanvasShellProps) {
  return (
    <div className="relative flex h-full min-h-0 overflow-hidden rounded-[24px] border border-border bg-background text-foreground shadow-[0_26px_80px_rgba(44,74,116,0.12)] dark:border-zinc-800 dark:bg-[#050505] dark:text-zinc-100 dark:shadow-[0_26px_80px_rgba(0,0,0,0.45)]">
      {children}
    </div>
  );
}

export function SmartCanvasLeftRail({
  canvases,
  currentCanvasId,
  collapsed,
  loading,
  onCollapsedChange,
  onSelectCanvas,
  onCreateCanvas,
  onRefresh,
  onDeleteCanvas,
  onRenameCanvas,
}: {
  canvases: SmartCanvasDocument[];
  currentCanvasId: string;
  collapsed: boolean;
  loading: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onSelectCanvas: (id: string) => void;
  onCreateCanvas: () => void;
  onRefresh: () => void;
  onDeleteCanvas: (id: string) => void;
  onRenameCanvas: (id: string, name: string) => void;
}) {
  const [editingCanvasId, setEditingCanvasId] = useState("");
  const [editingName, setEditingName] = useState("");
  const [confirmDeleteCanvasId, setConfirmDeleteCanvasId] = useState("");
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const expanded = !collapsed || hoverExpanded || Boolean(editingCanvasId) || Boolean(confirmDeleteCanvasId);

  const beginRename = useCallback((item: SmartCanvasDocument) => {
    if (!item.id || !expanded) {
      return;
    }
    setConfirmDeleteCanvasId("");
    setEditingCanvasId(item.id);
    setEditingName(item.name || "未命名画布");
  }, [expanded]);

  const cancelRename = useCallback(() => {
    setEditingCanvasId("");
    setEditingName("");
  }, []);

  const commitRename = useCallback(() => {
    if (!editingCanvasId) {
      return;
    }
    onRenameCanvas(editingCanvasId, editingName.trim() || "未命名画布");
    cancelRename();
  }, [cancelRename, editingCanvasId, editingName, onRenameCanvas]);

  const requestDelete = useCallback((item: SmartCanvasDocument) => {
    if (!item.id || !expanded) {
      return;
    }
    if (confirmDeleteCanvasId === item.id) {
      setConfirmDeleteCanvasId("");
      onDeleteCanvas(item.id);
      return;
    }
    cancelRename();
    setConfirmDeleteCanvasId(item.id);
  }, [cancelRename, confirmDeleteCanvasId, expanded, onDeleteCanvas]);

  return (
    <aside
      className={cn(
        "relative z-30 flex shrink-0 flex-col overflow-hidden border-r border-border bg-card/70 py-5 transition-[width,padding] duration-300 ease-out dark:border-zinc-800 dark:bg-[#050505]",
        expanded ? "w-[276px] px-3" : "w-[68px] px-2",
      )}
      onMouseEnter={() => setHoverExpanded(true)}
      onMouseLeave={() => {
        if (collapsed && !editingCanvasId && !confirmDeleteCanvasId) {
          setHoverExpanded(false);
        }
      }}
    >
      <div className={cn("flex items-center gap-3 transition-all duration-300", expanded ? "justify-start px-2" : "justify-center px-0")}>
        <button
          type="button"
          className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-600 transition hover:bg-sky-500/15 dark:bg-sky-400/10 dark:text-sky-300 dark:hover:bg-sky-400/15"
          onClick={() => {
            if (!expanded) {
              setHoverExpanded(true);
            }
          }}
          title={expanded ? "无限画布" : "展开画布列表"}
        >
          <Grid2X2 className="size-5" />
        </button>
        <div className={cn("min-w-0 flex-1 transition-all duration-300", expanded ? "block translate-x-0 opacity-100" : "hidden")}>
          <div className="truncate text-sm font-bold">无限画布</div>
          <div className={cn("text-[11px]", canvasSubtleTextClass)}>{canvases.length} 个画布</div>
        </div>
        <button
          type="button"
          className={cn("size-8 shrink-0 items-center justify-center rounded-xl transition-all duration-300", canvasIconButtonClass, expanded ? "flex opacity-100" : "hidden")}
          onClick={() => {
            onCollapsedChange(true);
            setHoverExpanded(false);
          }}
          title={collapsed ? "当前为悬停展开，点击收起" : "收起画布列表"}
        >
          <ChevronLeft className="size-4" />
        </button>
      </div>

      <div className={cn("mt-5 grid grid-cols-2 gap-1 rounded-2xl bg-background/45 p-1 transition-all duration-300 dark:bg-zinc-900/45", expanded ? "translate-x-0 opacity-100" : "pointer-events-none -translate-x-4 opacity-0")}>
        <button type="button" className="inline-flex h-8 items-center justify-center gap-2 rounded-xl text-xs font-black text-foreground transition hover:bg-accent dark:text-zinc-200 dark:hover:bg-zinc-800" onClick={onCreateCanvas}>
          <ImagePlus className="size-4" />
          新建
        </button>
        <button type="button" className="inline-flex h-8 items-center justify-center gap-2 rounded-xl text-xs font-black text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          刷新
        </button>
      </div>

      <div className={cn("mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 transition-all duration-300", expanded ? "translate-x-0 opacity-100" : "pointer-events-none -translate-x-4 opacity-0")}>
        {canvases.length > 0 ? canvases.map((item) => {
          const active = item.id === currentCanvasId;
          const editing = item.id === editingCanvasId;
          const confirmingDelete = item.id === confirmDeleteCanvasId;
          return (
            <div
              key={item.id || `${item.name}-${item.updated_at || item.created_at || "new"}`}
              role="button"
              tabIndex={0}
              className={cn(
                "group relative rounded-2xl p-3 text-left transition",
                active
                  ? "border border-border bg-background text-foreground shadow-[0_4px_6px_rgba(0,0,0,0.08)] dark:border-zinc-800 dark:bg-[#181818] dark:text-zinc-100"
                  : "text-muted-foreground hover:bg-background/70 hover:text-foreground dark:text-zinc-400 dark:hover:bg-[#141414] dark:hover:text-zinc-100",
              )}
              onClick={() => {
                if (!editing && !confirmingDelete && item.id) {
                  onSelectCanvas(item.id);
                }
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                beginRename(item);
              }}
              onKeyDown={(event) => {
                if (editing) {
                  return;
                }
                if ((event.key === "Enter" || event.key === " ") && item.id) {
                  event.preventDefault();
                  onSelectCanvas(item.id);
                }
              }}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  {editing ? (
                    <Input
                      value={editingName}
                      autoFocus
                      className={cn("h-8 rounded-xl text-xs font-black", canvasFieldClass)}
                      onChange={(event) => setEditingName(event.target.value)}
                      onClick={(event) => event.stopPropagation()}
                      onPointerDown={(event) => event.stopPropagation()}
                      onBlur={commitRename}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commitRename();
                        }
                        if (event.key === "Escape") {
                          event.preventDefault();
                          cancelRename();
                        }
                      }}
                    />
                  ) : (
                    <div className={cn("truncate text-xs font-black", active ? "text-foreground dark:text-zinc-100" : "text-current")}>{item.name || "未命名画布"}</div>
                  )}
                  <div className={cn("mt-1 truncate text-[11px] font-semibold", active ? "text-muted-foreground dark:text-zinc-400" : "text-muted-foreground/80 dark:text-zinc-500")}>
                    {item.nodes.length} 节点 · {item.edges.length} 连线 · {item.updated_at ? item.updated_at.slice(5, 16) : "未保存"}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    className={cn("flex size-7 items-center justify-center rounded-lg opacity-70 group-hover:opacity-100", canvasIconButtonClass)}
                    title="编辑名称"
                    onClick={(event) => {
                      event.stopPropagation();
                      beginRename(item);
                    }}
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "flex h-7 items-center justify-center rounded-lg text-xs font-black opacity-70 group-hover:opacity-100",
                      confirmingDelete ? "bg-rose-500 px-2 text-white opacity-100" : "w-7 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-200",
                    )}
                    title={confirmingDelete ? "确认删除这个画布" : "删除这个画布"}
                    onClick={(event) => {
                      event.stopPropagation();
                      requestDelete(item);
                    }}
                  >
                    <Trash2 className="size-3.5" />
                    {confirmingDelete ? <span className="ml-1">确认</span> : null}
                  </button>
                </div>
              </div>
            </div>
          );
        }) : (
          <div className={cn("rounded-2xl border p-4 text-center text-xs font-semibold", canvasDashedClass)}>暂无画布，点击新建开始创作</div>
        )}
      </div>

      <div className={cn("mt-4 border-t border-border pt-4 text-center text-[11px] font-semibold transition-all duration-300 dark:border-zinc-800", canvasSubtleTextClass, expanded ? "opacity-100" : "pointer-events-none opacity-0")}>
        右键空白处添加节点，拖动端口连接流程
      </div>

      <div className={cn("absolute left-0 top-[74px] flex w-[68px] flex-col items-center gap-3 transition-all duration-300", expanded ? "pointer-events-none -translate-x-3 opacity-0" : "translate-x-0 opacity-100")}>
        <div className="rounded-full bg-sky-500/12 px-2 py-1 text-[11px] font-black text-sky-700 dark:text-sky-200">{canvases.length}</div>
        <button
          type="button"
          className={cn("flex size-9 items-center justify-center rounded-xl transition", canvasIconButtonClass)}
          onClick={onCreateCanvas}
          title="新建画布"
        >
          <ImagePlus className="size-4" />
        </button>
        <button
          type="button"
          className={cn("flex size-9 items-center justify-center rounded-xl transition", canvasIconButtonClass)}
          onClick={() => setHoverExpanded(true)}
          title="展开"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </aside>
  );
}

type SmartCanvasTopBarProps = {
  canvasName: string;
  saveState: SmartCanvasSaveState;
  saving: boolean;
  running: boolean;
  runCount: number;
  operationCount: number;
  canUndo: boolean;
  canRedo: boolean;
  onSave: () => void;
  onAddNode: (type: SmartCanvasItem["type"]) => void;
  onUploadClick: () => void;
  onRunHistoryToggle: () => void;
  onOperationHistoryToggle: () => void;
  onUndo: () => void;
  onRedo: () => void;
};

export function SmartCanvasTopBar({
  canvasName,
  saveState,
  saving,
  running,
  runCount,
  operationCount,
  canUndo,
  canRedo,
  onSave,
  onAddNode,
  onUploadClick,
  onRunHistoryToggle,
  onOperationHistoryToggle,
  onUndo,
  onRedo,
}: SmartCanvasTopBarProps) {
  return (
    <div className="pointer-events-none absolute left-6 right-6 top-5 z-40 flex items-center justify-between gap-4">
      <div className="min-w-0 max-w-[360px] px-1 py-2">
        <div className="truncate text-sm font-black text-slate-900 drop-shadow-none dark:text-zinc-100 dark:drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)]">{canvasName || "未命名画布"}</div>
        <div className="mt-0.5 text-[11px] font-semibold text-slate-500 drop-shadow-none dark:text-zinc-400/90 dark:drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">当前画布</div>
      </div>
      <div className={cn("pointer-events-auto flex min-w-0 flex-wrap items-center justify-end gap-2 rounded-full border p-1.5", canvasPanelClass)}>
        <ToolbarButton icon={<ImagePlus className="size-4" />} label="上传" onClick={onUploadClick} />
        <ToolbarButton icon={<FileText className="size-4" />} label="提示词" onClick={() => onAddNode("prompt")} />
        <ToolbarButton icon={<Sparkles className="size-4" />} label="AI 提示词" onClick={() => onAddNode("llm")} />
        <ToolbarButton icon={<WandSparkles className="size-4" />} label="API生成" onClick={() => onAddNode("image_generation")} />
        <ToolbarButton icon={<CircleDot className="size-4" />} label="Output" onClick={() => onAddNode("result")} />
        <ToolbarButton icon={<History className="size-4" />} label={`记录${runCount ? ` ${runCount}` : ""}`} onClick={onRunHistoryToggle} />
        <ToolbarButton icon={<Clock3 className="size-4" />} label={`操作${operationCount ? ` ${operationCount}` : ""}`} onClick={onOperationHistoryToggle} />
        <ToolbarButton icon={<RotateCcw className="size-4" />} label="撤销" onClick={onUndo} disabled={!canUndo} />
        <ToolbarButton icon={<RotateCw className="size-4" />} label="重做" onClick={onRedo} disabled={!canRedo} />
        <ToolbarButton icon={saving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />} label={saveStateLabel(saveState)} onClick={onSave} />
        {running ? <span className="ml-1 rounded-full bg-sky-500/15 px-3 py-2 text-xs font-bold text-sky-700 dark:text-sky-200">运行中</span> : null}
      </div>
    </div>
  );
}

function ToolbarButton({
  icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-bold transition",
        danger
          ? "border-rose-500/35 text-rose-600 hover:bg-rose-500/10 dark:text-rose-200 dark:hover:bg-rose-500/15"
          : "border-border bg-background/70 text-foreground hover:bg-accent dark:border-slate-700 dark:bg-slate-950/35 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white",
        disabled ? "cursor-not-allowed opacity-45" : "",
      )}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
      {label}
    </button>
  );
}

export function SmartCanvasPickerDialog({
  open,
  canvases,
  currentCanvasId,
  loading,
  onOpenChange,
  onSelectCanvas,
  onCreateCanvas,
  onRefresh,
  onDeleteCanvas,
  onRenameCanvas,
}: {
  open: boolean;
  canvases: SmartCanvasDocument[];
  currentCanvasId: string;
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectCanvas: (id: string) => void;
  onCreateCanvas: () => void;
  onRefresh: () => void;
  onDeleteCanvas: (id: string) => void;
  onRenameCanvas: (id: string, name: string) => void;
}) {
  const [editingCanvasId, setEditingCanvasId] = useState("");
  const [editingName, setEditingName] = useState("");
  const [confirmDeleteCanvasId, setConfirmDeleteCanvasId] = useState("");

  const beginRename = useCallback((item: SmartCanvasDocument) => {
    if (!item.id) {
      return;
    }
    setConfirmDeleteCanvasId("");
    setEditingCanvasId(item.id);
    setEditingName(item.name || "未命名画布");
  }, []);

  const cancelRename = useCallback(() => {
    setEditingCanvasId("");
    setEditingName("");
  }, []);

  const commitRename = useCallback(() => {
    if (!editingCanvasId) {
      return;
    }
    onRenameCanvas(editingCanvasId, editingName.trim() || "未命名画布");
    cancelRename();
  }, [cancelRename, editingCanvasId, editingName, onRenameCanvas]);

  const requestDelete = useCallback((item: SmartCanvasDocument) => {
    if (!item.id) {
      return;
    }
    if (confirmDeleteCanvasId === item.id) {
      setConfirmDeleteCanvasId("");
      onDeleteCanvas(item.id);
      return;
    }
    cancelRename();
    setConfirmDeleteCanvasId(item.id);
  }, [cancelRename, confirmDeleteCanvasId, onDeleteCanvas]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex w-[min(92vw,840px)] max-w-none grid-cols-none flex-col gap-5 rounded-[28px] border border-border bg-card p-7 text-card-foreground shadow-[0_32px_120px_rgba(15,23,42,0.28)] dark:border-slate-700 dark:bg-[#111827] dark:text-slate-100"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <DialogTitle className="text-2xl font-black leading-tight text-foreground dark:text-slate-100">选择画布</DialogTitle>
              <Badge variant="secondary" className="rounded-full px-2.5 py-1">{canvases.length} 个</Badge>
            </div>
            <DialogDescription className="mt-1 text-sm font-semibold text-muted-foreground dark:text-slate-500">
              打开已有画布，或新建一个开始创作。
            </DialogDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="icon" className={cn("size-10 rounded-2xl", canvasGhostButtonClass)} onClick={onRefresh} disabled={loading} title="刷新列表">
              <RefreshCw className={cn("size-4", loading && "animate-spin")} />
            </Button>
            <Button type="button" className="h-10 rounded-2xl px-4 text-sm font-black" onClick={onCreateCanvas}>
              <ImagePlus className="size-4" />
              新建画布
            </Button>
          </div>
        </div>

        <div className="max-h-[420px] overflow-y-auto rounded-[24px] border border-border bg-background/45 p-3 dark:border-slate-800 dark:bg-slate-950/35">
          {canvases.length > 0 ? (
            <div className="space-y-2">
              {canvases.map((item) => {
                const active = item.id === currentCanvasId;
                const editing = item.id === editingCanvasId;
                const confirmingDelete = item.id === confirmDeleteCanvasId;
                return (
                  <div
                    key={item.id || `${item.name}-${item.updated_at || item.created_at || "new"}`}
                    role="button"
                    tabIndex={0}
                    className={cn(
                      "group flex w-full items-center gap-3 rounded-2xl border bg-card p-3 text-left transition hover:border-sky-400 hover:shadow-[0_18px_38px_rgba(14,165,233,0.16)] dark:bg-slate-900/80",
                      active ? "border-sky-500 bg-sky-500/10 ring-2 ring-sky-400/20 dark:border-sky-400 dark:bg-sky-400/10" : "border-border dark:border-slate-800",
                    )}
                    onClick={() => {
                      if (!editing && !confirmingDelete && item.id) {
                        onSelectCanvas(item.id);
                      }
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      beginRename(item);
                    }}
                    onKeyDown={(event) => {
                      if (editing) {
                        return;
                      }
                      if ((event.key === "Enter" || event.key === " ") && item.id) {
                        event.preventDefault();
                        onSelectCanvas(item.id);
                      }
                    }}
                  >
                    <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl border", active ? "border-sky-400 bg-sky-500/15 text-sky-600 dark:text-sky-200" : "border-border bg-background text-muted-foreground dark:border-slate-700 dark:bg-slate-950")}>
                      <Layers3 className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      {editing ? (
                        <Input
                          value={editingName}
                          autoFocus
                          className={cn("h-9 max-w-sm rounded-xl text-sm font-black", canvasFieldClass)}
                          onChange={(event) => setEditingName(event.target.value)}
                          onClick={(event) => event.stopPropagation()}
                          onPointerDown={(event) => event.stopPropagation()}
                          onBlur={commitRename}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              commitRename();
                            }
                            if (event.key === "Escape") {
                              event.preventDefault();
                              cancelRename();
                            }
                          }}
                        />
                      ) : (
                        <div className="truncate text-sm font-black text-foreground dark:text-slate-100">{item.name || "未命名画布"}</div>
                      )}
                      <div className={cn("mt-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold", canvasSubtleTextClass)}>
                        <span>{item.nodes.length} 节点</span>
                        <span>{item.edges.length} 连线</span>
                        <span>{item.updated_at ? item.updated_at.slice(5, 16) : item.created_at ? item.created_at.slice(5, 16) : "未保存"}</span>
                      </div>
                    </div>
                    {confirmingDelete ? (
                      <span className="shrink-0 rounded-full bg-rose-500/10 px-3 py-1 text-xs font-black text-rose-600 dark:bg-rose-500/15 dark:text-rose-200">
                        再点确认删除
                      </span>
                    ) : null}
                    {editing ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-9 shrink-0 rounded-xl text-sky-600 hover:bg-sky-500/10 dark:text-sky-200 dark:hover:bg-sky-500/15"
                        title="保存名称"
                        onPointerDown={(event) => event.preventDefault()}
                        onClick={(event) => {
                          event.stopPropagation();
                          commitRename();
                        }}
                      >
                        <Check className="size-4" />
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-9 shrink-0 rounded-xl text-muted-foreground opacity-70 hover:bg-sky-500/10 hover:text-sky-600 group-hover:opacity-100 dark:text-slate-400 dark:hover:bg-sky-500/15 dark:hover:text-sky-200"
                        title="编辑名称"
                        onClick={(event) => {
                          event.stopPropagation();
                          beginRename(item);
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant={confirmingDelete ? "destructive" : "ghost"}
                      size={confirmingDelete ? "sm" : "icon"}
                      className={cn(
                        confirmingDelete
                          ? "h-9 shrink-0 rounded-xl px-3 text-xs font-black"
                          : "size-9 shrink-0 rounded-xl text-muted-foreground opacity-70 hover:bg-rose-500/10 hover:text-rose-600 group-hover:opacity-100 dark:text-slate-400 dark:hover:bg-rose-500/15 dark:hover:text-rose-200",
                      )}
                      title={confirmingDelete ? "确认删除这个画布" : "删除这个画布"}
                      onClick={(event) => {
                        event.stopPropagation();
                        requestDelete(item);
                      }}
                    >
                      <Trash2 className="size-4" />
                      {confirmingDelete ? "确认删除" : null}
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className={cn("flex min-h-36 items-center justify-center rounded-2xl border border-dashed text-sm font-semibold", canvasDashedClass)}>
              暂无画布，点击新建开始创作
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button type="button" variant="outline" className={cn("h-10 rounded-2xl px-5 text-sm font-bold", canvasGhostButtonClass)} onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SmartCanvasAngleControlDialog({
  open,
  image,
  values,
  running,
  onOpenChange,
  onValuesChange,
  onSubmit,
}: {
  open: boolean;
  image: CanvasImageRef | null;
  values: SmartCanvasAngleControlValues;
  running: boolean;
  onOpenChange: (open: boolean) => void;
  onValuesChange: (values: SmartCanvasAngleControlValues) => void;
  onSubmit: (values: SmartCanvasAngleControlValues) => void;
}) {
  const updateValue = (key: keyof SmartCanvasAngleControlValues, value: number) => {
    onValuesChange({ ...values, [key]: value });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(94vw,1180px)] max-w-none rounded-[28px] border border-border bg-[#f8fafc] p-0 text-foreground shadow-[0_34px_120px_rgba(15,23,42,0.30)] dark:border-zinc-800 dark:bg-[#0d1118] dark:text-zinc-100">
        <div className="grid min-h-[680px] grid-rows-[auto,1fr,auto] overflow-hidden rounded-[28px]">
          <DialogHeader className="border-b border-border px-7 py-6 dark:border-zinc-800">
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle className="text-3xl font-black uppercase tracking-tight text-foreground dark:text-white">
                  Angle Control
                </DialogTitle>
                <DialogDescription className="mt-1 text-xs font-black uppercase tracking-[0.28em] text-sky-700 dark:text-sky-200">
                  相机与视角控制
                </DialogDescription>
              </div>
              <div className="rounded-full border border-border px-3 py-1 text-xs font-black text-muted-foreground dark:border-zinc-700 dark:text-zinc-400">角度控制</div>
            </div>
          </DialogHeader>

          <div className="grid min-h-0 grid-cols-[1fr,1fr] gap-8 px-7 py-7">
            <section className="min-w-0">
              <div className="mb-4 text-[11px] font-black uppercase tracking-[0.28em] text-sky-700 dark:text-sky-200">01. 输入图片</div>
              <div className="flex h-[440px] items-center justify-center overflow-hidden rounded-3xl border border-border bg-black/5 dark:border-zinc-800 dark:bg-black/35">
                {image ? (
                  <AuthenticatedImage
                    src={canvasImagePreviewSource(image)}
                    alt={canvasImageLabel(image, 0)}
                    className="h-full w-full object-contain"
                    placeholderClassName="h-full w-full bg-muted dark:bg-zinc-900"
                  />
                ) : (
                  <div className={cn("rounded-2xl border p-6 text-sm font-semibold", canvasDashedClass)}>没有可用图片</div>
                )}
              </div>
            </section>

            <section className="min-w-0">
              <div className="mb-4 text-[11px] font-black uppercase tracking-[0.28em] text-sky-700 dark:text-sky-200">02. 相机控制</div>
              <div className="grid h-[440px] grid-cols-[1fr,260px] overflow-hidden rounded-3xl border border-border bg-background dark:border-zinc-800 dark:bg-[#151515]">
                <div className="relative flex items-center justify-center overflow-hidden bg-[linear-gradient(rgba(255,255,255,.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.06)_1px,transparent_1px)] bg-[size:34px_34px] dark:bg-[linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)]">
                  <div
                    className="h-40 w-64 rounded-xl border border-sky-300/40 bg-slate-900 shadow-[0_28px_80px_rgba(14,165,233,0.20)]"
                    style={{
                      transform: `perspective(760px) rotateY(${Math.round(values.horizontal - 180) / 4}deg) rotateX(${-Math.round(values.vertical) / 3}deg) scale(${1 + Number(values.zoom || 0) / 28})`,
                    }}
                  >
                    {image ? (
                      <AuthenticatedImage
                        src={canvasImagePreviewSource(image)}
                        alt={canvasImageLabel(image, 0)}
                        className="h-full w-full rounded-xl object-cover opacity-80"
                        placeholderClassName="h-full w-full rounded-xl bg-zinc-900"
                      />
                    ) : null}
                  </div>
                </div>
                <div className="space-y-5 border-l border-border bg-muted/35 p-5 dark:border-zinc-800 dark:bg-[#111827]/45">
                  <AngleControlField
                    label="旋转"
                    value={values.horizontal}
                    min={0}
                    max={360}
                    step={1}
                    suffix="deg"
                    onChange={(value) => updateValue("horizontal", value)}
                  />
                  <AngleControlField
                    label="俯仰"
                    value={values.vertical}
                    min={-30}
                    max={90}
                    step={1}
                    suffix="deg"
                    onChange={(value) => updateValue("vertical", value)}
                  />
                  <AngleControlField
                    label="距离"
                    value={values.zoom}
                    min={0}
                    max={10}
                    step={1}
                    suffix="/10"
                    onChange={(value) => updateValue("zoom", value)}
                  />
                </div>
              </div>
            </section>
          </div>

          <DialogFooter className="border-t border-border px-7 py-5 dark:border-zinc-800">
            <Button type="button" variant="outline" className={cn("rounded-xl", canvasGhostButtonClass)} onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="button" className="rounded-xl font-bold" disabled={running || !image} onClick={() => onSubmit(values)}>
              {running ? <LoaderCircle className="size-4 animate-spin" /> : <Cuboid className="size-4" />}
              生成视角
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AngleControlField({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-bold text-foreground dark:text-zinc-200">{label}</span>
        <span className="rounded-lg bg-background px-2 py-1 text-xs font-black text-foreground dark:bg-[#0d1118] dark:text-white">
          {Math.round(value)} {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        className="h-2 w-full accent-sky-500"
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <div className={cn("mt-1 flex justify-between text-[11px] font-semibold", canvasSubtleTextClass)}>
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </label>
  );
}

type SmartCanvasBoardProps = {
  canvas: SmartCanvasDocument | null;
  viewport: SmartCanvasViewport;
  selectedItemId: string;
  selectedItemIds: string[];
  tool: SmartCanvasTool;
  connectState: SmartCanvasConnectState;
  draggingImages: boolean;
  boardRef: React.RefObject<HTMLDivElement | null>;
  imageModels: CanvasModelOption[];
  textModels: CanvasModelOption[];
  running: boolean;
  mentionOpen: boolean;
  mentionItems: CanvasImageRef[];
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onWheel: (event: React.WheelEvent<HTMLDivElement>) => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: (event: React.DragEvent<HTMLDivElement>) => void;
  onContextMenu: (event: React.MouseEvent<HTMLDivElement>) => void;
  onItemPointerDown: (event: ReactPointerEvent<HTMLDivElement>, item: SmartCanvasItem) => void;
  onResizeItemPointerDown: (event: ReactPointerEvent<HTMLElement>, item: SmartCanvasItem) => void;
  onSelectItem: (id: string, multi?: boolean) => void;
  onOpenImage: (image: CanvasImageRef) => void;
  onDeleteImage: (nodeId: string, image: CanvasImageRef) => void;
  onOpenImageEditorForItem: (id: string) => void;
  onRunDetailEnhanceForItem: (id: string) => void;
  onOpenAngleControlForItem: (id: string) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onViewportChange: (viewport: SmartCanvasViewport, commit?: boolean, label?: string) => void;
  onUpdateItemData: (id: string, patch: Partial<SmartCanvasItem["data"]>) => void;
  onRunGenerator: (id: string) => void;
  onRunLlm: (id: string) => void;
  onDeleteItem: (id: string) => void;
  onStartConnect: (event: ReactPointerEvent<HTMLElement>, sourceId: string) => void;
  onFinishConnect: (event: ReactPointerEvent<HTMLElement>, targetId: string) => void;
  onDeleteEdge: (id: string) => void;
  onMentionToggle: () => void;
  onAddMentionToPrompt: (nodeId: string, image: CanvasImageRef) => void;
  onCreateNodeAt: (type: SmartCanvasItem["type"], point: { x: number; y: number }) => void;
  onUploadAt: (point: { x: number; y: number }) => void;
};

export function SmartCanvasBoard({
  canvas,
  viewport,
  selectedItemId,
  selectedItemIds,
  tool,
  connectState,
  draggingImages,
  boardRef,
  imageModels,
  textModels,
  running,
  mentionOpen,
  mentionItems,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onWheel,
  onDrop,
  onDragOver,
  onDragLeave,
  onContextMenu,
  onItemPointerDown,
  onResizeItemPointerDown,
  onSelectItem,
  onOpenImage,
  onDeleteImage,
  onOpenImageEditorForItem,
  onRunDetailEnhanceForItem,
  onOpenAngleControlForItem,
  onZoomIn,
  onZoomOut,
  onFit,
  onViewportChange,
  onUpdateItemData,
  onRunGenerator,
  onRunLlm,
  onDeleteItem,
  onStartConnect,
  onFinishConnect,
  onDeleteEdge,
  onMentionToggle,
  onAddMentionToPrompt,
  onCreateNodeAt,
  onUploadAt,
}: SmartCanvasBoardProps) {
  const [nodeSizes, setNodeSizes] = useState<SmartCanvasNodeSizeMap>({});
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; screen: { x: number; y: number } } | null>(null);
  const handleMeasureNode = useCallback((id: string, size: { w: number; h: number }) => {
    setNodeSizes((current) => {
      const previous = current[id];
      if (previous?.w === size.w && previous.h === size.h) {
        return current;
      }
      return { ...current, [id]: size };
    });
  }, []);
  const previewEdge = connectState.kind === "link"
    ? {
        id: "preview",
        source: connectState.sourceId,
        target: "",
        pointer: connectState.pointer,
      }
    : null;

  return (
    <section className="relative h-full min-h-0 flex-1 overflow-hidden bg-[#eef4fb] dark:bg-[#050505]">
      <div
        ref={boardRef}
        className={cn(
          "smart-canvas-board absolute inset-0 touch-none select-none overflow-hidden",
          draggingImages ? "ring-2 ring-sky-400/70" : "",
          tool === "pan" ? "cursor-grab active:cursor-grabbing" : "cursor-default",
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onContextMenu={(event) => {
          onContextMenu(event);
          if (event.defaultPrevented) {
            const rect = boardRef.current?.getBoundingClientRect();
            if (rect) {
              setContextMenu({
                x: Math.min(event.clientX - rect.left, rect.width - 236),
                y: Math.min(event.clientY - rect.top, rect.height - 360),
                screen: { x: event.clientX, y: event.clientY },
              });
            }
          }
        }}
        onClick={() => {
          if (contextMenu) {
            setContextMenu(null);
          }
        }}
      >
        <div
          className="absolute left-0 top-0"
          style={{
            transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.zoom})`,
            transformOrigin: "0 0",
          }}
        >
          <svg className="pointer-events-none absolute left-0 top-0 h-[4000px] w-[5000px] overflow-visible">
            <defs>
              <filter id="canvas-link-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="2.4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {canvas?.edges.map((edge) => (
              <SmartCanvasEdgePath
                key={edge.id}
                edge={edge}
                nodes={canvas.nodes}
                nodeSizes={nodeSizes}
                selected={selectedItemIds.includes(edge.source) || selectedItemIds.includes(edge.target) || edge.source === selectedItemId || edge.target === selectedItemId}
              />
            ))}
            {previewEdge ? <SmartCanvasPreviewEdge sourceId={previewEdge.source} pointer={previewEdge.pointer} nodes={canvas?.nodes || []} nodeSizes={nodeSizes} /> : null}
          </svg>
          {canvas?.edges.map((edge) => (
            <EdgeDeleteButton key={`${edge.id}-delete`} edge={edge} nodes={canvas.nodes} nodeSizes={nodeSizes} onDelete={onDeleteEdge} />
          ))}
          {canvas?.nodes.map((item) => (
            <SmartCanvasNode
              key={item.id}
              canvas={canvas}
              item={item}
              selected={item.id === selectedItemId || selectedItemIds.includes(item.id)}
              imageModels={imageModels}
              textModels={textModels}
              running={running}
              mentionOpen={mentionOpen && item.id === selectedItemId}
              mentionItems={mentionItems}
              onPointerDown={(event) => onItemPointerDown(event, item)}
              onResizePointerDown={(event) => onResizeItemPointerDown(event, item)}
              onSelect={(multi) => onSelectItem(item.id, multi)}
              onOpenImage={onOpenImage}
              onDeleteImage={(image) => onDeleteImage(item.id, image)}
              onOpenImageEditor={() => onOpenImageEditorForItem(item.id)}
              onRunDetailEnhance={() => onRunDetailEnhanceForItem(item.id)}
              onOpenAngleControl={() => onOpenAngleControlForItem(item.id)}
              onUpdateData={(patch) => onUpdateItemData(item.id, patch)}
              onRunGenerator={() => onRunGenerator(item.id)}
              onRunLlm={() => onRunLlm(item.id)}
              onDeleteItem={() => onDeleteItem(item.id)}
              onStartConnect={(event) => onStartConnect(event, item.id)}
              onFinishConnect={(event) => onFinishConnect(event, item.id)}
              onMentionToggle={onMentionToggle}
              onAddMention={(image) => onAddMentionToPrompt(item.id, image)}
              onMeasure={handleMeasureNode}
            />
          ))}
        </div>
        {canvas && canvas.nodes.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className={cn("rounded-3xl border p-6 text-center shadow-2xl backdrop-blur", canvasDashedClass)}>
              <Images className="mx-auto mb-3 size-9 text-muted-foreground dark:text-slate-500" />
              <div className="text-sm font-bold text-foreground dark:text-slate-200">从顶部或右键添加节点，或拖入图片开始创作</div>
              <div className={cn("mt-1 text-xs", canvasSubtleTextClass)}>提示词、AI 提示词、API生成、Output 都可以在节点里直接编辑。</div>
            </div>
          </div>
        ) : null}
        {contextMenu ? (
          <SmartCanvasContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            onClose={() => setContextMenu(null)}
            onUpload={() => {
              onUploadAt(contextMenu.screen);
              setContextMenu(null);
            }}
            onCreate={(type) => {
              onCreateNodeAt(type, contextMenu.screen);
              setContextMenu(null);
            }}
          />
        ) : null}
      </div>

      <SmartCanvasMiniMap
        canvas={canvas}
        viewport={viewport}
        nodeSizes={nodeSizes}
        boardRef={boardRef}
        onViewportChange={onViewportChange}
      />
      <div className="absolute bottom-4 left-[246px] z-30 flex flex-col gap-2 opacity-45 transition-opacity duration-200 hover:opacity-100 focus-within:opacity-100">
        <IconToolButton title="放大" onClick={onZoomIn}><ZoomIn className="size-4" /></IconToolButton>
        <IconToolButton title="缩小" onClick={onZoomOut}><ZoomOut className="size-4" /></IconToolButton>
        <IconToolButton title="适配内容" onClick={onFit}><BoxSelect className="size-4" /></IconToolButton>
      </div>
      <div className="absolute bottom-3 left-1/2 z-30 -translate-x-1/2 rounded-full bg-card/85 px-4 py-1 text-[11px] font-semibold text-muted-foreground shadow-sm backdrop-blur dark:bg-slate-950/70 dark:text-slate-500">
        右键添加节点，Ctrl/⌘ 点击多选，拖动任一已选节点可一起移动，Delete 删除所选
      </div>
      <div className="absolute right-6 top-24 z-30 rounded-full border border-border bg-card/90 px-3 py-1 text-xs font-bold text-muted-foreground shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-950/80 dark:text-slate-400">
        {Math.round(viewport.zoom * 100)}%
      </div>
    </section>
  );
}

function SmartCanvasContextMenu({
  x,
  y,
  onClose,
  onUpload,
  onCreate,
}: {
  x: number;
  y: number;
  onClose: () => void;
  onUpload: () => void;
  onCreate: (type: SmartCanvasItem["type"]) => void;
}) {
  const items: Array<{
    label: string;
    icon: ReactNode;
    action?: () => void;
    disabled?: boolean;
  }> = [
    { label: "上传卡片", icon: <ImagePlus className="size-4" />, action: onUpload },
    { label: "提示词", icon: <FileText className="size-4" />, action: () => onCreate("prompt") },
    { label: "AI 提示词", icon: <Bot className="size-4" />, action: () => onCreate("llm") },
    { label: "API生成", icon: <WandSparkles className="size-4" />, action: () => onCreate("image_generation") },
    { label: "Output", icon: <CircleDot className="size-4" />, action: () => onCreate("result") },
  ];

  return (
    <div
      data-node-interactive="true"
      className="absolute z-50 w-56 rounded-2xl border border-border bg-card/96 p-2 text-card-foreground shadow-[0_24px_72px_rgba(15,23,42,0.24)] backdrop-blur dark:border-slate-700 dark:bg-[#111827]/96 dark:text-slate-100"
      style={{ left: Math.max(12, x), top: Math.max(12, y) }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          className={cn(
            "flex h-9 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-bold transition",
            item.disabled
              ? "cursor-not-allowed text-muted-foreground/45 dark:text-slate-600"
              : "text-muted-foreground hover:bg-accent hover:text-foreground dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white",
          )}
          disabled={item.disabled}
          onClick={() => {
            item.action?.();
          }}
        >
          {item.icon}
          <span className="truncate">{item.label}</span>
        </button>
      ))}
      <div className="mt-2 border-t border-border pt-2 dark:border-slate-700">
        <button
          type="button"
          className="flex h-8 w-full items-center justify-center rounded-xl text-xs font-bold text-muted-foreground hover:bg-accent hover:text-foreground dark:text-slate-400 dark:hover:bg-slate-800"
          onClick={onClose}
        >
          关闭
        </button>
      </div>
    </div>
  );
}

function SmartCanvasMiniMap({
  canvas,
  viewport,
  nodeSizes,
  boardRef,
  onViewportChange,
}: {
  canvas: SmartCanvasDocument | null;
  viewport: SmartCanvasViewport;
  nodeSizes: SmartCanvasNodeSizeMap;
  boardRef: React.RefObject<HTMLDivElement | null>;
  onViewportChange: (viewport: SmartCanvasViewport, commit?: boolean, label?: string) => void;
}) {
  const mapWidth = 188;
  const mapHeight = 116;
  const padding = 10;
  const [dragging, setDragging] = useState(false);
  const nodes = canvas?.nodes || EMPTY_SMART_CANVAS_NODES;
  const boardRect = boardRef.current?.getBoundingClientRect();
  const bounds = useMemo(() => {
    if (nodes.length === 0) {
      return { minX: -300, minY: -220, maxX: 900, maxY: 620 };
    }
    const xs = nodes.flatMap((item) => {
      const size = nodeSizes[item.id] || NODE_SIZE[item.type];
      const x = Number(item.position?.x || 0);
      return [x, x + size.w];
    });
    const ys = nodes.flatMap((item) => {
      const size = nodeSizes[item.id] || NODE_SIZE[item.type];
      const y = Number(item.position?.y || 0);
      return [y, y + size.h];
    });
    return {
      minX: Math.min(...xs) - 180,
      minY: Math.min(...ys) - 160,
      maxX: Math.max(...xs) + 180,
      maxY: Math.max(...ys) + 160,
    };
  }, [nodeSizes, nodes]);
  const scale = Math.min((mapWidth - padding * 2) / Math.max(1, bounds.maxX - bounds.minX), (mapHeight - padding * 2) / Math.max(1, bounds.maxY - bounds.minY));
  const worldToMap = useCallback((point: { x: number; y: number }) => ({
    x: padding + (point.x - bounds.minX) * scale,
    y: padding + (point.y - bounds.minY) * scale,
  }), [bounds.minX, bounds.minY, scale]);
  const mapToWorld = useCallback((point: { x: number; y: number }) => ({
    x: bounds.minX + (point.x - padding) / scale,
    y: bounds.minY + (point.y - padding) / scale,
  }), [bounds.minX, bounds.minY, scale]);
  const viewportRect = useMemo(() => {
    if (!boardRect) {
      return null;
    }
    const topLeft = worldToMap({ x: -viewport.x / viewport.zoom, y: -viewport.y / viewport.zoom });
    const bottomRight = worldToMap({
      x: (boardRect.width - viewport.x) / viewport.zoom,
      y: (boardRect.height - viewport.y) / viewport.zoom,
    });
    const x = Math.max(2, Math.min(mapWidth - 4, topLeft.x));
    const y = Math.max(2, Math.min(mapHeight - 4, topLeft.y));
    return {
      x,
      y,
      w: Math.max(10, Math.min(mapWidth - 4, bottomRight.x) - x),
      h: Math.max(10, Math.min(mapHeight - 4, bottomRight.y) - y),
    };
  }, [boardRect, viewport, worldToMap]);

  const moveViewportToClientPoint = useCallback((event: ReactPointerEvent<HTMLDivElement>, commit = false) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const board = boardRef.current?.getBoundingClientRect();
    if (!board) {
      return;
    }
    const mapPoint = {
      x: Math.max(0, Math.min(mapWidth, event.clientX - rect.left)),
      y: Math.max(0, Math.min(mapHeight, event.clientY - rect.top)),
    };
    const world = mapToWorld(mapPoint);
    onViewportChange({
      ...viewport,
      x: board.width / 2 - world.x * viewport.zoom,
      y: board.height / 2 - world.y * viewport.zoom,
    }, commit, "移动小地图");
  }, [boardRef, mapToWorld, onViewportChange, viewport]);

  return (
    <div
      className={cn(
        "absolute bottom-4 left-6 z-30 rounded-2xl border border-border/80 bg-card/60 p-2 shadow-xl backdrop-blur transition-opacity duration-200 hover:opacity-100 dark:border-slate-700/80 dark:bg-slate-950/55",
        dragging ? "opacity-100" : "opacity-45",
      )}
    >
      <div
        className="relative cursor-grab overflow-hidden rounded-xl border border-muted-foreground/40 bg-background/70 active:cursor-grabbing dark:border-slate-500 dark:bg-slate-950/70"
        style={{ width: mapWidth, height: mapHeight }}
        onPointerDown={(event) => {
          event.preventDefault();
          setDragging(true);
          event.currentTarget.setPointerCapture(event.pointerId);
          moveViewportToClientPoint(event);
        }}
        onPointerMove={(event) => {
          if (dragging) {
            moveViewportToClientPoint(event);
          }
        }}
        onPointerUp={(event) => {
          if (dragging) {
            moveViewportToClientPoint(event, true);
          }
          setDragging(false);
          try {
            event.currentTarget.releasePointerCapture(event.pointerId);
          } catch {
            // Pointer capture may already be released.
          }
        }}
        onPointerCancel={() => setDragging(false)}
        title="拖动小地图移动画布视口"
      >
        {nodes.map((item) => {
          const size = nodeSizes[item.id] || NODE_SIZE[item.type];
          const point = worldToMap({ x: Number(item.position?.x || 0), y: Number(item.position?.y || 0) });
          return (
            <span
              key={item.id}
              className={cn("absolute rounded bg-sky-400", item.type === "image" && "bg-cyan-400", item.type === "result" && "bg-indigo-400")}
              style={{
                left: point.x,
                top: point.y,
                width: Math.max(10, size.w * scale),
                height: Math.max(7, size.h * scale),
              }}
            />
          );
        })}
        {viewportRect ? (
          <span
            className="absolute rounded-md border-2 border-slate-900/75 bg-sky-400/10 shadow-[0_0_0_1px_rgba(255,255,255,0.7)] dark:border-white/85"
            style={{ left: viewportRect.x, top: viewportRect.y, width: viewportRect.w, height: viewportRect.h }}
          />
        ) : null}
      </div>
    </div>
  );
}

function stopNodeInteraction(event: ReactPointerEvent<HTMLElement>) {
  event.stopPropagation();
}

function SmartCanvasEdgePath({
  edge,
  nodes,
  nodeSizes,
  selected,
}: {
  edge: { id: string; source: string; target: string };
  nodes: SmartCanvasItem[];
  nodeSizes: SmartCanvasNodeSizeMap;
  selected: boolean;
}) {
  const source = nodes.find((node) => node.id === edge.source);
  const target = nodes.find((node) => node.id === edge.target);
  if (!source || !target) {
    return null;
  }
  const a = outputPortPoint(source, nodeSizes);
  const b = inputPortPoint(target, nodeSizes);
  return (
    <path
      d={bezierPath(a, b)}
      fill="none"
      stroke={selected ? "#38bdf8" : "#64748b"}
      strokeWidth={selected ? 3 : 2}
      strokeLinecap="round"
      filter={selected ? "url(#canvas-link-glow)" : undefined}
      opacity={selected ? 0.95 : 0.75}
    />
  );
}

function SmartCanvasPreviewEdge({ sourceId, pointer, nodes, nodeSizes }: { sourceId: string; pointer: { x: number; y: number }; nodes: SmartCanvasItem[]; nodeSizes: SmartCanvasNodeSizeMap }) {
  const source = nodes.find((node) => node.id === sourceId);
  if (!source) {
    return null;
  }
  const a = outputPortPoint(source, nodeSizes);
  return (
    <path d={bezierPath(a, pointer)} fill="none" stroke="#38bdf8" strokeDasharray="6 6" strokeWidth={2.5} strokeLinecap="round" opacity={0.9} />
  );
}

function EdgeDeleteButton({ edge, nodes, nodeSizes, onDelete }: { edge: { id: string; source: string; target: string }; nodes: SmartCanvasItem[]; nodeSizes: SmartCanvasNodeSizeMap; onDelete: (id: string) => void }) {
  const source = nodes.find((node) => node.id === edge.source);
  const target = nodes.find((node) => node.id === edge.target);
  if (!source || !target) {
    return null;
  }
  const a = outputPortPoint(source, nodeSizes);
  const b = inputPortPoint(target, nodeSizes);
  return (
    <button
      type="button"
      className="absolute z-20 flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-muted-foreground opacity-70 shadow-lg transition hover:border-rose-400 hover:text-rose-500 hover:opacity-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400 dark:hover:text-rose-300"
      style={{ left: (a.x + b.x) / 2, top: (a.y + b.y) / 2 }}
      onClick={(event) => {
        event.stopPropagation();
        onDelete(edge.id);
      }}
      title="删除连线"
    >
      <X className="size-3.5" />
    </button>
  );
}

type SmartCanvasNodeProps = {
  canvas: SmartCanvasDocument;
  item: SmartCanvasItem;
  selected: boolean;
  imageModels: CanvasModelOption[];
  textModels: CanvasModelOption[];
  running: boolean;
  mentionOpen: boolean;
  mentionItems: CanvasImageRef[];
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onResizePointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onSelect: (multi?: boolean) => void;
  onOpenImage: (image: CanvasImageRef) => void;
  onDeleteImage: (image: CanvasImageRef) => void;
  onOpenImageEditor: () => void;
  onRunDetailEnhance: () => void;
  onOpenAngleControl: () => void;
  onUpdateData: (patch: Partial<SmartCanvasItem["data"]>) => void;
  onRunGenerator: () => void;
  onRunLlm: () => void;
  onDeleteItem: () => void;
  onStartConnect: (event: ReactPointerEvent<HTMLElement>) => void;
  onFinishConnect: (event: ReactPointerEvent<HTMLElement>) => void;
  onMentionToggle: () => void;
  onAddMention: (image: CanvasImageRef) => void;
  onMeasure: (id: string, size: { w: number; h: number }) => void;
};

export const SmartCanvasNode = memo(function SmartCanvasNode({
  canvas,
  item,
  selected,
  imageModels,
  textModels,
  running,
  mentionOpen,
  mentionItems,
  onPointerDown,
  onResizePointerDown,
  onSelect,
  onOpenImage,
  onDeleteImage,
  onOpenImageEditor,
  onRunDetailEnhance,
  onOpenAngleControl,
  onUpdateData,
  onRunGenerator,
  onRunLlm,
  onDeleteItem,
  onStartConnect,
  onFinishConnect,
  onMentionToggle,
  onAddMention,
  onMeasure,
}: SmartCanvasNodeProps) {
  const size = NODE_SIZE[item.type];
  const width = item.type === "image" ? Number(item.data?.width || size.w) : size.w;
  const minHeight = item.type === "image" ? Number(item.data?.height || size.h) : size.h;
  const canInput = item.type === "llm" || item.type === "image_generation" || item.type === "result";
  const canOutput = item.type !== "result";
  const measureRef = (node: HTMLDivElement | null) => {
    if (!node) {
      return;
    }
    onMeasure(item.id, {
      w: Math.round(node.offsetWidth),
      h: Math.round(node.offsetHeight),
    });
  };

  useLayoutEffect(() => {
    const node = document.querySelector<HTMLDivElement>(`[data-canvas-node-id="${item.id}"]`);
    if (!node) {
      return;
    }
    const emitSize = () => onMeasure(item.id, {
      w: Math.round(node.offsetWidth),
      h: Math.round(node.offsetHeight),
    });
    emitSize();
    const observer = new ResizeObserver(emitSize);
    observer.observe(node);
    return () => observer.disconnect();
  }, [item.id, onMeasure]);

  return (
    <div
      ref={measureRef}
      data-canvas-node-id={item.id}
      className={cn(
        "group absolute rounded-2xl border bg-card/95 text-card-foreground shadow-[0_18px_46px_rgba(44,74,116,0.18)] backdrop-blur dark:bg-[#181818] dark:text-zinc-100 dark:shadow-[0_18px_46px_rgba(0,0,0,0.36)]",
        selected ? "border-sky-500 ring-2 ring-sky-400/30 dark:border-zinc-200 dark:ring-sky-400/35" : "border-border hover:border-muted-foreground/50 dark:border-zinc-800 dark:hover:border-zinc-600",
      )}
      style={{
        transform: `translate3d(${Number(item.position?.x || 0)}px, ${Number(item.position?.y || 0)}px, 0)`,
        width,
        minHeight,
        zIndex: selected ? 35 : 10,
      }}
      onPointerDown={onPointerDown}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(event.ctrlKey || event.metaKey);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {canInput ? <Port side="in" onPointerUp={onFinishConnect} /> : null}
      {canOutput ? <Port side="out" onPointerDown={onStartConnect} /> : null}
      <NodeHeader item={item} onDelete={onDeleteItem} />
      {item.type === "image" ? (
        <>
          <ImageNodeBody
            item={item}
            onOpenImage={onOpenImage}
            onDeleteImage={onDeleteImage}
            onOpenImageEditor={onOpenImageEditor}
            onRunDetailEnhance={onRunDetailEnhance}
            onOpenAngleControl={onOpenAngleControl}
            height={Math.max(100, minHeight - 126)}
          />
          <ResizeHandle onPointerDown={onResizePointerDown} />
        </>
      ) : item.type === "prompt" ? (
        <PromptNodeBody
          item={item}
          mentionOpen={mentionOpen}
          mentionItems={mentionItems}
          onUpdateData={onUpdateData}
          onMentionToggle={onMentionToggle}
          onAddMention={onAddMention}
        />
      ) : item.type === "llm" ? (
        <LlmNodeBody
          canvas={canvas}
          item={item}
          models={textModels}
          running={running}
          onUpdateData={onUpdateData}
          onRunLlm={onRunLlm}
        />
      ) : item.type === "image_generation" ? (
        <GeneratorNodeBody
          canvas={canvas}
          item={item}
          models={imageModels}
          running={running}
          onUpdateData={onUpdateData}
          onRunGenerator={onRunGenerator}
          onOpenImage={onOpenImage}
          onDeleteDirectImage={onDeleteImage}
        />
      ) : (
        <OutputNodeBody item={item} onOpenImage={onOpenImage} onDeleteImage={onDeleteImage} />
      )}
    </div>
  );
});

function NodeHeader({ item, onDelete }: { item: SmartCanvasItem; onDelete: () => void }) {
  return (
    <div className="flex h-10 cursor-move items-center justify-between border-b border-border px-3 dark:border-slate-700/80" data-canvas-drag-handle="true">
      <div className="flex min-w-0 items-center gap-2">
        <ItemTypeIcon type={item.type} />
        <span className={cn("truncate text-[12px] font-black uppercase tracking-[0.14em]", canvasAccentTextClass)}>{nodeTitle(item)}</span>
      </div>
      <div className="flex items-center gap-1">
        {item.data?.status ? <StatusBadge status={item.data.status} /> : null}
        <button
          type="button"
          className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-white"
          data-node-interactive="true"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

function ImageNodeBody({
  item,
  onOpenImage,
  onDeleteImage,
  onOpenImageEditor,
  onRunDetailEnhance,
  onOpenAngleControl,
  height,
}: {
  item: SmartCanvasItem;
  onOpenImage: (image: CanvasImageRef) => void;
  onDeleteImage: (image: CanvasImageRef) => void;
  onOpenImageEditor: () => void;
  onRunDetailEnhance: () => void;
  onOpenAngleControl: () => void;
  height: number;
}) {
  const images = item.data?.images || [];
  const imageToolDisabledReason = images.length === 0
    ? "当前节点没有可编辑图片"
    : images.length > 1
      ? "当前节点包含多张图片，请先拆分或保留单张图片"
      : "";
  return (
    <div className="space-y-3 p-3">
      {images.length > 0 ? (
        <div style={{ height }}>
          <CanvasImageStrip images={images} limit={4} onOpen={onOpenImage} onDelete={onDeleteImage} className="h-full grid-cols-2" large />
        </div>
      ) : (
        <div className={cn("flex flex-col items-center justify-center rounded-xl border", canvasDashedClass)} style={{ height }}>
          <ImagePlus className="mb-2 size-7" />
          <span className="text-xs font-semibold">拖入或粘贴图片</span>
        </div>
      )}
      <div className={cn("min-w-0 truncate pr-8 text-xs", canvasLabelClass)} title={images[0]?.name || item.name || `${images.length} 张图片`}>
        {images[0]?.name || item.name || `${images.length} 张图片`}
      </div>
      <div className="grid grid-cols-2 gap-1" data-node-interactive="true" onPointerDown={stopNodeInteraction}>
        <ImageToolActionButton
          icon={<ImageIcon className="size-3.5" />}
          label="编辑"
          title={imageToolDisabledReason || "裁剪、扩图、遮罩、画笔、宫格切分"}
          disabled={Boolean(imageToolDisabledReason)}
          onClick={onOpenImageEditor}
        />
        <ImageToolActionButton
          icon={<Cuboid className="size-3.5" />}
          label="角度"
          title={imageToolDisabledReason || "角度控制"}
          disabled={Boolean(imageToolDisabledReason)}
          onClick={onOpenAngleControl}
        />
      </div>
    </div>
  );
}

function ImageToolActionButton({
  icon,
  label,
  title,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  title: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="inline-flex h-8 items-center justify-center gap-1 rounded-lg bg-muted/70 px-2 text-[11px] font-black text-foreground transition hover:bg-sky-500/12 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-slate-950/55 dark:text-slate-200 dark:hover:bg-sky-400/10 dark:hover:text-sky-200"
      title={title}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function ResizeHandle({ onPointerDown }: { onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void }) {
  return (
    <button
      type="button"
      className="absolute right-2 bottom-2 z-40 flex size-5 items-center justify-center rounded-full border border-muted-foreground/50 bg-background/90 text-muted-foreground shadow-sm transition hover:border-sky-500 hover:text-sky-600 dark:border-slate-500 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-sky-300 dark:hover:text-sky-200"
      data-node-interactive="true"
      onPointerDown={onPointerDown}
      title="拖拽缩放图片节点"
      aria-label="拖拽缩放图片节点"
    >
      <span className="block size-2.5 rounded-br-[6px] border-r-2 border-b-2 border-current" />
    </button>
  );
}

function PromptNodeBody({
  item,
  mentionOpen,
  mentionItems,
  onUpdateData,
  onMentionToggle,
  onAddMention,
}: {
  item: SmartCanvasItem;
  mentionOpen: boolean;
  mentionItems: CanvasImageRef[];
  onUpdateData: (patch: Partial<SmartCanvasItem["data"]>) => void;
  onMentionToggle: () => void;
  onAddMention: (image: CanvasImageRef) => void;
}) {
  const inputImages = item.data?.input_images || [];
  return (
    <div className="relative p-3" data-node-interactive="true" onPointerDown={stopNodeInteraction}>
      <Textarea
        value={item.data?.prompt || ""}
        onChange={(event) => onUpdateData({ prompt: event.target.value })}
        className={cn("h-32 resize-none rounded-xl text-sm", canvasFieldClass)}
        placeholder="输入提示词..."
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <Button type="button" size="sm" variant="outline" className={cn("h-7 rounded-lg px-2 text-xs", canvasGhostButtonClass)} onClick={onMentionToggle}>
          @图片
        </Button>
        <span className={cn("text-[11px] font-semibold", canvasAccentTextClass)}>{(item.data?.prompt || "").length} / 20,000</span>
      </div>
      {inputImages.length > 0 ? <CanvasImageStrip images={inputImages} limit={4} className="mt-2 grid-cols-4" /> : null}
      {mentionOpen ? (
        <MentionPicker images={mentionItems} onAdd={onAddMention} />
      ) : null}
    </div>
  );
}

function LlmNodeBody({
  canvas,
  item,
  models,
  running,
  onUpdateData,
  onRunLlm,
}: {
  canvas: SmartCanvasDocument;
  item: SmartCanvasItem;
  models: CanvasModelOption[];
  running: boolean;
  onUpdateData: (patch: Partial<SmartCanvasItem["data"]>) => void;
  onRunLlm: () => void;
}) {
  const upstream = incomingItems(canvas, item.id);
  const upstreamTexts = upstream
    .map((node) => ({
      id: node.id,
      name: nodeTitle(node),
      text: String(canvasPromptFromItem(node)).trim(),
    }))
    .filter((entry) => entry.text);
  const upstreamImages = dedupeCanvasImageRefs(upstream.flatMap((node) => canvasImagesFromItem(node)));
  const outputText = item.data?.output?.text || "";
  const nodeRunning = isActiveTask(item.data?.status);
  const availableModels = models.filter((model) => model.kind === "text" || model.kind === "both" || model.id === "auto");
  const hasInput = upstreamTexts.length > 0 || upstreamImages.length > 0 || Boolean((item.data?.prompt || "").trim());

  return (
    <div className="space-y-3 p-3" data-node-interactive="true" onPointerDown={stopNodeInteraction}>
      <div>
        <div className={cn("mb-1 text-[11px] font-black uppercase tracking-[0.14em]", canvasLabelClass)}>Input</div>
        {upstreamTexts.length > 0 ? (
          <div className="mb-2 space-y-1">
            {upstreamTexts.slice(0, 3).map((entry) => (
              <div
                key={entry.id}
                className="rounded-xl border border-sky-500/20 bg-sky-500/8 px-3 py-2 text-xs font-semibold text-foreground dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-slate-100"
                title={`${entry.name}: ${entry.text}`}
              >
                <div className={cn("mb-1 truncate text-[10px] font-black uppercase tracking-[0.12em]", canvasAccentTextClass)}>
                  已连接 {entry.name}
                </div>
                <div className="line-clamp-2 whitespace-pre-wrap break-words">{entry.text}</div>
              </div>
            ))}
            {upstreamTexts.length > 3 ? (
              <div className={cn("rounded-xl border px-3 py-2 text-xs font-bold", canvasDashedClass)}>
                还有 {upstreamTexts.length - 3} 个文本输入
              </div>
            ) : null}
          </div>
        ) : null}
        <Textarea
          value={item.data?.prompt || ""}
          onChange={(event) => onUpdateData({ prompt: event.target.value })}
          className={cn("h-24 resize-none rounded-xl text-xs", canvasFieldClass)}
          placeholder="补充处理要求，例如：优化成英文生图提示词..."
        />
      </div>

      <div>
        <div className={cn("mb-1 text-[11px] font-black uppercase tracking-[0.14em]", canvasLabelClass)}>Images</div>
        {upstreamImages.length > 0 ? (
          <CanvasImageStrip images={upstreamImages} limit={4} className="grid-cols-5" />
        ) : (
          <div className={cn("rounded-xl border px-3 py-3 text-xs", canvasDashedClass)}>可连接图片节点，让 AI 先看图再输出提示词</div>
        )}
      </div>

      <div className="grid grid-cols-[76px_1fr] gap-2">
        <Select value="llm" disabled>
          <SelectTrigger className={canvasSelectClass}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="llm">模型</SelectItem>
          </SelectContent>
        </Select>
        <Select value={item.data?.model || "auto"} onValueChange={(model) => onUpdateData({ model })}>
          <SelectTrigger className={canvasSelectClass}>
            <SelectValue placeholder="模型" />
          </SelectTrigger>
          <SelectContent>
            {availableModels.map((model) => (
              <SelectItem key={model.id} value={model.id}>{model.name || model.id}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <div className={cn("mb-1 text-[11px] font-black uppercase tracking-[0.14em]", canvasLabelClass)}>Output</div>
        <div className={cn("min-h-24 rounded-xl border p-3 text-xs leading-relaxed", outputText ? "border-border bg-background/70 text-foreground dark:border-slate-700 dark:bg-slate-950/45 dark:text-slate-100" : canvasDashedClass)}>
          {nodeRunning ? (
            <span className="inline-flex items-center gap-2">
              <LoaderCircle className="size-4 animate-spin" />
              运行中
            </span>
          ) : outputText ? (
            <div className="line-clamp-5 whitespace-pre-wrap break-words">{outputText}</div>
          ) : (
            "运行后会输出文本，可连接到 API生成 节点"
          )}
        </div>
      </div>

      {item.data?.error ? <div className="rounded-lg bg-rose-500/10 px-2 py-1.5 text-xs text-rose-600 dark:text-rose-200">{item.data.error}</div> : null}
      <Button
        type="button"
        className="h-10 w-full rounded-xl bg-primary font-bold text-primary-foreground hover:bg-primary/90 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
        disabled={running || nodeRunning || !hasInput}
        onClick={onRunLlm}
      >
        {running || nodeRunning ? <LoaderCircle className="size-4 animate-spin" /> : <Bot className="size-4" />}
        生成提示词
      </Button>
    </div>
  );
}

function GeneratorNodeBody({
  canvas,
  item,
  models,
  running,
  onUpdateData,
  onRunGenerator,
  onOpenImage,
  onDeleteDirectImage,
}: {
  canvas: SmartCanvasDocument;
  item: SmartCanvasItem;
  models: CanvasModelOption[];
  running: boolean;
  onUpdateData: (patch: Partial<SmartCanvasItem["data"]>) => void;
  onRunGenerator: () => void;
  onOpenImage: (image: CanvasImageRef) => void;
  onDeleteDirectImage: (image: CanvasImageRef) => void;
}) {
  const upstream = incomingItems(canvas, item.id);
  const upstreamPrompts = upstream
    .filter((node) => node.type === "prompt" || node.type === "llm")
    .map((node) => ({
      id: node.id,
      name: node.type === "llm" ? "AI 提示词" : node.name || "Prompt",
      text: String(canvasPromptFromItem(node)).trim(),
    }))
    .filter((entry) => entry.text);
  const mergedPromptPreview = [
    ...upstreamPrompts.map((entry) => entry.text),
    item.data?.prompt || "",
  ].map((value) => value.trim()).filter(Boolean).join("\n\n");
  const upstreamImages = upstream.flatMap((node) => {
    if (node.type === "prompt") {
      return node.data?.input_images || [];
    }
    if (node.type === "result") {
      return node.data?.output?.images || node.data?.images || [];
    }
    return node.data?.images || [];
  });
  const upstreamImageKeys = new Set(dedupeCanvasImageRefs(upstreamImages).map(canvasImageKey));
  const images = dedupeCanvasImageRefs([
    ...(item.data?.input_images || []).filter((image) => !upstreamImageKeys.has(canvasImageKey(image))),
    ...upstreamImages,
  ]);
  const outputImages = item.data?.output?.images || [];
  const nodeRunning = isActiveTask(item.data?.status);

  return (
    <div className="space-y-3 p-3" data-node-interactive="true" onPointerDown={stopNodeInteraction}>
      <div>
        <div className={cn("mb-1 text-[11px] font-black uppercase tracking-[0.14em]", canvasLabelClass)}>Prompts</div>
        {upstreamPrompts.length > 0 ? (
          <div className="mb-2 space-y-1">
            {upstreamPrompts.slice(0, 3).map((entry) => (
              <div
                key={entry.id}
                className="rounded-xl border border-sky-500/20 bg-sky-500/8 px-3 py-2 text-xs font-semibold text-foreground dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-slate-100"
                title={`${entry.name}: ${entry.text}`}
              >
                <div className={cn("mb-1 truncate text-[10px] font-black uppercase tracking-[0.12em]", canvasAccentTextClass)}>
                  已连接 {entry.name}
                </div>
                <div className="line-clamp-2 whitespace-pre-wrap break-words">{entry.text}</div>
              </div>
            ))}
            {upstreamPrompts.length > 3 ? (
              <div className={cn("rounded-xl border px-3 py-2 text-xs font-bold", canvasDashedClass)}>
                还有 {upstreamPrompts.length - 3} 个 Prompt 已连接
              </div>
            ) : null}
          </div>
        ) : null}
        <Textarea
          value={item.data?.prompt || ""}
          onChange={(event) => onUpdateData({ prompt: event.target.value })}
          className={cn("h-14 resize-none rounded-xl text-xs", canvasFieldClass)}
          placeholder={upstreamPrompts.length > 0 ? "补充提示词，会追加到已连接 Prompt 后..." : "补充提示词，或连接 Prompt 节点..."}
        />
      </div>
      <div>
        <div className={cn("mb-1 text-[11px] font-black uppercase tracking-[0.14em]", canvasLabelClass)}>Images</div>
        {images.length > 0 ? (
          <CanvasImageStrip
            images={images}
            limit={4}
            onOpen={onOpenImage}
            onDelete={(image) => {
              if ((item.data?.input_images || []).some((directImage) => canvasImageKey(directImage) === canvasImageKey(image))) {
                onDeleteDirectImage(image);
              }
            }}
            className="grid-cols-5"
          />
        ) : (
          <div className={cn("rounded-xl border px-3 py-3 text-xs", canvasDashedClass)}>连接图片节点后自动作为图生图输入</div>
        )}
      </div>
      <div className="grid grid-cols-[76px_1fr] gap-2">
        <Select value="api" disabled>
          <SelectTrigger className={canvasSelectClass}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="api">API</SelectItem>
          </SelectContent>
        </Select>
        <Select value={item.data?.model || "auto"} onValueChange={(model) => onUpdateData({ model })}>
          <SelectTrigger className={canvasSelectClass}>
            <SelectValue placeholder="模型" />
          </SelectTrigger>
          <SelectContent>
            {models.map((model) => (
              <SelectItem key={model.id} value={model.id}>{model.name || model.id}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-[1fr_1fr_1fr] gap-2">
        <Select value={String(item.data?.size || "1024x1024")} onValueChange={(size) => onUpdateData({ size })}>
          <SelectTrigger className={canvasSelectClass}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1024x1024">1:1</SelectItem>
            <SelectItem value="1024x1536">2:3</SelectItem>
            <SelectItem value="1536x1024">3:2</SelectItem>
          </SelectContent>
        </Select>
        <Select value={String(item.data?.visibility || "private")} onValueChange={(visibility) => onUpdateData({ visibility: visibility as ImageVisibility })}>
          <SelectTrigger className={canvasSelectClass}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="private">私有</SelectItem>
            <SelectItem value="public">公开</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="number"
          min={1}
          max={4}
          value={Number(item.data?.n || 1)}
          onChange={(event) => onUpdateData({ n: Math.max(1, Math.min(4, Number(event.target.value) || 1)) })}
          className={cn("h-9 rounded-xl text-center text-xs", canvasFieldClass)}
        />
      </div>
      {outputImages.length > 0 ? <CanvasImageStrip images={outputImages} limit={3} onOpen={onOpenImage} className="grid-cols-3" /> : null}
      {item.data?.error ? <div className="rounded-lg bg-rose-500/10 px-2 py-1.5 text-xs text-rose-200">{item.data.error}</div> : null}
      <Button
        type="button"
        className="h-10 w-full rounded-xl bg-primary font-bold text-primary-foreground hover:bg-primary/90 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
        disabled={running || nodeRunning || !mergedPromptPreview}
        onClick={onRunGenerator}
      >
        {running || nodeRunning ? <LoaderCircle className="size-4 animate-spin" /> : <Zap className="size-4" />}
        API生成
      </Button>
    </div>
  );
}

function OutputNodeBody({ item, onOpenImage, onDeleteImage }: { item: SmartCanvasItem; onOpenImage: (image: CanvasImageRef) => void; onDeleteImage: (image: CanvasImageRef) => void }) {
  const images = item.data?.output?.images || item.data?.images || [];
  return (
    <div className="p-3">
      {images.length > 0 ? (
        <CanvasImageStrip images={images} limit={4} onOpen={onOpenImage} onDelete={onDeleteImage} className="grid-cols-4" large />
      ) : item.data?.status === "running" || item.data?.status === "queued" ? (
        <div className="flex h-36 items-center justify-center rounded-xl border border-border bg-muted/50 text-sm text-muted-foreground dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-400">
          <LoaderCircle className="mr-2 size-4 animate-spin" />
          生成中
        </div>
      ) : (
        <div className={cn("flex h-36 items-center justify-center rounded-xl border text-xs", canvasDashedClass)}>
          连接 API生成 节点后显示输出
        </div>
      )}
      {item.data?.error ? <div className="mt-2 rounded-lg bg-rose-500/10 px-2 py-1.5 text-xs text-rose-200">{item.data.error}</div> : null}
    </div>
  );
}

function Port({
  side,
  onPointerDown,
  onPointerUp,
}: {
  side: "in" | "out";
  onPointerDown?: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp?: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
  return (
    <button
      type="button"
      data-port={side}
      className={cn(
        "absolute top-1/2 z-30 flex size-4 -translate-y-1/2 items-center justify-center rounded-full border-2 border-sky-500 bg-background shadow-[0_0_0_4px_rgba(255,255,255,0.85)] transition hover:scale-110 hover:bg-sky-400 dark:border-slate-300 dark:bg-slate-900 dark:shadow-[0_0_0_4px_rgba(15,23,42,0.75)]",
        side === "in" ? "-left-2" : "-right-2",
      )}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      title={side === "in" ? "输入" : "输出"}
    />
  );
}

export function CanvasImageStrip({
  images,
  limit = images.length,
  onOpen,
  onDelete,
  className,
  large,
}: {
  images: CanvasImageRef[];
  limit?: number;
  onOpen?: (image: CanvasImageRef) => void;
  onDelete?: (image: CanvasImageRef) => void;
  className?: string;
  large?: boolean;
}) {
  const visible = images.slice(0, limit);
  const overflow = Math.max(0, images.length - visible.length);
  if (visible.length === 0) {
    return null;
  }
  return (
    <div className={cn("grid gap-2", className || "grid-cols-3", large && "h-full")}>
      {visible.map((image, index) => {
        const src = canvasImagePreviewSource(image);
        return (
          <button
            key={`${canvasImageSource(image) || image.path || image.name || "image"}-${index}`}
            type="button"
            className={cn(
              "group relative overflow-hidden rounded-xl border border-border bg-muted/60 dark:border-slate-700 dark:bg-slate-950/60",
              large ? "h-full min-h-0" : "aspect-square",
            )}
            onClick={(event) => {
              event.stopPropagation();
              onOpen?.(image);
            }}
            title={canvasImageLabel(image, index)}
            data-node-interactive="true"
          >
            {src ? (
              <AuthenticatedImage
                src={src}
                alt={canvasImageLabel(image, index)}
                className="h-full w-full object-cover transition duration-150 group-hover:scale-[1.03]"
                placeholderClassName="min-h-0 h-full bg-muted text-muted-foreground dark:bg-slate-900 dark:text-slate-500"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-muted-foreground dark:text-slate-500">
                <ImageIcon className="size-4" />
              </span>
            )}
            {overflow > 0 && index === visible.length - 1 ? (
              <span className="absolute inset-0 flex items-center justify-center bg-background/75 text-sm font-bold text-foreground backdrop-blur-sm dark:bg-slate-950/75 dark:text-white">+{overflow}</span>
            ) : null}
            {onDelete ? (
              <span
                role="button"
                tabIndex={0}
                className="absolute right-1 top-1 z-10 flex size-6 items-center justify-center rounded-full border border-border bg-background/90 text-muted-foreground opacity-0 shadow-sm transition hover:border-rose-400 hover:text-rose-500 group-hover:opacity-100 dark:border-slate-700 dark:bg-slate-950/90 dark:text-slate-400 dark:hover:text-rose-300"
                data-node-interactive="true"
                title="从节点移除图片"
                aria-label="从节点移除图片"
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete(image);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    event.stopPropagation();
                    onDelete(image);
                  }
                }}
              >
                <X className="size-3.5" />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function SmartCanvasAssetSidebar({
  assets,
  loadingAssets,
  loadingMoreAssets,
  hasMoreAssets,
  onRefreshAssets,
  onLoadMoreAssets,
  onAddAssetToCanvas,
  onAddAssetToComposer,
}: {
  assets: ManagedImage[];
  loadingAssets: boolean;
  loadingMoreAssets: boolean;
  hasMoreAssets: boolean;
  onRefreshAssets: () => void;
  onLoadMoreAssets: () => void;
  onAddAssetToCanvas: (asset: ManagedImage) => void;
  onAddAssetToComposer: (asset: ManagedImage) => void;
}) {
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const [pinned, setPinned] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.localStorage.getItem("smart-canvas-asset-sidebar-pinned") === "1";
  });
  const [draggingAsset, setDraggingAsset] = useState(false);
  const [wide, setWide] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.localStorage.getItem("smart-canvas-asset-sidebar-wide") === "1";
  });
  const expanded = pinned || hoverExpanded || draggingAsset;
  const assetGridComponents = useMemo(
    () => ({
      List: forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function CanvasAssetGridList(props, ref) {
        return <div {...props} ref={ref} className={cn(props.className, "grid gap-3", wide ? "grid-cols-3" : "grid-cols-2")} />;
      }),
      Footer: () =>
        hasMoreAssets || loadingMoreAssets ? (
          <div className="col-span-full flex min-h-14 items-center justify-center py-3">
            <div className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs", canvasDashedClass)}>
              <LoaderCircle className={cn("size-3.5", loadingMoreAssets && "animate-spin")} />
              {loadingMoreAssets ? "加载中..." : "继续下滑加载"}
            </div>
          </div>
        ) : assets.length > 0 ? (
          <div className={cn("col-span-full py-3 text-center text-[11px]", canvasSubtleTextClass)}>已显示全部素材</div>
        ) : null,
    }),
    [assets.length, hasMoreAssets, loadingMoreAssets, wide],
  );

  const setPinnedState = useCallback((next: boolean) => {
    setPinned(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("smart-canvas-asset-sidebar-pinned", next ? "1" : "0");
    }
    if (next) {
      setHoverExpanded(true);
    }
  }, []);

  const setWideState = useCallback((next: boolean) => {
    setWide(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("smart-canvas-asset-sidebar-wide", next ? "1" : "0");
    }
    if (next) {
      setHoverExpanded(true);
    }
  }, []);

  return (
    <aside
      className={cn(
        "absolute bottom-5 right-0 top-24 z-40 flex overflow-hidden rounded-l-2xl border-y border-l max-lg:hidden",
        "transition-[width,transform,background-color,border-color] duration-300 ease-out",
        canvasPanelClass,
        expanded ? wide ? "w-[680px] translate-x-0 p-3" : "w-[420px] translate-x-0 p-3" : "w-[56px] translate-x-0 p-2",
      )}
      onMouseEnter={() => setHoverExpanded(true)}
      onMouseLeave={() => {
        if (!pinned && !draggingAsset) {
          setHoverExpanded(false);
        }
      }}
    >
      <div className={cn("flex h-full shrink-0 flex-col items-center gap-3 border-r border-border pr-2 transition-colors dark:border-zinc-800", expanded ? "w-12" : "w-full border-r-0 pr-0")}>
        <button
          type="button"
          className={cn("mt-1 flex size-10 items-center justify-center rounded-2xl text-sky-600 transition dark:text-sky-300", expanded ? "bg-sky-500/10" : "bg-sky-500/10 hover:bg-sky-500/15")}
          onClick={() => {
            if (!expanded) {
              setHoverExpanded(true);
            } else {
              setPinnedState(!pinned);
            }
          }}
          title={pinned ? "取消固定图片库" : expanded ? "固定图片库" : "展开图片库"}
        >
          {expanded ? <Pin className={cn("size-4", pinned && "fill-current")} /> : <Images className="size-5" />}
        </button>
        <div className="rounded-full bg-sky-500/15 px-2 py-1 text-[11px] font-black text-sky-600 dark:bg-sky-400/15 dark:text-sky-300">{assets.length}</div>
        {!expanded ? (
          <button
            type="button"
            className={cn("mt-1 flex size-9 items-center justify-center rounded-2xl", canvasIconButtonClass)}
            onClick={() => setHoverExpanded(true)}
            title="展开素材库"
          >
            <PanelRightOpen className="size-4" />
          </button>
        ) : null}
      </div>

      <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col transition-all duration-300", expanded ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-4 opacity-0")}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-bold text-foreground dark:text-slate-100">图片库</div>
            <div className={cn("text-xs", canvasSubtleTextClass)}>{assets.length} 张素材 · 点击加入输入</div>
          </div>
          <div className="flex gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className={cn("size-8 rounded-lg", canvasIconButtonClass)}
              onClick={() => setWideState(!wide)}
              title={wide ? "收回图片库宽度" : "扩大图片库显示范围"}
            >
              {wide ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className={cn("size-8 rounded-lg", canvasIconButtonClass)}
              onClick={() => setPinnedState(!pinned)}
              title={pinned ? "取消固定图片库" : "固定图片库"}
            >
              <Pin className={cn("size-4", pinned && "fill-current")} />
            </Button>
            <Button type="button" size="icon" variant="ghost" className={cn("size-8 rounded-lg", canvasIconButtonClass)} onClick={onRefreshAssets}>
              {loadingAssets ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            </Button>
          </div>
        </div>
        <div className="mt-3 min-h-0 flex-1 overflow-auto pr-1">
          {assets.length > 0 ? (
            <VirtuosoGrid
              data={assets}
              overscan={400}
              components={assetGridComponents}
              itemClassName="min-w-0"
              style={{ height: "100%" }}
              endReached={onLoadMoreAssets}
              itemContent={(index, asset) => (
                <AssetTile
                  key={`${asset.path}-${index}`}
                  asset={asset}
                  onDragStart={(event) => {
                    setDraggingAsset(true);
                    event.dataTransfer.setData("application/x-chatgpt2api-managed-image", JSON.stringify(asset));
                    event.dataTransfer.effectAllowed = "copy";
                  }}
                  onDragEnd={() => setDraggingAsset(false)}
                  onAddToCanvas={() => onAddAssetToCanvas(asset)}
                  onAddToComposer={() => onAddAssetToComposer(asset)}
                />
              )}
            />
          ) : (
            <div className={cn("rounded-xl border p-4 text-center text-xs", canvasDashedClass)}>图片库暂无图片</div>
          )}
        </div>
      </div>
    </aside>
  );
}

export function SmartCanvasRunHistoryPanel({
  canvas,
  open,
  onOpenChange,
  onBackToRun,
}: {
  canvas: SmartCanvasDocument | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBackToRun: (id: string) => void;
}) {
  const runs = smartCanvasRuns(canvas).slice(0, 30);
  if (!open) {
    return null;
  }
  return (
    <aside className="absolute right-5 top-20 z-40 w-[340px] max-lg:hidden">
      <div className={cn("rounded-2xl border p-3", canvasPanelClass)}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className={cn("text-xs font-black uppercase tracking-[0.16em]", canvasLabelClass)}>运行记录</div>
            <div className={cn("mt-0.5 text-[11px] font-semibold", canvasSubtleTextClass)}>最近 {runs.length} 条，最多显示 30 条</div>
          </div>
          <button
            type="button"
            className={cn("flex size-8 shrink-0 items-center justify-center rounded-xl", canvasIconButtonClass)}
            onClick={() => onOpenChange(false)}
            title="关闭运行记录"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="max-h-[420px] space-y-2 overflow-auto pr-1">
          {runs.length > 0 ? runs.map((run) => (
            <RunRecordCard key={run.id} run={run} />
          )) : (
            <div className={cn("rounded-xl border p-3 text-center text-xs", canvasDashedClass)}>暂无运行记录</div>
          )}
        </div>
      </div>
    </aside>
  );
}

function AssetTile({
  asset,
  onDragStart,
  onDragEnd,
  onAddToCanvas,
  onAddToComposer,
}: {
  asset: ManagedImage;
  onDragStart: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onAddToCanvas: () => void;
  onAddToComposer: () => void;
}) {
  return (
    <div className="group overflow-hidden rounded-xl border border-border bg-background dark:border-slate-800 dark:bg-slate-950" draggable onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <button type="button" className="block w-full" onClick={onAddToComposer} title="加入输入">
        <AuthenticatedImage
          src={asset.thumbnail_url || asset.url}
          alt={asset.name}
          loading="lazy"
          decoding="async"
          className="aspect-square w-full object-cover transition duration-150 group-hover:scale-[1.03]"
          placeholderClassName="min-h-0 aspect-square bg-muted dark:bg-slate-900"
        />
      </button>
      <div className="space-y-1 px-2 py-2">
        <div className="truncate text-[11px] font-medium text-foreground dark:text-slate-300">{asset.name}</div>
        <div className="grid grid-cols-2 gap-1">
          <Button type="button" size="sm" variant="ghost" className={cn("h-7 rounded-md px-1 text-[11px]", canvasIconButtonClass)} onClick={onAddToComposer}>输入</Button>
          <Button type="button" size="sm" variant="ghost" className={cn("h-7 rounded-md px-1 text-[11px]", canvasIconButtonClass)} onClick={onAddToCanvas}>画布</Button>
        </div>
      </div>
    </div>
  );
}

export function SmartCanvasOperationHistoryPanel({
  entries,
  open,
  onOpenChange,
  onRestore,
}: {
  entries: SmartCanvasHistoryEntry[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestore: (entry: SmartCanvasHistoryEntry) => void;
}) {
  const visibleEntries = entries.slice(0, 30);
  if (!open) {
    return null;
  }
  return (
    <aside className="absolute right-5 top-20 z-40 w-[320px] max-lg:hidden">
      <div className={cn("rounded-2xl border p-3", canvasPanelClass)}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className={cn("text-xs font-black uppercase tracking-[0.16em]", canvasLabelClass)}>最近操作</div>
            <div className={cn("mt-0.5 text-[11px] font-semibold", canvasSubtleTextClass)}>最近 {visibleEntries.length} 条，最多显示 30 条</div>
          </div>
          <button
            type="button"
            className={cn("flex size-8 shrink-0 items-center justify-center rounded-xl", canvasIconButtonClass)}
            onClick={() => onOpenChange(false)}
            title="关闭最近操作"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="max-h-[420px] space-y-2 overflow-auto pr-1">
          {visibleEntries.length > 0 ? visibleEntries.map((entry) => (
            <div key={entry.id} className="rounded-xl border border-border bg-background/70 p-2 dark:border-slate-800 dark:bg-slate-950/55">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-foreground dark:text-slate-200">{entry.label}</div>
                  <div className={cn("mt-0.5 text-[11px]", canvasSubtleTextClass)}>{entry.createdAt.slice(5, 16)}</div>
                </div>
                <button
                  type="button"
                  className={cn("h-7 shrink-0 rounded-md px-2 text-[11px] font-black", canvasIconButtonClass)}
                  onClick={() => onRestore(entry)}
                  title="回到这次操作后的状态"
                >
                  回到
                </button>
              </div>
            </div>
          )) : (
            <div className={cn("rounded-xl border p-3 text-center text-xs", canvasDashedClass)}>暂无操作记录</div>
          )}
        </div>
      </div>
    </aside>
  );
}

function RunRecordCard({ run }: { run: SmartCanvasRunRecord }) {
  return (
    <div className="rounded-xl border border-border bg-background/70 p-2 dark:border-slate-800 dark:bg-slate-950/55">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-foreground dark:text-slate-200">{run.prompt || "未命名任务"}</div>
          <div className={cn("truncate text-[11px]", canvasSubtleTextClass)}>{run.model} · {run.mode === "edit" ? "图生图" : "文生图"}</div>
        </div>
        <StatusBadge status={run.status} />
      </div>
      {run.images.length > 0 ? <CanvasImageStrip images={run.images} limit={3} className="mt-2 grid-cols-3" /> : null}
      {run.error ? <div className="mt-2 text-[11px] text-rose-300">{run.error}</div> : null}
    </div>
  );
}

function MentionPicker({ images, onAdd }: { images: CanvasImageRef[]; onAdd: (image: CanvasImageRef) => void }) {
  return (
    <div className="absolute bottom-12 left-3 right-3 z-50 max-h-48 overflow-auto rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-2xl dark:border-slate-700 dark:bg-slate-950">
      {images.length > 0 ? (
        <div className="grid grid-cols-5 gap-1.5">
          {images.map((image, index) => (
            <button
              key={`${canvasImageSource(image) || image.path || image.name}-${index}`}
              type="button"
              className="overflow-hidden rounded-lg border border-border bg-muted dark:border-slate-800 dark:bg-slate-900"
              onClick={() => onAdd(image)}
              title={canvasImageLabel(image, index)}
            >
              <AuthenticatedImage
                src={canvasImagePreviewSource(image)}
                alt={canvasImageLabel(image, index)}
                className="aspect-square w-full object-cover"
                placeholderClassName="min-h-0 aspect-square bg-muted dark:bg-slate-900"
              />
            </button>
          ))}
        </div>
      ) : (
        <div className={cn("px-2 py-4 text-center text-xs", canvasSubtleTextClass)}>暂无可引用图片</div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: NonNullable<SmartCanvasRunRecord["status"]> }) {
  const variant = status === "success" ? "success" : status === "error" || status === "cancelled" ? "danger" : "secondary";
  return <Badge variant={variant} className="rounded-md px-2 py-0.5 text-[11px]">{statusLabel(status)}</Badge>;
}

function SaveStateDot({ state }: { state: SmartCanvasSaveState }) {
  const icon: Record<SmartCanvasSaveState, ReactNode> = {
    saved: <CheckCircle2 className="size-4 text-emerald-400" />,
    dirty: <Clock3 className="size-4 text-amber-400" />,
    saving: <LoaderCircle className="size-4 animate-spin text-sky-400" />,
    error: <CircleAlert className="size-4 text-rose-400" />,
  };
  return icon[state];
}

function ItemTypeIcon({ type }: { type: SmartCanvasItem["type"] }) {
  if (type === "image") {
    return <ImageIcon className="size-4 text-sky-700 dark:text-sky-200" />;
  }
  if (type === "prompt") {
    return <FileText className="size-4 text-sky-700 dark:text-sky-200" />;
  }
  if (type === "llm") {
    return <Bot className="size-4 text-sky-700 dark:text-sky-200" />;
  }
  if (type === "image_generation") {
    return <WandSparkles className="size-4 text-sky-700 dark:text-sky-200" />;
  }
  return <CircleDot className="size-4 text-sky-700 dark:text-sky-200" />;
}

function IconToolButton({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={cn("flex size-9 items-center justify-center transition", canvasIconButtonClass)} onPointerDown={stopNodeInteraction} onClick={onClick} title={title} aria-label={title}>
      {children}
    </button>
  );
}

function nodeTitle(item: SmartCanvasItem) {
  if (item.type === "image") return "Image";
  if (item.type === "prompt") return "Prompt";
  if (item.type === "llm") return "AI 提示词";
  if (item.type === "image_generation") return "API生成";
  return "Output";
}

function measuredNodeSize(node: SmartCanvasItem, nodeSizes: SmartCanvasNodeSizeMap) {
  return nodeSizes[node.id] || NODE_SIZE[node.type];
}

function inputPortPoint(node: SmartCanvasItem, nodeSizes: SmartCanvasNodeSizeMap) {
  const size = measuredNodeSize(node, nodeSizes);
  return {
    x: Number(node.position?.x || 0),
    y: Number(node.position?.y || 0) + size.h / 2,
  };
}

function outputPortPoint(node: SmartCanvasItem, nodeSizes: SmartCanvasNodeSizeMap) {
  const size = measuredNodeSize(node, nodeSizes);
  return {
    x: Number(node.position?.x || 0) + size.w,
    y: Number(node.position?.y || 0) + size.h / 2,
  };
}

function bezierPath(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = Math.max(80, Math.abs(b.x - a.x) * 0.45);
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}
