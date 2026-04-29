"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, Download, Eye, ImageIcon, LoaderCircle, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";

import { DateRangeFilter } from "@/components/date-range-filter";
import { ImageLightbox } from "@/components/image-lightbox";
import { Button } from "@/components/ui/button";
import { fetchManagedImages, type ManagedImage } from "@/lib/api";
import { formatImageFileSize } from "@/lib/image-size";
import { useAuthGuard } from "@/lib/use-auth-guard";

function getManagedImageFormatLabel(item: ManagedImage) {
  const normalized = (item.name || item.url).split("?")[0]?.match(/\.([a-z0-9]+)$/i)?.[1] || "image";
  const format = normalized.toLowerCase() === "jpeg" ? "jpg" : normalized.toLowerCase();
  return `IMAGE ${format.toUpperCase()}`;
}

function managedImageKey(item: ManagedImage) {
  return item.url || item.name;
}

function buildManagedImageDownloadName(item: ManagedImage, index: number) {
  const sourceName = item.name || item.url.split("?")[0]?.split("/").filter(Boolean).pop();
  if (sourceName) {
    return sourceName;
  }
  return `managed-image-${String(index + 1).padStart(2, "0")}.png`;
}

async function downloadManagedImage(item: ManagedImage, index: number) {
  let href = item.url;
  let objectUrl = "";

  try {
    const response = await fetch(item.url);
    if (response.ok) {
      const blob = await response.blob();
      objectUrl = URL.createObjectURL(blob);
      href = objectUrl;
    }
  } catch {
    href = item.url;
  }

  const link = document.createElement("a");
  link.href = href;
  link.download = buildManagedImageDownloadName(item, index);
  document.body.appendChild(link);
  link.click();
  link.remove();

  if (objectUrl) {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function ImageManagerContent() {
  const [items, setItems] = useState<ManagedImage[]>([]);
  const [selectedImageIds, setSelectedImageIds] = useState<Record<string, boolean>>({});
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const lightboxImages = useMemo(
    () =>
      items.map((item) => ({
        id: item.name,
        src: item.url,
        sizeLabel: formatImageFileSize(item.size),
        dimensions: item.width && item.height ? `${item.width} x ${item.height}` : undefined,
      })),
    [items],
  );
  const selectedItems = useMemo(
    () => items.filter((item) => selectedImageIds[managedImageKey(item)]),
    [items, selectedImageIds],
  );
  const selectedCount = selectedItems.length;
  const allSelected = items.length > 0 && selectedCount === items.length;

  const loadImages = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchManagedImages({ start_date: startDate, end_date: endDate });
      setItems(data.items);
      setSelectedImageIds({});
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载图片失败");
    } finally {
      setIsLoading(false);
    }
  }, [endDate, startDate]);

  const clearFilters = () => {
    setStartDate("");
    setEndDate("");
  };

  const toggleImageSelection = (item: ManagedImage) => {
    const key = managedImageKey(item);
    setSelectedImageIds((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const toggleAllImages = () => {
    if (allSelected) {
      setSelectedImageIds({});
      return;
    }

    setSelectedImageIds(
      Object.fromEntries(items.map((item) => [managedImageKey(item), true])),
    );
  };

  const downloadItems = async (key: string, downloadItems: ManagedImage[]) => {
    if (downloadItems.length === 0 || downloadingKey) {
      return;
    }

    setDownloadingKey(key);
    try {
      for (let index = 0; index < downloadItems.length; index += 1) {
        const item = downloadItems[index];
        await downloadManagedImage(item, items.indexOf(item));
        if (index < downloadItems.length - 1) {
          await sleep(120);
        }
      }
    } finally {
      setDownloadingKey(null);
    }
  };

  useEffect(() => {
    void loadImages();
  }, [loadImages]);

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <div className="text-xs font-semibold tracking-[0.18em] text-stone-500 uppercase">Images</div>
          <h1 className="text-2xl font-semibold tracking-tight">图片管理</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <DateRangeFilter startDate={startDate} endDate={endDate} onChange={(start, end) => { setStartDate(start); setEndDate(end); }} />
          <Button variant="outline" onClick={clearFilters} className="h-10 rounded-xl border-stone-200 bg-white px-4 text-stone-700">
            清除筛选条件
          </Button>
          <Button onClick={() => void loadImages()} disabled={isLoading} className="h-10 rounded-xl bg-stone-950 px-4 text-white hover:bg-stone-800">
            {isLoading ? <LoaderCircle className="size-4 animate-spin" /> : <Search className="size-4" />}
            查询
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-stone-600">
            <ImageIcon className="size-4" />
            共 {items.length} 张
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-8 rounded-full border-stone-200 bg-white px-3 text-xs text-stone-600 shadow-sm hover:bg-stone-50"
              disabled={items.length === 0 || downloadingKey !== null}
              onClick={toggleAllImages}
            >
              {allSelected ? "取消全选" : "全选"}
            </Button>
            <Button
              type="button"
              className="h-8 rounded-full bg-indigo-600 px-2.5 text-[11px] text-white shadow-sm hover:bg-indigo-500"
              disabled={selectedCount === 0 || downloadingKey !== null}
              onClick={() => void downloadItems("selected", selectedItems)}
            >
              {downloadingKey === "selected" ? (
                <LoaderCircle className="size-3 animate-spin" />
              ) : (
                <Download className="size-3" />
              )}
              下载已选 ({selectedCount})
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-8 rounded-full border-stone-200 bg-white px-2.5 text-[11px] text-stone-700 shadow-sm hover:bg-stone-50"
              disabled={items.length === 0 || downloadingKey !== null}
              onClick={() => void downloadItems("all", items)}
            >
              {downloadingKey === "all" ? (
                <LoaderCircle className="size-3 animate-spin" />
              ) : (
                <Download className="size-3" />
              )}
              下载全部
            </Button>
            <Button variant="outline" className="h-8 rounded-full border-stone-200 bg-white px-3 text-xs text-stone-600 shadow-sm hover:bg-stone-50" onClick={() => void loadImages()} disabled={isLoading || downloadingKey !== null}>
              <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
              刷新
            </Button>
          </div>
        </div>

        <div className="columns-1 gap-3 sm:columns-2 sm:gap-4 lg:columns-3 xl:columns-4">
          {items.map((item, index) => {
            const selected = Boolean(selectedImageIds[managedImageKey(item)]);
            const dimensions = item.width && item.height ? `${item.width} x ${item.height}` : "";
            const sizeLabel = formatImageFileSize(item.size);
            const imageMeta = [dimensions, sizeLabel].filter(Boolean).join(" | ");
            return (
              <figure
                key={item.url}
                className={`group relative mb-3 inline-block w-full break-inside-avoid overflow-hidden rounded-[18px] bg-stone-100 shadow-sm sm:mb-4 ${selected ? "ring-2 ring-indigo-500/90 ring-offset-2" : ""}`}
                style={{
                  contentVisibility: "auto",
                  containIntrinsicSize: item.width && item.height ? `${Math.min(360, item.width)}px ${Math.min(480, item.height)}px` : "320px 320px",
                }}
              >
                <div className="block w-full overflow-hidden">
                  <img
                    src={item.thumbnail_url || item.url}
                    alt={item.name}
                    width={item.width || undefined}
                    height={item.height || undefined}
                    loading="lazy"
                    decoding="async"
                    sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    className="block h-auto w-full transition duration-200 group-hover:brightness-95"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => toggleImageSelection(item)}
                  className={`absolute top-2 left-2 z-10 inline-flex size-6 items-center justify-center rounded-full border transition duration-150 ${
                    selected
                      ? "border-indigo-500 bg-indigo-500 text-white opacity-100 shadow-sm"
                      : "pointer-events-none border-white/90 bg-black/20 text-transparent opacity-0 shadow-sm group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 hover:bg-black/30"
                  }`}
                  aria-label={selected ? "取消选择图片" : "选择图片"}
                >
                  {selected ? <Check className="size-3.5" /> : null}
                </button>
                <div className="pointer-events-none absolute top-2 right-2 z-10 flex items-center gap-1 opacity-0 transition duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
                  <button
                    type="button"
                    onClick={() => {
                      setLightboxIndex(index);
                      setLightboxOpen(true);
                    }}
                    className="inline-flex h-7 items-center gap-1 rounded-full bg-white/95 px-2 text-[11px] font-medium text-stone-800 shadow-sm transition hover:bg-white hover:text-stone-950"
                    aria-label="View Original"
                    title="View Original"
                  >
                    <Eye className="size-3" />
                    View Original
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(item.url);
                      toast.success("图片地址已复制");
                    }}
                    className="inline-flex size-7 items-center justify-center rounded-full bg-white/95 text-stone-800 shadow-sm transition hover:bg-white hover:text-stone-950"
                    aria-label="复制图片地址"
                    title="复制图片地址"
                  >
                    <Copy className="size-3.5" />
                  </button>
                </div>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 via-black/20 to-transparent px-2.5 pt-8 pb-2 opacity-0 transition duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
                  <div className="text-left text-white drop-shadow-sm">
                    <div className="text-[10px] font-bold tracking-wide">{getManagedImageFormatLabel(item)}</div>
                    <div className="mt-0.5 truncate text-[11px] text-white/90">{item.created_at}</div>
                    {imageMeta ? (
                      <div className="mt-0.5 truncate text-[11px] text-white/90">{imageMeta}</div>
                    ) : null}
                  </div>
                </div>
              </figure>
            );
          })}
        </div>

        {!isLoading && items.length === 0 ? <div className="px-6 py-14 text-center text-sm text-stone-500">没有找到图片</div> : null}
      </div>
      <ImageLightbox
        images={lightboxImages}
        currentIndex={lightboxIndex}
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        onIndexChange={setLightboxIndex}
      />
    </section>
  );
}

export default function ImageManagerPage() {
  const { isCheckingAuth, session } = useAuthGuard(["admin"]);
  if (isCheckingAuth || !session || session.role !== "admin") {
    return <div className="flex min-h-[40vh] items-center justify-center"><LoaderCircle className="size-5 animate-spin text-stone-400" /></div>;
  }
  return <ImageManagerContent />;
}
