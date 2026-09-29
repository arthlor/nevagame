import { afterEach, describe, expect, it } from "vitest";
import { readLayoutSources, applyLayoutEditToSources, parseLayoutSource } from "../../tools/layout-editor/patchPlacement";
import { INTERACTION_PLACEMENTS, INTERACTION_PLACEMENT_OVERRIDES, bindInteractionPoint, placementForStation } from "../../src/world/InteractionPlacements";
import { WORLD_STATION_DEFINITIONS, WORLD_MARKET_LOCATIONS } from "../../src/world/WorldGameplayLocations";
import { getProcessingStationFrontPosition, assessProcessingStationApproach } from "../../src/world/ProcessingStationApproach";
import { LABOR_STATIONS, LABOR_PROP_POSES } from "../../src/simulation/labor/LaborStations";
import { FARMHOUSE_OUTSIDE_DOOR } from "../../src/world/FarmhouseInterior";
import { starterFarmsteadAnchor, farmWellWorldAnchor } from "../../src/world/FarmLayout";
import { CART_WORKSHOP } from "../../src/world/VillageTradeLayout";
import { HARBOR_DOCK, HARBOR_MAIN_PIER, HARBOR_MARKET, VILLAGE_BULLETIN, VILLAGE_MARKET } from "../../src/world/WorldAnchors";
import { MAINLAND_SETTLEMENT_BUILDINGS } from "../../src/world/MainlandSettlementLayout";
import { SUNREACH_OFFSET_X } from "../../src/world/WorldIslands";
import { QUESTS } from "../../src/content/quests";
import { BOAT_MOORINGS } from "../../src/world/WorldMoorings";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { WorldLayout } from "../../src/world/WorldLayout";
import { layoutEditCanDelete, layoutEditCanDuplicate, transformPointWithPose } from "../../src/layout-editor/layoutEdit";

const moved = { x: 120, z: -100, rotationY: 0.7 };
afterEach(() => { for (const id of Object.keys(INTERACTION_PLACEMENT_OVERRIDES)) delete INTERACTION_PLACEMENT_OVERRIDES[id]; });

describe("prefab-bound interactions", () => {
  it.each(Object.keys(INTERACTION_PLACEMENTS))("round-trips %s through the actual allowlisted source without changing its dependent point data", id => {
    const sources = readLayoutSources(process.cwd());
    const commit = { kind: "interaction-placement" as const, id, ...moved };
    const result = applyLayoutEditToSources(sources, commit);
    parseLayoutSource(result.interactions!);
    expect(result.interactions).toContain(`"${id}": { x: 120, z: -100, rotationY: 0.7 }`);
    expect(applyLayoutEditToSources(result, commit)).toEqual(result);
    expect({ ...result, interactions: sources.interactions }).toEqual(sources);
    expect(layoutEditCanDuplicate(commit.kind)).toBe(false);
    expect(layoutEditCanDelete(commit.kind)).toBe(false);
  });

  it("rejects unknown gameplay parents and deletion of a bound workshop", () => {
    const sources = readLayoutSources(process.cwd());
    expect(() => applyLayoutEditToSources(sources, { kind: "interaction-placement", id: "missing", ...moved })).toThrow();
    expect(() => applyLayoutEditToSources(sources, { kind: "interaction-placement", id: "struct.workbench", ...moved, remove: true })).toThrow();
  });

  it("covers every processing station and uses its current saved facing for the real approach check", () => {
    for (const station of Object.values(WORLD_STATION_DEFINITIONS)) {
      const id = placementForStation(station.id);
      expect(id, station.id).toBeDefined();
      INTERACTION_PLACEMENT_OVERRIDES[id!] = moved;
      expect(station.position.x).toBe(moved.x);
      expect(station.rotationY).toBeCloseTo(moved.rotationY - Math.PI);
      const saved = { x: -40, z: -50, rotationY: 1.1 };
      const front = getProcessingStationFrontPosition(station.id, saved)!;
      expect(front.x).toBeCloseTo(saved.x - Math.sin(saved.rotationY) * station.approachDistanceMeters);
      expect(assessProcessingStationApproach(station.id, front, saved).valid).toBe(true);
      expect(assessProcessingStationApproach(station.id, { x: moved.x, z: moved.z }, saved).valid).toBe(false);
    }
  });

  it("keeps all market prompts and transaction reach at the same moved point", () => {
    for (const [id, binding] of Object.entries(INTERACTION_PLACEMENTS)) {
      if (!binding.marketId) continue;
      const before = { ...WORLD_MARKET_LOCATIONS[binding.marketId].position };
      INTERACTION_PLACEMENT_OVERRIDES[id] = moved;
      const location = WORLD_MARKET_LOCATIONS[binding.marketId];
      const content = ContentRegistry.markets.get(binding.marketId)!;
      expect(location.position).not.toEqual(before);
      expect(content.interactionPosition.x).toBe(location.position.x);
      expect(content.interactionPosition.z).toBe(location.position.z);
    }
  });

  it("rotates the chore working face around its prop and returns exactly on undo", () => {
    const id = "authored.arrival.village.firewood";
    const original = { ...LABOR_STATIONS["labor.firewood"].position };
    INTERACTION_PLACEMENT_OVERRIDES[id] = moved;
    const expected = transformPointWithPose({ point: original, from: LABOR_PROP_POSES[id], to: moved });
    expect(LABOR_STATIONS["labor.firewood"].position.x).toBeCloseTo(expected.x);
    expect(LABOR_STATIONS["labor.firewood"].position.z).toBeCloseTo(expected.z);
    INTERACTION_PLACEMENT_OVERRIDES[id] = { ...LABOR_PROP_POSES[id] };
    expect(LABOR_STATIONS["labor.firewood"].position).toEqual(original);
  });

  it("moves door, exit spawn and facing together without moving the interior room", () => {
    const original = { ...FARMHOUSE_OUTSIDE_DOOR.exitSpawn };
    const door = { x: FARMHOUSE_OUTSIDE_DOOR.x, z: FARMHOUSE_OUTSIDE_DOOR.z };
    const base = starterFarmsteadAnchor("farmhouse", true)!;
    INTERACTION_PLACEMENT_OVERRIDES.farmhouse = moved;
    const expected = transformPointWithPose({ point: original, from: base, to: moved });
    expect(FARMHOUSE_OUTSIDE_DOOR.exitSpawn.x).toBeCloseTo(expected.x);
    expect(FARMHOUSE_OUTSIDE_DOOR.exitSpawn.z).toBeCloseTo(expected.z);
    expect(FARMHOUSE_OUTSIDE_DOOR.exitSpawn.rotationY).toBeCloseTo(original.rotationY + moved.rotationY - base.rotationY);
    expect(FARMHOUSE_OUTSIDE_DOOR.x).toBeCloseTo(transformPointWithPose({ point: door, from: base, to: moved }).x);
  });

  it("keeps pump and notice-board points on their models", () => {
    INTERACTION_PLACEMENT_OVERRIDES.well = moved;
    INTERACTION_PLACEMENT_OVERRIDES["authored.sunreach.terrace-cistern"] = moved;
    INTERACTION_PLACEMENT_OVERRIDES.village_bulletin_board = moved;
    for (const farmId of ["farm.starter_garden", "farm.sunreach_terraces"]) expect(farmWellWorldAnchor(farmId)).toMatchObject(moved);
    expect(VILLAGE_BULLETIN.position).toMatchObject({ x: moved.x, z: moved.z });
  });

  it("carries unpurchased wagon bays and their facing with the cart workshop", () => {
    const base = { ...CART_WORKSHOP.position, rotationY: CART_WORKSHOP.rotationY };
    const original = CART_WORKSHOP.displays.map(d => ({ ...d }));
    INTERACTION_PLACEMENT_OVERRIDES[CART_WORKSHOP.id] = moved;
    original.forEach((display, index) => {
      const expected = transformPointWithPose({ point: display, from: base, to: moved });
      expect(CART_WORKSHOP.displays[index].x).toBeCloseTo(expected.x);
      expect(CART_WORKSHOP.displays[index].rotationY).toBeCloseTo(display.rotationY + moved.rotationY - base.rotationY);
    });
  });

  it("transforms pier boarding, hull and support points in the same coordinate frame", () => {
    const base = { x: HARBOR_MAIN_PIER.x, z: HARBOR_MAIN_PIER.z, rotationY: Math.PI / 2 };
    const boat = { ...HARBOR_DOCK.boatPosition };
    const board = { ...HARBOR_DOCK.playerPosition };
    INTERACTION_PLACEMENT_OVERRIDES.dock = moved;
    expect(HARBOR_DOCK.boatPosition.x).toBeCloseTo(transformPointWithPose({ point: boat, from: base, to: moved }).x);
    const expected = transformPointWithPose({ point: board, from: base, to: moved });
    expect(HARBOR_DOCK.playerPosition.z).toBeCloseTo(expected.z);
    expect(WorldLayout.isPierDeck(expected.x, expected.z)).toBe(true);
    const mooring = BOAT_MOORINGS.find(m => m.id === "mooring.neva_harbor_rowboat")!;
    expect(mooring.playerPosition).toEqual(HARBOR_DOCK.playerPosition);
  });

  it("seats mainland market rings on the stall front and leaves the other counters on their stalls", () => {
    for (const villageId of ["pinewatch", "reedhaven", "highridge"] as const) {
      const placementId = `authored.mainland.${villageId}.market`;
      delete INTERACTION_PLACEMENT_OVERRIDES[placementId];
      const building = MAINLAND_SETTLEMENT_BUILDINGS.find((entry) =>
        entry.villageId === villageId && entry.pad.id.endsWith(".market"));
      if (!building) throw new Error(villageId);
      const point = WORLD_MARKET_LOCATIONS[`market.${villageId}`].position;
      const approach = building.pad.frontApproachMeters;
      expect(point.x).toBeCloseTo(building.pad.center.x + Math.sin(building.pad.rotationY) * approach, 5);
      expect(point.z).toBeCloseTo(building.pad.center.z + Math.cos(building.pad.rotationY) * approach, 5);
      INTERACTION_PLACEMENT_OVERRIDES[placementId] = { x: 10, z: 20, rotationY: 1.2 };
      expect(Math.hypot(point.x - 10, point.z - 20)).toBeCloseTo(approach, 5);
      const facing = Math.atan2(point.x - 10, point.z - 20);
      expect(Math.atan2(Math.sin(facing - 1.2), Math.cos(facing - 1.2))).toBeCloseTo(0, 5);
    }
    delete INTERACTION_PLACEMENT_OVERRIDES["produce-stall"];
    delete INTERACTION_PLACEMENT_OVERRIDES["fish-market"];
    delete INTERACTION_PLACEMENT_OVERRIDES["authored.sunreach.cove-market"];
    expect(WORLD_MARKET_LOCATIONS["market.village"].position.x).toBeCloseTo(VILLAGE_MARKET.position.x, 5);
    expect(WORLD_MARKET_LOCATIONS["market.village"].position.z).toBeCloseTo(VILLAGE_MARKET.position.z, 5);
    expect(WORLD_MARKET_LOCATIONS["market.harbor"].position.x).toBeCloseTo(HARBOR_MARKET.position.x, 5);
    expect(WORLD_MARKET_LOCATIONS["market.harbor"].position.z).toBeCloseTo(HARBOR_MARKET.position.z, 5);
    expect(WORLD_MARKET_LOCATIONS["market.sunreach_cove"].position.x).toBeCloseTo(373 + SUNREACH_OFFSET_X, 5);
    expect(WORLD_MARKET_LOCATIONS["market.sunreach_cove"].position.z).toBeCloseTo(56, 5);
    const pinewatch = QUESTS.find((quest) => quest.id === "quest.tradelanes_pinewatch")
      ?.objectives.find((step) => step.id === "step.tradelanes_pinewatch_wheat");
    expect(pinewatch?.locationAnchor?.x).toBeCloseTo(WORLD_MARKET_LOCATIONS["market.pinewatch"].position.x, 5);
    expect(pinewatch?.locationAnchor?.z).toBeCloseTo(WORLD_MARKET_LOCATIONS["market.pinewatch"].position.z, 5);
  });

  it("preserves an attached point's facing through repeated reads and rotations", () => {
    const attached = bindInteractionPoint("test", { x: 2, z: 0, rotationY: 0.2 }, { x: 0, z: 0, rotationY: 0 });
    INTERACTION_PLACEMENT_OVERRIDES.test = { x: 10, z: 10, rotationY: Math.PI / 2 };
    expect(attached.x).toBeCloseTo(10);
    expect(attached.z).toBeCloseTo(8);
    expect(attached.rotationY).toBeCloseTo(0.2 + Math.PI / 2);
  });
});
