import localforage from "localforage";

import { DEFAULT_CHAT_MODEL, DEFAULT_IMAGE_MODEL, type CreationTask, type ImageModel } from "@/lib/api";
import { isImageQuality, type ImageQuality } from "@/lib/image-parameters";
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
  role?: "primary" | "secondary";
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

export type CommerceSuiteResult = {
  templateId: string;
  taskId?: string;
  status: CreationTask["status"] | "idle";
  localUrl?: string;
  url?: string;
  path?: string;
  revisedPrompt?: string;
  error?: string;
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
  analysisTaskId?: string;
  analysisStatus?: CreationTask["status"] | "idle";
  analysisError?: string;
  results: CommerceSuiteResult[];
  summaryImage?: string;
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
  const role = image.role === "primary" || image.role === "secondary" ? image.role : fallbackRole;
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
    taskId: String(result.taskId || "").trim() || undefined,
    status,
    localUrl,
    url,
    path: path || undefined,
    revisedPrompt: String(result.revisedPrompt || "").trim() || undefined,
    error: String(result.error || "").trim() || undefined,
    updatedAt: String(result.updatedAt || "").trim() || undefined,
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
    analysisStatus: "idle",
    results: [],
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
          index === 0 ? "primary" : "secondary",
        );
        return normalized ? [normalized] : [];
      }).slice(0, 2)
    : [];
  const orderedReferenceImages = (["primary", "secondary"] as const).flatMap((role) => {
    const image = referenceImages.find((item) => item.role === role);
    return image ? [image] : [];
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
    analysisTaskId: String(value.analysisTaskId || "").trim() || undefined,
    analysisStatus,
    analysisError: String(value.analysisError || "").trim() || undefined,
    results: Array.isArray(value.results)
      ? value.results.flatMap((result) => {
          const normalized = normalizeResult(result as Partial<CommerceSuiteResult> & Record<string, unknown>);
          return normalized ? [normalized] : [];
        })
      : [],
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
