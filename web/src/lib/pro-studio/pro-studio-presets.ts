import { OFFICIAL_IMAGE_MODEL } from "./official-image-capabilities";
import type { ProStudioIntent, ProStudioOfficialSettings, ProStudioQualityTier } from "./pro-studio-types";

export type ProStudioPreset = {
  id: ProStudioIntent;
  label: string;
  description: string;
  pageScope: Array<"canvas" | "ecommerce">;
  defaultSettings: ProStudioOfficialSettings;
  promptHints: string[];
};

export const PRO_STUDIO_QUALITY_TIER_OPTIONS: Array<{
  value: ProStudioQualityTier;
  label: string;
  description: string;
  resolution: ProStudioOfficialSettings["resolution"];
  quality: ProStudioOfficialSettings["quality"];
}> = [
  { value: "draft", label: "草稿 1K", description: "快速探索构图和方向", resolution: "1k", quality: "low" },
  { value: "standard", label: "高清 2K", description: "适合日常运营素材", resolution: "2k", quality: "medium" },
  { value: "production", label: "生产级 4K", description: "最终出图和商业投放", resolution: "4k", quality: "high" },
];

export const PRO_STUDIO_PRESETS: ProStudioPreset[] = [
  {
    id: "free_canvas",
    label: "自由 4K",
    description: "自由创作、海报和画布探索。",
    pageScope: ["canvas"],
    defaultSettings: {
      model: OFFICIAL_IMAGE_MODEL,
      size: "auto",
      resolution: "2k",
      quality: "auto",
      outputFormat: "png",
      background: "auto",
      moderation: "auto",
      n: 1,
    },
    promptHints: ["high quality visual composition", "clean production-ready details"],
  },
  {
    id: "product_main",
    label: "商品主图",
    description: "标准棚拍主图，主体清晰。",
    pageScope: ["canvas", "ecommerce"],
    defaultSettings: {
      model: OFFICIAL_IMAGE_MODEL,
      size: "1:1",
      resolution: "4k",
      quality: "high",
      outputFormat: "webp",
      outputCompression: 90,
      background: "opaque",
      moderation: "auto",
      n: 1,
    },
    promptHints: ["commercial product photography", "centered product composition", "clean studio lighting"],
  },
  {
    id: "product_banner",
    label: "电商横幅",
    description: "首屏横幅和广告横图。",
    pageScope: ["canvas", "ecommerce"],
    defaultSettings: {
      model: OFFICIAL_IMAGE_MODEL,
      size: "16:9",
      resolution: "4k",
      quality: "high",
      outputFormat: "webp",
      outputCompression: 88,
      background: "opaque",
      moderation: "auto",
      n: 1,
    },
    promptHints: ["wide ecommerce hero banner", "clean layout with copy space", "premium brand lighting"],
  },
  {
    id: "sku_variants",
    label: "SKU 批量图",
    description: "同构图下的多 SKU 变体。",
    pageScope: ["ecommerce"],
    defaultSettings: {
      model: OFFICIAL_IMAGE_MODEL,
      size: "1:1",
      resolution: "2k",
      quality: "medium",
      outputFormat: "webp",
      outputCompression: 88,
      background: "opaque",
      moderation: "auto",
      n: 4,
    },
    promptHints: ["consistent ecommerce SKU variant grid", "same lighting and camera angle"],
  },
  {
    id: "detail_page",
    label: "详情页竖图",
    description: "适合详情页中长屏模块。",
    pageScope: ["ecommerce"],
    defaultSettings: {
      model: OFFICIAL_IMAGE_MODEL,
      size: "9:16",
      resolution: "2k",
      quality: "high",
      outputFormat: "webp",
      outputCompression: 88,
      background: "opaque",
      moderation: "auto",
      n: 1,
    },
    promptHints: ["vertical ecommerce detail page module", "clear feature hierarchy", "premium readable layout"],
  },
  {
    id: "lifestyle_scene",
    label: "场景图",
    description: "真实使用场景和氛围图。",
    pageScope: ["canvas", "ecommerce"],
    defaultSettings: {
      model: OFFICIAL_IMAGE_MODEL,
      size: "4:5",
      resolution: "2k",
      quality: "high",
      outputFormat: "webp",
      outputCompression: 88,
      background: "opaque",
      moderation: "auto",
      n: 2,
    },
    promptHints: ["lifestyle scene with product in use", "natural premium environment", "product remains recognizable"],
  },
  {
    id: "ad_creative",
    label: "广告海报",
    description: "转化型广告素材和海报。",
    pageScope: ["canvas"],
    defaultSettings: {
      model: OFFICIAL_IMAGE_MODEL,
      size: "4:5",
      resolution: "4k",
      quality: "high",
      outputFormat: "webp",
      outputCompression: 88,
      background: "opaque",
      moderation: "auto",
      n: 1,
    },
    promptHints: ["conversion-focused advertising poster", "strong visual hierarchy", "premium commercial finish"],
  },
];

export function proStudioPresetByIntent(intent: ProStudioIntent) {
  return PRO_STUDIO_PRESETS.find((preset) => preset.id === intent) || PRO_STUDIO_PRESETS[0];
}

export function proStudioPresetsForScope(scope: "canvas" | "ecommerce") {
  return PRO_STUDIO_PRESETS.filter((preset) => preset.pageScope.includes(scope));
}

export function proStudioQualityTierOption(tier: ProStudioQualityTier) {
  return PRO_STUDIO_QUALITY_TIER_OPTIONS.find((option) => option.value === tier) || PRO_STUDIO_QUALITY_TIER_OPTIONS[1];
}
