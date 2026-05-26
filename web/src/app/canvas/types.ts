import type {
  CanvasEdge,
  CanvasImageRef,
  CanvasModelOption,
  CanvasNode,
  CanvasNodeOutput,
  CreationTask,
  ImageVisibility,
  ManagedImage,
} from "@/lib/api";

export const SMART_CANVAS_KIND = "smart";
export const SMART_CANVAS_SCHEMA_VERSION = 2;
export const SMART_CANVAS_AUTOSAVE_DELAY_MS = 5000;

export type SmartCanvasItemType = "image" | "prompt" | "image_generation" | "result";
export type SmartCanvasSaveState = "saved" | "dirty" | "saving" | "error";
export type SmartCanvasTool = "select" | "pan";
export type SmartCanvasPortKind = "in" | "out";

export type SmartCanvasViewport = {
  x: number;
  y: number;
  zoom: number;
};

export type SmartCanvasItemData = {
  text?: string;
  prompt?: string;
  model?: string;
  size?: string;
  n?: number;
  visibility?: ImageVisibility;
  images?: CanvasImageRef[];
  input_images?: CanvasImageRef[];
  mention_images?: CanvasImageRef[];
  width?: number;
  height?: number;
  output?: CanvasNodeOutput;
  status?: CreationTask["status"];
  error?: string;
  task_id?: string;
  created_at?: string;
  updated_at?: string;
};

export type SmartCanvasItem = Omit<CanvasNode, "type" | "data"> & {
  type: SmartCanvasItemType;
  data?: SmartCanvasItemData;
};

export type SmartCanvasEdge = CanvasEdge;

export type SmartCanvasDocument = {
  id: string;
  owner_id?: string;
  name: string;
  kind: typeof SMART_CANVAS_KIND;
  schema_version: typeof SMART_CANVAS_SCHEMA_VERSION;
  nodes: SmartCanvasItem[];
  edges: SmartCanvasEdge[];
  viewport?: SmartCanvasViewport & Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

export type SmartCanvasComposer = {
  prompt: string;
  model: string;
  size: string;
  n: number;
  visibility: ImageVisibility;
  images: CanvasImageRef[];
  mentionImages: CanvasImageRef[];
};

export type SmartCanvasDragState =
  | { kind: "none" }
  | { kind: "pan"; pointerId: number; startClientX: number; startClientY: number; startViewport: SmartCanvasViewport }
  | { kind: "item"; pointerId: number; itemId: string; startClientX: number; startClientY: number; startPosition: { x: number; y: number } }
  | { kind: "resize"; pointerId: number; itemId: string; startClientX: number; startClientY: number; startSize: { w: number; h: number } };

export type SmartCanvasConnectState =
  | { kind: "none" }
  | { kind: "link"; pointerId: number; sourceId: string; pointer: { x: number; y: number } };

export type SmartCanvasAsset = ManagedImage;

export type SmartCanvasRunRecord = {
  id: string;
  prompt: string;
  model: string;
  mode: "generate" | "edit";
  status: CreationTask["status"];
  taskId?: string;
  images: CanvasImageRef[];
  error?: string;
  createdAt: string;
  updatedAt?: string;
};

export type SmartCanvasModelCatalog = {
  all: CanvasModelOption[];
  image: CanvasModelOption[];
};
