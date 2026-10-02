import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CANONICAL_RENDER_CONFIG } from "../../src/render/config/VisualRenderConfig";
import { CultivatedSurfaceMaterial } from "../../src/render/materials/CultivatedSurfaceMaterial";
import { buildStarterFarmGround } from "../../src/render/scene/StarterFarmGround";
import { FacetedWater, SHORE_MASK_METERS_PER_TEXEL } from "../../src/render/water/FacetedWater";
import { buildShoreFoamPatches, SHORE_FOAM_STYLE } from "../../src/render/water/ShoreFoam";
import { BoatWakePool } from "../../src/render/water/BoatWakePool";
import { STARTER_FARM_LAYOUT } from "../../src/world/FarmLayout";
import { WorldLayout } from "../../src/world/WorldLayout";
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
    for (const intensity of [CANONICAL_RENDER_CONFIG.shadows.intensity,
      CANONICAL_RENDER_CONFIG.shadows.nightIntensity, CANONICAL_RENDER_CONFIG.contact.opacity]) {
      expect(intensity).toBeGreaterThanOrEqual(0);
      expect(intensity).toBeLessThanOrEqual(1);
    }
    expect(CANONICAL_RENDER_CONFIG.fog.clearDayNear)
      .toBeLessThan(CANONICAL_RENDER_CONFIG.fog.clearDayFar);
    for (const value of [CANONICAL_RENDER_CONFIG.quality.high.shadowCameraSize,
      CANONICAL_RENDER_CONFIG.quality.medium.shadowCameraSize, CANONICAL_RENDER_CONFIG.quality.low.shadowCameraSize,
      CANONICAL_RENDER_CONFIG.gtao.radius, CANONICAL_RENDER_CONFIG.gtao.resolutionScale,
      CANONICAL_RENDER_CONFIG.groundSurface.polygonCellScaleMeters,
      CANONICAL_RENDER_CONFIG.terrainSurface.polygonCellScaleMeters,
      CANONICAL_RENDER_CONFIG.groundSurface.wetness.riseSeconds,
      CANONICAL_RENDER_CONFIG.groundSurface.wetness.fallSeconds]) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
    }
    const transition = CANONICAL_RENDER_CONFIG.terrainSurface.pathTransition;
    expect(transition.shoulderStart).toBeLessThan(transition.shoulderFull);
    expect(transition.coreStart).toBeLessThan(transition.coreFull);
    expect(CANONICAL_RENDER_CONFIG.roadSurface.edgeFadeStart)
      .toBeLessThan(CANONICAL_RENDER_CONFIG.roadSurface.edgeFadeFull);
  });

  it("uses shared bathymetry, continuous transmission and angle-dependent reflection", () => {
    const water = new FacetedWater({ width: 12, depth: 12 });
    const material = water.mesh.material;
    expect(material.fragmentShader).toContain("nevaOpticsField(worldPosition.xz)");
    expect(material.fragmentShader).toContain("exp(-uWaterAbsorption");
    expect(material.fragmentShader).toContain("pow(1.0 - ndvEffective, 5.0)");
    expect(material.uniforms.uFresnelStrength.value).toBe(
      CANONICAL_RENDER_CONFIG.waterSurface.fresnelStrength
    );
    expect(material.uniforms.uShallowEndMeters.value).toBe(
      CANONICAL_RENDER_CONFIG.waterSurface.shallowEndMeters
    );
    water.dispose();
  });

  it("builds a valid contact footprint and updates its opacity", () => {
    const shadow = createContactShadowMesh(0.64, 0.44, 0.23);
    expect(Array.from(shadow.geometry.getAttribute("position").array).every(Number.isFinite)).toBe(true);
    setContactShadowOpacity(shadow, 0.12);
    expect(shadow.material.uniforms.uOpacity.value).toBe(0.12);
    shadow.geometry.dispose();
    shadow.material.dispose();
  });

  it("places deterministic broken coastal foam patches", () => {
    const first = buildShoreFoamPatches();
    const second = buildShoreFoamPatches();
    expect(first).toEqual(second);
    expect(SHORE_FOAM_STYLE.minWidth).toBeGreaterThan(0);
    expect(SHORE_FOAM_STYLE.maxWidth).toBeGreaterThanOrEqual(SHORE_FOAM_STYLE.minWidth);
  });

  it("keeps generated coastal foam aligned with canonical water", () => {
    const patches = buildShoreFoamPatches();
    expect(patches.every((patch) => patch.source === "coast")).toBe(true);
    // W04.2: no dry-ground spill — the whole quad footprint stays water-side.
    expect(patches.every((patch) =>
      WorldLayout.waterSignedDistance(patch.center.x, patch.center.z) > patch.width * 0.5
    )).toBe(true);
    expect(SHORE_MASK_METERS_PER_TEXEL).toBeGreaterThan(0);
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
    expect(shader.uniforms.cultivatedCellScale.value).toBe(CANONICAL_RENDER_CONFIG.groundSurface.polygonCellScaleMeters);
    expect(shader.uniforms.cultivatedWetnessMix.value).toBe(CANONICAL_RENDER_CONFIG.groundSurface.cultivatedWetnessMix);
    cultivated.setWetness(4);
    expect(cultivated.wetness).toBe(1);
    cultivated.setWetness(-1);
    expect(cultivated.wetness).toBe(0);
    cultivated.dispose();
  });
});
