"use client";

import type { SmartCanvasDocument } from "./types";

export const SMART_CANVAS_QUEUE_CHANGED_EVENT = "chatgpt2api:smart-canvas-queue-changed";

export type SmartCanvasQueueChangedDetail = {
  canvas?: SmartCanvasDocument | null;
};

export function dispatchSmartCanvasQueueChanged(canvas?: SmartCanvasDocument | null) {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent<SmartCanvasQueueChangedDetail>(SMART_CANVAS_QUEUE_CHANGED_EVENT, {
    detail: { canvas },
  }));
}
