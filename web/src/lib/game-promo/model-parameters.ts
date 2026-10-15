import { isGrokImagineImageModel, isOfficialImageModel, isSeedreamImageModel, isGPTImage25Model } from "@/lib/api";
import { buildImageTaskRequestParameters } from "@/lib/image-task-request";
import { normalizeGrokImageAspectRatio, normalizeGrokImageQuality, normalizeGrokImageResolution, normalizeSeedreamImageAspectRatio, normalizeSeedreamImageResolution, normalizeGPTImage25Quality, type ImageQuality } from "@/lib/image-parameters";
import { normalizeOfficialImageSize, normalizeOfficialImageResolution, normalizeOfficialImageQuality } from "@/lib/pro-studio/official-image-capabilities";
export function promoModelParameters(model: string, ratio: string, hasReferences: boolean) {
  let size = ratio, imageResolution: string | undefined, quality: ImageQuality | undefined;
  if (isGrokImagineImageModel(model)) {
    size = normalizeGrokImageAspectRatio(ratio) || "16:9";
    imageResolution = normalizeGrokImageResolution("2k");
    quality = hasReferences ? undefined : normalizeGrokImageQuality("medium");
  } else if (isSeedreamImageModel(model)) {
    size = normalizeSeedreamImageAspectRatio(ratio, model) || "16:9";
    imageResolution = normalizeSeedreamImageResolution("2k", model);
  } else if (isOfficialImageModel(model)) {
    size = normalizeOfficialImageSize(ratio); imageResolution = normalizeOfficialImageResolution("2k"); quality = normalizeOfficialImageQuality("auto");
  } else if (isGPTImage25Model(model)) {
    imageResolution = "2k"; quality = normalizeGPTImage25Quality("auto");
  }
  const parameters = buildImageTaskRequestParameters({ model, size, imageResolution, quality, outputFormat: "png" });
  return { size: parameters.size, imageResolution: parameters.image_resolution, quality, outputFormat: parameters.output_format };
}
export function promoSafetyArea(model: string, ratio: string, targetWidth: number, targetHeight: number) {
  const parameters = promoModelParameters(model, ratio, true);
  const [width, height] = String(parameters.size || ratio).split(":").map(Number);
  const sourceRatio = width / height;
  const targetRatio = targetWidth / targetHeight;
  if (!Number.isFinite(sourceRatio) || sourceRatio <= 0) throw new Error("模型画幅无效");
  return { widthPercent: Math.floor(Math.min(1, targetRatio / sourceRatio) * 100),
    heightPercent: Math.floor(Math.min(1, sourceRatio / targetRatio) * 100) };
}
