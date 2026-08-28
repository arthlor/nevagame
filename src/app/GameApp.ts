// src/app/GameApp.ts

import * as THREE from "three";
import React from "react";
import ReactDOM from "react-dom/client";
import { Simulation } from "../simulation/Simulation";
import { WorldScene, type BoatPresentationInput } from "../render/scene/WorldScene";
import { GameCamera } from "../render/camera/GameCamera";
import { InputRouter } from "../input/InputRouter";
import { IndexedDbSaveRepository, type LoadGameResult } from "../persistence/IndexedDbSaveRepository";
import { GameAction, MarketId, ProcessingJobState, FishCargoState } from "../simulation/core/types";
import type { BoatMotionSample } from "../simulation/core/PhysicsAdapter";

import { GameUI } from "../ui/GameUI";
import { InventoryManager } from "../simulation/inventory/InventoryManager";
import { ASSET_CATALOG } from "../render/assets/AssetCatalog";
import { AssetLoader } from "../render/loaders/AssetLoader";
import { applyOfflineProgression } from "../persistence/offlineDelta";
import { ContentRegistry } from "../content/ContentRegistry";
import { getAssetCoverageSummary, type AssetCoverageSummary } from "../render/assets/AssetCoverage";
import { PhysicsWorld } from "../physics/PhysicsWorld";
import { WorldLayout } from "../world/WorldLayout";
import { pickUnlockedStationRecipe } from "../simulation/domains/ProcessingDomain";

const STARTUP_STAGE_TIMEOUT_MS = 30_000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      }
    );
  });
}
import {
  HARBOR_DOCK,
  HARBOR_FISH_TABLE,
  HARBOR_MARKET,
  HARBOR_SKIFF_MOORING,
  VILLAGE_MARKET,
  WORLD_SPAWN
} from "../world/WorldAnchors";
import { SPORT_FISHING_REVIEW_POINTS } from "../simulation/domains/FishingDomain";
import {
  farmLocalToWorld,
  farmWorldOrigin,
  findFarmIdAtWorld,
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
  GameCommand,
  InteractionResult,
  InteractionTarget
} from "../simulation/core/contracts";
import {
  IRRIGATION_COST,
  IRRIGATION_FEATURE_ID
} from "../simulation/domains/FarmingDomain";
import { FarmingActionController,
  type FarmingActionSnapshot,
  type FarmingPresentationAction
} from "./FarmingActionController";
import { PlacementEditor } from "./PlacementEditor";
import { gameAudio, type AudioCueId } from "../audio/AudioManager";
import { bindDomainAudio, syncWorldAudio } from "../audio/gameplayAudio";
import { footstepBankForSurface, footstepSurfaceAt } from "../audio/footstepSurface";
import type { LayoutEditCommit, LayoutEditTag } from "../layout-editor/layoutEdit";
import { applyLayoutEditLiveSession } from "../layout-editor/layoutEditLiveSession";
import {
  InteractionTargetResolver,
  type ResolvedInteractionTarget
} from "./InteractionTargetResolver";
import {
  PlayerPresentationBuffer,
  stationaryPlayerMotion,
  type PresentedPlayerFrame
} from "../render/presentation/PlayerPresentationBuffer";
import {
  assessProcessingStationApproach,
  getProcessingStationFrontPosition
} from "../world/ProcessingStationApproach";
import { createStartupState, type StartupState } from "./StartupState";

interface FishingHoldInput {
  isReeling: boolean;
  isSlacking: boolean;
  isBracing: boolean;
}

export interface NevaDebugSnapshot {
  activeQuestId: string | null;
  activeActId: string | null;
  money: number;
  cropCount: number;
  unlocked: string[];
  cargoCount: number;
  cargoIds: string[];
  currentMinute: number;
  minutesPerRealSecond: number;
  bootReady: boolean;
  cropIds: string[];
  schoolIds: string[];
  processingJobIds: string[];
  basicFishing: {
    phase: string;
    barY?: number;
    barHeight?: number;
    fishY?: number;
    barVy?: number;
  } | null;
  sportFishing: {
    lineTension: number;
    behavior: string;
    fishDirection: number;
  } | null;
}

export interface NevaDebugApi {
  execute: (command: GameCommand) => InteractionResult;
  advanceGameMinutes: (minutes: number) => void;
  tickRealSeconds: (seconds: number) => void;
  teleport: (x: number, z: number) => void;
  teleportActiveBoat: (x: number, z: number) => void;
  moveToNpc: (npcId: string) => boolean;
  moveToStation: (stationId: string) => boolean;
  snapshot: () => NevaDebugSnapshot;
  saveNow: () => Promise<boolean>;
}

declare global {
  interface Window {
    __NEVA_DEBUG?: NevaDebugApi;
  }
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
  | "harbor-skiff"
  | "boat-driving"
  | "sport-fishing";

type StartupIntent = "continue" | "new-game" | "without-saving";

const DEBUG_START_SCENARIOS = new Set<DebugStartScenario>([
  "farm",
  "farm-art",
  "motion-capture",
  "farmhouse-north",
  "farmhouse-south",
  "harbor",
  "harbor-skiff",
  "boat-driving",
  "sport-fishing"
]);

const EMPTY_ASSET_COVERAGE_SUMMARY: AssetCoverageSummary = {
  total: 0,
  byDisposition: {
    "static-world": 0,
    "dynamic-world": 0,
    "conditional-world": 0,
    "progression-world": 0,
    "reserve": 0
  },
  freshSaveVisible: 0,
  records: []
};

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
  "farm-art": {
    playerPose: { x: -65, y: 1.2, z: -60.5, rotationY: 0 },
    cameraPosition: { x: -43, y: 13.5, z: -79 },
    cameraTarget: { x: -64, y: 1.2, z: -54.5 },
    fovDegrees: 47
  },
  "crop-stages": {
    playerPose: { x: -65, y: 1.2, z: -60.5, rotationY: 0 },
    cameraPosition: { x: -43, y: 13.5, z: -79 },
    cameraTarget: { x: -64, y: 1.2, z: -54.5 },
    fovDegrees: 47
  },
  village: {
    playerPose: { x: VILLAGE_MARKET.position.x, y: 6.8, z: VILLAGE_MARKET.position.z + 7, rotationY: Math.PI },
    cameraPosition: { x: VILLAGE_MARKET.position.x + 20, y: 16.5, z: VILLAGE_MARKET.position.z + 24 },
    cameraTarget: { x: VILLAGE_MARKET.position.x, y: 3.6, z: VILLAGE_MARKET.position.z },
    fovDegrees: 48
  },
  "farmhouse-interior": {
    playerPose: { x: 240, y: 0.8, z: -241.8, rotationY: Math.PI },
    cameraPosition: { x: 245.5, y: 7.5, z: -247.5 },
    cameraTarget: { x: 240, y: 1.2, z: -240 },
    fovDegrees: 52
  },
  harbor: {
    playerPose: { x: 68, y: 1.2, z: 56, rotationY: 0 },
    cameraPosition: { x: 96, y: 14.5, z: 88 },
    cameraTarget: { x: 71, y: 1.4, z: 64 },
    fovDegrees: 49
  },
  rowboat: {
    playerPose: { x: HARBOR_DOCK.boatPosition.x, y: 0.5, z: HARBOR_DOCK.boatPosition.z, rotationY: 0 },
    cameraPosition: { x: 104, y: 15, z: 99 },
    cameraTarget: { x: HARBOR_DOCK.boatPosition.x, y: 0.8, z: HARBOR_DOCK.boatPosition.z },
    fovDegrees: 47
  },
  coast: {
    playerPose: { x: -68, y: 5, z: 54, rotationY: 0 },
    cameraPosition: { x: -129, y: 30, z: 111 },
    cameraTarget: { x: -92, y: 13.8, z: 74 },
    fovDegrees: 50
  },
  "sport-fishing": {
    playerPose: {
      x: SPORT_FISHING_REVIEW_POINTS.trout.x,
      y: 0.5,
      z: SPORT_FISHING_REVIEW_POINTS.trout.z,
      rotationY: 0
    },
    cameraPosition: { x: 31, y: 13.5, z: 108 },
    cameraTarget: { x: 18, y: 0.5, z: SPORT_FISHING_REVIEW_POINTS.trout.z },
    fovDegrees: 43
  },
  "sport-fishing-tuna": {
    playerPose: {
      x: SPORT_FISHING_REVIEW_POINTS.tuna.x,
      y: 0.5,
      z: SPORT_FISHING_REVIEW_POINTS.tuna.z,
      rotationY: 0
    },
    cameraPosition: { x: 137, y: 16, z: 153 },
    cameraTarget: { x: 118, y: 0.5, z: SPORT_FISHING_REVIEW_POINTS.tuna.z },
    fovDegrees: 43
  },
  "harbor-skiff": {
    playerPose: {
      x: HARBOR_SKIFF_MOORING.playerPosition.x,
      y: 1.4,
      z: HARBOR_SKIFF_MOORING.playerPosition.z,
      rotationY: 0
    },
    cameraPosition: { x: 112, y: 15, z: 102 },
    cameraTarget: { x: HARBOR_SKIFF_MOORING.boatPosition.x, y: 0.8, z: HARBOR_SKIFF_MOORING.boatPosition.z },
    fovDegrees: 47
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
  private hudBasicHold = false;
  private basicCastHoldLatched = false;
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
  private bootReady: boolean = false;
  private startupState: StartupState = createStartupState(ASSET_CATALOG.length);
  private startupPromise: Promise<void> | null = null;
  private savePreflightPromise: Promise<LoadGameResult> | null = null;
  private startupIntent: StartupIntent = "continue";
  private durableWritesEnabled: boolean = false;
  private saveRecoveryReason: "corrupt" | "incompatible" | "unavailable" | null = null;
  private readonly movementIntent = { x: 0, z: 0 };
  private readonly playerPresentation = new PlayerPresentationBuffer();
  private assetCoverage: AssetCoverageSummary = EMPTY_ASSET_COVERAGE_SUMMARY;
  private lastPresentedPlayer: PresentedPlayerFrame | null = null;
  private lastBoatMotion: Readonly<Record<string, BoatMotionSample>> = {};
  private lockedInteractionTarget: ResolvedInteractionTarget | null = null;
  private readonly audioForward = new THREE.Vector3();
  private readonly canvasContainer: HTMLElement;
  private readonly resizeObserver: ResizeObserver;
  private doorTransitionFade: boolean = false;
  private isTransitioningDoor: boolean = false;
  private doorTransitionTimer: ReturnType<typeof setTimeout> | null = null;
  private activeDialogueNpcId: string | null = null;
  private activeHint: { hintId: string; title: string; message: string; icon?: string } | null = null;
  private isFarmGisHeld: boolean = false;
  private pendingCatchCargo: FishCargoState | null = null;
  private activeToolSlot: number = 1;

  private handleTalkNpc = (npcId: string) => this.sim.questDomain.talkToNpc(npcId);

  private dismissActiveHint = (hintId: string): void => {
    if (this.activeHint?.hintId === hintId) this.activeHint = null;
  };

  private dismissPendingCatch = (): void => {
    this.pendingCatchCargo = null;
  };

  private uiRoot: ReactDOM.Root | null = null;
  private layoutEditor: PlacementEditor | null = null;


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
    if (import.meta.env.DEV) {
      this.layoutEditor = new PlacementEditor(
        this.worldScene,
        () => this.renderUI(),
        (tag, commit) => this.applyLayoutEditLiveSync(tag, commit),
        () => this.refreshLayoutEditStaticWorld()
      );
      window.addEventListener("keydown", this.onLayoutEditorKeyDown);
      window.addEventListener("keyup", this.onLayoutEditorKeyUp);
    }
    this.syncOverlayState();
    this.renderUI();
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
    if (this.mode === "basic-fishing" && mode !== "basic-fishing") {
      this.basicCastHoldLatched = false;
      this.hudBasicHold = false;
    }
    this.modeController.setGameplayMode(mode);
    this.inputRouter.setMode(mode);
    if (mode !== "farm-placement") this.clearPlacementPreview();
  }

  private syncOverlayState(): void {
    const startupBlocksInput = this.startupState.status !== "ready";
    this.sim.clock.setPaused(
      startupBlocksInput || this.benchmarkView || this.modeController.pausesSimulation
    );
    this.inputRouter.setWorldInputSuspended(
      startupBlocksInput || this.modeController.blocksWorldInput || this.benchmarkView
    );
    if (this.modeController.blocksWorldInput) this.cancelDoorTransition();
    if (this.activeModal !== "market") this.activeMarketId = null;
  }

  private setLayoutEditorActive(active: boolean): void {
    if (!this.layoutEditor) return;
    this.layoutEditor.setActive(active);
    this.inputRouter.setLayoutEditorActive(this.layoutEditor.isActive());
  }

  private syncLayoutEditor(): void {
    if (!this.layoutEditor?.isActive() || this.modeController.blocksWorldInput) {
      this.inputRouter.consumeLayoutPrimaryPress();
      return;
    }
    const pick = this.inputRouter.consumeLayoutPrimaryPress();
    this.layoutEditor.sync({
      pointerNdc: pick ?? this.inputRouter.getInputState().pointerNdc,
      primaryHeld: this.inputRouter.isHeld("Mouse0"),
      primaryPressed: pick !== null,
      shiftHeld: this.inputRouter.isHeld("ShiftLeft") || this.inputRouter.isHeld("ShiftRight"),
      camera: this.gameCamera.camera
    });
  }

  private isLayoutEditorTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
  }

  private onLayoutEditorKeyDown = (event: KeyboardEvent): void => {
    if (!this.layoutEditor || this.startupState.status !== "ready") return;
    if (event.code === "F2") {
      event.preventDefault();
      if (event.repeat) return;
      this.setLayoutEditorActive(!this.layoutEditor.isActive());
      return;
    }
    if (!this.layoutEditor.isActive() || event.repeat) return;
    if (this.isLayoutEditorTypingTarget(event.target) || this.modeController.blocksWorldInput) return;
    if (event.metaKey || event.ctrlKey) {
      if (event.code === "KeyC") {
        event.preventDefault();
        this.layoutEditor.copySelection();
        return;
      }
      if (event.code === "KeyV") {
        event.preventDefault();
        void this.layoutEditor.pasteClipboard();
        return;
      }
      if (event.code === "KeyD") {
        event.preventDefault();
        this.layoutEditor.duplicateSelection();
        return;
      }
    }
    if (event.code === "Delete" || event.code === "Backspace") {
      event.preventDefault();
      void this.layoutEditor.deleteSelection();
      return;
    }
    if (event.code === "KeyQ" || event.code === "KeyE") {
      this.layoutEditor.handleKeyDown(event.code, event.shiftKey);
    }
  };

  private onLayoutEditorKeyUp = (event: KeyboardEvent): void => {
    this.layoutEditor?.handleKeyUp(event.code);
  };

  private applyLayoutEditLiveSync(tag: LayoutEditTag, commit: LayoutEditCommit): void {
    applyLayoutEditLiveSession(this.sim, tag, commit);
    if (tag.kind === "npc") {
      const npc = ContentRegistry.npcs.get(tag.id);
      if (npc) {
        npc.anchor.x = commit.x;
        npc.anchor.z = commit.z;
        npc.anchor.rotationY = commit.rotationY;
      }
      this.worldScene.relocateNpcPresentation(tag.id, commit.x, commit.z, commit.rotationY);
    }
  }

  private refreshLayoutEditStaticWorld(): void {
    if (!this.physicsWorld) return;
    this.physicsWorld.replaceStaticCollision(this.worldScene.rebuildStaticCollisionProxies());
  }

  private playOverlayAudio(previous: ActiveModal, next: ActiveModal): void {
    if (next && next !== previous && next !== "new-game-confirm") {
      if (next === "journal") {
        gameAudio.playOneShot("page-turn");
      } else {
        gameAudio.playBank("ui-open");
      }
      return;
    }
    if (!next && previous) {
      gameAudio.playOneShot("ui-click");
    }
  }

  private setActiveModal(modal: ActiveModal): void {
    const previous = this.activeModal;
    if (modal) this.cancelFarmingAction();
    if (
      modal === "pause" &&
      this.sim.state.basicFishing?.phase === "charging-cast"
    ) {
      this.sim.execute({ type: "fishing.cancel-basic" });
      this.setGameplayMode(this.sim.state.player.activeBoatId ? "boat-driving" : "on-foot");
      this.basicCastHoldLatched = false;
    }
    if (modal !== "dialogue") {
      this.activeDialogueNpcId = null;
      this.worldScene.setDialogueNpc(null);
    }
    if (modal === null) this.modeController.closeActive();
    else this.modeController.open(modal);
    this.playOverlayAudio(previous, this.activeModal);
    this.syncOverlayState();
  }

  public async start(): Promise<void> {
    const query = new URLSearchParams(window.location.search);
    const benchmarkPreset = import.meta.env.DEV ? query.get("artView") : null;
    const debugStartParameter = import.meta.env.DEV ? query.get("debugStart") : null;
    const debugStart = debugStartParameter && DEBUG_START_SCENARIOS.has(debugStartParameter as DebugStartScenario)
      ? debugStartParameter as DebugStartScenario
      : null;
    const shouldAutoStart = import.meta.env.DEV && (
      query.has("debug") || Boolean(benchmarkPreset) || Boolean(debugStart)
    );

    this.persistenceDisabled = Boolean(benchmarkPreset || debugStart);
    this.startupState = createStartupState(ASSET_CATALOG.length);
    this.bootReady = false;
    this.startupIntent = "continue";
    this.startupPromise = null;
    this.savePreflightPromise = null;
    this.durableWritesEnabled = false;
    this.saveRecoveryReason = null;
    this.isRunning = true;
    this.lastTimeMs = performance.now();
    this.lastAutosaveMs = this.lastTimeMs;
    if (this.persistenceDisabled) {
      // Development-only sessions intentionally bypass persistence and the
      // title screen is bypassed as well, so no save inspection is needed.
      this.startupState = {
        ...this.startupState,
        saveStatus: "empty"
      };
    } else {
      // This is a save-slot inspection only. It does not instantiate the
      // loaded Simulation, request GLBs, create physics, or advance time.
      this.savePreflightPromise = this.preflightSave();
    }
    this.onResize();
    this.syncOverlayState();
    this.renderUI();
    requestAnimationFrame(this.loop);

    if (shouldAutoStart) this.beginLoading();
  }

  public beginLoading(userInitiated = false, intent: StartupIntent = "continue"): void {
    if (this.startupPromise || this.startupState.status !== "title") return;

    this.startupIntent = intent;
    this.bootReady = false;
    this.startupState = {
      ...this.startupState,
      status: "loading",
      phase: "save",
      loadedAssets: 0,
      message: "Reading your harbor log",
      errorMessage: null
    };
    this.syncOverlayState();
    this.renderUI();
    // Browsers reject an autoplay audio-context resume unless this came from
    // the title button (or another real user gesture). Debug URLs auto-boot
    // without a gesture, so leave audio dormant until the first input.
    if (userInitiated) void gameAudio.unlock();

    this.startupPromise = this.prepareRuntime().catch((error: unknown) => {
      this.handleStartupFailure(error);
    });
  }

  private async preflightSave(): Promise<LoadGameResult> {
    try {
      const inspection = await this.saveRepo.inspectGame();
      if (this.isRunning) {
        this.updateStartupState({
          saveStatus: inspection.result.status === "loaded" ? "available" : inspection.result.status,
          saveSummary: inspection.summary
        });
      }
      return inspection.result;
    } catch (error) {
      console.error("[GameApp] Save preflight failed:", error);
      if (this.isRunning) {
        this.updateStartupState({
          saveStatus: "unavailable",
          saveSummary: null
        });
      }
      return { status: "unavailable" };
    }
  }

  private async resolveSavePreflight(): Promise<LoadGameResult> {
    if (!this.savePreflightPromise) {
      this.savePreflightPromise = this.preflightSave();
    }
    return this.savePreflightPromise;
  }

  private async prepareRuntime(): Promise<void> {
    const query = new URLSearchParams(window.location.search);
    const benchmarkPreset = import.meta.env.DEV ? query.get("artView") : null;
    const debugStartParameter = import.meta.env.DEV ? query.get("debugStart") : null;
    const debugStart = debugStartParameter && DEBUG_START_SCENARIOS.has(debugStartParameter as DebugStartScenario)
      ? debugStartParameter as DebugStartScenario
      : null;

    const saveResult = this.persistenceDisabled
      ? { status: "empty" } as const
      : await this.resolveSavePreflight();
    const shouldStartNewGame = this.startupIntent === "new-game";
    const shouldPlayWithoutSaving = this.startupIntent === "without-saving";
    const shouldCreateInitialSave = !this.persistenceDisabled &&
      (shouldStartNewGame || saveResult.status === "empty");

    // A Continue action consumes the already-inspected, migrated, validated
    // envelope. New Game never constructs from it and never writes over it
    // until the new world has finished loading and is ready to play.
    if (!this.persistenceDisabled && !shouldStartNewGame && !shouldPlayWithoutSaving && saveResult.status === "loaded") {
      applyOfflineProgression(saveResult.envelope.state, Date.now());
      this.sim = new Simulation(saveResult.envelope.state);
      this.attachSimulationFeedback();
      this.durableWritesEnabled = true;
      await this.saveRepo.saveGame(this.sim.state);

      this.modeController.restoreFromState(saveResult.envelope.state);
      this.inputRouter.setMode(this.mode);
      this.sim.clock.setPaused(false);
      this.syncOverlayState();

      console.info("[GameApp] Loaded existing game save from IndexedDB.");
    } else if (this.persistenceDisabled || shouldPlayWithoutSaving) {
      this.durableWritesEnabled = false;
      this.saveRecoveryReason = null;
    } else if (shouldStartNewGame) {
      this.durableWritesEnabled = saveResult.status !== "unavailable";
      this.saveRecoveryReason = null;
      this.modeController.restoreFromState(this.sim.state);
      this.inputRouter.setMode(this.mode);
      this.syncOverlayState();
    } else if (saveResult.status === "empty") {
      this.durableWritesEnabled = true;
    } else {
      // Keep the existing recovery path as a last-resort guard if storage
      // changes between preflight and startup or a caller bypasses the title.
      if (saveResult.status !== "corrupt" && saveResult.status !== "incompatible" && saveResult.status !== "unavailable") {
        throw new Error(`Unexpected save preflight status: ${saveResult.status}`);
      }
      this.durableWritesEnabled = false;
      this.saveRecoveryReason = saveResult.status;
      this.modeController.open("new-game-confirm");
      this.syncOverlayState();
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
      if (benchmarkPreset === "farm-art" || benchmarkPreset === "crop-stages") {
        this.sim.prepareDebugStarterTrioArtReview();
      }
      if (benchmarkPreset === "rowboat") {
        if (!this.sim.setDebugBoatDriving("boat.player_rowboat", {
          x: HARBOR_DOCK.boatPosition.x,
          z: HARBOR_DOCK.boatPosition.z,
          headingRadians: 0
        })) {
          throw new Error("Could not prepare deterministic rowboat art view");
        }
        this.modeController.restoreFromState(this.sim.state);
        this.inputRouter.setMode(this.mode);
      }
      if (benchmarkPreset === "harbor-skiff" && !this.sim.prepareDebugSkiffReview()) {
        throw new Error("Could not prepare deterministic harbor-skiff art view");
      }
      if (benchmarkPreset === "sport-fishing" || benchmarkPreset === "sport-fishing-tuna") {
        const reviewPoint = benchmarkPreset === "sport-fishing-tuna"
          ? SPORT_FISHING_REVIEW_POINTS.tuna
          : SPORT_FISHING_REVIEW_POINTS.trout;
        if (!this.sim.startDebugSportFishing(reviewPoint.habitatId, reviewPoint.x, reviewPoint.z, reviewPoint.speciesId)) {
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

    this.updateStartupState({
      phase: "assets",
      loadedAssets: 0,
      message: "Unpacking the shoreline"
    });
    await withTimeout(
      AssetLoader.preloadAll((progress) => {
        this.updateStartupState({
          phase: "assets",
          loadedAssets: progress.completed,
          totalAssets: progress.total,
          message: `Unpacking the shoreline · ${progress.completed} of ${progress.total}`
        });
      }),
      STARTUP_STAGE_TIMEOUT_MS,
      "Asset preload timed out"
    );

    this.updateStartupState({ phase: "world", message: "Waking the harbor" });
    await this.worldScene.ready(this.sim.state.worldSeed);

    this.updateStartupState({ phase: "physics", message: "Setting the paths" });
    this.physicsWorld = await withTimeout(
      PhysicsWorld.create(this.worldScene.staticCollisionProxies()),
      STARTUP_STAGE_TIMEOUT_MS,
      "Physics startup timed out"
    );
    this.playerPresentation.reset(this.sim.state.player, undefined, "load");
    this.assetCoverage = getAssetCoverageSummary(this.sim.state.worldSeed);
    // Resolve the initial target before exposing boot-ready state. This keeps
    // contextual prompts usable on the first interactive frame after the
    // deferred world/physics boot completes.
    this.evaluateInteractionTarget();

    this.updateStartupState({
      status: "revealing",
      phase: "complete",
      loadedAssets: this.startupState.totalAssets,
      message: "Almost ready"
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 520));
    if (!this.isRunning) return;

    this.bootReady = true;
    this.attachDebugHarness();
    this.updateStartupState({ status: "ready" });
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("place")) {
      this.setLayoutEditorActive(true);
    }
    if (shouldCreateInitialSave && this.durableWritesEnabled) {
      this.requestAutosave();
    }
  }

  private updateStartupState(update: Partial<StartupState>): void {
    this.startupState = { ...this.startupState, ...update };
    this.syncOverlayState();
    this.renderUI();
  }

  private handleStartupFailure(error: unknown): void {
    if (!this.isRunning) return;
    console.error("[GameApp] Deferred startup failed:", error);
    this.bootReady = false;
    const detail = error instanceof Error ? error.message : String(error);
    const message = "We couldn’t prepare the world. Try again.";
    this.startupState = {
      ...this.startupState,
      status: "error",
      message,
      errorMessage: import.meta.env.DEV && detail ? `${message}\n${detail}` : message
    };
    this.syncOverlayState();
    this.renderUI();
  }

  private retryStartup = (): void => {
    if (this.startupState.status !== "error") return;
    window.location.reload();
  };

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
        this.sim.prepareDebugHarborBoarding();
        break;
      case "harbor-skiff":
        if (!this.sim.prepareDebugSkiffReview()) {
          throw new Error("Could not prepare deterministic harbor-skiff debug start");
        }
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
        if (!this.sim.startDebugSportFishing(
          SPORT_FISHING_REVIEW_POINTS.trout.habitatId,
          SPORT_FISHING_REVIEW_POINTS.trout.x,
          SPORT_FISHING_REVIEW_POINTS.trout.z,
          SPORT_FISHING_REVIEW_POINTS.trout.speciesId
        )) {
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
      if (this.startupState.status !== "ready") return;
      if (this.modeController.blocksHudOverlaysAndTools && action !== "pause") return;
      switch (action) {
        case "interact":
          if (this.mode === "sport-fishing" || this.mode === "basic-fishing" || this.activeModal) return;
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
          if (this.layoutEditor?.handleEscape()) return;
          if (this.inspectedCrop) {
            this.inspectedCrop = null;
            return;
          }
          if (this.farmingActions.isActive) {
            // Cancel only before commit. After commit, Escape still opens pause
            // without rolling the already-applied simulation mutation back.
            if (this.cancelFarmingAction()) return;
          }
          if (this.mode === "basic-fishing" && this.sim.state.basicFishing?.phase === "charging-cast") {
            this.sim.execute({ type: "fishing.cancel-basic" });
            this.setGameplayMode(this.sim.state.player.activeBoatId ? "boat-driving" : "on-foot");
            this.basicCastHoldLatched = false;
            this.hudBasicHold = false;
          }
          if (this.mode === "farm-placement") {
            if (this.activeModal) {
              this.modeController.handleEscape();
              this.syncOverlayState();
              return;
            }
            this.exitCropPlacement();
            return;
          }
          if (this.mode === "basic-fishing" && !this.activeModal) {
            this.cancelBasicFishingLine();
            return;
          }
          this.modeController.handleEscape();
          this.syncOverlayState();
          break;
        case "open-inventory":
        case "open-journal":
        case "open-map":
        case "open-ledger": {
          const overlay = {
            "open-inventory": "inventory",
            "open-journal": "journal",
            "open-map": "map",
            "open-ledger": "ledger"
          }[action] as "inventory" | "journal" | "map" | "ledger";
          const previous = this.activeModal;
          this.modeController.toggle(overlay);
          this.playOverlayAudio(previous, this.activeModal);
          this.syncOverlayState();
          break;
        }
        case "open-planning": {
          if (!this.sim.state.quests.unlockedFeatureIds.includes("feature.expedition_planner")) {
            this.setToast("Complete your first expedition to unlock the planner");
            break;
          }
          const previous = this.activeModal;
          this.modeController.toggle("expedition");
          this.playOverlayAudio(previous, this.activeModal);
          this.syncOverlayState();
          break;
        }
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
    this.inputRouter.onInterruption(() => {
      this.cancelFarmingAction();
      this.clearFarmGisHold();
      if (this.sim.state.basicFishing?.phase === "charging-cast") {
        this.sim.execute({ type: "fishing.cancel-basic" });
        this.setGameplayMode(this.sim.state.player.activeBoatId ? "boat-driving" : "on-foot");
      }
      this.basicCastHoldLatched = false;
      this.hudBasicHold = false;
    });
  }

  private attachSimulationFeedback(): void {
    for (const dispose of this.simulationFeedbackDisposers) dispose();
    this.simulationFeedbackDisposers = [
      bindDomainAudio(this.sim.events, () => {
        const player = this.lastPresentedPlayer ?? this.sim.state.player;
        return { x: player.x, y: player.y, z: player.z };
      }),
      this.sim.events.on("FishLanded", ({ speciesId, weightKg }) => {
        const speciesName = ContentRegistry.fishSpecies.get(speciesId)?.name ?? "fish";
        this.setToast(`Landed ${weightKg.toFixed(1)} kg ${speciesName}`, 3600);
        this.worldScene.playPlayerAction("pickup");
        const carriedId = this.sim.state.player.carriedFishCargoId;
        if (carriedId && this.sim.state.fishCargo[carriedId]) {
          this.pendingCatchCargo = this.sim.state.fishCargo[carriedId];
        }
      }),
      this.sim.events.on("FishEscaped", ({ reason }) => {
        this.setToast(reason === "snapped" ? "The line snapped" : "The fish slipped free", 3200);
        this.worldScene.playPlayerAction(reason === "snapped" ? "brace" : "slack");
      }),
      this.sim.events.on("BasicFishingStarted", ({ castPower }) => {
        this.setToast(`Line cast (${Math.round((castPower || 0.75) * 100)}% power)…`, 1800);
      }),
      this.sim.events.on("BasicFishingBiteAlert", () => {
        this.setToast("Bite! Hook it now", 1400);
      }),
      this.sim.events.on("BasicFishingMinigameStarted", ({ hasTreasure }) => {
        this.setToast(hasTreasure ? "Sunken treasure spotted" : "Reel it in", 1800);
        this.worldScene.playPlayerAction("reel");
      }),
      this.sim.events.on("BasicFishingResolved", ({ catchItemId, quality, isPerfect, reason }) => {
        if (catchItemId) {
          const qualText = quality && quality !== "normal" ? ` (${quality.toUpperCase()})` : "";
          const perfText = isPerfect ? " [PERFECT!]" : "";
          const catchName =
            ContentRegistry.items.get(catchItemId)?.name
            ?? ContentRegistry.fishSpecies.get(catchItemId)?.name
            ?? "a fish";
          this.setToast(`Caught ${catchName}${qualText}${perfText}!`, 3000);
          this.worldScene.playPlayerAction("pickup");
        } else if (reason === "inventory-full") {
          this.setToast("Your backpack is full; the fish got away", 2800);
        } else if (reason === "escaped") {
          this.setToast("The fish got away!", 2200);
          this.worldScene.playPlayerAction("slack");
        } else if (reason === "cancelled") {
          // Silent or brief cancel toast
        } else {
          this.setToast("Nothing bit this time", 2200);
        }
      }),
      this.sim.events.on("ContractCompleted", ({ rewardMoney }) => {
        this.setToast(`Contract complete: +${rewardMoney} G`, 3600);
      }),
      this.sim.events.on("QuestStarted", ({ questId }) => {
        const quest = ContentRegistry.quests.get(questId);
        this.setToast(`New errand · ${quest?.questTitle ?? "A new task"}`, 3600);
      }),
      this.sim.events.on("QuestProgressed", ({ current, total }) => {
        this.setToast(`Errand progress · ${Math.min(current, total)} / ${total}`, 2200);
      }),
      this.sim.events.on("QuestCompleted", ({ questId, rewardMoney }) => {
        const quest = ContentRegistry.quests.get(questId);
        const reward = rewardMoney == null ? "" : ` · +${rewardMoney} G`;
        this.setToast(`Errand complete · ${quest?.questTitle ?? "Task finished"}${reward}`, 3600);
      }),
      this.sim.events.on("BoatBoarded", ({ boatId }) => {
        const boat = this.sim.state.boats[boatId];
        const name = boat ? ContentRegistry.boats.get(boat.boatTypeId)?.name ?? "vessel" : "vessel";
        this.setToast(`Aboard the ${name.toLowerCase()}`, 1800);
      }),
      this.sim.events.on("BoatDocked", () => this.setToast("Docked at harbor", 2200)),
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
      this.sim.events.on("BoatPurchased", ({ cost }) => {
        this.setToast(`Coastal skiff commissioned · ${cost} G`, 2600);
        this.requestAutosave();
      }),
      this.sim.events.on("BasicFishingStarted", () => this.requestAutosave()),
      this.sim.events.on("BasicFishingResolved", () => this.requestAutosave()),
      this.sim.events.on("ItemSold", () => this.requestAutosave()),
      this.sim.events.on("ItemPurchased", () => this.requestAutosave()),
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

    // Keep the title/loading layer responsive while save data, GLBs, world
    // population, and physics finish. Only the static scene is rendered until
    // the authoritative runtime is ready; no simulation time advances.
    if (!this.bootReady) {
      this.worldScene.render(this.gameCamera.camera);
      this.renderUI();
      requestAnimationFrame(this.loop);
      return;
    }

    // Apply mouse orbit before fixed-step movement so simultaneous WASD uses
    // the camera basis that will be rendered in this same frame.
    const cameraInput = this.inputRouter.consumeCameraInput();
    if (!this.benchmarkCameraView) this.gameCamera.applyInput(this.mode, cameraInput);

    this.syncFarmGisHold();

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
    this.farmingActions.update(nowMs, this.sim.clock.isPaused());
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
      motion: stationaryPlayerMotion(state.player),
      discontinuityReason: "none" as const,
      discontinuitySequence: 0
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
            steering: presentationInput.moveVector.x,
            motion: this.lastBoatMotion[activeBoat.id]
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
      gameAudio.playBank(
        footstepBankForSurface(footstepSurfaceAt(presentedPlayer.x, presentedPlayer.z)),
        {
          x: presentedPlayer.x,
          y: presentedPlayer.y,
          z: presentedPlayer.z
        }
      );
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
        this.physicsWorld ?? undefined,
        {
          player: presentedPlayer.motion,
          boat: activeBoat ? this.lastBoatMotion[activeBoat.id] : undefined,
          discontinuityReason: presentedPlayer.discontinuityReason,
          discontinuitySequence: presentedPlayer.discontinuitySequence
        }
      );
    }
    this.gameCamera.camera.getWorldDirection(this.audioForward);
    gameAudio.setListener(this.gameCamera.camera.position, this.audioForward);
    const boatMotion = activeBoat ? this.lastBoatMotion[activeBoat.id] : undefined;
    const encounter = this.sim.activeFishingEncounter?.getState();
    const basicFishing = this.sim.state.basicFishing;
    syncWorldAudio({
      position: { x: presentedPlayer.x, y: presentedPlayer.y, z: presentedPlayer.z },
      mode: this.mode,
      weather: this.sim.state.weather.type,
      boat: this.mode === "boat-driving" && activeBoat && boatMotion
        ? {
            throttle: boatMotion.throttle,
            x: activeBoat.x,
            y: activeBoat.y,
            z: activeBoat.z
          }
        : undefined,
      fishing: encounter
        ? { reeling: encounter.isReeling, lineTension: encounter.lineTension }
        : basicFishing
          ? { reeling: Boolean(basicFishing.isHolding), lineTension: 0 }
          : undefined
    });
    this.updateCropPlacementPreview();
    if (this.layoutEditor?.isActive()) {
      this.promptText = null;
      this.worldScene.setInteractionTargetFeedback(null);
      this.worldScene.setQuestWaypoint(null);
      this.syncLayoutEditor();
    } else {
      this.evaluateInteractionTarget();
    }

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
      this.isTransitioningDoor ||
      this.modeController.blocksWorldInput
    );
  }

  private updateMovement(deltaSeconds: number, timeSeconds: number): void {
    const input = this.inputRouter.getInputState();
    const isMoving = Math.abs(input.moveVector.x) > 0.001 || Math.abs(input.moveVector.z) > 0.001;
    if (isMoving && this.farmingActions.isActive) this.cancelFarmingAction();
    if (this.isMovementFrozen()) {
      this.inputRouter.consumeJumpRequest();
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
      else {
        this.lastBoatMotion = result.boatMotion;
        this.playerPresentation.push(result.frame.player, result.playerMotion);
      }
    }
  }

  private applySportFishingInput(): void {
    if (this.mode !== "sport-fishing" || !this.sim.activeFishingEncounter) return;
    if (this.modeController.pausesSimulation || this.modeController.blocksWorldInput) return;

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
    if (this.mode !== "basic-fishing" || !this.sim.state.basicFishing) {
      this.basicCastHoldLatched = false;
      return;
    }
    if (this.modeController.pausesSimulation || this.modeController.blocksWorldInput) {
      if (this.sim.state.basicFishing?.phase === "charging-cast") {
        this.sim.execute({ type: "fishing.cancel-basic" });
        this.basicCastHoldLatched = false;
        this.hudBasicHold = false;
      }
      return;
    }
    const input = this.inputRouter.getInputState();
    const attempt = this.sim.state.basicFishing;
    if (attempt.phase === "charging-cast") {
      if (input.fishing.isReeling) this.basicCastHoldLatched = true;
      else if (this.basicCastHoldLatched) {
        this.basicCastHoldLatched = false;
        this.releaseBasicFishingCast();
      }
    } else {
      this.basicCastHoldLatched = false;
    }
    const isHolding = input.fishing.isReeling || this.hudBasicHold;
    if (isHolding !== Boolean(attempt.isHolding)) {
      this.sim.execute({
        type: "fishing.control-basic",
        isHolding
      });
    }
  }

  private cancelBasicFishingLine(): void {
    if (!this.sim.state.basicFishing) return;
    this.hudBasicHold = false;
    this.basicCastHoldLatched = false;
    this.sim.execute({ type: "fishing.cancel-basic" });
    this.setToast("Line reeled in", 1600);
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
    this.worldScene.setDialogueNpc(npcId);
    this.setActiveModal("dialogue");
  }


  public showContextualHint(
    hintId: string,
    title: string,
    message: string,
    icon: string = "✦"
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
      this.millStationDefinition(),
      this.workbenchStationDefinition(),
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
      const approach = assessProcessingStationApproach(definition.stationId, p, structure);
      if (!approach.valid || !approach.frontPosition) continue;
      const interaction = this.stationInteraction(
        definition.stationId,
        definition.idlePrompt,
        definition.collectPrompt
      );
      candidates.push({
        id: `station:${definition.stationId}:${interaction.action}`,
        kind: "station",
        action: interaction.action,
        distanceMeters: approach.distanceMeters,
        priority: 0,
        worldPosition: {
          x: approach.frontPosition.x,
          y: WorldLayout.terrainHeight(approach.frontPosition.x, approach.frontPosition.z),
          z: approach.frontPosition.z
        },
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

    if (this.mode === "on-foot") {
      const nearbyFarmId = this.sim.getNearbyFarmId();
      if (nearbyFarmId) {
        const origin = farmWorldOrigin(nearbyFarmId);
        const irrigationInstalled = this.sim.state.quests.unlockedFeatureIds.includes(IRRIGATION_FEATURE_ID);
        candidates.push({
          id: `farm:${nearbyFarmId}:irrigate`,
          entityId: nearbyFarmId,
          kind: "planting-plot",
          action: "irrigate",
          distanceMeters: 0,
          priority: 2,
          worldPosition: { x: origin.x, y: WorldLayout.terrainHeight(origin.x, origin.z), z: origin.z },
          modes: ["on-foot"],
          requiresLineOfSight: false,
          prompt: irrigationInstalled
            ? "[E] Irrigate the field"
            : `[E] Install irrigation · ${IRRIGATION_COST} G`
        });
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

    const fishMarket = { ...HARBOR_MARKET.position, radiusMeters: HARBOR_MARKET.radiusMeters };
    const fishMarketDistance = Math.hypot(p.x - fishMarket.x, p.z - fishMarket.z);
    if (fishMarketDistance <= fishMarket.radiusMeters) {
      candidates.push({
        id: "market:market.harbor:trade",
        kind: "market",
        action: "trade",
        distanceMeters: fishMarketDistance,
        priority: 1,
        worldPosition: {
          x: fishMarket.x,
          y: WorldLayout.terrainHeight(fishMarket.x, fishMarket.z),
          z: fishMarket.z
        },
        modes: ["on-foot"],
        requiresLineOfSight: true,
        prompt: "[E] Trade with Maeve"
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

    if (this.mode === "on-foot") {
      for (const boat of Object.values(this.sim.state.boats)) {
        if (!this.sim.canBoardBoat(boat.id)) continue;
        candidates.push({
          id: `dock:${boat.id}:board`,
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
          prompt: `Press [E] to Board ${ContentRegistry.boats.get(boat.boatTypeId)?.name ?? "Vessel"}`
        });
      }

      const skiff = this.sim.state.boats["boat.player_skiff"];
      if (!skiff) {
        const skiffDistance = Math.hypot(
          p.x - HARBOR_SKIFF_MOORING.playerPosition.x,
          p.z - HARBOR_SKIFF_MOORING.playerPosition.z
        );
        if (skiffDistance <= HARBOR_SKIFF_MOORING.boardRadius) {
          const skiffDef = ContentRegistry.boats.get("boat.skiff");
          const requiredXp = skiffDef?.requiredSkillXp?.xp ?? 15000;
          const canAfford = this.sim.state.player.money >= (skiffDef?.costMoney ?? 850);
          const hasSkill = this.sim.state.player.proficiencies.fishing >= requiredXp;
          candidates.push({
            id: "dock:harbor-skiff:purchase",
            entityId: "boat.skiff",
            kind: "dock",
            action: "purchase-boat",
            distanceMeters: skiffDistance,
            priority: 0,
            worldPosition: {
              x: HARBOR_SKIFF_MOORING.boatPosition.x,
              y: HARBOR_SKIFF_MOORING.boatPosition.y,
              z: HARBOR_SKIFF_MOORING.boatPosition.z
            },
            modes: ["on-foot"],
            requiresLineOfSight: false,
            prompt: hasSkill && canAfford
              ? "Press [E] to Commission Coastal Skiff · 850 G"
              : `Coastal Skiff · ${this.sim.state.player.proficiencies.fishing.toLocaleString()} / ${requiredXp.toLocaleString()} Fishing XP · 850 G`
          });
        }
      }
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

      const timeOfDay = this.sim.state.clock.timeOfDay;
      if (timeOfDay === "dusk" || timeOfDay === "night") {
        candidates.push({
          id: "interior:farmhouse:rest",
          kind: "interior-door",
          action: "rest",
          distanceMeters: 0,
          priority: 2,
          worldPosition: {
            x: p.x,
            y: p.y,
            z: p.z
          },
          modes: ["on-foot"],
          requiresLineOfSight: false,
          prompt: "[E] Rest until morning"
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
            // Actionable stations/crops/boats win when their interaction space
            // overlaps an NPC; dialogue remains available just outside it.
            priority: 1,
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
    if (this.activeModal || this.benchmarkView) {
      this.worldScene.setInteractionTargetFeedback(null);
      this.promptText = null;
      return;
    }
    if (this.mode === "sport-fishing") {
      this.worldScene.setInteractionTargetFeedback(null);
      this.promptText = null;
      return;
    }

    if (this.mode === "farm-placement") {
      this.worldScene.setInteractionTargetFeedback(null);
      const cropName = ContentRegistry.crops.get(this.selectedCropId)?.name ?? "crop";
      const placementPrompt = this.placementResult?.valid
        ? `[E / Click] Plant ${cropName} · Right-click / Esc cancel`
        : `${this.placementResult?.reason ?? "Point at prepared farm soil"} · Right-click / Esc cancel`;
      this.promptText = placementPrompt;
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
      const placed = this.sim.state.crops[this.inspectedCrop.placedCropId];
      if (!placed) {
        this.inspectedCrop = null;
      } else {
        const world = farmLocalToWorld(placed.farmId, placed);
        const dx = this.sim.state.player.x - world.x;
        const dz = this.sim.state.player.z - world.z;
        if (dx * dx + dz * dz > 36) {
          this.inspectedCrop = null;
        } else {
          this.inspectedCrop = this.sim.inspectCrop(this.inspectedCrop.placedCropId);
        }
      }
    }
    this.promptText = picked ? picked.prompt : null;
  }

  private handleContextInteract(): void {
    if (this.mode === "sport-fishing" || this.mode === "basic-fishing" || this.farmingActions.isActive) return;

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
      case "irrigate": {
        const irrigationInstalled = this.sim.state.quests.unlockedFeatureIds.includes(IRRIGATION_FEATURE_ID);
        const result = irrigationInstalled && picked.entityId
          ? this.sim.execute({ type: "farm.irrigate", farmId: picked.entityId })
          : this.sim.execute({ type: "farm.buy-irrigation" });
        if (!result.success) this.setToast(result.reason ?? "Could not irrigate");
        else if (!irrigationInstalled) this.setToast("Irrigation installed", 2600);
        else this.setToast("Field irrigated", 2000);
        if (result.success) this.requestAutosave();
        break;
      }
      case "rest": {
        const result = this.sim.execute({ type: "player.rest-until-dawn" });
        if (result.success) {
          this.setToast("Rested until morning", 2600);
          this.requestAutosave();
        } else {
          this.setToast(result.reason ?? "Could not rest");
        }
        break;
      }
      case "plant":
        this.confirmCropPlacement();
        break;
      case "board":
      case "dock":
        this.toggleBoatBoard(picked.entityId);
        break;
      case "purchase-boat": {
        const result = this.sim.execute({ type: "boat.purchase-skiff" });
        if (!result.success) {
          this.setToast(result.reason ?? "Could not purchase the skiff");
        } else {
          this.setToast("Coastal skiff commissioned · 850 G", 2600);
          this.requestAutosave();
        }
        break;
      }
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
      case "trade": {
        const nearbyMarket = this.sim.getNearbyMarketId();
        if (!nearbyMarket) {
          this.setToast("Visit a market stall to trade");
          break;
        }
        this.activeMarketId = nearbyMarket;
        this.setActiveModal("market");
        break;
      }
      case "enter":
        this.transitionDoor(FARMHOUSE_INTERIOR_DOOR.enterSpawn, "Entered cozy home");
        break;
      case "exit":
        this.transitionDoor(FARMHOUSE_OUTSIDE_DOOR.exitSpawn, "Stepped outside");
        break;
    }
    if (!this.farmingActions.isActive) this.lockedInteractionTarget = null;
  }

  private cancelDoorTransition(): void {
    if (this.doorTransitionTimer !== null) {
      clearTimeout(this.doorTransitionTimer);
      this.doorTransitionTimer = null;
    }
    this.doorTransitionFade = false;
    this.isTransitioningDoor = false;
  }

  private teleportPlayer(toPose: { x: number; y: number; z: number; rotationY: number }): void {
    const player = this.sim.state.player;
    const commit = this.sim.execute({
      type: "physics.commit",
      frame: {
        player: {
          x: toPose.x,
          y: toPose.y,
          z: toPose.z,
          rotationY: toPose.rotationY,
          traversal: { ...player.traversal, isGrounded: true }
        },
        boats: {}
      }
    });
    if (!commit.success) {
      this.sim.setDebugPlayerPose(toPose);
    }
    this.playerPresentation.pushCanonicalPose(this.sim.state.player, {
      discontinuity: "teleport"
    });
  }

  private attachDebugHarness(): void {
    if (!import.meta.env.DEV) return;
    window.__NEVA_DEBUG = {
      execute: (command) => this.sim.execute(command),
      advanceGameMinutes: (minutes) => this.sim.advanceGameMinutes(minutes),
      tickRealSeconds: (seconds) => this.sim.tick(seconds),
      teleport: (x, z) => {
        const y = WorldLayout.isWater(x, z) || WorldLayout.isInterior(x, z)
          ? (WorldLayout.isInterior(x, z) ? 0.67 : 0.5)
          : WorldLayout.terrainHeight(x, z) + 0.5;
        this.teleportPlayer({ x, y, z, rotationY: this.sim.state.player.rotationY });
      },
      teleportActiveBoat: (x, z) => {
        const activeBoatId = this.sim.state.player.activeBoatId;
        const { player, boats } = this.sim.state;
        this.sim.execute({
          type: "physics.commit",
          frame: {
            player: {
              x,
              y: 0.5,
              z,
              rotationY: player.rotationY,
              traversal: { ...player.traversal, isGrounded: true }
            },
            boats: Object.fromEntries(
              Object.values(boats).map((boat) => [boat.id, {
                x: boat.id === activeBoatId ? x : boat.x,
                y: boat.id === activeBoatId ? 0 : boat.y,
                z: boat.id === activeBoatId ? z : boat.z,
                headingRadians: boat.id === activeBoatId ? 0 : boat.headingRadians,
                speed: 0
              }])
            )
          }
        });
      },
      moveToNpc: (npcId) => {
        const npc = ContentRegistry.npcs.get(npcId);
        if (!npc) return false;
        window.__NEVA_DEBUG?.teleport(npc.anchor.x, npc.anchor.z);
        return true;
      },
      moveToStation: (stationId) => {
        const station = this.sim.state.world.structures[stationId];
        if (!station) return false;
        const front = getProcessingStationFrontPosition(stationId, station);
        if (!front) return false;
        window.__NEVA_DEBUG?.teleport(front.x, front.z);
        return true;
      },
      snapshot: () => {
        const fishing = this.sim.state.basicFishing;
        const encounter = this.sim.activeFishingEncounter?.getState();
        return {
          activeQuestId: this.sim.state.quests.activeQuestId,
          activeActId: this.sim.state.quests.activeActId,
          money: this.sim.state.player.money,
          cropCount: Object.keys(this.sim.state.crops).length,
          unlocked: [...this.sim.state.quests.unlockedFeatureIds],
          cargoCount: Object.keys(this.sim.state.fishCargo).length,
          cargoIds: Object.keys(this.sim.state.fishCargo),
          currentMinute: this.sim.state.clock.currentMinute,
          minutesPerRealSecond: this.sim.state.clock.minutesPerRealSecond,
          bootReady: this.bootReady,
          cropIds: Object.keys(this.sim.state.crops),
          schoolIds: Object.keys(this.sim.state.world.activeSchools),
          processingJobIds: Object.keys(this.sim.state.processingJobs),
          basicFishing: fishing
            ? {
                phase: fishing.phase,
                barY: fishing.barY,
                barHeight: fishing.barHeight,
                fishY: fishing.fishY,
                barVy: fishing.barVy
              }
            : null,
          sportFishing: encounter
            ? {
                lineTension: encounter.lineTension,
                behavior: encounter.behavior,
                fishDirection: encounter.fishDirection
              }
            : null
        };
      },
      saveNow: () => this.saveRepo.saveGame(this.sim.state)
    };
  }

  private transitionDoor(
    toPose: { x: number; y: number; z: number; rotationY: number },
    toastMessage: string
  ): void {
    if (this.isTransitioningDoor) return;
    this.isTransitioningDoor = true;
    this.doorTransitionFade = true;
    gameAudio.playOneShot("door-open", {
      x: this.sim.state.player.x,
      y: this.sim.state.player.y,
      z: this.sim.state.player.z
    });

    this.doorTransitionTimer = setTimeout(() => {
      this.teleportPlayer(toPose);
      this.setToast(toastMessage, 2000);
      this.doorTransitionTimer = setTimeout(() => {
        this.doorTransitionFade = false;
        this.isTransitioningDoor = false;
        this.doorTransitionTimer = null;
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
        let targetCropId: string | null = this.selectedCropId;
        const selectedCrop = targetCropId ? ContentRegistry.crops.get(targetCropId) : undefined;
        if (!selectedCrop || !playerInv || InventoryManager.getItemCount(playerInv, selectedCrop.seedItemId) <= 0) {
          targetCropId = null;
          for (const crop of ContentRegistry.crops.values()) {
            if (playerInv && InventoryManager.getItemCount(playerInv, crop.seedItemId) > 0) {
              targetCropId = crop.id;
              break;
            }
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
    if (this.sim.state.player.activeBoatId) {
      this.setToast("Disembark before planting");
      return;
    }
    if (!ContentRegistry.crops.get(cropId)) {
      this.setToast("Unknown crop");
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
      "✧"
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
    const player = this.sim.state.player;
    const farmId = findFarmIdAtWorld(hit.x, hit.z)
      ?? findFarmIdAtWorld(player.x, player.z, 2.5);
    if (!farmId) {
      this.clearPlacementPreview();
      return;
    }
    const result = this.sim.query({
      type: "crop.validate-placement",
      request: {
        farmId,
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
      this.inputRouter.setJumpBlocked(false);
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
      this.inputRouter.setJumpBlocked(false);
    }
    this.worldScene.setFarmingActionPresentation(
      snapshot.action === "fertilize" ? "place" : snapshot.action,
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
          : snapshot.action === "fertilize"
            ? "place"
            : snapshot.action;
      this.worldScene.playPlayerAction(animation);
    }
    if (
      snapshot.phase === "completed" &&
      snapshot.action === "harvest" &&
      snapshot.commitSucceeded === true
    ) {
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
        case "fertilize":
          play("place");
          play("plant-dirt");
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
    if (
      snapshot.phase === "completed" &&
      snapshot.action === "harvest" &&
      snapshot.commitSucceeded === true
    ) {
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
      if (snapshot.action === "plant" || snapshot.action === "fertilize") this.worldScene.spawnFarmingVfx("dirt", target, timeSeconds);
      if (snapshot.action === "harvest") this.worldScene.spawnFarmingVfx("straw", target, timeSeconds);
      if (snapshot.action === "processing-start") this.worldScene.spawnFarmingVfx("workstation", target, timeSeconds);
      if (snapshot.action === "processing-collect") this.worldScene.spawnFarmingVfx("pickup", target, timeSeconds);
      return;
    }
    if (
      snapshot.phase === "completed" &&
      snapshot.action === "harvest" &&
      snapshot.commitSucceeded === true
    ) {
      this.worldScene.spawnFarmingVfx("pickup", target, timeSeconds);
    }
  }

  private startFarmingAction(
    action: FarmingPresentationAction,
    x: number,
    z: number,
    commit: () => InteractionResult,
    targetY: number = WorldLayout.terrainHeight(x, z),
    entityId?: string
  ): void {
    this.facePlayerToward(x, z);
    const started = this.farmingActions.start(
      action,
      { x, y: targetY, z, entityId },
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
      return;
    }
    this.inputRouter.setJumpBlocked(true);
    this.inputRouter.consumeJumpRequest();
  }

  private facePlayerToward(x: number, z: number): void {
    const result = this.sim.execute({ type: "player.face-target", x, z });
    if (!result.success) return;
    this.playerPresentation.pushCanonicalPose(this.sim.state.player);
  }

  private millStationDefinition(): {
    stationId: string;
    recipeId: string;
    idlePrompt: string;
    collectPrompt: string;
  } {
    return this.pickStationRecipe("struct.starter_mill", "hand-mill", "[E] Mill Grain", "[E] Collect Ground Grain");
  }

  private workbenchStationDefinition(): {
    stationId: string;
    recipeId: string;
    idlePrompt: string;
    collectPrompt: string;
  } {
    return this.pickStationRecipe("struct.workbench", "workbench", "[E] Mix Chum", "[E] Collect Chum");
  }

  private pickStationRecipe(
    stationId: string,
    stationType: "hand-mill" | "workbench" | "fish-table" | "compost-bin",
    fallbackIdle: string,
    fallbackCollect: string
  ): {
    stationId: string;
    recipeId: string;
    idlePrompt: string;
    collectPrompt: string;
  } {
    const inventory = this.sim.state.inventories[this.sim.state.player.inventoryId];
    const processingXp = this.sim.state.player.proficiencies.processing;
    const recipe = pickUnlockedStationRecipe(stationType, inventory, processingXp);
    if (!recipe) {
      return {
        stationId,
        recipeId: "recipe.craft_chum",
        idlePrompt: fallbackIdle,
        collectPrompt: fallbackCollect
      };
    }
    const output = ContentRegistry.items.get(recipe.outputs[0]?.itemId);
    const hasInputs = InventoryManager.hasItems(inventory, recipe.inputs);
    return {
      stationId,
      recipeId: recipe.id,
      idlePrompt: hasInputs ? `[E] ${recipe.name}` : fallbackIdle,
      collectPrompt: `[E] Collect ${output?.name ?? "Output"}`
    };
  }

  private fishTableStationDefinition(): {
    stationId: string;
    recipeId: string;
    idlePrompt: string;
    collectPrompt: string;
  } {
    return this.pickStationRecipe(
      HARBOR_FISH_TABLE.structureId,
      "fish-table",
      "[E] Clean Fish",
      "[E] Collect Scraps"
    );
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
    this.startFarmingAction("fertilize", target.x, target.z, () => {
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
        "≈"
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

  private toggleBoatBoard(targetBoatId?: string): void {
    if (this.mode === "on-foot") {
      const boatId = targetBoatId ?? "boat.player_rowboat";
      const boat = this.sim.state.boats[boatId];
      if (!boat || !this.sim.canBoardBoat(boatId)) {
        this.setToast("Move closer to the docked vessel");
        return;
      }
      this.startFarmingAction("board", boat.x, boat.z, () => {
        const result = this.sim.execute({ type: "boat.board", boatId });
        if (result.success) {
          this.setGameplayMode("boat-driving");
          this.playerPresentation.pushCanonicalPose(this.sim.state.player, {
            discontinuity: "boarding"
          });
          const boatName = ContentRegistry.boats.get(boat.boatTypeId)?.name ?? "boat";
          this.showContextualHint(
            "hint.boat_steering",
            `${boatName} Navigation`,
            "[W/S] Throttle • [A/D] Steer • [E] Dock when near a harbor pier.",
            "⌂"
          );
          this.requestAutosave();
        }
        return result;
      }, boat.y, boatId);
    } else {
      const boatId = this.sim.state.player.activeBoatId;
      const boat = boatId ? this.sim.state.boats[boatId] : null;
      if (!boat || !this.sim.canDockActiveBoat()) {
        this.setToast("Return to the harbor dock to disembark");
        return;
      }
      this.startFarmingAction("dock", boat.x, boat.z, () => {
        const result = this.sim.execute({ type: "boat.dock" });
        if (result.success) {
          this.setGameplayMode("on-foot");
          this.playerPresentation.pushCanonicalPose(this.sim.state.player, {
            discontinuity: "docking"
          });
          this.requestAutosave();
        }
        return result;
      }, boat.y, boat.id);
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
          "◈"
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
    const interactionPosition = target.worldPosition;
    if (!interactionPosition) return;
    const job = this.findStationJob(stationId);
    if (target.action === "collect-processing" && job?.status === "complete") {
      this.startFarmingAction("processing-collect", interactionPosition.x, interactionPosition.z, () => {
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
    this.startFarmingAction("processing-start", interactionPosition.x, interactionPosition.z, () => {
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
        "⌁"
      );
    } else {
      this.setToast(res.reason ?? "Fishing failed");
    }
  }

  private releaseBasicFishingCast(power?: number): void {
    const basicFishing = this.sim.state.basicFishing;
    if (this.mode !== "basic-fishing" || !basicFishing || basicFishing.phase !== "charging-cast") return;
    if (this.modeController.pausesSimulation || this.modeController.blocksWorldInput) return;
    const player = this.sim.state.player;
    const targetX = player.x + Math.sin(player.rotationY) * 4;
    const targetZ = player.z + Math.cos(player.rotationY) * 4;
    this.startFarmingAction("cast", targetX, targetZ, () => {
      return this.sim.execute({ type: "fishing.release-cast-basic", castPower: power });
    });
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

  private dismissNewGameConfirm(): void {
    this.modeController.dismissNewGameConfirm();
    this.syncOverlayState();
  }

  private handleResetPlayerToSafePlace(): void {
    this.sim.execute({ type: "player.reset-safe" });
    this.playerPresentation.pushCanonicalPose(this.sim.state.player, {
      discontinuity: "recovery"
    });
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
      this.hudBasicHold = false;
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
        onDismissCropInspection: () => {
          this.inspectedCrop = null;
        },
        farmingAction: this.farmingActionSnapshot,
        activeModal: this.activeModal,
        onSetActiveModal: (modal: ActiveModal) => {
          if (this.saveRecoveryReason && modal !== "new-game-confirm") return;
          if (!this.modeController.allowsOverlayChange(modal)) return;
          this.setActiveModal(modal);
        },
        saveRecoveryReason: this.saveRecoveryReason,
        onConfirmNewGame: () => this.confirmNewGame(),
        onDismissNewGameConfirm: () => this.dismissNewGameConfirm(),
        marketId: this.activeMarketId,
        activeQuest: this.sim.questDomain.getActiveQuestDto(),
        activeDialogueNpcId: this.activeDialogueNpcId,
        onTalkNpc: this.handleTalkNpc,
        activeHint: this.activeHint,
        onDismissHint: this.dismissActiveHint,
        onSelectPlantCrop: (cropId: string) => {
          this.enterCropPlacement(cropId);
        },
        selectedPlantCropId: this.selectedCropId,
        onCancelPlacement: () => this.exitCropPlacement(),
        isFarmGisHeld: this.isFarmGisHeld,
        activeToolSlot: this.activeToolSlot,
        onSelectToolSlot: (slot: number) => this.selectToolSlot(slot),
        landedCatch: this.pendingCatchCargo,
        onDismissCatchSummary: this.dismissPendingCatch,

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
          if (this.modeController.pausesSimulation || this.modeController.blocksWorldInput) return;
          this.sim.execute({ type: "fishing.hook-bite-basic" });
        },
        onSetBasicFishingInput: (isHolding: boolean) => {
          this.hudBasicHold = isHolding;
          if (this.modeController.pausesSimulation || this.modeController.blocksWorldInput) return;
          const routerHolding = this.inputRouter.getInputState().fishing.isReeling;
          this.sim.execute({ type: "fishing.control-basic", isHolding: isHolding || routerHolding });
        },
        onCancelBasicFishing: () => {
          if (this.modeController.pausesSimulation) return;
          this.cancelBasicFishingLine();
        },
        onReleaseBasicFishingCast: (power?: number) => {
          this.releaseBasicFishingCast(power);
        },
        onDismissBasicFishingModal: () => {
          if (this.modeController.pausesSimulation || this.modeController.blocksWorldInput) return;
          if (this.sim.state.basicFishing?.phase === "caught" || this.sim.state.basicFishing?.phase === "escaped") {
            const result = this.sim.execute({ type: "fishing.cancel-basic" });
            if (!result.success) this.setToast(result.reason ?? "Your backpack is full");
          }
        },
        onSellItem: (marketId: MarketId, itemId: string, quantity: number) => {
          const result = this.sim.execute({ type: "market.sell-item", marketId, itemId, quantity });
          if (!result.success) this.setToast(result.reason ?? "Could not sell item");
          else if (result.revenue != null) this.setToast(`Sold for ${result.revenue} G`);
        },
        onBuySeed: (marketId: MarketId, itemId: string, quantity: number) => {
          const result = this.sim.execute({ type: "market.buy-seed", marketId, itemId, quantity });
          if (!result.success) this.setToast(result.reason ?? "Could not buy that");
          else if (result.cost != null) this.setToast(`Purchased · ${result.cost} G`);
        },
        onBuyItem: (marketId: MarketId, itemId: string, quantity: number) => {
          const result = this.sim.execute({ type: "market.buy-item", marketId, itemId, quantity });
          if (!result.success) this.setToast(result.reason ?? "Could not buy that");
          else if (result.cost != null) this.setToast(`Purchased · ${result.cost} G`);
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
        onResetPlayerToSafePlace: () => {
          this.handleResetPlayerToSafePlace();
        },
        onAdvanceHours: (hours: number) => {
          this.sim.advanceGameMinutes(hours * 60);
        },
        onGrantMoney: (amount: number) => {
          this.sim.grantDebugMoney(amount);
        },
        onToggleWeather: () => {
          const current = this.sim.state.weather.type;
          this.sim.setDebugWeather(current === "clear" ? "light-rain" : "clear");
        },
        onSpawnSchool: () => {
          const point = SPORT_FISHING_REVIEW_POINTS.trout;
          this.sim.spawnFishSchool(point.habitatId, point.x, point.z, [point.speciesId]);
        },
        assetCoverage: this.assetCoverage,
        startup: this.startupState,
        onStart: () => this.beginLoading(true, "continue"),
        onStartNewGame: () => this.beginLoading(true, "new-game"),
        onStartWithoutSaving: () => this.beginLoading(true, "without-saving"),
        onRetry: this.retryStartup,
        bootReady: this.bootReady,
        screenFade: this.doorTransitionFade,
        layoutEditor: this.layoutEditor
          ? {
              ...this.layoutEditor.hudState(),
              onToggle: () => this.setLayoutEditorActive(!this.layoutEditor!.isActive())
            }
          : null
      })
    );
  }

  private syncFarmGisHold(): void {
    const held = this.inputRouter.getInputState().farmGisHeld;
    if (held === this.isFarmGisHeld) return;
    this.isFarmGisHeld = held;
    this.worldScene.setFarmGisMode(held);
  }

  private clearFarmGisHold(): void {
    if (!this.isFarmGisHeld) return;
    this.isFarmGisHeld = false;
    this.worldScene.setFarmGisMode(false);
  }

  public dispose(): void {
    this.isRunning = false;
    this.cancelDoorTransition();
    this.clearFarmGisHold();
    this.inputRouter.setJumpBlocked(false);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("keydown", this.onLayoutEditorKeyDown);
    window.removeEventListener("keyup", this.onLayoutEditorKeyUp);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.resizeObserver.disconnect();
    this.inputRouter.dispose();
    this.physicsWorld?.dispose();
    this.physicsWorld = null;
    this.worldScene.dispose();
    this.uiRoot?.unmount();
    this.uiRoot = null;
  }

  private onResize = (): void => {
    const width = this.canvasContainer.clientWidth || window.innerWidth;
    const height = this.canvasContainer.clientHeight || window.innerHeight;
    this.worldScene.handleResize(width, height);
    this.gameCamera.handleResize(width, height);
  };
}
