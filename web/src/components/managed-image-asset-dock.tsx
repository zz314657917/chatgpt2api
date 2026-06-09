"use client";

import { lazy, Suspense } from "react";
import { Images, LoaderCircle, PanelRightOpen } from "lucide-react";

import { cn } from "@/lib/utils";

import type { ManagedImageAssetSidebarProps } from "./managed-image-asset-sidebar";

const ManagedImageAssetSidebar = lazy(() =>
  import("./managed-image-asset-sidebar").then((module) => ({
    default: module.ManagedImageAssetSidebar,
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
};

const defaultTriggerClassName =
  "absolute bottom-5 right-0 top-24 z-40 flex w-[56px] translate-x-0 flex-col items-center gap-3 overflow-hidden rounded-l-2xl border-y border-l border-border bg-card/92 p-2 text-card-foreground shadow-[0_18px_46px_rgba(44,74,116,0.16)] backdrop-blur max-lg:hidden dark:border-zinc-800 dark:bg-[#181818]/92 dark:text-zinc-100 dark:shadow-[0_18px_46px_rgba(0,0,0,0.36)]";

const defaultLoadingClassName =
  "absolute right-4 top-24 z-40 flex items-center justify-center rounded-full border border-border bg-card/90 px-3 py-1.5 text-card-foreground shadow-sm backdrop-blur max-lg:hidden dark:border-zinc-800 dark:bg-[#181818]/92 dark:text-zinc-100";

function ManagedImageAssetDockTrigger({
  assetCount,
  className,
  onActivate,
  showOpenButton,
}: {
  assetCount: number;
  className?: string;
  onActivate: () => void;
  showOpenButton: boolean;
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
        title="展开图片库"
      >
        <Images className="size-5" />
      </button>
      <div className="rounded-full bg-sky-500/15 px-2 py-1 text-[11px] font-black text-sky-600 dark:bg-sky-400/15 dark:text-sky-300">
        {assetCount}
      </div>
      {showOpenButton ? (
        <button
          type="button"
          className="mt-1 flex size-9 items-center justify-center rounded-2xl text-muted-foreground transition hover:bg-muted hover:text-foreground dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-100"
          onClick={onActivate}
          title="展开图片库"
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
  loadingLabel = "加载图片库...",
  showOpenButton = true,
  ...sidebarProps
}: ManagedImageAssetDockProps) {
  if (!activated) {
    return (
      <ManagedImageAssetDockTrigger
        assetCount={assetCount}
        className={triggerClassName}
        onActivate={onActivate}
        showOpenButton={showOpenButton}
      />
    );
  }

  return (
    <Suspense fallback={<ManagedImageAssetDockLoading className={loadingClassName} label={loadingLabel} />}>
      <ManagedImageAssetSidebar {...sidebarProps} />
    </Suspense>
  );
}
