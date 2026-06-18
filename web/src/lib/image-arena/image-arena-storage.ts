import localforage from "localforage";

import { getStoredAuthSession, type StoredAuthSession } from "@/store/auth";

import type { ImageArenaJob } from "./image-arena-types";
import { IMAGE_ARENA_HISTORY_LIMIT } from "./image-arena-validation";

const imageArenaStorage = localforage.createInstance({
  name: "chatgpt2api",
  storeName: "image_arena_jobs",
});

const IMAGE_ARENA_JOBS_KEY_PREFIX = "items";
export const IMAGE_ARENA_JOBS_CHANGED_EVENT = "chatgpt2api:image-arena-jobs-changed";
let imageArenaWriteQueue: Promise<void> = Promise.resolve();

function sessionScope(session: StoredAuthSession | null) {
  if (!session) {
    return "anonymous";
  }
  const subjectId = session.subjectId.trim();
  if (!subjectId) {
    return `${session.provider || "local"}:${session.role}:unknown`;
  }
  return `${session.provider || "local"}:${session.role}:${subjectId}`;
}

async function imageArenaStorageKey() {
  const session = await getStoredAuthSession();
  return `${IMAGE_ARENA_JOBS_KEY_PREFIX}:${sessionScope(session)}`;
}

function dispatchImageArenaJobsChanged() {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(IMAGE_ARENA_JOBS_CHANGED_EVENT));
}

function queueImageArenaWrite<T>(operation: () => Promise<T>): Promise<T> {
  const next = imageArenaWriteQueue.then(operation, operation);
  imageArenaWriteQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function normalizeJobs(value: unknown): ImageArenaJob[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is ImageArenaJob => Boolean(item && typeof item === "object" && typeof (item as ImageArenaJob).id === "string"))
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
    .slice(0, IMAGE_ARENA_HISTORY_LIMIT);
}

export async function listImageArenaJobs(): Promise<ImageArenaJob[]> {
  const key = await imageArenaStorageKey();
  return normalizeJobs(await imageArenaStorage.getItem(key));
}

export async function saveImageArenaJob(job: ImageArenaJob): Promise<ImageArenaJob[]> {
  return queueImageArenaWrite(async () => {
    const key = await imageArenaStorageKey();
    const current = normalizeJobs(await imageArenaStorage.getItem(key));
    const next = [job, ...current.filter((item) => item.id !== job.id)]
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
      .slice(0, IMAGE_ARENA_HISTORY_LIMIT);
    await imageArenaStorage.setItem(key, next);
    dispatchImageArenaJobsChanged();
    return next;
  });
}

export async function deleteImageArenaJob(jobId: string): Promise<ImageArenaJob[]> {
  return queueImageArenaWrite(async () => {
    const key = await imageArenaStorageKey();
    const current = normalizeJobs(await imageArenaStorage.getItem(key));
    const next = current.filter((item) => item.id !== jobId);
    await imageArenaStorage.setItem(key, next);
    dispatchImageArenaJobsChanged();
    return next;
  });
}
