import { describe, expect, it } from "vitest";
import { CANONICAL_RENDER_CONFIG } from "../../src/render/config/VisualRenderConfig";
import { isWithinVegetationCastRange } from "../../src/render/scene/vegetationShadowRange";
import { HARBOR_MARKET, RIVER_CROSSING, VILLAGE_PLAZA, WORLD_SPAWN } from "../../src/world/WorldAnchors";

describe("vegetation sun-shadow range", () => {
  const spawn = WORLD_SPAWN.playerPosition;
  const max = CANONICAL_RENDER_CONFIG.shadows.vegetationCastDistanceMeters;

  it("includes the farm oak that origin-distance would reject", () => {
    expect(Math.hypot(-82, -47)).toBeGreaterThan(max);
    expect(isWithinVegetationCastRange(-82, -47, spawn.x, spawn.z)).toBe(true);
  });

  it("includes homestead, village, harbor, and river-crossing trees", () => {
    expect(isWithinVegetationCastRange(-82, -47, spawn.x, spawn.z)).toBe(true);
    expect(isWithinVegetationCastRange(VILLAGE_PLAZA.x, VILLAGE_PLAZA.z, spawn.x, spawn.z)).toBe(true);
    expect(isWithinVegetationCastRange(HARBOR_MARKET.position.x, HARBOR_MARKET.position.z, spawn.x, spawn.z)).toBe(true);
    expect(isWithinVegetationCastRange(RIVER_CROSSING.x, RIVER_CROSSING.z, spawn.x, spawn.z)).toBe(true);
  });

  it("follows the player so a distant grove casts once they walk up to it", () => {
    expect(isWithinVegetationCastRange(200, 200, spawn.x, spawn.z)).toBe(false);
    expect(isWithinVegetationCastRange(200, 200, 200, 200)).toBe(true);
  });
});
