import { describe, expect, it, vi } from "vitest";
import { Vector4 } from "three";
import { createWaterProfileMap, waterFieldMapsSteps } from "../../src/render/water/FacetedWater";
import { createWaterDepthMap } from "../../src/render/water/CoastalOptics";
import { runCooperatively, runSync } from "../../src/utils/CooperativeTask";
import { createWaterSpatialProfile, waterSpatialProfile } from "../../src/render/water/waterProfile";
import { WorldLayout, WORLD_LAYOUT_V5, SHORE_TREATMENT_TABLE } from "../../src/world/WorldLayout";
import { NEVA_COAST_LOOP, SUNREACH_COAST_LOOP } from "../../src/world/WorldIslands";
import { OCEAN_ISLETS, OCEAN_ISLAND_DEFINITIONS } from "../../src/world/OceanIslets";
import { harborCoastInfluence } from "../../src/world/HarborCoast";
import { NEVA_HEADWATERS } from "../../src/world/NevaHeadwaters";

// Retain the exact pre-index contact formula so a false-negative broad-phase
// cell cannot silently remove surf or dampness from either side of a shore.
function unindexedContact(x: number, z: number): number {
  const harbor = harborCoastInfluence(x, z);
  if (harbor > 0.001) return harbor;
  const inRiverSpan = z >= NEVA_HEADWATERS.source.z - NEVA_HEADWATERS.sourceRadiusMeters
    && z <= WORLD_LAYOUT_V5.riverMouth.z + 1.5;
  if (inRiverSpan && z <= WorldLayout.coastlineZ(x) + 1 && WorldLayout.riverWaterSignedDistance(x, z) > -5) return 0;
  const shore = WorldLayout.shoreProjectionAt(x, z);
  const treatment = SHORE_TREATMENT_TABLE[shore.shoreKind];
  const water = shore.signedDistanceMeters >= 0;
  const reach = water ? treatment.waterReachMeters : treatment.landReachMeters;
  const distance = Math.abs(shore.signedDistanceMeters);
  if (distance >= reach) return 0;
  const amount = Math.max(0, Math.min(1, (distance - reach * 0.45) / (reach - reach * 0.45)));
  const fade = 1 - amount * amount * (3 - 2 * amount);
  const strength = water ? treatment.waterContactStrength : treatment.landContactStrength;
  return Math.max(0, Math.min(1, strength * (0.72 + shore.exposure * 0.28) * (1 - shore.shelter * 0.12) * fade));
}

describe("shared water field preparation", () => {
  it("reuses the profile output without changing its sampled values", () => {
    const scratch = createWaterSpatialProfile();
    for (const [x, z] of [[65, 92], [-48, -112], [720, 260]] as const) {
      const expected = waterSpatialProfile(x, z);
      const actual = waterSpatialProfile(x, z, undefined, {}, scratch);
      expect(actual).toBe(scratch);
      expect(actual.region).toBe(expected.region);
      expect(actual.weights).toEqual(expected.weights);
      expect(actual.signedWaterDistance).toBe(expected.signedWaterDistance);
      expect(actual.coastDistance).toBe(expected.coastDistance);
      expect(actual.localDirection.x).toBe(expected.localDirection.x);
      expect(actual.localDirection.y).toBe(expected.localDirection.y);
    }
  });

  it.each([
    { name: "mainland, islands and ocean", bounds: new Vector4(-1100, -1050, 2900, 2100), width: 49, height: 37 },
    { name: "elevated source, fall and pool", bounds: new Vector4(-44, -158, 28, 40), width: 19, height: 25 }
  ])("keeps every standalone texture byte at $name", ({ bounds, width, height }) => {
    const profile = createWaterProfileMap(bounds, width, height);
    const depth = createWaterDepthMap(bounds, width, height);
    const paired = runSync(waterFieldMapsSteps(bounds, width, height));
    expect(paired.profile.image.data).toEqual(profile.image.data);
    expect(paired.depth.image.data).toEqual(depth.image.data);
    for (const field of ["profile", "depth"] as const) {
      const original = field === "profile" ? profile : depth;
      expect(paired[field].type).toBe(original.type);
      expect(paired[field].minFilter).toBe(original.minFilter);
      expect(paired[field].magFilter).toBe(original.magFilter);
      expect(paired[field].wrapS).toBe(original.wrapS);
      expect(paired[field].wrapT).toBe(original.wrapT);
      original.dispose();
      paired[field].dispose();
    }
  }, 60_000);

  it("retains both fields when sampling yields, and cancels before allocating textures", async () => {
    const bounds = new Vector4(80, 50, 80, 60);
    const synchronous = runSync(waterFieldMapsSteps(bounds, 17, 17));
    const cooperative = await runCooperatively(waterFieldMapsSteps(bounds, 17, 17));
    expect(cooperative.profile.image.data).toEqual(synchronous.profile.image.data);
    expect(cooperative.depth.image.data).toEqual(synchronous.depth.image.data);
    Object.values(synchronous).forEach(texture => texture.dispose());
    Object.values(cooperative).forEach(texture => texture.dispose());

    const controller = new AbortController();
    const work = waterFieldMapsSteps(bounds, 200, 200);
    expect(work.next().done).toBe(false);
    controller.abort(new Error("cancel water"));
    await expect(runCooperatively(work, controller.signal)).rejects.toThrow("cancel water");
    expect(work.next().done).toBe(true);
  });

  it("preserves the original contact formula at every coast edge and spatial cell boundary", () => {
    const loops = [NEVA_COAST_LOOP, SUNREACH_COAST_LOOP,
      ...OCEAN_ISLETS.map(islet => OCEAN_ISLAND_DEFINITIONS[islet.id].coastLoop)];
    const points: Array<readonly [number, number]> = [];
    for (const loop of loops) for (let index = 0; index < loop.length; index += 1) {
      const a = loop[index];
      const b = loop[(index + 1) % loop.length];
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      const nx = -(b.z - a.z) / length;
      const nz = (b.x - a.x) / length;
      for (const t of [0, 0.5]) for (const offset of [-10.001, -9.999, -4, 0, 4, 9.999, 10.001]) {
        points.push([a.x + (b.x - a.x) * t + nx * offset, a.z + (b.z - a.z) * t + nz * offset]);
      }
    }
    for (let x = -1024; x <= 1792; x += 64) for (let z = -1024; z <= 1024; z += 64) {
      points.push([x - 0.000001, z + 0.000001]);
    }
    for (const [x, z] of points) {
      expect(WorldLayout.coastalContactWeightAt(x, z), `contact ${x}, ${z}`).toBe(unindexedContact(x, z));
    }
  });

  it("avoids shoreline projection where no contact treatment can reach", () => {
    const projection = vi.spyOn(WorldLayout, "shoreProjectionAt");
    try {
      expect(WorldLayout.coastalContactWeightAt(-1000, -1000)).toBe(0);
      expect(WorldLayout.coastalContactWeightAt(1750, 900)).toBe(0);
      expect(projection).not.toHaveBeenCalled();
    } finally {
      projection.mockRestore();
    }
  });
});
