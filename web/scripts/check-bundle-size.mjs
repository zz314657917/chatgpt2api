import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(scriptRoot, "..");
const distRoot = path.resolve(webRoot, "../internal/web/dist");
const assetRoot = path.join(distRoot, "assets");
const maxAssetBytes = Number(process.env.BUNDLE_MAX_ASSET_BYTES || 512 * 1024);
const maxPageBytes = Number(process.env.BUNDLE_MAX_PAGE_BYTES || 220 * 1024);
const maxTotalBytes = Number(process.env.BUNDLE_MAX_TOTAL_BYTES || 4 * 1024 * 1024);
const pageBudgetRoutes = String(process.env.BUNDLE_PAGE_BUDGET_ROUTES || "image,canvas")
  .split(",")
  .map((route) => route.trim().replace(/^\/+/, ""))
  .filter(Boolean);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(fullPath));
      continue;
    }
    const info = await stat(fullPath);
    files.push({ path: fullPath, size: info.size });
  }
  return files;
}

function formatBytes(value) {
  return `${(value / 1024).toFixed(1)} KiB`;
}

async function collectRouteChunks(assetFiles) {
  const routeChunks = new Map();
  const entryScripts = assetFiles.filter((file) => {
    const basename = path.basename(file.path);
    return basename.startsWith("index-") && basename.endsWith(".js");
  });
  for (const file of entryScripts) {
    const content = await readFile(file.path, "utf8");
    const routeImportPattern = /([A-Za-z_$][\w$]*):\(0,[^)]+\.lazy\)\(\(\)=>[\w$]+\(\(\)=>import\((?:`|")\.\/([^`"]*page-[^`"]+\.js)(?:`|")\)/g;
    for (const match of content.matchAll(routeImportPattern)) {
      routeChunks.set(path.basename(match[2]), match[1]);
    }
  }
  return routeChunks;
}

const files = (await walk(distRoot)).filter((file) => !file.path.endsWith(".br") && !file.path.endsWith(".gz"));
const assetFiles = files.filter((file) => file.path.startsWith(assetRoot + path.sep));
const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
const largestAssets = [...assetFiles].sort((a, b) => b.size - a.size).slice(0, 10);
const routeChunks = await collectRouteChunks(assetFiles);
const pageAssets = assetFiles.filter((file) => {
  const basename = path.basename(file.path);
  return basename.startsWith("page-") && basename.endsWith(".js");
});
const largestPageAssets = [...pageAssets].sort((a, b) => b.size - a.size).slice(0, 10);
const pageBudgetRouteSet = new Set(pageBudgetRoutes);
const budgetAllPages = pageBudgetRouteSet.has("all") || pageBudgetRouteSet.has("*");
const pageAssetsToBudget = budgetAllPages
  ? pageAssets
  : pageAssets.filter((file) => pageBudgetRouteSet.has(routeChunks.get(path.basename(file.path)) || ""));

console.log(`dist total: ${formatBytes(totalBytes)}`);
console.log("largest assets:");
for (const file of largestAssets) {
  console.log(`- ${path.relative(distRoot, file.path).replaceAll(path.sep, "/")}: ${formatBytes(file.size)}`);
}
console.log("largest page chunks:");
for (const file of largestPageAssets) {
  const routeName = routeChunks.get(path.basename(file.path));
  const routeLabel = routeName ? ` (${routeName})` : "";
  console.log(`- ${path.relative(distRoot, file.path).replaceAll(path.sep, "/")}${routeLabel}: ${formatBytes(file.size)}`);
}
console.log(`page budget routes: ${budgetAllPages ? "all" : pageBudgetRoutes.join(", ") || "(none)"}`);

const oversized = largestAssets.filter((file) => file.size > maxAssetBytes);
const oversizedPages = pageAssetsToBudget.filter((file) => file.size > maxPageBytes);
if (totalBytes > maxTotalBytes || oversized.length > 0 || oversizedPages.length > 0) {
  console.error(`bundle size check failed: max asset ${formatBytes(maxAssetBytes)}, max page ${formatBytes(maxPageBytes)}, max total ${formatBytes(maxTotalBytes)}`);
  for (const file of oversizedPages.sort((a, b) => b.size - a.size)) {
    const routeName = routeChunks.get(path.basename(file.path));
    const routeLabel = routeName ? ` (${routeName})` : "";
    console.error(`- oversized page ${path.relative(distRoot, file.path).replaceAll(path.sep, "/")}${routeLabel}: ${formatBytes(file.size)}`);
  }
  process.exitCode = 1;
}
