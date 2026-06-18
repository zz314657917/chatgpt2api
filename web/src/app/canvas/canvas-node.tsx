"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Bot,
  BoxSelect,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  CircleAlert,
  CircleDot,
  Clapperboard,
  Clock3,
  Copy,
  Download,
  Eraser,
  Files,
  Repeat2,
  FileText,
  Grid2X2,
  History,
  Image as ImageIcon,
  ImagePlus,
  Images,
  Layers3,
  ListTree,
  Link2,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Save,
  Sparkles,
  Type,
  Trash2,
  WandSparkles,
  Wrench,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { AuthenticatedImage } from "@/components/authenticated-image";
import { ImageModelSettingsButton } from "@/components/image-model-settings-button";
import { ImageOutputControls } from "@/components/image-output-controls";
import { ImageRatioPicker } from "@/components/image-ratio-picker";
import { ModelProviderOptionLabel } from "@/components/model-provider-icon";
import { displayModelLabel } from "@/lib/model-display";
import { ProStudioBadge } from "@/components/pro-studio/pro-studio-badge";
import { ProStudioPanel } from "@/components/pro-studio/pro-studio-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { CanvasImageRef, CanvasModelOption, CanvasVideoRef, CreationTask, ManagedTextAsset, ManagedTextAssetListScope, TeamSummary } from "@/lib/api";
import { createManagedTextAsset, fetchManagedTextAssets, supportsImageOutputControls, supportsImageQuality } from "@/lib/api";
import {
  buildTimestampedImageDownloadName,
  downloadImageFile,
  type DownloadableImage,
} from "@/lib/image-download";
import { getManagedImagePathFromUrl } from "@/lib/image-path";
import {
  IMAGE_ASPECT_RATIO_OPTIONS,
  IMAGE_QUALITY_OPTIONS,
  IMAGE_RESOLUTION_OPTIONS,
  PIXEL_ICON_SIZE_OPTIONS,
  isImageQuality,
  isPixelIconSize,
  normalizeImageOutputFormat,
  type ImageAspectRatio,
  type ImageResolution,
} from "@/lib/image-parameters";
import { imageModelHasSettings } from "@/lib/image-model-settings";
import { OFFICIAL_IMAGE_MODEL, normalizeProStudioState, type ProStudioState } from "@/lib/pro-studio";
import type { ImageRatioPickerOption } from "@/lib/image-ratio-picker-options";
import { cn } from "@/lib/utils";

import {
  CANVAS_FLOW_TEMPLATES,
  CANVAS_NODE_HELP,
  canvasFlowTemplateById,
  canvasNodeHelpById,
  type SmartCanvasFlowTemplateId,
  type SmartCanvasHelpTopic,
} from "./canvas-help";
import { buildSmartCanvasErrorDetail } from "./canvas-error-details";
import { SMART_CANVAS_PRESETS, type SmartCanvasPresetLike, type SmartCanvasPresetId } from "./canvas-presets";
import { setCanvasImageDragData } from "./canvas-image-drag";
import type { SmartCanvasUserPreset } from "./canvas-user-presets";
import {
  canConnectSmartCanvasNodes,
  canvasImageKey,
  canvasImageLabel,
  canvasImagePreviewSource,
  canvasImageSource,
  canvasVideoSource,
  dedupeCanvasImageRefs,
  expandedCanvasImagesFromItem,
  expandedCanvasPromptFromItem,
  groupMemberItems,
  incomingItems,
  isActiveTask,
  saveStateLabel,
  smartCanvasGroupCounts,
  smartCanvasRuns,
  statusLabel,
  normalizeCanvasImageResolution,
} from "./canvas-utils";
import type {
  SmartCanvasConnectState,
  SmartCanvasDocument,
  SmartCanvasHistoryEntry,
  SmartCanvasItem,
  SmartCanvasItemType,
  SmartCanvasPortMenuRequest,
  SmartCanvasRunRecord,
  SmartCanvasSaveState,
  SmartCanvasTool,
  SmartCanvasViewport,
} from "./types";

const NODE_SIZE: Record<SmartCanvasItem["type"], { w: number; h: number }> = {
  image: { w: 270, h: 260 },
  prompt: { w: 310, h: 210 },
  llm: { w: 380, h: 420 },
  loop: { w: 340, h: 280 },
  group: { w: 340, h: 230 },
  image_generation: { w: 390, h: 370 },
  video_generation: { w: 390, h: 420 },
  result: { w: 440, h: 245 },
};
const EMPTY_SMART_CANVAS_NODES: SmartCanvasItem[] = [];
const EMPTY_SMART_CANVAS_EDGES: SmartCanvasDocument["edges"] = [];
const EMPTY_CANVAS_IMAGES: CanvasImageRef[] = [];
const EMPTY_CANVAS_VIDEOS: CanvasVideoRef[] = [];
const CANVAS_NODE_MENU_WIDTH = 224;
const CANVAS_NODE_MENU_GAP = 12;
const CANVAS_GRAPH_KEY_SEPARATOR = "\u001f";

type SmartCanvasNodeSizeMap = Record<string, { w: number; h: number }>;
type SmartCanvasNodeLookup = ReadonlyMap<string, SmartCanvasItem>;
type SmartCanvasGraphIndexes = {
  nodesById: Map<string, SmartCanvasItem>;
  dependencyKeysByNodeId: Map<string, string>;
};

type SmartCanvasTextAssetScope = "mine" | "team";

const CANVAS_TEXT_ASSET_PAGE_SIZE = 40;

function appendTextBlock(base: string, addition: string) {
  const current = base.trimEnd();
  const next = addition.trim();
  if (!next) {
    return base;
  }
  return current ? `${current}\n\n${next}` : next;
}

function canvasTextAssetScope(scope: SmartCanvasTextAssetScope): ManagedTextAssetListScope {
  return scope === "team" ? "team" : "mine";
}

function canManageTeamTextAssets(team: TeamSummary | null) {
  const role = String(team?.member_role || "").toLowerCase();
  return role === "owner" || role === "manager";
}
type SmartCanvasObjectIdentityTracker = {
  nextId: number;
  ids: WeakMap<object, number>;
};
type SmartCanvasNodeMenuState = {
  x: number;
  y: number;
  screen: { x: number; y: number };
  nodeId?: string;
  direction: "upstream" | "downstream";
};
type SmartCanvasViewBounds = { left: number; top: number; right: number; bottom: number };
type SmartCanvasNodeMenuItem = {
  type: SmartCanvasItem["type"];
  label: string;
  icon: ReactNode;
};
type SmartCanvasPortPress = {
  sourceId: string;
  pointerId: number;
  clientX: number;
  clientY: number;
};

const canvasPanelClass = "border-border bg-card/92 text-card-foreground shadow-[0_18px_46px_rgba(44,74,116,0.16)] backdrop-blur dark:border-zinc-800 dark:bg-[#181818]/92 dark:text-zinc-100 dark:shadow-[0_18px_46px_rgba(0,0,0,0.36)]";
const canvasFieldClass = "border-border bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-sky-400 dark:border-slate-700 dark:bg-[#0c1220] dark:text-slate-100 dark:placeholder:text-slate-600";
const canvasSubtleTextClass = "text-muted-foreground dark:text-slate-500";
const canvasLabelClass = "text-muted-foreground dark:text-slate-400";
const canvasAccentTextClass = "text-sky-700 dark:text-sky-200";
const canvasDashedClass = "border-dashed border-border bg-muted/50 text-muted-foreground dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-500";
const canvasGhostButtonClass = "border-border bg-background/70 text-foreground hover:bg-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800";
const canvasImageResolutionOptions = [
  { value: "unspecified", label: "默认清晰度" },
  ...IMAGE_RESOLUTION_OPTIONS.filter((option): option is Extract<(typeof IMAGE_RESOLUTION_OPTIONS)[number], { value: ImageResolution & ("1080p" | "2k" | "4k") }> => option.value !== "auto")
    .map((option) => ({ value: option.value, label: option.label })),
] as const satisfies ReadonlyArray<{ value: "unspecified" | Exclude<ImageResolution, "auto">; label: string }>;
const canvasImageRatioOptions = [
  ...IMAGE_ASPECT_RATIO_OPTIONS.filter((option) => option.value !== "" && option.value !== "custom").map((option) => ({
    value: option.value,
    label: option.value,
    section: "常用画幅",
  })),
  ...PIXEL_ICON_SIZE_OPTIONS.map((option) => ({
    value: option.value,
    label: option.value,
    section: "像素图标尺寸",
  })),
] as const satisfies ReadonlyArray<ImageRatioPickerOption<Exclude<ImageAspectRatio, "" | "custom">>>;
type CanvasImageRatioValue = "auto" | Exclude<ImageAspectRatio, "" | "custom">;
const canvasVideoRatioOptions = [
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
  { value: "1:1", label: "1:1" },
  { value: "4:3", label: "4:3" },
  { value: "3:4", label: "3:4" },
  { value: "21:9", label: "21:9" },
  { value: "adaptive", label: "自适应" },
] as const;
const canvasVideoResolutionOptions = [
  { value: "auto", label: "自动" },
  { value: "480p", label: "480p" },
  { value: "720p", label: "720p" },
  { value: "1080p", label: "1080p" },
  { value: "4k", label: "4K" },
] as const;
type CanvasVideoRatioValue = (typeof canvasVideoRatioOptions)[number]["value"];
type CanvasVideoResolutionValue = (typeof canvasVideoResolutionOptions)[number]["value"];
type CanvasVideoModelProfile = {
  ratios: readonly CanvasVideoRatioValue[];
  resolutions: readonly CanvasVideoResolutionValue[];
  minDuration: number;
  maxDuration: number;
};
const canvasVideoModelProfiles: Record<string, CanvasVideoModelProfile> = {
  klingV3Omni: {
    ratios: ["16:9", "9:16", "1:1"],
    resolutions: ["auto", "720p", "1080p", "4k"],
    minDuration: 3,
    maxDuration: 15,
  },
  klingV26: {
    ratios: ["16:9", "9:16", "1:1"],
    resolutions: ["auto", "720p", "1080p"],
    minDuration: 5,
    maxDuration: 10,
  },
  wan27: {
    ratios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
    resolutions: ["auto", "720p", "1080p"],
    minDuration: 2,
    maxDuration: 15,
  },
  veo31Fast: {
    ratios: ["16:9", "9:16"],
    resolutions: ["auto", "720p", "1080p", "4k"],
    minDuration: 8,
    maxDuration: 8,
  },
  doubaoSeedance20: {
    ratios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive"],
    resolutions: ["auto", "480p", "720p", "1080p"],
    minDuration: 5,
    maxDuration: 15,
  },
};
const imageNodeTileMinWidth = 108;
const imageNodeTileMinHeight = 82;
const imageNodeMaxColumns = 6;
const imageNodeMaxRows = 6;

function nodeInputImagesForCanvas(canvas: SmartCanvasDocument, item: SmartCanvasItem) {
  return expandedCanvasImagesFromItem(canvas, item);
}

function nodePromptForCanvas(canvas: SmartCanvasDocument, item: SmartCanvasItem) {
  return expandedCanvasPromptFromItem(canvas, item);
}

function canvasVideoModelProfile(model?: string) {
  const normalized = String(model || "").trim().toLowerCase();
  if (normalized === "kling-v3-omni") return canvasVideoModelProfiles.klingV3Omni;
  if (normalized === "kling-v2-6") return canvasVideoModelProfiles.klingV26;
  if (normalized === "wan2.7") return canvasVideoModelProfiles.wan27;
  if (normalized === "veo3.1-fast") return canvasVideoModelProfiles.veo31Fast;
  if (normalized === "doubao-seedance-2.0" || normalized === "doubao-seedance-2.0-fast") return canvasVideoModelProfiles.doubaoSeedance20;
  return canvasVideoModelProfiles.doubaoSeedance20;
}

function smartCanvasNodeMenuItems(): SmartCanvasNodeMenuItem[] {
  return [
    { type: "image", label: "图片", icon: <Images className="size-4" /> },
    { type: "prompt", label: "提示词", icon: <FileText className="size-4" /> },
    { type: "llm", label: "AI 提示词", icon: <Bot className="size-4" /> },
    { type: "loop", label: "循环节点", icon: <Repeat2 className="size-4" /> },
    { type: "group", label: "组", icon: <Layers3 className="size-4" /> },
    { type: "image_generation", label: "图片生成", icon: <WandSparkles className="size-4" /> },
    { type: "video_generation", label: "视频生成", icon: <Clapperboard className="size-4" /> },
    { type: "result", label: "Output", icon: <CircleDot className="size-4" /> },
  ];
}

function connectableNodeMenuItems(node?: SmartCanvasItem | null, direction: "upstream" | "downstream" = "downstream") {
  const items = smartCanvasNodeMenuItems().filter((item) => direction === "upstream" || item.type !== "image");
  if (!node) {
    return items;
  }
  return items.filter((item) => direction === "upstream"
    ? canConnectSmartCanvasNodes({ type: item.type }, node)
    : canConnectSmartCanvasNodes(node, { type: item.type }));
}

function canvasImageRatioValue(value?: string): Exclude<ImageAspectRatio, "" | "custom"> {
  const normalized = String(value || "").trim();
  switch (normalized) {
    case "1024x1024":
      return "1:1";
    case "1024x1536":
      return "2:3";
    case "1536x1024":
      return "3:2";
    case "1080x1440":
    case "864x1152":
      return "3:4";
    case "1440x1080":
    case "1152x864":
      return "4:3";
    case "864x1536":
      return "9:16";
    case "1536x864":
      return "16:9";
    default:
      return isCanvasImageRatioValue(normalized) ? normalized : "1:1";
  }
}

function isCanvasImageRatioValue(value: string): value is Exclude<ImageAspectRatio, "" | "custom"> {
  return canvasImageRatioOptions.some((option) => option.value === value);
}

function imageNodeGridLayout(width: number, height: number, imageCount: number): { limit: number; style: CSSProperties } {
  const contentWidth = Math.max(1, width - 24);
  const maxColumns = Math.max(1, Math.min(imageNodeMaxColumns, Math.floor(contentWidth / imageNodeTileMinWidth)));
  const maxRows = Math.max(1, Math.min(imageNodeMaxRows, Math.floor(height / imageNodeTileMinHeight)));
  const columns = imageCount <= 1 ? 1 : imageCount === 2 ? Math.min(2, maxColumns) : Math.max(2, maxColumns);
  const capacity = Math.max(1, columns * maxRows);
  const limit = Math.min(imageCount, capacity);
  const rows = Math.max(1, Math.min(maxRows, Math.ceil(limit / columns)));
  return {
    limit,
    style: {
      gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
      gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
    },
  };
}

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
  variant = "rail",
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
  variant?: "rail" | "drawer";
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

  if (variant === "drawer") {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground transition hover:bg-primary/90" onClick={onCreateCanvas}>
            <ImagePlus className="size-4" />
            新建
          </button>
          <button type="button" className={cn("inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border text-sm font-bold transition", canvasIconButtonClass)} onClick={onRefresh} disabled={loading}>
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
            刷新
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
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
                  "group relative rounded-2xl border p-3 text-left transition",
                  active
                    ? "border-border bg-accent text-foreground dark:border-zinc-800 dark:bg-[#181818] dark:text-zinc-100"
                    : "border-border/70 text-muted-foreground hover:bg-accent/70 hover:text-foreground dark:text-zinc-400 dark:hover:bg-[#141414] dark:hover:text-zinc-100",
                )}
                onClick={() => {
                  if (!editing && !confirmingDelete && item.id) {
                    onSelectCanvas(item.id);
                  }
                }}
                onKeyDown={(event) => {
                  if (!editing && (event.key === "Enter" || event.key === " ") && item.id) {
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
                      <div className={cn("truncate text-sm font-black", active ? "text-foreground dark:text-zinc-100" : "text-current")}>{item.name || "未命名画布"}</div>
                    )}
                    <div className="mt-1 truncate text-xs font-semibold text-muted-foreground">
                      {item.nodes.length} 节点 · {item.edges.length} 连线 · {item.updated_at ? item.updated_at.slice(5, 16) : "未保存"}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      className={cn("flex size-8 items-center justify-center rounded-lg", canvasIconButtonClass)}
                      title="编辑名称"
                      onClick={(event) => {
                        event.stopPropagation();
                        setConfirmDeleteCanvasId("");
                        setEditingCanvasId(item.id || "");
                        setEditingName(item.name || "未命名画布");
                      }}
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      className={cn("flex h-8 items-center justify-center rounded-lg text-xs font-black", confirmingDelete ? "bg-rose-500 px-2 text-white" : "w-8 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600")}
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
      </div>
    );
  }

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
  canvas: SmartCanvasDocument | null;
  canvasName: string;
  saveState: SmartCanvasSaveState;
  saving: boolean;
  running: boolean;
  runCount: number;
  operationCount: number;
  blankNodeCount: number;
  canUndo: boolean;
  onSave: () => void;
  onAddNode: (type: SmartCanvasItem["type"]) => void;
  onUploadClick: () => void;
  onCleanupBlankNodes: () => void;
  onHelpClick: () => void;
  onRunHistoryToggle: () => void;
  onOperationHistoryToggle: () => void;
  onUndo: () => void;
  onCanvasListToggle?: () => void;
  onFocusNode: (id: string) => void;
  onMoveNodeToScreenPoint: (id: string, point: { x: number; y: number }) => void;
};

export function SmartCanvasTopBar({
  canvas,
  canvasName,
  saveState,
  saving,
  running,
  runCount,
  operationCount,
  blankNodeCount,
  canUndo,
  onSave,
  onAddNode,
  onUploadClick,
  onCleanupBlankNodes,
  onHelpClick,
  onRunHistoryToggle,
  onOperationHistoryToggle,
  onUndo,
  onCanvasListToggle,
  onFocusNode,
  onMoveNodeToScreenPoint,
}: SmartCanvasTopBarProps) {
  return (
    <div className="pointer-events-none absolute left-3 right-3 top-3 z-40 flex items-start justify-between gap-2 lg:left-6 lg:right-6 lg:top-5 lg:items-center lg:gap-4">
      <div className="min-w-0 max-w-[360px] rounded-full border border-border bg-background/78 px-3 py-2 backdrop-blur dark:border-slate-700 dark:bg-slate-950/45 lg:border-0 lg:bg-transparent lg:px-1">
        <div className="truncate text-sm font-black text-slate-900 drop-shadow-none dark:text-zinc-100 dark:drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)]">{canvasName || "未命名画布"}</div>
        <div className="mt-0.5 hidden text-[11px] font-semibold text-slate-500 drop-shadow-none dark:text-zinc-400/90 dark:drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)] lg:block">当前画布</div>
      </div>
      <div className="pointer-events-auto hidden min-w-0 flex-wrap items-center justify-end gap-2 lg:flex">
        <div className={cn("flex min-w-0 items-center justify-end gap-1 rounded-full border p-1.5 lg:flex-wrap lg:gap-2", canvasPanelClass)}>
          {onCanvasListToggle ? <ToolbarIconButton className="lg:hidden" icon={<Grid2X2 className="size-4" />} label="画布列表" onClick={onCanvasListToggle} /> : null}
          <ToolbarButton icon={<ImagePlus className="size-4" />} label="上传" onClick={onUploadClick} />
          <ToolbarButton className="max-lg:hidden" icon={<FileText className="size-4" />} label="提示词" onClick={() => onAddNode("prompt")} />
          <ToolbarButton className="max-lg:hidden" icon={<Sparkles className="size-4" />} label="AI提示词" onClick={() => onAddNode("llm")} />
          <ToolbarButton className="max-lg:hidden" icon={<Repeat2 className="size-4" />} label="循环" onClick={() => onAddNode("loop")} />
          <ToolbarButton className="max-lg:hidden" icon={<Layers3 className="size-4" />} label="组" onClick={() => onAddNode("group")} />
          <ToolbarButton className="max-lg:hidden" icon={<WandSparkles className="size-4" />} label="图片生成" onClick={() => onAddNode("image_generation")} />
          <ToolbarButton className="max-lg:hidden" icon={<Clapperboard className="size-4" />} label="视频" onClick={() => onAddNode("video_generation")} />
          <ToolbarButton className="max-lg:hidden" icon={<CircleDot className="size-4" />} label="Output" onClick={() => onAddNode("result")} />
          <ToolbarButton className="max-lg:hidden" icon={<CircleHelp className="size-4" />} label="帮助" onClick={onHelpClick} />
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-bold transition",
                  "border-border bg-background/70 text-foreground hover:bg-accent dark:border-slate-700 dark:bg-slate-950/35 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white",
                )}
              >
                <MoreHorizontal className="size-4" />
                <span className="max-lg:hidden">更多</span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" sideOffset={8} className={cn("w-44 rounded-2xl border p-2", canvasPanelClass)}>
              <div className="space-y-1">
                <ToolbarMenuButton icon={<Clock3 className="size-4" />} label={`最近操作${operationCount ? ` ${operationCount}` : ""}`} onClick={onOperationHistoryToggle} />
                <ToolbarMenuButton icon={<Eraser className="size-4" />} label={`清理空白节点${blankNodeCount ? ` ${blankNodeCount}` : ""}`} onClick={onCleanupBlankNodes} disabled={blankNodeCount === 0} />
              </div>
            </PopoverContent>
          </Popover>
          <ToolbarIconButton className="lg:hidden" icon={<History className="size-4" />} label="生成记录" count={runCount} onClick={onRunHistoryToggle} />
          <ToolbarIconButton className="lg:hidden" icon={saving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />} label={saveStateLabel(saveState)} onClick={onSave} />
          {running ? <span className="lg:hidden rounded-full bg-sky-500/15 px-2 py-1 text-[11px] font-bold text-sky-700 dark:text-sky-200">运行中</span> : null}
        </div>
        <div className={cn("hidden shrink-0 items-center gap-2 rounded-full border p-1.5 lg:flex", canvasPanelClass)}>
          <NodeListPopover
            canvas={canvas}
            onFocusNode={onFocusNode}
            onMoveNodeToScreenPoint={onMoveNodeToScreenPoint}
          />
          <ToolbarIconButton icon={<History className="size-4" />} label="生成记录" count={runCount} onClick={onRunHistoryToggle} />
          <ToolbarButton icon={<RotateCcw className="size-4" />} label="上一步" onClick={onUndo} disabled={!canUndo} />
          <ToolbarButton icon={saving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />} label={saveStateLabel(saveState)} onClick={onSave} />
          {running ? <span className="ml-1 rounded-full bg-sky-500/15 px-3 py-2 text-xs font-bold text-sky-700 dark:text-sky-200">运行中</span> : null}
        </div>
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
  className,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  className?: string;
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
        className,
      )}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
      <span className="max-lg:hidden">{label}</span>
    </button>
  );
}

function NodeListPopover({
  canvas,
  onFocusNode,
  onMoveNodeToScreenPoint,
}: {
  canvas: SmartCanvasDocument | null;
  onFocusNode: (id: string) => void;
  onMoveNodeToScreenPoint: (id: string, point: { x: number; y: number }) => void;
}) {
  const nodes = canvas?.nodes || EMPTY_SMART_CANVAS_NODES;
  const [open, setOpen] = useState(false);
  const [draggingNodeId, setDraggingNodeId] = useState("");

  useEffect(() => {
    if (!draggingNodeId) {
      return;
    }
    const handleDragEnd = () => setDraggingNodeId("");
    window.addEventListener("dragend", handleDragEnd, true);
    return () => window.removeEventListener("dragend", handleDragEnd, true);
  }, [draggingNodeId]);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "relative flex size-9 items-center justify-center rounded-full border transition",
              "border-border bg-background/70 text-foreground hover:bg-accent dark:border-slate-700 dark:bg-slate-950/35 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white",
            )}
            title="节点列表"
            aria-label="节点列表"
          >
            <ListTree className="size-4" />
            {nodes.length > 0 ? (
              <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-sky-500 px-1 text-[10px] font-black leading-4 text-white">
                {nodes.length}
              </span>
            ) : null}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={8} className={cn("w-80 rounded-2xl border p-2", canvasPanelClass)}>
          <div className="flex items-center justify-between gap-3 px-2 pb-2">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.14em] text-foreground dark:text-zinc-100">节点列表</div>
              <div className={cn("mt-0.5 text-[11px] font-semibold", canvasSubtleTextClass)}>拖到画布可移动节点</div>
            </div>
            <Badge variant="secondary" className="rounded-full px-2 py-0.5 text-[11px]">
              {nodes.length}/100
            </Badge>
          </div>
          <div className="max-h-[360px] space-y-1 overflow-auto pr-1">
            {nodes.length > 0 ? nodes.map((node) => (
              <button
                key={node.id}
                type="button"
                draggable
                className={cn(
                  "flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition",
                  "border-border bg-background/80 hover:bg-accent dark:border-slate-800 dark:bg-slate-950/45 dark:hover:bg-slate-900",
                  draggingNodeId === node.id ? "ring-2 ring-sky-400" : "",
                )}
                onClick={() => {
                  onFocusNode(node.id);
                  setOpen(false);
                }}
                onDragStart={(event) => {
                  setDraggingNodeId(node.id);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("application/x-smart-canvas-node-id", node.id);
                  event.dataTransfer.setData("text/plain", nodeTitle(node));
                }}
                title="点击聚焦，拖到画布移动"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-700 dark:bg-sky-400/10 dark:text-sky-200">
                  <ItemTypeIcon type={node.type} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold text-foreground dark:text-zinc-100">{nodeTitle(node)}</span>
                  <span className={cn("mt-0.5 block truncate text-[11px]", canvasSubtleTextClass)}>
                    {nodeTypeLabel(node.type)} · x {Math.round(Number(node.position?.x || 0))}, y {Math.round(Number(node.position?.y || 0))}
                  </span>
                </span>
              </button>
            )) : (
              <div className={cn("rounded-xl border border-dashed p-4 text-center text-xs", canvasDashedClass)}>当前画布暂无节点</div>
            )}
          </div>
        </PopoverContent>
      </Popover>
      {draggingNodeId ? (
        <div
          className="pointer-events-auto fixed inset-0 z-[70]"
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }}
          onDrop={(event) => {
            event.preventDefault();
            const nodeId = event.dataTransfer.getData("application/x-smart-canvas-node-id") || draggingNodeId;
            if (nodeId) {
              onMoveNodeToScreenPoint(nodeId, { x: event.clientX, y: event.clientY });
              setOpen(false);
            }
            setDraggingNodeId("");
          }}
        />
      ) : null}
    </>
  );
}

function ToolbarIconButton({
  icon,
  label,
  count,
  onClick,
  className,
}: {
  icon: ReactNode;
  label: string;
  count?: number;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={cn(
        "relative inline-flex size-9 items-center justify-center rounded-full border transition",
        "border-border bg-background/70 text-foreground hover:bg-accent dark:border-slate-700 dark:bg-slate-950/35 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white",
        className,
      )}
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      {icon}
      {count ? (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-sky-500 px-1 text-[10px] font-black leading-none text-white">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </button>
  );
}

function ToolbarMenuButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="flex h-9 w-full items-center gap-2 rounded-xl px-3 text-left text-xs font-bold text-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45 dark:text-slate-200 dark:hover:bg-slate-800"
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

export function SmartCanvasPresetDialog({
  open,
  currentCanvasName,
  userPresets,
  onOpenChange,
  onCreateCanvas,
  onCreateFromUserPreset,
  onSaveCurrentAsPreset,
  onDeleteUserPreset,
}: {
  open: boolean;
  currentCanvasName: string;
  userPresets: SmartCanvasUserPreset[];
  onOpenChange: (open: boolean) => void;
  onCreateCanvas: (presetId: SmartCanvasPresetId) => void;
  onCreateFromUserPreset: (presetId: string) => void;
  onSaveCurrentAsPreset: (name: string) => void;
  onDeleteUserPreset: (presetId: string) => void;
}) {
  const [presetName, setPresetName] = useState("");
  const handleSavePreset = () => {
    const name = presetName.trim() || currentCanvasName.trim() || "我的画布预设";
    onSaveCurrentAsPreset(name);
    setPresetName("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("flex h-[min(86dvh,640px)] w-[min(96vw,920px)] max-w-none flex-col overflow-hidden rounded-3xl border p-0", canvasPanelClass)}>
        <div className="border-b border-border px-5 pt-4 pr-12 pb-3 dark:border-slate-800 sm:px-6 sm:pr-14">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle className="text-xl font-black leading-tight">新建画布</DialogTitle>
              <DialogDescription className={cn("mt-1.5 text-sm leading-5", canvasSubtleTextClass)}>
                选择一个起始结构，创建后仍可自由添加、删除和连接节点。
              </DialogDescription>
            </div>
            <span className={cn("shrink-0 rounded-full border px-3 py-1 text-xs font-black", canvasDashedClass)}>
              {SMART_CANVAS_PRESETS.length + userPresets.length} 个预设
            </span>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-background/65 px-4 py-4 dark:bg-slate-950/25 sm:px-6">
          <div className="grid gap-2 rounded-2xl border border-border bg-card/70 p-3 dark:border-slate-800 dark:bg-slate-900/65 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0">
              <div className="text-sm font-black text-foreground dark:text-slate-100">保存当前画布为我的预设</div>
              <div className={cn("mt-1 text-xs leading-5", canvasSubtleTextClass)}>保留节点、连线和参数，清除运行状态。</div>
            </div>
            <div className="flex min-w-0 gap-2">
              <Input
                value={presetName}
                onChange={(event) => setPresetName(event.target.value)}
                placeholder={currentCanvasName || "预设名称"}
                className="h-9 min-w-0 rounded-xl text-sm"
              />
              <Button type="button" className="h-9 shrink-0 rounded-xl px-3 text-xs font-black" onClick={handleSavePreset}>
                <Save className="size-4" />
                保存
              </Button>
            </div>
          </div>

          {userPresets.length > 0 ? (
            <section className="space-y-2">
              <div className={cn("text-xs font-black uppercase tracking-[0.16em]", canvasLabelClass)}>我的预设</div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                {userPresets.map((preset) => (
                  <div
                    key={preset.id}
                    className="flex min-h-[138px] flex-col rounded-2xl border border-border bg-card text-left shadow-sm dark:border-slate-800 dark:bg-slate-900/80"
                  >
                    <div className="flex items-start gap-2.5 p-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-700 dark:text-sky-200">
                        <Save className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-black text-foreground dark:text-slate-100">{preset.title}</h3>
                        <p className={cn("mt-1 line-clamp-2 text-xs leading-5", canvasSubtleTextClass)}>{preset.description}</p>
                      </div>
                    </div>
                    <div className="mt-auto flex items-center justify-between gap-2 border-t border-border px-3 py-2 dark:border-slate-800">
                      <div className="flex min-w-0 flex-wrap gap-1">
                        {preset.tags.slice(0, 2).map((tag) => (
                          <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground dark:bg-slate-800 dark:text-slate-300">
                            {tag}
                          </span>
                        ))}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button type="button" size="icon" variant="ghost" className="size-8 rounded-xl" onClick={() => onDeleteUserPreset(preset.id)} title="删除预设">
                          <Trash2 className="size-4" />
                        </Button>
                        <Button type="button" className="h-8 rounded-xl px-3 text-xs font-black" onClick={() => onCreateFromUserPreset(preset.id)}>
                          使用
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="space-y-2">
            <div className={cn("text-xs font-black uppercase tracking-[0.16em]", canvasLabelClass)}>系统预设</div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {SMART_CANVAS_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="group flex min-h-[168px] flex-col overflow-hidden rounded-2xl border border-border bg-card text-left shadow-sm transition hover:-translate-y-0.5 hover:border-sky-400 hover:shadow-[0_12px_28px_rgba(14,165,233,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 dark:border-slate-800 dark:bg-slate-900/80 dark:hover:border-sky-400/80"
                onClick={() => onCreateCanvas(preset.id)}
              >
                <div className="flex min-h-[58px] items-center justify-center border-b border-border bg-muted/35 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/35">
                  <PresetFlowPreview preset={preset} />
                </div>
                <div className="flex flex-1 flex-col p-3">
                  <div className="flex items-start gap-2.5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-700 transition group-hover:bg-sky-500/15 dark:text-sky-200">
                      <PresetIcon presetId={preset.id} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-black text-foreground dark:text-slate-100">{preset.title}</h3>
                      <p className={cn("mt-1 text-xs font-semibold", canvasAccentTextClass)}>{preset.summary}</p>
                    </div>
                  </div>
                  <p className={cn("mt-2 line-clamp-2 text-xs leading-5", canvasSubtleTextClass)}>{preset.description}</p>
                  <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
                    {preset.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground dark:bg-slate-800 dark:text-slate-300"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </button>
            ))}
            </div>
          </section>
          </div>
      </DialogContent>
    </Dialog>
  );
}

function PresetIcon({ presetId }: { presetId: SmartCanvasPresetId }) {
  if (presetId === "blank") {
    return <Grid2X2 className="size-4" />;
  }
  if (presetId === "image-to-image") {
    return <Images className="size-4" />;
  }
  if (presetId === "ai-prompt") {
    return <Bot className="size-4" />;
  }
  if (presetId === "batch-variants") {
    return <Repeat2 className="size-4" />;
  }
  if (presetId === "pixel-icon") {
    return <ImageIcon className="size-4" />;
  }
  return <WandSparkles className="size-4" />;
}

function PresetFlowPreview({ preset }: { preset: SmartCanvasPresetLike }) {
  if (preset.nodeTypes.length === 0) {
    return (
      <div className="grid h-10 w-full grid-cols-4 gap-1.5 opacity-70">
        {Array.from({ length: 8 }).map((_, index) => (
          <span key={index} className="rounded-md border border-dashed border-border bg-background/80 dark:border-slate-700 dark:bg-slate-900/70" />
        ))}
      </div>
    );
  }
  return (
    <div className="flex w-full items-center justify-center gap-1.5">
      {preset.nodeTypes.map((type, index) => (
        <FragmentWithConnector key={`${preset.id}-${type}-${index}`} showConnector={index < preset.nodeTypes.length - 1}>
          <span className="flex size-8 items-center justify-center rounded-xl border border-border bg-background text-sky-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-sky-200 [&>svg]:size-3.5">
            <ItemTypeIcon type={type} />
          </span>
        </FragmentWithConnector>
      ))}
    </div>
  );
}

function FragmentWithConnector({ children, showConnector }: { children: ReactNode; showConnector: boolean }) {
  return (
    <>
      {children}
      {showConnector ? <span className="h-px w-4 shrink-0 bg-border dark:bg-slate-700" /> : null}
    </>
  );
}

type SmartCanvasBoardProps = {
  canvas: SmartCanvasDocument | null;
  viewport: SmartCanvasViewport;
  selectedItemId: string;
  selectedItemIds: string[];
  tool: SmartCanvasTool;
  connectState: SmartCanvasConnectState;
  lightweightMedia: boolean;
  draggingImages: boolean;
  boardRef: React.RefObject<HTMLDivElement | null>;
  imageModels: CanvasModelOption[];
  textModels: CanvasModelOption[];
  videoModels: CanvasModelOption[];
  activeTeam: TeamSummary | null;
  running: boolean;
  mentionOpen: boolean;
  mentionItems: CanvasImageRef[];
  portMenuRequest: SmartCanvasPortMenuRequest | null;
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
  onRemoveImageBackground: (nodeId: string) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onViewportChange: (viewport: SmartCanvasViewport, commit?: boolean, label?: string) => void;
  onUpdateItemData: (id: string, patch: Partial<SmartCanvasItem["data"]>) => void;
  onRunGenerator: (id: string) => void;
  onRunLlm: (id: string) => void;
  onStopLoop: (id: string) => void;
  onStopNode: (id: string) => void;
  onOpenNodeHelp: (nodeType: SmartCanvasItemType) => void;
  onConnectLlmImagesToGenerator: (generatorId: string) => void;
  onConnectLlmImagesToLoop: (loopId: string) => void;
  onDeleteItem: (id: string) => void;
  onStartConnect: (event: ReactPointerEvent<HTMLElement>, sourceId: string) => void;
  onFinishConnect: (event: ReactPointerEvent<HTMLElement>, targetId: string) => void;
  onDeleteEdge: (id: string) => void;
  onMentionToggle: () => void;
  onAddMentionToPrompt: (nodeId: string, image: CanvasImageRef) => void;
  onCreateNodeAt: (type: SmartCanvasItem["type"], point: { x: number; y: number }) => void;
  onCreateNodeFromPort: (nodeId: string, type: SmartCanvasItem["type"], point?: { x: number; y: number }, direction?: "upstream" | "downstream") => void;
  onCreateNodeHelpTemplate: (nodeId: string) => void;
  onUploadAt: (point: { x: number; y: number }) => void;
  runCount: number;
  mobileMiniMapOpen: boolean;
  onMobileToolsOpen: () => void;
};

export function SmartCanvasBoard({
  canvas,
  viewport,
  selectedItemId,
  selectedItemIds,
  tool,
  connectState,
  lightweightMedia,
  draggingImages,
  boardRef,
  imageModels,
  textModels,
  videoModels,
  activeTeam,
  running,
  mentionOpen,
  mentionItems,
  portMenuRequest,
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
  onRemoveImageBackground,
  onZoomIn,
  onZoomOut,
  onFit,
  onViewportChange,
  onUpdateItemData,
  onRunGenerator,
  onRunLlm,
  onStopLoop,
  onStopNode,
  onOpenNodeHelp,
  onConnectLlmImagesToGenerator,
  onConnectLlmImagesToLoop,
  onDeleteItem,
  onStartConnect,
  onFinishConnect,
  onDeleteEdge,
  onMentionToggle,
  onAddMentionToPrompt,
  onCreateNodeAt,
  onCreateNodeFromPort,
  onCreateNodeHelpTemplate,
  onUploadAt,
  runCount,
  mobileMiniMapOpen,
  onMobileToolsOpen,
}: SmartCanvasBoardProps) {
  const [nodeSizes, setNodeSizes] = useState<SmartCanvasNodeSizeMap>({});
  const [contextMenu, setContextMenu] = useState<SmartCanvasNodeMenuState | null>(null);
  const outputPortPressRef = useRef<SmartCanvasPortPress | null>(null);
  const outputPortCleanupRef = useRef<(() => void) | null>(null);
  const ignoreNextBoardClickRef = useRef(false);
  const [showZoomBadge, setShowZoomBadge] = useState(false);
  const previousZoomRef = useRef(viewport.zoom);
  const zoomBadgeTimerRef = useRef<number | null>(null);
  const graphIdentityTrackerRef = useRef<SmartCanvasObjectIdentityTracker>({ nextId: 1, ids: new WeakMap() });
  const openNodeMenu = useCallback((screen: { x: number; y: number }, nodeId?: string, direction: "upstream" | "downstream" = "downstream") => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const localX = screen.x - rect.left;
    const menuX = direction === "upstream"
      ? localX - CANVAS_NODE_MENU_WIDTH - CANVAS_NODE_MENU_GAP
      : localX + CANVAS_NODE_MENU_GAP;
    setContextMenu({
      x: Math.min(menuX, rect.width - CANVAS_NODE_MENU_WIDTH - CANVAS_NODE_MENU_GAP),
      y: Math.min(screen.y - rect.top, rect.height - 330),
      screen,
      nodeId,
      direction,
    });
  }, [boardRef]);
  const handleOutputPortPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>, sourceId: string) => {
    outputPortCleanupRef.current?.();
    const press: SmartCanvasPortPress = {
      sourceId,
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
    };
    outputPortPressRef.current = press;

    const cleanup = () => {
      window.removeEventListener("pointerup", handleWindowPointerUp, true);
      window.removeEventListener("pointercancel", handleWindowPointerCancel, true);
      if (outputPortPressRef.current?.pointerId === press.pointerId) {
        outputPortPressRef.current = null;
      }
      if (outputPortCleanupRef.current === cleanup) {
        outputPortCleanupRef.current = null;
      }
    };

    const handleWindowPointerUp = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== press.pointerId) {
        return;
      }
      const currentPress = outputPortPressRef.current;
      const targetInputId = document
        .elementFromPoint(pointerEvent.clientX, pointerEvent.clientY)
        ?.closest("[data-port='in']")
        ?.closest("[data-canvas-node-id]")
        ?.getAttribute("data-canvas-node-id") || "";
      const shouldOpenMenu = Boolean(
        currentPress &&
        currentPress.sourceId === sourceId &&
        !targetInputId,
      );
      cleanup();
      if (shouldOpenMenu) {
        ignoreNextBoardClickRef.current = true;
        window.setTimeout(() => {
          if (pointerEvent.defaultPrevented) {
            return;
          }
          openNodeMenu({ x: pointerEvent.clientX, y: pointerEvent.clientY }, sourceId, "downstream");
        }, 0);
      }
    };

    const handleWindowPointerCancel = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId === press.pointerId) {
        cleanup();
      }
    };

    outputPortCleanupRef.current = cleanup;
    window.addEventListener("pointerup", handleWindowPointerUp, true);
    window.addEventListener("pointercancel", handleWindowPointerCancel, true);
    onStartConnect(event, sourceId);
  }, [onStartConnect, openNodeMenu]);
  const handleBoardPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const targetInputId = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest("[data-port='in']")
      ?.closest("[data-canvas-node-id]")
      ?.getAttribute("data-canvas-node-id") || "";
    const shouldOpenPortMenu = connectState.kind === "link" && connectState.pointerId === event.pointerId && !targetInputId;
    onPointerUp(event);
    if (shouldOpenPortMenu && !event.defaultPrevented) {
      ignoreNextBoardClickRef.current = true;
      window.setTimeout(() => openNodeMenu({ x: event.clientX, y: event.clientY }, connectState.sourceId, "downstream"), 0);
    }
  }, [connectState, onPointerUp, openNodeMenu]);
  const handleBoardPointerCancel = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    outputPortCleanupRef.current?.();
    outputPortPressRef.current = null;
    onPointerUp(event);
  }, [onPointerUp]);
  const handleOpenUpstreamMenu = useCallback((event: ReactPointerEvent<HTMLElement>, nodeId: string) => {
    ignoreNextBoardClickRef.current = true;
    openNodeMenu({ x: event.clientX, y: event.clientY }, nodeId, "upstream");
  }, [openNodeMenu]);
  useEffect(() => () => outputPortCleanupRef.current?.(), []);
  useEffect(() => {
    if (!portMenuRequest) {
      return;
    }
    ignoreNextBoardClickRef.current = true;
    openNodeMenu(portMenuRequest.screen, portMenuRequest.nodeId, portMenuRequest.direction);
  }, [portMenuRequest, openNodeMenu]);
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
  const canvasNodes = canvas?.nodes || EMPTY_SMART_CANVAS_NODES;
  const canvasEdges = canvas?.edges || EMPTY_SMART_CANVAS_EDGES;
  const graphIndexes = useMemo(
    () => buildSmartCanvasGraphIndexes(canvasNodes, canvasEdges, graphIdentityTrackerRef.current),
    [canvasEdges, canvasNodes],
  );
  const selectedNodeIds = useMemo(() => {
    const ids = new Set(selectedItemIds);
    if (selectedItemId) {
      ids.add(selectedItemId);
    }
    return ids;
  }, [selectedItemId, selectedItemIds]);
  const viewBounds = useMemo(() => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) {
      return null;
    }
    const margin = 640 / Math.max(0.25, viewport.zoom || 1);
    return {
      left: (-viewport.x / viewport.zoom) - margin,
      top: (-viewport.y / viewport.zoom) - margin,
      right: ((rect.width - viewport.x) / viewport.zoom) + margin,
      bottom: ((rect.height - viewport.y) / viewport.zoom) + margin,
    };
  }, [boardRef, viewport]);
  const renderNodes = useMemo(() => {
    return canvasNodes.filter((item) => isNodeInViewBounds(item, nodeSizes, viewBounds) || selectedNodeIds.has(item.id));
  }, [canvasNodes, nodeSizes, selectedNodeIds, viewBounds]);
  const renderNodeIds = useMemo(() => new Set(renderNodes.map((item) => item.id)), [renderNodes]);
  const renderEdges = useMemo(() => canvasEdges.filter((edge) => renderNodeIds.has(edge.source) || renderNodeIds.has(edge.target)), [canvasEdges, renderNodeIds]);
  const previewSourceId = previewEdge?.source || "";
  const previewPointer = previewEdge?.pointer || null;
  const previewSnapTargetId = useMemo(() => {
    if (!previewSourceId || !previewPointer) {
      return "";
    }
    return nearestCanvasInputNodeId(previewSourceId, previewPointer, canvasNodes, graphIndexes.nodesById, nodeSizes);
  }, [canvasNodes, graphIndexes.nodesById, nodeSizes, previewPointer, previewSourceId]);
  useEffect(() => {
    if (Math.abs(previousZoomRef.current - viewport.zoom) < 0.001) {
      return;
    }
    previousZoomRef.current = viewport.zoom;
    setShowZoomBadge(true);
    if (zoomBadgeTimerRef.current !== null) {
      window.clearTimeout(zoomBadgeTimerRef.current);
    }
    zoomBadgeTimerRef.current = window.setTimeout(() => {
      setShowZoomBadge(false);
      zoomBadgeTimerRef.current = null;
    }, 1200);
  }, [viewport.zoom]);

  useEffect(() => () => {
    if (zoomBadgeTimerRef.current !== null) {
      window.clearTimeout(zoomBadgeTimerRef.current);
    }
  }, []);

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
        onPointerUp={handleBoardPointerUp}
        onPointerCancel={handleBoardPointerCancel}
        onWheel={onWheel}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onContextMenu={(event) => {
          onContextMenu(event);
          if (event.defaultPrevented) {
            openNodeMenu({ x: event.clientX, y: event.clientY });
          }
        }}
        onClick={() => {
          if (ignoreNextBoardClickRef.current) {
            ignoreNextBoardClickRef.current = false;
            return;
          }
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
            {renderEdges.map((edge) => (
              <SmartCanvasEdgePath
                key={edge.id}
                edge={edge}
                nodesById={graphIndexes.nodesById}
                nodeSizes={nodeSizes}
                selected={selectedNodeIds.has(edge.source) || selectedNodeIds.has(edge.target)}
              />
            ))}
            {previewEdge ? <SmartCanvasPreviewEdge sourceId={previewEdge.source} pointer={previewEdge.pointer} snapTargetId={previewSnapTargetId} nodesById={graphIndexes.nodesById} nodeSizes={nodeSizes} /> : null}
          </svg>
          {renderEdges.map((edge) => (
            <EdgeDeleteButton key={`${edge.id}-delete`} edge={edge} nodesById={graphIndexes.nodesById} nodeSizes={nodeSizes} onDelete={onDeleteEdge} />
          ))}
          {renderNodes.map((item) => (
            <SmartCanvasNode
              key={item.id}
              canvas={canvas as SmartCanvasDocument}
              item={item}
              graphDependencyKey={graphIndexes.dependencyKeysByNodeId.get(item.id) || ""}
              selected={selectedNodeIds.has(item.id)}
              imageModels={imageModels}
              textModels={textModels}
              videoModels={videoModels}
              activeTeam={activeTeam}
              running={running}
              lightweightMedia={lightweightMedia}
              mentionOpen={mentionOpen && item.id === selectedItemId}
              mentionItems={mentionItems}
              onItemPointerDown={onItemPointerDown}
              onResizeItemPointerDown={onResizeItemPointerDown}
              onSelectItem={onSelectItem}
              onOpenImage={onOpenImage}
              onDeleteImage={onDeleteImage}
              onRemoveImageBackground={onRemoveImageBackground}
              onUpdateItemData={onUpdateItemData}
              onRunGenerator={onRunGenerator}
              onRunLlm={onRunLlm}
              onStopLoop={onStopLoop}
              onStopNode={onStopNode}
              onOpenNodeHelp={onOpenNodeHelp}
              onConnectLlmImagesToGenerator={onConnectLlmImagesToGenerator}
              onConnectLlmImagesToLoop={onConnectLlmImagesToLoop}
              onDeleteItem={onDeleteItem}
              onStartConnect={handleOutputPortPointerDown}
              onFinishConnect={onFinishConnect}
              onOpenUpstreamMenu={handleOpenUpstreamMenu}
              onMentionToggle={onMentionToggle}
              onAddMentionToPrompt={onAddMentionToPrompt}
              onCreateNodeFromPort={onCreateNodeFromPort}
              onCreateNodeHelpTemplate={onCreateNodeHelpTemplate}
              onMeasure={handleMeasureNode}
            />
          ))}
        </div>
        {canvas && canvas.nodes.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className={cn("rounded-3xl border p-6 text-center shadow-2xl backdrop-blur", canvasDashedClass)}>
              <Images className="mx-auto mb-3 size-9 text-muted-foreground dark:text-slate-500" />
              <div className="text-sm font-bold text-foreground dark:text-slate-200">从顶部或右键添加节点，或拖入图片开始创作</div>
              <div className={cn("mt-1 text-xs", canvasSubtleTextClass)}>提示词、AI 提示词、图片生成、Output 都可以在节点里直接编辑。</div>
            </div>
          </div>
        ) : null}
        {contextMenu ? (
          <SmartCanvasContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            onClose={() => setContextMenu(null)}
            node={contextMenu.nodeId ? graphIndexes.nodesById.get(contextMenu.nodeId) || null : null}
            direction={contextMenu.direction}
            onUpload={contextMenu.nodeId
              ? undefined
              : () => {
                  onUploadAt(contextMenu.screen);
                  setContextMenu(null);
                }}
            onCreate={(type) => {
              if (contextMenu.nodeId) {
                onCreateNodeFromPort(contextMenu.nodeId, type, contextMenu.screen, contextMenu.direction);
              } else {
                onCreateNodeAt(type, contextMenu.screen);
              }
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
        className="hidden lg:block"
      />
      <div className="absolute bottom-4 left-[246px] z-30 hidden flex-col gap-2 opacity-45 transition-opacity duration-200 hover:opacity-100 focus-within:opacity-100 lg:flex">
        <IconToolButton title="放大" onClick={onZoomIn}><ZoomIn className="size-4" /></IconToolButton>
        <IconToolButton title="缩小" onClick={onZoomOut}><ZoomOut className="size-4" /></IconToolButton>
        <IconToolButton title="适配内容" onClick={onFit}><BoxSelect className="size-4" /></IconToolButton>
      </div>
      <div className="absolute bottom-3 left-1/2 z-30 hidden -translate-x-1/2 rounded-full bg-card/85 px-4 py-1 text-[11px] font-semibold text-muted-foreground shadow-sm backdrop-blur dark:bg-slate-950/70 dark:text-slate-500 lg:block">
        右键添加节点，Ctrl/⌘ 点击多选，拖动任一已选节点可一起移动，Delete 删除所选
      </div>
      {mobileMiniMapOpen ? (
        <SmartCanvasMiniMap
          canvas={canvas}
          viewport={viewport}
          nodeSizes={nodeSizes}
          boardRef={boardRef}
          onViewportChange={onViewportChange}
          className="bottom-[calc(env(safe-area-inset-bottom)_+_5rem)] left-3 opacity-100 lg:hidden"
        />
      ) : null}
      <div
        className={cn(
          "absolute inset-x-0 z-30 flex justify-center px-3 lg:hidden",
          "bottom-[calc(env(safe-area-inset-bottom)_+_0.75rem)]",
        )}
        onPointerDown={stopNodeInteraction}
      >
        <button
          type="button"
          className={cn(
            "relative flex h-12 min-w-[9.5rem] items-center justify-center gap-2 rounded-full border px-5 text-sm font-black shadow-lg shadow-slate-950/10 backdrop-blur transition active:scale-[0.98]",
            "border-border bg-card/92 text-foreground hover:bg-accent dark:border-slate-800 dark:bg-slate-950/85 dark:text-slate-100 dark:hover:bg-slate-900",
            mobileMiniMapOpen && "border-sky-400/45 bg-sky-500/12 text-sky-700 dark:border-sky-300/35 dark:bg-sky-400/15 dark:text-sky-100",
          )}
          onClick={onMobileToolsOpen}
          title="画布工具"
          aria-label={`打开画布工具${runCount ? `，${runCount} 条运行记录` : ""}`}
        >
          <Wrench className="size-4" />
          <span>画布工具</span>
          {runCount ? (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-sky-500 px-1.5 text-[10px] font-black leading-none text-white">
              {runCount > 99 ? "99+" : runCount}
            </span>
          ) : null}
        </button>
      </div>
      {showZoomBadge ? (
        <div className="pointer-events-none absolute bottom-12 left-1/2 z-40 hidden -translate-x-1/2 rounded-full border border-border bg-card/95 px-3 py-1 text-xs font-bold text-muted-foreground shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-950/90 dark:text-slate-400 lg:block">
          {Math.round(viewport.zoom * 100)}%
        </div>
      ) : null}
    </section>
  );
}

export function SmartCanvasHelpPanel({
  open,
  topic,
  onOpenChange,
  onTopicChange,
  onInsertTemplate,
}: {
  open: boolean;
  topic: SmartCanvasHelpTopic;
  onOpenChange: (open: boolean) => void;
  onTopicChange: (topic: SmartCanvasHelpTopic) => void;
  onInsertTemplate: (templateId: SmartCanvasFlowTemplateId) => void;
}) {
  const activeNode = topic.kind === "node" ? canvasNodeHelpById(topic.id) : null;
  const activeFlow = topic.kind === "flow" ? canvasFlowTemplateById(topic.id) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className={cn("h-[min(82vh,720px)] w-[min(92vw,980px)] max-w-none gap-0 overflow-hidden rounded-3xl p-0", canvasPanelClass)}>
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex items-center justify-between border-b border-border px-5 py-4 dark:border-slate-700/80">
            <div>
              <DialogTitle className="text-base font-black">画布帮助</DialogTitle>
              <DialogDescription className={cn("mt-1 text-xs font-semibold", canvasSubtleTextClass)}>节点说明和常用流程</DialogDescription>
            </div>
            <button
              type="button"
              className={cn("flex size-9 items-center justify-center rounded-xl transition", canvasIconButtonClass)}
              onClick={() => onOpenChange(false)}
              title="关闭帮助"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="flex min-h-0 flex-1">
            <div className="w-44 shrink-0 overflow-y-auto border-r border-border p-3 dark:border-slate-700/80">
              <div className={cn("px-2 pb-1 text-[10px] font-black uppercase tracking-[0.16em]", canvasLabelClass)}>节点</div>
              <div className="space-y-1">
                {CANVAS_NODE_HELP.map((item) => (
                  <HelpNavButton
                    key={item.id}
                    active={topic.kind === "node" && topic.id === item.id}
                    label={item.title}
                    onClick={() => onTopicChange({ kind: "node", id: item.id })}
                  />
                ))}
              </div>
              <div className={cn("mt-4 px-2 pb-1 text-[10px] font-black uppercase tracking-[0.16em]", canvasLabelClass)}>流程</div>
              <div className="space-y-1">
                {CANVAS_FLOW_TEMPLATES.map((item) => (
                  <HelpNavButton
                    key={item.id}
                    active={topic.kind === "flow" && topic.id === item.id}
                    label={item.title}
                    onClick={() => onTopicChange({ kind: "flow", id: item.id })}
                  />
                ))}
              </div>
            </div>
            <div className="min-w-0 flex-1 overflow-y-auto p-6">
              {activeNode ? <NodeHelpContent item={activeNode} /> : null}
              {activeFlow ? <FlowHelpContent item={activeFlow} onInsert={() => onInsertTemplate(activeFlow.id)} /> : null}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HelpNavButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className={cn(
        "block w-full rounded-xl px-2 py-2 text-left text-xs font-bold transition",
        active
          ? "bg-sky-500/12 text-sky-700 dark:bg-sky-400/12 dark:text-sky-200"
          : "text-muted-foreground hover:bg-accent hover:text-foreground dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white",
      )}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function NodeHelpContent({ item }: { item: (typeof CANVAS_NODE_HELP)[number] }) {
  return (
    <div className="space-y-4">
      <div>
        <div className={cn("text-[11px] font-black uppercase tracking-[0.16em]", canvasAccentTextClass)}>节点说明</div>
        <h2 className="mt-1 text-xl font-black">{item.title}</h2>
        <p className={cn("mt-2 text-sm leading-6", canvasSubtleTextClass)}>{item.summary}</p>
      </div>
      <HelpInfoBlock title="上游输入" text={item.upstream} />
      <HelpInfoBlock title="下游连接" text={item.downstream} />
      <HelpListBlock title="关键控件" items={item.controls} />
      <HelpListBlock title="使用提醒" items={item.reminders} />
    </div>
  );
}

function FlowHelpContent({ item, onInsert }: { item: (typeof CANVAS_FLOW_TEMPLATES)[number]; onInsert: () => void }) {
  return (
    <div className="space-y-4">
      <div>
        <div className={cn("text-[11px] font-black uppercase tracking-[0.16em]", canvasAccentTextClass)}>示例流程</div>
        <h2 className="mt-1 text-xl font-black">{item.title}</h2>
        <p className={cn("mt-2 text-sm leading-6", canvasSubtleTextClass)}>{item.summary}</p>
      </div>
      <div className="rounded-2xl border border-sky-500/20 bg-sky-500/8 p-3 text-sm font-black text-sky-800 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-100">
        {item.chain}
      </div>
      <Button
        type="button"
        className="h-10 w-full rounded-xl bg-primary font-bold text-primary-foreground hover:bg-primary/90"
        onClick={onInsert}
      >
        <ImagePlus className="size-4" />
        插入到当前画布
      </Button>
      <HelpListBlock
        title="适合场景"
        items={[
          "想快速搭出一条能运行的链路。",
          "不确定节点应该怎么连时，先插入模板再替换提示词或图片。",
        ]}
      />
    </div>
  );
}

function HelpInfoBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-border bg-background/65 p-3 dark:border-slate-700 dark:bg-slate-950/35">
      <div className={cn("mb-1 text-[11px] font-black uppercase tracking-[0.14em]", canvasLabelClass)}>{title}</div>
      <div className="text-sm leading-6">{text}</div>
    </div>
  );
}

function HelpListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className={cn("mb-2 text-[11px] font-black uppercase tracking-[0.14em]", canvasLabelClass)}>{title}</div>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item} className="rounded-xl border border-border bg-background/65 px-3 py-2 text-sm leading-6 dark:border-slate-700 dark:bg-slate-950/35">
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SmartCanvasOnboardingDialog({
  open,
  onInsertBasicTemplate,
  onOpenHelp,
  onDismiss,
}: {
  open: boolean;
  onInsertBasicTemplate: () => void;
  onOpenHelp: () => void;
  onDismiss: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => {
      if (!next) {
        onDismiss();
      }
    }}>
      <DialogContent className={cn("max-w-xl rounded-3xl border p-0", canvasPanelClass)}>
        <div className="space-y-5 p-6">
          <div>
            <DialogTitle className="text-xl font-black">快速认识无限画布</DialogTitle>
            <DialogDescription className={cn("mt-2 text-sm leading-6", canvasSubtleTextClass)}>
              画布由节点和连线组成。Prompt 写想法，图片生成提交任务，Output 展示结果。
            </DialogDescription>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <OnboardingStep title="1. 添加节点" text="用顶部工具栏或右键空白处添加 Prompt、图片生成、Output。" />
            <OnboardingStep title="2. 拖线连接" text="从右侧端口拖到下游节点左侧端口，形成工作流。" />
            <OnboardingStep title="3. 点击生成" text="在 图片生成 节点设置模型和比例，然后提交生成。" />
          </div>
          <div className="rounded-2xl border border-sky-500/20 bg-sky-500/8 p-4 text-sm font-black text-sky-800 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-100">
            {"基础链路：Prompt -> 图片生成 -> Output"}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" className={cn("h-10 rounded-xl", canvasGhostButtonClass)} onClick={onDismiss}>
              跳过
            </Button>
            <Button type="button" variant="outline" className={cn("h-10 rounded-xl", canvasGhostButtonClass)} onClick={onOpenHelp}>
              <CircleHelp className="size-4" />
              打开帮助
            </Button>
            <Button type="button" className="h-10 rounded-xl bg-primary font-bold text-primary-foreground hover:bg-primary/90" onClick={onInsertBasicTemplate}>
              <ImagePlus className="size-4" />
              插入基础示例
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function OnboardingStep({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-border bg-background/65 p-3 dark:border-slate-700 dark:bg-slate-950/35">
      <div className="text-sm font-black">{title}</div>
      <div className={cn("mt-1 text-xs leading-5", canvasSubtleTextClass)}>{text}</div>
    </div>
  );
}

function SmartCanvasContextMenu({
  x,
  y,
  onClose,
  node,
  direction,
  onUpload,
  onCreate,
}: {
  x: number;
  y: number;
  onClose: () => void;
  node?: SmartCanvasItem | null;
  direction: "upstream" | "downstream";
  onUpload?: () => void;
  onCreate: (type: SmartCanvasItem["type"]) => void;
}) {
  const items: Array<{
    label: string;
    icon: ReactNode;
    action?: () => void;
    disabled?: boolean;
  }> = [
    ...(onUpload ? [{ label: "上传卡片", icon: <ImagePlus className="size-4" />, action: onUpload }] : []),
    ...connectableNodeMenuItems(node, direction).map((item) => ({
      label: item.label,
      icon: item.icon,
      action: () => onCreate(item.type),
    })),
  ];

  return (
    <div
      data-node-interactive="true"
      className="absolute z-50 w-56 rounded-2xl border border-border bg-card/96 p-2 text-card-foreground shadow-[0_24px_72px_rgba(15,23,42,0.24)] backdrop-blur dark:border-slate-700 dark:bg-[#111827]/96 dark:text-slate-100"
      style={{ left: Math.max(CANVAS_NODE_MENU_GAP, x), top: Math.max(CANVAS_NODE_MENU_GAP, y) }}
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
      {items.length === 0 ? (
        <div className="px-3 py-4 text-center text-xs font-semibold text-muted-foreground dark:text-slate-500">
          当前节点没有可连接的{direction === "upstream" ? "上游" : "下游"}节点
        </div>
      ) : null}
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
  className,
}: {
  canvas: SmartCanvasDocument | null;
  viewport: SmartCanvasViewport;
  nodeSizes: SmartCanvasNodeSizeMap;
  boardRef: React.RefObject<HTMLDivElement | null>;
  onViewportChange: (viewport: SmartCanvasViewport, commit?: boolean, label?: string) => void;
  className?: string;
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
        "absolute bottom-4 left-6 z-30 transition-opacity duration-200 hover:opacity-100",
        dragging ? "opacity-100" : "opacity-45",
        className,
      )}
    >
      <div
        className="relative rounded-2xl border border-border/80 bg-card/60 p-2 shadow-xl backdrop-blur dark:border-slate-700/80 dark:bg-slate-950/55"
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
    </div>
  );
}

function stopNodeInteraction(event: ReactPointerEvent<HTMLElement>) {
  event.stopPropagation();
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function canvasImageDownloadId(image: CanvasImageRef, index: number) {
  return `${canvasImageKey(image) || canvasImageSource(image) || image.name || "image"}-${index}`;
}

function canvasImageDownloadItem(
  image: CanvasImageRef,
  index: number,
  context: { nodeId: string; createdAt?: string },
): DownloadableImage | null {
  const src = canvasImageSource(image);
  if (!src) {
    return null;
  }
  return {
    id: canvasImageDownloadId(image, index),
    src,
    path: image.path || getManagedImagePathFromUrl(src),
    fileName: buildTimestampedImageDownloadName({
      prefix: "canvas-output",
      createdAt: context.createdAt,
      id: context.nodeId,
      index,
      src,
    }),
  };
}

function isNodeInViewBounds(item: SmartCanvasItem, nodeSizes: SmartCanvasNodeSizeMap, bounds: SmartCanvasViewBounds | null) {
  if (!bounds) {
    return true;
  }
  const size = nodeSizes[item.id] || NODE_SIZE[item.type];
  const x = Number(item.position?.x || 0);
  const y = Number(item.position?.y || 0);
  return x + size.w >= bounds.left && x <= bounds.right && y + size.h >= bounds.top && y <= bounds.bottom;
}

function smartCanvasObjectKey(value: object | undefined, tracker: SmartCanvasObjectIdentityTracker) {
  if (!value) {
    return "";
  }
  const existing = tracker.ids.get(value);
  if (existing) {
    return String(existing);
  }
  const next = tracker.nextId++;
  tracker.ids.set(value, next);
  return String(next);
}

function buildSmartCanvasGraphIndexes(
  nodes: SmartCanvasItem[],
  edges: { source: string; target: string }[],
  tracker: SmartCanvasObjectIdentityTracker,
): SmartCanvasGraphIndexes {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const incomingByTarget = new Map<string, string[]>();
  const outgoingBySource = new Map<string, string[]>();
  for (const edge of edges) {
    const incoming = incomingByTarget.get(edge.target) || [];
    incoming.push(edge.source);
    incomingByTarget.set(edge.target, incoming);
    const outgoing = outgoingBySource.get(edge.source) || [];
    outgoing.push(edge.target);
    outgoingBySource.set(edge.source, outgoing);
  }
  const allEdgeKey = edges.map((edge) => `${edge.source}->${edge.target}`).join(CANVAS_GRAPH_KEY_SEPARATOR);
  const dependencyKeysByNodeId = new Map<string, string>();
  const edgeSignature = (nodeId: string) => [
    ...(incomingByTarget.get(nodeId) || []).map((source) => `${source}->${nodeId}`),
    ...(outgoingBySource.get(nodeId) || []).map((target) => `${nodeId}->${target}`),
  ].sort().join(",");
  const addNode = (ids: Set<string>, nodeId: string) => {
    if (nodeId) {
      ids.add(nodeId);
    }
  };

  for (const node of nodes) {
    const dependencyIds = new Set<string>();
    addNode(dependencyIds, node.id);
    const directIncoming = incomingByTarget.get(node.id) || [];
    const directOutgoing = outgoingBySource.get(node.id) || [];
    directIncoming.forEach((id) => addNode(dependencyIds, id));
    directOutgoing.forEach((id) => addNode(dependencyIds, id));
    if (node.type === "group") {
      (node.data?.group_item_ids || []).forEach((id) => addNode(dependencyIds, id));
    }
    if (node.type === "llm" || node.type === "loop" || node.type === "image_generation" || node.type === "video_generation") {
      for (const incomingId of directIncoming) {
        const incomingNode = nodesById.get(incomingId);
        if (incomingNode?.type === "group") {
          (incomingNode.data?.group_item_ids || []).forEach((id) => addNode(dependencyIds, id));
        }
        if (incomingNode?.type === "llm" || incomingNode?.type === "loop") {
          (incomingByTarget.get(incomingId) || []).forEach((id) => addNode(dependencyIds, id));
        }
      }
    }
    const nodeKeys = Array.from(dependencyIds)
      .sort()
      .map((id) => {
        const target = nodesById.get(id);
        return `${id}:${smartCanvasObjectKey(target, tracker)}:${edgeSignature(id)}`;
      });
    const graphKey = node.type === "group" ? allEdgeKey : edgeSignature(node.id);
    dependencyKeysByNodeId.set(node.id, `${graphKey}${CANVAS_GRAPH_KEY_SEPARATOR}${nodeKeys.join(CANVAS_GRAPH_KEY_SEPARATOR)}`);
  }

  return { nodesById, dependencyKeysByNodeId };
}

function nearestCanvasInputNodeId(
  sourceId: string,
  pointer: { x: number; y: number },
  nodes: SmartCanvasItem[],
  nodesById: SmartCanvasNodeLookup,
  nodeSizes: SmartCanvasNodeSizeMap,
) {
  const source = nodesById.get(sourceId);
  if (!source) {
    return "";
  }
  let best: { id: string; distance: number } | null = null;
  for (const node of nodes) {
    if (node.id === sourceId || !canConnectSmartCanvasNodes(source, node)) {
      continue;
    }
    const size = nodeSizes[node.id] || NODE_SIZE[node.type];
    const port = inputPortPoint(node, nodeSizes);
    const leftDistance = pointer.x - port.x;
    const verticalDistance = Math.abs(pointer.y - port.y);
    const nearLeftEdge = leftDistance >= -72 && leftDistance <= Math.max(72, size.w * 0.32);
    if (!nearLeftEdge || verticalDistance > Math.max(72, size.h * 0.48)) {
      continue;
    }
    const distance = Math.hypot(Math.max(0, Math.abs(leftDistance) - 16), verticalDistance);
    if (!best || distance < best.distance) {
      best = { id: node.id, distance };
    }
  }
  return best?.id || "";
}

function SmartCanvasEdgePath({
  edge,
  nodesById,
  nodeSizes,
  selected,
}: {
  edge: { id: string; source: string; target: string };
  nodesById: SmartCanvasNodeLookup;
  nodeSizes: SmartCanvasNodeSizeMap;
  selected: boolean;
}) {
  const source = nodesById.get(edge.source);
  const target = nodesById.get(edge.target);
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

function SmartCanvasPreviewEdge({
  sourceId,
  pointer,
  snapTargetId,
  nodesById,
  nodeSizes,
}: {
  sourceId: string;
  pointer: { x: number; y: number };
  snapTargetId: string;
  nodesById: SmartCanvasNodeLookup;
  nodeSizes: SmartCanvasNodeSizeMap;
}) {
  const source = nodesById.get(sourceId);
  if (!source) {
    return null;
  }
  const a = outputPortPoint(source, nodeSizes);
  const snapTarget = snapTargetId ? nodesById.get(snapTargetId) : null;
  const b = snapTarget ? inputPortPoint(snapTarget, nodeSizes) : pointer;
  return (
    <path d={bezierPath(a, b)} fill="none" stroke="#38bdf8" strokeDasharray={snapTarget ? undefined : "6 6"} strokeWidth={snapTarget ? 3 : 2.5} strokeLinecap="round" opacity={snapTarget ? 1 : 0.9} />
  );
}

function EdgeDeleteButton({ edge, nodesById, nodeSizes, onDelete }: { edge: { id: string; source: string; target: string }; nodesById: SmartCanvasNodeLookup; nodeSizes: SmartCanvasNodeSizeMap; onDelete: (id: string) => void }) {
  const source = nodesById.get(edge.source);
  const target = nodesById.get(edge.target);
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
  graphDependencyKey: string;
  selected: boolean;
  imageModels: CanvasModelOption[];
  textModels: CanvasModelOption[];
  videoModels: CanvasModelOption[];
  activeTeam: TeamSummary | null;
  running: boolean;
  lightweightMedia: boolean;
  mentionOpen: boolean;
  mentionItems: CanvasImageRef[];
  onItemPointerDown: (event: ReactPointerEvent<HTMLDivElement>, item: SmartCanvasItem) => void;
  onResizeItemPointerDown: (event: ReactPointerEvent<HTMLElement>, item: SmartCanvasItem) => void;
  onSelectItem: (id: string, multi?: boolean) => void;
  onOpenImage: (image: CanvasImageRef) => void;
  onDeleteImage: (nodeId: string, image: CanvasImageRef) => void;
  onRemoveImageBackground: (nodeId: string) => void;
  onUpdateItemData: (id: string, patch: Partial<SmartCanvasItem["data"]>) => void;
  onRunGenerator: (id: string) => void;
  onRunLlm: (id: string) => void;
  onStopLoop: (id: string) => void;
  onStopNode: (id: string) => void;
  onOpenNodeHelp: (nodeType: SmartCanvasItemType) => void;
  onConnectLlmImagesToGenerator: (generatorId: string) => void;
  onConnectLlmImagesToLoop: (loopId: string) => void;
  onDeleteItem: (id: string) => void;
  onStartConnect: (event: ReactPointerEvent<HTMLElement>, sourceId: string) => void;
  onFinishConnect: (event: ReactPointerEvent<HTMLElement>, targetId: string) => void;
  onOpenUpstreamMenu: (event: ReactPointerEvent<HTMLElement>, nodeId: string) => void;
  onMentionToggle: () => void;
  onAddMentionToPrompt: (nodeId: string, image: CanvasImageRef) => void;
  onCreateNodeFromPort: (nodeId: string, type: SmartCanvasItem["type"], point?: { x: number; y: number }, direction?: "upstream" | "downstream") => void;
  onCreateNodeHelpTemplate: (nodeId: string) => void;
  onMeasure: (id: string, size: { w: number; h: number }) => void;
};

export const SmartCanvasNode = memo(function SmartCanvasNode({
  canvas,
  item,
  graphDependencyKey: _graphDependencyKey,
  selected,
  imageModels,
  textModels,
  videoModels,
  activeTeam,
  running,
  lightweightMedia,
  mentionOpen,
  mentionItems,
  onItemPointerDown,
  onResizeItemPointerDown,
  onSelectItem,
  onOpenImage,
  onDeleteImage,
  onRemoveImageBackground,
  onUpdateItemData,
  onRunGenerator,
  onRunLlm,
  onStopLoop,
  onStopNode,
  onOpenNodeHelp,
  onConnectLlmImagesToGenerator,
  onConnectLlmImagesToLoop,
  onDeleteItem,
  onStartConnect,
  onFinishConnect,
  onOpenUpstreamMenu,
  onMentionToggle,
  onAddMentionToPrompt,
  onCreateNodeFromPort,
  onCreateNodeHelpTemplate,
  onMeasure,
}: SmartCanvasNodeProps) {
  const [textAssetPickerOpen, setTextAssetPickerOpen] = useState(false);
  const size = NODE_SIZE[item.type];
  const resizable = item.type === "image" || item.type === "group";
  const width = resizable ? Number(item.data?.width || size.w) : size.w;
  const minHeight = resizable ? Number(item.data?.height || size.h) : size.h;
  const canInput = item.type === "llm" || item.type === "loop" || item.type === "group" || item.type === "image_generation" || item.type === "video_generation" || item.type === "result";
  const canOutput = true;
  const zIndex = item.type === "group" ? 1 : selected ? 35 : 10;
  const measureRef = (node: HTMLDivElement | null) => {
    if (!node) {
      return;
    }
    onMeasure(item.id, {
      w: Math.round(node.offsetWidth),
      h: Math.round(node.offsetHeight),
    });
  };
  const insertTextAssetsToPrompt = useCallback((assets: ManagedTextAsset[]) => {
    const nextPrompt = assets.reduce((text, asset) => appendTextBlock(text, asset.content), item.data?.prompt || "");
    if (nextPrompt.length > 20000) {
      toast.error("提示词最多 20,000 字符");
      return;
    }
    onUpdateItemData(item.id, { prompt: nextPrompt });
    toast.success(`已追加 ${assets.length} 条文本素材`);
  }, [item.data?.prompt, item.id, onUpdateItemData]);

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
        zIndex,
      }}
      onPointerDown={(event) => onItemPointerDown(event, item)}
      onClick={(event) => {
        event.stopPropagation();
        onSelectItem(item.id, event.ctrlKey || event.metaKey);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {canInput ? <Port side="in" onPointerUp={(event) => onFinishConnect(event, item.id)} onOpenMenu={(event) => onOpenUpstreamMenu(event, item.id)} /> : null}
      {canOutput ? <Port side="out" onPointerDown={(event) => onStartConnect(event, item.id)} /> : null}
      <NodeHeader
        item={item}
        onOpenHelp={() => onOpenNodeHelp(item.type)}
        onDelete={() => onDeleteItem(item.id)}
      />
      {item.type === "image" ? (
        <>
          <ImageNodeBody
            item={item}
            onOpenImage={onOpenImage}
            onDeleteImage={(image) => onDeleteImage(item.id, image)}
            width={width}
            height={Math.max(100, minHeight - 88)}
            lightweight={lightweightMedia}
          />
          <ResizeHandle onPointerDown={(event) => onResizeItemPointerDown(event, item)} />
        </>
      ) : item.type === "prompt" ? (
        <PromptNodeBody
          item={item}
          lightweight={lightweightMedia}
          mentionOpen={mentionOpen}
          mentionItems={mentionItems}
          onUpdateData={(patch) => onUpdateItemData(item.id, patch)}
          onMentionToggle={onMentionToggle}
          onOpenTextAssets={() => setTextAssetPickerOpen(true)}
          onAddMention={(image) => onAddMentionToPrompt(item.id, image)}
        />
      ) : item.type === "group" ? (
        <>
          <GroupNodeBody
            canvas={canvas}
            item={item}
            onOpenImage={onOpenImage}
            lightweight={lightweightMedia}
          />
          <ResizeHandle onPointerDown={(event) => onResizeItemPointerDown(event, item)} />
        </>
      ) : item.type === "llm" ? (
        <LlmNodeBody
          canvas={canvas}
          item={item}
          models={textModels}
          running={running}
          lightweight={lightweightMedia}
          onUpdateData={(patch) => onUpdateItemData(item.id, patch)}
          onRunLlm={() => onRunLlm(item.id)}
          onStopNode={() => onStopNode(item.id)}
        />
      ) : item.type === "loop" ? (
        <LoopNodeBody
          canvas={canvas}
          item={item}
          lightweight={lightweightMedia}
          onConnectLlmImagesToLoop={() => onConnectLlmImagesToLoop(item.id)}
          onStopLoop={() => onStopLoop(item.id)}
          onUpdateData={(patch) => onUpdateItemData(item.id, patch)}
        />
      ) : item.type === "image_generation" ? (
        <GeneratorNodeBody
          canvas={canvas}
          item={item}
          models={imageModels}
          running={running}
          onUpdateData={(patch) => onUpdateItemData(item.id, patch)}
          onRunGenerator={() => onRunGenerator(item.id)}
          onStopNode={() => onStopNode(item.id)}
          onConnectLlmImagesToGenerator={() => onConnectLlmImagesToGenerator(item.id)}
          onOpenImage={onOpenImage}
          onDeleteDirectImage={(image) => onDeleteImage(item.id, image)}
          lightweightMedia={lightweightMedia}
        />
      ) : item.type === "video_generation" ? (
        <VideoGeneratorNodeBody
          canvas={canvas}
          item={item}
          models={videoModels}
          running={running}
          onUpdateData={(patch) => onUpdateItemData(item.id, patch)}
          onRunGenerator={() => onRunGenerator(item.id)}
          onStopNode={() => onStopNode(item.id)}
          onConnectLlmImagesToGenerator={() => onConnectLlmImagesToGenerator(item.id)}
          onOpenImage={onOpenImage}
          onDeleteDirectImage={(image) => onDeleteImage(item.id, image)}
          lightweightMedia={lightweightMedia}
        />
      ) : (
        <OutputNodeBody item={item} onOpenImage={onOpenImage} onDeleteImage={(image) => onDeleteImage(item.id, image)} onStopNode={() => onStopNode(item.id)} lightweight={lightweightMedia} />
      )}
      {item.type === "prompt" ? (
        <TextAssetPickerDialog
          open={textAssetPickerOpen}
          activeTeam={activeTeam}
          onOpenChange={setTextAssetPickerOpen}
          onInsert={insertTextAssetsToPrompt}
        />
      ) : null}
    </div>
  );
}, areSmartCanvasNodePropsEqual);

function areSmartCanvasNodePropsEqual(previous: SmartCanvasNodeProps, next: SmartCanvasNodeProps) {
  return previous.item === next.item &&
    previous.graphDependencyKey === next.graphDependencyKey &&
    previous.selected === next.selected &&
    previous.imageModels === next.imageModels &&
    previous.textModels === next.textModels &&
    previous.videoModels === next.videoModels &&
    previous.activeTeam === next.activeTeam &&
    previous.running === next.running &&
    previous.lightweightMedia === next.lightweightMedia &&
    previous.mentionOpen === next.mentionOpen &&
    previous.mentionItems === next.mentionItems &&
    previous.onItemPointerDown === next.onItemPointerDown &&
    previous.onResizeItemPointerDown === next.onResizeItemPointerDown &&
    previous.onSelectItem === next.onSelectItem &&
    previous.onOpenImage === next.onOpenImage &&
    previous.onDeleteImage === next.onDeleteImage &&
    previous.onRemoveImageBackground === next.onRemoveImageBackground &&
    previous.onUpdateItemData === next.onUpdateItemData &&
    previous.onRunGenerator === next.onRunGenerator &&
    previous.onRunLlm === next.onRunLlm &&
    previous.onStopLoop === next.onStopLoop &&
    previous.onStopNode === next.onStopNode &&
    previous.onOpenNodeHelp === next.onOpenNodeHelp &&
    previous.onConnectLlmImagesToGenerator === next.onConnectLlmImagesToGenerator &&
    previous.onConnectLlmImagesToLoop === next.onConnectLlmImagesToLoop &&
    previous.onDeleteItem === next.onDeleteItem &&
    previous.onStartConnect === next.onStartConnect &&
    previous.onFinishConnect === next.onFinishConnect &&
    previous.onOpenUpstreamMenu === next.onOpenUpstreamMenu &&
    previous.onMentionToggle === next.onMentionToggle &&
    previous.onAddMentionToPrompt === next.onAddMentionToPrompt &&
    previous.onCreateNodeFromPort === next.onCreateNodeFromPort &&
    previous.onCreateNodeHelpTemplate === next.onCreateNodeHelpTemplate &&
    previous.onMeasure === next.onMeasure;
}

function suggestedNodeTypeForItem(item: SmartCanvasItem): Exclude<SmartCanvasItem["type"], "image"> {
  if (item.type === "llm") {
    return "prompt";
  }
  if (item.type === "image_generation" || item.type === "video_generation") {
    return "result";
  }
  return "image_generation";
}

function suggestedNodeName(type: SmartCanvasItem["type"]) {
  switch (type) {
    case "prompt":
      return "Prompt";
    case "llm":
      return "AI 提示词";
    case "loop":
      return "循环";
    case "group":
      return "组";
    case "image_generation":
      return "图片生成";
    case "video_generation":
      return "视频生成";
    case "result":
      return "Output";
    default:
      return "图片";
  }
}

function nodeUsageHint(item: SmartCanvasItem) {
  switch (item.type) {
    case "image":
      return "图片节点保存参考图。连接到 AI 提示词可先看图提词，连接到 图片生成可做图生图。";
    case "prompt":
      return "Prompt 节点写生图文本，可直接连接 图片生成，也可先连接 AI 提示词优化。";
    case "llm":
      return "AI 提示词节点会把上游文本和图片整理成可用提示词，运行后连接 图片生成。";
    case "loop":
      return "循环节点的重复模式会一次生成多张，最多 10 张；逐图模式会按上游图片逐张生成。";
    case "group":
      return "组节点会汇总组内文本和图片，连接到 图片生成、AI 提示词或循环时会自动展开。";
    case "image_generation":
      return "图片生成节点是真正提交生图的节点。上游接 Prompt/图片/循环，下游接 Output 展示结果。";
    case "video_generation":
      return "视频生成节点会提交视频任务。上游接 Prompt 和图片，下游接 Output 展示视频。";
    case "result":
      return "Output 节点展示生成结果，也可以把结果继续连接到 图片生成或视频生成做二次创作。";
  }
}

function formatCanvasNodeTime(value?: string) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return value;
  }
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatCanvasTextAssetTime(value?: string) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function CanvasRunInsight({ item, compact = false }: { item: SmartCanvasItem; compact?: boolean }) {
  const status = item.data?.status;
  const blockedBy = item.data?.blocked_by_name || item.data?.blocked_by || "";
  const taskId = item.data?.task_id || item.data?.output?.task_id || "";
  const startedAt = formatCanvasNodeTime(item.data?.started_at || item.data?.created_at);
  const updatedAt = formatCanvasNodeTime(item.data?.updated_at);
  const errorInput = {
    ...item,
    data: {
      ...item.data,
      error: item.data?.last_run_error_detail || item.data?.error,
    },
  };
  const detail = item.data?.error || item.data?.last_run_error_detail || blockedBy
    ? buildSmartCanvasErrorDetail(errorInput)
    : null;
  const currentStatusLabel = status ? statusLabel(status) : "";
  const insightTitle = detail?.title || currentStatusLabel || "运行信息";
  const showStatusSupplement = Boolean(currentStatusLabel && currentStatusLabel !== insightTitle);
  const meta = [
    taskId ? `任务 ${taskId.slice(0, 8)}` : "",
    startedAt ? `开始 ${startedAt}` : "",
    updatedAt ? `更新 ${updatedAt}` : "",
  ].filter(Boolean);
  const hasInsight = Boolean(status || blockedBy || detail || meta.length > 0);

  if (!hasInsight) {
    return null;
  }

  return (
    <div
      className={cn(
        "rounded-lg border px-2 py-1.5 text-[11px] leading-5",
        detail
          ? "border-rose-500/18 bg-rose-500/8 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-100"
          : "border-sky-500/15 bg-sky-500/8 text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-100",
      )}
      title={taskId ? `任务 ID：${taskId}` : undefined}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="min-w-0 truncate font-black">{insightTitle}</span>
        {showStatusSupplement ? <span className="shrink-0 font-semibold">{currentStatusLabel}</span> : null}
        {meta.length > 0 ? <span className="min-w-0 truncate opacity-80">{meta.join(" · ")}</span> : null}
      </div>
      <ProStudioBadge proStudio={item.data?.pro_studio} officialSettings={item.data?.official_settings} compact />
      {blockedBy ? <div className="truncate">阻断来源：{blockedBy}</div> : null}
      {detail?.message ? <div className={cn(compact ? "line-clamp-1" : "line-clamp-2", "whitespace-pre-wrap break-words")}>{detail.message}</div> : null}
    </div>
  );
}

function NodeHeader({
  item,
  onOpenHelp,
  onDelete,
}: {
  item: SmartCanvasItem;
  onOpenHelp: () => void;
  onDelete: () => void;
}) {
  const title = `${nodeUsageHint(item)} 点击查看完整用法。`;
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
          className="flex size-6 items-center justify-center rounded-md bg-sky-500/10 text-[13px] font-black leading-none text-sky-700 hover:bg-sky-500/18 hover:text-sky-800 dark:bg-sky-400/10 dark:text-sky-200 dark:hover:bg-sky-400/18 dark:hover:text-sky-100"
          data-node-interactive="true"
          title={title}
          aria-label={title}
          onPointerDown={stopNodeInteraction}
          onClick={(event) => {
            event.stopPropagation();
            onOpenHelp();
          }}
        >
          ?
        </button>
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
  width,
  height,
  lightweight,
}: {
  item: SmartCanvasItem;
  onOpenImage: (image: CanvasImageRef) => void;
  onDeleteImage: (image: CanvasImageRef) => void;
  width: number;
  height: number;
  lightweight: boolean;
}) {
  const images = item.data?.images || [];
  const [showAllImages, setShowAllImages] = useState(false);
  const imageGrid = imageNodeGridLayout(width, height, images.length);
  const uploadStatus = item.data?.upload_status;
  const uploadProgress = Math.max(0, Math.min(100, Number(item.data?.upload_progress || 0)));
  const uploading = uploadStatus === "uploading";
  const uploadError = uploadStatus === "error" || item.data?.status === "error";
  return (
    <div className="space-y-3 p-3 pb-4">
      {images.length > 0 ? (
        <div style={{ height }}>
          <CanvasImageStrip
            images={images}
            limit={imageGrid.limit}
            onOpen={onOpenImage}
            onOpenAll={() => setShowAllImages(true)}
            onDelete={onDeleteImage}
            className="h-full"
            large
            lightweight={lightweight}
            style={imageGrid.style}
          />
        </div>
      ) : uploading ? (
        <div className="flex flex-col justify-center rounded-xl border border-sky-400/35 bg-sky-500/8 p-4 dark:border-sky-400/25 dark:bg-sky-400/10" style={{ height }}>
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sky-500/12 text-sky-700 dark:bg-sky-400/12 dark:text-sky-200">
              <LoaderCircle className="size-4 animate-spin" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="truncate font-bold text-foreground dark:text-slate-100">正在上传图片</span>
                <span className="shrink-0 font-mono font-bold tabular-nums text-sky-700 dark:text-sky-200">{uploadProgress}%</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sky-950/10 dark:bg-slate-950/60">
                <div className="h-full rounded-full bg-sky-500 transition-[width] duration-200" style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          </div>
          <div className={cn("mt-3 truncate pl-12 text-[11px] font-semibold", canvasSubtleTextClass)}>
            {item.name || "图片上传中"}
          </div>
        </div>
      ) : uploadError ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-rose-300/60 bg-rose-50/70 px-4 text-center text-rose-700 dark:border-rose-400/25 dark:bg-rose-950/20 dark:text-rose-200" style={{ height }}>
          <CircleAlert className="mb-2 size-7" />
          <span className="text-xs font-bold">上传失败</span>
          <span className="mt-1 line-clamp-2 text-[11px]">{item.data?.error || "请重新拖入图片"}</span>
        </div>
      ) : (
        <div className={cn("flex flex-col items-center justify-center rounded-xl border", canvasDashedClass)} style={{ height }}>
          <ImagePlus className="mb-2 size-7" />
          <span className="text-xs font-semibold">拖入或粘贴图片</span>
        </div>
      )}
      <div className={cn("min-w-0 truncate pr-8 text-xs", canvasLabelClass)} title={images[0]?.name || item.name || `${images.length} 张图片`}>
        {uploading ? `上传中 ${uploadProgress}%` : images[0]?.name || item.name || `${images.length} 张图片`}
      </div>
      <Dialog open={showAllImages} onOpenChange={setShowAllImages}>
        <DialogContent className={cn("w-[min(92vw,780px)] max-w-none rounded-2xl p-0", canvasPanelClass)}>
          <DialogTitle className="sr-only">全部图片</DialogTitle>
          <DialogDescription className="sr-only">查看当前 Image 节点中的全部图片。</DialogDescription>
          <div className="border-b border-border px-4 py-3 text-sm font-black dark:border-slate-800">
            Image 图片
          </div>
          <div className="max-h-[68vh] overflow-auto p-4">
            <CanvasImageStrip images={images} onOpen={onOpenImage} onDelete={onDeleteImage} className="grid-cols-2 sm:grid-cols-3 md:grid-cols-4" />
          </div>
        </DialogContent>
      </Dialog>
    </div>
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

function GroupNodeBody({
  canvas,
  item,
  onOpenImage,
  lightweight,
}: {
  canvas: SmartCanvasDocument;
  item: SmartCanvasItem;
  onOpenImage: (image: CanvasImageRef) => void;
  lightweight: boolean;
}) {
  const members = groupMemberItems(canvas, item);
  const counts = smartCanvasGroupCounts(canvas, item);
  const images = expandedCanvasImagesFromItem(canvas, item);
  const prompts = members
    .map((member) => ({
      id: member.id,
      name: nodeTitle(member),
      text: nodePromptForCanvas(canvas, member).trim(),
    }))
    .filter((entry) => entry.text);

  return (
    <div className="space-y-3 p-3 pb-8" data-node-interactive="true" onPointerDown={stopNodeInteraction}>
      <div className={cn("rounded-xl border p-3 text-xs", canvasDashedClass)}>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-lg font-black text-foreground dark:text-slate-100">{counts.total}</div>
            <div>成员</div>
          </div>
          <div>
            <div className="text-lg font-black text-foreground dark:text-slate-100">{counts.images}</div>
            <div>图片</div>
          </div>
          <div>
            <div className="text-lg font-black text-foreground dark:text-slate-100">{counts.prompts}</div>
            <div>文本</div>
          </div>
        </div>
        <div className="mt-2 leading-5">把节点拖进组框会自动加入；连接到 图片生成、AI 提示词或循环时，会展开组内图片和文本。</div>
      </div>

      {images.length > 0 ? <CanvasImageStrip images={images} limit={4} onOpen={onOpenImage} className="grid-cols-4" lightweight={lightweight} /> : null}

      {prompts.length > 0 ? (
        <div className="space-y-1">
          {prompts.slice(0, 2).map((entry) => (
            <div key={entry.id} className="rounded-xl border border-sky-500/20 bg-sky-500/8 px-3 py-2 text-xs font-semibold text-foreground dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-slate-100" title={`${entry.name}: ${entry.text}`}>
              <div className={cn("mb-1 truncate text-[10px] font-black uppercase tracking-[0.12em]", canvasAccentTextClass)}>{entry.name}</div>
              <div className="line-clamp-2 whitespace-pre-wrap break-words">{entry.text}</div>
            </div>
          ))}
          {prompts.length > 2 ? <div className={cn("rounded-xl border px-3 py-2 text-xs font-bold", canvasDashedClass)}>还有 {prompts.length - 2} 个文本成员</div> : null}
        </div>
      ) : null}
    </div>
  );
}

function PromptNodeBody({
  item,
  lightweight,
  mentionOpen,
  mentionItems,
  onUpdateData,
  onMentionToggle,
  onOpenTextAssets,
  onAddMention,
}: {
  item: SmartCanvasItem;
  lightweight: boolean;
  mentionOpen: boolean;
  mentionItems: CanvasImageRef[];
  onUpdateData: (patch: Partial<SmartCanvasItem["data"]>) => void;
  onMentionToggle: () => void;
  onOpenTextAssets: () => void;
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
        <div className="flex min-w-0 items-center gap-1.5">
          <Button type="button" size="sm" variant="outline" className={cn("h-7 rounded-lg px-2 text-xs", canvasGhostButtonClass)} onClick={onMentionToggle}>
            @图片
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn("h-7 rounded-lg px-2 text-xs", canvasGhostButtonClass)}
            onClick={onOpenTextAssets}
            title="打开文本素材库"
            aria-label="打开文本素材库"
          >
            <Files className="size-3.5" />
            素材
          </Button>
        </div>
        <span className={cn("text-[11px] font-semibold", canvasAccentTextClass)}>{(item.data?.prompt || "").length} / 20,000</span>
      </div>
      {inputImages.length > 0 ? <CanvasImageStrip images={inputImages} limit={4} className="mt-2 grid-cols-4" lightweight={lightweight} /> : null}
      {mentionOpen ? (
        <MentionPicker images={mentionItems} onAdd={onAddMention} />
      ) : null}
    </div>
  );
}

function TextAssetPickerDialog({
  open,
  activeTeam,
  onOpenChange,
  onInsert,
}: {
  open: boolean;
  activeTeam: TeamSummary | null;
  onOpenChange: (open: boolean) => void;
  onInsert: (assets: ManagedTextAsset[]) => void;
}) {
  const [scope, setScope] = useState<SmartCanvasTextAssetScope>("mine");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [items, setItems] = useState<ManagedTextAsset[]>([]);
  const [nextCursor, setNextCursor] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [contentInput, setContentInput] = useState("");
  const [saving, setSaving] = useState(false);
  const requestIdRef = useRef(0);
  const canCreateInScope = scope !== "team" || canManageTeamTextAssets(activeTeam);

  const loadTextAssets = useCallback(async (
    options: { append?: boolean; cursor?: string; scope?: SmartCanvasTextAssetScope; search?: string } = {},
  ) => {
    const requestId = ++requestIdRef.current;
    const targetScope = options.scope || scope;
    const targetSearch = options.search ?? searchQuery;
    if (targetScope === "team" && !activeTeam?.id) {
      setItems([]);
      setNextCursor("");
      setHasMore(false);
      setLoading(false);
      setLoadingMore(false);
      return;
    }
    if (options.append) {
      setLoadingMore(true);
    } else {
      setItems([]);
      setNextCursor("");
      setHasMore(false);
      setLoading(true);
    }
    try {
      const result = await fetchManagedTextAssets({
        scope: canvasTextAssetScope(targetScope),
        team_id: targetScope === "team" ? activeTeam?.id || "" : "",
        search: targetSearch,
        page_size: CANVAS_TEXT_ASSET_PAGE_SIZE,
        cursor: options.cursor || "",
      });
      if (requestId !== requestIdRef.current) {
        return;
      }
      setItems((current) => options.append ? [
        ...current,
        ...result.items.filter((item) => !current.some((existing) => existing.id === item.id)),
      ] : result.items);
      setNextCursor(result.next_cursor);
      setHasMore(result.has_more);
    } catch (error) {
      if (requestId === requestIdRef.current) {
        toast.error(error instanceof Error ? error.message : "加载文本素材失败");
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [activeTeam?.id, scope, searchQuery]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (scope === "team" && !activeTeam?.id) {
      setScope("mine");
      return;
    }
    setSelectedIds([]);
    void loadTextAssets();
  }, [activeTeam?.id, loadTextAssets, open, scope]);

  const changeScope = (nextScope: SmartCanvasTextAssetScope) => {
    if (nextScope === "team" && !activeTeam?.id) {
      return;
    }
    requestIdRef.current += 1;
    setScope(nextScope);
    setSelectedIds([]);
    setItems([]);
    setNextCursor("");
    setHasMore(false);
  };

  const applySearch = () => {
    const query = searchInput.trim();
    requestIdRef.current += 1;
    setSelectedIds([]);
    setItems([]);
    setNextCursor("");
    setHasMore(false);
    setSearchQuery(query);
    if (query === searchQuery) {
      void loadTextAssets({ search: query });
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const createTextAsset = async () => {
    if (saving) {
      return;
    }
    const content = contentInput.trim();
    if (!content) {
      toast.error("请输入文本素材内容");
      return;
    }
    if (!canCreateInScope) {
      toast.error("团队文本素材需要 owner 或 manager 维护");
      return;
    }
    setSaving(true);
    try {
      const item = await createManagedTextAsset(
        { name: nameInput.trim() || undefined, content },
        { scope: canvasTextAssetScope(scope), team_id: scope === "team" ? activeTeam?.id || "" : "" },
      );
      setItems((current) => [item, ...current.filter((existing) => existing.id !== item.id)]);
      setSelectedIds((current) => current.includes(item.id) ? current : [...current, item.id]);
      setEditorOpen(false);
      setNameInput("");
      setContentInput("");
      toast.success("文本素材已创建");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建文本素材失败");
    } finally {
      setSaving(false);
    }
  };

  const confirmSelection = () => {
    const byId = new Map(items.map((item) => [item.id, item]));
    const selected = selectedIds.map((id) => byId.get(id)).filter((item): item is ManagedTextAsset => Boolean(item));
    if (!selected.length) {
      toast.error("先选择文本素材");
      return;
    }
    onInsert(selected);
    onOpenChange(false);
    setSelectedIds([]);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex h-[min(84dvh,720px)] w-[min(92vw,760px)] max-w-none flex-col overflow-hidden rounded-2xl p-0" data-node-interactive="true" onPointerDown={stopNodeInteraction}>
          <DialogHeader className="border-b border-border px-5 pt-5 pr-12 pb-4">
            <DialogTitle>文本素材库</DialogTitle>
            <DialogDescription>选择后会追加到当前 Prompt 节点。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 border-b border-border px-5 py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    applySearch();
                  }
                }}
                placeholder="搜索文本素材..."
                className="h-9 rounded-lg"
              />
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" className="h-9 rounded-lg" onClick={applySearch} disabled={loading}>
                  {loading ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                  搜索
                </Button>
                <Button
                  variant="outline"
                  className="h-9 rounded-lg"
                  onClick={() => setEditorOpen(true)}
                  disabled={!canCreateInScope}
                  title={canCreateInScope ? "新建文本素材" : "团队文本素材需要 owner 或 manager 维护"}
                >
                  <Type className="size-4" />
                  新建
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                <Button variant={scope === "mine" ? "default" : "outline"} size="sm" className="h-8 rounded-lg" onClick={() => changeScope("mine")}>
                  个人
                </Button>
                {activeTeam?.id ? (
                  <Button variant={scope === "team" ? "default" : "outline"} size="sm" className="h-8 rounded-lg" onClick={() => changeScope("team")}>
                    团队
                  </Button>
                ) : null}
              </div>
              <div className="text-xs text-muted-foreground">已选 {selectedIds.length} 条</div>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {loading ? (
              <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
                <LoaderCircle className="mr-2 size-4 animate-spin" />
                正在加载文本素材
              </div>
            ) : items.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {items.map((item) => {
                  const selected = selectedIds.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={cn(
                        "grid min-h-32 gap-2 rounded-lg border bg-background p-3 text-left transition hover:border-sky-500/60",
                        selected ? "border-sky-500 ring-2 ring-sky-500/20" : "border-border",
                      )}
                      onClick={() => toggleSelected(item.id)}
                      title={item.name}
                    >
                      <span className="flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-foreground">{item.name}</span>
                          <span className="block text-[11px] text-muted-foreground">{formatCanvasTextAssetTime(item.updated_at)}</span>
                        </span>
                        <span
                          aria-hidden="true"
                          className={cn(
                            "flex size-5 shrink-0 items-center justify-center rounded-md border text-[12px] font-black",
                            selected ? "border-sky-500 bg-sky-500 text-white" : "border-border text-transparent",
                          )}
                        >
                          <Check className="size-3.5" />
                        </span>
                      </span>
                      <span className="line-clamp-4 whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">
                        {item.preview || item.content}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                当前范围没有文本素材
              </div>
            )}
            {hasMore ? (
              <div className="mt-4 flex justify-center">
                <Button variant="outline" className="h-9 rounded-lg" onClick={() => void loadTextAssets({ append: true, cursor: nextCursor })} disabled={loadingMore}>
                  {loadingMore ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                  加载更多
                </Button>
              </div>
            ) : null}
          </div>
          <DialogFooter className="border-t border-border px-5 py-4">
            <Button variant="outline" className="h-10 rounded-lg" onClick={() => onOpenChange(false)}>取消</Button>
            <Button className="h-10 rounded-lg" onClick={confirmSelection} disabled={selectedIds.length === 0}>追加到 Prompt</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={editorOpen} onOpenChange={(nextOpen) => (!nextOpen && saving ? undefined : setEditorOpen(nextOpen))}>
        <DialogContent className="w-[min(92vw,560px)] rounded-2xl" data-node-interactive="true" onPointerDown={stopNodeInteraction}>
          <DialogHeader>
            <DialogTitle>新建文本素材</DialogTitle>
            <DialogDescription>保存后可在当前范围内复用。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">名称</span>
              <Input
                value={nameInput}
                onChange={(event) => setNameInput(event.target.value)}
                maxLength={80}
                className="h-10 rounded-lg"
                placeholder="留空时自动取正文首行"
                disabled={saving}
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">内容</span>
              <Textarea
                value={contentInput}
                onChange={(event) => setContentInput(event.target.value)}
                maxLength={20000}
                className="min-h-44 rounded-lg"
                placeholder="输入可复用的提示词、文案或要求。"
                disabled={saving}
              />
            </label>
            <div className="text-right text-xs text-muted-foreground">{contentInput.length}/20000</div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-10 rounded-lg" onClick={() => setEditorOpen(false)} disabled={saving}>取消</Button>
            <Button className="h-10 rounded-lg" onClick={() => void createTextAsset()} disabled={saving || !contentInput.trim()}>
              {saving ? <LoaderCircle className="size-4 animate-spin" /> : <Type className="size-4" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function LlmNodeBody({
  canvas,
  item,
  models,
  running,
  lightweight,
  onUpdateData,
  onRunLlm,
  onStopNode,
}: {
  canvas: SmartCanvasDocument;
  item: SmartCanvasItem;
  models: CanvasModelOption[];
  running: boolean;
  lightweight: boolean;
  onUpdateData: (patch: Partial<SmartCanvasItem["data"]>) => void;
  onRunLlm: () => void;
  onStopNode: () => void;
}) {
  const upstream = incomingItems(canvas, item.id);
  const upstreamTexts = upstream
    .map((node) => ({
      id: node.id,
      name: nodeTitle(node),
      text: nodePromptForCanvas(canvas, node).trim(),
    }))
    .filter((entry) => entry.text);
  const upstreamImages = dedupeCanvasImageRefs(upstream.flatMap((node) => nodeInputImagesForCanvas(canvas, node)));
  const outputText = item.data?.output?.text || "";
  const nodeRunning = isActiveTask(item.data?.status);
  const [outputCopyState, setOutputCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [outputDialogOpen, setOutputDialogOpen] = useState(false);
  const outputCopyResetTimerRef = useRef<number | null>(null);
  const availableModels = models.filter((model) => canvasModelHasCapability(model, "chat") || model.kind === "text" || model.kind === "both" || model.id === "auto");
  const hasInput = upstreamTexts.length > 0 || upstreamImages.length > 0 || Boolean((item.data?.prompt || "").trim());
  const outputCharacterCount = outputText.length.toLocaleString("zh-CN");
  const copyOutputText = useCallback(async () => {
    if (!outputText) return;
    if (outputCopyResetTimerRef.current !== null) {
      window.clearTimeout(outputCopyResetTimerRef.current);
    }
    try {
      await navigator.clipboard.writeText(outputText);
      setOutputCopyState("copied");
      outputCopyResetTimerRef.current = window.setTimeout(() => setOutputCopyState("idle"), 1200);
    } catch {
      setOutputCopyState("failed");
      outputCopyResetTimerRef.current = window.setTimeout(() => setOutputCopyState("idle"), 2200);
    }
  }, [outputText]);

  useEffect(() => {
    setOutputCopyState("idle");
  }, [outputText]);

  useEffect(() => () => {
    if (outputCopyResetTimerRef.current !== null) {
      window.clearTimeout(outputCopyResetTimerRef.current);
    }
  }, []);

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
          <CanvasImageStrip images={upstreamImages} limit={4} className="grid-cols-5" lightweight={lightweight} />
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
              <SelectItem key={model.id} value={model.id} textValue={displayModelLabel(model.id, model.name || model.id)}>
                <ModelProviderOptionLabel model={model.id} label={model.name || model.id} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className={cn("text-[11px] font-black uppercase tracking-[0.14em]", canvasLabelClass)}>Output</div>
          {outputText && !nodeRunning ? (
            <div className="flex min-w-0 items-center gap-1">
              <span className={cn("truncate text-[10px] font-semibold", outputCopyState === "failed" ? "text-rose-600 dark:text-rose-300" : canvasSubtleTextClass)}>
                {outputCopyState === "failed" ? "复制失败，请手动选择文本" : `${outputCharacterCount} 字符`}
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className={cn("h-7 shrink-0 rounded-lg px-2 text-[11px] font-black", canvasIconButtonClass)}
                data-node-interactive="true"
                onPointerDown={stopNodeInteraction}
                onClick={() => setOutputDialogOpen(true)}
                title="查看完整提示词输出"
              >
                <FileText className="size-3.5" />
                全文
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className={cn("size-7 shrink-0 rounded-lg", canvasIconButtonClass)}
                data-node-interactive="true"
                onPointerDown={stopNodeInteraction}
                onClick={() => void copyOutputText()}
                title={outputCopyState === "copied" ? "已复制" : "复制提示词输出"}
                aria-label={outputCopyState === "copied" ? "已复制" : "复制提示词输出"}
              >
                {outputCopyState === "copied" ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
              </Button>
            </div>
          ) : null}
        </div>
        <div className={cn("min-h-24 rounded-xl border p-3 text-xs leading-relaxed", outputText ? "border-border bg-background/70 text-foreground dark:border-slate-700 dark:bg-slate-950/45 dark:text-slate-100" : canvasDashedClass)}>
          {nodeRunning ? (
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex min-w-0 items-center gap-2">
                <LoaderCircle className="size-4 shrink-0 animate-spin" />
                <span className="truncate">运行中</span>
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 shrink-0 rounded-lg border-rose-300/70 bg-white/80 px-2 text-xs font-black text-rose-600 hover:bg-rose-50 dark:border-rose-400/30 dark:bg-slate-950/50 dark:text-rose-100"
                onClick={onStopNode}
              >
                <X className="mr-1 size-3.5" />
                中断
              </Button>
            </div>
          ) : outputText ? (
            <div className="max-h-40 overflow-y-auto overscroll-contain whitespace-pre-wrap break-words pr-1 select-text" onWheel={(event) => event.stopPropagation()}>
              {outputText}
            </div>
          ) : (
            "运行后会输出文本，可连接到 图片生成 节点"
          )}
        </div>
        <Dialog open={outputDialogOpen} onOpenChange={setOutputDialogOpen}>
          <DialogContent className={cn("w-[min(92vw,760px)] max-w-none rounded-2xl p-0", canvasPanelClass)} data-node-interactive="true" onPointerDown={stopNodeInteraction}>
            <div className="border-b border-border px-4 py-3 pr-12 dark:border-slate-800 sm:pr-14">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <DialogTitle className="text-base font-black">提示词输出全文</DialogTitle>
                  <DialogDescription className={cn("mt-1 text-xs", canvasSubtleTextClass)}>
                    {outputCharacterCount} 字符
                  </DialogDescription>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={cn("h-8 shrink-0 rounded-lg px-2 text-xs font-black", canvasGhostButtonClass)}
                  onClick={() => void copyOutputText()}
                >
                  {outputCopyState === "copied" ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                  {outputCopyState === "copied" ? "已复制" : "复制"}
                </Button>
              </div>
              {outputCopyState === "failed" ? <div className="mt-2 text-xs font-semibold text-rose-600 dark:text-rose-300">复制失败，请手动选择文本。</div> : null}
            </div>
            <div className="max-h-[min(68vh,560px)] overflow-y-auto overscroll-contain p-4 text-sm leading-relaxed" onWheel={(event) => event.stopPropagation()}>
              <pre className="whitespace-pre-wrap break-words font-sans text-foreground select-text dark:text-slate-100">{outputText}</pre>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <CanvasRunInsight item={item} />
      {nodeRunning ? (
        <Button
          type="button"
          variant="outline"
          className="h-10 w-full rounded-xl border-rose-300/70 font-bold text-rose-600 hover:bg-rose-50 dark:border-rose-400/30 dark:text-rose-100 dark:hover:bg-rose-500/10"
          onClick={onStopNode}
        >
          <X className="size-4" />
          中断生成提示词
        </Button>
      ) : (
        <Button
          type="button"
          className="h-10 w-full rounded-xl bg-primary font-bold text-primary-foreground hover:bg-primary/90 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
          disabled={running || !hasInput}
          onClick={onRunLlm}
        >
          {running ? <LoaderCircle className="size-4 animate-spin" /> : <Bot className="size-4" />}
          生成提示词
        </Button>
      )}
    </div>
  );
}

function canvasModelHasCapability(model: CanvasModelOption, capability: "chat" | "image" | "video") {
  return Array.isArray(model.capabilities) && model.capabilities.includes(capability);
}

function loopPromptPreviewForCanvas(canvas: SmartCanvasDocument, loop: SmartCanvasItem) {
  return [
    ...incomingItems(canvas, loop.id).map((node) => nodePromptForCanvas(canvas, node)),
    loop.data?.prompt || "",
  ].map((value) => String(value || "").trim()).filter(Boolean).join("\n\n");
}

function LoopNodeBody({
  canvas,
  item,
  lightweight,
  onConnectLlmImagesToLoop,
  onStopLoop,
  onUpdateData,
}: {
  canvas: SmartCanvasDocument;
  item: SmartCanvasItem;
  lightweight: boolean;
  onConnectLlmImagesToLoop: () => void;
  onStopLoop: () => void;
  onUpdateData: (patch: Partial<SmartCanvasItem["data"]>) => void;
}) {
  const upstream = incomingItems(canvas, item.id);
  const inputImages = dedupeCanvasImageRefs(upstream.flatMap((node) => nodeInputImagesForCanvas(canvas, node)));
  const inputTexts = upstream.map((node) => nodePromptForCanvas(canvas, node).trim()).filter(Boolean);
  const llmReferenceImageSources = upstream
    .filter((node) => node.type === "llm")
    .map((node) => {
      const imagesFromNode = dedupeCanvasImageRefs(incomingItems(canvas, node.id).flatMap((source) => nodeInputImagesForCanvas(canvas, source)));
      return {
        id: node.id,
        name: node.name || "AI 提示词",
        images: imagesFromNode,
      };
    })
    .filter((source) => source.images.length > 0);
  const inputImageKeys = new Set(inputImages.map(canvasImageKey));
  const missingLlmReferenceImages = dedupeCanvasImageRefs(llmReferenceImageSources.flatMap((source) => source.images))
    .filter((image) => !inputImageKeys.has(canvasImageKey(image)));
  const llmReferenceImageCountLabel = missingLlmReferenceImages.length === 1 ? "一张图" : `${missingLlmReferenceImages.length} 张图`;
  const downstreamGenerators = canvas.edges
    .filter((edge) => edge.source === item.id)
    .map((edge) => canvas.nodes.find((node) => node.id === edge.target))
    .filter((node): node is SmartCanvasItem => node?.type === "image_generation" || node?.type === "video_generation");
  const mode = item.data?.loop_mode === "images" ? "images" : "repeat";
  const count = Math.max(1, Math.min(10, Number(item.data?.loop_count || 3)));
  const total = mode === "images" ? Math.max(1, inputImages.length) : count;
  const savedProgress = item.data?.loop_progress;
  const loopRaw = item.data?.output?.raw?.mode === "loop" ? item.data.output.raw : null;
  const progress = loopRaw
    ? {
        total: loopRawNumber(loopRaw, "total", savedProgress?.total || total),
        current: loopRawNumber(loopRaw, "current", savedProgress?.current || 0),
        completed: loopRawNumber(loopRaw, "completed", savedProgress?.completed || 0),
        failed: loopRawNumber(loopRaw, "failed", savedProgress?.failed || 0),
      }
    : savedProgress;
  const outputImages = item.data?.output?.images || [];
  const nodeRunning = isActiveTask(item.data?.status);

  return (
    <div className="space-y-3 p-3" data-node-interactive="true" onPointerDown={stopNodeInteraction}>
      <div className="grid grid-cols-[92px_1fr] gap-2">
        <Select value={mode} onValueChange={(loopMode) => onUpdateData({ loop_mode: loopMode as "repeat" | "images" })}>
          <SelectTrigger className={canvasSelectClass}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="repeat">重复</SelectItem>
            <SelectItem value="images">逐图</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="number"
          min={1}
          max={10}
          value={count}
          disabled={mode === "images"}
          onChange={(event) => onUpdateData({ loop_count: Math.max(1, Math.min(10, Number(event.target.value) || 1)) })}
          className={cn("h-9 rounded-xl text-center text-xs", canvasFieldClass)}
        />
      </div>

      <div className={cn("rounded-xl border p-3 text-xs", canvasDashedClass)}>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-lg font-black text-foreground dark:text-slate-100">{inputTexts.length}</div>
            <div>文本</div>
          </div>
          <div>
            <div className="text-lg font-black text-foreground dark:text-slate-100">{inputImages.length}</div>
            <div>图片</div>
          </div>
          <div>
            <div className="text-lg font-black text-foreground dark:text-slate-100">{downstreamGenerators.length}</div>
            <div>下游</div>
          </div>
        </div>
        <div className="mt-2 leading-5">
          {mode === "images" ? "按上游图片逐张提交到下游 图片生成，最多 10 张。" : `按相同输入一次生成 ${count} 张。`}
        </div>
      </div>

      {inputImages.length > 0 ? <CanvasImageStrip images={inputImages} limit={4} className="grid-cols-5" lightweight={lightweight} /> : null}
      {missingLlmReferenceImages.length > 0 ? (
        <div className="rounded-xl border border-amber-400/35 bg-amber-400/10 px-3 py-2 text-xs text-amber-800 dark:border-amber-300/25 dark:bg-amber-300/10 dark:text-amber-100">
          <div className="font-semibold">上游引用了 {llmReferenceImageCountLabel}，是否点击连线这些图片？</div>
          <Button
            type="button"
            size="sm"
            className="mt-2 h-8 rounded-lg bg-amber-400 px-3 text-xs font-black text-amber-950 shadow-sm shadow-amber-950/10 hover:bg-amber-300 dark:bg-amber-300 dark:text-amber-950 dark:hover:bg-amber-200"
            onClick={onConnectLlmImagesToLoop}
          >
            <Link2 className="mr-1.5 size-3.5" />
            连接这些图片
          </Button>
        </div>
      ) : null}

      {nodeRunning ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-xs font-bold text-sky-700 dark:text-sky-200">
          <div className="min-w-0 truncate">
            <LoaderCircle className="mr-2 inline size-4 animate-spin" />
            循环中 {progress?.current || 0}/{progress?.total || total}，成功 {progress?.completed || 0}，失败 {progress?.failed || 0}
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 shrink-0 rounded-lg border-sky-300/70 bg-white/80 px-2 text-xs font-black text-sky-700 hover:bg-sky-50 dark:border-sky-400/30 dark:bg-slate-950/50 dark:text-sky-100"
            onClick={onStopLoop}
          >
            <X className="mr-1 size-3.5" />
            中断
          </Button>
        </div>
      ) : progress?.total ? (
        <div className="rounded-xl border border-border bg-background/70 px-3 py-2 text-xs font-semibold text-muted-foreground dark:border-slate-700 dark:bg-slate-950/45">
          上次运行：成功 {progress.completed}/{progress.total}，失败 {progress.failed}
        </div>
      ) : null}

      {outputImages.length > 0 ? <CanvasImageStrip images={outputImages} limit={4} className="grid-cols-4" lightweight={lightweight} /> : null}
      <CanvasRunInsight item={item} />
    </div>
  );
}

function GeneratorNodeBody({
  canvas,
  item,
  models,
  running,
  lightweightMedia,
  onUpdateData,
  onRunGenerator,
  onStopNode,
  onConnectLlmImagesToGenerator,
  onOpenImage,
  onDeleteDirectImage,
}: {
  canvas: SmartCanvasDocument;
  item: SmartCanvasItem;
  models: CanvasModelOption[];
  running: boolean;
  lightweightMedia: boolean;
  onUpdateData: (patch: Partial<SmartCanvasItem["data"]>) => void;
  onRunGenerator: () => void;
  onStopNode: () => void;
  onConnectLlmImagesToGenerator: () => void;
  onOpenImage: (image: CanvasImageRef) => void;
  onDeleteDirectImage: (image: CanvasImageRef) => void;
}) {
  const [imageRatioOpen, setImageRatioOpen] = useState(false);
  const upstream = incomingItems(canvas, item.id);
  const upstreamPrompts = upstream
    .filter((node) => node.type === "prompt" || node.type === "llm" || node.type === "loop" || node.type === "group")
    .map((node) => ({
      id: node.id,
      name: nodeTitle(node),
      text: (node.type === "loop" ? loopPromptPreviewForCanvas(canvas, node) : nodePromptForCanvas(canvas, node)).trim(),
    }))
    .filter((entry) => entry.text);
  const mergedPromptPreview = [
    ...upstreamPrompts.map((entry) => entry.text),
    item.data?.prompt || "",
  ].map((value) => value.trim()).filter(Boolean).join("\n\n");
  const upstreamImages = upstream.flatMap((node) => nodeInputImagesForCanvas(canvas, node));
  const upstreamImageKeys = new Set(dedupeCanvasImageRefs(upstreamImages).map(canvasImageKey));
  const images = dedupeCanvasImageRefs([
    ...(item.data?.input_images || []).filter((image) => !upstreamImageKeys.has(canvasImageKey(image))),
    ...upstreamImages,
  ]);
  const llmReferenceImageSources = upstream
    .filter((node) => node.type === "llm")
    .map((node) => {
      const imagesFromNode = dedupeCanvasImageRefs(incomingItems(canvas, node.id).flatMap((source) => nodeInputImagesForCanvas(canvas, source)))
        .filter((image) => !upstreamImageKeys.has(canvasImageKey(image)));
      return {
        id: node.id,
        name: node.name || "AI 提示词",
        images: imagesFromNode,
      };
    })
    .filter((source) => source.images.length > 0);
  const llmReferenceImages = dedupeCanvasImageRefs(llmReferenceImageSources.flatMap((source) => source.images));
  const missingLlmReferenceImages = llmReferenceImages.filter((image) => !upstreamImageKeys.has(canvasImageKey(image)));
  const llmReferenceImageCountLabel = missingLlmReferenceImages.length === 1 ? "一张图" : `${missingLlmReferenceImages.length} 张图`;
  const outputImages = item.data?.output?.images || [];
  const nodeRunning = isActiveTask(item.data?.status);
  const imageModel = item.data?.model || "auto";
  const proStudioState = normalizeProStudioState(item.data?.pro_studio_state as Partial<ProStudioState> | undefined, "free_canvas");
  const proStudioEnabled = item.data?.professional_mode === true || proStudioState.enabled;
  const activeImageModel = proStudioEnabled ? OFFICIAL_IMAGE_MODEL : imageModel;
  const imageCount = Math.max(1, Math.min(10, Number(item.data?.n || 1)));
  const hasInputImages = images.length > 0;
  const ratioValue: CanvasImageRatioValue = hasInputImages && (!item.data?.size_user_modified || !String(item.data?.size || "").trim())
    ? "auto"
    : canvasImageRatioValue(item.data?.size);
  const pixelIconSizeSelected = isPixelIconSize(ratioValue);
  const imageResolutionValue = pixelIconSizeSelected ? "pixel" : normalizeCanvasImageResolution(item.data?.image_resolution) || "unspecified";
  const imageResolutionOptions = hasInputImages && item.data?.image_resolution_user_modified !== true
    ? canvasImageResolutionOptions.map((option) => option.value === "unspecified" ? { ...option, label: "保持原图清晰度" } : option)
    : canvasImageResolutionOptions;
  const imageRatioOptions = hasInputImages
    ? [
        { value: "auto", label: "原图", description: "保持输入图片比例", section: "输入图片", glyphValue: "auto" },
        ...canvasImageRatioOptions,
      ] satisfies ReadonlyArray<ImageRatioPickerOption<CanvasImageRatioValue>>
    : canvasImageRatioOptions satisfies ReadonlyArray<ImageRatioPickerOption<CanvasImageRatioValue>>;
  const imageRatioLabel = imageRatioOptions.find((option) => option.value === ratioValue)?.label || ratioValue;
  const outputControlsSupported = supportsImageOutputControls(activeImageModel);
  const imageQualitySupported = supportsImageQuality(activeImageModel);
  const outputFormat = normalizeImageOutputFormat(item.data?.output_format);
  const outputCompression = typeof item.data?.output_compression === "number" ? item.data.output_compression : undefined;
  const imageQuality = isImageQuality(item.data?.quality) ? item.data.quality : "auto";
  const setImageCount = (next: number) => onUpdateData({ n: Math.max(1, Math.min(10, Math.round(next) || 1)) });
  const setOutputCompression = (value: string) => {
    if (!value.trim()) {
      onUpdateData({ output_compression: undefined });
      return;
    }
    const numeric = Number(value);
    onUpdateData({ output_compression: Number.isFinite(numeric) ? Math.min(100, Math.max(0, Math.round(numeric))) : undefined });
  };

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
            lightweight={lightweightMedia}
          />
        ) : (
          <div className={cn("rounded-xl border px-3 py-3 text-xs", canvasDashedClass)}>连接图片节点后自动作为图生图输入</div>
        )}
        {missingLlmReferenceImages.length > 0 ? (
          <div className="mt-2 rounded-xl border border-amber-400/35 bg-amber-400/10 px-3 py-2 text-xs text-amber-800 dark:border-amber-300/25 dark:bg-amber-300/10 dark:text-amber-100">
            <div className="font-semibold">上游引用了 {llmReferenceImageCountLabel}，是否连接这些图片？</div>
            <Button
              type="button"
              size="sm"
              className="mt-2 h-8 rounded-lg bg-amber-400 px-3 text-xs font-black text-amber-950 shadow-sm shadow-amber-950/10 hover:bg-amber-300 dark:bg-amber-300 dark:text-amber-950 dark:hover:bg-amber-200"
              onClick={onConnectLlmImagesToGenerator}
            >
              <Link2 className="mr-1.5 size-3.5" />
              连接这些图片
            </Button>
          </div>
        ) : null}
      </div>
      <ProStudioPanel
        scope="canvas"
        state={proStudioState}
        onChange={(next) => onUpdateData({
          professional_mode: next.enabled,
          pro_studio_state: next,
          size: next.enabled ? next.settings.size : item.data?.size,
          image_resolution: next.enabled ? next.settings.resolution : item.data?.image_resolution,
          quality: next.enabled ? next.settings.quality : item.data?.quality,
          output_format: next.enabled ? next.settings.outputFormat : item.data?.output_format,
          output_compression: next.enabled ? next.settings.outputCompression : item.data?.output_compression,
          n: next.enabled ? next.settings.n : item.data?.n,
        })}
        fieldClassName={cn("flex h-9 min-w-0 items-center justify-between gap-2 rounded-xl border px-3 text-xs", canvasFieldClass)}
        selectTriggerClassName="h-8 min-w-0 flex-1 justify-end gap-1 border-0 bg-transparent px-0 py-0 text-right text-xs font-bold shadow-none focus-visible:ring-0 [&_svg]:size-4 [&_svg]:opacity-60 [&>span]:flex-none"
        inputClassName="h-8 min-w-0 border-0 bg-transparent px-0 text-right text-xs font-bold shadow-none focus-visible:ring-0 disabled:cursor-not-allowed"
        labelClassName={cn("text-[11px] font-bold", canvasSubtleTextClass)}
        compact
      />
      <div className="flex min-w-0 gap-2">
        <Select value={activeImageModel} onValueChange={(model) => onUpdateData({ model })} disabled={proStudioEnabled}>
          <SelectTrigger className={cn(canvasSelectClass, "min-w-0 flex-1")}>
            <SelectValue placeholder="模型" />
          </SelectTrigger>
          <SelectContent>
            {proStudioEnabled
              ? (
                  <SelectItem value={OFFICIAL_IMAGE_MODEL} textValue={OFFICIAL_IMAGE_MODEL}>
                    <ModelProviderOptionLabel model={OFFICIAL_IMAGE_MODEL} label={OFFICIAL_IMAGE_MODEL} />
                  </SelectItem>
                )
              : models.map((model) => (
                  <SelectItem key={model.id} value={model.id} textValue={displayModelLabel(model.id, model.name || model.id)}>
                    <ModelProviderOptionLabel model={model.id} label={model.name || model.id} />
                  </SelectItem>
                ))}
          </SelectContent>
        </Select>
        {!proStudioEnabled && imageModelHasSettings(activeImageModel) ? (
          <ImageModelSettingsButton
            model={activeImageModel}
            value={item.data?.image_model_settings}
            onChange={(settings) => onUpdateData({ image_model_settings: settings })}
            className={cn("h-9 shrink-0 rounded-xl border px-2 text-xs", canvasFieldClass)}
            contentClassName="z-[80]"
            buttonLabel="参数"
          />
        ) : null}
      </div>
      {!proStudioEnabled ? <div className="grid grid-cols-2 gap-2">
        <Select
          value={imageResolutionValue}
          onValueChange={(imageResolution) => onUpdateData({
            image_resolution: imageResolution === "unspecified" ? "" : imageResolution,
            image_resolution_user_modified: true,
          })}
          disabled={pixelIconSizeSelected}
        >
          <SelectTrigger className={canvasSelectClass} title={pixelIconSizeSelected ? "像素图标尺寸已固定宽高，不再叠加分辨率" : undefined}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pixelIconSizeSelected ? <SelectItem value="pixel">固定像素</SelectItem> : null}
            {imageResolutionOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ImageRatioPicker
          label="画幅/尺寸"
          value={ratioValue}
          valueLabel={imageRatioLabel}
          options={imageRatioOptions}
          open={imageRatioOpen}
          onOpenChange={setImageRatioOpen}
          onValueChange={(size) => onUpdateData({
            size: size === "auto" ? "" : size,
            size_user_modified: true,
            ...(isPixelIconSize(size) ? { image_resolution: "", image_resolution_user_modified: true } : {}),
          })}
          triggerClassName={cn(canvasSelectClass, "justify-between")}
          contentClassName="w-[min(21rem,calc(100vw-2rem))]"
        />
        {outputControlsSupported ? (
          <ImageOutputControls
            imageModel={imageModel}
            outputFormat={outputFormat}
            outputCompression={outputCompression}
            onOutputFormatChange={(output_format) => onUpdateData({ output_format })}
            onOutputCompressionChange={setOutputCompression}
            fieldClassName={cn("flex h-9 min-w-0 items-center justify-between gap-2 rounded-xl border px-3 text-xs", canvasFieldClass)}
            labelClassName={cn("text-[11px] font-bold", canvasSubtleTextClass)}
            selectTriggerClassName="h-8 min-w-0 flex-1 justify-end gap-1 border-0 bg-transparent px-0 py-0 text-right text-xs font-bold shadow-none focus-visible:ring-0 [&_svg]:size-4 [&_svg]:opacity-60 [&>span]:flex-none"
            inputClassName="h-8 min-w-0 border-0 bg-transparent px-0 text-right text-xs font-bold shadow-none focus-visible:ring-0 disabled:cursor-not-allowed"
            compressionLabel="压缩"
          />
        ) : null}
        {imageQualitySupported ? (
          <Select value={imageQuality} onValueChange={(quality) => isImageQuality(quality) && onUpdateData({ quality })}>
            <SelectTrigger className={canvasSelectClass}>
              <SelectValue placeholder="质量强度" />
            </SelectTrigger>
            <SelectContent>
              {IMAGE_QUALITY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <div className={cn("grid h-9 grid-cols-[28px_1fr_28px] overflow-hidden rounded-xl border", canvasFieldClass)}>
          <button
            type="button"
            className="flex items-center justify-center border-r border-border text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-40 dark:border-slate-700"
            disabled={imageCount <= 1}
            onClick={() => setImageCount(imageCount - 1)}
            aria-label="减少张数"
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <div className="flex min-w-0 items-center justify-center gap-1">
            <Input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={imageCount}
              onChange={(event) => setImageCount(Number(event.target.value) || 1)}
              className="h-9 w-7 rounded-none border-0 bg-transparent p-0 text-right text-xs font-bold shadow-none focus-visible:ring-0"
              aria-label="生成张数"
            />
            <span className={cn("text-[11px] font-bold", canvasSubtleTextClass)}>张</span>
          </div>
          <button
            type="button"
            className="flex items-center justify-center border-l border-border text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-40 dark:border-slate-700"
            disabled={imageCount >= 10}
            onClick={() => setImageCount(imageCount + 1)}
            aria-label="增加张数"
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      </div> : null}
      {proStudioEnabled ? (
        <ProStudioBadge proStudio={{ enabled: true, mode: proStudioState.mode === "off" ? "preset" : proStudioState.mode, intent: proStudioState.intent, quality_tier: proStudioState.qualityTier }} officialSettings={{
          model: OFFICIAL_IMAGE_MODEL,
          size: proStudioState.settings.size,
          resolution: proStudioState.settings.resolution,
          quality: proStudioState.settings.quality,
          output_format: proStudioState.settings.outputFormat,
          ...(typeof proStudioState.settings.outputCompression === "number" ? { output_compression: proStudioState.settings.outputCompression } : {}),
          background: proStudioState.settings.background,
          moderation: proStudioState.settings.moderation,
          n: proStudioState.settings.n,
        }} />
      ) : null}
      {outputImages.length > 0 ? (
        <CanvasGeneratedImagePreview
          images={outputImages}
          onOpenImage={onOpenImage}
          lightweight={lightweightMedia}
        />
      ) : null}
      <CanvasRunInsight item={item} />
      {nodeRunning ? (
        <Button
          type="button"
          variant="outline"
          className="h-10 w-full rounded-xl border-rose-300/70 font-bold text-rose-600 hover:bg-rose-50 dark:border-rose-400/30 dark:text-rose-100 dark:hover:bg-rose-500/10"
          onClick={onStopNode}
        >
          <X className="size-4" />
          中断 图片生成
        </Button>
      ) : (
        <Button
          type="button"
          className="h-10 w-full rounded-xl bg-primary font-bold text-primary-foreground hover:bg-primary/90 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
          disabled={running || !mergedPromptPreview}
          onClick={onRunGenerator}
        >
          {running ? <LoaderCircle className="size-4 animate-spin" /> : <Zap className="size-4" />}
          图片生成
        </Button>
      )}
    </div>
  );
}

function VideoGeneratorNodeBody({
  canvas,
  item,
  models,
  running,
  lightweightMedia,
  onUpdateData,
  onRunGenerator,
  onStopNode,
  onConnectLlmImagesToGenerator,
  onOpenImage,
  onDeleteDirectImage,
}: {
  canvas: SmartCanvasDocument;
  item: SmartCanvasItem;
  models: CanvasModelOption[];
  running: boolean;
  lightweightMedia: boolean;
  onUpdateData: (patch: Partial<SmartCanvasItem["data"]>) => void;
  onRunGenerator: () => void;
  onStopNode: () => void;
  onConnectLlmImagesToGenerator: () => void;
  onOpenImage: (image: CanvasImageRef) => void;
  onDeleteDirectImage: (image: CanvasImageRef) => void;
}) {
  const upstream = incomingItems(canvas, item.id);
  const upstreamPrompts = upstream
    .filter((node) => node.type === "prompt" || node.type === "llm" || node.type === "loop" || node.type === "group")
    .map((node) => ({
      id: node.id,
      name: nodeTitle(node),
      text: (node.type === "loop" ? loopPromptPreviewForCanvas(canvas, node) : nodePromptForCanvas(canvas, node)).trim(),
    }))
    .filter((entry) => entry.text);
  const mergedPromptPreview = [
    ...upstreamPrompts.map((entry) => entry.text),
    item.data?.prompt || "",
  ].map((value) => value.trim()).filter(Boolean).join("\n\n");
  const upstreamImages = upstream.flatMap((node) => nodeInputImagesForCanvas(canvas, node));
  const upstreamImageKeys = new Set(dedupeCanvasImageRefs(upstreamImages).map(canvasImageKey));
  const images = dedupeCanvasImageRefs([
    ...(item.data?.input_images || []).filter((image) => !upstreamImageKeys.has(canvasImageKey(image))),
    ...upstreamImages,
  ]);
  const llmReferenceImageSources = upstream
    .filter((node) => node.type === "llm")
    .map((node) => {
      const imagesFromNode = dedupeCanvasImageRefs(incomingItems(canvas, node.id).flatMap((source) => nodeInputImagesForCanvas(canvas, source)))
        .filter((image) => !upstreamImageKeys.has(canvasImageKey(image)));
      return {
        id: node.id,
        name: node.name || "AI 提示词",
        images: imagesFromNode,
      };
    })
    .filter((source) => source.images.length > 0);
  const llmReferenceImages = dedupeCanvasImageRefs(llmReferenceImageSources.flatMap((source) => source.images));
  const missingLlmReferenceImages = llmReferenceImages.filter((image) => !upstreamImageKeys.has(canvasImageKey(image)));
  const outputVideos = item.data?.output?.videos || [];
  const nodeRunning = isActiveTask(item.data?.status);
  const modelValue = item.data?.model || (models[0]?.id ?? "");
  const profile = canvasVideoModelProfile(modelValue);
  const clampDuration = (next: number) => Math.max(profile.minDuration, Math.min(profile.maxDuration, Math.round(next) || profile.minDuration));
  const duration = clampDuration(Number(item.data?.duration || profile.minDuration));
  const setDuration = (next: number) => onUpdateData({ duration: clampDuration(next) });
  const durationStep = profile.minDuration === 5 && profile.maxDuration === 10 ? 5 : 1;
  const ratioOptions = canvasVideoRatioOptions.filter((option) => profile.ratios.includes(option.value));
  const resolutionOptions = canvasVideoResolutionOptions.filter((option) => profile.resolutions.includes(option.value));
  const resolutionValue = resolutionOptions.some((option) => option.value === item.data?.resolution) ? String(item.data?.resolution) : "auto";
  const aspectRatioValue = ratioOptions.some((option) => option.value === item.data?.aspect_ratio) ? String(item.data?.aspect_ratio) : "16:9";

  return (
    <div className="space-y-3 p-3" data-node-interactive="true" onPointerDown={stopNodeInteraction}>
      <div>
        <div className={cn("mb-1 text-[11px] font-black uppercase tracking-[0.14em]", canvasLabelClass)}>Prompts</div>
        {upstreamPrompts.length > 0 ? (
          <div className="mb-2 space-y-1">
            {upstreamPrompts.slice(0, 2).map((entry) => (
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
          </div>
        ) : null}
        <Textarea
          value={item.data?.prompt || ""}
          onChange={(event) => onUpdateData({ prompt: event.target.value })}
          className={cn("h-14 resize-none rounded-xl text-xs", canvasFieldClass)}
          placeholder={upstreamPrompts.length > 0 ? "补充视频提示词，会追加到已连接 Prompt 后..." : "描述镜头、主体、动作和风格..."}
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
            lightweight={lightweightMedia}
          />
        ) : (
          <div className={cn("rounded-xl border px-3 py-3 text-xs", canvasDashedClass)}>连接图片节点后作为首帧/参考图输入</div>
        )}
        {missingLlmReferenceImages.length > 0 ? (
          <div className="mt-2 rounded-xl border border-amber-400/35 bg-amber-400/10 px-3 py-2 text-xs text-amber-800 dark:border-amber-300/25 dark:bg-amber-300/10 dark:text-amber-100">
            <div className="font-semibold">上游 AI 提示词引用了 {missingLlmReferenceImages.length} 张图</div>
            <Button
              type="button"
              size="sm"
              className="mt-2 h-8 rounded-lg bg-amber-400 px-3 text-xs font-black text-amber-950 shadow-sm shadow-amber-950/10 hover:bg-amber-300 dark:bg-amber-300 dark:text-amber-950 dark:hover:bg-amber-200"
              onClick={onConnectLlmImagesToGenerator}
            >
              <Link2 className="mr-1.5 size-3.5" />
              连接这些图片
            </Button>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-[76px_1fr] gap-2">
        <Select value="api" disabled>
          <SelectTrigger className={canvasSelectClass}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="api">生成</SelectItem>
          </SelectContent>
        </Select>
        <Select value={modelValue || undefined} onValueChange={(model) => onUpdateData({ model, duration: canvasVideoModelProfile(model).minDuration })}>
          <SelectTrigger className={canvasSelectClass}>
            <SelectValue placeholder={models.length > 0 ? "视频模型" : "暂无视频模型"} />
          </SelectTrigger>
          <SelectContent>
            {models.map((model) => (
              <SelectItem key={model.id} value={model.id} textValue={displayModelLabel(model.id, model.name || model.id)}>
                <ModelProviderOptionLabel model={model.id} label={model.name || model.id} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-[96px_1fr_88px] gap-2">
        <Select value={aspectRatioValue} onValueChange={(aspectRatio) => onUpdateData({ aspect_ratio: aspectRatio })}>
          <SelectTrigger className={canvasSelectClass}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ratioOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={resolutionValue} onValueChange={(resolution) => onUpdateData({ resolution: resolution === "auto" ? "" : resolution })}>
          <SelectTrigger className={canvasSelectClass}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {resolutionOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className={cn("grid h-9 grid-cols-[28px_1fr_28px] overflow-hidden rounded-xl border", canvasFieldClass)}>
          <button
            type="button"
            className="flex items-center justify-center border-r border-border text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-40 dark:border-slate-700"
            disabled={duration <= profile.minDuration}
            onClick={() => setDuration(duration - durationStep)}
            aria-label="减少时长"
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <Input
            type="number"
            min={profile.minDuration}
            max={profile.maxDuration}
            value={duration}
            onChange={(event) => setDuration(Number(event.target.value) || 5)}
            className="h-9 rounded-none border-0 bg-transparent p-0 text-center text-xs font-bold shadow-none focus-visible:ring-0"
            aria-label="视频时长"
          />
          <button
            type="button"
            className="flex items-center justify-center border-l border-border text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-40 dark:border-slate-700"
            disabled={duration >= profile.maxDuration}
            onClick={() => setDuration(duration + durationStep)}
            aria-label="增加时长"
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_1fr_1fr] gap-2">
        <Button
          type="button"
          variant="outline"
          className={cn("h-9 rounded-xl text-xs font-bold", item.data?.enhance_prompt !== false ? "border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-100" : canvasGhostButtonClass)}
          onClick={() => onUpdateData({ enhance_prompt: item.data?.enhance_prompt === false })}
        >
          提示增强
        </Button>
        <Button
          type="button"
          variant="outline"
          className={cn("h-9 rounded-xl text-xs font-bold", item.data?.generate_audio ? "border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-100" : canvasGhostButtonClass)}
          onClick={() => onUpdateData({ generate_audio: !item.data?.generate_audio })}
        >
          音频
        </Button>
        <div className={cn(canvasSelectClass, "inline-flex items-center justify-center text-xs font-bold")}>
          私有
        </div>
      </div>

      {outputVideos.length > 0 ? <CanvasVideoStrip videos={outputVideos} limit={1} /> : null}
      <CanvasRunInsight item={item} />
      {nodeRunning ? (
        <Button
          type="button"
          variant="outline"
          className="h-10 w-full rounded-xl border-rose-300/70 font-bold text-rose-600 hover:bg-rose-50 dark:border-rose-400/30 dark:text-rose-100 dark:hover:bg-rose-500/10"
          onClick={onStopNode}
        >
          <X className="size-4" />
          中断视频生成
        </Button>
      ) : (
        <Button
          type="button"
          className="h-10 w-full rounded-xl bg-primary font-bold text-primary-foreground hover:bg-primary/90 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
          disabled={running || !mergedPromptPreview || models.length === 0}
          onClick={onRunGenerator}
        >
          {running ? <LoaderCircle className="size-4 animate-spin" /> : <Clapperboard className="size-4" />}
          视频生成
        </Button>
      )}
    </div>
  );
}

function OutputNodeBody({
  item,
  onOpenImage,
  onDeleteImage,
  onStopNode,
  lightweight,
}: {
  item: SmartCanvasItem;
  onOpenImage: (image: CanvasImageRef) => void;
  onDeleteImage: (image: CanvasImageRef) => void;
  onStopNode: () => void;
  lightweight: boolean;
}) {
  const images = item.data?.output?.images || item.data?.images || EMPTY_CANVAS_IMAGES;
  const videos = item.data?.output?.videos || item.data?.videos || EMPTY_CANVAS_VIDEOS;
  const loading = item.data?.status === "running" || item.data?.status === "queued";
  const loopRaw = item.data?.output?.raw?.mode === "loop" ? item.data.output.raw : null;
  const startedAt = item.data?.started_at || item.data?.created_at || "";
  const downloadNodeId = itemIdForDownload(item);
  const [showAllImages, setShowAllImages] = useState(false);
  const [selectedImageIds, setSelectedImageIds] = useState<Record<string, boolean>>({});
  const [downloadingImageIds, setDownloadingImageIds] = useState<Record<string, boolean>>({});
  const [bulkDownloadKey, setBulkDownloadKey] = useState<"selected" | "all" | "single" | null>(null);
  const downloadableImages = useMemo(() => images.flatMap((image, index) => {
    const downloadItem = canvasImageDownloadItem(image, index, { nodeId: downloadNodeId, createdAt: startedAt });
    return downloadItem ? [downloadItem] : [];
  }), [downloadNodeId, images, startedAt]);
  const selectedDownloadableImages = downloadableImages.filter((image) => selectedImageIds[image.id]);
  const toggleImageSelection = useCallback((image: CanvasImageRef, index: number) => {
    const id = canvasImageDownloadId(image, index);
    setSelectedImageIds((current) => ({
      ...current,
      [id]: !current[id],
    }));
  }, []);
  const downloadItems = useCallback(async (key: "selected" | "all" | "single", items: DownloadableImage[]) => {
    if (items.length === 0 || bulkDownloadKey) {
      return;
    }

    setBulkDownloadKey(key);
    setDownloadingImageIds((current) => ({
      ...current,
      ...Object.fromEntries(items.map((image) => [image.id, true])),
    }));
    try {
      for (let index = 0; index < items.length; index += 1) {
        await downloadImageFile(items[index]);
        if (index < items.length - 1) {
          await sleep(120);
        }
      }
    } finally {
      setDownloadingImageIds((current) => {
        const next = { ...current };
        for (const image of items) {
          delete next[image.id];
        }
        return next;
      });
      setBulkDownloadKey(null);
    }
  }, [bulkDownloadKey]);
  const downloadImage = useCallback((image: CanvasImageRef, index: number) => {
    const downloadItem = canvasImageDownloadItem(image, index, { nodeId: downloadNodeId, createdAt: startedAt });
    if (!downloadItem || downloadingImageIds[downloadItem.id]) {
      return;
    }
    void downloadItems("single", [downloadItem]);
  }, [downloadItems, downloadNodeId, downloadingImageIds, startedAt]);
  const downloadToolbar = downloadableImages.length > 0 ? (
    <CanvasOutputDownloadToolbar
      selectedCount={selectedDownloadableImages.length}
      totalCount={downloadableImages.length}
      downloadingKey={bulkDownloadKey}
      onDownloadSelected={() => void downloadItems("selected", selectedDownloadableImages)}
      onDownloadAll={() => void downloadItems("all", downloadableImages)}
    />
  ) : null;
  return (
    <div className="p-3">
      {downloadToolbar}
      {loopRaw ? (
        <LoopOutputSlots
          images={images}
          raw={loopRaw}
          status={item.data?.status}
          startedAt={startedAt}
          onOpenImage={onOpenImage}
          onDownloadImage={downloadImage}
          onToggleImageSelect={toggleImageSelection}
          selectedImageIds={selectedImageIds}
          downloadingImageIds={downloadingImageIds}
          lightweight={lightweight}
        />
      ) : videos.length > 0 ? (
        <CanvasVideoStrip videos={videos} limit={2} />
      ) : images.length > 0 ? (
        <CanvasImageStrip
          images={images}
          limit={4}
          onOpen={onOpenImage}
          onOpenAll={() => setShowAllImages(true)}
          onDelete={onDeleteImage}
          onDownload={downloadImage}
          onToggleSelect={toggleImageSelection}
          selectedImageIds={selectedImageIds}
          downloadingImageIds={downloadingImageIds}
          className="grid-cols-4"
          large
          lightweight={lightweight}
        />
      ) : loading ? (
        <CanvasGenerationLoading status={item.data?.status} onStop={onStopNode} />
      ) : (
        <div className={cn("flex h-36 items-center justify-center rounded-xl border text-xs", canvasDashedClass)}>
          连接生成节点后显示输出
        </div>
      )}
      <div className="mt-2">
        <CanvasRunInsight item={item} />
      </div>
      <Dialog open={showAllImages} onOpenChange={setShowAllImages}>
        <DialogContent className={cn("w-[min(92vw,780px)] max-w-none rounded-2xl p-0", canvasPanelClass)}>
          <DialogTitle className="sr-only">全部输出图片</DialogTitle>
          <DialogDescription className="sr-only">查看当前 Output 节点中的全部输出图片。</DialogDescription>
          <div className="border-b border-border px-4 py-3 text-sm font-black dark:border-slate-800">
            Output 图片
          </div>
          <div className="max-h-[68vh] overflow-auto p-4">
            <CanvasImageStrip
              images={images}
              onOpen={onOpenImage}
              onDelete={onDeleteImage}
              onDownload={downloadImage}
              onToggleSelect={toggleImageSelection}
              selectedImageIds={selectedImageIds}
              downloadingImageIds={downloadingImageIds}
              className="grid-cols-2 sm:grid-cols-3 md:grid-cols-4"
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function itemIdForDownload(item: SmartCanvasItem) {
  return item.id || item.data?.task_id || item.data?.output?.task_id || "output";
}

function CanvasOutputDownloadToolbar({
  selectedCount,
  totalCount,
  downloadingKey,
  onDownloadSelected,
  onDownloadAll,
}: {
  selectedCount: number;
  totalCount: number;
  downloadingKey: "selected" | "all" | "single" | null;
  onDownloadSelected: () => void;
  onDownloadAll: () => void;
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <span className={cn("min-w-0 truncate text-[11px] font-semibold", canvasSubtleTextClass)}>
        {selectedCount > 0 ? `已选 ${selectedCount} / ${totalCount}` : `${totalCount} 张输出图片`}
      </span>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={cn("h-7 rounded-lg px-2 text-[11px] font-black", canvasIconButtonClass)}
          disabled={selectedCount === 0 || downloadingKey !== null}
          onClick={onDownloadSelected}
          title="下载已选图片"
        >
          {downloadingKey === "selected" ? <LoaderCircle className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
          下载已选
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={cn("h-7 rounded-lg px-2 text-[11px] font-black", canvasIconButtonClass)}
          disabled={downloadingKey !== null}
          onClick={onDownloadAll}
          title="下载全部输出图片"
        >
          {downloadingKey === "all" ? <LoaderCircle className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
          全部
        </Button>
      </div>
    </div>
  );
}

function CanvasVideoStrip({ videos, limit = videos.length, className }: { videos: CanvasVideoRef[]; limit?: number; className?: string }) {
  const visible = videos.slice(0, limit);
  const overflow = Math.max(0, videos.length - visible.length);
  if (visible.length === 0) {
    return null;
  }
  return (
    <div className={cn("grid gap-2", className)}>
      {visible.map((video, index) => {
        const src = canvasVideoSource(video);
        return (
          <div
            key={`${src || video.name || "video"}-${index}`}
            className="overflow-hidden rounded-xl border border-border bg-black dark:border-slate-700"
            data-node-interactive="true"
          >
            {src ? (
              <video
                src={src}
                className="aspect-video w-full bg-black object-contain"
                controls
                preload="metadata"
                title={video.name || `视频 ${index + 1}`}
              />
            ) : (
              <div className="flex aspect-video items-center justify-center text-xs font-bold text-white/70">
                视频地址为空
              </div>
            )}
            <div className="flex items-center justify-between gap-2 bg-card px-3 py-2 text-[11px] font-bold text-muted-foreground dark:bg-slate-950 dark:text-slate-400">
              <span className="truncate">{video.name || `视频 ${index + 1}`}</span>
              {overflow > 0 && index === visible.length - 1 ? <span className="shrink-0">+{overflow}</span> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function loopRawNumber(raw: Record<string, unknown>, key: string, fallback = 0) {
  const value = Number(raw[key]);
  return Number.isFinite(value) ? value : fallback;
}

function loopSlotStatus(raw: Record<string, unknown>, index: number, status?: CreationTask["status"]): CreationTask["status"] {
  const slots = Array.isArray(raw.slots) ? raw.slots : [];
  const slot = slots[index];
  if (slot && typeof slot === "object" && "status" in slot) {
    const value = String((slot as { status?: unknown }).status || "");
    if (value === "success" || value === "running" || value === "queued" || value === "error" || value === "cancelled") {
      return value;
    }
  }
  const completed = loopRawNumber(raw, "completed", 0);
  const failed = loopRawNumber(raw, "failed", 0);
  const runningSlot = loopRawNumber(raw, "running_slot", -1);
  if (index < completed) {
    return "success";
  }
  if (status === "running" && index === runningSlot) {
    return "running";
  }
  if (status === "cancelled") {
    return "cancelled";
  }
  if (status === "error" && index >= completed && index < completed + failed) {
    return "error";
  }
  return status === "running" ? "queued" : status || "queued";
}

function formatElapsedDuration(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;
  if (minutes < 60) {
    return `${String(minutes).padStart(2, "0")}:${String(restSeconds).padStart(2, "0")}`;
  }
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return `${hours}:${String(restMinutes).padStart(2, "0")}:${String(restSeconds).padStart(2, "0")}`;
}

function useElapsedLabel(startedAt?: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) {
      return;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  if (!startedAt) {
    return "";
  }
  const started = new Date(startedAt).getTime();
  if (!Number.isFinite(started)) {
    return "";
  }
  return formatElapsedDuration(now - started);
}

function LoopOutputSlots({
  images,
  raw,
  status,
  startedAt,
  onOpenImage,
  onDownloadImage,
  onToggleImageSelect,
  selectedImageIds,
  downloadingImageIds,
  lightweight,
}: {
  images: CanvasImageRef[];
  raw: Record<string, unknown>;
  status?: CreationTask["status"];
  startedAt?: string;
  onOpenImage: (image: CanvasImageRef) => void;
  onDownloadImage?: (image: CanvasImageRef, index: number) => void;
  onToggleImageSelect?: (image: CanvasImageRef, index: number) => void;
  selectedImageIds?: Record<string, boolean>;
  downloadingImageIds?: Record<string, boolean>;
  lightweight: boolean;
}) {
  const total = Math.max(1, Math.min(40, loopRawNumber(raw, "total", images.length || 1)));
  const current = loopRawNumber(raw, "current", 0);
  const completed = loopRawNumber(raw, "completed", images.length);
  const failed = loopRawNumber(raw, "failed", 0);
  const elapsedLabel = useElapsedLabel(startedAt);
  const slots = Array.from({ length: total }, (_, index) => {
    const image = images[index];
    return {
      index,
      image,
      status: image ? "success" as const : loopSlotStatus(raw, index, status),
    };
  });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2">
        {slots.map((slot) => (
          <LoopOutputSlot
            key={slot.index}
            index={slot.index}
            image={slot.image}
            status={slot.status}
            elapsedLabel={slot.status === "running" ? elapsedLabel : ""}
            onOpenImage={onOpenImage}
            onDownloadImage={onDownloadImage}
            onToggleImageSelect={onToggleImageSelect}
            selected={slot.image ? Boolean(selectedImageIds?.[canvasImageDownloadId(slot.image, slot.index)]) : false}
            downloading={slot.image ? Boolean(downloadingImageIds?.[canvasImageDownloadId(slot.image, slot.index)]) : false}
            lightweight={lightweight}
          />
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 rounded-xl border border-sky-500/15 bg-sky-500/8 px-3 py-2 text-[11px] font-semibold text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-100">
        <span className="truncate">循环进度 {Math.min(current, total)}/{total}</span>
        <span className="shrink-0">成功 {completed}，失败 {failed}</span>
      </div>
    </div>
  );
}

function LoopOutputSlot({
  index,
  image,
  status,
  elapsedLabel,
  onOpenImage,
  onDownloadImage,
  onToggleImageSelect,
  selected,
  downloading,
  lightweight,
}: {
  index: number;
  image?: CanvasImageRef;
  status?: CreationTask["status"];
  elapsedLabel?: string;
  onOpenImage: (image: CanvasImageRef) => void;
  onDownloadImage?: (image: CanvasImageRef, index: number) => void;
  onToggleImageSelect?: (image: CanvasImageRef, index: number) => void;
  selected?: boolean;
  downloading?: boolean;
  lightweight: boolean;
}) {
  if (image) {
    return (
      <button
        type="button"
        className={cn(
          "group relative aspect-square overflow-hidden rounded-xl border bg-muted",
          selected ? "border-sky-500 ring-2 ring-sky-400/60 dark:border-sky-300" : "border-border",
        )}
        onClick={() => onOpenImage(image)}
        data-node-interactive="true"
        draggable
        onDragStart={(event) => {
          event.stopPropagation();
          if (!setCanvasImageDragData(event.dataTransfer, [image])) {
            event.preventDefault();
          }
        }}
      >
        {lightweight ? (
          <CanvasImagePlaceholder label={canvasImageLabel(image, index)} />
        ) : (
          <AuthenticatedImage src={canvasImagePreviewSource(image)} alt={canvasImageLabel(image, index)} className="h-full w-full object-cover" />
        )}
        {onToggleImageSelect ? (
          <span
            role="button"
            tabIndex={0}
            className={cn(
              "absolute left-1 top-1 z-20 inline-flex size-6 items-center justify-center rounded-full border text-[10px] font-black shadow-sm transition",
              selected
                ? "border-sky-500 bg-sky-500 text-white opacity-100"
                : "border-white/80 bg-black/45 text-white opacity-100 backdrop-blur-sm hover:bg-black/60",
            )}
            data-node-interactive="true"
            title={selected ? "取消选择图片" : "选择图片"}
            aria-label={selected ? "取消选择图片" : "选择图片"}
            aria-pressed={selected}
            onClick={(event) => {
              event.stopPropagation();
              onToggleImageSelect(image, index);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                onToggleImageSelect(image, index);
              }
            }}
          >
            {selected ? <Check className="size-3.5" /> : index + 1}
          </span>
        ) : (
          <span className="absolute left-1.5 top-1.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-black text-white">{index + 1}</span>
        )}
        {onDownloadImage ? (
          <span
            className={cn(
              "absolute right-1 top-1 z-20 flex flex-col gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100",
              downloading && "opacity-100",
            )}
          >
            <span
              role="button"
              tabIndex={0}
              className={cn(
                "flex size-6 items-center justify-center rounded-full border border-border bg-background/95 text-sky-700 shadow-sm transition hover:border-sky-300 hover:bg-white hover:text-sky-900 dark:border-slate-700 dark:bg-slate-950/90 dark:text-sky-200 dark:hover:border-sky-400/50 dark:hover:bg-slate-900",
                downloading && "pointer-events-none",
              )}
              data-node-interactive="true"
              title="下载图片"
              aria-label="下载图片"
              onClick={(event) => {
                event.stopPropagation();
                onDownloadImage(image, index);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  onDownloadImage(image, index);
                }
              }}
            >
              {downloading ? <LoaderCircle className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
            </span>
          </span>
        ) : null}
      </button>
    );
  }
  const running = status === "running";
  const failed = status === "error" || status === "cancelled";
  return (
    <div
      className={cn(
        "relative flex aspect-square items-center justify-center overflow-hidden rounded-xl border bg-white text-[10px] font-black text-muted-foreground shadow-[0_3px_8px_rgba(15,23,42,0.05)] dark:bg-slate-950/45",
        running ? "border-sky-300 text-sky-700 dark:border-sky-400/40 dark:text-sky-100" : failed ? "border-rose-300 text-rose-600 dark:border-rose-400/40 dark:text-rose-200" : "border-border",
      )}
    >
      {running ? (
        <div className="flex flex-col items-center gap-1.5">
          <span className="flex size-7 items-center justify-center rounded-full bg-sky-50 text-sky-600 ring-1 ring-sky-100 dark:bg-sky-950/40 dark:text-sky-200 dark:ring-sky-800">
            <LoaderCircle className="size-4 animate-spin" />
          </span>
          <span>生成中</span>
          {elapsedLabel ? <span className="font-mono text-[9px] font-bold tabular-nums text-sky-500 dark:text-sky-200">{elapsedLabel}</span> : null}
        </div>
      ) : failed ? (
        <span>{status === "cancelled" ? "已中断" : "失败"}</span>
      ) : (
        <span>等待 {index + 1}</span>
      )}
    </div>
  );
}

function CanvasGenerationLoading({ status, onStop }: { status?: CreationTask["status"]; onStop?: () => void }) {
  const queued = status === "queued";
  const progressPercent = queued ? 0 : 8;
  return (
    <div className="flex h-36 items-center justify-center px-5">
      <div className="w-full max-w-[250px]">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full",
              queued
                ? "text-amber-600 dark:text-amber-300"
                : "text-[#1456f0] dark:text-sky-300",
            )}
          >
            {queued ? <Clock3 className="size-4" /> : <LoaderCircle className="size-4 animate-spin" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2 text-[11px] text-[#45515e] dark:text-muted-foreground">
              <span className="truncate font-medium text-[#222222] dark:text-foreground">
                {queued ? "等待创作并发额度" : "等待图片处理"}
              </span>
              <span className="shrink-0 font-mono tabular-nums">{progressPercent}%</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#edf2f7] dark:bg-muted">
              <div
                className="h-full rounded-full bg-[#1456f0] transition-[width] duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 pl-11 text-[11px] text-[#8e8e93] dark:text-muted-foreground">
          <span>{queued ? "画布任务排队中" : "画布任务处理中"}</span>
          {onStop ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 shrink-0 rounded-lg border-rose-300/70 bg-white/80 px-2 text-xs font-black text-rose-600 hover:bg-rose-50 dark:border-rose-400/30 dark:bg-slate-950/50 dark:text-rose-100"
              onClick={onStop}
            >
              <X className="mr-1 size-3.5" />
              中断
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function canvasGalleryImageKey(image: CanvasImageRef, index: number) {
  return `${canvasImageKey(image) || canvasImageSource(image) || image.name || "image"}-${index}`;
}

function CanvasGeneratedImagePreview({
  images,
  onOpenImage,
  lightweight,
}: {
  images: CanvasImageRef[];
  onOpenImage: (image: CanvasImageRef) => void;
  lightweight: boolean;
}) {
  const [activeKey, setActiveKey] = useState("");
  const activeIndex = Math.max(0, images.findIndex((image, index) => canvasGalleryImageKey(image, index) === activeKey));
  const activeImage = images[activeIndex];
  const activeSource = activeImage ? canvasImageSource(activeImage) || canvasImagePreviewSource(activeImage) : "";

  if (!activeImage) {
    return null;
  }

  return (
    <div className={cn("rounded-xl border border-border bg-background/70 p-2 dark:border-slate-700 dark:bg-slate-950/45", images.length > 1 && "grid grid-cols-[minmax(0,1fr)_52px] gap-2")}>
      <button
        type="button"
        className="group relative flex h-[210px] min-w-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/70 text-muted-foreground transition hover:border-sky-300 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-500 dark:hover:border-sky-400/50"
        title={canvasImageLabel(activeImage, activeIndex)}
        aria-label={`查看${canvasImageLabel(activeImage, activeIndex)}`}
        data-node-interactive="true"
        draggable
        onClick={(event) => {
          event.stopPropagation();
          onOpenImage(activeImage);
        }}
        onDragStart={(event) => {
          event.stopPropagation();
          if (!setCanvasImageDragData(event.dataTransfer, [activeImage])) {
            event.preventDefault();
          }
        }}
      >
        {lightweight ? (
          <CanvasImagePlaceholder label={canvasImageLabel(activeImage, activeIndex)} />
        ) : activeSource ? (
          <AuthenticatedImage
            src={activeSource}
            alt={canvasImageLabel(activeImage, activeIndex)}
            className="h-full w-full object-contain transition duration-150 group-hover:scale-[1.01]"
            placeholderClassName="min-h-0 h-full bg-muted text-muted-foreground dark:bg-slate-900 dark:text-slate-500"
          />
        ) : (
          <ImageIcon className="size-5" />
        )}
        <span className="absolute left-2 top-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-black text-white shadow-sm">
          {activeIndex + 1} / {images.length}
        </span>
        <span className="absolute bottom-2 right-2 flex size-7 items-center justify-center rounded-full border border-white/70 bg-black/45 text-white opacity-0 shadow-sm backdrop-blur-sm transition group-hover:opacity-100">
          <Pencil className="size-3.5" />
        </span>
      </button>
      {images.length > 1 ? (
        <div
          className="flex max-h-[210px] flex-col gap-1.5 overflow-y-auto pr-0.5"
          data-node-interactive="true"
          onWheel={(event) => event.stopPropagation()}
        >
          {images.map((image, index) => {
            const key = canvasGalleryImageKey(image, index);
            const selected = index === activeIndex;
            const thumbnailSource = canvasImagePreviewSource(image);
            return (
              <button
                key={key}
                type="button"
                className={cn(
                  "relative size-11 shrink-0 overflow-hidden rounded-lg border bg-muted text-muted-foreground transition dark:bg-slate-900 dark:text-slate-500",
                  selected
                    ? "border-sky-500 ring-2 ring-sky-400/55 dark:border-sky-300"
                    : "border-border opacity-80 hover:border-sky-300 hover:opacity-100 dark:border-slate-700 dark:hover:border-sky-400/50",
                )}
                title={canvasImageLabel(image, index)}
                aria-label={`切换到${canvasImageLabel(image, index)}`}
                aria-pressed={selected}
                data-node-interactive="true"
                onClick={(event) => {
                  event.stopPropagation();
                  setActiveKey(key);
                }}
              >
                {lightweight ? (
                  <CanvasImagePlaceholder label={`${index + 1}`} />
                ) : thumbnailSource ? (
                  <AuthenticatedImage
                    src={thumbnailSource}
                    alt={canvasImageLabel(image, index)}
                    className="h-full w-full object-cover"
                    placeholderClassName="min-h-0 h-full bg-muted text-muted-foreground dark:bg-slate-900 dark:text-slate-500"
                  />
                ) : (
                  <ImageIcon className="mx-auto size-4" />
                )}
                <span className="absolute left-1 top-1 rounded bg-black/55 px-1 text-[9px] font-black leading-4 text-white">
                  {index + 1}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function Port({
  side,
  onPointerDown,
  onPointerUp,
  onOpenMenu,
}: {
  side: "in" | "out";
  onPointerDown?: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp?: (event: ReactPointerEvent<HTMLElement>) => void;
  onOpenMenu?: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
  return (
    <button
      type="button"
      data-port={side}
      className={cn(
        "absolute top-1/2 z-30 flex size-8 -translate-y-1/2 items-center justify-center rounded-full transition hover:scale-105",
        "before:block before:size-4 before:rounded-full before:border-2 before:border-sky-500 before:bg-background before:shadow-[0_0_0_4px_rgba(255,255,255,0.85)] before:transition before:content-[''] hover:before:bg-sky-400",
        "dark:before:border-slate-300 dark:before:bg-slate-900 dark:before:shadow-[0_0_0_4px_rgba(15,23,42,0.75)]",
        side === "in" ? "-left-4" : "-right-4",
      )}
      onPointerDown={onPointerDown}
      onPointerUp={(event) => {
        event.stopPropagation();
        onPointerUp?.(event);
        if (event.defaultPrevented) {
          return;
        }
        onOpenMenu?.(event);
      }}
      title={side === "in" ? "输入" : "输出"}
    />
  );
}

export function CanvasImageStrip({
  images,
  limit = images.length,
  onOpen,
  onOpenAll,
  onDelete,
  onDownload,
  onToggleSelect,
  selectedImageIds,
  downloadingImageIds,
  className,
  large,
  lightweight,
  style,
}: {
  images: CanvasImageRef[];
  limit?: number;
  onOpen?: (image: CanvasImageRef) => void;
  onOpenAll?: () => void;
  onDelete?: (image: CanvasImageRef) => void;
  onDownload?: (image: CanvasImageRef, index: number) => void;
  onToggleSelect?: (image: CanvasImageRef, index: number) => void;
  selectedImageIds?: Record<string, boolean>;
  downloadingImageIds?: Record<string, boolean>;
  className?: string;
  large?: boolean;
  lightweight?: boolean;
  style?: CSSProperties;
}) {
  const visible = images.slice(0, limit);
  const overflow = Math.max(0, images.length - visible.length);
  if (visible.length === 0) {
    return null;
  }
  return (
    <div className={cn("grid gap-2", className || "grid-cols-3", large && "h-full")} style={style}>
      {visible.map((image, index) => {
        const src = canvasImagePreviewSource(image);
        const imageId = canvasImageDownloadId(image, index);
        const selected = Boolean(selectedImageIds?.[imageId]);
        const downloading = Boolean(downloadingImageIds?.[imageId]);
        const coveredByOverflow = overflow > 0 && index === visible.length - 1;
        return (
          <button
            key={`${canvasImageSource(image) || image.path || image.name || "image"}-${index}`}
            type="button"
            className={cn(
              "group relative overflow-hidden rounded-xl border bg-muted/60 dark:bg-slate-950/60",
              selected ? "border-sky-500 ring-2 ring-sky-400/60 dark:border-sky-300" : "border-border dark:border-slate-700",
              large ? "h-full min-h-0" : "aspect-square",
            )}
            onClick={(event) => {
              event.stopPropagation();
              onOpen?.(image);
            }}
            title={canvasImageLabel(image, index)}
            data-node-interactive="true"
            draggable
            onDragStart={(event) => {
              event.stopPropagation();
              if (!setCanvasImageDragData(event.dataTransfer, [image])) {
                event.preventDefault();
              }
            }}
          >
            {lightweight ? (
              <CanvasImagePlaceholder label={canvasImageLabel(image, index)} />
            ) : src ? (
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
              <span
                role={onOpenAll ? "button" : undefined}
                tabIndex={onOpenAll ? 0 : undefined}
                className="absolute inset-0 z-10 flex items-center justify-center bg-background/75 text-sm font-bold text-foreground backdrop-blur-sm dark:bg-slate-950/75 dark:text-white"
                title={onOpenAll ? `查看全部 ${images.length} 张图片` : undefined}
                aria-label={onOpenAll ? `查看全部 ${images.length} 张图片` : undefined}
                onClick={(event) => {
                  if (!onOpenAll) {
                    return;
                  }
                  event.stopPropagation();
                  onOpenAll();
                }}
                onKeyDown={(event) => {
                  if (!onOpenAll || (event.key !== "Enter" && event.key !== " ")) {
                    return;
                  }
                  event.preventDefault();
                  event.stopPropagation();
                  onOpenAll();
                }}
              >
                +{overflow}
              </span>
            ) : null}
            {onToggleSelect && !coveredByOverflow ? (
              <span
                role="button"
                tabIndex={0}
                className={cn(
                  "absolute left-1 top-1 z-20 inline-flex size-6 items-center justify-center rounded-full border text-[10px] font-black shadow-sm transition",
                  selected
                    ? "border-sky-500 bg-sky-500 text-white opacity-100"
                    : "border-white/80 bg-black/45 text-white opacity-0 backdrop-blur-sm hover:bg-black/60 group-hover:opacity-100",
                )}
                data-node-interactive="true"
                title={selected ? "取消选择图片" : "选择图片"}
                aria-label={selected ? "取消选择图片" : "选择图片"}
                aria-pressed={selected}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleSelect(image, index);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    event.stopPropagation();
                    onToggleSelect(image, index);
                  }
                }}
              >
                {selected ? <Check className="size-3.5" /> : index + 1}
              </span>
            ) : null}
            {!coveredByOverflow && (onDownload || onOpen || onDelete) ? (
              <span
                className={cn(
                  "absolute right-1 top-1 z-20 flex flex-col gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100",
                  downloading && "opacity-100",
                )}
              >
                {onDownload ? (
                  <span
                    role="button"
                    tabIndex={0}
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full border border-border bg-background/95 text-sky-700 shadow-sm transition hover:border-sky-300 hover:bg-white hover:text-sky-900 dark:border-slate-700 dark:bg-slate-950/90 dark:text-sky-200 dark:hover:border-sky-400/50 dark:hover:bg-slate-900",
                      downloading && "pointer-events-none",
                    )}
                    data-node-interactive="true"
                    title="下载图片"
                    aria-label="下载图片"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDownload(image, index);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.stopPropagation();
                        onDownload(image, index);
                      }
                    }}
                  >
                    {downloading ? <LoaderCircle className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                  </span>
                ) : null}
                {onOpen ? (
                  <span
                    role="button"
                    tabIndex={0}
                    className="flex size-6 items-center justify-center rounded-full border border-border bg-background/95 text-sky-700 shadow-sm transition hover:border-sky-300 hover:bg-white hover:text-sky-900 dark:border-slate-700 dark:bg-slate-950/90 dark:text-sky-200 dark:hover:border-sky-400/50 dark:hover:bg-slate-900"
                    data-node-interactive="true"
                    title="编辑图片"
                    aria-label="编辑图片"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpen(image);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.stopPropagation();
                        onOpen(image);
                      }
                    }}
                  >
                    <Pencil className="size-3.5" />
                  </span>
                ) : null}
                {onDelete ? (
                  <span
                    role="button"
                    tabIndex={0}
                    className="flex size-6 items-center justify-center rounded-full border border-border bg-background/90 text-muted-foreground shadow-sm transition hover:border-rose-400 hover:bg-white hover:text-rose-500 dark:border-slate-700 dark:bg-slate-950/90 dark:text-slate-400 dark:hover:text-rose-300"
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
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function CanvasImagePlaceholder({ label }: { label: string }) {
  return (
    <span className="flex h-full w-full flex-col items-center justify-center gap-1 bg-muted/70 px-2 text-muted-foreground dark:bg-slate-900/70 dark:text-slate-500">
      <ImageIcon className="size-4" />
      <span className="max-w-full truncate text-[10px] font-semibold">{label}</span>
    </span>
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
        <SmartCanvasRunHistoryList canvas={canvas} className="max-h-[420px]" />
      </div>
    </aside>
  );
}

export function SmartCanvasRunHistoryList({
  canvas,
  className,
}: {
  canvas: SmartCanvasDocument | null;
  className?: string;
}) {
  const runs = smartCanvasRuns(canvas).slice(0, 30);
  return (
    <div className={cn("space-y-2 overflow-auto pr-1", className)}>
      {runs.length > 0 ? runs.map((run) => (
        <RunRecordCard key={run.id} run={run} />
      )) : (
        <div className={cn("rounded-xl border p-3 text-center text-xs", canvasDashedClass)}>暂无运行记录</div>
      )}
    </div>
  );
}

export function SmartCanvasOperationHistoryPanel({
  entries,
  open,
  canUndo,
  canRedo,
  onOpenChange,
  onUndo,
  onRedo,
  onRestore,
}: {
  entries: SmartCanvasHistoryEntry[];
  open: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onOpenChange: (open: boolean) => void;
  onUndo: () => void;
  onRedo: () => void;
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
        <SmartCanvasOperationHistoryList
          entries={entries}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={onUndo}
          onRedo={onRedo}
          onRestore={onRestore}
          className="max-h-[420px]"
        />
      </div>
    </aside>
  );
}

export function SmartCanvasOperationHistoryList({
  entries,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onRestore,
  className,
}: {
  entries: SmartCanvasHistoryEntry[];
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onRestore: (entry: SmartCanvasHistoryEntry) => void;
  className?: string;
}) {
  const visibleEntries = entries.slice(0, 30);
  return (
    <div>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={cn("h-8 rounded-lg text-xs font-black", canvasIconButtonClass)}
          disabled={!canUndo}
          onClick={onUndo}
        >
          <RotateCcw className="mr-1.5 size-3.5" />
          撤销
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={cn("h-8 rounded-lg text-xs font-black", canvasIconButtonClass)}
          disabled={!canRedo}
          onClick={onRedo}
        >
          <RotateCw className="mr-1.5 size-3.5" />
          重做
        </Button>
      </div>
      <div className={cn("space-y-2 overflow-auto pr-1", className)}>
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
  );
}

function RunRecordCard({ run }: { run: SmartCanvasRunRecord }) {
  const modeLabel = run.mode === "video" ? "视频生成" : run.mode === "edit" ? "图生图" : "文生图";
  const detail = run.error
    ? buildSmartCanvasErrorDetail({
        status: run.status,
        error: run.error,
        task_id: run.taskId,
        prompt: run.prompt,
        model: run.model,
        created_at: run.createdAt,
        updated_at: run.updatedAt,
      })
    : null;
  const times = [
    run.startedAt ? `开始 ${formatCanvasNodeTime(run.startedAt)}` : "",
    run.updatedAt ? `更新 ${formatCanvasNodeTime(run.updatedAt)}` : "",
    run.taskId ? `任务 ${run.taskId.slice(0, 8)}` : "",
  ].filter(Boolean);
  return (
    <div className="rounded-xl border border-border bg-background/70 p-2 dark:border-slate-800 dark:bg-slate-950/55">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-foreground dark:text-slate-200">{run.prompt || "未命名任务"}</div>
          <div className={cn("truncate text-[11px]", canvasSubtleTextClass)}>{displayModelLabel(run.model)} · {modeLabel}</div>
        </div>
        <StatusBadge status={run.status} />
      </div>
      {times.length > 0 ? <div className={cn("mt-1 truncate text-[11px]", canvasSubtleTextClass)}>{times.join(" · ")}</div> : null}
      {run.videos.length > 0 ? <CanvasVideoStrip videos={run.videos} limit={1} className="mt-2" /> : null}
      {run.images.length > 0 ? <CanvasImageStrip images={run.images} limit={3} className="mt-2 grid-cols-3" /> : null}
      {detail ? <div className="mt-2 rounded-lg border border-rose-500/18 bg-rose-500/8 px-2 py-1.5 text-[11px] leading-5 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-100">{detail.message}</div> : null}
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
  if (type === "loop") {
    return <Repeat2 className="size-4 text-sky-700 dark:text-sky-200" />;
  }
  if (type === "group") {
    return <Layers3 className="size-4 text-sky-700 dark:text-sky-200" />;
  }
  if (type === "image_generation") {
    return <WandSparkles className="size-4 text-sky-700 dark:text-sky-200" />;
  }
  if (type === "video_generation") {
    return <Clapperboard className="size-4 text-sky-700 dark:text-sky-200" />;
  }
  return <CircleDot className="size-4 text-sky-700 dark:text-sky-200" />;
}

function IconToolButton({ title, onClick, children, className }: { title: string; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button type="button" className={cn("flex size-9 items-center justify-center transition", canvasIconButtonClass, className)} onPointerDown={stopNodeInteraction} onClick={onClick} title={title} aria-label={title}>
      {children}
    </button>
  );
}

function nodeTitle(item: SmartCanvasItem) {
  if (item.name?.trim()) return item.name.trim();
  if (item.type === "image") return "Image";
  if (item.type === "prompt") return "Prompt";
  if (item.type === "llm") return "AI 提示词";
  if (item.type === "loop") return "循环";
  if (item.type === "group") return "Group";
  if (item.type === "image_generation") return "图片生成";
  if (item.type === "video_generation") return "视频生成";
  return "Output";
}

function nodeTypeLabel(type: SmartCanvasItem["type"]) {
  if (type === "image") return "图片";
  if (type === "prompt") return "提示词";
  if (type === "llm") return "AI 提示词";
  if (type === "loop") return "循环";
  if (type === "group") return "组";
  if (type === "image_generation") return "图片生成";
  if (type === "video_generation") return "视频生成";
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
