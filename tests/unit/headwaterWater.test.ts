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
      const query = vi.spyOn(WorldLayout, "waterSurfaceElevation").mockReturnValue(0);
      try {
        expect(actual - waterHeight(x, z, 17)).toBeCloseTo(baseline, 10);
      } finally {
        query.mockRestore();
      }
    }
    expect(WorldLayout.waterSurfaceElevation(-30, -150)).toBe(20);
    for (const [x, z] of [[-30, -105], [68, 90], [350, 80], [600, 200]]) {
      expect(WorldLayout.waterSurfaceElevation(x, z)).toBe(0);
    }
  });

  it("tilts surface normals downhill with the actual raised water surface", () => {
    const step = 0.01;
    for (const z of [-146, -143, -139, -132, -130, -126, -122, -120, -118]) {
      const x = WorldLayout.riverCenterX(z);
      const normal = waterNormal(x, z, 9);
      const dx = (waterHeight(x + step, z, 9) - waterHeight(x - step, z, 9)) / (2 * step);
      const dz = (waterHeight(x, z + step, 9) - waterHeight(x, z - step, 9)) / (2 * step);
      const geometricNormal = new THREE.Vector3(-dx, 1, -dz).normalize();
      expect(normal.dot(geometricNormal)).toBeGreaterThan(0.999);
      expect(normal.length()).toBeCloseTo(1, 8);
      expect(normal.z).toBeGreaterThan(0.2);
    }
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

  it("gives both shaders the same world profile and keeps steep water on the refined base", () => {
    const water = new FacetedWater({ width: 60, depth: 60, centerX: -30, centerZ: -133, segmentsX: 12, segmentsZ: 12 });
    try {
      for (const material of [water.mesh.material, water.nearPatch.mesh.material]) {
        expect(Array.from(material.uniforms.uHeadwaterElevations.value as Float32Array))
          .toEqual(NEVA_HEADWATERS.elevationKnots.flatMap((knot) => [knot.z, knot.elevation]));
        expect(material.vertexShader).toContain("displaced.y += headwater.x + height");
        expect(material.vertexShader).toContain("vWaveHeight = height");
        expect(material.fragmentShader).toContain("signedWaterDistance <= 0.0) discard");
        expect(material.fragmentShader).toContain("profileAt(worldPosition.xz)");
        expect(material.fragmentShader).toContain("baselineElevation = worldPosition.y - waveHeight");
        expect(material.fragmentShader).toContain("|| baselineElevation > 0.001");
      }
      // A finite vertex envelope does not bound the displaced fragments:
      // triangles crossing it still have raised centroids on dry ground.
      const geometry = water.mesh.geometry;
      const positions = geometry.getAttribute("position");
      const indices = geometry.index!;
      const bounds = NEVA_HEADWATERS.bounds;
      let eastRaisedChord = false;
      let northRaisedChord = false;
      for (let index = 0; index < indices.count; index += 3) {
        let x = 0;
        let z = 0;
        let interpolatedBaseline = 0;
        for (let corner = 0; corner < 3; corner++) {
          const vertex = indices.getX(index + corner);
          const vx = positions.getX(vertex) + water.mesh.position.x;
          const vz = positions.getZ(vertex) + water.mesh.position.z;
          x += vx / 3;
          z += vz / 3;
          interpolatedBaseline += WorldLayout.waterSurfaceElevation(vx, vz) / 3;
        }
        if (interpolatedBaseline <= 0.1) continue;
        if (x > bounds.maxX || z < bounds.minZ) {
          expect(WorldLayout.waterSignedDistance(x, z)).toBeLessThan(0);
          eastRaisedChord ||= x > bounds.maxX;
          northRaisedChord ||= z < bounds.minZ;
        }
      }
      expect(eastRaisedChord).toBe(true);
      expect(northRaisedChord).toBe(true);
      expect(water.mesh.material.fragmentShader).toContain("!nevaHeadwaterOwnsSurface(vWorldPosition.xz)");
      expect(water.nearPatch.mesh.material.fragmentShader).toContain("|| nevaHeadwaterOwnsSurface(vWorldPosition.xz)");
      water.update(12, { seaRoughness: 0.2, windDirectionDeg: 0, windSpeed: 2 }, new THREE.Vector3(-30, 20, -145), { reducedMotion: true });
      expect(water.mesh.material.uniforms.uReducedMotion.value).toBe(1);
      expect(water.nearPatch.mesh.material.uniforms.uReducedMotion.value).toBe(1);
    } finally {
      water.dispose();
    }
  });
});
