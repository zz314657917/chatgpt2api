const APIMART_BRAND_PATTERN = /[\s._-]*(?:\(|\[)?\s*\bapi[\s_-]*mart\b\s*(?:\)|\])?/gi;

export function cleanModelDisplayName(value: unknown, fallback = "模型") {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) {
    return fallback;
  }
  const cleaned = raw
    .replace(APIMART_BRAND_PATTERN, "")
    .replace(/\(\s*\)|\[\s*\]/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[\s._-]+$/g, "")
    .replace(/^[\s._-]+/g, "")
    .trim();
  return cleaned || fallback;
}

export function displayModelLabel(model?: string, label?: string) {
  return cleanModelDisplayName(label || model || "", model || "模型");
}
