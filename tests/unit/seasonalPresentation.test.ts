import { afterEach, describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildSeasonPresentation } from "../../src/simulation/presentation/SeasonPresentation";
import { DAYS_PER_SEASON, MINUTES_PER_DAY } from "../../src/simulation/core/GameClock";
import { architectureWindowMaterial, disposeArchitectureWindows, updateArchitectureWindows, windowEmissionAt } from "../../src/render/materials/WindowMaterial";
import { PALETTE_SPECS } from "../../src/render/materials/PaletteTokens";

afterEach(disposeArchitectureWindows);
describe("season and inhabited windows", () => {
  it("keeps a fresh spring neutral and makes a season boundary continuous", () => {
    expect(buildSeasonPresentation({ season: "spring", currentMinute: 480 }).previous).toBe("spring");
    const start = DAYS_PER_SEASON * MINUTES_PER_DAY;
    expect(buildSeasonPresentation({ season: "summer", currentMinute: start })).toEqual({ previous: "spring", current: "summer", blend: 0 });
    expect(buildSeasonPresentation({ season: "summer", currentMinute: start + MINUTES_PER_DAY / 2 }).blend).toBe(0.5);
    expect(buildSeasonPresentation({ season: "summer", currentMinute: start + MINUTES_PER_DAY }).blend).toBe(1);
  });
  it("staggers windows without lighting walls or changing source materials", () => {
    const window = new THREE.MeshStandardMaterial();
    window.name = "emissive_window_01";
    const wall = new THREE.MeshStandardMaterial();
    wall.name = "plaster_cream_01";
    expect(architectureWindowMaterial(wall, "village.inn")).toBe(wall);
    const variant = architectureWindowMaterial(window, "village.inn") as THREE.MeshStandardMaterial;
    updateArchitectureWindows(0);
    expect(variant.emissiveIntensity).toBe(0);
    updateArchitectureWindows(1);
    expect(variant.emissiveIntensity).toBe(PALETTE_SPECS.emissive_window_01.emissiveStrength);
    expect(window.emissiveIntensity).toBe(1);
    expect(windowEmissionAt(0.4, 0)).toBeGreaterThan(windowEmissionAt(0.4, 0.3));
    window.dispose(); wall.dispose();
  });
});
