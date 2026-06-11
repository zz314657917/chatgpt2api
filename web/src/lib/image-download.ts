import { fetchManagedImageDownloadURL, type ManagedImageListScope } from "@/lib/api";
import { fetchAuthenticatedImageBlob, shouldUseAuthenticatedImageFallback } from "@/lib/authenticated-image";

export type DownloadableImage = {
  id: string;
  src: string;
  path?: string;
  fileName: string;
};

type ImageDownloadFilters = {
  scope?: ManagedImageListScope;
  team_id?: string;
};

export function imageExtensionFromSrc(src?: string) {
  const dataUrlFormat = src?.match(/^data:image\/([^;,]+)/i)?.[1];
  const urlFormat = src?.split(/[?#]/, 1)[0]?.match(/\.([a-z0-9]+)$/i)?.[1];
  const format = String(dataUrlFormat || urlFormat || "").toLowerCase();
  if (format === "jpg" || format === "jpeg") {
    return "jpg";
  }
  if (format === "png" || format === "webp") {
    return format;
  }
  return "";
}

export function imageExtension(outputFormat?: string, src?: string) {
  if (outputFormat === "jpeg") {
    return "jpg";
  }
  return outputFormat || imageExtensionFromSrc(src) || "png";
}

export function buildTimestampedImageDownloadName({
  prefix,
  createdAt,
  id,
  index,
  outputFormat,
  src,
}: {
  prefix: string;
  createdAt?: string;
  id: string;
  index: number;
  outputFormat?: string;
  src?: string;
}) {
  const date = new Date(createdAt || "");
  const safeIndex = String(index + 1).padStart(2, "0");
  const extension = imageExtension(outputFormat, src);
  if (Number.isNaN(date.getTime())) {
    return `${prefix}-${id.slice(0, 8)}-${safeIndex}.${extension}`;
  }

  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const sec = String(date.getSeconds()).padStart(2, "0");
  return `${prefix}-${yyyy}${mm}${dd}-${hh}${min}${sec}-${safeIndex}.${extension}`;
}

export async function downloadImageFile(image: DownloadableImage, filters: ImageDownloadFilters = {}) {
  let href = image.src;
  let objectUrl = "";

  if (image.path) {
    const directDownload = await fetchManagedImageDownloadURL(image.path, filters).catch(() => null);
    if (directDownload?.direct && directDownload.download_url) {
      const link = document.createElement("a");
      link.href = directDownload.download_url;
      link.download = image.fileName;
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      link.remove();
      return;
    }
    if (directDownload?.download_url) {
      href = directDownload.download_url;
    }
  }

  if (!href.startsWith("data:")) {
    try {
      const blob = shouldUseAuthenticatedImageFallback(href)
        ? await fetchAuthenticatedImageBlob(href)
        : await fetch(href).then((response) => (response.ok ? response.blob() : null));
      if (blob) {
        objectUrl = URL.createObjectURL(blob);
        href = objectUrl;
      }
    } catch {
      href = image.src;
    }
  }

  const link = document.createElement("a");
  link.href = href;
  link.download = image.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  if (objectUrl) {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
}
