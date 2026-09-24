import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { MAINLAND_LAKE } from "../../src/world/NevaMainland";
import { CANONICAL_RENDER_CONFIG } from "../../src/render/config/VisualRenderConfig";
import { FacetedWater } from "../../src/render/water/FacetedWater";

// These checks protect material sharing and tier transitions. Shader compilation
// and appearance are exercised in the local production preview separately.
describe("regional water appearance", () => {
  it("uses the canonical lake bounds on both water surfaces and the fall", () => {
    const water = new FacetedWater({ width: 12, depth: 12 });
    try {
      const shared = water.coastalUniforms;
      expect(shared.uLakeBounds.value.toArray()).toEqual([
        MAINLAND_LAKE.center.x, MAINLAND_LAKE.center.z, MAINLAND_LAKE.radiusX, MAINLAND_LAKE.radiusZ
      ]);
      for (const material of [water.mesh.material, water.headwaterSurface.material, water.headwaterFall.mesh.material]) {
        for (const key of ["uLakeBounds", "uLakeRippleScale", "uLakeCurrentScale", "uFreshwaterAbsorptionScale"] as const) {
          expect(material.uniforms[key]).toBe(shared[key]);
        }
      }
    } finally { water.dispose(); }
  });

  it("retains the lattice and field textures through repeated graphics changes", () => {
    const water = new FacetedWater({ width: 12, depth: 12 });
    try {
      const geometry = water.mesh.geometry, profile = water.waterProfileMap;
      const depth = water.coastalUniforms.uWaterDepthMap.value;
      for (const tier of ["low", "high", "medium", "low", "high"] as const) {
        water.setQuality(tier);
        expect(water.mesh.geometry).toBe(geometry);
        expect(water.waterProfileMap).toBe(profile);
        expect(water.coastalUniforms.uWaterDepthMap.value).toBe(depth);
        expect(water.coastalUniforms.uSsrEnabled.value).toBe(tier === "high" ? 1 : 0);
        // Detail normals are texture taps, not a pass or a target: every tier
        // keeps the large wind layer; tiers without full detail drop the
        // small layer. Read the tier table rather than restating the tiers.
        const detailTier = water.uniforms.uDetailTier.value as THREE.Vector2;
        const fullDetail = CANONICAL_RENDER_CONFIG.waterSurface.quality[tier].detailNormal;
        expect(detailTier.x).toBeGreaterThan(0);
        expect(detailTier.y).toBe(fullDetail ? 1 : 0);
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
