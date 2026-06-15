import {
  normalizeImageOutputCompression,
  normalizeImageOutputFormat,
  type ImageOutputFormat,
} from "@/lib/image-parameters";

export const OFFICIAL_IMAGE_MODEL = "gpt-image-2-official" as const;

export const OFFICIAL_IMAGE_SIZE_OPTIONS = [
  "auto",
  "1:1",
  "3:2",
  "2:3",
  "4:3",
  "3:4",
  "5:4",
  "4:5",
  "16:9",
  "9:16",
  "2:1",
  "1:2",
  "3:1",
  "1:3",
  "21:9",
  "9:21",
] as const;

export const OFFICIAL_IMAGE_RESOLUTION_OPTIONS = ["1k", "2k", "4k"] as const;
export const OFFICIAL_IMAGE_QUALITY_OPTIONS = ["auto", "low", "medium", "high"] as const;
export const OFFICIAL_IMAGE_OUTPUT_FORMAT_OPTIONS = ["png", "jpeg", "webp"] as const;
export const OFFICIAL_IMAGE_BACKGROUND_OPTIONS = ["auto", "opaque"] as const;
export const OFFICIAL_IMAGE_MODERATION_OPTIONS = ["auto", "low"] as const;

export const OFFICIAL_IMAGE_LIMITS = {
  maxN: 4,
  maxReferenceImages: 16,
  minOutputCompression: 0,
  maxOutputCompression: 100,
} as const;

export type OfficialImageSize = (typeof OFFICIAL_IMAGE_SIZE_OPTIONS)[number];
export type OfficialImageResolution = (typeof OFFICIAL_IMAGE_RESOLUTION_OPTIONS)[number];
export type OfficialImageQuality = (typeof OFFICIAL_IMAGE_QUALITY_OPTIONS)[number];
export type OfficialImageOutputFormat = (typeof OFFICIAL_IMAGE_OUTPUT_FORMAT_OPTIONS)[number];
export type OfficialImageBackground = (typeof OFFICIAL_IMAGE_BACKGROUND_OPTIONS)[number];
export type OfficialImageModeration = (typeof OFFICIAL_IMAGE_MODERATION_OPTIONS)[number];

const OFFICIAL_IMAGE_SIZE_VALUES = new Set<string>(OFFICIAL_IMAGE_SIZE_OPTIONS);
const OFFICIAL_IMAGE_RESOLUTION_VALUES = new Set<string>(OFFICIAL_IMAGE_RESOLUTION_OPTIONS);
const OFFICIAL_IMAGE_QUALITY_VALUES = new Set<string>(OFFICIAL_IMAGE_QUALITY_OPTIONS);
const OFFICIAL_IMAGE_OUTPUT_FORMAT_VALUES = new Set<string>(OFFICIAL_IMAGE_OUTPUT_FORMAT_OPTIONS);
const OFFICIAL_IMAGE_BACKGROUND_VALUES = new Set<string>(OFFICIAL_IMAGE_BACKGROUND_OPTIONS);
const OFFICIAL_IMAGE_MODERATION_VALUES = new Set<string>(OFFICIAL_IMAGE_MODERATION_OPTIONS);

export function isOfficialImageModel(model?: string): model is typeof OFFICIAL_IMAGE_MODEL {
  return String(model || "").trim() === OFFICIAL_IMAGE_MODEL;
}

export function normalizeOfficialImageSize(size?: string): OfficialImageSize {
  const normalized = String(size || "").trim().toLowerCase();
  return isOfficialImageSize(normalized) ? normalized : "auto";
}

export function isOfficialImageSize(size?: string): size is OfficialImageSize {
  return OFFICIAL_IMAGE_SIZE_VALUES.has(String(size || "").trim().toLowerCase());
}

export function normalizeOfficialImageResolution(resolution?: string): OfficialImageResolution {
  const normalized = String(resolution || "").trim().toLowerCase();
  if (normalized === "1080p") {
    return "1k";
  }
  return isOfficialImageResolution(normalized) ? normalized : "1k";
}

export function isOfficialImageResolution(resolution?: string): resolution is OfficialImageResolution {
  return OFFICIAL_IMAGE_RESOLUTION_VALUES.has(String(resolution || "").trim().toLowerCase());
}

export function normalizeOfficialImageQuality(quality?: string): OfficialImageQuality {
  const normalized = String(quality || "").trim().toLowerCase();
  return isOfficialImageQuality(normalized) ? normalized : "auto";
}

export function isOfficialImageQuality(quality?: string): quality is OfficialImageQuality {
  return OFFICIAL_IMAGE_QUALITY_VALUES.has(String(quality || "").trim().toLowerCase());
}

export function normalizeOfficialImageOutputFormat(format?: string): OfficialImageOutputFormat {
  const normalized = normalizeImageOutputFormat(format) as ImageOutputFormat;
  return isOfficialImageOutputFormat(normalized) ? normalized : "png";
}

export function isOfficialImageOutputFormat(format?: string): format is OfficialImageOutputFormat {
  return OFFICIAL_IMAGE_OUTPUT_FORMAT_VALUES.has(String(format || "").trim().toLowerCase());
}

export function supportsOfficialOutputCompression(format?: string) {
  const normalized = normalizeOfficialImageOutputFormat(format);
  return normalized === "jpeg" || normalized === "webp";
}

export function normalizeOfficialOutputCompression(format?: string, value?: number | string) {
  if (!supportsOfficialOutputCompression(format)) {
    return undefined;
  }
  return normalizeImageOutputCompression(value);
}

export function normalizeOfficialImageBackground(background?: string): OfficialImageBackground {
  const normalized = String(background || "").trim().toLowerCase();
  return isOfficialImageBackground(normalized) ? normalized : "auto";
}

export function isOfficialImageBackground(background?: string): background is OfficialImageBackground {
  return OFFICIAL_IMAGE_BACKGROUND_VALUES.has(String(background || "").trim().toLowerCase());
}

export function normalizeOfficialImageModeration(moderation?: string): OfficialImageModeration {
  const normalized = String(moderation || "").trim().toLowerCase();
  return isOfficialImageModeration(normalized) ? normalized : "auto";
}

export function isOfficialImageModeration(moderation?: string): moderation is OfficialImageModeration {
  return OFFICIAL_IMAGE_MODERATION_VALUES.has(String(moderation || "").trim().toLowerCase());
}

export function normalizeOfficialImageCount(n?: number | string) {
  const numeric = Number(n);
  if (!Number.isFinite(numeric)) {
    return 1;
  }
  return Math.max(1, Math.min(OFFICIAL_IMAGE_LIMITS.maxN, Math.round(numeric)));
}
