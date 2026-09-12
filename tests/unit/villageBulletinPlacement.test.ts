import { describe, expect, it } from "vitest";

import { WorldLayout, WORLD_ARCHITECTURE_PADS } from "../../src/world/WorldLayout";
import { VILLAGE_BULLETIN, VILLAGE_MARKET, VILLAGE_PLAZA } from "../../src/world/WorldAnchors";

function padClearance(x: number, z: number, pad: (typeof WORLD_ARCHITECTURE_PADS)[number]): number {
  const dx = x - pad.center.x;
  const dz = z - pad.center.z;
  const cosine = Math.cos(pad.rotationY);
  const sine = Math.sin(pad.rotationY);
  const localX = dx * cosine + dz * sine;
  const localZ = -dx * sine + dz * cosine;
  const outsideX = Math.max(0, Math.abs(localX) - pad.envelope[0]);
  const outsideZ = Math.max(0, Math.abs(localZ) - pad.envelope[1]);
  return Math.hypot(outsideX, outsideZ);
}

describe("village bulletin board placement", () => {
  const { x, z } = VILLAGE_BULLETIN.position;

  it("stands on dry, walkable village ground", () => {
    expect(WorldLayout.isWalkable(x, z)).toBe(true);
    expect(WorldLayout.isWater(x, z)).toBe(false);
    expect(WorldLayout.isInterior(x, z)).toBe(false);
    expect(WorldLayout.regionAt(x, z)).toBe("region.village");
    expect(WorldLayout.terrainNormalY(x, z)).toBeGreaterThan(0.9);
  });

  it("stands just outside the market's own interaction ring", () => {
    const distance = Math.hypot(x - VILLAGE_MARKET.position.x, z - VILLAGE_MARKET.position.z);
    expect(distance).toBeGreaterThan(VILLAGE_MARKET.radiusMeters);
    expect(distance).toBeLessThan(VILLAGE_MARKET.radiusMeters + VILLAGE_BULLETIN.interactionRadiusMeters + 1);
  });

  it("keeps clear of every authored building envelope", () => {
    const clearance = Math.min(...WORLD_ARCHITECTURE_PADS.map((pad) => padClearance(x, z, pad)));
    expect(clearance).toBeGreaterThan(1.5);
  });

  it("stands on the square beside the plaza", () => {
    const plazaDistance = Math.hypot(x - VILLAGE_PLAZA.x, z - VILLAGE_PLAZA.z);
    expect(plazaDistance).toBeLessThan(9);
  });
});
