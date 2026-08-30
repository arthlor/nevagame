// src/render/scene/WorldScene.ts

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CANONICAL_RENDER_CONFIG, type QualityTier } from "../config/VisualRenderConfig";
import {
  selectNearestPracticalLightIndices,
  uniquePracticalLightSourceNames
} from "../lighting/practicalLightBudget";
import { FacetedWater } from "../water/FacetedWater";
import { AssetLoader } from "../loaders/AssetLoader";
import { Simulation } from "../../simulation/Simulation";
import { PaletteMaterials } from "../materials/PaletteMaterials";
import { PALETTE_HEX } from "../materials/PaletteTokens";
import { CultivatedSurfaceMaterial } from "../materials/CultivatedSurfaceMaterial";
import { RoadSurfaceMaterial } from "../materials/RoadSurfaceMaterial";
import {
  isTerrainDebugMode,
  TerrainSurfaceMaterial
} from "../materials/TerrainSurfaceMaterial";
import {
  ASSET_BY_ID,
  ASSET_IDS,
  boatAssetId,
  type AssetId
} from "../assets/AssetCatalog";
import { socketAttachFor } from "../assets/ToolSocketAttach";
import { STATIC_FARM_PROP_ASSETS, STATIC_LANDMARK_ASSETS } from "../assets/RuntimeAssetOwners";
import type { StaticCollisionProxy } from "../../physics/StaticCollision";
import { projectAssetCollision } from "../../physics/CollisionCatalogAdapter";
import type { BasicFishingPhase, FishingEncounterState, GameState } from "../../simulation/core/types";
import type { BoatMotionSample, PlayerMotionSample } from "../../simulation/core/PhysicsAdapter";
import type { CropPlacementResult } from "../../simulation/core/contracts";
import {
  WATER_SURFACE,
  WORLD_ARCHITECTURE_PADS,
  WORLD_LAYOUT_V5,
  WorldLayout
} from "../../world/WorldLayout";
import {
  STARTER_FARM_LAYOUT,
  farmLocalToWorld,
  starterStructureAnchor
} from "../../world/FarmLayout";
import { STARTER_DONKEY_ID } from "../../simulation/mounts/Mounts";
import { HARBOR_FISH_TABLE, HARBOR_SKIFF_MOORING } from "../../world/WorldAnchors";
import { isWithinVegetationCastRange } from "./vegetationShadowRange";
import { getProcessingStationRuntimeRotationY } from "../../world/ProcessingStationApproach";
import {
  ARCHITECTURE_PLACEMENT_TO_PAD,
  LAYOUT_EDIT_USERDATA_KEY,
  createArchitecturePadTag,
  createAuthoredDetailTag,
  createEnvironmentOverrideTag,
  createFarmFenceTag,
  createFarmPropTag,
  createFarmsteadTag,
  createFarmStructureTag,
  createInteriorPropTag,
  createLandmarkTag,
  createNpcTag,
  createWorldAnchorTag,
  readLayoutEditTag,
  type LayoutEditTag
} from "../../layout-editor/layoutEdit";
import {
  FARMHOUSE_INTERIOR_ORIGIN,
  FARMHOUSE_INTERIOR_PROPS
} from "../../world/FarmhouseInterior";
import {
  createWorldEnvironmentLayout,
  type EnvironmentAssetPlacement,
  type WorldEnvironmentLayout
} from "../../world/WorldEnvironmentLayout";
import {
  HumanoidAnimator,
  isPlayerRigObjectName,
  type BoatAnimationInput,
  type CharacterAnimationEvent,
  type PlayerAnimation
} from "../animation/AnimationController";
import {
  stationaryPlayerMotion,
  type PresentedPlayerFrame
} from "../presentation/PlayerPresentationBuffer";
import { resolveMountPresentationPose } from "../presentation/MountPresentation";
import { LightingRig } from "../lighting/LightingRig";
import { RendererPipeline } from "../pipeline/RendererPipeline";
import { ShoreFoam } from "../water/ShoreFoam";

import { BoatWakePool } from "../water/BoatWakePool";
import { CropInstanceRenderer, cropStageAsset } from "./CropInstanceRenderer";
import {
  createContactShadowMesh,
  setContactShadowOpacity,
  type ContactShadowMesh
} from "./ContactShadow";
import { GroundCoverRenderer } from "./GroundCoverRenderer";
import {
  BUTTERFLY_ORBITS,
  CLOUD_PLACEMENTS,
  GULL_ORBITS,
  sampleAmbientCloudPose,
  sampleAmbientFlyerPose,
  type AmbientCloudPlacement,
  type AmbientFlyerOrbit
} from "./ambientFlyers";
import { NPC_STATION_BEATS, sampleNpcStationBeat } from "./npcStationBeat";
import { buildStarterFarmGround } from "./StarterFarmGround";
import { ContentRegistry } from "../../content/ContentRegistry";
import { fishSchoolAsset, fishSpeciesAsset } from "./FishSchoolAssets";



import { FarmVfxPool, type FarmVfxKind, type FarmVfxPoint } from "../effects/FarmVfxPool";
import { RainField } from "../weather/RainField";
import type { WaterConditions } from "../water/WaterSurface";
import {
  createWeatherMotionSignal,
  sampleWeatherMotionSignal,
  type WeatherMotionSignal
} from "../motion/WeatherMotionSignal";
import {
  createSportFishingPresentationSample,
  sampleSportFishingPresentation,
  type SportFishingPresentationSample
} from "../fishing/FishingPresentation";
import { FishingRodBend } from "../fishing/FishingRodBend";

export interface BoatPresentationInput extends BoatAnimationInput {
  boatId: string;
  motion?: BoatMotionSample;
}

interface NpcPresentation {
  id: string;
  assetId: string;
  anchor: { x: number; z: number; rotationY: number };
  model: THREE.Group;
  animator: HumanoidAnimator;
  headBone?: THREE.Object3D;
  initialRotationY: number;
  detailReduced: boolean;
  lastAnimationUpdateSeconds: number;
}

const CHARACTER_DETAIL_DISTANCE_METERS = 14;
// Published farmhouse A local-space chimney socket. The plume is attached
// after static collision and shadow setup so it follows layout edits without
// entering collision or inflating the farmhouse's broad shadow silhouette.
const FARMHOUSE_SMOKE_ATTACHMENT = {
  position: [3.168, 8.76, -0.576] as const,
  rotationY: 0.18,
  scale: 0.65
} as const;
const CHARACTER_DETAIL_NODE_PATTERNS = [
  /finger/,
  /lace/,
  /sole/,
  /buckle/,
  /button/,
  /pocket/,
  /strap/,
  /cuff/,
  /ribbon/,
  /chain/,
  /watch/,
  /holster/,
  /trowel/,
  /quilt/,
  /brim_rib/,
  /neck/,
  /chin/,
  /pack_(flap|pouch|roll)/,
  /vest_lapel/,
  /hair_(lock|fringe|side)/,
  /(?:brow|eye|ear|mouth|nose)(?:_|$)/
] as const;

function isCharacterDetailNode(name: string): boolean {
  return CHARACTER_DETAIL_NODE_PATTERNS.some((pattern) => pattern.test(name));
}

function npcPresentationMotion(overrides: Partial<PlayerMotionSample> = {}): PlayerMotionSample {
  return {
    velocity: { x: 0, y: 0, z: overrides.speedMetersPerSecond ?? 0 },
    speedMetersPerSecond: 0,
    accelerationMetersPerSecondSquared: 0,
    turnRateRadiansPerSecond: 0,
    isGrounded: true,
    groundNormal: { x: 0, y: 1, z: 0 },
    slopeRadians: 0,
    airbornePhase: "grounded",
    contactEvent: "none",
    landingImpactStrength: 0,
    contactSurface: "grass",
    isCollisionBlocked: false,
    requestedGait: "idle",
    ...overrides
  };
}

type FarmingPresentationActionName =
  | "plant"
  | "water"
  | "harvest"
  | "processing-start"
  | "processing-collect"
  | "pickup"
  | "place"
  | "workstation"
  | "cast"
  | "board"
  | "dock";
type FarmingPresentationPhase = "started" | "committed" | "invalidated" | "completed" | "cancelled";

interface StaticLodBatchInstance {
  batch: THREE.BatchedMesh;
  instanceId: number;
  levelIndex: number;
  distances: readonly number[];
  position: THREE.Vector3;
  visible: boolean;
}

interface StaticBatchSource {
  mesh: THREE.Mesh;
  lod?: { levelIndex: number; distances: readonly number[]; position: THREE.Vector3 };
}

interface StaticBatchChunk {
  batch: THREE.BatchedMesh;
  center: THREE.Vector3;
  radius: number;
  visible: boolean;
}

// Large enough to keep batch draw count bounded, small enough for useful
// frustum rejection instead of one map-wide bounding sphere per material.
const STATIC_BATCH_CHUNK_SIZE_METERS = 80;
const STATIC_BATCH_FOG_MARGIN_METERS = 24;

interface PropAttachmentConfig {
  readonly key: string;
  readonly assetId: AssetId;
  readonly socket: string;
  readonly scale: number;
  readonly position?: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number];
}

interface RowboatOarAttachment {
  root: THREE.Object3D;
  originalParent: THREE.Object3D;
  originalPosition: THREE.Vector3;
  originalQuaternion: THREE.Quaternion;
  originalScale: THREE.Vector3;
  handSocketName: "char_player_hand_socket_left" | "char_player_hand_socket_right";
}

interface RowboatPresentationRig {
  boatRoot: THREE.Group;
  rowerSeat: THREE.Object3D;
  oars: readonly RowboatOarAttachment[];
  held: boolean;
}

interface BoatBuoyancyPresentationState {
  waveHeight: number;
  pitch: number;
  roll: number;
  lastSampleTimeSeconds: number;
  initialized: boolean;
}

interface FaunaMotionNode {
  object: THREE.Object3D;
  basePosition: THREE.Vector3;
  baseRotation: THREE.Euler;
}

type FaunaAnimationClip = "idle" | "graze" | "peck" | "look" | "hop";
type FaunaKind = "cow" | "chicken" | "rabbit" | "donkey";

interface FaunaPresentation {
  id: string;
  kind: Exclude<FaunaKind, "donkey">;
  phase: number;
  root: THREE.Group;
  body: FaunaMotionNode;
  head?: FaunaMotionNode;
  tail?: FaunaMotionNode;
  wings: readonly FaunaMotionNode[];
  mixer: THREE.AnimationMixer | null;
  actions: Map<FaunaAnimationClip, THREE.AnimationAction>;
  activeClip: FaunaAnimationClip | null;
  lastMotionUpdateSeconds: number;
}

type DonkeyAnimationClip = "idle" | "graze" | "look" | "walk" | "trot" | "mount" | "dismount";

// char_player_a's rest pelvis origin is 0.626 m above its GLTF root. The
// donkey rider socket is authored at the saddle, so this keeps the pelvis at
// the socket instead of leaving the rider hovering above it.
const DONKEY_RIDER_ROOT_OFFSET_Y = -0.626;

interface DonkeyPresentation {
  id: string;
  placementId: string;
  root: THREE.Group;
  riderSocket: THREE.Object3D;
  mixer: THREE.AnimationMixer | null;
  actions: Map<DonkeyAnimationClip, THREE.AnimationAction>;
  activeClip: DonkeyAnimationClip | null;
  attachedMountId: string | null;
  originalPlayerParent: THREE.Object3D | null;
  transitionUntilSeconds: number;
  lastAnimationUpdateSeconds: number;
}

interface AmbientFlyerPresentation {
  kind: "gull" | "butterfly";
  object: THREE.Group;
  orbit: AmbientFlyerOrbit;
  mixer: THREE.AnimationMixer | null;
  flap: THREE.AnimationAction | null;
  glide: THREE.AnimationAction | null;
  lastAnimationUpdateSeconds: number;
}

type FishAnimationClip = "swim" | "turn" | "burst" | "struggle";

interface FishPresentationMember {
  root: THREE.Group;
  phase: number;
  mixer: THREE.AnimationMixer | null;
  actions: Map<FishAnimationClip, THREE.AnimationAction>;
  activeClip: FishAnimationClip | null;
  tailPivot?: THREE.Object3D;
}

export interface SportFishingCameraHint {
  lookHint: { x: number; y: number; z: number };
  fightReachMeters: number;
  lineTension: number;
  snapTimerSeconds: number;
  fightBehavior: FishingEncounterState["behavior"];
}

function boatBuoyancyFootprint(boatTypeId: string): { halfLength: number; halfBeam: number } {
  return boatTypeId === "boat.skiff"
    ? { halfLength: 2.45, halfBeam: 0.9 }
    : { halfLength: 1.55, halfBeam: 0.62 };
}

/** Presentation-only buoyancy key. Not a persisted BoatId. */
const SKIFF_MOORING_PREVIEW_ID = "preview.harbor-skiff";

const FARMING_PROP_ATTACHMENTS: readonly PropAttachmentConfig[] = [
  { key: "seed", assetId: ASSET_IDS.TOOL_SEED_POUCH_A, socket: "char_player_hip_socket", scale: 0.72 },
  { key: "water", assetId: ASSET_IDS.TOOL_WATERING_CAN_A, socket: "char_player_tool_socket", scale: 0.72 },
  { key: "sickle", assetId: ASSET_IDS.TOOL_SICKLE_A, socket: "char_player_tool_socket", scale: 0.82 },
  { key: "bundle", assetId: ASSET_IDS.PROP_CROP_BUNDLE_A, socket: "char_player_carry_socket", scale: 0.76 },
  { key: "basket", assetId: ASSET_IDS.PROP_HARVEST_BASKET_A, socket: "char_player_carry_socket", scale: 0.68 },
  { key: "scoop", assetId: ASSET_IDS.TOOL_WORKSTATION_SCOOP_A, socket: "char_player_tool_socket", scale: 0.78 },
  { key: "rod", assetId: ASSET_IDS.TOOL_FISHING_ROD_A, socket: "char_player_tool_socket", scale: 0.85 }
] as const;

function createCelestialDiscTexture(size = 64): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = ((x + 0.5) / size) * 2 - 1;
      const dy = ((y + 0.5) / size) * 2 - 1;
      const edgeDistancePixels = (1 - Math.hypot(dx, dy)) * size * 0.5;
      const alpha = THREE.MathUtils.clamp(edgeDistancePixels + 0.5, 0, 1);
      const offset = (y * size + x) * 4;
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = Math.round(alpha * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export class WorldScene {
  private static readonly preparedStartupLayouts = new Map<number, WorldEnvironmentLayout>();
  public scene: THREE.Scene;
  public renderer: THREE.WebGLRenderer;
  public water: FacetedWater;
  public sunLight: THREE.DirectionalLight;
  public hemiLight: THREE.HemisphereLight;
  private readonly lightingRig: LightingRig;
  private readonly rendererPipeline: RendererPipeline;
  private readonly shoreFoam: ShoreFoam;
  private readonly boatWakes: BoatWakePool;
  private readonly farmVfx: FarmVfxPool;
  private readonly rainField: RainField;
  private readonly terrainSurfaceMaterial = new TerrainSurfaceMaterial();
  private readonly roadSurfaceMaterial = new RoadSurfaceMaterial();
  private readonly cultivatedSurfaceMaterial = new CultivatedSurfaceMaterial();

  private playerMesh: THREE.Group | null = null;
  private boatMeshes: Map<string, THREE.Group> = new Map();
  private skiffMooringPreview: THREE.Group | null = null;
  private readonly cropInstances = new CropInstanceRenderer();
  private readonly groundCover = new GroundCoverRenderer(CANONICAL_RENDER_CONFIG.qualityTier);
  private schoolEffects: Map<string, THREE.Group> = new Map();
  private environmentGroup: THREE.Group = new THREE.Group();
  private staticPrefabGroup: THREE.Group = new THREE.Group();
  private playerAnimation: HumanoidAnimator | null = null;
  private readonly farmingProps = new Map<string, THREE.Group>();
  private farmingPropsAttached = false;
  private cosmeticCropCarryUntilSeconds = 0;
  private readonly playerAnimationEvents: CharacterAnimationEvent[] = [];
  private latestPresentedPlayer: PresentedPlayerFrame | null = null;
  private readonly visibilityAnchor = new THREE.Vector3(
    WORLD_LAYOUT_V5.anchors.playerSpawn.x,
    WorldLayout.terrainHeight(
      WORLD_LAYOUT_V5.anchors.playerSpawn.x,
      WORLD_LAYOUT_V5.anchors.playerSpawn.z
    ),
    WORLD_LAYOUT_V5.anchors.playerSpawn.z
  );
  private readonly visibilityLodCamera = new THREE.PerspectiveCamera();
  private lastPresentationTime = 0;
  private prefersReducedMotion: boolean = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  private skyMaterial: THREE.ShaderMaterial | null = null;
  private sunDisc: THREE.Sprite | null = null;
  private moonDisc: THREE.Sprite | null = null;
  private starField: THREE.Points | null = null;
  private readonly practicalLights: Array<{
    light: THREE.PointLight;
    root: THREE.Object3D;
    qualityEnabled: boolean;
  }> = [];
  private readonly practicalLightFocus = new THREE.Vector3();
  private readonly practicalLightWorld = new THREE.Vector3();
  private readonly practicalLightWorldPositions: THREE.Vector3[] = [];
  private readonly waterConditionSnapshot: WaterConditions = {
    seaRoughness: 0,
    windDirectionDeg: 0,
    windSpeed: 0
  };
  private playerContactShadow: ContactShadowMesh | null = null;
  private windmillRotor: THREE.Group | null = null;
  private cloudMeshes: Array<{
    object: THREE.Group;
    placement: AmbientCloudPlacement;
  }> = [];
  private readonly faunaPresentations: FaunaPresentation[] = [];
  private donkeyPresentation: DonkeyPresentation | null = null;
  private readonly ambientFlyers: AmbientFlyerPresentation[] = [];
  private syncInFlight: boolean = false;
  private readonly wakeEmitState = new Map<string, { x: number; z: number; timeSeconds: number }>();
  private readonly rowboatPresentationRigs = new Map<string, RowboatPresentationRig>();
  private readonly boatDriverSeats = new Map<string, THREE.Object3D>();
  private readonly boatBuoyancyState = new Map<string, BoatBuoyancyPresentationState>();
  private latestBoatPresentationInput: BoatPresentationInput | null = null;
  private terrainMesh: THREE.Mesh | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly layoutEditRoots: THREE.Object3D[] = [];
  private layoutEditHelper: THREE.BoxHelper | null = null;
  private layoutEditLockedObject: THREE.Object3D | null = null;
  private qualityTier: QualityTier = CANONICAL_RENDER_CONFIG.qualityTier;
  private readonly placementPreview = new THREE.Group();
  private readonly interactionFeedback = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.52, 24),
    new THREE.MeshBasicMaterial({
      color: PALETTE_HEX.accent_teal_01,
      transparent: true,
      opacity: 0.68,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  );
  private readonly questWaypointRing = new THREE.Mesh(
    new THREE.RingGeometry(0.75, 0.95, 28),
    new THREE.MeshBasicMaterial({
      color: PALETTE_HEX.accent_ochre_01,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  );
  private readyPromise: Promise<void> | null = null;

  private readyWorldSeed: number | null = null;
  private staticCollisionProxyList: StaticCollisionProxy[] = [];
  private readonly staticLodBatchInstances: StaticLodBatchInstance[] = [];
  private readonly staticBatchChunks: StaticBatchChunk[] = [];
  private readonly runtimeLods: THREE.LOD[] = [];
  private runtimeLodsDirty = true;
  private distanceVisibilityDirty = true;
  private readonly lastDistanceVisibilityFocus = new THREE.Vector2(
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY
  );
  private fishingBobberGroup: THREE.Group = new THREE.Group();
  private fishingBobberBody: THREE.Group = new THREE.Group();
  private fishingLineMesh: THREE.Line | null = null;
  private fishingRodBend: FishingRodBend | null = null;
  private readonly fishingMouthLocal = new THREE.Vector3();
  private fishingMouthNode: THREE.Object3D | null = null;
  private readonly fishingEndpointWorld = new THREE.Vector3();
  private lastFishingInstanceId: string | null = null;
  private lastFishingSurfaceCrossings = 0;
  private lastFishingSampleElapsed = 0;
  private fishingBobberRipple: THREE.Mesh | null = null;
  private lastBasicFishingPhase: BasicFishingPhase | null = null;
  private basicCastReleaseAtSeconds = Number.NEGATIVE_INFINITY;
  private basicHookSetAtSeconds = Number.NEGATIVE_INFINITY;
  private readonly sportFishingPresentation: SportFishingPresentationSample =
    createSportFishingPresentationSample();
  private sportFishingCameraHint: SportFishingCameraHint | null = null;
  private lastSportFishingSplashAtSeconds = Number.NEGATIVE_INFINITY;
  private hookedFishModel: THREE.Group | null = null;
  private hookedFishAssetId: AssetId | null = null;
  private hookedFishPresentation: FishPresentationMember | null = null;
  private lastHookedFishUpdateSeconds = 0;
  private readonly tempRodTipVec = new THREE.Vector3();
  private readonly tempBoatSeatVec = new THREE.Vector3();
  private readonly npcPresentations = new Map<string, NpcPresentation>();
  private activeDialogueNpcId: string | null = null;
  private readonly weatherMotion: WeatherMotionSignal = createWeatherMotionSignal();
  private lastAmbientMotionTimeSeconds = 0;
  private lastCloudMotionTimeSeconds = Number.NEGATIVE_INFINITY;
  private playerDetailReduced = false;
  private readonly tempCharacterWorldPosition = new THREE.Vector3();
  private isFarmGisMode: boolean = false;

  public setFarmGisMode(active: boolean): void {
    this.isFarmGisMode = active;
  }

  public getFarmGisMode(): boolean {
    return this.isFarmGisMode;
  }

  constructor(canvas: HTMLCanvasElement) {
    if (import.meta.env.DEV) {
      const requestedTerrainDebug = new URLSearchParams(window.location.search).get("terrainDebug");
      if (isTerrainDebugMode(requestedTerrainDebug)) {
        this.terrainSurfaceMaterial.setDebugMode(requestedTerrainDebug);
      }
    }

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(CANONICAL_RENDER_CONFIG.skyFill.skyColorHex);
    this.scene.fog = new THREE.Fog(
      new THREE.Color(CANONICAL_RENDER_CONFIG.fog.colorHex),
      CANONICAL_RENDER_CONFIG.fog.near,
      CANONICAL_RENDER_CONFIG.fog.far
    );

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance"
    });
    this.renderer.outputColorSpace = CANONICAL_RENDER_CONFIG.outputColorSpace;
    this.renderer.toneMapping = CANONICAL_RENDER_CONFIG.toneMapping;
    this.renderer.toneMappingExposure = CANONICAL_RENDER_CONFIG.exposure;
    this.lightingRig = new LightingRig(this.scene, this.renderer);
    this.rendererPipeline = new RendererPipeline(
      this.renderer,
      this.scene,
      CANONICAL_RENDER_CONFIG.qualityTier
    );
    this.sunLight = this.lightingRig.sun;
    this.hemiLight = this.lightingRig.skyFill;

    // 2. Sky and faceted animated water
    this.buildSky();
    this.water = new FacetedWater(WATER_SURFACE);
    this.scene.add(this.water.mesh);
    this.shoreFoam = new ShoreFoam();
    this.scene.add(this.shoreFoam.mesh);
    this.boatWakes = new BoatWakePool();
    this.scene.add(this.boatWakes.group);
    this.farmVfx = new FarmVfxPool();
    this.scene.add(this.farmVfx.group);
    this.rainField = new RainField(CANONICAL_RENDER_CONFIG.qualityTier);
    this.scene.add(this.rainField.group);

    // 3. Build World Geometry
    this.scene.add(this.environmentGroup);
    this.scene.add(this.cropInstances.group);
    this.environmentGroup.add(this.groundCover.group);
    this.environmentGroup.add(this.staticPrefabGroup);
    this.interactionFeedback.name = "resolved_interaction_feedback";
    this.interactionFeedback.rotation.x = -Math.PI / 2;
    this.interactionFeedback.renderOrder = 3;
    this.interactionFeedback.visible = false;
    this.scene.add(this.interactionFeedback);
    this.questWaypointRing.name = "quest_waypoint_beacon";
    this.questWaypointRing.rotation.x = -Math.PI / 2;
    this.questWaypointRing.renderOrder = 3;
    this.questWaypointRing.visible = false;
    this.scene.add(this.questWaypointRing);
    this.buildPlayerContactShadow();

  }

  private async initializeWorldGeometry(): Promise<void> {
    await Promise.all([
      this.terrainSurfaceMaterial.loadExternalTextures(),
      this.roadSurfaceMaterial.loadExternalTextures()
    ]);
    this.buildWorldTerrain();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    this.buildPlacementPreview();
    this.buildStarterFarmDetails();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    this.buildRouteDetails();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    this.buildFishingPresentation();
  }

  public ready(worldSeed: number): Promise<void> {
    if (this.readyWorldSeed !== null && this.readyWorldSeed !== worldSeed) {
      throw new Error(
        `[WorldScene] Already initialized for world seed ${this.readyWorldSeed}; cannot reinitialize for ${worldSeed}`
      );
    }
    if (!this.readyPromise) {
      this.readyWorldSeed = worldSeed;
      this.readyPromise = (async () => {
        await this.initializeWorldGeometry();
        const layout = WorldScene.preparedStartupLayouts.get(worldSeed)
          ?? createWorldEnvironmentLayout(worldSeed);
        WorldScene.preparedStartupLayouts.delete(worldSeed);
        await this.populateEnvironment(layout);
      })();
    }
    return this.readyPromise;
  }

  /** Assets required by the blocking world boot; progression assets remain lazy. */
  public static startupAssetIds(
    state: Readonly<Pick<GameState, "worldSeed" | "crops" | "boats">>
  ): readonly AssetId[] {
    const worldSeed = state.worldSeed;
    const layout = createWorldEnvironmentLayout(worldSeed);
    this.preparedStartupLayouts.set(worldSeed, layout);
    const assetIds = new Set<AssetId>([
      ...Object.values(STATIC_LANDMARK_ASSETS),
      ...Object.values(STATIC_FARM_PROP_ASSETS),
      ASSET_IDS.CHAR_PLAYER_A,
      ...FARMHOUSE_INTERIOR_PROPS.map((placement) => placement.assetId),
      ...layout.staticPlacements.map((placement) => placement.assetId as AssetId),
      ...layout.groundCoverPlacements.map((placement) => placement.assetId as AssetId),
      ...CLOUD_PLACEMENTS.map((placement) => placement.assetId),
      ASSET_IDS.FAUNA_GULL_A,
      ASSET_IDS.FAUNA_BUTTERFLY_A,
      ...Array.from(ContentRegistry.npcs.values(), (npc) => npc.assetId as AssetId)
    ]);
    for (const crop of Object.values(state.crops)) {
      const assetId = cropStageAsset(crop.cropId, crop.stage);
      if (assetId) assetIds.add(assetId);
    }
    for (const boat of Object.values(state.boats)) assetIds.add(boatAssetId(boat.boatTypeId));
    return [...assetIds];
  }

  private async populateEnvironment(layout: WorldEnvironmentLayout): Promise<void> {
    await Promise.all([
      this.populateStaticPrefabs(layout.staticPlacements),
      this.groundCover.build(layout.groundCoverPlacements)
    ]);
  }

  public staticCollisionProxies(): readonly StaticCollisionProxy[] {
    return this.staticCollisionProxyList;
  }

  /** DEV layout editor: reproject catalog colliders from the current prefab poses. */
  public rebuildStaticCollisionProxies(): readonly StaticCollisionProxy[] {
    this.staticPrefabGroup.updateMatrixWorld(true);
    const roots = this.staticPrefabGroup.children.filter(
      (child) => child.name !== "static_shadow_silhouette_proxy" && Boolean(child.userData.assetId)
    );
    this.staticCollisionProxyList = this.buildStaticCollisionProxies(roots);
    return this.staticCollisionProxyList;
  }

  /**
   * DEV layout editor: after paste / drop / delete, keep colliders, contact
   * grounding, and practical-light budget aligned with live poses.
   */
  public syncLayoutEditPresentation(): readonly StaticCollisionProxy[] {
    this.environmentGroup.updateMatrixWorld(true);
    this.rebuildLayoutGroundingPatches();
    this.applyPracticalLightBudget();
    return this.rebuildStaticCollisionProxies();
  }

  /** DEV layout editor: rebuild contact discs while dragging so they follow the mesh. */
  public followLayoutEditGrounding(): void {
    this.rebuildLayoutGroundingPatches();
  }

  private buildSky(): void {
    const skyGeometry = new THREE.SphereGeometry(650, 28, 14);
    this.skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color(PALETTE_HEX.sky_pale_01) },
        horizonColor: { value: new THREE.Color(PALETTE_HEX.horizon_warm_01) }
      },
      vertexShader: `
        varying vec3 vWorldDirection;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldDirection = normalize(worldPosition.xyz - cameraPosition);
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        varying vec3 vWorldDirection;
        void main() {
          // The gameplay camera looks slightly down, so the visible sky occupies
          // a narrow band around the geometric horizon rather than the dome apex.
          float height = smoothstep(-0.16, 0.10, vWorldDirection.y);
          vec3 color = mix(horizonColor, topColor, height);
          gl_FragColor = vec4(color, 1.0);
        }
      `
    });
    const skyMesh = new THREE.Mesh(skyGeometry, this.skyMaterial);
    skyMesh.name = "world_sky_dome";
    this.scene.add(skyMesh);
    const celestialDiscTexture = createCelestialDiscTexture();
    const sunMaterial = new THREE.SpriteMaterial({
      map: celestialDiscTexture,
      color: PALETTE_HEX.emissive_window_01,
      transparent: true,
      opacity: 0.56,
      depthWrite: false,
      fog: false
    });
    this.sunDisc = new THREE.Sprite(sunMaterial);
    this.sunDisc.scale.set(40, 40, 1);
    this.sunDisc.renderOrder = -1;
    this.scene.add(this.sunDisc);

    const moonMaterial = new THREE.SpriteMaterial({
      map: celestialDiscTexture,
      color: CANONICAL_RENDER_CONFIG.moon.colorHex,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false
    });
    this.moonDisc = new THREE.Sprite(moonMaterial);
    this.moonDisc.scale.setScalar(CANONICAL_RENDER_CONFIG.moon.discSize);
    this.moonDisc.renderOrder = -1;
    this.scene.add(this.moonDisc);

    const starPositions = new Float32Array(CANONICAL_RENDER_CONFIG.stars.count * 3);
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    for (let index = 0; index < CANONICAL_RENDER_CONFIG.stars.count; index++) {
      const height = -0.06 + (index / Math.max(1, CANONICAL_RENDER_CONFIG.stars.count - 1)) * 1.02;
      const radius = Math.sqrt(Math.max(0, 1 - height * height));
      const angle = goldenAngle * index;
      starPositions[index * 3] = Math.cos(angle) * radius * 610;
      starPositions[index * 3 + 1] = height * 610;
      starPositions[index * 3 + 2] = Math.sin(angle) * radius * 610;
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    const starMaterial = new THREE.PointsMaterial({
      color: PALETTE_HEX.sky_pale_01,
      size: CANONICAL_RENDER_CONFIG.stars.size,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false
    });
    this.starField = new THREE.Points(starGeometry, starMaterial);
    this.starField.renderOrder = -2;
    this.scene.add(this.starField);
  }

  private buildPlayerContactShadow(): void {
    if (!this.lightingRig.contactShadowsEnabled()) return;
    this.playerContactShadow = createContactShadowMesh(
      CANONICAL_RENDER_CONFIG.contact.playerRadius,
      CANONICAL_RENDER_CONFIG.contact.playerRadius * 0.68,
      CANONICAL_RENDER_CONFIG.contact.opacity
    );
    this.scene.add(this.playerContactShadow);
  }

  /** Builds the selectively smoothed terrain and its shared physical-road surface. */
  private buildWorldTerrain(): void {
    const layoutGeometry = WorldLayout.buildTerrainGeometry();
    const layoutTerrain = new THREE.Mesh(
      layoutGeometry,
      this.terrainSurfaceMaterial.material
    );
    layoutTerrain.receiveShadow = true;
    layoutTerrain.name = "world_terrain";
    this.terrainMesh = layoutTerrain;
    this.environmentGroup.add(layoutTerrain);

    // High-resolution path ribbon — paints the packed core and shoulder at
    // 17-strip transverse resolution. A narrow alpha-tested polygon edge owns
    // the visible merge; the coarse terrain grid remains a green underlay.
    const pathGeometry = WorldLayout.buildPathGeometry();
    const pathMesh = new THREE.Mesh(pathGeometry, this.roadSurfaceMaterial.material);
    pathMesh.name = "world_path_overlay";
    pathMesh.receiveShadow = true;
    pathMesh.renderOrder = 1;
    this.environmentGroup.add(pathMesh);
  }

  private buildPlacementPreview(): void {
    // 1. Outer perimeter boundary ring (solid rasterized width for crisp anti-aliased edge)
    const outerRingGeometry = new THREE.RingGeometry(0.46, 0.50, 48).rotateX(-Math.PI / 2);
    const outerRing = new THREE.Mesh(
      outerRingGeometry,
      new THREE.MeshBasicMaterial({
        color: PALETTE_HEX.accent_teal_01,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -3
      })
    );
    outerRing.name = "crop_placement_outer_ring";

    // 2. Soft translucent inner clearance footprint fill
    const fillGeometry = new THREE.CircleGeometry(0.46, 48).rotateX(-Math.PI / 2);
    const fill = new THREE.Mesh(
      fillGeometry,
      new THREE.MeshBasicMaterial({
        color: PALETTE_HEX.accent_teal_01,
        transparent: true,
        opacity: 0.07,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2
      })
    );
    fill.name = "crop_placement_fill";

    // 3. Inner concentric accent ring
    const innerRingGeometry = new THREE.RingGeometry(0.21, 0.23, 36).rotateX(-Math.PI / 2);
    const innerRing = new THREE.Mesh(
      innerRingGeometry,
      new THREE.MeshBasicMaterial({
        color: PALETTE_HEX.foam_warm_01,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -3
      })
    );
    innerRing.name = "crop_placement_inner_ring";

    // 4. Subtle cardinal notch ticks on the perimeter ring
    const tickGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.51, 0.006, 0),
      new THREE.Vector3(-0.43, 0.006, 0),
      new THREE.Vector3(0.43, 0.006, 0),
      new THREE.Vector3(0.51, 0.006, 0),
      new THREE.Vector3(0, 0.006, -0.51),
      new THREE.Vector3(0, 0.006, -0.43),
      new THREE.Vector3(0, 0.006, 0.43),
      new THREE.Vector3(0, 0.006, 0.51)
    ]);
    const ticks = new THREE.LineSegments(
      tickGeometry,
      new THREE.LineBasicMaterial({
        color: PALETTE_HEX.foam_warm_01,
        transparent: true,
        opacity: 0.38,
        depthWrite: false
      })
    );
    ticks.name = "crop_placement_ticks";

    // 5. Valid state: Center seed pip / planting reticle
    const seedMarker = new THREE.Group();
    seedMarker.name = "crop_placement_seed_marker";

    const seedPip = new THREE.Mesh(
      new THREE.CircleGeometry(0.035, 16).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: PALETTE_HEX.foam_warm_01,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -4
      })
    );
    seedPip.name = "crop_placement_seed_pip";

    const seedCenterRing = new THREE.Mesh(
      new THREE.RingGeometry(0.065, 0.085, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: PALETTE_HEX.accent_teal_01,
        transparent: true,
        opacity: 0.48,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -4
      })
    );
    seedCenterRing.name = "crop_placement_seed_ring";

    const seedCrosslets = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.11, 0.008, 0),
        new THREE.Vector3(-0.085, 0.008, 0),
        new THREE.Vector3(0.085, 0.008, 0),
        new THREE.Vector3(0.11, 0.008, 0),
        new THREE.Vector3(0, 0.008, -0.11),
        new THREE.Vector3(0, 0.008, -0.085),
        new THREE.Vector3(0, 0.008, 0.085),
        new THREE.Vector3(0, 0.008, 0.11)
      ]),
      new THREE.LineBasicMaterial({
        color: PALETTE_HEX.foam_warm_01,
        transparent: true,
        opacity: 0.42,
        depthWrite: false
      })
    );
    seedCrosslets.name = "crop_placement_seed_crosslets";

    seedMarker.add(seedPip, seedCenterRing, seedCrosslets);

    // 6. Invalid state: Distinct prohibited marker
    const invalidMarker = new THREE.Group();
    invalidMarker.name = "crop_placement_invalid_marker";

    const invalidRing = new THREE.Mesh(
      new THREE.RingGeometry(0.065, 0.085, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: PALETTE_HEX.roof_terracotta_01,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -4
      })
    );
    invalidRing.name = "crop_placement_invalid_ring";

    const invalidCross = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.13, 0.008, -0.13),
        new THREE.Vector3(0.13, 0.008, 0.13),
        new THREE.Vector3(0.13, 0.008, -0.13),
        new THREE.Vector3(-0.13, 0.008, 0.13)
      ]),
      new THREE.LineBasicMaterial({
        color: PALETTE_HEX.roof_terracotta_01,
        transparent: true,
        opacity: 0.45,
        depthWrite: false
      })
    );
    invalidCross.name = "crop_placement_invalid_cross";

    invalidMarker.add(invalidRing, invalidCross);

    this.placementPreview.add(outerRing, fill, innerRing, ticks, seedMarker, invalidMarker);
    this.placementPreview.visible = false;
    this.placementPreview.renderOrder = 4;
    this.scene.add(this.placementPreview);
  }

  public setCropPlacementPreview(result: CropPlacementResult | null): void {
    if (!result) {
      this.placementPreview.visible = false;
      return;
    }
    this.placementPreview.visible = true;
    this.placementPreview.position.set(
      result.worldX,
      WorldLayout.terrainHeight(result.worldX, result.worldZ) + 0.045,
      result.worldZ
    );
    this.placementPreview.rotation.y = 0;
    this.placementPreview.scale.set(
      Math.max(0.05, result.footprint.width),
      1,
      Math.max(0.05, result.footprint.depth)
    );

    const primaryColor = result.valid ? PALETTE_HEX.accent_teal_01 : PALETTE_HEX.roof_terracotta_01;
    const accentColor = result.valid ? PALETTE_HEX.foam_warm_01 : PALETTE_HEX.accent_red_01;

    const outerRing = this.placementPreview.getObjectByName("crop_placement_outer_ring") as THREE.Mesh | undefined;
    const fill = this.placementPreview.getObjectByName("crop_placement_fill") as THREE.Mesh | undefined;
    const innerRing = this.placementPreview.getObjectByName("crop_placement_inner_ring") as THREE.Mesh | undefined;
    const ticks = this.placementPreview.getObjectByName("crop_placement_ticks") as THREE.LineSegments | undefined;
    const seedMarker = this.placementPreview.getObjectByName("crop_placement_seed_marker");
    const invalidMarker = this.placementPreview.getObjectByName("crop_placement_invalid_marker");
    const seedCenterRing = this.placementPreview.getObjectByName("crop_placement_seed_ring") as THREE.Mesh | undefined;

    if (outerRing) {
      const material = outerRing.material as THREE.MeshBasicMaterial;
      material.color.set(primaryColor);
      material.opacity = result.valid ? 0.42 : 0.28;
    }
    if (fill) {
      const material = fill.material as THREE.MeshBasicMaterial;
      material.color.set(primaryColor);
      material.opacity = result.valid ? 0.07 : 0.04;
    }
    if (innerRing) {
      const material = innerRing.material as THREE.MeshBasicMaterial;
      material.color.set(result.valid ? PALETTE_HEX.foam_warm_01 : PALETTE_HEX.roof_terracotta_01);
      material.opacity = result.valid ? 0.22 : 0.16;
    }
    if (ticks) {
      const material = ticks.material as THREE.LineBasicMaterial;
      material.color.set(accentColor);
      material.opacity = result.valid ? 0.38 : 0.22;
    }
    if (seedCenterRing) (seedCenterRing.material as THREE.MeshBasicMaterial).color.set(primaryColor);

    if (seedMarker) seedMarker.visible = result.valid;
    if (invalidMarker) invalidMarker.visible = !result.valid;
  }

  public setInteractionTargetFeedback(position: { x: number; y: number; z: number } | null): void {
    if (!position) {
      this.interactionFeedback.visible = false;
      return;
    }
    this.interactionFeedback.visible = true;
    this.interactionFeedback.position.set(position.x, position.y + 0.055, position.z);
  }

  public setQuestWaypoint(position: { x: number; y: number; z: number } | null): void {
    if (!position) {
      this.questWaypointRing.visible = false;
      return;
    }
    this.questWaypointRing.visible = true;
    this.questWaypointRing.position.set(position.x, position.y + 0.065, position.z);
  }


  public raycastTerrain(
    camera: THREE.Camera,
    pointerNdc: { x: number; y: number }
  ): { x: number; y: number; z: number } | null {
    if (!this.terrainMesh) return null;
    this.raycaster.setFromCamera(new THREE.Vector2(pointerNdc.x, pointerNdc.y), camera);
    const hit = this.raycaster.intersectObject(this.terrainMesh, false)[0];
    return hit ? { x: hit.point.x, y: hit.point.y, z: hit.point.z } : null;
  }

  public pickCrop(camera: THREE.Camera, pointerNdc: { x: number; y: number }): string | null {
    const groundPoint = this.raycastTerrain(camera, pointerNdc);
    return (groundPoint && this.cropInstances.pickByGroundPoint(groundPoint))
      ?? this.cropInstances.pick(camera, pointerNdc);
  }

  public pickLayoutEditable(
    camera: THREE.Camera,
    pointerNdc: { x: number; y: number }
  ): THREE.Object3D | null {
    if (this.layoutEditRoots.length === 0) return null;
    this.raycaster.setFromCamera(new THREE.Vector2(pointerNdc.x, pointerNdc.y), camera);
    const hits = this.raycaster.intersectObjects(this.layoutEditRoots, true);
    for (const hit of hits) {
      let cursor: THREE.Object3D | null = hit.object;
      while (cursor) {
        if (readLayoutEditTag(cursor)) return cursor;
        cursor = cursor.parent;
      }
    }
    return null;
  }

  public highlightLayoutEdit(object: THREE.Object3D | null): void {
    this.layoutEditLockedObject = object;
    if (!this.layoutEditHelper) {
      this.layoutEditHelper = new THREE.BoxHelper(object ?? new THREE.Object3D(), PALETTE_HEX.accent_ochre_01);
      this.layoutEditHelper.name = "layout_edit_helper";
      this.scene.add(this.layoutEditHelper);
    }
    if (!object) {
      this.layoutEditHelper.visible = false;
      return;
    }
    this.layoutEditHelper.visible = true;
    this.layoutEditHelper.setFromObject(object);
  }

  public updateLayoutEditHighlight(): void {
    if (!this.layoutEditHelper?.visible || !this.layoutEditLockedObject) return;
    this.layoutEditHelper.setFromObject(this.layoutEditLockedObject);
  }

  public relocateNpcPresentation(id: string, x: number, z: number, rotationY: number): void {
    const npc = this.npcPresentations.get(id);
    if (!npc) return;
    const y = WorldLayout.terrainHeight(x, z);
    npc.anchor = { x, z, rotationY };
    npc.initialRotationY = rotationY;
    npc.model.position.set(x, y, z);
    npc.model.rotation.y = rotationY;
  }

  public raycastHorizontalPlane(
    camera: THREE.Camera,
    pointerNdc: { x: number; y: number },
    planeY: number
  ): { x: number; y: number; z: number } | null {
    this.raycaster.setFromCamera(new THREE.Vector2(pointerNdc.x, pointerNdc.y), camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(plane, hit)) return null;
    return { x: hit.x, y: planeY, z: hit.z };
  }

  public findLayoutEditable(id: string): THREE.Object3D | null {
    return this.layoutEditRoots.find((object) => readLayoutEditTag(object)?.id === id) ?? null;
  }

  public async duplicateLayoutEditable(
    source: THREE.Object3D | null,
    tag: LayoutEditTag,
    pose: {
      x: number;
      y: number;
      z: number;
      rotationY: number;
      scale?: readonly [number, number, number];
    }
  ): Promise<THREE.Object3D> {
    const assetId = this.resolveLayoutAssetId(source, tag);
    if (!assetId) {
      throw new Error(`[WorldScene] Cannot duplicate ${tag.id} without a catalog assetId`);
    }
    const instance = await AssetLoader.loadModel(assetId);
    instance.position.set(pose.x, pose.y, pose.z);
    if (source) {
      instance.rotation.copy(source.rotation);
    }
    instance.rotation.y = pose.rotationY;
    if (pose.scale) {
      instance.scale.set(pose.scale[0], pose.scale[1], pose.scale[2]);
    } else if (source) {
      instance.scale.copy(source.scale);
    }
    instance.userData.environmentPlacementId = tag.id;
    if (tag.kind === "authored-detail" || tag.kind === "environment-override") {
      instance.userData.environmentPlacementOrigin = "authored";
    }
    this.tagLayoutEdit(instance, tag);
    const parent = this.faunaKindForAsset(assetId) ? this.environmentGroup : this.staticPrefabGroup;
    parent.add(instance);
    this.bindLayoutInstanceFeatures(instance, {
      id: tag.id,
      practicalLightFallback: tag.practicalLight === true
    });
    return instance;
  }

  public removeLayoutEditable(object: THREE.Object3D): void {
    if (this.layoutEditLockedObject === object) this.highlightLayoutEdit(null);
    const index = this.layoutEditRoots.indexOf(object);
    if (index >= 0) this.layoutEditRoots.splice(index, 1);
    this.unbindLayoutInstanceFeatures(object);
    object.removeFromParent();
  }

  private tagLayoutEdit(object: THREE.Object3D, tag: LayoutEditTag): void {
    object.userData[LAYOUT_EDIT_USERDATA_KEY] = tag;
    this.layoutEditRoots.push(object);
  }

  private resolveLayoutAssetId(source: THREE.Object3D | null, tag: LayoutEditTag): AssetId | null {
    const candidates = [source?.userData.assetId, tag.catalogAssetId];
    for (const candidate of candidates) {
      if (typeof candidate !== "string" || candidate.length === 0) continue;
      if (ASSET_BY_ID.has(candidate as AssetId)) return candidate as AssetId;
    }
    return null;
  }

  private faunaKindForAsset(assetId: AssetId): FaunaKind | null {
    if (assetId === ASSET_IDS.FAUNA_COW_A) return "cow";
    if (assetId === ASSET_IDS.FAUNA_CHICKEN_A) return "chicken";
    if (assetId === ASSET_IDS.FAUNA_RABBIT_A) return "rabbit";
    if (assetId === ASSET_IDS.FAUNA_DONKEY_A) return "donkey";
    return null;
  }

  private bindLayoutInstanceFeatures(
    root: THREE.Object3D,
    options: { id: string; practicalLightFallback?: boolean }
  ): void {
    const assetId = root.userData.assetId as AssetId | undefined;
    const faunaKind = assetId ? this.faunaKindForAsset(assetId) : null;
    if (faunaKind && root instanceof THREE.Group) {
      root.userData.dynamicPresentation = true;
      if (faunaKind === "donkey") {
        this.registerDonkeyPresentation(STARTER_DONKEY_ID, options.id, root);
      } else {
        this.registerFaunaPresentation(options.id, faunaKind, root);
      }
    }
    this.attachPracticalLights(root, options.practicalLightFallback === true);
    this.applyStaticShadowPolicy(root);
    if (import.meta.env.DEV) this.applyLayoutEditShadowFollow(root);
  }

  private unbindLayoutInstanceFeatures(root: THREE.Object3D): void {
    for (let index = this.practicalLights.length - 1; index >= 0; index -= 1) {
      const practical = this.practicalLights[index];
      if (!practical || practical.root !== root) continue;
      practical.light.removeFromParent();
      practical.light.dispose();
      this.practicalLights.splice(index, 1);
    }
    const tag = readLayoutEditTag(root);
    const placementId = typeof root.userData.environmentPlacementId === "string"
      ? root.userData.environmentPlacementId
      : tag?.id;
    if (placementId) {
      if (this.donkeyPresentation?.placementId === placementId) {
        this.detachPlayerFromDonkey();
        this.donkeyPresentation.mixer?.stopAllAction();
        if (this.donkeyPresentation.mixer) {
          this.donkeyPresentation.mixer.uncacheRoot(this.donkeyPresentation.root);
        }
        this.disposeDonkeyShadowPresentation(this.donkeyPresentation.root);
        this.donkeyPresentation = null;
      }
      const faunaIndex = this.faunaPresentations.findIndex((fauna) => fauna.id === placementId);
      if (faunaIndex >= 0) {
        const fauna = this.faunaPresentations[faunaIndex];
        if (fauna?.mixer) {
          fauna.mixer.stopAllAction();
          fauna.mixer.uncacheRoot(fauna.mixer.getRoot());
        }
        this.faunaPresentations.splice(faunaIndex, 1);
      }
    }
    this.applyPracticalLightBudget();
  }

  private rebuildLayoutGroundingPatches(): void {
    const existing = this.environmentGroup.getObjectByName("static_contact_grounding");
    if (existing) {
      existing.removeFromParent();
      existing.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        if (Array.isArray(object.material)) {
          for (const material of object.material) material.dispose();
        } else {
          object.material.dispose();
        }
      });
    }
    const patches: Array<{
      x: number;
      z: number;
      radiusX: number;
      radiusZ: number;
      rotation: number;
    }> = [];
    for (const root of this.layoutEditRoots) {
      const tag = readLayoutEditTag(root);
      if (!tag?.grounding) continue;
      const world = root.getWorldPosition(this.practicalLightWorld);
      patches.push({
        x: world.x,
        z: world.z,
        radiusX: tag.grounding[0],
        radiusZ: tag.grounding[1],
        rotation: root.rotation.y
      });
    }
    this.buildStaticGroundingPatches(patches);
  }

  private buildStarterFarmDetails(): void {
    const plantableArea = STARTER_FARM_LAYOUT.plantableAreas[0];
    if (!plantableArea) return;
    this.environmentGroup.add(buildStarterFarmGround({
      origin: STARTER_FARM_LAYOUT.origin,
      plantableArea,
      heightAt: (worldX, worldZ) => WorldLayout.terrainHeight(worldX, worldZ),
      surfaceMaterial: this.cultivatedSurfaceMaterial.material
    }));
  }

  private buildRouteDetails(): void {
    const stoneGeometries: THREE.BufferGeometry[] = [];
    const warmCobble = new THREE.Color(PALETTE_HEX.stone_warm_01);
    const goldenCobble = new THREE.Color(PALETTE_HEX.stone_golden_01);
    const coolStone = new THREE.Color(PALETTE_HEX.stone_cool_01);
    const darkRock = new THREE.Color(PALETTE_HEX.rock_coastal_dark_01);
    const up = new THREE.Vector3(0, 1, 0);

    const appendStone = (
      x: number,
      z: number,
      width: number,
      depth: number,
      height: number,
      color: THREE.Color,
      rotation: number,
      seed: number
    ): void => {
      if (
        WorldLayout.isWater(x, z)
        || WorldLayout.isBridgeDeck(x, z)
        || WorldLayout.pathInfluence(x, z) > 0.2
        || WorldLayout.roadsideInfluence(x, z) < 0.08
      ) return;
      const groundHeight = WorldLayout.terrainHeight(x, z);
      const normal = WorldLayout.terrainNormal(x, z);
      const stone = new THREE.DodecahedronGeometry(0.5, 0);
      stone.scale(width, height, depth);
      const alignQuat = new THREE.Quaternion().setFromUnitVectors(up, normal);
      const yawQuat = new THREE.Quaternion().setFromAxisAngle(normal, rotation);
      stone.applyQuaternion(yawQuat.multiply(alignQuat));
      stone.translate(x, groundHeight + height * 0.45, z);

      const nonIndexed = stone.index ? stone.toNonIndexed() : stone;
      if (nonIndexed !== stone) stone.dispose();
      const count = nonIndexed.getAttribute("position").count;
      const vColors = new Float32Array(count * 3);
      for (let vertex = 0; vertex < count; vertex++) {
        const facetVariation = 0.93 + (Math.sin(seed * 0.71 + vertex * 1.61) * 0.5 + 0.5) * 0.1;
        vColors[vertex * 3] = color.r * facetVariation;
        vColors[vertex * 3 + 1] = color.g * facetVariation;
        vColors[vertex * 3 + 2] = color.b * facetVariation;
      }
      nonIndexed.setAttribute("color", new THREE.BufferAttribute(vColors, 3));
      stoneGeometries.push(nonIndexed);
    };

    // Roadside stones follow the compiled centerline and sit beyond the packed
    // core. Their low-frequency side changes keep the edge authored without
    // introducing a second, drifting path.
    for (const [routeIndex, compiledRoute] of WorldLayout.compiledRouteNetwork().entries()) {
      if (compiledRoute.route.id === "farm-home") continue;
      const spacing = compiledRoute.route.kind === "trail" ? 9 : 11;
      const lateral = compiledRoute.halfWidth + compiledRoute.shoulderWidthMeters + 0.34;
      for (let sampleIndex = 7; sampleIndex < compiledRoute.samples.length - 7; sampleIndex += spacing) {
        const sample = compiledRoute.samples[sampleIndex];
        const side = Math.sin(sample.distanceAlongRoute * 0.23 + routeIndex * 2.17) >= 0 ? 1 : -1;
        const x = sample.point.x + sample.normal.x * side * lateral;
        const z = sample.point.z + sample.normal.z * side * lateral;
        const baseColor = compiledRoute.route.id === "cliffside-coastal-walk" || compiledRoute.route.id === "village-harbor"
          ? (sampleIndex % 2 === 0 ? coolStone : darkRock)
          : (sampleIndex % 2 === 0 ? warmCobble : goldenCobble);
        appendStone(
          x,
          z,
          0.3 + (sampleIndex % 3) * 0.045,
          0.25 + (sampleIndex % 4) * 0.035,
          0.055 + (sampleIndex % 3) * 0.012,
          baseColor,
          Math.atan2(sample.tangent.x, sample.tangent.z) + side * 0.24,
          sampleIndex + routeIndex * 37
        );
      }
    }

    // A few broader apron-edge stones make the intentional junctions
    // read as places where traffic has worn the meadow back, not as circular
    // decals stamped on top of it.
    for (const [junctionIndex, junction] of WorldLayout.routeJunctions().entries()) {
      const stoneCount = junction.surface === "village-market"
        ? 8
        : junction.surface === "landmark-gateway" ? 4 : 5;
      const edgeRadius = junction.radiusMeters + junction.blendLengthMeters * 0.86;
      for (let index = 0; index < stoneCount; index++) {
        const angle = index * 2.399963 + junctionIndex * 0.83;
        const radius = edgeRadius + Math.sin(index * 1.71 + junctionIndex) * 0.22;
        appendStone(
          junction.center.x + Math.cos(angle) * radius,
          junction.center.z + Math.sin(angle) * radius,
          0.32 + (index % 3) * 0.055,
          0.28 + (index % 2) * 0.06,
          0.06 + (index % 3) * 0.012,
          index % 2 === 0 ? warmCobble : goldenCobble,
          angle + 0.4,
          index + junctionIndex * 41
        );
      }
    }

    const mergedStones = mergeGeometries(stoneGeometries, false);
    for (const geometry of stoneGeometries) geometry.dispose();
    if (!mergedStones) return;

    const stoneAccents = new THREE.Mesh(
      mergedStones,
      PaletteMaterials.standard("stone_warm_01", {
        vertexColors: true,
        vertexColorMode: "replace",
        roughness: 0.94,
        flatShading: true
      })
    );
    stoneAccents.name = "farm_harbor_path_accents";
    stoneAccents.receiveShadow = true;
    this.environmentGroup.add(stoneAccents);
  }

  private buildStaticGroundingPatches(
    placements: ReadonlyArray<{ x: number; z: number; radiusX: number; radiusZ: number; rotation: number }>
  ): void {
    const geometries: THREE.BufferGeometry[] = [];
    const up = new THREE.Vector3(0, 1, 0);
    for (const [index, placement] of placements.entries()) {
      const geometry = new THREE.CircleGeometry(1, 14);
      geometry.rotateX(-Math.PI / 2);
      const position = geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let vertex = 1; vertex < position.count; vertex++) {
        const radial = 0.92 + (Math.sin(vertex * 2.21 + index * 1.37) * 0.5 + 0.5) * 0.16;
        position.setX(vertex, position.getX(vertex) * radial);
        position.setZ(vertex, position.getZ(vertex) * radial);
      }
      const normal = WorldLayout.terrainNormal(placement.x, placement.z);
      const orientation = new THREE.Quaternion().setFromUnitVectors(up, normal);
      const transform = new THREE.Matrix4().compose(
        new THREE.Vector3(
          placement.x,
          WorldLayout.terrainHeight(placement.x, placement.z) + 0.024,
          placement.z
        ),
        orientation.multiply(new THREE.Quaternion().setFromAxisAngle(up, placement.rotation)),
        new THREE.Vector3(placement.radiusX, 1, placement.radiusZ)
      );
      geometry.applyMatrix4(transform);
      geometries.push(geometry);
    }
    const merged = mergeGeometries(geometries, false);
    for (const geometry of geometries) geometry.dispose();
    if (!merged) return;
    const mesh = new THREE.Mesh(
      merged,
      new THREE.MeshBasicMaterial({
        color: PALETTE_HEX.foliage_shadow_01,
        transparent: true,
        opacity: Math.min(0.11, CANONICAL_RENDER_CONFIG.contact.opacity * 0.55),
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1
      })
    );
    mesh.name = "static_contact_grounding";
    mesh.renderOrder = 1;
    mesh.frustumCulled = true;
    this.environmentGroup.add(mesh);
  }

  private placeLandmark(object: THREE.Object3D, id: Parameters<typeof WorldLayout.landmark>[0]): void {
    const layout = WorldLayout.landmark(id);
    object.position.set(
      layout.x,
      WorldLayout.terrainHeight(layout.x, layout.z) + layout.yOffset,
      layout.z
    );
    object.rotation.y = layout.rotationY;
    object.scale.setScalar(layout.scale);
  }

  private setShadowPolicy(root: THREE.Object3D, castShadow: boolean): void {
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (object.name === "character_shadow_proxy") return;
      object.castShadow = castShadow;
      object.receiveShadow = true;
    });
  }

  private attachCharacterShadowProxy(root: THREE.Object3D): void {
    if (root.getObjectByName("character_shadow_proxy")) return;
    root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(root);
    const measuredHeight = bounds.max.y - bounds.min.y;
    const height = Number.isFinite(measuredHeight) && measuredHeight > 0.8 ? measuredHeight : 1.96;
    const radius = 0.28;
    const cylinderHeight = Math.max(0.24, height - radius * 2);
    const geometry = new THREE.CapsuleGeometry(radius, cylinderHeight, 2, 8);
    const material = new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: false
    });
    const proxy = new THREE.Mesh(geometry, material);
    proxy.name = "character_shadow_proxy";
    proxy.castShadow = true;
    proxy.receiveShadow = false;
    proxy.position.y = height * 0.5;
    proxy.frustumCulled = true;
    root.add(proxy);
  }

  private attachPracticalLights(root: THREE.Object3D, fallbackIfMissing = false): void {
    root.updateMatrixWorld(true);
    const names: string[] = [];
    root.traverse((object) => {
      names.push(object.name);
    });
    const sourceNames = uniquePracticalLightSourceNames(names);
    if (sourceNames.length > 0) {
      for (const name of sourceNames) {
        this.registerPracticalLight(root, root.getObjectByName(name) ?? undefined);
      }
      return;
    }
    if (fallbackIfMissing) this.registerPracticalLight(root);
  }

  private registerPracticalLight(root: THREE.Object3D, source?: THREE.Object3D): void {
    const recipe = CANONICAL_RENDER_CONFIG.practicalLights;
    const light = new THREE.PointLight(recipe.colorHex, 0, recipe.localDistance, recipe.decay);
    light.name = "layout_practical_light";
    light.castShadow = false;
    root.updateMatrixWorld(true);
    if (import.meta.env.DEV) {
      if (source) {
        light.position.set(0, 0, 0);
        source.add(light);
      } else {
        const box = new THREE.Box3().setFromObject(root);
        const center = box.getCenter(this.practicalLightWorld);
        const worldY = box.max.y * 0.85 + box.min.y * 0.15;
        light.position.copy(root.worldToLocal(new THREE.Vector3(center.x, worldY, center.z)));
        root.add(light);
      }
    } else if (source) {
      light.position.copy(source.getWorldPosition(this.practicalLightWorld));
      this.scene.add(light);
    } else {
      const box = new THREE.Box3().setFromObject(root);
      const center = box.getCenter(this.practicalLightWorld);
      light.position.set(center.x, box.max.y * 0.85 + box.min.y * 0.15, center.z);
      this.scene.add(light);
    }
    this.practicalLights.push({ light, root, qualityEnabled: true });
    this.applyPracticalLightBudget();
  }

  private applyPracticalLightBudget(): void {
    const budget = CANONICAL_RENDER_CONFIG.quality[this.qualityTier].practicalLightBudget;
    while (this.practicalLightWorldPositions.length < this.practicalLights.length) {
      this.practicalLightWorldPositions.push(new THREE.Vector3());
    }
    const positions = this.practicalLights.map((practical, index) =>
      practical.light.getWorldPosition(this.practicalLightWorldPositions[index]!)
    );
    const enabled = new Set(
      selectNearestPracticalLightIndices(positions, this.practicalLightFocus, budget)
    );
    this.practicalLights.forEach((practical, index) => {
      practical.qualityEnabled = enabled.has(index);
    });
  }

  private configureWindmillRotor(windmill: THREE.Group): void {
    windmill.updateMatrixWorld(true);
    const hub = windmill.getObjectByName("windmill_hub");
    if (!hub) return;
    const pivot = new THREE.Group();
    pivot.name = "windmill_runtime_rotor";
    pivot.position.copy(windmill.worldToLocal(hub.getWorldPosition(new THREE.Vector3())));
    windmill.add(pivot);
    pivot.updateMatrixWorld(true);
    const movingParts: THREE.Object3D[] = [];
    windmill.traverse((object) => {
      if (
        object !== pivot &&
        (object.name === "windmill_hub" ||
          object.name.startsWith("windmill_spar_") ||
          object.name.startsWith("windmill_sail_"))
      ) {
        movingParts.push(object);
      }
    });
    for (const part of movingParts) pivot.attach(part);
    this.windmillRotor = pivot;
  }

  /**
   * Places prefabs (Farmhouse, Stone Bridge, Dock, Trees, Rocks, Props)
   */
  private async populateStaticPrefabs(
    environmentPlacements: readonly EnvironmentAssetPlacement[]
  ): Promise<void> {
    const preexistingEnvironmentChildren = new Set(this.environmentGroup.children);
    // 1. Farmhouse at starter homestead
    const farmhouse = await AssetLoader.loadModel(STATIC_LANDMARK_ASSETS.farmhouse);
    this.placeLandmark(farmhouse, "farmhouse");
    this.tagLayoutEdit(farmhouse, createFarmsteadTag("farmhouse"));
    this.environmentGroup.add(farmhouse);
    this.attachPracticalLights(farmhouse);

    const well = await AssetLoader.loadModel(STATIC_LANDMARK_ASSETS.well);
    this.placeLandmark(well, "well");
    this.tagLayoutEdit(well, createFarmsteadTag("well"));
    this.environmentGroup.add(well);

    // 2. Stone Bridge crossing river
    const bridge = await AssetLoader.loadModel(STATIC_LANDMARK_ASSETS.bridge);
    this.placeLandmark(bridge, "bridge");
    this.tagLayoutEdit(bridge, createLandmarkTag("bridge", WorldLayout.landmark("bridge").yOffset));
    this.environmentGroup.add(bridge);
    this.attachPracticalLights(bridge);

    // 3. Harbor Dock extending into water
    const dock = await AssetLoader.loadModel(STATIC_LANDMARK_ASSETS.dock);
    this.placeLandmark(dock, "dock");
    this.tagLayoutEdit(dock, createLandmarkTag("dock", WorldLayout.landmark("dock").yOffset));
    this.environmentGroup.add(dock);
    this.attachPracticalLights(dock);

    const fishMarket = await AssetLoader.loadModel(STATIC_LANDMARK_ASSETS.fishMarket);
    this.placeLandmark(fishMarket, "fish-market");
    this.tagLayoutEdit(fishMarket, createLandmarkTag("fish-market", 0));
    this.environmentGroup.add(fishMarket);
    this.attachPracticalLights(fishMarket);

    // Distant working landmarks establish the same farm-to-coast depth hierarchy
    // as the reference without copying its exact diorama layout.
    const lighthouse = await AssetLoader.loadModel(STATIC_LANDMARK_ASSETS.lighthouse);
    this.placeLandmark(lighthouse, "lighthouse");
    this.tagLayoutEdit(lighthouse, createLandmarkTag("lighthouse", 0));
    this.environmentGroup.add(lighthouse);
    this.attachPracticalLights(lighthouse);

    const windmill = await AssetLoader.loadModel(STATIC_LANDMARK_ASSETS.windmill);
    this.placeLandmark(windmill, "windmill");
    this.tagLayoutEdit(windmill, createFarmStructureTag("struct.starter_mill"));
    this.environmentGroup.add(windmill);
    this.configureWindmillRotor(windmill);
    this.attachPracticalLights(windmill);

    const workbenchAnchor = starterStructureAnchor("struct.workbench")!;
    const workbench = await AssetLoader.loadModel(STATIC_LANDMARK_ASSETS.workbench);
    workbench.position.set(
      workbenchAnchor.x,
      WorldLayout.terrainHeight(workbenchAnchor.x, workbenchAnchor.z),
      workbenchAnchor.z
    );
    workbench.rotation.y = getProcessingStationRuntimeRotationY("struct.workbench");
    this.environmentGroup.add(workbench);
    this.tagLayoutEdit(workbench, createFarmStructureTag("struct.workbench"));

    const compostAnchor = starterStructureAnchor("struct.starter_compost")!;
    const compost = await AssetLoader.loadModel(STATIC_LANDMARK_ASSETS.compost);
    compost.position.set(
      compostAnchor.x,
      WorldLayout.terrainHeight(compostAnchor.x, compostAnchor.z),
      compostAnchor.z
    );
    compost.rotation.y = getProcessingStationRuntimeRotationY("struct.starter_compost");
    this.environmentGroup.add(compost);
    this.tagLayoutEdit(compost, createFarmStructureTag("struct.starter_compost"));

    const fishTable = await AssetLoader.loadModel(STATIC_LANDMARK_ASSETS.fishTable);
    fishTable.position.set(
      HARBOR_FISH_TABLE.position.x,
      WorldLayout.terrainHeight(HARBOR_FISH_TABLE.position.x, HARBOR_FISH_TABLE.position.z),
      HARBOR_FISH_TABLE.position.z
    );
    fishTable.rotation.y = getProcessingStationRuntimeRotationY(HARBOR_FISH_TABLE.structureId);
    this.environmentGroup.add(fishTable);
    this.tagLayoutEdit(
      fishTable,
      createWorldAnchorTag("struct.harbor_fish_table", "processing-station")
    );

    const produceStall = await AssetLoader.loadModel(STATIC_LANDMARK_ASSETS.produceStall);
    this.placeLandmark(produceStall, "produce-stall");
    this.tagLayoutEdit(produceStall, createLandmarkTag("produce-stall", 0));
    this.environmentGroup.add(produceStall);

    const farmPropAssets = STATIC_FARM_PROP_ASSETS;
    for (const anchor of STARTER_FARM_LAYOUT.propAnchors) {
      const object = await AssetLoader.loadModel(farmPropAssets[anchor.type]);
      const world = farmLocalToWorld(STARTER_FARM_LAYOUT.farmId, anchor);
      object.position.set(world.x, WorldLayout.terrainHeight(world.x, world.z), world.z);
      object.rotation.y = anchor.rotationY;
      object.scale.setScalar(anchor.scale);
      this.tagLayoutEdit(object, createFarmPropTag(anchor.id, farmPropAssets[anchor.type], {
        propType: anchor.type,
        practicalLight: anchor.type === "lamp-post"
      }));
      this.environmentGroup.add(object);
      this.bindLayoutInstanceFeatures(object, {
        id: anchor.id,
        practicalLightFallback: anchor.type === "lamp-post"
      });
    }

    // 4. Farmhouse Cozy Interior
    const interiorShell = await AssetLoader.loadModel(STATIC_LANDMARK_ASSETS.interiorShell);
    interiorShell.position.set(
      FARMHOUSE_INTERIOR_ORIGIN.x,
      FARMHOUSE_INTERIOR_ORIGIN.y,
      FARMHOUSE_INTERIOR_ORIGIN.z
    );
    interiorShell.rotation.y = 0;
    this.environmentGroup.add(interiorShell);

    for (const propPlacement of FARMHOUSE_INTERIOR_PROPS) {
      const propModel = await AssetLoader.loadModel(propPlacement.assetId);
      propModel.position.set(propPlacement.x, propPlacement.y, propPlacement.z);
      propModel.rotation.y = propPlacement.rotationY;
      if (propPlacement.scale) propModel.scale.setScalar(propPlacement.scale);
      this.tagLayoutEdit(propModel, createInteriorPropTag(propPlacement.id, propPlacement.assetId));
      this.environmentGroup.add(propModel);
      this.bindLayoutInstanceFeatures(propModel, { id: propPlacement.id });
    }

    let placementIndex = 0;
    for (const placement of environmentPlacements) {
      const assetId = placement.assetId as AssetId;
      const spec = ASSET_BY_ID.get(assetId);
      if (!spec) {
        throw new Error(
          `[WorldScene] Unknown environment asset ${placement.assetId} for placement ${placement.id}`
        );
      }
      if (placement.origin === "seeded-fill" && spec.collision !== "none") {
        throw new Error(
          `[WorldScene] Seeded-fill placement ${placement.id} cannot use colliding asset ${placement.assetId}`
        );
      }
      const object = await AssetLoader.loadModel(assetId);
      object.position.set(placement.x, placement.y ?? WorldLayout.terrainHeight(placement.x, placement.z), placement.z);
      object.rotation.y = placement.rotationY;
      object.scale.set(placement.scale[0], placement.scale[1], placement.scale[2]);
      object.userData.environmentPlacementId = placement.id;
      object.userData.environmentPlacementOrigin = placement.origin;
      const padId = ARCHITECTURE_PLACEMENT_TO_PAD[placement.id];
      if (padId) {
        const pad = WORLD_ARCHITECTURE_PADS.find((candidate) => candidate.id === padId);
        this.tagLayoutEdit(object, {
          ...createArchitecturePadTag(padId),
          catalogAssetId: placement.assetId,
          grounding: pad?.envelope
        });
      } else if (placement.origin === "authored") {
        this.tagLayoutEdit(object, createAuthoredDetailTag(placement.id, placement.assetId, {
          grounding: placement.grounding,
          practicalLight: placement.practicalLight,
          fixedY: placement.y
        }));
      } else {
        this.tagLayoutEdit(object, createEnvironmentOverrideTag(placement.id, placement.assetId, {
          grounding: placement.grounding,
          practicalLight: placement.practicalLight
        }));
      }
      this.environmentGroup.add(object);
      this.bindLayoutInstanceFeatures(object, {
        id: placement.id,
        practicalLightFallback: placement.practicalLight === true
      });
      placementIndex += 1;
      if (placementIndex % 80 === 0) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
    }
    this.rebuildLayoutGroundingPatches();

    for (const placement of CLOUD_PLACEMENTS) {
      const cloud = await AssetLoader.loadModel(placement.assetId);
      cloud.position.set(placement.x, placement.y, placement.z);
      cloud.rotation.y = placement.rotationY;
      cloud.scale.setScalar(placement.scale);
      cloud.userData.dynamicPresentation = true;
      this.setShadowPolicy(cloud, false);
      this.environmentGroup.add(cloud);
      this.cloudMeshes.push({
        object: cloud,
        placement
      });
    }

    await this.loadAmbientFlyers();

    // 7. Fences framing the 8 x 8 planting area with authored entrances.
    for (const anchor of STARTER_FARM_LAYOUT.fenceAnchors) {
      const fence = await AssetLoader.loadModel(STATIC_LANDMARK_ASSETS.fence);
      const world = farmLocalToWorld(STARTER_FARM_LAYOUT.farmId, anchor);
      const height = this.sampleTerrainHeight(world.x, world.z) ?? 0.8;
      fence.position.set(world.x, height, world.z);
      fence.rotation.y = anchor.rotationY;
      this.tagLayoutEdit(fence, createFarmFenceTag(anchor.id, STATIC_LANDMARK_ASSETS.fence));
      this.environmentGroup.add(fence);
    }

    const spawnedRoots = [...this.environmentGroup.children].filter(
      (child) => child !== this.staticPrefabGroup && !preexistingEnvironmentChildren.has(child)
    );
    const staticAssetRoots = spawnedRoots.filter((child) => !child.userData.dynamicPresentation);
    this.staticCollisionProxyList = this.buildStaticCollisionProxies(staticAssetRoots);
    for (const root of spawnedRoots) this.applyStaticShadowPolicy(root);
    if (import.meta.env.DEV) {
      for (const root of spawnedRoots) this.applyLayoutEditShadowFollow(root);
    }
    if (this.windmillRotor) this.batchCompatibleMeshes(this.windmillRotor, () => false);

    for (const child of staticAssetRoots) {
      this.environmentGroup.remove(child);
      this.staticPrefabGroup.add(child);
    }
    // Mesh merge pulls visible geometry into BatchedMesh siblings and then
    // strips LOD children, leaving layout-edit tags on empty groups. DEV
    // keeps live meshes so F2 picking/dragging can hit the object you see.
    if (!import.meta.env.DEV) {
      this.mergeStaticPrefabMeshes();
      const staticShadowProxy = this.buildStaticShadowProxy(staticAssetRoots);
      if (staticShadowProxy) this.staticPrefabGroup.add(staticShadowProxy);
    }

    const farmhouseSmoke = await AssetLoader.loadModel(STATIC_LANDMARK_ASSETS.farmhouseSmoke);
    farmhouseSmoke.name = "farmhouse_chimney_smoke";
    farmhouseSmoke.position.set(...FARMHOUSE_SMOKE_ATTACHMENT.position);
    farmhouseSmoke.rotation.y = FARMHOUSE_SMOKE_ATTACHMENT.rotationY;
    farmhouseSmoke.scale.setScalar(FARMHOUSE_SMOKE_ATTACHMENT.scale);
    this.setShadowPolicy(farmhouseSmoke, false);
    farmhouse.add(farmhouseSmoke);
    if (!import.meta.env.DEV) this.detachEmptyStaticSourceRoots(staticAssetRoots);

    await this.loadNpcPresentations();
    this.runtimeLodsDirty = true;
    this.distanceVisibilityDirty = true;
  }

  private detachEmptyStaticSourceRoots(assetRoots: readonly THREE.Object3D[]): void {
    for (const root of assetRoots) {
      let hasRenderable = false;
      root.traverse((object) => {
        if (
          object instanceof THREE.Mesh
          || object instanceof THREE.BatchedMesh
          || object instanceof THREE.Sprite
          || object instanceof THREE.Light
        ) hasRenderable = true;
      });
      if (!hasRenderable) root.removeFromParent();
    }
  }

  private async loadNpcPresentations(): Promise<void> {
    const npcs = Array.from(ContentRegistry.npcs.values());
    for (const npc of npcs) {
      try {
        const assetId = npc.assetId as AssetId;
        const model = await AssetLoader.loadModel(assetId);
        const y = WorldLayout.terrainHeight(npc.anchor.x, npc.anchor.z);
        model.position.set(npc.anchor.x, y, npc.anchor.z);
        model.rotation.y = npc.anchor.rotationY;
        model.userData.dynamicPresentation = true;
        this.tagLayoutEdit(model, createNpcTag(npc.id));
        // NPCs use the authored contact disc below for grounding. Keeping the
        // full articulated rig out of the sun-shadow pass prevents each body
        // facet from becoming a separate shadow draw while preserving the
        // readable feet-to-ground cue in gameplay cameras.
        this.setShadowPolicy(model, false);
        this.attachCharacterShadowProxy(model);

        // Ground contact shadow disc
        if (this.lightingRig.contactShadowsEnabled()) {
          const shadowMesh = createContactShadowMesh(0.48, 0.33, CANONICAL_RENDER_CONFIG.contact.opacity);
          shadowMesh.position.set(0, 0.02, 0);
          model.add(shadowMesh);
        }

        const animator = new HumanoidAnimator(model);
        const headBone = model.getObjectByName("rig_head") ?? undefined;
        this.environmentGroup.add(model);
        this.npcPresentations.set(npc.id, {
          id: npc.id,
          assetId,
          anchor: npc.anchor,
          model,
          animator,
          headBone,
          initialRotationY: npc.anchor.rotationY,
          detailReduced: false,
          lastAnimationUpdateSeconds: 0
        });
      } catch (err) {
        console.warn(`[WorldScene] Failed to load NPC ${npc.id} (${npc.assetId}):`, err);
      }
    }
  }

  public setDialogueNpc(npcId: string | null): void {
    this.activeDialogueNpcId = npcId;
  }


  /**
   * Broad architecture/tree silhouettes need one soft sun shadow, not another
   * pass over every visible trim and facet. The proxy is presentation-only and
   * derives entirely from catalog bounds plus the authoritative placements.
   */
  private buildStaticShadowProxy(assetRoots: readonly THREE.Object3D[]): THREE.Mesh | null {
    this.environmentGroup.updateMatrixWorld(true);
    const geometries: THREE.BufferGeometry[] = [];
    const addGeometry = (
      geometry: THREE.BufferGeometry,
      position: THREE.Vector3,
      scale: THREE.Vector3
    ) => {
      const local = new THREE.Matrix4().compose(position, new THREE.Quaternion(), scale);
      geometry.applyMatrix4(local);
      geometries.push(geometry);
    };

    for (const root of assetRoots) {
      const assetId = root.userData.assetId as AssetId | undefined;
      const spec = assetId ? ASSET_BY_ID.get(assetId) : undefined;
      if (!spec || (spec.family !== "architecture" && spec.family !== "vegetation")) continue;
      let castsShadow = false;
      root.traverseVisible((object) => {
        if (object instanceof THREE.Mesh && object.castShadow) castsShadow = true;
      });
      if (!castsShadow) continue;

      const bounds = new THREE.Box3().setFromObject(root);
      if (bounds.isEmpty()) continue;
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      if (spec.family === "architecture") {
        addGeometry(
          new THREE.BoxGeometry(1, 1, 1),
          center,
          new THREE.Vector3(size.x * 0.86, size.y * 0.9, size.z * 0.86)
        );
      } else if (assetId?.startsWith("tree_pine")) {
        addGeometry(
          new THREE.ConeGeometry(0.5, 1, 7, 2),
          center,
          new THREE.Vector3(size.x * 0.9, size.y * 0.9, size.z * 0.9)
        );
      } else {
        addGeometry(
          new THREE.SphereGeometry(0.5, 6, 4),
          new THREE.Vector3(center.x, bounds.min.y + size.y * 0.68, center.z),
          new THREE.Vector3(size.x * 0.94, size.y * 0.54, size.z * 0.94)
        );
        addGeometry(
          new THREE.CylinderGeometry(0.58, 0.72, 1, 5),
          new THREE.Vector3(center.x, bounds.min.y + size.y * 0.28, center.z),
          new THREE.Vector3(size.x * 0.16, size.y * 0.56, size.z * 0.16)
        );
      }
    }

    if (geometries.length === 0) return null;
    const merged = mergeGeometries(geometries, false);
    if (!merged) {
      for (const geometry of geometries) geometry.dispose();
      throw new Error("[WorldScene] Could not merge static shadow proxy geometry");
    }
    for (const geometry of geometries) geometry.dispose();
    const material = new THREE.MeshBasicMaterial({
      color: 0x000000,
      colorWrite: false,
      depthWrite: false,
      toneMapped: false
    });
    const proxy = new THREE.Mesh(merged, material);
    proxy.name = "static_shadow_silhouette_proxy";
    proxy.castShadow = true;
    proxy.receiveShadow = false;
    proxy.frustumCulled = false;
    return proxy;
  }

  private applyStaticShadowPolicy(root: THREE.Object3D): void {
    const assetId = root.userData.assetId as AssetId | undefined;
    const spec = assetId ? ASSET_BY_ID.get(assetId) : undefined;
    if (!spec) return;
    if (assetId === ASSET_IDS.FAUNA_DONKEY_A) {
      // Catalog family stays "prop" for the mount contract, but the ridden
      // donkey needs a character-scale sun silhouette instead of small-prop skip.
      this.setShadowPolicy(root, false);
      this.attachCharacterShadowProxy(root);
      return;
    }
    const isMinorFoliage = assetId === ASSET_IDS.FOLIAGE_BUSH_A || assetId === ASSET_IDS.FOLIAGE_REEDS_A;
    const withinVegetationShadowRange = isWithinVegetationCastRange(
      root.position.x,
      root.position.z,
      this.visibilityAnchor.x,
      this.visibilityAnchor.z
    );
    const castShadow = spec.family === "prop"
      ? CANONICAL_RENDER_CONFIG.shadows.castSmallProps
      : spec.family === "rock"
        ? CANONICAL_RENDER_CONFIG.shadows.castRocks
        : spec.family === "vegetation"
          ? !isMinorFoliage && withinVegetationShadowRange
        : spec.family === "cloud" || isMinorFoliage
          ? false
          : true;
    this.setShadowPolicy(root, castShadow);
  }

  /** DEV layout editor: colliding props self-cast so sun shadows follow the mesh. */
  private applyLayoutEditShadowFollow(root: THREE.Object3D): void {
    const assetId = root.userData.assetId as AssetId | undefined;
    const spec = assetId ? ASSET_BY_ID.get(assetId) : undefined;
    if (!spec || spec.collision === "none") return;
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (object.name.startsWith("COL_") || object.name === "character_shadow_proxy") {
        object.castShadow = false;
        return;
      }
      object.castShadow = true;
      object.receiveShadow = true;
    });
  }

  private buildStaticCollisionProxies(assetRoots: THREE.Object3D[]): StaticCollisionProxy[] {
    const proxies: StaticCollisionProxy[] = [];
    for (const [index, root] of assetRoots.entries()) {
      const assetId = root.userData.assetId as AssetId | undefined;
      if (!assetId) continue;
      const spec = ASSET_BY_ID.get(assetId);
      if (!spec || spec.collision === "none") continue;
      // Catalog primitives are the canonical collision geometry. COL_* nodes
      // remain an asset-validation signal, but runtime physics must not depend
      // on a presentation node that is discarded after loading.
      const tag = readLayoutEditTag(root);
      const instanceId = tag?.id ?? `${assetId}:${index}`;
      proxies.push(...projectAssetCollision(assetId, root, instanceId));
    }
    return proxies;
  }

  /**
   * Static GLB clones share materials but otherwise render as hundreds of
   * independent meshes. Consolidate compatible LOD pieces across placements;
   * per-instance level visibility is updated from the gameplay camera before
   * rendering. Collision is extracted before this presentation pass.
   */
  private mergeStaticPrefabMeshes(): void {
    this.batchCompatibleMeshes(this.staticPrefabGroup, (object) => {
      let ancestor: THREE.Object3D | null = object;
      while (ancestor) {
        if (ancestor.name === "windmill_runtime_rotor" || ancestor.userData.dynamicPresentation) {
          return true;
        }
        ancestor = ancestor.parent;
      }
      return false;
    });
    // The visible LOD0 meshes now live in shared static batches. Remove the
    // original LOD controllers so a later camera update cannot reveal their
    // unbatched fallback levels and silently restore hundreds of draw calls.
    const flattenedLods: THREE.LOD[] = [];
    this.staticPrefabGroup.traverse((object) => {
      if (!(object instanceof THREE.LOD)) return;
      let ancestor: THREE.Object3D | null = object.parent;
      while (ancestor) {
        if (ancestor.userData.dynamicPresentation) return;
        ancestor = ancestor.parent;
      }
      flattenedLods.push(object);
    });
    for (const lod of flattenedLods) lod.removeFromParent();
    this.staticPrefabGroup.traverseVisible((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = false;
    });
  }

  private batchCompatibleMeshes(
    root: THREE.Group,
    shouldSkip: (object: THREE.Mesh) => boolean
  ): void {
    root.updateMatrixWorld(true);
    const rootWorldInverse = root.matrixWorld.clone().invert();
    const trackStaticLods = root === this.staticPrefabGroup;
    const compatibleGroups = new Map<
      string,
      {
        material: THREE.Material;
        sources: StaticBatchSource[];
      }
    >();
    const uvStrippedGeometries = new Set<THREE.BufferGeometry>();
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || !object.visible) return;
      if (Array.isArray(object.material)) return;
      if ((object as THREE.SkinnedMesh).isSkinnedMesh || object.morphTargetInfluences) return;
      let lod: { levelIndex: number; distances: readonly number[]; position: THREE.Vector3 } | undefined;
      let child: THREE.Object3D = object;
      let ancestor: THREE.Object3D | null = object.parent;
      while (ancestor && ancestor !== root) {
        if (ancestor instanceof THREE.LOD && trackStaticLods) {
          const levelIndex = ancestor.levels.findIndex((level) => level.object === child);
          if (levelIndex >= 0) {
            lod = {
              levelIndex,
              distances: ancestor.levels.map((level) => level.distance),
              position: ancestor.getWorldPosition(new THREE.Vector3())
            };
          }
        } else if (
          !ancestor.visible &&
          !(
            trackStaticLods &&
            ancestor.parent instanceof THREE.LOD &&
            ancestor.parent.levels.some((level) => level.object === ancestor)
          )
        ) {
          return;
        }
        child = ancestor;
        ancestor = ancestor.parent;
      }
      if (shouldSkip(object)) return;
      const material = object.material as THREE.MeshStandardMaterial;
      const hasTexture = material instanceof THREE.MeshStandardMaterial && [
        material.map,
        material.alphaMap,
        material.aoMap,
        material.bumpMap,
        material.displacementMap,
        material.emissiveMap,
        material.envMap,
        material.lightMap,
        material.metalnessMap,
        material.normalMap,
        material.roughnessMap
      ].some(Boolean);
      // Published Neva materials are palette-only. Some GLBs still carry an
      // unused TEXCOORD_0 accessor, which needlessly splits otherwise
      // compatible static/boat batches from their non-UV counterparts.
      if (!hasTexture && object.geometry.getAttribute("uv")) {
        const geometry = object.geometry.clone();
        geometry.deleteAttribute("uv");
        object.geometry = geometry;
        uvStrippedGeometries.add(geometry);
      }
      const attributes = (Object.entries(object.geometry.attributes) as Array<
        [string, THREE.BufferAttribute]
      >)
        .map(([name, attribute]) =>
          `${name}:${attribute.itemSize}:${attribute.normalized}:${attribute.array.constructor.name}`
        )
        .sort()
        .join("|");
      const chunkKey = trackStaticLods
        ? `${Math.floor(object.matrixWorld.elements[12] / STATIC_BATCH_CHUNK_SIZE_METERS)}:${Math.floor(object.matrixWorld.elements[14] / STATIC_BATCH_CHUNK_SIZE_METERS)}`
        : "unbounded";
      const signature = `${chunkKey}|${object.material.uuid}|receive:${object.receiveShadow}|indexed:${Boolean(object.geometry.index)}|${attributes}`;
      const group = compatibleGroups.get(signature) ?? {
        material: object.material,
        sources: [] as StaticBatchSource[]
      };
      group.sources.push({ mesh: object, lod });
      compatibleGroups.set(signature, group);
    });

    let batchIndex = 0;
    for (const { material, sources } of compatibleGroups.values()) {
      if (sources.length < 2 && !(trackStaticLods && sources.some((source) => source.lod))) continue;
      const uniqueGeometries = new Map<string, THREE.BufferGeometry>();
      for (const { mesh } of sources) uniqueGeometries.set(mesh.geometry.uuid, mesh.geometry);
      const maxVertexCount = [...uniqueGeometries.values()].reduce(
        (sum, geometry) => sum + geometry.getAttribute("position").count,
        0
      );
      const maxIndexCount = [...uniqueGeometries.values()].reduce(
        (sum, geometry) => sum + (geometry.index?.count ?? 0),
        0
      );
      const batched = new THREE.BatchedMesh(
        sources.length,
        maxVertexCount,
        maxIndexCount || undefined,
        material
      );
      const geometryIds = new Map<string, number>();
      for (const geometry of uniqueGeometries.values()) {
        geometryIds.set(geometry.uuid, batched.addGeometry(geometry));
        if (uvStrippedGeometries.has(geometry)) geometry.dispose();
      }
      for (const { mesh, lod } of sources) {
        const geometryId = geometryIds.get(mesh.geometry.uuid);
        if (geometryId === undefined) continue;
        const instanceId = batched.addInstance(geometryId);
        batched.setMatrixAt(
          instanceId,
          new THREE.Matrix4().multiplyMatrices(rootWorldInverse, mesh.matrixWorld)
        );
        if (lod) {
          this.staticLodBatchInstances.push({
            batch: batched,
            instanceId,
            levelIndex: lod.levelIndex,
            distances: lod.distances,
            position: lod.position,
            visible: true
          });
        }
        mesh.parent?.remove(mesh);
      }
      batched.name = `runtime_batch_${batchIndex++}`;
      batched.computeBoundingBox();
      batched.computeBoundingSphere();
      batched.frustumCulled = true;
      batched.castShadow = sources.some(({ mesh }) => mesh.castShadow);
      batched.receiveShadow = sources[0]?.mesh.receiveShadow ?? true;
      root.add(batched);
      if (trackStaticLods && batched.boundingSphere) {
        this.staticBatchChunks.push({
          batch: batched,
          center: batched.boundingSphere.center.clone().applyMatrix4(root.matrixWorld),
          radius: batched.boundingSphere.radius,
          visible: true
        });
      }
    }
  }

  private updateStaticBatchChunkVisibility(): void {
    const fogFar = this.scene.fog instanceof THREE.Fog
      ? this.scene.fog.far
      : CANONICAL_RENDER_CONFIG.fog.far;
    for (const chunk of this.staticBatchChunks) {
      const distance = Math.hypot(
        this.visibilityAnchor.x - chunk.center.x,
        this.visibilityAnchor.z - chunk.center.z
      );
      const visible = distance <= fogFar + chunk.radius + STATIC_BATCH_FOG_MARGIN_METERS;
      if (visible === chunk.visible) continue;
      chunk.batch.visible = visible;
      chunk.visible = visible;
    }
  }

  private updateStaticLodBatches(): void {
    const distanceScale = CANONICAL_RENDER_CONFIG.quality[this.qualityTier].lodDistanceScale;
    for (const instance of this.staticLodBatchInstances) {
      const distance = Math.hypot(
        this.visibilityAnchor.x - instance.position.x,
        this.visibilityAnchor.z - instance.position.z
      );
      let selectedLevel = instance.distances.length - 1;
      for (let index = 1; index < instance.distances.length; index++) {
        if (distance < instance.distances[index] * distanceScale) {
          selectedLevel = index - 1;
          break;
        }
      }
      const visible = selectedLevel === instance.levelIndex;
      if (visible === instance.visible) continue;
      instance.batch.setVisibleAt(instance.instanceId, visible);
      instance.visible = visible;
    }
  }

  private setCharacterDetailVisibility(root: THREE.Group, reduced: boolean): void {
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || !isCharacterDetailNode(object.name)) return;
      object.visible = !reduced;
    });
  }

  private updateCharacterDetailLod(): void {
    if (this.playerMesh) {
      this.playerMesh.getWorldPosition(this.tempCharacterWorldPosition);
      const reduced = Math.hypot(
        this.visibilityAnchor.x - this.tempCharacterWorldPosition.x,
        this.visibilityAnchor.z - this.tempCharacterWorldPosition.z
      ) > CHARACTER_DETAIL_DISTANCE_METERS;
      if (reduced !== this.playerDetailReduced) {
        this.setCharacterDetailVisibility(this.playerMesh, reduced);
        this.playerDetailReduced = reduced;
      }
    }
    for (const npc of this.npcPresentations.values()) {
      npc.model.getWorldPosition(this.tempCharacterWorldPosition);
      const reduced = Math.hypot(
        this.visibilityAnchor.x - this.tempCharacterWorldPosition.x,
        this.visibilityAnchor.z - this.tempCharacterWorldPosition.z
      ) > CHARACTER_DETAIL_DISTANCE_METERS;
      if (reduced === npc.detailReduced) continue;
      this.setCharacterDetailVisibility(npc.model, reduced);
      npc.detailReduced = reduced;
    }
  }

  /**
   * Runtime GLB LODs follow the same player/world anchor as static batches and
   * ground cover. Orbit, pitch, and zoom therefore cannot swap an asset's
   * visible level; the render camera remains responsible only for projection
   * and ordinary off-screen frustum rejection.
   */
  private updateWorldAnchoredRuntimeLods(): void {
    if (this.runtimeLodsDirty) {
      this.runtimeLods.length = 0;
      this.scene.traverse((object) => {
        if (!(object instanceof THREE.LOD)) return;
        object.autoUpdate = false;
        this.runtimeLods.push(object);
      });
      this.runtimeLodsDirty = false;
    }
    this.visibilityLodCamera.position.copy(this.visibilityAnchor);
    this.visibilityLodCamera.zoom = CANONICAL_RENDER_CONFIG.quality[this.qualityTier].lodDistanceScale;
    this.visibilityLodCamera.updateMatrixWorld(true);
    for (const object of this.runtimeLods) {
      if (!object.parent) continue;
      object.updateWorldMatrix(true, false);
      object.update(this.visibilityLodCamera);
    }
  }

  private updateDistanceManagedPresentation(): void {
    const dx = this.visibilityAnchor.x - this.lastDistanceVisibilityFocus.x;
    const dz = this.visibilityAnchor.z - this.lastDistanceVisibilityFocus.y;
    if (!this.distanceVisibilityDirty && dx * dx + dz * dz < 0.55 ** 2) return;
    this.lastDistanceVisibilityFocus.set(this.visibilityAnchor.x, this.visibilityAnchor.z);
    this.distanceVisibilityDirty = false;
    this.updateWorldAnchoredRuntimeLods();
    this.updateCharacterDetailLod();
    this.updateStaticLodBatches();
    this.updateStaticBatchChunkVisibility();
  }

  private batchPlayerRigidMeshes(root: THREE.Group): void {
    const animatedNames = new Set<string>();
    const clips = (root.userData.animationClips as THREE.AnimationClip[] | undefined) ?? [];
    for (const clip of clips) {
      for (const track of clip.tracks) animatedNames.add(track.name.split(".")[0] ?? track.name);
    }
    this.batchCompatibleMeshes(root, (object) => {
      if ((object as THREE.SkinnedMesh).isSkinnedMesh) return true;
      if (object.name === "character_shadow_proxy") return true;
      let current: THREE.Object3D | null = object;
      while (current && current !== root) {
        if (isPlayerRigObjectName(current.name) || animatedNames.has(current.name)) return true;
        current = current.parent;
      }
      return false;
    });
  }

  /**
   * Raycast downward from (x, 50, z) against the terrain mesh.
   */
  public sampleTerrainHeight(x: number, z: number): number | null {
    return WorldLayout.terrainHeight(x, z);
  }

  /** Applies only semantic clock/weather inputs to the shared renderer baseline. */
  public updateEnvironment(
    state: Readonly<GameState>,
    timeSeconds: number,
    focus: THREE.Vector3
  ): void {
    const frame = this.lightingRig.update(state, timeSeconds, focus);
    const uniforms = this.skyMaterial?.uniforms;
    (uniforms?.topColor?.value as THREE.Color | undefined)?.copy(frame.skyTopColor);
    (uniforms?.horizonColor?.value as THREE.Color | undefined)?.copy(frame.skyHorizonColor);
    this.scene.background = frame.skyTopColor;
    if (this.sunDisc) {
      this.sunDisc.position.copy(focus).addScaledVector(frame.sunDirection, 560);
      this.sunDisc.visible = frame.sunVisibility > 0.002;
      this.sunDisc.material.opacity = frame.sunVisibility * 0.62;
      this.sunDisc.material.color.copy(frame.sunColor);
    }
    if (this.moonDisc) {
      this.moonDisc.position.copy(focus).addScaledVector(frame.moonDirection, 558);
      this.moonDisc.visible = frame.moonVisibility > 0.002;
      this.moonDisc.material.opacity = frame.moonVisibility * 0.78;
      this.moonDisc.material.color.copy(frame.moonColor);
    }
    if (this.starField) {
      this.starField.position.copy(focus);
      this.starField.visible = frame.starVisibility > 0.002;
      (this.starField.material as THREE.PointsMaterial).opacity = frame.starVisibility * 0.82;
    }
    if (this.practicalLightFocus.distanceToSquared(focus) >= 0.25) {
      this.practicalLightFocus.copy(focus);
      this.applyPracticalLightBudget();
    }
    const practicalIntensity =
      CANONICAL_RENDER_CONFIG.practicalLights.localIntensity * frame.practicalLightIntensity;
    for (const practical of this.practicalLights) {
      practical.light.intensity = practicalIntensity;
      practical.light.visible = practical.qualityEnabled && frame.practicalLightIntensity > 0.002;
    }
    if (this.playerContactShadow) {
      setContactShadowOpacity(
        this.playerContactShadow,
        CANONICAL_RENDER_CONFIG.contact.opacity * THREE.MathUtils.lerp(0.42, 1, frame.daylight)
      );
    }
    this.water.updateLighting(frame);
    this.shoreFoam.updateLighting(frame);
    this.boatWakes.updateLighting(frame);
    this.terrainSurfaceMaterial.updateWeather(state.weather.precipitation, timeSeconds);
    const sharedGroundWetness = this.terrainSurfaceMaterial.wetness;
    this.roadSurfaceMaterial.setWetness(sharedGroundWetness);
    this.cultivatedSurfaceMaterial.setWetness(sharedGroundWetness);
    this.updateAmbientMotion(state, timeSeconds);
    this.rainField.update({
      focus,
      timeSeconds,
      precipitation: state.weather.precipitation,
      wind: this.weatherMotion,
      waterConditions: this.waterConditions(state),
      reducedMotion: this.prefersReducedMotion,
      daylight: frame.daylight
    });
  }

  private waterConditions(state: Readonly<GameState>): WaterConditions {
    this.waterConditionSnapshot.seaRoughness = state.weather.seaRoughness;
    this.waterConditionSnapshot.windDirectionDeg = state.weather.windDirectionDeg;
    this.waterConditionSnapshot.windSpeed = this.weatherMotion.effectiveWindSpeed;
    return this.waterConditionSnapshot;
  }

  /**
   * Returns the latest presentation-only fish target for the camera. The
   * encounter remains simulation-owned; this is just the endpoint already
   * used to draw the line and hooked fish in the current frame.
   */
  public getSportFishingPresentation(): Readonly<SportFishingPresentationSample> | undefined {
    return this.sportFishingCameraHint ? this.sportFishingPresentation : undefined;
  }

  public getSportFishingCameraHint(): Readonly<SportFishingCameraHint> | undefined {
    if (!this.sportFishingCameraHint) return undefined;
    return {
      ...this.sportFishingCameraHint,
      lookHint: { ...this.sportFishingCameraHint.lookHint }
    };
  }

  public playPlayerAction(action: PlayerAnimation): void {
    this.playerAnimation?.play(action);
    if (action === "harvest") {
      this.cosmeticCropCarryUntilSeconds = this.lastPresentationTime + 1.4;
    }
  }

  public setFarmingActionPresentation(
    action: FarmingPresentationActionName,
    phase: FarmingPresentationPhase,
    timeSeconds: number
  ): void {
    if (phase === "cancelled" || phase === "invalidated") {
      this.cosmeticCropCarryUntilSeconds = 0;
      this.hideFarmingProps();
      return;
    }
    if (phase === "started") {
      this.hideFarmingProps();
      const key = action === "plant"
        ? "seed"
        : action === "water"
          ? "water"
          : action === "harvest"
            ? "sickle"
            : action === "processing-start" || action === "workstation"
              ? "scoop"
              : action === "processing-collect" || action === "pickup"
                ? "basket"
                : null;
      if (key) this.showFarmingProp(key);
      return;
    }
    if (phase === "committed" && action === "harvest") {
      this.hideFarmingProps();
      this.showFarmingProp("bundle");
      this.cosmeticCropCarryUntilSeconds = timeSeconds + 1.6;
      return;
    }
    if (phase === "completed") {
      if (action === "harvest") {
        this.showFarmingProp("bundle");
        this.cosmeticCropCarryUntilSeconds = Math.max(
          this.cosmeticCropCarryUntilSeconds,
          timeSeconds + 1.1
        );
      } else {
        this.hideFarmingProps();
      }
    }
  }

  private hideFarmingProps(): void {
    for (const prop of this.farmingProps.values()) prop.visible = false;
  }

  private showFarmingProp(key: string): void {
    const prop = this.farmingProps.get(key);
    if (prop) prop.visible = true;
  }

  private async attachFarmingProps(player: THREE.Group): Promise<void> {
    if (this.farmingPropsAttached) return;
    const loaded = await Promise.all(
      FARMING_PROP_ATTACHMENTS.map(async (attachment) => ({
        attachment,
        object: await AssetLoader.loadModel(attachment.assetId)
      }))
    );
    if (this.farmingPropsAttached || player !== this.playerMesh) return;
    for (const { attachment, object } of loaded) {
      const socket = player.getObjectByName(attachment.socket);
      if (!socket) throw new Error(`[WorldScene] Missing farming prop socket ${attachment.socket}`);
      object.name = `cosmetic_${attachment.key}`;
      object.visible = false;
      const pose = socketAttachFor(attachment.assetId);
      object.position.set(...pose.position);
      object.rotation.set(...pose.rotation);
      object.scale.setScalar(pose.scale);
      object.userData.socketBaseQuaternion = object.quaternion.clone();
      object.userData.dynamicPresentation = true;
      this.setShadowPolicy(object, false);
      socket.add(object);
      this.farmingProps.set(attachment.key, object);
      if (attachment.key === "rod") this.fishingRodBend = new FishingRodBend(object);
    }
    this.farmingPropsAttached = true;
  }

  private configureRowboatPresentation(boatId: string, boatRoot: THREE.Group): void {
    if (this.rowboatPresentationRigs.has(boatId)) return;
    const rowerSeat = boatRoot.getObjectByName("boat_rowboat_rower_seat");
    if (!rowerSeat) throw new Error("[WorldScene] Rowboat is missing boat_rowboat_rower_seat");
    this.boatDriverSeats.set(boatId, rowerSeat);
    const oars = (["left", "right"] as const).map((side): RowboatOarAttachment => {
      const root = boatRoot.getObjectByName(`boat_rowboat_oar_${side}_root`);
      if (!root?.parent) {
        throw new Error(`[WorldScene] Rowboat is missing boat_rowboat_oar_${side}_root`);
      }
      return {
        root,
        originalParent: root.parent,
        originalPosition: root.position.clone(),
        originalQuaternion: root.quaternion.clone(),
        originalScale: root.scale.clone(),
        handSocketName: side === "left"
          ? "char_player_hand_socket_left"
          : "char_player_hand_socket_right"
      };
    });
    this.rowboatPresentationRigs.set(boatId, { boatRoot, rowerSeat, oars, held: false });
  }

  private configureSkiffPresentation(boatId: string, boatRoot: THREE.Group): void {
    if (this.boatDriverSeats.has(boatId)) return;
    const driverSeat = boatRoot.getObjectByName("boat_skiff_driver_seat");
    if (!driverSeat) throw new Error("[WorldScene] Skiff is missing boat_skiff_driver_seat");
    this.boatDriverSeats.set(boatId, driverSeat);
  }

  private skiffMooringPreviewPose(): GameState["boats"][string] {
    return {
      id: SKIFF_MOORING_PREVIEW_ID,
      boatTypeId: "boat.skiff",
      x: HARBOR_SKIFF_MOORING.boatPosition.x,
      y: HARBOR_SKIFF_MOORING.boatPosition.y,
      z: HARBOR_SKIFF_MOORING.boatPosition.z,
      headingRadians: 0,
      speed: 0,
      fuel: 0,
      durability: 0,
      fishCargoSlotIds: [],
      supplyInventoryId: "",
      upgrades: [],
      isDocked: true,
      dockedMarketId: HARBOR_SKIFF_MOORING.marketId
    };
  }

  private ownedSkiffMeshReady(state: Readonly<GameState>): boolean {
    return Boolean(state.boats["boat.player_skiff"] && this.boatMeshes.get("boat.player_skiff"));
  }

  private syncSkiffMooringPreview(state: Readonly<GameState>, timeSeconds: number): void {
    const preview = this.skiffMooringPreview;
    if (!preview) return;
    if (this.ownedSkiffMeshReady(state)) {
      preview.visible = false;
      return;
    }
    preview.visible = true;
    const pose = this.skiffMooringPreviewPose();
    const presentation = this.sampleBoatPresentation(pose, state, timeSeconds);
    preview.position.set(pose.x, pose.y + presentation.waveHeight, pose.z);
    preview.rotation.set(presentation.pitch, pose.headingRadians, presentation.roll, "YXZ");
    preview.updateMatrixWorld(true);
  }

  private async ensureSkiffMooringPreview(state: Readonly<GameState>): Promise<void> {
    if (this.ownedSkiffMeshReady(state)) {
      if (this.skiffMooringPreview) this.skiffMooringPreview.visible = false;
      return;
    }
    if (this.skiffMooringPreview) {
      this.skiffMooringPreview.visible = true;
      return;
    }
    const mesh = await AssetLoader.loadModel(ASSET_IDS.BOAT_SKIFF_A);
    if (this.skiffMooringPreview || this.ownedSkiffMeshReady(state)) return;
    mesh.name = "skiff_mooring_preview";
    mesh.userData.dynamicPresentation = true;
    this.scene.add(mesh);
    this.skiffMooringPreview = mesh;
  }

  private setRowboatOarsHeld(rig: RowboatPresentationRig, held: boolean): void {
    if (rig.held === held || !this.playerMesh) return;
    if (held) {
      for (const oar of rig.oars) {
        const socket = this.playerMesh.getObjectByName(oar.handSocketName);
        if (!socket) throw new Error(`[WorldScene] Player is missing ${oar.handSocketName}`);
        socket.add(oar.root);
        oar.root.position.set(0, 0, 0);
        oar.root.quaternion.identity();
        oar.root.scale.set(1, 1, 1);
      }
    } else {
      for (const oar of rig.oars) {
        oar.originalParent.add(oar.root);
        oar.root.position.copy(oar.originalPosition);
        oar.root.quaternion.copy(oar.originalQuaternion);
        oar.root.scale.copy(oar.originalScale);
      }
    }
    rig.held = held;
  }

  private syncRowboatOarOwnership(activeBoatId: string | null, holdingOars: boolean): void {
    for (const [boatId, rig] of this.rowboatPresentationRigs) {
      this.setRowboatOarsHeld(rig, holdingOars && boatId === activeBoatId);
    }
  }

  private spawnPaddleDisturbance(
    boat: GameState["boats"][string],
    state: Readonly<GameState>,
    timeSeconds: number
  ): void {
    const sideX = Math.cos(boat.headingRadians);
    const sideZ = -Math.sin(boat.headingRadians);
    const conditions = this.waterConditions(state);
    for (const side of [-1, 1]) {
      this.boatWakes.spawnPaddle(
        boat.x + sideX * side * 1.05,
        boat.z + sideZ * side * 1.05,
        boat.headingRadians + side * 0.18,
        timeSeconds,
        conditions
      );
    }
  }

  public drainPlayerAnimationEvents(): CharacterAnimationEvent[] {
    return this.playerAnimationEvents.splice(0, this.playerAnimationEvents.length);
  }

  public currentPlayerAnimationClip(): PlayerAnimation {
    return this.playerAnimation?.currentClip() ?? "idle";
  }

  private updateFarmingProps(clip: PlayerAnimation, timeSeconds: number): void {
    const visibleKey = clip === "plant"
      ? "seed"
      : clip === "water"
        ? "water"
        : clip === "harvest"
          ? "sickle"
          : clip === "workstation"
            ? "scoop"
            : clip === "pickup" || clip === "place"
              ? "basket"
              : clip.startsWith("carry_") || timeSeconds < this.cosmeticCropCarryUntilSeconds
                ? "bundle"
                : clip === "cast" || clip === "fishing_idle" || clip === "reel" || clip === "slack" || clip === "brace"
                  ? "rod"
                  : null;
    for (const [key, prop] of this.farmingProps) prop.visible = key === visibleKey;
  }

  public spawnFarmingVfx(
    kind: FarmVfxKind,
    target: FarmVfxPoint,
    timeSeconds: number,
    origin?: FarmVfxPoint
  ): void {
    this.farmVfx.spawn(kind, target, timeSeconds, {
      origin,
      reducedMotion: this.prefersReducedMotion
    });
  }

  public cancelFarmingVfx(kind?: FarmVfxKind): void {
    this.farmVfx.cancel(kind);
  }

  private updateAmbientMotion(state: Readonly<GameState>, timeSeconds: number): void {
    sampleWeatherMotionSignal(state.weather, timeSeconds, this.weatherMotion);
    const delta = this.lastAmbientMotionTimeSeconds > 0
      ? THREE.MathUtils.clamp(timeSeconds - this.lastAmbientMotionTimeSeconds, 0, 0.1)
      : 1 / 60;
    this.lastAmbientMotionTimeSeconds = timeSeconds;
    const motionScale = this.prefersReducedMotion
      ? CANONICAL_RENDER_CONFIG.motion.reducedMotionScale
      : CANONICAL_RENDER_CONFIG.motion.ambientScale;
    if (this.windmillRotor) {
      const rotorSpeed = (0.18 + this.weatherMotion.effectiveWindSpeed * 0.035) * motionScale;
      this.windmillRotor.rotation.z = -timeSeconds * rotorSpeed;
    }
    const cloudUpdateInterval = this.qualityTier === "high"
      ? 1 / 15
      : this.qualityTier === "medium" ? 1 / 12 : 0.1;
    if (timeSeconds - this.lastCloudMotionTimeSeconds >= cloudUpdateInterval) {
      this.lastCloudMotionTimeSeconds = timeSeconds;
      for (const cloud of this.cloudMeshes) {
        const pose = sampleAmbientCloudPose(
          cloud.placement,
          timeSeconds,
          motionScale,
          this.weatherMotion.directionX,
          this.weatherMotion.directionZ,
          this.weatherMotion.effectiveWindSpeed
        );
        cloud.object.position.set(pose.x, pose.y, pose.z);
        cloud.object.rotation.set(pose.rotationX, pose.rotationY, pose.rotationZ);
        cloud.object.scale.setScalar(pose.scale);
      }
    }
    this.updateFaunaMotion(timeSeconds, delta, motionScale);
    this.updateAmbientFlyers(timeSeconds, delta, motionScale);
    this.groundCover.updateWind(this.weatherMotion, timeSeconds, motionScale);
  }

  private registerFaunaPresentation(
    id: string,
    kind: FaunaPresentation["kind"],
    root: THREE.Group
  ): void {
    const prefix = kind === "cow"
      ? "fauna_cow_a"
      : kind === "chicken"
        ? "fauna_chicken_a"
        : "fauna_rabbit_a";
    const node = (name: string): FaunaMotionNode | undefined => {
      const object = root.getObjectByName(name);
      return object
        ? {
            object,
            basePosition: object.position.clone(),
            baseRotation: object.rotation.clone()
          }
        : undefined;
    };
    const body = node(`${prefix}_motion_root`) ?? {
      object: root,
      basePosition: root.position.clone(),
      baseRotation: root.rotation.clone()
    };
    const wings = kind === "chicken"
      ? [node(`${prefix}_wing_left_pivot`), node(`${prefix}_wing_right_pivot`)].filter(
          (entry): entry is FaunaMotionNode => Boolean(entry)
        )
      : [];
    const clips = (root.userData.animationClips as THREE.AnimationClip[] | undefined) ?? [];
    const mixer = clips.length > 0 ? new THREE.AnimationMixer(root) : null;
    const actions = new Map<FaunaAnimationClip, THREE.AnimationAction>();
    if (mixer) {
      for (const clipName of ["idle", "graze", "peck", "look", "hop"] as const) {
        const clip = clips.find((candidate) => candidate.name === clipName);
        if (!clip) continue;
        const action = mixer.clipAction(clip);
        action.setLoop(THREE.LoopRepeat, Infinity);
        actions.set(clipName, action);
      }
    }
    const idleAction = actions.get("idle");
    if (idleAction) {
      idleAction.play();
      idleAction.time = stablePresentationPhase(id) * idleAction.getClip().duration;
    }
    this.faunaPresentations.push({
      id,
      kind,
      phase: stablePresentationPhase(id),
      root,
      body,
      head: node(`${prefix}_head_pivot`),
      tail: node(`${prefix}_tail_pivot`),
      wings,
      mixer,
      actions,
      activeClip: idleAction ? "idle" : null,
      lastMotionUpdateSeconds: 0
    });
  }

  private disposeSchoolEffect(group: THREE.Group): void {
    group.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || object.name !== "school_ripple") return;
      object.geometry.dispose();
    });
    group.removeFromParent();
  }

  private disposeDonkeyShadowPresentation(root: THREE.Object3D): void {
    for (const name of ["character_shadow_proxy", "donkey_contact_shadow"]) {
      const mesh = root.getObjectByName(name);
      if (!(mesh instanceof THREE.Mesh)) continue;
      mesh.removeFromParent();
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        for (const material of mesh.material) material.dispose();
      } else {
        mesh.material.dispose();
      }
    }
  }

  private registerDonkeyPresentation(id: string, placementId: string, root: THREE.Group): void {
    if (this.donkeyPresentation) {
      throw new Error(`[WorldScene] Duplicate donkey presentation for ${id}`);
    }
    const riderSocket = root.getObjectByName(`${ASSET_IDS.FAUNA_DONKEY_A}_rider_socket`);
    if (!riderSocket) {
      throw new Error(`[WorldScene] Donkey is missing ${ASSET_IDS.FAUNA_DONKEY_A}_rider_socket`);
    }
    const clips = (root.userData.animationClips as THREE.AnimationClip[] | undefined) ?? [];
    const clipSpecs = ASSET_BY_ID.get(ASSET_IDS.FAUNA_DONKEY_A)?.animationClips ?? [];
    const mixer = clips.length > 0 ? new THREE.AnimationMixer(root) : null;
    const actions = new Map<DonkeyAnimationClip, THREE.AnimationAction>();
    if (mixer) {
      for (const clipName of ["idle", "graze", "look", "walk", "trot", "mount", "dismount"] as const) {
        const clip = clips.find((candidate) => candidate.name === clipName);
        if (!clip) continue;
        const spec = clipSpecs.find((candidate) => candidate.name === clipName);
        const loop = spec?.loop ?? ["idle", "graze", "look", "walk", "trot"].includes(clipName);
        const action = mixer.clipAction(clip);
        action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
        action.clampWhenFinished = !loop;
        actions.set(clipName, action);
      }
    }
    const idleAction = actions.get("idle");
    if (idleAction) {
      idleAction.play();
      idleAction.time = stablePresentationPhase(id) * idleAction.getClip().duration;
    }
    this.donkeyPresentation = {
      id,
      placementId,
      root,
      riderSocket,
      mixer,
      actions,
      activeClip: idleAction ? "idle" : null,
      attachedMountId: null,
      originalPlayerParent: null,
      transitionUntilSeconds: 0,
      lastAnimationUpdateSeconds: 0
    };
    if (this.lightingRig.contactShadowsEnabled() && !root.getObjectByName("donkey_contact_shadow")) {
      const shadowMesh = createContactShadowMesh(
        CANONICAL_RENDER_CONFIG.contact.playerRadius * 1.55,
        CANONICAL_RENDER_CONFIG.contact.playerRadius * 0.72,
        CANONICAL_RENDER_CONFIG.contact.opacity
      );
      shadowMesh.name = "donkey_contact_shadow";
      shadowMesh.position.set(0, 0.02, 0);
      root.add(shadowMesh);
    }
  }

  private setDonkeyAnimation(donkey: DonkeyPresentation, clipName: DonkeyAnimationClip): void {
    if (donkey.activeClip === clipName) return;
    const next = donkey.actions.get(clipName) ?? donkey.actions.get("idle");
    if (!next) return;
    const resolvedClip = next === donkey.actions.get("idle") ? "idle" : clipName;
    const previous = donkey.activeClip ? donkey.actions.get(donkey.activeClip) : undefined;
    previous?.fadeOut(0.16);
    next.reset().fadeIn(0.16).play();
    donkey.activeClip = resolvedClip;
  }

  private syncDonkeyAnimationSpeed(
    donkey: DonkeyPresentation,
    speedMetersPerSecond: number
  ): void {
    const action = donkey.activeClip ? donkey.actions.get(donkey.activeClip) : undefined;
    const clipSpec = donkey.activeClip
      ? ASSET_BY_ID.get(ASSET_IDS.FAUNA_DONKEY_A)?.animationClips?.find(
          (clip) => clip.name === donkey.activeClip
        )
      : undefined;
    const referenceSpeed = clipSpec?.referenceSpeedMetersPerSecond;
    if (!action || !referenceSpeed) {
      action?.setEffectiveTimeScale(1);
      return;
    }
    action.setEffectiveTimeScale(
      THREE.MathUtils.clamp(
        Math.max(0.01, speedMetersPerSecond) / referenceSpeed,
        CANONICAL_RENDER_CONFIG.motion.locomotionPlaybackMinimum,
        CANONICAL_RENDER_CONFIG.motion.locomotionPlaybackMaximum
      )
    );
  }

  private attachPlayerToDonkey(donkey: DonkeyPresentation, mountId: string, timeSeconds: number): void {
    if (!this.playerMesh || donkey.attachedMountId === mountId) return;
    donkey.originalPlayerParent = this.playerMesh.parent ?? this.scene;
    donkey.riderSocket.attach(this.playerMesh);
    // The socket marks the saddle seat; the player root is offset to keep the
    // seated pelvis and boots on that seat while preserving the simulation's
    // ground-centred player pose.
    this.playerMesh.position.set(0, DONKEY_RIDER_ROOT_OFFSET_Y, 0);
    this.playerMesh.rotation.set(0, 0, 0);
    donkey.attachedMountId = mountId;
    donkey.transitionUntilSeconds = timeSeconds + 0.8;
    this.setDonkeyAnimation(donkey, "mount");
  }

  private detachPlayerFromDonkey(): void {
    const donkey = this.donkeyPresentation;
    if (!donkey || !this.playerMesh || donkey.attachedMountId === null) return;
    const parent = donkey.originalPlayerParent ?? this.scene;
    parent.attach(this.playerMesh);
    donkey.originalPlayerParent = null;
    donkey.attachedMountId = null;
  }

  private updateDonkeyPresentation(
    state: Readonly<GameState>,
    playerPose: PresentedPlayerFrame,
    timeSeconds: number,
    delta: number
  ): void {
    const donkey = this.donkeyPresentation;
    if (!donkey) return;
    const mount = state.mounts[donkey.id];
    if (!mount) return;
    const activeMountId = state.player.activeMountId;
    const isMounted = activeMountId === donkey.id;
    const pose = resolveMountPresentationPose(mount, playerPose, isMounted);
    donkey.root.position.set(pose.x, pose.y, pose.z);
    donkey.root.rotation.set(0, pose.rotationY, 0);
    const playerDistanceSq = (pose.x - playerPose.x) ** 2 + (pose.z - playerPose.z) ** 2;
    donkey.root.visible = isMounted || playerDistanceSq <= 160 * 160;
    if (!donkey.root.visible) return;
    if (isMounted && this.playerMesh) {
      this.attachPlayerToDonkey(donkey, donkey.id, timeSeconds);
      if (timeSeconds >= donkey.transitionUntilSeconds) {
        const gait = playerPose.motion?.requestedGait === "trot" ? "trot" : "walk";
        this.setDonkeyAnimation(
          donkey,
          playerPose.motion?.speedMetersPerSecond > 0.1 && !playerPose.motion.isCollisionBlocked ? gait : "idle"
        );
      }
    } else {
      if (donkey.attachedMountId !== null) {
        this.detachPlayerFromDonkey();
        donkey.transitionUntilSeconds = timeSeconds + 0.8;
        this.setDonkeyAnimation(donkey, "dismount");
      } else if (timeSeconds >= donkey.transitionUntilSeconds) {
        const cycle = (timeSeconds + stablePresentationPhase(donkey.id) * 9.0) % 12;
        const desired: DonkeyAnimationClip = this.prefersReducedMotion
          ? "idle"
          : cycle < 5.0 ? "idle" : cycle < 8.6 ? "graze" : cycle < 10.1 ? "look" : "idle";
        this.setDonkeyAnimation(donkey, desired);
      }
    }
    if (donkey.mixer) {
      this.syncDonkeyAnimationSpeed(
        donkey,
        isMounted ? playerPose.motion?.speedMetersPerSecond ?? 0 : 0
      );
      donkey.mixer.timeScale = this.prefersReducedMotion
        ? CANONICAL_RENDER_CONFIG.motion.reducedMotionScale
        : 1;
      const interval = isMounted || playerDistanceSq <= 40 * 40
        ? 0
        : playerDistanceSq <= 90 * 90 ? 1 / 12 : 0.4;
      if (timeSeconds - donkey.lastAnimationUpdateSeconds >= interval) {
        const donkeyDelta = donkey.lastAnimationUpdateSeconds > 0
          ? Math.min(0.4, timeSeconds - donkey.lastAnimationUpdateSeconds)
          : delta;
        donkey.lastAnimationUpdateSeconds = timeSeconds;
        donkey.mixer.update(donkeyDelta);
      }
    }
    donkey.root.updateMatrixWorld(true);
  }

  private setFaunaAnimation(fauna: FaunaPresentation, clipName: FaunaAnimationClip): void {
    if (fauna.activeClip === clipName) return;
    const next = fauna.actions.get(clipName) ?? fauna.actions.get("idle");
    if (!next) return;
    const resolvedClip = next === fauna.actions.get("idle") ? "idle" : clipName;
    const previous = fauna.activeClip ? fauna.actions.get(fauna.activeClip) : undefined;
    previous?.fadeOut(0.18);
    next.reset().fadeIn(0.18).play();
    fauna.activeClip = resolvedClip;
  }

  private updateFaunaMotion(timeSeconds: number, delta: number, motionScale: number): void {
    const windLean = this.weatherMotion.directionX
      * this.weatherMotion.normalizedStrength
      * (0.025 + this.weatherMotion.gust * 0.004)
      * motionScale;
    for (const fauna of this.faunaPresentations) {
      const dx = fauna.root.position.x - this.visibilityAnchor.x;
      const dz = fauna.root.position.z - this.visibilityAnchor.z;
      const distanceSq = dx * dx + dz * dz;
      fauna.root.visible = distanceSq <= 150 * 150;
      if (!fauna.root.visible) continue;
      const interval = distanceSq <= 36 * 36 ? 0 : distanceSq <= 85 * 85 ? 1 / 12 : 0.4;
      if (timeSeconds - fauna.lastMotionUpdateSeconds < interval) continue;
      const faunaDelta = fauna.lastMotionUpdateSeconds > 0
        ? Math.min(0.4, timeSeconds - fauna.lastMotionUpdateSeconds)
        : delta;
      fauna.lastMotionUpdateSeconds = timeSeconds;
      const localTime = timeSeconds + fauna.phase * 9.7;
      const cycle = localTime % (fauna.kind === "cow" ? 13 : fauna.kind === "rabbit" ? 6.4 : 7.5);
      const breathing = Math.sin(localTime * (fauna.kind === "cow" ? 1.25 : 2.1));
      const activity = fauna.kind === "cow"
        ? smoothPresentationWindow(cycle, 3.2, 8.4, 0.9)
        : fauna.kind === "rabbit"
          ? smoothPresentationWindow(cycle, 1.4, 2.4, 0.22)
          : smoothPresentationWindow(cycle, 1.1, 4.3, 0.32);
      const lookActivity = fauna.kind === "cow"
        ? smoothPresentationWindow(cycle, 10.1, 12.2, 0.35)
        : fauna.kind === "rabbit"
          ? smoothPresentationWindow(cycle, 3.6, 5.2, 0.28)
          : smoothPresentationWindow(cycle, 5.2, 7, 0.25);
      const desiredClip: FaunaAnimationClip = this.prefersReducedMotion
        ? "idle"
        : activity > 0.05
          ? fauna.kind === "cow" ? "graze" : fauna.kind === "rabbit" ? "hop" : "peck"
          : lookActivity > 0.05 ? "look" : "idle";
      this.setFaunaAnimation(fauna, desiredClip);
      if (fauna.mixer) {
        fauna.mixer.timeScale = this.prefersReducedMotion
          ? CANONICAL_RENDER_CONFIG.motion.reducedMotionScale
          : 1;
      }
      fauna.mixer?.update(faunaDelta);

      if (!fauna.mixer) {
        fauna.body.object.position.y = fauna.body.basePosition.y
          + breathing * (fauna.kind === "cow" ? 0.012 : 0.009) * motionScale;
        fauna.body.object.rotation.x = fauna.body.baseRotation.x;
        fauna.body.object.rotation.y = fauna.body.baseRotation.y
          + Math.sin(localTime * 0.31) * (fauna.kind === "cow" ? 0.035 : 0.08) * motionScale;
        fauna.body.object.rotation.z = fauna.body.baseRotation.z + windLean;
      }

      if (fauna.head && !fauna.mixer) {
        const peck = fauna.kind === "chicken"
          ? Math.max(0, Math.sin((cycle - 1.1) * Math.PI * 3.2)) * activity
          : activity;
        fauna.head.object.rotation.x = fauna.head.baseRotation.x
          + (fauna.kind === "cow" ? 0.72 * activity : 0.86 * peck) * motionScale;
        fauna.head.object.rotation.y = fauna.head.baseRotation.y
          + Math.sin(localTime * 0.67 + fauna.phase) * 0.18 * (1 - activity * 0.65) * motionScale;
        fauna.head.object.rotation.z = fauna.head.baseRotation.z - windLean * 0.45;
      }
      if (fauna.tail) {
        fauna.tail.object.rotation.y = fauna.tail.baseRotation.y
          + Math.sin(localTime * 1.7 + fauna.phase) * 0.22 * motionScale;
      }
      for (const [index, wing] of fauna.wings.entries()) {
        const wingSign = index === 0 ? -1 : 1;
        wing.object.rotation.y = wing.baseRotation.y
          + wingSign * Math.sin(localTime * 2.4 + fauna.phase) * 0.08 * motionScale;
        wing.object.rotation.z = wing.baseRotation.z + wingSign * windLean * 1.8;
      }
    }
  }

  private async loadAmbientFlyers(): Promise<void> {
    const spawn = async (
      kind: AmbientFlyerPresentation["kind"],
      assetId: AssetId,
      orbits: readonly AmbientFlyerOrbit[]
    ): Promise<void> => {
      for (const orbit of orbits) {
        try {
          const object = await AssetLoader.loadModel(assetId);
          object.userData.dynamicPresentation = true;
          object.scale.setScalar(kind === "butterfly" ? 3.4 : 1.45);
          this.setShadowPolicy(object, false);
          this.environmentGroup.add(object);
          const clips = (object.userData.animationClips as THREE.AnimationClip[] | undefined) ?? [];
          const mixer = clips.length > 0 ? new THREE.AnimationMixer(object) : null;
          const flapClip = clips.find((clip) => clip.name === "flap");
          const glideClip = clips.find((clip) => clip.name === "glide");
          const flap = mixer && flapClip ? mixer.clipAction(flapClip) : null;
          const glide = mixer && glideClip ? mixer.clipAction(glideClip) : null;
          flap?.setLoop(THREE.LoopRepeat, Infinity).play();
          glide?.setLoop(THREE.LoopRepeat, Infinity).play();
          this.ambientFlyers.push({
            kind,
            object,
            orbit,
            mixer,
            flap,
            glide,
            lastAnimationUpdateSeconds: 0
          });
        } catch (error) {
          console.warn(`[WorldScene] Failed to load ${kind} flyer ${assetId}:`, error);
        }
      }
    };
    await spawn("gull", ASSET_IDS.FAUNA_GULL_A, GULL_ORBITS);
    await spawn("butterfly", ASSET_IDS.FAUNA_BUTTERFLY_A, BUTTERFLY_ORBITS);
  }

  private updateAmbientFlyers(timeSeconds: number, delta: number, motionScale: number): void {
    for (const flyer of this.ambientFlyers) {
      const pose = sampleAmbientFlyerPose(flyer.orbit, timeSeconds, motionScale);
      const dx = pose.x - this.visibilityAnchor.x;
      const dz = pose.z - this.visibilityAnchor.z;
      const distanceSq = dx * dx + dz * dz;
      const visibilityDistance = flyer.kind === "butterfly" ? 120 : 190;
      flyer.object.visible = distanceSq <= visibilityDistance * visibilityDistance;
      if (!flyer.object.visible) continue;
      flyer.object.position.set(pose.x, pose.y, pose.z);
      flyer.object.rotation.y = pose.heading;
      if (flyer.mixer) {
        const interval = distanceSq <= 50 * 50 ? 0 : 1 / 12;
        if (timeSeconds - flyer.lastAnimationUpdateSeconds < interval) continue;
        const flyerDelta = flyer.lastAnimationUpdateSeconds > 0
          ? Math.min(0.2, timeSeconds - flyer.lastAnimationUpdateSeconds)
          : delta;
        flyer.lastAnimationUpdateSeconds = timeSeconds;
        flyer.mixer.timeScale = this.prefersReducedMotion
          ? CANONICAL_RENDER_CONFIG.motion.reducedMotionScale
          : flyer.kind === "butterfly" ? 1.35 : 1;
        flyer.mixer.update(flyerDelta);
      }
    }
  }

  private createFishPresentationMember(
    root: THREE.Group,
    assetId: AssetId,
    phase: number
  ): FishPresentationMember {
    const clips = (root.userData.animationClips as THREE.AnimationClip[] | undefined) ?? [];
    const mixer = clips.length > 0 ? new THREE.AnimationMixer(root) : null;
    const actions = new Map<FishAnimationClip, THREE.AnimationAction>();
    const clipSpecs = ASSET_BY_ID.get(assetId)?.animationClips ?? [];
    if (mixer) {
      for (const clipName of ["swim", "turn", "burst", "struggle"] as const) {
        const clip = clips.find((candidate) => candidate.name === clipName);
        if (!clip) continue;
        const action = mixer.clipAction(clip);
        const loops = clipSpecs.find((spec) => spec.name === clipName)?.loop ?? clipName !== "turn";
        action.setLoop(loops ? THREE.LoopRepeat : THREE.LoopOnce, loops ? Infinity : 1);
        action.clampWhenFinished = !loops;
        actions.set(clipName, action);
      }
    }
    const swim = actions.get("swim");
    if (swim) {
      swim.play();
      swim.time = phase * swim.getClip().duration;
    }
    return {
      root,
      phase,
      mixer,
      actions,
      activeClip: swim ? "swim" : null,
      tailPivot: root.getObjectByName(`${assetId}_tail_pivot`) ?? undefined
    };
  }

  private setFishAnimation(member: FishPresentationMember, clipName: FishAnimationClip): void {
    if (member.activeClip === clipName) return;
    const next = member.actions.get(clipName) ?? member.actions.get("swim");
    if (!next) return;
    const resolvedClip = next === member.actions.get("swim") ? "swim" : clipName;
    const previous = member.activeClip ? member.actions.get(member.activeClip) : undefined;
    previous?.fadeOut(0.1);
    next.reset().fadeIn(0.1).play();
    member.activeClip = resolvedClip;
  }

  private updateFishAnimation(
    member: FishPresentationMember,
    clipName: FishAnimationClip,
    delta: number,
    timeSeconds: number
  ): void {
    this.setFishAnimation(member, clipName);
    if (member.mixer) {
      member.mixer.timeScale = this.prefersReducedMotion
        ? CANONICAL_RENDER_CONFIG.motion.reducedMotionScale
        : 1;
    }
    member.mixer?.update(delta);
    if (!member.mixer && member.tailPivot) {
      member.tailPivot.rotation.y = Math.sin(timeSeconds * 8.5 + member.phase * Math.PI * 2)
        * 0.28
        * (this.prefersReducedMotion ? CANONICAL_RENDER_CONFIG.motion.reducedMotionScale : 1);
    }
  }

  /**
   * Update already-loaded meshes without awaiting loads.
   */
  private applyImmediateSync(
    sim: Simulation,
    timeSeconds: number,
    presentedPlayer: PresentedPlayerFrame | null = this.latestPresentedPlayer,
    boatPresentationInput: BoatPresentationInput | null = this.latestBoatPresentationInput
  ): void {
    const state = sim.getState();
    sampleWeatherMotionSignal(state.weather, timeSeconds, this.weatherMotion);
    if (presentedPlayer) this.latestPresentedPlayer = presentedPlayer;
    this.latestBoatPresentationInput = boatPresentationInput;
    const playerPose = presentedPlayer ?? {
      ...state.player,
      motion: stationaryPlayerMotion(state.player),
      discontinuityReason: "none" as const,
      discontinuitySequence: 0
    };
    this.visibilityAnchor.set(playerPose.x, playerPose.y, playerPose.z);

    const delta = this.lastPresentationTime > 0
      ? THREE.MathUtils.clamp(timeSeconds - this.lastPresentationTime, 0.001, 0.1)
      : 1 / 60;

    if (state.sportFishing) {
      sampleSportFishingPresentation(state.sportFishing, playerPose.x, playerPose.z, playerPose.rotationY,
        this.prefersReducedMotion ? CANONICAL_RENDER_CONFIG.motion.reducedMotionScale : 1,
        this.sportFishingPresentation);
    }
    const waterConditions = this.waterConditions(state);
    this.water.update(timeSeconds, waterConditions);
    this.shoreFoam.update(timeSeconds, waterConditions);
    this.boatWakes.update(timeSeconds);
    this.farmVfx.update(timeSeconds);
    if (this.cosmeticCropCarryUntilSeconds > 0 && timeSeconds >= this.cosmeticCropCarryUntilSeconds) {
      this.cosmeticCropCarryUntilSeconds = 0;
      const bundle = this.farmingProps.get("bundle");
      if (bundle) bundle.visible = false;
    }

    for (const [boatId, boatState] of Object.entries(state.boats)) {
      const bMesh = this.boatMeshes.get(boatId);
      if (!bMesh) continue;
      const presentation = this.sampleBoatPresentation(boatState, state, timeSeconds);
      bMesh.position.set(boatState.x, boatState.y + presentation.waveHeight, boatState.z);
      bMesh.rotation.set(presentation.pitch, boatState.headingRadians, presentation.roll, "YXZ");
      bMesh.updateMatrixWorld(true);
      this.updateBoatWake(boatId, boatState, timeSeconds, waterConditions);
    }
    this.syncSkiffMooringPreview(state, timeSeconds);
    this.updateDonkeyPresentation(state, playerPose, timeSeconds, delta);

    if (this.playerMesh) {
      const presentationMode = state.sportFishing

        ? "sport-fishing"
        : state.basicFishing
          ? "basic-fishing"
          : state.player.activeBoatId
            ? "boat-driving"
            : state.player.activeMountId
              ? "mounted"
              : "on-foot";
      const activeBoat = state.player.activeBoatId
        ? state.boats[state.player.activeBoatId]
        : undefined;
      const resolvedBoatInput = activeBoat
        ? boatPresentationInput && boatPresentationInput.boatId === activeBoat.id
          ? boatPresentationInput
          : {
              boatId: activeBoat.id,
              boatTypeId: activeBoat.boatTypeId,
              throttle: 0,
              steering: 0
            }
        : undefined;
      const motion = this.playerAnimation?.update(
        delta,
        {
          mode: presentationMode,
          motion: playerPose.motion,
          facingRadians: playerPose.rotationY,
          carrying: Boolean(state.player.carriedFishCargoId) || timeSeconds < this.cosmeticCropCarryUntilSeconds,
          fishingInput: state.sportFishing
            ? {
                isReeling: this.sportFishingPresentation.retrievalMetersPerSecond > 0.03,
                isSlacking: state.sportFishing.isSlacking,
                isBracing: state.sportFishing.isBracing,
                rodDirectionAngle: state.sportFishing.dynamics?.rodDirection ?? state.sportFishing.rodDirectionAngle,
                loadRatio: this.sportFishingPresentation.loadRatio,
                retrievalMetersPerSecond: this.sportFishingPresentation.retrievalMetersPerSecond
              }
            : undefined,
          boatInput: resolvedBoatInput
        },
        this.prefersReducedMotion
      ) ?? {
        bobY: 0,
        leanX: 0,
        leanZ: 0,
        groundPitch: 0,
        groundRoll: 0,
        leftFootOffsetY: 0,
        rightFootOffsetY: 0,
        clip: "idle" as const,
        events: []
      };
      this.playerAnimationEvents.push(...motion.events);
      if (presentationMode === "mounted") this.hideFarmingProps();
      else this.updateFarmingProps(motion.clip, timeSeconds);
      const boatPresentation = activeBoat
        ? this.sampleBoatPresentation(activeBoat, state, timeSeconds)
        : null;
      const driverSeat = activeBoat ? this.boatDriverSeats.get(activeBoat.id) : undefined;
      const attachedToDonkey = state.player.activeMountId !== null
        && this.donkeyPresentation?.attachedMountId === state.player.activeMountId;
      if (attachedToDonkey) {
        this.playerMesh.position.set(0, DONKEY_RIDER_ROOT_OFFSET_Y, 0);
        this.playerMesh.rotation.set(motion.leanX, 0, motion.leanZ, "YXZ");
      } else if (driverSeat) {
        driverSeat.getWorldPosition(this.tempBoatSeatVec);
        this.playerMesh.position.set(
          this.tempBoatSeatVec.x,
          this.tempBoatSeatVec.y + motion.bobY,
          this.tempBoatSeatVec.z
        );
      } else {
        this.playerMesh.position.set(
          playerPose.x,
          playerPose.y - 0.5 + (boatPresentation?.waveHeight ?? 0) + motion.bobY,
          playerPose.z
        );
      }
      if (!attachedToDonkey) {
        this.playerMesh.rotation.set(
          motion.leanX + motion.groundPitch + (boatPresentation?.pitch ?? 0),
          state.sportFishing
            ? Math.atan2(this.sportFishingPresentation.endpointX - playerPose.x,
                this.sportFishingPresentation.endpointZ - playerPose.z)
            : playerPose.rotationY,
          motion.leanZ + motion.groundRoll + (boatPresentation?.roll ?? 0),
          "YXZ"
        );
      }
      this.playerMesh.updateMatrixWorld(true);
      const holdingOars = presentationMode === "boat-driving"
        && activeBoat?.boatTypeId === "boat.rowboat";
      this.syncRowboatOarOwnership(activeBoat?.id ?? null, holdingOars);
      if (holdingOars && activeBoat && motion.events.some((event) => event.name === "paddle_enter")) {
        this.spawnPaddleDisturbance(activeBoat, state, timeSeconds);
      }
      this.lastPresentationTime = timeSeconds;
      if (this.playerContactShadow) {
        this.playerContactShadow.visible = !state.player.activeBoatId && !state.player.activeMountId;
        this.playerContactShadow.position.set(
          playerPose.x,
          WorldLayout.terrainHeight(playerPose.x, playerPose.z) + 0.025,
          playerPose.z
        );
      }
    }

    this.cropInstances.sync(state, timeSeconds, this.weatherMotion);

    // Despawn school VFX whose school is gone
    for (const [schoolId, sGroup] of this.schoolEffects.entries()) {
      if (!state.world.activeSchools[schoolId]) {
        this.disposeSchoolEffect(sGroup);
        this.schoolEffects.delete(schoolId);
      }
    }
    for (const [schoolId, school] of Object.entries(state.world.activeSchools)) {
      const sGroup = this.schoolEffects.get(schoolId);
      if (!sGroup) continue;
      const dx = playerPose.x - school.x;
      const dz = playerPose.z - school.z;
      const nearEnoughForFullRate = dx * dx + dz * dz < 58 * 58;
      const lastMotionUpdate = (sGroup.userData.lastMotionUpdateSeconds as number | undefined) ?? 0;
      const updateInterval = nearEnoughForFullRate ? 0 : 0.24;
      if (!sGroup.visible || timeSeconds - lastMotionUpdate < updateInterval) continue;
      const schoolDelta = THREE.MathUtils.clamp(timeSeconds - lastMotionUpdate, 0, 0.25);
      sGroup.userData.lastMotionUpdateSeconds = timeSeconds;
      sGroup.position.set(school.x, 0.05, school.z);
      sGroup.rotation.y = timeSeconds * 0.8;
      const frenzy = (school.feedingFrenzyUntilMinute ?? -1) > state.clock.currentMinute;
      const pulseScale = 1 + Math.sin(timeSeconds * (frenzy ? 5.8 : 3)) * (frenzy ? 0.22 : 0.12);
      sGroup.scale.set(pulseScale, 1, pulseScale);
      const fishMembers = sGroup.userData.fishMembers as FishPresentationMember[] | undefined;
      fishMembers?.forEach((member, index) => {
        const fish = member.root;
        const orbit = timeSeconds * (0.42 + index * 0.04) + index * (Math.PI * 2 / fishMembers.length);
        const radius = 1.2 + index * 0.42;
        const turnWindow = (timeSeconds + member.phase * 5.3) % 7.5 < 0.42;
        this.updateFishAnimation(
          member,
          frenzy ? "burst" : turnWindow ? "turn" : "swim",
          schoolDelta,
          timeSeconds
        );
        fish.position.set(
          Math.cos(orbit) * radius,
          -0.12 + Math.sin(timeSeconds * (frenzy ? 3.2 : 1.8) + index) * (frenzy ? 0.14 : 0.08),
          Math.sin(orbit) * radius
        );
        fish.rotation.y = -orbit + Math.PI * 0.5;
        fish.rotation.z = Math.sin(timeSeconds * 2.2 + member.phase * Math.PI * 2) * 0.055;
      });
    }

    // NPC positions remain content anchored. Dialogue only adds a presentation
    // turn and authored gesture; closing it restores the catalog heading.
    // Station beats stay inside 1.2 m of the anchor so talk radius is unchanged.
    for (const npc of this.npcPresentations.values()) {
      if (this.layoutEditLockedObject === npc.model) continue;
      const dx = playerPose.x - npc.anchor.x;
      const dz = playerPose.z - npc.anchor.z;
      const distSq = dx * dx + dz * dz;
      const isDialogueTarget = npc.id === this.activeDialogueNpcId;
      npc.model.visible = isDialogueTarget || distSq <= 160 * 160;
      if (!npc.model.visible) continue;
      const interval = isDialogueTarget || distSq <= 40 * 40
        ? 0
        : distSq <= 90 * 90 ? 1 / 12 : 0.4;
      if (timeSeconds - npc.lastAnimationUpdateSeconds < interval) continue;
      const npcDelta = npc.lastAnimationUpdateSeconds > 0
        ? Math.min(0.4, timeSeconds - npc.lastAnimationUpdateSeconds)
        : delta;
      npc.lastAnimationUpdateSeconds = timeSeconds;
      const beat = NPC_STATION_BEATS[npc.id];
      const beatSample = !isDialogueTarget && beat
        ? sampleNpcStationBeat(beat, timeSeconds)
        : { dx: 0, dz: 0, heading: npc.initialRotationY, walking: false };
      const worldX = npc.anchor.x + beatSample.dx;
      const worldZ = npc.anchor.z + beatSample.dz;
      npc.model.position.set(worldX, WorldLayout.terrainHeight(worldX, worldZ), worldZ);
      const playerHeading = Math.atan2(dx, dz);
      const desiredHeading = isDialogueTarget
        ? playerHeading
        : beatSample.walking
          ? beatSample.heading
          : npc.initialRotationY;
      const turnDifference = wrapPresentationAngle(desiredHeading - npc.model.rotation.y);
      npc.model.rotation.y = dampPresentationAngle(
        npc.model.rotation.y,
        desiredHeading,
        isDialogueTarget ? 9.5 : beatSample.walking ? 8.2 : 5.5,
        npcDelta
      );
      const walkSpeed = beatSample.walking ? (beat?.walkSpeedMetersPerSecond ?? 1.45) : 0;
      npc.animator.update(
        npcDelta,
        {
          mode: "on-foot",
          carrying: false,
          talking: isDialogueTarget,
          facingRadians: npc.model.rotation.y,
          motion: npcPresentationMotion({
            speedMetersPerSecond: walkSpeed,
            turnRateRadiansPerSecond: isDialogueTarget ? 0 : turnDifference / Math.max(npcDelta, 1 / 60),
            requestedGait: beatSample.walking ? "walk" : "idle"
          })
        },
        this.prefersReducedMotion
      );
      if (npc.headBone) {
        if (isDialogueTarget || distSq < 20.0) {
          const angleDiff = wrapPresentationAngle(playerHeading - npc.model.rotation.y);
          const clampedTurn = Math.max(-0.75, Math.min(0.75, angleDiff));
          npc.headBone.rotation.y = THREE.MathUtils.damp(npc.headBone.rotation.y, clampedTurn, 10, npcDelta);
        } else {
          npc.headBone.rotation.y = THREE.MathUtils.damp(npc.headBone.rotation.y, 0, 7, npcDelta);
        }
      }
    }

    this.updateFishingPresentation(state, playerPose, timeSeconds);
  }


  private buildFishingPresentation(): void {
    this.fishingBobberGroup = new THREE.Group();
    this.fishingBobberGroup.name = "fishing_bobber_rig";
    this.fishingBobberBody = new THREE.Group();
    this.fishingBobberBody.name = "fishing_bobber_body";
    this.fishingBobberGroup.add(this.fishingBobberBody);

    // Top half of bobber (faceted red)
    const topGeo = new THREE.CylinderGeometry(0.01, 0.08, 0.10, 6);
    topGeo.translate(0, 0.05, 0);
    const topMat = PaletteMaterials.standard("accent_red_01", { roughness: 0.5, flatShading: true });
    const topMesh = new THREE.Mesh(topGeo, topMat);
    topMesh.name = "fishing_bobber_top";
    topMesh.castShadow = true;
    this.fishingBobberBody.add(topMesh);

    // Bottom half of bobber (faceted white/foam)
    const botGeo = new THREE.CylinderGeometry(0.08, 0.02, 0.09, 6);
    botGeo.translate(0, -0.045, 0);
    const botMat = PaletteMaterials.standard("foam_warm_01", { roughness: 0.6, flatShading: true });
    const botMesh = new THREE.Mesh(botGeo, botMat);
    botMesh.name = "fishing_bobber_bottom";
    botMesh.castShadow = true;
    this.fishingBobberBody.add(botMesh);

    // Antenna tip
    const tipGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.06, 4);
    tipGeo.translate(0, 0.12, 0);
    const tipMat = PaletteMaterials.standard("metal_dark_01", { roughness: 0.4, flatShading: true });
    const tipMesh = new THREE.Mesh(tipGeo, tipMat);
    tipMesh.name = "fishing_bobber_tip";
    this.fishingBobberBody.add(tipMesh);

    // Water Ripple Ring
    const ringGeo = new THREE.RingGeometry(0.14, 0.32, 12);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = PaletteMaterials.standard("foam_warm_01", {
      transparent: true,
      opacity: 0.65,
      roughness: 0.4
    });
    this.fishingBobberRipple = new THREE.Mesh(ringGeo, ringMat);
    this.fishingBobberRipple.position.y = 0.01;
    this.fishingBobberGroup.add(this.fishingBobberRipple);

    this.fishingBobberGroup.visible = false;
    this.scene.add(this.fishingBobberGroup);

    // Fishing line
    const linePoints: THREE.Vector3[] = [];
    for (let i = 0; i <= 10; i++) {
      linePoints.push(new THREE.Vector3(0, 0, 0));
    }
    const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
    const lineMat = new THREE.LineBasicMaterial({
      color: PALETTE_HEX.foam_warm_01,
      transparent: true,
      opacity: 0.85
    });
    this.fishingLineMesh = new THREE.Line(lineGeo, lineMat);
    this.fishingLineMesh.frustumCulled = false;
    this.fishingLineMesh.visible = false;
    this.scene.add(this.fishingLineMesh);
  }

  private updateFishingPresentation(
    state: Readonly<GameState>,
    playerPose: { x: number; y: number; z: number; rotationY: number },
    timeSeconds: number
  ): void {
    const basic = state.basicFishing;
    const sport = state.sportFishing;
    const rodProp = this.farmingProps.get("rod");
    const rodBaseQuaternion = rodProp?.userData.socketBaseQuaternion as THREE.Quaternion | undefined;
    if (rodProp && rodBaseQuaternion) rodProp.quaternion.copy(rodBaseQuaternion);

    if (!sport) this.fishingRodBend?.update(0, this.fishingEndpointWorld);

    if (!basic && !sport) {
      this.fishingBobberGroup.visible = false;
      if (this.fishingLineMesh) this.fishingLineMesh.visible = false;
      if (this.hookedFishModel) this.hookedFishModel.visible = false;
      this.lastBasicFishingPhase = null;
      this.sportFishingCameraHint = null;
      this.lastFishingInstanceId = null;
      return;
    }

    if (!sport) {
      this.sportFishingCameraHint = null;
      this.lastFishingInstanceId = null;
    }

    const angle = playerPose.rotationY;
    const forwardX = Math.sin(angle);
    const forwardZ = Math.cos(angle);
    const rightX = Math.cos(angle);
    const rightZ = -Math.sin(angle);
    let endpointX = playerPose.x;
    let endpointZ = playerPose.z;
    let endpointY = playerPose.y;
    let lineSag = 0.2;
    let lineCurve = 0;
    let surfaceStrength = 0.22;
    let lineVisible = true;

    if (basic) {
      if (this.lastBasicFishingPhase === "charging-cast" && basic.phase !== "charging-cast") {
        this.basicCastReleaseAtSeconds = timeSeconds;
      }
      if (this.lastBasicFishingPhase === "bite-reaction" && basic.phase === "minigame") {
        this.basicHookSetAtSeconds = timeSeconds;
      }
      this.lastBasicFishingPhase = basic.phase;
      const castDistance = basic.castDistanceMeters ?? 6.5;
      const targetX = playerPose.x + forwardX * castDistance;
      const targetZ = playerPose.z + forwardZ * castDistance;
      const targetWaterY = this.water.sample(targetX, targetZ, timeSeconds).height;
      const sinceRelease = timeSeconds - this.basicCastReleaseAtSeconds;
      const flightProgress = Number.isFinite(sinceRelease)
        ? THREE.MathUtils.smoothstep(sinceRelease, 0, 0.44)
        : 1;
      endpointX = THREE.MathUtils.lerp(playerPose.x + forwardX * 1.15, targetX, flightProgress);
      endpointZ = THREE.MathUtils.lerp(playerPose.z + forwardZ * 1.15, targetZ, flightProgress);
      endpointY = THREE.MathUtils.lerp(playerPose.y + 0.85, targetWaterY, flightProgress)
        + Math.sin(flightProgress * Math.PI) * castDistance * 0.055;
      lineVisible = basic.phase !== "charging-cast";
      this.fishingBobberBody.visible = true;
      if (basic.phase === "charging-cast") {
        endpointY = playerPose.y + 0.8;
        surfaceStrength = 0;
      } else if (basic.phase === "bite-reaction" || (basic.phase as string) === "bite") {
        endpointY = targetWaterY - 0.12 + Math.sin(timeSeconds * 25) * 0.05;
        surfaceStrength = 0.9;
        lineSag = 0.08;
      } else if (basic.phase === "minigame") {
        const fishPull = ((basic.fishY ?? 0.5) - 0.5) * 0.12;
        endpointX += rightX * fishPull;
        endpointZ += rightZ * fishPull;
        const hookImpulse = 1 - THREE.MathUtils.smoothstep(
          timeSeconds - this.basicHookSetAtSeconds,
          0,
          0.24
        );
        endpointY = targetWaterY - hookImpulse * 0.14 + Math.sin(timeSeconds * 8) * 0.018;
        lineSag = THREE.MathUtils.lerp(0.12, 0.055, basic.catchProgress ?? 0.3);
        surfaceStrength = 0.42 + hookImpulse * 0.45;
        if (rodProp) rodProp.rotateX(-(0.08 + (basic.isHolding ? 0.08 : 0)));
      } else if (flightProgress >= 1) {
        endpointY = targetWaterY + Math.sin(timeSeconds * 3.5) * 0.025;
      }
      if (this.hookedFishModel) this.hookedFishModel.visible = false;
    } else if (sport) {
      this.lastBasicFishingPhase = null;
      const presentation = this.sportFishingPresentation;
      endpointX = presentation.endpointX;
      endpointZ = presentation.endpointZ;
      endpointY = this.water.sample(endpointX, endpointZ, timeSeconds).height - presentation.depthMeters;
      this.sportFishingCameraHint = {
        lookHint: { x: endpointX, y: endpointY, z: endpointZ },
        fightReachMeters: sport.distanceMeters,
        lineTension: sport.lineTension,
        snapTimerSeconds: sport.snapTimerSeconds,
        fightBehavior: sport.behavior
      };
      lineSag = presentation.lineSagMeters;
      lineCurve = presentation.rodTwistRadians * Math.min(4, sport.distanceMeters * 0.18);
      surfaceStrength = presentation.surfaceStrength;
      this.fishingBobberBody.visible = false;
      this.fishingEndpointWorld.set(endpointX, endpointY, endpointZ);
      this.fishingRodBend?.update(presentation.rodBendRadians, this.fishingEndpointWorld,
        presentation.retrievalMetersPerSecond, presentation.elapsedSeconds);
      if (this.fishingRodBend && this.playerAnimation) {
        this.fishingRodBend.getGripWorld(this.tempRodTipVec);
        this.playerAnimation.alignFishingGrip(this.tempRodTipVec);
      }
      if (this.hookedFishPresentation) {
        const fishClip: FishAnimationClip = sport.behavior === "burst"
          ? "burst"
          : sport.behavior === "run-left" || sport.behavior === "run-right"
            ? "turn"
            : sport.behavior === "rest"
              ? "swim"
              : "struggle";
        this.updateFishAnimation(
          this.hookedFishPresentation,
          fishClip,
          THREE.MathUtils.clamp(sport.elapsedSeconds - this.lastHookedFishUpdateSeconds, 0, 0.1),
          sport.elapsedSeconds
        );
        this.lastHookedFishUpdateSeconds = sport.elapsedSeconds;
      }
      if (this.hookedFishModel) {
        this.hookedFishModel.visible = true;
        this.hookedFishModel.position.set(endpointX, endpointY, endpointZ);
        this.hookedFishModel.scale.setScalar(0.82 * presentation.fishScale);
        this.hookedFishModel.rotation.set(
          presentation.fishPitchRadians,
          presentation.fishYawRadians,
          presentation.fishRollRadians,
          "YXZ"
        );
      }
    }

    const waterHeight = this.water.sample(endpointX, endpointZ, timeSeconds).height;
    if (sport) {
      const presentation = this.sportFishingPresentation;
      const sameFish = this.lastFishingInstanceId === sport.fish.instanceId;
      const crossed = sameFish && presentation.surfaceCrossings !== this.lastFishingSurfaceCrossings;
      const nearSurface = Math.abs(presentation.depthMeters) < 0.3;
      const advanced = sport.elapsedSeconds > this.lastFishingSampleElapsed;
      if ((crossed || (advanced && nearSurface && surfaceStrength > 0.45))
        && timeSeconds - this.lastSportFishingSplashAtSeconds >= (crossed ? 0.12 : 0.65)) {
        this.farmVfx.spawn("water", { x: endpointX, y: waterHeight + 0.016, z: endpointZ }, timeSeconds,
          { origin: { x: endpointX, y: waterHeight + 0.2, z: endpointZ }, reducedMotion: this.prefersReducedMotion });
        this.lastSportFishingSplashAtSeconds = timeSeconds;
      }
      this.lastFishingInstanceId = sport.fish.instanceId;
      this.lastFishingSurfaceCrossings = presentation.surfaceCrossings;
      this.lastFishingSampleElapsed = sport.elapsedSeconds;
    }

    this.fishingBobberGroup.position.set(endpointX, basic ? endpointY : waterHeight + 0.012, endpointZ);
    this.fishingBobberGroup.visible = lineVisible;
    if (this.fishingBobberRipple) {
      const secondaryScale = this.prefersReducedMotion
        ? CANONICAL_RENDER_CONFIG.motion.reducedMotionScale
        : 1;
      const pulse = 0.7 + surfaceStrength * 0.65
        + Math.sin(timeSeconds * (3 + surfaceStrength * 8)) * 0.12 * secondaryScale;
      this.fishingBobberRipple.scale.set(pulse, 1, pulse);
      (this.fishingBobberRipple.material as THREE.MeshStandardMaterial).opacity =
        THREE.MathUtils.lerp(0.28, 0.88, surfaceStrength);
      this.fishingBobberRipple.visible = surfaceStrength > 0.01;
    }

    if (!this.fishingLineMesh) return;
    const lineMaterial = this.fishingLineMesh.material as THREE.LineBasicMaterial;
    if (sport) {
      const tensionRatio = THREE.MathUtils.clamp(sport.lineTension / 100, 0, 1);
      lineMaterial.opacity = THREE.MathUtils.lerp(0.62, 0.96, tensionRatio);
      lineMaterial.linewidth = THREE.MathUtils.lerp(1.15, 1.85, tensionRatio);
    } else {
      lineMaterial.opacity = 0.85;
      lineMaterial.linewidth = 1;
    }
    if (sport && this.hookedFishModel && this.fishingMouthNode) {
      this.hookedFishModel.updateMatrixWorld(true);
      this.fishingMouthNode.localToWorld(this.fishingEndpointWorld.copy(this.fishingMouthLocal));
      endpointX = this.fishingEndpointWorld.x;
      endpointY = this.fishingEndpointWorld.y;
      endpointZ = this.fishingEndpointWorld.z;
    }
    let rodTipX = playerPose.x + forwardX * 1.6 + rightX * 0.3;
    let rodTipY = playerPose.y + 0.95;
    let rodTipZ = playerPose.z + forwardZ * 1.6 + rightZ * 0.3;
    if (rodProp && this.playerMesh) {
      this.playerMesh.updateMatrixWorld(true);
      const tipObj = rodProp.getObjectByName("rod_guide_tiptop")
        ?? rodProp.getObjectByName("rod_tiptop_sleeve");
      if (tipObj) {
        if (sport && this.fishingRodBend) this.fishingRodBend.getTipWorld(this.tempRodTipVec);
        else tipObj.getWorldPosition(this.tempRodTipVec);
        rodTipX = this.tempRodTipVec.x;
        rodTipY = this.tempRodTipVec.y;
        rodTipZ = this.tempRodTipVec.z;
      }
    }

    const positions = this.fishingLineMesh.geometry.attributes.position;
    const pointCount = positions.count - 1;
    const lineEndY = basic ? endpointY + 0.12 : endpointY;
    const dangerVibration = sport
      ? THREE.MathUtils.clamp((sport.lineTension - 78) / 22, 0, 1)
        * 0.025
        * (this.prefersReducedMotion ? CANONICAL_RENDER_CONFIG.motion.reducedMotionScale : 1)
      : 0;
    for (let index = 0; index <= pointCount; index += 1) {
      const t = index / pointCount;
      const curve = Math.sin(t * Math.PI);
      const vibration = sport
        ? Math.sin(sport.elapsedSeconds * 34 + t * 15) * dangerVibration * curve
        : 0;
      const x = THREE.MathUtils.lerp(rodTipX, endpointX, t) + rightX * (lineCurve * curve + vibration);
      const z = THREE.MathUtils.lerp(rodTipZ, endpointZ, t) + rightZ * (lineCurve * curve + vibration);
      const y = THREE.MathUtils.lerp(rodTipY, lineEndY, t) - curve * lineSag;
      positions.setXYZ(index, x, y, z);
    }
    positions.needsUpdate = true;
    this.fishingLineMesh.visible = lineVisible;
  }

  private sampleBoatPresentation(
    boat: GameState["boats"][string],
    _state: Readonly<GameState>,
    timeSeconds: number
  ): { waveHeight: number; pitch: number; roll: number } {
    let presentation = this.boatBuoyancyState.get(boat.id);
    if (!presentation) {
      presentation = {
        waveHeight: 0,
        pitch: 0,
        roll: 0,
        lastSampleTimeSeconds: timeSeconds,
        initialized: false
      };
      this.boatBuoyancyState.set(boat.id, presentation);
    } else if (Math.abs(presentation.lastSampleTimeSeconds - timeSeconds) <= 0.000001) {
      return presentation;
    }

    const footprint = boatBuoyancyFootprint(boat.boatTypeId);
    const sinHeading = Math.sin(boat.headingRadians);
    const cosHeading = Math.cos(boat.headingRadians);
    const sampleHeight = (localX: number, localZ: number): number => this.water.sample(
      boat.x + localX * cosHeading + localZ * sinHeading,
      boat.z - localX * sinHeading + localZ * cosHeading,
      timeSeconds
    ).height;
    const bowHeight = sampleHeight(0, footprint.halfLength);
    const sternHeight = sampleHeight(0, -footprint.halfLength);
    const portHeight = sampleHeight(-footprint.halfBeam, 0);
    const starboardHeight = sampleHeight(footprint.halfBeam, 0);
    const targetWaveHeight = (bowHeight + sternHeight + portHeight + starboardHeight) * 0.25;
    const tiltScale = this.prefersReducedMotion
      ? CANONICAL_RENDER_CONFIG.motion.reducedMotionScale
      : 1;
    const maximumTilt = boat.boatTypeId === "boat.skiff"
      ? THREE.MathUtils.degToRad(10)
      : THREE.MathUtils.degToRad(12);
    const targetPitch = THREE.MathUtils.clamp(
      Math.atan2(sternHeight - bowHeight, footprint.halfLength * 2) * tiltScale,
      -maximumTilt,
      maximumTilt
    );
    const targetRoll = THREE.MathUtils.clamp(
      Math.atan2(starboardHeight - portHeight, footprint.halfBeam * 2) * tiltScale,
      -maximumTilt,
      maximumTilt
    );
    const dt = THREE.MathUtils.clamp(
      timeSeconds - presentation.lastSampleTimeSeconds,
      0,
      0.1
    );
    const smoothing = presentation.initialized ? 1 - Math.exp(-8 * dt) : 1;
    presentation.waveHeight = THREE.MathUtils.lerp(
      presentation.waveHeight,
      targetWaveHeight,
      smoothing
    );
    presentation.pitch = THREE.MathUtils.lerp(presentation.pitch, targetPitch, smoothing);
    presentation.roll = THREE.MathUtils.lerp(presentation.roll, targetRoll, smoothing);
    presentation.lastSampleTimeSeconds = timeSeconds;
    presentation.initialized = true;
    return presentation;
  }

  private updateBoatWake(
    boatId: string,
    boat: GameState["boats"][string],
    timeSeconds: number,
    conditions: WaterConditions
  ): void {
    const previous = this.wakeEmitState.get(boatId);
    const distance = previous ? Math.hypot(boat.x - previous.x, boat.z - previous.z) : 0;
    const interval = this.prefersReducedMotion ? 0.42 : 0.18;
    if (
      Math.abs(boat.speed) >= 0.45 &&
      (!previous || (distance >= 0.42 && timeSeconds - previous.timeSeconds >= interval))
    ) {
      const direction = boat.speed >= 0 ? 1 : -1;
      const wakeX = boat.x - Math.sin(boat.headingRadians) * 1.55 * direction;
      const wakeZ = boat.z - Math.cos(boat.headingRadians) * 1.55 * direction;
      this.boatWakes.spawn(
        wakeX,
        wakeZ,
        boat.headingRadians,
        boat.speed,
        timeSeconds,
        conditions
      );
      this.wakeEmitState.set(boatId, { x: boat.x, z: boat.z, timeSeconds });
    } else if (!previous) {
      this.wakeEmitState.set(boatId, { x: boat.x, z: boat.z, timeSeconds });
    }
  }

  private async loadMissingMeshes(sim: Simulation, timeSeconds: number): Promise<void> {
    const state = sim.getState();
    let loadedNewMesh = false;

    if (!this.playerMesh) {
      const mesh = await AssetLoader.loadModel(ASSET_IDS.CHAR_PLAYER_A);
      if (!this.playerMesh) {
        this.setShadowPolicy(mesh, CANONICAL_RENDER_CONFIG.shadows.castPlayer);
        this.attachCharacterShadowProxy(mesh);
        this.batchPlayerRigidMeshes(mesh);
        this.playerMesh = mesh;
        this.playerAnimation = new HumanoidAnimator(mesh);
        this.scene.add(this.playerMesh);
        loadedNewMesh = true;
        await this.attachFarmingProps(mesh);
      }
    }
    for (const [boatId, boatState] of Object.entries(state.boats)) {
      let bMesh = this.boatMeshes.get(boatId);
      if (!bMesh) {
        const assetId = boatAssetId(boatState.boatTypeId);
        bMesh = await AssetLoader.loadModel(assetId);
        if (!this.boatMeshes.has(boatId)) {
          this.batchCompatibleMeshes(bMesh, (object) => {
            let current: THREE.Object3D | null = object;
            while (current && current !== bMesh) {
              if (
                current.name.startsWith("boat_rowboat_oar_")
                || current.name.startsWith("rowboat_oar_")
                || current.name.startsWith("boat_rowboat_oarlock_")
              ) return true;
              current = current.parent;
            }
            return false;
          });
          this.scene.add(bMesh);
          this.boatMeshes.set(boatId, bMesh);
          loadedNewMesh = true;
          if (boatState.boatTypeId === "boat.rowboat") {
            this.configureRowboatPresentation(boatId, bMesh);
          } else if (boatState.boatTypeId === "boat.skiff") {
            this.configureSkiffPresentation(boatId, bMesh);
          }
        }
      }
    }

    await this.ensureSkiffMooringPreview(state);

    await this.cropInstances.ensureAssets(state);

    const sportFishAssetId = state.sportFishing
      ? fishSpeciesAsset(state.sportFishing.fish.speciesId)
      : null;
    if (this.hookedFishAssetId !== sportFishAssetId) {
      this.hookedFishModel?.removeFromParent();
      this.hookedFishModel = null;
      this.hookedFishAssetId = null;
      this.hookedFishPresentation = null;
      this.lastHookedFishUpdateSeconds = 0;
    }
    if (sportFishAssetId && !this.hookedFishModel) {
      const hookedFish = await AssetLoader.loadModel(sportFishAssetId);
      const currentSpeciesId = sim.getState().sportFishing?.fish.speciesId;
      if (fishSpeciesAsset(currentSpeciesId ?? "") === sportFishAssetId && !this.hookedFishModel) {
        hookedFish.name = "hooked_fish_presentation";
        hookedFish.userData.dynamicPresentation = true;
        hookedFish.scale.setScalar(0.82);
        this.setShadowPolicy(hookedFish, false);
        this.scene.add(hookedFish);
        this.hookedFishModel = hookedFish;
        loadedNewMesh = true;
        const speciesKey = currentSpeciesId?.replace("fish.", "");
        const body = hookedFish.getObjectByName(`${speciesKey}_body`) ?? hookedFish;
        const bodyBounds = new THREE.Box3().setFromObject(body);
        bodyBounds.getCenter(this.fishingMouthLocal);
        this.fishingMouthLocal.z = bodyBounds.max.z;
        this.fishingMouthNode = body;
        body.worldToLocal(this.fishingMouthLocal);
        this.hookedFishAssetId = sportFishAssetId;
        this.hookedFishPresentation = this.createFishPresentationMember(
          hookedFish,
          sportFishAssetId,
          stablePresentationPhase(`hooked:${currentSpeciesId}`)
        );
        this.lastHookedFishUpdateSeconds = sim.getState().sportFishing?.elapsedSeconds ?? 0;
      }
    }

    for (const [schoolId, school] of Object.entries(state.world.activeSchools)) {
      if (this.schoolEffects.has(schoolId)) continue;
      const sGroup = new THREE.Group();
      const ringGeo = new THREE.RingGeometry(1.5, 3.5, 8);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = PaletteMaterials.standard("foam_warm_01", { transparent: true, opacity: 0.65 });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.name = "school_ripple";
      sGroup.add(ringMesh);
      try {
        const fishAssetId = fishSchoolAsset(school);
        if (fishAssetId) {
          const fishMembers: FishPresentationMember[] = [];
          for (let index = 0; index < 3; index++) {
            const fish = await AssetLoader.loadModel(fishAssetId);
            fish.scale.setScalar(0.55);
            fish.userData.dynamicPresentation = true;
            this.setShadowPolicy(fish, false);
            sGroup.add(fish);
            fishMembers.push(this.createFishPresentationMember(
              fish,
              fishAssetId,
              stablePresentationPhase(`${schoolId}:${index}`)
            ));
          }
          sGroup.userData.fishMembers = fishMembers;
        }
        if (!sim.getState().world.activeSchools[schoolId]) {
          this.disposeSchoolEffect(sGroup);
          continue;
        }
        this.scene.add(sGroup);
        this.schoolEffects.set(schoolId, sGroup);
        loadedNewMesh = true;
        sGroup.position.set(school.x, 0.05, school.z);
      } catch (error) {
        this.disposeSchoolEffect(sGroup);
        console.warn(`[WorldScene] Failed to load fish school ${schoolId}:`, error);
      }
    }

    if (loadedNewMesh) {
      this.runtimeLodsDirty = true;
      this.distanceVisibilityDirty = true;
    }
    // Newly loaded meshes use the same presentation path as every later frame.
    this.applyImmediateSync(sim, timeSeconds, this.latestPresentedPlayer);
  }

  /**
   * Synchronizes visual scene with authoritative Simulation state.
   */
  public async syncWithSimulation(
    sim: Simulation,
    timeSeconds: number,
    presentedPlayer?: PresentedPlayerFrame,
    boatPresentationInput: BoatPresentationInput | null = null
  ): Promise<void> {
    this.applyImmediateSync(sim, timeSeconds, presentedPlayer ?? null, boatPresentationInput);

    if (this.syncInFlight) return;
    this.syncInFlight = true;
    try {
      await this.loadMissingMeshes(sim, timeSeconds);
    } finally {
      this.syncInFlight = false;
    }
  }

  public render(camera: THREE.Camera): void {
    this.updateDistanceManagedPresentation();
    this.groundCover.update(this.visibilityAnchor.x, this.visibilityAnchor.z);
    this.rendererPipeline.render(camera);
  }

  public renderObjectStats(): { visibleMeshes: number; shadowCasters: number; batchedMeshes: number; instancedMeshes: number } {
    let visibleMeshes = 0;
    let shadowCasters = 0;
    let batchedMeshes = 0;
    let instancedMeshes = 0;
    this.scene.traverseVisible((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (object instanceof THREE.InstancedMesh && object.count === 0) return;
      visibleMeshes += 1;
      if (object.castShadow) shadowCasters += 1;
      if (object instanceof THREE.BatchedMesh) batchedMeshes += 1;
      if (object instanceof THREE.InstancedMesh) instancedMeshes += 1;
    });
    return { visibleMeshes, shadowCasters, batchedMeshes, instancedMeshes };
  }

  public handleResize(width: number, height: number): void {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.lightingRig.pixelRatioCap()));
    this.renderer.setSize(width, height);
    this.rendererPipeline.resize(width, height);
  }

  public setQuality(tier: QualityTier): void {
    this.qualityTier = tier;
    this.lightingRig.setQuality(tier);
    this.rendererPipeline.setQuality(tier);
    this.applyPracticalLightBudget();
    this.groundCover.setQuality(tier);
    this.rainField.setQuality(tier);
    this.distanceVisibilityDirty = true;
    this.playerContactShadow?.removeFromParent();
    this.playerContactShadow?.geometry.dispose();
    (this.playerContactShadow?.material as THREE.Material | undefined)?.dispose();
    this.playerContactShadow = null;
    this.buildPlayerContactShadow();
    this.handleResize(window.innerWidth, window.innerHeight);
  }

  /**
   * Releases GPU resources owned by this scene. Catalog GLB clones share
   * geometry with AssetLoader and are only detached, not disposed.
   */
  public dispose(): void {
    this.detachPlayerFromDonkey();
    this.donkeyPresentation?.mixer?.stopAllAction();
    if (this.donkeyPresentation) this.disposeDonkeyShadowPresentation(this.donkeyPresentation.root);
    this.donkeyPresentation = null;
    this.fishingRodBend?.dispose();
    this.fishingRodBend = null;
    this.cropInstances.dispose();
    this.groundCover.dispose();
    this.farmVfx.dispose();
    this.farmVfx.group.removeFromParent();
    this.rainField.dispose();
    this.rainField.group.removeFromParent();
    this.disposeBatchedMeshes();
    this.water.dispose();
    this.water.mesh.removeFromParent();
    this.shoreFoam.dispose();
    this.shoreFoam.mesh.removeFromParent();
    this.boatWakes.dispose();
    this.boatWakes.group.removeFromParent();
    this.rendererPipeline.dispose();
    this.terrainSurfaceMaterial.dispose();
    this.roadSurfaceMaterial.dispose();
    this.cultivatedSurfaceMaterial.dispose();

    for (const group of this.schoolEffects.values()) {
      this.disposeSchoolEffect(group);
    }
    this.schoolEffects.clear();
    this.cloudMeshes.length = 0;
    this.hookedFishModel?.removeFromParent();
    this.hookedFishModel = null;
    this.hookedFishAssetId = null;
    this.hookedFishPresentation = null;
    this.skiffMooringPreview?.removeFromParent();
    this.skiffMooringPreview = null;

    if (this.terrainMesh) {
      this.terrainMesh.removeFromParent();
      this.terrainMesh.geometry.dispose();
      this.terrainMesh = null;
    }
    disposeNamedGeneratedMesh(this.environmentGroup, "world_path_overlay");
    const farmGround = this.environmentGroup.getObjectByName("starter_farm_cultivated_ground");
    if (farmGround) {
      farmGround.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
      farmGround.removeFromParent();
    }
    disposeNamedGeneratedMesh(this.environmentGroup, "farm_harbor_path_accents");
    disposeNamedGeneratedMesh(this.environmentGroup, "static_contact_grounding");

    this.placementPreview.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
      }
    });
    this.placementPreview.removeFromParent();
    this.interactionFeedback.geometry.dispose();
    (this.interactionFeedback.material as THREE.Material).dispose();
    this.interactionFeedback.removeFromParent();
    this.questWaypointRing.geometry.dispose();
    (this.questWaypointRing.material as THREE.Material).dispose();
    this.questWaypointRing.removeFromParent();
    if (this.playerContactShadow) {
      this.playerContactShadow.removeFromParent();
      this.playerContactShadow.geometry.dispose();
      (this.playerContactShadow.material as THREE.Material).dispose();
      this.playerContactShadow = null;
    }

    const skyMesh = this.scene.getObjectByName("world_sky_dome");
    if (skyMesh instanceof THREE.Mesh) {
      skyMesh.removeFromParent();
      skyMesh.geometry.dispose();
    }
    this.skyMaterial?.dispose();
    this.skyMaterial = null;
    const celestialMap = this.sunDisc?.material.map;
    this.sunDisc?.removeFromParent();
    this.sunDisc?.material.dispose();
    this.moonDisc?.removeFromParent();
    this.moonDisc?.material.dispose();
    celestialMap?.dispose();
    this.sunDisc = null;
    this.moonDisc = null;
    if (this.starField) {
      this.starField.removeFromParent();
      this.starField.geometry.dispose();
      (this.starField.material as THREE.Material).dispose();
      this.starField = null;
    }

    this.fishingBobberGroup.traverse((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    });
    this.fishingBobberGroup.removeFromParent();
    if (this.fishingLineMesh) {
      this.fishingLineMesh.removeFromParent();
      this.fishingLineMesh.geometry.dispose();
      (this.fishingLineMesh.material as THREE.Material).dispose();
      this.fishingLineMesh = null;
    }

    this.lightingRig.sun.shadow.map?.dispose();
    this.lightingRig.moon.shadow.map?.dispose();
    this.renderer.dispose();
  }

  private disposeBatchedMeshes(): void {
    const batches = new Set<THREE.BatchedMesh>();
    for (const instance of this.staticLodBatchInstances) {
      batches.add(instance.batch);
    }
    this.staticLodBatchInstances.length = 0;
    for (const chunk of this.staticBatchChunks) batches.add(chunk.batch);
    this.staticBatchChunks.length = 0;
    this.staticPrefabGroup.traverse((object) => {
      if (object instanceof THREE.BatchedMesh) batches.add(object);
    });
    this.playerMesh?.traverse((object) => {
      if (object instanceof THREE.BatchedMesh) batches.add(object);
    });
    this.windmillRotor?.traverse((object) => {
      if (object instanceof THREE.BatchedMesh) batches.add(object);
    });
    for (const boat of this.boatMeshes.values()) {
      boat.traverse((object) => {
        if (object instanceof THREE.BatchedMesh) batches.add(object);
      });
    }
    this.skiffMooringPreview?.traverse((object) => {
      if (object instanceof THREE.BatchedMesh) batches.add(object);
    });
    for (const batch of batches) {
      batch.removeFromParent();
      batch.dispose();
    }
  }
}

function disposeNamedGeneratedMesh(root: THREE.Object3D, name: string): void {
  const object = root.getObjectByName(name);
  if (!(object instanceof THREE.Mesh)) return;
  object.removeFromParent();
  object.geometry.dispose();
}

function wrapPresentationAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function dampPresentationAngle(current: number, target: number, response: number, delta: number): number {
  const difference = wrapPresentationAngle(target - current);
  return wrapPresentationAngle(current + difference * (1 - Math.exp(-response * delta)));
}

function stablePresentationPhase(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0x1_0000_0000;
}

function smoothPresentationWindow(
  value: number,
  start: number,
  end: number,
  edge: number
): number {
  const enter = THREE.MathUtils.smoothstep(value, start, start + edge);
  const exit = 1 - THREE.MathUtils.smoothstep(value, end - edge, end);
  return Math.min(enter, exit);
}
