import assert from "node:assert/strict";

import {
  CUSTOM_IMAGE_ASPECT_RATIO,
  buildCustomImageSize,
  buildImageSize,
  calculateImageSize,
  getImageSizeSelectionFromSize,
  isHighResolutionImageSize,
  isImageOutputFormat,
  isImageQuality,
  normalizeImageOutputFormat,
  normalizeImageResolutionPreset,
  normalizePixelIconSizeAlias,
  parseImageRatio,
  supportsImageOutputCompression,
  type ImageSizeSelection,
} from "@/lib/image-parameters";

function ratioSelection(overrides: Partial<ImageSizeSelection> = {}): ImageSizeSelection {
  return {
    mode: "ratio",
    aspectRatio: "16:9",
    resolution: "2k",
    customRatio: "2.39:1",
    customWidth: "1024",
    customHeight: "1024",
    ...overrides,
  };
}

assert.deepEqual(parseImageRatio("2.39:1"), { width: 2.39, height: 1 });
assert.equal(calculateImageSize("1080p", "16:9"), "1920x1088");
assert.equal(calculateImageSize("2k", "2.39:1"), "2048x864");
assert.equal(calculateImageSize("4k", "21:9"), "3840x1648");
assert.equal(calculateImageSize("4k", "10:1"), "1408x480");
assert.equal(buildCustomImageSize("999", "777"), "992x784");
assert.equal(
  buildImageSize(ratioSelection({ aspectRatio: CUSTOM_IMAGE_ASPECT_RATIO })),
  "2048x864",
);
assert.equal(
  buildImageSize(ratioSelection({ aspectRatio: CUSTOM_IMAGE_ASPECT_RATIO, customRatio: "invalid" })),
  "",
);
assert.equal(buildImageSize(ratioSelection({ aspectRatio: "", resolution: "4k" })), "2880x2880");
assert.equal(buildImageSize(ratioSelection({ aspectRatio: "64x64", resolution: "4k" })), "64x64");
assert.equal(buildImageSize(ratioSelection({ aspectRatio: "128x128", resolution: "4k" })), "128x128");
assert.equal(normalizePixelIconSizeAlias("16:16"), "16x16");
assert.equal(normalizePixelIconSizeAlias("64x64"), "64x64");
assert.equal(normalizePixelIconSizeAlias("128:128"), "128x128");
assert.equal(normalizeImageResolutionPreset("1k"), "1080p");
assert.equal(normalizeImageResolutionPreset("1080p"), "1080p");
assert.equal(normalizeImageResolutionPreset("2K"), "2k");
assert.equal(normalizeImageResolutionPreset("4k"), "4k");
assert.equal(normalizeImageResolutionPreset("auto"), "");
assert.equal(normalizeImageOutputFormat(""), "png");
assert.equal(normalizeImageOutputFormat("jpg"), "jpeg");
assert.equal(normalizeImageOutputFormat("jpeg"), "jpeg");
assert.equal(normalizeImageOutputFormat("webp"), "webp");
assert.equal(normalizeImageOutputFormat("bad"), "png");
assert.equal(isImageQuality("high"), true);
assert.equal(isImageQuality("auto"), false);
assert.equal(isImageOutputFormat("jpeg"), true);
assert.equal(isImageOutputFormat("jpg"), false);
assert.equal(supportsImageOutputCompression("jpeg"), true);
assert.equal(supportsImageOutputCompression("png"), false);
assert.equal(supportsImageOutputCompression("webp"), false);
assert.equal(isHighResolutionImageSize("1088x1088"), false);
assert.equal(isHighResolutionImageSize("2048x2048"), true);
assert.equal(isHighResolutionImageSize("8x8"), false);
assert.equal(getImageSizeSelectionFromSize("8x8").mode, "custom");
assert.deepEqual(getImageSizeSelectionFromSize("64:64"), {
  mode: "ratio",
  aspectRatio: "64x64",
  resolution: "auto",
  customRatio: "16:9",
  customWidth: "64",
  customHeight: "64",
});
assert.deepEqual(getImageSizeSelectionFromSize("128:128"), {
  mode: "ratio",
  aspectRatio: "128x128",
  resolution: "auto",
  customRatio: "16:9",
  customWidth: "128",
  customHeight: "128",
});
assert.deepEqual(getImageSizeSelectionFromSize("2.39:1"), {
  mode: "ratio",
  aspectRatio: CUSTOM_IMAGE_ASPECT_RATIO,
  resolution: "auto",
  customRatio: "2.39:1",
  customWidth: "1024",
  customHeight: "1024",
});
