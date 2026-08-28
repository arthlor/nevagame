import { describe, it, expect, beforeEach } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { WorldLayout } from "../../src/world/WorldLayout";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { QUESTS } from "../../src/content/quests";

describe("Fishing, cargo, quest, and habitat fixes", () => {
  let sim: Simulation;

  beforeEach(() => {
    sim = new Simulation();
  });

  it("refuses discard when scraps cannot fit and leaves the fish cargo", () => {
    sim.state.fishCargo["cargo.spoiled"] = {
      id: "cargo.spoiled",
      speciesId: "fish.trout",
      weightKg: 3,
      quality: "fine",
      caughtAtMinute: 0,
      freshness: 0,
      cargoClass: "small",
      location: { type: "player", containerId: "player" }
    };
    sim.state.player.carriedFishCargoId = "cargo.spoiled";
    const inv = sim.state.inventories[sim.state.player.inventoryId];
    for (const slot of inv.slots) {
      slot.itemId = "seed.wheat";
      slot.quantity = 1;
    }
    const discard = sim.discardFishCargo("cargo.spoiled");
    expect(discard.success).toBe(false);
    expect(discard.reason).toMatch(/inventory space/i);
    expect(sim.state.fishCargo["cargo.spoiled"]).toBeDefined();
    expect(sim.state.player.carriedFishCargoId).toBe("cargo.spoiled");
  });

  it("lets the player fish from the Act 3 bridge waypoint", () => {
    const act3 = QUESTS.find((quest) => quest.id === "quest.act3_river_angler")!;
    const anchor = act3.objectives[0].locationAnchor!;
    expect(WorldLayout.nearbyFishingHabitat(anchor.x, anchor.z)).toBe("river");
    sim.state.player.x = anchor.x;
    sim.state.player.z = anchor.z;
    expect(sim.castBasicFishing().success).toBe(true);
    expect(sim.state.basicFishing?.habitatId).toBe("river");
  });

  it("keeps a common river fish eligible at night in windy weather", () => {
    sim.state.player.x = -8;
    sim.state.player.z = 0;
    sim.state.clock.timeOfDay = "night";
    sim.state.weather.type = "windy";
    const cast = sim.castBasicFishing();
    expect(cast.success).toBe(true);
    expect(["fish.perch", "fish.carp"]).toContain(sim.state.basicFishing?.catchItemId);
  });

  it("fails releaseCast when the habitat pool is empty instead of falling back to perch", () => {
    sim.state.player.x = -8;
    sim.state.player.z = 0;
    expect(sim.startChargingBasicFishing().success).toBe(true);
    sim.state.basicFishing!.habitatId = "offshore";
    const release = sim.releaseCastBasicFishing(0.5);
    expect(release).toMatchObject({ success: false, reason: "Nothing is biting in these conditions" });
    expect(sim.state.basicFishing).toBeNull();
  });

  it("does not emit FishEscaped or delete a won sport fight when cargo is full", () => {
    const inv = sim.state.inventories[sim.state.player.inventoryId];
    InventoryManager.addItemsAtomically(inv, [{ itemId: "item.chum_bucket", quantity: 1 }]);
    const lake = { x: 18, z: WorldLayout.coastlineZ(18) + 12 };
    const schoolId = sim.spawnFishSchool("lake", lake.x, lake.z, ["fish.trout"]);
    sim.state.player.x = lake.x;
    sim.state.player.z = lake.z;
    expect(sim.chumFishSchool(schoolId).success).toBe(true);
    expect(sim.hookSportFish(schoolId).success).toBe(true);
    expect(sim.state.world.activeSchools[schoolId].remainingCatchPotential).toBe(3);

    sim.state.player.carriedFishCargoId = "cargo.blocking";
    sim.state.fishCargo["cargo.blocking"] = {
      id: "cargo.blocking",
      speciesId: "fish.carp",
      weightKg: 2,
      quality: "common",
      caughtAtMinute: 0,
      freshness: 100,
      cargoClass: "small",
      location: { type: "player", containerId: "player" }
    };

    const escaped: string[] = [];
    sim.events.on("FishEscaped", (event) => {
      escaped.push(event.speciesId);
    });

    sim.clock.setSpeed(0);
    for (let step = 0; step < 400; step++) {
      if (!sim.activeFishingEncounter) break;
      const state = sim.activeFishingEncounter.getState();
      if (state.result === "landed") break;
      const isReeling = state.lineTension < 70;
      const isBracing = state.behavior === "dive" || state.behavior === "burst";
      const isSlacking = state.lineTension > 80;
      sim.setSportFishingInput({
        isReeling: isReeling && !isSlacking,
        isSlacking,
        isBracing,
        rodDirectionAngle: -state.fishDirection
      });
      sim.tick(0.5);
    }

    expect(escaped).toEqual([]);
    expect(sim.activeFishingEncounter).not.toBeNull();
    expect(Object.values(sim.state.fishCargo).some((cargo) => cargo.speciesId === "fish.trout")).toBe(false);
    expect(sim.state.world.activeSchools[schoolId].remainingCatchPotential).toBe(3);

    sim.discardFishCargo("cargo.blocking");
    sim.tick(0.5);
    expect(sim.activeFishingEncounter).toBeNull();
    expect(Object.values(sim.state.fishCargo).some((cargo) => cargo.speciesId === "fish.trout")).toBe(true);
    expect(sim.state.world.activeSchools[schoolId].remainingCatchPotential).toBe(2);
  });

  it("nulls unrestorable sport fishing so the encounter cannot lock other actions", () => {
    const clone = structuredClone(sim.state);
    clone.sportFishing = {
      fish: {
        instanceId: "fish_inst.bad",
        speciesId: "fish.missing",
        weightKg: 3,
        quality: "common",
        caughtAtMinute: 0
      },
      rodId: "rod.willow",
      stamina: 10,
      maxStamina: 40,
      distanceMeters: 12,
      lineTension: 35,
      lineIntegrity: 100,
      fishDirection: 0,
      behavior: "rest",
      behaviorUntilSeconds: 1,
      elapsedSeconds: 1,
      rodDirectionAngle: 0,
      isReeling: false,
      isSlacking: false,
      isBracing: false,
      slackTimerSeconds: 0,
      snapTimerSeconds: 0,
      result: "active"
    };
    const loaded = new Simulation(clone);
    expect(loaded.state.sportFishing).toBeNull();
    expect(loaded.activeFishingEncounter).toBeNull();
    loaded.state.player.x = -8;
    loaded.state.player.z = 0;
    expect(loaded.startChargingBasicFishing().success).toBe(true);
  });

  it("keeps the authored story school in lake water", () => {
    const point = { x: 18, z: WorldLayout.coastlineZ(18) + 12 };
    expect(WorldLayout.fishingHabitatAt(point.x, point.z)).toBe("lake");
    expect(ContentRegistry.fishSpecies.get("fish.carp")?.habitats).toContain("lake");
  });

  it("persists the owning school while a deferred landing waits for cargo space", () => {
    const state = structuredClone(sim.state);
    state.worldSeed = 7;
    state.metadata.rngState = undefined;
    const seeded = new Simulation(state);
    const inventory = seeded.state.inventories[seeded.state.player.inventoryId];
    InventoryManager.addItemsAtomically(inventory, [{ itemId: "item.chum_bucket", quantity: 1 }]);
    const lake = { x: 18, z: WorldLayout.coastlineZ(18) + 12 };
    const schoolId = seeded.spawnFishSchool("lake", lake.x, lake.z, ["fish.trout"]);
    seeded.state.player.x = lake.x;
    seeded.state.player.z = lake.z;
    expect(seeded.chumFishSchool(schoolId).success).toBe(true);
    expect(seeded.hookSportFish(schoolId).success).toBe(true);

    const blockingCargoId = "cargo.persist_blocker";
    seeded.state.fishCargo[blockingCargoId] = {
      id: blockingCargoId,
      speciesId: "fish.carp",
      weightKg: 3,
      quality: "common",
      caughtAtMinute: seeded.state.clock.currentMinute,
      freshness: 100,
      cargoClass: "small",
      location: { type: "player", containerId: "player" }
    };
    seeded.state.player.carriedFishCargoId = blockingCargoId;
    seeded.state.sportFishing!.stamina = 0;
    seeded.state.sportFishing!.distanceMeters = 0;
    seeded.state.sportFishing!.lineTension = 0;

    const reloaded = new Simulation(structuredClone(seeded.state));
    expect(reloaded.state.sportFishing?.schoolId).toBe(schoolId);
    reloaded.tick(0.1);
    expect(reloaded.activeFishingEncounter).not.toBeNull();

    expect(reloaded.discardFishCargo(blockingCargoId).success).toBe(true);
    reloaded.tick(0.1);
    expect(reloaded.activeFishingEncounter).toBeNull();
    expect(reloaded.state.world.activeSchools[schoolId].remainingCatchPotential).toBe(2);
  });

  it("reduces sport-fish rare quality when Work Capacity is empty", () => {
    const makeHook = (workCapacity: number): string => {
      const state = structuredClone(sim.state);
      state.worldSeed = 0;
      state.metadata.rngState = undefined;
      const candidate = new Simulation(state);
      candidate.state.player.workCapacity.current = workCapacity;
      const inventory = candidate.state.inventories[candidate.state.player.inventoryId];
      InventoryManager.addItemsAtomically(inventory, [{ itemId: "item.chum_bucket", quantity: 1 }]);
      const lake = { x: 18, z: WorldLayout.coastlineZ(18) + 12 };
      const schoolId = candidate.spawnFishSchool("lake", lake.x, lake.z, ["fish.trout"]);
      candidate.state.player.x = lake.x;
      candidate.state.player.z = lake.z;
      expect(candidate.chumFishSchool(schoolId).success).toBe(true);
      return candidate.hookSportFish(schoolId).encounter!.fish.quality;
    };

    expect(makeHook(1000)).toBe("trophy");
    expect(makeHook(0)).toBe("common");
  });
});
