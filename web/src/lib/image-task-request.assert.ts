import assert from "node:assert/strict";

import {
  buildImageTaskRequestParameters,
  imageTaskRequestBodyFields,
  isOfficialImageGatewayModel,
  supportsTaskOutputCompression,
} from "@/lib/image-task-request";

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
