// src/render/scene/WorldScene.ts

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CANONICAL_RENDER_CONFIG, type QualityTier } from "../config/VisualRenderConfig";
import { FacetedWater } from "../water/FacetedWater";
import { AssetLoader } from "../loaders/AssetLoader";
import { Simulation } from "../../simulation/Simulation";
import { PaletteMaterials } from "../materials/PaletteMaterials";
import { PALETTE_HEX } from "../materials/PaletteTokens";
import {
  ASSET_BY_ID,
  ASSET_IDS,
  boatAssetId,
  type AssetId
} from "../assets/AssetCatalog";
import type { StaticCollisionProxy } from "../../physics/StaticCollision";
import { projectAssetCollision } from "../../physics/CollisionCatalogAdapter";
import type { GameState } from "../../simulation/core/types";
import type { CropPlacementResult } from "../../simulation/core/contracts";
import { WATER_SURFACE, WORLD_PATHS, WORLD_ROUTES, WorldLayout } from "../../world/WorldLayout";
import {
  STARTER_FARM_LAYOUT,
  farmLocalToWorld,
  starterStructureAnchor
} from "../../world/FarmLayout";
import { HARBOR_FISH_TABLE } from "../../world/WorldAnchors";
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
  AnimationController,
  isPlayerRigObjectName,
  type BoatAnimationInput,
  type CharacterAnimationEvent,
  type PlayerAnimation
} from "../animation/AnimationController";
import type { PresentedPlayerFrame } from "../presentation/PlayerPresentationBuffer";
import { LightingRig } from "../lighting/LightingRig";
import { RendererPipeline } from "../pipeline/RendererPipeline";
import { ShoreFoam } from "../water/ShoreFoam";

import { BoatWakePool } from "../water/BoatWakePool";
import { CropInstanceRenderer } from "./CropInstanceRenderer";
import { GroundCoverRenderer } from "./GroundCoverRenderer";
import { buildStarterFarmGround } from "./StarterFarmGround";
import { ContentRegistry } from "../../content/ContentRegistry";
import { fishSchoolAsset } from "./FishSchoolAssets";



import { FarmVfxPool, type FarmVfxKind, type FarmVfxPoint } from "../effects/FarmVfxPool";
import type { WaterConditions } from "../water/WaterSurface";

export interface BoatPresentationInput extends BoatAnimationInput {
  boatId: string;
}

interface NpcPresentation {
  id: string;
  assetId: string;
  anchor: { x: number; z: number; rotationY: number };
  model: THREE.Group;
  mixer: THREE.AnimationMixer;
  headBone?: THREE.Object3D;
  initialRotationY: number;
}

type FarmingPresentationActionName =
  | "plant"
  | "water"
  | "harvest"
  | "processing-start"
  | "processing-collect";
type FarmingPresentationPhase = "started" | "committed" | "completed" | "cancelled";

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

const FARMING_PROP_ATTACHMENTS: readonly PropAttachmentConfig[] = [
  { key: "seed", assetId: ASSET_IDS.TOOL_SEED_POUCH_A, socket: "char_player_hip_socket", scale: 0.72 },
  { key: "water", assetId: ASSET_IDS.TOOL_WATERING_CAN_A, socket: "char_player_tool_socket", scale: 0.72 },
  { key: "sickle", assetId: ASSET_IDS.TOOL_SICKLE_A, socket: "char_player_tool_socket", scale: 0.82 },
  { key: "bundle", assetId: ASSET_IDS.PROP_CROP_BUNDLE_A, socket: "char_player_carry_socket", scale: 0.76 },
  { key: "basket", assetId: ASSET_IDS.PROP_HARVEST_BASKET_A, socket: "char_player_carry_socket", scale: 0.68 },
  { key: "scoop", assetId: ASSET_IDS.TOOL_WORKSTATION_SCOOP_A, socket: "char_player_tool_socket", scale: 0.78 },
  {
    key: "rod",
    assetId: ASSET_IDS.TOOL_FISHING_ROD_A,
    socket: "char_player_tool_socket",
    scale: 0.85,
    position: [0, -0.04, -0.02],
    rotation: [Math.PI, 0, 0]
  }
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

  private playerMesh: THREE.Group | null = null;
  private boatMeshes: Map<string, THREE.Group> = new Map();
  private readonly cropInstances = new CropInstanceRenderer();
  private readonly groundCover = new GroundCoverRenderer(CANONICAL_RENDER_CONFIG.qualityTier);
  private schoolEffects: Map<string, THREE.Group> = new Map();
  private environmentGroup: THREE.Group = new THREE.Group();
  private staticPrefabGroup: THREE.Group = new THREE.Group();
  private playerAnimation: AnimationController | null = null;
  private readonly farmingProps = new Map<string, THREE.Group>();
  private farmingPropsAttached = false;
  private cosmeticCropCarryUntilSeconds = 0;
  private readonly playerAnimationEvents: CharacterAnimationEvent[] = [];
  private latestPresentedPlayer: PresentedPlayerFrame | null = null;
  private lastPresentationTime = 0;
  private prefersReducedMotion: boolean = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  private skyMaterial: THREE.ShaderMaterial | null = null;
  private sunDisc: THREE.Sprite | null = null;
  private moonDisc: THREE.Sprite | null = null;
  private starField: THREE.Points | null = null;
  private readonly practicalLights: Array<{
    light: THREE.PointLight;
    maxIntensity: number;
    priority: number;
    qualityEnabled: boolean;
  }> = [];
  private playerContactShadow: THREE.Mesh | null = null;
  private windmillRotor: THREE.Group | null = null;
  private cloudMeshes: Array<{ object: THREE.Group; origin: THREE.Vector3 }> = [];
  private syncInFlight: boolean = false;
  private readonly wakeEmitState = new Map<string, { x: number; z: number; timeSeconds: number }>();
  private readonly rowboatPresentationRigs = new Map<string, RowboatPresentationRig>();
  private latestBoatPresentationInput: BoatPresentationInput | null = null;
  private terrainMesh: THREE.Mesh | null = null;
  private readonly raycaster = new THREE.Raycaster();
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
  private fishingBobberGroup: THREE.Group = new THREE.Group();
  private fishingLineMesh: THREE.Line | null = null;
  private fishingBobberRipple: THREE.Mesh | null = null;
  private readonly tempRodTipVec = new THREE.Vector3();
  private readonly npcPresentations = new Map<string, NpcPresentation>();
  private isFarmGisMode: boolean = false;

  public setFarmGisMode(active: boolean): void {
    this.isFarmGisMode = active;
  }

  public getFarmGisMode(): boolean {
    return this.isFarmGisMode;
  }

  constructor(canvas: HTMLCanvasElement) {

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

    // 3. Build World Geometry
    this.scene.add(this.environmentGroup);
    this.scene.add(this.cropInstances.group);
    this.environmentGroup.add(this.groundCover.group);
    this.environmentGroup.add(this.staticPrefabGroup);
    this.buildWorldTerrain();
    this.buildPlacementPreview();
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

    this.buildStarterFarmDetails();
    this.buildRouteDetails();
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
      const layout = createWorldEnvironmentLayout(worldSeed);
      this.readyPromise = this.populateEnvironment(layout);
    }
    return this.readyPromise;
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
    this.scene.add(new THREE.Mesh(skyGeometry, this.skyMaterial));
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
    const geometry = new THREE.CircleGeometry(1, 20);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({
      color: PALETTE_HEX.foliage_shadow_01,
      transparent: true,
      opacity: CANONICAL_RENDER_CONFIG.contact.opacity,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1
    });
    this.playerContactShadow = new THREE.Mesh(geometry, material);
    this.playerContactShadow.scale.set(
      CANONICAL_RENDER_CONFIG.contact.playerRadius,
      1,
      CANONICAL_RENDER_CONFIG.contact.playerRadius * 0.68
    );
    this.playerContactShadow.renderOrder = 1;
    this.scene.add(this.playerContactShadow);
  }

  /**
   * Generates continuous faceted low-poly terrain mesh with village, farmstead, riverbed, and coast.
   */
  private buildWorldTerrain(): void {
    const layoutGeometry = WorldLayout.buildTerrainGeometry();
    const layoutTerrain = new THREE.Mesh(
      layoutGeometry,
      PaletteMaterials.standard("grass_yellow_01", {
        vertexColors: true,
        vertexColorMode: "replace",
        flatShading: true,
        roughness: 0.92
      })
    );
    layoutTerrain.receiveShadow = true;
    layoutTerrain.name = "world_terrain";
    this.terrainMesh = layoutTerrain;
    this.environmentGroup.add(layoutTerrain);

    // High-resolution path ribbon overlay — paints the actual road colors at
    // 13-strip transverse resolution, far smoother than the ~2.3m terrain faces.
    const pathGeometry = WorldLayout.buildPathGeometry();
    const pathMaterial = PaletteMaterials.standard("path_dust_01", {
      vertexColors: true,
      vertexColorMode: "replace",
      flatShading: true,
      roughness: 0.95
    });
    // Depth-bias the ribbon slightly toward the camera to avoid z-fighting
    pathMaterial.polygonOffset = true;
    pathMaterial.polygonOffsetFactor = -1.5;
    pathMaterial.polygonOffsetUnits = -1.5;
    const pathMesh = new THREE.Mesh(pathGeometry, pathMaterial);
    pathMesh.name = "world_path_overlay";
    pathMesh.receiveShadow = true;
    this.environmentGroup.add(pathMesh);
  }

  private buildPlacementPreview(): void {
    const fill = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: PALETTE_HEX.accent_teal_01,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2
      })
    );
    fill.name = "crop_placement_fill";

    const outlineGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.5, 0, -0.5),
      new THREE.Vector3(0.5, 0, -0.5),
      new THREE.Vector3(0.5, 0, -0.5),
      new THREE.Vector3(0.5, 0, 0.5),
      new THREE.Vector3(0.5, 0, 0.5),
      new THREE.Vector3(-0.5, 0, 0.5),
      new THREE.Vector3(-0.5, 0, 0.5),
      new THREE.Vector3(-0.5, 0, -0.5)
    ]);
    const outline = new THREE.LineSegments(
      outlineGeometry,
      new THREE.LineBasicMaterial({ color: PALETTE_HEX.accent_teal_01, transparent: true, opacity: 0.95 })
    );
    outline.name = "crop_placement_outline";
    outline.position.y = 0.012;

    const check = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.24, 0.02, 0),
        new THREE.Vector3(-0.06, 0.02, 0.18),
        new THREE.Vector3(0.28, 0.02, -0.2)
      ]),
      new THREE.LineBasicMaterial({ color: PALETTE_HEX.foam_warm_01 })
    );
    check.name = "crop_placement_check";

    const cross = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.24, 0.02, -0.24),
        new THREE.Vector3(0.24, 0.02, 0.24),
        new THREE.Vector3(0.24, 0.02, -0.24),
        new THREE.Vector3(-0.24, 0.02, 0.24)
      ]),
      new THREE.LineBasicMaterial({ color: PALETTE_HEX.foam_warm_01 })
    );
    cross.name = "crop_placement_cross";

    this.placementPreview.add(fill, outline, check, cross);
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
    this.placementPreview.rotation.y = result.rotationRadians;
    this.placementPreview.scale.set(
      Math.max(0.05, result.footprint.width),
      1,
      Math.max(0.05, result.footprint.depth)
    );
    const color = result.valid ? PALETTE_HEX.accent_teal_01 : PALETTE_HEX.roof_terracotta_01;
    const fill = this.placementPreview.getObjectByName("crop_placement_fill") as THREE.Mesh;
    const outline = this.placementPreview.getObjectByName("crop_placement_outline") as THREE.LineSegments;
    (fill.material as THREE.MeshBasicMaterial).color.set(color);
    (outline.material as THREE.LineBasicMaterial).color.set(color);
    const check = this.placementPreview.getObjectByName("crop_placement_check");
    const cross = this.placementPreview.getObjectByName("crop_placement_cross");
    if (check) check.visible = result.valid;
    if (cross) cross.visible = !result.valid;
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
    return this.cropInstances.pick(camera, pointerNdc);
  }

  private buildStarterFarmDetails(): void {
    const plantableArea = STARTER_FARM_LAYOUT.plantableAreas[0];
    if (!plantableArea) return;
    this.environmentGroup.add(buildStarterFarmGround({
      origin: STARTER_FARM_LAYOUT.origin,
      plantableArea,
      heightAt: (worldX, worldZ) => WorldLayout.terrainHeight(worldX, worldZ)
    }));
  }

  private buildRouteDetails(): void {
    const stoneGeometries: THREE.BufferGeometry[] = [];
    const warmCobble = new THREE.Color(PALETTE_HEX.stone_warm_01);
    const goldenCobble = new THREE.Color(PALETTE_HEX.stone_golden_01);
    const coolStone = new THREE.Color(PALETTE_HEX.stone_cool_01);
    const mossStone = new THREE.Color(PALETTE_HEX.stone_moss_01);
    const darkRock = new THREE.Color(PALETTE_HEX.rock_coastal_dark_01);
    const up = new THREE.Vector3(0, 1, 0);

    // 1. Village Marketplace Plaza Embedded Cobblestones around [0, -5]
    const plazaCenter = { x: 0, z: -5 };
    const cobbleRings = [
      { radius: 1.8, count: 8, baseSize: 0.42 },
      { radius: 2.9, count: 12, baseSize: 0.45 },
      { radius: 4.1, count: 14, baseSize: 0.38 }
    ];

    for (const ring of cobbleRings) {
      for (let i = 0; i < ring.count; i++) {
        const angle = (i / ring.count) * Math.PI * 2 + (ring.radius * 1.3);
        const jitterR = ring.radius + Math.sin(i * 3.1 + ring.radius) * 0.22;
        const x = plazaCenter.x + Math.cos(angle) * jitterR;
        const z = plazaCenter.z + Math.sin(angle) * jitterR;
        const groundHeight = this.sampleTerrainHeight(x, z) ?? 2.05;
        const normal = WorldLayout.terrainNormal(x, z);

        const width = ring.baseSize * (0.85 + ((i * 3) % 4) * 0.08);
        const depth = ring.baseSize * (0.82 + ((i * 5) % 4) * 0.09);
        const height = 0.045;

        const stone = new THREE.DodecahedronGeometry(0.5, 0);
        stone.scale(width, height, depth);

        const alignQuat = new THREE.Quaternion().setFromUnitVectors(up, normal);
        const yawQuat = new THREE.Quaternion().setFromAxisAngle(normal, angle + i * 0.7);
        stone.applyQuaternion(yawQuat.multiply(alignQuat));
        stone.translate(x, groundHeight + height * 0.4, z);

        const baseColor = (i + Math.floor(ring.radius)) % 2 === 0 ? warmCobble : goldenCobble;
        const nonIndexed = stone.toNonIndexed();
        stone.dispose();
        const count = nonIndexed.getAttribute("position").count;
        const vColors = new Float32Array(count * 3);
        for (let v = 0; v < count; v += 3) {
          const facetVariation = 0.94 + (Math.sin(v * 2.1 + i) * 0.5 + 0.5) * 0.12;
          for (let k = 0; k < 3; k++) {
            vColors[(v + k) * 3] = baseColor.r * facetVariation;
            vColors[(v + k) * 3 + 1] = baseColor.g * facetVariation;
            vColors[(v + k) * 3 + 2] = baseColor.b * facetVariation;
          }
        }
        nonIndexed.setAttribute("color", new THREE.BufferAttribute(vColors, 3));
        stoneGeometries.push(nonIndexed);
      }
    }

    // 2. Embedded stepping stones along scenic trails and bridge approaches
    for (const [pathIndex, route] of WORLD_PATHS.entries()) {
      const routeDefinition = WORLD_ROUTES[pathIndex];
      const spacing = routeDefinition.kind === "trail" ? 5 : 8;

      for (let index = 2; index < route.length - 2; index++) {
        const isAnchor = (index + pathIndex * 3) % spacing === 0;
        if (!isAnchor) continue;

        const previous = route[index - 1];
        const next = route[index + 1];
        const routeAngle = Math.atan2(next.x - previous.x, next.z - previous.z);
        const side = (index + pathIndex) % 2 === 0 ? -1 : 1;
        const lateral = side * (routeDefinition.widthMeters * 0.38 + 0.28 + Math.sin(index * 1.91 + pathIndex) * 0.15);
        const x = route[index].x + Math.cos(routeAngle) * lateral;
        const z = route[index].z - Math.sin(routeAngle) * lateral;

        if (WorldLayout.isWater(x, z) || Math.hypot(x - plazaCenter.x, z - plazaCenter.z) < 5.0) {
          continue;
        }

        const baseColor =
          routeDefinition.id === "riverbank-trail" || routeDefinition.id === "orchard-path"
            ? (index % 3 === 0 ? mossStone : warmCobble)
            : routeDefinition.id === "cliffside-coastal-walk" || routeDefinition.id === "village-harbor"
              ? (index % 2 === 0 ? coolStone : darkRock)
              : (index % 2 === 0 ? warmCobble : goldenCobble);

        const groundHeight = this.sampleTerrainHeight(x, z) ?? 0.2;
        const normal = WorldLayout.terrainNormal(x, z);

        const width = 0.36 + ((index * 7) % 5) * 0.05;
        const height = 0.06 + ((index * 3) % 4) * 0.02;
        const depth = 0.28 + ((index * 11) % 4) * 0.05;

        const stone = new THREE.DodecahedronGeometry(0.5, 0);
        stone.scale(width, height, depth);

        const alignQuat = new THREE.Quaternion().setFromUnitVectors(up, normal);
        const yawQuat = new THREE.Quaternion().setFromAxisAngle(normal, routeAngle + Math.sin(index * 1.31) * 0.35);
        stone.applyQuaternion(yawQuat.multiply(alignQuat));
        stone.translate(x, groundHeight + height * 0.45, z);

        const nonIndexed = stone.toNonIndexed();
        stone.dispose();
        const count = nonIndexed.getAttribute("position").count;
        const vColors = new Float32Array(count * 3);
        for (let v = 0; v < count; v += 3) {
          const facetVariation = 0.93 + (Math.sin(v * 1.7 + index) * 0.5 + 0.5) * 0.12;
          for (let k = 0; k < 3; k++) {
            vColors[(v + k) * 3] = baseColor.r * facetVariation;
            vColors[(v + k) * 3 + 1] = baseColor.g * facetVariation;
            vColors[(v + k) * 3 + 2] = baseColor.b * facetVariation;
          }
        }
        nonIndexed.setAttribute("color", new THREE.BufferAttribute(vColors, 3));
        stoneGeometries.push(nonIndexed);
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

  private registerPracticalLight(
    root: THREE.Object3D,
    sourceNodeName: string,
    maxIntensity: number,
    distance: number,
    priority: number = 1
  ): void {
    root.updateMatrixWorld(true);
    const source = root.getObjectByName(sourceNodeName);
    if (!source) throw new Error(`[WorldScene] Missing practical-light source node ${sourceNodeName}`);
    const light = new THREE.PointLight(
      CANONICAL_RENDER_CONFIG.practicalLights.colorHex,
      0,
      distance,
      2
    );
    light.position.copy(source.getWorldPosition(new THREE.Vector3()));
    light.castShadow = false;
    this.scene.add(light);
    this.practicalLights.push({ light, maxIntensity, priority, qualityEnabled: true });
    this.applyPracticalLightBudget(this.qualityTier);
  }

  private applyPracticalLightBudget(tier: QualityTier): void {
    const budget = CANONICAL_RENDER_CONFIG.quality[tier].practicalLightBudget;
    const enabled = new Set(
      [...this.practicalLights]
        .sort((a, b) => a.priority - b.priority)
        .slice(0, budget)
    );
    for (const practical of this.practicalLights) practical.qualityEnabled = enabled.has(practical);
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
    const farmhouse = await AssetLoader.loadModel(ASSET_IDS.HOUSE_FARMHOUSE_A);
    this.placeLandmark(farmhouse, "farmhouse");
    this.environmentGroup.add(farmhouse);
    this.registerPracticalLight(
      farmhouse,
      "farmhouse_lantern_glow",
      CANONICAL_RENDER_CONFIG.practicalLights.localIntensity,
      CANONICAL_RENDER_CONFIG.practicalLights.localDistance
    );

    const well = await AssetLoader.loadModel(ASSET_IDS.PROP_WATER_WELL_A);
    this.placeLandmark(well, "well");
    this.environmentGroup.add(well);

    // 2. Stone Bridge crossing river
    const bridge = await AssetLoader.loadModel(ASSET_IDS.BRIDGE_STONE_A);
    this.placeLandmark(bridge, "bridge");
    this.environmentGroup.add(bridge);

    // 3. Harbor Dock extending into water
    const dock = await AssetLoader.loadModel(ASSET_IDS.DOCK_STRAIGHT_A);
    this.placeLandmark(dock, "dock");
    this.environmentGroup.add(dock);

    const fishMarket = await AssetLoader.loadModel(ASSET_IDS.BUILDING_FISH_MARKET_A);
    this.placeLandmark(fishMarket, "fish-market");
    this.environmentGroup.add(fishMarket);

    // Distant working landmarks establish the same farm-to-coast depth hierarchy
    // as the reference without copying its exact diorama layout.
    const lighthouse = await AssetLoader.loadModel(ASSET_IDS.BUILDING_LIGHTHOUSE_A);
    this.placeLandmark(lighthouse, "lighthouse");
    this.environmentGroup.add(lighthouse);
    this.registerPracticalLight(
      lighthouse,
      "lighthouse_lantern_beacon",
      CANONICAL_RENDER_CONFIG.practicalLights.lighthouseIntensity,
      CANONICAL_RENDER_CONFIG.practicalLights.lighthouseDistance,
      0
    );

    const windmill = await AssetLoader.loadModel(ASSET_IDS.BUILDING_WINDMILL_A);
    this.placeLandmark(windmill, "windmill");
    this.environmentGroup.add(windmill);
    this.configureWindmillRotor(windmill);

    const workbenchAnchor = starterStructureAnchor("struct.workbench")!;
    const workbench = await AssetLoader.loadModel(ASSET_IDS.PROP_FARM_WORKBENCH_A);
    workbench.position.set(
      workbenchAnchor.x,
      WorldLayout.terrainHeight(workbenchAnchor.x, workbenchAnchor.z),
      workbenchAnchor.z
    );
    workbench.rotation.y = workbenchAnchor.rotationY;
    this.environmentGroup.add(workbench);

    const compostAnchor = starterStructureAnchor("struct.starter_compost")!;
    const compost = await AssetLoader.loadModel(ASSET_IDS.PROP_WORM_COMPOST_A);
    compost.position.set(
      compostAnchor.x,
      WorldLayout.terrainHeight(compostAnchor.x, compostAnchor.z),
      compostAnchor.z
    );
    compost.rotation.y = compostAnchor.rotationY;
    this.environmentGroup.add(compost);

    const fishTable = await AssetLoader.loadModel(ASSET_IDS.PROP_FARM_WORKBENCH_A);
    fishTable.position.set(
      HARBOR_FISH_TABLE.position.x,
      WorldLayout.terrainHeight(HARBOR_FISH_TABLE.position.x, HARBOR_FISH_TABLE.position.z),
      HARBOR_FISH_TABLE.position.z
    );
    fishTable.rotation.y = HARBOR_FISH_TABLE.rotationY;
    this.environmentGroup.add(fishTable);

    const produceStall = await AssetLoader.loadModel(ASSET_IDS.PROP_PRODUCE_STALL_A);
    this.placeLandmark(produceStall, "produce-stall");
    this.environmentGroup.add(produceStall);

    const farmPropAssets = {
      "hay-bale": ASSET_IDS.PROP_HAY_BALE_A,
      "produce-crate": ASSET_IDS.PROP_PRODUCE_CRATE_A,
      "harvest-basket": ASSET_IDS.PROP_HARVEST_BASKET_A,
      "lamp-post": ASSET_IDS.PROP_LAMP_POST_A
    } as const;
    for (const anchor of STARTER_FARM_LAYOUT.propAnchors) {
      const object = await AssetLoader.loadModel(farmPropAssets[anchor.type]);
      const world = farmLocalToWorld(STARTER_FARM_LAYOUT.farmId, anchor);
      object.position.set(world.x, WorldLayout.terrainHeight(world.x, world.z), world.z);
      object.rotation.y = anchor.rotationY;
      object.scale.setScalar(anchor.scale);
      this.environmentGroup.add(object);
      if (anchor.type === "lamp-post") {
        this.registerPracticalLight(
          object,
          "lamp_post_glow",
          CANONICAL_RENDER_CONFIG.practicalLights.localIntensity,
          CANONICAL_RENDER_CONFIG.practicalLights.localDistance
        );
      }
    }

    // 4. Farmhouse Cozy Interior
    const interiorShell = await AssetLoader.loadModel(ASSET_IDS.INTERIOR_FARMHOUSE_SHELL);
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
      this.environmentGroup.add(propModel);

      if (propPlacement.assetId === ASSET_IDS.PROP_FIREPLACE_HEARTH_A) {
        this.registerPracticalLight(
          propModel,
          "hearth_fire_glow",
          CANONICAL_RENDER_CONFIG.practicalLights.localIntensity * 1.5,
          CANONICAL_RENDER_CONFIG.practicalLights.localDistance * 1.4
        );
      }
    }

    const groundingPatches: Array<{
      x: number;
      z: number;
      radiusX: number;
      radiusZ: number;
      rotation: number;
    }> = [];
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
      object.position.set(placement.x, WorldLayout.terrainHeight(placement.x, placement.z), placement.z);
      object.rotation.y = placement.rotationY;
      object.scale.set(placement.scale[0], placement.scale[1], placement.scale[2]);
      object.userData.environmentPlacementId = placement.id;
      object.userData.environmentPlacementOrigin = placement.origin;
      this.environmentGroup.add(object);
      if (placement.grounding) {
        groundingPatches.push({
          x: placement.x,
          z: placement.z,
          radiusX: placement.grounding[0],
          radiusZ: placement.grounding[1],
          rotation: placement.rotationY
        });
      }
      if (placement.practicalLight) {
        this.registerPracticalLight(
          object,
          "lamp_post_glow",
          CANONICAL_RENDER_CONFIG.practicalLights.localIntensity,
          CANONICAL_RENDER_CONFIG.practicalLights.localDistance
        );
      }
    }
    this.buildStaticGroundingPatches(groundingPatches);

    const cloudPlacements = [
      { pos: [-145, 46, -18], scale: 2.1 },
      { pos: [-72, 39, 94], scale: 1.8 },
      { pos: [12, 52, 126], scale: 2.5 },
      { pos: [86, 43, 38], scale: 1.9 },
      { pos: [154, 48, -62], scale: 2.2 }
    ];
    for (const placement of cloudPlacements) {
      const cloud = await AssetLoader.loadModel(ASSET_IDS.CLOUD_LOWPOLY_A);
      cloud.position.set(placement.pos[0], placement.pos[1], placement.pos[2]);
      cloud.scale.setScalar(placement.scale);
      cloud.userData.dynamicPresentation = true;
      this.setShadowPolicy(cloud, false);
      this.environmentGroup.add(cloud);
      this.cloudMeshes.push({ object: cloud, origin: cloud.position.clone() });
    }

    // 7. Fences framing the 8 x 8 planting area with authored entrances.
    for (const anchor of STARTER_FARM_LAYOUT.fenceAnchors) {
      const fence = await AssetLoader.loadModel(ASSET_IDS.PROP_FENCE_WOOD_A);
      const world = farmLocalToWorld(STARTER_FARM_LAYOUT.farmId, anchor);
      const height = this.sampleTerrainHeight(world.x, world.z) ?? 0.8;
      fence.position.set(world.x, height, world.z);
      fence.rotation.y = anchor.rotationY;
      this.environmentGroup.add(fence);
    }

    const staticAssetRoots = [...this.environmentGroup.children].filter(
      (child) => child !== this.staticPrefabGroup && !preexistingEnvironmentChildren.has(child)
    );
    this.staticCollisionProxyList = this.buildStaticCollisionProxies(staticAssetRoots);
    for (const root of staticAssetRoots) this.applyStaticShadowPolicy(root);
    const staticShadowProxy = this.buildStaticShadowProxy(staticAssetRoots);
    if (this.windmillRotor) this.batchCompatibleMeshes(this.windmillRotor, () => false);

    for (const child of [...this.environmentGroup.children]) {
      if (child !== this.staticPrefabGroup && !preexistingEnvironmentChildren.has(child)) {
        this.environmentGroup.remove(child);
        this.staticPrefabGroup.add(child);
      }
    }
    this.mergeStaticPrefabMeshes();
    if (staticShadowProxy) this.staticPrefabGroup.add(staticShadowProxy);
    await this.loadNpcPresentations();
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
        this.setShadowPolicy(model, true);

        // Ground contact shadow disc
        if (this.lightingRig.contactShadowsEnabled()) {
          const shadowGeo = new THREE.CircleGeometry(0.48, 16);
          shadowGeo.rotateX(-Math.PI / 2);
          const shadowMat = new THREE.MeshBasicMaterial({
            color: PALETTE_HEX.foliage_shadow_01,
            transparent: true,
            opacity: CANONICAL_RENDER_CONFIG.contact.opacity,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -1
          });
          const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
          shadowMesh.position.set(npc.anchor.x, y + 0.02, npc.anchor.z);
          shadowMesh.renderOrder = 1;
          this.environmentGroup.add(shadowMesh);
        }

        const mixer = new THREE.AnimationMixer(model);
        if (model.animations && model.animations.length > 0) {
          const idleClip = model.animations.find((a) => a.name === "idle") ?? model.animations[0];
          const action = mixer.clipAction(idleClip);
          action.play();
          action.time = (((Math.abs(npc.anchor.x) * 13 + Math.abs(npc.anchor.z) * 17) % 100) / 100) * idleClip.duration;
        }

        const headBone = model.getObjectByName("rig_head") ?? undefined;
        this.environmentGroup.add(model);
        this.npcPresentations.set(npc.id, {
          id: npc.id,
          assetId,
          anchor: npc.anchor,
          model,
          mixer,
          headBone,
          initialRotationY: npc.anchor.rotationY
        });
      } catch (err) {
        console.warn(`[WorldScene] Failed to load NPC ${npc.id} (${npc.assetId}):`, err);
      }
    }
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
    const isMinorFoliage = assetId === ASSET_IDS.FOLIAGE_BUSH_A || assetId === ASSET_IDS.FOLIAGE_REEDS_A;
    const withinVegetationShadowRange = Math.hypot(root.position.x, root.position.z) <=
      CANONICAL_RENDER_CONFIG.shadows.vegetationCastDistanceMeters;
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

  private buildStaticCollisionProxies(assetRoots: THREE.Object3D[]): StaticCollisionProxy[] {
    const proxies: StaticCollisionProxy[] = [];
    for (const [index, root] of assetRoots.entries()) {
      const assetId = root.userData.assetId as AssetId | undefined;
      if (!assetId) continue;
      const spec = ASSET_BY_ID.get(assetId);
      if (!spec || spec.collision === "none") continue;
      if (AssetLoader.collisionNodeNames(root).length === 0) {
        throw new Error(`[WorldScene] ${assetId} declares ${spec.collision} collision without a COL_* marker`);
      }
      proxies.push(...projectAssetCollision(assetId, root, `${assetId}:${index}`));
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
      let ancestor: THREE.Object3D | null = object.parent;
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
      if (object instanceof THREE.LOD) flattenedLods.push(object);
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
      const attributes = (Object.entries(object.geometry.attributes) as Array<
        [string, THREE.BufferAttribute]
      >)
        .map(([name, attribute]) =>
          `${name}:${attribute.itemSize}:${attribute.normalized}:${attribute.array.constructor.name}`
        )
        .sort()
        .join("|");
      const signature = `${object.material.uuid}|receive:${object.receiveShadow}|indexed:${Boolean(object.geometry.index)}|${attributes}`;
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
      batched.castShadow = sources.some(({ mesh }) => mesh.castShadow);
      batched.receiveShadow = sources[0]?.mesh.receiveShadow ?? true;
      root.add(batched);
    }
  }

  private updateStaticLodBatches(camera: THREE.Camera): void {
    const distanceScale = CANONICAL_RENDER_CONFIG.quality[this.qualityTier].lodDistanceScale;
    for (const instance of this.staticLodBatchInstances) {
      const distance = camera.position.distanceTo(instance.position);
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

  private batchPlayerRigidMeshes(root: THREE.Group): void {
    const animatedNames = new Set<string>();
    const clips = (root.userData.animationClips as THREE.AnimationClip[] | undefined) ?? [];
    for (const clip of clips) {
      for (const track of clip.tracks) animatedNames.add(track.name.split(".")[0] ?? track.name);
    }
    this.batchCompatibleMeshes(root, (object) => {
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
    for (const practical of this.practicalLights) {
      practical.light.intensity = practical.maxIntensity * frame.practicalLightIntensity;
      practical.light.visible = practical.qualityEnabled && frame.practicalLightIntensity > 0.002;
    }
    if (this.playerContactShadow) {
      (this.playerContactShadow.material as THREE.MeshBasicMaterial).opacity =
        CANONICAL_RENDER_CONFIG.contact.opacity * THREE.MathUtils.lerp(0.42, 1, frame.daylight);
    }
    this.water.updateLighting(frame);
    this.shoreFoam.updateLighting(frame);
    this.boatWakes.updateLighting(frame);
    this.updateAmbientMotion(state, timeSeconds);
  }

  private waterConditions(state: Readonly<GameState>): WaterConditions {
    return {
      seaRoughness: state.weather.seaRoughness,
      windDirectionDeg: state.weather.windDirectionDeg,
      windSpeed: state.weather.windSpeed
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
    if (phase === "cancelled") {
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
            : action === "processing-start"
              ? "scoop"
              : "basket";
      this.showFarmingProp(key);
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
      if (attachment.position) {
        object.position.set(...attachment.position);
      } else {
        object.position.set(0, 0, 0);
      }
      if (attachment.rotation) {
        object.rotation.set(...attachment.rotation);
      } else {
        object.rotation.set(0, 0, 0);
      }
      object.scale.setScalar(attachment.scale);
      object.userData.dynamicPresentation = true;
      this.setShadowPolicy(object, false);
      socket.add(object);
      this.farmingProps.set(attachment.key, object);
    }
    this.farmingPropsAttached = true;
  }

  private configureRowboatPresentation(boatId: string, boatRoot: THREE.Group): void {
    if (this.rowboatPresentationRigs.has(boatId)) return;
    const rowerSeat = boatRoot.getObjectByName("boat_rowboat_rower_seat");
    if (!rowerSeat) throw new Error("[WorldScene] Rowboat is missing boat_rowboat_rower_seat");
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
    const motionScale = this.prefersReducedMotion
      ? CANONICAL_RENDER_CONFIG.motion.reducedMotionScale
      : CANONICAL_RENDER_CONFIG.motion.ambientScale;
    if (this.windmillRotor) {
      const rotorSpeed = (0.18 + state.weather.windSpeed * 0.035) * motionScale;
      this.windmillRotor.rotation.z = -timeSeconds * rotorSpeed;
    }
    const windRadians = THREE.MathUtils.degToRad(state.weather.windDirectionDeg);
    const travel = ((timeSeconds * (0.12 + state.weather.windSpeed * 0.018)) % 150) - 75;
    for (const cloud of this.cloudMeshes) {
      cloud.object.position.set(
        cloud.origin.x + Math.sin(windRadians) * travel * motionScale,
        cloud.origin.y + Math.sin(timeSeconds * 0.08 + cloud.origin.x) * 0.32 * motionScale,
        cloud.origin.z + Math.cos(windRadians) * travel * motionScale
      );
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
    if (presentedPlayer) this.latestPresentedPlayer = presentedPlayer;
    this.latestBoatPresentationInput = boatPresentationInput;
    const playerPose = presentedPlayer ?? {
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

    const delta = this.lastPresentationTime > 0
      ? THREE.MathUtils.clamp(timeSeconds - this.lastPresentationTime, 0.001, 0.1)
      : 1 / 60;

    const waterConditions = this.waterConditions(state);
    this.water.update(timeSeconds, waterConditions);
    this.shoreFoam.update(timeSeconds, state.weather.seaRoughness);
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

    if (this.playerMesh) {
      const presentationMode = state.sportFishing

        ? "sport-fishing"
        : state.basicFishing
          ? "basic-fishing"
          : state.player.activeBoatId
            ? "boat-driving"
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
          carrying: Boolean(state.player.carriedFishCargoId) || timeSeconds < this.cosmeticCropCarryUntilSeconds,
          fishingInput: state.sportFishing
            ? {
                isReeling: state.sportFishing.isReeling,
                isSlacking: state.sportFishing.isSlacking,
                isBracing: state.sportFishing.isBracing
              }
            : undefined,
          boatInput: resolvedBoatInput
        },
        this.prefersReducedMotion
      ) ?? {
        bobY: 0,
        leanX: 0,
        leanZ: 0,
        clip: "idle" as const,
        events: []
      };
      this.playerAnimationEvents.push(...motion.events);
      this.updateFarmingProps(motion.clip, timeSeconds);
      const boatPresentation = activeBoat
        ? this.sampleBoatPresentation(activeBoat, state, timeSeconds)
        : null;
      const rowboatRig = activeBoat?.boatTypeId === "boat.rowboat"
        ? this.rowboatPresentationRigs.get(activeBoat.id)
        : undefined;
      if (rowboatRig) {
        const seatPosition = rowboatRig.rowerSeat.getWorldPosition(new THREE.Vector3());
        this.playerMesh.position.set(seatPosition.x, seatPosition.y + motion.bobY, seatPosition.z);
      } else {
        this.playerMesh.position.set(
          playerPose.x,
          playerPose.y - 0.5 + (boatPresentation?.waveHeight ?? 0) + motion.bobY,
          playerPose.z
        );
      }
      this.playerMesh.rotation.set(
        motion.leanX + (boatPresentation?.pitch ?? 0),
        playerPose.rotationY,
        motion.leanZ + (boatPresentation?.roll ?? 0),
        "YXZ"
      );
      this.playerMesh.updateMatrixWorld(true);
      const holdingOars = presentationMode === "boat-driving"
        && activeBoat?.boatTypeId === "boat.rowboat";
      this.syncRowboatOarOwnership(activeBoat?.id ?? null, holdingOars);
      if (holdingOars && activeBoat && motion.events.some((event) => event.name === "paddle_enter")) {
        this.spawnPaddleDisturbance(activeBoat, state, timeSeconds);
      }
      this.lastPresentationTime = timeSeconds;
      if (this.playerContactShadow) {
        this.playerContactShadow.visible = !state.player.activeBoatId;
        this.playerContactShadow.position.set(
          playerPose.x,
          WorldLayout.terrainHeight(playerPose.x, playerPose.z) + 0.025,
          playerPose.z
        );
      }
    }

    this.cropInstances.sync(state, timeSeconds);

    // Despawn school VFX whose school is gone
    for (const [schoolId, sGroup] of this.schoolEffects.entries()) {
      if (!state.world.activeSchools[schoolId]) {
        this.scene.remove(sGroup);
        this.schoolEffects.delete(schoolId);
      }
    }
    for (const [schoolId, school] of Object.entries(state.world.activeSchools)) {
      const sGroup = this.schoolEffects.get(schoolId);
      if (!sGroup) continue;
      sGroup.position.set(school.x, 0.05, school.z);
      sGroup.rotation.y = timeSeconds * 0.8;
      const pulseScale = 1.0 + Math.sin(timeSeconds * 3.0) * 0.15;
      sGroup.scale.set(pulseScale, 1.0, pulseScale);
      const fishModels = sGroup.userData.fishModels as THREE.Object3D[] | undefined;
      fishModels?.forEach((fish, index) => {
        const orbit = timeSeconds * (0.42 + index * 0.04) + index * (Math.PI * 2 / fishModels.length);
        const radius = 1.2 + index * 0.42;
        fish.position.set(Math.cos(orbit) * radius, -0.12 + Math.sin(timeSeconds * 1.8 + index) * 0.08, Math.sin(orbit) * radius);
        fish.rotation.y = -orbit + Math.PI * 0.5;
      });
    }

    // Update living NPC idle animations and proximity gaze tracking

    for (const npc of this.npcPresentations.values()) {
      npc.mixer.update(delta);
      if (npc.headBone) {
        const dx = playerPose.x - npc.anchor.x;
        const dz = playerPose.z - npc.anchor.z;
        const distSq = dx * dx + dz * dz;
        if (distSq < 20.0) {
          // Player within 4.5 meters; turn head toward player
          const targetAngle = Math.atan2(dx, dz);
          let angleDiff = targetAngle - npc.initialRotationY;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
          const clampedTurn = Math.max(-0.75, Math.min(0.75, angleDiff));
          npc.headBone.rotation.y = THREE.MathUtils.lerp(npc.headBone.rotation.y, clampedTurn, 0.08);
        } else {
          npc.headBone.rotation.y = THREE.MathUtils.lerp(npc.headBone.rotation.y, 0, 0.05);
        }
      }
    }

    this.updateFishingPresentation(state, playerPose, timeSeconds);
  }


  private buildFishingPresentation(): void {
    this.fishingBobberGroup = new THREE.Group();
    this.fishingBobberGroup.name = "fishing_bobber_rig";

    // Top half of bobber (faceted red)
    const topGeo = new THREE.CylinderGeometry(0.01, 0.08, 0.10, 6);
    topGeo.translate(0, 0.05, 0);
    const topMat = PaletteMaterials.standard("accent_red_01", { roughness: 0.5, flatShading: true });
    const topMesh = new THREE.Mesh(topGeo, topMat);
    topMesh.castShadow = true;
    this.fishingBobberGroup.add(topMesh);

    // Bottom half of bobber (faceted white/foam)
    const botGeo = new THREE.CylinderGeometry(0.08, 0.02, 0.09, 6);
    botGeo.translate(0, -0.045, 0);
    const botMat = PaletteMaterials.standard("foam_warm_01", { roughness: 0.6, flatShading: true });
    const botMesh = new THREE.Mesh(botGeo, botMat);
    botMesh.castShadow = true;
    this.fishingBobberGroup.add(botMesh);

    // Antenna tip
    const tipGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.06, 4);
    tipGeo.translate(0, 0.12, 0);
    const tipMat = PaletteMaterials.standard("metal_dark_01", { roughness: 0.4, flatShading: true });
    const tipMesh = new THREE.Mesh(tipGeo, tipMat);
    this.fishingBobberGroup.add(tipMesh);

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
      color: 0xf8fafc,
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
    const isBasicFishing = Boolean(state.basicFishing);
    const isSportFishing = Boolean(state.sportFishing);

    if (!isBasicFishing && !isSportFishing) {
      if (this.fishingBobberGroup) this.fishingBobberGroup.visible = false;
      if (this.fishingLineMesh) this.fishingLineMesh.visible = false;
      return;
    }

    const dist = isBasicFishing
      ? (state.basicFishing?.castDistanceMeters ?? 6.5)
      : 12.0;

    const angle = playerPose.rotationY;
    const bobberX = playerPose.x + Math.sin(angle) * dist;
    const bobberZ = playerPose.z + Math.cos(angle) * dist;

    const waterSample = this.water.sample(bobberX, bobberZ, timeSeconds);
    let bobberY = waterSample.height;


    const phase = state.basicFishing?.phase;

    // Bobbing animation based on phase
    if (phase === "bite-reaction" || (phase as string) === "bite") {
      // Rapid dip and splash on bite
      bobberY += -0.12 + Math.sin(timeSeconds * 25) * 0.05;
      if (this.fishingBobberRipple) {
        const pulse = 1.0 + Math.sin(timeSeconds * 20) * 0.4;
        this.fishingBobberRipple.scale.set(pulse, 1, pulse);
        (this.fishingBobberRipple.material as THREE.MeshStandardMaterial).opacity = 0.85;
      }
    } else if (phase === "charging-cast") {
      bobberY = playerPose.y + 0.8;
      if (this.fishingBobberRipple) {
        this.fishingBobberRipple.scale.set(0.1, 1, 0.1);
      }
    } else {
      // Gentle floating bob on waves
      bobberY += Math.sin(timeSeconds * 3.5) * 0.025;
      if (this.fishingBobberRipple) {
        const pulse = 0.9 + Math.sin(timeSeconds * 3) * 0.2;
        this.fishingBobberRipple.scale.set(pulse, 1, pulse);
        (this.fishingBobberRipple.material as THREE.MeshStandardMaterial).opacity = 0.5;
      }
    }

    this.fishingBobberGroup.position.set(bobberX, bobberY, bobberZ);
    this.fishingBobberGroup.visible = phase !== "charging-cast";

    // Update Fishing Line from Rod Tip to Bobber
    if (this.fishingLineMesh) {
      let rodTipX = playerPose.x + Math.sin(angle) * 1.6 + Math.cos(angle) * 0.3;
      let rodTipY = playerPose.y + 0.95;
      let rodTipZ = playerPose.z + Math.cos(angle) * 1.6 - Math.sin(angle) * 0.3;

      const rodProp = this.farmingProps.get("rod");
      if (rodProp && this.playerMesh) {
        this.playerMesh.updateMatrixWorld(true);
        const tipObj = rodProp.getObjectByName("rod_guide_tiptop") ?? rodProp.getObjectByName("rod_tiptop_sleeve");
        if (tipObj) {
          tipObj.getWorldPosition(this.tempRodTipVec);
          rodTipX = this.tempRodTipVec.x;
          rodTipY = this.tempRodTipVec.y;
          rodTipZ = this.tempRodTipVec.z;
        }
      }

      const positions = this.fishingLineMesh.geometry.attributes.position;
      const pointCount = 10;
      for (let i = 0; i <= pointCount; i++) {
        const t = i / pointCount;
        const x = THREE.MathUtils.lerp(rodTipX, bobberX, t);
        const z = THREE.MathUtils.lerp(rodTipZ, bobberZ, t);
        let y = THREE.MathUtils.lerp(rodTipY, bobberY + 0.12, t);

        const sag = Math.sin(t * Math.PI) * (phase === "minigame" ? 0.08 : 0.22);
        y -= sag;

        positions.setXYZ(i, x, y, z);
      }
      positions.needsUpdate = true;
      this.fishingLineMesh.visible = phase !== "charging-cast";
    }
  }

  private sampleBoatPresentation(
    boat: GameState["boats"][string],
    _state: Readonly<GameState>,
    timeSeconds: number
  ): { waveHeight: number; pitch: number; roll: number } {

    const water = this.water.sample(boat.x, boat.z, timeSeconds);
    const localNormal = water.normal
      .clone()
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), -boat.headingRadians);
    return {
      waveHeight: water.height,
      pitch: Math.atan2(localNormal.z, localNormal.y),
      roll: -Math.atan2(localNormal.x, localNormal.y)
    };
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

    if (!this.playerMesh) {
      const mesh = await AssetLoader.loadModel(ASSET_IDS.CHAR_PLAYER_A);
      if (!this.playerMesh) {
        this.setShadowPolicy(mesh, CANONICAL_RENDER_CONFIG.shadows.castPlayer);
        this.batchPlayerRigidMeshes(mesh);
        this.playerMesh = mesh;
        this.playerAnimation = new AnimationController(mesh);
        this.scene.add(this.playerMesh);
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
          if (boatState.boatTypeId === "boat.rowboat") {
            this.configureRowboatPresentation(boatId, bMesh);
          }
        }
      }
    }

    await this.cropInstances.ensureAssets(state);

    for (const [schoolId, school] of Object.entries(state.world.activeSchools)) {
      if (this.schoolEffects.has(schoolId)) continue;
      const sGroup = new THREE.Group();
      const ringGeo = new THREE.RingGeometry(1.5, 3.5, 8);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = PaletteMaterials.standard("foam_warm_01", { transparent: true, opacity: 0.65 });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      sGroup.add(ringMesh);
      const fishAssetId = fishSchoolAsset(school);
      if (fishAssetId) {
        const fishModels: THREE.Object3D[] = [];
        for (let index = 0; index < 3; index++) {
          const fish = await AssetLoader.loadModel(fishAssetId);
          fish.scale.setScalar(0.55);
          fish.userData.dynamicPresentation = true;
          this.setShadowPolicy(fish, false);
          sGroup.add(fish);
          fishModels.push(fish);
        }
        sGroup.userData.fishModels = fishModels;
      }
      this.scene.add(sGroup);
      this.schoolEffects.set(schoolId, sGroup);
      sGroup.position.set(school.x, 0.05, school.z);
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
    this.updateStaticLodBatches(camera);
    this.groundCover.update(camera);
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
    this.applyPracticalLightBudget(tier);
    this.groundCover.setQuality(tier);
    this.playerContactShadow?.removeFromParent();
    this.playerContactShadow?.geometry.dispose();
    (this.playerContactShadow?.material as THREE.Material | undefined)?.dispose();
    this.playerContactShadow = null;
    this.buildPlayerContactShadow();
    this.handleResize(window.innerWidth, window.innerHeight);
  }
}
