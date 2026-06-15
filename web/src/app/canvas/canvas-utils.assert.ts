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
assert.equal(catalog.text.some((model) => model.id === "gpt-image-2"), false);

const emptyCatalog = normalizeModelCatalog([]);

assert.equal(emptyCatalog.image.some((model) => model.id === "gpt-image-2"), true);
assert.equal(emptyCatalog.text.some((model) => model.id === "gpt-5.5"), true);
