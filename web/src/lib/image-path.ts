export function getManagedImagePathFromUrl(value: string) {
  const text = value.trim();
  if (!text) {
    return "";
  }

  const extractFromPath = (pathname: string) => {
    const prefix = "/images/";
    const index = pathname.indexOf(prefix);
    if (index < 0) {
      return "";
    }
    const encodedPath = pathname.slice(index + prefix.length);
    if (!encodedPath) {
      return "";
    }
    try {
      return decodeURIComponent(encodedPath);
    } catch {
      return encodedPath;
    }
  };

  try {
    const base = typeof window === "undefined" ? "http://localhost" : window.location.href;
    return extractFromPath(new URL(text, base).pathname);
  } catch {
    return extractFromPath(text);
  }
}

export function getManagedImageUrlFromPath(value: string) {
  const path = value.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!path) {
    return "";
  }
  return `/images/${path.split("/").filter(Boolean).map(encodeURIComponent).join("/")}`;
}

export function getManagedImageThumbnailUrlFromPath(value: string) {
  const path = value.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!path) {
    return "";
  }
  return `/image-thumbnails/${path.split("/").filter(Boolean).map(encodeURIComponent).join("/")}.jpg`;
}
