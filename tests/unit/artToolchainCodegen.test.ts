import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { renderGeneratedCatalog } from "../../tools/art/codegen.mjs";
import {
  computeAssetInputHash,
  computeAssetToolchainHash,
  validateCatalog
} from "../../tools/blender/cli.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");

describe("Neva generated art toolchain", () => {
  it("keeps the checked-in typed catalog projection byte-for-byte derived", () => {
    const { catalog } = validateCatalog();
    const generated = fs.readFileSync(
      path.join(ROOT, "src/render/assets/AssetCatalog.generated.ts"),
      "utf8"
    );
    expect(generated).toBe(renderGeneratedCatalog(catalog));
  });

  it("changes an asset input hash when authored inputs or generator families change", () => {
    const { catalog, palette } = validateCatalog();
    const oak = catalog.assets.find((asset) => asset.id === "tree_oak_a");
    const fish = catalog.assets.find((asset) => asset.id === "fish_trout_a");
    if (!oak || !fish) throw new Error("Hash fixtures are missing from the catalog");

    const base = computeAssetInputHash(oak, palette, "Blender 4.3.3");
    const changed = structuredClone(oak);
    changed.seed += 1;
    expect(computeAssetInputHash(changed, palette, "Blender 4.3.3")).not.toBe(base);
    expect(computeAssetToolchainHash(oak)).not.toBe(computeAssetToolchainHash(fish));
  });
});
