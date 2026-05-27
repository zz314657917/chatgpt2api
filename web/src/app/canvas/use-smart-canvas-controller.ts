"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { toast } from "sonner";

import {
  createChatCompletionTask,
  createCanvas,
  createImageEditTask,
  createImageGenerationTask,
  deleteCanvas,
  fetchCanvasModels,
  fetchCanvases,
  fetchCreationTasks,
  fetchManagedImages,
  saveCanvas,
  uploadManagedImages,
  type CanvasDocument,
  type CanvasImageRef,
  type CreationTask,
  type ImageVisibility,
  type ManagedImage,
} from "@/lib/api";
import { fetchAuthenticatedImageBlob } from "@/lib/authenticated-image";
import { useAuthGuard } from "@/lib/use-auth-guard";

import { dispatchSmartCanvasQueueChanged } from "./canvas-events";
import {
  DEFAULT_SMART_VIEWPORT,
  canvasImageKey,
  canvasImageSource,
  clampZoom,
  createEmptySmartCanvas,
  createItemId,
  createGeneratorNode,
  createHistoryEntry,
  createImageItem,
  createLlmNode,
  createOutputNode,
  createPromptNode,
  createSmartEdge,
  creationTaskToOutput,
  dedupeCanvasImageRefs,
  imageFilesFromList,
  incomingItems,
  isActiveTask,
  managedImagesToRefs,
  mentionCandidateImages,
  normalizeModelCatalog,
  normalizeSmartCanvas,
  screenToWorld,
  toCanvasPayload,
  zoomViewportAt,
} from "./canvas-utils";
import {
  canRedoSmartCanvasHistory,
  canUndoSmartCanvasHistory,
  createSmartCanvasHistory,
  pushSmartCanvasHistory,
  redoSmartCanvasHistory,
  replaceSmartCanvasHistoryPresent,
  undoSmartCanvasHistory,
  type SmartCanvasHistoryState,
} from "./canvas-history";
import {
  SMART_CANVAS_AUTOSAVE_DELAY_MS,
  type SmartCanvasAngleControlValues,
  type SmartCanvasConnectState,
  type SmartCanvasDocument,
  type SmartCanvasDragState,
  type SmartCanvasHistoryEntry,
  type SmartCanvasItem,
  type SmartCanvasImageToolParameters,
  type SmartCanvasImageToolType,
  type SmartCanvasSaveState,
  type SmartCanvasTool,
  type SmartCanvasViewport,
} from "./types";

const MANAGED_IMAGE_DRAG_TYPE = "application/x-chatgpt2api-managed-image";
const CANVAS_ASSET_PAGE_SIZE = 50;
const CROP_NODE_OFFSET = { x: 32, y: 32 };
const DEFAULT_ANGLE_CONTROL_VALUES: SmartCanvasAngleControlValues = { horizontal: 0, vertical: 15, zoom: 5 };
const DETAIL_ENHANCE_PROMPT = "请对这张图片进行细节增强和高清修复，提升清晰度、纹理细节、边缘锐度和整体质感，同时严格保留原始构图、主体、颜色关系和风格，不新增无关元素。";

type SmartCanvasNodeClipboard = {
  nodes: SmartCanvasItem[];
  edges: SmartCanvasDocument["edges"];
};

function sourceImageVisibility(item?: SmartCanvasItem | null): ImageVisibility {
  return item?.data?.visibility === "public" ? "public" : "private";
}

function imageToolLabel(type: SmartCanvasImageToolType) {
  if (type === "detail_enhance") {
    return "细节增强";
  }
  if (type === "angle_control") {
    return "角度控制";
  }
  return "图片编辑";
}

function imageToolImagesFromItem(item: SmartCanvasItem | null) {
  if (!item?.data) {
    return [];
  }
  if (item.type === "image") {
    return dedupeCanvasImageRefs(item.data.images || []);
  }
  if (item.type === "result") {
    return dedupeCanvasImageRefs(item.data.output?.images || item.data.images || []);
  }
  return [];
}

function imageToolUnavailableReason(item: SmartCanvasItem | null) {
  if (!item) {
    return "请选择一个只包含 1 张图片的节点";
  }
  const images = imageToolImagesFromItem(item);
  if (images.length === 0) {
    return "当前节点没有可编辑图片";
  }
  if (images.length > 1) {
    return "当前节点包含多张图片，请选择只包含 1 张图片的节点";
  }
  return "";
}

function buildAngleControlPrompt(values: SmartCanvasAngleControlValues) {
  return [
    "请基于输入图片生成同一主体的新视角版本，保持主体身份、材质、服饰、颜色关系和画面风格一致。",
    `目标水平角为 ${Math.round(values.horizontal)} 度。`,
    `目标垂直角为 ${Math.round(values.vertical)} 度。`,
    `镜头缩放强度为 ${Math.round(values.zoom)} / 10。`,
    "只改变观察角度和镜头距离，不要新增无关元素，不要改变主体结构。",
  ].join("\n");
}

function canConnectNodes(source: SmartCanvasItem, target: SmartCanvasItem) {
  if (target.type === "llm") {
    return source.type === "image" || source.type === "prompt" || source.type === "result";
  }
  if (target.type === "image_generation") {
    return source.type === "image" || source.type === "prompt" || source.type === "llm" || source.type === "result";
  }
  if (target.type === "result") {
    return source.type === "image_generation" || source.type === "llm" || source.type === "image" || source.type === "result";
  }
  if (target.type === "image") {
    return source.type === "image" || source.type === "result";
  }
  return false;
}

function generatorInputImages(canvas: SmartCanvasDocument, generator: SmartCanvasItem) {
  const upstream = incomingItems(canvas, generator.id);
  const upstreamImages = upstream.flatMap((item) => {
    if (item.type === "prompt") {
      return item.data?.input_images || [];
    }
    if (item.type === "result") {
      return item.data?.output?.images || item.data?.images || [];
    }
    return item.data?.images || [];
  });
  const upstreamKeys = new Set(dedupeCanvasImageRefs(upstreamImages).map(canvasImageKey));
  return dedupeCanvasImageRefs([
    ...(generator.data?.input_images || []).filter((image) => !upstreamKeys.has(canvasImageKey(image))),
    ...upstreamImages,
  ]);
}

function generatorDirectInputImages(canvas: SmartCanvasDocument, generator: SmartCanvasItem) {
  const upstreamImages = incomingItems(canvas, generator.id).flatMap((item) => {
    if (item.type === "prompt") {
      return item.data?.input_images || [];
    }
    if (item.type === "result") {
      return item.data?.output?.images || item.data?.images || [];
    }
    return item.data?.images || [];
  });
  const upstreamKeys = new Set(dedupeCanvasImageRefs(upstreamImages).map(canvasImageKey));
  return dedupeCanvasImageRefs((generator.data?.input_images || []).filter((image) => !upstreamKeys.has(canvasImageKey(image))));
}

function generatorPromptText(canvas: SmartCanvasDocument, generator: SmartCanvasItem) {
  const upstream = incomingItems(canvas, generator.id);
  return [
    ...upstream
      .filter((item) => item.type === "prompt" || item.type === "llm")
      .map((item) => item.type === "llm" ? item.data?.output?.text || item.data?.prompt || "" : item.data?.prompt || ""),
    generator.data?.prompt || "",
  ].map((value) => value.trim()).filter(Boolean).join("\n\n");
}

function llmInputText(canvas: SmartCanvasDocument, node: SmartCanvasItem) {
  const upstream = incomingItems(canvas, node.id);
  return [
    ...upstream.map((item) => {
      if (item.type === "llm") {
        return item.data?.output?.text || item.data?.prompt || "";
      }
      if (item.type === "result") {
        return item.data?.output?.text || item.data?.prompt || "";
      }
      return item.data?.prompt || item.data?.text || "";
    }),
    node.data?.prompt || "",
  ].map((value) => String(value || "").trim()).filter(Boolean).join("\n\n");
}

function llmInputImages(canvas: SmartCanvasDocument, node: SmartCanvasItem) {
  return dedupeCanvasImageRefs(incomingItems(canvas, node.id).flatMap((item) => {
    if (item.type === "prompt") {
      return item.data?.input_images || [];
    }
    if (item.type === "result") {
      return item.data?.output?.images || item.data?.images || [];
    }
    return item.data?.images || [];
  }));
}

function smartCanvasesFromList(items: CanvasDocument[]) {
  return items.flatMap((item) => {
    const normalized = normalizeSmartCanvas(item);
    return normalized ? [normalized] : [];
  });
}

function uniqueTaskId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function canvasItemCenterOffset(type: SmartCanvasItem["type"]) {
  if (type === "result") {
    return { x: -220, y: -110 };
  }
  if (type === "image_generation") {
    return { x: -190, y: -150 };
  }
  if (type === "llm") {
    return { x: -190, y: -210 };
  }
  if (type === "prompt") {
    return { x: -150, y: -100 };
  }
  return { x: -130, y: -120 };
}

function getCanvasNodeIdAtPoint(point: { x: number; y: number }, port?: "in" | "out") {
  const hit = document.elementFromPoint(point.x, point.y);
  const target = port ? hit?.closest(`[data-port='${port}']`) : hit?.closest("[data-canvas-node-id]");
  return target?.closest("[data-canvas-node-id]")?.getAttribute("data-canvas-node-id") || "";
}

function cloneCanvasItem(item: SmartCanvasItem): SmartCanvasItem {
  return {
    ...item,
    position: {
      x: Number(item.position?.x || 0),
      y: Number(item.position?.y || 0),
    },
    data: item.data ? structuredClone(item.data) : undefined,
  };
}

function createPastedCanvasItem(item: SmartCanvasItem, id: string, offset: number, now: string): SmartCanvasItem {
  const data = item.data
    ? {
        ...structuredClone(item.data),
        task_id: undefined,
        status: undefined,
        error: undefined,
        created_at: now,
        updated_at: now,
      }
    : undefined;

  return {
    ...item,
    id,
    position: {
      x: Number(item.position?.x || 0) + offset,
      y: Number(item.position?.y || 0) + offset,
    },
    data,
  };
}

export function useSmartCanvasController() {
  const { isCheckingAuth } = useAuthGuard(undefined, "/canvas");
  const [canvases, setCanvases] = useState<SmartCanvasDocument[]>([]);
  const [canvas, setCanvas] = useState<SmartCanvasDocument | null>(null);
  const [models, setModels] = useState(() => normalizeModelCatalog([]));
  const [assets, setAssets] = useState<ManagedImage[]>([]);
  const [assetNextCursor, setAssetNextCursor] = useState("");
  const [hasMoreAssets, setHasMoreAssets] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [viewport, setViewport] = useState<SmartCanvasViewport>(DEFAULT_SMART_VIEWPORT);
  const [tool, setTool] = useState<SmartCanvasTool>("pan");
  const [dragState, setDragState] = useState<SmartCanvasDragState>({ kind: "none" });
  const [connectState, setConnectState] = useState<SmartCanvasConnectState>({ kind: "none" });
  const [saveState, setSaveState] = useState<SmartCanvasSaveState>("saved");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [loadingMoreAssets, setLoadingMoreAssets] = useState(false);
  const [draggingImages, setDraggingImages] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [imageEditorImage, setImageEditorImage] = useState<CanvasImageRef | null>(null);
  const [angleControlOpen, setAngleControlOpen] = useState(false);
  const [angleControlImage, setAngleControlImage] = useState<CanvasImageRef | null>(null);
  const [angleControlValues, setAngleControlValues] = useState<SmartCanvasAngleControlValues>(DEFAULT_ANGLE_CONTROL_VALUES);
  const [canvasPickerOpen, setCanvasPickerOpen] = useState(false);
  const [leftRailCollapsed, setLeftRailCollapsed] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }
    return window.localStorage.getItem("smart-canvas-left-rail-collapsed") !== "0";
  });
  const [history, setHistory] = useState<SmartCanvasHistoryState>(() => createSmartCanvasHistory(null));
  const [historyEntries, setHistoryEntries] = useState<SmartCanvasHistoryEntry[]>([]);
  const [runHistoryOpen, setRunHistoryOpen] = useState(false);
  const [operationHistoryOpen, setOperationHistoryOpen] = useState(false);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const uploadTargetPointRef = useRef<{ x: number; y: number } | null>(null);
  const canvasRef = useRef<SmartCanvasDocument | null>(null);
  const viewportRef = useRef<SmartCanvasViewport>(DEFAULT_SMART_VIEWPORT);
  const autosaveTimerRef = useRef<number | null>(null);
  const saveStateRef = useRef<SmartCanvasSaveState>("saved");
  const savingRef = useRef(false);
  const savePromiseRef = useRef<Promise<SmartCanvasDocument | null> | null>(null);
  const dirtyVersionRef = useRef(0);
  const pollingTasksRef = useRef(new Set<string>());
  const dragStateRef = useRef<SmartCanvasDragState>({ kind: "none" });
  const connectStateRef = useRef<SmartCanvasConnectState>({ kind: "none" });
  const applyingHistoryRef = useRef(false);
  const historyCommitBaseRef = useRef<SmartCanvasDocument | null>(null);
  const nodeClipboardRef = useRef<SmartCanvasNodeClipboard | null>(null);
  const nodePasteOffsetRef = useRef(0);

  const selectedItem = useMemo(
    () => canvas?.nodes.find((item) => item.id === selectedItemId) || null,
    [canvas, selectedItemId],
  );
  const selectedImageToolDisabledReason = useMemo(() => imageToolUnavailableReason(selectedItem), [selectedItem]);
  const mentionItems = useMemo(() => mentionCandidateImages(canvas, assets), [assets, canvas]);

  useEffect(() => {
    canvasRef.current = canvas;
  }, [canvas]);

  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  useEffect(() => {
    if (saveState === "saving" && saveStateRef.current === "dirty") {
      return;
    }
    saveStateRef.current = saveState;
  }, [saveState]);

  useEffect(() => {
    window.localStorage.setItem("smart-canvas-left-rail-collapsed", leftRailCollapsed ? "1" : "0");
  }, [leftRailCollapsed]);

  const setActiveDragState = useCallback((next: SmartCanvasDragState) => {
    dragStateRef.current = next;
    setDragState(next);
  }, []);

  const setActiveConnectState = useCallback((next: SmartCanvasConnectState) => {
    connectStateRef.current = next;
    setConnectState(next);
  }, []);

  const selectSingleItem = useCallback((id: string) => {
    setSelectedItemId(id);
    setSelectedItemIds(id ? [id] : []);
  }, []);

  const toggleSelectedItem = useCallback((id: string) => {
    if (!id) {
      return;
    }
    const baseSelection = selectedItemIds.length > 0 ? selectedItemIds : selectedItemId ? [selectedItemId] : [];
    const next = baseSelection.includes(id)
      ? baseSelection.filter((itemId) => itemId !== id)
      : [...baseSelection, id];
    setSelectedItemId(next.includes(id) ? id : next[0] || "");
    setSelectedItemIds(next);
  }, [selectedItemId, selectedItemIds]);

  const selectItem = useCallback((id: string, multi?: boolean) => {
    if (multi) {
      toggleSelectedItem(id);
      return;
    }
    if (selectedItemIds.length > 1 && selectedItemIds.includes(id)) {
      setSelectedItemId(id);
      return;
    }
    selectSingleItem(id);
  }, [selectSingleItem, selectedItemIds, toggleSelectedItem]);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const previousScrollTop = document.scrollingElement?.scrollTop ?? window.scrollY;
    html.classList.add("canvas-page-scroll-lock");
    body.classList.add("canvas-page-scroll-lock");
    window.scrollTo(0, 0);
    return () => {
      html.classList.remove("canvas-page-scroll-lock");
      body.classList.remove("canvas-page-scroll-lock");
      window.scrollTo(0, previousScrollTop);
    };
  }, []);

  const applyCanvas = useCallback((next: SmartCanvasDocument | null) => {
    canvasRef.current = next;
    setCanvas(next);
    setViewport(next?.viewport || DEFAULT_SMART_VIEWPORT);
    selectSingleItem("");
    dirtyVersionRef.current = 0;
    saveStateRef.current = "saved";
    setSaveState("saved");
    setHistory(createSmartCanvasHistory(next));
    setHistoryEntries([]);
  }, [selectSingleItem]);

  const loadAssets = useCallback(async () => {
    setLoadingAssets(true);
    try {
      const result = await fetchManagedImages({ scope: "mine", page_size: CANVAS_ASSET_PAGE_SIZE });
      setAssets(result.items);
      setAssetNextCursor(result.next_cursor);
      setHasMoreAssets(result.has_more);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载图片库失败");
    } finally {
      setLoadingAssets(false);
    }
  }, []);

  const loadMoreAssets = useCallback(async () => {
    if (loadingAssets || loadingMoreAssets || !hasMoreAssets || !assetNextCursor) {
      return;
    }
    setLoadingMoreAssets(true);
    try {
      const result = await fetchManagedImages({
        scope: "mine",
        page_size: CANVAS_ASSET_PAGE_SIZE,
        cursor: assetNextCursor,
      });
      setAssets((current) => {
        const seen = new Set(current.map((asset) => asset.path));
        return [...current, ...result.items.filter((asset) => !seen.has(asset.path))];
      });
      setAssetNextCursor(result.next_cursor);
      setHasMoreAssets(result.has_more);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载更多图片失败");
    } finally {
      setLoadingMoreAssets(false);
    }
  }, [assetNextCursor, hasMoreAssets, loadingAssets, loadingMoreAssets]);

  const reloadCanvases = useCallback(async () => {
    try {
      const rawCanvases = await fetchCanvases();
      const smartCanvases = smartCanvasesFromList(rawCanvases);
      setCanvases(smartCanvases);
      return smartCanvases;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "刷新画布列表失败");
      return canvases;
    }
  }, [canvases]);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    try {
      const [rawCanvases, modelItems] = await Promise.all([
        fetchCanvases(),
        fetchCanvasModels(),
      ]);
      const smartCanvases = smartCanvasesFromList(rawCanvases);
      setCanvases(smartCanvases);
      applyCanvas(smartCanvases[0] || createEmptySmartCanvas());
      setModels(normalizeModelCatalog(modelItems));
      void loadAssets();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载画布失败");
      applyCanvas(createEmptySmartCanvas());
    } finally {
      setLoading(false);
    }
  }, [applyCanvas, loadAssets]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  const saveNow = useCallback(async (source?: SmartCanvasDocument | null) => {
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    const current = source || canvasRef.current;
    if (!current) {
      return current || null;
    }
    if (savingRef.current && savePromiseRef.current) {
      return savePromiseRef.current;
    }
    const saveVersion = dirtyVersionRef.current;
    const promise = (async () => {
      savingRef.current = true;
      setSaving(true);
      saveStateRef.current = "saving";
      setSaveState("saving");
      try {
        const payload = toCanvasPayload({ ...current, viewport: viewportRef.current });
        const saved = payload.id ? await saveCanvas(payload) : await createCanvas(payload);
        const normalized = normalizeSmartCanvas(saved) || payload;
        const hasNewerEdits = dirtyVersionRef.current !== saveVersion;

        if (hasNewerEdits) {
          if (!canvasRef.current?.id && normalized.id) {
            const next = {
              ...(canvasRef.current || normalized),
              id: normalized.id,
              owner_id: normalized.owner_id,
              created_at: normalized.created_at,
              updated_at: normalized.updated_at,
            };
            canvasRef.current = next;
            setCanvas(next);
            dispatchSmartCanvasQueueChanged(next);
          }
          setCanvases((items) => {
            const latest = canvasRef.current?.id ? canvasRef.current : normalized;
            const without = items.filter((item) => item.id !== latest.id);
            return [latest, ...without];
          });
          saveStateRef.current = "dirty";
          setSaveState("dirty");
          autosaveTimerRef.current = window.setTimeout(() => {
            autosaveTimerRef.current = null;
            void saveNow();
          }, SMART_CANVAS_AUTOSAVE_DELAY_MS);
        } else {
          canvasRef.current = normalized;
          setCanvas(normalized);
          dispatchSmartCanvasQueueChanged(normalized);
          setCanvases((items) => {
            const without = items.filter((item) => item.id !== normalized.id);
            return [normalized, ...without];
          });
          saveStateRef.current = "saved";
          setSaveState("saved");
        }
        return normalized;
      } catch (error) {
        saveStateRef.current = "error";
        setSaveState("error");
        toast.error(error instanceof Error ? error.message : "保存画布失败");
        return current;
      } finally {
        savingRef.current = false;
        savePromiseRef.current = null;
        setSaving(false);
      }
    })();
    savePromiseRef.current = promise;
    return promise;
  }, []);

  const markDirty = useCallback(() => {
    dirtyVersionRef.current += 1;
    saveStateRef.current = "dirty";
    setSaveState((state) => (state === "saving" ? state : "dirty"));
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
    }
    if (savingRef.current) {
      return;
    }
    autosaveTimerRef.current = window.setTimeout(() => {
      autosaveTimerRef.current = null;
      void saveNow();
    }, SMART_CANVAS_AUTOSAVE_DELAY_MS);
  }, [saveNow]);

  const flushSave = useCallback(async () => {
    if (saveStateRef.current === "dirty" || saveStateRef.current === "error" || saveStateRef.current === "saving") {
      await saveNow();
    }
    if (saveStateRef.current === "dirty") {
      await saveNow();
    }
    return saveStateRef.current !== "dirty" && saveStateRef.current !== "error";
  }, [saveNow]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (saveStateRef.current === "dirty" || saveStateRef.current === "error") {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);

  useEffect(() => () => {
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    if (saveStateRef.current === "dirty" || saveStateRef.current === "error") {
      void saveNow(canvasRef.current);
    }
  }, [saveNow]);

  const updateCanvas = useCallback((updater: (current: SmartCanvasDocument) => SmartCanvasDocument, dirty = true, historyLabel?: string) => {
    const previous = canvasRef.current || createEmptySmartCanvas();
    const nextCanvas = updater(previous);
    canvasRef.current = nextCanvas;
    setCanvas(nextCanvas);
    dispatchSmartCanvasQueueChanged(nextCanvas);
    if (!historyLabel && !applyingHistoryRef.current) {
      setHistory((current) => replaceSmartCanvasHistoryPresent(current, nextCanvas));
    }
    if (historyLabel && !applyingHistoryRef.current) {
      const historyBase = historyCommitBaseRef.current || previous;
      historyCommitBaseRef.current = null;
      setHistory((current) => pushSmartCanvasHistory(
        replaceSmartCanvasHistoryPresent(current, historyBase, { preserveFuture: true }),
        nextCanvas,
      ));
      setHistoryEntries((entries) => [createHistoryEntry(historyLabel, nextCanvas), ...entries].slice(0, 30));
    }
    if (dirty) {
      markDirty();
    }
  }, [markDirty]);

  const addNodeAt = useCallback((type: SmartCanvasItem["type"], point?: { x: number; y: number }) => {
    const rect = boardRef.current?.getBoundingClientRect();
    const world = rect
      ? screenToWorld(point || { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, rect, viewportRef.current)
      : { x: 240, y: 180 };
    const offset = canvasItemCenterOffset(type);
    const existingCount = canvasRef.current?.nodes.length || 0;
    const stagger = (existingCount % 8) * 28;
    const position = { x: world.x + offset.x + stagger, y: world.y + offset.y + stagger };
    const item = type === "prompt"
      ? createPromptNode(position)
      : type === "llm"
        ? createLlmNode(position)
        : type === "image_generation"
          ? createGeneratorNode(position)
          : type === "result"
            ? createOutputNode(position)
            : createImageItem([], position);
    updateCanvas((current) => ({ ...current, nodes: [...current.nodes, item] }), true, `新增 ${type === "llm" ? "AI 提示词" : item.name || "节点"}`);
    selectSingleItem(item.id);
    return item;
  }, [selectSingleItem, updateCanvas]);

  const updateItemData = useCallback((id: string, patch: Partial<SmartCanvasItem["data"]>) => {
    updateCanvas((current) => ({
      ...current,
      nodes: current.nodes.map((item) => item.id === id ? {
        ...item,
        data: {
          ...item.data,
          ...patch,
          updated_at: new Date().toISOString(),
        },
      } : item),
    }), true, "编辑节点");
  }, [updateCanvas]);

  const appendEdge = useCallback((source: string, target: string) => {
    if (!source || !target || source === target) {
      return false;
    }
    let changed = false;
    updateCanvas((current) => {
      const sourceNode = current.nodes.find((item) => item.id === source);
      const targetNode = current.nodes.find((item) => item.id === target);
      if (!sourceNode || !targetNode) {
        return current;
      }
      if (!canConnectNodes(sourceNode, targetNode)) {
        toast.error("这两个节点不能直接连接");
        return current;
      }
      if (current.edges.some((edge) => edge.source === source && edge.target === target)) {
        return current;
      }
      changed = true;
      return { ...current, edges: [...current.edges, createSmartEdge(source, target)] };
    }, true, "新增连线");
    return changed;
  }, [updateCanvas]);

  const deleteEdge = useCallback((edgeId: string) => {
    updateCanvas((current) => ({
      ...current,
      edges: current.edges.filter((edge) => edge.id !== edgeId),
    }), true, "删除连线");
  }, [updateCanvas]);

  const bindWindowPointerSession = useCallback((pointerId: number) => {
    const handleWindowPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) {
        return;
      }
      const activeDrag = dragStateRef.current;
      const activeConnect = connectStateRef.current;
      if (activeDrag.kind === "pan") {
        const next = {
          ...activeDrag.startViewport,
          x: activeDrag.startViewport.x + event.clientX - activeDrag.startClientX,
          y: activeDrag.startViewport.y + event.clientY - activeDrag.startClientY,
        };
        viewportRef.current = next;
        setViewport(next);
        return;
      }
      if (activeConnect.kind === "link") {
        const rect = boardRef.current?.getBoundingClientRect();
        if (rect) {
          setActiveConnectState({
            ...activeConnect,
            pointer: screenToWorld({ x: event.clientX, y: event.clientY }, rect, viewportRef.current),
          });
        }
        return;
      }
      if (activeDrag.kind === "item") {
        const dx = (event.clientX - activeDrag.startClientX) / viewportRef.current.zoom;
        const dy = (event.clientY - activeDrag.startClientY) / viewportRef.current.zoom;
        const movingIds = new Set(activeDrag.itemIds.length > 0 ? activeDrag.itemIds : [activeDrag.itemId]);
        updateCanvas((current) => ({
          ...current,
          nodes: current.nodes.map((item) => {
            if (!movingIds.has(item.id)) {
              return item;
            }
            const startPosition = activeDrag.startPositions[item.id] || { x: Number(item.position?.x || 0), y: Number(item.position?.y || 0) };
            return { ...item, position: { x: startPosition.x + dx, y: startPosition.y + dy } };
          }),
        }), false);
      }
      if (activeDrag.kind === "resize") {
        const dx = (event.clientX - activeDrag.startClientX) / viewportRef.current.zoom;
        const dy = (event.clientY - activeDrag.startClientY) / viewportRef.current.zoom;
        updateCanvas((current) => ({
          ...current,
          nodes: current.nodes.map((item) => item.id === activeDrag.itemId
            ? {
                ...item,
                data: {
                  ...item.data,
                  width: Math.max(180, Math.min(720, activeDrag.startSize.w + dx)),
                  height: Math.max(180, Math.min(720, activeDrag.startSize.h + dy)),
                },
              }
            : item),
        }), false);
      }
    };

    const handleWindowPointerUp = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) {
        return;
      }
      const activeDrag = dragStateRef.current;
      const activeConnect = connectStateRef.current;
      if (activeDrag.kind === "item" || activeDrag.kind === "resize") {
        updateCanvas((current) => current, true, activeDrag.kind === "item" ? "移动节点" : "缩放节点");
      }
      if (activeDrag.kind === "pan") {
        updateCanvas((current) => ({ ...current, viewport: viewportRef.current }), true, "移动画布");
      }
      if (activeConnect.kind === "link") {
        const targetId = getCanvasNodeIdAtPoint({ x: event.clientX, y: event.clientY }, "in");
        if (targetId) {
          appendEdge(activeConnect.sourceId, targetId);
        }
        setActiveConnectState({ kind: "none" });
      }
      setActiveDragState({ kind: "none" });
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
      window.removeEventListener("pointercancel", handleWindowPointerUp);
    };

    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", handleWindowPointerUp);
    window.addEventListener("pointercancel", handleWindowPointerUp);
  }, [appendEdge, setActiveConnectState, setActiveDragState, updateCanvas]);

  const addImagesToCanvas = useCallback((images: CanvasImageRef[], point?: { x: number; y: number }) => {
    const refs = dedupeCanvasImageRefs(images);
    if (refs.length === 0) {
      return;
    }
    const rect = boardRef.current?.getBoundingClientRect();
    const world = rect
      ? screenToWorld(point || { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, rect, viewportRef.current)
      : { x: 120, y: 120 };
    const offset = canvasItemCenterOffset("image");
    const item = createImageItem(refs, { x: world.x + offset.x, y: world.y + offset.y });
    updateCanvas((current) => {
      const edges = [...current.edges];
      const selected = selectedItemId ? current.nodes.find((node) => node.id === selectedItemId) : null;
      if (selected?.type === "image_generation") {
        edges.push(createSmartEdge(item.id, selected.id));
      }
      return { ...current, nodes: [...current.nodes, item], edges };
    }, true, "添加图片");
    selectSingleItem(item.id);
  }, [selectSingleItem, selectedItemId, updateCanvas]);

  const createImageNodeLinkedToGenerator = useCallback((
    refs: CanvasImageRef[],
    generator: SmartCanvasItem,
    position?: { x: number; y: number },
  ) => {
    const normalizedRefs = dedupeCanvasImageRefs(refs);
    if (normalizedRefs.length === 0 || generator.type !== "image_generation") {
      return false;
    }
    const current = canvasRef.current;
    const imageInputs = current?.edges
      .filter((edge) => edge.target === generator.id)
      .map((edge) => current.nodes.find((node) => node.id === edge.source))
      .filter((node): node is SmartCanvasItem => node?.type === "image") || [];
    const existingKeys = new Set(dedupeCanvasImageRefs(imageInputs.flatMap((node) => node.data?.images || [])).map(canvasImageKey));
    const missingRefs = normalizedRefs.filter((ref) => !existingKeys.has(canvasImageKey(ref)));
    if (missingRefs.length === 0) {
      selectSingleItem(imageInputs[0]?.id || generator.id);
      setMentionOpen(false);
      return true;
    }
    if (imageInputs.length > 0) {
      const targetInput = imageInputs[0];
      updateCanvas((doc) => ({
        ...doc,
        nodes: doc.nodes.map((node) => node.id === targetInput.id
          ? { ...node, data: { ...node.data, images: dedupeCanvasImageRefs([...(node.data?.images || []), ...missingRefs]) } }
          : node),
      }), true, "添加图片输入");
      selectSingleItem(targetInput.id);
      setMentionOpen(false);
      return true;
    }
    const item = createImageItem(normalizedRefs, position || {
      x: Number(generator.position?.x || 0) - 330,
      y: Number(generator.position?.y || 0) + 20,
    });
    updateCanvas((current) => {
      const edges = current.edges.some((edge) => edge.source === item.id && edge.target === generator.id)
        ? current.edges
        : [...current.edges, createSmartEdge(item.id, generator.id)];
      return { ...current, nodes: [...current.nodes, item], edges };
    }, true, "添加图片输入");
    selectSingleItem(item.id);
    setMentionOpen(false);
    return true;
  }, [selectSingleItem, updateCanvas]);

  const migrateGeneratorDirectInputsToImageNodes = useCallback((current: SmartCanvasDocument, generator: SmartCanvasItem) => {
    const directInputs = generatorDirectInputImages(current, generator);
    if (directInputs.length === 0) {
      return current;
    }
    const item = createImageItem(directInputs, {
      x: Number(generator.position?.x || 0) - 330,
      y: Number(generator.position?.y || 0) + 20,
    });
    return {
      ...current,
      nodes: current.nodes
        .map((node) => node.id === generator.id ? { ...node, data: { ...node.data, input_images: [] } } : node)
        .concat(item),
      edges: [...current.edges, createSmartEdge(item.id, generator.id)],
    };
  }, []);

  const findItemContainingImage = useCallback((image: CanvasImageRef) => {
    const current = canvasRef.current;
    if (!current) {
      return null;
    }
    const targetKey = canvasImageKey(image);
    const targetSrc = canvasImageSource(image);
    return current.nodes.find((item) => {
      const refs = [
        ...(item.data?.images || []),
        ...(item.data?.input_images || []),
        ...(item.data?.output?.images || []),
      ];
      return refs.some((ref) => {
        const key = canvasImageKey(ref);
        return (targetKey && key === targetKey) || (targetSrc && canvasImageSource(ref) === targetSrc);
      });
    }) || null;
  }, []);

  const addCroppedImageToCanvas = useCallback((original: CanvasImageRef, images: CanvasImageRef[]) => {
    const refs = dedupeCanvasImageRefs(images);
    if (refs.length === 0) {
      return;
    }
    let position = { x: 160, y: 160 };
    const sourceItem = findItemContainingImage(original);
    if (sourceItem) {
      position = {
        x: Number(sourceItem.position?.x || 0) + CROP_NODE_OFFSET.x,
        y: Number(sourceItem.position?.y || 0) + CROP_NODE_OFFSET.y,
      };
    }
    const item = createImageItem(refs, position);
    item.name = refs.length > 1 ? "切分图片" : "裁剪图片";
    item.data = {
      ...item.data,
      visibility: sourceImageVisibility(sourceItem),
      source_images: [original],
      tool_type: "image_edit",
      tool_parameters: {
        mode: refs.length > 1 ? "grid_split" : "manual_edit",
        count: refs.length,
      },
    };
    updateCanvas((doc) => ({
      ...doc,
      nodes: [...doc.nodes, item],
      edges: sourceItem ? [...doc.edges, createSmartEdge(sourceItem.id, item.id)] : doc.edges,
    }), true, refs.length > 1 ? "添加切分图片" : "添加编辑图片");
    selectSingleItem(item.id);
  }, [findItemContainingImage, selectSingleItem, updateCanvas]);

  const applyEditedImageFiles = useCallback(async (original: CanvasImageRef, files: File[]) => {
    const imageFiles = imageFilesFromList(files);
    if (imageFiles.length === 0) {
      toast.error("没有可上传的编辑结果");
      return;
    }
    setUploading(true);
    try {
      const items = await uploadManagedImages(imageFiles, sourceImageVisibility(findItemContainingImage(original)));
      const refs = managedImagesToRefs(items);
      if (refs.length === 0) {
        throw new Error("图片上传失败");
      }
      addCroppedImageToCanvas(original, refs);
      await loadAssets();
      toast.success(refs.length > 1 ? `已生成 ${refs.length} 张图片` : "已生成编辑图片");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "图片编辑失败");
      throw error;
    } finally {
      setUploading(false);
    }
  }, [addCroppedImageToCanvas, findItemContainingImage, loadAssets]);

  const addImagesToComposer = useCallback((images: CanvasImageRef[]) => {
    const refs = dedupeCanvasImageRefs(images);
    if (refs.length === 0) {
      return;
    }
    const current = canvasRef.current;
    const selected = selectedItemId && current ? current.nodes.find((node) => node.id === selectedItemId) : null;
    const target = selected?.type === "image_generation"
      ? selected
      : current?.nodes.find((node) => node.type === "image_generation");
    if (!target) {
      addImagesToCanvas(refs);
      setMentionOpen(false);
      return;
    }
    createImageNodeLinkedToGenerator(refs, target);
  }, [addImagesToCanvas, createImageNodeLinkedToGenerator, selectedItemId]);

  const connectImagesToGenerator = useCallback((images: CanvasImageRef[], generator: SmartCanvasItem) => {
    createImageNodeLinkedToGenerator(images, generator);
  }, [createImageNodeLinkedToGenerator]);

  const uploadFilesToRefs = useCallback(async (files: File[]) => {
    const imageFiles = imageFilesFromList(files);
    if (imageFiles.length === 0) {
      toast.error("仅支持图片文件");
      return [];
    }
    setUploading(true);
    try {
      const items = await uploadManagedImages(imageFiles, "private");
      await loadAssets();
      return managedImagesToRefs(items);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "上传图片失败");
      return [];
    } finally {
      setUploading(false);
    }
  }, [loadAssets]);

  const addImagesNearGenerator = useCallback((refs: CanvasImageRef[], target: SmartCanvasItem, point?: { x: number; y: number }) => {
    const normalizedRefs = dedupeCanvasImageRefs(refs);
    if (normalizedRefs.length === 0 || target.type !== "image_generation") {
      return false;
    }
    const rect = boardRef.current?.getBoundingClientRect();
    const world = rect && point
      ? screenToWorld(point, rect, viewportRef.current)
      : {
          x: Number(target.position?.x || 0),
          y: Number(target.position?.y || 0) + 120,
        };
    return createImageNodeLinkedToGenerator(normalizedRefs, target, {
      x: Number(target.position?.x || world.x) - 330,
      y: world.y - 120,
    });
  }, [createImageNodeLinkedToGenerator]);

  const addManagedImagePayload = useCallback((payload: string, point?: { x: number; y: number }, targetNodeId?: string) => {
    try {
      const item = JSON.parse(payload) as ManagedImage;
      const refs = managedImagesToRefs([item]);
      const target = targetNodeId ? canvasRef.current?.nodes.find((node) => node.id === targetNodeId) : null;
      if (target?.type === "image_generation" && addImagesNearGenerator(refs, target, point)) {
        return;
      }
      addImagesToCanvas(refs, point);
    } catch {
      toast.error("读取图片库素材失败");
    }
  }, [addImagesNearGenerator, addImagesToCanvas]);

  const handleBoardDrop = useCallback(async (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDraggingImages(false);
    const targetGeneratorId = getCanvasNodeIdAtPoint({ x: event.clientX, y: event.clientY });
    const managedImagePayload = event.dataTransfer.getData(MANAGED_IMAGE_DRAG_TYPE);
    if (managedImagePayload) {
      addManagedImagePayload(managedImagePayload, { x: event.clientX, y: event.clientY }, targetGeneratorId);
      return;
    }
    const files = imageFilesFromList(event.dataTransfer.files);
    if (files.length === 0) {
      toast.error("仅支持图片文件");
      return;
    }
    const refs = await uploadFilesToRefs(files);
    if (targetGeneratorId) {
      const target = canvasRef.current?.nodes.find((node) => node.id === targetGeneratorId);
      if (target?.type === "image_generation" && addImagesNearGenerator(refs, target, { x: event.clientX, y: event.clientY })) {
        return;
      }
    }
    addImagesToCanvas(refs, { x: event.clientX, y: event.clientY });
  }, [addImagesNearGenerator, addImagesToCanvas, addManagedImagePayload, uploadFilesToRefs]);

  const handleBoardDragOver = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.dataTransfer.types.includes(MANAGED_IMAGE_DRAG_TYPE) || imageFilesFromList(event.dataTransfer.files).length > 0) {
      setDraggingImages(true);
    }
  }, []);

  const handleWindowPaste = useCallback(async (event: ClipboardEvent) => {
    const target = event.target;
    if (target instanceof HTMLElement) {
      const tag = target.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || target.isContentEditable) {
        return;
      }
    }
    const files = imageFilesFromList(event.clipboardData?.files);
    if (files.length === 0) {
      return;
    }
    event.preventDefault();
    const refs = await uploadFilesToRefs(files);
    if (selectedItem?.type === "image") {
      updateCanvas((current) => ({
        ...current,
        nodes: current.nodes.map((item) => item.id === selectedItem.id
          ? { ...item, data: { ...item.data, images: dedupeCanvasImageRefs([...(item.data?.images || []), ...refs]) } }
          : item),
      }), true, "粘贴图片");
    } else if (selectedItem?.type === "image_generation") {
      connectImagesToGenerator(refs, selectedItem);
    } else {
      addImagesToCanvas(refs);
    }
  }, [addImagesToCanvas, connectImagesToGenerator, selectedItem, updateCanvas, uploadFilesToRefs]);

  useEffect(() => {
    window.addEventListener("paste", handleWindowPaste);
    return () => window.removeEventListener("paste", handleWindowPaste);
  }, [handleWindowPaste]);

  const handleBoardPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
      if (event.target === event.currentTarget) {
        if (!event.ctrlKey && !event.metaKey) {
          selectSingleItem("");
        }
        if (tool === "pan" || event.altKey || event.metaKey || event.ctrlKey) {
          historyCommitBaseRef.current = canvasRef.current;
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
          // Pointer capture can fail if the browser has already cancelled the pointer.
        }
        setActiveDragState({
          kind: "pan",
          pointerId: event.pointerId,
          startClientX: event.clientX,
          startClientY: event.clientY,
          startViewport: viewportRef.current,
        });
        bindWindowPointerSession(event.pointerId);
      }
    }
  }, [bindWindowPointerSession, selectSingleItem, setActiveDragState, tool]);

  const handleItemPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>, item: SmartCanvasItem) => {
    if (event.button !== 0) {
      return;
    }
    const target = event.target;
    if (target instanceof HTMLElement) {
      if (target.closest("input, textarea, select, button, [data-node-interactive='true'], [data-port]")) {
        return;
      }
    }
    event.stopPropagation();
    const multiSelect = event.ctrlKey || event.metaKey;
    const currentSelection = selectedItemIds.length > 0 ? selectedItemIds : selectedItemId ? [selectedItemId] : [];
    if (multiSelect) {
      setActiveDragState({ kind: "none" });
      return;
    }
    const nextSelection = currentSelection.includes(item.id) ? currentSelection : [item.id];
    const activeSelection = nextSelection.length > 0 ? nextSelection : [item.id];
    const startPositions = Object.fromEntries(
      activeSelection.map((id) => {
        const targetItem = canvasRef.current?.nodes.find((node) => node.id === id) || item;
        return [id, { x: Number(targetItem.position?.x || 0), y: Number(targetItem.position?.y || 0) }];
      }),
    );
    historyCommitBaseRef.current = canvasRef.current;
    setSelectedItemId(item.id);
    setSelectedItemIds(activeSelection);
    setActiveDragState({
      kind: "item",
      pointerId: event.pointerId,
      itemId: item.id,
      itemIds: activeSelection,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPositions,
    });
    bindWindowPointerSession(event.pointerId);
  }, [bindWindowPointerSession, selectedItemId, selectedItemIds, setActiveDragState]);

  const handleResizeItemPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>, item: SmartCanvasItem) => {
    if (event.button !== 0) {
      return;
    }
    event.stopPropagation();
    selectSingleItem(item.id);
    historyCommitBaseRef.current = canvasRef.current;
    setActiveDragState({
      kind: "resize",
      pointerId: event.pointerId,
      itemId: item.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startSize: {
        w: Number(item.data?.width || 270),
        h: Number(item.data?.height || 260),
      },
    });
    bindWindowPointerSession(event.pointerId);
  }, [bindWindowPointerSession, selectSingleItem, setActiveDragState]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragState.kind === "pan" && dragState.pointerId === event.pointerId) {
      const next = {
        ...dragState.startViewport,
        x: dragState.startViewport.x + event.clientX - dragState.startClientX,
        y: dragState.startViewport.y + event.clientY - dragState.startClientY,
      };
      viewportRef.current = next;
      setViewport(next);
      return;
    }
    if (connectState.kind === "link" && connectState.pointerId === event.pointerId) {
      const rect = boardRef.current?.getBoundingClientRect();
      if (rect) {
        setActiveConnectState({
          ...connectState,
          pointer: screenToWorld({ x: event.clientX, y: event.clientY }, rect, viewportRef.current),
        });
      }
      return;
    }
    if (dragState.kind === "item" && dragState.pointerId === event.pointerId) {
      const dx = (event.clientX - dragState.startClientX) / viewportRef.current.zoom;
      const dy = (event.clientY - dragState.startClientY) / viewportRef.current.zoom;
      const movingIds = new Set(dragState.itemIds.length > 0 ? dragState.itemIds : [dragState.itemId]);
      updateCanvas((current) => ({
        ...current,
        nodes: current.nodes.map((item) => {
          if (!movingIds.has(item.id)) {
            return item;
          }
          const startPosition = dragState.startPositions[item.id] || { x: Number(item.position?.x || 0), y: Number(item.position?.y || 0) };
          return { ...item, position: { x: startPosition.x + dx, y: startPosition.y + dy } };
        }),
      }), false);
    }
    if (dragState.kind === "resize" && dragState.pointerId === event.pointerId) {
      const dx = (event.clientX - dragState.startClientX) / viewportRef.current.zoom;
      const dy = (event.clientY - dragState.startClientY) / viewportRef.current.zoom;
      updateCanvas((current) => ({
        ...current,
        nodes: current.nodes.map((item) => item.id === dragState.itemId
          ? {
              ...item,
              data: {
                ...item.data,
                width: Math.max(180, Math.min(720, dragState.startSize.w + dx)),
                height: Math.max(180, Math.min(720, dragState.startSize.h + dy)),
              },
            }
          : item),
      }), false);
    }
  }, [connectState, dragState, setActiveConnectState, updateCanvas]);

  const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if ((dragState.kind === "item" || dragState.kind === "resize") && dragState.pointerId === event.pointerId) {
      updateCanvas((current) => current, true, dragState.kind === "item" ? "移动节点" : "缩放节点");
    }
    if (dragState.kind === "pan" && dragState.pointerId === event.pointerId) {
      updateCanvas((current) => ({ ...current, viewport: viewportRef.current }), true, "移动画布");
    }
    if (connectState.kind === "link" && connectState.pointerId === event.pointerId) {
      const targetId = getCanvasNodeIdAtPoint({ x: event.clientX, y: event.clientY }, "in");
      if (targetId) {
        appendEdge(connectState.sourceId, targetId);
      }
      setActiveConnectState({ kind: "none" });
    }
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Capture may already be released by the browser.
    }
    setActiveDragState({ kind: "none" });
  }, [appendEdge, connectState, dragState, setActiveConnectState, setActiveDragState, updateCanvas]);

  const handleWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const factor = event.deltaY > 0 ? 0.92 : 1.08;
    const next = zoomViewportAt(viewportRef.current, rect, { x: event.clientX, y: event.clientY }, viewportRef.current.zoom * factor);
    setViewport(next);
    viewportRef.current = next;
    updateCanvas((current) => ({ ...current, viewport: next }), false);
    markDirty();
  }, [markDirty, updateCanvas]);

  const updateViewport = useCallback((next: SmartCanvasViewport, commit = false, label = "移动画布") => {
    setViewport(next);
    viewportRef.current = next;
    updateCanvas((current) => ({ ...current, viewport: next }), commit, label);
    if (!commit) {
      markDirty();
    }
  }, [markDirty, updateCanvas]);

  const zoomBy = useCallback((factor: number) => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const next = zoomViewportAt(viewportRef.current, rect, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, viewportRef.current.zoom * factor);
    setViewport(next);
    viewportRef.current = next;
    updateCanvas((current) => ({ ...current, viewport: next }), true, "缩放画布");
  }, [updateCanvas]);

  const fitContent = useCallback(() => {
    const current = canvasRef.current;
    const rect = boardRef.current?.getBoundingClientRect();
    if (!current || !rect || current.nodes.length === 0) {
      const next = { ...DEFAULT_SMART_VIEWPORT };
      setViewport(next);
      viewportRef.current = next;
      return;
    }
    const xs = current.nodes.map((item) => Number(item.position?.x || 0));
    const ys = current.nodes.map((item) => Number(item.position?.y || 0));
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs) + 300;
    const maxY = Math.max(...ys) + 220;
    const zoom = clampZoom(Math.min(rect.width / Math.max(420, maxX - minX + 160), rect.height / Math.max(320, maxY - minY + 160)));
    const next = {
      x: rect.width / 2 - ((minX + maxX) / 2) * zoom,
      y: rect.height / 2 - ((minY + maxY) / 2) * zoom,
      zoom,
    };
    setViewport(next);
    viewportRef.current = next;
    updateCanvas((doc) => ({ ...doc, viewport: next }), true, "适配画布");
  }, [updateCanvas]);

  const focusItem = useCallback((itemId: string) => {
    const current = canvasRef.current;
    const item = current?.nodes.find((node) => node.id === itemId);
    const rect = boardRef.current?.getBoundingClientRect();
    if (!item || !rect) {
      return;
    }
    const zoom = viewportRef.current.zoom || DEFAULT_SMART_VIEWPORT.zoom;
    const width = item.type === "image" ? Number(item.data?.width || 270) : 360;
    const height = item.type === "image" ? Number(item.data?.height || 220) : 240;
    const next = {
      x: rect.width / 2 - (Number(item.position?.x || 0) + width / 2) * zoom,
      y: rect.height / 2 - (Number(item.position?.y || 0) + height / 2) * zoom,
      zoom,
    };
    selectSingleItem(itemId);
    setViewport(next);
    viewportRef.current = next;
  }, [selectSingleItem]);

  const restoreHistoryEntry = useCallback((entry: SmartCanvasHistoryEntry) => {
    const snapshot = normalizeSmartCanvas(entry.snapshot);
    if (!snapshot) {
      toast.error("无法恢复这条操作记录");
      return;
    }
    const previous = canvasRef.current || createEmptySmartCanvas();
    applyingHistoryRef.current = true;
    canvasRef.current = snapshot;
    setCanvas(snapshot);
    const nextViewport = snapshot.viewport || DEFAULT_SMART_VIEWPORT;
    viewportRef.current = nextViewport;
    setViewport(nextViewport);
    selectSingleItem("");
    setHistory((current) => pushSmartCanvasHistory(
      replaceSmartCanvasHistoryPresent(current, previous, { preserveFuture: true }),
      snapshot,
    ));
    applyingHistoryRef.current = false;
    markDirty();
    setHistoryEntries((entries) => [createHistoryEntry(`回到：${entry.label}`, snapshot), ...entries].slice(0, 30));
  }, [markDirty, selectSingleItem]);

  const openImage = useCallback((image: CanvasImageRef) => {
    const src = canvasImageSource(image);
    if (src) {
      setImageEditorImage(image);
    }
  }, []);

  const startConnect = useCallback((event: ReactPointerEvent<HTMLElement>, sourceId: string) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      boardRef.current?.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is best-effort for cross-element link dragging.
    }
    const rect = boardRef.current?.getBoundingClientRect();
    const pointer = rect
      ? screenToWorld({ x: event.clientX, y: event.clientY }, rect, viewportRef.current)
      : { x: 0, y: 0 };
    setActiveConnectState({ kind: "link", pointerId: event.pointerId, sourceId, pointer });
    bindWindowPointerSession(event.pointerId);
  }, [bindWindowPointerSession, setActiveConnectState]);

  const finishConnect = useCallback((event: ReactPointerEvent<HTMLElement>, targetId: string) => {
    if (connectState.kind !== "link") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    appendEdge(connectState.sourceId, targetId);
    setActiveConnectState({ kind: "none" });
  }, [appendEdge, connectState, setActiveConnectState]);

  const imageRefsToFiles = useCallback(async (refs: CanvasImageRef[]) => {
    const files: File[] = [];
    for (const [index, ref] of refs.entries()) {
      const src = canvasImageSource(ref);
      if (!src) {
        continue;
      }
      const blob = await fetchAuthenticatedImageBlob(src);
      const ext = blob.type.split("/")[1] || "png";
      files.push(new File([blob], ref.name || `canvas-input-${index + 1}.${ext}`, { type: blob.type || "image/png" }));
    }
    return files;
  }, []);

  const getSelectedSingleImage = useCallback(() => {
    const current = canvasRef.current;
    const selected = selectedItemId && current ? current.nodes.find((item) => item.id === selectedItemId) || null : null;
    const reason = imageToolUnavailableReason(selected);
    if (reason) {
      toast.info(reason);
      return null;
    }
    const image = imageToolImagesFromItem(selected)[0];
    return selected && image ? { item: selected, image } : null;
  }, [selectedItemId]);

  const getSingleImageFromItem = useCallback((itemId: string) => {
    const current = canvasRef.current;
    const item = current?.nodes.find((node) => node.id === itemId) || null;
    const reason = imageToolUnavailableReason(item);
    if (reason) {
      toast.info(reason);
      return null;
    }
    const image = imageToolImagesFromItem(item)[0];
    return item && image ? { item, image } : null;
  }, []);

  const createImageToolResultNode = useCallback((
    sourceItem: SmartCanvasItem,
    sourceImage: CanvasImageRef,
    type: SmartCanvasImageToolType,
    prompt: string,
    task: CreationTask,
    parameters?: SmartCanvasImageToolParameters,
  ) => {
    const output = creationTaskToOutput(task);
    const position = {
      x: Number(sourceItem.position?.x || 0) + 330,
      y: Number(sourceItem.position?.y || 0),
    };
    const node = createOutputNode(position);
    node.name = task.status === "success" ? imageToolLabel(type) : `${imageToolLabel(type)}中`;
    node.data = {
      ...node.data,
      prompt,
      model: task.model || "auto",
      size: task.size || "1024x1024",
      n: 1,
      visibility: sourceItem.data?.visibility || "private",
      source_images: [sourceImage],
      input_images: [sourceImage],
      tool_type: type,
      tool_parameters: parameters,
      output,
      status: task.status,
      error: task.error,
      task_id: task.id,
      created_at: task.created_at || new Date().toISOString(),
      updated_at: task.updated_at,
    };
    updateCanvas((current) => ({
      ...current,
      nodes: [...current.nodes, node],
      edges: current.edges.some((edge) => edge.source === sourceItem.id && edge.target === node.id)
        ? current.edges
        : [...current.edges, createSmartEdge(sourceItem.id, node.id)],
    }), true, `提交${imageToolLabel(type)}`);
    selectSingleItem(node.id);
    return node.id;
  }, [selectSingleItem, updateCanvas]);

  const pollTaskIntoToolResult = useCallback(async (taskId: string, outputId: string, label: string) => {
    if (pollingTasksRef.current.has(taskId)) {
      return;
    }
    pollingTasksRef.current.add(taskId);
    try {
      let active = true;
      while (active) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        const result = await fetchCreationTasks([taskId]);
        const task = result.items[0];
        if (!task) {
          continue;
        }
        const output = creationTaskToOutput(task);
        active = isActiveTask(task.status);
        updateCanvas((current) => ({
          ...current,
          nodes: current.nodes.map((item) => item.id === outputId
            ? {
                ...item,
                name: task.status === "success" ? label : `${label}中`,
                data: {
                  ...item.data,
                  model: task.model || item.data?.model || "auto",
                  size: task.size || item.data?.size || "1024x1024",
                  output,
                  status: task.status,
                  error: task.error,
                  task_id: task.id,
                  updated_at: task.updated_at,
                },
              }
            : item),
        }), !active, !active ? `完成${label}` : undefined);
      }
      void loadAssets();
    } catch (error) {
      const message = error instanceof Error ? error.message : "同步任务状态失败";
      updateCanvas((current) => ({
        ...current,
        nodes: current.nodes.map((item) => item.id === outputId
          ? { ...item, data: { ...item.data, status: "error", error: message, task_id: taskId, updated_at: new Date().toISOString() } }
          : item),
      }), true, `${label}失败`);
      toast.error(message);
    } finally {
      pollingTasksRef.current.delete(taskId);
    }
  }, [loadAssets, updateCanvas]);

  const runImageEditTool = useCallback(async (
    selected: { item: SmartCanvasItem; image: CanvasImageRef } | null,
    type: SmartCanvasImageToolType,
    prompt: string,
    parameters?: SmartCanvasImageToolParameters,
  ) => {
    if (!selected) {
      return;
    }
    setRunning(true);
    try {
      const files = await imageRefsToFiles([selected.image]);
      if (files.length === 0) {
        throw new Error("没有可读取的输入图片");
      }
      const clientTaskId = uniqueTaskId(`smart-canvas-${type}`);
      const task = await createImageEditTask(clientTaskId, files, prompt, "auto", "1024x1024", undefined, 1, undefined, sourceImageVisibility(selected.item));
      const outputId = createImageToolResultNode(selected.item, selected.image, type, prompt, task, parameters);
      void pollTaskIntoToolResult(task.id, outputId, imageToolLabel(type));
      toast.success(`${imageToolLabel(type)}任务已提交`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `${imageToolLabel(type)}提交失败`);
    } finally {
      setRunning(false);
    }
  }, [createImageToolResultNode, imageRefsToFiles, pollTaskIntoToolResult]);

  const runSelectedImageEditTool = useCallback(async (
    type: SmartCanvasImageToolType,
    prompt: string,
    parameters?: SmartCanvasImageToolParameters,
  ) => {
    await runImageEditTool(getSelectedSingleImage(), type, prompt, parameters);
  }, [getSelectedSingleImage, runImageEditTool]);

  const runImageEditToolForItem = useCallback(async (
    itemId: string,
    type: SmartCanvasImageToolType,
    prompt: string,
    parameters?: SmartCanvasImageToolParameters,
  ) => {
    selectSingleItem(itemId);
    await runImageEditTool(getSingleImageFromItem(itemId), type, prompt, parameters);
  }, [getSingleImageFromItem, runImageEditTool, selectSingleItem]);

  const runDetailEnhanceSelected = useCallback(() => {
    void runSelectedImageEditTool("detail_enhance", DETAIL_ENHANCE_PROMPT);
  }, [runSelectedImageEditTool]);

  const runDetailEnhanceForItem = useCallback((itemId: string) => {
    void runImageEditToolForItem(itemId, "detail_enhance", DETAIL_ENHANCE_PROMPT);
  }, [runImageEditToolForItem]);

  const openSelectedImageEditor = useCallback(() => {
    const selected = getSelectedSingleImage();
    if (!selected) {
      return;
    }
    setImageEditorImage(selected.image);
  }, [getSelectedSingleImage]);

  const openImageEditorForItem = useCallback((itemId: string) => {
    selectSingleItem(itemId);
    const selected = getSingleImageFromItem(itemId);
    if (!selected) {
      return;
    }
    setImageEditorImage(selected.image);
  }, [getSingleImageFromItem, selectSingleItem]);

  const openAngleControl = useCallback(() => {
    const selected = getSelectedSingleImage();
    if (!selected) {
      return;
    }
    setAngleControlImage(selected.image);
    setAngleControlOpen(true);
  }, [getSelectedSingleImage]);

  const openAngleControlForItem = useCallback((itemId: string) => {
    selectSingleItem(itemId);
    const selected = getSingleImageFromItem(itemId);
    if (!selected) {
      return;
    }
    setAngleControlImage(selected.image);
    setAngleControlOpen(true);
  }, [getSingleImageFromItem, selectSingleItem]);

  const runAngleControlSelected = useCallback((values: SmartCanvasAngleControlValues) => {
    const normalized = {
      horizontal: Math.max(0, Math.min(360, Number(values.horizontal) || 0)),
      vertical: Math.max(-30, Math.min(90, Number(values.vertical) || 0)),
      zoom: Math.max(0, Math.min(10, Number(values.zoom) || 0)),
    };
    setAngleControlValues(normalized);
    setAngleControlOpen(false);
    void runSelectedImageEditTool("angle_control", buildAngleControlPrompt(normalized), normalized);
  }, [runSelectedImageEditTool]);

  const pollTaskIntoGenerator = useCallback(async (taskId: string, generatorId: string, outputIds: string[]) => {
    if (pollingTasksRef.current.has(taskId)) {
      return;
    }
    pollingTasksRef.current.add(taskId);
    try {
      let active = true;
      while (active) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        const result = await fetchCreationTasks([taskId]);
        const task = result.items[0];
        if (!task) {
          continue;
        }
        const output = creationTaskToOutput(task);
        active = isActiveTask(task.status);
        updateCanvas((current) => ({
          ...current,
          nodes: current.nodes.map((item) => {
            if (item.id === generatorId) {
              return {
                ...item,
                data: {
                  ...item.data,
                  output,
                  status: task.status,
                  error: task.error,
                  task_id: task.id,
                  updated_at: task.updated_at,
                },
              };
            }
            if (outputIds.includes(item.id)) {
              return {
                ...item,
                name: task.status === "success" ? "Output" : "生成中",
                data: {
                  ...item.data,
                  prompt: item.data?.prompt || current.nodes.find((node) => node.id === generatorId)?.data?.prompt || "",
                  model: item.data?.model || current.nodes.find((node) => node.id === generatorId)?.data?.model || "auto",
                  output,
                  status: task.status,
                  error: task.error,
                  task_id: task.id,
                  updated_at: task.updated_at,
                },
              };
            }
            return item;
          }),
        }), !active, !active ? "完成 API 生成" : undefined);
      }
      void loadAssets();
    } catch (error) {
      const message = error instanceof Error ? error.message : "同步任务状态失败";
      updateCanvas((current) => ({
        ...current,
        nodes: current.nodes.map((item) => item.id === generatorId || outputIds.includes(item.id)
          ? { ...item, data: { ...item.data, status: "error", error: message, task_id: taskId } }
          : item),
      }), true, "API 生成失败");
      toast.error(message);
    } finally {
      pollingTasksRef.current.delete(taskId);
    }
  }, [loadAssets, updateCanvas]);

  const pollTaskIntoLlmNode = useCallback(async (taskId: string, nodeId: string) => {
    if (pollingTasksRef.current.has(taskId)) {
      return;
    }
    pollingTasksRef.current.add(taskId);
    try {
      let active = true;
      while (active) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        const result = await fetchCreationTasks([taskId]);
        const task = result.items[0];
        if (!task) {
          continue;
        }
        const output = creationTaskToOutput(task);
        active = isActiveTask(task.status);
        updateCanvas((current) => ({
          ...current,
          nodes: current.nodes.map((item) => item.id === nodeId
            ? {
                ...item,
                data: {
                  ...item.data,
                  output,
                  status: task.status,
                  error: task.error,
                  task_id: task.id,
                  updated_at: task.updated_at,
                },
              }
            : item),
        }), !active, !active ? "完成 AI 提示词" : undefined);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "同步 AI 提示词任务失败";
      updateCanvas((current) => ({
        ...current,
        nodes: current.nodes.map((item) => item.id === nodeId
          ? { ...item, data: { ...item.data, status: "error", error: message, task_id: taskId, updated_at: new Date().toISOString() } }
          : item),
      }), true, "AI 提示词失败");
      toast.error(message);
    } finally {
      pollingTasksRef.current.delete(taskId);
    }
  }, [updateCanvas]);

  const runLlmNode = useCallback(async (nodeId: string) => {
    const current = canvasRef.current;
    const node = current?.nodes.find((item) => item.id === nodeId);
    if (!current || !node || node.type !== "llm") {
      return;
    }
    if (isActiveTask(node.data?.status)) {
      toast.info("当前 AI 提示词节点正在运行中");
      return;
    }
    const inputText = llmInputText(current, node);
    const inputImages = llmInputImages(current, node);
    if (!inputText && inputImages.length === 0) {
      toast.error("请连接提示词/图片节点，或在 AI 提示词节点里补充输入");
      return;
    }
    setRunning(true);
    try {
      updateCanvas((doc) => ({
        ...doc,
        nodes: doc.nodes.map((item) => item.id === node.id
          ? {
              ...item,
              data: {
                ...item.data,
                status: "running",
                error: "",
                output: { text: "" },
                updated_at: new Date().toISOString(),
              },
            }
          : item),
      }), true, "开始 AI 提示词");
      const files = await imageRefsToFiles(inputImages);
      const referenceImages = await Promise.all(files.map(async (file) => ({
        name: file.name,
        dataUrl: await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(reader.error || new Error("读取图片失败"));
          reader.readAsDataURL(file);
        }),
      })));
      const prompt = inputText || "请分析输入图片，并输出适合后续生图使用的中文提示词。";
      const task = await createChatCompletionTask(
        uniqueTaskId("smart-canvas-llm"),
        prompt,
        node.data?.model || "auto",
        [{ role: "user", content: prompt }],
        referenceImages.length > 0 ? referenceImages : undefined,
      );
      const output = creationTaskToOutput(task);
      updateCanvas((doc) => ({
        ...doc,
        nodes: doc.nodes.map((item) => item.id === node.id
          ? {
              ...item,
              data: {
                ...item.data,
                output,
                status: task.status,
                error: task.error,
                task_id: task.id,
                updated_at: task.updated_at,
              },
            }
          : item),
      }), true, "提交 AI 提示词");
      void pollTaskIntoLlmNode(task.id, node.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "提交 AI 提示词失败";
      updateCanvas((doc) => ({
        ...doc,
        nodes: doc.nodes.map((item) => item.id === node.id
          ? { ...item, data: { ...item.data, status: "error", error: message, updated_at: new Date().toISOString() } }
          : item),
      }), true, "AI 提示词失败");
      toast.error(message);
    } finally {
      setRunning(false);
    }
  }, [imageRefsToFiles, pollTaskIntoLlmNode, updateCanvas]);

  const runGeneratorNode = useCallback(async (generatorId: string) => {
    const current = canvasRef.current;
    const generator = current?.nodes.find((item) => item.id === generatorId);
    if (!current || !generator || generator.type !== "image_generation") {
      return;
    }
    if (isActiveTask(generator.data?.status)) {
      toast.info("当前节点正在生成中");
      return;
    }
    const submittedPrompt = generatorPromptText(current, generator);
    if (!submittedPrompt) {
      toast.error("请连接 Prompt 节点，或在 API生成节点里补充提示词");
      return;
    }
    const inputRefs = generatorInputImages(current, generator);
    const migrated = migrateGeneratorDirectInputsToImageNodes(current, generator);
    setRunning(true);
    try {
      updateCanvas((doc) => {
        const next = migrateGeneratorDirectInputsToImageNodes(doc, doc.nodes.find((item) => item.id === generator.id) || generator);
        return {
          ...next,
          nodes: next.nodes.map((item) => item.id === generator.id ? {
            ...item,
            data: {
              ...item.data,
              input_images: [],
              status: "running",
              error: "",
              output: { images: [] },
              updated_at: new Date().toISOString(),
            },
          } : item),
        };
      }, true, "开始 API 生成");
      const clientTaskId = uniqueTaskId("smart-canvas-node");
      let task: CreationTask;
      if (inputRefs.length > 0) {
        const files = await imageRefsToFiles(inputRefs);
        if (files.length === 0) {
          throw new Error("没有可读取的输入图片");
        }
        task = await createImageEditTask(clientTaskId, files, submittedPrompt, generator.data?.model || "auto", generator.data?.size || "1024x1024", undefined, Number(generator.data?.n || 1), undefined, generator.data?.visibility || "private");
      } else {
        task = await createImageGenerationTask(clientTaskId, submittedPrompt, generator.data?.model || "auto", generator.data?.size || "1024x1024", undefined, Number(generator.data?.n || 1), undefined, generator.data?.visibility || "private");
      }
      const output = creationTaskToOutput(task);
      let outputIds = migrated.edges.filter((edge) => edge.source === generator.id)
        .map((edge) => migrated.nodes.find((item) => item.id === edge.target))
        .filter((item): item is SmartCanvasItem => item?.type === "result")
        .map((item) => item.id);
      updateCanvas((doc) => {
        let nodes = doc.nodes.map((item) => item.id === generator.id ? {
          ...item,
          data: {
            ...item.data,
            input_images: [],
            output,
            status: task.status,
            error: task.error,
            task_id: task.id,
            updated_at: task.updated_at,
          },
        } : item);
        let edges = doc.edges;
        if (outputIds.length === 0) {
          const position = {
            x: Number(generator.position?.x || 0) + 430,
            y: Number(generator.position?.y || 0),
          };
          const outputNode = createOutputNode(position);
          outputIds = [outputNode.id];
          nodes = [...nodes, outputNode];
          edges = [...edges, createSmartEdge(generator.id, outputNode.id)];
        }
        nodes = nodes.map((item) => outputIds.includes(item.id) ? {
          ...item,
          data: {
            ...item.data,
            prompt: submittedPrompt,
            model: generator.data?.model || "auto",
            output,
            status: task.status,
            error: task.error,
            task_id: task.id,
            updated_at: task.updated_at,
          },
        } : item);
        return { ...doc, nodes, edges };
      }, true, "提交 API 生成");
      selectSingleItem(outputIds[0] || generator.id);
      void pollTaskIntoGenerator(task.id, generator.id, outputIds);
    } catch (error) {
      const message = error instanceof Error ? error.message : "提交生成失败";
      updateCanvas((doc) => ({
        ...doc,
        nodes: doc.nodes.map((item) => item.id === generator.id
          ? { ...item, data: { ...item.data, status: "error", error: message, updated_at: new Date().toISOString() } }
          : item),
      }), true, "API 生成失败");
      toast.error(message);
    } finally {
      setRunning(false);
    }
  }, [imageRefsToFiles, migrateGeneratorDirectInputsToImageNodes, pollTaskIntoGenerator, selectSingleItem, updateCanvas]);

  useEffect(() => {
    const current = canvasRef.current;
    if (!current?.id) {
      return;
    }
    current.nodes
      .filter((item) => item.type === "image_generation" && item.data?.task_id && isActiveTask(item.data.status))
      .forEach((item) => {
        const outputIds = current.edges
          .filter((edge) => edge.source === item.id)
          .map((edge) => current.nodes.find((node) => node.id === edge.target))
          .filter((node): node is SmartCanvasItem => node?.type === "result")
          .map((node) => node.id);
      void pollTaskIntoGenerator(item.data?.task_id || "", item.id, outputIds);
      });
    current.nodes
      .filter((item) => item.type === "llm" && item.data?.task_id && isActiveTask(item.data.status))
      .forEach((item) => {
        void pollTaskIntoLlmNode(item.data?.task_id || "", item.id);
      });
    current.nodes
      .filter((item) => item.type === "result" && item.data?.task_id && item.data?.tool_type && isActiveTask(item.data.status))
      .forEach((item) => {
        void pollTaskIntoToolResult(item.data?.task_id || "", item.id, imageToolLabel(item.data?.tool_type || "image_edit"));
      });
  }, [canvas?.id, pollTaskIntoGenerator, pollTaskIntoLlmNode, pollTaskIntoToolResult]);

  const selectCanvas = useCallback(async (id: string) => {
    if (saveStateRef.current === "dirty" || saveStateRef.current === "error" || saveStateRef.current === "saving") {
      const saved = await flushSave();
      if (!saved && !window.confirm("当前画布保存失败，仍然切换吗？")) {
        return;
      }
    }
    const target = canvases.find((item) => item.id === id);
    if (target) {
      applyCanvas(target);
      setCanvasPickerOpen(false);
    }
  }, [applyCanvas, canvases, flushSave]);

  const createNewCanvas = useCallback(async () => {
    if (saveStateRef.current === "dirty" || saveStateRef.current === "error" || saveStateRef.current === "saving") {
      const saved = await flushSave();
      if (!saved && !window.confirm("当前画布保存失败，仍然新建吗？")) {
        return;
      }
    }
    applyCanvas(createEmptySmartCanvas());
    setCanvasPickerOpen(false);
  }, [applyCanvas, flushSave]);

  const deleteCanvasById = useCallback(async (id: string) => {
    if (!id) {
      return;
    }
    try {
      await deleteCanvas(id);
      const remaining = canvases.filter((item) => item.id !== id);
      setCanvases(remaining);
      if (canvasRef.current?.id === id) {
        applyCanvas(remaining[0] || createEmptySmartCanvas());
      }
      toast.success("画布已删除");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除画布失败");
    }
  }, [applyCanvas, canvases]);

  const renameCanvas = useCallback((name: string) => {
    updateCanvas((current) => ({ ...current, name }), true, "重命名画布");
  }, [updateCanvas]);

  const renameCanvasById = useCallback(async (id: string, name: string) => {
    const nextName = name.trim() || "未命名画布";
    const target = canvases.find((item) => item.id === id);
    if (!target || target.name === nextName) {
      return;
    }
    if (canvasRef.current?.id === id) {
      renameCanvas(nextName);
      return;
    }
    const optimistic = { ...target, name: nextName, updated_at: new Date().toISOString() };
    setCanvases((items) => items.map((item) => item.id === id ? optimistic : item));
    try {
      const saved = await saveCanvas(toCanvasPayload(optimistic));
      const normalized = normalizeSmartCanvas(saved) || optimistic;
      setCanvases((items) => items.map((item) => item.id === id ? normalized : item));
      toast.success("画布名称已更新");
    } catch (error) {
      setCanvases((items) => items.map((item) => item.id === id ? target : item));
      toast.error(error instanceof Error ? error.message : "更新画布名称失败");
    }
  }, [canvases, renameCanvas]);

  const deleteItem = useCallback((id: string) => {
    if (!id) {
      return;
    }
    updateCanvas((current) => ({
      ...current,
      nodes: current.nodes.filter((item) => item.id !== id),
      edges: current.edges.filter((edge) => edge.source !== id && edge.target !== id),
    }), true, "删除节点");
    const remainingSelection = selectedItemIds.filter((itemId) => itemId !== id);
    setSelectedItemIds(remainingSelection);
    setSelectedItemId((current) => current === id ? remainingSelection[0] || "" : current);
  }, [selectedItemIds, updateCanvas]);

  const deleteImageFromItem = useCallback((id: string, image: CanvasImageRef) => {
    if (!id) {
      return;
    }
    const targetKey = canvasImageKey(image);
    if (!targetKey) {
      return;
    }
    const remove = (items?: CanvasImageRef[]) => dedupeCanvasImageRefs((items || []).filter((item) => canvasImageKey(item) !== targetKey));
    updateCanvas((current) => ({
      ...current,
      nodes: current.nodes.map((item) => item.id === id ? {
        ...item,
        data: {
          ...item.data,
          images: remove(item.data?.images),
          input_images: remove(item.data?.input_images),
          mention_images: remove(item.data?.mention_images),
          output: item.data?.output ? {
            ...item.data.output,
            images: remove(item.data.output.images),
          } : item.data?.output,
          updated_at: new Date().toISOString(),
        },
      } : item),
    }), true, "移除图片");
  }, [updateCanvas]);

  const deleteSelected = useCallback(() => {
    const ids = selectedItemIds.length > 0 ? selectedItemIds : selectedItemId ? [selectedItemId] : [];
    if (ids.length === 0) {
      return;
    }
    const deleteIds = new Set(ids);
    updateCanvas((current) => ({
      ...current,
      nodes: current.nodes.filter((item) => !deleteIds.has(item.id)),
      edges: current.edges.filter((edge) => !deleteIds.has(edge.source) && !deleteIds.has(edge.target)),
    }), true, ids.length > 1 ? "删除多个节点" : "删除节点");
    selectSingleItem("");
  }, [selectSingleItem, selectedItemId, selectedItemIds, updateCanvas]);

  const copySelectedItems = useCallback(() => {
    const current = canvasRef.current;
    const ids = selectedItemIds.length > 0 ? selectedItemIds : selectedItemId ? [selectedItemId] : [];
    if (!current || ids.length === 0) {
      return false;
    }

    const selectedIds = new Set(ids);
    const nodes = current.nodes.filter((item) => selectedIds.has(item.id)).map(cloneCanvasItem);
    if (nodes.length === 0) {
      return false;
    }

    const copiedIds = new Set(nodes.map((item) => item.id));
    nodeClipboardRef.current = {
      nodes,
      edges: current.edges
        .filter((edge) => copiedIds.has(edge.source) && copiedIds.has(edge.target))
        .map((edge) => ({ ...edge })),
    };
    nodePasteOffsetRef.current = 0;
    toast.success(nodes.length > 1 ? `已复制 ${nodes.length} 个节点` : "已复制节点");
    return true;
  }, [selectedItemId, selectedItemIds]);

  const pasteCopiedItems = useCallback(() => {
    const clipboard = nodeClipboardRef.current;
    if (!clipboard || clipboard.nodes.length === 0) {
      return false;
    }

    nodePasteOffsetRef.current += 36;
    const offset = nodePasteOffsetRef.current;
    const now = new Date().toISOString();
    const idMap = new Map<string, string>();
    const pastedNodes = clipboard.nodes.map((item) => {
      const id = createItemId(item.type);
      idMap.set(item.id, id);
      return createPastedCanvasItem(item, id, offset, now);
    });
    const pastedEdges = clipboard.edges.flatMap((edge) => {
      const source = idMap.get(edge.source);
      const target = idMap.get(edge.target);
      return source && target ? [createSmartEdge(source, target)] : [];
    });

    updateCanvas((current) => ({
      ...current,
      nodes: [...current.nodes, ...pastedNodes],
      edges: [...current.edges, ...pastedEdges],
    }), true, pastedNodes.length > 1 ? "粘贴多个节点" : "粘贴节点");

    const pastedIds = pastedNodes.map((item) => item.id);
    setSelectedItemId(pastedIds[0] || "");
    setSelectedItemIds(pastedIds);
    return true;
  }, [updateCanvas]);

  const addAssetToCanvas = useCallback((asset: ManagedImage) => {
    addImagesToCanvas(managedImagesToRefs([asset]));
  }, [addImagesToCanvas]);

  const addAssetToComposer = useCallback((asset: ManagedImage) => {
    addImagesToComposer(managedImagesToRefs([asset]));
  }, [addImagesToComposer]);

  const addMentionImageToPrompt = useCallback((nodeId: string, image: CanvasImageRef) => {
    updateCanvas((current) => ({
      ...current,
      nodes: current.nodes.map((item) => item.id === nodeId ? {
        ...item,
        data: {
          ...item.data,
          input_images: dedupeCanvasImageRefs([...(item.data?.input_images || []), image]),
          updated_at: new Date().toISOString(),
        },
      } : item),
    }), true, "添加引用图片");
    setMentionOpen(false);
  }, [updateCanvas]);

  const handleUploadInputChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const refs = await uploadFilesToRefs(imageFilesFromList(event.target.files));
    addImagesToCanvas(refs, uploadTargetPointRef.current || undefined);
    uploadTargetPointRef.current = null;
    event.currentTarget.value = "";
  }, [addImagesToCanvas, uploadFilesToRefs]);

  const openUploadDialogAt = useCallback((point?: { x: number; y: number }) => {
    uploadTargetPointRef.current = point || null;
    uploadInputRef.current?.click();
  }, []);

  const undoCanvas = useCallback(() => {
    setHistory((current) => {
      const next = undoSmartCanvasHistory(current);
      if (next === current || !next.present) {
        return current;
      }
      applyingHistoryRef.current = true;
      canvasRef.current = next.present;
      setCanvas(next.present);
      const nextViewport = next.present.viewport || DEFAULT_SMART_VIEWPORT;
      viewportRef.current = nextViewport;
      setViewport(nextViewport);
      selectSingleItem("");
      applyingHistoryRef.current = false;
      markDirty();
      setHistoryEntries((entries) => next.present ? [createHistoryEntry("撤销", next.present), ...entries].slice(0, 30) : entries);
      return next;
    });
  }, [markDirty, selectSingleItem]);

  const redoCanvas = useCallback(() => {
    setHistory((current) => {
      const next = redoSmartCanvasHistory(current);
      if (next === current || !next.present) {
        return current;
      }
      applyingHistoryRef.current = true;
      canvasRef.current = next.present;
      setCanvas(next.present);
      const nextViewport = next.present.viewport || DEFAULT_SMART_VIEWPORT;
      viewportRef.current = nextViewport;
      setViewport(nextViewport);
      selectSingleItem("");
      applyingHistoryRef.current = false;
      markDirty();
      setHistoryEntries((entries) => next.present ? [createHistoryEntry("重做", next.present), ...entries].slice(0, 30) : entries);
      return next;
    });
  }, [markDirty, selectSingleItem]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName.toLowerCase();
        if (tag === "input" || tag === "textarea" || target.isContentEditable) {
          return;
        }
      }
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undoCanvas();
      }
      if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === "y" || (event.shiftKey && event.key.toLowerCase() === "z"))) {
        event.preventDefault();
        redoCanvas();
      }
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "c") {
        if (copySelectedItems()) {
          event.preventDefault();
        }
      }
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "v") {
        if (pasteCopiedItems()) {
          event.preventDefault();
        }
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelected();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [copySelectedItems, deleteSelected, pasteCopiedItems, redoCanvas, undoCanvas]);

  return {
    isCheckingAuth,
    canvases,
    canvas,
    models,
    assets,
    selectedItemId,
    selectedItemIds,
    selectedItem,
    viewport,
    tool,
    connectState,
    saveState,
    loading,
    saving,
    running,
    uploading,
    loadingAssets,
    loadingMoreAssets,
    hasMoreAssets,
    draggingImages,
    mentionOpen,
    mentionItems,
    imageEditorImage,
    angleControlOpen,
    angleControlImage,
    angleControlValues,
    selectedImageToolDisabledReason,
    canvasPickerOpen,
    runHistoryOpen,
    operationHistoryOpen,
    leftRailCollapsed,
    canUndo: canUndoSmartCanvasHistory(history),
    canRedo: canRedoSmartCanvasHistory(history),
    historyEntries,
    boardRef,
    uploadInputRef,
    setTool,
    setSelectedItemId,
    selectItem,
    setCanvasPickerOpen,
    setRunHistoryOpen,
    setOperationHistoryOpen,
    setLeftRailCollapsed,
    undoCanvas,
    redoCanvas,
    restoreHistoryEntry,
    saveNow,
    loadAssets,
    loadMoreAssets,
    reloadCanvases,
    updateItemData,
    addNodeAt,
    appendEdge,
    deleteEdge,
    addImagesToComposer,
    flushSave,
    handleBoardDrop,
    handleBoardDragOver,
    handleBoardPointerDown,
    handleItemPointerDown,
    handleResizeItemPointerDown,
    handlePointerMove,
    handlePointerUp,
    startConnect,
    finishConnect,
    handleWheel,
    updateViewport,
    zoomBy,
    fitContent,
    focusItem,
    openImage,
    applyEditedImageFiles,
    setImageEditorImage,
    setAngleControlOpen,
    setAngleControlImage,
    setAngleControlValues,
    runDetailEnhanceSelected,
    runDetailEnhanceForItem,
    openSelectedImageEditor,
    openImageEditorForItem,
    openAngleControl,
    openAngleControlForItem,
    runAngleControlSelected,
    runLlmNode,
    runGeneratorNode,
    selectCanvas,
    createNewCanvas,
    deleteCanvasById,
    renameCanvas,
    renameCanvasById,
    deleteSelected,
    deleteItem,
    deleteImageFromItem,
    addAssetToCanvas,
    addAssetToComposer,
    addMentionImageToPrompt,
    handleUploadInputChange,
    toggleMention: () => setMentionOpen((open) => !open),
    openUploadDialog: () => openUploadDialogAt(),
    openUploadDialogAt,
    stopDraggingImages: () => setDraggingImages(false),
  };
}
