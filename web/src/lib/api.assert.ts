import assert from "node:assert/strict";

import {
  IMAGE_CREATION_MODEL_OPTIONS,
  IMAGE_MODEL_ROUTE_DETAILS,
  estimateImageBillingUnits,
  estimateImageDisplayPriceUSD,
  imageTaskSubmitCount,
  imageReferenceInputLimit,
  imageReferenceInputLimitForCount,
  supportsImageMaskParameter,
  supportsOfficialImageGenerationSettings,
  isHiddenImageModelOption,
  isImageTaskModel,
} from "@/lib/api";
import { cleanModelDisplayName, displayModelLabel } from "@/lib/model-display";

const geminiFlash = IMAGE_CREATION_MODEL_OPTIONS.find((option) => option.value === "gemini-3.1-flash-image-preview");
const geminiFlashOfficial = IMAGE_CREATION_MODEL_OPTIONS.find((option) => option.value === "gemini-3.1-flash-image-preview-official");
const geminiPro = IMAGE_CREATION_MODEL_OPTIONS.find((option) => option.value === "gemini-3-pro-image-preview");
const geminiProOfficial = IMAGE_CREATION_MODEL_OPTIONS.find((option) => option.value === "gemini-3-pro-image-preview-official");
const midjourney = IMAGE_CREATION_MODEL_OPTIONS.find((option) => option.value === "midjourney");
const grokImagine = IMAGE_CREATION_MODEL_OPTIONS.find((option) => option.value === "grok-imagine-image-2.0");
const seedream40 = IMAGE_CREATION_MODEL_OPTIONS.find((option) => option.value === "doubao-seedance-4-0");
const seedream45 = IMAGE_CREATION_MODEL_OPTIONS.find((option) => option.value === "doubao-seedance-4-5");
const seedream50Lite = IMAGE_CREATION_MODEL_OPTIONS.find((option) => option.value === "seedream-5-0-lite");
const seedream50Pro = IMAGE_CREATION_MODEL_OPTIONS.find((option) => option.value === "seedream-5-0-pro");

assert.equal(midjourney?.label, "Midjourney");
assert.equal(grokImagine?.label, "grok-imagine-image-2.0");
assert.equal(seedream40?.label, "doubao-seedance-4-0");
assert.equal(seedream45?.label, "doubao-seedance-4-5");
assert.equal(seedream50Lite?.label, "seedream-5-0-lite");
assert.equal(seedream50Pro?.label, "seedream-5-0-pro");
assert.equal(geminiFlash?.label, "gemini-3.1-flash-image-preview");
assert.equal(geminiFlashOfficial?.label, "gemini-3.1-flash-image-preview-official");
assert.equal(geminiPro?.label, "gemini-3-pro-image-preview");
assert.equal(geminiProOfficial?.label, "gemini-3-pro-image-preview-official");
assert.equal(IMAGE_MODEL_ROUTE_DETAILS["gpt-image-2"]?.routeLabel, "标准版本");
assert.equal(IMAGE_MODEL_ROUTE_DETAILS["gpt-image-2-official"]?.routeLabel, "官方版本");
assert.equal(IMAGE_MODEL_ROUTE_DETAILS.midjourney?.routeLabel, "Imagine");
assert.equal(IMAGE_MODEL_ROUTE_DETAILS["grok-imagine-image-2.0"]?.routeLabel, "Grok Imagine Image 2.0");
assert.equal(IMAGE_MODEL_ROUTE_DETAILS["doubao-seedance-4-0"]?.routeLabel, "Seedream 4.0");
assert.equal(IMAGE_MODEL_ROUTE_DETAILS["doubao-seedance-4-5"]?.routeLabel, "Seedream 4.5");
assert.equal(IMAGE_MODEL_ROUTE_DETAILS["gemini-3.1-flash-image-preview"]?.routeLabel, "Nano Banana 2 标准版本");
assert.equal(IMAGE_MODEL_ROUTE_DETAILS["gemini-3.1-flash-image-preview-official"]?.routeLabel, "Nano Banana 2 官方版本");
assert.equal(IMAGE_MODEL_ROUTE_DETAILS["gemini-3-pro-image-preview"]?.routeLabel, "Nano Banana Pro 标准版本");
assert.equal(IMAGE_MODEL_ROUTE_DETAILS["gemini-3-pro-image-preview-official"]?.routeLabel, "Nano Banana Pro 官方版本");
assert.equal(isImageTaskModel("gemini-3.1-flash-image-preview"), true);
assert.equal(isImageTaskModel("gemini-3.1-flash-image-preview-official"), true);
assert.equal(isImageTaskModel("gemini-3-pro-image-preview"), true);
assert.equal(isImageTaskModel("gemini-3-pro-image-preview-official"), true);
assert.equal(isImageTaskModel("midjourney"), true);
assert.equal(isImageTaskModel("grok-imagine-image-2.0"), true);
assert.equal(isImageTaskModel("doubao-seedance-4-0"), true);
assert.equal(isImageTaskModel("doubao-seedance-4-5"), true);
assert.equal(isImageTaskModel("seedream-5-0-lite"), true);
assert.equal(isImageTaskModel("seedream-5-0-pro"), true);
assert.equal(isImageTaskModel("gpt-5.4"), false);
assert.equal(isImageTaskModel("gpt-5.5"), false);
assert.equal(isImageTaskModel("gpt-5.4-mini"), false);
assert.equal(isImageTaskModel("gpt-5.5-openai-compact"), false);
assert.equal(imageReferenceInputLimit("gpt-image-2"), 16);
assert.equal(imageReferenceInputLimit("gpt-image-2-official"), 16);
assert.equal(imageReferenceInputLimit("midjourney"), 4);
assert.equal(imageReferenceInputLimit("grok-imagine-image-2.0"), 3);
assert.equal(imageReferenceInputLimit("doubao-seedance-4-0"), 14);
assert.equal(imageReferenceInputLimit("doubao-seedance-4-5"), 14);
assert.equal(imageReferenceInputLimit("seedream-5-0-lite"), 14);
assert.equal(imageReferenceInputLimit("seedream-5-0-pro"), 10);
assert.equal(imageReferenceInputLimitForCount("seedream-5-0-lite", 12), 3);
assert.equal(imageTaskSubmitCount("doubao-seedance-4-0", 20), 15);
assert.equal(imageTaskSubmitCount("seedream-5-0-lite", 20), 15);
assert.equal(imageTaskSubmitCount("seedream-5-0-pro", 4), 1);
assert.equal(imageReferenceInputLimit("gemini-3.1-flash-image-preview"), 14);
assert.equal(imageReferenceInputLimit("gemini-3.1-flash-image-preview-official"), 14);
assert.equal(imageTaskSubmitCount("gemini-3.1-flash-image-preview", 4), 1);
assert.equal(imageTaskSubmitCount("gemini-3.1-flash-image-preview-official", 4), 1);
assert.equal(imageTaskSubmitCount("gpt-image-2", 4), 4);
assert.equal(imageReferenceInputLimit("gemini-3-pro-image-preview"), 14);
assert.equal(imageReferenceInputLimit("gemini-3-pro-image-preview-official"), 14);
assert.equal(supportsOfficialImageGenerationSettings("gpt-image-2-official"), true);
assert.equal(supportsOfficialImageGenerationSettings("gpt-image-2"), false);
assert.equal(supportsImageMaskParameter("gpt-image-2-official"), true);
assert.equal(supportsImageMaskParameter("gemini-3-pro-image-preview"), true);
assert.equal(supportsImageMaskParameter("gemini-3.1-flash-image-preview"), false);
assert.equal(estimateImageBillingUnits("gpt-image-2-official", 1, "2K", "auto"), 721);
assert.equal(estimateImageBillingUnits("gpt-image-2-official", 1, "2048x2048", "auto"), 82);
assert.equal(estimateImageBillingUnits("gpt-image-2-official", 1, "2K", "low"), 82);
assert.equal(estimateImageDisplayPriceUSD("gemini-3.1-flash-image-preview", 1, "2K"), 0.06);
assert.equal(estimateImageBillingUnits("gemini-3.1-flash-image-preview-official", 1, "2K"), 849);
assert.equal(estimateImageDisplayPriceUSD("gemini-3-pro-image-preview", 2, "4K"), 0.15);
assert.equal(estimateImageBillingUnits("gemini-3-pro-image-preview-official", 2, "4K"), 4032);
assert.equal(estimateImageDisplayPriceUSD("midjourney", 1, "16:9"), null);
assert.equal(estimateImageDisplayPriceUSD("grok-imagine-image-2.0", 1, "1:1"), null);
assert.equal(estimateImageDisplayPriceUSD("doubao-seedance-4-0", 1, "1K"), null);
assert.equal(isHiddenImageModelOption("grok-imagine-image-2.0"), false);
assert.equal(displayModelLabel("grok-imagine-image-2.0"), "grok-imagine-image-2.0");
assert.equal(cleanModelDisplayName("grok-imagine-image-2.0"), "grok-imagine-image-2.0");
assert.equal(cleanModelDisplayName("Nano Banana Pro - Api Mart"), "Nano Banana Pro");
