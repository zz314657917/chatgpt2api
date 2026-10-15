import { createChatCompletionTask, createImageEditTask, createImageGenerationTask, fetchCreationTasks, fetchCanvasModels, canvasModelHasCapability, imageReferenceInputLimitForCount, type CreationTask } from "@/lib/api";
import { imageModelSettingsToTaskFields } from "@/lib/image-model-settings";
import { fetchAuthenticatedImageBlob } from "@/lib/authenticated-image";
import { activeStatus, canGenerateDesign, DESIGNS, parseDraft, shouldApplyTaskStatus, taskImageOutcome } from "./core";
import { capturePromoScope, inspectPromoProject, listPromoProjects, mutatePromoProjects, promoID, updatePromoProject, type PromoBatch, type PromoProject, type PromoVersion } from "@/store/game-promo-projects";
import { promoModelParameters, promoSafetyArea } from "./model-parameters";
import { IMAGE_ARENA_MODEL_IDS } from "@/lib/image-arena/image-arena-model-capabilities";
import { activePromoBatch, nextPromoBatchTarget, planPromoBatch, promoBatchFingerprint, promoBatchInputs, promoProjectWorking, reconcilePromoBatch } from "./batch";
import { applicationBannerPrompt, applicationConfirmation, applicationCopyPrompt, applicationData, applicationFingerprint, parseApplicationCopy, validateApplicationCopy, type ApplicationVersion } from "./application";

export function selectedVersion(project: PromoProject, design: string) {
  return project.versions[design]?.find((v) => v.id === project.selected[design]);
}
export function copyFingerprint(project: PromoProject) {
  return JSON.stringify([project.title, project.facts, project.activity, project.references, project.draft]);
}
const locks = new Set<string>();
async function applyApplicationTask(scope: string, projectID: string, versionID: string, kind: "copy" | "banner", task: CreationTask, signal?: AbortSignal) {
  if (signal?.aborted) return;
  await updatePromoProject(scope, projectID, (p) => {
    if (signal?.aborted) return p;
    const a = applicationData(p), key = kind === "copy" ? "copyVersions" : "banners";
    const version = a[key].find((v) => v.id === versionID);
    if (!version || !shouldApplyTaskStatus(version.status, task.status)) return p;
    let next: ApplicationVersion = { ...version, ...taskImageOutcome(task, kind === "banner") };
    let draft = a.draft;
    if (task.status === "success" && kind === "copy") {
      try {
        const parsed = parseApplicationCopy(next.textResponse || "");
        // Missing weekly facts must remain explicit even if the model ignores the instruction.
        if (!version.inputsSnapshot?.weeklyActivity.trim()) parsed.weeklyActivity = "未提供";
        if (!version.inputsSnapshot?.weeklyUpdate.trim()) parsed.weeklyUpdate = "未提供";
        validateApplicationCopy(parsed);
        next.resultFingerprint = JSON.stringify(parsed);
        if (version.fingerprint === applicationFingerprint(p) && a.copySelected === versionID) draft = parsed;
        else next.error = "资料或文案已修改，迟到结果仅保留历史，未覆盖当前编辑";
      } catch (error) { next = { ...next, status: "error", error: error instanceof Error ? error.message : String(error) }; }
    }
    if (kind === "banner" && next.source) next.resultFingerprint = JSON.stringify([next.source, version.id]);
    return { ...p, application: { ...a, draft, [key]: a[key].map((v) => v.id === versionID ? next : v) } };
  });
}
export async function submitApplicationTask(scope: string, projectID: string, kind: "copy" | "banner", correction = "", signal?: AbortSignal) {
  const lock = `${scope}:${projectID}:application-${kind}`;
  if (locks.has(lock)) return;
  locks.add(lock);
  const id = promoID();
  let submitted = false;
  try {
    const project = (await listPromoProjects(scope)).find((p) => p.id === projectID);
    if (!project) throw new Error("项目已删除");
    const models = await fetchCanvasModels();
    if (signal?.aborted || await capturePromoScope() !== scope) throw new Error("页面已离开或账号已切换，申请提交已停止");
    if (activePromoBatch(project) || promoProjectWorking(project)) throw new Error("本项目已有批次或任务进行中，请等待完成");
    const a = applicationData(project), capability = kind === "copy" ? "chat" : "image", modelID = kind === "copy" ? project.chatModel : project.imageModel;
    const model = models.find((m) => m.id === modelID && m.enabled !== false &&
      (m.group_modes?.length ? m.group_modes.includes(capability) : canvasModelHasCapability(m, capability) || m.kind === capability || m.kind === "both"));
    if (!model) throw new Error("请选择可用的申请生成模型");
    if (kind === "banner") {
      if (a.confirmed !== applicationConfirmation(project)) throw new Error("请先确认当前申请文案");
      validateApplicationCopy(a.draft);
      if (!(IMAGE_ARENA_MODEL_IDS as readonly string[]).includes(modelID)) throw new Error("图片模型不支持申请轮播生成");
      if (project.references.length > imageReferenceInputLimitForCount(modelID, 1)) throw new Error("参考图超过模型上限");
    }
    const fingerprint = applicationFingerprint(project);
    const prompt = kind === "copy" ? applicationCopyPrompt(project) :
      `${applicationBannerPrompt(project, promoSafetyArea(modelID, "21:9", 1082, 300))}\n修正要求（不能违反仅简体中文和可信事实约束）：${correction || "无"}`;
    const claimedFingerprint = applicationFingerprint({ ...project, application: kind === "copy" ? { ...a, confirmed: undefined } : a });
    const version: ApplicationVersion = { id, taskId: id, status: "submitting", prompt, fingerprint: claimedFingerprint, inputsSnapshot: structuredClone(a.inputs), createdAt: new Date().toISOString() };
    const claimed = await mutatePromoProjects(scope, (items) => {
      let accepted = false;
      return { items: items.map((p) => {
        if (p.id !== projectID || signal?.aborted || activePromoBatch(p) || promoProjectWorking(p) || applicationFingerprint(p) !== fingerprint) return p;
        accepted = true;
        const latest = applicationData(p);
        return { ...p, application: kind === "copy" ? { ...latest, confirmed: undefined, copySelected: id, copyVersions: [...latest.copyVersions, version] } :
          { ...latest, inspected: undefined, selected: id, crop: { x: .5, y: .5, zoom: 1 }, banners: [...latest.banners, version] } };
      }), result: accepted };
    });
    if (!claimed) return;
    // Claiming a copy clears its prior confirmation, so compare against that exact claimed state.
    const files = kind === "banner" ? await Promise.all(project.references.map(async (r) => {
      const blob = await fetchAuthenticatedImageBlob(r.source);
      return new File([blob], r.name, { type: blob.type || "image/png" });
    })) : [];
    if (signal?.aborted || await capturePromoScope() !== scope) throw new Error("页面已离开或账号已切换，申请提交已停止");
    const dispatch = await inspectPromoProject(scope, projectID, async (latest) => {
      if (signal?.aborted || !latest || await capturePromoScope() !== scope) throw new Error("页面已离开、账号已切换或项目已删除，申请提交已停止");
      if (applicationFingerprint(latest) !== claimedFingerprint) throw new Error("输入或文案已修改，申请任务未提交");
      const current = applicationData(latest);
      const own = (kind === "copy" ? current.copyVersions : current.banners).find((v) => v.id === id);
      if (!own || own.status !== "submitting" || (kind === "copy" ? current.copySelected : current.selected) !== id) throw new Error("申请任务状态或选中版本已改变，未提交");
      submitted = true;
      if (kind === "copy") return { task: createChatCompletionTask(id, prompt, modelID, [{ role: "user", content: prompt }]) };
      const fields = imageModelSettingsToTaskFields(modelID, project.settings, 1);
      const params = promoModelParameters(modelID, "21:9", files.length > 0);
      return { task: files.length ?
        createImageEditTask(id, files, prompt, modelID, params.size, params.quality, 1, undefined, "private", params.imageResolution, params.outputFormat, undefined, fields.toolOptions, projectID, undefined, undefined, fields.extraBody) :
        createImageGenerationTask(id, prompt, modelID, params.size, params.quality, 1, undefined, "private", params.imageResolution, params.outputFormat, undefined, fields.toolOptions, projectID, undefined, fields.extraBody) };
    });
    await applyApplicationTask(scope, projectID, id, kind, await dispatch.task);
  } catch (error) {
    await updatePromoProject(scope, projectID, (p) => {
      const a = applicationData(p), key = kind === "copy" ? "copyVersions" : "banners";
      return { ...p, application: { ...a, [key]: a[key].map((v) => v.id === id && activeStatus(v.status) ?
        { ...v, status: submitted ? "submitting" : "error", error: `${error instanceof Error ? error.message : String(error)}；${submitted ? "提交结果待查询，不会自动重发。" : "未提交，可手动重试。"}` } : v) } };
    });
    throw error;
  } finally { locks.delete(lock); }
}
export async function startPromoBatch(scope: string, projectID: string, mode: PromoBatch["mode"], correction: string) {
  const models = await fetchCanvasModels();
  if (await capturePromoScope() !== scope) throw new Error("账号已切换，已停止启动批次");
  await updatePromoProject(scope, projectID, (p) => {
    if (activePromoBatch(p) || promoProjectWorking(p)) throw new Error("本项目已有批次或任务进行中，请等待完成或停止批次");
    if (!p.copyConfirmed) throw new Error("请先确认有效文案");
    parseDraft(JSON.stringify(p.draft));
    const model = models.find((m) => m.id === p.imageModel && m.enabled !== false &&
      (m.group_modes?.length ? m.group_modes.includes("image") : canvasModelHasCapability(m, "image") || m.kind === "image" || m.kind === "both"));
    if (!model || !(IMAGE_ARENA_MODEL_IDS as readonly string[]).includes(p.imageModel) || imageReferenceInputLimitForCount(p.imageModel, 1) < 1)
      throw new Error(`图片模型 ${p.imageModel} 不可用或不支持参考图，请选择可用模型`);
    if (p.references.length + 1 > imageReferenceInputLimitForCount(p.imageModel, 1)) throw new Error("参考图超过模型上限，后续设计需预留主图");
    const targets = planPromoBatch(p, mode);
    if (!targets.length) throw new Error("九张设计均已完成，没有缺失设计");
    const batch: PromoBatch = { id: promoID(), mode, correction: correction.trim(), targets, fingerprint: promoBatchFingerprint(p),
      inputs: promoBatchInputs(p), heroVersionID: targets.some((t) => t.design === "hero") ? undefined : p.selected.hero,
      status: "running", createdAt: new Date().toISOString() };
    return { ...p, batches: [...(p.batches || []), reconcilePromoBatch(p, batch)] };
  });
}
export async function stopPromoBatch(scope: string, projectID: string, batchID: string) {
  await updatePromoProject(scope, projectID, (p) => ({ ...p, batches: p.batches?.map((b) => b.id === batchID &&
    (b.status === "running" || b.status === "awaiting-hero") ? { ...b, status: "stopped", error: "已停止后续提交；已提交任务继续运行，可在各设计卡片中取消。" } : b) }));
}
const copyPrompt = (p: PromoProject) => `仅根据以下用户确认的事实编写游戏推广文案。不得编造玩法、奖项、价格、折扣、发行时间或活动。不要根据图片推断事实。
游戏名称：${p.title}
事实：${p.facts}
活动：${p.activity}
严格输出 JSON：{"title":"标题","sellingPoint":"短卖点","carousel":[{"theme":"主题","copy":"文案"}]}，carousel 必须正好五组。`;
async function applyTask(scope: string, projectID: string, versionID: string, design: string | undefined, task: CreationTask, signal?: AbortSignal) {
  if (signal?.aborted) return;
  await updatePromoProject(scope, projectID, (p) => {
    if (signal?.aborted) return p;
    const apply = (v: PromoVersion): PromoVersion => {
      if (v.id !== versionID || !shouldApplyTaskStatus(v.status, task.status)) return v;
      return { ...v, ...taskImageOutcome(task, Boolean(design)) };
    };
    if (design) return { ...p, versions: { ...p.versions, [design]: (p.versions[design] || []).map(apply) } };
    if (p.copyTask?.id !== versionID || !shouldApplyTaskStatus(p.copyTask.status, task.status)) return p;
    const next = { ...p, copyTask: apply(p.copyTask) };
    if (task.status === "success") {
      try {
        const draft = parseDraft(task.data?.map((d) => d.text_response || "").join("\n") || "");
        if (p.copyTask.prompt !== copyFingerprint(p)) throw new Error("输入或文案已修改，旧任务文案已保留但未覆盖；请重新生成文案");
        next.draft = draft; next.copyConfirmed = false; next.heroApproved = undefined;
      } catch (error) { next.copyTask = { ...next.copyTask!, status: "error", error: String(error instanceof Error ? error.message : error) }; }
    }
    return next;
  });
}
export async function submitPromoTask(scope: string, projectID: string, design?: string, correction = "", batchID?: string, signal?: AbortSignal) {
  const key = `${scope}:${projectID}:${design || "copy"}`;
  if (locks.has(key)) return;
  locks.add(key);
  const id = promoID();
  let submitted = false;
  try {
    const current = (await listPromoProjects(scope)).find((p) => p.id === projectID);
    if (!current) throw new Error("项目不存在");
    const batch = current.batches?.find((b) => b.id === batchID);
    const project = batch ? { ...current, ...batch.inputs } : current;
    if (signal?.aborted) return;
    if (!batchID && activePromoBatch(current)) throw new Error("批次进行中，请先停止批次再单独生成");
    if (batchID && (!batch || nextPromoBatchTarget(current, batch) !== design)) return;
    if (!batchID && promoProjectWorking(current)) throw new Error("本项目已有任务进行中，请等待完成");
    if (batch) correction = batch.correction;
    if (await capturePromoScope() !== scope) throw new Error("账号已切换，已停止提交原账号项目");
    if (design ? project.versions[design]?.some((v) => activeStatus(v.status)) : activeStatus(project.copyTask?.status)) return;
    if (design && !canGenerateDesign(project, design, selectedVersion(project, "hero"))) throw new Error("请先确认文案及当前主图");
    const refs = [...project.references];
    const hero = selectedVersion(project, "hero");
    if (design && design !== "hero" && hero?.source) refs.unshift({ id: hero.id, name: "已确认主图", source: hero.source, purpose: "保持角色、画风、Logo和视觉一致性" });
    if (design && refs.length > imageReferenceInputLimitForCount(project.imageModel, 1)) throw new Error("参考图超过模型上限，请手动移除参考图或选择支持更多参考图的模型");
    const definition = DESIGNS.find((d) => d.id === design);
    const bannerSafety = definition ? promoSafetyArea(project.imageModel, definition.ratio, 1082, 300) : undefined;
    const carouselIndex = design?.startsWith("carousel-") ? Number(design.split("-")[1]) - 1 : -1;
    const prompt = design ? `为游戏 ${project.title} 设计完整的${definition?.name}推广海报，AI直接绘制中文文字，不要解释。
可信事实：${project.facts}；活动：${project.activity}。
标题：${project.draft.title}；短卖点：${project.draft.sellingPoint}。
${carouselIndex >= 0 ? JSON.stringify(project.draft.carousel[carouselIndex]) : ""}
参考图按顺序的用途：${refs.map((r, i) => `${i + 1}. ${r.name}：${r.purpose || "视觉参考，不推断事实"}`).join("\n")}
保持主体、Logo、标题在中央安全区，边缘留出裁剪余量。${design === "banner" ? `最终横幅1082×300，模型画幅裁剪后安全区高度为${bannerSafety!.heightPercent}%，关键文字与Logo须集中在中央${Math.max(10, bannerSafety!.heightPercent - 8)}%高度内。` : design?.startsWith("portrait") ? "最终为140×160或140×180，请在中央安全区域安排竖版完整海报。" : "最终16:9横版，文字清晰且完整。主图会缩至96×54，文字仅保留标题和一个极短卖点，禁止密集小字。"}
修正要求：${correction || "无"}。禁止编造额外事实。` : copyFingerprint(project);
    const version: PromoVersion = { id, taskId: id, status: "submitting", prompt, createdAt: new Date().toISOString() };
    const claimed = await mutatePromoProjects(scope, (items) => {
      let accepted = false;
      const next = items.map((p) => {
        if (p.id !== projectID || signal?.aborted) return p;
        const ownedBatch = p.batches?.find((b) => b.id === batchID);
        if (batchID ? !ownedBatch || nextPromoBatchTarget(p, ownedBatch) !== design :
          Boolean(activePromoBatch(p) || promoProjectWorking(p))) return p;
        if (promoBatchFingerprint(p) !== promoBatchFingerprint(project)) return p;
        accepted = true;
        return { ...(design ? { ...p, heroApproved: design === "hero" ? undefined : p.heroApproved,
          versions: { ...p.versions, [design]: [...(p.versions[design] || []), version] }, selected: { ...p.selected, [design]: id } } :
          { ...p, copyConfirmed: false, heroApproved: undefined, copyHistory: [...(p.copyHistory || []), ...(p.copyTask ? [p.copyTask] : [])], copyTask: version }),
          batches: p.batches?.map((b) => b.id === batchID ? { ...b, heroVersionID: design === "hero" ? id : b.heroVersionID,
            targets: b.targets.map((t) => t.design === design ? { ...t, versionID: id } : t) } : b), updatedAt: new Date().toISOString() };
      });
      return { items: next, result: accepted };
    });
    if (!claimed) return;
    let task: CreationTask;
    if (!design) {
      if (signal?.aborted || await capturePromoScope() !== scope) throw new Error("页面已离开或账号已切换，提交已停止");
      submitted = true; task = await createChatCompletionTask(id, copyPrompt(project), project.chatModel, [{ role: "user", content: copyPrompt(project) }]);
    }
    else {
      const fields = imageModelSettingsToTaskFields(project.imageModel, project.settings, 1);
      const files = await Promise.all(refs.map(async (r) => {
        const blob = await fetchAuthenticatedImageBlob(r.source);
        return new File([blob], r.name, { type: blob.type || "image/png" });
      }));
      if (await capturePromoScope() !== scope) throw new Error("账号已切换，已停止提交原账号项目");
      if (signal?.aborted) throw new Error("页面已离开，提交已停止");
      const params = promoModelParameters(project.imageModel, definition!.ratio, files.length > 0);
      const dispatch = await inspectPromoProject(scope, projectID, (latest) => {
        if (signal?.aborted) throw new Error("页面已离开，提交已停止");
        if (!latest) throw new Error("项目已删除，提交已停止");
        if (batchID) {
          const latestBatch = latest.batches?.find((b) => b.id === batchID);
          if (!latestBatch || activePromoBatch(latest)?.id !== batchID || reconcilePromoBatch(latest, latestBatch).status === "stopped")
            throw new Error("批次已停止或输入改变，未提交此任务");
          if (design !== "hero" && (latest.heroApproved !== latestBatch.heroVersionID || latest.selected.hero !== latestBatch.heroVersionID ||
            !canGenerateDesign(latest, design, selectedVersion(latest, "hero")))) throw new Error("本批主图已切换或取消确认，未提交此任务");
        } else if (promoBatchFingerprint(latest) !== promoBatchFingerprint(project)) throw new Error("输入已改变，未提交此任务");
        submitted = true;
        // Dispatch under the storage lock, but release it before awaiting the network.
        return { task: files.length ? createImageEditTask(id, files, prompt, project.imageModel, params.size, params.quality, 1, undefined, "private", params.imageResolution, params.outputFormat, undefined, fields.toolOptions, projectID, undefined, undefined, fields.extraBody) :
          createImageGenerationTask(id, prompt, project.imageModel, params.size, params.quality, 1, undefined, "private", params.imageResolution, params.outputFormat, undefined, fields.toolOptions, projectID, undefined, fields.extraBody) };
      });
      task = await dispatch.task;
    }
    await applyTask(scope, projectID, id, design, task);
  } catch (error) {
    await updatePromoProject(scope, projectID, (p) => {
      const failureStatus = submitted ? "submitting" : "error";
      const failed = (v: PromoVersion) => v.id === id && shouldApplyTaskStatus(v.status, failureStatus) ? { ...v, status: failureStatus, error: `${error instanceof Error ? error.message : String(error)}；${submitted ? "提交结果待查询，不会自动重发。" : "未提交，可手动重试。"}` } : v;
      return design ? { ...p, versions: { ...p.versions, [design]: (p.versions[design] || []).map(failed) } } : { ...p, copyTask: p.copyTask ? failed(p.copyTask) : undefined };
    });
    throw error;
  } finally { locks.delete(key); }
}
export function startPromoPolling(scope: string, onUpdate: () => Promise<void>, onError: (message: string) => void) {
  const controller = new AbortController();
  const scheduling = new Set<string>();
  let timer: ReturnType<typeof setTimeout>;
  const schedule = async (projectID: string) => {
    if (scheduling.has(projectID)) return;
    scheduling.add(projectID);
    try {
      while (!controller.signal.aborted && await capturePromoScope() === scope) {
        const project = (await listPromoProjects(scope)).find((p) => p.id === projectID);
        const batch = project && activePromoBatch(project);
        const target = project && batch && nextPromoBatchTarget(project, batch);
        if (!target || !batch) break;
        try { await submitPromoTask(scope, projectID, target, batch.correction, batch.id, controller.signal); }
        catch (error) { if (!controller.signal.aborted) onError(error instanceof Error ? error.message : String(error)); }
        if (controller.signal.aborted) break;
        await onUpdate();
        const latest = (await listPromoProjects(scope)).find((p) => p.id === projectID);
        if (!latest?.batches?.find((b) => b.id === batch.id)?.targets.find((t) => t.design === target)?.versionID) break;
      }
    } catch (error) { if (!controller.signal.aborted) onError(error instanceof Error ? error.message : String(error)); }
    finally { scheduling.delete(projectID); }
  };
  const tick = async () => {
    try {
      const projects = await listPromoProjects(scope);
      if (controller.signal.aborted) return;
      if (await capturePromoScope() !== scope) return;
      const tasks = projects.flatMap((p) => [
        ...(p.copyTask?.taskId && activeStatus(p.copyTask.status) ? [{ p, v: p.copyTask, design: undefined }] : []),
        ...Object.entries(p.versions).flatMap(([design, versions]) => versions.filter((v) => v.taskId && activeStatus(v.status)).map((v) => ({ p, v, design }))),
      ]);
      const applicationTasks = projects.flatMap((p) => (["copy", "banner"] as const).flatMap((kind) =>
        applicationData(p)[kind === "copy" ? "copyVersions" : "banners"].filter((v) => v.taskId && activeStatus(v.status)).map((v) => ({ p, v, kind }))));
      if (tasks.length || applicationTasks.length) {
        const response = await fetchCreationTasks([...tasks, ...applicationTasks].map((t) => t.v.taskId!), { signal: controller.signal });
        if (controller.signal.aborted) return;
        for (const t of tasks) {
          if (controller.signal.aborted) return;
          const task = response.items.find((i) => i.id === t.v.taskId);
          if (task) await applyTask(scope, t.p.id, t.v.id, t.design, task, controller.signal);
          else if (Date.now() - Date.parse(t.v.createdAt) > 120000 && !locks.has(`${scope}:${t.p.id}:${t.design || "copy"}`))
            await applyTask(scope, t.p.id, t.v.id, t.design, { id: t.v.taskId!, mode: t.design ? "edit" : "chat", status: "error", error: "服务端未找到此任务，提交可能中断；没有自动重发，请检查任务队列后手动重试", created_at: t.v.createdAt, updated_at: new Date().toISOString() }, controller.signal);
        }
        for (const t of applicationTasks) {
          if (controller.signal.aborted || await capturePromoScope() !== scope) return;
          const task = response.items.find((i) => i.id === t.v.taskId);
          if (task) await applyApplicationTask(scope, t.p.id, t.v.id, t.kind, task, controller.signal);
          else if (Date.now() - Date.parse(t.v.createdAt) > 120000 && !locks.has(`${scope}:${t.p.id}:application-${t.kind}`))
            await applyApplicationTask(scope, t.p.id, t.v.id, t.kind, { id: t.v.taskId!, mode: t.kind === "copy" ? "chat" : "edit", status: "error",
              error: "服务端未找到申请任务，没有自动重发；请检查任务队列后手动重试", created_at: t.v.createdAt, updated_at: new Date().toISOString() }, controller.signal);
        }
      }
      for (const project of await listPromoProjects(scope)) {
        if (controller.signal.aborted || await capturePromoScope() !== scope) return;
        const currentBatch = activePromoBatch(project);
        if (!currentBatch) continue;
        const reconciled = reconcilePromoBatch(project, currentBatch);
        if (reconciled.status !== currentBatch.status || reconciled.error !== currentBatch.error)
          await updatePromoProject(scope, project.id, (p) => ({ ...p, batches: p.batches?.map((b) => reconcilePromoBatch(p, b)) }));
        const latest = (await listPromoProjects(scope)).find((p) => p.id === project.id);
        const batch = latest && activePromoBatch(latest);
        const target = latest && batch && nextPromoBatchTarget(latest, batch);
        if (target && batch) {
          void schedule(project.id);
        }
      }
      if (!controller.signal.aborted) await onUpdate();
    } catch (error) { if (!controller.signal.aborted) onError(`任务查询失败：${error instanceof Error ? error.message : String(error)}`); }
    if (!controller.signal.aborted) timer = setTimeout(() => void tick(), 2500);
  };
  void tick();
  return () => { controller.abort(); clearTimeout(timer); };
}
