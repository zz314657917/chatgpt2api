"use client";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  IMAGE_OUTPUT_FORMAT_OPTIONS,
  supportsImageOutputCompression,
  type ImageOutputFormat,
} from "@/lib/image-parameters";
import { cn } from "@/lib/utils";

type ImageOutputControlsProps = {
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
  const compressionDisabled = !supportsImageOutputCompression(outputFormat);
  const normalizedCompression = outputCompression ?? "";

  return (
    <>
      <div className={fieldClassName}>
        <span className={cn("shrink-0", labelClassName)}>格式</span>
        <Select
          value={outputFormat}
          onValueChange={(value) => {
            const nextFormat = value as ImageOutputFormat;
            onOutputFormatChange(nextFormat);
            if (!supportsImageOutputCompression(nextFormat)) {
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
              {IMAGE_OUTPUT_FORMAT_OPTIONS.map((option) => (
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
        title={compressionDisabled ? "只有 JPEG 支持压缩率参数" : "JPEG 压缩率，0-100"}
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
            ? "PNG 和 WebP 不接收压缩率。结果卡会显示实际保存后的格式、像素和文件大小。"
            : "JPEG 压缩率由后端保存结果时应用；实际上游返回格式不受此项控制。"}
        </p>
      ) : null}
    </>
  );
}
