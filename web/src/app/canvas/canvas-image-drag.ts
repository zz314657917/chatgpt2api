import type { CanvasImageRef } from "@/lib/api";

import { dedupeCanvasImageRefs } from "./canvas-utils";

export const CANVAS_IMAGE_DRAG_MIME = "application/x-chatgpt2api-canvas-image-ref";

export type CanvasImageDragPayload = {
  images: CanvasImageRef[];
};

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isCanvasImageRef(value: unknown): value is CanvasImageRef {
  if (!value || typeof value !== "object") {
    return false;
  }
  const item = value as Partial<Record<keyof CanvasImageRef, unknown>>;
  return Boolean(
    cleanText(item.url) ||
    cleanText(item.local_url) ||
    cleanText(item.public_url) ||
    cleanText(item.path) ||
    cleanText(item.thumbnail_url) ||
    cleanText(item.preview_url),
  );
}

function imageDragLabel(refs: CanvasImageRef[]) {
  if (refs.length > 1) {
    return `${refs.length} 张图片`;
  }
  const ref = refs[0];
  return cleanText(ref?.name) || cleanText(ref?.path) || cleanText(ref?.local_url) || cleanText(ref?.url) || cleanText(ref?.public_url) || "图片";
}

export function hasCanvasImageDragPayload(dataTransfer: DataTransfer) {
  return Array.from(dataTransfer.types).includes(CANVAS_IMAGE_DRAG_MIME);
}

export function setCanvasImageDragData(dataTransfer: DataTransfer, images: CanvasImageRef[]) {
  const refs = dedupeCanvasImageRefs(images);
  if (refs.length === 0) {
    return false;
  }
  dataTransfer.effectAllowed = "copy";
  dataTransfer.setData(CANVAS_IMAGE_DRAG_MIME, JSON.stringify({ images: refs } satisfies CanvasImageDragPayload));
  dataTransfer.setData("text/plain", imageDragLabel(refs));
  return true;
}

export function parseCanvasImageDragPayload(dataTransfer: DataTransfer): CanvasImageDragPayload | null {
  try {
    const raw = dataTransfer.getData(CANVAS_IMAGE_DRAG_MIME);
    if (!raw) {
      return null;
    }
    const payload = JSON.parse(raw) as Partial<CanvasImageDragPayload>;
    const refs = dedupeCanvasImageRefs(Array.isArray(payload.images) ? payload.images.filter(isCanvasImageRef) : []);
    return refs.length > 0 ? { images: refs } : null;
  } catch {
    return null;
  }
}
