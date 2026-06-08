export type ImageEditMode = "preview" | "resize" | "crop" | "outpaint" | "mask" | "brush" | "grid" | "background_removal" | "angle";
export type BrushTool = "free" | "rect" | "ellipse" | "label";
export type GridOrientation = "h" | "v";
export type CropAspect = "free" | "1:1" | "4:3" | "3:4" | "16:9" | "9:16";
export type MaskTool = "paint" | "erase";
export type OutpaintBackground = "transparent" | "white" | "black";

export type SmartCanvasCropBox = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type ResizeSize = {
  width: number;
  height: number;
};

export type OutpaintBox = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type GridLine = {
  type: GridOrientation;
  pos: number;
};
