"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  Archive,
  BarChart3,
  Check,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock3,
  Layers3,
  Download,
  ImagePlus,
  Images,
  LoaderCircle,
  PackageSearch,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  ScanSearch,
  Sparkles,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";

import {
  COMMERCE_SUITE_LANGUAGES,
  COMMERCE_SUITE_MARKETS,
  COMMERCE_SUITE_PLATFORMS,
  COMMERCE_SUITE_TEMPLATES,
  APLUS_TEMPLATE_IDS,
  MAIN_IMAGE_TEMPLATE_IDS,
  commerceSuiteOptionLabel,
} from "@/app/ecommerce-suite/ecommerce-suite-options";
import { AuthenticatedImage } from "@/components/authenticated-image";
import { ModelProviderOptionLabel } from "@/components/model-provider-icon";
import { BatchJobPreview } from "@/components/pro-studio/batch-job-preview";
import { ProStudioBadge } from "@/components/pro-studio/pro-studio-badge";
import { ProStudioPanel } from "@/components/pro-studio/pro-studio-panel";
import { useMobileNav } from "@/components/mobile-nav-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  canvasModelHasCapability,
  CHAT_MODEL_OPTIONS,
  DEFAULT_CHAT_MODEL,
  DEFAULT_IMAGE_MODEL,
  IMAGE_CREATION_MODEL_OPTIONS,
  createChatCompletionTask,
  createImageGenerationTask,
  createManagedImageCollection,
  createManagedTextAsset,
  createImageEditTaskFromReferenceIds,
  fetchCreationTasks,
  fetchCanvasModels,
  fetchManagedImages,
  fetchTeamWorkspace,
  imageReferenceInputLimit,
  isHiddenImageModelOption,
  isImageCreationModel,
  isGrokImagineImageModel,
  isOfficialImageModel,
  uploadCreationTaskReferenceImage,
  updateManagedImageCollectionItems,
  type CreationTask,
  type CanvasModelOption,
  type ImageModel,
  type ManagedImageSummary,
  type TeamSummary,
} from "@/lib/api";
import { fetchAuthenticatedImageBlob } from "@/lib/authenticated-image";
import { ImageModelSettingsButton } from "@/components/image-model-settings-button";
import { imageExtension, downloadImageFile } from "@/lib/image-download";
import { getManagedImagePreviewUrlFromPath, getManagedImageUrlFromPath } from "@/lib/image-path";
import {
  GROK_IMAGE_QUALITY_OPTIONS,
  IMAGE_QUALITY_OPTIONS,
  isImageOutputFormat,
  isImageQuality,
  normalizeGrokImageAspectRatio,
  normalizeGrokImageQuality,
  normalizeGrokImageResolution,
} from "@/lib/image-parameters";
import { imageModelHasSettings, imageModelSettingsToTaskFields } from "@/lib/image-model-settings";
import { displayModelLabel } from "@/lib/model-display";
import { useAppMeta } from "@/lib/use-app-meta";
import { localizeErrorMessage } from "@/lib/request";
import {
  OFFICIAL_IMAGE_MODEL,
  buildProStudioImagePayload,
  normalizeProStudioState,
  splitOfficialBatch,
  type ProStudioIntent,
  type ProStudioState,
} from "@/lib/pro-studio";
import { useAuthGuard } from "@/lib/use-auth-guard";
import { cn } from "@/lib/utils";
import {
  COMMERCE_SUITE_PROJECTS_CHANGED_EVENT,
  commerceSuiteResultImageSource,
  createCommerceSuiteProject,
  DEFAULT_COMMERCE_SUMMARY_LAYOUT,
  deleteCommerceSuiteProject,
  listCommerceSuiteProjects,
  saveCommerceSuiteProject,
  touchCommerceSuiteProject,
  type CommerceSummaryFitMode,
  type CommerceSummaryLayout,
  type CommerceSummaryLayoutMode,
  type CommerceSuiteProject,
  type CommerceSuiteReferenceImage,
  type CommerceSuiteResult,
} from "@/store/ecommerce-suite-projects";
import exampleModuleImage from "./example-module.webp";

const POLL_INTERVAL_MS = 1800;
const SUMMARY_TILE_SIZE = 720;
const SUMMARY_GAP = 28;
const SUMMARY_HEADER_HEIGHT = 112;
const SUMMARY_COMPOSITE_INTENT = "summary_composite";
const LEFT_RAIL_COLLAPSED_STORAGE_KEY = "ecommerce-suite-left-rail-collapsed";
const REFERENCE_LIBRARY_PAGE_SIZE = 24;
const ZIP_DOS_EPOCH = new Date("1980-01-01T00:00:00Z");
const REFERENCE_IMAGE_SLOTS = [
  { role: "product", title: "产品图", description: "上传商品主体、包装、不同角度，可多张" },
  { role: "reference", title: "参考图", description: "补充场景、风格、竞品或详情参考，可多张" },
] as const;

const PRO_STUDIO_OUTPUTS: Array<{ id: ProStudioIntent; label: string; count: (project: CommerceSuiteProject) => number }> = [
  { id: "product_main", label: "商品主图", count: () => 1 },
  { id: "product_banner", label: "电商横幅", count: () => 1 },
  { id: "detail_page", label: "详情页竖图", count: () => 1 },
  { id: "lifestyle_scene", label: "场景图", count: () => 2 },
  { id: "sku_variants", label: "SKU 批量图", count: (project) => Math.max(1, Math.min(24, Math.round(Number(project.skuCount || 8) || 8))) },
];

type ReferenceImageRole = typeof REFERENCE_IMAGE_SLOTS[number]["role"];
type ReferenceLibraryScope = "mine" | "team";
type ArchivedCollectionLink = {
  id: string;
  name: string;
  scope: ReferenceLibraryScope;
};

const ANALYSIS_SECTIONS = [
  "商品标题",
  "一句话卖点",
  "产品类目",
  "核心卖点",
  "参数说明",
  "目标人群",
  "使用场景",
  "详情页首屏文案",
  "详情页模块文案",
  "规格/尺寸说明",
  "视觉风格方向",
  "图片生成注意事项",
] as const;

const RESULT_GROUP_ORDER = [
  "product_main",
  "product_banner",
  "detail_page",
  "lifestyle_scene",
  "sku_variants",
  SUMMARY_COMPOSITE_INTENT,
] as const;

const SUMMARY_LAYOUT_MODE_OPTIONS: Array<{ value: CommerceSummaryLayoutMode; label: string; description: string }> = [
  { value: "auto-grid", label: "自动网格", description: "根据数量自动排成总览图" },
  { value: "vertical", label: "上下拼接", description: "适合详情页长图和竖向浏览" },
  { value: "horizontal", label: "左右拼接", description: "适合横幅、对比和横向展示" },
  { value: "two-column", label: "双列", description: "固定双列商品图册" },
];

const SUMMARY_FIT_OPTIONS: Array<{ value: CommerceSummaryFitMode; label: string }> = [
  { value: "cover", label: "铺满裁切" },
  { value: "contain", label: "完整显示" },
];

const SUMMARY_BACKGROUND_OPTIONS = [
  { value: "#f6f8fc", label: "浅灰" },
  { value: "#ffffff", label: "白色" },
  { value: "#f8f1e7", label: "暖白" },
  { value: "#111827", label: "深色" },
] as const;

const FEATURE_ACTIONS = [
  {
    id: "analysis",
    title: "文案策划",
    description: "生成标题、卖点、参数说明和详情页文案。",
    detail: "先从产品图和参考图里提炼文案，后面生成图片会更稳。",
    templateIds: ["main-white", "main-selling-focus"],
    icon: ScanSearch,
  },
  {
    id: "main-image",
    title: "主图快生成",
    description: "白底、卖点、场景、对比、细节和氛围主图。",
    detail: "默认 6 张，适合商品橱窗、详情首屏和广告主图组合。",
    templateIds: [...MAIN_IMAGE_TEMPLATE_IDS],
    icon: Sparkles,
  },
  {
    id: "aplus",
    title: "详情设计",
    description: "生成结构、细节、场景、对比和规格说明图。",
    detail: "适合 Amazon、独立站详情页中段内容。",
    templateIds: [...APLUS_TEMPLATE_IDS],
    icon: Layers3,
  },
  {
    id: "full-suite",
    title: "套图设计",
    description: "一次生成更完整的主图和详情页图片。",
    detail: "覆盖 6 张主图类型和 8 张详情设计图。",
    templateIds: COMMERCE_SUITE_TEMPLATES.map((template) => template.id),
    icon: BarChart3,
  },
] as const;

const TEMPLATE_GROUPS = [
  { id: "main", title: "主图类型", description: "适合商品橱窗、首屏和广告主图", templateIds: [...MAIN_IMAGE_TEMPLATE_IDS] },
  { id: "aplus", title: "详情设计", description: "适合详情页中段和完整说明", templateIds: [...APLUS_TEMPLATE_IDS] },
] as const;

type ModelOption = { value: ImageModel; label: string };

function ecommerceModelOption(model: CanvasModelOption): ModelOption {
  return { value: model.id, label: displayModelLabel(model.id, model.name || model.id) };
}

function ecommerceModelsByCapability(models: CanvasModelOption[], capability: "chat" | "image") {
  return models
    .filter((model) => model.enabled !== false)
    .filter((model) => {
      if (Array.isArray(model.group_modes) && model.group_modes.length > 0) {
        return model.group_modes.includes(capability);
      }
      const hasRequestedCapability =
        canvasModelHasCapability(model, capability) ||
        (capability === "chat" && (model.kind === "text" || model.kind === "both")) ||
        (capability === "image" && (model.kind === "image" || model.kind === "both"));
      if (!hasRequestedCapability) {
        return false;
      }
      return capability !== "image" || isImageCreationModel(model.id);
    })
    .map(ecommerceModelOption);
}

function createID(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatDateTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatElapsedClock(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) {
    return "";
  }
  if (size >= 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function safeFileName(value: string) {
  return (value || "ecommerce-suite")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80) || "ecommerce-suite";
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function crc32(bytes: Uint8Array) {
  let crc = -1;
  for (const byte of bytes) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function dateToZipTime(dateValue?: string) {
  const date = new Date(dateValue || "");
  const safeDate = Number.isNaN(date.getTime()) || date < ZIP_DOS_EPOCH ? ZIP_DOS_EPOCH : date;
  const dosTime = (safeDate.getHours() << 11) | (safeDate.getMinutes() << 5) | Math.floor(safeDate.getSeconds() / 2);
  const dosDate = ((safeDate.getFullYear() - 1980) << 9) | ((safeDate.getMonth() + 1) << 5) | safeDate.getDate();
  return { dosTime, dosDate };
}

function pushUint16(out: number[], value: number) {
  out.push(value & 0xff, (value >>> 8) & 0xff);
}

function pushUint32(out: number[], value: number) {
  out.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

async function buildZipBlob(files: Array<{ name: string; blob: Blob; updatedAt?: string }>) {
  const encoder = new TextEncoder();
  const localParts: BlobPart[] = [];
  const centralParts: BlobPart[] = [];
  let offset = 0;

  for (const file of files) {
    const data = new Uint8Array(await file.blob.arrayBuffer());
    const nameBytes = encoder.encode(file.name.replace(/\\/g, "/"));
    const checksum = crc32(data);
    const { dosTime, dosDate } = dateToZipTime(file.updatedAt);

    const localHeader: number[] = [];
    pushUint32(localHeader, 0x04034b50);
    pushUint16(localHeader, 20);
    pushUint16(localHeader, 0x0800);
    pushUint16(localHeader, 0);
    pushUint16(localHeader, dosTime);
    pushUint16(localHeader, dosDate);
    pushUint32(localHeader, checksum);
    pushUint32(localHeader, data.byteLength);
    pushUint32(localHeader, data.byteLength);
    pushUint16(localHeader, nameBytes.byteLength);
    pushUint16(localHeader, 0);
    localParts.push(new Uint8Array(localHeader), nameBytes, data);

    const centralHeader: number[] = [];
    pushUint32(centralHeader, 0x02014b50);
    pushUint16(centralHeader, 20);
    pushUint16(centralHeader, 20);
    pushUint16(centralHeader, 0x0800);
    pushUint16(centralHeader, 0);
    pushUint16(centralHeader, dosTime);
    pushUint16(centralHeader, dosDate);
    pushUint32(centralHeader, checksum);
    pushUint32(centralHeader, data.byteLength);
    pushUint32(centralHeader, data.byteLength);
    pushUint16(centralHeader, nameBytes.byteLength);
    pushUint16(centralHeader, 0);
    pushUint16(centralHeader, 0);
    pushUint16(centralHeader, 0);
    pushUint16(centralHeader, 0);
    pushUint32(centralHeader, 0);
    pushUint32(centralHeader, offset);
    centralParts.push(new Uint8Array(centralHeader), nameBytes);

    offset += localHeader.length + nameBytes.byteLength + data.byteLength;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + (typeof part === "string" ? encoder.encode(part).byteLength : part instanceof Blob ? part.size : part.byteLength), 0);
  const endHeader: number[] = [];
  pushUint32(endHeader, 0x06054b50);
  pushUint16(endHeader, 0);
  pushUint16(endHeader, 0);
  pushUint16(endHeader, files.length);
  pushUint16(endHeader, files.length);
  pushUint32(endHeader, centralSize);
  pushUint32(endHeader, offset);
  pushUint16(endHeader, 0);
  return new Blob([...localParts, ...centralParts, new Uint8Array(endHeader)], { type: "application/zip" });
}

function taskStatusLabel(status?: CreationTask["status"] | "idle") {
  switch (status) {
    case "queued":
      return "排队中";
    case "running":
      return "生成中";
    case "success":
      return "已完成";
    case "error":
      return "失败";
    case "cancelled":
      return "已取消";
    default:
      return "待生成";
  }
}

function taskStatusVariant(status?: CreationTask["status"] | "idle") {
  switch (status) {
    case "success":
      return "success" as const;
    case "queued":
    case "running":
      return "warning" as const;
    case "error":
    case "cancelled":
      return "danger" as const;
    default:
      return "secondary" as const;
  }
}

function isActiveTask(status?: CreationTask["status"] | "idle") {
  return status === "queued" || status === "running";
}

function isNonEmptyString(value: string | undefined): value is string {
  return Boolean(value);
}

function commerceReferenceImageLimit(project: Pick<CommerceSuiteProject, "professionalMode" | "imageModel"> | null | undefined) {
  return imageReferenceInputLimit(project?.professionalMode ? OFFICIAL_IMAGE_MODEL : project?.imageModel);
}

function templateById(id: string) {
  return COMMERCE_SUITE_TEMPLATES.find((template) => template.id === id);
}

function proStudioOutputByIntent(intent?: string) {
  return PRO_STUDIO_OUTPUTS.find((item) => item.id === intent);
}

function isCommerceProStudioIntent(intent: string): intent is ProStudioIntent {
  return PRO_STUDIO_OUTPUTS.some((item) => item.id === intent);
}

function commerceResultIntent(result: CommerceSuiteResult) {
  if (result.intent) {
    return result.intent;
  }
  if (result.proStudio?.intent) {
    return result.proStudio.intent;
  }
  if (result.templateId.startsWith("sku_variants-")) {
    return "sku_variants";
  }
  return result.templateId;
}

function commerceResultTitle(result: CommerceSuiteResult) {
  const intent = commerceResultIntent(result);
  if (intent === SUMMARY_COMPOSITE_INTENT) {
    return "AI 合成排版图";
  }
  const output = proStudioOutputByIntent(intent);
  const template = templateById(result.templateId);
  const base = output?.label || template?.title || result.templateId;
  if (intent === "sku_variants" && typeof result.batchIndex === "number") {
    return `${base} · 批次 ${result.batchIndex + 1}`;
  }
  return base;
}

function commerceResultShortTitle(result: CommerceSuiteResult) {
  const intent = commerceResultIntent(result);
  if (intent === SUMMARY_COMPOSITE_INTENT) {
    return "AI-合成排版图";
  }
  const output = proStudioOutputByIntent(intent);
  const template = templateById(result.templateId);
  const base = output?.label || template?.shortTitle || result.templateId;
  if (intent === "sku_variants" && typeof result.batchIndex === "number") {
    return `${base}-${result.batchIndex + 1}`;
  }
  return base;
}

function commerceResultBaseFileName(project: CommerceSuiteProject | null | undefined, result: CommerceSuiteResult, index = 0) {
  const sequence = String(index + 1).padStart(2, "0");
  const batch = typeof result.batchIndex === "number" ? `-batch-${result.batchIndex + 1}` : "";
  return `${safeFileName(project?.title || "ecommerce-suite")}-${safeFileName(commerceResultShortTitle(result))}${batch}-${sequence}`;
}

function commerceResultZipDirectory(result: CommerceSuiteResult) {
  return `images/${safeFileName(commerceResultShortTitle(result))}`;
}

function plannedResultMatches(result: CommerceSuiteResult, plannedTemplateIds: string[]) {
  const planned = new Set(plannedTemplateIds);
  return planned.has(result.templateId) || planned.has(commerceResultIntent(result));
}

function resultIdentity(result: CommerceSuiteResult) {
  return `${result.templateId}:${result.taskId || ""}:${typeof result.batchIndex === "number" ? result.batchIndex : ""}`;
}

function resultViewKey(result: CommerceSuiteResult) {
  return resultIdentity(result) || `${result.templateId}:${commerceResultIntent(result)}`;
}

function resultMatchesRetrySeed(result: CommerceSuiteResult, seed: CommerceSuiteResult) {
  if (seed.taskId && result.taskId === seed.taskId) {
    return true;
  }
  return result.templateId === seed.templateId && result.batchIndex === seed.batchIndex;
}

function resultGroupLabel(groupId: string) {
  if (groupId === SUMMARY_COMPOSITE_INTENT) {
    return "排版与合成";
  }
  return proStudioOutputByIntent(groupId)?.label || TEMPLATE_GROUPS.find((group) => group.id === groupId)?.title || groupId;
}

function resultGroupDescription(groupId: string) {
  switch (groupId) {
    case SUMMARY_COMPOSITE_INTENT:
      return "基于已完成图片再生成的整套合成图。";
    case "product_main":
      return "用于商品橱窗、首屏和核心展示。";
    case "product_banner":
      return "用于店铺横幅、广告位和活动视觉。";
    case "detail_page":
      return "用于详情页竖版模块和信息承接。";
    case "lifestyle_scene":
      return "用于真实场景、氛围和使用价值表达。";
    case "sku_variants":
      return "批量生成不同颜色、材质或款式细节。";
    case "main":
      return "普通模式主图模板结果。";
    case "aplus":
      return "普通模式详情页模块结果。";
    default:
      return "项目生成结果。";
  }
}

function resultGroupId(result: CommerceSuiteResult) {
  const intent = commerceResultIntent(result);
  if (intent === SUMMARY_COMPOSITE_INTENT) {
    return SUMMARY_COMPOSITE_INTENT;
  }
  if (PRO_STUDIO_OUTPUTS.some((item) => item.id === intent)) {
    return intent;
  }
  if (MAIN_IMAGE_TEMPLATE_IDS.includes(result.templateId as typeof MAIN_IMAGE_TEMPLATE_IDS[number])) {
    return "main";
  }
  if (APLUS_TEMPLATE_IDS.includes(result.templateId as typeof APLUS_TEMPLATE_IDS[number])) {
    return "aplus";
  }
  return intent;
}

function isSummaryCompositeResult(result: CommerceSuiteResult) {
  return commerceResultIntent(result) === SUMMARY_COMPOSITE_INTENT;
}

function groupCommerceResults(results: CommerceSuiteResult[]) {
  const groups = new Map<string, CommerceSuiteResult[]>();
  results.forEach((result) => {
    const groupId = resultGroupId(result);
    groups.set(groupId, [...(groups.get(groupId) || []), result]);
  });
  const ordered = [
    ...RESULT_GROUP_ORDER,
    "main",
    "aplus",
    ...Array.from(groups.keys()).filter((id) => !RESULT_GROUP_ORDER.includes(id as typeof RESULT_GROUP_ORDER[number]) && id !== "main" && id !== "aplus"),
  ];
  return ordered.flatMap((id) => {
    const items = groups.get(id);
    return items && items.length > 0 ? [{ id, items }] : [];
  });
}

function parseAnalysisSections(text: string) {
  const source = text.trim();
  if (!source) {
    return [];
  }
  const pattern = new RegExp(`(?:^|\\n)(${ANALYSIS_SECTIONS.join("|")})[：:]\\s*`, "g");
  const matches = Array.from(source.matchAll(pattern));
  if (matches.length === 0) {
    return [{ title: "商品文案", body: source }];
  }
  return matches.flatMap((match, index) => {
    const title = match[1];
    const start = (match.index || 0) + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index || source.length : source.length;
    const body = source.slice(start, end).trim();
    return body ? [{ title, body }] : [];
  });
}

function formatAnalysisAssetContent(project: CommerceSuiteProject) {
  const sections = parseAnalysisSections(project.analysisText);
  const body = sections.length > 0
    ? sections.map((section) => `${section.title}：\n${section.body}`).join("\n\n")
    : project.analysisText.trim();
  return [
    `项目：${project.title || "未命名商品套图"}`,
    `平台：${commerceSuiteOptionLabel(COMMERCE_SUITE_PLATFORMS, project.targeting.platform)}`,
    `市场：${commerceSuiteOptionLabel(COMMERCE_SUITE_MARKETS, project.targeting.market)}`,
    `语言：${commerceSuiteOptionLabel(COMMERCE_SUITE_LANGUAGES, project.targeting.language)}`,
    "",
    body,
  ].join("\n").trim();
}

function textBlob(content: string, type = "text/plain;charset=utf-8") {
  return new Blob([content], { type });
}

function buildDeliveryManifest(project: CommerceSuiteProject, items: Array<{ result: CommerceSuiteResult; fileName: string }>) {
  return {
    project: {
      id: project.id,
      title: project.title || "未命名商品套图",
      platform: commerceSuiteOptionLabel(COMMERCE_SUITE_PLATFORMS, project.targeting.platform),
      market: commerceSuiteOptionLabel(COMMERCE_SUITE_MARKETS, project.targeting.market),
      language: commerceSuiteOptionLabel(COMMERCE_SUITE_LANGUAGES, project.targeting.language),
      professional_mode: project.professionalMode === true,
    },
    exported_at: new Date().toISOString(),
    image_count: items.length,
    images: items.map(({ result, fileName }, index) => ({
      index: index + 1,
      title: commerceResultTitle(result),
      type: commerceResultShortTitle(result),
      intent: commerceResultIntent(result),
      batch_index: typeof result.batchIndex === "number" ? result.batchIndex + 1 : undefined,
      output_count: result.outputCount,
      status: result.status,
      file_name: fileName,
      task_id: result.taskId,
      path: result.path,
      updated_at: result.updatedAt,
      pro_studio: result.proStudio,
      official_settings: result.officialSettings,
    })),
  };
}

function referenceRoleLabel(role: ReferenceImageRole) {
  return role === "product" ? "产品图" : "参考图";
}

function hasProductImages(project: CommerceSuiteProject) {
  return project.referenceImages.some((image) => image.role === "product" || image.role === "primary");
}

function hasGenerationInput(project: CommerceSuiteProject) {
  const title = project.title.trim();
  return (
    project.referenceImages.length > 0 ||
    Boolean(project.analysisText.trim()) ||
    Boolean(title && title !== "未命名商品套图")
  );
}

function extractTaskText(task: CreationTask) {
  return (task.data || []).map((item) => item.text_response || "").join("\n").trim();
}

function resultFromTask(templateId: string, task: CreationTask, seed?: Partial<CommerceSuiteResult>): CommerceSuiteResult {
  const image = (task.data || []).find((item) => item.local_url || item.url || item.b64_json);
  const taskError = task.error ? localizeErrorMessage(task.error) : undefined;
  return {
    ...seed,
    templateId,
    taskId: task.id,
    status: task.status,
    localUrl: image?.local_url,
    url: image?.url || (image?.b64_json ? `data:image/png;base64,${image.b64_json}` : undefined),
    revisedPrompt: image?.revised_prompt,
    error: taskError,
    proStudio: task.pro_studio || seed?.proStudio,
    officialSettings: task.official_settings || seed?.officialSettings,
    startedAt: seed?.startedAt || task.created_at,
    updatedAt: task.updated_at,
  };
}

function commerceResultChanged(a: CommerceSuiteResult, b: CommerceSuiteResult) {
  return (
    a.taskId !== b.taskId ||
    a.status !== b.status ||
    a.localUrl !== b.localUrl ||
    a.url !== b.url ||
    a.path !== b.path ||
    a.revisedPrompt !== b.revisedPrompt ||
    a.error !== b.error ||
    a.updatedAt !== b.updatedAt
  );
}

function projectStatus(project: CommerceSuiteProject) {
  if (isActiveTask(project.analysisStatus) || project.results.some((result) => isActiveTask(result.status))) {
    return "生成中";
  }
  if (project.results.some((result) => result.status === "success")) {
    return "有结果";
  }
  if (project.analysisText) {
    return "已分析";
  }
  return "草稿";
}

function buildAnalysisPrompt(project: CommerceSuiteProject) {
  const platform = commerceSuiteOptionLabel(COMMERCE_SUITE_PLATFORMS, project.targeting.platform);
  const market = commerceSuiteOptionLabel(COMMERCE_SUITE_MARKETS, project.targeting.market);
  const language = commerceSuiteOptionLabel(COMMERCE_SUITE_LANGUAGES, project.targeting.language);
  const productImageCount = project.referenceImages.filter((image) => image.role === "product" || image.role === "primary").length;
  const referenceImageCount = project.referenceImages.filter((image) => image.role === "reference" || image.role === "secondary").length;
  return [
    "你是一名资深电商商品策划和详情页文案编辑。请基于产品图、参考图和用户输入，输出一份可直接用于电商套图生成和详情页编辑的结构化文案。",
    `目标平台：${platform}`,
    `目标市场：${market}`,
    `输出语言：${language}`,
    `商品标题或备注：${project.title}`,
    `产品图数量：${productImageCount} 张；参考图数量：${referenceImageCount} 张`,
    "要求：只基于图片和输入中能合理判断的信息；不编造认证、医学功效、夸张承诺、价格、品牌授权或具体检测数据；不确定的参数请写“待确认”。",
    "请严格使用以下字段，内容具体、克制、可直接复制：",
    "商品标题：",
    "一句话卖点：",
    "产品类目：",
    "核心卖点（3-5条）：",
    "参数说明：",
    "目标人群：",
    "使用场景：",
    "详情页首屏文案：",
    "详情页模块文案：",
    "规格/尺寸说明：",
    "视觉风格方向：",
    "图片生成注意事项：",
  ].join("\n");
}

function buildGenerationPrompt(project: CommerceSuiteProject, templateId: string, hasReferenceImages: boolean) {
  const template = templateById(templateId);
  const platform = commerceSuiteOptionLabel(COMMERCE_SUITE_PLATFORMS, project.targeting.platform);
  const market = commerceSuiteOptionLabel(COMMERCE_SUITE_MARKETS, project.targeting.market);
  const language = commerceSuiteOptionLabel(COMMERCE_SUITE_LANGUAGES, project.targeting.language);
  return [
    hasReferenceImages
      ? "你是一名电商详情页视觉设计师。请基于产品图保持商品主体一致，并参考辅助图片的场景、风格或细节，生成一张可直接用于电商详情页的成品图。"
      : "你是一名电商详情页视觉设计师。请根据商品标题、运营摘要和模板要求，生成一张可直接用于电商详情页的成品图。",
    `图片类型：${template?.title || templateId}`,
    `目标平台：${platform}`,
    `目标市场：${market}`,
    `画面语言：${language}`,
    `商品标题或备注：${project.title || "未命名商品套图"}`,
    `商品运营摘要：\n${project.analysisText || (hasReferenceImages ? "请根据产品图和参考图自行提炼商品标题、卖点、参数和适用场景。" : "请根据商品标题或备注、目标平台和模板要求，自行提炼商品卖点、参数和适用场景。")}`,
    `图片要求：${template?.prompt || ""}`,
    "输出要求：单张成品图，主体清晰，适合电商套图；如画面需要文字，优先使用商品运营摘要里的标题、卖点、参数或详情页文案，并保持短句可读；不添加虚假的认证、价格、品牌 Logo 或未经确认的夸张承诺。",
  ].filter(Boolean).join("\n\n");
}

function proStudioTemplateIds(project: CommerceSuiteProject) {
  const selected = new Set(project.selectedTemplates);
  const ids = PRO_STUDIO_OUTPUTS.map((item) => item.id);
  const matched = ids.filter((id) => selected.has(id));
  return matched.length > 0 ? matched : ids.slice(0, 4);
}

function buildProStudioGenerationPrompt(project: CommerceSuiteProject, intent: ProStudioIntent, batchIndex = 0, hasReferenceImages = true) {
  const output = PRO_STUDIO_OUTPUTS.find((item) => item.id === intent);
  return [
    hasReferenceImages
      ? "你是一名电商生产素材视觉设计师。请基于产品图保持商品主体一致，并参考辅助图片的场景、风格或细节，生成可直接用于投放或详情页的成品图。"
      : "你是一名电商生产素材视觉设计师。请根据商品标题、运营摘要和生产规格，生成可直接用于投放或详情页的成品图。",
    `素材类型：${output?.label || intent}`,
    `商品标题：${project.title}`,
    `商品运营摘要：\n${project.analysisText || (hasReferenceImages ? "请根据产品图和参考图自行提炼商品标题、卖点、参数和适用场景。" : "请根据商品标题、素材类型和目标电商场景，自行提炼商品卖点、参数和适用场景。")}`,
    intent === "sku_variants" ? `SKU 批次：${batchIndex + 1}，保持光线、角度和构图一致，变化体现在颜色、材质或款式细节。` : "",
    "输出要求：主体清晰、构图稳定、商业可用；如画面需要文字，优先使用商品运营摘要里的标题、卖点、参数或详情页文案，并保持短句可读；不添加虚假认证、价格、品牌 Logo 或未经确认的夸张承诺。",
  ].filter(Boolean).join("\n\n");
}

async function fileToReferenceImage(file: File, role?: ReferenceImageRole): Promise<CommerceSuiteReferenceImage> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.readAsDataURL(file);
  });
  return {
    id: createID("ref"),
    role,
    name: file.name || "reference.png",
    type: file.type || "image/png",
    size: file.size,
    dataUrl,
    uploadStatus: "pending",
  };
}

function managedImageReferenceUrl(item: ManagedImageSummary) {
  return item.path ? getManagedImageUrlFromPath(item.path) : item.preview_url || item.thumbnail_url || "";
}

function managedImagePreview(item: ManagedImageSummary) {
  return item.thumbnail_url || item.preview_url || (item.path ? getManagedImagePreviewUrlFromPath(item.path) : "");
}

function managedImageFileName(item: ManagedImageSummary) {
  if (item.name) {
    return item.name;
  }
  const rawName = item.path.split("/").filter(Boolean).pop() || "";
  try {
    return decodeURIComponent(rawName) || "library-reference.png";
  } catch {
    return rawName || "library-reference.png";
  }
}

async function managedImageToReferenceImage(item: ManagedImageSummary, role: ReferenceImageRole): Promise<CommerceSuiteReferenceImage> {
  const url = managedImageReferenceUrl(item);
  if (!url) {
    throw new Error("未找到可读取的素材图片");
  }
  const blob = await fetchAuthenticatedImageBlob(url);
  const file = new File([blob], managedImageFileName(item), { type: blob.type || "image/png" });
  return {
    ...await fileToReferenceImage(file, role),
    publicUrl: url,
  };
}

function commercePublicReferenceImageUrls(images: CommerceSuiteReferenceImage[]) {
  return Array.from(new Set(images.map((image) => image.publicUrl?.trim() || "").filter(Boolean)));
}

function summaryLayoutModeLabel(mode: CommerceSummaryLayoutMode) {
  return SUMMARY_LAYOUT_MODE_OPTIONS.find((option) => option.value === mode)?.label || "自动网格";
}

function summaryLayoutPrompt(layout: CommerceSummaryLayout) {
  switch (layout.mode) {
    case "vertical":
      return "上下拼接的长图版式，按模块从上到下排列，适合电商详情页浏览。";
    case "horizontal":
      return "左右拼接的横向版式，图片横向并列，适合对比、横幅或总览展示。";
    case "two-column":
      return "双列商品图册版式，左右两列均衡排布，适合整套商品图总览。";
    default:
      return "自动网格版式，根据图片数量组成清晰的商品套图总览。";
  }
}

function normalizeSummaryLayoutForCanvas(layout?: CommerceSummaryLayout): CommerceSummaryLayout {
  return {
    ...DEFAULT_COMMERCE_SUMMARY_LAYOUT,
    ...layout,
    gap: Math.max(0, Math.min(96, Math.round(Number(layout?.gap ?? DEFAULT_COMMERCE_SUMMARY_LAYOUT.gap) || 0))),
    background: /^#[0-9a-fA-F]{6}$/.test(layout?.background || "")
      ? layout?.background || DEFAULT_COMMERCE_SUMMARY_LAYOUT.background
      : DEFAULT_COMMERCE_SUMMARY_LAYOUT.background,
    resultOrder: Array.isArray(layout?.resultOrder) ? layout.resultOrder : [],
    selectedResultKeys: Array.isArray(layout?.selectedResultKeys) ? layout.selectedResultKeys : [],
  };
}

function orderedSummaryResults(results: CommerceSuiteResult[], layout: CommerceSummaryLayout) {
  const orderedResults = orderedAllSummaryResults(results, layout);
  const keys = results.map(resultViewKey);
  const keySet = new Set(keys);
  const selectedSet = new Set(layout.selectedResultKeys.filter((key) => keySet.has(key)));
  const hasCustomSelection = layout.selectedResultKeys.length > 0;
  return hasCustomSelection
    ? orderedResults.filter((result) => selectedSet.has(resultViewKey(result)))
    : orderedResults;
}

function orderedAllSummaryResults(results: CommerceSuiteResult[], layout: CommerceSummaryLayout) {
  const resultByKey = new Map(results.map((result) => [resultViewKey(result), result]));
  const orderedKeys = [
    ...layout.resultOrder.filter((key) => resultByKey.has(key)),
    ...results.map(resultViewKey).filter((key) => !layout.resultOrder.includes(key)),
  ];
  return orderedKeys.flatMap((key) => {
    const result = resultByKey.get(key);
    return result ? [result] : [];
  });
}

function summaryPreviewGap(layout: CommerceSummaryLayout) {
  return Math.max(4, Math.round(layout.gap / 3));
}

function summaryPreviewGridStyle(layout: CommerceSummaryLayout, count: number): CSSProperties {
  const gap = summaryPreviewGap(layout);
  if (layout.mode === "vertical") {
    return {
      display: "grid",
      gap,
      gridTemplateColumns: "minmax(0, 1fr)",
    };
  }
  if (layout.mode === "horizontal") {
    return {
      display: "grid",
      gap,
      gridAutoColumns: "minmax(136px, 180px)",
      gridAutoFlow: "column",
      overflowX: "auto",
    };
  }
  if (layout.mode === "two-column") {
    return {
      display: "grid",
      gap,
      gridTemplateColumns: `repeat(${Math.min(2, Math.max(1, count))}, minmax(0, 1fr))`,
    };
  }
  const { columns } = summaryGridForCount(count, layout.mode);
  return {
    display: "grid",
    gap,
    gridTemplateColumns: `repeat(${Math.min(4, Math.max(1, columns))}, minmax(0, 1fr))`,
  };
}

function summaryPreviewTileClass(layout: CommerceSummaryLayout) {
  if (layout.mode === "vertical") {
    return "aspect-[5/4]";
  }
  if (layout.mode === "horizontal") {
    return "aspect-[4/3]";
  }
  return "aspect-square";
}

function isDarkSummaryBackground(background: string) {
  return background.toLowerCase() === "#111827";
}

async function dataUrlToFile(dataUrl: string, name: string, type: string) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], name || "reference.png", { type: type || blob.type || "image/png" });
}

async function loadImageForCanvas(src: string): Promise<HTMLImageElement> {
  let objectUrl = "";
  let imageSrc = src;
  if (!src.startsWith("data:") && !src.startsWith("blob:")) {
    const blob = await fetchAuthenticatedImageBlob(src);
    objectUrl = URL.createObjectURL(blob);
    imageSrc = objectUrl;
  }
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("图片加载失败"));
      image.src = imageSrc;
    });
  } finally {
    if (objectUrl) {
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    }
  }
}

async function resultBlobForDownload(result: CommerceSuiteResult) {
  const src = commerceSuiteResultImageSource(result);
  if (!src) {
    throw new Error("图片不可下载");
  }
  if (src.startsWith("data:") || src.startsWith("blob:")) {
    return await fetch(src).then((response) => response.blob());
  }
  return await fetchAuthenticatedImageBlob(src);
}

function drawCoverImage(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  const drawX = x + (width - drawWidth) / 2;
  const drawY = y + (height - drawHeight) / 2;
  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

function drawContainImage(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  const drawX = x + (width - drawWidth) / 2;
  const drawY = y + (height - drawHeight) / 2;
  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

function drawSummaryImage(ctx: CanvasRenderingContext2D, image: HTMLImageElement, fit: CommerceSummaryFitMode, x: number, y: number, width: number, height: number) {
  if (fit === "contain") {
    drawContainImage(ctx, image, x, y, width, height);
    return;
  }
  drawCoverImage(ctx, image, x, y, width, height);
}

function summaryGridForCount(count: number, mode: CommerceSummaryLayoutMode) {
  if (mode === "vertical") {
    return { columns: 1, rows: count };
  }
  if (mode === "horizontal") {
    return { columns: count, rows: 1 };
  }
  if (mode === "two-column") {
    return { columns: Math.min(2, count), rows: Math.ceil(count / Math.min(2, count)) };
  }
  const columns = count <= 2 ? count : Math.ceil(Math.sqrt(count));
  return { columns, rows: Math.ceil(count / columns) };
}

async function buildSummaryBlob(project: CommerceSuiteProject) {
  const layout = normalizeSummaryLayoutForCanvas(project.summaryLayout);
  const successfulResults = orderedSummaryResults(
    project.results.filter((result) => result.status === "success" && !isSummaryCompositeResult(result) && commerceSuiteResultImageSource(result)),
    layout,
  );
  if (successfulResults.length === 0) {
    throw new Error("还没有可以排版的图片");
  }

  const gap = layout.gap;
  const headerHeight = layout.showHeader ? SUMMARY_HEADER_HEIGHT : 0;
  const { columns, rows } = summaryGridForCount(successfulResults.length, layout.mode);
  const tileWidth = layout.mode === "vertical" ? Math.round(SUMMARY_TILE_SIZE * 1.18) : SUMMARY_TILE_SIZE;
  const tileHeight = layout.mode === "horizontal" ? Math.round(SUMMARY_TILE_SIZE * 0.72) : SUMMARY_TILE_SIZE;
  const width = columns * tileWidth + (columns + 1) * gap;
  const height = headerHeight + rows * tileHeight + (rows + 1) * gap;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("浏览器不支持画布导出");
  }

  ctx.fillStyle = layout.background;
  ctx.fillRect(0, 0, width, height);
  if (layout.showHeader) {
    ctx.fillStyle = layout.background === "#111827" ? "#f8fafc" : "#181e25";
    ctx.font = "700 40px system-ui, sans-serif";
    ctx.fillText(project.title || "电商套图", gap, 58);
    ctx.fillStyle = layout.background === "#111827" ? "#cbd5e1" : "#45515e";
    ctx.font = "400 22px system-ui, sans-serif";
    ctx.fillText(`${summaryLayoutModeLabel(layout.mode)} · 整套图片拼图`, gap, 92);
  }

  for (let index = 0; index < successfulResults.length; index += 1) {
    const result = successfulResults[index];
    const image = await loadImageForCanvas(commerceSuiteResultImageSource(result));
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = gap + col * (tileWidth + gap);
    const y = headerHeight + gap + row * (tileHeight + gap);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x, y, tileWidth, tileHeight);
    drawSummaryImage(ctx, image, layout.fit, x, y, tileWidth, tileHeight);
  }

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("整套预览导出失败"));
      }
    }, "image/png");
  });
}

function mergeModelOptions(
  remoteOptions: readonly ModelOption[],
  localOptions: readonly ModelOption[],
  selected: ImageModel,
  preferRemoteOnly = false,
  canKeepSelectedModel: (model: ImageModel) => boolean = () => true,
) {
  const seen = new Set<string>();
  const merged: ModelOption[] = [];
  const options = preferRemoteOnly && remoteOptions.length > 0 ? remoteOptions : [...remoteOptions, ...localOptions];
  for (const option of options) {
    if (!option.value || seen.has(option.value) || isHiddenImageModelOption(option.value)) {
      continue;
    }
    seen.add(option.value);
    merged.push({ ...option, label: displayModelLabel(option.value, option.label) });
  }
  if (!(preferRemoteOnly && remoteOptions.length > 0) && selected && !seen.has(selected) && !isHiddenImageModelOption(selected) && canKeepSelectedModel(selected)) {
    merged.unshift({ value: selected, label: displayModelLabel(selected) });
  }
  return merged;
}

export default function EcommerceSuitePage() {
  const { isCheckingAuth } = useAuthGuard(undefined, "/ecommerce-suite");
  const appMeta = useAppMeta();
  const { clearPanel, closeDrawer, setPanel } = useMobileNav();
  const [projects, setProjects] = useState<CommerceSuiteProject[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [buildingSummary, setBuildingSummary] = useState(false);
  const [deliveryAction, setDeliveryAction] = useState<"" | "zip" | "text" | "archive" | "composite">("");
  const [archivedCollectionLink, setArchivedCollectionLink] = useState<ArchivedCollectionLink | null>(null);
  const [renamingProjectId, setRenamingProjectId] = useState("");
  const [renamingTitle, setRenamingTitle] = useState("");
  const [referenceLibraryOpen, setReferenceLibraryOpen] = useState(false);
  const [referenceLibraryRole, setReferenceLibraryRole] = useState<ReferenceImageRole>("product");
  const [referenceLibraryScope, setReferenceLibraryScope] = useState<ReferenceLibraryScope>("mine");
  const [referenceLibrarySearch, setReferenceLibrarySearch] = useState("");
  const [referenceLibraryImages, setReferenceLibraryImages] = useState<ManagedImageSummary[]>([]);
  const [referenceLibraryNextCursor, setReferenceLibraryNextCursor] = useState("");
  const [referenceLibraryHasMore, setReferenceLibraryHasMore] = useState(false);
  const [referenceLibraryLoading, setReferenceLibraryLoading] = useState(false);
  const [referenceLibraryLoadingMore, setReferenceLibraryLoadingMore] = useState(false);
  const [referenceLibraryApplyingPath, setReferenceLibraryApplyingPath] = useState("");
  const [activeTeam, setActiveTeam] = useState<TeamSummary | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [selectedResultKey, setSelectedResultKey] = useState("");
  const [remoteCanvasModels, setRemoteCanvasModels] = useState<CanvasModelOption[]>([]);
  const [leftRailCollapsed, setLeftRailCollapsed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.localStorage.getItem(LEFT_RAIL_COLLAPSED_STORAGE_KEY) === "1";
  });
  const [leftRailHoverExpanded, setLeftRailHoverExpanded] = useState(false);
  const projectsRef = useRef<CommerceSuiteProject[]>([]);
  const referenceLibraryRequestIdRef = useRef(0);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedId) || projects[0] || null,
    [projects, selectedId],
  );
  const selectedProjectRef = useRef<CommerceSuiteProject | null>(selectedProject);
  const chatModelOptions = useMemo(
    () => mergeModelOptions(
      ecommerceModelsByCapability(remoteCanvasModels, "chat"),
      CHAT_MODEL_OPTIONS,
      selectedProject?.chatModel || DEFAULT_CHAT_MODEL,
      appMeta.luoye_independent_mode,
    ),
    [appMeta.luoye_independent_mode, remoteCanvasModels, selectedProject?.chatModel],
  );
  const imageModelOptions = useMemo(
    () => mergeModelOptions(
      ecommerceModelsByCapability(remoteCanvasModels, "image"),
      IMAGE_CREATION_MODEL_OPTIONS,
      selectedProject?.imageModel || DEFAULT_IMAGE_MODEL,
      false,
      isImageCreationModel,
    ),
    [remoteCanvasModels, selectedProject?.imageModel],
  );
  const selectedProjectImageReferenceLimit = imageReferenceInputLimit(
    selectedProject?.professionalMode ? OFFICIAL_IMAGE_MODEL : selectedProject?.imageModel,
  );
  const selectedProjectId = selectedProject?.id || "";
  const selectedProjectReferenceCount = selectedProject?.referenceImages.length || 0;
  const pendingTaskIds = useMemo(() => {
    if (!selectedProject) {
      return [];
    }
    return [
      isActiveTask(selectedProject.analysisStatus) ? selectedProject.analysisTaskId : "",
      ...selectedProject.results.map((result) => isActiveTask(result.status) ? result.taskId || "" : ""),
    ].filter(isNonEmptyString);
  }, [selectedProject]);

  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  useEffect(() => {
    selectedProjectRef.current = selectedProject;
  }, [selectedProject]);

  useEffect(() => {
    let cancelled = false;
    const loadModelCatalog = async () => {
      try {
        const models = await fetchCanvasModels();
        if (!cancelled) {
          setRemoteCanvasModels(models);
        }
      } catch {
        if (!cancelled) {
          setRemoteCanvasModels([]);
        }
      }
    };
    void loadModelCatalog();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedProjectId || selectedProjectReferenceCount <= selectedProjectImageReferenceLimit) {
      return;
    }
    toast.warning(`当前图片模型最多支持 ${selectedProjectImageReferenceLimit} 张产品图和参考图，请移除多余图片后再生成`);
  }, [selectedProjectId, selectedProjectReferenceCount, selectedProjectImageReferenceLimit]);

  useEffect(() => {
    if (!selectedProject?.results.some((result) => isActiveTask(result.status))) {
      return;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [selectedProject?.results]);

  useEffect(() => {
    window.localStorage.setItem(LEFT_RAIL_COLLAPSED_STORAGE_KEY, leftRailCollapsed ? "1" : "0");
  }, [leftRailCollapsed]);

  useEffect(() => {
    let cancelled = false;
    const loadTeamWorkspace = async () => {
      try {
        const workspace = await fetchTeamWorkspace();
        if (cancelled) return;
        const team = Array.isArray(workspace.teams) ? workspace.teams[0] : undefined;
        setActiveTeam(team || null);
      } catch {
        if (!cancelled) {
          setActiveTeam(null);
        }
      }
    };
    void loadTeamWorkspace();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (referenceLibraryScope === "team" && !activeTeam?.id) {
      setReferenceLibraryScope("mine");
    }
  }, [activeTeam?.id, referenceLibraryScope]);

  const applyProjects = useCallback((nextProjects: CommerceSuiteProject[], nextSelectedId = selectedId) => {
    const sorted = [...nextProjects].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    setProjects(sorted);
    const keepSelected = sorted.some((project) => project.id === nextSelectedId);
    setSelectedId(keepSelected ? nextSelectedId : sorted[0]?.id || "");
  }, [selectedId]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const items = await listCommerceSuiteProjects();
      applyProjects(items);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载电商套图历史失败");
    } finally {
      setLoading(false);
    }
  }, [applyProjects]);

  useEffect(() => {
    void reload();
    const handleChange = () => {
      void reload();
    };
    window.addEventListener(COMMERCE_SUITE_PROJECTS_CHANGED_EVENT, handleChange);
    return () => window.removeEventListener(COMMERCE_SUITE_PROJECTS_CHANGED_EVENT, handleChange);
  }, [reload]);

  const persistProject = useCallback(async (project: CommerceSuiteProject, options: { toast?: boolean } = {}) => {
    const nextProject = touchCommerceSuiteProject(project);
    setProjects((current) => {
      const next = [nextProject, ...current.filter((item) => item.id !== nextProject.id)]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      return next;
    });
    setSelectedId(nextProject.id);
    await saveCommerceSuiteProject(nextProject);
    if (options.toast) {
      toast.success("草稿已保存");
    }
    return nextProject;
  }, []);

  const updateSelectedProject = useCallback((patch: Partial<CommerceSuiteProject>) => {
    const project = selectedProjectRef.current;
    if (!project) {
      return;
    }
    const nextProject = touchCommerceSuiteProject({ ...project, ...patch });
    selectedProjectRef.current = nextProject;
    setProjects((current) => current.map((item) => item.id === nextProject.id ? nextProject : item));
  }, []);

  useEffect(() => {
    if (!selectedProject || chatModelOptions.length === 0 || chatModelOptions.some((option) => option.value === selectedProject.chatModel)) {
      return;
    }
    updateSelectedProject({ chatModel: chatModelOptions[0].value });
  }, [chatModelOptions, selectedProject, updateSelectedProject]);

  useEffect(() => {
    if (!selectedProject || imageModelOptions.length === 0 || imageModelOptions.some((option) => option.value === selectedProject.imageModel)) {
      return;
    }
    updateSelectedProject({ imageModel: imageModelOptions[0].value });
  }, [imageModelOptions, selectedProject, updateSelectedProject]);

  const createProject = useCallback(async () => {
    const project = createCommerceSuiteProject();
    await persistProject(project);
    toast.success("已创建电商套图项目");
  }, [persistProject]);

  const createProjectFromFeature = useCallback(async (templateIds: readonly string[]) => {
    const project = {
      ...createCommerceSuiteProject(),
      selectedTemplates: [...templateIds],
    };
    await persistProject(project);
    toast.success("已创建项目，可上传产品图和参考图继续");
  }, [persistProject]);

  const applyFeatureToProject = async (templateIds: readonly string[]) => {
    const project = selectedProjectRef.current;
    if (!project) {
      await createProjectFromFeature(templateIds);
      return;
    }
    await persistProject({
      ...project,
      selectedTemplates: [...templateIds],
    });
    toast.success("已更新生成范围");
  };

  const saveCurrentProject = async () => {
    if (!selectedProject || saving) return;
    setSaving(true);
    try {
      await persistProject(selectedProject, { toast: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const removeProject = useCallback(async (project: CommerceSuiteProject) => {
    if (!window.confirm(`删除「${project.title}」？`)) {
      return;
    }
    try {
      await deleteCommerceSuiteProject(project.id);
      const next = projectsRef.current.filter((item) => item.id !== project.id);
      applyProjects(next);
      toast.success("项目已删除");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    }
  }, [applyProjects]);

  const beginRenameProject = useCallback((project: CommerceSuiteProject) => {
    setSelectedId(project.id);
    setRenamingProjectId(project.id);
    setRenamingTitle(project.title);
  }, []);

  const cancelRenameProject = useCallback(() => {
    setRenamingProjectId("");
    setRenamingTitle("");
  }, []);

  const commitRenameProject = useCallback(async () => {
    const project = projectsRef.current.find((item) => item.id === renamingProjectId);
    if (!project) {
      cancelRenameProject();
      return;
    }
    const title = renamingTitle.trim() || "未命名商品套图";
    cancelRenameProject();
    if (title === project.title) {
      return;
    }
    try {
      await persistProject({ ...project, title });
      toast.success("项目名称已更新");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "重命名失败");
    }
  }, [cancelRenameProject, persistProject, renamingProjectId, renamingTitle]);

  const mobileProjectPanel = useMemo(
    () => ({
      title: "项目列表",
      description: `${projects.length} 个项目`,
      content: (
        <div className="flex h-[min(56dvh,520px)] min-h-[220px] flex-col gap-3">
          <div className="grid gap-2">
            <Button
              className="h-10 rounded-xl"
              onClick={() => {
                void createProject();
                closeDrawer();
              }}
            >
              <Plus className="size-4" />
              新建
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {projects.length === 0 ? (
              <div className="grid gap-2">
                {FEATURE_ACTIONS.map((feature) => {
                  const Icon = feature.icon;
                  return (
                    <button
                      key={feature.id}
                      type="button"
                      className="rounded-2xl border border-border bg-background p-3 text-left transition hover:bg-accent"
                      onClick={() => {
                        void createProjectFromFeature(feature.templateIds);
                        closeDrawer();
                      }}
                    >
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <Icon className="size-4 text-[#1456f0]" />
                        {feature.title}
                      </div>
                      <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{feature.description}</div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="grid gap-2">
                {projects.map((project) => {
                  const active = project.id === selectedProject?.id;
                  const renaming = renamingProjectId === project.id;
                  return (
                    <div
                      key={project.id}
                      role="button"
                      tabIndex={0}
                      className={cn(
                        "rounded-2xl border p-3 text-left transition",
                        active
                          ? "border-[#1456f0]/40 bg-[#edf4ff] text-[#123a8c] dark:bg-sky-950/30 dark:text-sky-200"
                          : "border-border bg-background hover:bg-accent",
                      )}
                      onClick={() => {
                        if (!renaming) {
                          setSelectedId(project.id);
                          closeDrawer();
                        }
                      }}
                      onKeyDown={(event) => {
                        if (!renaming && (event.key === "Enter" || event.key === " ")) {
                          event.preventDefault();
                          setSelectedId(project.id);
                          closeDrawer();
                        }
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        {renaming ? (
                          <Input
                            value={renamingTitle}
                            autoFocus
                            onChange={(event) => setRenamingTitle(event.target.value)}
                            onClick={(event) => event.stopPropagation()}
                            onBlur={() => void commitRenameProject()}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                void commitRenameProject();
                              } else if (event.key === "Escape") {
                                event.preventDefault();
                                cancelRenameProject();
                              }
                            }}
                            className="h-8 min-w-0 flex-1 rounded-xl text-xs font-semibold"
                          />
                        ) : (
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{project.title}</span>
                        )}
                        <Badge variant={project.results.some((result) => isActiveTask(result.status)) ? "warning" : "secondary"}>
                          {projectStatus(project)}
                        </Badge>
                      </div>
                      <div className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {project.analysisText || `${project.referenceImages.length} 张产品/参考图 · ${project.selectedTemplates.length} 个设计`}
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-[11px] text-muted-foreground">{formatDateTime(project.updatedAt)}</span>
                        <span className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-background hover:text-foreground"
                            onClick={(event) => {
                              event.stopPropagation();
                              beginRenameProject(project);
                            }}
                            title="编辑名称"
                            aria-label="编辑名称"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-rose-500/10 hover:text-rose-600"
                            onClick={(event) => {
                              event.stopPropagation();
                              void removeProject(project);
                            }}
                            title="删除项目"
                            aria-label="删除项目"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ),
    }),
    [
      closeDrawer,
      beginRenameProject,
      cancelRenameProject,
      commitRenameProject,
        createProject,
        createProjectFromFeature,
        projects,
        removeProject,
        renamingProjectId,
        renamingTitle,
      selectedProject?.id,
    ],
  );

  useEffect(() => {
    setPanel(mobileProjectPanel);
    return () => clearPanel();
  }, [clearPanel, mobileProjectPanel, setPanel]);

  const loadReferenceLibraryImages = useCallback(async (
    scope = referenceLibraryScope,
    search = referenceLibrarySearch,
    options: { append?: boolean; cursor?: string } = {},
  ) => {
    const requestId = ++referenceLibraryRequestIdRef.current;
    if (scope === "team" && !activeTeam?.id) {
      setReferenceLibraryImages([]);
      setReferenceLibraryNextCursor("");
      setReferenceLibraryHasMore(false);
      setReferenceLibraryLoading(false);
      setReferenceLibraryLoadingMore(false);
      return;
    }
    if (options.append) {
      setReferenceLibraryLoadingMore(true);
    } else {
      setReferenceLibraryImages([]);
      setReferenceLibraryNextCursor("");
      setReferenceLibraryHasMore(false);
      setReferenceLibraryLoading(true);
    }
    try {
      const result = await fetchManagedImages({
        scope,
        team_id: scope === "team" ? activeTeam?.id || "" : "",
        search,
        cursor: options.cursor || "",
        page_size: REFERENCE_LIBRARY_PAGE_SIZE,
      });
      if (requestId !== referenceLibraryRequestIdRef.current) {
        return;
      }
      setReferenceLibraryImages((current) => options.append ? [...current, ...result.items] : result.items);
      setReferenceLibraryNextCursor(result.next_cursor);
      setReferenceLibraryHasMore(result.has_more);
    } catch (error) {
      if (requestId === referenceLibraryRequestIdRef.current) {
        toast.error(error instanceof Error ? error.message : "加载素材库失败");
      }
    } finally {
      if (requestId === referenceLibraryRequestIdRef.current) {
        setReferenceLibraryLoading(false);
        setReferenceLibraryLoadingMore(false);
      }
    }
  }, [activeTeam?.id, referenceLibraryScope, referenceLibrarySearch]);

  const openReferenceLibrary = (role: ReferenceImageRole) => {
    setReferenceLibraryRole(role);
    setReferenceLibraryOpen(true);
    void loadReferenceLibraryImages(referenceLibraryScope, referenceLibrarySearch);
  };

  const changeReferenceLibraryScope = (scope: ReferenceLibraryScope) => {
    setReferenceLibraryScope(scope);
    setReferenceLibraryImages([]);
    setReferenceLibraryNextCursor("");
    setReferenceLibraryHasMore(false);
    void loadReferenceLibraryImages(scope, referenceLibrarySearch);
  };

  const applyReferenceLibrarySearch = () => {
    setReferenceLibraryImages([]);
    setReferenceLibraryNextCursor("");
    setReferenceLibraryHasMore(false);
    void loadReferenceLibraryImages(referenceLibraryScope, referenceLibrarySearch);
  };

  const applyReferenceLibraryImage = async (item: ManagedImageSummary) => {
    const project = selectedProjectRef.current;
    if (!project || referenceLibraryApplyingPath) return;
    const referenceImageLimit = commerceReferenceImageLimit(project);
    if (project.referenceImages.length >= referenceImageLimit) {
      toast.error(`当前图片模型最多添加 ${referenceImageLimit} 张产品图和参考图`);
      return;
    }
    setReferenceLibraryApplyingPath(item.path);
    const role = referenceLibraryRole;
    try {
      const ref = await managedImageToReferenceImage(item, role);
      await persistProject({
        ...project,
        referenceImages: [...project.referenceImages, ref].slice(0, referenceImageLimit),
      });
      setReferenceLibraryOpen(false);
      toast.success(`已从素材库添加${referenceRoleLabel(role)}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "读取素材库图片失败");
    } finally {
      setReferenceLibraryApplyingPath("");
    }
  };

  const handleReferenceUpload = async (files: FileList | null, role: ReferenceImageRole) => {
    if (!selectedProject || uploading) return;
    const imageFiles = Array.from(files || []).filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      toast.error("请选择图片文件");
      return;
    }
    const referenceImageLimit = commerceReferenceImageLimit(selectedProject);
    const availableSlots = Math.max(0, referenceImageLimit - selectedProject.referenceImages.length);
    if (availableSlots <= 0) {
      toast.error(`当前图片模型最多添加 ${referenceImageLimit} 张产品图和参考图`);
      return;
    }
    setUploading(true);
    try {
      const refs = await Promise.all(imageFiles.slice(0, availableSlots).map((file) => fileToReferenceImage(file, role)));
      await persistProject({
        ...selectedProject,
        referenceImages: [...selectedProject.referenceImages, ...refs],
      });
      toast.success(`已添加 ${refs.length} 张${referenceRoleLabel(role)}`);
      if (imageFiles.length > refs.length) {
        toast.warning(`当前图片模型最多添加 ${referenceImageLimit} 张，已忽略多余图片`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "读取参考图失败");
    } finally {
      setUploading(false);
    }
  };

  const removeReferenceImage = async (id: string) => {
    if (!selectedProject) return;
    await persistProject({
      ...selectedProject,
      referenceImages: selectedProject.referenceImages.filter((image) => image.id !== id),
    });
  };

  const ensureReferenceUploads = useCallback(async (project: CommerceSuiteProject) => {
    const nextImages = [...project.referenceImages];
    const referenceIds: string[] = [];
    for (let index = 0; index < nextImages.length; index += 1) {
      const image = nextImages[index];
      nextImages[index] = { ...image, uploadStatus: "uploading", uploadError: undefined };
      await persistProject({ ...project, referenceImages: nextImages });
      try {
        const file = await dataUrlToFile(image.dataUrl, image.name, image.type);
        const uploaded = await uploadCreationTaskReferenceImage(file, image.id, { conversationId: project.id });
        nextImages[index] = {
          ...image,
          serverReferenceId: uploaded.id,
          uploadStatus: "uploaded",
          uploadError: undefined,
        };
        referenceIds.push(uploaded.id);
      } catch (error) {
        nextImages[index] = {
          ...image,
          uploadStatus: "error",
          uploadError: error instanceof Error ? error.message : "上传失败",
        };
        await persistProject({ ...project, referenceImages: nextImages });
        throw error;
      }
    }
    await persistProject({ ...project, referenceImages: nextImages });
    return referenceIds;
  }, [persistProject]);

  const analyzeProduct = async () => {
    const project = selectedProjectRef.current;
    if (!project || analyzing) return;
    if (!hasProductImages(project)) {
      toast.error("请先上传产品图");
      return;
    }
    setAnalyzing(true);
    const taskId = createID("commerce-analysis");
    try {
      const prompt = buildAnalysisPrompt(project);
      const pendingProject = await persistProject({
        ...project,
        analysisTaskId: taskId,
        analysisStatus: "queued",
        analysisError: undefined,
      });
      const task = await createChatCompletionTask(
        taskId,
        prompt,
        pendingProject.chatModel,
        [{ role: "system", content: "你是电商商品策划和详情页文案助手，只输出可执行、可复制的结构化商品文案。" }],
        pendingProject.referenceImages.map((image) => ({ name: image.name, dataUrl: image.dataUrl })),
      );
      await persistProject({
        ...pendingProject,
        analysisTaskId: task.id,
        analysisStatus: task.status,
        analysisError: task.error,
      });
      toast.success("已提交商品文案任务");
    } catch (error) {
      const latest = selectedProjectRef.current || project;
      await persistProject({
        ...latest,
        analysisStatus: "error",
        analysisError: error instanceof Error ? error.message : "分析失败",
      });
      toast.error(error instanceof Error ? error.message : "分析失败");
    } finally {
      setAnalyzing(false);
    }
  };

  const submitGenerationTasks = async (templateIds: string[], options: { retrySeed?: CommerceSuiteResult } = {}) => {
    const project = selectedProjectRef.current;
    if (!project || generating) return;
    if (!hasGenerationInput(project)) {
      toast.error("请先填写商品标题/文案，或上传产品图/参考图");
      return;
    }
    const referenceImageLimit = commerceReferenceImageLimit(project);
    if (project.referenceImages.length > referenceImageLimit) {
      toast.error(`当前图片模型最多支持 ${referenceImageLimit} 张产品图和参考图，请先移除多余图片`);
      return;
    }
    if (templateIds.length === 0) {
      toast.error("请至少选择一张要生成的图片");
      return;
    }
    setGenerating(true);
    try {
      const referenceIds = await ensureReferenceUploads(project);
      const latest = selectedProjectRef.current || project;
      const publicImageUrls = commercePublicReferenceImageUrls(latest.referenceImages);
      const proStudioEnabled = latest.professionalMode === true;
      const retrySeed = options.retrySeed;
      const plannedTemplateIds = retrySeed
        ? [commerceResultIntent(retrySeed)]
        : proStudioEnabled ? proStudioTemplateIds(latest) : templateIds;
      const nextResults = retrySeed
        ? latest.results.filter((result) => !resultMatchesRetrySeed(result, retrySeed))
        : latest.results.filter((result) => !plannedResultMatches(result, plannedTemplateIds));
      const submittedAt = new Date().toISOString();
      const placeholders = retrySeed
        ? [{
            ...retrySeed,
            intent: commerceResultIntent(retrySeed),
            taskId: createID(`commerce-${commerceResultIntent(retrySeed)}`),
            status: "queued" as const,
            outputCount: Math.max(1, retrySeed.outputCount || 1),
            batchIndex: retrySeed.batchIndex ?? 0,
            localUrl: undefined,
            url: undefined,
            path: undefined,
            revisedPrompt: undefined,
            error: undefined,
            startedAt: submittedAt,
            updatedAt: submittedAt,
          }]
        : proStudioEnabled
        ? plannedTemplateIds.flatMap((templateId) => {
            const output = PRO_STUDIO_OUTPUTS.find((item) => item.id === templateId);
            const total = output?.count(latest) || 1;
            return splitOfficialBatch(total).map((n, index) => ({
              templateId: templateId === "sku_variants" ? `${templateId}-${index + 1}` : templateId,
              intent: templateId as ProStudioIntent,
              taskId: createID(`commerce-${templateId}`),
              status: "queued" as const,
              outputCount: n,
              batchIndex: index,
              startedAt: submittedAt,
              updatedAt: submittedAt,
            }));
          })
        : plannedTemplateIds.map((templateId) => ({
        templateId,
        intent: templateId as ProStudioIntent,
        taskId: createID(`commerce-${templateId}`),
        status: "queued" as const,
        outputCount: 1,
        batchIndex: 0,
        startedAt: submittedAt,
        updatedAt: submittedAt,
      }));
      const pendingProject = await persistProject({
        ...latest,
        results: [...nextResults, ...placeholders],
        summaryImage: undefined,
      });
      const submitted = await Promise.allSettled(
        placeholders.map((placeholder) => {
          const hasReferenceImages = referenceIds.length > 0;
          if (proStudioEnabled) {
            const placeholderIntent = String(placeholder.intent || "");
            const intent: ProStudioIntent = isCommerceProStudioIntent(placeholderIntent) ? placeholderIntent : "product_main";
            const state = normalizeProStudioState({
                ...pendingProject.proStudioState,
                enabled: true,
                intent,
                settings: {
                  ...normalizeProStudioState(pendingProject.proStudioState, intent).settings,
                  n: placeholder.outputCount,
                },
              } as Partial<ProStudioState>, intent);
            const payload = buildProStudioImagePayload({
              prompt: buildProStudioGenerationPrompt(pendingProject, intent, placeholder.batchIndex, hasReferenceImages),
              state,
              referenceImageUrls: publicImageUrls,
            });
            if (!hasReferenceImages) {
              return createImageGenerationTask(
                placeholder.taskId,
                payload.prompt,
                OFFICIAL_IMAGE_MODEL,
                payload.size,
                isImageQuality(payload.quality) ? payload.quality : "auto",
                payload.n,
                [{ role: "system", content: "你是电商生产素材视觉设计师，输出适合商业使用的单张成品图。" }],
                "private",
                payload.image_resolution,
                isImageOutputFormat(payload.output_format) ? payload.output_format : "png",
                payload.output_compression,
                { background: payload.background, moderation: payload.moderation, inputImageMask: payload.input_image_mask },
                pendingProject.id,
                undefined,
                {
                  professional_mode: true,
                  pro_studio: payload.pro_studio,
                  official_settings: payload.official_settings,
                  resolution: payload.resolution,
                },
                publicImageUrls,
              );
            }
            return createImageEditTaskFromReferenceIds(
              placeholder.taskId,
              referenceIds,
              payload.prompt,
              OFFICIAL_IMAGE_MODEL,
              payload.size,
              isImageQuality(payload.quality) ? payload.quality : "auto",
              payload.n,
              [{ role: "system", content: "你是电商生产素材视觉设计师，输出适合商业使用的单张成品图。" }],
              "private",
              payload.image_resolution,
              isImageOutputFormat(payload.output_format) ? payload.output_format : "png",
              payload.output_compression,
              { background: payload.background, moderation: payload.moderation, inputImageMask: payload.input_image_mask },
              pendingProject.id,
              undefined,
              publicImageUrls,
              {
                professional_mode: true,
                pro_studio: payload.pro_studio,
                official_settings: payload.official_settings,
                resolution: payload.resolution,
              },
            );
          }
          const prompt = buildGenerationPrompt(pendingProject, placeholder.templateId, hasReferenceImages);
          const modelFields = imageModelSettingsToTaskFields(pendingProject.imageModel, pendingProject.imageModelSettings);
          const grokImageModel = isGrokImagineImageModel(pendingProject.imageModel);
          const taskSize = grokImageModel
            ? normalizeGrokImageAspectRatio(pendingProject.size) || "auto"
            : pendingProject.size;
          const taskResolution = grokImageModel
            ? normalizeGrokImageResolution(pendingProject.imageResolution)
            : undefined;
          const taskQuality = grokImageModel
            ? hasReferenceImages ? undefined : normalizeGrokImageQuality(pendingProject.imageQuality)
            : isOfficialImageModel(pendingProject.imageModel) && isImageQuality(pendingProject.imageQuality)
              ? pendingProject.imageQuality
              : undefined;
          if (!hasReferenceImages) {
            return createImageGenerationTask(
              placeholder.taskId,
              prompt,
              pendingProject.imageModel,
              taskSize,
              taskQuality,
              1,
              [{ role: "system", content: "你是电商套图视觉设计师，输出适合商品详情页的单张成品图。" }],
              "private",
              taskResolution,
              pendingProject.outputFormat,
              undefined,
              modelFields.toolOptions,
              pendingProject.id,
              undefined,
              modelFields.extraBody,
              publicImageUrls,
            );
          }
          return createImageEditTaskFromReferenceIds(
            placeholder.taskId,
            referenceIds,
            prompt,
            pendingProject.imageModel,
            taskSize,
            taskQuality,
            1,
            [{ role: "system", content: "你是电商套图视觉设计师，输出适合商品详情页的单张成品图。" }],
            "private",
            taskResolution,
            pendingProject.outputFormat,
            undefined,
            modelFields.toolOptions,
            pendingProject.id,
            undefined,
            publicImageUrls,
            modelFields.extraBody,
          );
        }),
      );
      const submittedResults = placeholders.map((placeholder, index) => {
        const submittedItem = submitted[index];
        if (submittedItem?.status === "fulfilled") {
          return resultFromTask(placeholder.templateId, submittedItem.value, placeholder);
        }
        return {
          ...placeholder,
          status: "error" as const,
          error: submittedItem?.reason instanceof Error ? submittedItem.reason.message : "提交生成失败",
        };
      });
      await persistProject({
        ...pendingProject,
        results: [...nextResults, ...submittedResults],
      });
      const failedCount = submittedResults.filter((result) => result.status === "error").length;
      if (failedCount > 0) {
        toast.error(`已提交 ${submittedResults.length - failedCount} 个任务，${failedCount} 个失败`);
      } else if (retrySeed) {
        toast.success("已重新提交当前图片");
      } else {
        toast.success("已提交套图生成任务");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "提交生成失败");
    } finally {
      setGenerating(false);
    }
  };

  const retryTemplate = async (result: CommerceSuiteResult) => {
    if (isSummaryCompositeResult(result)) {
      await submitSummaryCompositeTask();
      return;
    }
    await submitGenerationTasks([commerceResultIntent(result)], { retrySeed: result });
  };

  useEffect(() => {
    if (!pendingTaskIds.length || !selectedProject) {
      return;
    }
    let cancelled = false;
    const tick = async () => {
      try {
        const latest = selectedProjectRef.current;
        if (!latest) return;
        const activeIds = [
          isActiveTask(latest.analysisStatus) ? latest.analysisTaskId : "",
          ...latest.results.map((result) => isActiveTask(result.status) ? result.taskId || "" : ""),
        ].filter(isNonEmptyString);
        if (!activeIds.length) {
          return;
        }
        const { items } = await fetchCreationTasks(activeIds);
        if (cancelled || items.length === 0) {
          return;
        }
        let changed = false;
        let nextProject = latest;
        for (const task of items) {
          if (task.id === nextProject.analysisTaskId) {
            if (task.status === "success") {
              const nextText = extractTaskText(task) || nextProject.analysisText;
              const nextChanged = nextProject.analysisStatus !== "success" || nextProject.analysisText !== nextText || Boolean(nextProject.analysisError);
              if (!nextChanged) {
                continue;
              }
              changed = true;
              nextProject = {
                ...nextProject,
                analysisStatus: "success",
                analysisText: nextText,
                analysisError: undefined,
              };
            } else if (task.status === "error" || task.status === "cancelled") {
              const nextError = task.error || "商品分析失败";
              const nextChanged = nextProject.analysisStatus !== task.status || nextProject.analysisError !== nextError;
              if (!nextChanged) {
                continue;
              }
              changed = true;
              nextProject = {
                ...nextProject,
                analysisStatus: task.status,
                analysisError: nextError,
              };
              toast.error(nextProject.analysisError);
            } else {
              if (nextProject.analysisStatus === task.status) {
                continue;
              }
              changed = true;
              nextProject = { ...nextProject, analysisStatus: task.status };
            }
            continue;
          }
          const matchedResult = nextProject.results.find((result) => result.taskId === task.id);
          if (!matchedResult) {
            continue;
          }
          const nextResult = resultFromTask(matchedResult.templateId, task, matchedResult);
          if (!commerceResultChanged(matchedResult, nextResult)) {
            continue;
          }
          changed = true;
          nextProject = {
            ...nextProject,
            results: nextProject.results.map((result) =>
              result.taskId === task.id ? nextResult : result,
            ),
          };
          if (task.status === "error") {
            toast.error(nextResult.error || `${templateById(matchedResult.templateId)?.title || "图片"}生成失败`);
          }
        }
        if (changed) {
          await persistProject(nextProject);
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "同步任务状态失败");
        }
      }
    };
    void tick();
    const timer = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [pendingTaskIds, persistProject, selectedProject]);

  const updateTargeting = (key: keyof CommerceSuiteProject["targeting"], value: string) => {
    if (!selectedProject) return;
    updateSelectedProject({
      targeting: {
        ...selectedProject.targeting,
        [key]: value,
      },
    });
  };

  const toggleTemplate = (templateId: string, checked: boolean) => {
    if (!selectedProject) return;
    const selected = new Set(selectedProject.selectedTemplates);
    if (checked) {
      selected.add(templateId);
    } else {
      selected.delete(templateId);
    }
    updateSelectedProject({ selectedTemplates: [...selected] });
  };

  const setTemplateSelected = (templateId: string) => {
    if (!selectedProject) return;
    toggleTemplate(templateId, !selectedProject.selectedTemplates.includes(templateId));
  };

  const updateSummaryLayout = async (patch: Partial<CommerceSummaryLayout>) => {
    const project = selectedProjectRef.current;
    if (!project) return;
    const summaryLayout = normalizeSummaryLayoutForCanvas({
      ...normalizeSummaryLayoutForCanvas(project.summaryLayout),
      ...patch,
    });
    await persistProject({
      ...project,
      summaryLayout,
      summaryImage: undefined,
    });
  };

  const updateSummaryCustomLayout = async (results: CommerceSuiteResult[], selectedKeys: string[], orderedKeys: string[]) => {
    const validKeys = new Set(results.map(resultViewKey));
    const resultOrder = orderedKeys.filter((key) => validKeys.has(key));
    const selectedResultKeys = selectedKeys.filter((key) => validKeys.has(key));
    await updateSummaryLayout({ resultOrder, selectedResultKeys });
  };

  const toggleSummaryResultSelection = async (result: CommerceSuiteResult, checked: boolean) => {
    const key = resultViewKey(result);
    const allKeys = compositeSourceResults.map(resultViewKey);
    const selectedKeys = summaryLayout.selectedResultKeys.length > 0
      ? summaryLayout.selectedResultKeys.filter((item) => allKeys.includes(item))
      : allKeys;
    const nextSelectedKeys = checked
      ? [...selectedKeys.filter((item) => item !== key), key]
      : selectedKeys.filter((item) => item !== key);
    const orderedKeys = summaryLayout.resultOrder.length > 0 ? summaryLayout.resultOrder : allKeys;
    await updateSummaryCustomLayout(compositeSourceResults, nextSelectedKeys, orderedKeys);
  };

  const moveSummaryResult = async (result: CommerceSuiteResult, direction: -1 | 1) => {
    const key = resultViewKey(result);
    const allKeys = compositeSourceResults.map(resultViewKey);
    const selectedKeys = summaryLayout.selectedResultKeys.length > 0
      ? summaryLayout.selectedResultKeys.filter((item) => allKeys.includes(item))
      : allKeys;
    const orderedKeys = [
      ...(summaryLayout.resultOrder.length > 0 ? summaryLayout.resultOrder : allKeys).filter((item) => allKeys.includes(item)),
      ...allKeys.filter((item) => !summaryLayout.resultOrder.includes(item)),
    ];
    const currentIndex = orderedKeys.indexOf(key);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= orderedKeys.length) {
      return;
    }
    const nextOrderedKeys = [...orderedKeys];
    [nextOrderedKeys[currentIndex], nextOrderedKeys[nextIndex]] = [nextOrderedKeys[nextIndex], nextOrderedKeys[currentIndex]];
    await updateSummaryCustomLayout(compositeSourceResults, selectedKeys, nextOrderedKeys);
  };

  const resetSummaryCustomLayout = async () => {
    await updateSummaryLayout({ resultOrder: [], selectedResultKeys: [] });
  };

  const downloadSummaryPreview = async () => {
    if (!selectedProject || buildingSummary) return;
    setBuildingSummary(true);
    try {
      const blob = await buildSummaryBlob(selectedProject);
      downloadBlob(blob, `${safeFileName(selectedProject.title)}-summary.png`);
      toast.success("整套拼图已下载");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "整套拼图下载失败");
    } finally {
      setBuildingSummary(false);
    }
  };

  const submitSummaryCompositeTask = async () => {
    const project = selectedProjectRef.current;
    if (!project || deliveryAction || generating) {
      return;
    }
    const layout = normalizeSummaryLayoutForCanvas(project.summaryLayout);
    const successfulResults = orderedSummaryResults(
      project.results.filter((result) => result.status === "success" && !isSummaryCompositeResult(result) && commerceSuiteResultImageSource(result)),
      layout,
    );
    if (successfulResults.length === 0) {
      toast.error("还没有可以合成的图片");
      return;
    }
    const referenceImageLimit = commerceReferenceImageLimit(project);
    const selectedResults = successfulResults.slice(0, referenceImageLimit);
    if (selectedResults.length === 0) {
      toast.error("当前模型不支持参考图合成");
      return;
    }
    setDeliveryAction("composite");
    try {
      const referenceIds: string[] = [];
      for (let index = 0; index < selectedResults.length; index += 1) {
        const result = selectedResults[index];
        const blob = await resultBlobForDownload(result);
        const src = commerceSuiteResultImageSource(result);
        const fileName = `${commerceResultBaseFileName(project, result, index)}.${imageExtension("png", src)}`;
        const file = new File([blob], fileName, { type: blob.type || "image/png" });
        const uploaded = await uploadCreationTaskReferenceImage(file, `${SUMMARY_COMPOSITE_INTENT}-${index + 1}`, { conversationId: project.id });
        referenceIds.push(uploaded.id);
      }
      const taskId = createID("commerce-summary-composite");
      const submittedAt = new Date().toISOString();
      const placeholder: CommerceSuiteResult = {
        templateId: SUMMARY_COMPOSITE_INTENT,
        intent: SUMMARY_COMPOSITE_INTENT,
        taskId,
        status: "queued",
        model: project.professionalMode ? OFFICIAL_IMAGE_MODEL : project.imageModel,
        outputCount: 1,
        batchIndex: 0,
        startedAt: submittedAt,
        updatedAt: submittedAt,
      };
      const nextResults = project.results.filter((result) => commerceResultIntent(result) !== SUMMARY_COMPOSITE_INTENT);
      const prompt = [
        "你是一名电商套图排版设计师。请基于参考图生成一张整套商品图片的合成排版图。",
        `项目名称：${project.title || "未命名商品套图"}`,
        `排版方式：${summaryLayoutPrompt(layout)}`,
        `图片适配偏好：${layout.fit === "contain" ? "尽量完整保留每张参考图主体，不要过度裁切。" : "允许适度裁切，让画面铺满且视觉统一。"}`,
        `商品运营摘要：\n${project.analysisText || "请根据参考图保持商品主体一致，并形成清晰的电商总览图。"}`,
        "输出要求：只生成一张成品图；保持商品主体一致；整体像真实可用的电商套图预览、详情首屏或商品图册；文字可少量使用但必须短句清晰；不添加虚假认证、价格、品牌 Logo、疗效或未经确认的夸张承诺。",
      ].join("\n\n");
      const proStudioCompositeState = project.professionalMode
        ? normalizeProStudioState({
            ...project.proStudioState,
            enabled: true,
            intent: "lifestyle_scene",
            settings: {
              ...normalizeProStudioState(project.proStudioState, "lifestyle_scene").settings,
              n: 1,
            },
          } as Partial<ProStudioState>, "lifestyle_scene")
        : undefined;
      const proStudioCompositePayload = proStudioCompositeState
        ? buildProStudioImagePayload({
            prompt,
            state: proStudioCompositeState,
            referenceImageUrls: referenceIds.length > 0 ? [] : selectedResults.map((result) => commerceSuiteResultImageSource(result)).filter(Boolean),
          })
        : undefined;
      const taskModel = proStudioCompositePayload ? OFFICIAL_IMAGE_MODEL : project.imageModel;
      const modelFields = proStudioCompositePayload ? undefined : imageModelSettingsToTaskFields(project.imageModel, project.imageModelSettings);
      const grokImageModel = !proStudioCompositePayload && isGrokImagineImageModel(taskModel);
      const taskSize = proStudioCompositePayload?.size || (grokImageModel
        ? normalizeGrokImageAspectRatio(project.size) || "auto"
        : project.size);
      const taskResolution = proStudioCompositePayload?.image_resolution || (grokImageModel
        ? normalizeGrokImageResolution(project.imageResolution)
        : undefined);
      const extraBody = {
        ...(proStudioCompositePayload
          ? {
              professional_mode: true,
              pro_studio: proStudioCompositePayload.pro_studio,
              official_settings: proStudioCompositePayload.official_settings,
              resolution: proStudioCompositePayload.resolution,
            }
          : modelFields?.extraBody),
        summary_layout: layout,
        source_result_count: selectedResults.length,
      };
      const task = await createImageEditTaskFromReferenceIds(
        taskId,
        referenceIds,
        proStudioCompositePayload?.prompt || prompt,
        taskModel,
        taskSize,
        proStudioCompositePayload
          ? isImageQuality(proStudioCompositePayload.quality) ? proStudioCompositePayload.quality : "auto"
          : grokImageModel
            ? undefined
            : isOfficialImageModel(taskModel) && isImageQuality(project.imageQuality)
            ? project.imageQuality
            : undefined,
        1,
        [{ role: "system", content: "你是电商套图排版设计师，输出适合商业使用的一张合成排版图。" }],
        "private",
        taskResolution,
        proStudioCompositePayload
          ? isImageOutputFormat(proStudioCompositePayload.output_format) ? proStudioCompositePayload.output_format : "png"
          : project.outputFormat,
        proStudioCompositePayload?.output_compression,
        proStudioCompositePayload
          ? { background: proStudioCompositePayload.background, moderation: proStudioCompositePayload.moderation, inputImageMask: proStudioCompositePayload.input_image_mask }
          : modelFields?.toolOptions,
        project.id,
        undefined,
        undefined,
        extraBody,
      );
      await persistProject({
        ...project,
        results: [...nextResults, resultFromTask(SUMMARY_COMPOSITE_INTENT, task, placeholder)],
      });
      if (successfulResults.length > selectedResults.length) {
        toast.warning(`当前模型最多参考 ${referenceImageLimit} 张图，已取前 ${selectedResults.length} 张生成 AI 合成图`);
      } else {
        toast.success("已提交 AI 合成排版图");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "AI 合成图提交失败");
    } finally {
      setDeliveryAction("");
    }
  };

  const downloadResult = async (result: CommerceSuiteResult) => {
    const src = commerceSuiteResultImageSource(result);
    if (!src) return;
    await downloadImageFile({
      id: result.taskId || result.templateId,
      src,
      path: result.path,
      fileName: `${commerceResultBaseFileName(selectedProject, result)}.${imageExtension("png", src)}`,
    }).catch((error) => {
      toast.error(error instanceof Error ? error.message : "下载失败");
    });
  };

  if (isCheckingAuth) {
    return null;
  }

  const leftRailExpanded = !leftRailCollapsed || leftRailHoverExpanded;
  const activeResults = selectedProject?.results.filter((result) => isActiveTask(result.status)) || [];
  const failedResults = selectedProject?.results.filter((result) => result.status === "error") || [];
  const completedResults = selectedProject?.results.filter((result) => result.status === "success") || [];
  const generationStartAt = activeResults
    .map((result) => new Date(result.startedAt || result.updatedAt || selectedProject?.updatedAt || "").getTime())
    .filter(Number.isFinite)
    .sort((a, b) => a - b)[0];
  const generationElapsed = generationStartAt ? formatElapsedClock(Math.floor((now - generationStartAt) / 1000)) : "";
  const generationTotal = selectedProject?.results.length || 0;
  const generationSettled = completedResults.length + failedResults.length + (selectedProject?.results.filter((result) => result.status === "cancelled").length || 0);
  const generationProgressPercent = generationTotal > 0
    ? Math.max(activeResults.length > 0 ? 8 : 0, Math.min(100, Math.round((generationSettled / generationTotal) * 100)))
    : 0;
  const analysisSections = parseAnalysisSections(selectedProject?.analysisText || "");
  const resultGroups = groupCommerceResults(selectedProject?.results || []);
  const galleryResults = resultGroups.flatMap((group) => group.items.map((result) => ({ groupId: group.id, result })));
  const selectedGalleryItem = galleryResults.find((item) => resultViewKey(item.result) === selectedResultKey) || galleryResults[0] || null;
  const selectedGalleryResult = selectedGalleryItem?.result || null;
  const selectedGalleryKey = selectedGalleryResult ? resultViewKey(selectedGalleryResult) : "";
  const summaryLayout = normalizeSummaryLayoutForCanvas(selectedProject?.summaryLayout);
  const completedImageResults = completedResults.filter((result) => commerceSuiteResultImageSource(result));
  const compositeSourceResults = completedImageResults.filter((result) => !isSummaryCompositeResult(result));
  const orderedCompositeSourceResults = orderedAllSummaryResults(compositeSourceResults, summaryLayout);
  const summarySelectedKeySet = new Set(summaryLayout.selectedResultKeys);
  const hasCustomSummarySelection = summaryLayout.selectedResultKeys.length > 0;
  const summaryLayoutResults = orderedSummaryResults(compositeSourceResults, summaryLayout);
  const summaryPreviewStyle = summaryPreviewGridStyle(summaryLayout, summaryLayoutResults.length);
  const summaryPreviewTileClassName = summaryPreviewTileClass(summaryLayout);
  const summaryPreviewTextClassName = isDarkSummaryBackground(summaryLayout.background)
    ? "text-slate-100"
    : "text-slate-900";
  const summaryPreviewSubTextClassName = isDarkSummaryBackground(summaryLayout.background)
    ? "text-slate-300"
    : "text-slate-500";

  const downloadCompletedResults = async () => {
    if (!selectedProject || deliveryAction) {
      return;
    }
    const items = completedResults.filter((result) => commerceSuiteResultImageSource(result));
    if (items.length === 0) {
      toast.error("还没有可下载的图片");
      return;
    }
    setDeliveryAction("zip");
    try {
      const imageFiles = await Promise.all(items.map(async (result, index) => {
        const src = commerceSuiteResultImageSource(result);
        const blob = await resultBlobForDownload(result);
        const name = `${commerceResultZipDirectory(result)}/${commerceResultBaseFileName(selectedProject, result, index)}.${imageExtension("png", src)}`;
        return {
          result,
          name,
          blob,
          updatedAt: result.updatedAt,
        };
      }));
      const manifest = buildDeliveryManifest(selectedProject, imageFiles.map(({ result, name }) => ({ result, fileName: name })));
      const analysisContent = selectedProject.analysisText.trim()
        ? formatAnalysisAssetContent(selectedProject)
        : [
            `项目：${selectedProject.title || "未命名商品套图"}`,
            "",
            "暂无商品文案。建议先运行“商品文案策划”，再重新打包交付。",
          ].join("\n");
      const files = [
        ...imageFiles.map(({ name, blob, updatedAt }) => ({ name, blob, updatedAt })),
        {
          name: "商品文案.txt",
          blob: textBlob(analysisContent),
          updatedAt: selectedProject.updatedAt,
        },
        {
          name: "manifest.json",
          blob: textBlob(JSON.stringify(manifest, null, 2), "application/json;charset=utf-8"),
          updatedAt: selectedProject.updatedAt,
        },
      ];
      const zip = await buildZipBlob(files);
      downloadBlob(zip, `${safeFileName(selectedProject.title || "ecommerce-suite")}-delivery.zip`);
      toast.success(`已打包 ${imageFiles.length} 张图片、文案和 manifest`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "打包下载失败");
    } finally {
      setDeliveryAction("");
    }
  };

  const saveAnalysisAsTextAsset = async () => {
    const project = selectedProjectRef.current;
    if (!project || deliveryAction) {
      return;
    }
    if (!project.analysisText.trim()) {
      toast.error("请先生成或填写商品文案");
      return;
    }
    setDeliveryAction("text");
    try {
      const item = await createManagedTextAsset({
        name: `${project.title || "未命名商品套图"} 商品文案`,
        content: formatAnalysisAssetContent(project),
      }, { scope: "mine" });
      toast.success(`已保存到文本素材「${item.name || "商品文案"}」，可在画布和社媒运营中引用`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "保存文本素材失败";
      toast.error(`保存到文本素材失败：${message}`);
    } finally {
      setDeliveryAction("");
    }
  };

  const archiveCompletedResults = async () => {
    const project = selectedProjectRef.current;
    if (!project || deliveryAction) {
      return;
    }
    const paths = Array.from(new Set(project.results
      .filter((result) => result.status === "success")
      .map((result) => result.path || "")
      .filter(Boolean)));
    const completedCount = project.results.filter((result) => result.status === "success").length;
    if (paths.length === 0) {
      toast.error("当前完成图片还没有素材库路径，无法归入素材集");
      return;
    }
    setDeliveryAction("archive");
    try {
      const collection = await createManagedImageCollection(project.title || "电商套图", { scope: "mine" });
      const collectionId = collection.item.id;
      const collectionName = collection.item.name || project.title || "电商套图";
      const result = await updateManagedImageCollectionItems(collectionId, paths, { scope: "mine" });
      const skipped = Math.max(0, completedCount - paths.length);
      setArchivedCollectionLink({ id: collectionId, name: collectionName, scope: "mine" });
      toast.success(`已将 ${result.updated || paths.length} 张图片归入「${collectionName}」${skipped ? `，跳过 ${skipped} 张本地结果` : ""}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "归入素材集失败");
    } finally {
      setDeliveryAction("");
    }
  };

  return (
    <>
      <section className="flex h-full min-h-0 w-full overflow-hidden rounded-[24px] border border-border bg-card text-card-foreground shadow-[0_16px_42px_rgba(24,40,72,0.08)]">
        <aside
        className={cn(
          "relative z-20 hidden h-full min-h-0 shrink-0 flex-col overflow-hidden border-r border-border bg-muted/30 transition-[width] duration-300 ease-out lg:flex",
          leftRailExpanded ? "w-[292px]" : "w-[68px]",
        )}
        onMouseEnter={() => {
          if (leftRailCollapsed) {
            setLeftRailHoverExpanded(true);
          }
        }}
        onMouseLeave={() => {
          if (leftRailCollapsed) {
            setLeftRailHoverExpanded(false);
          }
        }}
      >
        <div className={cn("flex items-center gap-3 border-b border-border transition-all duration-300", leftRailExpanded ? "justify-between p-4" : "justify-center px-2 py-4")}>
          <button
            type="button"
            className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[#1456f0]/10 text-[#1456f0] transition hover:bg-[#1456f0]/15 dark:bg-sky-400/10 dark:text-sky-300"
            onClick={() => {
              if (leftRailCollapsed && leftRailExpanded) {
                setLeftRailCollapsed(false);
                setLeftRailHoverExpanded(false);
                return;
              }
              if (!leftRailExpanded) {
                setLeftRailHoverExpanded(true);
              }
            }}
            title={leftRailCollapsed && leftRailExpanded ? "固定展开电商套图列表" : leftRailExpanded ? "电商套图" : "展开电商套图列表"}
            aria-label={leftRailCollapsed && leftRailExpanded ? "固定展开电商套图列表" : leftRailExpanded ? "电商套图" : "展开电商套图列表"}
          >
            <PackageSearch className="size-5" />
          </button>
          <div className={cn("min-w-0 flex-1 transition-all duration-300", leftRailExpanded ? "block opacity-100" : "hidden opacity-0")}>
            <h1 className="font-display text-lg font-semibold text-foreground">电商套图</h1>
            <p className="text-xs text-muted-foreground">商品文案与详情设计</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className={cn("size-8 shrink-0 rounded-xl transition-all duration-300", leftRailExpanded ? "flex opacity-100" : "hidden opacity-0")}
            onClick={() => {
              setLeftRailCollapsed(true);
              setLeftRailHoverExpanded(false);
            }}
            title={leftRailCollapsed ? "当前为悬停展开，点击收起" : "收起电商套图列表"}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button size="icon" className={cn("size-9 shrink-0 rounded-xl transition-all duration-300", leftRailExpanded ? "flex opacity-100" : "hidden opacity-0")} onClick={() => void createProject()} title="新建项目">
            <Plus className="size-4" />
          </Button>
        </div>
        <div className={cn("hide-scrollbar min-h-0 flex-1 overflow-y-auto p-3 transition-all duration-300", leftRailExpanded ? "opacity-100" : "pointer-events-none opacity-0")}>
          {projects.length === 0 ? (
            <div className="grid gap-2">
              {FEATURE_ACTIONS.map((feature) => {
                const Icon = feature.icon;
                return (
                  <button
                    key={feature.id}
                    type="button"
                    className="rounded-2xl border border-border bg-background p-3 text-left transition hover:bg-accent"
                    onClick={() => void createProjectFromFeature(feature.templateIds)}
                  >
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Icon className="size-4 text-[#1456f0]" />
                      {feature.title}
                    </div>
                    <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{feature.description}</div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="grid gap-2">
              {projects.map((project) => {
                const active = project.id === selectedProject?.id;
                const renaming = renamingProjectId === project.id;
                return (
                  <div
                    key={project.id}
                    role="button"
                    tabIndex={0}
                    className={cn(
                      "rounded-2xl border p-3 text-left transition",
                      active
                        ? "border-[#1456f0]/40 bg-[#edf4ff] text-[#123a8c] dark:bg-sky-950/30 dark:text-sky-200"
                        : "border-border bg-background hover:bg-accent",
                    )}
                    onClick={() => {
                      if (!renaming) {
                        setSelectedId(project.id);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (!renaming && (event.key === "Enter" || event.key === " ")) {
                        event.preventDefault();
                        setSelectedId(project.id);
                      }
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      {renaming ? (
                        <Input
                          value={renamingTitle}
                          autoFocus
                          onChange={(event) => setRenamingTitle(event.target.value)}
                          onClick={(event) => event.stopPropagation()}
                          onBlur={() => void commitRenameProject()}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void commitRenameProject();
                            } else if (event.key === "Escape") {
                              event.preventDefault();
                              cancelRenameProject();
                            }
                          }}
                          className="h-8 min-w-0 flex-1 rounded-xl text-xs font-semibold"
                        />
                      ) : (
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{project.title}</span>
                      )}
                      <Badge variant={project.results.some((result) => isActiveTask(result.status)) ? "warning" : "secondary"}>
                        {projectStatus(project)}
                      </Badge>
                    </div>
                    <div className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                      {project.analysisText || `${project.referenceImages.length} 张产品/参考图 · ${project.selectedTemplates.length} 个设计`}
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-[11px] text-muted-foreground">{formatDateTime(project.updatedAt)}</span>
                      <span className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          className="flex size-7 items-center justify-center rounded-lg text-muted-foreground opacity-80 transition hover:bg-background hover:text-foreground"
                          onClick={(event) => {
                            event.stopPropagation();
                            beginRenameProject(project);
                          }}
                          title="编辑名称"
                          aria-label="编辑名称"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          className="flex size-7 items-center justify-center rounded-lg text-muted-foreground opacity-80 transition hover:bg-rose-500/10 hover:text-rose-600"
                          onClick={(event) => {
                            event.stopPropagation();
                            void removeProject(project);
                          }}
                          title="删除项目"
                          aria-label="删除项目"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className={cn("absolute left-0 top-[82px] flex w-[68px] flex-col items-center gap-3 transition-all duration-300", leftRailExpanded ? "pointer-events-none -translate-x-3 opacity-0" : "translate-x-0 opacity-100")}>
          <div className="rounded-full bg-[#1456f0]/10 px-2 py-1 text-[11px] font-semibold text-[#1456f0] dark:text-sky-200">{projects.length}</div>
          <Button size="icon" className="size-9 rounded-xl" onClick={() => void createProject()} title="新建项目">
            <Plus className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-9 rounded-xl bg-background/90"
            onClick={() => setLeftRailHoverExpanded(true)}
            title="展开"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </aside>

      <main className="grid h-full min-h-0 min-w-0 flex-1 grid-cols-[minmax(360px,0.76fr)_minmax(440px,1fr)] overflow-hidden max-xl:grid-cols-1">
        <div className="flex items-center justify-between gap-2 border-b border-border bg-background/80 px-3 py-2 lg:hidden">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-[#1456f0]/10 text-[#1456f0] dark:bg-sky-400/10 dark:text-sky-300">
            <PackageSearch className="size-4" />
          </span>
          <div className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-foreground">
            {selectedProject?.title || "电商套图"}
          </div>
          <Button size="icon" className="size-9 rounded-full" onClick={() => void createProject()} title="新建项目" aria-label="新建项目">
            <Plus className="size-4" />
          </Button>
        </div>
        <section className="hide-scrollbar h-full min-h-0 overflow-y-auto border-r border-border p-4 max-xl:border-r-0">
          {!selectedProject ? (
            <div className="grid gap-4">
              <section className="rounded-2xl border border-border bg-background p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="inline-flex items-center gap-2 rounded-full border border-[#1456f0]/20 bg-[#edf4ff] px-3 py-1 text-xs font-semibold text-[#1456f0] dark:bg-sky-950/30">
                      <PackageSearch className="size-3.5" />
                      电商商品视觉工作台
                    </div>
                    <h2 className="mt-4 font-display text-2xl font-semibold text-foreground">从产品图开始，生成主图和详情套图</h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                      这里会帮你把产品图和参考图变成可用的电商图片。先选择要做的内容，创建项目后上传图片，再继续生成文案或图片。
                    </p>
                  </div>
                  <Button className="h-10 rounded-xl" onClick={() => void createProject()}>
                    <Plus className="size-4" />
                    空白项目
                  </Button>
                </div>
              </section>

              <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
                {FEATURE_ACTIONS.map((feature) => {
                  const Icon = feature.icon;
                  return (
                    <button
                      key={feature.id}
                      type="button"
                      className="group min-h-[168px] rounded-2xl border border-border bg-background p-4 text-left transition hover:border-[#1456f0]/35 hover:bg-[#edf4ff] dark:hover:bg-sky-950/30"
                      onClick={() => void createProjectFromFeature(feature.templateIds)}
                    >
                      <span className="inline-flex size-10 items-center justify-center rounded-xl bg-muted text-[#1456f0] transition group-hover:bg-background">
                        <Icon className="size-5" />
                      </span>
                      <span className="mt-4 block text-base font-semibold text-foreground">{feature.title}</span>
                      <span className="mt-2 block text-sm leading-6 text-muted-foreground">{feature.description}</span>
                      <span className="mt-3 block text-xs leading-5 text-muted-foreground">{feature.detail}</span>
                    </button>
                  );
                })}
              </div>

              <Card className="gap-4 rounded-2xl p-4">
                <div>
                  <div className="text-sm font-semibold text-foreground">图片模板库</div>
                  <div className="text-xs text-muted-foreground">主图和详情页图片都可以按需选择</div>
                </div>
                {TEMPLATE_GROUPS.map((group) => (
                  <div key={group.id} className="grid gap-2">
                    <div className="text-xs font-semibold text-[#1456f0]">{group.title}</div>
                    <div className="grid grid-cols-4 gap-2 max-lg:grid-cols-2">
                      {group.templateIds.map((templateId) => {
                        const template = templateById(templateId);
                        if (!template) return null;
                        return (
                          <div key={template.id} className="rounded-xl border border-border bg-background p-3">
                            <div className="text-sm font-semibold">{template.shortTitle}</div>
                            <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{template.title}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </Card>
            </div>
          ) : (
            <div className="grid gap-4">
              <Card className="gap-4 rounded-2xl p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">产品图与参考图</div>
                    <div className="text-xs text-muted-foreground">产品图锁定主体，参考图补充风格、场景、细节和竞品方向</div>
                  </div>
                  <Badge variant={selectedProject.referenceImages.length > selectedProjectImageReferenceLimit ? "danger" : "info"}>
                    {selectedProject.referenceImages.length}/{selectedProjectImageReferenceLimit}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
                  {REFERENCE_IMAGE_SLOTS.map((slot) => {
                    const images = selectedProject.referenceImages.filter((item) => item.role === slot.role);
                    const inputId = `commerce-reference-${slot.role}`;
                    const referenceLimitReached = selectedProject.referenceImages.length >= selectedProjectImageReferenceLimit;
                    return (
                      <div key={slot.role} className="grid gap-1.5 rounded-xl border border-border bg-background p-2">
                        <div className="flex h-7 items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-foreground">{slot.title}</div>
                            <div className="truncate text-[11px] text-muted-foreground">{slot.description}</div>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 rounded-lg px-2 text-xs"
                              onClick={() => openReferenceLibrary(slot.role)}
                              disabled={referenceLimitReached}
                            >
                              <Images className="size-3" />
                              素材库
                            </Button>
                            <Button
                              asChild
                              variant="outline"
                              size="sm"
                              className={cn("h-7 rounded-lg px-2 text-xs", (referenceLimitReached || uploading) && "pointer-events-none opacity-50")}
                              aria-disabled={referenceLimitReached || uploading}
                            >
                              <label htmlFor={inputId} className={cn(referenceLimitReached || uploading ? "cursor-not-allowed" : "cursor-pointer")}>
                                {uploading ? <LoaderCircle className="size-3 animate-spin" /> : <ImagePlus className="size-3" />}
                                上传
                              </label>
                            </Button>
                          </div>
                          <input
                            id={inputId}
                            type="file"
                            accept="image/*"
                            multiple
                            className="sr-only"
                            disabled={uploading || referenceLimitReached}
                            onChange={(event) => {
                              void handleReferenceUpload(event.target.files, slot.role);
                              event.target.value = "";
                            }}
                          />
                        </div>
                        {images.length > 0 ? (
                          <div className="grid grid-cols-3 gap-1.5">
                            {images.map((image, index) => (
                              <div key={image.id} className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted">
                                <img src={image.dataUrl} alt={image.name} className="h-full w-full object-cover" />
                                <div className="absolute left-1.5 top-1.5 rounded-full bg-background/90 px-1.5 py-0.5 text-[10px] font-semibold text-foreground shadow-sm">
                                  {index + 1}
                                </div>
                                <div className="absolute inset-x-0 bottom-0 bg-background/92 px-1.5 py-1 text-[10px]">
                                  <div className="truncate font-medium">{image.name}</div>
                                  <div className="truncate text-muted-foreground">{formatFileSize(image.size) || taskStatusLabel(image.uploadStatus === "uploaded" ? "success" : "idle")}</div>
                                </div>
                                <button
                                  type="button"
                                  className="absolute right-1 top-1 inline-flex size-6 items-center justify-center rounded-lg bg-background/90 text-muted-foreground opacity-0 shadow-sm transition hover:text-rose-600 group-hover:opacity-100"
                                  onClick={() => void removeReferenceImage(image.id)}
                                  title={`移除${slot.title}`}
                                >
                                  <Trash2 className="size-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <label
                            htmlFor={inputId}
                            className="flex h-20 cursor-pointer items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 text-center text-xs text-muted-foreground transition hover:bg-accent"
                          >
                            上传{slot.title}，可多选
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>

              <Card className="gap-4 rounded-2xl p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">投放定向</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">平台</span>
                    <Select value={selectedProject.targeting.platform} onValueChange={(value) => updateTargeting("platform", value)}>
                      <SelectTrigger className="h-10 rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COMMERCE_SUITE_PLATFORMS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">市场</span>
                    <Select value={selectedProject.targeting.market} onValueChange={(value) => updateTargeting("market", value)}>
                      <SelectTrigger className="h-10 rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COMMERCE_SUITE_MARKETS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">语言</span>
                    <Select value={selectedProject.targeting.language} onValueChange={(value) => updateTargeting("language", value)}>
                      <SelectTrigger className="h-10 rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COMMERCE_SUITE_LANGUAGES.map((option) => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                </div>
                <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">分析模型</span>
                    <Select value={selectedProject.chatModel} onValueChange={(value) => updateSelectedProject({ chatModel: value })}>
                      <SelectTrigger className="h-10 rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {chatModelOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value} textValue={displayModelLabel(option.value, option.label)}>
                            <ModelProviderOptionLabel model={option.value} label={option.label} />
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">图片模型</span>
                    <Select value={selectedProject.professionalMode ? OFFICIAL_IMAGE_MODEL : selectedProject.imageModel} onValueChange={(value) => updateSelectedProject({ imageModel: value })} disabled={selectedProject.professionalMode}>
                      <SelectTrigger className="h-10 rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedProject.professionalMode
                          ? (
                              <SelectItem value={OFFICIAL_IMAGE_MODEL} textValue={OFFICIAL_IMAGE_MODEL}>
                                <ModelProviderOptionLabel model={OFFICIAL_IMAGE_MODEL} label={OFFICIAL_IMAGE_MODEL} />
                              </SelectItem>
                            )
                          : imageModelOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value} textValue={displayModelLabel(option.value, option.label)}>
                                <ModelProviderOptionLabel model={option.value} label={option.label} />
                              </SelectItem>
                            ))}
                      </SelectContent>
                    </Select>
                  </label>
                  {!selectedProject.professionalMode && imageModelHasSettings(selectedProject.imageModel) ? (
                    <div className="grid gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">模型</span>
                      <ImageModelSettingsButton
                        model={selectedProject.imageModel}
                        value={selectedProject.imageModelSettings}
                        onChange={(imageModelSettings) => updateSelectedProject({ imageModelSettings })}
                        className="h-10 w-full rounded-xl"
                      />
                    </div>
                  ) : null}
                  {!selectedProject.professionalMode && (
                    isOfficialImageModel(selectedProject.imageModel) ||
                    (isGrokImagineImageModel(selectedProject.imageModel) && selectedProject.referenceImages.length === 0)
                  ) ? (
                    <label className="grid gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">
                        {isGrokImagineImageModel(selectedProject.imageModel) ? "质量" : "质量强度"}
                      </span>
                      <Select
                        value={isGrokImagineImageModel(selectedProject.imageModel)
                          ? normalizeGrokImageQuality(selectedProject.imageQuality)
                          : isImageQuality(selectedProject.imageQuality) ? selectedProject.imageQuality : "auto"}
                        onValueChange={(value) =>
                          updateSelectedProject({
                            imageQuality: isGrokImagineImageModel(selectedProject.imageModel)
                              ? normalizeGrokImageQuality(value)
                              : isImageQuality(value) ? value : "auto",
                          })
                        }
                      >
                        <SelectTrigger className="h-10 rounded-xl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(isGrokImagineImageModel(selectedProject.imageModel)
                            ? GROK_IMAGE_QUALITY_OPTIONS
                            : IMAGE_QUALITY_OPTIONS).map((option) => (
                            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                  ) : null}
                </div>
                <div className="mt-3">
                  <ProStudioPanel
                    scope="ecommerce"
                    state={{ ...selectedProject.proStudioState, enabled: selectedProject.professionalMode }}
                    onChange={(next) => updateSelectedProject({
                      professionalMode: next.enabled,
                      proStudioState: next,
                      imageQuality: next.enabled && isImageQuality(next.settings.quality) ? next.settings.quality : selectedProject.imageQuality,
                    })}
                    fieldClassName="flex h-10 min-w-0 items-center justify-between gap-2 rounded-xl border border-input bg-background px-3 text-xs"
                    selectTriggerClassName="h-8 min-w-0 flex-1 justify-end gap-1 border-0 bg-transparent px-0 py-0 text-right text-xs font-bold shadow-none focus-visible:ring-0 [&_svg]:size-4 [&_svg]:opacity-60 [&>span]:flex-none"
                    inputClassName="h-8 min-w-0 border-0 bg-transparent px-0 text-right text-xs font-bold shadow-none focus-visible:ring-0 disabled:cursor-not-allowed"
                    labelClassName="text-[11px] font-bold text-muted-foreground"
                  />
                </div>
              </Card>

              <Card className="gap-4 rounded-2xl p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">商品文案策划</div>
                    <div className="text-xs text-muted-foreground">自动生成标题、卖点、参数说明和详情页文案，可手动改写</div>
                  </div>
                  <Badge variant={taskStatusVariant(selectedProject.analysisStatus)}>{taskStatusLabel(selectedProject.analysisStatus)}</Badge>
                </div>
                <Textarea
                  value={selectedProject.analysisText}
                  onChange={(event) => updateSelectedProject({ analysisText: event.target.value })}
                  className="h-56 min-h-56 resize-none rounded-xl"
                  placeholder="点击分析商品后，会自动填入商品标题、一句话卖点、核心卖点、参数说明、详情页首屏文案、详情页模块文案和视觉风格方向。"
                />
                <div className="min-h-[184px] rounded-2xl border border-border bg-muted/20 p-3">
                  {isActiveTask(selectedProject.analysisStatus) ? (
                    <div className="flex h-[152px] items-center justify-center gap-2 text-sm text-muted-foreground">
                      <LoaderCircle className="size-4 animate-spin" />
                      文案生成中，完成后会自动整理成结构化模块
                    </div>
                  ) : analysisSections.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2 max-md:grid-cols-1">
                      {analysisSections.slice(0, 8).map((section) => (
                        <div key={section.title} className="min-h-[72px] rounded-xl border border-border bg-background p-3">
                          <div className="text-[11px] font-semibold text-[#1456f0]">{section.title}</div>
                          <div className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{section.body}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="grid h-[152px] place-items-center text-center text-xs leading-5 text-muted-foreground">
                      生成后会在这里稳定展示标题、核心卖点、参数说明和详情页文案。
                    </div>
                  )}
                </div>
                {selectedProject.analysisError ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
                    {selectedProject.analysisError}
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button className="h-10 rounded-xl" onClick={() => void analyzeProduct()} disabled={analyzing || isActiveTask(selectedProject.analysisStatus)}>
                    {analyzing || isActiveTask(selectedProject.analysisStatus) ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                    生成文案
                  </Button>
                  <Button variant="outline" className="h-10 rounded-xl" onClick={() => void saveCurrentProject()} disabled={saving}>
                    {saving ? <LoaderCircle className="size-4 animate-spin" /> : <Archive className="size-4" />}
                    保存草稿
                  </Button>
                  <Button variant="outline" className="h-10 rounded-xl" onClick={() => void removeProject(selectedProject)}>
                    <Trash2 className="size-4" />
                    删除
                  </Button>
                </div>
              </Card>

              <Card className="gap-4 rounded-2xl p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">想先做什么</div>
                    <div className="text-xs text-muted-foreground">先选生成目标，再上传参考图开始制作</div>
                  </div>
                  <Badge variant="secondary">工具台</Badge>
                </div>
                <div className="grid grid-cols-4 gap-2 max-lg:grid-cols-2 max-sm:grid-cols-1">
                  {FEATURE_ACTIONS.map((feature) => {
                    const Icon = feature.icon;
                    const active = feature.templateIds.length === selectedProject.selectedTemplates.length &&
                      feature.templateIds.every((id) => selectedProject.selectedTemplates.includes(id));
                    return (
                      <button
                        key={feature.id}
                        type="button"
                        className={cn(
                          "rounded-2xl border p-3 text-left transition",
                          active
                            ? "border-[#1456f0]/40 bg-[#edf4ff] dark:bg-sky-950/30"
                            : "border-border bg-background hover:bg-accent",
                        )}
                        onClick={() => void applyFeatureToProject(feature.templateIds)}
                      >
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          <Icon className="size-4 text-[#1456f0]" />
                          {feature.title}
                        </div>
                        <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{feature.description}</div>
                      </button>
                    );
                  })}
                </div>
              </Card>

              <Card className="gap-2 rounded-2xl p-3">
                <div className="flex min-h-7 items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">要生成的图片</div>
                  </div>
                  <Badge variant="secondary">已选 {selectedProject.selectedTemplates.length}/{COMMERCE_SUITE_TEMPLATES.length}</Badge>
                </div>
                <div className="grid gap-2.5">
                  {selectedProject.professionalMode ? (
                    <div className="grid gap-2">
                      <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
                        {PRO_STUDIO_OUTPUTS.map((output) => {
                          const checked = selectedProject.selectedTemplates.includes(output.id);
                          const count = output.count(selectedProject);
                          return (
                            <button
                              key={output.id}
                              type="button"
                              className={cn(
                                "flex min-h-[52px] items-start gap-2.5 rounded-xl border px-3 py-2 text-left transition",
                                checked ? "border-[#1456f0]/40 bg-[#edf4ff] dark:bg-sky-950/30" : "border-border bg-background hover:bg-accent",
                              )}
                              onClick={() => setTemplateSelected(output.id)}
                              aria-pressed={checked}
                            >
                              <span
                                aria-hidden="true"
                                className={cn(
                                  "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition",
                                  checked ? "border-[#1456f0] bg-[#1456f0] text-white" : "border-input bg-background",
                                )}
                              >
                                {checked ? <Check className="size-3" /> : null}
                              </span>
                              <span className="min-w-0">
                                <span className="block text-sm font-semibold leading-5">{output.label}</span>
                                <span className="line-clamp-1 block text-xs leading-4 text-muted-foreground">{count} 张 · official 生产素材</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <label className="grid gap-1.5">
                        <span className="text-xs font-medium text-muted-foreground">SKU 批量张数</span>
                        <Input
                          type="number"
                          min={1}
                          max={24}
                          value={selectedProject.skuCount || 8}
                          onChange={(event) => updateSelectedProject({ skuCount: Math.max(1, Math.min(24, Math.round(Number(event.target.value) || 1))) })}
                          className="h-10 rounded-xl"
                        />
                      </label>
                      <BatchJobPreview total={proStudioTemplateIds(selectedProject).reduce((sum, id) => {
                        const output = PRO_STUDIO_OUTPUTS.find((item) => item.id === id);
                        return sum + (output?.count(selectedProject) || 1);
                      }, 0)} />
                    </div>
                  ) : TEMPLATE_GROUPS.map((group) => (
                    <div key={group.id} className="grid gap-1.5">
                      <div className="flex h-6 items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-[#1456f0]">{group.title}</div>
                        </div>
                        <Badge variant="outline" className="h-5 rounded-full px-2 text-[11px]">
                          {group.templateIds.filter((id) => selectedProject.selectedTemplates.includes(id)).length}/{group.templateIds.length}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
                        {group.templateIds.map((templateId) => {
                          const template = templateById(templateId);
                          if (!template) return null;
                          const checked = selectedProject.selectedTemplates.includes(template.id);
                          return (
                            <button
                              key={template.id}
                              type="button"
                              className={cn(
                                "flex min-h-[52px] items-start gap-2.5 rounded-xl border px-3 py-2 text-left transition",
                                checked ? "border-[#1456f0]/40 bg-[#edf4ff] dark:bg-sky-950/30" : "border-border bg-background hover:bg-accent",
                              )}
                              onClick={() => setTemplateSelected(template.id)}
                              aria-pressed={checked}
                            >
                              <span
                                aria-hidden="true"
                                className={cn(
                                  "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition",
                                  checked ? "border-[#1456f0] bg-[#1456f0] text-white" : "border-input bg-background",
                                )}
                              >
                                {checked ? <Check className="size-3" /> : null}
                              </span>
                              <span className="min-w-0">
                                <span className="block text-sm font-semibold leading-5">{template.title}</span>
                                <span className="line-clamp-1 block text-xs leading-4 text-muted-foreground">{template.description}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <Button className="h-10 rounded-xl" onClick={() => void submitGenerationTasks(selectedProject.selectedTemplates)} disabled={generating || selectedProject.selectedTemplates.length === 0}>
                  {generating ? <LoaderCircle className="size-4 animate-spin" /> : <WandSparkles className="size-4" />}
                  {selectedProject.professionalMode ? "生成生产素材" : "生成选中的图片"}
                </Button>
              </Card>
            </div>
          )}
        </section>

        <section className="hide-scrollbar h-full min-h-0 overflow-y-auto p-4">
          {!selectedProject ? (
            <div className="grid gap-4">
              <Card className="gap-4 rounded-2xl p-4">
                <div>
                  <div className="text-sm font-semibold text-foreground">推荐流程</div>
                  <div className="text-xs text-muted-foreground">选入口后会自动创建项目</div>
                </div>
                <div className="grid gap-3">
                  {[
                    ["1", "上传产品图和参考图", "产品图放主体、包装和角度，参考图补充风格、场景或细节。"],
                    ["2", "生成文案", "自动得到标题、卖点、参数说明和详情页文案。"],
                    ["3", "选择生成目标", "主图、详情设计或套图设计。"],
                    ["4", "下载单图或整套预览", "每张图可以单独重试，也可以拼成一张总览图。"],
                  ].map(([step, title, body]) => (
                    <div key={step} className="flex gap-3 rounded-2xl border border-border bg-background p-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{step}</span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{title}</span>
                        <span className="mt-1 block text-xs leading-5 text-muted-foreground">{body}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="gap-4 rounded-2xl p-4">
                <div>
                  <div className="text-sm font-semibold text-foreground">可以做什么</div>
                  <div className="text-xs text-muted-foreground">从商品文案到成图都在这里完成</div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {["商品文案", "主图快生成", "详情设计", "套图设计", "单图下载", "整套预览下载"].map((item) => (
                    <div key={item} className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium">
                      {item}
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          ) : (
            <div className="grid gap-4">
              <Card className="gap-4 rounded-2xl p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">生成结果</div>
                    <div className="text-xs text-muted-foreground">每张图会单独生成，失败的可以单独重试</div>
                  </div>
                  <Button
                    variant="outline"
                    className="h-9 rounded-xl"
                    onClick={() => void saveAnalysisAsTextAsset()}
                    disabled={deliveryAction !== "" || !selectedProject.analysisText.trim()}
                    title="保存到文本素材后，可在画布和社媒运营中复用"
                  >
                    {deliveryAction === "text" ? <LoaderCircle className="size-4 animate-spin" /> : <Archive className="size-4" />}
                    保存到文本素材
                  </Button>
                  <Button
                    variant="outline"
                    className="h-9 rounded-xl"
                    onClick={() => void archiveCompletedResults()}
                    disabled={deliveryAction !== "" || completedResults.length === 0}
                  >
                    {deliveryAction === "archive" ? <LoaderCircle className="size-4 animate-spin" /> : <Images className="size-4" />}
                    归入素材集
                  </Button>
                  <Button
                    variant="outline"
                    className="h-9 rounded-xl"
                    onClick={() => void downloadCompletedResults()}
                    disabled={deliveryAction !== "" || completedResults.length === 0}
                  >
                    {deliveryAction === "zip" ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
                    打包下载
                  </Button>
                </div>
                {activeResults.length > 0 ? (
                  <div className="rounded-2xl border border-sky-200 bg-sky-50/80 p-3 text-sky-950 dark:border-sky-900/60 dark:bg-sky-950/25 dark:text-sky-100">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 gap-3">
                        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-[#1456f0] ring-1 ring-sky-100 dark:bg-sky-950/60 dark:ring-sky-800">
                          <LoaderCircle className="size-4 animate-spin" />
                        </span>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold">正在生成套图</div>
                          <div className="mt-1 text-xs leading-5 text-sky-800 dark:text-sky-200">
                            已提交 {generationTotal} 张，{activeResults.length} 张处理中，完成 {completedResults.length} 张
                            {failedResults.length > 0 ? `，失败 ${failedResults.length} 张` : ""}
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-sky-800 ring-1 ring-sky-100 dark:bg-sky-950/60 dark:text-sky-100 dark:ring-sky-800">
                        <Clock3 className="size-3.5" />
                        <span className="font-mono tabular-nums">{generationElapsed || "00:00"}</span>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] text-sky-800 dark:text-sky-200">
                        <span>任务会自动刷新，完成后图片会出现在下方</span>
                        <span className="font-mono tabular-nums">{generationProgressPercent}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/85 dark:bg-sky-950/70">
                        <div className="h-full rounded-full bg-[#1456f0] transition-[width] duration-300" style={{ width: `${generationProgressPercent}%` }} />
                      </div>
                    </div>
                  </div>
                ) : null}
                {archivedCollectionLink ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-3 text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-100">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">已归入素材集「{archivedCollectionLink.name}」</div>
                      <div className="mt-1 text-xs text-emerald-800 dark:text-emerald-200">打开素材库后会自动定位到这组图片</div>
                    </div>
                    <Button
                      variant="outline"
                      className="h-9 rounded-xl border-emerald-200 bg-white/80 text-emerald-900 hover:bg-white dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100"
                      onClick={() => {
                        const params = new URLSearchParams({
                          scope: archivedCollectionLink.scope,
                          collection_id: archivedCollectionLink.id,
                        });
                        window.location.href = `/image-manager?${params.toString()}`;
                      }}
                    >
                      <Images className="size-4" />
                      打开素材集
                    </Button>
                  </div>
                ) : null}
                {selectedProject.results.length === 0 ? (
                  <div className="overflow-hidden rounded-2xl border border-dashed border-border bg-muted/25">
                    <div className="relative aspect-[4/3] bg-muted">
                      <img src={exampleModuleImage} alt="结果预览" className="h-full w-full object-cover" />
                      <Badge variant="secondary" className="absolute left-3 top-3 bg-background/90">示例</Badge>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 p-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-foreground">结果预览</div>
                        <div className="text-xs text-muted-foreground">生成完成后，会在这里展示你的商品图</div>
                      </div>
                      <Badge variant="outline">待生成</Badge>
                    </div>
                  </div>
                ) : selectedGalleryResult ? (
                  <div className="grid min-h-[560px] grid-cols-[minmax(0,1fr)_112px] gap-4 max-md:grid-cols-1">
                    <div className="min-w-0 overflow-hidden rounded-2xl bg-muted/40">
                      <div className="relative flex min-h-[420px] items-center justify-center bg-muted">
                        {commerceSuiteResultImageSource(selectedGalleryResult) ? (
                          <AuthenticatedImage
                            src={commerceSuiteResultImageSource(selectedGalleryResult)}
                            alt={commerceResultTitle(selectedGalleryResult)}
                            className="max-h-[min(68vh,760px)] w-full object-contain"
                          />
                        ) : (
                          <div className="grid min-h-[420px] place-items-center text-sm text-muted-foreground">
                            {isActiveTask(selectedGalleryResult.status) ? <LoaderCircle className="size-7 animate-spin" /> : "暂无图片"}
                          </div>
                        )}
                        <div className="absolute left-3 top-3">
                          <Badge variant={taskStatusVariant(selectedGalleryResult.status)}>{taskStatusLabel(selectedGalleryResult.status)}</Badge>
                        </div>
                        {selectedGalleryResult.status === "success" ? (
                          <div className="absolute right-3 top-3 rounded-full bg-background/90 p-1 text-emerald-600 shadow-sm">
                            <CheckCircle2 className="size-4" />
                          </div>
                        ) : null}
                      </div>
                      <div className="grid gap-3 border-t border-border/70 bg-background/80 p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-base font-semibold text-foreground">{commerceResultTitle(selectedGalleryResult)}</div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <span>{resultGroupLabel(selectedGalleryItem.groupId)}</span>
                              {selectedGalleryResult.updatedAt ? <span>{formatDateTime(selectedGalleryResult.updatedAt)}</span> : null}
                            </div>
                          </div>
                          <ProStudioBadge proStudio={selectedGalleryResult.proStudio} officialSettings={selectedGalleryResult.officialSettings} compact />
                        </div>
                        {selectedGalleryResult.error ? (
                          <div className="rounded-xl bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700 dark:bg-rose-950/25 dark:text-rose-300">
                            {selectedGalleryResult.error}
                          </div>
                        ) : null}
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-9 rounded-xl"
                            onClick={() => void retryTemplate(selectedGalleryResult)}
                            disabled={isActiveTask(selectedGalleryResult.status) || generating}
                          >
                            <RotateCcw className="size-3.5" />
                            重试
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-9 rounded-xl"
                            onClick={() => void downloadResult(selectedGalleryResult)}
                            disabled={!commerceSuiteResultImageSource(selectedGalleryResult)}
                          >
                            <Download className="size-3.5" />
                            下载
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="min-h-0 rounded-2xl bg-muted/30 p-2 max-md:max-h-36">
                      <div className="hide-scrollbar flex max-h-[720px] flex-col gap-2 overflow-y-auto pr-1 max-md:flex-row max-md:overflow-x-auto max-md:overflow-y-hidden max-md:pr-0">
                        {galleryResults.map(({ groupId, result }) => {
                          const src = commerceSuiteResultImageSource(result);
                          const key = resultViewKey(result);
                          const active = selectedGalleryKey === key;
                          return (
                            <button
                              key={key}
                              type="button"
                              className={cn(
                                "group relative size-24 shrink-0 overflow-hidden rounded-xl bg-background transition",
                                active ? "ring-2 ring-[#1456f0] ring-offset-2 ring-offset-background" : "opacity-80 hover:opacity-100",
                              )}
                              onClick={() => setSelectedResultKey(key)}
                              title={`${resultGroupLabel(groupId)} · ${commerceResultTitle(result)}`}
                              aria-label={`查看${commerceResultTitle(result)}`}
                              aria-pressed={active}
                            >
                              {src ? (
                                <AuthenticatedImage src={src} alt={commerceResultTitle(result)} className="h-full w-full object-cover" />
                              ) : (
                                <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                                  {isActiveTask(result.status) ? <LoaderCircle className="size-5 animate-spin" /> : <Images className="size-5" />}
                                </span>
                              )}
                              <span className="absolute left-1 top-1 rounded-full bg-background/90 px-1.5 py-0.5 text-[10px] font-semibold text-foreground shadow-sm">
                                {taskStatusLabel(result.status)}
                              </span>
                              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-1.5 pb-1 pt-5 text-left text-[10px] font-semibold leading-3 text-white">
                                <span className="line-clamp-2">{commerceResultShortTitle(result)}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : null}
              </Card>

              <Card className="gap-4 rounded-2xl p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">排版与合成</div>
                    <div className="text-xs text-muted-foreground">已完成图片会在下面实时排版，下载时直接导出当前拼图</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={summaryLayoutResults.length > 0 ? "success" : "secondary"}>
                      {summaryLayoutResults.length} 张参与排版
                    </Badge>
                    <Badge variant="outline">{summaryLayoutModeLabel(summaryLayout.mode)}</Badge>
                  </div>
                </div>

                <div className="grid gap-3 rounded-xl bg-muted/20 p-3">
                  <div className="grid grid-cols-4 gap-2 max-lg:grid-cols-2">
                    {SUMMARY_LAYOUT_MODE_OPTIONS.map((option) => {
                      const active = summaryLayout.mode === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          className={cn(
                            "min-h-[72px] rounded-xl border p-3 text-left transition",
                            active
                              ? "border-[#1456f0]/45 bg-[#edf4ff] text-[#123a8c] dark:bg-sky-950/30 dark:text-sky-200"
                              : "border-border bg-background hover:bg-accent",
                          )}
                          onClick={() => void updateSummaryLayout({ mode: option.value })}
                        >
                          <span className="block text-sm font-semibold">{option.label}</span>
                          <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted-foreground">{option.description}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
                    <label className="grid gap-1.5">
                      <span className="text-xs font-semibold text-muted-foreground">图片适配</span>
                      <Select
                        value={summaryLayout.fit}
                        onValueChange={(value) => void updateSummaryLayout({ fit: value as CommerceSummaryFitMode })}
                      >
                        <SelectTrigger className="h-9 rounded-xl bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SUMMARY_FIT_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                    <label className="grid gap-1.5">
                      <span className="text-xs font-semibold text-muted-foreground">间距</span>
                      <Input
                        type="number"
                        min={0}
                        max={96}
                        value={summaryLayout.gap}
                        onChange={(event) => void updateSummaryLayout({ gap: Number(event.target.value) })}
                        className="h-9 rounded-xl bg-background"
                      />
                    </label>
                    <label className="grid gap-1.5">
                      <span className="text-xs font-semibold text-muted-foreground">背景</span>
                      <Select
                        value={summaryLayout.background}
                        onValueChange={(value) => void updateSummaryLayout({ background: value })}
                      >
                        <SelectTrigger className="h-9 rounded-xl bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SUMMARY_BACKGROUND_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              <span className="inline-flex items-center gap-2">
                                <span className="size-3 rounded-full border border-border" style={{ backgroundColor: option.value }} />
                                {option.label}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                    <div className="grid gap-1.5">
                      <span className="text-xs font-semibold text-muted-foreground">标题栏</span>
                      <Button
                        variant="outline"
                        className="h-9 justify-start rounded-xl bg-background"
                        onClick={() => void updateSummaryLayout({ showHeader: !summaryLayout.showHeader })}
                      >
                        {summaryLayout.showHeader ? <Check className="size-4" /> : null}
                        {summaryLayout.showHeader ? "显示标题" : "隐藏标题"}
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs leading-5 text-muted-foreground">
                      当前：{summaryLayoutModeLabel(summaryLayout.mode)} · {summaryLayout.fit === "contain" ? "完整显示" : "铺满裁切"} · 间距 {summaryLayout.gap}px
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        className="h-9 rounded-xl"
                        onClick={() => void downloadSummaryPreview()}
                        disabled={buildingSummary || summaryLayoutResults.length === 0}
                      >
                        {buildingSummary ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
                        下载拼图
                      </Button>
                      <Button
                        className="h-9 rounded-xl"
                        onClick={() => void submitSummaryCompositeTask()}
                        disabled={deliveryAction !== "" || generating || summaryLayoutResults.length === 0}
                      >
                        {deliveryAction === "composite" ? <LoaderCircle className="size-4 animate-spin" /> : <WandSparkles className="size-4" />}
                        生成 AI 合成图
                      </Button>
                    </div>
                  </div>
                </div>

                {compositeSourceResults.length === 0 ? (
                  <div className="grid min-h-40 place-items-center rounded-xl bg-muted/25 p-6 text-center text-sm text-muted-foreground">
                    生成结果完成后，这里会直接按当前模式排成小块
                  </div>
                ) : (
                  <div className="grid gap-3">
                    <div className="grid gap-2 rounded-xl bg-muted/20 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-semibold text-foreground">自定义排列</div>
                          <div className="text-[11px] text-muted-foreground">勾选参与图片，用上下按钮调整拼图顺序</div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-xl"
                          onClick={() => void resetSummaryCustomLayout()}
                          disabled={summaryLayout.resultOrder.length === 0 && summaryLayout.selectedResultKeys.length === 0}
                        >
                          <RefreshCw className="size-3.5" />
                          重置
                        </Button>
                      </div>
                      <div className="grid gap-2">
                        {orderedCompositeSourceResults.map((result, index) => {
                          const key = resultViewKey(result);
                          const src = commerceSuiteResultImageSource(result);
                          const selected = !hasCustomSummarySelection || summarySelectedKeySet.has(key);
                          return (
                            <div
                              key={key}
                              className={cn(
                                "grid grid-cols-[auto_56px_minmax(0,1fr)_auto] items-center gap-2 rounded-xl bg-background p-2",
                                !selected && "opacity-55",
                              )}
                            >
                              <button
                                type="button"
                                className={cn(
                                  "flex size-5 items-center justify-center rounded border transition",
                                  selected
                                    ? "border-[#1456f0] bg-[#1456f0] text-white"
                                    : "border-border bg-muted text-muted-foreground hover:bg-accent",
                                )}
                                onClick={() => void toggleSummaryResultSelection(result, !selected)}
                                aria-label={selected ? "取消参与排版" : "加入排版"}
                                aria-pressed={selected}
                              >
                                {selected ? <Check className="size-3.5" /> : null}
                              </button>
                              <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
                                {src ? (
                                  <AuthenticatedImage src={src} alt={commerceResultTitle(result)} className="h-full w-full object-cover" />
                                ) : (
                                  <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                                    <Images className="size-4" />
                                  </span>
                                )}
                                <span className="absolute left-1 top-1 rounded-full bg-background/90 px-1.5 py-0.5 text-[10px] font-semibold text-foreground shadow-sm">
                                  {index + 1}
                                </span>
                              </div>
                              <div className="min-w-0">
                                <div className="truncate text-xs font-semibold text-foreground">{commerceResultTitle(result)}</div>
                                <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{commerceResultShortTitle(result)}</div>
                              </div>
                              <div className="flex gap-1">
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="size-8 rounded-lg"
                                  onClick={() => void moveSummaryResult(result, -1)}
                                  disabled={index === 0}
                                  aria-label="上移"
                                  title="上移"
                                >
                                  <ChevronLeft className="size-3.5 rotate-90" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="size-8 rounded-lg"
                                  onClick={() => void moveSummaryResult(result, 1)}
                                  disabled={index === orderedCompositeSourceResults.length - 1}
                                  aria-label="下移"
                                  title="下移"
                                >
                                  <ChevronRight className="size-3.5 rotate-90" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="overflow-hidden rounded-xl bg-muted/25">
                      <div className="max-h-[520px] overflow-auto">
                        <div className="min-w-0 p-3" style={{ backgroundColor: summaryLayout.background }}>
                          {summaryLayout.showHeader ? (
                            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                              <div className="min-w-0">
                                <div className={cn("truncate text-sm font-semibold", summaryPreviewTextClassName)}>
                                  {selectedProject.title || "电商套图"}
                                </div>
                                <div className={cn("mt-0.5 text-xs", summaryPreviewSubTextClassName)}>
                                  {summaryLayoutModeLabel(summaryLayout.mode)} · {summaryLayoutResults.length} 张图片
                                </div>
                              </div>
                              <Badge variant="secondary" className="bg-background/85">
                                实时排版
                              </Badge>
                            </div>
                          ) : null}
                          {summaryLayoutResults.length === 0 ? (
                            <div className={cn("grid min-h-28 place-items-center rounded-lg border border-dashed border-white/40 text-sm", summaryPreviewSubTextClassName)}>
                              至少选择一张图片参与排版
                            </div>
                          ) : (
                            <div className={cn(summaryLayout.mode === "horizontal" ? "pb-2" : "")} style={summaryPreviewStyle}>
                              {summaryLayoutResults.map((result, index) => {
                                const src = commerceSuiteResultImageSource(result);
                                return (
                                  <div
                                    key={resultViewKey(result)}
                                    className={cn(
                                      "group relative min-w-0 overflow-hidden rounded-lg bg-white/90 shadow-sm",
                                      summaryPreviewTileClassName,
                                    )}
                                  >
                                    <AuthenticatedImage
                                      src={src}
                                      alt={commerceResultTitle(result)}
                                      className={cn(
                                        "h-full w-full bg-white",
                                        summaryLayout.fit === "contain" ? "object-contain" : "object-cover",
                                      )}
                                    />
                                    <span className="absolute left-2 top-2 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-semibold text-foreground shadow-sm">
                                      {index + 1}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            </div>
          )}
        </section>
        </main>
      </section>
      <Dialog open={referenceLibraryOpen} onOpenChange={setReferenceLibraryOpen}>
        <DialogContent className="flex h-[min(84dvh,720px)] w-[min(94vw,900px)] max-w-none flex-col overflow-hidden rounded-3xl p-0">
          <DialogHeader className="border-b border-border px-5 pt-5 pr-12 pb-4">
            <DialogTitle>选择{referenceRoleLabel(referenceLibraryRole)}</DialogTitle>
            <DialogDescription>从素材库选择一张图片，选中后会替换当前参考位。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 border-b border-border px-5 py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                value={referenceLibrarySearch}
                onChange={(event) => setReferenceLibrarySearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    applyReferenceLibrarySearch();
                  }
                }}
                placeholder="搜索素材名称..."
                className="h-9 rounded-xl"
              />
              <Button variant="outline" className="h-9 rounded-xl" onClick={applyReferenceLibrarySearch} disabled={referenceLibraryLoading}>
                {referenceLibraryLoading ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                搜索
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                ["mine", "我的素材"],
                ...(activeTeam?.id ? [["team", "团队素材库"]] : []),
              ].map(([scope, label]) => (
                <Button
                  key={scope}
                  variant={referenceLibraryScope === scope ? "default" : "outline"}
                  size="sm"
                  className="h-8 rounded-xl"
                  onClick={() => changeReferenceLibraryScope(scope as ReferenceLibraryScope)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {referenceLibraryLoading ? (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                <LoaderCircle className="mr-2 size-4 animate-spin" />
                正在加载素材库
              </div>
            ) : referenceLibraryImages.length ? (
              <div className="grid gap-4">
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                  {referenceLibraryImages.map((item) => {
                    const preview = managedImagePreview(item);
                    const applying = referenceLibraryApplyingPath === item.path;
                    return (
                      <button
                        key={item.path}
                        type="button"
                        className="group relative aspect-square overflow-hidden rounded-2xl border border-border bg-muted text-left transition hover:border-primary/60 disabled:cursor-wait disabled:opacity-75"
                        onClick={() => void applyReferenceLibraryImage(item)}
                        disabled={Boolean(referenceLibraryApplyingPath)}
                        title={item.name}
                      >
                        {preview ? (
                          <AuthenticatedImage src={preview} alt={item.name} className="h-full w-full object-cover" placeholderClassName="h-full min-h-0" />
                        ) : (
                          <span className="flex h-full items-center justify-center text-xs text-muted-foreground">图片</span>
                        )}
                        {applying ? (
                          <span className="absolute inset-0 flex items-center justify-center bg-background/70">
                            <LoaderCircle className="size-5 animate-spin text-primary" />
                          </span>
                        ) : null}
                        <span className="absolute inset-x-0 bottom-0 truncate bg-black/45 px-2 py-1 text-[11px] font-medium text-white opacity-0 transition group-hover:opacity-100">
                          {item.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {referenceLibraryHasMore ? (
                  <div className="flex justify-center">
                    <Button
                      variant="outline"
                      className="h-9 rounded-xl"
                      onClick={() => void loadReferenceLibraryImages(referenceLibraryScope, referenceLibrarySearch, { append: true, cursor: referenceLibraryNextCursor })}
                      disabled={referenceLibraryLoadingMore}
                    >
                      {referenceLibraryLoadingMore ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                      加载更多
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-border text-sm text-muted-foreground">
                当前素材库没有可选图片
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
