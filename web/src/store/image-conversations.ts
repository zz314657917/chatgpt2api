"use client";

import localforage from "localforage";

import {
  DEFAULT_CHAT_MODEL,
  DEFAULT_IMAGE_MODEL,
  isChatModel,
  isImageCreationModel,
  isImageModel,
  isImageOutputFormat,
  isImageQuality,
  supportsImageOutputCompression,
  type ImageModel,
  type MidjourneySettingsPayload,
  type ImageOutputFormat,
  type ImageQuality,
  type ImageVisibility,
} from "@/lib/api";
import { getManagedImagePathFromUrl, getManagedImageUrlFromPath } from "@/lib/image-path";
import { getStoredAuthSession, type StoredAuthSession } from "@/store/auth";

export type ImageConversationMode = "chat" | "generate" | "image" | "edit";
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

export type ImageTurn = {
  id: string;
  prompt: string;
  model: ImageModel;
  mode: ImageConversationMode;
  referenceImages: StoredReferenceImage[];
  count: number;
  size: string;
  sizeSelection?: StoredImageSizeSelection;
  quality?: ImageQuality;
  outputFormat?: ImageOutputFormat;
  outputCompression?: number;
  background?: string;
  moderation?: string;
  partialImages?: number;
  midjourneySettings?: MidjourneySettingsPayload;
  visibility?: ImageVisibility;
  images: StoredImage[];
  createdAt: string;
  processingStartedAt?: string;
  status: ImageTurnStatus;
  error?: string;
};

export type ImageConversation = {
  id: string;
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

  return {
    id: String(turn.id || `${Date.now()}`),
    prompt: String(turn.prompt || ""),
    model,
    mode,
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
    partialImages: normalizePositiveInt(turn.partialImages),
    midjourneySettings: normalizeMidjourneySettings(turn.midjourneySettings),
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
