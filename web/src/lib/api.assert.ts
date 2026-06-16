import assert from "node:assert/strict";

import {
  IMAGE_CREATION_MODEL_OPTIONS,
  IMAGE_MODEL_ROUTE_DETAILS,
  estimateImageBillingUnits,
  estimateImageDisplayPriceUSD,
  isImageTaskModel,
} from "@/lib/api";

const geminiFlash = IMAGE_CREATION_MODEL_OPTIONS.find((option) => option.value === "gemini-3.1-flash-image-preview");
const geminiFlashOfficial = IMAGE_CREATION_MODEL_OPTIONS.find((option) => option.value === "gemini-3.1-flash-image-preview-official");
const geminiPro = IMAGE_CREATION_MODEL_OPTIONS.find((option) => option.value === "gemini-3-pro-image-preview");
const geminiProOfficial = IMAGE_CREATION_MODEL_OPTIONS.find((option) => option.value === "gemini-3-pro-image-preview-official");

assert.equal(geminiFlash?.label, "gemini-3.1-flash-image-preview");
assert.equal(geminiFlashOfficial?.label, "gemini-3.1-flash-image-preview-official");
assert.equal(geminiPro?.label, "gemini-3-pro-image-preview");
assert.equal(geminiProOfficial?.label, "gemini-3-pro-image-preview-official");
assert.equal(IMAGE_MODEL_ROUTE_DETAILS["gemini-3.1-flash-image-preview"]?.routeLabel, "标准版本");
assert.equal(IMAGE_MODEL_ROUTE_DETAILS["gemini-3.1-flash-image-preview-official"]?.routeLabel, "官方版本");
assert.equal(IMAGE_MODEL_ROUTE_DETAILS["gemini-3-pro-image-preview"]?.routeLabel, "标准版本");
assert.equal(IMAGE_MODEL_ROUTE_DETAILS["gemini-3-pro-image-preview-official"]?.routeLabel, "官方版本");
assert.equal(isImageTaskModel("gemini-3.1-flash-image-preview"), true);
assert.equal(isImageTaskModel("gemini-3.1-flash-image-preview-official"), true);
assert.equal(isImageTaskModel("gemini-3-pro-image-preview"), true);
assert.equal(isImageTaskModel("gemini-3-pro-image-preview-official"), true);
assert.equal(isImageTaskModel("gpt-5.4"), false);
assert.equal(isImageTaskModel("gpt-5.5"), false);
assert.equal(isImageTaskModel("gpt-5.4-mini"), false);
assert.equal(isImageTaskModel("gpt-5.5-openai-compact"), false);
assert.equal(estimateImageBillingUnits("gpt-image-2-official", 1, "2K", "auto"), 721);
assert.equal(estimateImageBillingUnits("gpt-image-2-official", 1, "2048x2048", "auto"), 82);
assert.equal(estimateImageBillingUnits("gpt-image-2-official", 1, "2K", "low"), 82);
assert.equal(estimateImageDisplayPriceUSD("gemini-3.1-flash-image-preview", 1, "2K"), 0.06);
assert.equal(estimateImageBillingUnits("gemini-3.1-flash-image-preview-official", 1, "2K"), 849);
assert.equal(estimateImageDisplayPriceUSD("gemini-3-pro-image-preview", 2, "4K"), 0.15);
assert.equal(estimateImageBillingUnits("gemini-3-pro-image-preview-official", 2, "4K"), 4032);
