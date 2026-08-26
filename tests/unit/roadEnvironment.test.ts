import { describe, expect, it } from "vitest";
import {
  FARM_ROUTES,
  WORLD_ROUTE_NETWORK,
  WorldLayout
} from "../../src/world/WorldLayout";
import { STARTER_FARM_LAYOUT, worldToFarmLocal } from "../../src/world/FarmLayout";
import {
  createWorldEnvironmentLayout,
  GROUND_COVER_DENSITY
} from "../../src/world/WorldEnvironmentLayout";

describe("Organic road environment", () => {
  it("keeps deterministic shoulder cover outside road cores and bridge geometry", () => {
    const first = createWorldEnvironmentLayout(42891);
    const second = createWorldEnvironmentLayout(42891);
    expect(second.groundCoverPlacements).toEqual(first.groundCoverPlacements);
    expect(first.groundCoverPlacements).toHaveLength(
      Object.values(GROUND_COVER_DENSITY.high).reduce((total, count) => total + count, 0)
    );

    const shoulderCover = first.groundCoverPlacements.filter((placement) =>
      WorldLayout.pathShoulderInfluence(placement.x, placement.z) > 0.12
    );
    expect(shoulderCover.length).toBeGreaterThan(0);
    expect(shoulderCover.every((placement) =>
      WorldLayout.pathInfluence(placement.x, placement.z) < 0.2
      && !WorldLayout.isBridgeDeck(placement.x, placement.z)
    )).toBe(true);
    expect(first.groundCoverPlacements.every((placement) =>
      !WorldLayout.isBridgeDeck(placement.x, placement.z)
    )).toBe(true);
  });

  it("preserves the farm gate opening and keeps authored road-side props clear", () => {
    const southFence = STARTER_FARM_LAYOUT.fenceAnchors.filter((anchor) => anchor.id.startsWith("fence_south_"));
    expect(southFence.some((anchor) => Math.abs(anchor.x) < 0.001)).toBe(false);

    const entry = FARM_ROUTES.find((route) => route.id === "farm-entry")!;
    const gatePoint = entry.points.find((point) => {
      const local = worldToFarmLocal(STARTER_FARM_LAYOUT.farmId, point);
      return Math.abs(local.x) < 0.001 && Math.abs(local.z + 7) < 0.001;
    });
    expect(gatePoint).toBeDefined();
    expect(WORLD_ROUTE_NETWORK.find((route) => route.id === "farm-village")!.points[0]).toEqual(
      entry.points.at(-1)
    );

    const authored = createWorldEnvironmentLayout(42891).staticPlacements.filter((placement) => placement.origin === "authored");
    const wagon = authored.find((placement) => placement.id === "authored.prop.wagon.farm-road")!;
    const bridgeReeds = authored.filter((placement) => placement.id.includes("bridge-"));
    expect(WorldLayout.pathInfluence(wagon.x, wagon.z)).toBeLessThan(0.12);
    expect(bridgeReeds.every((placement) => WorldLayout.pathInfluence(placement.x, placement.z) < 0.12)).toBe(true);
    expect(authored.filter((placement) => placement.assetId === "prop_wagon_cart_a")).toHaveLength(1);
    expect(authored.filter((placement) => placement.assetId === "foliage_reeds_a")).toHaveLength(2);
  });
});
