import { ContentRegistry } from "../../content/ContentRegistry";
import { WorldLayout } from "../../world/WorldLayout";
import type {
  BasicFishingPhase,
  BasicFishingState,
  FishSchoolId,
  FishSpeciesId,
  FishingEncounterState,
  FishInstance,
  FishQuality
} from "../core/types";
import { BasicFishingMinigame } from "../fishing/BasicFishingMinigame";
import { FishingEncounter } from "../fishing/FishingEncounter";
import { InventoryManager } from "../inventory/InventoryManager";
import type { CargoDomain } from "./CargoDomain";
import type { DomainContext } from "./DomainContext";
import { distance2d } from "./DomainContext";
import type { ProgressionDomain } from "./ProgressionDomain";
import { rodMeetsMinimum, rollSpeciesWeightKg } from "./domainRules";

const SCHOOL_INTERACTION_RADIUS = 12;
const SCHOOL_RESPAWN_COOLDOWN_MINUTES = 90;
export const SPORT_FISHING_REVIEW_POINTS = {
  trout: { habitatId: "lake", x: 18, z: WorldLayout.coastlineZ(18) + 12, speciesId: "fish.trout" },
  tuna: { habitatId: "coast", x: 118, z: WorldLayout.coastlineZ(118) + 58, speciesId: "fish.tuna" }
} as const;

export const SCHOOL_SPAWN_POINTS = [
  SPORT_FISHING_REVIEW_POINTS.trout,
  SPORT_FISHING_REVIEW_POINTS.tuna
] as const;
const FISHING_HABITATS = new Set(["river", "lake", "coast", "offshore"]);

export interface FishingControlInput {
  isReeling: boolean;
  isSlacking: boolean;
  isBracing: boolean;
  rodDirectionAngle: number;
}

export class FishingDomain {
  private encounter: FishingEncounter | null = null;
  private pendingLandSchoolId: FishSchoolId | null = null;

  constructor(
    private readonly context: DomainContext,
    private readonly cargo: CargoDomain,
    private readonly progression: ProgressionDomain
  ) {
    const savedEncounter = context.state.sportFishing;
    if (savedEncounter?.result === "active") {
      try {
        this.encounter = FishingEncounter.fromState(savedEncounter, context.rng);
        this.pendingLandSchoolId = savedEncounter.schoolId ?? null;
        this.encounter.setInput({ isReeling: false, isSlacking: false, isBracing: false, rodDirectionAngle: 0 });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[FishingDomain] Failed to restore sport-fishing encounter:", error);
        context.events.emit("Notification", {
          title: "Sport fishing could not be restored",
          message,
          type: "error"
        });
        // Keep sportFishing so a corrupt restore is visible instead of silently dropped.
      }
    } else {
      context.state.sportFishing = null;
    }
  }

  public get activeEncounter(): FishingEncounter | null {
    return this.encounter;
  }

  public setInput(input: FishingControlInput): boolean {
    if (!this.encounter) return false;
    this.encounter.setInput(input);
    return true;
  }

  public cancelAll(): void {
    this.encounter = null;
    this.pendingLandSchoolId = null;
    this.context.state.sportFishing = null;
    this.context.state.basicFishing = null;
  }

  public tick(realDeltaSeconds: number): void {
    const { state, events } = this.context;
    if (this.encounter) {
      const outcome = this.encounter.tick(realDeltaSeconds);
      if (outcome === "landed") {
        const encounterState = this.encounter.getState();
        const landing = this.cargo.landCaughtFish(encounterState.fish);
        if (!landing.success) {
          this.encounter.deferLanding();
          state.sportFishing = this.encounter.getState() as FishingEncounterState;
        } else {
          this.commitSchoolCatch();
          this.encounter = null;
          state.sportFishing = null;
        }
      } else if (outcome === "escaped" || outcome === "line-snapped") {
        const encounterState = this.encounter.getState();
        events.emit("FishEscaped", {
          speciesId: encounterState.fish.speciesId,
          reason: outcome === "line-snapped" ? "snapped" : "escaped",
          minute: state.clock.currentMinute
        });
        this.pendingLandSchoolId = null;
        this.encounter = null;
        state.sportFishing = null;
      }
    }
    this.tickBasicFishing(realDeltaSeconds);
  }

  public startChargingCastBasic(): { success: boolean; reason?: string } {
    const { state } = this.context;
    if (this.encounter || state.basicFishing) return { success: false, reason: "Already fishing" };
    const habitatId = WorldLayout.nearbyFishingHabitat(state.player.x, state.player.z);
    if (!habitatId) return { success: false, reason: "Move closer to fishable water" };
    const inventory = state.inventories[state.player.inventoryId];
    const rod = ContentRegistry.rods.get(state.player.equippedRodId);
    if (!rod || !rod.allowedHabitats.includes(habitatId)) {
      return { success: false, reason: "Your equipped rod cannot fish this water" };
    }

    const eligibleSpecies = this.listEligibleBasicSpecies(habitatId, rod.rodClass);
    if (eligibleSpecies.length === 0) return { success: false, reason: "Nothing is biting in these conditions" };
    if (!eligibleSpecies.some((fish) => InventoryManager.canAddItems(inventory, [{ itemId: fish.id, quantity: 1 }]))) {
      return { success: false, reason: "Inventory is full!" };
    }

    const hasBait = InventoryManager.hasItems(inventory, [{ itemId: "item.bait_worms", quantity: 1 }]);

    const initial = BasicFishingMinigame.createInitialState(
      habitatId,
      eligibleSpecies[0].id,
      0.0,
      state.player.equippedRodId,
      this.progression.getProficiencyLevel("fishing"),
      hasBait,
      this.context.rng
    );
    initial.phase = "charging-cast";
    initial.isChargingCast = true;
    state.basicFishing = initial;
    return { success: true };
  }

  public releaseCastBasic(castPower?: number): { success: boolean; reason?: string } {
    const { state, rng, events } = this.context;
    if (!state.basicFishing) return { success: false, reason: "Not casting" };
    const power = Math.max(0.05, Math.min(1.0, castPower ?? state.basicFishing.castPower ?? 0.75));
    const habitatId = state.basicFishing.habitatId;
    const rod = ContentRegistry.rods.get(state.player.equippedRodId);

    const eligibleSpecies = this.listEligibleBasicSpecies(habitatId, rod?.rodClass || "willow");
    if (eligibleSpecies.length === 0) {
      state.basicFishing = null;
      return { success: false, reason: "Nothing is biting in these conditions" };
    }

    let hasBait = state.basicFishing.hasBait ?? false;
    if (hasBait) {
      hasBait = this.consumeBaitIfPresent();
    }

    const catchItemId = rng.weighted(eligibleSpecies.map((fish) => ({ value: fish.id, weight: fish.rarityWeight })));

    const newState = BasicFishingMinigame.createInitialState(
      habitatId,
      catchItemId,
      power,
      state.player.equippedRodId,
      this.progression.getProficiencyLevel("fishing"),
      hasBait,
      rng
    );
    newState.willCatch = rod ? rng.chance(rod.hookReliability) : false;
    state.basicFishing = newState;
    this.context.persistRng();
    events.emit("BasicFishingStarted", { habitatId, castPower: power, minute: state.clock.currentMinute });
    return { success: true };
  }

  public hookBiteBasic(): { success: boolean; reason?: string } {
    const { state, events } = this.context;
    const attempt = state.basicFishing;
    if (!attempt) return { success: false, reason: "Not fishing" };
    if (attempt.phase !== "bite-reaction" && !(attempt.phase === "waiting-bite" && attempt.remainingSeconds <= 1.0)) {
      return { success: false, reason: "No fish biting yet!" };
    }

    attempt.phase = "minigame";
    events.emit("BasicFishingMinigameStarted", {
      habitatId: attempt.habitatId,
      speciesId: (attempt.catchItemId || "fish.perch") as FishSpeciesId,
      hasTreasure: attempt.hasTreasure ?? false,
      minute: state.clock.currentMinute
    });
    return { success: true };
  }

  public setBasicFishingInput(isHolding: boolean): void {
    if (this.context.state.basicFishing) {
      this.context.state.basicFishing.isHolding = isHolding;
    }
  }

  public cancelBasicFishing(): void {
    const { state, events } = this.context;
    if (state.basicFishing) {
      events.emit("BasicFishingResolved", {
        habitatId: state.basicFishing.habitatId,
        reason: "cancelled",
        minute: state.clock.currentMinute
      });
      state.basicFishing = null;
    }
  }

  public castBasic(castPower: number = 0.75): { success: boolean; reason?: string } {
    const { state, rng, events } = this.context;
    if (this.encounter || state.basicFishing) return { success: false, reason: "Already fishing" };
    const habitatId = WorldLayout.nearbyFishingHabitat(state.player.x, state.player.z);
    if (!habitatId) return { success: false, reason: "Move closer to fishable water" };
    const inventory = state.inventories[state.player.inventoryId];
    const rod = ContentRegistry.rods.get(state.player.equippedRodId);
    if (!rod || !rod.allowedHabitats.includes(habitatId)) {
      return { success: false, reason: "Your equipped rod cannot fish this water" };
    }

    const eligibleSpecies = this.listEligibleBasicSpecies(habitatId, rod.rodClass);
    if (eligibleSpecies.length === 0) return { success: false, reason: "Nothing is biting in these conditions" };
    if (!eligibleSpecies.some((fish) => InventoryManager.canAddItems(inventory, [{ itemId: fish.id, quantity: 1 }]))) {
      return { success: false, reason: "Inventory is full!" };
    }

    const hasBait = this.consumeBaitIfPresent();

    const catchItemId = rng.weighted(
      eligibleSpecies.map((fish) => ({ value: fish.id, weight: fish.rarityWeight }))
    );

    const fishingState = BasicFishingMinigame.createInitialState(
      habitatId,
      catchItemId,
      castPower,
      state.player.equippedRodId,
      this.progression.getProficiencyLevel("fishing"),
      hasBait,
      rng
    );
    fishingState.phase = "casting" as BasicFishingPhase;
    fishingState.willCatch = rng.chance(rod.hookReliability);
    state.basicFishing = fishingState;
    this.context.persistRng();
    events.emit("BasicFishingStarted", { habitatId, castPower, minute: state.clock.currentMinute });
    return { success: true };
  }

  public spawnSchool(habitatId: string, x: number, z: number, speciesIds: FishSpeciesId[]): FishSchoolId {
    const { state, events } = this.context;
    const physicalHabitat = Number.isFinite(x) && Number.isFinite(z) ? WorldLayout.fishingHabitatAt(x, z) : null;
    if (!FISHING_HABITATS.has(habitatId) || physicalHabitat !== habitatId) {
      throw new Error("Fish schools must be spawned in their matching physical habitat");
    }
    if (
      speciesIds.length === 0 ||
      speciesIds.some((speciesId) => {
        const fish = ContentRegistry.fishSpecies.get(speciesId);
        return !fish || !fish.isSportFish || !fish.habitats.includes(habitatId);
      })
    ) {
      throw new Error("Fish schools require eligible sport-fish species for their habitat");
    }

    const schoolId = this.context.nextEntityId("school");
    state.world.activeSchools[schoolId] = {
      id: schoolId,
      habitatId,
      x,
      z,
      radius: 8,
      spawnedAtMinute: state.clock.currentMinute,
      expiresAtMinute: state.clock.currentMinute + 180,
      remainingCatchPotential: 3,
      speciesWeights: speciesIds.map((speciesId) => ({
        speciesId,
        weight: ContentRegistry.fishSpecies.get(speciesId)?.rarityWeight ?? 1
      }))
    };
    this.context.persistRng();
    events.emit("FishSchoolSpawned", { schoolId, x, z, species: speciesIds, minute: state.clock.currentMinute });
    return schoolId;
  }

  public chumSchool(schoolId: FishSchoolId): { success: boolean; reason?: string } {
    const { state, events } = this.context;
    const school = state.world.activeSchools[schoolId];
    if (!school) return { success: false, reason: "School disappeared" };
    if (distance2d(state.player, school) > SCHOOL_INTERACTION_RADIUS) {
      return { success: false, reason: "Move closer to the fish school" };
    }
    if (school.feedingFrenzyUntilMinute && state.clock.currentMinute <= school.feedingFrenzyUntilMinute) {
      return { success: false, reason: "This school is already feeding" };
    }
    const inventory = state.inventories[state.player.inventoryId];
    const chum = [{ itemId: "item.chum_bucket", quantity: 1 }];
    if (!InventoryManager.hasItems(inventory, chum)) return { success: false, reason: "You need a Chum Bucket!" };
    InventoryManager.removeItemsAtomically(inventory, chum);
    school.feedingFrenzyUntilMinute = state.clock.currentMinute + 30;
    events.emit("FishSchoolChummed", { schoolId, habitatId: school.habitatId, frenzyMinutes: 30, minute: state.clock.currentMinute });
    return { success: true };
  }

  public hookSportFish(
    schoolId: FishSchoolId
  ): { success: boolean; encounter?: FishingEncounterState; reason?: string } {
    const { state, rng, events } = this.context;
    if (this.encounter || state.basicFishing) return { success: false, reason: "Already fighting a fish" };
    const school = state.world.activeSchools[schoolId];
    if (!school) return { success: false, reason: "No active school" };
    if (distance2d(state.player, school) > SCHOOL_INTERACTION_RADIUS) {
      return { success: false, reason: "Move closer to the fish school" };
    }
    if (!school.feedingFrenzyUntilMinute || state.clock.currentMinute > school.feedingFrenzyUntilMinute) {
      return { success: false, reason: "School is not in a feeding frenzy! Chum it first." };
    }

    const speciesId = rng.weighted(school.speciesWeights.map((entry) => ({ value: entry.speciesId, weight: entry.weight })));
    const speciesDef = ContentRegistry.fishSpecies.get(speciesId);
    if (!speciesDef) {
      this.context.persistRng();
      return { success: false, reason: "Unknown fish species" };
    }
    const rodDef = ContentRegistry.rods.get(state.player.equippedRodId) ?? ContentRegistry.rods.get("rod.willow")!;
    if (!rodMeetsMinimum(rodDef.rodClass, speciesDef.minimumRodClass)) {
      this.context.persistRng();
      return { success: false, reason: "Rod class is too light for this species" };
    }
    const weightKg = rollSpeciesWeightKg(speciesDef.weightKg, rng);
    const quality = this.rollQuality(this.progression.getWorkOutcome().rareChanceMultiplier);
    const fish: FishInstance = {
      instanceId: this.context.nextEntityId("fish_inst"),
      speciesId,
      weightKg,
      quality,
      caughtAtMinute: state.clock.currentMinute
    };
    this.encounter = new FishingEncounter(fish, state.player.equippedRodId, rng, 30);
    state.sportFishing = this.encounter.getState() as FishingEncounterState;
    this.pendingLandSchoolId = schoolId;
    state.sportFishing.schoolId = schoolId;
    this.context.persistRng();
    events.emit("FishHooked", { speciesId, habitatId: school.habitatId, weightKg: fish.weightKg, minute: state.clock.currentMinute });
    return { success: true, encounter: this.encounter.getState() };
  }

  public tickSchools(): void {
    const { state } = this.context;
    const currentMinute = state.clock.currentMinute;
    for (const [id, school] of Object.entries(state.world.activeSchools)) {
      if (currentMinute >= school.expiresAtMinute || school.remainingCatchPotential <= 0) {
        delete state.world.activeSchools[id];
      }
    }
    if (Object.keys(state.world.activeSchools).length > 0) return;

    // Act 5 has an authored entry path. The first lake school is guaranteed
    // once the rowboat has been commissioned, independent of weather or the
    // normal respawn cadence; subsequent schools retain the live ecology.
    if (
      state.quests.activeQuestId === "quest.act5_maiden_voyage" &&
      state.quests.unlockedFeatureIds.includes("boat.player_rowboat") &&
      !state.world.storySchoolSpawned
    ) {
      const starterPoint = SCHOOL_SPAWN_POINTS[0];
      this.spawnSchool(starterPoint.habitatId, starterPoint.x, starterPoint.z, ["fish.trout"]);
      state.world.storySchoolSpawned = true;
      state.world.lastSchoolSpawnMinute = currentMinute;
      return;
    }

    const lastSpawn = state.world.lastSchoolSpawnMinute ?? Number.NEGATIVE_INFINITY;
    if (currentMinute - lastSpawn < SCHOOL_RESPAWN_COOLDOWN_MINUTES) return;

    let spawned = false;
    for (const point of SCHOOL_SPAWN_POINTS) {
      const speciesIds = Array.from(ContentRegistry.fishSpecies.values())
        .filter(
          (fish) =>
            fish.isSportFish &&
            fish.habitats.includes(point.habitatId) &&
            fish.seasons.includes(state.clock.season) &&
            fish.timeWindows.includes(state.clock.timeOfDay) &&
            fish.weatherPreferences.includes(state.weather.type)
        )
        .map((fish) => fish.id);
      if (speciesIds.length === 0) continue;
      this.spawnSchool(point.habitatId, point.x, point.z, speciesIds);
      spawned = true;
    }
    if (spawned) state.world.lastSchoolSpawnMinute = currentMinute;
  }

  private listEligibleBasicSpecies(habitatId: string, rodClass: "willow" | "river" | "heavy-sport" | "offshore" | "master") {
    const { state } = this.context;
    const inHabitat = Array.from(ContentRegistry.fishSpecies.values()).filter(
      (fish) =>
        !fish.isSportFish &&
        fish.habitats.includes(habitatId) &&
        fish.seasons.includes(state.clock.season) &&
        rodMeetsMinimum(rodClass, fish.minimumRodClass) &&
        ContentRegistry.items.has(fish.id)
    );
    const inConditions = inHabitat.filter(
      (fish) =>
        fish.timeWindows.includes(state.clock.timeOfDay) &&
        fish.weatherPreferences.includes(state.weather.type)
    );
    // Never AND time×weather into a hard-empty common pool for the vertical slice.
    return inConditions.length > 0 ? inConditions : inHabitat;
  }

  private consumeBaitIfPresent(): boolean {
    const inventory = this.context.state.inventories[this.context.state.player.inventoryId];
    const bait = [{ itemId: "item.bait_worms", quantity: 1 }];
    if (!InventoryManager.hasItems(inventory, bait)) return false;
    InventoryManager.removeItemsAtomically(inventory, bait);
    return true;
  }

  private commitSchoolCatch(): void {
    const { state } = this.context;
    const schoolId = this.pendingLandSchoolId;
    this.pendingLandSchoolId = null;
    if (!schoolId) return;
    const school = state.world.activeSchools[schoolId];
    if (!school) return;
    school.remainingCatchPotential -= 1;
    if (school.remainingCatchPotential <= 0) delete state.world.activeSchools[schoolId];
  }

  private rollQuality(rareChanceMultiplier: number): FishQuality {
    const roll = this.context.rng.nextFloat();
    const effectiveRoll = roll * Math.max(0, Math.min(1, rareChanceMultiplier));
    if (effectiveRoll > 0.92) return "trophy";
    if (effectiveRoll > 0.75) return "exceptional";
    if (effectiveRoll > 0.45) return "fine";
    return "common";
  }

  private tickBasicFishing(realDeltaSeconds: number): void {
    const { state, events, rng } = this.context;
    const attempt = state.basicFishing;
    if (!attempt || realDeltaSeconds <= 0) return;

    if (attempt.phase === "charging-cast") {
      BasicFishingMinigame.tickCastCharging(attempt, realDeltaSeconds);
      return;
    }

    if (
      attempt.phase === "waiting-bite" ||
      (attempt.phase as string) === "casting" ||
      (attempt.phase as string) === "waiting"
    ) {
      attempt.remainingSeconds -= realDeltaSeconds;
      if (attempt.remainingSeconds <= 0) {
        const leftover = -attempt.remainingSeconds;
        attempt.phase = "bite-reaction";
        attempt.remainingSeconds = (attempt.biteReactionWindowSeconds ?? 1.4) - leftover;
        events.emit("BasicFishingBiteAlert", {
          habitatId: attempt.habitatId,
          speciesId: (attempt.catchItemId || "fish.perch") as FishSpeciesId,
          minute: state.clock.currentMinute
        });
        if (attempt.remainingSeconds <= 0) {
          this.resolveMissedBite(attempt);
        }
      }
      return;
    }

    if (attempt.phase === "bite-reaction" || (attempt.phase as string) === "bite") {
      attempt.remainingSeconds -= realDeltaSeconds;
      if (attempt.remainingSeconds <= 0) {
        // AFK never auto-lands, even when willCatch rolled true.
        this.resolveMissedBite(attempt);
      }
      return;
    }

    if (attempt.phase === "minigame") {
      const outcome = BasicFishingMinigame.tick(attempt, realDeltaSeconds, rng);
      if (outcome === "landed") {
        this.resolveCatchSuccess(attempt);
      } else if (outcome === "escaped") {
        state.basicFishing = null;
        events.emit("BasicFishingResolved", {
          habitatId: attempt.habitatId,
          reason: "escaped",
          minute: state.clock.currentMinute
        });
      }
    }
  }

  private resolveMissedBite(attempt: BasicFishingState): void {
    const { state, events } = this.context;
    state.basicFishing = null;
    events.emit("BasicFishingResolved", {
      habitatId: attempt.habitatId,
      reason: "missed",
      minute: state.clock.currentMinute
    });
  }

  private resolveCatchSuccess(attempt: BasicFishingState): void {
    const { state, events, rng } = this.context;
    state.basicFishing = null;
    const inventory = state.inventories[state.player.inventoryId];
    if (!attempt.catchItemId) {
      events.emit("BasicFishingResolved", {
        habitatId: attempt.habitatId,
        reason: "missed",
        minute: state.clock.currentMinute
      });
      return;
    }

    const catchStack = [{ itemId: attempt.catchItemId, quantity: 1 }];
    if (!InventoryManager.canAddItems(inventory, catchStack)) {
      events.emit("BasicFishingResolved", {
        habitatId: attempt.habitatId,
        reason: "inventory-full",
        minute: state.clock.currentMinute
      });
      return;
    }

    InventoryManager.addItemsAtomically(inventory, catchStack);

    let treasureLootItemIds: string[] | undefined;
    if (attempt.treasureCaught) {
      const rolled = BasicFishingMinigame.generateTreasureLoot(attempt.habitatId, rng);
      const granted: string[] = [];
      for (const itemId of rolled) {
        if (!ContentRegistry.items.has(itemId)) continue;
        const stack = [{ itemId, quantity: 1 }];
        if (InventoryManager.addItemsAtomically(inventory, stack)) {
          granted.push(itemId);
        }
      }
      if (granted.length > 0) {
        treasureLootItemIds = granted;
        events.emit("BasicFishingTreasureCaught", {
          lootItemIds: granted,
          minute: state.clock.currentMinute
        });
      }
    }

    const xpGained = attempt.isPerfect ? 50 : 25;
    this.progression.addProficiencyXp("fishing", xpGained);

    events.emit("BasicFishingResolved", {
      habitatId: attempt.habitatId,
      catchItemId: attempt.catchItemId,
      quality: attempt.quality || "normal",
      isPerfect: attempt.isPerfect,
      hasTreasure: attempt.hasTreasure,
      treasureLootItemIds,
      minute: state.clock.currentMinute
    });
  }
}
