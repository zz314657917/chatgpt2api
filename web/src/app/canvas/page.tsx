"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  addEdge,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
  type OnSelectionChangeParams,
  type ReactFlowInstance,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Bot,
  DatabaseZap,
  Image as ImageIcon,
  Layers3,
  LoaderCircle,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Play,
  Save,
  Square,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";

import { AuthenticatedImage } from "@/components/authenticated-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  cancelCanvasRun,
  createCanvas,
  deleteCanvas,
  fetchCanvasModels,
  fetchCanvasRun,
  fetchCanvasRuns,
  fetchCanvases,
  saveCanvas,
  startCanvasRun,
  type CanvasDocument,
  type CanvasEdge,
  type CanvasImageRef,
  type CanvasModelOption,
  type CanvasNode,
  type CanvasNodeData,
  type CanvasNodeOutput,
  type CanvasNodeType,
  type CanvasRun,
  type CanvasRunStatus,
} from "@/lib/api";
import { getManagedImageThumbnailUrlFromPath, getManagedImageUrlFromPath } from "@/lib/image-path";
import { cn } from "@/lib/utils";
import { useAuthGuard } from "@/lib/use-auth-guard";

type FlowNodeData = {
  [key: string]: unknown;
  title: string;
  type: CanvasNodeType;
  model?: string;
  prompt?: string;
  text?: string;
  url?: string;
  status?: CanvasRunStatus;
  error?: string;
  output?: CanvasNodeOutput;
};

type FlowNodePosition = {
  x: number;
  y: number;
};

type SyncFlowOptions = {
  preservePositions?: boolean;
  selectedIds?: string[];
};

const NODE_TYPES = {
  canvasNode: memo(CanvasFlowNode),
};

const NODE_CATALOG: Array<{
  type: CanvasNodeType;
  label: string;
  desc: string;
  icon: ReactNode;
}> = [
  { type: "text", label: "文本", desc: "输入固定文本", icon: <Bot className="size-4" /> },
  { type: "prompt", label: "提示词优化", desc: "输出优化 prompt", icon: <WandSparkles className="size-4" /> },
  { type: "image_generation", label: "文生图", desc: "生成图片", icon: <ImageIcon className="size-4" /> },
  { type: "image_edit", label: "图生图", desc: "读取上游图片", icon: <Layers3 className="size-4" /> },
  { type: "image", label: "图片源", desc: "手动图片引用", icon: <DatabaseZap className="size-4" /> },
  { type: "result", label: "结果", desc: "汇总输出", icon: <Play className="size-4" /> },
];

function CanvasFlowNode({ data, selected }: NodeProps<Node<FlowNodeData>>) {
  const summary = nodeOutputSummary(data.output);
  const outputImages = data.output?.images || [];
  const hasInput = data.type !== "text" && data.type !== "image";
  const hasOutput = data.type !== "result";

  return (
    <div
      className={cn(
        "relative w-[270px] rounded-xl border bg-card/95 text-card-foreground shadow-[0_16px_45px_rgba(15,23,42,0.16)] backdrop-blur",
        selected ? "border-[#1456f0]/60 ring-2 ring-[#1456f0]/20" : "border-border",
      )}
    >
      {hasInput ? <Handle type="target" position={Position.Left} className="!size-3 !border-2 !border-background !bg-[#1456f0]" /> : null}
      {hasOutput ? <Handle type="source" position={Position.Right} className="!size-3 !border-2 !border-background !bg-[#1456f0]" /> : null}
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{data.title}</div>
          {data.model ? <div className="truncate text-xs text-muted-foreground">{data.model}</div> : null}
        </div>
        {data.status ? <Badge variant={statusVariant(data.status)} className="rounded-md px-2 py-0.5 text-[11px]">{statusLabel(data.status)}</Badge> : null}
      </div>
      <div className="space-y-2 px-3 py-3 text-xs text-muted-foreground">
        <div className="line-clamp-2 min-h-8">{nodePreview(data)}</div>
        {summary ? <div className="rounded-lg bg-muted/50 px-2 py-1.5">{summary}</div> : null}
        {outputImages.length > 0 ? <CanvasImageStrip images={outputImages} limit={3} /> : null}
        {data.error ? <div className="rounded-lg bg-rose-50 px-2 py-1.5 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">{data.error}</div> : null}
      </div>
    </div>
  );
}

function CanvasImageStrip({ images, limit = images.length }: { images: CanvasImageRef[]; limit?: number }) {
  const visible = images.slice(0, limit);
  if (visible.length === 0) {
    return null;
  }
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {visible.map((image, index) => {
        const src = canvasImagePreviewSource(image) || canvasImageSource(image);
        const href = canvasImageSource(image) || src;
        return (
          <button
            key={`${href || image.path || image.name || "image"}-${index}`}
            type="button"
            className="group relative aspect-square overflow-hidden rounded-md border border-border bg-muted/60"
            onClick={(event) => {
              event.stopPropagation();
              if (href) {
                window.open(href, "_blank", "noopener,noreferrer");
              }
            }}
            title={canvasImageLabel(image, index)}
          >
            {src ? (
              <AuthenticatedImage
                src={src}
                alt={canvasImageAlt(image, index)}
                className="h-full w-full object-cover transition duration-150 group-hover:scale-[1.03]"
                placeholderClassName="min-h-0 h-full text-muted-foreground dark:bg-muted"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                <ImageIcon className="size-4" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function CanvasOutputPanel({ output }: { output?: CanvasNodeOutput }) {
  if (!output) {
    return null;
  }
  const images = output.images || [];
  if (!output.text && images.length === 0 && !output.task_id) {
    return null;
  }
  return (
    <div className="rounded-lg bg-muted/45 p-3 text-sm">
      {output.text ? <div className="max-h-32 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">{output.text}</div> : null}
      {images.length > 0 ? (
        <div className={cn("grid gap-2", output.text ? "mt-3" : "", images.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
          {images.map((image, index) => {
            const src = canvasImagePreviewSource(image) || canvasImageSource(image);
            const href = canvasImageSource(image) || src;
            return (
              <button
                key={`${href || image.path || image.name || "image"}-${index}`}
                type="button"
                className="group overflow-hidden rounded-lg border border-border bg-background text-left"
                onClick={() => {
                  if (href) {
                    window.open(href, "_blank", "noopener,noreferrer");
                  }
                }}
                title="打开原图"
              >
                {src ? (
                  <AuthenticatedImage
                    src={src}
                    alt={canvasImageAlt(image, index)}
                    className="aspect-square w-full object-cover transition duration-150 group-hover:scale-[1.02]"
                    placeholderClassName="min-h-32 dark:bg-muted"
                  />
                ) : (
                  <span className="flex aspect-square w-full items-center justify-center bg-muted text-muted-foreground">
                    <ImageIcon className="size-5" />
                  </span>
                )}
                <span className="block truncate px-2 py-1.5 text-xs text-muted-foreground">{canvasImageLabel(image, index)}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      {!output.text && images.length === 0 && output.task_id ? <div className="text-xs text-muted-foreground">任务 {output.task_id}</div> : null}
    </div>
  );
}

function createNodeId(type: CanvasNodeType) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${type}-${crypto.randomUUID()}`;
  }
  return `${type}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createCanvasNode(type: CanvasNodeType, index = 0): CanvasNode {
  const catalog = NODE_CATALOG.find((item) => item.type === type);
  return {
    id: createNodeId(type),
    type,
    name: catalog?.label || type,
    position: { x: 120 + index * 80, y: 120 + index * 34 },
    data: defaultNodeData(type),
  };
}

function defaultNodeData(type: CanvasNodeType): CanvasNodeData {
  switch (type) {
    case "text":
      return { text: "输入一段文本" };
    case "prompt":
      return { model: "auto", prompt: "", instruction: "优化提示词，输出直接可用于图片生成的内容" };
    case "image_generation":
      return { model: "auto", prompt: "生成一张图片", size: "1024x1024", n: 1, visibility: "private" };
    case "image_edit":
      return { model: "auto", prompt: "基于上游图片做编辑", size: "1024x1024", n: 1, visibility: "private" };
    case "image":
      return { url: "" };
    case "result":
      return {};
  }
}

function normalizeCanvas(canvas?: CanvasDocument | null): CanvasDocument | null {
  if (!canvas) {
    return null;
  }
  return {
    ...canvas,
    name: canvas.name || "未命名画布",
    nodes: Array.isArray(canvas.nodes)
      ? canvas.nodes.map((node) => ({
          ...node,
          data: node.data ? { ...node.data } : {},
          position: node.position ? { ...node.position } : {},
        }))
      : [],
    edges: Array.isArray(canvas.edges) ? canvas.edges.map((edge) => ({ ...edge })) : [],
  };
}

function toFlowNode(node: CanvasNode, run?: CanvasRun | null, selected = false, position?: FlowNodePosition): Node<FlowNodeData> {
  const state = run?.node_states?.[node.id];
  return {
    id: node.id,
    type: "canvasNode",
    selected,
    position: position || { x: Number(node.position?.x ?? 0), y: Number(node.position?.y ?? 0) },
    data: {
      title: node.name || NODE_CATALOG.find((item) => item.type === node.type)?.label || node.type,
      type: node.type,
      model: String(node.data?.model || ""),
      prompt: String(node.data?.prompt || ""),
      text: String(node.data?.text || ""),
      url: String(node.data?.url || node.data?.image_url || ""),
      status: state?.status,
      error: state?.error,
      output: state?.output,
    },
  };
}

function toFlowEdge(edge: CanvasEdge): Edge {
  return {
    id: edge.id || `${edge.source}->${edge.target}`,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.source_handle || undefined,
    targetHandle: edge.target_handle || undefined,
  };
}

function toCanvasEdges(edges: Edge[]): CanvasEdge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    source_handle: edge.sourceHandle || "",
    target_handle: edge.targetHandle || "",
  }));
}

function nodePreview(data: FlowNodeData) {
  switch (data.type) {
    case "text":
      return data.text || "文本内容";
    case "image":
      return data.url || "图片 URL / 图片库路径";
    case "result":
      return "汇总上游文本和图片";
    default:
      return data.prompt || "等待上游输入";
  }
}

function nodeOutputSummary(output?: CanvasNodeOutput) {
  if (!output) {
    return "";
  }
  if (output.images?.length) {
    return `${output.images.length} 张图片输出`;
  }
  if (output.text) {
    return output.text.length > 68 ? `${output.text.slice(0, 68)}...` : output.text;
  }
  return output.task_id ? `任务 ${output.task_id}` : "";
}

function statusVariant(status?: CanvasRunStatus) {
  switch (status) {
    case "success":
      return "success";
    case "error":
    case "cancelled":
      return "danger";
    case "blocked":
      return "warning";
    case "running":
      return "info";
    default:
      return "secondary";
  }
}

function statusLabel(status: CanvasRunStatus) {
  switch (status) {
    case "queued":
      return "等待";
    case "running":
      return "运行";
    case "success":
      return "成功";
    case "error":
      return "失败";
    case "cancelled":
      return "取消";
    case "blocked":
      return "阻断";
    default:
      return status;
  }
}

function isRunActive(run: CanvasRun | null) {
  return run?.status === "queued" || run?.status === "running";
}

function modelOptionsForNode(models: CanvasModelOption[], type?: CanvasNodeType) {
  if (type === "image_generation" || type === "image_edit") {
    return models.filter((model) => model.kind === "image" || model.kind === "both");
  }
  if (type === "prompt") {
    return models.filter((model) => model.kind === "text" || model.kind === "both");
  }
  return models;
}

function canvasImageUrl(value?: string) {
  return String(value || "").trim();
}

function sameStringArray(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

type CanvasSaveState = "saved" | "dirty" | "saving" | "error";

function saveStateLabel(state: CanvasSaveState) {
  switch (state) {
    case "saving":
      return "保存中";
    case "saved":
      return "已保存";
    case "error":
      return "保存失败";
    default:
      return "未保存";
  }
}

function saveStateVariant(state: CanvasSaveState) {
  switch (state) {
    case "saving":
      return "info";
    case "saved":
      return "success";
    case "error":
      return "danger";
    default:
      return "warning";
  }
}

function canvasImageSource(ref: CanvasImageRef) {
  const direct = String(ref.local_url || ref.url || "").trim();
  if (direct) {
    return direct;
  }
  return ref.path ? getManagedImageUrlFromPath(ref.path) : "";
}

function canvasImagePreviewSource(ref: CanvasImageRef) {
  const direct = String(ref.local_url || ref.url || "").trim();
  if (direct) {
    return direct;
  }
  return ref.path ? getManagedImageThumbnailUrlFromPath(ref.path) : "";
}

function canvasImageLabel(ref: CanvasImageRef, index: number) {
  return ref.name || `图片 ${index + 1}`;
}

function canvasImageAlt(ref: CanvasImageRef, index: number) {
  return canvasImageLabel(ref, index);
}

export default function CanvasPage() {
  const { isCheckingAuth, session } = useAuthGuard(undefined, "/canvas");
  const [canvases, setCanvases] = useState<CanvasDocument[]>([]);
  const [canvas, setCanvas] = useState<CanvasDocument | null>(null);
  const [models, setModels] = useState<CanvasModelOption[]>([]);
  const [runs, setRuns] = useState<CanvasRun[]>([]);
  const [activeRun, setActiveRun] = useState<CanvasRun | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<FlowNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [saveState, setSaveState] = useState<CanvasSaveState>("saved");
  const [leftCollapsed, setLeftCollapsed] = useState(() => (
    typeof window !== "undefined" && window.localStorage.getItem("chatgpt2api.canvas.leftCollapsed") === "1"
  ));
  const [rightCollapsed, setRightCollapsed] = useState(() => (
    typeof window !== "undefined" && window.localStorage.getItem("chatgpt2api.canvas.rightCollapsed") === "1"
  ));
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const reactFlowRef = useRef<ReactFlowInstance<Node<FlowNodeData>, Edge> | null>(null);
  const canvasRef = useRef<CanvasDocument | null>(null);
  const activeRunRef = useRef<CanvasRun | null>(null);
  const nodesRef = useRef<Node<FlowNodeData>[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  const selectedNodeIdRef = useRef("");
  const selectedNodeIdsRef = useRef<string[]>([]);
  const autosaveTimerRef = useRef<number | null>(null);
  const dirtyVersionRef = useRef(0);
  const saveStateRef = useRef<CanvasSaveState>("saved");

  const selectedCanvasNode = useMemo(
    () => canvas?.nodes.find((node) => node.id === selectedNodeId) || null,
    [canvas?.nodes, selectedNodeId],
  );

  useEffect(() => {
    canvasRef.current = canvas;
  }, [canvas]);

  useEffect(() => {
    activeRunRef.current = activeRun;
  }, [activeRun]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  useEffect(() => {
    saveStateRef.current = saveState;
  }, [saveState]);

  const setSelection = useCallback((ids: string[]) => {
    selectedNodeIdsRef.current = ids;
    selectedNodeIdRef.current = ids[0] || "";
    setSelectedNodeIds((current) => (sameStringArray(current, ids) ? current : ids));
    setSelectedNodeId((current) => (current === (ids[0] || "") ? current : ids[0] || ""));
  }, []);

  const clearSelection = useCallback(() => {
    setSelection([]);
  }, [setSelection]);

  const syncFlow = useCallback((nextCanvas: CanvasDocument | null, run?: CanvasRun | null, options: SyncFlowOptions = {}) => {
    if (!nextCanvas) {
      setNodes([]);
      setEdges([]);
      return;
    }
    const effectiveRun = run === undefined ? activeRunRef.current : run;
    const selectedIds = options.selectedIds ?? selectedNodeIdsRef.current;
    const selected = new Set(selectedIds);
    const flowPositions = options.preservePositions === false
      ? new Map<string, FlowNodePosition>()
      : new Map(nodesRef.current.map((node) => [node.id, node.position]));
    setNodes(nextCanvas.nodes.map((node) => toFlowNode(node, effectiveRun, selected.has(node.id), flowPositions.get(node.id))));
    setEdges(nextCanvas.edges.map(toFlowEdge));
  }, [setEdges, setNodes]);

  const clearAutosaveTimer = useCallback(() => {
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
  }, []);

  const applyCanvas = useCallback((nextCanvas: CanvasDocument | null, run: CanvasRun | null = null) => {
    const normalized = normalizeCanvas(nextCanvas);
    setCanvas(normalized);
    canvasRef.current = normalized;
    setActiveRun(run);
    setSaveState("saved");
    clearAutosaveTimer();
    clearSelection();
    syncFlow(normalized, run, { preservePositions: false, selectedIds: [] });
  }, [clearAutosaveTimer, clearSelection, syncFlow]);

  const refreshRuns = useCallback(async (canvasId: string) => {
    const items = await fetchCanvasRuns(canvasId);
    setRuns(items);
    return items;
  }, []);

  const refreshCanvases = useCallback(async () => {
    const items = await fetchCanvases();
    setCanvases(items);
    return items;
  }, []);

  const buildCanvasPayload = useCallback(() => {
    const currentCanvas = canvasRef.current;
    if (!currentCanvas) {
      return null;
    }
    const nodePositions = new Map(nodesRef.current.map((node) => [node.id, node.position]));
    return {
      ...currentCanvas,
      nodes: currentCanvas.nodes.map((node) => ({
        ...node,
        position: {
          x: nodePositions.get(node.id)?.x ?? node.position?.x ?? 0,
          y: nodePositions.get(node.id)?.y ?? node.position?.y ?? 0,
        },
      })),
      edges: toCanvasEdges(edgesRef.current),
      viewport: reactFlowRef.current?.getViewport?.() || currentCanvas.viewport,
    };
  }, []);

  const persistCanvas = useCallback(async (options: { silent?: boolean; expectedVersion?: number } = {}) => {
    const payload = buildCanvasPayload();
    if (!payload) {
      return null;
    }
    clearAutosaveTimer();
    setSaving(true);
    setSaveState("saving");
    try {
      const saved = payload.id ? await saveCanvas(payload) : await createCanvas(payload);
      const normalized = normalizeCanvas(saved);
      if (!normalized) {
        return null;
      }
      setCanvases((items) => {
        const index = items.findIndex((item) => item.id === normalized.id);
        if (index === -1) {
          return [normalized, ...items.filter((item) => item.id !== "")];
        }
        const next = [...items];
        next[index] = normalized;
        return next;
      });
      setCanvas(normalized);
      canvasRef.current = normalized;
      if (options.expectedVersion === undefined || dirtyVersionRef.current === options.expectedVersion) {
        setSaveState("saved");
      } else {
        setSaveState("dirty");
      }
      if (!options.silent) {
        toast.success("画布已保存");
      }
      return saved;
    } catch (error) {
      setSaveState("error");
      if (!options.silent) {
        toast.error(error instanceof Error ? error.message : "保存失败");
      }
      return null;
    } finally {
      setSaving(false);
    }
  }, [buildCanvasPayload, clearAutosaveTimer]);

  const scheduleAutosave = useCallback(() => {
    clearAutosaveTimer();
    const version = dirtyVersionRef.current;
    autosaveTimerRef.current = window.setTimeout(() => {
      autosaveTimerRef.current = null;
      void persistCanvas({ silent: true, expectedVersion: version });
    }, 5000);
  }, [clearAutosaveTimer, persistCanvas]);

  const markDirty = useCallback(() => {
    dirtyVersionRef.current += 1;
    setSaveState("dirty");
    scheduleAutosave();
  }, [scheduleAutosave]);

  const patchCanvasNode = useCallback((nodeId: string, patch: Partial<CanvasNodeData>, name?: string) => {
    setCanvas((current) => {
      if (!current) {
        return current;
      }
      const next = {
        ...current,
        nodes: current.nodes.map((node) => (node.id === nodeId
          ? {
              ...node,
              ...(name !== undefined ? { name } : {}),
              data: node.data ? { ...node.data, ...patch } : { ...patch },
            }
          : node)),
      };
      canvasRef.current = next;
      return next;
    });
    setNodes((current) => current.map((node) => {
      if (node.id !== nodeId) {
        return node;
      }
      const nextTitle = name !== undefined
        ? (name || NODE_CATALOG.find((item) => item.type === node.data.type)?.label || String(node.data.type))
        : node.data.title;
      return {
        ...node,
        data: {
          ...node.data,
          ...patch,
          ...(name !== undefined ? { title: nextTitle } : {}),
        },
      };
    }));
    markDirty();
  }, [markDirty, setNodes]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        setLoading(true);
        const [modelItems, canvasItems] = await Promise.all([fetchCanvasModels(), fetchCanvases()]);
        if (!active) {
          return;
        }
        setModels(modelItems);
        setCanvases(canvasItems);
        const first = normalizeCanvas(canvasItems[0]);
        setCanvas(first);
        canvasRef.current = first;
        setSaveState("saved");
        syncFlow(first, null, { preservePositions: false, selectedIds: [] });
        if (first?.id) {
          void refreshRuns(first.id);
        }
      } catch (error) {
        if (active) {
          toast.error(error instanceof Error ? error.message : "加载画布失败");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [refreshRuns, syncFlow]);

  useEffect(() => {
    if (!isRunActive(activeRun)) {
      return;
    }
    const timer = window.setInterval(async () => {
      try {
        const latest = await fetchCanvasRun(activeRun!.id);
        setActiveRun(latest);
        setRuns((items) => [latest, ...items.filter((item) => item.id !== latest.id)]);
        syncFlow(canvas, latest);
      } catch {
        //
      }
    }, 1200);
    return () => window.clearInterval(timer);
  }, [activeRun, canvas, syncFlow]);

  const updateCanvasNode = (nodeId: string, patch: Partial<CanvasNodeData>) => {
    patchCanvasNode(nodeId, patch);
  };

  const updateNodeCanvasAndFlow = (nodeId: string, patch: Partial<CanvasNodeData> & { name?: string }) => {
    const { name, ...dataPatch } = patch;
    patchCanvasNode(nodeId, dataPatch, name);
  };

  const updateCanvasName = (name: string) => {
    setCanvas((current) => {
      if (!current) {
        return current;
      }
      const next = { ...current, name };
      canvasRef.current = next;
      return next;
    });
    markDirty();
  };

  const addNode = (type: CanvasNodeType) => {
    setCanvas((current) => {
      const base = current || { id: "", name: "未命名画布", nodes: [], edges: [] };
      const next = {
        ...base,
        nodes: [...base.nodes, createCanvasNode(type, base.nodes.length)],
      };
      canvasRef.current = next;
      syncFlow(next);
      return next;
    });
    markDirty();
  };

  const removeSelectedNode = () => {
    if (!selectedNodeId) {
      return;
    }
    setCanvas((current) => {
      if (!current) {
        return current;
      }
      const next = {
        ...current,
        nodes: current.nodes.filter((node) => node.id !== selectedNodeId),
        edges: current.edges.filter((edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId),
      };
      canvasRef.current = next;
      clearSelection();
      syncFlow(next);
      return next;
    });
    markDirty();
  };

  const confirmPendingChanges = useCallback(() => {
    const state = saveStateRef.current;
    if (state !== "dirty" && state !== "error") {
      return true;
    }
    return window.confirm("当前画布还有未保存的修改，确定要离开吗？");
  }, []);

  const createNewCanvas = async () => {
    if (!confirmPendingChanges()) {
      return;
    }
    const first = createCanvasNode("text", 0);
    const second = createCanvasNode("image_generation", 1);
    const third = createCanvasNode("result", 2);
    second.position = { x: 440, y: 130 };
    third.position = { x: 780, y: 130 };
    const draft = normalizeCanvas({
      id: "",
      name: "未命名画布",
      nodes: [first, second, third],
      edges: [
        { id: `${first.id}->${second.id}`, source: first.id, target: second.id },
        { id: `${second.id}->${third.id}`, source: second.id, target: third.id },
      ],
    });
    setRuns([]);
    setCanvas(draft);
    canvasRef.current = draft;
    setActiveRun(null);
    clearSelection();
    syncFlow(draft, null, { preservePositions: false, selectedIds: [] });
    markDirty();
  };

  const selectCanvas = async (item: CanvasDocument) => {
    if (item.id === canvasRef.current?.id) {
      return;
    }
    if (!confirmPendingChanges()) {
      return;
    }
    const normalized = normalizeCanvas(item);
    applyCanvas(normalized);
    if (normalized?.id) {
      await refreshRuns(normalized.id);
    }
  };

  const deleteCurrentCanvas = async () => {
    if (!canvas?.id) {
      return;
    }
    if (!confirmPendingChanges()) {
      return;
    }
    await deleteCanvas(canvas.id);
    const items = await refreshCanvases();
    applyCanvas(items[0] || null);
    if (items[0]?.id) {
      await refreshRuns(items[0].id);
    } else {
      setRuns([]);
    }
  };

  const runCanvas = async (nodeIds: string[] = []) => {
    setRunning(true);
    try {
      const saved = await persistCanvas();
      if (!saved?.id) {
        return;
      }
      const run = await startCanvasRun(saved.id, nodeIds);
      setActiveRun(run);
      setRuns((items) => [run, ...items.filter((item) => item.id !== run.id)]);
      syncFlow(saved, run);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "运行失败");
    } finally {
      setRunning(false);
    }
  };

  const cancelRun = async () => {
    if (!activeRun) {
      return;
    }
    const cancelled = await cancelCanvasRun(activeRun.id);
    setActiveRun(cancelled);
    setRuns((items) => items.map((item) => item.id === cancelled.id ? cancelled : item));
    syncFlow(canvas, cancelled);
  };

  const onConnect = (connection: Connection) => {
    if (!connection.source || !connection.target) {
      return;
    }
    const edge: Edge = {
      id: `${connection.source}->${connection.target}`,
      source: connection.source,
      target: connection.target,
      sourceHandle: connection.sourceHandle,
      targetHandle: connection.targetHandle,
    };
    setEdges((items) => addEdge(edge, items));
    markDirty();
  };

  const handleNodesChange = useCallback((changes: NodeChange<Node<FlowNodeData>>[]) => {
    onNodesChange(changes);
    const removedIds = changes.filter((change) => change.type === "remove").map((change) => change.id);
    if (removedIds.length > 0) {
      const removed = new Set(removedIds);
      setCanvas((current) => {
        if (!current) {
          return current;
        }
        const next = {
          ...current,
          nodes: current.nodes.filter((node) => !removed.has(node.id)),
          edges: current.edges.filter((edge) => !removed.has(edge.source) && !removed.has(edge.target)),
        };
        canvasRef.current = next;
        return next;
      });
      markDirty();
    }
  }, [markDirty, onNodesChange]);

  const handleEdgesChange = useCallback((changes: EdgeChange<Edge>[]) => {
    onEdgesChange(changes);
    const removedIds = changes.filter((change) => change.type === "remove").map((change) => change.id);
    if (removedIds.length > 0) {
      const removed = new Set(removedIds);
      setCanvas((current) => {
        if (!current) {
          return current;
        }
        const next = {
          ...current,
          edges: current.edges.filter((edge) => !removed.has(edge.id || `${edge.source}->${edge.target}`)),
        };
        canvasRef.current = next;
        return next;
      });
      markDirty();
    }
  }, [markDirty, onEdgesChange]);

  const handleNodeDragStop = useCallback(() => {
    markDirty();
  }, [markDirty]);

  useEffect(() => {
    const left = window.localStorage.getItem("chatgpt2api.canvas.leftCollapsed");
    const right = window.localStorage.getItem("chatgpt2api.canvas.rightCollapsed");
    setLeftCollapsed(left === "1");
    setRightCollapsed(right === "1");
  }, []);

  useEffect(() => {
    window.localStorage.setItem("chatgpt2api.canvas.leftCollapsed", leftCollapsed ? "1" : "0");
  }, [leftCollapsed]);

  useEffect(() => {
    window.localStorage.setItem("chatgpt2api.canvas.rightCollapsed", rightCollapsed ? "1" : "0");
  }, [rightCollapsed]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (saveStateRef.current !== "dirty" && saveStateRef.current !== "error") {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      clearAutosaveTimer();
    };
  }, [clearAutosaveTimer]);

  const onSelectionChange = useCallback(({ nodes: selected }: OnSelectionChangeParams<Node<FlowNodeData>, Edge>) => {
    setSelection(selected.map((node) => node.id));
  }, [setSelection]);

  if (isCheckingAuth || !session) {
    return null;
  }

  const nodeModelOptions = modelOptionsForNode(models, selectedCanvasNode?.type);
  const selectedRunState = selectedNodeId && activeRun ? activeRun.node_states[selectedNodeId] : null;
  const canvasGridStyle: CSSProperties & { "--canvas-grid-columns": string } = {
    "--canvas-grid-columns": `${leftCollapsed ? "64px" : "280px"} minmax(0, 1fr) ${rightCollapsed ? "64px" : "340px"}`,
  };

  return (
    <div className="flex h-[calc(100dvh-5.75rem)] min-h-[680px] w-full flex-col gap-3 pb-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display text-2xl font-semibold tracking-tight">无限画布</div>
          <div className="text-sm text-muted-foreground">节点只选择可用模型，密钥与分组继续由 Sub2API 路由处理。</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={saveStateVariant(saveState)} className="rounded-md px-2.5 py-1">{saveStateLabel(saveState)}</Badge>
          <Button variant="outline" onClick={createNewCanvas}><Plus className="size-4" />新建</Button>
          <Button variant="outline" onClick={() => void persistCanvas()} disabled={saving || !canvas}><Save className="size-4" />保存</Button>
          <Button onClick={() => runCanvas(selectedNodeIds)} disabled={running || !canvas}>
            {running ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4" />}
            {selectedNodeIds.length > 0 ? "运行选中" : "运行整图"}
          </Button>
          <Button variant="secondary" onClick={cancelRun} disabled={!isRunActive(activeRun)}><Square className="size-4" />取消</Button>
          <Button variant="destructive" onClick={deleteCurrentCanvas} disabled={!canvas?.id}><Trash2 className="size-4" />删除</Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[var(--canvas-grid-columns)]" style={canvasGridStyle}>
        <Card className="min-h-0 overflow-hidden rounded-lg">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              {!leftCollapsed ? (
                <div>
                  <CardTitle className="text-base">画布</CardTitle>
                  <CardDescription>{loading ? "加载中" : `${canvases.filter((item) => item.id).length} 个画布`}</CardDescription>
                </div>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="ml-auto"
                onClick={() => setLeftCollapsed((value) => !value)}
                title={leftCollapsed ? "展开左侧面板" : "折叠左侧面板"}
              >
                {leftCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
              </Button>
            </div>
          </CardHeader>
          <CardContent className={cn("h-full overflow-y-auto", leftCollapsed ? "space-y-2 px-2" : "space-y-3")}>
            {leftCollapsed ? (
              <div className="flex flex-col items-center gap-2">
                {NODE_CATALOG.map((item) => (
                  <Button
                    key={item.type}
                    type="button"
                    variant="outline"
                    size="icon"
                    title={item.label}
                    onClick={() => addNode(item.type)}
                  >
                    {item.icon}
                  </Button>
                ))}
              </div>
            ) : (
              <>
            <Input
              value={canvas?.name || ""}
              onChange={(event) => updateCanvasName(event.target.value)}
              placeholder="画布名称"
              className="h-10 rounded-lg"
            />
            <div className="max-h-[240px] space-y-2 overflow-y-auto pr-1">
              {canvases.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={cn(
                    "w-full rounded-lg border px-3 py-2 text-left transition",
                    canvas?.id === item.id ? "border-[#1456f0]/40 bg-[#edf4ff] dark:bg-sky-950/30" : "border-border bg-background hover:bg-accent",
                  )}
                  onClick={() => void selectCanvas(item)}
                >
                  <div className="truncate text-sm font-medium">{item.name}</div>
                  <div className="text-xs text-muted-foreground">{item.nodes.length} 节点 · {item.edges.length} 连线</div>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-border pt-3">
              {NODE_CATALOG.map((item) => (
                <Button
                  key={item.type}
                  type="button"
                  variant="outline"
                  className="h-auto justify-start rounded-lg px-2.5 py-2"
                  onClick={() => addNode(item.type)}
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted">{item.icon}</span>
                  <span className="min-w-0 text-left">
                    <span className="block truncate text-xs font-semibold">{item.label}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{item.desc}</span>
                  </span>
                </Button>
              ))}
            </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="min-h-0 overflow-hidden rounded-lg">
          <CardContent className="h-full p-0">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={NODE_TYPES}
              onNodesChange={handleNodesChange}
              onEdgesChange={handleEdgesChange}
              onConnect={onConnect}
              onNodeDragStop={handleNodeDragStop}
              onInit={(instance) => {
                reactFlowRef.current = instance;
              }}
              onSelectionChange={onSelectionChange}
              fitView
              className="canvas-flow bg-background"
              deleteKeyCode="Backspace"
              selectionKeyCode="Shift"
            >
              <Background gap={22} size={1} color="rgba(71,85,105,0.18)" />
              <MiniMap
                zoomable
                pannable
                nodeColor={() => "#1456f0"}
                nodeStrokeColor={() => "rgba(96,165,250,0.65)"}
                maskColor="rgba(15,23,42,0.18)"
              />
              <Controls />
            </ReactFlow>
          </CardContent>
        </Card>

        <div className={cn("flex min-h-0 flex-col gap-3", rightCollapsed ? "items-stretch" : "")}>
          {rightCollapsed ? (
            <Card className="min-h-0 overflow-hidden rounded-lg">
              <CardContent className="flex h-full flex-col items-center gap-2 p-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title="展开右侧面板"
                  onClick={() => setRightCollapsed(false)}
                >
                  <PanelRightOpen className="size-4" />
                </Button>
                <div className="flex flex-1 items-center justify-center [writing-mode:vertical-rl] text-xs font-medium text-muted-foreground">节点参数</div>
              </CardContent>
            </Card>
          ) : (
            <>
          <Card className="min-h-0 rounded-lg">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">节点参数</CardTitle>
                  <CardDescription>{selectedCanvasNode ? selectedCanvasNode.name : "未选择节点"}</CardDescription>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title="折叠右侧面板"
                  onClick={() => setRightCollapsed(true)}
                >
                  <PanelRightClose className="size-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {selectedCanvasNode ? (
                <>
                  <div className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">名称</span>
                  <Input
                    value={selectedCanvasNode.name || ""}
                    onChange={(event) => {
                      const value = event.target.value;
                      updateNodeCanvasAndFlow(selectedCanvasNode.id, { name: value });
                    }}
                    className="h-10 rounded-lg"
                  />
                  </div>
                  {selectedCanvasNode.type !== "result" ? (
                    <div className="grid gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">{selectedCanvasNode.type === "image" ? "图片 URL 或路径" : "文本 / Prompt"}</span>
                      <Textarea
                        value={selectedCanvasNode.type === "text"
                          ? String(selectedCanvasNode.data?.text || "")
                          : selectedCanvasNode.type === "image"
                            ? String(selectedCanvasNode.data?.url || selectedCanvasNode.data?.path || "")
                            : String(selectedCanvasNode.data?.prompt || "")}
                        onChange={(event) => {
                          if (selectedCanvasNode.type === "text") {
                            updateCanvasNode(selectedCanvasNode.id, { text: event.target.value });
                          } else if (selectedCanvasNode.type === "image") {
                            updateCanvasNode(selectedCanvasNode.id, { url: canvasImageUrl(event.target.value) });
                          } else {
                            updateCanvasNode(selectedCanvasNode.id, { prompt: event.target.value });
                          }
                        }}
                        className="min-h-[118px] rounded-lg"
                      />
                    </div>
                  ) : null}
                  {(selectedCanvasNode.type === "prompt" || selectedCanvasNode.type === "image_generation" || selectedCanvasNode.type === "image_edit") ? (
                    <div className="grid gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">模型</span>
                      <Select
                        value={String(selectedCanvasNode.data?.model || "auto")}
                        onValueChange={(value) => updateCanvasNode(selectedCanvasNode.id, { model: value })}
                      >
                        <SelectTrigger className="h-10 rounded-lg">
                          <SelectValue placeholder="选择模型" />
                        </SelectTrigger>
                        <SelectContent>
                          {nodeModelOptions.map((item) => (
                            <SelectItem key={item.id} value={item.id}>{item.name || item.id}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                  {(selectedCanvasNode.type === "image_generation" || selectedCanvasNode.type === "image_edit") ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        value={String(selectedCanvasNode.data?.size || "")}
                        onChange={(event) => updateCanvasNode(selectedCanvasNode.id, { size: event.target.value })}
                        className="h-10 rounded-lg"
                        placeholder="尺寸"
                      />
                      <Input
                        value={String(selectedCanvasNode.data?.n || 1)}
                        onChange={(event) => updateCanvasNode(selectedCanvasNode.id, { n: Number(event.target.value) || 1 })}
                        className="h-10 rounded-lg"
                        placeholder="数量"
                      />
                    </div>
                  ) : null}
                  {selectedRunState ? (
                    <div className="rounded-lg bg-muted/45 p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">运行状态</span>
                        <Badge variant={statusVariant(selectedRunState.status)} className="rounded-md">{statusLabel(selectedRunState.status)}</Badge>
                      </div>
                      {selectedRunState.error ? <div className="mt-2 text-xs text-rose-600">{selectedRunState.error}</div> : null}
                      <div className="mt-3">
                        <CanvasOutputPanel output={selectedRunState.output} />
                      </div>
                    </div>
                  ) : null}
                  <Button variant="outline" className="w-full" onClick={removeSelectedNode}><Trash2 className="size-4" />删除节点</Button>
                </>
              ) : (
                <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">在画布中选择一个节点后编辑参数。</div>
              )}
            </CardContent>
          </Card>

          <Card className="min-h-0 flex-1 rounded-lg">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">运行记录</CardTitle>
              <CardDescription>{activeRun ? statusLabel(activeRun.status) : "暂无运行"}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {activeRun ? (
                <div className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant={statusVariant(activeRun.status)} className="rounded-md">{statusLabel(activeRun.status)}</Badge>
                    <span className="text-xs text-muted-foreground">{activeRun.mode}</span>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    成功 {activeRun.summary.success_nodes} · 失败 {activeRun.summary.failed_nodes} · 阻断 {activeRun.summary.blocked_nodes}
                  </div>
                </div>
              ) : null}
              <div className="max-h-[280px] space-y-2 overflow-y-auto pr-1">
                {runs.map((run) => (
                  <button
                    key={run.id}
                    type="button"
                    className="w-full rounded-lg border border-border px-3 py-2 text-left transition hover:bg-accent"
                    onClick={async () => {
                      const latest = await fetchCanvasRun(run.id);
                      setActiveRun(latest);
                      syncFlow(canvas, latest);
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{run.canvas_name || run.id}</span>
                      <Badge variant={statusVariant(run.status)} className="rounded-md">{statusLabel(run.status)}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{run.summary.success_nodes} 成功 · {run.summary.failed_nodes} 失败</div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
