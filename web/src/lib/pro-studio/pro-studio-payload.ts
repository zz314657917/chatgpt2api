import {
  OFFICIAL_IMAGE_MODEL,
  normalizeOfficialImageBackground,
  normalizeOfficialImageCount,
  normalizeOfficialImageModeration,
  normalizeOfficialImageOutputFormat,
  normalizeOfficialImageQuality,
  normalizeOfficialImageResolution,
  normalizeOfficialImageSize,
  normalizeOfficialOutputCompression,
} from "./official-image-capabilities";
import { proStudioPresetByIntent, proStudioQualityTierOption } from "./pro-studio-presets";
import type { ProStudioOfficialSettings, ProStudioOfficialSettingsPayload, ProStudioPayloadMeta, ProStudioState } from "./pro-studio-types";
import { validateProStudioState } from "./pro-studio-validation";

export type ProStudioPayloadInput = {
  prompt: string;
  state: ProStudioState;
  referenceImageUrls?: string[];
  maskUrl?: string;
};

export type ProStudioImagePayload = {
  professional_mode: true;
  pro_studio: ProStudioPayloadMeta;
  official_settings: ProStudioOfficialSettingsPayload;
  model: typeof OFFICIAL_IMAGE_MODEL;
  prompt: string;
  size: string;
  image_resolution: string;
  resolution: string;
  quality: string;
  output_format: string;
  output_compression?: number;
  background: string;
  moderation: string;
  n: number;
  image_urls?: string[];
  input_image_mask?: string;
  mask_url?: string;
};

export function createDefaultProStudioState(intent = "free_canvas" as ProStudioState["intent"]): ProStudioState {
  const preset = proStudioPresetByIntent(intent);
  return {
    enabled: true,
    mode: "preset",
    intent: preset.id,
    qualityTier: preset.id === "free_canvas" ? "standard" : "production",
    settings: applyProStudioQualityTier(preset.defaultSettings, preset.id === "free_canvas" ? "standard" : "production"),
  };
}

export function normalizeProStudioState(value?: Partial<ProStudioState> | null, fallbackIntent = "free_canvas" as ProStudioState["intent"]): ProStudioState {
  const base = createDefaultProStudioState(fallbackIntent);
  const rawSettings: Partial<ProStudioOfficialSettings> = value?.settings || {};
  const mode = value?.mode === "manual" || value?.mode === "auto" || value?.mode === "preset" ? value.mode : base.mode;
  const intent = value?.intent || base.intent;
  const tier = value?.qualityTier === "draft" || value?.qualityTier === "standard" || value?.qualityTier === "production"
    ? value.qualityTier
    : base.qualityTier;
  const merged: ProStudioOfficialSettings = {
    ...base.settings,
    model: OFFICIAL_IMAGE_MODEL,
    size: normalizeOfficialImageSize(rawSettings.size || base.settings.size),
    resolution: normalizeOfficialImageResolution(rawSettings.resolution || base.settings.resolution),
    quality: normalizeOfficialImageQuality(rawSettings.quality || base.settings.quality),
    outputFormat: normalizeOfficialImageOutputFormat(rawSettings.outputFormat || base.settings.outputFormat),
    background: normalizeOfficialImageBackground(rawSettings.background || base.settings.background),
    moderation: normalizeOfficialImageModeration(rawSettings.moderation || base.settings.moderation),
    n: normalizeOfficialImageCount(rawSettings.n || base.settings.n),
  };
  const compression = normalizeOfficialOutputCompression(merged.outputFormat, rawSettings.outputCompression ?? base.settings.outputCompression);
  if (typeof compression === "number") {
    merged.outputCompression = compression;
  } else {
    delete merged.outputCompression;
  }
  return {
    enabled: value?.enabled === true,
    mode,
    intent,
    qualityTier: tier,
    settings: mode === "manual" ? merged : applyProStudioQualityTier(merged, tier),
  };
}

export function applyProStudioQualityTier(settings: ProStudioOfficialSettings, tier: ProStudioState["qualityTier"]): ProStudioOfficialSettings {
  const option = proStudioQualityTierOption(tier);
  return {
    ...settings,
    resolution: option.resolution,
    quality: option.quality,
  };
}

export function proStudioOfficialSettingsPayload(settings: ProStudioOfficialSettings): ProStudioOfficialSettingsPayload {
  return {
    model: OFFICIAL_IMAGE_MODEL,
    size: settings.size,
    resolution: settings.resolution,
    quality: settings.quality,
    output_format: settings.outputFormat,
    ...(typeof settings.outputCompression === "number" ? { output_compression: settings.outputCompression } : {}),
    background: settings.background,
    moderation: settings.moderation,
    n: settings.n,
  };
}

export function buildProductionPrompt(prompt: string, state: ProStudioState) {
  const preset = proStudioPresetByIntent(state.intent);
  const base = prompt.trim();
  const hints = preset.promptHints.map((hint) => `- ${hint}`).join("\n");
  const addition = `Production requirements:\n${hints}`;
  return base ? `${base}\n\n${addition}` : addition;
}

export function buildProStudioImagePayload(input: ProStudioPayloadInput): ProStudioImagePayload {
  const state = normalizeProStudioState(input.state, input.state.intent);
  state.enabled = true;
  const errors = validateProStudioState({
    state,
    referenceImageUrls: input.referenceImageUrls,
    maskUrl: input.maskUrl,
  });
  if (errors.length > 0) {
    throw new Error(errors[0]);
  }
  const settings = state.settings;
  return {
    professional_mode: true,
    pro_studio: {
      enabled: true,
      mode: state.mode === "off" ? "preset" : state.mode,
      intent: state.intent,
      quality_tier: state.qualityTier,
    },
    official_settings: proStudioOfficialSettingsPayload(settings),
    model: OFFICIAL_IMAGE_MODEL,
    prompt: buildProductionPrompt(input.prompt, state),
    size: settings.size,
    image_resolution: settings.resolution,
    resolution: settings.resolution,
    quality: settings.quality,
    output_format: settings.outputFormat,
    ...(typeof settings.outputCompression === "number" ? { output_compression: settings.outputCompression } : {}),
    background: settings.background,
    moderation: settings.moderation,
    n: settings.n,
    ...(input.referenceImageUrls?.length ? { image_urls: input.referenceImageUrls.filter(Boolean) } : {}),
    ...(input.maskUrl ? { input_image_mask: input.maskUrl, mask_url: input.maskUrl } : {}),
  };
}
