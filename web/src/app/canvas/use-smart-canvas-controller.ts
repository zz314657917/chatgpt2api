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
  type ManagedImage,
} from "@/lib/api";
import { fetchAuthenticatedImageBlob } from "@/lib/authenticated-image";
import { useAuthGuard } from "@/lib/use-auth-guard";

import {
  DEFAULT_SMART_VIEWPORT,
  canvasImageSource,
  clampZoom,
  createEmptySmartCanvas,
  createGeneratorNode,
  createImageItem,
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
  SMART_CANVAS_AUTOSAVE_DELAY_MS,
  type SmartCanvasConnectState,
  type SmartCanvasDocument,
  type SmartCanvasDragState,
  type SmartCanvasItem,
  type SmartCanvasSaveState,
  type SmartCanvasTool,
  type SmartCanvasViewport,
} from "./types";

const MANAGED_IMAGE_DRAG_TYPE = "application/x-chatgpt2api-managed-image";
const CROP_NODE_OFFSET = { x: 32, y: 32 };

function canConnectNodes(source: SmartCanvasItem, target: SmartCanvasItem) {
  if (target.type === "image_generation") {
    return source.type === "image" || source.type === "prompt" || source.type === "result";
  }
  if (target.type === "result") {
    return source.type === "image_generation";
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
  const upstreamKeys = new Set(dedupeCanvasImageRefs(upstreamImages).map(canvasImageSource));
  return dedupeCanvasImageRefs([
    ...(generator.data?.input_images || []).filter((image) => !upstreamKeys.has(canvasImageSource(image))),
    ...upstreamImages,
  ]);
}

function generatorPromptText(canvas: SmartCanvasDocument, generator: SmartCanvasItem) {
  const upstream = incomingItems(canvas, generator.id);
  return [
    ...upstream.filter((item) => item.type === "prompt").map((item) => item.data?.prompt || ""),
    generator.data?.prompt || "",
  ].map((value) => value.trim()).filter(Boolean).join("\n\n");
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

export function useSmartCanvasController() {
  const { isCheckingAuth } = useAuthGuard(undefined, "/canvas");
  const [canvases, setCanvases] = useState<SmartCanvasDocument[]>([]);
  const [canvas, setCanvas] = useState<SmartCanvasDocument | null>(null);
  const [models, setModels] = useState(() => normalizeModelCatalog([]));
  const [assets, setAssets] = useState<ManagedImage[]>([]);
  const [selectedItemId, setSelectedItemId] = useState("");
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
  const [draggingImages, setDraggingImages] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [imageEditorImage, setImageEditorImage] = useState<CanvasImageRef | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
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

  const selectedItem = useMemo(
    () => canvas?.nodes.find((item) => item.id === selectedItemId) || null,
    [canvas, selectedItemId],
  );
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

  const setActiveDragState = useCallback((next: SmartCanvasDragState) => {
    dragStateRef.current = next;
    setDragState(next);
  }, []);

  const setActiveConnectState = useCallback((next: SmartCanvasConnectState) => {
    connectStateRef.current = next;
    setConnectState(next);
  }, []);

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
    setSelectedItemId("");
    dirtyVersionRef.current = 0;
    saveStateRef.current = "saved";
    setSaveState("saved");
  }, []);

  const loadAssets = useCallback(async () => {
    setLoadingAssets(true);
    try {
      const result = await fetchManagedImages({ scope: "mine" });
      setAssets(result.items.slice(0, 60));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载图片库失败");
    } finally {
      setLoadingAssets(false);
    }
  }, []);

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

  const updateCanvas = useCallback((updater: (current: SmartCanvasDocument) => SmartCanvasDocument, dirty = true) => {
    setCanvas((current) => {
      const base = current || createEmptySmartCanvas();
      const next = updater(base);
      canvasRef.current = next;
      return next;
    });
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
      : type === "image_generation"
        ? createGeneratorNode(position)
        : type === "result"
          ? createOutputNode(position)
          : createImageItem([], position);
    updateCanvas((current) => ({ ...current, nodes: [...current.nodes, item] }));
    setSelectedItemId(item.id);
    return item;
  }, [updateCanvas]);

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
    }));
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
    }, true);
    return changed;
  }, [updateCanvas]);

  const deleteEdge = useCallback((edgeId: string) => {
    updateCanvas((current) => ({
      ...current,
      edges: current.edges.filter((edge) => edge.id !== edgeId),
    }));
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
        updateCanvas((current) => ({
          ...current,
          nodes: current.nodes.map((item) => item.id === activeDrag.itemId
            ? { ...item, position: { x: activeDrag.startPosition.x + dx, y: activeDrag.startPosition.y + dy } }
            : item),
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
        markDirty();
      }
      if (activeDrag.kind === "pan") {
        updateCanvas((current) => ({ ...current, viewport: viewportRef.current }), true);
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
  }, [appendEdge, markDirty, setActiveConnectState, setActiveDragState, updateCanvas]);

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
    });
    setSelectedItemId(item.id);
  }, [selectedItemId, updateCanvas]);

  const addCroppedImageToCanvas = useCallback((original: CanvasImageRef, images: CanvasImageRef[]) => {
    const refs = dedupeCanvasImageRefs(images);
    if (refs.length === 0) {
      return;
    }
    let position = { x: 160, y: 160 };
    const current = canvasRef.current;
    if (current) {
      const originalSrc = canvasImageSource(original);
      const sourceItem = current.nodes.find((item) => (
        (item.data?.images || []).some((image) => canvasImageSource(image) === originalSrc) ||
        (item.data?.input_images || []).some((image) => canvasImageSource(image) === originalSrc) ||
        (item.data?.output?.images || []).some((image) => canvasImageSource(image) === originalSrc)
      ));
      if (sourceItem) {
        position = {
          x: Number(sourceItem.position?.x || 0) + CROP_NODE_OFFSET.x,
          y: Number(sourceItem.position?.y || 0) + CROP_NODE_OFFSET.y,
        };
      }
    }
    const item = createImageItem(refs, position);
    item.name = "裁剪图片";
    updateCanvas((doc) => ({ ...doc, nodes: [...doc.nodes, item] }));
    setSelectedItemId(item.id);
  }, [updateCanvas]);

  const applyEditedImageFiles = useCallback(async (original: CanvasImageRef, files: File[]) => {
    const imageFiles = imageFilesFromList(files);
    if (imageFiles.length === 0) {
      toast.error("没有可上传的编辑结果");
      return;
    }
    setUploading(true);
    try {
      const items = await uploadManagedImages(imageFiles, "private");
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
  }, [addCroppedImageToCanvas, loadAssets]);

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
    updateCanvas((doc) => ({
      ...doc,
      nodes: doc.nodes.map((item) => item.id === target.id ? {
        ...item,
        data: {
          ...item.data,
          input_images: dedupeCanvasImageRefs([...(item.data?.input_images || []), ...refs]),
          updated_at: new Date().toISOString(),
        },
      } : item),
    }));
    setSelectedItemId(target.id);
    setMentionOpen(false);
  }, [addImagesToCanvas, selectedItemId, updateCanvas]);

  const connectImagesToGenerator = useCallback((images: CanvasImageRef[], generator: SmartCanvasItem) => {
    const refs = dedupeCanvasImageRefs(images);
    if (refs.length === 0 || generator.type !== "image_generation") {
      return;
    }
    const item = createImageItem(refs, {
      x: Number(generator.position?.x || 0) - 330,
      y: Number(generator.position?.y || 0) + 20,
    });
    updateCanvas((current) => ({
      ...current,
      nodes: [...current.nodes, item],
      edges: current.edges.some((edge) => edge.source === item.id && edge.target === generator.id)
        ? current.edges
        : [...current.edges, createSmartEdge(item.id, generator.id)],
    }));
    setSelectedItemId(item.id);
    setMentionOpen(false);
  }, [updateCanvas]);

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
    const item = createImageItem(normalizedRefs, {
      x: Number(target.position?.x || world.x) - 330,
      y: world.y - 120,
    });
    updateCanvas((current) => ({
      ...current,
      nodes: [...current.nodes, item],
      edges: [...current.edges, createSmartEdge(item.id, target.id)],
    }));
    setSelectedItemId(item.id);
    return true;
  }, [updateCanvas]);

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
      }));
    } else if (selectedItem?.type === "prompt") {
      updateCanvas((current) => ({
        ...current,
        nodes: current.nodes.map((item) => item.id === selectedItem.id
          ? { ...item, data: { ...item.data, input_images: dedupeCanvasImageRefs([...(item.data?.input_images || []), ...refs]) } }
          : item),
      }));
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
      setSelectedItemId("");
      if (tool === "pan" || event.altKey || event.metaKey || event.ctrlKey) {
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
  }, [bindWindowPointerSession, setActiveDragState, tool]);

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
    setSelectedItemId(item.id);
    setActiveDragState({
      kind: "item",
      pointerId: event.pointerId,
      itemId: item.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPosition: {
        x: Number(item.position?.x || 0),
        y: Number(item.position?.y || 0),
      },
    });
    bindWindowPointerSession(event.pointerId);
  }, [bindWindowPointerSession, setActiveDragState]);

  const handleResizeItemPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>, item: SmartCanvasItem) => {
    if (event.button !== 0) {
      return;
    }
    event.stopPropagation();
    setSelectedItemId(item.id);
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
  }, [bindWindowPointerSession, setActiveDragState]);

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
      updateCanvas((current) => ({
        ...current,
        nodes: current.nodes.map((item) => item.id === dragState.itemId
          ? { ...item, position: { x: dragState.startPosition.x + dx, y: dragState.startPosition.y + dy } }
          : item),
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
      markDirty();
    }
    if (dragState.kind === "pan" && dragState.pointerId === event.pointerId) {
      updateCanvas((current) => ({ ...current, viewport: viewportRef.current }), true);
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
  }, [appendEdge, connectState, dragState, markDirty, setActiveConnectState, setActiveDragState, updateCanvas]);

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

  const zoomBy = useCallback((factor: number) => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const next = zoomViewportAt(viewportRef.current, rect, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, viewportRef.current.zoom * factor);
    setViewport(next);
    viewportRef.current = next;
    updateCanvas((current) => ({ ...current, viewport: next }), true);
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
    updateCanvas((doc) => ({ ...doc, viewport: next }), true);
  }, [updateCanvas]);

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
        }), !active);
      }
      void loadAssets();
    } catch (error) {
      const message = error instanceof Error ? error.message : "同步任务状态失败";
      updateCanvas((current) => ({
        ...current,
        nodes: current.nodes.map((item) => item.id === generatorId || outputIds.includes(item.id)
          ? { ...item, data: { ...item.data, status: "error", error: message, task_id: taskId } }
          : item),
      }));
      toast.error(message);
    } finally {
      pollingTasksRef.current.delete(taskId);
    }
  }, [loadAssets, updateCanvas]);

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
      toast.error("请在 Prompt 节点或 API生成节点里输入提示词");
      return;
    }
    const inputRefs = generatorInputImages(current, generator);
    setRunning(true);
    try {
      updateCanvas((doc) => ({
        ...doc,
        nodes: doc.nodes.map((item) => item.id === generator.id ? {
          ...item,
          data: {
            ...item.data,
            input_images: inputRefs,
            status: "running",
            error: "",
            output: { images: [] },
            updated_at: new Date().toISOString(),
          },
        } : item),
      }));
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
      let outputIds = current.edges.filter((edge) => edge.source === generator.id)
        .map((edge) => current.nodes.find((item) => item.id === edge.target))
        .filter((item): item is SmartCanvasItem => item?.type === "result")
        .map((item) => item.id);
      updateCanvas((doc) => {
        let nodes = doc.nodes.map((item) => item.id === generator.id ? {
          ...item,
          data: {
            ...item.data,
            input_images: inputRefs,
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
      });
      setSelectedItemId(outputIds[0] || generator.id);
      void pollTaskIntoGenerator(task.id, generator.id, outputIds);
    } catch (error) {
      const message = error instanceof Error ? error.message : "提交生成失败";
      updateCanvas((doc) => ({
        ...doc,
        nodes: doc.nodes.map((item) => item.id === generator.id
          ? { ...item, data: { ...item.data, status: "error", error: message, updated_at: new Date().toISOString() } }
          : item),
      }));
      toast.error(message);
    } finally {
      setRunning(false);
    }
  }, [imageRefsToFiles, pollTaskIntoGenerator, updateCanvas]);

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
  }, [canvas?.id, pollTaskIntoGenerator]);

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
  }, [applyCanvas, flushSave]);

  const deleteCurrentCanvas = useCallback(async () => {
    if (!canvas?.id) {
      applyCanvas(createEmptySmartCanvas());
      setDeleteConfirm(false);
      return;
    }
    try {
      await deleteCanvas(canvas.id);
      const remaining = canvases.filter((item) => item.id !== canvas.id);
      setCanvases(remaining);
      applyCanvas(remaining[0] || createEmptySmartCanvas());
      setDeleteConfirm(false);
      toast.success("画布已删除");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除画布失败");
    }
  }, [applyCanvas, canvas?.id, canvases]);

  const renameCanvas = useCallback((name: string) => {
    updateCanvas((current) => ({ ...current, name }));
  }, [updateCanvas]);

  const deleteItem = useCallback((id: string) => {
    if (!id) {
      return;
    }
    updateCanvas((current) => ({
      ...current,
      nodes: current.nodes.filter((item) => item.id !== id),
      edges: current.edges.filter((edge) => edge.source !== id && edge.target !== id),
    }));
    setSelectedItemId((current) => current === id ? "" : current);
  }, [updateCanvas]);

  const deleteSelected = useCallback(() => {
    if (!selectedItemId) {
      return;
    }
    deleteItem(selectedItemId);
  }, [deleteItem, selectedItemId]);

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
    }));
    setMentionOpen(false);
  }, [updateCanvas]);

  const handleUploadInputChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const refs = await uploadFilesToRefs(imageFilesFromList(event.target.files));
    addImagesToCanvas(refs);
    event.currentTarget.value = "";
  }, [addImagesToCanvas, uploadFilesToRefs]);

  return {
    isCheckingAuth,
    canvases,
    canvas,
    models,
    assets,
    selectedItemId,
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
    draggingImages,
    mentionOpen,
    mentionItems,
    imageEditorImage,
    deleteConfirm,
    boardRef,
    uploadInputRef,
    setTool,
    setSelectedItemId,
    setDeleteConfirm,
    saveNow,
    loadAssets,
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
    zoomBy,
    fitContent,
    openImage,
    applyEditedImageFiles,
    setImageEditorImage,
    runGeneratorNode,
    selectCanvas,
    createNewCanvas,
    deleteCurrentCanvas,
    renameCanvas,
    deleteSelected,
    deleteItem,
    addAssetToCanvas,
    addAssetToComposer,
    addMentionImageToPrompt,
    handleUploadInputChange,
    toggleMention: () => setMentionOpen((open) => !open),
    openUploadDialog: () => uploadInputRef.current?.click(),
    stopDraggingImages: () => setDraggingImages(false),
  };
}
