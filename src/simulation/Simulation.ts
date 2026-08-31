// src/simulation/Simulation.ts

import { ContentRegistry } from "../content/ContentRegistry";
import { EventBus } from "./core/EventBus";
import { GameClock, minutesUntilNextMorning } from "./core/GameClock";
import { SeededRng } from "./core/Rng";
import {
  FarmId,
  BoatId,
  FishCargoId,
  FishCargoState,
  CropQuality,
  FishSchoolId,
  FishSpeciesId,
  FishingEncounterState,
  GameState,
  ItemId,
  MarketId,
  CropStage,
  PlacedCropId,
  ProcessingJobId,
  RecipeId,
  SkillId,
  MountId,
  RodId
} from "./core/types";
import { createInitialGameState } from "./core/createInitialState";
import { applyWeatherProfile } from "./weather/updateWeather";
import { forEachWeatherBoundedSegment } from "./farming/weatherBoundedSegments";
import type { ResolvedPhysicsFrame } from "./core/PhysicsAdapter";
import type { DomainContext } from "./domains/DomainContext";
import { deterministicCropRotation, FarmingDomain } from "./domains/FarmingDomain";
import { ProcessingDomain } from "./domains/ProcessingDomain";
import { ProgressionDomain } from "./domains/ProgressionDomain";
import { NavigationDomain } from "./domains/NavigationDomain";
import { CargoDomain } from "./domains/CargoDomain";
import { FishingDomain } from "./domains/FishingDomain";
import { MarketDomain } from "./domains/MarketDomain";
import { ContractDomain } from "./domains/ContractDomain";
import { QuestDomain } from "./domains/QuestDomain";
import { InventoryManager } from "./inventory/InventoryManager";
import { WorldLayout } from "../world/WorldLayout";
import { HARBOR_DOCK } from "../world/WorldAnchors";
import { STARTER_DONKEY_ID } from "./mounts/Mounts";
import type {
  CropInspectionDto,
  CropPlacementResult,
  GameCommand,
  GameQuery,
  GameQueryResult,
  InteractionResult,
  ProcessingJobInspectionDto,
  WorkCostQuote
} from "./core/contracts";

export class Simulation {
  public state: GameState;
  public rng: SeededRng;
  public clock: GameClock;
  public events: EventBus;
  private readonly domainContext: DomainContext;
  private readonly progressionDomain: ProgressionDomain;
  private readonly farmingDomain: FarmingDomain;
  private readonly processingDomain: ProcessingDomain;
  private readonly navigationDomain: NavigationDomain;
  private readonly cargoDomain: CargoDomain;
  private readonly fishingDomain: FishingDomain;
  private readonly marketDomain: MarketDomain;
  private readonly contractDomain: ContractDomain;
  public readonly questDomain: QuestDomain;

  constructor(initialState?: GameState) {
    ContentRegistry.initializeAndValidate();
    this.state = initialState || createInitialGameState();
    this.rng = new SeededRng(this.state.worldSeed + this.state.clock.currentMinute, this.state.metadata.rngState);
    this.clock = new GameClock(this.state.clock);
    // Overlay/UI pause is runtime-only. Loading a save must never freeze the world.
    this.clock.setPaused(false);
    this.state.clock = { ...this.clock.getState() };
    this.events = new EventBus();
    this.domainContext = {
      state: this.state,
      rng: this.rng,
      events: this.events,
      nextEntityId: (prefix) => this.nextEntityId(prefix),
      persistRng: () => this.persistRng()
    };
    this.progressionDomain = new ProgressionDomain(this.domainContext);
    this.farmingDomain = new FarmingDomain(this.domainContext, this.progressionDomain);
    this.processingDomain = new ProcessingDomain(this.domainContext, this.progressionDomain);
    this.navigationDomain = new NavigationDomain(this.domainContext);
    this.cargoDomain = new CargoDomain(this.domainContext, this.navigationDomain, this.progressionDomain);
    this.fishingDomain = new FishingDomain(this.domainContext, this.cargoDomain, this.progressionDomain);
    this.marketDomain = new MarketDomain(
      this.domainContext,
      this.navigationDomain,
      this.cargoDomain,
      this.progressionDomain
    );
    this.contractDomain = new ContractDomain(
      this.domainContext,
      this.marketDomain,
      this.navigationDomain,
      this.cargoDomain,
      this.progressionDomain
    );
    this.questDomain = new QuestDomain(this.domainContext, this.progressionDomain);
    this.persistRng();
  }


  public get activeFishingEncounter() {
    return this.fishingDomain.activeEncounter;
  }

  public getState(): Readonly<GameState> {
    this.persistRng();
    return this.state;
  }

  public execute(command: GameCommand): InteractionResult {
    switch (command.type) {
      case "physics.commit":
        return this.commitPhysicsFrame(command.frame);
      case "player.face-target":
        return this.navigationDomain.facePlayerTarget(command.x, command.z);
      case "player.reset-safe":
        return this.resetPlayerToSafeSpawn();
      case "boat.board":
        return this.boardBoat(command.boatId);
      case "boat.dock":
        return this.dockActiveBoat();
      case "mount.board":
        return this.boardMount(command.mountId);
      case "mount.dismount":
        return this.dismountMount();
      case "boat.purchase-skiff":
        return this.purchaseSkiff();
      case "crop.plant":
        return this.farmingDomain.plant(command.request);
      case "crop.plant-near":
        return this.plantCropNearPlayer(command.farmId, command.cropId);
      case "crop.water":
        return this.waterCrop(command.placedCropId);
      case "crop.harvest":
        return this.harvestCrop(command.placedCropId);
      case "farm.apply-fertilizer":
        return this.applyFertilizer(command.farmId);
      case "farm.irrigate":
        return this.farmingDomain.irrigate(command.farmId);
      case "farm.buy-irrigation":
        return this.farmingDomain.buyIrrigation();
      case "player.rest-until-dawn":
        return this.restUntilDawn();
      case "processing.start":
        return this.startProcessingJob(command.recipeId, command.stationId);
      case "processing.collect":
        return this.collectProcessingJob(command.jobId);
      case "fishing.cast-basic":
        return this.castBasicFishing(command.castPower);
      case "fishing.start-charge-basic":
        return this.startChargingBasicFishing();
      case "fishing.release-cast-basic":
        return this.releaseCastBasicFishing(command.castPower);
      case "fishing.hook-bite-basic":
        return this.hookBiteBasicFishing();
      case "fishing.control-basic":
        this.setBasicFishingInput(command.isHolding);
        return { success: true };
      case "fishing.cancel-basic":
        return this.cancelBasicFishing();
      case "fishing.chum-school":
        return this.chumFishSchool(command.schoolId);
      case "fishing.hook-school":
        return this.hookSportFish(command.schoolId);
      case "fishing.control":
        return this.setSportFishingInput(command.input)
          ? { success: true }
          : { success: false, reason: "No active fishing encounter" };
      case "cargo.discard":
        return this.discardFishCargo(command.cargoId);
      case "market.sell-item":
        return this.sellItemAtMarket(command.marketId, command.itemId, command.quantity);
      case "market.buy-seed":
        return this.buySeedAtMarket(command.marketId, command.itemId, command.quantity);
      case "market.buy-item":
        return this.buyItemAtMarket(command.marketId, command.itemId, command.quantity);
      case "market.buy-rod":
        return this.buyRodAtMarket(command.marketId, command.rodId);
      case "market.equip-rod":
        return this.equipRodAtMarket(command.marketId, command.rodId);
      case "market.sell-fish":
        return this.sellFishCargoAtMarket(command.marketId, command.cargoId);
      case "contract.deliver-items":
        return this.deliverItemsToContract(command.contractId, command.itemId, command.quantity);
      case "contract.deliver-fish":
        return this.deliverFishCargoToContract(command.contractId, command.cargoId);
      case "quest.talk-npc":
        return this.questDomain.talkToNpc(command.npcId);
      case "quest.claim-reward":
        return this.questDomain.completeQuest(command.questId, command.npcId);
      case "quest.record-hint":
        this.questDomain.recordHintShown(command.hintId);
        return { success: true };
    }
  }

  public query(query: GameQuery): GameQueryResult {
    switch (query.type) {
      case "market.nearby":
        return this.getNearbyMarketId();
      case "boat.can-board":
        return this.canBoardBoat(query.boatId);
      case "boat.can-dock":
        return this.canDockActiveBoat();
      case "crop.validate-placement":
        return this.farmingDomain.validatePlacement(query.request);
      case "crop.inspect":
        return this.farmingDomain.inspect(query.placedCropId);
      case "processing.inspect":
        return this.processingDomain.inspect(query.stationId);
      case "crop.find-placement":
        return this.findPlantingPosition(query.farmId, query.cropId);
      case "quest.get-active":
        return this.questDomain.getActiveQuestDto();
      case "npc.get-nearby":
        return this.getNearbyNpcId();
    }
  }

  public getNearbyMarketId(): MarketId | null {
    return this.marketDomain.getNearbyMarketId();
  }

  public getNearbyNpcId(): string | null {
    const { player } = this.state;
    for (const [npcId, npc] of ContentRegistry.npcs.entries()) {
      const dx = player.x - npc.anchor.x;
      const dz = player.z - npc.anchor.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= 3.5) {
        return npcId;
      }
    }
    return null;
  }


  // ==========================================
  // SIMULATION TICK
  // ==========================================
  public tick(realDeltaSeconds: number): void {
    if (this.clock.isPaused()) {
      this.state.clock = { ...this.clock.getState() };
      return;
    }

    const minutesAdvanced = this.clock.tick(realDeltaSeconds);
    this.state.clock = { ...this.clock.getState() };
    this.fishingDomain.tick(realDeltaSeconds);
    this.fishingDomain.tickSchools();

    if (minutesAdvanced <= 0) {
      this.persistRng();
      return;
    }

    this.applyElapsedGameMinutes(minutesAdvanced);
  }

  public advanceGameMinutes(minutes: number): void {
    if (!Number.isSafeInteger(minutes) || minutes <= 0) return;
    this.clock.advanceMinutes(minutes);
    this.state.clock = { ...this.clock.getState() };
    this.applyElapsedGameMinutes(minutes);
  }

  private restUntilDawn(): InteractionResult {
    const { player, clock } = this.state;
    if (player.activeMountId) return { success: false, reason: "Dismount before resting" };
    if (!WorldLayout.isInterior(player.x, player.z)) {
      return { success: false, reason: "Rest in the farmhouse" };
    }
    if (clock.timeOfDay !== "dusk" && clock.timeOfDay !== "night") {
      return { success: false, reason: "It's too early to turn in" };
    }
    const minutes = minutesUntilNextMorning(clock.currentMinute);
    this.advanceGameMinutes(minutes);
    return { success: true };
  }

  private applyElapsedGameMinutes(minutesAdvanced: number): void {
    const startMinute = this.state.clock.currentMinute - minutesAdvanced;
    const weatherBefore = this.state.weather.type;
    forEachWeatherBoundedSegment(
      this.state.weather,
      startMinute,
      minutesAdvanced,
      this.rng,
      (segmentMinutes, segmentStartMinute) => {
        this.farmingDomain.tick(segmentMinutes);
        this.cargoDomain.tick(segmentMinutes, segmentStartMinute);
      }
    );
    if (this.state.weather.type !== weatherBefore) {
      this.events.emit("WeatherChanged", {
        weather: this.state.weather.type,
        minute: this.state.clock.currentMinute
      });
    }

    this.processingDomain.tick();
    this.contractDomain.tick();
    this.marketDomain.tick();
    this.navigationDomain.tickFuel(minutesAdvanced);
    this.fishingDomain.tickSchools();
    this.progressionDomain.tickWorkCapacity(minutesAdvanced);

    this.persistRng();
  }

  /** Development-only state setup still goes through the simulation boundary. */
  public grantDebugMoney(amount: number): void {
    if (!Number.isSafeInteger(amount) || amount <= 0) return;
    this.state.player.money += amount;
  }

  /** Development-only relocate for in-game layout editing. Not a schema migration. */
  public debugRelocateStructure(
    id: string,
    x: number,
    z: number,
    rotationY?: number
  ): boolean {
    const structure = this.state.world.structures[id];
    if (!structure) return false;
    this.state.world.structures[id] = {
      ...structure,
      x,
      y: WorldLayout.terrainHeight(x, z),
      z,
      rotationY: rotationY ?? structure.rotationY
    };
    return true;
  }

  /** Development-only weather override that keeps the complete profile coherent. */
  public setDebugWeather(type: GameState["weather"]["type"]): void {
    const previous = this.state.weather.type;
    applyWeatherProfile(this.state.weather, type, this.state.clock.season);
    if (this.state.weather.type !== previous) {
      this.events.emit("WeatherChanged", {
        weather: this.state.weather.type,
        minute: this.state.clock.currentMinute
      });
    }
  }

  public setDebugMinute(currentMinute: number): boolean {
    if (!this.clock.setDebugMinute(currentMinute)) return false;
    this.state.clock = { ...this.clock.getState() };
    return true;
  }

  /** Development-only camera-review setup routed through the simulation owner. */
  public setDebugPlayerPose(pose: { x: number; y: number; z: number; rotationY: number }): boolean {
    return this.navigationDomain.setDebugPlayerPose(pose);
  }

  public setDebugBoatDriving(
    boatId: BoatId,
    pose: { x: number; z: number; headingRadians: number }
  ): boolean {
    return this.navigationDomain.setDebugBoatDriving(boatId, pose);
  }

  /**
   * Development-only, unsaved Wheat review fixture. It uses canonical crop
   * state so the gameplay renderer, camera and render diagnostics see the same
   * data shape as a played farm without consuming seeds or advancing RNG.
   */
  public prepareDebugWheatArtReview(): void {
    const farmId = "farm.starter_garden";
    const farm = this.state.farms[farmId];
    const definition = ContentRegistry.crops.get("crop.wheat");
    if (!farm || !definition) return;

    const stageRows: ReadonlyArray<{ stage: CropStage; progress: number }> = [
      { stage: "seeded", progress: 0.05 },
      { stage: "sprout", progress: 0.22 },
      { stage: "growing", progress: 0.68 },
      { stage: "mature", progress: 1.14 },
      { stage: "overripe", progress: 1.44 },
      { stage: "withered", progress: 1.72 }
    ];
    const xPositions = [-2.4, -0.8, 0.8, 2.4] as const;
    const zPositions = [-3.2, -1.92, -0.64, 0.64, 1.92, 3.2] as const;
    const reviewIds: string[] = [];

    for (const placedCropId of farm.placedCropIds) delete this.state.crops[placedCropId];
    farm.placedCropIds = [];

    for (const [row, { stage, progress }] of stageRows.entries()) {
      for (const [column, x] of xPositions.entries()) {
        const z = zPositions[row]!;
        const id = `debug_wheat_${stage}_${column}`;
        const moisture = column === 0 ? 28 : column === 3 ? 92 : 66;
        this.state.crops[id] = {
          id,
          cropId: definition.id,
          farmId,
          x,
          z,
          rotationRadians: deterministicCropRotation(
            this.state.worldSeed,
            farmId,
            definition.id,
            x,
            z
          ),
          plantedAtMinute: this.state.clock.currentMinute,
          lastUpdatedMinute: this.state.clock.currentMinute,
          effectiveGrowthMinutes: definition.baseGrowthMinutes * progress,
          moisture,
          health: stage === "withered" ? 0 : 100,
          stage,
          averageMoistureAccum: moisture,
          moistureSampleCount: 1
        };
        reviewIds.push(id);
      }
    }

    farm.placedCropIds = reviewIds;
  }

  /** Development-only, unsaved review fixture for the approved starter trio language. */
  public prepareDebugStarterTrioArtReview(): void {
    const farmId = "farm.starter_garden";
    const farm = this.state.farms[farmId];
    if (!farm) return;
    const stageRows: ReadonlyArray<{ stage: CropStage; progress: number }> = [
      { stage: "seeded", progress: 0.05 },
      { stage: "sprout", progress: 0.22 },
      { stage: "growing", progress: 0.68 },
      { stage: "mature", progress: 1.14 },
      { stage: "overripe", progress: 1.44 },
      { stage: "withered", progress: 1.72 }
    ];
    const columns = [
      { cropId: "crop.wheat", x: -3.25 },
      { cropId: "crop.wheat", x: -2.0 },
      { cropId: "crop.tomato", x: -0.65 },
      { cropId: "crop.tomato", x: 0.65 },
      { cropId: "crop.potato", x: 2.0 },
      { cropId: "crop.potato", x: 3.25 }
    ] as const;
    const zPositions = [-3.3, -2.0, -0.68, 0.68, 2.0, 3.3] as const;
    const reviewIds: string[] = [];

    for (const placedCropId of farm.placedCropIds) delete this.state.crops[placedCropId];
    farm.placedCropIds = [];

    for (const [row, { stage, progress }] of stageRows.entries()) {
      for (const [column, placement] of columns.entries()) {
        const definition = ContentRegistry.crops.get(placement.cropId);
        if (!definition) continue;
        const z = zPositions[row]!;
        const id = `debug_${definition.id.replace("crop.", "")}_${stage}_${column}`;
        const moisture = column % 3 === 0 ? 28 : column % 3 === 2 ? 92 : 66;
        this.state.crops[id] = {
          id,
          cropId: definition.id,
          farmId,
          x: placement.x,
          z,
          rotationRadians: deterministicCropRotation(
            this.state.worldSeed,
            farmId,
            definition.id,
            placement.x,
            z
          ),
          plantedAtMinute: this.state.clock.currentMinute,
          lastUpdatedMinute: this.state.clock.currentMinute,
          effectiveGrowthMinutes: definition.baseGrowthMinutes * progress,
          moisture,
          health: stage === "withered" ? 0 : 100,
          stage,
          averageMoistureAccum: moisture,
          moistureSampleCount: 1
        };
        reviewIds.push(id);
      }
    }
    farm.placedCropIds = reviewIds;
  }

  /**
   * Development-only fixture for the repeatable locomotion acceptance pass.
   * The target is canonical crop state placed within interaction range of the
   * starter spawn, so the recording can end in a real target-facing harvest
   * without depending on pointer raycasts or changing persistent state.
   */
  public prepareDebugMotionCaptureCrop(): void {
    const farmId = "farm.starter_garden";
    const farm = this.state.farms[farmId];
    const definition = ContentRegistry.crops.get("crop.wheat");
    if (!farm || !definition) return;

    for (const placedCropId of farm.placedCropIds) delete this.state.crops[placedCropId];

    const x = 0;
    const z = -3.5;
    const id = "debug_motion_capture_wheat";
    this.state.crops[id] = {
      id,
      cropId: definition.id,
      farmId,
      x,
      z,
      rotationRadians: deterministicCropRotation(this.state.worldSeed, farmId, definition.id, x, z),
      plantedAtMinute: this.state.clock.currentMinute,
      lastUpdatedMinute: this.state.clock.currentMinute,
      effectiveGrowthMinutes: definition.baseGrowthMinutes * 1.14,
      moisture: 66,
      health: 100,
      stage: "mature",
      averageMoistureAccum: 66,
      moistureSampleCount: 1
    };
    farm.placedCropIds = [id];
  }

  public startDebugSportFishing(
    habitatId: string,
    x: number,
    z: number,
    speciesId: FishSpeciesId = "fish.trout"
  ): boolean {
    if (WorldLayout.fishingHabitatAt(x, z) !== habitatId) return false;
    // The debug fixture is an authored camera start, so place the player at
    // the same valid review point before the school events are committed.
    this.setDebugPlayerPose({
      x,
      y: WorldLayout.isWater(x, z) ? 0.5 : WorldLayout.traversalSurfaceHeight(x, z) + 0.5,
      z,
      rotationY: 0
    });
    if (speciesId === "fish.tuna") {
      this.state.player.equippedRodId = "rod.heavy_sport";
      this.state.player.ownedRodIds = ["rod.willow", "rod.river", "rod.heavy_sport"];
    }
    const inventory = this.state.inventories[this.state.player.inventoryId];
    if (!InventoryManager.addItemsAtomically(inventory, [{ itemId: "item.chum_bucket", quantity: 1 }])) {
      return false;
    }
    const schoolId = this.spawnFishSchool(habitatId, x, z, [speciesId]);
    if (!this.chumFishSchool(schoolId).success) return false;
    return this.hookSportFish(schoolId).success;
  }

  /**
   * Atomically commits a fixed-step physics result. Rapier resolves motion,
   * while the simulation remains the only owner allowed to mutate GameState.
   */
  public commitPhysicsFrame(frame: ResolvedPhysicsFrame): { success: boolean; reason?: string } {
    return this.navigationDomain.commitPhysicsFrame(frame);
  }

  public setSportFishingInput(input: {
    isReeling: boolean;
    isSlacking: boolean;
    isBracing: boolean;
    rodDirectionAngle: number;
  }): boolean {
    return this.fishingDomain.setInput(input);
  }

  // ==========================================
  // PLAYER & BOAT ACTIONS
  // ==========================================
  public refreshPlayerRegion(): void {
    this.navigationDomain.refreshPlayerRegion();
  }

  public resetPlayerToSafeSpawn(): InteractionResult {
    const result = this.navigationDomain.resetToSafeSpawn();
    if (result.success) this.fishingDomain.cancelAll();
    return result;
  }

  public canBoardBoat(boatId: BoatId): boolean {
    return this.navigationDomain.canBoardBoat(boatId);
  }

  public boardBoat(boatId: BoatId): { success: boolean; reason?: string } {
    return this.navigationDomain.boardBoat(boatId);
  }

  public canBoardMount(mountId: MountId = STARTER_DONKEY_ID): boolean {
    return this.navigationDomain.canBoardMount(mountId);
  }

  public boardMount(mountId: MountId = STARTER_DONKEY_ID): { success: boolean; reason?: string } {
    return this.navigationDomain.boardMount(mountId);
  }

  public canDismountMount(): boolean {
    return this.navigationDomain.canDismountMount();
  }

  public dismountMount(): { success: boolean; reason?: string } {
    return this.navigationDomain.dismountMount();
  }

  public canDockActiveBoat(): boolean {
    return this.navigationDomain.canDockActiveBoat();
  }

  public dockActiveBoat(): { success: boolean; reason?: string } {
    return this.navigationDomain.dockActiveBoat();
  }

  public purchaseSkiff(): { success: boolean; reason?: string; cost?: number } {
    return this.navigationDomain.purchaseSkiff();
  }

  /** Development-only, unsaved review fixture for the owned coastal skiff. */
  public prepareDebugSkiffReview(): boolean {
    this.state.player.proficiencies.fishing = Math.max(this.state.player.proficiencies.fishing, 15000);
    this.state.player.money = Math.max(this.state.player.money, 1200);
    this.setDebugPlayerPose({
      x: 86,
      y: WorldLayout.traversalSurfaceHeight(86, 69) + 0.5,
      z: 69,
      rotationY: 0
    });
    return this.purchaseSkiff().success;
  }

  /** Development-only fixture for exercising the authored board/dock flow. */
  public prepareDebugHarborBoarding(): void {
    if (!this.state.quests.unlockedFeatureIds.includes("boat.player_rowboat")) {
      this.state.quests.unlockedFeatureIds.push("boat.player_rowboat");
    }
    const boat = this.state.boats["boat.player_rowboat"];
    Object.assign(boat, {
      ...HARBOR_DOCK.boatPosition,
      headingRadians: 0,
      speed: 0,
      isDocked: true,
      dockedMarketId: HARBOR_DOCK.marketId
    });
    this.setDebugPlayerPose({
      x: HARBOR_DOCK.playerPosition.x,
      y: WorldLayout.traversalSurfaceHeight(
        HARBOR_DOCK.playerPosition.x,
        HARBOR_DOCK.playerPosition.z
      ) + 0.5,
      z: HARBOR_DOCK.playerPosition.z,
      rotationY: 0
    });
  }

  public canAccessFishCargo(cargo: FishCargoState, marketId?: MarketId): boolean {
    return this.navigationDomain.canAccessFishCargo(cargo, marketId);
  }

  // ==========================================
  // FARMING ACTIONS
  // ==========================================
  public validateCropPlacement(
    farmId: FarmId,
    cropId: string,
    x: number,
    z: number
  ): CropPlacementResult {
    return this.farmingDomain.validatePlacement({ farmId, cropId, x, z });
  }

  public findPlantingPosition(
    farmId: FarmId,
    cropId: string
  ): { success: boolean; x?: number; z?: number; reason?: string } {
    return this.farmingDomain.findPlantingPosition(farmId, cropId);
  }

  public get progression(): ProgressionDomain {
    return this.progressionDomain;
  }

  public plantCropNearPlayer(farmId: FarmId, cropId: string): { success: boolean; placedCropId?: PlacedCropId; reason?: string; reasonCode?: string } {
    return this.farmingDomain.plantNearPlayer(farmId, cropId);
  }

  public plantCrop(farmId: FarmId, cropId: string, x: number, z: number): { success: boolean; placedCropId?: PlacedCropId; reason?: string; reasonCode?: string } {
    return this.farmingDomain.plant({ farmId, cropId, x, z });
  }

  public waterCrop(placedCropId: PlacedCropId): InteractionResult {
    return this.farmingDomain.water(placedCropId);
  }

  public harvestCrop(placedCropId: PlacedCropId): InteractionResult & { quality?: CropQuality } {
    return this.farmingDomain.harvest(placedCropId);
  }

  public applyFertilizer(farmId: FarmId): InteractionResult {
    return this.farmingDomain.applyFertilizer(farmId);
  }

  public getNearbyFarmId(): FarmId | null {
    return this.farmingDomain.getNearbyFarmId();
  }

  public getNearbyIrrigationFarmId(): FarmId | null {
    return this.farmingDomain.getNearbyIrrigationFarmId();
  }

  public inspectCrop(placedCropId: PlacedCropId): CropInspectionDto | null {
    return this.farmingDomain.inspect(placedCropId);
  }

  public inspectProcessingJob(stationId: string): ProcessingJobInspectionDto | null {
    return this.processingDomain.inspect(stationId);
  }

  // ==========================================
  // PROCESSING ACTIONS
  // ==========================================
  public startProcessingJob(recipeId: RecipeId, stationId: string): { success: boolean; reason?: string; reasonCode?: string } {
    return this.processingDomain.start(recipeId, stationId);
  }

  public collectProcessingJob(jobId: ProcessingJobId): { success: boolean; reason?: string } {
    return this.processingDomain.collect(jobId);
  }

  // ==========================================
  // FISHING & ENCOUNTERS
  // ==========================================
  public castBasicFishing(castPower?: number): { success: boolean; reason?: string; reasonCode?: string } {
    return this.fishingDomain.castBasic(castPower);
  }

  public startChargingBasicFishing(): { success: boolean; reason?: string; reasonCode?: string } {
    return this.fishingDomain.startChargingCastBasic();
  }

  public releaseCastBasicFishing(castPower?: number): { success: boolean; reason?: string; reasonCode?: string } {
    return this.fishingDomain.releaseCastBasic(castPower);
  }

  public hookBiteBasicFishing(): { success: boolean; reason?: string } {
    return this.fishingDomain.hookBiteBasic();
  }

  public setBasicFishingInput(isHolding: boolean): void {
    this.fishingDomain.setBasicFishingInput(isHolding);
  }

  public cancelBasicFishing(): { success: boolean; reason?: string } {
    return this.fishingDomain.cancelBasicFishing();
  }

  public spawnFishSchool(habitatId: string, x: number, z: number, speciesIds: FishSpeciesId[]): FishSchoolId {
    return this.fishingDomain.spawnSchool(habitatId, x, z, speciesIds);
  }

  public chumFishSchool(schoolId: FishSchoolId): { success: boolean; reason?: string } {
    return this.fishingDomain.chumSchool(schoolId);
  }

  public hookSportFish(schoolId: FishSchoolId): { success: boolean; encounter?: FishingEncounterState; reason?: string; reasonCode?: string } {
    return this.fishingDomain.hookSportFish(schoolId);
  }

  public discardFishCargo(cargoId: FishCargoId): { success: boolean; scraps?: number; reason?: string } {
    return this.cargoDomain.discard(cargoId);
  }

  // ==========================================
  // CONTRACT DELIVERY
  // ==========================================
  public deliverItemsToContract(
    contractId: string,
    itemId: ItemId,
    quantity: number
  ): { success: boolean; delivered?: number; completed?: boolean; rewardMoney?: number; reason?: string } {
    return this.contractDomain.deliverItems(contractId, itemId, quantity);
  }

  public deliverFishCargoToContract(
    contractId: string,
    cargoId: FishCargoId
  ): { success: boolean; delivered?: number; completed?: boolean; rewardMoney?: number; reason?: string } {
    return this.contractDomain.deliverFish(contractId, cargoId);
  }

  // ==========================================
  // ECONOMY & MARKET ACTIONS
  // ==========================================
  public sellItemAtMarket(marketId: MarketId, itemId: ItemId, quantity: number): { success: boolean; revenue?: number; reason?: string } {
    return this.marketDomain.sellItem(marketId, itemId, quantity);
  }

  public buySeedAtMarket(marketId: MarketId, itemId: ItemId, quantity: number): InteractionResult {
    return this.marketDomain.buySeed(marketId, itemId, quantity);
  }

  public buyItemAtMarket(marketId: MarketId, itemId: ItemId, quantity: number): { success: boolean; cost?: number; reason?: string } {
    return this.marketDomain.buyItem(marketId, itemId, quantity);
  }

  public buyRodAtMarket(marketId: MarketId, rodId: RodId): InteractionResult {
    return this.marketDomain.buyRod(marketId, rodId);
  }

  public equipRodAtMarket(marketId: MarketId, rodId: RodId): InteractionResult {
    return this.marketDomain.equipRod(marketId, rodId);
  }

  public sellFishCargoAtMarket(marketId: MarketId, cargoId: FishCargoId): { success: boolean; revenue?: number; reason?: string } {
    return this.marketDomain.sellFish(marketId, cargoId);
  }

  // ==========================================
  // PROFICIENCY & PROGRESSION
  // ==========================================
  public addProficiencyXp(skill: SkillId, xpAmount: number): void {
    this.progressionDomain.addProficiencyXp(skill, xpAmount);
  }

  public quoteWorkCost(baseCost: number, skill: SkillId): WorkCostQuote {
    return this.progressionDomain.quoteWorkCost(baseCost, skill);
  }

  // ==========================================
  // PRIVATE INTERNAL TICK HELPERS
  // ==========================================
  private persistRng(): void {
    this.state.metadata.rngState = this.rng.getState();
  }

  private nextEntityId(prefix: string): string {
    const a = this.rng.intInclusive(1, 0x7fffffff).toString(36);
    const b = this.rng.intInclusive(0, 0xffff).toString(36);
    return `${prefix}_${a}_${b}`;
  }

}
