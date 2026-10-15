import { activePromoBatch, nextPromoBatchTarget, planPromoBatch, promoBatchFingerprint, promoBatchInputs, promoBatchProgress, promoProjectWorking, reconcilePromoBatch } from "./batch";
import { copyWithoutActiveTaskIDs } from "./core";
import type { PromoBatch, PromoProject, PromoVersion } from "@/store/game-promo-projects";

export function runPromoBatchAssertions() {
  let checks = 0;
  const assert = (condition: unknown, message: string) => { checks++; if (!condition) throw new Error(message); };
  const version = (id: string, status = "success"): PromoVersion => ({ id, taskId: id, status, source: status === "success" ? `/${id}.png` : undefined, prompt: "", createdAt: "2026-10-15T00:00:00Z" });
  const project: PromoProject = { id: "project", title: "游戏", facts: "已确认事实", activity: "", references: [],
    chatModel: "auto", imageModel: "gpt-image-2", draft: { title: "标题", sellingPoint: "卖点", carousel: Array.from({ length: 5 }, () => ({ theme: "主题", copy: "文案" })) },
    copyConfirmed: true, versions: { hero: [version("old-hero")], banner: [version("old-banner")] },
    selected: { hero: "old-hero", banner: "old-banner" }, heroApproved: "old-hero", crops: {}, updatedAt: "" };
  const makeBatch = (mode: PromoBatch["mode"]): PromoBatch => ({ id: "batch", mode, correction: "统一修改", fingerprint: promoBatchFingerprint(project),
    inputs: promoBatchInputs(project), targets: planPromoBatch(project, mode), heroVersionID: mode === "missing" ? "old-hero" : undefined,
    status: "running", createdAt: "" });
  const missing = makeBatch("missing"), regenerate = makeBatch("regenerate");
  assert(missing.targets.length === 7, "Missing mode must preserve both completed selections");
  assert(regenerate.targets.length === 9, "Regeneration must target all nine designs");
  assert(nextPromoBatchTarget(project, regenerate) === "hero", "Regeneration must start with a new hero");
  assert(nextPromoBatchTarget(project, missing) === "portrait-short", "Approved existing hero must unlock missing targets");
  const queuedProject = { ...project, versions: { ...project.versions, "portrait-short": [version("active", "queued")] } };
  assert(planPromoBatch(queuedProject, "missing").length === 6, "Missing planning must skip active designs");
  assert(promoProjectWorking(queuedProject), "Active individual tasks must be detected");
  const waiting = { ...project, heroApproved: undefined };
  assert(reconcilePromoBatch(waiting, missing).status === "awaiting-hero", "Existing hero must require explicit approval");
  assert(!nextPromoBatchTarget(waiting, missing), "No dependent before explicit approval");
  const claimed: PromoBatch = { ...regenerate, heroVersionID: "new-hero", targets: regenerate.targets.map((t) => t.design === "hero" ? { ...t, versionID: "new-hero" } : t) };
  const runningHero = { ...project, selected: { ...project.selected, hero: "new-hero" }, heroApproved: undefined, versions: { ...project.versions, hero: [...project.versions.hero, version("new-hero", "submitting")] } };
  assert(!nextPromoBatchTarget(runningHero, claimed), "Claimed uncertain hero must only be queried, never resubmitted");
  const successHero = { ...runningHero, versions: { ...runningHero.versions, hero: [...project.versions.hero, version("new-hero")] } };
  assert(reconcilePromoBatch(successHero, claimed).status === "awaiting-hero", "New hero success must not imply approval");
  const approved = { ...successHero, heroApproved: "new-hero" };
  assert(nextPromoBatchTarget(approved, claimed) === "banner", "Exact new hero approval must start dependents");
  assert(!nextPromoBatchTarget({ ...approved, selected: { ...approved.selected, hero: "old-hero" } }, claimed), "Old hero selection must not unlock batch");
  for (const status of ["error", "cancelled"]) {
    const failedHero = { ...runningHero, versions: { ...runningHero.versions, hero: [version("new-hero", status)] } };
    assert(reconcilePromoBatch(failedHero, claimed).status === "failed", "Failed or cancelled hero must stop dependents");
  }
  const dependentClaim = { ...claimed, targets: claimed.targets.map((t) => t.design === "banner" ? { ...t, versionID: "failed-banner" } : t) };
  const failedDependent = { ...approved, versions: { ...approved.versions, banner: [...project.versions.banner, version("failed-banner", "error")] } };
  assert(nextPromoBatchTarget(failedDependent, dependentClaim) === "portrait-short", "Failed dependent must not block other targets or retry itself");
  assert(promoBatchProgress(failedDependent, dependentClaim).failed === 1, "Failure progress must use associated batch versions");
  assert(!nextPromoBatchTarget(approved, { ...claimed, status: "stopped" }), "Stop must prevent future submissions");
  for (const changed of [{ title: "新名称" }, { facts: "新事实" }, { activity: "新活动" }, { chatModel: "other" }, { imageModel: "other" },
    { references: [{ id: "ref", name: "原图", source: "/original.png", purpose: "Logo" }] }, { draft: { ...project.draft, title: "新标题" } }, { settings: {} }]) {
    assert(reconcilePromoBatch({ ...project, ...changed }, missing).status === "stopped", "Every captured input change must invalidate scheduling");
  }
  assert(promoBatchFingerprint({ ...project, heroApproved: undefined, crops: { crop: { x: 0, y: 0, zoom: 1 } }, versions: {} }) === missing.fingerprint,
    "Version history, approval and crop changes must not alter captured input fingerprint");
  const completeBatch = { ...claimed, targets: claimed.targets.map((t) => ({ ...t, versionID: t.design === "hero" ? "new-hero" : `${t.design}-new` })) };
  const completeProject = { ...approved, versions: Object.fromEntries(completeBatch.targets.map((t) => [t.design, [version(t.versionID!)]])) };
  assert(reconcilePromoBatch(completeProject, completeBatch).status === "completed", "All successful associated versions must complete the batch");
  const allFailed = { ...completeProject, versions: { ...completeProject.versions, banner: [version("banner-new", "error")] } };
  assert(reconcilePromoBatch(allFailed, completeBatch).status === "failed", "Terminal dependent failure must remain visible");
  const clone = copyWithoutActiveTaskIDs({ ...queuedProject, batches: [claimed] });
  assert(!clone.batches && !promoProjectWorking(clone), "Cloning must remove batch authorization and active tasks");
  assert(!activePromoBatch(project), "Legacy projects without batch data must remain usable");
  assert(project.versions.hero.length === 1 && project.selected.hero === "old-hero", "Planning must not mutate old histories or selections");
  return { checks, status: "PASS" };
}
