import {
  MIDJOURNEY_IMAGE_MODEL,
  estimateImageDisplayPriceUSD,
  isGeminiFlashImageModel,
  isGeminiProImageModel,
  isGrokImagineImageModel,
  isSeedreamImageModel,
  isSeedream50ProImageModel,
  isOfficialImageModel,
  type ImageModel,
  type MidjourneySettingsPayload,
  type GeminiFlashSettingsPayload,
} from "@/lib/api";
import {
  buildImageSize,
  isImageAspectRatio,
  normalizeGrokImageAspectRatio,
  normalizeGrokImageQuality,
  normalizeSeedreamImageAspectRatio,
  normalizeSeedreamImageResolution,
} from "@/lib/image-parameters";
import { normalizeImageOutputCompression, normalizeImageOutputFormat, type ImageQuality } from "@/lib/image-parameters";
import { imageModelSettingsToTaskFields, type ImageModelSettingsState } from "@/lib/image-model-settings";
import type { ImageTaskToolOptions } from "@/lib/image-task-request";
import {
  OFFICIAL_IMAGE_MODEL,
  normalizeOfficialImageCount,
  normalizeOfficialImageOutputFormat,
  normalizeOfficialImageQuality,
  normalizeOfficialImageResolution,
  normalizeOfficialImageSize,
  normalizeOfficialOutputCompression,
  proStudioOfficialSettingsPayload,
  type ProStudioOfficialSettings,
} from "@/lib/pro-studio";

import { imageArenaModelCapability } from "./image-arena-model-capabilities";
import type { ImageArenaAdaptation, ImageArenaSharedSettings, ImageArenaTaskPayload } from "./image-arena-types";

export const IMAGE_ARENA_QUALITY_TIER_SETTINGS = {
  draft: { resolution: "1k", estimateResolution: "1K", quality: "low" },
  standard: { resolution: "2k", estimateResolution: "2K", quality: "medium" },
  production: { resolution: "4k", estimateResolution: "4K", quality: "high" },
} as const satisfies Record<ImageArenaSharedSettings["qualityTier"], { resolution: string; estimateResolution: string; quality: ImageQuality }>;

function arenaImageSize(settings: ImageArenaSharedSettings) {
  if (!settings.aspectRatio) {
    return "";
  }
  const aspectRatio = isImageAspectRatio(settings.aspectRatio) ? settings.aspectRatio : "1:1";
  return buildImageSize({
    mode: "ratio",
    aspectRatio,
    resolution: "auto",
    customRatio: aspectRatio,
    customWidth: "1024",
    customHeight: "1024",
  });
}

function submittedFields(payload: ImageArenaTaskPayload) {
  return {
    model: payload.model,
    ...(payload.size ? { size: payload.size } : {}),
    ...(payload.imageResolution ? { image_resolution: payload.imageResolution } : {}),
    ...(payload.quality ? { quality: payload.quality } : {}),
    n: payload.count,
    ...(payload.outputFormat ? { output_format: payload.outputFormat } : {}),
    ...(typeof payload.outputCompression === "number" ? { output_compression: payload.outputCompression } : {}),
    ...(payload.midjourneySettings ? { midjourney_settings: payload.midjourneySettings } : {}),
    ...(payload.geminiFlashSettings ? payload.geminiFlashSettings : {}),
    ...(payload.toolOptions?.background ? { background: payload.toolOptions.background } : {}),
    ...(payload.toolOptions?.moderation ? { moderation: payload.toolOptions.moderation } : {}),
    ...(payload.toolOptions?.inputImageMask ? { input_image_mask: payload.toolOptions.inputImageMask, mask_url: payload.toolOptions.inputImageMask } : {}),
    ...(payload.extraBody ? payload.extraBody : {}),
  };
}

export function imageArenaSubmittedFields(payload: ImageArenaTaskPayload) {
  return submittedFields(payload);
}

export function adaptImageArenaSettings(
  model: ImageModel,
  settings: ImageArenaSharedSettings,
  modelSettings?: {
    imageModelSettings?: ImageModelSettingsState;
    midjourneySettings?: MidjourneySettingsPayload;
    geminiFlashSettings?: GeminiFlashSettingsPayload;
    officialImageSettings?: ImageTaskToolOptions;
    geminiProSettings?: ImageTaskToolOptions;
  },
): ImageArenaAdaptation {
  const warnings: string[] = [];
  const count = Math.max(1, Math.min(4, Math.round(Number(settings.countPerModel) || 1)));
  const tier = IMAGE_ARENA_QUALITY_TIER_SETTINGS[settings.qualityTier] || IMAGE_ARENA_QUALITY_TIER_SETTINGS.standard;
  const normalizedFormat = normalizeImageOutputFormat(settings.outputFormat);
  const capability = imageArenaModelCapability(model, normalizedFormat);
  const size = arenaImageSize(settings) || settings.aspectRatio || "1:1";
  const imageModelSettings: ImageModelSettingsState = modelSettings?.imageModelSettings || {
    midjourney: modelSettings?.midjourneySettings,
    geminiFlash: modelSettings?.geminiFlashSettings,
    officialImage: modelSettings?.officialImageSettings,
    geminiPro: modelSettings?.geminiProSettings,
    grok: modelSettings?.imageModelSettings?.grok,
    seedream: modelSettings?.imageModelSettings?.seedream,
  };
  let payload: ImageArenaTaskPayload;
  let estimateSizeOrResolution: string = tier.estimateResolution;
  let estimateQuality: ImageQuality = "auto";

  if (isOfficialImageModel(model)) {
    const officialCount = normalizeOfficialImageCount(count);
    const outputFormat = normalizeOfficialImageOutputFormat(normalizedFormat);
    const outputCompression = normalizeOfficialOutputCompression(outputFormat, settings.outputCompression);
    const officialToolOptions = imageModelSettingsToTaskFields(model, imageModelSettings).toolOptions || {};
    const officialSettings: ProStudioOfficialSettings = {
      model: OFFICIAL_IMAGE_MODEL,
      size: normalizeOfficialImageSize(settings.aspectRatio || size),
      resolution: normalizeOfficialImageResolution(tier.resolution),
      quality: normalizeOfficialImageQuality(tier.quality),
      outputFormat,
      background: officialToolOptions.background as ProStudioOfficialSettings["background"],
      moderation: officialToolOptions.moderation as ProStudioOfficialSettings["moderation"],
      n: officialCount,
      ...(typeof outputCompression === "number" ? { outputCompression } : {}),
    };
    payload = {
      model: OFFICIAL_IMAGE_MODEL,
      size: officialSettings.size,
      imageResolution: officialSettings.resolution,
      quality: officialSettings.quality,
      count: officialSettings.n,
      outputFormat: officialSettings.outputFormat,
      ...(typeof officialSettings.outputCompression === "number" ? { outputCompression: officialSettings.outputCompression } : {}),
      toolOptions: {
        ...officialToolOptions,
      },
      extraBody: {
        professional_mode: true,
        pro_studio: {
          enabled: true,
          mode: "manual",
          intent: "free_canvas",
          quality_tier: settings.qualityTier,
        },
        official_settings: proStudioOfficialSettingsPayload(officialSettings),
        resolution: officialSettings.resolution,
      },
    };
    estimateQuality = officialSettings.quality;
    estimateSizeOrResolution = tier.estimateResolution;
    if (settings.outputFormat === "png" && typeof settings.outputCompression === "number") {
      warnings.push("PNG 格式不会提交压缩率参数");
    }
  } else if (model === "gpt-image-2") {
    const outputFormat = capability.supportsOutputControls ? normalizedFormat : undefined;
    const outputCompression =
      outputFormat && capability.supportsOutputCompression
        ? normalizeImageOutputCompression(settings.outputCompression)
        : undefined;
    payload = {
      model,
      size,
      imageResolution: tier.resolution,
      count,
      ...(outputFormat ? { outputFormat } : {}),
      ...(typeof outputCompression === "number" ? { outputCompression } : {}),
    };
    estimateQuality = "auto";
    estimateSizeOrResolution = tier.estimateResolution;
    if (settings.qualityTier !== "standard") {
      warnings.push("gpt-image-2 仅提交分辨率，不提交官方专属质量参数");
    }
    if (!capability.supportsOutputCompression && typeof settings.outputCompression === "number") {
      warnings.push("当前格式不会提交压缩率参数");
    }
  } else if (model === MIDJOURNEY_IMAGE_MODEL) {
    const fields = imageModelSettingsToTaskFields(model, imageModelSettings);
    const midjourneySettings = fields.extraBody?.midjourney_settings as MidjourneySettingsPayload | undefined;
    payload = {
      model,
      size: settings.aspectRatio || undefined,
      count: 1,
      ...(midjourneySettings ? { midjourneySettings } : {}),
      ...(fields.extraBody ? { extraBody: fields.extraBody } : {}),
    };
    estimateQuality = "auto";
    estimateSizeOrResolution = settings.aspectRatio || tier.estimateResolution;
    if (normalizedFormat !== "png") {
      warnings.push("Midjourney 通道不提交输出格式控制");
    }
  } else if (isGeminiFlashImageModel(model)) {
    const fields = imageModelSettingsToTaskFields(model, imageModelSettings);
    payload = {
      model,
      size,
      imageResolution: tier.resolution,
      count,
      ...(fields.extraBody ? { extraBody: fields.extraBody } : {}),
    };
    estimateQuality = "auto";
    estimateSizeOrResolution = tier.estimateResolution;
    if (normalizedFormat !== "png") {
      warnings.push("Gemini Flash 通道不提交输出格式控制");
    }
  } else if (isGeminiProImageModel(model)) {
    const fields = imageModelSettingsToTaskFields(model, imageModelSettings);
    payload = {
      model,
      size,
      imageResolution: tier.resolution,
      count,
      ...(fields.toolOptions ? { toolOptions: fields.toolOptions } : {}),
      ...(fields.extraBody ? { extraBody: fields.extraBody } : {}),
    };
    estimateQuality = "auto";
    estimateSizeOrResolution = tier.estimateResolution;
    if (normalizedFormat !== "png") {
      warnings.push("Gemini Pro 通道不提交输出格式控制");
    }
  } else if (isGrokImagineImageModel(model)) {
    const fields = imageModelSettingsToTaskFields(model, imageModelSettings);
    const grokResolution = tier.resolution === "1k" ? "1080p" : "2k";
    const grokQuality = normalizeGrokImageQuality(tier.quality);
    payload = {
      model,
      size: normalizeGrokImageAspectRatio(settings.aspectRatio) || undefined,
      imageResolution: grokResolution,
      quality: grokQuality,
      count,
      ...(fields.extraBody ? { extraBody: fields.extraBody } : {}),
    };
    estimateQuality = grokQuality;
    estimateSizeOrResolution = grokResolution === "2k" ? "2K" : "1K";
    if (settings.qualityTier === "production") {
      warnings.push("Grok Imagine Image 2.0 最高使用 2K / Medium");
    }
    if (normalizedFormat !== "png") {
      warnings.push("Grok Imagine Image 2.0 不提交输出格式控制");
    }
  } else if (isSeedreamImageModel(model)) {
    const fields = imageModelSettingsToTaskFields(model, imageModelSettings, count);
    const resolution = normalizeSeedreamImageResolution(tier.resolution, model);
    const outputFormat = capability.supportsOutputControls
      ? normalizedFormat === "jpeg" ? "jpeg" : "png"
      : undefined;
    payload = {
      model,
      size: normalizeSeedreamImageAspectRatio(settings.aspectRatio, model) || "auto",
      imageResolution: resolution,
      count: isSeedream50ProImageModel(model) ? 1 : count,
      ...(outputFormat ? { outputFormat } : {}),
      ...(fields.extraBody ? { extraBody: fields.extraBody } : {}),
    };
    estimateQuality = "auto";
    estimateSizeOrResolution = resolution.toUpperCase();
    if (outputFormat && normalizedFormat !== outputFormat) {
      warnings.push("Seedream 仅支持 PNG 或 JPEG 输出格式");
    } else if (!outputFormat && normalizedFormat !== "png") {
      warnings.push("Seedream 4.x 不提交输出格式控制");
    }
    if (isSeedream50ProImageModel(model) && count !== 1) {
      warnings.push("Seedream 5.0 Pro 固定输出 1 张");
    }
  } else {
    payload = {
      model,
      size: settings.aspectRatio || undefined,
      count,
    };
    estimateQuality = "auto";
    estimateSizeOrResolution = tier.estimateResolution;
    warnings.push("当前通道不会提交分辨率、质量档或压缩率参数");
    if (normalizedFormat !== "png") {
      warnings.push("当前通道不提交输出格式控制");
    }
  }

  return {
    payload,
    warnings,
    estimatedCost: estimateImageDisplayPriceUSD(model, payload.count, estimateSizeOrResolution, estimateQuality),
  };
}
