import { describe, expect, it } from "vitest";
import { WORLD_CHART_NODES } from "../../src/world/WorldGameplayLocations";
import { WORLD_ATLAS, worldPointToAtlas, atlasPointToWorld, atlasClientPoint, clampAtlasView, fullAtlasView, zoomAtlasView } from "../../src/world/WorldAtlasProjection";

describe("static atlas projection", () => {
  it("roundtrips every authored chart POI through the raster's one projection", () => {
    for (const node of WORLD_CHART_NODES) {
      const at = worldPointToAtlas(node.position);
      expect(at.x).toBeGreaterThanOrEqual(WORLD_ATLAS.padding);
      expect(at.x).toBeLessThanOrEqual(WORLD_ATLAS.width - WORLD_ATLAS.padding);
      const world = atlasPointToWorld(at)!;
      expect(world.x, node.id).toBeCloseTo(node.position.x, 9);
      expect(world.z, node.id).toBeCloseTo(node.position.z, 9);
    }
  });
  it("covers all world corners without the old chart edge clipping", () => {
    const { minX, maxX, minZ, maxZ } = WORLD_ATLAS.bounds;
    for (const x of [minX, maxX]) for (const z of [minZ, maxZ]) {
      const at = worldPointToAtlas({ x, z });
      const world = atlasPointToWorld(at)!;
      expect(world).not.toBeNull();
      expect(world.x).toBeCloseTo(x, 9);
      expect(world.z).toBeCloseTo(z, 9);
    }
    expect(atlasPointToWorld({ x: 0, y: 0 })).toBeNull();
    expect(atlasPointToWorld({ x: 1000, y: WORLD_ATLAS.height })).toBeNull();
  });
  it.each([{ width: 1200, height: 400 }, { width: 400, height: 800 }])("inverts centered meet letterboxing for $width × $height", ({ width, height }) => {
    const view = zoomAtlasView(fullAtlasView(), 0.5);
    const rect = { left: 20, top: 35, width, height };
    const point = worldPointToAtlas({ x: 500, z: 0 });
    const scale = Math.min(width / view.width, height / view.height);
    const client = { x: rect.left + (width - view.width * scale) / 2 + (point.x - view.x) * scale,
      y: rect.top + (height - view.height * scale) / 2 + (point.y - view.y) * scale };
    const result = atlasClientPoint(client, rect, view)!;
    expect(result.x).toBeCloseTo(point.x, 9);
    expect(result.y).toBeCloseTo(point.y, 9);
    expect(atlasClientPoint({ x: 20, y: 35 }, rect, view)).toBeNull();
  });
  it("keeps cursor anchored when zooming away from bounds and clamps panning/zoom", () => {
    const view = fullAtlasView();
    const anchor = { x: 650, y: 420 };
    const zoom = zoomAtlasView(view, 0.5, anchor);
    expect((anchor.x - zoom.x) / zoom.width).toBeCloseTo(anchor.x / view.width, 9);
    expect((anchor.y - zoom.y) / zoom.height).toBeCloseTo(anchor.y / view.height, 9);
    expect(clampAtlasView({ x: -100, y: -200, width: 1, height: 1 })).toEqual({ x: 0, y: 0, width: 160, height: 160 * WORLD_ATLAS.aspect });
    expect(zoomAtlasView(zoom, 100)).toEqual(fullAtlasView());
    const edge = clampAtlasView({ x: 9999, y: 9999, width: 250, height: 1 });
    expect(edge.x + edge.width).toBeCloseTo(WORLD_ATLAS.width);
    expect(edge.y + edge.height).toBeCloseTo(WORLD_ATLAS.height);
    expect(atlasClientPoint({ x: 0, y: 0 }, { left: 0, top: 0, width: 0, height: 0 }, view)).toBeNull();
  });
});
