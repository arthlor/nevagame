import { isCarriage, carriagePoint, CARRIAGE_TUNING, canReachCarriageRear } from "../simulation/mounts/Carriage";
import { playOpeningCamera } from "../render/camera/OpeningCameraSequence";
import { buildNextWorldHint } from "../simulation/presentation/WorldGuidancePresentation";
import { buildRestQuote } from "../simulation/presentation/RestPresentation";
import { RewardFeedbackPresentation } from "../simulation/presentation/RewardFeedbackPresentation";
import { WorldRewardOverlay } from "../ui/hud/WorldRewardOverlay";
import { buildIcedCargoIds, buildWindmillAudio } from "../simulation/presentation/WorldAudioPresentation";
import { npcLayoutTarget } from "../layout-editor/layoutEdit";
import { buildNearbyNpcBarks, npcAnchorAt, NPC_TALK_RADIUS } from "../simulation/presentation/NpcPresentation";
// src/app/GameApp.ts

import * as THREE from "three";
import React from "react";
import ReactDOM from "react-dom/client";
import { Simulation } from "../simulation/Simulation";
import type { EquippedToolId } from "../simulation/core/contracts";
import {
  WorldScene,
  type BoatPresentationInput,
  type WorldRenderDiagnostics
} from "../render/scene/WorldScene";
import type { CaptureRenderMode } from "../render/pipeline/RendererPipeline";
import {
  WORLD_FIELD_OVERLAYS,
  type WorldFieldOverlay
} from "../render/scene/WorldDiagnosticOverlay";
import { GameCamera } from "../render/camera/GameCamera";
import { ExplorationFraming } from "../render/camera/ExplorationFraming";
import { InputRouter } from "../input/InputRouter";
import { FISHING_STEER_INPUT_MAX } from "../simulation/fishing/FishingTuning";
import {
  accessibleLureSupplyCount,
  LURE_ITEM_ID,
  nextAccessibleChumItemId
} from "../simulation/fishing/FishingSupplies";
import { IndexedDbSaveRepository, type LoadGameResult } from "../persistence/IndexedDbSaveRepository";
import {
  CropQuality,
  EquipmentId,
  EquipmentPresetId,
  FishCargoState,
  GameAction,
  MarketId,
  ProcessingJobState,
  RecipeId,
  RodId,
  StorageKind,
  WeatherTag
} from "../simulation/core/types";
import type { BoatMotionSample } from "../simulation/core/PhysicsAdapter";

import { StartScreen } from "../ui/StartScreen";
import { GameUI } from "../ui/GameUI";
import { createMarketUiActions } from "./GameUiMarketActions";
import { selectDebugGameSnapshot } from "./GameUiSnapshot";
import { inspectLandedCatch } from "../simulation/fishing/trophyCatch";
import type { ContextualCropChoice } from "../ui/hud/ContextualCropChoice";
import { startUiAtlasPrefetch } from "../ui/atlas/preloadUiAtlas";
import type { LaborShiftFeedbackDto } from "../ui/labor/LaborShiftResult";
import { MobileOrientationGate } from "../ui/MobileControls";
import type { JournalFolio } from "../ui/JournalModal";
import {
  inferNoticeTone,
  NOTICE_DEFAULT_DURATION_MS,
  ChronicleLog,
  NoticeQueue,
  type Notice,
  type NoticeTone
} from "../ui/notifications";
import type { ChronicleFilter, NoticeCategory } from "../ui/notifications";
import { bindUiHoverAudio, playNoticeSound } from "../ui/audio/uiAudio";

const SALE_BATCH_WINDOW_MS = 600;
/** Real-time cadence of the periodic autosave, and of its retries after a failure. */
const AUTOSAVE_INTERVAL_MS = 60_000;
import { InventoryManager } from "../simulation/inventory/InventoryManager";
import {
  GraphicsQualitySettings,
  type GraphicsQualityPreference
} from "../render/config/GraphicsQualitySettings";
import { applyOfflineProgression, type OfflineProgressionSummary } from "../persistence/offlineDelta";
import { ContentRegistry } from "../content/ContentRegistry";
import { selectVillageNotices, villageNoticeContext } from "../content/villageBulletin";
import { buildPeoplePageDto } from "../simulation/presentation/PeoplePresentation";
import { getAssetCoverageSummary, type AssetCoverageSummary } from "../render/assets/AssetCoverage";
import { PhysicsWorld } from "../physics/PhysicsWorld";
import type { CollisionDebugView } from "../diagnostics/CollisionDebugView";
import { WorldLayout } from "../world/WorldLayout";
import { HEADWATER_GRAYBOX_VIEWPOINTS } from "../world/HeadwaterWaterfallGraybox";
import { NpcBarkOverlay } from "../ui/hud/NpcBarkOverlay";
import { MarketBoardOverlay } from "../ui/hud/MarketBoardOverlay";
import { QuestPointerOverlay, type QuestPointerTarget } from "../ui/hud/QuestPointerOverlay";
import {
  buildMarketLifeBoards,
  type MarketLifeBoardDto
} from "../simulation/presentation/MarketLifePresentation";
import {
  WORLD_MARKET_LOCATIONS,
  WORLD_STATION_DEFINITIONS
} from "../world/WorldGameplayLocations";
import { WORLD_SAILING_ROUTES } from "../world/WorldMoorings";
import { SUNREACH_OFFSET_X } from "../world/WorldIslands";
import { isQuestActive } from "../simulation/core/QuestTypes";
import { formatGameDuration } from "../simulation/core/GameClock";
import { STARTER_DONKEY_ID } from "../simulation/mounts/Mounts";
import {
  StartupTimeoutError
} from "./StartupLoading";

import { StartupCoordinator } from "./StartupCoordinator";
import { prepareStartupWorld, WORLD_STARTUP_TIMEOUT_MS } from "./startup/prepareStartupWorld";
import { applyDebugStartScenario, DEBUG_START_SCENARIOS, type DebugStartScenario } from "./startup/DebugStartScenario";
import { yieldToTask } from "../utils/CooperativeTask";

/** How long the person just spoken to keeps their world barks to themselves. */
const POST_CONVERSATION_BARK_HOLD_MS = 30_000;

function detectTouchDevice(): boolean {
  return typeof window !== "undefined" && (
    window.matchMedia?.("(pointer: coarse)").matches === true
    || (navigator.maxTouchPoints ?? 0) > 0
  );
}

import {
  HARBOR_DOCK,
  HARBOR_SKIFF_MOORING,
  VILLAGE_BULLETIN,
  VILLAGE_MARKET
} from "../world/WorldAnchors";
import { BASIC_FISHING_WORK_COST, SCHOOL_INTERACTION_RADIUS, SPORT_FISHING_REVIEW_POINTS } from "../simulation/domains/FishingDomain";
import {
  farmLocalToWorld,
  farmWellWorldAnchor,
  findFarmIdAtWorld,
  getFarmLayout,
  isPointInsideRect,
  worldToFarmLocal
} from "../world/FarmLayout";
import {
  FARMHOUSE_INTERIOR_DOOR,
  FARMHOUSE_OUTSIDE_DOOR
} from "../world/FarmhouseInterior";
import { ActiveModal, GameOverlay, GameplayMode, ModeController } from "./ModeController";
import type {
  CropInspectionDto,
  CropPlacementResult,
  GameCommand,
  InteractionResult,
  InteractionTarget,
  LaborHudDto,
  LaborStationDto,
  MarketDemandTrendDto,
  RepairQuoteDto,
  StormHelmHudDto
} from "../simulation/core/contracts";
import {
  FARMING_ACTION_COST,
  FERTILITY_MAX,
  IRRIGATION_COST,
  IRRIGATION_FEATURE_ID
} from "../simulation/domains/FarmingDomain";
import { processingWorkForRecipe } from "../simulation/domains/ProcessingDomain";
import {
  type FarmingActionSnapshot,
  type FarmingPresentationAction
} from "./FarmingActionController";
import type { PlacementEditor } from "./PlacementEditor";
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
import { BoatPresentationBuffer } from "../render/presentation/BoatPresentationBuffer";
import {
  IDLE_PLAYER_PRESENCE,
  samplePlayerPresence,
  type PlayerPresence
} from "../render/presentation/PlayerPresence";
import {
  assessProcessingStationApproach,
  getProcessingStationFrontPosition
} from "../world/ProcessingStationApproach";
import { createStartupState, type StartupState } from "./StartupState";
import { createInitialGameState } from "../simulation/core/createInitialState";
import { SessionRecorder } from "../telemetry/SessionRecorder";
import { attachTelemetry } from "../telemetry/attachTelemetry";
import { focusedQuestTrack, type ConversationResult } from "../simulation/core/QuestTypes";

interface FishingHoldInput {
  isReeling: boolean;
  isSlacking: boolean;
  isBracing: boolean;
  rodDirectionAngle: number;
}

export interface NevaDebugSnapshot {
  mode: GameplayMode;
  playerPosition: { x: number; y: number; z: number };
  playerRotationY: number;
  cameraYaw: number;
  playerGrounded: boolean;
  playerSprintStamina: number;
  starterDonkeyPosition: { x: number; y: number; z: number; rotationY: number } | null;
  activeQuestId: string | null;
  activeQuestStepIndex: number;
  activeQuestStepProgress: Record<string, number>;
  activeActId: string | null;
  completedQuestIds: string[];
  money: number;
  cropCount: number;
  unlocked: string[];
  cargoCount: number;
  cargoIds: string[];
  carriedFishCargoId: string | null;
  activeMountId: string | null;
  currentMinute: number;
  minutesPerRealSecond: number;
  /**
   * Monotonic count of fixed movement steps delivered. Automated harnesses pace
   * themselves on this rather than on wall-clock time; see the field's owner in
   * this class for why elapsed real time is not a measure of simulated progress.
   */
  physicsStepCount: number;
  bootReady: boolean;
  cropIds: string[];
  schoolIds: string[];
  processingJobIds: string[];
  processingJobs: Array<{ id: string; recipeId: string; stationId: string; status: string }>;
  interactionTarget: {
    id: string;
    entityId?: string;
    action: string;
    prompt: string;
  } | null;
  basicFishing: {
    phase: string;
    barY?: number;
    barHeight?: number;
    fishY?: number;
    barVy?: number;
    catchProgress?: number;
    isHolding?: boolean;
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
  /** Read-only camera projection used by the Chrome input acceptance harness. */
  projectWorldPoint: (x: number, z: number) => { x: number; y: number; visible: boolean };
  snapshot: () => NevaDebugSnapshot;
  saveNow: () => Promise<boolean>;
  /** DEV-only live renderer state used when tuning shadows, fog, and batching. */
  renderDiagnostics: () => NevaCaptureDiagnostics;
  setCaptureRenderMode: (mode: CaptureRenderMode) => void;
  setFieldOverlay: (mode: WorldFieldOverlay | null) => void;
  setWorldOnly: (worldOnly: boolean) => void;
  /** DEV-only A/B for the dual-map shadow compositor. */
  setShadowAtlas: (enabled: boolean) => void;
  /** Local, persistence-disabled comparisons without replacing the gameplay camera. */
  setReviewEnvironment: (options: { minute: number; weather: WeatherTag; presentationTimeSeconds: number | null }) => void;
  acceptanceRoute: (routeId: string) => readonly { x: number; z: number; distance: number }[];
  acceptanceBridgePosition: () => { x: number; z: number };
}

export interface NevaCaptureDiagnostics {
  renderMode: CaptureRenderMode;
  sceneIdentity: {
    goldTestId: GoldTestId | null;
    worldSeed: number;
    bootReady: boolean;
    worldAssetCount: number;
  };
  camera: {
    position: readonly number[];
    quaternion: readonly number[];
    fovDegrees: number;
  };
  viewport: {
    width: number;
    height: number;
    devicePixelRatio: number;
  };
  presentation: {
    minute: number;
    weather: string;
    timeSeconds: number;
    fps: number;
    frameTiming?: {
      samples: number;
      p50Ms: number;
      p95Ms: number;
      maxMs: number;
      stallsOver50Ms: number;
    };
    startupTiming?: ReadonlyArray<{ phase: string; atMs: number }>;
    phaseTiming?: ReadonlyArray<{
      phase: string;
      samples: number;
      p50Ms: number;
      p95Ms: number;
      maxMs: number;
    }>;
  };
  world: WorldRenderDiagnostics;
}

declare global {
  interface Window {
    __NEVA_DEBUG?: NevaDebugApi;
    __NEVA_RENDER_READY?: boolean;
    /**
     * DEV-only playtest readout. Local to this browser, never transmitted.
     * `window.__NEVA_TELEMETRY.metrics()` answers the LLM/03 §32 questions:
     * time to first harvest/catch/sale/landing (in BOTH real and game time),
     * revenue per real hour, hook/land/escape ratio, and how long players sit
     * after a conversation before doing anything.
     */
    __NEVA_TELEMETRY?: {
      metrics: () => ReturnType<SessionRecorder["getMetrics"]>;
      events: () => ReturnType<SessionRecorder["getEvents"]>;
      reset: () => void;
    };
  }
}

export interface ArtViewPreset {
  playerPose: { x: number; y: number; z: number; rotationY: number };
  cameraPosition: { x: number; y: number; z: number };
  cameraTarget: { x: number; y: number; z: number };
  fovDegrees: number;
}

type StartupIntent = "continue" | "new-game" | "without-saving";

const GOLD_TEST_PRESETS = {
  bridge_river: "bridge",
  starter_farm: "farm",
  harbor_market: "harbor",
  lighthouse_coast: "coast",
  mountain_skyline: "farm-mountains",
  river_source: "river-source",
  western_overlook: "western-overlook",
  sunreach_departure: "sunreach-departure",
  sunreach_cove: "sunreach-cove",
  sunreach_terraces: "sunreach-terraces",
  sunreach_ridge: "sunreach-ridge",
  sunreach_reef: "sunreach-reef"
} as const;

type GoldTestId = keyof typeof GOLD_TEST_PRESETS;

interface BenchmarkRequest {
  preset: string | null;
  goldTestId: GoldTestId | null;
  worldSeed: number;
}

function captureRenderMode(query: URLSearchParams): CaptureRenderMode {
  const value = query.get("renderMode") ?? "final";
  if (value !== "final" && value !== "no-post") {
    throw new Error(`Unknown capture render mode: ${value}`);
  }
  return value;
}

function localWorldAcceptanceRequested(query: URLSearchParams): boolean {
  return (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost")
    && query.get("worldAcceptance") === "1";
}

function benchmarkRequest(query: URLSearchParams): BenchmarkRequest {
  const artView = query.get("artView");
  const requestedGoldTest = query.get("goldTest");
  if (artView && requestedGoldTest) {
    throw new Error("Use either artView or goldTest, not both");
  }
  if (requestedGoldTest && !Object.hasOwn(GOLD_TEST_PRESETS, requestedGoldTest)) {
    throw new Error(`Unknown goldTest scene: ${requestedGoldTest}`);
  }
  const goldTestId = requestedGoldTest as GoldTestId | null;
  const seedParameter = goldTestId ? query.get("seed") : null;
  const parsedSeed = seedParameter === null ? 42 : Number(seedParameter);
  if (goldTestId && (!Number.isSafeInteger(parsedSeed) || parsedSeed < 0)) {
    throw new Error(`Invalid deterministic world seed: ${seedParameter}`);
  }
  return {
    preset: artView ?? (goldTestId ? GOLD_TEST_PRESETS[goldTestId] : null),
    goldTestId,
    worldSeed: parsedSeed
  };
}

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
  "farm-mountains": {
    playerPose: { x: -65, y: 1.7, z: -60.5, rotationY: Math.PI },
    cameraPosition: { x: -70, y: 9, z: -42 },
    cameraTarget: { x: -68, y: 7, z: -86 },
    fovDegrees: 50
  },
  "river-source": {
    playerPose: { x: -48, y: 22, z: -155, rotationY: Math.PI / 2 },
    cameraPosition: { x: -14, y: 31, z: -116 },
    cameraTarget: { x: -31, y: 18, z: -138 },
    fovDegrees: 50
  },
  "western-overlook": {
    playerPose: { x: -126, y: 18.5, z: -88, rotationY: 0 },
    cameraPosition: { x: -137, y: 31, z: -92 },
    cameraTarget: { x: -108, y: 9, z: -64 },
    fovDegrees: 50
  },
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
  /**
   * Open sea looking straight down the evening sun path. The other water views
   * frame a shoreline, so none of them ever put the specular lobe on water:
   * the sun sits over land, or the glint band falls behind a headland. Water is
   * a hero system (art bible section 8) and its sun/moon glitter had no review
   * camera at all, which is how a broken high-tier water shader reached the
   * working tree unseen. Pair with artMinute=1020 (sun at 8.5 degrees
   * elevation, azimuth -32.6) so the reflected view lands on the sun; the ray
   * stays over water for 400 m.
   */
  "open-sea": {
    playerPose: { x: 70, y: 0.5, z: 90, rotationY: 0 },
    cameraPosition: { x: 80, y: 9.6, z: 50 },
    cameraTarget: { x: 47.7, y: 0.6, z: 100.5 },
    fovDegrees: 50
  },
  /**
   * Water review cameras. The shoreline, river and near-sea views above are
   * composed for the settlement; these sit low and close so the swash sheet,
   * the waterline foam, the LOD facets and the current can be judged.
   */
  "water-beach": {
    playerPose: { x: 126, y: 1.6, z: 66, rotationY: 0 },
    cameraPosition: { x: 127, y: 4.2, z: 71 },
    cameraTarget: { x: 134, y: 0, z: 88 },
    fovDegrees: 50
  },
  "water-river": {
    playerPose: { x: -24, y: 1.4, z: -7, rotationY: Math.PI },
    cameraPosition: { x: -3, y: 5.5, z: -24 },
    cameraTarget: { x: -16, y: 0, z: -44 },
    fovDegrees: 50
  },
  "water-sea-low": {
    playerPose: { x: 70, y: 0.5, z: 90, rotationY: 0 },
    cameraPosition: { x: 84, y: 3.2, z: 78 },
    cameraTarget: { x: 64, y: 0.4, z: 130 },
    fovDegrees: 50
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
  },
  "sunreach-departure": {
    playerPose: { x: 238, y: 0.5, z: 112, rotationY: -Math.PI / 2 },
    cameraPosition: { x: 188, y: 27, z: 137 },
    cameraTarget: { x: 438, y: 12, z: 66 },
    fovDegrees: 48
  },
  "sunreach-cove": {
    playerPose: { x: 355 + SUNREACH_OFFSET_X, y: 1.2, z: 58, rotationY: -Math.PI / 2 },
    cameraPosition: { x: 326 + SUNREACH_OFFSET_X, y: 17, z: 91 },
    cameraTarget: { x: 383 + SUNREACH_OFFSET_X, y: 2.8, z: 54 },
    fovDegrees: 48
  },
  "sunreach-terraces": {
    playerPose: { x: 455 + SUNREACH_OFFSET_X, y: 4, z: 5, rotationY: -Math.PI / 2 },
    cameraPosition: { x: 417 + SUNREACH_OFFSET_X, y: 25, z: 63 },
    cameraTarget: { x: 459 + SUNREACH_OFFSET_X, y: 4.2, z: 8 },
    fovDegrees: 47
  },
  "sunreach-ridge": {
    playerPose: { x: 564 + SUNREACH_OFFSET_X, y: 8, z: 43, rotationY: -Math.PI / 2 },
    cameraPosition: { x: 520 + SUNREACH_OFFSET_X, y: 32, z: 103 },
    cameraTarget: { x: 577 + SUNREACH_OFFSET_X, y: 10, z: 31 },
    fovDegrees: 48
  },
  "sunreach-reef": {
    playerPose: { x: 520 + SUNREACH_OFFSET_X, y: 1.2, z: 180, rotationY: Math.PI },
    cameraPosition: { x: 480 + SUNREACH_OFFSET_X, y: 24, z: 226 },
    cameraTarget: { x: 535 + SUNREACH_OFFSET_X, y: 1.4, z: 177 },
    fovDegrees: 49
  }
};

/**
 * Art-view lookup. The W05 headwater graybox viewpoints derive their presets
 * from the fixture owner so the reviewed camera data cannot drift from the
 * composition spec; terrain height is sampled lazily here, never at module load.
 */
export function resolveArtViewPreset(id: string): ArtViewPreset | undefined {
  const preset = ART_VIEW_PRESETS[id];
  if (preset) return preset;
  const viewpoint = HEADWATER_GRAYBOX_VIEWPOINTS.find((candidate) => candidate.artViewId === id);
  if (!viewpoint) return undefined;
  const camera = viewpoint.cameraPosition;
  const target = viewpoint.targetPosition;
  // Stand the avatar a few metres along the view axis, on the ground. Placing
  // the player at the camera position put the camera *inside* the character
  // model, which filled review frames with its unlit interior; stepping blindly
  // along the axis can drop the avatar into the water, so take the first valid
  // standing point and fall back to the stance itself.
  const dx = target.x - camera.x;
  const dz = target.z - camera.z;
  const length = Math.max(0.001, Math.hypot(dx, dz));
  const isStandingGround = (x: number, z: number): boolean =>
    WorldLayout.isWalkable(x, z)
    && !WorldLayout.isWater(x, z)
    && WorldLayout.terrainNormalY(x, z) >= 0.7;
  let playerX = camera.x;
  let playerZ = camera.z;
  // In front of the camera first (the classic third-person read), then behind
  // it when the stance faces open water. The whole band within ~1.7 m of the
  // lens stays empty: that is inside the character model.
  const candidateDistances = [3, 2.6, 2.2, 1.8, -2.4, -2.8, -3.2, -3.6, -4];
  for (const distance of candidateDistances) {
    const candidateX = camera.x + (dx / length) * distance;
    const candidateZ = camera.z + (dz / length) * distance;
    if (!isStandingGround(candidateX, candidateZ)) continue;
    playerX = candidateX;
    playerZ = candidateZ;
    break;
  }
  return {
    playerPose: {
      x: playerX,
      y: WorldLayout.traversalSurfaceHeight(playerX, playerZ) + 1.7,
      z: playerZ,
      rotationY: Math.atan2(dx, dz)
    },
    cameraPosition: { x: camera.x, y: camera.y, z: camera.z },
    cameraTarget: { x: target.x, y: target.y, z: target.z },
    fovDegrees: 50
  };
}

export class GameApp {
  public sim!: Simulation;
  public worldScene: WorldScene;
  public gameCamera: GameCamera;
  public inputRouter: InputRouter;
  public saveRepo: IndexedDbSaveRepository;
  private physicsWorld: PhysicsWorld | null = null;
  private collisionDebugView: CollisionDebugView | null = null;

  private readonly modeController = new ModeController();
  private promptText: string | null = null;
  private contextualCropChoices: ContextualCropChoice[] = [];
  private readonly notices = new NoticeQueue();
  /** Session activity log behind the bottom-left Coastal Chronicle. */
  private readonly chronicle = new ChronicleLog();
  private chronicleFilter: ChronicleFilter = "all";
  /**
   * Slow journal data is only rebuilt while its modal is open. The People and
   * Notices folios have no other consumer, so a fishing indicator repainting
   * must not reconstruct them; the cached value stays valid for the next open.
   */
  private cachedPeoplePage: ReturnType<typeof buildPeoplePageDto> | null = null;
  private cachedVillageNotices: ReturnType<typeof selectVillageNotices> = [];
  private saleBatch = { units: 0, gold: 0, lastMs: -Infinity };
  private activeMarketId: MarketId | null = null;
  private activeCraftingStationId: string | null = null;
  private selectedCropId: string = "crop.wheat";
  private placementResult: CropPlacementResult | null = null;
  private frozenPlacementResult: CropPlacementResult | null = null;
  private inspectedCrop: CropInspectionDto | null = null;
  private readonly actionTimingScale: number;
  private get farmingActions() { return this.sim.actionTimeline; }
  private readonly interactionResolver = new InteractionTargetResolver();
  private farmingActionSnapshot: FarmingActionSnapshot | null = null;
  private hudFishingHold: FishingHoldInput = {
    isReeling: false,
    isSlacking: false,
    isBracing: false,
    rodDirectionAngle: 0
  };
  private basicFishingWidgetHold = false;
  /** One conversation per opened dialogue; re-renders reuse it, never re-talk. */
  private dialogueTalkResult: { npcId: string; result: ConversationResult } | null = null;
  private basicCastSource: "interact" | "primary" | null = null;
  private isRunning: boolean = false;
  private lastTimeMs: number = 0;
  private fps: number = 60;
  private frameCount: number = 0;
  private fpsTimer: number = 0;
  /**
   * Raw frame elapsed times, independent of the bounded simulation delta.
   * Reporting that reused the 100 ms simulation clamp turned repeated 200 ms
   * frames into "10 FPS" and hid visible stalls from the quality sampler.
   */
  private readonly frameTimeRingMs = new Float32Array(240);
  private frameTimeRingCount = 0;
  private frameTimeRingCursor = 0;
  private frameStallCount = 0;
  private readonly phaseTimings = new Map<string, { ring: Float32Array; cursor: number; count: number }>();
  /** rAF does not run while hidden; the first visible frame is a resumption, not a stall. */
  private hiddenSinceLastFrame = false;
  private lastUiFrameMs = Number.NEGATIVE_INFINITY;
  private lastDiagnosticsFrameMs = Number.NEGATIVE_INFINITY;
  private lastInteractionEvaluationMs = Number.NEGATIVE_INFINITY;
  private readonly explorationFraming = new ExplorationFraming();
  private cameraInteractionNearby = false;
  private lastInteractionX = Number.POSITIVE_INFINITY;
  private lastInteractionZ = Number.POSITIVE_INFINITY;
  private lastInteractionPointerX = Number.POSITIVE_INFINITY;
  private lastInteractionPointerY = Number.POSITIVE_INFINITY;
  private lastInteractionMode: GameplayMode | null = null;
  private readonly diagnosticsEnabled = new URLSearchParams(window.location.search).has("debug");
  private readonly graphicsQuality = new GraphicsQualitySettings();
  private readonly presentationPlayerPosition = new THREE.Vector3();
  private renderStats = {
    calls: 0,
    triangles: 0,
    points: 0,
    lines: 0,
    visibleMeshes: 0,
    shadowCasters: 0,
    batchedMeshes: 0,
    instancedMeshes: 0
  };
  private simulationFeedbackDisposers: Array<() => void> = [];
  /**
   * Local-only playtest instrumentation (LLM/03 §32). Never leaves the machine
   * and is never sent anywhere; in DEV it is readable at
   * `window.__NEVA_TELEMETRY.metrics()`.
   */
  private readonly telemetry = new SessionRecorder();
  /** Session origin; a telemetry reset starts a new session from here. */
  private telemetryStartedAtMs = performance.now();
  private lastAutosaveMs: number = 0;
  /**
   * When the periodic cadence last asked for a save, successful or not. A
   * failed save leaves `lastAutosaveMs` behind, and gating on it alone
   * re-requested a full save every frame while storage kept refusing.
   */
  private lastPeriodicAutosaveRequestMs: number = Number.NEGATIVE_INFINITY;
  /** One warning per run of failed autosaves; cleared by the next success. */
  private autosaveFailureNotified: boolean = false;
  private physicsAccumulatorSeconds: number = 0;
  /**
   * Monotonic count of fixed movement steps actually delivered. The accumulator
   * is capped, so a starved frame drops simulation time rather than catching all
   * of it up: wall-clock elapsed is therefore not a measure of how much chance
   * the player had to move, and automated traversal must pace itself on this
   * instead. DEV diagnostics only; never serialized.
   */
  private physicsStepCount = 0;
  private autosaveInFlight: boolean = false;
  private autosaveRequested: boolean = false;
  /**
   * Domain events are synchronous. Queue the first flush so an event listener
   * cannot snapshot a state halfway through the command that emitted the
   * event (for example, before a physical basic catch clears its session).
   */
  private autosaveFlushQueued: boolean = false;
  private benchmarkView: boolean = false;
  private benchmarkCameraView: ArtViewPreset | null = null;
  private benchmarkLightingFocus: THREE.Vector3 | null = null;
  private benchmarkPresentationTimeSeconds: number | null = null;
  private lastPresentationTimeSeconds = 0;
  private benchmarkGoldTestId: GoldTestId | null = null;
  private benchmarkWorldSeed = 42;
  private readonly worldAcceptance = localWorldAcceptanceRequested(new URLSearchParams(window.location.search));
  private captureMode = import.meta.env.DEV || this.worldAcceptance
    ? captureRenderMode(new URLSearchParams(window.location.search))
    : "final";
  private persistenceDisabled: boolean = false;
  private startupAttempt?: StartupCoordinator;
  private saveDecision?: (retry: boolean) => void;
  private bootReady: boolean = false;
  private renderReadyFramesRemaining: number = 0;
  private startupState: StartupState = createStartupState(0);
  private startupPromise: Promise<void> | null = null;
  private startupIntent: StartupIntent = "continue";
  private durableWritesEnabled: boolean = false;
  private readonly movementIntent = { x: 0, z: 0 };
  private readonly playerPresentation = new PlayerPresentationBuffer();
  private readonly boatPresentation = new BoatPresentationBuffer();
  private assetCoverage: AssetCoverageSummary = EMPTY_ASSET_COVERAGE_SUMMARY;
  private lastPresentedPlayer: PresentedPlayerFrame | null = null;
  private readonly playerPresence: PlayerPresence = { ...IDLE_PLAYER_PRESENCE };
  private lastBoatMotion: Readonly<Record<string, BoatMotionSample>> = {};
  private lockedInteractionTarget: ResolvedInteractionTarget | null = null;
  private journalRequestToken = 0;
  private journalOpenRequest: { folio: JournalFolio; token: number } | null = null;
  private mountTransitionRemainingSeconds = 0;
  private mountTransitionAction: "mount" | "dismount" | null = null;
  private readonly audioForward = new THREE.Vector3();
  private readonly canvasContainer: HTMLElement;
  private readonly questPointer: QuestPointerOverlay;
  private readonly npcBarks: NpcBarkOverlay;
  private readonly marketBoards: MarketBoardOverlay;
  private readonly rewardOverlay: WorldRewardOverlay;
  private readonly rewardFeedback = new RewardFeedbackPresentation();
  private marketLifeBoards: MarketLifeBoardDto[] = [];
  private lastMarketBoardRebuildMs = Number.NEGATIVE_INFINITY;
  private presentationHoldFrames = 0;
  private openingSkip: (() => void) | null = null;
  private finishIntro: ((played: boolean) => void) | null = null;
  /** The world point the quest pointer is chasing, refreshed with the waypoint. */
  private questPointerTarget: QuestPointerTarget | null = null;
  private readonly uiContainer: HTMLElement;
  private readonly resizeObserver: ResizeObserver;
  private mobileTouchDevice = false;
  private mobileLandscape = true;
  private mobileOrientationBlocked = false;
  private doorTransitionFade: boolean = false;
  private isTransitioningDoor: boolean = false;
  private doorTransitionTimer: ReturnType<typeof setTimeout> | null = null;
  private activeDialogueNpcId: string | null = null;
  private activeHint: { hintId: string; title: string; message: string; icon?: string } | null = null;
  private laborHud: LaborHudDto | null = null;
  private stormHelmHud: StormHelmHudDto | null = null;
  private laborShiftFeedback: LaborShiftFeedbackDto | null = null;
  private laborShiftFeedbackUntilMs = 0;
  private laborShiftFeedbackToken = 0;
  private isFarmGisHeld: boolean = false;
  private pendingCatchCargo: FishCargoState | null = null;
  private pendingCatchRecord: "first" | "weight" | "quality" | null = null;
  private uiSessionRevision = 0;
  private activeTool: EquippedToolId = "hands";
  /** Per errand, when a "not yet counted" notice may next be shown. Transient. */
  private readonly stepAheadNoticeAtMs = new Map<string, number>();

  private handleTalkNpc = (npcId: string) => {
    if (this.dialogueTalkResult?.npcId === npcId) return this.dialogueTalkResult.result;
    const result = this.sim.questDomain.talkToNpc(npcId);
    this.dialogueTalkResult = { npcId, result };
    return result;
  };

  private dismissActiveHint = (hintId: string): void => {
    if (this.activeHint?.hintId === hintId) this.activeHint = null;
  };

  private dismissPendingCatch = (): void => {
    this.pendingCatchCargo = null;
    this.pendingCatchRecord = null;
    if (this.activeModal === "catch") this.setActiveModal(null);
  };

  private uiRoot: ReactDOM.Root | null = null;
  private layoutEditor: PlacementEditor | null = null;
  /** Resolves once the DEV-only editor module has loaded; null in production. */
  private layoutEditorReady: Promise<void> | null = null;
  private layoutEditorChipVisible = false;


  constructor(canvas: HTMLCanvasElement, uiContainer: HTMLElement) {
    const debugActionTiming = import.meta.env.DEV
      ? Number(new URLSearchParams(window.location.search).get("debugActionTimeScale"))
      : Number.NaN;
    this.actionTimingScale = Number.isFinite(debugActionTiming) && debugActionTiming >= 1 && debugActionTiming <= 10
      ? debugActionTiming
      : 1;
    this.canvasContainer = canvas.parentElement ?? canvas;
    // Lives in the canvas container, which precedes `#ui-root` in the document,
    // so every React panel and modal paints over the pointer rather than under it.
    this.questPointer = new QuestPointerOverlay(this.canvasContainer);
    this.npcBarks = new NpcBarkOverlay(this.canvasContainer);
    this.marketBoards = new MarketBoardOverlay(this.canvasContainer);
    this.rewardOverlay = new WorldRewardOverlay(this.canvasContainer);
    this.uiContainer = uiContainer;
    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.worldScene = new WorldScene(canvas);
    this.worldScene.setQuality(this.graphicsQuality.effectiveTier);
    this.worldScene.setCaptureRenderMode(this.captureMode);
    if (this.worldAcceptance && new URLSearchParams(window.location.search).get("worldOnly") === "1") {
      uiContainer.style.display = "none";
    }
    this.gameCamera = new GameCamera(window.innerWidth / window.innerHeight);
    this.inputRouter = new InputRouter();
    this.saveRepo = new IndexedDbSaveRepository();

    this.uiRoot = ReactDOM.createRoot(uiContainer);
    window.addEventListener("resize", this.onResize);
    window.addEventListener("keydown", this.cancelArrivalView);
    window.addEventListener("pointerdown", this.cancelArrivalView);
    window.addEventListener("wheel", this.cancelArrivalView, { passive: true });
    window.addEventListener("orientationchange", this.onResize);
    window.visualViewport?.addEventListener("resize", this.onResize);
    screen.orientation?.addEventListener("change", this.onResize);
    this.resizeObserver.observe(this.canvasContainer);
    document.addEventListener("visibilitychange", this.onVisibilityChange);

    this.setupInputHandlers();
    if (import.meta.env.DEV) {
      window.__NEVA_TELEMETRY = {
        metrics: () => this.telemetry.getMetrics(performance.now() - this.telemetryStartedAtMs),
        events: () => this.telemetry.getEvents(),
        reset: () => {
          this.telemetry.reset();
          this.telemetryStartedAtMs = performance.now();
        }
      };
      const editorQuery = new URLSearchParams(window.location.search);
      this.layoutEditorChipVisible = editorQuery.has("place") || editorQuery.has("debug");
      // Imported on demand so the editor — and the three-mesh-bvh terrain
      // snapper it owns — never reaches the production bundle. A static import
      // kept both, plus a module-scope `THREE.Mesh.prototype.raycast` patch, in
      // every shipped build for a tool that cannot run there.
      this.layoutEditorReady = import("./PlacementEditor").then(({ PlacementEditor }) => {
        this.layoutEditor = new PlacementEditor(
          this.worldScene,
          () => this.renderUI(),
          (tag, commit) => this.applyLayoutEditLiveSync(tag, commit),
          () => this.refreshLayoutEditStaticWorld()
        );
        window.addEventListener("keydown", this.onLayoutEditorKeyDown);
        window.addEventListener("keyup", this.onLayoutEditorKeyUp);
        this.renderUI();
      });
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
      this.basicCastSource = null;
    }
    this.modeController.setGameplayMode(mode);
    // Mode transitions already cancel interruptible authored actions above.
    // Do not treat the transition into basic fishing as a blur: that would
    // cancel the charging state immediately after it is created.
    this.inputRouter.setMode(mode, { interrupt: false });
    if (mode !== "farm-placement") this.clearPlacementPreview();
  }

  private restoreGameplayModeFromState(): void {
    const state = this.sim.state;
    this.setGameplayMode(
      state.sportFishing
        ? "sport-fishing"
        : state.basicFishing
          ? "basic-fishing"
          : state.player.activeBoatId
            ? "boat-driving"
            : state.player.activeMountId
              ? "mounted"
              : "on-foot"
    );
  }

  private syncOverlayState(): void {
    const startupBlocksInput = this.startupState.status !== "ready";
    this.sim?.clock.setPaused(
      startupBlocksInput || this.mobileOrientationBlocked || this.benchmarkView || this.modeController.pausesSimulation
    );
    this.inputRouter.setWorldInputSuspended(
      startupBlocksInput || this.mobileOrientationBlocked || this.modeController.blocksWorldInput || this.benchmarkView
    );
    if (this.modeController.blocksWorldInput) this.cancelDoorTransition();
    if (this.activeModal !== "market") this.activeMarketId = null;
    if (this.activeModal !== "crafting") this.activeCraftingStationId = null;
  }

  private setLayoutEditorActive(active: boolean): void {
    if (!this.layoutEditor) return;
    // Toggling with F2 also reveals the chip for the rest of the session.
    if (active) this.layoutEditorChipVisible = true;
    if (active) this.worldScene.setLayoutEditingEnabled(true);
    this.layoutEditor.setActive(active);
    if (!active) this.worldScene.setLayoutEditingEnabled(false);
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
      if (event.code === "KeyZ") {
        event.preventDefault();
        if (event.shiftKey) {
          void this.layoutEditor.redo();
        } else {
          void this.layoutEditor.undo();
        }
        return;
      }
      if (event.code === "KeyY") {
        event.preventDefault();
        void this.layoutEditor.redo();
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
      const target = npcLayoutTarget(tag.id);
      const npc = ContentRegistry.npcs.get(target.npcId);
      const anchor = target.phase
        ? npc?.schedule?.find((slot) => slot.phase === target.phase)?.position : npc?.anchor;
      if (anchor) {
        anchor.x = commit.x;
        anchor.z = commit.z;
        anchor.rotationY = commit.rotationY;
      }
      this.worldScene.relocateNpcPresentation(target.npcId, commit.x, commit.z, commit.rotationY);
    }
  }

  private refreshLayoutEditStaticWorld(): void {
    if (!this.physicsWorld) return;
    this.physicsWorld.replaceStaticCollision(this.worldScene.syncLayoutEditPresentation());
  }

  private playOverlayAudio(previous: ActiveModal, next: ActiveModal): void {
    if (next && next !== previous) {
      gameAudio.playOneShot("ui-cloth");
      if (next === "journal") {
        gameAudio.playOneShot("page-turn");
      } else {
        gameAudio.playOneShot("ui-click");
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
      this.restoreGameplayModeFromState();
      this.basicCastSource = null;
    }
    if (modal !== "dialogue") {
      // The person just spoken to should not bark the moment the page closes.
      if (previous === "dialogue" && this.activeDialogueNpcId) {
        this.npcBarks.suppress(this.activeDialogueNpcId, performance.now() + POST_CONVERSATION_BARK_HOLD_MS);
      }
      this.activeDialogueNpcId = null;
      this.dialogueTalkResult = null;
      this.worldScene.setDialogueNpc(null);
    }
    if (modal === null) this.modeController.closeActive();
    else this.modeController.open(modal);
    this.playOverlayAudio(previous, this.activeModal);
    this.syncOverlayState();
  }

  public async start(): Promise<void> {
    if (this.isRunning) return;
    const query = new URLSearchParams(window.location.search);
    const benchmark = import.meta.env.DEV || this.worldAcceptance
      ? benchmarkRequest(query)
      : { preset: null, goldTestId: null, worldSeed: 42 };
    this.benchmarkGoldTestId = benchmark.goldTestId;
    this.benchmarkWorldSeed = benchmark.worldSeed;
    const requestedFieldOverlay = import.meta.env.DEV || this.worldAcceptance
      ? query.get("fieldOverlay")
      : null;
    if (requestedFieldOverlay && !WORLD_FIELD_OVERLAYS.includes(requestedFieldOverlay as WorldFieldOverlay)) {
      throw new Error(`Unknown world field overlay: ${requestedFieldOverlay}`);
    }
    this.worldScene.setDiagnosticOverlay(
      requestedFieldOverlay as WorldFieldOverlay | null,
      benchmark.worldSeed
    );
    // `?debug` already pays diagnostics cost; pass attribution on alternate
    // frames turns the same run into measurable shadow/atmosphere/water/post
    // evidence without changing any rendered output.
    this.worldScene.setGpuPassTimingEnabled(this.diagnosticsEnabled);
    // Debug-only sub-phase split for the render phase (`render:world-update`
    // vs `render:pipeline`) plus the shadow-atlas CPU rings.
    this.worldScene.setPhaseRecorder(
      this.diagnosticsEnabled ? (phase, elapsedMs) => this.recordPhase(phase, elapsedMs) : null
    );
    // `?shadowAtlas=0` keeps the legacy single-map path for A/B measurement.
    if ((import.meta.env.DEV || this.worldAcceptance) && query.get("shadowAtlas") === "0") {
      this.worldScene.setShadowAtlasEnabled(false);
    }
    const benchmarkPreset = benchmark.preset;
    const debugStartParameter = import.meta.env.DEV || this.worldAcceptance ? query.get("debugStart") : null;
    const debugStart = debugStartParameter && DEBUG_START_SCENARIOS.has(debugStartParameter as DebugStartScenario)
      ? debugStartParameter as DebugStartScenario
      : null;
    const shouldAutoStart = (import.meta.env.DEV || this.worldAcceptance) && (
      query.has("debug") || Boolean(benchmarkPreset) || Boolean(debugStart)
    );

    if (benchmarkPreset) {
      const artQuality = query.get("artQuality");
      if (artQuality !== null && !["low", "medium", "high"].includes(artQuality)) {
        throw new Error(`Unknown art quality tier: ${artQuality}`);
      }
      this.worldScene.setQuality(artQuality === "low" || artQuality === "medium" ? artQuality : "high");
    }
    this.persistenceDisabled = Boolean(benchmarkPreset || debugStart);
    window.__NEVA_RENDER_READY = false;
    this.renderReadyFramesRemaining = 0;
    this.startupState = createStartupState(0);
    this.bootReady = false;
    this.startupIntent = "continue";
    this.startupPromise = null;
    this.durableWritesEnabled = false;
    this.isRunning = true;
    this.lastTimeMs = performance.now();
    this.lastAutosaveMs = this.lastTimeMs;
    this.updateMobileViewportState();
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
      void this.preflightSave();
    }
    this.onResize();
    this.syncOverlayState();
    // The title screen and the normal HUD both draw from the packed UI atlas.
    // Warm the declared HUD pages before the first title paint; the content
    // pages follow on idle. Benchmark, acceptance and debug starts skip the
    // warm-up so their load and frame measurements stay comparable to earlier
    // runs, and this never blocks entry or the world preload in normal play.
    if (!shouldAutoStart && !this.worldAcceptance) startUiAtlasPrefetch();
    this.renderUI();
    requestAnimationFrame(this.loop);

    if (shouldAutoStart) this.beginLoading();
  }

  public beginLoading(userInitiated = false, intent: StartupIntent = "continue"): void {
    if (this.startupPromise || this.startupState.status !== "title") return;

    performance.mark("neva.startup.begin");
    this.startupIntent = intent;
    this.durableWritesEnabled = false;
    this.inputRouter.interrupt();
    const attempt = this.startupAttempt = new StartupCoordinator();
    this.bootReady = false;
    this.startupState = {
      ...this.startupState,
      status: "loading",
      phase: "save",
      loadedAssets: 0,
      message: "Reading your harbor log",
      errorMessage: null,
      errorDetail: null,
      errorCode: null,
      errorPhase: null
    };
    this.syncOverlayState();
    this.renderUI();
    // Browsers reject an autoplay audio-context resume unless this came from
    // the title button (or another real user gesture). Debug URLs auto-boot
    // without a gesture, so leave audio dormant until the first input.
    if (userInitiated) {
      void gameAudio.unlock();
      this.requestMobileLandscape();
    }

    this.startupPromise = this.prepareRuntime(attempt).catch((error: unknown) => {
      this.handleStartupFailure(error);
    });
  }

  private async preflightSave(signal?: AbortSignal): Promise<LoadGameResult> {
    try {
      const inspection = await this.saveRepo.inspectGame(signal);
      if (this.isRunning && !signal?.aborted) {
        this.updateStartupState({
          saveStatus: inspection.result.status === "loaded" ? "available" : inspection.result.status,
          saveSummary: inspection.summary
        });
      }
      return inspection.result;
    } catch (error) {
      console.error("[GameApp] Save preflight failed:", error);
      if (this.isRunning && !signal?.aborted) {
        this.updateStartupState({
          saveStatus: "unavailable",
          saveSummary: null
        });
      }
      return { status: "unavailable" };
    }
  }

  private async prepareRuntime(attempt: StartupCoordinator): Promise<void> {
    await yieldToTask(attempt.signal);
    const query = new URLSearchParams(window.location.search);
    const benchmark = import.meta.env.DEV || this.worldAcceptance
      ? benchmarkRequest(query)
      : { preset: null, goldTestId: null, worldSeed: 42 };
    const benchmarkPreset = benchmark.preset;
    const debugStartParameter = import.meta.env.DEV || this.worldAcceptance ? query.get("debugStart") : null;
    const debugStart = debugStartParameter && DEBUG_START_SCENARIOS.has(debugStartParameter as DebugStartScenario)
      ? debugStartParameter as DebugStartScenario
      : null;

    this.updateStartupState({ phase: "layout", message: "Preparing the coast" });
    await attempt.stage(() => WorldLayout.prepareTraversal(attempt.signal), WORLD_STARTUP_TIMEOUT_MS,
      new StartupTimeoutError("world-startup-timeout", "Island preparation timed out"));
    this.sim = new Simulation(undefined, {
      actionTimingScale: this.actionTimingScale,
      allowDebugCommands: import.meta.env.DEV
    });
    this.attachSimulationFeedback();
    this.updateStartupState({ phase: "save", message: "Reading your save" });
    const saveResult = this.persistenceDisabled
      ? { status: "empty" } as const
      : await this.preflightSave(attempt.signal);
    attempt.check();
    const shouldStartNewGame = this.startupIntent === "new-game";
    const shouldPlayWithoutSaving = this.startupIntent === "without-saving";
    let notifyArrival = () => {};
    const shouldCommitSave = !this.persistenceDisabled && !shouldPlayWithoutSaving;

    if (benchmark.goldTestId) {
      this.sim = new Simulation(createInitialGameState(benchmark.worldSeed), {
        actionTimingScale: this.actionTimingScale,
        allowDebugCommands: import.meta.env.DEV
      });
      this.attachSimulationFeedback();
      this.modeController.restoreFromState(this.sim.state);
      this.inputRouter.setMode(this.mode);
    }

    // A Continue action consumes the already-inspected, migrated, validated
    // envelope. New Game never constructs from it and never writes over it
    // until the new world has finished loading and is ready to play.
    const resumedExistingSave = !this.persistenceDisabled && !shouldStartNewGame
      && !shouldPlayWithoutSaving && saveResult.status === "loaded";
    if (resumedExistingSave) {
      const candidate = structuredClone(saveResult.envelope.state);
      const awaySummary = applyOfflineProgression(candidate, Date.now());
      this.sim = new Simulation(candidate, {
        actionTimingScale: this.actionTimingScale,
        allowDebugCommands: import.meta.env.DEV
      });
      this.attachSimulationFeedback();


      // Restore the gameplay mode from the canonical simulation state: offline
      // progression and constructor reconciliation may have changed the fields
      // `modeFromState` reads, so the pre-offline envelope is a stale source.
      this.modeController.restoreFromState(this.sim.state);
      this.inputRouter.setMode(this.mode);
      this.sim.clock.setPaused(false);
      this.syncOverlayState();
      notifyArrival = () => this.notifyAwaySummary(awaySummary);

      console.info("[GameApp] Loaded existing game save from IndexedDB.");
    } else if (this.persistenceDisabled || shouldPlayWithoutSaving) {
      this.durableWritesEnabled = false;
    } else if (shouldStartNewGame) {
      this.durableWritesEnabled = false;
      this.modeController.restoreFromState(this.sim.state);
      this.inputRouter.setMode(this.mode);
      this.syncOverlayState();
    } else if (saveResult.status === "empty") {
      this.durableWritesEnabled = false;
    } else {
      throw new Error("Your save could not be read. Reload to choose a recovery option.");
    }

    if (debugStart) this.applyDebugStartScenario(debugStart);

    const benchmarkCameraView = benchmarkPreset ? resolveArtViewPreset(benchmarkPreset) : undefined;
    if (benchmarkCameraView) {
      this.sim.setDebugPlayerPose(benchmarkCameraView.playerPose);
      const minuteParameter = query.get("artMinute") ?? (benchmark.goldTestId ? "720" : null);
      const minute = minuteParameter === null ? Number.NaN : Number(minuteParameter);
      if (Number.isSafeInteger(minute) && minute >= 0) this.sim.setDebugMinute(minute);
      const weather = query.get("artWeather") ?? (benchmark.goldTestId ? "clear" : null);
      if (["clear", "cloudy", "light-rain", "heavy-rain", "windy", "fog", "storm", "drought"].includes(weather ?? "")) {
        this.sim.setDebugWeather(weather as Parameters<Simulation["setDebugWeather"]>[0]);
      }
      const presentationTimeParameter = query.get("artTimeSeconds")
        ?? (benchmark.goldTestId ? "0" : null);
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

    this.physicsWorld = await prepareStartupWorld({
      attempt,
      state: this.sim.state,
      scene: this.worldScene,
      onState: update => this.updateStartupState(update)
    });
    this.playerPresentation.reset(this.sim.state.player, undefined, "load");
    this.boatPresentation.reset(this.sim.state.boats);
    if (import.meta.env.DEV) {
      const { CollisionDebugView } = await import("../diagnostics/CollisionDebugView");
      this.collisionDebugView?.dispose();
      this.collisionDebugView = new CollisionDebugView(this.worldScene.scene, this.canvasContainer);
    }
    this.assetCoverage = getAssetCoverageSummary(this.sim.state.worldSeed);
    this.updateStartupState({ phase: "presentation", message: "Preparing your arrival" });
    await attempt.stage(async () => {
      const time = this.benchmarkPresentationTimeSeconds ?? 0;
      await this.worldScene.syncWithSimulation(this.sim, time);
      attempt.check();
      const position = this.presentationPlayerPosition.set(this.sim.state.player.x, this.sim.state.player.y, this.sim.state.player.z);
      if (this.benchmarkCameraView) {
        this.gameCamera.setFixedView(this.benchmarkCameraView.cameraPosition,
          this.benchmarkCameraView.cameraTarget, this.benchmarkCameraView.fovDegrees);
      } else {
        this.gameCamera.update(position, this.mode, 0, undefined, this.physicsWorld ?? undefined, {
          player: stationaryPlayerMotion(this.sim.state.player), discontinuityReason: "load", discontinuitySequence: 1,
          lookHint: this.worldScene.getSportFishingCameraHint()?.lookHint
        });
      }
      this.worldScene.updateEnvironment(this.sim.state, time, this.benchmarkLightingFocus ?? position);
      await this.worldScene.prepareForEntry(this.gameCamera.camera);
      for (let frame = 0; frame < 2; frame++) {
        await yieldToTask(attempt.signal);
        this.worldScene.render(this.gameCamera.camera, 0);
      }
      this.gameCamera.camera.updateMatrixWorld();
      this.evaluateInteractionTarget();
    }, 30_000, new StartupTimeoutError("presentation-startup-timeout", "Arrival preparation timed out"));

    if (shouldCommitSave) {
      this.updateStartupState({ phase: "commit", message: "Saving your harbor log" });
      while (!await this.saveRepo.saveGame(this.sim.state, attempt.signal)) {
        attempt.check();
        this.updateStartupState({ status: "error", recovery: "save", errorCode: "save-failed", errorPhase: "commit",
          errorMessage: "Your world is ready, but your harbor log could not be saved." });
        const retry = await new Promise<boolean>((resolve, reject) => {
          const abort = () => { this.saveDecision = undefined; reject(attempt.signal.reason); };
          attempt.signal.addEventListener("abort", abort, { once: true });
          this.saveDecision = choice => { attempt.signal.removeEventListener("abort", abort); this.saveDecision = undefined; resolve(choice); };
        });
        if (!retry) break;
        this.updateStartupState({ status: "loading", errorMessage: null });
      }
      this.durableWritesEnabled = this.startupState.status !== "error";
      // The entry commit is a save: the periodic cadence starts from it, not
      // from the title screen, so a long load does not re-save on reveal.
      if (this.durableWritesEnabled) this.lastAutosaveMs = performance.now();
    }
    attempt.check();
    syncWorldAudio({ clock: this.sim.state.clock, position: this.sim.state.player, mode: this.mode, weather: this.sim.state.weather.type,
      sprintExhausted: this.sim.state.player.traversal.sprintExhausted, paused: false });
    gameAudio.startAmbience();
    if (!debugStart && !this.benchmarkView && !this.worldAcceptance && !query.has("debug")
      && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      this.updateStartupState({ status: "intro", phase: "complete", message: "",
        introKind: resumedExistingSave ? "continue" : "new" });
      // The film owns the output; the prepared world's music and ambience wait
      // muted underneath it instead of scoring over the narration.
      gameAudio.setCinematicHold(true);
      try {
        const played = await this.awaitIntro(attempt);
        attempt.check();
        if (!played && (shouldStartNewGame || shouldPlayWithoutSaving || saveResult.status === "empty")) {
          await playOpeningCamera(this.gameCamera.camera, ART_VIEW_PRESETS["farm-mountains"],
            () => this.worldScene.render(this.gameCamera.camera, 0), attempt.signal, (skip) => { this.openingSkip = skip; });
          attempt.check();
        }
      } finally {
        gameAudio.setCinematicHold(false);
      }
    }
    this.updateStartupState({ status: "revealing", phase: "complete", message: "Ready" });
    await new Promise<void>(resolve => {
      const screen = document.querySelector(".start-screen");
      let timer: ReturnType<typeof setTimeout>;
      const finish = () => { clearTimeout(timer); screen?.removeEventListener("transitionend", end); attempt.signal.removeEventListener("abort", finish); resolve(); };
      const end = (event: Event) => { if (event.target === screen && (event as TransitionEvent).propertyName === "opacity") finish(); };
      screen?.addEventListener("transitionend", end);
      attempt.signal.addEventListener("abort", finish, { once: true });
      timer = setTimeout(finish, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 450);
    });
    attempt.check();
    this.inputRouter.interrupt();
    this.physicsAccumulatorSeconds = 0;
    this.lastTimeMs = performance.now();
    this.bootReady = true;
    this.updateMobileViewportState();
    this.renderReadyFramesRemaining = this.benchmarkCameraView ? 4 : 2;
    this.attachDebugHarness();
    performance.mark("neva.startup.interactive");
    this.updateStartupState({ status: "ready" });
    notifyArrival();
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("place")) {
      void this.layoutEditorReady?.then(() => this.setLayoutEditorActive(true));
    }

  }

  /**
   * Resolves when the entry cinematic ends, is skipped, or reports that it
   * could not play. The intro never throws for its own failure: a missing or
   * blocked film must not fail startup, only lose its presentation.
   */
  private awaitIntro(attempt: StartupCoordinator): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      const settle = (played: boolean): void => {
        attempt.signal.removeEventListener("abort", abort);
        if (this.finishIntro !== settle) return;
        this.finishIntro = null;
        resolve(played);
      };
      const abort = (): void => {
        this.finishIntro = null;
        reject(attempt.signal.reason);
      };
      attempt.check();
      attempt.signal.addEventListener("abort", abort, { once: true });
      this.finishIntro = settle;
    });
  }

  private updateStartupState(update: Partial<StartupState>): void {
    if (!this.isRunning) return;
    if (update.phase && update.phase !== this.startupState.phase) {
      performance.mark(`neva.startup.${update.phase}`);
      update = { progress: { kind: "indeterminate" }, slow: false, ...update };
    }
    this.startupState = { ...this.startupState, ...update };
    this.syncOverlayState();
    this.renderUI();
  }

  private handleStartupFailure(error: unknown): void {
    if (!this.isRunning) return;
    this.startupAttempt?.cancel(error);
    this.durableWritesEnabled = false;
    this.worldScene.dispose();
    this.bootReady = false;
    window.__NEVA_RENDER_READY = false;
    this.renderReadyFramesRemaining = 0;
    const errorPhase = this.startupState.phase;
    const detail = error instanceof Error ? error.message : String(error);
    const errorCode = error instanceof StartupTimeoutError
      ? error.code
      : errorPhase === "save"
        ? "save-failed"
        : errorPhase === "assets"
          ? "assets-failed"
          : errorPhase === "world"
            ? "world-failed"
            : errorPhase === "physics"
              ? "physics-failed"
              : "startup-failed";
    const message = errorPhase === "assets"
      ? "We couldn’t finish loading the shoreline. Check your connection and try again."
      : errorPhase === "save"
        ? "We couldn’t read your harbor log. Try again."
        : errorPhase === "physics"
          ? "We couldn’t finish preparing the paths. Try again."
          : "We couldn’t prepare the world. Try again.";
    console.error("[GameApp] Deferred startup failed", {
      phase: errorPhase,
      code: errorCode,
      loadedAssets: this.startupState.loadedAssets,
      totalAssets: this.startupState.totalAssets,
      detail
    }, error);
    this.startupState = {
      ...this.startupState,
      status: "error",
      recovery: "reload",
      message,
      errorMessage: message,
      errorDetail: import.meta.env.DEV && detail ? detail : null,
      errorCode,
      errorPhase
    };
    this.syncOverlayState();
    this.renderUI();
  }

  private retryStartup = (): void => {
    if (this.startupState.status !== "error") return;
    if (this.saveDecision) { this.saveDecision(true); return; }
    window.location.reload();
  };

  private applyDebugStartScenario(scenario: DebugStartScenario): void {
    applyDebugStartScenario(this.sim, scenario);
    this.modeController.restoreFromState(this.sim.state);
    this.inputRouter.setMode(this.mode);
    this.syncOverlayState();
  }

  private setupInputHandlers(): void {
    this.inputRouter.onAction((action: GameAction) => {
      if (this.startupState.status !== "ready") return;
      const isHudOverlayOrToolAction =
        action.startsWith("open-") ||
        action.startsWith("select-tool-");
      const catchSummary = this.sim.state.basicFishing?.phase === "caught";
      if (this.modeController.blocksHudOverlaysAndTools && isHudOverlayOrToolAction) {
        if (!(catchSummary && action === "open-inventory")) return;
      }
      switch (action) {
        case "interact":
          if (this.mode === "sport-fishing" || this.mode === "basic-fishing" || this.activeModal) return;
          if (this.mode === "farm-placement") this.confirmCropPlacement();
          else this.handleContextInteract();
          break;
        case "interact-release":
          if (this.mode === "basic-fishing" && this.basicCastSource === "interact") {
            this.releaseBasicFishingCast();
          }
          break;
        case "use-primary":
          if (this.activeModal) return;
          if (this.mode === "farm-placement") this.confirmCropPlacement();
          else if (this.mode === "on-foot" || this.mode === "boat-driving") this.handlePrimaryUse();
          break;
        case "use-primary-release":
          if (this.mode === "basic-fishing" && this.basicCastSource === "primary") {
            this.releaseBasicFishingCast();
          }
          break;
        case "use-secondary":
          if (this.activeModal) return;
          if (this.mode === "farm-placement") this.exitCropPlacement();
          else if (this.mode === "on-foot" || this.mode === "boat-driving") this.inspectPointedTarget();
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
            if (this.cancelFarmingAction()) {
              this.cancelChargingCastWithoutPause();
              return;
            }
          }
          if (this.cancelChargingCastWithoutPause()) return;
          if (this.mode === "farm-placement") {
            if (this.activeModal) {
              this.modeController.handleEscape();
              this.syncOverlayState();
              return;
            }
            this.exitCropPlacement();
            return;
          }
          if (this.mode === "basic-fishing" && !this.activeModal && !this.farmingActions.isActive) {
            this.cancelBasicFishingLine();
            return;
          }
          this.modeController.handleEscape();
          this.syncOverlayState();
          break;
        case "open-character":
        case "open-inventory":
        case "open-journal":
        case "open-map":
        case "open-ledger": {
          const overlay = {
            "open-character": "character",
            "open-inventory": "inventory",
            "open-journal": "journal",
            "open-map": "map",
            "open-ledger": "ledger"
          }[action] as "character" | "inventory" | "journal" | "map" | "ledger";
          if (overlay === "character") {
            const blocker = this.characterScreenBlocker();
            if (blocker) {
              this.notify(blocker, "warning", 1800);
              break;
            }
          }
          if (!this.openOverlayFromHotkey(overlay)) break;
          const previous = this.activeModal;
          this.modeController.toggle(overlay);
          this.playOverlayAudio(previous, this.activeModal);
          this.syncOverlayState();
          break;
        }
        case "open-planning": {
          if (!this.sim.state.quests.unlockedFeatureIds.includes("feature.expedition_planner")) {
            this.notify("Complete your first expedition to unlock the expedition board", "warning");
            break;
          }
          if (!this.openOverlayFromHotkey("expedition")) break;
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
          if (this.mode === "basic-fishing") {
            const attempt = this.sim.state.basicFishing;
            if (attempt?.phase === "bite-reaction") {
              const result = this.sim.execute({ type: "fishing.hook-bite-basic" });
              if (!result.success) this.notify(result.reason ?? "The fish slipped the hook", "danger");
            } else if (attempt?.phase === "caught") {
              const result = this.sim.execute({ type: "fishing.commit-basic" });
              if (!result.success) this.notify(result.reason ?? "The satchel is full", "danger");
            } else if (attempt?.phase === "escaped") {
              this.sim.execute({ type: "fishing.cancel-basic" });
            }
            break;
          }
          this.applySportFishingInput();
          break;
        case "fish-slack":
        case "fish-brace":
        case "fish-left":
        case "fish-right":
          this.applySportFishingInput();
          break;
        case "fishing.toggle-lure": {
          const result = this.sim.execute({ type: "fishing.toggle-lure" });
          if (!result.success) this.notify(result.reason ?? "Could not change the lure", "warning");
          else {
            const lureItemId = this.sim.state.player.preparedLureItemId;
            const lureName = lureItemId
              ? ContentRegistry.items.get(lureItemId)?.name ?? "Woven Lure"
              : "Lure";
            this.setToast(lureItemId ? `${lureName} armed` : "Lure put away", 1800);
          }
          this.requestAutosave();
          break;
        }
        default:
          break;
      }
    });
    this.inputRouter.onInterruption(() => {
      if (!this.bootReady) return;
      this.cancelFarmingAction();
      this.clearFarmGisHold();
      this.cancelChargingCastWithoutPause();
      this.basicCastSource = null;
      this.hudFishingHold = { isReeling: false, isSlacking: false, isBracing: false, rodDirectionAngle: 0 };
      this.basicFishingWidgetHold = false;
    });
  }

  private cancelArrivalView = (): void => { this.gameCamera.cancelArrivalView(); };

  private playRewardCameraBeat(trauma: number, hold = false): void {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    this.gameCamera.addTrauma(trauma);
    // Retain the last canvas for three presentations; fixed-step simulation still advances.
    if (hold) this.presentationHoldFrames = 3;
  }

  private attachSimulationFeedback(): void {
    this.uiSessionRevision += 1;
    this.rewardFeedback.reset();
    this.rewardFeedback.sample(this.sim.state);
    for (const dispose of this.simulationFeedbackDisposers) dispose();
    const presentationSeconds = (): number =>
      this.lastPresentationTimeSeconds > 0
        ? this.lastPresentationTimeSeconds
        : performance.now() / 1000;
    const presentedPlayerPosition = (): { x: number; z: number } => {
      const player = this.lastPresentedPlayer ?? this.sim.state.player;
      return { x: player.x, z: player.z };
    };
    const playMarketResponse = (
      marketId: string,
      kind: "sale" | "purchase"
    ): void => {
      this.marketBoards.acknowledge(marketId, kind);
      // The transaction changed supply immediately; rebuild the board on the
      // next frame instead of waiting for the ordinary two-second cadence.
      this.lastMarketBoardRebuildMs = Number.NEGATIVE_INFINITY;
      const market = WORLD_MARKET_LOCATIONS[marketId];
      if (market) {
        this.worldScene.playWorldReaction(
          "trade",
          market.position,
          presentationSeconds()
        );
      }
    };
    const playStationResponse = (
      stationId: string,
      kind: "work" | "ready"
    ): void => {
      const station = WORLD_STATION_DEFINITIONS[stationId];
      if (!station) return;
      this.worldScene.playWorldReaction(
        kind,
        station.position,
        presentationSeconds()
      );
    };
    this.simulationFeedbackDisposers = [
      bindUiHoverAudio(document.body),
      attachTelemetry(this.sim.events, this.telemetry, {
        gameMinute: () => this.sim.state.clock.currentMinute,
        realElapsedMs: () => performance.now() - this.telemetryStartedAtMs,
        activeQuestId: () => focusedQuestTrack(this.sim.state.quests).activeQuestId
      }),
      bindDomainAudio(this.sim.events, () => {
        const player = this.lastPresentedPlayer ?? this.sim.state.player;
        return { x: player.x, y: player.y, z: player.z };
      }),
      this.sim.events.on("FishLanded", ({ cargoId, speciesId, weightKg, record }) => {
        if (record) this.playRewardCameraBeat(0.4, true);
        this.worldScene.playWorldReaction(
          record ? "milestone" : "work",
          presentedPlayerPosition(),
          presentationSeconds()
        );
        this.worldScene.playSportFishingEndCue("landed");
        const speciesName = ContentRegistry.fishSpecies.get(speciesId)?.name ?? "fish";
        const moment =
          record === "first"
            ? " — new species recorded!"
            : record === "weight"
              ? " — heaviest yet!"
              : record === "quality"
                ? " — finest yet!"
                : "";
        this.notify(`Landed ${weightKg.toFixed(1)} kg ${speciesName}${moment}`, "reward", 4200, "field");
        this.worldScene.playPlayerAction("pickup");
        const carriedId = this.sim.state.player.carriedFishCargoId;
        const cargo = this.sim.state.fishCargo[cargoId] ?? (carriedId ? this.sim.state.fishCargo[carriedId] : null);
        if (cargo) {
          this.pendingCatchCargo = cargo;
          this.pendingCatchRecord = record ?? null;
          this.setActiveModal("catch");
        }
        // Freshness has to be taught before the first sale, or the price
        // penalty reads as a bug rather than a system the player can plan for.
        this.showContextualHint(
          "hint.cargo_freshness",
          "The Catch Is Perishable",
          "Fish lose freshness from the moment they are landed, and buyers pay less for a tired catch. Ice slows it. Carry trade packs to an inland buyer or a posted fish commission; the Harbor Fish Market does not buy them over the counter.",
          "waves"
        );
      }),
      this.sim.events.on("FishEscaped", ({ reason }) => {
        this.worldScene.playSportFishingEndCue(
          reason === "snapped" ? "snapped" : reason === "no-cargo-space" ? "stow-failed" : "escaped"
        );
        this.setToast(
          reason === "snapped"
            ? "Line snapped — the fish got away"
            : reason === "no-cargo-space"
              ? "No cargo space—the fish escaped"
              : "The fish slipped the line",
          3200
        );
        this.worldScene.playPlayerAction("slack");
      }),
      this.sim.events.on("BasicFishingMinigameStarted", ({ hasTreasure }) => {
        if (hasTreasure) this.notify("Sunken treasure spotted", "info", 1800);
        this.worldScene.playPlayerAction("reel");
      }),
      this.sim.events.on("BasicFishingResolved", ({ catchItemId, reason, record, isPerfect }) => {
        if (record || isPerfect) this.playRewardCameraBeat(record ? 0.4 : 0.25, Boolean(record));
        if (catchItemId) {
          this.worldScene.playWorldReaction(
            record || isPerfect ? "milestone" : "work",
            presentedPlayerPosition(),
            presentationSeconds()
          );
          this.worldScene.playPlayerAction("pickup");
          if (record === "first") this.notify("New species recorded in the journal", "reward", 3200);
          else if (record === "quality") this.notify("Finest of its kind yet", "reward", 3200);
        } else if (reason === "escaped") {
          this.worldScene.playPlayerAction("slack");
        } else if (reason !== "cancelled") {
          this.notify("Nothing bit this time", "info", 2200);
        }
      }),
      this.sim.events.on("ContractCompleted", ({ rewardMoney }) => {
        this.worldScene.playWorldReaction(
          "milestone",
          presentedPlayerPosition(),
          presentationSeconds()
        );
        this.notify(`Contract complete · +${rewardMoney} G`, "reward", 3600, "trade");
      }),
      this.sim.events.on("QuestStarted", ({ questId }) => {
        const quest = ContentRegistry.quests.get(questId);
        this.notify(`New errand · ${quest?.questTitle ?? "A new task"}`, "success", 3600, "story");
      }),
      this.sim.events.on("QuestProgressed", ({ current, total }) => {
        const dto = this.sim.questDomain.getActiveQuestDto();
        if (dto?.isStepComplete && dto.currentStepIndex >= dto.totalSteps) {
          this.notify(
            dto.objectiveDescription,
            dto.isQuestReadyToTurnIn ? "success" : "warning",
            3600
          );
          return;
        }
        this.notify(`Errand progress · ${Math.min(current, total)} / ${total}`, "success", 2200);
      }),
      this.sim.events.on("QuestStepAhead", ({ questId, currentStepDescription }) => {
        // Work that would count later, done early, used to vanish without a
        // word. Once a minute per errand is enough to make the order legible.
        const nowMs = performance.now();
        if (nowMs < (this.stepAheadNoticeAtMs.get(questId) ?? 0)) return;
        this.stepAheadNoticeAtMs.set(questId, nowMs + 60_000);
        this.notify(`Not yet counted · first, ${currentStepDescription.charAt(0).toLowerCase()}${currentStepDescription.slice(1)}`, "info", 4200);
      }),
      this.sim.events.on("PlaceDiscovered", ({ title, view }) => {
        this.notify(`Discovered · ${title}`, "reward", 3600, "story");
        const preset = view ? resolveArtViewPreset(view) : undefined;
        if (preset && !this.activeModal && !this.benchmarkView) this.gameCamera.beginArrivalView(preset.cameraPosition, preset.cameraTarget, preset.fovDegrees);
        this.requestAutosave();
      }),
      this.sim.events.on("ActCompleted", () => {
        this.playRewardCameraBeat(0.5, true);
        this.worldScene.playWorldReaction(
          "milestone",
          presentedPlayerPosition(),
          presentationSeconds()
        );
      }),
      this.sim.events.on("QuestCompleted", ({ questId, rewardMoney }) => {
        this.playRewardCameraBeat(0.3);
        this.worldScene.playWorldReaction(
          "milestone",
          presentedPlayerPosition(),
          presentationSeconds()
        );
        const quest = ContentRegistry.quests.get(questId);
        const reward = rewardMoney == null ? "" : ` · +${rewardMoney} G`;
        this.notify(`Errand complete · ${quest?.questTitle ?? "Task finished"}${reward}`, "reward", 3600, "story");
      }),
      this.sim.events.on("BoatBoarded", ({ boatId }) => {
        const boat = this.sim.state.boats[boatId];
        const name = boat ? ContentRegistry.boats.get(boat.boatTypeId)?.name ?? "vessel" : "vessel";
        this.worldScene.beginPlayerAttachmentAction("board", boatId);
        this.setToast(`Aboard the ${name.toLowerCase()}`, 1800);
      }),
      this.sim.events.on("BoatDocked", ({ boatId }) => {
        this.worldScene.playBoatResponse(boatId, "dock", presentationSeconds());
        const boat = this.sim.state.boats[boatId];
        const returningWithCargo = Boolean(boat?.fishCargoSlotIds.some(Boolean));
        this.worldScene.playWorldReaction(
          returningWithCargo ? "homecoming" : "work",
          presentedPlayerPosition(),
          presentationSeconds()
        );
        this.worldScene.beginPlayerAttachmentAction("dock", boatId);
        this.setToast("Docked at the mooring", 2200);
      }),
      this.sim.events.on("CargoLoaded", ({ boatId, slotIndex }) => {
        this.worldScene.playBoatResponse(
          boatId,
          "cargo-load",
          presentationSeconds(),
          slotIndex
        );
      }),
      this.sim.events.on("SeasonChanged", ({ season, previousSeason, year }) => {
        // The calendar turning is the moment new fish, new prices and new
        // contracts become reachable. It used to pass in silence because no
        // player ever reached it.
        const label = season.charAt(0).toUpperCase() + season.slice(1);
        const from = previousSeason.charAt(0).toUpperCase() + previousSeason.slice(1);
        this.notify(`${from} gives way to ${label} — Year ${year}`, "reward", 5200);
        this.showContextualHint(
          "hint.season_turn",
          "The Season Turns",
          "Different fish run in different seasons, and the market pays differently for them. Check the chart and the ledger — what was scarce may now be in reach.",
          "sprout"
        );
      }),
      this.sim.events.on("MountBoarded", ({ mountId }) => {
        this.setGameplayMode("mounted");
        if (!isCarriage(this.sim.state.mounts[mountId])) {
          this.worldScene.beginPlayerAttachmentAction("mount", mountId);
          this.beginMountTransition("mount");
        }
        this.setToast(mountId === STARTER_DONKEY_ID ? "Riding the donkey" : "Driving carriage · W/S move · A/D steer · Shift trot", 1800);
      }),
      this.sim.events.on("MountDisembarked", ({ mountId }) => {
        this.setGameplayMode("on-foot");
        if (!isCarriage(this.sim.state.mounts[mountId])) {
          this.worldScene.beginPlayerAttachmentAction("dismount", mountId);
          this.beginMountTransition("dismount");
        }
      }),
      this.sim.events.on("FishHooked", () => this.worldScene.playPlayerAction("hookset")),
      this.sim.events.on("CropPlanted", ({ placedCropId }) => {
        this.worldScene.playWorldReaction(
          "work",
          presentedPlayerPosition(),
          presentationSeconds()
        );
        const crop = this.sim.state.crops[placedCropId];
        if (crop) {
          const world = farmLocalToWorld(crop.farmId, crop);
          this.worldScene.spawnFarmingVfx(
            "dirt",
            { x: world.x, y: WorldLayout.terrainHeight(world.x, world.z) + 0.05, z: world.z },
            presentationSeconds()
          );
        }
        this.requestAutosave();
      }),
      this.sim.events.on("CropWatered", () => {
        this.worldScene.playWorldReaction(
          "work",
          presentedPlayerPosition(),
          presentationSeconds()
        );
        this.requestAutosave();
      }),
      this.sim.events.on("CropHarvested", () => {
        this.worldScene.playWorldReaction(
          "work",
          presentedPlayerPosition(),
          presentationSeconds()
        );
        this.requestAutosave();
      }),
      this.sim.events.on("CropUnrooted", ({ placedCropId }) => {
        if (this.inspectedCrop?.placedCropId === placedCropId) this.inspectedCrop = null;
        this.worldScene.playWorldReaction(
          "work",
          presentedPlayerPosition(),
          presentationSeconds()
        );
        this.requestAutosave();
      }),
      this.sim.events.on("FarmFertilized", () => {
        this.worldScene.playWorldReaction(
          "work",
          presentedPlayerPosition(),
          presentationSeconds()
        );
        this.requestAutosave();
      }),
      this.sim.events.on("IrrigationInstalled", () => this.requestAutosave()),
      this.sim.events.on("FarmIrrigated", () => {
        this.worldScene.playWorldReaction(
          "work",
          presentedPlayerPosition(),
          presentationSeconds()
        );
        this.requestAutosave();
      }),
      this.sim.events.on("RecipeStarted", ({ jobId }) => {
        const job = this.sim.state.processingJobs[jobId];
        if (job) playStationResponse(job.stationId, "work");
        this.requestAutosave();
      }),
      this.sim.events.on("ProcessingJobReady", ({ recipeId, stationId }) => {
        const recipe = ContentRegistry.recipes.get(recipeId);
        this.notify(`${recipe?.name ?? "Station job"} is ready to collect`, "success", 4200, "field");
        playStationResponse(stationId, "ready");
        this.requestAutosave();
      }),
      this.sim.events.on("RecipeCompleted", ({ stationId }) => {
        playStationResponse(stationId, "work");
        this.requestAutosave();
      }),
      this.sim.events.on("ProficiencyLeveledUp", ({ skill, newRank }) => {
        const progress = this.sim.inspectSkillProgress().find((entry) => entry.skill === skill);
        const benefits = progress?.currentRankBenefits ?? [];
        const featured = benefits[0];
        const more = benefits.length > 1 ? ` · ${benefits.length - 1} more in Skills` : "";
        this.notify(
          `${progress?.label ?? skill} reached ${newRank}${featured ? ` · ${featured}${more}` : " · See Skills in your journal"}`,
          "reward",
          4800,
          "field"
        );
      }),
      this.sim.events.on("EquipmentEquipped", () => this.requestAutosave()),
      this.sim.events.on("EquipmentPresetSaved", () => this.requestAutosave()),
      this.sim.events.on("EquipmentPresetApplied", () => this.requestAutosave()),
      this.sim.events.on("FishLanded", () => this.requestAutosave()),
      this.sim.events.on("FishEscaped", () => this.requestAutosave()),
      this.sim.events.on("FishHooked", () => this.requestAutosave()),
      this.sim.events.on("BoatBoarded", () => this.requestAutosave()),
      this.sim.events.on("BoatDocked", () => this.requestAutosave()),
      this.sim.events.on("BoatPurchased", ({ cost }) => {
        this.notify(`Coastal skiff commissioned · ${cost} G`, "reward", 2600);
        this.requestAutosave();
      }),
      this.sim.events.on("BasicFishingStarted", () => this.requestAutosave()),
      this.sim.events.on("BasicFishingResolved", () => this.requestAutosave()),
      this.sim.events.on("ItemSold", ({ marketId }) => {
        playMarketResponse(marketId, "sale");
        this.requestAutosave();
      }),
      this.sim.events.on("ItemPurchased", ({ marketId }) => {
        playMarketResponse(marketId, "purchase");
        this.requestAutosave();
      }),
      this.sim.events.on("SeedPurchased", ({ marketId }) => {
        playMarketResponse(marketId, "purchase");
        this.requestAutosave();
      }),
      this.sim.events.on("RodPurchased", ({ marketId }) => {
        playMarketResponse(marketId, "purchase");
        this.requestAutosave();
      }),
      this.sim.events.on("RodEquipped", () => this.requestAutosave()),
      this.sim.events.on("FishSold", ({ marketId }) => {
        playMarketResponse(marketId, "sale");
        this.requestAutosave();
      }),
      this.sim.events.on("ContractCompleted", () => this.requestAutosave()),
      this.sim.events.on("QuestStarted", () => this.requestAutosave()),
      this.sim.events.on("QuestProgressed", () => this.requestAutosave()),
      this.sim.events.on("QuestCompleted", () => this.requestAutosave())
    ];
  }

  private loop = (nowMs: number): void => {
    if (!this.isRunning) return;

    const elapsedSeconds = Math.max(0, (nowMs - this.lastTimeMs) / 1000);
    const deltaSeconds = Math.min(0.1, elapsedSeconds);
    this.lastTimeMs = nowMs;

    // FPS and quality sampling read raw elapsed time. The bounded delta above is
    // only the simulation catch-up guard; reusing it here understated stalls.
    const resumedFromHiddenTab = this.hiddenSinceLastFrame;
    this.hiddenSinceLastFrame = false;
    if (resumedFromHiddenTab) {
      this.frameCount = 0;
      this.fpsTimer = 0;
    } else {
      this.frameCount++;
      this.fpsTimer += elapsedSeconds;
      this.recordFrameTiming(elapsedSeconds);
    }
    if (this.fpsTimer >= 0.5) {
      this.fps = Math.round(this.frameCount / this.fpsTimer);
      this.frameCount = 0;
      this.fpsTimer = 0;
    }

    // Keep the title/loading layer responsive while save data, GLBs, world
    // population, and physics finish. Only the static scene is rendered until
    // the authoritative runtime is ready; no simulation time advances.
    if (!this.bootReady) {
      if (this.startupState.status === "revealing") this.worldScene.render(this.gameCamera.camera, deltaSeconds);
      this.renderUiForFrame(nowMs);
      requestAnimationFrame(this.loop);
      return;
    }

    // Debug-only main-thread phase attribution. Shipped frames pay nothing.
    const frameStartMark = performance.now();
    let phaseMark = frameStartMark;

    if (!this.benchmarkView && !resumedFromHiddenTab
      && this.graphicsQuality.sampleFrame(elapsedSeconds, nowMs)) {
      this.worldScene.setQuality(this.graphicsQuality.effectiveTier);
    }

    // Keep the transient input lock on the same unpaused elapsed time as the
    // attachment animation. A wall deadline expired behind the pause menu.
    if (!this.sim.clock.isPaused()) {
      this.mountTransitionRemainingSeconds = Math.max(0,
        this.mountTransitionRemainingSeconds - elapsedSeconds);
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
      this.physicsStepCount++;
    }
    this.recordPhase("physics", performance.now() - phaseMark);
    phaseMark = performance.now();

    // 2. Cross authored action commit markers before advancing simulation time.
    this.farmingActions.update(nowMs, this.sim.clock.isPaused());
    this.farmingActionSnapshot = this.farmingActions.snapshot(nowMs);

    // 3. Tick Authoritative Simulation
    this.sim.tick(deltaSeconds);
    if (this.mode === "sport-fishing" && !this.sim.activeFishingEncounter) {
      this.hudFishingHold = { isReeling: false, isSlacking: false, isBracing: false, rodDirectionAngle: 0 };
      this.restoreGameplayModeFromState();
    }
    this.requestPeriodicAutosave(nowMs);
    this.recordPhase("simulation", performance.now() - phaseMark);
    phaseMark = performance.now();

    // 4. Synchronize 3D Visuals
    const state = this.sim.getState();
    const presentationTimeSeconds = this.benchmarkPresentationTimeSeconds ?? nowMs / 1000;
    this.lastPresentationTimeSeconds = presentationTimeSeconds;
    const presentedPlayer = this.playerPresentation.sample(
      this.physicsAccumulatorSeconds * 60,
      deltaSeconds
    ) ?? {
      ...state.player,
      motion: stationaryPlayerMotion(state.player),
      discontinuityReason: "none" as const,
      discontinuitySequence: 0
    };
    const presentedBoats = this.boatPresentation.sample(this.physicsAccumulatorSeconds * 60);
    const playerPos = this.presentationPlayerPosition.set(
      presentedPlayer.x,
      presentedPlayer.y,
      presentedPlayer.z
    );
    this.lastPresentedPlayer = presentedPlayer;
    samplePlayerPresence(
      presentedPlayer,
      {
        mode: this.mode,
        mounted: Boolean(state.player.activeMountId),
        reducedMotion: false
      },
      this.playerPresence
    );
    this.worldScene.setPlayerPresence(this.playerPresence);
    const activeBoat = state.player.activeBoatId
      ? state.boats[state.player.activeBoatId]
      : undefined;
    const presentationInput = this.inputRouter.getInputState();
    const stormHelmHud = this.sim.query({ type: "boat.get-storm-helm" }) as StormHelmHudDto;
    this.stormHelmHud = stormHelmHud.active ? stormHelmHud : null;
    const boatPresentationInput: BoatPresentationInput | null =
      this.mode === "boat-driving" && activeBoat
        ? {
            boatId: activeBoat.id,
            boatTypeId: activeBoat.boatTypeId,
            throttle: -presentationInput.moveVector.z,
            steering: presentationInput.moveVector.x,
            stormHeel: stormHelmHud.heel,
            motion: this.lastBoatMotion[activeBoat.id]
          }
        : null;
    void this.worldScene.syncWithSimulation(
      this.sim,
      presentationTimeSeconds,
      presentedPlayer,
      boatPresentationInput,
      // Physics intentionally drops excess hitch time. Gaits cover only that
      // resolved travel while action clips retain their full elapsed time.
      elapsedSeconds > 0 ? deltaSeconds / elapsedSeconds : 1,
      presentedBoats
    ).catch(error => this.handleStartupFailure(error));
    // Debug-only split: the scene call runs applyImmediateSync inline (the
    // async reconciliation tail lands outside every phase). The trailing
    // recordPhase("sync") below then covers animation events, footfall audio
    // and updateEnvironment only; the two sum to the previous sync series.
    this.recordPhase("sync:scene", performance.now() - phaseMark);
    phaseMark = performance.now();
    for (const event of this.worldScene.drainPlayerAnimationEvents()) {
      if (event.name !== "footstep_left" && event.name !== "footstep_right") continue;
      const surface = footstepSurfaceAt(presentedPlayer.x, presentedPlayer.z);
      gameAudio.playBank(
        footstepBankForSurface(surface, Boolean(this.sim.state.player.activeMountId)),
        {
          x: presentedPlayer.x,
          y: presentedPlayer.y,
          z: presentedPlayer.z
        }
      );
      // Spawn under the foot that landed so the eye and the ear agree.
      const side = event.name === "footstep_left" ? -1 : 1;
      const perpendicularX = Math.cos(presentedPlayer.rotationY) * side * 0.16;
      const perpendicularZ = -Math.sin(presentedPlayer.rotationY) * side * 0.16;
      this.worldScene.spawnFootfall(
        surface,
        presentedPlayer.x + perpendicularX,
        presentedPlayer.z + perpendicularZ,
        presentationTimeSeconds
      );
    }
    this.worldScene.updateEnvironment(
      this.sim.getState(),
      presentationTimeSeconds,
      this.benchmarkLightingFocus ?? playerPos
    );
    const sportFishingCameraHint = this.worldScene.getSportFishingCameraHint();
    this.recordPhase("sync", performance.now() - phaseMark);
    phaseMark = performance.now();

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
          explorationWeight: this.explorationFraming.sample(
            state.worldSeed, playerPos.x, playerPos.z, this.mode,
            Boolean(this.activeModal) || this.farmingActions.isActive || this.cameraInteractionNearby
          ),
          boat: activeBoat ? this.lastBoatMotion[activeBoat.id] : undefined,
          discontinuityReason: presentedPlayer.discontinuityReason,
          discontinuitySequence: presentedPlayer.discontinuitySequence,
          lookHint: sportFishingCameraHint?.lookHint,
          fightReachMeters: sportFishingCameraHint?.fightReachMeters,
          lineTension: sportFishingCameraHint?.lineTension,
          fightLoadRatio: sportFishingCameraHint?.lineLoadRatio,
          snapTimerSeconds: sportFishingCameraHint?.snapTimerSeconds,
          fightBehavior: sportFishingCameraHint?.fightBehavior,
          fightBehaviorPhase: sportFishingCameraHint?.behaviorPhase,
          fightBehaviorPhaseProgress: sportFishingCameraHint?.behaviorPhaseProgress,
          fightDepthMeters: sportFishingCameraHint?.fishDepthMeters,
          fightStaminaRatio: sportFishingCameraHint?.fishStaminaRatio,
          fightShakeAmplitude: sportFishingCameraHint?.shakeAmplitude,
          fightCameraEvent: sportFishingCameraHint?.cameraEvent ?? null
        }
      );
    }
    this.gameCamera.camera.getWorldDirection(this.audioForward);
    this.recordPhase("camera", performance.now() - phaseMark);
    phaseMark = performance.now();
    gameAudio.setListener(this.gameCamera.camera.position, this.audioForward);
    const boatMotion = activeBoat ? this.lastBoatMotion[activeBoat.id] : undefined;
    const encounter = this.sim.activeFishingEncounter?.getState();
    const basicFishing = this.sim.state.basicFishing;
    const sportPresentation = this.worldScene.getSportFishingPresentation();
    syncWorldAudio({
      clock: this.sim.state.clock,
      icedCargoIds: buildIcedCargoIds(this.sim.state),
      windmill: buildWindmillAudio(presentedPlayer, this.sim.state.weather.windSpeed),
      position: { x: presentedPlayer.x, y: presentedPlayer.y, z: presentedPlayer.z },
      mode: this.mode,
      weather: this.sim.state.weather.type,
      paused: this.sim.clock.isPaused(),
      sprintExhausted: this.sim.state.player.traversal.sprintExhausted,
      boat: this.mode === "boat-driving" && activeBoat && boatMotion
        ? {
            throttle: boatMotion.throttle,
            x: activeBoat.x,
            y: activeBoat.y,
            z: activeBoat.z,
            isSkiff: activeBoat.boatTypeId.includes("skiff"),
            wrecked: activeBoat.durability <= 0
          }
        : undefined,
      fishing: encounter
        ? {
            reeling: (sportPresentation?.retrievalMetersPerSecond ?? 0) > 0.03,
            presentation: sportPresentation,
            lineTension: encounter.lineTension,
            lineIntegrity: encounter.lineIntegrity,
            snapTimerSeconds: encounter.snapTimerSeconds
          }
        : basicFishing
          ? {
              reeling: Boolean(basicFishing.isHolding),
              lineTension: 0,
              lineIntegrity: 100,
              snapTimerSeconds: 0
            }
          : undefined
    });
    this.updateCropPlacementPreview();
    if (this.layoutEditor?.isActive()) {
      this.promptText = null;
      this.contextualCropChoices = [];
      this.worldScene.setInteractionTargetFeedback(null);
      this.worldScene.setQuestWaypoint(null);
      this.questPointerTarget = null;
      this.syncLayoutEditor();
    } else {
      this.evaluateInteractionTarget(nowMs, false);
    }
    this.recordPhase("audio+interaction", performance.now() - phaseMark);
    phaseMark = performance.now();

    // 6. Render 3D Scene
    if (this.physicsWorld) {
      this.collisionDebugView?.update(this.physicsWorld, this.gameCamera.camera, this.sim.state.player, nowMs);
    }
    if (this.presentationHoldFrames > 0) this.presentationHoldFrames -= 1;
    else this.worldScene.render(this.gameCamera.camera, deltaSeconds);
    this.recordPhase("render", performance.now() - phaseMark);
    phaseMark = performance.now();
    this.questPointer.update(this.questPointerTarget, this.gameCamera.camera, {
      width: this.canvasContainer.clientWidth || window.innerWidth,
      height: this.canvasContainer.clientHeight || window.innerHeight
    });
    const rewards = this.rewardFeedback.sample(this.sim.state, this.farmingActionSnapshot?.target, this.activeMarketId);
    if (rewards.some((reward) => reward.kind === "record")) this.playRewardCameraBeat(0.4);
    this.rewardOverlay.push(rewards, nowMs);
    this.rewardOverlay.update(this.gameCamera.camera, {
      width: this.canvasContainer.clientWidth || window.innerWidth,
      height: this.canvasContainer.clientHeight || window.innerHeight
    }, nowMs);
    this.npcBarks.update(
      this.activeModal || this.benchmarkView || this.layoutEditor?.isActive() ? [] : buildNearbyNpcBarks(this.sim.state),
      this.gameCamera.camera,
      { width: this.canvasContainer.clientWidth || window.innerWidth, height: this.canvasContainer.clientHeight || window.innerHeight },
      nowMs, (x, z) => WorldLayout.traversalSurfaceHeight(x, z)
    );
    // Market demand moves on the hour, so a slow refresh is well within reading
    // accuracy and keeps the pricing model off the per-frame path.
    if (nowMs - this.lastMarketBoardRebuildMs >= 2000) {
      this.lastMarketBoardRebuildMs = nowMs;
      this.marketLifeBoards = buildMarketLifeBoards(this.sim.state);
    }
    const marketBoardSuppressed =
      Boolean(this.activeModal) || Boolean(this.benchmarkView) || Boolean(this.layoutEditor?.isActive());
    this.marketBoards.update(
      marketBoardSuppressed
        ? []
        : this.marketLifeBoards.flatMap((board) => {
            const location = WORLD_MARKET_LOCATIONS[board.marketId];
            return location
              ? [{ board, x: location.position.x, z: location.position.z }]
              : [];
          }),
      this.sim.state.player,
      this.gameCamera.camera,
      { width: this.canvasContainer.clientWidth || window.innerWidth, height: this.canvasContainer.clientHeight || window.innerHeight },
      (x, z) => WorldLayout.traversalSurfaceHeight(x, z),
      nowMs
    );
    this.recordPhase("overlays", performance.now() - phaseMark);
    phaseMark = performance.now();
    if (this.renderReadyFramesRemaining > 0) {
      this.renderReadyFramesRemaining -= 1;
      if (this.renderReadyFramesRemaining === 0) {
        window.__NEVA_RENDER_READY = true;
      }
    }

    // 7. Render 2D UI Overlay
    this.renderUiForFrame(nowMs);
    this.recordPhase("ui", performance.now() - phaseMark);
    this.recordPhase("frame", performance.now() - frameStartMark);

    if (this.benchmarkView && window.__NEVA_RENDER_READY && !this.worldAcceptance) return;
    requestAnimationFrame(this.loop);
  };

  private isMovementFrozen(): boolean {
    return (
      this.sim.clock.isPaused() ||
      this.isMountTransitionActive() ||
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
      const movement = this.mode === "boat-driving" || isCarriage(this.sim.state.mounts[this.sim.state.player.activeMountId ?? ""])
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
      // Close the physics transaction before anything else reads the world. A
      // rejected commit must rewind Rapier to the pose the simulation kept,
      // otherwise the next step resynchronises and drops a frame of velocity.
      this.physicsWorld.onCommitResult(commit.success);
      if (!commit.success) {
        // Stacked danger toasts for a blocked climb read as a systems fault;
        // keep one quiet notice so the player still sees the wall, not a flood.
        this.notify(commit.reason ?? "Movement could not be resolved", "warning", 1800);
      } else {
        this.lastBoatMotion = result.boatMotion;
        this.playerPresentation.push(result.frame.player, result.playerMotion);
        this.boatPresentation.push(result.frame.boats);
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
        rodDirectionAngle: fishing.rodDirectionAngle !== 0
          ? fishing.rodDirectionAngle
          : THREE.MathUtils.clamp(
              hud.rodDirectionAngle,
              -FISHING_STEER_INPUT_MAX,
              FISHING_STEER_INPUT_MAX
            )
      }
    });
  }

  private applyBasicFishingInput(): void {
    if (this.mode !== "basic-fishing" || !this.sim.state.basicFishing) {
      this.basicCastSource = null;
      this.basicFishingWidgetHold = false;
      return;
    }
    if (this.modeController.pausesSimulation || this.modeController.blocksWorldInput) {
      if (this.sim.state.basicFishing?.phase === "charging-cast") {
        this.sim.execute({ type: "fishing.cancel-basic" });
        this.basicCastSource = null;
      }
      return;
    }
    const input = this.inputRouter.getInputState();
    const attempt = this.sim.state.basicFishing;
    const isHolding = attempt.phase === "minigame"
      && (input.fishing.isReeling || this.basicFishingWidgetHold);
    if (isHolding !== Boolean(attempt.isHolding)) {
      this.sim.execute({
        type: "fishing.control-basic",
        isHolding
      });
    }
  }

  private cancelChargingCastWithoutPause(): boolean {
    if (this.mode !== "basic-fishing" || this.sim.state.basicFishing?.phase !== "charging-cast") {
      return false;
    }
    this.sim.execute({ type: "fishing.cancel-basic" });
    this.basicCastSource = null;
    this.restoreGameplayModeFromState();
    return true;
  }

  private cancelBasicFishingLine(): void {
    const attempt = this.sim.state.basicFishing;
    if (!attempt) return;
    if (attempt.phase === "caught") {
      this.notify("Collect the catch, or choose Open satchel or Discard catch", "warning", 2600);
      return;
    }
    this.basicCastSource = null;
    const result = this.sim.execute({ type: "fishing.cancel-basic" });
    if (result.reasonCode === "inventory-full" || result.reason === "inventory-full") {
      this.notify(result.reason ?? "The catch is still waiting", "warning", 2800);
      return;
    }
    this.setToast("Line reeled in", 1600);
  }

  /**
   * Every gameplay message funnels through here. Tone is inferred when the
   * caller does not state one so that failure text coming straight out of a
   * simulation result never renders as a neutral success-looking pill.
   */
  private setToast(text: string, durationMs: number = NOTICE_DEFAULT_DURATION_MS): void {
    this.notify(text, inferNoticeTone(text), durationMs);
  }

  private reportSale(quantity: number, revenue: number): void {
    const now = performance.now();
    const startsBatch = now - this.saleBatch.lastMs > SALE_BATCH_WINDOW_MS;
    if (startsBatch) {
      this.saleBatch = { units: 0, gold: 0, lastMs: now };
    }
    this.saleBatch.units += Math.max(1, quantity);
    this.saleBatch.gold += revenue;
    this.saleBatch.lastMs = now;

    const { units, gold } = this.saleBatch;
    const text = units === 1 ? `Sold for ${gold} G` : `Sold ${units} items for ${gold} G`;
    const notice = this.notices.push(text, now, { tone: "reward", durationMs: 2600, key: "market-sale", category: "trade" });
    if (notice) this.chronicle.record(notice, this.sim.state.clock.currentMinute);
    if (startsBatch) playNoticeSound("reward");
  }

  private notify(text: string, tone: NoticeTone, durationMs: number = NOTICE_DEFAULT_DURATION_MS, category: NoticeCategory = "general"): void {
    const notice = this.notices.push(text, performance.now(), { tone, durationMs, category });
    if (!notice) return;
    // Toasts expire; the Chronicle keeps them, so it is fed from the same call.
    this.chronicle.record(notice, this.sim.state.clock.currentMinute);
    if (notice.count === 1) playNoticeSound(tone);
  }

  /**
   * Surfaces the offline summary discarded by the load path until now: what
   * matured, withered, finished, spoiled, or expired while away. One combined
   * notice — the stack only shows two at once.
   */
  private notifyAwaySummary(summary: OfflineProgressionSummary): void {
    if (summary.simulatedGameMinutes <= 0) return;
    const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
    const parts: string[] = [];
    if (summary.cropsMaturedCount > 0) parts.push(count(summary.cropsMaturedCount, "crop ready", "crops ready"));
    if (summary.cropsWitheredCount > 0) parts.push(count(summary.cropsWitheredCount, "crop withered", "crops withered"));
    if (summary.jobsCompletedCount > 0) parts.push(count(summary.jobsCompletedCount, "job done", "jobs done"));
    if (summary.cargoSpoiledCount > 0) parts.push(`${summary.cargoSpoiledCount} catch spoiled`);
    if (summary.contractsExpiredCount > 0) parts.push(count(summary.contractsExpiredCount, "contract expired", "contracts expired"));
    if (parts.length === 0) return;
    this.notify(`While you were away · ${parts.join(" · ")}`, "info", 6000);
  }

  private currentNotices(): Notice[] {
    return this.notices.list(performance.now());
  }

  public openDialogueModal(npcId: string): void {
    if (this.mode === "basic-fishing" || this.mode === "mounted") return;
    this.dialogueTalkResult = null;
    this.activeDialogueNpcId = npcId;
    this.worldScene.setDialogueNpc(npcId);
    this.setActiveModal("dialogue");
  }


  public showContextualHint(
    hintId: string,
    title: string,
    message: string,
    icon: string = "sparkle"
  ): void {
    if (this.sim.questDomain.isHintShown(hintId)) return;
    this.activeHint = { hintId, title, message, icon };
    this.sim.questDomain.recordHintShown(hintId);
  }

  /**
   * First-shift coaching. The ambient hint (`hint.labor_shift_timing`) covers a
   * player who lingers at the station; this covers the player who starts a
   * shift before that card fires, and records the same one-time flag so the
   * lesson never repeats within a save.
   */
  private announceLaborTimingOnce(): void {
    const hintId = "hint.labor_shift_timing";
    if (this.sim.questDomain.isHintShown(hintId)) return;
    this.sim.questDomain.recordHintShown(hintId);
    this.notify("Time the strike — press E as the needle crosses the gold band", "info", 4200);
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
      const inspection = this.sim.inspectProcessingJob(stationId);
      return {
        action: "inspect",
        prompt: `[E] ${inspection?.waitBriefing ?? "Job in progress"}`
      };
    }
    return { action: "start-processing", prompt: idlePrompt };
  }

  private resolveCropTarget(
    cropId: string,
    requestedAction?: ContextualCropChoice["action"]
  ): ResolvedInteractionTarget | null {
    const crop = this.sim.state.crops[cropId];
    if (!crop) return null;
    const inspection = this.sim.inspectCrop(cropId);
    if (!inspection) return null;
    const world = farmLocalToWorld(crop.farmId, crop);
    const player = this.sim.state.player;
    const distanceMeters = Math.hypot(player.x - world.x, player.z - world.z);
    const withinWaterReach = distanceMeters <= this.sim.cropInteractionReachMeters("water");
    const withinHarvestReach = distanceMeters <= this.sim.cropInteractionReachMeters("harvest");
    const withinInspectReach = distanceMeters <= this.sim.cropInteractionReachMeters("inspect");
    if (!withinWaterReach && !withinHarvestReach && !withinInspectReach) return null;

    const farm = this.sim.state.farms[crop.farmId];
    const inventory = this.sim.state.inventories[this.sim.state.player.inventoryId];
    const fertilizeWork = this.sim.quoteWorkCost(FARMING_ACTION_COST.fertilize, "farming", "farming.fertilize");
    const canFertilize = Boolean(
      farm &&
      distanceMeters <= 2.5 &&
      farm.soil.fertility < 100 &&
      fertilizeWork.affordable &&
      InventoryManager.hasItems(inventory, [{ itemId: "item.basic_fertilizer", quantity: 1 }])
    );
    const plotPosition = { x: world.x, y: WorldLayout.terrainHeight(world.x, world.z), z: world.z };

    // Keep a stable primary verb. Other available verbs are exposed beside
    // the prompt and selected explicitly, independent of the tool in hand.
    const verbs: ResolvedInteractionTarget[] = [];
    if (inspection.actions.canHarvest && withinHarvestReach) {
      const clearingWithered = inspection.stage === "withered";
      verbs.push({
        id: `crop:${crop.id}:harvest`,
        entityId: crop.id,
        cropId: crop.id,
        kind: "crop",
        action: "harvest",
        distanceMeters,
        priority: 0,
        worldPosition: plotPosition,
        modes: ["on-foot"],
        requiresLineOfSight: true,
        requiresTool: "harvest",
        prompt: clearingWithered
          ? `[E] Clear ${inspection.name} · Right-click inspect`
          : `[E] Harvest ${inspection.name} · ${inspection.harvestWork.cost} Work · Right-click inspect`
      });
    }
    if (inspection.actions.canWater && withinWaterReach) {
      verbs.push({
        id: `crop:${crop.id}:water`,
        entityId: crop.id,
        cropId: crop.id,
        kind: "crop",
        action: "water",
        distanceMeters,
        priority: 0,
        worldPosition: plotPosition,
        modes: ["on-foot"],
        requiresLineOfSight: true,
        requiresTool: "watering-can",
        prompt: `[E] Water ${inspection.name} · ${inspection.waterWork.cost} Work · Right-click inspect`
      });
    }
    if (canFertilize) {
      verbs.push({
        id: `crop:${crop.id}:fertilize`,
        entityId: crop.farmId,
        cropId: crop.id,
        kind: "planting-plot",
        action: "fertilize",
        distanceMeters,
        priority: 0,
        worldPosition: plotPosition,
        modes: ["on-foot"],
        requiresLineOfSight: true,
        requiresTool: "fertilizer",
        prompt: `[E] Fertilize soil · ${fertilizeWork.cost} Work · Right-click inspect`
      });
    }
    if (requestedAction) return verbs.find((verb) => verb.action === requestedAction) ?? null;
    if (verbs.length > 0) return verbs[0];
    if (inspection.immediateAction.kind !== "none" && inspection.stage !== "withered"
      && !inspection.work.affordable && (withinWaterReach || withinHarvestReach)) {
      return {
        id: `crop:${crop.id}:insufficient-work`,
        entityId: crop.id,
        cropId: crop.id,
        kind: "crop",
        action: "inspect",
        distanceMeters,
        priority: 0,
        worldPosition: { x: world.x, y: WorldLayout.terrainHeight(world.x, world.z), z: world.z },
        modes: ["on-foot"],
        requiresLineOfSight: true,
        prompt: `${inspection.name} · Need ${inspection.work.cost} Work · ${inspection.work.availableWork} available · rest, eat, or work to recover · Right-click inspect`
      };
    }
    if (!withinInspectReach) return null;
    return {
      id: `crop:${crop.id}:inspect`,
      entityId: crop.id,
      cropId: crop.id,
      kind: "crop",
      action: "inspect",
      distanceMeters,
      priority: 4,
      worldPosition: { x: world.x, y: WorldLayout.terrainHeight(world.x, world.z), z: world.z },
      modes: ["on-foot"],
      requiresLineOfSight: true,
      prompt: `Right-click to inspect ${inspection.name}`
    };
  }

  private pickInteraction(): ResolvedInteractionTarget | null {
    if (this.isMountTransitionActive()) return null;
    const p = this.sim.state.player;
    const candidates: ResolvedInteractionTarget[] = [];

    // A rider has exactly one contextual action. Keeping this branch before
    // the world target scan prevents crops, stations, doors, and fishing
    // schools from becoming actionable through a stale pointer or center hit.
    if (this.mode === "mounted") {
      const mountId = p.activeMountId;
      const mount = mountId ? this.sim.state.mounts[mountId] : undefined;
      return this.interactionResolver.resolve(
        mount
          ? [{
              id: `mount:${mount.id}:dismount`,
              entityId: mount.id,
              kind: "mount",
              action: "dismount",
              distanceMeters: 0,
              priority: 0,
              worldPosition: { x: mount.x, y: mount.y, z: mount.z },
              modes: ["mounted"],
              requiresLineOfSight: false,
              prompt: isCarriage(mount) ? `[E] Leave carriage · ${mount.fishCargoSlotIds?.filter(Boolean).length ?? 0}/2 packs` : "[E] Dismount"
            }]
          : [],
        { mode: this.mode, player: p }
      );
    }

    if (this.mode === "on-foot") {
      for (const mount of Object.values(this.sim.state.mounts)) {
        if (!this.sim.canBoardMount(mount.id)) continue;
        candidates.push({
          id: `mount:${mount.id}:board`,
          entityId: mount.id,
          kind: "mount",
          action: "mount",
          distanceMeters: Math.hypot(p.x - mount.x, p.z - mount.z),
          priority: 0,
          worldPosition: { x: mount.x, y: mount.y, z: mount.z },
          modes: ["on-foot"],
          requiresLineOfSight: false,
          prompt: isCarriage(mount) ? `[E] Drive carriage · ${mount.fishCargoSlotIds?.filter(Boolean).length ?? 0}/2 packs` : "[E] Ride donkey"
        });
      }
    }

    if (this.mode === "on-foot") {
      for (const mount of Object.values(this.sim.state.mounts)) {
        if (!canReachCarriageRear(this.sim.state, mount)) continue;
        const rear = carriagePoint(mount, 0, CARRIAGE_TUNING.rearOffset);
        const occupied = mount.fishCargoSlotIds?.filter(Boolean).length ?? 0;
        const pickupId = mount.fishCargoSlotIds?.find(id => id && this.sim.canPickupFishCargo(id));
        if (!p.carriedFishCargoId && !pickupId) continue;
        candidates.push({ id: `carriage:${mount.id}:cargo`, entityId: p.carriedFishCargoId ? mount.id : pickupId!,
          kind: "mount", action: p.carriedFishCargoId ? "load-carriage" : "pickup-cargo",
          distanceMeters: Math.hypot(p.x - rear.x, p.z - rear.z), priority: -1,
          worldPosition: { ...rear, y: mount.y }, modes: ["on-foot"], requiresLineOfSight: false,
          prompt: p.carriedFishCargoId ? `[E] Load carriage · ${occupied}/2 packs` : `[E] Collect trade pack · ${occupied}/2 packs` });
      }
    }

    for (const crop of Object.values(this.sim.state.crops)) {
      const candidate = this.resolveCropTarget(crop.id);
      if (candidate) candidates.push(candidate);
    }

    const stationDefinitions = Object.values(WORLD_STATION_DEFINITIONS).map((station) => ({
      stationId: station.id,
      idlePrompt: station.type === "hand-mill"
        ? "[E] Use Hand Mill"
        : station.type === "fish-table"
          ? "[E] Use Fish Table"
          : station.type === "compost-bin"
            ? "[E] Use Compost Bin"
            : "[E] Use Workbench",
      collectPrompt: station.type === "fish-table" ? "[E] Collect Catch Work" : "[E] Collect Output"
    }));
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
        stationId: definition.stationId
      });
    }

    if (this.mode === "on-foot") {
      const laborStations = this.sim.query({ type: "labor.get-stations" }) as LaborStationDto[];
      for (const station of laborStations) {
        const laborDistance = Math.hypot(p.x - station.x, p.z - station.z);
        if (laborDistance > station.reachMeters + 1.4) continue;
        candidates.push({
          id: `labor:${station.id}`,
          entityId: station.id,
          kind: "station",
          action: "labor",
          distanceMeters: laborDistance,
          priority: 1,
          worldPosition: {
            x: station.x,
            y: WorldLayout.terrainHeight(station.x, station.z),
            z: station.z
          },
          modes: ["on-foot"],
          requiresLineOfSight: false,
          prompt: station.available
            ? `[E] ${station.prompt} · +${station.yield} Work`
            : `${station.name} · ${station.blocker ?? "Unavailable"}`
        });
      }
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
            prompt: `[E] Fertilize soil · ${this.sim.quoteWorkCost(FARMING_ACTION_COST.fertilize, "farming", "farming.fertilize").cost} Work`
          });
        }
      }
    }

    if (this.mode === "on-foot") {
      for (const cargo of Object.values(this.sim.state.fishCargo)) {
        if (cargo.location.type !== "boat-hold" && cargo.location.type !== "boat-hook") continue;
        const boat = this.sim.state.boats[cargo.location.containerId];
        if (!boat || !this.sim.canPickupFishCargo(cargo.id)) continue;
        const fishName = ContentRegistry.fishSpecies.get(cargo.speciesId)?.name ?? "fish";
        candidates.push({
          id: `cargo:${cargo.id}:pickup`,
          entityId: cargo.id,
          kind: "dock",
          action: "pickup-cargo",
          distanceMeters: Math.hypot(p.x - boat.x, p.z - boat.z),
          // The hold handoff must win the same-position board prompt; once
          // the pack is collected, boarding is available again from the dock.
          priority: -1,
          worldPosition: { x: boat.x, y: boat.y, z: boat.z },
          modes: ["on-foot"],
          requiresLineOfSight: false,
          prompt: `[E] Collect ${fishName} trade pack`
        });
      }
      for (const cargo of Object.values(this.sim.state.fishCargo)) {
        if (cargo.location.type !== "ground") continue;
        if (!this.sim.canPickupFishCargo(cargo.id)) continue;
        const { x, z } = cargo.location;
        if (typeof x !== "number" || typeof z !== "number") continue;
        const fishName = ContentRegistry.fishSpecies.get(cargo.speciesId)?.name ?? "fish";
        candidates.push({
          id: `cargo:${cargo.id}:pickup-ground`,
          entityId: cargo.id,
          kind: "dock",
          action: "pickup-cargo",
          distanceMeters: Math.hypot(p.x - x, p.z - z),
          priority: -1,
          worldPosition: { x, y: WorldLayout.terrainHeight(x, z), z },
          modes: ["on-foot"],
          requiresLineOfSight: false,
          prompt: `[E] Collect ${fishName} trade pack`
        });
      }

      const irrigationFarmId = this.sim.getNearbyIrrigationFarmId();
      const well = irrigationFarmId ? farmWellWorldAnchor(irrigationFarmId) : undefined;
      if (irrigationFarmId && well) {
        const irrigationInstalled = this.sim.state.quests.unlockedFeatureIds.includes(IRRIGATION_FEATURE_ID);
        const pumpWork = irrigationInstalled ? this.sim.quoteIrrigationWork(irrigationFarmId) : null;
        const pumpAvailable = isQuestActive(this.sim.state.quests, "quest.act6_field_pump");
        if (pumpWork || (!irrigationInstalled && pumpAvailable)) {
          candidates.push({
            id: `well:${irrigationFarmId}:irrigate`,
            entityId: irrigationFarmId,
            kind: "station",
            action: "irrigate",
            distanceMeters: Math.hypot(p.x - well.x, p.z - well.z),
            priority: 1,
            worldPosition: {
              x: well.x,
              y: WorldLayout.terrainHeight(well.x, well.z),
              z: well.z
            },
            modes: ["on-foot"],
            requiresLineOfSight: false,
            prompt: pumpWork
              ? pumpWork.affordable
                ? `[E] Pump water for ${pumpWork.cropCount} ${pumpWork.cropCount === 1 ? "crop" : "crops"} · ${pumpWork.cost} Work`
                : `Need ${pumpWork.cost} Work to pump ${pumpWork.cropCount} ${pumpWork.cropCount === 1 ? "crop" : "crops"} · ${pumpWork.availableWork} available`
              : `[E] Install a field pump · ${IRRIGATION_COST} G`
          });
        }
      }
    }

    for (const market of Object.values(WORLD_MARKET_LOCATIONS)) {
      const distance = Math.hypot(p.x - market.position.x, p.z - market.position.z);
      if (distance > market.radiusMeters) continue;
      const marketName = ContentRegistry.markets.get(market.id)?.name ?? "market";
      candidates.push({
        id: `market:${market.id}:trade`,
        entityId: market.id,
        kind: "market",
        action: "trade",
        distanceMeters: distance,
        priority: 1,
        worldPosition: {
          x: market.position.x,
          y: WorldLayout.terrainHeight(market.position.x, market.position.z),
          z: market.position.z
        },
        modes: ["on-foot"],
        requiresLineOfSight: true,
        prompt: `[E] Trade at ${marketName}`
      });
    }

    if (this.mode === "on-foot") {
      const bulletinDistance = Math.hypot(
        p.x - VILLAGE_BULLETIN.position.x,
        p.z - VILLAGE_BULLETIN.position.z
      );
      if (bulletinDistance <= VILLAGE_BULLETIN.interactionRadiusMeters) {
        candidates.push({
          id: "bulletin:village:read",
          kind: "station",
          action: "read-notices",
          distanceMeters: bulletinDistance,
          priority: 1,
          worldPosition: {
            x: VILLAGE_BULLETIN.position.x,
            y: WorldLayout.terrainHeight(VILLAGE_BULLETIN.position.x, VILLAGE_BULLETIN.position.z),
            z: VILLAGE_BULLETIN.position.z
          },
          modes: ["on-foot"],
          requiresLineOfSight: false,
          prompt: "[E] Read the village notices"
        });
      }
    }

    const fishingHabitat = WorldLayout.nearbyFishingHabitat(p.x, p.z);
    // Fishable water offers the cast whether or not the rod is already out;
    // requiring it first meant standing at the shore with no prompt at all.
    if (fishingHabitat && (this.mode === "on-foot" || this.mode === "boat-driving")) {
      candidates.push({
        id: `fishing-habitat:${fishingHabitat}:cast`,
        kind: "fishing-habitat",
        action: "cast",
        distanceMeters: 0,
        priority: 3,
        modes: ["on-foot", "boat-driving"],
        requiresTool: "fishing-rod",
        prompt: `[E] Cast line · ${this.sim.quoteWorkCost(BASIC_FISHING_WORK_COST, "fishing", "fishing.basic-cast").cost} Work`
      });
    }

    // Refueling remains available aboard the skiff. While there is still fuel,
    // it is a fallback behind fishing actions; once the tank is empty it must
    // outrank Emergency Tow so a carried can can get the player moving again.
    if (this.mode === "on-foot" || this.mode === "boat-driving") {
      const inventory = this.sim.state.inventories[this.sim.state.player.inventoryId];
      const hasFuel = inventory ? InventoryManager.getItemCount(inventory, "item.boat_fuel") > 0 : false;
      for (const boat of Object.values(this.sim.state.boats)) {
        const def = ContentRegistry.boats.get(boat.boatTypeId);
        if (!def || def.fuelCapacity <= 0 || boat.fuel >= def.fuelCapacity || !hasFuel) continue;
        const aboard = this.sim.state.player.activeBoatId === boat.id;
        const dist = Math.hypot(p.x - boat.x, p.z - boat.z);
        if (!aboard && dist > 4.5) continue;
        const emptyAboard = this.mode === "boat-driving" && aboard && boat.fuel <= 0;
        candidates.push({
          id: `boat:${boat.id}:refuel`,
          entityId: boat.id,
          kind: "dock",
          action: "refuel",
          distanceMeters: aboard ? 0 : dist,
          priority: this.mode === "boat-driving" ? (emptyAboard ? -1 : 6) : 1,
          worldPosition: { x: boat.x, y: boat.y, z: boat.z },
          modes: ["on-foot", "boat-driving"],
          requiresLineOfSight: false,
          prompt: `[E] Refuel ${def.name}`
        });
      }
    }

    // A dead motor or a wrecked hull with the player aboard is a tow prompt,
    // not a dead end. Safe Return refuses with fish aboard; the tow keeps the
    // catch. A wreck always goes to Neva Harbor, where Silas can repair it.
    const towedBoatId = this.mode === "boat-driving" ? this.sim.state.player.activeBoatId : null;
    const towedBoat = towedBoatId ? this.sim.state.boats[towedBoatId] : null;
    const towQuote = towedBoat ? this.sim.inspectEmergencyTowQuote() : null;
    if (towedBoat && towQuote?.ok) {
      const towFee = towQuote.cost === 0 ? "no charge" : `${towQuote.cost} G`;
      candidates.push({
        id: `boat:${towedBoat.id}:tow`,
        entityId: towedBoat.id,
        kind: "dock",
        action: "tow",
        distanceMeters: 0,
        priority: 0,
        worldPosition: { x: towedBoat.x, y: towedBoat.y, z: towedBoat.z },
        modes: ["boat-driving"],
        requiresLineOfSight: false,
        prompt: `[E] Tow to ${towQuote.destinationLabel} · ${towFee} · ${towQuote.travelMinutes} min`
      });
    }

    if (this.mode === "on-foot") {
      // Silas repairs hulls at the harbor pier for the damaged share of the
      // catalog fee. The quote is simulation-owned, so the prompt cannot advertise a repair
      // the command refuses.
      for (const boat of Object.values(this.sim.state.boats)) {
        const definition = ContentRegistry.boats.get(boat.boatTypeId);
        if (!definition) continue;
        const quote = this.sim.query({
          type: "boat.get-repair-quote",
          boatId: boat.id
        }) as RepairQuoteDto;
        if (!quote.inReach || boat.durability >= definition.durabilityMax) continue;
        candidates.push({
          id: `boat:${boat.id}:repair`,
          entityId: boat.id,
          kind: "dock",
          action: "repair",
          distanceMeters: Math.hypot(p.x - boat.x, p.z - boat.z),
          priority: 0,
          worldPosition: { x: boat.x, y: boat.y, z: boat.z },
          modes: ["on-foot"],
          requiresLineOfSight: false,
          prompt: quote.ok
            ? `[E] Repair ${definition.name} · ${quote.cost} G`
            : `Repair ${definition.name} · ${quote.cost} G · ${quote.reason ?? "not now"}`
        });
      }
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
          prompt: `[E] Board ${ContentRegistry.boats.get(boat.boatTypeId)?.name ?? "Vessel"}`
        });
      }

      const skiff = this.sim.state.boats["boat.player_skiff"];
      if (!skiff) {
        const skiffDistance = Math.hypot(
          p.x - HARBOR_SKIFF_MOORING.playerPosition.x,
          p.z - HARBOR_SKIFF_MOORING.playerPosition.z
        );
        if (skiffDistance <= HARBOR_SKIFF_MOORING.boardRadius) {
          // The offer, its gate and its price all come from the catalog so the
          // prompt cannot advertise a commission `purchaseSkiff` will refuse.
          const skiffDef = ContentRegistry.boats.get("boat.skiff");
          if (skiffDef?.requiredSkillXp) {
            const requiredXp = skiffDef.requiredSkillXp.xp;
            const skiffCostLabel = skiffDef.costMoney.toLocaleString();
            const canAfford = this.sim.state.player.money >= skiffDef.costMoney;
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
                ? `[E] Commission Coastal Skiff · ${skiffCostLabel} G`
                : `Coastal Skiff · ${this.sim.state.player.proficiencies.fishing.toLocaleString()} / ${requiredXp.toLocaleString()} Fishing XP · ${skiffCostLabel} G`
            });
          }
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
        prompt: "[E] Dock & Disembark"
      });
    }

    for (const school of Object.values(this.sim.state.world.activeSchools)) {
      const sDist = Math.hypot(p.x - school.x, p.z - school.z);
      if (sDist <= SCHOOL_INTERACTION_RADIUS) {
        const frenzy =
          school.feedingFrenzyUntilMinute && this.sim.state.clock.currentMinute <= school.feedingFrenzyUntilMinute;
        const lurePrepared = p.preparedLureItemId === LURE_ITEM_ID;
        const lureWithinReach = lurePrepared && accessibleLureSupplyCount(this.sim.state) > 0;
        const chumItemId = frenzy ? null : nextAccessibleChumItemId(this.sim.state);
        const chumName = chumItemId
          ? ContentRegistry.items.get(chumItemId)?.name ?? "chum"
          : null;
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
          prompt: frenzy
            ? lureWithinReach
              ? `[E] Hook Sport Fish · ~${this.sim.quoteWorkCost(this.sim.quoteSchoolHookWork(school.id), "fishing", "fishing.sport-hook").cost} Work · Woven Lure armed`
              : lurePrepared
                ? `Woven Lure out of reach · return to supplies or [R] put away`
                : `[R] Arm a Woven Lure · required before hooking`
            : `${chumName ? `[E] Chum School · ${chumName}` : "[E] Chum School · no chum within reach"} · [R] ${lureWithinReach
              ? "Woven Lure armed"
              : lurePrepared
                ? "Woven Lure out of reach"
                : "Arm Woven Lure"}`
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
        const restQuote = buildRestQuote(this.sim.state);
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
          prompt: `[E] Rest until ${restQuote.wakeClockLabel} · +${restQuote.workGain} Work${restQuote.warning ? ` · ${restQuote.warning}` : ""}`
        });
      }
    }

    if (this.mode === "on-foot") {
      for (const [npcId, npc] of ContentRegistry.npcs.entries()) {
        const anchor = npcAnchorAt(npcId, this.sim.state.clock, this.sim.state.quests);
        const distToNpc = Math.hypot(p.x - anchor.x, p.z - anchor.z);
        if (distToNpc <= NPC_TALK_RADIUS) {
          candidates.push({
            id: `npc:${npcId}:talk`,
            kind: "station",
            action: "inspect",
            distanceMeters: distToNpc,
            // Actionable stations/crops/boats win when their interaction space
            // overlaps an NPC; dialogue remains available just outside it.
            priority: 1,
            worldPosition: {
              x: anchor.x,
              y: WorldLayout.traversalSurfaceHeight(anchor.x, anchor.z),
              z: anchor.z
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
      hasLineOfSight: this.physicsWorld
        ? (from, to) => this.physicsWorld!.hasLineOfSight(from, to)
        : undefined
    });
  }

  private evaluateInteractionTarget(nowMs: number = performance.now(), force: boolean = true): void {
    const player = this.sim.state.player;
    const pointer = this.inputRouter.getInputState().pointerNdc;
    if (!force) {
      const elapsed = nowMs - this.lastInteractionEvaluationMs;
      if (elapsed < 66) return;
      const playerMoved = Math.hypot(player.x - this.lastInteractionX, player.z - this.lastInteractionZ) >= 0.2;
      const pointerMoved = Math.hypot(
        pointer.x - this.lastInteractionPointerX,
        pointer.y - this.lastInteractionPointerY
      ) >= 0.012;
      if (!playerMoved && !pointerMoved && this.mode === this.lastInteractionMode && elapsed < 250) return;
    }
    this.lastInteractionEvaluationMs = nowMs;
    this.lastInteractionX = player.x;
    this.lastInteractionZ = player.z;
    this.lastInteractionPointerX = pointer.x;
    this.lastInteractionPointerY = pointer.y;
    this.lastInteractionMode = this.mode;
    this.cameraInteractionNearby = false;
    if (this.activeModal || this.benchmarkView) {
      this.worldScene.setInteractionTargetFeedback(null);
      this.promptText = null;
      this.contextualCropChoices = [];
      return;
    }
    if (this.mode === "sport-fishing") {
      this.worldScene.setInteractionTargetFeedback(null);
      this.promptText = null;
      this.contextualCropChoices = [];
      return;
    }

    if (this.mode === "farm-placement") {
      this.worldScene.setInteractionTargetFeedback(null);
      this.contextualCropChoices = [];
      const cropName = ContentRegistry.crops.get(this.selectedCropId)?.name ?? "crop";
      // Progress comes from the quest DTO; the UI never recounts placements.
      const quest = this.sim.questDomain.getActiveQuestDto();
      const plantingThisCrop = quest
        && quest.objectiveType === "plant-crop"
        && (quest.objectiveTargetId === undefined || quest.objectiveTargetId === this.selectedCropId)
        && quest.targetQuantity > 1;
      const progressSuffix = plantingThisCrop
        ? ` · ${quest!.currentProgress}/${quest!.targetQuantity}`
        : "";
      // Carried by the prompt rather than by a hint card: the card is suppressed
      // in this very mode, so a hint raised here would never render and would
      // then block the whole ambient hint queue. Keyed on progress rather than
      // on `hintsShown`, which keeps this read-only — a prompt runs every frame
      // and has no business writing simulation state.
      const placementGuidance = plantingThisCrop && quest!.currentProgress === 0
        ? ` · Each placement plants one — choose ${quest!.targetQuantity} separate spots`
        : "";
      const plantingWork = this.sim.quoteWorkCost(FARMING_ACTION_COST.plant, "farming", "farming.plant");
      const placementPrompt = this.placementResult?.valid
        ? plantingWork.affordable
          ? `[E / Click] Plant one ${cropName}${progressSuffix}${placementGuidance} · ${plantingWork.cost} Work · Right-click / Esc cancel`
          : `Need ${plantingWork.cost} Work to plant · ${plantingWork.availableWork} available · Right-click / Esc cancel`
        : `${this.placementResult?.reason ?? "Point at prepared farm soil"} · Right-click / Esc cancel`;
      this.promptText = placementPrompt;
      return;
    }

    const picked = this.farmingActions.isActive && this.lockedInteractionTarget
      ? this.lockedInteractionTarget
      : this.pickInteraction();
    this.cameraInteractionNearby = this.mode === "on-foot" && picked !== null;
    this.worldScene.setInteractionTargetFeedback(picked?.worldPosition ?? null, picked?.entityId);

    const activeQuest = this.sim.questDomain.getActiveQuestDto();
    if (activeQuest?.targetLocation) {
      const groundY = WorldLayout.terrainHeight(
        activeQuest.targetLocation.x,
        activeQuest.targetLocation.z
      );
      this.worldScene.setQuestWaypoint({
        x: activeQuest.targetLocation.x,
        y: groundY,
        z: activeQuest.targetLocation.z
      });
      this.questPointerTarget = {
        x: activeQuest.targetLocation.x,
        // Aim the screen pointer at head height above the anchor rather than at
        // the ground, so it sits on the target instead of at its feet.
        y: groundY + 1.7,
        z: activeQuest.targetLocation.z,
        label: activeQuest.targetLocation.name,
        distanceMeters: activeQuest.targetDistanceMeters ?? 0
      };
    } else {
      this.worldScene.setQuestWaypoint(null);
      this.questPointerTarget = null;
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
    this.contextualCropChoices = [];
    if (!this.farmingActions.isActive && picked?.cropId &&
      (picked.action === "harvest" || picked.action === "water" || picked.action === "fertilize")) {
      for (const action of ["harvest", "water", "fertilize"] as const) {
        if (action === picked.action) continue;
        const target = this.resolveCropTarget(picked.cropId, action);
        if (!target) continue;
        const [label, detail] = target.prompt.replace(/^\[E\]\s*/, "").split(" · ");
        this.contextualCropChoices.push({
          cropId: picked.cropId,
          action,
          label,
          detail: detail?.endsWith("Work") ? detail : null
        });
      }
    }
  }

  private pickPointedCropInteraction(): ResolvedInteractionTarget | null {
    if (this.mode !== "on-foot") return null;
    const pointer = this.inputRouter.getInputState().pointerNdc;
    const cropId = this.worldScene.pickCrop(this.gameCamera.camera, pointer);
    return cropId ? this.resolveCropTarget(cropId) : null;
  }

  private handlePrimaryUse(): void {
    if (
      this.isMountTransitionActive() ||
      this.mode === "sport-fishing" ||
      this.mode === "basic-fishing" ||
      this.farmingActions.isActive
    ) return;

    if (this.mode === "on-foot") {
      const crop = this.pickPointedCropInteraction();
      if (crop) {
        this.equipForInteraction(crop);
        this.lockedInteractionTarget = crop;
        if (crop.worldPosition) this.facePlayerToward(crop.worldPosition.x, crop.worldPosition.z);
        if (crop.action === "harvest" && crop.entityId) this.startCropAction("harvest", crop.entityId);
        else if (crop.action === "water" && crop.entityId) this.startCropAction("water", crop.entityId);
        else if (crop.action === "fertilize" && crop.entityId) this.startFertilizeAction(crop.entityId, crop.worldPosition);
        else this.setToast(crop.prompt.split(" · ")[0].replace(/^\[[^\]]+\]\s*/, ""), 1800);
        if (!this.farmingActions.isActive) this.lockedInteractionTarget = null;
        return;
      }
    }

    if (
      (this.mode === "on-foot" || this.mode === "boat-driving") &&
      WorldLayout.nearbyFishingHabitat(this.sim.state.player.x, this.sim.state.player.z)
    ) {
      this.handleCastFishing("primary");
    }
  }

  /**
   * Take out whatever the chosen verb is performed with. The swap is a
   * consequence of the action, not a precondition for it.
   */
  private equipForInteraction(target: ResolvedInteractionTarget): void {
    if (!target.requiresTool || this.activeTool === target.requiresTool) return;
    if (this.sim.state.player.activeMountId) return;
    if (this.mode === "farm-placement") this.exitCropPlacement();
    this.activeTool = target.requiresTool;
  }

  /**
   * Opens the journal already turned to the Town Notices board. A token makes
   * each open request distinct so repeated reads still land on the folio.
   */
  private openVillageNotices(): void {
    this.journalRequestToken += 1;
    this.journalOpenRequest = { folio: "notices", token: this.journalRequestToken };
    this.setActiveModal("journal");
  }

  /**
   * One strike path for both the interact key and the widget button, so the
   * result notice, world Work float and the transient grade plaque can never
   * disagree about what the simulation granted.
   */
  private strikeLaborShift(): void {
    const result = this.sim.execute({ type: "labor.strike" });
    const granted = result.yield ?? 0;
    this.laborShiftFeedback = {
      token: ++this.laborShiftFeedbackToken,
      outcome: result.success ? result.grade ?? "clean" : "miss",
      granted,
      reason: result.success ? undefined : result.reason
    };
    // The grade plaque outlives the shift briefly; after this window a modal
    // remount must not replay a stale result.
    this.laborShiftFeedbackUntilMs = performance.now() + 2600;
    if (result.success) {
      const gradeLabel = this.laborShiftFeedback.outcome === "clean" ? "Clean strike" : "Glancing blow";
      this.notify(`${gradeLabel} · +${granted} Work`, "success", 2200);
      this.requestAutosave();
    } else {
      this.notify(result.reason ?? "The strike missed", "warning");
    }
    this.renderUI();
  }

  private handleContextInteract(requestedCrop?: Pick<ContextualCropChoice, "cropId" | "action">): void {
    if (
      this.isMountTransitionActive() ||
      this.mode === "sport-fishing" ||
      this.mode === "basic-fishing" ||
      this.farmingActions.isActive
    ) return;

    // A work shift owns the interact input while its meter is running.
    if (this.laborHud?.active) {
      this.strikeLaborShift();
      return;
    }

    let picked = this.pickInteraction();
    if (!picked) return;
    if (requestedCrop) {
      // The current world target, distance and sight must still select this plot. The
      // simulation validates the resulting command again at commit time.
      if (picked.cropId !== requestedCrop.cropId) return;
      picked = this.resolveCropTarget(requestedCrop.cropId, requestedCrop.action);
      if (!picked) return;
    }
    this.equipForInteraction(picked);
    this.lockedInteractionTarget = picked;
    if (picked.worldPosition && this.mode !== "boat-driving" && this.mode !== "mounted") {
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
        if (!result.success) this.notify(result.reason ?? "Could not irrigate", "danger");
        else if (!irrigationInstalled) this.notify(`Field pump installed · ${result.cost ?? IRRIGATION_COST} G paid`, "success", 2600);
        else if (result.reasonCode === "already-wet") this.notify("Every row is already damp; the pump had nothing to do", "info", 2600);
        else this.notify(result.cost === undefined
          ? "Field watered from the well"
          : `Field watered from the well · ${result.cost} Work spent`, "success", 2000);
        if (result.success) this.requestAutosave();
        break;
      }
      case "rest": {
        const result = this.sim.execute({ type: "player.rest-until-dawn" });
        if (result.success) {
          const gained = result.yield ?? 0;
          this.notify(gained > 0 ? `Rested until morning · +${gained} Work` : "Rested until morning", "success", 2600);
          this.requestAutosave();
        } else {
          this.notify(result.reason ?? "Could not rest", "danger");
        }
        break;
      }
      case "labor": {
        if (!picked.entityId) break;
        const result = this.sim.execute({ type: "labor.start", stationId: picked.entityId });
        if (!result.success) this.notify(result.reason ?? "Cannot work there", "warning");
        else {
          this.laborShiftFeedback = null;
          this.laborShiftFeedbackUntilMs = 0;
          this.announceLaborTimingOnce();
        }
        this.renderUI();
        break;
      }
      case "plant":
        this.confirmCropPlacement();
        break;
      case "refuel": {
        const result = this.sim.execute({ type: "boat.refuel", boatId: picked.entityId });
        if (!result.success) this.notify(result.reason ?? "Could not refuel", "danger");
        else {
          this.notify("Tank filled", "success", 2000);
          this.requestAutosave();
        }
        break;
      }
      case "load-carriage": {
        if (!picked.entityId) break;
        const result = this.sim.execute({ type: "cargo.load-carriage", mountId: picked.entityId });
        this.notify(result.success ? "Trade pack secured in carriage" : result.reason ?? "Could not load carriage", result.success ? "success" : "warning");
        if (result.success) this.requestAutosave();
        break;
      }
      case "pickup-cargo": {
        if (!picked.entityId) break;
        const result = this.sim.execute({ type: "cargo.pickup", cargoId: picked.entityId });
        if (!result.success) this.notify(result.reason ?? "Could not collect that trade pack", "danger");
        else {
          this.notify("Trade pack collected · carry it to a village buyer or a posted commission", "success", 2800);
          this.requestAutosave();
        }
        break;
      }
      case "tow": {
        const towQuote = this.sim.inspectEmergencyTowQuote();
        const result = this.sim.execute({ type: "boat.emergency-tow" });
        if (!result.success) this.notify(result.reason ?? "Could not arrange a tow", "danger");
        else {
          // The tow leaves the captain on the dock, so the helm mode ends with
          // it; otherwise the world keeps answering as if they were still aboard.
          this.restoreGameplayModeFromState();
          const fee = towQuote.cost === 0 ? "no charge" : `${towQuote.cost} G paid`;
          this.notify(
            towQuote.wrecked
              ? `Towed to ${towQuote.destinationLabel} · ${fee} · ${towQuote.travelMinutes} min passed · see Silas for repair`
              : `Towed to ${towQuote.destinationLabel} · ${fee} · ${towQuote.travelMinutes} min passed · catch kept`,
            "success",
            3200
          );
          this.requestAutosave();
        }
        break;
      }
      case "repair": {
        if (!picked.entityId) break;
        const result = this.sim.execute({ type: "boat.repair", boatId: picked.entityId });
        if (!result.success) this.notify(result.reason ?? "Silas cannot repair her yet", "warning");
        else {
          this.notify(`Hull repaired · ${(result.cost ?? 0).toLocaleString()} G`, "success", 2600);
          this.requestAutosave();
        }
        break;
      }
      case "board":
      case "dock":
        this.toggleBoatBoard(picked.entityId);
        break;
      case "mount":
      case "dismount":
        this.toggleMount(picked.entityId);
        break;
      case "purchase-boat": {
        const result = this.sim.execute({ type: "boat.purchase-skiff" });
        if (!result.success) {
          this.notify(result.reason ?? "Could not purchase the skiff", "danger");
        } else {
          this.notify(`Coastal skiff commissioned · ${(result.cost ?? 0).toLocaleString()} G`, "reward", 2600);
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
          this.setToast(picked.prompt.split(" · ")[0].replace(/^\[[^\]]+\]\s*/, ""), 1800);
        } else if (picked.stationId) {
          this.interactWithStation(picked);
        }
        break;
      case "cast":
        this.handleCastFishing("interact");
        break;
      case "read-notices":
        this.openVillageNotices();
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
    if (!import.meta.env.DEV && !this.worldAcceptance) return;
    (window as unknown as Record<string, unknown>).__NEVA_PROBE = {
      scene: this.worldScene.scene,
      renderer: this.worldScene.renderer,
      camera: this.gameCamera.camera
    };
    window.__NEVA_DEBUG = {
      execute: (command) => this.sim.execute(command),
      advanceGameMinutes: (minutes) => this.sim.advanceGameMinutes(minutes),
      tickRealSeconds: (seconds) => this.sim.tick(seconds),
      renderDiagnostics: () => {
        const world = this.worldScene.renderDiagnostics();
        const camera = this.gameCamera.camera;
        return {
          renderMode: this.captureMode,
          sceneIdentity: {
            goldTestId: this.benchmarkGoldTestId,
            worldSeed: this.benchmarkWorldSeed,
            bootReady: this.bootReady,
            worldAssetCount: world.meshes + world.instances
          },
          camera: {
            position: camera.position.toArray(),
            quaternion: camera.quaternion.toArray(),
            fovDegrees: camera.fov
          },
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
            devicePixelRatio: window.devicePixelRatio
          },
          presentation: {
            minute: this.sim.state.clock.currentMinute,
            weather: this.sim.state.weather.type,
            timeSeconds: this.lastPresentationTimeSeconds,
            fps: this.fps,
            frameTiming: this.frameTimingSnapshot(),
            startupTiming: this.startupTimingSnapshot(),
            phaseTiming: this.phaseTimingSnapshot()
          },
          world
        };
      },
      setCaptureRenderMode: (mode) => {
        this.captureMode = mode;
        this.worldScene.setCaptureRenderMode(mode);
      },
      setFieldOverlay: (mode) => {
        this.worldScene.setDiagnosticOverlay(mode, this.benchmarkWorldSeed);
      },
      setWorldOnly: (worldOnly) => {
        this.uiContainer.style.display = worldOnly ? "none" : "";
      },
      setShadowAtlas: (enabled) => this.worldScene.setShadowAtlasEnabled(enabled),
      setReviewEnvironment: ({ minute, weather, presentationTimeSeconds }) => {
        if (!this.worldAcceptance) throw new Error("Review environment requires persistence-disabled local world acceptance");
        this.sim.setDebugMinute(minute);
        this.sim.setDebugWeather(weather);
        // Keep actor and mount clocks monotonic during normal-camera review.
        // A fixed time is reserved for the pre-existing benchmark camera path.
        if (this.benchmarkView) this.benchmarkPresentationTimeSeconds = presentationTimeSeconds;
      },
      acceptanceRoute: (routeId) => {
        const route = WorldLayout.compiledRouteNetwork().find((candidate) => candidate.route.id === routeId);
        if (route) {
          return route.samples.map((sample) => ({
            x: sample.point.x,
            z: sample.point.z,
            distance: sample.distanceAlongRoute
          }));
        }
        const sailingRoute = WORLD_SAILING_ROUTES.find((candidate) => candidate.id === routeId);
        if (!sailingRoute) throw new Error(`Unknown acceptance route: ${routeId}`);
        let distance = 0;
        return sailingRoute.points.map((point, index, points) => {
          if (index > 0) distance += Math.hypot(point.x - points[index - 1].x, point.z - points[index - 1].z);
          return { x: point.x, z: point.z, distance };
        });
      },
      acceptanceBridgePosition: () => {
        const bridge = WorldLayout.landmark("bridge");
        return { x: bridge.x, z: bridge.z };
      },
      teleport: (x, z) => {
        const y = WorldLayout.isWater(x, z)
          ? 0.5
          : WorldLayout.traversalSurfaceHeight(x, z) + 0.5;
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
        const anchor = npcAnchorAt(npc.id, this.sim.state.clock, this.sim.state.quests);
        window.__NEVA_DEBUG?.teleport(anchor.x, anchor.z);
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
      projectWorldPoint: (x, z) => {
        const canvas = this.worldScene.renderer.domElement;
        const bounds = canvas.getBoundingClientRect();
        const projected = new THREE.Vector3(x, WorldLayout.terrainHeight(x, z), z)
          .project(this.gameCamera.camera);
        return {
          x: bounds.left + ((projected.x + 1) * 0.5) * bounds.width,
          y: bounds.top + ((1 - projected.y) * 0.5) * bounds.height,
          visible: projected.z >= -1 && projected.z <= 1
        };
      },
      snapshot: () => {
        const fishing = this.sim.state.basicFishing;
        const encounter = this.sim.activeFishingEncounter?.getState();
        const interactionTarget = this.pickInteraction();
        return {
          mode: this.mode,
          playerPosition: {
            x: this.sim.state.player.x,
            y: this.sim.state.player.y,
            z: this.sim.state.player.z
          },
          playerRotationY: this.sim.state.player.rotationY,
          cameraYaw: this.gameCamera.framingState().yawRadians,
          playerGrounded: this.sim.state.player.traversal.isGrounded,
          playerSprintStamina: this.sim.state.player.traversal.sprintStamina,
          starterDonkeyPosition: this.sim.state.mounts[STARTER_DONKEY_ID]
            ? { ...this.sim.state.mounts[STARTER_DONKEY_ID] }
            : null,
          activeQuestId: focusedQuestTrack(this.sim.state.quests).activeQuestId,
          activeQuestStepIndex: focusedQuestTrack(this.sim.state.quests).activeStepIndex,
          activeQuestStepProgress: { ...focusedQuestTrack(this.sim.state.quests).stepProgress },
          focusedTrackId: this.sim.state.quests.focusedTrackId,
          activeActId: this.sim.state.quests.activeActId,
          completedQuestIds: [...this.sim.state.quests.completedQuestIds],
          money: this.sim.state.player.money,
          cropCount: Object.keys(this.sim.state.crops).length,
          unlocked: [...this.sim.state.quests.unlockedFeatureIds],
          cargoCount: Object.keys(this.sim.state.fishCargo).length,
          cargoIds: Object.keys(this.sim.state.fishCargo),
          carriedFishCargoId: this.sim.state.player.carriedFishCargoId ?? null,
          activeMountId: this.sim.state.player.activeMountId,
          currentMinute: this.sim.state.clock.currentMinute,
          minutesPerRealSecond: this.sim.state.clock.minutesPerRealSecond,
          physicsStepCount: this.physicsStepCount,
          bootReady: this.bootReady,
          cropIds: Object.keys(this.sim.state.crops),
          schoolIds: Object.keys(this.sim.state.world.activeSchools),
          processingJobIds: Object.keys(this.sim.state.processingJobs),
          processingJobs: Object.values(this.sim.state.processingJobs).map((job) => ({
            id: job.id,
            recipeId: job.recipeId,
            stationId: job.stationId,
            status: job.status
          })),
          interactionTarget: interactionTarget
            ? {
                id: interactionTarget.id,
                entityId: interactionTarget.entityId,
                action: interactionTarget.action,
                prompt: interactionTarget.prompt
              }
            : null,
          basicFishing: fishing
            ? {
                phase: fishing.phase,
                barY: fishing.barY,
                barHeight: fishing.barHeight,
                fishY: fishing.fishY,
                barVy: fishing.barVy,
                catchProgress: fishing.catchProgress,
                isHolding: fishing.isHolding
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
    if (this.sim.state.player.activeMountId) {
      this.notify("Dismount first", "warning");
      return;
    }
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

  /**
   * Guards the panel hotkeys. Returns false when the key should be swallowed,
   * and says why rather than doing nothing visible.
   */
  private openOverlayFromHotkey(overlay: GameOverlay): boolean {
    if (this.modeController.activeModal === overlay) return true;
    if (this.modeController.blocksOverlayHotkeys) {
      this.notify("Close this first", "warning", 1400);
      return false;
    }
    if (!this.modeController.allowsOverlayChange(overlay, {
      catchSummary: this.sim.state.basicFishing?.phase === "caught"
    })) {
      this.notify("Land the fish first", "warning", 1400);
      return false;
    }
    return true;
  }

  private characterScreenBlocker(): string | null {
    if (this.activeModal === "character") return null;
    if (this.layoutEditor?.isActive()) return "Close Place mode before opening your gear";
    if (this.farmingActions.isActive) return "Finish or cancel the current action first";
    if (this.mode === "farm-placement") return "Finish placing the crop first";
    return this.sim.inspectCharacterEquipment().equipBlocker ?? null;
  }

  private selectToolSlot(slot: number): void {
    if (this.modeController.blocksHudOverlaysAndTools || this.activeModal) return;
    const selected = this.sim.inspectWorldHud(this.selectedCropId).contextualHotbar.find((entry) => entry.slot === slot);
    if (!selected) return;
    if (selected.action.type === "input") {
      this.inputRouter.dispatchVirtualAction(selected.action.action);
      return;
    }
    if (this.sim.state.player.activeMountId) {
      this.notify("Dismount first", "warning");
      return;
    }
    const tool = selected.action.tool;
    if (tool === "seeds") {
      this.startPlantingFromSeeds();
    } else {
      if (this.mode === "farm-placement") this.exitCropPlacement();
      this.activeTool = tool;
      if (!selected.ready) this.notify(selected.detail, "warning", 2000);
    }
  }

  private startPlantingFromSeeds(): void {
    if (this.modeController.blocksHudOverlaysAndTools || this.activeModal ||
      this.farmingActions.isActive || this.isMountTransitionActive() || this.layoutEditor?.isActive()) return;
    const seeds = this.sim.inspectSeedBelt().seeds;
    const targetCropId = seeds.find((seed) => seed.cropId === this.selectedCropId)?.cropId
      ?? seeds[0]?.cropId;
    if (!targetCropId) {
      this.notify("No seeds in the satchel. Visit the village stall.", "warning", 2200);
      return;
    }
    this.enterCropPlacement(targetCropId);
  }

  private enterCropPlacement(cropId: string): void {
    if (this.sim.state.sportFishing || this.sim.state.basicFishing) return;
    this.activeTool = "seeds";
    if (this.sim.state.player.activeMountId) {
      this.notify("Dismount before planting", "warning");
      return;
    }
    if (this.sim.state.player.activeBoatId) {
      this.notify("Disembark before planting", "warning");
      return;
    }
    if (!ContentRegistry.crops.get(cropId)) {
      this.notify("Unknown crop", "danger");
      return;
    }
    if (this.activeModal) {
      const previous = this.activeModal;
      this.modeController.resume();
      this.playOverlayAudio(previous, this.activeModal);
      this.syncOverlayState();
    }
    this.selectedCropId = cropId;
    this.inspectedCrop = null;
    this.setGameplayMode("farm-placement");
    const cropName = ContentRegistry.crops.get(cropId)?.name ?? "Crop";
    this.setToast(`${cropName}: point at prepared soil`, 1800);
    this.showContextualHint(
      "hint.farming_plant",
      "Field Cultivation",
      "Left-click prepared soil to plant. Leave room between crops.",
      "sprout"
    );
  }


  private updateCropPlacementPreview(): void {
    if (this.mode !== "farm-placement" || this.activeModal || this.farmingActions.isActive) {
      this.clearPlacementPreview();
      return;
    }
    this.refreshCropPlacementAtPointer();
  }

  /**
   * Re-resolves the current pointer on the action edge. The preview is a
   * rendered hint and can lag a pointer move by one frame; committing from a
   * fresh simulation query keeps a fast move-and-click deterministic.
   */
  private refreshCropPlacementAtPointer(): CropPlacementResult | null {
    const hit = this.worldScene.raycastTerrain(
      this.gameCamera.camera,
      this.inputRouter.getInputState().pointerNdc
    );
    if (!hit) {
      this.clearPlacementPreview();
      return null;
    }

    const player = this.sim.state.player;
    const farmId = findFarmIdAtWorld(hit.x, hit.z)
      ?? findFarmIdAtWorld(player.x, player.z, 2.5);
    if (!farmId) {
      this.clearPlacementPreview();
      return null;
    }

    const result = this.sim.query({
      type: "crop.validate-placement",
      request: {
        farmId,
        cropId: this.selectedCropId,
        x: hit.x,
        z: hit.z
      }
    }) as CropPlacementResult;
    this.placementResult = result;
    this.worldScene.setCropPlacementPreview(result);
    return result;
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
    // A fresh query wins; if the pointer misses terrain or the farm on the
    // click frame, commit the spot the player was just shown. The refresh
    // clears `placementResult` on a miss, so it must be read first. The plant
    // command re-validates either way.
    const shown = this.placementResult;
    const placement = this.refreshCropPlacementAtPointer() ?? shown;
    if (!placement?.valid) {
      this.setToast(placement?.reason ?? "Point at prepared farm soil");
      return;
    }
    const plantingWork = this.sim.quoteWorkCost(FARMING_ACTION_COST.plant, "farming", "farming.plant");
    if (!plantingWork.affordable) {
      this.setToast(`Need ${plantingWork.cost} Work to plant · ${plantingWork.availableWork} available`);
      return;
    }
    this.frozenPlacementResult = { ...placement, footprint: { ...placement.footprint } };
    this.setGameplayMode("on-foot");
    const target = this.frozenPlacementResult;
    this.lockedInteractionTarget = {
      id: `placement:${target.farmId}:${target.worldX.toFixed(3)}:${target.worldZ.toFixed(3)}`,
      kind: "planting-plot",
      action: "plant",
      prompt: `Plant ${cropDef.name} · ${plantingWork.cost} Work`,
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
      {
        type: "crop.plant",
        request: {
          farmId: target.farmId,
          cropId: target.cropId,
          x: target.worldX,
          z: target.worldZ
        }
      },
      (result) => {
        if (result.success) this.setToast(`${cropDef.name} planted`);
      }
    );
  }

  private inspectPointedTarget(): void {
    const pointer = this.inputRouter.getInputState().pointerNdc;
    const cropId = this.worldScene.pickCrop(this.gameCamera.camera, pointer);
    const crop = cropId ? this.sim.state.crops[cropId] : undefined;
    if (!cropId || !crop) {
      this.inspectedCrop = null;
      this.readWaterAtFeet();
      return;
    }
    const world = farmLocalToWorld(crop.farmId, crop);
    const distance = Math.hypot(
      this.sim.state.player.x - world.x,
      this.sim.state.player.z - world.z
    );
    // Information inspection has its own reach. It never authorizes or vetoes
    // watering/harvesting, whose acquisition and commands use their own reach.
    if (distance > this.sim.cropInteractionReachMeters("inspect")) {
      this.inspectedCrop = null;
      return;
    }
    this.inspectedCrop = this.sim.inspectCrop(cropId);
  }

  /**
   * The same right-click/Inspect verb that reads a crop reads the water when
   * the angler stands at fishable water. Pure query: no Work, no RNG, no state.
   */
  private readWaterAtFeet(): void {
    if (this.mode !== "on-foot" && this.mode !== "boat-driving") return;
    if (!WorldLayout.nearbyFishingHabitat(this.sim.state.player.x, this.sim.state.player.z)) return;
    const reading = this.sim.inspectWaterReading();
    this.setToast(reading?.brief ?? "No readable water here", 4600);
  }

  private getInspectedCropProjectedPosition(): { x: number; y: number; visible: boolean } | null {
    if (!this.inspectedCrop) return null;
    const placed = this.sim.state.crops[this.inspectedCrop.placedCropId];
    if (!placed) return null;
    const world = farmLocalToWorld(placed.farmId, placed);
    const canvas = this.worldScene?.renderer?.domElement;
    if (!canvas || !this.gameCamera?.camera) return null;
    const bounds = canvas.getBoundingClientRect();
    const y = WorldLayout.terrainHeight(world.x, world.z) + 0.35;
    const projected = new THREE.Vector3(world.x, y, world.z).project(this.gameCamera.camera);
    return {
      x: bounds.left + ((projected.x + 1) * 0.5) * bounds.width,
      y: bounds.top + ((1 - projected.y) * 0.5) * bounds.height,
      visible:
        projected.z >= -1 &&
        projected.z <= 1 &&
        projected.x >= -1.2 &&
        projected.x <= 1.2 &&
        projected.y >= -1.2 &&
        projected.y <= 1.2
    };
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
      // Benchmark captures freeze the world clock; stamp presentation with the
      // same clock so VFX/deadlines line up with the frame that advances them.
      this.lastPresentationTimeSeconds || performance.now() / 1000,
      snapshot.target.presentationKind
    );
    if (snapshot.phase === "cancelled") {
      this.worldScene.cancelFarmingVfx("water");
      this.worldScene.playPlayerAction("idle");
    }
    this.playFarmingActionAudio(snapshot);
    this.playFarmingActionVfx(snapshot);
    if (snapshot.phase === "started") {
      const animation = snapshot.action === "processing-start"
        ? snapshot.target.presentationKind === "tailoring" ? "craft_tailor"
          : snapshot.target.presentationKind === "toolmaking" ? "craft_tool"
            : "workstation"
        : snapshot.action === "processing-collect"
          ? snapshot.target.presentationKind === "ready-equipment" ? "gear_check" : "pickup"
          : snapshot.action === "fertilize"
            ? "place"
            : snapshot.action === "unroot"
              // No dedicated uproot clip; the harvest swing reads as working
              // the plant loose, and the unroot cue/VFX carry the difference.
              ? "harvest"
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
    if (snapshot.phase === "started" && (snapshot.action === "harvest" || snapshot.action === "unroot")) {
      play("sickle-swish");
      return;
    }
    if (snapshot.phase === "committed") {
      switch (snapshot.action) {
        case "plant":
          play("plant-dirt");
          break;
        case "unroot":
          play("plant-dirt");
          break;
        case "fertilize":
          play("fertilizer-dust");
          play("place");
          break;
        // Water and harvest cues belong to `CropWatered` / `CropHarvested` in
        // `bindDomainAudio`; playing them here as well doubled every cue.
        // Processing/equipment cues bind to canonical domain events so a
        // missing or reduced animation cannot suppress or duplicate them.
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
    const timeSeconds = this.lastPresentationTimeSeconds || performance.now() / 1000;
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
      if (snapshot.action === "harvest" && snapshot.commitSucceeded && snapshot.target.entityId) this.worldScene.punchCropHarvest(snapshot.target.entityId, timeSeconds);
      if (snapshot.action === "plant" || snapshot.action === "fertilize" || snapshot.action === "unroot") this.worldScene.spawnFarmingVfx("dirt", target, timeSeconds);
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
    command: GameCommand,
    onCommitted?: (result: Readonly<InteractionResult>) => void,
    targetY: number = WorldLayout.terrainHeight(x, z),
    entityId?: string,
    presentationKind?: import("../simulation/core/types").ProcessingPresentationKind | "ready-equipment"
  ): boolean {
    // Admission must precede any canonical simulation write. In particular,
    // facePlayerToward() changes the saved player pose; an overlapping action
    // must be a no-op all the way through its rejected path.
    if (this.farmingActions.isActive) {
      this.lockedInteractionTarget = null;
      this.setToast("Finish the current action first");
      return false;
    }
    if (this.sim.state.player.activeMountId) {
      this.notify("Dismount first", "warning");
      return false;
    }
    const handsBlocker = this.sim.inspectFreeHands();
    if (handsBlocker && action !== "pickup" && action !== "place" && action !== "dock") {
      this.notify(handsBlocker, "warning");
      return false;
    }
    const workCost = this.quoteActionWorkCost(command);
    const started = this.farmingActions.start(
      action,
      { x, y: targetY, z, entityId, presentationKind },
      performance.now(),
      command,
      {
        phaseChanged: (snapshot) => {
          if ((snapshot.phase === "committed" || snapshot.phase === "invalidated") && snapshot.commitResult) {
            onCommitted?.(snapshot.commitResult);
            if (!snapshot.commitResult.success) {
              this.notify(snapshot.commitResult.reason ?? "That action is no longer available", "danger");
            }
          }
          this.handleFarmingActionPhase(snapshot);
        }
      },
      workCost
    );
    if (!started) {
      this.lockedInteractionTarget = null;
      this.setToast("Finish the current action first");
      return false;
    }
    // Face only after presentation admission succeeds. This is itself a
    // canonical pose command, so it must not run on a rejected action path.
    this.facePlayerToward(x, z);
    this.inputRouter.setJumpBlocked(true);
    this.inputRouter.consumeJumpRequest();
    return true;
  }

  private quoteActionWorkCost(command: GameCommand): number | null {
    switch (command.type) {
      case "crop.plant":
      case "crop.plant-near":
        return this.sim.quoteWorkCost(FARMING_ACTION_COST.plant, "farming", "farming.plant").cost;
      case "crop.water":
        return this.sim.quoteWorkCost(FARMING_ACTION_COST.water, "farming", "farming.water").cost;
      case "crop.harvest":
        return this.sim.state.crops[command.placedCropId]?.stage === "withered"
          ? 0
          : this.sim.quoteWorkCost(FARMING_ACTION_COST.harvest, "farming", "farming.harvest").cost;
      case "crop.unroot":
        return this.sim.quoteWorkCost(FARMING_ACTION_COST.unroot, "farming", "farming.unroot").cost;
      case "farm.apply-fertilizer":
        return (this.sim.state.farms[command.farmId]?.soil.fertility ?? 0) >= FERTILITY_MAX
          ? 0
          : this.sim.quoteWorkCost(FARMING_ACTION_COST.fertilize, "farming", "farming.fertilize").cost;
      case "processing.start": {
        const recipe = ContentRegistry.recipes.get(command.recipeId);
        return recipe
          ? this.sim.quoteWorkCost(processingWorkForRecipe(recipe), "processing", "processing.start").cost
          : null;
      }
      case "fishing.release-cast-basic":
        return this.sim.quoteWorkCost(BASIC_FISHING_WORK_COST, "fishing", "fishing.basic-cast").cost;
      default:
        return null;
    }
  }

  private facePlayerToward(x: number, z: number): void {
    const result = this.sim.execute({ type: "player.face-target", x, z });
    if (!result.success) return;
    this.playerPresentation.pushCanonicalPose(this.sim.state.player);
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
    this.startFarmingAction("fertilize", target.x, target.z, { type: "farm.apply-fertilizer", farmId }, (result) => {
      if (result.success) this.setToast("Fertilized the soil");
    });
  }

  private startCropAction(action: "water" | "harvest", placedCropId: string): void {
    const crop = this.sim.state.crops[placedCropId];
    if (!crop) return;
    const cropName = ContentRegistry.crops.get(crop.cropId)?.name ?? "Crop";
    const world = farmLocalToWorld(crop.farmId, crop);
    if (action === "water") {
      this.showContextualHint(
        "hint.farming_water",
        "Crop Hydration",
        "Dry soil needs water before the crop can thrive.",
        "waves"
      );
    }
    const command: GameCommand = action === "water"
      ? { type: "crop.water", placedCropId }
      : { type: "crop.harvest", placedCropId };
    this.startFarmingAction(action, world.x, world.z, command, (result) => {
      if (result.success) {
        this.inspectedCrop = action === "water" ? this.sim.inspectCrop(placedCropId) : null;
        if (action === "harvest") {
          this.setToast(
            result.yield
              ? `${cropName} · ${result.yield} harvested · ${result.quality ?? "common"} grade · +${result.xpGained ?? 0} Farming XP`
              : result.reason ?? "Crop cleared"
          );
          // Harvest is one of the dearest routine actions (30 Work). Teach the
          // resource at the first moment it visibly moves, rather than letting
          // a new player either never notice it or hit the wall confused.
          // Grade improves harvest XP and sale value; demand still affects the quote.
          if (crop.stage !== "withered") {
            this.showContextualHint(
              "hint.work_capacity",
              "Work Capacity",
              "Harvesting costs more Work than watering. Better grades earn extra XP and can sell for more gold. Rest, meals and chore shifts restore Work; time restores only a little.",
              "energy"
            );
          }
        } else {
          this.setToast("Watered");
        }
      }
    });
  }

  private startUnrootAction(placedCropId: string): void {
    const crop = this.sim.state.crops[placedCropId];
    if (!crop) return;
    const cropName = ContentRegistry.crops.get(crop.cropId)?.name ?? "Crop";
    const world = farmLocalToWorld(crop.farmId, crop);
    this.startFarmingAction(
      "unroot",
      world.x,
      world.z,
      { type: "crop.unroot", placedCropId },
      (result) => {
        if (result.success) this.setToast(`${cropName} unrooted`);
      },
      undefined,
      placedCropId
    );
  }

  private toggleBoatBoard(targetBoatId?: string): void {
    if (this.mode === "on-foot") {
      const boatId = targetBoatId ?? "boat.player_rowboat";
      const boat = this.sim.state.boats[boatId];
      if (!boat || !this.sim.canBoardBoat(boatId)) {
        this.setToast("Move closer to the docked vessel");
        return;
      }
      this.startFarmingAction("board", boat.x, boat.z, { type: "boat.board", boatId }, (result) => {
        if (result.success) {
          this.setGameplayMode("boat-driving");
          this.playerPresentation.pushCanonicalPose(this.sim.state.player, {
            discontinuity: "boarding"
          });
          const boatName = ContentRegistry.boats.get(boat.boatTypeId)?.name ?? "boat";
          this.showContextualHint(
            "hint.boat_steering",
            `${boatName} Navigation`,
            "[W/S] Throttle • [A/D] Steer • [E] Dock at a marked mooring.",
            "anchor"
          );
          this.requestAutosave();
        }
      }, boat.y, boatId);
    } else if (this.mode === "boat-driving") {
      const boatId = this.sim.state.player.activeBoatId;
      const boat = boatId ? this.sim.state.boats[boatId] : null;
      if (!boat || !this.sim.canDockActiveBoat()) {
        this.setToast("Return to a marked mooring to disembark");
        return;
      }
      this.startFarmingAction("dock", boat.x, boat.z, { type: "boat.dock" }, (result) => {
        if (result.success) {
          this.setGameplayMode("on-foot");
          this.playerPresentation.pushCanonicalPose(this.sim.state.player, {
            discontinuity: "docking"
          });
          this.requestAutosave();
        }
      }, boat.y, boat.id);
    }
  }

  private toggleMount(targetMountId?: string): void {
    if (this.isMountTransitionActive()) return;
    if (this.mode === "on-foot") {
      const mountId = targetMountId ?? STARTER_DONKEY_ID;
      const result = this.sim.execute({ type: "mount.board", mountId });
      if (!result.success) {
        this.notify(result.reason ?? "Move closer to the donkey", "danger");
        return;
      }
      this.restoreGameplayModeFromState();
      this.playerPresentation.pushCanonicalPose(this.sim.state.player, {
        discontinuity: "boarding"
      });
      this.requestAutosave();
      return;
    }

    if (this.mode !== "mounted") return;
    const result = this.sim.execute({ type: "mount.dismount" });
    if (!result.success) {
      this.notify(result.reason ?? "There is no safe ground to dismount here", "danger");
      return;
    }
    this.restoreGameplayModeFromState();
    this.playerPresentation.pushCanonicalPose(this.sim.state.player, {
      discontinuity: "dismounting"
    });
    this.requestAutosave();
  }

  private beginMountTransition(action: "mount" | "dismount"): void {
    const authoredDuration = this.worldScene.playerAnimationActionDurationSeconds(action);
    const durationSeconds = Number.isFinite(authoredDuration) && authoredDuration > 0
      ? authoredDuration
      : 0.8;
    this.mountTransitionAction = action;
    this.mountTransitionRemainingSeconds = durationSeconds;
    this.lockedInteractionTarget = null;
    this.promptText = null;
  }

  private isMountTransitionActive(): boolean {
    if (!this.mountTransitionAction) return false;
    if (this.mountTransitionRemainingSeconds > 0) return true;
    this.mountTransitionAction = null;
    this.mountTransitionRemainingSeconds = 0;
    return false;
  }

  private interactWithSchool(schoolId: string, action: "chum" | "hook"): void {
    if (action === "chum") {
      // Name the blend the domain is about to spend so auto-precedence is
      // never a silent choice between standard, rich and deep chum.
      const chumItemId = nextAccessibleChumItemId(this.sim.state);
      const chumName = chumItemId ? ContentRegistry.items.get(chumItemId)?.name ?? "chum" : "chum";
      const res = this.sim.execute({ type: "fishing.chum-school", schoolId });
      if (!res.success) this.setToast(res.reason ?? "Cannot chum school");
      else this.setToast(`Chummed with ${chumName} · the school is feeding`, 2200);
    } else {
      const res = this.sim.execute({ type: "fishing.hook-school", schoolId });
      if (res.success) {
        this.setGameplayMode("sport-fishing");
        this.hudFishingHold = { isReeling: false, isSlacking: false, isBracing: false, rodDirectionAngle: 0 };
        this.showContextualHint(
          "hint.fishing_sport",
          "Sport Fishing",
          "Hold [W/LMB] to reel, [S/RMB] to let line out, and [Space] to brace. Use [A/D] to counter runs.",
          "fish"
        );
      } else {
        this.setToast(res.reason ?? "Cannot hook fish");
      }
    }
  }


  private interactWithStation(target: ResolvedInteractionTarget): void {
    const { stationId } = target;
    if (!stationId) return;
    const structure = this.sim.state.world.structures[stationId];
    if (!structure) return;
    const interactionPosition = target.worldPosition;
    if (!interactionPosition) return;
    const job = this.findStationJob(stationId);
    if (target.action === "collect-processing" && job?.status === "complete") {
      this.startFarmingAction("processing-collect", interactionPosition.x, interactionPosition.z, {
        type: "processing.collect",
        jobId: job.id
      }, (result) => {
        if (result.success) this.setToast(
          result.xpGained
            ? `Collected ${job.outputLabel} · +${result.xpGained} Processing XP`
            : `Collected ${job.outputLabel}`,
          3200
        );
      }, undefined, undefined, job.result.kind === "equipment" ? "ready-equipment" : job.presentationKind);
      return;
    }
    if (target.action === "inspect" || job?.status === "active") {
      const inspection = this.sim.inspectProcessingJob(stationId);
      this.setToast(inspection?.waitBriefing ?? "Job in progress", 4000);
      return;
    }
    this.activeCraftingStationId = stationId;
    this.setActiveModal("crafting");
  }

  private startProcessingFromModal(recipeId: RecipeId, stationId: string): InteractionResult {
    if (this.activeCraftingStationId !== stationId || this.activeModal !== "crafting") {
      return { success: false, reason: "Return to the station before starting this job" };
    }
    const structure = this.sim.state.world.structures[stationId];
    if (!structure) return { success: false, reason: "Station not found" };
    const approach = assessProcessingStationApproach(stationId, this.sim.state.player, structure);
    if (!approach.valid || !approach.frontPosition) {
      return { success: false, reason: "Move back to the front of the station" };
    }
    const started = this.startFarmingAction(
      "processing-start",
      approach.frontPosition.x,
      approach.frontPosition.z,
      { type: "processing.start", recipeId, stationId },
      (result) => {
        if (result.success) {
          const inspection = this.sim.inspectProcessingJob(stationId);
          this.setToast(inspection?.startBriefing ?? "Work started", 4000);
          if (inspection && inspection.remainingMinutes >= 60) {
            this.showContextualHint(
              `hint.processing_wait.${inspection.recipeId}`,
              inspection.recipeName,
              `${inspection.outputName} finishes in ${formatGameDuration(inspection.remainingMinutes)} on the game clock (${inspection.readyClockLabel}). Keep farming, or rest until morning, while it works.`,
              "hourglass"
            );
          }
        }
      },
      undefined,
      undefined,
      ContentRegistry.recipes.get(recipeId)?.presentationKind
    );
    return started ? { success: true } : { success: false, reason: "Finish the current action first" };
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
    if (document.hidden) {
      this.hiddenSinceLastFrame = true;
      this.requestAutosave();
    }
  };

  private requestMobileLandscape = (): void => {
    if (!this.mobileTouchDevice) return;
    const lockLandscape = (): void => {
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (orientation: "landscape") => Promise<void>;
      };
      if (!orientation?.lock) return;
      void orientation.lock("landscape").catch(() => {
        // Orientation locking is best-effort; the portrait gate remains the
        // deterministic fallback when the browser or platform rejects it.
      });
    };
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      void document.documentElement.requestFullscreen().then(lockLandscape, lockLandscape);
    } else {
      lockLandscape();
    }
  };

  private updateMobileViewportState(): boolean {
    const touchDevice = detectTouchDevice();
    const width = this.canvasContainer.clientWidth || window.innerWidth;
    const height = this.canvasContainer.clientHeight || window.innerHeight;
    const landscape = !touchDevice || width >= height;
    const blocked = touchDevice && !landscape;
    const changed = touchDevice !== this.mobileTouchDevice
      || landscape !== this.mobileLandscape
      || blocked !== this.mobileOrientationBlocked;
    this.mobileTouchDevice = touchDevice;
    this.mobileLandscape = landscape;
    this.mobileOrientationBlocked = blocked;
    return changed;
  };

  private requestAutosave(): void {
    if (!this.isRunning || !this.bootReady || this.persistenceDisabled || !this.durableWritesEnabled) return;
    this.autosaveRequested = true;
    if (this.autosaveInFlight) return;
    if (this.autosaveFlushQueued) return;
    this.autosaveFlushQueued = true;
    queueMicrotask(() => {
      this.autosaveFlushQueued = false;
      if (!this.isRunning || !this.bootReady || this.autosaveInFlight || !this.autosaveRequested) return;
      void this.flushAutosave();
    });
  }

  /**
   * Periodic autosave on a fixed cadence measured from the last success or the
   * last periodic attempt, whichever is later, so a store that keeps refusing
   * is retried once per interval rather than on every frame.
   */
  private requestPeriodicAutosave(nowMs: number): void {
    if (nowMs - Math.max(this.lastAutosaveMs, this.lastPeriodicAutosaveRequestMs) < AUTOSAVE_INTERVAL_MS) return;
    this.lastPeriodicAutosaveRequestMs = nowMs;
    this.requestAutosave();
  }

  private async flushAutosave(): Promise<void> {
    this.autosaveInFlight = true;
    try {
      while (this.autosaveRequested) {
        this.autosaveRequested = false;
        const saved = await this.saveRepo.saveGame(this.sim.state);
        if (saved) {
          this.lastAutosaveMs = performance.now();
          this.autosaveFailureNotified = false;
        } else if (!this.autosaveFailureNotified) {
          this.autosaveFailureNotified = true;
          this.notify("Autosave failed — recent progress is not saved yet. Retrying.", "warning", 6000);
        }
      }
    } finally {
      this.autosaveInFlight = false;
      if (this.isRunning && this.autosaveRequested) void this.flushAutosave();
    }
  }

  private handleCastFishing(source: "interact" | "primary" = "interact"): void {
    if (this.mode === "sport-fishing") return;
    if (this.sim.state.player.activeMountId) {
      this.setToast("Dismount before fishing");
      return;
    }
    if (this.activeTool !== "fishing-rod") {
      // Casting takes the rod out rather than turning the player away for
      // forgetting to. Without a rod at all there is still nothing to cast.
      if (!ContentRegistry.rods.get(this.sim.state.player.equippedRodId)) {
        this.setToast("No fishing rod in your kit");
        return;
      }
      if (this.mode === "farm-placement") this.exitCropPlacement();
      this.activeTool = "fishing-rod";
    }
    const p = this.sim.state.player;
    if (!WorldLayout.nearbyFishingHabitat(p.x, p.z)) {
      this.setToast("Move closer to water to fish");
      return;
    }
    const res = this.sim.execute({ type: "fishing.start-charge-basic" });
    if (res.success) {
      this.setGameplayMode("basic-fishing");
      this.basicCastSource = source;
      this.showContextualHint(
        "hint.fishing_basic",
        "River Angling",
        "Hold [Space] to raise your catch bar. Keep the fish centered to land it!",
        "rod"
      );
    } else {
      this.setToast(res.reason ?? "Fishing failed");
    }
  }

  private releaseBasicFishingCast(power?: number): void {
    const basicFishing = this.sim.state.basicFishing;
    if (this.mode !== "basic-fishing" || !basicFishing || basicFishing.phase !== "charging-cast") {
      this.basicCastSource = null;
      return;
    }
    if (this.modeController.pausesSimulation || this.modeController.blocksWorldInput) {
      this.basicCastSource = null;
      return;
    }
    const snapshot = Math.max(0.05, Math.min(1, power ?? basicFishing.castPower ?? 0.75));
    const player = this.sim.state.player;
    const targetX = player.x + Math.sin(player.rotationY) * 4;
    const targetZ = player.z + Math.cos(player.rotationY) * 4;
    const started = this.startFarmingAction(
      "cast",
      targetX,
      targetZ,
      { type: "fishing.release-cast-basic", castPower: snapshot }
    );
    if (started) this.basicCastSource = null;
  }


  private handleResetPlayerToSafePlace(): void {
    const result = this.sim.execute({ type: "player.reset-safe" });
    if (!result.success) {
      this.notify(result.reason ?? "Return to the harbor before using Safe Return", "danger", 3600);
      return;
    }
    this.playerPresentation.pushCanonicalPose(this.sim.state.player, {
      discontinuity: "recovery"
    });
    this.setGameplayMode("on-foot");
    this.modeController.resume();
    this.syncOverlayState();
    this.notify("Character safely returned to the nearest landing", "success", 3000);
    this.requestAutosave();
  }

  private renderUI(): void {
    if (!this.uiRoot) return;
    if (!this.bootReady) {
      this.uiRoot.render(React.createElement("div", {
        id: "ui-container", "data-ui": "guildcraft",
        "data-mobile-device": String(this.mobileTouchDevice), "data-mobile-landscape": String(this.mobileLandscape),
        style: { width: "100%", height: "100%", position: "relative" }
      }, React.createElement(StartScreen, {
        startup: this.startupState,
        onStart: () => this.beginLoading(true, "continue"),
        onSkipIntro: () => this.openingSkip?.(),
        onIntroFinished: (played: boolean) => this.finishIntro?.(played),
        onStartNewGame: () => this.beginLoading(true, "new-game"),
        onStartWithoutSaving: () => { if (this.saveDecision) this.saveDecision(false); else this.beginLoading(true, "without-saving"); },
        onRetry: this.retryStartup,
        graphicsQuality: this.graphicsQuality.preference,
        effectiveGraphicsQuality: this.graphicsQuality.effectiveTier,
        onGraphicsQualityChange: preference => {
          if (this.graphicsQuality.setPreference(preference)) this.worldScene.setQuality(this.graphicsQuality.effectiveTier);
          this.renderUI();
        },
        mobileTouchDevice: this.mobileTouchDevice,
        mobileOrientationBlocked: this.mobileOrientationBlocked
      }), React.createElement(MobileOrientationGate, {
        touchDevice: this.mobileTouchDevice,
        orientationBlocked: this.mobileOrientationBlocked,
        onRequestLandscape: this.requestMobileLandscape
      })));
      return;
    }
    const laborHud = this.sim.query({ type: "labor.get-hud" }) as LaborHudDto;
    this.laborHud = laborHud.active ? laborHud : null;    if (this.laborShiftFeedback && performance.now() >= this.laborShiftFeedbackUntilMs) {
      this.laborShiftFeedback = null;
    }
    const worldHud = this.sim.inspectWorldHud(this.selectedCropId);
    if (!this.activeHint && !this.activeModal && !this.benchmarkView) {
      const hint = buildNextWorldHint(this.sim.state);
      if (hint) this.showContextualHint(hint.hintId, hint.title, hint.message, hint.icon);
    }

    if (this.mode === "sport-fishing" && !this.sim.activeFishingEncounter) {
      // Encounter finished
      this.restoreGameplayModeFromState();
      this.hudFishingHold = { isReeling: false, isSlacking: false, isBracing: false, rodDirectionAngle: 0 };
    }
    if (this.mode === "basic-fishing" && !this.sim.state.basicFishing) {
      this.basicFishingWidgetHold = false;
      this.restoreGameplayModeFromState();
    }

    const state = this.sim.getState();
    // The People and Notices folios are rebuilt only for a visible Journal.
    // They read mutable state, so they cannot be memoized on state identity;
    // rebuilding them on open is the revision boundary instead.
    if (this.activeModal === "journal") {
      this.cachedVillageNotices = selectVillageNotices(villageNoticeContext(state));
      this.cachedPeoplePage = buildPeoplePageDto(state);
    }
    // Keep the fishing widget on a detached snapshot. React is presentation;
    // even an accidental child mutation must not alter the live fishing
    // attempt that the simulation will tick or persist.
    const basicFishingState = state.basicFishing ? structuredClone(state.basicFishing) : null;
    const cameraPosition = this.gameCamera.camera.position;
    const cameraFraming = this.gameCamera.framingState();
    const placementTarget = this.frozenPlacementResult ?? this.placementResult;
    const nowMs = performance.now();
    if (this.diagnosticsEnabled && nowMs - this.lastDiagnosticsFrameMs >= 250) {
      this.lastDiagnosticsFrameMs = nowMs;
      this.renderStats = {
        calls: this.worldScene.renderer.info.render.calls,
        triangles: this.worldScene.renderer.info.render.triangles,
        points: this.worldScene.renderer.info.render.points,
        lines: this.worldScene.renderer.info.render.lines,
        ...this.worldScene.renderObjectStats()
      };
    }

    this.uiRoot.render(
      React.createElement(GameUI, {
        playerPosition: { x: state.player.x, z: state.player.z },
        sessionRevision: this.uiSessionRevision,
        debugSnapshot: import.meta.env.DEV && this.diagnosticsEnabled
          ? selectDebugGameSnapshot(state)
          : null,
        basicFishingState,
        mode: this.mode,
        fps: this.fps,
        renderStats: this.renderStats,
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
          actionTargetZ: this.farmingActionSnapshot?.target.z ?? null,
          physicsStepCount: this.physicsStepCount
        },
        placementValid: this.placementResult?.valid ?? null,
        placementTarget: placementTarget
          ? { x: placementTarget.worldX, z: placementTarget.worldZ }
          : null,
        promptText: this.promptText,
        worldHud,
        canFishHere: (this.mode === "on-foot" || this.mode === "boat-driving") &&
          Boolean(WorldLayout.nearbyFishingHabitat(this.sim.state.player.x, this.sim.state.player.z)),
        notices: this.currentNotices(),
        villageNotices: this.cachedVillageNotices,
        people: this.cachedPeoplePage ?? undefined,
        journalOpenRequest: this.journalOpenRequest,
        chronicleEntries: this.chronicle.list(),
        chronicleFilter: this.chronicleFilter,
        onSelectChronicleFilter: (filter: ChronicleFilter) => {
          this.chronicleFilter = filter;
        },
        inspectedCrop: this.inspectedCrop,
        inspectedCropPosition: this.getInspectedCropProjectedPosition(),
        onDismissCropInspection: () => {
          this.inspectedCrop = null;
        },
        onUnrootCrop: (placedCropId: string) => {
          this.startUnrootAction(placedCropId);
        },
        farmingAction: this.farmingActionSnapshot,
        activeModal: this.activeModal,
        onSetActiveModal: (modal: ActiveModal) => {
          if (modal === "character") {
            const blocker = this.characterScreenBlocker();
            if (blocker) {
              this.notify(blocker, "warning", 1800);
              return;
            }
          }
          if (!this.modeController.allowsOverlayChange(modal, {
            catchSummary: this.sim.state.basicFishing?.phase === "caught"
          })) return;
          this.setActiveModal(modal);
        },
        savingAvailable: !this.persistenceDisabled && this.durableWritesEnabled,
        marketId: this.activeMarketId,
        activeQuest: this.sim.questDomain.getActiveQuestDto(),
        // Every thread the player is carrying, focused first. Without this the
        // three side tracks ran, progressed and could be turned in while never
        // appearing anywhere in the UI.
        activeQuests: this.sim.questDomain.getActiveQuestDtos(),
        onFocusTrack: (trackId: string) => {
          this.sim.execute({ type: "quest.focus-track", trackId });
        },
        activeDialogueNpcId: this.activeDialogueNpcId,
        onTalkNpc: this.handleTalkNpc,
        activeHint: this.activeHint,
        onDismissHint: this.dismissActiveHint,
        onSelectPlantCrop: (cropId: string) => {
          this.enterCropPlacement(cropId);
        },
        onInspectPlanting: (cropId: string) => {
          const state = this.sim.state;
          if (state.basicFishing || state.sportFishing) return { valid: false, reason: "Finish fishing first" };
          if (state.player.activeMountId) return { valid: false, reason: "Dismount before planting" };
          if (state.player.activeBoatId) return { valid: false, reason: "Step ashore before planting" };
          const farmId = findFarmIdAtWorld(state.player.x, state.player.z, 2.5);
          if (!farmId) return { valid: false, reason: "Move to prepared farm soil" };
          const result = this.sim.findPlantingPosition(farmId, cropId);
          return { valid: result.success, reason: result.reason };
        },
        onInspectSatchel: () => this.sim.inspectSatchel(),
        onInspectAlmanac: () => this.sim.inspectAlmanac(),
        onInspectDemandTrend: (marketId: string, itemId: string) =>
          this.sim.query({
            type: "market.demand-trend",
            marketId: marketId as never,
            itemId: itemId as never
          }) as MarketDemandTrendDto | null,
        onInspectItem: (itemId: string) => this.sim.inspectItem(itemId as never),
        onConsumeItem: (itemId: string) => {
          const result = this.sim.execute({ type: "item.consume", itemId });
          if (!result.success) this.notify(result.reason ?? "Could not eat that", "warning");
          else {
            this.notify(`Meal eaten · +${result.yield ?? 0} Work`, "success", 2200);
            this.requestAutosave();
          }
          this.renderUI();
          return result;
        },
        onSortSatchel: () => {
          const result = this.sim.execute({ type: "inventory.sort-satchel" });
          return { success: result.success, reason: result.reason };
        },
        onDiscardItem: (itemId: string, quantity: number, quality: CropQuality | null) => {
          const result = this.sim.execute({
            type: "inventory.discard",
            itemId: itemId as never,
            quantity,
            quality: quality ?? undefined
          });
          // A destroy is a loss, not a reward; re-seed the delta snapshot so the
          // next sample cannot read the destroyed stack as a gain.
          if (result.success) {
            this.rewardFeedback.reset();
            this.requestAutosave();
          }
          this.renderUI();
          return result;
        },
        onTransferStores: (
          itemId: string,
          quantity: number,
          boatId: string,
          direction: "to-hold" | "to-satchel"
        ) => {
          const result = this.sim.execute({
            type: "inventory.transfer",
            itemId: itemId as never,
            quantity,
            boatId: boatId as never,
            direction
          });
          // A transfer is not a reward; re-seed the delta snapshot so the
          // next sample does not emit a fake "+N <item>" toast.
          if (result.success) this.rewardFeedback.reset();
          return { success: result.success, reason: result.reason };
        },
        onInspectSeedBelt: () => this.sim.inspectSeedBelt(),
        selectedPlantCropId: this.selectedCropId,
        onCancelPlacement: () => this.exitCropPlacement(),
        isFarmGisHeld: this.isFarmGisHeld,
        contextualCropChoices: this.contextualCropChoices,
        onChooseCropAction: (choice: ContextualCropChoice) => this.handleContextInteract(choice),
        canStartPlanting: this.mode === "on-foot" && worldHud.stance === "agronomy"
          && !this.farmingActions.isActive && !this.isMountTransitionActive()
          && !this.layoutEditor?.isActive()
          && this.sim.inspectSeedBelt().seeds.length > 0,
        onStartPlanting: () => this.startPlantingFromSeeds(),
        landedCatch: this.pendingCatchCargo
          ? inspectLandedCatch(state, this.pendingCatchCargo, this.pendingCatchRecord)
          : null,
        onDismissCatchSummary: this.dismissPendingCatch,

        sportFishingHud: this.sim.inspectSportFishingHud(),
        laborHud: this.laborHud,
        stormHelmHud: this.stormHelmHud,
        laborShiftFeedback: this.laborShiftFeedback,
        onLaborStrike: () => this.strikeLaborShift(),
        onLaborCancel: () => {
          this.sim.execute({ type: "labor.cancel" });
          this.renderUI();
        },
        onSetFishingDrag: (notch) => {
          if (this.mode !== "sport-fishing" || this.modeController.pausesSimulation || this.modeController.blocksWorldInput) return;
          const result = this.sim.execute({ type: "fishing.set-drag", notch });
          if (!result.success) this.notify(result.reason ?? "Could not adjust drag", "warning");
        },
        onKeepFishingCatch: () => {
          if (this.mode !== "sport-fishing" || this.modeController.pausesSimulation || this.modeController.blocksWorldInput) return;
          const result = this.sim.execute({ type: "fishing.keep-catch" });
          if (!result.success) this.notify(result.reason ?? "Could not keep the catch", "warning");
          this.renderUI();
        },
        onReleaseFishingCatch: () => {
          if (this.mode !== "sport-fishing" || this.modeController.pausesSimulation || this.modeController.blocksWorldInput) return;
          const result = this.sim.execute({ type: "fishing.release-catch" });
          if (!result.success) this.notify(result.reason ?? "Could not release the fish", "warning");
          this.renderUI();
        },
        onSetFishingInput: (input) => {
          this.hudFishingHold = {
            isReeling: input.isReeling,
            isSlacking: input.isSlacking,
            isBracing: input.isBracing,
            rodDirectionAngle: input.rodDirectionAngle
          };
          this.applySportFishingInput();
        },
        onSetBasicFishingHold: (holding: boolean) => {
          this.basicFishingWidgetHold = holding;
          this.applyBasicFishingInput();
        },
        onHookBasicFishingBite: () => {
          if (this.mode !== "basic-fishing" || this.modeController.pausesSimulation || this.modeController.blocksWorldInput) return;
          this.sim.execute({ type: "fishing.hook-bite-basic" });
        },
        onDismissBasicFishingModal: () => {
          if (this.mode !== "basic-fishing" || this.modeController.pausesSimulation || this.modeController.blocksWorldInput) {
            return { success: false, reason: "Fishing is paused" };
          }
          if (this.sim.state.basicFishing?.phase === "caught") {
            const result = this.sim.execute({ type: "fishing.commit-basic" });
            if (!result.success) this.notify(result.reason ?? "The satchel is full", "warning");
            return result;
          } else if (this.sim.state.basicFishing?.phase === "escaped") {
            return this.sim.execute({ type: "fishing.cancel-basic" });
          }
          return { success: false, reason: "Nothing to collect" };
        },
        onDiscardBasicCatch: () => {
          if (this.mode !== "basic-fishing" || this.modeController.pausesSimulation || this.modeController.blocksWorldInput) return;
          const result = this.sim.execute({ type: "fishing.discard-basic-catch" });
          if (!result.success) this.notify(result.reason ?? "Could not discard the catch", "danger");
          else this.notify("Catch discarded", "info");
        },
        onSellItem: (marketId: MarketId, itemId: string, quantity: number) => {
          const result = this.sim.execute({ type: "market.sell-item", marketId, itemId, quantity });
          if (!result.success) this.notify(result.reason ?? "Could not sell item", "danger");
          else if (result.revenue != null) this.reportSale(quantity, result.revenue);
        },
        onSellAllProduce: (marketId: MarketId) => {
          const result = this.sim.execute({ type: "market.sell-produce-bulk", marketId });
          if (!result.success) this.notify(result.reason ?? "Could not sell produce", "danger");
          else if (result.revenue != null) this.reportSale(result.quantity ?? 0, result.revenue);
        },
        onInspectCommodity: (
          marketId: MarketId,
          itemId: string,
          intent: "buy" | "sell" = "sell",
          quantity = 1
        ) => this.sim.inspectCommodityAtMarket(marketId, itemId, intent, quantity),
        onInspectMarketBoard: (marketId: MarketId) => this.sim.inspectMarketBoard(marketId),
        onInspectMarketDemand: (marketId: MarketId) => this.sim.inspectMarketDemand(marketId),
        onInspectWorldMap: () => this.sim.inspectWorldMap(),
        onInspectFarmForecast: () => this.sim.inspectFarmForecast(),
        onInspectExpeditionBoard: () => this.sim.inspectExpeditionBoard(),
        onInspectHoldStores: () => this.sim.inspectHoldStores(),
        onStowCatch: (boatId, placement) => {
          const result = this.sim.execute({ type: "cargo.stow-aboard", boatId, placement });
          if (!result.success) this.notify(result.reason ?? "Could not stow the catch", "warning");
          this.renderUI();
          return result;
        },
        onMoveStorageGoods: (kind, itemId, quantity, direction) => {
          const result = direction === "deposit"
            ? this.sim.execute({
                type: "storage.deposit-item",
                kind: kind as StorageKind,
                itemId,
                quantity
              })
            : this.sim.execute({
                type: "storage.withdraw-item",
                kind: kind as StorageKind,
                itemId,
                quantity
              });
          if (!result.success) this.notify(result.reason ?? "Could not move those goods", "warning");
          this.renderUI();
          return result;
        },
        onMoveStorageFish: (kind, cargoId, direction) => {
          const result = direction === "store"
            ? this.sim.execute({ type: "storage.store-fish", kind: kind as StorageKind, cargoId })
            : this.sim.execute({ type: "storage.take-fish", kind: kind as StorageKind, cargoId });
          if (!result.success) this.notify(result.reason ?? "Could not move that catch", "warning");
          this.renderUI();
          return result;
        },
        onDropCatch: () => {
          const result = this.sim.execute({ type: "cargo.drop" });
          if (result.success) {
            this.notify("Trade pack set down · collect it with [E] when ready", "success", 2800);
            this.requestAutosave();
          } else {
            this.notify(result.reason ?? "No clear ground here", "warning");
          }
          this.renderUI();
          return result;
        },
        onInspectJournalPages: () => this.sim.inspectJournalPages(),
        onInspectPauseSummary: () => this.sim.inspectPauseSummary(),
        onInspectSkillProgress: () => this.sim.inspectSkillProgress(),
        onInspectCharacter: () => this.sim.inspectCharacterEquipment(),
        onEquipEquipment: (equipmentId: EquipmentId) => {
          const result = this.sim.execute({ type: "equipment.equip", equipmentId });
          if (!result.success) this.notify(result.reason ?? "Could not equip that", "warning");
          else this.requestAutosave();
          return result;
        },
        onEquipCharacterRod: (rodId: RodId) => {
          const result = this.sim.execute({ type: "equipment.equip-rod", rodId });
          if (!result.success) this.notify(result.reason ?? "Could not equip that rod", "warning");
          else this.requestAutosave();
          return result;
        },
        onSaveEquipmentPreset: (presetId: EquipmentPresetId) => {
          const result = this.sim.execute({ type: "equipment.save-preset", presetId });
          if (result.success) this.requestAutosave();
          return result;
        },
        onApplyEquipmentPreset: (presetId: EquipmentPresetId) => {
          const result = this.sim.execute({ type: "equipment.apply-preset", presetId });
          if (!result.success) this.notify(result.reason ?? "Could not wear that outfit", "warning");
          else this.requestAutosave();
          return result;
        },
        craftingStationId: this.activeCraftingStationId,
        onInspectProcessingStation: (stationId: string) => this.sim.inspectProcessingStation(stationId),
        onStartProcessing: (recipeId: RecipeId, stationId: string) =>
          this.startProcessingFromModal(recipeId, stationId),
        ...createMarketUiActions({
          sim: this.sim,
          notify: (text, tone, durationMs) => this.notify(text, tone, durationMs),
          setToast: (text, durationMs) => this.setToast(text, durationMs),
          reportSale: (quantity, revenue) => this.reportSale(quantity, revenue),
          requestAutosave: () => this.requestAutosave()
        }),
        onQuickSave: () => {
          void this.handleQuickSave();
        },
        onResetPlayerToSafePlace: () => {
          this.handleResetPlayerToSafePlace();
        },
        onEmergencyTow: () => {
          const towQuote = this.sim.inspectEmergencyTowQuote();
          const result = this.sim.execute({ type: "boat.emergency-tow" });
          if (result.success) {
            this.restoreGameplayModeFromState();
            const fee = towQuote.cost === 0 ? "no charge" : `${towQuote.cost} G paid`;
            this.notify(
              towQuote.wrecked
                ? `Towed to ${towQuote.destinationLabel} · ${fee} · ${towQuote.travelMinutes} min passed · see Silas for repair`
                : `Towed to ${towQuote.destinationLabel} · ${fee} · ${towQuote.travelMinutes} min passed · catch kept`,
              "success",
              3200
            );
            this.requestAutosave();
          }
          return { success: result.success, reason: result.reason };
        },
        onInspectEmergencyTowQuote: () => this.sim.inspectEmergencyTowQuote(),
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
        onSkipIntro: () => this.openingSkip?.(),
        onIntroFinished: (played: boolean) => this.finishIntro?.(played),
        onStartNewGame: () => this.beginLoading(true, "new-game"),
        onStartWithoutSaving: () => { if (this.saveDecision) this.saveDecision(false); else this.beginLoading(true, "without-saving"); },
        onRetry: this.retryStartup,
        graphicsQuality: this.graphicsQuality.preference,
        effectiveGraphicsQuality: this.graphicsQuality.effectiveTier,
        onGraphicsQualityChange: (preference: GraphicsQualityPreference) => {
          if (this.graphicsQuality.setPreference(preference)) {
            this.worldScene.setQuality(this.graphicsQuality.effectiveTier);
          }
          this.renderUI();
        },
        bootReady: this.bootReady,
        mobileTouchDevice: this.mobileTouchDevice,
        mobileLandscape: this.mobileLandscape,
        mobileOrientationBlocked: this.mobileOrientationBlocked,
        onRequestMobileLandscape: this.requestMobileLandscape,
        onSetVirtualMoveVector: (vector) => {
          this.inputRouter.setVirtualMoveVector(vector);
        },
        onSetVirtualSprint: (held) => this.inputRouter.setVirtualSprint(held),
        onQueueVirtualJump: () => this.inputRouter.queueVirtualJump(),
        onDispatchVirtualAction: (action) => this.inputRouter.dispatchVirtualAction(action),
        onSetVirtualFishingInput: (input) => this.inputRouter.setVirtualFishingInput(input),
        onReleaseBasicFishingCast: () => this.releaseBasicFishingCast(),
        onClearVirtualInput: () => this.inputRouter.clearVirtualInput(),
        screenFade: this.doorTransitionFade,
        // The chip sits dead centre of the top edge, so it is kept out of plain
        // dev playtests. `?place` (or F2, which still works) brings it back.
        layoutEditor: this.layoutEditor && this.layoutEditorChipVisible
          ? {
              ...this.layoutEditor.hudState(),
              onToggle: () => this.setLayoutEditorActive(!this.layoutEditor!.isActive())
            }
          : null
      })
    );
  }

  private renderUiForFrame(nowMs: number): void {
    // The title/loading shell begins its RAF before a Simulation exists. Do
    // not dereference its transient action timeline until the boot commit has
    // installed canonical state; an exception here stops the RAF permanently
    // and leaves later modal/input updates invisible.
    const animationCritical = this.bootReady && (
      this.mode === "sport-fishing"
      || this.mode === "basic-fishing"
      || Boolean(this.laborHud?.active)
      || this.farmingActions.isActive
    );
    const intervalMs = animationCritical ? 1000 / 30 : 100;
    if (nowMs - this.lastUiFrameMs < intervalMs) return;
    this.lastUiFrameMs = nowMs;
    this.renderUI();
  }

  /**
   * Time-to-play evidence: each startup phase mark relative to `begin`.
   * Progressive residency must be designed before this can be more than a
   * measurement, but the numbers are the gate for that design.
   */
  private startupTimingSnapshot(): Array<{ phase: string; atMs: number }> {
    const marks = performance.getEntriesByType("mark") as PerformanceMark[];
    const begin = marks.find((mark) => mark.name === "neva.startup.begin")?.startTime;
    if (begin === undefined) return [];
    return marks
      .filter((mark) => mark.name.startsWith("neva.startup.") && mark.name !== "neva.startup.begin")
      .map((mark) => ({
        phase: mark.name.replace("neva.startup.", ""),
        atMs: Number((mark.startTime - begin).toFixed(1))
      }));
  }

  /** Debug-only main-thread phase rings: stall attribution, not a shipped cost. */
  private recordPhase(phase: string, elapsedMs: number): void {
    if (!this.diagnosticsEnabled) return;
    let entry = this.phaseTimings.get(phase);
    if (!entry) {
      entry = { ring: new Float32Array(120), cursor: 0, count: 0 };
      this.phaseTimings.set(phase, entry);
    }
    entry.ring[entry.cursor] = elapsedMs;
    entry.cursor = (entry.cursor + 1) % entry.ring.length;
    entry.count = Math.min(entry.count + 1, entry.ring.length);
  }

  private phaseTimingSnapshot(): Array<{
    phase: string;
    samples: number;
    p50Ms: number;
    p95Ms: number;
    maxMs: number;
  }> {
    return [...this.phaseTimings.entries()].map(([phase, entry]) => {
      const values = Array.from(entry.ring.slice(0, entry.count)).sort((a, b) => a - b);
      const percentile = (fraction: number): number => values.length === 0
        ? 0
        : values[Math.min(values.length - 1, Math.floor(fraction * values.length))];
      return {
        phase,
        samples: values.length,
        p50Ms: Number(percentile(0.5).toFixed(2)),
        p95Ms: Number(percentile(0.95).toFixed(2)),
        maxMs: Number((values.at(-1) ?? 0).toFixed(2))
      };
    }).sort((left, right) => right.p95Ms - left.p95Ms);
  }

  private recordFrameTiming(elapsedSeconds: number): void {
    const frameMs = elapsedSeconds * 1000;
    this.frameTimeRingMs[this.frameTimeRingCursor] = frameMs;
    this.frameTimeRingCursor = (this.frameTimeRingCursor + 1) % this.frameTimeRingMs.length;
    this.frameTimeRingCount = Math.min(this.frameTimeRingCount + 1, this.frameTimeRingMs.length);
    if (frameMs > 50) this.frameStallCount += 1;
  }

  /** Raw visible-frame percentiles; hidden-tab resumptions are excluded. */
  private frameTimingSnapshot(): {    samples: number;
    p50Ms: number;
    p95Ms: number;
    maxMs: number;
    stallsOver50Ms: number;
  } {
    const values = Array.from(this.frameTimeRingMs.slice(0, this.frameTimeRingCount)).sort((a, b) => a - b);
    const percentile = (fraction: number): number => values.length === 0
      ? 0
      : values[Math.min(values.length - 1, Math.floor(fraction * values.length))];
    return {
      samples: values.length,
      p50Ms: Number(percentile(0.5).toFixed(2)),
      p95Ms: Number(percentile(0.95).toFixed(2)),
      maxMs: Number((values.at(-1) ?? 0).toFixed(2)),
      stallsOver50Ms: this.frameStallCount
    };
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
    this.startupAttempt?.cancel();
    for (const dispose of this.simulationFeedbackDisposers) dispose();
    this.simulationFeedbackDisposers = [];
    // Release the global audio singleton (context, loops, window listeners);
    // otherwise HMR/remounts leave ambience playing and listeners attached.
    gameAudio.dispose();
    this.isRunning = false;
    this.autosaveRequested = false;
    window.__NEVA_RENDER_READY = false;
    this.renderReadyFramesRemaining = 0;
    this.cancelDoorTransition();
    this.mountTransitionAction = null;
    this.mountTransitionRemainingSeconds = 0;
    this.clearFarmGisHold();
    this.inputRouter.setJumpBlocked(false);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("keydown", this.cancelArrivalView);
    window.removeEventListener("pointerdown", this.cancelArrivalView);
    window.removeEventListener("wheel", this.cancelArrivalView);
    window.removeEventListener("orientationchange", this.onResize);
    window.visualViewport?.removeEventListener("resize", this.onResize);
    screen.orientation?.removeEventListener("change", this.onResize);
    window.removeEventListener("keydown", this.onLayoutEditorKeyDown);
    window.removeEventListener("keyup", this.onLayoutEditorKeyUp);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.resizeObserver.disconnect();
    this.inputRouter.dispose();
    this.collisionDebugView?.dispose();
    this.collisionDebugView = null;
    this.questPointer.dispose();
    this.npcBarks.dispose();
    this.marketBoards.dispose();
    this.rewardOverlay.dispose();
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
    if (this.updateMobileViewportState()) {
      this.syncOverlayState();
      this.renderUI();
    }
  };
}
