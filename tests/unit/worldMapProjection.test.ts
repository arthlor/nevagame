import { describe, expect, it } from "vitest";
import {
  WORLD_LAYOUT_V5,
  WORLD_REGIONAL_PATHS,
  WORLD_ROUTES
} from "../../src/world/WorldLayout";
import {
  WORLD_MAP_PROJECTION,
  worldPointToMapSvg,
  worldRouteToMapSvgPath
} from "../../src/world/WorldMapProjection";

describe("WorldMapProjection", () => {
  it("projects canonical route points and player positions through one transform", () => {
    const playerPosition = WORLD_LAYOUT_V5.anchors.playerSpawn;
    const playerMapPosition = worldPointToMapSvg(playerPosition);
    expect(playerMapPosition).toEqual({
      x: WORLD_MAP_PROJECTION.originX + playerPosition.x * WORLD_MAP_PROJECTION.scaleX,
      y: WORLD_MAP_PROJECTION.originY + playerPosition.z * WORLD_MAP_PROJECTION.scaleZ
    });

    const arterial = WORLD_ROUTES[0];
    const projectedPath = worldRouteToMapSvgPath(WORLD_REGIONAL_PATHS[0]);
    const projectedStart = worldPointToMapSvg(WORLD_REGIONAL_PATHS[0][0]);
    const projectedEnd = worldPointToMapSvg(WORLD_REGIONAL_PATHS[0].at(-1)!);
    expect(projectedPath.startsWith(`M ${projectedStart.x.toFixed(2)},${projectedStart.y.toFixed(2)}`)).toBe(true);
    expect(projectedPath.endsWith(`L ${projectedEnd.x.toFixed(2)},${projectedEnd.y.toFixed(2)}`)).toBe(true);
    expect(WORLD_REGIONAL_PATHS[0][0]).toEqual(arterial.points[0]);
    expect(WORLD_REGIONAL_PATHS[0].some((point) =>
      Math.abs(point.x - WORLD_LAYOUT_V5.anchors.bridge.x) < 0.0001 &&
      Math.abs(point.z - WORLD_LAYOUT_V5.anchors.bridge.z) < 0.0001
    )).toBe(true);
    expect(projectedPath).not.toContain("480,120 Q 420,300");
  });

  it("clamps geographic nodes and offshore player positions to the SVG frame", () => {
    const projected = worldPointToMapSvg({ x: 1000, z: 1000 });
    expect(projected).toEqual({
      x: WORLD_MAP_PROJECTION.maxX,
      y: WORLD_MAP_PROJECTION.maxY
    });
    const origin = worldPointToMapSvg({ x: 0, z: 0 });
    expect(origin).toEqual({
      x: WORLD_MAP_PROJECTION.originX,
      y: WORLD_MAP_PROJECTION.originY
    });
  });
});
