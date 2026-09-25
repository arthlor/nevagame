import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { AUTHORED_GENERATORS } from "../../tools/authored/generators/registry";
import { buildAuthoredAsset } from "../../tools/authored/pipeline/node-entry";
import type { CatalogAssetSpec } from "../../tools/authored/kit";

const ROOT = path.resolve(import.meta.dirname, "../..");
const contracts = JSON.parse(
  fs.readFileSync(path.join(ROOT, "tools/authored/generators/contracts.json"), "utf8")
) as Record<string, Record<string, unknown>>;
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/specs/asset-catalog.json"), "utf8")) as {
  assets: CatalogAssetSpec[];
};
const authoredAssets = catalog.assets.filter((asset) => Object.hasOwn(contracts, asset.generator));

describe("authored generator registry", () => {
  it("declares a parameter contract for exactly the registered generators", () => {
    expect(Object.keys(contracts).sort()).toEqual(Object.keys(AUTHORED_GENERATORS).sort());
  });

  it("never registers a generator name as a frozen legacy family or authored GLB as well", () => {
    // Each catalog generator has exactly one producer; the CLI refuses a dual registration at load.
    // Porting a legacy family moves its name out of legacy-generators.json into the registry.
    const legacy = JSON.parse(
      fs.readFileSync(path.join(ROOT, "tools/art/legacy-generators.json"), "utf8")
    ) as Record<string, unknown>;
    expect(Object.keys(legacy).length).toBeGreaterThan(50);
    for (const name of Object.keys(AUTHORED_GENERATORS)) {
      expect(Object.hasOwn(legacy, name), name).toBe(false);
      expect(name).not.toBe("authored_glb");
    }
  });

  it("has catalog assets for every authored generator", () => {
    const used = new Set(authoredAssets.map((asset) => asset.generator));
    for (const name of Object.keys(AUTHORED_GENERATORS)) expect(used.has(name), name).toBe(true);
  });
});

describe("authored producer", () => {
  it("builds every authored catalog asset through its art contract", async () => {
    expect(authoredAssets.length).toBeGreaterThan(0);
    for (const spec of authoredAssets) {
      const { glb, report } = await buildAuthoredAsset(spec);
      expect(report.artContractStatus, spec.id).toBe("passed");
      expect(glb.byteLength, spec.id).toBeGreaterThan(1000);
      for (const token of report.paletteTokensUsed) expect(spec.palette, spec.id).toContain(token);
    }
  });

  it("is byte-for-byte deterministic", async () => {
    for (const spec of authoredAssets) {
      const first = await buildAuthoredAsset(spec);
      const second = await buildAuthoredAsset(spec);
      expect(Buffer.from(first.glb).equals(Buffer.from(second.glb)), spec.id).toBe(true);
    }
  });

  it("rejects an asset that breaks its contract", async () => {
    const dog = authoredAssets.find((asset) => asset.id === "fauna_dog_a")!;
    await expect(buildAuthoredAsset({ ...dog, palette: ["soil_dry_01"] })).rejects.toThrow("undeclared palette token");
    await expect(buildAuthoredAsset({ ...dog, requiredNodes: [...dog.requiredNodes, "fauna_dog_a_missing"] }))
      .rejects.toThrow("missing required nodes");
    await expect(buildAuthoredAsset({ ...dog, budget: { ...dog.budget, trianglesMax: 100, trianglesMin: 10 } }))
      .rejects.toThrow("triangles outside");
  });
});
