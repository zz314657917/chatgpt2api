import { APPLICATION_FIELDS, applicationBannerPrompt, applicationConfirmation, applicationCopyPrompt, applicationData, applicationFingerprint, applicationInspection, applicationTXT, emptyApplication, parseApplicationCopy, validateApplicationBytes, validateApplicationCopy, validateApplicationText } from "./application";
import { copyWithoutActiveTaskIDs, DESIGNS, SLOTS } from "./core";
import { promoBatchFingerprint, promoProjectWorking } from "./batch";
import type { PromoProject } from "@/store/game-promo-projects";

export function runPromoApplicationAssertions() {
  let checks = 0;
  const assert = (condition: unknown, message: string) => { checks++; if (!condition) throw new Error(message); };
  const rejects = (operation: () => unknown, message: string) => { let failed = false; try { operation(); } catch { failed = true; } assert(failed, message); };
  const p: PromoProject = { id: "p", title: "English Game", facts: "探索海岛", activity: "已确认活动", references: [], chatModel: "auto", imageModel: "gpt-image-2",
    draft: { title: "", sellingPoint: "", carousel: [] }, copyConfirmed: false, versions: {}, selected: {}, crops: {}, updatedAt: "" };
  assert(applicationData(p).copyVersions.length === 0, "Old projects must have empty application data");
  assert(DESIGNS.length === 9 && SLOTS.length === 16, "Original nine designs and sixteen slots must remain intact");
  assert(APPLICATION_FIELDS.length === 4, "Application must have three required and one optional field");
  const a = emptyApplication();
  a.draft = { weeklyActivity: "未提供", features: "探索海岛", weeklyUpdate: "未提供", other: "" };
  a.headline = "海岛探索"; a.subtitle = "展示游戏特色";
  const withApplication = { ...p, application: a };
  validateApplicationCopy(a.draft); checks++;
  assert(parseApplicationCopy(JSON.stringify(a.draft)).other === "", "Optional field can remain blank");
  rejects(() => parseApplicationCopy("bad model response"), "Malformed model JSON must fail");
  rejects(() => parseApplicationCopy("{}"), "Incomplete JSON must fail");
  rejects(() => validateApplicationCopy({ ...a.draft, features: "" }), "Required output cannot be empty");
  rejects(() => validateApplicationText("English", "副标题"), "English headline must fail");
  rejects(() => validateApplicationText("标题", "Logo"), "English subtitle must fail");
  rejects(() => validateApplicationText("", ""), "Blank headline must fail");
  validateApplicationBytes(10_000_000); checks++;
  rejects(() => validateApplicationBytes(10_000_001), "Byte cap is exact decimal ten million");
  const confirmed = applicationConfirmation(withApplication);
  assert(confirmed !== applicationConfirmation({ ...withApplication, facts: "修改事实" }), "Shared facts invalidate confirmation");
  assert(confirmed !== applicationConfirmation({ ...withApplication, references: [{ id: "r", name: "ref", purpose: "", source: "data:x" }] }), "Reference edits invalidate confirmation");
  assert(applicationFingerprint(withApplication) !== applicationFingerprint({ ...withApplication, application: { ...a, draft: { ...a.draft, features: "人工编辑" } } }), "Late copy must detect edited draft");
  assert(promoBatchFingerprint(withApplication) === promoBatchFingerprint({ ...withApplication, application: { ...a, headline: "改变申请" } }), "Application edits must not change original batch inputs");
  const bannerPrompt = applicationBannerPrompt(withApplication, { heightPercent: 64 });
  assert(bannerPrompt.includes("1082×300") && bannerPrompt.includes("禁止任何英文字母") && bannerPrompt.includes("中央安全区高度为64%") && bannerPrompt.includes("英文Logo"), "Banner prompt must enforce crop safety and Chinese-only image");
  assert(applicationCopyPrompt(withApplication).includes("对应输入为空时必须原样输出“未提供”"), "Weekly missing facts must be explicit");
  assert(applicationTXT(a).includes("展示周更新内容\n未提供"), "TXT must include all named fields");
  const v = { id: "v", taskId: "v", status: "running", prompt: "snapshot", fingerprint: "", createdAt: "" };
  const active = { ...withApplication, application: { ...a, banners: [v], selected: v.id, confirmed, inspected: "old" } };
  assert(promoProjectWorking(active), "Application work must block original project submissions");
  const copied = copyWithoutActiveTaskIDs(active);
  assert(copied.application?.banners[0].taskId === undefined && copied.application.banners[0].status === "cancelled", "Clone must clear task IDs and active statuses");
  assert(!copied.application?.confirmed && !copied.application?.inspected, "Clone must clear application authority");
  assert(applicationInspection(active.application) !== applicationInspection({ ...active.application, crop: { x: .2, y: .5, zoom: 1 } }), "Crop change invalidates inspection");
  assert(applicationInspection(active.application) !== applicationInspection({ ...active.application, selected: "other" }), "Version selection invalidates inspection");
  assert(active.application.banners[0].taskId === "v", "Clone cleanup must preserve original");
  return { checks };
}
