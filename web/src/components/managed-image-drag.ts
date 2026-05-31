import type { ManagedImageSummary } from "@/lib/api";

export const MANAGED_IMAGE_DRAG_MIME = "application/x-chatgpt2api-managed-image";

function isManagedImageSummary(value: unknown): value is ManagedImageSummary {
  if (!value || typeof value !== "object") {
    return false;
  }
  const item = value as Partial<ManagedImageSummary>;
  return typeof item.path === "string" && item.path.length > 0;
}

export function hasManagedImageDragPayload(dataTransfer: DataTransfer) {
  return Array.from(dataTransfer.types).includes(MANAGED_IMAGE_DRAG_MIME);
}

export function setManagedImageDragData(dataTransfer: DataTransfer, asset: ManagedImageSummary) {
  dataTransfer.effectAllowed = "copy";
  dataTransfer.setData(MANAGED_IMAGE_DRAG_MIME, JSON.stringify(asset));
}

export function parseManagedImageDragPayload(dataTransfer: DataTransfer): ManagedImageSummary | null {
  try {
    const raw = dataTransfer.getData(MANAGED_IMAGE_DRAG_MIME);
    if (!raw) {
      return null;
    }
    const payload = JSON.parse(raw);
    return isManagedImageSummary(payload) ? payload : null;
  } catch {
    return null;
  }
}
