import { beforeAll, describe, expect, it, vi } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { IndexedDbSaveRepository } from "../../src/persistence/IndexedDbSaveRepository";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope, type SaveEnvelope } from "../../src/persistence/SaveSchema";
import { migrateTerrainLayout11 } from "../../src/persistence/migrateTerrainLayout11";
import type { BasicFishingState, GameState } from "../../src/simulation/core/types";
import { SeededRng } from "../../src/simulation/core/Rng";
import { FishingEncounter } from "../../src/simulation/fishing/FishingEncounter";
import { fishingEndpoint } from "../../src/simulation/fishing/FishingTuning";
import { createStarterDonkeyState, isValidMountPose, playerPoseFromMount, STARTER_DONKEY_ID } from "../../src/simulation/mounts/Mounts";
import { FARMHOUSE_INTERIOR_DOOR } from "../../src/world/FarmhouseInterior";
import { defaultMooringForBoatType, mooringById } from "../../src/world/WorldMoorings";
import { SUNREACH_ANCHORS } from "../../src/world/WorldIslands";
import { WORLD_LAYOUT_REVISION } from "../../src/world/WorldAnchors";
import { WorldLayout } from "../../src/world/WorldLayout";
import { installMemoryIndexedDB } from "../helpers/memoryIndexedDB";
import fixture from "../fixtures/save_v30_layout10.json";

const evidence = (id: string) => fixture.layout10Evidence.find((point) => point.id === id)!;
const upperRiver = evidence("upper-river");

function legacy(): SaveEnvelope {
  return structuredClone({ schemaVersion: fixture.schemaVersion, savedAtUtcMs: fixture.savedAtUtcMs, state: fixture.state }) as SaveEnvelope;
}

function preserveResources(before: GameState, after: GameState): void {
  for (const key of ["crops", "farms", "inventories", "fishCargo", "markets", "contracts", "quests", "journal", "metadata", "clock"] as const) {
    expect(after[key], key).toEqual(before[key]);
  }
  expect(after.player.workCapacity).toEqual(before.player.workCapacity);
  expect(after.player.proficiencies).toEqual(before.player.proficiencies);
  expect(after.player.money).toBe(before.player.money);
  expect(after.world.fishingPressureByHabitat).toEqual(before.world.fishingPressureByHabitat);
}

function addSkiff(state: GameState): string {
  const id = "boat.player_skiff";
  const mooring = defaultMooringForBoatType("boat.skiff");
  state.inventories["inv.skiff_supply"] = { id: "inv.skiff_supply", slotCount: 8, slots: Array.from({ length: 8 }, () => ({})) };
  state.boats[id] = {
    id, boatTypeId: "boat.skiff", ...mooring.boatPosition,
    headingRadians: 0.7, speed: 0, fuel: 34, durability: 217,
    fishCargoSlotIds: [null, null, null, null, null, null],
    supplyInventoryId: "inv.skiff_supply", upgrades: [], isDocked: true, dockedMarketId: mooring.marketId
  };
  return id;
}

function strandBoat(state: GameState, id: string, active: boolean, point = upperRiver): void {
  Object.assign(state.boats[id], { x: point.x, y: 0, z: point.z, speed: 1.3, isDocked: false, dockedMarketId: null });
  if (active) {
    Object.assign(state.player, { x: point.x, y: 0.5, z: point.z, activeBoatId: id, rotationY: state.boats[id].headingRadians });
  }
}

function addSchool(state: GameState): string {
  const id = "school.layout10_upper";
  state.world.activeSchools[id] = {
    id, ecologyId: "ecology.neva", habitatId: "river", x: upperRiver.x, z: upperRiver.z,
    radius: 8, spawnedAtMinute: 470, expiresAtMinute: 620, feedingFrenzyUntilMinute: 500,
    deepChumUntilMinute: 501, remainingCatchPotential: 2, speciesWeights: [{ speciesId: "fish.trout", weight: 80 }]
  };
  return id;
}

function addSportFight(state: GameState, distance = 24): void {
  const schoolId = addSchool(state);
  const encounter = new FishingEncounter(
    { instanceId: "fish.layout10_hooked", speciesId: "fish.trout", ecologyId: "ecology.neva", weightKg: 2, quality: "fine" },
    "rod.river", new SeededRng(913), distance,
    { originX: state.player.x, originZ: state.player.z, bearingRadians: Math.PI, isWater: () => true }
  );
  state.sportFishing = structuredClone(encounter.getState());
  Object.assign(state.sportFishing, { schoolId, stamina: 5, lineIntegrity: 76, elapsedSeconds: 17, behaviorUntilSeconds: 1.7 });
  Object.assign(state.sportFishing.dynamics!, { depthMeters: 0.2, radialVelocity: 0.1, angularVelocity: 0.03, landReadySeconds: 0.31, rodLoad: 0.44 });
  state.player.equippedRodId = "rod.river";
  state.player.ownedRodIds = ["rod.willow", "rod.river"];
}

function assertContinuousSportWater(state: GameState): void {
  const encounter = state.sportFishing!;
  const motion = encounter.dynamics!;
  const endpoint = fishingEndpoint(encounter);
  expect(WorldLayout.isSailable(endpoint.x, endpoint.z)).toBe(true);
  const length = Math.hypot(endpoint.x - motion.originX, endpoint.z - motion.originZ);
  let enteredWater = false;
  for (let along = 0.5; along <= length; along += 0.5) {
    const amount = along / length;
    const wet = WorldLayout.isSailable(
      motion.originX + (endpoint.x - motion.originX) * amount,
      motion.originZ + (endpoint.z - motion.originZ) * amount
    );
    expect(!wet && (enteredWater || along > 12)).toBe(false);
    enteredWater ||= wet;
  }
}

beforeAll(() => ContentRegistry.initializeAndValidate());

describe("layout 11 coastal terrain save migration", () => {
  it("keeps schema 26–30 validation pinned to historical layout 10", () => {
    for (let version = 26; version <= 30; version++) {
      const envelope = legacy();
      envelope.schemaVersion = envelope.state.schemaVersion = version;
      envelope.state.mounts[STARTER_DONKEY_ID] = createStarterDonkeyState();
      if (version < 29) {
        const { tracks, focusedTrackId, ...common } = envelope.state.quests;
        void focusedTrackId;
        envelope.state.quests = { ...common, ...tracks["track.main"], unlockedDialogueIds: [] } as unknown as GameState["quests"];
      }
      expect(validateSaveEnvelope(envelope), `v${version}/layout10`).toBe(true);
      envelope.state.world.layoutRevision = 11;
      expect(validateSaveEnvelope(envelope), `v${version}/layout11`).toBe(false);
    }
  });

  it("migrates the captured planted save deterministically and remains stable on repeat load", () => {
    const before = legacy();
    const untouched = structuredClone(before);
    const migrated = migrateSaveData(before);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.state.world.layoutRevision).toBe(WORLD_LAYOUT_REVISION);
    expect(Object.keys(migrated.state.crops)).not.toHaveLength(0);
    expect(migrated.state.player).toMatchObject({ x: before.state.player.x, z: before.state.player.z });
    expect(migrated.state.player.y).toBeCloseTo(WorldLayout.traversalSurfaceHeight(before.state.player.x, before.state.player.z) + 0.5, 8);
    preserveResources(untouched.state, migrated.state);
    expect(migrated.state.boats).toEqual(before.state.boats);
    expect(validateSaveEnvelope(migrated)).toBe(true);
    expect(migrateSaveData(legacy())).toEqual(migrated);
    expect(migrateSaveData(structuredClone(migrated))).toEqual(migrated);
    expect(before).toEqual(untouched);
  });

  it("re-grounds structures without moving their working footprints", () => {
    const before = legacy();
    const migrated = migrateSaveData(before).state;
    for (const [id, structure] of Object.entries(before.state.world.structures)) {
      expect(migrated.world.structures[id]).toMatchObject({ ...structure, y: expect.any(Number) });
      if (WorldLayout.terrainPatchAt(structure.x, structure.z)?.id === "terrain.neva") {
        expect(migrated.world.structures[id].y).toBe(WorldLayout.terrainHeight(structure.x, structure.z));
      } else expect(migrated.world.structures[id]).toEqual(structure);
    }
  });

  it("moves a newly unsupported player onto dry ground within the normal walking slope", () => {
    const before = legacy();
    Object.assign(before.state.player, { x: upperRiver.x, y: 0.5, z: upperRiver.z });
    const after = migrateSaveData(before).state;
    expect(WorldLayout.isWater(after.player.x, after.player.z)).toBe(false);
    expect(WorldLayout.traversalSurfaceSample(after.player.x, after.player.z).normal.y).toBeGreaterThanOrEqual(Math.cos(38 * Math.PI / 180));
    expect(after.player.y).toBe(WorldLayout.traversalSurfaceHeight(after.player.x, after.player.z) + 0.5);
    preserveResources(before.state, after);
  });

  it.each([false, true])("keeps valid dry X/Z below the padded spring elevation (mounted=%s)", (mounted) => {
    const before = legacy();
    const point = { x: -12, z: -140 };
    const support = WorldLayout.traversalSurfaceSample(point.x, point.z);
    expect(WorldLayout.isWater(point.x, point.z)).toBe(false);
    expect(WorldLayout.isWalkable(point.x, point.z)).toBe(true);
    expect(support.normal.y).toBeGreaterThanOrEqual(Math.cos(38 * Math.PI / 180));
    expect(support.height).toBeLessThan(WorldLayout.waterSurfaceElevation(point.x, point.z));
    if (mounted) {
      const mount = before.state.mounts[STARTER_DONKEY_ID];
      Object.assign(mount, point, { y: support.height });
      Object.assign(before.state.player, playerPoseFromMount(mount), { activeMountId: mount.id });
    } else Object.assign(before.state.player, point, { y: support.height + 0.5 });
    before.state.player.currentRegionId = WorldLayout.regionAt(point.x, point.z);

    const migrated = migrateSaveData(before);
    expect(migrated.state.player).toEqual(before.state.player);
    if (mounted) expect(migrated.state.mounts[STARTER_DONKEY_ID]).toEqual(before.state.mounts[STARTER_DONKEY_ID]);
    preserveResources(before.state, migrated.state);
    expect(validateSaveEnvelope(migrated)).toBe(true);
  });

  it("preserves an active mount's budget while re-grounding rider and animal together", () => {
    const before = legacy();
    const point = evidence("northwest-slope");
    const mount = before.state.mounts[STARTER_DONKEY_ID];
    Object.assign(mount, { x: point.x, y: point.supportHeight, z: point.z, gallopStamina: 31, gallopRecoveryDelaySeconds: 0.3 });
    Object.assign(before.state.player, playerPoseFromMount(mount), { activeMountId: mount.id });
    const migrated = migrateSaveData(before);
    const movedMount = migrated.state.mounts[STARTER_DONKEY_ID];
    expect(isValidMountPose(movedMount)).toBe(true);
    expect(migrated.state.player).toMatchObject(playerPoseFromMount(movedMount));
    expect(movedMount.gallopStamina).toBe(31);
    expect(movedMount.gallopRecoveryDelaySeconds).toBe(0.3);
    preserveResources(before.state, migrated.state);
    expect(validateSaveEnvelope(migrated)).toBe(true);
  });

  it.each(["sunreach", "interior"])("keeps a %s player's exact pose", (location) => {
    const before = legacy();
    const point = location === "sunreach" ? SUNREACH_ANCHORS.dockPlayer : FARMHOUSE_INTERIOR_DOOR.enterSpawn;
    Object.assign(before.state.player, { x: point.x, y: WorldLayout.traversalSurfaceHeight(point.x, point.z) + 0.5, z: point.z });
    expect(migrateSaveData(before).state.player).toEqual(before.state.player);
  });

  it.each(["boat.rowboat", "boat.skiff"])("recovers only an invalid upper-river %s without losing physical cargo", (boatTypeId) => {
    const before = legacy();
    const id = boatTypeId === "boat.skiff" ? addSkiff(before.state) : "boat.player_rowboat";
    strandBoat(before.state, id, false);
    const cargoId = "cargo.layout10_kept";
    before.state.boats[id].fishCargoSlotIds[0] = cargoId;
    before.state.fishCargo[cargoId] = {
      id: cargoId, speciesId: "fish.trout", weightKg: 2, quality: "fine", caughtAtMinute: 475,
      freshness: 84, cargoClass: "small", location: { type: "boat-hold", containerId: id, slotIndex: 0 }
    };
    expect(upperRiver.isSailable).toBe(true);
    expect(WorldLayout.isSailable(upperRiver.x, upperRiver.z)).toBe(false);
    const migrated = migrateSaveData(before);
    const mooring = defaultMooringForBoatType(boatTypeId);
    expect(migrated.state.boats[id]).toEqual({ ...before.state.boats[id], ...mooring.boatPosition, speed: 0, isDocked: true, dockedMarketId: mooring.marketId });
    expect(migrated.state.player.activeBoatId).toBeNull();
    preserveResources(before.state, migrated.state);
    expect(validateSaveEnvelope(migrated)).toBe(true);
  });

  it("keeps valid lower-river and Sunreach vessels, including a crewed waterline, exact", () => {
    const before = legacy();
    const lower = evidence("lower-river");
    strandBoat(before.state, "boat.player_rowboat", true, lower);
    const skiffId = addSkiff(before.state);
    const cove = mooringById("mooring.sunreach_cove")!;
    Object.assign(before.state.boats[skiffId], cove.boatPosition, { dockedMarketId: cove.marketId });
    const after = migrateSaveData(before).state;
    expect(after.boats).toEqual(before.state.boats);
    expect(after.player).toEqual(before.state.player);
    preserveResources(before.state, after);
  });

  it("keeps the rider aboard an invalidated boat and preserves the full active fight", () => {
    const before = legacy();
    strandBoat(before.state, "boat.player_rowboat", true, evidence("upstream-removed"));
    addSportFight(before.state);
    const oldFight = structuredClone(before.state.sportFishing!);
    const migrated = migrateSaveData(before);
    const after = migrated.state;
    expect(after.player.activeBoatId).toBe("boat.player_rowboat");
    const boat = after.boats[after.player.activeBoatId!];
    expect(boat.isDocked).toBe(false);
    expect(boat.dockedMarketId).toBeNull();
    expect(after.player).toMatchObject({ x: boat.x, y: boat.y + 0.5, z: boat.z });
    const { dynamics: oldDynamics, ...oldProgress } = oldFight;
    const { dynamics, ...progress } = after.sportFishing!;
    expect(progress).toEqual(oldProgress);
    const { originX: ox, originZ: oz, bearingRadians: ob, headingRadians: oh, ...oldMotion } = oldDynamics!;
    const { originX, originZ, bearingRadians, headingRadians, ...motion } = dynamics!;
    void ox; void oz;
    expect(motion).toEqual(oldMotion);
    expect(originX).toBe(after.player.x);
    expect(originZ).toBe(after.player.z);
    expect(headingRadians - bearingRadians).toBeCloseTo(oh - ob, 8);
    assertContinuousSportWater(after);
    preserveResources(before.state, after);
    expect(validateSaveEnvelope(migrated)).toBe(true);
  });

  it.each(["waiting-bite", "minigame", "caught"] as const)("preserves every basic %s field while repairing its invalid upper-river target", (phase) => {
    const before = legacy();
    const bank = evidence("river-bank");
    Object.assign(before.state.player, { x: bank.x, y: bank.supportHeight + 0.5, z: bank.z, rotationY: Math.PI / 2 });
    const basic: BasicFishingState = {
      ecologyId: "ecology.neva", habitatId: "river", phase, remainingSeconds: 2.2,
      catchItemId: "fish.carp", willCatch: true, castDistanceMeters: 12, castPower: 0.9,
      catchProgress: 0.74, isPerfect: true, hasBait: true, fishY: 0.4, barY: 0.2,
      hasTreasure: true, treasureProgress: 0.6, treasureCaught: false, quality: "fine"
    };
    before.state.basicFishing = basic;
    const migrated = migrateSaveData(before);
    const player = migrated.state.player;
    expect(migrated.state.basicFishing).toEqual(basic);
    expect(WorldLayout.isSailable(player.x + Math.sin(player.rotationY) * 12, player.z + Math.cos(player.rotationY) * 12)).toBe(true);
    preserveResources(before.state, migrated.state);
    expect(validateSaveEnvelope(migrated)).toBe(true);
  });

  it("relocates invalid upper schools within their existing river ecology without renewing them", () => {
    const before = legacy();
    const id = addSchool(before.state);
    const after = migrateSaveData(before).state.world.activeSchools[id];
    expect(after).toMatchObject({ ...before.state.world.activeSchools[id], x: expect.any(Number), z: expect.any(Number) });
    expect(after.z).toBeGreaterThanOrEqual(-116);
    expect(WorldLayout.isSailable(after.x, after.z)).toBe(true);
    expect(WorldLayout.fishingHabitatAt(after.x, after.z)).toBe("river");
    expect(WorldLayout.fishingEcologyAt(after.x, after.z).id).toBe("ecology.neva");
  });

  it("fails atomically if safe recovery is unavailable instead of deleting a boat or catch", () => {
    const before = legacy();
    strandBoat(before.state, "boat.player_rowboat", true);
    addSportFight(before.state);
    const frozen = structuredClone(before);
    const water = vi.spyOn(WorldLayout, "isSailable").mockReturnValue(false);
    try {
      expect(() => migrateTerrainLayout11(before.state)).toThrow("no safe compatible boat mooring");
      expect(before).toEqual(frozen);
    } finally { water.mockRestore(); }
  });

  it("preserves both stored slots when the new topology cannot migrate the primary", async () => {
    const restore = installMemoryIndexedDB();
    const primary = legacy();
    strandBoat(primary.state, "boat.player_rowboat", true);
    // Exercise recovery from a current backup while old-world water support is
    // unavailable; an old backup would correctly fail the same migration.
    const backup = migrateSaveData(legacy());
    backup.state.player.money = 731;
    const open = indexedDB.open("neva_save_db", 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onupgradeneeded = () => open.result.createObjectStore("game_saves");
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const tx = db.transaction("game_saves", "readwrite");
    tx.objectStore("game_saves").put(primary, "primary_save");
    tx.objectStore("game_saves").put(backup, "backup_save");
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); });
    const read = (key: string) => new Promise<unknown>((resolve) => {
      const request = db.transaction("game_saves", "readonly").objectStore("game_saves").get(key);
      request.onsuccess = () => resolve(request.result);
    });
    const water = vi.spyOn(WorldLayout, "isSailable").mockReturnValue(false);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const loaded = await new IndexedDbSaveRepository().loadGameResult();
      expect(loaded.status).toBe("loaded");
      if (loaded.status === "loaded") expect(loaded.envelope.state.player.money).toBe(731);
      expect(await read("primary_save")).toEqual(primary);
      expect(await read("backup_save")).toEqual(backup);
    } finally {
      water.mockRestore(); log.mockRestore(); warning.mockRestore(); restore();
    }
  });
});
