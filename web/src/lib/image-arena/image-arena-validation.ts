import type { ImageModel } from "@/lib/api";

import { imageArenaModelCapability, isImageArenaModel } from "./image-arena-model-capabilities";
import type { ImageArenaPreview, ImageArenaReferenceImage, ImageArenaSharedSettings, ImageArenaValidationResult } from "./image-arena-types";

export const IMAGE_ARENA_MAX_MODELS = 4;
export const IMAGE_ARENA_MAX_IMAGES_TOTAL = 12;
export const IMAGE_ARENA_MAX_IMAGES_PER_MODEL = 4;
export const IMAGE_ARENA_HISTORY_LIMIT = 20;

export function validateImageArenaRequest(input: {
  prompt: string;
  selectedModels: ImageModel[];
  sharedSettings: ImageArenaSharedSettings;
  referenceImages: ImageArenaReferenceImage[];
  previews?: ImageArenaPreview[];
}): ImageArenaValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const prompt = input.prompt.trim();
  const selectedModels = Array.from(new Set(input.selectedModels.filter(isImageArenaModel)));
  const countPerModel = Math.max(0, Math.round(Number(input.sharedSettings.countPerModel) || 0));
  const referenceCount = input.referenceImages.length;

  if (!prompt) {
    errors.push("请输入提示词");
  }
  if (selectedModels.length === 0) {
    errors.push("请选择至少一个模型");
  }
  if (selectedModels.length > IMAGE_ARENA_MAX_MODELS) {
    errors.push(`最多同时选择 ${IMAGE_ARENA_MAX_MODELS} 个模型`);
  }
  if (countPerModel < 1 || countPerModel > IMAGE_ARENA_MAX_IMAGES_PER_MODEL) {
    errors.push(`每个模型数量必须在 1-${IMAGE_ARENA_MAX_IMAGES_PER_MODEL} 之间`);
  }
  if (selectedModels.length * countPerModel > IMAGE_ARENA_MAX_IMAGES_TOTAL) {
    errors.push(`总图片数最多 ${IMAGE_ARENA_MAX_IMAGES_TOTAL} 张`);
  }

  for (const model of selectedModels) {
    const capability = imageArenaModelCapability(model, input.sharedSettings.outputFormat);
    if (referenceCount > capability.maxReferenceImages) {
      errors.push(`${capability.label} 最多支持 ${capability.maxReferenceImages} 张参考图`);
    }
  }

  for (const preview of input.previews || []) {
    warnings.push(...preview.adaptation.warnings);
    if (preview.adaptation.blockedReason) {
      errors.push(`${preview.label}: ${preview.adaptation.blockedReason}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors: Array.from(new Set(errors)),
    warnings: Array.from(new Set(warnings)),
  };
}
