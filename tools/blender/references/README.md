# Neva 3D Asset Reference Catalog

Two evidence classes live here. Do not treat them as the same target.

1. **Isolated studio sheets** (`isolated/*.jpg`) are style-match evidence for the mapped catalog ID: silhouette, proportions, facet scale, construction language, and palette blocks. Measure identity into catalog `parameters`. Do not pixel-copy them.
2. **Numbered crop/diorama PNGs** in the table below are graphics-only extracts from `art/references/art-reference.png`. They do not define world layout, camera, staging, or pixels to copy. Several of those filenames were never checked into git; fail closed rather than inventing replacements.

Catalog IDs win if this README drifts (`prop_wagon_cart_a`, not `vehicle_horse_cart_a`). Missing isolated files named by catalog `repo://` URIs fail closed.

This directory supports the Blender procedural generators in `tools/blender/`. Generation still goes through the catalog CLI (`npm run art:generate -- --asset <id>`), not polyfork import or a one-off GLB.

---

| File                              | Target GLB Asset                                     | Budget Class                           | Triangles (Target/Max) | Description                                                                  |
| :-------------------------------- | :--------------------------------------------------- | :------------------------------------- | :--------------------- | :--------------------------------------------------------------------------- |
| `01_hero_farmhouse.png`           | `house_farmhouse_a.glb`                              | `hero_building`                        | 12,000 / 18,000        | Red terracotta shingle roof, stone chimney, timber framing, porch & lanterns |
| `02_coastal_lighthouse.png`       | `building_lighthouse_a.glb`                          | `hero_building`                        | 12,000 / 18,000        | Red/white banded lighthouse tower with lantern gallery on coastal cliff      |
| `03_stone_arch_bridge.png`        | `bridge_stone_a.glb`                                 | `landmark_structure`                   | 9,000 / 16,000         | Double stone arch bridge with cobblestone pavers & timber railings           |
| `04_fish_market_dock.png`         | `dock_straight_a.glb` / `building_fish_market_a.glb` | `landmark_structure` / `hero_building` | 9,000 / 12,000         | Wooden pier with timber pilings & red/white striped canopy market stall      |
| `05_fishing_boat_sloop.png`       | `boat_skiff_a.glb`                                   | `skiff`                                | 11,000 / 16,000        | Wooden coastal fishing boat with cream canvas sails & deck cargo crates      |
| `06_green_rowboat.png`            | `boat_rowboat_a.glb`                                 | `rowboat`                              | 4,000 / 6,000          | Small green wooden dinghy/rowboat with wooden oars                           |
| `07_horse_cargo_cart.png`         | `vehicle_horse_cart_a.glb`                           | `large_prop`                           | 3,000 / 6,000          | 2-wheel wooden cargo wagon loaded with flour/grain sacks & draft horse       |
| `08_water_well.png`               | `prop_water_well_a.glb`                              | `large_prop`                           | 3,000 / 6,000          | Circular stone water well with wooden timber roof & bucket                   |
| `09_pumpkin_patch.png`            | `prop_pumpkin_patch_a.glb`                           | `large_prop`                           | 3,000 / 6,000          | Low-poly pumpkin patch with faceted orange pumpkins & leafy vines            |
| `10_wheat_field.png`              | `crop_wheat_mature.glb`                              | `crop_clump`                           | 350 / 700              | Clump of golden mature wheat stalks with seed heads                          |
| `11_apple_tree.png`               | `tree_apple_a.glb`                                   | `tree`                                 | 1,500 / 3,000          | Chunky faceted olive canopy with red apples and stylized bark                |
| `12_hay_bales_and_shed.png`       | `prop_hay_bale_a.glb`                                | `normal_prop`                          | 900 / 2,500            | Stacked rectangular straw hay bales with twine bindings                      |
| `13_lobster_traps_and_crates.png` | `prop_lobster_trap_a.glb` / `prop_crate_wood_a.glb`  | `normal_prop`                          | 900 / 2,500            | Wooden shipping crates, barrels, rope coils, and wire lobster creels         |
| `14_dairy_cow.png`                | `char_cow_a.glb`                                     | `character`                            | 6,000 / 12,000         | Black and white spotted dairy cow with chunky faceted geometry               |
| `15_farm_chickens.png`            | `char_chicken_a.glb`                                 | `tiny_prop`                            | 350 / 1,200            | White low-poly farm hens and roosters scratching the ground                  |
| `16_player_traveler.png`          | `char_player_a.glb`                                  | `character`                            | 12,000 / 18,000        | Adventurer in straw hat, expedition backpack, vest, boots                    |
| `17_hilltop_windmill.png`         | `building_windmill_a.glb`                            | `support_building`                     | 6,000 / 10,000         | Conical stone/timber windmill tower with 4 rotating blades                   |
| `18_coastal_rocks.png`            | `rock_coastal_a.glb`                                 | `normal_prop`                          | 900 / 2,500            | Dark charcoal faceted coastal boulders and shoreline rocks                   |
| `19_distant_coastal_castle.png`   | `building_castle_a.glb`                              | `landmark_structure`                   | 9,000 / 16,000         | Distant medieval fortress / coastal citadel silhouette                       |
| `20_sailing_ship_sunset.png`      | `boat_tall_ship_a.glb`                               | `skiff` / `landmark_structure`         | 11,000 / 16,000        | 3-masted tall ship / caravel sailing on the open sea                         |

---

## 1. Studio Model Turnaround Reference Sheets (`tools/blender/references/isolated/`)

Dedicated multi-angle and isolated studio reference renders with clean neutral
backgrounds, faceted planar geometry, and calibrated lighting:

1. **`farmhouse_isolated_*.jpg`** — 3/4 isometric perspective of the Hero
   Farmhouse with stone chimney, porch veranda, and warm lantern.
2. **`lighthouse_isolated_*.jpg`** — Coastal lighthouse tower with red/white
   bands, keeper cottage, and faceted rock foundation.
3. **`stone_bridge_isolated_*.jpg`** — Double stone arch bridge with cobblestone
   roadway, timber railings, and iron lantern post.
4. **`fishing_boat_isolated_*.jpg`** — Coastal fishing sloop with canvas sails,
   red pennant, deck crates, barrel, and side rope fenders.
5. **`dock_market_isolated_*.jpg`** — Timber plank pier on wooden pilings with
   striped awning fish market stall and crates.
6. **`horse_cart_isolated_*.jpg`** — 2-wheel wooden cargo wagon loaded with tied
   burlap sacks and harness draft horse.
7. **`farm_props_isolated_*.jpg`** — Modular prop sheet containing water well,
   pumpkin patch, hay bales, wooden fence, barrel, and crate.
8. **`trees_vegetation_isolated_*.jpg`** — Vegetation model sheet with faceted
   apple tree, oak tree, bushes, reeds, wireframes, and palette swatches.
9. **`character_isolated_*.jpg`** — 8-way orthographic/turnaround sheet for the
   Player Character (Front, 3/4, Profile, Back) with straw hat and backpack.
10. **`farm_animals_isolated_*.jpg`** — Multi-angle model sheets for Dairy Cow,
    Hens, and Farm Dog with facet shading and polygon callouts.
