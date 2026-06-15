const { test, expect } = require("playwright/test");
const fs = require("fs");
const path = require("path");

const baseURL = process.env.QA_BASE_URL || "http://127.0.0.1:18082";
const outDir = process.env.QA_OUT_DIR || __dirname;

test("task-004 luoye browser smoke", async ({ browser }) => {
  test.setTimeout(90000);
  fs.mkdirSync(outDir, { recursive: true });
  const results = [];
  const record = (name, ok, detail = "") => results.push({ name, ok: Boolean(ok), detail });

  const anonymousContext = await browser.newContext({ viewport: { width: 1440, height: 920 } });
  const anonymousPage = await anonymousContext.newPage();
  await anonymousPage.goto(`${baseURL}/auth/logout`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await anonymousPage.goto(`${baseURL}/image`, { waitUntil: "domcontentloaded" });
  await anonymousPage.waitForURL(/\/login|127\.0\.0\.1:18081\/launch/, { timeout: 15000 }).catch(() => {});
  if (anonymousPage.url().startsWith(`${baseURL}/login`)) {
    await anonymousPage.waitForURL(/127\.0\.0\.1:18081\/launch/, { timeout: 15000 }).catch(() => {});
  }
  const anonymousSessionStatus = await anonymousPage.evaluate(async () => {
    const response = await fetch("/auth/session").catch(() => null);
    return response ? response.status : 0;
  }).catch(() => 0);
  const anonymousText = await anonymousPage.locator("body").innerText({ timeout: 10000 }).catch(() => "");
  record(
    "unauthenticated /image redirects to Sub2API launch",
    anonymousPage.url().startsWith("http://127.0.0.1:18081/launch"),
    JSON.stringify({ url: anonymousPage.url(), authSessionStatus: anonymousSessionStatus, body: anonymousText.slice(0, 600) }),
  );
  await anonymousContext.close();

  const context = await browser.newContext({ viewport: { width: 1440, height: 920 } });
  const page = await context.newPage();
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  }).catch(() => {});

  await page.goto("http://127.0.0.1:18081/launch", { waitUntil: "domcontentloaded" });
  await page.waitForURL(`${baseURL}/image`, { timeout: 20000 });
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await page.screenshot({ path: path.join(outDir, "image-authenticated.png") });
  const imageText = await page.locator("body").innerText({ timeout: 10000 });
  record("launch token returns to /image", page.url().startsWith(`${baseURL}/image`), page.url());
  record("top nav balance visible", /余额|✪123\.45|123\.45/.test(imageText), imageText.slice(0, 600));
  record("recharge entry visible", imageText.includes("充值"), imageText.slice(0, 600));
  record("ordinary image page hides forbidden API text", !/(API Key|Token|OpenAI-compatible|OpenAI compatible|API 选择)/.test(imageText), imageText.match(/API Key|Token|OpenAI-compatible|OpenAI compatible|API 选择/)?.[0] || "");

  await page.goto(`${baseURL}/profile`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  const teamTab = page.locator('[role="tab"], button').filter({ hasText: "团队空间" }).first();
  if (await teamTab.count()) {
    await teamTab.click({ timeout: 10000 }).catch(() => {});
  }
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, "profile-team.png") });
  const profileText = await page.locator("body").innerText({ timeout: 10000 });
  record("profile usage entry visible", profileText.includes("使用记录"), profileText.slice(0, 800));
  record("team create/join/switch UI visible", profileText.includes("创建团队") && profileText.includes("加入团队") && profileText.includes("个人空间") && profileText.includes("团队空间"), profileText.slice(0, 1200));
  record("ordinary profile hides forbidden API text", !/(API Key|Token|OpenAI-compatible|OpenAI compatible|API 选择)/.test(profileText), profileText.match(/API Key|Token|OpenAI-compatible|OpenAI compatible|API 选择/)?.[0] || "");

  const output = {
    baseURL,
    created_at: new Date().toISOString(),
    all_passed: results.every((item) => item.ok),
    results,
    artifacts: ["image-authenticated.png", "profile-team.png"],
  };
  fs.writeFileSync(path.join(outDir, "browser-smoke-result.json"), JSON.stringify(output, null, 2));
  await context.close();
  expect(output.all_passed, JSON.stringify(output, null, 2)).toBe(true);
});
