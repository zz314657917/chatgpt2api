import type { ImageVisibility, ManagedImageSummary } from "@/lib/api";

export type SmartCanvasAssetVisibilityFilter = ImageVisibility | "all";
export type SmartCanvasAssetOrientationFilter = "all" | "square" | "portrait" | "landscape";
export type SmartCanvasAssetSort = "newest" | "oldest" | "name";

export type SmartCanvasAssetFilterState = {
  query: string;
  visibility: SmartCanvasAssetVisibilityFilter;
  orientation: SmartCanvasAssetOrientationFilter;
  sort: SmartCanvasAssetSort;
};

export type SmartCanvasAssetFilterPatch = Partial<SmartCanvasAssetFilterState>;

export const DEFAULT_SMART_CANVAS_ASSET_FILTERS: SmartCanvasAssetFilterState = {
  query: "",
  visibility: "all",
  orientation: "all",
  sort: "newest",
};

const SMART_CANVAS_ASSET_VISIBILITIES = new Set<SmartCanvasAssetVisibilityFilter>(["all", "private", "public"]);
const SMART_CANVAS_ASSET_ORIENTATIONS = new Set<SmartCanvasAssetOrientationFilter>([
  "all",
  "square",
  "portrait",
  "landscape",
]);
const SMART_CANVAS_ASSET_SORTS = new Set<SmartCanvasAssetSort>(["newest", "oldest", "name"]);

export function updateSmartCanvasAssetFilters(
  current: SmartCanvasAssetFilterState,
  patch: SmartCanvasAssetFilterPatch,
): SmartCanvasAssetFilterState {
  return normalizeSmartCanvasAssetFilters({
    ...current,
    ...patch,
  });
}

export function resetSmartCanvasAssetFilters(patch: SmartCanvasAssetFilterPatch = {}): SmartCanvasAssetFilterState {
  return normalizeSmartCanvasAssetFilters({
    ...DEFAULT_SMART_CANVAS_ASSET_FILTERS,
    ...patch,
  });
}

export function filterSmartCanvasAssets(
  assets: readonly ManagedImageSummary[],
  filters: SmartCanvasAssetFilterState = DEFAULT_SMART_CANVAS_ASSET_FILTERS,
): ManagedImageSummary[] {
  const normalizedFilters = normalizeSmartCanvasAssetFilters(filters);
  const query = normalizedFilters.query.toLowerCase();

  return assets
    .map((asset, index) => ({ asset, index }))
    .filter(({ asset }) => matchesSmartCanvasAssetFilters(asset, normalizedFilters, query))
    .sort((left, right) => compareSmartCanvasAssets(left.asset, right.asset, normalizedFilters.sort) || left.index - right.index)
    .map(({ asset }) => asset);
}

export function normalizeSmartCanvasAssetFilters(filters: SmartCanvasAssetFilterPatch): SmartCanvasAssetFilterState {
  const visibility = SMART_CANVAS_ASSET_VISIBILITIES.has(filters.visibility as SmartCanvasAssetVisibilityFilter)
    ? (filters.visibility as SmartCanvasAssetVisibilityFilter)
    : DEFAULT_SMART_CANVAS_ASSET_FILTERS.visibility;
  const orientation = SMART_CANVAS_ASSET_ORIENTATIONS.has(filters.orientation as SmartCanvasAssetOrientationFilter)
    ? (filters.orientation as SmartCanvasAssetOrientationFilter)
    : DEFAULT_SMART_CANVAS_ASSET_FILTERS.orientation;
  const sort = SMART_CANVAS_ASSET_SORTS.has(filters.sort as SmartCanvasAssetSort)
    ? (filters.sort as SmartCanvasAssetSort)
    : DEFAULT_SMART_CANVAS_ASSET_FILTERS.sort;

  return {
    query: normalizeSmartCanvasAssetQuery(filters.query),
    visibility,
    orientation,
    sort,
  };
}

export function getSmartCanvasAssetOrientation(asset: ManagedImageSummary): Exclude<SmartCanvasAssetOrientationFilter, "all"> | "" {
  const width = Number(asset.width);
  const height = Number(asset.height);
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    if (width === height) {
      return "square";
    }
    return width > height ? "landscape" : "portrait";
  }

  const orientation = String(asset.orientation || "").trim().toLowerCase();
  return orientation === "square" || orientation === "portrait" || orientation === "landscape" ? orientation : "";
}

function matchesSmartCanvasAssetFilters(
  asset: ManagedImageSummary,
  filters: SmartCanvasAssetFilterState,
  normalizedQuery: string,
) {
  if (filters.visibility !== "all" && asset.visibility !== filters.visibility) {
    return false;
  }

  if (filters.orientation !== "all" && getSmartCanvasAssetOrientation(asset) !== filters.orientation) {
    return false;
  }

  if (!normalizedQuery) {
    return true;
  }

  return smartCanvasAssetSearchText(asset).includes(normalizedQuery);
}

function compareSmartCanvasAssets(left: ManagedImageSummary, right: ManagedImageSummary, sort: SmartCanvasAssetSort) {
  if (sort === "name") {
    return compareSmartCanvasAssetNames(left, right);
  }

  const leftTime = smartCanvasAssetTime(left);
  const rightTime = smartCanvasAssetTime(right);
  return sort === "oldest" ? leftTime - rightTime : rightTime - leftTime;
}

function compareSmartCanvasAssetNames(left: ManagedImageSummary, right: ManagedImageSummary) {
  const leftName = smartCanvasAssetName(left);
  const rightName = smartCanvasAssetName(right);
  return leftName.localeCompare(rightName, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function smartCanvasAssetName(asset: ManagedImageSummary) {
  return asset.name || asset.path || "";
}

function smartCanvasAssetTime(asset: ManagedImageSummary) {
  const time = Date.parse(asset.created_at || asset.date || "");
  return Number.isFinite(time) ? time : 0;
}

function smartCanvasAssetSearchText(asset: ManagedImageSummary) {
  return [
    asset.name,
    asset.path,
    asset.visibility,
    asset.created_at,
    asset.date,
    asset.width && asset.height ? `${asset.width}x${asset.height}` : "",
    asset.aspect_ratio,
    getSmartCanvasAssetOrientation(asset),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function normalizeSmartCanvasAssetQuery(query: unknown) {
  return String(query || "").trim();
}
