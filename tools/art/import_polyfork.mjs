// tools/art/import_polyfork.mjs
import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MODELS_DIR = path.join(ROOT, "public/assets/models");

export const POLYFORK_IMPORTS = [
  // --- 1. Farming & Farmstead ---
  { sourceId: "tool-shed-f61f49", id: "prop_tool_shed_a", file: "prop_tool_shed_a.glb", family: "architecture", dimensions: { width: 2.0, depth: 2.0, height: 2.65 } },
  { sourceId: "beehive-2e70bf", id: "prop_beehive_a", file: "prop_beehive_a.glb", family: "prop", dimensions: { width: 0.47, depth: 0.58, height: 0.9 } },
  { sourceId: "potting-bench-3a85ec", id: "prop_potting_bench_a", file: "prop_potting_bench_a.glb", family: "prop", dimensions: { width: 1.5, depth: 0.6, height: 0.9 } },
  { sourceId: "turnip-crop-a5b3b7", id: "crop_turnip_mature", file: "crop_turnip_mature.glb", family: "crop", dimensions: { width: 0.54, depth: 0.59, height: 0.63 } },
  { sourceId: "pumpkin-crop-7de137", id: "crop_pumpkin_mature", file: "crop_pumpkin_mature.glb", family: "crop", dimensions: { width: 0.76, depth: 0.76, height: 0.4 } },
  { sourceId: "sunflower-80ce15", id: "foliage_sunflower_a", file: "foliage_sunflower_a.glb", family: "vegetation", dimensions: { width: 0.81, depth: 0.29, height: 1.79 } },
  { sourceId: "watering-can-b22758", id: "prop_watering_can_rustic_a", file: "prop_watering_can_rustic_a.glb", family: "prop", dimensions: { width: 0.18, depth: 0.46, height: 0.35 } },
  { sourceId: "garden-hoe-3974ad", id: "prop_garden_hoe_a", file: "prop_garden_hoe_a.glb", family: "prop", dimensions: { width: 0.4, depth: 0.26, height: 1.5 } },
  { sourceId: "wheelbarrow-0f8406", id: "prop_wheelbarrow_a", file: "prop_wheelbarrow_a.glb", family: "prop", dimensions: { width: 0.54, depth: 1.3, height: 0.75 } },
  { sourceId: "water-trough-df3ced", id: "prop_water_trough_a", file: "prop_water_trough_a.glb", family: "prop", dimensions: { width: 1.6, depth: 0.6, height: 0.5 } },
  { sourceId: "firewood-stack-810f49", id: "prop_firewood_stack_a", file: "prop_firewood_stack_a.glb", family: "prop", dimensions: { width: 2.0, depth: 0.98, height: 1.1 } },
  { sourceId: "milk-churn-895735", id: "prop_milk_churn_a", file: "prop_milk_churn_a.glb", family: "prop", dimensions: { width: 0.42, depth: 0.42, height: 0.8 } },
  { sourceId: "farm-gate-8ab320", id: "prop_farm_gate_a", file: "prop_farm_gate_a.glb", family: "prop", dimensions: { width: 2.0, depth: 0.28, height: 1.2 } },
  { sourceId: "wooden-fence-section-d72055", id: "prop_fence_section_a", file: "prop_fence_section_a.glb", family: "prop", dimensions: { width: 2.0, depth: 0.23, height: 1.1 } },
  { sourceId: "vegetable-bed-tile-d66915", id: "prop_vegetable_bed_tile_a", file: "prop_vegetable_bed_tile_a.glb", family: "prop", dimensions: { width: 4.0, depth: 4.0, height: 0.05 } },
  { sourceId: "tilled-soil-tile-d9152e", id: "prop_tilled_soil_tile_a", file: "prop_tilled_soil_tile_a.glb", family: "prop", dimensions: { width: 1.0, depth: 1.0, height: 0.05 } },
  { sourceId: "mushroom-cluster-f2e3ba", id: "foliage_mushroom_cluster_a", file: "foliage_mushroom_cluster_a.glb", family: "vegetation", dimensions: { width: 0.27, depth: 0.26, height: 0.23 } },

  // --- 2. Fishing, Harbor & Maritime ---
  { sourceId: "drying-net-rack-93ec3b", id: "prop_fish_drying_rack_a", file: "prop_fish_drying_rack_a.glb", family: "prop", dimensions: { width: 2.2, depth: 0.82, height: 1.66 } },
  { sourceId: "dock-platform-section-b36e7c", id: "prop_dock_platform_a", file: "prop_dock_platform_a.glb", family: "prop", dimensions: { width: 2.0, depth: 1.6, height: 0.62 } },
  { sourceId: "pier-rope-railing-616f5d", id: "prop_pier_railing_a", file: "prop_pier_railing_a.glb", family: "prop", dimensions: { width: 4.0, depth: 0.26, height: 1.0 } },
  { sourceId: "mooring-post-2b83a4", id: "prop_mooring_post_a", file: "prop_mooring_post_a.glb", family: "prop", dimensions: { width: 0.66, depth: 0.63, height: 1.1 } },
  { sourceId: "gangplank-572d4e", id: "prop_gangplank_a", file: "prop_gangplank_a.glb", family: "prop", dimensions: { width: 0.9, depth: 3.42, height: 1.9 } },
  { sourceId: "dock-lantern-post-5e58a4", id: "prop_dock_lantern_a", file: "prop_dock_lantern_a.glb", family: "prop", dimensions: { width: 0.51, depth: 0.94, height: 2.6 } },
  { sourceId: "hanging-signboard-c10e01", id: "prop_signboard_hanging_a", file: "prop_signboard_hanging_a.glb", family: "prop", dimensions: { width: 1.31, depth: 0.29, height: 1.93 } },
  { sourceId: "admiralty-anchor-bd6882", id: "prop_anchor_admiralty_a", file: "prop_anchor_admiralty_a.glb", family: "prop", dimensions: { width: 2.04, depth: 0.71, height: 2.36 } },
  { sourceId: "dive-marker-buoy-21beb7", id: "prop_marker_buoy_a", file: "prop_marker_buoy_a.glb", family: "prop", dimensions: { width: 0.34, depth: 0.38, height: 3.0 } },
  { sourceId: "sea-stack-369791", id: "rock_sea_stack_a", file: "rock_sea_stack_a.glb", family: "rock", dimensions: { width: 1.8, depth: 1.78, height: 4.5 } },
  { sourceId: "large-coastal-boulder-a2cab1", id: "rock_coastal_boulder_a", file: "rock_coastal_boulder_a.glb", family: "rock", dimensions: { width: 2.4, depth: 1.73, height: 1.54 } },
  { sourceId: "driftwood-log-90340b", id: "prop_driftwood_log_a", file: "prop_driftwood_log_a.glb", family: "prop", dimensions: { width: 2.02, depth: 0.81, height: 0.81 } },
  { sourceId: "beach-grass-tuft-0e699f", id: "foliage_beach_grass_a", file: "foliage_beach_grass_a.glb", family: "vegetation", dimensions: { width: 0.45, depth: 0.42, height: 0.5 } },
  { sourceId: "cargo-sack-3cd3ab", id: "prop_cargo_sack_a", file: "prop_cargo_sack_a.glb", family: "prop", dimensions: { width: 0.38, depth: 0.39, height: 0.7 } },
  { sourceId: "cargo-crate-9afc44", id: "prop_cargo_crate_large_a", file: "prop_cargo_crate_large_a.glb", family: "prop", dimensions: { width: 0.8, depth: 0.8, height: 0.8 } },

  // --- 3. Nature, Forest, Sky & Wildlife ---
  { sourceId: "broadleaf-oak-997c22", id: "tree_oak_broadleaf_a", file: "tree_oak_broadleaf_a.glb", family: "vegetation", dimensions: { width: 4.5, depth: 3.57, height: 6.98 } },
  { sourceId: "maple-tree-65fa12", id: "tree_maple_a", file: "tree_maple_a.glb", family: "vegetation", dimensions: { width: 3.29, depth: 3.21, height: 7.48 } },
  { sourceId: "tall-pine-tree-ab4108", id: "tree_pine_tall_a", file: "tree_pine_tall_a.glb", family: "vegetation", dimensions: { width: 3.67, depth: 3.56, height: 9.0 } },
  { sourceId: "young-pine-0d7695", id: "tree_pine_young_a", file: "tree_pine_young_a.glb", family: "vegetation", dimensions: { width: 1.86, depth: 1.89, height: 3.0 } },
  { sourceId: "dead-tree-6795fa", id: "tree_dead_a", file: "tree_dead_a.glb", family: "vegetation", dimensions: { width: 3.19, depth: 1.87, height: 5.0 } },
  { sourceId: "cattail-reed-6abbb3", id: "foliage_cattail_a", file: "foliage_cattail_a.glb", family: "vegetation", dimensions: { width: 0.39, depth: 0.29, height: 1.2 } },
  { sourceId: "lily-pad-86edbb", id: "foliage_lily_pad_a", file: "foliage_lily_pad_a.glb", family: "vegetation", dimensions: { width: 0.6, depth: 0.59, height: 0.04 } },
  { sourceId: "round-bush-cd2ac0", id: "foliage_bush_round_a", file: "foliage_bush_round_a.glb", family: "vegetation", dimensions: { width: 0.94, depth: 0.82, height: 0.74 } },
  { sourceId: "large-boulder-a29b99", id: "rock_boulder_large_a", file: "rock_boulder_large_a.glb", family: "rock", dimensions: { width: 2.2, depth: 1.98, height: 1.34 } },
  { sourceId: "rock-spire-13819c", id: "rock_spire_a", file: "rock_spire_a.glb", family: "rock", dimensions: { width: 1.29, depth: 1.46, height: 3.5 } },
  { sourceId: "fallen-log-1685fb", id: "prop_fallen_log_a", file: "prop_fallen_log_a.glb", family: "prop", dimensions: { width: 3.09, depth: 0.7, height: 0.9 } },
  { sourceId: "forest-rabbit-ea2da0", id: "fauna_rabbit_a", file: "fauna_rabbit_a.glb", family: "prop", dimensions: { width: 0.11, depth: 0.2, height: 0.3 } },
  { sourceId: "towering-cloud-2e00f1", id: "cloud_towering_a", file: "cloud_towering_a.glb", family: "cloud", dimensions: { width: 12.89, depth: 11.93, height: 12.27 } },
  { sourceId: "steam-plume-f06841", id: "prop_smoke_plume_a", file: "prop_smoke_plume_a.glb", family: "prop", dimensions: { width: 1.29, depth: 1.18, height: 2.83 } },

  // --- 4. Village & Settlement ---
  { sourceId: "market-stall-94937d", id: "building_market_stall_a", file: "building_market_stall_a.glb", family: "architecture", dimensions: { width: 1.96, depth: 1.13, height: 2.02 } },
  { sourceId: "log-plank-bridge-a5f74f", id: "bridge_log_plank_a", file: "bridge_log_plank_a.glb", family: "architecture", dimensions: { width: 4.0, depth: 1.72, height: 1.33 } },
  { sourceId: "clay-bread-oven-860b06", id: "prop_clay_oven_a", file: "prop_clay_oven_a.glb", family: "prop", dimensions: { width: 1.59, depth: 1.55, height: 1.52 } },
  { sourceId: "stone-fire-pit-4136b0", id: "prop_fire_pit_a", file: "prop_fire_pit_a.glb", family: "prop", dimensions: { width: 1.21, depth: 1.16, height: 0.67 } },
  { sourceId: "trail-map-kiosk-be8618", id: "prop_trail_kiosk_a", file: "prop_trail_kiosk_a.glb", family: "prop", dimensions: { width: 1.44, depth: 0.8, height: 2.0 } },
  { sourceId: "trail-signpost-bd29a7", id: "prop_signpost_trail_a", file: "prop_signpost_trail_a.glb", family: "prop", dimensions: { width: 1.15, depth: 1.16, height: 2.0 } },
  { sourceId: "campsite-picnic-table-361d51", id: "prop_picnic_table_a", file: "prop_picnic_table_a.glb", family: "prop", dimensions: { width: 2.0, depth: 1.6, height: 0.75 } },
  { sourceId: "wooden-bench-02e2c8", id: "prop_bench_wood_a", file: "prop_bench_wood_a.glb", family: "prop", dimensions: { width: 1.8, depth: 0.53, height: 0.9 } },
  { sourceId: "forest-outhouse-e968d1", id: "building_outhouse_a", file: "building_outhouse_a.glb", family: "architecture", dimensions: { width: 2.0, depth: 2.0, height: 2.2 } },
  { sourceId: "round-path-stone-4130f3", id: "prop_path_stone_round_a", file: "prop_path_stone_round_a.glb", family: "prop", dimensions: { width: 0.7, depth: 0.57, height: 0.06 } },
  { sourceId: "slab-path-stone-e526f7", id: "prop_path_stone_slab_a", file: "prop_path_stone_slab_a.glb", family: "prop", dimensions: { width: 1.1, depth: 0.7, height: 0.06 } },

  // --- 5. Shallow Marine & Reef Ecology ---
  { sourceId: "seagrass-tuft-862cc5", id: "foliage_seagrass_tuft_a", file: "foliage_seagrass_tuft_a.glb", family: "vegetation", dimensions: { width: 0.4, depth: 0.17, height: 0.5 } },
  { sourceId: "broad-algae-frond-88a644", id: "foliage_algae_frond_a", file: "foliage_algae_frond_a.glb", family: "vegetation", dimensions: { width: 0.59, depth: 0.44, height: 0.81 } },
  { sourceId: "small-reef-rock-99062d", id: "rock_reef_small_a", file: "rock_reef_small_a.glb", family: "rock", dimensions: { width: 0.5, depth: 0.46, height: 0.39 } },
  { sourceId: "pillar-coral-b6deba", id: "prop_coral_pillar_a", file: "prop_coral_pillar_a.glb", family: "prop", dimensions: { width: 0.87, depth: 0.82, height: 1.8 } },
  { sourceId: "staghorn-coral-422d23", id: "prop_coral_staghorn_a", file: "prop_coral_staghorn_a.glb", family: "prop", dimensions: { width: 1.27, depth: 0.85, height: 1.41 } },
  { sourceId: "table-coral-193fa6", id: "prop_coral_table_a", file: "prop_coral_table_a.glb", family: "prop", dimensions: { width: 1.59, depth: 1.6, height: 0.69 } },

  // --- 6. Farmhouse Interior ---
  { sourceId: "alcove-bookcase-83894d", id: "prop_bookcase_wood_a", file: "prop_bookcase_wood_a.glb", family: "prop", dimensions: { width: 1.0, depth: 0.4, height: 1.8 } },
  { sourceId: "sideboard-dd343b", id: "prop_sideboard_wood_a", file: "prop_sideboard_wood_a.glb", family: "prop", dimensions: { width: 1.4, depth: 0.45, height: 0.85 } },
  { sourceId: "floor-houseplant-8fad17", id: "prop_floor_plant_a", file: "prop_floor_plant_a.glb", family: "prop", dimensions: { width: 0.55, depth: 0.55, height: 1.2 } },
  { sourceId: "side-table-2ea5c0", id: "prop_side_table_wood_a", file: "prop_side_table_wood_a.glb", family: "prop", dimensions: { width: 0.5, depth: 0.5, height: 0.55 } },

  // --- 7. Items & Valuables ---
  { sourceId: "carrot-1f7e61", id: "item_carrot_a", file: "item_carrot_a.glb", family: "prop", dimensions: { width: 0.11, depth: 0.11, height: 0.29 } },
  { sourceId: "corn-cob-769fd8", id: "item_corn_cob_a", file: "item_corn_cob_a.glb", family: "prop", dimensions: { width: 0.12, depth: 0.12, height: 0.21 } },
  { sourceId: "apple-b15012", id: "item_apple_a", file: "item_apple_a.glb", family: "prop", dimensions: { width: 0.12, depth: 0.12, height: 0.13 } },
  { sourceId: "bread-loaf-0e0ab5", id: "item_bread_loaf_a", file: "item_bread_loaf_a.glb", family: "prop", dimensions: { width: 0.18, depth: 0.24, height: 0.14 } },
  { sourceId: "pie-c27178", id: "item_pie_a", file: "item_pie_a.glb", family: "prop", dimensions: { width: 0.26, depth: 0.25, height: 0.08 } },
  { sourceId: "coin-pouch-be4dd8", id: "item_coin_pouch_a", file: "item_coin_pouch_a.glb", family: "prop", dimensions: { width: 0.29, depth: 0.29, height: 0.34 } },
  { sourceId: "compass-d16dde", id: "item_compass_a", file: "item_compass_a.glb", family: "prop", dimensions: { width: 0.05, depth: 0.09, height: 0.06 } },
  { sourceId: "treasure-chest-c2ac4f", id: "prop_treasure_chest_a", file: "prop_treasure_chest_a.glb", family: "prop", dimensions: { width: 0.9, depth: 0.56, height: 0.6 } }
];

async function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const fileStream = fs.createWriteStream(destPath);
    const req = https.get(url, { headers: { "User-Agent": "Mozilla/5.0 (NevaGame/1.0)" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        fileStream.close();
        fs.unlink(destPath, () => {});
        return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
      }
      res.pipe(fileStream);
      fileStream.on("finish", () => {
        fileStream.close();
        resolve();
      });
    });
    req.on("error", (err) => {
      fileStream.close();
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

async function main() {
  console.log(`Starting download of ${POLYFORK_IMPORTS.length} assets from Polyfork...`);
  fs.mkdirSync(MODELS_DIR, { recursive: true });

  let downloaded = 0;
  for (const item of POLYFORK_IMPORTS) {
    const targetFile = path.join(MODELS_DIR, item.file);
    const cdnUrl = `https://polyfork.dev/cdn/${item.sourceId}.glb`;
    try {
      await downloadFile(cdnUrl, targetFile);
      downloaded++;
      console.log(`[${downloaded}/${POLYFORK_IMPORTS.length}] Downloaded ${item.file} from ${item.sourceId}`);
    } catch (err) {
      console.error(`Failed to download ${item.id} (${item.sourceId}):`, err.message);
    }
  }
  console.log(`Successfully downloaded ${downloaded} models.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
