import { describe, it, expect, beforeEach } from "vitest";
import { BasicFishingMinigame } from "../../src/simulation/fishing/BasicFishingMinigame";
import { SeededRng } from "../../src/simulation/core/Rng";
import { Simulation } from "../../src/simulation/Simulation";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { ContentRegistry } from "../../src/content/ContentRegistry";

describe("BasicFishingMinigame - Stardew Valley Mechanics", () => {
  let rng: SeededRng;

  beforeEach(() => {
    rng = new SeededRng(12345);
  });

  describe("Bar Height Calculation", () => {
    it("scales with rod tier and fishing proficiency rank", () => {
      const baseHeight = BasicFishingMinigame.calculateBarHeight("rod.willow", 0);
      expect(baseHeight).toBeCloseTo(0.22, 2);

      const riverHeight = BasicFishingMinigame.calculateBarHeight("rod.river", 0);
      expect(riverHeight).toBeGreaterThan(baseHeight);

      const skilledHeight = BasicFishingMinigame.calculateBarHeight("rod.willow", 5);
      expect(skilledHeight).toBeGreaterThan(baseHeight);

      const masterHeight = BasicFishingMinigame.calculateBarHeight("rod.master", 10);
      expect(masterHeight).toBeLessThanOrEqual(0.45);
      expect(masterHeight).toBeGreaterThan(skilledHeight);
    });
  });

  describe("Cast Power Charging", () => {
    it("oscillates smoothly between 0.0 and 1.0", () => {
      const state = BasicFishingMinigame.createInitialState(
        "river",
        "fish.perch",
        0.0,
        "rod.willow",
        0,
        true,
        rng
      );
      state.phase = "charging-cast";
      state.isChargingCast = true;
      state.castPower = 0.0;
      state.castChargeDirection = 1;

      // Tick forward half a second
      BasicFishingMinigame.tickCastCharging(state, 0.5);
      expect(state.castPower).toBeGreaterThan(0.5);
      expect(state.castPower).toBeLessThanOrEqual(1.0);

      // Tick forward until it bounces off 1.0
      BasicFishingMinigame.tickCastCharging(state, 0.5);
      expect(state.castChargeDirection).toBe(-1);
      expect(state.castPower).toBeLessThanOrEqual(1.0);
    });
  });

  describe("Green Bar Physics & Momentum", () => {
    it("falls under gravity when unheld and bounces on bottom floor", () => {
      const state = BasicFishingMinigame.createInitialState(
        "river",
        "fish.perch",
        0.8,
        "rod.willow",
        0,
        true,
        rng
      );
      state.barY = 0.3;
      state.barVy = 0;
      state.isHolding = false;

      // Tick falling
      BasicFishingMinigame.tick(state, 0.3, rng);
      expect(state.barVy).toBeLessThan(0);
      expect(state.barY).toBeLessThan(0.3);

      // Tick until it hits bottom
      for (let i = 0; i < 10; i++) {
        BasicFishingMinigame.tick(state, 0.1, rng);
      }
      expect(state.barY).toBe(0);
    });

    it("accelerates upward when holding action key", () => {
      const state = BasicFishingMinigame.createInitialState(
        "river",
        "fish.perch",
        0.8,
        "rod.willow",
        0,
        true,
        rng
      );
      state.barY = 0.1;
      state.barVy = 0;
      state.isHolding = true;

      BasicFishingMinigame.tick(state, 0.3, rng);
      expect(state.barVy).toBeGreaterThan(0);
      expect(state.barY).toBeGreaterThan(0.1);
    });
  });

  describe("Catch Progress & Outcome", () => {
    it("progress increases when fish is inside bar and lands fish at 100%", () => {
      const state = BasicFishingMinigame.createInitialState(
        "river",
        "fish.perch",
        0.9,
        "rod.willow",
        0,
        true,
        rng
      );
      state.fishY = 0.2;
      state.fishTargetY = 0.2;
      state.barY = 0.1;
      state.barHeight = 0.3; // Fish is well inside bar [0.1, 0.4]
      state.isHolding = false;
      state.catchProgress = 0.85;

      const result = BasicFishingMinigame.tick(state, 1.0, rng);
      expect(state.catchProgress).toBe(1.0);
      expect(result).toBe("landed");
      expect(state.phase).toBe("caught");
      expect(state.isPerfect).toBe(true);
    });

    it("progress drops and loses perfect catch when fish is outside bar", () => {
      const state = BasicFishingMinigame.createInitialState(
        "river",
        "fish.perch",
        0.5,
        "rod.willow",
        0,
        true,
        rng
      );
      state.fishY = 0.8;
      state.barY = 0.1;
      state.barHeight = 0.2; // Fish is outside bar
      state.catchProgress = 0.30;
      state.isPerfect = true;

      BasicFishingMinigame.tick(state, 0.5, rng);
      expect(state.catchProgress).toBeLessThan(0.30);
      expect(state.isPerfect).toBe(false);
    });
  });

  describe("Quality Rating & Perfect Catch Bonus", () => {
    it("awards quality upgrades and perfect catch boosts", () => {
      const perfectQuality = BasicFishingMinigame.determineQuality(0.9, true, rng);
      expect(["exceptional", "trophy"]).toContain(perfectQuality);

      const imperfectQuality = BasicFishingMinigame.determineQuality(0.2, false, rng);
      expect(imperfectQuality).toBe("common");
    });
  });

  describe("Sunken Treasure Chests", () => {
    it("unlocks treasure when green bar hovers over chest position", () => {
      const state = BasicFishingMinigame.createInitialState(
        "river",
        "fish.perch",
        0.8,
        "rod.willow",
        0,
        true,
        rng
      );
      state.hasTreasure = true;
      state.treasureY = 0.25;
      state.barY = 0.15;
      state.barHeight = 0.25; // Covers treasure at 0.25
      state.treasureProgress = 0.5;
      state.treasureCaught = false;

      BasicFishingMinigame.tick(state, 1.5, rng);
      expect(state.treasureCaught).toBe(true);
      expect(state.treasureProgress).toBe(1.0);
    });

    it("treasure loot ids are all registered items", () => {
      ContentRegistry.initializeAndValidate();
      const table = [
        ...BasicFishingMinigame.COMMON_TREASURE_LOOT,
        ...BasicFishingMinigame.RARE_TREASURE_LOOT
      ];
      expect(table.length).toBeGreaterThan(0);
      for (const id of table) {
        expect(ContentRegistry.items.has(id)).toBe(true);
      }
      const lootRng = new SeededRng(99);
      let granted = 0;
      for (let i = 0; i < 24; i++) {
        const loot = BasicFishingMinigame.generateTreasureLoot("river", lootRng);
        expect(loot.length).toBeGreaterThan(0);
        for (const id of loot) {
          expect(ContentRegistry.items.has(id)).toBe(true);
          granted += 1;
        }
      }
      expect(granted).toBeGreaterThan(0);
    });
  });
});

describe("Simulation Basic Fishing Loop Integration", () => {
  let sim: Simulation;

  beforeEach(() => {
    sim = new Simulation();
  });

  it("completes full 5-phase loop from cast charging to bite, hook, and catch", () => {
    sim.state.player.x = -8;
    sim.state.player.z = 0; // River shoreline

    // 1. Start Charge
    const startRes = sim.startChargingBasicFishing();
    expect(startRes.success).toBe(true);
    expect(sim.state.basicFishing?.phase).toBe("charging-cast");

    // 2. Release Cast at 80% power
    const castRes = sim.releaseCastBasicFishing(0.80);
    expect(castRes.success).toBe(true);
    expect(sim.state.basicFishing?.phase).toBe("waiting-bite");
    expect(sim.state.basicFishing?.castPower).toBe(0.80);

    // 3. Fast-forward until Bite Alert triggers
    sim.state.basicFishing!.remainingSeconds = 0.05;
    sim.tick(0.1);
    expect(sim.state.basicFishing?.phase).toBe("bite-reaction");

    // 4. Hook the bite
    const hookRes = sim.hookBiteBasicFishing();
    expect(hookRes.success).toBe(true);
    expect(sim.state.basicFishing?.phase).toBe("minigame");

    // 5. Play minigame to catch with realistic frame steps
    sim.state.basicFishing!.fishY = 0.35;
    sim.state.basicFishing!.fishTargetY = 0.35;
    sim.state.basicFishing!.barY = 0.25;
    sim.state.basicFishing!.barHeight = 0.4;
    sim.state.basicFishing!.catchProgress = 0.95;
    sim.state.basicFishing!.isHolding = false;

    for (let i = 0; i < 5; i++) {
      if (!sim.state.basicFishing) break;
      sim.tick(0.05);
    }
    expect(sim.state.basicFishing?.phase).toBe("caught");
    expect(sim.execute({ type: "fishing.commit-basic" }).success).toBe(true);
    expect(sim.state.basicFishing).toBeNull();
    expect(InventoryManager.getItemCount(sim.state.inventories[sim.state.player.inventoryId], "fish.perch")).toBeGreaterThan(0);
  });

  it("does not consume bait on charge-start; cancel from charging leaves bait unspent", () => {
    sim.state.player.x = -8;
    sim.state.player.z = 0;
    const inv = sim.state.inventories[sim.state.player.inventoryId];
    const baitBefore = InventoryManager.getItemCount(inv, "item.bait_worms");
    expect(sim.startChargingBasicFishing().success).toBe(true);
    expect(sim.state.basicFishing?.hasBait).toBe(true);
    expect(InventoryManager.getItemCount(inv, "item.bait_worms")).toBe(baitBefore);
    sim.cancelBasicFishing();
    expect(InventoryManager.getItemCount(inv, "item.bait_worms")).toBe(baitBefore);
  });

  it("consumes bait on successful release and still misses AFK even when willCatch is true", () => {
    sim.state.player.x = -8;
    sim.state.player.z = 0;
    const inv = sim.state.inventories[sim.state.player.inventoryId];
    const baitBefore = InventoryManager.getItemCount(inv, "item.bait_worms");
    expect(sim.startChargingBasicFishing().success).toBe(true);
    expect(sim.releaseCastBasicFishing(0.8).success).toBe(true);
    expect(InventoryManager.getItemCount(inv, "item.bait_worms")).toBe(baitBefore - 1);
    expect(typeof sim.state.basicFishing?.willCatch).toBe("boolean");
    sim.state.basicFishing!.willCatch = true;
    sim.state.basicFishing!.remainingSeconds = 0.05;
    sim.tick(3);
    expect(sim.state.basicFishing?.phase).toBe("bite-reaction");
    for (let i = 0; i < 40; i += 1) sim.tick(0.05);
    expect(sim.state.basicFishing).toBeNull();
    expect(InventoryManager.getItemCount(inv, "fish.perch")).toBe(0);
  });

  it("keeps the bite-reaction window after a hitch-sized frame", () => {
    sim.state.player.x = -8;
    sim.state.player.z = 0;
    expect(sim.startChargingBasicFishing().success).toBe(true);
    expect(sim.releaseCastBasicFishing(0.8).success).toBe(true);
    sim.state.basicFishing!.remainingSeconds = 0.05;
    sim.tick(0.1);
    expect(sim.state.basicFishing?.phase).toBe("bite-reaction");
    const before = sim.state.basicFishing!.remainingSeconds;
    sim.tick(2);
    expect(sim.state.basicFishing?.phase).toBe("bite-reaction");
    expect(sim.state.basicFishing!.remainingSeconds).toBeGreaterThan(before - 0.2);
    expect(sim.hookBiteBasicFishing().success).toBe(true);
  });

  it("treasure catch grants at least one registered item without dropping the fish", () => {
    sim.state.player.x = -8;
    sim.state.player.z = 0;
    expect(sim.castBasicFishing().success).toBe(true);
    sim.state.basicFishing!.remainingSeconds = 0.05;
    sim.tick(0.1);
    expect(sim.hookBiteBasicFishing().success).toBe(true);

    const inv = sim.state.inventories[sim.state.player.inventoryId];
    const table = [
      ...BasicFishingMinigame.COMMON_TREASURE_LOOT,
      ...BasicFishingMinigame.RARE_TREASURE_LOOT
    ];
    const before = Object.fromEntries(table.map((id) => [id, InventoryManager.getItemCount(inv, id)]));

    sim.state.basicFishing!.hasTreasure = true;
    sim.state.basicFishing!.treasureCaught = true;
    sim.state.basicFishing!.fishY = 0.35;
    sim.state.basicFishing!.fishTargetY = 0.35;
    sim.state.basicFishing!.barY = 0.25;
    sim.state.basicFishing!.barHeight = 0.4;
    sim.state.basicFishing!.catchProgress = 0.95;
    sim.state.basicFishing!.isHolding = false;
    for (let i = 0; i < 5; i++) {
      if (!sim.state.basicFishing) break;
      sim.tick(0.05);
    }
    expect(sim.state.basicFishing?.phase).toBe("caught");
    expect(sim.execute({ type: "fishing.commit-basic" }).success).toBe(true);
    expect(sim.state.basicFishing).toBeNull();
    expect(InventoryManager.getItemCount(inv, "fish.perch")).toBe(1);
    const added = table.reduce(
      (sum, id) => sum + Math.max(0, InventoryManager.getItemCount(inv, id) - (before[id] ?? 0)),
      0
    );
    expect(added).toBeGreaterThan(0);
  });
});
