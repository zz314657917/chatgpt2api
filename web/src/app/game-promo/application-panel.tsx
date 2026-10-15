import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cancelCreationTask } from "@/lib/api";
import { APPLICATION_FIELDS, applicationConfirmation, applicationData, applicationInspection, applicationTXT, parseApplicationCopy, validateApplicationBytes, validateApplicationCopy, validateApplicationText, type PromoApplication } from "@/lib/game-promo/application";
import { activeStatus, DEFAULT_CROP, safeName } from "@/lib/game-promo/core";
import { downloadPromoBlob, exportPromoCrop, fileDataURL } from "@/lib/game-promo/export";
import { activePromoBatch, promoProjectWorking } from "@/lib/game-promo/batch";
import { submitApplicationTask } from "@/lib/game-promo/tasks";
import { capturePromoScope, inspectPromoProject, promoID, updatePromoProject, type PromoProject } from "@/store/game-promo-projects";
import { CropPreview } from "./crop-preview";

const statusLabels: Record<string, string> = { submitting: "正在提交/待查询", queued: "排队中", running: "生成中", success: "已完成", error: "失败", cancelled: "已取消" };
export function ApplicationPanel({ project, scope, onChange, refresh, chatAvailable, imageAvailable, previewHost }: {
  project: PromoProject; scope: string; onChange: (change: (p: PromoProject) => PromoProject) => void;
  refresh: () => Promise<void>; chatAvailable: boolean; imageAvailable: boolean;
  previewHost: HTMLElement | null;
}) {
  const a = applicationData(project);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [correction, setCorrection] = useState("");
  const [format, setFormat] = useState<"png" | "jpeg">("png");
  const [measurement, setMeasurement] = useState<{ key: string; bytes?: number; error?: string }>();
  const lifecycle = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    lifecycle.current = controller;
    return () => { controller.abort(); lifecycle.current = null; };
  }, [scope, project.id]);
  const version = a.banners.find((v) => v.id === a.selected);
  const inspection = applicationInspection(a);
  const measurementKey = `${inspection}:${format}`;
  useEffect(() => {
    let live = true;
    setMeasurement(undefined);
    if (version?.status !== "success" || !version.source) return;
    void exportPromoCrop(version.source, 1082, 300, a.crop, format).then((blob) => {
      if (!live) return;
      try { validateApplicationBytes(blob.size); setMeasurement({ key: measurementKey, bytes: blob.size }); }
      catch (e) { setMeasurement({ key: measurementKey, bytes: blob.size, error: String(e instanceof Error ? e.message : e) }); }
    }).catch((e) => live && setMeasurement({ key: measurementKey, error: String(e) }));
    return () => { live = false; };
  }, [version?.source, version?.status, a.crop, format, measurementKey]);
  function change(changeApplication: (data: PromoApplication) => PromoApplication) {
    onChange((p) => ({ ...p, application: changeApplication(applicationData(p)) }));
  }
  async function run(operation: (signal: AbortSignal) => Promise<unknown>) {
    const controller = lifecycle.current;
    if (!controller || busy) return;
    setError(""); setNotice(""); setBusy(true);
    try { await operation(controller.signal); }
    catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (!controller.signal.aborted) { setBusy(false); await refresh(); } }
  }
  const confirmed = a.confirmed === applicationConfirmation(project);
  const working = Boolean(activePromoBatch(project)) || promoProjectWorking(project);
  return <section aria-labelledby="application-materials-heading" className="mt-6 min-w-0 space-y-4 rounded-xl border-2 border-primary/30 bg-primary/5 p-3 sm:p-5">
    <div><h2 id="application-materials-heading" className="text-lg font-semibold">独立申请材料 · 文案与轮播图</h2><p className="text-sm text-muted-foreground">独立保存与导出，不计入原九张设计和十六槽 ZIP。仅准备申请材料，不代为提交，也不代表资格或审批结果。</p></div>
    {error ? <p role="alert" className="rounded border border-destructive p-2 text-sm text-destructive">{error}</p> : null}
    {notice ? <p role="status" className="text-sm">{notice}</p> : null}
    <p className="text-xs text-muted-foreground">复用游戏名称、游戏介绍、活动和参考图。展示周活动与更新请填写已确认的信息；未提供时文案会注明“未提供”。</p>
    <div className="grid gap-3 @min-[760px]:grid-cols-2">{APPLICATION_FIELDS.map(([key, label]) =>
      <label className="block space-y-1 text-sm" key={key}>{label} · 信息<Textarea aria-label={`${label}信息`} value={a.inputs[key]} placeholder={key === "weeklyActivity" ? "填写本周已确认的活动、联动和时间；没有可留空" : key === "weeklyUpdate" ? "填写本周已确认的更新；没有可留空" : "填写已确认的信息；没有可留空"}
        onChange={(e) => change((data) => ({ ...data, confirmed: undefined, inputs: { ...data.inputs, [key]: e.target.value } }))} /></label>)}</div>
    <div className="flex flex-wrap gap-2"><Button disabled={busy || working || !chatAvailable} onClick={() => void run((signal) => submitApplicationTask(scope, project.id, "copy", "", signal))}>AI 生成申请文案</Button>
      <Button variant="outline" onClick={() => downloadPromoBlob(new Blob([applicationTXT(a)], { type: "text/plain;charset=utf-8" }), `${safeName(project.title)}-申请文案.txt`)}>下载全部申请文案 TXT</Button></div>
    <div className="grid gap-3 @min-[760px]:grid-cols-2">{APPLICATION_FIELDS.map(([key, label]) =>
      <div className="space-y-1" key={key}><label className="block space-y-1 text-sm">{label} · 文案<Textarea aria-label={`${label}申请文案`} value={a.draft[key]} placeholder={key === "other" ? "可留空" : "文案会注明未提供的信息，可自行修改"} onChange={(e) => change((data) => ({ ...data, confirmed: undefined, draft: { ...data.draft, [key]: e.target.value } }))} /></label>
        <Button size="sm" variant="ghost" onClick={() => void run(async () => { await navigator.clipboard.writeText(a.draft[key]); setNotice(`已复制${label}`); })}>复制此项</Button></div>)}</div>
    <Button disabled={busy || a.copyVersions.some((v) => activeStatus(v.status))} variant={confirmed ? "outline" : "default"} onClick={() => {
      try {
        validateApplicationCopy(a.draft);
        change((data) => ({ ...data, confirmed: applicationConfirmation(project),
          headline: data.headline || (/[a-z]/i.test(project.title) ? "游戏特色展示" : project.title.slice(0, 28)),
          subtitle: data.subtitle || (/[a-z]/i.test(data.draft.features) ? "" : data.draft.features.slice(0, 60)) }));
      } catch (e) { setError(String(e instanceof Error ? e.message : e)); }
    }}>{confirmed ? "申请文案已确认" : "确认申请文案"}</Button>
    <details className="rounded border bg-background p-3 text-xs"><summary className="cursor-pointer">申请文案历史、提示词与原始返回（{a.copyVersions.length}）</summary>
      {a.copyVersions.map((v, i) => <div key={v.id} className="mt-2 space-y-2 border-t pt-2"><p>申请文案版本{i + 1} · {statusLabels[v.status]} · {new Date(v.createdAt).toLocaleString()}</p>
        {v.error ? <p className="text-destructive">{v.error}</p> : null}<pre className="max-h-40 overflow-auto whitespace-pre-wrap">{v.textResponse || "等待返回"}</pre>
        <details><summary>提示词快照 / 指纹</summary><pre className="max-h-40 overflow-auto whitespace-pre-wrap">{v.prompt}</pre><p className="break-all">任务：{v.taskId || "无活动任务"}；结果指纹：{v.resultFingerprint || "暂无"}</p></details>
        {v.resultFingerprint ? <Button size="sm" variant="outline" onClick={() => {
          try { const draft = parseApplicationCopy(v.resultFingerprint!); change((data) => ({ ...data, draft, confirmed: undefined, copySelected: v.id })); }
          catch (e) { setError(String(e)); }
        }}>使用此申请文案（需重新确认）</Button> : null}
        {v.taskId && activeStatus(v.status) ? <Button size="sm" variant="outline" onClick={() => void run(() => cancelCreationTask(v.taskId!))}>取消申请文案任务</Button> : null}
      </div>)}
    </details>
    {previewHost ? createPortal(<ApplicationPreview project={project} scope={scope} a={a} correction={correction} setCorrection={setCorrection} format={format} setFormat={setFormat} version={version} measurement={measurement} measurementKey={measurementKey} confirmed={confirmed} busy={busy} imageAvailable={imageAvailable} working={working} inspection={inspection} change={change} run={run} setError={setError} />, previewHost) : null}
  </section>;
}

function ApplicationPreview({ project, scope, a, correction, setCorrection, format, setFormat, version, measurement, measurementKey, confirmed, busy, imageAvailable, working, inspection, change, run, setError }: {
  project: PromoProject; scope: string; a: PromoApplication; correction: string; setCorrection: (value: string) => void;
  format: "png" | "jpeg"; setFormat: (value: "png" | "jpeg") => void;
  version: PromoApplication["banners"][number] | undefined;
  measurement?: { key: string; bytes?: number; error?: string }; measurementKey: string;
  confirmed: boolean; busy: boolean; imageAvailable: boolean; working: boolean; inspection: string;
  change: (changeApplication: (data: PromoApplication) => PromoApplication) => void;
  run: (operation: (signal: AbortSignal) => Promise<unknown>) => Promise<void>;
  setError: (value: string) => void;
}) {
  return <section className="space-y-3 rounded-xl border-2 border-primary/30 bg-primary/5 p-3 sm:p-4">
      <h3 className="font-semibold">申请轮播图 · 1082×300</h3>
      <p className="text-xs text-muted-foreground">生成结果请检查文字、主体和英文内容。</p>
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">中文轮播标题（最多28字）<Input aria-label="申请轮播中文标题" maxLength={28} value={a.headline} onChange={(e) => change((data) => ({ ...data, headline: e.target.value }))} /></label>
        <label className="text-sm">中文副标题（最多60字）<Input aria-label="申请轮播中文副标题" maxLength={60} value={a.subtitle} onChange={(e) => change((data) => ({ ...data, subtitle: e.target.value }))} /></label></div>
      {/[a-z]/i.test(a.headline + a.subtitle) ? <p role="alert" className="text-sm text-destructive">标题或副标题含英文字母，请删除或替换，不能提交生成。</p> : null}
      <Input aria-label="申请轮播修正要求" placeholder="修改要求" value={correction} disabled={busy} onChange={(e) => setCorrection(e.target.value)} />
      <div className="flex flex-wrap gap-2"><Button disabled={busy || working || !confirmed || !imageAvailable || /[a-z]/i.test(a.headline + a.subtitle) || !a.headline.trim()} onClick={() => void run((signal) => {
        validateApplicationText(a.headline, a.subtitle); return submitApplicationTask(scope, project.id, "banner", correction, signal);
      })}>生成图片</Button>
        <label className="cursor-pointer rounded border px-3 py-2 text-sm">换图<input className="sr-only" type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" onChange={(e) => {
          const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
          void run(async (signal) => {
            if (!/^image\/(png|jpeg)$/.test(file.type)) throw new Error("仅支持 PNG、JPG、JPEG 图片");
            const source = await fileDataURL(file), id = promoID();
            if (signal.aborted || await capturePromoScope() !== scope) return;
            await updatePromoProject(scope, project.id, (p) => {
              const data = applicationData(p);
              return { ...p, application: { ...data, inspected: undefined, selected: id, crop: { ...DEFAULT_CROP }, banners: [...data.banners,
                { id, source, status: "success", prompt: "用户上传申请轮播替换原图", fingerprint: "", resultFingerprint: JSON.stringify([id, file.size]), createdAt: new Date().toISOString() }] } };
            });
          });
        }} /></label></div>
      <select aria-label="申请轮播历史版本" className="w-full rounded border bg-background p-2 text-sm" value={a.selected || ""} onChange={(e) => change((data) => ({ ...data, selected: e.target.value, crop: { ...DEFAULT_CROP }, inspected: undefined }))}>
        <option value="" disabled>历史版本</option>{a.banners.map((v, i) => <option key={v.id} value={v.id}>v{i + 1} · {statusLabels[v.status]}</option>)}</select>
      {version?.error ? <p role="alert" className="text-sm text-destructive">{version.error}</p> : null}
      {version?.source && version.status === "success" ? <CropPreview source={version.source} width={1082} height={300} crop={a.crop} onChange={(crop) => change((data) => ({ ...data, crop, inspected: undefined }))} /> : <div className="grid aspect-[1082/300] place-items-center rounded bg-muted text-sm">{version ? statusLabels[version.status] : "等待申请轮播图"}</div>}
      {version?.taskId && activeStatus(version.status) ? <Button variant="outline" size="sm" onClick={() => void run(() => cancelCreationTask(version.taskId!))}>取消任务</Button> : null}
      <details className="text-xs"><summary>当前申请轮播提示词 / 任务与结果指纹</summary><pre className="max-h-40 overflow-auto whitespace-pre-wrap">{version?.prompt || "暂无"}</pre><p className="break-all">{version?.taskId} {version?.resultFingerprint}</p></details>
      <div className="flex flex-wrap items-center gap-3"><label className="text-sm">申请轮播导出格式 <select aria-label="申请轮播导出格式" className="rounded border bg-background p-2" value={format} onChange={(e) => setFormat(e.target.value as "png" | "jpeg")}><option value="png">PNG</option><option value="jpeg">JPEG</option></select></label>
        <span className="text-xs">1082×300 · 上限 10,000,000 字节 · {measurement?.key === measurementKey && measurement.bytes !== undefined ? `实际 ${measurement.bytes.toLocaleString()} 字节` : "等待实际图片字节测量"}</span></div>
      {measurement?.key === measurementKey && measurement.error ? <p role="alert" className="text-sm text-destructive">{measurement.error}</p> : null}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={a.inspected === inspection} disabled={!version?.source || version.status !== "success"} onChange={(e) => change((data) => ({ ...data, inspected: e.target.checked ? applicationInspection(data) : undefined }))} />已检查：文字、主体完整且无英文</label>
      <Button disabled={busy || !version?.source || version.status !== "success" || a.inspected !== inspection || measurement?.key !== measurementKey || measurement.bytes === undefined || Boolean(measurement.error)} onClick={() => void run(async (signal) => {
        const blob = await exportPromoCrop(version!.source!, 1082, 300, a.crop, format);
        validateApplicationBytes(blob.size);
        if (signal.aborted || await capturePromoScope() !== scope) return;
        await inspectPromoProject(scope, project.id, (latest) => {
          if (!latest || signal.aborted || applicationInspection(applicationData(latest)) !== inspection || applicationData(latest).inspected !== inspection)
            throw new Error("图片或裁剪已改变，请重新检查后导出");
          downloadPromoBlob(blob, `${safeName(project.title)}-申请轮播-1082x300.${format === "jpeg" ? "jpg" : "png"}`);
        });
      })}>导出图片</Button>
    </section>;
}
