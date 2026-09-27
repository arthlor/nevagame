import { describe, expect, it } from "vitest";
import { ASSET_BY_ID, type AssetId } from "../../src/render/assets/AssetCatalog";
import {
  AUTHORED_DETAIL_PLACEMENTS,
  isPlacementFootprintStable
} from "../../src/world/WorldEnvironmentLayout";
import { WorldLayout } from "../../src/world/WorldLayout";

const baseDressing = AUTHORED_DETAIL_PLACEMENTS.filter((placement) =>
  /^authored\.headwater\.(impact-(pebbles|bush)|pool-(pebbles|bush|meadow|flowers))/.test(placement.id)
);
const impactReeds = AUTHORED_DETAIL_PLACEMENTS.filter((placement) =>
  placement.id.startsWith("authored.headwater.impact-reeds-")
);
const impactRocks = AUTHORED_DETAIL_PLACEMENTS.filter((placement) =>
  placement.id.startsWith("authored.headwater.impact-rock-")
);

describe("headwater pool base dressing", () => {
  it("grounds nonblocking assets on both dry impact shelves and keeps the east bank walk open", () => {
    expect(baseDressing.length).toBeGreaterThanOrEqual(12);
    expect(baseDressing.some((placement) => placement.id.includes("impact-")
      && placement.x < WorldLayout.riverCenterX(placement.z))).toBe(true);
    expect(baseDressing.some((placement) => placement.id.includes("impact-")
      && placement.x > WorldLayout.riverCenterX(placement.z))).toBe(true);

    for (const placement of baseDressing) {
      expect(ASSET_BY_ID.get(placement.assetId as AssetId)?.collision, placement.id).toBe("none");
      expect(isPlacementFootprintStable(placement), placement.id).toBe(true);
      expect(WorldLayout.waterSignedDistance(placement.x, placement.z), placement.id)
        .toBeLessThan(-0.85);
      const eastBankWalkX = WorldLayout.riverCenterX(placement.z) + 7.5;
      if (placement.x > WorldLayout.riverCenterX(placement.z) && placement.z > -132) {
        expect(Math.abs(placement.x - eastBankWalkX), placement.id).toBeGreaterThan(1.85);
      }
    }
  });

  it("roots impact reeds only at the wet margin", () => {
    expect(impactReeds).toHaveLength(2);
    for (const placement of impactReeds) {
      expect(ASSET_BY_ID.get(placement.assetId as AssetId)?.collision, placement.id).toBe("none");
      expect(Math.abs(WorldLayout.waterSignedDistance(placement.x, placement.z)), placement.id)
        .toBeLessThan(0.5);
    }
  });

  it("embeds dark stones in the nonwalkable plunge margin", () => {
    expect(impactRocks).toHaveLength(2);
    for (const placement of impactRocks) {
      expect(ASSET_BY_ID.get(placement.assetId as AssetId)?.collision, placement.id).toBe("none");
      expect(WorldLayout.isWater(placement.x, placement.z), placement.id).toBe(true);
    }
  });

  it("keeps the shallow impact fan scoured instead of exposing a pale gravel triangle", () => {
    const shallowImpact = WorldLayout.terrainSurfaceSample(-33, -130.5).weights;
    expect(shallowImpact.cliff).toBeGreaterThan(0.2);
    expect(shallowImpact.riverbed).toBeLessThan(0.35);
  });
});
