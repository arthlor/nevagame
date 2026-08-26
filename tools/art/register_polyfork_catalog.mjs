// tools/art/register_polyfork_catalog.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { POLYFORK_IMPORTS } from "./import_polyfork.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CATALOG_PATH = path.join(ROOT, "assets/specs/asset-catalog.json");

const DEFAULT_PALETTES = {
  vegetation: ["foliage_sage_01", "foliage_olive_01", "wood_warm_01", "grass_yellow_01"],
  rock: ["rock_coastal_dark_01", "stone_cool_01", "stone_warm_01"],
  architecture: ["wood_warm_01", "wood_dark_01", "plaster_warm_01", "roof_terracotta_01"],
  crop: ["foliage_leaf_01", "soil_warm_01", "accent_ochre_01"],
  cloud: ["sky_pale_01", "foam_warm_01"],
  prop: ["wood_warm_01", "metal_dark_01", "canvas_cream_01", "stone_golden_01"]
};

function buildCatalogEntry(item) {
  const isBuilding = item.family === "architecture" || item.id.includes("bridge") || item.id.includes("shed") || item.id.includes("stall") || item.id.includes("outhouse");
  const isLargeRock = item.family === "rock" && (item.id.includes("stack") || item.id.includes("spire") || item.id.includes("large"));
  const hasBoxCollision = isBuilding || isLargeRock || item.id.includes("drying_rack") || item.id.includes("firewood");

  const palette = DEFAULT_PALETTES[item.family] || DEFAULT_PALETTES.prop;
  const pivot = item.id.startsWith("item_") || item.id.includes("cloud") ? "center" : "ground_center";

  const width = Number(item.dimensions.width.toFixed(2));
  const depth = Number(item.dimensions.depth.toFixed(2));
  const height = Number(item.dimensions.height.toFixed(2));

  const entry = {
    id: item.id,
    file: item.file,
    family: item.family,
    generator: `polyfork_${item.family}`,
    seed: 100 + item.id.length,
    dimensions: { width, depth, height },
    palette,
    budget: {
      trianglesMin: 10,
      trianglesTarget: 350,
      trianglesMax: 650,
      materialsMax: 2
    },
    pivot,
    collision: hasBoxCollision ? "box" : "none",
    instancing: !isBuilding,
    lod: "none",
    rootNode: `${item.id}_root`,
    requiredNodes: [`${item.id}_root`],
    readDistanceMeters: item.family === "vegetation" || isBuilding ? 30 : 15,
    parameters: {}
  };

  if (hasBoxCollision) {
    entry.collisionPrimitives = [
      {
        id: "main",
        center: [0, Number((height / 2).toFixed(2)), 0],
        halfExtents: [Number((width / 2).toFixed(2)), Number((height / 2).toFixed(2)), Number((depth / 2).toFixed(2))]
      }
    ];
  }

  return entry;
}

export function updateCatalog() {
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
  
  // Filter out any existing Polyfork entries and re-insert fresh
  const polyforkIds = new Set(POLYFORK_IMPORTS.map(p => p.id));
  catalog.assets = catalog.assets.filter(a => !polyforkIds.has(a.id));

  for (const item of POLYFORK_IMPORTS) {
    const entry = buildCatalogEntry(item);
    catalog.assets.push(entry);
  }

  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2) + "\n");
  console.log(`Updated ${CATALOG_PATH}: registered ${POLYFORK_IMPORTS.length} Polyfork assets (total: ${catalog.assets.length}).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  updateCatalog();
}
