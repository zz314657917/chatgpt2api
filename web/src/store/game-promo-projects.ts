import localforage from "localforage";
import { getCachedAuthSession, getVerifiedAuthSession } from "@/lib/session";
import { copyWithoutActiveTaskIDs, type CopyDraft, type Crop } from "@/lib/game-promo/core";
import type { ImageModelSettingsState } from "@/lib/image-model-settings";
import type { PromoApplication } from "@/lib/game-promo/application";

export type PromoVersion = { id: string; taskId?: string; status: string; source?: string; textResponse?: string; error?: string; prompt: string; createdAt: string };
export type PromoReference = { id: string; name: string; source: string; purpose: string };
export type PromoBatch = {
  id: string; mode: "missing" | "regenerate"; correction: string; fingerprint: string;
  inputs: Pick<PromoProject, "title" | "facts" | "activity" | "references" | "chatModel" | "imageModel" | "settings" | "draft">;
  targets: Array<{ design: string; versionID?: string }>; heroVersionID?: string;
  status: "running" | "awaiting-hero" | "completed" | "failed" | "stopped"; error?: string; createdAt: string;
};
export type PromoProject = {
  id: string; title: string; facts: string; activity: string; references: PromoReference[];
  chatModel: string; imageModel: string; settings?: ImageModelSettingsState;
  draft: CopyDraft; copyConfirmed: boolean; copyTask?: PromoVersion; copyHistory?: PromoVersion[];
  heroApproved?: string; versions: Record<string, PromoVersion[]>; selected: Record<string, string>;
  crops: Record<string, Crop>; batches?: PromoBatch[]; application?: PromoApplication; updatedAt: string;
};
const storage = localforage.createInstance({ name: "chatgpt2api", storeName: "game_promo_projects" });
let queue: Promise<unknown> = Promise.resolve();
export const promoID = () => crypto.randomUUID();
export async function capturePromoScope() {
  const session = getCachedAuthSession() ?? await getVerifiedAuthSession();
  if (!session?.subjectId) throw new Error("请先登录后使用本地项目");
  return `${session.provider || "local"}:${session.role}:${session.subjectId}`;
}
export function newPromoProject(): PromoProject {
  return { id: promoID(), title: "未命名游戏推广", facts: "", activity: "", references: [], chatModel: "auto", imageModel: "gpt-image-2",
    draft: { title: "", sellingPoint: "", carousel: Array.from({ length: 5 }, () => ({ theme: "", copy: "" })) },
    copyConfirmed: false, versions: {}, selected: {}, crops: {}, updatedAt: new Date().toISOString() };
}
export function clonePromoProject(project: PromoProject): PromoProject {
  const copy = copyWithoutActiveTaskIDs(project);
  copy.id = promoID(); copy.title += " 副本";
  copy.updatedAt = new Date().toISOString();
  return copy;
}
async function readProjects(scope: string) { return (await storage.getItem<PromoProject[]>(scope)) || []; }
export async function listPromoProjects(scope: string) { await queue; return readProjects(scope); }
export function inspectPromoProject<T>(scope: string, id: string, inspect: (project: PromoProject | undefined) => T): Promise<T> {
  return queue.then(() => navigator.locks.request(`game-promo-projects:${scope}`, async () =>
    inspect((await readProjects(scope)).find((p) => p.id === id))));
}
export function mutatePromoProjects<T>(scope: string, operation: (items: PromoProject[]) => { items: PromoProject[]; result: T }): Promise<T> {
  const result = queue.then(() => navigator.locks.request(`game-promo-projects:${scope}`, async () => {
    const next = operation(await readProjects(scope));
    await storage.setItem(scope, next.items);
    return next.result;
  }));
  queue = result.catch(() => undefined);
  return result;
}
export function updatePromoProject(scope: string, id: string, change: (project: PromoProject) => PromoProject) {
  return mutatePromoProjects(scope, (items) => ({ items: items.map((p) => p.id === id ? { ...change(p), updatedAt: new Date().toISOString() } : p), result: undefined }));
}
