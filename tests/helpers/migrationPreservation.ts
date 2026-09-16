import { expect } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import type { GameState } from "../../src/simulation/core/types";

export const COMMONS_FARM_ID = "farm.player_homestead";

/**
 * Authored Commons dimensions after the layout 18/19 move. The migration
 * rewrites these two fields from the legacy 7x7 plot; every other farm and
 * every other farm field must survive byte-for-byte.
 */
export const COMMONS_FARM_METERS = { widthMeters: 21, depthMeters: 12 } as const;

function withoutCommonsMeters(farms: GameState["farms"]): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(farms).map(([id, farm]) => {
      if (id !== COMMONS_FARM_ID) {
        // v45 authors the starter kitchen; legacy saves gain the placement
        // while every other farm field must survive byte-for-byte.
        if (id === "farm.starter_garden") {
          const { placedStructureIds: _placed, ...rest } = farm;
          return [id, rest];
        }
        return [id, farm];
      }
      const { widthMeters: _width, depthMeters: _depth, ...rest } = farm;
      return [id, rest];
    })
  );
}

/**
 * Asserts all farm state is preserved except the Commons dimensions, which the
 * layout 18/19 migrations intentionally re-author, and pins those dimensions to
 * the current authored layout.
 */
export function expectFarmsPreserved(after: GameState, before: GameState): void {
  expect(withoutCommonsMeters(after.farms), "farms").toEqual(withoutCommonsMeters(before.farms));
  expect(after.farms["farm.starter_garden"].placedStructureIds).toContain("struct.kitchen");
  const commons = after.farms[COMMONS_FARM_ID];
  if (commons && before.farms[COMMONS_FARM_ID]) {
    expect(commons.widthMeters, "commons width").toBe(COMMONS_FARM_METERS.widthMeters);
    expect(commons.depthMeters, "commons depth").toBe(COMMONS_FARM_METERS.depthMeters);
  }
}

/**
 * Asserts every authored commodity a legacy market still carries survives, while
 * allowing the migration to backfill newly authored commodity rows. Comparing
 * whole `markets` objects would fail each time content adds a listing.
 */
export function expectMarketsPreserved(after: GameState, before: GameState): void {
  for (const [marketId, oldMarket] of Object.entries(before.markets)) {
    const migrated = after.markets[marketId];
    expect(migrated, marketId).toBeDefined();
    expect(migrated).toMatchObject({
      id: oldMarket.id,
      name: oldMarket.name,
      regionId: oldMarket.regionId
    });
    const currentCommodityIds = new Set(
      ContentRegistry.markets.get(marketId)?.commodities.map((commodity) => commodity.itemId) ?? []
    );
    for (const [itemId, commodity] of Object.entries(oldMarket.commodities)) {
      if (currentCommodityIds.has(itemId)) {
        expect(migrated!.commodities[itemId], `${marketId}/${itemId}`).toEqual(commodity);
      }
    }
    expect(Object.keys(migrated!.commodities)).toEqual(
      expect.arrayContaining([...currentCommodityIds])
    );
  }
}
