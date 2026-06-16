import {
  CUSTOM_IMAGE_ASPECT_RATIO,
  IMAGE_ASPECT_RATIO_OPTIONS,
  PIXEL_ICON_SIZE_OPTIONS,
  type ImageAspectRatio,
} from "@/lib/image-parameters";

export type ImageRatioPickerOption<Value extends string> = {
  value: Value;
  label: string;
  description?: string;
  section?: string;
  glyphValue?: string;
};

export const DEFAULT_IMAGE_RATIO_PICKER_OPTIONS = [
  ...IMAGE_ASPECT_RATIO_OPTIONS.filter((option) => option.value !== CUSTOM_IMAGE_ASPECT_RATIO).map((option) => ({
    ...option,
    section: "常用画幅",
  })),
  ...PIXEL_ICON_SIZE_OPTIONS.map((option) => ({
    ...option,
    section: "像素图标尺寸",
  })),
  {
    ...IMAGE_ASPECT_RATIO_OPTIONS[IMAGE_ASPECT_RATIO_OPTIONS.length - 1],
    section: "自定义",
  },
] satisfies ReadonlyArray<ImageRatioPickerOption<ImageAspectRatio>>;

export function compactImageRatioLabel(label: string) {
  return label.replace(/\s*\([^)]*\)\s*$/, "");
}

export function imageRatioPickerValueLabel<Value extends string>(
  options: ReadonlyArray<ImageRatioPickerOption<Value>>,
  value: Value,
  fallback = "Auto",
) {
  const option = options.find((item) => item.value === value);
  return option ? compactImageRatioLabel(option.label) : fallback;
}
