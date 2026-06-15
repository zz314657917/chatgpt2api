import type {
  OFFICIAL_IMAGE_MODEL,
  OfficialImageBackground,
  OfficialImageModeration,
  OfficialImageOutputFormat,
  OfficialImageQuality,
  OfficialImageResolution,
  OfficialImageSize,
} from "./official-image-capabilities";

export type ProStudioMode = "off" | "manual" | "preset" | "auto";

export type ProStudioIntent =
  | "free_canvas"
  | "product_main"
  | "product_banner"
  | "sku_variants"
  | "lifestyle_scene"
  | "detail_page"
  | "ad_creative"
  | "poster"
  | "wallpaper";

export type ProStudioQualityTier = "draft" | "standard" | "production";

export type ProStudioOfficialSettings = {
  model: typeof OFFICIAL_IMAGE_MODEL;
  size: OfficialImageSize;
  resolution: OfficialImageResolution;
  quality: OfficialImageQuality;
  outputFormat: OfficialImageOutputFormat;
  outputCompression?: number;
  background: OfficialImageBackground;
  moderation: OfficialImageModeration;
  n: number;
};

export type ProStudioState = {
  enabled: boolean;
  mode: ProStudioMode;
  intent: ProStudioIntent;
  qualityTier: ProStudioQualityTier;
  settings: ProStudioOfficialSettings;
};

export type ProStudioPayloadMeta = {
  enabled: boolean;
  mode: Exclude<ProStudioMode, "off">;
  intent: ProStudioIntent;
  quality_tier: ProStudioQualityTier;
};

export type ProStudioOfficialSettingsPayload = {
  model: typeof OFFICIAL_IMAGE_MODEL;
  size: OfficialImageSize;
  resolution: OfficialImageResolution;
  quality: OfficialImageQuality;
  output_format: OfficialImageOutputFormat;
  output_compression?: number;
  background: OfficialImageBackground;
  moderation: OfficialImageModeration;
  n: number;
};
