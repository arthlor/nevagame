import { expect } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { MAIN_HARBOR_LAYOUT_REVISION } from "../../src/persistence/migrateMainHarbor69";
import { WORK_CAPACITY_MAXIMUM } from "../../src/simulation/domains/ProgressionDomain";
import { PLAYER_SATCHEL_SLOT_COUNT } from "../../src/simulation/inventory/InventoryLimits";
import type { GameState } from "../../src/simulation/core/types";
import { VILLAGE_TRADE_STATIONS } from "../../src/world/VillageTradeLayout";
import { harborMooringForBoatType } from "../../src/world/WorldAnchors";

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

/**
 * Asserts boat state survives a migration chain. A chain that crosses layout 37
 * (v69) moves every harbor-docked boat alongside the extended main pier, to its
 * type's authored mooring, facing heading 0 and at rest. Every other boat, and
 * every other field of a moved boat, must pass through unchanged.
 */
export function expectBoatsPreserved(after: GameState, before: GameState): void {
  const expected = structuredClone(before.boats);
  if (before.world.layoutRevision < MAIN_HARBOR_LAYOUT_REVISION
    && after.world.layoutRevision >= MAIN_HARBOR_LAYOUT_REVISION) {
    for (const boat of Object.values(expected)) {
      if (!(boat.isDocked && boat.dockedMarketId === "market.harbor")) continue;
      const mooring = harborMooringForBoatType(boat.boatTypeId);
      Object.assign(boat, mooring.boatPosition, { headingRadians: 0, speed: 0, dockedMarketId: mooring.marketId });
    }
  }
  expect(after.boats, "boats").toEqual(expected);
}

/**
 * Asserts inventories survive a chain that crosses v77. That step appends empty
 * slots on the player satchel until it holds `PLAYER_SATCHEL_SLOT_COUNT`. Every
 * existing lot, and every other inventory, must pass through unchanged.
 */
export function expectInventoriesPreserved(after: GameState, before: GameState): void {
  const expected = structuredClone(before.inventories);
  const player = before.player?.inventoryId ? expected[before.player.inventoryId] : undefined;
  if (player && Array.isArray(player.slots)) {
    const target = Math.max(player.slotCount, player.slots.length, PLAYER_SATCHEL_SLOT_COUNT);
    while (player.slots.length < target) player.slots.push({});
    player.slotCount = player.slots.length;
  }
  expect(after.inventories, "inventories").toEqual(expected);
}

/**
 * Asserts the player survives a migration chain, allowing only what later steps change on purpose:
 * v72 raises the Work ceiling to `WORK_CAPACITY_MAXIMUM` without refilling the pool, and layout
 * recovery may re-ground a supported pose by less than a centimetre.
 */
export function expectPlayerPreserved(after: GameState, before: GameState): void {
  const { workCapacity: workAfter, y: yAfter, ...restAfter } = after.player;
  const { workCapacity: workBefore, y: yBefore, ...restBefore } = before.player;
  expect(restAfter, "player").toEqual(restBefore);
  expect(Math.abs(yAfter - yBefore), "player height").toBeLessThan(0.01);
  const raised = before.schemaVersion < 72
    ? { ...workBefore, maximum: WORK_CAPACITY_MAXIMUM, current: Math.min(WORK_CAPACITY_MAXIMUM, workBefore.current) }
    : workBefore;
  expect(workAfter, "player Work").toEqual(raised);
}

/**
 * Asserts authored structures survive a migration chain that crosses v65. That step grants the
 * village trading stations, which no earlier save carries; every other structure must pass
 * through as `before` says.
 */
export function expectStructuresPreserved(after: GameState["world"]["structures"], before: GameState["world"]["structures"]): void {
  const withoutStations = (structures: GameState["world"]["structures"]) => Object.fromEntries(
    Object.entries(structures).filter(([, structure]) => structure.type !== "trading-station")
  );
  expect(withoutStations(after), "structures").toEqual(withoutStations(before));
  expect(Object.values(after).filter((structure) => structure.type === "trading-station"), "trading stations")
    .toHaveLength(VILLAGE_TRADE_STATIONS.length);
}

/**
 * Asserts contracts survive a migration chain that crosses v57. That step adds
 * the settlement ledger: `deliveredValueMoney` starts at zero and an active
 * order's existing fulfilled units become `legacyUnvaluedQuantity`; every other
 * contract field must pass through unchanged.
 */
export function expectContractsPreserved(after: GameState, before: GameState): void {
  const withoutLedger = (contracts: GameState["contracts"]) => contracts.map((contract) =>
    Object.fromEntries(Object.entries(contract).filter(([key]) =>
      key !== "deliveredValueMoney" && key !== "legacyUnvaluedQuantity"
    ))
  );
  expect(withoutLedger(after.contracts), "contracts").toEqual(withoutLedger(before.contracts));
  after.contracts.forEach((contract, index) => {
    const original = before.contracts[index]!;
    expect(contract.deliveredValueMoney ?? 0, `${contract.id} delivered value`).toBe(original.deliveredValueMoney ?? 0);
    expect(contract.legacyUnvaluedQuantity, `${contract.id} legacy quantity`).toBe(
      original.legacyUnvaluedQuantity ?? (original.status === "active" ? original.quantityFulfilled : 0)
    );
  });
}
