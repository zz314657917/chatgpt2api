"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import {
  Brush,
  Circle,
  Crop,
  Eraser,
  Grid3X3,
  ListOrdered,
  LoaderCircle,
  Maximize2,
  Paintbrush,
  RectangleHorizontal,
  RotateCcw,
  Undo2,
  X,
} from "lucide-react";

import { AuthenticatedImage } from "@/components/authenticated-image";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { CanvasImageRef } from "@/lib/api";
import { fetchAuthenticatedImageBlob } from "@/lib/authenticated-image";
import { cn } from "@/lib/utils";

import { canvasImageLabel, canvasImageSource } from "./canvas-utils";

type ImageEditMode = "crop" | "outpaint" | "mask" | "brush" | "grid";
type BrushTool = "free" | "rect" | "ellipse" | "label";
type GridOrientation = "h" | "v";

export type SmartCanvasCropBox = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type OutpaintBox = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type CropDragState =
  | {
      mode: "crop-move" | "crop-resize";
      pointerId: number;
      startClientX: number;
      startClientY: number;
      startCrop: SmartCanvasCropBox;
    }
  | {
      mode: "outpaint-left" | "outpaint-top" | "outpaint-right" | "outpaint-bottom" | "outpaint-corner";
      pointerId: number;
      startClientX: number;
      startClientY: number;
      startBox: OutpaintBox;
    };

type DrawState =
  | { kind: "none" }
  | { kind: "draw"; pointerId: number; x: number; y: number; startX: number; startY: number; snapshot?: ImageData }
  | { kind: "grid"; pointerId: number; index: number };

type GridLine = {
  type: GridOrientation;
  pos: number;
};

type SmartCanvasImageEditorProps = {
  image: CanvasImageRef | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplyEdit: (image: CanvasImageRef, files: File[]) => Promise<void>;
};

const DEFAULT_CROP: SmartCanvasCropBox = { x: 10, y: 10, w: 80, h: 80 };
const DEFAULT_OUTPAINT: OutpaintBox = { left: 15, top: 15, right: 15, bottom: 15 };
const MIN_CROP_SIZE = 8;
const MASK_BRUSH_ALPHA = 115;

const editModes: Array<{
  value: ImageEditMode;
  label: string;
  icon: typeof Crop;
  title: string;
  description: string;
  action: string;
}> = [
  {
    value: "crop",
    label: "裁剪",
    icon: Crop,
    title: "裁剪图片",
    description: "拖动裁剪框移动，拖右下角调整大小",
    action: "应用裁剪",
  },
  {
    value: "outpaint",
    label: "扩图",
    icon: Maximize2,
    title: "扩图",
    description: "拖动四周或右下角扩展画布",
    action: "应用扩图",
  },
  {
    value: "mask",
    label: "遮罩",
    icon: Brush,
    title: "遮罩编辑",
    description: "白色区域会生成遮罩图",
    action: "应用遮罩",
  },
  {
    value: "brush",
    label: "画笔",
    icon: Paintbrush,
    title: "画笔",
    description: "在图片上添加自由画笔、形状或数字标记",
    action: "应用画笔",
  },
  {
    value: "grid",
    label: "宫格切分",
    icon: Grid3X3,
    title: "宫格切分",
    description: "按行列或自定义切线拆分图片",
    action: "应用切分",
  },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function baseFileName(image: CanvasImageRef | null, fallback = "canvas-image") {
  return (image?.name || fallback).replace(/\.[^.]+$/, "");
}

function canvasToFile(canvas: HTMLCanvasElement, name: string) {
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

function circledNumber(index: number) {
  return index >= 1 && index <= 20 ? String.fromCharCode(0x2460 + index - 1) : String(index);
}

function sortedUniquePositions(lines: GridLine[], type: GridOrientation) {
  return Array.from(new Set(
    lines
      .filter((line) => line.type === type)
      .map((line) => clamp(line.pos, 0.001, 0.999).toFixed(4)),
  )).map(Number).sort((a, b) => a - b);
}

export function SmartCanvasImageEditor({ image, open, onOpenChange, onApplyEdit }: SmartCanvasImageEditorProps) {
  const [mode, setMode] = useState<ImageEditMode>("crop");
  const [cropBox, setCropBox] = useState<SmartCanvasCropBox>(DEFAULT_CROP);
  const [outpaintBox, setOutpaintBox] = useState<OutpaintBox>(DEFAULT_OUTPAINT);
  const [zoom, setZoom] = useState(1);
  const [applying, setApplying] = useState(false);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [bitmapError, setBitmapError] = useState("");
  const [brushSize, setBrushSize] = useState(28);
  const [brushColor, setBrushColor] = useState("#ff2d55");
  const [brushTool, setBrushTool] = useState<BrushTool>("free");
  const [labelCounter, setLabelCounter] = useState(1);
  const [gridRows, setGridRows] = useState(2);
  const [gridCols, setGridCols] = useState(2);
  const [gridGap, setGridGap] = useState(0);
  const [gridCustom, setGridCustom] = useState(false);
  const [gridOrientation, setGridOrientation] = useState<GridOrientation>("h");
  const [gridLines, setGridLines] = useState<GridLine[]>([]);
  const [drawHistory, setDrawHistory] = useState<ImageData[]>([]);
  const imageFrameRef = useRef<HTMLDivElement | null>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cropDragRef = useRef<CropDragState | null>(null);
  const drawStateRef = useRef<DrawState>({ kind: "none" });
  const src = image ? canvasImageSource(image) : "";
  const modeMeta = useMemo(() => editModes.find((item) => item.value === mode) || editModes[0], [mode]);
  const ActionIcon = modeMeta.icon;
  const canDraw = mode === "mask" || mode === "brush" || mode === "grid";

  const displaySize = useMemo(() => {
    if (!bitmap) {
      return { width: 1, height: 1 };
    }
    const maxW = Math.min(1300, typeof window === "undefined" ? 1300 : window.innerWidth - 96);
    const maxH = Math.min(760, typeof window === "undefined" ? 760 : window.innerHeight - 220);
    const fit = Math.min(maxW / bitmap.width, maxH / bitmap.height, 1);
    return {
      width: Math.max(1, Math.round(bitmap.width * fit)),
      height: Math.max(1, Math.round(bitmap.height * fit)),
    };
  }, [bitmap]);

  const outpaintDisplay = useMemo(() => {
    const width = displaySize.width * (1 + outpaintBox.left / 100 + outpaintBox.right / 100);
    const height = displaySize.height * (1 + outpaintBox.top / 100 + outpaintBox.bottom / 100);
    return {
      width,
      height,
      left: displaySize.width * outpaintBox.left / 100,
      top: displaySize.height * outpaintBox.top / 100,
    };
  }, [displaySize.height, displaySize.width, outpaintBox]);

  const outpaintNatural = useMemo(() => {
    if (!bitmap) {
      return { width: 0, height: 0, left: 0, top: 0 };
    }
    return {
      width: Math.round(bitmap.width * (1 + outpaintBox.left / 100 + outpaintBox.right / 100)),
      height: Math.round(bitmap.height * (1 + outpaintBox.top / 100 + outpaintBox.bottom / 100)),
      left: Math.round(bitmap.width * outpaintBox.left / 100),
      top: Math.round(bitmap.height * outpaintBox.top / 100),
    };
  }, [bitmap, outpaintBox]);

  const gridSplitCount = useMemo(() => {
    if (gridCustom) {
      return (sortedUniquePositions(gridLines, "h").length + 1) * (sortedUniquePositions(gridLines, "v").length + 1);
    }
    return Math.max(1, gridRows) * Math.max(1, gridCols);
  }, [gridCols, gridCustom, gridLines, gridRows]);

  const clearDrawCanvas = useCallback(() => {
    const canvas = drawCanvasRef.current;
    if (!canvas) {
      return;
    }
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setDrawHistory([]);
  }, []);

  useEffect(() => {
    if (!open) {
      cropDragRef.current = null;
      drawStateRef.current = { kind: "none" };
      return;
    }
    setMode("crop");
    setCropBox(DEFAULT_CROP);
    setOutpaintBox(DEFAULT_OUTPAINT);
    setZoom(1);
    setApplying(false);
    setBitmapError("");
    setBrushSize(28);
    setBrushColor("#ff2d55");
    setBrushTool("free");
    setLabelCounter(1);
    setGridRows(2);
    setGridCols(2);
    setGridGap(0);
    setGridCustom(false);
    setGridOrientation("h");
    setGridLines([]);
    clearDrawCanvas();
  }, [clearDrawCanvas, open, src]);

  useEffect(() => {
    if (!open || !src) {
      setBitmap(null);
      return;
    }
    let active = true;
    let nextBitmap: ImageBitmap | null = null;
    setBitmapError("");
    void fetchAuthenticatedImageBlob(src)
      .then((blob) => createImageBitmap(blob))
      .then((loaded) => {
        nextBitmap = loaded;
        if (!active) {
          loaded.close();
          return;
        }
        setBitmap((current) => {
          current?.close();
          return loaded;
        });
      })
      .catch((error) => {
        if (active) {
          setBitmapError(error instanceof Error ? error.message : "图片加载失败");
          setBitmap(null);
        }
      });
    return () => {
      active = false;
      nextBitmap?.close();
    };
  }, [open, src]);

  useEffect(() => () => {
    setBitmap((current) => {
      current?.close();
      return null;
    });
  }, []);

  useEffect(() => {
    const canvas = drawCanvasRef.current;
    if (!canvas || !bitmap) {
      return;
    }
    if (canvas.width === bitmap.width && canvas.height === bitmap.height) {
      return;
    }
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setDrawHistory([]);
  }, [bitmap]);

  const pushDrawHistory = useCallback(() => {
    const canvas = drawCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    setDrawHistory((items) => [...items.slice(-9), imageData]);
  }, []);

  const undoDraw = useCallback(() => {
    const canvas = drawCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }
    setDrawHistory((items) => {
      const previous = items[items.length - 1];
      if (!previous) {
        context.clearRect(0, 0, canvas.width, canvas.height);
        return items;
      }
      context.putImageData(previous, 0, 0);
      return items.slice(0, -1);
    });
  }, []);

  const drawPointFromEvent = useCallback((event: ReactPointerEvent<HTMLElement> | PointerEvent) => {
    const canvas = drawCanvasRef.current;
    const rect = canvas?.getBoundingClientRect();
    if (!canvas || !rect) {
      return { x: 0, y: 0 };
    }
    return {
      x: (event.clientX - rect.left) * canvas.width / Math.max(1, rect.width),
      y: (event.clientY - rect.top) * canvas.height / Math.max(1, rect.height),
    };
  }, []);

  const setupDrawStyle = useCallback((context: CanvasRenderingContext2D) => {
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = mode === "mask" ? brushSize : brushSize;
    context.strokeStyle = mode === "mask" ? `rgba(255,255,255,${MASK_BRUSH_ALPHA / 255})` : brushColor;
    context.fillStyle = mode === "mask" ? `rgba(255,255,255,${MASK_BRUSH_ALPHA / 255})` : brushColor;
    context.globalCompositeOperation = "source-over";
  }, [brushColor, brushSize, mode]);

  const drawFreePoint = useCallback((point: { x: number; y: number }) => {
    const state = drawStateRef.current;
    const canvas = drawCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (state.kind !== "draw" || !canvas || !context) {
      return;
    }
    setupDrawStyle(context);
    const dx = point.x - state.x;
    const dy = point.y - state.y;
    const radius = Math.max(1, brushSize / 2);
    const dist = Math.hypot(dx, dy);
    if (dist > radius) {
      const steps = Math.ceil(dist / Math.max(1, radius * 0.35));
      for (let i = 1; i <= steps; i += 1) {
        const t = i / steps;
        const x = state.x + dx * t;
        const y = state.y + dy * t;
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
      }
    }
    context.beginPath();
    context.moveTo(state.x, state.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    drawStateRef.current = { ...state, x: point.x, y: point.y };
  }, [brushSize, setupDrawStyle]);

  const drawBrushShape = useCallback((context: CanvasRenderingContext2D, start: { x: number; y: number }, end: { x: number; y: number }) => {
    setupDrawStyle(context);
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const w = Math.abs(end.x - start.x);
    const h = Math.abs(end.y - start.y);
    if (brushTool === "rect") {
      context.strokeRect(x, y, w, h);
    }
    if (brushTool === "ellipse") {
      context.beginPath();
      context.ellipse(x + w / 2, y + h / 2, Math.max(1, w / 2), Math.max(1, h / 2), 0, 0, Math.PI * 2);
      context.stroke();
    }
  }, [brushTool, setupDrawStyle]);

  const drawNumberLabel = useCallback((point: { x: number; y: number }) => {
    const canvas = drawCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }
    const size = Math.max(18, brushSize * 2.2);
    const text = circledNumber(labelCounter);
    setupDrawStyle(context);
    context.save();
    context.font = `900 ${size}px Arial, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineWidth = Math.max(3, size / 8);
    context.strokeStyle = "rgba(255,255,255,0.92)";
    context.strokeText(text, point.x, point.y);
    context.fillStyle = brushColor;
    context.fillText(text, point.x, point.y);
    context.restore();
    setLabelCounter((value) => value + 1);
  }, [brushColor, brushSize, labelCounter, setupDrawStyle]);

  const gridLineHit = useCallback((point: { x: number; y: number }) => {
    const canvas = drawCanvasRef.current;
    if (!canvas) {
      return -1;
    }
    const threshold = Math.max(8, Math.min(canvas.width, canvas.height) / 80);
    let best = -1;
    let bestDist = Infinity;
    gridLines.forEach((line, index) => {
      const dist = line.type === "h" ? Math.abs(point.y - line.pos * canvas.height) : Math.abs(point.x - line.pos * canvas.width);
      if (dist < bestDist && dist <= threshold) {
        best = index;
        bestDist = dist;
      }
    });
    return best;
  }, [gridLines]);

  const setGridLinePosition = useCallback((index: number, point: { x: number; y: number }) => {
    const canvas = drawCanvasRef.current;
    if (!canvas) {
      return;
    }
    setGridLines((items) => items.map((line, itemIndex) => {
      if (itemIndex !== index) {
        return line;
      }
      return {
        ...line,
        pos: line.type === "h"
          ? clamp(point.y / Math.max(1, canvas.height), 0.001, 0.999)
          : clamp(point.x / Math.max(1, canvas.width), 0.001, 0.999),
      };
    }));
  }, []);

  const beginDraw = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!canDraw || !bitmap) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const canvas = drawCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is best-effort for drawing outside the canvas bounds.
    }
    const point = drawPointFromEvent(event);
    if (mode === "grid") {
      if (!gridCustom) {
        return;
      }
      const hit = gridLineHit(point);
      if (hit >= 0) {
        drawStateRef.current = { kind: "grid", pointerId: event.pointerId, index: hit };
        setGridLinePosition(hit, point);
        return;
      }
      const canvasSize = gridOrientation === "h" ? canvas.height : canvas.width;
      const pos = clamp((gridOrientation === "h" ? point.y : point.x) / Math.max(1, canvasSize), 0.001, 0.999);
      setGridLines((items) => {
        const next = [...items, { type: gridOrientation, pos }];
        drawStateRef.current = { kind: "grid", pointerId: event.pointerId, index: next.length - 1 };
        return next;
      });
      return;
    }

    pushDrawHistory();
    if (mode === "brush" && brushTool === "label") {
      drawNumberLabel(point);
      drawStateRef.current = { kind: "none" };
      return;
    }
    const snapshot = mode === "brush" && brushTool !== "free" ? context.getImageData(0, 0, canvas.width, canvas.height) : undefined;
    drawStateRef.current = {
      kind: "draw",
      pointerId: event.pointerId,
      x: point.x,
      y: point.y,
      startX: point.x,
      startY: point.y,
      snapshot,
    };
    setupDrawStyle(context);
    context.beginPath();
    context.moveTo(point.x, point.y);
    context.lineTo(point.x + 0.01, point.y + 0.01);
    if (mode === "mask" || brushTool === "free") {
      context.stroke();
    }
  }, [
    bitmap,
    brushTool,
    canDraw,
    drawNumberLabel,
    drawPointFromEvent,
    gridCustom,
    gridLineHit,
    gridOrientation,
    mode,
    pushDrawHistory,
    setGridLinePosition,
    setupDrawStyle,
  ]);

  const moveDraw = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const state = drawStateRef.current;
    if (state.kind === "none" || state.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const point = drawPointFromEvent(event);
    if (state.kind === "grid") {
      setGridLinePosition(state.index, point);
      return;
    }
    const canvas = drawCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }
    if (mode === "brush" && brushTool !== "free") {
      if (state.snapshot) {
        context.putImageData(state.snapshot, 0, 0);
      }
      drawBrushShape(context, { x: state.startX, y: state.startY }, point);
      return;
    }
    drawFreePoint(point);
  }, [brushTool, drawBrushShape, drawFreePoint, drawPointFromEvent, mode, setGridLinePosition]);

  const endDraw = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (drawStateRef.current.kind !== "none" && drawStateRef.current.pointerId === event.pointerId) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Ignore capture cleanup failures across browsers.
      }
      drawStateRef.current = { kind: "none" };
    }
  }, []);

  const updateCropByPointer = useCallback((clientX: number, clientY: number) => {
    const drag = cropDragRef.current;
    const rect = imageFrameRef.current?.getBoundingClientRect();
    if (!drag || !rect || rect.width <= 0 || rect.height <= 0) {
      return;
    }
    const dx = ((clientX - drag.startClientX) / rect.width) * 100;
    const dy = ((clientY - drag.startClientY) / rect.height) * 100;

    if (drag.mode === "crop-move") {
      const nextX = clamp(drag.startCrop.x + dx, 0, 100 - drag.startCrop.w);
      const nextY = clamp(drag.startCrop.y + dy, 0, 100 - drag.startCrop.h);
      setCropBox({ ...drag.startCrop, x: nextX, y: nextY });
      return;
    }
    if (drag.mode === "crop-resize") {
      const nextW = clamp(drag.startCrop.w + dx, MIN_CROP_SIZE, 100 - drag.startCrop.x);
      const nextH = clamp(drag.startCrop.h + dy, MIN_CROP_SIZE, 100 - drag.startCrop.y);
      setCropBox({ ...drag.startCrop, w: nextW, h: nextH });
      return;
    }

    const scaleX = displaySize.width > 0 ? 100 / displaySize.width : 0;
    const scaleY = displaySize.height > 0 ? 100 / displaySize.height : 0;
    setOutpaintBox((current) => {
      const start = "startBox" in drag ? drag.startBox : current;
      if (drag.mode === "outpaint-left") {
        return { ...start, left: clamp(start.left - dx * scaleX, 0, 200) };
      }
      if (drag.mode === "outpaint-right") {
        return { ...start, right: clamp(start.right + dx * scaleX, 0, 200) };
      }
      if (drag.mode === "outpaint-top") {
        return { ...start, top: clamp(start.top - dy * scaleY, 0, 200) };
      }
      if (drag.mode === "outpaint-bottom") {
        return { ...start, bottom: clamp(start.bottom + dy * scaleY, 0, 200) };
      }
      return {
        ...start,
        right: clamp(start.right + dx * scaleX, 0, 200),
        bottom: clamp(start.bottom + dy * scaleY, 0, 200),
      };
    });
  }, [displaySize.height, displaySize.width]);

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      const drag = cropDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }
      event.preventDefault();
      updateCropByPointer(event.clientX, event.clientY);
    };
    const handleEnd = (event: PointerEvent) => {
      const drag = cropDragRef.current;
      if (drag && drag.pointerId === event.pointerId) {
        cropDragRef.current = null;
      }
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleEnd);
    window.addEventListener("pointercancel", handleEnd);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleEnd);
      window.removeEventListener("pointercancel", handleEnd);
    };
  }, [updateCropByPointer]);

  const startCropDrag = useCallback((event: ReactPointerEvent<HTMLElement>, dragMode: "crop-move" | "crop-resize") => {
    event.preventDefault();
    event.stopPropagation();
    cropDragRef.current = {
      mode: dragMode,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startCrop: cropBox,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is best-effort while dragging across the editor surface.
    }
  }, [cropBox]);

  const startOutpaintDrag = useCallback((event: ReactPointerEvent<HTMLElement>, dragMode: CropDragState["mode"]) => {
    if (!String(dragMode).startsWith("outpaint-")) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    cropDragRef.current = {
      mode: dragMode as Extract<CropDragState["mode"], `outpaint-${string}`>,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startBox: outpaintBox,
    };
  }, [outpaintBox]);

  const handleWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    if (!src) {
      return;
    }
    event.preventDefault();
    const nextZoom = event.deltaY < 0 ? zoom * 1.08 : zoom * 0.92;
    setZoom(clamp(nextZoom, 0.4, 3));
  }, [src, zoom]);

  const closeEditor = useCallback(() => onOpenChange(false), [onOpenChange]);

  const makeCropFile = useCallback(async () => {
    if (!bitmap) {
      throw new Error("图片尚未加载完成");
    }
    const safeCrop = {
      x: clamp(cropBox.x, 0, 100),
      y: clamp(cropBox.y, 0, 100),
      w: clamp(cropBox.w, 1, 100 - cropBox.x),
      h: clamp(cropBox.h, 1, 100 - cropBox.y),
    };
    const sourceX = Math.round((safeCrop.x / 100) * bitmap.width);
    const sourceY = Math.round((safeCrop.y / 100) * bitmap.height);
    const sourceW = Math.max(1, Math.round((safeCrop.w / 100) * bitmap.width));
    const sourceH = Math.max(1, Math.round((safeCrop.h / 100) * bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = sourceW;
    canvas.height = sourceH;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("浏览器不支持图片裁剪");
    }
    context.drawImage(bitmap, sourceX, sourceY, sourceW, sourceH, 0, 0, sourceW, sourceH);
    return canvasToFile(canvas, `${baseFileName(image)}-crop.png`);
  }, [bitmap, cropBox, image]);

  const makeOutpaintFile = useCallback(async () => {
    if (!bitmap) {
      throw new Error("图片尚未加载完成");
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(bitmap.width, outpaintNatural.width);
    canvas.height = Math.max(bitmap.height, outpaintNatural.height);
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("浏览器不支持图片扩图");
    }
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, outpaintNatural.left, outpaintNatural.top);
    return canvasToFile(canvas, `${baseFileName(image)}-outpaint.png`);
  }, [bitmap, image, outpaintNatural.height, outpaintNatural.left, outpaintNatural.top, outpaintNatural.width]);

  const makeMaskFile = useCallback(async () => {
    const source = drawCanvasRef.current;
    if (!source || !bitmap) {
      throw new Error("图片尚未加载完成");
    }
    const sourceContext = source.getContext("2d");
    if (!sourceContext) {
      throw new Error("浏览器不支持遮罩");
    }
    const sourceData = sourceContext.getImageData(0, 0, source.width, source.height);
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("浏览器不支持遮罩");
    }
    const output = context.createImageData(canvas.width, canvas.height);
    let hasPaint = false;
    for (let i = 0; i < sourceData.data.length; i += 4) {
      const painted = sourceData.data[i + 3] > 8;
      const value = painted ? 255 : 0;
      hasPaint = hasPaint || painted;
      output.data[i] = value;
      output.data[i + 1] = value;
      output.data[i + 2] = value;
      output.data[i + 3] = 255;
    }
    if (!hasPaint) {
      throw new Error("请先绘制遮罩区域");
    }
    context.putImageData(output, 0, 0);
    return canvasToFile(canvas, `${baseFileName(image)}-mask.png`);
  }, [bitmap, image]);

  const makeBrushFile = useCallback(async () => {
    const overlay = drawCanvasRef.current;
    if (!overlay || !bitmap) {
      throw new Error("图片尚未加载完成");
    }
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("浏览器不支持画笔");
    }
    context.drawImage(bitmap, 0, 0);
    context.drawImage(overlay, 0, 0);
    return canvasToFile(canvas, `${baseFileName(image)}-paint.png`);
  }, [bitmap, image]);

  const gridRects = useCallback(() => {
    if (!bitmap) {
      return [];
    }
    const hStops = gridCustom
      ? sortedUniquePositions(gridLines, "h")
      : Array.from({ length: Math.max(0, gridRows - 1) }, (_, index) => (index + 1) / Math.max(1, gridRows));
    const vStops = gridCustom
      ? sortedUniquePositions(gridLines, "v")
      : Array.from({ length: Math.max(0, gridCols - 1) }, (_, index) => (index + 1) / Math.max(1, gridCols));
    const ys = [0, ...hStops.map((pos) => Math.round(pos * bitmap.height)), bitmap.height];
    const xs = [0, ...vStops.map((pos) => Math.round(pos * bitmap.width)), bitmap.width];
    const gap = clamp(gridGap, 0, 240);
    const rects: Array<{ x: number; y: number; w: number; h: number; row: number; col: number }> = [];
    for (let row = 0; row < ys.length - 1; row += 1) {
      for (let col = 0; col < xs.length - 1; col += 1) {
        const halfGap = gap / 2;
        const x = Math.round(xs[col] + (col > 0 ? halfGap : 0));
        const y = Math.round(ys[row] + (row > 0 ? halfGap : 0));
        const right = Math.round(xs[col + 1] - (col < xs.length - 2 ? halfGap : 0));
        const bottom = Math.round(ys[row + 1] - (row < ys.length - 2 ? halfGap : 0));
        const w = Math.max(1, right - x);
        const h = Math.max(1, bottom - y);
        rects.push({ x, y, w, h, row, col });
      }
    }
    return rects;
  }, [bitmap, gridCols, gridCustom, gridGap, gridLines, gridRows]);

  const makeGridFiles = useCallback(async () => {
    if (!bitmap) {
      throw new Error("图片尚未加载完成");
    }
    const rects = gridRects();
    if (rects.length === 0) {
      throw new Error("没有可切分的区域");
    }
    const files: File[] = [];
    for (const rect of rects) {
      const canvas = document.createElement("canvas");
      canvas.width = rect.w;
      canvas.height = rect.h;
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("浏览器不支持宫格切分");
      }
      context.drawImage(bitmap, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
      files.push(await canvasToFile(canvas, `${baseFileName(image)}-r${rect.row + 1}-c${rect.col + 1}.png`));
    }
    return files;
  }, [bitmap, gridRects, image]);

  const applyEdit = useCallback(async () => {
    if (!image || applying) {
      return;
    }
    setApplying(true);
    try {
      const files = mode === "crop"
        ? [await makeCropFile()]
        : mode === "outpaint"
          ? [await makeOutpaintFile()]
          : mode === "mask"
            ? [await makeMaskFile()]
            : mode === "brush"
              ? [await makeBrushFile()]
              : await makeGridFiles();
      await onApplyEdit(image, files);
      onOpenChange(false);
    } finally {
      setApplying(false);
    }
  }, [
    applying,
    image,
    makeBrushFile,
    makeCropFile,
    makeGridFiles,
    makeMaskFile,
    makeOutpaintFile,
    mode,
    onApplyEdit,
    onOpenChange,
  ]);

  const drawGridOverlay = () => {
    if (mode !== "grid" || !bitmap) {
      return null;
    }
    const hStops = gridCustom
      ? sortedUniquePositions(gridLines, "h")
      : Array.from({ length: Math.max(0, gridRows - 1) }, (_, index) => (index + 1) / Math.max(1, gridRows));
    const vStops = gridCustom
      ? sortedUniquePositions(gridLines, "v")
      : Array.from({ length: Math.max(0, gridCols - 1) }, (_, index) => (index + 1) / Math.max(1, gridCols));
    return (
      <div className="pointer-events-none absolute inset-0">
        {hStops.map((pos) => (
          <span key={`h-${pos}`} className="absolute left-0 right-0 h-0.5 bg-sky-400/90 shadow-[0_0_0_1px_rgba(255,255,255,0.55)]" style={{ top: `${pos * 100}%` }} />
        ))}
        {vStops.map((pos) => (
          <span key={`v-${pos}`} className="absolute top-0 bottom-0 w-0.5 bg-sky-400/90 shadow-[0_0_0_1px_rgba(255,255,255,0.55)]" style={{ left: `${pos * 100}%` }} />
        ))}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[min(92dvh,980px)] w-[min(96vw,1480px)] max-w-none grid-cols-none flex-col gap-3 rounded-[22px] border border-slate-200 bg-card p-3 text-card-foreground shadow-[0_32px_120px_rgba(15,23,42,0.28)] dark:border-slate-700 dark:bg-[#111827] dark:text-slate-100"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="grid min-h-12 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-1">
          <div className="min-w-0">
            <DialogTitle className="text-sm font-black leading-tight text-foreground dark:text-slate-100">
              {modeMeta.title}
            </DialogTitle>
            <DialogDescription className="mt-1 truncate text-xs font-semibold text-muted-foreground dark:text-slate-500">
              {modeMeta.description}
            </DialogDescription>
          </div>

          <div className="flex items-center gap-1 rounded-2xl border border-border bg-muted/60 p-1 dark:border-slate-700 dark:bg-slate-950/45">
            {editModes.map((item) => {
              const Icon = item.icon;
              const active = item.value === mode;
              return (
                <button
                  key={item.value}
                  type="button"
                  className={cn(
                    "flex h-8 items-center gap-1.5 rounded-xl px-3 text-xs font-black text-muted-foreground transition hover:bg-background hover:text-foreground dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100",
                    active && "bg-background text-foreground shadow-sm dark:bg-slate-200 dark:text-slate-950 dark:hover:bg-slate-200 dark:hover:text-slate-950",
                  )}
                  onClick={() => setMode(item.value)}
                >
                  <Icon className="size-3.5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              className="flex size-9 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition hover:bg-accent hover:text-foreground dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              onClick={closeEditor}
              aria-label="关闭"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {mode === "mask" ? (
          <div className="flex h-12 items-center gap-3 rounded-2xl border border-border bg-muted/55 px-3 dark:border-slate-700 dark:bg-slate-950/45">
            <label className="flex items-center gap-2 text-xs font-bold text-muted-foreground dark:text-slate-400">
              笔刷
              <input type="range" min={4} max={160} value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} />
            </label>
            <Button type="button" size="sm" variant="outline" className="h-8 rounded-full text-xs" onClick={undoDraw} disabled={drawHistory.length === 0}>
              <Undo2 className="size-3.5" />
              撤销
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-8 rounded-full text-xs" onClick={clearDrawCanvas}>
              <Eraser className="size-3.5" />
              清空
            </Button>
            <span className="text-xs font-semibold text-muted-foreground dark:text-slate-500">白色区域为要编辑的遮罩</span>
          </div>
        ) : null}

        {mode === "brush" ? (
          <div className="flex h-12 items-center gap-2 rounded-2xl border border-border bg-muted/55 px-3 dark:border-slate-700 dark:bg-slate-950/45">
            {[
              { value: "free", icon: Paintbrush, label: "自由画笔" },
              { value: "rect", icon: RectangleHorizontal, label: "矩形" },
              { value: "ellipse", icon: Circle, label: "椭圆" },
              { value: "label", icon: ListOrdered, label: "数字标签" },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <Button
                  key={item.value}
                  type="button"
                  size="sm"
                  variant={brushTool === item.value ? "default" : "outline"}
                  className="h-8 rounded-full px-3 text-xs"
                  onClick={() => setBrushTool(item.value as BrushTool)}
                  title={item.label}
                >
                  <Icon className="size-3.5" />
                </Button>
              );
            })}
            <label className="flex items-center gap-2 text-xs font-bold text-muted-foreground dark:text-slate-400">
              颜色
              <input className="h-7 w-9 rounded-md border border-border bg-background p-0" type="color" value={brushColor} onChange={(event) => setBrushColor(event.target.value)} />
            </label>
            <label className="flex items-center gap-2 text-xs font-bold text-muted-foreground dark:text-slate-400">
              笔刷
              <input type="range" min={2} max={80} value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} />
            </label>
            <Button type="button" size="sm" variant="outline" className="h-8 rounded-full text-xs" onClick={undoDraw} disabled={drawHistory.length === 0}>
              <Undo2 className="size-3.5" />
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-8 rounded-full text-xs" onClick={clearDrawCanvas}>
              <Eraser className="size-3.5" />
            </Button>
          </div>
        ) : null}

        {mode === "grid" ? (
          <div className="flex h-12 items-center gap-2 rounded-2xl border border-border bg-muted/55 px-3 dark:border-slate-700 dark:bg-slate-950/45">
            <Button type="button" size="sm" variant={gridCustom ? "default" : "outline"} className="h-8 rounded-full text-xs" onClick={() => setGridCustom((value) => !value)}>
              自定义
            </Button>
            {gridCustom ? (
              <>
                <Button type="button" size="sm" variant={gridOrientation === "h" ? "default" : "outline"} className="h-8 rounded-full text-xs" onClick={() => setGridOrientation("h")}>水平</Button>
                <Button type="button" size="sm" variant={gridOrientation === "v" ? "default" : "outline"} className="h-8 rounded-full text-xs" onClick={() => setGridOrientation("v")}>垂直</Button>
                <Button type="button" size="sm" variant="outline" className="h-8 rounded-full text-xs" onClick={() => setGridLines([])}>
                  <Eraser className="size-3.5" />
                  清线
                </Button>
              </>
            ) : (
              <>
                <label className="flex items-center gap-2 text-xs font-bold text-muted-foreground dark:text-slate-400">
                  行
                  <input className="h-8 w-16 rounded-lg border border-border bg-background px-2 text-xs" type="number" min={1} max={12} value={gridRows} onChange={(event) => setGridRows(clamp(Number(event.target.value) || 1, 1, 12))} />
                </label>
                <label className="flex items-center gap-2 text-xs font-bold text-muted-foreground dark:text-slate-400">
                  列
                  <input className="h-8 w-16 rounded-lg border border-border bg-background px-2 text-xs" type="number" min={1} max={12} value={gridCols} onChange={(event) => setGridCols(clamp(Number(event.target.value) || 1, 1, 12))} />
                </label>
                {[["1×2", 1, 2], ["2×1", 2, 1], ["2×2", 2, 2], ["3×3", 3, 3]].map(([label, rows, cols]) => (
                  <Button key={String(label)} type="button" size="sm" variant="outline" className="h-8 rounded-full text-xs" onClick={() => {
                    setGridRows(Number(rows));
                    setGridCols(Number(cols));
                  }}>
                    {label}
                  </Button>
                ))}
              </>
            )}
            <label className="ml-auto flex items-center gap-2 text-xs font-bold text-muted-foreground dark:text-slate-400">
              间隔 {gridGap}px
              <input type="range" min={0} max={80} value={gridGap} onChange={(event) => setGridGap(Number(event.target.value))} />
            </label>
            <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-black text-primary-foreground">{gridSplitCount} 张</span>
          </div>
        ) : null}

        <div
          className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-[20px] border border-border bg-[#08111f] p-4 dark:border-slate-700 dark:bg-[#070d1a]"
          onWheel={handleWheel}
        >
          {src ? (
            <div
              ref={imageFrameRef}
              className={cn("relative inline-block max-h-full max-w-full select-none rounded-2xl bg-slate-950/45 leading-none", mode === "outpaint" && "bg-white")}
              style={{
                width: mode === "outpaint" ? outpaintDisplay.width : displaySize.width,
                height: mode === "outpaint" ? outpaintDisplay.height : displaySize.height,
                transform: `scale(${zoom})`,
                transformOrigin: "center",
              }}
            >
              {mode === "outpaint" ? (
                <div className="absolute inset-0 rounded-2xl bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.24)]" />
              ) : null}
              <AuthenticatedImage
                src={src}
                alt={image ? canvasImageLabel(image, 0) : "图片"}
                draggable={false}
                className="absolute rounded-2xl object-contain"
                style={{
                  left: mode === "outpaint" ? outpaintDisplay.left : 0,
                  top: mode === "outpaint" ? outpaintDisplay.top : 0,
                  width: displaySize.width,
                  height: displaySize.height,
                }}
                placeholderClassName="min-h-[360px] min-w-[420px] rounded-2xl bg-slate-900 text-slate-500"
              />
              {canDraw ? (
                <canvas
                  ref={drawCanvasRef}
                  className={cn(
                    "absolute z-20",
                    mode === "grid" && gridCustom ? "cursor-crosshair" : "",
                    mode === "mask" || mode === "brush" ? "cursor-crosshair" : "",
                  )}
                  style={{
                    left: 0,
                    top: 0,
                    width: displaySize.width,
                    height: displaySize.height,
                  }}
                  onPointerDown={beginDraw}
                  onPointerMove={moveDraw}
                  onPointerUp={endDraw}
                  onPointerCancel={endDraw}
                />
              ) : null}
              {drawGridOverlay()}
              {mode === "crop" ? (
                <div
                  className="absolute rounded-[10px] border-2 border-white/95 shadow-[0_0_0_9999px_rgba(2,6,23,0.52),0_16px_36px_rgba(2,6,23,0.28)]"
                  style={{
                    left: `${cropBox.x}%`,
                    top: `${cropBox.y}%`,
                    width: `${cropBox.w}%`,
                    height: `${cropBox.h}%`,
                  }}
                  onPointerDown={(event) => startCropDrag(event, "crop-move")}
                >
                  <button
                    type="button"
                    className="absolute -right-2 -bottom-2 size-5 rounded-full border-2 border-slate-950 bg-white shadow-lg"
                    onPointerDown={(event) => startCropDrag(event, "crop-resize")}
                    aria-label="调整裁剪框大小"
                  />
                </div>
              ) : null}
              {mode === "outpaint" ? (
                <div className="absolute inset-0 z-30 rounded-2xl border-2 border-white/95 shadow-[0_0_0_1px_rgba(15,23,42,0.28),0_16px_36px_rgba(15,23,42,0.18)]">
                  <span className="absolute left-3 top-3 rounded-full bg-slate-950/75 px-3 py-1 text-xs font-black text-white">
                    {outpaintNatural.width} × {outpaintNatural.height}
                  </span>
                  {[
                    ["outpaint-top", "left-1/2 top-0 h-3 w-16 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize"],
                    ["outpaint-bottom", "bottom-0 left-1/2 h-3 w-16 -translate-x-1/2 translate-y-1/2 cursor-ns-resize"],
                    ["outpaint-left", "left-0 top-1/2 h-16 w-3 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize"],
                    ["outpaint-right", "right-0 top-1/2 h-16 w-3 -translate-y-1/2 translate-x-1/2 cursor-ew-resize"],
                    ["outpaint-corner", "bottom-0 right-0 size-5 translate-x-1/2 translate-y-1/2 cursor-nwse-resize rounded-full"],
                  ].map(([handle, className]) => (
                    <button
                      key={handle}
                      type="button"
                      className={cn("absolute rounded-full border-2 border-slate-950 bg-white shadow-lg", className)}
                      onPointerDown={(event) => startOutpaintDrag(event, handle as CropDragState["mode"])}
                      aria-label="调整扩图区域"
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-700 px-8 py-10 text-sm font-semibold text-slate-500">
              {bitmapError || "图片加载失败"}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 px-1">
          <span className="mr-auto select-none px-1 text-xs font-black text-muted-foreground dark:text-slate-500">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-full px-4 text-xs font-bold dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
            onClick={() => {
              setCropBox(DEFAULT_CROP);
              setOutpaintBox(DEFAULT_OUTPAINT);
              setZoom(1);
              setGridLines([]);
              clearDrawCanvas();
            }}
            disabled={applying}
          >
            <RotateCcw className="size-4" />
            重置
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-full px-4 text-xs font-bold dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
            onClick={closeEditor}
            disabled={applying}
          >
            取消
          </Button>
          <Button
            type="button"
            className="h-9 rounded-full px-5 text-xs font-black"
            onClick={() => void applyEdit()}
            disabled={!src || !bitmap || applying}
          >
            {applying ? <LoaderCircle className="size-4 animate-spin" /> : <ActionIcon className="size-4" />}
            {modeMeta.action}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
