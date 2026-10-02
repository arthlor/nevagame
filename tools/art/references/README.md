# Neva 3D Asset Reference Catalog

This is an optional reference library and historical image index. The current task chooses whether to use a reference and which aspects matter; agents may revise or remove catalog briefs and freely change visual design. No image here creates a permanent identity, camera, composition, palette, construction or human-approval lock.

Isolated sheets and numbered crops may inform the selected task. Some listed files were never checked into git. A missing file still fails validation when a catalog brief declares its `repo://` URI; remove or revise that obsolete brief deliberately rather than inventing evidence. Catalog IDs and runtime interfaces win if this index drifts. Historical/unmapped rows are optional source material, never runtime asset IDs.

The catalog entry owns exact runtime contracts and hard budgets; minimums, targets and lower LOD ratios are advisory. This index does not copy those numbers. Generation remains the registered catalog CLI path (`npm run art:generate -- --asset <id>`), not a one-off GLB.

---

| File                              | Current catalog asset(s)                              | Description                                                                  |
| :-------------------------------- | :---------------------------------------------------- | :--------------------------------------------------------------------------- |
| `01_hero_farmhouse.png`           | `house_farmhouse_a.glb`                               | Red terracotta shingle roof, stone chimney, timber framing, porch & lanterns |
| `02_coastal_lighthouse.png`       | `building_lighthouse_a.glb`                           | Red/white banded lighthouse tower with lantern gallery on coastal cliff      |
| `03_stone_arch_bridge.png`        | `bridge_stone_a.glb`                                  | Double stone arch bridge with cobblestone pavers & timber railings           |
| `04_fish_market_dock.png`         | `dock_straight_a.glb` / `building_fish_market_a.glb`  | Wooden pier and fish-market language with pilings, canopy, and working props |
| `05_fishing_boat_sloop.png`       | `boat_skiff_a.glb`                                    | Wooden coastal fishing boat with working hold, rope, buoys, and cargo cues   |
| `06_green_rowboat.png`            | `boat_rowboat_a.glb`                                  | Small green wooden dinghy/rowboat with wooden oars                           |
| `07_horse_cargo_cart.png`         | `prop_wagon_cart_a.glb`                               | Two-wheel wooden cargo wagon reference; catalog ID replaces the old vehicle name |
| `08_water_well.png`               | `prop_water_well_a.glb`                               | Circular stone water well with wooden timber roof & bucket                   |
| `09_pumpkin_patch.png`            | `prop_pumpkin_patch_a.glb`                            | Low-poly pumpkin patch with faceted orange pumpkins & leafy vines            |
| `10_wheat_field.png`              | `crop_wheat_mature.glb`                               | Clump of golden mature wheat stalks with seed heads                          |
| `11_apple_tree.png`               | `tree_apple_a.glb`                                    | Chunky faceted olive canopy with red apples and stylized bark                |
| `12_hay_bales_and_shed.png`       | `prop_hay_bale_a.glb`                                 | Stacked rectangular straw hay bales with twine bindings                      |
| `13_lobster_traps_and_crates.png` | `prop_lobster_trap_a.glb` / `prop_crate_wood_a.glb`   | Working traps, crates, rope coils, and maritime storage cues                 |
| `14_dairy_cow.png`                | `fauna_cow_a.glb`                                     | Black and white faceted cow; catalog family is `prop`, not `character`       |
| `15_farm_chickens.png`            | `fauna_chicken_a.glb`                                 | Low-poly farm hens and roosters scratching the ground                       |
| `16_player_traveler.png`          | `char_player_a.glb`                                   | Adventurer in straw hat, expedition backpack, vest, boots                    |
| `17_hilltop_windmill.png`         | `building_windmill_a.glb`                             | Conical stone/timber windmill tower with rotating blades                     |
| `18_coastal_rocks.png`            | `rock_coastal_a.glb`                                  | Dark charcoal faceted coastal boulders and shoreline rocks                   |
| `19_distant_coastal_castle.png`   | **historical/unmapped**                               | No current `building_castle_a` catalog entry; graphics reference only        |
| `20_sailing_ship_sunset.png`      | **historical/unmapped**                               | No current `boat_tall_ship_a` catalog entry; graphics reference only          |

---

## 1. Studio Model Turnaround Reference Sheets (`tools/art/references/isolated/`)

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

## 2. NPC Chibi Storybook Proportion Study

`../../output/imagegen/npc-chibi-storybook-turnaround.png` is a historical generated study. Its panels may inform a current task when selected; they do not constrain NPC proportions, materials or construction. It is source evidence, not a runtime asset or a required family standard.
