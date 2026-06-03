import {
  createItemId,
  createSmartEdge,
  normalizeSmartCanvas,
  toCanvasPayload,
} from "./canvas-utils";
import {
  SMART_CANVAS_KIND,
  SMART_CANVAS_SCHEMA_VERSION,
  type SmartCanvasDocument,
  type SmartCanvasItem,
  type SmartCanvasItemData,
  type SmartCanvasItemType,
} from "./types";

export const SMART_CANVAS_USER_PRESETS_STORAGE_KEY = "smart-canvas-user-presets-v1";
export const SMART_CANVAS_USER_PRESET_LIMIT = 50;

export type SmartCanvasUserPreset = {
  id: string;
  title: string;
  description: string;
  canvasName: string;
  tags: string[];
  nodeTypes: SmartCanvasItemType[];
  document: SmartCanvasDocument;
  createdAt: string;
  updatedAt: string;
};

export function loadSmartCanvasUserPresets(scope = ""): SmartCanvasUserPreset[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(userPresetStorageKey(scope));
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.flatMap((item) => {
      const normalized = normalizeUserPreset(item);
      return normalized ? [normalized] : [];
    }).slice(0, SMART_CANVAS_USER_PRESET_LIMIT);
  } catch {
    return [];
  }
}

export function persistSmartCanvasUserPresets(presets: SmartCanvasUserPreset[], scope = "") {
  window.localStorage.setItem(userPresetStorageKey(scope), JSON.stringify(presets.slice(0, SMART_CANVAS_USER_PRESET_LIMIT)));
}

export function createSmartCanvasUserPreset(canvas: SmartCanvasDocument, title: string): SmartCanvasUserPreset {
  const now = new Date().toISOString();
  const snapshot = cleanPresetDocument(canvas, title);
  return {
    id: createPresetId(),
    title,
    description: `${snapshot.nodes.length} 个节点，${snapshot.edges.length} 条连线`,
    canvasName: title,
    tags: ["我的预设", `${snapshot.nodes.length} 节点`],
    nodeTypes: summarizeNodeTypes(snapshot.nodes),
    document: snapshot,
    createdAt: now,
    updatedAt: now,
  };
}

export function createSmartCanvasFromUserPreset(preset: SmartCanvasUserPreset): SmartCanvasDocument {
  const normalized = normalizeSmartCanvas(preset.document) || preset.document;
  const idMap = new Map<string, string>();
  const nodes = normalized.nodes.map((item) => {
    const id = createItemId(item.type);
    idMap.set(item.id, id);
    return {
      ...item,
      id,
      data: cleanPresetItemData(item.data),
    };
  }).map((item) => {
    if (item.type !== "group") {
      return item;
    }
    return {
      ...item,
      data: {
        ...item.data,
        group_item_ids: (item.data?.group_item_ids || []).flatMap((id) => {
          const next = idMap.get(id);
          return next ? [next] : [];
        }),
      },
    };
  });
  const edges = normalized.edges.flatMap((edge) => {
    const source = idMap.get(edge.source);
    const target = idMap.get(edge.target);
    return source && target ? [createSmartEdge(source, target)] : [];
  });
  return {
    id: "",
    name: preset.canvasName || preset.title || "未命名画布",
    kind: SMART_CANVAS_KIND,
    schema_version: SMART_CANVAS_SCHEMA_VERSION,
    nodes,
    edges,
    viewport: normalized.viewport,
  };
}

function normalizeUserPreset(input: unknown): SmartCanvasUserPreset | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const item = input as Partial<SmartCanvasUserPreset>;
  const document = normalizeSmartCanvas(item.document);
  const title = cleanText(item.title);
  if (!document || !title) {
    return null;
  }
  return {
    id: cleanText(item.id) || createPresetId(),
    title,
    description: cleanText(item.description) || `${document.nodes.length} 个节点，${document.edges.length} 条连线`,
    canvasName: cleanText(item.canvasName) || title,
    tags: cleanTags(item.tags),
    nodeTypes: summarizeNodeTypes(document.nodes),
    document,
    createdAt: cleanText(item.createdAt) || new Date().toISOString(),
    updatedAt: cleanText(item.updatedAt) || new Date().toISOString(),
  };
}

function cleanPresetDocument(canvas: SmartCanvasDocument, title: string): SmartCanvasDocument {
  const payload = toCanvasPayload(canvas);
  return {
    ...payload,
    id: "",
    owner_id: undefined,
    name: title,
    created_at: undefined,
    updated_at: undefined,
    nodes: payload.nodes.map((item) => ({
      ...item,
      data: cleanPresetItemData(item.data),
    })),
  };
}

function cleanPresetItemData(data?: SmartCanvasItemData): SmartCanvasItemData {
  if (!data) {
    return {};
  }
  return {
    ...structuredClone(data),
    output: undefined,
    status: undefined,
    error: "",
    task_id: "",
    started_at: "",
    stop_requested: false,
    loop_progress: undefined,
  };
}

function summarizeNodeTypes(nodes: SmartCanvasItem[]) {
  const seen = new Set<SmartCanvasItemType>();
  const out: SmartCanvasItemType[] = [];
  for (const node of nodes) {
    if (seen.has(node.type)) {
      continue;
    }
    seen.add(node.type);
    out.push(node.type);
  }
  return out.slice(0, 5);
}

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function cleanTags(values: unknown) {
  const tags = Array.isArray(values) ? values : [];
  return tags.map(cleanText).filter(Boolean).slice(0, 4);
}

function createPresetId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `user-preset-${crypto.randomUUID()}`;
  }
  return `user-preset-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function userPresetStorageKey(scope: string) {
  const normalizedScope = cleanText(scope).replace(/[^a-zA-Z0-9:._-]/g, "_");
  return normalizedScope ? `${SMART_CANVAS_USER_PRESETS_STORAGE_KEY}:${normalizedScope}` : SMART_CANVAS_USER_PRESETS_STORAGE_KEY;
}
