import {
  GROK_IMAGINE_IMAGE_MODEL,
  IMAGE_CREATION_MODEL_OPTIONS,
  MIDJOURNEY_IMAGE_MODEL,
  SEEDREAM_4_IMAGE_MODEL,
  SEEDREAM_45_IMAGE_MODEL,
  SEEDREAM_50_LITE_IMAGE_MODEL,
  SEEDREAM_50_PRO_IMAGE_MODEL,
  imageReferenceInputLimit,
  supportsImageOutputCompression,
  supportsImageOutputControls,
  supportsImageMaskParameter,
  supportsImageQuality,
  type ImageModel,
} from "@/lib/api";
import { OFFICIAL_IMAGE_LIMITS, OFFICIAL_IMAGE_MODEL, isOfficialImageModel } from "@/lib/pro-studio";
import type { ImageOutputFormat } from "@/lib/image-parameters";

import type { ImageArenaModelCapability } from "./image-arena-types";

export type ImageArenaModelOption = {
  value: ImageModel;
  label: string;
};

export const IMAGE_ARENA_MODEL_IDS = [
  "gpt-image-2",
  OFFICIAL_IMAGE_MODEL,
  "gemini-3.1-flash-image-preview",
  "gemini-3-pro-image-preview",
  MIDJOURNEY_IMAGE_MODEL,
  GROK_IMAGINE_IMAGE_MODEL,
  SEEDREAM_4_IMAGE_MODEL,
  SEEDREAM_45_IMAGE_MODEL,
  SEEDREAM_50_LITE_IMAGE_MODEL,
  SEEDREAM_50_PRO_IMAGE_MODEL,
] as const satisfies readonly ImageModel[];

const IMAGE_ARENA_MODEL_ID_SET = new Set<string>(IMAGE_ARENA_MODEL_IDS);

export function imageArenaModelOptions(): ImageArenaModelOption[] {
  const available = IMAGE_CREATION_MODEL_OPTIONS.filter((option) => IMAGE_ARENA_MODEL_ID_SET.has(option.value));
  return IMAGE_ARENA_MODEL_IDS.map((model) => {
    const option = available.find((item) => item.value === model);
    return {
      value: model,
      label: option?.label || model,
    };
  });
}

export function imageArenaModelLabel(model: ImageModel) {
  return imageArenaModelOptions().find((option) => option.value === model)?.label || model;
}

export function imageArenaModelCapability(model: ImageModel, outputFormat: ImageOutputFormat = "png"): ImageArenaModelCapability {
  const official = isOfficialImageModel(model);
  const maxReferenceImages = official ? OFFICIAL_IMAGE_LIMITS.maxReferenceImages : imageReferenceInputLimit(model);
  const compressionSupported = supportsImageOutputCompression(model, outputFormat);
  const outputControlsSupported = supportsImageOutputControls(model);
  return {
    model,
    label: imageArenaModelLabel(model),
    supportsReferences: maxReferenceImages > 0,
    maxReferenceImages,
    supportsOutputControls: outputControlsSupported,
    supportsQuality: supportsImageQuality(model),
    supportsOutputCompression: compressionSupported,
    supportsResolution: model === "gpt-image-2" || official || model === SEEDREAM_4_IMAGE_MODEL || model === SEEDREAM_45_IMAGE_MODEL || model === SEEDREAM_50_LITE_IMAGE_MODEL || model === SEEDREAM_50_PRO_IMAGE_MODEL,
    supportsOfficialSettings: official,
    supportsMask: supportsImageMaskParameter(model),
  };
}

export function isImageArenaModel(model: ImageModel | string | undefined): model is (typeof IMAGE_ARENA_MODEL_IDS)[number] {
  return IMAGE_ARENA_MODEL_ID_SET.has(String(model || ""));
}
