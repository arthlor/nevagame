import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CANONICAL_RENDER_CONFIG } from "../../src/render/config/VisualRenderConfig";
import { buildStarterFarmGround } from "../../src/render/scene/StarterFarmGround";
import { SHORE_MASK_RESOLUTION } from "../../src/render/water/FacetedWater";
import { buildShoreFoamPatches, SHORE_FOAM_STYLE, ShoreFoam } from "../../src/render/water/ShoreFoam";
import { BoatWakePool } from "../../src/render/water/BoatWakePool";
import { STARTER_FARM_LAYOUT } from "../../src/world/FarmLayout";

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
    expect(CANONICAL_RENDER_CONFIG.quality.high.ambientOcclusion).toBe("contact");
    expect(CANONICAL_RENDER_CONFIG.gtao.resolutionScale).toBeLessThan(1);
    expect(CANONICAL_RENDER_CONFIG.shadows.vegetationCastDistanceMeters).toBe(28);
  });

  it("builds deterministic broken coastal foam patches", () => {
    const first = new ShoreFoam();
    const second = new ShoreFoam();
    const firstPositions = Array.from(first.mesh.geometry.getAttribute("position").array);
    const secondPositions = Array.from(second.mesh.geometry.getAttribute("position").array);

    expect(firstPositions.length).toBeGreaterThan(100);
    expect(firstPositions).toEqual(secondPositions);
    expect(SHORE_FOAM_STYLE.minWidth).toBeLessThan(0.2);
    expect(SHORE_FOAM_STYLE.maxWidth).toBeLessThan(0.5);
    expect(first.mesh.material.uniforms.uMaxAlpha.value).toBeLessThanOrEqual(0.4);

    first.dispose();
    second.dispose();
  });

  it("keeps foam to broken coast segments and leaves the river banks clear", () => {
    const patches = buildShoreFoamPatches();
    const coast = patches.filter((patch) => patch.source === "coast");
    const mouth = { x: 15, z: 82 };
    expect(patches.length).toBeGreaterThan(20);
    expect(patches.every((patch) => patch.source === "coast")).toBe(true);
    expect(coast.every((patch) => Math.abs(patch.center.x - mouth.x) > 8)).toBe(true);
    const widestGap = coast
      .slice(1)
      .reduce((gap, patch, index) => Math.max(gap, patch.center.x - coast[index].center.x), 0);
    expect(widestGap).toBeGreaterThan(SHORE_FOAM_STYLE.coastSpacing * 1.5);
    expect(SHORE_MASK_RESOLUTION).toBeGreaterThan(256);
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
});
