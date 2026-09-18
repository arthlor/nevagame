import { describe, expect, it } from "vitest";
import { createWorldEnvironmentLayout } from "../../src/world/WorldEnvironmentLayout";
import { WorldLayout } from "../../src/world/WorldLayout";
import { NEVA_HEADWATERS } from "../../src/world/NevaHeadwaters";
import { HEADWATER_GRAYBOX_ENVELOPE, HEADWATER_GRAYBOX_VIEWPOINTS } from "../../src/world/HeadwaterWaterfallGraybox";

const GROUP_PREFIX = "authored.headwater.";
const REED_ASSETS = new Set(["foliage_reeds_a", "foliage_cattail_a"]);
const COLLIDING = new Set(["foliage_bush_a", "foliage_bush_round_a", "tree_maple_a", "tree_oak_broadleaf_a"]);

/** The walked pool-bank approach from the W06 traversal contract. */
function walkedCorridor(): Array<{ x: number; z: number }> {
  const points: Array<{ x: number; z: number }> = [];
  for (const z of [-147, -144, -141, -138, -135, -132]) {
    points.push({ x: WorldLayout.riverCenterX(z) + 14, z });
  }
  points.push({ x: WorldLayout.riverCenterX(-129.5) + 6, z: -129.5 });
  points.push({ x: WorldLayout.riverCenterX(-128.5) + 5.5, z: -128.5 });
  return points;
}

function distanceToPolyline(point: { x: number; z: number }, polyline: Array<{ x: number; z: number }>): number {
  let best = Number.POSITIVE_INFINITY;
  for (let index = 1; index < polyline.length; index += 1) {
    const start = polyline[index - 1];
    const end = polyline[index];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const lengthSquared = Math.max(0.0001, dx * dx + dz * dz);
    const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared));
    best = Math.min(best, Math.hypot(point.x - (start.x + dx * t), point.z - (start.z + dz * t)));
  }
  return best;
}

describe("W09 headwater riparian habitat group", () => {
  const layout = createWorldEnvironmentLayout(42);
  const group = layout.staticPlacements.filter((placement) => placement.id.startsWith(GROUP_PREFIX));

  it("composes a dominant reed stand, broadleaf support and outflow logs", () => {
    const reeds = group.filter((placement) => REED_ASSETS.has(placement.assetId));
    const trees = group.filter((placement) => placement.assetId.startsWith("tree_"));
    const logs = group.filter((placement) => placement.assetId === "prop_driftwood_log_a");
    const bushes = group.filter((placement) => placement.assetId.startsWith("foliage_bush"));

    // A cluster, not scatter: the stand reads as one mass at the pool margin,
    // following the west waterline the basin carved.
    expect(reeds.length).toBeGreaterThanOrEqual(6);
    for (const reed of reeds) {
      const section = WorldLayout.riverSectionAt(reed.z);
      const westWaterEdge = section.centerX - section.leftWaterWidth;
      const marginOffset = westWaterEdge - reed.x;
      expect(marginOffset, `${reed.id} sits off the pool margin`).toBeGreaterThan(-1.5);
      expect(marginOffset, `${reed.id} sits off the pool margin`).toBeLessThan(3.2);
    }

    expect(trees.length).toBeGreaterThanOrEqual(3);
    expect(bushes.length).toBeGreaterThanOrEqual(3);
    expect(logs.length).toBeGreaterThanOrEqual(1);
    // Supporting mass on both banks, not one-sided decoration.
    expect(trees.some((tree) => tree.x < -34)).toBe(true);
    expect(trees.some((tree) => tree.x > -18)).toBe(true);
  });

  it("keeps the group inside the declared envelope and out of the water", () => {
    for (const placement of group) {
      expect(
        placement.x >= HEADWATER_GRAYBOX_ENVELOPE.minX && placement.x <= HEADWATER_GRAYBOX_ENVELOPE.maxX,
        placement.id
      ).toBe(true);
      expect(
        placement.z >= HEADWATER_GRAYBOX_ENVELOPE.minZ && placement.z <= HEADWATER_GRAYBOX_ENVELOPE.maxZ,
        placement.id
      ).toBe(true);
      if (REED_ASSETS.has(placement.assetId)) continue;
      expect(WorldLayout.isWater(placement.x, placement.z), placement.id).toBe(false);
    }
  });

  it("leaves the walked pool-bank corridor open", () => {
    const corridor = walkedCorridor();
    for (const placement of group) {
      if (!COLLIDING.has(placement.assetId)) continue;
      expect(
        distanceToPolyline(placement, corridor),
        `${placement.id} blocks the walked corridor`
      ).toBeGreaterThan(1.6);
    }
  });

  it("leaves the review stances clear", () => {
    for (const viewpoint of HEADWATER_GRAYBOX_VIEWPOINTS) {
      for (const placement of group) {
        if (!COLLIDING.has(placement.assetId)) continue;
        expect(
          Math.hypot(placement.x - viewpoint.cameraPosition.x, placement.z - viewpoint.cameraPosition.z),
          `${placement.id} sits on ${viewpoint.artViewId}`
        ).toBeGreaterThan(1.8);
      }
    }
  });

  it("keeps the gorge faces bare of the group", () => {
    // The composed group belongs to the banks and terrace; the exposed faces
    // between the lip and the landing stay open by design.
    for (const placement of group) {
      if (placement.z > NEVA_HEADWATERS.fall.lipZ && placement.z < NEVA_HEADWATERS.fall.landingZ) {
        expect(WorldLayout.terrainNormalY(placement.x, placement.z), placement.id).toBeGreaterThan(0.7);
      }
    }
  });
});
