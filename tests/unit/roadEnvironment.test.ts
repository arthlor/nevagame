import { describe, expect, it } from "vitest";
import {
  FARM_ROUTES,
  WORLD_ROUTE_NETWORK,
  WorldLayout
} from "../../src/world/WorldLayout";
import { STARTER_FARM_LAYOUT, worldToFarmLocal } from "../../src/world/FarmLayout";
import {
  createWorldEnvironmentLayout,
  generateFarmPathPaverSamples,
  GROUND_COVER_DENSITY,
  HOMESTEAD_MEADOW_GRASS_COUNT
} from "../../src/world/WorldEnvironmentLayout";
import { groundCoverActiveCount } from "../../src/render/config/VisualRenderConfig";

describe("Organic road environment", () => {
  it("keeps quality density monotonic without changing the canonical high layout", () => {
    expect(groundCoverActiveCount(100, "low")).toBe(24);
    expect(groundCoverActiveCount(100, "medium")).toBe(48);
    expect(groundCoverActiveCount(100, "high")).toBe(60);
  });

  it("keeps deterministic shoulder cover outside road cores and bridge geometry", () => {
    const first = createWorldEnvironmentLayout(42891);
    const second = createWorldEnvironmentLayout(42891);
    expect(second.groundCoverPlacements).toEqual(first.groundCoverPlacements);
    expect(first.groundCoverPlacements).toHaveLength(
      Object.values(GROUND_COVER_DENSITY.high).reduce((total, count) => total + count, 0)
        + HOMESTEAD_MEADOW_GRASS_COUNT
    );

    const shoulderCover = first.groundCoverPlacements.filter((placement) =>
      placement.id.includes("ground-cover.shoulder.pebbles")
    );
    expect(shoulderCover.length).toBeGreaterThan(0);
    expect(shoulderCover.every((placement) =>
      WorldLayout.pathInfluence(placement.x, placement.z) < 0.2
      && !WorldLayout.isBridgeDeck(placement.x, placement.z)
    )).toBe(true);
    expect(first.groundCoverPlacements.every((placement) =>
      !WorldLayout.isBridgeDeck(placement.x, placement.z)
    )).toBe(true);

    const pathPebbles = first.groundCoverPlacements.filter((placement) =>
      placement.id.includes("ground-cover.path.pebbles")
    );
    expect(pathPebbles.length).toBeGreaterThan(0);
    expect(pathPebbles.every((placement) =>
      WorldLayout.pathInfluence(placement.x, placement.z) > 0.28
      && !WorldLayout.isBridgeDeck(placement.x, placement.z)
    )).toBe(true);
  });

  it("forms correlated grass and flower patches instead of even world scatter", () => {
    const cover = createWorldEnvironmentLayout(42891).groundCoverPlacements;
    const grass = cover.filter((placement) => placement.category === "grass");
    const flowers = cover.filter((placement) => placement.category === "flowers");

    const nearbyFraction = (
      placements: typeof grass,
      radius: number
    ): number => {
      const cellSize = radius;
      const buckets = new Map<string, typeof grass>();
      const keyAt = (x: number, z: number) => `${Math.floor(x / cellSize)}:${Math.floor(z / cellSize)}`;
      for (const placement of placements) {
        const key = keyAt(placement.x, placement.z);
        const bucket = buckets.get(key) ?? [];
        bucket.push(placement);
        buckets.set(key, bucket);
      }
      let nearby = 0;
      for (const placement of placements) {
        const cellX = Math.floor(placement.x / cellSize);
        const cellZ = Math.floor(placement.z / cellSize);
        let found = false;
        for (let offsetZ = -1; offsetZ <= 1 && !found; offsetZ += 1) {
          for (let offsetX = -1; offsetX <= 1 && !found; offsetX += 1) {
            const bucket = buckets.get(`${cellX + offsetX}:${cellZ + offsetZ}`) ?? [];
            found = bucket.some((candidate) =>
              candidate.id !== placement.id
              && Math.hypot(candidate.x - placement.x, candidate.z - placement.z) <= radius
            );
          }
        }
        if (found) nearby += 1;
      }
      return nearby / placements.length;
    };

    expect(nearbyFraction(grass, 1.5)).toBeGreaterThan(0.72);
    expect(nearbyFraction(flowers, 1.1)).toBeGreaterThan(0.62);
  });

  it("preserves the farm gate opening and keeps authored road-side props clear", () => {
    const southFence = STARTER_FARM_LAYOUT.fenceAnchors.filter((anchor) => anchor.id.startsWith("fence_south_"));
    expect(southFence.some((anchor) => Math.abs(anchor.x) < 0.001)).toBe(false);
    const farmhouse = STARTER_FARM_LAYOUT.farmsteadAnchors.find((anchor) => anchor.id === "farmhouse")!;
    const eastFence = STARTER_FARM_LAYOUT.fenceAnchors.filter((anchor) => anchor.id.startsWith("fence_east_"));
    expect(eastFence.every((anchor) => Math.hypot(anchor.x - farmhouse.x, anchor.z - farmhouse.z) >= farmhouse.clearanceRadius)).toBe(true);

    const entry = FARM_ROUTES.find((route) => route.id === "farm-entry")!;
    const gatePoint = entry.points.find((point) => {
      const local = worldToFarmLocal(STARTER_FARM_LAYOUT.farmId, point);
      return Math.abs(local.x) < 0.001 && Math.abs(local.z + 7) < 0.001;
    });
    expect(gatePoint).toBeDefined();
    expect(entry.points[0]).toEqual(gatePoint);
    expect(WORLD_ROUTE_NETWORK.find((route) => route.id === "farm-village")!.points[0]).toEqual(
      entry.points.at(-1)
    );

    const authored = createWorldEnvironmentLayout(42891).staticPlacements.filter((placement) => placement.origin === "authored");
    const wagon = authored.find((placement) => placement.id === "authored.prop.wagon.farm-road")!;
    const firewood = authored.find((placement) => placement.id === "authored.farm.firewood")!;
    const firewoodLocal = worldToFarmLocal(STARTER_FARM_LAYOUT.farmId, firewood);
    expect(Math.hypot(
      firewoodLocal.x - farmhouse.x,
      firewoodLocal.z - farmhouse.z
    )).toBeGreaterThanOrEqual(farmhouse.clearanceRadius);
    const bridgeReeds = authored.filter((placement) => placement.id.includes("bridge-"));
    expect(WorldLayout.pathInfluence(wagon.x, wagon.z)).toBeLessThan(0.12);
    expect(bridgeReeds.every((placement) => WorldLayout.pathInfluence(placement.x, placement.z) < 0.12)).toBe(true);
    expect(authored.filter((placement) => placement.assetId === "prop_wagon_cart_a")).toHaveLength(1);
    expect(authored.filter((placement) => placement.assetId === "foliage_reeds_a")).toHaveLength(2);
  });

  it("places deterministic stepping slabs on packed farmstead cores", () => {
    const first = generateFarmPathPaverSamples();
    const second = generateFarmPathPaverSamples();
    expect(second).toEqual(first);
    expect(first.length).toBeGreaterThan(8);
    expect(first.every((paver) =>
      WorldLayout.pathInfluence(paver.x, paver.z) > 0.32
      && WorldLayout.farmSoilInfluence(paver.x, paver.z) < 0.16
      && !WorldLayout.isWater(paver.x, paver.z)
      && !WorldLayout.isBridgeDeck(paver.x, paver.z)
    )).toBe(true);
    expect(first.some((paver) =>
      Math.hypot(paver.x - STARTER_FARM_LAYOUT.origin.x, paver.z - STARTER_FARM_LAYOUT.origin.z) < 18
    )).toBe(true);
  });
});
