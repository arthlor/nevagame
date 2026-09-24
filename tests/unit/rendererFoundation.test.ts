import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CANONICAL_RENDER_CONFIG } from "../../src/render/config/VisualRenderConfig";
import { CultivatedSurfaceMaterial } from "../../src/render/materials/CultivatedSurfaceMaterial";
import { buildStarterFarmGround } from "../../src/render/scene/StarterFarmGround";
import { FacetedWater, SHORE_MASK_METERS_PER_TEXEL } from "../../src/render/water/FacetedWater";
import { buildShoreFoamPatches, SHORE_FOAM_STYLE } from "../../src/render/water/ShoreFoam";
import { BoatWakePool } from "../../src/render/water/BoatWakePool";
import { STARTER_FARM_LAYOUT } from "../../src/world/FarmLayout";
import { TERRAIN_SIZE_METERS, WorldLayout } from "../../src/world/WorldLayout";
import { harborCoastInfluence } from "../../src/world/HarborCoast";
import { createContactShadowMesh, setContactShadowOpacity } from "../../src/render/scene/ContactShadow";

const WATER_CONDITIONS = {
  seaRoughness: 0.2,
  windDirectionDeg: 35,
  windSpeed: 4
};

describe("renderer foundation", () => {
  it("gates contact effects by canonical quality tier", () => {
    expect(CANONICAL_RENDER_CONFIG.quality.low.ambientOcclusion).toBe("off");
    expect(CANONICAL_RENDER_CONFIG.quality.low.dynamicContactShadows).toBe(false);
    expect(CANONICAL_RENDER_CONFIG.quality.medium.ambientOcclusion).toBe("contact");
    expect(CANONICAL_RENDER_CONFIG.quality.high.ambientOcclusion).toBe("gtao");
    expect(CANONICAL_RENDER_CONFIG.quality.high.dynamicContactShadows).toBe(false);
    expect(CANONICAL_RENDER_CONFIG.gtao.resolutionScale).toBeLessThan(1);
    expect(CANONICAL_RENDER_CONFIG.shadows.castCharacters).toBe(true);
    expect(CANONICAL_RENDER_CONFIG.shadows.castRocks).toBe(true);
    // Shadows stay dense enough to anchor, but not fully opaque: at intensity 1
    // the dark palette families crushed to flat black silhouettes with no facet
    // separation. The moon runs a lighter, broader recipe again.
    expect(CANONICAL_RENDER_CONFIG.shadows.intensity).toBeGreaterThan(0.8);
    expect(CANONICAL_RENDER_CONFIG.shadows.intensity).toBeLessThan(1);
    expect(CANONICAL_RENDER_CONFIG.shadows.nightIntensity)
      .toBeLessThan(CANONICAL_RENDER_CONFIG.shadows.intensity);
    expect(CANONICAL_RENDER_CONFIG.shadows.nightRadius)
      .toBeGreaterThan(CANONICAL_RENDER_CONFIG.shadows.radius);
    // Shadows only read when the key light dominates the hemisphere fill.
    expect(CANONICAL_RENDER_CONFIG.sun.intensity)
      .toBeGreaterThan(CANONICAL_RENDER_CONFIG.skyFill.intensity * 1.75);
    // A clear-day far plane must stay inside the 600 m terrain grid so the
    // plane's cut edge never resolves against the sky.
    expect(CANONICAL_RENDER_CONFIG.fog.clearDayFar).toBeLessThan(TERRAIN_SIZE_METERS);
    expect(CANONICAL_RENDER_CONFIG.fog.clearDayNear)
      .toBeLessThan(CANONICAL_RENDER_CONFIG.fog.clearDayFar);
    // Shadow coverage has to span the gameplay camera, not a bubble around the player.
    expect(CANONICAL_RENDER_CONFIG.quality.high.shadowCameraSize).toBeGreaterThanOrEqual(80);
    expect(CANONICAL_RENDER_CONFIG.quality.medium.shadowCameraSize).toBeGreaterThanOrEqual(60);
    expect(CANONICAL_RENDER_CONFIG.quality.low.shadowCameraSize).toBeGreaterThanOrEqual(40);
    expect(CANONICAL_RENDER_CONFIG.gtao.blendIntensity).toBe(0.44);
    expect(CANONICAL_RENDER_CONFIG.gtao.radius).toBeLessThan(0.6);
    expect(CANONICAL_RENDER_CONFIG.contact.opacity).toBeGreaterThan(0.2);
    expect(CANONICAL_RENDER_CONFIG.sun.maxElevationDeg).toBeGreaterThanOrEqual(35);
    expect(CANONICAL_RENDER_CONFIG.sun.maxElevationDeg).toBeLessThanOrEqual(60);
    expect(CANONICAL_RENDER_CONFIG.sun.noonAzimuthDeg).toBe(45);
    expect(CANONICAL_RENDER_CONFIG.groundSurface.polygonCellScaleMeters).toBe(1.2);
    expect(CANONICAL_RENDER_CONFIG.groundSurface.wetness).toMatchObject({
      riseSeconds: 3,
      fallSeconds: 8
    });
    expect(CANONICAL_RENDER_CONFIG.terrainSurface.polygonCellScaleMeters).toBe(1.2);
    expect(CANONICAL_RENDER_CONFIG.terrainSurface.pathTransition).toEqual({
      shoulderStart: 0.32,
      shoulderFull: 0.52,
      coreStart: 0.68,
      coreFull: 0.86,
      underlayStrength: 0.22
    });
    expect(CANONICAL_RENDER_CONFIG.roadSurface.edgeFadeStart)
      .toBeLessThan(CANONICAL_RENDER_CONFIG.roadSurface.edgeFadeFull);
  });

  it("uses shared bathymetry, continuous transmission and angle-dependent reflection", () => {
    const water = new FacetedWater({ width: 12, depth: 12 });
    const material = water.mesh.material;
    expect(material.fragmentShader).toContain("nevaOpticsField(worldPosition.xz)");
    expect(material.fragmentShader).toContain("exp(-uWaterAbsorption");
    expect(material.fragmentShader).toContain("pow(1.0 - ndvEffective, 5.0)");
    expect(material.fragmentShader).not.toContain("waterFacetBand = step");
    expect(material.uniforms.uFresnelStrength.value).toBe(
      CANONICAL_RENDER_CONFIG.waterSurface.fresnelStrength
    );
    expect(material.uniforms.uShallowEndMeters.value).toBe(
      CANONICAL_RENDER_CONFIG.waterSurface.shallowEndMeters
    );
    water.dispose();
  });

  it("uses a soft analytic contact footprint instead of a hard decal", () => {
    const shadow = createContactShadowMesh(0.64, 0.44, 0.23);
    expect(shadow.geometry.parameters.segments).toBe(24);
    expect(shadow.material.fragmentShader).toContain("smoothstep(0.42, 1.0, radial)");
    setContactShadowOpacity(shadow, 0.12);
    expect(shadow.material.uniforms.uOpacity.value).toBe(0.12);
    shadow.geometry.dispose();
    shadow.material.dispose();
  });

  it("places deterministic broken coastal foam patches", () => {
    const first = buildShoreFoamPatches();
    const second = buildShoreFoamPatches();
    expect(first.length).toBeGreaterThan(40);
    expect(first).toEqual(second);
    expect(SHORE_FOAM_STYLE.minWidth).toBeGreaterThanOrEqual(0.2);
    expect(SHORE_FOAM_STYLE.maxWidth).toBeLessThanOrEqual(0.7);
  });

  it("keeps foam on every island's waterline and leaves the river and harbor clear", () => {
    const patches = buildShoreFoamPatches();
    expect(patches.length).toBeGreaterThan(40);
    expect(patches.every((patch) => patch.source === "coast")).toBe(true);
    // W04.2: no dry-ground spill — the whole quad footprint stays water-side.
    expect(patches.every((patch) =>
      WorldLayout.waterSignedDistance(patch.center.x, patch.center.z) > patch.width * 0.5
    )).toBe(true);
    // The reference harbor is protected and the river/estuary banks stay clear.
    expect(patches.every((patch) => harborCoastInfluence(patch.center.x, patch.center.z) === 0)).toBe(true);
    expect(patches.every((patch) => WorldLayout.estuaryInfluence(patch.center.x, patch.center.z) <= 0.06)).toBe(true);
    // All four Neva sides, Sunreach, and each islet carry the broken accent.
    expect(patches.some((patch) => patch.center.x < -150 && patch.center.z > -200 && patch.center.z < 100)).toBe(true);
    expect(patches.some((patch) => patch.center.z < -180)).toBe(true);
    expect(patches.some((patch) => patch.center.x > 150 && patch.center.x < 300 && patch.center.z > 60)).toBe(true);
    expect(patches.some((patch) => patch.center.x > 700)).toBe(true);
    expect(patches.some((patch) => Math.hypot(patch.center.x - 420, patch.center.z - 215) < 60)).toBe(true);
    expect(patches.some((patch) => Math.hypot(patch.center.x - 735, patch.center.z + 65) < 70)).toBe(true);
    expect(patches.some((patch) => Math.hypot(patch.center.x - 960, patch.center.z - 295) < 70)).toBe(true);
    expect(SHORE_MASK_METERS_PER_TEXEL).toBeLessThanOrEqual(3);
  });

  it("reuses a bounded wake pool instead of allocating per wake", () => {
    const pool = new BoatWakePool(4);
    for (let index = 0; index < 12; index++) {
      pool.spawn(index, 50, 0, 4, index * 0.1, WATER_CONDITIONS);
    }
    expect(pool.group.children).toHaveLength(4);
    pool.update(10);
    expect(pool.group.children.every((child) => child.visible === false)).toBe(true);
    pool.dispose();
  });

  it("builds a deterministic rectangular cultivated bed with broken furrows and soil clods", () => {
    const options = {
      origin: STARTER_FARM_LAYOUT.origin,
      plantableArea: STARTER_FARM_LAYOUT.plantableAreas[0]!,
      heightAt: () => 0.5
    };
    const first = buildStarterFarmGround(options);
    const second = buildStarterFarmGround(options);
    const firstBed = first.getObjectByName("starter_farm_faceted_soil_bed") as THREE.Mesh;
    const secondBed = second.getObjectByName("starter_farm_faceted_soil_bed") as THREE.Mesh;
    const firstPositions = Array.from(firstBed.geometry.getAttribute("position").array);
    const secondPositions = Array.from(secondBed.geometry.getAttribute("position").array);

    expect(first.children.map((child) => child.name)).toEqual([
      "starter_farm_faceted_soil_bed",
      "starter_farm_broken_furrow_troughs",
      "starter_farm_soil_clods"
    ]);
    expect(firstPositions).toEqual(secondPositions);
    expect(firstBed.geometry.getAttribute("color").count).toBe(
      firstBed.geometry.getAttribute("position").count
    );
    for (const name of ["surfaceWeights0", "surfaceWeights1", "surfaceCauses"]) {
      expect(firstBed.geometry.getAttribute(name).count).toBe(
        firstBed.geometry.getAttribute("position").count
      );
      expect(Array.from(firstBed.geometry.getAttribute(name).array).every(Number.isFinite)).toBe(true);
    }

    const cornerQuadrants = new Set<string>();
    const positions = firstBed.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let index = 0; index < positions.count; index += 1) {
      const localX = positions.getX(index) - options.origin.x;
      const localZ = positions.getZ(index) - options.origin.z;
      if (Math.abs(localX) > 4.2 && Math.abs(localZ) > 4.2) {
        cornerQuadrants.add(`${Math.sign(localX)},${Math.sign(localZ)}`);
      }
    }
    expect(cornerQuadrants.size).toBe(4);

    for (const group of [first, second]) {
      group.traverse((object) => {
        if ((object as THREE.Mesh).isMesh) (object as THREE.Mesh).geometry.dispose();
      });
    }
  });

  it("uses the shared surface shader role for cultivated bed transitions", () => {
    const cultivated = new CultivatedSurfaceMaterial();
    const shader = {
      uniforms: { ...THREE.ShaderLib.standard.uniforms },
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader
    };
    const compile = cultivated.material.onBeforeCompile as unknown as (source: typeof shader) => void;
    compile(shader);

    expect(shader.vertexShader).toContain("attribute vec4 surfaceWeights0");
    expect(shader.vertexShader).toContain("vCultivatedWorldPosition");
    expect(shader.fragmentShader).toContain("nevaSurfaceWeightedPalette");
    expect(shader.fragmentShader).toContain("nevaSurfaceWeatherWetness");
    expect(shader.fragmentShader).toContain("nevaSurfaceRoughness");
    expect(shader.fragmentShader).toContain("nevaSurfaceFacetNormal");
    expect(shader.uniforms.cultivatedCellScale.value).toBe(1.2);
    expect(shader.uniforms.cultivatedWetnessMix.value).toBe(0.08);
    cultivated.setWetness(4);
    expect(cultivated.wetness).toBe(1);
    cultivated.setWetness(-1);
    expect(cultivated.wetness).toBe(0);
    cultivated.dispose();
  });
});
