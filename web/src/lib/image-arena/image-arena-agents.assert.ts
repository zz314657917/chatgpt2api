import assert from "node:assert/strict";

import type { ImageModel } from "@/lib/api";

import {
  defaultImageArenaAgentSlots,
  hasImageArenaFamilyConflict,
  imageArenaAgentOptions,
  sanitizeImageArenaAgentSlots,
} from "./image-arena-agents";

const imageOptions = [
  { value: "gpt-image-2" as ImageModel, label: "gpt-image-2" },
  { value: "gpt-image-2-official" as ImageModel, label: "gpt-image-2-official" },
  { value: "gemini-3.1-flash-image-preview" as ImageModel, label: "gemini-3.1-flash-image-preview" },
  { value: "gemini-3-pro-image-preview" as ImageModel, label: "gemini-3-pro-image-preview" },
  { value: "doubao-seedance-4-0" as ImageModel, label: "doubao-seedance-4-0" },
  { value: "doubao-seedance-4-5" as ImageModel, label: "doubao-seedance-4-5" },
  { value: "seedream-5-0-lite" as ImageModel, label: "seedream-5-0-lite" },
  { value: "seedream-5-0-pro" as ImageModel, label: "seedream-5-0-pro" },
];

const chatOptions = [
  { value: "gpt-5.4" as ImageModel, label: "gpt-5.4" },
  { value: "gpt-5.4-mini" as ImageModel, label: "gpt-5.4-mini" },
  { value: "gpt-5.5" as ImageModel, label: "gpt-5.5" },
];

const imageAgentOptions = imageArenaAgentOptions("image", imageOptions);
assert.equal(
  imageAgentOptions.find((option) => option.value === "gpt-image-2")?.familyId,
  imageAgentOptions.find((option) => option.value === "gpt-image-2-official")?.familyId,
);
assert.notEqual(
  imageAgentOptions.find((option) => option.value === "gpt-image-2-official")?.familyId,
  imageAgentOptions.find((option) => option.value === "gemini-3.1-flash-image-preview")?.familyId,
);
assert.equal(
  imageAgentOptions.find((option) => option.value === "doubao-seedance-4-0")?.familyId,
  imageAgentOptions.find((option) => option.value === "doubao-seedance-4-5")?.familyId,
);
assert.notEqual(
  imageAgentOptions.find((option) => option.value === "seedream-5-0-lite")?.familyId,
  imageAgentOptions.find((option) => option.value === "seedream-5-0-pro")?.familyId,
);

const defaultImageSlots = defaultImageArenaAgentSlots("image", imageOptions);
assert.deepEqual(defaultImageSlots.map((slot) => slot.model), ["gpt-image-2-official", "gemini-3.1-flash-image-preview"]);
assert.equal(hasImageArenaFamilyConflict(defaultImageSlots), false);

const sanitizedImageSlots = sanitizeImageArenaAgentSlots({
  mode: "image",
  options: imageOptions,
  slots: [
    { model: "gpt-image-2" as ImageModel },
    { model: "gpt-image-2-official" as ImageModel },
    { model: "gemini-3-pro-image-preview" as ImageModel, geminiProSettings: { inputImageMask: "https://cdn.example/mask.png" } },
  ],
});
assert.deepEqual(sanitizedImageSlots.map((slot) => slot.model), ["gpt-image-2", "gemini-3-pro-image-preview"]);
assert.equal(sanitizedImageSlots[1]?.geminiProSettings?.inputImageMask, "https://cdn.example/mask.png");
assert.equal(sanitizedImageSlots[1]?.imageModelSettings?.geminiPro?.inputImageMask, "https://cdn.example/mask.png");

const sanitizedSeedreamSlots = sanitizeImageArenaAgentSlots({
  mode: "image",
  options: imageOptions,
  slots: [{
    model: "seedream-5-0-lite" as ImageModel,
    imageModelSettings: {
      seedream: { nsfwCheck: true, watermark: false, sequentialImageGeneration: "auto", sequentialMaxImages: 12 },
    },
  }],
});
assert.equal(sanitizedSeedreamSlots[0]?.imageModelSettings?.seedream?.nsfwCheck, true);
assert.equal(sanitizedSeedreamSlots[0]?.imageModelSettings?.seedream?.watermark, false);
assert.equal(sanitizedSeedreamSlots[0]?.imageModelSettings?.seedream?.sequentialMaxImages, 12);

const defaultChatSlots = defaultImageArenaAgentSlots("chat", chatOptions);
assert.deepEqual(defaultChatSlots.map((slot) => slot.model), ["gpt-5.4", "gpt-5.5"]);
assert.equal(hasImageArenaFamilyConflict(defaultChatSlots), false);
