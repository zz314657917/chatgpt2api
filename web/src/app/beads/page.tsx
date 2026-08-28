import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Copy,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import {
  copyBeadProject,
  createBeadProject,
  deleteBeadProject,
  fetchBeadProject,
  fetchBeadProjects,
  fetchManagedImageDetail,
  renameBeadProject,
  saveBeadProject,
  uploadManagedImages,
  type BeadAssetReference,
  type BeadProjectDocument,
  type BeadProjectSummary,
} from "@/lib/api";
import { fetchAuthenticatedImageBlob } from "@/lib/authenticated-image";
import { useAuthGuard } from "@/lib/use-auth-guard";
import { hasAPIPermission } from "@/store/auth";

import {
  documentToWorkbenchProject,
  normalizeProjectSummary,
  workbenchProjectToDocument,
} from "./project-adapter";
import { BeadProjectThumbnail } from "./project-thumbnail";
import {
  BeadAssetPicker,
  type BeadAssetSelection,
} from "./bead-asset-picker";
import WorkbenchApp from "./upstream/workbench-app";
import type { BeadProject } from "./upstream/types";
import "./upstream/upstream.css";
import "./beads.css";

type EditAction =
  | { mode: "rename"; project: BeadProjectSummary }
  | { mode: "delete"; project: BeadProjectSummary }
  | null;

type BeadSaveState = "unsaved" | "saving" | "saved" | "error";
type BeadAssetKind = "source" | "reference";
type PendingBeadAsset = BeadAssetSelection & { kind: BeadAssetKind; sequence: number };

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function ProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<BeadProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [action, setAction] = useState<EditAction>(null);
  const [name, setName] = useState("");

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const items = await fetchBeadProjects();
      setProjects(items.map(normalizeProjectSummary));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载拼豆工程失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  async function createProject() {
    setWorking(true);
    try {
      const project = await createBeadProject();
      navigate(`/beads/${project.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "新建工程失败");
    } finally {
      setWorking(false);
    }
  }

  async function copyProject(project: BeadProjectSummary) {
    setWorking(true);
    try {
      await copyBeadProject(project.id);
      toast.success("工程副本已创建");
      await loadProjects();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "复制工程失败");
    } finally {
      setWorking(false);
    }
  }

  async function submitAction() {
    if (!action) return;
    setWorking(true);
    try {
      if (action.mode === "rename") {
        const nextName = name.trim();
        if (!nextName) {
          toast.error("请输入工程名称");
          return;
        }
        await renameBeadProject(
          action.project.id,
          action.project.revision,
          nextName,
        );
        toast.success("工程已重命名");
      } else {
        await deleteBeadProject(action.project.id);
        toast.success("工程已删除");
      }
      setAction(null);
      await loadProjects();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "操作失败");
    } finally {
      setWorking(false);
    }
  }

  return (
    <main className="beads-projects-page h-full overflow-y-auto bg-background text-foreground">
      <div className="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
          <div>
            <p className="text-sm font-medium text-muted-foreground">个人私有工程</p>
            <h1 className="mt-1 text-2xl font-semibold">拼豆工坊</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {projects.length}/30 个工程
            </p>
          </div>
          <Button onClick={() => void createProject()} disabled={working}>
            <Plus />
            新建工程
          </Button>
        </div>

        {loading ? (
          <div className="grid min-h-[360px] place-items-center text-sm text-muted-foreground">正在加载工程</div>
        ) : projects.length === 0 ? (
          <div className="grid min-h-[420px] place-items-center border-b border-border text-center">
            <div>
              <p className="text-lg font-medium">还没有拼豆工程</p>
              <p className="mt-2 text-sm text-muted-foreground">新建一个 52 x 52 的画布开始制作。</p>
              <Button className="mt-5" onClick={() => void createProject()} disabled={working}>
                <Plus />
                新建工程
              </Button>
            </div>
          </div>
        ) : (
          <div className="beads-project-grid">
            {projects.map((project) => (
              <article key={project.id} className="beads-project-card group">
                <button
                  type="button"
                  className="beads-project-preview"
                  onClick={() => navigate(`/beads/${project.id}`)}
                >
                  <BeadProjectThumbnail project={project} />
                </button>
                <div className="flex min-w-0 items-start gap-3 border-t border-border px-4 py-3">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => navigate(`/beads/${project.id}`)}
                  >
                    <strong className="block truncate text-sm font-semibold">{project.name}</strong>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {project.width} x {project.height} · {project.bead_count.toLocaleString("zh-CN")} 颗 · {formatUpdatedAt(project.updated_at)}
                    </span>
                  </button>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={`${project.name} 更多操作`}>
                        <MoreHorizontal />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-40 p-1">
                      <Button
                        variant="ghost"
                        className="w-full justify-start"
                        onClick={() => {
                          setName(project.name);
                          setAction({ mode: "rename", project });
                        }}
                      >
                        <Pencil /> 重命名
                      </Button>
                      <Button
                        variant="ghost"
                        className="w-full justify-start"
                        onClick={() => void copyProject(project)}
                      >
                        <Copy /> 创建副本
                      </Button>
                      <Button
                        variant="ghost"
                        className="w-full justify-start text-destructive"
                        onClick={() => setAction({ mode: "delete", project })}
                      >
                        <Trash2 /> 删除
                      </Button>
                    </PopoverContent>
                  </Popover>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <Dialog open={Boolean(action)} onOpenChange={(open) => !open && setAction(null)}>
        <DialogContent showCloseButton={false} className="rounded-lg">
          <DialogHeader>
            <DialogTitle>{action?.mode === "delete" ? "删除工程" : "重命名工程"}</DialogTitle>
            <DialogDescription>
              {action?.mode === "delete"
                ? `确认删除“${action.project.name}”？其引用的素材不会被删除。`
                : "工程名称最多 80 个字符。"}
            </DialogDescription>
          </DialogHeader>
          {action?.mode === "rename" ? (
            <Input value={name} maxLength={80} autoFocus onChange={(event) => setName(event.target.value)} />
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAction(null)}>取消</Button>
            <Button
              variant={action?.mode === "delete" ? "destructive" : "default"}
              disabled={working}
              onClick={() => void submitAction()}
            >
              {action?.mode === "delete" ? "删除" : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function WorkbenchPage({
  projectId,
  canReadImages,
  canUploadImages,
}: {
  projectId: string;
  canReadImages: boolean;
  canUploadImages: boolean;
}) {
  const navigate = useNavigate();
  const [document, setDocument] = useState<BeadProjectDocument | null>(null);
  const [draft, setDraft] = useState<BeadProject | null>(null);
  const documentRef = useRef<BeadProjectDocument | null>(null);
  const draftRef = useRef<BeadProject | null>(null);
  const editVersionRef = useRef(0);
  const savedVersionRef = useRef(0);
  const lastEditAtRef = useRef(0);
  const savingRef = useRef(false);
  const autoSavePausedRef = useRef(false);
  const activeRequestRef = useRef(0);
  const projectGenerationRef = useRef(0);
  const conflictSessionRef = useRef(0);
  const conflictActionRef = useRef<"reload" | "copy" | null>(null);
  const assetUploadVersionRef = useRef<Record<BeadAssetKind, number>>({ source: 0, reference: 0 });
  const autoSaveTimerRef = useRef<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<BeadSaveState>("saved");
  const [dirtyTick, setDirtyTick] = useState(0);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [conflictAction, setConflictAction] = useState<"reload" | "copy" | null>(null);
  const [assetPickerKind, setAssetPickerKind] = useState<BeadAssetKind | null>(null);
  const [pendingAssets, setPendingAssets] = useState<PendingBeadAsset[]>([]);
  const [workbenchInstance, setWorkbenchInstance] = useState(0);
  const assetSequenceRef = useRef(0);

  const queuePendingAsset = useCallback((asset: Omit<PendingBeadAsset, "sequence">) => {
    const next = { ...asset, sequence: assetSequenceRef.current + 1 };
    assetSequenceRef.current = next.sequence;
    setPendingAssets((current) => [
      ...current.filter((item) => item.kind !== next.kind),
      next,
    ]);
  }, []);

  const clearAutoSaveTimer = useCallback(() => {
    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
  }, []);

  const markUnsaved = useCallback(() => {
    editVersionRef.current += 1;
    lastEditAtRef.current = Date.now();
    autoSavePausedRef.current = false;
    if (!savingRef.current) setSaveState("unsaved");
    setDirtyTick((current) => current + 1);
  }, []);

  const updateAssetReference = useCallback((kind: BeadAssetKind, reference: BeadAssetReference) => {
    const current = documentRef.current;
    if (!current) return;
    const next = kind === "source"
      ? { ...current, source_image: reference }
      : { ...current, reference_image: reference };
    documentRef.current = next;
    setDocument(next);
    markUnsaved();
  }, [markUnsaved]);

  const clearAssetReference = useCallback((kind: BeadAssetKind) => {
    const current = documentRef.current;
    if (!current || (kind === "source" ? !current.source_image : !current.reference_image)) return;
    const next = { ...current };
    if (kind === "source") {
      delete next.source_image;
    } else {
      delete next.reference_image;
    }
    documentRef.current = next;
    setDocument(next);
    markUnsaved();
  }, [markUnsaved]);

  const restoreProjectAssets = useCallback((item: BeadProjectDocument, generation: number) => {
    const restoreAsset = async (kind: BeadAssetKind, reference?: BeadAssetReference) => {
      if (!reference) return;
      try {
        const filters = reference.scope === "team"
          ? { scope: "team" as const, team_id: reference.team_id }
          : { scope: "mine" as const };
        const image = await fetchManagedImageDetail(reference.path, filters);
        const imageUrl = image.url || image.preview_url || image.thumbnail_url || "";
        if (!imageUrl) throw new Error("素材原图不可用");
        const blob = await fetchAuthenticatedImageBlob(imageUrl);
        if (projectGenerationRef.current !== generation || documentRef.current?.id !== item.id) return;
        queuePendingAsset({
          kind,
          reference,
          file: new File([blob], image.name || reference.name || "bead-image.png", {
            type: blob.type || "image/png",
          }),
          imageUrl,
        });
      } catch {
        if (projectGenerationRef.current === generation) {
          toast.error(`${kind === "source" ? "转换原图" : "参考图"}无法从素材库恢复`);
        }
      }
    };
    void restoreAsset("source", item.source_image);
    void restoreAsset("reference", item.reference_image);
  }, [queuePendingAsset]);

  useEffect(() => {
    let active = true;
    const generation = projectGenerationRef.current + 1;
    projectGenerationRef.current = generation;
    activeRequestRef.current += 1;
    assetUploadVersionRef.current.source += 1;
    assetUploadVersionRef.current.reference += 1;
    conflictSessionRef.current += 1;
    conflictActionRef.current = null;
    setConflictAction(null);
    setPendingAssets([]);
    setLoading(true);
    void fetchBeadProject(projectId)
      .then((item) => {
        if (!active || projectGenerationRef.current !== generation) return;
        documentRef.current = item;
        setDocument(item);
        const project = documentToWorkbenchProject(item);
        draftRef.current = project;
        editVersionRef.current = 0;
        savedVersionRef.current = 0;
        lastEditAtRef.current = 0;
        savingRef.current = false;
        autoSavePausedRef.current = false;
        setSaveState("saved");
        setConflictOpen(false);
        setDraft(project);
        setWorkbenchInstance((current) => current + 1);
        restoreProjectAssets(item, generation);
      })
      .catch((error) => {
        if (!active || projectGenerationRef.current !== generation) return;
        toast.error(error instanceof Error ? error.message : "加载工程失败");
        navigate("/beads", { replace: true });
      })
      .finally(() => {
        if (active && projectGenerationRef.current === generation) setLoading(false);
      });
    return () => {
      active = false;
      activeRequestRef.current += 1;
      clearAutoSaveTimer();
    };
  }, [clearAutoSaveTimer, navigate, projectId, restoreProjectAssets]);

  const handleChange = useCallback((project: BeadProject) => {
    draftRef.current = project;
    setDraft(project);
    markUnsaved();
  }, [markUnsaved]);

  const persistCurrentDraft = useCallback(
    async (force = false) => {
      const currentDocument = documentRef.current;
      const currentDraft = draftRef.current;
      if (!currentDocument || !currentDraft || savingRef.current) return;
      if (autoSavePausedRef.current && !force) return;
      clearAutoSaveTimer();
      savingRef.current = true;
      setSaveState("saving");
      const projectGeneration = projectGenerationRef.current;
      const submittedVersion = editVersionRef.current;
      const requestId = activeRequestRef.current + 1;
      activeRequestRef.current = requestId;
      const isCurrentRequest = () =>
        requestId === activeRequestRef.current
        && projectGeneration === projectGenerationRef.current
        && documentRef.current?.id === currentDocument.id;
      try {
        const saved = await saveBeadProject(
          workbenchProjectToDocument(currentDraft, currentDocument),
        );
        if (!isCurrentRequest()) return;
        savedVersionRef.current = submittedVersion;
        const hasNewerEdits = editVersionRef.current > submittedVersion;
        const currentAssets = documentRef.current;
        const nextDocument = hasNewerEdits && currentAssets
          ? {
              ...saved,
              source_image: currentAssets.source_image,
              reference_image: currentAssets.reference_image,
            }
          : saved;
        documentRef.current = nextDocument;
        setDocument(nextDocument);
        if (!hasNewerEdits) {
          setSaveState("saved");
        } else {
          setSaveState("unsaved");
          setDirtyTick((current) => current + 1);
        }
      } catch (error) {
        if (!isCurrentRequest()) return;
        const status = typeof error === "object" && error !== null && "status" in error
          ? Number(error.status)
          : 0;
        if (status === 409) {
          autoSavePausedRef.current = true;
          conflictSessionRef.current += 1;
          conflictActionRef.current = null;
          setConflictAction(null);
          setSaveState("unsaved");
          setConflictOpen(true);
        } else {
          autoSavePausedRef.current = true;
          setSaveState("error");
          toast.error(error instanceof Error ? error.message : "保存工程失败");
        }
      } finally {
        if (isCurrentRequest()) {
          savingRef.current = false;
        }
      }
    },
    [clearAutoSaveTimer],
  );

  useEffect(() => {
    if (loading || !document || !draft || saveState === "saving" || autoSavePausedRef.current) {
      return;
    }
    if (editVersionRef.current <= savedVersionRef.current) return;
    clearAutoSaveTimer();
    const elapsed = Math.max(0, Date.now() - lastEditAtRef.current);
    autoSaveTimerRef.current = window.setTimeout(() => {
      autoSaveTimerRef.current = null;
      void persistCurrentDraft();
    }, Math.max(0, 1200 - elapsed));
    return clearAutoSaveTimer;
  }, [clearAutoSaveTimer, dirtyTick, document, draft, loading, persistCurrentDraft, saveState]);

  const handleSave = useCallback(() => {
    void persistCurrentDraft(true);
  }, [persistCurrentDraft]);

  const reloadCloudProject = useCallback(async () => {
    if (conflictActionRef.current) return;
    const conflictSession = conflictSessionRef.current;
    conflictActionRef.current = "reload";
    setConflictAction("reload");
    clearAutoSaveTimer();
    const requestId = activeRequestRef.current + 1;
    activeRequestRef.current = requestId;
    const generation = projectGenerationRef.current + 1;
    projectGenerationRef.current = generation;
    assetUploadVersionRef.current.source += 1;
    assetUploadVersionRef.current.reference += 1;
    savingRef.current = false;
    try {
      const item = await fetchBeadProject(projectId);
      if (
        requestId !== activeRequestRef.current
        || generation !== projectGenerationRef.current
        || conflictSession !== conflictSessionRef.current
        || conflictActionRef.current !== "reload"
      ) return;
      const project = documentToWorkbenchProject(item);
      documentRef.current = item;
      draftRef.current = project;
      editVersionRef.current = 0;
      savedVersionRef.current = 0;
      lastEditAtRef.current = 0;
      autoSavePausedRef.current = false;
      setPendingAssets([]);
      setDocument(item);
      setDraft(project);
      setWorkbenchInstance((current) => current + 1);
      setSaveState("saved");
      conflictActionRef.current = null;
      setConflictAction(null);
      setConflictOpen(false);
      restoreProjectAssets(item, generation);
      toast.success("已重新加载云端工程");
    } catch (error) {
      if (
        generation === projectGenerationRef.current
        && conflictSession === conflictSessionRef.current
        && conflictActionRef.current === "reload"
      ) {
        conflictActionRef.current = null;
        setConflictAction(null);
        toast.error(error instanceof Error ? error.message : "重新加载工程失败");
      }
    }
  }, [clearAutoSaveTimer, projectId, restoreProjectAssets]);

  const saveLocalCopy = useCallback(async () => {
    const currentDocument = documentRef.current;
    const currentDraft = draftRef.current;
    if (!currentDocument || !currentDraft || conflictActionRef.current) return;
    const conflictSession = conflictSessionRef.current;
    const projectGeneration = projectGenerationRef.current;
    conflictActionRef.current = "copy";
    setConflictAction("copy");
    try {
      const created = await createBeadProject(
        workbenchProjectToDocument(currentDraft, currentDocument),
      );
      if (
        conflictSession !== conflictSessionRef.current
        || projectGeneration !== projectGenerationRef.current
        || conflictActionRef.current !== "copy"
      ) return;
      conflictActionRef.current = null;
      setConflictAction(null);
      setConflictOpen(false);
      navigate(`/beads/${created.id}`, { replace: true });
      toast.success("已将本地内容另存为新工程");
    } catch (error) {
      if (
        conflictSession === conflictSessionRef.current
        && projectGeneration === projectGenerationRef.current
        && conflictActionRef.current === "copy"
      ) {
        conflictActionRef.current = null;
        setConflictAction(null);
        toast.error(error instanceof Error ? error.message : "另存工程失败");
      }
    }
  }, [navigate]);

  const selectAsset = useCallback((kind: BeadAssetKind, selection: BeadAssetSelection, projectGeneration: number) => {
    if (projectGeneration !== projectGenerationRef.current) return;
    assetUploadVersionRef.current[kind] += 1;
    updateAssetReference(kind, selection.reference);
    queuePendingAsset({ ...selection, kind });
  }, [queuePendingAsset, updateAssetReference]);

  const uploadLocalAsset = useCallback(async (kind: BeadAssetKind, file: File) => {
    const projectGeneration = projectGenerationRef.current;
    const uploadVersion = assetUploadVersionRef.current[kind] + 1;
    assetUploadVersionRef.current[kind] = uploadVersion;
    clearAssetReference(kind);
    try {
      const uploaded = await uploadManagedImages([file], "private");
      if (
        projectGeneration !== projectGenerationRef.current
        || uploadVersion !== assetUploadVersionRef.current[kind]
      ) {
        return true;
      }
      const item = uploaded[0];
      if (!item) throw new Error("上传图片失败");
      updateAssetReference(kind, {
        path: item.path,
        name: item.name || file.name,
        scope: "mine",
      });
      toast.success(`${kind === "source" ? "转换原图" : "参考图"}已同步到个人素材库`);
      return true;
    } catch (error) {
      if (
        projectGeneration !== projectGenerationRef.current
        || uploadVersion !== assetUploadVersionRef.current[kind]
      ) {
        return true;
      }
      toast.error(error instanceof Error ? `${error.message}，当前图片未同步，无法跨设备恢复` : "图片未同步，无法跨设备恢复");
      return false;
    }
  }, [clearAssetReference, updateAssetReference]);

  const saveExportToLibrary = useCallback(async (files: Array<{ name: string; blob: Blob }>) => {
    try {
      const uploaded = await uploadManagedImages(
        files.map((file) => new File([file.blob], file.name, { type: "image/png" })),
        "private",
      );
      toast.success(`已保存 ${uploaded.length} 张 PNG 到个人素材库`);
    } catch (error) {
      toast.error(error instanceof Error ? `PNG 已下载，但保存素材库失败：${error.message}` : "PNG 已下载，但保存素材库失败");
    }
  }, []);

  const handleImport = useCallback(
    async (project: BeadProject) => {
      if (!document) return;
      try {
        const created = await createBeadProject(
          workbenchProjectToDocument(project, {
            ...document,
            source_image: undefined,
            reference_image: undefined,
          }),
        );
        toast.success("已导入为新工程");
        navigate(`/beads/${created.id}`, { replace: true });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "导入工程失败");
      }
    },
    [document, navigate],
  );

  if (loading || !document || !draft) {
    return <div className="grid h-full place-items-center bg-background text-sm text-muted-foreground">正在加载工作台</div>;
  }

  const pickerProjectGeneration = projectGenerationRef.current;

  return (
    <div className="beads-workbench h-full min-h-0 overflow-hidden">
      <WorkbenchApp
        key={`${document.id}:${workbenchInstance}`}
        initialProject={draft}
        saveState={saveState}
        onProjectChange={handleChange}
        onSave={handleSave}
        onImport={handleImport}
        onBack={() => navigate("/beads")}
        onOpenAssetPicker={canReadImages ? setAssetPickerKind : undefined}
        onUploadLocalAsset={canUploadImages ? uploadLocalAsset : undefined}
        pendingAssets={pendingAssets}
        onSaveExportToLibrary={canUploadImages ? saveExportToLibrary : undefined}
      />
      <BeadAssetPicker
        open={Boolean(assetPickerKind)}
        kind={assetPickerKind ?? "source"}
        canUseTeamAssets={canReadImages}
        canUploadImages={canUploadImages}
        onOpenChange={(open) => !open && setAssetPickerKind(null)}
        onSelect={(selection) => {
          if (assetPickerKind) selectAsset(assetPickerKind, selection, pickerProjectGeneration);
        }}
      />
      <Dialog
        open={conflictOpen}
        onOpenChange={(open) => {
          if (!open && !conflictActionRef.current) {
            conflictSessionRef.current += 1;
            setConflictOpen(false);
          }
        }}
      >
        <DialogContent showCloseButton={false} className="rounded-lg">
          <DialogHeader>
            <DialogTitle>工程保存冲突</DialogTitle>
            <DialogDescription>
              云端工程已在其他设备或标签页更新。请选择保留云端内容，或将当前本地修改另存为新工程。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              variant="outline"
              disabled={Boolean(conflictAction)}
              onClick={() => {
                conflictSessionRef.current += 1;
                setConflictOpen(false);
              }}
            >
              取消
            </Button>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" disabled={Boolean(conflictAction)} onClick={() => void reloadCloudProject()}>
                {conflictAction === "reload" ? "正在重新加载" : "重新加载云端"}
              </Button>
              <Button disabled={Boolean(conflictAction)} onClick={() => void saveLocalCopy()}>
                {conflictAction === "copy" ? "正在另存副本" : "将本地内容另存副本"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function BeadsPage() {
  const { projectId } = useParams();
  const { isCheckingAuth, session } = useAuthGuard(undefined, "/beads");
  const normalizedId = useMemo(() => projectId?.trim() ?? "", [projectId]);
  if (isCheckingAuth || !session) {
    return <div className="grid h-full place-items-center bg-background text-sm text-muted-foreground">正在验证登录状态</div>;
  }
  const canReadImages = hasAPIPermission(session, "GET", "/api/images");
  const canUploadImages = hasAPIPermission(session, "POST", "/api/images/uploads");
  return normalizedId ? (
    <WorkbenchPage
      projectId={normalizedId}
      canReadImages={canReadImages}
      canUploadImages={canUploadImages}
    />
  ) : <ProjectsPage />;
}
