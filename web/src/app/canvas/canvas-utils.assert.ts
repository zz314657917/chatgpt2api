import assert from "node:assert/strict";

import { createVideoItem, creationTasksToVideoAssets, normalizeModelCatalog } from "@/app/canvas/canvas-utils";
import type { CanvasModelOption, CreationTask } from "@/lib/api";

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
assert.equal(emptyCatalog.image.some((model) => model.id === "doubao-seedance-4-0"), true);
assert.equal(emptyCatalog.image.some((model) => model.id === "doubao-seedance-4-5"), true);
assert.equal(emptyCatalog.text.some((model) => model.id === "gpt-5.5"), true);

const groupedCatalog = normalizeModelCatalog([
  { id: "shared-model", name: "Shared Chat", kind: "text", capabilities: ["chat"], group_modes: ["chat"], enabled: true },
  { id: "shared-model", name: "Shared Image", kind: "image", capabilities: ["image"], group_modes: ["image"], enabled: true },
  { id: "custom-renderer", name: "Custom Renderer", kind: "image", capabilities: ["image"], group_modes: ["image"], enabled: true },
  { id: "glm-4.7", name: "glm-4.7", kind: "image", capabilities: ["image"], group_modes: ["image"], enabled: true },
  { id: "gpt-4.1", name: "gpt-4.1", kind: "image", capabilities: ["image"], group_modes: ["image"], enabled: true },
  { id: "grok-imagine-1.5-apimart", name: "grok-imagine-1.5-apimart", kind: "image", capabilities: ["image"], group_modes: ["image"], enabled: true },
  { id: "grok-imagine-1.5-edit-apimart", name: "grok-imagine-1.5-edit-apimart", kind: "image", capabilities: ["image"], group_modes: ["image"], enabled: true },
  { id: "shared-model", name: "Shared Video", kind: "video", capabilities: ["video"], group_modes: ["video"], enabled: true },
]);

assert.equal(groupedCatalog.text.some((model) => model.id === "shared-model" && model.name === "Shared Chat"), true);
assert.equal(groupedCatalog.image.some((model) => model.id === "shared-model" && model.name === "Shared Image"), true);
assert.equal(groupedCatalog.image.some((model) => model.id === "custom-renderer"), true);
assert.equal(groupedCatalog.image.some((model) => model.id === "glm-4.7"), false);
assert.equal(groupedCatalog.image.some((model) => model.id === "gpt-4.1"), false);
assert.equal(groupedCatalog.image.some((model) => model.id === "grok-imagine-1.5-apimart"), false);
assert.equal(groupedCatalog.image.some((model) => model.id === "grok-imagine-1.5-edit-apimart"), false);
assert.equal(groupedCatalog.video.some((model) => model.id === "shared-model" && model.name === "Shared Video"), true);

const videoAssets = creationTasksToVideoAssets([
  {
    id: "video-task-1",
    status: "success",
    mode: "video",
    model: "doubao-seedance-2.0",
    created_at: "2026-06-24 10:00:00",
    updated_at: "2026-06-24 10:01:00",
    data: [{ video_url: "https://example.test/video.mp4", local_url: "/api/video.mp4", revised_prompt: "结果视频" }],
  },
  {
    id: "image-task-1",
    status: "success",
    mode: "generate",
    created_at: "2026-06-24 10:00:00",
    updated_at: "2026-06-24 10:01:00",
    data: [{ url: "https://example.test/image.png" }],
  },
  {
    id: "video-task-2",
    status: "error",
    mode: "video",
    created_at: "2026-06-24 10:00:00",
    updated_at: "2026-06-24 10:01:00",
    data: [{ video_url: "https://example.test/failed.mp4" }],
  },
] satisfies CreationTask[]);

assert.equal(videoAssets.length, 1);
assert.equal(videoAssets[0].task_id, "video-task-1");
assert.equal(videoAssets[0].local_url, "/api/video.mp4");
assert.equal(videoAssets[0].name, "结果视频");

const videoItem = createVideoItem(videoAssets[0], { x: 10, y: 20 });

assert.equal(videoItem.type, "result");
assert.equal(videoItem.data?.output?.videos?.[0]?.local_url, "/api/video.mp4");
assert.equal(videoItem.data?.output?.images?.length || 0, 0);
