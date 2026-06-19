import { adaptImageArenaSettings, imageArenaSubmittedFields } from "./image-arena-adapter";
import { validateImageArenaRequest } from "./image-arena-validation";
import type { ImageArenaSharedSettings } from "./image-arena-types";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const productionSettings: ImageArenaSharedSettings = {
  aspectRatio: "1:1",
  qualityTier: "production",
  countPerModel: 6,
  outputFormat: "png",
  outputCompression: 80,
  visibility: "private",
};

const official = adaptImageArenaSettings("gpt-image-2-official", productionSettings);
assert(official.payload.imageResolution === "4k", "official production should submit resolution=4k");
assert(official.payload.quality === "high", "official production should submit quality=high");
assert(official.payload.count === 4, "official n should clamp to 4");
assert(official.payload.outputCompression === undefined, "official png should omit output_compression");
const officialMask = adaptImageArenaSettings("gpt-image-2-official", productionSettings, {
  officialImageSettings: { background: "transparent", moderation: "low", inputImageMask: "https://cdn.example/mask.png" },
});
const officialMaskFields = imageArenaSubmittedFields(officialMask.payload);
assert(officialMaskFields.background === "transparent", "official should submit background");
assert(officialMaskFields.moderation === "low", "official should submit moderation");
assert(officialMaskFields.mask_url === "https://cdn.example/mask.png", "official should submit mask_url");

const gptImage = adaptImageArenaSettings("gpt-image-2", productionSettings);
const gptImageFields = imageArenaSubmittedFields(gptImage.payload);
assert(gptImageFields.quality === undefined, "gpt-image-2 should omit official-only quality");
assert(gptImageFields.image_resolution === "4k", "gpt-image-2 should submit image_resolution");

const gemini = adaptImageArenaSettings("gemini-3.1-flash-image-preview", productionSettings);
const geminiFields = imageArenaSubmittedFields(gemini.payload);
assert(geminiFields.image_resolution === "4k", "Gemini should submit image_resolution");
assert(geminiFields.quality === undefined, "Gemini should omit quality");
assert(geminiFields.output_compression === undefined, "Gemini should omit compression");
const geminiSearch = adaptImageArenaSettings("gemini-3.1-flash-image-preview", productionSettings, {
  geminiFlashSettings: { google_search: true, google_image_search: false },
});
const geminiSearchFields = imageArenaSubmittedFields(geminiSearch.payload);
assert(geminiSearchFields.google_search === true, "Gemini Flash should submit google_search");
assert(geminiSearchFields.google_image_search === false, "Gemini Flash should submit google_image_search");
const geminiImageSearch = adaptImageArenaSettings("gemini-3.1-flash-image-preview", productionSettings, {
  geminiFlashSettings: { google_image_search: true },
});
const geminiImageSearchFields = imageArenaSubmittedFields(geminiImageSearch.payload);
assert(geminiImageSearchFields.google_search === true, "Gemini Flash image search should enable google_search");
assert(geminiImageSearchFields.google_image_search === true, "Gemini Flash image search should submit google_image_search");
const geminiProMask = adaptImageArenaSettings("gemini-3-pro-image-preview", productionSettings, {
  geminiProSettings: { inputImageMask: "https://cdn.example/pro-mask.png" },
});
const geminiProMaskFields = imageArenaSubmittedFields(geminiProMask.payload);
assert(geminiProMaskFields.mask_url === "https://cdn.example/pro-mask.png", "Gemini Pro should submit mask_url");

const midjourney = adaptImageArenaSettings("midjourney", productionSettings, {
  midjourneySettings: {
    version: "6.1",
    speed: "fast",
    quality: "1",
    stylize: 250,
    chaos: 12,
    weird: 3,
    stop: 80,
    raw: true,
  },
});
const midjourneyFields = imageArenaSubmittedFields(midjourney.payload);
assert(midjourney.payload.count === 1, "Midjourney should submit one Imagine request");
assert(midjourneyFields.n === 1, "Midjourney submitted n should be 1");
assert(midjourneyFields.midjourney_settings && typeof midjourneyFields.midjourney_settings === "object", "Midjourney should submit settings");
assert((midjourneyFields.midjourney_settings as Record<string, unknown>).version === "6.1", "Midjourney should preserve version");
assert((midjourneyFields.midjourney_settings as Record<string, unknown>).stop === 80, "Midjourney v6.1 should submit stop");

const midjourneyV81 = adaptImageArenaSettings("midjourney", productionSettings, {
  midjourneySettings: { version: "8.1", stop: 80 },
});
const midjourneyV81Settings = imageArenaSubmittedFields(midjourneyV81.payload).midjourney_settings as Record<string, unknown>;
assert(midjourneyV81Settings.stop === undefined, "Midjourney v8.1 should omit unsupported stop");

const tooManyReferences = validateImageArenaRequest({
  prompt: "test",
  selectedModels: ["gpt-image-2"],
  sharedSettings: { ...productionSettings, countPerModel: 1 },
  referenceImages: Array.from({ length: 17 }, (_, index) => ({ id: `ref-${index}`, filename: `ref-${index}.png` })),
});
assert(!tooManyReferences.ok, "reference image overflow should block submit");

const tooManyImages = validateImageArenaRequest({
  prompt: "test",
  selectedModels: ["gpt-image-2", "gpt-image-2-official", "gemini-3.1-flash-image-preview", "gemini-3-pro-image-preview"],
  sharedSettings: { ...productionSettings, countPerModel: 4 },
  referenceImages: [],
});
assert(!tooManyImages.ok, "total image overflow should block submit");
