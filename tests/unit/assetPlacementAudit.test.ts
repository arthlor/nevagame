import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { ASSET_CATALOG, ASSET_IDS, type AssetId } from "../../src/render/assets/AssetCatalog";
import {
  ASSET_COVERAGE_DISPOSITIONS,
  assertAssetCoverageParity,
  getAssetCoverage,
  getAssetCoverageSummary
} from "../../src/render/assets/AssetCoverage";
import { FISH_SCHOOL_ASSETS } from "../../src/render/scene/FishSchoolAssets";
import {
  CROP_STAGE_ASSETS
} from "../../src/render/scene/CropInstanceRenderer";
import { FARMING_PROP_ASSET_IDS } from "../../src/render/assets/RuntimeAssetOwners";
import { createWorldEnvironmentLayout, isPlacementFootprintStable } from "../../src/world/WorldEnvironmentLayout";
import {
  HARBOR_DOCK,
  HARBOR_FISH_TABLE,
  HARBOR_MARKET,
  HARBOR_MAEVE_ANCHOR,
  HARBOR_SILAS_ANCHOR,
  HARBOR_SKIFF_MOORING
} from "../../src/world/WorldAnchors";
import { WorldLayout } from "../../src/world/WorldLayout";
import { PROCESSING_STATION_INTERACTION_RADIUS } from "../../src/simulation/domains/ProcessingDomain";

const ROOT = path.resolve(import.meta.dirname, "../..");

describe("Complete catalog-to-runtime asset coverage", () => {
  it("classifies every catalog asset exactly once with an owned placement source", () => {
    const records = getAssetCoverage(42891);
    const ids = records.map((record) => record.id);
    expect(records).toHaveLength(ASSET_CATALOG.length);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(ids)).toEqual(new Set(ASSET_CATALOG.map((asset) => asset.id)));
    expect(new Set(records.map((record) => record.disposition))).toEqual(new Set(ASSET_COVERAGE_DISPOSITIONS));
    for (const record of records) {
      expect(record.placementSource.length, record.id).toBeGreaterThan(0);
      expect(record.worldContext.length, record.id).toBeGreaterThan(0);
      expect(record.activationTrigger.length, record.id).toBeGreaterThan(0);
    }
    expect(() => assertAssetCoverageParity(42891)).not.toThrow();
  });

  it("covers the authored layout, crop stages, fish schools, tools, and fresh-save vessel", () => {
    const records = getAssetCoverage(42891);
    const byId = new Map(records.map((record) => [record.id, record]));
    const layout = createWorldEnvironmentLayout(42891);
    const layoutIds = new Set<AssetId>([
      ...layout.staticPlacements.map((placement) => placement.assetId as AssetId),
      ...layout.groundCoverPlacements.map((placement) => placement.assetId as AssetId)
    ]);
    for (const id of layoutIds) expect(byId.get(id)?.disposition, id).toBe("static-world");

    const stageIds = Object.values(CROP_STAGE_ASSETS).flatMap((stages) => Object.values(stages));
    expect(new Set(stageIds).size).toBe(19);
    for (const id of stageIds) {
      expect(byId.get(id)?.disposition, id).toBe(id === ASSET_IDS.TREE_APPLE_A ? "static-world" : "conditional-world");
    }
    for (const crop of ContentRegistry.crops.values()) {
      expect(CROP_STAGE_ASSETS[crop.id], crop.id).toBeDefined();
    }
    expect(CROP_STAGE_ASSETS["crop.wheat"].mature).toBe(ASSET_IDS.CROP_WHEAT_MATURE);
    expect(layout.staticPlacements).toContainEqual(expect.objectContaining({
      id: "authored.farm.pumpkin-patch",
      assetId: ASSET_IDS.PROP_PUMPKIN_PATCH_A
    }));

    expect(FISH_SCHOOL_ASSETS).toMatchObject({
      "fish.trout": ASSET_IDS.FISH_TROUT_A,
      "fish.tuna": ASSET_IDS.FISH_TUNA_A
    });
    for (const fish of ContentRegistry.fishSpecies.values()) {
      if (fish.isSportFish) expect(FISH_SCHOOL_ASSETS[fish.id], fish.id).toBeDefined();
    }
    expect(byId.get(ASSET_IDS.FISH_TROUT_A)?.freshSaveVisible).toBe(false);
    expect(byId.get(ASSET_IDS.FISH_TUNA_A)?.freshSaveVisible).toBe(false);
    for (const id of FARMING_PROP_ASSET_IDS) expect(byId.has(id)).toBe(true);

    const freshSave = createInitialGameState();
    expect(freshSave.boats["boat.player_rowboat"]).toMatchObject({
      boatTypeId: "boat.rowboat",
      isDocked: true,
      dockedMarketId: HARBOR_DOCK.marketId
    });
    expect(freshSave.boats["boat.player_skiff"]).toBeUndefined();
    expect(byId.get(ASSET_IDS.BOAT_ROWBOAT_A)?.freshSaveVisible).toBe(true);
    expect(byId.get(ASSET_IDS.BOAT_SKIFF_A)).toMatchObject({
      disposition: "progression-world",
      freshSaveVisible: false
    });
    expect(byId.get(ASSET_IDS.PROP_SMOKE_PLUME_A)).toMatchObject({
      disposition: "static-world",
      placementSource: "WorldScene farmhouse chimney attachment",
      worldContext: "Farmhouse chimney",
      freshSaveVisible: true
    });
  });

  it("keeps every authored grounding footprint and both harbor moorings usable", () => {
    const layout = createWorldEnvironmentLayout(42891);
    for (const placement of layout.staticPlacements) {
      if (placement.grounding) {
        const coastalRock = placement.assetId.startsWith("rock_coastal_");
        expect(
          isPlacementFootprintStable(placement, coastalRock ? 0.8 : 0.72, coastalRock ? 1.1 : 0.78),
          placement.id
        ).toBe(true);
      }
    }
    expect(WorldLayout.isSailable(HARBOR_DOCK.boatPosition.x, HARBOR_DOCK.boatPosition.z)).toBe(true);
    expect(WorldLayout.isSailable(HARBOR_SKIFF_MOORING.boatPosition.x, HARBOR_SKIFF_MOORING.boatPosition.z)).toBe(true);
    expect(WorldLayout.isWalkable(HARBOR_SKIFF_MOORING.playerPosition.x, HARBOR_SKIFF_MOORING.playerPosition.z)).toBe(true);
    expect(Math.hypot(
      HARBOR_SKIFF_MOORING.playerPosition.x - HARBOR_SKIFF_MOORING.boatPosition.x,
      HARBOR_SKIFF_MOORING.playerPosition.z - HARBOR_SKIFF_MOORING.boatPosition.z
    )).toBeLessThanOrEqual(HARBOR_SKIFF_MOORING.boardRadius);
  });

  it("keeps the harbor market, cleaning table, and NPC approach spaces distinct", () => {
    const market = HARBOR_MARKET.position;
    const table = HARBOR_FISH_TABLE.position;
    const dock = WorldLayout.landmark("dock");
    expect(Math.hypot(table.x - market.x, table.z - market.z)).toBeGreaterThan(5);
    expect(Math.hypot(HARBOR_MAEVE_ANCHOR.x - market.x, HARBOR_MAEVE_ANCHOR.z - market.z)).toBeGreaterThan(5);
    expect(Math.hypot(HARBOR_MAEVE_ANCHOR.x - table.x, HARBOR_MAEVE_ANCHOR.z - table.z))
      .toBeGreaterThan(PROCESSING_STATION_INTERACTION_RADIUS + 3.5);
    expect(Math.hypot(HARBOR_SILAS_ANCHOR.x - market.x, HARBOR_SILAS_ANCHOR.z - market.z)).toBeGreaterThan(10);
    expect(Math.hypot(HARBOR_SILAS_ANCHOR.x - dock.x, HARBOR_SILAS_ANCHOR.z - dock.z))
      .toBeGreaterThan(HARBOR_DOCK.dockRadius);
    expect(Math.hypot(
      HARBOR_SILAS_ANCHOR.x - HARBOR_DOCK.playerPosition.x,
      HARBOR_SILAS_ANCHOR.z - HARBOR_DOCK.playerPosition.z
    )).toBeGreaterThan(HARBOR_DOCK.boardRadius + 3.5);
    expect(Math.hypot(
      HARBOR_SILAS_ANCHOR.x - HARBOR_SKIFF_MOORING.playerPosition.x,
      HARBOR_SILAS_ANCHOR.z - HARBOR_SKIFF_MOORING.playerPosition.z
    )).toBeGreaterThan(HARBOR_SKIFF_MOORING.boardRadius + 3.5);
    for (const point of [table, HARBOR_MAEVE_ANCHOR, HARBOR_SILAS_ANCHOR]) {
      expect(WorldLayout.isWalkable(point.x, point.z)).toBe(true);
      expect(WorldLayout.isWater(point.x, point.z)).toBe(false);
      expect(WorldLayout.terrainNormal(point.x, point.z).y).toBeGreaterThan(0.85);
    }
  });

  it("keeps generated and public manifest/GLB parity for all 92 assets", () => {
    const generated = JSON.parse(
      fs.readFileSync(path.join(ROOT, "generated/reports/asset-manifest.json"), "utf8")
    ) as { assets: Array<{ id: string; file: string }> };
    const published = JSON.parse(
      fs.readFileSync(path.join(ROOT, "public/assets/models/asset-manifest.json"), "utf8")
    ) as typeof generated;
    expect(generated.assets).toHaveLength(ASSET_CATALOG.length);
    expect(published.assets).toHaveLength(ASSET_CATALOG.length);
    expect(generated.assets.map((asset) => asset.id).sort()).toEqual(published.assets.map((asset) => asset.id).sort());
    for (const asset of generated.assets) {
      expect(fs.existsSync(path.join(ROOT, "generated/glb", asset.file)), asset.id).toBe(true);
      expect(fs.existsSync(path.join(ROOT, "public/assets/models", asset.file)), asset.id).toBe(true);
      expect(published.assets.find((candidate) => candidate.id === asset.id)?.file).toBe(asset.file);
    }
  });

  it("reports the four contextual visibility buckets to the debug-only diagnostics surface", () => {
    const summary = getAssetCoverageSummary(42891);
    expect(summary.total).toBe(ASSET_CATALOG.length);
    expect(summary.byDisposition["progression-world"]).toBe(1);
    expect(summary.byDisposition["conditional-world"]).toBe(18);
    expect(summary.freshSaveVisible).toBeLessThan(summary.total);
  });
});
