import { paletteVersion } from "./palette";
import type { BeadLayer, BeadProject } from "./types";

export const autosaveKey = "perler-beads-generator:draft";

export function createProject(
  width = 52,
  height = 52,
  name = "Untitled Pattern",
): BeadProject {
  const now = new Date().toISOString();
  const cells = emptyCells(width, height);
  return {
    version: "1.0.0",
    name,
    width,
    height,
    activeBrand: "MARD",
    paletteVersion,
    cells,
    layers: [
      {
        id: "base",
        name: "Pattern",
        customName: false,
        visible: true,
        locked: false,
        includeInUsage: true,
        opacity: 1,
        cells,
      },
    ],
    activeLayerId: "base",
    settings: {
      showGrid: true,
      showCoordinates: true,
      showPegboardBoundaries: true,
      showLayerOverlap: false,
      showActiveLayerOnly: false,
      showColorCodes: false,
      beadDisplayMode: "bead",
      beadsPerPack: 500,
      rightClickAction: "pan",
    },
    boardSettings: {
      boardWidth: 52,
      boardHeight: 52,
      showBoardIds: true,
    },
    makerState: {
      activeBoardIndex: 0,
      completedCells: [],
    },
    conversionSettings: {
      width: 52,
      maxColors: 24,
      paletteMode: "221",
      backgroundMode: "keep",
      backgroundColor: [255, 255, 255],
      tolerance: 32,
      speckleReduction: 0,
      detailLevel: 60,
      dither: false,
      clusterStrength: 1,
      maxColorBlocks: 1200,
      minColorBlockSize: 1,
      sourceBrightness: 0,
      sourceContrast: 0,
      generationStyle: "cartoon",
    },
    referenceSettings: {
      visible: false,
      opacity: 0.35,
      scale: 1,
      offset: { x: 0, y: 0 },
      placement: "below",
    },
    createdAt: now,
    updatedAt: now,
  };
}

export function withCells(
  project: BeadProject,
  cells: Array<string | null>,
  width = project.width,
  height = project.height,
): BeadProject {
  const normalizedCells = normalizeCells(cells, width, height);
  const layers = normalizeLayers(project, width, height).map((layer) =>
    layer.id === project.activeLayerId && !layer.locked
      ? { ...layer, cells: normalizedCells }
      : layer,
  );
  const nextCells = composeVisibleCells(layers, width, height);
  return {
    ...project,
    width,
    height,
    cells: nextCells,
    layers,
    makerState: normalizeMakerState(
      project.makerState,
      nextCells,
      width,
      height,
      project.boardSettings,
    ),
    updatedAt: new Date().toISOString(),
  };
}

export function createLayer(
  width: number,
  height: number,
  name: string,
): BeadLayer {
  return {
    id: `layer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    customName: false,
    visible: true,
    locked: false,
    includeInUsage: true,
    opacity: 1,
    cells: emptyCells(width, height),
  };
}

export function withLayers(
  project: BeadProject,
  layers: BeadLayer[],
  activeLayerId = project.activeLayerId,
): BeadProject {
  const normalizedLayers = normalizeLayers(
    { ...project, layers },
    project.width,
    project.height,
  );
  const nextActiveLayerId = normalizedLayers.some(
    (layer) => layer.id === activeLayerId,
  )
    ? activeLayerId
    : (normalizedLayers[0]?.id ?? "base");
  const nextCells = composeVisibleCells(
    normalizedLayers,
    project.width,
    project.height,
  );
  return {
    ...project,
    layers: normalizedLayers,
    activeLayerId: nextActiveLayerId,
    cells: nextCells,
    makerState: normalizeMakerState(
      project.makerState,
      nextCells,
      project.width,
      project.height,
      project.boardSettings,
    ),
    updatedAt: new Date().toISOString(),
  };
}

export function composeVisibleCells(
  layers: BeadLayer[],
  width: number,
  height: number,
): Array<string | null> {
  const result = emptyCells(width, height);
  for (const layer of layers) {
    if (!layer.visible) continue;
    const cells = normalizeCells(layer.cells, width, height);
    cells.forEach((cell, index) => {
      if (cell) result[index] = cell;
    });
  }
  return result;
}

export function normalizeProject(project: BeadProject): BeadProject {
  const width = Number.isFinite(project.width) ? project.width : 29;
  const height = Number.isFinite(project.height) ? project.height : 29;
  const fallback = createProject(width, height, project.name);
  const settings = {
    ...fallback.settings,
    ...project.settings,
    showColorCodes: Boolean(
      project.settings?.showColorCodes ||
      project.settings?.beadDisplayMode === "print",
    ),
    beadDisplayMode:
      project.settings?.beadDisplayMode === "pixel" ? "pixel" : "bead",
  } satisfies BeadProject["settings"];
  const layers = normalizeLayers(
    {
      ...fallback,
      ...project,
      settings,
      boardSettings: { ...fallback.boardSettings, ...project.boardSettings },
      layers: project.layers?.length ? project.layers : fallback.layers,
    },
    width,
    height,
  );
  const boardSettings = { ...fallback.boardSettings, ...project.boardSettings };
  const composedCells = composeVisibleCells(layers, width, height);
  const conversionSettings = {
    ...fallback.conversionSettings,
    ...project.conversionSettings,
    backgroundColor:
      project.conversionSettings?.backgroundColor ??
      fallback.conversionSettings.backgroundColor,
    detailLevel: normalizeConversionNumber(
      project.conversionSettings?.detailLevel,
      0,
      100,
      fallback.conversionSettings.detailLevel,
    ),
    dither: Boolean(project.conversionSettings?.dither),
    speckleReduction: normalizeConversionNumber(
      project.conversionSettings?.speckleReduction,
      0,
      4,
      fallback.conversionSettings.speckleReduction,
    ),
    clusterStrength: normalizeConversionNumber(
      project.conversionSettings?.clusterStrength,
      0,
      4,
      fallback.conversionSettings.clusterStrength,
    ),
    maxColorBlocks: normalizeConversionNumber(
      project.conversionSettings?.maxColorBlocks,
      1,
      5000,
      fallback.conversionSettings.maxColorBlocks,
    ),
    minColorBlockSize: normalizeConversionNumber(
      project.conversionSettings?.minColorBlockSize,
      1,
      500,
      fallback.conversionSettings.minColorBlockSize,
    ),
    sourceBrightness: normalizeConversionNumber(
      project.conversionSettings?.sourceBrightness,
      -50,
      50,
      fallback.conversionSettings.sourceBrightness,
    ),
    sourceContrast: normalizeConversionNumber(
      project.conversionSettings?.sourceContrast,
      -50,
      50,
      fallback.conversionSettings.sourceContrast,
    ),
  } satisfies BeadProject["conversionSettings"];
  return {
    ...fallback,
    ...project,
    width,
    height,
    activeBrand: "MARD",
    settings,
    boardSettings,
    makerState: normalizeMakerState(
      project.makerState,
      composedCells,
      width,
      height,
      boardSettings,
    ),
    conversionSettings,
    referenceSettings: {
      ...fallback.referenceSettings,
      ...project.referenceSettings,
      offset: {
        ...fallback.referenceSettings.offset,
        ...project.referenceSettings?.offset,
      },
    },
    layers,
    activeLayerId: layers.some((layer) => layer.id === project.activeLayerId)
      ? project.activeLayerId
      : layers[0].id,
    cells: composedCells,
  };
}

function normalizeMakerState(
  makerState: BeadProject["makerState"] | undefined,
  cells: Array<string | null>,
  width: number,
  height: number,
  boardSettings: BeadProject["boardSettings"],
): BeadProject["makerState"] {
  return {
    activeBoardIndex: normalizeMakerBoardIndex(
      makerState?.activeBoardIndex,
      width,
      height,
      boardSettings.boardWidth,
      boardSettings.boardHeight,
    ),
    completedCells: normalizeCompletedCells(
      makerState?.completedCells,
      cells,
      width,
      height,
    ),
  };
}

function normalizeMakerBoardIndex(
  value: number | undefined,
  width: number,
  height: number,
  boardWidth: number,
  boardHeight: number,
): number {
  const safeBoardWidth = Math.max(1, Math.round(boardWidth));
  const safeBoardHeight = Math.max(1, Math.round(boardHeight));
  const boardCount = Math.max(
    1,
    Math.ceil(width / safeBoardWidth) * Math.ceil(height / safeBoardHeight),
  );
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.min(boardCount - 1, Math.max(0, Math.round(value)));
}

function normalizeCompletedCells(
  values: number[] | undefined,
  cells: Array<string | null> | undefined,
  width: number,
  height: number,
): number[] {
  if (!Array.isArray(values)) return [];
  const sourceCells = normalizeCells(cells ?? [], width, height);
  const seen = new Set<number>();
  values.forEach((value) => {
    if (!Number.isInteger(value) || value < 0 || value >= sourceCells.length) return;
    if (!sourceCells[value]) return;
    seen.add(value);
  });
  return [...seen].sort((left, right) => left - right);
}

function normalizeConversionNumber(
  value: number | undefined,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  if (!Number.isFinite(value) || value === undefined || value < minimum)
    return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

function normalizeLayers(
  project: BeadProject,
  width: number,
  height: number,
): BeadLayer[] {
  const legacyCells = normalizeCells(project.cells, width, height);
  const sourceLayers = project.layers?.length
    ? project.layers
    : createProject(width, height).layers;
  return sourceLayers.map((layer, index) => ({
    ...layer,
    customName: Boolean(layer.customName),
    cells: normalizeCells(
      layer.cells ?? (index === 0 ? legacyCells : []),
      width,
      height,
    ),
  }));
}

function normalizeCells(
  cells: Array<string | null> | undefined,
  width: number,
  height: number,
): Array<string | null> {
  const length = width * height;
  const next = Array.from({ length }, (_, index) => cells?.[index] ?? null);
  return next;
}

function emptyCells(width: number, height: number): Array<string | null> {
  return Array.from({ length: width * height }, () => null);
}

export function saveDraft(project: BeadProject): void {
  localStorage.setItem(autosaveKey, JSON.stringify(project));
}

export function loadDraft(): BeadProject | null {
  try {
    const raw = localStorage.getItem(autosaveKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BeadProject;
    if (!parsed.width || !parsed.height || !Array.isArray(parsed.cells))
      return null;
    return normalizeProject(parsed);
  } catch {
    localStorage.removeItem(autosaveKey);
    return null;
  }
}
