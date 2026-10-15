import { activeStatus, canApproveHero, DESIGNS } from "./core";
import type { PromoBatch, PromoProject } from "@/store/game-promo-projects";
import { applicationWorking } from "./application";

export function promoBatchInputs(project: PromoProject): PromoBatch["inputs"] {
  const { title, facts, activity, references, chatModel, imageModel, settings, draft } = project;
  return structuredClone({ title, facts, activity, references, chatModel, imageModel, settings, draft });
}
export function promoBatchFingerprint(project: PromoProject) { return JSON.stringify(promoBatchInputs(project)); }
export function activePromoBatch(project: PromoProject) {
  return project.batches?.find((batch) => batch.status === "running" || batch.status === "awaiting-hero");
}
export function promoProjectWorking(project: PromoProject) {
  return applicationWorking(project) || activeStatus(project.copyTask?.status) || Object.values(project.versions).some((versions) => versions.some((v) => activeStatus(v.status)));
}
export function planPromoBatch(project: PromoProject, mode: PromoBatch["mode"]) {
  return DESIGNS.filter((d) => mode === "regenerate" || !project.versions[d.id]?.some((v) => activeStatus(v.status)) &&
    !canApproveHero(project.versions[d.id]?.find((v) => v.id === project.selected[d.id]))).map((d) => ({ design: d.id }));
}
export function promoBatchProgress(project: PromoProject, batch: PromoBatch) {
  const versions = batch.targets.map((t) => project.versions[t.design]?.find((v) => v.id === t.versionID));
  return { completed: versions.filter((v) => canApproveHero(v)).length,
    failed: versions.filter((v) => v?.status === "error" || v?.status === "cancelled").length,
    active: versions.filter((v) => activeStatus(v?.status)).length, total: batch.targets.length };
}
export function reconcilePromoBatch(project: PromoProject, batch: PromoBatch): PromoBatch {
  if (batch.status !== "running" && batch.status !== "awaiting-hero") return batch;
  if (!project.copyConfirmed || promoBatchFingerprint(project) !== batch.fingerprint)
    return { ...batch, status: "stopped", error: "资料、文案、模型、设置或参考图已改变，已停止后续提交；已提交任务继续运行。" };
  const hero = project.versions.hero?.find((v) => v.id === batch.heroVersionID);
  if (hero?.status === "error" || hero?.status === "cancelled")
    return { ...batch, status: "failed", error: "本批主图失败或已取消，未提交后续设计；请手动重新开始。" };
  if (!hero || activeStatus(hero.status)) return { ...batch, status: "running" };
  if (!canApproveHero(hero) || project.heroApproved !== hero.id || project.selected.hero !== hero.id)
    return { ...batch, status: "awaiting-hero" };
  const progress = promoBatchProgress(project, batch);
  if (batch.targets.every((t) => t.versionID) && !progress.active)
    return { ...batch, status: progress.failed ? "failed" : "completed",
      error: progress.failed ? `${progress.failed} 张设计失败或取消；其余目标已处理，可在卡片中手动重试。` : undefined };
  return { ...batch, status: "running" };
}
export function nextPromoBatchTarget(project: PromoProject, batch: PromoBatch) {
  const next = reconcilePromoBatch(project, batch);
  if (next.status !== "running") return;
  const heroTarget = next.targets.find((t) => t.design === "hero");
  if (heroTarget && !heroTarget.versionID) return "hero";
  const hero = project.versions.hero?.find((v) => v.id === next.heroVersionID);
  if (!canApproveHero(hero) || project.heroApproved !== hero?.id || project.selected.hero !== hero?.id) return;
  return next.targets.find((t) => !t.versionID)?.design;
}
