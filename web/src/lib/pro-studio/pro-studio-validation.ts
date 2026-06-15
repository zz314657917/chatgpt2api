import {
  OFFICIAL_IMAGE_LIMITS,
  OFFICIAL_IMAGE_MODEL,
  isOfficialImageBackground,
  isOfficialImageModeration,
  isOfficialImageOutputFormat,
  isOfficialImageQuality,
  isOfficialImageResolution,
  isOfficialImageSize,
  supportsOfficialOutputCompression,
} from "./official-image-capabilities";
import type { ProStudioState } from "./pro-studio-types";

export type ProStudioValidationInput = {
  state: ProStudioState;
  referenceImageUrls?: string[];
  maskUrl?: string;
};

export function validateProStudioState(input: ProStudioValidationInput): string[] {
  const errors: string[] = [];
  const { state } = input;
  const settings = state.settings;
  if (!state.enabled) {
    return errors;
  }
  if (settings.model !== OFFICIAL_IMAGE_MODEL) {
    errors.push(`生产模式仅支持 ${OFFICIAL_IMAGE_MODEL}`);
  }
  if (!isOfficialImageSize(settings.size)) {
    errors.push("生产模式 size 不在 official 支持范围内");
  }
  if (!isOfficialImageResolution(settings.resolution)) {
    errors.push("生产模式 resolution 仅支持 1k/2k/4k");
  }
  if (!isOfficialImageQuality(settings.quality)) {
    errors.push("生产模式 quality 仅支持 auto/low/medium/high");
  }
  if (!isOfficialImageOutputFormat(settings.outputFormat)) {
    errors.push("生产模式 output_format 仅支持 png/jpeg/webp");
  }
  if (typeof settings.outputCompression === "number" && !supportsOfficialOutputCompression(settings.outputFormat)) {
    errors.push("PNG 不支持 output_compression");
  }
  if (typeof settings.outputCompression === "number" && (settings.outputCompression < OFFICIAL_IMAGE_LIMITS.minOutputCompression || settings.outputCompression > OFFICIAL_IMAGE_LIMITS.maxOutputCompression)) {
    errors.push("output_compression 必须在 0-100 之间");
  }
  if (!isOfficialImageBackground(settings.background)) {
    errors.push("生产模式 background 仅支持 auto/opaque");
  }
  if (!isOfficialImageModeration(settings.moderation)) {
    errors.push("生产模式 moderation 仅支持 auto/low");
  }
  if (!Number.isInteger(settings.n) || settings.n < 1 || settings.n > OFFICIAL_IMAGE_LIMITS.maxN) {
    errors.push("official 单任务 n 必须在 1-4 之间");
  }
  const referenceCount = input.referenceImageUrls?.filter(Boolean).length || 0;
  if (referenceCount > OFFICIAL_IMAGE_LIMITS.maxReferenceImages) {
    errors.push("生产模式参考图最多 16 张");
  }
  if (input.maskUrl && referenceCount === 0) {
    errors.push("mask 需要搭配参考图");
  }
  return errors;
}
