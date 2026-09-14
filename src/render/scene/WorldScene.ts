import { AMBIENT_BOAT_ROUTES, sampleAmbientBoatPose } from "./ambientBoats";
import { AMBIENT_TOWNSFOLK_ROUTES, sampleAmbientTownsfolkPose, type AmbientTownsfolkRoute } from "./ambientTownsfolk";
import { architectureWindowMaterial, disposeArchitectureWindows, updateArchitectureWindows } from "../materials/WindowMaterial";
import { npcAnchorAt } from "../../simulation/presentation/NpcPresentation";
import { yieldToTask } from "../../utils/CooperativeTask";
// src/render/scene/WorldScene.ts

import * as THREE from "three";
import { setRainSurfaceWetness } from "../materials/RainSurfaceMaterial";
import { createSpatialSurfaceBatch } from "./spatialSurfaceBatch";
import { RigidAnimationBatch } from "./RigidAnimationBatch";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import {
  advanceQualityLevel,
  CANONICAL_RENDER_CONFIG,
  contactTierEffectStrength,
  highTierEffectStrength,
  qualityTierAtLevel,
  qualityTierLevel,
  qualityValueAtLevel,
  type QualityTier
} from "../config/VisualRenderConfig";
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
import { coastalVegetationDepthMaterial, disposeVegetationTintMaterials, updateVegetationWind, vegetationInstanceTintMaterial } from "../materials/VegetationTintMaterial";
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
import { STATIC_FARM_PROP_ASSETS, STATIC_LANDMARK_ASSETS } from "../assets/RuntimeAssetOwners";
import type { StaticCollisionProxy } from "../../physics/StaticCollision";
import { projectAssetCollision } from "../../physics/CollisionCatalogAdapter";
import type { BasicFishingPhase, FishingEncounterState, GameState, ProcessingPresentationKind } from "../../simulation/core/types";
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
  SUNREACH_FARM_LAYOUT,
  farmLocalToWorld,
  starterStructureAnchor
} from "../../world/FarmLayout";
import { STARTER_DONKEY_ID } from "../../simulation/mounts/Mounts";
import { HARBOR_FISH_TABLE, HARBOR_SKIFF_MOORING, VILLAGE_BULLETIN } from "../../world/WorldAnchors";
import { getProcessingStationRuntimeRotationY } from "../../world/ProcessingStationApproach";
import { WORLD_STATION_DEFINITIONS } from "../../world/WorldGameplayLocations";
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
  FARMHOUSE_INTERIOR_BOUNDS,
  FARMHOUSE_INTERIOR_ORIGIN,
  FARMHOUSE_INTERIOR_PROPS
} from "../../world/FarmhouseInterior";
import {
  createWorldEnvironmentLayout,
  prepareWorldEnvironmentLayout,
  type EnvironmentAssetPlacement,
  type WorldEnvironmentLayout
} from "../../world/WorldEnvironmentLayout";
import {
  HumanoidAnimator,
  type BoatAnimationInput,
  type CharacterAnimationContext,
  type CharacterAnimationEvent,
  type CharacterMotionFrame,
  type PlayerAnimation
} from "../animation/AnimationController";
import {
  CharacterEquipmentAssembler,
  characterVisualLoadoutFromState
} from "../animation/CharacterEquipmentAssembler";
import {
  attachPreservingWorld,
  attachmentClip,
  attachmentSideFromLocalX,
  sampleAttachmentCurve
} from "../animation/PlayerAttachmentTransition";
import {
  stationaryPlayerMotion,
  type PresentedPlayerFrame
} from "../presentation/PlayerPresentationBuffer";
import {
  IDLE_PLAYER_PRESENCE,
  type PlayerPresence
} from "../presentation/PlayerPresence";
import {
  acknowledgeHeadYaw,
  ACKNOWLEDGE_HEAD_TURN_RADIUS_METERS,
  presenceFalloff
} from "../presentation/WorldAcknowledgment";
import {
  sampleWeatherPosture,
  SocialReactionPresentation,
  type WorldReactionKind
} from "../presentation/SocialReactionPresentation";
import {
  BoatResponsePresentation,
  type BoatResponseKind
} from "../presentation/BoatResponsePresentation";
import { resolveMountPresentationPose } from "../presentation/MountPresentation";
import { LightingRig } from "../lighting/LightingRig";
import {
  RendererPipeline,
  type CaptureRenderMode,
  type RendererPipelineDiagnostics
} from "../pipeline/RendererPipeline";
import {
  createWorldDiagnosticOverlay,
  type WorldFieldOverlay
} from "./WorldDiagnosticOverlay";

export interface WorldRenderDiagnostics {
  meshes: number;
  batched: number;
  instances: number;
  casters: number;
  receivers: number;
  casterNames: readonly string[];
  /** Top scene subtrees by triangle count, largest first. */
  trianglesByGroup: ReadonlyArray<{ group: string; triangles: number }>;
  lights: readonly Record<string, unknown>[];
  fog: Record<string, unknown> | null;
  shadowMap: {
    enabled: boolean;
    type: number;
    autoUpdate: boolean;
  };
  exposure: number;
  qualityTier: QualityTier;
  render: {
    calls: number;
    triangles: number;
    programs: number;
  };
  pipeline: RendererPipelineDiagnostics;
  fieldOverlay: WorldFieldOverlay | null;
}
import { ShoreFoam } from "../water/ShoreFoam";

import { BoatWakePool } from "../water/BoatWakePool";
import { CropInstanceRenderer, cropStageAsset } from "./CropInstanceRenderer";
import {
  createContactShadowMesh,
  setContactShadowOpacity,
  type ContactShadowMesh
} from "./ContactShadow";
import { GroundCoverRenderer } from "./GroundCoverRenderer";
import { MeadowField } from "../vegetation/MeadowField";
import { AtmosphereSky } from "../atmosphere/AtmosphereSky";
import {
  BUTTERFLY_ORBITS,
  GULL_ORBITS,
  sampleAmbientFlyerPose,
  type AmbientFlyerOrbit
} from "./ambientFlyers";
import { npcStationBeatAt, advanceNpcStationBeat, createNpcStationBeatState, type NpcStationBeatState } from "./npcStationBeat";
import { resolveHumanoidRig } from "../animation/HumanoidRig";
import { createTradePackBackSocket, attachBoatTradePack } from "../animation/TradePackAttachment";
import { alignEquipmentHands, alignMarkerHand, alignSupportFeet, applyEquipmentSocketPose, createCarryCradle, fishingClipUsesRod, rowboatOarRotation } from "../animation/CharacterEquipment";
import { buildStarterFarmGround } from "./StarterFarmGround";
import { ContentRegistry } from "../../content/ContentRegistry";
import { fishCargoPackAsset, fishSchoolMemberAssets, fishSpeciesAsset } from "./FishSchoolAssets";
import { advanceSchoolFish, type SchoolFishMotion, type SchoolBoatObstacle } from "../fishing/FishSchoolMotion";
import { SchoolSurfaceRipples } from "../fishing/SchoolSurfaceRipples";



import { FarmVfxPool, type FarmVfxKind, type FarmVfxPoint } from "../effects/FarmVfxPool";
import { FootfallVfxPool, type FootfallSurface } from "../effects/FootfallVfxPool";
import { FireflyField, fireflyNightVisibility } from "../effects/FireflyField";
import { RainField } from "../weather/RainField";
import type { WaterConditions } from "../water/WaterSurface";
import {
  createWeatherMotionSignal,
  sampleWeatherMotionSignal,
  type WeatherMotionSignal
} from "../motion/WeatherMotionSignal";
import { WeatherPresentation } from "../weather/WeatherPresentation";
import {
  createSportFishingPresentationSample,
  sampleSportFishingPresentation,
  type SportFishingEndCue,
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
  initialRotationY: number;
  detailReduced: boolean;
  lastPresentationUpdateSeconds: number;
  pendingAnimationSeconds: number;
  beat: NpcStationBeatState;
  motionFrame: CharacterMotionFrame | null;
  lastAnimationContext: CharacterAnimationContext | null;
}

interface AmbientTownsfolkPresentation {
  route: AmbientTownsfolkRoute;
  model: THREE.Group;
  animator: HumanoidAnimator;
  motionFrame: CharacterMotionFrame | null;
  lastAnimationContext: CharacterAnimationContext | null;
}

const CHARACTER_DETAIL_DISTANCE_METERS = 14;
/** Detail returns inside this closer radius so the boundary cannot flicker. */
const CHARACTER_DETAIL_RESTORE_DISTANCE_METERS = 13;
/** Beyond this a background villager is a couple of pixels; stop animating. */
const AMBIENT_TOWNSFOLK_VISIBILITY_METERS = 110;
/** Enter/exit gap so a villager drifting on the edge does not blink. */
const AMBIENT_TOWNSFOLK_VISIBILITY_HYSTERESIS_METERS = 6;
const NPC_VISIBILITY_HYSTERESIS_METERS = 5;
/** Only stations close enough to read emit visible work cues. */
const STATION_ACTIVITY_RADIUS_METERS = 55;
/** Cue height above the station surface, per station family. */
const STATION_ACTIVITY_HEIGHT_METERS: Readonly<Record<string, number>> = {
  "hand-mill": 2.1,
  workbench: 1.15,
  "fish-table": 1.2,
  "compost-bin": 1.0
};

/**
 * Catalog families whose scattered instances are allowed to block the player.
 * A mature trunk or a field boulder is something you walk around; a building,
 * dock or crate placed by seeded fill would be an unvalidated obstacle in a
 * road or doorway.
 *
 * This replaced a blanket ban on colliding seeded-fill assets, which was a
 * safe default while nothing scattered could collide and became wrong the
 * moment trees gained trunks. It is keyed on what the asset *is* rather than
 * on a composition tag, because code-authored landscape dressing (a shade tree
 * beside a bench) is seeded-fill too and carries no tag.
 */
const SEEDED_FILL_COLLIDING_FAMILIES: ReadonlySet<string> = new Set(["vegetation", "rock"]);
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

// NPC station beats are presentation-only, but they still need to use the
// same support envelope that the humanoid grounding pass can represent.
const NPC_MAX_GROUND_SLOPE_NORMAL_Y = Math.cos(THREE.MathUtils.degToRad(38));

function isValidNpcPresentationGround(
  x: number,
  z: number,
  surface: ReturnType<typeof WorldLayout.traversalSurfaceSample>
): boolean {
  return WorldLayout.isWalkable(x, z)
    && !WorldLayout.isWater(x, z)
    && surface.normal.y >= NPC_MAX_GROUND_SLOPE_NORMAL_Y;
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

interface StaticBatchInstance {
  batch: THREE.BatchedMesh;
  instanceId: number;
  chunk: StaticBatchChunk;
  lodVisible: boolean;
  visible: boolean;
}

interface StaticLodBatchInstance extends StaticBatchInstance {
  levelIndex: number;
  distances: readonly number[];
  position: THREE.Vector3;
}

interface StaticBatchSource {
  mesh: THREE.Mesh;
  chunkKey: string;
  lod?: { levelIndex: number; distances: readonly number[]; position: THREE.Vector3 };
}

interface StaticBatchChunk {
  batch: THREE.BatchedMesh;
  instances: StaticBatchInstance[];
  center: THREE.Vector3;
  radius: number;
  visible: boolean;
}

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
  side: "left" | "right";
  pivot: THREE.Group;
  root: THREE.Object3D;
  grip: THREE.Object3D;
  restPivotQuaternion: THREE.Quaternion;
}

interface RowboatPresentationRig {
  boatRoot: THREE.Group;
  rowerSeat: THREE.Object3D;
  footLeftSupport: THREE.Object3D;
  footRightSupport: THREE.Object3D;
  oars: readonly RowboatOarAttachment[];
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

type DonkeyAnimationClip = "idle" | "graze" | "look" | "walk" | "trot" | "gallop" | "mount" | "dismount";

interface DonkeyPresentation {
  id: string;
  placementId: string;
  root: THREE.Group;
  riderSocket: THREE.Object3D;
  stirrupLeftSocket: THREE.Object3D;
  stirrupRightSocket: THREE.Object3D;
  reinLeftGrip: THREE.Object3D;
  reinRightGrip: THREE.Object3D;
  mixer: THREE.AnimationMixer | null;
  actions: Map<DonkeyAnimationClip, THREE.AnimationAction>;
  activeClip: DonkeyAnimationClip | null;
  attachedMountId: string | null;
  originalPlayerParent: THREE.Object3D | null;
  transitionUntilSeconds: number;
  lastAnimationUpdateSeconds: number;
}

type PlayerAttachmentAction = "board" | "dock" | "mount" | "dismount";

interface PlayerAttachmentTransition {
  action: PlayerAttachmentAction;
  targetId: string;
  clip: PlayerAnimation | null;
  startedAtSeconds: number;
  durationSeconds: number;
  sourcePosition: THREE.Vector3;
  sourceQuaternion: THREE.Quaternion;
  sourceScale: THREE.Vector3;
  detachedAtContact: boolean;
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
  visibilityMaterials: FishVisibilityMaterial[];
  lastFeedingCycle?: number;
  schoolMotion?: SchoolFishMotion;
}

interface FishVisibilityMaterial {
  material: THREE.Material & { color?: THREE.Color };
  baseColor: THREE.Color | null;
  baseOpacity: number;
  baseTransparent: boolean;
  baseDepthTest: boolean;
  baseDepthWrite: boolean;
}

export interface SportFishingCameraHint {
  lookHint: { x: number; y: number; z: number };
  fightReachMeters: number;
  lineTension: number;
  lineLoadRatio: number;
  snapTimerSeconds: number;
  fightBehavior: FishingEncounterState["behavior"];
  behaviorPhase: SportFishingPresentationSample["behaviorPhase"];
  behaviorPhaseProgress: number;
  fishDepthMeters: number;
  fishStaminaRatio: number;
  /** Physics head-shake amplitude, 0..1 — a continuous low camera rumble. */
  shakeAmplitude: number;
  /** Transient outcome bridge; it is never simulation or save state. */
  cameraEvent: "hooked" | SportFishingEndCue | null;
}

function boatBuoyancyFootprint(boatTypeId: string): { halfLength: number; halfBeam: number } {
  return boatTypeId === "boat.skiff"
    ? { halfLength: 2.45, halfBeam: 0.9 }
    : { halfLength: 1.55, halfBeam: 0.62 };
}

/** Presentation-only buoyancy key. Not a persisted BoatId. */
const SKIFF_MOORING_PREVIEW_ID = "preview.harbor-skiff";

/** Centreline samples along the fishing line ribbon (one more vertex pair than this). */
const FISHING_LINE_SEGMENTS = 14;

const FARMING_PROP_ATTACHMENTS: readonly PropAttachmentConfig[] = [
  { key: "seed", assetId: ASSET_IDS.TOOL_SEED_POUCH_A, socket: "char_player_hip_socket", scale: 0.72 },
  { key: "bundle", assetId: ASSET_IDS.PROP_CROP_BUNDLE_A, socket: "char_player_carry_socket", scale: 0.76 },
  { key: "basket", assetId: ASSET_IDS.PROP_HARVEST_BASKET_A, socket: "char_player_carry_socket", scale: 0.68 },
  { key: "scoop", assetId: ASSET_IDS.TOOL_WORKSTATION_SCOOP_A, socket: "char_player_tool_socket", scale: 0.78 },
  { key: "tailor", assetId: ASSET_IDS.PROP_CRAFTING_TAILOR_A, socket: "char_player_tool_socket", scale: 0.82 },
  { key: "toolmaking", assetId: ASSET_IDS.PROP_CRAFTING_TOOLMAKING_A, socket: "char_player_tool_socket", scale: 0.82 },
  { key: "ready", assetId: ASSET_IDS.PROP_CRAFTING_READY_A, socket: "char_player_tool_socket", scale: 0.82 }
] as const;

/**
 * Soft radial falloff for a practical light's halo.
 *
 * Most of the halo stays nearly transparent, with energy concentrated in a
 * small core so a lantern never becomes a pasted-on luminous disc.
 */
function createPracticalGlowTexture(size = 64): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = ((x + 0.5) / size) * 2 - 1;
      const dy = ((y + 0.5) / size) * 2 - 1;
      const radius = Math.min(1, Math.hypot(dx, dy));
      // A wide, fast-decaying skirt plus a tight core: the skirt is what reads
      // as light in air, the core as the lit fixture itself.
      const skirt = Math.pow(1 - radius, 3);
      const core = Math.pow(Math.max(0, 1 - radius * 3.2), 2) * 0.55;
      const alpha = THREE.MathUtils.clamp(skirt + core, 0, 1);
      const offset = (y * size + x) * 4;
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = Math.round(alpha * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function createPracticalGlowMaterial(
  map: THREE.DataTexture,
  color: THREE.ColorRepresentation
): THREE.SpriteMaterial {
  return new THREE.SpriteMaterial({
    map,
    color,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    // Unlike the celestial discs, this one lives in the world and must be
    // occluded by anything in front of it. With depth testing off it drew over
    // foreground terrain, props and grass as an opaque circle.
    depthTest: true,
    // Additive blending and fog do not compose: three mixes toward the fog
    // colour and the result is then added, so a fogged distant lamp would
    // brighten the scene instead of fading. Distance falloff comes from the
    // sprite's own perspective scale.
    fog: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending
  });
}

/** Fallback yield when rAF is unavailable or throttled (hidden tab). */

/**
 * Yields to the browser between heavy world-build steps so the loading screen
 * can paint.
 *
 * Races `requestAnimationFrame` against a timer. rAF alone is not safe here:
 * it does not fire in a hidden or backgrounded tab, so a boot that awaits it
 * never resolves — no error, no timeout, main thread responsive, loading
 * screen frozen forever. The timer guarantees forward progress; in a visible
 * tab rAF wins the race and the yield behaves exactly as before.
 */


/** Below this range the shaft is fully retired and the ground ring carries it. */
const QUEST_BEACON_NEAR_METERS = 18;
/** Above this range the shaft is at full strength. */
const QUEST_BEACON_FAR_METERS = 42;
/** Peak additive strength of the shaft, before the distance fade and pulse. */
const QUEST_BEACON_SHAFT_OPACITY = 0.5;
/** Tall enough to clear Neva's 22 m of relief from most approaches. */
const QUEST_BEACON_SHAFT_HEIGHT = 14;

/**
 * How strongly each half of the waypoint reads at a given camera range.
 *
 * Pure and exported so the hand-off can be asserted directly: the whole point
 * of the beacon is that it is legible from across a region *and* gets out of
 * the way once you arrive, and those are opposite requirements that only a
 * cross-fade satisfies.
 */
export function questBeaconRangeMix(distanceMeters: number): {
  shaftStrength: number;
  ringStrength: number;
} {
  const shaftStrength = THREE.MathUtils.clamp(
    (distanceMeters - QUEST_BEACON_NEAR_METERS) / (QUEST_BEACON_FAR_METERS - QUEST_BEACON_NEAR_METERS),
    0,
    1
  );
  // The ring never goes fully dark, so the exact spot stays readable at range.
  return { shaftStrength, ringStrength: 0.35 + 0.65 * (1 - shaftStrength) };
}

/**
 * An open, tapered cylinder whose vertex colours run from the ochre accent at
 * the base to black at the tip. The material is additive, so a black vertex
 * contributes nothing — that gives a soft vertical fade without a texture, an
 * alpha map, or a custom shader.
 */
function buildQuestBeaconShaftGeometry(): THREE.CylinderGeometry {
  const geometry = new THREE.CylinderGeometry(
    0.30, 0.62, QUEST_BEACON_SHAFT_HEIGHT, 20, 1, true
  );
  // Cylinders are built around their centre; sit this one on the ground.
  geometry.translate(0, QUEST_BEACON_SHAFT_HEIGHT / 2, 0);

  const position = geometry.getAttribute("position");
  const base = new THREE.Color(PALETTE_HEX.accent_ochre_01);
  const colors = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index += 1) {
    const heightRatio = THREE.MathUtils.clamp(
      position.getY(index) / QUEST_BEACON_SHAFT_HEIGHT, 0, 1
    );
    // Squared falloff keeps the base solid and lets the top dissolve early.
    const strength = (1 - heightRatio) * (1 - heightRatio);
    colors[index * 3] = base.r * strength;
    colors[index * 3 + 1] = base.g * strength;
    colors[index * 3 + 2] = base.b * strength;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

export class WorldScene {
  private static readonly preparedStartupLayouts = new Map<number, WorldEnvironmentLayout>();
  public scene: THREE.Scene;
  public renderer: THREE.WebGLRenderer;
  public water!: FacetedWater;
  private startupSignal?: AbortSignal;
  private disposed = false;
  public sunLight: THREE.DirectionalLight;
  public hemiLight: THREE.HemisphereLight;
  private readonly lightingRig: LightingRig;
  private readonly rendererPipeline: RendererPipeline;
  private shoreFoam!: ShoreFoam;
  private boatWakes!: BoatWakePool;
  private farmVfx!: FarmVfxPool;
  private footfallVfx!: FootfallVfxPool;
  private readonly stationActivityEmitSeconds = new Map<string, number>();
  private readonly announcedCompleteJobs = new Set<string>();
  private fireflyField!: FireflyField;
  private rainField!: RainField;
  private readonly terrainSurfaceMaterial = new TerrainSurfaceMaterial();
  private readonly roadSurfaceMaterial = new RoadSurfaceMaterial();
  private readonly cultivatedSurfaceMaterial = new CultivatedSurfaceMaterial();
  private diagnosticOverlay: THREE.Group | null = null;
  private diagnosticOverlayMode: WorldFieldOverlay | null = null;

  private playerMesh: THREE.Group | null = null;
  private boatMeshes: Map<string, THREE.Group> = new Map();
  private skiffMooringPreview: THREE.Group | null = null;
  private readonly cropInstances = new CropInstanceRenderer();
  private readonly groundCover = new GroundCoverRenderer(CANONICAL_RENDER_CONFIG.qualityTier);
  private readonly meadowField = new MeadowField(CANONICAL_RENDER_CONFIG.qualityTier);
  private schoolEffects: Map<string, THREE.Group> = new Map();
  private environmentGroup: THREE.Group = new THREE.Group();
  private staticPrefabGroup: THREE.Group = new THREE.Group();
  private playerAnimation: HumanoidAnimator | null = null;
  private playerEquipmentAssembler: CharacterEquipmentAssembler | null = null;
  private playerPelvis: THREE.Object3D | null = null;
  private playerAttachmentTransition: PlayerAttachmentTransition | null = null;
  private lastPlayerDiscontinuitySequence = -1;
  private readonly interactionMaterials = new Map<string, THREE.MeshStandardMaterial[]>();
  private activeInteractionMaterialId: string | null = null;
  private readonly farmingProps = new Map<string, THREE.Group>();
  private farmingPropsAttached = false;
  private cosmeticCropCarryUntilSeconds = 0;
  private playerBackpackSocket: THREE.Group | null = null;
  private boatFishPacks = new Map<string, { root: THREE.Group; boatId: string; slot: number }>();
  private carriedFishPresentation: { cargoId: string; root: THREE.Group } | null = null;
  private readonly playerAnimationEvents: CharacterAnimationEvent[] = [];
  private latestPresentedPlayer: PresentedPlayerFrame | null = null;
  private playerPresence: PlayerPresence = { ...IDLE_PLAYER_PRESENCE };
  private latestLocomotionTimeScale = 1;
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
  private hasPresentationTimestamp = false;
  private characterElapsedSeconds = 0;
  private prefersReducedMotion: boolean = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  private atmosphereSky: AtmosphereSky | null = null;
  private readonly practicalLights: Array<{
    light: THREE.PointLight;
    root: THREE.Object3D;
    qualityEnabled: boolean;
    glow: THREE.Sprite | null;
  }> = [];
  /** Shared by every practical-light glow sprite; built on first use. */
  private practicalGlowTexture: THREE.DataTexture | null = null;
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
  private readonly faunaPresentations: FaunaPresentation[] = [];
  private donkeyPresentation: DonkeyPresentation | null = null;
  private readonly backgroundBoats: THREE.Object3D[] = [];
  private readonly ambientTownsfolk: AmbientTownsfolkPresentation[] = [];
  private readonly ambientFlyers: AmbientFlyerPresentation[] = [];
  private readonly rigidAnimationBatches = new Map<THREE.Object3D, RigidAnimationBatch>();
  private syncInFlight: Promise<void> | null = null;
  private readonly wakeEmitState = new Map<string, { x: number; z: number; timeSeconds: number }>();
  private readonly rowboatPresentationRigs = new Map<string, RowboatPresentationRig>();
  private readonly boatDriverSeats = new Map<string, THREE.Object3D>();
  private readonly boatFishingStations = new Map<string, THREE.Object3D>();
  private readonly boatBuoyancyState = new Map<string, BoatBuoyancyPresentationState>();
  private readonly boatResponses = new BoatResponsePresentation();
  private readonly socialReactions = new SocialReactionPresentation();
  private sportFishingBodyYaw = 0;
  private sportFishingBodyYawInstanceId: string | null = null;
  private latestBoatPresentationInput: BoatPresentationInput | null = null;
  private readonly terrainMeshes: THREE.Mesh[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly layoutEditRoots: THREE.Object3D[] = [];
  private layoutEditHelper: THREE.BoxHelper | null = null;
  private layoutEditLockedObject: THREE.Object3D | null = null;
  private qualityTier: QualityTier = CANONICAL_RENDER_CONFIG.qualityTier;
  private qualityLevel = qualityTierLevel(CANONICAL_RENDER_CONFIG.qualityTier);
  private targetQualityLevel = this.qualityLevel;
  private qualityRebuildElapsedSeconds = 0;
  private qualityContactStrength = contactTierEffectStrength(this.qualityLevel);
  private hasRenderedFrame = false;
  private lastResizeWidth = 0;
  private lastResizeHeight = 0;
  private readonly placementPreview = new THREE.Group();
  private readonly interactionFeedback = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.52, 24, 1, 0, Math.PI * 1.8),
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
  /**
   * The distance half of the waypoint. A flat ring on the ground is invisible
   * from more than a dozen metres, which made every objective anchor unusable
   * as a navigation cue; this shaft clears the island's 22 m of relief so the
   * target reads from across a region, then hands back to the ring up close.
   */
  private readonly questWaypointShaft = new THREE.Mesh(
    buildQuestBeaconShaftGeometry(),
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexColors: true
    })
  );
  private questWaypointVisible = false;
  private questWaypointElapsedSeconds = 0;
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
  private fishingLineMesh: Line2 | null = null;
  private fishingSubmergedLineMesh: Line2 | null = null;
  private readonly fishingLinePathPositions = new Float32Array((FISHING_LINE_SEGMENTS + 1) * 3);
  private readonly fishingLineWaterOffsets = new Float32Array(FISHING_LINE_SEGMENTS + 1);
  private readonly fishingLinePositions = new Float32Array((FISHING_LINE_SEGMENTS + 1) * 3);
  private readonly fishingLineColors = new Float32Array((FISHING_LINE_SEGMENTS + 1) * 3);
  private readonly fishingSubmergedLinePositions = new Float32Array((FISHING_LINE_SEGMENTS + 1) * 3);
  private readonly fishingSubmergedLineColors = new Float32Array((FISHING_LINE_SEGMENTS + 1) * 3);
  private readonly fishWaterTint = new THREE.Color(PALETTE_HEX.water_deep_01);
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
  /** Keeps an explicit terminal outcome hint alive briefly after fight state clears. */
  private sportFishEndBeatSeconds = 0;
  private sportFishEndCue: SportFishingEndCue | null = null;
  private readonly sportFishEndLook = new THREE.Vector3();
  private lastSportFishingSplashAtSeconds = Number.NEGATIVE_INFINITY;
  private lastRodTipSprayAtSeconds = Number.NEGATIVE_INFINITY;
  private lastRodLoadSample = 0;
  private hookedFishModel: THREE.Group | null = null;
  private hookedFishAssetId: AssetId | null = null;
  private hookedFishPresentation: FishPresentationMember | null = null;
  private lastHookedFishUpdateSeconds = 0;
  private readonly tempRodTipVec = new THREE.Vector3();
  private readonly tempBoatSeatVec = new THREE.Vector3();
  private readonly playerAttachmentTargetPosition = new THREE.Vector3();
  private readonly playerAttachmentTargetQuaternion = new THREE.Quaternion();
  private readonly playerAttachmentTargetScale = new THREE.Vector3(1, 1, 1);
  private readonly playerAttachmentBlendPosition = new THREE.Vector3();
  private readonly playerAttachmentBlendQuaternion = new THREE.Quaternion();
  private readonly playerAttachmentWorldMatrix = new THREE.Matrix4();
  private readonly playerAttachmentLocalMatrix = new THREE.Matrix4();
  private readonly playerAttachmentParentInverse = new THREE.Matrix4();
  private readonly playerAttachmentEuler = new THREE.Euler();
  private readonly tempOarEuler = new THREE.Euler();
  private readonly tempOarQuaternion = new THREE.Quaternion();
  private readonly tempOarDeltaQuaternion = new THREE.Quaternion();
  private readonly npcPresentations = new Map<string, NpcPresentation>();
  private activeDialogueNpcId: string | null = null;
  private readonly weatherMotion: WeatherMotionSignal = createWeatherMotionSignal();
  private readonly weatherPresentation = new WeatherPresentation();
  private lastAmbientMotionTimeSeconds = 0;
  /** Unpaused presentation clock for the ambient drift; frozen while paused. */
  private ambientTownsfolkElapsedSeconds = 0;
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

    // 3. Build World Geometry
    this.scene.add(this.environmentGroup);
    this.scene.add(this.cropInstances.group);
    this.environmentGroup.add(this.groundCover.group);
    this.environmentGroup.add(this.meadowField.group);
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
    this.questWaypointShaft.name = "quest_waypoint_shaft";
    this.questWaypointShaft.renderOrder = 3;
    this.questWaypointShaft.visible = false;
    // Additive and unlit, so it never writes depth over the world behind it.
    this.questWaypointShaft.frustumCulled = false;
    this.scene.add(this.questWaypointShaft);
    this.buildPlayerContactShadow();

  }

  private checkAlive(): void {
    this.startupSignal?.throwIfAborted();
    if (this.disposed) throw new DOMException("World disposed", "AbortError");
  }

  private syncBoatFishPacks(state: Readonly<GameState>): void {
    for (const [id, pack] of this.boatFishPacks) {
      if (!state.fishCargo[id] || state.boats[pack.boatId]?.fishCargoSlotIds[pack.slot] !== id) {
        pack.root.removeFromParent();
        this.boatFishPacks.delete(id);
      }
    }
  }

  private async loadModel(assetId: AssetId): Promise<THREE.Group> {
    this.checkAlive();
    const model = await AssetLoader.loadModel(assetId);
    this.checkAlive();
    return model;
  }

  private async initializeWater(): Promise<void> {
    // 2. Sky and faceted animated water
    this.buildSky();
    this.water = await FacetedWater.create(WATER_SURFACE, this.startupSignal);
    this.checkAlive();
    this.rendererPipeline.bindWaterCapture([...this.water.meshes, this.water.nearPatch.mesh], this.water.coastalUniforms);
    this.terrainSurfaceMaterial.bindCoastalField(this.water.coastalUniforms);
    this.roadSurfaceMaterial.bindCoastalField(this.water.coastalUniforms);
    this.scene.add(this.water.group);
    this.shoreFoam = new ShoreFoam({
      waterProfileMap: this.water.waterProfileMap,
      waterProfileBounds: this.water.waterProfileBounds
    });
    this.scene.add(this.shoreFoam.mesh);
    this.boatWakes = new BoatWakePool();
    this.scene.add(this.boatWakes.group);
    this.farmVfx = new FarmVfxPool();
    this.scene.add(this.farmVfx.group);
    this.footfallVfx = new FootfallVfxPool();
    this.scene.add(this.footfallVfx.group);
    this.fireflyField = new FireflyField(CANONICAL_RENDER_CONFIG.qualityTier);
    this.scene.add(this.fireflyField.group);
    this.rainField = new RainField(CANONICAL_RENDER_CONFIG.qualityTier);
    this.scene.add(this.rainField.group);

    this.setQuality(this.qualityTier);
  }

  private async initializeWorldGeometry(): Promise<void> {
    await Promise.all([
      this.terrainSurfaceMaterial.loadExternalTextures(),
      this.roadSurfaceMaterial.loadExternalTextures()
    ]);
    await this.initializeWater();
    await this.buildWorldTerrain();
    await yieldToTask(this.startupSignal);
    this.checkAlive();
    this.buildPlacementPreview();
    this.buildStarterFarmDetails();
    await yieldToTask(this.startupSignal);
    this.checkAlive();
    this.buildRouteDetails();
    await yieldToTask(this.startupSignal);
    this.checkAlive();
    this.buildFishingPresentation();
  }

  public ready(worldSeed: number, signal?: AbortSignal): Promise<void> {
    if (this.readyWorldSeed !== null && this.readyWorldSeed !== worldSeed) {
      throw new Error(
        `[WorldScene] Already initialized for world seed ${this.readyWorldSeed}; cannot reinitialize for ${worldSeed}`
      );
    }
    this.checkAlive();
    if (!this.readyPromise) {
      this.readyWorldSeed = worldSeed;
      this.startupSignal = signal;
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

  public static async prepareStartupAssetIds(
    state: Readonly<Pick<GameState, "worldSeed" | "crops" | "boats">>, signal?: AbortSignal
  ): Promise<readonly AssetId[]> {
    await prepareWorldEnvironmentLayout(state.worldSeed, signal);
    return this.startupAssetIds(state);
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
      this.groundCover.build(layout.groundCoverPlacements, this.startupSignal)
    ]);
    this.checkAlive();
    // The carpet stays out of every ground-touching collider, so it needs the
    // prefabs' projected colliders before its exclusion raster is final.
    this.meadowField.build(this.staticCollisionProxyList);
  }

  public staticCollisionProxies(): readonly StaticCollisionProxy[] {
    return this.staticCollisionProxyList;
  }

  /** DEV layout editor: reproject catalog colliders from the current prefab poses. */
  public rebuildStaticCollisionProxies(): readonly StaticCollisionProxy[] {
    this.staticPrefabGroup.updateMatrixWorld(true);
    const roots = this.staticPrefabGroup.children.filter(
      (child) => Boolean(child.userData.assetId)
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
    const proxies = this.rebuildStaticCollisionProxies();
    this.meadowField.restampCollision(proxies);
    return proxies;
  }

  /** DEV layout editor: rebuild contact discs while dragging so they follow the mesh. */
  public followLayoutEditGrounding(): void {
    this.rebuildLayoutGroundingPatches();
  }

  private buildSky(): void {
    this.atmosphereSky = new AtmosphereSky(this.qualityTier);
    this.scene.add(this.atmosphereSky.mesh);
    this.rendererPipeline.bindSky(this.atmosphereSky);
    this.atmosphereSky.setVolumeBlend(highTierEffectStrength(this.qualityLevel));
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
  private async buildWorldTerrain(): Promise<void> {
    for (const patch of WorldLayout.terrainPatches()) {
      const layoutGeometry = await WorldLayout.buildTerrainGeometryAsync(patch.id, this.startupSignal);
      this.checkAlive();
      // Copied before production batching disposes the source geometry.
      this.meadowField.addTerrainPatch(patch, layoutGeometry);
      const layoutTerrain = import.meta.env.DEV
        ? new THREE.Mesh(layoutGeometry, this.terrainSurfaceMaterial.material)
        : createSpatialSurfaceBatch(layoutGeometry, this.terrainSurfaceMaterial.material, STATIC_BATCH_CHUNK_SIZE_METERS);
      if (!import.meta.env.DEV) layoutGeometry.dispose();
      layoutTerrain.position.set(patch.center.x, 0, patch.center.z);
      layoutTerrain.receiveShadow = true;
      layoutTerrain.frustumCulled = true;
      layoutTerrain.name = patch.islandId === "island.neva"
        ? "world_terrain"
        : `world_terrain_${patch.islandId.slice("island.".length)}`;
      layoutTerrain.userData.islandId = patch.islandId;
      layoutTerrain.userData.terrainPatchId = patch.id;
      this.terrainMeshes.push(layoutTerrain);
      this.environmentGroup.add(layoutTerrain);

      const half = patch.sizeMeters * 0.5;
      const outerHalf = half + patch.submergedApronMeters;
      const apronShape = new THREE.Shape([
        new THREE.Vector2(-outerHalf, -outerHalf),
        new THREE.Vector2(outerHalf, -outerHalf),
        new THREE.Vector2(outerHalf, outerHalf),
        new THREE.Vector2(-outerHalf, outerHalf)
      ]);
      const inner = new THREE.Path([
        new THREE.Vector2(-half, -half),
        new THREE.Vector2(-half, half),
        new THREE.Vector2(half, half),
        new THREE.Vector2(half, -half)
      ]);
      apronShape.holes.push(inner);
      const apronGeometry = new THREE.ShapeGeometry(apronShape);
      apronGeometry.rotateX(-Math.PI / 2);
      const apron = new THREE.Mesh(
        apronGeometry,
        PaletteMaterials.standard("rock_coastal_dark_01", { roughness: 1, flatShading: true })
      );
      apron.position.set(patch.center.x, -7.5, patch.center.z);
      apron.name = `submerged_apron_${patch.islandId.slice("island.".length)}`;
      apron.receiveShadow = false;
      apron.castShadow = false;
      apron.userData.islandId = patch.islandId;
      apron.userData.presentationOnly = true;
      this.environmentGroup.add(apron);
    }

    // High-resolution path ribbon — paints the packed core and shoulder at
    // 17-strip transverse resolution. A narrow alpha-tested polygon edge owns
    // the visible merge; the coarse terrain grid remains a green underlay.
    await yieldToTask(this.startupSignal);
    const pathGeometry = await WorldLayout.buildPathGeometryAsync(this.startupSignal);
    this.checkAlive();
    // The carpet stops where the ribbon's own alpha test draws dirt, and never
    // grows through a building pad or the farmhouse interior pocket.
    await this.meadowField.stampRoadCoverage(pathGeometry, this.startupSignal);
    this.checkAlive();
    const interiorPad = 3;
    this.meadowField.stampFootprints([
      ...WORLD_ARCHITECTURE_PADS.map((pad) => ({
        x: pad.center.x, z: pad.center.z, rotationY: pad.rotationY, halfX: pad.envelope[0], halfZ: pad.envelope[1]
      })),
      {
        x: (FARMHOUSE_INTERIOR_BOUNDS.minX + FARMHOUSE_INTERIOR_BOUNDS.maxX) * 0.5,
        z: (FARMHOUSE_INTERIOR_BOUNDS.minZ + FARMHOUSE_INTERIOR_BOUNDS.maxZ) * 0.5,
        rotationY: 0,
        halfX: (FARMHOUSE_INTERIOR_BOUNDS.maxX - FARMHOUSE_INTERIOR_BOUNDS.minX) * 0.5 + interiorPad,
        halfZ: (FARMHOUSE_INTERIOR_BOUNDS.maxZ - FARMHOUSE_INTERIOR_BOUNDS.minZ) * 0.5 + interiorPad
      }
    ]);
    const pathMesh = import.meta.env.DEV
      ? new THREE.Mesh(pathGeometry, this.roadSurfaceMaterial.material)
      : createSpatialSurfaceBatch(pathGeometry, this.roadSurfaceMaterial.material, STATIC_BATCH_CHUNK_SIZE_METERS);
    if (!import.meta.env.DEV) pathGeometry.dispose();
    pathMesh.name = "world_path_overlay";
    pathMesh.receiveShadow = true;
    pathMesh.renderOrder = 1;
    this.environmentGroup.add(pathMesh);
  }

  private buildPlacementPreview(): void {
    // A single-placement footprint, not an area of effect. The old filled disc
    // with a perimeter ring read as "everything inside this circle gets
    // planted", which is exactly wrong: one click plants one crop. Four corner
    // brackets sized to the crop's own footprint say "one crop, this big, here".
    const bracketArm = 0.34;
    const bracketInset = 0.5;
    const bracketY = 0.006;
    const bracketPoints: THREE.Vector3[] = [];
    for (const signX of [-1, 1]) {
      for (const signZ of [-1, 1]) {
        const cornerX = signX * bracketInset;
        const cornerZ = signZ * bracketInset;
        // One L per corner: an arm along X and an arm along Z, both drawn
        // inward so the bracket never overhangs the footprint it describes.
        bracketPoints.push(
          new THREE.Vector3(cornerX, bracketY, cornerZ),
          new THREE.Vector3(cornerX - signX * bracketArm, bracketY, cornerZ),
          new THREE.Vector3(cornerX, bracketY, cornerZ),
          new THREE.Vector3(cornerX, bracketY, cornerZ - signZ * bracketArm)
        );
      }
    }
    const brackets = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(bracketPoints),
      new THREE.LineBasicMaterial({
        color: PALETTE_HEX.accent_teal_01,
        transparent: true,
        opacity: 0.85,
        depthWrite: false
      })
    );
    brackets.name = "crop_placement_brackets";

    // Valid state: centre seed marker.
    const seedMarker = new THREE.Group();
    seedMarker.name = "crop_placement_seed_marker";

    const seedPip = new THREE.Mesh(
      new THREE.CircleGeometry(0.035, 16).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: PALETTE_HEX.foam_warm_01,
        transparent: true,
        opacity: 0.85,
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
        opacity: 0.6,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -4
      })
    );
    seedCenterRing.name = "crop_placement_seed_ring";

    // A sprout above the pip, so the marker reads as "a plant goes here"
    // rather than as a targeting reticle.
    const seedSprout = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0.008, 0.03),
        new THREE.Vector3(0, 0.008, -0.05),
        new THREE.Vector3(0, 0.008, -0.02),
        new THREE.Vector3(-0.045, 0.008, -0.055),
        new THREE.Vector3(0, 0.008, -0.02),
        new THREE.Vector3(0.045, 0.008, -0.055)
      ]),
      new THREE.LineBasicMaterial({
        color: PALETTE_HEX.foam_warm_01,
        transparent: true,
        opacity: 0.8,
        depthWrite: false
      })
    );
    seedSprout.name = "crop_placement_seed_sprout";

    seedMarker.add(seedPip, seedCenterRing, seedSprout);

    // Invalid state: a centred cross.
    const invalidMarker = new THREE.Group();
    invalidMarker.name = "crop_placement_invalid_marker";

    const invalidRing = new THREE.Mesh(
      new THREE.RingGeometry(0.065, 0.085, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: PALETTE_HEX.roof_terracotta_01,
        transparent: true,
        opacity: 0.55,
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
        opacity: 0.7,
        depthWrite: false
      })
    );
    invalidCross.name = "crop_placement_invalid_cross";

    invalidMarker.add(invalidRing, invalidCross);

    this.placementPreview.add(brackets, seedMarker, invalidMarker);
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
    // Honour the placement's own rotation so the brackets describe the
    // footprint the crop will actually occupy.
    this.placementPreview.rotation.y = result.rotationRadians ?? 0;
    this.placementPreview.scale.set(
      Math.max(0.05, result.footprint.width),
      1,
      Math.max(0.05, result.footprint.depth)
    );

    const primaryColor = result.valid ? PALETTE_HEX.accent_teal_01 : PALETTE_HEX.roof_terracotta_01;

    const brackets = this.placementPreview.getObjectByName("crop_placement_brackets") as THREE.LineSegments | undefined;
    const seedMarker = this.placementPreview.getObjectByName("crop_placement_seed_marker");
    const invalidMarker = this.placementPreview.getObjectByName("crop_placement_invalid_marker");
    const seedCenterRing = this.placementPreview.getObjectByName("crop_placement_seed_ring") as THREE.Mesh | undefined;

    if (brackets) {
      const material = brackets.material as THREE.LineBasicMaterial;
      material.color.set(primaryColor);
      material.opacity = result.valid ? 0.85 : 0.6;
    }
    if (seedCenterRing) (seedCenterRing.material as THREE.MeshBasicMaterial).color.set(primaryColor);

    if (seedMarker) seedMarker.visible = result.valid;
    if (invalidMarker) invalidMarker.visible = !result.valid;
  }

  private registerInteractionMaterials(id: string, root: THREE.Object3D): void {
    const variants = new Map<THREE.Material, THREE.MeshStandardMaterial>();
    const variantFor = (source: THREE.Material): THREE.Material => {
      if (!(source instanceof THREE.MeshStandardMaterial) || source.emissive.getHex() !== 0) return source;
      let material = variants.get(source);
      if (!material) {
        material = source.clone();
        material.onBeforeCompile = source.onBeforeCompile;
        material.customProgramCacheKey = source.customProgramCacheKey.bind(source);
        material.emissive.set(PALETTE_HEX.accent_teal_01);
        material.emissiveIntensity = 0;
        variants.set(source, material);
      }
      return material;
    };
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.material = Array.isArray(object.material) ? object.material.map(variantFor) : variantFor(object.material);
    });
    this.interactionMaterials.set(id, [...variants.values()]);
  }

  public setInteractionTargetFeedback(position: { x: number; y: number; z: number } | null, entityId?: string): void {
    const materialId = position ? entityId ?? null : null;
    if (materialId !== this.activeInteractionMaterialId) {
      for (const material of this.interactionMaterials.get(this.activeInteractionMaterialId ?? "") ?? []) material.emissiveIntensity = 0;
      this.activeInteractionMaterialId = materialId;
    }
    this.cropInstances.setHighlight(position ? entityId ?? null : null, this.prefersReducedMotion);
    this.renderer.domElement.style.cursor = position ? "pointer" : "";
    // The mounted donkey remains the active Dismount target so the prompt can
    // stay visible, but its ground ring is redundant beneath the rider.
    if (!position || Boolean(this.donkeyPresentation?.attachedMountId)) {
      this.interactionFeedback.visible = false;
      return;
    }
    this.interactionFeedback.visible = true;
    this.interactionFeedback.position.set(position.x, position.y + 0.055, position.z);
  }

  public punchCropHarvest(id: string, timeSeconds: number): void {
    if (!this.prefersReducedMotion) this.cropInstances.punchHarvest(id, timeSeconds);
  }

  public setQuestWaypoint(position: { x: number; y: number; z: number } | null): void {
    if (!position) {
      this.questWaypointVisible = false;
      this.questWaypointRing.visible = false;
      this.questWaypointShaft.visible = false;
      return;
    }
    this.questWaypointVisible = true;
    this.questWaypointRing.visible = true;
    this.questWaypointRing.position.set(position.x, position.y + 0.065, position.z);
    this.questWaypointShaft.position.set(position.x, position.y, position.z);
  }

  /**
   * Cross-fades the waypoint between its two ranges and breathes it.
   *
   * Far out the shaft carries the target and the ground ring is a speck; inside
   * `QUEST_BEACON_NEAR_METERS` that inverts, because a 14 m pillar standing on
   * the NPC you walked here to talk to hides them.
   */
  private updateQuestWaypoint(camera: THREE.Camera, deltaSeconds: number): void {
    if (!this.questWaypointVisible) return;
    this.questWaypointElapsedSeconds += deltaSeconds;

    const distance = camera.position.distanceTo(this.questWaypointShaft.position);
    const { shaftStrength, ringStrength } = questBeaconRangeMix(distance);
    const pulse = this.prefersReducedMotion
      ? 1
      : 0.86 + 0.14 * Math.sin(this.questWaypointElapsedSeconds * 2.1);

    const shaftMaterial = this.questWaypointShaft.material as THREE.MeshBasicMaterial;
    shaftMaterial.opacity = QUEST_BEACON_SHAFT_OPACITY * shaftStrength * pulse;
    this.questWaypointShaft.visible = shaftMaterial.opacity > 0.01;

    const ringMaterial = this.questWaypointRing.material as THREE.MeshBasicMaterial;
    ringMaterial.opacity = 0.72 * ringStrength;
    if (!this.prefersReducedMotion) {
      this.questWaypointRing.rotation.z = this.questWaypointElapsedSeconds * 0.5;
    }
  }


  public getTerrainMesh(): THREE.Mesh | null {
    return this.terrainMeshes[0] ?? null;
  }

  public getTerrainMeshes(): readonly THREE.Mesh[] {
    return this.terrainMeshes;
  }

  /**
   * DEV-only snapshot of the live shadow/fog/draw state. Graphics work needs a
   * way to confirm what the renderer actually does rather than what the
   * configuration says it should do.
   */
  public renderDiagnostics(): WorldRenderDiagnostics {
    let meshes = 0;
    let batched = 0;
    let instances = 0;
    let casters = 0;
    let receivers = 0;
    const casterNames: string[] = [];
    // Triangles attributed to the scene subtree they hang from. A render
    // budget is unactionable without knowing which layer spends it — this is
    // the difference between "1.5M triangles" and "ground cover is 60% of it".
    const trianglesByGroup = new Map<string, number>();
    const groupOf = (object: THREE.Object3D): string => {
      let node: THREE.Object3D | null = object;
      let label = object.name || object.type;
      while (node && node.parent && node.parent !== this.scene) {
        node = node.parent;
        if (node.name) label = node.name;
      }
      return node?.name || label;
    };
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh) && !(object instanceof THREE.BatchedMesh)) return;
      if (object.layers.mask === 0) return;
      meshes += 1;
      if (object instanceof THREE.BatchedMesh) batched += 1;
      if (object instanceof THREE.InstancedMesh) instances += object.count;
      const geometry = (object as THREE.Mesh).geometry;
      if (geometry) {
        const indexed = geometry.index?.count ?? geometry.attributes?.position?.count ?? 0;
        let triangles = indexed / 3;
        if (object instanceof THREE.InstancedMesh) triangles *= object.count;
        const key = groupOf(object);
        trianglesByGroup.set(key, (trianglesByGroup.get(key) ?? 0) + triangles);
      }
      if (object.castShadow) {
        casters += 1;
        if (casterNames.length < 24) casterNames.push(object.name || object.type);
      }
      if (object.receiveShadow) receivers += 1;
    });
    const lights: Array<Record<string, unknown>> = [];
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Light)) return;
      if (object.intensity <= 0 && !object.castShadow) return;
      const shadow = (object as THREE.DirectionalLight).shadow;
      lights.push({
        type: object.type,
        name: object.name,
        intensity: Number(object.intensity.toFixed(3)),
        castShadow: object.castShadow,
        mapSize: shadow ? [shadow.mapSize.x, shadow.mapSize.y] : null,
        hasMap: Boolean(shadow?.map),
        position: object.position.toArray().map((value) => Number(value.toFixed(2)))
      });
    });
    const fog = this.scene.fog;
    return {
      meshes,
      batched,
      instances,
      casters,
      receivers,
      casterNames,
      trianglesByGroup: [...trianglesByGroup.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([group, triangles]) => ({ group, triangles: Math.round(triangles) })),
      lights: lights.slice(0, 12),
      fog: fog instanceof THREE.Fog
        ? { near: fog.near, far: fog.far, color: fog.color.getHexString() }
        : fog
          ? { type: "other" }
          : null,
      shadowMap: {
        enabled: this.renderer.shadowMap.enabled,
        type: this.renderer.shadowMap.type,
        autoUpdate: this.renderer.shadowMap.autoUpdate
      },
      exposure: this.renderer.toneMappingExposure,
      qualityTier: this.qualityTier,
      render: {
        calls: this.renderer.info.render.calls,
        triangles: this.renderer.info.render.triangles,
        programs: this.renderer.info.programs?.length ?? 0
      },
      pipeline: this.rendererPipeline.diagnostics(),
      fieldOverlay: this.diagnosticOverlayMode
    };
  }

  public raycastTerrain(
    camera: THREE.Camera,
    pointerNdc: { x: number; y: number }
  ): { x: number; y: number; z: number } | null {
    if (this.terrainMeshes.length === 0) return null;
    this.raycaster.setFromCamera(new THREE.Vector2(pointerNdc.x, pointerNdc.y), camera);
    const hit = this.raycaster.intersectObjects(this.terrainMeshes, false)[0];
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
    const y = WorldLayout.traversalSurfaceHeight(x, z);
    npc.anchor = { x, z, rotationY };
    npc.initialRotationY = rotationY;
    npc.model.position.set(x, y, z);
    npc.model.rotation.y = rotationY;
    npc.beat = createNpcStationBeatState();
    npc.pendingAnimationSeconds = 0;
    npc.motionFrame = null;
    npc.lastAnimationContext = null;
    npc.animator.resetSpatialState();
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
    const instance = await this.loadModel(assetId);
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
    this.rigidAnimationBatches.get(root)?.dispose();
    this.rigidAnimationBatches.delete(root);
    for (let index = this.practicalLights.length - 1; index >= 0; index -= 1) {
      const practical = this.practicalLights[index];
      if (!practical || practical.root !== root) continue;
      practical.glow?.removeFromParent();
      practical.glow?.material.dispose();
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
    for (const terrace of SUNREACH_FARM_LAYOUT.plantableAreas) {
      this.environmentGroup.add(buildStarterFarmGround({
        origin: SUNREACH_FARM_LAYOUT.origin,
        plantableArea: terrace,
        heightAt: (worldX, worldZ) => WorldLayout.terrainHeight(worldX, worldZ),
        surfaceMaterial: this.cultivatedSurfaceMaterial.material
      }));
    }
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
      object.castShadow = castShadow;
      object.receiveShadow = true;
    });
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
    this.practicalLights.push({ light, root, qualityEnabled: true, glow: this.createPracticalGlow(light) });
    this.applyPracticalLightBudget();
  }

  /**
   * The emissive response for a practical light: one additive sprite parented to
   * the light itself, so it inherits the light's position and needs no per-frame
   * transform work. Parenting also means an invisible light's glow is skipped by
   * the same traversal, keeping this inside the practical-light budget.
   */
  private createPracticalGlow(light: THREE.PointLight): THREE.Sprite | null {
    if (!CANONICAL_RENDER_CONFIG.bloom.enabled) return null;
    this.practicalGlowTexture ??= createPracticalGlowTexture();
    const sprite = new THREE.Sprite(createPracticalGlowMaterial(
      this.practicalGlowTexture,
      CANONICAL_RENDER_CONFIG.practicalLights.colorHex
    ));
    sprite.scale.setScalar(CANONICAL_RENDER_CONFIG.bloom.glowSizeMeters);
    sprite.renderOrder = 1;
    light.add(sprite);
    return sprite;
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
    const farmhouse = await this.loadModel(STATIC_LANDMARK_ASSETS.farmhouse);
    this.placeLandmark(farmhouse, "farmhouse");
    this.tagLayoutEdit(farmhouse, createFarmsteadTag("farmhouse"));
    this.environmentGroup.add(farmhouse);
    this.attachPracticalLights(farmhouse);

    const well = await this.loadModel(STATIC_LANDMARK_ASSETS.well);
    this.placeLandmark(well, "well");
    this.tagLayoutEdit(well, createFarmsteadTag("well"));
    this.environmentGroup.add(well);

    // 2. Stone Bridge crossing river
    const bridge = await this.loadModel(STATIC_LANDMARK_ASSETS.bridge);
    this.placeLandmark(bridge, "bridge");
    this.tagLayoutEdit(bridge, createLandmarkTag("bridge", WorldLayout.landmark("bridge").yOffset));
    this.environmentGroup.add(bridge);
    this.attachPracticalLights(bridge);

    // 3. Harbor Dock extending into water
    const dock = await this.loadModel(STATIC_LANDMARK_ASSETS.dock);
    this.placeLandmark(dock, "dock");
    this.tagLayoutEdit(dock, createLandmarkTag("dock", WorldLayout.landmark("dock").yOffset));
    this.environmentGroup.add(dock);
    this.attachPracticalLights(dock);

    const fishMarket = await this.loadModel(STATIC_LANDMARK_ASSETS.fishMarket);
    this.placeLandmark(fishMarket, "fish-market");
    this.tagLayoutEdit(fishMarket, createLandmarkTag("fish-market", 0));
    this.registerInteractionMaterials("market.harbor", fishMarket);
    this.environmentGroup.add(fishMarket);
    this.attachPracticalLights(fishMarket);

    // Distant working landmarks establish the same farm-to-coast depth hierarchy
    // as the reference without copying its exact diorama layout.
    const lighthouse = await this.loadModel(STATIC_LANDMARK_ASSETS.lighthouse);
    this.placeLandmark(lighthouse, "lighthouse");
    this.tagLayoutEdit(lighthouse, createLandmarkTag("lighthouse", 0));
    this.environmentGroup.add(lighthouse);
    this.attachPracticalLights(lighthouse);

    const windmill = await this.loadModel(STATIC_LANDMARK_ASSETS.windmill);
    this.placeLandmark(windmill, "windmill");
    this.tagLayoutEdit(windmill, createFarmStructureTag("struct.starter_mill"));
    this.environmentGroup.add(windmill);
    this.configureWindmillRotor(windmill);
    this.attachPracticalLights(windmill);

    const workbenchAnchor = starterStructureAnchor("struct.workbench")!;
    const workbench = await this.loadModel(STATIC_LANDMARK_ASSETS.workbench);
    workbench.position.set(
      workbenchAnchor.x,
      WorldLayout.terrainHeight(workbenchAnchor.x, workbenchAnchor.z),
      workbenchAnchor.z
    );
    workbench.rotation.y = getProcessingStationRuntimeRotationY("struct.workbench");
    this.registerInteractionMaterials("struct.workbench", workbench);
    this.environmentGroup.add(workbench);
    this.tagLayoutEdit(workbench, createFarmStructureTag("struct.workbench"));

    const compostAnchor = starterStructureAnchor("struct.starter_compost")!;
    const compost = await this.loadModel(STATIC_LANDMARK_ASSETS.compost);
    compost.position.set(
      compostAnchor.x,
      WorldLayout.terrainHeight(compostAnchor.x, compostAnchor.z),
      compostAnchor.z
    );
    compost.rotation.y = getProcessingStationRuntimeRotationY("struct.starter_compost");
    this.registerInteractionMaterials("struct.starter_compost", compost);
    this.environmentGroup.add(compost);
    this.tagLayoutEdit(compost, createFarmStructureTag("struct.starter_compost"));

    const fishTable = await this.loadModel(STATIC_LANDMARK_ASSETS.fishTable);
    fishTable.position.set(
      HARBOR_FISH_TABLE.position.x,
      WorldLayout.terrainHeight(HARBOR_FISH_TABLE.position.x, HARBOR_FISH_TABLE.position.z),
      HARBOR_FISH_TABLE.position.z
    );
    fishTable.rotation.y = getProcessingStationRuntimeRotationY(HARBOR_FISH_TABLE.structureId);
    this.registerInteractionMaterials("struct.harbor_fish_table", fishTable);
    this.environmentGroup.add(fishTable);
    this.tagLayoutEdit(
      fishTable,
      createWorldAnchorTag("struct.harbor_fish_table", "processing-station")
    );

    const produceStall = await this.loadModel(STATIC_LANDMARK_ASSETS.produceStall);
    this.placeLandmark(produceStall, "produce-stall");
    this.tagLayoutEdit(produceStall, createLandmarkTag("produce-stall", 0));
    this.registerInteractionMaterials("market.village", produceStall);
    this.environmentGroup.add(produceStall);

    const farmPropAssets = STATIC_FARM_PROP_ASSETS;
    for (const anchor of STARTER_FARM_LAYOUT.propAnchors) {
      const object = await this.loadModel(farmPropAssets[anchor.type]);
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
    const interiorShell = await this.loadModel(STATIC_LANDMARK_ASSETS.interiorShell);
    interiorShell.position.set(
      FARMHOUSE_INTERIOR_ORIGIN.x,
      FARMHOUSE_INTERIOR_ORIGIN.y,
      FARMHOUSE_INTERIOR_ORIGIN.z
    );
    interiorShell.rotation.y = 0;
    this.environmentGroup.add(interiorShell);

    for (const propPlacement of FARMHOUSE_INTERIOR_PROPS) {
      const propModel = await this.loadModel(propPlacement.assetId);
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
      if (
        placement.origin === "seeded-fill"
        && spec.collision !== "none"
        && !SEEDED_FILL_COLLIDING_FAMILIES.has(spec.family)
      ) {
        throw new Error(
          `[WorldScene] Seeded-fill placement ${placement.id} cannot use colliding asset ${placement.assetId}`
        );
      }
      const object = await this.loadModel(assetId);
      object.position.set(placement.x, placement.y ?? WorldLayout.terrainHeight(placement.x, placement.z), placement.z);
      object.rotation.y = placement.rotationY;
      object.scale.set(placement.scale[0], placement.scale[1], placement.scale[2]);
      if (placement.id === "authored.sunreach.cove-market") this.registerInteractionMaterials("market.sunreach_cove", object);
      object.userData.environmentPlacementId = placement.id;
      object.userData.environmentPlacementOrigin = placement.origin;
      object.userData.islandId = placement.islandId ?? WorldLayout.islandAt(placement.x, placement.z) ?? "island.neva";
      const padId = ARCHITECTURE_PLACEMENT_TO_PAD[placement.id];
      if (padId) {
        object.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return;
          child.material = Array.isArray(child.material)
            ? child.material.map((material) => architectureWindowMaterial(material, padId))
            : architectureWindowMaterial(child.material, padId);
        });
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
        await yieldToTask(this.startupSignal);
    this.checkAlive();
      }
    }
    this.rebuildLayoutGroundingPatches();

    await this.loadAmbientFlyers();

    // 7. Fences framing the 8 x 8 planting area with authored entrances.
    for (const anchor of STARTER_FARM_LAYOUT.fenceAnchors) {
      const fence = await this.loadModel(STATIC_LANDMARK_ASSETS.fence);
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
    for (const root of spawnedRoots) this.applyVegetationInstanceVariation(root);
    if (import.meta.env.DEV) {
      for (const root of spawnedRoots) this.applyLayoutEditShadowFollow(root);
    } else {
      for (const root of spawnedRoots) {
        const assetId = root.userData.assetId as AssetId | undefined;
        if (assetId && (this.faunaKindForAsset(assetId)
          || assetId === ASSET_IDS.FAUNA_GULL_A || assetId === ASSET_IDS.FAUNA_BUTTERFLY_A)) {
          this.rigidAnimationBatches.set(root, new RigidAnimationBatch(root));
        }
      }
    }
    if (this.windmillRotor) this.batchCompatibleMeshes(this.windmillRotor, () => false);

    for (const child of staticAssetRoots) {
      this.environmentGroup.remove(child);
      this.staticPrefabGroup.add(child);
    }
    // Mesh merge pulls visible geometry into BatchedMesh siblings and then
    // strips LOD children, leaving layout-edit tags on empty groups. DEV
    // keeps live meshes so F2 picking/dragging can hit the object you see.
    if (!import.meta.env.DEV) this.mergeStaticPrefabMeshes();

    const farmhouseSmoke = await this.loadModel(STATIC_LANDMARK_ASSETS.farmhouseSmoke);
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
        const model = await this.loadModel(assetId);
        const y = WorldLayout.traversalSurfaceHeight(npc.anchor.x, npc.anchor.z);
        model.position.set(npc.anchor.x, y, npc.anchor.z);
        model.rotation.y = npc.anchor.rotationY;
        model.userData.dynamicPresentation = true;
        this.tagLayoutEdit(model, createNpcTag(npc.id));
        this.setShadowPolicy(model, CANONICAL_RENDER_CONFIG.shadows.castCharacters);

        // Ground contact shadow disc
        if (this.lightingRig.contactShadowsEnabled()) {
          const shadowMesh = createContactShadowMesh(0.48, 0.33, CANONICAL_RENDER_CONFIG.contact.opacity);
          shadowMesh.position.set(0, 0.02, 0);
          model.add(shadowMesh);
        }

        const animator = new HumanoidAnimator(model);
        this.environmentGroup.add(model);
        this.npcPresentations.set(npc.id, {
          id: npc.id,
          assetId,
          anchor: { ...npc.anchor },
          model,
          animator,
          initialRotationY: npc.anchor.rotationY,
          detailReduced: false,
          lastPresentationUpdateSeconds: 0,
          pendingAnimationSeconds: 0,
          beat: createNpcStationBeatState(),
          motionFrame: null,
          lastAnimationContext: null
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
   * Vegetation shares one palette material across every placement, so without
   * a per-instance signal every tree in a stand renders the identical green.
   * The variant material keeps them inside a single static batch.
   */
  private applyVegetationInstanceVariation(root: THREE.Object3D): void {
    const assetId = root.userData.assetId as AssetId | undefined;
    const spec = assetId ? ASSET_BY_ID.get(assetId) : undefined;
    if (spec?.family !== "vegetation") return;
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
      const weighted = Boolean(object.geometry.getAttribute("_neva_wind"));
      object.material = vegetationInstanceTintMaterial(object.material, weighted);
      if (weighted) {
        object.customDepthMaterial = coastalVegetationDepthMaterial(object.material);
        if (!object.geometry.userData.coastalWindBounds) {
          object.geometry.computeBoundingBox();
          object.geometry.computeBoundingSphere();
          object.geometry.boundingBox?.expandByScalar(CANONICAL_RENDER_CONFIG.vegetationWind.coastalAmplitudeMeters);
          if (object.geometry.boundingSphere) object.geometry.boundingSphere.radius += CANONICAL_RENDER_CONFIG.vegetationWind.coastalAmplitudeMeters;
          object.geometry.userData.coastalWindBounds = true;
        }
      }
    });
  }

  private applyStaticShadowPolicy(root: THREE.Object3D): void {
    const assetId = root.userData.assetId as AssetId | undefined;
    const spec = assetId ? ASSET_BY_ID.get(assetId) : undefined;
    if (!spec) return;
    if (assetId === ASSET_IDS.FAUNA_GULL_A || assetId === ASSET_IDS.FAUNA_BUTTERFLY_A) {
      this.setShadowPolicy(root, CANONICAL_RENDER_CONFIG.shadows.castAmbientFlyers);
      return;
    }
    if (assetId === ASSET_IDS.FAUNA_DONKEY_A) {
      // Catalog family stays "prop" for the mount contract, but the ridden
      // donkey is a character silhouette rather than a small prop.
      this.setShadowPolicy(root, CANONICAL_RENDER_CONFIG.shadows.castCharacters);
      return;
    }
    // Reeds and bushes stay out of the sun pass: at gameplay shadow-map
    // density their silhouettes alias more than they ground the object.
    const isMinorFoliage = assetId === ASSET_IDS.FOLIAGE_BUSH_A || assetId === ASSET_IDS.FOLIAGE_REEDS_A;
    const castShadow = spec.family === "prop"
      ? CANONICAL_RENDER_CONFIG.shadows.castSmallProps
      : spec.family === "rock"
        ? CANONICAL_RENDER_CONFIG.shadows.castRocks
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
      if (object.name.startsWith("COL_")) {
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
    const uvStrippedGeometries = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
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
        let geometry = uvStrippedGeometries.get(object.geometry);
        if (!geometry) {
          const stripped = object.geometry.clone();
          stripped.deleteAttribute("uv");
          uvStrippedGeometries.set(object.geometry, stripped);
          geometry = stripped;
        }
        object.geometry = geometry;
      }
      const attributes = (Object.entries(object.geometry.attributes) as Array<
        [string, THREE.BufferAttribute]
      >)
        .map(([name, attribute]) =>
          `${name}:${attribute.itemSize}:${attribute.normalized}:${attribute.array.constructor.name}`
        )
        .sort()
        .join("|");
      const worldX = object.matrixWorld.elements[12];
      const worldZ = object.matrixWorld.elements[14];
      const islandBatchKey = WorldLayout.islandAt(worldX, worldZ) ?? "ocean";
      const chunkKey = trackStaticLods
        ? `${islandBatchKey}:${Math.floor(worldX / STATIC_BATCH_CHUNK_SIZE_METERS)}:${Math.floor(worldZ / STATIC_BATCH_CHUNK_SIZE_METERS)}`
        : "unbounded";
      const batchRegion = trackStaticLods ? islandBatchKey : "unbounded";
      const signature = `${batchRegion}|${object.material.uuid}|cast:${object.castShadow}|receive:${object.receiveShadow}|indexed:${Boolean(object.geometry.index)}|${attributes}`;
      const group = compatibleGroups.get(signature) ?? {
        material: object.material,
        sources: [] as StaticBatchSource[]
      };
      group.sources.push({ mesh: object, lod, chunkKey });
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
      }
      const chunks = new Map<string, { chunk: StaticBatchChunk; bounds: THREE.Sphere }>();
      for (const { mesh, lod, chunkKey } of sources) {
        const geometryId = geometryIds.get(mesh.geometry.uuid);
        if (geometryId === undefined) continue;
        const instanceId = batched.addInstance(geometryId);
        const relativeMatrix = new THREE.Matrix4().multiplyMatrices(rootWorldInverse, mesh.matrixWorld);
        batched.setMatrixAt(instanceId, relativeMatrix);
        if (trackStaticLods) {
          let chunkRecord = chunks.get(chunkKey);
          if (!chunkRecord) {
            chunkRecord = {
              chunk: { batch: batched, instances: [], center: new THREE.Vector3(), radius: 0, visible: true },
              bounds: new THREE.Sphere().makeEmpty()
            };
            chunks.set(chunkKey, chunkRecord);
          }
          const instance: StaticBatchInstance = {
            batch: batched,
            instanceId,
            chunk: chunkRecord.chunk,
            lodVisible: true,
            visible: true
          };
          chunkRecord.chunk.instances.push(instance);
          chunkRecord.bounds.union(batched.getBoundingSphereAt(geometryId, new THREE.Sphere())!.applyMatrix4(relativeMatrix));
          if (lod) this.staticLodBatchInstances.push(Object.assign(instance, lod));
        }
        mesh.parent?.remove(mesh);
      }
      batched.name = `runtime_batch_${batchIndex++}`;
      batched.computeBoundingBox();
      batched.computeBoundingSphere();
      batched.frustumCulled = true;
      batched.castShadow = sources[0].mesh.castShadow;
      batched.customDepthMaterial = sources[0].mesh.customDepthMaterial;
      batched.receiveShadow = sources[0]?.mesh.receiveShadow ?? true;
      root.add(batched);
      for (const { chunk, bounds } of chunks.values()) {
        bounds.applyMatrix4(root.matrixWorld);
        chunk.center.copy(bounds.center);
        chunk.radius = bounds.radius;
        this.staticBatchChunks.push(chunk);
      }
    }
    for (const geometry of uvStrippedGeometries.values()) geometry.dispose();
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
      chunk.visible = visible;
      for (const instance of chunk.instances) this.updateStaticBatchInstanceVisibility(instance);
    }
  }

  private updateStaticLodBatches(): void {
    const distanceScale = qualityValueAtLevel(this.qualityLevel, (quality) => quality.lodDistanceScale);
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
      instance.lodVisible = selectedLevel === instance.levelIndex;
      this.updateStaticBatchInstanceVisibility(instance);
    }
  }

  private updateStaticBatchInstanceVisibility(instance: StaticBatchInstance): void {
    const visible = instance.lodVisible && instance.chunk.visible;
    if (visible === instance.visible) return;
    instance.batch.setVisibleAt(instance.instanceId, visible);
    instance.visible = visible;
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
      const distance = Math.hypot(
        this.visibilityAnchor.x - this.tempCharacterWorldPosition.x,
        this.visibilityAnchor.z - this.tempCharacterWorldPosition.z
      );
      const reduced = this.playerDetailReduced
        ? distance > CHARACTER_DETAIL_RESTORE_DISTANCE_METERS
        : distance > CHARACTER_DETAIL_DISTANCE_METERS;
      if (reduced !== this.playerDetailReduced) {
        this.setCharacterDetailVisibility(this.playerMesh, reduced);
        this.playerDetailReduced = reduced;
      }
    }
    for (const npc of this.npcPresentations.values()) {
      npc.model.getWorldPosition(this.tempCharacterWorldPosition);
      const distance = Math.hypot(
        this.visibilityAnchor.x - this.tempCharacterWorldPosition.x,
        this.visibilityAnchor.z - this.tempCharacterWorldPosition.z
      );
      const reduced = npc.detailReduced
        ? distance > CHARACTER_DETAIL_RESTORE_DISTANCE_METERS
        : distance > CHARACTER_DETAIL_DISTANCE_METERS;
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
    this.visibilityLodCamera.zoom = qualityValueAtLevel(
      this.qualityLevel,
      (quality) => quality.lodDistanceScale
    );
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
      let current: THREE.Object3D | null = object;
      while (current && current !== root) {
        if ((current as THREE.Bone).isBone || animatedNames.has(current.name)) return true;
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
  /**
   * Receives the application's single per-frame reading of the player. The
   * object is owned and mutated by the caller, so this stores the reference and
   * only overrides the reduced-motion flag the renderer already owns.
   */
  public setPlayerPresence(presence: PlayerPresence): void {
    presence.reducedMotion = this.prefersReducedMotion;
    this.playerPresence = presence;
  }

  /**
   * Invites people near a committed event to acknowledge it. This is a local,
   * transient presentation pulse; it cannot advance dialogue or relationship
   * state and disappears without being serialized.
   */
  public playWorldReaction(
    kind: WorldReactionKind,
    position: { x: number; z: number },
    timeSeconds: number
  ): void {
    this.socialReactions.trigger(kind, position.x, position.z, timeSeconds);
  }

  /** Adds short-lived weight to physical cargo and docking over water buoyancy. */
  public playBoatResponse(
    boatId: string,
    kind: BoatResponseKind,
    timeSeconds: number,
    slotIndex = 0
  ): void {
    this.boatResponses.trigger(boatId, kind, timeSeconds, slotIndex);
  }

  public updateEnvironment(
    state: Readonly<GameState>,
    timeSeconds: number,
    focus: THREE.Vector3
  ): void {
    const appearance = this.weatherPresentation.sample(state.weather, state.worldSeed, timeSeconds);
    const frame = this.lightingRig.update(state, timeSeconds, focus, this.prefersReducedMotion, appearance);
    this.atmosphereSky?.update(frame, appearance.weather, state.worldSeed, timeSeconds, this.prefersReducedMotion);
    if (this.practicalLightFocus.distanceToSquared(focus) >= 0.25) {
      this.practicalLightFocus.copy(focus);
      this.applyPracticalLightBudget();
    }
    // Window and lantern emissives share the practical lights' time-of-day
    // envelope, so a lit window and the pool of light it casts come up together.
    PaletteMaterials.setEmissiveLevel(frame.practicalLightIntensity);
    updateArchitectureWindows(frame.practicalLightIntensity);
    const practicalIntensity =
      CANONICAL_RENDER_CONFIG.practicalLights.localIntensity * frame.practicalLightIntensity;
    const glowOpacity = CANONICAL_RENDER_CONFIG.bloom.strength * frame.practicalLightIntensity;
    for (const practical of this.practicalLights) {
      practical.light.intensity = practicalIntensity;
      practical.light.visible = practical.qualityEnabled && frame.practicalLightIntensity > 0.002;
      if (practical.glow) practical.glow.material.opacity = glowOpacity;
    }
    if (this.playerContactShadow) {
      setContactShadowOpacity(
        this.playerContactShadow,
        CANONICAL_RENDER_CONFIG.contact.opacity
          * this.qualityContactStrength
          * THREE.MathUtils.lerp(0.42, 1, frame.daylight)
      );
    }
    this.water.updateLighting(frame);
    this.shoreFoam.updateLighting(frame);
    this.boatWakes.updateLighting(frame);
    this.terrainSurfaceMaterial.updateWeather(appearance.weather.precipitation, timeSeconds);
    const sharedGroundWetness = this.terrainSurfaceMaterial.wetness;
    setRainSurfaceWetness(sharedGroundWetness, !WorldLayout.isInterior(focus.x, focus.z));
    this.roadSurfaceMaterial.setWetness(sharedGroundWetness);
    this.cultivatedSurfaceMaterial.setWetness(sharedGroundWetness);
    this.updateAmbientMotion(state, timeSeconds);
    this.updateStationActivity(state, timeSeconds, focus);
    this.fireflyField.update({
      focus,
      timeSeconds,
      nightVisibility: fireflyNightVisibility(frame.ambientDaylight),
      reducedMotion: this.prefersReducedMotion,
      presenceRepelMeters: this.playerPresence.moving ? 0.9 : 0.35
    });
    this.rainField.update({
      focus,
      timeSeconds,
      precipitation: appearance.weather.precipitation,
      wind: this.weatherMotion,
      waterConditions: this.waterConditions(state),
      reducedMotion: this.prefersReducedMotion,
      daylight: frame.daylight
    });
  }

  private waterConditions(state: Readonly<GameState>): WaterConditions {
    const weather = this.weatherPresentation.current?.weather ?? state.weather;
    this.waterConditionSnapshot.seaRoughness = weather.seaRoughness;
    this.waterConditionSnapshot.windDirectionDeg = weather.windDirectionDeg;
    this.waterConditionSnapshot.windSpeed = this.weatherMotion.effectiveWindSpeed;
    return this.waterConditionSnapshot;
  }

  /**
   * Returns the latest presentation-only fish target for the camera. The
   * encounter remains simulation-owned; this is just the endpoint already
   * used to draw the line and hooked fish in the current frame.
   */
  public getSportFishingPresentation(): Readonly<SportFishingPresentationSample> | undefined {
    return this.sportFishingCameraHint && this.sportFishEndCue === null
      ? this.sportFishingPresentation
      : undefined;
  }

  public playSportFishingEndCue(cue: SportFishingEndCue): void {
    if (this.lastFishingInstanceId === null) return;
    this.sportFishEndCue = cue;
    this.sportFishEndBeatSeconds = cue === "landed" ? 0.7 : cue === "snapped" ? 0.28 : 0.5;
    this.sportFishEndLook.copy(this.fishingEndpointWorld);
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
      this.cosmeticCropCarryUntilSeconds = this.characterElapsedSeconds + 1.4;
    }
  }

  public beginPlayerAttachmentAction(action: PlayerAttachmentAction, targetId: string): void {
    if (!this.playerMesh || !this.playerAnimation) {
      this.playPlayerAction(action);
      return;
    }
    this.playerMesh.updateWorldMatrix(true, true);
    const sourcePosition = new THREE.Vector3();
    const sourceQuaternion = new THREE.Quaternion();
    const sourceScale = new THREE.Vector3();
    this.playerMesh.matrixWorld.decompose(sourcePosition, sourceQuaternion, sourceScale);

    let clip: PlayerAnimation | null = action;
    if (action === "board" || action === "dock") {
      const boat = this.boatMeshes.get(targetId);
      const isSkiff = Boolean(boat?.getObjectByName("boat_skiff_driver_station"));
      clip = attachmentClip(action, { skiff: isSkiff });
    } else if (action === "mount") {
      const donkey = this.donkeyPresentation;
      if (donkey) {
        const approach = donkey.root.worldToLocal(sourcePosition.clone());
        clip = attachmentClip("mount", { side: attachmentSideFromLocalX(approach.x) });
      }
    } else {
      // The simulation-selected dismount point is available on the next
      // presented frame. Resolve the mirrored clip from that exact point.
      clip = null;
    }

    const durationSeconds = clip
      ? this.playerAnimation.actionDurationSeconds(clip)
      : this.playerAnimation.actionDurationSeconds("dismount");
    this.playerAttachmentTransition = {
      action,
      targetId,
      clip,
      startedAtSeconds: this.characterElapsedSeconds,
      durationSeconds,
      sourcePosition,
      sourceQuaternion,
      sourceScale,
      detachedAtContact: false
    };
    if (clip) this.playerAnimation.play(clip);
    if (action === "mount" && this.donkeyPresentation?.id === targetId) {
      this.attachPlayerToDonkey(this.donkeyPresentation, targetId, this.characterElapsedSeconds);
    }
  }

  public playerAnimationActionDurationSeconds(action: PlayerAnimation): number {
    return this.playerAnimation?.actionDurationSeconds(action) ?? 0.8;
  }

  public setFarmingActionPresentation(
    action: FarmingPresentationActionName,
    phase: FarmingPresentationPhase,
    _timeSeconds: number,
    presentationKind?: ProcessingPresentationKind | "ready-equipment"
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
              ? presentationKind === "tailoring" ? "tailor"
                : presentationKind === "toolmaking" ? "toolmaking"
                  : "scoop"
              : action === "processing-collect" || action === "pickup"
                ? presentationKind === "ready-equipment" ? "ready" : "basket"
                : null;
      if (key) this.showFarmingProp(key);
      return;
    }
    if (phase === "committed" && action === "harvest") {
      this.hideFarmingProps();
      this.showFarmingProp("bundle");
      this.cosmeticCropCarryUntilSeconds = this.characterElapsedSeconds + 1.6;
      return;
    }
    if (phase === "completed") {
      if (action === "harvest") {
        this.showFarmingProp("bundle");
        this.cosmeticCropCarryUntilSeconds = Math.max(
          this.cosmeticCropCarryUntilSeconds,
          this.characterElapsedSeconds + 1.1
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
        object: await this.loadModel(attachment.assetId)
      }))
    );
    if (this.farmingPropsAttached || player !== this.playerMesh) return;
    for (const { attachment, object: payload } of loaded) {
      const object = attachment.key === "bundle" || attachment.key === "basket"
        ? createCarryCradle(payload) : payload;
      const socket = player.getObjectByName(attachment.socket);
      if (!socket) throw new Error(`[WorldScene] Missing farming prop socket ${attachment.socket}`);
      object.name = `cosmetic_${attachment.key}`;
      object.visible = false;
      applyEquipmentSocketPose(object, attachment.assetId);
      object.userData.socketBaseQuaternion = object.quaternion.clone();
      object.userData.dynamicPresentation = true;
      this.setShadowPolicy(object, false);
      socket.add(object);
      this.farmingProps.set(attachment.key, object);
      if (attachment.key === "rod") this.fishingRodBend = new FishingRodBend(object);
    }
    this.farmingPropsAttached = true;
  }

  private async syncPlayerEquipment(state: Readonly<GameState>): Promise<void> {
    await this.playerEquipmentAssembler?.sync(characterVisualLoadoutFromState(state));
  }

  private configureRowboatPresentation(boatId: string, boatRoot: THREE.Group): void {
    if (this.rowboatPresentationRigs.has(boatId)) return;
    const rowerSeat = boatRoot.getObjectByName("boat_rowboat_rower_seat");
    if (!rowerSeat) throw new Error("[WorldScene] Rowboat is missing boat_rowboat_rower_seat");
    const footLeftSupport = boatRoot.getObjectByName("boat_rowboat_foot_left_socket");
    const footRightSupport = boatRoot.getObjectByName("boat_rowboat_foot_right_socket");
    if (!footLeftSupport || !footRightSupport) {
      throw new Error("[WorldScene] Rowboat is missing authored foot supports");
    }
    this.boatDriverSeats.set(boatId, rowerSeat);
    boatRoot.updateMatrixWorld(true);
    const oars = (["left", "right"] as const).map((side): RowboatOarAttachment => {
      const root = boatRoot.getObjectByName(`boat_rowboat_oar_${side}_root`);
      const grip = boatRoot.getObjectByName(`boat_rowboat_oar_${side}_grip`);
      const oarlock = boatRoot.getObjectByName(`boat_rowboat_oarlock_${side}`);
      if (!root?.parent) {
        throw new Error(`[WorldScene] Rowboat is missing boat_rowboat_oar_${side}_root`);
      }
      if (!grip || !oarlock) {
        throw new Error(`[WorldScene] Rowboat is missing authored ${side} oar grip or oarlock`);
      }
      const oarlockWorld = new THREE.Vector3();
      oarlock.getWorldPosition(oarlockWorld);
      const pivot = new THREE.Group();
      pivot.name = `runtime_rowboat_oar_${side}_pivot`;
      boatRoot.add(pivot);
      pivot.position.copy(boatRoot.worldToLocal(oarlockWorld));
      pivot.updateMatrixWorld(true);
      pivot.attach(root);
      return {
        side,
        pivot,
        root,
        grip,
        restPivotQuaternion: pivot.quaternion.clone()
      };
    });
    this.rowboatPresentationRigs.set(boatId, {
      boatRoot,
      rowerSeat,
      footLeftSupport,
      footRightSupport,
      oars
    });
  }

  private configureSkiffPresentation(boatId: string, boatRoot: THREE.Group): void {
    if (this.boatDriverSeats.has(boatId)) return;
    const driverSeat = boatRoot.getObjectByName("boat_skiff_driver_station");
    if (!driverSeat) throw new Error("[WorldScene] Skiff is missing boat_skiff_driver_station");
    const fishingStation = boatRoot.getObjectByName("boat_skiff_fishing_station");
    if (!fishingStation) throw new Error("[WorldScene] Skiff is missing boat_skiff_fishing_station");
    this.boatDriverSeats.set(boatId, driverSeat);
    this.boatFishingStations.set(boatId, fishingStation);
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
    const mesh = await this.loadModel(ASSET_IDS.BOAT_SKIFF_A);
    if (this.skiffMooringPreview || this.ownedSkiffMeshReady(state)) return;
    mesh.name = "skiff_mooring_preview";
    mesh.userData.dynamicPresentation = true;
    this.scene.add(mesh);
    this.skiffMooringPreview = mesh;
  }

  private syncRowboatOarPresentation(
    activeBoatId: string | null,
    holdingOars: boolean,
    deltaSeconds: number
  ): void {
    const rowing = holdingOars && this.playerAnimation?.currentClip() === "row";
    const phase = this.playerAnimation?.normalizedBasePhase() ?? 0;
    const response = 1 - Math.exp(-16 * Math.max(0, deltaSeconds));
    for (const [boatId, rig] of this.rowboatPresentationRigs) {
      const active = holdingOars && boatId === activeBoatId;
      for (const oar of rig.oars) {
        rowboatOarRotation(phase, active && rowing, oar.side, this.tempOarEuler);
        this.tempOarDeltaQuaternion.setFromEuler(this.tempOarEuler);
        this.tempOarQuaternion.copy(oar.restPivotQuaternion).multiply(this.tempOarDeltaQuaternion);
        oar.pivot.quaternion.slerp(this.tempOarQuaternion, response);
        oar.pivot.updateWorldMatrix(false, true);
        if (active && this.playerAnimation) {
          alignMarkerHand(this.playerAnimation, oar.side, oar.grip);
        }
      }
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

  private updateFarmingProps(clip: PlayerAnimation, timeSeconds: number, carryingFish: boolean): void {
    const visibleKey = clip === "plant"
      ? "seed"
      : clip === "water"
        ? "water"
        : clip === "harvest"
          ? "sickle"
          : clip === "workstation"
            ? "scoop"
            : !carryingFish && (clip === "pickup" || clip === "place")
              ? "basket"
              : fishingClipUsesRod(clip)
                ? "rod"
                : !carryingFish && (clip.startsWith("carry_") || timeSeconds < this.cosmeticCropCarryUntilSeconds)
                  ? "bundle"
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

  /**
   * Ground contact response for one footstep. The surface is classified by the
   * caller from the same world query that picks the footstep audio, so the eye
   * and the ear agree about what was stepped on.
   */
  public spawnFootfall(surface: FootfallSurface, x: number, z: number, timeSeconds: number): void {
    if (this.prefersReducedMotion) return;
    const y = WorldLayout.traversalSurfaceHeight(x, z) + 0.03;
    this.footfallVfx.spawn(surface, { x, y, z }, timeSeconds);
  }

  /**
   * Makes a running processing job legible in the world: work puffs rise from
   * a station while its job is active, and a single ready burst marks the
   * moment it completes. Purely a reading of `processingJobs`; the station
   * meshes, jobs and their timers stay simulation-owned.
   */
  private updateStationActivity(
    state: Readonly<GameState>,
    timeSeconds: number,
    focus: THREE.Vector3
  ): void {
    const jobs = Object.values(state.processingJobs);
    if (jobs.length === 0 && this.announcedCompleteJobs.size > 0) {
      this.announcedCompleteJobs.clear();
      return;
    }
    if (this.announcedCompleteJobs.size > 64) {
      const live = new Set(jobs.map((job) => job.id));
      for (const id of this.announcedCompleteJobs) if (!live.has(id)) this.announcedCompleteJobs.delete(id);
    }
    for (const job of jobs) {
      const station = WORLD_STATION_DEFINITIONS[job.stationId];
      if (!station) continue;
      const dx = station.position.x - focus.x;
      const dz = station.position.z - focus.z;
      if (dx * dx + dz * dz > STATION_ACTIVITY_RADIUS_METERS ** 2) continue;
      const baseY = WorldLayout.traversalSurfaceHeight(station.position.x, station.position.z);
      const y = baseY + STATION_ACTIVITY_HEIGHT_METERS[station.type];
      const target = { x: station.position.x, y, z: station.position.z };
      if (job.status === "active") {
        const previous = this.stationActivityEmitSeconds.get(station.id);
        const cadence = 1.1;
        if (previous === undefined || timeSeconds - previous >= cadence) {
          this.stationActivityEmitSeconds.set(station.id, timeSeconds);
          this.farmVfx.spawn("workstation", target, timeSeconds, { reducedMotion: this.prefersReducedMotion });
        }
      } else if (!this.announcedCompleteJobs.has(job.id)) {
        this.announcedCompleteJobs.add(job.id);
        this.farmVfx.spawn("pickup", target, timeSeconds, { reducedMotion: this.prefersReducedMotion });
      }
    }
  }

  private updateAmbientMotion(state: Readonly<GameState>, timeSeconds: number): void {
    sampleWeatherMotionSignal(this.weatherPresentation.sample(state.weather, state.worldSeed, timeSeconds).weather, timeSeconds, this.weatherMotion);
    const delta = this.lastAmbientMotionTimeSeconds > 0
      ? THREE.MathUtils.clamp(timeSeconds - this.lastAmbientMotionTimeSeconds, 0, 0.1)
      : 1 / 60;
    this.lastAmbientMotionTimeSeconds = timeSeconds;
    const motionScale = this.prefersReducedMotion
      ? CANONICAL_RENDER_CONFIG.motion.reducedMotionScale
      : CANONICAL_RENDER_CONFIG.motion.ambientScale;
    if (this.interactionFeedback.visible) {
      const breathe = this.prefersReducedMotion ? 0 : Math.sin(timeSeconds * 3);
      this.interactionFeedback.scale.setScalar(1 + breathe * 0.045);
      this.interactionFeedback.rotation.z = this.prefersReducedMotion ? 0 : timeSeconds * 0.45;
      this.interactionFeedback.material.opacity = 0.62 + breathe * 0.1;
      for (const material of this.interactionMaterials.get(this.activeInteractionMaterialId ?? "") ?? []) material.emissiveIntensity = 0.07 + breathe * 0.025;
    }
    if (this.windmillRotor) {
      const rotorSpeed = (0.18 + this.weatherMotion.effectiveWindSpeed * 0.035) * motionScale;
      this.windmillRotor.rotation.z = -timeSeconds * rotorSpeed;
    }
    this.updateFaunaMotion(timeSeconds, delta, motionScale);
    this.updateAmbientFlyers(timeSeconds, delta, motionScale);
    this.groundCover.updateWind(this.weatherMotion, timeSeconds, motionScale, this.playerPresence);
    this.meadowField.updateWind(this.weatherMotion, timeSeconds, motionScale, this.playerPresence);
    updateVegetationWind(this.weatherMotion, timeSeconds, motionScale);
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
    const members = group.userData.fishMembers as FishPresentationMember[] | undefined;
    for (const member of members ?? []) this.disposeFishVisibility(member);
    (group.userData.surfaceRipples as SchoolSurfaceRipples | undefined)?.dispose();
    group.removeFromParent();
  }

  private disposeDonkeyShadowPresentation(root: THREE.Object3D): void {
    for (const name of ["donkey_contact_shadow"]) {
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
    const stirrupLeftSocket = root.getObjectByName(`${ASSET_IDS.FAUNA_DONKEY_A}_stirrup_left_socket`);
    const stirrupRightSocket = root.getObjectByName(`${ASSET_IDS.FAUNA_DONKEY_A}_stirrup_right_socket`);
    if (!stirrupLeftSocket || !stirrupRightSocket) {
      throw new Error(`[WorldScene] Donkey is missing authored stirrup sockets`);
    }
    const reinLeftGrip = root.getObjectByName(`${ASSET_IDS.FAUNA_DONKEY_A}_rein_grip_left`);
    const reinRightGrip = root.getObjectByName(`${ASSET_IDS.FAUNA_DONKEY_A}_rein_grip_right`);
    if (!reinLeftGrip || !reinRightGrip) {
      throw new Error(`[WorldScene] Donkey is missing authored rein grips`);
    }
    const clips = (root.userData.animationClips as THREE.AnimationClip[] | undefined) ?? [];
    const clipSpecs = ASSET_BY_ID.get(ASSET_IDS.FAUNA_DONKEY_A)?.animationClips ?? [];
    const mixer = clips.length > 0 ? new THREE.AnimationMixer(root) : null;
    const actions = new Map<DonkeyAnimationClip, THREE.AnimationAction>();
    if (mixer) {
      for (const clipName of ["idle", "graze", "look", "walk", "trot", "gallop", "mount", "dismount"] as const) {
        const clip = clips.find((candidate) => candidate.name === clipName);
        if (!clip) continue;
        const spec = clipSpecs.find((candidate) => candidate.name === clipName);
        const loop = spec?.loop ?? ["idle", "graze", "look", "walk", "trot", "gallop"].includes(clipName);
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
      stirrupLeftSocket,
      stirrupRightSocket,
      reinLeftGrip,
      reinRightGrip,
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

  private setDonkeyAnimation(
    donkey: DonkeyPresentation,
    clipName: DonkeyAnimationClip,
    synchronizedPhase?: number
  ): void {
    if (donkey.activeClip === clipName) return;
    const next = donkey.actions.get(clipName) ?? donkey.actions.get("idle");
    if (!next) return;
    const resolvedClip = next === donkey.actions.get("idle") ? "idle" : clipName;
    const previous = donkey.activeClip ? donkey.actions.get(donkey.activeClip) : undefined;
    const preserveGaitPhase = Boolean(
      previous && donkey.activeClip &&
      ["walk", "trot", "gallop"].includes(donkey.activeClip) &&
      ["walk", "trot", "gallop"].includes(resolvedClip)
    );
    const previousPhase = previous
      ? ((previous.time / previous.getClip().duration) % 1 + 1) % 1
      : 0;
    next.reset();
    if (Number.isFinite(synchronizedPhase)) {
      next.time = THREE.MathUtils.euclideanModulo(synchronizedPhase ?? 0, 1)
        * next.getClip().duration;
    } else if (preserveGaitPhase) {
      next.time = previousPhase * next.getClip().duration;
    }
    if (previous && previous !== next) next.crossFadeFrom(previous, 0.2, false);
    else next.fadeIn(0.16);
    next.play();
    donkey.activeClip = resolvedClip;
  }

  private syncDonkeyAnimationSpeed(
    donkey: DonkeyPresentation,
    speedMetersPerSecond: number,
    locomotionTimeScale: number
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
    // Use the rider's distance-driven rate during acceleration and braking;
    // independent cadence limits would make their gait phases diverge.
    action.setEffectiveTimeScale(
      Math.max(0, speedMetersPerSecond) / referenceSpeed * locomotionTimeScale
    );
  }

  private preparePlayerAttachmentTransition(playerPose: PresentedPlayerFrame, timeSeconds: number): void {
    const transition = this.playerAttachmentTransition;
    if (!transition || transition.clip || transition.action !== "dismount") return;
    const donkey = this.donkeyPresentation;
    let clip: PlayerAnimation = "dismount";
    if (donkey?.id === transition.targetId) {
      const landing = donkey.root.worldToLocal(
        new THREE.Vector3(playerPose.x, playerPose.y - 0.5, playerPose.z)
      );
      clip = attachmentClip("dismount", { side: attachmentSideFromLocalX(landing.x) });
    }
    transition.clip = clip;
    transition.startedAtSeconds = timeSeconds;
    transition.durationSeconds = this.playerAnimation?.actionDurationSeconds(clip) ?? 0.8;
    this.playerAnimation?.play(clip);
  }

  private resolvePlayerAttachmentTarget(playerPose: PresentedPlayerFrame): boolean {
    const transition = this.playerAttachmentTransition;
    if (!transition || !this.playerMesh) return false;
    let target: THREE.Object3D | undefined;
    let pelvisContact = false;
    if (transition.action === "mount") {
      target = this.donkeyPresentation?.id === transition.targetId
        ? this.donkeyPresentation.riderSocket
        : undefined;
      pelvisContact = true;
    } else if (transition.action === "board") {
      target = this.boatDriverSeats.get(transition.targetId)
        ?? this.boatFishingStations.get(transition.targetId);
      pelvisContact = target?.name === "boat_rowboat_rower_seat";
    }

    if (target) {
      target.updateWorldMatrix(true, false);
      this.playerAttachmentWorldMatrix.copy(target.matrixWorld);
      if (pelvisContact && this.playerPelvis) {
        this.playerMesh.updateWorldMatrix(true, true);
        this.playerMesh.worldToLocal(this.playerPelvis.getWorldPosition(this.tempCharacterWorldPosition));
        this.playerAttachmentLocalMatrix.makeTranslation(-this.tempCharacterWorldPosition.x,
          -this.tempCharacterWorldPosition.y, -this.tempCharacterWorldPosition.z);
        this.playerAttachmentWorldMatrix.multiply(this.playerAttachmentLocalMatrix);
      }
      this.playerAttachmentWorldMatrix.decompose(
        this.playerAttachmentTargetPosition,
        this.playerAttachmentTargetQuaternion,
        this.playerAttachmentTargetScale
      );
      return true;
    }

    this.playerAttachmentTargetPosition.set(playerPose.x, playerPose.y - 0.5, playerPose.z);
    this.playerAttachmentEuler.set(0, playerPose.rotationY, 0, "YXZ");
    this.playerAttachmentTargetQuaternion.setFromEuler(this.playerAttachmentEuler);
    this.playerAttachmentTargetScale.set(1, 1, 1);
    return true;
  }

  private setPlayerWorldTransform(
    position: THREE.Vector3,
    quaternion: THREE.Quaternion,
    scale: THREE.Vector3
  ): void {
    if (!this.playerMesh) return;
    this.playerAttachmentWorldMatrix.compose(position, quaternion, scale);
    const parent = this.playerMesh.parent;
    if (parent) {
      parent.updateWorldMatrix(true, false);
      this.playerAttachmentParentInverse.copy(parent.matrixWorld).invert();
      this.playerAttachmentLocalMatrix.multiplyMatrices(
        this.playerAttachmentParentInverse,
        this.playerAttachmentWorldMatrix
      );
    } else {
      this.playerAttachmentLocalMatrix.copy(this.playerAttachmentWorldMatrix);
    }
    this.playerAttachmentLocalMatrix.decompose(
      this.playerMesh.position,
      this.playerMesh.quaternion,
      this.playerMesh.scale
    );
  }

  private updatePlayerAttachmentTransition(
    playerPose: PresentedPlayerFrame,
    timeSeconds: number
  ): boolean {
    const transition = this.playerAttachmentTransition;
    if (!transition || !this.playerMesh || !this.resolvePlayerAttachmentTarget(playerPose)) return false;
    const progress = THREE.MathUtils.clamp(
      (timeSeconds - transition.startedAtSeconds) / Math.max(0.001, transition.durationSeconds),
      0,
      1
    );
    if (
      transition.action === "dismount" &&
      !transition.detachedAtContact &&
      progress >= 0.68 / Math.max(0.001, transition.durationSeconds)
    ) {
      this.detachPlayerFromDonkey();
      transition.detachedAtContact = true;
    }
    const arcHeight = this.prefersReducedMotion
      ? 0
      : transition.action === "mount" || transition.action === "board" ? 0.14 : 0.08;
    const curve = sampleAttachmentCurve(progress, arcHeight);
    this.playerAttachmentBlendPosition.lerpVectors(
      transition.sourcePosition,
      this.playerAttachmentTargetPosition,
      curve.weight
    );
    this.playerAttachmentBlendPosition.y += curve.arcY;
    this.playerAttachmentBlendQuaternion.copy(transition.sourceQuaternion)
      .slerp(this.playerAttachmentTargetQuaternion, curve.weight);
    this.setPlayerWorldTransform(
      this.playerAttachmentBlendPosition,
      this.playerAttachmentBlendQuaternion,
      this.playerAttachmentTargetScale
    );
    if (progress < 1) return true;
    if (transition.action === "dismount" && !transition.detachedAtContact) {
      this.detachPlayerFromDonkey();
    }
    this.setPlayerWorldTransform(
      this.playerAttachmentTargetPosition,
      this.playerAttachmentTargetQuaternion,
      this.playerAttachmentTargetScale
    );
    this.playerAttachmentTransition = null;
    return true;
  }

  private attachPlayerToDonkey(donkey: DonkeyPresentation, mountId: string, timeSeconds: number): void {
    if (!this.playerMesh || donkey.attachedMountId === mountId) return;
    donkey.originalPlayerParent = this.playerMesh.parent ?? this.scene;
    attachPreservingWorld(donkey.riderSocket, this.playerMesh);
    const transitioning = this.playerAttachmentTransition?.action === "mount"
      && this.playerAttachmentTransition.targetId === mountId;
    if (!transitioning) {
      this.playerMesh.position.set(0, 0, 0);
      this.playerMesh.rotation.set(0, 0, 0);
      donkey.riderSocket.getWorldPosition(this.tempBoatSeatVec);
      this.playerAnimation?.alignPelvisSupport(this.tempBoatSeatVec);
    }
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
    delta: number,
    locomotionTimeScale: number
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
        const gait = playerPose.motion?.requestedGait === "gallop"
          ? "gallop"
          : playerPose.motion?.requestedGait === "trot"
            ? "trot"
            : "walk";
        const riderState = this.playerAnimation?.playbackState();
        const riderGait = gait === "gallop"
          ? "mounted_gallop"
          : gait === "trot"
            ? "mounted_trot"
            : "mounted_walk";
        this.setDonkeyAnimation(
          donkey,
          playerPose.motion?.speedMetersPerSecond > 0.1 && !playerPose.motion.isCollisionBlocked ? gait : "idle",
          riderState?.baseClip === riderGait ? riderState.basePhase : undefined
        );
      }
    } else {
      if (donkey.attachedMountId !== null) {
        const transitioningDismount = this.playerAttachmentTransition?.action === "dismount"
          && this.playerAttachmentTransition.targetId === donkey.id;
        if (transitioningDismount) {
          donkey.transitionUntilSeconds = Math.max(donkey.transitionUntilSeconds, timeSeconds + delta + 0.05);
          this.setDonkeyAnimation(donkey, "dismount");
        } else {
          this.detachPlayerFromDonkey();
          donkey.transitionUntilSeconds = timeSeconds + 0.8;
          this.setDonkeyAnimation(donkey, "dismount");
        }
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
        isMounted ? playerPose.motion?.speedMetersPerSecond ?? 0 : 0,
        locomotionTimeScale
      );
      // Mounted gait and attachment timing are essential motion shared with
      // the rider; reduced motion only slows the donkey's idle presentation.
      const essentialMotion = isMounted || donkey.activeClip === "mount" || donkey.activeClip === "dismount";
      donkey.mixer.timeScale = this.prefersReducedMotion && !essentialMotion
        ? CANONICAL_RENDER_CONFIG.motion.reducedMotionScale
        : 1;
      const interval = isMounted || playerDistanceSq <= 40 * 40
        ? 0
        : playerDistanceSq <= 90 * 90 ? 1 / 12 : 0.4;
      if (timeSeconds - donkey.lastAnimationUpdateSeconds >= interval) {
        const donkeyDelta = donkey.lastAnimationUpdateSeconds > 0
          ? Math.max(0, timeSeconds - donkey.lastAnimationUpdateSeconds)
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
      const acknowledgesPlayer = !this.prefersReducedMotion
        && presenceFalloff(this.playerPresence, fauna.root.position.x, fauna.root.position.z,
          ACKNOWLEDGE_HEAD_TURN_RADIUS_METERS) > 0.2;
      const desiredClip: FaunaAnimationClip = this.prefersReducedMotion
        ? "idle"
        : acknowledgesPlayer
          ? "look"
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
          + Math.sin(localTime * 0.67 + fauna.phase) * 0.18 * (1 - activity * 0.65) * motionScale
          + acknowledgeHeadYaw(
            this.playerPresence,
            fauna.root.position.x,
            fauna.root.position.z,
            fauna.root.rotation.y
          ) * 0.6 * (1 - activity * 0.5);
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
          const object = await this.loadModel(assetId);
          object.userData.dynamicPresentation = true;
          object.scale.setScalar(kind === "butterfly" ? 3.4 : 1.45);
          this.applyStaticShadowPolicy(object);
          this.environmentGroup.add(object);
          const clips = (object.userData.animationClips as THREE.AnimationClip[] | undefined) ?? [];
          const mixer = clips.length > 0 ? new THREE.AnimationMixer(object) : null;
          const flapClip = clips.find((clip) => clip.name === "flap");
          const glideClip = clips.find((clip) => clip.name === "glide");
          const flap = mixer && flapClip ? mixer.clipAction(flapClip) : null;
          const glide = mixer && glideClip ? mixer.clipAction(glideClip) : null;
          flap?.setLoop(THREE.LoopRepeat, Infinity).play();
          glide?.setLoop(THREE.LoopRepeat, Infinity).play();
          // Both clips run; the update blends them. Starting at weight 1 each
          // would average them into a permanent half-flap.
          flap?.setEffectiveWeight(0);
          glide?.setEffectiveWeight(1);
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
    for (const route of AMBIENT_BOAT_ROUTES) {
      const object = await this.loadModel(ASSET_IDS.BOAT_SKIFF_A);
      object.userData.dynamicPresentation = true;
      this.environmentGroup.add(object);
      object.position.set(route.x, 0, route.z);
      this.backgroundBoats.push(object);
    }
    // Background villagers. Deliberately not tagged for the layout editor and
    // never registered as NPCs, so nothing can interact with them.
    for (const route of AMBIENT_TOWNSFOLK_ROUTES) {
      try {
        const model = await this.loadModel(route.assetId as AssetId);
        model.userData.dynamicPresentation = true;
        model.position.set(route.stations.day.x, WorldLayout.traversalSurfaceHeight(
          route.stations.day.x, route.stations.day.z
        ), route.stations.day.z);
        this.environmentGroup.add(model);
        this.ambientTownsfolk.push({
          route, model, animator: new HumanoidAnimator(model),
          motionFrame: null, lastAnimationContext: null
        });
      } catch (error) {
        console.warn(`[WorldScene] Failed to load townsfolk ${route.id}:`, error);
      }
    }
    // The village notice board. Presentation-only placement at an authored
    // anchor: it carries no collider and no saved state, and the interaction
    // candidate in GameApp owns the read verb.
    try {
      const board = await this.loadModel(ASSET_IDS.PROP_SIGNPOST_TRAIL_A);
      const { x, z } = VILLAGE_BULLETIN.position;
      board.name = "village_bulletin_board";
      board.position.set(x, WorldLayout.traversalSurfaceHeight(x, z), z);
      board.rotation.y = VILLAGE_BULLETIN.rotationY;
      this.applyStaticShadowPolicy(board);
      this.environmentGroup.add(board);
    } catch (error) {
      console.warn("[WorldScene] Failed to load the village bulletin board:", error);
    }
    await spawn("gull", ASSET_IDS.FAUNA_GULL_A, GULL_ORBITS);
    await spawn("butterfly", ASSET_IDS.FAUNA_BUTTERFLY_A, BUTTERFLY_ORBITS);
  }

  private updateAmbientFlyers(timeSeconds: number, delta: number, motionScale: number): void {
    this.backgroundBoats.forEach((object, index) => {
      const pose = sampleAmbientBoatPose(AMBIENT_BOAT_ROUTES[index], timeSeconds, this.prefersReducedMotion ? 0 : 1);
      object.position.set(pose.x, this.water.sample(pose.x, pose.z, timeSeconds).height, pose.z);
      object.rotation.y = pose.heading;
      object.visible = Math.hypot(pose.x - this.visibilityAnchor.x, pose.z - this.visibilityAnchor.z) < 430;
    });
    for (const flyer of this.ambientFlyers) {
      const pose = sampleAmbientFlyerPose(flyer.orbit, timeSeconds, motionScale, this.playerPresence);
      const dx = pose.x - this.visibilityAnchor.x;
      const dz = pose.z - this.visibilityAnchor.z;
      const distanceSq = dx * dx + dz * dz;
      const visibilityDistance = flyer.kind === "butterfly" ? 120 : 190;
      flyer.object.visible = distanceSq <= visibilityDistance * visibilityDistance;
      if (!flyer.object.visible) continue;
      flyer.object.position.set(pose.x, pose.y, pose.z);
      flyer.object.rotation.y = pose.heading;
      // Near gulls flap; far gulls glide. Blend across 45–70 m so the switch
      // never pops, and so both shipped clips are actually used.
      const glideBlend = Math.max(0, Math.min(1, (Math.sqrt(distanceSq) - 45) / 25));
      flyer.flap?.setEffectiveWeight(1 - glideBlend);
      flyer.glide?.setEffectiveWeight(glideBlend);
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
      tailPivot: root.getObjectByName(`${assetId}_tail_pivot`) ?? undefined,
      visibilityMaterials: this.prepareFishVisibility(root)
    };
  }

  /**
   * Fish GLB clones share catalog materials, so clone just the materials before
   * applying the water-visibility treatment. The treatment is presentation-only:
   * it never changes the simulation-owned fish depth or position.
   */
  private prepareFishVisibility(root: THREE.Group): FishVisibilityMaterial[] {
    const tracked: FishVisibilityMaterial[] = [];
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const originals = Array.isArray(object.material) ? object.material : [object.material];
      const clones = originals.map((material) => material.clone());
      object.material = Array.isArray(object.material) ? clones : clones[0];
      for (const material of clones) {
        const colored = material as THREE.Material & { color?: THREE.Color };
        tracked.push({
          material: colored,
          baseColor: colored.color?.clone() ?? null,
          baseOpacity: material.opacity,
          baseTransparent: material.transparent,
          baseDepthTest: material.depthTest,
          baseDepthWrite: material.depthWrite
        });
      }
    });
    return tracked;
  }

  private updateFishVisibility(
    member: FishPresentationMember,
    depthMeters: number,
    prominence: number
  ): void {
    const submerged = depthMeters > 0.035;
    const depthFade = THREE.MathUtils.clamp(1 - depthMeters / 7, 0, 1);
    const opacity = THREE.MathUtils.lerp(0.42, 0.82, depthFade) * prominence;
    member.root.traverse((object) => {
      if (object instanceof THREE.Mesh) object.renderOrder = submerged ? 4 : 0;
    });
    for (const tracked of member.visibilityMaterials) {
      const { material } = tracked;
      material.transparent = submerged || tracked.baseTransparent;
      material.opacity = submerged ? Math.min(tracked.baseOpacity, opacity) : tracked.baseOpacity;
      // The water mesh is intentionally opaque and depth-writing. Let the fish
      // read through it as a soft teal silhouette instead of moving the fish out
      // of the simulation-owned depth.
      material.depthTest = submerged ? false : tracked.baseDepthTest;
      material.depthWrite = submerged ? false : tracked.baseDepthWrite;
      if (tracked.baseColor && material.color) {
        material.color.copy(tracked.baseColor);
        if (submerged) material.color.lerp(this.fishWaterTint, 0.24 + (1 - depthFade) * 0.22);
      }
    }
  }

  private disposeFishVisibility(member: FishPresentationMember | null): void {
    member?.mixer?.stopAllAction();
    for (const tracked of member?.visibilityMaterials ?? []) tracked.material.dispose();
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
    timeSeconds: number,
    beatScale = 1
  ): void {
    this.setFishAnimation(member, clipName);
    const beat = this.prefersReducedMotion
      ? CANONICAL_RENDER_CONFIG.motion.reducedMotionScale
      : beatScale;
    if (member.mixer) {
      member.mixer.timeScale = beat;
    }
    member.mixer?.update(delta);
    if (!member.mixer && member.tailPivot) {
      member.tailPivot.rotation.y = Math.sin(timeSeconds * 8.5 * beat + member.phase * Math.PI * 2)
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
    boatPresentationInput: BoatPresentationInput | null = this.latestBoatPresentationInput,
    locomotionTimeScale = this.latestLocomotionTimeScale
  ): void {
    const state = sim.getState();
    sampleWeatherMotionSignal(this.weatherPresentation.sample(state.weather, state.worldSeed, timeSeconds).weather, timeSeconds, this.weatherMotion);
    if (presentedPlayer) this.latestPresentedPlayer = presentedPlayer;
    this.latestBoatPresentationInput = boatPresentationInput;
    this.latestLocomotionTimeScale = THREE.MathUtils.clamp(locomotionTimeScale, 0, 1);
    const playerPose = presentedPlayer ?? {
      ...state.player,
      motion: stationaryPlayerMotion(state.player),
      discontinuityReason: "none" as const,
      discontinuitySequence: 0
    };
    this.visibilityAnchor.set(playerPose.x, playerPose.y, playerPose.z);

    // The presentation clock is wall time, so a hidden tab can hand us a delta
    // of many seconds. Clamp it like the simulation delta, or one frame runs
    // hundreds of animation substeps and jumps the session clock.
    const frameElapsed = this.hasPresentationTimestamp
      ? Math.min(0.1, Math.max(0, timeSeconds - this.lastPresentationTime)) : 0;
    this.lastPresentationTime = Math.max(timeSeconds, this.lastPresentationTime);
    this.hasPresentationTimestamp = true;
    const delta = state.clock.isPaused ? 0 : frameElapsed;
    this.characterElapsedSeconds += delta;
    this.ambientTownsfolkElapsedSeconds += delta;

    if (state.sportFishing) {
      sampleSportFishingPresentation(state.sportFishing, playerPose.x, playerPose.z, playerPose.rotationY,
        this.prefersReducedMotion ? CANONICAL_RENDER_CONFIG.motion.reducedMotionScale : 1,
        this.sportFishingPresentation);
    }
    const waterConditions = this.waterConditions(state);
    this.water.update(
      timeSeconds,
      waterConditions,
      this.visibilityAnchor,
      { reducedMotion: this.prefersReducedMotion }
    );
    this.shoreFoam.update(timeSeconds, waterConditions);
    this.boatWakes.update(timeSeconds);
    this.farmVfx.update(timeSeconds);
    this.footfallVfx.update(timeSeconds);
    if (this.cosmeticCropCarryUntilSeconds > 0 && this.characterElapsedSeconds >= this.cosmeticCropCarryUntilSeconds) {
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
    this.updateDonkeyPresentation(state, playerPose, this.characterElapsedSeconds, delta, this.latestLocomotionTimeScale);

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
      if (playerPose.discontinuitySequence !== this.lastPlayerDiscontinuitySequence) {
        // Boarding and mounting one-shots are emitted before their canonical
        // pose jump. Release stale world-space contacts without erasing that
        // newly-started interaction action.
        const preservesInteractionAction = playerPose.discontinuityReason === "boarding"
          || playerPose.discontinuityReason === "docking"
          || playerPose.discontinuityReason === "dismounting";
        if (preservesInteractionAction) this.playerAnimation?.resetSpatialState();
        else this.playerAnimation?.resetTransientState();
        this.lastPlayerDiscontinuitySequence = playerPose.discontinuitySequence;
      }
      this.preparePlayerAttachmentTransition(playerPose, this.characterElapsedSeconds);
      const animationContext: CharacterAnimationContext = {
        mode: presentationMode,
        motion: playerPose.motion,
        locomotionTimeScale: this.latestLocomotionTimeScale,
        facingRadians: playerPose.rotationY,
        carrying: this.characterElapsedSeconds < this.cosmeticCropCarryUntilSeconds,
        fishingInput: state.sportFishing
          ? {
              isReeling: this.sportFishingPresentation.retrievalMetersPerSecond > 0.03,
              isSlacking: state.sportFishing.isSlacking,
              isBracing: state.sportFishing.isBracing,
              rodDirectionAngle: state.sportFishing.dynamics?.rodDirection ?? state.sportFishing.rodDirectionAngle,
              loadRatio: this.sportFishingPresentation.loadRatio,
              pumpLoadRatio: this.sportFishingPresentation.pumpLoadRatio,
              behaviorPhase: this.sportFishingPresentation.behaviorPhase,
              retrievalMetersPerSecond: this.sportFishingPresentation.retrievalMetersPerSecond,
              shakeAmplitude: this.sportFishingPresentation.shakeAmplitude
            }
          : undefined,
        boatInput: resolvedBoatInput
      };
      const motion = this.playerAnimation?.update(
        delta,
        animationContext,
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
      else this.updateFarmingProps(motion.clip, this.characterElapsedSeconds, Boolean(state.player.carriedFishCargoId));
      const boatPresentation = activeBoat
        ? this.sampleBoatPresentation(activeBoat, state, timeSeconds)
        : null;
      const driverSeat = activeBoat ? this.boatDriverSeats.get(activeBoat.id) : undefined;
      const rowboatRig = activeBoat?.boatTypeId === "boat.rowboat"
        ? this.rowboatPresentationRigs.get(activeBoat.id)
        : undefined;
      const fishingStation = state.sportFishing && activeBoat?.boatTypeId === "boat.skiff"
        ? this.boatFishingStations.get(activeBoat.id)
        : undefined;
      const boatCharacterAnchor = fishingStation ?? driverSeat;
      const attachedToDonkey = state.player.activeMountId !== null
        && this.donkeyPresentation?.attachedMountId === state.player.activeMountId;
      const attachmentTransitionActive = this.updatePlayerAttachmentTransition(playerPose, this.characterElapsedSeconds);
      if (attachmentTransitionActive) {
        // The attachment solver owns the world transform until exact terminal
        // lock. Mixer poses remain local and cannot snap the presentation.
      } else if (attachedToDonkey) {
        this.playerMesh.position.set(0, 0, 0);
        this.playerMesh.rotation.set(motion.leanX, 0, motion.leanZ, "YXZ");
      } else if (boatCharacterAnchor) {
        boatCharacterAnchor.getWorldPosition(this.tempBoatSeatVec);
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
      if (!attachedToDonkey && !attachmentTransitionActive) {
        let characterYaw = playerPose.rotationY;
        if (state.sportFishing) {
          const desiredFishingYaw = Math.atan2(
            this.sportFishingPresentation.endpointX - this.playerMesh.position.x,
            this.sportFishingPresentation.endpointZ - this.playerMesh.position.z
          );
          if (this.sportFishingBodyYawInstanceId !== state.sportFishing.fish.instanceId) {
            this.sportFishingBodyYaw = desiredFishingYaw;
            this.sportFishingBodyYawInstanceId = state.sportFishing.fish.instanceId;
          } else {
            this.sportFishingBodyYaw = dampPresentationAngle(
              this.sportFishingBodyYaw,
              desiredFishingYaw,
              7.5,
              delta
            );
          }
          characterYaw = this.sportFishingBodyYaw;
        } else {
          this.sportFishingBodyYawInstanceId = null;
        }
        this.playerMesh.rotation.set(
          motion.leanX + motion.groundPitch + (boatPresentation?.pitch ?? 0),
          characterYaw,
          motion.leanZ + motion.groundRoll + (boatPresentation?.roll ?? 0),
          "YXZ"
        );
      }
      this.playerMesh.updateMatrixWorld(true);
      if (!attachmentTransitionActive) {
        const pelvisSupport = attachedToDonkey ? this.donkeyPresentation?.riderSocket
          : boatCharacterAnchor?.name === "boat_rowboat_rower_seat" ? boatCharacterAnchor : undefined;
        if (pelvisSupport) {
          pelvisSupport.getWorldPosition(this.tempBoatSeatVec);
          this.playerAnimation?.alignPelvisSupport(this.tempBoatSeatVec);
        }
      }
      if (this.playerAnimation && attachedToDonkey && !attachmentTransitionActive && this.donkeyPresentation) {
        alignSupportFeet(this.playerAnimation, this.donkeyPresentation.stirrupLeftSocket, this.donkeyPresentation.stirrupRightSocket);
        alignMarkerHand(this.playerAnimation, "left", this.donkeyPresentation.reinLeftGrip);
        alignMarkerHand(this.playerAnimation, "right", this.donkeyPresentation.reinRightGrip);
      } else if (this.playerAnimation && !attachmentTransitionActive && rowboatRig) {
        alignSupportFeet(this.playerAnimation, rowboatRig.footLeftSupport, rowboatRig.footRightSupport);
      }
      this.playerAnimation?.resolveGroundContacts(
        animationContext,
        (x, z) => WorldLayout.traversalSurfaceSample(x, z),
        delta
      );
      const holdingOars = presentationMode === "boat-driving"
        && activeBoat?.boatTypeId === "boat.rowboat";
      this.syncRowboatOarPresentation(activeBoat?.id ?? null, holdingOars, delta);
      if (presentationMode === "boat-driving" && activeBoat?.boatTypeId === "boat.skiff" && !attachmentTransitionActive && this.playerAnimation) {
        const helm = this.boatMeshes.get(activeBoat.id)?.getObjectByName("boat_skiff_helm_grip");
        if (!helm) throw new Error("[WorldScene] Skiff is missing its helm grip");
        alignMarkerHand(this.playerAnimation, "right", helm);
      }
      for (const key of ["bundle", "basket", "water", "sickle", "scoop"] as const) {
        const prop = this.farmingProps.get(key);
        if (prop?.visible && this.playerAnimation) alignEquipmentHands(this.playerAnimation, prop);
      }
      this.syncBoatFishPacks(state);
      if (this.carriedFishPresentation) {
        const held = this.carriedFishPresentation;
        held.root.visible = held.cargoId === state.player.carriedFishCargoId;
      }
      if (holdingOars && activeBoat && motion.events.some((event) => event.name === "paddle_enter")) {
        this.spawnPaddleDisturbance(activeBoat, state, timeSeconds);
      }
      if (this.playerContactShadow) {
        this.playerContactShadow.visible = !state.player.activeBoatId
          && !state.player.activeMountId
          && !attachmentTransitionActive;
        this.playerContactShadow.position.set(
          playerPose.x,
          WorldLayout.terrainHeight(playerPose.x, playerPose.z) + 0.025,
          playerPose.z
        );
      }
    }

    this.cropInstances.sync(state, timeSeconds, this.weatherMotion, this.isFarmGisMode);

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
      sGroup.position.set(school.x, 0, school.z);
      const frenzy = (school.feedingFrenzyUntilMinute ?? -1) > state.clock.currentMinute;
      const previousFeeding = (sGroup.userData.feedingBlend as number | undefined) ?? Number(frenzy);
      const feeding = THREE.MathUtils.lerp(previousFeeding, Number(frenzy),
        1 - Math.exp(-CANONICAL_RENDER_CONFIG.fishSchools.feedingResponse * schoolDelta));
      sGroup.userData.feedingBlend = feeding;
      const boats: SchoolBoatObstacle[] = [];
      for (const boat of Object.values(state.boats)) {
        if (Math.hypot(boat.x - school.x, boat.z - school.z) > school.radius + 12) continue;
        const primitives = ASSET_BY_ID.get(boatAssetId(boat.boatTypeId))?.collisionPrimitives ?? [];
        const radius = primitives.reduce((extent, primitive) => Math.max(extent,
          Math.hypot(primitive.center[0], primitive.center[2])
            + Math.hypot(primitive.halfExtents[0], primitive.halfExtents[2])), 0);
        boats.push({ x: boat.x, z: boat.z, radius });
      }
      const context = {
        x: school.x, z: school.z, radius: school.radius, feeding, boats,
        isWater: (x: number, z: number) => WorldLayout.isSailable(x, z)
      };
      const ripples = sGroup.userData.surfaceRipples as SchoolSurfaceRipples;
      const fishMembers = sGroup.userData.fishMembers as FishPresentationMember[] | undefined;
      fishMembers?.forEach((member, index) => {
        const fish = member.root;
        const sample = advanceSchoolFish(member.schoolMotion, schoolDelta, timeSeconds, member.phase, context);
        const pose = { ...sample.motion, visible: sample.visible, surface: sample.surface, cycle: sample.cycle };
        member.schoolMotion = sample.motion;
        const speed = Math.hypot(pose.vx, pose.vz);
        const surfaceY = this.water.sample(pose.x, pose.z, timeSeconds).height;
        fish.visible = pose.visible;
        fish.position.set(pose.x - school.x, surfaceY - pose.depth, pose.z - school.z);
        if (speed > 0.01) {
          const heading = Math.atan2(pose.vx, pose.vz);
          const turn = Math.atan2(Math.sin(heading - fish.rotation.y), Math.cos(heading - fish.rotation.y));
          fish.rotation.y += turn * (lastMotionUpdate === 0 ? 1 : 1 - Math.exp(-6 * schoolDelta));
        }
        fish.rotation.z = this.prefersReducedMotion ? 0 : Math.sin(timeSeconds * 1.1 + member.phase * 12) * 0.055;
        fish.rotation.x = this.prefersReducedMotion ? 0 : Math.sin(timeSeconds * 0.5 + member.phase * 8) * 0.06;
        this.updateFishAnimation(member, speed > 1.5 ? "burst" : "swim", schoolDelta, timeSeconds,
          THREE.MathUtils.clamp(speed / 0.8, 0.65, 1.5));
        // Ambient schools belong in the opaque scene sampled by water optics.
        // The hooked fish's through-water aid would also draw these through hulls
        // and expose every overlapping body/fin surface as a ghostly wire shape.
        if (pose.visible && pose.surface > (feeding > 0.5 ? 0.52 : 0.16)
          && member.lastFeedingCycle !== pose.cycle) {
          member.lastFeedingCycle = pose.cycle;
          ripples.emit(index, pose.x - school.x, pose.z - school.z, timeSeconds, 0.55 + feeding * 0.45);
        }
      });
      ripples.update(timeSeconds, (x, z) => this.water.sample(x + school.x, z + school.z, timeSeconds).height,
        this.prefersReducedMotion);
      const gull = sGroup.userData.schoolGull as THREE.Group | undefined;
      if (gull) {
        gull.visible = frenzy;
        const phase = (sGroup.userData.cuePhase as number | undefined) ?? 0;
        const angle = timeSeconds * 0.48 + phase * Math.PI * 2;
        gull.position.set(Math.cos(angle) * 4.4, 4.2 + Math.sin(angle * 2) * 0.25, Math.sin(angle) * 3.2);
        gull.rotation.y = -angle;
      }

    }

    // Station progress is transient and pauses at the current supported pose.
    // The station is clock-derived; local movement never becomes saved NPC state.
    for (const npc of this.npcPresentations.values()) {
      const scheduledAnchor = npcAnchorAt(npc.id, state.clock, state.quests);
      if (this.layoutEditLockedObject !== npc.model) {
        const scheduled = ContentRegistry.npcs.get(npc.id)?.schedule?.some((slot) => slot.phase === state.clock.timeOfDay);
        const editorId = scheduled ? `${npc.id}.${state.clock.timeOfDay}` : npc.id;
        if (readLayoutEditTag(npc.model)?.id !== editorId) {
          npc.model.userData[LAYOUT_EDIT_USERDATA_KEY] = createNpcTag(editorId);
        }
      }
      // Resolve before culling: an actor may have arrived inside the visible region.
      if (this.layoutEditLockedObject !== npc.model && (npc.anchor.x !== scheduledAnchor.x
        || npc.anchor.z !== scheduledAnchor.z || npc.anchor.rotationY !== scheduledAnchor.rotationY)) {
        this.relocateNpcPresentation(npc.id, scheduledAnchor.x, scheduledAnchor.z, scheduledAnchor.rotationY);
      }
      const npcFrameDelta = npc.lastPresentationUpdateSeconds > 0
        ? Math.max(0, timeSeconds - npc.lastPresentationUpdateSeconds) : delta;
      npc.lastPresentationUpdateSeconds = Math.max(timeSeconds, npc.lastPresentationUpdateSeconds);
      // Async asset completion can request another sync at the same timestamp.
      // Preserve the evaluated motion context rather than treating zero travel
      // over zero elapsed time as a new locomotion stop.
      if (state.clock.isPaused || this.layoutEditLockedObject === npc.model
        || (npcFrameDelta <= 0 && npc.lastAnimationContext)) continue;
      const dx = playerPose.x - npc.model.position.x;
      const dz = playerPose.z - npc.model.position.z;
      const distSq = dx * dx + dz * dz;
      const isDialogueTarget = npc.id === this.activeDialogueNpcId;
      const npcVisibilityRange = npc.model.visible
        ? 160 + NPC_VISIBILITY_HYSTERESIS_METERS
        : 160 - NPC_VISIBILITY_HYSTERESIS_METERS;
      const visible = isDialogueTarget || distSq <= npcVisibilityRange * npcVisibilityRange;
      if (visible !== npc.model.visible) npc.animator.resetSpatialState();
      npc.model.visible = visible;
      if (!visible) {
        npc.pendingAnimationSeconds = 0;
        continue;
      }
      const previousX = npc.model.position.x;
      const previousZ = npc.model.position.z;
      const beatSpec = npcStationBeatAt(npc.id, state.clock);
      const beatSample = advanceNpcStationBeat(
        beatSpec, npc.beat, npcFrameDelta, isDialogueTarget,
        (offsetX, offsetZ) => {
          const x = npc.anchor.x + offsetX;
          const z = npc.anchor.z + offsetZ;
          return isValidNpcPresentationGround(x, z, WorldLayout.traversalSurfaceSample(x, z));
        }
      );
      const worldX = npc.anchor.x + beatSample.dx;
      const worldZ = npc.anchor.z + beatSample.dz;
      const surface = WorldLayout.traversalSurfaceSample(worldX, worldZ);
      npc.model.position.set(worldX, surface.height, worldZ);
      const playerHeading = Math.atan2(playerPose.x - worldX, playerPose.z - worldZ);
      const socialReaction = this.socialReactions.sample(
        worldX,
        worldZ,
        timeSeconds,
        this.prefersReducedMotion
      );
      const reactionHeading = socialReaction.kind
        ? Math.atan2(socialReaction.targetX - worldX, socialReaction.targetZ - worldZ)
        : playerHeading;
      // Hold the authored beat heading through the pause too, so the body turns
      // toward the next leg before it walks rather than through the first stride.
      const desiredHeading = isDialogueTarget ? playerHeading
        : socialReaction.turnBody && !beatSample.walking ? reactionHeading
        : beatSpec ? beatSample.heading : npc.model.rotation.y;
      const turnDifference = wrapPresentationAngle(desiredHeading - npc.model.rotation.y);
      npc.model.rotation.y = dampPresentationAngle(
        npc.model.rotation.y, desiredHeading, isDialogueTarget ? 9.5 : 8.2, npcFrameDelta
      );
      const velocityX = npcFrameDelta > 0 ? (worldX - previousX) / npcFrameDelta : 0;
      const velocityZ = npcFrameDelta > 0 ? (worldZ - previousZ) / npcFrameDelta : 0;
      const walkSpeed = Math.hypot(velocityX, velocityZ);
      const context: CharacterAnimationContext = {
        mode: "on-foot", carrying: false, talking: isDialogueTarget,
        facingRadians: npc.model.rotation.y,
        motion: npcPresentationMotion({
          velocity: { x: velocityX, y: 0, z: velocityZ },
          speedMetersPerSecond: walkSpeed,
          turnRateRadiansPerSecond: isDialogueTarget ? 0 : turnDifference / Math.max(npcFrameDelta, 1 / 60),
          groundNormal: { ...surface.normal },
          slopeRadians: Math.acos(THREE.MathUtils.clamp(surface.normal.y, -1, 1)),
          contactSurface: surface.source === "terrain" ? "grass" : "path",
          requestedGait: walkSpeed > 0.01 ? "walk" : "idle"
        })
      };
      const contextChanged = !npc.lastAnimationContext
        || npc.lastAnimationContext.talking !== context.talking
        || (npc.lastAnimationContext.motion.speedMetersPerSecond > 0.01) !== (walkSpeed > 0.01);
      if (contextChanged && npc.lastAnimationContext && npc.pendingAnimationSeconds > 0) {
        npc.animator.update(npc.pendingAnimationSeconds, npc.lastAnimationContext, this.prefersReducedMotion);
        npc.pendingAnimationSeconds = 0;
      }
      const interval = contextChanged || walkSpeed > 0.01 || isDialogueTarget || distSq <= 40 * 40 ? 0 : distSq <= 90 * 90 ? 1 / 12 : 0.4;
      npc.pendingAnimationSeconds += npcFrameDelta;
      if (npc.pendingAnimationSeconds >= interval) {
        const animationDelta = npc.pendingAnimationSeconds;
        npc.pendingAnimationSeconds = 0;
        npc.motionFrame = npc.animator.update(animationDelta, context, this.prefersReducedMotion);
        // Talking always faces the player; otherwise the head turns to
        // acknowledge someone who walks up. A committed nearby event can carry
        // that attention farther for a moment, then it settles back.
        const passiveHeadYaw = acknowledgeHeadYaw(
          this.playerPresence,
          worldX,
          worldZ,
          npc.model.rotation.y
        );
        const eventHeadYaw = wrapPresentationAngle(reactionHeading - npc.model.rotation.y);
        npc.animator.lookTowardHeading(
          isDialogueTarget
            ? eventHeadYaw
            : THREE.MathUtils.lerp(passiveHeadYaw, eventHeadYaw, socialReaction.attention),
          animationDelta
        );
      }
      if (npc.motionFrame) {
        const weatherPosture = sampleWeatherPosture(
          this.weatherPresentation.current?.weather ?? state.weather,
          npc.model.rotation.y,
          timeSeconds,
          this.prefersReducedMotion,
          npc.id.length * 0.37
        );
        npc.model.position.y += npc.motionFrame.bobY;
        npc.model.rotation.set(
          npc.motionFrame.leanX + npc.motionFrame.groundPitch
            + weatherPosture.pitchRadians + socialReaction.nodRadians,
          npc.model.rotation.y,
          npc.motionFrame.leanZ + npc.motionFrame.groundRoll + weatherPosture.rollRadians,
          "YXZ"
        );
      }
      npc.lastAnimationContext = context;
      npc.model.updateMatrixWorld(true);
      npc.animator.resolveGroundContacts(context, (x, z) => WorldLayout.traversalSurfaceSample(x, z), npcFrameDelta);
    }

    this.updateAmbientTownsfolk(state, timeSeconds, delta);
    this.updateFishingPresentation(state, playerPose, timeSeconds, delta);
  }

  /**
   * Background villagers. Their station is clock-derived and pure, so nothing
   * is saved; the within-loop drift runs on an unpaused presentation clock so
   * pausing the game freezes them instead of sliding them through idle.
   */
  private updateAmbientTownsfolk(state: Readonly<GameState>, timeSeconds: number, delta: number): void {
    const motionScale = this.prefersReducedMotion ? 0 : 1;
    for (const person of this.ambientTownsfolk) {
      // A zero-length step (paused game, or an async asset-settle re-sync)
      // must not re-evaluate the gait. Recomputing it from an unchanged pose
      // reads as zero speed and snaps a walking villager to idle for one frame
      // — the "drags around with no walk cycle" artefact.
      if (delta <= 0 && person.lastAnimationContext) continue;
      const pose = sampleAmbientTownsfolkPose(
        person.route,
        state.clock,
        this.ambientTownsfolkElapsedSeconds,
        motionScale
      );
      const distance = Math.hypot(pose.x - this.visibilityAnchor.x, pose.z - this.visibilityAnchor.z);
      const ambientVisibilityRange = person.model.visible
        ? AMBIENT_TOWNSFOLK_VISIBILITY_METERS + AMBIENT_TOWNSFOLK_VISIBILITY_HYSTERESIS_METERS
        : AMBIENT_TOWNSFOLK_VISIBILITY_METERS - AMBIENT_TOWNSFOLK_VISIBILITY_HYSTERESIS_METERS;
      const wasVisible = person.model.visible;
      person.model.visible = distance < ambientVisibilityRange;
      if (person.model.visible !== wasVisible) {
        // Foot locks are presentation history. Clear them whenever an ambient
        // villager is culled or re-enters so a stale world-space target cannot
        // pull the first visible pose across the visibility boundary.
        person.animator.resetSpatialState();
      }
      if (!person.model.visible) continue;

      const surface = WorldLayout.traversalSurfaceSample(pose.x, pose.z);
      // On the first visible frame the stored position is stale (from before
      // the villager left), so treat it as zero velocity instead of dividing a
      // multi-metre wrap by one frame.
      const previousX = wasVisible ? person.model.position.x : pose.x;
      const previousZ = wasVisible ? person.model.position.z : pose.z;
      person.model.position.set(pose.x, WorldLayout.traversalSurfaceHeight(pose.x, pose.z), pose.z);
      const socialReaction = this.socialReactions.sample(
        pose.x,
        pose.z,
        timeSeconds,
        this.prefersReducedMotion
      );
      const playerHeading = Math.atan2(
        this.playerPresence.x - pose.x,
        this.playerPresence.z - pose.z
      );
      const reactionHeading = socialReaction.kind
        ? Math.atan2(socialReaction.targetX - pose.x, socialReaction.targetZ - pose.z)
        : playerHeading;
      const desiredHeading = socialReaction.turnBody && !pose.walking ? reactionHeading : pose.heading;
      person.model.rotation.y = dampPresentationAngle(
        person.model.rotation.y,
        desiredHeading,
        socialReaction.turnBody ? 8.2 : 6.5,
        delta
      );

      const velocityX = delta > 0 ? (pose.x - previousX) / delta : 0;
      const velocityZ = delta > 0 ? (pose.z - previousZ) / delta : 0;
      const speed = Math.hypot(velocityX, velocityZ);
      const context: CharacterAnimationContext = {
        mode: "on-foot", carrying: false, talking: false,
        facingRadians: person.model.rotation.y,
        motion: npcPresentationMotion({
          velocity: { x: velocityX, y: 0, z: velocityZ },
          speedMetersPerSecond: speed,
          turnRateRadiansPerSecond: 0,
          groundNormal: { ...surface.normal },
          slopeRadians: Math.acos(THREE.MathUtils.clamp(surface.normal.y, -1, 1)),
          contactSurface: surface.source === "terrain" ? "grass" : "path",
          requestedGait: speed > 0.01 ? "walk" : "idle"
        })
      };
      person.motionFrame = person.animator.update(delta, context, this.prefersReducedMotion);
      const passiveHeadYaw = acknowledgeHeadYaw(
        this.playerPresence,
        pose.x,
        pose.z,
        person.model.rotation.y
      );
      const eventHeadYaw = wrapPresentationAngle(reactionHeading - person.model.rotation.y);
      person.animator.lookTowardHeading(
        THREE.MathUtils.lerp(passiveHeadYaw, eventHeadYaw, socialReaction.attention),
        delta
      );
      if (person.motionFrame) {
        const weatherPosture = sampleWeatherPosture(
          this.weatherPresentation.current?.weather ?? state.weather,
          person.model.rotation.y,
          timeSeconds,
          this.prefersReducedMotion,
          person.route.phase * Math.PI * 2
        );
        person.model.position.y += person.motionFrame.bobY;
        person.model.rotation.set(
          person.motionFrame.leanX + person.motionFrame.groundPitch
            + weatherPosture.pitchRadians + socialReaction.nodRadians,
          person.model.rotation.y,
          person.motionFrame.leanZ + person.motionFrame.groundRoll + weatherPosture.rollRadians,
          "YXZ"
        );
      }
      person.lastAnimationContext = context;
      person.model.updateMatrixWorld(true);
      person.animator.resolveGroundContacts(context, (x, z) => WorldLayout.traversalSurfaceSample(x, z), delta);
    }
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

    // The aerial and submerged runs have different depth rules. Keeping them
    // separate prevents the readable underwater trace from compositing across
    // the angler or boat.
    const createLine = (
      positions: Float32Array,
      colors: Float32Array,
      depthTest: boolean,
      renderOrder: number
    ): Line2 => {
      const geometry = new LineGeometry();
      geometry.setPositions(positions);
      geometry.setColors(colors);
      const material = new LineMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        linewidth: 1.45,
        worldUnits: false,
        depthTest,
        depthWrite: false,
        alphaToCoverage: true,
        toneMapped: false,
        resolution: new THREE.Vector2(
          Math.max(1, this.lastResizeWidth || window.innerWidth),
          Math.max(1, this.lastResizeHeight || window.innerHeight)
        )
      });
      const line = new Line2(geometry, material);
      line.frustumCulled = false;
      line.renderOrder = renderOrder;
      line.visible = false;
      this.scene.add(line);
      return line;
    };
    this.fishingLineMesh = createLine(this.fishingLinePositions, this.fishingLineColors, true, 5);
    this.fishingSubmergedLineMesh = createLine(
      this.fishingSubmergedLinePositions,
      this.fishingSubmergedLineColors,
      false,
      4
    );
  }

  private updateFishingPresentation(
    state: Readonly<GameState>,
    playerPose: { x: number; y: number; z: number; rotationY: number },
    timeSeconds: number,
    deltaSeconds: number
  ): void {
    const basic = state.basicFishing;
    const sport = state.sportFishing;
    const rodProp = this.farmingProps.get("rod");
    // The mixer has just restored the source arm pose. Rebase the held rod
    // before applying this frame's aim and palm solve, avoiding parent feedback.
    if (rodProp) applyEquipmentSocketPose(rodProp, ASSET_IDS.TOOL_FISHING_ROD_A);
    const rodBaseQuaternion = rodProp?.userData.socketBaseQuaternion as THREE.Quaternion | undefined;
    if (!sport && rodProp && rodBaseQuaternion) this.fishingRodBend?.resetAim(rodBaseQuaternion);

    if (!sport) {
      if (this.lastFishingInstanceId !== null) {
        this.fishingRodBend?.resetDynamics();
      }
      this.lastFishingInstanceId = null;
      this.sportFishEndBeatSeconds = Math.max(0, this.sportFishEndBeatSeconds - deltaSeconds);
      if (this.sportFishEndBeatSeconds <= 0) this.sportFishEndCue = null;
      this.sportFishingCameraHint = this.sportFishEndBeatSeconds > 0 && this.sportFishEndCue
        ? {
            lookHint: { x: this.sportFishEndLook.x, y: this.sportFishEndLook.y, z: this.sportFishEndLook.z },
            fightReachMeters: 0,
            lineTension: 0,
            lineLoadRatio: 0,
            snapTimerSeconds: 0,
            fightBehavior: "rest",
            behaviorPhase: "recovery",
            behaviorPhaseProgress: 1,
            fishDepthMeters: 0,
            fishStaminaRatio: 0,
            shakeAmplitude: 0,
            cameraEvent: this.sportFishEndCue
          }
        : null;
    }

    if (!basic && !sport) {
      if (rodProp?.visible && this.playerAnimation) alignEquipmentHands(this.playerAnimation, rodProp);
      this.fishingBobberGroup.visible = false;
      if (this.fishingLineMesh) this.fishingLineMesh.visible = false;
      if (this.fishingSubmergedLineMesh) this.fishingSubmergedLineMesh.visible = false;
      if (this.hookedFishModel) this.hookedFishModel.visible = false;
      this.lastBasicFishingPhase = null;
      return;
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
      // The simulation owns where the wind set this cast down; presentation only
      // draws it. Reach is already wind-scaled, and the lateral drift is signed
      // to the caster's right.
      const castDrift = basic.castLateralDriftMeters ?? 0;
      const targetX = playerPose.x + forwardX * castDistance + rightX * castDrift;
      const targetZ = playerPose.z + forwardZ * castDistance + rightZ * castDrift;
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
      this.sportFishEndBeatSeconds = 0;
      this.sportFishEndCue = null;
      const presentation = this.sportFishingPresentation;
      endpointX = presentation.endpointX;
      endpointZ = presentation.endpointZ;
      endpointY = this.water.sample(endpointX, endpointZ, timeSeconds).height - presentation.depthMeters;
      const newlyHooked = this.lastFishingInstanceId !== sport.fish.instanceId;
      this.sportFishingCameraHint = {
        lookHint: { x: endpointX, y: endpointY, z: endpointZ },
        fightReachMeters: sport.distanceMeters,
        lineTension: sport.lineTension,
        lineLoadRatio: presentation.loadRatio,
        snapTimerSeconds: sport.snapTimerSeconds,
        fightBehavior: sport.behavior,
        behaviorPhase: presentation.behaviorPhase,
        behaviorPhaseProgress: presentation.behaviorPhaseProgress,
        fishDepthMeters: presentation.depthMeters,
        fishStaminaRatio: presentation.staminaRatio,
        shakeAmplitude: presentation.shakeAmplitude,
        cameraEvent: newlyHooked ? "hooked" : null
      };
      lineSag = presentation.lineSagMeters;
      lineCurve = presentation.rodTwistRadians * Math.min(4, sport.distanceMeters * 0.18);
      surfaceStrength = presentation.surfaceStrength;
      this.fishingBobberBody.visible = false;
      this.fishingEndpointWorld.set(endpointX, endpointY, endpointZ);
      this.fishingRodBend?.aimToward(this.fishingEndpointWorld, deltaSeconds);
      this.fishingRodBend?.update(presentation.rodBendRadians, this.fishingEndpointWorld,
        presentation.retrievalMetersPerSecond, presentation.elapsedSeconds,
        presentation.rodDirection, presentation.shakeAmplitude);
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
          sport.elapsedSeconds,
          THREE.MathUtils.clamp(presentation.fishTailBeatHz / 1.8, 0.3, 3.2)
        );
        this.lastHookedFishUpdateSeconds = sport.elapsedSeconds;
      }
      if (this.hookedFishModel) {
        const shakeWobble = Math.sin(sport.elapsedSeconds * 22) * presentation.shakeAmplitude * 0.18;
        this.hookedFishModel.visible = true;
        this.hookedFishModel.position.set(endpointX, endpointY, endpointZ);
        this.hookedFishModel.scale.setScalar(0.82 * presentation.fishScale);
        this.hookedFishModel.rotation.set(
          presentation.fishPitchRadians,
          presentation.fishYawRadians + shakeWobble,
          presentation.fishRollRadians + presentation.fishBendRadians + presentation.fishFlashIntensity * 0.6,
          "YXZ"
        );
        if (this.hookedFishPresentation) {
          this.updateFishVisibility(this.hookedFishPresentation, presentation.depthMeters, 1);
        }
      }
    }

    if (rodProp?.visible && this.playerAnimation) alignEquipmentHands(this.playerAnimation, rodProp);
    const waterHeight = this.water.sample(endpointX, endpointZ, timeSeconds).height;
    if (sport) {
      const presentation = this.sportFishingPresentation;
      const sameFish = this.lastFishingInstanceId === sport.fish.instanceId;
      const crossed = sameFish && presentation.surfaceCrossings !== this.lastFishingSurfaceCrossings;
      const nearSurface = Math.abs(presentation.depthMeters) < 0.3;
      const advanced = sport.elapsedSeconds > this.lastFishingSampleElapsed;
      const breaching = sport.behavior === "burst" && nearSurface;
      if ((crossed || breaching || (advanced && nearSurface && surfaceStrength > 0.45))
        && timeSeconds - this.lastSportFishingSplashAtSeconds >= (crossed || breaching ? 0.12 : 0.65)) {
        this.farmVfx.spawn("water", { x: endpointX, y: waterHeight + 0.016, z: endpointZ }, timeSeconds,
          { origin: { x: endpointX, y: waterHeight + 0.2, z: endpointZ }, reducedMotion: this.prefersReducedMotion });
        if (breaching) {
          this.farmVfx.spawn("water", { x: endpointX, y: waterHeight + 0.05, z: endpointZ }, timeSeconds,
            { origin: { x: endpointX, y: waterHeight + 0.35, z: endpointZ }, reducedMotion: this.prefersReducedMotion });
        }
        this.lastSportFishingSplashAtSeconds = timeSeconds;
      }
      // Spray flicks off the rod tip when the blank loads up hard and fast.
      const rodLoad = presentation.rodLoad;
      const loadSpike = rodLoad - this.lastRodLoadSample;
      this.lastRodLoadSample = rodLoad;
      if (!this.prefersReducedMotion && (rodLoad > 0.9 || loadSpike > 0.12)
        && timeSeconds - this.lastRodTipSprayAtSeconds >= 0.4) {
        this.fishingRodBend?.getTipWorld(this.tempRodTipVec);
        this.farmVfx.spawn("water", { x: this.tempRodTipVec.x, y: this.tempRodTipVec.y, z: this.tempRodTipVec.z },
          timeSeconds, {
            origin: { x: this.tempRodTipVec.x, y: this.tempRodTipVec.y + 0.15, z: this.tempRodTipVec.z },
            reducedMotion: this.prefersReducedMotion
          });
        this.lastRodTipSprayAtSeconds = timeSeconds;
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
      // The sport line cuts a bigger wake at the water than a still bobber.
      const retrieval = sport ? this.sportFishingPresentation.retrievalMetersPerSecond : 0;
      const wakeGain = sport ? 0.72 + Math.min(0.52, retrieval * 0.22) : 0.7;
      const pulse = wakeGain + surfaceStrength * 0.7
        + Math.sin(timeSeconds * (3 + surfaceStrength * 8)) * 0.12 * secondaryScale
        + (sport ? Math.sin(timeSeconds * 11) * 0.08 * secondaryScale : 0);
      this.fishingBobberRipple.scale.set(pulse, 1, pulse);
      (this.fishingBobberRipple.material as THREE.MeshStandardMaterial).opacity =
        THREE.MathUtils.lerp(sport ? 0.2 : 0.28, sport ? 0.52 : 0.9,
          Math.max(surfaceStrength, sport ? Math.min(0.6, retrieval * 0.25) : 0));
      this.fishingBobberRipple.visible = sport ? lineVisible : surfaceStrength > 0.01;
    }

    if (!this.fishingLineMesh || !this.fishingSubmergedLineMesh) return;
    const lineMaterial = this.fishingLineMesh.material as LineMaterial;
    const submergedLineMaterial = this.fishingSubmergedLineMesh.material as LineMaterial;
    const lineLoadRatio = sport ? this.sportFishingPresentation.loadRatio : 0.35;
    const tensionRatio = THREE.MathUtils.clamp(lineLoadRatio, 0, 1);
    lineMaterial.opacity = sport ? THREE.MathUtils.lerp(0.68, 0.92, tensionRatio) : 0.82;
    lineMaterial.linewidth = sport ? THREE.MathUtils.lerp(1.25, 2.05, tensionRatio) : 1.4;
    submergedLineMaterial.opacity = sport ? THREE.MathUtils.lerp(0.28, 0.48, tensionRatio) : 0;
    submergedLineMaterial.linewidth = THREE.MathUtils.lerp(0.72, 1.15, tensionRatio);
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

    // Curve sideways in the line's own frame. Using the player's right vector
    // made the whole ribbon slide across the screen when the camera auto-yawed.
    const lineDx = endpointX - rodTipX;
    const lineDz = endpointZ - rodTipZ;
    const horizontalLineLength = Math.hypot(lineDx, lineDz);
    const curveX = horizontalLineLength > 0.001 ? lineDz / horizontalLineLength : rightX;
    const curveZ = horizontalLineLength > 0.001 ? -lineDx / horizontalLineLength : rightZ;

    const lineEndY = basic ? endpointY + 0.12 : endpointY;
    const dangerVibration = sport
      ? THREE.MathUtils.clamp((lineLoadRatio - 0.9) / 0.25, 0, 1)
        * 0.025
        * (this.prefersReducedMotion ? CANONICAL_RENDER_CONFIG.motion.reducedMotionScale : 1)
      : 0;
    // Cool nylon grey → warm load signal → red only close to a snap.
    const hot = THREE.MathUtils.clamp(tensionRatio * 1.12, 0, 1);
    const near = lineLoadRatio > 0.82 ? THREE.MathUtils.clamp((lineLoadRatio - 0.82) / 0.18, 0, 1) : 0;
    const lineR = THREE.MathUtils.lerp(THREE.MathUtils.lerp(0.64, 0.94, hot), 1, near);
    const lineG = THREE.MathUtils.lerp(THREE.MathUtils.lerp(0.72, 0.9, hot), 0.26, near);
    const lineB = THREE.MathUtils.lerp(0.76, 0.18, near);
    for (let index = 0; index <= FISHING_LINE_SEGMENTS; index += 1) {
      const t = index / FISHING_LINE_SEGMENTS;
      const curve = Math.sin(t * Math.PI);
      const vibration = sport
        ? Math.sin(sport.elapsedSeconds * 34 + t * 15) * dangerVibration * curve
        : 0;
      const cx = THREE.MathUtils.lerp(rodTipX, endpointX, t) + curveX * (lineCurve * curve + vibration);
      const cz = THREE.MathUtils.lerp(rodTipZ, endpointZ, t) + curveZ * (lineCurve * curve + vibration);
      const cy = THREE.MathUtils.lerp(rodTipY, lineEndY, t) - curve * lineSag;
      const offset = index * 3;
      this.fishingLinePathPositions[offset] = cx;
      this.fishingLinePathPositions[offset + 1] = cy;
      this.fishingLinePathPositions[offset + 2] = cz;
      this.fishingLineWaterOffsets[index] = cy - this.water.sample(cx, cz, timeSeconds).height;
    }

    let waterSplitIndex = -1;
    if (sport) {
      for (let index = 1; index <= FISHING_LINE_SEGMENTS; index += 1) {
        if (this.fishingLineWaterOffsets[index - 1] > 0.004
          && this.fishingLineWaterOffsets[index] <= 0.004) {
          waterSplitIndex = index;
          break;
        }
      }
    }
    let entryX = endpointX;
    let entryY = waterHeight + 0.008;
    let entryZ = endpointZ;
    if (waterSplitIndex >= 1) {
      const previousOffset = this.fishingLineWaterOffsets[waterSplitIndex - 1];
      const nextOffset = this.fishingLineWaterOffsets[waterSplitIndex];
      const crossing = THREE.MathUtils.clamp(
        previousOffset / Math.max(0.0001, previousOffset - nextOffset),
        0,
        1
      );
      const previous = (waterSplitIndex - 1) * 3;
      const next = waterSplitIndex * 3;
      entryX = THREE.MathUtils.lerp(
        this.fishingLinePathPositions[previous],
        this.fishingLinePathPositions[next],
        crossing
      );
      entryZ = THREE.MathUtils.lerp(
        this.fishingLinePathPositions[previous + 2],
        this.fishingLinePathPositions[next + 2],
        crossing
      );
      entryY = this.water.sample(entryX, entryZ, timeSeconds).height + 0.008;
    }

    for (let index = 0; index <= FISHING_LINE_SEGMENTS; index += 1) {
      const offset = index * 3;
      const airUsesPath = waterSplitIndex < 0 || index < waterSplitIndex;
      const submergedUsesPath = waterSplitIndex >= 0 && index > waterSplitIndex;
      this.fishingLinePositions[offset] = airUsesPath ? this.fishingLinePathPositions[offset] : entryX;
      this.fishingLinePositions[offset + 1] = airUsesPath ? this.fishingLinePathPositions[offset + 1] : entryY;
      this.fishingLinePositions[offset + 2] = airUsesPath ? this.fishingLinePathPositions[offset + 2] : entryZ;
      this.fishingSubmergedLinePositions[offset] = submergedUsesPath
        ? this.fishingLinePathPositions[offset]
        : entryX;
      this.fishingSubmergedLinePositions[offset + 1] = submergedUsesPath
        ? this.fishingLinePathPositions[offset + 1]
        : entryY;
      this.fishingSubmergedLinePositions[offset + 2] = submergedUsesPath
        ? this.fishingLinePathPositions[offset + 2]
        : entryZ;
      this.fishingLineColors[offset] = lineR;
      this.fishingLineColors[offset + 1] = lineG;
      this.fishingLineColors[offset + 2] = lineB;
      this.fishingSubmergedLineColors[offset] = THREE.MathUtils.lerp(0.22, 0.48, near);
      this.fishingSubmergedLineColors[offset + 1] = THREE.MathUtils.lerp(0.52, 0.34, near);
      this.fishingSubmergedLineColors[offset + 2] = THREE.MathUtils.lerp(0.58, 0.26, near);
    }
    this.syncFishingLineGeometry(this.fishingLineMesh, this.fishingLinePositions, this.fishingLineColors);
    this.syncFishingLineGeometry(
      this.fishingSubmergedLineMesh,
      this.fishingSubmergedLinePositions,
      this.fishingSubmergedLineColors
    );
    if (sport && waterSplitIndex >= 0) {
      this.fishingBobberGroup.position.set(entryX, entryY + 0.004, entryZ);
    }
    this.fishingLineMesh.visible = lineVisible;
    this.fishingSubmergedLineMesh.visible = lineVisible && sport !== null && waterSplitIndex >= 0;
  }

  private syncFishingLineGeometry(mesh: Line2, positions: Float32Array, colors: Float32Array): void {
    const geometry = mesh.geometry as LineGeometry;
    const startPosition = geometry.getAttribute("instanceStart") as THREE.InterleavedBufferAttribute;
    const endPosition = geometry.getAttribute("instanceEnd") as THREE.InterleavedBufferAttribute;
    const startColor = geometry.getAttribute("instanceColorStart") as THREE.InterleavedBufferAttribute;
    const endColor = geometry.getAttribute("instanceColorEnd") as THREE.InterleavedBufferAttribute;
    for (let segment = 0; segment < FISHING_LINE_SEGMENTS; segment += 1) {
      const startOffset = segment * 3;
      const endOffset = (segment + 1) * 3;
      startPosition.setXYZ(segment, positions[startOffset], positions[startOffset + 1], positions[startOffset + 2]);
      endPosition.setXYZ(segment, positions[endOffset], positions[endOffset + 1], positions[endOffset + 2]);
      startColor.setXYZ(segment, colors[startOffset], colors[startOffset + 1], colors[startOffset + 2]);
      endColor.setXYZ(segment, colors[endOffset], colors[endOffset + 1], colors[endOffset + 2]);
    }
    startPosition.data.needsUpdate = true;
    startColor.data.needsUpdate = true;
  }

  private sampleBoatPresentation(
    boat: GameState["boats"][string],
    state: Readonly<GameState>,
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
    const eventResponse = this.boatResponses.sample(
      boat.id,
      timeSeconds,
      this.prefersReducedMotion
    );
    const targetWaveHeight =
      (bowHeight + sternHeight + portHeight + starboardHeight) * 0.25
      + eventResponse.heaveMeters;
    const tiltScale = this.prefersReducedMotion
      ? CANONICAL_RENDER_CONFIG.motion.reducedMotionScale
      : 1;
    const maximumTilt = boat.boatTypeId === "boat.skiff"
      ? THREE.MathUtils.degToRad(10)
      : THREE.MathUtils.degToRad(12);
    const targetPitch = THREE.MathUtils.clamp(
      Math.atan2(sternHeight - bowHeight, footprint.halfLength * 2) * tiltScale
        + eventResponse.pitchRadians,
      -maximumTilt,
      maximumTilt
    );
    // Fight surge: a hooked fish heels the boat it is fought from. A steady
    // lean toward the fish plus a small oscillation, both scaled by line load
    // and fully suppressed under reduced motion. Presentation only.
    let surgeRoll = 0;
    const sport = state.sportFishing;
    if (
      sport && sport.result === "active" &&
      state.player.activeBoatId === boat.id &&
      !this.prefersReducedMotion
    ) {
      const rod = ContentRegistry.rods.get(sport.rodId);
      const loadRatio = THREE.MathUtils.clamp(
        sport.lineTension / Math.max(1, rod?.maxSafeTension ?? 80), 0, 1
      );
      const bearing = sport.dynamics?.bearingRadians ?? boat.headingRadians;
      const side = Math.sign(Math.sin(bearing - boat.headingRadians)) || 0;
      surgeRoll = loadRatio * (0.02 * side + Math.sin(timeSeconds * 2.3) * 0.012);
    }
    const targetRoll = THREE.MathUtils.clamp(
      Math.atan2(starboardHeight - portHeight, footprint.halfBeam * 2) * tiltScale
        + surgeRoll + eventResponse.rollRadians,
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
      if (conditions.seaRoughness > 0.55 && Math.abs(boat.speed) >= 1.0) {
        const bowX = boat.x + Math.sin(boat.headingRadians) * 1.6 * direction;
        const bowZ = boat.z + Math.cos(boat.headingRadians) * 1.6 * direction;
        this.farmVfx.spawn(
          "water",
          { x: bowX, y: boat.y + 0.1, z: bowZ },
          timeSeconds,
          { origin: { x: bowX, y: boat.y + 0.45, z: bowZ }, reducedMotion: this.prefersReducedMotion }
        );
      }
      this.wakeEmitState.set(boatId, { x: boat.x, z: boat.z, timeSeconds });
    } else if (!previous) {
      this.wakeEmitState.set(boatId, { x: boat.x, z: boat.z, timeSeconds });
    }
  }

  private async loadMissingMeshes(sim: Simulation, timeSeconds: number): Promise<void> {
    const state = sim.getState();
    let loadedNewMesh = false;

    if (!this.playerMesh) {
      const mesh = await this.loadModel(ASSET_IDS.CHAR_PLAYER_A);
      if (!this.playerMesh) {
        this.setShadowPolicy(mesh, CANONICAL_RENDER_CONFIG.shadows.castCharacters);
        this.batchPlayerRigidMeshes(mesh);
        const pelvis = resolveHumanoidRig(mesh).bones.pelvis;
        if (!pelvis) throw new Error("[WorldScene] char_player_a is missing its semantic pelvis");
        mesh.updateMatrixWorld(true);
        pelvis.getWorldPosition(this.tempCharacterWorldPosition);
        mesh.worldToLocal(this.tempCharacterWorldPosition);
        if (!Number.isFinite(this.tempCharacterWorldPosition.y) || this.tempCharacterWorldPosition.y <= 0) {
          throw new Error("[WorldScene] char_player_a has an invalid rest pelvis offset");
        }
        this.playerPelvis = pelvis;
        this.playerMesh = mesh;
        this.playerBackpackSocket = createTradePackBackSocket(mesh);
        this.playerEquipmentAssembler = new CharacterEquipmentAssembler(mesh, {
          loadModel: (assetId) => this.loadModel(assetId),
          configureObject: (object) => this.setShadowPolicy(object, false),
          onToolChanged: (key, object) => {
            if (key === "rod") {
              this.fishingRodBend?.dispose();
              this.fishingRodBend = null;
            }
            if (!object) {
              this.farmingProps.delete(key);
              return;
            }
            this.farmingProps.set(key, object);
            if (key === "rod") this.fishingRodBend = new FishingRodBend(object);
          },
          onAssetError: (assetId, error) => console.warn(
            `[WorldScene] Equipment presentation ${assetId} could not be loaded; canonical loadout is unchanged.`,
            error
          )
        });
        this.playerAnimation = new HumanoidAnimator(mesh);
        this.scene.add(this.playerMesh);
        loadedNewMesh = true;
        await this.attachFarmingProps(mesh);
        await this.syncPlayerEquipment(state);
      }
    }
    if (this.playerEquipmentAssembler) await this.syncPlayerEquipment(state);
    for (const [boatId, boatState] of Object.entries(state.boats)) {
      let bMesh = this.boatMeshes.get(boatId);
      if (!bMesh) {
        const assetId = boatAssetId(boatState.boatTypeId);
        bMesh = await this.loadModel(assetId);
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
    this.checkAlive();

    const carriedId = state.player.carriedFishCargoId;
    if (this.carriedFishPresentation?.cargoId !== carriedId) {
      this.carriedFishPresentation?.root.removeFromParent();
      this.carriedFishPresentation = null;
    }
    const carriedCargo = carriedId ? state.fishCargo[carriedId] : null;
    if (carriedCargo?.location.type === "player" && !this.carriedFishPresentation && this.playerMesh) {
      const cargoAssetId = fishCargoPackAsset(carriedCargo.speciesId);
      if (!cargoAssetId) throw new Error(`[WorldScene] No fish asset for carried ${carriedCargo.speciesId}`);
      const payload = await this.loadModel(cargoAssetId);
      if (sim.getState().player.carriedFishCargoId === carriedId && !this.carriedFishPresentation) {
        const socket = this.playerBackpackSocket;
        if (!socket) throw new Error("[WorldScene] Player is missing its carry socket");
        const cradle = payload;
        cradle.name = "carried_fish_presentation";
        cradle.userData.dynamicPresentation = true;
        cradle.userData.cargoId = carriedId;
        socket.add(cradle);
        this.setShadowPolicy(cradle, CANONICAL_RENDER_CONFIG.shadows.castCharacters);
        this.carriedFishPresentation = { cargoId: carriedId!, root: cradle };
        loadedNewMesh = true;
      }
    }

    this.syncBoatFishPacks(sim.getState());
    for (const [boatId, boat] of Object.entries(sim.getState().boats)) {
      const mesh = this.boatMeshes.get(boatId);
      if (!mesh) continue;
      for (const [slot, cargoId] of boat.fishCargoSlotIds.entries()) {
        if (!cargoId || this.boatFishPacks.has(cargoId)) continue;
        const cargo = sim.getState().fishCargo[cargoId];
        if (!cargo) continue;
        const assetId = fishCargoPackAsset(cargo.speciesId);
        if (!assetId) throw new Error(`No trade pack for ${cargo.speciesId}`);
        const root = await this.loadModel(assetId);
        if (sim.getState().boats[boatId]?.fishCargoSlotIds[slot] !== cargoId || this.boatFishPacks.has(cargoId)) continue;
        attachBoatTradePack(mesh, boat.boatTypeId, slot, root);
        root.userData.cargoId = cargoId;
        this.setShadowPolicy(root, CANONICAL_RENDER_CONFIG.shadows.castCharacters);
        this.boatFishPacks.set(cargoId, { root, boatId, slot });
        loadedNewMesh = true;
      }
    }

    const sportFishAssetId = state.sportFishing
      ? fishSpeciesAsset(state.sportFishing.fish.speciesId)
      : null;
    if (this.hookedFishAssetId !== sportFishAssetId) {
      this.disposeFishVisibility(this.hookedFishPresentation);
      this.hookedFishModel?.removeFromParent();
      this.hookedFishModel = null;
      this.hookedFishAssetId = null;
      this.hookedFishPresentation = null;
      this.lastHookedFishUpdateSeconds = 0;
    }
    if (sportFishAssetId && !this.hookedFishModel) {
      const hookedFish = await this.loadModel(sportFishAssetId);
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
        const mouthHook = hookedFish.getObjectByName(`${sportFishAssetId}_mouth_hook`);
        if (mouthHook) {
          this.fishingMouthNode = mouthHook;
          this.fishingMouthLocal.set(0, 0, 0);
        } else {
          // Backward-compatible fallback while an older published fish GLB is
          // cached: authored fish travel nose-first along local -Y.
          const body = hookedFish.getObjectByName(`${speciesKey}_body`) ?? hookedFish;
          const bodyBounds = new THREE.Box3().setFromObject(body);
          bodyBounds.getCenter(this.fishingMouthLocal);
          this.fishingMouthLocal.y = bodyBounds.min.y;
          this.fishingMouthNode = body;
          body.worldToLocal(this.fishingMouthLocal);
        }
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
      sGroup.name = `fish_school:${schoolId}`;
      const surfaceRipples = new SchoolSurfaceRipples(CANONICAL_RENDER_CONFIG.fishSchools.memberCount);
      sGroup.add(surfaceRipples.root);
      sGroup.userData.surfaceRipples = surfaceRipples;
      try {
        const fishAssetIds = fishSchoolMemberAssets(school, CANONICAL_RENDER_CONFIG.fishSchools.memberCount);
        if (fishAssetIds.length > 0) {
          const fishMembers: FishPresentationMember[] = [];
          sGroup.userData.fishMembers = fishMembers;
          for (let index = 0; index < fishAssetIds.length; index++) {
            const fishAssetId = fishAssetIds[index];
            const fish = await this.loadModel(fishAssetId);
            fish.scale.setScalar(CANONICAL_RENDER_CONFIG.fishSchools.modelScale);
            fish.userData.dynamicPresentation = true;
            this.setShadowPolicy(fish, false);
            sGroup.add(fish);
            fishMembers.push(this.createFishPresentationMember(
              fish,
              fishAssetId,
              (index + stablePresentationPhase(`${schoolId}:${index}`) * 0.65) / fishAssetIds.length
            ));
          }
        }
        const schoolGull = await this.loadModel(ASSET_IDS.FAUNA_GULL_A);
        schoolGull.scale.setScalar(1.05);
        schoolGull.userData.dynamicPresentation = true;
        this.setShadowPolicy(schoolGull, false);
        schoolGull.visible = false;
        sGroup.add(schoolGull);
        sGroup.userData.schoolGull = schoolGull;
        sGroup.userData.cuePhase = stablePresentationPhase(`school-cues:${schoolId}`);
        if (!sim.getState().world.activeSchools[schoolId]) {
          this.disposeSchoolEffect(sGroup);
          continue;
        }
        this.scene.add(sGroup);
        this.schoolEffects.set(schoolId, sGroup);
        loadedNewMesh = true;
        sGroup.position.set(school.x, 0, school.z);
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
    this.checkAlive();
    this.applyImmediateSync(sim, Math.max(timeSeconds, this.lastPresentationTime), this.latestPresentedPlayer);
  }

  /**
   * Synchronizes visual scene with authoritative Simulation state.
   */
  public async syncWithSimulation(
    sim: Simulation,
    timeSeconds: number,
    presentedPlayer?: PresentedPlayerFrame,
    boatPresentationInput: BoatPresentationInput | null = null,
    locomotionTimeScale = 1
  ): Promise<void> {
    this.checkAlive();
    this.applyImmediateSync(sim, timeSeconds, presentedPlayer ?? null, boatPresentationInput, locomotionTimeScale);

    if (!this.syncInFlight) {
      this.syncInFlight = this.loadMissingMeshes(sim, timeSeconds).finally(() => { this.syncInFlight = null; });
    }
    await this.syncInFlight;
    this.checkAlive();
  }

  public render(camera: THREE.Camera, deltaSeconds = 1 / 60): void {
    this.hasRenderedFrame = true;
    this.updateQuestWaypoint(camera, deltaSeconds);
    this.updateQualityTransition(deltaSeconds);
    this.updateDistanceManagedPresentation();
    this.groundCover.update(this.visibilityAnchor.x, this.visibilityAnchor.z);
    this.groundCover.updateRenderVisibility(camera);
    this.meadowField.update(this.visibilityAnchor.x, this.visibilityAnchor.z);
    this.meadowField.updateRenderVisibility(camera);
    for (const batch of this.rigidAnimationBatches.values()) batch.update();
    this.rendererPipeline.render(camera);
  }

  public prepareForVisualCapture(camera: THREE.Camera): Promise<void> { return this.prepareForEntry(camera); }

  public prepareForEntry(camera: THREE.Camera): Promise<void> {
    // Distance-managed LOD and visibility only recompute when the anchor moves
    // or a load dirties them, and a fixed benchmark camera never moves. Force
    // one pass here so the captured frame cannot depend on whether an async
    // asset load happened to land before or after the last update.
    this.distanceVisibilityDirty = true;
    this.updateDistanceManagedPresentation();
    for (const batch of this.rigidAnimationBatches.values()) batch.update();
    return this.rendererPipeline.prepareForEntry(camera);
  }

  public setCaptureRenderMode(mode: CaptureRenderMode): void {
    this.rendererPipeline.setCaptureRenderMode(mode);
  }

  public setDiagnosticOverlay(mode: WorldFieldOverlay | null, worldSeed: number): void {
    if (this.diagnosticOverlayMode === mode) return;
    if (this.diagnosticOverlay) {
      this.diagnosticOverlay.removeFromParent();
      this.diagnosticOverlay.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        if (Array.isArray(object.material)) {
          for (const material of object.material) material.dispose();
        } else {
          object.material.dispose();
        }
      });
      this.diagnosticOverlay = null;
    }
    this.diagnosticOverlayMode = mode;
    if (!mode) return;
    this.diagnosticOverlay = createWorldDiagnosticOverlay(mode, worldSeed);
    this.scene.add(this.diagnosticOverlay);
  }

  public renderObjectStats(): { visibleMeshes: number; shadowCasters: number; batchedMeshes: number; instancedMeshes: number } {
    let visibleMeshes = 0;
    let shadowCasters = 0;
    let batchedMeshes = 0;
    let instancedMeshes = 0;
    this.scene.traverseVisible((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (object.layers.mask === 0) return;
      if (object instanceof THREE.InstancedMesh && object.count === 0) return;
      visibleMeshes += 1;
      if (object.castShadow) shadowCasters += 1;
      if (object instanceof THREE.BatchedMesh) batchedMeshes += 1;
      if (object instanceof THREE.InstancedMesh) instancedMeshes += 1;
    });
    return { visibleMeshes, shadowCasters, batchedMeshes, instancedMeshes };
  }

  public handleResize(width: number, height: number): void {
    this.lastResizeWidth = Math.max(1, width);
    this.lastResizeHeight = Math.max(1, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.lightingRig.pixelRatioCap()));
    this.renderer.setSize(this.lastResizeWidth, this.lastResizeHeight);
    const fishingLineMaterial = this.fishingLineMesh?.material;
    if (fishingLineMaterial instanceof LineMaterial) {
      fishingLineMaterial.resolution.set(this.lastResizeWidth, this.lastResizeHeight);
    }
    const submergedFishingLineMaterial = this.fishingSubmergedLineMesh?.material;
    if (submergedFishingLineMaterial instanceof LineMaterial) {
      submergedFishingLineMaterial.resolution.set(this.lastResizeWidth, this.lastResizeHeight);
    }
    this.rendererPipeline.resize(this.lastResizeWidth, this.lastResizeHeight);
  }

  public setQuality(tier: QualityTier): void {
    this.targetQualityLevel = qualityTierLevel(tier);
    if (this.hasRenderedFrame) return;
    this.qualityLevel = this.targetQualityLevel;
    this.applyContinuousQuality(true);
    this.applyDiscreteQuality(tier);
  }

  private updateQualityTransition(deltaSeconds: number): void {
    if (Math.abs(this.targetQualityLevel - this.qualityLevel) <= 0.0001) return;
    this.qualityLevel = advanceQualityLevel(
      this.qualityLevel,
      this.targetQualityLevel,
      THREE.MathUtils.clamp(deltaSeconds, 0, 0.1)
    );
    this.qualityRebuildElapsedSeconds += deltaSeconds;
    this.applyContinuousQuality(
      this.qualityRebuildElapsedSeconds
        >= CANONICAL_RENDER_CONFIG.transitions.qualityRebuildIntervalSeconds
        || this.qualityLevel === this.targetQualityLevel
    );
    const discreteTier = qualityTierAtLevel(this.qualityLevel);
    if (discreteTier !== this.qualityTier) this.applyDiscreteQuality(discreteTier);
  }

  private applyContinuousQuality(rebuildDensity: boolean): void {
    this.qualityContactStrength = contactTierEffectStrength(this.qualityLevel);
    this.atmosphereSky?.setVolumeBlend(highTierEffectStrength(this.qualityLevel));
    this.rendererPipeline.setGtaoBlendScale(highTierEffectStrength(this.qualityLevel));
    this.rainField?.setQualityLevel(this.qualityLevel);
    this.fireflyField?.setQualityLevel(this.qualityLevel);
    if (!rebuildDensity) return;
    this.qualityRebuildElapsedSeconds = 0;
    this.groundCover.setQualityLevel(this.qualityLevel);
    this.meadowField.setQualityLevel(this.qualityLevel);
    this.distanceVisibilityDirty = true;
  }

  private applyDiscreteQuality(tier: QualityTier): void {
    this.qualityTier = tier;
    this.lightingRig.setQuality(tier);
    this.rendererPipeline.setQuality(tier);
    this.atmosphereSky?.setVolumeBlend(highTierEffectStrength(this.qualityLevel));
    this.water?.setQuality(tier);
    this.rendererPipeline.setGtaoBlendScale(highTierEffectStrength(this.qualityLevel));
    this.applyPracticalLightBudget();
    this.distanceVisibilityDirty = true;
    this.playerContactShadow?.removeFromParent();
    this.playerContactShadow?.geometry.dispose();
    (this.playerContactShadow?.material as THREE.Material | undefined)?.dispose();
    this.playerContactShadow = null;
    this.buildPlayerContactShadow();
    this.handleResize(this.lastResizeWidth || window.innerWidth, this.lastResizeHeight || window.innerHeight);
  }

  /**
   * Releases GPU resources owned by this scene. Catalog GLB clones share
   * geometry with AssetLoader and are only detached, not disposed.
   */
  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.detachPlayerFromDonkey();
    for (const batch of this.rigidAnimationBatches.values()) batch.dispose();
    this.rigidAnimationBatches.clear();
    this.boatResponses.clear();
    this.socialReactions.clear();
    this.playerAttachmentTransition = null;
    this.playerAnimation?.dispose();
    this.playerAnimation = null;
    this.playerEquipmentAssembler?.dispose();
    this.playerEquipmentAssembler = null;
    this.playerPelvis = null;
    this.carriedFishPresentation?.root.removeFromParent();
    this.carriedFishPresentation = null;
    for (const pack of this.boatFishPacks.values()) pack.root.removeFromParent();
    this.boatFishPacks.clear();
    this.playerBackpackSocket = null;
    this.lastPlayerDiscontinuitySequence = -1;
    for (const npc of this.npcPresentations.values()) {
      npc.animator.dispose();
      npc.model.removeFromParent();
    }
    this.npcPresentations.clear();
    for (const person of this.ambientTownsfolk) {
      person.animator.dispose();
      person.model.removeFromParent();
    }
    this.ambientTownsfolk.length = 0;
    this.playerAnimationEvents.length = 0;
    this.donkeyPresentation?.mixer?.stopAllAction();
    if (this.donkeyPresentation) this.disposeDonkeyShadowPresentation(this.donkeyPresentation.root);
    this.donkeyPresentation = null;
    this.fishingRodBend?.dispose();
    this.fishingRodBend = null;
    this.cropInstances.dispose();
    for (const materials of this.interactionMaterials.values()) for (const material of materials) material.dispose();
    this.interactionMaterials.clear();
    this.groundCover.dispose();
    this.meadowField.dispose();
    this.setDiagnosticOverlay(null, 0);
    this.farmVfx?.dispose();
    this.farmVfx?.group.removeFromParent();
    this.footfallVfx?.dispose();
    this.footfallVfx?.group.removeFromParent();
    this.fireflyField?.dispose();
    this.fireflyField?.group.removeFromParent();
    this.rainField?.dispose();
    this.rainField?.group.removeFromParent();
    this.disposeBatchedMeshes();
    disposeVegetationTintMaterials();
    disposeArchitectureWindows();
    this.water?.dispose();
    this.water?.group.removeFromParent();
    this.shoreFoam?.dispose();
    this.shoreFoam?.mesh.removeFromParent();
    this.boatWakes?.dispose();
    this.boatWakes?.group.removeFromParent();
    this.rendererPipeline.dispose();
    this.terrainSurfaceMaterial.dispose();
    this.roadSurfaceMaterial.dispose();
    this.cultivatedSurfaceMaterial.dispose();

    for (const group of this.schoolEffects.values()) {
      this.disposeSchoolEffect(group);
    }
    this.schoolEffects.clear();
    this.disposeFishVisibility(this.hookedFishPresentation);
    this.hookedFishModel?.removeFromParent();
    this.hookedFishModel = null;
    this.hookedFishAssetId = null;
    this.hookedFishPresentation = null;
    this.skiffMooringPreview?.removeFromParent();
    this.skiffMooringPreview = null;

    for (const terrainMesh of this.terrainMeshes) {
      terrainMesh.removeFromParent();
      if (terrainMesh instanceof THREE.BatchedMesh) terrainMesh.dispose();
      else terrainMesh.geometry.dispose();
    }
    this.terrainMeshes.length = 0;
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
    this.questWaypointShaft.geometry.dispose();
    (this.questWaypointShaft.material as THREE.Material).dispose();
    this.questWaypointShaft.removeFromParent();
    if (this.playerContactShadow) {
      this.playerContactShadow.removeFromParent();
      this.playerContactShadow.geometry.dispose();
      (this.playerContactShadow.material as THREE.Material).dispose();
      this.playerContactShadow = null;
    }

    this.atmosphereSky?.dispose();
    this.atmosphereSky = null;
    this.practicalGlowTexture?.dispose();
    this.practicalGlowTexture = null;

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
    if (this.fishingSubmergedLineMesh) {
      this.fishingSubmergedLineMesh.removeFromParent();
      this.fishingSubmergedLineMesh.geometry.dispose();
      (this.fishingSubmergedLineMesh.material as THREE.Material).dispose();
      this.fishingSubmergedLineMesh = null;
    }

    // Ambient fauna/flyers and background boats own mixers, sprites and scene
    // nodes that no other dispose path reached.
    for (const fauna of this.faunaPresentations) {
      if (fauna.mixer) {
        fauna.mixer.stopAllAction();
        fauna.mixer.uncacheRoot(fauna.mixer.getRoot());
      }
      fauna.root.removeFromParent();
    }
    this.faunaPresentations.length = 0;
    for (const flyer of this.ambientFlyers) {
      flyer.mixer?.stopAllAction();
      if (flyer.mixer) flyer.mixer.uncacheRoot(flyer.object);
      flyer.object.removeFromParent();
    }
    this.ambientFlyers.length = 0;
    for (const boat of this.backgroundBoats) boat.removeFromParent();
    this.backgroundBoats.length = 0;
    for (const practical of this.practicalLights) {
      practical.glow?.removeFromParent();
      practical.glow?.material.dispose();
      practical.light.removeFromParent();
      practical.light.dispose();
    }
    this.practicalLights.length = 0;
    if (this.layoutEditHelper) {
      this.layoutEditHelper.removeFromParent();
      this.layoutEditHelper.geometry.dispose();
      (this.layoutEditHelper.material as THREE.Material).dispose();
      this.layoutEditHelper = null;
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
  if (object instanceof THREE.BatchedMesh) object.dispose();
  else object.geometry.dispose();
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
