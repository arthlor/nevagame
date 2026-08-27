# Neva 3D Asset Reference Catalog

Two evidence classes live here. Do not treat them as the same target.

1. **Isolated studio sheets** (`isolated/*.jpg`) are style-match evidence for the mapped catalog ID: silhouette, proportions, facet scale, construction language, and palette blocks. Measure identity into catalog `parameters`. Do not pixel-copy them.
2. **Numbered crop/diorama PNGs** in the table below are graphics-only extracts from `art/references/art-reference.png`. They do not define world layout, camera, staging, or pixels to copy. Several of those filenames were never checked into git; fail closed rather than inventing replacements.

Catalog IDs win if this README drifts. The table is an evidence index, not a
budget authority: exact floors/targets/maxima/material caps come from the
catalog entry. Missing isolated files named by catalog `repo://` URIs fail
closed. Rows marked historical/unmapped are retained as graphics references and
must not be passed to the current generator or runtime.

This directory supports the Blender procedural generators in `tools/blender/`. Generation still goes through the catalog CLI (`npm run art:generate -- --asset <id>`), not polyfork import or a one-off GLB.

---

| File                              | Current catalog asset(s)                              | Current catalog target/max | Description                                                                  |
| :-------------------------------- | :---------------------------------------------------- | :------------------------- | :--------------------------------------------------------------------------- |
| `01_hero_farmhouse.png`           | `house_farmhouse_a.glb`                               | 24,000 / 65,000            | Red terracotta shingle roof, stone chimney, timber framing, porch & lanterns |
| `02_coastal_lighthouse.png`       | `building_lighthouse_a.glb`                           | 14,000 / 24,000            | Red/white banded lighthouse tower with lantern gallery on coastal cliff      |
| `03_stone_arch_bridge.png`        | `bridge_stone_a.glb`                                  | 28,000 / 45,000            | Double stone arch bridge with cobblestone pavers & timber railings           |
| `04_fish_market_dock.png`         | `dock_straight_a.glb` / `building_fish_market_a.glb`  | 3,000 / 12,000; 11,000 / 24,000 | Wooden pier and fish-market language with pilings, canopy, and working props |
| `05_fishing_boat_sloop.png`       | `boat_skiff_a.glb`                                    | 8,500 / 16,000             | Wooden coastal fishing boat with working hold, rope, buoys, and cargo cues   |
| `06_green_rowboat.png`            | `boat_rowboat_a.glb`                                  | 5,500 / 6,000              | Small green wooden dinghy/rowboat with wooden oars                           |
| `07_horse_cargo_cart.png`         | `prop_wagon_cart_a.glb`                               | 3,100 / 6,000              | Two-wheel wooden cargo wagon reference; catalog ID replaces the old vehicle name |
| `08_water_well.png`               | `prop_water_well_a.glb`                               | 3,000 / 6,000              | Circular stone water well with wooden timber roof & bucket                   |
| `09_pumpkin_patch.png`            | `prop_pumpkin_patch_a.glb`                            | 3,000 / 6,000              | Low-poly pumpkin patch with faceted orange pumpkins & leafy vines            |
| `10_wheat_field.png`              | `crop_wheat_mature.glb`                               | 940 / 1,400                | Clump of golden mature wheat stalks with seed heads                          |
| `11_apple_tree.png`               | `tree_apple_a.glb`                                    | 2,700 / 5,000              | Chunky faceted olive canopy with red apples and stylized bark                |
| `12_hay_bales_and_shed.png`       | `prop_hay_bale_a.glb`                                 | 1,500 / 2,500              | Stacked rectangular straw hay bales with twine bindings                      |
| `13_lobster_traps_and_crates.png` | `prop_lobster_trap_a.glb` / `prop_crate_wood_a.glb`   | 2,000 / 2,500; 900 / 2,500 | Working traps, crates, rope coils, and maritime storage cues                 |
| `14_dairy_cow.png`                | `fauna_cow_a.glb`                                     | 2,500 / 6,000              | Black and white faceted cow; catalog family is `prop`, not `character`       |
| `15_farm_chickens.png`            | `fauna_chicken_a.glb`                                 | 650 / 1,500                | Low-poly farm hens and roosters scratching the ground                       |
| `16_player_traveler.png`          | `char_player_a.glb`                                   | 12,000 / 18,000            | Adventurer in straw hat, expedition backpack, vest, boots                    |
| `17_hilltop_windmill.png`         | `building_windmill_a.glb`                             | 7,000 / 14,000             | Conical stone/timber windmill tower with rotating blades                     |
| `18_coastal_rocks.png`            | `rock_coastal_a.glb`                                  | 900 / 2,500                | Dark charcoal faceted coastal boulders and shoreline rocks                   |
| `19_distant_coastal_castle.png`   | **historical/unmapped**                               | —                          | No current `building_castle_a` catalog entry; graphics reference only        |
| `20_sailing_ship_sunset.png`      | **historical/unmapped**                               | —                          | No current `boat_tall_ship_a` catalog entry; graphics reference only          |

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
