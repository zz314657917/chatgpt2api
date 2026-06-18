import assert from "node:assert/strict";

import { normalizeModelCatalog } from "@/app/canvas/canvas-utils";
import type { CanvasModelOption } from "@/lib/api";

const catalog = normalizeModelCatalog([
  { id: "gpt-5.5", name: "gpt-5.5", kind: "both", capabilities: ["chat", "image"], enabled: true },
  { id: "gpt-image-2", name: "gpt-image-2", kind: "image", capabilities: ["image"], enabled: true },
]);

assert.equal(catalog.image.some((model) => model.id === "gpt-5.5"), false);
assert.equal(catalog.image.some((model) => model.id === "gpt-image-2"), true);
assert.equal(catalog.image.some((model) => model.id === "gpt-image-2-official"), true);
assert.equal(catalog.text.some((model) => model.id === "auto"), true);
assert.equal(catalog.text.some((model) => model.id === "gpt-5.5"), true);
assert.equal(catalog.text.some((model) => model.id === "gpt-5.4"), true);
assert.equal(catalog.text.some((model) => model.id === "gpt-5.4-mini"), true);
assert.equal(catalog.text.some((model) => model.id === "gpt-image-2"), false);

const emptyCatalog = normalizeModelCatalog([]);

assert.equal(emptyCatalog.image.some((model) => model.id === "gpt-image-2"), true);
assert.equal(emptyCatalog.text.some((model) => model.id === "gpt-5.5"), true);

const groupedCatalog = normalizeModelCatalog([
  { id: "shared-model", name: "Shared Chat", kind: "text", capabilities: ["chat"], group_modes: ["chat"], enabled: true },
  { id: "shared-model", name: "Shared Image", kind: "image", capabilities: ["image"], group_modes: ["image"], enabled: true },
  { id: "custom-renderer", name: "Custom Renderer", kind: "image", capabilities: ["image"], group_modes: ["image"], enabled: true },
  { id: "glm-4.7", name: "glm-4.7", kind: "image", capabilities: ["image"], group_modes: ["image"], enabled: true },
  { id: "gpt-4.1", name: "gpt-4.1", kind: "image", capabilities: ["image"], group_modes: ["image"], enabled: true },
  { id: "shared-model", name: "Shared Video", kind: "video", capabilities: ["video"], group_modes: ["video"], enabled: true },
]);

assert.equal(groupedCatalog.text.some((model) => model.id === "shared-model" && model.name === "Shared Chat"), true);
assert.equal(groupedCatalog.image.some((model) => model.id === "shared-model" && model.name === "Shared Image"), true);
assert.equal(groupedCatalog.image.some((model) => model.id === "custom-renderer"), true);
assert.equal(groupedCatalog.image.some((model) => model.id === "glm-4.7"), false);
assert.equal(groupedCatalog.image.some((model) => model.id === "gpt-4.1"), false);
assert.equal(groupedCatalog.video.some((model) => model.id === "shared-model" && model.name === "Shared Video"), true);
