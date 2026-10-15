import { useCallback, useEffect, useRef, useState } from "react";
import { Gamepad2, Download, Check, ImagePlus, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AuthenticatedImage } from "@/components/authenticated-image";
import { ImageModelSettingsButton } from "@/components/image-model-settings-button";
import { useAuthGuard } from "@/lib/use-auth-guard";
import { fetchCanvasModels, fetchManagedImages, fetchManagedImageDetail, imageReferenceInputLimitForCount, canvasModelHasCapability, isImageCreationModel, cancelCreationTask, type CanvasModelOption, type ManagedImageSummary } from "@/lib/api";
import { IMAGE_ARENA_MODEL_IDS } from "@/lib/image-arena/image-arena-model-capabilities";
import { fetchAuthenticatedImageBlob } from "@/lib/authenticated-image";
import { DEFAULT_CROP, DESIGNS, SLOTS, activeStatus, canApproveHero, parseDraft, safeName } from "@/lib/game-promo/core";
import { downloadPromoBlob, exportPromoCrop, fileDataURL } from "@/lib/game-promo/export";
import { selectedVersion, startPromoBatch, startPromoPolling, stopPromoBatch, submitPromoTask } from "@/lib/game-promo/tasks";
import { activePromoBatch, promoBatchProgress, promoProjectWorking } from "@/lib/game-promo/batch";
import { buildZipBlob } from "@/lib/zip";
import { capturePromoScope, clonePromoProject, listPromoProjects, mutatePromoProjects, newPromoProject, promoID, updatePromoProject, type PromoProject } from "@/store/game-promo-projects";
import { ClickablePromoImage, CropPreview } from "./crop-preview";
import { MobileProjectDrawer, ProjectSidebar } from "./project-sidebar";
import { ApplicationPanel } from "./application-panel";

const statusLabels: Record<string, string> = { submitting: "正在提交", queued: "排队中", running: "生成中", success: "已完成", error: "失败", cancelled: "已取消" };
export default function GamePromoPage() {
  const { session, isCheckingAuth } = useAuthGuard(undefined, "/image");
  const [scope, setScope] = useState("");
  const scopeRef = useRef("");
  const [projects, setProjects] = useState<PromoProject[]>([]);
  const [selected, setSelected] = useState("");
  const [models, setModels] = useState<CanvasModelOption[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [library, setLibrary] = useState<ManagedImageSummary[] | null>(null);
  const [libraryPage, setLibraryPage] = useState(1);
  const [libraryCursors, setLibraryCursors] = useState<string[]>([""]);
  const [libraryHasMore, setLibraryHasMore] = useState(false);
  const [format, setFormat] = useState<"png" | "jpeg">("png");
  const [corrections, setCorrections] = useState<Record<string, string>>({});
  const [batchCorrections, setBatchCorrections] = useState<Record<string, string>>({});
  const [applicationPreviewHost, setApplicationPreviewHost] = useState<HTMLElement | null>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const libraryRequest = useRef(0);
  const project = projects.find((p) => p.id === selected);
  const refresh = useCallback(async (owner: string) => {
    const next = await listPromoProjects(owner);
    if (scopeRef.current === owner) setProjects(next);
  }, []);
  useEffect(() => {
    let live = true;
    scopeRef.current = ""; setScope(""); setProjects([]); setSelected(""); setLibrary(null);
    if (!session?.subjectId) return;
    void capturePromoScope().then(async (owner) => {
      if (!live) return;
      scopeRef.current = owner; setScope(owner);
      let next = await listPromoProjects(owner);
      if (!next.length) {
        const created = newPromoProject();
        await mutatePromoProjects(owner, (items) => ({ items: [...items, created], result: undefined }));
        next = await listPromoProjects(owner);
      }
      if (live) { setProjects(next); setSelected(next[0]?.id || ""); }
    }).catch((e) => live && setError(String(e)));
    void fetchCanvasModels().then((next) => live && setModels(next)).catch((e) => live && setError(String(e)));
    return () => { live = false; scopeRef.current = ""; };
  }, [session?.subjectId, session?.provider, session?.role]);
  useEffect(() => scope ? startPromoPolling(scope, () => refresh(scope), setError) : undefined, [scope, refresh]);
  async function run(operation: () => Promise<unknown>, blocking = false) {
    const owner = scope;
    setError(""); if (blocking) setBusy(true);
    try { await operation(); await refresh(owner); }
    catch (e) { if (scopeRef.current === owner) setError(e instanceof Error ? e.message : String(e)); await refresh(owner).catch(() => undefined); }
    finally { if (blocking) setBusy(false); }
  }
  function change(changeProject: (p: PromoProject) => PromoProject, invalidate = false) {
    if (!project || !scope) return;
    const id = project.id;
    const apply = (p: PromoProject) => { const next = changeProject(p); return invalidate ? { ...next, copyConfirmed: false, heroApproved: undefined } : next; };
    setProjects((items) => items.map((p) => p.id === id ? apply(p) : p));
    void run(() => updatePromoProject(scope, id, apply));
  }
  const available = (kind: "chat" | "image") => models.filter((m) => m.enabled !== false &&
    (m.group_modes?.length ? m.group_modes.includes(kind) : canvasModelHasCapability(m, kind) || m.kind === kind || m.kind === "both") &&
    (kind !== "image" || isImageCreationModel(m.id) && (IMAGE_ARENA_MODEL_IDS as readonly string[]).includes(m.id)));
  async function addReferences(files: File[], owner: string, id: string) {
    if (files.some((f) => !/^image\/(png|jpeg|webp)$/.test(f.type))) throw new Error("仅支持 PNG、JPEG、WebP 图片");
    const references = await Promise.all(files.map(async (file) => ({ id: promoID(), name: file.name, source: await fileDataURL(file), purpose: "场景 / 风格 / 布局 / Logo（请填写用途）" })));
    await updatePromoProject(owner, id, (p) => {
      if (p.references.length + references.length > imageReferenceInputLimitForCount(p.imageModel, 1) - 1) throw new Error("超过参考图上限；后续设计需预留一张已确认主图，不会自动丢弃参考图");
      return { ...p, references: [...p.references, ...references], copyConfirmed: false, heroApproved: undefined };
    });
  }
  async function exportSlot(slot: typeof SLOTS[number], p: PromoProject) {
    const version = selectedVersion(p, slot.design);
    if (!version?.source || version.status !== "success") throw new Error(`${slot.name} 尚未完成`);
    return { name: `${slot.id}-${safeName(slot.name)}-${slot.width}x${slot.height}.${format === "jpeg" ? "jpg" : "png"}`,
      blob: await exportPromoCrop(version.source, slot.width, slot.height, p.crops[slot.id] || DEFAULT_CROP, format), updatedAt: p.updatedAt };
  }
  async function openLibrary(page = 1) {
    const owner = scope, id = selected, requestID = ++libraryRequest.current;
    const result = await fetchManagedImages({ scope: "mine", page_size: 24, cursor: page === 1 ? "" : libraryCursors[page - 1] });
    if (scopeRef.current !== owner || selectedRef.current !== id || libraryRequest.current !== requestID) return;
    setLibrary(result.items); setLibraryPage(page); setLibraryHasMore(result.has_more);
    setLibraryCursors((current) => [...(page === 1 ? [""] : current.slice(0, page)), result.next_cursor]);
  }
  function selectProject(id: string) {
    setSelected(id); setCorrections({}); setLibrary(null); libraryRequest.current++;
  }
  const sidebarProps = {
    projects, selected, busy,
    onSelect: selectProject,
    onCreate: () => void run(async () => {
      const owner = scope, p = newPromoProject();
      await mutatePromoProjects(owner, (items) => ({ items: [...items, p], result: undefined }));
      if (scopeRef.current === owner) selectProject(p.id);
    }, true),
    onCopy: (original: PromoProject) => void run(async () => {
      const owner = scope, p = clonePromoProject(original);
      await mutatePromoProjects(owner, (items) => ({ items: [...items, p], result: undefined }));
      if (scopeRef.current === owner) selectProject(p.id);
    }, true),
    onDelete: (original: PromoProject) => {
      if (!window.confirm(`删除“${original.title}”及本地历史？服务端任务不会因此取消。`)) return;
      void run(async () => {
        const owner = scope;
        await mutatePromoProjects(owner, (items) => {
          const remaining = items.filter((p) => p.id !== original.id);
          return { items: remaining.length ? remaining : [newPromoProject()], result: undefined };
        });
        const rest = await listPromoProjects(owner);
        if (scopeRef.current === owner && selectedRef.current === original.id) selectProject(rest[0].id);
      }, true);
    },
    onRename: (id: string, title: string) => void run(() => updatePromoProject(scope, id, (p) =>
      p.title === title ? p : { ...p, title, copyConfirmed: false, heroApproved: undefined })),
  };
  if (isCheckingAuth || !scope || !project) return <div className="p-6">{error || "正在加载游戏推广项目…"}</div>;
  const activeBatch = activePromoBatch(project);
  const batch = project.batches?.at(-1);
  const batchProgress = batch ? promoBatchProgress(project, batch) : undefined;
  const batchLabels = { running: "生成中", "awaiting-hero": "等待确认本批主图", completed: "已完成", failed: "已结束，存在失败", stopped: "已停止" };
  const missing = SLOTS.filter((s) => !canApproveHero(selectedVersion(project, s.design)));
  const previewGroups = SLOTS.reduce<Array<{ key: string; slots: Array<typeof SLOTS[number]> }>>((groups, slot) => {
    const key = `${slot.width}x${slot.height}:${slot.design.startsWith("carousel-") ? slot.design : "shared"}`;
    const group = groups.find((candidate) => candidate.key === key);
    if (group) group.slots.push(slot);
    else groups.push({ key, slots: [slot] });
    return groups;
  }, []);
  return <main className="relative flex h-full min-h-0 overflow-hidden bg-background">
    <ProjectSidebar {...sidebarProps} />
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-3 py-3 sm:px-5">
      <div className="min-w-0"><h1 className="flex items-center gap-2 text-xl font-semibold"><Gamepad2 className="size-6" />游戏推广套图</h1><p className="text-sm text-muted-foreground">确认文案 → 确认主图 → 九张设计 · 十六个精确尺寸文件</p></div>
      <MobileProjectDrawer {...sidebarProps} />
      <div className="flex items-center gap-2"><select aria-label="导出格式" className="rounded border bg-background p-2" value={format} onChange={(e) => setFormat(e.target.value as "png" | "jpeg")}><option value="png">PNG</option><option value="jpeg">JPEG</option></select>
        <Button disabled={busy || missing.length === 16} onClick={() => void run(async () => {
          const p = structuredClone(project);
          const files = [];
          for (const slot of SLOTS.filter((s) => canApproveHero(selectedVersion(p, s.design)))) files.push(await exportSlot(slot, p));
          downloadPromoBlob(await buildZipBlob(files), `${safeName(p.title)}-${files.length}张.zip`);
        }, true)}><Download className="size-4" />{busy ? "处理中…" : `导出 ZIP (${16 - missing.length}/16)`}</Button></div>
    </header>
    {error ? <div role="alert" className="mx-3 mt-3 rounded border border-destructive bg-destructive/10 p-3 text-sm text-destructive sm:mx-5">{error}</div> : null}
    <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] overflow-hidden max-xl:flex max-xl:flex-col max-xl:overflow-y-auto">
    <section aria-label="游戏推广编辑内容" className="hide-scrollbar min-h-0 space-y-4 overflow-y-auto border-r p-3 sm:p-5 max-xl:flex-none max-xl:min-h-max max-xl:overflow-visible max-xl:border-r-0 max-xl:border-b">
    <div className="space-y-4">
      <aside className="min-w-0 space-y-4 rounded-xl border p-4">
        <div><h2 className="font-semibold">游戏资料与输入</h2><p className="mt-1 text-xs text-muted-foreground">当前项目：{project.title || "未命名游戏推广"}</p></div>
        <label className="block space-y-1 text-sm">游戏名称<Input value={project.title} onChange={(e) => change((p) => ({ ...p, title: e.target.value }), true)} /></label>
        <label className="block space-y-1 text-sm">游戏介绍与卖点<Textarea value={project.facts} placeholder="介绍玩法、角色、平台和已确认的游戏特色…" onChange={(e) => change((p) => ({ ...p, facts: e.target.value }), true)} /></label>
        <label className="block space-y-1 text-sm">活动信息<Textarea value={project.activity} placeholder="填写已确认的活动、时间和奖励；没有可留空" onChange={(e) => change((p) => ({ ...p, activity: e.target.value }), true)} /></label>
        <label className="block space-y-1 text-sm">文案模型<select className="w-full rounded border bg-background p-2" value={project.chatModel} onChange={(e) => change((p) => ({ ...p, chatModel: e.target.value }))}>{!available("chat").some((m) => m.id === project.chatModel) ? <option value={project.chatModel} disabled>请选择可用模型（{project.chatModel} 不可用）</option> : null}{available("chat").map((m) => <option key={m.id} value={m.id}>{m.name || m.id}</option>)}</select></label>
        <label className="block space-y-1 text-sm">支持参考图的图片模型<select className="w-full rounded border bg-background p-2" value={project.imageModel} onChange={(e) => change((p) => ({ ...p, imageModel: e.target.value }))}>{!available("image").some((m) => m.id === project.imageModel) ? <option value={project.imageModel} disabled>请选择可用模型（{project.imageModel} 不可用）</option> : null}{available("image").map((m) => <option key={m.id} value={m.id}>{m.name || m.id}</option>)}</select></label>
        {!available("chat").some((m) => m.id === project.chatModel) ? <p className="text-xs text-destructive">当前文案模型 {project.chatModel} 不在可用目录中，请选择可用文案模型；没有可用模型时可手动填写文案。</p> : null}
        {!available("image").some((m) => m.id === project.imageModel) ? <p className="text-xs text-destructive">当前图片模型 {project.imageModel} 不在可用目录中，请选择支持参考图的模型；没有可用模型时不能提交生图。</p> : null}
        <ImageModelSettingsButton model={project.imageModel} value={project.settings} onChange={(settings) => change((p) => ({ ...p, settings }))} />
        <p className="text-xs text-muted-foreground">最多 {imageReferenceInputLimitForCount(project.imageModel, 1) - 1} 张参考图，另预留一张已确认主图。生成使用模型画幅，最终按槽位裁剪。</p>
        <h3 className="font-semibold">参考图与用途</h3>
        <div className="flex flex-wrap gap-2"><label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-3 py-2 text-sm"><ImagePlus className="size-4" />上传多图<input type="file" multiple accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { const files = Array.from(e.target.files || []); void run(() => addReferences(files, scope, project.id), true); e.target.value = ""; }} /></label><Button variant="outline" onClick={() => void run(() => openLibrary(), true)}>素材库原图</Button></div>
        {library ? <div className="space-y-2 rounded border p-2"><div className="flex justify-between"><span className="text-sm">个人素材 · 第{libraryPage}页</span><button onClick={() => setLibrary(null)}>关闭</button></div><div className="grid grid-cols-3 gap-2">{library.map((item) => <button disabled={busy} key={item.path} title={item.name} onClick={() => void run(async () => {
          const owner = scope, id = project.id;
          const detail = await fetchManagedImageDetail(item.path, { scope: "mine" });
          if (!detail.url) throw new Error("素材原图不可用，不能使用缩略图替代");
          const blob = await fetchAuthenticatedImageBlob(detail.url);
          await addReferences([new File([blob], detail.name || "reference.png", { type: blob.type })], owner, id);
        }, true)}><AuthenticatedImage src={item.thumbnail_url || item.preview_url || ""} alt={item.name} className="aspect-square w-full object-cover" /></button>)}</div><div className="flex gap-2"><Button size="sm" disabled={libraryPage <= 1 || busy} onClick={() => void run(() => openLibrary(libraryPage - 1), true)}>上一页</Button><Button size="sm" disabled={!libraryHasMore || busy} onClick={() => void run(() => openLibrary(libraryPage + 1), true)}>下一页</Button></div></div> : null}
        {project.references.map((r) => <div key={r.id} className="rounded border p-2"><AuthenticatedImage src={r.source} alt={r.name} className="h-20 w-full object-contain" /><p className="truncate text-xs">{r.name}</p><Input aria-label={`${r.name}用途`} value={r.purpose} onChange={(e) => change((p) => ({ ...p, references: p.references.map((v) => v.id === r.id ? { ...v, purpose: e.target.value } : v) }), true)} /><Button size="sm" variant="ghost" onClick={() => change((p) => ({ ...p, references: p.references.filter((v) => v.id !== r.id) }), true)}>移除</Button></div>)}
        </aside>
      </div>
      <section className="min-w-0 space-y-4">
        <div className="space-y-3 rounded-xl border p-4"><h2 className="font-semibold">推广文案</h2><Button disabled={busy || Boolean(activeBatch) || promoProjectWorking(project) || !project.facts.trim() || !available("chat").some((m) => m.id === project.chatModel)} onClick={() => void run(() => submitPromoTask(scope, project.id), true)}>{activeStatus(project.copyTask?.status) ? "文案生成中…" : "AI 生成宣传文案"}</Button>
          {project.copyTask?.error ? <p className="text-sm text-destructive">{project.copyTask.error}</p> : null}
          {activeStatus(project.copyTask?.status) && project.copyTask?.taskId ? <Button size="sm" variant="outline" onClick={() => void run(() => cancelCreationTask(project.copyTask!.taskId!))}>取消文案任务</Button> : null}
          {(project.copyHistory?.length || project.copyTask?.textResponse) ? <details className="rounded border p-2 text-xs"><summary className="cursor-pointer">文案历史与原始返回</summary>{[...(project.copyHistory || []), ...(project.copyTask ? [project.copyTask] : [])].map((v, i) => <div key={v.id} className="mt-2 space-y-1 border-t pt-2"><p>版本{i + 1} · {statusLabels[v.status]} · {new Date(v.createdAt).toLocaleString()}</p><pre className="max-h-32 overflow-auto whitespace-pre-wrap">{v.textResponse || v.error || "等待返回"}</pre>{v.textResponse ? <Button size="sm" variant="outline" onClick={() => { try { const draft = parseDraft(v.textResponse!); change((p) => ({ ...p, draft }), true); } catch (e) { setError(String(e)); } }}>使用此文案（需重新确认）</Button> : null}</div>)}</details> : null}
          <Input aria-label="推广标题" placeholder="推广标题" value={project.draft.title} onChange={(e) => change((p) => ({ ...p, draft: { ...p.draft, title: e.target.value } }), true)} />
          <Textarea aria-label="短卖点" placeholder="短卖点" value={project.draft.sellingPoint} onChange={(e) => change((p) => ({ ...p, draft: { ...p.draft, sellingPoint: e.target.value } }), true)} />
          {project.draft.carousel.map((c, i) => <div key={i} className="grid gap-2 sm:grid-cols-2"><Input aria-label={`轮播${i + 1}主题`} placeholder={`轮播${i + 1}主题`} value={c.theme} onChange={(e) => change((p) => ({ ...p, draft: { ...p.draft, carousel: p.draft.carousel.map((v, j) => j === i ? { ...v, theme: e.target.value } : v) } }), true)} /><Input aria-label={`轮播${i + 1}文案`} placeholder="轮播文案" value={c.copy} onChange={(e) => change((p) => ({ ...p, draft: { ...p.draft, carousel: p.draft.carousel.map((v, j) => j === i ? { ...v, copy: e.target.value } : v) } }), true)} /></div>)}
          <Button variant={project.copyConfirmed ? "outline" : "default"} disabled={activeStatus(project.copyTask?.status)} onClick={() => { try { parseDraft(JSON.stringify(project.draft)); change((p) => ({ ...p, copyConfirmed: true })); } catch (e) { setError(String(e)); } }}><Check className="size-4" />{project.copyConfirmed ? "文案已确认" : "确认文案"}</Button>
        </div>
        <div className="space-y-3 rounded-xl border p-4" aria-label="批量生成设计">
          <h2 className="font-semibold">批量生成设计</h2>
          <label className="block space-y-1 text-sm">整套修改要求<Textarea aria-label="整套修改要求" value={batchCorrections[project.id] || ""} placeholder="统一调整画风、布局、文字或角色；本批全部目标使用相同要求" onChange={(e) => setBatchCorrections((current) => ({ ...current, [project.id]: e.target.value }))} /></label>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || Boolean(activeBatch) || promoProjectWorking(project) || !project.copyConfirmed || !available("image").some((m) => m.id === project.imageModel)} onClick={() => void run(() => startPromoBatch(scope, project.id, "missing", batchCorrections[project.id] || ""), true)}>生成缺失设计</Button>
            <Button variant="outline" disabled={busy || Boolean(activeBatch) || promoProjectWorking(project) || !project.copyConfirmed || !available("image").some((m) => m.id === project.imageModel)} onClick={() => void run(() => startPromoBatch(scope, project.id, "regenerate", batchCorrections[project.id] || ""), true)}>按新要求重生成整套</Button>
            {activeBatch ? <Button variant="outline" onClick={() => void run(() => stopPromoBatch(scope, project.id, activeBatch.id))}>停止后续生成</Button> : null}
          </div>
          <p className="text-xs text-muted-foreground">缺失模式只补未完成设计。整套重生成先生成新主图，明确确认本批主图后自动生成其余八张；所有旧版本保留。停止仅阻止后续提交，已提交任务可在卡片中取消。</p>
          {batch && batchProgress ? <div role="status" className="space-y-2 rounded border bg-muted/30 p-3 text-sm">
            <p>{batch.mode === "missing" ? "生成缺失设计" : "整套重生成"} · {batchLabels[batch.status]} · 已完成 {batchProgress.completed}/{batchProgress.total} · 进行中 {batchProgress.active} · 失败 {batchProgress.failed}</p>
            <p className="text-xs text-muted-foreground">本批修改要求：{batch.correction || "无"}</p>
            {batch.status === "awaiting-hero" ? <p>请在主视觉卡片选择并确认本批主图；确认后自动继续，无需逐张点击。</p> : null}
            {batch.error ? <p className="text-destructive">{batch.error}</p> : null}
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">{batch.targets.map((target) => {
              const v = project.versions[target.design]?.find((item) => item.id === target.versionID);
              return <span key={target.design}>{DESIGNS.find((d) => d.id === target.design)?.name}：{v ? statusLabels[v.status] || v.status : batch.status === "stopped" || batch.status === "failed" ? "未提交" : "等待提交"}</span>;
            })}</div>
          </div> : null}
          {(project.batches?.length || 0) > 1 ? <details className="rounded border p-2 text-xs"><summary className="cursor-pointer">历史批次</summary>{project.batches!.slice(0, -1).map((previous) => {
            const progress = promoBatchProgress(project, previous);
            return <p key={previous.id} className="mt-2">{new Date(previous.createdAt).toLocaleString()} · {previous.mode === "missing" ? "生成缺失设计" : "整套重生成"} · {batchLabels[previous.status]} · {progress.completed}/{progress.total} · 修改要求：{previous.correction || "无"}{previous.error ? ` · ${previous.error}` : ""}</p>;
          })}</details> : null}
        </div>
      </section>
      <ApplicationPanel key={`${scope}:${project.id}`} project={project} scope={scope} onChange={change} refresh={() => refresh(scope)} chatAvailable={available("chat").some((m) => m.id === project.chatModel)} imageAvailable={available("image").some((m) => m.id === project.imageModel)} previewHost={applicationPreviewHost} />
    </section>
    <section aria-label="游戏推广预览" className="hide-scrollbar min-h-0 space-y-4 overflow-y-auto p-3 sm:p-5 max-xl:flex-none max-xl:min-h-max max-xl:overflow-visible">
        <div className="grid min-w-0 gap-3 @min-[1060px]:grid-cols-2">{DESIGNS.map((design) => {
          const version = selectedVersion(project, design.id);
          const working = project.versions[design.id]?.some((v) => activeStatus(v.status));
          return <article key={design.id} className="min-w-0 space-y-3 rounded-xl border p-4"><div className="flex justify-between gap-2"><h3 className="font-semibold">{design.name}</h3><span className="text-xs text-muted-foreground">{statusLabels[version?.status || ""] || "待生成"}</span></div>
            {version?.source ? <ClickablePromoImage source={version.source} alt={design.name} className="max-h-64 w-full rounded object-contain" /> : <div className="grid h-32 place-items-center rounded bg-muted text-sm text-muted-foreground">{working ? <LoaderCircle className="animate-spin" /> : "待生成"}</div>}
            {version?.error ? <p className="text-xs text-destructive">{version.error}</p> : null}
            <select aria-label={`${design.name}历史版本`} className="w-full rounded border bg-background p-2 text-xs" value={project.selected[design.id] || ""} onChange={(e) => change((p) => ({ ...p, selected: { ...p.selected, [design.id]: e.target.value }, heroApproved: design.id === "hero" ? undefined : p.heroApproved }))}><option value="" disabled>历史版本</option>{(project.versions[design.id] || []).map((v, i) => <option key={v.id} value={v.id}>v{i + 1} · {statusLabels[v.status]} · {new Date(v.createdAt).toLocaleString()}</option>)}</select>
            <Input aria-label={`${design.name}修正要求`} placeholder="修改要求" value={corrections[design.id] || ""} onChange={(e) => setCorrections((current) => ({ ...current, [design.id]: e.target.value }))} />
            <div className="flex flex-wrap gap-1.5"><Button size="sm" disabled={busy || Boolean(activeBatch) || promoProjectWorking(project) || !project.copyConfirmed || design.id !== "hero" && !project.heroApproved || !available("image").some((m) => m.id === project.imageModel)} onClick={() => void run(() => submitPromoTask(scope, project.id, design.id, corrections[design.id]), true)}>{version ? "重生成" : design.id === "hero" ? "生成主图" : "生成"}</Button>
              {design.id === "hero" ? <Button size="sm" variant="outline" disabled={!project.copyConfirmed || !canApproveHero(version) || Boolean(activeBatch && activeBatch.heroVersionID !== version?.id)} onClick={() => change((p) => ({ ...p, heroApproved: version!.id }))}>{project.heroApproved === version?.id && version ? "已确认" : "确认主图"}</Button> : null}
              {working ? <Button size="sm" variant="outline" onClick={() => void run(async () => { const active = project.versions[design.id].find((v) => activeStatus(v.status)); if (active?.taskId) await cancelCreationTask(active.taskId); })}>取消</Button> : null}
              <label className="cursor-pointer rounded border px-2 py-1 text-xs">换图<input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => {
                const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
                const owner = scope, id = project.id;
                void run(async () => {
                  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("不支持此图片类型");
                  const source = await fileDataURL(file), versionID = promoID();
                  await updatePromoProject(owner, id, (p) => ({ ...p, versions: { ...p.versions, [design.id]: [...(p.versions[design.id] || []), { id: versionID, status: "success", source, prompt: "用户上传替换", createdAt: new Date().toISOString() }] }, selected: { ...p.selected, [design.id]: versionID }, heroApproved: design.id === "hero" ? undefined : p.heroApproved }));
                }, true);
              }} /></label></div>
          </article>;
        })}</div>
    <div ref={setApplicationPreviewHost} className="min-h-0 min-w-0 space-y-4" />
    <section aria-labelledby="game-promo-gallery-heading" className="min-w-0 rounded-xl border bg-muted/20 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div><h2 id="game-promo-gallery-heading" className="font-semibold">尺寸预览</h2><p className="text-xs text-muted-foreground">拖动裁剪 · 按尺寸导出</p></div>
        <p className="text-xs text-muted-foreground" title={missing.map((s) => s.name).join("、")}>完成 {16 - missing.length}/16{missing.length ? ` · 缺 ${missing.length}` : ""}</p>
      </div>
      <div className="columns-1 gap-3 @min-[520px]:columns-2 @min-[900px]:columns-3 @min-[1260px]:columns-4">
        {previewGroups.map(({ key, slots }) => {
          const slot = slots[0];
          const version = selectedVersion(project, slot.design);
          const designName = DESIGNS.find((d) => d.id === slot.design)?.name;
          return <article key={key} className="mb-3 break-inside-avoid space-y-2 rounded-xl border bg-background p-3">
            <div className="flex justify-between gap-2 text-sm"><span>{slots.length > 1 ? `共用 · ${slots.length} 个位置` : slot.name}</span><span className="shrink-0 text-muted-foreground">{slot.width}×{slot.height}</span></div>
            {canApproveHero(version) ? <CropPreview source={version!.source!} width={slot.width} height={slot.height} crop={project.crops[slot.id] || DEFAULT_CROP} onChange={(crop) => change((p) => ({ ...p, crops: { ...p.crops, ...Object.fromEntries(slots.map((item) => [item.id, crop])) } }))} /> : <div className="grid w-full place-items-center rounded bg-muted px-2 text-center text-xs text-muted-foreground" style={{ aspectRatio: `${slot.width}/${slot.height}` }}>缺少 {designName}</div>}
            {slots.length > 1 ? <p className="text-xs text-muted-foreground">{slots.map((item) => item.name).join(" · ")}</p> : null}
            <div className="flex flex-nowrap gap-1.5">{slots.map((item) => <Button key={item.id} size="icon" variant="outline" className="size-8 shrink-0" aria-label={`导出${item.name}`} title={`导出${item.name}`} disabled={busy || !canApproveHero(version)} onClick={() => void run(async () => { const file = await exportSlot(item, project); downloadPromoBlob(file.blob, file.name); }, true)}><Download className="size-4" /></Button>)}</div>
          </article>;
        })}
      </div>
    </section>
    </section>
    </div>
    </div>
  </main>;
}
