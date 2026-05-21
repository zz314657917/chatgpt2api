"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties, type ImgHTMLAttributes } from "react";

import {
  fetchCachedAuthenticatedImage,
  releaseCachedAuthenticatedImage,
  resolveImageRequestURL,
  retainCachedAuthenticatedImage,
  shouldUseAuthenticatedImageFallback,
} from "@/lib/authenticated-image";
import { cn } from "@/lib/utils";

type AuthenticatedImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string;
  placeholderClassName?: string;
};

const AUTHENTICATED_IMAGE_FALLBACK_TIMEOUT_MS = 10000;

function positiveNumericDimension(value: string | number | undefined) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

export function AuthenticatedImage({ alt, className, onError, onLoad, placeholderClassName, src, style, ...props }: AuthenticatedImageProps) {
  const [objectSrc, setObjectSrc] = useState("");
  const [fallbackToDirectSrc, setFallbackToDirectSrc] = useState(false);
  const [retainedCacheKey, setRetainedCacheKey] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const directSrc = useMemo(() => {
    if (!src) {
      return "";
    }
    try {
      return resolveImageRequestURL(src);
    } catch {
      return src;
    }
  }, [src]);
  const shouldFetchWithAuth = useMemo(() => shouldUseAuthenticatedImageFallback(src), [src]);

  useEffect(() => {
    setLoadFailed(false);
    setFallbackToDirectSrc(false);
    if (!shouldFetchWithAuth) {
      setObjectSrc("");
      setRetainedCacheKey("");
      return;
    }

    let active = true;
    let activeCacheKey = "";
    const fallbackTimer = window.setTimeout(() => {
      if (active) {
        setFallbackToDirectSrc(true);
      }
    }, AUTHENTICATED_IMAGE_FALLBACK_TIMEOUT_MS);
    const cached = retainCachedAuthenticatedImage(src);
    if (cached) {
      window.clearTimeout(fallbackTimer);
      activeCacheKey = cached.key;
      setObjectSrc(cached.objectURL);
      setRetainedCacheKey(cached.key);
      return () => {
        active = false;
        window.clearTimeout(fallbackTimer);
        releaseCachedAuthenticatedImage(activeCacheKey);
      };
    }
    setObjectSrc("");
    setRetainedCacheKey("");

    void fetchCachedAuthenticatedImage(src)
      .then((image) => {
        if (!active) {
          releaseCachedAuthenticatedImage(image.key);
          return;
        }
        if (activeCacheKey && activeCacheKey !== image.key) {
          releaseCachedAuthenticatedImage(activeCacheKey);
        }
        activeCacheKey = image.key;
        setObjectSrc(image.objectURL);
        setRetainedCacheKey(image.key);
        window.clearTimeout(fallbackTimer);
      })
      .catch(() => {
        if (active) {
          setFallbackToDirectSrc(true);
        }
      });

    return () => {
      active = false;
      window.clearTimeout(fallbackTimer);
      if (activeCacheKey) {
        releaseCachedAuthenticatedImage(activeCacheKey);
      }
    };
  }, [shouldFetchWithAuth, src]);

  const displaySrc = shouldFetchWithAuth ? objectSrc || (fallbackToDirectSrc ? directSrc : "") : directSrc;
  const showPlaceholder = shouldFetchWithAuth && !displaySrc;
  const showFailurePlaceholder = !displaySrc || loadFailed;
  const width = positiveNumericDimension(props.width);
  const height = positiveNumericDimension(props.height);
  const placeholderStyle: CSSProperties = {
    ...style,
    ...(width > 0 && height > 0 ? { aspectRatio: `${width} / ${height}` } : {}),
  };

  if (showPlaceholder || showFailurePlaceholder) {
    return (
      <span
        className={cn(
          className,
          "flex min-h-24 w-full items-center justify-center bg-[#f0f0f0] text-stone-400",
          placeholderClassName,
        )}
        style={placeholderStyle}
        role={alt ? "img" : undefined}
        aria-label={typeof alt === "string" && alt ? alt : undefined}
      >
        {showPlaceholder ? (
          <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
        ) : (
          <span className="px-3 text-center text-xs font-medium text-stone-500">图片加载失败</span>
        )}
      </span>
    );
  }

  return (
    <img
      {...props}
      src={displaySrc}
      alt={alt}
      className={className}
      style={style}
      data-authenticated-image-cache-key={retainedCacheKey || undefined}
      onLoad={(event) => {
        setLoadFailed(false);
        onLoad?.(event);
      }}
      onError={(event) => {
        setLoadFailed(true);
        onError?.(event);
      }}
    />
  );
}
