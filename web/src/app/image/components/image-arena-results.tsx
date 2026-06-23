"use client";

import { CircleStop, Download, Eye, FolderPlus, ImagePlus, LoaderCircle, RotateCcw, Send } from "lucide-react";
import { useState } from "react";

import { AuthenticatedImage } from "@/components/authenticated-image";
import { MarkdownMessage } from "@/components/markdown-message";
import { ModelProviderIcon } from "@/components/model-provider-icon";
import { displayModelLabel } from "@/lib/model-display";
import { Button } from "@/components/ui/button";
import { buildTimestampedImageDownloadName, downloadImageFile } from "@/lib/image-download";
import { getManagedImagePathFromUrl, getManagedImageThumbnailUrlFromPath, getManagedImageUrlFromPath } from "@/lib/image-path";
import { cn } from "@/lib/utils";
import type { ImageLightboxItem } from "@/app/image/components/image-results";
import type { ImageConversation, ImageArenaRun, StoredImage } from "@/store/image-conversations";

type ImageArenaResultsProps = {
  selectedConversation: ImageConversation | null;
  actionKey: string;
  onOpenLightbox: (images: ImageLightboxItem[], index: number) => void;
  onRetryRun: (conversationId: string, turnId: string, runId: string) => void | Promise<void>;
  onCancelTurn: (conversationId: string, turnId: string) => void | Promise<void>;
  onFavoriteImage: (image: StoredImage) => void | Promise<void>;
  onSendRunToCanvas: (conversationId: string, turnId: string, run: ImageArenaRun) => void | Promise<void>;
  onSendImageToEcommerce: (conversationId: string, turnId: string, run: ImageArenaRun, image: StoredImage) => void | Promise<void>;
  formatConversationTime: (value: string) => string;
};

function imageSrc(image: StoredImage) {
  if (image.b64_json) {
    return `data:image/${image.outputFormat || "png"};base64,${image.b64_json}`;
  }
  if (image.localUrl || image.url) {
    return image.url || image.localUrl || "";
  }
  return image.path ? getManagedImageUrlFromPath(image.path) : "";
}

function imagePreviewSrc(image: StoredImage) {
  if (image.b64_json) {
    return imageSrc(image);
  }
  const path = image.path || getManagedImagePathFromUrl(image.localUrl || image.url || "");
  return path ? getManagedImageThumbnailUrlFromPath(path) : imageSrc(image);
}

function statusLabel(status: ImageArenaRun["status"]) {
  if (status === "idle") return "待提交";
  if (status === "submitting") return "提交中";
  if (status === "queued") return "排队中";
  if (status === "running") return "运行中";
  if (status === "success") return "已完成";
  if (status === "cancelled") return "已终止";
  if (status === "blocked") return "已阻止";
  return "失败";
}

function statusClass(status: ImageArenaRun["status"]) {
  if (status === "success") return "bg-emerald-50 text-emerald-700";
  if (status === "error" || status === "blocked") return "bg-rose-50 text-rose-700";
  if (status === "cancelled") return "bg-amber-50 text-amber-700";
  return "bg-blue-50 text-[#1456f0]";
}

function isRunBusy(run: ImageArenaRun) {
  return run.status === "idle" || run.status === "submitting" || run.status === "queued" || run.status === "running";
}

function runSucceededImages(run: ImageArenaRun) {
  return (run.images || []).filter((image) => image.status === "success" && imageSrc(image));
}

function formatTokenCount(tokens?: number) {
  if (tokens === undefined || !Number.isFinite(tokens) || tokens < 0) {
    return "";
  }
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 10_000) {
    return `${Math.round(tokens / 1_000)}K`;
  }
  return new Intl.NumberFormat("zh-CN").format(tokens);
}

function ArenaRunImageGallery({
  actionKey,
  conversationId,
  turnId,
  run,
  runModelLabel,
  runModelIdLabel,
  images,
  lightboxImages,
  onOpenLightbox,
  onFavoriteImage,
  onSendImageToEcommerce,
}: {
  actionKey: string;
  conversationId: string;
  turnId: string;
  run: ImageArenaRun;
  runModelLabel: string;
  runModelIdLabel: string;
  images: StoredImage[];
  lightboxImages: ImageLightboxItem[];
  onOpenLightbox: (images: ImageLightboxItem[], index: number) => void;
  onFavoriteImage: (image: StoredImage) => void | Promise<void>;
  onSendImageToEcommerce: (conversationId: string, turnId: string, run: ImageArenaRun, image: StoredImage) => void | Promise<void>;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const activeIndex = Math.min(selectedIndex, Math.max(0, images.length - 1));
  const activeImage = images[activeIndex];
  const activeSrc = activeImage ? imageSrc(activeImage) : "";

  if (!activeImage || !activeSrc) {
    return null;
  }

  if (images.length === 1) {
    return (
      <figure className="group relative overflow-hidden rounded-2xl bg-[#f0f0f0] dark:bg-muted/40">
        <button
          type="button"
          className="block w-full"
          onClick={() => onOpenLightbox(lightboxImages, activeIndex)}
        >
          <AuthenticatedImage
            src={imagePreviewSrc(activeImage)}
            alt={`${runModelLabel} 结果 ${activeIndex + 1}`}
            className="aspect-square w-full object-cover transition group-hover:brightness-95"
          />
        </button>
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
          <Button type="button" size="icon" variant="outline" className="size-7 bg-white/95" onClick={() => onOpenLightbox(lightboxImages, activeIndex)} title="预览">
            <Eye className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="size-7 bg-white/95"
            title="下载"
            onClick={() =>
              void downloadImageFile({
                id: activeImage.id,
                src: activeSrc,
                path: activeImage.path || getManagedImagePathFromUrl(activeImage.localUrl || activeImage.url || ""),
                fileName: lightboxImages[activeIndex]?.fileName || `image-arena-${runModelIdLabel}-${activeIndex + 1}.png`,
              })
            }
          >
            <Download className="size-3.5" />
          </Button>
        </div>
        <div className="absolute right-2 bottom-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 rounded-full bg-white/95 px-2 text-[11px]"
            disabled={actionKey === `favorite:${activeImage.id}`}
            onClick={() => void onFavoriteImage(activeImage)}
          >
            {actionKey === `favorite:${activeImage.id}` ? <LoaderCircle className="size-3 animate-spin" /> : <FolderPlus className="size-3" />}
            收藏
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 rounded-full bg-white/95 px-2 text-[11px]"
            disabled={actionKey === `commerce:${activeImage.id}`}
            onClick={() => void onSendImageToEcommerce(conversationId, turnId, run, activeImage)}
          >
            <Send className="size-3" />
            电商
          </Button>
        </div>
      </figure>
    );
  }

  return (
    <div className="grid flex-1 grid-cols-[minmax(0,1fr)_68px] items-stretch gap-2 sm:grid-cols-[minmax(0,1fr)_76px]">
      <figure className="group relative min-w-0 overflow-hidden rounded-2xl bg-[#f0f0f0] dark:bg-muted/40">
        <button
          type="button"
          className="block w-full"
          onClick={() => onOpenLightbox(lightboxImages, activeIndex)}
        >
          <AuthenticatedImage
            src={imagePreviewSrc(activeImage)}
            alt={`${runModelLabel} 结果 ${activeIndex + 1}`}
            className="aspect-square w-full object-cover transition group-hover:brightness-95"
          />
        </button>
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
          <Button type="button" size="icon" variant="outline" className="size-7 bg-white/95" onClick={() => onOpenLightbox(lightboxImages, activeIndex)} title="预览">
            <Eye className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="size-7 bg-white/95"
            title="下载"
            onClick={() =>
              void downloadImageFile({
                id: activeImage.id,
                src: activeSrc,
                path: activeImage.path || getManagedImagePathFromUrl(activeImage.localUrl || activeImage.url || ""),
                fileName: lightboxImages[activeIndex]?.fileName || `image-arena-${runModelIdLabel}-${activeIndex + 1}.png`,
              })
            }
          >
            <Download className="size-3.5" />
          </Button>
        </div>
        <div className="absolute right-2 bottom-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 rounded-full bg-white/95 px-2 text-[11px]"
            disabled={actionKey === `favorite:${activeImage.id}`}
            onClick={() => void onFavoriteImage(activeImage)}
          >
            {actionKey === `favorite:${activeImage.id}` ? <LoaderCircle className="size-3 animate-spin" /> : <FolderPlus className="size-3" />}
            收藏
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 rounded-full bg-white/95 px-2 text-[11px]"
            disabled={actionKey === `commerce:${activeImage.id}`}
            onClick={() => void onSendImageToEcommerce(conversationId, turnId, run, activeImage)}
          >
            <Send className="size-3" />
            电商
          </Button>
        </div>
      </figure>

      <div
        className="grid min-h-0 gap-1.5 rounded-2xl bg-[#f7f7f8] p-1.5 dark:bg-background/70"
        style={{ gridTemplateRows: `repeat(${images.length}, minmax(0, 1fr))` }}
      >
        {images.map((image, index) => (
          <button
            key={image.id}
            type="button"
            className={cn(
              "group relative min-h-0 overflow-hidden rounded-xl border bg-[#f0f0f0] text-left transition dark:bg-muted/40",
              index === activeIndex
                ? "border-[#1456f0] shadow-[0_0_0_2px_rgba(20,86,240,0.15)]"
                : "border-transparent hover:border-[#cfd7e6]",
            )}
            onClick={() => setSelectedIndex(index)}
            aria-label={`切换到 ${runModelLabel} 结果 ${index + 1}`}
          >
            <AuthenticatedImage
              src={imagePreviewSrc(image)}
              alt={`${runModelLabel} 缩略图 ${index + 1}`}
              className="h-full w-full object-cover transition group-hover:brightness-95"
            />
            <span className="absolute bottom-1 left-1 rounded-full bg-black/62 px-1.5 py-0.5 text-[10px] font-medium text-white">
              {index + 1}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function ImageArenaResults({
  selectedConversation,
  actionKey,
  onOpenLightbox,
  onRetryRun,
  onCancelTurn,
  onFavoriteImage,
  onSendRunToCanvas,
  onSendImageToEcommerce,
  formatConversationTime,
}: ImageArenaResultsProps) {
  if (!selectedConversation) {
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center text-center">
        <div className="max-w-[520px]">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-600">
            多智能体
          </div>
          <h1 className="font-display text-3xl font-medium text-[#222222] dark:text-foreground sm:text-5xl">
            多个模型，同场回答
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#686b73] dark:text-muted-foreground">
            新建多智能体对话后，底部输入一次，上方会按模型卡片并排展示结果。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 sm:gap-7">
      {selectedConversation.turns.map((turn, turnIndex) => {
        const runs = turn.arenaRuns || [];
        const turnBusy = runs.some(isRunBusy);
        return (
          <section key={turn.id} className="flex flex-col gap-3">
            <div className="flex justify-end">
              <article className="w-full max-w-[min(94%,820px)] rounded-[24px] border border-[#f2f3f5] bg-white px-4 py-3 text-left text-sm leading-6 text-[#222222] shadow-[0_4px_6px_rgba(0,0,0,0.08)] sm:px-5 sm:py-4">
                <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px] text-[#45515e]">
                  <span className="rounded-full bg-[#f0f0f0] px-2.5 py-0.5">第 {turnIndex + 1} 轮</span>
                  <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-indigo-600">多智能体</span>
                  <span className="rounded-full bg-[#f0f0f0] px-2.5 py-0.5">{turn.arenaMode === "chat" ? "回答" : "生图"}</span>
                  <span className="px-1 text-[#8e8e93]">{formatConversationTime(turn.createdAt)}</span>
                  {turnBusy ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="ml-auto h-7 rounded-full border-amber-200 bg-amber-50 px-2.5 text-[11px] text-amber-700 hover:bg-amber-100"
                      onClick={() => void onCancelTurn(selectedConversation.id, turn.id)}
                    >
                      <CircleStop className="size-3.5" />
                      终止本轮
                    </Button>
                  ) : null}
                </div>
                <div className="whitespace-pre-wrap break-words">{turn.prompt}</div>
              </article>
            </div>

            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
              {runs.map((run) => {
                const runModelLabel = displayModelLabel(run.model, run.modelLabel);
                const runModelIdLabel = displayModelLabel(run.model);
                const successImages = runSucceededImages(run);
                const lightboxImages = successImages.map((image, index): ImageLightboxItem => ({
                  id: image.id,
                  src: imageSrc(image),
                  fileName: buildTimestampedImageDownloadName({
                    prefix: "image-arena",
                    createdAt: turn.createdAt,
                    id: run.id,
                    index,
                    outputFormat: image.outputFormat,
                    src: imageSrc(image),
                  }),
                  outputFormat: image.outputFormat,
                  dimensions: image.width && image.height ? `${image.width} x ${image.height}` : image.resolution,
                }));
                return (
                  <article key={run.id} className="flex min-h-[220px] flex-col rounded-[22px] border border-[#e5e7eb] bg-white p-3 shadow-sm dark:border-border dark:bg-card">
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-start gap-2">
                        <ModelProviderIcon model={run.model} label={runModelLabel} size="lg" className="mt-0.5" />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-[#222222] dark:text-foreground">{runModelLabel}</div>
                        </div>
                      </div>
                      <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium", statusClass(run.status))}>
                        {statusLabel(run.status)}
                      </span>
                    </div>

                    {run.status === "submitting" || run.status === "queued" || run.status === "running" || run.status === "idle" ? (
                      <div className="flex min-h-[150px] flex-1 flex-col items-center justify-center gap-2 rounded-2xl bg-[#f7f7f8] text-center text-sm text-[#686b73]">
                        {run.status === "queued" ? <span className="rounded-full bg-white p-2 shadow-sm">排队</span> : <LoaderCircle className="size-5 animate-spin" />}
                        <span>{run.status === "idle" ? "等待提交" : "正在等待模型结果"}</span>
                      </div>
                    ) : null}

                    {run.textResponse ? (
                      <MarkdownMessage className="min-h-[150px] flex-1 rounded-2xl bg-[#f7f7f8] px-3 py-2.5 text-[#30343b] dark:bg-background/70 dark:text-foreground">
                        {run.textResponse}
                      </MarkdownMessage>
                    ) : null}

                    {successImages.length > 0 ? (
                      <ArenaRunImageGallery
                        actionKey={actionKey}
                        conversationId={selectedConversation.id}
                        turnId={turn.id}
                        run={run}
                        runModelLabel={runModelLabel}
                        runModelIdLabel={runModelIdLabel}
                        images={successImages}
                        lightboxImages={lightboxImages}
                        onOpenLightbox={onOpenLightbox}
                        onFavoriteImage={onFavoriteImage}
                        onSendImageToEcommerce={onSendImageToEcommerce}
                      />
                    ) : null}

                    {run.error ? (
                      <div className="min-h-[150px] flex-1 rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2.5 text-sm leading-6 text-rose-700">
                        {run.error}
                      </div>
                    ) : null}

                    {!isRunBusy(run) ? (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        {formatTokenCount(run.usageTokens) ? (
                          <span className="inline-flex h-8 items-center rounded-full border border-[#e5e7eb] bg-[#f7f7f8] px-2.5 text-[11px] font-medium text-[#686b73] dark:border-border dark:bg-background/70 dark:text-muted-foreground">
                            消耗 {formatTokenCount(run.usageTokens)} token
                          </span>
                        ) : null}
                        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                          {successImages.length > 0 ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 rounded-full border-[#e5e7eb] bg-white px-3 text-xs dark:border-border dark:bg-background"
                              disabled={actionKey === `canvas:${run.id}`}
                              onClick={() => void onSendRunToCanvas(selectedConversation.id, turn.id, run)}
                            >
                              {actionKey === `canvas:${run.id}` ? <LoaderCircle className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
                              加入画布
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-full border-[#e5e7eb] bg-white px-3 text-xs dark:border-border dark:bg-background"
                            disabled={!turn.prompt.trim()}
                            onClick={() => void onRetryRun(selectedConversation.id, turn.id, run.id)}
                          >
                            <RotateCcw className="size-3.5" />
                            重试此模型
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
