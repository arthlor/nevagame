import { describe, expect, it } from "vitest";
import catalog from "../../assets/specs/asset-catalog.json";
import { ASSET_BY_ID, type AssetId } from "../../src/render/assets/AssetCatalog";
import { HEADWATER_GRAYBOX_VIEWPOINTS } from "../../src/world/HeadwaterWaterfallGraybox";
import { NEVA_HEADWATERS } from "../../src/world/NevaHeadwaters";
import { RIVER_DRESSING_ASSET_SIZES } from "../../src/world/NevaRiverDressing";
import { RIVER_BOAT_LANE_HALF_WIDTH_METERS, nevaRiverFeatures } from "../../src/world/NevaRiverFeatures";
import { createWorldEnvironmentLayout, isPlacementFootprintStable } from "../../src/world/WorldEnvironmentLayout";
import { RIVER_FISHING_ACCESS_RESERVES, WORLD_LAYOUT_V5, WorldLayout } from "../../src/world/WorldLayout";

const layout = createWorldEnvironmentLayout(42891);
const dressing = layout.staticPlacements.filter((placement) => placement.id.startsWith("authored.river.")
  && placement.id !== "authored.river.lily-pocket");
const byPrefix = (prefix: string) => dressing.filter((placement) => placement.id.startsWith(`authored.river.${prefix}`));

describe("Silverwater river dressing", () => {
  it("sizes stones and logs against the published catalog footprints", () => {
    for (const [assetId, [width, depth, height]] of Object.entries(RIVER_DRESSING_ASSET_SIZES)) {
      const spec = catalog.assets.find((asset) => asset.id === assetId);
      expect(spec, assetId).toBeDefined();
      expect(spec!.dimensions.width, assetId).toBeCloseTo(width, 3);
      expect(spec!.dimensions.depth, assetId).toBeCloseTo(depth, 3);
      expect(spec!.dimensions.height, assetId).toBeCloseTo(height, 3);
    }
  });

  it("derives every channel zone: cascade sills, riffles, cut banks, bars, snags, reeds, lilies and bank plants", () => {
    const features = nevaRiverFeatures();
    const roles = new Set(features.stones.map((stone) => stone.role));
    expect(roles).toEqual(new Set(["cascade-sill", "cascade-bank", "riffle", "cut-bank", "pool-margin", "bar-edge"]));
    expect(features.stones.filter((stone) => stone.role === "cascade-sill").length)
      .toBeGreaterThanOrEqual(NEVA_HEADWATERS.cascade.steps.length * 2);
    expect(features.snags.length).toBeGreaterThanOrEqual(2);
    expect(features.reedBeds.length).toBeGreaterThanOrEqual(4);
    expect(features.lilyPatches.length).toBeGreaterThanOrEqual(2);
    expect(features.bankPlants.filter((plant) => plant.kind === "willow").length).toBeGreaterThanOrEqual(8);
    expect(features.bankPlants.filter((plant) => plant.kind === "fern").length).toBeGreaterThanOrEqual(3);
    // Deterministic and seed-independent: one shared world.
    expect(createWorldEnvironmentLayout(98765).staticPlacements.filter((placement) =>
      placement.id.startsWith("authored.river.") && placement.id !== "authored.river.lily-pocket")).toEqual(dressing);
    expect(new Set(dressing.map((placement) => placement.id)).size).toBe(dressing.length);
  });

  it("keeps the sailable lane, the bridge crossing and the fishing approaches clear", () => {
    const bridgeZ = WORLD_LAYOUT_V5.anchors.bridge.z;
    for (const stone of nevaRiverFeatures().stones) {
      expect(Math.abs(stone.z - bridgeZ), stone.id).toBeGreaterThan(12);
      if (!stone.inWater || stone.z < NEVA_HEADWATERS.endZ) continue;
      const section = WorldLayout.riverSectionAt(stone.z);
      const lateral = stone.x - section.centerX;
      expect(Math.abs(lateral - section.thalwegOffset) - stone.radius, stone.id)
        .toBeGreaterThanOrEqual(RIVER_BOAT_LANE_HALF_WIDTH_METERS - 1e-6);
    }
    for (const placement of dressing) {
      const bank = WorldLayout.riverBankSample(placement.x, placement.z);
      const reserved = RIVER_FISHING_ACCESS_RESERVES.some((reserve) => reserve.side === bank.side
        && Math.abs(placement.z - reserve.z) < reserve.halfLengthMeters);
      expect(reserved, placement.id).toBe(false);
    }
  });

  it("seats stones on the bed and snags in the water, and floats lily pads at the surface", () => {
    const stones = byPrefix("stone.");
    expect(stones.length).toBeGreaterThanOrEqual(30);
    for (const stone of stones) {
      // The foot never hovers: it reaches into the bed or bank it stands on.
      expect(stone.y!, stone.id).toBeLessThanOrEqual(WorldLayout.terrainHeight(stone.x, stone.z) + 1e-6);
    }
    for (const lily of byPrefix("lily.")) {
      expect(WorldLayout.isWater(lily.x, lily.z), lily.id).toBe(true);
      expect(lily.y!, lily.id).toBeCloseTo(WorldLayout.riverSectionAt(lily.z).surfaceElevation + 0.035, 6);
    }
    for (const snag of byPrefix("snag.")) {
      expect(snag.y!, snag.id).toBeLessThan(WorldLayout.riverSectionAt(snag.z).surfaceElevation);
    }
  });

  it("ends the west bank in a rocky point and dresses the sandy east shoulder of the mouth", () => {
    const mouth = byPrefix("mouth.");
    const west = mouth.filter((placement) => placement.x < WorldLayout.riverSectionAt(placement.z).centerX);
    const east = mouth.filter((placement) => placement.x > WorldLayout.riverSectionAt(placement.z).centerX);
    expect(west.filter((placement) => placement.assetId.startsWith("rock_coastal")).length).toBeGreaterThanOrEqual(3);
    expect(east.filter((placement) => placement.assetId.startsWith("prop_driftwood")).length).toBeGreaterThanOrEqual(3);
    expect(east.filter((placement) => placement.assetId === "foliage_beach_grass_a").length).toBeGreaterThanOrEqual(4);
    for (const placement of east) {
      expect(WorldLayout.isWater(placement.x, placement.z), placement.id).toBe(false);
      // Driftwood lies on open sand; the dune grass holds its landward edge.
      const sand = WorldLayout.terrainSurfaceSample(placement.x, placement.z).weights.beach;
      expect(sand, placement.id).toBeGreaterThan(placement.assetId === "foliage_beach_grass_a" ? 0.15 : 0.25);
    }
    for (const placement of west.filter((candidate) => candidate.assetId.startsWith("rock_coastal"))) {
      expect(placement.y!, placement.id).toBeLessThanOrEqual(WorldLayout.terrainHeight(placement.x, placement.z));
      expect(WorldLayout.pathInfluence(placement.x, placement.z), placement.id).toBeLessThan(0.05);
    }
  });

  it("roots willows and ferns on dry, stable bank ground away from walks and review stances", () => {
    const willows = dressing.filter((placement) => placement.assetId === "foliage_willow_shrub_a");
    const ferns = dressing.filter((placement) => placement.assetId === "foliage_fern_a");
    expect(willows.length).toBeGreaterThanOrEqual(8);
    expect(ferns.length).toBeGreaterThanOrEqual(3);
    for (const willow of willows) {
      expect(isPlacementFootprintStable(willow, 0.76, 0.72), willow.id).toBe(true);
      expect(WorldLayout.pathInfluence(willow.x, willow.z), willow.id).toBeLessThan(0.02);
    }
    for (const fern of ferns) {
      expect(WorldLayout.isWater(fern.x, fern.z), fern.id).toBe(false);
    }
    const colliding = dressing.filter((placement) => ASSET_BY_ID.get(placement.assetId as AssetId)?.collision !== "none");
    for (const viewpoint of HEADWATER_GRAYBOX_VIEWPOINTS) {
      for (const placement of colliding) {
        expect(Math.hypot(placement.x - viewpoint.cameraPosition.x, placement.z - viewpoint.cameraPosition.z), placement.id)
          .toBeGreaterThan(1.8);
      }
    }
  });
});
