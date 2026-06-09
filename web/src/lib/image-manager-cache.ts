import type { ManagedImageSummary } from "@/lib/api";

export type ImageGalleryView = "mine" | "team" | "public" | "all";

type ImageManagerCacheEntry = {
  items: ManagedImageSummary[];
  nextCursor: string;
  hasMore: boolean;
  retentionDays: number;
  updatedAt: number;
};

const IMAGE_MANAGER_CACHE_TTL_MS = 30 * 1000;
const imageManagerCache = new Map<string, ImageManagerCacheEntry>();

export function imageManagerCacheKey(
  cacheScope: string,
  view: ImageGalleryView,
  startDate: string,
  endDate: string,
  searchKeyword = "",
  visibility = "all",
  format = "all",
  orientation = "all",
  resolution = "all",
  aspectRatio = "all",
  tags = "",
) {
  return [cacheScope, view, startDate, endDate, searchKeyword.trim(), visibility, format, orientation, resolution, aspectRatio, tags].join("|");
}

export function getImageManagerCache(cacheKey: string) {
  return imageManagerCache.get(cacheKey);
}

export function isFreshImageManagerCache(entry: ImageManagerCacheEntry) {
  return Date.now() - entry.updatedAt < IMAGE_MANAGER_CACHE_TTL_MS;
}

export function updateImageManagerCache(cacheKey: string, items: ManagedImageSummary[], nextCursor = "", hasMore = false, retentionDays = 7) {
  imageManagerCache.set(cacheKey, { items, nextCursor, hasMore, retentionDays, updatedAt: Date.now() });
}

export function removeCachedManagedImages(paths: string[]) {
  const pathSet = new Set(paths);
  for (const [key, entry] of imageManagerCache) {
    const items = entry.items.filter((item) => !pathSet.has(item.path));
    if (items.length !== entry.items.length) {
      imageManagerCache.set(key, { ...entry, items, updatedAt: Date.now() });
    }
  }
}

export function clearImageManagerCache() {
  imageManagerCache.clear();
}
