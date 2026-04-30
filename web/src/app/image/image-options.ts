export const IMAGE_ASPECT_RATIO_OPTIONS = [
  { value: "", label: "Auto" },
  { value: "1:1", label: "1:1 (正方形)" },
  { value: "3:2", label: "3:2 (横版)" },
  { value: "16:9", label: "16:9 (横版)" },
  { value: "21:9", label: "21:9 (超宽横版)" },
  { value: "4:3", label: "4:3 (横版)" },
  { value: "3:4", label: "3:4 (竖版)" },
  { value: "9:16", label: "9:16 (竖版)" },
] as const;

export type ImageAspectRatio = (typeof IMAGE_ASPECT_RATIO_OPTIONS)[number]["value"];

export const IMAGE_RESOLUTION_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "1080p", label: "1080P" },
  { value: "2k", label: "2K" },
  { value: "4k", label: "4K" },
] as const;

export type ImageResolution = (typeof IMAGE_RESOLUTION_OPTIONS)[number]["value"];

const IMAGE_ASPECT_RATIO_VALUES = new Set<string>(IMAGE_ASPECT_RATIO_OPTIONS.map((option) => option.value));
const IMAGE_RESOLUTION_VALUES = new Set<string>(IMAGE_RESOLUTION_OPTIONS.map((option) => option.value));

const IMAGE_RESOLUTION_SIZE_PRESETS: Record<
  Exclude<ImageAspectRatio, "">,
  Partial<Record<Exclude<ImageResolution, "auto">, string>>
> = {
  "1:1": {
    "1080p": "1080x1080",
    "2k": "2048x2048",
    "4k": "2880x2880",
  },
  "3:2": {
    "1080p": "1620x1080",
    "2k": "2160x1440",
    "4k": "3456x2304",
  },
  "16:9": {
    "1080p": "1920x1080",
    "2k": "2560x1440",
    "4k": "3840x2160",
  },
  "21:9": {
    "1080p": "2520x1080",
    "2k": "3360x1440",
    "4k": "3808x1632",
  },
  "4:3": {
    "1080p": "1440x1080",
    "2k": "2048x1536",
    "4k": "3264x2448",
  },
  "3:4": {
    "1080p": "1080x1440",
    "2k": "1536x2048",
    "4k": "2448x3264",
  },
  "9:16": {
    "1080p": "1080x1920",
    "2k": "1440x2560",
    "4k": "2160x3840",
  },
};

export const IMAGE_QUALITY_OPTIONS = [
  { value: "low", label: "Low", description: "低质量，速度更快，适合草稿测试" },
  { value: "medium", label: "Medium", description: "均衡质量与速度，适合日常生成" },
  { value: "high", label: "High", description: "高质量，耗时更长，适合最终出图" },
] as const;

export function isImageAspectRatio(value: unknown): value is ImageAspectRatio {
  return typeof value === "string" && IMAGE_ASPECT_RATIO_VALUES.has(value);
}

export function isImageResolution(value: unknown): value is ImageResolution {
  return typeof value === "string" && IMAGE_RESOLUTION_VALUES.has(value);
}

export function buildImageSize(aspectRatio: ImageAspectRatio, resolution: ImageResolution) {
  if (resolution === "auto") {
    return aspectRatio;
  }
  if (!aspectRatio) {
    return "";
  }
  return IMAGE_RESOLUTION_SIZE_PRESETS[aspectRatio]?.[resolution] ?? aspectRatio;
}

export function getImageAspectRatioFromSize(size: string): ImageAspectRatio {
  if (isImageAspectRatio(size)) {
    return size;
  }
  for (const [aspectRatio, presets] of Object.entries(IMAGE_RESOLUTION_SIZE_PRESETS)) {
    if (Object.values(presets).includes(size)) {
      return aspectRatio as ImageAspectRatio;
    }
  }
  return "";
}

export function getImageResolutionFromSize(size: string): ImageResolution {
  for (const presets of Object.values(IMAGE_RESOLUTION_SIZE_PRESETS)) {
    for (const [resolution, presetSize] of Object.entries(presets)) {
      if (presetSize === size && isImageResolution(resolution)) {
        return resolution;
      }
    }
  }
  return "auto";
}
