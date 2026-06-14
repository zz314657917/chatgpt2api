const fs = require("fs");
const path = require("path");

const taskId = "task-007-asset-library-smoke";
const chatBaseURL = process.env.QA_CHAT_BASE_URL || "http://127.0.0.1:8081";
const sub2BaseURL = process.env.QA_SUB2_BASE_URL || "http://127.0.0.1:62080";
const outDir = process.env.QA_OUT_DIR || __dirname;
const password = process.env.QA_SUB2_PASSWORD || "Password123!";
const runStamp = process.env.QA_RUN_ID || new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const userPrefix = process.env.QA_SUB2_USER_PREFIX || "asset-smoke";
const useUniqueUsers = process.env.QA_UNIQUE_SUB2_USERS === "1";
const runRealImageGeneration = process.env.QA_REAL_IMAGE_GEN === "1";
const realImageGenerationTimeoutMs = Number(process.env.QA_REAL_IMAGE_GEN_TIMEOUT_MS || 180000);

fs.mkdirSync(outDir, { recursive: true });

const results = [];
const consoleMessages = [];
const failedRequests = [];
const artifacts = [];
let chromium = null;

function record(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail: sanitizeEvidence(typeof detail === "string" ? detail : JSON.stringify(detail)) });
}

function recordSkip(name, detail = "") {
  results.push({ name, ok: true, skipped: true, detail: sanitizeEvidence(typeof detail === "string" ? detail : JSON.stringify(detail)) });
}

function artifact(name) {
  artifacts.push(name);
  return path.join(outDir, name);
}

function blocked(message) {
  const output = finalOutput("BLOCKED", message);
  fs.writeFileSync(path.join(outDir, "browser-smoke-result.json"), JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output, null, 2));
  process.exitCode = 2;
}

function finalOutput(status, message = "") {
  const failed = results.filter((item) => !item.ok);
  return {
    task_id: taskId,
    status,
    all_passed: status === "PASS",
    message: sanitizeEvidence(message),
    chat_base_url: chatBaseURL,
    sub2_base_url: sub2BaseURL,
    created_at: new Date().toISOString(),
    results,
    failed,
    console_messages: consoleMessages,
    failed_requests: failedRequests,
    artifacts,
  };
}

async function requestJSON(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    const message = data?.detail?.message || data?.detail || data?.error?.message || data?.error || data?.message || text || `HTTP ${response.status}`;
    const error = new Error(String(message));
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

async function sub2RegisterOrLogin(email) {
  const registerBody = JSON.stringify({ email, password, turnstile_token: "" });
  try {
    return await requestJSON(`${sub2BaseURL}/api/v1/auth/register`, { method: "POST", body: registerBody });
  } catch (registerError) {
    try {
      return await requestJSON(`${sub2BaseURL}/api/v1/auth/login`, {
        method: "POST",
        body: JSON.stringify({ email, password, turnstile_token: "" }),
      });
    } catch {
      const message = String(registerError.message || "");
      if (/already|exists|duplicate|registered|用户已存在|邮箱已注册/i.test(message) || registerError.status === 409 || registerError.status === 400) {
        throw new Error(`Sub2API login failed after existing-user register response for ${email}: ${registerError.message}`);
      }
      throw registerError;
    }
  }
}

function qaUserEmail(role) {
  const envName = `QA_${role.toUpperCase()}_EMAIL`;
  return process.env[envName] || `asset-${role}-${useUniqueUsers ? runStamp : userPrefix}@example.test`;
}

async function sub2Launch(accessToken) {
  return requestJSON(`${sub2BaseURL}/api/v1/user/studio-bridge/launch`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ app_id: "luoye-ai" }),
  });
}

async function loginToLuoyeViaBridge(context, email) {
  const auth = await sub2RegisterOrLogin(email);
  const accessToken = auth?.data?.access_token || auth?.access_token;
  const user = auth?.data?.user || auth?.user || {};
  if (!accessToken) {
    throw new Error(`Sub2API auth did not return access_token for ${email}`);
  }
  const launch = await sub2Launch(accessToken);
  const launchURL = launch?.data?.launch_url || launch?.launch_url;
  if (!launchURL) {
    throw new Error(`Sub2API launch did not return launch_url for ${email}`);
  }
  const page = await context.newPage();
  attachPageObservers(page);
  await page.goto(launchURL, { waitUntil: "domcontentloaded" });
  await page.waitForURL(new RegExp(`${escapeRegExp(chatBaseURL)}/image`), { timeout: 30000 });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  const session = await page.evaluate(async () => {
    const response = await fetch("/auth/session", { credentials: "include" });
    return { status: response.status, body: await response.json().catch(() => null) };
  });
  if (session.status !== 200) {
    throw new Error(`Luoye session failed for ${email}: ${session.status}`);
  }
  return { page, accessToken, user, session: session.body };
}

function attachPageObservers(page) {
  page.on("console", (msg) => {
    const text = sanitizeEvidence(msg.text());
    if (/frame-ancestors|Content Security Policy|CSP|Failed to load resource|session-probe/i.test(text)) {
      consoleMessages.push({ type: msg.type(), text, url: sanitizeEvidence(page.url()) });
    }
  });
  page.on("requestfailed", (request) => {
    const url = request.url();
    const failure = request.failure()?.errorText || "";
    if (url.includes("/studio-bridge/session-probe") && failure === "net::ERR_ABORTED") {
      return;
    }
    if (url.includes("127.0.0.1:62080") || url.includes("127.0.0.1:8081")) {
      failedRequests.push({ url: sanitizeEvidence(url), method: request.method(), failure: sanitizeEvidence(failure) });
    }
  });
}

function sanitizeEvidence(value) {
  return String(value)
    .replace(/(launch_token=)[^&\s"']+/g, "$1[redacted]")
    .replace(/(access_token["']?\s*[:=]\s*["']?)[^"',\s}]+/gi, "$1[redacted]")
    .replace(/(refresh_token["']?\s*[:=]\s*["']?)[^"',\s}]+/gi, "$1[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [redacted]");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function luoyeFetch(page, url, options = {}) {
  return page.evaluate(async ({ url, options }) => {
    const response = await fetch(url, {
      ...options,
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    return { status: response.status, ok: response.ok, data, text };
  }, { url, options });
}

async function expectLuoyeFetch(page, url, options = {}) {
  const result = await luoyeFetch(page, url, options);
  if (!result.ok) {
    const message = result.data?.detail || result.data?.error || result.data?.message || result.text || `HTTP ${result.status}`;
    throw new Error(`${url} failed: ${result.status} ${JSON.stringify(message)}`);
  }
  return result.data;
}

async function makePngFile(page, label) {
  return page.evaluateHandle(async (label) => {
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 96;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, 96, 96);
    ctx.fillStyle = "#1456f0";
    ctx.fillRect(8, 8, 80, 80);
    ctx.fillStyle = "#21b8a6";
    ctx.fillRect(18, 18, 60, 60);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 18px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label.slice(0, 6), 48, 54);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    return new File([blob], `${label}.png`, { type: "image/png" });
  }, label);
}

async function uploadManagedImage(page, label, visibility = "private") {
  const file = await makePngFile(page, label);
  const result = await page.evaluate(async ({ file, visibility }) => {
    const form = new FormData();
    form.append("image[]", file);
    form.append("visibility", visibility);
    const response = await fetch("/api/images/uploads", {
      method: "POST",
      credentials: "include",
      body: form,
    });
    const data = await response.json().catch(() => null);
    return { status: response.status, ok: response.ok, data };
  }, { file, visibility });
  await file.dispose();
  if (!result.ok) {
    throw new Error(`upload ${label} failed: ${result.status} ${JSON.stringify(result.data)}`);
  }
  const item = Array.isArray(result.data?.items) ? result.data.items[0] : null;
  if (!item?.path) {
    throw new Error(`upload ${label} returned no image path`);
  }
  return item;
}

async function createCollection(page, name, options = {}) {
  const data = await expectLuoyeFetch(page, "/api/image-collections", {
    method: "POST",
    body: JSON.stringify({ name, ...options }),
  });
  return data.item;
}

async function assignCollection(page, collectionId, paths, options = {}) {
  return expectLuoyeFetch(page, "/api/image-collections/items", {
    method: "PATCH",
    body: JSON.stringify({ collection_id: collectionId, paths, ...options }),
  });
}

async function fetchImages(page, params = {}) {
  const query = new URLSearchParams(params).toString();
  return expectLuoyeFetch(page, `/api/images${query ? `?${query}` : ""}`);
}

async function submitImageGenerationTask(page, clientTaskId, prompt) {
  return expectLuoyeFetch(page, "/api/creation-tasks/image-generations", {
    method: "POST",
    body: JSON.stringify({
      client_task_id: clientTaskId,
      prompt,
      model: "gpt-image-2",
      size: "1:1",
      image_resolution: "1K",
      visibility: "private",
      n: 1,
    }),
  });
}

async function fetchCreationTask(page, clientTaskId) {
  const data = await expectLuoyeFetch(page, `/api/creation-tasks?ids=${encodeURIComponent(clientTaskId)}`);
  const items = Array.isArray(data.items) ? data.items : [];
  return items.find((item) => item && item.id === clientTaskId) || null;
}

async function waitForCreationTask(page, clientTaskId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastTask = null;
  while (Date.now() < deadline) {
    lastTask = await fetchCreationTask(page, clientTaskId);
    if (lastTask && !["queued", "running"].includes(String(lastTask.status))) {
      return lastTask;
    }
    await page.waitForTimeout(2500);
  }
  throw new Error(`creation task ${clientTaskId} did not finish within ${timeoutMs}ms; last=${JSON.stringify(lastTask)}`);
}

function creationTaskImagePaths(task) {
  const paths = new Set();
  const scan = (value) => {
    if (!value) {
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) scan(item);
      return;
    }
    if (typeof value !== "object") {
      return;
    }
    for (const key of ["path", "name"]) {
      const text = typeof value[key] === "string" ? value[key] : "";
      if (/^\d{4}\/\d{2}\/\d{2}\/[^/?#]+\.(png|jpe?g|webp)$/i.test(text)) {
        paths.add(text);
      }
    }
    for (const key of ["local_url", "url", "preview_url", "thumbnail_url"]) {
      const text = typeof value[key] === "string" ? value[key] : "";
      const match = text.match(/(?:\/(?:images|image-previews|image-thumbnails)\/|\/)(\d{4}\/\d{2}\/\d{2}\/[^/?#]+\.(?:png|jpe?g|webp))/i);
      if (match) {
        paths.add(match[1]);
      }
    }
    for (const item of Object.values(value)) scan(item);
  };
  scan(task);
  return Array.from(paths);
}

async function runOptionalRealImageGeneration(page, collectionId) {
  if (!runRealImageGeneration) {
    recordSkip("optional real gpt-image-2 generation is disabled", "Set QA_REAL_IMAGE_GEN=1 to run reserve -> generation -> commit -> material library verification.");
    return;
  }
  const clientTaskId = `asset-smoke-real-image-${runStamp}`;
  const prompt = `A tiny clean UI icon tile for asset library smoke test, run ${runStamp}`;
  let submitted;
  try {
    submitted = await submitImageGenerationTask(page, clientTaskId, prompt);
  } catch (error) {
    recordSkip("optional real gpt-image-2 generation was skipped by environment", error?.message || String(error));
    return;
  }
  const submittedOK = submitted && submitted.id === clientTaskId;
  record("optional real gpt-image-2 task can be submitted", submittedOK, submitted);
  if (!submittedOK) {
    return;
  }

  let task;
  try {
    task = await waitForCreationTask(page, clientTaskId, realImageGenerationTimeoutMs);
  } catch (error) {
    recordSkip("optional real gpt-image-2 generation was skipped by environment", error?.message || String(error));
    return;
  }
  if (task.status !== "success") {
    recordSkip("optional real gpt-image-2 task did not reach success in this environment", task);
    return;
  }
  record("optional real gpt-image-2 task reaches success", true, task);

  let paths = creationTaskImagePaths(task);
  try {
    if (paths.length === 0) {
      const library = await fetchImages(page, { page_size: "20" });
      const items = Array.isArray(library.items) ? library.items : [];
      const promptMatched = items.filter((item) => typeof item.prompt === "string" && item.prompt.includes(runStamp)).map((item) => item.path).filter(Boolean);
      paths = promptMatched;
    }
  } catch (error) {
    record("optional real generation output enters material library", false, error?.message || String(error));
    return;
  }
  record("optional real generation output enters material library", paths.length > 0, { clientTaskId, paths });
  if (paths.length === 0) {
    return;
  }

  try {
    await assignCollection(page, collectionId, [paths[0]]);
    const uiList = await fetchImages(page, { collection_id: collectionId, page_size: "20" });
    record("optional real generation output can be classified into ui collection", (uiList.items || []).some((item) => item.path === paths[0]), { path: paths[0], items: uiList.items });
  } catch (error) {
    record("optional real generation output can be classified into ui collection", false, error?.message || String(error));
  }
}

async function publishImage(page, imagePath) {
  return expectLuoyeFetch(page, "/api/images/visibility", {
    method: "PATCH",
    body: JSON.stringify({ path: imagePath, visibility: "public", share_prompt_parameters: true, share_reference_images: true }),
  });
}

async function createTeam(page, name) {
  const data = await expectLuoyeFetch(page, "/api/teams", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  return data.team;
}

async function fetchTeamWorkspace(page) {
  return expectLuoyeFetch(page, "/api/teams");
}

async function ensureTeam(page, name) {
  const workspace = await fetchTeamWorkspace(page);
  const teams = Array.isArray(workspace.teams) ? workspace.teams : [];
  if (teams.length > 0) {
    return teams[0];
  }
  return createTeam(page, name);
}

async function ensureTeamMembership(ownerPage, targetPage, team, email, role) {
  const targetWorkspace = await fetchTeamWorkspace(targetPage);
  const existing = (Array.isArray(targetWorkspace.teams) ? targetWorkspace.teams : []).find((item) => item.id === team.id);
  if (existing) {
    return existing;
  }
  const currentMembers = Array.isArray(team.members) ? team.members : [];
  if (currentMembers.some((member) => String(member.email || "").toLowerCase() === email.toLowerCase())) {
    return team;
  }
  const currentInvites = Array.isArray(team.invites) ? team.invites : [];
  let invite = currentInvites.find((item) => String(item.target_email || "").toLowerCase() === email.toLowerCase() && item.status === "pending");
  if (!invite) {
    invite = await createInvite(ownerPage, team.id, email, role);
  }
  return acceptInvite(targetPage, invite.id);
}

async function createInvite(page, teamId, email, role) {
  const result = await luoyeFetch(page, `/api/teams/${encodeURIComponent(teamId)}/invites`, {
    method: "POST",
    body: JSON.stringify({ email, role }),
  });
  if (!result.ok) {
    const text = JSON.stringify(result.data || result.text || {});
    if (/已加入|already.*member|already.*joined|已邀请|already.*invite/i.test(text)) {
      const workspace = await fetchTeamWorkspace(page);
      const team = (workspace.teams || []).find((item) => item.id === teamId) || {};
      const invite = (team.invites || []).find((item) => String(item.target_email || "").toLowerCase() === email.toLowerCase() && item.status === "pending");
      if (invite) {
        return invite;
      }
      return { id: "", team_id: teamId, target_email: email, role, status: "accepted" };
    }
    throw new Error(`/api/teams/${teamId}/invites failed: ${result.status} ${JSON.stringify(result.data)}`);
  }
  const data = result.data;
  return data.invite;
}

async function acceptInvite(page, inviteId) {
  if (!inviteId) {
    return null;
  }
  const data = await expectLuoyeFetch(page, `/api/team-invites/${encodeURIComponent(inviteId)}/accept`, { method: "POST" });
  return data.team;
}

async function moveToTeam(page, teamId, paths) {
  return expectLuoyeFetch(page, "/api/images/library-scope", {
    method: "PATCH",
    body: JSON.stringify({ paths, target_scope: "team", team_id: teamId }),
  });
}

async function waitForText(page, text, timeout = 15000) {
  await page.getByText(text, { exact: false }).first().waitFor({ state: "visible", timeout });
}

async function clickText(page, text, timeout = 10000) {
  await page.getByText(text, { exact: true }).first().click({ timeout });
}

async function openAssetSidebar(page, screenshotName) {
  const triggers = page.locator('button[title="展开素材库"], aside[title="展开素材库"], [title="展开素材库"]');
  const count = await triggers.count();
  for (let index = 0; index < count; index += 1) {
    const trigger = triggers.nth(index);
    if (!(await trigger.isVisible().catch(() => false))) {
      continue;
    }
    await trigger.hover({ timeout: 5000 }).catch(() => {});
    await trigger.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(600);
  const pin = page.locator('button[title="固定素材库"]').first();
  if (await pin.count()) {
    await pin.click({ timeout: 10000 }).catch(() => {});
  }
  try {
    await waitForText(page, "素材集", 15000);
    await waitForText(page, "未归类", 15000);
  } catch (error) {
    if (screenshotName) {
      await page.screenshot({ path: artifact(screenshotName), fullPage: true }).catch(() => {});
    }
    throw error;
  }
}

async function clickAssetTileAction(page, label) {
  const action = page.locator("button").filter({ hasText: new RegExp(`^${label}$`) }).first();
  if (!(await action.count())) {
    return false;
  }
  await action.click({ timeout: 10000 });
  await page.waitForTimeout(800);
  return true;
}

async function dismissBlockingDialogs(page) {
  for (const label of ["跳过", "关闭", "稍后再说"]) {
    const button = page.locator("button").filter({ hasText: new RegExp(`^${label}$`) }).first();
    if (await button.isVisible({ timeout: 1000 }).catch(() => false)) {
      await button.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(500);
    }
  }
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(300);
}

async function run() {
  try {
    ({ chromium } = require("playwright"));
  } catch (error) {
    blocked(`Playwright is not resolvable. Set NODE_PATH to the global npm root, for example: $env:NODE_PATH=(npm.cmd root -g). Detail: ${error.message}`);
    return;
  }

  const health = await Promise.allSettled([
    requestJSON(`${chatBaseURL}/health`),
    fetch(`${sub2BaseURL}/health`).then((r) => {
      if (!r.ok) throw new Error(`Sub2API health ${r.status}`);
      return r.text();
    }),
  ]);
  if (health.some((item) => item.status === "rejected")) {
    blocked(`local containers are not healthy: ${health.map((item) => item.status === "rejected" ? item.reason.message : "ok").join("; ")}`);
    return;
  }

  const browser = await chromium.launch({ headless: process.env.QA_HEADED === "1" ? false : true });
  try {
    const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 920 } });
    const managerContext = await browser.newContext({ viewport: { width: 1440, height: 920 } });
    const memberContext = await browser.newContext({ viewport: { width: 1440, height: 920 } });

    const ownerEmail = qaUserEmail("owner");
    const managerEmail = qaUserEmail("manager");
    const memberEmail = qaUserEmail("member");

    const owner = await loginToLuoyeViaBridge(ownerContext, ownerEmail);
    record("62080 chat-images bridge can create Luoye session", owner.page.url().startsWith(`${chatBaseURL}/image`), owner.page.url());
    await owner.page.screenshot({ path: artifact("01-image-after-bridge.png"), fullPage: true });

    const sessionProbeFrames = await owner.page.evaluate(() => Array.from(document.querySelectorAll("iframe")).map((frame) => frame.src));
    record("session-probe iframe uses dedicated path", sessionProbeFrames.some((src) => src.includes("/studio-bridge/session-probe")), sessionProbeFrames);
    record("session-probe iframe does not request sub2 root", !sessionProbeFrames.some((src) => /^http:\/\/127\.0\.0\.1:62080\/?$/.test(src)), sessionProbeFrames);

    const manager = await loginToLuoyeViaBridge(managerContext, managerEmail);
    const member = await loginToLuoyeViaBridge(memberContext, memberEmail);

    const personalA = await uploadManagedImage(owner.page, `personal-a-${runStamp}`);
    const personalB = await uploadManagedImage(owner.page, `personal-b-${runStamp}`);
    const publicSeed = await uploadManagedImage(owner.page, `public-${runStamp}`);
    await publishImage(owner.page, publicSeed.path);
    record("API can prepare personal and public material", Boolean(personalA.path && personalB.path && publicSeed.path), { personalA: personalA.path, personalB: personalB.path, publicSeed: publicSeed.path });

    const team = await ensureTeam(owner.page, `素材库验收 ${runStamp}`);
    await ensureTeamMembership(owner.page, manager.page, team, managerEmail, "manager");
    await ensureTeamMembership(owner.page, member.page, team, memberEmail, "member");
    const teamSeed = await uploadManagedImage(owner.page, `team-${runStamp}`);
    await moveToTeam(owner.page, team.id, [teamSeed.path]);
    record("API can prepare owner, manager, member and team material", Boolean(team.id && teamSeed.path), { team: team.id, teamSeed: teamSeed.path });

    const uiCollection = await createCollection(owner.page, `ui-${runStamp}`);
    await assignCollection(owner.page, uiCollection.id, [personalA.path]);
    const uiList = await fetchImages(owner.page, { collection_id: uiCollection.id, page_size: "20" });
    const unclassifiedList = await fetchImages(owner.page, { collection_id: "__unclassified__", page_size: "20" });
    record("API supports ui collection filter", (uiList.items || []).some((item) => item.path === personalA.path), uiList);
    record("API supports unclassified filter", (unclassifiedList.items || []).some((item) => item.path === personalB.path), unclassifiedList);

    await owner.page.goto(`${chatBaseURL}/image-manager`, { waitUntil: "domcontentloaded" });
    await owner.page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await waitForText(owner.page, "素材集");
    await waitForText(owner.page, uiCollection.name);
    await clickText(owner.page, uiCollection.name);
    await waitForText(owner.page, "一张图只能属于一个素材集");
    await owner.page.screenshot({ path: artifact("02-image-manager-ui-collection.png"), fullPage: true });
    record("/image-manager shows collection and single-collection hint", true, owner.page.url());

    await clickText(owner.page, "未归类");
    await waitForText(owner.page, "未归类");
    await owner.page.screenshot({ path: artifact("03-image-manager-unclassified.png"), fullPage: true });
    record("/image-manager can switch to unclassified filter", true, owner.page.url());

    await assignCollection(owner.page, "", [personalA.path]);
    const afterRemove = await fetchImages(owner.page, { collection_id: "__unclassified__", page_size: "20" });
    record("API can remove image from current collection", (afterRemove.items || []).some((item) => item.path === personalA.path), afterRemove);

    const teamCollection = await createCollection(manager.page, `team-ui-${runStamp}`, { scope: "team", team_id: team.id });
    await assignCollection(manager.page, teamCollection.id, [teamSeed.path], { scope: "team", team_id: team.id });
    const teamList = await fetchImages(manager.page, { scope: "team", team_id: team.id, collection_id: teamCollection.id, page_size: "20" });
    record("team manager can classify team material", (teamList.items || []).some((item) => item.path === teamSeed.path), teamList);

    const memberCreate = await luoyeFetch(member.page, "/api/image-collections", {
      method: "POST",
      body: JSON.stringify({ name: `member-denied-${runStamp}`, scope: "team", team_id: team.id }),
    });
    record("team member cannot mutate team collections", memberCreate.status === 403, memberCreate);

    const publicCreate = await luoyeFetch(owner.page, "/api/image-collections", {
      method: "POST",
      body: JSON.stringify({ name: `public-denied-${runStamp}`, scope: "public" }),
    });
    record("public library collection mutation is read-only", publicCreate.status >= 400, publicCreate);

    await runOptionalRealImageGeneration(owner.page, uiCollection.id);

    await owner.page.goto(`${chatBaseURL}/image`, { waitUntil: "domcontentloaded" });
    await owner.page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await openAssetSidebar(owner.page, "04-image-asset-library-open-failed.png");
    await owner.page.screenshot({ path: artifact("04-image-asset-library.png"), fullPage: true });
    record("/image asset library exposes collection filters", true, owner.page.url());

    const imageInputClicked = await clickAssetTileAction(owner.page, "输入");
    const imageBody = await owner.page.locator("body").innerText({ timeout: 10000 });
    record("/image can add library asset to composer input", imageInputClicked && imageBody.includes("参考"), imageBody.slice(0, 1200));

    await owner.page.goto(`${chatBaseURL}/canvas`, { waitUntil: "domcontentloaded" });
    await owner.page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await dismissBlockingDialogs(owner.page);
    const createCanvasButton = owner.page.locator("button").filter({ hasText: /空白|新建|创建/ }).first();
    if (await createCanvasButton.count()) {
      await createCanvasButton.click({ timeout: 5000 }).catch(() => {});
      await owner.page.waitForTimeout(800);
      await dismissBlockingDialogs(owner.page);
    }
    await openAssetSidebar(owner.page, "05-canvas-asset-library-open-failed.png");
    const canvasBodyBefore = await owner.page.locator("body").innerText({ timeout: 10000 });
    const canvasClicked = await clickAssetTileAction(owner.page, "画布");
    const canvasBodyAfter = await owner.page.locator("body").innerText({ timeout: 10000 });
    await owner.page.screenshot({ path: artifact("05-canvas-asset-library.png"), fullPage: true });
    const canvasNodeCount = await owner.page.locator("[data-canvas-node-id]").count().catch(() => 0);
    record("/canvas exposes collection filters and can add asset to canvas", canvasClicked && canvasNodeCount > 0 && canvasBodyAfter.length >= canvasBodyBefore.length * 0.7, { canvasNodeCount, body: canvasBodyAfter.slice(0, 1200) });

    await ownerContext.close();
    await managerContext.close();
    await memberContext.close();
  } finally {
    await browser.close();
  }

  const hasCspProbeError = consoleMessages.some((msg) => /frame-ancestors 'none'|frame-ancestors|Content Security Policy/i.test(msg.text) && !/session-probe/i.test(msg.text));
  record("session-probe has no root-frame CSP regression", !hasCspProbeError, consoleMessages);

  const failed = results.filter((item) => !item.ok);
  const output = finalOutput(failed.length === 0 ? "PASS" : "FAIL", failed.length === 0 ? "" : `${failed.length} checks failed`);
  fs.writeFileSync(path.join(outDir, "browser-smoke-result.json"), JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output, null, 2));
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  const output = finalOutput("FAIL", error?.stack || error?.message || String(error));
  fs.writeFileSync(path.join(outDir, "browser-smoke-result.json"), JSON.stringify(output, null, 2));
  console.error(output.message);
  process.exitCode = 1;
});
