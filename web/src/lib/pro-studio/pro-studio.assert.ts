import assert from "node:assert/strict";

import {
  OFFICIAL_IMAGE_MODEL,
  buildProStudioImagePayload,
  createDefaultProStudioState,
  normalizeOfficialImageResolution,
  splitOfficialBatch,
  validateProStudioState,
} from "./index";

assert.equal(normalizeOfficialImageResolution("1080p"), "1k");
assert.deepEqual(splitOfficialBatch(1), [1]);
assert.deepEqual(splitOfficialBatch(4), [4]);
assert.deepEqual(splitOfficialBatch(5), [4, 1]);
assert.deepEqual(splitOfficialBatch(8), [4, 4]);
assert.deepEqual(splitOfficialBatch(12), [4, 4, 4]);

const state = createDefaultProStudioState("product_main");
const payload = buildProStudioImagePayload({
  prompt: "一款高端护肤品",
  state,
  referenceImageUrls: ["https://cdn.example/ref.png"],
});

assert.equal(payload.professional_mode, true);
assert.equal(payload.pro_studio.enabled, true);
assert.equal(payload.model, OFFICIAL_IMAGE_MODEL);
assert.equal(payload.size, "1:1");
assert.equal(payload.image_resolution, "4k");
assert.equal(payload.output_format, "webp");
assert.equal(payload.output_compression, 90);
assert.deepEqual(payload.image_urls, ["https://cdn.example/ref.png"]);

const invalid = createDefaultProStudioState("free_canvas");
invalid.settings.outputFormat = "png";
invalid.settings.outputCompression = 80;
assert.match(validateProStudioState({ state: invalid }).join("\n"), /PNG/);
