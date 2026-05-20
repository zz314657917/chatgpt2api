export const IMAGE_RESULT_DRAG_MIME = "application/x-chatgpt2api-image-result";

export type ImageResultDragItem = {
  conversationId: string;
  imageId: string;
};

export type ImageResultDragPayload = {
  items: ImageResultDragItem[];
};

export function hasImageResultDragPayload(dataTransfer: DataTransfer) {
  return Array.from(dataTransfer.types).includes(IMAGE_RESULT_DRAG_MIME);
}

export function parseImageResultDragPayload(dataTransfer: DataTransfer): ImageResultDragPayload | null {
  try {
    const raw = dataTransfer.getData(IMAGE_RESULT_DRAG_MIME);
    if (!raw) {
      return null;
    }
    const payload = JSON.parse(raw) as Partial<ImageResultDragPayload>;
    const items = Array.isArray(payload.items)
      ? payload.items.filter(
          (item): item is ImageResultDragItem =>
            typeof item?.conversationId === "string" &&
            item.conversationId.length > 0 &&
            typeof item?.imageId === "string" &&
            item.imageId.length > 0,
        )
      : [];
    return items.length > 0 ? { items } : null;
  } catch {
    return null;
  }
}
