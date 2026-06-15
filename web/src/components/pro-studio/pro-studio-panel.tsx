"use client";

import { useState } from "react";
import { Check, ChevronDown, Layers, WandSparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  OFFICIAL_IMAGE_BACKGROUND_OPTIONS,
  OFFICIAL_IMAGE_LIMITS,
  OFFICIAL_IMAGE_MODERATION_OPTIONS,
  OFFICIAL_IMAGE_OUTPUT_FORMAT_OPTIONS,
  OFFICIAL_IMAGE_RESOLUTION_OPTIONS,
  OFFICIAL_IMAGE_MODEL,
  applyProStudioQualityTier,
  normalizeOfficialOutputCompression,
  normalizeProStudioState,
  proStudioPresetByIntent,
  proStudioPresetsForScope,
  PRO_STUDIO_QUALITY_TIER_OPTIONS,
  type OfficialImageResolution,
  type OfficialImageSize,
  type ProStudioIntent,
  type ProStudioState,
} from "@/lib/pro-studio";
import { cn } from "@/lib/utils";

type ProStudioPanelProps = {
  scope: "canvas" | "ecommerce";
  state?: Partial<ProStudioState> | null;
  onChange: (state: ProStudioState) => void;
  fieldClassName?: string;
  selectTriggerClassName?: string;
  inputClassName?: string;
  labelClassName?: string;
  compact?: boolean;
};

type ProStudioRatioOption = {
  size: OfficialImageSize;
  label: string;
};

const PRO_STUDIO_SIZE_LABELS: Record<OfficialImageSize, string> = {
  auto: "智能",
  "1:1": "1:1",
  "3:2": "3:2",
  "2:3": "2:3",
  "4:3": "4:3",
  "3:4": "3:4",
  "5:4": "5:4",
  "4:5": "4:5",
  "16:9": "16:9",
  "9:16": "9:16",
  "2:1": "2:1",
  "1:2": "1:2",
  "3:1": "3:1",
  "1:3": "1:3",
  "21:9": "21:9",
  "9:21": "9:21",
};

const PRO_STUDIO_SIZE_DESCRIPTIONS: Record<OfficialImageSize, string> = {
  auto: "由模型按提示词自动决定画幅",
  "1:1": "商品主图、头像、方形素材",
  "3:2": "横向摄影、产品场景图",
  "2:3": "竖向海报、详情页模块",
  "4:3": "通用横图、内容配图",
  "3:4": "竖向内容图、商品展示",
  "5:4": "偏方横图、橱窗素材",
  "4:5": "电商广告、社媒竖图",
  "16:9": "横幅、首屏 Banner、视频封面",
  "9:16": "手机竖屏、短视频封面",
  "2:1": "宽横幅、列表头图",
  "1:2": "长竖图、信息流长图",
  "3:1": "超宽广告位、页面头图",
  "1:3": "超长详情页模块",
  "21:9": "电影感宽幅视觉",
  "9:21": "沉浸式长屏竖图",
};

const PRO_STUDIO_RATIO_OPTIONS: ProStudioRatioOption[] = [
  { size: "auto", label: "智能" },
  { size: "1:1", label: "1:1" },
  { size: "2:3", label: "2:3" },
  { size: "3:2", label: "3:2" },
  { size: "3:4", label: "3:4" },
  { size: "4:3", label: "4:3" },
  { size: "4:5", label: "4:5" },
  { size: "5:4", label: "5:4" },
  { size: "9:16", label: "9:16" },
  { size: "16:9", label: "16:9" },
  { size: "21:9", label: "21:9" },
  { size: "9:21", label: "9:21" },
];

const PRO_STUDIO_QUALITY_OPTIONS = [
  { value: "low", label: "基础" },
  { value: "medium", label: "标准" },
  { value: "high", label: "高质" },
] as const;

const PRO_STUDIO_COUNT_OPTIONS = Array.from({ length: OFFICIAL_IMAGE_LIMITS.maxN }, (_, index) => index + 1);

export function ProStudioPanel({
  scope,
  state,
  onChange,
  fieldClassName = "flex h-9 items-center justify-between gap-2 rounded-xl border px-3 text-xs",
  selectTriggerClassName = "h-8 min-w-0 flex-1 justify-end border-0 bg-transparent px-0 text-right text-xs font-bold shadow-none focus-visible:ring-0",
  inputClassName = "h-8 min-w-0 border-0 bg-transparent px-0 text-right text-xs font-bold shadow-none focus-visible:ring-0",
  labelClassName = "text-[11px] font-bold text-muted-foreground",
  compact = false,
}: ProStudioPanelProps) {
  const normalized = normalizeProStudioState(state, scope === "ecommerce" ? "product_main" : "free_canvas");
  const presets = proStudioPresetsForScope(scope);
  const selectedPreset = proStudioPresetByIntent(normalized.intent);
  const [advancedOpen, setAdvancedOpen] = useState(() => state?.mode === "manual");
  const stableLabelClassName = cn("shrink-0 whitespace-nowrap", labelClassName);

  const setSettings = (patch: Partial<ProStudioState["settings"]>) => {
    const next = normalizeProStudioState({
      ...normalized,
      mode: "manual",
      settings: {
        ...normalized.settings,
        ...patch,
        model: OFFICIAL_IMAGE_MODEL,
      },
    }, normalized.intent);
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-muted/40 p-1 dark:border-slate-700 dark:bg-slate-950/35">
        {[
          { enabled: false, label: "普通模式" },
          { enabled: true, label: "生产模式" },
        ].map((option) => (
          <Button
            key={option.label}
            type="button"
            size="sm"
            variant={normalized.enabled === option.enabled ? "default" : "ghost"}
            className="h-8 rounded-lg text-xs font-black"
            onClick={() => {
              const next = normalizeProStudioState({ ...normalized, enabled: option.enabled }, normalized.intent);
              onChange(next);
            }}
          >
            {option.enabled ? <WandSparkles className="size-3.5" /> : null}
            {option.label}
          </Button>
        ))}
      </div>

      {normalized.enabled ? (
        <div className={cn("space-y-2 rounded-xl border border-sky-500/25 bg-sky-500/8 p-2 dark:border-sky-300/20 dark:bg-sky-300/10", compact && "p-2")}>
          <div className="grid grid-cols-2 gap-2">
            <label className={fieldClassName}>
              <span className={stableLabelClassName}>用途</span>
              <Select
                value={normalized.intent}
                onValueChange={(intent) => {
                  const preset = proStudioPresetByIntent(intent as ProStudioIntent);
                  onChange(normalizeProStudioState({
                    enabled: true,
                    mode: "preset",
                    intent: preset.id,
                    qualityTier: normalized.qualityTier,
                    settings: applyProStudioQualityTier(preset.defaultSettings, normalized.qualityTier),
                  }, preset.id));
                }}
              >
                <SelectTrigger className={selectTriggerClassName}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {presets.map((preset) => (
                    <SelectItem key={preset.id} value={preset.id}>{preset.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className={fieldClassName}>
              <span className={stableLabelClassName}>等级</span>
              <Select
                value={normalized.qualityTier}
                onValueChange={(qualityTier) => {
                  const tier = qualityTier as ProStudioState["qualityTier"];
                  onChange(normalizeProStudioState({
                    ...normalized,
                    qualityTier: tier,
                    settings: applyProStudioQualityTier(normalized.settings, tier),
                  }, normalized.intent));
                }}
              >
                <SelectTrigger className={selectTriggerClassName}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRO_STUDIO_QUALITY_TIER_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>
          <div className="rounded-lg border border-sky-500/15 bg-background/65 px-2 py-1.5 text-[11px] font-semibold leading-5 text-muted-foreground dark:border-sky-300/10 dark:bg-slate-950/35">
            {selectedPreset.description} · 模型锁定 {OFFICIAL_IMAGE_MODEL}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <ProStudioRatioPicker
              value={normalized.settings}
              onValueChange={(patch) => setSettings(patch)}
              fieldClassName={cn(fieldClassName, "col-span-2")}
              triggerClassName={selectTriggerClassName}
              labelClassName={stableLabelClassName}
            />
            <ProStudioCountPicker
              value={normalized.settings.n}
              onValueChange={(n) => setSettings({ n })}
              fieldClassName={fieldClassName}
              triggerClassName={selectTriggerClassName}
              inputClassName={inputClassName}
              labelClassName={stableLabelClassName}
            />
            <ProStudioSelect
              label="格式"
              value={normalized.settings.outputFormat}
              options={OFFICIAL_IMAGE_OUTPUT_FORMAT_OPTIONS}
              onValueChange={(outputFormat) => setSettings({
                outputFormat: outputFormat as ProStudioState["settings"]["outputFormat"],
                outputCompression: normalizeOfficialOutputCompression(outputFormat, normalized.settings.outputCompression),
              })}
              fieldClassName={fieldClassName}
              selectTriggerClassName={selectTriggerClassName}
              labelClassName={stableLabelClassName}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-full rounded-lg text-xs font-black"
            onClick={() => setAdvancedOpen((open) => !open)}
          >
            <ChevronDown className={cn("size-3.5 transition", advancedOpen && "rotate-180")} />
            高级 official 设置
          </Button>
          {advancedOpen ? (
            <div className="grid grid-cols-2 gap-2">
              <label className={fieldClassName}>
                <span className={stableLabelClassName}>压缩</span>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={normalized.settings.outputCompression ?? ""}
                  disabled={normalized.settings.outputFormat === "png"}
                  onChange={(event) => setSettings({ outputCompression: normalizeOfficialOutputCompression(normalized.settings.outputFormat, event.target.value) })}
                  placeholder={normalized.settings.outputFormat === "png" ? "N/A" : "0-100"}
                  className={inputClassName}
                />
              </label>
              <ProStudioSelect label="背景" value={normalized.settings.background} options={OFFICIAL_IMAGE_BACKGROUND_OPTIONS} onValueChange={(background) => setSettings({ background: background as ProStudioState["settings"]["background"] })} fieldClassName={fieldClassName} selectTriggerClassName={selectTriggerClassName} labelClassName={stableLabelClassName} />
              <ProStudioSelect label="审核" value={normalized.settings.moderation} options={OFFICIAL_IMAGE_MODERATION_OPTIONS} onValueChange={(moderation) => setSettings({ moderation: moderation as ProStudioState["settings"]["moderation"] })} fieldClassName={fieldClassName} selectTriggerClassName={selectTriggerClassName} labelClassName={stableLabelClassName} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ProStudioRatioPicker({
  value,
  onValueChange,
  fieldClassName,
  triggerClassName,
  labelClassName,
}: {
  value: ProStudioState["settings"];
  onValueChange: (patch: Partial<ProStudioState["settings"]>) => void;
  fieldClassName: string;
  triggerClassName: string;
  labelClassName: string;
}) {
  const [open, setOpen] = useState(false);
  const valueLabel = proStudioRatioSummary(value);

  return (
    <div className={fieldClassName}>
      <span className={labelClassName}>图片比例</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(triggerClassName, "flex items-center")}
            aria-label={`选择图片比例，当前 ${valueLabel}`}
          >
            <span className="min-w-0 truncate">{valueLabel}</span>
            <ChevronDown className="size-4 shrink-0 opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="z-[120] w-[min(19rem,calc(100vw-2rem))] overflow-hidden rounded-[18px] p-0"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <div className="space-y-4 bg-popover p-3">
            <div className="grid gap-2">
              <div className="px-1 text-xs font-bold text-muted-foreground">比例</div>
              <div className="grid grid-cols-4 gap-1.5 rounded-2xl bg-muted/70 p-1.5 dark:bg-slate-950/45">
                {PRO_STUDIO_RATIO_OPTIONS.map((option) => {
                  const active = option.size === value.size;
                  return (
                    <button
                      key={option.size}
                      type="button"
                      aria-pressed={active}
                      title={PRO_STUDIO_SIZE_DESCRIPTIONS[option.size]}
                      className={cn(
                        "flex h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-bold text-muted-foreground transition hover:bg-background/70 hover:text-foreground",
                        active && "bg-background text-foreground shadow-sm",
                      )}
                      onClick={() => onValueChange({ size: option.size })}
                    >
                      <RatioGlyph size={option.size} active={active} />
                      <span className="leading-none">{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <SegmentedSetting
              label="分辨率"
              value={value.resolution}
              options={OFFICIAL_IMAGE_RESOLUTION_OPTIONS.map((resolution) => ({
                value: resolution,
                label: resolutionLabel(resolution),
              }))}
              onValueChange={(resolution) => onValueChange({ resolution: resolution as ProStudioState["settings"]["resolution"] })}
            />

            <SegmentedSetting
              label="品质"
              value={value.quality === "auto" ? "medium" : value.quality}
              options={PRO_STUDIO_QUALITY_OPTIONS}
              onValueChange={(quality) => onValueChange({ quality: quality as ProStudioState["settings"]["quality"] })}
            />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function ProStudioCountPicker({
  value,
  onValueChange,
  fieldClassName,
  triggerClassName,
  inputClassName,
  labelClassName,
}: {
  value: number;
  onValueChange: (value: number) => void;
  fieldClassName: string;
  triggerClassName: string;
  inputClassName: string;
  labelClassName: string;
}) {
  const [open, setOpen] = useState(false);
  const count = normalizeCount(value);

  return (
    <div className={fieldClassName}>
      <span className={labelClassName}>数量</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(triggerClassName, "flex items-center")}
            aria-label={`选择生成数量，当前 ${count} 张`}
          >
            <span className="min-w-0 truncate">{count} 张</span>
            <ChevronDown className="size-4 shrink-0 opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="z-[120] w-[min(15rem,calc(100vw-2rem))] p-1.5"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <div className="px-3 pt-2 pb-1">
            <div className="text-sm font-black text-foreground">数量</div>
            <div className="mt-1 text-xs leading-5 text-muted-foreground">选择本次 official 任务的出图数量。</div>
          </div>
          <div className="grid gap-1 py-1" role="listbox" aria-label="数量">
            {PRO_STUDIO_COUNT_OPTIONS.map((option) => {
              const active = option === count;
              return (
                <button
                  key={option}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={cn(
                    "flex items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-black transition hover:bg-accent",
                    active && "bg-accent text-foreground",
                  )}
                  onClick={() => {
                    onValueChange(option);
                    setOpen(false);
                  }}
                >
                  <span className="flex items-center gap-2">
                    <Layers className="size-3.5 text-muted-foreground" />
                    {option} 张
                  </span>
                  {active ? <Check className="size-4" /> : null}
                </button>
              );
            })}
          </div>
          <label className="mt-1 grid gap-1.5 border-t border-border px-3 pt-3 pb-2">
            <span className="text-[11px] font-bold text-muted-foreground">自定义数量</span>
            <Input
              type="number"
              min={1}
              max={OFFICIAL_IMAGE_LIMITS.maxN}
              value={count}
              onChange={(event) => onValueChange(normalizeCount(event.target.value))}
              className={cn(inputClassName, "h-9 rounded-lg border bg-background px-3 text-left")}
            />
          </label>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function ProStudioSelect<T extends string>({
  label,
  value,
  options,
  onValueChange,
  fieldClassName,
  selectTriggerClassName,
  labelClassName,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onValueChange: (value: T) => void;
  fieldClassName: string;
  selectTriggerClassName: string;
  labelClassName: string;
}) {
  return (
    <label className={fieldClassName}>
      <span className={labelClassName}>{label}</span>
      <Select value={value} onValueChange={(next) => onValueChange(next as T)}>
        <SelectTrigger className={selectTriggerClassName}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>{option}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

function resolutionLabel(resolution: OfficialImageResolution) {
  return resolution.toUpperCase();
}

function proStudioRatioSummary(settings: ProStudioState["settings"]) {
  return `${PRO_STUDIO_SIZE_LABELS[settings.size]} · ${resolutionLabel(settings.resolution)} · ${qualityLabel(settings.quality)}`;
}

function qualityLabel(quality: ProStudioState["settings"]["quality"]) {
  switch (quality) {
    case "low":
      return "基础";
    case "medium":
      return "标准";
    case "high":
      return "高质";
    default:
      return "智能";
  }
}

function RatioGlyph({ size, active }: { size: OfficialImageSize; active: boolean }) {
  if (size === "auto") {
    return (
      <span className={cn(
        "flex size-3.5 items-center justify-center rounded border",
        active ? "border-foreground" : "border-muted-foreground",
      )}>
        <span className={cn("size-1 rounded-full", active ? "bg-foreground" : "bg-muted-foreground")} />
      </span>
    );
  }

  const [rawWidth, rawHeight] = size.split(":").map((value) => Number(value) || 1);
  const ratio = rawWidth / rawHeight;
  const width = ratio >= 1 ? 17 : Math.max(7, Math.round(17 * ratio));
  const height = ratio >= 1 ? Math.max(7, Math.round(17 / ratio)) : 17;
  return (
    <span
      className={cn("rounded-[3px] border", active ? "border-foreground" : "border-muted-foreground")}
      style={{ width, height }}
    />
  );
}

function SegmentedSetting<T extends string>({
  label,
  value,
  options,
  onValueChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onValueChange: (value: T) => void;
}) {
  return (
    <div className="grid gap-2">
      <div className="px-1 text-xs font-bold text-muted-foreground">{label}</div>
      <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl bg-muted/70 p-1 dark:bg-slate-950/45">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              className={cn(
                "h-8 rounded-lg px-3 text-xs font-bold text-muted-foreground transition hover:bg-background/70 hover:text-foreground",
                active && "bg-background text-foreground shadow-sm",
              )}
              onClick={() => onValueChange(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function normalizeCount(value: number | string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 1;
  }
  return Math.max(1, Math.min(OFFICIAL_IMAGE_LIMITS.maxN, Math.round(numeric)));
}
