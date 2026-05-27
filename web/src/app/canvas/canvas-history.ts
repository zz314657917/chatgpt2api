import type { SmartCanvasDocument } from "./types";

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
      data: clonePlainValue(node.data),
    })),
    edges: document.edges.map((edge) => ({ ...edge })),
    viewport: clonePlainValue(document.viewport),
  };
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
