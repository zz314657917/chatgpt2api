"use client";

import { forwardRef, useCallback, useEffect, useMemo, useRef, useState, type HTMLAttributes } from "react";
import { Check, Copy, Download, Eye, FileText, Folder, FolderPlus, ImageIcon, ImagePlus, Info, LoaderCircle, MoreHorizontal, Pencil, RefreshCw, Search, Send, SlidersHorizontal, Sparkles, Tag, Trash2, Type, Users, X } from "lucide-react";
import { VirtuosoGrid, type VirtuosoGridHandle } from "react-virtuoso";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { writeSimilarImageIntent } from "@/app/image/similar-image-intent";
import { writeCanvasAssetIntent } from "@/app/canvas/canvas-asset-intent";
import { AuthenticatedImage } from "@/components/authenticated-image";
import { DateRangeFilter } from "@/components/date-range-filter";
import { ImageLightbox } from "@/components/image-lightbox";
import { MobileBottomDrawer } from "@/components/mobile-bottom-drawer";
import { useMobileNav } from "@/components/mobile-nav-context";
import { ProStudioBadge } from "@/components/pro-studio/pro-studio-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createManagedTextAssetCollection,
  deleteManagedImages,
  createManagedTextAsset,
  createManagedImageCollection,
  deleteManagedImageCollection,
  deleteManagedTextAssetCollection,
  deleteManagedTextAsset,
  fetchManagedImageDownloadURL,
  fetchManagedImageCollections,
  fetchManagedImageDetail,
  fetchManagedImages,
  fetchManagedImageTags,
  fetchManagedTextAssetCollections,
  fetchManagedTextAssets,
  fetchTeamWorkspace,
  moveManagedImagesToTeamLibrary,
  MANAGED_IMAGE_UNCLASSIFIED_COLLECTION_ID,
  MANAGED_TEXT_ASSET_UNCLASSIFIED_COLLECTION_ID,
  renameManagedImageCollection,
  renameManagedTextAssetCollection,
  updateManagedImageCollectionItems,
  updateManagedImageTags,
  updateManagedTextAssetCollectionItems,
  updateManagedTextAsset,
  type ManagedImageCollection,
  type ManagedImageDetail,
  type ManagedImageSummary,
  type ManagedTextAsset,
  type ManagedTextAssetCollection,
  type ManagedTextAssetListScope,
  type TeamImageStorageSummary,
  type TeamSummary,
} from "@/lib/api";
import {
  fetchAuthenticatedImageBlob,
  invalidateAuthenticatedImageCacheForPaths,
  shouldUseAuthenticatedImageFallback,
} from "@/lib/authenticated-image";
import { getManagedImageUrlFromPath } from "@/lib/image-path";
import {
  clearImageManagerCache,
  getImageManagerCache,
  imageManagerCacheKey,
  isFreshImageManagerCache,
  removeCachedManagedImages,
  updateImageManagerCache,
  type ImageGalleryView,
} from "@/lib/image-manager-cache";
import { formatImageFileSize } from "@/lib/image-size";
import { cn } from "@/lib/utils";
import { useAuthGuard } from "@/lib/use-auth-guard";
import { canAccessPath, hasAPIPermission, type StoredAuthSession } from "@/store/auth";

function getManagedImageFormatLabel(item: ManagedImageSummary) {
  const normalized = (item.name || item.path).split("?")[0]?.match(/\.([a-z0-9]+)$/i)?.[1] || "image";
  const format = normalized.toLowerCase() === "jpeg" ? "jpg" : normalized.toLowerCase();
  return `IMAGE ${format.toUpperCase()}`;
}

function managedImageCardSource(item: ManagedImageSummary) {
  return item.thumbnail_url || "";
}

function managedImagePreviewSource(item: ManagedImageSummary) {
  return item.preview_url || item.thumbnail_url || "";
}

function managedImageKey(item: ManagedImageSummary) {
  return item.path;
}

function managedImageDetailCacheKey(item: ManagedImageSummary, scope?: ImageGalleryView) {
  return `${scope || ""}:${item.path}`;
}

function managedImageDetailCacheKeys(item: ManagedImageSummary) {
  return ["mine", "team", "all"].map((scope) => managedImageDetailCacheKey(item, scope as ImageGalleryView));
}

function buildManagedImageDownloadName(item: ManagedImageSummary, index: number) {
  const sourceName = item.name || item.path.split("?")[0]?.split("/").filter(Boolean).pop();
  if (sourceName) {
    return sourceName;
  }
  return `managed-image-${String(index + 1).padStart(2, "0")}.png`;
}

function imageDownloadErrorMessage(error: unknown) {
  if (error instanceof TypeError && error.message === "Failed to fetch") {
    return "下载图片失败：无法读取图片文件，请检查图片地址或登录状态";
  }
  return error instanceof Error ? error.message : "下载图片失败";
}

async function downloadManagedImage(
  item: ManagedImageDetail,
  index: number,
  scope: { scope?: ImageGalleryView; team_id?: string } = {},
) {
  let objectUrl = "";
  const directDownload = item.path
    ? await fetchManagedImageDownloadURL(item.path, scope).catch(() => null)
    : null;
  const directDownloadUrl = directDownload?.download_url || "";
  const downloadUrl = directDownloadUrl || item.url || (item.path ? getManagedImageUrlFromPath(item.path) : "");
  const fallbackUrl = item.path ? getManagedImageUrlFromPath(item.path) : "";

  if (directDownload?.direct && directDownloadUrl) {
    const link = document.createElement("a");
    link.href = directDownloadUrl;
    link.download = buildManagedImageDownloadName(item, index);
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    link.remove();
    return;
  }

  try {
    const fetchBlob = (url: string) => shouldUseAuthenticatedImageFallback(url)
      ? fetchAuthenticatedImageBlob(url)
      : fetch(url).then((response) => {
        if (!response.ok) {
          throw new Error(`下载图片失败 (${response.status})`);
        }
        return response.blob();
      });
    const blob = await fetchBlob(downloadUrl).catch((error) => {
      if (fallbackUrl && fallbackUrl !== downloadUrl) {
        return fetchBlob(fallbackUrl);
      }
      throw error;
    });
    objectUrl = URL.createObjectURL(blob);
  } catch (error) {
    throw new Error(imageDownloadErrorMessage(error));
  }

  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = buildManagedImageDownloadName(item, index);
  document.body.appendChild(link);
  link.click();
  link.remove();

  if (objectUrl) {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isRequestCanceled(error: unknown) {
  return error instanceof Error && error.message === "canceled";
}

type DeleteImageTarget = {
  paths: string[];
};

type TagEditTarget = {
  item: ManagedImageSummary;
};

type MoveTeamTarget = {
  items: ManagedImageSummary[];
};

type CollectionEditTarget =
  | { mode: "create" }
  | { mode: "rename"; collection: ManagedImageCollection };

type CollectionDeleteTarget = {
  collection: ManagedImageCollection;
};

type CollectionAssignTarget = {
  items: ManagedImageSummary[];
  collectionId: string;
};

type ImageVisibilityFilter = "all" | "private";
type ImageFormatFilter = "all" | "png" | "jpg" | "webp" | "gif" | "other";
type ImageOrientationFilter = "all" | "landscape" | "portrait" | "square" | "unknown";
type ImageResolutionFilter = "all" | "1080p" | "2k" | "4k" | "unknown";
type ImageAspectRatioFilter = "all" | "1:1" | "4:3" | "3:4" | "16:9" | "9:16" | "other" | "unknown";
type AutoRefreshMenuScope = "mobile" | "desktop";
type AssetLibraryKind = "image" | "text";
type TextAssetScope = ManagedTextAssetListScope;

type TextAssetEditorTarget =
  | { mode: "create" }
  | { mode: "edit"; item: ManagedTextAsset };

type DeleteTextAssetTarget = {
  item: ManagedTextAsset;
};

type TextAssetCollectionEditTarget =
  | { mode: "create" }
  | { mode: "rename"; collection: ManagedTextAssetCollection };

type TextAssetCollectionDeleteTarget = {
  collection: ManagedTextAssetCollection;
};

type TextAssetCollectionAssignTarget = {
  item: ManagedTextAsset;
  collectionId: string;
};

const IMAGE_RESOLUTION_FILTERS: Array<{ value: ImageResolutionFilter; label: string }> = [
  { value: "all", label: "全部分辨率" },
  { value: "1080p", label: "1080P" },
  { value: "2k", label: "2K" },
  { value: "4k", label: "4K" },
  { value: "unknown", label: "未知尺寸" },
];

const IMAGE_ASPECT_RATIO_FILTERS: Array<{ value: ImageAspectRatioFilter; label: string }> = [
  { value: "all", label: "全部比例" },
  { value: "1:1", label: "1:1" },
  { value: "4:3", label: "4:3" },
  { value: "3:4", label: "3:4" },
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
  { value: "other", label: "其他比例" },
  { value: "unknown", label: "未知尺寸" },
];

function imageManagerCacheScope(session: StoredAuthSession) {
  return [session.provider || "local", session.role, session.subjectId || session.key].join(":");
}

function imageOwnerLabel(item: ManagedImageSummary) {
  return item.owner_name?.trim() || "未知用户";
}

function canManageTeamImages(team?: TeamSummary | null) {
  return team?.member_role === "owner" || team?.member_role === "manager";
}

function canManageTeamTextAssets(team?: TeamSummary | null) {
  return team?.member_role === "owner" || team?.member_role === "manager";
}

function textAssetOwnerLabel(item: ManagedTextAsset) {
  return item.owner_name?.trim() || item.team_name?.trim() || "未知用户";
}

function formatTextAssetTime(value?: string) {
  if (!value) {
    return "未知时间";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function textAssetScopeLabel(scope: TextAssetScope) {
  return scope === "team" ? "团队" : "个人";
}

function formatStorageBytes(bytes?: number) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value >= 1024 * 1024 * 1024) {
    return `${(value / 1024 / 1024 / 1024).toFixed(value >= 10 * 1024 * 1024 * 1024 ? 0 : 1)} GiB`;
  }
  if (value >= 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)} MiB`;
  }
  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} KiB`;
  }
  return `${value} B`;
}

function normalizeImageTags(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value : (value || "").split(/[,，\n\t]/);
  const seen = new Set<string>();
  const tags: string[] = [];
  raw.forEach((item) => {
    const tag = item.trim().replace(/\s+/g, " ");
    if (!tag) return;
    const key = tag.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    tags.push(Array.from(tag).slice(0, 32).join(""));
  });
  return tags.slice(0, 20);
}

function reusableImagePrompt(item: ManagedImageDetail) {
  return item.share_prompt_parameters && item.prompt?.trim()
    ? item.prompt.trim()
    : "参考这张图，生成一张风格、主体和构图相近的新图片。";
}

function reusableImageReferenceUrls(item: ManagedImageDetail) {
  const originalUrl = item.url || (item.path ? getManagedImageUrlFromPath(item.path) : "");
  if (!item.share_reference_images) {
    return [originalUrl];
  }
  const urls = item.reference_image_urls?.length
    ? item.reference_image_urls
    : item.reference_images?.map((reference) => reference.url || "").filter(Boolean);
  return urls && urls.length > 0 ? Array.from(new Set(urls.map((url) => url.trim()).filter(Boolean))) : [originalUrl];
}

function managedImageDimensions(item: ManagedImageSummary) {
  const width = Number(item.width);
  const height = Number(item.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return { width, height };
}

function getManagedImageResolution(item: ManagedImageSummary) {
  const dimensions = managedImageDimensions(item);
  return dimensions ? `${dimensions.width} x ${dimensions.height}` : "";
}

function getManagedImageMegapixels(item: ManagedImageSummary) {
  const dimensions = managedImageDimensions(item);
  if (!dimensions) {
    return 0;
  }
  return (dimensions.width * dimensions.height) / 1_000_000;
}

function getManagedImageAspectRatio(item: ManagedImageSummary) {
  const dimensions = managedImageDimensions(item);
  if (!dimensions) {
    return "";
  }
  return item.aspect_ratio || simplifyAspectRatio(dimensions.width, dimensions.height);
}

function simplifyAspectRatio(width: number, height: number) {
  const divisor = greatestCommonDivisor(Math.round(width), Math.round(height));
  if (divisor <= 0) {
    return "";
  }
  return `${Math.round(width) / divisor}:${Math.round(height) / divisor}`;
}

function greatestCommonDivisor(a: number, b: number): number {
  let left = Math.abs(a);
  let right = Math.abs(b);
  while (right !== 0) {
    const next = left % right;
    left = right;
    right = next;
  }
  return left;
}

function imageResolutionFilterLabel(value: ImageResolutionFilter) {
  return IMAGE_RESOLUTION_FILTERS.find((item) => item.value === value)?.label ?? "全部分辨率";
}

function imageAspectRatioFilterLabel(value: ImageAspectRatioFilter) {
  return IMAGE_ASPECT_RATIO_FILTERS.find((item) => item.value === value)?.label ?? "全部比例";
}

function formatManagedImageMegapixels(item: ManagedImageSummary) {
  const megapixels = getManagedImageMegapixels(item);
  if (megapixels <= 0) {
    return "";
  }
  return megapixels >= 10 ? `${megapixels.toFixed(1)}MP` : `${megapixels.toFixed(2)}MP`;
}

function getManagedImageResolutionSummary(item: ManagedImageSummary) {
  return [getManagedImageResolution(item), getManagedImageAspectRatio(item), formatManagedImageMegapixels(item)].filter(Boolean).join(" · ");
}

function imageFormatFilterLabel(format: ImageFormatFilter) {
  const labels: Record<ImageFormatFilter, string> = {
    all: "全部格式",
    png: "PNG",
    jpg: "JPG",
    webp: "WEBP",
    gif: "GIF",
    other: "其他",
  };
  return labels[format];
}

function imageOrientationFilterLabel(orientation: ImageOrientationFilter) {
  const labels: Record<ImageOrientationFilter, string> = {
    all: "全部方向",
    landscape: "横图",
    portrait: "竖图",
    square: "方图",
    unknown: "未知尺寸",
  };
  return labels[orientation];
}

function imageVisibilityFilterLabel(visibility: ImageVisibilityFilter) {
  if (visibility === "all") {
    return "全部状态";
  }
  return "私有";
}

function blurFocusedElementInContainer(container: HTMLElement) {
  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLElement && container.contains(activeElement)) {
    activeElement.blur();
  }
}

const IMAGE_MANAGER_PAGE_SIZE = 50;
const TEXT_ASSET_PAGE_SIZE = 50;
const TEXT_ASSET_MAX_CONTENT_LENGTH = 20000;
const AUTO_REFRESH_INTERVAL_OPTIONS = [5, 10, 15, 30] as const;

type ImageAutoRefreshInterval = (typeof AUTO_REFRESH_INTERVAL_OPTIONS)[number];

function ImageManagerContent({
  cacheScope,
  canDeleteImages,
  canGenerateSimilar,
  canEditImageTags,
  canMoveImagesToTeam,
  canManageCollections,
  canViewTextAssets,
  canCreateTextAssets,
  canUpdateTextAssets,
  canDeleteTextAssets,
  canManageTextAssetCollections,
  isAdmin,
}: {
  cacheScope: string;
  canDeleteImages: boolean;
  canGenerateSimilar: boolean;
  canEditImageTags: boolean;
  canMoveImagesToTeam: boolean;
  canManageCollections: boolean;
  canViewTextAssets: boolean;
  canCreateTextAssets: boolean;
  canUpdateTextAssets: boolean;
  canDeleteTextAssets: boolean;
  canManageTextAssetCollections: boolean;
  isAdmin: boolean;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { clearPanel, closeDrawer, openDrawer, setPanel } = useMobileNav();
  const activeLoadRef = useRef<AbortController | null>(null);
  const autoRefreshAbortRef = useRef<AbortController | null>(null);
  const textAssetLoadRef = useRef<AbortController | null>(null);
  const imageGridRef = useRef<VirtuosoGridHandle | null>(null);
  const imageGridScrollerRef = useRef<HTMLElement | null>(null);
  const [assetKind, setAssetKind] = useState<AssetLibraryKind>("image");
  const [galleryView, setGalleryView] = useState<ImageGalleryView>("mine");
  const [textAssetScope, setTextAssetScope] = useState<TextAssetScope>("mine");
  const [textAssetSearch, setTextAssetSearch] = useState("");
  const [textAssets, setTextAssets] = useState<ManagedTextAsset[]>([]);
  const [textAssetNextCursor, setTextAssetNextCursor] = useState("");
  const [textAssetHasMore, setTextAssetHasMore] = useState(false);
  const [isTextAssetLoading, setIsTextAssetLoading] = useState(false);
  const [isTextAssetLoadingMore, setIsTextAssetLoadingMore] = useState(false);
  const [textAssetLoadError, setTextAssetLoadError] = useState("");
  const [focusedTextAssetId, setFocusedTextAssetId] = useState<string | null>(null);
  const [textAssetEditorTarget, setTextAssetEditorTarget] = useState<TextAssetEditorTarget | null>(null);
  const [textAssetNameInput, setTextAssetNameInput] = useState("");
  const [textAssetContentInput, setTextAssetContentInput] = useState("");
  const [isTextAssetSaving, setIsTextAssetSaving] = useState(false);
  const [deleteTextAssetTarget, setDeleteTextAssetTarget] = useState<DeleteTextAssetTarget | null>(null);
  const [isTextAssetDeleting, setIsTextAssetDeleting] = useState(false);
  const [textAssetCollections, setTextAssetCollections] = useState<ManagedTextAssetCollection[]>([]);
  const [textAssetUnclassifiedCount, setTextAssetUnclassifiedCount] = useState(0);
  const [selectedTextAssetCollectionId, setSelectedTextAssetCollectionId] = useState("");
  const [textAssetCollectionEditTarget, setTextAssetCollectionEditTarget] = useState<TextAssetCollectionEditTarget | null>(null);
  const [textAssetCollectionNameInput, setTextAssetCollectionNameInput] = useState("");
  const [textAssetCollectionDeleteTarget, setTextAssetCollectionDeleteTarget] = useState<TextAssetCollectionDeleteTarget | null>(null);
  const [textAssetCollectionAssignTarget, setTextAssetCollectionAssignTarget] = useState<TextAssetCollectionAssignTarget | null>(null);
  const [textAssetCollectionMutating, setTextAssetCollectionMutating] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedImageIds, setSelectedImageIds] = useState<Record<string, boolean>>({});
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteImageTarget | null>(null);
  const [tagEditTarget, setTagEditTarget] = useState<TagEditTarget | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [allImageTags, setAllImageTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagMutatingPath, setTagMutatingPath] = useState<string | null>(null);
  const [teamImagesTarget, setTeamImagesTarget] = useState<MoveTeamTarget | null>(null);
  const [collections, setCollections] = useState<ManagedImageCollection[]>([]);
  const [unclassifiedCount, setUnclassifiedCount] = useState(0);
  const [selectedCollectionId, setSelectedCollectionId] = useState("");
  const [collectionEditTarget, setCollectionEditTarget] = useState<CollectionEditTarget | null>(null);
  const [collectionNameInput, setCollectionNameInput] = useState("");
  const [collectionDeleteTarget, setCollectionDeleteTarget] = useState<CollectionDeleteTarget | null>(null);
  const [collectionAssignTarget, setCollectionAssignTarget] = useState<CollectionAssignTarget | null>(null);
  const [collectionMutating, setCollectionMutating] = useState(false);
  const [activeTeam, setActiveTeam] = useState<TeamSummary | null>(null);
  const [teamStorage, setTeamStorage] = useState<TeamImageStorageSummary | null>(null);
  const [isMovingToTeam, setIsMovingToTeam] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [focusedImagePath, setFocusedImagePath] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [isImageActionsOpen, setIsImageActionsOpen] = useState(false);
  const [autoRefreshMenuScope, setAutoRefreshMenuScope] = useState<AutoRefreshMenuScope | null>(null);
  const [isAutoRefreshEnabled, setIsAutoRefreshEnabled] = useState(true);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<ImageAutoRefreshInterval>(30);
  const [autoRefreshSecondsRemaining, setAutoRefreshSecondsRemaining] = useState(autoRefreshInterval);
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  const initialQueryAppliedRef = useRef(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState<ImageVisibilityFilter>("all");
  const [formatFilter, setFormatFilter] = useState<ImageFormatFilter>("all");
  const [orientationFilter, setOrientationFilter] = useState<ImageOrientationFilter>("all");
  const [resolutionFilter, setResolutionFilter] = useState<ImageResolutionFilter>("all");
  const [aspectRatioFilter, setAspectRatioFilter] = useState<ImageAspectRatioFilter>("all");
  const selectedTagKey = selectedTags.join(",");
  const currentCacheKey = imageManagerCacheKey(
    cacheScope,
    galleryView,
    startDate,
    endDate,
    searchKeyword,
    visibilityFilter,
    formatFilter,
    orientationFilter,
    resolutionFilter,
    aspectRatioFilter,
    selectedCollectionId,
    selectedTagKey,
  );
  const initialCache = getImageManagerCache(currentCacheKey);
  const [isLoading, setIsLoading] = useState(() => !initialCache);
  const [loadError, setLoadError] = useState("");
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(false);
  const [items, setItems] = useState<ManagedImageSummary[]>(() => initialCache?.items ?? []);
  const [imageRetentionDays, setImageRetentionDays] = useState(() => initialCache?.retentionDays ?? 7);
  const [nextCursor, setNextCursor] = useState(() => initialCache?.nextCursor ?? "");
  const [hasMoreItems, setHasMoreItems] = useState(() => initialCache?.hasMore ?? false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [detailItemsByPath, setDetailItemsByPath] = useState<Record<string, ManagedImageDetail>>({});
  const hasLocalFilters =
    searchKeyword.trim() !== "" ||
    visibilityFilter !== "all" ||
    formatFilter !== "all" ||
    orientationFilter !== "all" ||
    resolutionFilter !== "all" ||
    aspectRatioFilter !== "all" ||
    selectedTags.length > 0 ||
    selectedCollectionId !== "";
  const hasActiveFilters = hasLocalFilters || startDate !== "" || endDate !== "";
  const activeFilterLabels = [
    startDate && endDate ? `${startDate} 至 ${endDate}` : startDate ? startDate : "",
    visibilityFilter !== "all" ? imageVisibilityFilterLabel(visibilityFilter) : "",
    formatFilter !== "all" ? imageFormatFilterLabel(formatFilter) : "",
    orientationFilter !== "all" ? imageOrientationFilterLabel(orientationFilter) : "",
    resolutionFilter !== "all" ? imageResolutionFilterLabel(resolutionFilter) : "",
    aspectRatioFilter !== "all" ? imageAspectRatioFilterLabel(aspectRatioFilter) : "",
    selectedCollectionId
      ? selectedCollectionId === MANAGED_IMAGE_UNCLASSIFIED_COLLECTION_ID
        ? "素材集：未归类"
        : `素材集：${collections.find((item) => item.id === selectedCollectionId)?.name || "未命名"}`
      : "",
    ...selectedTags.map((tag) => `标签：${tag}`),
  ].filter(Boolean);
  const activeFilterCount = activeFilterLabels.length;
  const loadManagedImageDetail = useCallback(async (item: ManagedImageSummary) => {
    const cacheKey = managedImageDetailCacheKey(item, galleryView);
    const cached = detailItemsByPath[cacheKey];
    if (cached) {
      return cached;
    }
    const detail = await fetchManagedImageDetail(item.path, {
      scope: galleryView,
      team_id: galleryView === "team" ? activeTeam?.id || "" : "",
    });
    setDetailItemsByPath((current) => ({ ...current, [cacheKey]: detail }));
    return detail;
  }, [activeTeam?.id, detailItemsByPath, galleryView]);
  const lightboxImages = useMemo(
    () =>
      items.map((item) => {
        const detail = detailItemsByPath[managedImageDetailCacheKey(item, galleryView)];
        return {
          id: item.path || item.name,
          src: managedImagePreviewSource(item),
          fileName: detail?.name || item.name,
          outputFormat: detail?.output_format,
          sizeLabel: formatImageFileSize(detail?.size || item.size),
          dimensions: getManagedImageResolutionSummary(detail || item) || undefined,
        };
      }),
    [detailItemsByPath, galleryView, items],
  );
  const resolveLightboxDownloadSource = useCallback(async (_image: { id: string }, index: number) => {
    const item = items[index];
    if (!item) {
      return null;
    }
    const detail = await loadManagedImageDetail(item);
    const directDownload = await fetchManagedImageDownloadURL(item.path, {
      scope: galleryView,
      team_id: galleryView === "team" ? activeTeam?.id || "" : "",
    }).catch(() => null);
    return {
      src: directDownload?.download_url || detail.url,
      fileName: detail.name,
      outputFormat: detail.output_format,
      direct: directDownload?.direct === true,
    };
  }, [activeTeam?.id, galleryView, items, loadManagedImageDetail]);
  const selectedItems = useMemo(
    () => items.filter((item) => selectedImageIds[managedImageKey(item)]),
    [items, selectedImageIds],
  );
  const focusedItem = useMemo(() => {
    if (focusedImagePath) {
      const focused = items.find((item) => managedImageKey(item) === focusedImagePath);
      if (focused) {
        return focused;
      }
    }
    return selectedItems[0] || items[0] || null;
  }, [focusedImagePath, items, selectedItems]);
  const focusedDetail = focusedItem ? detailItemsByPath[managedImageDetailCacheKey(focusedItem, galleryView)] : undefined;
  const hasTeamLibrary = Boolean(activeTeam?.id);
  const teamManager = canManageTeamImages(activeTeam);
  const teamTextManager = canManageTeamTextAssets(activeTeam);
  const canMutateTextAssets = textAssetScope === "mine" || Boolean(textAssetScope === "team" && teamTextManager && activeTeam?.id);
  const canCreateTextAssetInScope = canCreateTextAssets && canMutateTextAssets;
  const canUpdateTextAssetInScope = canUpdateTextAssets && canMutateTextAssets;
  const canDeleteTextAssetInScope = canDeleteTextAssets && canMutateTextAssets;
  const canMutateTextAssetCollections = canManageTextAssetCollections && canMutateTextAssets;
  const focusedTextAsset = useMemo(() => {
    if (focusedTextAssetId) {
      const focused = textAssets.find((item) => item.id === focusedTextAssetId);
      if (focused) {
        return focused;
      }
    }
    return textAssets[0] || null;
  }, [focusedTextAssetId, textAssets]);
  const canMutateCollections = canManageCollections && (galleryView === "mine" || Boolean(galleryView === "team" && teamManager && activeTeam?.id));
  const selectedRealCollection = selectedCollectionId && selectedCollectionId !== MANAGED_IMAGE_UNCLASSIFIED_COLLECTION_ID;
  const collectionReadOnlyHint = canMutateCollections
    ? "一张图只能属于一个素材集，调整归类会替换原素材集。"
    : galleryView === "team"
        ? "团队普通成员可查看素材集，归类修改需要 owner 或 manager 权限。"
        : "";
  const selectedCount = selectedItems.length;
  const allSelected = items.length > 0 && selectedCount === items.length;
  const libraryViewLabel = galleryView === "team" ? "团队" : galleryView === "all" ? "全部" : "个人";
  const imageCountLabel = hasMoreItems ? `已加载 ${items.length} 张` : `当前 ${items.length} 张`;
  const textAssetCountLabel = textAssetHasMore ? `已加载 ${textAssets.length} 条` : `当前 ${textAssets.length} 条`;
  const activeLibraryScopeLabel = assetKind === "text" ? textAssetScopeLabel(textAssetScope) : libraryViewLabel;
  const activeLibraryCountLabel = assetKind === "text" ? textAssetCountLabel : imageCountLabel;
  const selectedTextAssetCollectionLabel = !selectedTextAssetCollectionId
    ? "全部文本"
    : selectedTextAssetCollectionId === MANAGED_TEXT_ASSET_UNCLASSIFIED_COLLECTION_ID
      ? "未归类"
      : textAssetCollections.find((item) => item.id === selectedTextAssetCollectionId)?.name || "未命名";
  const selectedCollectionLabel = !selectedCollectionId
    ? "全部素材"
    : selectedCollectionId === MANAGED_IMAGE_UNCLASSIFIED_COLLECTION_ID
      ? "未归类"
      : collections.find((item) => item.id === selectedCollectionId)?.name || "未命名";
  const libraryHintText = galleryView === "team" && teamStorage
    ? `容量 ${formatStorageBytes(teamStorage.used_bytes)} / ${formatStorageBytes(teamStorage.limit_bytes)}，剩余 ${formatStorageBytes(teamStorage.remaining_bytes)}。`
    : `仅保留最近 ${imageRetentionDays} 天，过期图片会自动清理。`;
  const textAssetHintText = textAssetScope === "team"
    ? teamTextManager
      ? "团队文本素材由 owner 或 manager 维护，团队成员可复用。"
      : "团队文本素材可查看，维护需要 owner 或 manager 权限。"
    : "个人文本素材可在画布和社媒运营中复用。";
  const textAssetCollectionHintText = canMutateTextAssetCollections
    ? "一条文本素材只能属于一个素材集，调整归类会替换原素材集。"
    : textAssetScope === "team"
      ? "团队普通成员可查看文本素材集，归类修改需要 owner 或 manager 权限。"
      : "";
  const isMutatingImages = downloadingKey !== null || isDeleting || isMovingToTeam || tagMutatingPath !== null || collectionMutating;
  const isMutatingTextAssets = isTextAssetSaving || isTextAssetDeleting || textAssetCollectionMutating;
  const textAssetCollectionFilterMatchesItem = useCallback((item: Pick<ManagedTextAsset, "collection_id">) => {
    if (!selectedTextAssetCollectionId) {
      return true;
    }
    if (selectedTextAssetCollectionId === MANAGED_TEXT_ASSET_UNCLASSIFIED_COLLECTION_ID) {
      return !item.collection_id;
    }
    return item.collection_id === selectedTextAssetCollectionId;
  }, [selectedTextAssetCollectionId]);
  const collectionFilterMatchesItem = useCallback((item: Pick<ManagedImageSummary, "collection_id">) => {
    if (!selectedCollectionId) {
      return true;
    }
    if (selectedCollectionId === MANAGED_IMAGE_UNCLASSIFIED_COLLECTION_ID) {
      return !item.collection_id;
    }
    return item.collection_id === selectedCollectionId;
  }, [selectedCollectionId]);
  const showImageLoadingState = isLoading && items.length === 0;
  const showImageErrorState = !isLoading && loadError !== "" && items.length === 0;
  const showImageEmptyState = !isLoading && loadError === "" && items.length === 0;
  const clearLoadedItemsForQueryChange = useCallback(() => {
    setItems([]);
    setNextCursor("");
    setHasMoreItems(false);
  }, []);
  const clearLoadedTextAssetsForQueryChange = useCallback(() => {
    setTextAssets([]);
    setTextAssetNextCursor("");
    setTextAssetHasMore(false);
    setFocusedTextAssetId(null);
  }, []);
  const clearTextAssetCollectionFilter = useCallback(() => {
    setSelectedTextAssetCollectionId("");
    clearLoadedTextAssetsForQueryChange();
  }, [clearLoadedTextAssetsForQueryChange]);
  const buildImageListFilters = useCallback((cursor = "") => ({
    scope: galleryView,
    team_id: galleryView === "team" ? activeTeam?.id || "" : "",
    start_date: startDate,
    end_date: endDate,
    page_size: IMAGE_MANAGER_PAGE_SIZE,
    cursor,
    search: searchKeyword.trim(),
    visibility: visibilityFilter,
    format: formatFilter,
    orientation: orientationFilter,
    resolution: resolutionFilter,
    aspect_ratio: aspectRatioFilter,
    collection_id: selectedCollectionId,
    tags: selectedTags,
  }), [activeTeam?.id, aspectRatioFilter, endDate, formatFilter, galleryView, orientationFilter, resolutionFilter, searchKeyword, selectedCollectionId, selectedTags, startDate, visibilityFilter]);

  const keepImageGridScrollInBounds = useCallback(() => {
    window.requestAnimationFrame(() => {
      const scroller = imageGridScrollerRef.current;
      if (scroller) {
        scroller.scrollTop = Math.min(scroller.scrollTop, Math.max(0, scroller.scrollHeight - scroller.clientHeight));
      }
      imageGridRef.current?.scrollBy({ top: 0 });
    });
  }, []);

  useEffect(() => {
    keepImageGridScrollInBounds();
  }, [items.length, keepImageGridScrollInBounds]);

  useEffect(() => {
    let canceled = false;
    fetchTeamWorkspace()
      .then((workspace) => {
        if (canceled) return;
        const team = Array.isArray(workspace.teams) ? workspace.teams[0] : undefined;
        setActiveTeam(team || null);
        setTeamStorage(team?.storage || null);
      })
      .catch(() => {
        if (!canceled) {
          setActiveTeam(null);
          setTeamStorage(null);
        }
      });
    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    if (galleryView === "all") {
      setGalleryView("mine");
      setSelectedImageIds({});
      clearLoadedItemsForQueryChange();
      setLoadError("");
    }
  }, [clearLoadedItemsForQueryChange, galleryView]);

  useEffect(() => {
    if (galleryView === "team" && !activeTeam?.id) {
      setGalleryView("mine");
    }
  }, [activeTeam?.id, galleryView]);

  useEffect(() => {
    if (textAssetScope === "team" && !activeTeam?.id) {
      setTextAssetScope("mine");
      clearTextAssetCollectionFilter();
    }
  }, [activeTeam?.id, clearTextAssetCollectionFilter, textAssetScope]);

  useEffect(() => {
    if (initialQueryAppliedRef.current) {
      return;
    }
    const params = new URLSearchParams(location.search);
    const queryCollectionId = params.get("collection_id")?.trim() || "";
    if (!queryCollectionId) {
      initialQueryAppliedRef.current = true;
      return;
    }
    const queryScope = params.get("scope")?.trim();
    const nextGalleryView: ImageGalleryView = queryScope === "team" && activeTeam?.id ? "team" : "mine";
    if (queryScope === "team" && !activeTeam?.id) {
      return;
    }
    initialQueryAppliedRef.current = true;
    setGalleryView(nextGalleryView);
    setSelectedCollectionId(queryCollectionId);
    setSelectedImageIds({});
    clearLoadedItemsForQueryChange();
    setLoadError("");
  }, [activeTeam?.id, clearLoadedItemsForQueryChange, location.search]);

  const openImagePreview = useCallback((_item: ManagedImageSummary, index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  }, []);

  const copyManagedImageURL = useCallback(async (item: ManagedImageSummary) => {
    try {
      const detail = await loadManagedImageDetail(item);
      await navigator.clipboard.writeText(detail.url);
      toast.success("图片地址已复制");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "复制图片地址失败");
    }
  }, [loadManagedImageDetail]);

  const collectionScopeOptions = useCallback(() => ({
    scope: galleryView,
    team_id: galleryView === "team" ? activeTeam?.id || "" : "",
  }), [activeTeam?.id, galleryView]);

  const loadCollections = useCallback(async () => {
    try {
      const data = await fetchManagedImageCollections(collectionScopeOptions());
      setCollections(data.items);
      setUnclassifiedCount(data.unclassified_count);
      if (
        selectedCollectionId &&
        selectedCollectionId !== MANAGED_IMAGE_UNCLASSIFIED_COLLECTION_ID &&
        !data.items.some((item) => item.id === selectedCollectionId)
      ) {
        setSelectedCollectionId("");
        clearLoadedItemsForQueryChange();
      }
    } catch {
      setCollections([]);
      setUnclassifiedCount(0);
      if (selectedCollectionId) {
        setSelectedCollectionId("");
        clearLoadedItemsForQueryChange();
      }
    }
  }, [clearLoadedItemsForQueryChange, collectionScopeOptions, selectedCollectionId]);

  const openCollectionEditor = useCallback((target: CollectionEditTarget) => {
    if (!canMutateCollections) {
      toast.error("当前账号没有素材集管理权限");
      return;
    }
    setCollectionEditTarget(target);
    setCollectionNameInput(target.mode === "rename" ? target.collection.name : "");
  }, [canMutateCollections]);

  const handleSaveCollection = async () => {
    if (!canMutateCollections || !collectionEditTarget || collectionMutating) {
      return;
    }
    const name = collectionNameInput.trim();
    if (!name) {
      toast.error("请输入素材集名称");
      return;
    }
    setCollectionMutating(true);
    try {
      const options = collectionScopeOptions();
      const data = collectionEditTarget.mode === "create"
        ? await createManagedImageCollection(name, options)
        : await renameManagedImageCollection(collectionEditTarget.collection.id, name, options);
      const nextCollectionsResult = Array.isArray(data.items)
        ? { items: data.items, unclassified_count: Number(data.unclassified_count) || 0 }
        : await fetchManagedImageCollections(options);
      const nextCollections = nextCollectionsResult.items;
      setCollections(nextCollections);
      setUnclassifiedCount(nextCollectionsResult.unclassified_count);
      if (collectionEditTarget.mode === "create") {
        setSelectedCollectionId(data.item.id);
      } else {
        clearImageManagerCache();
        setItems((current) => {
          const next = current.map((item) => item.collection_id === data.item.id ? { ...item, collection_name: data.item.name } : item);
          updateImageManagerCache(currentCacheKey, next, nextCursor, hasMoreItems, imageRetentionDays);
          return next;
        });
        setDetailItemsByPath((current) => {
          const next = { ...current };
          Object.entries(next).forEach(([key, detail]) => {
            if (detail.collection_id === data.item.id) {
              next[key] = { ...detail, collection_name: data.item.name };
            }
          });
          return next;
        });
      }
      setCollectionEditTarget(null);
      setCollectionNameInput("");
      toast.success(collectionEditTarget.mode === "create" ? "素材集已创建" : "素材集已重命名");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存素材集失败");
    } finally {
      setCollectionMutating(false);
    }
  };

  const handleDeleteCollection = async () => {
    if (!canMutateCollections || !collectionDeleteTarget || collectionMutating) {
      return;
    }
    const collection = collectionDeleteTarget.collection;
    setCollectionMutating(true);
    try {
      const options = collectionScopeOptions();
      const data = await deleteManagedImageCollection(collection.id, options);
      const nextCollectionsResult = Array.isArray(data.items)
        ? { items: data.items, unclassified_count: Number(data.unclassified_count) || 0 }
        : await fetchManagedImageCollections(options);
      const nextCollections = nextCollectionsResult.items;
      setCollections(nextCollections);
      setUnclassifiedCount(nextCollectionsResult.unclassified_count);
      clearImageManagerCache();
      if (selectedCollectionId === collection.id) {
        setSelectedCollectionId("");
        clearLoadedItemsForQueryChange();
      } else {
        setItems((current) => {
          const next = current.map((item) => item.collection_id === collection.id ? { ...item, collection_id: "", collection_name: "" } : item);
          updateImageManagerCache(currentCacheKey, next, nextCursor, hasMoreItems, imageRetentionDays);
          return next;
        });
      }
      setDetailItemsByPath((current) => {
        const next = { ...current };
        Object.entries(next).forEach(([key, detail]) => {
          if (detail.collection_id === collection.id) {
            next[key] = { ...detail, collection_id: "", collection_name: "" };
          }
        });
        return next;
      });
      setCollectionDeleteTarget(null);
      toast.success(data.cleared > 0 ? `素材集已删除，已移出 ${data.cleared} 张图片` : "素材集已删除");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除素材集失败");
    } finally {
      setCollectionMutating(false);
    }
  };

  const openCollectionAssign = (targetItems: ManagedImageSummary[], collectionId = "") => {
    if (!canMutateCollections) {
      toast.error("当前账号没有素材集管理权限");
      return;
    }
    if (targetItems.length === 0) {
      toast.error("请先选择图片");
      return;
    }
    if (collections.length === 0 && collectionId) {
      toast.error("当前没有可用素材集");
      return;
    }
    setCollectionAssignTarget({ items: targetItems, collectionId });
  };

  const handleConfirmAssignCollection = async () => {
    if (!canMutateCollections || !collectionAssignTarget || collectionMutating) {
      return;
    }
    const paths = Array.from(new Set(collectionAssignTarget.items.map((item) => item.path)));
    if (paths.length === 0) {
      setCollectionAssignTarget(null);
      return;
    }
    const collection = collections.find((item) => item.id === collectionAssignTarget.collectionId);
    if (collectionAssignTarget.collectionId && !collection) {
      toast.error("请选择素材集");
      return;
    }
    setCollectionMutating(true);
    try {
      const data = await updateManagedImageCollectionItems(collectionAssignTarget.collectionId, paths, collectionScopeOptions());
      const collectionID = data.collection_id || "";
      const collectionName = data.collection_name || collection?.name || "";
      const pathSet = new Set(data.paths || paths);
      const nextCollectionsResult = Array.isArray(data.items)
        ? { items: data.items, unclassified_count: Number(data.unclassified_count) || 0 }
        : await fetchManagedImageCollections(collectionScopeOptions());
      const nextCollections = nextCollectionsResult.items;
      setCollections(nextCollections);
      setUnclassifiedCount(nextCollectionsResult.unclassified_count);
      clearImageManagerCache();
      setItems((current) => {
        const next = current
          .map((item) => pathSet.has(item.path) ? { ...item, collection_id: collectionID, collection_name: collectionName } : item)
          .filter(collectionFilterMatchesItem);
        updateImageManagerCache(currentCacheKey, next, nextCursor, hasMoreItems, imageRetentionDays);
        return next;
      });
      setDetailItemsByPath((current) => {
        const next = { ...current };
        Object.entries(next).forEach(([key, detail]) => {
          if (pathSet.has(detail.path)) {
            next[key] = { ...detail, collection_id: collectionID, collection_name: collectionName };
          }
        });
        return next;
      });
      setSelectedImageIds((current) => {
        const next = { ...current };
        pathSet.forEach((path) => {
          if (selectedCollectionId && pathSet.has(path) && !collectionFilterMatchesItem({ collection_id: collectionID })) {
            delete next[path];
          }
        });
        return next;
      });
      setCollectionAssignTarget(null);
      toast.success(collectionID ? `已加入素材集「${collectionName}」` : `已从素材集移出 ${data.updated} 张图片`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新素材集归类失败");
    } finally {
      setCollectionMutating(false);
    }
  };

  const copyImagePrompt = async (item: ManagedImageSummary) => {
    try {
      const detail = await loadManagedImageDetail(item);
      const prompt = reusableImagePrompt(detail);
      await navigator.clipboard.writeText(prompt);
      toast.success("提示词已复制");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "复制提示词失败");
    }
  };

  const addImageToCanvas = (item: ManagedImageSummary) => {
    writeCanvasAssetIntent([item]);
    navigate(location.search.includes("ui_mode=embedded") ? "/canvas?ui_mode=embedded" : "/canvas");
    toast.success("已准备加入画布");
  };

  const addImageAsReference = async (item: ManagedImageSummary) => {
    try {
      const detail = await loadManagedImageDetail(item);
      writeSimilarImageIntent({
        prompt: "参考这张图继续创作。",
        sourceImageUrl: detail.url,
        sourceImageUrls: [detail.url],
        sourceKind: "public_image",
        sourceImageName: detail.name,
      });
      navigate(location.search.includes("ui_mode=embedded") ? "/image?ui_mode=embedded" : "/image");
      toast.success("已加入创作台参考图");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "读取图片失败");
    }
  };

  useEffect(() => {
    void loadCollections();
  }, [loadCollections]);

  const loadImages = useCallback(async ({ force = false }: { force?: boolean } = {}) => {
    const cached = getImageManagerCache(currentCacheKey);
    if (!force && cached) {
      setItems(cached.items);
      setNextCursor(cached.nextCursor);
      setHasMoreItems(cached.hasMore);
      setImageRetentionDays(cached.retentionDays);
      setSelectedImageIds({});
      setLoadError("");
      if (isFreshImageManagerCache(cached)) {
        setIsLoading(false);
        return;
      }
    }

    activeLoadRef.current?.abort();
    const controller = new AbortController();
    activeLoadRef.current = controller;
    setIsLoading(true);
    setLoadError("");
    try {
      const data = await fetchManagedImages(
        buildImageListFilters(),
        { signal: controller.signal },
      );
      updateImageManagerCache(currentCacheKey, data.items, data.next_cursor, data.has_more, data.retention_days);
      setItems(data.items);
      setImageRetentionDays(data.retention_days);
      if (data.team_storage) {
        setTeamStorage(data.team_storage);
      }
      setNextCursor(data.next_cursor);
      setHasMoreItems(data.has_more);
      setSelectedImageIds({});
    } catch (error) {
      if (controller.signal.aborted || isRequestCanceled(error)) {
        return;
      }
      const message = error instanceof Error ? error.message : "加载图片失败";
      if (force || !cached) {
        setLoadError(message);
        toast.error(message);
      }
    } finally {
      if (activeLoadRef.current === controller) {
        activeLoadRef.current = null;
        setIsLoading(false);
      }
    }
  }, [buildImageListFilters, currentCacheKey]);

  const refreshNewImages = useCallback(async () => {
    if (isLoading || isMutatingImages || autoRefreshAbortRef.current) {
      return;
    }

    const controller = new AbortController();
    autoRefreshAbortRef.current = controller;
    setIsAutoRefreshing(true);
    try {
      const data = await fetchManagedImages(
        buildImageListFilters(),
        { signal: controller.signal },
      );
      const incomingByPath = new Map(data.items.map((item) => [item.path, item]));
      const hasSameItems = items.length === data.items.length && items.every((item, index) => {
        const incoming = data.items[index];
        return incoming && incoming.path === item.path && JSON.stringify(incoming) === JSON.stringify(item);
      });
      if (hasSameItems) {
        setImageRetentionDays(data.retention_days);
        if (data.team_storage) {
          setTeamStorage(data.team_storage);
        }
        return;
      }
      setImageRetentionDays(data.retention_days);
      if (data.team_storage) {
        setTeamStorage(data.team_storage);
      }
      setItems((current) => {
        const next = data.items.map((item) => ({ ...current.find((currentItem) => currentItem.path === item.path), ...item }));
        if (next.length === current.length && next.every((item, index) => item.path === current[index]?.path && JSON.stringify(item) === JSON.stringify(current[index]))) {
          return current;
        }
        updateImageManagerCache(currentCacheKey, next, nextCursor, hasMoreItems, imageRetentionDays);
        return next;
      });
      setSelectedImageIds((current) => {
        const incomingPaths = new Set(incomingByPath.keys());
        let changed = false;
        const next: Record<string, boolean> = {};
        Object.entries(current).forEach(([key, selected]) => {
          if (selected && incomingPaths.has(key)) {
            next[key] = selected;
          } else if (selected) {
            changed = true;
          }
        });
        return changed ? next : current;
      });
    } catch (error) {
      if (controller.signal.aborted || isRequestCanceled(error)) {
        return;
      }
    } finally {
      if (autoRefreshAbortRef.current === controller) {
        autoRefreshAbortRef.current = null;
      }
      setIsAutoRefreshing(false);
    }
  }, [buildImageListFilters, currentCacheKey, hasMoreItems, imageRetentionDays, isLoading, isMutatingImages, items, nextCursor]);

  const loadMoreImages = useCallback(async () => {
    if (isLoading || isLoadingMore || !hasMoreItems || !nextCursor) {
      return;
    }
    setIsLoadingMore(true);
    try {
      const data = await fetchManagedImages(buildImageListFilters(nextCursor));
      setItems((current) => {
        const seen = new Set(current.map((item) => item.path));
        const next = [...current, ...data.items.filter((item) => !seen.has(item.path))];
        updateImageManagerCache(currentCacheKey, next, data.next_cursor, data.has_more, data.retention_days);
        return next;
      });
      setImageRetentionDays(data.retention_days);
      setNextCursor(data.next_cursor);
      setHasMoreItems(data.has_more);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载更多图片失败");
    } finally {
      setIsLoadingMore(false);
    }
  }, [buildImageListFilters, currentCacheKey, hasMoreItems, isLoading, isLoadingMore, nextCursor]);

  const textAssetScopeOptions = useCallback((): { scope: TextAssetScope; team_id?: string } => ({
    scope: textAssetScope,
    ...(textAssetScope === "team" ? { team_id: activeTeam?.id || "" } : {}),
  }), [activeTeam?.id, textAssetScope]);

  const loadTextAssetCollections = useCallback(async () => {
    if (!canViewTextAssets) {
      setTextAssetCollections([]);
      setTextAssetUnclassifiedCount(0);
      return;
    }
    if (textAssetScope === "team" && !activeTeam?.id) {
      setTextAssetCollections([]);
      setTextAssetUnclassifiedCount(0);
      return;
    }
    try {
      const data = await fetchManagedTextAssetCollections(textAssetScopeOptions());
      setTextAssetCollections(data.items);
      setTextAssetUnclassifiedCount(data.unclassified_count);
      if (
        selectedTextAssetCollectionId &&
        selectedTextAssetCollectionId !== MANAGED_TEXT_ASSET_UNCLASSIFIED_COLLECTION_ID &&
        !data.items.some((item) => item.id === selectedTextAssetCollectionId)
      ) {
        setSelectedTextAssetCollectionId("");
        clearLoadedTextAssetsForQueryChange();
      }
    } catch {
      setTextAssetCollections([]);
      setTextAssetUnclassifiedCount(0);
      if (selectedTextAssetCollectionId) {
        setSelectedTextAssetCollectionId("");
        clearLoadedTextAssetsForQueryChange();
      }
    }
  }, [activeTeam?.id, canViewTextAssets, clearLoadedTextAssetsForQueryChange, selectedTextAssetCollectionId, textAssetScope, textAssetScopeOptions]);

  const loadTextAssets = useCallback(async (
    options: { append?: boolean; cursor?: string; force?: boolean } = {},
  ) => {
    if (!canViewTextAssets) {
      setTextAssets([]);
      setTextAssetNextCursor("");
      setTextAssetHasMore(false);
      setTextAssetLoadError("当前账号没有查看文本素材权限");
      return;
    }
    if (textAssetScope === "team" && !activeTeam?.id) {
      setTextAssets([]);
      setTextAssetNextCursor("");
      setTextAssetHasMore(false);
      setTextAssetLoadError("");
      return;
    }

    const append = options.append === true;
    textAssetLoadRef.current?.abort();
    const controller = new AbortController();
    textAssetLoadRef.current = controller;
    if (append) {
      setIsTextAssetLoadingMore(true);
    } else {
      setIsTextAssetLoading(true);
      setTextAssetLoadError("");
      if (options.force) {
        setTextAssets([]);
      }
    }

    try {
      const result = await fetchManagedTextAssets({
        scope: textAssetScope,
        team_id: textAssetScope === "team" ? activeTeam?.id || "" : "",
        search: textAssetSearch.trim(),
        collection_id: selectedTextAssetCollectionId,
        page_size: TEXT_ASSET_PAGE_SIZE,
        cursor: options.cursor || "",
      }, { signal: controller.signal });
      setTextAssets((current) => {
        if (!append) {
          return result.items;
        }
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...result.items.filter((item) => !seen.has(item.id))];
      });
      setTextAssetNextCursor(result.next_cursor);
      setTextAssetHasMore(result.has_more);
      setTextAssetLoadError("");
    } catch (error) {
      if (controller.signal.aborted || isRequestCanceled(error)) {
        return;
      }
      const message = error instanceof Error ? error.message : "加载文本素材失败";
      setTextAssetLoadError(message);
      toast.error(message);
    } finally {
      if (textAssetLoadRef.current === controller) {
        textAssetLoadRef.current = null;
      }
      setIsTextAssetLoading(false);
      setIsTextAssetLoadingMore(false);
    }
  }, [activeTeam?.id, canViewTextAssets, selectedTextAssetCollectionId, textAssetScope, textAssetSearch]);

  const loadMoreTextAssets = useCallback(async () => {
    if (isTextAssetLoading || isTextAssetLoadingMore || !textAssetHasMore || !textAssetNextCursor) {
      return;
    }
    await loadTextAssets({ append: true, cursor: textAssetNextCursor });
  }, [isTextAssetLoading, isTextAssetLoadingMore, loadTextAssets, textAssetHasMore, textAssetNextCursor]);

  const handleGalleryViewChange = useCallback((view: ImageGalleryView) => {
    if (view === galleryView) {
      return;
    }
    setGalleryView(view);
    setSelectedCollectionId("");
    setSelectedImageIds({});
    clearLoadedItemsForQueryChange();
    setLoadError("");
  }, [clearLoadedItemsForQueryChange, galleryView]);

  const handleAssetKindChange = useCallback((kind: AssetLibraryKind) => {
    setAssetKind(kind);
    setIsImageActionsOpen(false);
    setIsMobileFiltersOpen(false);
    closeDrawer();
  }, [closeDrawer]);

  const handleTextAssetScopeChange = useCallback((scope: TextAssetScope) => {
    if (scope === textAssetScope) {
      return;
    }
    setTextAssetScope(scope);
    setSelectedTextAssetCollectionId("");
    clearLoadedTextAssetsForQueryChange();
    setTextAssetLoadError("");
  }, [clearLoadedTextAssetsForQueryChange, textAssetScope]);

  const updateTextAssetCollectionFilter = useCallback((collectionId: string) => {
    setSelectedTextAssetCollectionId(collectionId);
    clearLoadedTextAssetsForQueryChange();
  }, [clearLoadedTextAssetsForQueryChange]);

  const updateCollectionFilter = useCallback((collectionId: string) => {
    setSelectedCollectionId(collectionId);
    setSelectedImageIds({});
    clearLoadedItemsForQueryChange();
  }, [clearLoadedItemsForQueryChange]);

  const updateSearchKeyword = (value: string) => {
    setSearchKeyword(value);
    setSelectedImageIds({});
    clearLoadedItemsForQueryChange();
  };

  const updateTextAssetSearch = (value: string) => {
    setTextAssetSearch(value);
    clearLoadedTextAssetsForQueryChange();
  };

  const updateVisibilityFilter = (value: ImageVisibilityFilter) => {
    setVisibilityFilter(value);
    setSelectedImageIds({});
    clearLoadedItemsForQueryChange();
  };

  const updateFormatFilter = (value: ImageFormatFilter) => {
    setFormatFilter(value);
    setSelectedImageIds({});
    clearLoadedItemsForQueryChange();
  };

  const updateOrientationFilter = (value: ImageOrientationFilter) => {
    setOrientationFilter(value);
    setSelectedImageIds({});
    clearLoadedItemsForQueryChange();
  };

  const updateResolutionFilter = (value: ImageResolutionFilter) => {
    setResolutionFilter(value);
    setSelectedImageIds({});
    clearLoadedItemsForQueryChange();
  };

  const updateAspectRatioFilter = (value: ImageAspectRatioFilter) => {
    setAspectRatioFilter(value);
    setSelectedImageIds({});
    clearLoadedItemsForQueryChange();
  };

  const toggleTagFilter = (tag: string) => {
    setSelectedTags((current) => (
      current.includes(tag)
        ? current.filter((item) => item !== tag)
        : [...current, tag]
    ));
    setSelectedImageIds({});
    clearLoadedItemsForQueryChange();
  };

  const clearImageFilters = () => {
    setStartDate("");
    setEndDate("");
    setSearchKeyword("");
    setVisibilityFilter("all");
    setFormatFilter("all");
    setOrientationFilter("all");
    setResolutionFilter("all");
    setAspectRatioFilter("all");
    setSelectedCollectionId("");
    setSelectedTags([]);
    setSelectedImageIds({});
    clearLoadedItemsForQueryChange();
  };

  const clearTextAssetSearch = () => {
    setTextAssetSearch("");
    clearLoadedTextAssetsForQueryChange();
  };

  const toggleAutoRefresh = () => {
    const next = !isAutoRefreshEnabled;
    setIsAutoRefreshEnabled(next);
    if (!next) {
      autoRefreshAbortRef.current?.abort();
      setIsAutoRefreshing(false);
    }
    setAutoRefreshSecondsRemaining(autoRefreshInterval);
  };

  const updateAutoRefreshInterval = (interval: ImageAutoRefreshInterval) => {
    setAutoRefreshInterval(interval);
    setAutoRefreshSecondsRemaining(interval);
    setIsAutoRefreshEnabled(true);
    setAutoRefreshMenuScope(null);
  };

  const imageGridComponents = useMemo(
    () => ({
      List: forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function ImageManagerGridList(props, ref) {
        return (
          <div
            {...props}
            ref={ref}
            className={cn(
              props.className,
              "grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 min-[1800px]:grid-cols-6",
            )}
          />
        );
      }),
      Footer: () =>
        hasMoreItems || isLoadingMore ? (
          <div className="col-span-full flex min-h-16 items-center justify-center py-4 text-sm text-muted-foreground">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 shadow-sm">
              <LoaderCircle className={cn("size-4 text-[#1456f0]", isLoadingMore && "animate-spin")} />
              {isLoadingMore ? "加载中..." : `下滑加载更多（已加载 ${items.length} 张）`}
            </div>
          </div>
        ) : items.length > IMAGE_MANAGER_PAGE_SIZE ? (
          <div className="col-span-full flex justify-center py-4 text-xs text-muted-foreground">已显示全部图片</div>
        ) : null,
    }),
    [hasMoreItems, isLoadingMore, items.length],
  );

  const toggleImageSelection = (item: ManagedImageSummary) => {
    const key = managedImageKey(item);
    setSelectedImageIds((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const toggleAllImages = () => {
    if (allSelected) {
      setSelectedImageIds({});
      return;
    }

    setSelectedImageIds(
      Object.fromEntries(items.map((item) => [managedImageKey(item), true])),
    );
  };

  const downloadItems = async (key: string, downloadItems: ManagedImageSummary[]) => {
    if (downloadItems.length === 0 || downloadingKey) {
      return;
    }

    setDownloadingKey(key);
    try {
      for (let index = 0; index < downloadItems.length; index += 1) {
        const item = downloadItems[index];
        const detail = await loadManagedImageDetail(item);
        await downloadManagedImage(detail, items.indexOf(item), {
          scope: galleryView,
          team_id: galleryView === "team" ? activeTeam?.id || "" : "",
        });
        if (index < downloadItems.length - 1) {
          await sleep(120);
        }
      }
    } catch (error) {
      toast.error(imageDownloadErrorMessage(error));
    } finally {
      setDownloadingKey(null);
    }
  };

  const handleGenerateSimilar = async (item: ManagedImageSummary) => {
    if (!canGenerateSimilar) {
      toast.error("当前账号没有创作台权限");
      return;
    }
    let detail: ManagedImageDetail;
    try {
      detail = await loadManagedImageDetail(item);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "读取图片详情失败");
      return;
    }
    const sourceImageUrls = reusableImageReferenceUrls(detail);
    writeSimilarImageIntent({
      prompt: reusableImagePrompt(detail),
      sourceImageUrl: sourceImageUrls[0] || detail.url,
      sourceImageUrls,
      sourceKind: sourceImageUrls[0] === detail.url ? "public_image" : "original_references",
      sourceImageName: detail.name,
      model: detail.share_prompt_parameters ? detail.model : undefined,
      quality: detail.share_prompt_parameters ? detail.quality : undefined,
      requestedSize: detail.share_prompt_parameters ? detail.requested_size : undefined,
      resolutionPreset: detail.share_prompt_parameters ? detail.resolution_preset : undefined,
      outputFormat: detail.share_prompt_parameters ? detail.output_format : undefined,
      outputCompression: detail.share_prompt_parameters ? detail.output_compression : undefined,
    });
    navigate(location.search.includes("ui_mode=embedded") ? "/image?ui_mode=embedded" : "/image");
    toast.success(sourceImageUrls[0] === detail.url ? "已使用当前图准备同款生成" : "已带入原始参考图和生成参数");
  };

  const openTextAssetCollectionEditor = useCallback((target: TextAssetCollectionEditTarget) => {
    if (!canMutateTextAssetCollections) {
      toast.error(textAssetScope === "team" ? "团队文本素材集需要 owner 或 manager 维护" : "当前账号没有文本素材集管理权限");
      return;
    }
    setTextAssetCollectionEditTarget(target);
    setTextAssetCollectionNameInput(target.mode === "rename" ? target.collection.name : "");
  }, [canMutateTextAssetCollections, textAssetScope]);

  const handleSaveTextAssetCollection = async () => {
    if (!canMutateTextAssetCollections || !textAssetCollectionEditTarget || textAssetCollectionMutating) {
      return;
    }
    const name = textAssetCollectionNameInput.trim();
    if (!name) {
      toast.error("请输入文本素材集名称");
      return;
    }
    setTextAssetCollectionMutating(true);
    try {
      const options = textAssetScopeOptions();
      const data = textAssetCollectionEditTarget.mode === "create"
        ? await createManagedTextAssetCollection(name, options)
        : await renameManagedTextAssetCollection(textAssetCollectionEditTarget.collection.id, name, options);
      const nextCollectionsResult = Array.isArray(data.items)
        ? { items: data.items, unclassified_count: Number(data.unclassified_count) || 0 }
        : await fetchManagedTextAssetCollections(options);
      setTextAssetCollections(nextCollectionsResult.items);
      setTextAssetUnclassifiedCount(nextCollectionsResult.unclassified_count);
      if (textAssetCollectionEditTarget.mode === "create") {
        setSelectedTextAssetCollectionId(data.item.id);
        clearLoadedTextAssetsForQueryChange();
      } else {
        setTextAssets((current) => current.map((item) => item.collection_id === data.item.id ? { ...item, collection_name: data.item.name } : item));
      }
      setTextAssetCollectionEditTarget(null);
      setTextAssetCollectionNameInput("");
      toast.success(textAssetCollectionEditTarget.mode === "create" ? "文本素材集已创建" : "文本素材集已重命名");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存文本素材集失败");
    } finally {
      setTextAssetCollectionMutating(false);
    }
  };

  const handleDeleteTextAssetCollection = async () => {
    if (!canMutateTextAssetCollections || !textAssetCollectionDeleteTarget || textAssetCollectionMutating) {
      return;
    }
    const collection = textAssetCollectionDeleteTarget.collection;
    setTextAssetCollectionMutating(true);
    try {
      const options = textAssetScopeOptions();
      const data = await deleteManagedTextAssetCollection(collection.id, options);
      const nextCollectionsResult = Array.isArray(data.items)
        ? { items: data.items, unclassified_count: Number(data.unclassified_count) || 0 }
        : await fetchManagedTextAssetCollections(options);
      setTextAssetCollections(nextCollectionsResult.items);
      setTextAssetUnclassifiedCount(nextCollectionsResult.unclassified_count);
      if (selectedTextAssetCollectionId === collection.id) {
        setSelectedTextAssetCollectionId("");
        clearLoadedTextAssetsForQueryChange();
      } else {
        setTextAssets((current) => current.map((item) => item.collection_id === collection.id ? { ...item, collection_id: "", collection_name: "" } : item));
      }
      setTextAssetCollectionDeleteTarget(null);
      toast.success(data.cleared > 0 ? `文本素材集已删除，已移出 ${data.cleared} 条文本` : "文本素材集已删除");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除文本素材集失败");
    } finally {
      setTextAssetCollectionMutating(false);
    }
  };

  const openTextAssetCollectionAssign = (item: ManagedTextAsset, collectionId = "") => {
    if (!canMutateTextAssetCollections) {
      toast.error(textAssetScope === "team" ? "团队文本素材集需要 owner 或 manager 维护" : "当前账号没有文本素材集管理权限");
      return;
    }
    if (collectionId && textAssetCollections.length === 0) {
      toast.error("当前没有可用文本素材集");
      return;
    }
    setTextAssetCollectionAssignTarget({ item, collectionId });
  };

  const handleConfirmAssignTextAssetCollection = async () => {
    if (!canMutateTextAssetCollections || !textAssetCollectionAssignTarget || textAssetCollectionMutating) {
      return;
    }
    const collection = textAssetCollections.find((item) => item.id === textAssetCollectionAssignTarget.collectionId);
    if (textAssetCollectionAssignTarget.collectionId && !collection) {
      toast.error("请选择文本素材集");
      return;
    }
    const id = textAssetCollectionAssignTarget.item.id;
    setTextAssetCollectionMutating(true);
    try {
      const data = await updateManagedTextAssetCollectionItems(textAssetCollectionAssignTarget.collectionId, [id], textAssetScopeOptions());
      const collectionID = data.collection_id || "";
      const collectionName = data.collection_name || collection?.name || "";
      const updatedIDs = new Set(data.ids || [id]);
      const nextCollectionsResult = Array.isArray(data.items)
        ? { items: data.items, unclassified_count: Number(data.unclassified_count) || 0 }
        : await fetchManagedTextAssetCollections(textAssetScopeOptions());
      setTextAssetCollections(nextCollectionsResult.items);
      setTextAssetUnclassifiedCount(nextCollectionsResult.unclassified_count);
      setTextAssets((current) => current
        .map((item) => updatedIDs.has(item.id) ? { ...item, collection_id: collectionID, collection_name: collectionName } : item)
        .filter(textAssetCollectionFilterMatchesItem));
      setTextAssetCollectionAssignTarget(null);
      toast.success(collectionID ? `已加入文本素材集「${collectionName}」` : "已从文本素材集移出");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新文本素材集归类失败");
    } finally {
      setTextAssetCollectionMutating(false);
    }
  };

  const openTextAssetEditor = useCallback((target: TextAssetEditorTarget) => {
    if (target.mode === "create" && !canCreateTextAssetInScope) {
      toast.error(textAssetScope === "team" ? "团队文本素材需要 owner 或 manager 维护" : "当前账号没有创建文本素材权限");
      return;
    }
    if (target.mode === "edit" && !canUpdateTextAssetInScope) {
      toast.error(textAssetScope === "team" ? "团队文本素材需要 owner 或 manager 维护" : "当前账号没有编辑文本素材权限");
      return;
    }
    setTextAssetEditorTarget(target);
    setTextAssetNameInput(target.mode === "edit" ? target.item.name : "");
    setTextAssetContentInput(target.mode === "edit" ? target.item.content : "");
  }, [canCreateTextAssetInScope, canUpdateTextAssetInScope, textAssetScope]);

  const handleSaveTextAsset = async () => {
    if (!textAssetEditorTarget || isTextAssetSaving) {
      return;
    }
    const isCreate = textAssetEditorTarget.mode === "create";
    if (isCreate && !canCreateTextAssetInScope) {
      return;
    }
    if (!isCreate && !canUpdateTextAssetInScope) {
      return;
    }
    const content = textAssetContentInput;
    if (!content.trim()) {
      toast.error("请输入文本素材内容");
      return;
    }
    if (Array.from(content).length > TEXT_ASSET_MAX_CONTENT_LENGTH) {
      toast.error(`文本素材最多 ${TEXT_ASSET_MAX_CONTENT_LENGTH.toLocaleString("zh-CN")} 字符`);
      return;
    }

    setIsTextAssetSaving(true);
    try {
      const payload = {
        name: textAssetNameInput.trim() || undefined,
        content,
        ...(isCreate && selectedTextAssetCollectionId && selectedTextAssetCollectionId !== MANAGED_TEXT_ASSET_UNCLASSIFIED_COLLECTION_ID
          ? { collection_id: selectedTextAssetCollectionId }
          : {}),
      };
      const options = textAssetScopeOptions();
      const item = isCreate
        ? await createManagedTextAsset(payload, options)
        : await updateManagedTextAsset(textAssetEditorTarget.item.id, payload, options);
      setTextAssets((current) => {
        const withoutExisting = current.filter((existing) => existing.id !== item.id);
        if (isCreate) {
          return [item, ...withoutExisting];
        }
        return current.some((existing) => existing.id === item.id)
          ? current.map((existing) => existing.id === item.id ? item : existing)
          : [item, ...current];
      });
      setFocusedTextAssetId(item.id);
      await loadTextAssets({ force: true });
      setFocusedTextAssetId(item.id);
      setTextAssetEditorTarget(null);
      setTextAssetNameInput("");
      setTextAssetContentInput("");
      toast.success(isCreate ? "文本素材已创建" : "文本素材已保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (isCreate ? "创建文本素材失败" : "保存文本素材失败"));
    } finally {
      setIsTextAssetSaving(false);
    }
  };

  const copyTextAssetContent = async (item: ManagedTextAsset) => {
    try {
      await navigator.clipboard.writeText(item.content);
      toast.success("文本素材已复制");
    } catch {
      toast.error("复制文本素材失败");
    }
  };

  const openDeleteTextAssetConfirm = (item: ManagedTextAsset) => {
    if (!canDeleteTextAssetInScope) {
      toast.error(textAssetScope === "team" ? "团队文本素材需要 owner 或 manager 维护" : "当前账号没有删除文本素材权限");
      return;
    }
    setDeleteTextAssetTarget({ item });
  };

  const handleConfirmDeleteTextAsset = async () => {
    if (!deleteTextAssetTarget || isTextAssetDeleting || !canDeleteTextAssetInScope) {
      return;
    }
    const id = deleteTextAssetTarget.item.id;
    setIsTextAssetDeleting(true);
    try {
      await deleteManagedTextAsset(id, textAssetScopeOptions());
      setTextAssets((current) => current.filter((item) => item.id !== id));
      setFocusedTextAssetId((current) => (current === id ? null : current));
      setDeleteTextAssetTarget(null);
      toast.success("文本素材已删除");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除文本素材失败");
    } finally {
      setIsTextAssetDeleting(false);
    }
  };

  const openDeleteConfirm = (targetItems: ManagedImageSummary[]) => {
    if (!canDeleteImages || (galleryView === "team" && !teamManager)) {
      return;
    }
    const paths = Array.from(new Set(targetItems.map((item) => item.path)));
    if (paths.length === 0) {
      toast.error("没有可删除的图片");
      return;
    }
    setDeleteTarget({ paths });
  };

  const openMoveToTeamConfirm = (targetItems: ManagedImageSummary[]) => {
    if (!canMoveImagesToTeam) {
      toast.error("当前账号没有移动到团队素材库权限");
      return;
    }
    if (!activeTeam?.id) {
      toast.error("当前没有可用团队");
      return;
    }
    const pendingItems = targetItems.filter((item) => item.library_scope !== "team");
    if (pendingItems.length === 0) {
      toast.info("所选图片已在团队素材库");
      return;
    }
    setTeamImagesTarget({ items: pendingItems });
  };

  const handleConfirmMoveToTeam = async () => {
    if (!canMoveImagesToTeam || !activeTeam?.id || !teamImagesTarget || isMovingToTeam) {
      return;
    }
    const paths = Array.from(new Set(teamImagesTarget.items.map((item) => item.path)));
    if (paths.length === 0) {
      setTeamImagesTarget(null);
      return;
    }
    const pathSet = new Set(paths);
    setIsMovingToTeam(true);
    try {
      const data = await moveManagedImagesToTeamLibrary(paths, activeTeam.id);
      clearImageManagerCache();
      if (data.storage) {
        setTeamStorage(data.storage);
      }
      setItems((current) => current.filter((item) => !pathSet.has(item.path)));
      setSelectedImageIds((current) => {
        const next = { ...current };
        paths.forEach((path) => {
          delete next[path];
        });
        return next;
      });
      setTeamImagesTarget(null);
      keepImageGridScrollInBounds();
      toast.success(`已移动 ${data.moved} 张图片到团队素材库`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "移动到团队素材库失败");
    } finally {
      setIsMovingToTeam(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!canDeleteImages || (galleryView === "team" && !teamManager) || !deleteTarget || isDeleting) {
      return;
    }

    const paths = deleteTarget.paths;
    const pathSet = new Set(paths);
    setIsDeleting(true);
    try {
      const deleteOptions = galleryView === "team" && activeTeam?.id ? { scope: "team" as const, team_id: activeTeam.id } : {};
      const data = await deleteManagedImages(paths, deleteOptions);
      if ("team_storage" in data && data.team_storage) {
        setTeamStorage(data.team_storage);
      }
      removeCachedManagedImages(paths);
      invalidateAuthenticatedImageCacheForPaths(paths);
      setItems((current) => current.filter((item) => !pathSet.has(item.path)));
      keepImageGridScrollInBounds();
      setSelectedImageIds((current) => {
        const next = { ...current };
        paths.forEach((path) => {
          delete next[path];
        });
        return next;
      });
      setLightboxOpen(false);
      setLightboxIndex(0);
      setDeleteTarget(null);
      toast.success(
        data.missing > 0
          ? `已删除 ${data.deleted} 张图片，${data.missing} 张已不存在`
          : `已删除 ${data.deleted} 张图片`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除图片失败");
    } finally {
      setIsDeleting(false);
    }
  };

  const openTagEditor = (item: ManagedImageSummary) => {
    if (!canEditImageTags || (galleryView === "team" && !teamManager)) {
      return;
    }
    setTagEditTarget({ item });
    setTagInput((item.tags || []).join(", "));
  };

  const handleSaveImageTags = async () => {
    if (!canEditImageTags || (galleryView === "team" && !teamManager) || !tagEditTarget || tagMutatingPath) {
      return;
    }
    const tags = normalizeImageTags(tagInput);
    const path = tagEditTarget.item.path;
    setTagMutatingPath(path);
    try {
      const tagOptions = galleryView === "team" && activeTeam?.id ? { scope: "team" as const, team_id: activeTeam.id } : {};
      const data = await updateManagedImageTags(path, tags, tagOptions);
      const updatedTags = normalizeImageTags(data.item.tags || tags);
      clearImageManagerCache();
      setAllImageTags((current) => normalizeImageTags([...current, ...updatedTags]));
      setDetailItemsByPath((current) => {
        const next = { ...current };
        managedImageDetailCacheKeys(tagEditTarget.item).forEach((key) => {
          const detail = next[key];
          if (detail) {
            next[key] = { ...detail, tags: updatedTags };
          }
        });
        return next;
      });
      setItems((current) => {
        const next = current.map((item) => (item.path === path ? { ...item, tags: updatedTags } : item));
        updateImageManagerCache(currentCacheKey, next, nextCursor, hasMoreItems, imageRetentionDays);
        return next;
      });
      setTagEditTarget(null);
      toast.success("图片标签已更新");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新图片标签失败");
    } finally {
      setTagMutatingPath(null);
    }
  };

  useEffect(() => {
    void loadImages();
  }, [loadImages]);

  useEffect(() => {
    if (assetKind !== "text") {
      return;
    }
    void loadTextAssetCollections();
    void loadTextAssets();
  }, [assetKind, loadTextAssetCollections, loadTextAssets]);

  useEffect(() => {
    if (!focusedItem || focusedDetail) {
      return;
    }
    let canceled = false;
    loadManagedImageDetail(focusedItem).catch((error) => {
      if (!canceled) {
        toast.error(error instanceof Error ? error.message : "加载图片详情失败");
      }
    });
    return () => {
      canceled = true;
    };
  }, [focusedDetail, focusedItem, loadManagedImageDetail]);

  useEffect(() => {
    let canceled = false;
    fetchManagedImageTags({ scope: galleryView, team_id: galleryView === "team" ? activeTeam?.id || "" : "" })
      .then((tags) => {
        if (!canceled) {
          setAllImageTags(tags);
        }
      })
      .catch(() => {
        if (!canceled) {
          setAllImageTags([]);
        }
      });
    return () => {
      canceled = true;
    };
  }, [activeTeam?.id, galleryView, items]);

  useEffect(() => {
    if (!isAutoRefreshEnabled) {
      autoRefreshAbortRef.current?.abort();
      setIsAutoRefreshing(false);
      setAutoRefreshSecondsRemaining(autoRefreshInterval);
      return;
    }

    let secondsUntilNextRefresh = autoRefreshInterval;
    setAutoRefreshSecondsRemaining(secondsUntilNextRefresh);
    const timer = window.setInterval(() => {
      secondsUntilNextRefresh -= 1;
      if (secondsUntilNextRefresh <= 0) {
        void refreshNewImages();
        secondsUntilNextRefresh = autoRefreshInterval;
      }
      setAutoRefreshSecondsRemaining(secondsUntilNextRefresh);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [autoRefreshInterval, isAutoRefreshEnabled, refreshNewImages]);

  useEffect(() => {
    autoRefreshAbortRef.current?.abort();
  }, [currentCacheKey]);

  useEffect(() => {
    return () => {
      activeLoadRef.current?.abort();
      autoRefreshAbortRef.current?.abort();
      textAssetLoadRef.current?.abort();
    };
  }, []);

  const autoRefreshButtonLabel = isAutoRefreshEnabled
    ? `自动刷新: ${autoRefreshSecondsRemaining}s`
    : "自动刷新: 关闭";

  const renderDateRangeFilter = (className = "w-full sm:w-full") => (
    <DateRangeFilter
      className={className}
      startDate={startDate}
      endDate={endDate}
      onChange={(start, end) => {
        setStartDate(start);
        setEndDate(end);
        setSelectedImageIds({});
        clearLoadedItemsForQueryChange();
      }}
    />
  );

  const renderSearchFilter = (placeholder = "搜索文件、路径、作者、日期、尺寸") => (
    <div className="relative min-w-0">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={searchKeyword}
        onChange={(event) => updateSearchKeyword(event.target.value)}
        placeholder={placeholder}
        className="h-10 rounded-lg pr-9 pl-9"
      />
      {searchKeyword ? (
        <button
          type="button"
          className="absolute top-1/2 right-2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
          onClick={() => updateSearchKeyword("")}
          aria-label="清空搜索"
          title="清空搜索"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );

  const renderTextAssetSearch = () => (
    <div className="relative min-w-0">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={textAssetSearch}
        onChange={(event) => updateTextAssetSearch(event.target.value)}
        placeholder="搜索文本素材名称或内容"
        className="h-10 rounded-lg pr-9 pl-9"
      />
      {textAssetSearch ? (
        <button
          type="button"
          className="absolute top-1/2 right-2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
          onClick={clearTextAssetSearch}
          aria-label="清空搜索"
          title="清空搜索"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );

  const renderFilterControls = () => (
    <>
      <Select value={visibilityFilter} onValueChange={(value) => updateVisibilityFilter(value as ImageVisibilityFilter)}>
        <SelectTrigger className="h-10 min-w-0 rounded-lg">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="private">私有</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      <Select value={formatFilter} onValueChange={(value) => updateFormatFilter(value as ImageFormatFilter)}>
        <SelectTrigger className="h-10 min-w-0 rounded-lg">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="all">全部格式</SelectItem>
            <SelectItem value="png">PNG</SelectItem>
            <SelectItem value="jpg">JPG</SelectItem>
            <SelectItem value="webp">WEBP</SelectItem>
            <SelectItem value="gif">GIF</SelectItem>
            <SelectItem value="other">其他</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      <Select value={orientationFilter} onValueChange={(value) => updateOrientationFilter(value as ImageOrientationFilter)}>
        <SelectTrigger className="h-10 min-w-0 rounded-lg">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="all">全部方向</SelectItem>
            <SelectItem value="landscape">横图</SelectItem>
            <SelectItem value="portrait">竖图</SelectItem>
            <SelectItem value="square">方图</SelectItem>
            <SelectItem value="unknown">未知尺寸</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      <Select value={resolutionFilter} onValueChange={(value) => updateResolutionFilter(value as ImageResolutionFilter)}>
        <SelectTrigger className="h-10 min-w-0 rounded-lg">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {IMAGE_RESOLUTION_FILTERS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Select value={aspectRatioFilter} onValueChange={(value) => updateAspectRatioFilter(value as ImageAspectRatioFilter)}>
        <SelectTrigger className="h-10 min-w-0 rounded-lg">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {IMAGE_ASPECT_RATIO_FILTERS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </>
  );

  const renderTagFilters = () => (
    <div className="min-w-0 rounded-xl border border-border bg-background/70 p-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="inline-flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Tag className="size-3.5" />
          <span>标签</span>
        </div>
        {selectedTags.length > 0 ? (
          <button
            type="button"
            className="text-xs text-[#1456f0]"
            onClick={() => {
              setSelectedTags([]);
              clearLoadedItemsForQueryChange();
            }}
          >
            清空
          </button>
        ) : null}
      </div>
      {allImageTags.length > 0 ? (
        <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
          {allImageTags.map((tag) => {
            const active = selectedTags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTagFilter(tag)}
                className={cn(
                  "inline-flex h-7 max-w-full items-center rounded-full border px-2 text-xs transition",
                  active
                    ? "border-[#1456f0] bg-[#eef4ff] text-[#1456f0]"
                    : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <span className="truncate">{tag}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="py-1 text-xs text-muted-foreground">暂无标签</div>
      )}
    </div>
  );

  const renderAutoRefreshControls = (
    menuScope: AutoRefreshMenuScope,
    className = "flex min-w-0 items-center gap-2",
  ) => (
    <div className={className}>
      <Popover
        open={autoRefreshMenuScope === menuScope}
        onOpenChange={(open) => setAutoRefreshMenuScope(open ? menuScope : null)}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="h-10 min-w-0 flex-1 justify-start rounded-lg px-3 text-sm font-medium"
            aria-label={autoRefreshButtonLabel}
          >
            <RefreshCw className={cn("size-4", isAutoRefreshing && "animate-spin")} />
            <span className="truncate">{autoRefreshButtonLabel}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={8}
          className="w-[min(calc(100vw-2rem),17.5rem)] p-1"
        >
          <div className="flex flex-col gap-1" role="menu">
            <Button
              type="button"
              variant="ghost"
              className="h-10 w-full justify-between rounded-md px-3 text-sm font-normal"
              onClick={toggleAutoRefresh}
              role="menuitemcheckbox"
              aria-checked={isAutoRefreshEnabled}
            >
              <span>启用自动刷新</span>
              {isAutoRefreshEnabled ? (
                <Check className="size-4 text-[#21b8a6]" />
              ) : (
                <span className="size-4" aria-hidden="true" />
              )}
            </Button>
            {AUTO_REFRESH_INTERVAL_OPTIONS.map((interval) => {
              const selected = autoRefreshInterval === interval;
              return (
                <Button
                  key={interval}
                  type="button"
                  variant="ghost"
                  className="h-10 w-full justify-between rounded-md px-3 text-sm font-normal"
                  onClick={() => updateAutoRefreshInterval(interval)}
                  role="menuitemradio"
                  aria-checked={selected}
                >
                  <span>{interval} 秒</span>
                  {selected ? (
                    <Check className="size-4 text-[#21b8a6]" />
                  ) : (
                    <span className="size-4" aria-hidden="true" />
                  )}
                </Button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-10 rounded-lg"
        disabled={isLoading || isMutatingImages}
        onClick={() => void loadImages({ force: true })}
        aria-label="刷新素材库"
        title="刷新素材库"
      >
        <RefreshCw className={cn("size-4", isLoading && "animate-spin")} />
      </Button>
    </div>
  );

  const renderLibraryControls = useCallback((compact = false, closeAfterSelect = false) => (
    <>
      <div className={cn("flex shrink-0 min-w-0 flex-col justify-start gap-2 overflow-hidden", compact ? "" : "min-h-[112px]")}>
        <div className="inline-flex h-10 w-full shrink-0 items-center rounded-lg border border-border bg-muted/50 p-1">
          {[
            { value: "image" as const, label: "图片", icon: ImageIcon },
            { value: "text" as const, label: "文本", icon: FileText },
          ].map((option) => {
            const Icon = option.icon;
            const active = assetKind === option.value;
            return (
              <button
                key={option.value}
                type="button"
                className={cn(
                  "inline-flex h-8 min-w-0 flex-1 basis-0 items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap rounded-md px-3 text-sm font-medium leading-none transition",
                  active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => {
                  handleAssetKindChange(option.value);
                  if (closeAfterSelect) {
                    closeDrawer();
                  }
                }}
                aria-pressed={active}
              >
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{option.label}</span>
              </button>
            );
          })}
        </div>
        <div className="inline-flex h-10 w-full shrink-0 items-center rounded-lg border border-border bg-muted/50 p-1">
          {(assetKind === "text"
            ? [
                { value: "mine" as const, label: "个人", icon: Type },
                ...(hasTeamLibrary ? [{ value: "team" as const, label: "团队", icon: Users }] : []),
              ]
            : [
                { value: "mine" as const, label: "个人", icon: ImageIcon },
                ...(hasTeamLibrary ? [{ value: "team" as const, label: "团队", icon: Users }] : []),
              ]).map((option) => {
            const Icon = option.icon;
            const active = assetKind === "text" ? textAssetScope === option.value : galleryView === option.value;
            return (
              <button
                key={option.value}
                type="button"
                className={`inline-flex h-8 min-w-0 flex-1 basis-0 items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap rounded-md px-3 text-sm font-medium leading-none transition ${
                  active
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => {
                  if (assetKind === "text") {
                    handleTextAssetScopeChange(option.value as TextAssetScope);
                  } else {
                    handleGalleryViewChange(option.value as ImageGalleryView);
                  }
                  if (closeAfterSelect) {
                    closeDrawer();
                  }
                }}
                aria-pressed={active}
              >
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{option.label}</span>
              </button>
            );
          })}
        </div>
        <div className="flex h-5 shrink-0 min-w-0 items-center gap-x-2 overflow-hidden text-sm leading-5 text-muted-foreground">
          {assetKind === "text" ? <FileText className="size-4 shrink-0" /> : <ImageIcon className="size-4 shrink-0" />}
          <span className="shrink-0">{activeLibraryScopeLabel}</span>
          <span className="min-w-0 truncate">{activeLibraryCountLabel}</span>
        </div>
      </div>

      {assetKind === "image" ? (
      <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-background/70 p-2">
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
            <Folder className="size-4 text-muted-foreground" />
            <span>素材集</span>
          </div>
          {canMutateCollections ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 rounded-lg px-2 text-xs"
              onClick={() => openCollectionEditor({ mode: "create" })}
            >
              <FolderPlus className="size-3.5" />
              新建
            </Button>
          ) : null}
        </div>
        <div className={cn("flex flex-col gap-1 overflow-y-auto pr-1", compact ? "max-h-[42dvh]" : "max-h-44")}>
          <button
            type="button"
            className={cn(
              "flex h-9 min-w-0 items-center justify-between gap-2 rounded-lg px-2 text-left text-sm transition",
              !selectedCollectionId
                ? "bg-[#eef4ff] text-[#1456f0] dark:bg-sky-950/30 dark:text-sky-300"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            onClick={() => {
              updateCollectionFilter("");
              if (closeAfterSelect) {
                closeDrawer();
              }
            }}
          >
            <span className="min-w-0 truncate">全部素材</span>
            <span className="shrink-0 rounded-full bg-background px-2 py-0.5 text-[11px] text-muted-foreground">{items.length}</span>
          </button>
          <button
            type="button"
            className={cn(
              "flex h-9 min-w-0 items-center justify-between gap-2 rounded-lg px-2 text-left text-sm transition",
              selectedCollectionId === MANAGED_IMAGE_UNCLASSIFIED_COLLECTION_ID
                ? "bg-[#eef4ff] text-[#1456f0] dark:bg-sky-950/30 dark:text-sky-300"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            onClick={() => {
              updateCollectionFilter(MANAGED_IMAGE_UNCLASSIFIED_COLLECTION_ID);
              if (closeAfterSelect) {
                closeDrawer();
              }
            }}
          >
            <span className="min-w-0 truncate">未归类</span>
            <span className="shrink-0 rounded-full bg-background px-2 py-0.5 text-[11px] text-muted-foreground">{unclassifiedCount}</span>
          </button>
          {collections.length > 0 ? collections.map((collection) => {
            const active = selectedCollectionId === collection.id;
            return (
              <div
                key={collection.id}
                className={cn(
                  "group flex min-w-0 items-center gap-1 rounded-lg transition",
                  active ? "bg-[#eef4ff] text-[#1456f0] dark:bg-sky-950/30 dark:text-sky-300" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <button
                  type="button"
                  className="flex h-9 min-w-0 flex-1 items-center justify-between gap-2 px-2 text-left text-sm"
                  onClick={() => {
                    updateCollectionFilter(collection.id);
                    if (closeAfterSelect) {
                      closeDrawer();
                    }
                  }}
                  title={collection.name}
                >
                  <span className="min-w-0 truncate">{collection.name}</span>
                  <span className="shrink-0 rounded-full bg-background px-2 py-0.5 text-[11px] text-muted-foreground">{collection.images_count}</span>
                </button>
                {canMutateCollections && active ? (
                  <div className="flex shrink-0 items-center pr-1">
                    <button
                      type="button"
                      className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-background hover:text-foreground"
                      onClick={() => openCollectionEditor({ mode: "rename", collection })}
                      title="重命名素材集"
                      aria-label="重命名素材集"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-rose-50 hover:text-rose-600"
                      onClick={() => setCollectionDeleteTarget({ collection })}
                      title="删除素材集"
                      aria-label="删除素材集"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ) : null}
              </div>
            );
          }) : (
            <div className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
              {canMutateCollections ? "暂无素材集，可先新建角色、场景或风格分组。" : "暂无素材集"}
            </div>
          )}
        </div>
        {collectionReadOnlyHint ? (
          <div className="rounded-lg border border-dashed border-border px-3 py-2 text-xs leading-5 text-muted-foreground">
            {collectionReadOnlyHint}
          </div>
        ) : null}
      </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-background/70 p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
              <Folder className="size-4 text-muted-foreground" />
              <span>文本素材集</span>
            </div>
            {canMutateTextAssetCollections ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 rounded-lg px-2 text-xs"
                onClick={() => openTextAssetCollectionEditor({ mode: "create" })}
              >
                <FolderPlus className="size-3.5" />
                新建
              </Button>
            ) : null}
          </div>
          <div className={cn("flex flex-col gap-1 overflow-y-auto pr-1", compact ? "max-h-[42dvh]" : "max-h-44")}>
            <button
              type="button"
              className={cn(
                "flex h-9 min-w-0 items-center justify-between gap-2 rounded-lg px-2 text-left text-sm transition",
                !selectedTextAssetCollectionId
                  ? "bg-[#eef4ff] text-[#1456f0] dark:bg-sky-950/30 dark:text-sky-300"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              onClick={() => {
                updateTextAssetCollectionFilter("");
                if (closeAfterSelect) {
                  closeDrawer();
                }
              }}
            >
              <span className="min-w-0 truncate">全部文本</span>
              <span className="shrink-0 rounded-full bg-background px-2 py-0.5 text-[11px] text-muted-foreground">{textAssets.length}</span>
            </button>
            <button
              type="button"
              className={cn(
                "flex h-9 min-w-0 items-center justify-between gap-2 rounded-lg px-2 text-left text-sm transition",
                selectedTextAssetCollectionId === MANAGED_TEXT_ASSET_UNCLASSIFIED_COLLECTION_ID
                  ? "bg-[#eef4ff] text-[#1456f0] dark:bg-sky-950/30 dark:text-sky-300"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              onClick={() => {
                updateTextAssetCollectionFilter(MANAGED_TEXT_ASSET_UNCLASSIFIED_COLLECTION_ID);
                if (closeAfterSelect) {
                  closeDrawer();
                }
              }}
            >
              <span className="min-w-0 truncate">未归类</span>
              <span className="shrink-0 rounded-full bg-background px-2 py-0.5 text-[11px] text-muted-foreground">{textAssetUnclassifiedCount}</span>
            </button>
            {textAssetCollections.length > 0 ? textAssetCollections.map((collection) => {
              const active = selectedTextAssetCollectionId === collection.id;
              return (
                <div
                  key={collection.id}
                  className={cn(
                    "group flex min-w-0 items-center gap-1 rounded-lg transition",
                    active ? "bg-[#eef4ff] text-[#1456f0] dark:bg-sky-950/30 dark:text-sky-300" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <button
                    type="button"
                    className="flex h-9 min-w-0 flex-1 items-center justify-between gap-2 px-2 text-left text-sm"
                    onClick={() => {
                      updateTextAssetCollectionFilter(collection.id);
                      if (closeAfterSelect) {
                        closeDrawer();
                      }
                    }}
                    title={collection.name}
                  >
                    <span className="min-w-0 truncate">{collection.name}</span>
                    <span className="shrink-0 rounded-full bg-background px-2 py-0.5 text-[11px] text-muted-foreground">{collection.texts_count}</span>
                  </button>
                  {canMutateTextAssetCollections && active ? (
                    <div className="flex shrink-0 items-center pr-1">
                      <button
                        type="button"
                        className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-background hover:text-foreground"
                        onClick={() => openTextAssetCollectionEditor({ mode: "rename", collection })}
                        title="重命名文本素材集"
                        aria-label="重命名文本素材集"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-rose-50 hover:text-rose-600"
                        onClick={() => setTextAssetCollectionDeleteTarget({ collection })}
                        title="删除文本素材集"
                        aria-label="删除文本素材集"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            }) : (
              <div className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                {canMutateTextAssetCollections ? "暂无文本素材集，可先新建提示词、商品文案或运营素材分组。" : "暂无文本素材集"}
              </div>
            )}
          </div>
          {textAssetCollectionHintText ? (
            <div className="rounded-lg border border-dashed border-border px-3 py-2 text-xs leading-5 text-muted-foreground">
              {textAssetCollectionHintText}
            </div>
          ) : null}
        </div>
      )}
    </>
  ), [
    activeLibraryCountLabel,
    activeLibraryScopeLabel,
    assetKind,
    canMutateCollections,
    canMutateTextAssetCollections,
    closeDrawer,
    collectionReadOnlyHint,
    collections,
    galleryView,
    handleAssetKindChange,
    handleGalleryViewChange,
    handleTextAssetScopeChange,
    hasTeamLibrary,
    items.length,
    openCollectionEditor,
    openTextAssetCollectionEditor,
    selectedCollectionId,
    selectedTextAssetCollectionId,
    textAssetCollectionHintText,
    textAssetCollections,
    textAssetScope,
    textAssetUnclassifiedCount,
    textAssets.length,
    unclassifiedCount,
    updateCollectionFilter,
    updateTextAssetCollectionFilter,
  ]);

  const mobileLibraryPanel = useMemo(
    () => ({
      title: "素材库",
      description: `${activeLibraryScopeLabel} · ${activeLibraryCountLabel}`,
      content: (
        <div className="h-[min(56dvh,520px)] min-h-[220px] overflow-y-auto pr-1">
          <div className="grid gap-3">
            {renderLibraryControls(true, true)}
          </div>
        </div>
      ),
    }),
    [activeLibraryCountLabel, activeLibraryScopeLabel, renderLibraryControls],
  );

  useEffect(() => {
    setPanel(mobileLibraryPanel);
    return () => clearPanel();
  }, [clearPanel, mobileLibraryPanel, setPanel]);

  return (
    <section className="flex h-full min-h-0 flex-col gap-4 pt-3 pb-20 sm:pb-24">
      <div className="grid min-w-0 gap-4 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_320px]">
        <aside className="hidden min-w-0 flex-col gap-3 rounded-[18px] border border-border bg-background/80 p-3 shadow-[0_6px_20px_rgba(15,23,42,0.04)] sm:p-4 lg:sticky lg:top-4 lg:flex lg:self-start">
          {renderLibraryControls()}

          {assetKind === "image" ? (
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium text-foreground">筛选项</div>
              {hasActiveFilters ? (
                <button
                  type="button"
                  className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  onClick={clearImageFilters}
                >
                  <X className="size-3.5" />
                  清空
                </button>
              ) : null}
            </div>
            <div className="lg:hidden">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  {renderSearchFilter("搜索图片")}
                </div>
                <button
                  type="button"
                  className={cn(
                    "relative inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition hover:bg-accent hover:text-accent-foreground",
                    isMobileFiltersOpen && "border-[#bfdbfe] bg-[#eef4ff] text-[#1456f0] dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-sky-300",
                  )}
                  onClick={() => setIsMobileFiltersOpen((open) => !open)}
                  aria-label={isMobileFiltersOpen ? "收起筛选项" : "展开筛选项"}
                  aria-expanded={isMobileFiltersOpen}
                  title={isMobileFiltersOpen ? "收起筛选" : "筛选"}
                >
                  <SlidersHorizontal className="size-4" />
                  {activeFilterCount > 0 ? (
                    <span className="absolute -top-0.5 -right-0.5 inline-flex size-4 items-center justify-center rounded-full bg-[#1456f0] text-[10px] font-semibold text-white">
                      {activeFilterCount}
                    </span>
                  ) : null}
                </button>
              </div>
              {activeFilterLabels.length > 0 && !isMobileFiltersOpen ? (
                <div className="hide-scrollbar mt-2 flex gap-1.5 overflow-x-auto">
                  {activeFilterLabels.map((label) => (
                    <span
                      key={label}
                      className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
                    >
                      {label}
                    </span>
                  ))}
                  <button
                    type="button"
                    className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium text-[#1456f0]"
                    onClick={clearImageFilters}
                  >
                    清除
                  </button>
                </div>
              ) : null}
              {isMobileFiltersOpen ? (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div className="col-span-2">{renderDateRangeFilter("w-full sm:w-full")}</div>
                  {renderFilterControls()}
                  <div className="col-span-2">{renderTagFilters()}</div>
                  <Button
                    type="button"
                    variant="outline"
                    className="col-span-2 h-9 rounded-full text-xs shadow-none"
                    onClick={clearImageFilters}
                    disabled={!hasActiveFilters}
                  >
                    重置筛选
                  </Button>
                </div>
              ) : null}
              {renderAutoRefreshControls("mobile", "mt-2 flex min-w-0 items-center gap-2")}
              <div className="mt-2 flex h-9 min-w-0 items-center gap-1.5 rounded-xl border border-border bg-background/60 px-3 text-xs leading-none text-muted-foreground">
                <Info className="size-3.5 shrink-0" />
                <span className="min-w-0 truncate">{libraryHintText}</span>
              </div>
            </div>

            <div className="hidden flex-col gap-2 lg:flex">
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                {renderDateRangeFilter("w-full sm:w-full")}
                {renderSearchFilter()}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {renderFilterControls()}
                {renderAutoRefreshControls("desktop", "col-span-2 flex min-w-0 items-center gap-2")}
              </div>
              {renderTagFilters()}
              <div className="flex h-9 min-w-0 items-center gap-1.5 rounded-xl border border-border bg-background/60 px-3 text-xs leading-none text-muted-foreground">
                <Info className="size-3.5 shrink-0" />
                <span className="min-w-0 truncate">{libraryHintText}</span>
              </div>
            </div>
          </div>
          ) : (
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium text-foreground">文本筛选</div>
                {textAssetSearch ? (
                  <button
                    type="button"
                    className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    onClick={clearTextAssetSearch}
                  >
                    <X className="size-3.5" />
                    清空
                  </button>
                ) : null}
              </div>
              {renderTextAssetSearch()}
              <div className="flex min-w-0 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 min-w-0 flex-1 rounded-lg"
                  disabled={isTextAssetLoading || isMutatingTextAssets}
                  onClick={() => void loadTextAssets({ force: true })}
                >
                  <RefreshCw className={cn("size-4", isTextAssetLoading && "animate-spin")} />
                  刷新
                </Button>
                {canCreateTextAssetInScope ? (
                  <Button
                    type="button"
                    className="h-10 min-w-0 flex-1 rounded-lg"
                    disabled={isMutatingTextAssets}
                    onClick={() => openTextAssetEditor({ mode: "create" })}
                  >
                    <Type className="size-4" />
                    新建
                  </Button>
                ) : null}
              </div>
              <div className="flex min-h-9 min-w-0 items-center gap-1.5 rounded-xl border border-border bg-background/60 px-3 py-2 text-xs leading-5 text-muted-foreground">
                <Info className="size-3.5 shrink-0" />
                <span className="min-w-0">{textAssetHintText}</span>
              </div>
            </div>
          )}

        </aside>

        <div className="min-w-0">
        <div className="mb-3 grid gap-2 lg:hidden">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full border border-border bg-background px-3 text-left text-sm font-medium"
              onClick={openDrawer}
            >
              <Folder className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">
                {assetKind === "text" ? `${textAssetScopeLabel(textAssetScope)} · ${selectedTextAssetCollectionLabel}` : `${libraryViewLabel} · ${selectedCollectionLabel}`}
              </span>
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{assetKind === "text" ? textAssets.length : items.length}</span>
            </button>
            {assetKind === "image" ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className={cn(
                  "size-10 rounded-full",
                  hasActiveFilters && "border-[#bfdbfe] bg-[#eef4ff] text-[#1456f0] dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-sky-300",
                )}
                onClick={() => setIsMobileFiltersOpen(true)}
                aria-label="打开筛选"
                title="筛选"
              >
                <SlidersHorizontal className="size-4" />
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-10 rounded-full"
              disabled={assetKind === "text" ? isTextAssetLoading || isMutatingTextAssets : isLoading || isMutatingImages}
              onClick={() => void (assetKind === "text" ? loadTextAssets({ force: true }) : loadImages({ force: true }))}
              aria-label="刷新素材库"
              title="刷新素材库"
            >
              <RefreshCw className={cn("size-4", (assetKind === "text" ? isTextAssetLoading : isLoading) && "animate-spin")} />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">{assetKind === "text" ? renderTextAssetSearch() : renderSearchFilter("搜索图片")}</div>
            {assetKind === "text" && canCreateTextAssetInScope ? (
              <Button
                type="button"
                className="h-10 shrink-0 rounded-full px-3"
                disabled={isMutatingTextAssets}
                onClick={() => openTextAssetEditor({ mode: "create" })}
              >
                <Type className="size-4" />
                新建
              </Button>
            ) : null}
          </div>
          {assetKind === "image" && activeFilterLabels.length > 0 ? (
            <div className="hide-scrollbar flex gap-1.5 overflow-x-auto">
              {activeFilterLabels.map((label) => (
                <span key={label} className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                  {label}
                </span>
              ))}
              <button type="button" className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium text-[#1456f0]" onClick={clearImageFilters}>
                清除
              </button>
            </div>
          ) : null}
        </div>
        {assetKind === "image" ? (
        <Popover open={isImageActionsOpen} onOpenChange={setIsImageActionsOpen}>
          <div className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-40 sm:right-6 sm:bottom-6">
            <PopoverTrigger asChild>
              <Button
                type="button"
                className="h-12 rounded-full px-4 shadow-[0_18px_50px_-24px_rgba(15,23,42,0.65)]"
                aria-label="打开图片操作"
              >
                <MoreHorizontal className="size-5" />
                <span>操作</span>
                {selectedCount > 0 ? (
                  <span className="ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-white/20 px-1.5 text-xs font-semibold text-white">
                    {selectedCount}
                  </span>
                ) : null}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              side="top"
              sideOffset={10}
              className="w-[min(calc(100vw-2rem),20rem)] p-2"
            >
              <div className="flex flex-col gap-1">
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  {hasMoreItems ? `已加载 ${items.length} 张` : `共 ${items.length} 张`}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-10 justify-start rounded-lg px-3 text-sm"
                  disabled={items.length === 0 || isMutatingImages}
                  onClick={toggleAllImages}
                >
                  <Check className="size-4" />
                  {allSelected ? "取消全选" : "全选"}
                </Button>
                {galleryView === "mine" && hasTeamLibrary && canMoveImagesToTeam ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-10 justify-start rounded-lg px-3 text-sm"
                    disabled={selectedCount === 0 || isMutatingImages}
                    onClick={() => {
                      setIsImageActionsOpen(false);
                      openMoveToTeamConfirm(selectedItems);
                    }}
                  >
                    {isMovingToTeam ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
                    移动到团队素材库 ({selectedCount})
                  </Button>
                ) : null}
                {canMutateCollections ? (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-10 justify-start rounded-lg px-3 text-sm"
                      disabled={selectedCount === 0 || collections.length === 0 || isMutatingImages}
                      onClick={() => {
                        setIsImageActionsOpen(false);
                        openCollectionAssign(selectedItems, collections[0]?.id || "");
                      }}
                    >
                      <Folder className="size-4" />
                      加入素材集 ({selectedCount})
                    </Button>
                    {selectedRealCollection ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-10 justify-start rounded-lg px-3 text-sm"
                        disabled={selectedCount === 0 || isMutatingImages}
                        onClick={() => {
                          setIsImageActionsOpen(false);
                          openCollectionAssign(selectedItems, "");
                        }}
                      >
                        <X className="size-4" />
                        移出当前素材集 ({selectedCount})
                      </Button>
                    ) : null}
                  </>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  className="h-10 justify-start rounded-lg px-3 text-sm"
                  disabled={selectedCount === 0 || isMutatingImages}
                  onClick={() => void downloadItems("selected", selectedItems)}
                >
                  {downloadingKey === "selected" ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Download className="size-4" />
                  )}
                  下载已选 ({selectedCount})
                </Button>
                {canDeleteImages && (galleryView !== "team" || teamManager) ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-10 justify-start rounded-lg px-3 text-sm text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                    disabled={selectedCount === 0 || isMutatingImages}
                    onClick={() => {
                      setIsImageActionsOpen(false);
                      openDeleteConfirm(selectedItems);
                    }}
                  >
                    <Trash2 className="size-4" />
                    删除已选 ({selectedCount})
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  className="h-10 justify-start rounded-lg px-3 text-sm"
                  disabled={items.length === 0 || isMutatingImages}
                  onClick={() => void downloadItems("all", items)}
                >
                  {downloadingKey === "all" ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Download className="size-4" />
                  )}
                  下载已加载 ({items.length})
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-10 justify-start rounded-lg px-3 text-sm"
                  disabled={isLoading || isMutatingImages}
                  onClick={() => void loadImages({ force: true })}
                >
                  <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
                  刷新
                </Button>
              </div>
            </PopoverContent>
          </div>
        </Popover>
        ) : null}

        <div className="h-[calc(100dvh-11rem)] min-h-[420px] overflow-hidden rounded-[20px] sm:min-h-[520px] lg:h-[calc(100dvh-14rem)]">
          {assetKind === "image" && showImageLoadingState ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-14 text-center">
              <div className="rounded-[16px] bg-[#edf4ff] p-4 text-[#1456f0] ring-1 ring-blue-100">
                <LoaderCircle className="size-7 animate-spin" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">正在加载图片</p>
              </div>
            </div>
          ) : null}

          {assetKind === "image" && showImageErrorState ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-14 text-center">
              <div className="rounded-[16px] bg-rose-50 p-4 text-rose-600 ring-1 ring-rose-100">
                <ImageIcon className="size-7" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">素材库加载失败</p>
                <p className="max-w-[32rem] text-sm leading-6 text-muted-foreground">{loadError}</p>
              </div>
              <Button variant="outline" className="h-9 rounded-lg px-3" onClick={() => void loadImages({ force: true })}>
                <RefreshCw className="size-4" />
                重试
              </Button>
            </div>
          ) : null}

          {assetKind === "image" && items.length > 0 ? (
            <VirtuosoGrid
              ref={imageGridRef}
              data={items}
              components={imageGridComponents}
              computeItemKey={(_, item) => managedImageKey(item)}
              itemClassName="min-w-0"
              scrollerRef={(ref) => {
                imageGridScrollerRef.current = ref;
              }}
              overscan={800}
              increaseViewportBy={{ top: 400, bottom: 800 }}
              style={{ height: "100%" }}
              endReached={() => void loadMoreImages()}
              itemContent={(index, item) => {
                const imageKey = managedImageKey(item);
                const selected = Boolean(selectedImageIds[imageKey]);
                const focused = focusedImagePath === imageKey;
                const dimensions = getManagedImageResolution(item);
                const ratioLabel = getManagedImageAspectRatio(item);
                const megapixelsLabel = formatManagedImageMegapixels(item);
                const sizeLabel = formatImageFileSize(item.size);
                const imageMeta = [dimensions, ratioLabel, megapixelsLabel, sizeLabel].filter(Boolean).join(" | ");
                const ownerLabel = imageOwnerLabel(item);
                return (
                  <figure
                    className={cn(
                      "group relative aspect-square overflow-hidden rounded-[22px] bg-background shadow-[0_0_15px_rgba(44,30,116,0.16)]",
                      selected && "ring-2 ring-[#1456f0]/80 ring-offset-2",
                    )}
                    onMouseLeave={(event) => blurFocusedElementInContainer(event.currentTarget)}
                    onBlurCapture={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget)) {
                        setFocusedImagePath((current) => (current === imageKey ? null : current));
                      }
                    }}
                  >
                    <button
                      type="button"
                      onClick={(event) => {
                        if (!window.matchMedia("(hover: hover)").matches) {
                          setFocusedImagePath(selected ? null : imageKey);
                        }
                        setFocusedImagePath(imageKey);
                        toggleImageSelection(item);
                        if (window.matchMedia("(hover: hover)").matches) {
                          event.currentTarget.blur();
                        }
                      }}
                      className="block h-full w-full cursor-pointer overflow-hidden text-left"
                      onFocus={() => setFocusedImagePath(imageKey)}
                      aria-label={selected ? "取消选择图片" : "选择图片"}
                    >
                      <AuthenticatedImage
                        src={managedImageCardSource(item)}
                        alt={item.name}
                        width={item.width || undefined}
                        height={item.height || undefined}
                        loading="lazy"
                        decoding="async"
                        sizes="(min-width: 1800px) 16vw, (min-width: 1536px) 20vw, (min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                        className="block h-full w-full object-cover transition duration-200 group-hover:brightness-95"
                      />
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        if (!window.matchMedia("(hover: hover)").matches) {
                          setFocusedImagePath(selected ? null : imageKey);
                        }
                        setFocusedImagePath(imageKey);
                        toggleImageSelection(item);
                        if (window.matchMedia("(hover: hover)").matches) {
                          event.currentTarget.blur();
                        }
                      }}
                      className={`absolute top-2 left-2 z-10 inline-flex size-6 items-center justify-center rounded-full border transition duration-150 ${
                        selected
                          ? "border-[#1456f0] bg-[#1456f0] text-white opacity-100 shadow-sm"
                          : "pointer-events-none border-white/90 bg-black/20 text-transparent opacity-0 shadow-sm group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 hover:bg-black/30"
                      }`}
                      aria-label={selected ? "取消选择图片" : "选择图片"}
                    >
                      {selected ? <Check className="size-3.5" /> : null}
                    </button>
                    <div
                      className={`absolute top-2 right-2 z-10 flex items-center gap-1 transition duration-150 ${
                        focused
                          ? "pointer-events-auto opacity-100"
                          : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={(event) => {
                          event.currentTarget.blur();
                          openImagePreview(item, index);
                        }}
                        className="inline-flex size-7 items-center justify-center rounded-full bg-white/95 text-stone-800 shadow-sm transition hover:bg-white hover:text-stone-950"
                        aria-label="预览原图"
                        title="预览原图"
                      >
                        <Eye className="size-3.5" />
                      </button>
                      {canGenerateSimilar ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.currentTarget.blur();
                            void handleGenerateSimilar(item);
                          }}
                          className="inline-flex size-7 items-center justify-center rounded-full bg-white/95 text-[#1456f0] shadow-sm transition hover:bg-[#e8f2ff]"
                          aria-label="同款生成"
                          title="同款生成"
                        >
                          <Sparkles className="size-3.5" />
                        </button>
                      ) : null}
                      {canEditImageTags && (galleryView !== "team" || teamManager) ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.currentTarget.blur();
                            openTagEditor(item);
                          }}
                          disabled={tagMutatingPath !== null}
                          className="inline-flex size-7 items-center justify-center rounded-full bg-white/95 text-stone-800 shadow-sm transition hover:bg-white hover:text-stone-950 disabled:cursor-not-allowed disabled:opacity-60"
                          aria-label="编辑标签"
                          title="编辑标签"
                        >
                          {tagMutatingPath === item.path ? <LoaderCircle className="size-3.5 animate-spin" /> : <Tag className="size-3.5" />}
                        </button>
                      ) : null}
                      {galleryView !== "mine" ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.currentTarget.blur();
                            void copyManagedImageURL(item);
                          }}
                          className="inline-flex size-7 items-center justify-center rounded-full bg-white/95 text-stone-800 shadow-sm transition hover:bg-white hover:text-stone-950"
                          aria-label="复制图片地址"
                          title="复制图片地址"
                        >
                          <Copy className="size-3.5" />
                        </button>
                      ) : null}
                      {canDeleteImages && (galleryView !== "team" || teamManager) ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.currentTarget.blur();
                            openDeleteConfirm([item]);
                          }}
                          disabled={isDeleting}
                          className="inline-flex size-7 items-center justify-center rounded-full bg-white/95 text-rose-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                          aria-label="删除图片"
                          title="删除图片"
                        >
                          {isDeleting && deleteTarget?.paths.includes(item.path) ? (
                            <LoaderCircle className="size-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="size-3.5" />
                          )}
                        </button>
                      ) : null}
                    </div>
                    {galleryView === "mine" && hasTeamLibrary && canMoveImagesToTeam ? (
                      <div
                        className={`absolute right-2 bottom-11 z-20 transition duration-150 ${
                          focused
                            ? "pointer-events-auto opacity-100"
                            : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={(event) => {
                            event.currentTarget.blur();
                            openMoveToTeamConfirm([item]);
                          }}
                          disabled={isMovingToTeam}
                          className="inline-flex h-8 max-w-[10rem] items-center gap-1.5 rounded-full bg-white/95 px-3 text-xs font-medium text-[#1456f0] shadow-sm ring-1 ring-blue-100 transition hover:bg-[#e8f2ff] disabled:cursor-not-allowed disabled:opacity-60"
                          aria-label="移动到团队素材库"
                          title="移动到团队素材库"
                        >
                          {isMovingToTeam && teamImagesTarget?.items.some((target) => target.path === item.path) ? <LoaderCircle className="size-3.5 shrink-0 animate-spin" /> : <Send className="size-3.5 shrink-0" />}
                          <span className="truncate">移到团队</span>
                        </button>
                      </div>
                    ) : null}
                    <div className="absolute right-2 bottom-2 left-2 z-20 flex items-center justify-between gap-2">
                      <div
                        className="pointer-events-none inline-flex h-7 min-w-0 max-w-[min(58%,13rem)] items-center rounded-full bg-white/15 px-2.5 text-[11px] font-medium text-white shadow-sm ring-1 ring-white/25 backdrop-blur-md"
                        title={`作者：${ownerLabel}`}
                      >
                        <span className="min-w-0 truncate">{ownerLabel}</span>
                      </div>
                    </div>
                    <div
                      className={`pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 via-black/25 to-transparent px-2.5 pt-8 pb-11 transition duration-150 ${
                        focused ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                      }`}
                    >
                      <div className="text-left text-white drop-shadow-sm">
                        <div className="text-[10px] font-bold tracking-wide">{getManagedImageFormatLabel(item)}</div>
                        <div className="mt-0.5 truncate text-[11px] text-white/90">{item.created_at}</div>
                        {imageMeta ? (
                          <div className="mt-0.5 truncate text-[11px] text-white/90">{imageMeta}</div>
                        ) : null}
                        {item.tags && item.tags.length > 0 ? (
                          <div className="mt-1 flex max-h-10 flex-wrap gap-1 overflow-hidden">
                            {item.tags.slice(0, 3).map((tag) => (
                              <span key={tag} className="max-w-full truncate rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-medium text-white">
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {item.collection_name ? (
                          <div className="mt-1 inline-flex max-w-full rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-medium text-white">
                            <span className="truncate">{item.collection_name}</span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </figure>
                );
              }}
            />
          ) : null}

          {assetKind === "image" && showImageEmptyState ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 px-6 py-14 text-center">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">暂无图片</p>
                <p className="max-w-[32rem] text-sm leading-6 text-muted-foreground">
                  {hasActiveFilters
                    ? "调整关键词、状态、格式或方向筛选后再试。"
                    : galleryView === "mine"
                      ? "图片生成成功后会自动进入个人素材库。"
                      : galleryView === "team"
                        ? "团队素材库暂无图片，可从个人素材库移动图片到团队空间。"
                        : "暂无可管理图片。"}
                </p>
              </div>
            </div>
          ) : null}
          {assetKind === "text" && isTextAssetLoading && textAssets.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-14 text-center">
              <div className="rounded-[16px] bg-[#edf4ff] p-4 text-[#1456f0] ring-1 ring-blue-100">
                <LoaderCircle className="size-7 animate-spin" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">正在加载文本素材</p>
              </div>
            </div>
          ) : null}
          {assetKind === "text" && textAssetLoadError && textAssets.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-14 text-center">
              <div className="rounded-[16px] bg-rose-50 p-4 text-rose-600 ring-1 ring-rose-100">
                <FileText className="size-7" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">文本素材加载失败</p>
                <p className="max-w-[32rem] text-sm leading-6 text-muted-foreground">{textAssetLoadError}</p>
              </div>
              <Button variant="outline" className="h-9 rounded-lg px-3" onClick={() => void loadTextAssets({ force: true })}>
                <RefreshCw className="size-4" />
                重试
              </Button>
            </div>
          ) : null}
          {assetKind === "text" && textAssets.length > 0 ? (
            <div className="h-full overflow-y-auto p-1">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {textAssets.map((item) => {
                  const active = focusedTextAsset?.id === item.id;
                  return (
                    <article
                      key={item.id}
                      className={cn(
                        "group min-h-48 rounded-[18px] border bg-background p-4 text-left shadow-[0_6px_20px_rgba(15,23,42,0.04)] transition hover:border-[#1456f0]/40 hover:shadow-[0_10px_28px_rgba(15,23,42,0.08)]",
                        active && "border-[#1456f0] ring-2 ring-[#1456f0]/15",
                      )}
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        className="grid h-full w-full min-w-0 cursor-pointer gap-3 text-left"
                        onClick={() => setFocusedTextAssetId(item.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setFocusedTextAssetId(item.id);
                          }
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="line-clamp-2 text-sm font-semibold leading-5 text-foreground">{item.name || "文本素材"}</div>
                            <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                              <FileText className="size-3.5 shrink-0" />
                              <span className="truncate">{textAssetOwnerLabel(item)}</span>
                            </div>
                          </div>
                          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                            {formatTextAssetTime(item.updated_at)}
                          </span>
                        </div>
                        <div className="line-clamp-6 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
                          {item.preview || item.content}
                        </div>
                        <div className="flex items-center justify-between gap-2 pt-1">
                          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                            <span className="text-[11px] text-muted-foreground">{Array.from(item.content || "").length.toLocaleString("zh-CN")} 字符</span>
                            <span className="inline-flex max-w-[9rem] items-center rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                              <span className="truncate">{item.collection_name || "未归类"}</span>
                            </span>
                          </div>
                          <div className="flex shrink-0 items-center gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-7 rounded-lg"
                              onClick={(event) => {
                                event.stopPropagation();
                                void copyTextAssetContent(item);
                              }}
                              title="复制文本"
                              aria-label="复制文本"
                            >
                              <Copy className="size-3.5" />
                            </Button>
                            {canMutateTextAssetCollections ? (
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-7 rounded-lg"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openTextAssetCollectionAssign(item, textAssetCollections[0]?.id || "");
                                }}
                                title="加入文本素材集"
                                aria-label="加入文本素材集"
                                disabled={textAssetCollections.length === 0}
                              >
                                <Folder className="size-3.5" />
                              </Button>
                            ) : null}
                            {canMutateTextAssetCollections && item.collection_id ? (
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-7 rounded-lg"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openTextAssetCollectionAssign(item, "");
                                }}
                                title="移出文本素材集"
                                aria-label="移出文本素材集"
                              >
                                <X className="size-3.5" />
                              </Button>
                            ) : null}
                            {canUpdateTextAssetInScope ? (
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-7 rounded-lg"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openTextAssetEditor({ mode: "edit", item });
                                }}
                                title="编辑文本素材"
                                aria-label="编辑文本素材"
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                            ) : null}
                            {canDeleteTextAssetInScope ? (
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-7 rounded-lg text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openDeleteTextAssetConfirm(item);
                                }}
                                title="删除文本素材"
                                aria-label="删除文本素材"
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
              {textAssetHasMore ? (
                <div className="flex justify-center py-5">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 rounded-lg"
                    onClick={() => void loadMoreTextAssets()}
                    disabled={isTextAssetLoadingMore}
                  >
                    {isTextAssetLoadingMore ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                    加载更多文本
                  </Button>
                </div>
              ) : textAssets.length > TEXT_ASSET_PAGE_SIZE ? (
                <div className="py-4 text-center text-xs text-muted-foreground">已显示全部文本素材</div>
              ) : null}
            </div>
          ) : null}
          {assetKind === "text" && !isTextAssetLoading && !textAssetLoadError && textAssets.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 px-6 py-14 text-center">
              <div className="rounded-[16px] bg-muted p-4 text-muted-foreground">
                <FileText className="size-7" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">暂无文本素材</p>
                <p className="max-w-[32rem] text-sm leading-6 text-muted-foreground">
                  {textAssetSearch ? "调整关键词后再试。" : canCreateTextAssetInScope ? "可以先新建一条常用提示词、商品文案或运营素材。" : "当前范围还没有可查看的文本素材。"}
                </p>
              </div>
              {canCreateTextAssetInScope ? (
                <Button className="h-10 rounded-lg" onClick={() => openTextAssetEditor({ mode: "create" })}>
                  <Type className="size-4" />
                  新建文本素材
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        </div>
        <aside className="hidden min-w-0 flex-col gap-3 rounded-[18px] border border-border bg-background/80 p-3 shadow-[0_6px_20px_rgba(15,23,42,0.04)] xl:flex xl:sticky xl:top-4 xl:self-start">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">素材详情</div>
              <div className="truncate text-xs text-muted-foreground">
                {assetKind === "text" ? focusedTextAsset?.name || "选择一条文本素材查看详情" : focusedItem?.name || "选择一张素材查看详情"}
              </div>
            </div>
            {assetKind === "image" && focusedItem ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 rounded-lg"
                onClick={() => {
                  const index = items.findIndex((item) => item.path === focusedItem.path);
                  openImagePreview(focusedItem, Math.max(0, index));
                }}
                title="预览原图"
                aria-label="预览原图"
              >
                <Eye className="size-4" />
              </Button>
            ) : null}
          </div>

          {assetKind === "image" && focusedItem ? (
            <>
              <AuthenticatedImage
                src={managedImagePreviewSource(focusedItem)}
                alt={focusedItem.name || "素材预览"}
                className="aspect-square w-full rounded-xl object-cover"
                placeholderClassName="aspect-square rounded-xl bg-muted"
              />
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">素材集</span>
                  <span className="min-w-0 truncate font-medium text-foreground">{focusedItem.collection_name || "未归类"}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">尺寸</span>
                  <span className="font-medium text-foreground">{getManagedImageResolutionSummary(focusedItem) || "未知"}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">大小</span>
                  <span className="font-medium text-foreground">{formatImageFileSize(focusedItem.size)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">模型</span>
                  <span className="min-w-0 truncate font-medium text-foreground">{focusedDetail?.model || "未记录"}</span>
                </div>
                {focusedDetail?.professional_mode || focusedDetail?.pro_studio?.enabled ? (
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-muted-foreground">生产模式</span>
                    <ProStudioBadge proStudio={focusedDetail.pro_studio} officialSettings={focusedDetail.official_settings} compact />
                  </div>
                ) : null}
              </div>
              {focusedDetail?.prompt ? (
                <div className="max-h-28 overflow-y-auto rounded-xl border border-border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
                  {focusedDetail.prompt}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">暂无可展示提示词</div>
              )}
              {focusedItem.tags && focusedItem.tags.length > 0 ? (
                <div className="flex max-h-16 flex-wrap gap-1 overflow-y-auto">
                  {focusedItem.tags.map((tag) => (
                    <span key={tag} className="max-w-full truncate rounded-full bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
              {collectionReadOnlyHint ? (
                <div className="rounded-xl border border-dashed border-border p-3 text-xs leading-5 text-muted-foreground">
                  {collectionReadOnlyHint}
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" className="h-9 rounded-lg text-xs" onClick={() => void addImageAsReference(focusedItem)}>
                  <ImagePlus className="size-3.5" />
                  参考图
                </Button>
                <Button type="button" variant="outline" className="h-9 rounded-lg text-xs" onClick={() => void handleGenerateSimilar(focusedItem)} disabled={!canGenerateSimilar}>
                  <Sparkles className="size-3.5" />
                  同款生成
                </Button>
                <Button type="button" variant="outline" className="h-9 rounded-lg text-xs" onClick={() => addImageToCanvas(focusedItem)}>
                  <Send className="size-3.5" />
                  加入画布
                </Button>
                <Button type="button" variant="outline" className="h-9 rounded-lg text-xs" onClick={() => void copyImagePrompt(focusedItem)}>
                  <Copy className="size-3.5" />
                  复制提示词
                </Button>
                {canMutateCollections ? (
                <Button type="button" variant="outline" className="col-span-2 h-9 rounded-lg text-xs" onClick={() => openCollectionAssign([focusedItem], focusedItem.collection_id || collections[0]?.id || "")} disabled={collections.length === 0} title={collections.length === 0 ? "先新建素材集后再归类" : "一张图只能属于一个素材集"}>
                  <Folder className="size-3.5" />
                  {focusedItem.collection_id ? "调整素材集" : "加入素材集"}
                </Button>
                ) : null}
                <Button type="button" variant="outline" className="col-span-2 h-9 rounded-lg text-xs" onClick={() => void downloadItems(focusedItem.path, [focusedItem])}>
                  {downloadingKey === focusedItem.path ? <LoaderCircle className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                  下载
                </Button>
              </div>
            </>
          ) : assetKind === "text" && focusedTextAsset ? (
            <>
              <div className="rounded-xl border border-border bg-muted/35 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#eef4ff] text-[#1456f0]">
                    <FileText className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold leading-5 text-foreground">{focusedTextAsset.name || "文本素材"}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{textAssetOwnerLabel(focusedTextAsset)}</div>
                  </div>
                </div>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">范围</span>
                  <span className="font-medium text-foreground">{focusedTextAsset.library_scope === "team" ? "团队素材" : "个人素材"}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">素材集</span>
                  <span className="min-w-0 truncate font-medium text-foreground">{focusedTextAsset.collection_name || "未归类"}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">更新时间</span>
                  <span className="font-medium text-foreground">{formatTextAssetTime(focusedTextAsset.updated_at)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">字符数</span>
                  <span className="font-medium text-foreground">{Array.from(focusedTextAsset.content || "").length.toLocaleString("zh-CN")}</span>
                </div>
              </div>
              <div className="max-h-[42vh] overflow-y-auto whitespace-pre-wrap rounded-xl border border-border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
                {focusedTextAsset.content}
              </div>
              <div className="rounded-xl border border-dashed border-border p-3 text-xs leading-5 text-muted-foreground">
                {textAssetHintText}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" className="h-9 rounded-lg text-xs" onClick={() => void copyTextAssetContent(focusedTextAsset)}>
                  <Copy className="size-3.5" />
                  复制全文
                </Button>
                {canUpdateTextAssetInScope ? (
                  <Button type="button" variant="outline" className="h-9 rounded-lg text-xs" onClick={() => openTextAssetEditor({ mode: "edit", item: focusedTextAsset })}>
                    <Pencil className="size-3.5" />
                    编辑
                  </Button>
                ) : null}
                {canMutateTextAssetCollections ? (
                  <Button type="button" variant="outline" className="col-span-2 h-9 rounded-lg text-xs" onClick={() => openTextAssetCollectionAssign(focusedTextAsset, focusedTextAsset.collection_id || textAssetCollections[0]?.id || "")} disabled={textAssetCollections.length === 0} title={textAssetCollections.length === 0 ? "先新建文本素材集后再归类" : "一条文本素材只能属于一个素材集"}>
                    <Folder className="size-3.5" />
                    {focusedTextAsset.collection_id ? "调整文本素材集" : "加入文本素材集"}
                  </Button>
                ) : null}
                {canMutateTextAssetCollections && focusedTextAsset.collection_id ? (
                  <Button type="button" variant="outline" className="col-span-2 h-9 rounded-lg text-xs" onClick={() => openTextAssetCollectionAssign(focusedTextAsset, "")}>
                    <X className="size-3.5" />
                    移出文本素材集
                  </Button>
                ) : null}
                {canDeleteTextAssetInScope ? (
                  <Button type="button" variant="outline" className="col-span-2 h-9 rounded-lg text-xs text-rose-600 hover:text-rose-700" onClick={() => openDeleteTextAssetConfirm(focusedTextAsset)}>
                    <Trash2 className="size-3.5" />
                    删除文本素材
                  </Button>
                ) : null}
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">当前素材库暂无可查看素材</div>
          )}
        </aside>
      </div>
      {assetKind === "image" ? (
      <MobileBottomDrawer
        open={isMobileFiltersOpen}
        onOpenChange={setIsMobileFiltersOpen}
        title={<span className="inline-flex items-center gap-2"><SlidersHorizontal className="size-4" />筛选素材</span>}
        description={activeFilterCount > 0 ? `${activeFilterCount} 个筛选已启用` : "按时间、格式、方向和标签筛选"}
        contentClassName="px-4"
      >
        <div className="grid gap-3">
          {renderSearchFilter("搜索图片")}
          {renderDateRangeFilter("w-full sm:w-full")}
          <div className="grid grid-cols-2 gap-2">{renderFilterControls()}</div>
          {renderTagFilters()}
          {renderAutoRefreshControls("mobile", "flex min-w-0 items-center gap-2")}
          <div className="flex h-9 min-w-0 items-center gap-1.5 rounded-xl border border-border bg-background/60 px-3 text-xs leading-none text-muted-foreground">
            <Info className="size-3.5 shrink-0" />
            <span className="min-w-0 truncate">{libraryHintText}</span>
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-full text-sm shadow-none"
            onClick={clearImageFilters}
            disabled={!hasActiveFilters}
          >
            重置筛选
          </Button>
        </div>
      </MobileBottomDrawer>
      ) : null}
      {assetKind === "image" ? (
      <ImageLightbox
        images={lightboxImages}
        currentIndex={lightboxIndex}
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        onIndexChange={setLightboxIndex}
        resolveDownloadSource={resolveLightboxDownloadSource}
      />
      ) : null}
      {textAssetEditorTarget ? (
        <Dialog open onOpenChange={(open) => (!open && !isTextAssetSaving ? setTextAssetEditorTarget(null) : null)}>
          <DialogContent showCloseButton={false} className="w-[min(92vw,640px)] rounded-2xl p-6">
            <DialogHeader className="gap-2">
              <DialogTitle>{textAssetEditorTarget.mode === "create" ? "新建文本素材" : "编辑文本素材"}</DialogTitle>
              <DialogDescription className="text-sm leading-6">
                保存后可在素材库、无限画布和社媒运营中复用。
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-1">
              <label className="grid gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">名称</span>
                <Input
                  value={textAssetNameInput}
                  onChange={(event) => setTextAssetNameInput(event.target.value)}
                  maxLength={80}
                  placeholder="留空会使用正文第一行"
                  className="h-10 rounded-xl"
                  disabled={isTextAssetSaving}
                />
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">内容</span>
                <Textarea
                  value={textAssetContentInput}
                  onChange={(event) => setTextAssetContentInput(event.target.value)}
                  maxLength={TEXT_ASSET_MAX_CONTENT_LENGTH}
                  placeholder="输入提示词、商品文案、运营素材或其他可复用文本。"
                  className="min-h-56 rounded-xl"
                  disabled={isTextAssetSaving}
                />
              </label>
              <div className="text-right text-xs text-muted-foreground">
                {Array.from(textAssetContentInput).length.toLocaleString("zh-CN")} / {TEXT_ASSET_MAX_CONTENT_LENGTH.toLocaleString("zh-CN")}
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl border-stone-200 bg-white px-5 text-stone-700 hover:bg-stone-50"
                onClick={() => setTextAssetEditorTarget(null)}
                disabled={isTextAssetSaving}
              >
                取消
              </Button>
              <Button
                type="button"
                className="h-10 rounded-xl px-5"
                onClick={() => void handleSaveTextAsset()}
                disabled={isTextAssetSaving || !textAssetContentInput.trim()}
              >
                {isTextAssetSaving ? <LoaderCircle className="size-4 animate-spin" /> : <FileText className="size-4" />}
                保存
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
      {textAssetCollectionEditTarget ? (
        <Dialog open onOpenChange={(open) => (!open && !textAssetCollectionMutating ? setTextAssetCollectionEditTarget(null) : null)}>
          <DialogContent showCloseButton={false} className="rounded-2xl p-6">
            <DialogHeader className="gap-2">
              <DialogTitle>{textAssetCollectionEditTarget.mode === "create" ? "新建文本素材集" : "重命名文本素材集"}</DialogTitle>
              <DialogDescription className="text-sm leading-6">
                文本素材集用于把提示词、商品文案或运营文本按项目和用途组织起来。
              </DialogDescription>
            </DialogHeader>
            <Input
              value={textAssetCollectionNameInput}
              onChange={(event) => setTextAssetCollectionNameInput(event.target.value)}
              placeholder="例如：提示词、商品文案、社媒脚本"
              className="h-10 rounded-xl"
              disabled={textAssetCollectionMutating}
              autoFocus
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl border-stone-200 bg-white px-5 text-stone-700 hover:bg-stone-50"
                onClick={() => setTextAssetCollectionEditTarget(null)}
                disabled={textAssetCollectionMutating}
              >
                取消
              </Button>
              <Button
                type="button"
                className="h-10 rounded-xl px-5"
                onClick={() => void handleSaveTextAssetCollection()}
                disabled={textAssetCollectionMutating}
              >
                {textAssetCollectionMutating ? <LoaderCircle className="size-4 animate-spin" /> : <Folder className="size-4" />}
                保存
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
      {textAssetCollectionDeleteTarget ? (
        <Dialog open onOpenChange={(open) => (!open && !textAssetCollectionMutating ? setTextAssetCollectionDeleteTarget(null) : null)}>
          <DialogContent showCloseButton={false} className="rounded-2xl p-6">
            <DialogHeader className="gap-2">
              <DialogTitle>删除文本素材集</DialogTitle>
              <DialogDescription className="text-sm leading-6">
                删除「{textAssetCollectionDeleteTarget.collection.name}」只会移除文本归类，不会删除文本素材。
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl border-stone-200 bg-white px-5 text-stone-700 hover:bg-stone-50"
                onClick={() => setTextAssetCollectionDeleteTarget(null)}
                disabled={textAssetCollectionMutating}
              >
                取消
              </Button>
              <Button
                type="button"
                className="h-10 rounded-xl bg-rose-600 px-5 text-white hover:bg-rose-700"
                onClick={() => void handleDeleteTextAssetCollection()}
                disabled={textAssetCollectionMutating}
              >
                {textAssetCollectionMutating ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                删除
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
      {textAssetCollectionAssignTarget ? (
        <Dialog open onOpenChange={(open) => (!open && !textAssetCollectionMutating ? setTextAssetCollectionAssignTarget(null) : null)}>
          <DialogContent showCloseButton={false} className="rounded-2xl p-6">
            <DialogHeader className="gap-2">
              <DialogTitle>{textAssetCollectionAssignTarget.collectionId ? "加入文本素材集" : "移出文本素材集"}</DialogTitle>
              <DialogDescription className="text-sm leading-6">
                当前文本素材：{textAssetCollectionAssignTarget.item.name || "文本素材"}。归类变更不会修改正文内容。
              </DialogDescription>
            </DialogHeader>
            {textAssetCollectionAssignTarget.collectionId ? (
              <Select
                value={textAssetCollectionAssignTarget.collectionId}
                onValueChange={(value) => setTextAssetCollectionAssignTarget((current) => current ? { ...current, collectionId: value } : current)}
                disabled={textAssetCollectionMutating}
              >
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue placeholder="选择文本素材集" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {textAssetCollections.map((collection) => (
                      <SelectItem key={collection.id} value={collection.id}>
                        {collection.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground">
                确认把这条文本素材从当前文本素材集中移出。
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl border-stone-200 bg-white px-5 text-stone-700 hover:bg-stone-50"
                onClick={() => setTextAssetCollectionAssignTarget(null)}
                disabled={textAssetCollectionMutating}
              >
                取消
              </Button>
              <Button
                type="button"
                className="h-10 rounded-xl px-5"
                onClick={() => void handleConfirmAssignTextAssetCollection()}
                disabled={textAssetCollectionMutating || (textAssetCollectionAssignTarget.collectionId !== "" && textAssetCollections.length === 0)}
              >
                {textAssetCollectionMutating ? <LoaderCircle className="size-4 animate-spin" /> : <Folder className="size-4" />}
                确认
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
      {deleteTextAssetTarget ? (
        <Dialog open onOpenChange={(open) => (!open && !isTextAssetDeleting ? setDeleteTextAssetTarget(null) : null)}>
          <DialogContent showCloseButton={false} className="rounded-2xl p-6">
            <DialogHeader className="gap-2">
              <DialogTitle>删除文本素材</DialogTitle>
              <DialogDescription className="text-sm leading-6">
                确认删除「{deleteTextAssetTarget.item.name || "文本素材"}」吗？删除后无法恢复。
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-36 overflow-y-auto whitespace-pre-wrap rounded-xl border border-dashed border-border p-3 text-xs leading-5 text-muted-foreground">
              {deleteTextAssetTarget.item.preview || deleteTextAssetTarget.item.content}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl border-stone-200 bg-white px-5 text-stone-700 hover:bg-stone-50"
                onClick={() => setDeleteTextAssetTarget(null)}
                disabled={isTextAssetDeleting}
              >
                取消
              </Button>
              <Button
                type="button"
                className="h-10 rounded-xl bg-rose-600 px-5 text-white hover:bg-rose-700"
                onClick={() => void handleConfirmDeleteTextAsset()}
                disabled={isTextAssetDeleting}
              >
                {isTextAssetDeleting ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                确认删除
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
      {teamImagesTarget ? (
        <Dialog open onOpenChange={(open) => (!open && !isMovingToTeam ? setTeamImagesTarget(null) : null)}>
          <DialogContent showCloseButton={false} className="rounded-2xl p-6">
            <DialogHeader className="gap-2">
              <DialogTitle>移动到团队素材库</DialogTitle>
              <DialogDescription className="text-sm leading-6">
                将 {teamImagesTarget.items.length} 张图片移动到 {activeTeam?.name || "团队素材库"}。移动后不再计入个人素材库保留数量。
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">本次占用</span>
                <span className="font-medium text-foreground">{formatStorageBytes(teamImagesTarget.items.reduce((sum, item) => sum + (Number(item.size) || 0), 0))}</span>
              </div>
              {teamStorage ? (
                <>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">当前团队空间</span>
                    <span className="font-medium text-foreground">{formatStorageBytes(teamStorage.used_bytes)} / {formatStorageBytes(teamStorage.limit_bytes)}</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-background">
                    <div
                      className="h-full rounded-full bg-[#21b8a6]"
                      style={{ width: `${Math.min(100, Math.max(0, (teamStorage.used_bytes / Math.max(1, teamStorage.limit_bytes)) * 100))}%` }}
                    />
                  </div>
                </>
              ) : null}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl border-stone-200 bg-white px-5 text-stone-700 hover:bg-stone-50"
                onClick={() => setTeamImagesTarget(null)}
                disabled={isMovingToTeam}
              >
                取消
              </Button>
              <Button
                type="button"
                className="h-10 rounded-xl px-5"
                onClick={() => void handleConfirmMoveToTeam()}
                disabled={isMovingToTeam}
              >
                {isMovingToTeam ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
                移动
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
      {canDeleteImages && deleteTarget ? (
        <Dialog open onOpenChange={(open) => (!open && !isDeleting ? setDeleteTarget(null) : null)}>
          <DialogContent showCloseButton={false} className="rounded-2xl p-6">
            <DialogHeader className="gap-2">
              <DialogTitle>删除图片</DialogTitle>
              <DialogDescription className="text-sm leading-6">
                确认删除 {deleteTarget.paths.length} 张图片吗？这会同时删除本地原图和缩略图，删除后无法恢复。
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl border-stone-200 bg-white px-5 text-stone-700 hover:bg-stone-50"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
              >
                取消
              </Button>
              <Button
                type="button"
                className="h-10 rounded-xl bg-rose-600 px-5 text-white hover:bg-rose-700"
                onClick={() => void handleConfirmDelete()}
                disabled={isDeleting}
              >
                {isDeleting ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                确认删除
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
      {tagEditTarget ? (
        <Dialog open onOpenChange={(open) => (!open && !tagMutatingPath ? setTagEditTarget(null) : null)}>
          <DialogContent showCloseButton={false} className="rounded-2xl p-6">
            <DialogHeader className="gap-2">
              <DialogTitle>编辑标签</DialogTitle>
              <DialogDescription className="truncate text-sm leading-6">
                {tagEditTarget.item.name || tagEditTarget.item.path}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-1">
              <Input
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                placeholder="用逗号分隔多个标签"
                className="h-10 rounded-xl"
                disabled={tagMutatingPath !== null}
              />
              {allImageTags.length > 0 ? (
                <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                  {allImageTags.map((tag) => {
                    const currentTags = normalizeImageTags(tagInput);
                    const active = currentTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        className={cn(
                          "inline-flex h-7 max-w-full items-center rounded-full border px-2 text-xs transition",
                          active
                            ? "border-[#1456f0] bg-[#eef4ff] text-[#1456f0]"
                            : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50",
                        )}
                        onClick={() => {
                          const next = active ? currentTags.filter((item) => item !== tag) : [...currentTags, tag];
                          setTagInput(next.join(", "));
                        }}
                        disabled={tagMutatingPath !== null}
                      >
                        <span className="truncate">{tag}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl border-stone-200 bg-white px-5 text-stone-700 hover:bg-stone-50"
                onClick={() => setTagEditTarget(null)}
                disabled={tagMutatingPath !== null}
              >
                取消
              </Button>
              <Button
                type="button"
                className="h-10 rounded-xl px-5"
                onClick={() => void handleSaveImageTags()}
                disabled={tagMutatingPath !== null}
              >
                {tagMutatingPath ? <LoaderCircle className="size-4 animate-spin" /> : <Tag className="size-4" />}
                保存
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
      {collectionEditTarget ? (
        <Dialog open onOpenChange={(open) => (!open && !collectionMutating ? setCollectionEditTarget(null) : null)}>
          <DialogContent showCloseButton={false} className="rounded-2xl p-6">
            <DialogHeader className="gap-2">
              <DialogTitle>{collectionEditTarget.mode === "create" ? "新建素材集" : "重命名素材集"}</DialogTitle>
              <DialogDescription className="text-sm leading-6">
                素材集用于把图片按角色、场景、风格或项目组织起来，不会复制或移动原始图片文件。
              </DialogDescription>
            </DialogHeader>
            <Input
              value={collectionNameInput}
              onChange={(event) => setCollectionNameInput(event.target.value)}
              placeholder="例如：角色、场景、产品图"
              className="h-10 rounded-xl"
              disabled={collectionMutating}
              autoFocus
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl border-stone-200 bg-white px-5 text-stone-700 hover:bg-stone-50"
                onClick={() => setCollectionEditTarget(null)}
                disabled={collectionMutating}
              >
                取消
              </Button>
              <Button
                type="button"
                className="h-10 rounded-xl px-5"
                onClick={() => void handleSaveCollection()}
                disabled={collectionMutating}
              >
                {collectionMutating ? <LoaderCircle className="size-4 animate-spin" /> : <Folder className="size-4" />}
                保存
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
      {collectionDeleteTarget ? (
        <Dialog open onOpenChange={(open) => (!open && !collectionMutating ? setCollectionDeleteTarget(null) : null)}>
          <DialogContent showCloseButton={false} className="rounded-2xl p-6">
            <DialogHeader className="gap-2">
              <DialogTitle>删除素材集</DialogTitle>
              <DialogDescription className="text-sm leading-6">
                删除「{collectionDeleteTarget.collection.name}」只会移除图片归类，不会删除图片。
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl border-stone-200 bg-white px-5 text-stone-700 hover:bg-stone-50"
                onClick={() => setCollectionDeleteTarget(null)}
                disabled={collectionMutating}
              >
                取消
              </Button>
              <Button
                type="button"
                className="h-10 rounded-xl bg-rose-600 px-5 text-white hover:bg-rose-700"
                onClick={() => void handleDeleteCollection()}
                disabled={collectionMutating}
              >
                {collectionMutating ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                删除
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
      {collectionAssignTarget ? (
        <Dialog open onOpenChange={(open) => (!open && !collectionMutating ? setCollectionAssignTarget(null) : null)}>
          <DialogContent showCloseButton={false} className="rounded-2xl p-6">
            <DialogHeader className="gap-2">
              <DialogTitle>{collectionAssignTarget.collectionId ? "加入素材集" : "移出素材集"}</DialogTitle>
              <DialogDescription className="text-sm leading-6">
                本次处理 {collectionAssignTarget.items.length} 张图片。一张图只能属于一个素材集，归类变更不会影响标签或原图文件。
              </DialogDescription>
            </DialogHeader>
            {collectionAssignTarget.collectionId ? (
              <Select
                value={collectionAssignTarget.collectionId}
                onValueChange={(value) => setCollectionAssignTarget((current) => current ? { ...current, collectionId: value } : current)}
                disabled={collectionMutating}
              >
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue placeholder="选择素材集" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {collections.map((collection) => (
                      <SelectItem key={collection.id} value={collection.id}>
                        {collection.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground">
                确认把所选图片从当前素材集中移出。
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl border-stone-200 bg-white px-5 text-stone-700 hover:bg-stone-50"
                onClick={() => setCollectionAssignTarget(null)}
                disabled={collectionMutating}
              >
                取消
              </Button>
              <Button
                type="button"
                className="h-10 rounded-xl px-5"
                onClick={() => void handleConfirmAssignCollection()}
                disabled={collectionMutating || (collectionAssignTarget.collectionId !== "" && collections.length === 0)}
              >
                {collectionMutating ? <LoaderCircle className="size-4 animate-spin" /> : <Folder className="size-4" />}
                确认
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </section>
  );
}

export default function ImageManagerPage() {
  const { isCheckingAuth, session } = useAuthGuard(undefined, "/image-manager");
  if (isCheckingAuth || !session) {
    return <div className="flex min-h-[40vh] items-center justify-center"><LoaderCircle className="size-5 animate-spin text-stone-400" /></div>;
  }
  const canDeleteImages = hasAPIPermission(session, "DELETE", "/api/images");
  const canGenerateSimilar = canAccessPath(session, "/image") && hasAPIPermission(session, "POST", "/api/creation-tasks");
  const canEditImageTags = hasAPIPermission(session, "PATCH", "/api/images/tags");
  const canMoveImagesToTeam = hasAPIPermission(session, "PATCH", "/api/images/library-scope");
  const canManageCollections =
    hasAPIPermission(session, "POST", "/api/image-collections") &&
    hasAPIPermission(session, "PATCH", "/api/image-collections") &&
    hasAPIPermission(session, "DELETE", "/api/image-collections");
  const canViewTextAssets = hasAPIPermission(session, "GET", "/api/text-assets");
  const canCreateTextAssets = hasAPIPermission(session, "POST", "/api/text-assets");
  const canUpdateTextAssets = hasAPIPermission(session, "PATCH", "/api/text-assets");
  const canDeleteTextAssets = hasAPIPermission(session, "DELETE", "/api/text-assets");
  const canManageTextAssetCollections =
    hasAPIPermission(session, "POST", "/api/text-asset-collections") &&
    hasAPIPermission(session, "PATCH", "/api/text-asset-collections") &&
    hasAPIPermission(session, "DELETE", "/api/text-asset-collections");
  return (
    <ImageManagerContent
      cacheScope={imageManagerCacheScope(session)}
      canDeleteImages={canDeleteImages}
      canGenerateSimilar={canGenerateSimilar}
      canEditImageTags={canEditImageTags}
      canMoveImagesToTeam={canMoveImagesToTeam}
      canManageCollections={canManageCollections}
      canViewTextAssets={canViewTextAssets}
      canCreateTextAssets={canCreateTextAssets}
      canUpdateTextAssets={canUpdateTextAssets}
      canDeleteTextAssets={canDeleteTextAssets}
      canManageTextAssetCollections={canManageTextAssetCollections}
      isAdmin={session.role === "admin"}
    />
  );
}
