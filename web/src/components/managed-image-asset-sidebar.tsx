"use client";

import { forwardRef, useCallback, useMemo, useState, type DragEvent, type HTMLAttributes } from "react";
import { VirtuosoGrid } from "react-virtuoso";
import { Images, LoaderCircle, Maximize2, Minimize2, PanelRightOpen, Pin, RefreshCw } from "lucide-react";

import { AuthenticatedImage } from "@/components/authenticated-image";
import { setManagedImageDragData } from "@/components/managed-image-drag";
import { Button } from "@/components/ui/button";
import type { ManagedImageSummary } from "@/lib/api";
import { cn } from "@/lib/utils";

export type ManagedImageAssetSidebarProps = {
  assets: ManagedImageSummary[];
  loadingAssets: boolean;
  loadingMoreAssets: boolean;
  hasMoreAssets: boolean;
  onRefreshAssets: () => void;
  onLoadMoreAssets: () => void;
  onAddAssetToCanvas?: (asset: ManagedImageSummary) => void;
  onAddAssetToComposer: (asset: ManagedImageSummary) => void;
  storagePrefix: string;
  className?: string;
  sideOffsetClassName?: string;
  collapsedClassName?: string;
  expandedClassName?: string;
  wideClassName?: string;
  defaultPinned?: boolean;
  title?: string;
  subtitle?: string;
  emptyLabel?: string;
  collapsedTitle?: string;
  accent?: "sky" | "slate";
};

const panelClass =
  "border-border bg-card/92 text-card-foreground shadow-[0_18px_46px_rgba(44,74,116,0.16)] backdrop-blur dark:border-zinc-800 dark:bg-[#181818]/92 dark:text-zinc-100 dark:shadow-[0_18px_46px_rgba(0,0,0,0.36)]";
const iconButtonClass =
  "text-muted-foreground hover:bg-muted hover:text-foreground dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-100";
const subtleTextClass = "text-muted-foreground dark:text-slate-500";
const dashedClass = "border-dashed border-border bg-muted/50 text-muted-foreground dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-500";

export function ManagedImageAssetSidebar({
  assets,
  loadingAssets,
  loadingMoreAssets,
  hasMoreAssets,
  onRefreshAssets,
  onLoadMoreAssets,
  onAddAssetToCanvas,
  onAddAssetToComposer,
  storagePrefix,
  className,
  sideOffsetClassName = "bottom-5 right-0 top-24 rounded-l-2xl border-y border-l",
  collapsedClassName = "w-[56px] translate-x-0 p-2",
  expandedClassName = "w-[420px] translate-x-0 p-3",
  wideClassName = "w-[680px] translate-x-0 p-3",
  defaultPinned = false,
  title = "图片库",
  subtitle,
  emptyLabel = "图片库暂无图片",
  collapsedTitle = "展开图片库",
  accent = "sky",
}: ManagedImageAssetSidebarProps) {
  const pinnedStorageKey = `${storagePrefix}-pinned`;
  const wideStorageKey = `${storagePrefix}-wide`;
  const [hoverExpanded, setHoverExpanded] = useState(defaultPinned);
  const [pinned, setPinned] = useState(() => {
    if (typeof window === "undefined") {
      return defaultPinned;
    }
    const stored = window.localStorage.getItem(pinnedStorageKey);
    return stored === null ? defaultPinned : stored === "1";
  });
  const [draggingAsset, setDraggingAsset] = useState(false);
  const [wide, setWide] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.localStorage.getItem(wideStorageKey) === "1";
  });
  const expanded = pinned || hoverExpanded || draggingAsset;
  const accentClass =
    accent === "sky"
      ? "bg-sky-500/10 text-sky-600 hover:bg-sky-500/15 dark:text-sky-300"
      : "bg-slate-900/5 text-slate-700 hover:bg-slate-900/10 dark:bg-slate-100/10 dark:text-slate-200 dark:hover:bg-slate-100/15";
  const countClass =
    accent === "sky"
      ? "bg-sky-500/15 text-sky-600 dark:bg-sky-400/15 dark:text-sky-300"
      : "bg-slate-900/8 text-slate-700 dark:bg-slate-100/10 dark:text-slate-200";
  const resolvedSubtitle = subtitle || `${assets.length} 张素材 · 点击加入输入`;
  const assetGridComponents = useMemo(
    () => ({
      List: forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function ManagedImageAssetGridList(props, ref) {
        return <div {...props} ref={ref} className={cn(props.className, "grid gap-3", wide ? "grid-cols-3" : "grid-cols-2")} />;
      }),
      Footer: () =>
        hasMoreAssets || loadingMoreAssets ? (
          <div className="col-span-full flex min-h-14 items-center justify-center py-3">
            <div className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs", dashedClass)}>
              <LoaderCircle className={cn("size-3.5", loadingMoreAssets && "animate-spin")} />
              {loadingMoreAssets ? "加载中..." : "继续下滑加载"}
            </div>
          </div>
        ) : assets.length > 0 ? (
          <div className={cn("col-span-full py-3 text-center text-[11px]", subtleTextClass)}>已显示全部素材</div>
        ) : null,
    }),
    [assets.length, hasMoreAssets, loadingMoreAssets, wide],
  );

  const setPinnedState = useCallback(
    (next: boolean) => {
      setPinned(next);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(pinnedStorageKey, next ? "1" : "0");
      }
      if (next) {
        setHoverExpanded(true);
      }
    },
    [pinnedStorageKey],
  );

  const setWideState = useCallback(
    (next: boolean) => {
      setWide(next);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(wideStorageKey, next ? "1" : "0");
      }
      if (next) {
        setHoverExpanded(true);
      }
    },
    [wideStorageKey],
  );

  const handleDragStart = useCallback((event: DragEvent<HTMLDivElement>, asset: ManagedImageSummary) => {
    setDraggingAsset(true);
    setManagedImageDragData(event.dataTransfer, asset);
  }, []);

  return (
    <aside
      className={cn(
        "absolute z-40 flex overflow-hidden max-lg:hidden",
        "transition-[width,transform,background-color,border-color] duration-300 ease-out",
        panelClass,
        sideOffsetClassName,
        expanded ? wide ? wideClassName : expandedClassName : collapsedClassName,
        className,
      )}
      onMouseEnter={() => setHoverExpanded(true)}
      onMouseLeave={() => {
        if (!pinned && !draggingAsset) {
          setHoverExpanded(false);
        }
      }}
    >
      <div className={cn("flex h-full shrink-0 flex-col items-center gap-3 border-r border-border pr-2 transition-colors dark:border-zinc-800", expanded ? "w-12" : "w-full border-r-0 pr-0")}>
        <button
          type="button"
          className={cn("mt-1 flex size-10 items-center justify-center rounded-2xl transition", accentClass)}
          onClick={() => {
            if (!expanded) {
              setHoverExpanded(true);
            } else {
              setPinnedState(!pinned);
            }
          }}
          title={pinned ? "取消固定图片库" : expanded ? "固定图片库" : collapsedTitle}
        >
          {expanded ? <Pin className={cn("size-4", pinned && "fill-current")} /> : <Images className="size-5" />}
        </button>
        <div className={cn("rounded-full px-2 py-1 text-[11px] font-black", countClass)}>{assets.length}</div>
        {!expanded ? (
          <button
            type="button"
            className={cn("mt-1 flex size-9 items-center justify-center rounded-2xl", iconButtonClass)}
            onClick={() => setHoverExpanded(true)}
            title={collapsedTitle}
          >
            <PanelRightOpen className="size-4" />
          </button>
        ) : null}
      </div>

      <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col transition-all duration-300", expanded ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-4 opacity-0")}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-bold text-foreground dark:text-slate-100">{title}</div>
            <div className={cn("text-xs", subtleTextClass)}>{resolvedSubtitle}</div>
          </div>
          <div className="flex gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className={cn("size-8 rounded-lg", iconButtonClass)}
              onClick={() => setWideState(!wide)}
              title={wide ? "收回图片库宽度" : "扩大图片库显示范围"}
            >
              {wide ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className={cn("size-8 rounded-lg", iconButtonClass)}
              onClick={() => setPinnedState(!pinned)}
              title={pinned ? "取消固定图片库" : "固定图片库"}
            >
              <Pin className={cn("size-4", pinned && "fill-current")} />
            </Button>
            <Button type="button" size="icon" variant="ghost" className={cn("size-8 rounded-lg", iconButtonClass)} onClick={onRefreshAssets} title="刷新图片库">
              {loadingAssets ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            </Button>
          </div>
        </div>
        <div className="mt-3 min-h-0 flex-1 overflow-auto pr-1">
          {assets.length > 0 ? (
            <VirtuosoGrid
              data={assets}
              overscan={400}
              components={assetGridComponents}
              computeItemKey={(_, asset) => asset.path}
              itemClassName="min-w-0"
              style={{ height: "100%" }}
              endReached={onLoadMoreAssets}
              itemContent={(index, asset) => (
                <ManagedImageAssetTile
                  asset={asset}
                  showCanvasAction={Boolean(onAddAssetToCanvas)}
                  onDragStart={(event) => handleDragStart(event, asset)}
                  onDragEnd={() => setDraggingAsset(false)}
                  onAddToCanvas={onAddAssetToCanvas ? () => onAddAssetToCanvas(asset) : undefined}
                  onAddToComposer={() => onAddAssetToComposer(asset)}
                />
              )}
            />
          ) : (
            <div className={cn("rounded-xl border p-4 text-center text-xs", dashedClass)}>{loadingAssets ? "正在加载图片库..." : emptyLabel}</div>
          )}
        </div>
      </div>
    </aside>
  );
}

function ManagedImageAssetTile({
  asset,
  showCanvasAction,
  onDragStart,
  onDragEnd,
  onAddToCanvas,
  onAddToComposer,
}: {
  asset: ManagedImageSummary;
  showCanvasAction: boolean;
  onDragStart: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onAddToCanvas?: () => void;
  onAddToComposer: () => void;
}) {
  return (
    <div className="group overflow-hidden rounded-xl border border-border bg-background dark:border-slate-800 dark:bg-slate-950" draggable onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <button type="button" className="block w-full" onClick={onAddToComposer} title="加入输入">
        <AuthenticatedImage
          src={asset.thumbnail_url || asset.preview_url || ""}
          alt={asset.name || "图片素材"}
          loading="lazy"
          decoding="async"
          className="aspect-square w-full object-cover transition duration-150 group-hover:scale-[1.03]"
          placeholderClassName="min-h-0 aspect-square bg-muted dark:bg-slate-900"
        />
      </button>
      <div className="space-y-1 px-2 py-2">
        <div className="truncate text-[11px] font-medium text-foreground dark:text-slate-300">{asset.name || asset.path}</div>
        <div className={cn("grid gap-1", showCanvasAction ? "grid-cols-2" : "grid-cols-1")}>
          <Button type="button" size="sm" variant="ghost" className={cn("h-7 rounded-md px-1 text-[11px]", iconButtonClass)} onClick={onAddToComposer}>
            输入
          </Button>
          {showCanvasAction ? (
            <Button type="button" size="sm" variant="ghost" className={cn("h-7 rounded-md px-1 text-[11px]", iconButtonClass)} onClick={onAddToCanvas}>
              画布
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
