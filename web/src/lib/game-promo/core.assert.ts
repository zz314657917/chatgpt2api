import assert from "node:assert/strict";
import { DESIGNS, SLOTS, DEFAULT_CROP, cropGeometry, parseDraft, activeStatus, canGenerateDesign, taskImageOutcome, copyWithoutActiveTaskIDs, shouldApplyTaskStatus } from "./core";
import { promoModelParameters, promoSafetyArea } from "./model-parameters";
import { buildZipBlob } from "../zip";

assert.equal(DESIGNS.length, 9);
assert.equal(SLOTS.length, 16);
assert.equal(new Set(SLOTS.map((s) => `${s.width}x${s.height}`)).size, 7);
assert.equal(new Set(SLOTS.map((s) => s.id)).size, 16);
assert.deepEqual(SLOTS.map((s) => [s.name, s.width, s.height, s.design]), [
  ["好友动态", 160, 90, "hero"], ["通用界面", 160, 90, "hero"], ["首页-轮播图", 1082, 300, "banner"],
  ["首页-排行榜", 96, 54, "hero"], ["首页-好友动态", 140, 160, "portrait-short"], ["首页-近期推荐", 140, 160, "portrait-short"],
  ["新品推荐", 140, 180, "portrait-long"], ["游戏列表", 140, 160, "portrait-short"], ["详情页-轮播图", 400, 225, "hero"],
  ["详情页-同类游戏", 140, 180, "portrait-long"], ["咨询首页-推荐游戏", 240, 135, "hero"],
  ...Array.from({ length: 5 }, (_, i) => [`轮播图${i + 1}`, 400, 225, `carousel-${i + 1}`]),
]);
for (const slot of SLOTS) {
  for (const crop of [DEFAULT_CROP, { x: 0, y: 1, zoom: 2 }, { x: 1, y: 0, zoom: 4 }]) {
    const rect = cropGeometry(2048, 1152, slot.width, slot.height, crop);
    assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= 2048 + 1e-8 && rect.y + rect.height <= 1152 + 1e-8);
    assert.ok(Math.abs(rect.width / rect.height - slot.width / slot.height) < 1e-8);
  }
}
assert.deepEqual(cropGeometry(1600, 900, 160, 90, DEFAULT_CROP), { x: 0, y: 0, width: 1600, height: 900 });
assert.throws(() => cropGeometry(0, 900, 160, 90, DEFAULT_CROP));
const draft = { title: "游戏", sellingPoint: "已确认的卖点", carousel: Array.from({ length: 5 }, (_, i) => ({ theme: `主题${i}`, copy: "文字" })) };
assert.deepEqual(parseDraft("```json\n" + JSON.stringify(draft) + "\n```"), draft);
assert.throws(() => parseDraft("普通文字"));
assert.throws(() => parseDraft(JSON.stringify({ ...draft, carousel: draft.carousel.slice(1) })));
assert.throws(() => parseDraft(JSON.stringify({ ...draft, title: "" })));
assert.equal(activeStatus("submitting"), true);
assert.equal(activeStatus("success"), false);
for (const terminal of ["success", "error", "cancelled"]) {
  for (const incoming of ["submitting", "queued", "running", "success", "error", "cancelled"]) {
    assert.equal(shouldApplyTaskStatus(terminal, incoming), false);
  }
}
assert.equal(shouldApplyTaskStatus("queued", "success"), true);
assert.equal(shouldApplyTaskStatus("submitting", "success"), true);
assert.equal(shouldApplyTaskStatus("running", "queued"), false);
assert.equal(shouldApplyTaskStatus("queued", "running"), true);
let copyStatus = "submitting", applicationCount = 0;
for (const incoming of ["success", "queued", "running", "success"]) {
  if (shouldApplyTaskStatus(copyStatus, incoming)) {
    copyStatus = incoming;
    if (incoming === "success") applicationCount++;
  }
}
assert.equal(copyStatus, "success");
assert.equal(applicationCount, 1);
const hero = { id: "hero-v1", status: "success", source: "/images/test.png" };
assert.equal(canGenerateDesign({ copyConfirmed: false }, "hero", hero), false);
assert.equal(canGenerateDesign({ copyConfirmed: true }, "hero"), true);
assert.equal(canGenerateDesign({ copyConfirmed: true, heroApproved: "old" }, "banner", hero), false);
assert.equal(canGenerateDesign({ copyConfirmed: true, heroApproved: hero.id }, "banner", hero), true);
assert.equal(taskImageOutcome({ status: "success", data: [{ text_response: "无法生成" }] }, true).status, "error");
assert.equal(taskImageOutcome({ status: "cancelled" }, true).status, "cancelled");
assert.equal(taskImageOutcome({ status: "success", data: [{ local_url: "/images/test.png" }] }, true).source, "/images/test.png");
const original = { copyTask: { taskId: "copy" }, versions: { hero: [{ taskId: "done", status: "success" }, { taskId: "active", status: "running" }] } };
const copied = copyWithoutActiveTaskIDs(original);
assert.equal(copied.copyTask, undefined);
assert.equal(copied.versions.hero[0].status, "success");
assert.equal(copied.versions.hero[1].status, "cancelled");
assert.ok(copied.versions.hero.every((v) => !v.taskId));
assert.equal(original.versions.hero[1].taskId, "active");
assert.equal(promoModelParameters("grok-imagine-image-2.0", "21:9", true).size, "16:9");
assert.equal(promoModelParameters("grok-imagine-image-2.0", "16:9", true).quality, undefined);
assert.equal(promoModelParameters("grok-imagine-image-2.0", "16:9", false).quality, "medium");
assert.equal(promoSafetyArea("grok-imagine-image-2.0", "21:9", 1082, 300).heightPercent, 49);
assert.equal(promoSafetyArea("gpt-image-2-official", "21:9", 1082, 300).heightPercent, 64);
for (const model of ["doubao-seedance-4-0", "doubao-seedance-4-5", "seedream-5-0-lite", "seedream-5-0-pro", "gpt-image-2-official", "gpt-image-2.5-flare"]) {
  assert.equal(promoModelParameters(model, "3:4", true).size, "3:4");
  assert.equal(promoModelParameters(model, "16:9", true).imageResolution, "2k");
}
const zip = await buildZipBlob(SLOTS.map((s) => ({ name: `${s.id}-${s.name}.png`, blob: new Blob(["fixture"]) })));
const bytes = new Uint8Array(await zip.arrayBuffer());
const end = new DataView(bytes.buffer, bytes.byteLength - 22);
assert.equal(end.getUint32(0, true), 0x06054b50);
assert.equal(end.getUint16(10, true), 16);
console.log("PASS: game-promo mapping, crop geometry, draft parser, lifecycle, model parameters, ZIP16");
