const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const taskId = process.env.QA_TASK_ID || "task-013-prompt-split-canvas-browser-qa";
const repoRoot = path.resolve(__dirname, "../../../..");
const webRoot = path.join(repoRoot, "web");
const outDir = process.env.QA_OUT_DIR || path.join(repoRoot, "output", "playwright", "task-013-prompt-split-canvas");
const now = "2026-07-11T08:00:00.000Z";

class BlockedError extends Error {}

function loadPlaywright() {
  const candidates = ["playwright"];
  const appDataRoot = process.env.APPDATA ? path.join(process.env.APPDATA, "npm", "node_modules") : "";
  if (appDataRoot) {
    candidates.push(path.join(appDataRoot, "playwright"));
  }
  const npmRoot = spawnSync("cmd.exe", ["/d", "/s", "/c", "npm.cmd root -g"], { encoding: "utf8", windowsHide: true }).stdout?.trim();
  if (npmRoot) {
    candidates.push(path.join(npmRoot, "playwright"));
  }
  let lastError = null;
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (error) {
      lastError = error;
    }
  }
  try {
    return require("playwright");
  } catch (error) {
    throw new BlockedError(`Playwright module is unavailable through NODE_PATH or the workspace runtime: ${lastError?.message || error.message}`);
  }
}

function json(value) {
  return JSON.stringify(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findOpenPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForHttp(url, timeoutMs, logs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(200);
  }
  throw new BlockedError(`Vite dev server did not become ready at ${url}: ${lastError?.message || "unknown error"}\n${logs.join("").slice(-4000)}`);
}

async function startVite() {
  const viteEntry = path.join(webRoot, "node_modules", ".bin", "vite.cmd");
  if (!fs.existsSync(viteEntry)) {
    throw new BlockedError(`Vite runtime is unavailable at ${viteEntry}; the smoke intentionally uses the current source through a dev server instead of stale embedded assets.`);
  }
  const port = await findOpenPort();
  const logs = [];
  const child = spawn("cmd.exe", ["/d", "/s", "/c", `npm.cmd run dev -- --host 127.0.0.1 --port ${port} --strictPort`], {
    cwd: webRoot,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => logs.push(String(chunk)));
  child.stderr.on("data", (chunk) => logs.push(String(chunk)));
  child.once("error", (error) => logs.push(`spawn error: ${error.message}`));
  const baseURL = `http://127.0.0.1:${port}`;
  await waitForHttp(`${baseURL}/canvas`, 20000, logs);
  return { baseURL, child, logs };
}

function stopProcessTree(child) {
  if (!child || child.exitCode !== null || !child.pid) {
    return;
  }
  spawnSync("taskkill.exe", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
}

function smartEdge(source, target) {
  return { id: `edge-${source}-${target}`, source, target, source_handle: "out", target_handle: "in" };
}

function proStudioTemplateState(resolution) {
  return {
    enabled: true,
    mode: "manual",
    intent: "free_canvas",
    qualityTier: resolution === "1k" ? "draft" : resolution === "4k" ? "production" : "standard",
    settings: {
      model: "gpt-image-2-official",
      size: "1:1",
      resolution,
      quality: resolution === "1k" ? "low" : resolution === "4k" ? "high" : "medium",
      outputFormat: "png",
      background: "auto",
      moderation: "auto",
      n: 1,
    },
  };
}

function seedCanvas(options = {}) {
  const longInput = "将一个未来感的智能台灯产品故事拆成可独立生成的高质量商业生图提示词。保持产品为磨砂白色圆环灯体、柔和蓝紫色环境光、简洁摄影棚背景，并让每一条都保留镜头、材质、光影和构图信息。".repeat(4);
  return {
    id: "qa-canvas",
    owner_id: "qa-user",
    name: "Prompt split browser QA",
    kind: "smart",
    schema_version: 2,
    viewport: { x: 0, y: 0, zoom: 1 },
    created_at: now,
    updated_at: now,
    nodes: [
      {
        id: "prompt-source",
        type: "prompt",
        name: "原始文字",
        position: { x: 20, y: 410 },
        data: { prompt: longInput, model: "gpt-image-2", size: "1:1", n: 1, visibility: "private", input_images: [], created_at: now },
      },
      {
        id: "llm-split",
        type: "llm",
        name: "AI 提示词",
        position: { x: 20, y: 64 },
        data: { prompt: "", model: "auto", split_count: 1, direct_generate: false, output: { text: "" }, created_at: now },
      },
      {
        id: "generator-template",
        type: "image_generation",
        name: "图片生成模板",
        position: { x: 420, y: 64 },
        data: {
          prompt: "",
          model: "gpt-image-2",
          size: "1:1",
          size_user_modified: false,
          image_resolution: "",
          image_resolution_user_modified: false,
          output_format: "png",
          quality: "auto",
          n: 1,
          visibility: "private",
          input_images: [],
          source_images: [],
          mention_images: [],
          input_image_mask: "",
          ...(options.proStudioResolution ? {
            professional_mode: true,
            pro_studio_state: proStudioTemplateState(options.proStudioResolution),
          } : {}),
          created_at: now,
        },
      },
      {
        id: "result-template",
        type: "result",
        name: "Output",
        position: { x: 850, y: 88 },
        data: { output: { images: [] }, created_at: now },
      },
    ],
    edges: [
      smartEdge("prompt-source", "llm-split"),
      smartEdge("llm-split", "generator-template"),
      smartEdge("generator-template", "result-template"),
    ],
  };
}

function templateFingerprint(canvas) {
  const node = canvas.nodes.find((item) => item.id === "generator-template");
  if (!node) return "missing";
  return json({
    id: node.id,
    type: node.type,
    name: node.name,
    position: node.position,
    data: {
      model: node.data?.model || "",
      size: node.data?.size || "",
      image_resolution: node.data?.image_resolution || "",
      output_format: node.data?.output_format || "",
      quality: node.data?.quality || "",
      n: node.data?.n || 0,
      visibility: node.data?.visibility || "",
      input_images: node.data?.input_images || [],
      source_images: node.data?.source_images || [],
      input_image_mask: node.data?.input_image_mask || "",
    },
  });
}

function createMockState(options = {}) {
  const canvas = seedCanvas(options);
  return {
    canvas,
    templateBefore: templateFingerprint(canvas),
    batches: new Map(),
    promptSplitPosts: [],
    promptSplitReads: [],
    promptSplitReadEvents: [],
    promptSplitReadFailures: Math.max(0, Number(options.promptSplitReadFailures) || 0),
    promptSplitFailuresRemaining: Math.max(0, Number(options.promptSplitFailures) || 0),
    promptSplitCancels: [],
    imageGenerationPosts: [],
    taskPolls: new Map(),
    saveRequests: [],
    browserErrors: [],
  };
}

function creationTask(taskId) {
  return {
    id: taskId,
    status: "success",
    mode: "generate",
    model: "gpt-image-2",
    size: "1:1",
    created_at: now,
    updated_at: now,
    data: [{ url: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" }],
  };
}

function promptSplitItems(batchId, count, mode) {
  return Array.from({ length: count }, (_, index) => ({
    index,
    variant_label: `方案 ${index + 1}`,
    prompt: `QA split ${index + 1}: matte-white circular smart lamp, blue-violet studio light, commercial product photography, distinct composition ${index + 1}`,
    ...(mode === "direct" ? { task_id: `child-${batchId}-${index + 1}`, status: "queued" } : { status: "ready" }),
  }));
}

function response(route, payload, status = 200) {
  return route.fulfill({ status, contentType: "application/json; charset=utf-8", body: json(payload) });
}

async function requestBody(request) {
  const raw = request.postData() || "{}";
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function installMockRoutes(context, state) {
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const method = request.method();

    if (pathname === "/auth/session") {
      return response(route, {
        ok: true,
        version: "qa",
        token: "qa-token",
        role: "admin",
        subject_id: "qa-user",
        name: "QA User",
        creation_concurrent_limit: 10,
        creation_rpm_limit: 60,
        menu_paths: ["/canvas"],
        api_permissions: [],
        menus: [],
      });
    }

    if (!pathname.startsWith("/api/")) {
      return route.continue();
    }

    if (pathname === "/api/teams") {
      return response(route, { scope: { type: "personal" }, teams: [] });
    }
    if (pathname === "/api/canvas/models") {
      return response(route, {
        items: [
          { id: "auto", name: "auto", kind: "text", capabilities: ["chat"], enabled: true },
          { id: "gpt-image-2", name: "gpt-image-2", kind: "image", capabilities: ["image"], enabled: true },
        ],
      });
    }
    if (pathname === "/api/canvases" && method === "GET") {
      return response(route, { items: [state.canvas] });
    }
    if (pathname === "/api/canvases" && method === "POST") {
      const body = await requestBody(request);
      state.canvas = { ...body, id: body.id || "qa-canvas", owner_id: body.owner_id || "qa-user", updated_at: now };
      state.saveRequests.push(clone(state.canvas));
      return response(route, { item: state.canvas });
    }
    if (pathname.startsWith("/api/canvases/") && method === "POST") {
      const body = await requestBody(request);
      state.canvas = { ...body, id: "qa-canvas", owner_id: body.owner_id || "qa-user", updated_at: now };
      state.saveRequests.push(clone(state.canvas));
      return response(route, { item: state.canvas });
    }
    if (pathname.startsWith("/api/canvases/") && method === "DELETE") {
      return response(route, { ok: true });
    }
    if (pathname === "/api/images") {
      return response(route, { items: [], groups: [], next_cursor: "", has_more: false });
    }
    if (pathname === "/api/image-collections") {
      return response(route, { items: [], unclassified_count: 0 });
    }

    if (pathname === "/api/creation-tasks/prompt-splits" && method === "POST") {
      const body = await requestBody(request);
      const splitCount = Number(body.split_count);
      const mode = body.execution_mode;
      if (!Number.isInteger(splitCount) || splitCount < 1 || splitCount > 10 || (mode !== "nodes" && mode !== "direct")) {
        return response(route, { error: "invalid prompt split request" }, 400);
      }
      if (mode === "direct" && body.image_request?.professional_mode === true) {
        const resolution = body.image_request.resolution || body.image_request.image_resolution;
        if (!["1k", "2k", "4k"].includes(resolution) || body.image_request.n !== 1) {
          return response(route, { error: "invalid Pro Studio direct request" }, 422);
        }
      }
      const batchId = `batch-${mode}-${state.promptSplitPosts.length + 1}`;
      const splitFailed = state.promptSplitFailuresRemaining > 0;
      if (splitFailed) state.promptSplitFailuresRemaining -= 1;
      const batch = {
        id: batchId,
        status: splitFailed ? "error" : mode === "direct" ? "running" : "ready",
        execution_mode: mode,
        split_count: splitCount,
        split_task_id: `split-task-${batchId}`,
        ...(splitFailed ? {} : { variation_axis: "构图" }),
        items: splitFailed ? [] : promptSplitItems(batchId, splitCount, mode),
        ...(splitFailed ? { error: "mock prompt split failure" } : {}),
        created_at: now,
        updated_at: now,
      };
      state.promptSplitPosts.push({ body, batchId });
      state.batches.set(batchId, { batch, reads: 0, failuresRemaining: state.promptSplitReadFailures });
      return response(route, batch);
    }

    const cancelMatch = pathname.match(/^\/api\/creation-tasks\/prompt-splits\/([^/]+)\/cancel$/);
    if (cancelMatch && method === "POST") {
      const stored = state.batches.get(decodeURIComponent(cancelMatch[1]));
      if (!stored) return response(route, { error: "missing batch" }, 404);
      stored.batch = {
        ...stored.batch,
        status: "cancelled",
        items: stored.batch.items.map((item) => ({ ...item, status: item.status === "success" ? "success" : "cancelled" })),
        updated_at: now,
      };
      state.promptSplitCancels.push(stored.batch.id);
      return response(route, stored.batch);
    }

    const promptSplitMatch = pathname.match(/^\/api\/creation-tasks\/prompt-splits\/([^/]+)$/);
    if (promptSplitMatch && method === "GET") {
      const stored = state.batches.get(decodeURIComponent(promptSplitMatch[1]));
      if (!stored) return response(route, { error: "missing batch" }, 404);
      stored.reads += 1;
      if (stored.failuresRemaining > 0) {
        stored.failuresRemaining -= 1;
        state.promptSplitReadEvents.push({ id: stored.batch.id, status: 503 });
        return response(route, { error: "temporary prompt split read failure" }, 503);
      }
      if (stored.batch.execution_mode === "direct" && stored.batch.status !== "cancelled") {
        stored.batch = {
          ...stored.batch,
          status: "success",
          items: stored.batch.items.map((item) => ({ ...item, status: "success" })),
          updated_at: now,
        };
      }
      state.promptSplitReads.push(stored.batch.id);
      state.promptSplitReadEvents.push({ id: stored.batch.id, status: 200 });
      return response(route, stored.batch);
    }

    if (pathname === "/api/creation-tasks/image-generations" && method === "POST") {
      state.imageGenerationPosts.push(await requestBody(request));
      return response(route, creationTask(`unexpected-image-post-${state.imageGenerationPosts.length}`));
    }
    if (pathname === "/api/creation-tasks" && method === "GET") {
      const ids = String(url.searchParams.get("ids") || "").split(",").filter(Boolean);
      const items = ids.map((taskId) => {
        state.taskPolls.set(taskId, (state.taskPolls.get(taskId) || 0) + 1);
        return creationTask(taskId);
      });
      return response(route, { items, missing_ids: [] });
    }
    if (/^\/api\/creation-tasks\/[^/]+\/cancel$/.test(pathname) && method === "POST") {
      return response(route, { ...creationTask(pathname.split("/")[3]), status: "cancelled" });
    }

    return response(route, { items: [] });
  });
}

async function waitFor(predicate, label, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function expectSwitchThumbInsideTrack(switchControl) {
  const [track, thumb] = await Promise.all([
    switchControl.boundingBox(),
    switchControl.locator(":scope > span").boundingBox(),
  ]);
  assert.ok(track && thumb, "direct mode switch track or thumb is missing");
  assert.ok(thumb.x >= track.x - 0.5, `direct mode switch thumb starts outside track: ${JSON.stringify({ track, thumb })}`);
  assert.ok(thumb.x + thumb.width <= track.x + track.width + 0.5, `direct mode switch thumb ends outside track: ${JSON.stringify({ track, thumb })}`);
}

async function openCanvas(browser, baseURL, state, viewport) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(() => {
    localStorage.setItem("smart-canvas-onboarding-dismissed-v1", "1");
    localStorage.setItem("smart-canvas-left-rail-collapsed", "1");
  });
  await installMockRoutes(context, state);
  const page = await context.newPage();
  page.on("pageerror", (error) => state.browserErrors.push(error.message));
  await page.goto(`${baseURL}/canvas`, { waitUntil: "domcontentloaded" });
  const llm = page.locator('[data-canvas-node-id="llm-split"]');
  try {
    await llm.waitFor({ state: "visible", timeout: 20000 });
  } catch (error) {
    const body = await page.locator("body").innerText().catch(() => "");
    const compileError = body.match(/(?:Internal Server Error|Pre-transform error|Failed to compile|Cannot find module|SyntaxError)[\s\S]{0,500}/i);
    throw new BlockedError(`Canvas LLM selector [data-canvas-node-id="llm-split"] is unavailable. ${compileError ? compileError[0] : body.slice(0, 600) || error.message}`);
  }
  const body = await page.locator("body").innerText();
  if (/(?:Internal Server Error|Pre-transform error|Failed to compile)/i.test(body)) {
    throw new BlockedError(`Current frontend did not compile cleanly: ${body.slice(0, 800)}`);
  }
  return { context, page, llm };
}

function splitPairs(canvas, batchId) {
  const generators = canvas.nodes.filter((node) => node.type === "image_generation" && node.data?.prompt_split_batch_id === batchId);
  const outputs = canvas.nodes.filter((node) => node.type === "result" && node.data?.prompt_split_batch_id === batchId);
  return { generators, outputs };
}

function nodeRect(node) {
  return {
    id: node.id,
    x: Number(node.position?.x || 0),
    y: Number(node.position?.y || 0),
    width: Number(node.data?.width || (node.type === "image_generation" ? 390 : 320)),
    height: Number(node.data?.height || (node.type === "image_generation" ? 370 : 220)),
  };
}

function rectsOverlap(left, right, tolerance = 1) {
  return left.x < right.x + right.width - tolerance
    && left.x + left.width > right.x + tolerance
    && left.y < right.y + right.height - tolerance
    && left.y + left.height > right.y + tolerance;
}

function assertWorldRectsDisjoint(nodes, label) {
  const rects = nodes.map(nodeRect);
  for (let left = 0; left < rects.length; left += 1) {
    for (let right = left + 1; right < rects.length; right += 1) {
      assert.equal(rectsOverlap(rects[left], rects[right]), false, `${label}: ${rects[left].id} overlaps ${rects[right].id}`);
    }
  }
}

async function assertDomRectsDisjoint(page, nodes, label) {
  const rects = [];
  for (const node of nodes) {
    const box = await page.locator(`[data-canvas-node-id="${node.id}"]`).boundingBox();
    assert.ok(box, `${label}: missing DOM rect for ${node.id}`);
    rects.push({ id: node.id, x: box.x, y: box.y, width: box.width, height: box.height });
  }
  for (let left = 0; left < rects.length; left += 1) {
    for (let right = left + 1; right < rects.length; right += 1) {
      assert.equal(rectsOverlap(rects[left], rects[right], 0.5), false, `${label}: DOM ${rects[left].id} overlaps ${rects[right].id}`);
    }
  }
}

async function saveSettled(state, batchId, expectedPairCount = 3) {
  try {
    await waitFor(
    async () => {
      const pairs = splitPairs(state.canvas, batchId);
      return state.saveRequests.length > 0 && pairs.generators.length === expectedPairCount && pairs.outputs.length === expectedPairCount;
    },
    `canvas autosave for ${batchId}`,
    15000,
    );
  } catch (error) {
    const pairs = splitPairs(state.canvas, batchId);
    throw new Error(`${error.message}; generators=${pairs.generators.length}, outputs=${pairs.outputs.length}, llmStatus=${persistedLlm(state)?.data?.prompt_split_status || ""}`);
  }
}

function removePromptSplitPairs(state, batchId) {
  const pairIds = new Set(
    state.canvas.nodes
      .filter((node) => node.data?.prompt_split_batch_id === batchId && (node.type === "image_generation" || node.type === "result"))
      .map((node) => node.id),
  );
  state.canvas = {
    ...state.canvas,
    nodes: state.canvas.nodes.filter((node) => !pairIds.has(node.id)),
    edges: state.canvas.edges.filter((edge) => !pairIds.has(edge.source) && !pairIds.has(edge.target)),
    updated_at: now,
  };
}

function persistedLlm(state) {
  return state.canvas.nodes.find((node) => node.id === "llm-split");
}

async function runFailedSplitRerunScenario(browser, baseURL) {
  const state = createMockState({ promptSplitFailures: 1 });
  const { context, page, llm } = await openCanvas(browser, baseURL, state, { width: 1365, height: 900 });
  try {
    const splitInput = llm.getByRole("spinbutton", { name: "拆分数量", exact: true });
    await splitInput.fill("5");
    await llm.getByRole("button", { name: "拆分为 5 条", exact: true }).click();
    await waitFor(() => persistedLlm(state)?.data?.prompt_split_status === "error", "failed prompt-split status");

    const failedBatchId = state.promptSplitPosts[0].batchId;
    assert.equal(splitPairs(state.canvas, failedBatchId).generators.length, 0, "failed split must not create generator nodes");
    assert.equal(splitPairs(state.canvas, failedBatchId).outputs.length, 0, "failed split must not create output nodes");
    assert.equal(await page.getByRole("dialog").filter({ hasText: "如何处理上一批节点？" }).count(), 0, "failed split must not open a previous-batch dialog");

    await llm.getByRole("button", { name: "拆分为 5 条", exact: true }).click();
    await waitFor(() => state.promptSplitPosts.length === 2, "failed prompt-split direct retry POST");
    assert.equal(await page.getByRole("dialog").filter({ hasText: "如何处理上一批节点？" }).count(), 0, "failed split retry must submit without a previous-batch dialog");
    assert.equal(persistedLlm(state)?.data?.prompt_split_replace_batch_id || "", "", "failed split retry must not set a replacement marker");
    await waitFor(() => splitPairs(state.canvas, state.promptSplitPosts[1].batchId).generators.length === 5, "failed prompt-split retry fanout");
    return { failedBatchId, retryBatchId: state.promptSplitPosts[1].batchId };
  } finally {
    await context.close();
  }
}

async function runNodesScenario(browser, baseURL, artifacts) {
  const state = createMockState();
  const { context, page, llm } = await openCanvas(browser, baseURL, state, { width: 1365, height: 900 });
  try {
    const box = await llm.boundingBox();
    assert.ok(box, "LLM node has no bounding box");
    assert.ok(Math.abs(box.width - 330) <= 12, `LLM node width = ${box.width}, want approximately 330`);
    assert.ok(box.height <= 280, `LLM node height = ${box.height}, want <= 280`);

    await llm.getByRole("button", { name: "编辑完整输入" }).click();
    const dialog = page.getByRole("dialog").filter({ hasText: "AI 提示词输入" });
    await dialog.waitFor({ state: "visible" });
    assert.match(await dialog.innerText(), /未来感的智能台灯产品故事/);
    await dialog.getByRole("button", { name: "完成" }).click();

    await llm.getByRole("button", { name: "增加拆分数量" }).click({ clickCount: 2 });
    assert.equal(await llm.getByRole("spinbutton", { name: "拆分数量", exact: true }).inputValue(), "3");
    await llm.getByRole("button", { name: "拆分为 3 条", exact: true }).click();

    await waitFor(async () => (await page.locator("[data-canvas-node-id]").count()) === 10, "three nodes-mode pairs");
    assert.equal(state.promptSplitPosts.length, 1, "nodes mode must create one prompt-split batch");
    assert.equal(state.promptSplitPosts[0].body.execution_mode, "nodes");
    assert.equal(state.imageGenerationPosts.length, 0, "nodes mode must not POST image generation tasks");

    await llm.getByTitle("查看提示词详情").click();
    const semanticDialog = page.getByRole("dialog").filter({ hasText: "拆分提示词 3/3" });
    await semanticDialog.waitFor({ state: "visible" });
    assert.equal(await semanticDialog.locator("[data-prompt-split-variation-axis]").getAttribute("data-prompt-split-variation-axis"), "构图", "prompt split axis must be visible");
    assert.deepEqual(await semanticDialog.locator("[data-prompt-split-variant-label]").allTextContents(), ["方案 1", "方案 2", "方案 3"], "variant labels must be visible");
    await page.keyboard.press("Escape");
    await semanticDialog.waitFor({ state: "hidden" });

    const batchId = state.promptSplitPosts[0].batchId;
    await saveSettled(state, batchId);
    const pairs = splitPairs(state.canvas, batchId);
    assert.equal(pairs.generators.length, 3, "nodes mode must persist three generator nodes");
    assert.equal(pairs.outputs.length, 3, "nodes mode must persist three output nodes");
    for (const generator of pairs.generators) {
      const output = pairs.outputs.find((item) => state.canvas.edges.some((edge) => edge.source === generator.id && edge.target === item.id));
      assert.ok(output, `generator ${generator.id} must have its own output`);
      assert.equal(generator.data?.task_id || "", "", "nodes mode generator must not bind a direct task id");
      assert.equal(generator.data?.node_view, "compact", "fanout generator must default to compact view");
      assert.equal(generator.data?.width, 340, "fanout generator width must be stable");
      assert.equal(generator.data?.height, 270, "fanout generator height must be stable");
    }
    assert.ok(pairs.outputs.every((output) => output.data?.width === 320 && output.data?.height === 220), "fanout outputs must use compact dimensions");
    assertWorldRectsDisjoint([...pairs.generators, ...pairs.outputs], "three-pair world layout");
    await assertDomRectsDisjoint(page, [...pairs.generators, ...pairs.outputs], "three-pair DOM layout");
    assert.equal(templateFingerprint(state.canvas), state.templateBefore, "prompt-split must not mutate the source image template");
    await page.getByTitle("适配内容").click();

    const firstGenerator = pairs.generators[0];
    const firstGeneratorNode = page.locator(`[data-canvas-node-id="${firstGenerator.id}"]`);
    const postsBeforeViewChange = state.promptSplitPosts.length;
    await firstGeneratorNode.getByRole("button", { name: "展开参数", exact: true }).click();
    await waitFor(() => state.canvas.nodes.find((node) => node.id === firstGenerator.id)?.data?.node_view === "full", "generator full view");
    await firstGeneratorNode.getByRole("button", { name: "收起参数", exact: true }).click();
    await waitFor(() => state.canvas.nodes.find((node) => node.id === firstGenerator.id)?.data?.node_view === "compact", "generator compact view");
    assert.equal(state.promptSplitPosts.length, postsBeforeViewChange, "view changes must not submit prompt-split tasks");

    const resizeHandle = firstGeneratorNode.getByRole("button", { name: "拖拽缩放图片生成节点" });
    const resizeBox = await resizeHandle.boundingBox();
    assert.ok(resizeBox, "generator resize handle is missing");
    const saveCountBeforeResize = state.saveRequests.length;
    await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + resizeBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(resizeBox.x - 240, resizeBox.y - 240, { steps: 4 });
    await page.mouse.up();
    await waitFor(() => {
      const resized = state.canvas.nodes.find((node) => node.id === firstGenerator.id);
      return resized?.data?.width === 300 && resized?.data?.height === 220 && resized?.data?.node_size_user_modified === true;
    }, "generator resize lower bounds");

    const firstOutput = pairs.outputs[0];
    const firstOutputNode = page.locator(`[data-canvas-node-id="${firstOutput.id}"]`);
    const outputResizeHandle = firstOutputNode.getByRole("button", { name: "拖拽缩放 Output 节点" });
    const outputResizeBox = await outputResizeHandle.boundingBox();
    assert.ok(outputResizeBox, "output resize handle is missing");
    const outputResizeHit = await page.evaluate(({ x, y }) => {
      const element = document.elementFromPoint(x, y);
      return {
        nodeId: element?.closest("[data-canvas-node-id]")?.getAttribute("data-canvas-node-id") || "",
        label: element?.closest("button")?.getAttribute("aria-label") || "",
      };
    }, { x: outputResizeBox.x + outputResizeBox.width / 2, y: outputResizeBox.y + outputResizeBox.height / 2 });
    assert.deepEqual(outputResizeHit, { nodeId: firstOutput.id, label: "拖拽缩放 Output 节点" }, "output resize handle must receive pointer input");
    await page.mouse.move(outputResizeBox.x + outputResizeBox.width / 2, outputResizeBox.y + outputResizeBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(outputResizeBox.x - 240, outputResizeBox.y - 240, { steps: 4 });
    await page.mouse.up();
    await waitFor(() => state.canvas.nodes.find((node) => node.id === firstOutput.id)?.data?.node_size_user_modified === true, "output resize update");
    const resizedOutput = state.canvas.nodes.find((node) => node.id === firstOutput.id);
    assert.deepEqual(
      { width: resizedOutput?.data?.width, height: resizedOutput?.data?.height },
      { width: 260, height: 180 },
      "output resize must clamp to its lower bounds",
    );
    await waitFor(() => state.saveRequests.length > saveCountBeforeResize, "resized generator autosave");
    await page.reload({ waitUntil: "domcontentloaded" });
    await llm.waitFor({ state: "visible", timeout: 15000 });
    const resizedAfterReload = state.canvas.nodes.find((node) => node.id === firstGenerator.id);
    assert.equal(resizedAfterReload?.data?.width, 300, "generator width must survive reload");
    assert.equal(resizedAfterReload?.data?.height, 220, "generator height must survive reload");
    const outputAfterReload = state.canvas.nodes.find((node) => node.id === firstOutput.id);
    assert.equal(outputAfterReload?.data?.width, 260, "output width must survive reload");
    assert.equal(outputAfterReload?.data?.height, 180, "output height must survive reload");
    assert.equal(persistedLlm(state)?.data?.prompt_split_variation_axis, "构图", "variation axis must survive reload");
    assert.deepEqual(persistedLlm(state)?.data?.prompt_split_items?.map((item) => item.variant_label), ["方案 1", "方案 2", "方案 3"], "variant labels must survive reload");

    const directSwitch = llm.getByRole("switch", { name: "直接生图" });
    const promptSplitPostCount = state.promptSplitPosts.length;
    await directSwitch.click();
    assert.equal(await directSwitch.getAttribute("aria-checked"), "true", "enabling direct mode must only change the next run mode");
    assert.equal(state.promptSplitPosts.length, promptSplitPostCount, "enabling direct mode must not submit a prompt-split batch");
    assert.equal(await llm.getByRole("button", { name: "中断", exact: true }).count(), 0, "a completed nodes batch must not become interruptible after enabling direct mode");
    await expectSwitchThumbInsideTrack(directSwitch);
    const armedScreenshot = path.join(outDir, "direct-mode-armed.png");
    await page.screenshot({ path: armedScreenshot, fullPage: true });
    artifacts.push(path.basename(armedScreenshot));
    await llm.getByRole("button", { name: "重新拆分并直接生图", exact: true }).click();
    const rerunDialog = page.getByRole("dialog").filter({ hasText: "如何处理上一批节点？" });
    await rerunDialog.waitFor({ state: "visible" });
    assert.equal(state.promptSplitPosts.length, promptSplitPostCount, "opening rerun choice must not submit a batch");
    await rerunDialog.getByRole("button", { name: "取消", exact: true }).click();
    assert.equal(state.promptSplitPosts.length, promptSplitPostCount, "cancelling rerun must not submit a batch");
    await llm.getByRole("button", { name: "重新拆分并直接生图", exact: true }).click();
    await page.getByRole("dialog").filter({ hasText: "如何处理上一批节点？" }).getByRole("button", { name: "保留并新建", exact: true }).click();
    await waitFor(async () => state.promptSplitPosts.length === promptSplitPostCount + 1, "direct retry prompt-split POST");
    assert.equal(state.promptSplitPosts.at(-1).body.execution_mode, "direct", "the next click must submit the direct mode batch");
    const keptBatchId = state.promptSplitPosts.at(-1).batchId;
    await saveSettled(state, keptBatchId);
    assert.equal(splitPairs(state.canvas, batchId).generators.length, 3, "keep rerun must retain previous generators");
    assertWorldRectsDisjoint(
      [...splitPairs(state.canvas, batchId).generators, ...splitPairs(state.canvas, batchId).outputs, ...splitPairs(state.canvas, keptBatchId).generators, ...splitPairs(state.canvas, keptBatchId).outputs],
      "kept batches world layout",
    );

    const screenshot = path.join(outDir, "desktop-nodes-mode.png");
    await page.screenshot({ path: screenshot, fullPage: true });
    artifacts.push(path.basename(screenshot));
    return { batchId, nodeCount: await page.locator("[data-canvas-node-id]").count() };
  } finally {
    await context.close();
  }
}

async function runTenNodeLayoutScenario(browser, baseURL, artifacts) {
  const state = createMockState();
  const { context, page, llm } = await openCanvas(browser, baseURL, state, { width: 1600, height: 1000 });
  try {
    const splitInput = llm.getByRole("spinbutton", { name: "拆分数量", exact: true });
    await splitInput.fill("10");
    await splitInput.press("Tab");
    await llm.getByRole("button", { name: "拆分为 10 条", exact: true }).click();
    await waitFor(() => state.promptSplitPosts.length === 1, "ten-item prompt-split POST");
    const batchId = state.promptSplitPosts[0].batchId;
    await saveSettled(state, batchId, 10);
    const pairs = splitPairs(state.canvas, batchId);
    assert.equal(pairs.generators.length, 10);
    assert.equal(pairs.outputs.length, 10);
    assert.ok(pairs.generators.every((node) => node.data?.node_view === "compact" && node.data?.width === 340 && node.data?.height === 270));
    const nodes = [...pairs.generators, ...pairs.outputs];
    assertWorldRectsDisjoint(nodes, "ten-pair world layout");
    await page.getByRole("button", { name: "适配内容", exact: true }).click();
    await sleep(400);
    await assertDomRectsDisjoint(page, nodes, "ten-pair DOM layout");
    const screenshot = path.join(outDir, "ten-pair-compact-layout.png");
    await page.screenshot({ path: screenshot, fullPage: true });
    artifacts.push(path.basename(screenshot));
    return { batchId, pairCount: pairs.generators.length };
  } finally {
    await context.close();
  }
}

async function runOutputPreviewScenario(browser, baseURL, artifacts) {
  const observed = [];
  const image = (index) => ({
    url: `data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==#${index}`,
    name: `output-${index}.gif`,
  });
  for (const count of [1, 2, 3, 4]) {
    const state = createMockState();
    const output = state.canvas.nodes.find((node) => node.id === "result-template");
    output.position = { x: 700, y: 88 };
    output.data = {
      ...output.data,
      width: 420,
      height: 340,
      output: { images: Array.from({ length: count }, (_, index) => image(index)) },
      status: "success",
    };
    const { context, page } = await openCanvas(browser, baseURL, state, { width: 1365, height: 900 });
    try {
      const node = page.locator('[data-canvas-node-id="result-template"]');
      const nodeBox = await node.boundingBox();
      const previewImages = node.locator('img[data-image-fit="contain"]');
      assert.equal(await previewImages.count(), count, `Output ${count} image layout must render every image with contain fit`);
      const boxes = [];
      for (let index = 0; index < count; index += 1) {
        const box = await previewImages.nth(index).locator("..").boundingBox();
        assert.ok(box && nodeBox, `Output ${count} image ${index + 1} has no bounds`);
        assert.ok(box.x >= nodeBox.x - 1 && box.y >= nodeBox.y - 1 && box.x + box.width <= nodeBox.x + nodeBox.width + 1 && box.y + box.height <= nodeBox.y + nodeBox.height + 1, `Output ${count} image ${index + 1} must stay inside the node`);
        boxes.push(box);
      }
      for (let left = 0; left < boxes.length; left += 1) {
        for (let right = left + 1; right < boxes.length; right += 1) {
          const overlapWidth = Math.min(boxes[left].x + boxes[left].width, boxes[right].x + boxes[right].width) - Math.max(boxes[left].x, boxes[right].x);
          const overlapHeight = Math.min(boxes[left].y + boxes[left].height, boxes[right].y + boxes[right].height) - Math.max(boxes[left].y, boxes[right].y);
          assert.ok(overlapWidth <= 0 || overlapHeight <= 0, `Output ${count} image cells must not overlap`);
        }
      }
      if (count === 1) {
        assert.ok(boxes[0].width >= nodeBox.width * 0.88, `single Output preview width ${boxes[0].width} must use most of node width ${nodeBox.width}`);
        const before = boxes[0];
        const handle = node.getByRole("button", { name: "拖拽缩放 Output 节点" });
        const handleBox = await handle.boundingBox();
        assert.ok(handleBox, "Output resize handle is missing");
        await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(handleBox.x + 100, handleBox.y + 80, { steps: 4 });
        await page.mouse.up();
        await waitFor(async () => {
          const after = await previewImages.first().locator("..").boundingBox();
          return after && after.width > before.width + 70 && after.height > before.height + 40;
        }, "single Output preview grows with node resize");
      }
      observed.push({ count, cells: boxes.map(({ width, height }) => ({ width, height })) });
      if (count === 4) {
        const screenshot = path.join(outDir, "output-preview-layout.png");
        await page.screenshot({ path: screenshot, fullPage: true });
        artifacts.push(path.basename(screenshot));
      }
    } finally {
      await context.close();
    }
  }
  return { observed };
}

async function runGeneratorStyleClipboardScenario(browser, baseURL, artifacts) {
  const state = createMockState();
  const source = state.canvas.nodes.find((node) => node.id === "generator-template");
  state.canvas.nodes.find((node) => node.id === "result-template").position = { x: 1400, y: 88 };
  Object.assign(source.data, {
    width: 540,
    model: "gpt-image-2",
    size: "16:9",
    size_user_modified: true,
    image_resolution: "2k",
    image_resolution_user_modified: true,
    output_format: "jpeg",
    output_compression: 72,
    quality: "high",
    n: 3,
    visibility: "private",
    image_model_settings: { officialImage: { background: "transparent", moderation: "low" } },
  });
  const target = clone(source);
  target.id = "generator-style-target";
  target.name = "样式目标";
  // Keep the source and target disjoint after copying raises the source node above its peers.
  target.position = { x: 1020, y: 64 };
  target.data = {
    ...target.data,
    prompt: "目标节点提示词必须保留",
    model: "auto",
    size: "1:1",
    image_resolution: "",
    output_format: "png",
    output_compression: undefined,
    quality: "auto",
    n: 1,
    visibility: "private",
    image_model_settings: { stale: true },
    input_images: [{ url: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", name: "target-input.gif" }],
    output: { images: [{ url: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", name: "target-output.gif" }] },
    status: "success",
    task_id: "target-task",
    width: 390,
    height: 370,
    node_view: "full",
  };
  const proSource = clone(source);
  proSource.id = "generator-pro-source";
  proSource.name = "Pro 样式源";
  proSource.position = { x: 20, y: 720 };
  proSource.data = {
    ...proSource.data,
    width: 540,
    professional_mode: true,
    pro_studio_state: proStudioTemplateState("4k"),
    pro_studio: { enabled: true, mode: "manual", intent: "free_canvas", quality_tier: "production" },
    official_settings: { model: "gpt-image-2-official", size: "1:1", resolution: "4k", quality: "high", output_format: "png", background: "auto", moderation: "auto", n: 1 },
  };
  const runningTarget = clone(target);
  runningTarget.id = "generator-running-target";
  runningTarget.name = "运行中目标";
  runningTarget.position = { x: 1400, y: 700 };
  runningTarget.data.width = 320;
  runningTarget.data.status = "running";
  state.canvas.nodes.push(target, proSource, runningTarget);

  const { context, page } = await openCanvas(browser, baseURL, state, { width: 1365, height: 900 });
  try {
    const sourceNode = page.locator('[data-canvas-node-id="generator-template"]');
    const targetNode = page.locator('[data-canvas-node-id="generator-style-target"]');
    const runningNode = page.locator('[data-canvas-node-id="generator-running-target"]');
    assert.equal(await targetNode.getByRole("button", { name: "粘贴样式" }).isDisabled(), true, "paste must be disabled before copying");

    const requestCountsBefore = { promptSplits: state.promptSplitPosts.length, images: state.imageGenerationPosts.length };
    const targetBefore = clone(target);
    await sourceNode.getByRole("button", { name: "复制样式" }).click();
    assert.equal(await targetNode.getByRole("button", { name: "粘贴样式" }).isEnabled(), true, "paste must enable after copying");
    assert.equal(await runningNode.getByRole("button", { name: "粘贴样式" }).isDisabled(), true, "running target paste must stay disabled");
    await targetNode.getByRole("button", { name: "粘贴样式" }).click();
    await waitFor(() => state.saveRequests.length > 0, "normal style paste autosave");
    let savedTarget = state.canvas.nodes.find((node) => node.id === target.id);
    for (const key of ["model", "size", "size_user_modified", "image_resolution", "image_resolution_user_modified", "output_format", "output_compression", "quality", "n", "visibility", "image_model_settings"]) {
      assert.deepEqual(savedTarget.data[key], source.data[key], `normal style field ${key} must match source`);
    }
    for (const key of ["prompt", "status", "task_id", "width", "height", "node_view"]) {
      assert.deepEqual(savedTarget.data[key], targetBefore.data[key], `target field ${key} must be preserved`);
    }
    assert.deepEqual(savedTarget.data.input_images.map((image) => image.url), targetBefore.data.input_images.map((image) => image.url), "target input image references must be preserved");
    assert.deepEqual(savedTarget.data.output.images.map((image) => image.url), targetBefore.data.output.images.map((image) => image.url), "target output image references must be preserved");
    assert.deepEqual(savedTarget.position, targetBefore.position, "target position must be preserved");

    const fullBody = targetNode.locator('[data-canvas-wheel-lock="true"]');
    const styleActions = targetNode.locator('[data-generator-style-actions="true"]');
    const promptLabel = targetNode.getByText("Prompts", { exact: true });
    const parameterGrid = targetNode.locator('[data-generator-parameter-grid="true"]');
    const beforeHeight = (await targetNode.boundingBox()).height;
    assert.equal(await styleActions.count(), 1, "full generator must expose one bottom style action bar");
    const [styleActionsBox, promptLabelBox, parameterGridBox] = await Promise.all([
      styleActions.boundingBox(),
      promptLabel.boundingBox(),
      parameterGrid.boundingBox(),
    ]);
    assert.ok(styleActionsBox && promptLabelBox && parameterGridBox, "generator style action layout must have visible bounds");
    assert.ok(styleActionsBox.y > promptLabelBox.y + promptLabelBox.height, "style action bar must not sit above Prompts");
    assert.ok(styleActionsBox.y > parameterGridBox.y + parameterGridBox.height, "style action bar must follow regular parameters");
    const narrowStyleActionOverflow = await runningNode.locator('[data-generator-style-actions="true"]').evaluate((element) => element.scrollWidth > element.clientWidth + 1);
    assert.equal(narrowStyleActionOverflow, false, "narrow generator style action bar must not overflow horizontally");
    assert.ok((await fullBody.evaluate((element) => ({ scrollHeight: element.scrollHeight, clientHeight: element.clientHeight }))).scrollHeight <= (await fullBody.evaluate((element) => element.clientHeight)) + 1, "expanded parameter body must not have an internal vertical scrollbar");
    assert.equal(await fullBody.getAttribute("data-generator-parameter-layout"), "default", "390px generator must use the default parameter layout");
    assert.equal(await sourceNode.locator('[data-canvas-wheel-lock="true"]').getAttribute("data-generator-parameter-layout"), "wide", "wide generator must use the three-column parameter layout");
    assert.equal(await runningNode.locator('[data-canvas-wheel-lock="true"]').getAttribute("data-generator-parameter-layout"), "stacked", "narrow generator must use the stacked parameter layout");
    const parameterColumnCount = (node) => node.locator('[data-generator-parameter-grid="true"]').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").filter(Boolean).length);
    assert.equal(await parameterColumnCount(targetNode), 2, "390px generator parameter grid must render two columns");
    assert.equal(await parameterColumnCount(sourceNode), 3, "wide generator parameter grid must render three columns");
    assert.equal(await parameterColumnCount(runningNode), 1, "narrow generator parameter grid must render one column");
    const canvasTransform = () => page.locator(".smart-canvas-board > div.absolute.left-0.top-0").evaluate((element) => element.style.transform);
    const transformBeforeLockedWheel = await canvasTransform();
    const wheelDefaultPrevented = await fullBody.evaluate((element) => {
      const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 120 });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    });
    assert.equal(wheelDefaultPrevented, true, "wheel over parameters must prevent default page scrolling");
    await fullBody.hover();
    await page.mouse.wheel(0, 120);
    assert.equal(await canvasTransform(), transformBeforeLockedWheel, "wheel over parameters must not zoom Canvas");
    const board = page.locator(".smart-canvas-board");
    const boardBox = await board.boundingBox();
    assert.ok(boardBox, "Canvas board has no bounds");
    await board.dispatchEvent("wheel", { deltaY: 120, clientX: boardBox.x + boardBox.width / 2, clientY: boardBox.y + boardBox.height / 2 });
    await waitFor(async () => (await canvasTransform()) !== transformBeforeLockedWheel, "wheel over blank Canvas changes zoom");
    assert.ok(beforeHeight > 370, `full parameter node height ${beforeHeight} must grow beyond its saved minimum`);

    await page.locator('[data-canvas-node-id="generator-pro-source"]').getByRole("button", { name: "复制样式" }).click();
    await targetNode.getByRole("button", { name: "粘贴样式" }).click();
    await waitFor(() => state.saveRequests.length > 1, "Pro Studio style paste autosave");
    savedTarget = state.canvas.nodes.find((node) => node.id === target.id);
    assert.equal(savedTarget.data.professional_mode, true, "Pro Studio mode must paste");
    assert.equal(savedTarget.data.pro_studio_state?.settings?.resolution, "4k", "Pro Studio resolution must paste");
    assert.equal(savedTarget.data.official_settings?.resolution, "4k", "official settings must paste");
    assert.deepEqual(savedTarget.data.input_images.map((image) => image.url), targetBefore.data.input_images.map((image) => image.url), "Pro paste must preserve target input images");
    assert.equal(state.promptSplitPosts.length, requestCountsBefore.promptSplits, "style/view operations must not submit prompt splits");
    assert.equal(state.imageGenerationPosts.length, requestCountsBefore.images, "style/view operations must not submit image tasks");

    await page.reload({ waitUntil: "domcontentloaded" });
    const reloadedTarget = page.locator('[data-canvas-node-id="generator-style-target"]');
    await reloadedTarget.waitFor({ state: "visible", timeout: 15000 });
    assert.equal(state.canvas.nodes.find((node) => node.id === target.id).data.pro_studio_state?.settings?.resolution, "4k", "pasted style must survive reload");
    assert.equal(await reloadedTarget.getByRole("button", { name: "粘贴样式" }).isDisabled(), true, "style clipboard must clear after reload");

    const screenshot = path.join(outDir, "generator-style-clipboard.png");
    await page.screenshot({ path: screenshot, fullPage: true });
    artifacts.push(path.basename(screenshot));
    return { fullNodeHeight: beforeHeight, savedResolution: "4k" };
  } finally {
    await context.close();
  }
}

async function runBatchControlsAndZoomLodScenario(browser, baseURL, artifacts) {
  const state = createMockState();
  const { context, page, llm } = await openCanvas(browser, baseURL, state, { width: 1600, height: 1000 });
  try {
    await llm.getByRole("button", { name: "增加拆分数量" }).click({ clickCount: 2 });
    await llm.getByRole("button", { name: "拆分为 3 条", exact: true }).click();
    await waitFor(() => state.promptSplitPosts.length === 1, "first batch controls batch");
    const firstBatchId = state.promptSplitPosts[0].batchId;
    await saveSettled(state, firstBatchId, 3);

    await llm.getByRole("button", { name: "重新拆分为 3 条", exact: true }).click();
    const rerunDialog = page.getByRole("dialog").filter({ hasText: "如何处理上一批节点？" });
    await rerunDialog.waitFor({ state: "visible" });
    await rerunDialog.getByRole("button", { name: "保留并新建", exact: true }).click();
    await waitFor(() => state.promptSplitPosts.length === 2, "second kept batch controls batch");
    const secondBatchId = state.promptSplitPosts[1].batchId;
    await saveSettled(state, secondBatchId, 3);

    const toolbar = page.locator("[data-prompt-split-batch-toolbar]");
    await toolbar.waitFor({ state: "visible" });
    assert.match(await toolbar.innerText(), /批次 2\/2/);
    assert.equal(await toolbar.locator('[title="等待 3"]').count(), 1, "batch toolbar must expose the waiting count");
    await toolbar.getByRole("button", { name: "上一个批次" }).click();
    await waitFor(async () => /批次 1\/2/.test(await toolbar.innerText()), "switch to previous prompt-split batch");
    assert.equal(await toolbar.getAttribute("data-prompt-split-batch-toolbar"), firstBatchId, "toolbar must point at the first batch after switching");
    const secondBatchNode = page.locator(`[data-canvas-node-id="${splitPairs(state.canvas, secondBatchId).generators[0].id}"]`);
    const secondBatchClass = await secondBatchNode.getAttribute("class");
    assert.match(secondBatchClass || "", /opacity-35/, `non-current batch must be visually de-emphasized: ${secondBatchClass}`);

    const firstPairs = splitPairs(state.canvas, firstBatchId);
    const secondPairs = splitPairs(state.canvas, secondBatchId);
    const secondPositionsBefore = new Map([...secondPairs.generators, ...secondPairs.outputs].map((node) => [node.id, clone(node.position)]));
    const templatePositionBefore = clone(state.canvas.nodes.find((node) => node.id === "generator-template").position);
    const disturbedGenerator = firstPairs.generators[0];
    const overlapTarget = firstPairs.outputs[0];
    state.canvas = {
      ...state.canvas,
      nodes: state.canvas.nodes.map((node) => node.id === disturbedGenerator.id ? { ...node, position: clone(overlapTarget.position) } : node),
    };
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator('[data-canvas-node-id="llm-split"]').waitFor({ state: "visible", timeout: 15000 });
    const reloadedToolbar = page.locator("[data-prompt-split-batch-toolbar]");
    await reloadedToolbar.waitFor({ state: "visible" });
    if (/批次 2\/2/.test(await reloadedToolbar.innerText())) {
      await reloadedToolbar.getByRole("button", { name: "上一个批次" }).click();
    }

    const promptPostsBeforeActions = state.promptSplitPosts.length;
    const imagePostsBeforeActions = state.imageGenerationPosts.length;
    await reloadedToolbar.getByRole("button", { name: "定位当前批次" }).click();
    await reloadedToolbar.getByRole("button", { name: "整理当前批次" }).click();
    await waitFor(() => !rectsOverlap(nodeRect(
      state.canvas.nodes.find((node) => node.id === disturbedGenerator.id),
    ), nodeRect(state.canvas.nodes.find((node) => node.id === overlapTarget.id))), "batch arrangement removes disturbed overlap");
    const arrangedFirstPairs = splitPairs(state.canvas, firstBatchId);
    assertWorldRectsDisjoint([...arrangedFirstPairs.generators, ...arrangedFirstPairs.outputs], "arranged current batch world layout");
    for (const node of [...splitPairs(state.canvas, secondBatchId).generators, ...splitPairs(state.canvas, secondBatchId).outputs]) {
      assert.deepEqual(node.position, secondPositionsBefore.get(node.id), `arranging first batch must not move ${node.id}`);
    }
    assert.deepEqual(state.canvas.nodes.find((node) => node.id === "generator-template").position, templatePositionBefore, "arranging a batch must not move the template");

    const firstGeneratorId = arrangedFirstPairs.generators[0].id;
    const sizeBeforeZoom = clone(arrangedFirstPairs.generators[0].data);
    for (let index = 0; index < 12; index += 1) {
      await page.getByTitle("缩小").click();
    }
    await waitFor(async () => (await page.locator(`[data-canvas-node-id="${firstGeneratorId}"]`).getAttribute("data-node-lod")) === "summary", "low zoom summary LOD");
    assert.equal(await page.locator(`[data-prompt-split-batch-id][data-node-lod="summary"]`).count(), 12, "all fanout nodes must use summary LOD below threshold");
    const lowZoomScreenshot = path.join(outDir, "batch-low-zoom-lod.png");
    await page.screenshot({ path: lowZoomScreenshot, fullPage: true });
    artifacts.push(path.basename(lowZoomScreenshot));
    for (let index = 0; index < 12; index += 1) {
      await page.getByTitle("放大").click();
    }
    await waitFor(async () => (await page.locator(`[data-canvas-node-id="${firstGeneratorId}"]`).getAttribute("data-node-lod")) === "full", "full node content above zoom threshold");
    const sizeAfterZoom = state.canvas.nodes.find((node) => node.id === firstGeneratorId).data;
    assert.equal(sizeAfterZoom.width, sizeBeforeZoom.width, "zoom LOD must not change node width");
    assert.equal(sizeAfterZoom.height, sizeBeforeZoom.height, "zoom LOD must not change node height");

    await reloadedToolbar.getByRole("button", { name: "删除当前批次" }).click();
    const deleteDialog = page.getByRole("dialog").filter({ hasText: "删除当前批次节点？" });
    await deleteDialog.waitFor({ state: "visible" });
    await deleteDialog.getByRole("button", { name: "取消", exact: true }).click();
    assert.equal(splitPairs(state.canvas, firstBatchId).generators.length, 3, "cancelling batch deletion must keep nodes");
    await reloadedToolbar.getByRole("button", { name: "删除当前批次" }).click();
    await page.getByRole("dialog").filter({ hasText: "删除当前批次节点？" }).getByRole("button", { name: "删除批次", exact: true }).click();
    await waitFor(() => splitPairs(state.canvas, firstBatchId).generators.length === 0, "confirmed current batch deletion");
    assert.equal(splitPairs(state.canvas, secondBatchId).generators.length, 3, "batch deletion must preserve sibling batch");
    await page.locator("[data-prompt-split-batch-toolbar]").getByRole("button", { name: "定位当前批次" }).click();
    await sleep(300);
    assert.equal(state.promptSplitPosts.length, promptPostsBeforeActions, "batch UI actions must not submit prompt-split tasks");
    assert.equal(state.imageGenerationPosts.length, imagePostsBeforeActions, "batch UI actions must not submit image tasks");
    assert.equal(state.browserErrors.length, 0, `browser errors: ${state.browserErrors.join(" | ")}`);

    const screenshot = path.join(outDir, "batch-controls-and-zoom-lod.png");
    await page.screenshot({ path: screenshot, fullPage: true });
    artifacts.push(path.basename(screenshot));
    return { firstBatchId, secondBatchId, promptSplitPosts: state.promptSplitPosts.length, imageGenerationPosts: state.imageGenerationPosts.length };
  } finally {
    await context.close();
  }
}

async function runTopbarBatchControlsResponsiveScenario(browser, baseURL, artifacts) {
  let desktopOverflow = null;
  const desktopState = createMockState();
  const desktop = await openCanvas(browser, baseURL, desktopState, { width: 1365, height: 900 });
  try {
    await desktop.llm.getByRole("button", { name: "增加拆分数量" }).click();
    await desktop.llm.getByRole("button", { name: "拆分为 2 条", exact: true }).click();
    await waitFor(() => desktopState.promptSplitPosts.length === 1, "desktop topbar prompt-split batch");
    await saveSettled(desktopState, desktopState.promptSplitPosts[0].batchId, 2);
    const toolbar = desktop.page.locator("[data-prompt-split-batch-toolbar]");
    await toolbar.waitFor({ state: "visible" });
    const upload = desktop.page.locator("button").filter({ hasText: "上传" }).first();
    const [toolbarBox, uploadBox] = await Promise.all([toolbar.boundingBox(), upload.boundingBox()]);
    assert.ok(toolbarBox && uploadBox, "topbar batch controls or upload button is missing");
    assert.ok(toolbarBox.x + toolbarBox.width <= uploadBox.x + 1, `batch controls must stay left of upload: ${JSON.stringify({ toolbarBox, uploadBox })}`);
    assert.ok(Math.abs((toolbarBox.y + toolbarBox.height / 2) - (uploadBox.y + uploadBox.height / 2)) <= 3, `batch controls must align vertically with upload: ${JSON.stringify({ toolbarBox, uploadBox })}`);
    assert.doesNotMatch(await toolbar.getAttribute("class") || "", /absolute|top-\[/, "batch controls must no longer be an absolute board overlay");
    desktopOverflow = await desktop.page.evaluate(() => ({ width: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    assert.ok(desktopOverflow.width <= desktopOverflow.client + 2, `1365 desktop horizontal overflow: ${JSON.stringify(desktopOverflow)}`);
    const desktopScreenshot = path.join(outDir, "topbar-batch-controls-1365.png");
    await desktop.page.screenshot({ path: desktopScreenshot, fullPage: true });
    artifacts.push(path.basename(desktopScreenshot));
  } finally {
    await desktop.context.close();
  }

  const mobileState = createMockState();
  const mobile = await openCanvas(browser, baseURL, mobileState, { width: 390, height: 844 });
  try {
    await mobile.llm.getByRole("button", { name: "增加拆分数量" }).click();
    await mobile.llm.getByRole("button", { name: "拆分为 2 条", exact: true }).click();
    await waitFor(() => mobileState.promptSplitPosts.length === 1, "mobile topbar prompt-split batch");
    await saveSettled(mobileState, mobileState.promptSplitPosts[0].batchId, 2);
    assert.equal(await mobile.page.locator("[data-prompt-split-batch-toolbar]").isVisible(), false, "mobile must not add a second topbar row");
    const mobileOverflow = await mobile.page.evaluate(() => ({ width: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    assert.ok(mobileOverflow.width <= mobileOverflow.client + 2, `mobile horizontal overflow: ${JSON.stringify(mobileOverflow)}`);
    const mobileScreenshot = path.join(outDir, "topbar-batch-controls-mobile.png");
    await mobile.page.screenshot({ path: mobileScreenshot, fullPage: true });
    artifacts.push(path.basename(mobileScreenshot));
    return { desktopOverflow, mobileOverflow };
  } finally {
    await mobile.context.close();
  }
}

async function runReplaceBatchScenario(browser, baseURL, artifacts) {
  const state = createMockState();
  const { context, page, llm } = await openCanvas(browser, baseURL, state, { width: 1365, height: 900 });
  try {
    await llm.getByRole("button", { name: "增加拆分数量" }).click();
    await llm.getByRole("button", { name: "拆分为 2 条", exact: true }).click();
    await waitFor(() => state.promptSplitPosts.length === 1, "replace baseline batch");
    const oldBatchId = state.promptSplitPosts[0].batchId;
    await saveSettled(state, oldBatchId, 2);
    const oldPairIds = new Set([
      ...splitPairs(state.canvas, oldBatchId).generators,
      ...splitPairs(state.canvas, oldBatchId).outputs,
    ].map((node) => node.id));

    await llm.getByRole("button", { name: "重新拆分为 2 条", exact: true }).click();
    const rerunDialog = page.getByRole("dialog").filter({ hasText: "如何处理上一批节点？" });
    await rerunDialog.waitFor({ state: "visible" });
    assert.equal(state.promptSplitPosts.length, 1, "replace choice dialog must not submit early");
    await rerunDialog.getByRole("button", { name: "替换上一批", exact: true }).click();
    await waitFor(() => state.promptSplitPosts.length === 2, "replacement batch POST");
    const newBatchId = state.promptSplitPosts[1].batchId;
    await saveSettled(state, newBatchId, 2);
    assert.equal(splitPairs(state.canvas, oldBatchId).generators.length, 0, "replacement must remove old generators after prompts are ready");
    assert.equal(splitPairs(state.canvas, oldBatchId).outputs.length, 0, "replacement must remove old outputs after prompts are ready");
    assert.ok(state.canvas.edges.every((edge) => !oldPairIds.has(edge.source) && !oldPairIds.has(edge.target)), "replacement must remove old pair edges");
    assert.equal(persistedLlm(state)?.data?.prompt_split_replace_batch_id || "", "", "replacement marker must clear after fanout");
    const newPairs = splitPairs(state.canvas, newBatchId);
    assertWorldRectsDisjoint([...newPairs.generators, ...newPairs.outputs], "replacement world layout");
    const screenshot = path.join(outDir, "replace-previous-batch.png");
    await page.screenshot({ path: screenshot, fullPage: true });
    artifacts.push(path.basename(screenshot));
    return { oldBatchId, newBatchId };
  } finally {
    await context.close();
  }
}

async function runDirectScenario(browser, baseURL, artifacts) {
  const state = createMockState();
  const { context, page, llm } = await openCanvas(browser, baseURL, state, { width: 1365, height: 900 });
  try {
    await llm.getByRole("button", { name: "增加拆分数量" }).click({ clickCount: 2 });
    await llm.getByRole("switch", { name: "直接生图" }).click();
    assert.equal(await llm.getByRole("switch", { name: "直接生图" }).getAttribute("aria-checked"), "true");
    await llm.getByRole("button", { name: "拆分并直接生图", exact: true }).click();

    await waitFor(async () => (await page.locator("[data-canvas-node-id]").count()) === 10, "three direct-mode pairs");
    assert.equal(state.promptSplitPosts.length, 1, "direct mode must create one prompt-split batch");
    const request = state.promptSplitPosts[0];
    assert.equal(request.body.execution_mode, "direct");
    assert.equal(request.body.image_request?.n, 1, "direct mode must submit one image per child");
    const batch = state.batches.get(request.batchId)?.batch;
    assert.ok(batch, "direct batch is missing from mock state");
    const childTaskIds = batch.items.map((item) => item.task_id).filter(Boolean);
    assert.equal(childTaskIds.length, 3, "direct batch must bind all three child task ids");
    assert.equal(new Set(childTaskIds).size, 3, "direct child task ids must be unique");

    await waitFor(async () => childTaskIds.every((taskId) => (state.taskPolls.get(taskId) || 0) > 0), "all direct child task polls", 9000);
    await waitFor(async () => (await page.locator('[data-canvas-node-id]').filter({ hasText: "成功" }).count()) >= 3, "all direct result nodes display success", 9000);

    await saveSettled(state, request.batchId);
    const pairs = splitPairs(state.canvas, request.batchId);
    assert.equal(pairs.generators.length, 3, "direct mode must persist three generator nodes");
    assert.equal(pairs.outputs.length, 3, "direct mode must persist three output nodes");
    assert.ok(pairs.outputs.every((item) => item.data?.status === "success"), "direct task polling must persist success into every result node");
    assert.deepEqual(
      new Set(pairs.generators.map((item) => item.data?.task_id)),
      new Set(childTaskIds),
      "direct generator nodes must retain the server child ids",
    );
    assert.equal(templateFingerprint(state.canvas), state.templateBefore, "direct prompt-split must not mutate the source image template");

    const screenshot = path.join(outDir, "desktop-direct-mode.png");
    await page.screenshot({ path: screenshot, fullPage: true });
    artifacts.push(path.basename(screenshot));

    const nodeCountBeforeReload = await page.locator("[data-canvas-node-id]").count();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator('[data-canvas-node-id="llm-split"]').waitFor({ state: "visible", timeout: 15000 });
    await waitFor(async () => (await page.locator("[data-canvas-node-id]").count()) === nodeCountBeforeReload, "reload without duplicate direct pairs");
    assert.equal(state.promptSplitPosts.length, 1, "reload must not submit another batch");
    assert.equal(splitPairs(state.canvas, request.batchId).generators.length, 3, "reload must preserve exactly three direct generators");
    return { batchId: request.batchId, childTaskIds, nodeCountBeforeReload };
  } finally {
    await context.close();
  }
}

async function runProStudioDirectScenario(browser, baseURL, artifacts) {
  const observed = [];
  for (const resolution of ["1k", "2k", "4k"]) {
    const state = createMockState({ proStudioResolution: resolution });
    const { context, page, llm } = await openCanvas(browser, baseURL, state, { width: 1365, height: 900 });
    try {
      await llm.getByRole("button", { name: "增加拆分数量" }).click();
      await llm.getByRole("switch", { name: "直接生图" }).click();
      await llm.getByRole("button", { name: "拆分并直接生图", exact: true }).click();
      await waitFor(async () => state.promptSplitPosts.length === 1, `Pro Studio ${resolution} prompt-split POST`);
      const imageRequest = state.promptSplitPosts[0].body.image_request || {};
      assert.equal(imageRequest.n, 1, `Pro Studio ${resolution} direct request must force n=1`);
      assert.equal(imageRequest.professional_mode, true, `Pro Studio ${resolution} request must preserve professional_mode`);
      assert.equal(imageRequest.pro_studio?.enabled, true, `Pro Studio ${resolution} request must preserve pro_studio metadata`);
      assert.equal(imageRequest.image_resolution, resolution, `Pro Studio ${resolution} request must preserve image_resolution`);
      assert.equal(imageRequest.resolution, resolution, `Pro Studio ${resolution} request must preserve resolution`);
      assert.equal(imageRequest.official_settings?.resolution, resolution, `Pro Studio ${resolution} request must preserve official_settings.resolution`);
      observed.push({ resolution, accepted: true });
      if (resolution === "4k") {
        const screenshot = path.join(outDir, "pro-studio-direct-4k.png");
        await page.screenshot({ path: screenshot, fullPage: true });
        artifacts.push(path.basename(screenshot));
      }
    } finally {
      await context.close();
    }
  }
  return { resolutions: observed };
}

async function runCompletedFanoutRecoveryScenario(browser, baseURL, artifacts) {
  const state = createMockState();
  const { context, page, llm } = await openCanvas(browser, baseURL, state, { width: 1365, height: 900 });
  try {
    await llm.getByRole("button", { name: "增加拆分数量" }).click({ clickCount: 2 });
    await llm.getByRole("switch", { name: "直接生图" }).click();
    await llm.getByRole("button", { name: "拆分并直接生图", exact: true }).click();
    await waitFor(async () => state.promptSplitPosts.length === 1, "direct batch before recovery");
    const batchId = state.promptSplitPosts[0].batchId;
    const childTaskIds = state.batches.get(batchId).batch.items.map((item) => item.task_id).filter(Boolean);
    await waitFor(async () => childTaskIds.every((taskId) => (state.taskPolls.get(taskId) || 0) > 0), "direct children before recovery", 9000);
    await saveSettled(state, batchId);

    removePromptSplitPairs(state, batchId);
    assert.equal(splitPairs(state.canvas, batchId).generators.length, 0, "test fixture must remove persisted fanout generators");
    assert.equal(splitPairs(state.canvas, batchId).outputs.length, 0, "test fixture must remove persisted fanout outputs");
    const readsBeforeReload = state.promptSplitReadEvents.length;
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator('[data-canvas-node-id="llm-split"]').waitFor({ state: "visible", timeout: 15000 });
    await waitFor(async () => splitPairs(state.canvas, batchId).generators.length === 3 && splitPairs(state.canvas, batchId).outputs.length === 3, "completed batch fanout rebuild", 9000);
    const recoveryReads = state.promptSplitReadEvents.slice(readsBeforeReload).filter((entry) => entry.id === batchId && entry.status === 200);
    assert.equal(recoveryReads.length, 1, "terminal batch recovery must fetch and sync exactly once");
    assert.equal(state.promptSplitPosts.length, 1, "terminal batch recovery must not create another batch");
    assert.equal(await page.locator("[data-canvas-node-id]").count(), 10, "recovered canvas must contain exactly three generator/result pairs");

    const screenshot = path.join(outDir, "completed-batch-fanout-recovery.png");
    await page.screenshot({ path: screenshot, fullPage: true });
    artifacts.push(path.basename(screenshot));
    return { batchId, recoveryFetches: recoveryReads.length };
  } finally {
    await context.close();
  }
}

async function runTransientPromptSplitReadScenario(browser, baseURL, artifacts) {
  const state = createMockState({ promptSplitReadFailures: 1 });
  const { context, page, llm } = await openCanvas(browser, baseURL, state, { width: 1365, height: 900 });
  try {
    await llm.getByRole("button", { name: "增加拆分数量" }).click();
    await llm.getByRole("switch", { name: "直接生图" }).click();
    await llm.getByRole("button", { name: "拆分并直接生图", exact: true }).click();
    await waitFor(async () => state.promptSplitPosts.length === 1, "transient-failure batch submit");
    const batchId = state.promptSplitPosts[0].batchId;
    await waitFor(async () => state.promptSplitReadEvents.some((entry) => entry.id === batchId && entry.status === 503), "one transient prompt-split GET failure", 9000);
    const failureText = await llm.innerText();
    assert.ok(!failureText.includes("拆分失败"), "transient read failure must not show a terminal split error");
    assert.equal(await llm.getByRole("button", { name: "中断", exact: true }).count(), 1, "transient read failure must keep the batch active");
    assert.equal(state.promptSplitPosts.length, 1, "transient read failure must not create another batch");

    await waitFor(async () => state.promptSplitReadEvents.some((entry) => entry.id === batchId && entry.status === 200), "same batch recovery after transient failure", 12000);
    assert.equal(state.promptSplitPosts.length, 1, "recovery retry must continue the original batch id");
    assert.ok(state.promptSplitReadEvents.every((entry) => entry.id === batchId), "transient recovery must continue polling the original batch id");
    assert.ok(!(await llm.innerText()).includes("拆分失败"), "successful retry must not leave a terminal split error");
    const screenshot = path.join(outDir, "transient-fetch-recovery.png");
    await page.screenshot({ path: screenshot, fullPage: true });
    artifacts.push(path.basename(screenshot));
    return {
      batchId,
      readEvents: state.promptSplitReadEvents.filter((entry) => entry.id === batchId),
    };
  } finally {
    await context.close();
  }
}

async function runMobileScenario(browser, baseURL, artifacts) {
  const state = createMockState();
  const { context, page, llm } = await openCanvas(browser, baseURL, state, { width: 390, height: 844 });
  try {
    const splitInput = llm.getByRole("spinbutton", { name: "拆分数量", exact: true });
    await splitInput.fill("10");
    await splitInput.press("Tab");
    await waitFor(async () => (await splitInput.inputValue()) === "10", "mobile split count 10");
    const directSwitch = llm.getByRole("switch", { name: "直接生图" });
    assert.equal(await directSwitch.isEnabled(), true, "mobile direct switch must remain enabled");
    await directSwitch.click();
    assert.equal(await directSwitch.getAttribute("aria-checked"), "true");

    const overflow = await page.evaluate(() => ({
      root: document.documentElement.scrollWidth,
      rootClient: document.documentElement.clientWidth,
      body: document.body.scrollWidth,
      bodyClient: document.body.clientWidth,
    }));
    assert.ok(overflow.root <= overflow.rootClient + 2, `mobile document horizontal overflow: ${JSON.stringify(overflow)}`);
    assert.ok(overflow.body <= overflow.bodyClient + 2, `mobile body horizontal overflow: ${JSON.stringify(overflow)}`);

    const screenshot = path.join(outDir, "mobile-controls.png");
    await page.screenshot({ path: screenshot, fullPage: true });
    artifacts.push(path.basename(screenshot));
    return { overflow };
  } finally {
    await context.close();
  }
}

function sanitize(value) {
  return String(value || "").replace(/\s+/g, " ").slice(0, 2000);
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const results = [];
  const artifacts = [];
  let server = null;
  let browser = null;
  let baseURL = process.env.QA_BASE_URL || "";
  let blocked = "";

  try {
    const { chromium } = loadPlaywright();
    if (!baseURL) {
      server = await startVite();
      baseURL = server.baseURL;
    }
    try {
      browser = await chromium.launch({ headless: true });
    } catch (error) {
      throw new BlockedError(`Playwright Chromium could not launch: ${error.message}`);
    }

    const scenarioFilter = String(process.env.QA_SCENARIO || "").trim().toLowerCase();
    for (const [name, scenario] of [
      ["failed split rerun without previous batch dialog", runFailedSplitRerunScenario],
      ["desktop nodes mode", runNodesScenario],
      ["ten-pair compact layout", runTenNodeLayoutScenario],
      ["Output preview layouts", runOutputPreviewScenario],
      ["generator style clipboard and parameter wheel", runGeneratorStyleClipboardScenario],
      ["batch controls and zoom lod", runBatchControlsAndZoomLodScenario],
      ["topbar batch controls responsive", runTopbarBatchControlsResponsiveScenario],
      ["replace previous batch", runReplaceBatchScenario],
      ["desktop direct mode", runDirectScenario],
      ["Pro Studio direct request resolutions", runProStudioDirectScenario],
      ["completed batch fanout recovery", runCompletedFanoutRecoveryScenario],
      ["transient prompt-split read recovery", runTransientPromptSplitReadScenario],
      ["mobile controls", runMobileScenario],
    ]) {
      if (scenarioFilter && !name.toLowerCase().includes(scenarioFilter)) continue;
      try {
        const detail = await scenario(browser, baseURL, artifacts);
        results.push({ name, ok: true, detail });
      } catch (error) {
        if (error instanceof BlockedError) throw error;
        results.push({ name, ok: false, detail: sanitize(error.stack || error.message) });
      }
    }
  } catch (error) {
    blocked = error instanceof BlockedError ? error.message : sanitize(error.stack || error.message);
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) stopProcessTree(server.child);
  }

  const status = blocked ? "BLOCKED" : results.every((result) => result.ok) ? "PASS" : "FAIL";
  const output = {
    task_id: taskId,
    status,
    base_url: baseURL,
    created_at: new Date().toISOString(),
    blocked: blocked || undefined,
    results,
    artifacts,
    coverage_limitations: [
      "Server process restart continuation is not exercised by this browser-only all-route mock; do not treat this smoke as restart-resumption acceptance.",
    ],
    vite_logs: server ? server.logs.join("").slice(-4000) : undefined,
  };
  fs.writeFileSync(path.join(outDir, "browser-smoke-result.json"), JSON.stringify(output, null, 2));
  console.log(`STATUS: ${status}`);
  for (const result of results) {
    console.log(`${result.ok ? "PASS" : "FAIL"}: ${result.name} ${result.ok ? "" : result.detail}`.trim());
  }
  if (blocked) console.log(`BLOCKED: ${blocked}`);
  if (status !== "PASS") process.exitCode = status === "BLOCKED" ? 2 : 1;
}

main().catch((error) => {
  console.error(`STATUS: BLOCKED\nBLOCKED: ${sanitize(error.stack || error.message)}`);
  process.exitCode = 2;
});
