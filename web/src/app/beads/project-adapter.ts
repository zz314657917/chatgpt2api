import type {
  BeadProjectDocument,
  BeadProjectSummary,
} from "@/lib/api";

import { normalizeProject } from "./upstream/project";
import type { BeadProject } from "./upstream/types";

export function documentToWorkbenchProject(
  document: BeadProjectDocument,
): BeadProject {
  return normalizeProject({
    version: "1.0.0",
    name: document.name,
    width: document.width,
    height: document.height,
    activeBrand: "MARD",
    paletteVersion: document.palette_version,
    cells: document.cells,
    layers: document.layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      customName: layer.custom_name,
      visible: layer.visible,
      locked: layer.locked,
      includeInUsage: layer.include_in_usage,
      opacity: layer.opacity,
      cells: layer.cells,
    })),
    activeLayerId: document.active_layer_id,
    settings: {
      showGrid: document.editing_settings.show_grid,
      showCoordinates: document.editing_settings.show_coordinates,
      showPegboardBoundaries:
        document.editing_settings.show_pegboard_boundaries,
      showLayerOverlap: document.editing_settings.show_layer_overlap,
      showActiveLayerOnly: document.editing_settings.show_active_layer_only,
      showColorCodes: document.editing_settings.show_color_codes,
      beadDisplayMode: document.editing_settings.bead_display_mode,
      beadsPerPack: document.editing_settings.beads_per_pack,
      rightClickAction: document.editing_settings.right_click_action,
    },
    boardSettings: {
      boardWidth: document.board_settings.board_width,
      boardHeight: document.board_settings.board_height,
      showBoardIds: document.board_settings.show_board_ids,
    },
    makerState: {
      activeBoardIndex: document.maker_state?.active_board_index ?? 0,
      completedCells: document.maker_state?.completed_cells ?? [],
    },
    conversionSettings: {
      width: document.conversion_params.width,
      maxColors: document.conversion_params.max_colors,
      paletteMode: document.conversion_params.palette_mode,
      backgroundMode: document.conversion_params.background_mode,
      backgroundColor: document.conversion_params.background_color,
      tolerance: document.conversion_params.tolerance,
      detailLevel: document.conversion_params.detail_level,
      dither: document.conversion_params.dither,
      speckleReduction: document.conversion_params.speckle_reduction,
      clusterStrength: document.conversion_params.cluster_strength,
      maxColorBlocks: document.conversion_params.max_color_blocks,
      minColorBlockSize: document.conversion_params.min_color_block_size ?? 1,
      sourceBrightness: document.conversion_params.source_brightness,
      sourceContrast: document.conversion_params.source_contrast,
      generationStyle: document.conversion_params.generation_style,
    },
    referenceSettings: {
      visible: document.reference_settings.visible,
      opacity: document.reference_settings.opacity,
      scale: document.reference_settings.scale,
      offset: document.reference_settings.offset,
      placement: document.reference_settings.placement,
    },
    createdAt: document.created_at,
    updatedAt: document.updated_at,
  });
}

export function workbenchProjectToDocument(
  project: BeadProject,
  current: BeadProjectDocument,
): BeadProjectDocument {
  return {
    ...current,
    name: project.name,
    width: project.width,
    height: project.height,
    active_brand: "MARD",
    palette_version: project.paletteVersion,
    cells: project.cells,
    layers: project.layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      custom_name: layer.customName,
      visible: layer.visible,
      locked: layer.locked,
      include_in_usage: layer.includeInUsage,
      opacity: layer.opacity,
      cells: layer.cells,
    })),
    active_layer_id: project.activeLayerId,
    editing_settings: {
      show_grid: project.settings.showGrid,
      show_coordinates: project.settings.showCoordinates,
      show_pegboard_boundaries: project.settings.showPegboardBoundaries,
      show_layer_overlap: project.settings.showLayerOverlap,
      show_active_layer_only: project.settings.showActiveLayerOnly,
      show_color_codes: project.settings.showColorCodes,
      bead_display_mode:
        project.settings.beadDisplayMode === "pixel" ? "pixel" : "bead",
      beads_per_pack: project.settings.beadsPerPack,
      right_click_action: project.settings.rightClickAction,
    },
    board_settings: {
      board_width: project.boardSettings.boardWidth,
      board_height: project.boardSettings.boardHeight,
      show_board_ids: project.boardSettings.showBoardIds,
    },
    maker_state: {
      active_board_index: project.makerState.activeBoardIndex,
      completed_cells: project.makerState.completedCells,
    },
    conversion_params: {
      width: project.conversionSettings.width,
      max_colors: project.conversionSettings.maxColors,
      palette_mode: project.conversionSettings.paletteMode,
      background_mode: project.conversionSettings.backgroundMode,
      background_color: project.conversionSettings.backgroundColor,
      tolerance: project.conversionSettings.tolerance,
      detail_level: project.conversionSettings.detailLevel,
      dither: project.conversionSettings.dither,
      speckle_reduction: project.conversionSettings.speckleReduction,
      cluster_strength: project.conversionSettings.clusterStrength,
      max_color_blocks: project.conversionSettings.maxColorBlocks,
      min_color_block_size: project.conversionSettings.minColorBlockSize,
      source_brightness: project.conversionSettings.sourceBrightness,
      source_contrast: project.conversionSettings.sourceContrast,
      generation_style: project.conversionSettings.generationStyle,
    },
    reference_settings: {
      visible: project.referenceSettings.visible,
      opacity: project.referenceSettings.opacity,
      scale: project.referenceSettings.scale,
      offset: project.referenceSettings.offset,
      placement: project.referenceSettings.placement,
    },
    updated_at: project.updatedAt,
  };
}

export function normalizeProjectSummary(
  summary: BeadProjectSummary,
): BeadProjectSummary {
  const width = Math.max(1, Math.floor(summary.preview?.width || 1));
  const height = Math.max(1, Math.floor(summary.preview?.height || 1));
  return {
    ...summary,
    bead_count: Math.max(0, summary.bead_count || 0),
    preview: {
      width,
      height,
      cells: Array.from(
        { length: width * height },
        (_, index) => summary.preview?.cells?.[index] ?? null,
      ),
    },
  };
}
