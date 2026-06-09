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
import { ChevronLeft, ChevronRight, FileText, Image as ImageIcon, LoaderCircle, RotateCcw, X, ZoomIn } from "lucide-react";

import { AuthenticatedImage } from "@/components/authenticated-image";
import { ImageLightbox } from "@/components/image-lightbox";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { CanvasImageRef } from "@/lib/api";
import { fetchAuthenticatedImageBlob } from "@/lib/authenticated-image";
import { cn } from "@/lib/utils";

import { DEFAULT_CROP, DEFAULT_OUTPAINT, DEFAULT_RESIZE, MASK_BRUSH_ALPHA, MAX_RESIZE_SIDE, MIN_CROP_SIZE, MIN_RESIZE_SIDE, cropAspectOptions, editModes } from "./canvas-image-editor-config";
import { SmartCanvasImageEditorToolPanel } from "./canvas-image-editor-tool-panel";
import type {
  BrushTool,
  CropAspect,
  GridLine,
  GridOrientation,
  ImageEditMode,
  MaskTool,
  OutpaintBackground,
  OutpaintBox,
  ResizeSize,
  SmartCanvasCropBox,
} from "./canvas-image-editor-types";
import { baseFileName, canvasToFile, circledNumber, clamp, sortedUniquePositions } from "./canvas-image-editor-utils";
import { canvasImageLabel, canvasImagePreviewSource, canvasImageSource, statusLabel } from "./canvas-utils";
import type { SmartCanvasAngleControlValues, SmartCanvasItem } from "./types";

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

type SmartCanvasImageEditorProps = {
  image: CanvasImageRef | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplyEdit: (image: CanvasImageRef, files: File[], mode: ImageEditMode) => Promise<void>;
  angleValues: SmartCanvasAngleControlValues;
  anglePrompt: string;
  angleResultItem: SmartCanvasItem | null;
  runningAngle: boolean;
  runningBackgroundRemoval: boolean;
  initialMode?: ImageEditMode;
  onAngleValuesChange: (values: SmartCanvasAngleControlValues) => void;
  onSubmitAngle: (values: SmartCanvasAngleControlValues) => Promise<string>;
  onSubmitBackgroundRemoval?: (prompt: string) => Promise<string>;
};

function clampResizeSide(value: number) {
  const safeValue = Number.isFinite(value) ? value : MIN_RESIZE_SIDE;
  return Math.round(clamp(safeValue, MIN_RESIZE_SIDE, MAX_RESIZE_SIDE));
}

function fitResizeSize(width: number, height: number) {
  let nextWidth = Math.max(MIN_RESIZE_SIDE, Math.round(Number.isFinite(width) ? width : MIN_RESIZE_SIDE));
  let nextHeight = Math.max(MIN_RESIZE_SIDE, Math.round(Number.isFinite(height) ? height : MIN_RESIZE_SIDE));
  const shrink = Math.min(MAX_RESIZE_SIDE / nextWidth, MAX_RESIZE_SIDE / nextHeight, 1);
  if (shrink < 1) {
    nextWidth = Math.max(MIN_RESIZE_SIDE, Math.round(nextWidth * shrink));
    nextHeight = Math.max(MIN_RESIZE_SIDE, Math.round(nextHeight * shrink));
  }
  return {
    width: clampResizeSide(nextWidth),
    height: clampResizeSide(nextHeight),
  };
}

function fitLockedResizeSize(side: keyof ResizeSize, value: number, ratio: number) {
  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  const safeValue = clampResizeSide(value);
  const width = side === "width" ? safeValue : safeValue * safeRatio;
  const height = side === "height" ? safeValue : safeValue / safeRatio;
  return fitResizeSize(width, height);
}

const PREVIEW_MIN_DISPLAY_SIDE = 420;
const PREVIEW_MAX_AUTO_UPSCALE = 16;

export function SmartCanvasImageEditor({
  image,
  open,
  onOpenChange,
  onApplyEdit,
  angleValues,
  anglePrompt,
  angleResultItem,
  runningAngle,
  runningBackgroundRemoval,
  initialMode,
  onAngleValuesChange,
  onSubmitAngle,
  onSubmitBackgroundRemoval,
}: SmartCanvasImageEditorProps) {
  const [mode, setMode] = useState<ImageEditMode>("preview");
  const [cropBox, setCropBox] = useState<SmartCanvasCropBox>(DEFAULT_CROP);
  const [cropAspect, setCropAspect] = useState<CropAspect>("free");
  const [resizeSize, setResizeSize] = useState<ResizeSize>(DEFAULT_RESIZE);
  const [resizeLocked, setResizeLocked] = useState(true);
  const [outpaintBox, setOutpaintBox] = useState<OutpaintBox>(DEFAULT_OUTPAINT);
  const [outpaintBackground, setOutpaintBackground] = useState<OutpaintBackground>("white");
  const [zoom, setZoom] = useState(1);
  const [applying, setApplying] = useState(false);
  const [submittingAngle, setSubmittingAngle] = useState(false);
  const [submittingBackgroundRemoval, setSubmittingBackgroundRemoval] = useState(false);
  const [backgroundRemovalPrompt, setBackgroundRemovalPrompt] = useState("");
  const [angleResultLightboxOpen, setAngleResultLightboxOpen] = useState(false);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [bitmapError, setBitmapError] = useState("");
  const [brushSize, setBrushSize] = useState(28);
  const [brushColor, setBrushColor] = useState("#ff2d55");
  const [brushTool, setBrushTool] = useState<BrushTool>("free");
  const [maskTool, setMaskTool] = useState<MaskTool>("paint");
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
  const isPreviewMode = mode === "preview";
  const isAngleMode = mode === "angle";
  const isBackgroundRemovalMode = mode === "background_removal";
  const isPreviewScaleMode = isPreviewMode || isBackgroundRemovalMode;
  const canDraw = mode === "mask" || mode === "brush" || mode === "grid";
  const updateAngleValue = useCallback((key: keyof SmartCanvasAngleControlValues, value: number) => {
    onAngleValuesChange({ ...angleValues, [key]: value });
  }, [angleValues, onAngleValuesChange]);

  const displaySize = useMemo(() => {
    if (!bitmap) {
      return { width: 1, height: 1 };
    }
    const maxW = Math.min(1300, typeof window === "undefined" ? 1300 : window.innerWidth - 96);
    const maxH = Math.min(760, typeof window === "undefined" ? 760 : window.innerHeight - 220);
    const containScale = Math.min(maxW / bitmap.width, maxH / bitmap.height);
    const previewTargetSide = Math.min(PREVIEW_MIN_DISPLAY_SIDE, maxW * 0.72, maxH * 0.72);
    const previewScale = Math.max(1, Math.min(PREVIEW_MAX_AUTO_UPSCALE, previewTargetSide / Math.min(bitmap.width, bitmap.height)));
    const fit = isPreviewScaleMode ? Math.min(containScale, previewScale) : Math.min(containScale, 1);
    return {
      width: Math.max(1, Math.round(bitmap.width * fit)),
      height: Math.max(1, Math.round(bitmap.height * fit)),
    };
  }, [bitmap, isPreviewScaleMode]);

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

  const cropNatural = useMemo(() => {
    if (!bitmap) {
      return { width: 0, height: 0, x: 0, y: 0 };
    }
    return {
      x: Math.round(bitmap.width * cropBox.x / 100),
      y: Math.round(bitmap.height * cropBox.y / 100),
      width: Math.max(1, Math.round(bitmap.width * cropBox.w / 100)),
      height: Math.max(1, Math.round(bitmap.height * cropBox.h / 100)),
    };
  }, [bitmap, cropBox]);

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
    setMode(initialMode || "preview");
    setCropBox(DEFAULT_CROP);
    setCropAspect("free");
    setResizeSize(DEFAULT_RESIZE);
    setResizeLocked(true);
    setOutpaintBox(DEFAULT_OUTPAINT);
    setOutpaintBackground("white");
    setZoom(1);
    setApplying(false);
    setSubmittingAngle(false);
    setSubmittingBackgroundRemoval(false);
    setBackgroundRemovalPrompt("");
    setBitmapError("");
    setBrushSize(28);
    setBrushColor("#ff2d55");
    setBrushTool("free");
    setMaskTool("paint");
    setLabelCounter(1);
    setGridRows(2);
    setGridCols(2);
    setGridGap(0);
    setGridCustom(false);
    setGridOrientation("h");
    setGridLines([]);
    clearDrawCanvas();
  }, [clearDrawCanvas, initialMode, open, src]);

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

  useEffect(() => {
    if (!bitmap) {
      return;
    }
    setResizeSize({ width: bitmap.width, height: bitmap.height });
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
    context.globalCompositeOperation = mode === "mask" && maskTool === "erase" ? "destination-out" : "source-over";
  }, [brushColor, brushSize, maskTool, mode]);

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
      const aspect = cropAspectOptions.find((item) => item.value === cropAspect)?.ratio;
      if (aspect && bitmap) {
        const naturalWidth = bitmap.width * nextW / 100;
        const naturalHeightPct = naturalWidth / aspect / bitmap.height * 100;
        setCropBox({ ...drag.startCrop, w: nextW, h: clamp(naturalHeightPct, MIN_CROP_SIZE, 100 - drag.startCrop.y) });
        return;
      }
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
  }, [bitmap, cropAspect, displaySize.height, displaySize.width]);

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

  const submitAngleAndClose = useCallback(async () => {
    if (submittingAngle) {
      return;
    }
    setSubmittingAngle(true);
    try {
      const outputId = await onSubmitAngle(angleValues);
      if (outputId) {
        closeEditor();
      }
    } finally {
      setSubmittingAngle(false);
    }
  }, [angleValues, closeEditor, onSubmitAngle, submittingAngle]);

  const submitBackgroundRemovalAndClose = useCallback(async () => {
    if (submittingBackgroundRemoval || !onSubmitBackgroundRemoval) {
      return;
    }
    setSubmittingBackgroundRemoval(true);
    try {
      const outputId = await onSubmitBackgroundRemoval(backgroundRemovalPrompt);
      if (outputId) {
        closeEditor();
      }
    } finally {
      setSubmittingBackgroundRemoval(false);
    }
  }, [backgroundRemovalPrompt, closeEditor, onSubmitBackgroundRemoval, submittingBackgroundRemoval]);

  const updateCropPercent = useCallback((patch: Partial<SmartCanvasCropBox>) => {
    setCropBox((current) => {
      const next = { ...current, ...patch };
      next.x = clamp(next.x, 0, 100 - MIN_CROP_SIZE);
      next.y = clamp(next.y, 0, 100 - MIN_CROP_SIZE);
      next.w = clamp(next.w, MIN_CROP_SIZE, 100 - next.x);
      next.h = clamp(next.h, MIN_CROP_SIZE, 100 - next.y);
      return next;
    });
  }, []);

  const setCropPixelSize = useCallback((axis: "width" | "height", value: number) => {
    if (!bitmap) {
      return;
    }
    const safeValue = Math.max(1, Number.isFinite(value) ? value : 1);
    setCropBox((current) => {
      const patch = axis === "width"
        ? { w: safeValue / bitmap.width * 100 }
        : { h: safeValue / bitmap.height * 100 };
      const next = { ...current, ...patch };
      next.w = clamp(next.w, MIN_CROP_SIZE, 100 - next.x);
      next.h = clamp(next.h, MIN_CROP_SIZE, 100 - next.y);
      return next;
    });
  }, [bitmap]);

  const applyCropAspect = useCallback((value: CropAspect) => {
    setCropAspect(value);
    const ratio = cropAspectOptions.find((item) => item.value === value)?.ratio;
    if (!ratio || !bitmap) {
      return;
    }
    setCropBox((current) => {
      const currentWidth = bitmap.width * current.w / 100;
      const nextHeightPct = currentWidth / ratio / bitmap.height * 100;
      if (nextHeightPct <= 100 - current.y) {
        return { ...current, h: clamp(nextHeightPct, MIN_CROP_SIZE, 100 - current.y) };
      }
      const currentHeight = bitmap.height * current.h / 100;
      const nextWidthPct = currentHeight * ratio / bitmap.width * 100;
      return { ...current, w: clamp(nextWidthPct, MIN_CROP_SIZE, 100 - current.x) };
    });
  }, [bitmap]);

  const centerCropBox = useCallback(() => {
    setCropBox((current) => ({
      ...current,
      x: clamp((100 - current.w) / 2, 0, 100 - current.w),
      y: clamp((100 - current.h) / 2, 0, 100 - current.h),
    }));
  }, []);

  const updateOutpaintSide = useCallback((side: keyof OutpaintBox, value: number) => {
    setOutpaintBox((current) => ({
      ...current,
      [side]: clamp(Number.isFinite(value) ? value : 0, 0, 200),
    }));
  }, []);

  const applyOutpaintPreset = useCallback((value: number) => {
    const safeValue = clamp(value, 0, 200);
    setOutpaintBox({ left: safeValue, top: safeValue, right: safeValue, bottom: safeValue });
  }, []);

  const updateResizeSize = useCallback((side: keyof ResizeSize, value: number) => {
    setResizeSize((current) => {
      if (resizeLocked) {
        const ratio = current.width / Math.max(1, current.height);
        return fitLockedResizeSize(side, value, ratio);
      }
      return {
        ...current,
        [side]: clampResizeSide(value),
      };
    });
  }, [resizeLocked]);

  const applyResizeScale = useCallback((scale: number) => {
    if (!bitmap) {
      return;
    }
    const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
    setResizeSize(fitResizeSize(bitmap.width * safeScale, bitmap.height * safeScale));
  }, [bitmap]);

  const applyResizePreset = useCallback((size: ResizeSize) => {
    setResizeSize(fitResizeSize(size.width, size.height));
  }, []);

  const resetResizeSize = useCallback(() => {
    if (!bitmap) {
      setResizeSize(DEFAULT_RESIZE);
      return;
    }
    setResizeSize({ width: bitmap.width, height: bitmap.height });
  }, [bitmap]);

  const makeResizeFile = useCallback(async () => {
    if (!bitmap) {
      throw new Error("图片尚未加载完成");
    }
    const safeSize = fitResizeSize(resizeSize.width, resizeSize.height);
    const canvas = document.createElement("canvas");
    canvas.width = safeSize.width;
    canvas.height = safeSize.height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("浏览器不支持图片缩放");
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height, 0, 0, safeSize.width, safeSize.height);
    return canvasToFile(canvas, `${baseFileName(image)}-${safeSize.width}x${safeSize.height}.png`);
  }, [bitmap, image, resizeSize.height, resizeSize.width]);

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
    if (outpaintBackground !== "transparent") {
      context.fillStyle = outpaintBackground === "black" ? "#020617" : "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(bitmap, outpaintNatural.left, outpaintNatural.top);
    return canvasToFile(canvas, `${baseFileName(image)}-outpaint.png`);
  }, [bitmap, image, outpaintBackground, outpaintNatural.height, outpaintNatural.left, outpaintNatural.top, outpaintNatural.width]);

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
      const index = rect.row * Math.max(1, gridCols) + rect.col + 1;
      const suffix = rects.length === 9 ? String(index).padStart(2, "0") : `r${rect.row + 1}-c${rect.col + 1}`;
      files.push(await canvasToFile(canvas, `${baseFileName(image)}-${suffix}.png`));
    }
    return files;
  }, [bitmap, gridCols, gridRects, image]);

  const applyEdit = useCallback(async () => {
    if (!image || applying) {
      return;
    }
    setApplying(true);
    try {
      const files = mode === "resize"
        ? [await makeResizeFile()]
        : mode === "crop"
          ? [await makeCropFile()]
          : mode === "outpaint"
            ? [await makeOutpaintFile()]
            : mode === "mask"
              ? [await makeMaskFile()]
              : mode === "brush"
                ? [await makeBrushFile()]
                : await makeGridFiles();
      await onApplyEdit(image, files, mode);
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
    makeResizeFile,
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

  const actionBusy = applying ||
    (isAngleMode && (runningAngle || submittingAngle)) ||
    (isBackgroundRemovalMode && (runningBackgroundRemoval || submittingBackgroundRemoval));
  const actionDisabled = isAngleMode
    ? !src || runningAngle || submittingAngle
    : isBackgroundRemovalMode
      ? !src || !onSubmitBackgroundRemoval || runningBackgroundRemoval || submittingBackgroundRemoval
      : !src || !bitmap || applying;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "flex w-[min(96vw,1480px)] max-w-none grid-cols-none flex-col rounded-[22px] border border-slate-200 bg-card text-card-foreground shadow-[0_32px_120px_rgba(15,23,42,0.28)] dark:border-slate-700 dark:bg-[#111827] dark:text-slate-100",
          isAngleMode ? "h-[min(90dvh,860px)] gap-2 p-2.5" : "h-[min(92dvh,980px)] gap-3 p-3",
        )}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className={cn("flex items-center justify-between gap-3 px-1", isAngleMode ? "min-h-10" : "min-h-12")}>
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
                  title={item.title}
                  onClick={() => setMode(item.value)}
                >
                  <Icon className="size-3.5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition hover:bg-accent hover:text-foreground dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
            onClick={closeEditor}
            aria-label="关闭"
          >
            <X className="size-4" />
          </button>
        </div>

        {isAngleMode ? (
        <AngleControlEditorPanel
          image={image}
          values={angleValues}
          prompt={anglePrompt}
          resultItem={angleResultItem}
          running={runningAngle}
          onValueChange={updateAngleValue}
          onLightboxOpenChange={setAngleResultLightboxOpen}
        />
        ) : (
          <div className="flex min-h-0 flex-1 gap-3">
            {isPreviewMode ? null : (
            <SmartCanvasImageEditorToolPanel
              mode={mode}
              cropAspect={cropAspect}
              onCropAspectChange={applyCropAspect}
              cropBox={cropBox}
              cropNatural={cropNatural}
              bitmapSize={{ width: bitmap?.width || 1, height: bitmap?.height || 1 }}
              onUpdateCropPercent={updateCropPercent}
              onSetCropPixelSize={setCropPixelSize}
              onCenterCropBox={centerCropBox}
              onResetCrop={() => {
                setCropAspect("free");
                setCropBox(DEFAULT_CROP);
              }}
              resizeSize={resizeSize}
              resizeLocked={resizeLocked}
              onResizeSizeChange={updateResizeSize}
              onResizeLockedChange={setResizeLocked}
              onApplyResizeScale={applyResizeScale}
              onApplyResizePreset={applyResizePreset}
              onResetResizeSize={resetResizeSize}
              outpaintBox={outpaintBox}
              outpaintNatural={outpaintNatural}
              outpaintBackground={outpaintBackground}
              onUpdateOutpaintSide={updateOutpaintSide}
              onApplyOutpaintPreset={applyOutpaintPreset}
              onOutpaintBackgroundChange={setOutpaintBackground}
              maskTool={maskTool}
              onMaskToolChange={setMaskTool}
              brushTool={brushTool}
              onBrushToolChange={setBrushTool}
              brushSize={brushSize}
              onBrushSizeChange={setBrushSize}
              brushColor={brushColor}
              onBrushColorChange={setBrushColor}
              drawHistoryLength={drawHistory.length}
              onUndoDraw={undoDraw}
              onClearDrawCanvas={clearDrawCanvas}
              gridRows={gridRows}
              onGridRowsChange={setGridRows}
              gridCols={gridCols}
              onGridColsChange={setGridCols}
              gridGap={gridGap}
              onGridGapChange={setGridGap}
              gridCustom={gridCustom}
              onGridCustomChange={setGridCustom}
              gridOrientation={gridOrientation}
              onGridOrientationChange={setGridOrientation}
              onGridLinesChange={setGridLines}
              gridSplitCount={gridSplitCount}
              backgroundRemovalPrompt={backgroundRemovalPrompt}
              onBackgroundRemovalPromptChange={setBackgroundRemovalPrompt}
            />
            )}
            <div
            className="relative flex min-w-0 flex-1 items-center justify-center overflow-auto rounded-[20px] border border-border bg-[#08111f] p-4 dark:border-slate-700 dark:bg-[#070d1a]"
            onWheel={handleWheel}
            >
            {src ? (
              <div
                ref={imageFrameRef}
                className={cn(
                  "relative inline-block max-h-full max-w-full select-none rounded-2xl bg-slate-950/45 leading-none",
                  mode === "outpaint" && outpaintBackground === "white" && "bg-white",
                  mode === "outpaint" && outpaintBackground === "black" && "bg-slate-950",
                  mode === "outpaint" && outpaintBackground === "transparent" && "bg-[linear-gradient(45deg,#cbd5e1_25%,transparent_25%),linear-gradient(-45deg,#cbd5e1_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#cbd5e1_75%),linear-gradient(-45deg,transparent_75%,#cbd5e1_75%)] bg-[length:22px_22px] bg-[position:0_0,0_11px,11px_-11px,-11px_0] bg-white",
                )}
                style={{
                  width: mode === "outpaint" ? outpaintDisplay.width : displaySize.width,
                  height: mode === "outpaint" ? outpaintDisplay.height : displaySize.height,
                  transform: `scale(${zoom})`,
                  transformOrigin: "center",
                }}
              >
                {mode === "outpaint" ? (
                  <div className={cn(
                    "absolute inset-0 rounded-2xl shadow-[0_0_0_1px_rgba(15,23,42,0.24)]",
                    outpaintBackground === "white" && "bg-white",
                    outpaintBackground === "black" && "bg-slate-950",
                    outpaintBackground === "transparent" && "bg-transparent",
                  )} />
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
                {mode === "resize" ? (
                  <div className="pointer-events-none absolute inset-0 rounded-2xl border-2 border-sky-300/95 shadow-[0_0_0_1px_rgba(14,165,233,0.35),0_16px_36px_rgba(15,23,42,0.20)]">
                    <span className="absolute left-3 top-3 rounded-full bg-slate-950/75 px-3 py-1 text-xs font-black text-white">
                      输出 {resizeSize.width} × {resizeSize.height}
                    </span>
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
          </div>
        )}

        <div className="flex items-center gap-2 px-1">
          <span className="mr-auto select-none px-1 text-xs font-black text-muted-foreground dark:text-slate-500">
            {Math.round(zoom * 100)}%
          </span>
          {isAngleMode ? null : <Button
            type="button"
            variant="outline"
            className="h-9 rounded-full px-4 text-xs font-bold dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
            onClick={() => {
              setCropBox(DEFAULT_CROP);
              resetResizeSize();
              setOutpaintBox(DEFAULT_OUTPAINT);
              setBackgroundRemovalPrompt("");
              setZoom(1);
              setGridLines([]);
              clearDrawCanvas();
            }}
            disabled={applying}
          >
            <RotateCcw className="size-4" />
            重置
          </Button>}
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
            onClick={() => {
              if (isAngleMode) {
                void submitAngleAndClose();
                return;
              }
              if (isBackgroundRemovalMode) {
                void submitBackgroundRemovalAndClose();
                return;
              }
              if (isPreviewMode) {
                if (src) {
                  window.open(src, "_blank", "noopener,noreferrer");
                }
                return;
              }
              void applyEdit();
            }}
            disabled={actionDisabled}
          >
            {actionBusy ? <LoaderCircle className="size-4 animate-spin" /> : <ActionIcon className="size-4" />}
            {isAngleMode ? "生成视角" : isPreviewMode ? "打开原图" : modeMeta.action}
          </Button>
        </div>
      </DialogContent>
      <AngleControlResultLightbox
        item={angleResultItem}
        open={angleResultLightboxOpen}
        onOpenChange={setAngleResultLightboxOpen}
      />
    </Dialog>
  );
}

function AngleControlEditorPanel({
  image,
  values,
  prompt,
  resultItem,
  running,
  onValueChange,
  onLightboxOpenChange,
}: {
  image: CanvasImageRef | null;
  values: SmartCanvasAngleControlValues;
  prompt: string;
  resultItem: SmartCanvasItem | null;
  running: boolean;
  onValueChange: (key: keyof SmartCanvasAngleControlValues, value: number) => void;
  onLightboxOpenChange: (open: boolean) => void;
}) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto rounded-[18px] border border-border bg-muted/30 p-3 dark:border-slate-800 dark:bg-slate-950/30 lg:grid-cols-[380px_minmax(0,1fr)] lg:overflow-hidden">
      <aside className="flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden rounded-[18px] border border-border bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <section className="flex min-h-0 min-w-0 shrink-0 flex-col">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-sky-700 dark:text-sky-200">01. 模型</span>
            <span className="rounded-full border border-border bg-background px-2 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
              Auto
            </span>
          </div>
          <div className="relative flex h-[min(28vh,220px)] min-h-[170px] items-center justify-center overflow-hidden rounded-[16px] bg-[#20242a] bg-[linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] bg-[size:38px_38px]">
            <div className="absolute inset-x-0 bottom-8 h-px bg-white/10" />
            <div className="absolute left-1/2 top-0 h-full w-px -rotate-12 bg-white/10" />
            <div className="absolute left-1/3 top-0 h-full w-px rotate-12 bg-white/10" />
            <div
              className="relative inline-flex max-h-[150px] max-w-[250px] items-center justify-center overflow-hidden rounded-xl border border-white/20 bg-slate-900 shadow-[0_22px_56px_rgba(0,0,0,0.32)] transition-transform duration-200"
              style={{
                transform: `perspective(760px) rotateY(${Math.round(values.horizontal) / 2.5}deg) rotateX(${-Math.round(values.vertical) / 2.5}deg) scale(${1 + Number(values.zoom || 0) / 24})`,
              }}
            >
              {image ? (
                <AuthenticatedImage
                  src={canvasImagePreviewSource(image)}
                  alt={canvasImageLabel(image, 0)}
                  className="block max-h-[150px] max-w-[250px] rounded-xl object-contain opacity-80"
                  placeholderClassName="h-[min(20vh,150px)] w-[min(24vw,250px)] rounded-xl bg-zinc-900"
                />
              ) : null}
            </div>
          </div>
        </section>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="mb-2 text-[10px] font-black uppercase tracking-[0.3em] text-sky-700 dark:text-sky-200">02. 参数</div>
          <div className="grid gap-3">
            <AngleControlField
              label="旋转"
              value={values.horizontal}
              min={-180}
              max={180}
              step={1}
              suffix="deg"
              onChange={(value) => onValueChange("horizontal", value)}
            />
            <AngleControlField
              label="俯仰"
              value={values.vertical}
              min={-90}
              max={90}
              step={1}
              suffix="deg"
              onChange={(value) => onValueChange("vertical", value)}
            />
            <AngleControlField
              label="距离"
              value={values.zoom}
              min={0}
              max={10}
              step={1}
              suffix="/10"
              onChange={(value) => onValueChange("zoom", value)}
            />
            <label className="flex min-h-0 flex-1 flex-col">
              <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground dark:text-slate-400">
                <FileText className="size-3.5" />
                Prompt
              </div>
              <textarea
                value={prompt}
                readOnly
                className="min-h-[112px] resize-none rounded-[14px] border border-border bg-muted/40 p-3 text-xs font-semibold leading-5 text-foreground outline-none dark:border-slate-800 dark:bg-slate-950/55 dark:text-slate-100"
              />
            </label>
          </div>
        </section>
      </aside>

      <section className="flex min-w-0 flex-col">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-sky-700 dark:text-sky-200">03. 结果</span>
        </div>
        <AngleControlResultPreview item={resultItem} running={running} onOpen={() => onLightboxOpenChange(true)} />
      </section>
    </div>
  );
}

function AngleControlField({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  const icon = label === "旋转" ? <ChevronLeft className="size-3 rotate-180" /> : label === "俯仰" ? <ChevronRight className="size-3 -rotate-90" /> : <ZoomIn className="size-3" />;
  const resetValue = label === "距离" ? 5 : 0;
  return (
    <label className="block">
      <div className="mb-2 flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-wider text-muted-foreground dark:text-slate-400">
        <span className="inline-flex items-center gap-2">
          {icon}
          {label}
        </span>
        <span className="inline-flex items-center gap-2">
          <button
            type="button"
            className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground dark:hover:bg-slate-800"
            title="重置"
            onClick={(event) => {
              event.preventDefault();
              onChange(resetValue);
            }}
          >
            <RotateCcw className="size-3" />
          </button>
          <span className="rounded-md bg-background px-2 py-1 text-xs font-black text-foreground dark:bg-[#0d1118] dark:text-white">
            {Math.round(value)} {suffix}
          </span>
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        className="h-1.5 w-full cursor-pointer accent-sky-500"
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <div className="mt-1 flex justify-between text-[11px] font-semibold text-muted-foreground dark:text-slate-500">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </label>
  );
}

function AngleControlResultPreview({ item, running, onOpen }: { item: SmartCanvasItem | null; running: boolean; onOpen: () => void }) {
  const images = item?.data?.output?.images || item?.data?.images || [];
  const status = item?.data?.status;
  const active = status === "queued" || status === "running" || running;
  return (
    <div className="relative flex min-h-[220px] flex-1 items-center justify-center overflow-hidden rounded-[18px] border border-border bg-white dark:border-slate-800 dark:bg-slate-900">
      {images[0] ? (
        <button
          type="button"
          className="group flex h-full w-full items-center justify-center p-4"
          onClick={onOpen}
          title="点击查看结果图"
        >
          <AuthenticatedImage
            src={canvasImagePreviewSource(images[0])}
            alt={canvasImageLabel(images[0], 0)}
            className="max-h-[min(58vh,520px)] max-w-full rounded-[14px] object-contain shadow-[0_18px_60px_rgba(15,23,42,0.18)] transition duration-300 group-hover:scale-[1.015]"
            placeholderClassName="h-[min(42vh,360px)] w-[min(48vw,520px)] rounded-[14px] bg-muted dark:bg-slate-950"
          />
        </button>
      ) : active ? (
        <div className="flex flex-col items-center gap-4 text-muted-foreground dark:text-slate-400">
          <LoaderCircle className="size-8 animate-spin" />
          <span className="text-[10px] font-black uppercase tracking-[0.35em]">Processing</span>
        </div>
      ) : item?.data?.error ? (
        <div className="mx-8 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-sm font-semibold text-rose-700 dark:text-rose-200">
          {item.data.error}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 text-muted-foreground/45 dark:text-slate-500">
          <ImageIcon className="size-12 stroke-[1.5px]" />
          <span className="text-[10px] font-black uppercase tracking-[0.45em]">等待生成</span>
        </div>
      )}
      {status ? (
        <div className="absolute left-4 top-4 rounded-full border border-border bg-background/90 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground shadow-sm dark:border-slate-800 dark:bg-slate-950/90 dark:text-slate-300">
          {statusLabel(status)}
        </div>
      ) : null}
    </div>
  );
}

function AngleControlResultLightbox({
  item,
  open,
  onOpenChange,
}: {
  item: SmartCanvasItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const images = item?.data?.output?.images || item?.data?.images || [];
  const lightboxImages = images.map((image, index) => ({
    id: `${item?.id || "angle-result"}-${index}`,
    src: canvasImageSource(image) || canvasImagePreviewSource(image),
    fileName: canvasImageLabel(image, index),
  })).filter((image) => image.src);

  return (
    <ImageLightbox
      images={lightboxImages}
      currentIndex={0}
      open={open && lightboxImages.length > 0}
      onOpenChange={onOpenChange}
      onIndexChange={() => undefined}
    />
  );
}
