import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { MAINLAND_LAKE } from "../../src/world/NevaMainland";
import { CANONICAL_RENDER_CONFIG } from "../../src/render/config/VisualRenderConfig";
import { FacetedWater } from "../../src/render/water/FacetedWater";

// These checks protect material sharing and tier transitions. Shader compilation
// and appearance are exercised in the local production preview separately.
describe("regional water appearance", () => {
  it("uses the canonical lake bounds on both water surfaces and the fall", () => {
    const water = new FacetedWater({ width: 12, depth: 12, segmentsX: 4, segmentsZ: 4 });
    try {
      const shared = water.coastalUniforms;
      expect(shared.uLakeBounds.value.toArray()).toEqual([
        MAINLAND_LAKE.center.x, MAINLAND_LAKE.center.z, MAINLAND_LAKE.radiusX, MAINLAND_LAKE.radiusZ
      ]);
      for (const material of [water.mesh.material, water.nearPatch.mesh.material, water.headwaterFall.mesh.material]) {
        for (const key of ["uLakeBounds", "uLakeRippleScale", "uLakeCurrentScale", "uFreshwaterAbsorptionScale"] as const) {
          expect(material.uniforms[key]).toBe(shared[key]);
        }
      }
    } finally { water.dispose(); }
  });

  it("retains the base mesh and field textures through repeated graphics changes", () => {
    const water = new FacetedWater({ width: 12, depth: 12, segmentsX: 4, segmentsZ: 4 });
    try {
      const geometry = water.mesh.geometry, profile = water.waterProfileMap;
      const depth = water.coastalUniforms.uWaterDepthMap.value;
      for (const tier of ["low", "high", "medium", "low", "high"] as const) {
        water.setQuality(tier);
        expect(water.mesh.geometry).toBe(geometry);
        expect(water.waterProfileMap).toBe(profile);
        expect(water.coastalUniforms.uWaterDepthMap.value).toBe(depth);
        expect(water.coastalUniforms.uSsrEnabled.value).toBe(tier === "high" ? 1 : 0);
        // The surface detail normal is one extra normal evaluation, not a
        // pass or a target, so medium carries it too; only Low drops it.
        // Read the tier table rather than restating which tiers those are.
        expect(water.coastalUniforms.uRippleNormalStrength.value > 0)
          .toBe(CANONICAL_RENDER_CONFIG.waterSurface.quality[tier].detailNormal);
        expect(water.headwaterFall.mesh.geometry.index!.count / 3).toBe(
          CANONICAL_RENDER_CONFIG.waterSurface.headwaters.fall.rows[tier]
          * CANONICAL_RENDER_CONFIG.waterSurface.headwaters.fall.acrossSegments * 2
        );
      }
    } finally { water.dispose(); }
  });

  it("gives freshwater bounded absorption and a calm lake without turning off its water", () => {
    const optics = CANONICAL_RENDER_CONFIG.waterSurface.optics;
    const absorption = new THREE.Vector3(...optics.absorptionPerMeter)
      .multiply(new THREE.Vector3(...optics.freshwaterAbsorptionScale));
    for (const value of absorption.toArray()) expect(value).toBeGreaterThan(0);
    expect(optics.lakeRippleScale).toBeGreaterThan(0);
    expect(optics.lakeRippleScale).toBeLessThan(1);
    expect(optics.lakeCurrentScale).toBeLessThan(0.15);
  });
});
