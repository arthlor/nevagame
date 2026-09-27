import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";
import { applyWeatherProfile } from "../../src/simulation/weather/updateWeather";
import type { WeatherTag } from "../../src/simulation/core/types";
import { CANONICAL_RENDER_CONFIG } from "../../src/render/config/VisualRenderConfig";
import { deriveLightingFrame } from "../../src/render/lighting/LightingRig";
import {
  RIVER_MIST_FRAGMENT_GLSL,
  RIVER_MIST_VERTEX_GLSL,
  RiverMist,
  createRiverMistGeometry,
  riverMistReach
} from "../../src/render/water/RiverMist";
import { WorldLayout } from "../../src/world/WorldLayout";

const CONFIG = CANONICAL_RENDER_CONFIG.waterSurface.riverMist;

function mistAt(weather: WeatherTag, minute: number): number {
  const state = createInitialGameState(42891);
  applyWeatherProfile(state.weather, weather);
  state.clock.currentMinute = minute;
  return deriveLightingFrame(state, 30).riverMist;
}

describe("river mist", () => {
  it("settles on still dawns and in fog, and burns off, blows away or rains out", () => {
    expect(mistAt("clear", 390)).toBeGreaterThan(0.9);
    expect(mistAt("clear", 780)).toBe(0);
    expect(mistAt("fog", 780)).toBeGreaterThan(0.8);
    expect(mistAt("clear", CONFIG.eveningMinutes[1])).toBeCloseTo(CONFIG.eveningShare, 2);
    expect(mistAt("windy", 390)).toBe(0);
    expect(mistAt("heavy-rain", 390)).toBe(0);
    expect(mistAt("storm", 390)).toBe(0);
    expect(mistAt("cloudy", 780)).toBe(0);
  });

  it("lies low over the channel, deterministically, from the pool to the estuary", () => {
    const { startZ, endZ } = riverMistReach();
    expect(endZ - startZ).toBeGreaterThan(100);
    for (const tier of ["low", "medium", "high"] as const) {
      const geometry = createRiverMistGeometry(tier);
      const repeat = createRiverMistGeometry(tier);
      try {
        const position = geometry.getAttribute("position");
        expect(position.count % 6).toBe(0);
        expect(position.count).toBeLessThanOrEqual(CONFIG.count[tier] * 6);
        expect(position.count).toBeGreaterThan(CONFIG.count[tier] * 6 * 0.9);
        expect(Array.from(repeat.getAttribute("position").array)).toEqual(Array.from(position.array));
        for (let index = 0; index < position.count; index += 6) {
          const x = position.getX(index);
          const y = position.getY(index);
          const z = position.getZ(index);
          const section = WorldLayout.riverSectionAt(z);
          expect(z).toBeGreaterThanOrEqual(startZ);
          expect(z).toBeLessThanOrEqual(endZ);
          expect(x).toBeGreaterThanOrEqual(section.centerX - section.leftWaterWidth - CONFIG.bankOverhangMeters - 1e-6);
          expect(x).toBeLessThanOrEqual(section.centerX + section.rightWaterWidth + CONFIG.bankOverhangMeters + 1e-6);
          expect(y - section.surfaceElevation).toBeGreaterThan(CONFIG.liftMeters * 0.7);
        }
      } finally {
        geometry.dispose();
        repeat.dispose();
      }
    }
    for (const source of [RIVER_MIST_VERTEX_GLSL, RIVER_MIST_FRAGMENT_GLSL]) {
      expect(source).not.toMatch(/texture(2D)?\(\s*uOpaque/);
    }
    expect(RIVER_MIST_FRAGMENT_GLSL).toContain("nevaAerialSegment");
  });

  it("shares the water uniforms, hides at zero mist and owns its resources", () => {
    const shared = { uTime: { value: 0 } } as unknown as Record<string, THREE.IUniform>;
    const mist = new RiverMist({ sharedUniforms: shared, tier: "medium" });
    expect(mist.mesh.material.uniforms.uTime).toBe(shared.uTime);
    expect(mist.mesh.material.depthWrite).toBe(false);
    expect(mist.mesh.visible).toBe(false);
    mist.setAmount(0.6);
    expect(mist.mesh.visible).toBe(true);
    expect(mist.mesh.material.uniforms.uRiverMistAmount.value).toBeCloseTo(0.6);
    mist.setAmount(0);
    expect(mist.mesh.visible).toBe(false);
    const geometry = mist.mesh.geometry;
    mist.setQuality("low");
    expect(mist.mesh.geometry).not.toBe(geometry);
    mist.dispose();
    expect(mist.group.children).toHaveLength(0);
  });
});
