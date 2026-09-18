import { describe, expect, it } from "vitest";
import {
  HEADWATER_GRAYBOX_ENVELOPE,
  HEADWATER_GRAYBOX_VIEWPOINTS,
  isInHeadwaterGrayboxEnvelope
} from "../../src/world/HeadwaterWaterfallGraybox";
import {
  NEVA_HEADWATERS,
  headwaterElevationAt,
  headwaterGradientAt
} from "../../src/world/NevaHeadwaters";
import { WorldLayout } from "../../src/world/WorldLayout";

/**
 * W06 live-topology contract. The slice used to be a fixture-only graybox; the
 * profile, fall segment and pool shelf are now world truth, so these tests pin
 * the *live* owners rather than a parallel candidate description.
 */
describe("W06 headwater waterfall topology (live)", () => {
  it("locks the source and the downstream handoff at their declared values", () => {
    const env = HEADWATER_GRAYBOX_ENVELOPE;
    expect(NEVA_HEADWATERS.source).toEqual(env.lockedSourceXZ);
    expect(NEVA_HEADWATERS.elevationKnots[0]).toEqual({
      z: env.lockedSourceXZ.z,
      elevation: env.lockedSourceElevation
    });
    expect(headwaterElevationAt(env.lockedHandoffZ)).toBe(env.lockedHandoffElevation);
  });

  it("descends monotonically from the source to the sea-level handoff", () => {
    let previous = Number.POSITIVE_INFINITY;
    for (let z = NEVA_HEADWATERS.source.z; z <= NEVA_HEADWATERS.endZ; z += 0.25) {
      const section = WorldLayout.riverSectionAt(z);
      expect(section.surfaceElevation).toBeLessThanOrEqual(previous);
      expect(headwaterGradientAt(z)).toBeLessThanOrEqual(0);
      previous = section.surfaceElevation;
    }
  });

  it("keeps a wet channel bed under the water at every station", () => {
    for (let z = NEVA_HEADWATERS.source.z; z <= NEVA_HEADWATERS.endZ; z += 0.5) {
      const section = WorldLayout.riverSectionAt(z);
      expect(WorldLayout.terrainHeight(section.centerX, z)).toBeLessThan(section.surfaceElevation);
      expect(WorldLayout.riverWaterSignedDistance(section.centerX, z)).toBeGreaterThan(0);
    }
  });

  it("owns one explicit falling segment between two named reaches", () => {
    const fall = NEVA_HEADWATERS.fall;
    expect(fall.upstreamReachId).not.toBe(fall.downstreamReachId);
    expect(headwaterElevationAt(fall.lipZ)).toBe(fall.lipElevation);
    expect(headwaterElevationAt(fall.landingZ)).toBe(fall.landingElevation);
    expect(fall.lipElevation - fall.landingElevation).toBeGreaterThan(5);
    expect(fall.landingZ).toBeGreaterThan(fall.lipZ);
    // The fall face is the steepest run in the upper reach by a wide margin.
    const fallGrade = (fall.lipElevation - fall.landingElevation) / (fall.landingZ - fall.lipZ);
    for (const z of [-146, -140, -126, -120, -118]) {
      expect(Math.abs(headwaterGradientAt(z))).toBeLessThan(fallGrade);
    }
  });

  it("holds a level plunge pool that drains to the handoff", () => {
    const poolStart = -128;
    const poolEnd = -124;
    for (let z = poolStart; z <= poolEnd; z += 0.5) {
      expect(headwaterGradientAt(z)).toBeCloseTo(0, 8);
    }
    const poolExit = WorldLayout.riverSectionAt(poolEnd).surfaceElevation;
    const handoff = WorldLayout.riverSectionAt(NEVA_HEADWATERS.endZ).surfaceElevation;
    expect(poolExit).toBeGreaterThan(handoff);
    let previous = poolExit;
    for (let z = poolEnd; z <= NEVA_HEADWATERS.endZ; z += 0.25) {
      const surface = WorldLayout.riverSectionAt(z).surfaceElevation;
      expect(surface).toBeLessThanOrEqual(previous);
      previous = surface;
    }
  });

  it("keeps the whole slice inside the declared edit envelope", () => {
    for (let z = NEVA_HEADWATERS.source.z; z <= NEVA_HEADWATERS.endZ; z += 1) {
      const section = WorldLayout.riverSectionAt(z);
      const reach = section.leftWaterWidth + section.leftBankRun
        + section.leftFloodplainWidth;
      expect(isInHeadwaterGrayboxEnvelope(section.centerX - reach, z)).toBe(true);
      expect(isInHeadwaterGrayboxEnvelope(section.centerX + reach, z)).toBe(true);
      expect(isInHeadwaterGrayboxEnvelope(section.centerX, z)).toBe(true);
    }
  });

  it("carves a plunge basin that relaxes toward the outflow", () => {
    const width = (z: number) => {
      const section = WorldLayout.riverSectionAt(z);
      return section.leftWaterWidth + section.rightWaterWidth;
    };
    const depth = (z: number) => {
      const section = WorldLayout.riverSectionAt(z);
      return section.surfaceElevation - section.bedElevation;
    };
    const lipZ = NEVA_HEADWATERS.fall.lipZ;
    const poolZ = NEVA_HEADWATERS.pool.centerZ;
    expect(NEVA_HEADWATERS.pool.id).toBe("reach.neva_headwaters_pool");
    // The basin is materially wider and deeper than the run that feeds it...
    expect(width(poolZ)).toBeGreaterThan(width(lipZ) + 3);
    expect(depth(poolZ)).toBeGreaterThan(depth(lipZ) + 1);
    // ...its width relaxes downstream of the basin instead of ending as a
    // uniform trench. (Further out the natural river widens on its own, so the
    // relaxation is measured at the basin's own downstream lip.)
    const basinExitZ = NEVA_HEADWATERS.pool.centerZ + NEVA_HEADWATERS.pool.halfLengthMeters - 1;
    expect(width(basinExitZ)).toBeLessThan(width(poolZ));
    // Depth instead sustains as a spillway to the handoff: a symmetric bump
    // leaves a shallow sill across the pool mouth that reads as a pale
    // rectangle in depth color. No station may shoal into a bar — a bar needs
    // relief on both sides to read, so each station must sit within 0.35 m of
    // its shallower neighbor.
    for (let z = poolZ + 1; z < NEVA_HEADWATERS.endZ; z += 1) {
      const shallowNeighbor = Math.min(depth(z - 1), depth(z + 1));
      expect(depth(z), `sill at ${z}`).toBeGreaterThan(shallowNeighbor - 0.35);
    }
    expect(depth(NEVA_HEADWATERS.endZ)).toBeLessThan(depth(poolZ));
    for (const z of [-132, -129, -126, -123, -120]) {
      const section = WorldLayout.riverSectionAt(z);
      expect(section.bedElevation, `bed at ${z}`).toBeLessThan(section.surfaceElevation);
    }
  });

  it("keeps the three review viewpoints over walkable, non-fall ground", () => {
    for (const viewpoint of HEADWATER_GRAYBOX_VIEWPOINTS) {
      const { x, z } = viewpoint.cameraPosition;
      expect(WorldLayout.isWater(x, z), `${viewpoint.artViewId} camera in water`).toBe(false);
      const section = WorldLayout.riverSectionAt(z);
      const distanceFromCenter = Math.abs(x - section.centerX);
      const bankEdge = section.leftWaterWidth + section.leftBankRun;
      // A stance is legal when the bank itself is walkable, or when it sits
      // beyond the bank edge as an intentional ridge ledge (the reveal view).
      const walkable = WorldLayout.terrainNormalY(x, z) >= 0.7;
      expect(
        walkable || distanceFromCenter >= bankEdge,
        `${viewpoint.artViewId} camera hangs on the fall-face bank`
      ).toBe(true);
    }
  });
});
