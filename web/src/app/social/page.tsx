"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  Clipboard,
  FileText,
  ImagePlus,
  LoaderCircle,
  Link2,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
  createSocialProject,
  deleteSocialProject,
  exportSocialProject,
  fetchCreationTasks,
  fetchCanvasModels,
  fetchManagedImages,
  fetchSocialProjects,
  generateSocialProjectCards,
  generateSocialProjectCopy,
  saveSocialProject,
  uploadManagedImages,
  type CreationTask,
  type CanvasModelOption,
  type ImageModel,
  type ManagedImageListScope,
  type ManagedImageSummary,
  type SocialCard,
  type SocialImageRef,
  type SocialProject,
} from "@/lib/api";
import { getManagedImagePreviewUrlFromPath, getManagedImageUrlFromPath } from "@/lib/image-path";
import { useAuthGuard } from "@/lib/use-auth-guard";
import { cn } from "@/lib/utils";

const DEFAULT_TOPIC = "未命名小红书内容";
const XHS_CARD_WIDTH = 1080;
const XHS_CARD_HEIGHT = 1440;
const SOCIAL_POLL_INTERVAL_MS = 1400;
const SOCIAL_LIBRARY_PAGE_SIZE = 36;

type ProjectDraft = {
  topic: string;
  audience: string;
  tone: string;
  source_text: string;
  source_images: SocialImageRef[];
  title: string;
  caption: string;
  tagsText: string;
  cards: SocialCard[];
};

function emptyDraft(): ProjectDraft {
  return {
    topic: DEFAULT_TOPIC,
    audience: "通用小红书用户",
    tone: "自然、专业、有判断力",
    source_text: "",
    source_images: [],
    title: "",
    caption: "",
    tagsText: "",
    cards: [],
  };
}

function draftFromProject(project: SocialProject | null): ProjectDraft {
  if (!project) {
    return emptyDraft();
  }
  return {
    topic: project.topic || DEFAULT_TOPIC,
    audience: project.audience || "通用小红书用户",
    tone: project.tone || "自然、专业、有判断力",
    source_text: project.source_text || "",
    source_images: project.source_images || [],
    title: project.title || "",
    caption: project.caption || "",
    tagsText: (project.tags || []).map((tag) => `#${tag.replace(/^#/, "")}`).join(" "),
    cards: normalizeCards(project.cards || []),
  };
}

function projectFromDraft(project: SocialProject, draft: ProjectDraft): SocialProject {
  return {
    ...project,
    platform: "xhs",
    topic: draft.topic.trim() || DEFAULT_TOPIC,
    audience: draft.audience.trim(),
    tone: draft.tone.trim(),
    source_text: draft.source_text.trim(),
    source_images: draft.source_images,
    title: draft.title.trim(),
    caption: draft.caption.trim(),
    tags: parseTags(draft.tagsText),
    copy_markdown: buildMarkdown(draft.title, draft.caption, parseTags(draft.tagsText)),
    cards: normalizeCards(draft.cards, { preserveImages: true }),
  };
}

function normalizeCards(cards: SocialCard[], options: { preserveImages?: boolean } = {}) {
  return cards.slice(0, 8).map((card, index) => ({
    ...card,
    id: card.id || `card-${index + 1}`,
    index: index + 1,
    layout: card.layout || (index === 0 ? "cover" : "list"),
    visual_mode: card.visual_mode || (options.preserveImages && (card.path || card.local_url || card.image_url) ? "image" : "info"),
    title: card.title || "",
    body: card.body || "",
    image_prompt: card.image_prompt || "",
    accent: card.accent || socialAccent(index),
  }));
}

type SocialModelMenuOption = { value: ImageModel; label: string };

function socialModelOption(model: CanvasModelOption): SocialModelMenuOption {
  return { value: model.id, label: model.name || model.id };
}

function socialModelsByCapability(models: CanvasModelOption[], capability: "chat" | "image") {
  return models
    .filter((model) => model.enabled !== false)
    .filter((model) =>
      canvasModelHasCapability(model, capability) ||
      (capability === "chat" && (model.kind === "text" || model.kind === "both")) ||
      (capability === "image" && (model.kind === "image" || model.kind === "both"))
    )
    .map(socialModelOption);
}

function mergeSocialModelOptions(remoteOptions: SocialModelMenuOption[], localOptions: readonly SocialModelMenuOption[], selectedModel: ImageModel) {
  const seen = new Set<string>();
  const merged: SocialModelMenuOption[] = [];
  for (const option of [...remoteOptions, ...localOptions]) {
    if (!option.value || seen.has(option.value)) {
      continue;
    }
    seen.add(option.value);
    merged.push(option);
  }
  if (selectedModel && !seen.has(selectedModel)) {
    merged.unshift({ value: selectedModel, label: selectedModel });
  }
  return merged;
}

function parseTags(text: string) {
  const seen = new Set<string>();
  const tags: string[] = [];
  text
    .split(/[\s,，#]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((tag) => {
      if (seen.has(tag)) return;
      seen.add(tag);
      tags.push(tag);
    });
  return tags.slice(0, 12);
}

function sourceImageKey(image: SocialImageRef) {
  return image.path || image.local_url || image.url || image.name || "";
}

function sourceImagePreview(image: SocialImageRef) {
  if (image.thumbnail_url || image.local_url || image.url) {
    return image.thumbnail_url || image.local_url || image.url || "";
  }
  return image.path ? getManagedImagePreviewUrlFromPath(image.path) : "";
}

function sourceImageFullURL(image: SocialImageRef) {
  if (image.local_url || image.url) {
    return image.local_url || image.url || "";
  }
  return image.path ? getManagedImageUrlFromPath(image.path) : "";
}

function mergeSourceImages(current: SocialImageRef[], incoming: SocialImageRef[]) {
  const seen = new Set(current.map(sourceImageKey).filter(Boolean));
  const merged = [...current];
  for (const image of incoming) {
    const key = sourceImageKey(image);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    merged.push(image);
  }
  return merged.slice(0, 12);
}

function cardImageKey(card: SocialCard) {
  return card.path || card.local_url || card.image_url || "";
}

function cardUsesImage(card: SocialCard, image: SocialImageRef) {
  const cardKey = cardImageKey(card);
  if (!cardKey) return false;
  return [image.path, image.local_url, image.url].filter(Boolean).includes(cardKey);
}

function imageRefToCardPatch(image: SocialImageRef): Partial<SocialCard> {
  return {
    visual_mode: "image",
    path: image.path,
    local_url: sourceImageFullURL(image),
    image_url: image.url || sourceImageFullURL(image),
    status: "success",
  };
}

function managedImageToSocialRef(item: ManagedImageSummary): SocialImageRef {
  return {
    path: item.path,
    name: item.name,
    thumbnail_url: item.thumbnail_url || item.preview_url || (item.path ? getManagedImagePreviewUrlFromPath(item.path) : ""),
    local_url: item.preview_url || (item.path ? getManagedImageUrlFromPath(item.path) : ""),
    url: item.path ? getManagedImageUrlFromPath(item.path) : "",
  };
}

function managedImagePreview(item: ManagedImageSummary) {
  return item.thumbnail_url || item.preview_url || (item.path ? getManagedImagePreviewUrlFromPath(item.path) : "");
}

function clearCardImagePatch(): Partial<SocialCard> {
  return {
    path: "",
    local_url: "",
    image_url: "",
  };
}

function buildMarkdown(title: string, caption: string, tags: string[]) {
  const parts = [];
  if (title.trim()) {
    parts.push(`# ${title.trim()}`);
  }
  if (caption.trim()) {
    parts.push(caption.trim());
  }
  if (tags.length) {
    parts.push(tags.map((tag) => `#${tag.replace(/^#/, "")}`).join(" "));
  }
  return parts.join("\n\n");
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

function createClientId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function statusLabel(status?: SocialProject["status"]) {
  switch (status) {
    case "generating_copy":
      return "文案生成中";
    case "copy_ready":
      return "文案就绪";
    case "generating_cards":
      return "配图生成中";
    case "cards_ready":
      return "卡片就绪";
    case "exported":
      return "已导出";
    default:
      return "草稿";
  }
}

function statusVariant(status?: SocialProject["status"]) {
  switch (status) {
    case "copy_ready":
    case "cards_ready":
    case "exported":
      return "success" as const;
    case "generating_copy":
    case "generating_cards":
      return "warning" as const;
    default:
      return "secondary" as const;
  }
}

function socialAccent(index: number) {
  const colors = ["#e11d48", "#1456f0", "#0f766e", "#7c3aed", "#b45309", "#0f172a", "#be123c", "#047857"];
  return colors[index % colors.length];
}

function extractTaskText(task: CreationTask) {
  return (task.data || []).map((item) => item.text_response || "").join("\n").trim();
}

function extractTaskImage(task: CreationTask) {
  for (const item of task.data || []) {
    if (item.local_url || item.url) {
      return {
        local_url: item.local_url,
        image_url: item.url,
        status: task.status,
      };
    }
  }
  return { status: task.status };
}

function parseGeneratedCopy(text: string) {
  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("模型返回不是 JSON");
  }
  const data = JSON.parse(cleaned.slice(start, end + 1)) as {
    title?: string;
    caption?: string;
    tags?: string[];
    cards?: Array<Partial<SocialCard>>;
  };
  return {
    title: String(data.title || "").trim(),
    caption: String(data.caption || "").trim(),
    tags: Array.isArray(data.tags) ? data.tags.map((tag) => String(tag || "").replace(/^#/, "").trim()).filter(Boolean) : [],
    cards: normalizeCards((Array.isArray(data.cards) ? data.cards : []).map((card, index) => ({
      id: `card-${index + 1}`,
      index: index + 1,
      title: String(card.title || "").trim(),
      body: String(card.body || "").trim(),
      layout: String(card.layout || (index === 0 ? "cover" : "list")).trim(),
      visual_mode: card.visual_mode === "ai" ? "ai" : "info",
      image_prompt: String(card.image_prompt || "").trim(),
      accent: String(card.accent || socialAccent(index)).trim(),
    }))),
  };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

async function copyText(text: string, success: string) {
  await navigator.clipboard.writeText(text);
  toast.success(success);
}

type ZipEntry = {
  name: string;
  data: Uint8Array;
};

function projectTitle(project: SocialProject) {
  return project.title || project.topic || DEFAULT_TOPIC;
}

export default function SocialPage() {
  const { isCheckingAuth } = useAuthGuard(undefined, "/social");
  const [projects, setProjects] = useState<SocialProject[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<ProjectDraft>(() => emptyDraft());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generatingCopy, setGeneratingCopy] = useState(false);
  const [generatingCards, setGeneratingCards] = useState(false);
  const [uploadingSourceImage, setUploadingSourceImage] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryLoadingMore, setLibraryLoadingMore] = useState(false);
  const [libraryScope, setLibraryScope] = useState<ManagedImageListScope>("mine");
  const [libraryImages, setLibraryImages] = useState<ManagedImageSummary[]>([]);
  const [libraryNextCursor, setLibraryNextCursor] = useState("");
  const [libraryHasMore, setLibraryHasMore] = useState(false);
  const [selectedLibraryPaths, setSelectedLibraryPaths] = useState<string[]>([]);
  const [chatModel, setChatModel] = useState<ImageModel>(DEFAULT_CHAT_MODEL);
  const [imageModel, setImageModel] = useState<ImageModel>(DEFAULT_IMAGE_MODEL);
  const [remoteCanvasModels, setRemoteCanvasModels] = useState<CanvasModelOption[]>([]);
  const [selectedCardIndex, setSelectedCardIndex] = useState(0);

  const selectedProject = useMemo(
    () => projects.find((item) => item.id === selectedId) || null,
    [projects, selectedId],
  );
  const markdown = useMemo(
    () => buildMarkdown(draft.title, draft.caption, parseTags(draft.tagsText)),
    [draft.caption, draft.tagsText, draft.title],
  );
  const activeCard = draft.cards[selectedCardIndex] || null;
  const chatModelOptions = useMemo(
    () => mergeSocialModelOptions(socialModelsByCapability(remoteCanvasModels, "chat"), CHAT_MODEL_OPTIONS, chatModel),
    [chatModel, remoteCanvasModels],
  );
  const imageModelOptions = useMemo(
    () => mergeSocialModelOptions(socialModelsByCapability(remoteCanvasModels, "image"), IMAGE_CREATION_MODEL_OPTIONS, imageModel),
    [imageModel, remoteCanvasModels],
  );
  const pendingTaskIds = useMemo(() => {
    const ids = new Set<string>();
    if (selectedProject?.copy_task_id && selectedProject.status === "generating_copy") {
      ids.add(selectedProject.copy_task_id);
    }
    for (const card of draft.cards) {
      if (card.task_id && (card.status === "queued" || card.status === "running" || !card.status)) {
        ids.add(card.task_id);
      }
    }
    return [...ids];
  }, [draft.cards, selectedProject?.copy_task_id, selectedProject?.status]);

  const applyProject = useCallback((project: SocialProject) => {
    setProjects((items) => {
      const next = items.some((item) => item.id === project.id)
        ? items.map((item) => (item.id === project.id ? project : item))
        : [project, ...items];
      return [...next].sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
    });
    setSelectedId(project.id);
    setDraft(draftFromProject(project));
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const items = await fetchSocialProjects();
      setProjects(items);
      const next = items.find((item) => item.id === selectedId) || items[0] || null;
      setSelectedId(next?.id || "");
      setDraft(draftFromProject(next));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载社媒项目失败");
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    if (isCheckingAuth) return;
    void reload();
  }, [isCheckingAuth, reload]);

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
    if (!chatModelOptions.some((option) => option.value === chatModel)) {
      setChatModel(chatModelOptions[0]?.value || DEFAULT_CHAT_MODEL);
    }
  }, [chatModel, chatModelOptions]);

  useEffect(() => {
    if (!imageModelOptions.some((option) => option.value === imageModel)) {
      setImageModel(imageModelOptions[0]?.value || DEFAULT_IMAGE_MODEL);
    }
  }, [imageModel, imageModelOptions]);

  useEffect(() => {
    if (!pendingTaskIds.length || !selectedProject) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const { items } = await fetchCreationTasks(pendingTaskIds);
        if (cancelled || items.length === 0) return;
        let nextDraft = draftFromProject(selectedProject);
        let nextProject = projectFromDraft(selectedProject, nextDraft);
        let changed = false;
        for (const task of items) {
          if (task.id === selectedProject.copy_task_id && task.status === "success") {
            const parsed = parseGeneratedCopy(extractTaskText(task));
            nextDraft = {
              ...nextDraft,
              title: parsed.title || nextDraft.title,
              caption: parsed.caption || nextDraft.caption,
              tagsText: parsed.tags.map((tag) => `#${tag}`).join(" "),
            cards: parsed.cards.length ? normalizeCards(parsed.cards, { preserveImages: true }) : nextDraft.cards,
            };
            nextProject = {
              ...projectFromDraft(selectedProject, nextDraft),
              status: "copy_ready",
              copy_markdown: buildMarkdown(nextDraft.title, nextDraft.caption, parsed.tags),
            };
            changed = true;
          } else if (task.id === selectedProject.copy_task_id && task.status === "error") {
            nextProject = { ...nextProject, status: "draft" };
            toast.error(task.error || "文案生成失败");
            changed = true;
          }
          nextDraft.cards = nextDraft.cards.map((card) => {
            if (card.task_id !== task.id) return card;
            const image = extractTaskImage(task);
            changed = true;
            return {
              ...card,
              status: task.status,
              image_url: image.image_url || card.image_url,
              local_url: image.local_url || card.local_url,
            };
          });
        }
        if (!changed) return;
        const hasPendingCards = nextDraft.cards.some((card) => card.task_id && (card.status === "queued" || card.status === "running"));
        const hasSuccessfulCard = nextDraft.cards.some((card) => card.local_url || card.image_url);
        if (selectedProject.status === "generating_cards" && !hasPendingCards) {
          nextProject.status = hasSuccessfulCard ? "cards_ready" : "copy_ready";
        }
        nextProject.cards = nextDraft.cards;
        const saved = await saveSocialProject(nextProject);
        if (cancelled) return;
        applyProject(saved);
        setGeneratingCopy(false);
        if (!hasPendingCards) setGeneratingCards(false);
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "同步生成任务失败");
        }
      }
    };
    void tick();
    const timer = window.setInterval(tick, SOCIAL_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [applyProject, pendingTaskIds, selectedProject]);

  const createProject = async () => {
    try {
      const project = await createSocialProject({
        platform: "xhs",
        topic: DEFAULT_TOPIC,
        audience: "通用小红书用户",
        tone: "自然、专业、有判断力",
        status: "draft",
      });
      applyProject(project);
      toast.success("已创建社媒项目");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建失败");
    }
  };

  const persist = async (nextDraft = draft) => {
    if (!selectedProject || saving) return null;
    setSaving(true);
    try {
      const saved = await saveSocialProject(projectFromDraft(selectedProject, nextDraft));
      applyProject(saved);
      toast.success("草稿已保存");
      return saved;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const removeProject = async (project: SocialProject) => {
    if (!window.confirm(`删除「${projectTitle(project)}」？`)) return;
    try {
      await deleteSocialProject(project.id);
      const next = projects.filter((item) => item.id !== project.id);
      setProjects(next);
      const selected = next[0] || null;
      setSelectedId(selected?.id || "");
      setDraft(draftFromProject(selected));
      toast.success("项目已删除");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    }
  };

  const handleSourceImageUpload = async (files: FileList | null) => {
    const imageFiles = Array.from(files || []).filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0 || uploadingSourceImage) return;
    setUploadingSourceImage(true);
    try {
      const uploaded = await uploadManagedImages(imageFiles, "private");
      const refs = uploaded.map((item) => ({
        path: item.path,
        name: item.name,
        thumbnail_url: item.thumbnail_url || item.preview_url,
        local_url: item.preview_url || item.url,
        url: item.url,
      }));
      setDraft((current) => ({
        ...current,
        source_images: mergeSourceImages(current.source_images, refs),
      }));
      toast.success(`已上传 ${refs.length} 张参考图`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "上传参考图失败");
    } finally {
      setUploadingSourceImage(false);
    }
  };

  const removeSourceImage = (index: number) => {
    setDraft((current) => ({
      ...current,
      source_images: current.source_images.filter((_, imageIndex) => imageIndex !== index),
    }));
  };

  const loadLibraryImages = useCallback(async (scope = libraryScope, cursor = "", append = false) => {
    if (append) {
      setLibraryLoadingMore(true);
    } else {
      setLibraryLoading(true);
    }
    try {
      const result = await fetchManagedImages({
        scope,
        page_size: SOCIAL_LIBRARY_PAGE_SIZE,
        cursor,
      });
      setLibraryImages((current) => append ? [...current, ...result.items] : result.items);
      setLibraryNextCursor(result.next_cursor);
      setLibraryHasMore(result.has_more);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载图片库失败");
    } finally {
      setLibraryLoading(false);
      setLibraryLoadingMore(false);
    }
  }, [libraryScope]);

  const openImageLibrary = () => {
    setLibraryOpen(true);
    setSelectedLibraryPaths([]);
    void loadLibraryImages(libraryScope);
  };

  const changeLibraryScope = (scope: ManagedImageListScope) => {
    setLibraryScope(scope);
    setSelectedLibraryPaths([]);
    void loadLibraryImages(scope);
  };

  const toggleLibraryImage = (path: string) => {
    setSelectedLibraryPaths((current) =>
      current.includes(path) ? current.filter((item) => item !== path) : [...current, path],
    );
  };

  const addSelectedLibraryImages = () => {
    const selected = libraryImages.filter((item) => selectedLibraryPaths.includes(item.path));
    if (!selected.length) {
      toast.error("先选择图片");
      return;
    }
    const refs = selected.map(managedImageToSocialRef);
    setDraft((current) => ({
      ...current,
      source_images: mergeSourceImages(current.source_images, refs),
    }));
    setLibraryOpen(false);
    setSelectedLibraryPaths([]);
    toast.success(`已加入 ${refs.length} 张图片`);
  };

  const assignSourceImageToCard = (image: SocialImageRef, cardIndex = selectedCardIndex) => {
    if (!draft.cards[cardIndex]) return;
    updateCard(cardIndex, imageRefToCardPatch(image));
  };

  const clearCardImage = (cardIndex = selectedCardIndex) => {
    updateCard(cardIndex, clearCardImagePatch());
  };

  const assignImagesByOrder = () => {
    if (draft.source_images.length === 0 || draft.cards.length === 0) {
      toast.error("需要先上传参考图并创建卡片");
      return;
    }
    setDraft((current) => ({
      ...current,
      cards: normalizeCards(current.cards.map((card, index) => {
        const image = current.source_images[index % current.source_images.length];
        return image ? { ...card, ...imageRefToCardPatch(image) } : card;
      })),
    }));
    toast.success("已按顺序分配参考图");
  };

  const appendCardsFromImages = () => {
    if (draft.source_images.length === 0) {
      toast.error("需要先上传参考图");
      return;
    }
    setDraft((current) => {
      const remainingSlots = Math.max(0, 8 - current.cards.length);
      if (remainingSlots === 0) {
        toast.error("小红书卡片最多 8 页");
        return current;
      }
      const nextCards = current.source_images.slice(0, remainingSlots).map((image, index) => {
        const cardIndex = current.cards.length + index;
        return {
          id: `card-${cardIndex + 1}`,
          index: cardIndex + 1,
          title: image.name ? image.name.replace(/\.[^.]+$/, "") : `配图 ${cardIndex + 1}`,
          body: "补充这张图对应的说明。",
          layout: cardIndex === 0 ? "cover" : "list",
          accent: socialAccent(cardIndex),
          ...imageRefToCardPatch(image),
        } satisfies SocialCard;
      });
      toast.success(`已追加 ${nextCards.length} 页配图卡片`);
      return {
        ...current,
        cards: normalizeCards([...current.cards, ...nextCards]),
      };
    });
  };

  const submitCopy = async () => {
    if (!selectedProject || generatingCopy) return;
    const saved = await persist();
    if (!saved) return;
    setGeneratingCopy(true);
    try {
      const result = await generateSocialProjectCopy(saved.id, chatModel, createClientId("social-copy"));
      applyProject(result.item);
      toast.success("已提交文案生成任务");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "提交文案生成失败");
      setGeneratingCopy(false);
    }
  };

  const submitCards = async () => {
    if (!selectedProject || generatingCards) return;
    const saved = await persist();
    if (!saved) return;
    setGeneratingCards(true);
    try {
      const result = await generateSocialProjectCards(saved.id, imageModel);
      applyProject(result.item);
      toast.success(result.tasks.length ? "已提交 AI 配图任务" : "当前卡片无需 AI 配图");
      if (result.tasks.length === 0) {
        setGeneratingCards(false);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "提交配图失败");
      setGeneratingCards(false);
    }
  };

  const addCard = () => {
    setDraft((current) => ({
      ...current,
      cards: normalizeCards([
        ...current.cards,
        {
          id: `card-${current.cards.length + 1}`,
          index: current.cards.length + 1,
          title: "新卡片",
          body: "补充这一页想表达的重点。",
          layout: "list",
          visual_mode: "info",
          accent: socialAccent(current.cards.length),
        },
      ]),
    }));
    setSelectedCardIndex(draft.cards.length);
  };

  const updateCard = (index: number, updates: Partial<SocialCard>) => {
    setDraft((current) => ({
      ...current,
      cards: normalizeCards(current.cards.map((card, cardIndex) => (cardIndex === index ? { ...card, ...updates } : card))),
    }));
  };

  const removeCard = (index: number) => {
    setDraft((current) => ({
      ...current,
      cards: normalizeCards(current.cards.filter((_, cardIndex) => cardIndex !== index)),
    }));
    setSelectedCardIndex((current) => Math.max(0, Math.min(current, draft.cards.length - 2)));
  };

  const exportCard = async (card: SocialCard, index: number) => {
    const blob = await renderCardToPNG(card, projectFromDraft(selectedProject || { id: "", platform: "xhs", status: "draft" }, draft));
    downloadBlob(blob, `xhs-card-${String(index + 1).padStart(2, "0")}-${safeFileName(card.title || draft.topic)}.png`);
  };

  const exportAll = async () => {
    if (!selectedProject || exporting) return;
    setExporting(true);
    try {
      const saved = await persist();
      if (!saved) return;
      const result = await exportSocialProject(saved.id, `${safeFileName(draft.title || draft.topic)}.zip`);
      const zipEntries: ZipEntry[] = [{
        name: `${safeFileName(draft.title || draft.topic)}.md`,
        data: textToBytes(result.markdown || markdown),
      }];
      for (let index = 0; index < draft.cards.length; index += 1) {
        const blob = await renderCardToPNG(draft.cards[index], projectFromDraft(saved, draft));
        zipEntries.push({
          name: `cards/xhs-card-${String(index + 1).padStart(2, "0")}.png`,
          data: new Uint8Array(await blob.arrayBuffer()),
        });
      }
      const zip = buildZipBlob(zipEntries);
      downloadBlob(zip, result.file_name || `${safeFileName(draft.title || draft.topic)}.zip`);
      applyProject(result.item);
      toast.success("已导出 ZIP 发布包");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导出失败");
    } finally {
      setExporting(false);
    }
  };

  if (isCheckingAuth) {
    return null;
  }

  return (
    <>
    <section className="flex h-full min-h-0 w-full overflow-hidden rounded-[24px] border border-border bg-card text-card-foreground shadow-[0_16px_42px_rgba(24,40,72,0.08)]">
      <aside className="flex h-full min-h-0 w-[300px] shrink-0 flex-col border-r border-border bg-muted/30">
        <div className="flex items-center justify-between gap-3 border-b border-border p-4">
          <div>
            <h1 className="font-display text-lg font-semibold text-foreground">社媒运营</h1>
            <p className="text-xs text-muted-foreground">小红书图文项目</p>
          </div>
          <Button size="icon" className="size-9 rounded-xl" onClick={() => void createProject()} title="新建项目">
            <Plus className="size-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2 border-b border-border p-3">
          <Button variant="outline" className="h-9 flex-1 rounded-xl text-xs" onClick={() => void reload()} disabled={loading}>
            {loading ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            刷新
          </Button>
        </div>
        <div className="hide-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
          {projects.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
              暂无项目
            </div>
          ) : (
            <div className="grid gap-2">
              {projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  className={cn(
                    "rounded-2xl border p-3 text-left transition",
                    project.id === selectedId
                      ? "border-[#1456f0]/40 bg-[#edf4ff] text-[#123a8c] dark:bg-sky-950/30 dark:text-sky-200"
                      : "border-border bg-background hover:bg-accent",
                  )}
                  onClick={() => {
                    setSelectedId(project.id);
                    setDraft(draftFromProject(project));
                    setSelectedCardIndex(0);
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{projectTitle(project)}</span>
                    <Badge variant={statusVariant(project.status)}>{statusLabel(project.status)}</Badge>
                  </div>
                  <div className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{project.source_text || project.caption || "还没有素材内容"}</div>
                  <div className="mt-2 text-[11px] text-muted-foreground">{formatDateTime(project.updated_at)}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      <main className="grid h-full min-h-0 min-w-0 flex-1 grid-cols-[minmax(360px,0.78fr)_minmax(420px,1fr)] overflow-hidden">
        <section className="h-full min-h-0 overflow-y-auto border-r border-border p-4">
          {!selectedProject ? (
            <EmptyState onCreate={() => void createProject()} />
          ) : (
            <div className="grid gap-4">
              <Card className="gap-4 rounded-2xl p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">项目素材</div>
                    <div className="text-xs text-muted-foreground">先保存草稿，再提交生成任务</div>
                  </div>
                  <Badge variant={statusVariant(selectedProject.status)}>{statusLabel(selectedProject.status)}</Badge>
                </div>
                <div className="grid gap-3">
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">主题</span>
                    <Input value={draft.topic} onChange={(event) => setDraft((current) => ({ ...current, topic: event.target.value }))} className="h-10 rounded-xl" />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="grid gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">人群</span>
                      <Input value={draft.audience} onChange={(event) => setDraft((current) => ({ ...current, audience: event.target.value }))} className="h-10 rounded-xl" />
                    </label>
                    <label className="grid gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">语气</span>
                      <Input value={draft.tone} onChange={(event) => setDraft((current) => ({ ...current, tone: event.target.value }))} className="h-10 rounded-xl" />
                    </label>
                  </div>
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">素材</span>
                    <Textarea
                      value={draft.source_text}
                      onChange={(event) => setDraft((current) => ({ ...current, source_text: event.target.value }))}
                      className="min-h-36 rounded-xl"
                      placeholder="粘贴产品说明、教程重点、案例素材或运营要求。"
                    />
                  </label>
                  <div className="grid gap-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-medium text-muted-foreground">参考图</span>
                      <div className="flex gap-1.5">
                        <Button variant="outline" size="sm" className="h-8 rounded-xl" onClick={assignImagesByOrder} disabled={!draft.source_images.length || !draft.cards.length}>
                          <Link2 className="size-3.5" />
                          顺序分配
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 rounded-xl" onClick={appendCardsFromImages} disabled={!draft.source_images.length || draft.cards.length >= 8}>
                          <Plus className="size-3.5" />
                          生成页
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 rounded-xl" onClick={openImageLibrary}>
                          <FileText className="size-3.5" />
                          图片库
                        </Button>
                        <Button asChild variant="outline" size="sm" className="h-8 rounded-xl">
                          <label htmlFor="social-source-images" className="cursor-pointer">
                            {uploadingSourceImage ? <LoaderCircle className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
                            上传
                          </label>
                        </Button>
                      </div>
                      <input
                        id="social-source-images"
                        type="file"
                        accept="image/*"
                        multiple
                        className="sr-only"
                        disabled={uploadingSourceImage}
                        onChange={(event) => {
                          void handleSourceImageUpload(event.target.files);
                          event.target.value = "";
                        }}
                      />
                    </div>
                    {draft.source_images.length ? (
                      <div className="grid grid-cols-4 gap-2">
                        {draft.source_images.map((image, index) => (
                          <div key={`${sourceImageKey(image)}-${index}`} className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-muted">
                            <button
                              type="button"
                              className="h-full w-full"
                              onClick={() => assignSourceImageToCard(image)}
                              title="绑定到当前卡片"
                            >
                              {sourceImagePreview(image) ? (
                                <img src={sourceImagePreview(image)} alt={image.name || "参考图"} className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">图片</div>
                              )}
                            </button>
                            {activeCard && cardUsesImage(activeCard, image) ? (
                              <span className="absolute bottom-1.5 left-1.5 rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                                当前页
                              </span>
                            ) : null}
                            <button
                              type="button"
                              className="absolute right-1.5 top-1.5 inline-flex size-7 items-center justify-center rounded-lg bg-background/90 text-muted-foreground opacity-0 shadow-sm transition hover:text-rose-600 group-hover:opacity-100"
                              onClick={() => removeSourceImage(index)}
                              title="移除参考图"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button className="h-10 rounded-xl" onClick={() => void persist()} disabled={saving}>
                    {saving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
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
                    <div className="text-sm font-semibold text-foreground">生成设置</div>
                    <div className="text-xs text-muted-foreground">先生成文案和卡片规划，再为 AI 页生成配图</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">文案模型</span>
                    <Select value={chatModel} onValueChange={(value) => setChatModel(value as ImageModel)}>
                      <SelectTrigger className="h-10 rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {chatModelOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">配图模型</span>
                    <Select value={imageModel} onValueChange={(value) => setImageModel(value as ImageModel)}>
                      <SelectTrigger className="h-10 rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {imageModelOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button className="h-10 rounded-xl" onClick={() => void submitCopy()} disabled={generatingCopy}>
                    {generatingCopy || selectedProject.status === "generating_copy" ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                    生成文案
                  </Button>
                  <Button variant="outline" className="h-10 rounded-xl" onClick={() => void submitCards()} disabled={generatingCards || draft.cards.length === 0}>
                    {generatingCards || selectedProject.status === "generating_cards" ? <LoaderCircle className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
                    生成配图
                  </Button>
                </div>
              </Card>

              <Card className="gap-4 rounded-2xl p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-foreground">发布文案</div>
                  <Button variant="outline" size="sm" className="h-8 rounded-xl" onClick={() => void copyText(markdown, "文案已复制")}>
                    <Clipboard className="size-3.5" />
                    复制
                  </Button>
                </div>
                <label className="grid gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">标题</span>
                  <Input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} className="h-10 rounded-xl" />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">正文</span>
                  <Textarea value={draft.caption} onChange={(event) => setDraft((current) => ({ ...current, caption: event.target.value }))} className="min-h-40 rounded-xl" />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">标签</span>
                  <Input value={draft.tagsText} onChange={(event) => setDraft((current) => ({ ...current, tagsText: event.target.value }))} className="h-10 rounded-xl" placeholder="#小红书 #运营" />
                </label>
              </Card>
            </div>
          )}
        </section>

        <section className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-border p-4">
            <div>
              <div className="text-sm font-semibold text-foreground">轮播卡片</div>
              <div className="text-xs text-muted-foreground">1080x1440 小红书 3:4 预览</div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="h-9 rounded-xl" onClick={addCard} disabled={!selectedProject}>
                <Plus className="size-4" />
                加页
              </Button>
              <Button className="h-9 rounded-xl" onClick={() => void exportAll()} disabled={!selectedProject || exporting}>
                {exporting ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowDownToLine className="size-4" />}
                导出
              </Button>
            </div>
          </div>
          <div className="grid h-full min-h-0 grid-cols-[160px_minmax(0,1fr)] overflow-hidden">
            <div className="hide-scrollbar h-full min-h-0 overflow-y-auto border-r border-border p-3">
              <div className="grid gap-2">
                {draft.cards.map((card, index) => (
                  <button
                    key={card.id}
                    type="button"
                    className={cn(
                      "rounded-xl border p-2 text-left text-xs transition",
                      index === selectedCardIndex ? "border-[#1456f0]/50 bg-[#edf4ff] dark:bg-sky-950/30" : "border-border bg-background hover:bg-accent",
                    )}
                    onClick={() => setSelectedCardIndex(index)}
                  >
                    <div className="font-semibold">第 {index + 1} 页</div>
                    <div className="mt-1 truncate text-muted-foreground">{card.title || "未命名卡片"}</div>
                    {card.visual_mode === "ai" ? <Badge className="mt-2" variant="info">AI 配图</Badge> : null}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-full min-h-0 overflow-y-auto p-4">
              {activeCard ? (
                <div className="grid gap-4 xl:grid-cols-[minmax(280px,1fr)_300px]">
                  <div className="flex justify-center">
                    <SocialCardPreview
                      card={activeCard}
                      project={projectFromDraft(selectedProject || {
                        id: "",
                        platform: "xhs",
                        status: "draft",
                      }, draft)}
                    />
                  </div>
                  <Card className="h-fit gap-3 rounded-2xl p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-foreground">卡片编辑</div>
                      <Button variant="outline" size="sm" className="h-8 rounded-xl" onClick={() => void exportCard(activeCard, selectedCardIndex)}>
                        <ArrowDownToLine className="size-3.5" />
                        PNG
                      </Button>
                    </div>
                    <label className="grid gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">标题</span>
                      <Input className="h-10 rounded-xl" value={activeCard.title || ""} onChange={(event) => updateCard(selectedCardIndex, { title: event.target.value })} />
                    </label>
                    <label className="grid gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">正文</span>
                      <Textarea className="min-h-28 rounded-xl" value={activeCard.body || ""} onChange={(event) => updateCard(selectedCardIndex, { body: event.target.value })} />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="grid gap-1.5">
                        <span className="text-xs font-medium text-muted-foreground">版式</span>
                        <Select value={activeCard.layout || "list"} onValueChange={(value) => updateCard(selectedCardIndex, { layout: value })}>
                          <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cover">封面</SelectItem>
                            <SelectItem value="list">清单</SelectItem>
                            <SelectItem value="steps">步骤</SelectItem>
                            <SelectItem value="quote">金句</SelectItem>
                            <SelectItem value="summary">总结</SelectItem>
                          </SelectContent>
                        </Select>
                      </label>
                      <label className="grid gap-1.5">
                        <span className="text-xs font-medium text-muted-foreground">视觉</span>
                        <Select value={activeCard.visual_mode || "info"} onValueChange={(value) => updateCard(selectedCardIndex, { visual_mode: value as SocialCard["visual_mode"] })}>
                          <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="info">信息设计</SelectItem>
                            <SelectItem value="ai">AI 配图</SelectItem>
                            <SelectItem value="image">参考图</SelectItem>
                          </SelectContent>
                        </Select>
                      </label>
                    </div>
                    {activeCard.visual_mode === "ai" ? (
                      <label className="grid gap-1.5">
                        <span className="text-xs font-medium text-muted-foreground">AI 配图 Prompt</span>
                        <Textarea className="min-h-24 rounded-xl" value={activeCard.image_prompt || ""} onChange={(event) => updateCard(selectedCardIndex, { image_prompt: event.target.value })} />
                      </label>
                    ) : null}
                    {activeCard.visual_mode === "image" ? (
                      <div className="grid gap-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-muted-foreground">绑定参考图</span>
                          {cardImageKey(activeCard) ? (
                            <Button variant="ghost" size="sm" className="h-7 rounded-lg text-xs text-rose-600 hover:text-rose-700" onClick={() => clearCardImage()}>
                              移除图片
                            </Button>
                          ) : null}
                        </div>
                        {draft.source_images.length ? (
                          <div className="grid max-h-48 grid-cols-3 gap-2 overflow-y-auto pr-1">
                            {draft.source_images.map((image, imageIndex) => (
                              <button
                                key={`${sourceImageKey(image)}-picker-${imageIndex}`}
                                type="button"
                                className={cn(
                                  "relative aspect-square overflow-hidden rounded-xl border bg-muted transition",
                                  cardUsesImage(activeCard, image) ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/50",
                                )}
                                onClick={() => assignSourceImageToCard(image)}
                                title={image.name || "选择参考图"}
                              >
                                {sourceImagePreview(image) ? (
                                  <img src={sourceImagePreview(image)} alt={image.name || "参考图"} className="h-full w-full object-cover" />
                                ) : (
                                  <span className="flex h-full items-center justify-center text-xs text-muted-foreground">图片</span>
                                )}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
                            先在左侧项目素材里上传参考图。
                          </div>
                        )}
                      </div>
                    ) : null}
                    <Button variant="outline" className="h-10 rounded-xl text-rose-600 hover:text-rose-700" onClick={() => removeCard(selectedCardIndex)}>
                      <Trash2 className="size-4" />
                      删除本页
                    </Button>
                  </Card>
                </div>
              ) : (
                <div className="flex min-h-80 items-center justify-center rounded-2xl border border-dashed border-border text-sm text-muted-foreground">
                  生成文案后会出现轮播卡片，也可以手动加页。
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </section>
    <Dialog open={libraryOpen} onOpenChange={setLibraryOpen}>
      <DialogContent className="flex h-[min(88dvh,780px)] w-[min(94vw,980px)] max-w-none flex-col overflow-hidden rounded-3xl p-0">
        <DialogHeader className="border-b border-border px-5 pt-5 pr-12 pb-4">
          <DialogTitle>从图片库选择</DialogTitle>
          <DialogDescription>选择已有图片加入当前社媒项目参考图池，再绑定到卡片或顺序分配。</DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
          <div className="flex gap-2">
            {[
              ["mine", "我的图片"],
              ["public", "公开图库"],
              ["all", "全部"],
            ].map(([scope, label]) => (
              <Button
                key={scope}
                variant={libraryScope === scope ? "default" : "outline"}
                size="sm"
                className="h-8 rounded-xl"
                onClick={() => changeLibraryScope(scope as ManagedImageListScope)}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="text-xs text-muted-foreground">已选 {selectedLibraryPaths.length} 张</div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {libraryLoading ? (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              <LoaderCircle className="mr-2 size-4 animate-spin" />
              正在加载图片库
            </div>
          ) : libraryImages.length ? (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {libraryImages.map((item) => {
                const selected = selectedLibraryPaths.includes(item.path);
                return (
                  <button
                    key={item.path}
                    type="button"
                    className={cn(
                      "group relative aspect-square overflow-hidden rounded-2xl border bg-muted text-left transition",
                      selected ? "border-primary ring-2 ring-primary/25" : "border-border hover:border-primary/50",
                    )}
                    onClick={() => toggleLibraryImage(item.path)}
                    title={item.name}
                  >
                    {managedImagePreview(item) ? (
                      <img src={managedImagePreview(item)} alt={item.name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full items-center justify-center text-xs text-muted-foreground">图片</span>
                    )}
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute left-2 top-2 flex size-5 items-center justify-center rounded-md border bg-background/90 text-[12px] font-black shadow-sm",
                        selected ? "border-primary bg-primary text-primary-foreground" : "border-border text-transparent",
                      )}
                    >
                      ✓
                    </span>
                    <span className="absolute inset-x-0 bottom-0 truncate bg-black/45 px-2 py-1 text-[11px] font-medium text-white opacity-0 transition group-hover:opacity-100">
                      {item.name}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-border text-sm text-muted-foreground">
              当前范围没有图片
            </div>
          )}
          {libraryHasMore ? (
            <div className="mt-4 flex justify-center">
              <Button variant="outline" className="h-9 rounded-xl" onClick={() => void loadLibraryImages(libraryScope, libraryNextCursor, true)} disabled={libraryLoadingMore}>
                {libraryLoadingMore ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                加载更多
              </Button>
            </div>
          ) : null}
        </div>
        <DialogFooter className="border-t border-border px-5 py-4">
          <Button variant="outline" className="h-10 rounded-xl" onClick={() => setLibraryOpen(false)}>取消</Button>
          <Button className="h-10 rounded-xl" onClick={addSelectedLibraryImages} disabled={selectedLibraryPaths.length === 0}>加入参考图</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex min-h-96 items-center justify-center">
      <div className="max-w-sm rounded-2xl border border-dashed border-border p-6 text-center">
        <FileText className="mx-auto size-9 text-muted-foreground" />
        <div className="mt-3 text-sm font-semibold text-foreground">创建一个小红书项目</div>
        <div className="mt-1 text-xs leading-5 text-muted-foreground">用素材生成标题、正文、标签和 3:4 轮播卡片。</div>
        <Button className="mt-4 h-10 rounded-xl" onClick={onCreate}>
          <Plus className="size-4" />
          新建项目
        </Button>
      </div>
    </div>
  );
}

function SocialCardPreview({
  card,
  project,
}: {
  card: SocialCard;
  project: SocialProject;
}) {
  const accent = card.accent || "#1456f0";
  const imageSrc = card.local_url || card.image_url || (card.path ? getManagedImageUrlFromPath(card.path) : "");
  return (
    <div
      data-social-card="true"
      className="relative isolate aspect-[1080/1440] w-full max-w-[360px] overflow-hidden rounded-[20px] bg-[#fbfaf7] text-[#18181b] shadow-[0_18px_60px_rgba(15,23,42,0.18)]"
      style={{
        aspectRatio: `${XHS_CARD_WIDTH}/${XHS_CARD_HEIGHT}`,
      }}
    >
      <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: `linear-gradient(${accent} 1px, transparent 1px), linear-gradient(90deg, ${accent} 1px, transparent 1px)`, backgroundSize: "48px 48px" }} />
      {imageSrc ? (
        <img src={imageSrc} alt="" className="absolute inset-x-0 top-0 h-[46%] w-full object-cover" crossOrigin="anonymous" />
      ) : null}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 z-10 flex flex-col",
          imageSrc ? "min-h-[58%] rounded-t-[38px] bg-[#fbfaf7]/96" : "h-full bg-transparent",
        )}
        style={{ padding: 26 }}
      >
        <div className="flex items-center gap-3">
          <span className="h-2 w-12 rounded-full" style={{ backgroundColor: accent }} />
          <span className="text-[13px] font-semibold uppercase tracking-[0.18em] text-[#5f6368]">XHS</span>
          <span className="ml-auto rounded-full border border-[#18181b]/10 px-3 py-1 text-xs font-semibold text-[#5f6368]">第 {card.index || 1} 页</span>
        </div>
        <div
          className={cn(
            "mt-10 font-display font-black leading-[1.08] text-[#18181b]",
            card.layout === "cover" ? "text-[40px]" : "text-[32px]",
          )}
        >
          {card.title || project.title || project.topic || DEFAULT_TOPIC}
        </div>
        <div
          className="mt-8 whitespace-pre-line font-medium leading-[1.78] text-[#30343b]"
          style={{ fontSize: 15 }}
        >
          {card.body || "把这一页的核心信息写在这里。"}
        </div>
      </div>
    </div>
  );
}

async function renderCardToPNG(card: SocialCard, project: SocialProject) {
  const canvas = document.createElement("canvas");
  canvas.width = XHS_CARD_WIDTH;
  canvas.height = XHS_CARD_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("浏览器不支持卡片导出");
  }
  const accent = card.accent || "#1456f0";
  context.fillStyle = "#fbfaf7";
  context.fillRect(0, 0, XHS_CARD_WIDTH, XHS_CARD_HEIGHT);
  context.strokeStyle = hexToRGBA(accent, 0.08);
  context.lineWidth = 1;
  for (let x = 0; x <= XHS_CARD_WIDTH; x += 48) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, XHS_CARD_HEIGHT);
    context.stroke();
  }
  for (let y = 0; y <= XHS_CARD_HEIGHT; y += 48) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(XHS_CARD_WIDTH, y);
    context.stroke();
  }

  const imageSrc = card.local_url || card.image_url || (card.path ? getManagedImageUrlFromPath(card.path) : "");
  let contentTop = 0;
  if (imageSrc) {
    try {
      const image = await loadCanvasImage(imageSrc);
      drawCoverImage(context, image, 0, 0, XHS_CARD_WIDTH, 662);
      contentTop = 575;
      drawRoundRect(context, 0, contentTop, XHS_CARD_WIDTH, XHS_CARD_HEIGHT - contentTop + 40, 72, "#fbfaf7");
    } catch {
      contentTop = 0;
    }
  }
  const padX = 76;
  const top = contentTop + 76;
  context.fillStyle = accent;
  roundRectPath(context, padX, top, 120, 10, 5);
  context.fill();
  context.fillStyle = "#5f6368";
  context.font = "700 20px Arial, sans-serif";
  context.fillText("XHS", padX + 144, top + 16);
  context.textAlign = "right";
  drawPill(context, `第 ${card.index || 1} 页`, XHS_CARD_WIDTH - padX, top + 12);
  context.textAlign = "left";

  const titleY = top + 130;
  context.fillStyle = "#18181b";
  context.font = `900 ${card.layout === "cover" ? 102 : 82}px Arial, "Microsoft YaHei", sans-serif`;
  drawWrappedText(context, card.title || project.title || project.topic || DEFAULT_TOPIC, padX, titleY, XHS_CARD_WIDTH - padX * 2, card.layout === "cover" ? 112 : 94, 4);

  context.fillStyle = "#30343b";
  context.font = "500 38px Arial, \"Microsoft YaHei\", sans-serif";
  drawWrappedText(context, card.body || "把这一页的核心信息写在这里。", padX, titleY + (card.layout === "cover" ? 410 : 330), XHS_CARD_WIDTH - padX * 2, 68, 8);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("PNG 导出失败"));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}

function safeFileName(value: string) {
  return (value || "xhs-post").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").slice(0, 60);
}

function textToBytes(value: string) {
  return new TextEncoder().encode(value);
}

function buildZipBlob(entries: ZipEntry[]) {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const centralDirectory: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name.replace(/^\/+/, ""));
    const crc = crc32(entry.data);
    const local = concatBytes(
      uint32LE(0x04034b50),
      uint16LE(20),
      uint16LE(0),
      uint16LE(0),
      uint16LE(0),
      uint16LE(0),
      uint32LE(crc),
      uint32LE(entry.data.length),
      uint32LE(entry.data.length),
      uint16LE(name.length),
      uint16LE(0),
      name,
      entry.data,
    );
    chunks.push(local);
    centralDirectory.push(concatBytes(
      uint32LE(0x02014b50),
      uint16LE(20),
      uint16LE(20),
      uint16LE(0),
      uint16LE(0),
      uint16LE(0),
      uint16LE(0),
      uint32LE(crc),
      uint32LE(entry.data.length),
      uint32LE(entry.data.length),
      uint16LE(name.length),
      uint16LE(0),
      uint16LE(0),
      uint16LE(0),
      uint16LE(0),
      uint32LE(0),
      uint32LE(offset),
      name,
    ));
    offset += local.length;
  }
  const centralOffset = offset;
  const centralData = concatBytes(...centralDirectory);
  const end = concatBytes(
    uint32LE(0x06054b50),
    uint16LE(0),
    uint16LE(0),
    uint16LE(entries.length),
    uint16LE(entries.length),
    uint32LE(centralData.length),
    uint32LE(centralOffset),
    uint16LE(0),
  );
  return new Blob([...chunks, centralData, end], { type: "application/zip" });
}

function concatBytes(...parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function uint16LE(value: number) {
  const out = new Uint8Array(2);
  new DataView(out.buffer).setUint16(0, value, true);
  return out;
}

function uint32LE(value: number) {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value >>> 0, true);
  return out;
}

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function hexToRGBA(hex: string, alpha: number) {
  const cleaned = hex.replace("#", "");
  if (cleaned.length !== 6) return `rgba(20,86,240,${alpha})`;
  const r = Number.parseInt(cleaned.slice(0, 2), 16);
  const g = Number.parseInt(cleaned.slice(2, 4), 16);
  const b = Number.parseInt(cleaned.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function roundRectPath(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function drawRoundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, fill: string) {
  roundRectPath(context, x, y, width, height, radius);
  context.fillStyle = fill;
  context.fill();
}

function drawPill(context: CanvasRenderingContext2D, text: string, right: number, y: number) {
  context.font = "700 24px Arial, \"Microsoft YaHei\", sans-serif";
  const width = context.measureText(text).width + 48;
  drawRoundRect(context, right - width, y - 28, width, 48, 24, "rgba(24,24,27,0.06)");
  context.fillStyle = "#5f6368";
  context.fillText(text, right - 24, y + 6);
}

function drawWrappedText(context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number) {
  const segments = text.split(/\n/).flatMap((line) => line.split(""));
  let line = "";
  let currentY = y;
  let lines = 0;
  for (const char of segments) {
    const test = line + char;
    if (context.measureText(test).width > maxWidth && line) {
      context.fillText(line, x, currentY);
      currentY += lineHeight;
      lines += 1;
      line = char;
      if (lines >= maxLines - 1) break;
    } else {
      line = test;
    }
  }
  if (line && lines < maxLines) {
    context.fillText(line, x, currentY);
  }
}

function loadCanvasImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片加载失败"));
    image.src = src;
  });
}

function drawCoverImage(context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}
