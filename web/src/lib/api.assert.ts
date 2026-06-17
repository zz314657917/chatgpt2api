import assert from "node:assert/strict";

import {
  IMAGE_CREATION_MODEL_OPTIONS,
  IMAGE_MODEL_ROUTE_DETAILS,
  estimateImageBillingUnits,
  estimateImageDisplayPriceUSD,
  imageReferenceInputLimit,
  isImageTaskModel,
} from "@/lib/api";

const geminiFlash = IMAGE_CREATION_MODEL_OPTIONS.find((option) => option.value === "gemini-3.1-flash-image-preview");
const geminiFlashOfficial = IMAGE_CREATION_MODEL_OPTIONS.find((option) => option.value === "gemini-3.1-flash-image-preview-official");
const geminiPro = IMAGE_CREATION_MODEL_OPTIONS.find((option) => option.value === "gemini-3-pro-image-preview");
const geminiProOfficial = IMAGE_CREATION_MODEL_OPTIONS.find((option) => option.value === "gemini-3-pro-image-preview-official");
const midjourney = IMAGE_CREATION_MODEL_OPTIONS.find((option) => option.value === "midjourney");
const grokImagine = IMAGE_CREATION_MODEL_OPTIONS.find((option) => option.value === "grok-imagine-1.5");

assert.equal(midjourney?.label, "Midjourney");
assert.equal(grokImagine?.label, "grok-imagine-1.5");
assert.equal(geminiFlash?.label, "gemini-3.1-flash-image-preview");
assert.equal(geminiFlashOfficial?.label, "gemini-3.1-flash-image-preview-official");
assert.equal(geminiPro?.label, "gemini-3-pro-image-preview");
assert.equal(geminiProOfficial?.label, "gemini-3-pro-image-preview-official");
assert.equal(IMAGE_MODEL_ROUTE_DETAILS["gpt-image-2"]?.routeLabel, "标准版本");
assert.equal(IMAGE_MODEL_ROUTE_DETAILS["gpt-image-2-official"]?.routeLabel, "官方版本");
assert.equal(IMAGE_MODEL_ROUTE_DETAILS.midjourney?.routeLabel, "Imagine");
assert.equal(IMAGE_MODEL_ROUTE_DETAILS["grok-imagine-1.5"]?.routeLabel, "Grok Imagine 1.5");
assert.equal(IMAGE_MODEL_ROUTE_DETAILS["gemini-3.1-flash-image-preview"]?.routeLabel, "Nano Banana 2 标准版本");
assert.equal(IMAGE_MODEL_ROUTE_DETAILS["gemini-3.1-flash-image-preview-official"]?.routeLabel, "Nano Banana 2 官方版本");
assert.equal(IMAGE_MODEL_ROUTE_DETAILS["gemini-3-pro-image-preview"]?.routeLabel, "Nano Banana Pro 标准版本");
assert.equal(IMAGE_MODEL_ROUTE_DETAILS["gemini-3-pro-image-preview-official"]?.routeLabel, "Nano Banana Pro 官方版本");
assert.equal(isImageTaskModel("gemini-3.1-flash-image-preview"), true);
assert.equal(isImageTaskModel("gemini-3.1-flash-image-preview-official"), true);
assert.equal(isImageTaskModel("gemini-3-pro-image-preview"), true);
assert.equal(isImageTaskModel("gemini-3-pro-image-preview-official"), true);
assert.equal(isImageTaskModel("midjourney"), true);
assert.equal(isImageTaskModel("grok-imagine-1.5"), true);
assert.equal(isImageTaskModel("gpt-5.4"), false);
assert.equal(isImageTaskModel("gpt-5.5"), false);
assert.equal(isImageTaskModel("gpt-5.4-mini"), false);
assert.equal(isImageTaskModel("gpt-5.5-openai-compact"), false);
assert.equal(imageReferenceInputLimit("gpt-image-2"), 16);
assert.equal(imageReferenceInputLimit("gpt-image-2-official"), 16);
assert.equal(imageReferenceInputLimit("midjourney"), 4);
assert.equal(imageReferenceInputLimit("grok-imagine-1.5"), 1);
assert.equal(imageReferenceInputLimit("gemini-3.1-flash-image-preview"), 14);
assert.equal(imageReferenceInputLimit("gemini-3.1-flash-image-preview-official"), 14);
assert.equal(imageReferenceInputLimit("gemini-3-pro-image-preview"), 14);
assert.equal(imageReferenceInputLimit("gemini-3-pro-image-preview-official"), 14);
assert.equal(estimateImageBillingUnits("gpt-image-2-official", 1, "2K", "auto"), 721);
assert.equal(estimateImageBillingUnits("gpt-image-2-official", 1, "2048x2048", "auto"), 82);
assert.equal(estimateImageBillingUnits("gpt-image-2-official", 1, "2K", "low"), 82);
assert.equal(estimateImageDisplayPriceUSD("gemini-3.1-flash-image-preview", 1, "2K"), 0.06);
assert.equal(estimateImageBillingUnits("gemini-3.1-flash-image-preview-official", 1, "2K"), 849);
assert.equal(estimateImageDisplayPriceUSD("gemini-3-pro-image-preview", 2, "4K"), 0.15);
assert.equal(estimateImageBillingUnits("gemini-3-pro-image-preview-official", 2, "4K"), 4032);
assert.equal(estimateImageDisplayPriceUSD("midjourney", 1, "16:9"), null);
assert.equal(estimateImageDisplayPriceUSD("grok-imagine-1.5", 1, "1:1"), null);
