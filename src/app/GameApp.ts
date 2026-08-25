// src/app/GameApp.ts

import * as THREE from "three";
import React from "react";
import ReactDOM from "react-dom/client";
import { Simulation } from "../simulation/Simulation";
import { WorldScene, type BoatPresentationInput } from "../render/scene/WorldScene";
import { GameCamera } from "../render/camera/GameCamera";
import { InputRouter } from "../input/InputRouter";
import { IndexedDbSaveRepository } from "../persistence/IndexedDbSaveRepository";
import { GameAction, MarketId, ProcessingJobState, FishCargoState } from "../simulation/core/types";

import { GameUI } from "../ui/GameUI";
import { InventoryManager } from "../simulation/inventory/InventoryManager";
import { AssetLoader } from "../render/loaders/AssetLoader";
import { applyOfflineProgression } from "../persistence/offlineDelta";
import { ContentRegistry } from "../content/ContentRegistry";
import { PhysicsWorld } from "../physics/PhysicsWorld";
import { WorldLayout } from "../world/WorldLayout";
import { HARBOR_DOCK, HARBOR_FISH_TABLE, VILLAGE_MARKET, WORLD_SPAWN } from "../world/WorldAnchors";
import {
  farmLocalToWorld,
  getFarmLayout,
  isPointInsideRect,
  STARTER_FARM_LAYOUT,
  worldToFarmLocal
} from "../world/FarmLayout";
import {
  FARMHOUSE_INTERIOR_DOOR,
  FARMHOUSE_OUTSIDE_DOOR
} from "../world/FarmhouseInterior";
import { ActiveModal, GameplayMode, ModeController } from "./ModeController";
import type {
  CropInspectionDto,
  CropPlacementResult,
  InteractionResult,
  InteractionTarget
} from "../simulation/core/contracts";
import {
  FarmingActionController,
  type FarmingActionSnapshot,
  type FarmingPresentationAction
} from "./FarmingActionController";
import { gameAudio, type AudioCueId } from "../audio/AudioManager";
import {
  InteractionTargetResolver,
  type ResolvedInteractionTarget
} from "./InteractionTargetResolver";
import {
  PlayerPresentationBuffer,
  type PresentedPlayerFrame
} from "../render/presentation/PlayerPresentationBuffer";

interface FishingHoldInput {
  isReeling: boolean;
  isSlacking: boolean;
  isBracing: boolean;
}

interface ArtViewPreset {
  playerPose: { x: number; y: number; z: number; rotationY: number };
  cameraPosition: { x: number; y: number; z: number };
  cameraTarget: { x: number; y: number; z: number };
  fovDegrees: number;
}

type DebugStartScenario =
  | "farm"
  | "farm-art"
  | "motion-capture"
  | "farmhouse-north"
  | "farmhouse-south"
  | "harbor"
  | "boat-driving"
  | "sport-fishing";

const DEBUG_START_SCENARIOS = new Set<DebugStartScenario>([
  "farm",
  "farm-art",
  "motion-capture",
  "farmhouse-north",
  "farmhouse-south",
  "harbor",
  "boat-driving",
  "sport-fishing"
]);

const ART_VIEW_PRESETS: Readonly<Record<string, ArtViewPreset>> = {
  bridge: {
    playerPose: { x: -24, y: 1.4, z: -7, rotationY: 0 },
    cameraPosition: { x: -34, y: 13.5, z: 15 },
    cameraTarget: { x: -14, y: 1.7, z: -7 },
    fovDegrees: 47
  },
  farm: {
    playerPose: { x: -65, y: 1.2, z: -60.5, rotationY: 0 },
    cameraPosition: { x: -40, y: 15.5, z: -80 },
    cameraTarget: { x: -64, y: 1.5, z: -54.5 },
    fovDegrees: 47
  },
  "farm-close": {
    playerPose: { x: -65, y: 1.2, z: -60.5, rotationY: 0 },
    cameraPosition: { x: -65, y: 11.5, z: -36 },
    cameraTarget: { x: -65, y: 1.2, z: -55.2 },
    fovDegrees: 48
  },
  harbor: {
    playerPose: { x: 56, y: 1.2, z: 51, rotationY: 0 },
    cameraPosition: { x: 101, y: 18.5, z: 100 },
    cameraTarget: { x: 73, y: 1.8, z: 70 },
    fovDegrees: 49
  },
  coast: {
    playerPose: { x: -68, y: 5, z: 54, rotationY: 0 },
    cameraPosition: { x: -129, y: 30, z: 111 },
    cameraTarget: { x: -92, y: 13.8, z: 74 },
    fovDegrees: 50
  },
  "sport-fishing": {
    playerPose: { x: 76, y: 1.1, z: 64, rotationY: 0 },
    cameraPosition: { x: 101, y: 13.5, z: 96 },
    cameraTarget: { x: 81, y: 1.0, z: 72 },
    fovDegrees: 43
  }
};

export class GameApp {
  public sim: Simulation;
  public worldScene: WorldScene;
  public gameCamera: GameCamera;
  public inputRouter: InputRouter;
  public saveRepo: IndexedDbSaveRepository;
  private physicsWorld: PhysicsWorld | null = null;

  private readonly modeController = new ModeController();
  private promptText: string | null = null;
  private toastText: string | null = null;
  private toastUntilMs: number = 0;
  private activeMarketId: MarketId | null = null;
  private selectedCropId: string = "crop.wheat";
  private placementResult: CropPlacementResult | null = null;
  private frozenPlacementResult: CropPlacementResult | null = null;
  private inspectedCrop: CropInspectionDto | null = null;
  private readonly farmingActions: FarmingActionController;
  private readonly interactionResolver = new InteractionTargetResolver();
  private farmingActionSnapshot: FarmingActionSnapshot | null = null;
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
  private benchmarkView: boolean = false;
  private benchmarkCameraView: ArtViewPreset | null = null;
  private benchmarkLightingFocus: THREE.Vector3 | null = null;
  private benchmarkPresentationTimeSeconds: number | null = null;
  private persistenceDisabled: boolean = false;
  private durableWritesEnabled: boolean = false;
  private saveRecoveryReason: "corrupt" | "unavailable" | null = null;
  private readonly movementIntent = { x: 0, z: 0 };
  private readonly playerPresentation = new PlayerPresentationBuffer();
  private lastPresentedPlayer: PresentedPlayerFrame | null = null;
  private lockedInteractionTarget: ResolvedInteractionTarget | null = null;
  private footstepVariant = false;
  private readonly audioForward = new THREE.Vector3();
  private readonly canvasContainer: HTMLElement;
  private readonly resizeObserver: ResizeObserver;
  private doorTransitionFade: boolean = false;
  private isTransitioningDoor: boolean = false;
  private activeDialogueNpcId: string | null = null;
  private activeHint: { hintId: string; title: string; message: string; icon?: string } | null = null;
  private isFarmGisHeld: boolean = false;
  private pendingCatchCargo: FishCargoState | null = null;
  private activeToolSlot: number = 1;

  private handleTalkNpc = (npcId: string) => this.sim.questDomain.talkToNpc(npcId);

  private uiRoot: ReactDOM.Root | null = null;


  constructor(canvas: HTMLCanvasElement, uiContainer: HTMLElement) {
    const debugActionTiming = import.meta.env.DEV
      ? Number(new URLSearchParams(window.location.search).get("debugActionTimeScale"))
      : Number.NaN;
    this.farmingActions = new FarmingActionController(
      Number.isFinite(debugActionTiming) && debugActionTiming >= 1 && debugActionTiming <= 10
        ? debugActionTiming
        : 1
    );
    this.canvasContainer = canvas.parentElement ?? canvas;
    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.sim = new Simulation();
    this.worldScene = new WorldScene(canvas);
    this.gameCamera = new GameCamera(window.innerWidth / window.innerHeight);
    this.inputRouter = new InputRouter();
    this.saveRepo = new IndexedDbSaveRepository();
    this.attachSimulationFeedback();

    this.uiRoot = ReactDOM.createRoot(uiContainer);
    window.addEventListener("resize", this.onResize);
    this.resizeObserver.observe(this.canvasContainer);
    document.addEventListener("visibilitychange", this.onVisibilityChange);

    this.setupInputHandlers();
  }

  private get mode(): GameplayMode {
    return this.modeController.mode;
  }

  private get activeModal(): ActiveModal {
    return this.modeController.activeModal;
  }

  private setGameplayMode(mode: GameplayMode): void {
    if (mode === "farm-placement" && (this.sim.state.sportFishing || this.sim.state.basicFishing)) {
      return;
    }
    if (mode !== this.mode) this.cancelFarmingAction();
    this.modeController.setGameplayMode(mode);
    this.inputRouter.setMode(mode);
    if (mode !== "farm-placement") this.clearPlacementPreview();
  }

  private syncOverlayState(): void {
    this.sim.clock.setPaused(this.benchmarkView || this.modeController.pausesSimulation);
    this.inputRouter.setWorldInputSuspended(this.modeController.blocksWorldInput || this.benchmarkView);
    if (this.activeModal !== "market") this.activeMarketId = null;
  }

  private setActiveModal(modal: ActiveModal): void {
    if (modal) this.cancelFarmingAction();
    if (modal === null) this.activeDialogueNpcId = null;
    if (modal === null) this.modeController.closeActive();
    else this.modeController.open(modal);
    this.syncOverlayState();
  }

  public async start(): Promise<void> {
    const query = new URLSearchParams(window.location.search);
    const benchmarkPreset = import.meta.env.DEV ? query.get("artView") : null;
    const debugStartParameter = import.meta.env.DEV ? query.get("debugStart") : null;
    const debugStart = debugStartParameter && DEBUG_START_SCENARIOS.has(debugStartParameter as DebugStartScenario)
      ? debugStartParameter as DebugStartScenario
      : null;
    this.persistenceDisabled = Boolean(benchmarkPreset || debugStart);
    // 1. Try loading existing save. Never keep a silent writable new game
    // over a failed/unreadable slot — that would let autosave wipe it.
    if (!this.persistenceDisabled) {
      const loaded = await this.saveRepo.loadGameResult();
      if (loaded.status === "loaded") {
        applyOfflineProgression(loaded.envelope.state, Date.now());
        this.sim = new Simulation(loaded.envelope.state);
        this.attachSimulationFeedback();
        this.durableWritesEnabled = true;
        this.requestAutosave();

        this.modeController.restoreFromState(loaded.envelope.state);
        this.inputRouter.setMode(this.mode);
        this.sim.clock.setPaused(false);
        this.syncOverlayState();

        console.info("[GameApp] Loaded existing game save from IndexedDB.");
      } else if (loaded.status === "empty") {
        this.durableWritesEnabled = true;
      } else {
        this.durableWritesEnabled = false;
        this.saveRecoveryReason = loaded.status;
        this.modeController.open("new-game-confirm");
        this.syncOverlayState();
      }
    }

    if (debugStart) this.applyDebugStartScenario(debugStart);

    const benchmarkCameraView = benchmarkPreset ? ART_VIEW_PRESETS[benchmarkPreset] : undefined;
    if (benchmarkCameraView) {
      this.sim.setDebugPlayerPose(benchmarkCameraView.playerPose);
      const minuteParameter = query.get("artMinute");
      const minute = minuteParameter === null ? Number.NaN : Number(minuteParameter);
      if (Number.isSafeInteger(minute) && minute >= 0) this.sim.setDebugMinute(minute);
      const weather = query.get("artWeather");
      if (["clear", "cloudy", "light-rain", "heavy-rain", "windy", "fog", "storm"].includes(weather ?? "")) {
        this.sim.setDebugWeather(weather as Parameters<Simulation["setDebugWeather"]>[0]);
      }
      const presentationTimeParameter = query.get("artTimeSeconds");
      const presentationTime = presentationTimeParameter === null
        ? Number.NaN
        : Number(presentationTimeParameter);
      if (Number.isFinite(presentationTime) && presentationTime >= 0) {
        this.benchmarkPresentationTimeSeconds = presentationTime;
      }
      if (benchmarkPreset === "sport-fishing") {
        if (!this.sim.startDebugSportFishing("lake", 29, 45, "fish.trout")) {
          throw new Error("Could not prepare deterministic sport-fishing art view");
        }
        this.modeController.restoreFromState(this.sim.state);
        this.inputRouter.setMode(this.mode);
      }
      this.benchmarkView = true;
      this.benchmarkCameraView = benchmarkCameraView;
      this.benchmarkLightingFocus = new THREE.Vector3(
        benchmarkCameraView.cameraTarget.x,
        benchmarkCameraView.cameraTarget.y,
        benchmarkCameraView.cameraTarget.z
      );
      this.syncOverlayState();
    }

    // 2. Preload 3D assets
    await Promise.all([AssetLoader.preloadAll(), this.worldScene.ready(this.sim.state.worldSeed)]);
    this.physicsWorld = await PhysicsWorld.create(this.worldScene.staticCollisionProxies());
    this.playerPresentation.reset(this.sim.state.player);

    // 3. Start render loop
    this.isRunning = true;
    this.lastTimeMs = performance.now();
    this.lastAutosaveMs = this.lastTimeMs;
    this.onResize();
    requestAnimationFrame(this.loop);
  }

  private applyDebugStartScenario(scenario: DebugStartScenario): void {
    const poseFor = (x: number, z: number, rotationY: number = 0) => ({
      x,
      y: WorldLayout.terrainHeight(x, z) + 0.5,
      z,
      rotationY
    });
    switch (scenario) {
      case "farm":
        this.sim.setDebugPlayerPose(poseFor(WORLD_SPAWN.playerPosition.x, WORLD_SPAWN.playerPosition.z));
        break;
      case "farm-art":
        this.sim.prepareDebugStarterTrioArtReview();
        this.sim.setDebugPlayerPose(poseFor(STARTER_FARM_LAYOUT.origin.x, STARTER_FARM_LAYOUT.origin.z - 5.4));
        break;
      case "motion-capture":
        this.sim.prepareDebugMotionCaptureCrop();
        this.sim.setDebugPlayerPose(poseFor(WORLD_SPAWN.playerPosition.x, WORLD_SPAWN.playerPosition.z));
        break;
      case "farmhouse-south": {
        const farmhouse = WorldLayout.landmark("farmhouse");
        this.sim.setDebugPlayerPose(poseFor(farmhouse.x - 5.6, farmhouse.z));
        break;
      }
      case "farmhouse-north": {
        const farmhouse = WorldLayout.landmark("farmhouse");
        this.sim.setDebugPlayerPose(poseFor(farmhouse.x - 5.6, farmhouse.z));
        break;
      }
      case "harbor":
        this.sim.setDebugPlayerPose(poseFor(
          HARBOR_DOCK.playerPosition.x,
          HARBOR_DOCK.playerPosition.z
        ));
        break;
      case "boat-driving":
        if (!this.sim.setDebugBoatDriving("boat.player_rowboat", {
          x: HARBOR_DOCK.boatPosition.x + 8,
          z: HARBOR_DOCK.boatPosition.z + 10,
          headingRadians: 0
        })) {
          throw new Error("Could not prepare deterministic boat-driving debug start");
        }
        break;
      case "sport-fishing":
        this.sim.setDebugPlayerPose(poseFor(HARBOR_DOCK.playerPosition.x, HARBOR_DOCK.playerPosition.z));
        if (!this.sim.startDebugSportFishing("lake", 29, WorldLayout.coastlineZ(29) + 6, "fish.trout")) {
          throw new Error("Could not prepare deterministic sport-fishing debug start");
        }
        break;
    }
    this.modeController.restoreFromState(this.sim.state);
    this.inputRouter.setMode(this.mode);
    this.syncOverlayState();
  }

  private setupInputHandlers(): void {
    this.inputRouter.onAction((action: GameAction) => {
      if (this.modeController.blocksHudOverlaysAndTools && action !== "pause") return;
      switch (action) {
        case "interact":
          if (this.mode === "sport-fishing" || this.activeModal) return;
          if (this.mode === "farm-placement") this.confirmCropPlacement();
          else this.handleContextInteract();
          break;
        case "use-primary":
          if (this.activeModal) return;
          if (this.mode === "farm-placement") this.confirmCropPlacement();
          else if (this.mode === "on-foot" || this.mode === "boat-driving") this.handleContextInteract();
          break;
        case "use-secondary":
          if (this.activeModal) return;
          if (this.mode === "farm-placement") this.exitCropPlacement();
          else if (this.mode === "on-foot") this.inspectPointedCrop();
          break;
        case "pause":
          if (this.farmingActions.isActive) {
            this.cancelFarmingAction();
            return;
          }
          if (this.mode === "farm-placement") {
            this.exitCropPlacement();
            return;
          }
          this.modeController.handleEscape();
          this.syncOverlayState();
          break;
        case "open-inventory":
          this.modeController.toggle("inventory");
          this.syncOverlayState();
          break;
        case "open-journal":
          this.modeController.toggle("journal");
          this.syncOverlayState();
          break;
        case "open-map":
          this.modeController.toggle("map");
          this.syncOverlayState();
          break;
        case "open-ledger":
          this.modeController.toggle("ledger");
          this.syncOverlayState();
          break;
        case "open-planning":
          if (!this.sim.state.quests.unlockedFeatureIds.includes("feature.expedition_planner")) {
            this.setToast("Complete your first expedition to unlock the planner");
            break;
          }
          this.modeController.toggle("expedition");
          this.syncOverlayState();
          break;
        case "toggle-farm-gis":
          this.isFarmGisHeld = !this.isFarmGisHeld;
          this.worldScene.setFarmGisMode(this.isFarmGisHeld);
          break;
        case "select-tool-1":
          this.selectToolSlot(1);
          break;
        case "select-tool-2":
          this.selectToolSlot(2);
          break;
        case "select-tool-3":
          this.selectToolSlot(3);
          break;
        case "select-tool-4":
          this.selectToolSlot(4);
          break;
        case "select-tool-5":
          this.selectToolSlot(5);
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
    this.inputRouter.onInterruption(() => this.cancelFarmingAction());
  }

  private attachSimulationFeedback(): void {
    for (const dispose of this.simulationFeedbackDisposers) dispose();
    this.simulationFeedbackDisposers = [
      this.sim.events.on("FishLanded", ({ speciesId, weightKg }) => {
        const speciesName = ContentRegistry.fishSpecies.get(speciesId)?.name ?? "fish";
        this.setToast(`Landed ${weightKg.toFixed(1)} kg ${speciesName}`, 3600);
        const carriedId = this.sim.state.player.carriedFishCargoId;
        if (carriedId && this.sim.state.fishCargo[carriedId]) {
          this.pendingCatchCargo = this.sim.state.fishCargo[carriedId];
        }
      }),
      this.sim.events.on("FishEscaped", ({ reason }) => {
        this.setToast(reason === "snapped" ? "The line snapped" : "The fish slipped free", 3200);
      }),
      this.sim.events.on("BasicFishingStarted", ({ castPower }) => {
        this.setToast(`Line cast (${Math.round((castPower || 0.75) * 100)}% power)…`, 1800);
      }),
      this.sim.events.on("BasicFishingBiteAlert", () => {
        this.setToast("✨ BITE! Hook it now!", 1400);
      }),
      this.sim.events.on("BasicFishingMinigameStarted", ({ hasTreasure }) => {
        this.setToast(hasTreasure ? "🎁 Sunken treasure spotted!" : "Reel it in!", 1800);
        this.worldScene.playPlayerAction("reel");
      }),
      this.sim.events.on("BasicFishingResolved", ({ catchItemId, quality, isPerfect, reason }) => {
        if (catchItemId) {
          const qualText = quality && quality !== "normal" ? ` (${quality.toUpperCase()})` : "";
          const perfText = isPerfect ? " [PERFECT!]" : "";
          this.setToast(`Caught ${ContentRegistry.items.get(catchItemId)?.name ?? "a fish"}${qualText}${perfText}!`, 3000);
        } else if (reason === "inventory-full") {
          this.setToast("Your backpack is full; the fish got away", 2800);
        } else if (reason === "escaped") {
          this.setToast("The fish got away!", 2200);
        } else if (reason === "cancelled") {
          // Silent or brief cancel toast
        } else {
          this.setToast("Nothing bit this time", 2200);
        }
      }),
      this.sim.events.on("ContractCompleted", ({ rewardMoney }) => {
        this.setToast(`Contract complete: +${rewardMoney} G`, 3600);
      }),
      this.sim.events.on("BoatBoarded", () => this.setToast("Aboard the rowboat", 1800)),
      this.sim.events.on("BoatDocked", () => this.setToast("Docked at harbor", 2200)),
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
      this.sim.events.on("SeedPurchased", () => this.requestAutosave()),
      this.sim.events.on("FishSold", () => this.requestAutosave()),
      this.sim.events.on("ContractCompleted", () => this.requestAutosave()),
      this.sim.events.on("QuestStarted", () => this.requestAutosave()),
      this.sim.events.on("QuestProgressed", () => this.requestAutosave()),
      this.sim.events.on("QuestCompleted", () => this.requestAutosave())
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

    // Apply mouse orbit before fixed-step movement so simultaneous WASD uses
    // the camera basis that will be rendered in this same frame.
    const cameraInput = this.inputRouter.consumeCameraInput();
    if (!this.benchmarkCameraView) this.gameCamera.applyInput(this.mode, cameraInput);

    // 0. Fishing hold input every frame (source of truth for sport / basic fishing minigames)
    if (this.mode === "sport-fishing") {
      this.applySportFishingInput();
    } else if (this.mode === "basic-fishing") {
      this.applyBasicFishingInput();
    }

    // 1. Fixed-step physics resolves terrain, structure and shoreline collision.
    this.physicsAccumulatorSeconds = Math.min(0.2, this.physicsAccumulatorSeconds + deltaSeconds);
    while (this.physicsWorld && this.physicsAccumulatorSeconds >= 1 / 60) {
      this.updateMovement(1 / 60, nowMs / 1000);
      this.physicsAccumulatorSeconds -= 1 / 60;
    }

    // 2. Cross authored action commit markers before advancing simulation time.
    this.farmingActions.update(nowMs);
    this.farmingActionSnapshot = this.farmingActions.snapshot(nowMs);

    // 3. Tick Authoritative Simulation
    this.sim.tick(deltaSeconds);
    if (nowMs - this.lastAutosaveMs >= 60_000) {
      this.requestAutosave();
    }

    // 4. Synchronize 3D Visuals
    const state = this.sim.getState();
    const presentationTimeSeconds = this.benchmarkPresentationTimeSeconds ?? nowMs / 1000;
    const presentedPlayer = this.playerPresentation.sample(
      this.physicsAccumulatorSeconds * 60,
      deltaSeconds
    ) ?? {
      ...state.player,
      motion: {
        velocity: { x: 0, y: 0, z: 0 },
        speedMetersPerSecond: 0,
        accelerationMetersPerSecondSquared: 0,
        turnRateRadiansPerSecond: 0,
        isGrounded: state.player.traversal.isGrounded,
        isCollisionBlocked: false,
        requestedGait: "idle" as const
      }
    };
    const playerPos = new THREE.Vector3(presentedPlayer.x, presentedPlayer.y, presentedPlayer.z);
    this.lastPresentedPlayer = presentedPlayer;
    const activeBoat = state.player.activeBoatId
      ? state.boats[state.player.activeBoatId]
      : undefined;
    const presentationInput = this.inputRouter.getInputState();
    const boatPresentationInput: BoatPresentationInput | null =
      this.mode === "boat-driving" && activeBoat
        ? {
            boatId: activeBoat.id,
            boatTypeId: activeBoat.boatTypeId,
            throttle: -presentationInput.moveVector.z,
            steering: presentationInput.moveVector.x
          }
        : null;
    void this.worldScene.syncWithSimulation(
      this.sim,
      presentationTimeSeconds,
      presentedPlayer,
      boatPresentationInput
    );
    for (const event of this.worldScene.drainPlayerAnimationEvents()) {
      if (event.name !== "footstep_left" && event.name !== "footstep_right") continue;
      this.footstepVariant = !this.footstepVariant;
      gameAudio.playOneShot(this.footstepVariant ? "footstep-dirt-a" : "footstep-dirt-b", {
        x: presentedPlayer.x,
        y: presentedPlayer.y,
        z: presentedPlayer.z
      });
    }
    this.worldScene.updateEnvironment(
      this.sim.getState(),
      presentationTimeSeconds,
      this.benchmarkLightingFocus ?? playerPos
    );

    // 5. Update Camera, then resolve ray-originated world targets.
    if (this.benchmarkCameraView) {
      this.gameCamera.setFixedView(
        this.benchmarkCameraView.cameraPosition,
        this.benchmarkCameraView.cameraTarget,
        this.benchmarkCameraView.fovDegrees
      );
    } else {
      this.gameCamera.update(
        playerPos,
        this.mode,
        deltaSeconds,
        undefined,
        this.physicsWorld ?? undefined
      );
    }
    this.gameCamera.camera.getWorldDirection(this.audioForward);
    gameAudio.setListener(this.gameCamera.camera.position, this.audioForward);
    this.updateCropPlacementPreview();
    this.evaluateInteractionTarget();

    // 6. Render 3D Scene
    this.worldScene.render(this.gameCamera.camera);

    // 7. Render 2D UI Overlay
    this.renderUI();

    requestAnimationFrame(this.loop);
  };

  private isMovementFrozen(): boolean {
    return (
      this.sim.clock.isPaused() ||
      this.mode === "basic-fishing" ||
      this.mode === "sport-fishing" ||
      this.farmingActions.isActive ||
      this.modeController.blocksWorldInput
    );
  }

  private updateMovement(deltaSeconds: number, timeSeconds: number): void {
    const input = this.inputRouter.getInputState();
    const isMoving = Math.abs(input.moveVector.x) > 0.001 || Math.abs(input.moveVector.z) > 0.001;
    if (isMoving && this.farmingActions.isActive) this.cancelFarmingAction();
    if (this.isMovementFrozen()) {
      this.playerPresentation.pushCanonicalPose(this.sim.state.player);
      return;
    }

    if (this.physicsWorld) {
      const movement = this.mode === "boat-driving"
        ? input.moveVector
        : this.gameCamera.cameraRelativeMovement(input.moveVector, this.movementIntent);
      const result = this.physicsWorld.step(
        this.sim.getState(),
        {
          x: movement.x,
          z: movement.z,
          sprint: input.sprint,
          jumpRequested: this.inputRouter.consumeJumpRequest()
        },
        this.mode,
        deltaSeconds,
        timeSeconds
      );
      const commit = this.sim.execute({ type: "physics.commit", frame: result.frame });
      if (!commit.success) this.setToast(commit.reason ?? "Movement could not be resolved");
      else this.playerPresentation.push(result.frame.player, result.playerMotion);
    }
  }

  private applySportFishingInput(): void {
    if (this.mode !== "sport-fishing" || !this.sim.activeFishingEncounter) return;

    const input = this.inputRouter.getInputState();
    const fishing = input.fishing;

    const hud = this.hudFishingHold;
    this.sim.execute({
      type: "fishing.control",
      input: {
        isReeling: fishing.isReeling || hud.isReeling,
        isSlacking: fishing.isSlacking || hud.isSlacking,
        isBracing: fishing.isBracing || hud.isBracing,
        rodDirectionAngle: fishing.rodDirectionAngle
      }
    });
  }

  private applyBasicFishingInput(): void {
    if (this.mode !== "basic-fishing" || !this.sim.state.basicFishing) return;
    const input = this.inputRouter.getInputState();
    if (input.fishing.isReeling !== this.sim.state.basicFishing.isHolding) {
      this.sim.execute({
        type: "fishing.control-basic",
        isHolding: input.fishing.isReeling
      });
    }
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

  public openDialogueModal(npcId: string): void {
    if (this.mode === "basic-fishing") return;
    this.activeDialogueNpcId = npcId;
    this.setActiveModal("dialogue");
    gameAudio.playOneShot("pickup");
  }


  public showContextualHint(
    hintId: string,
    title: string,
    message: string,
    icon: string = "💡"
  ): void {
    if (this.sim.questDomain.isHintShown(hintId)) return;
    this.activeHint = { hintId, title, message, icon };
    this.sim.questDomain.recordHintShown(hintId);
  }


  private findStationJob(stationId: string): ProcessingJobState | undefined {
    return Object.values(this.sim.state.processingJobs).find(
      (job) => job.stationId === stationId && (job.status === "active" || job.status === "complete")
    );
  }

  private stationInteraction(
    stationId: string,
    idlePrompt: string,
    collectPrompt: string
  ): Pick<InteractionTarget, "action" | "prompt"> {
    const job = this.findStationJob(stationId);
    if (job?.status === "complete") {
      return { action: "collect-processing", prompt: collectPrompt };
    }
    if (job?.status === "active") {
      return { action: "inspect", prompt: "Job in progress..." };
    }
    return { action: "start-processing", prompt: idlePrompt };
  }

  private resolveCropTarget(cropId: string): ResolvedInteractionTarget | null {
    const crop = this.sim.state.crops[cropId];
    if (!crop) return null;
    const inspection = this.sim.inspectCrop(cropId);
    if (!inspection) return null;
    const world = farmLocalToWorld(crop.farmId, crop);
    const player = this.sim.state.player;
    const distanceMeters = Math.hypot(player.x - world.x, player.z - world.z);
    if (distanceMeters > 2.5) return null;

    const workWarning = inspection.work.current <= 0 ? " · Reduced XP and rare chance" : "";
    const farm = this.sim.state.farms[crop.farmId];
    const inventory = this.sim.state.inventories[this.sim.state.player.inventoryId];
    const canFertilize = Boolean(
      farm &&
      farm.soil.fertility < 100 &&
      InventoryManager.hasItems(inventory, [{ itemId: "item.basic_fertilizer", quantity: 1 }])
    );
    if (inspection.actions.canHarvest) {
      return {
        id: `crop:${crop.id}:harvest`,
        entityId: crop.id,
        kind: "crop",
        action: "harvest",
        distanceMeters,
        priority: 0,
        worldPosition: { x: world.x, y: WorldLayout.terrainHeight(world.x, world.z), z: world.z },
        modes: ["on-foot"],
        requiresLineOfSight: true,
        prompt: `[E] Harvest ${inspection.name} · Right-click inspect${workWarning}`
      };
    }
    if (inspection.actions.canWater) {
      return {
        id: `crop:${crop.id}:water`,
        entityId: crop.id,
        kind: "crop",
        action: "water",
        distanceMeters,
        priority: 0,
        worldPosition: { x: world.x, y: WorldLayout.terrainHeight(world.x, world.z), z: world.z },
        modes: ["on-foot"],
        requiresLineOfSight: true,
        prompt: `[E] Water ${inspection.name} · Right-click inspect${workWarning}`
      };
    }
    if (canFertilize) {
      return {
        id: `crop:${crop.id}:fertilize`,
        entityId: crop.farmId,
        kind: "planting-plot",
        action: "fertilize",
        distanceMeters,
        priority: 0,
        worldPosition: { x: world.x, y: WorldLayout.terrainHeight(world.x, world.z), z: world.z },
        modes: ["on-foot"],
        requiresLineOfSight: true,
        prompt: `[E] Fertilize soil · Right-click inspect${workWarning}`
      };
    }
    return {
      id: `crop:${crop.id}:inspect`,
      entityId: crop.id,
      kind: "crop",
      action: "inspect",
      distanceMeters,
      priority: 0,
      worldPosition: { x: world.x, y: WorldLayout.terrainHeight(world.x, world.z), z: world.z },
      modes: ["on-foot"],
      requiresLineOfSight: true,
      prompt: `Right-click to inspect ${inspection.name}`
    };
  }

  private pickInteraction(): ResolvedInteractionTarget | null {
    const p = this.sim.state.player;
    const candidates: ResolvedInteractionTarget[] = [];

    // Pointer and center hints feed the same stable proximity/facing resolver used by E and LMB.
    const pointer = this.inputRouter.getInputState().pointerNdc;
    const pointedCropId = this.worldScene.pickCrop(this.gameCamera.camera, pointer);
    const centeredCropId = this.worldScene.pickCrop(this.gameCamera.camera, { x: 0, y: 0 });

    for (const crop of Object.values(this.sim.state.crops)) {
      const candidate = this.resolveCropTarget(crop.id);
      if (candidate) candidates.push(candidate);
    }

    const stationDefinitions = [
      {
        stationId: "struct.starter_mill",
        recipeId: "recipe.wheat_to_grain",
        idlePrompt: "[E] Mill Wheat",
        collectPrompt: "[E] Collect Ground Grain"
      },
      {
        stationId: "struct.workbench",
        recipeId: "recipe.craft_chum",
        idlePrompt: "[E] Mix Chum",
        collectPrompt: "[E] Collect Chum"
      },
      {
        stationId: "struct.starter_compost",
        recipeId: "recipe.compost_worms",
        idlePrompt: "[E] Cultivate Bait Worms",
        collectPrompt: "[E] Collect Bait Worms"
      },
      this.fishTableStationDefinition()
    ];
    for (const definition of stationDefinitions) {
      const structure = this.sim.state.world.structures[definition.stationId];
      if (!structure) continue;
      const distanceMeters = Math.hypot(p.x - structure.x, p.z - structure.z);
      if (distanceMeters > 2.8) continue;
      const interaction = this.stationInteraction(
        definition.stationId,
        definition.idlePrompt,
        definition.collectPrompt
      );
      candidates.push({
        id: `station:${definition.stationId}:${interaction.action}`,
        kind: "station",
        action: interaction.action,
        distanceMeters,
        priority: 1,
        worldPosition: this.structureInteractPosition(structure),
        modes: ["on-foot"],
        requiresLineOfSight: true,
        prompt: interaction.prompt,
        stationId: definition.stationId,
        recipeId: definition.recipeId
      });
    }

    if (this.mode === "on-foot") {
      const inventory = this.sim.state.inventories[p.inventoryId];
      const hasFertilizer = InventoryManager.hasItems(inventory, [{ itemId: "item.basic_fertilizer", quantity: 1 }]);
      if (hasFertilizer) {
        for (const farm of Object.values(this.sim.state.farms)) {
          if (farm.soil.fertility >= 100) continue;
          const layout = getFarmLayout(farm.id);
          if (!layout) continue;
          const local = worldToFarmLocal(farm.id, p);
          if (!isPointInsideRect(local, layout.farmBounds, 2.5)) continue;
          const world = farmLocalToWorld(farm.id, local);
          candidates.push({
            id: `farm:${farm.id}:fertilize`,
            entityId: farm.id,
            kind: "planting-plot",
            action: "fertilize",
            distanceMeters: 0,
            priority: 2,
            worldPosition: { x: world.x, y: WorldLayout.terrainHeight(world.x, world.z), z: world.z },
            modes: ["on-foot"],
            requiresLineOfSight: false,
            prompt: "[E] Fertilize soil"
          });
        }
      }
    }

    const produceStall = { ...VILLAGE_MARKET.position, radiusMeters: VILLAGE_MARKET.radiusMeters };
    const produceStallDistance = Math.hypot(p.x - produceStall.x, p.z - produceStall.z);
    if (produceStallDistance <= produceStall.radiusMeters) {
      candidates.push({
        id: "market:market.village:trade",
        kind: "market",
        action: "trade",
        distanceMeters: produceStallDistance,
        priority: 1,
        worldPosition: {
          x: produceStall.x,
          y: WorldLayout.terrainHeight(produceStall.x, produceStall.z),
          z: produceStall.z
        },
        modes: ["on-foot"],
        requiresLineOfSight: true,
        prompt: "[E] Browse the produce stall"
      });
    }

    const fishingHabitat = WorldLayout.nearbyFishingHabitat(p.x, p.z);
    if (fishingHabitat && (this.mode === "on-foot" || this.mode === "boat-driving")) {
      candidates.push({
        id: `fishing-habitat:${fishingHabitat}:cast`,
        kind: "fishing-habitat",
        action: "cast",
        distanceMeters: 0,
        priority: 3,
        modes: ["on-foot", "boat-driving"],
        prompt: "[E] Cast line"
      });
    }

    if (this.mode === "on-foot" && this.sim.canBoardBoat("boat.player_rowboat")) {
      const boat = this.sim.state.boats["boat.player_rowboat"];
      candidates.push({
        id: "dock:harbor:board",
        entityId: boat.id,
        kind: "dock",
        action: "board",
        distanceMeters: Math.hypot(p.x - boat.x, p.z - boat.z),
        priority: 0,
        worldPosition: { x: boat.x, y: boat.y, z: boat.z },
        modes: ["on-foot"],
        // The dock deck sits between its authored shore access point and the
        // boat. NavigationDomain owns and revalidates that access contract.
        requiresLineOfSight: false,
        prompt: "Press [E] to Board Rowboat"
      });
    }
    if (this.mode === "boat-driving" && this.sim.canDockActiveBoat()) {
      const activeBoat = p.activeBoatId ? this.sim.state.boats[p.activeBoatId] : undefined;
      candidates.push({
        id: "dock:harbor:dock",
        entityId: activeBoat?.id,
        kind: "dock",
        action: "dock",
        distanceMeters: 0,
        priority: 0,
        worldPosition: activeBoat
          ? { x: activeBoat.x, y: activeBoat.y, z: activeBoat.z }
          : undefined,
        modes: ["boat-driving"],
        prompt: "Press [E] to Dock & Disembark"
      });
    }

    for (const school of Object.values(this.sim.state.world.activeSchools)) {
      const sDist = Math.hypot(p.x - school.x, p.z - school.z);
      if (sDist < 12.0) {
        const frenzy =
          school.feedingFrenzyUntilMinute && this.sim.state.clock.currentMinute <= school.feedingFrenzyUntilMinute;
        candidates.push({
          id: `school:${school.id}:${frenzy ? "hook" : "chum"}`,
          entityId: school.id,
          kind: "fish-school",
          action: frenzy ? "hook" : "chum",
          distanceMeters: sDist,
          priority: 1,
          worldPosition: {
            x: school.x,
            y: 0,
            z: school.z
          },
          modes: ["on-foot", "boat-driving"],
          prompt: frenzy ? "Press [E] to Hook Sport Fish!" : "Press [E] to Chum School (Chum Bucket)"
        });
      }
    }

    if (this.mode === "on-foot" && !WorldLayout.isInterior(p.x, p.z)) {
      const distToDoor = Math.hypot(p.x - FARMHOUSE_OUTSIDE_DOOR.x, p.z - FARMHOUSE_OUTSIDE_DOOR.z);
      if (distToDoor <= FARMHOUSE_OUTSIDE_DOOR.radiusMeters) {
        candidates.push({
          id: "interior:farmhouse:enter",
          kind: "interior-door",
          action: "enter",
          distanceMeters: distToDoor,
          priority: 0,
          worldPosition: {
            x: FARMHOUSE_OUTSIDE_DOOR.x,
            y: FARMHOUSE_OUTSIDE_DOOR.y,
            z: FARMHOUSE_OUTSIDE_DOOR.z
          },
          modes: ["on-foot"],
          requiresLineOfSight: false,
          prompt: "[E] Enter Home"
        });
      }
    }

    if (this.mode === "on-foot" && WorldLayout.isInterior(p.x, p.z)) {
      const distToDoor = Math.hypot(p.x - FARMHOUSE_INTERIOR_DOOR.x, p.z - FARMHOUSE_INTERIOR_DOOR.z);
      if (distToDoor <= FARMHOUSE_INTERIOR_DOOR.radiusMeters) {
        candidates.push({
          id: "interior:farmhouse:exit",
          kind: "interior-door",
          action: "exit",
          distanceMeters: distToDoor,
          priority: 0,
          worldPosition: {
            x: FARMHOUSE_INTERIOR_DOOR.x,
            y: FARMHOUSE_INTERIOR_DOOR.y,
            z: FARMHOUSE_INTERIOR_DOOR.z
          },
          modes: ["on-foot"],
          requiresLineOfSight: false,
          prompt: "[E] Step Outside"
        });
      }
    }

    if (this.mode === "on-foot") {
      for (const [npcId, npc] of ContentRegistry.npcs.entries()) {
        const distToNpc = Math.hypot(p.x - npc.anchor.x, p.z - npc.anchor.z);
        if (distToNpc <= 3.5) {
          candidates.push({
            id: `npc:${npcId}:talk`,
            kind: "station",
            action: "inspect",
            distanceMeters: distToNpc,
            priority: 0,
            worldPosition: {
              x: npc.anchor.x,
              y: WorldLayout.terrainHeight(npc.anchor.x, npc.anchor.z),
              z: npc.anchor.z
            },
            modes: ["on-foot"],
            requiresLineOfSight: true,
            prompt: `[E] Talk to ${npc.name}`,
            entityId: npcId
          });
        }
      }
    }


    return this.interactionResolver.resolve(candidates, {
      mode: this.mode,
      player: p,
      pointerEntityId: pointedCropId,
      centeredEntityId: centeredCropId,
      hasLineOfSight: this.physicsWorld
        ? (from, to) => this.physicsWorld!.hasLineOfSight(from, to)
        : undefined
    });
  }

  private evaluateInteractionTarget(): void {
    const toast = this.currentToast();
    if (this.activeModal || this.benchmarkView) {
      this.worldScene.setInteractionTargetFeedback(null);
      this.promptText = toast;
      return;
    }
    if (this.mode === "sport-fishing") {
      this.worldScene.setInteractionTargetFeedback(null);
      this.promptText = toast;
      return;
    }

    if (this.mode === "farm-placement") {
      this.worldScene.setInteractionTargetFeedback(null);
      const cropName = ContentRegistry.crops.get(this.selectedCropId)?.name ?? "crop";
      const placementPrompt = this.placementResult?.valid
        ? `[E / Click] Plant ${cropName} · Right-click / Esc cancel`
        : `${this.placementResult?.reason ?? "Point at prepared farm soil"} · Right-click / Esc cancel`;
      this.promptText = toast ?? placementPrompt;
      return;
    }

    const picked = this.farmingActions.isActive && this.lockedInteractionTarget
      ? this.lockedInteractionTarget
      : this.pickInteraction();
    this.worldScene.setInteractionTargetFeedback(picked?.worldPosition ?? null);

    const activeQuest = this.sim.questDomain.getActiveQuestDto();
    if (activeQuest?.targetLocation) {
      this.worldScene.setQuestWaypoint({
        x: activeQuest.targetLocation.x,
        y: WorldLayout.terrainHeight(activeQuest.targetLocation.x, activeQuest.targetLocation.z),
        z: activeQuest.targetLocation.z
      });
    } else {
      this.worldScene.setQuestWaypoint(null);
    }

    if (this.inspectedCrop) {
      this.inspectedCrop = this.sim.inspectCrop(this.inspectedCrop.placedCropId);
    }
    this.promptText = toast ?? (picked ? picked.prompt : null);
  }

  private handleContextInteract(): void {
    if (this.mode === "sport-fishing" || this.farmingActions.isActive) return;

    const picked = this.pickInteraction();
    if (!picked) return;
    this.lockedInteractionTarget = picked;
    if (picked.worldPosition && this.mode !== "boat-driving") {
      this.facePlayerToward(picked.worldPosition.x, picked.worldPosition.z);
    }

    switch (picked.action) {
      case "harvest":
        if (picked.entityId) this.startCropAction("harvest", picked.entityId);
        break;
      case "water":
        if (picked.entityId) this.startCropAction("water", picked.entityId);
        break;
      case "fertilize":
        if (picked.entityId) this.startFertilizeAction(picked.entityId, picked.worldPosition);
        break;
      case "plant":
        this.confirmCropPlacement();
        break;
      case "board":
      case "dock":
        this.toggleBoatBoard();
        break;
      case "chum":
      case "hook":
        if (picked.entityId) this.interactWithSchool(picked.entityId, picked.action);
        break;
      case "start-processing":
      case "collect-processing":
      case "inspect":
        if (picked.id.startsWith("npc:") && picked.entityId) {
          this.openDialogueModal(picked.entityId);
        } else if (picked.kind === "crop" && picked.entityId) {
          this.inspectedCrop = this.sim.inspectCrop(picked.entityId);
        } else if (picked.stationId && picked.recipeId) {
          this.interactWithStation(picked);
        }
        break;
      case "cast":
        this.handleCastFishing();
        break;
      case "trade":
        this.activeMarketId = "market.village";
        this.setActiveModal("market");
        break;
      case "enter":
        this.transitionDoor(FARMHOUSE_INTERIOR_DOOR.enterSpawn, "Entered cozy home");
        break;
      case "exit":
        this.transitionDoor(FARMHOUSE_OUTSIDE_DOOR.exitSpawn, "Stepped outside");
        break;
    }
    if (!this.farmingActions.isActive) this.lockedInteractionTarget = null;
  }

  private transitionDoor(
    toPose: { x: number; y: number; z: number; rotationY: number },
    toastMessage: string
  ): void {
    if (this.isTransitioningDoor) return;
    this.isTransitioningDoor = true;
    this.doorTransitionFade = true;

    setTimeout(() => {
      this.sim.setDebugPlayerPose({
        x: toPose.x,
        y: toPose.y,
        z: toPose.z,
        rotationY: toPose.rotationY
      });
      this.setToast(toastMessage, 2000);
      setTimeout(() => {
        this.doorTransitionFade = false;
        this.isTransitioningDoor = false;
      }, 240);
    }, 240);
  }

  private selectToolSlot(slot: number): void {
    this.activeToolSlot = slot;
    switch (slot) {
      case 1: {
        if (this.mode === "farm-placement") this.exitCropPlacement();
        this.setToast("Equipped: Hand Tools & Hoe", 1600);
        break;
      }
      case 2: {
        const playerInv = this.sim.state.inventories[this.sim.state.player.inventoryId];
        const starterCropIds = ["crop.wheat", "crop.tomato", "crop.potato"];
        let targetCropId: string | null = null;
        for (const cropId of starterCropIds) {
          const crop = ContentRegistry.crops.get(cropId);
          if (crop && playerInv && InventoryManager.getItemCount(playerInv, crop.seedItemId) > 0) {
            targetCropId = crop.id;
            break;
          }
        }
        if (targetCropId) {
          this.enterCropPlacement(targetCropId);
        } else {
          this.setToast("No seeds in backpack. Visit the Village Market to buy seeds.", 2200);
        }
        break;
      }
      case 3: {
        if (this.mode === "farm-placement") this.exitCropPlacement();
        this.setToast("Equipped: Watering Can", 1600);
        break;
      }
      case 4: {
        if (this.mode === "farm-placement") this.exitCropPlacement();
        const playerInv = this.sim.state.inventories[this.sim.state.player.inventoryId];
        const worms = playerInv ? InventoryManager.getItemCount(playerInv, "item.bait_worms") : 0;
        if (worms > 0) {
          this.setToast(`Equipped: Earthworm Bait (${worms} available)`, 1800);
        } else {
          this.setToast("Equipped: Fishing Bait (Empty - dig soil or buy at pier)", 2000);
        }
        break;
      }
      case 5: {
        if (this.mode === "farm-placement") this.exitCropPlacement();
        this.handleCastFishing();
        break;
      }
    }
  }

  private enterCropPlacement(cropId: string): void {
    if (this.sim.state.sportFishing || this.sim.state.basicFishing) return;
    if (!new Set(["crop.wheat", "crop.tomato", "crop.potato"]).has(cropId)) {
      this.setToast("This crop is not available from the starter farm yet");
      return;
    }
    this.selectedCropId = cropId;
    this.inspectedCrop = null;
    this.setGameplayMode("farm-placement");
    const cropName = ContentRegistry.crops.get(cropId)?.name ?? "Crop";
    this.setToast(`${cropName}: point at prepared soil`, 1800);
    this.showContextualHint(
      "hint.farming_plant",
      "Field Cultivation",
      "Left-click tilled soil to plant seeds. Space crops to allow healthy growth!",
      "🌱"
    );
  }


  private updateCropPlacementPreview(): void {
    if (this.mode !== "farm-placement" || this.activeModal || this.farmingActions.isActive) {
      this.clearPlacementPreview();
      return;
    }
    const hit = this.worldScene.raycastTerrain(
      this.gameCamera.camera,
      this.inputRouter.getInputState().pointerNdc
    );
    if (!hit) {
      this.clearPlacementPreview();
      return;
    }
    const result = this.sim.query({
      type: "crop.validate-placement",
      request: {
        farmId: STARTER_FARM_LAYOUT.farmId,
        cropId: this.selectedCropId,
        x: hit.x,
        z: hit.z
      }
    });
    this.placementResult = result as CropPlacementResult;
    this.worldScene.setCropPlacementPreview(this.placementResult);
  }

  private clearPlacementPreview(): void {
    this.placementResult = null;
    this.worldScene.setCropPlacementPreview(null);
  }

  private exitCropPlacement(): void {
    if (this.mode !== "farm-placement") return;
    this.setGameplayMode("on-foot");
    this.frozenPlacementResult = null;
    this.setToast("Planting cancelled", 1400);
  }

  private confirmCropPlacement(): void {
    if (this.mode !== "farm-placement" || this.farmingActions.isActive) return;
    const cropDef = ContentRegistry.crops.get(this.selectedCropId);
    if (!cropDef) {
      this.setToast("Choose seeds from your inventory first");
      return;
    }
    const placement = this.placementResult;
    if (!placement?.valid) {
      this.setToast(placement?.reason ?? "Point at prepared farm soil");
      return;
    }
    this.frozenPlacementResult = { ...placement, footprint: { ...placement.footprint } };
    this.setGameplayMode("on-foot");
    const target = this.frozenPlacementResult;
    this.lockedInteractionTarget = {
      id: `placement:${target.farmId}:${target.worldX.toFixed(3)}:${target.worldZ.toFixed(3)}`,
      kind: "planting-plot",
      action: "plant",
      prompt: `Plant ${cropDef.name}`,
      distanceMeters: Math.hypot(
        target.worldX - this.sim.state.player.x,
        target.worldZ - this.sim.state.player.z
      ),
      priority: 0,
      worldPosition: {
        x: target.worldX,
        y: WorldLayout.terrainHeight(target.worldX, target.worldZ),
        z: target.worldZ
      }
    };
    this.startFarmingAction(
      "plant",
      target.worldX,
      target.worldZ,
      () => {
        const result = this.sim.execute({
          type: "crop.plant",
          request: {
            farmId: target.farmId,
            cropId: target.cropId,
            x: target.worldX,
            z: target.worldZ
          }
        });
        if (result.success) this.setToast(`${cropDef.name} planted`);
        return result;
      }
    );
  }

  private inspectPointedCrop(): void {
    const target = this.pickInteraction();
    const cropId = target?.kind === "crop" ? target.entityId : undefined;
    this.inspectedCrop = cropId ? this.sim.inspectCrop(cropId) : null;
  }

  private cancelFarmingAction(): boolean {
    const cancelled = this.farmingActions.cancelBeforeCommit(performance.now());
    if (cancelled) {
      this.lockedInteractionTarget = null;
      this.setToast("Action cancelled", 1400);
    }
    return cancelled;
  }

  private handleFarmingActionPhase(snapshot: FarmingActionSnapshot): void {
    this.farmingActionSnapshot = snapshot.phase === "completed" || snapshot.phase === "cancelled"
      ? null
      : snapshot;
    if (snapshot.phase === "completed" || snapshot.phase === "cancelled") {
      this.frozenPlacementResult = null;
      this.lockedInteractionTarget = null;
    }
    this.worldScene.setFarmingActionPresentation(
      snapshot.action,
      snapshot.phase,
      performance.now() / 1000
    );
    if (snapshot.phase === "cancelled") {
      this.worldScene.cancelFarmingVfx("water");
      this.worldScene.playPlayerAction("idle");
    }
    this.playFarmingActionAudio(snapshot);
    this.playFarmingActionVfx(snapshot);
    if (snapshot.phase === "started") {
      const animation = snapshot.action === "processing-start"
        ? "workstation"
        : snapshot.action === "processing-collect"
          ? "pickup"
          : snapshot.action;
      this.worldScene.playPlayerAction(animation);
    }
    if (snapshot.phase === "completed" && snapshot.action === "harvest") {
      this.worldScene.playPlayerAction("pickup");
    }
  }

  private playFarmingActionAudio(snapshot: FarmingActionSnapshot): void {
    const position = snapshot.target;
    const play = (cueId: AudioCueId): void => gameAudio.playOneShot(cueId, position);
    if (snapshot.phase === "started" && snapshot.action === "harvest") {
      play("sickle-swish");
      return;
    }
    if (snapshot.phase === "committed") {
      switch (snapshot.action) {
        case "plant":
          play("plant-dirt");
          break;
        case "water":
          play("watering");
          break;
        case "harvest":
          play("harvest-cut");
          play("crop-rustle");
          break;
        case "processing-start":
          play("place");
          play("workstation");
          break;
        case "processing-collect":
          play("pickup");
          break;
      }
      return;
    }
    if (snapshot.phase === "completed" && snapshot.action === "harvest") {
      play("pickup");
    }
  }

  private playFarmingActionVfx(snapshot: FarmingActionSnapshot): void {
    const timeSeconds = performance.now() / 1000;
    const target = snapshot.target;
    if (snapshot.phase === "started" && snapshot.action === "water") {
      const player = this.sim.state.player;
      this.worldScene.spawnFarmingVfx("water", target, timeSeconds, {
        x: player.x,
        y: player.y + 0.92,
        z: player.z
      });
      return;
    }
    if (snapshot.phase === "committed") {
      if (snapshot.action === "plant") this.worldScene.spawnFarmingVfx("dirt", target, timeSeconds);
      if (snapshot.action === "harvest") this.worldScene.spawnFarmingVfx("straw", target, timeSeconds);
      if (snapshot.action === "processing-start") this.worldScene.spawnFarmingVfx("workstation", target, timeSeconds);
      if (snapshot.action === "processing-collect") this.worldScene.spawnFarmingVfx("pickup", target, timeSeconds);
      return;
    }
    if (snapshot.phase === "completed" && snapshot.action === "harvest") {
      this.worldScene.spawnFarmingVfx("pickup", target, timeSeconds);
    }
  }

  private startFarmingAction(
    action: FarmingPresentationAction,
    x: number,
    z: number,
    commit: () => InteractionResult
  ): void {
    this.facePlayerToward(x, z);
    const started = this.farmingActions.start(
      action,
      { x, y: WorldLayout.terrainHeight(x, z), z },
      performance.now(),
      {
        commit: () => {
          const result = commit();
          if (!result.success) this.setToast(result.reason ?? "That action is no longer available");
          return result;
        },
        phaseChanged: (snapshot) => this.handleFarmingActionPhase(snapshot)
      }
    );
    if (!started) {
      this.lockedInteractionTarget = null;
      this.setToast("Finish the current action first");
    }
  }

  private facePlayerToward(x: number, z: number): void {
    const result = this.sim.execute({ type: "player.face-target", x, z });
    if (!result.success) return;
    this.playerPresentation.pushCanonicalPose(this.sim.state.player);
  }

  private structureInteractPosition(structure: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
    const y = structure.y > 0 ? structure.y : WorldLayout.terrainHeight(structure.x, structure.z);
    return { x: structure.x, y, z: structure.z };
  }

  private fishTableStationDefinition(): {
    stationId: string;
    recipeId: string;
    idlePrompt: string;
    collectPrompt: string;
  } {
    const inventory = this.sim.state.inventories[this.sim.state.player.inventoryId];
    const options = [
      { recipeId: "recipe.perch_to_scraps", idlePrompt: "[E] Clean Perch", collectPrompt: "[E] Collect Fish Scraps" },
      { recipeId: "recipe.mackerel_to_scraps", idlePrompt: "[E] Clean Mackerel", collectPrompt: "[E] Collect Fish Scraps" },
      { recipeId: "recipe.fish_to_fertilizer", idlePrompt: "[E] Make Fertilizer", collectPrompt: "[E] Collect Fertilizer" }
    ] as const;
    for (const option of options) {
      const recipe = ContentRegistry.recipes.get(option.recipeId);
      if (recipe && InventoryManager.hasItems(inventory, recipe.inputs)) return { stationId: HARBOR_FISH_TABLE.structureId, ...option };
    }
    return { stationId: HARBOR_FISH_TABLE.structureId, ...options[2] };
  }

  private startFertilizeAction(
    farmId: string,
    worldPosition?: { x: number; y: number; z: number }
  ): void {
    const target = worldPosition ?? {
      x: this.sim.state.player.x,
      y: this.sim.state.player.y,
      z: this.sim.state.player.z
    };
    this.startFarmingAction("water", target.x, target.z, () => {
      const result = this.sim.execute({ type: "farm.apply-fertilizer", farmId });
      if (result.success) this.setToast("Fertilized the soil");
      return result;
    });
  }

  private startCropAction(action: "water" | "harvest", placedCropId: string): void {
    const crop = this.sim.state.crops[placedCropId];
    if (!crop) return;
    const world = farmLocalToWorld(crop.farmId, crop);
    if (action === "water") {
      this.showContextualHint(
        "hint.farming_water",
        "Crop Hydration",
        "Water crops daily! Maintaining soil moisture yields higher grade crops.",
        "💧"
      );
    }
    this.startFarmingAction(action, world.x, world.z, () => {
      const result = this.sim.execute({
        type: action === "water" ? "crop.water" : "crop.harvest",
        placedCropId
      });
      if (result.success) {
        this.inspectedCrop = action === "water" ? this.sim.inspectCrop(placedCropId) : null;
        if (action === "harvest") {
          this.setToast(result.yield ? `Harvested ${result.yield}` : result.reason ?? "Crop cleared");
        } else {
          this.setToast("Watered");
        }
      }
      return result;
    });
  }

  private toggleBoatBoard(): void {
    const boatId = "boat.player_rowboat";
    if (this.mode === "on-foot") {
      const res = this.sim.execute({ type: "boat.board", boatId });
      if (!res.success) {
        this.setToast(res.reason ?? "Cannot board boat");
        return;
      }
      this.setGameplayMode("boat-driving");
      this.playerPresentation.pushCanonicalPose(this.sim.state.player, { snap: true });
      this.showContextualHint(
        "hint.boat_steering",
        "Rowboat Navigation",
        "[W/S] Throttle • [A/D] Steer • [E] Dock when near a harbor pier.",
        "⛵"
      );
      this.requestAutosave();
    } else {
      const res = this.sim.execute({ type: "boat.dock" });
      if (!res.success) {
        this.setToast(res.reason ?? "Cannot dock here");
        return;
      }
      this.setGameplayMode("on-foot");
      this.playerPresentation.pushCanonicalPose(this.sim.state.player, { snap: true });
      this.requestAutosave();
    }
  }

  private interactWithSchool(schoolId: string, action: "chum" | "hook"): void {
    if (action === "chum") {
      const res = this.sim.execute({ type: "fishing.chum-school", schoolId });
      if (!res.success) this.setToast(res.reason ?? "Cannot chum school");
    } else {
      const res = this.sim.execute({ type: "fishing.hook-school", schoolId });
      if (res.success) {
        this.setGameplayMode("sport-fishing");
        this.hudFishingHold = { isReeling: false, isSlacking: false, isBracing: false };
        this.showContextualHint(
          "hint.fishing_sport",
          "Sport Fishing",
          "Hold [LMB] to reel. Release when line turns orange. Use [A/D] to counter runs!",
          "🐟"
        );
      } else {
        this.setToast(res.reason ?? "Cannot hook fish");
      }
    }
  }


  private interactWithStation(target: ResolvedInteractionTarget): void {
    const { stationId, recipeId } = target;
    if (!stationId || !recipeId) return;
    const structure = this.sim.state.world.structures[stationId];
    if (!structure) return;
    const job = this.findStationJob(stationId);
    if (target.action === "collect-processing" && job?.status === "complete") {
      this.startFarmingAction("processing-collect", structure.x, structure.z, () => {
        const result = this.sim.execute({ type: "processing.collect", jobId: job.id });
        if (result.success) this.setToast("Collected");
        return result;
      });
      return;
    }
    if (target.action === "inspect" || job?.status === "active") {
      this.setToast("Job in progress...");
      return;
    }
    this.startFarmingAction("processing-start", structure.x, structure.z, () => {
      const result = this.sim.execute({ type: "processing.start", recipeId, stationId });
      if (result.success) this.setToast("Work started");
      return result;
    });
  }

  private async handleQuickSave(): Promise<void> {
    if (this.persistenceDisabled) {
      this.setToast("Saving is disabled in this debug session");
      return;
    }
    if (!this.durableWritesEnabled) {
      this.setToast("Save failed");
      return;
    }
    try {
      const ok = await this.saveRepo.saveGame(this.sim.state);
      if (ok) this.lastAutosaveMs = performance.now();
      this.setToast(ok ? "Saved" : "Save failed");
    } catch (error) {
      console.error("[GameApp] Save failed", error);
      this.setToast("Save failed");
    }
  }

  private onVisibilityChange = (): void => {
    if (document.hidden) this.requestAutosave();
  };

  private requestAutosave(): void {
    if (this.persistenceDisabled || !this.durableWritesEnabled) return;
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
    const res = this.sim.execute({ type: "fishing.start-charge-basic" });
    if (res.success) {
      this.setGameplayMode("basic-fishing");
      this.setToast("Hold to charge cast power…", 1800);
      this.showContextualHint(
        "hint.fishing_basic",
        "River Angling",
        "Hold [Space] to raise your catch bar. Keep the fish centered to land it!",
        "🎣"
      );
    } else {
      this.setToast(res.reason ?? "Fishing failed");
    }
  }


  private confirmNewGame(): void {
    const reason = this.saveRecoveryReason;
    this.saveRecoveryReason = null;
    this.modeController.confirmNewGame();
    this.syncOverlayState();
    if (reason === "unavailable") {
      this.durableWritesEnabled = false;
      this.setToast("This session will not be saved");
      return;
    }
    this.durableWritesEnabled = true;
    this.setToast("Starting a new game");
    this.requestAutosave();
  }

  private handleResetPlayerToSafePlace(): void {
    this.sim.execute({ type: "player.reset-safe" });
    this.playerPresentation.pushCanonicalPose(this.sim.state.player, { snap: true });
    this.setGameplayMode("on-foot");
    this.modeController.resume();
    this.syncOverlayState();
    this.setToast("Character safely returned to Starter Garden", 3000);
    this.requestAutosave();
  }

  private renderUI(): void {
    if (!this.uiRoot) return;

    if (this.mode === "sport-fishing" && !this.sim.activeFishingEncounter) {
      // Encounter finished
      this.setGameplayMode(this.sim.state.player.activeBoatId ? "boat-driving" : "on-foot");
      this.hudFishingHold = { isReeling: false, isSlacking: false, isBracing: false };
    }
    if (this.mode === "basic-fishing" && !this.sim.state.basicFishing) {
      this.setGameplayMode(this.sim.state.player.activeBoatId ? "boat-driving" : "on-foot");
    }

    const state = this.sim.getState();
    const cameraPosition = this.gameCamera.camera.position;
    const cameraFraming = this.gameCamera.framingState();
    const placementTarget = this.frozenPlacementResult ?? this.placementResult;

    this.uiRoot.render(
      React.createElement(GameUI, {
        state,
        mode: this.mode,
        fps: this.fps,
        renderStats: {
          calls: this.worldScene.renderer.info.render.calls,
          triangles: this.worldScene.renderer.info.render.triangles,
          points: this.worldScene.renderer.info.render.points,
          lines: this.worldScene.renderer.info.render.lines,
          ...this.worldScene.renderObjectStats()
        },
        cameraDiagnostics: {
          x: cameraPosition.x,
          y: cameraPosition.y,
          z: cameraPosition.z,
          yawRadians: cameraFraming.yawRadians,
          pitchRadians: cameraFraming.pitchRadians,
          distance: cameraFraming.distance,
          resolvedDistance: cameraFraming.resolvedDistance,
          obstructionFraction: cameraFraming.obstructionFraction,
          obstructed: cameraFraming.obstructed,
          fovDegrees: cameraFraming.fovDegrees
        },
        characterDiagnostics: {
          presentedX: this.lastPresentedPlayer?.x ?? state.player.x,
          presentedY: this.lastPresentedPlayer?.y ?? state.player.y,
          presentedZ: this.lastPresentedPlayer?.z ?? state.player.z,
          speedMetersPerSecond: this.lastPresentedPlayer?.motion.speedMetersPerSecond ?? 0,
          accelerationMetersPerSecondSquared:
            this.lastPresentedPlayer?.motion.accelerationMetersPerSecondSquared ?? 0,
          collisionBlocked: this.lastPresentedPlayer?.motion.isCollisionBlocked ?? false,
          requestedGait: this.lastPresentedPlayer?.motion.requestedGait ?? "idle",
          animationClip: this.worldScene.currentPlayerAnimationClip(),
          actionTargetX: this.farmingActionSnapshot?.target.x ?? null,
          actionTargetZ: this.farmingActionSnapshot?.target.z ?? null
        },
        placementValid: this.placementResult?.valid ?? null,
        placementTarget: placementTarget
          ? { x: placementTarget.worldX, z: placementTarget.worldZ }
          : null,
        promptText: this.promptText,
        toastMessage: this.currentToast(),
        inspectedCrop: this.inspectedCrop,
        farmingAction: this.farmingActionSnapshot,
        activeModal: this.activeModal,
        onSetActiveModal: (modal: ActiveModal) => {
          if (this.saveRecoveryReason && modal !== "new-game-confirm") return;
          if (this.modeController.blocksHudOverlaysAndTools && modal !== "pause") return;
          this.setActiveModal(modal);
        },
        saveRecoveryReason: this.saveRecoveryReason,
        onConfirmNewGame: () => this.confirmNewGame(),
        onOpenMarket: () => {
          if (this.modeController.blocksHudOverlaysAndTools) return;
          const marketId = this.sim.getNearbyMarketId();
          if (!marketId) {
            this.setToast("Visit a market stall to trade");
            return;
          }
          this.activeMarketId = marketId;
          this.setActiveModal("market");
        },
        marketId: this.activeMarketId,
        activeQuest: this.sim.questDomain.getActiveQuestDto(),
        activeDialogueNpcId: this.activeDialogueNpcId,
        onTalkNpc: this.handleTalkNpc,
        activeHint: this.activeHint,
        onDismissHint: (hintId: string) => {
          if (this.activeHint?.hintId === hintId) {
            this.activeHint = null;
          }
        },
        onSelectPlantCrop: (cropId: string) => {
          this.enterCropPlacement(cropId);
        },
        selectedPlantCropId: this.selectedCropId,
        onCancelPlacement: () => this.exitCropPlacement(),
        isFarmGisHeld: this.isFarmGisHeld,
        activeToolSlot: this.activeToolSlot,
        onSelectToolSlot: (slot: number) => this.selectToolSlot(slot),
        landedCatch: this.pendingCatchCargo,
        onKeepCatch: () => {
          this.pendingCatchCargo = null;
          this.setToast("Cargo stowed safely", 2000);
        },
        onReleaseCatch: () => {
          if (this.pendingCatchCargo) {
            this.sim.discardFishCargo(this.pendingCatchCargo.id);
            this.pendingCatchCargo = null;
            this.setToast("Fish released back to the water", 2400);
          }
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
        onHookBasicFishingBite: () => {
          this.sim.execute({ type: "fishing.hook-bite-basic" });
        },
        onSetBasicFishingInput: (isHolding: boolean) => {
          this.sim.execute({ type: "fishing.control-basic", isHolding });
        },
        onReleaseBasicFishingCast: (power?: number) => {
          this.sim.execute({ type: "fishing.release-cast-basic", castPower: power });
        },
        onDismissBasicFishingModal: () => {
          if (this.sim.state.basicFishing?.phase === "caught" || this.sim.state.basicFishing?.phase === "escaped") {
            this.sim.execute({ type: "fishing.cancel-basic" });
          }
        },
        onSellItem: (marketId: MarketId, itemId: string, quantity: number) => {
          const result = this.sim.execute({ type: "market.sell-item", marketId, itemId, quantity });
          if (!result.success) this.setToast(result.reason ?? "Could not sell item");
          else if (result.revenue != null) this.setToast(`Sold for ${result.revenue} G`);
        },
        onBuySeed: (marketId: MarketId, itemId: string, quantity: number) => {
          const result = this.sim.execute({ type: "market.buy-seed", marketId, itemId, quantity });
          if (!result.success) this.setToast(result.reason ?? "Could not buy seed");
          else if (result.cost != null) this.setToast(`Seed added · ${result.cost} G`);
        },
        onSellFishCargo: (marketId: MarketId, cargoId: string) => {
          const res = this.sim.execute({ type: "market.sell-fish", marketId, cargoId });
          if (!res.success) this.setToast(res.reason ?? "Could not sell fish");
          else if (res.revenue != null) this.setToast(`Sold for ${res.revenue} G`);
        },
        onDiscardFishCargo: (cargoId: string) => {
          const res = this.sim.execute({ type: "cargo.discard", cargoId });
          if (!res.success) this.setToast(res.reason ?? "Could not discard fish");
          else if (res.scraps) this.setToast(`Discarded for ${res.scraps} fish scraps`);
          else this.setToast(res.reason ?? "Discarded spoiled fish");
        },
        onDeliverContractItems: (contractId: string, itemId: string, quantity: number) => {
          const res = this.sim.execute({ type: "contract.deliver-items", contractId, itemId, quantity });
          if (!res.success) this.setToast(res.reason ?? "Could not deliver items");
          else if (res.completed) this.setToast(`Contract complete: +${res.rewardMoney} G`, 3600);
          else this.setToast(`Delivered ${res.delivered} item`);
        },
        onDeliverFishCargo: (contractId: string, cargoId: string) => {
          const res = this.sim.execute({ type: "contract.deliver-fish", contractId, cargoId });
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
          this.sim.spawnFishSchool("lake", 0, WorldLayout.coastlineZ(0) + 12, ["fish.trout"]);
        },
        screenFade: this.doorTransitionFade
      })
    );
  }

  private onResize = (): void => {
    const width = this.canvasContainer.clientWidth || window.innerWidth;
    const height = this.canvasContainer.clientHeight || window.innerHeight;
    this.worldScene.handleResize(width, height);
    this.gameCamera.handleResize(width, height);
  };
}
