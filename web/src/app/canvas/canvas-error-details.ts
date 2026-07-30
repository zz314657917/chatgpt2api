import type { CreationTask } from "@/lib/api";
import { localizeErrorMessage } from "@/lib/request";
import type { SmartCanvasImageToolType, SmartCanvasItem, SmartCanvasItemType } from "./types";

export type SmartCanvasErrorStatus = CreationTask["status"] | "blocked" | "unknown";

export type SmartCanvasErrorMetadataValue = string | number | boolean;

export type SmartCanvasErrorMetadata = Record<string, SmartCanvasErrorMetadataValue>;

export type SmartCanvasErrorDetail = {
  title: string;
  message: string;
  status: SmartCanvasErrorStatus;
  taskId?: string;
  retryable: boolean;
  technicalDetail?: string;
  metadata: SmartCanvasErrorMetadata;
};

export type SmartCanvasErrorDetailInput = Partial<Omit<SmartCanvasItem, "data">> & {
  data?: Partial<NonNullable<SmartCanvasItem["data"]>> | Record<string, unknown>;
  status?: string | null;
  error?: unknown;
  task_id?: string | null;
  taskId?: string | null;
  tool_type?: SmartCanvasImageToolType | string | null;
  prompt?: string | null;
  model?: string | null;
  size?: string | null;
  n?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  task?: Partial<CreationTask> | null;
};

type ErrorSourceSnapshot = {
  nodeId?: string;
  nodeName?: string;
  nodeType?: SmartCanvasItemType | string;
  status: SmartCanvasErrorStatus;
  taskId?: string;
  error?: unknown;
  rawMessage?: string;
  toolType?: SmartCanvasImageToolType | string;
  prompt?: string;
  model?: string;
  size?: string;
  n?: number;
  mode?: CreationTask["mode"] | string;
  createdAt?: string;
  updatedAt?: string;
};

const KNOWN_STATUSES = new Set<SmartCanvasErrorStatus>(["queued", "running", "success", "error", "cancelled", "blocked", "unknown"]);
const METADATA_TEXT_LIMIT = 600;
const TECHNICAL_DETAIL_LIMIT = 4000;

const TOOL_TITLES: Record<SmartCanvasImageToolType, string> = {
  detail_enhance: "细节增强失败",
  image_edit: "图片编辑失败",
  angle_control: "角度控制失败",
  background_removal: "抠图失败",
};

const NODE_TITLES: Partial<Record<SmartCanvasItemType, string>> = {
  image: "图片节点异常",
  prompt: "提示词节点异常",
  image_generation: "图片生成失败",
  video_generation: "视频生成失败",
  result: "结果节点失败",
};

export function buildSmartCanvasErrorDetail(input?: SmartCanvasErrorDetailInput | Partial<CreationTask> | null): SmartCanvasErrorDetail {
  const source = readErrorSource(input);
  const fallbackMessage = fallbackMessageForStatus(source.status);
  const message = formatSmartCanvasErrorMessage(source.error ?? source.rawMessage, fallbackMessage);
  const technicalDetail = buildTechnicalDetail(source.error, source.rawMessage, message);

  return {
    title: buildErrorTitle(source),
    message,
    status: source.status,
    taskId: source.taskId,
    retryable: isRetryableCanvasError(input),
    technicalDetail,
    metadata: buildMetadata(source),
  };
}

export function formatSmartCanvasErrorMessage(error: unknown, fallback = "运行失败"): string {
  const rawMessage = extractErrorMessage(error).trim();
  if (!rawMessage) {
    return fallback;
  }

  const normalized = rawMessage.toLowerCase();
  if (normalized.includes("user balance insufficient")) {
    return "用户余额不足";
  }
  if (normalized.includes("user quota exceeded")) {
    return "用户配额不足";
  }
  if (normalized.includes("no available image quota")) {
    return "当前没有可用的图片额度，请检查账号额度或稍后重试。";
  }
  if (normalized.includes("no images generated") && normalized.includes("model may have refused")) {
    return "没有生成结果，模型可能检测到敏感内容并拒绝了这次请求，请调整提示词后重试。";
  }
  if (normalized.includes("timed out waiting for async image generation")) {
    return "图片生成等待超时，建议稍后重试；如果使用高分辨率参数，可降低尺寸后再试。";
  }
  if (normalized.includes("an error occurred while processing your request")) {
    const requestId = rawMessage.match(/request id\s+([a-z0-9-]+)/i)?.[1];
    return [
      "上游处理请求失败，可能是提示词内容过多、账号能力限制或当前链路繁忙。",
      "建议减少提示词内容，或稍后重试；高分辨率请求可降低尺寸后再试。",
      requestId ? `请求 ID：${requestId}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (normalized.includes("network") || normalized.includes("fetch failed")) {
    return "网络请求失败，请检查连接后重试。";
  }
  if (normalized.includes("rate limit") || normalized.includes("too many requests")) {
    return "请求过于频繁，请稍后重试。";
  }

  return localizeErrorMessage(rawMessage);
}

export function isRetryableCanvasError(input?: SmartCanvasErrorDetailInput | Partial<CreationTask> | null): boolean {
  const source = readErrorSource(input);
  const rawMessage = (source.rawMessage || extractErrorMessage(source.error)).toLowerCase();

  if (source.status === "queued" || source.status === "running" || source.status === "success") {
    return false;
  }
  if (source.status === "blocked") {
    return false;
  }
  if (hasAny(rawMessage, ["balance insufficient", "quota exceeded", "no available image quota", "unauthorized", "forbidden", "invalid api key"])) {
    return false;
  }
  if (hasAny(rawMessage, ["model may have refused", "policy", "safety", "moderation", "content policy"])) {
    return false;
  }
  if (source.status === "cancelled") {
    return true;
  }
  if (hasAny(rawMessage, ["timeout", "timed out", "temporarily", "network", "fetch failed", "rate limit", "too many requests", "busy", "try again", "500", "502", "503", "504", "5xx"])) {
    return true;
  }

  return source.status === "error" && Boolean(source.rawMessage || source.error);
}

function readErrorSource(input?: SmartCanvasErrorDetailInput | Partial<CreationTask> | null): ErrorSourceSnapshot {
  const root = asRecord(input);
  const data = asRecord(root?.data);
  const task = asRecord(root?.task);
  const rootIsTask = isCreationTaskLike(root);
  const effectiveTask = task || (rootIsTask ? root : undefined);
  const error = pickFirstDefined(data?.error, root?.error, effectiveTask?.error);
  const status = normalizeStatus(pickFirstDefined(data?.status, root?.status, effectiveTask?.status));

  return {
    nodeId: rootIsTask ? undefined : readString(root, "id"),
    nodeName: readString(root, "name"),
    nodeType: readString(root, "type"),
    status,
    taskId: readString(data, "task_id") || readString(root, "task_id") || readString(root, "taskId") || readString(effectiveTask, "id") || (rootIsTask ? readString(root, "id") : undefined),
    error,
    rawMessage: extractErrorMessage(error),
    toolType: readString(data, "tool_type") || readString(root, "tool_type"),
    prompt: readString(data, "prompt") || readString(root, "prompt"),
    model: readString(data, "model") || readString(root, "model") || readString(effectiveTask, "model"),
    size: readString(data, "size") || readString(root, "size") || readString(effectiveTask, "size"),
    n: readNumber(data, "n") ?? readNumber(root, "n"),
    mode: readString(effectiveTask, "mode") || readString(root, "mode"),
    createdAt: readString(data, "created_at") || readString(root, "created_at") || readString(effectiveTask, "created_at"),
    updatedAt: readString(data, "updated_at") || readString(root, "updated_at") || readString(effectiveTask, "updated_at"),
  };
}

function buildErrorTitle(source: ErrorSourceSnapshot) {
  if (source.status === "cancelled") {
    return "运行已终止";
  }
  if (source.status === "blocked") {
    return "运行条件未满足";
  }
  if (source.toolType && source.toolType in TOOL_TITLES) {
    return TOOL_TITLES[source.toolType as SmartCanvasImageToolType];
  }
  if (source.nodeType && source.nodeType in NODE_TITLES) {
    return NODE_TITLES[source.nodeType as SmartCanvasItemType] || "运行失败";
  }
  if (source.mode === "edit") {
    return "图片编辑失败";
  }
  if (source.mode === "generate") {
    return "图片生成失败";
  }
  if (source.mode === "chat") {
    return "对话运行失败";
  }

  return "运行失败";
}

function fallbackMessageForStatus(status: SmartCanvasErrorStatus) {
  if (status === "cancelled") {
    return "任务已终止。";
  }
  if (status === "blocked") {
    return "当前节点缺少运行所需的输入或配置。";
  }
  if (status === "queued") {
    return "任务仍在队列中。";
  }
  if (status === "running") {
    return "任务仍在运行中。";
  }
  if (status === "success") {
    return "任务已完成。";
  }

  return "运行失败。";
}

function buildMetadata(source: ErrorSourceSnapshot): SmartCanvasErrorMetadata {
  return compactMetadata({
    nodeId: source.nodeId,
    nodeName: source.nodeName,
    nodeType: source.nodeType,
    taskId: source.taskId,
    status: source.status,
    toolType: source.toolType,
    mode: source.mode,
    model: source.model,
    size: source.size,
    n: source.n,
    prompt: source.prompt ? limitText(source.prompt, METADATA_TEXT_LIMIT) : undefined,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  });
}

function buildTechnicalDetail(error: unknown, rawMessage: string | undefined, formattedMessage: string) {
  const technicalDetail = stringifyTechnicalDetail(error, rawMessage);
  if (!technicalDetail || technicalDetail === formattedMessage) {
    return undefined;
  }

  return limitText(technicalDetail, TECHNICAL_DETAIL_LIMIT);
}

function normalizeStatus(status: unknown): SmartCanvasErrorStatus {
  const value = String(status || "").toLowerCase();
  if (KNOWN_STATUSES.has(value as SmartCanvasErrorStatus)) {
    return value as SmartCanvasErrorStatus;
  }

  return "unknown";
}

function extractErrorMessage(error: unknown): string {
  if (!error) {
    return "";
  }
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }

  const record = asRecord(error);
  return readString(record, "message") || readString(record, "error") || readString(record, "detail") || stringifyJson(error);
}

function stringifyTechnicalDetail(error: unknown, rawMessage?: string) {
  if (!error) {
    return rawMessage;
  }
  if (typeof error === "string" || error instanceof Error) {
    return rawMessage || extractErrorMessage(error);
  }

  return stringifyJson(error) || rawMessage;
}

function stringifyJson(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function isCreationTaskLike(value?: Record<string, unknown>) {
  if (!value) {
    return false;
  }

  return typeof value.mode === "string" && Array.isArray(value.data);
}

function readString(record: Record<string, unknown> | undefined, key: string) {
  const value = record?.[key];
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function readNumber(record: Record<string, unknown> | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function pickFirstDefined(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null);
}

function compactMetadata(metadata: Record<string, unknown>): SmartCanvasErrorMetadata {
  return Object.fromEntries(
    Object.entries(metadata).filter((entry): entry is [string, SmartCanvasErrorMetadataValue] => {
      const value = entry[1];
      return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
    }),
  );
}

function limitText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function hasAny(value: string, needles: string[]) {
  return needles.some((needle) => value.includes(needle));
}
