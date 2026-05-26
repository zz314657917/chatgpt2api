"use client";

import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  SmartCanvasAssetSidebar,
  SmartCanvasBoard,
  SmartCanvasInspector,
  SmartCanvasLeftRail,
  SmartCanvasShell,
  SmartCanvasTopBar,
} from "./canvas-node";
import { SmartCanvasImageEditor } from "./canvas-image-editor";
import { canvasImagesFromItem } from "./canvas-utils";
import { useSmartCanvasController } from "./use-smart-canvas-controller";

export default function CanvasPage() {
  const canvas = useSmartCanvasController();

  if (canvas.isCheckingAuth || canvas.loading) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center">
        <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-hidden">
      <SmartCanvasShell>
        <SmartCanvasLeftRail onAddNode={canvas.addNodeAt} />
        <div className="relative min-w-0 flex-1">
          <SmartCanvasTopBar
            canvas={canvas.canvas}
            saveState={canvas.saveState}
            saving={canvas.saving}
            running={canvas.running}
            onBack={() => {
              void canvas.flushSave().finally(() => window.history.back());
            }}
            onSave={() => void canvas.saveNow()}
            onAddNode={canvas.addNodeAt}
            onUploadClick={canvas.openUploadDialog}
            onDeleteCanvas={() => canvas.setDeleteConfirm(true)}
          />

          <SmartCanvasBoard
            canvas={canvas.canvas}
            viewport={canvas.viewport}
            selectedItemId={canvas.selectedItemId}
            tool={canvas.tool}
            connectState={canvas.connectState}
            draggingImages={canvas.draggingImages}
            boardRef={canvas.boardRef}
            models={canvas.models.image}
            running={canvas.running}
            mentionOpen={canvas.mentionOpen}
            mentionItems={canvas.mentionItems}
            onPointerDown={canvas.handleBoardPointerDown}
            onPointerMove={canvas.handlePointerMove}
            onPointerUp={canvas.handlePointerUp}
            onWheel={canvas.handleWheel}
            onDrop={canvas.handleBoardDrop}
            onDragOver={canvas.handleBoardDragOver}
            onDragLeave={canvas.stopDraggingImages}
            onItemPointerDown={canvas.handleItemPointerDown}
            onResizeItemPointerDown={canvas.handleResizeItemPointerDown}
            onSelectItem={canvas.setSelectedItemId}
            onOpenImage={canvas.openImage}
            onZoomIn={() => canvas.zoomBy(1.12)}
            onZoomOut={() => canvas.zoomBy(0.88)}
            onFit={canvas.fitContent}
            onUpdateItemData={canvas.updateItemData}
            onRunGenerator={canvas.runGeneratorNode}
            onDeleteItem={canvas.deleteItem}
            onStartConnect={canvas.startConnect}
            onFinishConnect={canvas.finishConnect}
            onDeleteEdge={canvas.deleteEdge}
            onMentionToggle={canvas.toggleMention}
            onAddMentionToPrompt={canvas.addMentionImageToPrompt}
          />

          <SmartCanvasAssetSidebar
            canvases={canvas.canvases}
            currentCanvasId={canvas.canvas?.id || ""}
            assets={canvas.assets}
            loadingAssets={canvas.loadingAssets}
            onSelectCanvas={(id) => void canvas.selectCanvas(id)}
            onCreateCanvas={() => void canvas.createNewCanvas()}
            onRefreshAssets={() => void canvas.loadAssets()}
            onAddAssetToCanvas={canvas.addAssetToCanvas}
            onAddAssetToComposer={canvas.addAssetToComposer}
          />

          <SmartCanvasInspector
            canvas={canvas.canvas}
            selectedItem={canvas.selectedItem}
            saveState={canvas.saveState}
            onNameChange={canvas.renameCanvas}
            onDeleteSelected={canvas.deleteSelected}
            onAddSelectedImagesToComposer={() => canvas.addImagesToComposer(canvasImagesFromItem(canvas.selectedItem))}
            onOpenImage={canvas.openImage}
          />
        </div>
      </SmartCanvasShell>

      <input
        ref={canvas.uploadInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={canvas.handleUploadInputChange}
      />

      <SmartCanvasImageEditor
        image={canvas.imageEditorImage}
        open={Boolean(canvas.imageEditorImage)}
        onApplyEdit={canvas.applyEditedImageFiles}
        onOpenChange={(open) => {
          if (!open) {
            canvas.setImageEditorImage(null);
          }
        }}
      />

      <Dialog open={canvas.deleteConfirm} onOpenChange={canvas.setDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除画布</DialogTitle>
            <DialogDescription>删除后无法恢复，画布里的图片本体仍保留在图片库。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => canvas.setDeleteConfirm(false)}>取消</Button>
            <Button type="button" variant="destructive" onClick={() => void canvas.deleteCurrentCanvas()}>删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
