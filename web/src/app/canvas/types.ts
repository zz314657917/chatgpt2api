import type {
  CanvasEdge,
  CanvasImageRef,
  CanvasModelOption,
  CanvasNode,
  CanvasNodeOutput,
  CreationTask,
  ImageVisibility,
  ManagedImageSummary,
} from "@/lib/api";

export const SMART_CANVAS_KIND = "smart";
export const SMART_CANVAS_SCHEMA_VERSION = 2;
export const SMART_CANVAS_AUTOSAVE_DELAY_MS = 5000;

export type SmartCanvasItemType = "image" | "prompt" | "llm" | "loop" | "group" | "image_generation" | "result";
export type SmartCanvasSaveState = "saved" | "dirty" | "saving" | "error";
export type SmartCanvasTool = "select" | "pan";
export type SmartCanvasPortKind = "in" | "out";
export type SmartCanvasImageToolType = "detail_enhance" | "image_edit" | "angle_control";

export type SmartCanvasAngleControlValues = {
  horizontal: number;
  vertical: number;
  zoom: number;
};

export type SmartCanvasImageToolParameters = Partial<SmartCanvasAngleControlValues> & {
  [key: string]: unknown;
};

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
  image_resolution?: string;
  quality?: string;
  n?: number;
  visibility?: ImageVisibility;
  images?: CanvasImageRef[];
  source_images?: CanvasImageRef[];
  input_images?: CanvasImageRef[];
  mention_images?: CanvasImageRef[];
  group_item_ids?: string[];
  loop_mode?: "repeat" | "images";
  loop_count?: number;
  loop_concurrency?: number;
  loop_progress?: {
    total: number;
    completed: number;
    failed: number;
    current: number;
  };
  tool_type?: SmartCanvasImageToolType;
  tool_parameters?: SmartCanvasImageToolParameters;
  width?: number;
  height?: number;
  output?: CanvasNodeOutput;
  status?: CreationTask["status"];
  error?: string;
  task_id?: string;
  started_at?: string;
  stop_requested?: boolean;
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
  | { kind: "item"; pointerId: number; itemId: string; itemIds: string[]; groupCandidateIds: string[]; startClientX: number; startClientY: number; startPositions: Record<string, { x: number; y: number }> }
  | { kind: "resize"; pointerId: number; itemId: string; startClientX: number; startClientY: number; startSize: { w: number; h: number } };

export type SmartCanvasConnectState =
  | { kind: "none" }
  | { kind: "link"; pointerId: number; sourceId: string; pointer: { x: number; y: number } };

export type SmartCanvasPortMenuRequest = {
  id: number;
  sourceId: string;
  screen: { x: number; y: number };
};

export type SmartCanvasAsset = ManagedImageSummary;

export type SmartCanvasRunRecord = {
  id: string;
  prompt: string;
  model: string;
  mode: "generate" | "edit";
  status: CreationTask["status"];
  taskId?: string;
  images: CanvasImageRef[];
  error?: string;
  startedAt?: string;
  createdAt: string;
  updatedAt?: string;
};

export type SmartCanvasModelCatalog = {
  all: CanvasModelOption[];
  text: CanvasModelOption[];
  image: CanvasModelOption[];
  video: CanvasModelOption[];
};

export type SmartCanvasHistoryEntry = {
  id: string;
  label: string;
  createdAt: string;
  snapshot: SmartCanvasDocument;
};
