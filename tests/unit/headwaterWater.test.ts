import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { CANONICAL_RENDER_CONFIG } from "../../src/render/config/VisualRenderConfig";
import { createWaterGeometry, FacetedWater } from "../../src/render/water/FacetedWater";
import { waterHeight, waterNormal, waterSpatialProfile } from "../../src/render/water/WaterSurface";
import { NEVA_HEADWATERS, headwaterElevationAt } from "../../src/world/NevaHeadwaters";
import { WATER_SURFACE, WorldLayout } from "../../src/world/WorldLayout";

describe("mountain river water", () => {
  it("adds the canonical baseline to the unchanged wave displacement", () => {
    for (const z of [-152, -150, -143, -136, -130, -124, -120, -116, -105, 82]) {
      const x = WorldLayout.riverCenterX(z);
      const baseline = WorldLayout.waterSurfaceElevation(x, z);
      const actual = waterHeight(x, z, 17);
      // The wave field shoals against the baked bed, which does not change
      // when the static surface baseline is mocked away, so the difference is
      // purely the additive baseline.
      const query = vi.spyOn(WorldLayout, "waterSurfaceElevation").mockReturnValue(0);
      try {
        expect(actual - waterHeight(x, z, 17)).toBeCloseTo(baseline, 10);
      } finally {
        query.mockRestore();
      }
    }
    expect(WorldLayout.waterSurfaceElevation(-30, -150)).toBe(33.5);
    for (const [x, z] of [[-30, -105], [68, 90], [350, 80], [600, 200]]) {
      expect(WorldLayout.waterSurfaceElevation(x, z)).toBe(0);
    }
  });

  it("tilts surface normals downhill with the actual raised water surface", () => {
    const step = 0.01;
    // Graded run stations only: the lip crest, the pool shelf and the sea-level
    // handoff are deliberate level surfaces (asserted separately below). Avoid
    // exact knots — smoothstep zero-derivative there lets wave normals own the
    // tilt — and sample mid-segment instead.
    for (const z of [-144, -143, -139, -135.3, -121, -118]) {
      const x = WorldLayout.riverCenterX(z);
      const normal = waterNormal(x, z, 9);
      const dx = (waterHeight(x + step, z, 9) - waterHeight(x - step, z, 9)) / (2 * step);
      const dz = (waterHeight(x, z + step, 9) - waterHeight(x, z - step, 9)) / (2 * step);
      const geometricNormal = new THREE.Vector3(-dx, 1, -dz).normalize();
      expect(normal.dot(geometricNormal)).toBeGreaterThan(0.999);
      expect(normal.length()).toBeCloseTo(1, 8);
      expect(normal.z).toBeGreaterThan(0.01);
    }
  });

  it("keeps the authored pool shelf level between the fall landing and the outlet", () => {
    const fall = NEVA_HEADWATERS.fall;
    for (const z of [-128, -126, -124]) {
      const x = WorldLayout.riverCenterX(z);
      const normal = waterNormal(x, z, 9);
      expect(normal.z, `pool tilt at ${z}`).toBeLessThan(0.05);
      expect(WorldLayout.waterSurfaceElevation(x, z)).toBeLessThanOrEqual(fall.landingElevation);
      expect(WorldLayout.waterSurfaceElevation(x, z)).toBeGreaterThan(0);
    }
    // The fall face itself is the only steep segment in the upper reach.
    expect(headwaterElevationAt(fall.lipZ)).toBe(fall.lipElevation);
    expect(headwaterElevationAt(fall.landingZ)).toBe(fall.landingElevation);
  });

  it("ends the river flow field at the finite spring cap", () => {
    const { source, sourceRadiusMeters } = NEVA_HEADWATERS;
    expect(waterSpatialProfile(source.x, source.z).weights.river).toBe(1);
    expect(waterSpatialProfile(source.x, source.z - sourceRadiusMeters - 3).weights.river).toBe(0);
  });

  it("refines only the headwater band, resolves its grade and expands GPU bounds", () => {
    const geometry = createWaterGeometry(
      WATER_SURFACE.width / 2, WATER_SURFACE.depth, 111, WATER_SURFACE.segmentsZ,
      WATER_SURFACE.centerX - WATER_SURFACE.width / 4, WATER_SURFACE.centerZ
    );
    const ocean = createWaterGeometry(100, 100, 20, 20, 550, 150);
    try {
      const positions = geometry.getAttribute("position");
      const rows: number[] = [];
      for (let index = 0; index < positions.count; index += 112) {
        rows.push(positions.getZ(index) + WATER_SURFACE.centerZ);
      }
      const bounds = NEVA_HEADWATERS.bounds;
      const localRows = rows.filter((z) => z >= bounds.minZ - 0.0001 && z <= bounds.maxZ + 0.0001);
      const spacing = CANONICAL_RENDER_CONFIG.waterSurface.headwaters.maxRowSpacingMeters;
      for (const knot of NEVA_HEADWATERS.elevationKnots) {
        expect(localRows.some((z) => Math.abs(z - knot.z) < 0.0001)).toBe(true);
      }
      let maximumChordError = 0;
      for (let index = 1; index < localRows.length; index++) {
        const start = localRows[index - 1];
        const end = localRows[index];
        expect(end - start).toBeLessThanOrEqual(spacing + 0.0001);
        for (let sample = 1; sample < 10; sample++) {
          const t = sample / 10;
          const interpolated = THREE.MathUtils.lerp(headwaterElevationAt(start), headwaterElevationAt(end), t);
          maximumChordError = Math.max(maximumChordError,
            Math.abs(interpolated - headwaterElevationAt(THREE.MathUtils.lerp(start, end, t))));
        }
      }
      expect(maximumChordError).toBeLessThan(0.03);
      expect(geometry.boundingBox!.max.y).toBeGreaterThan(NEVA_HEADWATERS.elevationKnots[0].elevation);
      expect(ocean.parameters.heightSegments).toBe(20);
      expect(ocean.getAttribute("position").count).toBe(21 * 21);
    } finally {
      geometry.dispose();
      ocean.dispose();
    }
  });

  it("gives the elevated reach its own refined surface that exactly covers what it owns", () => {
    const water = new FacetedWater({ width: 60, depth: 60, centerX: -30, centerZ: -133 });
    try {
      const headwater = water.headwaterSurface;
      for (const material of [water.mesh.material, headwater.material]) {
        expect(Array.from(material.uniforms.uHeadwaterElevations.value as Float32Array))
          .toEqual(Array.from(new Float32Array(NEVA_HEADWATERS.elevationKnots.flatMap((knot) => [knot.z, knot.elevation]))));
        expect(material.fragmentShader).toContain("field.b <= 0.0) discard");
        expect(material.fragmentShader).toContain("baselineElevation = worldPosition.y - waveHeight");
      }
      // Only the headwater surface climbs the authored profile; the sea-level
      // lattice yields that reach to it on the same world-space test.
      expect(headwater.material.vertexShader).toContain("headwater.x + height");
      expect(water.mesh.material.vertexShader).not.toContain("nevaHeadwaterElevationAndGrade(lattice");
      // The fixed surface spans exactly the owned rectangle, and its culling
      // bounds include the raised profile plus the displacement margin.
      const box = headwater.geometry.boundingBox!.clone().translate(headwater.position);
      const bounds = NEVA_HEADWATERS.bounds;
      const lastKnotZ = NEVA_HEADWATERS.elevationKnots[NEVA_HEADWATERS.elevationKnots.length - 1]!.z;
      const positions = headwater.geometry.getAttribute("position");
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let index = 0; index < positions.count; index += 1) {
        minX = Math.min(minX, positions.getX(index) + headwater.position.x);
        maxX = Math.max(maxX, positions.getX(index) + headwater.position.x);
        minZ = Math.min(minZ, positions.getZ(index) + headwater.position.z);
        maxZ = Math.max(maxZ, positions.getZ(index) + headwater.position.z);
      }
      expect(minX).toBeCloseTo(bounds.minX, 6);
      expect(maxX).toBeCloseTo(bounds.maxX, 6);
      expect(minZ).toBeCloseTo(bounds.minZ, 6);
      expect(maxZ).toBeCloseTo(lastKnotZ, 6);
      expect(box.max.y).toBeGreaterThan(NEVA_HEADWATERS.elevationKnots[0]!.elevation);
      water.update(12, { seaRoughness: 0.2, windDirectionDeg: 0, windSpeed: 2 }, undefined, { reducedMotion: true });
      expect(water.mesh.material.uniforms.uReducedMotion.value).toBe(1);
      expect(headwater.material.uniforms.uReducedMotion).toBe(water.mesh.material.uniforms.uReducedMotion);
    } finally {
      water.dispose();
    }
  });
});
