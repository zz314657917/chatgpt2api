import assert from "node:assert/strict";

import {
  IMAGE_CREATION_MODEL_OPTIONS,
  estimateImageBillingUnits,
  estimateImageDisplayPriceUSD,
  isImageTaskModel,
} from "@/lib/api";

const banana2 = IMAGE_CREATION_MODEL_OPTIONS.find((option) => option.value === "gemini-3.1-flash-image");
const banana2Pro = IMAGE_CREATION_MODEL_OPTIONS.find((option) => option.value === "gemini-3-pro-image");

assert.equal(banana2?.label, "Nano Banana 2");
assert.equal(banana2Pro?.label, "Nano Banana Pro");
assert.equal(isImageTaskModel("gemini-3.1-flash-image"), true);
assert.equal(isImageTaskModel("gemini-3-pro-image"), true);
assert.equal(isImageTaskModel("gpt-5.4"), false);
assert.equal(isImageTaskModel("gpt-5.5"), false);
assert.equal(isImageTaskModel("gpt-5.4-mini"), false);
assert.equal(isImageTaskModel("gpt-5.5-openai-compact"), false);
assert.equal(estimateImageDisplayPriceUSD("gemini-3.1-flash-image", 1, "2K"), 0.06);
assert.equal(estimateImageBillingUnits("gemini-3.1-flash-image", 1, "2K"), 420);
assert.equal(estimateImageDisplayPriceUSD("gemini-3-pro-image", 2, "4K"), 0.15);
assert.equal(estimateImageBillingUnits("gemini-3-pro-image", 2, "4K"), 1050);
