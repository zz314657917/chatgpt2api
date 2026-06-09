import { createReadStream, createWriteStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBrotliCompress, createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(scriptRoot, "..");
const distRoot = path.resolve(webRoot, "../internal/web/dist");
const compressibleExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".map",
  ".svg",
  ".txt",
  ".xml",
]);
const minBytes = Number(process.env.BUNDLE_COMPRESS_MIN_BYTES || 1024);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(fullPath));
      continue;
    }
    files.push(fullPath);
  }
  return files;
}

async function compressFile(file) {
  await pipeline(createReadStream(file), createBrotliCompress(), createWriteStream(`${file}.br`));
  await pipeline(createReadStream(file), createGzip({ level: 9 }), createWriteStream(`${file}.gz`));
}

const files = await walk(distRoot);
let compressed = 0;
for (const file of files) {
  if (file.endsWith(".br") || file.endsWith(".gz")) {
    continue;
  }
  if (!compressibleExtensions.has(path.extname(file).toLowerCase())) {
    continue;
  }
  const info = await stat(file);
  if (info.size < minBytes) {
    continue;
  }
  await compressFile(file);
  compressed += 1;
}

console.log(`precompressed ${compressed} dist assets`);
