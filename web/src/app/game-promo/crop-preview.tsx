import { useEffect, useRef, useState } from "react";
import { DEFAULT_CROP, type Crop } from "@/lib/game-promo/core";
import { drawPromoCrop, loadPromoImage } from "@/lib/game-promo/export";
import { Button } from "@/components/ui/button";
import { AuthenticatedImage } from "@/components/authenticated-image";
import { ImageLightbox } from "@/components/image-lightbox";

export function ClickablePromoImage({ source, alt, className }: { source: string; alt: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" aria-label={`放大查看${alt}`} title="点击放大" className="block w-full cursor-zoom-in text-left" onClick={() => setOpen(true)}>
      <AuthenticatedImage src={source} alt={alt} className={className} />
    </button>
    <ImageLightbox images={[{ id: alt, src: source, fileName: `${alt}.png`, direct: source.startsWith("data:") || source.startsWith("blob:") }]} currentIndex={0} open={open} onOpenChange={setOpen} onIndexChange={() => undefined} />
  </>;
}

export function CropPreview({ source, width, height, crop = DEFAULT_CROP, onChange }: {
  source: string; width: number; height: number; crop?: Crop; onChange: (crop: Crop) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement>();
  const [error, setError] = useState("");
  const [pixels, setPixels] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [previewCrop, setPreviewCrop] = useState(crop);
  const latestCrop = useRef(crop);
  const drag = useRef<{ x: number; y: number; crop: Crop } | undefined>(undefined);
  const preview = (next: Crop) => { latestCrop.current = next; setPreviewCrop(next); };
  useEffect(() => { latestCrop.current = crop; setPreviewCrop(crop); }, [crop]);
  useEffect(() => {
    let live = true;
    setImage(undefined); setError("");
    void loadPromoImage(source).then((next) => { if (live) setImage(next); }).catch((e) => { if (live) setError(String(e)); });
    return () => { live = false; };
  }, [source]);
  useEffect(() => { if (canvas.current && image) drawPromoCrop(canvas.current, image, width, height, previewCrop); }, [image, width, height, previewCrop]);
  return <div className="space-y-2">
    <div className="overflow-auto rounded-md border bg-muted/30">
      <canvas ref={canvas} aria-label="拖动调整裁剪位置" className="touch-none cursor-move" style={{ width: pixels ? width : "100%", maxWidth: pixels ? "none" : "100%", aspectRatio: `${width}/${height}` }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, crop: latestCrop.current }; }}
        onPointerMove={(e) => {
          if (!drag.current || !image) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight) * latestCrop.current.zoom;
          const rangeX = image.naturalWidth * scale - width, rangeY = image.naturalHeight * scale - height;
          preview({ ...latestCrop.current, x: Math.max(0, Math.min(1, drag.current.crop.x - (e.clientX - drag.current.x) * width / rect.width / (rangeX || Infinity))),
            y: Math.max(0, Math.min(1, drag.current.crop.y - (e.clientY - drag.current.y) * height / rect.height / (rangeY || Infinity))) });
        }} onPointerUp={(e) => {
          const current = drag.current;
          drag.current = undefined;
          onChange(latestCrop.current);
          if (current && Math.hypot(e.clientX - current.x, e.clientY - current.y) < 4) setLightboxOpen(true);
        }} onPointerCancel={() => { drag.current = undefined; onChange(latestCrop.current); }} />
    </div>
    {error ? <p className="text-xs text-destructive">{error}</p> : null}
    <label className="flex items-center gap-2 text-xs">缩放<input aria-label="裁剪缩放" type="range" min="1" max="4" step=".01" value={previewCrop.zoom} onChange={(e) => preview({ ...latestCrop.current, zoom: Number(e.target.value) })} onPointerUp={() => onChange(latestCrop.current)} onKeyUp={() => onChange(latestCrop.current)} onBlur={() => onChange(latestCrop.current)} />{previewCrop.zoom.toFixed(2)}×</label>
    <div className="flex flex-nowrap gap-1.5"><Button size="sm" variant="outline" onClick={() => setPixels(!pixels)}>{pixels ? "适配" : "像素"}</Button><Button size="sm" variant="ghost" onClick={() => onChange(DEFAULT_CROP)}>重置</Button></div>
    <ImageLightbox images={[{ id: `crop-${width}x${height}`, src: source, fileName: `crop-${width}x${height}.png`, dimensions: `${width}×${height}`, direct: source.startsWith("data:") || source.startsWith("blob:") }]} currentIndex={0} open={lightboxOpen} onOpenChange={setLightboxOpen} onIndexChange={() => undefined} />
  </div>;
}
