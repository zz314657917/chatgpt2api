"use client";

import { LoaderCircle } from "lucide-react";

import {
  SmartCanvasAssetSidebar,
  SmartCanvasBoard,
  SmartCanvasHelpPanel,
  SmartCanvasLeftRail,
  SmartCanvasOnboardingDialog,
  SmartCanvasOperationHistoryPanel,
  SmartCanvasPickerDialog,
  SmartCanvasPresetDialog,
  SmartCanvasRunHistoryPanel,
  SmartCanvasShell,
  SmartCanvasTopBar,
} from "./canvas-node";
import { SmartCanvasImageEditor } from "./canvas-image-editor";
import { smartCanvasRuns } from "./canvas-utils";
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
        <SmartCanvasLeftRail
          canvases={canvas.canvases}
          currentCanvasId={canvas.canvas?.id || ""}
          collapsed={canvas.leftRailCollapsed}
          loading={canvas.loading}
          onCollapsedChange={canvas.setLeftRailCollapsed}
          onSelectCanvas={(id) => void canvas.selectCanvas(id)}
          onCreateCanvas={() => canvas.setCanvasPresetPickerOpen(true)}
          onRefresh={() => void canvas.reloadCanvases()}
          onDeleteCanvas={(id) => void canvas.deleteCanvasById(id)}
          onRenameCanvas={(id, name) => void canvas.renameCanvasById(id, name)}
        />
        <div className="relative min-w-0 flex-1">
          <SmartCanvasTopBar
            canvas={canvas.canvas}
            canvasName={canvas.canvas?.name || "未命名画布"}
            saveState={canvas.saveState}
            saving={canvas.saving}
            running={canvas.running}
            runCount={smartCanvasRuns(canvas.canvas).slice(0, 30).length}
            operationCount={canvas.historyEntries.slice(0, 30).length}
            blankNodeCount={canvas.blankNodeCount}
            canUndo={canvas.canUndo}
            onSave={() => void canvas.saveNow()}
            onAddNode={canvas.addNodeAt}
            onUploadClick={canvas.openUploadDialog}
            onCleanupBlankNodes={canvas.cleanupBlankNodes}
            onHelpClick={() => canvas.openCanvasHelp()}
            onRunHistoryToggle={() => canvas.setRunHistoryOpen(!canvas.runHistoryOpen)}
            onOperationHistoryToggle={() => canvas.setOperationHistoryOpen(!canvas.operationHistoryOpen)}
            onUndo={canvas.undoCanvas}
            onFocusNode={canvas.focusItem}
            onMoveNodeToScreenPoint={canvas.moveItemToScreenPoint}
          />

          <SmartCanvasBoard
            canvas={canvas.canvas}
            viewport={canvas.viewport}
            selectedItemId={canvas.selectedItemId}
            selectedItemIds={canvas.selectedItemIds}
            tool={canvas.tool}
            connectState={canvas.connectState}
            lightweightMedia={canvas.lightweightCanvasMedia}
            draggingImages={canvas.draggingImages}
            boardRef={canvas.boardRef}
            imageModels={canvas.models.image}
            textModels={canvas.models.text}
            running={canvas.running}
            mentionOpen={canvas.mentionOpen}
            mentionItems={canvas.mentionItems}
            portMenuRequest={canvas.portMenuRequest}
            onPointerDown={canvas.handleBoardPointerDown}
            onPointerMove={canvas.handlePointerMove}
            onPointerUp={canvas.handlePointerUp}
            onWheel={canvas.handleWheel}
            onDrop={canvas.handleBoardDrop}
            onDragOver={canvas.handleBoardDragOver}
            onDragLeave={canvas.stopDraggingImages}
            onContextMenu={(event) => {
              const target = event.target;
              if (target instanceof HTMLElement && !target.closest("[data-canvas-node-id], [data-node-interactive='true'], button, input, textarea, select")) {
                event.preventDefault();
              }
            }}
            onItemPointerDown={canvas.handleItemPointerDown}
            onResizeItemPointerDown={canvas.handleResizeItemPointerDown}
            onSelectItem={canvas.selectItem}
            onOpenImage={canvas.openImage}
            onDeleteImage={canvas.deleteImageFromItem}
            onZoomIn={() => canvas.zoomBy(1.12)}
            onZoomOut={() => canvas.zoomBy(0.88)}
            onFit={canvas.fitContent}
            onViewportChange={canvas.updateViewport}
            onUpdateItemData={canvas.updateItemData}
            onRunGenerator={canvas.runGeneratorNode}
            onRunLlm={canvas.runLlmNode}
            onStopLoop={canvas.stopLoopNode}
            onStopNode={canvas.stopRunningNode}
            onOpenNodeHelp={canvas.openNodeHelp}
            onConnectLlmImagesToGenerator={canvas.connectLlmImagesToGenerator}
            onConnectLlmImagesToLoop={canvas.connectLlmImagesToLoop}
            onDeleteItem={canvas.deleteItem}
            onStartConnect={canvas.startConnect}
            onFinishConnect={canvas.finishConnect}
            onDeleteEdge={canvas.deleteEdge}
            onMentionToggle={canvas.toggleMention}
            onAddMentionToPrompt={canvas.addMentionImageToPrompt}
            onCreateNodeAt={canvas.addNodeAt}
            onCreateNodeFromPort={canvas.addNodeFromPort}
            onCreateNodeHelpTemplate={canvas.createNodeHelpTemplate}
            onUploadAt={canvas.openUploadDialogAt}
          />

          <SmartCanvasAssetSidebar
            assets={canvas.assets}
            loadingAssets={canvas.loadingAssets}
            loadingMoreAssets={canvas.loadingMoreAssets}
            hasMoreAssets={canvas.hasMoreAssets}
            onRefreshAssets={() => void canvas.loadAssets()}
            onLoadMoreAssets={() => void canvas.loadMoreAssets()}
            onAddAssetToCanvas={canvas.addAssetToCanvas}
            onAddAssetToComposer={canvas.addAssetToComposer}
          />

          <SmartCanvasHelpPanel
            open={canvas.helpOpen}
            topic={canvas.helpTopic}
            onOpenChange={canvas.setHelpOpen}
            onTopicChange={canvas.setHelpTopic}
            onInsertTemplate={(templateId) => {
              canvas.insertFlowTemplate(templateId);
              canvas.setHelpOpen(false);
            }}
          />

          <SmartCanvasRunHistoryPanel
            canvas={canvas.canvas}
            open={canvas.runHistoryOpen}
            onOpenChange={canvas.setRunHistoryOpen}
            onBackToRun={canvas.focusItem}
          />

          <SmartCanvasOperationHistoryPanel
            entries={canvas.historyEntries}
            open={canvas.operationHistoryOpen}
            canUndo={canvas.canUndo}
            canRedo={canvas.canRedo}
            onOpenChange={canvas.setOperationHistoryOpen}
            onUndo={canvas.undoCanvas}
            onRedo={canvas.redoCanvas}
            onRestore={(entry) => {
              canvas.restoreHistoryEntry(entry);
              canvas.setOperationHistoryOpen(false);
            }}
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
        angleValues={canvas.angleControlValues}
        anglePrompt={canvas.angleControlPrompt}
        angleResultItem={canvas.angleControlResultItem}
        runningAngle={canvas.running}
        onAngleValuesChange={canvas.setAngleControlValues}
        onSubmitAngle={canvas.runAngleControlForImageEditor}
        onOpenChange={(open) => {
          if (!open) {
            canvas.setImageEditorImage(null);
            canvas.setImageEditorSourceItemId("");
          }
        }}
      />

      <SmartCanvasOnboardingDialog
        open={canvas.onboardingOpen}
        onDismiss={canvas.dismissOnboarding}
        onOpenHelp={() => {
          canvas.dismissOnboarding();
          canvas.openCanvasHelp();
        }}
        onInsertBasicTemplate={() => {
          canvas.dismissOnboarding();
          canvas.insertFlowTemplate("basic-text");
        }}
      />

      <SmartCanvasPickerDialog
        open={canvas.canvasPickerOpen}
        canvases={canvas.canvases}
        currentCanvasId={canvas.canvas?.id || ""}
        loading={canvas.loading}
        onOpenChange={canvas.setCanvasPickerOpen}
        onSelectCanvas={(id) => void canvas.selectCanvas(id)}
        onCreateCanvas={() => canvas.setCanvasPresetPickerOpen(true)}
        onRefresh={() => void canvas.reloadCanvases()}
        onDeleteCanvas={(id) => void canvas.deleteCanvasById(id)}
        onRenameCanvas={(id, name) => void canvas.renameCanvasById(id, name)}
      />

      <SmartCanvasPresetDialog
        open={canvas.canvasPresetPickerOpen}
        onOpenChange={canvas.setCanvasPresetPickerOpen}
        onCreateCanvas={(presetId) => void canvas.createNewCanvas(presetId)}
      />
    </div>
  );
}
