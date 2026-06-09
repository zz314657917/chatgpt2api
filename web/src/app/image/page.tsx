"use client";

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useLocation } from "react-router-dom";
import { Globe2, History, ImagePlus, LoaderCircle, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { ImageComposer } from "@/app/image/components/image-composer";
import type { ImageLightboxItem } from "@/app/image/components/image-results";
import {
  CUSTOM_IMAGE_ASPECT_RATIO,
  DEFAULT_IMAGE_CUSTOM_HEIGHT,
  DEFAULT_IMAGE_CUSTOM_RATIO,
  DEFAULT_IMAGE_CUSTOM_WIDTH,
  IMAGE_ASPECT_RATIO_OPTIONS,
  IMAGE_RESOLUTION_OPTIONS,
  IMAGE_SIZE_MODE_OPTIONS,
  PIXEL_ICON_SIZE_OPTIONS,
  buildImageSize,
  formatImageSizeDisplay,
  getActiveImageAspectRatio,
  getImageSizeSelectionFromSize,
  getImageSizeRequirementLabel,
  isHighResolutionImageSize,
  isImageAspectRatio,
  isImageResolution,
  isImageSizeMode,
  isPixelIconSize,
  normalizeImageOutputCompression,
  parseImageRatio,
  type ImageAspectRatio,
  type ImageResolution,
  type ImageSizeMode,
  type ImageSizeSelection,
} from "@/lib/image-parameters";
import { IMAGE_PROMPT_PRESETS, type ImagePromptPreset } from "@/app/image/image-presets";
import type { BananaPrompt } from "@/app/image/banana-prompts";
import { consumeSimilarImageIntent } from "@/app/image/similar-image-intent";
import { ImageOutputControls } from "@/components/image-output-controls";
import { ManagedImageAssetDock } from "@/components/managed-image-asset-dock";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  cancelCreationTask,
  canvasModelHasCapability,
  CHAT_MODEL_OPTIONS,
  createChatCompletionTask,
  createImageEditTaskFromReferenceIds,
  createImageGenerationTask,
  DEFAULT_CHAT_MODEL,
  DEFAULT_IMAGE_MODEL,
  estimateImageBillingUnits,
  estimateImageDisplayPriceUSD,
  fetchCanvasModels,
  fetchCreationTasks,
  fetchManagedImages,
  fetchProfile,
  fetchTeamWorkspace,
  formatImageDisplayPriceCNY,
  IMAGE_CREATION_MODEL_OPTIONS,
  IMAGE_MODEL_ROUTE_DETAILS,
  isChatModel,
  isImageModel,
  modelIDLooksImageCapable,
  supportsImageOutputControls,
  supportsImageResolutionPresets,
  supportsStructuredImageParameters,
  type CanvasModelOption,
  uploadCreationTaskReferenceImage,
  updateManagedImageVisibility,
  type ImageModel,
  type CreationTask,
  type CreationTaskMessage,
  type FallbackReferenceImage,
  type ImageVisibility,
  type ManagedImageSummary,
} from "@/lib/api";
import {
  isImageOutputFormat,
  supportsImageOutputCompression,
  type ImageOutputFormat,
} from "@/lib/image-parameters";
import { fetchAuthenticatedImageBlob } from "@/lib/authenticated-image";
import { clearImageManagerCache } from "@/lib/image-manager-cache";
import { getManagedImagePathFromUrl, getManagedImageUrlFromPath } from "@/lib/image-path";
import { authSessionFromLoginResponse, setVerifiedAuthSession } from "@/lib/session";
import { useAppMeta } from "@/lib/use-app-meta";
import { cn } from "@/lib/utils";
import { useAuthGuard } from "@/lib/use-auth-guard";
import {
  ACTIVE_IMAGE_CONVERSATION_STORAGE_KEY,
  clearImageConversations,
  deleteImageConversation,
  getImageConversationStats,
  getImageTurnLoadingCounts,
  IMAGE_ACTIVE_CONVERSATION_REQUEST_EVENT,
  IMAGE_CONVERSATIONS_CHANGED_EVENT,
  listImageConversations,
  saveImageConversation,
  saveImageConversations,
  type ImageConversation,
  type ImageConversationMode,
  type ImageTurn,
  type ImageTurnStatus,
  type StoredImageSizeSelection,
  type StoredImage,
  type StoredReferenceImage,
} from "@/store/image-conversations";
import { hasAPIPermission } from "@/store/auth";
import {
  clearImageTurnProgress,
  getImageTurnProgressSnapshot,
  imageTurnStartedAtTimestamp,
  imageTurnProgressKey,
  setImageTurnProgress,
  subscribeImageTurnProgress,
  type ImageTurnProgress,
} from "@/store/image-turn-progress";

const ImagePromptMarket = lazy(() =>
  import("@/app/image/components/image-prompt-market").then((module) => ({ default: module.ImagePromptMarket })),
);
const ImageResults = lazy(() =>
  import("@/app/image/components/image-results").then((module) => ({ default: module.ImageResults })),
);
const ImageSidebar = lazy(() =>
  import("@/app/image/components/image-sidebar").then((module) => ({ default: module.ImageSidebar })),
);
const ImageLightbox = lazy(() =>
  import("@/components/image-lightbox").then((module) => ({ default: module.ImageLightbox })),
);
const COMPOSER_MODE_STORAGE_KEY = "chatgpt2api:image_composer_mode";
const IMAGE_MODEL_STORAGE_KEY = "chatgpt2api:image_last_model";
const CHAT_MODEL_STORAGE_KEY = "chatgpt2api:image_last_chat_model";
const IMAGE_SIZE_STORAGE_KEY = "chatgpt2api:image_last_size";
const IMAGE_SIZE_MODE_STORAGE_KEY = "chatgpt2api:image_last_size_mode";
const IMAGE_ASPECT_RATIO_STORAGE_KEY = "chatgpt2api:image_last_aspect_ratio";
const IMAGE_RESOLUTION_STORAGE_KEY = "chatgpt2api:image_last_resolution";
const IMAGE_CUSTOM_RATIO_STORAGE_KEY = "chatgpt2api:image_last_custom_ratio";
const IMAGE_CUSTOM_WIDTH_STORAGE_KEY = "chatgpt2api:image_last_custom_width";
const IMAGE_CUSTOM_HEIGHT_STORAGE_KEY = "chatgpt2api:image_last_custom_height";
const IMAGE_OUTPUT_FORMAT_STORAGE_KEY = "chatgpt2api:image_last_output_format";
const IMAGE_OUTPUT_COMPRESSION_STORAGE_KEY = "chatgpt2api:image_last_output_compression";
const QUOTA_REFRESH_EVENT = "chatgpt2api:quota-refresh";
const DEFAULT_IMAGE_OUTPUT_FORMAT: ImageOutputFormat = "png";
const AI_BACKGROUND_REMOVAL_PROMPT = "AI 抠图：自动识别图片中的主要主体，移除背景并输出透明背景 PNG。保持主体形状、纹理、颜色和像素细节，避免新增或重绘无关内容。注意：这是 AI 编辑，可能会重绘图片内容。";
const REFERENCE_IMAGE_MAX_SIDE = 2048;
const REFERENCE_IMAGE_JPEG_QUALITY = 0.86;
const IMAGE_ASSET_PAGE_SIZE = 50;
const IMAGE_ASSET_SIDEBAR_STORAGE_PREFIX = "image-composer-asset-sidebar";
const PROMPT_MARKET_REFERENCE_IMAGE_LIMIT = 4;
const activeConversationQueueIds = new Set<string>();
const EMPTY_IMAGE_ASPECT_RATIO_SELECT_VALUE = "__empty_aspect_ratio__";
const MISSING_RECOVERABLE_TASK_ID_ERROR = "页面刷新或任务中断，未找到可恢复的任务 ID";
const HIDDEN_IMAGE_MODEL_VALUES = new Set(["codex-gpt-image-2"]);

type ComposerMode = "chat" | "image";

type EditingTurnDraft = {
  conversationId: string;
  turnId: string;
  prompt: string;
  model: ImageModel;
  mode: ImageConversationMode;
  count: string;
  sizeMode: ImageSizeMode;
  aspectRatio: ImageAspectRatio;
  resolution: ImageResolution;
  customRatio: string;
  customWidth: string;
  customHeight: string;
  outputFormat: ImageOutputFormat;
  outputCompression: string;
  visibility: ImageVisibility;
  referenceImages: StoredReferenceImage[];
};

type PublishImageTarget = {
  conversationId: string;
  turnId: string;
  imageIndex: number;
};

type BackgroundRemovalDraft = {
  conversationId: string | null;
  image: StoredReferenceImage;
  prompt: string;
};

type PublishRecipeOptions = {
  sharePromptParameters: boolean;
  shareReferenceImages: boolean;
};

type ImageModelMenuOption = { value: ImageModel; label: string };

type CreationTaskDataItem = NonNullable<CreationTask["data"]>[number];

function getInitialAssetSidebarActivated() {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(`${IMAGE_ASSET_SIDEBAR_STORAGE_PREFIX}-pinned`) === "1";
}

function ImageLazyLoading({ label, className }: { label: string; className?: string }) {
  return (
    <div className={cn("flex min-h-14 items-center justify-center gap-2 text-xs text-stone-500", className)}>
      <LoaderCircle className="size-4 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

function ImageOverlayLoading({ label }: { label: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-[1px]">
      <div className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white/95 px-3 py-2 text-xs text-stone-500 shadow-sm">
        <LoaderCircle className="size-4 animate-spin" />
        <span>{label}</span>
      </div>
    </div>
  );
}

function isKnownChatOnlyModel(value: unknown) {
  return typeof value === "string" && CHAT_MODEL_OPTIONS.some((option) => option.value === value) && !modelIDLooksImageCapable(value);
}

function buildConversationTitle(prompt: string) {
  const trimmed = prompt.trim();
  if (trimmed.length <= 12) {
    return trimmed;
  }
  return `${trimmed.slice(0, 12)}...`;
}

function formatConversationTime(value: string) {
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

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("读取参考图失败"));
    reader.readAsDataURL(file);
  });
}

function blobToFile(blob: Blob, name: string) {
  return new File([blob], name, { type: blob.type || "image/png", lastModified: Date.now() });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("压缩参考图失败"));
        return;
      }
      resolve(blob);
    }, type, quality);
  });
}

async function compressReferenceImage(file: File) {
  const originalSize = file.size;
  if (typeof createImageBitmap !== "function") {
    return { file, originalSize, compressedSize: file.size };
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { file, originalSize, compressedSize: file.size };
  }
  try {
    const width = bitmap.width;
    const height = bitmap.height;
    const scale = Math.min(1, REFERENCE_IMAGE_MAX_SIDE / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    const shouldKeepPNG = file.type === "image/png";
    const outputType = shouldKeepPNG ? "image/png" : "image/jpeg";
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      return { file, originalSize, compressedSize: file.size };
    }
    context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    const blob = await canvasToBlob(canvas, outputType, outputType === "image/jpeg" ? REFERENCE_IMAGE_JPEG_QUALITY : undefined);
    if (blob.size >= file.size) {
      return { file, originalSize, compressedSize: file.size };
    }
    const nextName = outputType === "image/jpeg"
      ? `${file.name.replace(/\.[^.]+$/, "") || "reference"}.jpg`
      : file.name;
    const compressed = blobToFile(blob, nextName);
    return { file: compressed, originalSize, compressedSize: compressed.size };
  } finally {
    bitmap.close();
  }
}

async function buildStoredReferenceImageFromFile(file: File): Promise<StoredReferenceImage> {
  const compressed = await compressReferenceImage(file);
  return {
    name: compressed.file.name || file.name || "reference.png",
    type: compressed.file.type || file.type || "image/png",
    dataUrl: await readFileAsDataUrl(compressed.file),
    source: "upload",
    clientReferenceId: createId(),
    uploadStatus: "pending",
    originalSize: compressed.originalSize,
    compressedSize: compressed.compressedSize,
  };
}

function dataUrlToFile(dataUrl: string, fileName: string, mimeType?: string) {
  const [header, content] = dataUrl.split(",", 2);
  const matchedMimeType = header.match(/data:(.*?);base64/)?.[1];
  const binary = atob(content || "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new File([bytes], fileName, { type: mimeType || matchedMimeType || "image/png" });
}

function referenceImageClientId(conversationId: string, turnId: string, image: StoredReferenceImage, index: number) {
  return image.clientReferenceId || `${conversationId}:${turnId}:${index}:${image.name || "reference"}`;
}

function referenceImageUploadFile(image: StoredReferenceImage, turnId: string, index: number) {
  return dataUrlToFile(image.dataUrl, image.name || `${turnId}-${index + 1}.png`, image.type);
}

function imageFileExtensionForOutputFormat(format?: ImageOutputFormat) {
  return format === "jpeg" ? "jpg" : format || "png";
}

function buildAiBackgroundRemovalPrompt(instruction: string) {
  const trimmed = instruction.trim();
  if (!trimmed) {
    return AI_BACKGROUND_REMOVAL_PROMPT;
  }
  return `${AI_BACKGROUND_REMOVAL_PROMPT}\n用户补充要求：${trimmed}`;
}

function imageMimeTypeForOutputFormat(format?: ImageOutputFormat) {
  return format === "jpeg" ? "image/jpeg" : `image/${format || "png"}`;
}

function buildReferenceImageFromResult(image: StoredImage, fileName: string): StoredReferenceImage | null {
  if (!image.b64_json) {
    return null;
  }
  const mimeType = imageMimeTypeForOutputFormat(image.outputFormat);

  return {
    name: fileName,
    type: mimeType,
    dataUrl: `data:${mimeType};base64,${image.b64_json}`,
    clientReferenceId: createId(),
    uploadStatus: "pending",
  } satisfies StoredReferenceImage;
}

async function fetchImageAsFile(url: string, fileName: string) {
  let blob: Blob;
  try {
    blob = await fetchAuthenticatedImageBlob(url);
  } catch (error) {
    if (error instanceof TypeError && /fetch/i.test(error.message)) {
      throw new Error("读取图片失败：浏览器无法访问原图，请刷新页面后重试");
    }
    throw error;
  }
  return new File([blob], fileName, { type: blob.type || "image/png" });
}

function buildReferenceFileName(url: string, index: number, fallbackPrefix: string) {
  const path = url.split(/[?#]/, 1)[0] || "";
  const rawName = path.split("/").filter(Boolean).pop() || "";
  let name = rawName;
  try {
    name = rawName ? decodeURIComponent(rawName) : "";
  } catch {
    name = rawName;
  }
  if (name) {
    return name.includes(".") ? name : `${name}.png`;
  }
  return `${fallbackPrefix}-${index + 1}.png`;
}

async function buildReferenceImageFromUrl(
  url: string,
  index: number,
  fallbackPrefix: string,
): Promise<StoredReferenceImage> {
  const file = await fetchImageAsFile(url, buildReferenceFileName(url, index, fallbackPrefix));
  return {
    name: file.name,
    type: file.type || "image/png",
    dataUrl: await readFileAsDataUrl(file),
    source: "upload",
    clientReferenceId: createId(),
    uploadStatus: "pending",
    originalSize: file.size,
    compressedSize: file.size,
  };
}

function reusableOutputCompressionValue(value: unknown, outputFormat: ImageOutputFormat) {
  if (!supportsImageOutputCompression(outputFormat)) {
    return "";
  }
  const compression = Number(value);
  if (!Number.isFinite(compression)) {
    return "";
  }
  return String(Math.min(100, Math.max(0, Math.round(compression))));
}

async function buildReferenceImageFromStoredImage(
  image: StoredImage,
  fileName: string,
): Promise<{ referenceImage: StoredReferenceImage; file: File } | null> {
  const direct = buildReferenceImageFromResult(image, fileName);
  if (direct) {
    return {
      referenceImage: direct,
      file: dataUrlToFile(direct.dataUrl, direct.name, direct.type),
    };
  }

  const referenceUrls = Array.from(new Set([image.localUrl, image.url].filter((value): value is string => Boolean(value))));
  if (referenceUrls.length === 0) {
    return null;
  }
  let file: File | null = null;
  let lastError: unknown = null;
  for (const referenceUrl of referenceUrls) {
    try {
      file = await fetchImageAsFile(referenceUrl, fileName);
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!file) {
    throw lastError instanceof Error ? lastError : new Error("读取图片失败");
  }
  const referenceImage: StoredReferenceImage = {
    name: file.name,
    type: file.type || "image/png",
    dataUrl: await readFileAsDataUrl(file),
    clientReferenceId: createId(),
    uploadStatus: "pending",
    originalSize: file.size,
    compressedSize: file.size,
  };
  return {
    referenceImage,
    file,
  };
}

const IMAGE_TASK_IMAGE_COUNT = 10;

function normalizeRequestedImageCount(value: string | number) {
  return Math.max(1, Math.min(10, Number(value) || 1));
}

function isInvalidCustomRatioSelection(sizeMode: ImageSizeMode, aspectRatio: ImageAspectRatio, customRatio: string) {
  return sizeMode === "ratio" && aspectRatio === CUSTOM_IMAGE_ASPECT_RATIO && !parseImageRatio(customRatio);
}

function imagePriceSizeFromRequest(size: string) {
  const trimmed = size.trim();
  switch (trimmed) {
    case "1:1":
      return "1024x1024";
    case "2:3":
      return "1024x1536";
    case "3:2":
      return "1536x1024";
    case "16:9":
      return "1536x864";
    case "9:16":
      return "864x1536";
    default:
      return trimmed || "default";
  }
}

function effectiveImageSizeSelection(model: ImageModel, selection: ImageSizeSelection): ImageSizeSelection {
  const normalizedSelection = isPixelIconSize(selection.aspectRatio)
    ? {
        ...selection,
        resolution: "auto" as const,
      }
    : selection;
  if (supportsStructuredImageParameters(model)) {
    return normalizedSelection;
  }
  if (normalizedSelection.mode !== "ratio") {
    return {
      ...normalizedSelection,
      mode: "auto",
      resolution: "auto",
    };
  }
  if (supportsImageResolutionPresets(model)) {
    return normalizedSelection;
  }
  return {
    ...normalizedSelection,
    resolution: "auto",
  };
}

function hasPixelIconAspectRatio(selection: { aspectRatio?: unknown } | undefined) {
  return isPixelIconSize(selection?.aspectRatio);
}

function buildEffectiveImageSizeRequest(model: ImageModel, selection: ImageSizeSelection) {
  const effectiveSelection = effectiveImageSizeSelection(model, selection);
  const sizeSelection = supportsStructuredImageParameters(model)
    ? effectiveSelection
    : {
        ...effectiveSelection,
        resolution: "auto" as const,
      };
  return {
    selection: effectiveSelection,
    size: buildImageSize(sizeSelection),
  };
}

function imageResolutionPresetForModel(model: ImageModel, selection: { aspectRatio?: unknown; resolution?: unknown } | undefined) {
  if (hasPixelIconAspectRatio(selection)) {
    return undefined;
  }
  const resolution = isImageResolution(selection?.resolution) ? selection.resolution : "auto";
  return supportsImageResolutionPresets(model) && resolution !== "auto" ? resolution : undefined;
}

function imageResolutionPresetLabel(resolution: string | undefined) {
  switch (resolution) {
    case "1080p":
      return "1K";
    case "2k":
      return "2K";
    case "4k":
      return "4K";
    default:
      return "";
  }
}

function formatImageRequestTargetLabel(size: string, resolution?: string) {
  const resolutionLabel = imageResolutionPresetLabel(resolution);
  const sizeLabel = size ? formatImageSizeDisplay(size) : "";
  if (resolutionLabel && sizeLabel) {
    return `${resolutionLabel} / ${sizeLabel}`;
  }
  return resolutionLabel || sizeLabel || "当前设置";
}

function isHighResolutionImageRequest(size: string, resolution?: string) {
  return resolution === "2k" || resolution === "4k" || isHighResolutionImageSize(size);
}

function imageOutputFormatForModel(model: ImageModel, format: ImageOutputFormat) {
  return supportsImageOutputControls(model) ? format : undefined;
}

function imageOutputCompressionForModel(model: ImageModel, format: ImageOutputFormat, value: unknown) {
  if (!supportsImageOutputControls(model)) {
    return undefined;
  }
  return imageOutputCompressionForFormat(format, value);
}

function managedImageReferenceUrl(item: ManagedImageSummary) {
  return item.path ? getManagedImageUrlFromPath(item.path) : item.preview_url || item.thumbnail_url || "";
}

function managedImageFileName(item: ManagedImageSummary) {
  if (item.name) {
    return item.name;
  }
  const rawName = item.path.split("/").filter(Boolean).pop() || "";
  try {
    return decodeURIComponent(rawName) || "library-reference.png";
  } catch {
    return rawName || "library-reference.png";
  }
}

async function buildReferenceImageFromManagedImage(item: ManagedImageSummary): Promise<StoredReferenceImage> {
  const url = managedImageReferenceUrl(item);
  if (!url) {
    throw new Error("未找到可读取的图片地址");
  }
  const file = await fetchImageAsFile(url, managedImageFileName(item));
  return {
    name: file.name,
    type: file.type || "image/png",
    dataUrl: await readFileAsDataUrl(file),
    source: "upload",
    clientReferenceId: createId(),
    uploadStatus: "pending",
    originalSize: file.size,
    compressedSize: file.size,
  };
}

function positiveDimension(value: unknown) {
  const dimension = Number(value);
  return Number.isFinite(dimension) && dimension > 0 ? Math.round(dimension) : undefined;
}

function normalizeOutputCompressionValue(value: unknown): number | undefined {
  return normalizeImageOutputCompression(value);
}

function imageOutputCompressionForFormat(format: ImageOutputFormat, value: unknown) {
  if (!supportsImageOutputCompression(format)) {
    return undefined;
  }
  return normalizeOutputCompressionValue(value);
}

function formatHighResolutionHint(canInspectAccounts: boolean) {
  return canInspectAccounts
    ? "Codex 结构化高分辨率参数不会在本地预拦截，会直接提交给上游；上游会按账号能力判断或返回错误。"
    : "Codex 结构化高分辨率参数会直接提交给上游；上游会按账号能力判断或返回错误。";
}

function imageTaskProgressMessage(turn: ImageTurn, elapsedSeconds = 0) {
  if (turn.status === "queued") {
    return turn.mode === "chat"
      ? {
          message: "正在思考",
          detail: "对话任务已入队，等待模型回复",
        }
      : {
          message: "等待创作并发额度",
          detail: "图片任务已入队，等待可用额度",
        };
  }

  if (turn.mode === "chat") {
    return {
      message: "等待对话回复",
      detail: "对话任务处理中",
    };
  }

  const route = IMAGE_MODEL_ROUTE_DETAILS[turn.model];
  const isHighResolution = isHighResolutionImageRequest(turn.size, imageResolutionPresetForModel(turn.model, turn.sizeSelection));
  void elapsedSeconds;
  if (isHighResolution) {
    return {
      message: "高分辨率生成中",
      detail: `${getImageSizeRequirementLabel(turn.size)}，后端已提交给上游等待结果`,
    };
  }
  return {
    message: route ? `${route.routeLabel}生成中` : "等待生成结果",
    detail: "后端正在轮询任务状态",
  };
}

function imageTaskLoadingDetail(turn: ImageTurn, fallbackDetail: string) {
  const counts = getImageTurnLoadingCounts(turn);
  if (turn.mode === "chat") {
    return fallbackDetail;
  }
  if (counts.queued > 0) {
    return `${fallbackDetail}；还有 ${counts.queued} 张图片排队中`;
  }
  if (counts.running > 0) {
    return `${fallbackDetail}；还有 ${counts.running} 张图片处理中`;
  }
  return "图片结果已返回，正在确认任务状态";
}

function imageTaskBatchId(turnId: string, imageIndex: number) {
  return `${turnId}-task-${Math.floor(imageIndex / IMAGE_TASK_IMAGE_COUNT)}`;
}

function imageTaskIdForImage(turnId: string, images: StoredImage[], imageIndex: number) {
  return images[imageIndex]?.taskId || imageTaskBatchId(turnId, imageIndex);
}

function imageDataIndexForTask(images: StoredImage[], imageIndex: number) {
  const taskId = images[imageIndex]?.taskId || images[imageIndex]?.id;
  if (!taskId) {
    return 0;
  }
  return images.slice(0, imageIndex + 1).filter((image) => (image.taskId || image.id) === taskId).length - 1;
}

const STORED_IMAGE_FIELDS: Array<keyof StoredImage> = [
  "id",
  "taskId",
  "taskStatus",
  "status",
  "path",
  "visibility",
  "b64_json",
  "url",
  "localUrl",
  "width",
  "height",
  "resolution",
  "outputFormat",
  "revised_prompt",
  "error",
  "text_response",
];

function updateStoredImage(image: StoredImage, updates: Partial<StoredImage>): StoredImage {
  const next = { ...image, ...updates };
  return STORED_IMAGE_FIELDS.every((field) => image[field] === next[field]) ? image : next;
}

function hasStoredImageOutput(image: StoredImage) {
  return Boolean(image.b64_json || image.url || image.localUrl || image.path);
}

function isRetryableImageResult(image: StoredImage) {
  return image.status === "error" || image.status === "message" || (image.status === "success" && !hasStoredImageOutput(image));
}

function creationTaskImageStatus(task: CreationTask, dataIndex = 0): "queued" | "running" | "success" | "error" | "cancelled" | undefined {
  const outputStatus = task.output_statuses?.[dataIndex];
  if (outputStatus === "queued" || outputStatus === "running" || outputStatus === "success" || outputStatus === "error" || outputStatus === "cancelled") {
    return outputStatus;
  }
  if (task.status === "queued" || task.status === "running" || task.status === "success" || task.status === "error" || task.status === "cancelled") {
    return task.status;
  }
  return undefined;
}

function taskDataToStoredImage(image: StoredImage, task: CreationTask, dataIndex = 0, fallbackVisibility?: ImageVisibility): StoredImage {
  const taskVisibility = task.visibility || fallbackVisibility || image.visibility || "private";
  const successUpdates = (item: CreationTaskDataItem) => {
    const width = positiveDimension(item.width);
    const height = positiveDimension(item.height);
    const localUrl = item.local_url || image.localUrl;
    const imageUrl = item.url || localUrl;
    return {
      taskId: task.id,
      taskStatus: "success" as const,
      status: "success" as const,
      b64_json: item.b64_json,
      url: imageUrl,
      localUrl,
      path: localUrl || imageUrl ? getManagedImagePathFromUrl(localUrl || imageUrl || "") || image.path : image.path,
      visibility: taskVisibility,
      width,
      height,
      resolution: item.resolution || (width && height ? `${width}x${height}` : image.resolution),
      outputFormat: item.output_format || task.output_format || image.outputFormat,
      revised_prompt: item.revised_prompt,
      text_response: undefined,
      error: undefined,
    };
  };
  if (task.status === "success") {
    if (task.output_type === "text") {
      return updateStoredImage(image, {
        taskId: task.id,
        taskStatus: "success",
        status: "message",
        text_response: task.data?.[dataIndex]?.text_response || task.error || "",
        b64_json: undefined,
        url: undefined,
        localUrl: undefined,
        path: undefined,
        visibility: undefined,
        revised_prompt: undefined,
        error: undefined,
      });
    }
    const item = task.data?.[dataIndex];
    if (!item?.b64_json && !item?.url && !item?.local_url) {
      if (dataIndex > 0 && image.taskId !== image.id) {
        const slotStatus = creationTaskImageStatus(task, dataIndex);
        if (slotStatus === "error" || slotStatus === "cancelled") {
          return updateStoredImage(image, {
            taskId: task.id,
            taskStatus: slotStatus,
            status: slotStatus === "cancelled" ? "cancelled" : "error",
            error: slotStatus === "cancelled" ? task.error || "任务已终止" : formatCreationTaskErrorMessage(task.error || "生成失败"),
          });
        }
        return updateStoredImage(image, {
          taskId: image.id,
          taskStatus: "queued",
          status: "loading",
          error: undefined,
        });
      }
      return updateStoredImage(image, {
        taskId: task.id,
        taskStatus: "success",
        status: "error",
        error: `未返回第 ${dataIndex + 1} 张图片数据`,
      });
    }
    return updateStoredImage(image, successUpdates(item));
  }

  if (task.status === "queued" || task.status === "running") {
    const item = task.data?.[dataIndex];
    if (item?.b64_json || item?.url || item?.local_url) {
      return updateStoredImage(image, successUpdates(item));
    }
    return updateStoredImage(image, {
      taskId: task.id,
      taskStatus: creationTaskImageStatus(task, dataIndex) || (task.status === "queued" ? "queued" : "running"),
      status: "loading",
      text_response: undefined,
      error: undefined,
    });
  }

  if (task.status === "error") {
    if (task.output_type === "text") {
      return updateStoredImage(image, {
        taskId: task.id,
        taskStatus: "success",
        status: "message",
        text_response: task.error || "",
        b64_json: undefined,
        url: undefined,
        localUrl: undefined,
        path: undefined,
        visibility: undefined,
        revised_prompt: undefined,
        error: undefined,
      });
    }
    const item = task.data?.[dataIndex];
    if (item?.b64_json || item?.url || item?.local_url) {
      return updateStoredImage(image, successUpdates(item));
    }
    return updateStoredImage(image, {
      taskId: task.id,
      taskStatus: undefined,
      status: "error",
      text_response: undefined,
      error: formatCreationTaskErrorMessage(task.error || "生成失败"),
    });
  }

  if (task.status === "cancelled") {
    const item = task.data?.[dataIndex];
    if (item?.b64_json || item?.url || item?.local_url) {
      return updateStoredImage(image, successUpdates(item));
    }
    return updateStoredImage(image, {
      taskId: task.id,
      taskStatus: undefined,
      status: "cancelled",
      error: task.error || "任务已终止",
    });
  }

  return updateStoredImage(image, {
    taskId: task.id,
    taskStatus: creationTaskImageStatus(task, dataIndex) || "queued",
    status: "loading",
    text_response: undefined,
    error: undefined,
  });
}

function isActiveCreationTask(task: CreationTask) {
  return task.status === "queued" || task.status === "running";
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function pickFallbackConversationId(conversations: ImageConversation[]) {
  const activeConversation = conversations.find((conversation) =>
    conversation.turns.some((turn) => turn.status === "queued" || turn.status === "generating"),
  );
  return activeConversation?.id ?? conversations[0]?.id ?? null;
}

function sortImageConversations(conversations: ImageConversation[]) {
  return [...conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function getStoredImageModel(): ImageModel {
  if (typeof window === "undefined") {
    return DEFAULT_IMAGE_MODEL;
  }
  const storedModel = window.localStorage.getItem(IMAGE_MODEL_STORAGE_KEY);
  return isImageModel(storedModel) && !isKnownChatOnlyModel(storedModel) && !HIDDEN_IMAGE_MODEL_VALUES.has(storedModel)
    ? storedModel
    : DEFAULT_IMAGE_MODEL;
}

function getStoredChatModel(): ImageModel {
  if (typeof window === "undefined") {
    return DEFAULT_CHAT_MODEL;
  }
  const storedModel = window.localStorage.getItem(CHAT_MODEL_STORAGE_KEY);
  return isChatModel(storedModel) && !modelIDLooksImageCapable(storedModel) && !HIDDEN_IMAGE_MODEL_VALUES.has(storedModel)
    ? storedModel
    : DEFAULT_CHAT_MODEL;
}

function getStoredComposerMode(): ComposerMode {
  if (typeof window === "undefined") {
    return "image";
  }
  return window.localStorage.getItem(COMPOSER_MODE_STORAGE_KEY) === "chat" ? "chat" : "image";
}

function getStoredImageSizeSelection(): ImageSizeSelection {
  if (typeof window === "undefined") {
    return getImageSizeSelectionFromSize("");
  }
  const fallbackSelection = getImageSizeSelectionFromSize(window.localStorage.getItem(IMAGE_SIZE_STORAGE_KEY) || "");
  const storedSizeMode = window.localStorage.getItem(IMAGE_SIZE_MODE_STORAGE_KEY);
  const storedAspectRatio = window.localStorage.getItem(IMAGE_ASPECT_RATIO_STORAGE_KEY) || "";
  const storedResolution = window.localStorage.getItem(IMAGE_RESOLUTION_STORAGE_KEY);
  const customRatio = window.localStorage.getItem(IMAGE_CUSTOM_RATIO_STORAGE_KEY) || fallbackSelection.customRatio;
  const customWidth = window.localStorage.getItem(IMAGE_CUSTOM_WIDTH_STORAGE_KEY) || fallbackSelection.customWidth;
  const customHeight = window.localStorage.getItem(IMAGE_CUSTOM_HEIGHT_STORAGE_KEY) || fallbackSelection.customHeight;
  if (isImageSizeMode(storedSizeMode) && isImageAspectRatio(storedAspectRatio) && isImageResolution(storedResolution)) {
    return {
      mode: storedSizeMode,
      aspectRatio: storedAspectRatio,
      resolution: isPixelIconSize(storedAspectRatio) ? "auto" : storedResolution,
      customRatio,
      customWidth,
      customHeight,
    };
  }
  return fallbackSelection;
}

function getStoredImageOutputFormat(): ImageOutputFormat {
  if (typeof window === "undefined") {
    return DEFAULT_IMAGE_OUTPUT_FORMAT;
  }
  const storedFormat = window.localStorage.getItem(IMAGE_OUTPUT_FORMAT_STORAGE_KEY);
  return isImageOutputFormat(storedFormat) ? storedFormat : DEFAULT_IMAGE_OUTPUT_FORMAT;
}

function getStoredImageOutputCompression(): string {
  if (typeof window === "undefined") {
    return "";
  }
  const normalized = normalizeOutputCompressionValue(window.localStorage.getItem(IMAGE_OUTPUT_COMPRESSION_STORAGE_KEY));
  return normalized === undefined ? "" : String(normalized);
}

function serializeImageSizeSelection(selection: ImageSizeSelection): StoredImageSizeSelection {
  return {
    mode: selection.mode,
    aspectRatio: selection.aspectRatio,
    resolution: isPixelIconSize(selection.aspectRatio) ? "auto" : selection.resolution,
    customRatio: selection.customRatio,
    customWidth: selection.customWidth,
    customHeight: selection.customHeight,
  };
}

function restoreImageSizeSelection(stored: StoredImageSizeSelection | undefined, fallbackSize: string): ImageSizeSelection {
  const fallbackSelection = getImageSizeSelectionFromSize(fallbackSize);
  if (!stored) {
    return fallbackSelection;
  }
  return {
    mode: isImageSizeMode(stored.mode) ? stored.mode : fallbackSelection.mode,
    aspectRatio: isImageAspectRatio(stored.aspectRatio) ? stored.aspectRatio : fallbackSelection.aspectRatio,
    resolution: isPixelIconSize(stored.aspectRatio)
      ? "auto"
      : isImageResolution(stored.resolution)
        ? stored.resolution
        : fallbackSelection.resolution,
    customRatio: stored.customRatio || fallbackSelection.customRatio,
    customWidth: stored.customWidth || fallbackSelection.customWidth,
    customHeight: stored.customHeight || fallbackSelection.customHeight,
  };
}

function buildTurnOutcomeMessage(successCount: number, failedCount: number, cancelledCount: number) {
  const parts = [`成功 ${successCount} 张`];
  if (failedCount > 0) {
    parts.push(`失败 ${failedCount} 张`);
  }
  if (cancelledCount > 0) {
    parts.push(`终止 ${cancelledCount} 张`);
  }
  return parts.join("，");
}

function formatCreationTaskErrorMessage(message: string) {
  const trimmed = String(message || "").trim();
  if (!trimmed) {
    return "生成图片失败";
  }

  const normalized = trimmed.toLowerCase();
  if (normalized.includes("user balance insufficient")) {
    return "用户余额不足";
  }
  if (normalized.includes("user quota exceeded")) {
    return "用户配额不足";
  }
  if (normalized.includes("an error occurred while processing your request")) {
    const requestId = trimmed.match(/request id\s+([a-z0-9-]+)/i)?.[1];
    return [
      "上游处理图片请求失败，可能是提示词内容过多、账号能力限制或当前图片链路繁忙。",
      "建议减少提示词内容，或稍后重试；Codex 结构化高分辨率请求可降低尺寸后再试。",
      requestId ? `请求 ID：${requestId}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (normalized.includes("no images generated") && normalized.includes("model may have refused")) {
    return "没有生成图片，模型可能检测到敏感内容并拒绝了这次请求，请调整提示词后重试。";
  }
  if (normalized.includes("timed out waiting for async image generation")) {
    return "图片生成等待超时，建议稍后重试；如果使用 Codex 结构化高分辨率参数，可降低尺寸后再试。";
  }
  if (normalized.includes("no available image quota")) {
    return "当前没有可用的图片额度，请检查账号额度或稍后重试。";
  }

  return trimmed;
}

function formatCreationTaskError(error: unknown, fallback = "生成图片失败") {
  return formatCreationTaskErrorMessage(error instanceof Error ? error.message : String(error || fallback));
}

function hasEnoughBilling(session: NonNullable<ReturnType<typeof useAuthGuard>["session"]>, estimated: number) {
  if (session.provider === "sub2api") {
    return true;
  }
  const billing = session.billing;
  return !billing || billing.unlimited || Math.max(0, Number(billing.available) || 0) >= estimated;
}

function imageBillingEstimate(model: ImageModel, count: number, sizeOrResolution: string) {
  const estimatedPrice = estimateImageDisplayPriceUSD(model, count, sizeOrResolution, "auto");
  return {
    price: estimatedPrice,
    units: estimateImageBillingUnits(model, count, sizeOrResolution, "auto"),
  };
}

function deriveTurnStatus(turn: ImageTurn): Pick<ImageTurn, "status" | "error"> {
  const loadingCounts = getImageTurnLoadingCounts(turn);
  const failedCount = turn.images.filter((image) => image.status === "error").length;
  const successCount = turn.images.filter((image) => image.status === "success").length;
  const cancelledCount = turn.images.filter((image) => image.status === "cancelled").length;
  const messageCount = turn.images.filter((image) => image.status === "message").length;
  if (loadingCounts.running > 0) {
    return { status: "generating", error: undefined };
  }
  if (loadingCounts.queued > 0) {
    return { status: "queued", error: undefined };
  }
  if (failedCount > 0) {
    return { status: "error", error: buildTurnOutcomeMessage(successCount, failedCount, cancelledCount) };
  }
  if (cancelledCount > 0) {
    return { status: "cancelled", error: buildTurnOutcomeMessage(successCount, failedCount, cancelledCount) };
  }
  if (successCount > 0) {
    return { status: "success", error: undefined };
  }
  if (messageCount > 0) {
    return { status: "message", error: undefined };
  }
  return { status: "queued", error: undefined };
}

function deriveTurnStatusFromTaskMap(turn: ImageTurn, images: StoredImage[]): Pick<ImageTurn, "status" | "error"> {
  return deriveTurnStatus({ ...turn, images });
}

function isTurnInProgress(turn: ImageTurn) {
  return (
    turn.status === "queued" ||
    turn.status === "generating" ||
    turn.images.some((image) => image.status === "loading")
  );
}

function usesReferenceImages(mode: ImageConversationMode) {
  return mode === "image" || mode === "edit";
}

function isMissingBatchImageDataError(error?: string) {
  return typeof error === "string" && error.startsWith("未返回第 ") && error.endsWith(" 张图片数据");
}

function isMissingRecoverableTaskIdError(error?: string) {
  return error === MISSING_RECOVERABLE_TASK_ID_ERROR;
}

function getComposerConversationMode(composerMode: ComposerMode, referenceImages: StoredReferenceImage[]): ImageConversationMode {
  if (composerMode === "chat") {
    return "chat";
  }
  if (referenceImages.length === 0) {
    return "generate";
  }
  return referenceImages.some((image) => image.source === "conversation") ? "edit" : "image";
}

function modelMenuOption(model: CanvasModelOption): ImageModelMenuOption {
  return { value: model.id, label: model.name || model.id };
}

function hasMenuOption(options: readonly ImageModelMenuOption[], value: string) {
  return options.some((option) => option.value === value);
}

function mergeImageModelOptions(
  remoteOptions: ImageModelMenuOption[],
  localOptions: readonly ImageModelMenuOption[],
  selectedModel: ImageModel,
  mode: ComposerMode,
  preferRemoteOnly = false,
) {
  const seen = new Set<string>();
  const merged: ImageModelMenuOption[] = [];
  const options = preferRemoteOnly && remoteOptions.length > 0 ? remoteOptions : [...remoteOptions, ...localOptions];
  for (const option of options) {
    if (!option.value || seen.has(option.value) || HIDDEN_IMAGE_MODEL_VALUES.has(option.value)) {
      continue;
    }
    seen.add(option.value);
    merged.push(option);
  }
  const canKeepSelectedModel = !(preferRemoteOnly && remoteOptions.length > 0);
  if (
    canKeepSelectedModel &&
    selectedModel &&
    !seen.has(selectedModel) &&
    !HIDDEN_IMAGE_MODEL_VALUES.has(selectedModel) &&
    modelMatchesComposerMode(mode, selectedModel)
  ) {
    merged.unshift({ value: selectedModel, label: selectedModel });
  }
  return merged;
}

function pickMenuModel(
  options: readonly ImageModelMenuOption[],
  model: ImageModel,
  fallbackModel: ImageModel,
) {
  return hasMenuOption(options, model) ? model : options[0]?.value || fallbackModel;
}

function modelMatchesComposerMode(mode: ComposerMode, model: ImageModel) {
  if (mode === "chat") {
    return isChatModel(model) && !modelIDLooksImageCapable(model);
  }
  return isImageModel(model) && !isKnownChatOnlyModel(model);
}

function canvasModelsByCapability(models: CanvasModelOption[], capability: "chat" | "image") {
  return models
    .filter((model) => model.enabled !== false)
    .filter((model) =>
      canvasModelHasCapability(model, capability) ||
      (capability === "chat" && (model.kind === "text" || model.kind === "both")) ||
      (capability === "image" && (model.kind === "image" || model.kind === "both"))
    )
    .map(modelMenuOption);
}

function buildCreationTaskMessages(conversation: ImageConversation, activeTurnId: string): CreationTaskMessage[] {
  const messages: CreationTaskMessage[] = [];
  for (const turn of conversation.turns) {
    const prompt = turn.prompt.trim();
    if (prompt) {
      messages.push({ role: "user", content: prompt });
    }
    if (turn.id === activeTurnId) {
      break;
    }

    const assistantParts = turn.images.flatMap((image, index) => {
      const imageNumber = index + 1;
      if (image.status === "message" && image.text_response?.trim()) {
        return [image.text_response.trim()];
      }
      if (image.status === "success" && image.revised_prompt?.trim()) {
        return [`Generated image #${imageNumber}: ${image.revised_prompt.trim()}`];
      }
      if (image.status === "success") {
        return [`Generated image #${imageNumber}: image result was created successfully.`];
      }
      return [];
    });
    if (assistantParts.length > 0) {
      messages.push({ role: "assistant", content: assistantParts.join("\n\n") });
    }
  }
  return messages;
}

function getFallbackReferenceImage(conversation: ImageConversation, activeTurnId: string): FallbackReferenceImage | undefined {
  const previousTurns: ImageTurn[] = [];
  for (const turn of conversation.turns) {
    if (turn.id === activeTurnId) {
      break;
    }
    previousTurns.push(turn);
  }
  for (let turnIndex = previousTurns.length - 1; turnIndex >= 0; turnIndex -= 1) {
    const images = previousTurns[turnIndex].images;
    for (let imageIndex = images.length - 1; imageIndex >= 0; imageIndex -= 1) {
      const image = images[imageIndex];
      if (image.status !== "success") {
        continue;
      }
      if (image.path || image.url || image.b64_json) {
        return {
          ...(image.path ? { path: image.path } : {}),
          ...(image.url ? { url: image.url } : {}),
          ...(image.b64_json ? { b64_json: image.b64_json } : {}),
          ...(image.outputFormat ? { outputFormat: image.outputFormat } : {}),
        };
      }
    }
  }
  return undefined;
}

async function syncConversationCreationTasks(items: ImageConversation[]) {
  const taskIds = Array.from(
    new Set(
      items.flatMap((conversation) =>
        conversation.turns.flatMap((turn) =>
          turn.images.flatMap((image) => (image.status === "loading" && image.taskId ? [image.taskId] : [])),
        ),
      ),
    ),
  );
  if (taskIds.length === 0) {
    return items;
  }

  let taskList: Awaited<ReturnType<typeof fetchCreationTasks>>;
  try {
    taskList = await fetchCreationTasks(taskIds);
  } catch {
    return items;
  }
  const taskMap = new Map(taskList.items.map((task) => [task.id, task]));
  let changed = false;
  const normalized = items.map((conversation) => {
    let completedActiveTurn = false;
    const turns = conversation.turns.map((turn) => {
      let turnChanged = false;
      const images = turn.images.map((image, imageIndex) => {
        if (image.status !== "loading" || !image.taskId) {
          return image;
        }
        const task = taskMap.get(image.taskId);
        if (!task) {
          return image;
        }
        const nextImage = taskDataToStoredImage(image, task, imageDataIndexForTask(turn.images, imageIndex), turn.visibility);
        if (nextImage !== image) {
          turnChanged = true;
        }
        return nextImage;
      });
      if (!turnChanged) {
        return turn;
      }
      changed = true;
      const derived = deriveTurnStatusFromTaskMap(turn, images);
      const nextTurn = {
        ...turn,
        ...derived,
        images,
      };
      if (isTurnInProgress(turn) && !isTurnInProgress(nextTurn)) {
        completedActiveTurn = true;
      }
      return nextTurn;
    });
    if (turns === conversation.turns || !turns.some((turn, index) => turn !== conversation.turns[index])) {
      return conversation;
    }
    const nextConversation = {
      ...conversation,
      turns,
    };
    return completedActiveTurn
      ? {
          ...nextConversation,
          updatedAt: new Date().toISOString(),
        }
      : nextConversation;
  });

  if (changed) {
    await saveImageConversations(normalized);
  }
  return normalized;
}

async function recoverConversationHistory(items: ImageConversation[]) {
  let changed = false;
  const normalized = items.map((conversation) => {
    const turns = conversation.turns.map((turn) => {
      let turnChanged = false;
      const recoveredImages = turn.images.map((image, imageIndex) => {
        if (image.status === "error" && isMissingBatchImageDataError(image.error)) {
          turnChanged = true;
          return {
            ...image,
            taskId: image.id,
            status: "loading" as const,
            error: undefined,
          };
        }
        if (turn.mode === "chat" && image.status === "error" && isMissingRecoverableTaskIdError(image.error)) {
          turnChanged = true;
          return {
            ...image,
            taskId: imageTaskIdForImage(turn.id, turn.images, imageIndex),
            status: "loading" as const,
            error: undefined,
          };
        }
        if (turn.mode === "chat" && image.status === "loading" && !image.taskId) {
          turnChanged = true;
          return {
            ...image,
            taskId: imageTaskIdForImage(turn.id, turn.images, imageIndex),
          };
        }
        return image;
      });

      if (turn.status !== "queued" && turn.status !== "generating") {
        if (!turnChanged) {
          return turn;
        }
        changed = true;
        const derived = deriveTurnStatus({ ...turn, status: "queued", images: recoveredImages });
        return {
          ...turn,
          ...derived,
          images: recoveredImages,
        };
      }

      const images = recoveredImages.map((image) => {
        if (image.status !== "loading" || image.taskId) {
          return image;
        }
        turnChanged = true;
        return {
          ...image,
          status: "error" as const,
          error: MISSING_RECOVERABLE_TASK_ID_ERROR,
        };
      });
      const derived = deriveTurnStatus({ ...turn, images });
      if (!turnChanged && derived.status === turn.status && derived.error === turn.error) {
        return turn;
      }
      changed = true;
      return {
        ...turn,
        ...derived,
        images,
      };
    });

    if (!turns.some((turn, index) => turn !== conversation.turns[index])) {
      return conversation;
    }

    return {
      ...conversation,
      turns,
      updatedAt: new Date().toISOString(),
    };
  });

  if (changed) {
    await saveImageConversations(normalized);
  }

  return syncConversationCreationTasks(normalized);
}


function ImagePageContent({ session }: { session: NonNullable<ReturnType<typeof useAuthGuard>["session"]> }) {
  const location = useLocation();
  const appMeta = useAppMeta();
  const isEmbeddedMode = useMemo(() => new URLSearchParams(location.search).get("ui_mode") === "embedded", [location.search]);
  const isSubmitDispatchingRef = useRef(false);
  const retryingImageIdsRef = useRef(new Set<string>());
  const cancelledTurnIdsRef = useRef(new Set<string>());
  const conversationsRef = useRef<ImageConversation[]>([]);
  const resultsViewportRef = useRef<HTMLDivElement>(null);
  const composerDockRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const promptApplyRequestIdRef = useRef(0);
  const similarIntentAppliedRef = useRef(false);
  const assetsLoadingRequestRef = useRef(false);

  const [imagePrompt, setImagePrompt] = useState("");
  const [composerMode, setComposerMode] = useState<ComposerMode>(getStoredComposerMode);
  const [chatModel, setChatModel] = useState<ImageModel>(getStoredChatModel);
  const [imageModel, setImageModel] = useState<ImageModel>(getStoredImageModel);
  const [imageCount, setImageCount] = useState("1");
  const [imageSizeMode, setImageSizeMode] = useState<ImageSizeMode>(() => getStoredImageSizeSelection().mode);
  const [imageAspectRatio, setImageAspectRatio] = useState<ImageAspectRatio>(() => getStoredImageSizeSelection().aspectRatio);
  const [imageResolution, setImageResolution] = useState<ImageResolution>(() => getStoredImageSizeSelection().resolution);
  const [imageCustomRatio, setImageCustomRatio] = useState(() => getStoredImageSizeSelection().customRatio);
  const [imageCustomWidth, setImageCustomWidth] = useState(() => getStoredImageSizeSelection().customWidth);
  const [imageCustomHeight, setImageCustomHeight] = useState(() => getStoredImageSizeSelection().customHeight);
  const [imageOutputFormat, setImageOutputFormat] = useState<ImageOutputFormat>(getStoredImageOutputFormat);
  const [imageOutputCompression, setImageOutputCompression] = useState(getStoredImageOutputCompression);
  const [defaultImageVisibility, setDefaultImageVisibility] = useState<ImageVisibility>("private");
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [referenceImages, setReferenceImages] = useState<StoredReferenceImage[]>([]);
  const [conversations, setConversations] = useState<ImageConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [remoteCanvasModels, setRemoteCanvasModels] = useState<CanvasModelOption[]>([]);
  const [lightboxImages, setLightboxImages] = useState<ImageLightboxItem[]>([]);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "one"; id: string } | { type: "all" } | null>(null);
  const [editingTurnDraft, setEditingTurnDraft] = useState<EditingTurnDraft | null>(null);
  const [progressByTurnKey, setProgressByTurnKey] = useState<Record<string, ImageTurnProgress>>(
    getImageTurnProgressSnapshot,
  );
  const [progressNow, setProgressNow] = useState(Date.now());
  const [composerDockHeight, setComposerDockHeight] = useState(0);
  const [visibilityMutatingImageKey, setVisibilityMutatingImageKey] = useState("");
  const [publishImageTarget, setPublishImageTarget] = useState<PublishImageTarget | null>(null);
  const [backgroundRemovalDraft, setBackgroundRemovalDraft] = useState<BackgroundRemovalDraft | null>(null);
  const [backgroundRemovalSubmitting, setBackgroundRemovalSubmitting] = useState(false);
  const [publishRecipeOptions, setPublishRecipeOptions] = useState<PublishRecipeOptions>({
    sharePromptParameters: false,
    shareReferenceImages: false,
  });
  const [isPromptMarketOpen, setIsPromptMarketOpen] = useState(false);
  const [assets, setAssets] = useState<ManagedImageSummary[]>([]);
  const [assetNextCursor, setAssetNextCursor] = useState("");
  const [hasMoreAssets, setHasMoreAssets] = useState(false);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [loadingMoreAssets, setLoadingMoreAssets] = useState(false);
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [assetSidebarActivated, setAssetSidebarActivated] = useState(getInitialAssetSidebarActivated);
  const canInspectAccounts = session.role === "admin" || session.apiPermissions.includes("get/api/accounts");
  const canUseImageAssets = hasAPIPermission(session, "GET", "/api/images");

  const parsedCount = useMemo(() => normalizeRequestedImageCount(imageCount), [imageCount]);
  const chatModelOptions = useMemo(
    () => mergeImageModelOptions(canvasModelsByCapability(remoteCanvasModels, "chat"), CHAT_MODEL_OPTIONS, chatModel, "chat", appMeta.luoye_independent_mode),
    [appMeta.luoye_independent_mode, chatModel, remoteCanvasModels],
  );
  const imageCreationModelOptions = useMemo(
    () => mergeImageModelOptions(canvasModelsByCapability(remoteCanvasModels, "image"), IMAGE_CREATION_MODEL_OPTIONS, imageModel, "image"),
    [imageModel, remoteCanvasModels],
  );
  const effectiveChatModel = useMemo(
    () => pickMenuModel(chatModelOptions, chatModel, DEFAULT_CHAT_MODEL),
    [chatModel, chatModelOptions],
  );
  const effectiveImageModel = useMemo(
    () => pickMenuModel(imageCreationModelOptions, imageModel, DEFAULT_IMAGE_MODEL),
    [imageCreationModelOptions, imageModel],
  );
  const composerModel = composerMode === "chat" ? effectiveChatModel : effectiveImageModel;
  const composerModelOptions = composerMode === "chat" ? chatModelOptions : imageCreationModelOptions;
  const imageSize = useMemo(
    () => {
      const request = buildEffectiveImageSizeRequest(effectiveImageModel, {
        mode: imageSizeMode,
        aspectRatio: imageAspectRatio,
        resolution: imageResolution,
        customRatio: imageCustomRatio,
        customWidth: imageCustomWidth,
        customHeight: imageCustomHeight,
      });
      return request.size;
    },
    [effectiveImageModel, imageAspectRatio, imageCustomHeight, imageCustomRatio, imageCustomWidth, imageResolution, imageSizeMode],
  );
  const editingDraftSizeRequest = useMemo(() => {
    if (!editingTurnDraft || editingTurnDraft.mode === "chat") {
      return null;
    }
    return buildEffectiveImageSizeRequest(editingTurnDraft.model, {
      mode: editingTurnDraft.sizeMode,
      aspectRatio: editingTurnDraft.aspectRatio,
      resolution: editingTurnDraft.resolution,
      customRatio: editingTurnDraft.customRatio,
      customWidth: editingTurnDraft.customWidth,
      customHeight: editingTurnDraft.customHeight,
    });
  }, [editingTurnDraft]);
  const editingDraftEffectiveSizeSelection = editingDraftSizeRequest?.selection;
  const editingDraftImageSize = useMemo(() => {
    return editingDraftSizeRequest?.size ?? "";
  }, [editingDraftSizeRequest]);
  const editingDraftStructuredParameters = editingTurnDraft
    ? supportsStructuredImageParameters(editingTurnDraft.model)
    : false;
  const editingDraftResolutionPresets = editingTurnDraft
    ? supportsImageResolutionPresets(editingTurnDraft.model)
    : false;
  const editingDraftPixelIconSizeSelected =
    editingDraftEffectiveSizeSelection?.mode === "ratio" &&
    isPixelIconSize(editingDraftEffectiveSizeSelection.aspectRatio);
  const editingDraftResolutionControlsVisible = editingDraftResolutionPresets && !editingDraftPixelIconSizeSelected;
  const editingDraftOutputControls = editingTurnDraft
    ? supportsImageOutputControls(editingTurnDraft.model)
    : false;
  const editingDraftActiveAspectRatio = editingDraftEffectiveSizeSelection
    ? getActiveImageAspectRatio({
        aspectRatio: editingDraftEffectiveSizeSelection.aspectRatio,
        customRatio: editingDraftEffectiveSizeSelection.customRatio,
      })
    : "";
  const editingDraftCustomRatioInvalid = editingTurnDraft && editingDraftEffectiveSizeSelection
    ? isInvalidCustomRatioSelection(
        editingDraftEffectiveSizeSelection.mode,
        editingDraftEffectiveSizeSelection.aspectRatio,
        editingDraftEffectiveSizeSelection.customRatio,
      )
    : false;
  const editingDraftSizePreviewLabel =
    editingTurnDraft && editingTurnDraft.mode !== "chat" && editingDraftEffectiveSizeSelection
      ? editingDraftResolutionControlsVisible && !editingDraftStructuredParameters && editingDraftEffectiveSizeSelection.resolution !== "auto"
          ? `${imageResolutionPresetLabel(editingDraftEffectiveSizeSelection.resolution)} / ${
              editingDraftActiveAspectRatio || "Auto"
            }`
          : editingDraftImageSize
            ? formatImageSizeDisplay(editingDraftImageSize)
            : editingDraftEffectiveSizeSelection.mode === "auto" ||
            (editingDraftEffectiveSizeSelection.mode === "ratio" &&
              editingDraftEffectiveSizeSelection.resolution === "auto" &&
              !editingDraftCustomRatioInvalid)
              ? "Auto"
              : "尺寸无效"
      : "";
  const editingDraftSizePreviewDetail =
    editingDraftEffectiveSizeSelection?.mode === "ratio"
      ? editingDraftCustomRatioInvalid
        ? "比例需要填写为宽:高"
        : isPixelIconSize(editingDraftEffectiveSizeSelection.aspectRatio)
          ? `目标尺寸 ${formatImageSizeDisplay(editingDraftEffectiveSizeSelection.aspectRatio)}，像素图标快捷尺寸`
        : !editingDraftResolutionControlsVisible || editingDraftEffectiveSizeSelection.resolution === "auto"
          ? editingDraftImageSize
            ? `${editingDraftImageSize} 构图偏好，实际像素以上游返回为准`
            : "Auto 比例将交给模型决定"
          : editingDraftImageSize
            ? editingDraftStructuredParameters
              ? `目标尺寸 ${formatImageSizeDisplay(editingDraftImageSize)}，${getImageSizeRequirementLabel(editingDraftImageSize)}`
              : editingDraftActiveAspectRatio
                ? `${imageResolutionPresetLabel(editingDraftEffectiveSizeSelection.resolution)} 分辨率预设，画幅仍作为构图偏好，实际像素以上游返回为准`
                : `${imageResolutionPresetLabel(editingDraftEffectiveSizeSelection.resolution)} 分辨率预设，比例交给模型决定，实际像素以上游返回为准`
            : "比例需要填写为宽:高"
      : editingDraftEffectiveSizeSelection?.mode === "custom"
        ? editingDraftImageSize
          ? `已按链路限制校准为 ${formatImageSizeDisplay(editingDraftImageSize)}，${getImageSizeRequirementLabel(editingDraftImageSize)}`
          : "宽高需要填写正整数"
        : "不指定画幅或尺寸";
  const editingDraftSizeIsHighResolution = Boolean(
    editingDraftResolutionPresets &&
      editingDraftResolutionControlsVisible &&
      editingDraftEffectiveSizeSelection &&
      isHighResolutionImageRequest(
        editingDraftImageSize,
        imageResolutionPresetForModel(editingTurnDraft?.model || "", editingDraftEffectiveSizeSelection),
      ),
  );
  const selectedConversation = useMemo(
    () => conversations.find((item) => item.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId],
  );
  const activeTaskCount = useMemo(
    () =>
      conversations.reduce((sum, conversation) => {
        const stats = getImageConversationStats(conversation);
        return sum + stats.queued + stats.running;
      }, 0),
    [conversations],
  );
  const estimatedImageBilling = useMemo(() => {
    const estimateSizeRequest = buildEffectiveImageSizeRequest(effectiveImageModel, {
      mode: imageSizeMode,
      aspectRatio: imageAspectRatio,
      resolution: imageResolution,
      customRatio: imageCustomRatio,
      customWidth: imageCustomWidth,
      customHeight: imageCustomHeight,
    });
    const estimateResolutionPreset = imageResolutionPresetForModel(effectiveImageModel, estimateSizeRequest.selection);
    const estimateResolution = imageResolutionPresetLabel(estimateResolutionPreset) ||
      (effectiveImageModel === "auto" || effectiveImageModel === "gpt-image-2"
        ? "1K"
        : imagePriceSizeFromRequest(estimateSizeRequest.size));
    return imageBillingEstimate(composerModel, composerMode === "chat" ? 1 : parsedCount, estimateResolution);
  }, [
    composerMode,
    composerModel,
    effectiveImageModel,
    imageAspectRatio,
    imageCustomHeight,
    imageCustomRatio,
    imageCustomWidth,
    imageResolution,
    imageSizeMode,
    parsedCount,
  ]);
  const estimatedBillingUnits = estimatedImageBilling.units;
  const estimatedImagePriceLabel = composerMode === "chat" ? "" : formatImageDisplayPriceCNY(estimatedImageBilling.price);
  const billingBlocked = !hasEnoughBilling(session, estimatedBillingUnits);
  const deleteConfirmTitle = deleteConfirm?.type === "all" ? "清空历史记录" : deleteConfirm?.type === "one" ? "删除对话" : "";
  const deleteConfirmDescription =
    deleteConfirm?.type === "all"
      ? "确认删除全部图片历史记录吗？删除后无法恢复。"
      : deleteConfirm?.type === "one"
        ? "确认删除这条图片对话吗？删除后无法恢复。"
        : "";
  const highResolutionHint = useMemo(
    () => formatHighResolutionHint(canInspectAccounts),
    [canInspectAccounts],
  );

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    let cancelled = false;

    const loadModelCatalog = async () => {
      try {
        const models = await fetchCanvasModels();
        if (!cancelled) {
          setRemoteCanvasModels(models);
        }
      } catch {
        if (!cancelled) {
          setRemoteCanvasModels([]);
        }
      }
    };

    void loadModelCatalog();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const node = composerDockRef.current;
    if (!node) {
      return;
    }

    const updateComposerHeight = () => {
      const nextHeight = Math.ceil(node.getBoundingClientRect().height);
      setComposerDockHeight((currentHeight) => (currentHeight === nextHeight ? currentHeight : nextHeight));
    };

    updateComposerHeight();
    const observer = new ResizeObserver(updateComposerHeight);
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const refreshConversations = async () => {
      try {
        const items = await listImageConversations();
        if (cancelled) {
          return;
        }
        conversationsRef.current = items;
        setConversations(items);
      } catch {
        // Background updates should not surface noisy toasts while the user is on another workflow.
      }
    };

    const handleConversationsChanged = () => {
      void refreshConversations();
    };

    window.addEventListener(IMAGE_CONVERSATIONS_CHANGED_EVENT, handleConversationsChanged);
    return () => {
      cancelled = true;
      window.removeEventListener(IMAGE_CONVERSATIONS_CHANGED_EVENT, handleConversationsChanged);
    };
  }, []);

  useEffect(
    () =>
      subscribeImageTurnProgress(() => {
        setProgressByTurnKey(getImageTurnProgressSnapshot());
      }),
    [],
  );

  useEffect(() => {
    if (activeTaskCount === 0 && Object.keys(progressByTurnKey).length === 0) {
      return;
    }

    setProgressNow(Date.now());
    const timer = window.setInterval(() => {
      setProgressNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [activeTaskCount, progressByTurnKey]);

  useEffect(() => {
    let cancelled = false;

    const loadHistory = async () => {
      try {
        const storedSelection = getStoredImageSizeSelection();
        setImageSizeMode(storedSelection.mode);
        setImageAspectRatio(storedSelection.aspectRatio);
        setImageResolution(storedSelection.resolution);
        setImageCustomRatio(storedSelection.customRatio);
        setImageCustomWidth(storedSelection.customWidth);
        setImageCustomHeight(storedSelection.customHeight);
        setImageOutputFormat(getStoredImageOutputFormat());
        setImageOutputCompression(getStoredImageOutputCompression());

        const items = await listImageConversations();
        const normalizedItems = await recoverConversationHistory(items);
        if (cancelled) {
          return;
        }

        conversationsRef.current = normalizedItems;
        setConversations(normalizedItems);
        const storedConversationId =
          typeof window !== "undefined" ? window.localStorage.getItem(ACTIVE_IMAGE_CONVERSATION_STORAGE_KEY) : null;
        const nextSelectedConversationId =
          (storedConversationId && normalizedItems.some((conversation) => conversation.id === storedConversationId)
            ? storedConversationId
            : null) ?? pickFallbackConversationId(normalizedItems);
        setSelectedConversationId(nextSelectedConversationId);
      } catch (error) {
        const message = error instanceof Error ? error.message : "读取会话记录失败";
        toast.error(message);
      } finally {
        if (!cancelled) {
          setIsLoadingHistory(false);
        }
      }
    };

    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isLoadingHistory || similarIntentAppliedRef.current) {
      return;
    }
    similarIntentAppliedRef.current = true;

    const intent = consumeSimilarImageIntent();
    if (!intent) {
      return;
    }

    const requestId = promptApplyRequestIdRef.current + 1;
    promptApplyRequestIdRef.current = requestId;
    const prompt = intent.prompt.trim() || "参考这张图，生成一张风格、主体和构图相近的新图片。";
    const sizeSelection = getImageSizeSelectionFromSize(intent.requestedSize || intent.resolutionPreset || "");
    const outputFormat = isImageOutputFormat(intent.outputFormat) ? intent.outputFormat : DEFAULT_IMAGE_OUTPUT_FORMAT;

    setSelectedConversationId(null);
    setComposerMode("image");
    setImagePrompt(prompt);
    setImageCount("1");
    setImageModel(isImageModel(intent.model) && modelIDLooksImageCapable(intent.model) ? intent.model : imageCreationModelOptions[0]?.value || DEFAULT_IMAGE_MODEL);
    setImageSizeMode(sizeSelection.mode);
    setImageAspectRatio(sizeSelection.aspectRatio);
    setImageResolution(isImageResolution(intent.resolutionPreset) ? intent.resolutionPreset : sizeSelection.resolution);
    setImageCustomRatio(sizeSelection.customRatio);
    setImageCustomWidth(sizeSelection.customWidth);
    setImageCustomHeight(sizeSelection.customHeight);
    setImageOutputFormat(outputFormat);
    setImageOutputCompression(reusableOutputCompressionValue(intent.outputCompression, outputFormat));
    setDefaultImageVisibility("private");
    setReferenceImages([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    textareaRef.current?.focus();

    const sourceImageUrls = intent.sourceImageUrls.length > 0 ? intent.sourceImageUrls : [intent.sourceImageUrl];
    const usesPublicImageFallback = intent.sourceKind !== "original_references";
    const toastId = toast.loading(
      usesPublicImageFallback
        ? "正在读取公开图作为参考图"
        : sourceImageUrls.length > 1
          ? "正在读取公开的原始参考图"
          : "正在读取公开的原始参考图",
    );
    void Promise.allSettled(
      sourceImageUrls.map((url, index) => buildReferenceImageFromUrl(url, index, "public-gallery-reference")),
    )
      .then((results) => {
        if (promptApplyRequestIdRef.current !== requestId) {
          return;
        }
        const loadedReferences = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
        if (loadedReferences.length === 0) {
          toast.error("已带入原始提示词和参数，但参考图读取失败");
          return;
        }
        setReferenceImages(loadedReferences);
        const failedCount = results.length - loadedReferences.length;
        toast.success(
          failedCount > 0
            ? `已带入原始提示词、${loadedReferences.length} 张参考图和生成参数，${failedCount} 张读取失败`
            : usesPublicImageFallback
              ? "未公开原始参考图，已使用公开图和可用参数"
              : `已带入原始提示词、${loadedReferences.length} 张原始参考图和生成参数`,
        );
      })
      .catch(() => {
        if (promptApplyRequestIdRef.current !== requestId) {
          return;
        }
        toast.error("已带入原始提示词和参数，但参考图读取失败");
      })
      .finally(() => {
        toast.dismiss(toastId);
      });
  }, [imageCreationModelOptions, isLoadingHistory]);

  useEffect(() => {
    if (!selectedConversationId) {
      return;
    }

    resultsViewportRef.current?.scrollTo({
      top: resultsViewportRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [selectedConversationId, selectedConversation?.turns.length]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (selectedConversationId) {
      window.localStorage.setItem(ACTIVE_IMAGE_CONVERSATION_STORAGE_KEY, selectedConversationId);
    } else {
      window.localStorage.removeItem(ACTIVE_IMAGE_CONVERSATION_STORAGE_KEY);
    }
  }, [selectedConversationId]);

  useEffect(() => {
    const handleOpenConversation = (event: Event) => {
      const conversationId = (event as CustomEvent<{ conversationId?: string }>).detail?.conversationId;
      if (conversationId) {
        setSelectedConversationId(conversationId);
      }
    };

    window.addEventListener(IMAGE_ACTIVE_CONVERSATION_REQUEST_EVENT, handleOpenConversation);
    return () => {
      window.removeEventListener(IMAGE_ACTIVE_CONVERSATION_REQUEST_EVENT, handleOpenConversation);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(COMPOSER_MODE_STORAGE_KEY, composerMode);
  }, [composerMode]);

  useEffect(() => {
    const nextModel = pickMenuModel(chatModelOptions, chatModel, DEFAULT_CHAT_MODEL);
    if (nextModel !== chatModel) {
      setChatModel(nextModel);
    }
  }, [chatModel, chatModelOptions]);

  useEffect(() => {
    const nextModel = pickMenuModel(imageCreationModelOptions, imageModel, DEFAULT_IMAGE_MODEL);
    if (nextModel !== imageModel) {
      setImageModel(nextModel);
    }
  }, [imageCreationModelOptions, imageModel]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(IMAGE_MODEL_STORAGE_KEY, imageModel);
  }, [imageModel]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(CHAT_MODEL_STORAGE_KEY, chatModel);
  }, [chatModel]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(IMAGE_SIZE_MODE_STORAGE_KEY, imageSizeMode);
    if (imageAspectRatio) {
      window.localStorage.setItem(IMAGE_ASPECT_RATIO_STORAGE_KEY, imageAspectRatio);
    } else {
      window.localStorage.removeItem(IMAGE_ASPECT_RATIO_STORAGE_KEY);
    }
    window.localStorage.setItem(IMAGE_RESOLUTION_STORAGE_KEY, imageResolution);
    window.localStorage.setItem(IMAGE_CUSTOM_RATIO_STORAGE_KEY, imageCustomRatio);
    window.localStorage.setItem(IMAGE_CUSTOM_WIDTH_STORAGE_KEY, imageCustomWidth);
    window.localStorage.setItem(IMAGE_CUSTOM_HEIGHT_STORAGE_KEY, imageCustomHeight);
    if (imageSize) {
      window.localStorage.setItem(IMAGE_SIZE_STORAGE_KEY, imageSize);
      return;
    }
    window.localStorage.removeItem(IMAGE_SIZE_STORAGE_KEY);
  }, [imageAspectRatio, imageCustomHeight, imageCustomRatio, imageCustomWidth, imageResolution, imageSize, imageSizeMode]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(IMAGE_OUTPUT_FORMAT_STORAGE_KEY, imageOutputFormat);
    const normalizedCompression = normalizeOutputCompressionValue(imageOutputCompression);
    if (normalizedCompression === undefined || !supportsImageOutputCompression(imageOutputFormat)) {
      window.localStorage.removeItem(IMAGE_OUTPUT_COMPRESSION_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(IMAGE_OUTPUT_COMPRESSION_STORAGE_KEY, String(normalizedCompression));
  }, [imageOutputCompression, imageOutputFormat]);

  useEffect(() => {
    if (selectedConversationId && !conversations.some((conversation) => conversation.id === selectedConversationId)) {
      setSelectedConversationId(pickFallbackConversationId(conversations));
    }
  }, [conversations, selectedConversationId]);

  const persistConversation = async (conversation: ImageConversation) => {
    const nextConversations = sortImageConversations([
      conversation,
      ...conversationsRef.current.filter((item) => item.id !== conversation.id),
    ]);
    conversationsRef.current = nextConversations;
    setConversations(nextConversations);
    await saveImageConversation(conversation);
  };

  const updateConversation = useCallback(
    async (
      conversationId: string,
      updater: (current: ImageConversation | null) => ImageConversation,
      options: { persist?: boolean } = {},
    ) => {
      const current = conversationsRef.current.find((item) => item.id === conversationId) ?? null;
      const nextConversation = updater(current);
      const nextConversations = sortImageConversations([
        nextConversation,
        ...conversationsRef.current.filter((item) => item.id !== conversationId),
      ]);
      conversationsRef.current = nextConversations;
      setConversations(nextConversations);
      if (options.persist !== false) {
        await saveImageConversation(nextConversation);
      }
    },
    [],
  );

  const updateTurnProgress = useCallback(
    (conversationId: string, turnId: string, updates: Omit<ImageTurnProgress, "startedAt"> & { startedAt?: number }) => {
      setImageTurnProgress(conversationId, turnId, updates);
    },
    [],
  );

  const clearTurnProgress = useCallback((conversationId: string, turnId: string) => {
    clearImageTurnProgress(conversationId, turnId);
  }, []);

  const resetReferenceUploads = useCallback((images: StoredReferenceImage[]) =>
    images.map((image) => ({
      ...image,
      uploadStatus: image.serverReferenceId ? "uploaded" as const : "pending" as const,
      uploadError: undefined,
    })), []);

  const updateTurnReferenceImages = useCallback(
    async (
      conversationId: string,
      turnId: string,
      updater: (images: StoredReferenceImage[]) => StoredReferenceImage[],
      fallbackConversation: ImageConversation,
    ) => {
      await updateConversation(conversationId, (current) => {
        const conversation = current ?? fallbackConversation;
        return {
          ...conversation,
          turns: conversation.turns.map((turn) =>
            turn.id === turnId
              ? {
                  ...turn,
                  referenceImages: updater(turn.referenceImages),
                }
              : turn,
          ),
        };
      });
    },
    [updateConversation],
  );

  const ensureReferenceUploads = useCallback(
    async (conversationId: string, snapshot: ImageConversation, turn: ImageTurn) => {
      const referenceImages = turn.referenceImages;
      if (referenceImages.length === 0) {
        throw new Error("未找到可用的参考图");
      }
      const uploadedIds = referenceImages
        .map((image) => image.serverReferenceId)
        .filter((id): id is string => Boolean(id));
      if (uploadedIds.length === referenceImages.length) {
        return uploadedIds;
      }

      await updateTurnReferenceImages(
        conversationId,
        turn.id,
        (images) =>
          images.map((image, index) => ({
            ...image,
            clientReferenceId: referenceImageClientId(conversationId, turn.id, image, index),
            uploadStatus: image.serverReferenceId ? "uploaded" : "pending",
            uploadError: undefined,
          })),
        snapshot,
      );

      const nextIds: string[] = [];
      for (let index = 0; index < referenceImages.length; index += 1) {
        const image = referenceImages[index];
        if (image.serverReferenceId) {
          nextIds.push(image.serverReferenceId);
          continue;
        }
        const clientReferenceId = referenceImageClientId(conversationId, turn.id, image, index);
        updateTurnProgress(conversationId, turn.id, {
          message: "正在上传参考图",
          detail: `正在上传第 ${index + 1} / ${referenceImages.length} 张参考图`,
        });
        await updateTurnReferenceImages(
          conversationId,
          turn.id,
          (images) =>
            images.map((item, itemIndex) =>
              itemIndex === index
                ? {
                    ...item,
                    clientReferenceId,
                    uploadStatus: "uploading",
                    uploadError: undefined,
                  }
                : item,
            ),
          snapshot,
        );
        try {
          const file = referenceImageUploadFile(image, turn.id, index);
          const item = await uploadCreationTaskReferenceImage(file, clientReferenceId, {
            conversationId,
            turnId: turn.id,
          });
          nextIds.push(item.id);
          await updateTurnReferenceImages(
            conversationId,
            turn.id,
            (images) =>
              images.map((current, itemIndex) =>
                itemIndex === index
                  ? {
                      ...current,
                      clientReferenceId,
                      serverReferenceId: item.id,
                      uploadStatus: "uploaded",
                      uploadError: undefined,
                    }
                  : current,
              ),
            snapshot,
          );
        } catch (error) {
          const message = formatCreationTaskError(error, "参考图上传失败");
          await updateTurnReferenceImages(
            conversationId,
            turn.id,
            (images) =>
              images.map((current, itemIndex) =>
                itemIndex === index
                  ? {
                      ...current,
                      clientReferenceId,
                      uploadStatus: "error",
                      uploadError: message,
                    }
                  : current,
              ),
            snapshot,
          );
          throw new Error(message);
        }
      }
      return nextIds;
    },
    [updateTurnProgress, updateTurnReferenceImages],
  );

  const clearComposerInputs = useCallback(() => {
    promptApplyRequestIdRef.current += 1;
    setImagePrompt("");
    setImageCount("1");
    setImageOutputFormat(DEFAULT_IMAGE_OUTPUT_FORMAT);
    setImageOutputCompression("");
    setDefaultImageVisibility("private");
    setReferenceImages([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const resetComposer = useCallback(() => {
    clearComposerInputs();
  }, [clearComposerInputs]);

  const handleComposerModeChange = useCallback((mode: ComposerMode) => {
    setComposerMode(mode);
    if (mode === "chat") {
      promptApplyRequestIdRef.current += 1;
      setDefaultImageVisibility("private");
      setChatModel((current) => pickMenuModel(chatModelOptions, current, DEFAULT_CHAT_MODEL));
      return;
    }
    setImageModel((current) => pickMenuModel(imageCreationModelOptions, current, DEFAULT_IMAGE_MODEL));
  }, [chatModelOptions, imageCreationModelOptions]);

  const handleComposerModelChange = useCallback((value: ImageModel) => {
    if (composerMode === "chat") {
      setChatModel(value);
      return;
    }
    setImageModel(value);
  }, [composerMode]);

  const switchComposerToImageMode = useCallback(() => {
    setComposerMode("image");
    setImageModel((current) => pickMenuModel(imageCreationModelOptions, current, DEFAULT_IMAGE_MODEL));
  }, [imageCreationModelOptions]);

  const handleCreateDraft = () => {
    setSelectedConversationId(null);
    textareaRef.current?.focus();
  };

  const handleApplyPromptPreset = useCallback(async (preset: ImagePromptPreset) => {
    const requestId = promptApplyRequestIdRef.current + 1;
    promptApplyRequestIdRef.current = requestId;
    setSelectedConversationId(null);
    switchComposerToImageMode();
    setImagePrompt(preset.prompt);
    setImageCount(String(preset.count));
    const presetSizeSelection = getImageSizeSelectionFromSize(preset.size);
    setImageSizeMode(presetSizeSelection.mode);
    setImageAspectRatio(presetSizeSelection.aspectRatio);
    setImageResolution(presetSizeSelection.resolution);
    setImageCustomRatio(presetSizeSelection.customRatio);
    setImageCustomWidth(presetSizeSelection.customWidth);
    setImageCustomHeight(presetSizeSelection.customHeight);
    setImageOutputFormat(DEFAULT_IMAGE_OUTPUT_FORMAT);
    setImageOutputCompression("");
    setDefaultImageVisibility("private");
    setReferenceImages([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    textareaRef.current?.focus();

    const toastId = toast.loading("正在读取参考图");
    try {
      const referenceImage = await buildReferenceImageFromUrl(preset.imageSrc, 0, "preset-reference");
      if (promptApplyRequestIdRef.current !== requestId) {
        toast.dismiss(toastId);
        return;
      }
      setReferenceImages([referenceImage]);
      toast.dismiss(toastId);
      toast.success("已套用提示词和参考图");
    } catch {
      if (promptApplyRequestIdRef.current !== requestId) {
        toast.dismiss(toastId);
        return;
      }
      toast.dismiss(toastId);
      toast.error("已套用提示词，但参考图读取失败");
    }
  }, [switchComposerToImageMode]);

  const handleApplyMarketPrompt = useCallback(async (prompt: BananaPrompt) => {
    const requestId = promptApplyRequestIdRef.current + 1;
    promptApplyRequestIdRef.current = requestId;
    setSelectedConversationId(null);
    switchComposerToImageMode();
    setImagePrompt(prompt.prompt);
    setImageCount("1");
    setImageOutputFormat(DEFAULT_IMAGE_OUTPUT_FORMAT);
    setImageOutputCompression("");
    setDefaultImageVisibility("private");
    setReferenceImages([]);
    setIsPromptMarketOpen(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    textareaRef.current?.focus();

    const referenceUrls = Array.from(
      new Set([prompt.preview, ...prompt.referenceImageUrls].map((url) => url.trim()).filter(Boolean)),
    ).slice(0, PROMPT_MARKET_REFERENCE_IMAGE_LIMIT);
    if (referenceUrls.length === 0) {
      toast.success("已套用提示词");
      return;
    }

    const toastId = toast.loading("正在读取市场参考图");
    const referenceImages: StoredReferenceImage[] = [];
    try {
      for (let index = 0; index < referenceUrls.length; index += 1) {
        try {
          referenceImages.push(await buildReferenceImageFromUrl(referenceUrls[index], index, "market-reference"));
        } catch {
          // Keep applying the prompt even when a remote reference image blocks browser access.
        }
      }
      if (promptApplyRequestIdRef.current !== requestId) {
        toast.dismiss(toastId);
        return;
      }
      if (referenceImages.length > 0) {
        setReferenceImages(referenceImages);
        toast.dismiss(toastId);
        toast.success(`已套用提示词和 ${referenceImages.length} 张参考图`);
        return;
      }
      toast.dismiss(toastId);
      toast.success("已套用提示词，参考图读取失败");
    } catch {
      if (promptApplyRequestIdRef.current !== requestId) {
        toast.dismiss(toastId);
        return;
      }
      toast.dismiss(toastId);
      toast.success("已套用提示词，参考图读取失败");
    }
  }, [switchComposerToImageMode]);

  const loadAssets = useCallback(async () => {
    if (assetsLoadingRequestRef.current) {
      return;
    }
    if (!canUseImageAssets) {
      setAssets([]);
      setAssetNextCursor("");
      setHasMoreAssets(false);
      setAssetsLoaded(true);
      return;
    }
    assetsLoadingRequestRef.current = true;
    setLoadingAssets(true);
    try {
      const mineResult = await fetchManagedImages({ scope: "mine", page_size: IMAGE_ASSET_PAGE_SIZE });
      let nextAssets = mineResult.items;
      try {
        const workspace = await fetchTeamWorkspace();
        const team = Array.isArray(workspace.teams) ? workspace.teams[0] : undefined;
        if (team?.id) {
          const teamResult = await fetchManagedImages({ scope: "team", team_id: team.id, page_size: IMAGE_ASSET_PAGE_SIZE });
          const seen = new Set(nextAssets.map((asset) => asset.path));
          nextAssets = [...nextAssets, ...teamResult.items.filter((asset) => !seen.has(asset.path))];
        }
      } catch {
        // Team library is optional for the asset picker.
      }
      setAssets(nextAssets);
      setAssetNextCursor(mineResult.next_cursor);
      setHasMoreAssets(mineResult.has_more);
      setAssetsLoaded(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载图片库失败");
    } finally {
      assetsLoadingRequestRef.current = false;
      setLoadingAssets(false);
    }
  }, [canUseImageAssets]);

  const loadMoreAssets = useCallback(async () => {
    if (!canUseImageAssets || loadingAssets || loadingMoreAssets || !hasMoreAssets || !assetNextCursor) {
      return;
    }
    setLoadingMoreAssets(true);
    try {
      const result = await fetchManagedImages({
        scope: "mine",
        page_size: IMAGE_ASSET_PAGE_SIZE,
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
  }, [assetNextCursor, canUseImageAssets, hasMoreAssets, loadingAssets, loadingMoreAssets]);

  const ensureAssetsLoaded = useCallback(() => {
    if (assetsLoaded || loadingAssets || assetsLoadingRequestRef.current) {
      return;
    }
    void loadAssets();
  }, [assetsLoaded, loadAssets, loadingAssets]);

  const activateAssetSidebar = useCallback(() => {
    setAssetSidebarActivated(true);
    ensureAssetsLoaded();
  }, [ensureAssetsLoaded]);

  const handleAssetSidebarExpandedChange = useCallback(
    (expanded: boolean) => {
      if (expanded) {
        ensureAssetsLoaded();
      }
    },
    [ensureAssetsLoaded],
  );

  const handleDeleteConversation = async (id: string) => {
    const nextConversations = conversations.filter((item) => item.id !== id);
    conversationsRef.current = nextConversations;
    setConversations(nextConversations);
    if (selectedConversationId === id) {
      setSelectedConversationId(pickFallbackConversationId(nextConversations));
      resetComposer();
    }

    try {
      await deleteImageConversation(id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "删除会话失败";
      toast.error(message);
      const items = await listImageConversations();
      conversationsRef.current = items;
      setConversations(items);
    }
  };

  const handleClearHistory = async () => {
    try {
      await clearImageConversations();
      conversationsRef.current = [];
      setConversations([]);
      setSelectedConversationId(null);
      resetComposer();
      toast.success("已清空历史记录");
    } catch (error) {
      const message = error instanceof Error ? error.message : "清空历史记录失败";
      toast.error(message);
    }
  };

  const openDeleteConversationConfirm = (id: string) => {
    setIsHistoryOpen(false);
    setDeleteConfirm({ type: "one", id });
  };

  const openClearHistoryConfirm = () => {
    setIsHistoryOpen(false);
    setDeleteConfirm({ type: "all" });
  };

  const handleConfirmDelete = async () => {
    const target = deleteConfirm;
    setDeleteConfirm(null);
    if (!target) {
      return;
    }
    if (target.type === "all") {
      await handleClearHistory();
      return;
    }
    await handleDeleteConversation(target.id);
  };

  const appendReferenceImages = useCallback(async (files: File[]) => {
    if (files.length === 0) {
      return;
    }
    promptApplyRequestIdRef.current += 1;

    const toastId = files.length > 1 ? toast.loading(`正在压缩 ${files.length} 张参考图`) : null;
    try {
      const previews = await Promise.all(
        files.map(buildStoredReferenceImageFromFile),
      );

      setReferenceImages((prev) => [...prev, ...previews]);
      if (toastId) {
        toast.dismiss(toastId);
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      if (toastId) {
        toast.dismiss(toastId);
      }
      const message = error instanceof Error ? error.message : "读取参考图失败";
      toast.error(message);
    }
  }, []);

  const handleReferenceImageChange = useCallback(
    async (files: File[]) => {
      if (files.length === 0) {
        return;
      }

      await appendReferenceImages(files);
    },
    [appendReferenceImages],
  );

  const handleRemoveReferenceImage = useCallback((index: number) => {
    setReferenceImages((prev) => {
      const next = prev.filter((_, currentIndex) => currentIndex !== index);
      if (next.length === 0 && fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return next;
    });
  }, []);

  const appendConversationReferenceImages = useCallback((
    conversationId: string,
    images: StoredReferenceImage[],
    options: { clearPrompt?: boolean } = {},
  ) => {
    setSelectedConversationId(conversationId);
    switchComposerToImageMode();
    setReferenceImages((prev) => [
      ...prev,
      ...images.map((image) => ({
        ...image,
        source: "conversation" as const,
        clientReferenceId: createId(),
        uploadStatus: "pending" as const,
        serverReferenceId: undefined,
        uploadError: undefined,
      })),
    ]);
    if (options.clearPrompt !== false) {
      setImagePrompt("");
    }
    textareaRef.current?.focus();
  }, [switchComposerToImageMode]);

  const appendLibraryReferenceImages = useCallback((images: StoredReferenceImage[]) => {
    if (images.length === 0) {
      return;
    }
    promptApplyRequestIdRef.current += 1;
    setSelectedConversationId(null);
    switchComposerToImageMode();
    setReferenceImages((prev) => [
      ...prev,
      ...images.map((image) => ({
        ...image,
        source: image.source || "upload" as const,
        clientReferenceId: createId(),
        uploadStatus: "pending" as const,
        serverReferenceId: undefined,
        uploadError: undefined,
      })),
    ]);
    textareaRef.current?.focus();
  }, [switchComposerToImageMode]);

  const handleManagedImageReference = useCallback(async (asset: ManagedImageSummary) => {
    const toastId = toast.loading("正在读取图库图片...");
    try {
      const referenceImage = await buildReferenceImageFromManagedImage(asset);
      appendLibraryReferenceImages([referenceImage]);
      toast.success("已加入参考图，可继续输入描述");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "读取图库图片失败");
    } finally {
      toast.dismiss(toastId);
    }
  }, [appendLibraryReferenceImages]);

  const handleContinueEdit = useCallback(
    async (conversationId: string, image: StoredImage | StoredReferenceImage) => {
      try {
        const nextReference =
          "dataUrl" in image
            ? {
                referenceImage: image,
              }
            : await buildReferenceImageFromStoredImage(
                image,
                `conversation-${conversationId}-${Date.now()}.${imageFileExtensionForOutputFormat(image.outputFormat)}`,
              );
        if (!nextReference) {
          return;
        }

        appendConversationReferenceImages(conversationId, [nextReference.referenceImage], { clearPrompt: false });
        toast.success("已加入当前参考图，继续输入描述即可编辑");
      } catch (error) {
        const message = error instanceof Error ? error.message : "读取结果图失败";
        toast.error(message);
      }
    },
    [appendConversationReferenceImages],
  );

  const handleContinueEditBatch = useCallback(
    async (conversationId: string, images: StoredImage[], options: { clearPrompt?: boolean } = { clearPrompt: false }) => {
      if (images.length === 0) {
        return;
      }

      const toastId = toast.loading(`正在读取 ${images.length} 张图片...`);
      try {
        const results = await Promise.allSettled(
          images.map((image, index) =>
            buildReferenceImageFromStoredImage(
              image,
              `conversation-${conversationId}-${Date.now()}-${index + 1}.${imageFileExtensionForOutputFormat(image.outputFormat)}`,
            ),
          ),
        );
        const references = results.flatMap((result) =>
          result.status === "fulfilled" && result.value ? [result.value.referenceImage] : [],
        );
        toast.dismiss(toastId);
        if (references.length === 0) {
          toast.error("读取已选图片失败");
          return;
        }

        appendConversationReferenceImages(conversationId, references, options);
        const failedCount = images.length - references.length;
        toast.success(
          failedCount > 0
            ? `已加入 ${references.length} 张参考图，${failedCount} 张读取失败`
            : `已加入 ${references.length} 张参考图，继续输入描述即可编辑`,
        );
      } catch (error) {
        toast.dismiss(toastId);
        const message = error instanceof Error ? error.message : "读取已选图片失败";
        toast.error(message);
      }
    },
    [appendConversationReferenceImages],
  );

  const handleImageResultDrop = useCallback(
    async (imageIds: string[]) => {
      if (!selectedConversationId || imageIds.length === 0) {
        return;
      }
      const conversation = conversationsRef.current.find((item) => item.id === selectedConversationId);
      if (!conversation) {
        toast.error("未找到当前会话");
        return;
      }
      const imageIdSet = new Set(imageIds);
      const images = conversation.turns.flatMap((turn) =>
        turn.images.filter((image) => imageIdSet.has(image.id) && image.status === "success"),
      );
      if (images.length === 0) {
        toast.error("未找到可编辑的图片");
        return;
      }
      await handleContinueEditBatch(conversation.id, images, { clearPrompt: false });
    },
    [handleContinueEditBatch, selectedConversationId],
  );

  const openLightbox = useCallback((images: ImageLightboxItem[], index: number) => {
    if (images.length === 0) {
      return;
    }

    setLightboxImages(images);
    setLightboxIndex(Math.max(0, Math.min(index, images.length - 1)));
    setLightboxOpen(true);
  }, []);

  const handleImageVisibilityChange = useCallback(
    async (
      conversationId: string,
      turnId: string,
      imageIndex: number,
      visibility: ImageVisibility,
      options: PublishRecipeOptions = { sharePromptParameters: false, shareReferenceImages: false },
    ) => {
      const targetConversation = conversationsRef.current.find((conversation) => conversation.id === conversationId);
      const targetTurn = targetConversation?.turns.find((turn) => turn.id === turnId);
      const targetImage = targetTurn?.images[imageIndex];
      if (!targetConversation || !targetTurn || !targetImage) {
        toast.error("未找到对应的图片记录");
        return;
      }
      if (targetImage.status !== "success") {
        toast.error("图片生成成功后才能修改公开状态");
        return;
      }
      const imageUrl = targetImage.localUrl || targetImage.url || "";
      const path = targetImage.path || (imageUrl ? getManagedImagePathFromUrl(imageUrl) : "");
      if (!path) {
        toast.error("未找到可同步到图库的图片路径");
        return;
      }
      const currentVisibility = targetImage.visibility || targetTurn.visibility || "private";
      if (visibility === "public" && currentVisibility !== "public" && !publishImageTarget) {
        setPublishRecipeOptions({ sharePromptParameters: false, shareReferenceImages: false });
        setPublishImageTarget({ conversationId, turnId, imageIndex });
        return;
      }

      const mutatingKey = `${conversationId}:${turnId}:${targetImage.id}`;
      if (visibilityMutatingImageKey === mutatingKey) {
        return;
      }
      if (visibilityMutatingImageKey) {
        return;
      }
      setVisibilityMutatingImageKey(mutatingKey);
      try {
        const data = await updateManagedImageVisibility(path, visibility, options);
        const updatedVisibility = data.item.visibility || visibility;
        const updatedPath = data.item.path || path;
        await updateConversation(conversationId, (current) => {
          const conversation = current ?? targetConversation;
          return {
            ...conversation,
            updatedAt: new Date().toISOString(),
            turns: conversation.turns.map((turn) =>
              turn.id === turnId
                ? {
                    ...turn,
                    images: turn.images.map((image, index) =>
                      index === imageIndex
                        ? {
                            ...image,
                            path: updatedPath,
                            visibility: updatedVisibility,
                          }
                        : image,
                    ),
                  }
                : turn,
            ),
          };
        });
        clearImageManagerCache();
        toast.success(updatedVisibility === "public" ? "已公开到公开图库" : "已取消公开");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "更新公开状态失败");
      } finally {
        setVisibilityMutatingImageKey("");
      }
    },
    [publishImageTarget, updateConversation, visibilityMutatingImageKey],
  );

  const handleConfirmPublishImage = useCallback(async () => {
    if (!publishImageTarget || visibilityMutatingImageKey) {
      return;
    }
    const target = publishImageTarget;
    const options = {
      sharePromptParameters: publishRecipeOptions.sharePromptParameters,
      shareReferenceImages: publishRecipeOptions.sharePromptParameters && publishRecipeOptions.shareReferenceImages,
    };
    try {
      await handleImageVisibilityChange(target.conversationId, target.turnId, target.imageIndex, "public", options);
    } finally {
      setPublishImageTarget(null);
    }
  }, [handleImageVisibilityChange, publishImageTarget, publishRecipeOptions, visibilityMutatingImageKey]);

  const openEditTurnDialog = useCallback((conversationId: string, turnId: string) => {
    const targetConversation = conversationsRef.current.find((conversation) => conversation.id === conversationId);
    const targetTurn = targetConversation?.turns.find((turn) => turn.id === turnId);
    if (!targetConversation || !targetTurn) {
      toast.error("未找到对应的对话轮次");
      return;
    }
    if (isTurnInProgress(targetTurn)) {
      toast.error("当前轮次正在处理，稍后再编辑");
      return;
    }
    const sizeSelection = restoreImageSizeSelection(targetTurn.sizeSelection, targetTurn.size);
    setEditingTurnDraft({
      conversationId,
      turnId,
      prompt: targetTurn.prompt,
      model: targetTurn.model || (targetTurn.mode === "chat" ? chatModelOptions[0]?.value || DEFAULT_CHAT_MODEL : imageCreationModelOptions[0]?.value || DEFAULT_IMAGE_MODEL),
      mode: targetTurn.mode,
      count: targetTurn.mode === "chat" ? "1" : String(normalizeRequestedImageCount(targetTurn.count || targetTurn.images.length || 1)),
      sizeMode: targetTurn.mode === "chat" ? "auto" : sizeSelection.mode,
      aspectRatio: targetTurn.mode === "chat" ? "" : sizeSelection.aspectRatio,
      resolution: targetTurn.mode === "chat" ? "auto" : sizeSelection.resolution,
      customRatio: targetTurn.mode === "chat" ? DEFAULT_IMAGE_CUSTOM_RATIO : sizeSelection.customRatio,
      customWidth: targetTurn.mode === "chat" ? DEFAULT_IMAGE_CUSTOM_WIDTH : sizeSelection.customWidth,
      customHeight: targetTurn.mode === "chat" ? DEFAULT_IMAGE_CUSTOM_HEIGHT : sizeSelection.customHeight,
      outputFormat: targetTurn.outputFormat || DEFAULT_IMAGE_OUTPUT_FORMAT,
      outputCompression:
        targetTurn.outputCompression === undefined || targetTurn.outputCompression === null
          ? ""
          : String(targetTurn.outputCompression),
      visibility: targetTurn.visibility || "private",
      referenceImages: targetTurn.mode === "chat" ? [] : targetTurn.referenceImages,
    });
  }, [chatModelOptions, imageCreationModelOptions]);

  const handleEditReferenceImageChange = useCallback(async (files: File[]) => {
    if (files.length === 0) {
      return;
    }
    const toastId = files.length > 1 ? toast.loading(`正在压缩 ${files.length} 张参考图`) : null;
    try {
      const previews = await Promise.all(
        files.map(buildStoredReferenceImageFromFile),
      );
      setEditingTurnDraft((current) =>
        current
          ? {
              ...current,
              referenceImages: [...current.referenceImages, ...previews],
            }
              : current,
      );
      if (toastId) {
        toast.dismiss(toastId);
      }
      if (editFileInputRef.current) {
        editFileInputRef.current.value = "";
      }
    } catch (error) {
      if (toastId) {
        toast.dismiss(toastId);
      }
      const message = error instanceof Error ? error.message : "读取参考图失败";
      toast.error(message);
    }
  }, []);

  const handleRemoveEditReferenceImage = useCallback((index: number) => {
    setEditingTurnDraft((current) =>
      current
        ? {
            ...current,
            referenceImages: current.referenceImages.filter((_, currentIndex) => currentIndex !== index),
          }
        : current,
    );
  }, []);

  const runConversationQueue = useCallback(
    async (conversationId: string) => {
      if (activeConversationQueueIds.has(conversationId)) {
        return;
      }

      const snapshot = conversationsRef.current.find((conversation) => conversation.id === conversationId);
      const activeTurn = snapshot?.turns.find(
        (turn) =>
          (turn.status === "queued" || turn.status === "generating") &&
          turn.images.some((image) => image.status === "loading"),
      );
      if (!snapshot || !activeTurn) {
        return;
      }

      activeConversationQueueIds.add(conversationId);
      const activeTurnKey = imageTurnProgressKey(conversationId, activeTurn.id);
      const activeTurnStartedAt = imageTurnStartedAtTimestamp(activeTurn.processingStartedAt, activeTurn.createdAt);
      updateTurnProgress(conversationId, activeTurn.id, {
        message: activeTurn.mode === "chat" ? "正在准备对话请求" : "正在准备生成任务",
        detail:
          activeTurn.mode === "chat"
            ? "正在整理上下文"
            : `准备处理 ${activeTurn.images.filter((image) => image.status === "loading").length || activeTurn.count} 张图片`,
        startedAt: activeTurnStartedAt,
      });
      const applyTasks = async (tasks: CreationTask[]) => {
        const taskMap = new Map(tasks.map((task) => [task.id, task]));
        await updateConversation(conversationId, (current) => {
          const conversation = current ?? snapshot;
          let completedActiveTurn = false;
          const turns = conversation.turns.map((turn) => {
            if (turn.id !== activeTurn.id) {
              return turn;
            }
            const images = turn.images.map((image, imageIndex) => {
              const taskId = image.taskId || image.id;
              const task = taskMap.get(taskId);
              const taskImage = image.taskId === taskId ? image : { ...image, taskId };
              return task ? taskDataToStoredImage(taskImage, task, imageDataIndexForTask(turn.images, imageIndex), turn.visibility) : image;
            });
            const derived = deriveTurnStatusFromTaskMap(turn, images);
            const currentCounts = getImageTurnLoadingCounts(turn);
            const nextCounts = getImageTurnLoadingCounts({ images });
            const nextTurn = {
              ...turn,
              ...derived,
              processingStartedAt:
                nextCounts.running > 0 && currentCounts.running === 0
                  ? new Date().toISOString()
                  : turn.processingStartedAt,
              images,
            };
            if (isTurnInProgress(turn) && !isTurnInProgress(nextTurn)) {
              completedActiveTurn = true;
            }
            return nextTurn;
          });
          const nextConversation = {
            ...conversation,
            turns,
          };
          return completedActiveTurn
            ? {
                ...nextConversation,
                updatedAt: new Date().toISOString(),
              }
            : nextConversation;
        });
      };

      try {
        await updateConversation(conversationId, (current) => {
          const conversation = current ?? snapshot;
          return {
            ...conversation,
            turns: conversation.turns.map((turn) =>
              turn.id === activeTurn.id
                ? {
                    ...turn,
                    status: "generating",
                    error: undefined,
                    images: turn.images.map((image, imageIndex) =>
                      image.status === "loading"
                        ? {
                            ...image,
                            taskId: imageTaskIdForImage(turn.id, turn.images, imageIndex),
                          }
                        : image,
                    ),
                  }
                : turn,
            ),
          };
        });

        updateTurnProgress(conversationId, activeTurn.id, {
          message:
            activeTurn.mode === "chat" ? "正在准备对话请求" : usesReferenceImages(activeTurn.mode) ? "正在整理参考图" : "正在准备生成请求",
          detail:
            activeTurn.mode === "chat"
              ? "正在整理上下文并创建后台任务"
              : usesReferenceImages(activeTurn.mode)
                ? "正在读取参考图并准备上传"
                : "正在创建图片生成任务",
        });
        const referenceImageIds = usesReferenceImages(activeTurn.mode)
          ? await ensureReferenceUploads(conversationId, snapshot, activeTurn)
          : [];
        const taskMessages = buildCreationTaskMessages(snapshot, activeTurn.id);
        const activeTurnSizeRequest =
          activeTurn.mode === "chat"
            ? { selection: undefined, size: "" }
            : buildEffectiveImageSizeRequest(
                activeTurn.model,
                restoreImageSizeSelection(activeTurn.sizeSelection, activeTurn.size),
              );
        const taskOutputFormat = imageOutputFormatForModel(
          activeTurn.model,
          activeTurn.outputFormat || DEFAULT_IMAGE_OUTPUT_FORMAT,
        );
        const taskOutputCompression =
          taskOutputFormat === undefined
            ? undefined
            : imageOutputCompressionForModel(activeTurn.model, taskOutputFormat, activeTurn.outputCompression);
        const taskImageResolution = imageResolutionPresetForModel(activeTurn.model, activeTurnSizeRequest.selection);
        const fallbackReferenceImage = activeTurn.mode === "chat" ? undefined : getFallbackReferenceImage(snapshot, activeTurn.id);
        const pendingTaskGroups = activeTurn.images.reduce<Array<{ taskId: string; count: number }>>(
          (groups, image, imageIndex) => {
            if (image.status !== "loading") {
              return groups;
            }
            const taskId = imageTaskIdForImage(activeTurn.id, activeTurn.images, imageIndex);
            const existing = groups.find((group) => group.taskId === taskId);
            if (existing) {
              existing.count += 1;
            } else {
              groups.push({ taskId, count: 1 });
            }
            return groups;
          },
          [],
        );
        const submitTaskGroup = (group: { taskId: string; count: number }) => {
          if (activeTurn.mode === "chat") {
            if (activeTurn.referenceImages.length > 0) {
              return createChatCompletionTask(
                group.taskId,
                activeTurn.prompt,
                activeTurn.model,
                taskMessages,
                activeTurn.referenceImages.map((img) => ({ name: img.name, dataUrl: img.dataUrl })),
              );
            }
            return createChatCompletionTask(group.taskId, activeTurn.prompt, activeTurn.model, taskMessages);
          }
          if (usesReferenceImages(activeTurn.mode)) {
            return createImageEditTaskFromReferenceIds(
              group.taskId,
              referenceImageIds,
              activeTurn.prompt,
              activeTurn.model,
              activeTurnSizeRequest.size,
              undefined,
              group.count,
              taskMessages,
              activeTurn.visibility || "private",
              taskImageResolution,
              taskOutputFormat,
              taskOutputCompression,
              activeTurn.background ? { background: activeTurn.background } : undefined,
              conversationId,
              fallbackReferenceImage,
            );
          }
          return createImageGenerationTask(
            group.taskId,
            activeTurn.prompt,
            activeTurn.model,
            activeTurnSizeRequest.size,
            undefined,
            group.count,
            taskMessages,
            activeTurn.visibility || "private",
            taskImageResolution,
            taskOutputFormat,
            taskOutputCompression,
            activeTurn.background ? { background: activeTurn.background } : undefined,
            conversationId,
            fallbackReferenceImage,
          );
        };
        updateTurnProgress(conversationId, activeTurn.id, {
          message: activeTurn.mode === "chat" ? "正在提交对话请求" : "正在提交生成请求",
          detail: activeTurn.mode === "chat" ? "对话任务正在入队" : `${pendingTaskGroups.length} 个图片任务正在入队`,
        });
        const submitted = await Promise.all(pendingTaskGroups.map(submitTaskGroup));
        let activeTaskIds = new Set(submitted.filter(isActiveCreationTask).map((task) => task.id));
        await applyTasks(submitted);
        const submittedStatus =
          submitted.length > 0 && submitted.every((task) => task.status === "queued") ? "queued" : "generating";
        updateTurnProgress(conversationId, activeTurn.id, imageTaskProgressMessage({ ...activeTurn, status: submittedStatus }));

        while (true) {
          const latestConversation = conversationsRef.current.find((conversation) => conversation.id === conversationId);
          const latestTurn = latestConversation?.turns.find((turn) => turn.id === activeTurn.id);
          const loadingTaskIds = Array.from(
            new Set(
              latestTurn?.images.flatMap((image) =>
                image.status === "loading" && image.taskId ? [image.taskId] : [],
              ) || [],
            ),
          );
          const pollingTaskIds = Array.from(new Set([...loadingTaskIds, ...activeTaskIds]));
          if (pollingTaskIds.length === 0) {
            break;
          }

          const progressSnapshot = getImageTurnProgressSnapshot()[activeTurnKey];
          const elapsedSeconds =
            progressSnapshot && Number.isFinite(progressSnapshot.startedAt)
              ? Math.max(0, Math.floor((Date.now() - progressSnapshot.startedAt) / 1000))
              : Math.max(0, Math.floor((Date.now() - activeTurnStartedAt) / 1000));
          const progressTurn = latestTurn ?? activeTurn;
          const progressCopy = imageTaskProgressMessage(progressTurn, elapsedSeconds);
          updateTurnProgress(conversationId, activeTurn.id, {
            message: progressCopy.message,
            detail: imageTaskLoadingDetail(progressTurn, progressCopy.detail),
          });
          await sleep(2000);
          const taskList = await fetchCreationTasks(pollingTaskIds);
          activeTaskIds = new Set(taskList.items.filter(isActiveCreationTask).map((task) => task.id));
          if (taskList.items.length > 0) {
            await applyTasks(taskList.items);
          }
          if (taskList.missing_ids.length > 0 && latestTurn) {
            updateTurnProgress(conversationId, activeTurn.id, {
              message: activeTurn.mode === "chat" ? "正在恢复对话任务" : "正在恢复生成任务",
              detail: `${taskList.missing_ids.length} 个任务状态丢失，正在重新提交`,
            });
            const missingTaskGroups = taskList.missing_ids.flatMap((taskId) => {
              const count = latestTurn.images.filter((image) => image.status === "loading" && image.taskId === taskId).length;
              return count > 0 ? [{ taskId, count }] : [];
            });
            const resubmitted = await Promise.all(missingTaskGroups.map(submitTaskGroup));
            if (resubmitted.length > 0) {
              await applyTasks(resubmitted);
            }
          }
        }

        updateTurnProgress(conversationId, activeTurn.id, {
          message: activeTurn.mode === "chat" ? "回复完成" : "生成完成",
          detail: "正在刷新会话",
        });
        if (activeTurn.mode !== "chat") {
          window.dispatchEvent(new Event(QUOTA_REFRESH_EVENT));
        }
        if (session.role === "user") {
          const data = await fetchProfile();
          await setVerifiedAuthSession(authSessionFromLoginResponse(data, session.key));
        }
      } catch (error) {
        const message = formatCreationTaskError(error, activeTurn.mode === "chat" ? "对话请求失败" : "生成图片失败");
        await updateConversation(conversationId, (current) => {
          const conversation = current ?? snapshot;
          return {
            ...conversation,
            updatedAt: new Date().toISOString(),
            turns: conversation.turns.map((turn) =>
              turn.id === activeTurn.id
                ? {
                    ...turn,
                    status: "error",
                    error: message,
                    images: turn.images.map((image) =>
                      image.status === "loading" ? { ...image, status: "error", error: message } : image,
                    ),
                  }
                : turn,
            ),
          };
        });
        toast.error(message);
      } finally {
        clearTurnProgress(conversationId, activeTurn.id);
        cancelledTurnIdsRef.current.delete(activeTurnKey);
        activeConversationQueueIds.delete(conversationId);
        for (const conversation of conversationsRef.current) {
          if (
            !activeConversationQueueIds.has(conversation.id) &&
            conversation.turns.some(
              (turn) =>
                (turn.status === "queued" || turn.status === "generating") &&
                turn.images.some((image) => image.status === "loading"),
            )
          ) {
            void runConversationQueue(conversation.id);
          }
        }
      }
    },
    [clearTurnProgress, ensureReferenceUploads, session.key, session.role, updateConversation, updateTurnProgress],
  );
  useEffect(() => {
    for (const conversation of conversations) {
      if (
        !activeConversationQueueIds.has(conversation.id) &&
        conversation.turns.some(
          (turn) =>
            (turn.status === "queued" || turn.status === "generating") &&
            turn.images.some((image) => image.status === "loading"),
        )
      ) {
        void runConversationQueue(conversation.id);
      }
    }
  }, [conversations, runConversationQueue]);

  const handleRemoveReferenceBackground = useCallback((index: number) => {
    const image = referenceImages[index];
    if (!image) {
      toast.error("未找到对应的参考图");
      return;
    }

    setBackgroundRemovalDraft({
      conversationId: selectedConversationId,
      image: {
        ...image,
        source: image.source || "upload",
        clientReferenceId: createId(),
        uploadStatus: "pending",
        serverReferenceId: undefined,
        uploadError: undefined,
      },
      prompt: "",
    });
  }, [referenceImages, selectedConversationId]);

  const handleSubmitAiBackgroundRemoval = useCallback(
    async () => {
      if (!backgroundRemovalDraft) {
        return;
      }
      const prompt = buildAiBackgroundRemovalPrompt(backgroundRemovalDraft.prompt);
      const { conversationId, image } = backgroundRemovalDraft;
      const targetConversation = conversationId
        ? conversationsRef.current.find((conversation) => conversation.id === conversationId) ?? null
        : null;
      const now = new Date().toISOString();
      const targetConversationId = targetConversation?.id ?? createId();
      const turnId = createId();
      const visibility = defaultImageVisibility || "private";
      const referenceImage: StoredReferenceImage = {
        ...image,
        source: "conversation",
        clientReferenceId: createId(),
        uploadStatus: "pending",
        serverReferenceId: undefined,
        uploadError: undefined,
      };
      const draftTurn: ImageTurn = {
        id: turnId,
        prompt,
        model: effectiveImageModel,
        mode: "edit",
        referenceImages: [referenceImage],
        count: 1,
        size: "",
        sizeSelection: undefined,
        quality: undefined,
        outputFormat: "png",
        outputCompression: undefined,
        background: "transparent",
        visibility,
        images: [
          {
            id: `${turnId}-0`,
            taskId: imageTaskBatchId(turnId, 0),
            taskStatus: "queued",
            status: "loading",
            visibility,
            outputFormat: "png",
          },
        ],
        createdAt: now,
        status: "queued",
      };

      setBackgroundRemovalSubmitting(true);
      try {
        await updateConversation(targetConversationId, (current) => {
          const conversation = current ?? targetConversation;
          return conversation ? {
            ...conversation,
            updatedAt: now,
            turns: [...conversation.turns, draftTurn],
          } : {
            id: targetConversationId,
            title: buildConversationTitle(prompt),
            createdAt: now,
            updatedAt: now,
            turns: [draftTurn],
          };
        });
        setSelectedConversationId(targetConversationId);
        setImageOutputFormat("png");
        setImageOutputCompression("");
        setBackgroundRemovalDraft(null);
        void runConversationQueue(targetConversationId);
        toast.success("已加入 AI 抠图队列，结果可能会重绘");
      } catch (error) {
        toast.error(formatCreationTaskError(error, "提交 AI 抠图失败"));
      } finally {
        setBackgroundRemovalSubmitting(false);
      }
    },
    [
      backgroundRemovalDraft,
      defaultImageVisibility,
      effectiveImageModel,
      runConversationQueue,
      updateConversation,
    ],
  );

  const handleCancelTurn = useCallback(
    async (conversationId: string, turnId: string) => {
      const targetConversation = conversationsRef.current.find((conversation) => conversation.id === conversationId);
      const targetTurn = targetConversation?.turns.find((turn) => turn.id === turnId);
      if (!targetConversation || !targetTurn) {
        toast.error("未找到对应的对话轮次");
        return;
      }
      const taskIds = Array.from(
        new Set(targetTurn.images.flatMap((image) => (image.status === "loading" && image.taskId ? [image.taskId] : []))),
      );
      if (taskIds.length === 0) {
        if (targetTurn.mode === "chat") {
          const turnKey = imageTurnProgressKey(conversationId, turnId);
          cancelledTurnIdsRef.current.add(turnKey);
          clearTurnProgress(conversationId, turnId);
          await updateConversation(conversationId, (current) => {
            const conversation = current ?? targetConversation;
            return {
              ...conversation,
              updatedAt: new Date().toISOString(),
              turns: conversation.turns.map((turn) => {
                if (turn.id !== turnId) {
                  return turn;
                }
                const images = turn.images.map((image) =>
                  image.status === "loading"
                    ? {
                        ...image,
                        status: "cancelled" as const,
                        error: "请求已终止",
                      }
                    : image,
                );
                return {
                  ...turn,
                  ...deriveTurnStatus({ ...turn, images }),
                  images,
                };
              }),
            };
          });
          toast.success("已终止对话请求");
        }
        return;
      }

      const results = await Promise.allSettled(taskIds.map((taskId) => cancelCreationTask(taskId)));
      const taskMap = new Map(
        results.flatMap((result) => (result.status === "fulfilled" ? [[result.value.id, result.value] as const] : [])),
      );
      const failedRequests = results.filter((result) => result.status === "rejected").length;

      await updateConversation(conversationId, (current) => {
        const conversation = current ?? targetConversation;
        return {
          ...conversation,
          updatedAt: new Date().toISOString(),
          turns: conversation.turns.map((turn) => {
            if (turn.id !== turnId) {
              return turn;
            }
            const images = turn.images.map((image, imageIndex) => {
              if (image.status !== "loading") {
                return image;
              }
              const taskId = image.taskId || image.id;
              const task = taskMap.get(taskId);
              if (task) {
                return taskDataToStoredImage({ ...image, taskId }, task, imageDataIndexForTask(turn.images, imageIndex), turn.visibility);
              }
              return {
                ...image,
                taskId,
                status: "cancelled" as const,
                error: failedRequests > 0 ? "终止请求失败，已在本地停止等待" : "任务已终止",
              };
            });
            const derived = deriveTurnStatus({ ...turn, images });
            return {
              ...turn,
              ...derived,
              images,
            };
          }),
        };
      });

      if (failedRequests > 0) {
        toast.error(`部分终止请求失败：${failedRequests}/${taskIds.length}`);
      } else {
        toast.success("已终止生成任务");
      }
    },
    [clearTurnProgress, updateConversation],
  );

  const handleRetryImages = useCallback(
    async (conversationId: string, turnId: string, imageIndexes: number[]) => {
      const uniqueImageIndexes = Array.from(new Set(imageIndexes)).sort((a, b) => a - b);
      if (uniqueImageIndexes.length === 0) {
        return;
      }
      if (uniqueImageIndexes.some((imageIndex) => retryingImageIdsRef.current.has(`${conversationId}:${turnId}:${imageIndex}`))) {
        return;
      }

      const targetConversation = conversationsRef.current.find((conversation) => conversation.id === conversationId);
      const targetTurn = targetConversation?.turns.find((turn) => turn.id === turnId);
      if (!targetConversation || !targetTurn) {
        toast.error("未找到对应的对话轮次");
        return;
      }
      const retryableIndexes = uniqueImageIndexes.filter((imageIndex) => {
        const image = targetTurn.images[imageIndex];
        return image ? isRetryableImageResult(image) : false;
      });
      if (retryableIndexes.length === 0) {
        toast.error(uniqueImageIndexes.length === 1 ? "只有失败图片、缺失数据图片或模型文本回复可以重试" : "没有可重试的失败项");
        return;
      }
      if (!targetTurn.prompt.trim()) {
        toast.error("请输入提示词");
        return;
      }
      if (usesReferenceImages(targetTurn.mode) && targetTurn.referenceImages.length === 0) {
        toast.error("未找到可用的参考图");
        return;
      }

      for (const imageIndex of retryableIndexes) {
        retryingImageIdsRef.current.add(`${conversationId}:${turnId}:${imageIndex}`);
      }
      const now = new Date().toISOString();
      const retryRunId = createId();
      const retryTaskIds = new Map(
        retryableIndexes.map((imageIndex) => [
          imageIndex,
          imageTaskBatchId(`${targetTurn.id}-${retryRunId}`, imageIndex),
        ]),
      );
      try {
        await updateConversation(conversationId, (current) => {
          const conversation = current ?? targetConversation;
          return {
            ...conversation,
            updatedAt: now,
            turns: conversation.turns.map((turn) => {
              if (turn.id !== turnId) {
                return turn;
              }
              const images: StoredImage[] = turn.images.map((image, index) =>
                retryTaskIds.has(index)
                  ? {
                      ...image,
                      taskId: retryTaskIds.get(index),
                      taskStatus: "queued" as const,
                      status: "loading" as const,
                      b64_json: undefined,
                      url: undefined,
                      localUrl: undefined,
                      path: undefined,
                      width: undefined,
                      height: undefined,
                      resolution: undefined,
                      visibility: targetTurn.mode === "chat" ? undefined : targetTurn.visibility || "private",
                      revised_prompt: undefined,
                      text_response: undefined,
                      error: undefined,
                    }
                  : image,
              );
              const derived = deriveTurnStatus({ ...turn, status: "queued", images });
              return {
                ...turn,
                ...derived,
                processingStartedAt: isTurnInProgress(turn) ? turn.processingStartedAt : undefined,
                images,
              };
            }),
          };
        });
        void runConversationQueue(conversationId);
        toast.success(retryableIndexes.length === 1 ? "已加入重试队列" : `已加入 ${retryableIndexes.length} 个重试任务`);
      } catch (error) {
        toast.error(formatCreationTaskError(error, "提交重试失败"));
      } finally {
        for (const imageIndex of retryableIndexes) {
          retryingImageIdsRef.current.delete(`${conversationId}:${turnId}:${imageIndex}`);
        }
      }
    },
    [runConversationQueue, updateConversation],
  );

  const handleRetryImage = useCallback(
    async (conversationId: string, turnId: string, imageIndex: number) => {
      await handleRetryImages(conversationId, turnId, [imageIndex]);
    },
    [handleRetryImages],
  );

  const handleRegenerateTurn = useCallback(
    async (conversationId: string, turnId: string) => {
      const targetConversation = conversationsRef.current.find((conversation) => conversation.id === conversationId);
      const targetTurn = targetConversation?.turns.find((turn) => turn.id === turnId);
      if (!targetConversation || !targetTurn) {
        toast.error("未找到对应的对话轮次");
        return;
      }
      if (!targetTurn.prompt.trim()) {
        toast.error("请输入提示词");
        return;
      }
      if (isTurnInProgress(targetTurn)) {
        toast.error("当前轮次正在处理，稍后再重新生成");
        return;
      }
      if (usesReferenceImages(targetTurn.mode) && targetTurn.referenceImages.length === 0) {
        toast.error("未找到可用的参考图");
        return;
      }

      const now = new Date().toISOString();
      const regenerationId = createId();
      await updateConversation(conversationId, (current) => {
        const conversation = current ?? targetConversation;
        const isFirstTurn = conversation.turns[0]?.id === turnId;
        return {
          ...conversation,
          title: isFirstTurn ? buildConversationTitle(targetTurn.prompt) : conversation.title,
          updatedAt: now,
          turns: conversation.turns.map((turn) => {
            if (turn.id !== turnId) {
              return turn;
            }

            const imageCount = turn.mode === "chat" ? 1 : normalizeRequestedImageCount(turn.count || turn.images.length || 1);
            const visibility = turn.mode === "chat" ? undefined : turn.visibility || "private";
            return {
              ...turn,
              count: imageCount,
              referenceImages: resetReferenceUploads(turn.referenceImages),
              status: "queued",
              error: undefined,
              processingStartedAt: undefined,
              images: Array.from({ length: imageCount }, (_, index): StoredImage => {
                const imageId = `${turn.id}-${regenerationId}-${index}`;
                return {
                  id: imageId,
                  taskId: imageTaskBatchId(`${turn.id}-${regenerationId}`, index),
                  taskStatus: "queued" as const,
                  status: "loading" as const,
                  visibility,
                };
              }),
            };
          }),
        };
      });
      void runConversationQueue(conversationId);
      toast.success("已加入重新生成队列");
    },
    [resetReferenceUploads, runConversationQueue, updateConversation],
  );

  const handleSaveEditingTurn = useCallback(
    async (regenerate: boolean) => {
      const draft = editingTurnDraft;
      if (!draft) {
        return;
      }
      const prompt = draft.prompt.trim();
      if (!prompt) {
        toast.error("请输入提示词");
        return;
      }

      const targetConversation = conversationsRef.current.find((conversation) => conversation.id === draft.conversationId);
      const targetTurn = targetConversation?.turns.find((turn) => turn.id === draft.turnId);
      if (!targetConversation || !targetTurn) {
        toast.error("未找到对应的对话轮次");
        return;
      }
      if (isTurnInProgress(targetTurn)) {
        toast.error("当前轮次正在处理，稍后再编辑");
        return;
      }

      const imageCount = draft.mode === "chat" ? 1 : normalizeRequestedImageCount(draft.count);
      const mode = draft.mode === "chat" ? "chat" : getComposerConversationMode("image", draft.referenceImages);
      const effectiveDraftModel =
        mode === "chat"
          ? hasMenuOption(chatModelOptions, draft.model)
            ? draft.model
            : chatModelOptions[0]?.value || DEFAULT_CHAT_MODEL
          : hasMenuOption(imageCreationModelOptions, draft.model)
            ? draft.model
            : imageCreationModelOptions[0]?.value || DEFAULT_IMAGE_MODEL;
      const referenceImages = usesReferenceImages(mode) ? draft.referenceImages : [];
      const rawDraftSizeSelection = {
        mode: draft.sizeMode,
        aspectRatio: draft.aspectRatio,
        resolution: draft.resolution,
        customRatio: draft.customRatio,
        customWidth: draft.customWidth,
        customHeight: draft.customHeight,
      };
      const draftSizeRequest =
        mode === "chat"
          ? null
          : buildEffectiveImageSizeRequest(effectiveDraftModel, rawDraftSizeSelection);
      if (
        mode !== "chat" &&
        draftSizeRequest &&
        isInvalidCustomRatioSelection(
          draftSizeRequest.selection.mode,
          draftSizeRequest.selection.aspectRatio,
          draftSizeRequest.selection.customRatio,
        )
      ) {
        toast.error("请输入有效的自定义比例，例如 5:4 或 2.39:1");
        return;
      }
      const draftImageSize = draftSizeRequest?.size ?? "";
      const draftStoredSizeSelection = draftSizeRequest ? serializeImageSizeSelection(draftSizeRequest.selection) : undefined;
      if (
        mode !== "chat" &&
        draftSizeRequest?.selection.mode === "custom" &&
        !draftImageSize
      ) {
        toast.error("请填写有效的宽度和高度");
        return;
      }
      const draftOutputFormat =
        mode === "chat" ? undefined : imageOutputFormatForModel(effectiveDraftModel, draft.outputFormat);
      const draftOutputCompression =
        draftOutputFormat === undefined
          ? undefined
          : imageOutputCompressionForModel(draft.model, draftOutputFormat, draft.outputCompression);
      const draftImageResolution = imageResolutionPresetForModel(effectiveDraftModel, draftSizeRequest?.selection);
      if (mode !== "chat" && isHighResolutionImageRequest(draftImageSize, draftImageResolution)) {
        if (regenerate) {
          toast.message(`${formatImageRequestTargetLabel(draftImageSize, draftImageResolution)} 属于高分辨率任务，会直接提交给上游判断。`);
        }
      }
      const now = new Date().toISOString();
      const regenerationId = createId();
      await updateConversation(draft.conversationId, (current) => {
        const conversation = current ?? targetConversation;
        const isFirstTurn = conversation.turns[0]?.id === draft.turnId;
        return {
          ...conversation,
          title: isFirstTurn ? buildConversationTitle(prompt) : conversation.title,
          updatedAt: now,
          turns: conversation.turns.map((turn) => {
            if (turn.id !== draft.turnId) {
              return turn;
            }

            const baseTurn = {
              ...turn,
              prompt,
              model: effectiveDraftModel,
              mode,
              referenceImages: resetReferenceUploads(referenceImages),
              count: imageCount,
              size: draftImageSize,
              sizeSelection: mode === "chat" ? undefined : draftStoredSizeSelection,
              quality: undefined,
              outputFormat: draftOutputFormat,
              outputCompression: draftOutputCompression,
              background: undefined,
              visibility: mode === "chat" ? "private" : draft.visibility,
            };
            if (!regenerate) {
              return baseTurn;
            }
            return {
              ...baseTurn,
              status: "queued" as const,
              error: undefined,
              processingStartedAt: undefined,
              images: Array.from({ length: imageCount }, (_, index): StoredImage => {
                const imageId = `${turn.id}-${regenerationId}-${index}`;
                return {
                  id: imageId,
                  taskId: imageTaskBatchId(`${turn.id}-${regenerationId}`, index),
                  taskStatus: "queued" as const,
                  status: "loading" as const,
                  visibility: baseTurn.mode === "chat" ? undefined : baseTurn.visibility,
                };
              }),
            };
          }),
        };
      });

      setEditingTurnDraft(null);
      if (editFileInputRef.current) {
        editFileInputRef.current.value = "";
      }
      if (regenerate) {
        void runConversationQueue(draft.conversationId);
        toast.success("已保存并加入重新生成队列");
      } else {
        toast.success("已保存编辑设置");
      }
    },
    [chatModelOptions, editingTurnDraft, imageCreationModelOptions, resetReferenceUploads, runConversationQueue, updateConversation],
  );

  const handleSubmit = async () => {
    if (isSubmitDispatchingRef.current) {
      return;
    }

    const prompt = imagePrompt.trim();
    if (!prompt) {
      toast.error("请输入提示词");
      return;
    }
    if (!hasEnoughBilling(session, estimatedBillingUnits)) {
      toast.error(session.billing?.type === "subscription" ? "用户配额不足" : "用户余额不足");
      return;
    }
    isSubmitDispatchingRef.current = true;
    let draftProgressTarget: { conversationId: string; turnId: string } | null = null;

    try {
      const effectiveImageMode = getComposerConversationMode(composerMode, referenceImages);
      const effectiveModel =
        effectiveImageMode === "chat"
          ? pickMenuModel(chatModelOptions, chatModel, DEFAULT_CHAT_MODEL)
          : pickMenuModel(imageCreationModelOptions, imageModel, DEFAULT_IMAGE_MODEL);
      const requestedCount = effectiveImageMode === "chat" ? 1 : parsedCount;
      const rawImageSizeSelection = {
        mode: imageSizeMode,
        aspectRatio: imageAspectRatio,
        resolution: imageResolution,
        customRatio: imageCustomRatio,
        customWidth: imageCustomWidth,
        customHeight: imageCustomHeight,
      };
      const currentImageSizeRequest =
        effectiveImageMode === "chat"
          ? null
          : buildEffectiveImageSizeRequest(effectiveModel, rawImageSizeSelection);
      if (
        effectiveImageMode !== "chat" &&
        currentImageSizeRequest?.selection.mode === "custom" &&
        !currentImageSizeRequest.size
      ) {
        toast.error("请填写有效的宽度和高度");
        return;
      }
      if (
        effectiveImageMode !== "chat" &&
        currentImageSizeRequest &&
        isInvalidCustomRatioSelection(
          currentImageSizeRequest.selection.mode,
          currentImageSizeRequest.selection.aspectRatio,
          currentImageSizeRequest.selection.customRatio,
        )
      ) {
        toast.error("请输入有效的自定义比例，例如 5:4 或 2.39:1");
        return;
      }
      const currentImageSize = currentImageSizeRequest?.size ?? "";
      const currentImageSizeSelection = currentImageSizeRequest
        ? serializeImageSizeSelection(currentImageSizeRequest.selection)
        : undefined;
      const effectiveOutputFormat =
        effectiveImageMode === "chat" ? undefined : imageOutputFormatForModel(effectiveModel, imageOutputFormat);
      const effectiveOutputCompression =
        effectiveOutputFormat === undefined
          ? undefined
          : imageOutputCompressionForModel(effectiveModel, effectiveOutputFormat, imageOutputCompression);
      const effectiveImageResolution = imageResolutionPresetForModel(effectiveModel, currentImageSizeRequest?.selection);
      const isHighResolutionRequest =
        effectiveImageMode !== "chat" &&
        isHighResolutionImageRequest(currentImageSize, effectiveImageResolution);
      if (isHighResolutionRequest) {
        toast.message(`${formatImageRequestTargetLabel(currentImageSize, effectiveImageResolution)} 属于高分辨率任务，会直接提交给上游判断。`);
      }
      const targetConversation = selectedConversationId
        ? conversationsRef.current.find((conversation) => conversation.id === selectedConversationId) ?? null
        : null;
      const now = new Date().toISOString();
      const conversationId = targetConversation?.id ?? createId();
      const turnId = createId();
      const draftTurn: ImageTurn = {
        id: turnId,
        prompt,
        model: effectiveModel,
        mode: effectiveImageMode,
        referenceImages: effectiveImageMode === "chat" ? referenceImages : usesReferenceImages(effectiveImageMode) ? referenceImages : [],
        count: requestedCount,
        size: effectiveImageMode === "chat" ? "" : currentImageSize,
        sizeSelection: effectiveImageMode === "chat" ? undefined : currentImageSizeSelection,
        quality: undefined,
        outputFormat: effectiveOutputFormat,
        outputCompression: effectiveImageMode === "chat" ? undefined : effectiveOutputCompression,
        background: undefined,
        visibility: effectiveImageMode === "chat" ? "private" : defaultImageVisibility,
        images: Array.from({ length: requestedCount }, (_, index): StoredImage => {
          const imageId = `${turnId}-${index}`;
          return {
            id: imageId,
            taskId: imageTaskBatchId(turnId, index),
            taskStatus: "queued" as const,
            status: "loading" as const,
            visibility: effectiveImageMode === "chat" ? undefined : defaultImageVisibility,
          };
        }),
        createdAt: now,
        status: "queued",
      };

      const baseConversation: ImageConversation = targetConversation
        ? {
            ...targetConversation,
            updatedAt: now,
            turns: [...targetConversation.turns, draftTurn],
          }
        : {
            id: conversationId,
            title: buildConversationTitle(prompt),
            createdAt: now,
            updatedAt: now,
            turns: [draftTurn],
          };

      draftProgressTarget = { conversationId, turnId };
      updateTurnProgress(conversationId, turnId, {
        message: "正在创建本地记录",
        detail: effectiveImageMode === "chat" ? "正在保存对话内容" : "正在保存提示词和生成参数",
        startedAt: Date.parse(now),
      });
      setSelectedConversationId(conversationId);
      clearComposerInputs();

      await persistConversation(baseConversation);
      void runConversationQueue(conversationId);

      const targetStats = getImageConversationStats(baseConversation);
      if (targetStats.running > 0 || targetStats.queued > 1) {
        toast.success("已加入当前对话队列");
      } else if (!targetConversation) {
        toast.success(effectiveImageMode === "chat" ? "已创建新对话并发送" : "已创建新对话并开始处理");
      } else {
        toast.success("已发送到当前对话");
      }
    } catch (error) {
      if (draftProgressTarget) {
        clearTurnProgress(draftProgressTarget.conversationId, draftProgressTarget.turnId);
      }
      toast.error(formatCreationTaskError(error, "提交任务失败"));
    } finally {
      isSubmitDispatchingRef.current = false;
    }
  };

  return (
    <>
      <section
        className={cn(
          "relative grid h-full min-h-0 w-full grid-cols-1 gap-2 px-0 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] sm:gap-3 sm:pb-3 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)]",
          isEmbeddedMode && "gap-1 pb-0 sm:gap-2 sm:pb-1 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[270px_minmax(0,1fr)]",
        )}
        style={
          {
            "--image-composer-dock-height": `${composerDockHeight}px`,
          } as CSSProperties
        }
      >
        <div className={cn("hidden h-full min-h-0 border-r border-[#f2f3f5] pr-3 lg:block", isEmbeddedMode && "pr-2")}>
          <Suspense fallback={<ImageLazyLoading label="加载历史..." />}>
            <ImageSidebar
              conversations={conversations}
              isLoadingHistory={isLoadingHistory}
              selectedConversationId={selectedConversationId}
              onCreateDraft={handleCreateDraft}
              onClearHistory={openClearHistoryConfirm}
              onSelectConversation={setSelectedConversationId}
              onDeleteConversation={openDeleteConversationConfirm}
              formatConversationTime={formatConversationTime}
            />
          </Suspense>
        </div>

        <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
          <DialogContent className="flex h-[min(82dvh,760px)] w-[92vw] max-w-[460px] flex-col overflow-hidden rounded-[32px] border-white/80 bg-white p-0 shadow-[0_32px_110px_-38px_rgba(15,23,42,0.45)] sm:rounded-[36px]">
            <DialogHeader className="px-6 pt-7 pb-4 sm:px-8">
              <DialogTitle className="flex items-center gap-2 text-xl font-bold tracking-tight">
                <History className="size-5" />
                历史记录
              </DialogTitle>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8 sm:px-8">
              <Suspense fallback={<ImageLazyLoading label="加载历史..." />}>
                <ImageSidebar
                  conversations={conversations}
                  isLoadingHistory={isLoadingHistory}
                  selectedConversationId={selectedConversationId}
                  onCreateDraft={() => {
                    handleCreateDraft();
                    setIsHistoryOpen(false);
                  }}
                  onClearHistory={openClearHistoryConfirm}
                  onSelectConversation={(id) => {
                    setSelectedConversationId(id);
                    setIsHistoryOpen(false);
                  }}
                  onDeleteConversation={openDeleteConversationConfirm}
                  formatConversationTime={formatConversationTime}
                  hideActionButtons
                />
              </Suspense>
            </div>
          </DialogContent>
        </Dialog>

        {editingTurnDraft ? (
          <Dialog open onOpenChange={(open) => (!open ? setEditingTurnDraft(null) : null)}>
            <DialogContent className="flex max-h-[88dvh] w-[min(92vw,640px)] flex-col overflow-hidden rounded-[28px] p-0">
              <DialogHeader className="px-6 pt-6 pb-2">
                <DialogTitle>{editingTurnDraft.mode === "chat" ? "编辑对话" : "编辑生成设置"}</DialogTitle>
                <DialogDescription>
                  {editingTurnDraft.mode === "chat" ? "修改本轮消息和对话模型。" : "修改本轮提示词、参考图和生成参数。"}
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                <div className="flex flex-col gap-5">
                  <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                    提示词
                    <Textarea
                      value={editingTurnDraft.prompt}
                      onChange={(event) =>
                        setEditingTurnDraft((current) =>
                          current ? { ...current, prompt: event.target.value } : current,
                        )
                      }
                      className="min-h-[128px] resize-y rounded-2xl border-stone-200 bg-white text-sm leading-6 shadow-none"
                    />
                  </label>

                  {editingTurnDraft.mode !== "chat" ? (
                  <div className="flex flex-col gap-3">
                    <input
                      ref={editFileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(event) => {
                        void handleEditReferenceImageChange(Array.from(event.target.files || []));
                      }}
                    />
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-stone-700">参考图</div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-full border-stone-200 bg-white"
                        onClick={() => editFileInputRef.current?.click()}
                      >
                        <ImagePlus className="size-4" />
                        上传图片
                      </Button>
                    </div>
                    {editingTurnDraft.referenceImages.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {editingTurnDraft.referenceImages.map((image, index) => (
                          <div key={`${image.name}-${index}`} className="relative size-20 shrink-0">
                            <button
                              type="button"
                              className="size-20 overflow-hidden rounded-2xl border border-stone-200 bg-stone-100"
                              onClick={() =>
                                openLightbox(
                                  editingTurnDraft.referenceImages.map((item, itemIndex) => ({
                                    id: `${item.name}-${itemIndex}`,
                                    src: item.dataUrl,
                                  })),
                                  index,
                                )
                              }
                              aria-label={`预览参考图 ${image.name || index + 1}`}
                            >
                              <img
                                src={image.dataUrl}
                                alt={image.name || `参考图 ${index + 1}`}
                                className="h-full w-full object-cover"
                              />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveEditReferenceImage(index)}
                              className="absolute -top-1 -right-1 z-10 inline-flex size-6 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-500 shadow-sm transition hover:text-stone-900"
                              aria-label={`移除参考图 ${image.name || index + 1}`}
                            >
                              <X className="size-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  ) : null}

                  <div className={cn("grid grid-cols-1 gap-3", editingTurnDraft.mode === "chat" ? "sm:grid-cols-1" : "sm:grid-cols-2 lg:grid-cols-4")}>
                    {editingTurnDraft.mode !== "chat" ? (
                    <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                      张数
                      <Input
                        type="number"
                        inputMode="numeric"
                        min="1"
                        max="10"
                        step="1"
                        value={editingTurnDraft.count}
                        onChange={(event) =>
                          setEditingTurnDraft((current) =>
                            current ? { ...current, count: event.target.value } : current,
                          )
                        }
                      />
                    </label>
                    ) : null}
                    <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                      模型
                      <Select
                        value={editingTurnDraft.model}
                        onValueChange={(value) =>
                          setEditingTurnDraft((current) =>
                            current && isImageModel(value) ? { ...current, model: value } : current,
                          )
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {(editingTurnDraft.mode === "chat" ? chatModelOptions : imageCreationModelOptions).map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </label>
                    {editingTurnDraft.mode !== "chat" && editingDraftEffectiveSizeSelection ? (
                      <>
                        <div className="rounded-2xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-900 sm:col-span-2 lg:col-span-4">
                          {editingDraftStructuredParameters
                            ? "Codex 图片链路会下发目标尺寸；格式由后端保存结果时处理，压缩率仅适用于 JPEG。"
                            : editingDraftPixelIconSizeSelected
                              ? "像素图标尺寸会作为目标尺寸提交，不叠加分辨率预设。"
                            : editingDraftResolutionControlsVisible
                              ? "常规/官方图片线路会提交分辨率预设，画幅仍作为构图偏好；实际像素以上游返回为准。"
                              : "当前图片线路只会把比例作为构图偏好，实际尺寸以上游返回为准；格式由后端保存结果时处理。"}
                        </div>
                        <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                          画幅
                          <Select
                            value={editingDraftEffectiveSizeSelection.mode}
                            onValueChange={(value) =>
                              setEditingTurnDraft((current) =>
                                current && isImageSizeMode(value) ? { ...current, sizeMode: value } : current,
                              )
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                {IMAGE_SIZE_MODE_OPTIONS.filter((option) => editingDraftStructuredParameters || option.value !== "custom").map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        </label>
                        {editingDraftStructuredParameters && editingDraftEffectiveSizeSelection.mode === "custom" ? (
                          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2 lg:col-span-2">
                            <label className="flex min-w-0 flex-col gap-2 text-sm font-medium text-stone-700">
                              宽度
                              <Input
                                type="number"
                                inputMode="numeric"
                                min="1"
                                step="1"
                                value={editingTurnDraft.customWidth}
                                onChange={(event) =>
                                  setEditingTurnDraft((current) =>
                                    current ? { ...current, customWidth: event.target.value } : current,
                                  )
                                }
                              />
                            </label>
                            <span className="pb-2 text-sm font-medium text-stone-400">x</span>
                            <label className="flex min-w-0 flex-col gap-2 text-sm font-medium text-stone-700">
                              高度
                              <Input
                                type="number"
                                inputMode="numeric"
                                min="1"
                                step="1"
                                value={editingTurnDraft.customHeight}
                                onChange={(event) =>
                                  setEditingTurnDraft((current) =>
                                    current ? { ...current, customHeight: event.target.value } : current,
                                  )
                                }
                              />
                            </label>
                          </div>
                        ) : null}
                        {editingDraftEffectiveSizeSelection.mode === "ratio" ? (
                          <>
                            <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                              画幅/尺寸
                              <Select
                                value={editingTurnDraft.aspectRatio || EMPTY_IMAGE_ASPECT_RATIO_SELECT_VALUE}
                                onValueChange={(value) =>
                                  setEditingTurnDraft((current) =>
                                    current && (value === EMPTY_IMAGE_ASPECT_RATIO_SELECT_VALUE || isImageAspectRatio(value))
                                      ? {
                                          ...current,
                                          aspectRatio:
                                            value === EMPTY_IMAGE_ASPECT_RATIO_SELECT_VALUE
                                              ? ""
                                              : value,
                                          resolution: isPixelIconSize(value) ? "auto" : current.resolution,
                                        }
                                      : current,
                                  )
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectGroup>
                                    <SelectLabel>常用画幅</SelectLabel>
                                    {IMAGE_ASPECT_RATIO_OPTIONS.filter((option) => option.value !== CUSTOM_IMAGE_ASPECT_RATIO).map((option) => (
                                      <SelectItem
                                        key={option.label}
                                        value={option.value || EMPTY_IMAGE_ASPECT_RATIO_SELECT_VALUE}
                                      >
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectGroup>
                                  <SelectSeparator />
                                  <SelectGroup>
                                    <SelectLabel>像素图标尺寸</SelectLabel>
                                    {PIXEL_ICON_SIZE_OPTIONS.map((option) => (
                                      <SelectItem key={option.label} value={option.value}>
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectGroup>
                                  <SelectSeparator />
                                  <SelectGroup>
                                    <SelectLabel>自定义</SelectLabel>
                                    <SelectItem value={CUSTOM_IMAGE_ASPECT_RATIO}>自定义比例</SelectItem>
                                  </SelectGroup>
                                </SelectContent>
                              </Select>
                            </label>
                            {editingDraftResolutionControlsVisible ? (
                              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                                分辨率
                                <Select
                                  value={editingTurnDraft.resolution}
                                  onValueChange={(value) =>
                                    setEditingTurnDraft((current) =>
                                      current && isImageResolution(value) ? { ...current, resolution: value } : current,
                                    )
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectGroup>
                                      {IMAGE_RESOLUTION_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                          {option.label}
                                        </SelectItem>
                                      ))}
                                    </SelectGroup>
                                  </SelectContent>
                                </Select>
                              </label>
                            ) : null}
                            {editingTurnDraft.aspectRatio === CUSTOM_IMAGE_ASPECT_RATIO ? (
                              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700 sm:col-span-2">
                                自定义比例
                                <Input
                                  value={editingTurnDraft.customRatio}
                                  onChange={(event) =>
                                    setEditingTurnDraft((current) =>
                                      current ? { ...current, customRatio: event.target.value } : current,
                                    )
                                  }
                                  placeholder="例如 5:4 / 2.39:1"
                                  aria-invalid={editingDraftCustomRatioInvalid}
                                  className={cn(editingDraftCustomRatioInvalid && "border-red-300 focus-visible:ring-red-500/20")}
                                />
                              </label>
                            ) : null}
                          </>
                        ) : null}
                        {editingDraftOutputControls ? (
                          <ImageOutputControls
                            outputFormat={editingTurnDraft.outputFormat}
                            outputCompression={editingTurnDraft.outputCompression}
                            onOutputFormatChange={(outputFormat) =>
                              setEditingTurnDraft((current) =>
                                current ? { ...current, outputFormat } : current,
                              )
                            }
                            onOutputCompressionChange={(outputCompression) =>
                              setEditingTurnDraft((current) =>
                                current ? { ...current, outputCompression } : current,
                              )
                            }
                            fieldClassName="flex flex-col gap-2 text-sm font-medium text-stone-700"
                            selectTriggerClassName=""
                            inputClassName=""
                            compressionPlaceholderDisabled="仅 JPEG"
                          />
                        ) : null}
                        {editingDraftEffectiveSizeSelection.mode !== "auto" ? (
                          <>
                            <div className="rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm sm:col-span-2 lg:col-span-4">
                              <div className="flex min-w-0 items-center justify-between gap-3">
                                <span className="shrink-0 font-medium text-stone-600">
                                  {editingDraftStructuredParameters || editingDraftPixelIconSizeSelected
                                    ? "目标尺寸"
                                    : editingDraftResolutionControlsVisible
                                      ? "分辨率预设"
                                      : "画幅偏好"}
                                </span>
                                <span className={cn(
                                  "min-w-0 truncate text-right font-mono font-semibold",
                                  editingDraftSizeIsHighResolution ? "text-amber-700" : "text-stone-900",
                                )}>
                                  {editingDraftSizePreviewLabel}
                                </span>
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
                                <span className="min-w-0 truncate">{editingDraftSizePreviewDetail}</span>
                                {editingDraftSizeIsHighResolution ? (
                                  <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-amber-100">
                                    高分辨率目标
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            {editingDraftSizeIsHighResolution ? (
                              <div className="rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 sm:col-span-2 lg:col-span-4">
                                {highResolutionHint}
                              </div>
                            ) : null}
                          </>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
              <DialogFooter className="border-t border-stone-100 px-6 py-4">
                <Button variant="outline" onClick={() => setEditingTurnDraft(null)}>
                  取消
                </Button>
                <Button variant="outline" onClick={() => void handleSaveEditingTurn(false)}>
                  保存
                </Button>
                <Button onClick={() => void handleSaveEditingTurn(true)}>
                  {editingTurnDraft.mode === "chat" ? "保存并重新发送" : "保存并重新生成"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}

        <div className={cn("relative flex min-h-0 min-w-0 flex-col gap-2 sm:gap-4", isEmbeddedMode && "sm:gap-2")}>
          <div className={cn("flex items-center justify-between gap-2 px-1 sm:px-4", isEmbeddedMode && "sm:px-2")}>
            <div className="flex min-w-0 flex-1 items-center gap-2 lg:hidden">
              <Button
                variant="outline"
                className="h-10 min-w-0 flex-1 shrink rounded-full border-[#e5e7eb] bg-white text-[#45515e] shadow-sm"
                onClick={() => setIsHistoryOpen(true)}
              >
                <History className="size-4" />
                <span className="truncate">历史记录 ({conversations.length})</span>
              </Button>
              <Button
                className="h-10 rounded-full shadow-sm"
                onClick={handleCreateDraft}
              >
                <Plus className="size-4" />
                新建
              </Button>
              <Button
                variant="outline"
                className="h-10 rounded-full border-[#e5e7eb] bg-white px-3 text-[#45515e] shadow-sm"
                onClick={openClearHistoryConfirm}
                disabled={conversations.length === 0}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>

          <div
            ref={resultsViewportRef}
            className={cn(
              "hide-scrollbar min-h-0 flex-1 overflow-y-auto px-1 pt-2 pb-[14rem] sm:px-4 sm:pt-4 sm:pb-[15rem] xl:px-6",
              isEmbeddedMode && "sm:px-2 sm:pt-2 xl:px-3",
            )}
            style={composerDockHeight > 0 ? { paddingBottom: composerDockHeight + (isEmbeddedMode ? 12 : 24) } : undefined}
          >
            <Suspense fallback={<ImageLazyLoading label="加载结果区..." className="min-h-[160px]" />}>
              <ImageResults
                selectedConversation={selectedConversation}
                progressByTurnKey={progressByTurnKey}
                progressNow={progressNow}
                promptPresets={IMAGE_PROMPT_PRESETS}
                onOpenLightbox={openLightbox}
                onApplyPromptPreset={handleApplyPromptPreset}
                onContinueEdit={handleContinueEdit}
                onContinueEditBatch={handleContinueEditBatch}
                onEditTurn={openEditTurnDialog}
                onCancelTurn={handleCancelTurn}
                onRegenerateTurn={handleRegenerateTurn}
                onRetryImage={handleRetryImage}
                onRetryImages={handleRetryImages}
                onImageVisibilityChange={handleImageVisibilityChange}
                visibilityMutatingImageKey={visibilityMutatingImageKey}
                formatConversationTime={formatConversationTime}
              />
            </Suspense>
          </div>

          <div
            ref={composerDockRef}
            className={cn(
              "pointer-events-none absolute inset-x-0 bottom-0 z-30 px-1 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] sm:px-4 sm:pb-2",
              isEmbeddedMode && "sm:px-2 sm:pb-1",
            )}
            style={
              {
                "--image-composer-dock-height": `${composerDockHeight}px`,
              } as CSSProperties
            }
          >
            <div className={cn("pointer-events-auto mx-auto w-full", isEmbeddedMode ? "max-w-[1280px]" : "max-w-[1120px]")}>
              <ImageComposer
                composerMode={composerMode}
                prompt={imagePrompt}
                imageCount={imageCount}
                imageModel={composerModel}
                imageModelOptions={composerModelOptions}
                imageSizeMode={imageSizeMode}
                imageAspectRatio={imageAspectRatio}
                imageResolution={imageResolution}
                imageCustomRatio={imageCustomRatio}
                imageCustomWidth={imageCustomWidth}
                imageCustomHeight={imageCustomHeight}
                imageOutputFormat={imageOutputFormat}
                imageOutputCompression={imageOutputCompression}
                highResolutionHint={highResolutionHint}
                estimatedImagePriceLabel={estimatedImagePriceLabel}
                billingBlocked={billingBlocked}
                referenceImages={referenceImages}
                textareaRef={textareaRef}
                fileInputRef={fileInputRef}
                onComposerModeChange={handleComposerModeChange}
                onPromptChange={setImagePrompt}
                onImageCountChange={setImageCount}
                onImageModelChange={handleComposerModelChange}
                onImageSizeModeChange={setImageSizeMode}
                onImageAspectRatioChange={setImageAspectRatio}
                onImageResolutionChange={setImageResolution}
                onImageCustomRatioChange={setImageCustomRatio}
                onImageCustomWidthChange={setImageCustomWidth}
                onImageCustomHeightChange={setImageCustomHeight}
                onImageOutputFormatChange={setImageOutputFormat}
                onImageOutputCompressionChange={setImageOutputCompression}
                onOpenPromptMarket={() => setIsPromptMarketOpen(true)}
                onSubmit={handleSubmit}
                onReferenceImageChange={handleReferenceImageChange}
                onImageResultDrop={handleImageResultDrop}
                onManagedImageDrop={handleManagedImageReference}
                onRemoveReferenceImage={handleRemoveReferenceImage}
                onRemoveReferenceBackground={handleRemoveReferenceBackground}
              />
            </div>
          </div>
        </div>

        {canUseImageAssets ? (
          <ManagedImageAssetDock
            activated={assetSidebarActivated}
            assetCount={assets.length}
            assets={assets}
            loadingAssets={loadingAssets}
            loadingMoreAssets={loadingMoreAssets}
            hasMoreAssets={hasMoreAssets}
            onActivate={activateAssetSidebar}
            onRefreshAssets={() => void loadAssets()}
            onLoadMoreAssets={() => void loadMoreAssets()}
            onAddAssetToComposer={(asset) => void handleManagedImageReference(asset)}
            storagePrefix={IMAGE_ASSET_SIDEBAR_STORAGE_PREFIX}
            triggerClassName="top-5 bottom-[calc(var(--image-composer-dock-height,0px)+1.25rem)] w-[52px]"
            loadingClassName="top-5 right-0 bottom-[calc(var(--image-composer-dock-height,0px)+1.25rem)] w-[360px] rounded-l-2xl border-y border-l p-3"
            sideOffsetClassName="bottom-[calc(var(--image-composer-dock-height,0px)+1.25rem)] right-0 top-5 rounded-l-2xl border-y border-l"
            collapsedClassName="w-[52px] translate-x-0 p-2"
            expandedClassName="w-[360px] translate-x-0 p-3"
            wideClassName="w-[560px] translate-x-0 p-3"
            defaultExpanded
            onExpandedChange={handleAssetSidebarExpandedChange}
            title="图片库"
            subtitle={`${assets.length} 张素材 · 拖到输入框`}
            emptyLabel="图片库暂无图片"
            collapsedTitle="展开图片库"
          />
        ) : null}
      </section>

      {lightboxOpen ? (
        <Suspense fallback={<ImageOverlayLoading label="加载预览..." />}>
          <ImageLightbox
            images={lightboxImages}
            currentIndex={lightboxIndex}
            open={lightboxOpen}
            onOpenChange={setLightboxOpen}
            onIndexChange={setLightboxIndex}
          />
        </Suspense>
      ) : null}

      {isPromptMarketOpen ? (
        <Suspense fallback={<ImageOverlayLoading label="加载提示词..." />}>
          <ImagePromptMarket
            open={isPromptMarketOpen}
            onOpenChange={setIsPromptMarketOpen}
            onApplyPrompt={handleApplyMarketPrompt}
          />
        </Suspense>
      ) : null}

      {backgroundRemovalDraft ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !backgroundRemovalSubmitting) {
              setBackgroundRemovalDraft(null);
            }
          }}
        >
          <DialogContent showCloseButton={!backgroundRemovalSubmitting} className="rounded-2xl p-6 sm:max-w-[640px]">
            <DialogHeader className="gap-2">
              <DialogTitle>AI 抠图</DialogTitle>
              <DialogDescription className="text-sm leading-6">
                参考下方图片自动识别主体并移除背景，输出透明 PNG。
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-1">
              <button
                type="button"
                className="group relative overflow-hidden rounded-2xl border border-stone-200 bg-[linear-gradient(45deg,#e7e5e4_25%,transparent_25%),linear-gradient(-45deg,#e7e5e4_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#e7e5e4_75%),linear-gradient(-45deg,transparent_75%,#e7e5e4_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0]"
                onClick={() =>
                  openLightbox(
                    [{
                      id: backgroundRemovalDraft.image.clientReferenceId || backgroundRemovalDraft.image.name || "background-removal-reference",
                      src: backgroundRemovalDraft.image.dataUrl,
                    }],
                    0,
                  )
                }
                aria-label="预览待抠图图片"
              >
                <img
                  src={backgroundRemovalDraft.image.dataUrl}
                  alt={backgroundRemovalDraft.image.name || "待抠图图片"}
                  className="mx-auto max-h-[320px] w-full object-contain"
                />
                <span className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-black/65 px-3 py-1 text-xs font-bold text-white opacity-0 transition group-hover:opacity-100">
                  点击预览
                </span>
              </button>
              <label className="text-sm font-medium text-stone-700" htmlFor="background-removal-prompt">
                抠图说明
              </label>
              <Textarea
                id="background-removal-prompt"
                value={backgroundRemovalDraft.prompt}
                onChange={(event) =>
                  setBackgroundRemovalDraft((current) =>
                    current ? { ...current, prompt: event.target.value } : current,
                  )
                }
                placeholder="可选，例如：保留所有主体和细节，边缘尽量自然。"
                className="min-h-28 resize-y"
                disabled={backgroundRemovalSubmitting}
              />
              <p className="text-xs leading-5 text-stone-500">
                AI 会判断主体边界，复杂照片效果更稳定；结果可能轻微重绘图片细节。
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBackgroundRemovalDraft(null)} disabled={backgroundRemovalSubmitting}>
                取消
              </Button>
              <Button
                onClick={() => void handleSubmitAiBackgroundRemoval()}
                disabled={backgroundRemovalSubmitting}
              >
                {backgroundRemovalSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : null}
                AI 抠图
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {publishImageTarget ? (
        <Dialog open onOpenChange={(open) => (!open && !visibilityMutatingImageKey ? setPublishImageTarget(null) : null)}>
          <DialogContent showCloseButton={false} className="rounded-2xl p-6">
            <DialogHeader className="gap-2">
              <DialogTitle>公开图片</DialogTitle>
              <DialogDescription className="text-sm leading-6">
                将这张图片加入公开图库。
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-1">
              <label className="flex items-start gap-3 rounded-xl border border-stone-200 bg-white px-3 py-3 text-sm">
                <Checkbox
                  className="mt-0.5"
                  checked={publishRecipeOptions.sharePromptParameters}
                  onCheckedChange={(checked) =>
                    setPublishRecipeOptions({
                      sharePromptParameters: checked === true,
                      shareReferenceImages: checked === true ? publishRecipeOptions.shareReferenceImages : false,
                    })
                  }
                />
                <span className="min-w-0">
                  <span className="block font-medium text-stone-900">公开原始提示词和生成参数</span>
                  <span className="mt-0.5 block text-xs leading-5 text-stone-500">公开图库会展示可复用的 prompt、模型、尺寸和输出设置。</span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-xl border border-stone-200 bg-white px-3 py-3 text-sm">
                <Checkbox
                  className="mt-0.5"
                  checked={publishRecipeOptions.shareReferenceImages}
                  disabled={!publishRecipeOptions.sharePromptParameters}
                  onCheckedChange={(checked) =>
                    setPublishRecipeOptions((current) => ({
                      ...current,
                      shareReferenceImages: checked === true,
                    }))
                  }
                />
                <span className="min-w-0">
                  <span className="block font-medium text-stone-900">公开原始参考图用于同款生成</span>
                  <span className="mt-0.5 block text-xs leading-5 text-stone-500">其他用户复用时可以读取这些参考图；不勾选时会改用公开成品图。</span>
                </span>
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPublishImageTarget(null)} disabled={visibilityMutatingImageKey !== ""}>
                取消
              </Button>
              <Button onClick={() => void handleConfirmPublishImage()} disabled={visibilityMutatingImageKey !== ""}>
                {visibilityMutatingImageKey ? <LoaderCircle className="size-4 animate-spin" /> : <Globe2 className="size-4" />}
                公开
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {deleteConfirm ? (
        <Dialog open onOpenChange={(open) => (!open ? setDeleteConfirm(null) : null)}>
          <DialogContent showCloseButton={false} className="rounded-2xl p-6">
            <DialogHeader className="gap-2">
              <DialogTitle>{deleteConfirmTitle}</DialogTitle>
              <DialogDescription className="text-sm leading-6">
                {deleteConfirmDescription}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
                取消
              </Button>
              <Button className="bg-rose-600 text-white hover:bg-rose-700" onClick={() => void handleConfirmDelete()}>
                确认删除
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}

export default function ImagePage() {
  const { isCheckingAuth, session } = useAuthGuard(undefined, "/image");

  if (isCheckingAuth || !session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-stone-400" />
      </div>
    );
  }

  return <ImagePageContent session={session} />;
}
