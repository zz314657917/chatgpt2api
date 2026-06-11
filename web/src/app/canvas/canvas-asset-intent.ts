import type { ManagedImageSummary } from "@/lib/api";

export const CANVAS_ASSET_INTENT_STORAGE_KEY = "chatgpt2api:canvas_asset_intent";

type CanvasAssetIntent = {
  id: string;
  createdAt: string;
  assets: ManagedImageSummary[];
};

function isManagedImageSummary(value: unknown): value is ManagedImageSummary {
  if (!value || typeof value !== "object") {
    return false;
  }
  const item = value as Partial<ManagedImageSummary>;
  return typeof item.path === "string" && item.path.length > 0;
}

export function writeCanvasAssetIntent(assets: ManagedImageSummary[]) {
  const normalized = assets.filter(isManagedImageSummary);
  if (normalized.length === 0) {
    return;
  }
  window.localStorage.setItem(
    CANVAS_ASSET_INTENT_STORAGE_KEY,
    JSON.stringify({
      id: typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdAt: new Date().toISOString(),
      assets: normalized,
    }),
  );
}

export function consumeCanvasAssetIntent(): CanvasAssetIntent | null {
  const raw = window.localStorage.getItem(CANVAS_ASSET_INTENT_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  window.localStorage.removeItem(CANVAS_ASSET_INTENT_STORAGE_KEY);
  try {
    const parsed = JSON.parse(raw) as Partial<CanvasAssetIntent>;
    const assets = Array.isArray(parsed.assets) ? parsed.assets.filter(isManagedImageSummary) : [];
    if (assets.length === 0) {
      return null;
    }
    return {
      id: typeof parsed.id === "string" ? parsed.id : "",
      createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : "",
      assets,
    };
  } catch {
    return null;
  }
}
