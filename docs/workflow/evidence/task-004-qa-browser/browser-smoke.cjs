const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const os = require("os");

const baseURL = process.env.QA_BASE_URL || "http://127.0.0.1:18082";
const outDir = process.env.QA_OUT_DIR || __dirname;

function record(results, name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail });
}

async function visibleText(page) {
  return await page.locator("body").textContent({ timeout: 10000 }) || "";
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const results = [];
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "luoye-qa-browser-"));
  const context = await chromium.launchPersistentContext(userDataDir, { headless: true, viewport: { width: 1440, height: 920 } });
  const page = await context.newPage();
  const navigations = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      navigations.push(frame.url());
    }
  });

  try {
    await page.goto(`${baseURL}/image`, { waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/login|127\.0\.0\.1:18081\/launch/, { timeout: 12000 }).catch(() => {});
    if (page.url().startsWith(`${baseURL}/login`)) {
      await page.waitForURL(/127\.0\.0\.1:18081\/launch/, { timeout: 12000 }).catch(() => {});
    }
    const observedAnonymousRedirect = navigations.some((url) => url.startsWith(`${baseURL}/login`) || url.startsWith("http://127.0.0.1:18081/launch"));
    record(results, "unauthenticated /image redirects to Sub2API launch", observedAnonymousRedirect, navigations.join(" -> ") || page.url());

    await page.goto("http://127.0.0.1:18081/launch", { waitUntil: "domcontentloaded" });
    await page.waitForURL(`${baseURL}/image`, { timeout: 20000 });
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    await page.screenshot({ path: path.join(outDir, "image-authenticated.png"), fullPage: true });
    const imageText = await visibleText(page);
    record(results, "launch token returns to /image", page.url().startsWith(`${baseURL}/image`), page.url());
    record(results, "top nav balance visible", /余额|¥123\.45|123\.45/.test(imageText), imageText.slice(0, 600));
    record(results, "recharge entry visible", imageText.includes("充值"), imageText.slice(0, 600));
    record(results, "ordinary image page hides forbidden API text", !/(API Key|Token|OpenAI-compatible|OpenAI compatible|API 选择)/.test(imageText), imageText.match(/API Key|Token|OpenAI-compatible|OpenAI compatible|API 选择/)?.[0] || "");

    await page.goto(`${baseURL}/profile`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    await page.getByRole("button", { name: "团队空间" }).click({ timeout: 10000 }).catch(() => {});
    await page.screenshot({ path: path.join(outDir, "profile-team.png"), fullPage: true });
    const profileText = await visibleText(page);
    record(results, "profile usage entry visible", profileText.includes("使用记录"), profileText.slice(0, 800));
    record(results, "team create/join/switch UI visible", profileText.includes("创建团队") && profileText.includes("加入团队") && profileText.includes("个人空间") && profileText.includes("团队空间"), profileText.slice(0, 1200));
    record(results, "ordinary profile hides forbidden API text", !/(API Key|Token|OpenAI-compatible|OpenAI compatible|API 选择)/.test(profileText), profileText.match(/API Key|Token|OpenAI-compatible|OpenAI compatible|API 选择/)?.[0] || "");
  } finally {
    await context.close();
  }

  const output = {
    baseURL,
    created_at: new Date().toISOString(),
    all_passed: results.every((item) => item.ok),
    results,
    artifacts: ["image-authenticated.png", "profile-team.png"],
  };
  fs.writeFileSync(path.join(outDir, "browser-smoke-result.json"), JSON.stringify(output, null, 2));
  if (!output.all_passed) {
    console.error(JSON.stringify(output, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify(output, null, 2));
})();
