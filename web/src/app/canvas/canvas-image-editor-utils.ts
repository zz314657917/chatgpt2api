import type { CanvasImageRef } from "@/lib/api";

import type { GridLine, GridOrientation } from "./canvas-image-editor-types";

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function baseFileName(image: CanvasImageRef | null, fallback = "canvas-image") {
  return (image?.name || fallback).replace(/\.[^.]+$/, "");
}

export function canvasToFile(canvas: HTMLCanvasElement, name: string) {
  return new Promise<File>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("生成图片失败"));
        return;
      }
      resolve(new File([blob], name, { type: "image/png" }));
    }, "image/png");
  });
}

export function circledNumber(index: number) {
  return index >= 1 && index <= 20 ? String.fromCharCode(0x2460 + index - 1) : String(index);
}

export function sortedUniquePositions(lines: GridLine[], type: GridOrientation) {
  return Array.from(new Set(
    lines
      .filter((line) => line.type === type)
      .map((line) => clamp(line.pos, 0.001, 0.999).toFixed(4)),
  )).map(Number).sort((a, b) => a - b);
}
