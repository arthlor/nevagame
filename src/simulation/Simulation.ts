import { buildNewDiscoveries } from "./presentation/DiscoveryPresentation";
import { npcAnchorAt, NPC_TALK_RADIUS } from "./presentation/NpcPresentation";
// src/simulation/Simulation.ts

import { ContentRegistry } from "../content/ContentRegistry";
import { EventBus } from "./core/EventBus";
import { GameClock, minutesUntilNextMorning, seasonAtMinute } from "./core/GameClock";
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
  WorkActionId,
  MountId,
  RodId
} from "./core/types";
import { createInitialGameState } from "./core/createInitialState";
import { applyWeatherProfile, forecastWeatherAt } from "./weather/updateWeather";
import { forEachWeatherBoundedSegment } from "./farming/weatherBoundedSegments";
import type { ResolvedPhysicsFrame } from "./core/PhysicsAdapter";
import type { DomainContext } from "./domains/DomainContext";
import { deterministicCropRotation, FarmingDomain } from "./domains/FarmingDomain";
import { ProcessingDomain } from "./domains/ProcessingDomain";
import { LaborDomain } from "./domains/LaborDomain";
import { ProgressionDomain } from "./domains/ProgressionDomain";
import { EquipmentDomain } from "./domains/EquipmentDomain";
import { NavigationDomain } from "./domains/NavigationDomain";
import { CargoDomain } from "./domains/CargoDomain";
import { FishingDomain } from "./domains/FishingDomain";
import { MarketDomain } from "./domains/MarketDomain";
import { ContractDomain } from "./domains/ContractDomain";
import {
  QuestDomain,
  reconcileCompletedQuestKnowledge,
  reconcileInactiveQuestChain,
  reconcileQuestCursors
} from "./domains/QuestDomain";
import { buildWorldHudDto } from "./presentation/WorldHudPresentation";
import { freeHandsBlocker } from "./domains/domainRules";
import { buildItemInspectionDto, buildSatchelDto } from "./presentation/SatchelPresentation";
import { buildWorldMapDto } from "./presentation/WorldMapPresentation";
import { buildAlmanacDto, buildJournalPagesDto } from "./presentation/JournalPresentation";
import { buildPauseSummaryDto } from "./presentation/PausePresentation";
import type { ExpeditionBoardDto } from "./expeditions/buildExpeditionOpportunities";
import { InventoryManager } from "./inventory/InventoryManager";
import { WorldLayout } from "../world/WorldLayout";
import { HARBOR_DOCK } from "../world/WorldAnchors";
import { STARTER_DONKEY_ID } from "./mounts/Mounts";
import type {
  CropInspectionDto,
  CropPlacementResult,
  FarmForecastDto,
  GameCommand,
  GameQuery,
  GameQueryResult,
  InteractionResult,
  JournalPagesDto,
  AlmanacDto,
  HoldStoresDto,
  ProcessingJobInspectionDto,
  PauseSummaryDto,
  SeedBeltDto,
  SatchelDto,
  ItemInspectionDto,
  SkillProgressDto,
  WorldHudDto,
  WorldMapDto,
  WorkCostQuote
} from "./core/contracts";
import { SimulationActionTimeline } from "./actions/ActionTimeline";

export interface SimulationRuntimeOptions {
  /** Developer-only presentation slowdown. It never changes save data. */
  actionTimingScale?: number;
}

export class Simulation {
  private readonly blockedDiscoveryNotices = new Set<string>();
  public state: GameState;
  public rng: SeededRng;
  public clock: GameClock;
  public events: EventBus;
  /** Transient, canonical command clock. It is deliberately not serialized. */
  public readonly actionTimeline: SimulationActionTimeline;
  private readonly domainContext: DomainContext;
  private readonly progressionDomain: ProgressionDomain;
  private readonly farmingDomain: FarmingDomain;
  private readonly processingDomain: ProcessingDomain;
  private readonly equipmentDomain: EquipmentDomain;
  private readonly navigationDomain: NavigationDomain;
  private readonly cargoDomain: CargoDomain;
  private readonly fishingDomain: FishingDomain;
  private readonly marketDomain: MarketDomain;
  private readonly contractDomain: ContractDomain;
  public readonly questDomain: QuestDomain;
  private readonly laborDomain: LaborDomain;

  constructor(initialState?: GameState, options: SimulationRuntimeOptions = {}) {
    ContentRegistry.initializeAndValidate();
    this.state = initialState || createInitialGameState();
    this.rng = new SeededRng(this.state.worldSeed + this.state.clock.currentMinute, this.state.metadata.rngState);
    this.clock = new GameClock(this.state.clock);
    // Overlay/UI pause is runtime-only. Loading a save must never freeze the world.
    this.clock.setPaused(false);
    this.state.clock = { ...this.clock.getState() };
    reconcileInactiveQuestChain(this.state);
    // Also redeems early-action credits, so a save taken mid-tutorial resolves
    // its banked work on load rather than waiting for the next world event.
    reconcileQuestCursors(this.state);
    // Journal entries added to already-finished errands reach older saves too.
    reconcileCompletedQuestKnowledge(this.state);
    this.events = new EventBus();
    this.domainContext = {
      state: this.state,
      rng: this.rng,
      events: this.events,
      nextEntityId: (prefix) => this.nextEntityId(prefix),
      persistRng: () => this.persistRng(),
      isActionTimelineActive: () => this.actionTimeline?.isActive ?? false
    };
    this.progressionDomain = new ProgressionDomain(this.domainContext);
    this.equipmentDomain = new EquipmentDomain(this.domainContext);
    this.farmingDomain = new FarmingDomain(this.domainContext, this.progressionDomain);
    this.processingDomain = new ProcessingDomain(this.domainContext, this.progressionDomain, this.equipmentDomain);
    this.navigationDomain = new NavigationDomain(this.domainContext);
    this.cargoDomain = new CargoDomain(this.domainContext, this.navigationDomain, this.progressionDomain);
    this.fishingDomain = new FishingDomain(this.domainContext, this.cargoDomain, this.progressionDomain);
    this.marketDomain = new MarketDomain(
      this.domainContext,
      this.navigationDomain,
      this.cargoDomain,
      this.progressionDomain,
      this.equipmentDomain
    );
    this.contractDomain = new ContractDomain(
      this.domainContext,
      this.marketDomain,
      this.navigationDomain,
      this.cargoDomain,
      this.progressionDomain
    );
    this.questDomain = new QuestDomain(this.domainContext, this.progressionDomain);
    this.laborDomain = new LaborDomain(this.domainContext, this.progressionDomain);
    // A loaded save may already satisfy a side track's unlock predicate (for
    // example a veteran save from before the track shipped). Open it on load
    // instead of waiting for the next quest completion or level-up.
    this.questDomain.evaluateTrackUnlocks();
    this.actionTimeline = new SimulationActionTimeline(
      (command) => this.execute(command),
      options.actionTimingScale ?? 1
    );
    this.persistRng();
  }


  public get activeFishingEncounter() {
    return this.fishingDomain.activeEncounter;
  }

  public inspectFreeHands(): string | null {
    return freeHandsBlocker(this.state.player);
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
      case "inventory.sort-satchel":
        return this.sortSatchel();
      case "inventory.transfer":
        return this.transferBetweenSatchelAndHold(
          command.itemId,
          command.quantity,
          command.boatId,
          command.direction
        );
      case "boat.board":
        return this.boardBoat(command.boatId);
      case "boat.dock":
        return this.dockActiveBoat();
      case "boat.refuel":
        return this.navigationDomain.refuel(command.boatId);
      case "boat.emergency-tow":
        return this.navigationDomain.emergencyTow();
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
      case "item.consume":
        return this.consumeItem(command.itemId);
      case "labor.start":
        return this.laborDomain.start(command.stationId);
      case "labor.strike":
        return this.laborDomain.strike();
      case "labor.cancel":
        return this.laborDomain.cancel();
      case "processing.start":
        return this.startProcessingJob(command.recipeId, command.stationId);
      case "processing.collect":
        return this.collectProcessingJob(command.jobId);
      case "equipment.equip":
        return this.equipmentDomain.equip(command.equipmentId);
      case "equipment.equip-rod":
        return this.equipmentDomain.equipRod(command.rodId);
      case "equipment.save-preset":
        return this.equipmentDomain.savePreset(command.presetId);
      case "equipment.apply-preset":
        return this.equipmentDomain.applyPreset(command.presetId);
      case "fishing.cast-basic":
        return this.castBasicFishing(command.castPower);
      case "fishing.start-charge-basic":
        return this.startChargingBasicFishing();
      case "fishing.release-cast-basic":
        return this.releaseCastBasicFishing(command.castPower);
      case "fishing.hook-bite-basic":
        return this.hookBiteBasicFishing();
      case "fishing.control-basic":
        if (typeof command.isHolding !== "boolean") {
          return { success: false, reason: "Invalid fishing input" };
        }
        this.setBasicFishingInput(command.isHolding);
        return { success: true };
      case "fishing.cancel-basic":
        return this.cancelBasicFishing();
      case "fishing.discard-basic-catch":
        return this.fishingDomain.discardBasicCatch();
      case "fishing.commit-basic":
        return this.fishingDomain.commitBasicFishing();
      case "fishing.chum-school":
        return this.chumFishSchool(command.schoolId);
      case "fishing.hook-school":
        return this.hookSportFish(command.schoolId);
      case "fishing.toggle-lure":
        return this.fishingDomain.togglePreparedLure();
      case "fishing.set-drag":
        return this.fishingDomain.setDragNotch(command.notch);
      case "fishing.control":
        return this.setSportFishingInput(command.input)
          ? { success: true }
          : { success: false, reason: "No active fishing encounter" };
      case "cargo.discard":
        return this.discardFishCargo(command.cargoId, command.marketId);
      case "cargo.release":
        return this.releaseFishCargo(command.cargoId, command.marketId);
      case "cargo.pickup":
        return this.pickupFishCargo(command.cargoId);
      case "market.sell-item":
        return this.sellItemAtMarket(command.marketId, command.itemId, command.quantity);
      case "market.sell-produce-bulk":
        return this.marketDomain.sellBulkProduce(command.marketId);
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
      case "market.sell-trade-pack":
        return this.sellFishTradePackAtMarket(command.marketId, command.cargoId);
      case "market.sell-fish-bulk":
        return this.marketDomain.sellBulkFish(command.marketId);
      case "contract.deliver-items":
        return this.deliverItemsToContract(command.contractId, command.itemId, command.quantity);
      case "contract.deliver-fish":
        return this.deliverFishCargoToContract(command.contractId, command.cargoId);
      case "contract.pass":
        return this.contractDomain.passContract(command.contractId);
      case "quest.talk-npc":
        return this.questDomain.talkToNpc(command.npcId);
      case "quest.claim-reward":
        return this.questDomain.completeQuest(command.questId, command.npcId);
      case "quest.record-hint":
        this.questDomain.recordHintShown(command.hintId);
        return { success: true };
      case "quest.focus-track":
        return this.questDomain.focusTrack(command.trackId);
    }
  }

  public query(query: GameQuery): GameQueryResult {
    switch (query.type) {
      case "market.nearby":
        return this.getNearbyMarketId();
      case "world.get-hud":
        return this.inspectWorldHud(query.selectedCropId ?? null);
      case "expedition.get-board":
        return this.inspectExpeditionBoard();
      case "cargo.get-hold-stores":
        return this.inspectHoldStores();
      case "inventory.get-satchel":
        return this.inspectSatchel();
      case "inventory.inspect-item":
        return this.inspectItem(query.itemId);
      case "world.get-map":
        return this.inspectWorldMap();
      case "journal.get-pages":
        return this.inspectJournalPages();
      case "journal.get-almanac":
        return this.inspectAlmanac();
      case "world.get-pause":
        return this.inspectPauseSummary();
      case "weather.get-farm-forecast":
        return this.inspectFarmForecast();
      case "fishing.get-sport-hud":
        return this.inspectSportFishingHud();
      case "labor.get-hud":
        return this.laborDomain.inspectHud();
      case "labor.get-stations":
        return this.laborDomain.inspectStations();
      case "progression.get-skills":
        return this.inspectSkillProgress();
      case "market.demand-trend":
        return this.marketDomain.inspectDemandTrend(query.marketId, query.itemId, query.days);
      case "market.get-board":
        return this.marketDomain.inspectBoard(query.marketId);
      case "market.quote-sale":
        return this.marketDomain.inspectCommodity(query.marketId, query.itemId, "sell", query.quantity);
      case "market.quote-purchase":
        return this.marketDomain.inspectCommodity(query.marketId, query.itemId, "buy", query.quantity);
      case "boat.can-board":
        return this.canBoardBoat(query.boatId);
      case "boat.can-dock":
        return this.canDockActiveBoat();
      case "crop.validate-placement":
        return this.farmingDomain.validatePlacement(query.request);
      case "crop.inspect":
        return this.farmingDomain.inspect(query.placedCropId);
      case "crop.get-seed-belt":
        return this.inspectSeedBelt();
      case "processing.inspect":
        return this.processingDomain.inspect(query.stationId);
      case "processing.get-station":
        return this.processingDomain.inspectStation(query.stationId);
      case "equipment.get-character":
        return this.equipmentDomain.inspectCharacter();
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
    for (const npcId of ContentRegistry.npcs.keys()) {
      const anchor = npcAnchorAt(npcId, this.state.clock, this.state.quests);
      const dx = player.x - anchor.x;
      const dz = player.z - anchor.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= NPC_TALK_RADIUS) {
        return npcId;
      }
    }
    return null;
  }


  // ==========================================
  // SIMULATION TICK
  // ==========================================
  public tick(realDeltaSeconds: number): void {
    if (!Number.isFinite(realDeltaSeconds)) return;
    if (this.clock.isPaused()) {
      this.state.clock = { ...this.clock.getState() };
      return;
    }

    const minutesAdvanced = this.clock.tick(realDeltaSeconds);
    this.state.clock = { ...this.clock.getState() };
    // Real, unpaused time at the controls; the pause menu reports it.
    this.state.metadata.totalPlayMinutes += Math.max(0, realDeltaSeconds) / 60;
    this.fishingDomain.tick(realDeltaSeconds);
    this.laborDomain.tick(realDeltaSeconds);
    // Slow idle trickle, measured in real time while the game runs unpaused.
    this.progressionDomain.tickPassiveWorkRegen(realDeltaSeconds);
    // School spawning/expiry is checked every frame so a freed habitat repopulates
    // promptly; it is minute-granular internally, so the explicit catch-up path
    // owns its own call rather than double-stepping here when minutes advance.
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
    // `applyElapsedGameMinutes` no longer ticks schools; the rest/debug catch-up
    // path must still expire and repopulate them for the elapsed span.
    this.fishingDomain.tickSchools();
    this.persistRng();
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
    // Work is a day's labor budget: waking restores a small share plus a floor,
    // then the new day's earning tallies open.
    const restored = this.progressionDomain.restoreWorkOnRest();
    return { success: true, yield: restored };
  }

  /**
   * Eat a crafted meal for a bounded Work restore. The item is removed
   * atomically before the grant; a refused eat spends nothing.
   */
  private consumeItem(itemId: ItemId): InteractionResult {
    const definition = ContentRegistry.items.get(itemId);
    if (!definition?.consumable || definition.consumable.kind !== "work") {
      return { success: false, reason: "That is not something you can eat" };
    }
    const inventory = this.state.inventories[this.state.player.inventoryId];
    if (!inventory || !InventoryManager.hasItems(inventory, [{ itemId, quantity: 1 }])) {
      return { success: false, reason: "You are not carrying that meal" };
    }
    if (!this.progressionDomain.canEatMeal()) {
      return { success: false, reason: "You are well fed — try again tomorrow" };
    }
    if (!this.progressionDomain.hasWorkRoom(definition.consumable.amount)) {
      return { success: false, reason: "You are full of energy already" };
    }
    if (!InventoryManager.removeItemsAtomically(inventory, [{ itemId, quantity: 1 }])) {
      return { success: false, reason: "Could not eat that meal" };
    }
    const granted = this.progressionDomain.consumeMeal(definition.consumable.amount);
    if (granted <= 0) {
      InventoryManager.addItemsAtomically(inventory, [{ itemId, quantity: 1 }]);
      return { success: false, reason: "You are full of energy already" };
    }
    return { success: true, yield: granted };
  }

  private applyElapsedGameMinutes(minutesAdvanced: number): void {
    const startMinute = this.state.clock.currentMinute - minutesAdvanced;
    const weatherBefore = this.state.weather.type;
    // The clock has already advanced by the time we get here, so the previous
    // season is derived from where the elapsed span started.
    const seasonBefore = seasonAtMinute(startMinute);
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
    if (this.state.clock.season !== seasonBefore) {
      this.events.emit("SeasonChanged", {
        season: this.state.clock.season,
        previousSeason: seasonBefore,
        year: this.state.clock.year,
        minute: this.state.clock.currentMinute
      });
    }

    this.processingDomain.tick();
    this.contractDomain.tick();
    this.marketDomain.tick();
    this.navigationDomain.tickFuel(minutesAdvanced);
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
    if (!InventoryManager.addItemsAtomically(inventory, [
      { itemId: "item.chum_bucket", quantity: 1 },
      { itemId: "item.basic_lure", quantity: 1 }
    ])) {
      return false;
    }
    const schoolId = this.spawnFishSchool(habitatId, x, z, [speciesId]);
    if (!this.chumFishSchool(schoolId).success) return false;
    if (!this.fishingDomain.togglePreparedLure().success) return false;
    return this.hookSportFish(schoolId).success;
  }

  /**
   * Atomically commits a fixed-step physics result. Rapier resolves motion,
   * while the simulation remains the only owner allowed to mutate GameState.
   */
  public commitPhysicsFrame(frame: ResolvedPhysicsFrame): { success: boolean; reason?: string } {
    const result = this.navigationDomain.commitPhysicsFrame(frame);
    if (result.success) {
      for (const discovery of buildNewDiscoveries(this.state)) {
        if (discovery.reward && !InventoryManager.addItemsAtomically(
          this.state.inventories[this.state.player.inventoryId], discovery.reward
        )) {
          if (!this.blockedDiscoveryNotices.has(discovery.id)) {
            this.blockedDiscoveryNotices.add(discovery.id);
            this.events.emit("Notification", { title: "Supplies found", message: "Make room for fuel and chum in your satchel, then return to the camp bench.", type: "warning" });
          }
          continue;
        }
        this.blockedDiscoveryNotices.delete(discovery.id);
        this.state.journal.unlockedKnowledge.push(discovery.id);
        this.events.emit("PlaceDiscovered", { knowledgeId: discovery.id, title: discovery.title, view: discovery.view, minute: this.state.clock.currentMinute });
      }
    }
    return result;
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

  public inspectSeedBelt(): SeedBeltDto {
    return this.farmingDomain.inspectSeedBelt();
  }

  public inspectProcessingJob(stationId: string): ProcessingJobInspectionDto | null {
    return this.processingDomain.inspect(stationId);
  }

  public inspectProcessingStation(stationId: string) {
    return this.processingDomain.inspectStation(stationId);
  }

  public inspectCharacterEquipment() {
    return this.equipmentDomain.inspectCharacter();
  }

  public cropInteractionReachMeters(action: "water" | "harvest" | "inspect"): number {
    return this.farmingDomain.interactionReachMeters(action);
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

  public cancelBasicFishing(): { success: boolean; reason?: string; reasonCode?: string } {
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

  public quoteSchoolHookWork(schoolId: FishSchoolId): number {
    return this.fishingDomain.quoteSchoolHookWork(schoolId);
  }

  public discardFishCargo(
    cargoId: FishCargoId,
    marketId?: MarketId
  ): { success: boolean; scraps?: number; reason?: string } {
    return this.cargoDomain.discard(cargoId, marketId);
  }

  public releaseFishCargo(
    cargoId: FishCargoId,
    marketId?: MarketId
  ): { success: boolean; reason?: string } {
    return this.cargoDomain.release(cargoId, marketId);
  }

  public pickupFishCargo(cargoId: FishCargoId): { success: boolean; reason?: string } {
    return this.cargoDomain.pickup(cargoId);
  }

  public canPickupFishCargo(cargoId: FishCargoId): boolean {
    return this.cargoDomain.canPickup(cargoId);
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

  public inspectCommodityAtMarket(
    marketId: MarketId,
    itemId: ItemId,
    intent: "buy" | "sell" = "sell",
    quantity = 1
  ) {
    return this.marketDomain.inspectCommodity(marketId, itemId, intent, quantity);
  }

  public inspectMarketBoard(marketId: MarketId) {
    return this.marketDomain.inspectBoard(marketId);
  }

  public inspectBulkProduceAtMarket(marketId: MarketId) {
    return this.marketDomain.inspectBulkProduce(marketId);
  }

  public inspectMarketDemand(marketId: MarketId) {
    return this.marketDomain.inspectDemandSignal(marketId);
  }

  public inspectWorldHud(selectedCropId: string | null = null): WorldHudDto {
    // The compass needs the quest targets, and `QuestDomain` owns how a target
    // is resolved (an objective anchor while the errand runs, the speaker's
    // anchor once it is ready to turn in). Pass its answer in rather than
    // letting the presentation layer re-derive it.
    return buildWorldHudDto(this.state, selectedCropId, this.questDomain.getActiveQuestDtos());
  }

  public inspectExpeditionBoard(): ExpeditionBoardDto {
    return this.marketDomain.inspectExpeditionBoard();
  }

  /**
   * Moves a stack of goods between the satchel and a vessel's stores. The move
   * is atomic in both directions: the goods are taken out first, and if the
   * destination cannot hold them they are put straight back, so a failed
   * transfer can never lose cargo or duplicate it.
   */
  public transferBetweenSatchelAndHold(
    itemId: ItemId,
    quantity: number,
    boatId: BoatId,
    direction: "to-hold" | "to-satchel"
  ): InteractionResult {
    const requested = Math.floor(quantity);
    if (!Number.isFinite(requested) || requested <= 0) {
      return { success: false, reason: "Choose how many to move" };
    }
    const boat = this.state.boats[boatId];
    if (!boat) return { success: false, reason: "That vessel is not registered" };
    if (!this.navigationDomain.canAccessBoatStores(boatId)) {
      return {
        success: false,
        reasonCode: "boat-out-of-reach",
        reason: "Move closer to the vessel before transferring stores"
      };
    }

    const satchel = this.state.inventories[this.state.player.inventoryId];
    const hold = this.state.inventories[boat.supplyInventoryId];
    if (!satchel || !hold) return { success: false, reason: "Those stores are unavailable" };

    const source = direction === "to-hold" ? satchel : hold;
    const destination = direction === "to-hold" ? hold : satchel;
    const held = InventoryManager.getItemCount(source, itemId);
    if (held <= 0) {
      return {
        success: false,
        reasonCode: "not-held",
        reason: direction === "to-hold" ? "Not in the satchel" : "Not in the hold"
      };
    }

    // Move what is actually there rather than refusing an over-large request.
    const moving = Math.min(requested, held);
    const batch = [{ itemId, quantity: moving }];
    if (!InventoryManager.removeItemsAtomically(source, batch)) {
      return { success: false, reason: "Those goods could not be taken out" };
    }
    if (!InventoryManager.addItemsAtomically(destination, batch)) {
      // Put it back exactly as it was: a full destination must cost nothing.
      InventoryManager.addItemsAtomically(source, batch);
      return {
        success: false,
        reasonCode: "no-room",
        reason: direction === "to-hold" ? "The hold is full" : "The satchel is full"
      };
    }
    return { success: true, quantity: moving };
  }

  public inspectHoldStores(): HoldStoresDto {
    return this.cargoDomain.inspectHoldStores();
  }

  public inspectSatchel(): SatchelDto {
    return buildSatchelDto(this.state);
  }

  public inspectItem(itemId: ItemId): ItemInspectionDto | null {
    const dto = buildItemInspectionDto(this.state, itemId);
    if (!dto?.provisions) return dto;
    const canEat = this.progressionDomain.canEatMeal();
    const hasRoom = this.progressionDomain.hasWorkRoom(dto.provisions.restoresWork);
    return {
      ...dto,
      provisions: {
        ...dto.provisions,
        edible: canEat && hasRoom,
        blockerReason: !canEat
          ? "Well fed today"
          : !hasRoom
          ? "Work is already full"
          : undefined
      }
    };
  }

  /**
   * Tidies the satchel: merges part-stacks of the same item up to their stack
   * limit, then orders what remains by category, name and quantity, leaving the
   * empty slots at the end. Item totals are preserved exactly — this only moves
   * goods between slots, so it can never create or destroy anything.
   */
  public sortSatchel(): InteractionResult {
    const inventory = this.state.inventories[this.state.player.inventoryId];
    if (!inventory) return { success: false, reason: "No satchel to sort" };

    const before = new Map<string, number>();
    for (const slot of inventory.slots) {
      const quantity = InventoryManager.getSlotQuantity(slot);
      if (!slot.itemId || quantity <= 0) continue;
      before.set(slot.itemId, (before.get(slot.itemId) ?? 0) + quantity);
    }
    if (before.size === 0) return { success: false, reason: "The satchel is already empty" };

    const entries = [...before.entries()].map(([itemId, quantity]) => {
      const definition = ContentRegistry.items.get(itemId);
      const species = ContentRegistry.fishSpecies.get(itemId);
      return {
        itemId,
        quantity,
        category: definition?.category ?? (species ? "fish" : "item"),
        name: definition?.name ?? species?.name ?? itemId,
        stackLimit: Math.max(1, definition?.stackLimit ?? 1)
      };
    });
    entries.sort((a, b) =>
      a.category.localeCompare(b.category)
      || a.name.localeCompare(b.name)
      || b.quantity - a.quantity
    );

    // Lay the merged stacks back out from the first slot. A satchel that cannot
    // hold its own contents once merged is left untouched rather than truncated.
    const rebuilt: Array<{ itemId: string; quantity: number } | null> = [];
    for (const entry of entries) {
      let remaining = entry.quantity;
      while (remaining > 0) {
        const take = Math.min(remaining, entry.stackLimit);
        rebuilt.push({ itemId: entry.itemId, quantity: take });
        remaining -= take;
      }
    }
    if (rebuilt.length > inventory.slots.length) {
      return { success: false, reason: "The satchel is too full to tidy" };
    }

    for (let index = 0; index < inventory.slots.length; index += 1) {
      const next = rebuilt[index] ?? null;
      inventory.slots[index] = next
        ? { itemId: next.itemId as ItemId, quantity: next.quantity }
        : {};
    }
    return { success: true, quantity: rebuilt.length };
  }

  public inspectWorldMap(): WorldMapDto {
    return buildWorldMapDto(this.state);
  }

  public inspectAlmanac(): AlmanacDto {
    return buildAlmanacDto(this.state);
  }

  public inspectJournalPages(): JournalPagesDto {
    return buildJournalPagesDto(this.state);
  }

  public inspectPauseSummary(): PauseSummaryDto {
    return buildPauseSummaryDto(this.state);
  }

  public inspectFarmForecast(): FarmForecastDto {
    const { clock, weather } = this.state;
    return {
      seasonLabel: clock.season.charAt(0).toUpperCase() + clock.season.slice(1),
      currentTemperatureC: Math.round(weather.temperatureC),
      slots: [
        { label: "Now", type: forecastWeatherAt(weather, clock.currentMinute, 0) },
        { label: "+2h", type: forecastWeatherAt(weather, clock.currentMinute, 120) },
        { label: "+5h", type: forecastWeatherAt(weather, clock.currentMinute, 300) }
      ],
      rainLabel: weather.precipitation >= 0.65
        ? "Soaking"
        : weather.precipitation >= 0.25
          ? "Showers possible"
          : "Mostly dry",
      windLabel: weather.windSpeed >= 11 ? "Gale" : weather.windSpeed >= 6 ? "Breezy" : "Light",
      seaLabel: weather.seaRoughness >= 0.7 ? "Rough" : weather.seaRoughness >= 0.35 ? "Swell" : "Calm"
    };
  }

  public inspectSportFishingHud() {
    return this.fishingDomain.inspectSportFishingHud();
  }

  public inspectWaterReading() {
    return this.fishingDomain.inspectWaterReading();
  }

  public inspectSkillProgress(): SkillProgressDto[] {
    return this.progressionDomain.inspectSkills();
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

  public inspectFishCargoAtMarket(marketId: MarketId, cargoId: FishCargoId) {
    return this.marketDomain.inspectFish(marketId, cargoId);
  }

  public inspectBulkFishAtMarket(marketId: MarketId) {
    return this.marketDomain.inspectBulkFish(marketId);
  }

  public sellFishCargoAtMarket(marketId: MarketId, cargoId: FishCargoId): { success: boolean; revenue?: number; reason?: string } {
    return this.marketDomain.sellFish(marketId, cargoId);
  }

  public sellFishTradePackAtMarket(marketId: MarketId, cargoId: FishCargoId): { success: boolean; revenue?: number; reason?: string } {
    return this.marketDomain.sellTradePack(marketId, cargoId);
  }

  // ==========================================
  // PROFICIENCY & PROGRESSION
  // ==========================================
  public addProficiencyXp(skill: SkillId, xpAmount: number): void {
    this.progressionDomain.addProficiencyXp(skill, xpAmount);
  }

  public quoteWorkCost(baseCost: number, skill: SkillId, action?: WorkActionId): WorkCostQuote {
    return this.progressionDomain.quoteWorkCost(baseCost, skill, action);
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
