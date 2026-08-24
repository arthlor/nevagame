// src/app/GameApp.ts

import * as THREE from "three";
import React from "react";
import ReactDOM from "react-dom/client";
import { Simulation } from "../simulation/Simulation";
import { WorldScene } from "../render/scene/WorldScene";
import { GameCamera } from "../render/camera/GameCamera";
import { InputRouter } from "../input/InputRouter";
import { IndexedDbSaveRepository } from "../persistence/IndexedDbSaveRepository";
import { GameAction, GameMode, MarketId, ProcessingJobState } from "../simulation/core/types";
import { GameUI, ActiveModal } from "../ui/GameUI";
import { AssetLoader } from "../render/loaders/AssetLoader";
import { applyOfflineProgression } from "../persistence/offlineDelta";
import { migrateSaveData } from "../persistence/SaveMigrations";
import { InventoryManager } from "../simulation/inventory/InventoryManager";
import { ContentRegistry } from "../content/ContentRegistry";
import { PhysicsWorld } from "../physics/PhysicsWorld";
import { WorldLayout } from "../world/WorldLayout";

interface FishingHoldInput {
  isReeling: boolean;
  isSlacking: boolean;
  isBracing: boolean;
}

interface InteractionCandidate {
  kind: "harvest" | "water" | "plant" | "dock" | "school" | "mill" | "workbench" | "compost";
  dist: number;
  priority: number;
  id?: string;
  prompt: string;
}

export class GameApp {
  public sim: Simulation;
  public worldScene: WorldScene;
  public gameCamera: GameCamera;
  public inputRouter: InputRouter;
  public saveRepo: IndexedDbSaveRepository;
  private physicsWorld: PhysicsWorld | null = null;

  private mode: GameMode = "on-foot";
  private promptText: string | null = null;
  private toastText: string | null = null;
  private toastUntilMs: number = 0;
  private activeModal: ActiveModal = null;
  private activeMarketId: MarketId | null = null;
  private selectedCropId: string = "crop.wheat";
  private hudFishingHold: FishingHoldInput = { isReeling: false, isSlacking: false, isBracing: false };
  private isRunning: boolean = false;
  private lastTimeMs: number = 0;
  private fps: number = 60;
  private frameCount: number = 0;
  private fpsTimer: number = 0;
  private simulationFeedbackDisposers: Array<() => void> = [];
  private lastAutosaveMs: number = 0;
  private physicsAccumulatorSeconds: number = 0;
  private autosaveInFlight: boolean = false;
  private autosaveRequested: boolean = false;

  private uiRoot: ReactDOM.Root | null = null;

  constructor(canvas: HTMLCanvasElement, uiContainer: HTMLElement) {
    this.sim = new Simulation();
    this.worldScene = new WorldScene(canvas);
    this.gameCamera = new GameCamera(window.innerWidth / window.innerHeight);
    this.inputRouter = new InputRouter();
    this.saveRepo = new IndexedDbSaveRepository();
    this.attachSimulationFeedback();

    this.uiRoot = ReactDOM.createRoot(uiContainer);
    window.addEventListener("resize", this.onResize);
    document.addEventListener("visibilitychange", this.onVisibilityChange);

    this.setupInputHandlers();
  }

  public async start(): Promise<void> {
    const benchmarkPreset = import.meta.env.DEV
      ? new URLSearchParams(window.location.search).get("artView")
      : null;
    // 1. Try loading existing save
    const saved = benchmarkPreset ? null : await this.saveRepo.loadGame();
    if (saved) {
      const migrated = migrateSaveData(saved);
      applyOfflineProgression(migrated.state, Date.now());
      this.sim = new Simulation(migrated.state);
      this.attachSimulationFeedback();
      this.requestAutosave();

      this.mode = migrated.state.sportFishing
        ? "sport-fishing"
        : migrated.state.basicFishing
          ? "basic-fishing"
          : migrated.state.player.activeBoatId
            ? "boat-driving"
            : "on-foot";
      this.inputRouter.setMode(this.mode);

      console.info("[GameApp] Loaded existing game save from IndexedDB.");
    }

    const benchmarkPositions: Record<string, [number, number, number]> = {
      bridge: [-16, 0.1, 5],
      farm: [8, 0.8, -2],
      harbor: [23, 0.2, 36],
      coast: [10, 5.5, 31]
    };
    const benchmarkPosition = benchmarkPreset ? benchmarkPositions[benchmarkPreset] : undefined;
    if (benchmarkPosition) {
      const [x, y, z] = benchmarkPosition;
      Object.assign(this.sim.state.player, { x, y, z, rotationY: 0 });
      this.sim.clock.setPaused(true);
    }

    // 2. Preload 3D assets
    await AssetLoader.preloadAll();
    this.physicsWorld = await PhysicsWorld.create();

    // 3. Start render loop
    this.isRunning = true;
    this.lastTimeMs = performance.now();
    this.lastAutosaveMs = this.lastTimeMs;
    this.onResize();
    requestAnimationFrame(this.loop);
  }

  private setupInputHandlers(): void {
    this.inputRouter.onAction((action: GameAction) => {
      if (this.mode === "basic-fishing" && action !== "pause") return;
      switch (action) {
        case "interact":
          if (this.mode === "sport-fishing" || this.activeModal) return;
          this.handleContextInteract();
          break;
        case "pause":
          if (this.activeModal) {
            const wasPause = this.activeModal === "pause";
            this.activeModal = null;
            if (wasPause) {
              this.sim.clock.setPaused(false);
            }
          } else {
            this.activeModal = "pause";
            this.sim.clock.setPaused(true);
          }
          break;
        case "open-inventory":
          this.activeModal = this.activeModal === "inventory" ? null : "inventory";
          break;
        case "open-journal":
          this.activeModal = this.activeModal === "journal" ? null : "journal";
          break;
        case "open-map":
          this.activeModal = this.activeModal === "market" ? null : "market";
          break;
        case "fish-reel":
        case "fish-slack":
        case "fish-brace":
        case "fish-left":
        case "fish-right":
          this.applySportFishingInput();
          break;
        default:
          break;
      }
    });
  }

  private attachSimulationFeedback(): void {
    for (const dispose of this.simulationFeedbackDisposers) dispose();
    this.simulationFeedbackDisposers = [
      this.sim.events.on("FishLanded", ({ speciesId, weightKg }) => {
        const speciesName = ContentRegistry.fishSpecies.get(speciesId)?.name ?? "fish";
        this.setToast(`Landed ${weightKg.toFixed(1)} kg ${speciesName}`, 3600);
      }),
      this.sim.events.on("FishEscaped", ({ reason }) => {
        this.setToast(reason === "snapped" ? "The line snapped" : "The fish slipped free", 3200);
      }),
      this.sim.events.on("BasicFishingStarted", () => {
        this.setToast("Casting…", 1800);
      }),
      this.sim.events.on("BasicFishingResolved", ({ catchItemId, reason }) => {
        if (catchItemId) {
          this.setToast(`Caught ${ContentRegistry.items.get(catchItemId)?.name ?? "a fish"}!`, 2600);
        } else if (reason === "inventory-full") {
          this.setToast("Your backpack is full; the fish got away", 2800);
        } else {
          this.setToast("Nothing bit this time", 2200);
        }
      }),
      this.sim.events.on("ContractCompleted", ({ rewardMoney }) => {
        this.setToast(`Contract complete: +${rewardMoney} G`, 3600);
      }),
      this.sim.events.on("BoatBoarded", () => this.setToast("Aboard the rowboat", 1800)),
      this.sim.events.on("BoatDocked", () => this.setToast("Docked at harbor", 2200)),
      this.sim.events.on("CropPlanted", () => this.worldScene.playPlayerAction("plant")),
      this.sim.events.on("CropWatered", () => this.worldScene.playPlayerAction("water")),
      this.sim.events.on("CropHarvested", () => this.worldScene.playPlayerAction("harvest")),
      this.sim.events.on("BasicFishingStarted", () => this.worldScene.playPlayerAction("cast")),
      this.sim.events.on("FishHooked", () => this.worldScene.playPlayerAction("brace")),
      this.sim.events.on("BoatBoarded", () => this.worldScene.playPlayerAction("board")),
      this.sim.events.on("BoatDocked", () => this.worldScene.playPlayerAction("dock")),
      this.sim.events.on("CropPlanted", () => this.requestAutosave()),
      this.sim.events.on("CropHarvested", () => this.requestAutosave()),
      this.sim.events.on("RecipeStarted", () => this.requestAutosave()),
      this.sim.events.on("RecipeCompleted", () => this.requestAutosave()),
      this.sim.events.on("FishLanded", () => this.requestAutosave()),
      this.sim.events.on("FishHooked", () => this.requestAutosave()),
      this.sim.events.on("BoatBoarded", () => this.requestAutosave()),
      this.sim.events.on("BoatDocked", () => this.requestAutosave()),
      this.sim.events.on("BasicFishingStarted", () => this.requestAutosave()),
      this.sim.events.on("BasicFishingResolved", () => this.requestAutosave()),
      this.sim.events.on("ItemSold", () => this.requestAutosave()),
      this.sim.events.on("FishSold", () => this.requestAutosave()),
      this.sim.events.on("ContractCompleted", () => this.requestAutosave())
    ];
  }

  private loop = (nowMs: number): void => {
    if (!this.isRunning) return;

    const deltaSeconds = Math.min(0.1, (nowMs - this.lastTimeMs) / 1000);
    this.lastTimeMs = nowMs;

    // FPS calculation
    this.frameCount++;
    this.fpsTimer += deltaSeconds;
    if (this.fpsTimer >= 0.5) {
      this.fps = Math.round(this.frameCount / this.fpsTimer);
      this.frameCount = 0;
      this.fpsTimer = 0;
    }

    // 0. Sport-fishing hold input every frame (source of truth for A/D + reel/slack/brace)
    if (this.mode === "sport-fishing") {
      this.applySportFishingInput();
    }

    // 1. Fixed-step physics resolves terrain, structure and shoreline collision.
    this.physicsAccumulatorSeconds = Math.min(0.2, this.physicsAccumulatorSeconds + deltaSeconds);
    while (this.physicsWorld && this.physicsAccumulatorSeconds >= 1 / 60) {
      this.updateMovement(1 / 60, nowMs / 1000);
      this.physicsAccumulatorSeconds -= 1 / 60;
    }

    // 2. Tick Authoritative Simulation
    this.sim.tick(deltaSeconds);
    if (nowMs - this.lastAutosaveMs >= 60_000) {
      this.requestAutosave();
    }

    // 3. Evaluate Contextual Interaction Target
    this.evaluateInteractionTarget();

    // 4. Synchronize 3D Visuals
    const state = this.sim.getState();
    const playerPos = new THREE.Vector3(state.player.x, state.player.y, state.player.z);
    void this.worldScene.syncWithSimulation(this.sim, nowMs / 1000);
    this.worldScene.updateEnvironment(this.sim.getState(), nowMs / 1000, playerPos);

    // 5. Update Camera
    this.gameCamera.update(playerPos, state.player.rotationY, this.mode, deltaSeconds);

    // 6. Render 3D Scene
    this.worldScene.render(this.gameCamera.camera);

    // 7. Render 2D UI Overlay
    this.renderUI();

    requestAnimationFrame(this.loop);
  };

  private isMovementFrozen(): boolean {
    return (
      this.sim.clock.isPaused() ||
      this.mode === "paused" ||
      this.mode === "menu" ||
      this.mode === "basic-fishing" ||
      this.mode === "sport-fishing" ||
      this.activeModal !== null
    );
  }

  private updateMovement(deltaSeconds: number, timeSeconds: number): void {
    if (this.isMovementFrozen()) return;

    const input = this.inputRouter.getInputState();
    if (this.physicsWorld) {
      const frame = this.physicsWorld.step(
        this.sim.getState(),
        { ...input.moveVector, sprint: input.isShiftDown },
        this.mode,
        deltaSeconds,
        timeSeconds
      );
      Object.assign(this.sim.state.player, frame.player);
      this.sim.refreshPlayerRegion();
      for (const [id, boat] of Object.entries(frame.boats)) {
        Object.assign(this.sim.state.boats[id], boat);
      }
      return;
    }
    if (this.mode === "on-foot") this.sim.movePlayer(input.moveVector, input.isShiftDown, deltaSeconds);
    else if (this.mode === "boat-driving" && this.sim.state.player.activeBoatId) this.sim.driveActiveBoat(input.moveVector, deltaSeconds);
  }

  private applySportFishingInput(): void {
    if (this.mode !== "sport-fishing" || !this.sim.activeFishingEncounter) return;

    const input = this.inputRouter.getInputState();
    const keys = input.keysDown;
    let rodAngle = 0;
    if (keys.has("KeyA") || keys.has("ArrowLeft")) rodAngle -= 0.6;
    if (keys.has("KeyD") || keys.has("ArrowRight")) rodAngle += 0.6;

    const hud = this.hudFishingHold;
    this.sim.activeFishingEncounter.setInput({
      isReeling: input.isPrimaryDown || hud.isReeling,
      isSlacking: input.isSecondaryDown || keys.has("KeyS") || hud.isSlacking,
      isBracing: input.isSpaceDown || hud.isBracing,
      rodDirectionAngle: rodAngle
    });
  }

  private setToast(text: string, durationMs: number = 2500): void {
    this.toastText = text;
    this.toastUntilMs = performance.now() + durationMs;
  }

  private currentToast(): string | null {
    if (this.toastText && performance.now() < this.toastUntilMs) {
      return this.toastText;
    }
    return null;
  }

  private farmWorldOrigin(farmId: string): { x: number; z: number } {
    return farmId === "farm.starter_garden" ? { x: 0, z: 0 } : { x: -8, z: -10 };
  }

  private findStationJob(stationId: string): ProcessingJobState | undefined {
    return Object.values(this.sim.state.processingJobs).find(
      (job) => job.stationId === stationId && (job.status === "active" || job.status === "complete")
    );
  }

  private stationPrompt(stationId: string, idlePrompt: string, collectPrompt: string): string {
    const job = this.findStationJob(stationId);
    if (job?.status === "complete") {
      return collectPrompt;
    }
    if (job?.status === "active") {
      return "Job in progress...";
    }
    return idlePrompt;
  }

  private hasCropSeeds(cropId: string): boolean {
    const cropDef = ContentRegistry.crops.get(cropId);
    if (!cropDef) return false;
    const inv = this.sim.state.inventories[this.sim.state.player.inventoryId];
    if (!inv) return false;
    return InventoryManager.hasItems(inv, [{ itemId: cropDef.seedItemId, quantity: 1 }]);
  }

  private canPlantCropAt(farmId: string, cropId: string, x: number, z: number): boolean {
    const farm = this.sim.state.farms[farmId];
    if (!farm) return false;
    if (!this.hasCropSeeds(cropId)) return false;

    const cropDef = ContentRegistry.crops.get(cropId);
    if (!cropDef || this.sim.state.player.proficiencies.farming < cropDef.minimumFarmingXp) return false;
    const footprintW = cropDef ? cropDef.footprint.width : 1.0;
    const footprintD = cropDef ? cropDef.footprint.depth : 1.0;
    const halfW = farm.widthMeters / 2;
    const halfD = farm.depthMeters / 2;
    if (Math.abs(x) > halfW - footprintW / 2 || Math.abs(z) > halfD - footprintD / 2) {
      return false;
    }

    for (const placedId of farm.placedCropIds) {
      const other = this.sim.state.crops[placedId];
      if (!other) continue;
      const otherDef = ContentRegistry.crops.get(other.cropId);
      const minDistance = (footprintW + (otherDef ? otherDef.footprint.width : 1)) / 2;
      const dx = other.x - x;
      const dz = other.z - z;
      if (Math.sqrt(dx * dx + dz * dz) < minDistance * 0.9) {
        return false;
      }
    }
    return true;
  }

  private canPlantWheatSomewhere(): boolean {
    const cropDef = ContentRegistry.crops.get(this.selectedCropId);
    if (!cropDef || !this.hasCropSeeds(cropDef.id)) return false;
    const offsets = [0, 0.8, -0.8, 1.4, -1.4];
    for (const x of offsets) {
      for (const z of offsets) {
        if (this.canPlantCropAt("farm.starter_garden", cropDef.id, x, z)) return true;
      }
    }
    return false;
  }

  private pickInteraction(): InteractionCandidate | null {
    const p = this.sim.state.player;
    const candidates: InteractionCandidate[] = [];

    for (const crop of Object.values(this.sim.state.crops)) {
      const origin = this.farmWorldOrigin(crop.farmId);
      const dist = Math.hypot(p.x - (origin.x + crop.x), p.z - (origin.z + crop.z));
      if (dist < 2.0) {
        if (crop.stage === "mature" || crop.stage === "overripe") {
          candidates.push({ kind: "harvest", dist, priority: 0, id: crop.id, prompt: "Press [E] to Harvest Crop" });
        } else if (crop.stage !== "withered" && crop.moisture < 30) {
          candidates.push({ kind: "water", dist, priority: 0, id: crop.id, prompt: "Press [E] to Water Crop" });
        }
      }
    }

    const millDist = Math.hypot(p.x - 2, p.z - -3);
    if (millDist < 2.5) {
      candidates.push({
        kind: "mill",
        dist: millDist,
        priority: 1,
        prompt: this.stationPrompt(
          "struct.starter_mill",
          "Press [E] to Mill Grain at Hand Mill",
          "Press [E] to collect milled grain"
        )
      });
    }

    const benchDist = Math.hypot(p.x - -2, p.z - -3);
    if (benchDist < 2.5) {
      candidates.push({
        kind: "workbench",
        dist: benchDist,
        priority: 1,
        prompt: this.stationPrompt(
          "struct.workbench",
          "Press [E] to Mix Chum at Workbench",
          "Press [E] to collect chum"
        )
      });
    }

    const compostDist = Math.hypot(p.x - 4, p.z - -3);
    if (compostDist < 2.5) {
      candidates.push({
        kind: "compost",
        dist: compostDist,
        priority: 1,
        prompt: this.stationPrompt(
          "struct.starter_compost",
          "Press [E] to Cultivate Bait Worms",
          "Press [E] to collect Bait Worms"
        )
      });
    }

    if (this.mode === "on-foot" && this.sim.canBoardBoat("boat.player_rowboat")) {
      candidates.push({
        kind: "dock",
        dist: 0,
        priority: 1,
        prompt: "Press [E] to Board Rowboat"
      });
    }
    if (this.mode === "boat-driving" && this.sim.canDockActiveBoat()) {
      candidates.push({
        kind: "dock",
        dist: 0,
        priority: 1,
        prompt: "Press [E] to Dock & Disembark"
      });
    }

    for (const school of Object.values(this.sim.state.world.activeSchools)) {
      const sDist = Math.hypot(p.x - school.x, p.z - school.z);
      if (sDist < 12.0) {
        const frenzy =
          school.feedingFrenzyUntilMinute && this.sim.state.clock.currentMinute <= school.feedingFrenzyUntilMinute;
        candidates.push({
          kind: "school",
          dist: sDist,
          priority: 1,
          id: school.id,
          prompt: frenzy ? "Press [E] to Hook Sport Fish!" : "Press [E] to Chum School (Chum Bucket)"
        });
      }
    }

    const selectedCrop = ContentRegistry.crops.get(this.selectedCropId);
    const starterDist = Math.hypot(p.x, p.z);
    if (starterDist < 3.5 && selectedCrop && this.canPlantWheatSomewhere()) {
      candidates.push({
        kind: "plant",
        dist: starterDist,
        priority: 2,
        prompt: `Press [E] to Plant ${selectedCrop.name}`
      });
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.priority - b.priority || a.dist - b.dist);
    return candidates[0];
  }

  private evaluateInteractionTarget(): void {
    const toast = this.currentToast();
    if (this.mode === "sport-fishing") {
      this.promptText = toast;
      return;
    }

    const picked = this.pickInteraction();
    this.promptText = toast ?? (picked ? picked.prompt : null);
  }

  private handleContextInteract(): void {
    if (this.mode === "sport-fishing") return;

    const picked = this.pickInteraction();
    if (!picked) return;

    switch (picked.kind) {
      case "harvest":
        if (picked.id) this.sim.harvestCrop(picked.id);
        break;
      case "water":
        if (picked.id) this.sim.waterCrop(picked.id);
        break;
      case "plant":
        this.tryPlantSelectedCrop();
        break;
      case "dock":
        this.toggleBoatBoard();
        break;
      case "school":
        if (picked.id) this.interactWithSchool(picked.id);
        break;
      case "mill":
        this.interactWithStation("struct.starter_mill", "recipe.wheat_to_grain");
        break;
      case "workbench":
        this.interactWithStation("struct.workbench", "recipe.craft_chum");
        break;
      case "compost":
        this.interactWithStation("struct.starter_compost", "recipe.compost_worms");
        break;
    }
  }

  private tryPlantSelectedCrop(): void {
    const cropDef = ContentRegistry.crops.get(this.selectedCropId);
    if (!cropDef) {
      this.setToast("Choose seeds from your inventory first");
      return;
    }
    let lastReason = "Cannot plant";
    for (let i = 0; i < 8; i++) {
      const offsetX = (this.sim.rng.nextFloat() - 0.5) * 3;
      const offsetZ = (this.sim.rng.nextFloat() - 0.5) * 3;
      const res = this.sim.plantCrop("farm.starter_garden", cropDef.id, offsetX, offsetZ);
      if (res.success) return;
      lastReason = res.reason ?? lastReason;
      if (res.reason === "Missing seed in inventory") break;
    }
    this.setToast(lastReason);
  }

  private toggleBoatBoard(): void {
    const boatId = "boat.player_rowboat";
    if (this.mode === "on-foot") {
      const res = this.sim.boardBoat(boatId);
      if (!res.success) {
        this.setToast(res.reason ?? "Cannot board boat");
        return;
      }
      this.mode = "boat-driving";
      this.inputRouter.setMode("boat-driving");
      this.requestAutosave();
    } else {
      const res = this.sim.dockActiveBoat();
      if (!res.success) {
        this.setToast(res.reason ?? "Cannot dock here");
        return;
      }
      this.mode = "on-foot";
      this.inputRouter.setMode("on-foot");
      this.requestAutosave();
    }
  }

  private interactWithSchool(schoolId: string): void {
    const school = this.sim.state.world.activeSchools[schoolId];
    if (!school) return;

    if (!school.feedingFrenzyUntilMinute || this.sim.state.clock.currentMinute > school.feedingFrenzyUntilMinute) {
      const res = this.sim.chumFishSchool(schoolId);
      if (!res.success) this.setToast(res.reason ?? "Cannot chum school");
    } else {
      const res = this.sim.hookSportFish(schoolId);
      if (res.success) {
        this.mode = "sport-fishing";
        this.inputRouter.setMode("sport-fishing");
        this.hudFishingHold = { isReeling: false, isSlacking: false, isBracing: false };
      } else {
        this.setToast(res.reason ?? "Cannot hook fish");
      }
    }
  }

  private interactWithStation(stationId: string, recipeId: string): void {
    const job = this.findStationJob(stationId);
    if (job && job.status === "complete") {
      const res = this.sim.collectProcessingJob(job.id);
      if (!res.success) {
        this.setToast(res.reason ?? "Could not collect");
      } else {
        this.setToast("Collected");
      }
      return;
    }
    if (job && job.status === "active") {
      this.setToast("Job in progress...");
      return;
    }
    const res = this.sim.startProcessingJob(recipeId, stationId);
    if (!res.success) {
      this.setToast(res.reason ?? "Cannot start job");
    }
  }

  private async handleQuickSave(): Promise<void> {
    try {
      const ok = await this.saveRepo.saveGame(this.sim.state);
      if (ok) this.lastAutosaveMs = performance.now();
      this.setToast(ok ? "Saved" : "Save failed");
    } catch {
      this.setToast("Save failed");
    }
  }

  private onVisibilityChange = (): void => {
    if (document.hidden) this.requestAutosave();
  };

  private requestAutosave(): void {
    this.autosaveRequested = true;
    if (this.autosaveInFlight) return;
    void this.flushAutosave();
  }

  private async flushAutosave(): Promise<void> {
    this.autosaveInFlight = true;
    try {
      while (this.autosaveRequested) {
        this.autosaveRequested = false;
        const saved = await this.saveRepo.saveGame(this.sim.state);
        if (saved) this.lastAutosaveMs = performance.now();
      }
    } finally {
      this.autosaveInFlight = false;
      if (this.autosaveRequested) void this.flushAutosave();
    }
  }

  private handleCastFishing(): void {
    if (this.mode === "sport-fishing") return;
    const p = this.sim.state.player;
    if (!WorldLayout.nearbyFishingHabitat(p.x, p.z)) {
      this.setToast("Move closer to water to fish");
      return;
    }
    const res = this.sim.castBasicFishing();
    if (res.success) {
      this.mode = "basic-fishing";
      this.inputRouter.setMode("basic-fishing");
      this.setToast("Casting…", 1800);
    } else {
      this.setToast(res.reason ?? "Fishing failed");
    }
  }

  private handleResetPlayerToSafePlace(): void {
    this.sim.resetPlayerToSafeSpawn();
    this.mode = "on-foot";
    this.inputRouter.setMode("on-foot");
    this.activeModal = null;
    this.sim.clock.setPaused(false);
    this.setToast("Character safely returned to Starter Garden", 3000);
    this.requestAutosave();
  }

  private renderUI(): void {
    if (!this.uiRoot) return;

    if (this.mode === "sport-fishing" && !this.sim.activeFishingEncounter) {
      // Encounter finished
      this.mode = this.sim.state.player.activeBoatId ? "boat-driving" : "on-foot";
      this.inputRouter.setMode(this.mode);
      this.hudFishingHold = { isReeling: false, isSlacking: false, isBracing: false };
    }
    if (this.mode === "basic-fishing" && !this.sim.state.basicFishing) {
      this.mode = this.sim.state.player.activeBoatId ? "boat-driving" : "on-foot";
      this.inputRouter.setMode(this.mode);
    }

    this.uiRoot.render(
      React.createElement(GameUI, {
        state: this.sim.getState(),
        mode: this.mode,
        fps: this.fps,
        renderStats: {
          calls: this.worldScene.renderer.info.render.calls,
          triangles: this.worldScene.renderer.info.render.triangles,
          points: this.worldScene.renderer.info.render.points,
          lines: this.worldScene.renderer.info.render.lines
        },
        promptText: this.promptText,
        activeModal: this.activeModal,
        onSetActiveModal: (modal: ActiveModal) => {
          if (this.mode === "basic-fishing" && modal !== "pause") return;
          const previousModal = this.activeModal;
          this.activeModal = modal;
          if (modal === "pause") {
            this.sim.clock.setPaused(true);
          } else if (previousModal === "pause" && modal === null) {
            this.sim.clock.setPaused(false);
          }
          if (modal !== "market") this.activeMarketId = null;
        },
        onOpenMarket: () => {
          if (this.mode === "basic-fishing") return;
          const marketId = this.sim.getNearbyMarketId();
          if (!marketId) {
            this.setToast("Visit a market stall to trade");
            return;
          }
          this.activeMarketId = marketId;
          this.activeModal = "market";
        },
        marketId: this.activeMarketId,
        onSelectPlantCrop: (cropId: string) => {
          this.selectedCropId = cropId;
          this.setToast(`${ContentRegistry.crops.get(cropId)?.name ?? "Crop"} selected for planting`);
        },
        fishingEncounter: this.sim.activeFishingEncounter ? this.sim.activeFishingEncounter.getState() : null,
        onSetFishingInput: (input) => {
          this.hudFishingHold = {
            isReeling: input.isReeling,
            isSlacking: input.isSlacking,
            isBracing: input.isBracing
          };
          this.applySportFishingInput();
        },
        onSellItem: (marketId: MarketId, itemId: string, quantity: number) => {
          this.sim.sellItemAtMarket(marketId, itemId, quantity);
        },
        onSellFishCargo: (marketId: MarketId, cargoId: string) => {
          const res = this.sim.sellFishCargoAtMarket(marketId, cargoId);
          if (!res.success) this.setToast(res.reason ?? "Could not sell fish");
          else if (res.revenue != null) this.setToast(`Sold for ${res.revenue} G`);
        },
        onDiscardFishCargo: (cargoId: string) => {
          const res = this.sim.discardFishCargo(cargoId);
          if (!res.success) this.setToast(res.reason ?? "Could not discard fish");
          else if (res.scraps) this.setToast(`Discarded for ${res.scraps} fish scraps`);
          else this.setToast(res.reason ?? "Discarded spoiled fish");
        },
        onDeliverContractItems: (contractId: string, itemId: string, quantity: number) => {
          const res = this.sim.deliverItemsToContract(contractId, itemId, quantity);
          if (!res.success) this.setToast(res.reason ?? "Could not deliver items");
          else if (res.completed) this.setToast(`Contract complete: +${res.rewardMoney} G`, 3600);
          else this.setToast(`Delivered ${res.delivered} item`);
        },
        onDeliverFishCargo: (contractId: string, cargoId: string) => {
          const res = this.sim.deliverFishCargoToContract(contractId, cargoId);
          if (!res.success) this.setToast(res.reason ?? "Could not deliver fish");
          else if (res.completed) this.setToast(`Contract complete: +${res.rewardMoney} G`, 3600);
          else this.setToast("Fish delivered to contract");
        },
        onQuickSave: () => {
          void this.handleQuickSave();
        },
        onCastFishing: () => {
          this.handleCastFishing();
        },
        onResetPlayerToSafePlace: () => {
          this.handleResetPlayerToSafePlace();
        },
        onAdvanceHours: (hours: number) => {
          this.sim.tick(hours * 60);
        },
        onGrantMoney: (amount: number) => {
          this.sim.grantDebugMoney(amount);
        },
        onToggleWeather: () => {
          const current = this.sim.state.weather.type;
          this.sim.setDebugWeather(current === "clear" ? "light-rain" : "clear");
        },
        onSpawnSchool: () => {
          this.sim.spawnFishSchool("lake", -30, 45, ["fish.trout"]);
        }
      })
    );
  }

  private onResize = (): void => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.worldScene.handleResize(width, height);
    this.gameCamera.handleResize(width, height);
  };
}
