"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, CircleStop, Clock3, Download, Eye, Globe2, LoaderCircle, Lock, PencilLine, Plus, RotateCcw, Sparkles } from "lucide-react";

import { AuthenticatedImage } from "@/components/authenticated-image";
import { Button } from "@/components/ui/button";
import { IMAGE_RESULT_DRAG_MIME, type ImageResultDragPayload } from "@/app/image/image-result-drag";
import type { ImagePromptPreset } from "@/app/image/image-presets";
import { fetchManagedImageDetail, IMAGE_MODEL_ROUTE_DETAILS } from "@/lib/api";
import type { ImageVisibility } from "@/lib/api";
import {
  fetchAuthenticatedImageBlob,
  getCachedAuthenticatedImageByteSize,
  shouldUseAuthenticatedImageFallback,
} from "@/lib/authenticated-image";
import { getManagedImagePathFromUrl, getManagedImageThumbnailUrlFromPath, getManagedImageUrlFromPath } from "@/lib/image-path";
import { formatImageSizeDisplay, getImageSizeRequirementLabel, isHighResolutionImageSize, supportsImageOutputCompression } from "@/lib/image-parameters";
import { formatBase64ImageFileSize, formatImageFileSize } from "@/lib/image-size";
import { cn } from "@/lib/utils";
import {
  getImageTurnLoadingPhase,
  getStoredImageLoadingPhase,
  type ImageConversation,
  type ImageTurn,
  type ImageTurnStatus,
  type StoredImage,
  type StoredReferenceImage,
} from "@/store/image-conversations";
import { imageTurnStartedAtTimestamp, type ImageTurnProgress } from "@/store/image-turn-progress";

export type ImageLightboxItem = {
  id: string;
  src: string;
  fileName?: string;
  outputFormat?: string;
  sizeLabel?: string;
  dimensions?: string;
};

type DownloadableImage = {
  id: string;
  selectionKey: string;
  src: string;
  fileName: string;
  imageIndex: number;
};

type ImageResultsProps = {
  selectedConversation: ImageConversation | null;
  progressByTurnKey: Record<string, ImageTurnProgress>;
  progressNow: number;
  promptPresets: readonly ImagePromptPreset[];
  onOpenLightbox: (images: ImageLightboxItem[], index: number) => void;
  onApplyPromptPreset: (preset: ImagePromptPreset) => void | Promise<void>;
  onContinueEdit: (conversationId: string, image: StoredImage | StoredReferenceImage) => void;
  onContinueEditBatch: (conversationId: string, images: StoredImage[]) => void;
  onEditTurn: (conversationId: string, turnId: string) => void;
  onCancelTurn: (conversationId: string, turnId: string) => void | Promise<void>;
  onRegenerateTurn: (conversationId: string, turnId: string) => void | Promise<void>;
  onRetryImage: (conversationId: string, turnId: string, imageIndex: number) => void | Promise<void>;
  onRetryImages: (conversationId: string, turnId: string, imageIndexes: number[]) => void | Promise<void>;
  onImageVisibilityChange: (
    conversationId: string,
    turnId: string,
    imageIndex: number,
    visibility: ImageVisibility,
  ) => void | Promise<void>;
  visibilityMutatingImageKey: string;
  formatConversationTime: (value: string) => string;
};

function getStoredImageSrc(image: StoredImage) {
  if (image.b64_json) {
    return `data:image/${image.outputFormat || "png"};base64,${image.b64_json}`;
  }
  if (image.localUrl || image.url) {
    return image.localUrl || image.url || "";
  }
  return image.path ? getManagedImageUrlFromPath(image.path) : "";
}

function getStoredImagePreviewSrc(image: StoredImage) {
  if (image.b64_json) {
    return getStoredImageSrc(image);
  }
  const managedPath = image.path || getManagedImagePathFromUrl(image.localUrl || image.url || "");
  return managedPath ? getManagedImageThumbnailUrlFromPath(managedPath) : getStoredImageSrc(image);
}

function isTurnBusy(turn: ImageTurn) {
  return (
    turn.status === "queued" ||
    turn.status === "generating" ||
    turn.images.some((image) => image.status === "loading")
  );
}

function hasStoredImageOutput(image: StoredImage) {
  return Boolean(image.b64_json || image.url || image.localUrl || image.path);
}

function isRetryableImageResult(image: StoredImage) {
  return image.status === "error" || image.status === "message" || (image.status === "success" && !hasStoredImageOutput(image));
}

function imageSelectionKey(conversationId: string, turnId: string, imageId: string) {
  return `${conversationId}:${turnId}:${imageId}`;
}

function setImageResultDragData(dataTransfer: DataTransfer, payload: ImageResultDragPayload, imageSrc: string) {
  const encoded = JSON.stringify(payload);
  dataTransfer.effectAllowed = "copy";
  dataTransfer.setData(IMAGE_RESULT_DRAG_MIME, encoded);
  dataTransfer.setData("text/plain", imageSrc);
  dataTransfer.setData("text/uri-list", imageSrc);
}

function getImageFormatLabel(image: StoredImage, src: string) {
  const dataUrlFormat = src.match(/^data:image\/([^;,]+)/i)?.[1];
  const imageUrl = image.localUrl || image.url || "";
  const urlFormat = imageUrl ? imageUrl.split("?")[0]?.match(/\.([a-z0-9]+)$/i)?.[1] : "";
  const normalized = String(dataUrlFormat || urlFormat || (image.b64_json ? "png" : "png")).toLowerCase();
  const format = normalized === "jpeg" ? "jpg" : normalized;
  return `IMAGE ${format.toUpperCase()}`;
}

function imageResolutionLabel(image: StoredImage, dimensions?: string) {
  if (image.resolution) {
    return image.resolution.replace(/x/g, " x ");
  }
  if (image.width && image.height) {
    return formatImageDimensions(image.width, image.height);
  }
  return dimensions || "";
}

function getTurnResultSizeLabel(
  turn: ImageTurn,
  dimensionsByImageId: Record<string, string>,
  detailMetaByImageId: Record<string, ImageDetailMeta>,
) {
  const labels = Array.from(
    new Set(
      turn.images
        .filter((image) => image.status === "success")
        .map((image) => imageResolutionLabel(
          image,
          imageDimensionsFromMeta(detailMetaByImageId[image.id]) || dimensionsByImageId[image.id],
        ))
        .filter(Boolean),
    ),
  );
  if (labels.length === 1) {
    return `结果 ${labels[0]}`;
  }
  if (labels.length > 1) {
    return `结果 ${labels.length} 种尺寸`;
  }
  return "";
}

function getRequestedSizeLabel(turn: ImageTurn) {
  if (!turn.size) {
    return "";
  }
  const size = turn.size.includes("x") ? formatImageSizeDisplay(turn.size) : turn.size;
  const requirement = getImageSizeRequirementLabel(turn.size);
  return requirement === "Auto" ? `画幅 ${size}` : `目标 ${size} / ${requirement}`;
}

function getLongTaskHint(turn: ImageTurn, elapsedSeconds: number) {
  void elapsedSeconds;
  if (!isTurnBusy(turn) || turn.mode === "chat") {
    return "";
  }
  if (isHighResolutionImageSize(turn.size)) {
    return "高分辨率目标已提交给上游判断";
  }
  return "";
}

type ImageDetailMeta = {
  width?: number;
  height?: number;
  size?: number;
};

function positiveImageDimension(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function imagePathForMetadata(image: StoredImage) {
  return image.path || getManagedImagePathFromUrl(image.localUrl || image.url || "");
}

function imageDimensionsFromMeta(meta?: ImageDetailMeta) {
  const width = positiveImageDimension(meta?.width);
  const height = positiveImageDimension(meta?.height);
  return width && height ? formatImageDimensions(width, height) : "";
}

function imageNeedsDetailMeta(image: StoredImage) {
  return image.status === "success" && (!image.width || !image.height) && Boolean(imagePathForMetadata(image));
}

function imageVisibilityLabel(visibility?: ImageVisibility) {
  return visibility === "public" ? "已公开" : "私有";
}

function imageVisibilityPillClass(visibility?: ImageVisibility) {
  return visibility === "public"
    ? "bg-[#e8f2ff] text-[#1456f0] ring-1 ring-[#bfdbfe]"
    : "bg-[#181e25]/82 text-white ring-1 ring-white/20";
}

function imageVisibilityActionClass(visibility?: ImageVisibility) {
  return visibility === "public"
    ? "bg-white/95 text-[#1456f0] hover:bg-[#e8f2ff]"
    : "bg-white/95 text-stone-800 hover:bg-stone-100";
}

function blurFocusedElementInContainer(container: HTMLElement) {
  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLElement && container.contains(activeElement)) {
    activeElement.blur();
  }
}

function imageExtensionFromSrc(src?: string) {
  const dataUrlFormat = src?.match(/^data:image\/([^;,]+)/i)?.[1];
  const urlFormat = src?.split(/[?#]/, 1)[0]?.match(/\.([a-z0-9]+)$/i)?.[1];
  const format = String(dataUrlFormat || urlFormat || "").toLowerCase();
  if (format === "jpg" || format === "jpeg") {
    return "jpg";
  }
  if (format === "png" || format === "webp") {
    return format;
  }
  return "";
}

function imageExtension(outputFormat?: string, src?: string) {
  if (outputFormat === "jpeg") {
    return "jpg";
  }
  return outputFormat || imageExtensionFromSrc(src) || "png";
}

function buildDownloadName(createdAt: string, turnId: string, index: number, outputFormat?: string, src?: string) {
  const date = new Date(createdAt);
  const safeIndex = String(index + 1).padStart(2, "0");
  const extension = imageExtension(outputFormat, src);
  if (Number.isNaN(date.getTime())) {
    return `chatgpt-image-${turnId.slice(0, 8)}-${safeIndex}.${extension}`;
  }

  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const sec = String(date.getSeconds()).padStart(2, "0");
  return `chatgpt-image-${yyyy}${mm}${dd}-${hh}${min}${sec}-${safeIndex}.${extension}`;
}

async function downloadImage(image: DownloadableImage) {
  let href = image.src;
  let objectUrl = "";

  if (!image.src.startsWith("data:")) {
    try {
      const blob = shouldUseAuthenticatedImageFallback(image.src)
        ? await fetchAuthenticatedImageBlob(image.src)
        : await fetch(image.src).then((response) => (response.ok ? response.blob() : null));
      if (blob) {
        objectUrl = URL.createObjectURL(blob);
        href = objectUrl;
      }
    } catch {
      href = image.src;
    }
  }

  const link = document.createElement("a");
  link.href = href;
  link.download = image.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  if (objectUrl) {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function fetchImageSizeLabel(src: string) {
  if (!src || src.startsWith("data:")) {
    return "";
  }
  const cachedByteSize = getCachedAuthenticatedImageByteSize(src);
  if (cachedByteSize > 0) {
    return formatImageFileSize(cachedByteSize);
  }

  try {
    const blob = shouldUseAuthenticatedImageFallback(src)
      ? await fetchAuthenticatedImageBlob(src)
      : await fetch(src).then((response) => (response.ok ? response.blob() : null));
    if (!blob) return "";
    return formatImageFileSize(blob.size);
  } catch {
    return "";
  }
}

export function ImageResults({
  selectedConversation,
  progressByTurnKey,
  progressNow,
  promptPresets,
  onOpenLightbox,
  onApplyPromptPreset,
  onContinueEdit,
  onContinueEditBatch,
  onEditTurn,
  onCancelTurn,
  onRegenerateTurn,
  onRetryImage,
  onRetryImages,
  onImageVisibilityChange,
  visibilityMutatingImageKey,
  formatConversationTime,
}: ImageResultsProps) {
  const [imageDimensions, setImageDimensions] = useState<Record<string, string>>({});
  const [imageSizeLabels, setImageSizeLabels] = useState<Record<string, string>>({});
  const [imageDetailMeta, setImageDetailMeta] = useState<Record<string, ImageDetailMeta>>({});
  const [selectedImageIds, setSelectedImageIds] = useState<Record<string, boolean>>({});
  const [previewFallbackImageIds, setPreviewFallbackImageIds] = useState<Record<string, boolean>>({});
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const pendingImageSizeIdsRef = useRef<Set<string>>(new Set());
  const pendingImageDetailIdsRef = useRef<Set<string>>(new Set());

  const updateImageDimensions = (id: string, width: number, height: number) => {
    const dimensions = formatImageDimensions(width, height);
    setImageDimensions((current) => {
      if (current[id] === dimensions) {
        return current;
      }
      return { ...current, [id]: dimensions };
    });
  };

  const toggleImageSelection = (selectionKey: string) => {
    setSelectedImageIds((current) => ({
      ...current,
      [selectionKey]: !current[selectionKey],
    }));
  };

  const updateImageSizeLabel = (id: string, sizeLabel: string) => {
    if (!sizeLabel) {
      return;
    }
    setImageSizeLabels((current) => {
      if (current[id] === sizeLabel) {
        return current;
      }
      return { ...current, [id]: sizeLabel };
    });
  };

  const ensureImageSizeLabel = (id: string, src: string) => {
    if (imageSizeLabels[id] || pendingImageSizeIdsRef.current.has(id)) {
      return;
    }

    pendingImageSizeIdsRef.current.add(id);
    void fetchImageSizeLabel(src)
      .then((sizeLabel) => updateImageSizeLabel(id, sizeLabel))
      .finally(() => {
        pendingImageSizeIdsRef.current.delete(id);
      });
  };

  const ensureImageDetailMeta = useCallback((id: string, path: string) => {
    if (!path || imageDetailMeta[id] || pendingImageDetailIdsRef.current.has(id)) {
      return;
    }

    pendingImageDetailIdsRef.current.add(id);
    void fetchManagedImageDetail(path)
      .then((detail) => {
        setImageDetailMeta((current) => {
          if (current[id]) {
            return current;
          }
          return {
            ...current,
            [id]: {
              width: detail.width,
              height: detail.height,
              size: detail.size,
            },
          };
        });
      })
      .catch(() => undefined)
      .finally(() => {
        pendingImageDetailIdsRef.current.delete(id);
      });
  }, [imageDetailMeta]);

  useEffect(() => {
    if (!selectedConversation) {
      return;
    }
    for (const turn of selectedConversation.turns) {
      for (const image of turn.images) {
        if (imageNeedsDetailMeta(image)) {
          ensureImageDetailMeta(image.id, imagePathForMetadata(image));
        }
      }
    }
  }, [ensureImageDetailMeta, selectedConversation]);

  const downloadItems = async (key: string, items: DownloadableImage[]) => {
    if (items.length === 0 || downloadingKey) {
      return;
    }

    setDownloadingKey(key);
    try {
      for (let index = 0; index < items.length; index += 1) {
        await downloadImage(items[index]);
        if (index < items.length - 1) {
          await sleep(120);
        }
      }
    } finally {
      setDownloadingKey(null);
    }
  };

  if (!selectedConversation) {
    return (
      <div className="flex h-full min-h-[300px] items-center justify-center px-0 py-3 text-center sm:min-h-[420px] sm:py-6">
        <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5">
          <div className="mx-auto flex max-w-[640px] flex-col items-center">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#f0f0f0] px-3 py-1 text-xs font-medium text-[#45515e]">
              <Sparkles className="size-4 text-[#1456f0]" />
              生图预设
            </div>
            <h1 className="font-display text-3xl leading-[1.08] font-medium text-[#222222] sm:text-5xl">
              Turn ideas into images
            </h1>
            <p className="mx-auto mt-3 max-w-[460px] text-sm leading-6 text-[#45515e] sm:text-[15px]">
              选择一组真实案例预设快速开始，也可以直接在下方输入自己的画面描述。
            </p>
          </div>
          <div className="hide-scrollbar flex gap-3 overflow-x-auto px-1 pb-1 text-left sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-4">
            {promptPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="group w-[250px] shrink-0 overflow-hidden rounded-[22px] border border-[#f2f3f5] bg-white transition hover:-translate-y-0.5 hover:shadow-[0_12px_16px_-4px_rgba(36,36,36,0.08)] sm:w-auto"
                onClick={() => void onApplyPromptPreset(preset)}
                aria-label={`套用预设：${preset.title}`}
              >
                <div className="relative aspect-[16/9] overflow-hidden bg-[#f0f0f0]">
                  <img
                    src={preset.imageSrc}
                    alt={preset.title}
                    loading="lazy"
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                  />
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/70 via-black/25 to-transparent px-3 pt-8 pb-2">
                    <span className="rounded-full bg-white/92 px-2 py-0.5 text-[11px] font-medium text-[#18181b] shadow-sm">
                      {preset.size || "Auto"}
                    </span>
                    <span className="rounded-full bg-white/18 px-2 py-0.5 text-[11px] font-medium text-white shadow-sm backdrop-blur">
                      {preset.count} 张
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-2 px-4 py-3.5">
                  <div className="font-display text-sm font-semibold text-[#222222]">{preset.title}</div>
                  <div className="line-clamp-2 text-sm leading-6 text-[#45515e]">{preset.hint}</div>
                  <div className="border-t border-[#f2f3f5] pt-2 text-xs font-medium text-[#1456f0]">套用这个预设</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 sm:gap-8">
      {selectedConversation.turns.map((turn, turnIndex) => {
        const progress = progressByTurnKey[turnProgressKey(selectedConversation.id, turn.id)];
        const referenceLightboxImages = turn.referenceImages.map((image, index) => ({
          id: `${turn.id}-reference-${index}`,
          src: image.dataUrl,
          fileName: image.name,
        }));
        const downloadableImages = turn.images.flatMap((image, index) => {
          const src = image.status === "success" ? getStoredImageSrc(image) : "";
          return src
            ? [
                {
                  id: image.id,
                  selectionKey: imageSelectionKey(selectedConversation.id, turn.id, image.id),
                  src,
                  fileName: buildDownloadName(turn.createdAt, turn.id, index, image.outputFormat || turn.outputFormat, src),
                  imageIndex: index,
                },
              ]
            : [];
        });
        const selectedDownloadableImages = downloadableImages.filter((image) => selectedImageIds[image.selectionKey]);
        const selectedEditableImages = turn.images.filter(
          (image) =>
            image.status === "success" &&
            getStoredImageSrc(image) &&
            selectedImageIds[imageSelectionKey(selectedConversation.id, turn.id, image.id)],
        );
        const retryableImageIndexes = turn.images.flatMap((image, index) => isRetryableImageResult(image) ? [index] : []);
        const successfulTurnImages = turn.images.flatMap((image, index) => {
          const src = image.status === "success" ? getStoredImageSrc(image) : "";
          const meta = imageDetailMeta[image.id];
          const dimensions = imageResolutionLabel(image, imageDimensionsFromMeta(meta) || imageDimensions[image.id]);
          return src
            ? [
                {
                  id: image.id,
                  src,
                  fileName: buildDownloadName(turn.createdAt, turn.id, index, image.outputFormat || turn.outputFormat, src),
                  outputFormat: image.outputFormat || turn.outputFormat,
                  sizeLabel: image.b64_json
                    ? formatBase64ImageFileSize(image.b64_json)
                    : meta?.size
                      ? formatImageFileSize(meta.size)
                      : imageSizeLabels[image.id],
                  dimensions,
                },
              ]
            : [];
        });
        const textReplyImages = turn.images
          .map((image, index) => ({ image, index }))
          .filter(({ image }) => image.status === "message" && Boolean(image.text_response));
        const visualImages = turn.images
          .map((image, index) => ({ image, index }))
          .filter(({ image }) => !textReplyImages.some((reply) => reply.image.id === image.id));
        const turnBusy = isTurnBusy(turn);
        const successCount = visualImages.filter(({ image }) => image.status === "success").length;
        const failedCount = visualImages.filter(({ image }) => image.status === "error").length;
        const cancelledCount = visualImages.filter(({ image }) => image.status === "cancelled").length;
        const resultCount = visualImages.length || (turnBusy ? turn.count : 0);
        const outcomeLabel = getTurnOutcomeLabel(successCount, failedCount, cancelledCount);
        const showResultSummary = turn.mode !== "chat" && (visualImages.length > 0 || turnBusy);
        const resultSizeLabel = getTurnResultSizeLabel(turn, imageDimensions, imageDetailMeta);
        const loadingPhase = getImageTurnLoadingPhase(turn);
        const isWaitingForQuota = loadingPhase === "queued";
        const isRunning = loadingPhase === "running";
        const elapsedSeconds = isRunning
          ? Math.max(
              0,
              Math.floor((progressNow - imageTurnStartedAtTimestamp(turn.processingStartedAt, turn.createdAt)) / 1000),
            )
          : 0;
        const elapsedClock = isRunning ? formatElapsedClock(elapsedSeconds) : "";
        const progressMessage =
          progress?.message ||
          (isWaitingForQuota
            ? turn.mode === "chat"
              ? "正在思考"
              : "等待创作并发额度"
            : turnBusy
              ? "正在处理图片"
              : "");
        const requestedSizeLabel = getRequestedSizeLabel(turn);
        const routeDetail = IMAGE_MODEL_ROUTE_DETAILS[turn.model];
        const longTaskHint = getLongTaskHint(turn, elapsedSeconds);
        const resultActions =
          retryableImageIndexes.length > 0 || downloadableImages.length > 0 ? (
            <>
              {retryableImageIndexes.length > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-full border-rose-200 bg-white px-2.5 text-[11px] text-rose-600 shadow-sm hover:bg-rose-50 hover:text-rose-700"
                  disabled={!turn.prompt.trim()}
                  onClick={() => void onRetryImages(selectedConversation.id, turn.id, retryableImageIndexes)}
                >
                  <RotateCcw className="size-3" />
                  重试失败项 ({retryableImageIndexes.length})
                </Button>
              ) : null}
              {downloadableImages.length > 0 ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 rounded-full bg-[#1456f0] px-2.5 text-[11px] text-white shadow-sm hover:bg-[#2563eb]"
                    disabled={selectedDownloadableImages.length === 0 || downloadingKey !== null}
                    onClick={() =>
                      void downloadItems(
                        `selected:${selectedConversation.id}:${turn.id}`,
                        selectedDownloadableImages,
                      )
                    }
                  >
                    {downloadingKey === `selected:${selectedConversation.id}:${turn.id}` ? (
                      <LoaderCircle className="size-3 animate-spin" />
                    ) : (
                      <Download className="size-3" />
                    )}
                    下载已选 ({selectedDownloadableImages.length})
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-full border-[#e5e7eb] bg-white px-2.5 text-[11px] text-[#45515e] shadow-sm hover:bg-black/[0.05]"
                    disabled={selectedEditableImages.length === 0}
                    onClick={() => onContinueEditBatch(selectedConversation.id, selectedEditableImages)}
                  >
                    <PencilLine className="size-3" />
                    加入编辑已选 ({selectedEditableImages.length})
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-full border-[#e5e7eb] bg-white px-2.5 text-[11px] text-[#45515e] shadow-sm hover:bg-black/[0.05]"
                    disabled={downloadingKey !== null}
                    onClick={() =>
                      void downloadItems(
                        `all:${selectedConversation.id}:${turn.id}`,
                        downloadableImages,
                      )
                    }
                  >
                    {downloadingKey === `all:${selectedConversation.id}:${turn.id}` ? (
                      <LoaderCircle className="size-3 animate-spin" />
                    ) : (
                      <Download className="size-3" />
                    )}
                    下载全部
                  </Button>
                </>
              ) : null}
            </>
          ) : null;

        return (
          <div key={turn.id} className="flex flex-col gap-3 sm:gap-4">
            <div className="flex justify-end">
              <article className="w-full max-w-[min(94%,760px)] rounded-[24px] border border-[#f2f3f5] bg-white px-4 py-3 text-left text-[14px] leading-6 text-[#222222] shadow-[0_4px_6px_rgba(0,0,0,0.08)] sm:px-5 sm:py-4 sm:text-[15px] sm:leading-7">
                <div className="mb-3 flex items-start justify-between gap-3 border-b border-[#f2f3f5] pb-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] leading-5 text-[#45515e]">
                    <span className="rounded-full bg-[#f0f0f0] px-2.5 py-0.5 text-[#45515e]">第 {turnIndex + 1} 轮</span>
                    <span className="rounded-full bg-[#f0f0f0] px-2.5 py-0.5 text-[#45515e]">{getTurnModeLabel(turn)}</span>
                    <span className="rounded-full bg-[#f0f0f0] px-2.5 py-0.5 text-[#45515e]">{turn.model}</span>
                    {turn.mode !== "chat" && routeDetail ? (
                      <span className="rounded-full bg-[#eef4ff] px-2.5 py-0.5 text-[#1456f0]">
                        {routeDetail.routeLabel}
                      </span>
                    ) : null}
                    <span className="rounded-full bg-[#f0f0f0] px-2.5 py-0.5 text-[#45515e]">
                      {getTurnStatusLabel(turn.status)}
                    </span>
                    <span className="px-1 text-[#8e8e93]">{formatConversationTime(turn.createdAt)}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {turnBusy ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-8 rounded-full border-amber-200 bg-amber-50 text-amber-700 shadow-none hover:bg-amber-100"
                        onClick={() => void onCancelTurn(selectedConversation.id, turn.id)}
                        aria-label="终止生成任务"
                        title="终止"
                      >
                        <CircleStop className="size-4" />
                      </Button>
                    ) : (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="size-8 rounded-full border-[#e5e7eb] bg-white text-[#45515e] shadow-none hover:bg-black/[0.05]"
                          onClick={() => onEditTurn(selectedConversation.id, turn.id)}
                          aria-label="编辑生成设置"
                          title="编辑"
                        >
                          <PencilLine className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="size-8 rounded-full border-[#e5e7eb] bg-white text-[#45515e] shadow-none hover:bg-black/[0.05]"
                          disabled={turnBusy || !turn.prompt.trim()}
                          onClick={() => void onRegenerateTurn(selectedConversation.id, turn.id)}
                          aria-label="重新生成"
                          title="重新生成"
                        >
                          <RotateCcw className="size-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <div>
                  <div className="whitespace-pre-wrap break-words">{turn.prompt}</div>
                  {turn.referenceImages.length > 0 ? (
                    <div className="mt-3 flex flex-wrap justify-start gap-2">
                      {turn.referenceImages.map((image, index) => (
                        <div
                          key={`${turn.id}-${image.name}-${index}`}
                          className="group relative size-20 shrink-0 overflow-hidden rounded-2xl border border-stone-200/80 bg-stone-100/60 transition hover:border-stone-300 sm:size-24"
                          onMouseLeave={(event) => blurFocusedElementInContainer(event.currentTarget)}
                        >
                          <button
                            type="button"
                            onClick={() => onOpenLightbox(referenceLightboxImages, index)}
                            className="block size-full text-left"
                            aria-label={`预览参考图 ${image.name || index + 1}`}
                          >
                            <img
                              src={image.dataUrl}
                              alt={image.name || `参考图 ${index + 1}`}
                              className="absolute inset-0 h-full w-full object-cover transition duration-200 group-hover:scale-[1.02] group-hover:brightness-90"
                            />
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              event.currentTarget.blur();
                              onContinueEdit(selectedConversation.id, image);
                            }}
                            className="absolute top-2 right-2 z-10 inline-flex size-7 items-center justify-center rounded-full bg-white/95 text-stone-800 opacity-0 shadow-sm transition hover:bg-white hover:text-stone-950 group-hover:opacity-100 group-focus-within:opacity-100"
                            aria-label={`继续编辑参考图 ${image.name || index + 1}`}
                            title="继续编辑"
                          >
                            <PencilLine className="size-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </article>
            </div>

            <div className="flex justify-start">
              <section className="w-full px-1">
                {showResultSummary ? (
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 sm:mb-4">
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#45515e] sm:gap-2 sm:text-xs">
                      <span className="font-medium text-[#222222]">生成结果</span>
                      <span className="rounded-full bg-[#f0f0f0] px-3 py-1">{resultCount} 张</span>
                      {turn.count !== resultCount ? (
                        <span className="rounded-full bg-[#f0f0f0] px-3 py-1">目标 {turn.count} 张</span>
                      ) : null}
                      {requestedSizeLabel ? (
                        <span
                          className={cn(
                            "rounded-full px-3 py-1",
                            isHighResolutionImageSize(turn.size)
                              ? "bg-amber-50 text-amber-700"
                              : "bg-[#f0f0f0]",
                          )}
                        >
                          {requestedSizeLabel}
                        </span>
                      ) : null}
                      {resultSizeLabel ? <span className="rounded-full bg-[#f0f0f0] px-3 py-1">{resultSizeLabel}</span> : null}
                      {turn.quality ? (
                        <span className="rounded-full bg-[#f0f0f0] px-3 py-1">Quality {turn.quality}</span>
                      ) : null}
                      {turn.outputFormat ? (
                        <span className="rounded-full bg-[#f0f0f0] px-3 py-1">{turn.outputFormat.toUpperCase()}</span>
                      ) : null}
                      {turn.outputCompression != null && turn.outputFormat && supportsImageOutputCompression(turn.outputFormat) ? (
                        <span className="rounded-full bg-[#f0f0f0] px-3 py-1">压缩 {turn.outputCompression}</span>
                      ) : null}
                      {turn.background ? (
                        <span className="rounded-full bg-[#f0f0f0] px-3 py-1">背景 {turn.background}</span>
                      ) : null}
                      {outcomeLabel ? <span className="rounded-full bg-[#f0f0f0] px-3 py-1">{outcomeLabel}</span> : null}
                      <span className={cn("rounded-full px-3 py-1", getStatusChipClass(turn.status))}>
                        {getTurnStatusLabel(turn.status)}
                      </span>
                    </div>
                    {turnBusy || resultActions ? (
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {turnBusy ? (
                          <span className="flex max-w-full flex-col gap-0.5 rounded-2xl bg-amber-50 px-3 py-1 text-[11px] leading-5 text-amber-700 sm:text-xs">
                            <span className="w-fit whitespace-nowrap font-medium">{progressMessage}</span>
                            {longTaskHint ? <span className="max-w-[20rem] text-[11px] leading-5">{longTaskHint}</span> : null}
                          </span>
                        ) : null}
                        {resultActions}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {textReplyImages.length > 0 ? (
                  <div className="mb-3 flex flex-col gap-2">
                    {textReplyImages.map(({ image, index }) => (
                      <div
                        key={image.id}
                        className="w-full max-w-[min(94%,760px)] rounded-[20px] border border-[#f2f3f5] bg-white px-4 py-3 text-left text-sm leading-6 text-[#45515e] shadow-[0_4px_6px_rgba(0,0,0,0.08)]"
                      >
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-stone-500">
                            <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-stone-600">
                              {turn.mode === "chat" ? "对话回复" : "模型文本回复"}
                            </span>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-full border-[#e5e7eb] bg-white px-3 text-xs text-[#45515e] shadow-none hover:bg-black/[0.05] hover:text-[#18181b]"
                            disabled={turnBusy || !turn.prompt.trim()}
                            onClick={() => void onRetryImage(selectedConversation.id, turn.id, index)}
                          >
                            <RotateCcw className="size-3.5" />
                            {turn.mode === "chat" ? "重新发送" : "重试生成"}
                          </Button>
                        </div>
                        <div className="whitespace-pre-wrap break-words">{image.text_response}</div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {visualImages.length > 0 ? (
                  <div className="columns-1 gap-3 sm:columns-2 sm:gap-4 xl:columns-3 2xl:columns-4">
                    {visualImages.map(({ image, index }) => {
                    const imageSrc = image.status === "success" ? getStoredImageSrc(image) : "";
                    const previewSrc = image.status === "success" ? getStoredImagePreviewSrc(image) : "";
                    if (image.status === "success" && imageSrc) {
                      const displaySrc = previewFallbackImageIds[image.id] ? imageSrc : previewSrc || imageSrc;
                      const isDisplayingOriginal = displaySrc === imageSrc;
                      const meta = imageDetailMeta[image.id];
                      const currentIndex = successfulTurnImages.findIndex((item) => item.id === image.id);
                      const imageNumber = currentIndex >= 0 ? currentIndex + 1 : index + 1;
                      const selectionKey = imageSelectionKey(selectedConversation.id, turn.id, image.id);
                      const selected = Boolean(selectedImageIds[selectionKey]);
                      const sizeLabel = image.b64_json
                        ? formatBase64ImageFileSize(image.b64_json)
                        : meta?.size
                          ? formatImageFileSize(meta.size)
                          : imageSizeLabels[image.id] || "";
                      const dimensions = imageResolutionLabel(image, imageDimensionsFromMeta(meta) || imageDimensions[image.id]);
                      const imageMeta = [dimensions, sizeLabel].filter(Boolean).join(" | ");
                      const formatLabel = getImageFormatLabel(image, imageSrc);
                      const visibility = image.visibility || turn.visibility || "private";
                      const nextVisibility = visibility === "public" ? "private" : "public";
                      const visibilityMutatingKey = `${selectedConversation.id}:${turn.id}:${image.id}`;
                      const isVisibilityMutating = visibilityMutatingImageKey === visibilityMutatingKey;
                      const canUpdateVisibility = Boolean(image.path || image.localUrl || image.url);

                      return (
                        <figure
                          key={image.id}
                          className={cn(
                            "group relative mb-3 inline-block w-full break-inside-avoid overflow-hidden rounded-[22px] bg-[#f0f0f0] shadow-[0_0_15px_rgba(44,30,116,0.16)] sm:mb-4",
                            selected && "ring-2 ring-[#1456f0]/90 ring-offset-2",
                          )}
                          onMouseLeave={(event) => blurFocusedElementInContainer(event.currentTarget)}
                        >
                          <button
                            type="button"
                            draggable
                            onDragStart={(event) => {
                              const selectedImages = selected
                                ? turn.images.filter(
                                    (candidate) =>
                                      candidate.status === "success" &&
                                      getStoredImageSrc(candidate) &&
                                      selectedImageIds[imageSelectionKey(selectedConversation.id, turn.id, candidate.id)],
                                  )
                                : [image];
                              setImageResultDragData(
                                event.dataTransfer,
                                {
                                  items: selectedImages.map((candidate) => ({
                                    conversationId: selectedConversation.id,
                                    imageId: candidate.id,
                                  })),
                                },
                                imageSrc,
                              );
                            }}
                            onClick={(event) => {
                              toggleImageSelection(selectionKey);
                              event.currentTarget.blur();
                            }}
                            className="block w-full cursor-pointer overflow-hidden text-left"
                            aria-label={selected ? "取消选择图片" : "选择图片"}
                          >
                            <AuthenticatedImage
                              src={displaySrc}
                              alt={`Generated result ${index + 1}`}
                              width={image.width || undefined}
                              height={image.height || undefined}
                              loading="lazy"
                              decoding="async"
                              className="block h-auto w-full transition duration-200 group-hover:brightness-95"
                              onLoad={(event) => {
                                if (isDisplayingOriginal) {
                                  updateImageDimensions(
                                    image.id,
                                    event.currentTarget.naturalWidth,
                                    event.currentTarget.naturalHeight,
                                  );
                                }
                                if (!image.b64_json) {
                                  ensureImageSizeLabel(image.id, imageSrc);
                                }
                              }}
                              onError={(event) => {
                                if (previewSrc && displaySrc !== imageSrc) {
                                  setPreviewFallbackImageIds((current) =>
                                    current[image.id] ? current : { ...current, [image.id]: true },
                                  );
                                }
                              }}
                            />
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              toggleImageSelection(selectionKey);
                              event.currentTarget.blur();
                            }}
                            className={cn(
                              "absolute top-2 left-2 z-10 inline-flex h-6 min-w-6 items-center justify-center rounded-full border px-1.5 text-[11px] font-semibold tabular-nums transition duration-150",
                              selected
                                ? "border-[#1456f0] bg-[#1456f0] text-white opacity-100 shadow-sm"
                                : "border-white/80 bg-black/45 text-white opacity-100 shadow-sm backdrop-blur-sm hover:bg-black/60",
                            )}
                            aria-label={selected ? `取消选择图片 ${imageNumber}` : `选择图片 ${imageNumber}`}
                          >
                            {selected ? <Check className="size-3.5" /> : `#${imageNumber}`}
                          </button>
                          <div className="pointer-events-none absolute top-2 right-2 z-10 flex items-center gap-1 opacity-0 transition duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.currentTarget.blur();
                                onOpenLightbox(successfulTurnImages, currentIndex);
                              }}
                              className="inline-flex h-7 items-center gap-1 rounded-full bg-white/95 px-2 text-[11px] font-medium text-stone-800 shadow-sm transition hover:bg-white hover:text-stone-950"
                              aria-label="View Original"
                              title="View Original"
                            >
                              <Eye className="size-3" />
                              View Original
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.currentTarget.blur();
                                onContinueEdit(selectedConversation.id, image);
                              }}
                              className="inline-flex size-7 items-center justify-center rounded-full bg-white/95 text-stone-800 shadow-sm transition hover:bg-white hover:text-stone-950"
                              aria-label="加入编辑"
                              title="加入编辑"
                            >
                              <Plus className="size-3.5" />
                            </button>
                          </div>
                          <div className="absolute right-2 bottom-2 z-20 flex items-center gap-1">
                            {canUpdateVisibility ? (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  event.currentTarget.blur();
                                  void onImageVisibilityChange(
                                    selectedConversation.id,
                                    turn.id,
                                    index,
                                    nextVisibility,
                                  );
                                }}
                                disabled={isVisibilityMutating}
                                className={cn(
                                  "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium opacity-0 shadow-sm transition group-hover:opacity-100 group-focus-within:opacity-100 disabled:cursor-not-allowed disabled:opacity-70",
                                  imageVisibilityActionClass(visibility),
                                )}
                                aria-label={visibility === "public" ? "取消公开图片" : "公开图片"}
                                title={visibility === "public" ? "取消公开" : "公开"}
                              >
                                {isVisibilityMutating ? (
                                  <LoaderCircle className="size-3 animate-spin" />
                                ) : visibility === "public" ? (
                                  <Lock className="size-3" />
                                ) : (
                                  <Globe2 className="size-3" />
                                )}
                                {visibility === "public" ? "取消公开" : "公开"}
                              </button>
                            ) : null}
                            <div
                              className={cn(
                                "pointer-events-none inline-flex h-7 items-center gap-1 rounded-full px-2 text-[11px] font-medium shadow-sm backdrop-blur-sm",
                                imageVisibilityPillClass(visibility),
                              )}
                            >
                              {visibility === "public" ? <Globe2 className="size-3" /> : <Lock className="size-3" />}
                              {imageVisibilityLabel(visibility)}
                            </div>
                          </div>
                          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 via-black/20 to-transparent px-2.5 pt-8 pb-11 opacity-0 transition duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
                            <div className="text-left text-white drop-shadow-sm">
                              <div className="text-[10px] font-bold tracking-wide">{formatLabel}</div>
                              {imageMeta ? (
                                <div className="mt-0.5 truncate text-[11px] text-white/90">{imageMeta}</div>
                              ) : null}
                            </div>
                          </div>
                        </figure>
                      );
                    }

                    if (image.status === "success") {
                      return (
                        <div
                          key={image.id}
                          className="mb-3 inline-flex h-[160px] w-full break-inside-avoid flex-col overflow-hidden rounded-[18px] border border-rose-200 bg-rose-50 sm:mb-4"
                        >
                          <div className="flex min-h-0 flex-1 items-center justify-center whitespace-pre-line px-4 py-3 text-center text-sm leading-6 text-rose-600 sm:px-5">
                            生成已完成，但结果图片数据缺失
                          </div>
                          <div className="flex justify-end border-t border-rose-100 bg-white/70 px-3 py-2.5">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 rounded-full border-rose-200 bg-white px-3 text-xs text-rose-600 shadow-none hover:bg-rose-50 hover:text-rose-700"
                              disabled={turnBusy || !turn.prompt.trim()}
                              onClick={() => void onRetryImage(selectedConversation.id, turn.id, index)}
                            >
                              <RotateCcw className="size-3.5" />
                              重试
                            </Button>
                          </div>
                        </div>
                      );
                    }

                    if (image.status === "cancelled") {
                      return (
                        <div
                          key={image.id}
                          className="mb-3 inline-block h-[160px] w-full break-inside-avoid overflow-hidden rounded-[18px] border border-amber-200 bg-amber-50 sm:mb-4"
                        >
                          <div className="flex h-full min-h-16 items-center justify-center px-4 py-4 text-center text-sm leading-6 text-amber-700 sm:px-6 sm:py-8">
                            {image.error || "任务已终止"}
                          </div>
                        </div>
                      );
                    }

                    if (image.status === "error") {
                      return (
                        <div
                          key={image.id}
                          className="mb-3 inline-flex h-[160px] w-full break-inside-avoid flex-col overflow-hidden rounded-[18px] border border-rose-200 bg-rose-50 sm:mb-4"
                        >
                          <div className="flex min-h-0 flex-1 items-center justify-center whitespace-pre-line px-4 py-3 text-center text-sm leading-6 text-rose-600 sm:px-5">
                            {image.error || "生成失败"}
                          </div>
                          <div className="flex justify-end border-t border-rose-100 bg-white/70 px-3 py-2.5">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 rounded-full border-rose-200 bg-white px-3 text-xs text-rose-600 shadow-none hover:bg-rose-50 hover:text-rose-700"
                              disabled={turnBusy || !turn.prompt.trim()}
                              onClick={() => void onRetryImage(selectedConversation.id, turn.id, index)}
                            >
                              <RotateCcw className="size-3.5" />
                              重试
                            </Button>
                          </div>
                        </div>
                      );
                    }

                    const imageLoadingPhase = getStoredImageLoadingPhase(image);
                    const imageBusyLabel = imageLoadingPhase === "queued"
                      ? "等待创作并发额度..."
                      : imageLoadingPhase === "running"
                        ? "正在处理图片..."
                        : "";

                    return (
                      <div
                        key={image.id}
                        className="mb-3 inline-block h-[160px] w-full break-inside-avoid overflow-hidden rounded-[18px] border border-stone-200/80 bg-stone-100/80 sm:mb-4"
                      >
                        <div className="flex h-full flex-col items-center justify-center gap-1.5 px-4 py-3 text-center text-stone-500">
                          <div className="rounded-full bg-white p-2.5 shadow-sm">
                            {imageLoadingPhase === "queued" ? (
                              <Clock3 className="size-5" />
                            ) : (
                              <LoaderCircle className="size-5 animate-spin" />
                            )}
                          </div>
                          <p className="text-xs leading-5 sm:text-sm">
                            {turn.mode === "chat"
                              ? imageLoadingPhase === "queued"
                                ? "正在思考..."
                                : "正在等待回复..."
                              : imageBusyLabel}
                          </p>
                          {imageLoadingPhase === "running" ? (
                            <p className="min-w-[7.5rem] rounded-full bg-white/70 px-2.5 py-1 font-mono text-xs leading-4 tabular-nums text-stone-400">
                              已运行 {elapsedClock}
                            </p>
                          ) : null}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 rounded-full border-amber-200 bg-white/85 px-2.5 text-[11px] text-amber-700 shadow-none hover:bg-amber-50 hover:text-amber-800"
                            onClick={() => void onCancelTurn(selectedConversation.id, turn.id)}
                          >
                            <CircleStop className="size-3.5" />
                            终止本轮
                          </Button>
                        </div>
                      </div>
                    );
                    })}
                  </div>
                ) : null}

              </section>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function getTurnStatusLabel(status: ImageTurnStatus) {
  if (status === "queued") {
    return "排队中";
  }
  if (status === "generating") {
    return "处理中";
  }
  if (status === "success") {
    return "已完成";
  }
  if (status === "message") {
    return "文本回复";
  }
  if (status === "cancelled") {
    return "已终止";
  }
  return "失败";
}

function turnProgressKey(conversationId: string, turnId: string) {
  return `${conversationId}:${turnId}`;
}

function formatElapsedClock(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getStatusChipClass(status: ImageTurnStatus) {
  if (status === "queued") {
    return "bg-amber-50 text-amber-700";
  }
  if (status === "generating") {
    return "bg-blue-50 text-[#1456f0]";
  }
  if (status === "success") {
    return "bg-emerald-50 text-emerald-700";
  }
  if (status === "message") {
    return "bg-stone-100 text-stone-600";
  }
  if (status === "cancelled") {
    return "bg-amber-50 text-amber-700";
  }
  return "bg-rose-50 text-rose-700";
}

function getTurnOutcomeLabel(successCount: number, failedCount: number, cancelledCount: number) {
  if (failedCount === 0 && cancelledCount === 0) {
    return "";
  }
  const parts = [`成功 ${successCount}`];
  if (failedCount > 0) {
    parts.push(`失败 ${failedCount}`);
  }
  if (cancelledCount > 0) {
    parts.push(`终止 ${cancelledCount}`);
  }
  return parts.join(" / ");
}

function getTurnModeLabel(turn: ImageTurn) {
  if (turn.mode === "chat") {
    return "对话";
  }
  if (turn.mode === "generate") {
    return "文生图";
  }
  if (turn.mode === "edit" && turn.referenceImages.some((image) => image.source === "conversation")) {
    return "编辑图";
  }
  return "图生图";
}

function formatImageDimensions(width: number, height: number) {
  return `${width} x ${height}`;
}
