import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

interface CropEntry {
  id: string;
  family: string;
  generator: string;
  dimensions: { width: number; depth: number; height: number };
  parameters: Record<string, number | string>;
}

function cropEntries(): CropEntry[] {
  const raw = JSON.parse(
    fs.readFileSync(path.join(ROOT, "assets/specs/asset-catalog.json"), "utf8")
  ) as { assets: CropEntry[] };
  return raw.assets.filter((asset) => asset.family === "crop");
}

describe("crop authoring scale", () => {
  it("keeps fruit within real-world size", () => {
    for (const asset of cropEntries()) {
      const radius = asset.parameters.fruitRadius;
      if (typeof radius !== "number") continue;
      // Cluster radii (tomato) read at roughly half per fruit; direct radii
      // (orchard) read whole. Either way nothing edible exceeds ~9cm radius.
      expect(radius, `${asset.id} fruitRadius`).toBeLessThanOrEqual(0.09);
    }
  });

  it("keeps leaves within real-world size", () => {
    for (const asset of cropEntries()) {
      const width = asset.parameters.leafWidth;
      if (typeof width !== "number") continue;
      expect(width, `${asset.id} leafWidth`).toBeLessThanOrEqual(0.18);
    }
  });

  it("grows orchard crops into real trees", () => {
    for (const asset of cropEntries()) {
      if (asset.generator !== "apple_tree_crop" && asset.generator !== "olive_crop") continue;
      const stage = asset.parameters.stage;
      const height = asset.parameters.height;
      if (typeof height !== "number" || stage === "seeded" || stage === "sprout") continue;
      const minimum = stage === "growing" ? 1.0 : 2.4;
      expect(height, `${asset.id} height`).toBeGreaterThanOrEqual(minimum);
    }
  });

  it("keeps dimensions plausible for the tuned height", () => {
    for (const asset of cropEntries()) {
      const height = asset.parameters.height;
      if (typeof height !== "number" || height < 0.5) continue;
      // Foliage and fruit extend past the stem-height parameter, so catalog
      // height must cover it without ballooning past twice the tuned value.
      expect(asset.dimensions.height, `${asset.id} dimensions.height`).toBeGreaterThanOrEqual(height * 0.5);
      expect(asset.dimensions.height, `${asset.id} dimensions.height`).toBeLessThanOrEqual(height * 2);
    }
  });
});
