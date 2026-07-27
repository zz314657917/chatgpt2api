"use client";

import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BoxSelect,
  CircleDot,
  CircleHelp,
  Clapperboard,
  Clock3,
  Eraser,
  FileText,
  Grid2X2,
  History,
  ImagePlus,
  Layers3,
  LoaderCircle,
  Repeat2,
  Save,
  Sparkles,
  WandSparkles,
} from "lucide-react";

import { ManagedImageAssetDock } from "@/components/managed-image-asset-dock";
import { MobileBottomDrawer } from "@/components/mobile-bottom-drawer";
import { useMobileNav } from "@/components/mobile-nav-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  SmartCanvasBoard,
  SmartCanvasLeftRail,
  SmartCanvasOperationHistoryList,
  SmartCanvasRunHistoryList,
  SmartCanvasShell,
  SmartCanvasTopBar,
} from "./canvas-node";
import { saveStateLabel, smartCanvasRuns } from "./canvas-utils";
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
  const { clearPanel, closeDrawer, setPanel } = useMobileNav();
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [mobileRunHistoryOpen, setMobileRunHistoryOpen] = useState(false);
  const [mobileOperationHistoryOpen, setMobileOperationHistoryOpen] = useState(false);
  const [mobileMiniMapOpen, setMobileMiniMapOpen] = useState(false);
  const {
    canvases,
    loading,
    canvas: currentCanvas,
    selectCanvas,
    setCanvasPresetPickerOpen,
    setLeftRailCollapsed,
    reloadCanvases,
    deleteCanvasById,
    renameCanvasById,
  } = canvas;

  const mobileCanvasPanel = useMemo(
    () => ({
      title: "画布列表",
      description: `${canvases.length} 个画布`,
      content: (
        <div className="h-[min(56dvh,520px)] min-h-[220px]">
          <SmartCanvasLeftRail
            canvases={canvases}
            currentCanvasId={currentCanvas?.id || ""}
            collapsed={false}
            loading={loading}
            onCollapsedChange={setLeftRailCollapsed}
            onSelectCanvas={(id) => {
              void selectCanvas(id);
              closeDrawer();
            }}
            onCreateCanvas={() => {
              setCanvasPresetPickerOpen(true);
              closeDrawer();
            }}
            onRefresh={() => void reloadCanvases()}
            onDeleteCanvas={(id) => void deleteCanvasById(id)}
            onRenameCanvas={(id, name) => void renameCanvasById(id, name)}
            variant="drawer"
          />
        </div>
      ),
    }),
    [
      canvases,
      closeDrawer,
      currentCanvas?.id,
      deleteCanvasById,
      loading,
      reloadCanvases,
      renameCanvasById,
      selectCanvas,
      setCanvasPresetPickerOpen,
      setLeftRailCollapsed,
    ],
  );

  useEffect(() => {
    setPanel(mobileCanvasPanel);
    return () => clearPanel();
  }, [clearPanel, mobileCanvasPanel, setPanel]);

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
        <div className="hidden h-full min-h-0 shrink-0 lg:block">
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
        </div>
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
            activePromptSplitBatchId={canvas.activePromptSplitBatchId}
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
            onActivePromptSplitBatchChange={canvas.setActivePromptSplitBatchId}
            onFocusPromptSplitBatch={canvas.focusPromptSplitBatch}
            onArrangePromptSplitBatch={canvas.arrangePromptSplitBatch}
            onDeletePromptSplitBatch={canvas.deletePromptSplitBatchNodes}
          />

          <SmartCanvasBoard
            canvas={canvas.canvas}
            viewport={canvas.viewport}
            selectedItemId={canvas.selectedItemId}
            selectedItemIds={canvas.selectedItemIds}
            activePromptSplitBatchId={canvas.activePromptSplitBatchId}
            tool={canvas.tool}
            connectState={canvas.connectState}
            lightweightMedia={canvas.lightweightCanvasMedia}
            draggingImages={canvas.draggingImages}
            boardRef={canvas.boardRef}
            imageModels={canvas.models.image}
            textModels={canvas.models.text}
            videoModels={canvas.models.video}
            activeTeam={canvas.activeTeam}
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
            onActivePromptSplitBatchChange={canvas.setActivePromptSplitBatchId}
            onViewportChange={canvas.updateViewport}
            onUpdateItemData={canvas.updateItemData}
            hasGeneratorStyleClipboard={canvas.hasGeneratorStyleClipboard}
            onCopyGeneratorStyle={canvas.copyGeneratorStyle}
            onPasteGeneratorStyle={canvas.pasteGeneratorStyle}
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
            runCount={smartCanvasRuns(canvas.canvas).slice(0, 30).length}
            mobileMiniMapOpen={mobileMiniMapOpen}
            onMobileToolsOpen={() => setMobileToolsOpen(true)}
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
            title={canvas.assetLibraryScope === "team" ? "团队素材库" : "个人素材库"}
            emptyLabel={canvas.assetLibraryScope === "team" ? "团队素材库暂无图片" : undefined}
            tabs={canvas.assetLibraryTabs}
            activeTabId={canvas.assetLibraryScope}
            onActiveTabChange={canvas.setAssetLibraryScope}
            collections={canvas.assetCollections}
            unclassifiedCount={canvas.assetUnclassifiedCount}
            activeCollectionId={canvas.activeAssetCollectionId}
            onCollectionChange={canvas.setAssetCollection}
            defaultExpanded
            onExpandedChange={canvas.handleAssetSidebarExpandedChange}
            mediaType={canvas.assetLibraryMediaType}
            onMediaTypeChange={canvas.setAssetLibraryMediaType}
            videoAssets={canvas.videoAssets}
            loadingVideoAssets={canvas.loadingVideoAssets}
            onAddVideoToCanvas={canvas.addVideoAssetToCanvas}
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

      <MobileBottomDrawer
        open={mobileRunHistoryOpen}
        onOpenChange={setMobileRunHistoryOpen}
        title="运行记录"
        description={`最近 ${smartCanvasRuns(canvas.canvas).slice(0, 30).length} 条，最多显示 30 条`}
        className="lg:hidden"
      >
        <SmartCanvasRunHistoryList canvas={canvas.canvas} className="max-h-[56dvh]" />
      </MobileBottomDrawer>

      <MobileBottomDrawer
        open={mobileToolsOpen}
        onOpenChange={setMobileToolsOpen}
        title="画布工具"
        description="常用操作、添加节点和保存状态"
        className="lg:hidden"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <CanvasMobileToolButton icon={<Grid2X2 className="size-4" />} label={mobileMiniMapOpen ? "隐藏小地图" : "小地图"} active={mobileMiniMapOpen} onClick={() => {
              setMobileMiniMapOpen((open) => !open);
              setMobileToolsOpen(false);
            }} />
            <CanvasMobileToolButton icon={<History className="size-4" />} label="运行记录" count={smartCanvasRuns(canvas.canvas).slice(0, 30).length} onClick={() => {
              setMobileToolsOpen(false);
              setMobileRunHistoryOpen(true);
            }} />
            <CanvasMobileToolButton icon={<BoxSelect className="size-4" />} label="适配画布" onClick={() => {
              setMobileToolsOpen(false);
              canvas.fitContent();
            }} />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <CanvasMobileToolButton icon={<ImagePlus className="size-4" />} label="上传" onClick={() => {
              setMobileToolsOpen(false);
              canvas.openUploadDialog();
            }} />
            <CanvasMobileToolButton icon={<FileText className="size-4" />} label="提示词" onClick={() => {
              setMobileToolsOpen(false);
              canvas.addNodeAt("prompt");
            }} />
            <CanvasMobileToolButton icon={<Sparkles className="size-4" />} label="AI提示词" onClick={() => {
              setMobileToolsOpen(false);
              canvas.addNodeAt("llm");
            }} />
            <CanvasMobileToolButton icon={<WandSparkles className="size-4" />} label="图片生成" onClick={() => {
              setMobileToolsOpen(false);
              canvas.addNodeAt("image_generation");
            }} />
            <CanvasMobileToolButton icon={<Clapperboard className="size-4" />} label="视频" onClick={() => {
              setMobileToolsOpen(false);
              canvas.addNodeAt("video_generation");
            }} />
            <CanvasMobileToolButton icon={<CircleDot className="size-4" />} label="Output" onClick={() => {
              setMobileToolsOpen(false);
              canvas.addNodeAt("result");
            }} />
            <CanvasMobileToolButton icon={<Repeat2 className="size-4" />} label="循环" onClick={() => {
              setMobileToolsOpen(false);
              canvas.addNodeAt("loop");
            }} />
            <CanvasMobileToolButton icon={<Layers3 className="size-4" />} label="组" onClick={() => {
              setMobileToolsOpen(false);
              canvas.addNodeAt("group");
            }} />
            <CanvasMobileToolButton icon={<CircleHelp className="size-4" />} label="帮助" onClick={() => {
              setMobileToolsOpen(false);
              canvas.openCanvasHelp();
            }} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl text-xs font-black"
              onClick={() => {
                setMobileToolsOpen(false);
                setMobileOperationHistoryOpen(true);
              }}
            >
              <Clock3 className="size-4" />
              最近操作 {canvas.historyEntries.slice(0, 30).length || ""}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl text-xs font-black"
              disabled={canvas.blankNodeCount === 0}
              onClick={() => {
                setMobileToolsOpen(false);
                canvas.cleanupBlankNodes();
              }}
            >
              <Eraser className="size-4" />
              清理空白{canvas.blankNodeCount ? ` ${canvas.blankNodeCount}` : ""}
            </Button>
          </div>

          <div className={cn(
            "rounded-2xl border p-3",
            canvas.saveState === "error"
              ? "border-rose-500/35 bg-rose-500/8 text-rose-700 dark:text-rose-200"
              : "border-border bg-muted/35 text-foreground dark:border-slate-800 dark:bg-slate-950/35",
          )}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-black">{saveStateLabel(canvas.saveState)}</div>
                <div className="mt-1 text-xs text-muted-foreground">画布会自动保存；需要时可手动立即保存。</div>
              </div>
              <Button
                type="button"
                size="sm"
                className="h-9 shrink-0 rounded-xl text-xs font-black"
                variant={canvas.saveState === "error" ? "destructive" : "outline"}
                disabled={canvas.saving}
                onClick={() => void canvas.saveNow()}
              >
                {canvas.saving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
                立即保存
              </Button>
            </div>
          </div>
        </div>
      </MobileBottomDrawer>

      <MobileBottomDrawer
        open={mobileOperationHistoryOpen}
        onOpenChange={setMobileOperationHistoryOpen}
        title="最近操作"
        description={`最近 ${canvas.historyEntries.slice(0, 30).length} 条，最多显示 30 条`}
        className="lg:hidden"
      >
        <SmartCanvasOperationHistoryList
          entries={canvas.historyEntries}
          canUndo={canvas.canUndo}
          canRedo={canvas.canRedo}
          onUndo={canvas.undoCanvas}
          onRedo={canvas.redoCanvas}
          onRestore={(entry) => {
            canvas.restoreHistoryEntry(entry);
            setMobileOperationHistoryOpen(false);
          }}
          className="max-h-[56dvh]"
        />
      </MobileBottomDrawer>

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

function CanvasMobileToolButton({
  icon,
  label,
  active,
  count,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "relative flex h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-2xl border border-border bg-background/70 px-2 text-xs font-black text-foreground transition hover:bg-accent dark:border-slate-800 dark:bg-slate-950/35 dark:text-slate-200 dark:hover:bg-slate-800",
        active && "border-sky-400/45 bg-sky-500/12 text-sky-700 dark:border-sky-300/35 dark:bg-sky-400/15 dark:text-sky-100",
      )}
      onClick={onClick}
      aria-pressed={active}
    >
      {icon}
      <span className="max-w-full truncate">{label}</span>
      {count ? (
        <span className="absolute right-2 top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-sky-500 px-1.5 text-[10px] font-black leading-none text-white">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </button>
  );
}
