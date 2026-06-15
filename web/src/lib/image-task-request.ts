import {
  normalizeImageOutputCompression,
  normalizeImageOutputFormat,
  normalizeImageResolutionPreset,
  normalizePixelIconSizeAlias,
  supportsImageOutputCompression,
  type ImageOutputFormat,
} from "@/lib/image-parameters";

export type ImageTaskToolOptions = {
  background?: string;
  moderation?: string;
  style?: string;
  partialImages?: number;
  inputImageMask?: string;
};

export type ImageTaskRequestParameters = {
  model?: string;
  size?: string;
  imageResolution?: string;
  quality?: string;
  outputFormat?: ImageOutputFormat;
  outputCompression?: number | string;
  toolOptions?: ImageTaskToolOptions;
};

export type NormalizedImageTaskRequestParameters = {
  model?: string;
  size?: string;
  image_resolution?: string;
  quality?: string;
  output_format?: ImageOutputFormat;
  output_compression?: number;
  toolOptions?: ImageTaskToolOptions;
};

export const OFFICIAL_IMAGE_GATEWAY_MODEL = "gpt-image-2-official";

export function isOfficialImageGatewayModel(model?: string) {
  return String(model || "").trim() === OFFICIAL_IMAGE_GATEWAY_MODEL;
}

export function normalizeTaskImageResolution(value?: string) {
  return normalizeImageResolutionPreset(value);
}

export function supportsTaskOutputCompression(model: string | undefined, format: ImageOutputFormat | string) {
  const normalizedFormat = normalizeImageOutputFormat(format);
  return supportsImageOutputCompression(normalizedFormat) || (isOfficialImageGatewayModel(model) && normalizedFormat === "webp");
}

export function buildImageTaskRequestParameters(parameters: ImageTaskRequestParameters): NormalizedImageTaskRequestParameters {
  const model = String(parameters.model || "").trim();
  const size = parameters.size ? normalizePixelIconSizeAlias(parameters.size) : "";
  const imageResolution = normalizeTaskImageResolution(parameters.imageResolution);
  const outputFormat = parameters.outputFormat ? normalizeImageOutputFormat(parameters.outputFormat) : undefined;
  const outputCompression =
    outputFormat && supportsTaskOutputCompression(model, outputFormat)
      ? normalizeImageOutputCompression(parameters.outputCompression)
      : undefined;
  const toolOptions = normalizeImageTaskToolOptions(parameters.toolOptions);
  return {
    ...(model ? { model } : {}),
    ...(size ? { size } : {}),
    ...(imageResolution ? { image_resolution: imageResolution } : {}),
    ...(parameters.quality ? { quality: String(parameters.quality).trim() } : {}),
    ...(outputFormat ? { output_format: outputFormat } : {}),
    ...(typeof outputCompression === "number" ? { output_compression: outputCompression } : {}),
    ...(toolOptions ? { toolOptions } : {}),
  };
}

export function imageTaskRequestBodyFields(parameters: NormalizedImageTaskRequestParameters) {
  return {
    ...(parameters.model ? { model: parameters.model } : {}),
    ...(parameters.size ? { size: parameters.size } : {}),
    ...(parameters.image_resolution ? { image_resolution: parameters.image_resolution } : {}),
    ...(parameters.quality ? { quality: parameters.quality } : {}),
    ...(parameters.output_format ? { output_format: parameters.output_format } : {}),
    ...(typeof parameters.output_compression === "number" ? { output_compression: parameters.output_compression } : {}),
    ...(parameters.toolOptions?.background ? { background: parameters.toolOptions.background } : {}),
    ...(parameters.toolOptions?.moderation ? { moderation: parameters.toolOptions.moderation } : {}),
    ...(parameters.toolOptions?.style ? { style: parameters.toolOptions.style } : {}),
    ...(typeof parameters.toolOptions?.partialImages === "number" ? { partial_images: parameters.toolOptions.partialImages } : {}),
    ...(parameters.toolOptions?.inputImageMask ? { input_image_mask: parameters.toolOptions.inputImageMask } : {}),
  };
}

function normalizeImageTaskToolOptions(options?: ImageTaskToolOptions) {
  if (!options) {
    return undefined;
  }
  const out: ImageTaskToolOptions = {};
  if (options.background) {
    out.background = options.background;
  }
  if (options.moderation) {
    out.moderation = options.moderation;
  }
  if (options.style) {
    out.style = options.style;
  }
  if (typeof options.partialImages === "number") {
    out.partialImages = options.partialImages;
  }
  if (options.inputImageMask) {
    out.inputImageMask = options.inputImageMask;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
