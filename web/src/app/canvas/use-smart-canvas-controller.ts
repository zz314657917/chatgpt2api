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
  cancelPromptSplit,
  cancelCreationTask,
  createChatCompletionTask,
  createCanvas,
  createImageEditTask,
  createImageGenerationTask,
  createPromptSplit,
  createVideoGenerationTask,
  deleteCanvas,
  fetchCanvasModels,
  fetchCanvases,
  fetchCreationTasks,
  fetchManagedImageCollections,
  fetchManagedImages,
  fetchPromptSplit,
  fetchTeamWorkspace,
  imageReferenceInputLimit,
  MANAGED_IMAGE_UNCLASSIFIED_COLLECTION_ID,
  MIDJOURNEY_IMAGE_MODEL,
  supportsImageOutputCompression,
  supportsImageOutputControls,
  supportsImageQuality,
  saveCanvas,
  uploadManagedImages,
  type CanvasDocument,
  type CanvasImageRef,
  type CreationTask,
  type ImageModel,
  type ImageVisibility,
  type ManagedImageCollection,
  type ManagedImageSummary,
  type ManagedVideoAssetSummary,
  type PromptSplitBatch,
  type PromptSplitItem,
  type PromptSplitStatus,
  type TeamSummary,
} from "@/lib/api";
import { fetchAuthenticatedImageBlob } from "@/lib/authenticated-image";
import {
  isImageQuality,
  isPixelIconSize,
  normalizeImageOutputCompression,
  normalizeImageOutputFormat,
  type ImageQuality,
} from "@/lib/image-parameters";
import { imageModelSettingsToTaskFields, type ImageModelSettingsState } from "@/lib/image-model-settings";
import { buildImageTaskRequestParameters, imageTaskRequestBodyFields } from "@/lib/image-task-request";
import { getCachedAuthSession } from "@/lib/session";
import { useAuthGuard } from "@/lib/use-auth-guard";

import {
  buildProStudioImagePayload,
  normalizeProStudioState,
  type ProStudioImagePayload,
  type ProStudioState,
} from "@/lib/pro-studio";
import {
  SMART_CANVAS_ONBOARDING_STORAGE_KEY,
  canvasFlowTemplateById,
  type SmartCanvasFlowTemplateId,
  type SmartCanvasHelpTopic,
} from "./canvas-help";
import { consumeCanvasAssetIntent } from "./canvas-asset-intent";
import { hasCanvasImageDragPayload, parseCanvasImageDragPayload } from "./canvas-image-drag";
import { dispatchSmartCanvasQueueChanged } from "./canvas-events";
import { createSmartCanvasFromPreset, type SmartCanvasPresetId } from "./canvas-presets";
import {
  createSmartCanvasFromUserPreset,
  createSmartCanvasUserPreset,
  loadSmartCanvasUserPresets,
  persistSmartCanvasUserPresets,
  SMART_CANVAS_USER_PRESET_LIMIT,
  type SmartCanvasUserPreset,
} from "./canvas-user-presets";
import {
  DEFAULT_SMART_VIEWPORT,
  blankSmartCanvasItemIds,
  canvasImageKey,
  canvasImageSource,
  clampZoom,
  createEmptySmartCanvas,
  createGroupNode,
  createItemId,
  createGeneratorNode,
  createHistoryEntry,
  createImageItem,
  createVideoItem,
  createLlmNode,
  createLoopNode,
  createOutputNode,
  createPromptNode,
  createSmartEdge,
  createVideoGeneratorNode,
  creationTaskToOutput,
  creationTasksToVideoAssets,
  canConnectSmartCanvasNodes,
  dedupeCanvasImageRefs,
  expandedCanvasImagesFromItem,
  expandedCanvasPromptFromItem,
  imageFilesFromList,
  incomingItems,
  isActiveTask,
  managedImagesToRefs,
  mentionCandidateImages,
  normalizeCanvasImageSize,
  normalizeCanvasImageResolution,
  normalizeModelCatalog,
  normalizeSmartCanvas,
  outgoingItems,
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
  type SmartCanvasItemType,
  type SmartCanvasPortMenuRequest,
  type SmartCanvasSaveState,
  type SmartCanvasTool,
  type SmartCanvasViewport,
} from "./types";
import type { ImageEditMode } from "./canvas-image-editor-types";

const MANAGED_IMAGE_DRAG_TYPE = "application/x-chatgpt2api-managed-image";
const CANVAS_ASSET_PAGE_SIZE = 50;
const SMART_CANVAS_PORT_SNAP_RADIUS = 44;
const CROP_NODE_OFFSET = { x: 32, y: 32 };
const PROMPT_SPLIT_POLL_INTERVAL_MS = 2_000;
const PROMPT_SPLIT_SYNC_RETRY_LIMIT = 3;
const DEFAULT_ANGLE_CONTROL_VALUES: SmartCanvasAngleControlValues = { horizontal: 0, vertical: 15, zoom: 5 };
const DETAIL_ENHANCE_PROMPT = "请对这张图片进行细节增强和高清修复，提升清晰度、纹理细节、边缘锐度和整体质感，同时严格保留原始构图、主体、颜色关系和风格，不新增无关元素。";
const AI_BACKGROUND_REMOVAL_PROMPT = "AI 抠图：自动识别图片中的主要主体，移除背景并输出透明背景 PNG。保持主体形状、纹理、颜色和像素细节，避免新增或重绘无关内容。注意：这是 AI 编辑，可能会重绘图片内容。";

type SmartCanvasAssetLibraryScope = "mine" | "team";
type SmartCanvasAssetMediaType = "image" | "video";

type SmartCanvasNodeClipboard = {
  nodes: SmartCanvasItem[];
  edges: SmartCanvasDocument["edges"];
};

type SmartCanvasPortSnapCandidate = {
  id: string;
  distance: number;
};

type SmartCanvasUpdateOptions = {
  history?: "auto" | "skip";
};

type SmartCanvasGenerationNode = SmartCanvasItem & { type: "image_generation" | "video_generation" };
type PendingImageUploadNode = {
  nodeId: string;
};

type PromptSplitFanoutPair = {
  generatorId: string;
  outputId: string;
  taskId: string;
  shouldPoll: boolean;
};

function isMaskImageRef(ref: CanvasImageRef) {
  return ref.role === "mask" || /(?:^|[-_])mask\.(?:png|jpe?g|webp)$/i.test(ref.name || "");
}

function splitMaskImageRefs(refs: CanvasImageRef[]) {
  const masks: CanvasImageRef[] = [];
  const images: CanvasImageRef[] = [];
  for (const ref of refs) {
    if (isMaskImageRef(ref)) {
      masks.push(ref);
    } else {
      images.push(ref);
    }
  }
  return { images: dedupeCanvasImageRefs(images), masks: dedupeCanvasImageRefs(masks) };
}

function publicCanvasImageUrls(refs: CanvasImageRef[]) {
  return Array.from(new Set(refs.map((ref) => (ref.public_url || ref.url || "").trim()).filter(Boolean)));
}

function publicCanvasImageUrl(ref?: CanvasImageRef) {
  return (ref?.public_url || ref?.url || "").trim();
}

function userPresetScope() {
  const session = getCachedAuthSession();
  if (!session) {
    return "anonymous";
  }
  return `${session.provider || "local"}:${session.role}:${session.subjectId || "unknown"}`;
}

function sourceImageVisibility(item?: SmartCanvasItem | null): ImageVisibility {
  return "private";
}

function imageToolLabel(type: SmartCanvasImageToolType) {
  if (type === "detail_enhance") {
    return "细节增强";
  }
  if (type === "angle_control") {
    return "角度控制";
  }
  if (type === "background_removal") {
    return "抠图";
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

function isGroupableItem(item?: SmartCanvasItem | null) {
  return item?.type === "image" || item?.type === "prompt" || item?.type === "llm" || item?.type === "result";
}

function itemOutputImages(canvas: SmartCanvasDocument, item: SmartCanvasItem) {
  return expandedCanvasImagesFromItem(canvas, item);
}

function itemPromptText(canvas: SmartCanvasDocument, item: SmartCanvasItem) {
  return expandedCanvasPromptFromItem(canvas, item);
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
  const horizontal = Math.round(values.horizontal);
  const horizontalDirection = horizontal === 0 ? "保持当前水平角度" : `将相机向${horizontal > 0 ? "右" : "左"}旋转 ${Math.abs(horizontal)} 度`;
  return [
    "请基于输入图片生成同一主体的新视角版本，保持主体身份、材质、服饰、颜色关系和画面风格一致。",
    `${horizontalDirection}。`,
    `目标垂直角为 ${Math.round(values.vertical)} 度。`,
    `镜头缩放强度为 ${Math.round(values.zoom)} / 10。`,
    "只改变观察角度和镜头距离，不要新增无关元素，不要改变主体结构。",
  ].join("\n");
}

function buildAiBackgroundRemovalPrompt(instruction: string) {
  const trimmed = instruction.trim();
  if (!trimmed) {
    return AI_BACKGROUND_REMOVAL_PROMPT;
  }
  return `${AI_BACKGROUND_REMOVAL_PROMPT}\n用户补充要求：${trimmed}`;
}

function canvasRunErrorDetail(status?: CreationTask["status"], error?: string) {
  return status === "error" || status === "cancelled" ? error || "" : "";
}

function taskStateNodeName(status: CreationTask["status"] | undefined, doneName: string, runningName: string, errorName: string, cancelledName: string) {
  if (status === "success") {
    return doneName;
  }
  if (status === "error") {
    return errorName;
  }
  if (status === "cancelled") {
    return cancelledName;
  }
  if (status === "queued" || status === "running") {
    return runningName;
  }
  return doneName;
}

function imageToolResultNodeName(status: CreationTask["status"] | undefined, label: string) {
  return taskStateNodeName(status, label, `${label}中`, `${label}失败`, `${label}已中断`);
}

function generationOutputNodeName(status: CreationTask["status"] | undefined) {
  return taskStateNodeName(status, "Output", "生成中", "生成失败", "已中断");
}

function canvasBlockedData(blockedBy: string, blockedByName: string, message: string) {
  return {
    status: "error" as const,
    error: message,
    blocked_by: blockedBy,
    blocked_by_name: blockedByName,
    last_run_error_detail: message,
    updated_at: new Date().toISOString(),
  };
}

function referenceImageLimitMessage(limit: number) {
  return `当前图片模型最多支持 ${limit} 张参考图`;
}

function generatorInputImages(canvas: SmartCanvasDocument, generator: SmartCanvasItem) {
  const upstream = incomingItems(canvas, generator.id);
  const upstreamImages = upstream.flatMap((item) => itemOutputImages(canvas, item));
  const upstreamKeys = new Set(dedupeCanvasImageRefs(upstreamImages).map(canvasImageKey));
  return dedupeCanvasImageRefs([
    ...(generator.data?.input_images || []).filter((image) => !upstreamKeys.has(canvasImageKey(image))),
    ...upstreamImages,
  ]);
}

function generatorDirectInputImages(canvas: SmartCanvasDocument, generator: SmartCanvasItem) {
  const upstreamImages = incomingItems(canvas, generator.id).flatMap((item) => itemOutputImages(canvas, item));
  const upstreamKeys = new Set(dedupeCanvasImageRefs(upstreamImages).map(canvasImageKey));
  return dedupeCanvasImageRefs((generator.data?.input_images || []).filter((image) => !upstreamKeys.has(canvasImageKey(image))));
}

function nodeInputImagesForCanvas(canvas: SmartCanvasDocument, item: SmartCanvasItem) {
  return itemOutputImages(canvas, item);
}

function llmReferenceImageSourceIdsForTarget(canvas: SmartCanvasDocument, llmNodes: SmartCanvasItem[], targetId: string) {
  const existingImageKeys = new Set(
    dedupeCanvasImageRefs(incomingItems(canvas, targetId).flatMap((item) => nodeInputImagesForCanvas(canvas, item)))
      .map(canvasImageKey)
      .filter(Boolean),
  );
  const sourceIds: string[] = [];
  const sourceImageKeys = new Set<string>();
  for (const llmNode of llmNodes) {
    for (const source of incomingItems(canvas, llmNode.id, ["image", "result"])) {
      const images = dedupeCanvasImageRefs(nodeInputImagesForCanvas(canvas, source))
        .filter((image) => {
          const key = canvasImageKey(image);
          return Boolean(key && !existingImageKeys.has(key) && !sourceImageKeys.has(key));
        });
      if (images.length === 0 || canvas.edges.some((edge) => edge.source === source.id && edge.target === targetId)) {
        continue;
      }
      sourceIds.push(source.id);
      for (const image of images) {
        sourceImageKeys.add(canvasImageKey(image));
      }
    }
  }
  return sourceIds;
}

function generatorPromptText(canvas: SmartCanvasDocument, generator: SmartCanvasItem) {
  const upstream = incomingItems(canvas, generator.id);
  return [
    ...upstream
      .filter((item) => item.type === "prompt" || item.type === "llm" || item.type === "loop" || item.type === "group")
      .map((item) => itemPromptText(canvas, item)),
    generator.data?.prompt || "",
  ].map((value) => value.trim()).filter(Boolean).join("\n\n");
}

function loopInputText(canvas: SmartCanvasDocument, node: SmartCanvasItem) {
  return [
    ...incomingItems(canvas, node.id).map((item) => itemPromptText(canvas, item)),
    node.data?.prompt || "",
  ].map((value) => String(value || "").trim()).filter(Boolean).join("\n\n");
}

function loopInputImages(canvas: SmartCanvasDocument, node: SmartCanvasItem) {
  return dedupeCanvasImageRefs(incomingItems(canvas, node.id).flatMap((item) => nodeInputImagesForCanvas(canvas, item)));
}

function hasLoopOutput(item?: SmartCanvasItem | null) {
  return item?.data?.output?.raw?.mode === "loop";
}

function isGenerationNode(item?: SmartCanvasItem | null): item is SmartCanvasGenerationNode {
  return item?.type === "image_generation" || item?.type === "video_generation";
}

function isLoopDrivenGenerator(canvas: SmartCanvasDocument | null | undefined, generatorId: string) {
  if (!canvas) {
    return false;
  }
  return canvas.edges.some((edge) => edge.target === generatorId && canvas.nodes.some((item) => item.id === edge.source && item.type === "loop"));
}

function nodeStopScope(canvas: SmartCanvasDocument, node: SmartCanvasItem) {
  const ids = new Set<string>([node.id]);
  if (node.type === "loop") {
    canvas.edges
      .filter((edge) => edge.source === node.id)
      .map((edge) => canvas.nodes.find((item) => item.id === edge.target))
      .filter(isGenerationNode)
      .forEach((generator) => {
        ids.add(generator.id);
        canvas.edges
          .filter((edge) => edge.source === generator.id)
          .map((edge) => canvas.nodes.find((item) => item.id === edge.target))
          .filter((item): item is SmartCanvasItem => item?.type === "result")
          .forEach((output) => ids.add(output.id));
      });
  } else if (isGenerationNode(node)) {
    canvas.edges
      .filter((edge) => edge.source === node.id)
      .map((edge) => canvas.nodes.find((item) => item.id === edge.target))
      .filter((item): item is SmartCanvasItem => item?.type === "result" && item.data?.task_id === node.data?.task_id)
      .forEach((output) => ids.add(output.id));
  } else if (node.type === "result" && node.data?.task_id) {
    canvas.edges
      .filter((edge) => edge.target === node.id)
      .map((edge) => canvas.nodes.find((item) => item.id === edge.source))
      .filter((item): item is SmartCanvasItem => Boolean(item && (item.type === "image_generation" || item.type === "video_generation") && item.data?.task_id === node.data?.task_id))
      .forEach((generator) => ids.add(generator.id));
  }
  if (node.data?.task_id) {
    canvas.nodes
      .filter((item) => item.data?.task_id === node.data?.task_id)
      .forEach((item) => ids.add(item.id));
  }
  return ids;
}

function nodeStopLabel(node: SmartCanvasItem) {
  if (node.type === "llm") {
    return "AI 提示词";
  }
  if (node.type === "loop") {
    return "循环";
  }
  if (isGenerationNode(node)) {
    return node.type === "video_generation" ? "视频生成" : "图片生成";
  }
  if (node.type === "result") {
    return node.data?.tool_type ? imageToolLabel(node.data.tool_type) : "输出任务";
  }
  return "节点任务";
}

function mergeLoopSlotStatuses(
  current: CreationTask["output_statuses"],
  startIndex: number,
  count: number,
  statuses: CreationTask["output_statuses"] = [],
  fallback: CreationTask["status"],
  data: CreationTask["data"] = [],
) {
  const next = [...(current || [])];
  const normalizedCount = Math.max(1, count);
  for (let offset = 0; offset < normalizedCount; offset += 1) {
    const index = startIndex + offset;
    if (index >= next.length) {
      break;
    }
    const existing = next[index];
    const status = statuses[offset] || fallback;
    const item = data[offset];
    if (item?.url || item?.local_url || item?.b64_json) {
      next[index] = "success";
    } else if (existing === "success") {
      next[index] = existing;
    } else {
      next[index] = status;
    }
  }
  return next;
}

function generatorImageResolution(generator: SmartCanvasItem, hasInputImages = false) {
  if (generatorProStudioEnabled(generator)) {
    return generatorProStudioState(generator).settings.resolution;
  }
  if (isPixelIconSize(normalizeCanvasImageSize(generator.data?.size))) {
    return undefined;
  }
  if (hasInputImages && generator.data?.image_resolution_user_modified !== true) {
    return undefined;
  }
  return normalizeCanvasImageResolution(generator.data?.image_resolution) || undefined;
}

function generatorImageSize(generator: SmartCanvasItem, hasInputImages = false) {
  if (generatorProStudioEnabled(generator)) {
    return generatorProStudioState(generator).settings.size;
  }
  if (hasInputImages) {
    if (generator.data?.size_user_modified !== true) {
      return undefined;
    }
    if (!String(generator.data?.size || "").trim()) {
      return undefined;
    }
  }
  return normalizeCanvasImageSize(generator.data?.size);
}

function generatorImagePreviewData(generator: SmartCanvasItem, hasInputImages = false) {
  if (generator.type !== "image_generation") {
    return {};
  }
  const size = generatorImageSize(generator, hasInputImages) || "";
  return {
    size,
    size_user_modified: true,
    image_resolution: size && isPixelIconSize(size) ? "" : generatorImageResolution(generator, hasInputImages) || "",
    image_resolution_user_modified: true,
  };
}

function generatorImageModel(generator: SmartCanvasItem): ImageModel {
  if (generatorProStudioEnabled(generator)) {
    return "gpt-image-2-official";
  }
  return generator.data?.model || "auto";
}

function generatorOutputFormat(generator: SmartCanvasItem) {
  if (generatorProStudioEnabled(generator)) {
    return generatorProStudioState(generator).settings.outputFormat;
  }
  if (!supportsImageOutputControls(generatorImageModel(generator))) {
    return undefined;
  }
  return normalizeImageOutputFormat(generator.data?.output_format);
}

function generatorOutputCompression(generator: SmartCanvasItem) {
  if (generatorProStudioEnabled(generator)) {
    return generatorProStudioState(generator).settings.outputCompression;
  }
  const format = generatorOutputFormat(generator);
  return format && supportsImageOutputCompression(generatorImageModel(generator), format) ? normalizeImageOutputCompression(generator.data?.output_compression) : undefined;
}

function generatorImageQuality(generator: SmartCanvasItem): ImageQuality | undefined {
  if (generatorProStudioEnabled(generator)) {
    return generatorProStudioState(generator).settings.quality;
  }
  if (!supportsImageQuality(generatorImageModel(generator))) {
    return undefined;
  }
  return isImageQuality(generator.data?.quality) ? generator.data.quality : "auto";
}

function generatorImageCount(generator: SmartCanvasItem) {
  if (generatorProStudioEnabled(generator)) {
    return generatorProStudioState(generator).settings.n;
  }
  if (generatorImageModel(generator) === MIDJOURNEY_IMAGE_MODEL) {
    return 1;
  }
  return Math.max(1, Math.min(10, Number(generator.data?.n || 1)));
}

function generatorImageVisibility(generator: SmartCanvasItem): ImageVisibility {
  return "private";
}

function generatorProStudioState(generator: SmartCanvasItem): ProStudioState {
  return normalizeProStudioState(generator.data?.pro_studio_state as Partial<ProStudioState> | undefined, "free_canvas");
}

function generatorProStudioEnabled(generator: SmartCanvasItem) {
  return generator.data?.professional_mode === true || Boolean(generatorProStudioState(generator).enabled);
}

function generatorProStudioPayload(generator: SmartCanvasItem, prompt: string, referenceImageUrls?: string[], maskUrl?: string): ProStudioImagePayload | undefined {
  if (!generatorProStudioEnabled(generator)) {
    return undefined;
  }
  return buildProStudioImagePayload({
    prompt,
    state: generatorProStudioState(generator),
    referenceImageUrls,
    maskUrl,
  });
}

function proStudioExtraBody(payload?: ProStudioImagePayload): Record<string, unknown> {
  if (!payload) {
    return {};
  }
  return {
    professional_mode: true,
    pro_studio: payload.pro_studio,
    official_settings: payload.official_settings,
    ...(payload.resolution ? { resolution: payload.resolution } : {}),
    ...(payload.mask_url ? { mask_url: payload.mask_url } : {}),
  };
}

function generatorImageModelTaskFields(generator: SmartCanvasItem, maskUrl?: string) {
  const settings = (generator.data?.image_model_settings || {}) as ImageModelSettingsState;
  const mergedSettings = maskUrl
    ? {
        ...settings,
        officialImage: { ...settings.officialImage, inputImageMask: maskUrl },
        geminiPro: { ...settings.geminiPro, inputImageMask: maskUrl },
      }
    : settings;
  return imageModelSettingsToTaskFields(generatorImageModel(generator), mergedSettings);
}

function llmInputText(canvas: SmartCanvasDocument, node: SmartCanvasItem) {
  const upstream = incomingItems(canvas, node.id);
  return [
    ...upstream.map((item) => itemPromptText(canvas, item)),
    node.data?.prompt || "",
  ].map((value) => String(value || "").trim()).filter(Boolean).join("\n\n");
}

function llmInputImages(canvas: SmartCanvasDocument, node: SmartCanvasItem) {
  return dedupeCanvasImageRefs(incomingItems(canvas, node.id).flatMap((item) => nodeInputImagesForCanvas(canvas, item)));
}

function buildLlmPromptInstruction(inputText: string, imageCount: number) {
  const source = inputText.trim() || (imageCount > 0 ? "请根据输入图片提炼适合图像生成模型使用的提示词。" : "");
  return [
    "你是图像生成工作流里的提示词处理节点。",
    "你的输出会直接传给下游图片生成节点，不是给用户阅读的说明。",
    "只输出最终可用的图像生成 prompt 本体。",
    "不要寒暄，不要解释，不要写 Markdown，不要加标题，不要使用“提示词：”“可以”“下面是”等前缀。",
    "不要输出多个方案，除非输入明确要求多条。",
    "优先保留用户意图、主体、风格、构图、材质、光照、镜头、背景和约束。",
    "如果有参考图，结合参考图提炼主体、风格和视觉细节，但不要描述“图片中/参考图中”这类元信息。",
    "输入：",
    source,
  ].filter(Boolean).join("\n");
}

function cleanLlmPromptOutput(value: string) {
  let text = String(value || "").trim();
  text = text.replace(/^```(?:[\w-]+)?\s*/i, "").replace(/\s*```$/i, "").trim();
  text = text.replace(/^\s*(?:#+\s*)?(?:最终)?(?:图像生成|生图|SDXL|Midjourney|MJ)?\s*提示词\s*[:：-]\s*/i, "").trim();
  text = text.replace(/^\s*(?:可以，?|好的，?|下面是(?:一段|适合)?.*?[:：])\s*/i, "").trim();
  text = text.replace(/^\*\*[^*\n]*(?:提示词|Prompt)[^*\n]*\*\*\s*[:：]?\s*/i, "").trim();
  text = text.replace(/^[-*]\s+/, "").trim();
  return text;
}

function promptSplitCount(node: SmartCanvasItem) {
  return Math.max(1, Math.min(10, Math.round(Number(node.data?.split_count || 1)) || 1));
}

function promptSplitExecutionMode(node: SmartCanvasItem) {
  return node.data?.direct_generate === true ? "direct" as const : "nodes" as const;
}

function promptSplitStatusIsActive(status: PromptSplitStatus | undefined, executionMode: PromptSplitBatch["execution_mode"] | undefined) {
  if (status === "splitting" || status === "submitting" || status === "running") {
    return true;
  }
  return executionMode === "direct" && status === "ready";
}

function promptSplitBatchIsActive(batch: PromptSplitBatch) {
  return promptSplitStatusIsActive(batch.status, batch.execution_mode);
}

function promptSplitNodeTaskStatus(status: PromptSplitStatus, executionMode: PromptSplitBatch["execution_mode"]): CreationTask["status"] {
  if (status === "cancelled") {
    return "cancelled";
  }
  if (status === "error") {
    return "error";
  }
  if (status === "splitting" || status === "submitting" || status === "running" || (status === "ready" && executionMode === "direct")) {
    return "running";
  }
  return "success";
}

function promptSplitItemTaskStatus(item: PromptSplitItem): CreationTask["status"] | undefined {
  if (item.status === "error" || item.status === "cancelled" || item.status === "success" || item.status === "running" || item.status === "queued") {
    return item.status;
  }
  return undefined;
}

function promptSplitItemShouldPoll(item: PromptSplitItem) {
  return item.status === "queued" || item.status === "running" || item.status === "success";
}

function promptSplitTemplateForNode(canvas: SmartCanvasDocument, node: SmartCanvasItem) {
  const storedTemplate = node.data?.prompt_split_template_node_id
    ? canvas.nodes.find((item) => item.id === node.data?.prompt_split_template_node_id && item.type === "image_generation") || null
    : null;
  return outgoingItems(canvas, node.id, ["image_generation"])[0] || storedTemplate;
}

function promptSplitHasMaskSettings(value: unknown, depth = 0): boolean {
  if (!value || depth > 5) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some((item) => promptSplitHasMaskSettings(item, depth + 1));
  }
  if (typeof value !== "object") {
    return false;
  }
  return Object.entries(value as Record<string, unknown>).some(([key, item]) => {
    if (/mask/i.test(key) && Boolean(item)) {
      return true;
    }
    return promptSplitHasMaskSettings(item, depth + 1);
  });
}

function promptSplitTemplateValidation(canvas: SmartCanvasDocument, node: SmartCanvasItem): { template: SmartCanvasItem | null; reason: string } {
  const directImageTemplates = outgoingItems(canvas, node.id, ["image_generation"]);
  const directVideoTemplates = outgoingItems(canvas, node.id, ["video_generation"]);
  if (directImageTemplates.length > 1) {
    return { template: null, reason: "AI 提示词只能保留一个直接下游图片生成节点作为拆分模板" };
  }
  if (directVideoTemplates.length > 0) {
    return { template: null, reason: "提示词拆分只支持文生图模板，不能连接视频生成节点" };
  }
  const template = promptSplitTemplateForNode(canvas, node);
  if (!template) {
    return { template: null, reason: "" };
  }
  const directInputs = generatorDirectInputImages(canvas, template);
  const linkedInputs = incomingItems(canvas, template.id).filter((item) => item.id !== node.id);
  const hasLinkedImageInput = linkedInputs.some((item) => nodeInputImagesForCanvas(canvas, item).length > 0);
  const hasVideoInput = linkedInputs.some((item) => item.type === "video_generation" || (item.data?.videos || item.data?.output?.videos || []).length > 0);
  const hasStoredImageInput = (template.data?.input_images || []).length > 0 || (template.data?.source_images || []).length > 0;
  if (directInputs.length > 0 || hasStoredImageInput || hasLinkedImageInput || hasVideoInput) {
    return { template: null, reason: "提示词拆分只支持纯文生图模板，请移除参考图、图生图或视频输入" };
  }
  if (template.data?.input_image_mask || promptSplitHasMaskSettings(template.data?.image_model_settings)) {
    return { template: null, reason: "提示词拆分不支持蒙版或图片编辑模板" };
  }
  return { template, reason: "" };
}

function promptSplitImageRequest(generator: SmartCanvasItem) {
  const proPayload = generatorProStudioEnabled(generator) ? generatorProStudioPayload(generator, "") : undefined;
  if (proPayload) {
    const {
      prompt: _prompt,
      n: _count,
      image_urls: _imageUrls,
      input_image_mask: _mask,
      mask_url: _maskUrl,
      ...imageRequest
    } = proPayload;
    return {
      ...imageRequest,
      visibility: generatorImageVisibility(generator),
      n: 1,
    };
  }
  const modelFields = generatorImageModelTaskFields(generator);
  return {
    ...imageTaskRequestBodyFields(buildImageTaskRequestParameters({
      model: generatorImageModel(generator),
      size: generatorImageSize(generator),
      imageResolution: generatorImageResolution(generator),
      quality: generatorImageQuality(generator),
      outputFormat: generatorOutputFormat(generator),
      outputCompression: generatorOutputCompression(generator),
      toolOptions: modelFields?.toolOptions,
    })),
    ...modelFields?.extraBody,
    visibility: generatorImageVisibility(generator),
    n: 1,
  };
}

function promptSplitPairPosition(canvas: SmartCanvasDocument, node: SmartCanvasItem, template: SmartCanvasItem | null, index: number) {
  const column = index % 2;
  let row = Math.floor(index / 2);
  const baseX = template
    ? Number(template.position?.x || 0)
    : Number(node.position?.x || 0) + 390;
  const baseY = template
    ? Number(template.position?.y || 0) + 380
    : Number(node.position?.y || 0);
  const occupied = canvas.nodes.map(canvasItemRect);
  while (row < 100) {
    const x = baseX + column * 760;
    const y = baseY + row * 340;
    const generatorRect = { x, y, w: 340, h: 270 };
    const outputRect = { x: x + 380, y: y + 24, w: 320, h: 220 };
    const collides = occupied.some((rect) => rectIntersectionArea(generatorRect, rect) > 0 || rectIntersectionArea(outputRect, rect) > 0);
    if (!collides) {
      return { x, y };
    }
    row += 1;
  }
  return { x: baseX + column * 760, y: baseY + row * 340 };
}

function promptSplitGeneratorData(template: SmartCanvasItem | null, position: { x: number; y: number }) {
  const generator = createGeneratorNode(position);
  const source = template?.type === "image_generation" ? template : generator;
  return {
    ...generator,
    data: {
      ...generator.data,
      model: generatorImageModel(source),
      size: generatorImageSize(source),
      size_user_modified: source.data?.size_user_modified === true,
      image_resolution: generatorImageResolution(source) || "",
      image_resolution_user_modified: source.data?.image_resolution_user_modified === true,
      output_format: generatorOutputFormat(source),
      output_compression: generatorOutputCompression(source),
      image_model_settings: source.data?.image_model_settings,
      professional_mode: source.data?.professional_mode === true,
      pro_studio: source.data?.pro_studio,
      pro_studio_state: source.data?.pro_studio_state,
      official_settings: source.data?.official_settings,
      background: source.data?.background,
      moderation: source.data?.moderation,
      style: source.data?.style,
      partial_images: source.data?.partial_images,
      quality: generatorImageQuality(source) || "auto",
      visibility: generatorImageVisibility(source),
      n: 1,
      input_images: [],
      mention_images: [],
      source_images: [],
      input_image_mask: "",
      width: 340,
      height: 270,
      node_view: "compact" as const,
      node_size_user_modified: false,
    },
  };
}

function syncPromptSplitBatch(canvas: SmartCanvasDocument, nodeId: string, batch: PromptSplitBatch, template: SmartCanvasItem | null): { canvas: SmartCanvasDocument; pairs: PromptSplitFanoutPair[] } {
  const items = [...batch.items].sort((left, right) => left.index - right.index);
  const allPromptsReady = items.length === batch.split_count && items.every((item) => item.prompt.trim());
  const nodeStatus = promptSplitNodeTaskStatus(batch.status, batch.execution_mode);
  let nodes = canvas.nodes.map((item) => item.id === nodeId
    ? {
        ...item,
        data: {
          ...item.data,
          split_count: batch.split_count,
          direct_generate: batch.execution_mode === "direct",
          prompt_split_batch_id: batch.id,
          prompt_split_template_node_id: template?.id || item.data?.prompt_split_template_node_id || "",
          prompt_split_status: batch.status,
          prompt_split_execution_mode: batch.execution_mode,
          prompt_split_items: items,
          output: { text: "", raw: { prompt_split_batch_id: batch.id, prompt_split_status: batch.status } },
          status: nodeStatus,
          task_id: batch.split_task_id || "",
          error: batch.error || "",
          last_run_error_detail: batch.status === "error" || batch.status === "cancelled" ? batch.error || "" : "",
          started_at: item.data?.started_at || batch.created_at,
          updated_at: batch.updated_at,
        },
      }
    : item);
  let edges = canvas.edges;
  const pairs: PromptSplitFanoutPair[] = [];
  if (!allPromptsReady) {
    return { canvas: { ...canvas, nodes, edges }, pairs };
  }
  const sourceNode = nodes.find((item) => item.id === nodeId);
  const replaceBatchId = sourceNode?.data?.prompt_split_replace_batch_id || "";
  if (replaceBatchId && replaceBatchId !== batch.id) {
    const removedIds = new Set(nodes.filter((item) => item.data?.prompt_split_batch_id === replaceBatchId).map((item) => item.id));
    nodes = nodes
      .filter((item) => !removedIds.has(item.id))
      .map((item) => item.id === nodeId ? { ...item, data: { ...item.data, prompt_split_replace_batch_id: "" } } : item);
    edges = edges.filter((edge) => !removedIds.has(edge.source) && !removedIds.has(edge.target));
  }
  for (const [positionIndex, item] of items.entries()) {
    const existingGenerator = nodes.find((node) => node.type === "image_generation" && node.data?.prompt_split_batch_id === batch.id && node.data?.prompt_split_index === item.index);
    const layoutCanvas = { ...canvas, nodes, edges };
    const generatorPosition = promptSplitPairPosition(layoutCanvas, nodes.find((node) => node.id === nodeId) || canvas.nodes.find((node) => node.id === nodeId) || createLlmNode({ x: 0, y: 0 }), template, positionIndex);
    const templateGenerator = promptSplitGeneratorData(template, generatorPosition);
    const taskStatus = batch.execution_mode === "direct" ? promptSplitItemTaskStatus(item) : undefined;
    const taskId = batch.execution_mode === "direct" ? item.task_id || "" : "";
    const createdGenerator = {
      ...templateGenerator,
      data: {
        ...templateGenerator.data,
        prompt: item.prompt,
        status: taskStatus,
        error: item.error || "",
        last_run_error_detail: taskStatus === "error" || taskStatus === "cancelled" ? item.error || "" : "",
        task_id: taskId,
        prompt_split_batch_id: batch.id,
        prompt_split_index: item.index,
        prompt_split_execution_mode: batch.execution_mode,
        prompt_split_source_node_id: nodeId,
        started_at: batch.created_at,
        updated_at: batch.updated_at,
      },
    };
    const generator = existingGenerator
      ? {
          ...existingGenerator,
          data: {
            ...existingGenerator.data,
            prompt: existingGenerator.data?.prompt || item.prompt,
            status: taskStatus,
            error: item.error || "",
            last_run_error_detail: taskStatus === "error" || taskStatus === "cancelled" ? item.error || "" : "",
            task_id: taskId,
            prompt_split_batch_id: batch.id,
            prompt_split_index: item.index,
            prompt_split_execution_mode: batch.execution_mode,
            started_at: existingGenerator.data?.started_at || batch.created_at,
            updated_at: batch.updated_at,
          },
        }
      : createdGenerator;
    if (existingGenerator) {
      nodes = nodes.map((node) => node.id === generator.id ? generator : node);
    } else {
      nodes = [...nodes, generator];
    }
    const existingOutput = edges
      .filter((edge) => edge.source === generator.id)
      .map((edge) => nodes.find((node) => node.id === edge.target))
      .find((node): node is SmartCanvasItem => node?.type === "result" && node.data?.prompt_split_batch_id === batch.id && node.data?.prompt_split_index === item.index);
    const output = existingOutput
      ? {
          ...existingOutput,
          name: taskStatus ? generationOutputNodeName(taskStatus) : existingOutput.name || "Output",
          data: {
            ...existingOutput.data,
            prompt: existingOutput.data?.prompt || item.prompt,
            model: existingOutput.data?.model || generator.data?.model || "auto",
            status: taskStatus,
            error: item.error || "",
            last_run_error_detail: taskStatus === "error" || taskStatus === "cancelled" ? item.error || "" : "",
            task_id: taskId,
            prompt_split_batch_id: batch.id,
            prompt_split_index: item.index,
            prompt_split_execution_mode: batch.execution_mode,
            started_at: existingOutput.data?.started_at || batch.created_at,
            updated_at: batch.updated_at,
          },
        }
      : {
          ...createOutputNode({ x: Number(generator.position?.x || 0) + 380, y: Number(generator.position?.y || 0) + 24 }),
          name: taskStatus ? generationOutputNodeName(taskStatus) : "Output",
          data: {
            output: { images: [] },
            width: 320,
            height: 220,
            node_view: "full" as const,
            node_size_user_modified: false,
            prompt: item.prompt,
            model: generator.data?.model || "auto",
            status: taskStatus,
            error: item.error || "",
            last_run_error_detail: taskStatus === "error" || taskStatus === "cancelled" ? item.error || "" : "",
            task_id: taskId,
            prompt_split_batch_id: batch.id,
            prompt_split_index: item.index,
            prompt_split_execution_mode: batch.execution_mode,
            prompt_split_source_node_id: nodeId,
            started_at: batch.created_at,
            updated_at: batch.updated_at,
          },
        };
    if (existingOutput) {
      nodes = nodes.map((node) => node.id === output.id ? output : node);
    } else {
      nodes = [...nodes, output];
      edges = edges.some((edge) => edge.source === generator.id && edge.target === output.id)
        ? edges
        : [...edges, createSmartEdge(generator.id, output.id)];
    }
    pairs.push({ generatorId: generator.id, outputId: output.id, taskId, shouldPoll: batch.execution_mode === "direct" && promptSplitItemShouldPoll(item) });
  }
  return { canvas: { ...canvas, nodes, edges }, pairs };
}

function createCanvasNode(type: SmartCanvasItem["type"], position: { x: number; y: number }) {
  if (type === "prompt") {
    return createPromptNode(position);
  }
  if (type === "llm") {
    return createLlmNode(position);
  }
  if (type === "loop") {
    return createLoopNode(position);
  }
  if (type === "group") {
    return createGroupNode(position);
  }
  if (type === "image_generation") {
    return createGeneratorNode(position);
  }
  if (type === "video_generation") {
    return createVideoGeneratorNode(position);
  }
  if (type === "result") {
    return createOutputNode(position);
  }
  return createImageItem([], position);
}

function seedTemplateNodeData(item: SmartCanvasItem, templateId: SmartCanvasFlowTemplateId): SmartCanvasItem {
  if (item.type === "prompt") {
    const prompt = templateId === "basic-text"
      ? "生成一张未来感产品海报，干净背景，精致光影，高级商业摄影风格。"
      : templateId === "loop-repeat"
        ? "生成不同颜色方案的产品包装，保持构图一致。"
        : templateId === "loop-images"
          ? "基于每张参考图生成同风格的新版本。"
          : "根据参考图和要求生成高质量图片。";
    return { ...item, data: { ...item.data, prompt } };
  }
  if (item.type === "image_generation" || item.type === "video_generation") {
    return { ...item, data: { ...item.data, prompt: "" } };
  }
  if (item.type === "loop") {
    return {
      ...item,
      data: {
        ...item.data,
        loop_mode: templateId === "loop-images" ? "images" : "repeat",
        loop_count: templateId === "loop-repeat" ? 3 : item.data?.loop_count || 3,
      },
    };
  }
  return item;
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

function uploadProgressPercent(progress: { loaded: number; total?: number; progress?: number }) {
  const ratio = typeof progress.progress === "number"
    ? progress.progress
    : progress.total
      ? progress.loaded / Math.max(1, progress.total)
      : 0;
  return Math.max(1, Math.min(99, Math.round(ratio * 100)));
}

function canvasItemCenterOffset(type: SmartCanvasItem["type"]) {
  if (type === "result") {
    return { x: -220, y: -110 };
  }
  if (type === "image_generation") {
    return { x: -190, y: -150 };
  }
  if (type === "video_generation") {
    return { x: -190, y: -190 };
  }
  if (type === "llm") {
    return { x: -165, y: -130 };
  }
  if (type === "loop") {
    return { x: -170, y: -150 };
  }
  if (type === "group") {
    return { x: -170, y: -120 };
  }
  if (type === "prompt") {
    return { x: -150, y: -100 };
  }
  return { x: -130, y: -120 };
}

function nodeSizeForType(type: SmartCanvasItem["type"]) {
  if (type === "image") {
    return { w: 270, h: 260 };
  }
  if (type === "prompt") {
    return { w: 310, h: 210 };
  }
  if (type === "llm") {
    return { w: 330, h: 260 };
  }
  if (type === "loop") {
    return { w: 340, h: 280 };
  }
  if (type === "group") {
    return { w: 340, h: 230 };
  }
  if (type === "image_generation") {
    return { w: 390, h: 370 };
  }
  if (type === "video_generation") {
    return { w: 390, h: 420 };
  }
  return { w: 320, h: 220 };
}

function nodeResizeBounds(item: SmartCanvasItem) {
  if (item.type === "image_generation") {
    return { minW: 300, minH: 220, maxW: 720, maxH: 720 };
  }
  if (item.type === "result") {
    return { minW: 260, minH: 180, maxW: 720, maxH: 720 };
  }
  return { minW: 180, minH: 180, maxW: 720, maxH: 720 };
}

type CanvasNodeRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

function canvasItemRect(item: SmartCanvasItem): CanvasNodeRect {
  const size = nodeSizeForType(item.type);
  return {
    x: Number(item.position?.x || 0),
    y: Number(item.position?.y || 0),
    w: Number(item.data?.width || size.w),
    h: Number(item.data?.height || size.h),
  };
}

function rectIntersectionArea(a: CanvasNodeRect, b: CanvasNodeRect) {
  const w = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return w * h;
}

function isPromptSplitFanoutNode(item: SmartCanvasItem, batchId?: string) {
  return (item.type === "image_generation" || item.type === "result") &&
    Boolean(item.data?.prompt_split_source_node_id) &&
    Boolean(item.data?.prompt_split_batch_id) &&
    (!batchId || item.data?.prompt_split_batch_id === batchId);
}

function promptSplitBatchIdsForCanvas(canvas: SmartCanvasDocument | null) {
  const batches = new Map<string, string>();
  for (const item of canvas?.nodes || []) {
    if (item.type !== "image_generation" || !isPromptSplitFanoutNode(item)) {
      continue;
    }
    const batchId = item.data?.prompt_split_batch_id || "";
    const updatedAt = item.data?.updated_at || item.data?.created_at || "";
    const current = batches.get(batchId) || "";
    batches.set(batchId, current > updatedAt ? current : updatedAt);
  }
  return Array.from(batches.entries())
    .sort((left, right) => left[1].localeCompare(right[1]) || left[0].localeCompare(right[0]))
    .map(([batchId]) => batchId);
}

function expandedCanvasRect(rect: CanvasNodeRect, gap: number): CanvasNodeRect {
  return {
    x: rect.x - gap,
    y: rect.y - gap,
    w: rect.w + gap * 2,
    h: rect.h + gap * 2,
  };
}

function arrangedPromptSplitBatch(canvas: SmartCanvasDocument, batchId: string) {
  const batchNodes = canvas.nodes.filter((item) => isPromptSplitFanoutNode(item, batchId));
  const generators = batchNodes
    .filter((item) => item.type === "image_generation")
    .sort((left, right) => Number(left.data?.prompt_split_index || 0) - Number(right.data?.prompt_split_index || 0));
  if (generators.length === 0) {
    return { canvas, nodeIds: [] as string[] };
  }

  const outputsByIndex = new Map<number, SmartCanvasItem>();
  for (const output of batchNodes) {
    if (output.type === "result") {
      outputsByIndex.set(Number(output.data?.prompt_split_index || 0), output);
    }
  }
  const pairs = generators.map((generator) => {
    const index = Number(generator.data?.prompt_split_index || 0);
    const output = outputsByIndex.get(index) || null;
    const generatorRect = canvasItemRect(generator);
    const outputRect = output ? canvasItemRect(output) : null;
    return {
      generator,
      output,
      generatorSize: { w: generatorRect.w, h: generatorRect.h },
      outputSize: outputRect ? { w: outputRect.w, h: outputRect.h } : null,
      width: generatorRect.w + (outputRect ? 40 + outputRect.w : 0),
      height: Math.max(generatorRect.h, outputRect ? outputRect.h + 24 : 0),
    };
  });
  const columnWidths = [0, 0];
  const rowHeights: number[] = [];
  pairs.forEach((pair, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    columnWidths[column] = Math.max(columnWidths[column], pair.width);
    rowHeights[row] = Math.max(rowHeights[row] || 0, pair.height);
  });
  const columnX = [0, columnWidths[0] + 80];
  const rowY: number[] = [];
  rowHeights.forEach((height, row) => {
    rowY[row] = row === 0 ? 0 : rowY[row - 1] + rowHeights[row - 1] + 70;
  });

  const currentRects = batchNodes.map(canvasItemRect);
  const initialBaseX = Math.min(...currentRects.map((rect) => rect.x));
  const initialBaseY = Math.min(...currentRects.map((rect) => rect.y));
  const occupied = canvas.nodes
    .filter((item) => !isPromptSplitFanoutNode(item, batchId))
    .map((item) => expandedCanvasRect(canvasItemRect(item), 28));
  const blockHeight = rowY[rowY.length - 1] + rowHeights[rowHeights.length - 1];
  let baseX = initialBaseX;
  let baseY = initialBaseY;
  let placements: Array<{ id: string; x: number; y: number; rect: CanvasNodeRect }> = [];

  for (let attempt = 0; attempt < 80; attempt += 1) {
    placements = pairs.flatMap((pair, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const generatorX = baseX + columnX[column];
      const generatorY = baseY + rowY[row];
      const generatorPlacement = {
        id: pair.generator.id,
        x: generatorX,
        y: generatorY,
        rect: { x: generatorX, y: generatorY, w: pair.generatorSize.w, h: pair.generatorSize.h },
      };
      if (!pair.output || !pair.outputSize) {
        return [generatorPlacement];
      }
      const outputX = generatorX + pair.generatorSize.w + 40;
      const outputY = generatorY + 24;
      return [generatorPlacement, {
        id: pair.output.id,
        x: outputX,
        y: outputY,
        rect: { x: outputX, y: outputY, w: pair.outputSize.w, h: pair.outputSize.h },
      }];
    });
    const collides = placements.some((placement) => occupied.some((rect) => rectIntersectionArea(expandedCanvasRect(placement.rect, 28), rect) > 0));
    if (!collides) {
      break;
    }
    baseY = initialBaseY + (attempt + 1) * (blockHeight + 90);
    if ((attempt + 1) % 8 === 0) {
      baseX += columnWidths[0] + columnWidths[1] + 240;
      baseY = initialBaseY;
    }
  }

  const positions = new Map(placements.map((placement) => [placement.id, { x: placement.x, y: placement.y }]));
  return {
    canvas: {
      ...canvas,
      nodes: canvas.nodes.map((item) => positions.has(item.id) ? { ...item, position: positions.get(item.id) } : item),
    },
    nodeIds: placements.map((placement) => placement.id),
  };
}

function groupPositionForItems(canvas: SmartCanvasDocument, itemIds: string[]) {
  const selected = canvas.nodes.filter((item) => itemIds.includes(item.id));
  if (selected.length === 0) {
    return { x: 240, y: 180 };
  }
  const rects = selected.map(canvasItemRect);
  const minX = Math.min(...rects.map((rect) => rect.x));
  const minY = Math.min(...rects.map((rect) => rect.y));
  return { x: minX - 28, y: minY - 66 };
}

function pruneGroupReferences(item: SmartCanvasItem, removedIds: Set<string>) {
  if (item.type !== "group") {
    return item;
  }
  return {
    ...item,
    data: {
      ...item.data,
      group_item_ids: (item.data?.group_item_ids || []).filter((itemId) => !removedIds.has(itemId)),
    },
  };
}

function handoffMemberEdgesToGroup(canvas: SmartCanvasDocument, group: SmartCanvasItem) {
  if (group.type !== "group") {
    return canvas.edges;
  }
  const memberIds = new Set(group.data?.group_item_ids || []);
  if (memberIds.size === 0) {
    return canvas.edges;
  }
  const targetIds = new Set<string>();
  for (const edge of canvas.edges) {
    if (!memberIds.has(edge.source)) {
      continue;
    }
    const target = canvas.nodes.find((item) => item.id === edge.target);
    if (target && canConnectSmartCanvasNodes(group, target)) {
      targetIds.add(edge.target);
    }
  }
  const nextEdges = canvas.edges.filter((edge) => !(memberIds.has(edge.source) && targetIds.has(edge.target)));
  for (const targetId of targetIds) {
    if (!nextEdges.some((edge) => edge.source === group.id && edge.target === targetId)) {
      nextEdges.push(createSmartEdge(group.id, targetId));
    }
  }
  return nextEdges;
}

function withGroupMember(item: SmartCanvasItem, memberId: string) {
  if (item.type !== "group" || item.id === memberId) {
    return item;
  }
  const ids = item.data?.group_item_ids || [];
  if (ids.includes(memberId)) {
    return item;
  }
  return {
    ...item,
    data: {
      ...item.data,
      group_item_ids: [...ids, memberId],
      updated_at: new Date().toISOString(),
    },
  };
}

function bestContainingGroupForItem(canvas: SmartCanvasDocument, item: SmartCanvasItem) {
  const itemRect = canvasItemRect(item);
  const itemArea = Math.max(1, itemRect.w * itemRect.h);
  let best: { id: string; score: number } | null = null;
  for (const group of canvas.nodes) {
    if (group.type !== "group" || group.id === item.id) {
      continue;
    }
    const area = rectIntersectionArea(itemRect, canvasItemRect(group));
    if (area <= 0) {
      continue;
    }
    const score = area / itemArea;
    if (score >= 0.35 && (!best || score > best.score)) {
      best = { id: group.id, score };
    }
  }
  return best?.id || "";
}

function syncMovedItemsIntoGroups(canvas: SmartCanvasDocument, itemIds: string[]) {
  const candidates = new Set(itemIds);
  if (candidates.size === 0) {
    return canvas;
  }
  const targetGroupByItem = new Map<string, string>();
  for (const item of canvas.nodes) {
    if (!candidates.has(item.id) || !isGroupableItem(item)) {
      continue;
    }
    const groupId = bestContainingGroupForItem(canvas, item);
    if (groupId) {
      targetGroupByItem.set(item.id, groupId);
    }
  }

  let changed = false;
  const nextNodes = canvas.nodes.map((item) => {
    if (item.type !== "group") {
      return item;
    }
    const existing = item.data?.group_item_ids || [];
    const nextIds = existing.filter((memberId) => !candidates.has(memberId));
    for (const [memberId, groupId] of targetGroupByItem) {
      if (groupId === item.id && !nextIds.includes(memberId)) {
        nextIds.push(memberId);
      }
    }
    if (nextIds.length === existing.length && nextIds.every((id, index) => id === existing[index])) {
      return item;
    }
    changed = true;
    return {
      ...item,
      data: {
        ...item.data,
        group_item_ids: nextIds,
        updated_at: new Date().toISOString(),
      },
    };
  });

  return changed ? { ...canvas, nodes: nextNodes } : canvas;
}

function getCanvasNodeIdAtPoint(point: { x: number; y: number }, port?: "in" | "out") {
  const hit = document.elementFromPoint(point.x, point.y);
  const target = port ? hit?.closest(`[data-port='${port}']`) : hit?.closest("[data-canvas-node-id]");
  return target?.closest("[data-canvas-node-id]")?.getAttribute("data-canvas-node-id") || "";
}

function getCanvasNodeIdByPortSnap(
  canvas: SmartCanvasDocument | null,
  sourceId: string,
  point: { x: number; y: number },
  rect: DOMRect | undefined,
  viewport: SmartCanvasViewport,
) {
  const directTargetId = getCanvasNodeIdAtPoint(point, "in");
  if (directTargetId) {
    return directTargetId;
  }
  if (!canvas || !rect || !sourceId) {
    return "";
  }
  const source = canvas.nodes.find((item) => item.id === sourceId);
  if (!source) {
    return "";
  }
  const candidates: SmartCanvasPortSnapCandidate[] = [];
  for (const node of canvas.nodes) {
    if (node.id === sourceId || !canConnectSmartCanvasNodes(source, node)) {
      continue;
    }
    const size = nodeSizeForType(node.type);
    const nodeWidth = Number(node.data?.width || size.w);
    const nodeHeight = Number(node.data?.height || size.h);
    const portWorld = {
      x: Number(node.position?.x || 0),
      y: Number(node.position?.y || 0) + nodeHeight / 2,
    };
    const portScreen = {
      x: rect.left + viewport.x + portWorld.x * viewport.zoom,
      y: rect.top + viewport.y + portWorld.y * viewport.zoom,
    };
    const leftEdgeDistance = point.x - portScreen.x;
    const verticalDistance = Math.abs(point.y - portScreen.y);
    const nearLeftEdge = leftEdgeDistance >= -SMART_CANVAS_PORT_SNAP_RADIUS && leftEdgeDistance <= Math.max(SMART_CANVAS_PORT_SNAP_RADIUS, nodeWidth * viewport.zoom * 0.32);
    if (!nearLeftEdge || verticalDistance > Math.max(SMART_CANVAS_PORT_SNAP_RADIUS, nodeHeight * viewport.zoom * 0.48)) {
      continue;
    }
    candidates.push({
      id: node.id,
      distance: Math.hypot(Math.max(0, Math.abs(leftEdgeDistance) - 10), verticalDistance),
    });
  }
  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0]?.id || "";
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
  const [assets, setAssets] = useState<ManagedImageSummary[]>([]);
  const [assetNextCursor, setAssetNextCursor] = useState("");
  const [hasMoreAssets, setHasMoreAssets] = useState(false);
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [activeTeam, setActiveTeam] = useState<TeamSummary | null>(null);
  const [teamAssets, setTeamAssets] = useState<ManagedImageSummary[]>([]);
  const [teamAssetNextCursor, setTeamAssetNextCursor] = useState("");
  const [hasMoreTeamAssets, setHasMoreTeamAssets] = useState(false);
  const [teamAssetsLoaded, setTeamAssetsLoaded] = useState(false);
  const [assetLibraryScope, setAssetLibraryScope] = useState<SmartCanvasAssetLibraryScope>("mine");
  const [assetLibraryMediaType, setAssetLibraryMediaType] = useState<SmartCanvasAssetMediaType>("image");
  const [videoAssets, setVideoAssets] = useState<ManagedVideoAssetSummary[]>([]);
  const [videoAssetsLoaded, setVideoAssetsLoaded] = useState(false);
  const [loadingVideoAssets, setLoadingVideoAssets] = useState(false);
  const [assetCollections, setAssetCollections] = useState<Record<SmartCanvasAssetLibraryScope, ManagedImageCollection[]>>({
    mine: [],
    team: [],
  });
  const [assetUnclassifiedCounts, setAssetUnclassifiedCounts] = useState<Record<SmartCanvasAssetLibraryScope, number>>({
    mine: 0,
    team: 0,
  });
  const [activeAssetCollectionId, setActiveAssetCollectionId] = useState("");
  const [assetSidebarActivated, setAssetSidebarActivated] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [activePromptSplitBatchId, setActivePromptSplitBatchId] = useState("");
  const [viewport, setViewport] = useState<SmartCanvasViewport>(DEFAULT_SMART_VIEWPORT);
  const [tool, setTool] = useState<SmartCanvasTool>("pan");
  const [dragState, setDragState] = useState<SmartCanvasDragState>({ kind: "none" });
  const [connectState, setConnectState] = useState<SmartCanvasConnectState>({ kind: "none" });
  const [lightweightCanvasMedia, setLightweightCanvasMedia] = useState(false);
  const [saveState, setSaveState] = useState<SmartCanvasSaveState>("saved");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [loadingMoreAssets, setLoadingMoreAssets] = useState(false);
  const [loadingPublicAssets, setLoadingPublicAssets] = useState(false);
  const [loadingMorePublicAssets, setLoadingMorePublicAssets] = useState(false);
  const [draggingImages, setDraggingImages] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [imageEditorImage, setImageEditorImage] = useState<CanvasImageRef | null>(null);
  const [imageEditorSourceItemId, setImageEditorSourceItemId] = useState("");
  const [imageEditorInitialMode, setImageEditorInitialMode] = useState<ImageEditMode>("preview");
  const [angleControlValues, setAngleControlValues] = useState<SmartCanvasAngleControlValues>(DEFAULT_ANGLE_CONTROL_VALUES);
  const [angleControlResultItemId, setAngleControlResultItemId] = useState("");
  const [canvasPickerOpen, setCanvasPickerOpen] = useState(false);
  const [canvasPresetPickerOpen, setCanvasPresetPickerOpen] = useState(false);
  const [userPresets, setUserPresets] = useState<SmartCanvasUserPreset[]>([]);
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
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpTopic, setHelpTopic] = useState<SmartCanvasHelpTopic>({ kind: "flow", id: "basic-text" });
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [portMenuRequest, setPortMenuRequest] = useState<SmartCanvasPortMenuRequest | null>(null);
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
  const promptSplitRecoveryRef = useRef(new Set<string>());
  const loopStopRequestsRef = useRef(new Set<string>());
  const dragStateRef = useRef<SmartCanvasDragState>({ kind: "none" });
  const connectStateRef = useRef<SmartCanvasConnectState>({ kind: "none" });
  const selectedItemIdRef = useRef("");
  const selectedItemIdsRef = useRef<string[]>([]);
  const previousPromptSplitBatchCountRef = useRef(0);
  const previousPromptSplitSelectedItemIdRef = useRef("");
  const lightweightMediaTimerRef = useRef<number | null>(null);
  const applyingHistoryRef = useRef(false);
  const historyCommitBaseRef = useRef<SmartCanvasDocument | null>(null);
  const nodeClipboardRef = useRef<SmartCanvasNodeClipboard | null>(null);
  const nodePasteOffsetRef = useRef(0);
  const assetsLoadingRequestRef = useRef(false);
  const teamAssetsLoadingRequestRef = useRef(false);
  const videoAssetsLoadingRequestRef = useRef(false);

  const selectedItem = useMemo(
    () => canvas?.nodes.find((item) => item.id === selectedItemId) || null,
    [canvas, selectedItemId],
  );
  const promptSplitBatchIds = useMemo(() => promptSplitBatchIdsForCanvas(canvas), [canvas]);
  const blankNodeCount = useMemo(() => blankSmartCanvasItemIds(canvas).length, [canvas]);
  const selectedImageToolDisabledReason = useMemo(() => imageToolUnavailableReason(selectedItem), [selectedItem]);
  const activeAssetCollections = useMemo(() => assetCollections[assetLibraryScope] || [], [assetCollections, assetLibraryScope]);
  const activeAssetUnclassifiedCount = assetUnclassifiedCounts[assetLibraryScope] || 0;
  const mentionItems = useMemo(() => mentionCandidateImages(canvas, [...assets, ...teamAssets]), [assets, canvas, teamAssets]);
  const assetLibraryTabs = useMemo(() => [
    { id: "mine", label: "个人", count: assets.length },
    ...(activeTeam?.id ? [{ id: "team", label: "团队", count: teamAssets.length }] : []),
  ], [activeTeam?.id, assets.length, teamAssets.length]);
  const angleControlPrompt = useMemo(() => buildAngleControlPrompt(angleControlValues), [angleControlValues]);
  const angleControlResultItem = useMemo(() => {
    if (!angleControlResultItemId) {
      return null;
    }
    return canvas?.nodes.find((item) => item.id === angleControlResultItemId) || null;
  }, [angleControlResultItemId, canvas]);

  useEffect(() => {
    canvasRef.current = canvas;
  }, [canvas]);

  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  useEffect(() => {
    selectedItemIdRef.current = selectedItemId;
  }, [selectedItemId]);

  useEffect(() => {
    selectedItemIdsRef.current = selectedItemIds;
  }, [selectedItemIds]);

  useEffect(() => {
    if (promptSplitBatchIds.length > previousPromptSplitBatchCountRef.current) {
      previousPromptSplitBatchCountRef.current = promptSplitBatchIds.length;
      setActivePromptSplitBatchId(promptSplitBatchIds.at(-1) || "");
      return;
    }
    previousPromptSplitBatchCountRef.current = promptSplitBatchIds.length;
    if (promptSplitBatchIds.length === 0) {
      setActivePromptSplitBatchId("");
      return;
    }
    if (!promptSplitBatchIds.includes(activePromptSplitBatchId)) {
      setActivePromptSplitBatchId(promptSplitBatchIds.at(-1) || "");
    }
  }, [activePromptSplitBatchId, promptSplitBatchIds]);

  useEffect(() => {
    if (selectedItemId === previousPromptSplitSelectedItemIdRef.current) {
      return;
    }
    previousPromptSplitSelectedItemIdRef.current = selectedItemId;
    const selected = canvas?.nodes.find((item) => item.id === selectedItemId);
    if (selected?.data?.prompt_split_source_node_id && selected.data?.prompt_split_batch_id) {
      setActivePromptSplitBatchId(selected.data.prompt_split_batch_id);
    }
  }, [canvas, selectedItemId]);

  useEffect(() => {
    if (saveState === "saving" && saveStateRef.current === "dirty") {
      return;
    }
    saveStateRef.current = saveState;
  }, [saveState]);

  useEffect(() => {
    window.localStorage.setItem("smart-canvas-left-rail-collapsed", leftRailCollapsed ? "1" : "0");
  }, [leftRailCollapsed]);

  useEffect(() => {
    setUserPresets(loadSmartCanvasUserPresets(userPresetScope()));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadTeamWorkspace = async () => {
      try {
        const workspace = await fetchTeamWorkspace();
        if (cancelled) {
          return;
        }
        const team = Array.isArray(workspace.teams) ? workspace.teams[0] : undefined;
        setActiveTeam(team || null);
      } catch {
        if (!cancelled) {
          setActiveTeam(null);
        }
      }
    };
    void loadTeamWorkspace();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (assetLibraryScope === "team" && !activeTeam?.id) {
      setAssetLibraryScope("mine");
    }
  }, [activeTeam?.id, assetLibraryScope]);

  useEffect(() => {
    const exists = activeAssetCollectionId === MANAGED_IMAGE_UNCLASSIFIED_COLLECTION_ID || activeAssetCollections.some((collection) => collection.id === activeAssetCollectionId);
    if (activeAssetCollectionId && activeAssetCollections.length > 0 && !exists) {
      setActiveAssetCollectionId("");
    }
  }, [activeAssetCollectionId, activeAssetCollections]);

  useEffect(() => {
    if (typeof window === "undefined" || isCheckingAuth || loading) {
      return;
    }
    if (window.localStorage.getItem(SMART_CANVAS_ONBOARDING_STORAGE_KEY) !== "1") {
      setOnboardingOpen(true);
    }
  }, [isCheckingAuth, loading]);

  const setActiveDragState = useCallback((next: SmartCanvasDragState) => {
    dragStateRef.current = next;
    setDragState(next);
    setLightweightCanvasMedia(next.kind !== "none");
  }, []);

  const setActiveConnectState = useCallback((next: SmartCanvasConnectState) => {
    connectStateRef.current = next;
    setConnectState(next);
    setLightweightCanvasMedia(next.kind !== "none" || dragStateRef.current.kind !== "none");
  }, []);

  const keepCanvasMediaLightweight = useCallback((durationMs = 360) => {
    setLightweightCanvasMedia(true);
    if (lightweightMediaTimerRef.current !== null) {
      window.clearTimeout(lightweightMediaTimerRef.current);
    }
    lightweightMediaTimerRef.current = window.setTimeout(() => {
      lightweightMediaTimerRef.current = null;
      if (dragStateRef.current.kind === "none" && connectStateRef.current.kind === "none") {
        setLightweightCanvasMedia(false);
      }
    }, durationMs);
  }, []);

  const selectSingleItem = useCallback((id: string) => {
    selectedItemIdRef.current = id;
    selectedItemIdsRef.current = id ? [id] : [];
    setSelectedItemId(id);
    setSelectedItemIds(id ? [id] : []);
  }, []);

  const toggleSelectedItem = useCallback((id: string) => {
    if (!id) {
      return;
    }
    const currentSelectedIds = selectedItemIdsRef.current;
    const currentSelectedId = selectedItemIdRef.current;
    const baseSelection = currentSelectedIds.length > 0 ? currentSelectedIds : currentSelectedId ? [currentSelectedId] : [];
    const next = baseSelection.includes(id)
      ? baseSelection.filter((itemId) => itemId !== id)
      : [...baseSelection, id];
    const nextPrimary = next.includes(id) ? id : next[0] || "";
    selectedItemIdRef.current = nextPrimary;
    selectedItemIdsRef.current = next;
    setSelectedItemId(nextPrimary);
    setSelectedItemIds(next);
  }, []);

  const selectItem = useCallback((id: string, multi?: boolean) => {
    if (multi) {
      toggleSelectedItem(id);
      return;
    }
    const currentSelectedIds = selectedItemIdsRef.current;
    if (currentSelectedIds.length > 1 && currentSelectedIds.includes(id)) {
      selectedItemIdRef.current = id;
      setSelectedItemId(id);
      return;
    }
    selectSingleItem(id);
  }, [selectSingleItem, toggleSelectedItem]);

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
    promptSplitRecoveryRef.current.clear();
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
    if (assetsLoadingRequestRef.current) {
      return;
    }
    assetsLoadingRequestRef.current = true;
    setLoadingAssets(true);
    try {
      const result = await fetchManagedImages({ scope: "mine", page_size: CANVAS_ASSET_PAGE_SIZE, collection_id: activeAssetCollectionId });
      setAssets(result.items);
      setAssetNextCursor(result.next_cursor);
      setHasMoreAssets(result.has_more);
      setAssetsLoaded(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载素材库失败");
    } finally {
      assetsLoadingRequestRef.current = false;
      setLoadingAssets(false);
    }
  }, [activeAssetCollectionId]);

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
        collection_id: activeAssetCollectionId,
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
  }, [activeAssetCollectionId, assetNextCursor, hasMoreAssets, loadingAssets, loadingMoreAssets]);

  const loadTeamAssets = useCallback(async () => {
    if (teamAssetsLoadingRequestRef.current) {
      return;
    }
    if (!activeTeam?.id) {
      setTeamAssets([]);
      setTeamAssetNextCursor("");
      setHasMoreTeamAssets(false);
      setTeamAssetsLoaded(true);
      return;
    }
    teamAssetsLoadingRequestRef.current = true;
    setLoadingPublicAssets(true);
    try {
      const result = await fetchManagedImages({ scope: "team", team_id: activeTeam.id, page_size: CANVAS_ASSET_PAGE_SIZE, collection_id: activeAssetCollectionId });
      setTeamAssets(result.items);
      setTeamAssetNextCursor(result.next_cursor);
      setHasMoreTeamAssets(result.has_more);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载团队素材库失败");
    } finally {
      setTeamAssetsLoaded(true);
      teamAssetsLoadingRequestRef.current = false;
      setLoadingPublicAssets(false);
    }
  }, [activeAssetCollectionId, activeTeam?.id]);

  const loadMoreTeamAssets = useCallback(async () => {
    if (!activeTeam?.id || loadingPublicAssets || loadingMorePublicAssets || !hasMoreTeamAssets || !teamAssetNextCursor) {
      return;
    }
    setLoadingMorePublicAssets(true);
    try {
      const result = await fetchManagedImages({
        scope: "team",
        team_id: activeTeam.id,
        page_size: CANVAS_ASSET_PAGE_SIZE,
        cursor: teamAssetNextCursor,
        collection_id: activeAssetCollectionId,
      });
      setTeamAssets((current) => {
        const seen = new Set(current.map((asset) => asset.path));
        return [...current, ...result.items.filter((asset) => !seen.has(asset.path))];
      });
      setTeamAssetNextCursor(result.next_cursor);
      setHasMoreTeamAssets(result.has_more);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载更多团队图片失败");
    } finally {
      setLoadingMorePublicAssets(false);
    }
  }, [activeAssetCollectionId, activeTeam?.id, hasMoreTeamAssets, loadingMorePublicAssets, loadingPublicAssets, teamAssetNextCursor]);

  const loadAssetCollections = useCallback(async (scope: SmartCanvasAssetLibraryScope) => {
    if (scope === "team" && !activeTeam?.id) {
      setAssetCollections((current) => ({ ...current, team: [] }));
      return;
    }
    try {
      const result = await fetchManagedImageCollections({
        scope,
        team_id: scope === "team" ? activeTeam?.id || "" : "",
      });
      setAssetCollections((current) => ({ ...current, [scope]: result.items }));
      setAssetUnclassifiedCounts((current) => ({ ...current, [scope]: result.unclassified_count }));
    } catch {
      setAssetCollections((current) => ({ ...current, [scope]: [] }));
      setAssetUnclassifiedCounts((current) => ({ ...current, [scope]: 0 }));
    }
  }, [activeTeam?.id]);

  const loadVideoAssets = useCallback(async () => {
    if (videoAssetsLoadingRequestRef.current) {
      return;
    }
    videoAssetsLoadingRequestRef.current = true;
    setLoadingVideoAssets(true);
    try {
      const result = await fetchCreationTasks([]);
      setVideoAssets(creationTasksToVideoAssets(result.items || []).slice(0, 80));
      setVideoAssetsLoaded(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载视频资源失败");
    } finally {
      videoAssetsLoadingRequestRef.current = false;
      setLoadingVideoAssets(false);
    }
  }, []);

  useEffect(() => {
    if (assetSidebarActivated && assetLibraryScope === "team" && activeTeam?.id && !teamAssetsLoaded && !loadingPublicAssets) {
      void loadTeamAssets();
    }
  }, [activeTeam?.id, assetLibraryScope, assetSidebarActivated, loadTeamAssets, loadingPublicAssets, teamAssetsLoaded]);

  useEffect(() => {
    if (assetSidebarActivated) {
      void loadAssetCollections(assetLibraryScope);
    }
  }, [assetLibraryScope, assetSidebarActivated, loadAssetCollections]);

  const selectAssetLibraryScope = useCallback((scope: string) => {
    if (scope === "mine" || (scope === "team" && activeTeam?.id)) {
      setAssetLibraryScope(scope);
      setActiveAssetCollectionId("");
    }
  }, [activeTeam?.id]);

  const selectAssetCollection = useCallback((collectionId: string) => {
    setActiveAssetCollectionId(collectionId);
  }, []);

  const refreshAssetLibrary = useCallback(() => {
    if (assetLibraryMediaType === "video") {
      return loadVideoAssets();
    }
    if (assetLibraryScope === "team") {
      return loadTeamAssets();
    }
    return loadAssets();
  }, [assetLibraryMediaType, assetLibraryScope, loadAssets, loadTeamAssets, loadVideoAssets]);

  useEffect(() => {
    if (!assetSidebarActivated) {
      return;
    }
    if (assetLibraryScope === "team") {
      setTeamAssetsLoaded(false);
      setTeamAssets([]);
      setTeamAssetNextCursor("");
      setHasMoreTeamAssets(false);
    } else {
      setAssetsLoaded(false);
      setAssets([]);
      setAssetNextCursor("");
      setHasMoreAssets(false);
    }
    void refreshAssetLibrary();
  }, [activeAssetCollectionId, assetSidebarActivated, assetLibraryScope, refreshAssetLibrary]);

  const ensureAssetLibraryLoaded = useCallback(() => {
    if (assetLibraryMediaType === "video") {
      if (!videoAssetsLoaded && !loadingVideoAssets && !videoAssetsLoadingRequestRef.current) {
        void loadVideoAssets();
      }
      return;
    }
    if (assetLibraryScope === "team") {
      if (!teamAssetsLoaded && !loadingPublicAssets && !teamAssetsLoadingRequestRef.current) {
        void loadTeamAssets();
      }
      return;
    }
    if (!assetsLoaded && !loadingAssets && !assetsLoadingRequestRef.current) {
      void loadAssets();
    }
  }, [assetLibraryMediaType, assetLibraryScope, assetsLoaded, loadAssets, loadTeamAssets, loadVideoAssets, loadingAssets, loadingPublicAssets, loadingVideoAssets, teamAssetsLoaded, videoAssetsLoaded]);

  const setAssetLibraryVideoActive = useCallback((active: boolean) => {
    setAssetLibraryMediaType(active ? "video" : "image");
    if (active && !videoAssetsLoaded && !loadingVideoAssets && !videoAssetsLoadingRequestRef.current) {
      void loadVideoAssets();
    }
  }, [loadVideoAssets, loadingVideoAssets, videoAssetsLoaded]);

  const activateAssetSidebar = useCallback(() => {
    setAssetSidebarActivated(true);
    ensureAssetLibraryLoaded();
  }, [ensureAssetLibraryLoaded]);

  const handleAssetSidebarExpandedChange = useCallback((expanded: boolean) => {
    if (expanded) {
      setAssetSidebarActivated(true);
      ensureAssetLibraryLoaded();
    }
  }, [ensureAssetLibraryLoaded]);

  const loadMoreAssetLibrary = useCallback(() => {
    if (assetLibraryMediaType === "video") {
      return undefined;
    }
    if (assetLibraryScope === "team") {
      return loadMoreTeamAssets();
    }
    return loadMoreAssets();
  }, [assetLibraryMediaType, assetLibraryScope, loadMoreAssets, loadMoreTeamAssets]);

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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载画布失败");
      applyCanvas(createEmptySmartCanvas());
    } finally {
      setLoading(false);
    }
  }, [applyCanvas]);

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
    if (lightweightMediaTimerRef.current !== null) {
      window.clearTimeout(lightweightMediaTimerRef.current);
      lightweightMediaTimerRef.current = null;
    }
    if (saveStateRef.current === "dirty" || saveStateRef.current === "error") {
      void saveNow(canvasRef.current);
    }
  }, [saveNow]);

  const updateCanvas = useCallback((updater: (current: SmartCanvasDocument) => SmartCanvasDocument, dirty = true, historyLabel?: string, options: SmartCanvasUpdateOptions = {}) => {
    const previous = canvasRef.current || createEmptySmartCanvas();
    const nextCanvas = updater(previous);
    canvasRef.current = nextCanvas;
    setCanvas(nextCanvas);
    dispatchSmartCanvasQueueChanged(nextCanvas);
    const shouldUpdateHistory = options.history !== "skip" && !applyingHistoryRef.current;
    if (!historyLabel && shouldUpdateHistory) {
      setHistory((current) => replaceSmartCanvasHistoryPresent(current, nextCanvas));
    }
    if (historyLabel && shouldUpdateHistory) {
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

  const commitViewport = useCallback((next: SmartCanvasViewport, dirty = true) => {
    const current = canvasRef.current || createEmptySmartCanvas();
    const nextCanvas = { ...current, viewport: next };
    canvasRef.current = nextCanvas;
    if (dirty) {
      markDirty();
    }
  }, [markDirty]);

  const addNodeAt = useCallback((type: SmartCanvasItem["type"], point?: { x: number; y: number }) => {
    const rect = boardRef.current?.getBoundingClientRect();
    const world = rect
      ? screenToWorld(point || { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, rect, viewportRef.current)
      : { x: 240, y: 180 };
    const current = canvasRef.current;
    const selectedIds = selectedItemIds.length > 1
      ? selectedItemIds.filter((id) => current?.nodes.some((node) => node.id === id && isGroupableItem(node)))
      : [];
    const offset = canvasItemCenterOffset(type);
    const existingCount = canvasRef.current?.nodes.length || 0;
    const stagger = (existingCount % 8) * 28;
    const fallbackPosition = { x: world.x + offset.x + stagger, y: world.y + offset.y + stagger };
    const position = type === "group" && selectedIds.length > 0 && current
      ? groupPositionForItems(current, selectedIds)
      : fallbackPosition;
    const item = type === "group"
      ? createGroupNode(position, selectedIds)
      : createCanvasNode(type, position);
    updateCanvas((current) => {
      const next = { ...current, nodes: [...current.nodes, item] };
      return item.type === "group" ? { ...next, edges: handoffMemberEdgesToGroup(next, item) } : next;
    }, true, type === "group" && selectedIds.length > 0 ? "创建组" : `新增 ${type === "llm" ? "AI 提示词" : item.name || "节点"}`);
    selectSingleItem(item.id);
    return item;
  }, [selectSingleItem, selectedItemIds, updateCanvas]);

  const openCanvasHelp = useCallback((topic?: SmartCanvasHelpTopic) => {
    if (topic) {
      setHelpTopic(topic);
    }
    setHelpOpen(true);
  }, []);

  const openNodeHelp = useCallback((nodeType: SmartCanvasItemType) => {
    openCanvasHelp({ kind: "node", id: nodeType });
  }, [openCanvasHelp]);

  const dismissOnboarding = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SMART_CANVAS_ONBOARDING_STORAGE_KEY, "1");
    }
    setOnboardingOpen(false);
  }, []);

  const insertFlowTemplate = useCallback((templateId: SmartCanvasFlowTemplateId) => {
    const template = canvasFlowTemplateById(templateId);
    const rect = boardRef.current?.getBoundingClientRect();
    const world = rect
      ? screenToWorld({ x: rect.left + Math.min(360, rect.width * 0.34), y: rect.top + Math.min(300, rect.height * 0.42) }, rect, viewportRef.current)
      : { x: 220, y: 180 };
    const existingCount = canvasRef.current?.nodes.length || 0;
    const stagger = (existingCount % 6) * 36;
    const base = { x: world.x + stagger, y: world.y + stagger };
    const columnGap = 430;
    const rowGap = 250;
    const rowCounts = new Map<number, number>();
    const nodes = template.nodes.map((type, index) => {
      const edgeTargets = new Set(template.edges.map((edge) => edge[1]));
      const column = edgeTargets.has(index) ? Math.max(1, Math.min(3, template.edges.find((edge) => edge[1] === index)?.[1] || index)) : 0;
      const normalizedColumn = type === "image_generation" || type === "video_generation" ? 2 : type === "result" ? 3 : type === "loop" || type === "llm" || type === "group" ? 1 : 0;
      const row = rowCounts.get(normalizedColumn) || 0;
      rowCounts.set(normalizedColumn, row + 1);
      const position = {
        x: base.x + normalizedColumn * columnGap,
        y: base.y + row * rowGap,
      };
      void column;
      return seedTemplateNodeData(createCanvasNode(type, position), templateId);
    });
    const edges = template.edges.map(([sourceIndex, targetIndex]) => createSmartEdge(nodes[sourceIndex].id, nodes[targetIndex].id));
    updateCanvas((current) => ({
      ...current,
      nodes: [...current.nodes, ...nodes],
      edges: [...current.edges, ...edges],
    }), true, `插入${template.title}`);
    selectSingleItem(nodes[0]?.id || "");
    toast.success(`已插入${template.title}`);
    return nodes;
  }, [selectSingleItem, updateCanvas]);

  const addNodeFromPort = useCallback((nodeId: string, type: SmartCanvasItem["type"], point?: { x: number; y: number }, direction: "upstream" | "downstream" = "downstream") => {
    const rect = boardRef.current?.getBoundingClientRect();
    const current = canvasRef.current;
    const anchor = current?.nodes.find((node) => node.id === nodeId);
    if (!anchor) {
      return null;
    }
    const anchorSize = nodeSizeForType(anchor.type);
    const nextSize = nodeSizeForType(type);
    const anchorWorld = rect && point
      ? screenToWorld(point, rect, viewportRef.current)
      : {
          x: Number(anchor.position?.x || 0) + (direction === "upstream" ? -170 : anchorSize.w + 170),
          y: Number(anchor.position?.y || 0) + anchorSize.h / 2,
        };
    const position = {
      x: direction === "upstream" ? anchorWorld.x - nextSize.w - 150 : anchorWorld.x + 150,
      y: anchorWorld.y - nextSize.h / 2,
    };
    const item = type === "group" && direction === "downstream" && isGroupableItem(anchor)
      ? createGroupNode(position, [anchor.id])
      : createCanvasNode(type, position);
    const source = direction === "upstream" ? item : anchor;
    const target = direction === "upstream" ? anchor : item;
    if (!canConnectSmartCanvasNodes(source, target)) {
      toast.error("这两个节点不能直接连接");
      return null;
    }
    updateCanvas((doc) => ({
      ...doc,
      nodes: doc.nodes.map((node) => direction === "upstream" && node.id === target.id ? withGroupMember(node, source.id) : node).concat(item),
      edges: doc.edges.some((edge) => edge.source === source.id && edge.target === target.id)
        ? doc.edges
        : [...doc.edges, createSmartEdge(source.id, target.id)],
    }), true, `新增并连接 ${type === "llm" ? "AI 提示词" : item.name || "节点"}`);
    selectSingleItem(item.id);
    return item;
  }, [selectSingleItem, updateCanvas]);

  const createNodeHelpTemplate = useCallback((nodeId: string) => {
    const current = canvasRef.current;
    const node = current?.nodes.find((item) => item.id === nodeId);
    if (!node) {
      return;
    }
    if (node.type !== "llm") {
      addNodeFromPort(node.id, isGenerationNode(node) ? "result" : "image_generation");
      return;
    }
    const baseX = Number(node.position?.x || 0);
    const baseY = Number(node.position?.y || 0);
    const prompt = createPromptNode({
      x: baseX - 360,
      y: baseY - 32,
    });
    const image = createImageItem([], {
      x: baseX - 330,
      y: baseY + 210,
    });
    const generator = createGeneratorNode({
      x: baseX + 430,
      y: baseY,
    });
    updateCanvas((doc) => ({
      ...doc,
      nodes: [...doc.nodes, prompt, image, generator],
      edges: [
        ...doc.edges,
        createSmartEdge(prompt.id, node.id),
        createSmartEdge(image.id, node.id),
        createSmartEdge(node.id, generator.id),
      ],
    }), true, "创建 AI 提示词模板链路");
    setSelectedItemIds([prompt.id, image.id, generator.id]);
    setSelectedItemId(generator.id);
  }, [addNodeFromPort, updateCanvas]);

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
      if (!canConnectSmartCanvasNodes(sourceNode, targetNode)) {
        toast.error("这两个节点不能直接连接");
        return current;
      }
      if (current.edges.some((edge) => edge.source === source && edge.target === target)) {
        return current;
      }
      changed = true;
      return {
        ...current,
        nodes: current.nodes.map((item) => item.id === target ? withGroupMember(item, source) : item),
        edges: [...current.edges, createSmartEdge(source, target)],
      };
    }, true, "新增连线");
    return changed;
  }, [updateCanvas]);

  const connectLlmImagesToGenerator = useCallback((generatorId: string) => {
    const current = canvasRef.current;
    const generator = current?.nodes.find((item) => item.id === generatorId);
    if (!current || !generator || !isGenerationNode(generator)) {
      return;
    }
    const llmNodes = incomingItems(current, generator.id, ["llm"]);
    const missingIds = llmReferenceImageSourceIdsForTarget(current, llmNodes, generator.id);
    if (missingIds.length === 0) {
      toast.info("没有需要补充连接的图片来源");
      return;
    }
    updateCanvas((doc) => ({
      ...doc,
      edges: [
        ...doc.edges,
        ...missingIds.map((sourceId) => createSmartEdge(sourceId, generator.id)),
      ],
    }), true, "连接 AI 提示词参考图");
    toast.success(`已连接 ${missingIds.length} 个图片来源到${generator.type === "video_generation" ? "视频生成" : "图片生成"}`);
  }, [updateCanvas]);

  const connectLlmImagesToLoop = useCallback((loopId: string) => {
    const current = canvasRef.current;
    const loop = current?.nodes.find((item) => item.id === loopId);
    if (!current || !loop || loop.type !== "loop") {
      return;
    }
    const llmNodes = incomingItems(current, loop.id, ["llm"]);
    const missingIds = llmReferenceImageSourceIdsForTarget(current, llmNodes, loop.id);
    if (missingIds.length === 0) {
      toast.info("没有需要补充连接的图片来源");
      return;
    }
    updateCanvas((doc) => ({
      ...doc,
      edges: [
        ...doc.edges,
        ...missingIds.map((sourceId) => createSmartEdge(sourceId, loop.id)),
      ],
    }), true, "连接 AI 提示词参考图");
    toast.success(`已连接 ${missingIds.length} 个图片来源到循环`);
  }, [updateCanvas]);

  const deleteEdge = useCallback((edgeId: string) => {
    updateCanvas((current) => {
      const edge = current.edges.find((item) => item.id === edgeId);
      const removed = edge ? new Set([edge.source]) : new Set<string>();
      return {
        ...current,
        nodes: edge ? current.nodes.map((item) => item.id === edge.target ? pruneGroupReferences(item, removed) : item) : current.nodes,
        edges: current.edges.filter((item) => item.id !== edgeId),
      };
    }, true, "删除连线");
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
        }), false, undefined, { history: "skip" });
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
                  width: Math.max(nodeResizeBounds(item).minW, Math.min(nodeResizeBounds(item).maxW, activeDrag.startSize.w + dx)),
                  height: Math.max(nodeResizeBounds(item).minH, Math.min(nodeResizeBounds(item).maxH, activeDrag.startSize.h + dy)),
                  node_size_user_modified: true,
                },
              }
            : item),
        }), false, undefined, { history: "skip" });
      }
    };

    const handleWindowPointerUp = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) {
        return;
      }
      const activeDrag = dragStateRef.current;
      const activeConnect = connectStateRef.current;
      const commitMovedItem = (drag: Extract<SmartCanvasDragState, { kind: "item" }>) => {
        updateCanvas(
          (current) => syncMovedItemsIntoGroups(current, drag.groupCandidateIds),
          true,
          "移动节点",
        );
      };
      if (activeDrag.kind === "item" || activeDrag.kind === "resize") {
        if (activeDrag.kind === "item") {
          commitMovedItem(activeDrag);
        } else {
          updateCanvas((current) => current, true, "缩放节点");
        }
      }
      if (activeDrag.kind === "pan") {
        commitViewport(viewportRef.current, true);
      }
      if (activeConnect.kind === "link") {
        const targetId = getCanvasNodeIdByPortSnap(
          canvasRef.current,
          activeConnect.sourceId,
          { x: event.clientX, y: event.clientY },
          boardRef.current?.getBoundingClientRect(),
          viewportRef.current,
        );
        if (targetId && appendEdge(activeConnect.sourceId, targetId)) {
          event.preventDefault();
        }
        if (!targetId) {
          setPortMenuRequest({
            id: Date.now(),
            nodeId: activeConnect.sourceId,
            direction: "downstream",
            screen: { x: event.clientX, y: event.clientY },
          });
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
  }, [appendEdge, commitViewport, setActiveConnectState, setActiveDragState, updateCanvas]);

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
      if (isGenerationNode(selected)) {
        edges.push(createSmartEdge(item.id, selected.id));
      }
      return { ...current, nodes: [...current.nodes, item], edges };
    }, true, "添加图片");
    selectSingleItem(item.id);
  }, [selectSingleItem, selectedItemId, updateCanvas]);

  useEffect(() => {
    if (loading || !canvas) {
      return;
    }
    const intent = consumeCanvasAssetIntent();
    if (!intent) {
      return;
    }
    addImagesToCanvas(managedImagesToRefs(intent.assets));
    setAssetSidebarActivated(true);
  }, [addImagesToCanvas, canvas, loading]);

  const createImageNodeLinkedToGenerator = useCallback((
    refs: CanvasImageRef[],
    generator: SmartCanvasItem,
    position?: { x: number; y: number },
  ) => {
    const normalizedRefs = dedupeCanvasImageRefs(refs);
    if (normalizedRefs.length === 0 || !isGenerationNode(generator)) {
      return false;
    }
    const current = canvasRef.current;
    if (current && generator.type === "image_generation") {
      const existingRefs = generatorInputImages(current, generator);
      const nextRefs = dedupeCanvasImageRefs([...existingRefs, ...normalizedRefs]);
      const { images } = splitMaskImageRefs(nextRefs);
      const referenceLimit = imageReferenceInputLimit(generatorImageModel(generator));
      if (images.length > referenceLimit) {
        toast.error(referenceImageLimitMessage(referenceLimit));
        return false;
      }
    }
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

  const addCroppedImageToCanvas = useCallback((original: CanvasImageRef, images: CanvasImageRef[], mode: ImageEditMode = "crop") => {
    const refs = dedupeCanvasImageRefs(mode === "mask"
      ? images.map((image) => ({ ...image, role: "mask" as const }))
      : images);
    if (refs.length === 0) {
      return;
    }
    const isMask = mode === "mask";
    let position = { x: 160, y: 160 };
    const sourceItem = findItemContainingImage(original);
    if (sourceItem) {
      position = {
        x: Number(sourceItem.position?.x || 0) + CROP_NODE_OFFSET.x,
        y: Number(sourceItem.position?.y || 0) + CROP_NODE_OFFSET.y,
      };
    }
    const item = createImageItem(refs, position);
    item.name = isMask ? "蒙版" : refs.length > 1 ? "切分图片" : "裁剪图片";
    item.data = {
      ...item.data,
      visibility: sourceImageVisibility(sourceItem),
      source_images: [original],
      tool_type: "image_edit",
      tool_parameters: {
        mode: isMask ? "mask" : refs.length > 1 ? "grid_split" : "manual_edit",
        count: refs.length,
      },
    };
    updateCanvas((doc) => ({
      ...doc,
      nodes: [...doc.nodes, item],
      edges: sourceItem ? [...doc.edges, createSmartEdge(sourceItem.id, item.id)] : doc.edges,
    }), true, isMask ? "添加蒙版节点" : refs.length > 1 ? "添加切分图片" : "添加编辑图片");
    selectSingleItem(item.id);
  }, [findItemContainingImage, selectSingleItem, updateCanvas]);

  const applyEditedImageFiles = useCallback(async (original: CanvasImageRef, files: File[], mode: ImageEditMode = "crop") => {
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
      addCroppedImageToCanvas(original, refs, mode);
      await loadAssets();
      toast.success(mode === "mask" ? "已生成蒙版节点" : refs.length > 1 ? `已生成 ${refs.length} 张图片` : "已生成编辑图片");
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
    const target = isGenerationNode(selected)
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

  const uploadFilesToRefs = useCallback(async (
    files: File[],
    options: { onProgress?: (progress: number) => void } = {},
  ) => {
    const imageFiles = imageFilesFromList(files);
    if (imageFiles.length === 0) {
      toast.error("仅支持图片文件");
      return [];
    }
    setUploading(true);
    try {
      const items = await uploadManagedImages(imageFiles, "private", {
        onUploadProgress: (progress) => {
          options.onProgress?.(uploadProgressPercent(progress));
        },
      });
      await loadAssets();
      return managedImagesToRefs(items);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "上传图片失败");
      return [];
    } finally {
      setUploading(false);
    }
  }, [loadAssets]);

  const updatePendingImageUploadNode = useCallback((nodeId: string, patch: Partial<SmartCanvasItem["data"]>, dirty = false, historyLabel?: string, name?: string) => {
    updateCanvas((current) => ({
      ...current,
      nodes: current.nodes.map((item) => item.id === nodeId
        ? {
            ...item,
            ...(name ? { name } : {}),
            data: {
              ...item.data,
              ...patch,
              updated_at: new Date().toISOString(),
            },
          }
        : item),
    }), dirty, historyLabel);
  }, [updateCanvas]);

  const createPendingImageUploadNode = useCallback((files: File[], point: { x: number; y: number }, targetNodeId?: string): PendingImageUploadNode => {
    const rect = boardRef.current?.getBoundingClientRect();
    const world = rect
      ? screenToWorld(point, rect, viewportRef.current)
      : { x: 120, y: 120 };
    const current = canvasRef.current;
    const targetNode = targetNodeId ? current?.nodes.find((node) => node.id === targetNodeId) : null;
    const selectedNode = selectedItemId ? current?.nodes.find((node) => node.id === selectedItemId) : null;
    const targetGenerator = isGenerationNode(targetNode)
      ? targetNode
      : isGenerationNode(selectedNode)
        ? selectedNode
        : null;
    const offset = canvasItemCenterOffset("image");
    const item = createImageItem([], targetGenerator
      ? {
          x: Number(targetGenerator.position?.x || world.x) - 330,
          y: world.y - 120,
        }
      : {
          x: world.x + offset.x,
          y: world.y + offset.y,
        });
    const now = new Date().toISOString();
    item.name = files.length > 1 ? `${files.length} 张图片上传中` : "图片上传中";
    item.data = {
      ...item.data,
      upload_status: "uploading",
      upload_progress: 1,
      created_at: now,
      updated_at: now,
    };
    updateCanvas((current) => ({
      ...current,
      nodes: [...current.nodes, item],
      edges: targetGenerator
        ? [...current.edges, createSmartEdge(item.id, targetGenerator.id)]
        : current.edges,
    }), true, files.length > 1 ? `上传 ${files.length} 张图片` : "上传图片");
    selectSingleItem(item.id);
    return { nodeId: item.id };
  }, [selectSingleItem, selectedItemId, updateCanvas]);

  const uploadedImageNodeName = useCallback((refs: CanvasImageRef[]) => {
    return refs.length > 1 ? `${refs.length} 张图片` : refs[0]?.name || "图片";
  }, []);

  const addImagesNearGenerator = useCallback((refs: CanvasImageRef[], target: SmartCanvasItem, point?: { x: number; y: number }) => {
    const normalizedRefs = dedupeCanvasImageRefs(refs);
    if (normalizedRefs.length === 0 || !isGenerationNode(target)) {
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
      const item = JSON.parse(payload) as ManagedImageSummary;
      const refs = managedImagesToRefs([item]);
      const target = targetNodeId ? canvasRef.current?.nodes.find((node) => node.id === targetNodeId) : null;
      if (isGenerationNode(target) && addImagesNearGenerator(refs, target, point)) {
        return;
      }
      addImagesToCanvas(refs, point);
    } catch {
      toast.error("读取素材库素材失败");
    }
  }, [addImagesNearGenerator, addImagesToCanvas]);

  const handleBoardDrop = useCallback(async (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDraggingImages(false);
    const targetGeneratorId = getCanvasNodeIdAtPoint({ x: event.clientX, y: event.clientY });
    const canvasImagePayload = parseCanvasImageDragPayload(event.dataTransfer);
    if (canvasImagePayload) {
      const target = targetGeneratorId ? canvasRef.current?.nodes.find((node) => node.id === targetGeneratorId) : null;
      if (isGenerationNode(target) && addImagesNearGenerator(canvasImagePayload.images, target, { x: event.clientX, y: event.clientY })) {
        return;
      }
      addImagesToCanvas(canvasImagePayload.images, { x: event.clientX, y: event.clientY });
      return;
    }
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
    const pending = createPendingImageUploadNode(files, { x: event.clientX, y: event.clientY }, targetGeneratorId);
    const refs = await uploadFilesToRefs(files, {
      onProgress: (progress) => updatePendingImageUploadNode(pending.nodeId, {
        upload_progress: progress,
        upload_status: "uploading",
      }),
    });
    if (refs.length === 0) {
      updatePendingImageUploadNode(pending.nodeId, {
        upload_progress: 0,
        upload_status: "error",
        status: "error",
        error: "上传图片失败",
      }, true);
      return;
    }
    updatePendingImageUploadNode(pending.nodeId, {
      images: refs,
      visibility: "private",
      upload_progress: 100,
      upload_status: undefined,
      status: undefined,
      error: "",
    }, true, undefined, uploadedImageNodeName(refs));
  }, [addImagesNearGenerator, addImagesToCanvas, addManagedImagePayload, createPendingImageUploadNode, updatePendingImageUploadNode, uploadedImageNodeName, uploadFilesToRefs]);

  const handleBoardDragOver = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (hasCanvasImageDragPayload(event.dataTransfer) || event.dataTransfer.types.includes(MANAGED_IMAGE_DRAG_TYPE) || imageFilesFromList(event.dataTransfer.files).length > 0) {
      event.dataTransfer.dropEffect = "copy";
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
    } else if (isGenerationNode(selectedItem)) {
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
    if (target instanceof Element) {
      if (target.closest("input, textarea, select, button, [data-node-interactive='true'], [data-port]")) {
        return;
      }
    }
    event.stopPropagation();
    const multiSelect = event.ctrlKey || event.metaKey;
    const currentSelectedIds = selectedItemIdsRef.current;
    const currentSelectedId = selectedItemIdRef.current;
    const currentSelection = currentSelectedIds.length > 0 ? currentSelectedIds : currentSelectedId ? [currentSelectedId] : [];
    if (multiSelect) {
      setActiveDragState({ kind: "none" });
      return;
    }
    const nextSelection = currentSelection.includes(item.id) ? currentSelection : [item.id];
    const groupMembers = item.type === "group" ? item.data?.group_item_ids || [] : [];
    const activeSelection = nextSelection.length > 0 ? nextSelection : [item.id];
    const movingIds = Array.from(new Set([...activeSelection, ...groupMembers]));
    const groupCandidateIds = item.type === "group"
      ? []
      : activeSelection.filter((id) => {
          const targetItem = canvasRef.current?.nodes.find((node) => node.id === id);
          return isGroupableItem(targetItem);
        });
    const startPositions = Object.fromEntries(
      movingIds.map((id) => {
        const targetItem = canvasRef.current?.nodes.find((node) => node.id === id) || item;
        return [id, { x: Number(targetItem.position?.x || 0), y: Number(targetItem.position?.y || 0) }];
      }),
    );
    historyCommitBaseRef.current = canvasRef.current;
    selectedItemIdRef.current = item.id;
    selectedItemIdsRef.current = activeSelection;
    setSelectedItemId(item.id);
    setSelectedItemIds(activeSelection);
    setActiveDragState({
      kind: "item",
      pointerId: event.pointerId,
      itemId: item.id,
      itemIds: movingIds,
      groupCandidateIds,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPositions,
    });
    bindWindowPointerSession(event.pointerId);
  }, [bindWindowPointerSession, setActiveDragState]);

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
        w: Number(item.data?.width || nodeSizeForType(item.type).w),
        h: Number(item.data?.height || nodeSizeForType(item.type).h),
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
      }), false, undefined, { history: "skip" });
    }
    if (dragState.kind === "resize" && dragState.pointerId === event.pointerId) {
      const dx = (event.clientX - dragState.startClientX) / viewportRef.current.zoom;
      const dy = (event.clientY - dragState.startClientY) / viewportRef.current.zoom;
      updateCanvas((current) => ({
        ...current,
        nodes: current.nodes.map((item) => {
          if (item.id !== dragState.itemId) return item;
          const bounds = nodeResizeBounds(item);
          return {
              ...item,
              data: {
                ...item.data,
                width: Math.max(bounds.minW, Math.min(bounds.maxW, dragState.startSize.w + dx)),
                height: Math.max(bounds.minH, Math.min(bounds.maxH, dragState.startSize.h + dy)),
                node_size_user_modified: true,
              },
            };
        }),
      }), false, undefined, { history: "skip" });
    }
  }, [connectState, dragState, setActiveConnectState, updateCanvas]);

  const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if ((dragState.kind === "item" || dragState.kind === "resize") && dragState.pointerId === event.pointerId) {
      if (dragState.kind === "item") {
        updateCanvas(
          (current) => syncMovedItemsIntoGroups(current, dragState.groupCandidateIds),
          true,
          "移动节点",
        );
      } else {
        updateCanvas((current) => current, true, "缩放节点");
      }
    }
    if (dragState.kind === "pan" && dragState.pointerId === event.pointerId) {
      commitViewport(viewportRef.current, true);
    }
    if (connectState.kind === "link" && connectState.pointerId === event.pointerId) {
      const targetId = getCanvasNodeIdByPortSnap(
        canvasRef.current,
        connectState.sourceId,
        { x: event.clientX, y: event.clientY },
        boardRef.current?.getBoundingClientRect(),
        viewportRef.current,
      );
      if (targetId && appendEdge(connectState.sourceId, targetId)) {
        event.preventDefault();
      }
      setActiveConnectState({ kind: "none" });
    }
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Capture may already be released by the browser.
    }
    setActiveDragState({ kind: "none" });
  }, [appendEdge, commitViewport, connectState, dragState, setActiveConnectState, setActiveDragState, updateCanvas]);

  const handleWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    keepCanvasMediaLightweight();
    const rect = event.currentTarget.getBoundingClientRect();
    const factor = event.deltaY > 0 ? 0.92 : 1.08;
    const next = zoomViewportAt(viewportRef.current, rect, { x: event.clientX, y: event.clientY }, viewportRef.current.zoom * factor);
    setViewport(next);
    viewportRef.current = next;
    commitViewport(next, true);
  }, [commitViewport, keepCanvasMediaLightweight]);

  const updateViewport = useCallback((next: SmartCanvasViewport, _commit = false, _label = "移动画布") => {
    setViewport(next);
    viewportRef.current = next;
    commitViewport(next, true);
  }, [commitViewport]);

  const zoomBy = useCallback((factor: number) => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const next = zoomViewportAt(viewportRef.current, rect, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, viewportRef.current.zoom * factor);
    setViewport(next);
    viewportRef.current = next;
    commitViewport(next, true);
  }, [commitViewport]);

  const fitContent = useCallback(() => {
    const current = canvasRef.current;
    const rect = boardRef.current?.getBoundingClientRect();
    if (!current || !rect || current.nodes.length === 0) {
      const next = { ...DEFAULT_SMART_VIEWPORT };
      setViewport(next);
      viewportRef.current = next;
      commitViewport(next, true);
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
    commitViewport(next, true);
  }, [commitViewport]);

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

  const focusPromptSplitBatch = useCallback((batchId: string) => {
    const current = canvasRef.current;
    const rect = boardRef.current?.getBoundingClientRect();
    const batchNodes = current?.nodes.filter((item) => isPromptSplitFanoutNode(item, batchId)) || [];
    if (!current || !rect || batchNodes.length === 0) {
      return;
    }
    const bounds = batchNodes.map(canvasItemRect);
    const minX = Math.min(...bounds.map((item) => item.x));
    const minY = Math.min(...bounds.map((item) => item.y));
    const maxX = Math.max(...bounds.map((item) => item.x + item.w));
    const maxY = Math.max(...bounds.map((item) => item.y + item.h));
    const zoom = clampZoom(Math.min(
      rect.width / Math.max(420, maxX - minX + 220),
      rect.height / Math.max(320, maxY - minY + 220),
      0.82,
    ));
    const next = {
      x: rect.width / 2 - ((minX + maxX) / 2) * zoom,
      y: rect.height / 2 - ((minY + maxY) / 2) * zoom,
      zoom,
    };
    const ids = batchNodes.map((item) => item.id);
    selectedItemIdsRef.current = ids;
    selectedItemIdRef.current = ids[0] || "";
    setSelectedItemIds(ids);
    setSelectedItemId(ids[0] || "");
    setViewport(next);
    viewportRef.current = next;
    commitViewport(next, true);
  }, [commitViewport]);

  const arrangePromptSplitBatch = useCallback((batchId: string) => {
    let arrangedIds: string[] = [];
    updateCanvas((current) => {
      const arranged = arrangedPromptSplitBatch(current, batchId);
      arrangedIds = arranged.nodeIds;
      return arranged.canvas;
    }, true, "整理提示词批次");
    if (arrangedIds.length === 0) {
      toast.info("当前批次没有可整理的节点");
      return;
    }
    selectedItemIdsRef.current = arrangedIds;
    selectedItemIdRef.current = arrangedIds[0] || "";
    setSelectedItemIds(arrangedIds);
    setSelectedItemId(arrangedIds[0] || "");
    toast.success(`已整理 ${Math.ceil(arrangedIds.length / 2)} 组节点`);
  }, [updateCanvas]);

  const deletePromptSplitBatchNodes = useCallback((batchId: string) => {
    const current = canvasRef.current;
    if (!current) {
      return false;
    }
    const fanoutNodes = current.nodes.filter((item) => isPromptSplitFanoutNode(item, batchId));
    const sourceNode = current.nodes.find((item) => item.type === "llm" && item.data?.prompt_split_batch_id === batchId);
    const sourceBatchActive = Boolean(sourceNode && promptSplitStatusIsActive(
      sourceNode.data?.prompt_split_status,
      sourceNode.data?.prompt_split_execution_mode || (sourceNode.data?.direct_generate ? "direct" : "nodes"),
    ));
    if (sourceBatchActive || fanoutNodes.some((item) => isActiveTask(item.data?.status))) {
      toast.error("批次仍有任务进行中，请完成或中断后再删除");
      return false;
    }
    if (fanoutNodes.length === 0) {
      toast.info("当前批次没有可删除的节点");
      return false;
    }
    const removedIds = new Set(fanoutNodes.map((item) => item.id));
    updateCanvas((doc) => ({
      ...doc,
      nodes: doc.nodes
        .filter((item) => !removedIds.has(item.id))
        .map((item) => {
          const pruned = pruneGroupReferences(item, removedIds);
          if (pruned.type !== "llm" || pruned.data?.prompt_split_batch_id !== batchId) {
            return pruned;
          }
          return {
            ...pruned,
            data: {
              ...pruned.data,
              prompt_split_batch_id: "",
              prompt_split_status: undefined,
              prompt_split_execution_mode: undefined,
              prompt_split_items: [],
              prompt_split_replace_batch_id: "",
              task_id: "",
              status: undefined,
              error: "",
              last_run_error_detail: "",
              output: undefined,
              updated_at: new Date().toISOString(),
            },
          };
        }),
      edges: doc.edges.filter((edge) => !removedIds.has(edge.source) && !removedIds.has(edge.target)),
    }), true, "删除提示词批次");
    const remainingIds = selectedItemIdsRef.current.filter((id) => !removedIds.has(id));
    const nextPrimary = removedIds.has(selectedItemIdRef.current) ? remainingIds[0] || "" : selectedItemIdRef.current;
    selectedItemIdsRef.current = remainingIds;
    selectedItemIdRef.current = nextPrimary;
    setSelectedItemIds(remainingIds);
    setSelectedItemId(nextPrimary);
    toast.success(`已删除 ${Math.ceil(fanoutNodes.length / 2)} 组批次节点`);
    return true;
  }, [updateCanvas]);

  const moveItemToScreenPoint = useCallback((itemId: string, point: { x: number; y: number }) => {
    const rect = boardRef.current?.getBoundingClientRect();
    const current = canvasRef.current;
    const item = current?.nodes.find((node) => node.id === itemId);
    if (!rect || !item) {
      return;
    }
    const world = screenToWorld(point, rect, viewportRef.current);
    const size = nodeSizeForType(item.type);
    const width = Number(item.data?.width || size.w);
    const height = Number(item.data?.height || size.h);
    selectSingleItem(itemId);
    updateCanvas((doc) => ({
      ...doc,
      nodes: doc.nodes.map((node) => node.id === itemId
        ? {
            ...node,
            position: {
              x: world.x - width / 2,
              y: world.y - height / 2,
            },
          }
        : node),
    }), true, "移动节点");
  }, [selectSingleItem, updateCanvas]);

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
      const key = canvasImageKey(image);
      const sourceItem = canvasRef.current?.nodes.find((item) => imageToolImagesFromItem(item).some((candidate) => canvasImageKey(candidate) === key));
      setImageEditorSourceItemId(sourceItem?.id || "");
      setImageEditorInitialMode("preview");
      setAngleControlResultItemId("");
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
    const activeConnect = connectStateRef.current;
    if (activeConnect.kind !== "link") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    appendEdge(activeConnect.sourceId, targetId);
    setActiveConnectState({ kind: "none" });
  }, [appendEdge, setActiveConnectState]);

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

  const imageRefToDataUrl = useCallback(async (ref: CanvasImageRef) => {
    const src = canvasImageSource(ref);
    if (!src) {
      return "";
    }
    const blob = await fetchAuthenticatedImageBlob(src);
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => reject(reader.error || new Error("读取蒙版失败"));
      reader.readAsDataURL(blob);
    });
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
    node.name = imageToolResultNodeName(task.status, imageToolLabel(type));
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
      last_run_error_detail: canvasRunErrorDetail(task.status, task.error),
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
        if (output.text) {
          output.text = cleanLlmPromptOutput(output.text);
        }
        active = isActiveTask(task.status);
        updateCanvas((current) => ({
          ...current,
          nodes: current.nodes.map((item) => item.id === outputId
            ? {
                ...item,
                name: imageToolResultNodeName(task.status, label),
                data: {
                  ...item.data,
                  model: task.model || item.data?.model || "auto",
                  size: task.size || item.data?.size || "1024x1024",
                  output,
                  status: task.status,
                  error: task.error,
                  last_run_error_detail: canvasRunErrorDetail(task.status, task.error),
                  task_id: task.id,
                  updated_at: task.updated_at,
                },
              }
            : item),
        }), !active, !active ? `完成${label}` : undefined, active ? { history: "skip" } : undefined);
      }
      void loadAssets();
    } catch (error) {
      const message = error instanceof Error ? error.message : "同步任务状态失败";
      updateCanvas((current) => ({
        ...current,
        nodes: current.nodes.map((item) => item.id === outputId
          ? { ...item, name: imageToolResultNodeName("error", label), data: { ...item.data, status: "error", error: message, last_run_error_detail: message, task_id: taskId, updated_at: new Date().toISOString() } }
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
      return "";
    }
    setRunning(true);
    try {
      const files = await imageRefsToFiles([selected.image]);
      if (files.length === 0) {
        throw new Error("没有可读取的输入图片");
      }
      const publicImageUrls = publicCanvasImageUrls([selected.image]);
      const clientTaskId = uniqueTaskId(`smart-canvas-${type}`);
      const taskOptions = type === "background_removal" ? { background: "transparent" } : undefined;
      const taskOutputFormat = type === "background_removal" ? "png" : undefined;
      const taskSize = type === "background_removal" ? "" : "1024x1024";
      const task = await createImageEditTask(
        clientTaskId,
        files,
        prompt,
        "auto",
        taskSize,
        undefined,
        1,
        undefined,
        sourceImageVisibility(selected.item),
        undefined,
        taskOutputFormat,
        undefined,
        taskOptions,
        undefined,
        undefined,
        publicImageUrls,
      );
      const outputId = createImageToolResultNode(selected.item, selected.image, type, prompt, task, parameters);
      void pollTaskIntoToolResult(task.id, outputId, imageToolLabel(type));
      toast.success(`${imageToolLabel(type)}任务已提交`);
      return outputId;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `${imageToolLabel(type)}提交失败`);
      return "";
    } finally {
      setRunning(false);
    }
  }, [createImageToolResultNode, imageRefsToFiles, pollTaskIntoToolResult]);

  const runSelectedImageEditTool = useCallback(async (
    type: SmartCanvasImageToolType,
    prompt: string,
    parameters?: SmartCanvasImageToolParameters,
  ) => {
    return runImageEditTool(getSelectedSingleImage(), type, prompt, parameters);
  }, [getSelectedSingleImage, runImageEditTool]);

  const runImageEditToolForItem = useCallback(async (
    itemId: string,
    type: SmartCanvasImageToolType,
    prompt: string,
    parameters?: SmartCanvasImageToolParameters,
  ) => {
    selectSingleItem(itemId);
    return runImageEditTool(getSingleImageFromItem(itemId), type, prompt, parameters);
  }, [getSingleImageFromItem, runImageEditTool, selectSingleItem]);

  const runDetailEnhanceSelected = useCallback(() => {
    void runSelectedImageEditTool("detail_enhance", DETAIL_ENHANCE_PROMPT);
  }, [runSelectedImageEditTool]);

  const runDetailEnhanceForItem = useCallback((itemId: string) => {
    void runImageEditToolForItem(itemId, "detail_enhance", DETAIL_ENHANCE_PROMPT);
  }, [runImageEditToolForItem]);

  const openBackgroundRemovalEditorForItem = useCallback((itemId: string) => {
    selectSingleItem(itemId);
    const selected = getSingleImageFromItem(itemId);
    if (!selected) {
      return;
    }
    setImageEditorImage(selected.image);
    setImageEditorSourceItemId(selected.item.id);
    setImageEditorInitialMode("background_removal");
    setAngleControlResultItemId("");
  }, [getSingleImageFromItem, selectSingleItem]);

  const runBackgroundRemovalForImageEditor = useCallback((instruction: string) => {
    if (!imageEditorImage) {
      toast.info("请先打开一张图片");
      return Promise.resolve("");
    }
    const sourceItem = imageEditorSourceItemId
      ? canvasRef.current?.nodes.find((item) => item.id === imageEditorSourceItemId) || null
      : findItemContainingImage(imageEditorImage);
    if (!sourceItem) {
      toast.error("未找到图片所在节点");
      return Promise.resolve("");
    }
    return runImageEditTool(
      { item: sourceItem, image: imageEditorImage },
      "background_removal",
      buildAiBackgroundRemovalPrompt(instruction),
    );
  }, [findItemContainingImage, imageEditorImage, imageEditorSourceItemId, runImageEditTool]);

  const openSelectedImageEditor = useCallback(() => {
    const selected = getSelectedSingleImage();
    if (!selected) {
      return;
    }
    setImageEditorImage(selected.image);
    setImageEditorSourceItemId(selected.item.id);
    setImageEditorInitialMode("preview");
    setAngleControlResultItemId("");
  }, [getSelectedSingleImage]);

  const openImageEditorForItem = useCallback((itemId: string) => {
    selectSingleItem(itemId);
    const selected = getSingleImageFromItem(itemId);
    if (!selected) {
      return;
    }
    setImageEditorImage(selected.image);
    setImageEditorSourceItemId(selected.item.id);
    setImageEditorInitialMode("preview");
    setAngleControlResultItemId("");
  }, [getSingleImageFromItem, selectSingleItem]);

  const runAngleControlForImageEditor = useCallback((values: SmartCanvasAngleControlValues) => {
    if (!imageEditorImage) {
      toast.info("请先打开一张图片");
      return Promise.resolve("");
    }
    const normalized = {
      horizontal: Math.max(-180, Math.min(180, Number(values.horizontal) || 0)),
      vertical: Math.max(-90, Math.min(90, Number(values.vertical) || 0)),
      zoom: Math.max(0, Math.min(10, Number(values.zoom) || 0)),
    };
    setAngleControlValues(normalized);
    return (async () => {
      const prompt = buildAngleControlPrompt(normalized);
      const sourceItem = imageEditorSourceItemId
        ? canvasRef.current?.nodes.find((item) => item.id === imageEditorSourceItemId) || null
        : findItemContainingImage(imageEditorImage);
      if (!sourceItem) {
        toast.info("无法定位这张图片所在节点");
        return "";
      }
      const outputId = await runImageEditTool({ item: sourceItem, image: imageEditorImage }, "angle_control", prompt, normalized);
      if (outputId) {
        setAngleControlResultItemId(outputId);
      }
      return outputId;
    })();
  }, [findItemContainingImage, imageEditorImage, imageEditorSourceItemId, runImageEditTool]);

  const pollTaskIntoGenerator = useCallback(async (taskId: string, generatorId: string, outputIds: string[]) => {
    const currentCanvas = canvasRef.current;
    const generatorNode = currentCanvas?.nodes.find((item) => item.id === generatorId);
    const hasLoopOutputNode = currentCanvas?.nodes.some((item) => outputIds.includes(item.id) && hasLoopOutput(item));
    if (isLoopDrivenGenerator(currentCanvas, generatorId) || hasLoopOutput(generatorNode) || hasLoopOutputNode) {
      return;
    }
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
        const taskStartedAt = task.created_at || task.updated_at;
        updateCanvas((current) => ({
          ...current,
          nodes: current.nodes.map((item) => {
            if (item.id === generatorId) {
              if (hasLoopOutput(item)) {
                return item;
              }
              return {
                ...item,
                data: {
                  ...item.data,
                  output,
                  status: task.status,
                  error: task.error,
                  last_run_error_detail: canvasRunErrorDetail(task.status, task.error),
                  task_id: task.id,
                  started_at: item.data?.started_at || taskStartedAt,
                  updated_at: task.updated_at,
                },
              };
            }
            if (outputIds.includes(item.id)) {
              if (hasLoopOutput(item)) {
                return item;
              }
              return {
                ...item,
                name: generationOutputNodeName(task.status),
                data: {
                  ...item.data,
                  prompt: item.data?.prompt || current.nodes.find((node) => node.id === generatorId)?.data?.prompt || "",
                  model: item.data?.model || current.nodes.find((node) => node.id === generatorId)?.data?.model || "auto",
                  output,
                  status: task.status,
                  error: task.error,
                  last_run_error_detail: canvasRunErrorDetail(task.status, task.error),
                  task_id: task.id,
                  started_at: item.data?.started_at || taskStartedAt,
                  updated_at: task.updated_at,
                },
              };
            }
            return item;
          }),
        }), !active, !active ? "完成 图片生成" : undefined, active ? { history: "skip" } : undefined);
      }
      void loadAssets();
    } catch (error) {
      const message = error instanceof Error ? error.message : "同步任务状态失败";
      updateCanvas((current) => ({
        ...current,
        nodes: current.nodes.map((item) => item.id === generatorId || outputIds.includes(item.id)
          ? hasLoopOutput(item)
            ? item
            : { ...item, name: item.type === "result" ? generationOutputNodeName("error") : item.name, data: { ...item.data, status: "error", error: message, last_run_error_detail: message, task_id: taskId, updated_at: new Date().toISOString() } }
          : item),
      }), true, "图片生成失败");
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
                  last_run_error_detail: canvasRunErrorDetail(task.status, task.error),
                  task_id: task.id,
                  updated_at: task.updated_at,
                },
              }
            : item),
        }), !active, !active ? "完成 AI 提示词" : undefined, active ? { history: "skip" } : undefined);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "同步 AI 提示词任务失败";
      updateCanvas((current) => ({
        ...current,
        nodes: current.nodes.map((item) => item.id === nodeId
          ? { ...item, data: { ...item.data, status: "error", error: message, last_run_error_detail: message, task_id: taskId, updated_at: new Date().toISOString() } }
          : item),
      }), true, "AI 提示词失败");
      toast.error(message);
    } finally {
      pollingTasksRef.current.delete(taskId);
    }
  }, [updateCanvas]);

  const applyPromptSplitBatch = useCallback((nodeId: string, batch: PromptSplitBatch, historyLabel?: string, dirty = true) => {
    const current = canvasRef.current;
    const node = current?.nodes.find((item) => item.id === nodeId);
    if (!current || !node || node.type !== "llm") {
      return [] as PromptSplitFanoutPair[];
    }
    const template = promptSplitTemplateForNode(current, node);
    const synced = syncPromptSplitBatch(current, nodeId, batch, template);
    updateCanvas(() => synced.canvas, dirty, historyLabel, historyLabel ? undefined : { history: "skip" });
    if (batch.execution_mode === "direct") {
      synced.pairs
        .filter((pair) => pair.taskId && pair.shouldPoll)
        .forEach((pair) => void pollTaskIntoGenerator(pair.taskId, pair.generatorId, [pair.outputId]));
    }
    return synced.pairs;
  }, [pollTaskIntoGenerator, updateCanvas]);

  const pollPromptSplitBatch = useCallback(async (batchId: string, nodeId: string, fetchImmediately = false) => {
    const pollingKey = `prompt-split:${batchId}:${nodeId}`;
    if (pollingTasksRef.current.has(pollingKey)) {
      return;
    }
    pollingTasksRef.current.add(pollingKey);
    try {
      let active = true;
      let waitBeforeFetch = !fetchImmediately;
      let consecutiveFailures = 0;
      while (active) {
        if (waitBeforeFetch) {
          await new Promise((resolve) => window.setTimeout(resolve, PROMPT_SPLIT_POLL_INTERVAL_MS));
        }
        waitBeforeFetch = true;
        try {
          const batch = await fetchPromptSplit(batchId);
          consecutiveFailures = 0;
          active = promptSplitBatchIsActive(batch);
          const historyLabel = active
            ? undefined
            : batch.status === "cancelled"
              ? "已中断提示词拆分"
              : batch.status === "error"
                ? "提示词拆分失败"
                : "完成提示词拆分";
          applyPromptSplitBatch(nodeId, batch, historyLabel, true);
        } catch (error) {
          consecutiveFailures += 1;
          const message = error instanceof Error ? error.message : "同步提示词拆分任务失败";
          updateCanvas((current) => ({
            ...current,
            nodes: current.nodes.map((item) => item.id === nodeId && item.data?.prompt_split_batch_id === batchId
              ? {
                  ...item,
                  data: {
                    ...item.data,
                    last_run_error_detail: `暂时无法同步提示词拆分状态（${consecutiveFailures}/${PROMPT_SPLIT_SYNC_RETRY_LIMIT}）：${message}`,
                    updated_at: new Date().toISOString(),
                  },
                }
              : item),
          }), true, undefined, { history: "skip" });
          if (consecutiveFailures >= PROMPT_SPLIT_SYNC_RETRY_LIMIT) {
            toast.info("提示词拆分状态暂时无法同步，恢复网络后重新打开画布即可继续恢复");
            return;
          }
        }
      }
    } finally {
      pollingTasksRef.current.delete(pollingKey);
    }
  }, [applyPromptSplitBatch, updateCanvas]);

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
      const message = "请连接提示词/图片节点，或在 AI 提示词节点里补充输入";
      updateCanvas((doc) => ({
        ...doc,
        nodes: doc.nodes.map((item) => item.id === node.id
          ? { ...item, data: { ...item.data, ...canvasBlockedData("input", "上游输入", message) } }
          : item),
      }), true, "AI 提示词阻断");
      toast.error(message);
      return;
    }
    const splitCount = promptSplitCount(node);
    if (splitCount > 1) {
      if (inputImages.length > 0) {
        const message = "提示词拆分当前只支持文本输入，请移除连接到 AI 提示词节点的图片";
        updateCanvas((doc) => ({
          ...doc,
          nodes: doc.nodes.map((item) => item.id === node.id
            ? { ...item, data: { ...item.data, ...canvasBlockedData("image", "图片输入", message), prompt_split_status: "error" } }
            : item),
        }), true, "提示词拆分阻断");
        toast.error(message);
        return;
      }
      const validation = promptSplitTemplateValidation(current, node);
      if (validation.reason) {
        updateCanvas((doc) => ({
          ...doc,
          nodes: doc.nodes.map((item) => item.id === node.id
            ? { ...item, data: { ...item.data, ...canvasBlockedData("template", "图片生成模板", validation.reason), prompt_split_status: "error" } }
            : item),
        }), true, "提示词拆分阻断");
        toast.error(validation.reason);
        return;
      }
      const executionMode = promptSplitExecutionMode(node);
      const clientTaskId = !node.data?.prompt_split_batch_id && node.data?.prompt_split_client_task_id
        ? node.data.prompt_split_client_task_id
        : uniqueTaskId("smart-canvas-prompt-split");
      const imageTemplate = validation.template || createGeneratorNode({ x: 0, y: 0 });
      setRunning(true);
      try {
        updateCanvas((doc) => ({
          ...doc,
          nodes: doc.nodes.map((item) => item.id === node.id
            ? {
                ...item,
                data: {
                  ...item.data,
                  split_count: splitCount,
                  direct_generate: executionMode === "direct",
                  prompt_split_client_task_id: clientTaskId,
                  prompt_split_batch_id: "",
                  prompt_split_template_node_id: validation.template?.id || "",
                  prompt_split_status: "splitting",
                  prompt_split_execution_mode: executionMode,
                  prompt_split_items: [],
                  status: "running",
                  task_id: "",
                  error: "",
                  last_run_error_detail: "",
                  output: { text: "", raw: { prompt_split_status: "splitting" } },
                  started_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                },
              }
            : item),
        }), true, "开始提示词拆分");
        const batch = await createPromptSplit({
          client_task_id: clientTaskId,
          prompt: inputText,
          model: node.data?.model || "auto",
          split_count: splitCount,
          execution_mode: executionMode,
          ...(executionMode === "direct" ? { image_request: promptSplitImageRequest(imageTemplate) } : {}),
        });
        applyPromptSplitBatch(node.id, batch, "提交提示词拆分", true);
        if (promptSplitBatchIsActive(batch)) {
          void pollPromptSplitBatch(batch.id, node.id);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "提交提示词拆分失败";
        updateCanvas((doc) => ({
          ...doc,
          nodes: doc.nodes.map((item) => item.id === node.id
            ? {
                ...item,
                data: {
                  ...item.data,
                  status: "error",
                  prompt_split_status: "error",
                  error: message,
                  last_run_error_detail: message,
                  updated_at: new Date().toISOString(),
                },
              }
            : item),
        }), true, "提示词拆分失败");
        toast.error(message);
      } finally {
        setRunning(false);
      }
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
                split_count: 1,
                direct_generate: false,
                prompt_split_client_task_id: "",
                prompt_split_batch_id: "",
                prompt_split_template_node_id: "",
                prompt_split_status: undefined,
                prompt_split_execution_mode: undefined,
                prompt_split_items: [],
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
      const prompt = buildLlmPromptInstruction(inputText, inputImages.length);
      const task = await createChatCompletionTask(
        uniqueTaskId("smart-canvas-llm"),
        prompt,
        node.data?.model || "auto",
        [
          {
            role: "system",
            content: "你只输出可直接传给图像生成模型的最终 prompt。不要解释，不要 Markdown，不要标题。",
          },
          { role: "user", content: prompt },
        ],
        referenceImages.length > 0 ? referenceImages : undefined,
      );
      const output = creationTaskToOutput(task);
      if (output.text) {
        output.text = cleanLlmPromptOutput(output.text);
      }
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
                last_run_error_detail: canvasRunErrorDetail(task.status, task.error),
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
          ? { ...item, data: { ...item.data, status: "error", error: message, last_run_error_detail: message, updated_at: new Date().toISOString() } }
          : item),
      }), true, "AI 提示词失败");
      toast.error(message);
    } finally {
      setRunning(false);
    }
  }, [applyPromptSplitBatch, imageRefsToFiles, pollPromptSplitBatch, pollTaskIntoLlmNode, updateCanvas]);

  const runLoopNode = useCallback(async (loopId: string, generatorId?: string) => {
    const current = canvasRef.current;
    const loop = current?.nodes.find((item) => item.id === loopId);
    const generator = generatorId
      ? current?.nodes.find((item) => item.id === generatorId)
      : current?.edges
        .filter((edge) => edge.source === loopId)
        .map((edge) => current.nodes.find((item) => item.id === edge.target))
        .find((item) => item?.type === "image_generation");
    if (!current || !loop || loop.type !== "loop" || !generator || generator.type !== "image_generation") {
      toast.error("请把循环节点连接到 图片生成 节点");
      return;
    }
    if (isActiveTask(loop.data?.status) || isActiveTask(generator.data?.status)) {
      toast.info("当前循环正在运行中");
      return;
    }
    loopStopRequestsRef.current.delete(loop.id);

    const loopMode = loop.data?.loop_mode === "images" ? "images" : "repeat";
    const loopCount = Math.max(1, Math.min(10, Number(loop.data?.loop_count || 3)));
    const sourcePrompt = loopInputText(current, loop);
    const submittedPrompt = [sourcePrompt, generator.data?.prompt || ""]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join("\n\n");
    if (!submittedPrompt) {
      const message = "请给循环节点连接 Prompt/LLM，或在 图片生成节点里补充提示词";
      updateCanvas((doc) => ({
        ...doc,
        nodes: doc.nodes.map((item) => item.id === loop.id || item.id === generator.id
          ? { ...item, data: { ...item.data, ...canvasBlockedData("prompt", "Prompt/LLM", message) } }
          : item),
      }), true, "循环阻断");
      toast.error(message);
      return;
    }
    const sourceImages = loopInputImages(current, loop);
    if (loopMode === "images" && sourceImages.length === 0) {
      const message = "逐图循环需要连接至少 1 张图片";
      updateCanvas((doc) => ({
        ...doc,
        nodes: doc.nodes.map((item) => item.id === loop.id
          ? { ...item, data: { ...item.data, ...canvasBlockedData("image", "图片输入", message) } }
          : item),
      }), true, "循环阻断");
      toast.error(message);
      return;
    }
    if (loopMode === "repeat") {
      const { images: editSourceImages } = splitMaskImageRefs(sourceImages);
      const referenceLimit = imageReferenceInputLimit(generatorImageModel(generator));
      if (editSourceImages.length > referenceLimit) {
        const message = `${referenceImageLimitMessage(referenceLimit)}，请减少连接到循环的图片后再生成`;
        updateCanvas((doc) => ({
          ...doc,
          nodes: doc.nodes.map((item) => item.id === loop.id || item.id === generator.id
            ? { ...item, data: { ...item.data, ...canvasBlockedData("image", "参考图", message) } }
            : item),
        }), true, "循环阻断");
        toast.error(message);
        return;
      }
    }
    const iterations = loopMode === "images" ? sourceImages.slice(0, 10).map((image) => [image]) : [sourceImages];
    const total = loopMode === "images" ? iterations.length : loopCount;
    const startedAt = new Date().toISOString();
    let outputIds = current.edges
      .filter((edge) => edge.source === generator.id)
      .map((edge) => current.nodes.find((item) => item.id === edge.target))
      .filter((item): item is SmartCanvasItem => item?.type === "result")
      .map((item) => item.id);
    const outputNode = outputIds.length === 0
      ? createOutputNode({
          x: Number(generator.position?.x || 0) + 430,
          y: Number(generator.position?.y || 0),
        })
      : null;
    if (outputNode) {
      outputIds = [outputNode.id];
    }
    const loopImagePreviewData = generatorImagePreviewData(generator, sourceImages.length > 0);

    const slotStatuses: CreationTask["output_statuses"] = Array.from({ length: total }, () => "queued" as const);
    const updateLoopProgress = (
      completed: number,
      failed: number,
      currentIndex: number,
      status: CreationTask["status"],
      outputImages: CanvasImageRef[],
      outputText: string,
      error = "",
      taskIds: string[] = [],
      outputStatuses: CreationTask["output_statuses"] = [],
    ) => {
      const runningSlot = status === "running" ? Math.max(0, Math.min(total - 1, currentIndex)) : -1;
      const output = {
        task_id: taskIds[taskIds.length - 1] || "",
        images: dedupeCanvasImageRefs(outputImages),
        text: outputText,
        raw: {
          mode: "loop",
          task_ids: taskIds,
          completed,
          failed,
          total,
          current: currentIndex,
          running_slot: runningSlot,
          slots: Array.from({ length: total }, (_, slotIndex) => ({
            index: slotIndex,
            status: outputStatuses[slotIndex] || (slotIndex < completed
                ? "success"
                : status === "success"
                  ? "error"
                : slotIndex === runningSlot
                  ? "running"
                : status === "error" && slotIndex >= completed
                  ? "error"
                : status === "cancelled" && slotIndex >= completed
                    ? "cancelled"
                    : "queued"),
          })),
        },
      };
      updateCanvas((doc) => {
        let nodes = doc.nodes.map((item) => {
          if (item.id === loop.id) {
            return {
              ...item,
              data: {
                ...item.data,
                status,
                error,
                output,
                loop_progress: { total, completed, failed, current: currentIndex },
                stop_requested: false,
                started_at: startedAt,
                updated_at: new Date().toISOString(),
              },
            };
          }
          if (item.id === generator.id || outputIds.includes(item.id)) {
            const isGenerator = item.id === generator.id;
            return {
              ...item,
              data: {
                ...item.data,
                ...(isGenerator ? {} : { prompt: submittedPrompt }),
                ...(isGenerator ? {} : loopImagePreviewData),
                model: generator.data?.model || "auto",
                input_images: loopMode === "images" ? [] : sourceImages,
                output,
                status,
                error,
                task_id: output.task_id,
                stop_requested: false,
                started_at: startedAt,
                updated_at: new Date().toISOString(),
              },
            };
          }
          return item;
        });
        let edges = doc.edges;
        if (outputNode && !nodes.some((item) => item.id === outputNode.id)) {
          nodes = [...nodes, {
            ...outputNode,
            data: {
              ...outputNode.data,
              prompt: submittedPrompt,
              ...loopImagePreviewData,
              model: generator.data?.model || "auto",
              output,
              status,
              error,
              task_id: output.task_id,
              stop_requested: false,
              started_at: startedAt,
              created_at: startedAt,
              updated_at: new Date().toISOString(),
            },
          }];
          edges = edges.some((edge) => edge.source === generator.id && edge.target === outputNode.id)
            ? edges
            : [...edges, createSmartEdge(generator.id, outputNode.id)];
        }
        return { ...doc, nodes, edges };
      }, status !== "running", status === "running" ? undefined : "完成循环", status === "running" ? { history: "skip" } : undefined);
    };

    setRunning(true);
    const taskIds: string[] = [];
    const outputImages: CanvasImageRef[] = [];
    const outputTexts: string[] = [];
    let completed = 0;
    let failed = 0;
    let lastError = "";
    try {
      updateLoopProgress(0, 0, 0, "running", [], "", "", []);
      for (let index = 0; index < iterations.length; index += 1) {
        if (loopStopRequestsRef.current.has(loop.id)) {
          lastError = "循环已中断";
          updateLoopProgress(completed, failed, index, "cancelled", outputImages, outputTexts.join("\n\n"), lastError, taskIds);
          toast.info("已中断循环");
          return;
        }
        const iterationImages = iterations[index];
        const slotStart = loopMode === "repeat" ? completed + failed : index;
        try {
          let task: CreationTask;
          const taskCount = loopMode === "repeat" ? loopCount : 1;
          const { images: editIterationImages, masks: maskIterationImages } = splitMaskImageRefs(iterationImages);
          if (editIterationImages.length > 0) {
            const files = await imageRefsToFiles(editIterationImages);
            if (files.length === 0) {
              throw new Error("没有可读取的输入图片");
            }
            const inputImageMask = maskIterationImages[0]
              ? publicCanvasImageUrl(maskIterationImages[0]) || await imageRefToDataUrl(maskIterationImages[0])
              : "";
            const publicImageUrls = publicCanvasImageUrls(editIterationImages);
            const proPayload = generatorProStudioPayload(generator, submittedPrompt, publicImageUrls, inputImageMask);
            const modelFields = proPayload ? undefined : generatorImageModelTaskFields(generator, inputImageMask);
            task = await createImageEditTask(
              uniqueTaskId("smart-canvas-loop"),
              files,
              proPayload?.prompt || submittedPrompt,
              generatorImageModel(generator),
              generatorImageSize(generator, true),
              generatorImageQuality(generator),
              taskCount,
              undefined,
              generatorImageVisibility(generator),
              generatorImageResolution(generator, true),
              generatorOutputFormat(generator),
              generatorOutputCompression(generator),
              proPayload ? inputImageMask ? { inputImageMask } : undefined : modelFields?.toolOptions,
              undefined,
              undefined,
              publicImageUrls,
              proPayload ? proStudioExtraBody(proPayload) : modelFields?.extraBody,
            );
          } else if (maskIterationImages.length > 0) {
            throw new Error("蒙版需要和原图一起作为输入");
          } else {
            const proPayload = generatorProStudioPayload(generator, submittedPrompt);
            const modelFields = proPayload ? undefined : generatorImageModelTaskFields(generator);
            task = await createImageGenerationTask(
              uniqueTaskId("smart-canvas-loop"),
              proPayload?.prompt || submittedPrompt,
              generatorImageModel(generator),
              generatorImageSize(generator),
              generatorImageQuality(generator),
              taskCount,
              undefined,
              generatorImageVisibility(generator),
              generatorImageResolution(generator),
              generatorOutputFormat(generator),
              generatorOutputCompression(generator),
              proPayload ? undefined : modelFields?.toolOptions,
              undefined,
              undefined,
              proPayload ? proStudioExtraBody(proPayload) : modelFields?.extraBody,
            );
          }
          taskIds.push(task.id);
          for (let offset = 0; offset < taskCount && slotStart + offset < slotStatuses.length; offset += 1) {
            slotStatuses[slotStart + offset] = offset === 0 ? "running" : "queued";
          }
          while (isActiveTask(task.status)) {
            if (loopStopRequestsRef.current.has(loop.id)) {
              task = await cancelCreationTask(task.id);
              break;
            }
            const activeOutput = creationTaskToOutput(task);
            const activeImages = dedupeCanvasImageRefs([...outputImages, ...(activeOutput.images || [])]);
            const activeSlots = mergeLoopSlotStatuses(slotStatuses, slotStart, taskCount, task.output_statuses, "running", task.data);
            const activeCompleted = activeSlots.filter((item) => item === "success").length;
            const activeFailed = activeSlots.filter((item) => item === "error" || item === "cancelled").length;
            updateLoopProgress(activeCompleted, activeFailed, Math.min(total - 1, slotStart + activeCompleted + activeFailed), "running", activeImages, outputTexts.join("\n\n"), "", taskIds, activeSlots);
            await new Promise((resolve) => window.setTimeout(resolve, 2000));
            const result = await fetchCreationTasks([task.id]);
            task = result.items[0] || task;
          }
          const output = creationTaskToOutput(task);
          const outputImageCount = output.images?.length || 0;
          const mergedImages = dedupeCanvasImageRefs([...outputImages, ...(output.images || [])]);
          outputImages.splice(0, outputImages.length, ...mergedImages);
          if (output.text) {
            outputTexts.push(output.text);
          }
          if (task.status === "success") {
            mergeLoopSlotStatuses(slotStatuses, slotStart, taskCount, task.output_statuses, "success", task.data).forEach((item, itemIndex) => {
              slotStatuses[itemIndex] = item;
            });
          } else if (task.status === "cancelled") {
            lastError = "循环已中断";
            mergeLoopSlotStatuses(slotStatuses, slotStart, taskCount, task.output_statuses, "cancelled", task.data).forEach((item, itemIndex) => {
              slotStatuses[itemIndex] = item;
            });
            completed = slotStatuses.filter((item) => item === "success").length;
            failed = slotStatuses.filter((item) => item === "error" || item === "cancelled").length;
            const currentIndex = loopMode === "repeat" ? completed + failed : index + 1;
            updateLoopProgress(completed, failed, currentIndex, "cancelled", outputImages, outputTexts.join("\n\n"), lastError, taskIds, slotStatuses);
            toast.info("已中断循环");
            return;
          } else {
            const fallback = outputImageCount > 0 ? "success" : "error";
            mergeLoopSlotStatuses(slotStatuses, slotStart, taskCount, task.output_statuses, fallback, task.data).forEach((item, itemIndex) => {
              slotStatuses[itemIndex] = item;
            });
            lastError = task.error || "循环子任务失败";
          }
          completed = slotStatuses.filter((item) => item === "success").length;
          failed = slotStatuses.filter((item) => item === "error" || item === "cancelled").length;
          const currentIndex = loopMode === "repeat" ? completed + failed : index + 1;
          updateLoopProgress(completed, failed, currentIndex, "running", outputImages, outputTexts.join("\n\n"), lastError, taskIds, slotStatuses);
        } catch (error) {
          mergeLoopSlotStatuses(slotStatuses, slotStart, loopMode === "repeat" ? loopCount : 1, [], "error").forEach((item, itemIndex) => {
            slotStatuses[itemIndex] = item;
          });
          completed = slotStatuses.filter((item) => item === "success").length;
          failed = slotStatuses.filter((item) => item === "error" || item === "cancelled").length;
          lastError = error instanceof Error ? error.message : "循环子任务失败";
          const currentIndex = loopMode === "repeat" ? completed + failed : index + 1;
          updateLoopProgress(completed, failed, currentIndex, "running", outputImages, outputTexts.join("\n\n"), lastError, taskIds, slotStatuses);
        }
      }
      const finalStatus: CreationTask["status"] = failed > 0 ? "error" : completed > 0 ? "success" : "error";
      updateLoopProgress(completed, failed, total, finalStatus, outputImages, outputTexts.join("\n\n"), failed > 0 ? `循环完成，${failed} 轮失败` : "", taskIds, slotStatuses);
      selectSingleItem(outputIds[0] || generator.id);
      void loadAssets();
    } finally {
      loopStopRequestsRef.current.delete(loop.id);
      setRunning(false);
    }
  }, [imageRefToDataUrl, imageRefsToFiles, loadAssets, selectSingleItem, updateCanvas]);

  const runGeneratorNode = useCallback(async (generatorId: string) => {
    const current = canvasRef.current;
    const generator = current?.nodes.find((item) => item.id === generatorId);
    if (!current || !generator || !isGenerationNode(generator)) {
      return;
    }
    const loopNode = incomingItems(current, generator.id).find((item) => item.type === "loop");
    if (loopNode && generator.type === "image_generation") {
      await runLoopNode(loopNode.id, generator.id);
      return;
    }
    if (isActiveTask(generator.data?.status)) {
      toast.info("当前节点正在生成中");
      return;
    }
    const submittedPrompt = generatorPromptText(current, generator);
    if (!submittedPrompt) {
      const message = generator.type === "video_generation" ? "请连接 Prompt 节点，或在视频生成节点里补充提示词" : "请连接 Prompt 节点，或在 图片生成节点里补充提示词";
      updateCanvas((doc) => ({
        ...doc,
        nodes: doc.nodes.map((item) => item.id === generator.id
          ? { ...item, data: { ...item.data, ...canvasBlockedData("prompt", "Prompt 节点", message) } }
          : item),
      }), true, generator.type === "video_generation" ? "视频生成阻断" : "图片生成阻断");
      toast.error(message);
      return;
    }
    const inputRefs = generatorInputImages(current, generator);
    const { images: editInputRefs, masks: maskInputRefs } = splitMaskImageRefs(inputRefs);
    if (generator.type === "image_generation") {
      const referenceLimit = imageReferenceInputLimit(generatorImageModel(generator));
      if (editInputRefs.length > referenceLimit) {
        const message = `${referenceImageLimitMessage(referenceLimit)}，请减少连接到图片生成节点的图片后再生成`;
        updateCanvas((doc) => ({
          ...doc,
          nodes: doc.nodes.map((item) => item.id === generator.id
            ? { ...item, data: { ...item.data, ...canvasBlockedData("image", "参考图", message) } }
            : item),
        }), true, "图片生成阻断");
        toast.error(message);
        return;
      }
    }
    const startedAt = new Date().toISOString();
    const placeholderOutput = generator.type === "video_generation" ? { videos: [] } : { images: [] };
    const placeholderModel = generator.type === "video_generation"
      ? generator.data?.model || models.video[0]?.id || ""
      : generatorImageModel(generator);
    let outputIds = current.edges.filter((edge) => edge.source === generator.id)
      .map((edge) => current.nodes.find((item) => item.id === edge.target))
      .filter((item): item is SmartCanvasItem => item?.type === "result")
      .map((item) => item.id);
    const placeholderOutputNode = outputIds.length === 0
      ? createOutputNode({
          x: Number(generator.position?.x || 0) + 430,
          y: Number(generator.position?.y || 0),
        })
      : null;
    if (placeholderOutputNode) {
      outputIds = [placeholderOutputNode.id];
    }
    const imagePreviewData = generatorImagePreviewData(generator, editInputRefs.length > 0);
    setRunning(true);
    try {
      updateCanvas((doc) => {
        const next = migrateGeneratorDirectInputsToImageNodes(doc, doc.nodes.find((item) => item.id === generator.id) || generator);
        let edges = next.edges;
        let nodes = next.nodes.map((item) => {
          if (item.id === generator.id) {
            return {
              ...item,
              data: {
                ...item.data,
                input_images: [],
                status: "running" as const,
                error: "",
                output: placeholderOutput,
                started_at: startedAt,
                updated_at: startedAt,
              },
            };
          }
          if (outputIds.includes(item.id)) {
            return {
              ...item,
              name: generationOutputNodeName("running"),
              data: {
                ...item.data,
                prompt: submittedPrompt,
                model: placeholderModel,
                ...imagePreviewData,
                output: placeholderOutput,
                status: "running" as const,
                error: "",
                last_run_error_detail: "",
                task_id: "",
                started_at: startedAt,
                updated_at: startedAt,
              },
            };
          }
          return item;
        });
        if (placeholderOutputNode && !nodes.some((item) => item.id === placeholderOutputNode.id)) {
          nodes = [...nodes, {
            ...placeholderOutputNode,
            name: generationOutputNodeName("running"),
            data: {
              ...placeholderOutputNode.data,
              prompt: submittedPrompt,
              model: placeholderModel,
              ...imagePreviewData,
              output: placeholderOutput,
              status: "running",
              error: "",
              last_run_error_detail: "",
              task_id: "",
              started_at: startedAt,
              updated_at: startedAt,
            },
          }];
          edges = edges.some((edge) => edge.source === generator.id && edge.target === placeholderOutputNode.id)
            ? edges
            : [...edges, createSmartEdge(generator.id, placeholderOutputNode.id)];
        }
        return {
          ...next,
          nodes,
          edges,
        };
      }, true, "开始 图片生成");
      selectSingleItem(outputIds[0] || generator.id);
      const clientTaskId = uniqueTaskId("smart-canvas-node");
      let task: CreationTask;
      if (generator.type === "video_generation") {
        const videoModel = generator.data?.model || models.video[0]?.id || "";
        task = await createVideoGenerationTask(
          uniqueTaskId("smart-canvas-video"),
          submittedPrompt,
          videoModel,
          editInputRefs,
          Number(generator.data?.duration || 5),
          generator.data?.aspect_ratio || "16:9",
          generator.data?.resolution || "",
          generator.data?.visibility || "private",
          {
            enhancePrompt: generator.data?.enhance_prompt !== false,
            generateAudio: generator.data?.generate_audio === true,
          },
        );
      } else if (editInputRefs.length > 0) {
        const files = await imageRefsToFiles(editInputRefs);
        if (files.length === 0) {
          throw new Error("没有可读取的输入图片");
        }
        const inputImageMask = maskInputRefs[0]
          ? publicCanvasImageUrl(maskInputRefs[0]) || await imageRefToDataUrl(maskInputRefs[0])
          : "";
        const publicImageUrls = publicCanvasImageUrls(editInputRefs);
        const proPayload = generatorProStudioPayload(generator, submittedPrompt, publicImageUrls, inputImageMask);
        const modelFields = proPayload ? undefined : generatorImageModelTaskFields(generator, inputImageMask);
        task = await createImageEditTask(
          clientTaskId,
          files,
          proPayload?.prompt || submittedPrompt,
          generatorImageModel(generator),
          generatorImageSize(generator, true),
          generatorImageQuality(generator),
          generatorImageCount(generator),
          undefined,
          generatorImageVisibility(generator),
          generatorImageResolution(generator, true),
          generatorOutputFormat(generator),
          generatorOutputCompression(generator),
          proPayload ? inputImageMask ? { inputImageMask } : undefined : modelFields?.toolOptions,
          undefined,
          undefined,
          publicImageUrls,
          proPayload ? proStudioExtraBody(proPayload) : modelFields?.extraBody,
        );
      } else if (maskInputRefs.length > 0) {
        throw new Error("蒙版需要和原图一起作为输入");
      } else {
        const proPayload = generatorProStudioPayload(generator, submittedPrompt);
        const modelFields = proPayload ? undefined : generatorImageModelTaskFields(generator);
        task = await createImageGenerationTask(
          clientTaskId,
          proPayload?.prompt || submittedPrompt,
          generatorImageModel(generator),
          generatorImageSize(generator),
          generatorImageQuality(generator),
          generatorImageCount(generator),
          undefined,
          generatorImageVisibility(generator),
          generatorImageResolution(generator),
          generatorOutputFormat(generator),
          generatorOutputCompression(generator),
          proPayload ? undefined : modelFields?.toolOptions,
          undefined,
          undefined,
          proPayload ? proStudioExtraBody(proPayload) : modelFields?.extraBody,
        );
      }
      const output = creationTaskToOutput(task);
      const submittedModel = task.model || generator.data?.model || (generator.type === "video_generation" ? models.video[0]?.id || "" : "auto");
      updateCanvas((doc) => {
        let nodes = doc.nodes.map((item) => item.id === generator.id ? {
          ...item,
          data: {
            ...item.data,
            input_images: [],
            output,
            status: task.status,
            error: task.error,
            last_run_error_detail: canvasRunErrorDetail(task.status, task.error),
            task_id: task.id,
            professional_mode: task.professional_mode,
            pro_studio: task.pro_studio,
            official_settings: task.official_settings,
            started_at: item.id === generator.id ? item.data?.started_at || startedAt || task.created_at : startedAt,
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
          name: generationOutputNodeName(task.status),
          data: {
            ...item.data,
            prompt: submittedPrompt,
            model: submittedModel,
            ...imagePreviewData,
            output,
            status: task.status,
            error: task.error,
            last_run_error_detail: canvasRunErrorDetail(task.status, task.error),
            task_id: task.id,
            professional_mode: task.professional_mode,
            pro_studio: task.pro_studio,
            official_settings: task.official_settings,
            started_at: startedAt,
            updated_at: task.updated_at,
          },
        } : item);
        return { ...doc, nodes, edges };
      }, true, generator.type === "video_generation" ? "提交视频生成" : "提交 图片生成");
      void pollTaskIntoGenerator(task.id, generator.id, outputIds);
    } catch (error) {
      const message = error instanceof Error ? error.message : "提交生成失败";
      updateCanvas((doc) => ({
        ...doc,
        nodes: doc.nodes.map((item) => item.id === generator.id || outputIds.includes(item.id)
          ? {
              ...item,
              name: item.type === "result" ? generationOutputNodeName("error") : item.name,
              data: {
                ...item.data,
                status: "error",
                error: message,
                last_run_error_detail: message,
                updated_at: new Date().toISOString(),
              },
            }
          : item),
      }), true, "图片生成失败");
      toast.error(message);
    } finally {
      setRunning(false);
    }
  }, [imageRefToDataUrl, imageRefsToFiles, migrateGeneratorDirectInputsToImageNodes, models.video, pollTaskIntoGenerator, runLoopNode, selectSingleItem, updateCanvas]);

  const stopLoopNode = useCallback(async (loopId: string) => {
    const current = canvasRef.current;
    const loop = current?.nodes.find((item) => item.id === loopId);
    if (!current || !loop || loop.type !== "loop") {
      return;
    }
    loopStopRequestsRef.current.add(loopId);
    const connectedGeneratorIds = current.edges
      .filter((edge) => edge.source === loopId)
      .map((edge) => current.nodes.find((item) => item.id === edge.target))
      .filter((item): item is SmartCanvasItem => item?.type === "image_generation")
      .map((item) => item.id);
    const outputIds = current.edges
      .filter((edge) => connectedGeneratorIds.includes(edge.source))
      .map((edge) => current.nodes.find((item) => item.id === edge.target))
      .filter((item): item is SmartCanvasItem => item?.type === "result")
      .map((item) => item.id);
    const taskIds = new Set<string>();
    if (loop.data?.task_id) {
      taskIds.add(loop.data.task_id);
    }
    for (const item of current.nodes) {
      if ((item.id === loopId || connectedGeneratorIds.includes(item.id) || outputIds.includes(item.id)) && item.data?.task_id) {
        taskIds.add(item.data.task_id);
      }
    }
    updateCanvas((doc) => ({
      ...doc,
      nodes: doc.nodes.map((item) => item.id === loopId || connectedGeneratorIds.includes(item.id) || outputIds.includes(item.id)
        ? {
            ...item,
            name: item.type === "result" ? generationOutputNodeName("cancelled") : item.name,
            data: {
              ...item.data,
              status: "cancelled",
              error: "循环已中断",
              last_run_error_detail: "循环已中断",
              stop_requested: true,
              updated_at: new Date().toISOString(),
            },
          }
        : item),
    }), true, "中断循环");
    await Promise.allSettled(Array.from(taskIds).map((taskId) => cancelCreationTask(taskId)));
    toast.info("已请求中断循环");
  }, [updateCanvas]);

  const stopRunningNode = useCallback(async (nodeId: string) => {
    const current = canvasRef.current;
    const node = current?.nodes.find((item) => item.id === nodeId);
    if (!current || !node) {
      return;
    }
    if (node.type === "loop") {
      await stopLoopNode(nodeId);
      return;
    }
    if (node.type === "llm" && node.data?.prompt_split_batch_id && promptSplitStatusIsActive(
      node.data?.prompt_split_status,
      node.data?.prompt_split_execution_mode || (node.data?.direct_generate ? "direct" : "nodes"),
    )) {
      try {
        const batch = await cancelPromptSplit(node.data.prompt_split_batch_id);
        applyPromptSplitBatch(node.id, batch, "中断提示词拆分", true);
        toast.info("已请求中断提示词拆分");
      } catch (error) {
        const message = error instanceof Error ? error.message : "中断提示词拆分失败";
        toast.error(message);
      }
      return;
    }
    if (!isActiveTask(node.data?.status)) {
      toast.info("当前节点没有运行中的任务");
      return;
    }
    const scopeIds = nodeStopScope(current, node);
    const taskIds = new Set<string>();
    for (const item of current.nodes) {
      if (scopeIds.has(item.id) && item.data?.task_id) {
        taskIds.add(item.data.task_id);
      }
    }
    const label = nodeStopLabel(node);
    updateCanvas((doc) => ({
      ...doc,
      nodes: doc.nodes.map((item) => scopeIds.has(item.id)
        ? {
            ...item,
            name: item.type === "result"
              ? item.data?.tool_type
                ? imageToolResultNodeName("cancelled", imageToolLabel(item.data.tool_type))
                : generationOutputNodeName("cancelled")
              : item.name,
            data: {
              ...item.data,
              status: "cancelled",
              error: `${label}已中断`,
              last_run_error_detail: `${label}已中断`,
              stop_requested: true,
              updated_at: new Date().toISOString(),
            },
          }
        : item),
    }), true, `中断${label}`);
    if (taskIds.size > 0) {
      await Promise.allSettled(Array.from(taskIds).map((taskId) => cancelCreationTask(taskId)));
    }
    toast.info(`已请求中断${label}`);
  }, [applyPromptSplitBatch, stopLoopNode, updateCanvas]);

  useEffect(() => {
    const current = canvasRef.current;
    if (!current?.id) {
      return;
    }
    current.nodes
      .filter((item) => isGenerationNode(item) && item.data?.task_id && isActiveTask(item.data.status) && !hasLoopOutput(item) && !isLoopDrivenGenerator(current, item.id))
      .forEach((item) => {
        const outputIds = current.edges
          .filter((edge) => edge.source === item.id)
          .map((edge) => current.nodes.find((node) => node.id === edge.target))
          .filter((node): node is SmartCanvasItem => node?.type === "result")
          .map((node) => node.id);
      void pollTaskIntoGenerator(item.data?.task_id || "", item.id, outputIds);
      });
    current.nodes
      .filter((item) => item.type === "image_generation" && item.data?.prompt_split_batch_id && item.data?.prompt_split_execution_mode === "direct" && item.data?.task_id && item.data?.status === "success" && (item.data?.output?.images || []).length === 0)
      .forEach((item) => {
        const outputIds = current.edges
          .filter((edge) => edge.source === item.id)
          .map((edge) => current.nodes.find((node) => node.id === edge.target))
          .filter((node): node is SmartCanvasItem => node?.type === "result")
          .map((node) => node.id);
        void pollTaskIntoGenerator(item.data?.task_id || "", item.id, outputIds);
      });
    current.nodes
      .filter((item) => item.type === "llm" && item.data?.prompt_split_batch_id)
      .forEach((item) => {
        const batchId = item.data?.prompt_split_batch_id || "";
        const recoveryKey = `${current.id}:${item.id}:${batchId}`;
        if (promptSplitRecoveryRef.current.has(recoveryKey)) {
          return;
        }
        promptSplitRecoveryRef.current.add(recoveryKey);
        void pollPromptSplitBatch(batchId, item.id, true);
      });
    current.nodes
      .filter((item) => item.type === "llm" && item.data?.task_id && isActiveTask(item.data.status))
      .filter((item) => !item.data?.prompt_split_batch_id)
      .forEach((item) => {
        void pollTaskIntoLlmNode(item.data?.task_id || "", item.id);
      });
    current.nodes
      .filter((item) => item.type === "result" && item.data?.task_id && item.data?.tool_type && isActiveTask(item.data.status))
      .forEach((item) => {
        void pollTaskIntoToolResult(item.data?.task_id || "", item.id, imageToolLabel(item.data?.tool_type || "image_edit"));
      });
  }, [canvas, pollPromptSplitBatch, pollTaskIntoGenerator, pollTaskIntoLlmNode, pollTaskIntoToolResult]);

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

  const createNewCanvas = useCallback(async (presetId: SmartCanvasPresetId = "text-to-image") => {
    if (saveStateRef.current === "dirty" || saveStateRef.current === "error" || saveStateRef.current === "saving") {
      const saved = await flushSave();
      if (!saved && !window.confirm("当前画布保存失败，仍然新建吗？")) {
        return;
      }
    }
    applyCanvas(createSmartCanvasFromPreset(presetId));
    setCanvasPickerOpen(false);
    setCanvasPresetPickerOpen(false);
  }, [applyCanvas, flushSave]);

  const createCanvasFromUserPreset = useCallback(async (presetId: string) => {
    if (saveStateRef.current === "dirty" || saveStateRef.current === "error" || saveStateRef.current === "saving") {
      const saved = await flushSave();
      if (!saved && !window.confirm("当前画布保存失败，仍然新建吗？")) {
        return;
      }
    }
    const preset = userPresets.find((item) => item.id === presetId);
    if (!preset) {
      toast.error("预设不存在");
      return;
    }
    applyCanvas(createSmartCanvasFromUserPreset(preset));
    setCanvasPickerOpen(false);
    setCanvasPresetPickerOpen(false);
  }, [applyCanvas, flushSave, userPresets]);

  const saveCurrentCanvasAsPreset = useCallback((name: string) => {
    const current = canvasRef.current;
    const title = name.trim() || current?.name?.trim() || "我的画布预设";
    if (!current) {
      toast.error("当前没有可保存的画布");
      return;
    }
    const preset = createSmartCanvasUserPreset(current, title);
    setUserPresets((items) => {
      const next = [preset, ...items].slice(0, SMART_CANVAS_USER_PRESET_LIMIT);
      persistSmartCanvasUserPresets(next, userPresetScope());
      return next;
    });
    toast.success("已保存到我的预设");
  }, []);

  const deleteUserPreset = useCallback((presetId: string) => {
    setUserPresets((items) => {
      const next = items.filter((item) => item.id !== presetId);
      persistSmartCanvasUserPresets(next, userPresetScope());
      return next;
    });
    toast.success("已删除预设");
  }, []);

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

  const toggleMention = useCallback(() => {
    setMentionOpen((open) => !open);
  }, []);

  const deleteItem = useCallback((id: string) => {
    if (!id) {
      return;
    }
    updateCanvas((current) => ({
      ...current,
      nodes: current.nodes
        .filter((item) => item.id !== id)
        .map((item) => pruneGroupReferences(item, new Set([id]))),
      edges: current.edges.filter((edge) => edge.source !== id && edge.target !== id),
    }), true, "删除节点");
    const remainingSelection = selectedItemIdsRef.current.filter((itemId) => itemId !== id);
    const nextPrimary = selectedItemIdRef.current === id ? remainingSelection[0] || "" : selectedItemIdRef.current;
    selectedItemIdsRef.current = remainingSelection;
    selectedItemIdRef.current = nextPrimary;
    setSelectedItemIds(remainingSelection);
    setSelectedItemId(nextPrimary);
  }, [updateCanvas]);

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
      nodes: current.nodes
        .filter((item) => !deleteIds.has(item.id))
        .map((item) => pruneGroupReferences(item, deleteIds)),
      edges: current.edges.filter((edge) => !deleteIds.has(edge.source) && !deleteIds.has(edge.target)),
    }), true, ids.length > 1 ? "删除多个节点" : "删除节点");
    selectSingleItem("");
  }, [selectSingleItem, selectedItemId, selectedItemIds, updateCanvas]);

  const cleanupBlankNodes = useCallback(() => {
    const current = canvasRef.current;
    if (!current) {
      return;
    }
    const blankIds = new Set(blankSmartCanvasItemIds(current));
    if (blankIds.size === 0) {
      toast.info("没有可清理的空白节点");
      return;
    }
    updateCanvas((current) => ({
      ...current,
      nodes: current.nodes
        .filter((item) => !blankIds.has(item.id))
        .map((item) => pruneGroupReferences(item, blankIds)),
      edges: current.edges.filter((edge) => !blankIds.has(edge.source) && !blankIds.has(edge.target)),
    }), true, `清理 ${blankIds.size} 个空白节点`);
    setSelectedItemIds((ids) => ids.filter((id) => !blankIds.has(id)));
    setSelectedItemId((id) => blankIds.has(id) ? "" : id);
    toast.success(`已清理 ${blankIds.size} 个空白节点`);
  }, [updateCanvas]);

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
    }).map((item) => item.type === "group"
      ? {
          ...item,
          data: {
            ...item.data,
            group_item_ids: (item.data?.group_item_ids || []).map((memberId) => idMap.get(memberId) || memberId),
          },
        }
      : item);
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

  const addAssetToCanvas = useCallback((asset: ManagedImageSummary) => {
    addImagesToCanvas(managedImagesToRefs([asset]));
  }, [addImagesToCanvas]);

  const addAssetToComposer = useCallback((asset: ManagedImageSummary) => {
    addImagesToComposer(managedImagesToRefs([asset]));
  }, [addImagesToComposer]);

  const addVideoAssetToCanvas = useCallback((video: ManagedVideoAssetSummary) => {
    const rect = boardRef.current?.getBoundingClientRect();
    const world = rect
      ? screenToWorld({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, rect, viewportRef.current)
      : { x: 120, y: 120 };
    const offset = canvasItemCenterOffset("result");
    const item = createVideoItem(video, { x: world.x + offset.x, y: world.y + offset.y });
    updateCanvas((current) => ({ ...current, nodes: [...current.nodes, item] }), true, "添加视频资源");
    selectSingleItem(item.id);
  }, [selectSingleItem, updateCanvas]);

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
    activeTeam,
    assets: assetLibraryScope === "team" ? teamAssets : assets,
    videoAssets,
    assetSidebarActivated,
    assetLibraryScope,
    assetLibraryMediaType,
    assetLibraryTabs,
    assetCollections: activeAssetCollections,
    assetUnclassifiedCount: activeAssetUnclassifiedCount,
    activeAssetCollectionId,
    selectedItemId,
    selectedItemIds,
    activePromptSplitBatchId,
    selectedItem,
    blankNodeCount,
    viewport,
    tool,
    connectState,
    lightweightCanvasMedia,
    saveState,
    loading,
    saving,
    running,
    uploading,
    loadingAssets: assetLibraryScope === "team" ? loadingPublicAssets : loadingAssets,
    loadingMoreAssets: assetLibraryScope === "team" ? loadingMorePublicAssets : loadingMoreAssets,
    hasMoreAssets: assetLibraryScope === "team" ? hasMoreTeamAssets : hasMoreAssets,
    loadingVideoAssets,
    draggingImages,
    mentionOpen,
    mentionItems,
    imageEditorImage,
    imageEditorSourceItemId,
    imageEditorInitialMode,
    angleControlValues,
    angleControlPrompt,
    angleControlResultItem,
    selectedImageToolDisabledReason,
    canvasPickerOpen,
    canvasPresetPickerOpen,
    userPresets,
    runHistoryOpen,
    operationHistoryOpen,
    helpOpen,
    helpTopic,
    onboardingOpen,
    portMenuRequest,
    leftRailCollapsed,
    canUndo: canUndoSmartCanvasHistory(history),
    canRedo: canRedoSmartCanvasHistory(history),
    historyEntries,
    boardRef,
    uploadInputRef,
    setTool,
    setSelectedItemId,
    setActivePromptSplitBatchId,
    selectItem,
    setCanvasPickerOpen,
    setCanvasPresetPickerOpen,
    setRunHistoryOpen,
    setOperationHistoryOpen,
    setHelpOpen,
    setHelpTopic,
    setOnboardingOpen,
    setLeftRailCollapsed,
    setAssetLibraryScope: selectAssetLibraryScope,
    setAssetLibraryVideoActive,
    setAssetCollection: selectAssetCollection,
    undoCanvas,
    redoCanvas,
    restoreHistoryEntry,
    saveNow,
    loadAssets: refreshAssetLibrary,
    refreshAssets: refreshAssetLibrary,
    loadMoreAssets: loadMoreAssetLibrary,
    reloadCanvases,
    updateItemData,
    addNodeAt,
    addNodeFromPort,
    openCanvasHelp,
    openNodeHelp,
    dismissOnboarding,
    insertFlowTemplate,
    createNodeHelpTemplate,
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
    focusPromptSplitBatch,
    arrangePromptSplitBatch,
    deletePromptSplitBatchNodes,
    moveItemToScreenPoint,
    openImage,
    applyEditedImageFiles,
    setImageEditorImage,
    setImageEditorSourceItemId,
    setAngleControlValues,
    runDetailEnhanceSelected,
    runDetailEnhanceForItem,
    openBackgroundRemovalEditorForItem,
    openSelectedImageEditor,
    openImageEditorForItem,
    runAngleControlForImageEditor,
    runBackgroundRemovalForImageEditor,
    runLlmNode,
    runGeneratorNode,
    stopLoopNode,
    stopRunningNode,
    connectLlmImagesToGenerator,
    connectLlmImagesToLoop,
    selectCanvas,
    createNewCanvas,
    createCanvasFromUserPreset,
    saveCurrentCanvasAsPreset,
    deleteUserPreset,
    deleteCanvasById,
    renameCanvas,
    renameCanvasById,
    cleanupBlankNodes,
    deleteSelected,
    deleteItem,
    deleteImageFromItem,
    addAssetToCanvas,
    addAssetToComposer,
    addVideoAssetToCanvas,
    activateAssetSidebar,
    handleAssetSidebarExpandedChange,
    addMentionImageToPrompt,
    handleUploadInputChange,
    toggleMention,
    openUploadDialog: () => openUploadDialogAt(),
    openUploadDialogAt,
    stopDraggingImages: () => setDraggingImages(false),
  };
}
