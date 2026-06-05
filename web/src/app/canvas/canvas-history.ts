import type { CanvasImageRef, CanvasNodeOutput, CanvasVideoRef } from "@/lib/api";
import type { SmartCanvasDocument, SmartCanvasItemData } from "./types";

export const DEFAULT_SMART_CANVAS_HISTORY_LIMIT = 64;
export const MAX_SMART_CANVAS_HISTORY_LIMIT = 256;

export type SmartCanvasHistoryOptions = {
  limit?: number;
};

export type SmartCanvasHistoryReplaceOptions = {
  preserveFuture?: boolean;
};

export type SmartCanvasHistoryState = {
  readonly past: readonly SmartCanvasDocument[];
  readonly present?: SmartCanvasDocument;
  readonly future: readonly SmartCanvasDocument[];
  readonly limit: number;
};

export function createSmartCanvasHistory(
  present?: SmartCanvasDocument | null,
  options: SmartCanvasHistoryOptions = {},
): SmartCanvasHistoryState {
  return {
    past: [],
    present: cloneOptionalSmartCanvasDocument(present),
    future: [],
    limit: normalizeHistoryLimit(options.limit),
  };
}

export function pushSmartCanvasHistory(
  state: SmartCanvasHistoryState,
  nextPresent?: SmartCanvasDocument | null,
): SmartCanvasHistoryState {
  const present = cloneOptionalSmartCanvasDocument(nextPresent);

  if (!present) {
    return state;
  }

  const limit = normalizeHistoryLimit(state.limit);
  const past = state.present
    ? limitHistoryStack([...state.past, state.present], limit)
    : limitHistoryStack(state.past, limit);

  return {
    past,
    present,
    future: [],
    limit,
  };
}

export function undoSmartCanvasHistory(state: SmartCanvasHistoryState): SmartCanvasHistoryState {
  if (!canUndoSmartCanvasHistory(state)) {
    return state;
  }

  const limit = normalizeHistoryLimit(state.limit);
  const previous = state.past[state.past.length - 1];

  if (!previous) {
    return {
      ...state,
      limit,
    };
  }

  const past = state.past.slice(0, -1);
  const future = state.present ? limitFutureStack([state.present, ...state.future], limit) : limitFutureStack(state.future, limit);

  return {
    past,
    present: previous,
    future,
    limit,
  };
}

export function redoSmartCanvasHistory(state: SmartCanvasHistoryState): SmartCanvasHistoryState {
  if (!canRedoSmartCanvasHistory(state)) {
    return state;
  }

  const limit = normalizeHistoryLimit(state.limit);
  const nextPresent = state.future[0];

  if (!nextPresent) {
    return {
      ...state,
      limit,
    };
  }

  const past = state.present
    ? limitHistoryStack([...state.past, state.present], limit)
    : limitHistoryStack(state.past, limit);

  return {
    past,
    present: nextPresent,
    future: state.future.slice(1),
    limit,
  };
}

export function replaceSmartCanvasHistoryPresent(
  state: SmartCanvasHistoryState,
  present?: SmartCanvasDocument | null,
  options: SmartCanvasHistoryReplaceOptions = {},
): SmartCanvasHistoryState {
  const nextPresent = cloneOptionalSmartCanvasDocument(present);

  if (!nextPresent) {
    return state;
  }

  const limit = normalizeHistoryLimit(state.limit);

  return {
    past: limitHistoryStack(state.past, limit),
    present: nextPresent,
    future: options.preserveFuture ? limitFutureStack(state.future, limit) : [],
    limit,
  };
}

export function canUndoSmartCanvasHistory(state: SmartCanvasHistoryState): boolean {
  return state.past.length > 0;
}

export function canRedoSmartCanvasHistory(state: SmartCanvasHistoryState): boolean {
  return state.future.length > 0;
}

export function cloneSmartCanvasHistorySnapshot(document: SmartCanvasDocument): SmartCanvasDocument {
  return cloneSmartCanvasDocument(document);
}

function cloneOptionalSmartCanvasDocument(document?: SmartCanvasDocument | null): SmartCanvasDocument | undefined {
  if (!document) {
    return undefined;
  }

  return cloneSmartCanvasDocument(document);
}

function cloneSmartCanvasDocument(document: SmartCanvasDocument): SmartCanvasDocument {
  return {
    ...document,
    nodes: document.nodes.map((node) => ({
      ...node,
      position: clonePlainValue(node.position),
      data: cloneSmartCanvasHistoryData(node.data),
    })),
    edges: document.edges.map((edge) => ({ ...edge })),
    viewport: clonePlainValue(document.viewport),
  };
}

function cloneSmartCanvasHistoryData(data?: SmartCanvasItemData): SmartCanvasItemData | undefined {
  if (!data) {
    return undefined;
  }

  return compactUndefined({
    ...clonePlainValue(data),
    images: cloneLightweightImageRefs(data.images),
    source_images: cloneLightweightImageRefs(data.source_images),
    input_images: cloneLightweightImageRefs(data.input_images),
    mention_images: cloneLightweightImageRefs(data.mention_images),
    videos: cloneLightweightVideoRefs(data.videos),
    output: cloneLightweightOutput(data.output),
    // Running poll state is intentionally omitted from undo snapshots.
    upload_progress: undefined,
    loop_progress: undefined,
    stop_requested: undefined,
    last_run_error_detail: undefined,
  });
}

function cloneLightweightOutput(output?: CanvasNodeOutput): CanvasNodeOutput | undefined {
  if (!output) {
    return undefined;
  }

  return compactUndefined({
    ...clonePlainValue(output),
    images: cloneLightweightImageRefs(output.images),
    videos: cloneLightweightVideoRefs(output.videos),
    raw: cloneLightweightOutputRaw(output.raw),
  });
}

function cloneLightweightOutputRaw(raw?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!raw) {
    return undefined;
  }

  return compactUndefined({
    status: typeof raw.status === "string" ? raw.status : undefined,
    error: typeof raw.error === "string" ? raw.error : undefined,
    mode: typeof raw.mode === "string" ? raw.mode : undefined,
    task_ids: Array.isArray(raw.task_ids) ? raw.task_ids.filter((item) => typeof item === "string") : undefined,
    completed: typeof raw.completed === "number" ? raw.completed : undefined,
    failed: typeof raw.failed === "number" ? raw.failed : undefined,
    total: typeof raw.total === "number" ? raw.total : undefined,
    current: typeof raw.current === "number" ? raw.current : undefined,
    running_slot: typeof raw.running_slot === "number" ? raw.running_slot : undefined,
    slots: cloneLightweightLoopSlots(raw.slots),
  });
}

function cloneLightweightLoopSlots(slots: unknown): Array<{ index: number; status: string }> | undefined {
  if (!Array.isArray(slots)) {
    return undefined;
  }

  return slots.flatMap((slot) => {
    if (!slot || typeof slot !== "object") {
      return [];
    }
    const record = slot as Record<string, unknown>;
    const index = Number(record.index);
    const status = typeof record.status === "string" ? record.status : "";
    if (!Number.isFinite(index) || !status) {
      return [];
    }
    return [{ index, status }];
  });
}

function cloneLightweightImageRefs(refs?: CanvasImageRef[]): CanvasImageRef[] | undefined {
  if (!Array.isArray(refs)) {
    return undefined;
  }

  return refs.map((ref) => compactUndefined({
    path: ref.path,
    local_url: ref.local_url,
    url: ref.url,
    name: ref.name,
    thumbnail_url: ref.thumbnail_url,
    preview_url: ref.preview_url,
    visibility: ref.visibility,
  }));
}

function cloneLightweightVideoRefs(refs?: CanvasVideoRef[]): CanvasVideoRef[] | undefined {
  if (!Array.isArray(refs)) {
    return undefined;
  }

  return refs.map((ref) => compactUndefined({
    local_url: ref.local_url,
    url: ref.url,
    name: ref.name,
  }));
}

function compactUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter((entry) => entry[1] !== undefined)) as T;
}

function clonePlainValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => clonePlainValue(item)) as T;
  }

  if (value !== null && typeof value === "object") {
    const copy: Record<string, unknown> = {};

    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      copy[key] = clonePlainValue(nestedValue);
    }

    return copy as T;
  }

  return value;
}

function normalizeHistoryLimit(limit?: number): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return DEFAULT_SMART_CANVAS_HISTORY_LIMIT;
  }

  return Math.min(MAX_SMART_CANVAS_HISTORY_LIMIT, Math.max(1, Math.floor(limit)));
}

function limitHistoryStack(stack: readonly SmartCanvasDocument[], limit: number): SmartCanvasDocument[] {
  if (stack.length <= limit) {
    return [...stack];
  }

  return stack.slice(stack.length - limit);
}

function limitFutureStack(stack: readonly SmartCanvasDocument[], limit: number): SmartCanvasDocument[] {
  if (stack.length <= limit) {
    return [...stack];
  }

  return stack.slice(0, limit);
}
