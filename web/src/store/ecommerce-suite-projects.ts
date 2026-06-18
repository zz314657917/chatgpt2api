import localforage from "localforage";

import { DEFAULT_CHAT_MODEL, DEFAULT_IMAGE_MODEL, type CreationTask, type ImageModel } from "@/lib/api";
import { compactImageModelSettings, type ImageModelSettingsState } from "@/lib/image-model-settings";
import type { ProStudioOfficialSettingsPayload, ProStudioPayloadMeta } from "@/lib/pro-studio";
import { isImageQuality, type ImageQuality } from "@/lib/image-parameters";
import { createDefaultProStudioState, normalizeProStudioState, type ProStudioState } from "@/lib/pro-studio";
import { getManagedImagePathFromUrl, getManagedImageUrlFromPath } from "@/lib/image-path";
import { getStoredAuthSession, type StoredAuthSession } from "@/store/auth";
import {
  DEFAULT_COMMERCE_SUITE_TEMPLATE_IDS,
  type CommerceSuiteLanguage,
  type CommerceSuiteMarket,
  type CommerceSuitePlatform,
} from "@/app/ecommerce-suite/ecommerce-suite-options";

export type CommerceSuiteReferenceImage = {
  id: string;
  role?: "product" | "reference" | "primary" | "secondary";
  name: string;
  type: string;
  size: number;
  dataUrl: string;
  publicUrl?: string;
  serverReferenceId?: string;
  uploadStatus?: "pending" | "uploading" | "uploaded" | "error";
  uploadError?: string;
};

export type CommerceSuiteTargeting = {
  platform: CommerceSuitePlatform;
  market: CommerceSuiteMarket;
  language: CommerceSuiteLanguage;
};

export type CommerceSummaryLayoutMode = "auto-grid" | "vertical" | "horizontal" | "two-column";
export type CommerceSummaryFitMode = "cover" | "contain";

export type CommerceSummaryLayout = {
  mode: CommerceSummaryLayoutMode;
  fit: CommerceSummaryFitMode;
  gap: number;
  background: string;
  showHeader: boolean;
  resultOrder: string[];
  selectedResultKeys: string[];
};

export type CommerceSuiteResult = {
  templateId: string;
  intent?: ProStudioPayloadMeta["intent"] | string;
  batchIndex?: number;
  outputCount?: number;
  taskId?: string;
  status: CreationTask["status"] | "idle";
  model?: ImageModel;
  arenaJobId?: string;
  localUrl?: string;
  url?: string;
  path?: string;
  revisedPrompt?: string;
  error?: string;
  proStudio?: ProStudioPayloadMeta;
  officialSettings?: ProStudioOfficialSettingsPayload;
  startedAt?: string;
  updatedAt?: string;
};

export type CommerceSuiteProject = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  referenceImages: CommerceSuiteReferenceImage[];
  targeting: CommerceSuiteTargeting;
  analysisText: string;
  selectedTemplates: string[];
  chatModel: ImageModel;
  imageModel: ImageModel;
  size: string;
  imageResolution: string;
  imageQuality: ImageQuality;
  outputFormat: "png";
  imageModelSettings?: ImageModelSettingsState;
  professionalMode?: boolean;
  proStudioState?: ProStudioState;
  skuCount?: number;
  analysisTaskId?: string;
  analysisStatus?: CreationTask["status"] | "idle";
  analysisError?: string;
  results: CommerceSuiteResult[];
  summaryLayout?: CommerceSummaryLayout;
  summaryImage?: string;
};

export const DEFAULT_COMMERCE_SUMMARY_LAYOUT: CommerceSummaryLayout = {
  mode: "auto-grid",
  fit: "cover",
  gap: 28,
  background: "#f6f8fc",
  showHeader: true,
  resultOrder: [],
  selectedResultKeys: [],
};

const commerceSuiteStorage = localforage.createInstance({
  name: "chatgpt2api",
  storeName: "ecommerce_suite_projects",
});

const COMMERCE_SUITE_PROJECTS_KEY_PREFIX = "items";
export const COMMERCE_SUITE_PROJECTS_CHANGED_EVENT = "chatgpt2api:ecommerce-suite-projects-changed";
let commerceSuiteWriteQueue: Promise<void> = Promise.resolve();

function nowISO() {
  return new Date().toISOString();
}

function createID(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function projectScopeFromSession(session: StoredAuthSession | null) {
  if (!session) {
    return "anonymous";
  }
  const subjectId = session.subjectId.trim();
  if (!subjectId) {
    return `${session.provider || "local"}:${session.role}:unknown`;
  }
  return `${session.provider || "local"}:${session.role}:${subjectId}`;
}

async function commerceSuiteStorageKey() {
  const session = await getStoredAuthSession();
  return `${COMMERCE_SUITE_PROJECTS_KEY_PREFIX}:${projectScopeFromSession(session)}`;
}

function dispatchCommerceSuiteProjectsChanged() {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(COMMERCE_SUITE_PROJECTS_CHANGED_EVENT));
}

function queueCommerceSuiteWrite<T>(operation: () => Promise<T>): Promise<T> {
  const result = commerceSuiteWriteQueue.then(operation);
  commerceSuiteWriteQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const out: string[] = [];
  value.forEach((item) => {
    const text = String(item || "").trim();
    if (!text || seen.has(text)) {
      return;
    }
    seen.add(text);
    out.push(text);
  });
  return out;
}

function normalizeReferenceImageRole(role?: CommerceSuiteReferenceImage["role"]) {
  if (role === "product" || role === "primary") {
    return "product" as const;
  }
  if (role === "reference" || role === "secondary") {
    return "reference" as const;
  }
  return undefined;
}

function normalizeReferenceImage(image: Partial<CommerceSuiteReferenceImage> & Record<string, unknown>, fallbackRole?: CommerceSuiteReferenceImage["role"]): CommerceSuiteReferenceImage | null {
  const dataUrl = String(image.dataUrl || "").trim();
  if (!dataUrl) {
    return null;
  }
  const size = Number(image.size);
  const status =
    image.uploadStatus === "pending" ||
    image.uploadStatus === "uploading" ||
    image.uploadStatus === "uploaded" ||
    image.uploadStatus === "error"
      ? image.uploadStatus
      : undefined;
  const role = normalizeReferenceImageRole(image.role) || normalizeReferenceImageRole(fallbackRole);
  return {
    id: String(image.id || createID("ref")).trim(),
    role,
    name: String(image.name || "reference.png").trim(),
    type: String(image.type || "image/png").trim(),
    size: Number.isFinite(size) && size > 0 ? size : 0,
    dataUrl,
    publicUrl: String(image.publicUrl || "").trim() || undefined,
    serverReferenceId: String(image.serverReferenceId || "").trim() || undefined,
    uploadStatus: status,
    uploadError: String(image.uploadError || "").trim() || undefined,
  };
}

function normalizeResult(result: Partial<CommerceSuiteResult> & Record<string, unknown>): CommerceSuiteResult | null {
  const templateId = String(result.templateId || "").trim();
  if (!templateId) {
    return null;
  }
  const localUrl = String(result.localUrl || "").trim() || undefined;
  const url = String(result.url || "").trim() || undefined;
  const path =
    String(result.path || "").trim() ||
    (localUrl || url ? getManagedImagePathFromUrl(localUrl || url || "") : "");
  const status =
    result.status === "queued" ||
    result.status === "running" ||
    result.status === "success" ||
    result.status === "error" ||
    result.status === "cancelled" ||
    result.status === "idle"
      ? result.status
      : "idle";
  return {
    templateId,
    intent: String(result.intent || "").trim() || undefined,
    batchIndex: Number.isFinite(Number(result.batchIndex)) ? Math.max(0, Math.round(Number(result.batchIndex))) : undefined,
    outputCount: Number.isFinite(Number(result.outputCount)) ? Math.max(1, Math.round(Number(result.outputCount))) : undefined,
    taskId: String(result.taskId || "").trim() || undefined,
    status,
    model: String(result.model || "").trim() || undefined,
    arenaJobId: String(result.arenaJobId || result.arena_job_id || "").trim() || undefined,
    localUrl,
    url,
    path: path || undefined,
    revisedPrompt: String(result.revisedPrompt || "").trim() || undefined,
    error: String(result.error || "").trim() || undefined,
    proStudio: result.proStudio && typeof result.proStudio === "object" ? result.proStudio as ProStudioPayloadMeta : undefined,
    officialSettings: result.officialSettings && typeof result.officialSettings === "object" ? result.officialSettings as ProStudioOfficialSettingsPayload : undefined,
    startedAt: String(result.startedAt || "").trim() || undefined,
    updatedAt: String(result.updatedAt || "").trim() || undefined,
  };
}

function normalizeSummaryLayout(value: unknown): CommerceSummaryLayout {
  const input = value && typeof value === "object"
    ? value as Partial<CommerceSummaryLayout> & Record<string, unknown>
    : {};
  const mode = input.mode === "vertical" ||
    input.mode === "horizontal" ||
    input.mode === "two-column" ||
    input.mode === "auto-grid"
    ? input.mode
    : DEFAULT_COMMERCE_SUMMARY_LAYOUT.mode;
  const fit = input.fit === "contain" || input.fit === "cover"
    ? input.fit
    : DEFAULT_COMMERCE_SUMMARY_LAYOUT.fit;
  const gap = Number(input.gap);
  const background = String(input.background || DEFAULT_COMMERCE_SUMMARY_LAYOUT.background).trim();
  return {
    mode,
    fit,
    gap: Number.isFinite(gap) ? Math.max(0, Math.min(96, Math.round(gap))) : DEFAULT_COMMERCE_SUMMARY_LAYOUT.gap,
    background: /^#[0-9a-fA-F]{6}$/.test(background) ? background : DEFAULT_COMMERCE_SUMMARY_LAYOUT.background,
    showHeader: typeof input.showHeader === "boolean" ? input.showHeader : DEFAULT_COMMERCE_SUMMARY_LAYOUT.showHeader,
    resultOrder: Array.isArray(input.resultOrder) ? normalizeStringList(input.resultOrder) : [],
    selectedResultKeys: Array.isArray(input.selectedResultKeys) ? normalizeStringList(input.selectedResultKeys) : [],
  };
}

export function createCommerceSuiteProject(): CommerceSuiteProject {
  const createdAt = nowISO();
  return {
    id: createID("suite"),
    title: "未命名商品套图",
    createdAt,
    updatedAt: createdAt,
    referenceImages: [],
    targeting: {
      platform: "amazon",
      market: "us",
      language: "zh",
    },
    analysisText: "",
    selectedTemplates: [...DEFAULT_COMMERCE_SUITE_TEMPLATE_IDS],
    chatModel: DEFAULT_CHAT_MODEL,
    imageModel: DEFAULT_IMAGE_MODEL,
    size: "1:1",
    imageResolution: "1K",
    imageQuality: "auto",
    outputFormat: "png",
    professionalMode: false,
    proStudioState: createDefaultProStudioState("product_main"),
    skuCount: 8,
    analysisStatus: "idle",
    results: [],
    summaryLayout: { ...DEFAULT_COMMERCE_SUMMARY_LAYOUT },
  };
}

export function normalizeCommerceSuiteProject(value: Partial<CommerceSuiteProject> & Record<string, unknown>): CommerceSuiteProject {
  const createdAt = String(value.createdAt || nowISO()).trim();
  const targeting = value.targeting && typeof value.targeting === "object"
    ? value.targeting as Partial<CommerceSuiteTargeting>
    : {};
  const analysisStatus =
    value.analysisStatus === "queued" ||
    value.analysisStatus === "running" ||
    value.analysisStatus === "success" ||
    value.analysisStatus === "error" ||
    value.analysisStatus === "cancelled" ||
    value.analysisStatus === "idle"
      ? value.analysisStatus
      : "idle";
  const referenceImages = Array.isArray(value.referenceImages)
    ? value.referenceImages.flatMap((image, index) => {
        const normalized = normalizeReferenceImage(
          image as Partial<CommerceSuiteReferenceImage> & Record<string, unknown>,
          index === 0 ? "product" : "reference",
        );
        return normalized ? [normalized] : [];
      }).slice(0, 16)
    : [];
  const orderedReferenceImages = (["product", "reference"] as const).flatMap((role) => {
    return referenceImages.filter((item) => item.role === role);
  });
  return {
    id: String(value.id || createID("suite")).trim(),
    title: String(value.title || "未命名商品套图").trim(),
    createdAt,
    updatedAt: String(value.updatedAt || createdAt).trim(),
    referenceImages: orderedReferenceImages,
    targeting: {
      platform: targeting.platform || "amazon",
      market: targeting.market || "us",
      language: targeting.language || "zh",
    },
    analysisText: String(value.analysisText || ""),
    selectedTemplates: Array.isArray(value.selectedTemplates)
      ? normalizeStringList(value.selectedTemplates)
      : [...DEFAULT_COMMERCE_SUITE_TEMPLATE_IDS],
    chatModel: String(value.chatModel || DEFAULT_CHAT_MODEL).trim(),
    imageModel: String(value.imageModel || DEFAULT_IMAGE_MODEL).trim(),
    size: String(value.size || "1:1").trim(),
    imageResolution: String(value.imageResolution || "1K").trim(),
    imageQuality: isImageQuality(value.imageQuality) ? value.imageQuality : "auto",
    outputFormat: "png",
    imageModelSettings: compactImageModelSettings((value.imageModelSettings || value.image_model_settings) as ImageModelSettingsState | undefined),
    professionalMode: Boolean(value.professionalMode),
    proStudioState: normalizeProStudioState(value.proStudioState as Partial<ProStudioState> | undefined, "product_main"),
    skuCount: Math.max(1, Math.min(24, Math.round(Number(value.skuCount || 8) || 8))),
    analysisTaskId: String(value.analysisTaskId || "").trim() || undefined,
    analysisStatus,
    analysisError: String(value.analysisError || "").trim() || undefined,
    results: Array.isArray(value.results)
      ? value.results.flatMap((result) => {
          const normalized = normalizeResult(result as Partial<CommerceSuiteResult> & Record<string, unknown>);
          return normalized ? [normalized] : [];
        })
      : [],
    summaryLayout: normalizeSummaryLayout(value.summaryLayout),
    summaryImage: String(value.summaryImage || "").trim() || undefined,
  };
}

function getTimestamp(value: string) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function sortProjects(projects: CommerceSuiteProject[]) {
  return [...projects].sort((a, b) => getTimestamp(b.updatedAt) - getTimestamp(a.updatedAt));
}

async function readStoredProjects(storageKey?: string): Promise<CommerceSuiteProject[]> {
  const key = storageKey || await commerceSuiteStorageKey();
  const items =
    (await commerceSuiteStorage.getItem<Array<CommerceSuiteProject & Record<string, unknown>>>(key)) || [];
  return items.map(normalizeCommerceSuiteProject);
}

export async function listCommerceSuiteProjects(): Promise<CommerceSuiteProject[]> {
  return sortProjects(await readStoredProjects());
}

export async function saveCommerceSuiteProject(project: CommerceSuiteProject): Promise<void> {
  await queueCommerceSuiteWrite(async () => {
    const storageKey = await commerceSuiteStorageKey();
    const items = await readStoredProjects(storageKey);
    const nextProject = normalizeCommerceSuiteProject(project);
    const nextItems = sortProjects([
      nextProject,
      ...items.filter((item) => item.id !== nextProject.id),
    ]);
    await commerceSuiteStorage.setItem(storageKey, nextItems);
    dispatchCommerceSuiteProjectsChanged();
  });
}

export async function deleteCommerceSuiteProject(id: string): Promise<void> {
  await queueCommerceSuiteWrite(async () => {
    const storageKey = await commerceSuiteStorageKey();
    const items = await readStoredProjects(storageKey);
    await commerceSuiteStorage.setItem(
      storageKey,
      items.filter((item) => item.id !== id),
    );
    dispatchCommerceSuiteProjectsChanged();
  });
}

export function commerceSuiteResultImageSource(result: CommerceSuiteResult) {
  if (result.localUrl || result.url) {
    return result.localUrl || result.url || "";
  }
  return result.path ? getManagedImageUrlFromPath(result.path) : "";
}

export function touchCommerceSuiteProject(project: CommerceSuiteProject): CommerceSuiteProject {
  return normalizeCommerceSuiteProject({
    ...project,
    updatedAt: nowISO(),
  });
}
