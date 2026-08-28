import { useEffect, useRef } from "react";

import type { BeadProjectSummary } from "@/lib/api";

import { getColor } from "./upstream/palette";

export function BeadProjectThumbnail({
  project,
}: {
  project: BeadProjectSummary;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const { width, height, cells } = project.preview;
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    const outputWidth = Math.round(320 * scale);
    const outputHeight = Math.round(220 * scale);
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    context.clearRect(0, 0, outputWidth, outputHeight);
    context.fillStyle = getComputedStyle(canvas).getPropertyValue("--card") || "#ffffff";
    context.fillRect(0, 0, outputWidth, outputHeight);
    const cellSize = Math.min(outputWidth / width, outputHeight / height);
    const left = (outputWidth - width * cellSize) / 2;
    const top = (outputHeight - height * cellSize) / 2;
    cells.forEach((colorId, index) => {
      if (!colorId) return;
      const color = getColor(colorId);
      if (!color) return;
      const x = index % width;
      const y = Math.floor(index / width);
      context.fillStyle = color.hex;
      context.beginPath();
      context.arc(
        left + x * cellSize + cellSize / 2,
        top + y * cellSize + cellSize / 2,
        Math.max(0.75, cellSize * 0.42),
        0,
        Math.PI * 2,
      );
      context.fill();
    });
  }, [project]);

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full"
      aria-label={`${project.name} 图案预览`}
    />
  );
}
