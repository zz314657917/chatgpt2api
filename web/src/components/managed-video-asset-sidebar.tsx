"use client";

import { forwardRef, useMemo, type HTMLAttributes } from "react";
import { VirtuosoGrid } from "react-virtuoso";
import { Clapperboard, LoaderCircle, Plus, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { type ManagedVideoAssetSummary } from "@/lib/api";
import { cn } from "@/lib/utils";

export type ManagedVideoAssetSidebarProps = {
  videos: ManagedVideoAssetSummary[];
  loadingVideos: boolean;
  onRefreshVideos: () => void;
  onAddVideoToCanvas: (video: ManagedVideoAssetSummary) => void;
  className?: string;
  emptyLabel?: string;
};

const subtleTextClass = "text-muted-foreground dark:text-slate-500";
const iconButtonClass =
  "text-muted-foreground hover:bg-muted hover:text-foreground dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-100";
const dashedClass = "border-dashed border-border bg-muted/50 text-muted-foreground dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-500";

export function ManagedVideoAssetSidebar({
  videos,
  loadingVideos,
  onRefreshVideos,
  onAddVideoToCanvas,
  className,
  emptyLabel = "暂无视频资源",
}: ManagedVideoAssetSidebarProps) {
  const gridComponents = useMemo(
    () => ({
      List: forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function ManagedVideoAssetGridList(props, ref) {
        return <div {...props} ref={ref} className={cn(props.className, "grid grid-cols-2 gap-3")} />;
      }),
      Footer: () =>
        videos.length > 0 ? (
          <div className={cn("col-span-full py-3 text-center text-[11px]", subtleTextClass)}>已显示全部视频</div>
        ) : null,
    }),
    [videos.length],
  );

  return (
    <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-bold text-foreground dark:text-slate-100">视频资源库</div>
          <div className={cn("text-xs", subtleTextClass)}>{videos.length} 个视频 · 点击加入画布</div>
        </div>
        <Button type="button" size="icon" variant="ghost" className={cn("size-8 rounded-lg", iconButtonClass)} onClick={onRefreshVideos} title="刷新视频资源">
          {loadingVideos ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
        </Button>
      </div>
      <div className="mt-3 min-h-0 flex-1 overflow-auto pr-1">
        {videos.length > 0 ? (
          <VirtuosoGrid
            data={videos}
            overscan={300}
            components={gridComponents}
            computeItemKey={(_, video) => video.id}
            itemClassName="min-w-0"
            style={{ height: "100%" }}
            itemContent={(_, video) => (
              <ManagedVideoAssetTile video={video} onAddToCanvas={() => onAddVideoToCanvas(video)} />
            )}
          />
        ) : (
          <div className={cn("rounded-xl border p-4 text-center text-xs", dashedClass)}>
            {loadingVideos ? "正在加载视频资源..." : emptyLabel}
          </div>
        )}
      </div>
    </div>
  );
}

function ManagedVideoAssetTile({
  video,
  onAddToCanvas,
}: {
  video: ManagedVideoAssetSummary;
  onAddToCanvas: () => void;
}) {
  const src = video.local_url || video.url || "";
  return (
    <div className="group overflow-hidden rounded-xl border border-border bg-background dark:border-slate-800 dark:bg-slate-950">
      <button type="button" className="block w-full bg-black" onClick={onAddToCanvas} title="加入画布">
        {src ? (
          <video src={src} className="aspect-video w-full object-contain" muted preload="metadata" />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center text-white/70">
            <Clapperboard className="size-6" />
          </div>
        )}
      </button>
      <div className="space-y-1 px-2 py-2">
        <div className="truncate text-[11px] font-medium text-foreground dark:text-slate-300">{video.name || video.task_id}</div>
        {video.model ? <div className="truncate text-[10px] font-medium text-sky-600 dark:text-sky-300">{video.model}</div> : null}
        <Button type="button" size="sm" variant="ghost" className={cn("h-7 w-full rounded-md px-1 text-[11px]", iconButtonClass)} onClick={onAddToCanvas}>
          <Plus className="size-3.5" />
          画布
        </Button>
      </div>
    </div>
  );
}
