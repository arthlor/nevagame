import type { WorldPoint } from "./WorldLayout";

export interface MapSvgPoint {
  x: number;
  y: number;
}

/**
 * The map illustration has its own 1000 x 700 SVG frame. Keep this transform
 * explicit and use it for routes, landmark nodes, and the player marker so the
 * map cannot grow a second, approximate road layout.
 */
export const WORLD_MAP_PROJECTION = Object.freeze({
  originX: 250,
  originY: 340,
  scaleX: 1,
  scaleZ: 1.1,
  minX: 50,
  maxX: 950,
  minY: 50,
  maxY: 650
});

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function worldPointToMapSvg(point: WorldPoint): MapSvgPoint {
  return {
    x: clamp(
      WORLD_MAP_PROJECTION.originX + point.x * WORLD_MAP_PROJECTION.scaleX,
      WORLD_MAP_PROJECTION.minX,
      WORLD_MAP_PROJECTION.maxX
    ),
    y: clamp(
      WORLD_MAP_PROJECTION.originY + point.z * WORLD_MAP_PROJECTION.scaleZ,
      WORLD_MAP_PROJECTION.minY,
      WORLD_MAP_PROJECTION.maxY
    )
  };
}

export function worldRouteToMapSvgPath(points: readonly WorldPoint[]): string {
  return points
    .map((point, index) => {
      const mapped = worldPointToMapSvg(point);
      return `${index === 0 ? "M" : "L"} ${mapped.x.toFixed(2)},${mapped.y.toFixed(2)}`;
    })
    .join(" ");
}
