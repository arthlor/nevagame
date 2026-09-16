import { OCEAN_ISLETS } from "./OceanIslets";
import type { EnvironmentAssetPlacement } from "./WorldEnvironmentLayout";

/** Small readable clusters, with an unobstructed southern landing and central walk. */
export function oceanIsletPlacements(): EnvironmentAssetPlacement[] {
  return OCEAN_ISLETS.flatMap((islet) => {
    const place = (id: string, assetId: string, x: number, z: number, scale = 1, rotationY = 0): EnvironmentAssetPlacement => ({
      id: `authored.${islet.id.slice(7)}.${id}`, origin: "authored", islandId: islet.id,
      biomeId: "biome.neva_temperate", assetId, x: islet.x + x, z: islet.z + z,
      scale: [scale, scale, scale], rotationY
    });
    return [
      place("pine-west", "tree_pine_a", -12, -6, 1.05, 0.4),
      place("pine-rear", "tree_pine_a", -6, -13, 0.83, 2.1),
      place("pine-east", "tree_pine_a", 13, -7, 0.72, 1.4),
      place("stone-west", "rock_boulder_a", -18, 3, 1.3, 0.7),
      place("stone-east", "rock_boulder_a", 17, -3, 1.1, 2.3),
      place("stone-rear", "rock_boulder_a", 3, -15, 1.45, 1.6),
      place("driftwood", "prop_driftwood_a", -8, islet.radiusZ - 8, 1, 0.5),
      { ...place("landing-marker", "prop_marker_buoy_a", -7, islet.radiusZ + 10), y: 0 },
      ...(islet.id === "island.gull_rest" ? [
        place("weathered-seat", "prop_bench_wood_a", 3, 5, 0.92, Math.PI),
        place("gull-rock", "rock_sea_stack_a", 7, -14, 0.72, 1.1),
        place("pale-pebbles", "rock_pebble_cluster_a", -10, 10, 1.2, 0.3)
      ] : []),
      ...(islet.id === "island.driftwood" ? [
        place("saved-supplies", "prop_treasure_chest_a", 8, 4, 0.88, Math.PI),
        place("camp-fire", "prop_fire_pit_a", -2, 3, 0.9),
        place("camp-drying-rack", "prop_fish_drying_rack_a", -11, 4, 0.9, 1.2),
        place("camp-barrel", "prop_barrel_wood_a", 13, 6, 0.82, 0.4),
        place("camp-driftwood", "prop_driftwood_b", 11, 0, 1.2, 2.4)
      ] : []),
      ...(islet.id === "island.lantern" ? [
        place("spire", "rock_spire_a", 0, -11, 1.6, 0.35),
        place("old-lantern", "prop_dock_lantern_a", 4, 5, 1.05, 0.4),
        place("waymark", "prop_signpost_trail_a", -5, 7, 0.92, -0.5),
        place("reef-stone", "rock_coastal_b", 13, 10, 1.1, 1.8)
      ] : [])
    ];
  });
}
