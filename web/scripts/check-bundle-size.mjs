import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(scriptRoot, "..");
const distRoot = path.resolve(webRoot, "../internal/web/dist");
const assetRoot = path.join(distRoot, "assets");
const maxAssetBytes = Number(process.env.BUNDLE_MAX_ASSET_BYTES || 512 * 1024);
const maxTotalBytes = Number(process.env.BUNDLE_MAX_TOTAL_BYTES || 4 * 1024 * 1024);

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

const files = (await walk(distRoot)).filter((file) => !file.path.endsWith(".br") && !file.path.endsWith(".gz"));
const assetFiles = files.filter((file) => file.path.startsWith(assetRoot + path.sep));
const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
const largestAssets = [...assetFiles].sort((a, b) => b.size - a.size).slice(0, 10);

console.log(`dist total: ${formatBytes(totalBytes)}`);
console.log("largest assets:");
for (const file of largestAssets) {
  console.log(`- ${path.relative(distRoot, file.path).replaceAll(path.sep, "/")}: ${formatBytes(file.size)}`);
}

const oversized = largestAssets.filter((file) => file.size > maxAssetBytes);
if (totalBytes > maxTotalBytes || oversized.length > 0) {
  console.error(`bundle size check failed: max asset ${formatBytes(maxAssetBytes)}, max total ${formatBytes(maxTotalBytes)}`);
  process.exitCode = 1;
}
