import { colorDistance, nearestPaletteColor, palette } from "./palette";
import type {
  ConvertOptions,
  ConvertResult,
  GenerationStyle,
  PaletteColor,
} from "./types";

type StyleProfile = {
  sampleSide: number;
  backgroundThreshold: number;
  dominanceThreshold: number;
  candidateTargetRatio: number;
  candidateDistanceFactor: number;
  postStrengthBias: number;
  useAverageFallback: boolean;
};

type SampledCell = {
  samples: Array<[number, number, number]>;
  average: [number, number, number] | null;
  backgroundShare: number;
};

const styleProfiles: Record<GenerationStyle, StyleProfile> = {
  cartoon: {
    sampleSide: 7,
    backgroundThreshold: 0.72,
    dominanceThreshold: 0.34,
    candidateTargetRatio: 0.58,
    candidateDistanceFactor: 1.35,
    postStrengthBias: 1,
    useAverageFallback: false,
  },
  realistic: {
    sampleSide: 5,
    backgroundThreshold: 0.58,
    dominanceThreshold: 0.26,
    candidateTargetRatio: 0.95,
    candidateDistanceFactor: 0.65,
    postStrengthBias: -1,
    useAverageFallback: true,
  },
};

export async function imageFileToBeads(
  file: File,
  options: ConvertOptions,
): Promise<ConvertResult> {
  const image = await loadImage(file);
  const requestedWidth = Math.min(156, Math.max(1, Math.round(options.width)));
  const requestedHeight = Math.max(
    1,
    Math.round((image.naturalHeight / image.naturalWidth) * requestedWidth),
  );
  const scale = Math.min(1, 156 / requestedHeight);
  const width = Math.max(1, Math.round(requestedWidth * scale));
  const height = Math.min(156, Math.max(1, Math.round(requestedHeight * scale)));
  const sourceWidth = Math.max(1, image.naturalWidth);
  const sourceHeight = Math.max(1, image.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = sourceWidth;
  canvas.height = sourceHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas is not available.");
  context.imageSmoothingEnabled = true;
  context.drawImage(image, 0, 0, sourceWidth, sourceHeight);
  const data = context.getImageData(0, 0, sourceWidth, sourceHeight).data;
  const activePalette = options.palette ?? palette;
  const maxColors = clampColorCount(options.maxColors, activePalette.length);
  const profile = styleProfiles[options.generationStyle ?? "cartoon"];
  const requestedSpeckleStrength = options.speckleReduction ?? 0;
  const speckleStrength =
    requestedSpeckleStrength > 0
      ? clampStrength(requestedSpeckleStrength + profile.postStrengthBias)
      : 0;
  const detailLevel = clampInteger(options.detailLevel, 0, 100, 60);
  const sampleSide = sampleSideForDetail(profile.sampleSide, detailLevel);
  const backgroundColor = adjustSourceRgb(
    estimateBackgroundColor(data, sourceWidth, sourceHeight),
    options.sourceBrightness,
    options.sourceContrast,
  );
  const sampledCells = sampleGridCells(
    data,
    sourceWidth,
    sourceHeight,
    width,
    height,
    options,
    backgroundColor,
    profile,
    speckleStrength,
    sampleSide,
  );
  const ranked = rankPaletteColors(
    sampledCells,
    maxColors,
    activePalette,
    profile,
  );
  const candidates = selectCandidateColors(
    ranked,
    maxColors,
    activePalette,
    options.clusterStrength,
    profile,
  );
  const cells = sampledCells.map((cell, index) =>
    chooseCellColor(
      cell,
      candidates,
      profile,
      Boolean(options.dither),
      index % width,
      Math.floor(index / width),
    ),
  );

  const mergedCells = mergeSimilarColors(
    cells,
    options.clusterStrength,
    candidates,
  );
  const compactCells = reduceTinyRegions(
    mergedCells,
    width,
    height,
    speckleStrength,
    candidates,
  );
  const reducedCells = reduceSpeckles(
    compactCells,
    width,
    height,
    speckleStrength,
    candidates,
  );
  const minimumBlockCells = mergeUndersizedColorBlocks(
    reducedCells,
    width,
    height,
    options.minColorBlockSize,
  );
  const limitedCells = limitColorBlocks(
    minimumBlockCells,
    width,
    height,
    options.maxColorBlocks,
  );
  const colorsUsed = new Set(limitedCells.filter(Boolean)).size;
  const totalBeads = limitedCells.filter(Boolean).length;
  return { width, height, cells: limitedCells, colorsUsed, totalBeads };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load this image."));
    };
    image.src = url;
  });
}

function sampleGridCells(
  data: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
  options: ConvertOptions,
  detectedBackgroundColor: [number, number, number],
  profile: StyleProfile,
  speckleStrength: number,
  sampleSide: number,
): SampledCell[] {
  const cells: SampledCell[] = [];
  const totalSamples = sampleSide * sampleSide;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const samples: Array<[number, number, number]> = [];
      let backgroundCount = 0;
      let r = 0;
      let g = 0;
      let b = 0;

      for (let sy = 0; sy < sampleSide; sy += 1) {
        for (let sx = 0; sx < sampleSide; sx += 1) {
          const sourceX = Math.min(
            sourceWidth - 1,
            Math.max(
              0,
              Math.floor(
                ((x + (sx + 0.5) / sampleSide) / width) * sourceWidth,
              ),
            ),
          );
          const sourceY = Math.min(
            sourceHeight - 1,
            Math.max(
              0,
              Math.floor(
                ((y + (sy + 0.5) / sampleSide) / height) * sourceHeight,
              ),
            ),
          );
          const index = (sourceY * sourceWidth + sourceX) * 4;
          const alpha = data[index + 3];
          const rgb = adjustSourceRgb(
            [data[index], data[index + 1], data[index + 2]],
            options.sourceBrightness,
            options.sourceContrast,
          );
          if (
            isBackgroundSample(alpha, rgb, options, detectedBackgroundColor)
          ) {
            backgroundCount += 1;
            continue;
          }
          const simplified = simplifySourceRgb(rgb, speckleStrength);
          samples.push(simplified);
          r += simplified[0];
          g += simplified[1];
          b += simplified[2];
        }
      }

      cells.push({
        samples,
        average:
          samples.length > 0
            ? [
                Math.round(r / samples.length),
                Math.round(g / samples.length),
                Math.round(b / samples.length),
              ]
            : null,
        backgroundShare: backgroundCount / totalSamples,
      });
    }
  }
  return cells;
}

function rankPaletteColors(
  sampledCells: SampledCell[],
  maxColors: number,
  activePalette: PaletteColor[],
  profile: StyleProfile,
): Array<{ color: PaletteColor; count: number; score: number }> {
  const counts = new Map<string, { color: PaletteColor; count: number }>();
  let total = 0;
  sampledCells.forEach((cell) => {
    if (
      cell.backgroundShare >= profile.backgroundThreshold ||
      cell.samples.length === 0
    )
      return;
    cell.samples.forEach((rgb) => {
      total += 1;
      const color = nearestPaletteColor(rgb, activePalette);
      const bucket = counts.get(color.id) ?? { color, count: 0 };
      bucket.count += 1;
      counts.set(color.id, bucket);
    });
  });
  const rows = [...counts.values()]
    .map((entry) => {
      const chroma = colorChroma(entry.color.rgb);
      const share = total > 0 ? entry.count / total : 0;
      const lightness = luminance(entry.color.rgb);
      const accentBoost = chroma > 48 ? 2.25 : chroma > 28 ? 1.4 : 1;
      const minorityAccentBoost = chroma > 58 && share < 0.018 ? 2.45 : 1;
      const darkLineBoost = lightness < 48 ? 1.55 : 1;
      const lightNeutralPenalty = lightness > 210 && chroma < 22 ? 0.82 : 1;
      return {
        ...entry,
        score:
          entry.count *
          accentBoost *
          minorityAccentBoost *
          darkLineBoost *
          lightNeutralPenalty,
      };
    })
    .sort((a, b) => b.score - a.score || b.count - a.count);
  return rows.length > 0
    ? rows
    : activePalette
        .slice(0, maxColors)
        .map((color) => ({ color, count: 1, score: 1 }));
}

function clampColorCount(value: number, paletteSize: number): number {
  const requested = Number.isFinite(value) ? Math.round(value) : 2;
  return Math.min(paletteSize, Math.max(2, requested));
}

function selectCandidateColors(
  ranked: Array<{ color: PaletteColor; count: number; score: number }>,
  maxColors: number,
  activePalette: PaletteColor[],
  strength: number,
  profile: StyleProfile,
): PaletteColor[] {
  const level = Math.max(0, Math.min(4, Math.round(strength)));
  const selected: PaletteColor[] = [];
  const selectedIds = new Set<string>();
  const add = (color: PaletteColor, allowSimilar = false) => {
    if (selectedIds.has(color.id) || selected.length >= maxColors) return false;
    if (!allowSimilar && selected.length > 0) {
      const chroma = colorChroma(color.rgb);
      const baseThreshold = luminance(color.rgb) < 48 || chroma > 58 ? 18 : 34;
      const threshold =
        (baseThreshold + level * (chroma > 58 ? 3 : 7)) *
        profile.candidateDistanceFactor;
      const nearestDistance = Math.min(
        ...selected.map((item) => colorDistance(color.rgb, item.rgb)),
      );
      if (nearestDistance < threshold) return false;
    }
    selected.push(color);
    selectedIds.add(color.id);
    return true;
  };

  const chooseDiverseUntil = (targetCount: number) => {
    while (selected.length < Math.min(maxColors, targetCount)) {
      const choices = ranked
        .filter((entry) => !selectedIds.has(entry.color.id))
        .map((entry) => ({
          entry,
          diversityScore: candidateDiversityScore(entry, selected),
        }))
        .sort((a, b) => b.diversityScore - a.diversityScore);
      const added = choices.some((choice) => add(choice.entry.color));
      if (!added) break;
    }
  };

  const sortedByCount = [...ranked].sort((a, b) => b.count - a.count);
  sortedByCount.forEach((entry) => {
    if (selected.length < Math.ceil(maxColors * 0.28)) add(entry.color);
  });

  const protectedFeatureSlots = Math.max(
    2,
    Math.ceil(maxColors * (profile.useAverageFallback ? 0.28 : 0.22)),
  );
  const featureCandidates = ranked
    .filter((entry) => isFeatureColor(entry.color, entry.count, ranked))
    .map((entry) => ({
      entry,
      featureScore: featureColorScore(entry, selected),
    }))
    .sort((a, b) => b.featureScore - a.featureScore);

  featureCandidates.forEach((choice) => {
    if (
      selected.length < maxColors &&
      selected.filter((color) => isFeaturePaletteColor(color)).length <
        protectedFeatureSlots
    ) {
      add(
        choice.entry.color,
        shouldAllowFeatureSimilarity(choice.entry.color, selected),
      );
    }
  });

  ranked
    .filter((entry) => isFeaturePaletteColor(entry.color))
    .forEach((entry) =>
      add(entry.color, shouldAllowFeatureSimilarity(entry.color, selected)),
    );
  chooseDiverseUntil(Math.ceil(maxColors * profile.candidateTargetRatio));
  ranked.forEach((entry) => add(entry.color));
  if (profile.useAverageFallback || selected.length < Math.min(6, maxColors)) {
    ranked.forEach((entry) => add(entry.color, true));
  }

  return selected.length > 0 ? selected : activePalette.slice(0, maxColors);
}

function isFeatureColor(
  color: PaletteColor,
  count: number,
  ranked: Array<{ color: PaletteColor; count: number; score: number }>,
): boolean {
  const maxCount = Math.max(1, ranked[0]?.count ?? 1);
  const shareOfLargest = count / maxCount;
  const chroma = colorChroma(color.rgb);
  const lightness = luminance(color.rgb);
  if (chroma > 70 && shareOfLargest > 0.002) return true;
  if (chroma > 52 && shareOfLargest > 0.006) return true;
  if (lightness < 36 && shareOfLargest > 0.003) return true;
  return false;
}

function isFeaturePaletteColor(color: PaletteColor): boolean {
  return colorChroma(color.rgb) > 48 || luminance(color.rgb) < 45;
}

function shouldAllowFeatureSimilarity(
  color: PaletteColor,
  selected: PaletteColor[],
): boolean {
  if (selected.length === 0) return false;
  const nearestDistance = Math.min(
    ...selected.map((item) => colorDistance(color.rgb, item.rgb)),
  );
  const chroma = colorChroma(color.rgb);
  return chroma > 68 && nearestDistance > 14;
}

function featureColorScore(
  entry: { color: PaletteColor; count: number; score: number },
  selected: PaletteColor[],
): number {
  const chroma = colorChroma(entry.color.rgb);
  const lightness = luminance(entry.color.rgb);
  const selectedDistance =
    selected.length > 0
      ? Math.min(
          ...selected.map((color) => colorDistance(entry.color.rgb, color.rgb)),
        )
      : 90;
  const saturationBoost = 1 + Math.min(3.2, chroma / 34);
  const contrastBoost = lightness < 42 ? 1.8 : 1;
  const differenceBoost = Math.max(0.8, Math.min(4.5, selectedDistance / 22));
  return (
    Math.sqrt(Math.max(1, entry.count)) *
    saturationBoost *
    contrastBoost *
    differenceBoost
  );
}

function candidateDiversityScore(
  entry: { color: PaletteColor; count: number; score: number },
  selected: PaletteColor[],
): number {
  if (selected.length === 0) return entry.score;
  const distance = Math.min(
    ...selected.map((color) => colorDistance(entry.color.rgb, color.rgb)),
  );
  const chroma = colorChroma(entry.color.rgb);
  const lightness = luminance(entry.color.rgb);
  const distinctBoost = Math.max(0.35, Math.min(5.4, (distance / 26) ** 1.55));
  const featureBoost =
    chroma > 58 || lightness < 48 ? 2.15 : chroma > 34 ? 1.36 : 1;
  const countSignal = Math.sqrt(Math.max(1, entry.count));
  return countSignal * distinctBoost * featureBoost;
}

function chooseCellColor(
  cell: SampledCell,
  candidates: PaletteColor[],
  profile: StyleProfile,
  dither: boolean,
  x: number,
  y: number,
): string | null {
  if (
    cell.backgroundShare >= profile.backgroundThreshold ||
    cell.samples.length === 0
  )
    return null;
  const counts = new Map<string, { color: PaletteColor; count: number }>();
  cell.samples.forEach((rgb) => {
    const color = nearestPaletteColor(
      dither ? applyOrderedDither(rgb, x, y) : rgb,
      candidates,
    );
    const bucket = counts.get(color.id) ?? { color, count: 0 };
    bucket.count += 1;
    counts.set(color.id, bucket);
  });
  const ranked = [...counts.values()].sort((a, b) => b.count - a.count);
  const primary = ranked[0];
  if (!primary) return null;
  const primaryShare = primary.count / cell.samples.length;
  if (
    primaryShare >= profile.dominanceThreshold ||
    !profile.useAverageFallback ||
    !cell.average
  ) {
    return primary.color.id;
  }
  return nearestPaletteColor(
    dither ? applyOrderedDither(cell.average, x, y) : cell.average,
    candidates,
  ).id;
}

type ColorBlock = {
  cells: number[];
  colorId: string;
  neighbors: Map<number, number>;
};

type ColorBlockCollection = {
  blocks: ColorBlock[];
  blockIndexByCell: Int32Array;
};

function mergeUndersizedColorBlocks(
  cells: Array<string | null>,
  width: number,
  height: number,
  requestedMinimum: number | undefined,
): Array<string | null> {
  const minimum = clampInteger(requestedMinimum, 1, 500, 1);
  if (minimum <= 1) return cells;
  const next = cells.slice();
  for (let pass = 0; pass < Math.min(128, minimum); pass += 1) {
    const { blocks } = collectColorBlocks(next, width, height);
    const targets = new Map<number, number>();
    blocks.forEach((source, sourceIndex) => {
      if (source.cells.length >= minimum) return;
      const target = [...source.neighbors.entries()]
        .map(([index, borderCount]) => ({
          index,
          borderCount,
          block: blocks[index],
        }))
        .filter(
          (candidate) =>
            candidate.block.cells.length > source.cells.length ||
            (candidate.block.cells.length === source.cells.length &&
              candidate.index < sourceIndex),
        )
        .sort(
          (a, b) =>
            b.borderCount - a.borderCount ||
            b.block.cells.length - a.block.cells.length ||
            a.index - b.index,
        )[0];
      if (target) targets.set(sourceIndex, target.index);
    });
    if (targets.size === 0) return next;
    const resolveColor = (index: number): string => {
      const target = targets.get(index);
      return target === undefined
        ? blocks[index].colorId
        : resolveColor(target);
    };
    targets.forEach((_, sourceIndex) => {
      const replacement = resolveColor(sourceIndex);
      blocks[sourceIndex].cells.forEach((cellIndex) => {
        next[cellIndex] = replacement;
      });
    });
  }
  return next;
}

function limitColorBlocks(
  cells: Array<string | null>,
  width: number,
  height: number,
  requestedLimit: number,
): Array<string | null> {
  const limit = clampInteger(requestedLimit, 1, 5000, 1200);
  const next = cells.slice();
  for (let pass = 0; pass < 64; pass += 1) {
    const { blocks } = collectColorBlocks(next, width, height);
    if (blocks.length <= limit) return next;
    const targets = new Map<number, number>();
    const requiredMerges = blocks.length - limit;
    const ordered = blocks
      .map((block, index) => ({ block, index }))
      .sort(
        (a, b) =>
          a.block.cells.length - b.block.cells.length || a.index - b.index,
      );
    for (const source of ordered) {
      if (targets.size >= requiredMerges) break;
      const target = [...source.block.neighbors.entries()]
        .map(([index, borderCount]) => ({
          index,
          borderCount,
          block: blocks[index],
        }))
        .filter(
          (candidate) =>
            candidate.block.cells.length > source.block.cells.length ||
            (candidate.block.cells.length === source.block.cells.length &&
              candidate.index < source.index),
        )
        .sort(
          (a, b) =>
            b.block.cells.length - a.block.cells.length ||
            b.borderCount - a.borderCount ||
            a.index - b.index,
        )[0];
      if (target) targets.set(source.index, target.index);
    }
    if (targets.size === 0) return next;
    const resolveColor = (index: number): string => {
      const target = targets.get(index);
      return target === undefined
        ? blocks[index].colorId
        : resolveColor(target);
    };
    targets.forEach((_, sourceIndex) => {
      const replacement = resolveColor(sourceIndex);
      blocks[sourceIndex].cells.forEach((cellIndex) => {
        next[cellIndex] = replacement;
      });
    });
  }
  return next;
}

function collectColorBlocks(
  cells: Array<string | null>,
  width: number,
  height: number,
): ColorBlockCollection {
  const blocks: ColorBlock[] = [];
  const visited = new Uint8Array(cells.length);
  const blockIndexByCell = new Int32Array(cells.length).fill(-1);
  const offsets = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;
  for (let start = 0; start < cells.length; start += 1) {
    const colorId = cells[start];
    if (!colorId || visited[start]) continue;
    const blockIndex = blocks.length;
    const block: ColorBlock = {
      cells: [],
      colorId,
      neighbors: new Map<number, number>(),
    };
    const queue = [start];
    visited[start] = 1;
    blockIndexByCell[start] = blockIndex;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor];
      block.cells.push(index);
      const x = index % width;
      const y = Math.floor(index / width);
      offsets.forEach(([dx, dy]) => {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) return;
        const neighborIndex = ny * width + nx;
        const neighborColor = cells[neighborIndex];
        if (neighborColor === colorId && !visited[neighborIndex]) {
          visited[neighborIndex] = 1;
          blockIndexByCell[neighborIndex] = blockIndex;
          queue.push(neighborIndex);
        }
      });
    }
    blocks.push(block);
  }
  blocks.forEach((block, blockIndex) => {
    block.cells.forEach((index) => {
      const x = index % width;
      const y = Math.floor(index / width);
      offsets.forEach(([dx, dy]) => {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) return;
        const neighborBlockIndex = blockIndexByCell[ny * width + nx];
        if (neighborBlockIndex < 0 || neighborBlockIndex === blockIndex) return;
        block.neighbors.set(
          neighborBlockIndex,
          (block.neighbors.get(neighborBlockIndex) ?? 0) + 1,
        );
      });
    });
  });
  return { blocks, blockIndexByCell };
}

function reduceSpeckles(
  cells: Array<string | null>,
  width: number,
  height: number,
  strength: number,
  candidates: PaletteColor[],
): Array<string | null> {
  const iterations = Math.max(0, Math.min(4, Math.round(strength)));
  if (iterations === 0) return cells;
  const colorMap = new Map(candidates.map((color) => [color.id, color]));
  let next = cells.slice();
  for (let pass = 0; pass < iterations; pass += 1) {
    const current = next;
    next = current.slice();
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        const colorId = current[index];
        if (!colorId) continue;
        const neighbors = neighborColorIds(current, width, height, x, y);
        const sameCount = neighbors.filter((item) => item === colorId).length;
        const majority = majorityColor(neighbors);
        if (!majority.colorId) continue;
        if (
          !areSimilarColors(
            colorMap.get(colorId),
            colorMap.get(majority.colorId),
            strength,
            false,
          )
        )
          continue;
        const requiredMajority =
          iterations >= 4 ? (pass === 0 ? 3 : 4) : pass === 0 ? 4 : 5;
        const sameLimit =
          iterations >= 4 ? (pass === 0 ? 2 : 1) : pass === 0 ? 1 : 0;
        if (sameCount <= sameLimit && majority.count >= requiredMajority) {
          next[index] = majority.colorId;
        }
      }
    }
  }
  return next;
}

function reduceTinyRegions(
  cells: Array<string | null>,
  width: number,
  height: number,
  strength: number,
  candidates: PaletteColor[],
): Array<string | null> {
  const level = Math.max(0, Math.min(4, Math.round(strength)));
  const maxRegionSize = [0, 1, 2, 5, 9][level];
  if (maxRegionSize <= 0) return cells;
  const colorMap = new Map(candidates.map((color) => [color.id, color]));
  const next = cells.slice();
  const visited = new Uint8Array(cells.length);
  const offsets = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;

  for (let start = 0; start < cells.length; start += 1) {
    const colorId = cells[start];
    if (!colorId || visited[start]) continue;
    const region: number[] = [];
    const borderCounts = new Map<string, number>();
    const queue = [start];
    visited[start] = 1;

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor];
      region.push(index);
      const x = index % width;
      const y = Math.floor(index / width);
      offsets.forEach(([dx, dy]) => {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) return;
        const neighborIndex = ny * width + nx;
        const neighborColorId = cells[neighborIndex];
        if (neighborColorId === colorId && !visited[neighborIndex]) {
          visited[neighborIndex] = 1;
          queue.push(neighborIndex);
          return;
        }
        if (neighborColorId && neighborColorId !== colorId) {
          borderCounts.set(
            neighborColorId,
            (borderCounts.get(neighborColorId) ?? 0) + 1,
          );
        }
      });
    }

    if (region.length > maxRegionSize || borderCounts.size === 0) continue;
    const replacement = [...borderCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .find(([neighborColorId]) =>
        areSimilarColors(
          colorMap.get(colorId),
          colorMap.get(neighborColorId),
          strength,
          true,
        ),
      )?.[0];
    if (!replacement) continue;
    region.forEach((index) => {
      next[index] = replacement;
    });
  }

  return next;
}

function mergeSimilarColors(
  cells: Array<string | null>,
  strength: number,
  candidates: PaletteColor[],
): Array<string | null> {
  const level = Math.max(0, Math.min(4, Math.round(strength)));
  if (level === 0) return cells;
  const colorMap = new Map(candidates.map((color) => [color.id, color]));
  const counts = new Map<string, number>();
  cells.forEach((colorId) => {
    if (!colorId) return;
    counts.set(colorId, (counts.get(colorId) ?? 0) + 1);
  });
  const rows = [...counts.entries()]
    .flatMap(([colorId, count]) => {
      const color = colorMap.get(colorId);
      return color ? [{ colorId, color, count }] : [];
    })
    .sort((a, b) => b.count - a.count);
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const replacements = new Map<string, string>();

  rows.forEach((row, index) => {
    const rare = row.count <= Math.max(3, total * (0.006 + level * 0.003));
    const target = rows
      .slice(0, index)
      .find((candidate) =>
        areSimilarColors(row.color, candidate.color, level, rare),
      );
    if (target)
      replacements.set(
        row.colorId,
        replacements.get(target.colorId) ?? target.colorId,
      );
  });

  if (replacements.size === 0) return cells;
  return cells.map((colorId) =>
    colorId ? (replacements.get(colorId) ?? colorId) : null,
  );
}

function areSimilarColors(
  from: PaletteColor | undefined,
  to: PaletteColor | undefined,
  strength: number,
  rare: boolean,
): boolean {
  if (!from || !to || from.id === to.id) return false;
  const level = Math.max(0, Math.min(4, Math.round(strength)));
  const baseThreshold = [0, 26, 42, 62, 84][level];
  if (baseThreshold <= 0) return false;
  const fromChroma = colorChroma(from.rgb);
  const toChroma = colorChroma(to.rgb);
  const fromLuminance = luminance(from.rgb);
  const toLuminance = luminance(to.rgb);
  const distance = colorDistance(from.rgb, to.rgb);
  const saturationMismatch = Math.abs(fromChroma - toChroma);
  const luminanceMismatch = Math.abs(fromLuminance - toLuminance);
  const bothDark = fromLuminance < 84 && toLuminance < 84;
  const bothLightNeutral =
    fromLuminance > 188 &&
    toLuminance > 188 &&
    fromChroma < 46 &&
    toChroma < 46;
  const bothMuted =
    fromLuminance > 96 && toLuminance > 96 && fromChroma < 82 && toChroma < 82;
  let threshold = baseThreshold * (rare ? 1.45 : 1);
  if (bothDark || bothLightNeutral || bothMuted) threshold *= 1.15;
  if (fromChroma > 78 || toChroma > 78) threshold *= 0.7;
  if (saturationMismatch > 56) threshold *= 0.58;
  if (luminanceMismatch > 86 && !bothDark) threshold *= 0.55;
  return distance <= threshold;
}

function neighborColorIds(
  cells: Array<string | null>,
  width: number,
  height: number,
  x: number,
  y: number,
): Array<string | null> {
  const result: Array<string | null> = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      result.push(cells[ny * width + nx]);
    }
  }
  return result;
}

function majorityColor(colors: Array<string | null>): {
  colorId: string | null;
  count: number;
} {
  const counts = new Map<string, number>();
  colors.forEach((colorId) => {
    if (!colorId) return;
    counts.set(colorId, (counts.get(colorId) ?? 0) + 1);
  });
  return (
    [...counts.entries()]
      .map(([colorId, count]) => ({ colorId, count }))
      .sort((a, b) => b.count - a.count)[0] ?? { colorId: null, count: 0 }
  );
}

function isBackgroundSample(
  alpha: number,
  rgb: [number, number, number],
  options: ConvertOptions,
  detectedBackgroundColor: [number, number, number],
): boolean {
  if (alpha < 24) return true;
  if (options.backgroundMode === "keep") return false;
  const distance = Math.sqrt(
    (rgb[0] - detectedBackgroundColor[0]) ** 2 +
      (rgb[1] - detectedBackgroundColor[1]) ** 2 +
      (rgb[2] - detectedBackgroundColor[2]) ** 2,
  );
  return distance <= options.tolerance;
}

function luminance(rgb: [number, number, number]): number {
  return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
}

function colorChroma(rgb: [number, number, number]): number {
  return Math.max(...rgb) - Math.min(...rgb);
}

function sampleSideForDetail(baseSampleSide: number, detailLevel: number): number {
  const level = clampInteger(detailLevel, 0, 100, 60);
  return Math.max(3, Math.min(9, Math.round(baseSampleSide + (60 - level) / 20)));
}

function adjustSourceRgb(
  rgb: [number, number, number],
  requestedBrightness: number | undefined,
  requestedContrast: number | undefined,
): [number, number, number] {
  const brightness = clampInteger(requestedBrightness, -50, 50, 0) * 2.55;
  const contrast = 1 + clampInteger(requestedContrast, -50, 50, 0) / 100;
  return rgb.map((channel) =>
    Math.max(0, Math.min(255, Math.round((channel - 128) * contrast + 128 + brightness))),
  ) as [number, number, number];
}

function applyOrderedDither(
  rgb: [number, number, number],
  x: number,
  y: number,
): [number, number, number] {
  const bayer4 = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];
  const threshold = bayer4[y % 4]?.[x % 4] ?? 7.5;
  const offset = ((threshold + 0.5) / 16 - 0.5) * 38;
  return rgb.map((channel) =>
    Math.max(0, Math.min(255, Math.round(channel + offset))),
  ) as [number, number, number];
}

function simplifySourceRgb(
  rgb: [number, number, number],
  strength: number,
): [number, number, number] {
  const level = Math.max(0, Math.min(4, Math.round(strength)));
  if (level === 0) return rgb;
  const channelStep = [1, 5, 9, 14, 20][level];
  const neutralThreshold = [0, 8, 14, 20, 28][level];
  const chroma = colorChroma(rgb);
  if (chroma <= neutralThreshold) {
    const value = quantizeChannel(luminance(rgb), channelStep);
    return [value, value, value];
  }
  return [
    quantizeChannel(rgb[0], channelStep),
    quantizeChannel(rgb[1], channelStep),
    quantizeChannel(rgb[2], channelStep),
  ];
}

function quantizeChannel(value: number, step: number): number {
  return Math.max(0, Math.min(255, Math.round(value / step) * step));
}

function clampStrength(value: number): number {
  return Math.max(0, Math.min(4, Math.round(value)));
}

function clampInteger(
  value: number | undefined,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}

function estimateBackgroundColor(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): [number, number, number] {
  const samples: Array<[number, number, number]> = [];
  const maxSamplesPerEdge = 80;
  const xStep = Math.max(1, Math.floor(width / maxSamplesPerEdge));
  const yStep = Math.max(1, Math.floor(height / maxSamplesPerEdge));

  for (let x = 0; x < width; x += xStep) {
    pushOpaqueSample(samples, data, width, x, 0);
    pushOpaqueSample(samples, data, width, x, height - 1);
  }
  for (let y = 0; y < height; y += yStep) {
    pushOpaqueSample(samples, data, width, 0, y);
    pushOpaqueSample(samples, data, width, width - 1, y);
  }

  if (samples.length === 0) return [255, 255, 255];

  const buckets = new Map<
    string,
    { rgb: [number, number, number]; count: number }
  >();
  samples.forEach((rgb) => {
    const key = rgb.map((channel) => Math.round(channel / 16) * 16).join(",");
    const bucket = buckets.get(key) ?? { rgb: [0, 0, 0], count: 0 };
    bucket.rgb[0] += rgb[0];
    bucket.rgb[1] += rgb[1];
    bucket.rgb[2] += rgb[2];
    bucket.count += 1;
    buckets.set(key, bucket);
  });

  const best = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
  return [
    Math.round(best.rgb[0] / best.count),
    Math.round(best.rgb[1] / best.count),
    Math.round(best.rgb[2] / best.count),
  ];
}

function pushOpaqueSample(
  samples: Array<[number, number, number]>,
  data: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
): void {
  const index = (y * width + x) * 4;
  if (data[index + 3] < 24) return;
  samples.push([data[index], data[index + 1], data[index + 2]]);
}
