"use client";

import { Check, ChevronDown } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  CUSTOM_IMAGE_ASPECT_RATIO,
  isPixelIconSize,
  parseImageRatio,
} from "@/lib/image-parameters";
import { compactImageRatioLabel, type ImageRatioPickerOption } from "@/lib/image-ratio-picker-options";
import { cn } from "@/lib/utils";

export function ImageRatioPicker<Value extends string>({
  label,
  value,
  valueLabel,
  options,
  open,
  onOpenChange,
  onValueChange,
  align = "end",
  side = "bottom",
  triggerClassName,
  contentClassName,
  optionGridClassName,
  disabled,
  triggerTitle,
}: {
  label: string;
  value: Value;
  valueLabel: string;
  options: ReadonlyArray<ImageRatioPickerOption<Value>>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onValueChange: (value: Value) => void;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  triggerClassName?: string;
  contentClassName?: string;
  optionGridClassName?: string;
  disabled?: boolean;
  triggerTitle?: string;
}) {
  const groups = groupRatioOptions(options);
  const displayValue = compactImageRatioLabel(valueLabel);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-9 min-w-0 items-center justify-between gap-2 rounded-xl border bg-background px-3 text-xs font-bold text-foreground shadow-none transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50",
            triggerClassName,
          )}
          aria-label={`选择${label}，当前 ${displayValue}`}
          aria-expanded={open}
          disabled={disabled}
          title={triggerTitle}
        >
          <span className="min-w-0 truncate">{displayValue}</span>
          <ChevronDown className={cn("size-4 shrink-0 opacity-60 transition", open && "rotate-180")} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        side={side}
        sideOffset={8}
        collisionPadding={12}
        className={cn(
          "z-[120] w-[min(21rem,calc(100vw-2rem))] overflow-hidden rounded-[18px] border-border bg-popover p-0 shadow-[0_18px_46px_-26px_rgba(15,23,42,0.35)] dark:shadow-[0_18px_46px_-24px_rgba(0,0,0,0.72)]",
          contentClassName,
        )}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="space-y-3 p-3" role="listbox" aria-label={label}>
          {groups.map((group) => (
            <div key={group.section} className="grid gap-1.5">
              <div className="px-1 text-[11px] font-bold text-muted-foreground">{group.section}</div>
              <div className={cn("grid grid-cols-4 gap-1.5 rounded-2xl bg-muted/70 p-1.5 dark:bg-slate-950/45", optionGridClassName)}>
                {group.options.map((option) => {
                  const active = option.value === value;
                  const optionLabel = compactImageRatioLabel(option.label);
                  return (
                    <button
                      key={`${group.section}-${option.value || option.label}`}
                      type="button"
                      role="option"
                      aria-selected={active}
                      title={option.description || option.label}
                      className={cn(
                        "relative flex h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-bold text-muted-foreground transition hover:bg-background/70 hover:text-foreground",
                        active && "bg-background text-foreground shadow-sm",
                      )}
                      onClick={() => {
                        onValueChange(option.value);
                        onOpenChange?.(false);
                      }}
                    >
                      {active ? <Check className="absolute right-1.5 top-1.5 size-3" /> : null}
                      <RatioGlyph value={option.glyphValue || option.value} active={active} />
                      <span className="max-w-full truncate leading-none">{optionLabel}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function groupRatioOptions<Value extends string>(options: ReadonlyArray<ImageRatioPickerOption<Value>>) {
  const groups: Array<{ section: string; options: ImageRatioPickerOption<Value>[] }> = [];
  for (const option of options) {
    const section = option.section || "比例";
    let group = groups.find((item) => item.section === section);
    if (!group) {
      group = { section, options: [] };
      groups.push(group);
    }
    group.options.push(option);
  }
  return groups;
}

function RatioGlyph({ value, active }: { value: string; active: boolean }) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized === "auto") {
    return (
      <span className={cn("flex size-4 items-center justify-center rounded border", active ? "border-foreground" : "border-muted-foreground")}>
        <span className={cn("size-1.5 rounded-full", active ? "bg-foreground" : "bg-muted-foreground")} />
      </span>
    );
  }

  if (normalized === CUSTOM_IMAGE_ASPECT_RATIO) {
    return (
      <span className={cn("flex h-4 w-5 items-center justify-center rounded-[4px] border border-dashed", active ? "border-foreground" : "border-muted-foreground")}>
        <span className={cn("h-0.5 w-2 rounded-full", active ? "bg-foreground" : "bg-muted-foreground")} />
      </span>
    );
  }

  if (isPixelIconSize(normalized)) {
    return (
      <span className={cn("grid size-4 grid-cols-2 gap-px rounded-[4px] border p-0.5", active ? "border-foreground" : "border-muted-foreground")}>
        <span className={cn("rounded-[1px]", active ? "bg-foreground" : "bg-muted-foreground")} />
        <span className={cn("rounded-[1px]", active ? "bg-foreground/45" : "bg-muted-foreground/45")} />
        <span className={cn("rounded-[1px]", active ? "bg-foreground/45" : "bg-muted-foreground/45")} />
        <span className={cn("rounded-[1px]", active ? "bg-foreground" : "bg-muted-foreground")} />
      </span>
    );
  }

  const parsed = parseImageRatio(normalized);
  if (!parsed) {
    return <span className={cn("size-4 rounded-[4px] border", active ? "border-foreground" : "border-muted-foreground")} />;
  }

  const ratio = parsed.width / parsed.height;
  const width = ratio >= 1 ? 18 : Math.max(7, Math.round(18 * ratio));
  const height = ratio >= 1 ? Math.max(7, Math.round(18 / ratio)) : 18;
  return (
    <span
      className={cn("rounded-[4px] border", active ? "border-foreground" : "border-muted-foreground")}
      style={{ width, height }}
    />
  );
}
