"use client";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  IMAGE_OUTPUT_FORMAT_OPTIONS,
  normalizeImageOutputFormatForModel,
  type ImageOutputFormat,
} from "@/lib/image-parameters";
import { isSeedream50LiteImageModel, isSeedream50ProImageModel, supportsImageOutputCompression, type ImageModel } from "@/lib/api";
import { cn } from "@/lib/utils";

type ImageOutputControlsProps = {
  imageModel?: ImageModel | string;
  outputFormat: ImageOutputFormat;
  outputCompression: string | number | undefined;
  onOutputFormatChange: (value: ImageOutputFormat) => void;
  onOutputCompressionChange: (value: string) => void;
  fieldClassName: string;
  labelClassName?: string;
  selectTriggerClassName: string;
  inputClassName: string;
  compressionLabel?: string;
  compressionPlaceholderDisabled?: string;
  selectContentClassName?: string;
  compressionFieldClassName?: string;
  helperClassName?: string;
  helperGridClassName?: string;
  includeHelper?: boolean;
  selectContentAlign?: "start" | "center" | "end";
  selectContentSide?: "top" | "right" | "bottom" | "left";
  selectContentSideOffset?: number;
  selectContentCollisionPadding?: number;
};

export function ImageOutputControls({
  imageModel,
  outputFormat,
  outputCompression,
  onOutputFormatChange,
  onOutputCompressionChange,
  fieldClassName,
  labelClassName,
  selectTriggerClassName,
  inputClassName,
  compressionLabel = "压缩率",
  compressionPlaceholderDisabled = "N/A",
  selectContentClassName,
  compressionFieldClassName,
  helperClassName,
  helperGridClassName = "col-span-2 sm:col-span-3",
  includeHelper = false,
  selectContentAlign = "end",
  selectContentSide = "bottom",
  selectContentSideOffset = 4,
  selectContentCollisionPadding = 8,
}: ImageOutputControlsProps) {
  const effectiveOutputFormat = normalizeImageOutputFormatForModel(imageModel, outputFormat);
  const compressionSupported = supportsImageOutputCompression(imageModel || "", effectiveOutputFormat);
  const compressionDisabled = !compressionSupported;
  const normalizedCompression = outputCompression ?? "";
  const formatOptions = isSeedream50LiteImageModel(imageModel) || isSeedream50ProImageModel(imageModel)
    ? IMAGE_OUTPUT_FORMAT_OPTIONS.filter((option) => option.value === "png" || option.value === "jpeg")
    : IMAGE_OUTPUT_FORMAT_OPTIONS;

  return (
    <>
      <div className={fieldClassName}>
        <span className={cn("shrink-0", labelClassName)}>格式</span>
        <Select
          value={effectiveOutputFormat}
          onValueChange={(value) => {
            const nextFormat = value as ImageOutputFormat;
            onOutputFormatChange(nextFormat);
            if (!supportsImageOutputCompression(imageModel || "", nextFormat)) {
              onOutputCompressionChange("");
            }
          }}
        >
          <SelectTrigger className={selectTriggerClassName} aria-label="图片输出格式">
            <SelectValue />
          </SelectTrigger>
          <SelectContent
            align={selectContentAlign}
            side={selectContentSide}
            sideOffset={selectContentSideOffset}
            collisionPadding={selectContentCollisionPadding}
            className={selectContentClassName}
          >
            <SelectGroup>
              {formatOptions.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  className="rounded-lg px-3 py-2 pr-8 text-sm text-[#45515e] focus:bg-black/[0.05] focus:text-[#18181b] dark:text-muted-foreground dark:focus:bg-accent dark:focus:text-foreground"
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <label
        className={cn(fieldClassName, compressionFieldClassName, compressionDisabled && "opacity-55")}
        title={compressionDisabled ? "当前格式不接收压缩率参数" : "压缩率，0-100"}
      >
        <span className={cn("shrink-0", labelClassName)}>{compressionLabel}</span>
        <Input
          type="number"
          inputMode="numeric"
          min="0"
          max="100"
          step="1"
          value={normalizedCompression}
          onChange={(event) => onOutputCompressionChange(event.target.value)}
          disabled={compressionDisabled}
          placeholder={compressionDisabled ? compressionPlaceholderDisabled : "0-100"}
          className={inputClassName}
        />
      </label>
      {includeHelper ? (
        <p className={cn(helperGridClassName, helperClassName)}>
          {compressionDisabled
            ? "当前格式不接收压缩率。结果卡会显示实际保存后的格式、像素和文件大小。"
            : "压缩率会随任务参数提交；实际上游返回格式以任务结果为准。"}
        </p>
      ) : null}
    </>
  );
}
