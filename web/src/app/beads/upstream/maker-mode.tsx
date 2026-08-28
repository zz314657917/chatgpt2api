import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Grid3X3,
  LockKeyhole,
  Map,
  RotateCcw,
  SunMedium,
  UnlockKeyhole,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { getColor } from "./palette";
import type { BeadProject } from "./types";

type MakerModeProps = {
  project: BeadProject;
  saveState: "idle" | "unsaved" | "saving" | "saved" | "error";
  onProjectChange: (project: BeadProject) => void;
  onExit: () => void;
};

type BoardRegion = {
  index: number;
  row: number;
  column: number;
  startX: number;
  startY: number;
  width: number;
  height: number;
};

type WakeLockSentinelLike = {
  release: () => Promise<void>;
  addEventListener: (type: "release", listener: () => void) => void;
};

type PatternCanvasProps = {
  project: BeadProject;
  region?: BoardRegion;
  completedCells: Set<number>;
  highlightedColorId: string | null;
  hideCompleted: boolean;
  cellSize: number;
  activeRegion?: BoardRegion;
  onToggleCell?: (index: number) => void;
  onNavigate?: (x: number, y: number) => void;
};

export default function MakerMode({
  project,
  saveState,
  onProjectChange,
  onExit,
}: MakerModeProps) {
  const [view, setView] = useState<"board" | "overview">("board");
  const [highlightedColorId, setHighlightedColorId] = useState<string | null>(
    null,
  );
  const [hideCompleted, setHideCompleted] = useState(false);
  const [locked, setLocked] = useState(false);
  const [cellSize, setCellSize] = useState(22);
  const [overviewCellSize, setOverviewCellSize] = useState(8);
  const [wakeMessage, setWakeMessage] = useState("屏幕常亮未启用");
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const regions = useMemo(() => makeBoardRegions(project), [project]);
  const activeBoardIndex = Math.min(
    Math.max(0, project.makerState.activeBoardIndex),
    Math.max(0, regions.length - 1),
  );
  const activeRegion = regions[activeBoardIndex] ?? regions[0];
  const completedCells = useMemo(
    () =>
      new Set(
        project.makerState.completedCells.filter((index) => Boolean(project.cells[index])),
      ),
    [project.cells, project.makerState.completedCells],
  );
  const usedColorIds = useMemo(
    () =>
      [...new Set(project.cells.filter((colorId): colorId is string => Boolean(colorId)))].sort(
        (left, right) =>
          (getColor(left)?.primaryCode ?? left).localeCompare(
            getColor(right)?.primaryCode ?? right,
            "zh-CN",
          ),
      ),
    [project.cells],
  );
  const overallProgress = useMemo(
    () => summarizeProgress(project, completedCells),
    [completedCells, project],
  );
  const boardProgress = useMemo(
    () => summarizeProgress(project, completedCells, activeRegion),
    [activeRegion, completedCells, project],
  );

  useEffect(() => {
    return () => {
      if (wakeLockRef.current) void wakeLockRef.current.release();
    };
  }, []);

  useEffect(() => {
    if (highlightedColorId && !usedColorIds.includes(highlightedColorId)) {
      setHighlightedColorId(null);
    }
  }, [highlightedColorId, usedColorIds]);

  function setActiveBoard(index: number) {
    const next = Math.min(Math.max(0, index), Math.max(0, regions.length - 1));
    if (next === activeBoardIndex) return;
    onProjectChange({
      ...project,
      makerState: {
        ...project.makerState,
        activeBoardIndex: next,
      },
    });
  }

  function toggleCompleted(index: number) {
    if (locked || !project.cells[index]) return;
    const next = new Set(completedCells);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    onProjectChange({
      ...project,
      makerState: {
        ...project.makerState,
        completedCells: [...next].sort((left, right) => left - right),
      },
    });
  }

  function resetProgress() {
    if (completedCells.size === 0) return;
    onProjectChange({
      ...project,
      makerState: {
        ...project.makerState,
        completedCells: [],
      },
    });
  }

  function navigateToCell(x: number, y: number) {
    const region = regions.find(
      (candidate) =>
        x >= candidate.startX &&
        x < candidate.startX + candidate.width &&
        y >= candidate.startY &&
        y < candidate.startY + candidate.height,
    );
    if (!region) return;
    setActiveBoard(region.index);
    setView("board");
  }

  async function toggleWakeLock() {
    if (wakeLockRef.current) {
      await wakeLockRef.current.release();
      wakeLockRef.current = null;
      setWakeMessage("屏幕常亮未启用");
      return;
    }
    const wakeLockApi = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
    };
    if (!wakeLockApi.wakeLock) {
      setWakeMessage("当前浏览器不支持屏幕常亮，请保持页面可见。");
      return;
    }
    try {
      const sentinel = await wakeLockApi.wakeLock.request("screen");
      wakeLockRef.current = sentinel;
      sentinel.addEventListener("release", () => {
        wakeLockRef.current = null;
        setWakeMessage("屏幕常亮已由系统释放。");
      });
      setWakeMessage("屏幕常亮已启用");
    } catch {
      setWakeMessage("无法启用屏幕常亮，请检查浏览器权限。");
    }
  }

  if (!activeRegion) return null;

  return (
    <main className="maker-mode" data-testid="bead-maker-mode">
      <header className="maker-mode-header">
        <button
          className="maker-header-icon"
          type="button"
          onClick={onExit}
          aria-label="退出制作模式"
          title="退出制作模式"
        >
          <ArrowLeft aria-hidden="true" />
        </button>
        <div className="maker-mode-title">
          <strong>{project.name}</strong>
          <span>
            制作模式 · {saveState === "saving" ? "正在保存进度" : saveState === "error" ? "进度保存失败" : "进度已保存"}
          </span>
        </div>
        <button
          className={`maker-header-icon${locked ? " is-locked" : ""}`}
          type="button"
          onClick={() => setLocked((current) => !current)}
          aria-label={locked ? "解除防误触锁" : "开启防误触锁"}
          title={locked ? "解除防误触锁" : "开启防误触锁"}
        >
          {locked ? <LockKeyhole aria-hidden="true" /> : <UnlockKeyhole aria-hidden="true" />}
        </button>
      </header>

      <div className="maker-mode-layout">
        <aside className="maker-mode-sidebar">
          <section className="maker-panel maker-board-navigation">
            <div className="maker-panel-heading">
              <div>
                <span>当前豆板</span>
                <strong>
                  {activeBoardIndex + 1}/{regions.length}
                </strong>
              </div>
              <small>
                第 {activeRegion.row + 1} 行 · 第 {activeRegion.column + 1} 列
              </small>
            </div>
            <div className="maker-board-actions">
              <button
                type="button"
                disabled={activeBoardIndex === 0}
                onClick={() => setActiveBoard(activeBoardIndex - 1)}
              >
                <ChevronLeft aria-hidden="true" />
                上一板
              </button>
              <button
                type="button"
                disabled={activeBoardIndex >= regions.length - 1}
                onClick={() => setActiveBoard(activeBoardIndex + 1)}
              >
                下一板
                <ChevronRight aria-hidden="true" />
              </button>
            </div>
          </section>

          <section className="maker-panel maker-view-switcher">
            <div className="maker-segmented-control" aria-label="查看范围">
              <button
                className={view === "board" ? "active" : ""}
                type="button"
                onClick={() => setView("board")}
              >
                <Grid3X3 aria-hidden="true" />
                当前板
              </button>
              <button
                className={view === "overview" ? "active" : ""}
                type="button"
                onClick={() => setView("overview")}
              >
                <Map aria-hidden="true" />
                全图
              </button>
            </div>
            {view === "board" ? (
              <div className="maker-minimap-wrap">
                <span>点击缩略图切换豆板</span>
                <PatternCanvas
                  project={project}
                  completedCells={completedCells}
                  highlightedColorId={highlightedColorId}
                  hideCompleted={hideCompleted}
                  cellSize={miniMapCellSize(project)}
                  activeRegion={activeRegion}
                  onNavigate={navigateToCell}
                />
              </div>
            ) : null}
          </section>

          <section className="maker-panel maker-progress-panel">
            <ProgressRow label="当前板" progress={boardProgress} />
            <ProgressRow label="整体" progress={overallProgress} />
          </section>

          <label className="maker-field">
            <span>高亮颜色</span>
            <select
              value={highlightedColorId ?? ""}
              onChange={(event) => setHighlightedColorId(event.target.value || null)}
            >
              <option value="">显示全部颜色</option>
              {usedColorIds.map((colorId) => (
                <option key={colorId} value={colorId}>
                  {getColor(colorId)?.primaryCode ?? colorId}
                </option>
              ))}
            </select>
          </label>

          <label className="maker-checkbox">
            <input
              type="checkbox"
              checked={hideCompleted}
              onChange={(event) => setHideCompleted(event.target.checked)}
            />
            <span>隐藏已完成格</span>
          </label>

          <div className="maker-tool-row">
            <button
              type="button"
              onClick={() =>
                view === "board"
                  ? setCellSize((current) => Math.max(12, current - 2))
                  : setOverviewCellSize((current) => Math.max(4, current - 1))
              }
              aria-label="缩小图纸"
              title="缩小图纸"
            >
              <ZoomOut aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() =>
                view === "board"
                  ? setCellSize((current) => Math.min(38, current + 2))
                  : setOverviewCellSize((current) => Math.min(18, current + 1))
              }
              aria-label="放大图纸"
              title="放大图纸"
            >
              <ZoomIn aria-hidden="true" />
            </button>
            <button
              type="button"
              className={hideCompleted ? "active" : ""}
              onClick={() => setHideCompleted((current) => !current)}
              aria-label={hideCompleted ? "显示已完成格" : "隐藏已完成格"}
              title={hideCompleted ? "显示已完成格" : "隐藏已完成格"}
            >
              {hideCompleted ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            </button>
            <button
              type="button"
              disabled={completedCells.size === 0}
              onClick={resetProgress}
              aria-label="重置制作进度"
              title="重置制作进度"
            >
              <RotateCcw aria-hidden="true" />
            </button>
          </div>

          <button className="maker-wake-lock" type="button" onClick={() => void toggleWakeLock()}>
            <SunMedium aria-hidden="true" />
            屏幕常亮
          </button>
          <p className="maker-wake-status" role="status">
            {wakeMessage}
          </p>
        </aside>

        <section className="maker-mode-canvas-panel">
          <div className="maker-canvas-header">
            <div>
              <strong>{view === "board" ? `豆板 ${activeBoardIndex + 1}` : "全局图纸"}</strong>
              <span>
                {view === "board"
                  ? `${activeRegion.width} × ${activeRegion.height} 格`
                  : `${project.width} × ${project.height} 格`}
              </span>
            </div>
            <span className={locked ? "maker-lock-status is-locked" : "maker-lock-status"}>
              {locked ? "防误触已锁定" : "点击格子标记完成"}
            </span>
          </div>
          <div className="maker-canvas-scroll">
            {view === "board" ? (
              <PatternCanvas
                project={project}
                region={activeRegion}
                completedCells={completedCells}
                highlightedColorId={highlightedColorId}
                hideCompleted={hideCompleted}
                cellSize={cellSize}
                onToggleCell={toggleCompleted}
              />
            ) : (
              <PatternCanvas
                project={project}
                completedCells={completedCells}
                highlightedColorId={highlightedColorId}
                hideCompleted={hideCompleted}
                cellSize={overviewCellSize}
                activeRegion={activeRegion}
                onNavigate={navigateToCell}
              />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function PatternCanvas({
  project,
  region,
  completedCells,
  highlightedColorId,
  hideCompleted,
  cellSize,
  activeRegion,
  onToggleCell,
  onNavigate,
}: PatternCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const startX = region?.startX ?? 0;
  const startY = region?.startY ?? 0;
  const width = region?.width ?? project.width;
  const height = region?.height ?? project.height;
  const widthPx = width * cellSize;
  const heightPx = height * cellSize;
  const completedKey = [...completedCells].join(",");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.round(widthPx * ratio);
    canvas.height = Math.round(heightPx * ratio);
    canvas.style.width = `${widthPx}px`;
    canvas.style.height = `${heightPx}px`;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, widthPx, heightPx);
    context.fillStyle = "#f7f3eb";
    context.fillRect(0, 0, widthPx, heightPx);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const sourceX = startX + x;
        const sourceY = startY + y;
        const index = sourceY * project.width + sourceX;
        const colorId = project.cells[index];
        const completed = completedCells.has(index);
        const selected = !highlightedColorId || highlightedColorId === colorId;
        const left = x * cellSize;
        const top = y * cellSize;
        if (!colorId || (hideCompleted && completed)) {
          context.fillStyle = completed ? "#e6e1d7" : "#f7f3eb";
          context.fillRect(left, top, cellSize, cellSize);
        } else {
          const color = getColor(colorId);
          context.globalAlpha = selected ? (completed ? 0.48 : 1) : 0.15;
          context.fillStyle = color?.hex ?? "#aeb7bd";
          context.fillRect(left, top, cellSize, cellSize);
          context.globalAlpha = 1;
        }
        context.strokeStyle = "rgba(91, 81, 67, 0.28)";
        context.lineWidth = cellSize >= 14 ? 1 : 0.5;
        context.strokeRect(left, top, cellSize, cellSize);
        if (colorId && cellSize >= 24 && !hideCompleted && !completed) {
          context.fillStyle = "rgba(24, 29, 33, 0.88)";
          context.font = `600 ${Math.max(8, Math.floor(cellSize * 0.31))}px system-ui`;
          context.textAlign = "center";
          context.textBaseline = "middle";
          context.fillText(
            getColor(colorId)?.primaryCode ?? colorId,
            left + cellSize / 2,
            top + cellSize / 2,
            Math.max(0, cellSize - 3),
          );
        }
        if (completed && !hideCompleted && cellSize >= 16) {
          context.strokeStyle = "rgba(20, 58, 59, 0.92)";
          context.lineWidth = Math.max(1.5, cellSize * 0.1);
          context.lineCap = "round";
          context.beginPath();
          context.moveTo(left + cellSize * 0.26, top + cellSize * 0.54);
          context.lineTo(left + cellSize * 0.45, top + cellSize * 0.73);
          context.lineTo(left + cellSize * 0.76, top + cellSize * 0.31);
          context.stroke();
        }
      }
    }
    if (activeRegion && !region) {
      context.strokeStyle = "#c78921";
      context.lineWidth = Math.max(2, cellSize * 0.4);
      context.strokeRect(
        activeRegion.startX * cellSize + context.lineWidth / 2,
        activeRegion.startY * cellSize + context.lineWidth / 2,
        activeRegion.width * cellSize - context.lineWidth,
        activeRegion.height * cellSize - context.lineWidth,
      );
    }
  }, [
    activeRegion,
    cellSize,
    completedCells,
    completedKey,
    height,
    hideCompleted,
    highlightedColorId,
    project.cells,
    project.width,
    region,
    startX,
    startY,
    width,
    widthPx,
    heightPx,
  ]);

  function resolveCanvasPoint(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const localX = Math.floor(((event.clientX - rect.left) / rect.width) * width);
    const localY = Math.floor(((event.clientY - rect.top) / rect.height) * height);
    if (localX < 0 || localY < 0 || localX >= width || localY >= height) return null;
    return { x: startX + localX, y: startY + localY };
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) return;
    const point = resolveCanvasPoint(event);
    if (!point) return;
    if (onToggleCell) onToggleCell(point.y * project.width + point.x);
    else onNavigate?.(point.x, point.y);
  }

  return (
    <canvas
      ref={canvasRef}
      className={`maker-pattern-canvas${onToggleCell ? " is-interactive" : ""}`}
      aria-label={onToggleCell ? "当前豆板制作画布" : "拼豆图纸缩略图"}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    />
  );
}

function ProgressRow({
  label,
  progress,
}: {
  label: string;
  progress: { completed: number; total: number; percentage: number };
}) {
  return (
    <div className="maker-progress-row">
      <div>
        <span>{label}</span>
        <strong>
          {progress.completed}/{progress.total}
        </strong>
      </div>
      <div className="maker-progress-track" aria-label={`${label}进度 ${progress.percentage}%`}>
        <span style={{ width: `${progress.percentage}%` }} />
      </div>
      <small>{progress.percentage}%</small>
    </div>
  );
}

function makeBoardRegions(project: BeadProject): BoardRegion[] {
  const boardWidth = Math.max(1, project.boardSettings.boardWidth || project.width);
  const boardHeight = Math.max(1, project.boardSettings.boardHeight || project.height);
  const columns = Math.ceil(project.width / boardWidth);
  const rows = Math.ceil(project.height / boardHeight);
  const regions: BoardRegion[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const startX = column * boardWidth;
      const startY = row * boardHeight;
      regions.push({
        index: regions.length,
        row,
        column,
        startX,
        startY,
        width: Math.min(boardWidth, project.width - startX),
        height: Math.min(boardHeight, project.height - startY),
      });
    }
  }
  return regions;
}

function summarizeProgress(
  project: BeadProject,
  completedCells: Set<number>,
  region?: BoardRegion,
): { completed: number; total: number; percentage: number } {
  let total = 0;
  let completed = 0;
  const startX = region?.startX ?? 0;
  const startY = region?.startY ?? 0;
  const width = region?.width ?? project.width;
  const height = region?.height ?? project.height;
  for (let y = startY; y < startY + height; y += 1) {
    for (let x = startX; x < startX + width; x += 1) {
      const index = y * project.width + x;
      if (!project.cells[index]) continue;
      total += 1;
      if (completedCells.has(index)) completed += 1;
    }
  }
  return {
    completed,
    total,
    percentage: total === 0 ? 100 : Math.round((completed / total) * 100),
  };
}

function miniMapCellSize(project: BeadProject): number {
  return Math.max(2, Math.min(7, Math.floor(210 / Math.max(project.width, project.height))));
}
