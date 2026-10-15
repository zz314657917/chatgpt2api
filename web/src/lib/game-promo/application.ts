import { DEFAULT_CROP, activeStatus, type Crop } from "./core";
import type { PromoProject, PromoVersion } from "@/store/game-promo-projects";

export const APPLICATION_FIELDS = [
  ["weeklyActivity", "展示周内外联动或活动情况"],
  ["features", "模组/网络游戏特色情况"],
  ["weeklyUpdate", "展示周更新内容"],
  ["other", "其他申请情况说明（选填）"],
] as const;
export type ApplicationCopy = Record<typeof APPLICATION_FIELDS[number][0], string>;
export type ApplicationVersion = PromoVersion & { fingerprint: string; resultFingerprint?: string; inputsSnapshot?: ApplicationCopy };
export type PromoApplication = {
  inputs: ApplicationCopy; draft: ApplicationCopy; headline: string; subtitle: string;
  confirmed?: string; copyVersions: ApplicationVersion[]; copySelected?: string;
  banners: ApplicationVersion[]; selected?: string; crop: Crop; inspected?: string;
};
export function emptyApplication(): PromoApplication {
  const fields = { weeklyActivity: "", features: "", weeklyUpdate: "", other: "" };
  return { inputs: { ...fields }, draft: { ...fields }, headline: "", subtitle: "", copyVersions: [], banners: [], crop: { ...DEFAULT_CROP } };
}
export function applicationData(p: PromoProject) { return p.application || emptyApplication(); }
export function applicationConfirmation(p: PromoProject) {
  const a = applicationData(p);
  return JSON.stringify([p.title, p.facts, p.activity, p.references, a.inputs, a.draft]);
}
export function applicationFingerprint(p: PromoProject) {
  const a = applicationData(p);
  return JSON.stringify([applicationConfirmation(p), p.references, p.chatModel, p.imageModel, p.settings, a.headline, a.subtitle, a.confirmed]);
}
export function applicationInspection(a: PromoApplication) { return JSON.stringify([a.selected, a.banners.find((v) => v.id === a.selected)?.source, a.crop]); }
export function applicationWorking(p: PromoProject) {
  const a = applicationData(p);
  return [...a.copyVersions, ...a.banners].some((v) => activeStatus(v.status));
}
export function parseApplicationCopy(text: string): ApplicationCopy {
  let value: unknown;
  try { value = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")); }
  catch { throw new Error("申请文案不是有效 JSON，原始返回已保留，请手动修改或重试"); }
  if (!value || typeof value !== "object" || APPLICATION_FIELDS.some(([key]) => typeof (value as Record<string, unknown>)[key] !== "string"))
    throw new Error("申请文案需要四个字符串字段，原始返回已保留");
  const v = value as ApplicationCopy;
  return { weeklyActivity: v.weeklyActivity.trim(), features: v.features.trim(), weeklyUpdate: v.weeklyUpdate.trim(), other: v.other.trim() };
}
export function validateApplicationCopy(draft: ApplicationCopy) {
  if (APPLICATION_FIELDS.slice(0, 3).some(([key]) => !draft[key].trim())) throw new Error("请填写三项申请文案；缺少事实时明确填写“未提供”");
}
export function validateApplicationText(headline: string, subtitle: string) {
  if (!headline.trim()) throw new Error("请填写简体中文轮播图标题");
  if (/[a-z]/i.test(headline + subtitle)) throw new Error("申请轮播标题和副标题不能包含英文字母，请删除或替换英文游戏名");
  if (headline.length > 28 || subtitle.length > 60) throw new Error("轮播标题最多28字，副标题最多60字");
}
export function validateApplicationBytes(bytes: number) {
  if (bytes > 10_000_000) throw new Error(`图片实际 ${bytes.toLocaleString()} 字节，超过 10,000,000 字节，无法导出`);
}
export function applicationCopyPrompt(p: PromoProject) {
  const a = applicationData(p);
  return `仅根据用户明确提供的事实生成简体中文申请文案。截图字段只是填写参考，不是资格或审批依据。不得宣称符合资格或获得批准。不要根据参考图推断事实。不得编造玩法、事件、奖励、日期、指标、联动。
游戏名称：${p.title}
可信游戏事实：${p.facts}
已有活动信息：${p.activity}
本次申请明确输入：${JSON.stringify(a.inputs)}
展示周活动和更新仅使用本次对应字段的具体事实；对应输入为空时必须原样输出“未提供”，不得用已有活动或其他字段补写。特色仅据明确事实；未提供时写“未提供”。其他说明无输入时留空。
严格输出JSON四个字符串字段：{"weeklyActivity":"展示周内外联动或活动情况","features":"模组/网络游戏特色情况","weeklyUpdate":"展示周更新内容","other":"其他申请情况说明"}。`;
}
export function applicationBannerPrompt(p: PromoProject, safety: { heightPercent: number }) {
  const a = applicationData(p);
  validateApplicationText(a.headline, a.subtitle);
  return `制作独立的游戏申请轮播图，最终精确裁剪为1082×300。AI直接绘制文字，不要解释。
可信事实：${p.facts}；活动：${p.activity}。已确认申请文案：${JSON.stringify(a.draft)}
图片实际绘制的标题仅为：${a.headline}。副标题仅为：${a.subtitle || "无"}。
仅允许简体中文；禁止任何英文字母、英文单词、英文Logo、英文水印。游戏名“${p.title}”仅作理解背景，若含英文必须省略或替换为中文，禁止照抄英文。参考图中的英文名称、Logo、标识和水印一律删除或替换成中文；不要复刻英文。不得把上下文中的英文或JSON字段名绘制到图中。
参考图用途：${p.references.map((r, i) => `${i + 1}. ${r.name}：${r.purpose || "仅视觉参考，不推断事实"}`).join("\n")}
模型画幅裁剪后中央安全区高度为${safety.heightPercent}%，主体和全部中文文字集中在中央${Math.max(10, safety.heightPercent - 8)}%高度内，边缘留裁剪余量，不拉伸。禁止编造事实。`;
}
export function applicationTXT(a: PromoApplication) { return APPLICATION_FIELDS.map(([key, label]) => `${label}\n${a.draft[key] || "未提供"}`).join("\n\n"); }
