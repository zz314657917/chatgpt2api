import type {
  CanvasDocument,
  CanvasEdge,
  CanvasImageRef,
  CanvasModelOption,
  CanvasNodeOutput,
  CreationTask,
  CreationTaskData,
  ManagedImage,
} from "@/lib/api";
import { getManagedImagePathFromUrl, getManagedImageThumbnailUrlFromPath, getManagedImageUrlFromPath } from "@/lib/image-path";

import {
  SMART_CANVAS_KIND,
  SMART_CANVAS_SCHEMA_VERSION,
  type SmartCanvasComposer,
  type SmartCanvasDocument,
  type SmartCanvasHistoryEntry,
  type SmartCanvasItem,
  type SmartCanvasItemData,
  type SmartCanvasModelCatalog,
  type SmartCanvasRunRecord,
  type SmartCanvasSaveState,
  type SmartCanvasViewport,
} from "./types";

export const DEFAULT_SMART_VIEWPORT: SmartCanvasViewport = { x: 0, y: 0, zoom: 1 };
export const DEFAULT_COMPOSER: SmartCanvasComposer = {
  prompt: "",
  model: "auto",
  size: "1024x1024",
  n: 1,
  visibility: "private",
  images: [],
  mentionImages: [],
};

export function createItemId(type: SmartCanvasItem["type"]) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${type}-${crypto.randomUUID()}`;
  }
  return `${type}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createEdgeId(source: string, target: string) {
  return `edge-${source}-${target}`;
}

export function normalizeSmartCanvas(input?: CanvasDocument | null): SmartCanvasDocument | null {
  if (!input || input.kind !== SMART_CANVAS_KIND || input.schema_version !== SMART_CANVAS_SCHEMA_VERSION) {
    return null;
  }
  const nodes = Array.isArray(input.nodes)
    ? input.nodes.flatMap((node) => {
        if (node.type !== "image" && node.type !== "prompt" && node.type !== "llm" && node.type !== "loop" && node.type !== "image_generation" && node.type !== "result") {
          return [];
        }
        return [{
          ...node,
          type: node.type,
          name: node.name || smartItemTitle(node.type),
          position: {
            x: Number(node.position?.x ?? 0),
            y: Number(node.position?.y ?? 0),
          },
          data: normalizeItemData(node.data),
        } satisfies SmartCanvasItem];
      })
    : [];
  const normalizedNodes = nodes;
  return {
    ...input,
    kind: SMART_CANVAS_KIND,
    schema_version: SMART_CANVAS_SCHEMA_VERSION,
    name: input.name || "未命名画布",
    nodes: normalizedNodes,
    edges: normalizeSmartEdges(input.edges, new Set(normalizedNodes.map((node) => node.id))),
    viewport: normalizeViewport(input.viewport),
  };
}

export function createEmptySmartCanvas(name = "未命名画布"): SmartCanvasDocument {
  const starter = createStarterSmartLayout();
  return {
    id: "",
    name,
    kind: SMART_CANVAS_KIND,
    schema_version: SMART_CANVAS_SCHEMA_VERSION,
    nodes: starter.nodes,
    edges: starter.edges,
    viewport: starter.viewport,
  };
}

export function toCanvasPayload(canvas: SmartCanvasDocument): SmartCanvasDocument {
  return {
    ...canvas,
    kind: SMART_CANVAS_KIND,
    schema_version: SMART_CANVAS_SCHEMA_VERSION,
    nodes: canvas.nodes.map((node) => ({
      ...node,
      type: node.type,
      name: node.name || smartItemTitle(node.type),
      position: {
        x: Number(node.position?.x ?? 0),
        y: Number(node.position?.y ?? 0),
      },
      data: sanitizeSmartItemData(node.data),
    })),
    edges: normalizeSmartEdges(canvas.edges, new Set(canvas.nodes.map((node) => node.id))),
    viewport: normalizeViewport(canvas.viewport),
  };
}

export function smartItemTitle(type: SmartCanvasItem["type"]) {
  switch (type) {
    case "image":
      return "图片";
    case "prompt":
      return "Prompt";
    case "llm":
      return "AI 提示词";
    case "loop":
      return "循环";
    case "image_generation":
      return "API生成";
    case "result":
      return "结果";
  }
}

export function createImageItem(images: CanvasImageRef[], position: { x: number; y: number }): SmartCanvasItem {
  return {
    id: createItemId("image"),
    type: "image",
    name: images.length > 1 ? `${images.length} 张图片` : "图片",
    position,
    data: {
      images: dedupeCanvasImageRefs(images),
      created_at: new Date().toISOString(),
    },
  };
}

export function createPromptItem(composer: SmartCanvasComposer, position: { x: number; y: number }): SmartCanvasItem {
  return createPromptNode(position, composer.prompt, composer);
}

export function createPromptNode(
  position: { x: number; y: number },
  prompt = "",
  composer?: Partial<SmartCanvasComposer>,
): SmartCanvasItem {
  return {
    id: createItemId("prompt"),
    type: "prompt",
    name: "Prompt",
    position,
    data: {
      prompt,
      model: composer?.model || DEFAULT_COMPOSER.model,
      size: composer?.size || DEFAULT_COMPOSER.size,
      n: composer?.n || DEFAULT_COMPOSER.n,
      visibility: composer?.visibility || DEFAULT_COMPOSER.visibility,
      input_images: dedupeCanvasImageRefs([...(composer?.images || []), ...(composer?.mentionImages || [])]),
      mention_images: dedupeCanvasImageRefs(composer?.mentionImages || []),
      created_at: new Date().toISOString(),
    },
  };
}

export function createLlmNode(position: { x: number; y: number }): SmartCanvasItem {
  return {
    id: createItemId("llm"),
    type: "llm",
    name: "AI 提示词",
    position,
    data: {
      prompt: "",
      model: "auto",
      output: { text: "" },
      status: undefined,
      created_at: new Date().toISOString(),
    },
  };
}

export function createLoopNode(position: { x: number; y: number }): SmartCanvasItem {
  return {
    id: createItemId("loop"),
    type: "loop",
    name: "循环",
    position,
    data: {
      loop_mode: "repeat",
      loop_count: 3,
      loop_concurrency: 1,
      status: undefined,
      output: { images: [] },
      created_at: new Date().toISOString(),
    },
  };
}

export function createGeneratorNode(position: { x: number; y: number }): SmartCanvasItem {
  return {
    id: createItemId("image_generation"),
    type: "image_generation",
    name: "API生成",
    position,
    data: {
      prompt: "",
      model: DEFAULT_COMPOSER.model,
      size: DEFAULT_COMPOSER.size,
      n: DEFAULT_COMPOSER.n,
      visibility: DEFAULT_COMPOSER.visibility,
      input_images: [],
      status: undefined,
      created_at: new Date().toISOString(),
    },
  };
}

export function createOutputNode(position: { x: number; y: number }): SmartCanvasItem {
  return {
    id: createItemId("result"),
    type: "result",
    name: "Output",
    position,
    data: {
      output: { images: [] },
      created_at: new Date().toISOString(),
    },
  };
}

export function createResultItem(
  composer: SmartCanvasComposer,
  task: CreationTask,
  position: { x: number; y: number },
): SmartCanvasItem {
  const output = creationTaskToOutput(task);
  return {
    id: createItemId("result"),
    type: "result",
    name: task.status === "success" ? "生成结果" : "生成中",
    position,
    data: {
      prompt: composer.prompt,
      model: composer.model,
      size: composer.size,
      n: composer.n,
      visibility: composer.visibility,
      input_images: dedupeCanvasImageRefs([...composer.images, ...composer.mentionImages]),
      mention_images: dedupeCanvasImageRefs(composer.mentionImages),
      output,
      status: task.status,
      error: task.error,
      task_id: task.id,
      created_at: task.created_at || new Date().toISOString(),
      updated_at: task.updated_at,
    },
  };
}

export function createSmartEdge(source: string, target: string): CanvasEdge {
  return {
    id: createEdgeId(source, target),
    source,
    target,
    source_handle: "out",
    target_handle: "in",
  };
}

export function createHistoryEntry(label: string, snapshot: SmartCanvasDocument): SmartCanvasHistoryEntry {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `history-${crypto.randomUUID()}`
    : `history-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const normalizedSnapshot = normalizeSmartCanvas(snapshot) || createEmptySmartCanvas(snapshot.name || "未命名画布");
  return {
    id,
    label,
    createdAt: new Date().toISOString(),
    snapshot: normalizedSnapshot,
  };
}

export function updateResultItemFromTask(item: SmartCanvasItem, task: CreationTask): SmartCanvasItem {
  const output = creationTaskToOutput(task);
  return {
    ...item,
    name: task.status === "success" ? "生成结果" : item.name || "生成结果",
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

export function managedImagesToRefs(items: ManagedImage[]): CanvasImageRef[] {
  return dedupeCanvasImageRefs(items.map((item) => ({
    url: item.preview_url || item.thumbnail_url || "",
    path: item.path,
    name: item.name,
    thumbnail_url: item.thumbnail_url,
  })));
}

export function canvasImagesFromItem(item?: SmartCanvasItem | null): CanvasImageRef[] {
  if (!item?.data) {
    return [];
  }
  const images = Array.isArray(item.data.images) ? item.data.images : [];
  const inputImages = Array.isArray(item.data.input_images) ? item.data.input_images : [];
  const sourceImages = Array.isArray(item.data.source_images) ? item.data.source_images : [];
  const outputImages = item.data.output?.images || [];
  return dedupeCanvasImageRefs([...images, ...inputImages, ...sourceImages, ...outputImages]);
}

export function canvasPromptFromItem(item?: SmartCanvasItem | null) {
  if (item?.type === "llm") {
    return item.data?.output?.text || item.data?.prompt || item.data?.text || "";
  }
  return item?.data?.prompt || item?.data?.text || "";
}

export function incomingItems(canvas: SmartCanvasDocument | null, targetId: string, types?: SmartCanvasItem["type"][]) {
  if (!canvas || !targetId) {
    return [];
  }
  const allowed = types ? new Set(types) : null;
  const nodesById = new Map(canvas.nodes.map((node) => [node.id, node]));
  return canvas.edges
    .filter((edge) => edge.target === targetId)
    .map((edge) => nodesById.get(edge.source))
    .filter((node): node is SmartCanvasItem => Boolean(node && (!allowed || allowed.has(node.type))));
}

export function outgoingItems(canvas: SmartCanvasDocument | null, sourceId: string, types?: SmartCanvasItem["type"][]) {
  if (!canvas || !sourceId) {
    return [];
  }
  const allowed = types ? new Set(types) : null;
  const nodesById = new Map(canvas.nodes.map((node) => [node.id, node]));
  return canvas.edges
    .filter((edge) => edge.source === sourceId)
    .map((edge) => nodesById.get(edge.target))
    .filter((node): node is SmartCanvasItem => Boolean(node && (!allowed || allowed.has(node.type))));
}

function sourcePathFromThumbnailUrl(value: string) {
  const text = cleanImageText(value);
  if (!text) {
    return "";
  }
  try {
    const base = typeof window === "undefined" ? "http://localhost" : window.location.href;
    const url = new URL(text, base);
    const prefix = "/image-thumbnails/";
    if (!url.pathname.startsWith(prefix)) {
      return "";
    }
    const encoded = url.pathname.slice(prefix.length).replace(/\.jpg$/i, "");
    return decodeURIComponent(encoded);
  } catch {
    return "";
  }
}

export function canvasImageKey(ref: CanvasImageRef) {
  return (
    cleanImageText(ref.path) ||
    getManagedImagePathFromUrl(cleanImageText(ref.local_url)) ||
    getManagedImagePathFromUrl(cleanImageText(ref.url)) ||
    sourcePathFromThumbnailUrl(cleanImageText(ref.thumbnail_url)) ||
    cleanImageText(ref.local_url) ||
    cleanImageText(ref.url) ||
    cleanImageText(ref.thumbnail_url) ||
    cleanImageText(ref.name)
  );
}

export function dedupeCanvasImageRefs(refs: CanvasImageRef[]) {
  const seen = new Set<string>();
  const out: CanvasImageRef[] = [];
  for (const ref of refs) {
    const clean: CanvasImageRef = {
      url: cleanImageText(ref.url),
      local_url: cleanImageText(ref.local_url),
      path: cleanImageText(ref.path) ||
        getManagedImagePathFromUrl(cleanImageText(ref.local_url)) ||
        getManagedImagePathFromUrl(cleanImageText(ref.url)) ||
        sourcePathFromThumbnailUrl(cleanImageText(ref.thumbnail_url)),
      name: cleanImageText(ref.name),
      thumbnail_url: cleanImageText(ref.thumbnail_url),
    };
    const key = canvasImageKey(clean);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(clean);
  }
  return out;
}

export function canvasImageSource(ref: CanvasImageRef) {
  return cleanImageText(ref.local_url) || cleanImageText(ref.url) || (ref.path ? getManagedImageUrlFromPath(ref.path) : "");
}

export function canvasImagePreviewSource(ref: CanvasImageRef) {
  return cleanImageText(ref.thumbnail_url) || (ref.path ? getManagedImageThumbnailUrlFromPath(ref.path) : "") || canvasImageSource(ref);
}

export function canvasImageLabel(ref: CanvasImageRef, index: number) {
  return cleanImageText(ref.name) || cleanImageText(ref.path)?.split("/").pop() || `图片 ${index + 1}`;
}

export function screenToWorld(point: { x: number; y: number }, rect: DOMRect, viewport: SmartCanvasViewport) {
  return {
    x: (point.x - rect.left - viewport.x) / viewport.zoom,
    y: (point.y - rect.top - viewport.y) / viewport.zoom,
  };
}

export function clampZoom(value: number) {
  return Math.min(2.4, Math.max(0.25, value));
}

export function zoomViewportAt(
  viewport: SmartCanvasViewport,
  rect: DOMRect,
  clientPoint: { x: number; y: number },
  nextZoom: number,
) {
  const zoom = clampZoom(nextZoom);
  const before = screenToWorld(clientPoint, rect, viewport);
  return {
    x: clientPoint.x - rect.left - before.x * zoom,
    y: clientPoint.y - rect.top - before.y * zoom,
    zoom,
  };
}

export function saveStateLabel(state: SmartCanvasSaveState) {
  switch (state) {
    case "saving":
      return "保存中";
    case "dirty":
      return "未保存";
    case "error":
      return "保存失败";
    default:
      return "已保存";
  }
}

export function statusLabel(status?: CreationTask["status"]) {
  switch (status) {
    case "queued":
      return "排队";
    case "running":
      return "生成中";
    case "success":
      return "成功";
    case "error":
      return "失败";
    case "cancelled":
      return "已取消";
    default:
      return "";
  }
}

export function isActiveTask(status?: CreationTask["status"]) {
  return status === "queued" || status === "running";
}

export function imageFilesFromList(files: FileList | File[] | null | undefined) {
  return Array.from(files || []).filter((file) => file.type.startsWith("image/"));
}

export function normalizeModelCatalog(models: CanvasModelOption[]): SmartCanvasModelCatalog {
  const text = models.filter((model) => model.kind === "text" || model.kind === "both");
  const image = models.filter((model) => model.kind === "image" || model.kind === "both");
  const withAuto = image.some((model) => model.id === "auto")
    ? image
    : [{ id: "auto", name: "auto", kind: "image" as const }, ...image];
  const textWithAuto = text.some((model) => model.id === "auto")
    ? text
    : [{ id: "auto", name: "auto", kind: "text" as const }, ...text];
  return { all: models, text: textWithAuto, image: withAuto };
}

export function smartCanvasRuns(canvas: SmartCanvasDocument | null): SmartCanvasRunRecord[] {
  if (!canvas) {
    return [];
  }
  return canvas.nodes
    .filter((node) => (node.type === "result" || node.type === "image_generation") && node.data?.task_id)
    .map((node) => {
      const incomingImages = incomingItems(canvas, node.id).flatMap((input) => canvasImagesFromItem(input));
      const mode: SmartCanvasRunRecord["mode"] = (node.data?.input_images?.length || incomingImages.length || 0) > 0 ? "edit" : "generate";
      return {
        id: node.id,
        prompt: node.data?.prompt || "",
        model: node.data?.model || "auto",
        mode,
        status: node.data?.status || "queued",
        taskId: node.data?.task_id,
        images: node.data?.output?.images || [],
        error: node.data?.error,
        createdAt: node.data?.created_at || "",
        updatedAt: node.data?.updated_at,
      };
    })
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export function mentionCandidateImages(canvas: SmartCanvasDocument | null, assets: ManagedImage[]) {
  const canvasRefs = canvas?.nodes.flatMap((node) => canvasImagesFromItem(node)) || [];
  return dedupeCanvasImageRefs([...canvasRefs, ...managedImagesToRefs(assets)]).slice(0, 36);
}

function normalizeViewport(value: CanvasDocument["viewport"]): SmartCanvasViewport {
  return {
    x: Number(value?.x ?? DEFAULT_SMART_VIEWPORT.x),
    y: Number(value?.y ?? DEFAULT_SMART_VIEWPORT.y),
    zoom: clampZoom(Number(value?.zoom ?? DEFAULT_SMART_VIEWPORT.zoom)),
  };
}

function createStarterSmartLayout() {
  const prompt = createPromptNode({ x: 360, y: 430 });
  const generator = createGeneratorNode({ x: 760, y: 300 });
  const output = createOutputNode({ x: 1190, y: 300 });
  return {
    nodes: [prompt, generator, output],
    edges: [createSmartEdge(prompt.id, generator.id), createSmartEdge(generator.id, output.id)],
    viewport: { x: -120, y: -120, zoom: 1 },
  };
}

function normalizeSmartEdges(edges: CanvasEdge[] | undefined, nodeIds: Set<string>) {
  const out: CanvasEdge[] = [];
  const seen = new Set<string>();
  for (const edge of edges || []) {
    const source = cleanImageText(edge.source);
    const target = cleanImageText(edge.target);
    if (!source || !target || source === target || !nodeIds.has(source) || !nodeIds.has(target)) {
      continue;
    }
    const id = cleanImageText(edge.id) || createEdgeId(source, target);
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    out.push({
      id,
      source,
      target,
      source_handle: cleanImageText(edge.source_handle) || "out",
      target_handle: cleanImageText(edge.target_handle) || "in",
    });
  }
  return out;
}

function normalizeItemData(data?: SmartCanvasItemData): SmartCanvasItemData {
  return sanitizeSmartItemData(data);
}

function sanitizeSmartItemData(data?: SmartCanvasItemData): SmartCanvasItemData {
  if (!data) {
    return {};
  }
  return {
    ...data,
    prompt: typeof data.prompt === "string" ? data.prompt : "",
    model: typeof data.model === "string" && data.model ? data.model : "auto",
    size: typeof data.size === "string" && data.size ? data.size : "1024x1024",
    n: Number.isFinite(Number(data.n)) ? Math.max(1, Math.min(4, Number(data.n))) : 1,
    visibility: data.visibility === "public" ? "public" : "private",
    images: dedupeCanvasImageRefs(Array.isArray(data.images) ? data.images : []),
    source_images: dedupeCanvasImageRefs(Array.isArray(data.source_images) ? data.source_images : []),
    input_images: dedupeCanvasImageRefs(Array.isArray(data.input_images) ? data.input_images : []),
    mention_images: dedupeCanvasImageRefs(Array.isArray(data.mention_images) ? data.mention_images : []),
    loop_mode: data.loop_mode === "images" ? "images" : "repeat",
    loop_count: Number.isFinite(Number(data.loop_count)) ? Math.max(1, Math.min(20, Number(data.loop_count))) : undefined,
    loop_concurrency: 1,
    loop_progress: data.loop_progress && typeof data.loop_progress === "object"
      ? {
          total: Math.max(0, Number(data.loop_progress.total) || 0),
          completed: Math.max(0, Number(data.loop_progress.completed) || 0),
          failed: Math.max(0, Number(data.loop_progress.failed) || 0),
          current: Math.max(0, Number(data.loop_progress.current) || 0),
        }
      : undefined,
    tool_type: data.tool_type,
    tool_parameters: data.tool_parameters && typeof data.tool_parameters === "object" ? data.tool_parameters : undefined,
    width: Number.isFinite(Number(data.width)) ? Math.max(180, Math.min(720, Number(data.width))) : undefined,
    height: Number.isFinite(Number(data.height)) ? Math.max(180, Math.min(720, Number(data.height))) : undefined,
    output: normalizeOutput(data.output),
    status: data.status,
    error: typeof data.error === "string" ? data.error : "",
    task_id: typeof data.task_id === "string" ? data.task_id : "",
  };
}

function normalizeOutput(output?: CanvasNodeOutput): CanvasNodeOutput | undefined {
  if (!output) {
    return undefined;
  }
  return {
    text: typeof output.text === "string" ? output.text : "",
    task_id: typeof output.task_id === "string" ? output.task_id : "",
    images: dedupeCanvasImageRefs(Array.isArray(output.images) ? output.images : []),
    raw: output.raw,
  };
}

export function creationTaskToOutput(task: CreationTask): CanvasNodeOutput {
  return {
    task_id: task.id,
    images: dedupeCanvasImageRefs((task.data || []).flatMap(taskDataToImageRef)),
    text: (task.data || []).map((item) => item.text_response || item.revised_prompt || "").filter(Boolean).join("\n"),
    raw: {
      status: task.status,
      error: task.error,
      mode: task.mode,
    },
  };
}

function taskDataToImageRef(item: CreationTaskData): CanvasImageRef[] {
  if (!item.url && !item.local_url) {
    return [];
  }
  return [{
    url: item.url,
    local_url: item.local_url || item.url,
  }];
}

function cleanImageText(value: unknown) {
  return String(value || "").trim();
}
