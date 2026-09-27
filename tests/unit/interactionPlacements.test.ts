import { afterEach, describe, expect, it } from "vitest";
import { readLayoutSources, applyLayoutEditToSources, parseLayoutSource } from "../../tools/layout-editor/patchPlacement";
import { INTERACTION_PLACEMENTS, INTERACTION_PLACEMENT_OVERRIDES, bindInteractionPoint, placementForStation } from "../../src/world/InteractionPlacements";
import { WORLD_STATION_DEFINITIONS, WORLD_MARKET_LOCATIONS } from "../../src/world/WorldGameplayLocations";
import { getProcessingStationFrontPosition, assessProcessingStationApproach } from "../../src/world/ProcessingStationApproach";
import { LABOR_STATIONS, LABOR_PROP_POSES } from "../../src/simulation/labor/LaborStations";
import { FARMHOUSE_OUTSIDE_DOOR } from "../../src/world/FarmhouseInterior";
import { starterFarmsteadAnchor, farmWellWorldAnchor } from "../../src/world/FarmLayout";
import { CART_WORKSHOP } from "../../src/world/VillageTradeLayout";
import { HARBOR_DOCK, HARBOR_MAIN_PIER, VILLAGE_BULLETIN } from "../../src/world/WorldAnchors";
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

  it("preserves an attached point's facing through repeated reads and rotations", () => {
    const attached = bindInteractionPoint("test", { x: 2, z: 0, rotationY: 0.2 }, { x: 0, z: 0, rotationY: 0 });
    INTERACTION_PLACEMENT_OVERRIDES.test = { x: 10, z: 10, rotationY: Math.PI / 2 };
    expect(attached.x).toBeCloseTo(10);
    expect(attached.z).toBeCloseTo(8);
    expect(attached.rotationY).toBeCloseTo(0.2 + Math.PI / 2);
  });
});
