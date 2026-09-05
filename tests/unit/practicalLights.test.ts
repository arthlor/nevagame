import { describe, expect, it } from "vitest";
import { PALETTE_HEX } from "../../src/render/materials/PaletteTokens";
import { CANONICAL_RENDER_CONFIG } from "../../src/render/config/VisualRenderConfig";
import catalog from "../../assets/specs/asset-catalog.json" with { type: "json" };
import {
  isPracticalLightSourceName,
  selectNearestPracticalLightIndices,
  uniquePracticalLightSourceNames
} from "../../src/render/lighting/practicalLightBudget";

describe("practical lights", () => {
  it("keeps one farmhouse lantern recipe without lighthouse-only fields", () => {
    const recipe = CANONICAL_RENDER_CONFIG.practicalLights;
    expect(recipe.colorHex).toBe(PALETTE_HEX.emissive_lantern_01);
    expect(recipe.localIntensity).toBe(18);
    expect(recipe.localDistance).toBe(13);
    expect(recipe.decay).toBe(2);
    expect(recipe).not.toHaveProperty("lighthouseIntensity");
    expect(recipe).not.toHaveProperty("lighthouseDistance");
    expect(CANONICAL_RENDER_CONFIG.quality.low.practicalLightBudget).toBe(1);
    expect(CANONICAL_RENDER_CONFIG.quality.medium.practicalLightBudget).toBe(3);
    expect(CANONICAL_RENDER_CONFIG.quality.high.practicalLightBudget).toBe(4);
  });

  it("collects unique glow and beacon source names", () => {
    expect(isPracticalLightSourceName("farmhouse_lantern_glow")).toBe(true);
    expect(isPracticalLightSourceName("lighthouse_lantern_beacon")).toBe(true);
    expect(isPracticalLightSourceName("lamp_post_lantern_pane_front")).toBe(false);
    expect(
      uniquePracticalLightSourceNames([
        "house_farmhouse_a_root",
        "farmhouse_lantern_glow",
        "farmhouse_lantern_glow",
        "lighthouse_lantern_beacon",
        "quest_waypoint_beacon",
        "wood_warm_01"
      ])
    ).toEqual(["farmhouse_lantern_glow", "lighthouse_lantern_beacon", "quest_waypoint_beacon"]);
  });

  it("gives every village dwelling a doorway lantern the runtime can find", () => {
    // The village carried no practical lights of its own: only the farmhouse and
    // the fish market declared a glow node, so after dusk the village went dark
    // while the starter farm stayed warm. Barns, sheds, outhouses and market
    // halls are deliberately excluded - see VILLAGE_LANTERN_VARIANTS.
    const dwellings = [
      "house_cottage_a",
      "house_cottage_b",
      "house_cottage_c",
      "building_inn_a",
      "building_inn_b"
    ];
    for (const id of dwellings) {
      const asset = catalog.assets.find((entry) => entry.id === id);
      expect(asset, `missing catalog entry ${id}`).toBeDefined();
      const glow = asset!.requiredNodes?.filter((node) => isPracticalLightSourceName(node)) ?? [];
      expect(glow, `${id} declares no practical-light node`).toHaveLength(1);
      // A preserved node cannot merge into the shared batch, so it must not also
      // drag a new material in behind it.
      expect(asset!.palette).toContain("emissive_window_01");
    }
  });

  it("enables the nearest lights up to the quality budget", () => {
    const focus = { x: 0, y: 0, z: 0 };
    const positions = [
      { x: 40, y: 2, z: 0 },
      { x: 4, y: 2, z: 0 },
      { x: 12, y: 2, z: 0 },
      { x: 8, y: 2, z: 0 },
      { x: 80, y: 12, z: 0 }
    ];
    expect(selectNearestPracticalLightIndices(positions, focus, 3)).toEqual([1, 3, 2]);
    expect(selectNearestPracticalLightIndices(positions, focus, 1)).toEqual([1]);
    expect(selectNearestPracticalLightIndices(positions, focus, 0)).toEqual([]);
    expect(selectNearestPracticalLightIndices([], focus, 4)).toEqual([]);
  });

  it("breaks equal distances with the original registration index", () => {
    const focus = { x: 0, y: 0, z: 0 };
    const positions = [
      { x: 10, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 }
    ];
    expect(selectNearestPracticalLightIndices(positions, focus, 2)).toEqual([0, 1]);
  });
});
