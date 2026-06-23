import type {
  CanvasDocument,
  CanvasEdge,
  CanvasImageRef,
  CanvasModelOption,
  CanvasNodeOutput,
  CanvasVideoRef,
  CreationTask,
  CreationTaskData,
  ImageVisibility,
  ManagedImageDetail,
  ManagedImageSummary,
  ManagedVideoAssetSummary,
} from "@/lib/api";
import { getManagedImagePathFromUrl, getManagedImagePreviewUrlFromPath, getManagedImageThumbnailUrlFromPath, getManagedImageUrlFromPath } from "@/lib/image-path";
import {
  normalizeImageOutputCompression,
  normalizeImageOutputFormat,
  normalizeImageResolutionPreset,
  normalizePixelIconSizeAlias,
  isPixelIconSize,
} from "@/lib/image-parameters";
import { compactImageModelSettings } from "@/lib/image-model-settings";
import {
  CHAT_MODEL_OPTIONS,
  IMAGE_CREATION_MODEL_OPTIONS,
  MIDJOURNEY_IMAGE_MODEL,
  isChatModel,
  isHiddenImageModelOption,
  isImageCreationModel,
  modelIDLooksImageCapable,
  modelIDLooksTextOnly,
  supportsImageOutputCompression,
} from "@/lib/api";

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
import { cloneSmartCanvasHistorySnapshot } from "./canvas-history";

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

export function normalizeCanvasImageResolution(value?: string) {
  return normalizeImageResolutionPreset(value);
}

export function normalizeCanvasImageOutputFormat(value?: string) {
  return normalizeImageOutputFormat(value);
}

export function normalizeCanvasImageOutputCompression(format: string | undefined, value: unknown) {
  return supportsImageOutputCompression("", format || "") ? normalizeImageOutputCompression(value) : undefined;
}

export function normalizeCanvasImageBackground(value?: string) {
  const normalized = cleanImageText(value).toLowerCase();
  return normalized === "transparent" || normalized === "opaque" ? normalized : "";
}

export function isPixelIconGeneratorNode(item?: SmartCanvasItem | null) {
  return item?.type === "image_generation" && /^(16x16|32x32|64x64|128x128) 像素图标$/.test(item.name || "");
}

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
        if (node.type !== "image" && node.type !== "prompt" && node.type !== "llm" && node.type !== "loop" && node.type !== "group" && node.type !== "image_generation" && node.type !== "video_generation" && node.type !== "result") {
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
    case "group":
      return "组";
    case "image_generation":
      return "图片生成";
    case "video_generation":
      return "视频生成";
    case "result":
      return "结果";
  }
}

export function canConnectSmartCanvasNodes(source: Pick<SmartCanvasItem, "type">, target: Pick<SmartCanvasItem, "type">) {
  if (target.type === "llm") {
    return source.type === "image" || source.type === "prompt" || source.type === "group" || source.type === "result";
  }
  if (target.type === "loop") {
    return source.type === "image" || source.type === "prompt" || source.type === "llm" || source.type === "group" || source.type === "result";
  }
  if (target.type === "image_generation") {
    return source.type === "image" || source.type === "prompt" || source.type === "llm" || source.type === "loop" || source.type === "group" || source.type === "result";
  }
  if (target.type === "video_generation") {
    return source.type === "image" || source.type === "prompt" || source.type === "llm" || source.type === "group" || source.type === "result";
  }
  if (target.type === "result") {
    return source.type === "image_generation" || source.type === "video_generation" || source.type === "llm" || source.type === "loop" || source.type === "image" || source.type === "group" || source.type === "result";
  }
  if (target.type === "image") {
    return source.type === "image" || source.type === "result";
  }
  if (target.type === "group") {
    return source.type === "image" || source.type === "prompt" || source.type === "llm" || source.type === "result";
  }
  return false;
}

export function createImageItem(images: CanvasImageRef[], position: { x: number; y: number }): SmartCanvasItem {
  const refs = dedupeCanvasImageRefs(images);
  return {
    id: createItemId("image"),
    type: "image",
    name: refs.length > 1 ? `${refs.length} 张图片` : "图片",
    position,
    data: {
      images: refs,
      visibility: imageRefsVisibility(),
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

export function createGroupNode(position: { x: number; y: number }, itemIds: string[] = []): SmartCanvasItem {
  return {
    id: createItemId("group"),
    type: "group",
    name: "组",
    position,
    data: {
      group_item_ids: uniqueStringList(itemIds),
      width: 340,
      height: 230,
      created_at: new Date().toISOString(),
    },
  };
}

export function createGeneratorNode(position: { x: number; y: number }): SmartCanvasItem {
  return {
    id: createItemId("image_generation"),
    type: "image_generation",
    name: "图片生成",
    position,
    data: {
      prompt: "",
      model: DEFAULT_COMPOSER.model,
      size: DEFAULT_COMPOSER.size,
      size_user_modified: false,
      image_resolution: "",
      image_resolution_user_modified: false,
      output_format: "png",
      quality: "auto",
      n: DEFAULT_COMPOSER.n,
      visibility: DEFAULT_COMPOSER.visibility,
      input_images: [],
      status: undefined,
      created_at: new Date().toISOString(),
    },
  };
}

export function createVideoGeneratorNode(position: { x: number; y: number }): SmartCanvasItem {
  return {
    id: createItemId("video_generation"),
    type: "video_generation",
    name: "视频生成",
    position,
    data: {
      prompt: "",
      model: "",
      duration: 5,
      aspect_ratio: "16:9",
      resolution: "",
      visibility: DEFAULT_COMPOSER.visibility,
      enhance_prompt: true,
      generate_audio: false,
      input_images: [],
      output: { videos: [] },
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

export function createVideoItem(video: CanvasVideoRef, position: { x: number; y: number }): SmartCanvasItem {
  const videos = dedupeCanvasVideoRefs([video]);
  const now = new Date().toISOString();
  return {
    ...createOutputNode(position),
    name: videos[0]?.name || "视频资源",
    data: {
      output: { videos },
      videos,
      created_at: now,
      updated_at: now,
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
  const normalizedSnapshot = normalizeSmartCanvas(cloneSmartCanvasHistorySnapshot(snapshot)) || createEmptySmartCanvas(snapshot.name || "未命名画布");
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

export function managedImagesToRefs(items: Array<ManagedImageSummary | ManagedImageDetail>): CanvasImageRef[] {
  return dedupeCanvasImageRefs(items.map((item) => ({
    path: item.path,
    name: item.name,
    public_url: item.path ? getManagedImageUrlFromPath(item.path) : item.preview_url || item.thumbnail_url,
    thumbnail_url: item.thumbnail_url,
    preview_url: item.preview_url,
    visibility: item.visibility,
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

export function canvasVideosFromItem(item?: SmartCanvasItem | null): CanvasVideoRef[] {
  if (!item?.data) {
    return [];
  }
  const videos = Array.isArray(item.data.videos) ? item.data.videos : [];
  const outputVideos = item.data.output?.videos || [];
  return dedupeCanvasVideoRefs([...videos, ...outputVideos]);
}

export function canvasPromptFromItem(item?: SmartCanvasItem | null) {
  if (item?.type === "llm") {
    return item.data?.output?.text || item.data?.prompt || item.data?.text || "";
  }
  return item?.data?.prompt || item?.data?.text || "";
}

export function isBlankSmartCanvasItem(item: SmartCanvasItem) {
  const data = item.data || {};
  const outputText = String(data.output?.text || "").trim();
  const outputRaw = data.output?.raw && Object.keys(data.output.raw).length > 0;
  const hasImages = canvasImagesFromItem(item).length > 0;
  const hasVideos = canvasVideosFromItem(item).length > 0;
  const hasText = canvasPromptFromItem(item).trim().length > 0 || outputText.length > 0;
  const hasRunState = Boolean(data.task_id || data.status || data.error || data.started_at || data.stop_requested || data.upload_status);
  const hasGroupMembers = (data.group_item_ids || []).length > 0;
  return !hasImages && !hasVideos && !hasText && !outputRaw && !hasRunState && !hasGroupMembers;
}

export function blankSmartCanvasItemIds(canvas: SmartCanvasDocument | null) {
  if (!canvas) {
    return [];
  }
  const contentNodeIds = new Set(canvas.nodes.filter((item) => !isBlankSmartCanvasItem(item)).map((item) => item.id));
  return canvas.nodes
    .filter((item) => isBlankSmartCanvasItem(item))
    .filter((item) => !canvas.edges.some((edge) => {
      if (edge.source === item.id) {
        return contentNodeIds.has(edge.target);
      }
      if (edge.target === item.id) {
        return contentNodeIds.has(edge.source);
      }
      return false;
    }))
    .map((item) => item.id);
}

export function groupMemberItems(canvas: SmartCanvasDocument | null, group?: SmartCanvasItem | null) {
  if (!canvas || group?.type !== "group") {
    return [];
  }
  const ids = new Set(group.data?.group_item_ids || []);
  return canvas.nodes.filter((item) => ids.has(item.id) && item.id !== group.id);
}

export function expandedCanvasImagesFromItem(canvas: SmartCanvasDocument | null, item?: SmartCanvasItem | null): CanvasImageRef[] {
  if (item?.type !== "group") {
    return canvasImagesFromItem(item);
  }
  return dedupeCanvasImageRefs(groupMemberItems(canvas, item).flatMap((member) => canvasImagesFromItem(member)));
}

export function expandedCanvasPromptFromItem(canvas: SmartCanvasDocument | null, item?: SmartCanvasItem | null) {
  if (item?.type !== "group") {
    return canvasPromptFromItem(item);
  }
  return groupMemberItems(canvas, item)
    .map((member) => canvasPromptFromItem(member))
    .map((value) => value.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function smartCanvasGroupCounts(canvas: SmartCanvasDocument | null, group?: SmartCanvasItem | null) {
  const members = groupMemberItems(canvas, group);
  return {
    total: members.length,
    images: dedupeCanvasImageRefs(members.flatMap((member) => canvasImagesFromItem(member))).length,
    prompts: members.filter((member) => canvasPromptFromItem(member).trim()).length,
  };
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
  return sourcePathFromCachedImageUrl(value, "/image-thumbnails/");
}

function sourcePathFromPreviewUrl(value: string) {
  return sourcePathFromCachedImageUrl(value, "/image-previews/");
}

function sourcePathFromCachedImageUrl(value: string, prefix: string) {
  const text = cleanImageText(value);
  if (!text) {
    return "";
  }
  try {
    const base = typeof window === "undefined" ? "http://localhost" : window.location.href;
    const url = new URL(text, base);
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
    getManagedImagePathFromUrl(cleanImageText(ref.public_url)) ||
    sourcePathFromThumbnailUrl(cleanImageText(ref.thumbnail_url)) ||
    sourcePathFromPreviewUrl(cleanImageText(ref.preview_url)) ||
    cleanImageText(ref.local_url) ||
    cleanImageText(ref.url) ||
    cleanImageText(ref.public_url) ||
    cleanImageText(ref.thumbnail_url) ||
    cleanImageText(ref.preview_url) ||
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
        getManagedImagePathFromUrl(cleanImageText(ref.public_url)) ||
        sourcePathFromThumbnailUrl(cleanImageText(ref.thumbnail_url)) ||
        sourcePathFromPreviewUrl(cleanImageText(ref.preview_url)),
      name: cleanImageText(ref.name),
      public_url: cleanImageText(ref.public_url),
      thumbnail_url: cleanImageText(ref.thumbnail_url),
      preview_url: cleanImageText(ref.preview_url),
      role: ref.role === "mask" ? "mask" : ref.role === "image" ? "image" : undefined,
      visibility: normalizeCanvasImageRefVisibility(ref.visibility),
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
  return cleanImageText(ref.local_url) || cleanImageText(ref.url) || cleanImageText(ref.public_url) || (ref.path ? getManagedImageUrlFromPath(ref.path) : "");
}

export function canvasImagePreviewSource(ref: CanvasImageRef) {
  return cleanImageText(ref.thumbnail_url) || cleanImageText(ref.preview_url) || (ref.path ? getManagedImageThumbnailUrlFromPath(ref.path) : "") || (ref.path ? getManagedImagePreviewUrlFromPath(ref.path) : "") || canvasImageSource(ref);
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

type SmartCanvasRunBucket = {
  nodeType: SmartCanvasItem["type"];
  run: SmartCanvasRunRecord;
};

function runTimeValue(value?: string) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function latestRunTime(current?: string, next?: string) {
  return runTimeValue(next) > runTimeValue(current) ? next || "" : current || next || "";
}

function latestOptionalRunTime(current?: string, next?: string) {
  const value = latestRunTime(current, next);
  return value || undefined;
}

function earliestRunTime(current?: string, next?: string) {
  if (!current) {
    return next || "";
  }
  if (!next) {
    return current || "";
  }
  return runTimeValue(next) < runTimeValue(current) ? next : current;
}

function earliestOptionalRunTime(current?: string, next?: string) {
  const value = earliestRunTime(current, next);
  return value || undefined;
}

function smartCanvasRunFromNode(canvas: SmartCanvasDocument, node: SmartCanvasItem): SmartCanvasRunRecord {
  const incomingImages = incomingItems(canvas, node.id).flatMap((input) => canvasImagesFromItem(input));
  const outputImages = dedupeCanvasImageRefs(node.data?.output?.images || []);
  const outputVideos = dedupeCanvasVideoRefs(node.data?.output?.videos || []);
  const mode: SmartCanvasRunRecord["mode"] = node.type === "video_generation" || outputVideos.length > 0 || node.data?.output?.raw?.mode === "video"
    ? "video"
    : (node.data?.input_images?.length || incomingImages.length || 0) > 0
      ? "edit"
      : "generate";
  const startedAt = node.data?.started_at || (isActiveTask(node.data?.status) ? node.data?.updated_at || node.data?.created_at : undefined);
  return {
    id: node.id,
    prompt: node.data?.prompt || "",
    model: node.data?.model || "auto",
    mode,
    status: node.data?.status || "queued",
    taskId: node.data?.task_id,
    images: outputImages,
    videos: outputVideos,
    error: node.data?.error,
    startedAt,
    createdAt: node.data?.created_at || "",
    updatedAt: node.data?.updated_at,
  };
}

function mergeSmartCanvasRunBucket(current: SmartCanvasRunBucket, next: SmartCanvasRunBucket): SmartCanvasRunBucket {
  const identity = next.nodeType === "result" ? next : current;
  const statusSource = runTimeValue(next.run.updatedAt || next.run.createdAt) >= runTimeValue(current.run.updatedAt || current.run.createdAt)
    ? next.run
    : current.run;
  return {
    nodeType: identity.nodeType,
    run: {
      id: identity.run.id,
      prompt: next.run.prompt || current.run.prompt,
      model: next.run.model || current.run.model || "auto",
      mode: current.run.mode === "video" || next.run.mode === "video" ? "video" : current.run.mode === "edit" || next.run.mode === "edit" ? "edit" : "generate",
      status: statusSource.status,
      taskId: current.run.taskId || next.run.taskId,
      images: dedupeCanvasImageRefs([...current.run.images, ...next.run.images]),
      videos: dedupeCanvasVideoRefs([...current.run.videos, ...next.run.videos]),
      error: statusSource.error || next.run.error || current.run.error,
      startedAt: earliestOptionalRunTime(current.run.startedAt, next.run.startedAt),
      createdAt: latestRunTime(current.run.createdAt, next.run.createdAt),
      updatedAt: latestOptionalRunTime(current.run.updatedAt, next.run.updatedAt),
    },
  };
}

export function imageFilesFromList(files: FileList | File[] | null | undefined) {
  return Array.from(files || []).filter((file) => file.type.startsWith("image/"));
}

export function normalizeModelCatalog(models: CanvasModelOption[]): SmartCanvasModelCatalog {
  const enabledModels = models.filter((model) => model.enabled !== false && !isHiddenImageModelOption(model.id));
  const text = mergeCanvasModelOptions([
    ...enabledModels.filter((model) =>
      canvasModelMatchesGroupMode(model, "chat") ||
      (!canvasModelHasGroupModes(model) &&
      (modelHasCapability(model, "chat") || model.kind === "text" || model.kind === "both") &&
      isChatModel(model.id) &&
      !modelIDLooksImageCapable(model.id))
    ),
    ...CHAT_MODEL_OPTIONS.map((option) => ({
      id: option.value,
      name: option.label,
      kind: "text" as const,
      capabilities: ["chat" as const],
      enabled: true,
    })),
  ]);
  const image = mergeCanvasModelOptions([
    ...enabledModels.filter((model) =>
      (canvasModelMatchesGroupMode(model, "image") && !modelIDLooksTextOnly(model.id)) ||
      (!canvasModelHasGroupModes(model) &&
      (modelHasCapability(model, "image") || model.kind === "image" || model.kind === "both") &&
      isImageCreationModel(model.id) &&
      !modelIDLooksTextOnly(model.id))
    ),
    ...IMAGE_CREATION_MODEL_OPTIONS.map((option) => ({
      id: option.value,
      name: option.label,
      kind: "image" as const,
      capabilities: ["image" as const],
      enabled: true,
    })),
  ]);
  const video = models.filter((model) =>
    model.enabled !== false &&
    (canvasModelMatchesGroupMode(model, "video") || (!canvasModelHasGroupModes(model) && (modelHasCapability(model, "video") || model.kind === "video")))
  );
  const autoImageModel: CanvasModelOption = { id: "auto", name: "auto", kind: "image", capabilities: ["image"], enabled: true };
  const autoTextModel: CanvasModelOption = { id: "auto", name: "auto", kind: "text", capabilities: ["chat"], enabled: true };
  const withAuto = image.some((model) => model.id === "auto")
    ? image
    : [autoImageModel, ...image];
  const textWithAuto = text.some((model) => model.id === "auto")
    ? text
    : [autoTextModel, ...text];
  return { all: models, text: textWithAuto, image: withAuto, video };
}

function mergeCanvasModelOptions(models: CanvasModelOption[]) {
  const seen = new Set<string>();
  const merged: CanvasModelOption[] = [];
  for (const model of models) {
    if (!model.id || seen.has(model.id) || isHiddenImageModelOption(model.id)) {
      continue;
    }
    seen.add(model.id);
    merged.push(model);
  }
  return merged;
}

function modelHasCapability(model: CanvasModelOption, capability: "chat" | "image" | "video") {
  return Array.isArray(model.capabilities) && model.capabilities.includes(capability);
}

function canvasModelHasGroupModes(model: CanvasModelOption) {
  return Array.isArray(model.group_modes) && model.group_modes.length > 0;
}

function canvasModelMatchesGroupMode(model: CanvasModelOption, mode: "chat" | "image" | "video") {
  return Array.isArray(model.group_modes) && model.group_modes.includes(mode);
}

export function smartCanvasRuns(canvas: SmartCanvasDocument | null): SmartCanvasRunRecord[] {
  if (!canvas) {
    return [];
  }
  const runsByTaskId = new Map<string, SmartCanvasRunBucket>();
  canvas.nodes
    .filter((node) => (node.type === "result" || node.type === "image_generation" || node.type === "video_generation") && node.data?.task_id)
    .forEach((node) => {
      const taskId = node.data?.task_id || node.id;
      const bucket = {
        nodeType: node.type,
        run: smartCanvasRunFromNode(canvas, node),
      };
      const existing = runsByTaskId.get(taskId);
      runsByTaskId.set(taskId, existing ? mergeSmartCanvasRunBucket(existing, bucket) : bucket);
    });

  return Array.from(runsByTaskId.values())
    .map((bucket) => bucket.run)
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export function mentionCandidateImages(canvas: SmartCanvasDocument | null, assets: ManagedImageSummary[]) {
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

export function normalizeCanvasImageSize(value?: string) {
  return normalizePixelIconSizeAlias(cleanImageText(value)) || "1024x1024";
}

function isUserModifiedCanvasImageSize(data: SmartCanvasItemData, normalizedSize: string) {
  return data.size_user_modified === true || (cleanImageText(data.size) !== "" && normalizedSize !== DEFAULT_COMPOSER.size);
}

function isUserModifiedCanvasImageResolution(data: SmartCanvasItemData) {
  const resolution = normalizeCanvasImageResolution(data.image_resolution);
  return data.image_resolution_user_modified === true || (resolution !== "" && resolution !== "1080p");
}

function sanitizeSmartItemData(data?: SmartCanvasItemData): SmartCanvasItemData {
  if (!data) {
    return {};
  }
  const size = normalizeCanvasImageSize(data.size);
  const pixelIconSize = isPixelIconSize(size);
  const resolutionUserModified = isUserModifiedCanvasImageResolution(data);
  const source = data as SmartCanvasItemData & { imageModelSettings?: SmartCanvasItemData["image_model_settings"] };
  const model = typeof data.model === "string" && data.model ? data.model : "auto";
  return {
    ...data,
    prompt: typeof data.prompt === "string" ? data.prompt : "",
    model,
    size: data.size_user_modified === true && !cleanImageText(data.size) ? "" : size,
    size_user_modified: isUserModifiedCanvasImageSize(data, size),
    image_resolution: pixelIconSize || !resolutionUserModified ? "" : normalizeCanvasImageResolution(data.image_resolution),
    image_resolution_user_modified: pixelIconSize ? true : resolutionUserModified,
    output_format: data.output_format ? normalizeCanvasImageOutputFormat(data.output_format) : undefined,
    output_compression: normalizeCanvasImageOutputCompression(data.output_format, data.output_compression),
    image_model_settings: compactImageModelSettings(data.image_model_settings || source.imageModelSettings),
    background: normalizeCanvasImageBackground(data.background),
    duration: Number.isFinite(Number(data.duration)) ? Math.max(5, Math.min(15, Number(data.duration))) : undefined,
    aspect_ratio: typeof data.aspect_ratio === "string" && data.aspect_ratio ? data.aspect_ratio : "16:9",
    resolution: typeof data.resolution === "string" ? data.resolution : "",
    enhance_prompt: data.enhance_prompt !== false,
    generate_audio: data.generate_audio === true,
    quality: typeof data.quality === "string" && data.quality ? data.quality : "auto",
    n: model === MIDJOURNEY_IMAGE_MODEL ? 1 : Number.isFinite(Number(data.n)) ? Math.max(1, Math.min(10, Number(data.n))) : 1,
    visibility: "private",
    images: dedupeCanvasImageRefs(Array.isArray(data.images) ? data.images : []),
    videos: dedupeCanvasVideoRefs(Array.isArray(data.videos) ? data.videos : []),
    source_images: dedupeCanvasImageRefs(Array.isArray(data.source_images) ? data.source_images : []),
    input_images: dedupeCanvasImageRefs(Array.isArray(data.input_images) ? data.input_images : []),
    mention_images: dedupeCanvasImageRefs(Array.isArray(data.mention_images) ? data.mention_images : []),
    input_image_mask: cleanImageText(data.input_image_mask),
    group_item_ids: uniqueStringList(Array.isArray(data.group_item_ids) ? data.group_item_ids : []),
    loop_mode: data.loop_mode === "images" ? "images" : "repeat",
    loop_count: Number.isFinite(Number(data.loop_count)) ? Math.max(1, Math.min(10, Number(data.loop_count))) : undefined,
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
    blocked_by: typeof data.blocked_by === "string" ? data.blocked_by : "",
    blocked_by_name: typeof data.blocked_by_name === "string" ? data.blocked_by_name : "",
    last_run_error_detail: typeof data.last_run_error_detail === "string" ? data.last_run_error_detail : "",
    upload_status: data.upload_status === "uploading" || data.upload_status === "error" ? data.upload_status : undefined,
    upload_progress: Number.isFinite(Number(data.upload_progress)) ? Math.max(0, Math.min(100, Number(data.upload_progress))) : undefined,
    task_id: typeof data.task_id === "string" ? data.task_id : "",
    started_at: typeof data.started_at === "string" ? data.started_at : "",
    stop_requested: data.stop_requested === true,
  };
}

function uniqueStringList(values: unknown[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = cleanImageText(value);
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    out.push(text);
  }
  return out;
}

function normalizeCanvasImageRefVisibility(value: unknown): ImageVisibility | undefined {
  return value === "private" ? "private" : undefined;
}

function imageRefsVisibility(): ImageVisibility {
  return "private";
}

function normalizeOutput(output?: CanvasNodeOutput): CanvasNodeOutput | undefined {
  if (!output) {
    return undefined;
  }
  return {
    text: typeof output.text === "string" ? output.text : "",
    task_id: typeof output.task_id === "string" ? output.task_id : "",
    images: dedupeCanvasImageRefs(Array.isArray(output.images) ? output.images : []),
    videos: dedupeCanvasVideoRefs(Array.isArray(output.videos) ? output.videos : []),
    raw: output.raw,
  };
}

export function creationTaskToOutput(task: CreationTask): CanvasNodeOutput {
  return {
    task_id: task.id,
    images: dedupeCanvasImageRefs((task.data || []).flatMap(taskDataToImageRef)),
    videos: dedupeCanvasVideoRefs((task.data || []).flatMap((item) => taskDataToVideoRef(item, task.mode))),
    text: (task.data || []).map((item) => item.text_response || item.revised_prompt || "").filter(Boolean).join("\n"),
    raw: {
      status: task.status,
      error: task.error,
      mode: task.mode,
    },
  };
}

function taskDataToImageRef(item: CreationTaskData): CanvasImageRef[] {
  if (item.video_url) {
    return [];
  }
  if (!item.url && !item.local_url) {
    return [];
  }
  return [{
    url: item.url,
    local_url: item.local_url || item.url,
    public_url: item.url,
  }];
}

export function canvasVideoKey(ref: CanvasVideoRef) {
  return cleanImageText(ref.local_url) || cleanImageText(ref.url) || cleanImageText(ref.name);
}

export function dedupeCanvasVideoRefs(refs: CanvasVideoRef[]) {
  const seen = new Set<string>();
  const out: CanvasVideoRef[] = [];
  for (const ref of refs) {
    const clean: CanvasVideoRef = {
      url: cleanImageText(ref.url),
      local_url: cleanImageText(ref.local_url),
      name: cleanImageText(ref.name),
    };
    const key = canvasVideoKey(clean);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(clean);
  }
  return out;
}

export function canvasVideoSource(ref: CanvasVideoRef) {
  return cleanImageText(ref.local_url) || cleanImageText(ref.url);
}

export function creationTasksToVideoAssets(tasks: CreationTask[]) {
  return tasks
    .filter((task) => task.mode === "video" && task.status === "success")
    .flatMap((task): ManagedVideoAssetSummary[] =>
      (task.data || []).flatMap((item, index) =>
        taskDataToVideoRef(item, task.mode).map((video) => ({
          ...video,
          id: `${task.id}:${canvasVideoKey(video) || index}`,
          task_id: task.id,
          model: task.model,
          created_at: task.created_at,
          updated_at: task.updated_at,
          name: video.name || `视频 ${index + 1}`,
        })),
      ),
    );
}

function taskDataToVideoRef(item: CreationTaskData, mode: CreationTask["mode"]): CanvasVideoRef[] {
  if (mode !== "video" && !item.video_url) {
    return [];
  }
  const url = item.video_url || item.url;
  const localUrl = item.local_url || item.video_url || item.url;
  if (!url && !localUrl) {
    return [];
  }
  return [{
    url,
    local_url: localUrl,
    name: item.revised_prompt,
  }];
}

function cleanImageText(value: unknown) {
  return String(value || "").trim();
}
