"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  BarChart3,
  Check,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
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
  CHAT_MODEL_OPTIONS,
  DEFAULT_CHAT_MODEL,
  DEFAULT_IMAGE_MODEL,
  IMAGE_CREATION_MODEL_OPTIONS,
  createChatCompletionTask,
  createImageEditTaskFromReferenceIds,
  fetchCreationTasks,
  fetchManagedImages,
  fetchTeamWorkspace,
  isImageCreationModel,
  isOfficialImageModel,
  uploadCreationTaskReferenceImage,
  type CreationTask,
  type ImageModel,
  type ManagedImageSummary,
  type TeamSummary,
} from "@/lib/api";
import { fetchAuthenticatedImageBlob } from "@/lib/authenticated-image";
import { imageExtension, downloadImageFile } from "@/lib/image-download";
import { getManagedImagePreviewUrlFromPath, getManagedImageUrlFromPath } from "@/lib/image-path";
import { IMAGE_QUALITY_OPTIONS, isImageQuality } from "@/lib/image-parameters";
import { useAuthGuard } from "@/lib/use-auth-guard";
import { cn } from "@/lib/utils";
import {
  COMMERCE_SUITE_PROJECTS_CHANGED_EVENT,
  commerceSuiteResultImageSource,
  createCommerceSuiteProject,
  deleteCommerceSuiteProject,
  listCommerceSuiteProjects,
  saveCommerceSuiteProject,
  touchCommerceSuiteProject,
  type CommerceSuiteProject,
  type CommerceSuiteReferenceImage,
  type CommerceSuiteResult,
} from "@/store/ecommerce-suite-projects";
import exampleModuleImage from "./example-module.webp";
import exampleSummaryImage from "./example-summary.webp";

const POLL_INTERVAL_MS = 1800;
const MAX_REFERENCE_IMAGES = 2;
const SUMMARY_TILE_SIZE = 720;
const SUMMARY_GAP = 28;
const SUMMARY_HEADER_HEIGHT = 112;
const LEFT_RAIL_COLLAPSED_STORAGE_KEY = "ecommerce-suite-left-rail-collapsed";
const REFERENCE_LIBRARY_PAGE_SIZE = 24;
const REFERENCE_IMAGE_SLOTS = [
  { role: "primary", title: "主参考", description: "锁定商品主体和主要外观" },
  { role: "secondary", title: "副参考", description: "补充角度、细节或包装信息" },
] as const;

type ReferenceImageRole = typeof REFERENCE_IMAGE_SLOTS[number]["role"];
type ReferenceLibraryScope = "mine" | "team";

const FEATURE_ACTIONS = [
  {
    id: "analysis",
    title: "商品分析",
    description: "识别商品类目、卖点、人群、场景和视觉方向。",
    detail: "先从参考图里提炼卖点，后面生成图片会更稳。",
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

function templateById(id: string) {
  return COMMERCE_SUITE_TEMPLATES.find((template) => template.id === id);
}

function extractTaskText(task: CreationTask) {
  return (task.data || []).map((item) => item.text_response || "").join("\n").trim();
}

function resultFromTask(templateId: string, task: CreationTask): CommerceSuiteResult {
  const image = (task.data || []).find((item) => item.local_url || item.url || item.b64_json);
  return {
    templateId,
    taskId: task.id,
    status: task.status,
    localUrl: image?.local_url,
    url: image?.url || (image?.b64_json ? `data:image/png;base64,${image.b64_json}` : undefined),
    revisedPrompt: image?.revised_prompt,
    error: task.error,
    updatedAt: task.updated_at,
  };
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
  return [
    "你是一名资深电商商品视觉策划，请基于参考图和用户输入，输出一份可直接用于电商套图生成的运营摘要。",
    `目标平台：${platform}`,
    `目标市场：${market}`,
    `输出语言：${language}`,
    `商品标题或备注：${project.title}`,
    "请严格使用以下字段，内容具体、克制、可执行：",
    "产品名称：",
    "产品类目：",
    "核心卖点：",
    "目标人群：",
    "使用场景：",
    "视觉风格方向：",
  ].join("\n");
}

function buildGenerationPrompt(project: CommerceSuiteProject, templateId: string) {
  const template = templateById(templateId);
  const platform = commerceSuiteOptionLabel(COMMERCE_SUITE_PLATFORMS, project.targeting.platform);
  const market = commerceSuiteOptionLabel(COMMERCE_SUITE_MARKETS, project.targeting.market);
  const language = commerceSuiteOptionLabel(COMMERCE_SUITE_LANGUAGES, project.targeting.language);
  return [
    "你是一名电商详情页视觉设计师。请基于参考图保持商品主体一致，生成一张可直接用于电商详情页的成品图。",
    `图片类型：${template?.title || templateId}`,
    `目标平台：${platform}`,
    `目标市场：${market}`,
    `画面语言：${language}`,
    `商品运营摘要：\n${project.analysisText || "请根据参考图自行提炼商品卖点和适用场景。"}`,
    `图片要求：${template?.prompt || ""}`,
    "输出要求：单张成品图，主体清晰，适合 1:1 电商套图；不添加虚假的认证、价格、品牌 Logo 或未经确认的夸张承诺；如果需要文字，只使用目标语言并保持简短可读。",
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

function drawCoverImage(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  const drawX = x + (width - drawWidth) / 2;
  const drawY = y + (height - drawHeight) / 2;
  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

function drawLabel(ctx: CanvasRenderingContext2D, label: string, x: number, y: number, width: number) {
  ctx.save();
  ctx.fillStyle = "rgba(24, 30, 37, 0.78)";
  ctx.fillRect(x, y, width, 54);
  ctx.fillStyle = "#ffffff";
  ctx.font = "600 26px system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + 20, y + 27);
  ctx.restore();
}

async function buildSummaryBlob(project: CommerceSuiteProject) {
  const successfulResults = project.results.filter((result) => result.status === "success" && commerceSuiteResultImageSource(result));
  if (successfulResults.length === 0) {
    throw new Error("还没有可以汇总的图片");
  }

  const columns = successfulResults.length <= 2 ? successfulResults.length : 2;
  const rows = Math.ceil(successfulResults.length / columns);
  const width = columns * SUMMARY_TILE_SIZE + (columns + 1) * SUMMARY_GAP;
  const height = SUMMARY_HEADER_HEIGHT + rows * SUMMARY_TILE_SIZE + (rows + 1) * SUMMARY_GAP;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("浏览器不支持画布导出");
  }

  ctx.fillStyle = "#f6f8fc";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#181e25";
  ctx.font = "700 40px system-ui, sans-serif";
  ctx.fillText(project.title || "电商套图", SUMMARY_GAP, 58);
  ctx.fillStyle = "#45515e";
  ctx.font = "400 22px system-ui, sans-serif";
  ctx.fillText("整套图片预览", SUMMARY_GAP, 92);

  for (let index = 0; index < successfulResults.length; index += 1) {
    const result = successfulResults[index];
    const image = await loadImageForCanvas(commerceSuiteResultImageSource(result));
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = SUMMARY_GAP + col * (SUMMARY_TILE_SIZE + SUMMARY_GAP);
    const y = SUMMARY_HEADER_HEIGHT + SUMMARY_GAP + row * (SUMMARY_TILE_SIZE + SUMMARY_GAP);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x, y, SUMMARY_TILE_SIZE, SUMMARY_TILE_SIZE);
    drawCoverImage(ctx, image, x, y, SUMMARY_TILE_SIZE, SUMMARY_TILE_SIZE);
    drawLabel(ctx, templateById(result.templateId)?.title || result.templateId, x, y + SUMMARY_TILE_SIZE - 54, SUMMARY_TILE_SIZE);
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
  localOptions: readonly ModelOption[],
  selected: ImageModel,
  canKeepSelectedModel: (model: ImageModel) => boolean = () => true,
) {
  const seen = new Set<string>();
  const merged: ModelOption[] = [];
  for (const option of localOptions) {
    if (!option.value || seen.has(option.value)) {
      continue;
    }
    seen.add(option.value);
    merged.push(option);
  }
  if (selected && !seen.has(selected) && canKeepSelectedModel(selected)) {
    merged.unshift({ value: selected, label: selected });
  }
  return merged;
}

export default function EcommerceSuitePage() {
  const { isCheckingAuth } = useAuthGuard(undefined, "/ecommerce-suite");
  const { clearPanel, closeDrawer, setPanel } = useMobileNav();
  const [projects, setProjects] = useState<CommerceSuiteProject[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [buildingSummary, setBuildingSummary] = useState(false);
  const [renamingProjectId, setRenamingProjectId] = useState("");
  const [renamingTitle, setRenamingTitle] = useState("");
  const [referenceLibraryOpen, setReferenceLibraryOpen] = useState(false);
  const [referenceLibraryRole, setReferenceLibraryRole] = useState<ReferenceImageRole>("primary");
  const [referenceLibraryScope, setReferenceLibraryScope] = useState<ReferenceLibraryScope>("mine");
  const [referenceLibrarySearch, setReferenceLibrarySearch] = useState("");
  const [referenceLibraryImages, setReferenceLibraryImages] = useState<ManagedImageSummary[]>([]);
  const [referenceLibraryNextCursor, setReferenceLibraryNextCursor] = useState("");
  const [referenceLibraryHasMore, setReferenceLibraryHasMore] = useState(false);
  const [referenceLibraryLoading, setReferenceLibraryLoading] = useState(false);
  const [referenceLibraryLoadingMore, setReferenceLibraryLoadingMore] = useState(false);
  const [referenceLibraryApplyingPath, setReferenceLibraryApplyingPath] = useState("");
  const [activeTeam, setActiveTeam] = useState<TeamSummary | null>(null);
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
  const chatModelOptions = useMemo(() => mergeModelOptions(CHAT_MODEL_OPTIONS, selectedProject?.chatModel || DEFAULT_CHAT_MODEL), [selectedProject?.chatModel]);
  const imageModelOptions = useMemo(
    () => mergeModelOptions(IMAGE_CREATION_MODEL_OPTIONS, selectedProject?.imageModel || DEFAULT_IMAGE_MODEL, isImageCreationModel),
    [selectedProject?.imageModel],
  );
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
    toast.success("已创建项目，可上传参考图继续");
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
          <div className="grid grid-cols-2 gap-2">
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
            <Button variant="outline" className="h-10 rounded-xl" onClick={() => void reload()} disabled={loading}>
              {loading ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              刷新
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
                        {project.analysisText || `${project.referenceImages.length} 张参考图 · ${project.selectedTemplates.length} 个设计`}
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
      loading,
      projects,
      reload,
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
    setReferenceLibraryApplyingPath(item.path);
    const role = referenceLibraryRole;
    try {
      const ref = await managedImageToReferenceImage(item, role);
      const nextImages = REFERENCE_IMAGE_SLOTS.flatMap((slot) => {
        if (slot.role === role) {
          return [ref];
        }
        const existing = project.referenceImages.find((image) => image.role === slot.role);
        return existing ? [existing] : [];
      });
      await persistProject({
        ...project,
        referenceImages: nextImages,
      });
      setReferenceLibraryOpen(false);
      toast.success(`已从素材库更新${role === "primary" ? "主参考" : "副参考"}`);
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
    setUploading(true);
    try {
      const ref = await fileToReferenceImage(imageFiles[0], role);
      const nextImages = REFERENCE_IMAGE_SLOTS.flatMap((slot) => {
        if (slot.role === role) {
          return [ref];
        }
        const existing = selectedProject.referenceImages.find((image) => image.role === slot.role);
        return existing ? [existing] : [];
      });
      await persistProject({
        ...selectedProject,
        referenceImages: nextImages,
      });
      toast.success(`已更新${role === "primary" ? "主参考" : "副参考"}`);
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
      if (image.serverReferenceId) {
        referenceIds.push(image.serverReferenceId);
        continue;
      }
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
    if (project.referenceImages.length === 0) {
      toast.error("请先上传商品参考图");
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
        [{ role: "system", content: "你是电商商品分析和视觉策划助手，只输出可执行的商品运营摘要。" }],
        pendingProject.referenceImages.map((image) => ({ name: image.name, dataUrl: image.dataUrl })),
      );
      await persistProject({
        ...pendingProject,
        analysisTaskId: task.id,
        analysisStatus: task.status,
        analysisError: task.error,
      });
      toast.success("已提交商品分析任务");
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

  const submitGenerationTasks = async (templateIds: string[]) => {
    const project = selectedProjectRef.current;
    if (!project || generating) return;
    if (project.referenceImages.length === 0) {
      toast.error("请先上传商品参考图");
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
      const nextResults = latest.results.filter((result) => !templateIds.includes(result.templateId));
      const placeholders = templateIds.map((templateId) => ({
        templateId,
        taskId: createID(`commerce-${templateId}`),
        status: "queued" as const,
        updatedAt: new Date().toISOString(),
      }));
      const pendingProject = await persistProject({
        ...latest,
        results: [...nextResults, ...placeholders],
        summaryImage: undefined,
      });
      const submitted = await Promise.allSettled(
        placeholders.map((placeholder) =>
          createImageEditTaskFromReferenceIds(
            placeholder.taskId,
            referenceIds,
            buildGenerationPrompt(pendingProject, placeholder.templateId),
            pendingProject.imageModel,
            pendingProject.size,
            isOfficialImageModel(pendingProject.imageModel) && isImageQuality(pendingProject.imageQuality)
              ? pendingProject.imageQuality
              : undefined,
            1,
            [{ role: "system", content: "你是电商套图视觉设计师，输出适合商品详情页的单张成品图。" }],
            "private",
            pendingProject.imageResolution,
            pendingProject.outputFormat,
            undefined,
            undefined,
            pendingProject.id,
            undefined,
            publicImageUrls,
          ),
        ),
      );
      const submittedResults = placeholders.map((placeholder, index) => {
        const submittedItem = submitted[index];
        if (submittedItem?.status === "fulfilled") {
          return resultFromTask(placeholder.templateId, submittedItem.value);
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
      } else {
        toast.success("已提交套图生成任务");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "提交生成失败");
    } finally {
      setGenerating(false);
    }
  };

  const retryTemplate = async (templateId: string) => {
    await submitGenerationTasks([templateId]);
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
            changed = true;
            if (task.status === "success") {
              nextProject = {
                ...nextProject,
                analysisStatus: "success",
                analysisText: extractTaskText(task) || nextProject.analysisText,
                analysisError: undefined,
              };
            } else if (task.status === "error" || task.status === "cancelled") {
              nextProject = {
                ...nextProject,
                analysisStatus: task.status,
                analysisError: task.error || "商品分析失败",
              };
              toast.error(nextProject.analysisError);
            } else {
              nextProject = { ...nextProject, analysisStatus: task.status };
            }
            continue;
          }
          const matchedResult = nextProject.results.find((result) => result.taskId === task.id);
          if (!matchedResult) {
            continue;
          }
          changed = true;
          nextProject = {
            ...nextProject,
            results: nextProject.results.map((result) =>
              result.taskId === task.id ? resultFromTask(result.templateId, task) : result,
            ),
          };
          if (task.status === "error") {
            toast.error(task.error || `${templateById(matchedResult.templateId)?.title || "图片"}生成失败`);
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

  const buildAndDownloadSummary = async () => {
    if (!selectedProject || buildingSummary) return;
    setBuildingSummary(true);
    try {
      const blob = await buildSummaryBlob(selectedProject);
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("整套预览读取失败"));
        reader.readAsDataURL(blob);
      });
      await persistProject({ ...selectedProject, summaryImage: dataUrl });
      downloadBlob(blob, `${safeFileName(selectedProject.title)}-summary.png`);
      toast.success("整套预览已下载");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "整套预览生成失败");
    } finally {
      setBuildingSummary(false);
    }
  };

  const downloadResult = async (result: CommerceSuiteResult) => {
    const src = commerceSuiteResultImageSource(result);
    if (!src) return;
    const template = templateById(result.templateId);
    await downloadImageFile({
      id: result.taskId || result.templateId,
      src,
      path: result.path,
      fileName: `${safeFileName(selectedProject?.title || "ecommerce-suite")}-${template?.shortTitle || result.templateId}.${imageExtension("png", src)}`,
    }).catch((error) => {
      toast.error(error instanceof Error ? error.message : "下载失败");
    });
  };

  if (isCheckingAuth) {
    return null;
  }

  const leftRailExpanded = !leftRailCollapsed || leftRailHoverExpanded;

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
            <p className="text-xs text-muted-foreground">商品分析与详情设计</p>
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
        <div className={cn("flex items-center gap-2 border-b border-border p-3 transition-all duration-300", leftRailExpanded ? "opacity-100" : "pointer-events-none h-0 border-b-0 p-0 opacity-0")}>
          <Button variant="outline" className="h-9 flex-1 rounded-xl text-xs" onClick={() => void reload()} disabled={loading}>
            {loading ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            刷新
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
                      {project.analysisText || `${project.referenceImages.length} 张参考图 · ${project.selectedTemplates.length} 个设计`}
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
                    <h2 className="mt-4 font-display text-2xl font-semibold text-foreground">从参考图开始，生成主图和详情套图</h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                      这里会帮你把参考图变成可用的电商图片。先选择要做的内容，创建项目后上传图片，再继续分析或生成。
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
                    <div className="text-sm font-semibold text-foreground">参考图</div>
                    <div className="text-xs text-muted-foreground">主参考锁定商品主体，副参考补充角度或细节</div>
                  </div>
                  <Badge variant="info">{selectedProject.referenceImages.length}/{MAX_REFERENCE_IMAGES}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
                  {REFERENCE_IMAGE_SLOTS.map((slot) => {
                    const image = selectedProject.referenceImages.find((item) => item.role === slot.role);
                    const inputId = `commerce-reference-${slot.role}`;
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
                            >
                              <Images className="size-3" />
                              素材库
                            </Button>
                            <Button asChild variant="outline" size="sm" className="h-7 rounded-lg px-2 text-xs">
                              <label htmlFor={inputId} className="cursor-pointer">
                                {uploading ? <LoaderCircle className="size-3 animate-spin" /> : <ImagePlus className="size-3" />}
                                {image ? "替换" : "上传"}
                              </label>
                            </Button>
                          </div>
                          <input
                            id={inputId}
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            disabled={uploading}
                            onChange={(event) => {
                              void handleReferenceUpload(event.target.files, slot.role);
                              event.target.value = "";
                            }}
                          />
                        </div>
                        {image ? (
                          <div className="group relative h-20 overflow-hidden rounded-lg border border-border bg-muted">
                            <img src={image.dataUrl} alt={image.name} className="h-full w-full object-cover" />
                            <div className="absolute left-2 top-2 rounded-full bg-background/90 px-2 py-0.5 text-[11px] font-semibold text-foreground shadow-sm">
                              {slot.title}
                            </div>
                            <div className="absolute inset-x-0 bottom-0 bg-background/92 px-2 py-1.5 text-[11px]">
                              <div className="truncate font-medium">{image.name}</div>
                              <div className="text-muted-foreground">{formatFileSize(image.size) || taskStatusLabel(image.uploadStatus === "uploaded" ? "success" : "idle")}</div>
                            </div>
                            <button
                              type="button"
                              className="absolute right-1.5 top-1.5 inline-flex size-6 items-center justify-center rounded-lg bg-background/90 text-muted-foreground opacity-0 shadow-sm transition hover:text-rose-600 group-hover:opacity-100"
                              onClick={() => void removeReferenceImage(image.id)}
                              title={`移除${slot.title}`}
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        ) : (
                          <label
                            htmlFor={inputId}
                            className="flex h-20 cursor-pointer items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 text-center text-xs text-muted-foreground transition hover:bg-accent"
                          >
                            上传{slot.title}
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
                    <div className="text-xs text-muted-foreground">用于分析和每张图片的提示词</div>
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
                <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">分析模型</span>
                    <Select value={selectedProject.chatModel} onValueChange={(value) => updateSelectedProject({ chatModel: value })}>
                      <SelectTrigger className="h-10 rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {chatModelOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">图片模型</span>
                    <Select value={selectedProject.imageModel} onValueChange={(value) => updateSelectedProject({ imageModel: value })}>
                      <SelectTrigger className="h-10 rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {imageModelOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  {isOfficialImageModel(selectedProject.imageModel) ? (
                    <label className="grid gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">质量强度</span>
                      <Select
                        value={isImageQuality(selectedProject.imageQuality) ? selectedProject.imageQuality : "auto"}
                        onValueChange={(value) =>
                          updateSelectedProject({ imageQuality: isImageQuality(value) ? value : "auto" })
                        }
                      >
                        <SelectTrigger className="h-10 rounded-xl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {IMAGE_QUALITY_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                  ) : null}
                </div>
              </Card>

              <Card className="gap-4 rounded-2xl p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">商品分析</div>
                    <div className="text-xs text-muted-foreground">自动生成后可手动改写</div>
                  </div>
                  <Badge variant={taskStatusVariant(selectedProject.analysisStatus)}>{taskStatusLabel(selectedProject.analysisStatus)}</Badge>
                </div>
                <Textarea
                  value={selectedProject.analysisText}
                  onChange={(event) => updateSelectedProject({ analysisText: event.target.value })}
                  className="min-h-48 rounded-xl"
                  placeholder="点击分析商品后，会自动填入产品名称、类目、卖点、人群、场景和视觉风格方向。"
                />
                {selectedProject.analysisError ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
                    {selectedProject.analysisError}
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button className="h-10 rounded-xl" onClick={() => void analyzeProduct()} disabled={analyzing || isActiveTask(selectedProject.analysisStatus)}>
                    {analyzing || isActiveTask(selectedProject.analysisStatus) ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                    分析商品
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
                  {TEMPLATE_GROUPS.map((group) => (
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
                  生成选中的图片
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
                    ["1", "上传商品参考图", "主参考放商品主体，副参考补充细节或角度。"],
                    ["2", "分析商品", "自动得到卖点、人群、场景和视觉方向。"],
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
                  <div className="text-xs text-muted-foreground">从商品分析到成图都在这里完成</div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {["商品分析", "主图快生成", "详情设计", "套图设计", "单图下载", "整套预览下载"].map((item) => (
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
                    onClick={() => void buildAndDownloadSummary()}
                    disabled={buildingSummary || !selectedProject.results.some((result) => result.status === "success")}
                  >
                    {buildingSummary ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
                    下载总览图
                  </Button>
                </div>
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
                ) : (
                  <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
                    {selectedProject.results.map((result) => {
                      const template = templateById(result.templateId);
                      const src = commerceSuiteResultImageSource(result);
                      return (
                        <div key={result.templateId} className="overflow-hidden rounded-2xl border border-border bg-background">
                          <div className="relative aspect-square bg-muted">
                            {src ? (
                              <AuthenticatedImage src={src} alt={template?.title || result.templateId} className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                                {isActiveTask(result.status) ? <LoaderCircle className="size-6 animate-spin" /> : "暂无图片"}
                              </div>
                            )}
                            <div className="absolute left-2 top-2">
                              <Badge variant={taskStatusVariant(result.status)}>{taskStatusLabel(result.status)}</Badge>
                            </div>
                          </div>
                          <div className="grid gap-2 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold">{template?.title || result.templateId}</div>
                                <div className="text-[11px] text-muted-foreground">{formatDateTime(result.updatedAt)}</div>
                              </div>
                              {result.status === "success" ? <CheckCircle2 className="size-4 shrink-0 text-emerald-600" /> : null}
                            </div>
                            {result.error ? (
                              <div className="line-clamp-2 text-xs text-rose-600">{result.error}</div>
                            ) : null}
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 flex-1 rounded-xl"
                                onClick={() => void retryTemplate(result.templateId)}
                                disabled={isActiveTask(result.status) || generating}
                              >
                                <RotateCcw className="size-3.5" />
                                重试
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 flex-1 rounded-xl"
                                onClick={() => void downloadResult(result)}
                                disabled={!src}
                              >
                                <Download className="size-3.5" />
                                下载
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>

              <Card className="gap-4 rounded-2xl p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">整套预览</div>
                    <div className="text-xs text-muted-foreground">把已完成的图片拼成一张总览图</div>
                  </div>
                  {selectedProject.summaryImage ? <Badge variant="success">已生成</Badge> : <Badge variant="secondary">待生成</Badge>}
                </div>
                {selectedProject.summaryImage ? (
                  <div className="overflow-hidden rounded-2xl border border-border bg-muted">
                    <img src={selectedProject.summaryImage} alt="整套预览" className="w-full object-contain" />
                  </div>
                ) : selectedProject.results.length === 0 ? (
                  <div className="overflow-hidden rounded-2xl border border-dashed border-border bg-muted/25">
                    <img src={exampleSummaryImage} alt="整套预览示意" className="w-full object-contain" />
                    <div className="flex flex-wrap items-center justify-between gap-2 p-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-foreground">整套预览示意</div>
                        <div className="text-xs text-muted-foreground">有生成结果后，可以拼成一张总览图</div>
                      </div>
                      <Badge variant="outline">示例</Badge>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                    至少完成一张图后，就可以生成整套预览
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
            <DialogTitle>选择{referenceLibraryRole === "primary" ? "主参考" : "副参考"}</DialogTitle>
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
