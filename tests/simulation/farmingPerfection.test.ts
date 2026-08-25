import { describe, expect, it } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import {
  FARMING_ACTION_TIMINGS,
  FarmingActionController
} from "../../src/app/FarmingActionController";
import { CURRENT_SCHEMA_VERSION, type SaveEnvelope, validateSaveEnvelope } from "../../src/persistence/SaveSchema";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { Simulation } from "../../src/simulation/Simulation";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";
import { determineCropStage, calculateCropQuality } from "../../src/simulation/farming/calculateCropGrowth";
import {
  cropMoistureBand,
  orientedCropFootprintsOverlap
} from "../../src/simulation/domains/FarmingDomain";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { SeededRng } from "../../src/simulation/core/Rng";
import {
  STARTER_FARM_LAYOUT,
  farmLocalToWorld,
  starterFarmsteadAnchor,
  starterMarketAnchor,
  starterStructureAnchor
} from "../../src/world/FarmLayout";
import { VILLAGE_MARKET } from "../../src/world/WorldAnchors";
import { ASSET_BY_ID, ASSET_IDS } from "../../src/render/assets/AssetCatalog";
import { WorldLayout } from "../../src/world/WorldLayout";

function starterFarmWorld(x: number, z: number): { x: number; z: number } {
  return farmLocalToWorld(STARTER_FARM_LAYOUT.farmId, { x, z });
}

function movePlayerToStarterFarm(sim: Simulation, x: number = 0, z: number = 0): { x: number; z: number } {
  const world = starterFarmWorld(x, z);
  sim.state.player.x = world.x;
  sim.state.player.z = world.z;
  return world;
}

function fillInventory(sim: Simulation): void {
  const inventory = sim.state.inventories[sim.state.player.inventoryId];
  const item = ContentRegistry.items.get("item.compost_starter")!;
  inventory.slots = inventory.slots.map(() => ({ itemId: item.id, quantity: item.stackLimit }));
}

function matureCrop(sim: Simulation, cropId: string = "crop.wheat", x = 0, z = 0): string {
  const world = movePlayerToStarterFarm(sim, x, z);
  expect(sim.plantCrop("farm.starter_garden", cropId, world.x, world.z).success).toBe(true);
  const placed = Object.values(sim.state.crops).find((crop) => crop.cropId === cropId && crop.x === x && crop.z === z)!;
  const definition = ContentRegistry.crops.get(cropId)!;
  placed.effectiveGrowthMinutes = definition.baseGrowthMinutes;
  placed.stage = "mature";
  return placed.id;
}

interface LegacyStateFixture {
  schemaVersion: number;
  player: { workCapacity: { lastRegenMinute?: number; regeneratedAtMinute?: number } };
  journal: { cropRecords: Record<string, unknown>; fishRecords: Record<string, unknown> };
  world: { structures: Record<string, { id: string; type: string; x: number; y: number; z: number }> };
  farms: Record<string, { placedStructureIds: string[]; placedCropIds: string[] }>;
  crops: Record<string, unknown>;
  boats: Record<string, Record<string, unknown>>;
  sportFishing?: unknown;
  basicFishing?: unknown;
}

function legacyEnvelope(version: 1 | 2 | 3): SaveEnvelope {
  const state = structuredClone(createInitialGameState()) as unknown as LegacyStateFixture;
  state.schemaVersion = version;
  state.player.workCapacity.lastRegenMinute = state.player.workCapacity.regeneratedAtMinute;
  delete state.player.workCapacity.regeneratedAtMinute;
  state.journal.cropRecords["crop.wheat"] = { harvestedCount: 8, bestQuality: "trophy" };
  state.journal.fishRecords["fish.trout"] = { discovered: true, catchCount: 1, bestQuality: "trophy" };
  state.world.structures["struct.starter_mill"].x = 2;
  state.world.structures["struct.starter_mill"].z = -3;
  state.world.structures["struct.unrelated"] = {
    id: "struct.unrelated",
    type: "fish-table",
    x: 91,
    y: 0,
    z: 92
  };
  state.farms["farm.player_homestead"].placedStructureIds.push("struct.starter_mill");
  state.crops["placed_legacy_barley"] = {
    id: "placed_legacy_barley",
    cropId: "crop.barley",
    farmId: "farm.starter_garden",
    x: 1.75,
    z: -1.25,
    rotationRadians: 1.234,
    plantedAtMinute: 400,
    lastUpdatedMinute: 470,
    effectiveGrowthMinutes: 42,
    moisture: 37,
    health: 88,
    stage: "growing",
    averageMoistureAccum: 3200,
    moistureSampleCount: 70
  };
  state.farms["farm.starter_garden"].placedCropIds.push("placed_legacy_barley");
  if (version < 3) {
    delete state.sportFishing;
    for (const boat of Object.values(state.boats) as Array<Record<string, unknown>>) delete boat.dockedMarketId;
  }
  if (version < 2) delete state.basicFishing;
  return { schemaVersion: version, savedAtUtcMs: 1, state } as unknown as SaveEnvelope;
}

describe("NEVA farming correctness foundation", () => {
  it("owns the complete starter homestead and physical market in one pure layout", () => {
    expect(STARTER_FARM_LAYOUT.plantableAreas).toEqual([
      { minX: -6, maxX: 6, minZ: -5, maxZ: 5 }
    ]);
    expect(STARTER_FARM_LAYOUT.structureAnchors.map((anchor) => anchor.id)).toEqual([
      "struct.starter_mill",
      "struct.workbench",
      "struct.starter_compost"
    ]);
    expect(STARTER_FARM_LAYOUT.paths.map((path) => path.id)).toEqual([
      "farm-entry",
      "farm-work-zone",
      "farm-home"
    ]);
    expect(STARTER_FARM_LAYOUT.fenceAnchors.length).toBeGreaterThanOrEqual(14);
    expect(STARTER_FARM_LAYOUT.propAnchors.length).toBeGreaterThanOrEqual(5);
    const farmhouse = WorldLayout.landmark("farmhouse");
    const well = WorldLayout.landmark("well");
    expect(starterFarmsteadAnchor("farmhouse")).toMatchObject({
      x: farmhouse.x,
      z: farmhouse.z,
      rotationY: farmhouse.rotationY,
      scale: farmhouse.scale
    });
    expect(starterFarmsteadAnchor("well")).toMatchObject({
      x: well.x,
      z: well.z,
      rotationY: well.rotationY,
      scale: well.scale
    });
    expect(starterMarketAnchor("market.village")).toMatchObject({
      x: VILLAGE_MARKET.position.x,
      z: VILLAGE_MARKET.position.z
    });
  });

  it("keeps all canonical crop stage boundaries exact", () => {
    const base = 100;
    expect(determineCropStage(9.999, base)).toBe("seeded");
    expect(determineCropStage(10, base)).toBe("sprout");
    expect(determineCropStage(34.999, base)).toBe("sprout");
    expect(determineCropStage(35, base)).toBe("growing");
    expect(determineCropStage(99.999, base)).toBe("growing");
    expect(determineCropStage(100, base)).toBe("mature");
    expect(determineCropStage(129.999, base)).toBe("mature");
    expect(determineCropStage(130, base)).toBe("overripe");
    expect(determineCropStage(160, base)).toBe("overripe");
    expect(determineCropStage(160.001, base)).toBe("withered");
  });

  it("centralizes dry, normal, and wet presentation thresholds", () => {
    expect(cropMoistureBand(39.999)).toBe("dry");
    expect(cropMoistureBand(40)).toBe("normal");
    expect(cropMoistureBand(84.999)).toBe("normal");
    expect(cropMoistureBand(85)).toBe("wet");
  });

  it("uses continuous placement with deterministic yaw and stable failure codes", () => {
    const sim = new Simulation();
    const world = movePlayerToStarterFarm(sim, 0.37, -0.42);
    const request = { farmId: "farm.starter_garden", cropId: "crop.wheat", ...world };
    const first = sim.validateCropPlacement(request.farmId, request.cropId, request.x, request.z);
    const secondSim = new Simulation();
    movePlayerToStarterFarm(secondSim, 0.37, -0.42);
    const second = secondSim.validateCropPlacement(request.farmId, request.cropId, request.x, request.z);
    expect(first).toMatchObject({ valid: true, worldX: world.x, worldZ: world.z });
    expect(first.localX).toBeCloseTo(0.37, 8);
    expect(first.localZ).toBeCloseTo(-0.42, 8);
    expect(second.rotationRadians).toBe(first.rotationRadians);
    expect(sim.validateCropPlacement(request.farmId, "crop.tomato", request.x, request.z).rotationRadians)
      .not.toBe(first.rotationRadians);

    const far = starterFarmWorld(20, 0);
    expect(sim.validateCropPlacement(request.farmId, request.cropId, far.x, far.z).reasonCode).toBe("too-far");
    Object.assign(sim.state.player, far);
    expect(sim.validateCropPlacement(request.farmId, request.cropId, far.x, far.z).reasonCode).toBe("outside-farm");
    const edge = movePlayerToStarterFarm(sim, 7.2, 0);
    expect(sim.validateCropPlacement(request.farmId, request.cropId, edge.x, edge.z).reasonCode).toBe("invalid-surface");
  });

  it("requires the complete oriented footprint, blocks overlaps and preserves touching edges", () => {
    const sim = new Simulation();
    const edge = movePlayerToStarterFarm(sim, 5.65, 0);
    expect(sim.validateCropPlacement("farm.starter_garden", "crop.wheat", edge.x, edge.z).reasonCode)
      .toBe("invalid-surface");

    const center = movePlayerToStarterFarm(sim);
    expect(sim.plantCrop("farm.starter_garden", "crop.wheat", center.x, center.z).success).toBe(true);
    expect(sim.validateCropPlacement("farm.starter_garden", "crop.wheat", center.x, center.z).reasonCode)
      .toBe("overlaps-crop");

    const rotation = 0.37;
    const touchingOffset = { x: Math.cos(rotation), z: Math.sin(rotation) };
    const first = { center: { x: 0, z: 0 }, width: 1, depth: 1, rotationRadians: rotation };
    expect(orientedCropFootprintsOverlap(first, {
      center: touchingOffset,
      width: 1,
      depth: 1,
      rotationRadians: rotation
    })).toBe(false);
    expect(orientedCropFootprintsOverlap(first, {
      center: { x: touchingOffset.x * 0.98, z: touchingOffset.z * 0.98 },
      width: 1,
      depth: 1,
      rotationRadians: rotation
    })).toBe(true);
  });

  it("enforces structure clearance, locks, and seed availability", () => {
    const sim = new Simulation();
    const center = movePlayerToStarterFarm(sim);
    Object.assign(sim.state.world.structures["struct.workbench"], {
      x: center.x,
      y: WorldLayout.terrainHeight(center.x, center.z),
      z: center.z
    });
    expect(sim.validateCropPlacement("farm.starter_garden", "crop.wheat", center.x, center.z).reasonCode)
      .toBe("structure-clearance");

    sim.state.world.structures["struct.workbench"].x = starterStructureAnchor("struct.workbench")!.x;
    sim.state.world.structures["struct.workbench"].z = starterStructureAnchor("struct.workbench")!.z;
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    InventoryManager.addItemsAtomically(inventory, [{ itemId: "seed.barley", quantity: 1 }]);
    expect(sim.validateCropPlacement("farm.starter_garden", "crop.barley", center.x, center.z).reasonCode).toBe("locked");
    InventoryManager.removeItemsAtomically(inventory, [{ itemId: "seed.potato", quantity: 6 }]);
    expect(sim.validateCropPlacement("farm.starter_garden", "crop.potato", center.x, center.z).reasonCode).toBe("no-seed");
  });

  it("rejects already-wet watering without state or XP changes", () => {
    const sim = new Simulation();
    const center = movePlayerToStarterFarm(sim);
    expect(sim.plantCrop("farm.starter_garden", "crop.wheat", center.x, center.z).success).toBe(true);
    const crop = Object.values(sim.state.crops)[0];
    crop.moisture = 85;
    const xp = sim.state.player.proficiencies.farming;
    const work = sim.state.player.workCapacity.current;
    expect(sim.waterCrop(crop.id)).toMatchObject({ success: false, reasonCode: "already-wet" });
    expect(crop.moisture).toBe(85);
    expect(sim.state.player.proficiencies.farming).toBe(xp);
    expect(sim.state.player.workCapacity.current).toBe(work);
  });

  it("at zero Work grants forty-percent XP and scales only crop rarity contribution", () => {
    const sim = new Simulation();
    const placedCropId = matureCrop(sim);
    sim.state.player.proficiencies.farming = 0;
    sim.state.player.workCapacity.current = 0;
    const result = sim.harvestCrop(placedCropId);
    expect(result.success).toBe(true);
    expect(result.yield).toBeGreaterThanOrEqual(3);
    expect(sim.state.player.proficiencies.farming).toBe(18);

    const inputs = {
      climateMatchScore: 1,
      averageMoisture: 100,
      soilFertility: 100,
      farmingProficiency: 33333,
      rngRoll: 1
    };
    const normal = calculateCropQuality(inputs, new SeededRng(1));
    const depleted = calculateCropQuality({ ...inputs, rareChanceMultiplier: 0.4 }, new SeededRng(1));
    expect(normal.score - depleted.score).toBe(6);
    expect(normal.quality).toBe("prize");
    expect(depleted.quality).toBe("exceptional");
  });

  it("does not advance RNG or mutate a mature crop when harvest output cannot fit", () => {
    const sim = new Simulation();
    const placedCropId = matureCrop(sim);
    fillInventory(sim);
    const rng = sim.rng.getState();
    const cropBefore = structuredClone(sim.state.crops[placedCropId]);
    const fertility = sim.state.farms["farm.starter_garden"].soil.fertility;
    const xp = sim.state.player.proficiencies.farming;
    const work = sim.state.player.workCapacity.current;
    expect(sim.harvestCrop(placedCropId)).toMatchObject({ success: false });
    expect(sim.rng.getState()).toBe(rng);
    expect(sim.state.metadata.rngState).toBe(rng);
    expect(sim.state.crops[placedCropId]).toEqual(cropBefore);
    expect(sim.state.farms["farm.starter_garden"].soil.fertility).toBe(fertility);
    expect(sim.state.player.proficiencies.farming).toBe(xp);
    expect(sim.state.player.workCapacity.current).toBe(work);
  });

  it("starts with the trio and buys only starter seeds atomically at the produce stall", () => {
    const sim = new Simulation();
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    expect(InventoryManager.getItemCount(inventory, "seed.wheat")).toBe(10);
    expect(InventoryManager.getItemCount(inventory, "seed.tomato")).toBe(6);
    expect(InventoryManager.getItemCount(inventory, "seed.potato")).toBe(6);
    sim.state.player.x = VILLAGE_MARKET.position.x;
    sim.state.player.z = VILLAGE_MARKET.position.z;
    const money = sim.state.player.money;
    expect(sim.buySeedAtMarket("market.village", "seed.tomato", 1)).toMatchObject({ success: true, cost: 8 });
    expect(InventoryManager.getItemCount(inventory, "seed.tomato")).toBe(7);
    expect(sim.state.player.money).toBe(money - 8);
    expect(sim.buySeedAtMarket("market.village", "seed.barley", 1)).toMatchObject({
      success: false,
      reasonCode: "not-stocked"
    });

    sim.state.player.money = 0;
    const before = InventoryManager.getItemCount(inventory, "seed.wheat");
    expect(sim.buySeedAtMarket("market.village", "seed.wheat", 1)).toMatchObject({
      success: false,
      reasonCode: "insufficient-funds"
    });
    expect(InventoryManager.getItemCount(inventory, "seed.wheat")).toBe(before);
    sim.state.player.money = 100;
    fillInventory(sim);
    expect(sim.buySeedAtMarket("market.village", "seed.wheat", 1)).toMatchObject({
      success: false,
      reasonCode: "inventory-full"
    });
    expect(sim.state.player.money).toBe(100);
  });

  it.each([1, 2, 3] as const)("migrates v%i saves to the current schema without changing unrelated truth", (version) => {
    const source = legacyEnvelope(version);
    const rngState = source.state.metadata.rngState;
    const migrated = migrateSaveData(source);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.state.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.state.player.workCapacity).toMatchObject({ regeneratedAtMinute: 480 });
    expect("lastRegenMinute" in migrated.state.player.workCapacity).toBe(false);
    expect(migrated.state.journal.cropRecords["crop.wheat"].bestQuality).toBe("prize");
    expect(migrated.state.journal.fishRecords["fish.trout"].bestQuality).toBe("trophy");
    expect(migrated.state.world.structures["struct.starter_mill"]).toMatchObject({
      x: starterStructureAnchor("struct.starter_mill")!.x,
      z: starterStructureAnchor("struct.starter_mill")!.z
    });
    const unrelated = migrated.state.world.structures["struct.unrelated"];
    expect(unrelated).toMatchObject({ id: "struct.unrelated", type: "fish-table" });
    expect(WorldLayout.isWalkable(unrelated.x, unrelated.z)).toBe(true);
    expect(unrelated.y).toBeCloseTo(WorldLayout.terrainHeight(unrelated.x, unrelated.z), 6);
    expect(migrated.state.farms["farm.player_homestead"].placedStructureIds).not.toContain("struct.starter_mill");
    expect(migrated.state.crops["placed_legacy_barley"]).toMatchObject({
      cropId: "crop.barley",
      x: 1.75,
      z: -1.25,
      rotationRadians: 1.234,
      effectiveGrowthMinutes: 42,
      moisture: 37,
      stage: "growing"
    });
    expect(migrated.state.metadata.rngState).toBe(rngState);
    expect(validateSaveEnvelope(migrated)).toBe(true);
  });

  it("keeps placement previews and presentation actions outside save data", () => {
    const serialized = JSON.stringify(createInitialGameState());
    expect(serialized).not.toContain("placementPreview");
    expect(serialized).not.toContain("farmingAction");
    expect(serialized).not.toContain("audioSource");
    expect(serialized).not.toContain("carryProp");
  });
});

describe("farming action commit controller", () => {
  it("commits exactly once at the marker and completes presentation afterward", () => {
    const controller = new FarmingActionController();
    let commits = 0;
    const phases: string[] = [];
    expect(controller.start("plant", { x: 0, y: 0, z: 0 }, 1000, {
      commit: () => { commits += 1; return { success: true }; },
      phaseChanged: (snapshot) => phases.push(snapshot.phase)
    })).toBe(true);
    controller.update(1319);
    expect(commits).toBe(0);
    controller.update(1320);
    controller.update(1400);
    expect(commits).toBe(1);
    expect(controller.hasCommitted).toBe(true);
    controller.update(1720);
    expect(commits).toBe(1);
    expect(controller.isActive).toBe(false);
    expect(phases).toEqual(["started", "committed", "completed"]);
  });

  it("cancels before commit but cannot roll back after commit", () => {
    const early = new FarmingActionController();
    let earlyCommits = 0;
    early.start("water", { x: 0, y: 0, z: 0 }, 0, {
      commit: () => { earlyCommits += 1; return { success: true }; }
    });
    expect(early.cancelBeforeCommit(200)).toBe(true);
    early.update(800);
    expect(earlyCommits).toBe(0);

    const late = new FarmingActionController();
    let lateCommits = 0;
    late.start("harvest", { x: 0, y: 0, z: 0 }, 0, {
      commit: () => { lateCommits += 1; return { success: true }; }
    });
    late.update(360);
    expect(lateCommits).toBe(1);
    expect(late.cancelBeforeCommit(351)).toBe(false);
    late.update(800);
    expect(lateCommits).toBe(1);
  });

  it("keeps application commit timing aligned with the authored character catalog", () => {
    const character = ASSET_BY_ID.get(ASSET_IDS.CHAR_PLAYER_A);
    const clips = new Map(character?.animationClips?.map((clip) => [clip.name, clip]));
    const mappings = [
      ["plant", "plant"],
      ["water", "water"],
      ["harvest", "harvest"],
      ["processing-start", "workstation"],
      ["processing-collect", "pickup"]
    ] as const;
    for (const [action, clipName] of mappings) {
      const timing = FARMING_ACTION_TIMINGS[action];
      const clip = clips.get(clipName);
      expect(timing.durationMs).toBeCloseTo((clip?.durationSeconds ?? 0) * 1000, 4);
      expect(timing.commitMs).toBeCloseTo((clip?.commitMarkerSeconds ?? 0) * 1000, 4);
    }
  });
});
