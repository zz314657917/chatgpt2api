const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { stripVTControlCharacters } = require("node:util");
const { chromium } = require("playwright");

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
const outDir = path.resolve(__dirname, "../../output/playwright/canvas-paste-upload");

async function pasteImages(page, count = 1, selector = "body") {
  await page.evaluate(({ count, selector }) => {
    const data = new DataTransfer();
    for (let i = 0; i < count; i++) {
      data.items.add(new File([new Uint8Array([137, 80, 78, 71])], `paste-${i}.png`, { type: "image/png" }));
    }
    const event = new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true });
    document.querySelector(selector).dispatchEvent(event);
  }, { count, selector });
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const server = spawn(process.execPath, [path.resolve(__dirname, "../node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", "0"], {
    cwd: path.resolve(__dirname, ".."),
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let browser;
  try {
    const baseURL = await new Promise((resolve, reject) => {
      let output = "";
      const timer = setTimeout(() => reject(new Error(`Vite startup timeout: ${output}`)), 20000);
      server.stdout.on("data", (chunk) => {
        output += stripVTControlCharacters(String(chunk));
        const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
        if (match) {
          clearTimeout(timer);
          resolve(match[0]);
        }
      });
      server.stderr.on("data", (chunk) => { output += String(chunk); });
      server.once("error", (error) => { clearTimeout(timer); reject(error); });
    });
    browser = await chromium.launch({ headless: true, channel: "msedge" });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(() => {
      localStorage.setItem("smart-canvas-onboarding-dismissed-v1", "1");
      localStorage.setItem("smart-canvas-left-rail-collapsed", "1");
    });
    const now = new Date().toISOString();
    let canvas = {
      id: "paste-qa", name: "Paste upload QA", owner_id: "qa-user", kind: "smart", schema_version: 2,
      viewport: { x: 0, y: 0, zoom: 1 }, nodes: [], edges: [], created_at: now, updated_at: now,
    };
    const pendingUploads = [];
    const errors = [];
    const reply = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname === "/auth/session") {
        return reply(route, { ok: true, token: "mock-only", role: "admin", subject_id: "qa-user", name: "QA", creation_concurrent_limit: 10, menu_paths: ["/canvas"], api_permissions: [], menus: [] });
      }
      if (url.pathname === "/api/images/uploads") {
        pendingUploads.push(route);
        return;
      }
      if (url.pathname === "/api/canvases" && request.method() === "GET") return reply(route, { items: [canvas] });
      if (url.pathname.startsWith("/api/canvases") && request.method() === "POST") {
        canvas = { ...request.postDataJSON(), id: "paste-qa", owner_id: "qa-user", updated_at: now };
        return reply(route, { item: canvas });
      }
      if (url.pathname === "/api/canvas/models") return reply(route, { items: [] });
      if (url.pathname === "/api/teams") return reply(route, { scope: { type: "personal" }, teams: [] });
      if (url.pathname.startsWith("/api/")) return reply(route, { items: [], groups: [], has_more: false });
      if (url.pathname.startsWith("/images/")) return route.fulfill({ contentType: "image/png", body: png });
      return route.continue();
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${baseURL}/canvas`, { waitUntil: "networkidle" });
    const nodes = page.locator("[data-canvas-node-id]");
    const status = page.getByRole("status", { name: "正在上传图片", exact: true });
    await pasteImages(page);
    await status.waitFor({ state: "visible" });
    assert.equal(await nodes.count(), 1);
    assert.equal(await status.locator(".animate-spin").count(), 1);
    assert.equal(await status.locator(".animate-spin").evaluate((element) => getComputedStyle(element).animationName), "spin");
    const nodeId = await nodes.first().getAttribute("data-canvas-node-id");
    await page.waitForFunction(() => document.querySelector('[role="status"][aria-label="正在上传图片"]') !== null);
    assert.equal(pendingUploads.length, 1);
    await page.screenshot({ path: path.join(outDir, "uploading.png") });
    await reply(pendingUploads.shift(), { items: [{ path: "/images/pasted.png", name: "pasted.png", visibility: "private" }] });
    await status.waitFor({ state: "detached" });
    assert.equal(await nodes.count(), 1);
    assert.equal(await nodes.first().getAttribute("data-canvas-node-id"), nodeId);
    await nodes.first().getByText("pasted.png", { exact: true }).first().waitFor();

    await pasteImages(page, 2);
    await status.waitFor({ state: "visible" });
    assert.equal(await nodes.count(), 2);
    await status.getByText("2 张图片上传中", { exact: true }).waitFor();
    assert.equal(pendingUploads.length, 1);
    await reply(pendingUploads.shift(), { error: "mock upload failed" }, 500);
    await status.waitFor({ state: "detached" });
    await page.getByText("上传失败", { exact: true }).waitFor();
    assert.equal(await nodes.count(), 2);
    await page.screenshot({ path: path.join(outDir, "failed.png") });

    await page.evaluate(() => {
      const input = document.createElement("textarea");
      input.id = "paste-input-qa";
      document.body.appendChild(input);
    });
    await pasteImages(page, 1, "#paste-input-qa");
    assert.equal(await nodes.count(), 2);
    assert.equal(pendingUploads.length, 0);
    assert.deepEqual(errors, []);
    console.log("PASS: immediate node + animated uploading status; success updates same node; selected image creates new node; multi-image failure retained; text input paste ignored; no page errors.");
  } finally {
    await browser?.close();
    server.kill();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
