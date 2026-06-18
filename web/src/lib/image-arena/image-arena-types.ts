import type { CanvasImageRef, CreationTask, CreationTaskData, GeminiFlashSettingsPayload, ImageModel, MidjourneySettingsPayload } from "@/lib/api";
import type { ImageOutputFormat, ImageQuality } from "@/lib/image-parameters";
import type { ImageTaskToolOptions } from "@/lib/image-task-request";

export type ImageArenaMode = "revealed" | "blind";
export type ImageArenaJobStatus = "draft" | "submitting" | "running" | "completed" | "partial_failed" | "failed";
export type ImageArenaRunStatus = CreationTask["status"] | "idle" | "submitting" | "blocked";
export type ImageArenaQualityTier = "draft" | "standard" | "production";

export type ImageArenaSharedSettings = {
  aspectRatio: string;
  qualityTier: ImageArenaQualityTier;
  countPerModel: number;
  outputFormat: ImageOutputFormat;
  outputCompression?: number;
  visibility?: "private" | "public";
};

export type ImageArenaReferenceImage = {
  id: string;
  clientReferenceId?: string;
  serverReferenceId?: string;
  filename: string;
  contentType?: string;
  size?: number;
  dataUrl?: string;
  url?: string;
  localUrl?: string;
  publicUrl?: string;
  path?: string;
  width?: number;
  height?: number;
  uploadStatus?: "pending" | "uploading" | "uploaded" | "error";
  uploadError?: string;
};

export type ImageArenaModelCapability = {
  model: ImageModel;
  label: string;
  supportsReferences: boolean;
  maxReferenceImages: number;
  supportsOutputControls: boolean;
  supportsQuality: boolean;
  supportsOutputCompression: boolean;
  supportsResolution: boolean;
  supportsOfficialSettings: boolean;
  supportsMask: boolean;
};

export type ImageArenaTaskPayload = {
  model: ImageModel;
  size?: string;
  imageResolution?: string;
  quality?: ImageQuality;
  count: number;
  midjourneySettings?: MidjourneySettingsPayload;
  geminiFlashSettings?: GeminiFlashSettingsPayload;
  outputFormat?: ImageOutputFormat;
  outputCompression?: number;
  toolOptions?: ImageTaskToolOptions;
  extraBody?: Record<string, unknown>;
};

export type ImageArenaAdaptedSettings = {
  payload: ImageArenaTaskPayload;
  submittedFields: Record<string, unknown>;
  warnings: string[];
};

export type ImageArenaAdaptation = {
  payload: ImageArenaTaskPayload;
  warnings: string[];
  blockedReason?: string;
  estimatedCost: number | null;
};

export type ImageArenaRunImage = CanvasImageRef & {
  id: string;
  taskId?: string;
  index: number;
  outputFormat?: ImageOutputFormat;
  width?: number;
  height?: number;
  revisedPrompt?: string;
};

export type ImageArenaRun = {
  id: string;
  jobId: string;
  model: ImageModel;
  displayName: string;
  status: ImageArenaRunStatus;
  taskId?: string;
  adaptedSettings: ImageArenaAdaptedSettings;
  warnings: string[];
  images: ImageArenaRunImage[];
  estimatedCost: number | null;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  error?: string;
};

export type ImageArenaJob = {
  id: string;
  mode: ImageArenaMode;
  prompt: string;
  negativePrompt?: string;
  referenceImages: ImageArenaReferenceImage[];
  sharedSettings: ImageArenaSharedSettings;
  selectedModels: ImageModel[];
  status: ImageArenaJobStatus;
  runs: ImageArenaRun[];
  createdAt: string;
  updatedAt: string;
};

export type ImageArenaPreview = {
  model: ImageModel;
  label: string;
  capability: ImageArenaModelCapability;
  adaptation: ImageArenaAdaptation;
};

export type ImageArenaValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

export function isImageArenaTerminalStatus(status: ImageArenaRunStatus) {
  return status === "success" || status === "error" || status === "cancelled" || status === "blocked";
}

export function imageArenaTaskDataToImage(taskId: string, index: number, data: CreationTaskData): ImageArenaRunImage {
  return {
    id: `${taskId}-${index}`,
    taskId,
    index,
    url: data.url,
    local_url: data.local_url,
    name: `arena-${taskId.slice(0, 8)}-${index + 1}`,
    width: data.width,
    height: data.height,
    revisedPrompt: data.revised_prompt,
    outputFormat: data.output_format,
  };
}
