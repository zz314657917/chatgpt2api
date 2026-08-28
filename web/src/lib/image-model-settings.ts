import {
  MIDJOURNEY_IMAGE_MODEL,
  isGeminiFlashImageModel,
  isGeminiProImageModel,
  isGrokImagineImageModel,
  isSeedreamImageModel,
  isSeedream50ProImageModel,
  isOfficialImageModel,
  midjourneyVersionSupportsStop,
  type GeminiFlashSettingsPayload,
  type ImageModel,
  type MidjourneySettingsPayload,
} from "@/lib/api";
import type { ImageTaskToolOptions } from "@/lib/image-task-request";

export type OfficialImageModelSettings = {
  background?: string;
  moderation?: string;
  inputImageMask?: string;
};

export type GeminiProImageModelSettings = {
  inputImageMask?: string;
};

export type GrokImageModelSettings = {
  nsfwCheck?: boolean;
};

export type SeedreamImageModelSettings = {
  nsfwCheck?: boolean;
  watermark?: boolean;
  sequentialImageGeneration?: "auto" | "disabled";
  sequentialMaxImages?: number;
};

export type ImageModelSettingsState = {
  midjourney?: MidjourneySettingsPayload;
  geminiFlash?: GeminiFlashSettingsPayload;
  geminiPro?: GeminiProImageModelSettings;
  officialImage?: OfficialImageModelSettings;
  grok?: GrokImageModelSettings;
  seedream?: SeedreamImageModelSettings;
};

export type ImageModelTaskFields = {
  extraBody?: Record<string, unknown>;
  toolOptions?: ImageTaskToolOptions;
};

export const DEFAULT_IMAGE_MODEL_SETTINGS_STATE: ImageModelSettingsState = {
  midjourney: {
    version: "8.1",
    speed: "relax",
    quality: "1",
    stylize: 100,
    chaos: 0,
    weird: 0,
    niji: false,
    raw: false,
    tile: false,
  },
  geminiFlash: {
    google_search: true,
    google_image_search: true,
  },
  officialImage: {
    background: "auto",
    moderation: "auto",
  },
  geminiPro: {},
  grok: {
    nsfwCheck: false,
  },
  seedream: {
    nsfwCheck: false,
    watermark: false,
    sequentialImageGeneration: "disabled",
    sequentialMaxImages: 15,
  },
};

function sourceRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function clampIntegerSetting(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function clampNumberSetting(value: unknown, fallback: number | undefined, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function trimOptionalString(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}

function isMidjourneyImageModel(model: ImageModel | string) {
  return String(model || "").trim().toLowerCase() === MIDJOURNEY_IMAGE_MODEL;
}

function normalizeMidjourneyVersion(value: string, nijiValue: unknown) {
  let version = value.trim();
  let niji = nijiValue === true;
  const normalized = version.toLowerCase();
  if (normalized.startsWith("niji")) {
    niji = true;
    const parsed = normalized
      .replace(/^niji\s*[:\-\s]?/i, "")
      .replace(/^v/, "")
      .trim();
    version = parsed === "6" || parsed === "7" ? parsed : "7";
  }
  if (niji) {
    const parsed = version.toLowerCase().replace(/^v/, "").trim();
    version = parsed === "6" || parsed === "7" ? parsed : "7";
  }
  return { version, niji };
}

export function normalizeMidjourneyModelSettings(value: unknown): MidjourneySettingsPayload {
  const source = sourceRecord(value);
  const defaults = DEFAULT_IMAGE_MODEL_SETTINGS_STATE.midjourney || {};
  const requestedVersion = trimOptionalString(source.version) || defaults.version || "8.1";
  const { version, niji } = normalizeMidjourneyVersion(requestedVersion, source.niji);
  const out: MidjourneySettingsPayload = {
    version,
    speed: trimOptionalString(source.speed) || defaults.speed || "relax",
    quality: trimOptionalString(source.quality) || defaults.quality || "1",
    style: trimOptionalString(source.style),
    stylize: clampIntegerSetting(source.stylize, defaults.stylize ?? 100, 0, 1000),
    chaos: clampIntegerSetting(source.chaos, defaults.chaos ?? 0, 0, 100),
    weird: clampIntegerSetting(source.weird, defaults.weird ?? 0, 0, 3000),
    niji,
    raw: source.raw === true,
    tile: source.tile === true,
    draft: source.draft === true,
    hd: source.hd === true,
  };
  const seed = clampIntegerSetting(source.seed, -1, 0, 4294967295);
  if (seed >= 0) {
    out.seed = seed;
  }
  const repeat = clampIntegerSetting(source.repeat, -1, 2, 40);
  if (repeat >= 2) {
    out.repeat = repeat;
  }
  const iw = clampNumberSetting(source.iw, undefined, 0, 3);
  if (iw !== undefined) {
    out.iw = iw;
  }
  const dw = clampNumberSetting(source.dw, undefined, 0, 100);
  if (dw !== undefined) {
    out.dw = dw;
  }
  const cw = clampIntegerSetting(source.cw, -1, 0, 100);
  if (cw >= 0) {
    out.cw = cw;
  }
  const sw = clampIntegerSetting(source.sw, -1, 0, 1000);
  if (sw >= 0) {
    out.sw = sw;
  }
  for (const key of ["negative_prompt", "cref", "sref", "dref", "extra"] as const) {
    const text = trimOptionalString(source[key]);
    if (text) {
      out[key] = text;
    }
  }
  if (midjourneyVersionSupportsStop(version)) {
    out.stop = clampIntegerSetting(source.stop, 100, 10, 100);
  }
  return out;
}

export function normalizeGeminiFlashModelSettings(value: unknown): GeminiFlashSettingsPayload {
  const source = sourceRecord(value);
  const googleImageSearch = source.google_image_search === false ? false : true;
  return {
    google_search: source.google_search === true || googleImageSearch,
    google_image_search: googleImageSearch,
  };
}

export function normalizeOfficialImageModelSettings(value: unknown): OfficialImageModelSettings {
  const source = sourceRecord(value);
  const background = String(source.background || "").trim();
  const moderation = String(source.moderation || "").trim();
  const inputImageMask = trimOptionalString(source.inputImageMask) || trimOptionalString(source.input_image_mask) || trimOptionalString(source.mask_url);
  return {
    background: background === "opaque" || background === "transparent" || background === "auto" ? background : "auto",
    moderation: moderation === "low" || moderation === "auto" ? moderation : "auto",
    ...(inputImageMask ? { inputImageMask } : {}),
  };
}

export function normalizeGeminiProModelSettings(value: unknown): GeminiProImageModelSettings | undefined {
  const source = sourceRecord(value);
  const inputImageMask = trimOptionalString(source.inputImageMask) || trimOptionalString(source.input_image_mask) || trimOptionalString(source.mask_url);
  return inputImageMask ? { inputImageMask } : undefined;
}

export function normalizeGrokImageModelSettings(value: unknown): GrokImageModelSettings {
  const source = sourceRecord(value);
  return { nsfwCheck: source.nsfwCheck === true || source.nsfw_check === true };
}

export function normalizeSeedreamImageModelSettings(value: unknown): SeedreamImageModelSettings {
  const source = sourceRecord(value);
  const mode = source.sequentialImageGeneration === "auto" || source.sequential_image_generation === "auto" ? "auto" : "disabled";
  return {
    nsfwCheck: source.nsfwCheck === true || source.nsfw_check === true,
    watermark: source.watermark === true,
    sequentialImageGeneration: mode,
    sequentialMaxImages: clampIntegerSetting(source.sequentialMaxImages ?? source.sequential_image_generation_max_images, 15, 1, 15),
  };
}

export function defaultImageModelSettings(model: ImageModel | string): ImageModelSettingsState {
  return normalizeImageModelSettings(model, DEFAULT_IMAGE_MODEL_SETTINGS_STATE);
}

export function normalizeImageModelSettings(model: ImageModel | string, value?: ImageModelSettingsState | Record<string, unknown> | null): ImageModelSettingsState {
  const source = sourceRecord(value);
  if (isMidjourneyImageModel(model)) {
    return { midjourney: normalizeMidjourneyModelSettings(source.midjourney ?? source) };
  }
  if (isGeminiFlashImageModel(model)) {
    return { geminiFlash: normalizeGeminiFlashModelSettings(source.geminiFlash ?? source) };
  }
  if (isOfficialImageModel(model)) {
    return { officialImage: normalizeOfficialImageModelSettings(source.officialImage ?? source) };
  }
  if (isGeminiProImageModel(model)) {
    const geminiPro = normalizeGeminiProModelSettings(source.geminiPro ?? source);
    return geminiPro ? { geminiPro } : {};
  }
  if (isGrokImagineImageModel(model)) {
    return { grok: normalizeGrokImageModelSettings(source.grok ?? source) };
  }
  if (isSeedreamImageModel(model)) {
    return { seedream: normalizeSeedreamImageModelSettings(source.seedream ?? source) };
  }
  return {};
}

export function mergeImageModelSettingsForModel(
  model: ImageModel | string,
  current: ImageModelSettingsState | undefined,
  patch: ImageModelSettingsState | Record<string, unknown>,
): ImageModelSettingsState {
  const normalizedCurrent = normalizeImageModelSettings(model, current);
  const patchRecord = sourceRecord(patch);
  if (isMidjourneyImageModel(model)) {
    const patchValue = sourceRecord(patchRecord.midjourney || patchRecord);
    return {
      midjourney: normalizeMidjourneyModelSettings({
        ...sourceRecord(normalizedCurrent.midjourney),
        ...patchValue,
      }),
    };
  }
  if (isGeminiFlashImageModel(model)) {
    const patchValue = sourceRecord(patchRecord.geminiFlash || patchRecord);
    return {
      geminiFlash: normalizeGeminiFlashModelSettings({
        ...sourceRecord(normalizedCurrent.geminiFlash),
        ...patchValue,
      }),
    };
  }
  if (isOfficialImageModel(model)) {
    const patchValue = sourceRecord(patchRecord.officialImage || patchRecord);
    return {
      officialImage: normalizeOfficialImageModelSettings({
        ...sourceRecord(normalizedCurrent.officialImage),
        ...patchValue,
      }),
    };
  }
  if (isGeminiProImageModel(model)) {
    const patchValue = sourceRecord(patchRecord.geminiPro || patchRecord);
    const next = normalizeGeminiProModelSettings({
      ...sourceRecord(normalizedCurrent.geminiPro),
      ...patchValue,
    });
    return next ? { geminiPro: next } : {};
  }
  if (isGrokImagineImageModel(model)) {
    const patchValue = sourceRecord(patchRecord.grok || patchRecord);
    return {
      grok: normalizeGrokImageModelSettings({
        ...sourceRecord(normalizedCurrent.grok),
        ...patchValue,
      }),
    };
  }
  if (isSeedreamImageModel(model)) {
    const patchValue = sourceRecord(patchRecord.seedream || patchRecord);
    return {
      seedream: normalizeSeedreamImageModelSettings({
        ...sourceRecord(normalizedCurrent.seedream),
        ...patchValue,
      }),
    };
  }
  return {};
}

export function imageModelHasSettings(model: ImageModel | string) {
  return isMidjourneyImageModel(model) || isGeminiFlashImageModel(model) || isOfficialImageModel(model) || isGeminiProImageModel(model) || isGrokImagineImageModel(model) || isSeedreamImageModel(model);
}

export function imageModelSettingsSummary(model: ImageModel | string, settings?: ImageModelSettingsState) {
  const normalized = normalizeImageModelSettings(model, settings);
  if (isMidjourneyImageModel(model)) {
    const item = normalized.midjourney || normalizeMidjourneyModelSettings(undefined);
    return [`V${item.version || "8.1"}`, item.speed || "relax", `Q${item.quality || "1"}`].join(" · ");
  }
  if (isGeminiFlashImageModel(model)) {
    const item = normalized.geminiFlash || normalizeGeminiFlashModelSettings(undefined);
    const labels = [
      item.google_search ? "联网" : "",
      item.google_image_search !== false ? "搜图" : "",
    ].filter(Boolean);
    return labels.length > 0 ? labels.join(" · ") : "关闭搜索";
  }
  if (isOfficialImageModel(model)) {
    const item = normalized.officialImage || normalizeOfficialImageModelSettings(undefined);
    return [`背景 ${item.background || "auto"}`, `审核 ${item.moderation || "auto"}`].join(" · ");
  }
  if (isGeminiProImageModel(model)) {
    return normalized.geminiPro?.inputImageMask ? "已设置遮罩" : "可设置遮罩";
  }
  if (isGrokImagineImageModel(model)) {
    return normalized.grok?.nsfwCheck ? "提交前审核开启" : "提交前审核关闭";
  }
  if (isSeedreamImageModel(model)) {
    const item = normalized.seedream || normalizeSeedreamImageModelSettings(undefined);
    return [item.nsfwCheck ? "审核开启" : "审核关闭", item.watermark ? "带水印" : "无水印"].join(" · ");
  }
  return "";
}

export function imageModelSettingsToTaskFields(model: ImageModel | string, settings?: ImageModelSettingsState, count = 1): ImageModelTaskFields {
  const normalized = normalizeImageModelSettings(model, settings);
  if (isMidjourneyImageModel(model)) {
    const midjourney = normalizeMidjourneyModelSettings(normalized.midjourney);
    return { extraBody: { midjourney_settings: midjourney } };
  }
  if (isGeminiFlashImageModel(model)) {
    return { extraBody: normalizeGeminiFlashModelSettings(normalized.geminiFlash) };
  }
  if (isOfficialImageModel(model)) {
    const official = normalizeOfficialImageModelSettings(normalized.officialImage);
    return {
      toolOptions: official,
      extraBody: official.inputImageMask ? { input_image_mask: official.inputImageMask, mask_url: official.inputImageMask } : {},
    };
  }
  if (isGeminiProImageModel(model)) {
    const geminiPro = normalizeGeminiProModelSettings(normalized.geminiPro);
    return geminiPro?.inputImageMask
      ? {
          toolOptions: { inputImageMask: geminiPro.inputImageMask },
          extraBody: { input_image_mask: geminiPro.inputImageMask, mask_url: geminiPro.inputImageMask },
        }
      : {};
  }
  if (isGrokImagineImageModel(model)) {
    const grok = normalizeGrokImageModelSettings(normalized.grok);
    return { extraBody: { nsfw_check: grok.nsfwCheck === true } };
  }
  if (isSeedreamImageModel(model)) {
    const seedream = normalizeSeedreamImageModelSettings(normalized.seedream);
    const sequentialMode = count > 1 ? "auto" : seedream.sequentialImageGeneration || "disabled";
    return {
      extraBody: {
        nsfw_check: seedream.nsfwCheck === true,
        watermark: seedream.watermark === true,
        ...(!isSeedream50ProImageModel(model) ? {
          sequential_image_generation: sequentialMode,
          ...(sequentialMode === "auto" ? {
            sequential_image_generation_options: { max_images: seedream.sequentialMaxImages || 15 },
          } : {}),
        } : {}),
      },
    };
  }
  return {};
}

export function compactImageModelSettings(settings?: ImageModelSettingsState): ImageModelSettingsState | undefined {
  if (!settings) {
    return undefined;
  }
  const out: ImageModelSettingsState = {};
  if (settings.midjourney) {
    out.midjourney = normalizeMidjourneyModelSettings(settings.midjourney);
  }
  if (settings.geminiFlash) {
    out.geminiFlash = normalizeGeminiFlashModelSettings(settings.geminiFlash);
  }
  if (settings.officialImage) {
    out.officialImage = normalizeOfficialImageModelSettings(settings.officialImage);
  }
  if (settings.geminiPro) {
    const geminiPro = normalizeGeminiProModelSettings(settings.geminiPro);
    if (geminiPro) {
      out.geminiPro = geminiPro;
    }
  }
  if (settings.grok) {
    out.grok = normalizeGrokImageModelSettings(settings.grok);
  }
  if (settings.seedream) {
    out.seedream = normalizeSeedreamImageModelSettings(settings.seedream);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
