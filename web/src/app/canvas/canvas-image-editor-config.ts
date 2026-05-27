import { Brush, Crop, Eye, Grid3X3, Maximize2, Paintbrush, type LucideIcon } from "lucide-react";

import type { CropAspect, ImageEditMode, OutpaintBackground, OutpaintBox, SmartCanvasCropBox } from "./canvas-image-editor-types";

export const DEFAULT_CROP: SmartCanvasCropBox = { x: 10, y: 10, w: 80, h: 80 };
export const DEFAULT_OUTPAINT: OutpaintBox = { left: 15, top: 15, right: 15, bottom: 15 };
export const MIN_CROP_SIZE = 8;
export const MASK_BRUSH_ALPHA = 115;

export const cropAspectOptions: Array<{ value: CropAspect; label: string; ratio?: number }> = [
  { value: "free", label: "自由" },
  { value: "1:1", label: "1:1", ratio: 1 },
  { value: "4:3", label: "4:3", ratio: 4 / 3 },
  { value: "3:4", label: "3:4", ratio: 3 / 4 },
  { value: "16:9", label: "16:9", ratio: 16 / 9 },
  { value: "9:16", label: "9:16", ratio: 9 / 16 },
];

export const outpaintBackgroundOptions: Array<{ value: OutpaintBackground; label: string; className: string }> = [
  { value: "transparent", label: "透明", className: "bg-[linear-gradient(45deg,#cbd5e1_25%,transparent_25%),linear-gradient(-45deg,#cbd5e1_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#cbd5e1_75%),linear-gradient(-45deg,transparent_75%,#cbd5e1_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0] bg-white" },
  { value: "white", label: "白色", className: "bg-white" },
  { value: "black", label: "黑色", className: "bg-slate-950" },
];

export const editModes: Array<{
  value: ImageEditMode;
  label: string;
  icon: LucideIcon;
  title: string;
  description: string;
  action: string;
}> = [
  {
    value: "preview",
    label: "预览",
    icon: Eye,
    title: "预览图片",
    description: "查看完整原图，滚轮缩放",
    action: "",
  },
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
