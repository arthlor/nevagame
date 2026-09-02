// Recasts the seven character palettes onto the reference sheet's material story:
// cloth garment + cream canvas + brown leather + brass hardware, with one distinct
// garment hue per trade so the cast stays readable.
//
// NPC slots:    [skin, garment_primary, dark, garment_secondary, accent, ...extra]
// Player slots: [skin, shirt, dark, canvas, band, trousers, ...extra]

import fs from "node:fs";

const CATALOG = "assets/specs/asset-catalog.json";
const SKIN = "plaster_warm_01";
const LEATHER = "wood_dark_01";
const CANVAS = "canvas_cream_01";
const BRASS = "metal_brass_01";

const PALETTES = {
  // player: the hero teal straight off the reference sheet
  char_player_a:      [SKIN, "accent_teal_01",   LEATHER, CANVAS, BRASS, "water_deep_01", "leather_harness_01"],
  // Elspeth, Village Baker & Garden Elder — garden sage
  char_npc_elspeth_a: [SKIN, "foliage_sage_01",  LEATHER, CANVAS, BRASS, "foam_warm_01"],
  // Barnaby, Homestead Handyman — warm workshop ochre
  char_npc_barnaby_a: [SKIN, "accent_ochre_01",  LEATHER, CANVAS, BRASS, "burlap_grain_01"],
  // Old Silas, Harbor Salt — oilskin over a sea-blue shirt
  char_npc_silas_a:   [SKIN, "water_mid_01",     "leather_harness_01", CANVAS, BRASS, "foam_warm_01"],
  // Maeve, Fishmonger & Market Master — harbor teal
  char_npc_maeve_a:   [SKIN, "accent_teal_01",   LEATHER, CANVAS, BRASS, "foam_warm_01"],
  // Tomas, Cove Boatkeeper — sea blue
  char_npc_tomas_a:   [SKIN, "water_mid_01",     LEATHER, CANVAS, BRASS, "burlap_grain_01"],
  // Ines, Terrace Grower — terrace olive
  char_npc_ines_a:    [SKIN, "foliage_olive_01", LEATHER, CANVAS, BRASS, "foam_warm_01"]
};

const catalog = JSON.parse(fs.readFileSync(CATALOG, "utf8"));
const list = Array.isArray(catalog) ? catalog : catalog.assets;
if (!Array.isArray(list)) throw new Error("could not locate the asset array in the catalog");

let changed = 0;
for (const asset of list) {
  const next = PALETTES[asset.id];
  if (!next) continue;
  const max = asset.budget?.materialsMax ?? 8;
  if (next.length > max) throw new Error(`${asset.id}: ${next.length} tokens exceeds materialsMax ${max}`);
  console.log(`${asset.id}\n  was ${JSON.stringify(asset.palette)}\n  now ${JSON.stringify(next)}`);
  asset.palette = next;
  changed += 1;
}

fs.writeFileSync(CATALOG, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`\nrecast ${changed} character palettes`);
