"use client";

import localforage from "localforage";

import {
  DEFAULT_CHAT_MODEL,
  DEFAULT_IMAGE_MODEL,
  CHAT_MODEL_OPTIONS,
  IMAGE_CREATION_MODEL_OPTIONS,
  isChatModel,
  isImageCreationModel,
  isImageModel,
  isImageOutputFormat,
  isImageQuality,
  midjourneyVersionSupportsStop,
  supportsImageOutputCompression,
  type GeminiFlashSettingsPayload,
  type ImageModel,
  type MidjourneySettingsPayload,
  type ImageOutputFormat,
  type ImageQuality,
  type ImageVisibility,
} from "@/lib/api";
import type { ImageTaskToolOptions } from "@/lib/image-task-request";
import { getManagedImagePathFromUrl, getManagedImageUrlFromPath } from "@/lib/image-path";
import { compactImageModelSettings, type ImageModelSettingsState } from "@/lib/image-model-settings";
import { getStoredAuthSession, type StoredAuthSession } from "@/store/auth";

export type ImageConversationMode = "chat" | "generate" | "image" | "edit";
export type ImageConversationKind = "normal" | "arena";
export type ImageArenaConversationMode = "chat" | "image";
export type StoredReferenceImageSource = "upload" | "conversation";
export type StoredReferenceImageUploadStatus = "pending" | "uploading" | "uploaded" | "error";

export type StoredReferenceImage = {
  name: string;
  type: string;
  dataUrl: string;
  publicUrl?: string;
  source?: StoredReferenceImageSource;
  clientReferenceId?: string;
  uploadStatus?: StoredReferenceImageUploadStatus;
  serverReferenceId?: string;
  uploadError?: string;
  originalSize?: number;
  compressedSize?: number;
};

export type StoredImage = {
  id: string;
  taskId?: string;
  status?: "loading" | "success" | "error" | "cancelled" | "message";
  taskStatus?: "queued" | "running" | "success" | "error" | "cancelled";
  path?: string;
  visibility?: ImageVisibility;
  b64_json?: string;
  url?: string;
  localUrl?: string;
  width?: number;
  height?: number;
  resolution?: string;
  outputFormat?: ImageOutputFormat;
  revised_prompt?: string;
  error?: string;
  text_response?: string;
};

export type ImageTurnStatus = "queued" | "generating" | "success" | "error" | "cancelled" | "message";

export type StoredImageSizeSelection = {
  mode: string;
  aspectRatio: string;
  resolution: string;
  customRatio?: string;
  customWidth: string;
  customHeight: string;
};

export type ImageArenaAgentSlot = {
  id: string;
  model: ImageModel;
  modelLabel: string;
  familyId: string;
  imageModelSettings?: ImageModelSettingsState;
  midjourneySettings?: MidjourneySettingsPayload;
  geminiFlashSettings?: GeminiFlashSettingsPayload;
  officialImageSettings?: ImageTaskToolOptions;
  geminiProSettings?: ImageTaskToolOptions;
};

export type ImageArenaRunStatus = "idle" | "submitting" | "queued" | "running" | "success" | "error" | "cancelled" | "blocked";

export type ImageArenaRun = {
  id: string;
  slotId: string;
  model: ImageModel;
  modelLabel: string;
  familyId: string;
  imageModelSettings?: ImageModelSettingsState;
  midjourneySettings?: MidjourneySettingsPayload;
  geminiFlashSettings?: GeminiFlashSettingsPayload;
  officialImageSettings?: ImageTaskToolOptions;
  geminiProSettings?: ImageTaskToolOptions;
  taskId?: string;
  status: ImageArenaRunStatus;
  error?: string;
  warnings?: string[];
  submittedFields?: Record<string, unknown>;
  usageTokens?: number;
  textResponse?: string;
  images?: StoredImage[];
  startedAt?: string;
  completedAt?: string;
};

export type ImageTurn = {
  id: string;
  prompt: string;
  model: ImageModel;
  mode: ImageConversationMode;
  arenaMode?: ImageArenaConversationMode;
  agentSlots?: ImageArenaAgentSlot[];
  arenaRuns?: ImageArenaRun[];
  referenceImages: StoredReferenceImage[];
  count: number;
  size: string;
  sizeSelection?: StoredImageSizeSelection;
  quality?: ImageQuality;
  outputFormat?: ImageOutputFormat;
  outputCompression?: number;
  background?: string;
  moderation?: string;
  inputImageMask?: string;
  partialImages?: number;
  midjourneySettings?: MidjourneySettingsPayload;
  geminiFlashSettings?: GeminiFlashSettingsPayload;
  visibility?: ImageVisibility;
  images: StoredImage[];
  createdAt: string;
  processingStartedAt?: string;
  status: ImageTurnStatus;
  error?: string;
};

export type ImageConversation = {
  id: string;
  kind?: ImageConversationKind;
  title: string;
  createdAt: string;
  updatedAt: string;
  turns: ImageTurn[];
};

export type ImageConversationStats = {
  queued: number;
  running: number;
};

export type ImageTurnLoadingCounts = {
  queued: number;
  running: number;
};

export type ImageTurnLoadingPhase = "queued" | "running" | "idle";

const imageConversationStorage = localforage.createInstance({
  name: "chatgpt2api",
  storeName: "image_conversations",
});

export const IMAGE_CONVERSATIONS_CHANGED_EVENT = "chatgpt2api:image-conversations-changed";
export const ACTIVE_IMAGE_CONVERSATION_STORAGE_KEY = "chatgpt2api:image_active_conversation_id";
export const IMAGE_ACTIVE_CONVERSATION_REQUEST_EVENT = "chatgpt2api:image-open-conversation";
const IMAGE_CONVERSATIONS_KEY_PREFIX = "items";
let imageConversationWriteQueue: Promise<void> = Promise.resolve();

function dispatchImageConversationsChanged() {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(IMAGE_CONVERSATIONS_CHANGED_EVENT));
}

export function getImageTurnLoadingCounts(turn: { images: StoredImage[] }): ImageTurnLoadingCounts {
  const loadingImages = turn.images.filter((image) => image.status === "loading");
  return {
    queued: loadingImages.filter((image) => image.taskStatus !== "running").length,
    running: loadingImages.filter((image) => image.taskStatus === "running").length,
  };
}

export function getImageTurnLoadingPhase(turn: { images: StoredImage[] }): ImageTurnLoadingPhase {
  const { queued, running } = getImageTurnLoadingCounts(turn);
  if (running > 0) {
    return "running";
  }
  if (queued > 0) {
    return "queued";
  }
  return "idle";
}

export function getStoredImageLoadingPhase(image: StoredImage): ImageTurnLoadingPhase {
  if (image.status !== "loading") {
    return "idle";
  }
  return image.taskStatus === "running" ? "running" : "queued";
}

function conversationScopeFromSession(session: StoredAuthSession | null) {
  if (!session) {
    return "anonymous";
  }
  const subjectId = session.subjectId.trim();
  if (!subjectId) {
    return `${session.provider || "local"}:${session.role}:unknown`;
  }
  return `${session.provider || "local"}:${session.role}:${subjectId}`;
}

async function imageConversationsStorageKey() {
  const session = await getStoredAuthSession();
  return `${IMAGE_CONVERSATIONS_KEY_PREFIX}:${conversationScopeFromSession(session)}`;
}

function normalizeStoredImage(image: StoredImage): StoredImage {
  const url = typeof image.url === "string" && image.url ? image.url : undefined;
  const path = typeof image.path === "string" && image.path ? image.path : undefined;
  const localUrl =
    typeof image.localUrl === "string" && image.localUrl
      ? image.localUrl
      : path
        ? getManagedImageUrlFromPath(path)
        : undefined;
  const width = Number(image.width);
  const height = Number(image.height);
  const resolution = typeof image.resolution === "string" && image.resolution ? image.resolution : undefined;
  const taskStatus =
    image.taskStatus === "queued" ||
    image.taskStatus === "running" ||
    image.taskStatus === "success" ||
    image.taskStatus === "error" ||
    image.taskStatus === "cancelled"
      ? image.taskStatus
      : image.status === "loading"
        ? "queued"
        : undefined;
  const normalized = {
    ...image,
    taskId: typeof image.taskId === "string" && image.taskId ? image.taskId : undefined,
    taskStatus,
    path:
      path
        ? path
        : localUrl || url
          ? getManagedImagePathFromUrl(localUrl || url || "") || undefined
          : undefined,
    visibility:
      image.visibility === "public" || image.visibility === "private" ? image.visibility : undefined,
    url,
    localUrl,
    width: Number.isFinite(width) && width > 0 ? width : undefined,
    height: Number.isFinite(height) && height > 0 ? height : undefined,
    resolution,
    outputFormat: isImageOutputFormat(image.outputFormat) ? image.outputFormat : undefined,
    revised_prompt: typeof image.revised_prompt === "string" ? image.revised_prompt : undefined,
    text_response: typeof image.text_response === "string" && image.text_response ? image.text_response : undefined,
  };
  const hasImageOutput = Boolean(image.b64_json || image.url || image.localUrl || path);
  if (image.status === "loading") {
    return hasImageOutput ? { ...normalized, status: "success" } : normalized;
  }
  if (image.status === "error" || image.status === "success" || image.status === "cancelled" || image.status === "message") {
    return image.status === "success" && !hasImageOutput
      ? { ...normalized, status: "error", error: image.error || "生成已完成，但结果图片数据缺失" }
      : normalized;
  }
  return {
    ...normalized,
    status: hasImageOutput ? "success" : "loading",
  };
}

function normalizeReferenceImage(image: StoredReferenceImage & Record<string, unknown>): StoredReferenceImage {
  const source =
    image.source === "upload" || image.source === "conversation"
      ? image.source
      : undefined;
  const uploadStatus =
    image.uploadStatus === "pending" ||
    image.uploadStatus === "uploading" ||
    image.uploadStatus === "uploaded" ||
    image.uploadStatus === "error"
      ? image.uploadStatus
      : undefined;
  const originalSize = Number(image.originalSize);
  const compressedSize = Number(image.compressedSize);

  return {
    name: image.name || "reference.png",
    type: image.type || "image/png",
    dataUrl: image.dataUrl,
    ...(typeof image.publicUrl === "string" && image.publicUrl ? { publicUrl: image.publicUrl } : {}),
    ...(source ? { source } : {}),
    ...(typeof image.clientReferenceId === "string" && image.clientReferenceId ? { clientReferenceId: image.clientReferenceId } : {}),
    ...(uploadStatus ? { uploadStatus: uploadStatus === "uploading" ? "pending" : uploadStatus } : {}),
    ...(typeof image.serverReferenceId === "string" && image.serverReferenceId ? { serverReferenceId: image.serverReferenceId } : {}),
    ...(typeof image.uploadError === "string" && image.uploadError ? { uploadError: image.uploadError } : {}),
    ...(Number.isFinite(originalSize) && originalSize > 0 ? { originalSize } : {}),
    ...(Number.isFinite(compressedSize) && compressedSize > 0 ? { compressedSize } : {}),
  };
}

function normalizeImageMode(value: unknown, referenceImages: StoredReferenceImage[]): ImageConversationMode {
  if (value === "chat") {
    return "chat";
  }
  if (value === "generate") {
    return "generate";
  }
  if (value === "image") {
    return "image";
  }
  if (value === "edit") {
    return referenceImages.some((image) => image.source === "conversation") ? "edit" : "image";
  }
  return referenceImages.length > 0 ? "image" : "generate";
}

function normalizeSizeSelection(value: unknown): StoredImageSizeSelection | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const source = value as Record<string, unknown>;
  const selection = {
    mode: typeof source.mode === "string" ? source.mode : "",
    aspectRatio: typeof source.aspectRatio === "string" ? source.aspectRatio : "",
    resolution: typeof source.resolution === "string" ? source.resolution : "",
    customRatio: typeof source.customRatio === "string" ? source.customRatio : "",
    customWidth: typeof source.customWidth === "string" ? source.customWidth : "",
    customHeight: typeof source.customHeight === "string" ? source.customHeight : "",
  };
  if (
    !selection.mode &&
    !selection.aspectRatio &&
    !selection.resolution &&
    !selection.customRatio &&
    !selection.customWidth &&
    !selection.customHeight
  ) {
    return undefined;
  }
  return selection;
}

function normalizeOutputCompression(value: unknown): number | undefined {
  if (value === undefined || value === null || String(value).trim() === "") {
    return undefined;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return undefined;
  }
  return Math.min(100, Math.round(numeric));
}

function normalizeConversationKind(value: unknown): ImageConversationKind {
  return value === "arena" ? "arena" : "normal";
}

function normalizeArenaMode(value: unknown, fallbackMode: ImageConversationMode): ImageArenaConversationMode | undefined {
  if (value === "chat" || value === "image") {
    return value;
  }
  if (fallbackMode === "chat") {
    return "chat";
  }
  return undefined;
}

function modelLabel(model: ImageModel, label: unknown) {
  if (typeof label === "string" && label.trim()) {
    return label;
  }
  const option = [...CHAT_MODEL_OPTIONS, ...IMAGE_CREATION_MODEL_OPTIONS].find((item) => item.value === model);
  return option?.label || model;
}

function normalizeArenaAgentSlot(slot: ImageArenaAgentSlot & Record<string, unknown>, fallbackIndex: number): ImageArenaAgentSlot | null {
  const model = isImageModel(slot.model) ? slot.model : undefined;
  if (!model) {
    return null;
  }
  const familyId = typeof slot.familyId === "string" && slot.familyId ? slot.familyId : model;
  const imageModelSettings = compactImageModelSettings((slot.imageModelSettings || {
    midjourney: slot.midjourneySettings,
    geminiFlash: slot.geminiFlashSettings,
    officialImage: slot.officialImageSettings,
    geminiPro: slot.geminiProSettings,
  }) as ImageModelSettingsState);
  return {
    id: String(slot.id || `slot-${fallbackIndex}`),
    model,
    modelLabel: modelLabel(model, slot.modelLabel),
    familyId,
    imageModelSettings,
    midjourneySettings: normalizeMidjourneySettings(imageModelSettings?.midjourney || slot.midjourneySettings),
    geminiFlashSettings: normalizeGeminiFlashSettings(imageModelSettings?.geminiFlash || slot.geminiFlashSettings),
    officialImageSettings: normalizeImageToolOptions(imageModelSettings?.officialImage || slot.officialImageSettings),
    geminiProSettings: normalizeImageToolOptions(imageModelSettings?.geminiPro || slot.geminiProSettings),
  };
}

function normalizeArenaRunStatus(value: unknown): ImageArenaRunStatus {
  if (
    value === "idle" ||
    value === "submitting" ||
    value === "queued" ||
    value === "running" ||
    value === "success" ||
    value === "error" ||
    value === "cancelled" ||
    value === "blocked"
  ) {
    return value;
  }
  return "idle";
}

function normalizeTokenCount(value: unknown): number | undefined {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return undefined;
  }
  return Math.round(numeric);
}

function normalizeArenaRun(run: ImageArenaRun & Record<string, unknown>, fallbackIndex: number): ImageArenaRun | null {
  const model = isImageModel(run.model) ? run.model : undefined;
  if (!model) {
    return null;
  }
  const images = Array.isArray(run.images) ? run.images.map(normalizeStoredImage) : undefined;
  const imageModelSettings = compactImageModelSettings((run.imageModelSettings || {
    midjourney: run.midjourneySettings,
    geminiFlash: run.geminiFlashSettings,
    officialImage: run.officialImageSettings,
    geminiPro: run.geminiProSettings,
  }) as ImageModelSettingsState);
  return {
    id: String(run.id || `run-${fallbackIndex}`),
    slotId: String(run.slotId || run.id || `slot-${fallbackIndex}`),
    model,
    modelLabel: modelLabel(model, run.modelLabel),
    familyId: typeof run.familyId === "string" && run.familyId ? run.familyId : model,
    imageModelSettings,
    midjourneySettings: normalizeMidjourneySettings(imageModelSettings?.midjourney || run.midjourneySettings),
    geminiFlashSettings: normalizeGeminiFlashSettings(imageModelSettings?.geminiFlash || run.geminiFlashSettings),
    officialImageSettings: normalizeImageToolOptions(imageModelSettings?.officialImage || run.officialImageSettings),
    geminiProSettings: normalizeImageToolOptions(imageModelSettings?.geminiPro || run.geminiProSettings),
    taskId: typeof run.taskId === "string" && run.taskId ? run.taskId : undefined,
    status: normalizeArenaRunStatus(run.status),
    error: typeof run.error === "string" ? run.error : undefined,
    warnings: Array.isArray(run.warnings) ? run.warnings.filter((item): item is string => typeof item === "string") : undefined,
    submittedFields: run.submittedFields && typeof run.submittedFields === "object" ? run.submittedFields as Record<string, unknown> : undefined,
    usageTokens: normalizeTokenCount(run.usageTokens),
    textResponse: typeof run.textResponse === "string" ? run.textResponse : undefined,
    images,
    startedAt: typeof run.startedAt === "string" ? run.startedAt : undefined,
    completedAt: typeof run.completedAt === "string" ? run.completedAt : undefined,
  };
}

function normalizeMidjourneySettings(value: unknown): MidjourneySettingsPayload | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const source = value as Record<string, unknown>;
  const out: MidjourneySettingsPayload = {};
  for (const key of ["version", "speed", "quality"] as const) {
    if (typeof source[key] === "string" && source[key].trim()) {
      out[key] = source[key].trim();
    }
  }
  for (const key of ["stylize", "chaos", "weird", "stop"] as const) {
    if (key === "stop" && !midjourneyVersionSupportsStop(out.version)) {
      continue;
    }
    const numberValue = Number(source[key]);
    if (Number.isFinite(numberValue)) {
      out[key] = Math.round(numberValue);
    }
  }
  for (const key of ["niji", "raw", "tile"] as const) {
    if (source[key] === true) {
      out[key] = true;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeGeminiFlashSettings(value: unknown): GeminiFlashSettingsPayload | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const source = value as Record<string, unknown>;
  const out: GeminiFlashSettingsPayload = {};
  if (source.google_search === true || source.google_image_search === true) {
    out.google_search = true;
  }
  if (source.google_image_search === false) {
    out.google_image_search = false;
  } else if (source.google_image_search === true) {
    out.google_image_search = true;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeImageToolOptions(value: unknown): ImageTaskToolOptions | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const source = value as Record<string, unknown>;
  const out: ImageTaskToolOptions = {};
  for (const key of ["background", "moderation", "style"] as const) {
    if (typeof source[key] === "string" && source[key].trim()) {
      out[key] = source[key].trim();
    }
  }
  const inputImageMask = typeof source.inputImageMask === "string" && source.inputImageMask.trim()
    ? source.inputImageMask.trim()
    : typeof source.input_image_mask === "string" && source.input_image_mask.trim()
      ? source.input_image_mask.trim()
      : typeof source.mask_url === "string" && source.mask_url.trim()
        ? source.mask_url.trim()
        : "";
  if (inputImageMask) {
    out.inputImageMask = inputImageMask;
  }
  const partialImages = Number(source.partialImages ?? source.partial_images);
  if (Number.isFinite(partialImages) && partialImages > 0) {
    out.partialImages = Math.round(partialImages);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function normalizePositiveInt(value: unknown): number | undefined {
  if (value === undefined || value === null || String(value).trim() === "") {
    return undefined;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return undefined;
  }
  return Math.round(numeric);
}

function dataUrlMimeType(dataUrl: string) {
  const match = dataUrl.match(/^data:(.*?);base64,/);
  return match?.[1] || "image/png";
}

function getLegacyReferenceImages(source: Record<string, unknown>): StoredReferenceImage[] {
  if (Array.isArray(source.referenceImages)) {
    return source.referenceImages
      .filter((image): image is StoredReferenceImage => {
        if (!image || typeof image !== "object") {
          return false;
        }
        const candidate = image as StoredReferenceImage;
        return typeof candidate.dataUrl === "string" && candidate.dataUrl.length > 0;
      })
      .map(normalizeReferenceImage);
  }

  if (source.sourceImage && typeof source.sourceImage === "object") {
    const image = source.sourceImage as { dataUrl?: unknown; fileName?: unknown };
    if (typeof image.dataUrl === "string" && image.dataUrl) {
      return [
        {
          name: typeof image.fileName === "string" && image.fileName ? image.fileName : "reference.png",
          type: dataUrlMimeType(image.dataUrl),
          dataUrl: image.dataUrl,
          source: "upload",
        },
      ];
    }
  }

  return [];
}

function normalizeTurn(turn: ImageTurn & Record<string, unknown>): ImageTurn {
  const normalizedImages = Array.isArray(turn.images) ? turn.images.map(normalizeStoredImage) : [];
  const referenceImages = getLegacyReferenceImages(turn);
  const mode = normalizeImageMode(turn.mode, referenceImages);
  const sizeSelection = normalizeSizeSelection(turn.sizeSelection);
  const visibility: ImageVisibility = turn.visibility === "public" ? "public" : "private";
  const images = normalizedImages.map((image) =>
    image.visibility ? image : { ...image, visibility },
  );
  const model =
    mode === "chat"
      ? isChatModel(turn.model)
        ? turn.model
        : DEFAULT_CHAT_MODEL
      : isImageCreationModel(turn.model)
        ? turn.model
        : DEFAULT_IMAGE_MODEL;
  const loadingPhase = getImageTurnLoadingPhase({ images });
  const derivedStatus: ImageTurnStatus =
    loadingPhase === "running"
      ? "generating"
      : loadingPhase === "queued"
        ? "queued"
        : images.some((image) => image.status === "error")
        ? "error"
        : images.some((image) => image.status === "cancelled")
          ? "cancelled"
          : images.some((image) => image.status === "message")
            ? "message"
            : "success";
  const storedStatus: ImageTurnStatus | undefined =
    turn.status === "queued" ||
    turn.status === "generating" ||
    turn.status === "success" ||
    turn.status === "error" ||
    turn.status === "cancelled" ||
    turn.status === "message"
      ? turn.status
      : undefined;
  const inputImageMask =
    typeof turn.inputImageMask === "string" && turn.inputImageMask
      ? turn.inputImageMask
      : typeof turn.input_image_mask === "string" && turn.input_image_mask
        ? turn.input_image_mask
        : undefined;

  return {
    id: String(turn.id || `${Date.now()}`),
    prompt: String(turn.prompt || ""),
    model,
    mode,
    arenaMode: normalizeArenaMode(turn.arenaMode, mode),
    agentSlots: Array.isArray(turn.agentSlots)
      ? turn.agentSlots
          .map((slot, index) => normalizeArenaAgentSlot(slot as ImageArenaAgentSlot & Record<string, unknown>, index))
          .filter((slot): slot is ImageArenaAgentSlot => Boolean(slot))
      : undefined,
    arenaRuns: Array.isArray(turn.arenaRuns)
      ? turn.arenaRuns
          .map((run, index) => normalizeArenaRun(run as ImageArenaRun & Record<string, unknown>, index))
          .filter((run): run is ImageArenaRun => Boolean(run))
      : undefined,
    referenceImages,
    count: Math.max(1, Number(turn.count || images.length || 1)),
    size: typeof turn.size === "string" ? turn.size : "",
    ...(sizeSelection ? { sizeSelection } : {}),
    quality: isImageQuality(turn.quality) ? turn.quality : undefined,
    outputFormat: isImageOutputFormat(turn.outputFormat) ? turn.outputFormat : undefined,
    outputCompression:
      isImageOutputFormat(turn.outputFormat) && supportsImageOutputCompression(model, turn.outputFormat)
        ? normalizeOutputCompression(turn.outputCompression)
        : undefined,
    background: typeof turn.background === "string" && turn.background ? turn.background : undefined,
    moderation: typeof turn.moderation === "string" && turn.moderation ? turn.moderation : undefined,
    inputImageMask,
    partialImages: normalizePositiveInt(turn.partialImages),
    midjourneySettings: normalizeMidjourneySettings(turn.midjourneySettings),
    geminiFlashSettings: normalizeGeminiFlashSettings(turn.geminiFlashSettings),
    visibility,
    images,
    createdAt: String(turn.createdAt || new Date().toISOString()),
    processingStartedAt: typeof turn.processingStartedAt === "string" ? turn.processingStartedAt : undefined,
    status: images.length > 0 ? derivedStatus : storedStatus || derivedStatus,
    error: typeof turn.error === "string" ? turn.error : undefined,
  };
}

function normalizeConversation(conversation: ImageConversation & Record<string, unknown>): ImageConversation {
  const legacyReferenceImages = getLegacyReferenceImages(conversation);
  const legacyMode = normalizeImageMode(conversation.mode, legacyReferenceImages);
  const turns = Array.isArray(conversation.turns)
    ? conversation.turns.map((turn) => normalizeTurn(turn as ImageTurn & Record<string, unknown>))
    : [
        normalizeTurn({
          id: String(conversation.id || `${Date.now()}`),
          prompt: String(conversation.prompt || ""),
          model: isImageModel(conversation.model)
            ? conversation.model
            : legacyMode === "chat"
              ? DEFAULT_CHAT_MODEL
              : DEFAULT_IMAGE_MODEL,
          mode: legacyMode,
          referenceImages: legacyReferenceImages,
          count: Number(conversation.count || 1),
          size: typeof conversation.size === "string" ? conversation.size : "",
          quality: isImageQuality(conversation.quality) ? conversation.quality : undefined,
          outputFormat: isImageOutputFormat(conversation.outputFormat) ? conversation.outputFormat : undefined,
          outputCompression: normalizeOutputCompression(conversation.outputCompression),
          background: typeof conversation.background === "string" && conversation.background ? conversation.background : undefined,
          moderation: typeof conversation.moderation === "string" && conversation.moderation ? conversation.moderation : undefined,
          partialImages: normalizePositiveInt(conversation.partialImages),
          images: Array.isArray(conversation.images) ? (conversation.images as StoredImage[]) : [],
          createdAt: String(conversation.createdAt || new Date().toISOString()),
          status:
            conversation.status === "generating" || conversation.status === "success" || conversation.status === "error" || conversation.status === "message"
              ? conversation.status
              : "success",
          error: typeof conversation.error === "string" ? conversation.error : undefined,
        }),
      ];
  const lastTurn = turns.length > 0 ? turns[turns.length - 1] : null;

  return {
    id: String(conversation.id || `${Date.now()}`),
    kind: normalizeConversationKind(conversation.kind),
    title: String(conversation.title || ""),
    createdAt: String(conversation.createdAt || lastTurn?.createdAt || new Date().toISOString()),
    updatedAt: String(conversation.updatedAt || lastTurn?.createdAt || new Date().toISOString()),
    turns,
  };
}

function sortImageConversations(conversations: ImageConversation[]): ImageConversation[] {
  return [...conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function getTimestamp(value: string) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function pickLatestConversation(current: ImageConversation, next: ImageConversation) {
  return getTimestamp(next.updatedAt) >= getTimestamp(current.updatedAt) ? next : current;
}

function queueImageConversationWrite<T>(operation: () => Promise<T>): Promise<T> {
  const result = imageConversationWriteQueue.then(operation);
  imageConversationWriteQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function readStoredImageConversations(storageKey?: string): Promise<ImageConversation[]> {
  storageKey = storageKey || await imageConversationsStorageKey();
  const items =
    (await imageConversationStorage.getItem<Array<ImageConversation & Record<string, unknown>>>(
      storageKey,
    )) || [];
  return items.map(normalizeConversation);
}

export async function listImageConversations(): Promise<ImageConversation[]> {
  return sortImageConversations(await readStoredImageConversations());
}

export async function saveImageConversations(conversations: ImageConversation[]): Promise<void> {
  await queueImageConversationWrite(async () => {
    const storageKey = await imageConversationsStorageKey();
    const items = await readStoredImageConversations(storageKey);
    const conversationMap = new Map(items.map((item) => [item.id, item]));
    for (const conversation of conversations.map(normalizeConversation)) {
      const current = conversationMap.get(conversation.id);
      conversationMap.set(conversation.id, current ? pickLatestConversation(current, conversation) : conversation);
    }
    await imageConversationStorage.setItem(
      storageKey,
      sortImageConversations([...conversationMap.values()]),
    );
    dispatchImageConversationsChanged();
  });
}

export async function saveImageConversation(conversation: ImageConversation): Promise<void> {
  await queueImageConversationWrite(async () => {
    const storageKey = await imageConversationsStorageKey();
    const items = await readStoredImageConversations(storageKey);
    const nextConversation = normalizeConversation(conversation);
    const current = items.find((item) => item.id === nextConversation.id);
    const persistedConversation = current ? pickLatestConversation(current, nextConversation) : nextConversation;
    const nextItems = sortImageConversations([
      persistedConversation,
      ...items.filter((item) => item.id !== persistedConversation.id),
    ]);
    await imageConversationStorage.setItem(storageKey, nextItems);
    dispatchImageConversationsChanged();
  });
}

export async function deleteImageConversation(id: string): Promise<void> {
  await queueImageConversationWrite(async () => {
    const storageKey = await imageConversationsStorageKey();
    const items = await readStoredImageConversations(storageKey);
    await imageConversationStorage.setItem(
      storageKey,
      items.filter((item) => item.id !== id),
    );
    dispatchImageConversationsChanged();
  });
}

export async function clearImageConversations(): Promise<void> {
  await queueImageConversationWrite(async () => {
    await imageConversationStorage.removeItem(await imageConversationsStorageKey());
    dispatchImageConversationsChanged();
  });
}

export function getImageConversationStats(conversation: ImageConversation | null): ImageConversationStats {
  if (!conversation) {
    return { queued: 0, running: 0 };
  }

  return conversation.turns.reduce(
    (acc, turn) => {
      if (conversation.kind === "arena" && turn.arenaRuns?.length) {
        for (const run of turn.arenaRuns) {
          if (run.status === "queued" || run.status === "idle" || run.status === "submitting") {
            acc.queued += 1;
          } else if (run.status === "running") {
            acc.running += 1;
          }
        }
        return acc;
      }
      if (turn.status === "queued") {
        acc.queued += 1;
      } else if (turn.status === "generating") {
        acc.running += 1;
      }
      return acc;
    },
    { queued: 0, running: 0 },
  );
}
