"use client";

import { SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  MIDJOURNEY_IMAGE_MODEL,
  isGeminiFlashImageModel,
  isGeminiProImageModel,
  isOfficialImageModel,
  midjourneyVersionSupportsStop,
  type ImageModel,
  type MidjourneySettingsPayload,
} from "@/lib/api";
import {
  imageModelHasSettings,
  mergeImageModelSettingsForModel,
  normalizeImageModelSettings,
  type ImageModelSettingsState,
} from "@/lib/image-model-settings";
import { cn } from "@/lib/utils";

const MIDJOURNEY_VERSION_OPTIONS = [
  { value: "8.2", label: "V8.2" },
  { value: "8.1", label: "V8.1" },
  { value: "7", label: "V7" },
  { value: "6.1", label: "V6.1" },
  { value: "6", label: "V6" },
  { value: "5.2", label: "V5.2" },
  { value: "5.1", label: "V5.1" },
  { value: "5", label: "V5" },
  { value: "niji:7", label: "Niji 7" },
  { value: "niji:6", label: "Niji 6" },
];
const MIDJOURNEY_SPEED_OPTIONS = ["relax", "fast", "turbo"];
const MIDJOURNEY_QUALITY_OPTIONS = ["0.25", "0.5", "1", "2"];
const MIDJOURNEY_STYLE_OPTIONS = ["", "raw"];

type ImageModelSettingsButtonProps = {
  model: ImageModel | string;
  value?: ImageModelSettingsState;
  onChange: (settings: ImageModelSettingsState) => void;
  compact?: boolean;
  className?: string;
  contentClassName?: string;
  buttonLabel?: string;
};

type ImageModelSettingsPanelProps = {
  model: ImageModel | string;
  value?: ImageModelSettingsState;
  onChange: (settings: ImageModelSettingsState) => void;
  className?: string;
  headerClassName?: string;
};

function settingNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function settingFloat(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function fieldLabelClassName() {
  return "font-medium text-[#45515e] dark:text-muted-foreground";
}

function inputClassName(className?: string) {
  return cn("h-7 rounded-lg border-[#e5e7eb] bg-white px-2 text-xs font-semibold text-[#18181b] shadow-none dark:border-border dark:bg-background/70 dark:text-foreground", className);
}

function selectClassName() {
  return "h-7 w-full rounded-lg border border-[#e5e7eb] bg-white px-2 text-xs font-semibold text-[#18181b] dark:border-border dark:bg-background/70 dark:text-foreground";
}

function checkboxFieldClassName() {
  return "flex min-h-7 items-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-white px-2 dark:border-border dark:bg-background/70";
}

function titleForModel(model: ImageModel | string) {
  if (model === MIDJOURNEY_IMAGE_MODEL) {
    return "Midjourney 参数";
  }
  if (isGeminiFlashImageModel(model)) {
    return "Nano Banana 2 参数";
  }
  if (isGeminiProImageModel(model)) {
    return "Nano Banana Pro 参数";
  }
  if (isOfficialImageModel(model)) {
    return "官方图片参数";
  }
  return "图片参数";
}

function referenceLimitLabel(model: ImageModel | string) {
  if (model === MIDJOURNEY_IMAGE_MODEL) {
    return "最多 4 张参考图";
  }
  if (isGeminiFlashImageModel(model) || isGeminiProImageModel(model)) {
    return "最多 14 张参考图";
  }
  if (isOfficialImageModel(model)) {
    return "最多 16 张参考图";
  }
  return "";
}

export function ImageModelSettingsButton({
  model,
  value,
  onChange,
  compact = false,
  className,
  contentClassName,
  buttonLabel = "参数",
}: ImageModelSettingsButtonProps) {
  if (!imageModelHasSettings(model)) {
    return null;
  }
  const title = titleForModel(model);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "h-8 shrink-0 rounded-xl border-[#dbe7ff] bg-white px-2 text-xs font-medium text-[#45515e] shadow-none hover:bg-sky-50 hover:text-sky-700 dark:border-sky-900/60 dark:bg-background/70 dark:text-muted-foreground dark:hover:bg-sky-950/30 dark:hover:text-sky-200",
            className,
          )}
          title={title}
        >
          <SlidersHorizontal className="size-3.5" />
          {buttonLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        className={cn("max-h-[72vh] w-[390px] max-w-[calc(100vw-2rem)] overflow-y-auto p-3", contentClassName)}
      >
        <ImageModelSettingsPanel model={model} value={value} onChange={onChange} />
      </PopoverContent>
    </Popover>
  );
}

export function ImageModelSettingsPanel({
  model,
  value,
  onChange,
  className,
  headerClassName,
}: ImageModelSettingsPanelProps) {
  if (!imageModelHasSettings(model)) {
    return null;
  }
  const normalized = normalizeImageModelSettings(model, value);
  const title = titleForModel(model);
  const referenceLabel = referenceLimitLabel(model);
  const update = (patch: ImageModelSettingsState | Record<string, unknown>) => {
    onChange(mergeImageModelSettingsForModel(model, normalized, patch));
  };

  return (
    <div className={className}>
      <div className={cn("mb-2 flex items-center justify-between gap-2", headerClassName)}>
        <span className="text-xs font-semibold text-[#18181b] dark:text-foreground">{title}</span>
        {referenceLabel ? <span className="text-[10px] text-[#8e8e93] dark:text-muted-foreground">{referenceLabel}</span> : null}
      </div>
      {model === MIDJOURNEY_IMAGE_MODEL ? (
        <MidjourneySettingsPanel
          settings={normalized.midjourney || {}}
          onChange={(midjourney) => update({ midjourney })}
        />
      ) : null}
      {isGeminiFlashImageModel(model) ? (
        <GeminiFlashSettingsPanel
          settings={normalized.geminiFlash || {}}
          onChange={(geminiFlash) => update({ geminiFlash })}
        />
      ) : null}
      {isOfficialImageModel(model) ? (
        <OfficialImageSettingsPanel
          settings={normalized.officialImage || {}}
          onChange={(officialImage) => update({ officialImage })}
        />
      ) : null}
      {isGeminiProImageModel(model) ? (
        <GeminiProSettingsPanel
          settings={normalized.geminiPro || {}}
          onChange={(geminiPro) => update({ geminiPro })}
        />
      ) : null}
    </div>
  );
}

function MidjourneySettingsPanel({
  settings,
  onChange,
}: {
  settings: MidjourneySettingsPayload;
  onChange: (settings: MidjourneySettingsPayload) => void;
}) {
  const stopSupported = midjourneyVersionSupportsStop(settings.version);
  const update = (patch: MidjourneySettingsPayload) => onChange({ ...settings, ...patch });
  const updateNumber = (key: "stylize" | "chaos" | "weird" | "stop", value: string, min: number, max: number, fallback: number) => {
    update({ [key]: settingNumber(value, fallback, min, max) });
  };
  const updateOptionalNumber = (key: "seed" | "repeat" | "cw" | "sw", value: string, min: number, max: number, fallback: number) => {
    update({ [key]: value.trim() ? settingNumber(value, fallback, min, max) : undefined });
  };
  const updateOptionalFloat = (key: "iw" | "dw", value: string, min: number, max: number, fallback: number) => {
    update({ [key]: value.trim() ? settingFloat(value, fallback, min, max) : undefined });
  };

  return (
    <div className="grid grid-cols-2 gap-1.5 text-[11px] sm:grid-cols-3">
      <label className="space-y-1">
        <span className={fieldLabelClassName()}>版本</span>
        <select
          value={settings.niji ? `niji:${settings.version || "7"}` : settings.version || "8.1"}
          onChange={(event) => {
            const value = event.target.value;
            const niji = value.startsWith("niji:");
            const version = niji ? value.slice("niji:".length) : value;
            const next = { ...settings, version, niji };
            if (!midjourneyVersionSupportsStop(version)) {
              delete next.stop;
            }
            onChange(next);
          }}
          className={selectClassName()}
        >
          {MIDJOURNEY_VERSION_OPTIONS.map((version) => <option key={version.value} value={version.value}>{version.label}</option>)}
        </select>
      </label>
      <label className="space-y-1">
        <span className={fieldLabelClassName()}>速度</span>
        <select value={settings.speed || "relax"} onChange={(event) => update({ speed: event.target.value })} className={selectClassName()}>
          {MIDJOURNEY_SPEED_OPTIONS.map((speed) => <option key={speed} value={speed}>{speed}</option>)}
        </select>
      </label>
      <label className="space-y-1">
        <span className={fieldLabelClassName()}>画质</span>
        <select value={settings.quality || "1"} onChange={(event) => update({ quality: event.target.value })} className={selectClassName()}>
          {MIDJOURNEY_QUALITY_OPTIONS.map((quality) => <option key={quality} value={quality}>{quality}</option>)}
        </select>
      </label>
      <label className="space-y-1">
        <span className={fieldLabelClassName()}>风格</span>
        <select value={settings.style || ""} onChange={(event) => update({ style: event.target.value || undefined })} className={selectClassName()}>
          {MIDJOURNEY_STYLE_OPTIONS.map((style) => <option key={style || "default"} value={style}>{style || "默认"}</option>)}
        </select>
      </label>
      {[
        { key: "stylize" as const, label: "风格化", min: 0, max: 1000, fallback: 100 },
        { key: "chaos" as const, label: "混乱", min: 0, max: 100, fallback: 0 },
        { key: "weird" as const, label: "怪异", min: 0, max: 3000, fallback: 0 },
        ...(stopSupported ? [{ key: "stop" as const, label: "停止", min: 10, max: 100, fallback: 100 }] : []),
      ].map((item) => (
        <label key={item.key} className="space-y-1">
          <span className={fieldLabelClassName()}>{item.label}</span>
          <Input
            type="number"
            inputMode="numeric"
            min={item.min}
            max={item.max}
            step="1"
            value={settings[item.key] ?? item.fallback}
            onChange={(event) => updateNumber(item.key, event.target.value, item.min, item.max, item.fallback)}
            className={inputClassName()}
          />
        </label>
      ))}
      {[
        { key: "seed" as const, label: "种子", min: 0, max: 4294967295, fallback: 0, placeholder: "随机" },
        { key: "repeat" as const, label: "重复", min: 2, max: 40, fallback: 2, placeholder: "关闭" },
        { key: "cw" as const, label: "角色权重", min: 0, max: 100, fallback: 100, placeholder: "0-100" },
        { key: "sw" as const, label: "风格权重", min: 0, max: 1000, fallback: 100, placeholder: "0-1000" },
      ].map((item) => (
        <label key={item.key} className="space-y-1">
          <span className={fieldLabelClassName()}>{item.label}</span>
          <Input
            type="number"
            inputMode="numeric"
            min={item.min}
            max={item.max}
            step="1"
            value={settings[item.key] ?? ""}
            placeholder={item.placeholder}
            onChange={(event) => updateOptionalNumber(item.key, event.target.value, item.min, item.max, item.fallback)}
            className={inputClassName()}
          />
        </label>
      ))}
      {[
        { key: "iw" as const, label: "图片权重", min: 0, max: 3, fallback: 1, step: "0.1" },
        { key: "dw" as const, label: "深度权重", min: 0, max: 100, fallback: 50, step: "0.1" },
      ].map((item) => (
        <label key={item.key} className="space-y-1">
          <span className={fieldLabelClassName()}>{item.label}</span>
          <Input
            type="number"
            inputMode="decimal"
            min={item.min}
            max={item.max}
            step={item.step}
            value={settings[item.key] ?? ""}
            placeholder={String(item.fallback)}
            onChange={(event) => updateOptionalFloat(item.key, event.target.value, item.min, item.max, item.fallback)}
            className={inputClassName()}
          />
        </label>
      ))}
      {[
        { key: "negative_prompt" as const, label: "负面词", placeholder: "ugly, blurry" },
        { key: "cref" as const, label: "角色参考", placeholder: "https://..." },
        { key: "sref" as const, label: "风格参考", placeholder: "https://..." },
        { key: "dref" as const, label: "深度参考", placeholder: "https://..." },
        { key: "extra" as const, label: "追加参数", placeholder: "--profile ..." },
      ].map((item) => (
        <label key={item.key} className="space-y-1 sm:col-span-3">
          <span className={fieldLabelClassName()}>{item.label}</span>
          <Input
            value={settings[item.key] || ""}
            placeholder={item.placeholder}
            onChange={(event) => update({ [item.key]: event.target.value.trim() || undefined })}
            className={inputClassName()}
          />
        </label>
      ))}
      {[
        { key: "niji" as const, label: "Niji" },
        { key: "raw" as const, label: "Raw" },
        { key: "tile" as const, label: "平铺" },
        { key: "draft" as const, label: "草图" },
        { key: "hd" as const, label: "HD" },
      ].map((item) => (
        <label key={item.key} className={checkboxFieldClassName()}>
          <Checkbox checked={settings[item.key] === true} onCheckedChange={(checked) => update({ [item.key]: checked === true })} className="size-3.5" />
          <span className={cn("truncate", fieldLabelClassName())}>{item.label}</span>
        </label>
      ))}
    </div>
  );
}

function GeminiFlashSettingsPanel({
  settings,
  onChange,
}: {
  settings: ImageModelSettingsState["geminiFlash"];
  onChange: (settings: NonNullable<ImageModelSettingsState["geminiFlash"]>) => void;
}) {
  const normalized = {
    google_search: settings?.google_search === true || settings?.google_image_search !== false,
    google_image_search: settings?.google_image_search !== false,
  };
  return (
    <div className="grid grid-cols-2 gap-1.5 text-[11px]">
      {[
        { key: "google_search" as const, label: "联网搜索" },
        { key: "google_image_search" as const, label: "图片搜索" },
      ].map((item) => (
        <label key={item.key} className={checkboxFieldClassName()}>
          <Checkbox
            checked={normalized[item.key] === true}
            onCheckedChange={(checked) => {
              const next = { ...normalized, [item.key]: checked === true };
              if (item.key === "google_image_search" && checked === true) {
                next.google_search = true;
              }
              if (item.key === "google_search" && checked !== true) {
                next.google_image_search = false;
              }
              onChange(next);
            }}
            className="size-3.5"
          />
          <span className={cn("truncate", fieldLabelClassName())}>{item.label}</span>
        </label>
      ))}
    </div>
  );
}

function OfficialImageSettingsPanel({
  settings,
  onChange,
}: {
  settings: ImageModelSettingsState["officialImage"];
  onChange: (settings: NonNullable<ImageModelSettingsState["officialImage"]>) => void;
}) {
  const normalized = {
    background: settings?.background || "auto",
    moderation: settings?.moderation || "auto",
    inputImageMask: settings?.inputImageMask || "",
  };
  return (
    <div className="grid grid-cols-2 gap-1.5 text-[11px]">
      <label className="space-y-1">
        <span className={fieldLabelClassName()}>背景</span>
        <select value={normalized.background} onChange={(event) => onChange({ ...normalized, background: event.target.value })} className={selectClassName()}>
          <option value="auto">自动</option>
          <option value="transparent">透明</option>
          <option value="opaque">不透明</option>
        </select>
      </label>
      <label className="space-y-1">
        <span className={fieldLabelClassName()}>审核</span>
        <select value={normalized.moderation} onChange={(event) => onChange({ ...normalized, moderation: event.target.value })} className={selectClassName()}>
          <option value="auto">自动</option>
          <option value="low">低限制</option>
        </select>
      </label>
      <label className="col-span-2 space-y-1">
        <span className={fieldLabelClassName()}>遮罩 URL</span>
        <Input
          value={normalized.inputImageMask}
          onChange={(event) => onChange({ ...normalized, inputImageMask: event.target.value.trim() || undefined })}
          placeholder="https://..."
          className={inputClassName()}
        />
      </label>
    </div>
  );
}

function GeminiProSettingsPanel({
  settings,
  onChange,
}: {
  settings: ImageModelSettingsState["geminiPro"];
  onChange: (settings: NonNullable<ImageModelSettingsState["geminiPro"]>) => void;
}) {
  return (
    <div className="grid gap-1.5 text-[11px]">
      <label className="space-y-1">
        <span className={fieldLabelClassName()}>遮罩 URL</span>
        <Input
          value={settings?.inputImageMask || ""}
          onChange={(event) => onChange({ inputImageMask: event.target.value.trim() || undefined })}
          placeholder="https://..."
          className={inputClassName()}
        />
      </label>
    </div>
  );
}
