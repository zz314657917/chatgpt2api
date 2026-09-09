import assert from "node:assert/strict";
import { isImageQuality, normalizeGPTImage25Quality } from "@/lib/image-parameters";

import {
  buildImageTaskRequestParameters,
  imageTaskRequestBodyFields,
  isOfficialImageGatewayModel,
  supportsTaskOutputCompression,
} from "@/lib/image-task-request";

for (const model of ["gpt-image-2.5-flare", "gpt-image-2.5-sunburst"]) {
  const fields = imageTaskRequestBodyFields(buildImageTaskRequestParameters({ model, size: "5:4", imageResolution: "1k", quality: "max", outputFormat: "webp", outputCompression: 0, toolOptions: { background: "transparent", moderation: "low" } }));
  assert.equal(fields.size, "5:4");
  assert.equal(fields.image_resolution, "1k");
  assert.equal(fields.quality, "max");
  assert.equal(fields.output_compression, 0);
  assert.throws(() => buildImageTaskRequestParameters({ model, outputFormat: "jpeg", toolOptions: { background: "transparent" } }), /透明背景/);
}
assert.equal(isImageQuality("max"), false);
assert.equal(normalizeGPTImage25Quality("max"), "max");

const officialWebp = buildImageTaskRequestParameters({
  model: "gpt-image-2-official",
  size: "128:128",
  imageResolution: "1K",
  quality: "high",
  outputFormat: "webp",
  outputCompression: 125,
});

assert.equal(isOfficialImageGatewayModel("gpt-image-2-official"), true);
assert.equal(officialWebp.size, "128x128");
assert.equal(officialWebp.image_resolution, "1080p");
assert.equal(officialWebp.output_format, "webp");
assert.equal(officialWebp.output_compression, 100);
assert.equal(officialWebp.quality, "high");
assert.deepEqual(imageTaskRequestBodyFields(officialWebp), {
  model: "gpt-image-2-official",
  size: "128x128",
  image_resolution: "1080p",
  quality: "high",
  output_format: "webp",
  output_compression: 100,
});

const officialPng = buildImageTaskRequestParameters({
  model: "gpt-image-2-official",
  size: "16:9",
  imageResolution: "2K",
  outputFormat: "png",
  outputCompression: 55,
});

assert.equal(officialPng.size, "16:9");
assert.equal(officialPng.image_resolution, "2k");
assert.equal(officialPng.output_format, "png");
assert.equal(officialPng.output_compression, undefined);

const regularWebp = buildImageTaskRequestParameters({
  model: "gpt-image-2",
  outputFormat: "webp",
  outputCompression: 55,
});

const maskFields = imageTaskRequestBodyFields(buildImageTaskRequestParameters({
  model: "gemini-3-pro-image-preview",
  toolOptions: { inputImageMask: "https://cdn.example/mask.png" },
}));
assert.equal(maskFields.input_image_mask, "https://cdn.example/mask.png");
assert.equal(maskFields.mask_url, "https://cdn.example/mask.png");

assert.equal(supportsTaskOutputCompression("gpt-image-2-official", "webp"), true);
assert.equal(supportsTaskOutputCompression("gpt-image-2", "webp"), false);
assert.equal(regularWebp.output_format, "webp");
assert.equal(regularWebp.output_compression, undefined);
