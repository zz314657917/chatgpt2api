"use client";

import { memo, useCallback, useLayoutEffect, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  BoxSelect,
  CheckCircle2,
  CircleAlert,
  CircleDot,
  Clock3,
  FileText,
  Grid2X2,
  Image as ImageIcon,
  ImagePlus,
  Images,
  LoaderCircle,
  MousePointer2,
  RefreshCw,
  Repeat2,
  Save,
  Sparkles,
  Trash2,
  Upload,
  WandSparkles,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { AuthenticatedImage } from "@/components/authenticated-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { CanvasImageRef, CanvasModelOption, ImageVisibility, ManagedImage } from "@/lib/api";
import { cn } from "@/lib/utils";

import {
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
  SmartCanvasDocument,
  SmartCanvasItem,
  SmartCanvasRunRecord,
  SmartCanvasSaveState,
  SmartCanvasTool,
  SmartCanvasViewport,
} from "./types";

const NODE_SIZE: Record<SmartCanvasItem["type"], { w: number; h: number }> = {
  image: { w: 270, h: 260 },
  prompt: { w: 310, h: 210 },
  image_generation: { w: 390, h: 330 },
  result: { w: 440, h: 245 },
};

type SmartCanvasNodeSizeMap = Record<string, { w: number; h: number }>;

const canvasPanelClass = "border-border bg-card/92 text-card-foreground shadow-[0_18px_46px_rgba(44,74,116,0.16)] backdrop-blur dark:border-slate-800 dark:bg-[#111827]/92 dark:text-slate-100 dark:shadow-[0_18px_46px_rgba(0,0,0,0.36)]";
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
    <div className="relative flex h-full min-h-0 overflow-hidden rounded-[24px] border border-border bg-background text-foreground shadow-[0_26px_80px_rgba(44,74,116,0.12)] dark:border-slate-800 dark:bg-[#0b111c] dark:text-slate-100 dark:shadow-[0_26px_80px_rgba(0,0,0,0.45)]">
      {children}
    </div>
  );
}

export function SmartCanvasLeftRail({
  onAddNode,
}: {
  onAddNode: (type: SmartCanvasItem["type"]) => void;
}) {
  return (
    <aside className="relative z-30 flex w-[196px] shrink-0 flex-col border-r border-border bg-card/70 px-3 py-5 dark:border-slate-800/90 dark:bg-[#0d1421]">
      <div className="flex items-center gap-3 px-2">
        <div className="flex size-10 items-center justify-center rounded-2xl border border-border bg-background text-sky-600 dark:border-slate-700 dark:bg-slate-900 dark:text-sky-300">
          <Grid2X2 className="size-5" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-bold">无限画布</div>
          <div className={cn("text-[11px]", canvasSubtleTextClass)}>节点创作</div>
        </div>
      </div>

      <div className="mt-12 space-y-2">
        <RailButton icon={<ImageIcon className="size-4" />} label="文生图" onClick={() => onAddNode("image_generation")} />
        <RailButton icon={<Sparkles className="size-4" />} label="细节增强" onClick={() => onAddNode("prompt")} />
        <RailButton icon={<FileText className="size-4" />} label="提示词" onClick={() => onAddNode("prompt")} />
        <RailButton icon={<Images className="size-4" />} label="图片节点" onClick={() => onAddNode("image")} />
        <RailButton icon={<CircleDot className="size-4" />} label="Output" onClick={() => onAddNode("result")} />
      </div>

      <div className={cn("mt-auto border-t border-border pt-4 text-center text-[11px] font-semibold dark:border-slate-800", canvasSubtleTextClass)}>
        节点直接在画布中编辑
      </div>
    </aside>
  );
}

function RailButton({ icon, label, active, onClick }: { icon: ReactNode; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-12 w-full items-center gap-3 rounded-2xl px-3 text-left text-sm font-semibold transition",
        active
          ? "bg-primary text-primary-foreground dark:bg-slate-100 dark:text-slate-950"
          : "text-muted-foreground hover:bg-accent hover:text-foreground dark:text-slate-300 dark:hover:bg-slate-800/80 dark:hover:text-white",
      )}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

type SmartCanvasTopBarProps = {
  canvas: SmartCanvasDocument | null;
  saveState: SmartCanvasSaveState;
  saving: boolean;
  running: boolean;
  onBack: () => void;
  onSave: () => void;
  onAddNode: (type: SmartCanvasItem["type"]) => void;
  onUploadClick: () => void;
  onDeleteCanvas: () => void;
};

export function SmartCanvasTopBar({
  canvas,
  saveState,
  saving,
  running,
  onBack,
  onSave,
  onAddNode,
  onUploadClick,
  onDeleteCanvas,
}: SmartCanvasTopBarProps) {
  return (
    <div className="pointer-events-none absolute left-6 right-6 top-5 z-40 flex items-center justify-between gap-4">
      <div className={cn("pointer-events-auto flex h-14 items-center gap-3 rounded-full border px-3", canvasPanelClass)}>
        <Button type="button" variant="ghost" size="icon" className="size-10 rounded-full text-foreground hover:bg-accent dark:text-slate-200 dark:hover:bg-slate-800" onClick={onBack}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0 pr-4">
          <div className="max-w-52 truncate text-sm font-bold">{canvas?.name || "未命名画布"}</div>
          <div className={cn("text-[11px]", canvasSubtleTextClass)}>{canvas?.updated_at ? canvas.updated_at.slice(5, 16) : "新版节点画布"}</div>
        </div>
      </div>

      <div className={cn("pointer-events-auto flex min-w-0 flex-wrap items-center justify-end gap-2 rounded-full border p-1.5", canvasPanelClass)}>
        <ToolbarButton icon={<ImagePlus className="size-4" />} label="上传" onClick={onUploadClick} />
        <ToolbarButton icon={<FileText className="size-4" />} label="提示词" onClick={() => onAddNode("prompt")} />
        <ToolbarButton icon={<Repeat2 className="size-4" />} label="循环" disabled />
        <ToolbarButton icon={<Sparkles className="size-4" />} label="LLM" disabled />
        <ToolbarButton icon={<WandSparkles className="size-4" />} label="API生成" onClick={() => onAddNode("image_generation")} />
        <ToolbarButton icon={<Zap className="size-4" />} label="MS生成" disabled />
        <ToolbarButton icon={<CircleDot className="size-4" />} label="Output" onClick={() => onAddNode("result")} />
        <ToolbarButton icon={saving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />} label={saveStateLabel(saveState)} onClick={onSave} />
        <ToolbarButton icon={<Trash2 className="size-4" />} label="删除" danger onClick={onDeleteCanvas} />
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

type SmartCanvasBoardProps = {
  canvas: SmartCanvasDocument | null;
  viewport: SmartCanvasViewport;
  selectedItemId: string;
  tool: SmartCanvasTool;
  connectState: SmartCanvasConnectState;
  draggingImages: boolean;
  boardRef: React.RefObject<HTMLDivElement | null>;
  models: CanvasModelOption[];
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
  onItemPointerDown: (event: ReactPointerEvent<HTMLDivElement>, item: SmartCanvasItem) => void;
  onResizeItemPointerDown: (event: ReactPointerEvent<HTMLElement>, item: SmartCanvasItem) => void;
  onSelectItem: (id: string) => void;
  onOpenImage: (image: CanvasImageRef) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onUpdateItemData: (id: string, patch: Partial<SmartCanvasItem["data"]>) => void;
  onRunGenerator: (id: string) => void;
  onDeleteItem: (id: string) => void;
  onStartConnect: (event: ReactPointerEvent<HTMLElement>, sourceId: string) => void;
  onFinishConnect: (event: ReactPointerEvent<HTMLElement>, targetId: string) => void;
  onDeleteEdge: (id: string) => void;
  onMentionToggle: () => void;
  onAddMentionToPrompt: (nodeId: string, image: CanvasImageRef) => void;
};

export function SmartCanvasBoard({
  canvas,
  viewport,
  selectedItemId,
  tool,
  connectState,
  draggingImages,
  boardRef,
  models,
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
  onItemPointerDown,
  onResizeItemPointerDown,
  onSelectItem,
  onOpenImage,
  onZoomIn,
  onZoomOut,
  onFit,
  onUpdateItemData,
  onRunGenerator,
  onDeleteItem,
  onStartConnect,
  onFinishConnect,
  onDeleteEdge,
  onMentionToggle,
  onAddMentionToPrompt,
}: SmartCanvasBoardProps) {
  const [nodeSizes, setNodeSizes] = useState<SmartCanvasNodeSizeMap>({});
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
    <section className="relative h-full min-h-0 flex-1 overflow-hidden bg-[#eef4fb] dark:bg-[#0b111c]">
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
                selected={edge.source === selectedItemId || edge.target === selectedItemId}
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
              selected={item.id === selectedItemId}
              models={models}
              running={running}
              mentionOpen={mentionOpen && item.id === selectedItemId}
              mentionItems={mentionItems}
              onPointerDown={(event) => onItemPointerDown(event, item)}
              onResizePointerDown={(event) => onResizeItemPointerDown(event, item)}
              onSelect={() => onSelectItem(item.id)}
              onOpenImage={onOpenImage}
              onUpdateData={(patch) => onUpdateItemData(item.id, patch)}
              onRunGenerator={() => onRunGenerator(item.id)}
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
              <div className="text-sm font-bold text-foreground dark:text-slate-200">从顶部添加节点，或拖入图片开始创作</div>
              <div className={cn("mt-1 text-xs", canvasSubtleTextClass)}>图片、Prompt、API生成、Output 都可以在节点里直接编辑。</div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="absolute bottom-4 left-6 z-30 flex overflow-hidden rounded-xl border border-border bg-card/90 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-950/85">
        <IconToolButton title="放大" onClick={onZoomIn}><ZoomIn className="size-4" /></IconToolButton>
        <IconToolButton title="缩小" onClick={onZoomOut}><ZoomOut className="size-4" /></IconToolButton>
        <IconToolButton title="适配内容" onClick={onFit}><BoxSelect className="size-4" /></IconToolButton>
      </div>
      <div className="absolute bottom-4 right-5 z-30 h-28 w-48 rounded-2xl border border-border bg-card/90 p-3 shadow-2xl backdrop-blur dark:border-slate-700 dark:bg-slate-950/80">
        <div className="relative h-full w-full rounded-lg border border-muted-foreground/40 dark:border-slate-500">
          {canvas?.nodes.slice(0, 8).map((item) => {
            const pos = item.position || {};
            return (
              <span
                key={item.id}
                className="absolute rounded-sm bg-sky-400"
                style={{
                  left: `${Math.max(4, Math.min(160, Number(pos.x || 0) / 12 + 40))}px`,
                  top: `${Math.max(4, Math.min(76, Number(pos.y || 0) / 12 + 30))}px`,
                  width: `${Math.max(14, NODE_SIZE[item.type].w / 12)}px`,
                  height: `${Math.max(8, NODE_SIZE[item.type].h / 18)}px`,
                }}
              />
            );
          })}
        </div>
      </div>
      <div className="absolute bottom-3 left-1/2 z-30 -translate-x-1/2 rounded-full bg-card/85 px-4 py-1 text-[11px] font-semibold text-muted-foreground shadow-sm backdrop-blur dark:bg-slate-950/70 dark:text-slate-500">
        按住空白画布拖拽可移动，滚轮缩放，拖动节点右侧端口可连线
      </div>
      <div className="absolute right-6 top-24 z-30 rounded-full border border-border bg-card/90 px-3 py-1 text-xs font-bold text-muted-foreground shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-950/80 dark:text-slate-400">
        {Math.round(viewport.zoom * 100)}%
      </div>
    </section>
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
  models: CanvasModelOption[];
  running: boolean;
  mentionOpen: boolean;
  mentionItems: CanvasImageRef[];
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onResizePointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onSelect: () => void;
  onOpenImage: (image: CanvasImageRef) => void;
  onUpdateData: (patch: Partial<SmartCanvasItem["data"]>) => void;
  onRunGenerator: () => void;
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
  models,
  running,
  mentionOpen,
  mentionItems,
  onPointerDown,
  onResizePointerDown,
  onSelect,
  onOpenImage,
  onUpdateData,
  onRunGenerator,
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
  const canInput = item.type === "image_generation" || item.type === "result";
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
        "group absolute rounded-2xl border bg-card/95 text-card-foreground shadow-[0_18px_46px_rgba(44,74,116,0.18)] backdrop-blur dark:bg-[#151c2a] dark:text-slate-100 dark:shadow-[0_18px_46px_rgba(0,0,0,0.36)]",
        selected ? "border-sky-500 ring-2 ring-sky-400/30 dark:border-slate-300 dark:ring-sky-400/40" : "border-border hover:border-muted-foreground/50 dark:border-slate-700/90 dark:hover:border-slate-500",
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
        onSelect();
      }}
    >
      {canInput ? <Port side="in" onPointerUp={onFinishConnect} /> : null}
      {canOutput ? <Port side="out" onPointerDown={onStartConnect} /> : null}
      <NodeHeader item={item} onDelete={onDeleteItem} />
      {item.type === "image" ? (
        <>
          <ImageNodeBody item={item} onOpenImage={onOpenImage} height={Math.max(120, minHeight - 86)} />
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
      ) : item.type === "image_generation" ? (
        <GeneratorNodeBody
          canvas={canvas}
          item={item}
          models={models}
          running={running}
          onUpdateData={onUpdateData}
          onRunGenerator={onRunGenerator}
          onOpenImage={onOpenImage}
        />
      ) : (
        <OutputNodeBody item={item} onOpenImage={onOpenImage} />
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

function ImageNodeBody({ item, onOpenImage, height }: { item: SmartCanvasItem; onOpenImage: (image: CanvasImageRef) => void; height: number }) {
  const images = item.data?.images || [];
  return (
    <div className="space-y-3 p-3">
      {images.length > 0 ? (
        <div style={{ height }}>
          <CanvasImageStrip images={images} limit={4} onOpen={onOpenImage} className="h-full grid-cols-2" large />
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

function GeneratorNodeBody({
  canvas,
  item,
  models,
  running,
  onUpdateData,
  onRunGenerator,
  onOpenImage,
}: {
  canvas: SmartCanvasDocument;
  item: SmartCanvasItem;
  models: CanvasModelOption[];
  running: boolean;
  onUpdateData: (patch: Partial<SmartCanvasItem["data"]>) => void;
  onRunGenerator: () => void;
  onOpenImage: (image: CanvasImageRef) => void;
}) {
  const upstream = incomingItems(canvas, item.id);
  const prompt = [
    ...upstream.filter((node) => node.type === "prompt").map((node) => canvasPromptFromItem(node)),
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
  const upstreamImageKeys = new Set(dedupeCanvasImageRefs(upstreamImages).map(canvasImageSource));
  const images = dedupeCanvasImageRefs([
    ...(item.data?.input_images || []).filter((image) => !upstreamImageKeys.has(canvasImageSource(image))),
    ...upstreamImages,
  ]);
  const outputImages = item.data?.output?.images || [];
  const nodeRunning = isActiveTask(item.data?.status);

  return (
    <div className="space-y-3 p-3" data-node-interactive="true" onPointerDown={stopNodeInteraction}>
      <div>
        <div className={cn("mb-1 text-[11px] font-black uppercase tracking-[0.14em]", canvasLabelClass)}>Prompts</div>
        <Textarea
          value={item.data?.prompt || ""}
          onChange={(event) => onUpdateData({ prompt: event.target.value })}
          className={cn("h-12 resize-none rounded-xl text-xs", canvasFieldClass)}
          placeholder={upstream.some((node) => node.type === "prompt") ? "已连接 Prompt，可在这里补充..." : "输入 Prompt 或连接 Prompt 节点..."}
        />
      </div>
      <div>
        <div className={cn("mb-1 text-[11px] font-black uppercase tracking-[0.14em]", canvasLabelClass)}>Images</div>
        {images.length > 0 ? (
          <CanvasImageStrip images={images} limit={4} onOpen={onOpenImage} className="grid-cols-5" />
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
        disabled={running || nodeRunning || !prompt.trim()}
        onClick={onRunGenerator}
      >
        {running || nodeRunning ? <LoaderCircle className="size-4 animate-spin" /> : <Zap className="size-4" />}
        API生成
      </Button>
    </div>
  );
}

function OutputNodeBody({ item, onOpenImage }: { item: SmartCanvasItem; onOpenImage: (image: CanvasImageRef) => void }) {
  const images = item.data?.output?.images || item.data?.images || [];
  return (
    <div className="p-3">
      {images.length > 0 ? (
        <CanvasImageStrip images={images} limit={4} onOpen={onOpenImage} className="grid-cols-4" large />
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
  className,
  large,
}: {
  images: CanvasImageRef[];
  limit?: number;
  onOpen?: (image: CanvasImageRef) => void;
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
          </button>
        );
      })}
    </div>
  );
}

export function SmartCanvasAssetSidebar({
  canvases,
  currentCanvasId,
  assets,
  loadingAssets,
  onSelectCanvas,
  onCreateCanvas,
  onRefreshAssets,
  onAddAssetToCanvas,
  onAddAssetToComposer,
}: {
  canvases: SmartCanvasDocument[];
  currentCanvasId: string;
  assets: ManagedImage[];
  loadingAssets: boolean;
  onSelectCanvas: (id: string) => void;
  onCreateCanvas: () => void;
  onRefreshAssets: () => void;
  onAddAssetToCanvas: (asset: ManagedImage) => void;
  onAddAssetToComposer: (asset: ManagedImage) => void;
}) {
  return (
    <aside className={cn("absolute bottom-[23rem] right-5 top-24 z-40 flex w-[300px] flex-col rounded-2xl border p-3 max-lg:hidden", canvasPanelClass)}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-bold text-foreground dark:text-slate-100">图片库</div>
          <div className={cn("text-xs", canvasSubtleTextClass)}>{canvases.length} 个画布 · 点击加入输入</div>
        </div>
        <div className="flex gap-1">
          <Button type="button" size="icon" variant="ghost" className={cn("size-8 rounded-lg", canvasIconButtonClass)} onClick={onCreateCanvas}>
            <ImagePlus className="size-4" />
          </Button>
          <Button type="button" size="icon" variant="ghost" className={cn("size-8 rounded-lg", canvasIconButtonClass)} onClick={onRefreshAssets}>
            {loadingAssets ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          </Button>
        </div>
      </div>
      <div className="mt-3 max-h-36 space-y-1 overflow-auto pr-1">
        {canvases.map((item) => (
          <button
            key={item.id || item.name}
            type="button"
            className={cn(
              "w-full rounded-xl border px-3 py-2 text-left text-xs transition",
              item.id === currentCanvasId
                ? "border-sky-500/70 bg-sky-500/10 text-sky-700 dark:text-sky-100"
                : "border-border bg-background/70 text-foreground hover:bg-accent dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300 dark:hover:bg-slate-800",
            )}
            onClick={() => item.id && onSelectCanvas(item.id)}
          >
            <div className="truncate font-bold">{item.name}</div>
            <div className={cn("text-[11px]", canvasSubtleTextClass)}>{item.nodes.length} 个节点</div>
          </button>
        ))}
      </div>
      <div className="mt-3 min-h-0 flex-1 overflow-auto pr-1">
        {assets.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {assets.map((asset, index) => (
              <AssetTile
                key={`${asset.path}-${index}`}
                asset={asset}
                onDragStart={(event) => {
                  event.dataTransfer.setData("application/x-chatgpt2api-managed-image", JSON.stringify(asset));
                  event.dataTransfer.effectAllowed = "copy";
                }}
                onAddToCanvas={() => onAddAssetToCanvas(asset)}
                onAddToComposer={() => onAddAssetToComposer(asset)}
              />
            ))}
          </div>
        ) : (
          <div className={cn("rounded-xl border p-4 text-center text-xs", canvasDashedClass)}>图片库暂无图片</div>
        )}
      </div>
    </aside>
  );
}

export function SmartCanvasInspector({
  canvas,
  selectedItem,
  saveState,
  onNameChange,
  onDeleteSelected,
  onAddSelectedImagesToComposer,
  onOpenImage,
}: {
  canvas: SmartCanvasDocument | null;
  selectedItem: SmartCanvasItem | null;
  saveState: SmartCanvasSaveState;
  onNameChange: (name: string) => void;
  onDeleteSelected: () => void;
  onAddSelectedImagesToComposer: () => void;
  onOpenImage: (image: CanvasImageRef) => void;
}) {
  const runs = smartCanvasRuns(canvas);
  const selectedImages = canvasImagesFromItem(selectedItem);
  return (
    <aside className="absolute bottom-4 right-5 z-30 block w-[300px] max-lg:hidden">
      <div className={cn("rounded-2xl border p-3", canvasPanelClass)}>
        <div className="mb-2 flex items-center justify-between">
          <div className={cn("text-xs font-black uppercase tracking-[0.16em]", canvasLabelClass)}>运行记录</div>
          <SaveStateDot state={saveState} />
        </div>
        <Input
          value={canvas?.name || ""}
          onChange={(event) => onNameChange(event.target.value)}
          className={cn("mb-2 h-8 rounded-lg text-xs", canvasFieldClass)}
          data-node-interactive="true"
        />
        {selectedItem ? (
          <div className="mb-2 rounded-xl border border-border bg-background/70 p-2 dark:border-slate-800 dark:bg-slate-950/45">
            <div className="truncate text-xs font-bold text-foreground dark:text-slate-200">{nodeTitle(selectedItem)}</div>
            <div className={cn("mt-1 text-[11px]", canvasSubtleTextClass)}>{selectedImages.length} 张图片</div>
            {selectedImages.length > 0 ? <CanvasImageStrip images={selectedImages} limit={3} onOpen={onOpenImage} className="mt-2 grid-cols-3" /> : null}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button type="button" size="sm" variant="outline" className={cn("h-7 rounded-lg text-xs", canvasGhostButtonClass)} onClick={onAddSelectedImagesToComposer} disabled={selectedImages.length === 0}>输入</Button>
              <Button type="button" size="sm" variant="destructive" className="h-7 rounded-lg text-xs" onClick={onDeleteSelected}>删除</Button>
            </div>
          </div>
        ) : null}
        <div className="max-h-40 space-y-2 overflow-auto pr-1">
          {runs.length > 0 ? runs.map((run) => <RunRecordCard key={run.id} run={run} />) : (
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
  onAddToCanvas,
  onAddToComposer,
}: {
  asset: ManagedImage;
  onDragStart: (event: React.DragEvent<HTMLDivElement>) => void;
  onAddToCanvas: () => void;
  onAddToComposer: () => void;
}) {
  return (
    <div className="group overflow-hidden rounded-xl border border-border bg-background dark:border-slate-800 dark:bg-slate-950" draggable onDragStart={onDragStart}>
      <button type="button" className="block w-full" onClick={onAddToComposer} title="加入输入">
        <AuthenticatedImage
          src={asset.thumbnail_url || asset.url}
          alt={asset.name}
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
