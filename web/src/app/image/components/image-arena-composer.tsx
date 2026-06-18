"use client";

import { ImagePlus, LoaderCircle, MessageSquareText, Plus, Send, Trash2 } from "lucide-react";
import type { RefObject } from "react";

import { ImageModelSettingsButton } from "@/components/image-model-settings-button";
import { ModelProviderIcon, ModelProviderOptionLabel } from "@/components/model-provider-icon";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  IMAGE_ARENA_MAX_AGENT_SLOTS,
  imageArenaAgentOptions,
  type ImageArenaAgentMode,
  type ImageArenaAgentSlotDraft,
} from "@/lib/image-arena";
import {
  isGeminiProImageModel,
  type GeminiFlashSettingsPayload,
  type ImageModel,
  type MidjourneySettingsPayload,
} from "@/lib/api";
import type { ImageModelSettingsState } from "@/lib/image-model-settings";
import type { ImageTaskToolOptions } from "@/lib/image-task-request";
import { displayModelLabel } from "@/lib/model-display";
import { cn } from "@/lib/utils";
import type { StoredReferenceImage } from "@/store/image-conversations";

type ImageArenaComposerProps = {
  mode: ImageArenaAgentMode;
  prompt: string;
  imageCount: string;
  slots: ImageArenaAgentSlotDraft[];
  chatModelOptions: Array<{ value: ImageModel; label: string }>;
  imageModelOptions: Array<{ value: ImageModel; label: string }>;
  referenceImages: StoredReferenceImage[];
  submitting: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onModeChange: (mode: ImageArenaAgentMode) => void;
  onPromptChange: (prompt: string) => void;
  onImageCountChange: (count: string) => void;
  onAddSlot: () => void;
  onRemoveSlot: (slotId: string) => void;
  onSlotModelChange: (slotId: string, model: ImageModel) => void;
  onSlotMidjourneySettingsChange: (slotId: string, settings: MidjourneySettingsPayload) => void;
  onSlotGeminiFlashSettingsChange: (slotId: string, settings: GeminiFlashSettingsPayload) => void;
  onSlotOfficialImageSettingsChange: (slotId: string, settings: ImageTaskToolOptions) => void;
  onSlotGeminiProSettingsChange: (slotId: string, settings: ImageTaskToolOptions | undefined) => void;
  onReferenceImageChange: (files: File[]) => void | Promise<void>;
  onRemoveReferenceImage: (index: number) => void;
  onSubmit: () => void | Promise<void>;
};

export function ImageArenaComposer({
  mode,
  prompt,
  imageCount,
  slots,
  chatModelOptions,
  imageModelOptions,
  referenceImages,
  submitting,
  fileInputRef,
  textareaRef,
  onModeChange,
  onPromptChange,
  onImageCountChange,
  onAddSlot,
  onRemoveSlot,
  onSlotModelChange,
  onSlotMidjourneySettingsChange,
  onSlotGeminiFlashSettingsChange,
  onSlotOfficialImageSettingsChange,
  onSlotGeminiProSettingsChange,
  onReferenceImageChange,
  onRemoveReferenceImage,
  onSubmit,
}: ImageArenaComposerProps) {
  const modelOptions = mode === "chat" ? chatModelOptions : imageModelOptions;
  const agentOptions = imageArenaAgentOptions(mode, modelOptions);
  const selectedFamilies = new Map(slots.map((slot) => [slot.familyId, slot.id]));
  const canAddSlot = slots.length < IMAGE_ARENA_MAX_AGENT_SLOTS && slots.length < new Set(agentOptions.map((option) => option.familyId)).size;
  const submitLabel = mode === "chat" ? "发送给智能体" : referenceImages.length > 0 ? "多模型编辑" : "多模型生图";
  const imageCountValue = Math.max(1, Math.min(4, Number(imageCount) || 1));
  const taskSummary = mode === "image"
    ? `${slots.length} 个智能体 · 每模型 ${imageCountValue} 张`
    : `${slots.length} 个智能体`;

  return (
    <div className="w-full space-y-2 sm:space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          void onReferenceImageChange(Array.from(event.target.files || []));
          event.currentTarget.value = "";
        }}
      />

      <div className="rounded-[24px] border border-[#e5e7eb] bg-white/92 p-2 shadow-[0_14px_38px_-30px_rgba(15,23,42,0.5)] backdrop-blur-xl dark:border-border dark:bg-card/90">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex h-9 shrink-0 items-center rounded-full bg-[#f0f0f0] p-0.5 text-xs font-medium text-[#45515e] dark:bg-muted/70 dark:text-muted-foreground">
            <button
              type="button"
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full px-3 transition",
                mode === "chat"
                  ? "bg-white text-[#18181b] shadow-sm dark:bg-background dark:text-foreground"
                  : "hover:bg-white/70 hover:text-[#18181b] dark:hover:bg-background/70 dark:hover:text-foreground",
              )}
              onClick={() => onModeChange("chat")}
              aria-pressed={mode === "chat"}
            >
              <MessageSquareText className="size-3.5" />
              回答
            </button>
            <button
              type="button"
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full px-3 transition",
                mode === "image"
                  ? "bg-white text-[#18181b] shadow-sm dark:bg-background dark:text-foreground"
                  : "hover:bg-white/70 hover:text-[#18181b] dark:hover:bg-background/70 dark:hover:text-foreground",
              )}
              onClick={() => onModeChange("image")}
              aria-pressed={mode === "image"}
            >
              <ImagePlus className="size-3.5" />
              生图
            </button>
          </div>

          <div className="flex min-w-0 items-center gap-2">
            {mode === "image" ? (
              <label className="hidden items-center gap-2 text-xs text-[#45515e] dark:text-muted-foreground sm:flex">
                每模型
                <Select value={imageCount} onValueChange={onImageCountChange}>
                  <SelectTrigger className="h-8 w-[84px] rounded-full bg-white text-xs shadow-none dark:border-border dark:bg-background/70 dark:text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {[1, 2, 3, 4].map((count) => (
                        <SelectItem key={count} value={String(count)} disabled={count * slots.length > 12}>
                          {count} 张
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </label>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 shrink-0 rounded-full border-[#e5e7eb] bg-white px-3 text-xs text-[#45515e] shadow-none hover:bg-black/[0.05] dark:border-border dark:bg-background/70 dark:text-muted-foreground dark:hover:bg-accent/60 dark:hover:text-foreground"
              disabled={!canAddSlot}
              onClick={onAddSlot}
              title={canAddSlot ? "添加智能体" : `最多 ${IMAGE_ARENA_MAX_AGENT_SLOTS} 个智能体，且同类型只能选一个`}
            >
              <Plus className="size-3.5" />
              添加智能体
            </Button>
          </div>
        </div>

        <div className="hide-scrollbar mt-2 flex gap-2 overflow-x-auto pb-0.5">
          {slots.map((slot, index) => (
            <div
              key={slot.id}
              className="min-w-[190px] shrink-0 rounded-2xl border border-[#e5e7eb] bg-[#fafafa] p-2 dark:border-border dark:bg-muted/30 sm:min-w-[210px]"
            >
              <div className="mb-2 flex items-center justify-between gap-2 text-xs font-medium text-[#45515e] dark:text-muted-foreground">
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <ModelProviderIcon model={slot.model} label={slot.modelLabel} size="sm" />
                  <span className="truncate">智能体 {index + 1}</span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-6 shrink-0 text-stone-400 hover:bg-rose-50 hover:text-rose-600 dark:text-muted-foreground dark:hover:bg-rose-950/30 dark:hover:text-rose-300"
                  disabled={slots.length <= 1}
                  onClick={() => onRemoveSlot(slot.id)}
                  title="移除智能体"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
              <div className="flex items-center gap-1.5">
                <Select value={slot.model} onValueChange={(value) => onSlotModelChange(slot.id, value as ImageModel)}>
                  <SelectTrigger className="h-8 min-w-0 flex-1 rounded-xl bg-white text-xs shadow-none dark:border-border dark:bg-background/70 dark:text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {agentOptions.map((option) => {
                        const selectedBy = selectedFamilies.get(option.familyId);
                        const disabled = Boolean(selectedBy && selectedBy !== slot.id);
                        return (
                          <SelectItem key={option.value} value={option.value} disabled={disabled} textValue={displayModelLabel(option.value, option.label)}>
                            <ModelProviderOptionLabel model={option.value} label={option.label} />
                          </SelectItem>
                        );
                      })}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {mode === "image" ? (
                  <SlotSettingsPopover
                    slot={slot}
                    onSlotMidjourneySettingsChange={onSlotMidjourneySettingsChange}
                    onSlotGeminiFlashSettingsChange={onSlotGeminiFlashSettingsChange}
                    onSlotOfficialImageSettingsChange={onSlotOfficialImageSettingsChange}
                    onSlotGeminiProSettingsChange={onSlotGeminiProSettingsChange}
                  />
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      {mode === "image" && referenceImages.length > 0 ? (
        <div className="hide-scrollbar flex max-h-20 gap-2 overflow-x-auto px-1 py-1">
          {referenceImages.map((image, index) => (
            <button
              key={`${image.name}-${index}`}
              type="button"
              className="group relative size-14 shrink-0 overflow-hidden rounded-xl border border-stone-200 bg-stone-50 transition hover:border-rose-300 dark:border-border dark:bg-muted/40"
              onClick={() => onRemoveReferenceImage(index)}
              title={`点击移除 ${image.name || `参考图 ${index + 1}`}`}
              aria-label={`移除参考图 ${image.name || index + 1}`}
            >
              <img
                src={image.dataUrl}
                alt={image.name || `参考图 ${index + 1}`}
                className="h-full w-full object-cover"
              />
              <span className="absolute right-1 top-1 inline-flex size-5 items-center justify-center rounded-full bg-white/95 text-stone-500 opacity-0 shadow-sm transition group-hover:opacity-100 dark:bg-card/95 dark:text-muted-foreground">
                <Trash2 className="size-3" />
              </span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="relative overflow-visible rounded-[30px] border border-[#dedee3] bg-[#fffcff]/95 shadow-[0_20px_70px_-42px_rgba(15,23,42,0.5)] backdrop-blur-xl transition-colors dark:border-border dark:bg-card/95 dark:shadow-[0_24px_80px_-38px_rgba(0,0,0,0.78)] sm:rounded-[24px] sm:border-[#f2f3f5] sm:bg-white/95 sm:shadow-[0_24px_80px_-34px_rgba(15,23,42,0.42)] sm:dark:border-border sm:dark:bg-card/95">
        <div className="hidden h-4 w-full select-none items-center justify-center rounded-t-[24px] sm:flex">
          <span className="h-1 w-10 rounded-full bg-[#8e8e93]/40 dark:bg-muted-foreground/35" />
        </div>
        <div
          className="cursor-text"
          onClick={() => {
            textareaRef.current?.focus();
          }}
        >
          <Textarea
            ref={textareaRef}
            rows={1}
            value={prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            placeholder={mode === "chat" ? "输入消息与多个智能体聊天" : referenceImages.length > 0 ? "描述你希望多个模型如何修改参考图" : "输入你想要生成的画面"}
            className="min-h-[76px] resize-none rounded-none border-0 bg-transparent px-5 pt-4 pb-1 text-[16px] leading-6 text-[#222222] shadow-none placeholder:text-[#8e8e93] focus-visible:ring-0 dark:text-foreground dark:placeholder:text-muted-foreground sm:min-h-[96px] sm:px-5 sm:py-4 sm:text-[15px] sm:leading-6"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void onSubmit();
              }
            }}
          />

          <div
            className="rounded-b-[30px] bg-transparent px-3 pt-1 pb-3 sm:rounded-b-[24px] sm:border-t sm:border-[#f2f3f5] sm:bg-white/80 sm:px-4 sm:py-2.5 sm:dark:border-border sm:dark:bg-card/80"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:gap-3">
              <div className="flex min-w-0 flex-nowrap items-center gap-1.5 sm:gap-2">
                <span className="inline-flex h-8 shrink-0 items-center rounded-full border border-[#e5e7eb] bg-white px-3 text-xs font-medium text-[#45515e] dark:border-border dark:bg-background/70 dark:text-muted-foreground">
                  {taskSummary}
                </span>
                {mode === "image" ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 shrink-0 rounded-full border-[#e5e7eb] bg-white px-3 text-xs text-[#45515e] shadow-none hover:bg-black/[0.05] dark:border-border dark:bg-background/70 dark:text-muted-foreground dark:hover:bg-accent/60 dark:hover:text-foreground"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <ImagePlus className="size-3.5" />
                      <span className="hidden sm:inline">参考图</span>
                    </Button>
                    <div className="sm:hidden">
                      <Select value={imageCount} onValueChange={onImageCountChange}>
                        <SelectTrigger className="h-8 w-[76px] rounded-full bg-white text-xs shadow-none dark:border-border dark:bg-background/70 dark:text-foreground">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {[1, 2, 3, 4].map((count) => (
                              <SelectItem key={count} value={String(count)} disabled={count * slots.length > 12}>
                                {count} 张
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                ) : null}
              </div>
              <Button
                type="button"
                size="icon"
                className="size-11 shrink-0 rounded-full bg-[#8ea7ff] text-white shadow-[0_10px_24px_-14px_rgba(20,86,240,0.75)] transition hover:bg-[#1456f0] disabled:bg-[#e5e7eb] disabled:text-[#9ca3af] dark:bg-sky-500 dark:hover:bg-sky-400 dark:disabled:bg-muted dark:disabled:text-muted-foreground"
                disabled={submitting || !prompt.trim() || slots.length === 0}
                onClick={() => void onSubmit()}
                title={submitLabel}
                aria-label={submitLabel}
              >
                {submitting ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-5" />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SlotSettingsPopover({
  slot,
  onSlotMidjourneySettingsChange,
  onSlotGeminiFlashSettingsChange,
  onSlotOfficialImageSettingsChange,
  onSlotGeminiProSettingsChange,
}: {
  slot: ImageArenaAgentSlotDraft;
  onSlotMidjourneySettingsChange: (slotId: string, settings: MidjourneySettingsPayload) => void;
  onSlotGeminiFlashSettingsChange: (slotId: string, settings: GeminiFlashSettingsPayload) => void;
  onSlotOfficialImageSettingsChange: (slotId: string, settings: ImageTaskToolOptions) => void;
  onSlotGeminiProSettingsChange: (slotId: string, settings: ImageTaskToolOptions | undefined) => void;
}) {
  const value: ImageModelSettingsState = {
    ...slot.imageModelSettings,
    midjourney: slot.midjourneySettings || slot.imageModelSettings?.midjourney,
    geminiFlash: slot.geminiFlashSettings || slot.imageModelSettings?.geminiFlash,
    officialImage: slot.officialImageSettings || slot.imageModelSettings?.officialImage,
    geminiPro: slot.geminiProSettings || slot.imageModelSettings?.geminiPro,
  };
  return (
    <ImageModelSettingsButton
      model={slot.model}
      value={value}
      compact
      onChange={(settings) => {
        if (settings.midjourney) {
          onSlotMidjourneySettingsChange(slot.id, settings.midjourney);
        }
        if (settings.geminiFlash) {
          onSlotGeminiFlashSettingsChange(slot.id, settings.geminiFlash);
        }
        if (settings.officialImage) {
          onSlotOfficialImageSettingsChange(slot.id, settings.officialImage);
        }
        if (isGeminiProImageModel(slot.model)) {
          onSlotGeminiProSettingsChange(slot.id, settings.geminiPro);
        } else if (settings.geminiPro) {
          onSlotGeminiProSettingsChange(slot.id, settings.geminiPro);
        }
      }}
    />
  );
}
