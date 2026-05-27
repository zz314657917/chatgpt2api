import { Brush, Circle, Eraser, ListOrdered, Paintbrush, RectangleHorizontal, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { cropAspectOptions, editModes, outpaintBackgroundOptions } from "./canvas-image-editor-config";
import { NumberField, ToolSection } from "./canvas-image-editor-fields";
import type {
  BrushTool,
  CropAspect,
  GridLine,
  GridOrientation,
  ImageEditMode,
  MaskTool,
  OutpaintBackground,
  OutpaintBox,
  SmartCanvasCropBox,
} from "./canvas-image-editor-types";
import { clamp } from "./canvas-image-editor-utils";

export type SmartCanvasImageEditorToolPanelProps = {
  mode: ImageEditMode;
  cropAspect: CropAspect;
  onCropAspectChange: (value: CropAspect) => void;
  cropBox: SmartCanvasCropBox;
  cropNatural: { width: number; height: number };
  bitmapSize: { width: number; height: number };
  onUpdateCropPercent: (patch: Partial<SmartCanvasCropBox>) => void;
  onSetCropPixelSize: (side: "width" | "height", value: number) => void;
  onCenterCropBox: () => void;
  onResetCrop: () => void;
  outpaintBox: OutpaintBox;
  outpaintNatural: { width: number; height: number };
  outpaintBackground: OutpaintBackground;
  onUpdateOutpaintSide: (side: keyof OutpaintBox, value: number) => void;
  onApplyOutpaintPreset: (value: number) => void;
  onOutpaintBackgroundChange: (value: OutpaintBackground) => void;
  maskTool: MaskTool;
  onMaskToolChange: (tool: MaskTool) => void;
  brushTool: BrushTool;
  onBrushToolChange: (tool: BrushTool) => void;
  brushSize: number;
  onBrushSizeChange: (size: number) => void;
  brushColor: string;
  onBrushColorChange: (color: string) => void;
  drawHistoryLength: number;
  onUndoDraw: () => void;
  onClearDrawCanvas: () => void;
  gridRows: number;
  onGridRowsChange: (rows: number) => void;
  gridCols: number;
  onGridColsChange: (cols: number) => void;
  gridGap: number;
  onGridGapChange: (gap: number) => void;
  gridCustom: boolean;
  onGridCustomChange: (custom: boolean) => void;
  gridOrientation: GridOrientation;
  onGridOrientationChange: (orientation: GridOrientation) => void;
  onGridLinesChange: (lines: GridLine[]) => void;
  gridSplitCount: number;
};

export function SmartCanvasImageEditorToolPanel({
  mode,
  cropAspect,
  onCropAspectChange,
  cropBox,
  cropNatural,
  bitmapSize,
  onUpdateCropPercent,
  onSetCropPixelSize,
  onCenterCropBox,
  onResetCrop,
  outpaintBox,
  outpaintNatural,
  outpaintBackground,
  onUpdateOutpaintSide,
  onApplyOutpaintPreset,
  onOutpaintBackgroundChange,
  maskTool,
  onMaskToolChange,
  brushTool,
  onBrushToolChange,
  brushSize,
  onBrushSizeChange,
  brushColor,
  onBrushColorChange,
  drawHistoryLength,
  onUndoDraw,
  onClearDrawCanvas,
  gridRows,
  onGridRowsChange,
  gridCols,
  onGridColsChange,
  gridGap,
  onGridGapChange,
  gridCustom,
  onGridCustomChange,
  gridOrientation,
  onGridOrientationChange,
  onGridLinesChange,
  gridSplitCount,
}: SmartCanvasImageEditorToolPanelProps) {
  const panelTitle = editModes.find((item) => item.value === mode)?.label || "工具";

  return (
    <aside className="flex w-[250px] shrink-0 flex-col gap-4 rounded-[18px] border border-slate-200 bg-background/72 p-4 text-sm shadow-inner dark:border-slate-700 dark:bg-slate-950/45">
      <div>
        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground dark:text-slate-500">工具参数</div>
        <div className="mt-1 text-base font-black text-foreground dark:text-slate-100">{panelTitle}</div>
      </div>

      {mode === "crop" ? (
        <>
          <ToolSection title="比例">
            <div className="grid grid-cols-3 gap-1.5">
              {cropAspectOptions.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={cn(
                    "h-8 rounded-xl border border-border bg-muted/60 text-xs font-black text-muted-foreground transition hover:bg-accent hover:text-foreground dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:bg-slate-800",
                    cropAspect === item.value && "border-sky-400 bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200",
                  )}
                  onClick={() => onCropAspectChange(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </ToolSection>
          <ToolSection title="裁剪框">
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="X %" value={Math.round(cropBox.x)} min={0} max={100} onChange={(value) => onUpdateCropPercent({ x: value })} />
              <NumberField label="Y %" value={Math.round(cropBox.y)} min={0} max={100} onChange={(value) => onUpdateCropPercent({ y: value })} />
              <NumberField label="宽 px" value={cropNatural.width} min={1} max={bitmapSize.width || 1} onChange={(value) => onSetCropPixelSize("width", value)} />
              <NumberField label="高 px" value={cropNatural.height} min={1} max={bitmapSize.height || 1} onChange={(value) => onSetCropPixelSize("height", value)} />
            </div>
            <div className="mt-2 flex gap-2">
              <Button type="button" size="sm" variant="outline" className="h-8 flex-1 rounded-xl text-xs" onClick={onCenterCropBox}>居中</Button>
              <Button type="button" size="sm" variant="outline" className="h-8 flex-1 rounded-xl text-xs" onClick={onResetCrop}>
                重置
              </Button>
            </div>
          </ToolSection>
        </>
      ) : null}

      {mode === "outpaint" ? (
        <>
          <ToolSection title="扩展方向">
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="上 %" value={Math.round(outpaintBox.top)} min={0} max={200} onChange={(value) => onUpdateOutpaintSide("top", value)} />
              <NumberField label="下 %" value={Math.round(outpaintBox.bottom)} min={0} max={200} onChange={(value) => onUpdateOutpaintSide("bottom", value)} />
              <NumberField label="左 %" value={Math.round(outpaintBox.left)} min={0} max={200} onChange={(value) => onUpdateOutpaintSide("left", value)} />
              <NumberField label="右 %" value={Math.round(outpaintBox.right)} min={0} max={200} onChange={(value) => onUpdateOutpaintSide("right", value)} />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {[10, 25, 50].map((value) => (
                <button key={value} type="button" className="h-8 rounded-xl border border-border bg-muted/60 text-xs font-black text-muted-foreground hover:bg-accent hover:text-foreground dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:bg-slate-800" onClick={() => onApplyOutpaintPreset(value)}>
                  {value}%
                </button>
              ))}
            </div>
          </ToolSection>
          <ToolSection title="背景">
            <div className="grid grid-cols-3 gap-1.5">
              {outpaintBackgroundOptions.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={cn(
                    "flex h-14 flex-col items-center justify-center gap-1 rounded-xl border border-border bg-muted/60 text-[11px] font-black text-muted-foreground transition hover:bg-accent hover:text-foreground dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300",
                    outpaintBackground === item.value && "border-sky-400 text-sky-700 dark:text-sky-200",
                  )}
                  onClick={() => onOutpaintBackgroundChange(item.value)}
                >
                  <span className={cn("block size-5 rounded-md border border-slate-300 shadow-sm dark:border-slate-600", item.className)} />
                  {item.label}
                </button>
              ))}
            </div>
            <div className="mt-2 rounded-xl border border-dashed border-border px-3 py-2 text-xs font-bold text-muted-foreground dark:border-slate-700 dark:text-slate-400">
              输出 {outpaintNatural.width || 0} × {outpaintNatural.height || 0}
            </div>
          </ToolSection>
        </>
      ) : null}

      {mode === "mask" ? (
        <>
          <ToolSection title="遮罩模式">
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" size="sm" variant={maskTool === "paint" ? "default" : "outline"} className="h-9 rounded-xl text-xs" onClick={() => onMaskToolChange("paint")}>
                <Brush className="size-3.5" />
                涂抹
              </Button>
              <Button type="button" size="sm" variant={maskTool === "erase" ? "default" : "outline"} className="h-9 rounded-xl text-xs" onClick={() => onMaskToolChange("erase")}>
                <Eraser className="size-3.5" />
                擦除
              </Button>
            </div>
          </ToolSection>
          <ToolSection title={`笔刷 ${brushSize}px`}>
            <input className="w-full accent-sky-500" type="range" min={4} max={160} value={brushSize} onChange={(event) => onBrushSizeChange(Number(event.target.value))} />
            <DrawHistoryActions drawHistoryLength={drawHistoryLength} onUndoDraw={onUndoDraw} onClearDrawCanvas={onClearDrawCanvas} />
          </ToolSection>
          <p className="rounded-xl bg-muted/70 px-3 py-2 text-xs font-semibold leading-relaxed text-muted-foreground dark:bg-slate-900/80 dark:text-slate-400">
            白色区域会输出为 mask 图。擦除只影响遮罩，不会修改原图。
          </p>
        </>
      ) : null}

      {mode === "brush" ? (
        <>
          <ToolSection title="画笔工具">
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: "free", icon: Paintbrush, label: "自由" },
                { value: "rect", icon: RectangleHorizontal, label: "矩形" },
                { value: "ellipse", icon: Circle, label: "椭圆" },
                { value: "label", icon: ListOrdered, label: "标记" },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <Button key={item.value} type="button" size="sm" variant={brushTool === item.value ? "default" : "outline"} className="h-9 rounded-xl text-xs" onClick={() => onBrushToolChange(item.value as BrushTool)}>
                    <Icon className="size-3.5" />
                    {item.label}
                  </Button>
                );
              })}
            </div>
          </ToolSection>
          <ToolSection title={`粗细 ${brushSize}px`}>
            <input className="w-full accent-sky-500" type="range" min={2} max={80} value={brushSize} onChange={(event) => onBrushSizeChange(Number(event.target.value))} />
            <label className="mt-3 flex items-center justify-between gap-3 text-xs font-bold text-muted-foreground dark:text-slate-400">
              颜色
              <input className="h-8 w-12 rounded-lg border border-border bg-background p-0.5 dark:border-slate-700" type="color" value={brushColor} onChange={(event) => onBrushColorChange(event.target.value)} />
            </label>
            <DrawHistoryActions drawHistoryLength={drawHistoryLength} onUndoDraw={onUndoDraw} onClearDrawCanvas={onClearDrawCanvas} />
          </ToolSection>
        </>
      ) : null}

      {mode === "grid" ? (
        <>
          <ToolSection title="切分方式">
            <Button type="button" size="sm" variant={gridCustom ? "default" : "outline"} className="h-9 w-full rounded-xl text-xs" onClick={() => onGridCustomChange(!gridCustom)}>
              {gridCustom ? "自定义切线" : "按行列切分"}
            </Button>
            {gridCustom ? (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button type="button" size="sm" variant={gridOrientation === "h" ? "default" : "outline"} className="h-8 rounded-xl text-xs" onClick={() => onGridOrientationChange("h")}>水平线</Button>
                <Button type="button" size="sm" variant={gridOrientation === "v" ? "default" : "outline"} className="h-8 rounded-xl text-xs" onClick={() => onGridOrientationChange("v")}>垂直线</Button>
                <Button type="button" size="sm" variant="outline" className="col-span-2 h-8 rounded-xl text-xs" onClick={() => onGridLinesChange([])}>
                  <Eraser className="size-3.5" />
                  清空切线
                </Button>
              </div>
            ) : (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <NumberField label="行" value={gridRows} min={1} max={12} onChange={(value) => onGridRowsChange(clamp(value || 1, 1, 12))} />
                <NumberField label="列" value={gridCols} min={1} max={12} onChange={(value) => onGridColsChange(clamp(value || 1, 1, 12))} />
              </div>
            )}
          </ToolSection>
          {!gridCustom ? (
            <ToolSection title="预设">
              <div className="grid grid-cols-2 gap-1.5">
                {[["1×2", 1, 2], ["2×1", 2, 1], ["2×2", 2, 2], ["3×3", 3, 3]].map(([label, rows, cols]) => (
                  <button key={String(label)} type="button" className="h-8 rounded-xl border border-border bg-muted/60 text-xs font-black text-muted-foreground hover:bg-accent hover:text-foreground dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:bg-slate-800" onClick={() => {
                    onGridRowsChange(Number(rows));
                    onGridColsChange(Number(cols));
                    if (Number(rows) === 3 && Number(cols) === 3) {
                      onGridGapChange(0);
                    }
                  }}>
                    {label}
                  </button>
                ))}
              </div>
            </ToolSection>
          ) : null}
          <ToolSection title={`间隔 ${gridGap}px`}>
            <input className="w-full accent-sky-500" type="range" min={0} max={80} value={gridGap} onChange={(event) => onGridGapChange(Number(event.target.value))} />
            <div className="mt-2 rounded-xl bg-primary px-3 py-2 text-center text-xs font-black text-primary-foreground">
              将生成 {gridSplitCount} 张
            </div>
          </ToolSection>
        </>
      ) : null}
    </aside>
  );
}

function DrawHistoryActions({
  drawHistoryLength,
  onUndoDraw,
  onClearDrawCanvas,
}: {
  drawHistoryLength: number;
  onUndoDraw: () => void;
  onClearDrawCanvas: () => void;
}) {
  return (
    <div className="mt-2 flex gap-2">
      <Button type="button" size="sm" variant="outline" className="h-8 flex-1 rounded-xl text-xs" onClick={onUndoDraw} disabled={drawHistoryLength === 0}>
        <Undo2 className="size-3.5" />
        撤销
      </Button>
      <Button type="button" size="sm" variant="outline" className="h-8 flex-1 rounded-xl text-xs" onClick={onClearDrawCanvas}>
        <Eraser className="size-3.5" />
        清空
      </Button>
    </div>
  );
}
