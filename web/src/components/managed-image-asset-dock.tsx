"use client";

import { lazy, Suspense } from "react";
import { Clapperboard, Images, LoaderCircle, PanelRightOpen } from "lucide-react";

import { cn } from "@/lib/utils";

import type { ManagedImageAssetSidebarProps } from "./managed-image-asset-sidebar";
import type { ManagedVideoAssetSidebarProps } from "./managed-video-asset-sidebar";

const ManagedImageAssetSidebar = lazy(() =>
  import("./managed-image-asset-sidebar").then((module) => ({
    default: module.ManagedImageAssetSidebar,
  })),
);
const ManagedVideoAssetSidebar = lazy(() =>
  import("./managed-video-asset-sidebar").then((module) => ({
    default: module.ManagedVideoAssetSidebar,
  })),
);

export type ManagedImageAssetDockProps = ManagedImageAssetSidebarProps & {
  activated: boolean;
  assetCount: number;
  onActivate: () => void;
  triggerClassName?: string;
  loadingClassName?: string;
  loadingLabel?: string;
  showOpenButton?: boolean;
  videoLibrary?: ManagedVideoAssetSidebarProps & {
    active: boolean;
    count: number;
    onActiveChange: (active: boolean) => void;
  };
};

const defaultTriggerClassName =
  "absolute bottom-5 right-0 top-24 z-40 flex w-[56px] translate-x-0 flex-col items-center gap-3 overflow-hidden rounded-l-2xl border-y border-l border-border bg-card/92 p-2 text-card-foreground shadow-[0_18px_46px_rgba(44,74,116,0.16)] backdrop-blur max-lg:hidden dark:border-zinc-800 dark:bg-[#181818]/92 dark:text-zinc-100 dark:shadow-[0_18px_46px_rgba(0,0,0,0.36)]";

const defaultLoadingClassName =
  "absolute right-4 top-24 z-40 flex items-center justify-center rounded-full border border-border bg-card/90 px-3 py-1.5 text-card-foreground shadow-sm backdrop-blur max-lg:hidden dark:border-zinc-800 dark:bg-[#181818]/92 dark:text-zinc-100";

function ManagedImageAssetDockTrigger({
  assetCount,
  className,
  onActivate,
  onActivateVideo,
  showOpenButton,
  videoCount,
}: {
  assetCount: number;
  className?: string;
  onActivate: () => void;
  onActivateVideo?: () => void;
  showOpenButton: boolean;
  videoCount?: number;
}) {
  return (
    <aside
      className={cn(defaultTriggerClassName, className)}
      onFocus={onActivate}
      onMouseEnter={onActivate}
    >
      <button
        type="button"
        className="mt-1 flex size-10 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-600 transition hover:bg-sky-500/15 dark:text-sky-300"
        onClick={onActivate}
        title="展开素材库"
      >
        <Images className="size-5" />
      </button>
      <div className="rounded-full bg-sky-500/15 px-2 py-1 text-[11px] font-black text-sky-600 dark:bg-sky-400/15 dark:text-sky-300">
        {assetCount}
      </div>
      {typeof videoCount === "number" ? (
        <>
          <button
            type="button"
            className="flex size-9 items-center justify-center rounded-2xl text-muted-foreground transition hover:bg-muted hover:text-foreground dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-100"
            onClick={onActivateVideo || onActivate}
            title="展开视频资源库"
          >
            <Clapperboard className="size-4" />
          </button>
          <div className="rounded-full bg-slate-900/8 px-2 py-1 text-[11px] font-black text-slate-700 dark:bg-slate-100/10 dark:text-slate-200">
            {videoCount}
          </div>
        </>
      ) : null}
      {showOpenButton ? (
        <button
          type="button"
          className="mt-1 flex size-9 items-center justify-center rounded-2xl text-muted-foreground transition hover:bg-muted hover:text-foreground dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-100"
          onClick={onActivate}
          title="展开素材库"
        >
          <PanelRightOpen className="size-4" />
        </button>
      ) : null}
    </aside>
  );
}

function ManagedImageAssetDockLoading({
  className,
  label,
}: {
  className?: string;
  label: string;
}) {
  return (
    <aside className={cn(defaultLoadingClassName, className)}>
      <div className="flex items-center justify-center gap-2 text-xs font-medium text-muted-foreground">
        <LoaderCircle className="size-3.5 animate-spin" />
        <span>{label}</span>
      </div>
    </aside>
  );
}

export function ManagedImageAssetDock({
  activated,
  assetCount,
  onActivate,
  triggerClassName,
  loadingClassName,
  loadingLabel = "加载素材库...",
  showOpenButton = true,
  videoLibrary,
  ...sidebarProps
}: ManagedImageAssetDockProps) {
  if (!activated) {
    return (
      <ManagedImageAssetDockTrigger
        assetCount={assetCount}
        className={triggerClassName}
        onActivate={onActivate}
        onActivateVideo={videoLibrary ? () => {
          videoLibrary.onActiveChange(true);
          onActivate();
        } : undefined}
        showOpenButton={showOpenButton}
        videoCount={videoLibrary?.count}
      />
    );
  }

  if (videoLibrary?.active) {
    const { active, count, onActiveChange, ...videoProps } = videoLibrary;
    void active;
    return (
      <Suspense fallback={<ManagedImageAssetDockLoading className={loadingClassName} label={loadingLabel} />}>
        <aside className={cn(defaultTriggerClassName, "w-[420px] flex-row items-stretch p-3")}>
          <div className="flex h-full shrink-0 flex-col items-center gap-3 border-r border-border pr-2 dark:border-zinc-800">
            <button
              type="button"
              className="mt-1 flex size-10 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-600 transition hover:bg-sky-500/15 dark:text-sky-300"
              onClick={() => onActiveChange(false)}
              title="切换到图片素材库"
            >
              <Images className="size-5" />
            </button>
            <div className="rounded-full bg-sky-500/15 px-2 py-1 text-[11px] font-black text-sky-600 dark:bg-sky-400/15 dark:text-sky-300">
              {assetCount}
            </div>
            <button
              type="button"
              className="flex size-10 items-center justify-center rounded-2xl bg-slate-900/8 text-slate-700 transition dark:bg-slate-100/10 dark:text-slate-100"
              title="视频资源库"
            >
              <Clapperboard className="size-5" />
            </button>
            <div className="rounded-full bg-slate-900/8 px-2 py-1 text-[11px] font-black text-slate-700 dark:bg-slate-100/10 dark:text-slate-200">
              {count}
            </div>
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 pl-3">
            <ManagedVideoAssetSidebar {...videoProps} />
          </div>
        </aside>
      </Suspense>
    );
  }

  return (
    <>
      <Suspense fallback={<ManagedImageAssetDockLoading className={loadingClassName} label={loadingLabel} />}>
        <ManagedImageAssetSidebar {...sidebarProps} />
      </Suspense>
      {videoLibrary ? (
        <button
          type="button"
          className="absolute right-2 top-[152px] z-50 flex size-9 items-center justify-center rounded-xl border border-border bg-background/90 text-muted-foreground shadow-sm transition hover:bg-muted hover:text-foreground max-lg:hidden dark:border-slate-800 dark:bg-slate-950/90 dark:text-slate-400 dark:hover:text-slate-100"
          onClick={() => videoLibrary.onActiveChange(true)}
          title="打开视频资源库"
        >
          <Clapperboard className="size-4" />
        </button>
      ) : null}
    </>
  );
}
