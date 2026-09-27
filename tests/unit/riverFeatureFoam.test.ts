import { describe, expect, it } from "vitest";
import { createRiverFeatureFoamField } from "../../src/render/water/RiverFeatureFoam";
import { NEVA_HEADWATERS } from "../../src/world/NevaHeadwaters";
import { nevaRiverFeatures } from "../../src/world/NevaRiverFeatures";
import { WorldLayout } from "../../src/world/WorldLayout";

const field = createRiverFeatureFoamField();
const { width, height, data } = field.texture.image as { width: number; height: number; data: Uint8Array };

function coverageAt(x: number, z: number): number {
  const u = (x - field.bounds.x) * field.bounds.z;
  const v = (z - field.bounds.y) * field.bounds.w;
  if (u < 0 || v < 0 || u >= 1 || v >= 1) return 0;
  return data[Math.floor(v * height) * width + Math.floor(u * width)] / 255;
}

describe("river feature foam field", () => {
  it("whitens the apron below every cascade step", () => {
    for (const step of NEVA_HEADWATERS.cascade.steps) {
      const z = step.footZ + 0.5;
      expect(coverageAt(WorldLayout.riverSectionAt(z).centerX, z), `step foot ${step.footZ}`).toBeGreaterThan(0.6);
    }
  });

  it("collars and wakes every stone that breaks a fast reach", () => {
    for (const stone of nevaRiverFeatures().stones) {
      if (!stone.inWater || stone.exposure < 0.06 || (stone.role !== "riffle" && stone.role !== "cascade-sill")) continue;
      const tangent = WorldLayout.riverSectionAt(stone.z).tangent;
      const length = Math.hypot(tangent.x, tangent.z);
      const sign = tangent.z < 0 ? -1 : 1;
      const downstream = stone.radius + 0.4;
      const x = stone.x + (tangent.x / length) * sign * downstream;
      const z = stone.z + (tangent.z / length) * sign * downstream;
      expect(coverageAt(x, z), stone.id).toBeGreaterThan(0.25);
    }
  });

  it("leaves calm meadow pools glassy away from their features", () => {
    const features = nevaRiverFeatures();
    let calm = 0;
    for (let z = -100; z <= 50; z += 2) {
      const section = WorldLayout.riverSectionAt(z);
      if (section.riffle > 0.05) continue;
      const x = section.centerX + section.thalwegOffset;
      if (features.stones.some((stone) => Math.hypot(stone.x - x, stone.z - z) < 8)) continue;
      expect(coverageAt(x, z), `pool at ${z}`).toBeLessThan(0.05);
      calm += 1;
    }
    expect(calm).toBeGreaterThan(10);
  });
});
