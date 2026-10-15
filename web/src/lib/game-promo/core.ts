export const DESIGNS = [
  { id: "hero", name: "主视觉", ratio: "16:9" },
  { id: "banner", name: "首页横幅", ratio: "21:9" },
  { id: "portrait-short", name: "短竖版", ratio: "3:4" },
  { id: "portrait-long", name: "长竖版", ratio: "3:4" },
  ...Array.from({ length: 5 }, (_, i) => ({ id: `carousel-${i + 1}`, name: `轮播图${i + 1}`, ratio: "16:9" })),
] as const;
export const SLOTS = [
  ["好友动态", 160, 90, "hero"], ["通用界面", 160, 90, "hero"],
  ["首页-轮播图", 1082, 300, "banner"], ["首页-排行榜", 96, 54, "hero"],
  ["首页-好友动态", 140, 160, "portrait-short"], ["首页-近期推荐", 140, 160, "portrait-short"],
  ["新品推荐", 140, 180, "portrait-long"], ["游戏列表", 140, 160, "portrait-short"],
  ["详情页-轮播图", 400, 225, "hero"], ["详情页-同类游戏", 140, 180, "portrait-long"],
  ["咨询首页-推荐游戏", 240, 135, "hero"],
  ...Array.from({ length: 5 }, (_, i) => [`轮播图${i + 1}`, 400, 225, `carousel-${i + 1}`] as const),
].map(([name, width, height, design], i) => ({ id: `slot-${i + 1}`, name: String(name), width: Number(width), height: Number(height), design: String(design) }));
export type Crop = { x: number; y: number; zoom: number };
export const DEFAULT_CROP: Crop = { x: 0.5, y: 0.5, zoom: 1 };
export function cropGeometry(sw: number, sh: number, tw: number, th: number, crop: Crop) {
  if ([sw, sh, tw, th].some((n) => !Number.isFinite(n) || n <= 0)) throw new Error("图片尺寸无效");
  const scale = Math.max(tw / sw, th / sh) * Math.min(4, Math.max(1, crop.zoom));
  const width = tw / scale, height = th / scale;
  return { x: (sw - width) * Math.min(1, Math.max(0, crop.x)), y: (sh - height) * Math.min(1, Math.max(0, crop.y)), width, height };
}
export type CopyDraft = { title: string; sellingPoint: string; carousel: Array<{ theme: string; copy: string }> };
export function parseDraft(text: string): CopyDraft {
  let value: unknown;
  try { value = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")); }
  catch { throw new Error("文案必须是 JSON，未收到可用的结构化文案；请重试或手动填写。"); }
  const input = value as Partial<CopyDraft> | null;
  if (!input || typeof input.title !== "string" || !input.title.trim() || typeof input.sellingPoint !== "string" || !input.sellingPoint.trim() ||
    !Array.isArray(input.carousel) || input.carousel.length !== 5 || input.carousel.some((c) => !c || typeof c.theme !== "string" || !c.theme.trim() || typeof c.copy !== "string" || !c.copy.trim()))
    throw new Error("文案需要标题、短卖点和五组非空的轮播主题/文案。");
  return { title: input.title.trim(), sellingPoint: input.sellingPoint.trim(), carousel: input.carousel.map((c) => ({ theme: c.theme.trim(), copy: c.copy.trim() })) };
}
export function activeStatus(status?: string) { return status === "submitting" || status === "queued" || status === "running"; }
export function shouldApplyTaskStatus(current: string, incoming: string) {
  if (current === "success" || current === "error" || current === "cancelled") return false;
  const progress: Record<string, number> = { submitting: 0, queued: 1, running: 2 };
  return !activeStatus(current) || !activeStatus(incoming) || progress[incoming] >= progress[current];
}
export function canApproveHero(version?: { status: string; source?: string }) { return version?.status === "success" && Boolean(version.source); }
export function canGenerateDesign(project: { copyConfirmed: boolean; heroApproved?: string }, design: string, hero?: { id: string; status: string; source?: string }) {
  return project.copyConfirmed && (design === "hero" || Boolean(canApproveHero(hero) && hero?.id === project.heroApproved));
}
export function taskImageOutcome(task: { status: string; error?: string; data?: Array<{ local_url?: string; url?: string; b64_json?: string; text_response?: string }> }, requiresImage: boolean) {
  const image = task.data?.find((d) => d.local_url || d.url || d.b64_json);
  const source = image?.local_url || image?.url || (image?.b64_json ? `data:image/png;base64,${image.b64_json}` : undefined);
  return { status: task.status === "success" && requiresImage && !source ? "error" : task.status, source,
    textResponse: task.data?.map((d) => d.text_response || "").join("\n"),
    error: task.error || (task.status === "success" && requiresImage && !source ? "任务仅返回文字，没有生成图片" : undefined) };
}
export function copyWithoutActiveTaskIDs<T extends { application?: { confirmed?: string; inspected?: string; copyVersions: Array<{ taskId?: string; status: string; error?: string }>; banners: Array<{ taskId?: string; status: string; error?: string }> }; batches?: unknown[]; copyTask?: { taskId?: string }; copyHistory?: Array<{ taskId?: string }>; versions: Record<string, Array<{ taskId?: string; status: string; error?: string }>> }>(project: T): T {
  const copy = structuredClone(project);
  copy.copyTask = undefined;
  copy.batches = undefined;
  copy.copyHistory?.forEach((v) => { v.taskId = undefined; });
  if (copy.application) {
    copy.application.confirmed = undefined; copy.application.inspected = undefined;
    [...copy.application.copyVersions, ...copy.application.banners].forEach((v) => {
      v.taskId = undefined;
      if (activeStatus(v.status)) { v.status = "cancelled"; v.error = "复制项目不继承活动任务"; }
    });
  }
  Object.values(copy.versions).forEach((versions) => versions.forEach((v) => {
    v.taskId = undefined;
    if (activeStatus(v.status)) { v.status = "cancelled"; v.error = "复制项目不继承活动任务"; }
  }));
  return copy;
}
export function safeName(name: string) { return name.replace(/[\\/:*?"<>|]/g, "-").slice(0, 80) || "游戏推广"; }
