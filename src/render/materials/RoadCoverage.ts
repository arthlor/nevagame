import type { VisualRenderConfig } from "../config/VisualRenderConfig";
import { groundPolygonCellAt } from "./GroundPolygonCells";

type RoadEdgeConfig = Pick<
  VisualRenderConfig["roadSurface"],
  "polygonEdgeCellScaleMeters" | "polygonJaggedStrength" | "edgeFadeStart" | "edgeFadeFull"
>;

const EDGE_SIGNAL_WEIGHT = 0.55;
const EDGE_DISTANCE_OFFSET = 0.16;
const EDGE_DITHER_CELLS_PER_METER = 16;
const EDGE_DITHER_OFFSET = 3.1;
const EDGE_DITHER_STRENGTH = 0.3;
const EDGE_ANTIALIAS_MAX = 0.12;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(start: number, end: number, value: number): number {
  const t = clamp01((value - start) / Math.max(0.0001, end - start));
  return t * t * (3 - 2 * t);
}

/**
 * The road shader and meadow exclusion use the same metre-scale coverage
 * field. Camera-pixel derivatives and fine dither stay in the road shader;
 * sampling those at half-metre exclusion texels would alias into bare squares.
 */
export function roadCoverageAt(x: number, z: number, opacity: number, config: RoadEdgeConfig): number {
  if (opacity <= 0) return 0;
  if (opacity >= 1) return 1;
  const cell = groundPolygonCellAt(x, z, config.polygonEdgeCellScaleMeters);
  const edgeBand = 1 - smoothstep(config.edgeFadeFull, 1, opacity);
  const edgeField = clamp01(
    opacity
      + (cell.signal - 0.5) * config.polygonJaggedStrength * EDGE_SIGNAL_WEIGHT * edgeBand
      + (cell.edgeDistance - EDGE_DISTANCE_OFFSET) * config.polygonJaggedStrength * edgeBand
  );
  return smoothstep(config.edgeFadeStart, config.edgeFadeFull, edgeField);
}

export const ROAD_COVERAGE_GLSL = /* glsl */ `
vec4 roadEdgeCell = nevaGroundPolygonCell(vRoadWorldPosition.xz, roadEdgeCellScale);
float roadEdgeSignal = roadEdgeCell.x;
float roadEdgeDistance = roadEdgeCell.w;
float roadEdgeBand = 1.0 - smoothstep(roadEdgeFadeFull, 1.0, vRoadOpacity);
float roadEdgeField = clamp(
  vRoadOpacity
    + (roadEdgeSignal - 0.5) * roadPolygonJaggedStrength * ${EDGE_SIGNAL_WEIGHT} * roadEdgeBand
    + (roadEdgeDistance - ${EDGE_DISTANCE_OFFSET}) * roadPolygonJaggedStrength * roadEdgeBand,
  0.0,
  1.0
);
float roadEdgeAntialias = min(${EDGE_ANTIALIAS_MAX}, fwidth(roadEdgeField));
float roadCoverage = smoothstep(roadEdgeFadeStart - roadEdgeAntialias, roadEdgeFadeFull + roadEdgeAntialias, roadEdgeField);
float roadDither = nevaGroundCellJitter(floor(vRoadWorldPosition.xz * ${EDGE_DITHER_CELLS_PER_METER.toFixed(1)} + ${EDGE_DITHER_OFFSET})).x;
roadCoverage = clamp(roadCoverage + (roadDither - 0.5) * ${EDGE_DITHER_STRENGTH}, 0.0, 1.0);
`;
