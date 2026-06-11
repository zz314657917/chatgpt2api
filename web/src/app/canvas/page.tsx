"use client";

import { lazy, Suspense } from "react";
import { LoaderCircle } from "lucide-react";

import { ManagedImageAssetDock } from "@/components/managed-image-asset-dock";
import {
  SmartCanvasBoard,
  SmartCanvasLeftRail,
  SmartCanvasShell,
  SmartCanvasTopBar,
} from "./canvas-node";
import { smartCanvasRuns } from "./canvas-utils";
import { useSmartCanvasController } from "./use-smart-canvas-controller";

const SmartCanvasImageEditor = lazy(() =>
  import("./canvas-image-editor").then((module) => ({ default: module.SmartCanvasImageEditor })),
);
const SmartCanvasHelpPanel = lazy(() =>
  import("./canvas-node").then((module) => ({ default: module.SmartCanvasHelpPanel })),
);
const SmartCanvasRunHistoryPanel = lazy(() =>
  import("./canvas-node").then((module) => ({ default: module.SmartCanvasRunHistoryPanel })),
);
const SmartCanvasOperationHistoryPanel = lazy(() =>
  import("./canvas-node").then((module) => ({ default: module.SmartCanvasOperationHistoryPanel })),
);
const SmartCanvasOnboardingDialog = lazy(() =>
  import("./canvas-node").then((module) => ({ default: module.SmartCanvasOnboardingDialog })),
);
const SmartCanvasPickerDialog = lazy(() =>
  import("./canvas-node").then((module) => ({ default: module.SmartCanvasPickerDialog })),
);
const SmartCanvasPresetDialog = lazy(() =>
  import("./canvas-node").then((module) => ({ default: module.SmartCanvasPresetDialog })),
);

function CanvasLazyLoading({ label, className = "" }: { label: string; className?: string }) {
  return (
    <div className={`pointer-events-none flex items-center justify-center gap-2 text-xs font-medium text-muted-foreground ${className}`}>
      <LoaderCircle className="size-3.5 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

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
            videoModels={canvas.models.video}
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
            onRemoveImageBackground={canvas.openBackgroundRemovalEditorForItem}
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

          <ManagedImageAssetDock
            activated={canvas.assetSidebarActivated}
            assetCount={canvas.assets.length}
            assets={canvas.assets}
            loadingAssets={canvas.loadingAssets}
            loadingMoreAssets={canvas.loadingMoreAssets}
            hasMoreAssets={canvas.hasMoreAssets}
            onActivate={canvas.activateAssetSidebar}
            onRefreshAssets={() => void canvas.refreshAssets()}
            onLoadMoreAssets={() => void canvas.loadMoreAssets()}
            onAddAssetToCanvas={canvas.addAssetToCanvas}
            onAddAssetToComposer={canvas.addAssetToComposer}
            storagePrefix="smart-canvas-asset-sidebar"
            showOpenButton={false}
            title={canvas.assetLibraryScope === "team" ? "团队素材库" : canvas.assetLibraryScope === "public" ? "公共素材库" : "个人素材库"}
            subtitle={canvas.assetLibraryScope === "public" ? `${canvas.assets.length} 张公开素材 · 点击加入输入` : undefined}
            emptyLabel={canvas.assetLibraryScope === "team" ? "团队素材库暂无图片" : canvas.assetLibraryScope === "public" ? "公共素材库暂无图片" : undefined}
            tabs={canvas.assetLibraryTabs}
            activeTabId={canvas.assetLibraryScope}
            onActiveTabChange={canvas.setAssetLibraryScope}
            collections={canvas.assetCollections}
            unclassifiedCount={canvas.assetUnclassifiedCount}
            activeCollectionId={canvas.activeAssetCollectionId}
            onCollectionChange={canvas.setAssetCollection}
            defaultExpanded
            onExpandedChange={canvas.handleAssetSidebarExpandedChange}
          />

          {canvas.helpOpen ? (
            <Suspense fallback={<CanvasLazyLoading label="加载帮助..." className="absolute right-4 top-24 z-40 rounded-full border border-border bg-card/90 px-3 py-1.5 shadow-sm backdrop-blur" />}>
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
            </Suspense>
          ) : null}

          {canvas.runHistoryOpen ? (
            <Suspense fallback={<CanvasLazyLoading label="加载运行记录..." className="absolute right-4 top-24 z-40 rounded-full border border-border bg-card/90 px-3 py-1.5 shadow-sm backdrop-blur" />}>
              <SmartCanvasRunHistoryPanel
                canvas={canvas.canvas}
                open={canvas.runHistoryOpen}
                onOpenChange={canvas.setRunHistoryOpen}
                onBackToRun={canvas.focusItem}
              />
            </Suspense>
          ) : null}

          {canvas.operationHistoryOpen ? (
            <Suspense fallback={<CanvasLazyLoading label="加载操作记录..." className="absolute right-4 top-24 z-40 rounded-full border border-border bg-card/90 px-3 py-1.5 shadow-sm backdrop-blur" />}>
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
            </Suspense>
          ) : null}
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

      {canvas.imageEditorImage ? (
        <Suspense fallback={<CanvasLazyLoading label="加载编辑器..." className="fixed inset-x-0 top-20 z-50" />}>
          <SmartCanvasImageEditor
            image={canvas.imageEditorImage}
            open={Boolean(canvas.imageEditorImage)}
            onApplyEdit={canvas.applyEditedImageFiles}
            angleValues={canvas.angleControlValues}
            anglePrompt={canvas.angleControlPrompt}
            angleResultItem={canvas.angleControlResultItem}
            runningAngle={canvas.running}
            runningBackgroundRemoval={canvas.running}
            initialMode={canvas.imageEditorInitialMode}
            onAngleValuesChange={canvas.setAngleControlValues}
            onSubmitAngle={canvas.runAngleControlForImageEditor}
            onSubmitBackgroundRemoval={canvas.imageEditorSourceItemId ? canvas.runBackgroundRemovalForImageEditor : undefined}
            onOpenChange={(open) => {
              if (!open) {
                canvas.setImageEditorImage(null);
                canvas.setImageEditorSourceItemId("");
              }
            }}
          />
        </Suspense>
      ) : null}

      {canvas.onboardingOpen ? (
        <Suspense fallback={<CanvasLazyLoading label="加载引导..." className="fixed inset-x-0 top-20 z-50" />}>
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
        </Suspense>
      ) : null}

      {canvas.canvasPickerOpen ? (
        <Suspense fallback={<CanvasLazyLoading label="加载画布列表..." className="fixed inset-x-0 top-20 z-50" />}>
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
        </Suspense>
      ) : null}

      {canvas.canvasPresetPickerOpen ? (
        <Suspense fallback={<CanvasLazyLoading label="加载预设..." className="fixed inset-x-0 top-20 z-50" />}>
          <SmartCanvasPresetDialog
            open={canvas.canvasPresetPickerOpen}
            currentCanvasName={canvas.canvas?.name || ""}
            userPresets={canvas.userPresets}
            onOpenChange={canvas.setCanvasPresetPickerOpen}
            onCreateCanvas={(presetId) => void canvas.createNewCanvas(presetId)}
            onCreateFromUserPreset={(presetId) => void canvas.createCanvasFromUserPreset(presetId)}
            onSaveCurrentAsPreset={canvas.saveCurrentCanvasAsPreset}
            onDeleteUserPreset={canvas.deleteUserPreset}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
