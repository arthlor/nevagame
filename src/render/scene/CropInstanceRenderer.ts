import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { ContentRegistry } from "../../content/ContentRegistry";
import type { CropStage, GameState, PlacedCropState } from "../../simulation/core/types";
import { cropMoistureBand } from "../../simulation/domains/FarmingDomain";
import { farmLocalToWorld } from "../../world/FarmLayout";
import { WorldLayout } from "../../world/WorldLayout";
import { ASSET_IDS, type AssetId } from "../assets/AssetCatalog";
import { AssetLoader } from "../loaders/AssetLoader";
import { PaletteMaterials } from "../materials/PaletteMaterials";
import { applyWorldAtmosphere } from "../atmosphere/AtmosphereMaterial";
import { PALETTE_HEX } from "../materials/PaletteTokens";
import type { WeatherMotionSignal } from "../motion/WeatherMotionSignal";

const MAX_CROP_INSTANCES = 160;
const TRANSITION_SECONDS = 0.28;
const HARVEST_CUT_SECONDS = 0.32;
const PLANTED_SETTLE_SECONDS = 0.28;
const MOUND_APEX_HEIGHT = 0.065;

export const WHEAT_STAGE_ASSET: Readonly<Record<CropStage, AssetId>> = {
  seeded: ASSET_IDS.CROP_WHEAT_SEEDED,
  sprout: ASSET_IDS.CROP_WHEAT_SPROUT,
  growing: ASSET_IDS.CROP_WHEAT_GROWING,
  mature: ASSET_IDS.CROP_WHEAT_MATURE,
  overripe: ASSET_IDS.CROP_WHEAT_OVERRIPE,
  withered: ASSET_IDS.CROP_WHEAT_WITHERED
};

export const TOMATO_STAGE_ASSET: Readonly<Record<CropStage, AssetId>> = {
  seeded: ASSET_IDS.CROP_TOMATO_SEEDED,
  sprout: ASSET_IDS.CROP_TOMATO_SPROUT,
  growing: ASSET_IDS.CROP_TOMATO_GROWING,
  mature: ASSET_IDS.CROP_TOMATO_MATURE,
  overripe: ASSET_IDS.CROP_TOMATO_OVERRIPE,
  withered: ASSET_IDS.CROP_TOMATO_WITHERED
};

export const POTATO_STAGE_ASSET: Readonly<Record<CropStage, AssetId>> = {
  seeded: ASSET_IDS.CROP_POTATO_SEEDED,
  sprout: ASSET_IDS.CROP_POTATO_SPROUT,
  growing: ASSET_IDS.CROP_POTATO_GROWING,
  mature: ASSET_IDS.CROP_POTATO_MATURE,
  overripe: ASSET_IDS.CROP_POTATO_OVERRIPE,
  withered: ASSET_IDS.CROP_POTATO_WITHERED
};

export const BARLEY_STAGE_ASSET: Readonly<Record<CropStage, AssetId>> = {
  seeded: ASSET_IDS.CROP_BARLEY_SEEDED,
  sprout: ASSET_IDS.CROP_BARLEY_SPROUT,
  growing: ASSET_IDS.CROP_BARLEY_GROWING,
  mature: ASSET_IDS.CROP_BARLEY_MATURE,
  overripe: ASSET_IDS.CROP_BARLEY_OVERRIPE,
  withered: ASSET_IDS.CROP_BARLEY_WITHERED
};

export const CORN_STAGE_ASSET: Readonly<Record<CropStage, AssetId>> = {
  seeded: ASSET_IDS.CROP_CORN_SEEDED,
  sprout: ASSET_IDS.CROP_CORN_SPROUT,
  growing: ASSET_IDS.CROP_CORN_GROWING,
  mature: ASSET_IDS.CROP_CORN_MATURE,
  overripe: ASSET_IDS.CROP_CORN_OVERRIPE,
  withered: ASSET_IDS.CROP_CORN_WITHERED
};

export const FLAX_STAGE_ASSET: Readonly<Record<CropStage, AssetId>> = {
  seeded: ASSET_IDS.CROP_FLAX_SEEDED,
  sprout: ASSET_IDS.CROP_FLAX_SPROUT,
  growing: ASSET_IDS.CROP_FLAX_GROWING,
  mature: ASSET_IDS.CROP_FLAX_MATURE,
  overripe: ASSET_IDS.CROP_FLAX_OVERRIPE,
  withered: ASSET_IDS.CROP_FLAX_WITHERED
};

export const CARROT_STAGE_ASSET: Readonly<Record<CropStage, AssetId>> = {
  seeded: ASSET_IDS.CROP_CARROT_SEEDED,
  sprout: ASSET_IDS.CROP_CARROT_SPROUT,
  growing: ASSET_IDS.CROP_CARROT_GROWING,
  mature: ASSET_IDS.CROP_CARROT_MATURE,
  overripe: ASSET_IDS.CROP_CARROT_OVERRIPE,
  withered: ASSET_IDS.CROP_CARROT_WITHERED
};

export const SUNFLOWER_STAGE_ASSET: Readonly<Record<CropStage, AssetId>> = {
  seeded: ASSET_IDS.CROP_SUNFLOWER_SEEDED,
  sprout: ASSET_IDS.CROP_SUNFLOWER_SPROUT,
  growing: ASSET_IDS.CROP_SUNFLOWER_GROWING,
  mature: ASSET_IDS.CROP_SUNFLOWER_MATURE,
  overripe: ASSET_IDS.CROP_SUNFLOWER_OVERRIPE,
  withered: ASSET_IDS.CROP_SUNFLOWER_WITHERED
};

export const OLIVE_TREE_STAGE_ASSET: Readonly<Record<CropStage, AssetId>> = {
  seeded: ASSET_IDS.CROP_OLIVE_TREE_SEEDED,
  sprout: ASSET_IDS.CROP_OLIVE_TREE_SPROUT,
  growing: ASSET_IDS.CROP_OLIVE_TREE_GROWING,
  mature: ASSET_IDS.CROP_OLIVE_TREE_MATURE,
  overripe: ASSET_IDS.CROP_OLIVE_TREE_OVERRIPE,
  withered: ASSET_IDS.CROP_OLIVE_TREE_WITHERED
};

const APPLE_TREE_STAGE_ASSET: Readonly<Record<CropStage, AssetId>> = {
  seeded: ASSET_IDS.CROP_APPLE_TREE_SEEDED,
  sprout: ASSET_IDS.CROP_APPLE_TREE_SPROUT,
  growing: ASSET_IDS.CROP_APPLE_TREE_GROWING,
  mature: ASSET_IDS.CROP_APPLE_TREE_MATURE,
  overripe: ASSET_IDS.CROP_APPLE_TREE_OVERRIPE,
  withered: ASSET_IDS.CROP_APPLE_TREE_WITHERED
};

/**
 * Every playable crop has a presentation binding with a dedicated 6-stage Blender family.
 */
export const CROP_STAGE_ASSETS: Readonly<Record<string, Readonly<Record<CropStage, AssetId>>>> = {
  "crop.wheat": WHEAT_STAGE_ASSET,
  "crop.tomato": TOMATO_STAGE_ASSET,
  "crop.potato": POTATO_STAGE_ASSET,
  "crop.barley": BARLEY_STAGE_ASSET,
  "crop.corn": CORN_STAGE_ASSET,
  "crop.carrot": CARROT_STAGE_ASSET,
  "crop.flax": FLAX_STAGE_ASSET,
  "crop.apple_tree": APPLE_TREE_STAGE_ASSET,
  "crop.sunflower": SUNFLOWER_STAGE_ASSET,
  "crop.olive_tree": OLIVE_TREE_STAGE_ASSET
};

export function cropStageAsset(cropId: string, stage: CropStage): AssetId | null {
  return CROP_STAGE_ASSETS[cropId]?.[stage] ?? null;
}

interface TemplateBatch {
  mesh: THREE.InstancedMesh;
  cropIds: string[];
  phaseAttribute?: THREE.InstancedBufferAttribute;
  windResponseAttribute?: THREE.InstancedBufferAttribute;
  highlightAttribute?: THREE.InstancedBufferAttribute;
}

interface CropTemplate {
  batches: TemplateBatch[];
}

interface CropTransition {
  from: CropStage;
  to: CropStage;
  startedAtSeconds: number;
}

interface RenderEntry {
  crop: PlacedCropState;
  weight: number;
  isIncoming: boolean;
  cutProgress?: number;
}

interface CropWindUniforms {
  uTime: { value: number };
  uWindDir: { value: THREE.Vector2 };
  uWindStrength: { value: number };
}

function patchCropWind(material: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  material.customProgramCacheKey = () => "neva-crop-instanced-wind-highlight-v2";
  material.onBeforeCompile = (shader) => {
    const uniforms: CropWindUniforms = {
      uTime: { value: 0 },
      uWindDir: { value: new THREE.Vector2(0.7, 0.7).normalize() },
      uWindStrength: { value: 0 }
    };
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute float instanceHighlight;
varying float vCropHighlight;
attribute float instanceWindPhase;
attribute float instanceWindResponse;
uniform float uTime;
uniform vec2 uWindDir;
uniform float uWindStrength;`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
{
  vCropHighlight = instanceHighlight;
  float rootedHeight = smoothstep(0.04, 0.86, max(position.y, 0.0));
  float wave = sin(uTime * (1.05 + instanceWindPhase * 0.09) + instanceWindPhase);
  float gust = sin(uTime * 0.41 + instanceWindPhase * 1.73);
  float bend = instanceWindResponse * uWindStrength * rootedHeight * (wave * 0.78 + gust * 0.22);
  vec2 windDirection = normalize(uWindDir + vec2(0.0001));
  transformed.xz += windDirection * bend;
}`
      );
    shader.fragmentShader = `varying float vCropHighlight;\n${shader.fragmentShader}`.replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vCropHighlight;");
    material.userData.nevaCropWindShader = shader;
  };
  applyWorldAtmosphere(material);
  return material;
}

const STAGE_RANGE: Record<CropStage, { start: number; end: number }> = {
  seeded: { start: 0, end: 0.1 },
  sprout: { start: 0.1, end: 0.35 },
  growing: { start: 0.35, end: 1 },
  mature: { start: 1, end: 1.3 },
  overripe: { start: 1.3, end: 1.6 },
  withered: { start: 1.6, end: 1.9 }
};

function hashUnit(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0x1_0000_0000;
}

function smoothstep(value: number): number {
  const clamped = THREE.MathUtils.clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

function makeOblongSoilMoundGeometry(): THREE.BufferGeometry {
  // Low-poly faceted oblong mound elongated along the furrow (Z axis)
  // with asymmetric facet breaks and integrated perimeter soil clods.
  const positions: number[] = [];

  const addTri = (
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number
  ) => {
    positions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
  };

  const addQuad = (
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    dx: number, dy: number, dz: number
  ) => {
    addTri(ax, ay, az, bx, by, bz, cx, cy, cz);
    addTri(ax, ay, az, cx, cy, cz, dx, dy, dz);
  };

  // Main mound vertices
  // Crest points along furrow (Z axis)
  const pApex: [number, number, number] = [0.00, 0.068, 0.00];
  const pNorthCrest: [number, number, number] = [-0.01, 0.060, 0.20];
  const pSouthCrest: [number, number, number] = [0.01, 0.058, -0.20];

  // Mid-crest shoulders (slight asymmetry)
  const pEastMid: [number, number, number] = [0.12, 0.048, 0.02];
  const pWestMid: [number, number, number] = [-0.13, 0.046, -0.02];
  const pNorthEastMid: [number, number, number] = [0.09, 0.044, 0.18];
  const pNorthWestMid: [number, number, number] = [-0.10, 0.042, 0.17];
  const pSouthEastMid: [number, number, number] = [0.10, 0.042, -0.17];
  const pSouthWestMid: [number, number, number] = [-0.09, 0.044, -0.18];

  // Base boundary vertices at ground level
  const bNorth: [number, number, number] = [0.01, 0.002, 0.38];
  const bNorthEast: [number, number, number] = [0.17, 0.002, 0.27];
  const bEast: [number, number, number] = [0.24, 0.002, 0.01];
  const bSouthEast: [number, number, number] = [0.18, 0.002, -0.27];
  const bSouth: [number, number, number] = [-0.01, 0.002, -0.38];
  const bSouthWest: [number, number, number] = [-0.18, 0.002, -0.26];
  const bWest: [number, number, number] = [-0.23, 0.002, -0.01];
  const bNorthWest: [number, number, number] = [-0.16, 0.002, 0.28];

  // Top spine quads / triangles:
  // Apex to north crest & shoulders
  addTri(pApex[0], pApex[1], pApex[2], pNorthEastMid[0], pNorthEastMid[1], pNorthEastMid[2], pNorthCrest[0], pNorthCrest[1], pNorthCrest[2]);
  addTri(pApex[0], pApex[1], pApex[2], pNorthCrest[0], pNorthCrest[1], pNorthCrest[2], pNorthWestMid[0], pNorthWestMid[1], pNorthWestMid[2]);
  // Apex to mid flanks
  addTri(pApex[0], pApex[1], pApex[2], pEastMid[0], pEastMid[1], pEastMid[2], pNorthEastMid[0], pNorthEastMid[1], pNorthEastMid[2]);
  addTri(pApex[0], pApex[1], pApex[2], pNorthWestMid[0], pNorthWestMid[1], pNorthWestMid[2], pWestMid[0], pWestMid[1], pWestMid[2]);
  // Apex to south crest & shoulders
  addTri(pApex[0], pApex[1], pApex[2], pSouthEastMid[0], pSouthEastMid[1], pSouthEastMid[2], pEastMid[0], pEastMid[1], pEastMid[2]);
  addTri(pApex[0], pApex[1], pApex[2], pWestMid[0], pWestMid[1], pWestMid[2], pSouthWestMid[0], pSouthWestMid[1], pSouthWestMid[2]);
  addTri(pApex[0], pApex[1], pApex[2], pSouthCrest[0], pSouthCrest[1], pSouthCrest[2], pSouthEastMid[0], pSouthEastMid[1], pSouthEastMid[2]);
  addTri(pApex[0], pApex[1], pApex[2], pSouthWestMid[0], pSouthWestMid[1], pSouthWestMid[2], pSouthCrest[0], pSouthCrest[1], pSouthCrest[2]);

  // North nose sloped faces
  addTri(pNorthCrest[0], pNorthCrest[1], pNorthCrest[2], bNorthEast[0], bNorthEast[1], bNorthEast[2], bNorth[0], bNorth[1], bNorth[2]);
  addTri(pNorthCrest[0], pNorthCrest[1], pNorthCrest[2], bNorth[0], bNorth[1], bNorth[2], bNorthWest[0], bNorthWest[1], bNorthWest[2]);
  addTri(pNorthCrest[0], pNorthCrest[1], pNorthCrest[2], pNorthEastMid[0], pNorthEastMid[1], pNorthEastMid[2], bNorthEast[0], bNorthEast[1], bNorthEast[2]);
  addTri(pNorthCrest[0], pNorthCrest[1], pNorthCrest[2], bNorthWest[0], bNorthWest[1], bNorthWest[2], pNorthWestMid[0], pNorthWestMid[1], pNorthWestMid[2]);

  // South nose sloped faces
  addTri(pSouthCrest[0], pSouthCrest[1], pSouthCrest[2], bSouth[0], bSouth[1], bSouth[2], bSouthEast[0], bSouthEast[1], bSouthEast[2]);
  addTri(pSouthCrest[0], pSouthCrest[1], pSouthCrest[2], bSouthWest[0], bSouthWest[1], bSouthWest[2], bSouth[0], bSouth[1], bSouth[2]);
  addTri(pSouthCrest[0], pSouthCrest[1], pSouthCrest[2], bSouthEast[0], bSouthEast[1], bSouthEast[2], pSouthEastMid[0], pSouthEastMid[1], pSouthEastMid[2]);
  addTri(pSouthCrest[0], pSouthCrest[1], pSouthCrest[2], pSouthWestMid[0], pSouthWestMid[1], pSouthWestMid[2], bSouthWest[0], bSouthWest[1], bSouthWest[2]);

  // East flank slopes
  addQuad(
    pNorthEastMid[0], pNorthEastMid[1], pNorthEastMid[2],
    pEastMid[0], pEastMid[1], pEastMid[2],
    bEast[0], bEast[1], bEast[2],
    bNorthEast[0], bNorthEast[1], bNorthEast[2]
  );
  addQuad(
    pEastMid[0], pEastMid[1], pEastMid[2],
    pSouthEastMid[0], pSouthEastMid[1], pSouthEastMid[2],
    bSouthEast[0], bSouthEast[1], bSouthEast[2],
    bEast[0], bEast[1], bEast[2]
  );

  // West flank slopes
  addQuad(
    pNorthWestMid[0], pNorthWestMid[1], pNorthWestMid[2],
    bNorthWest[0], bNorthWest[1], bNorthWest[2],
    bWest[0], bWest[1], bWest[2],
    pWestMid[0], pWestMid[1], pWestMid[2]
  );
  addQuad(
    pWestMid[0], pWestMid[1], pWestMid[2],
    bWest[0], bWest[1], bWest[2],
    bSouthWest[0], bSouthWest[1], bSouthWest[2],
    pSouthWestMid[0], pSouthWestMid[1], pSouthWestMid[2]
  );

  // Bottom face
  addTri(bNorth[0], 0, bNorth[2], bNorthEast[0], 0, bNorthEast[2], bNorthWest[0], 0, bNorthWest[2]);
  addTri(bNorthEast[0], 0, bNorthEast[2], bEast[0], 0, bEast[2], bNorthWest[0], 0, bNorthWest[2]);
  addTri(bEast[0], 0, bEast[2], bWest[0], 0, bWest[2], bNorthWest[0], 0, bNorthWest[2]);
  addTri(bEast[0], 0, bEast[2], bSouthEast[0], 0, bSouthEast[2], bWest[0], 0, bWest[2]);
  addTri(bSouthEast[0], 0, bSouthEast[2], bSouth[0], 0, bSouth[2], bWest[0], 0, bWest[2]);
  addTri(bSouth[0], 0, bSouth[2], bSouthWest[0], 0, bSouthWest[2], bWest[0], 0, bWest[2]);

  // Integrated small faceted clods on the perimeter / flanks
  const addClod = (cx: number, cy: number, cz: number, r: number, h: number) => {
    const tip: [number, number, number] = [cx + r * 0.1, cy + h, cz - r * 0.1];
    const c1: [number, number, number] = [cx - r, cy, cz - r * 0.7];
    const c2: [number, number, number] = [cx + r * 0.9, cy, cz - r * 0.5];
    const c3: [number, number, number] = [cx + r * 0.2, cy, cz + r];
    const c4: [number, number, number] = [cx - r * 0.8, cy, cz + r * 0.6];
    addTri(tip[0], tip[1], tip[2], c1[0], c1[1], c1[2], c2[0], c2[1], c2[2]);
    addTri(tip[0], tip[1], tip[2], c2[0], c2[1], c2[2], c3[0], c3[1], c3[2]);
    addTri(tip[0], tip[1], tip[2], c3[0], c3[1], c3[2], c4[0], c4[1], c4[2]);
    addTri(tip[0], tip[1], tip[2], c4[0], c4[1], c4[2], c1[0], c1[1], c1[2]);
  };

  addClod(0.18, 0.005, 0.20, 0.045, 0.032);
  addClod(-0.17, 0.005, -0.19, 0.042, 0.028);
  addClod(-0.16, 0.005, 0.14, 0.038, 0.024);
  addClod(0.19, 0.005, -0.12, 0.040, 0.026);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Presentation-only crop batching. Canonical IDs, stages, moisture and transforms
 * remain in simulation; instance data rebuilds only when that truth changes.
 */
export class CropInstanceRenderer {
  private disposed = false;
  public readonly group = new THREE.Group();
  private readonly templates = new Map<AssetId, CropTemplate>();
  private readonly loading = new Map<AssetId, Promise<void>>();
  private readonly lastStages = new Map<string, CropStage>();
  private readonly lastCrops = new Map<string, PlacedCropState>();
  private readonly transitions = new Map<string, CropTransition>();
  private readonly harvestTransitions = new Map<string, { crop: PlacedCropState; startedAtSeconds: number }>();
  private readonly plantedTransitions = new Map<string, number>();
  private initialSyncDone = false;
  private readonly moistureBatch: TemplateBatch;
  private readonly cropMaterial = patchCropWind(PaletteMaterials.standard("foliage_sage_01", {
    vertexColors: true,
    vertexColorMode: "replace",
    // The GLB normals retain both rounded anatomy and authored sharp edges.
    flatShading: false,
    roughness: 0.94
  }).clone());
  private cropSignature = Number.NaN;
  private highlightedId: string | null = null;
  private presentationTime = 0;
  private reducedFeedbackMotion = false;
  private readonly harvestPunches = new Map<string, number>();

  public setHighlight(id: string | null, reducedMotion: boolean): void {
    const resolved = id && this.lastCrops.has(id) ? id : null;
    if (resolved !== this.highlightedId) this.cropSignature = Number.NaN;
    this.highlightedId = resolved;
    this.reducedFeedbackMotion = reducedMotion;
  }

  public punchHarvest(id: string, timeSeconds: number): void {
    if (!this.reducedFeedbackMotion) this.harvestPunches.set(id, timeSeconds);
  }
  private templateRevision = 0;
  private renderedTemplateRevision = -1;
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly euler = new THREE.Euler(0, 0, 0, "YXZ");
  private readonly color = new THREE.Color();
  private readonly pickMatrix = new THREE.Matrix4();
  private readonly pickCenter = new THREE.Vector3();
  private readonly pickRaycaster = new THREE.Raycaster();
  private readonly pickPointer = new THREE.Vector2();
  private readonly pickMeshes: THREE.Object3D[] = [];
  private readonly pickHits: THREE.Intersection[] = [];

  public constructor() {
    this.group.name = "crop_instance_renderer";
    const moistureMaterial = PaletteMaterials.standard("soil_warm_01", {
      flatShading: true,
      roughness: 0.96
    });
    const moistureMesh = new THREE.InstancedMesh(
      makeOblongSoilMoundGeometry(),
      moistureMaterial,
      MAX_CROP_INSTANCES
    );
    moistureMesh.name = "crop_disturbed_soil_instances";
    moistureMesh.count = 0;
    moistureMesh.castShadow = true;
    moistureMesh.receiveShadow = true;
    moistureMesh.frustumCulled = false;
    this.moistureBatch = { mesh: moistureMesh, cropIds: [] };
    moistureMesh.userData.cropBatch = this.moistureBatch;
    this.pickMeshes.push(moistureMesh);
    this.group.add(moistureMesh);
  }

  public async ensureAssets(state: Readonly<GameState>): Promise<void> {
    const assetIds = new Set<AssetId>();
    for (const crop of Object.values(state.crops)) {
      const assetId = CROP_STAGE_ASSETS[crop.cropId]?.[crop.stage];
      if (assetId) assetIds.add(assetId);
    }
    await Promise.all([...assetIds].map((assetId) => this.ensureTemplate(assetId)));
  }

  private async ensureTemplate(assetId: AssetId): Promise<void> {
    if (this.templates.has(assetId)) return;
    const pending = this.loading.get(assetId);
    if (pending) return pending;
    const load = this.buildTemplate(assetId).finally(() => this.loading.delete(assetId));
    this.loading.set(assetId, load);
    return load;
  }

  private async buildTemplate(assetId: AssetId): Promise<void> {
    const root = await AssetLoader.loadModel(assetId);
    if (this.disposed) throw new DOMException("Crop renderer disposed", "AbortError");
    root.updateMatrixWorld(true);
    const inverseRoot = root.matrixWorld.clone().invert();
    const geometries: THREE.BufferGeometry[] = [];
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || !object.visible || Array.isArray(object.material)) return;
      if ((object as THREE.SkinnedMesh).isSkinnedMesh || object.name.startsWith("COL_")) return;
      let geometry = object.geometry.clone();
      geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverseRoot, object.matrixWorld));
      // Catalog crop materials are texture-free palette materials. Blender may
      // still emit optional UV attributes on only some primitives, which
      // prevents otherwise compatible geometry from merging into one batch.
      // Retain COLOR_0 because it carries the canonical semantic palette and
      // broad facet values, then normalize to a common non-indexed form.
      if (geometry.index) {
        const nonIndexed = geometry.toNonIndexed();
        geometry.dispose();
        geometry = nonIndexed;
      }
      for (const attribute of Object.keys(geometry.attributes)) {
        if (attribute !== "position" && attribute !== "normal" && attribute !== "color") {
          geometry.deleteAttribute(attribute);
        }
      }
      if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
      // Bake the catalog palette material into COLOR_0. This keeps the authored
      // red fruit, pale flowers, golden heads and foliage facets while allowing
      // each crop/stage to render as one instanced material batch.
      const sourceColor = geometry.getAttribute("color");
      const materialColor = object.material instanceof THREE.MeshStandardMaterial
        ? object.material.color
        : new THREE.Color(0xffffff);
      const vertexCount = geometry.getAttribute("position").count;
      const bakedColor = new Float32Array(vertexCount * 3);
      for (let index = 0; index < vertexCount; index++) {
        bakedColor[index * 3] = materialColor.r * (sourceColor?.getX(index) ?? 1);
        bakedColor[index * 3 + 1] = materialColor.g * (sourceColor?.getY(index) ?? 1);
        bakedColor[index * 3 + 2] = materialColor.b * (sourceColor?.getZ(index) ?? 1);
      }
      geometry.setAttribute("color", new THREE.BufferAttribute(bakedColor, 3));
      geometry.morphAttributes = {};
      geometries.push(geometry);
    });

    const batches: TemplateBatch[] = [];
    const merged = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false);
    if (!merged) throw new Error(`[CropInstanceRenderer] Could not merge palette geometry for ${assetId}`);
    const mesh = new THREE.InstancedMesh(merged, this.cropMaterial, MAX_CROP_INSTANCES);
    mesh.name = `${assetId}_instances`;
    mesh.count = 0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    const phaseAttribute = new THREE.InstancedBufferAttribute(new Float32Array(MAX_CROP_INSTANCES), 1);
    const windResponseAttribute = new THREE.InstancedBufferAttribute(new Float32Array(MAX_CROP_INSTANCES), 1);
    merged.setAttribute("instanceWindPhase", phaseAttribute);
    merged.setAttribute("instanceWindResponse", windResponseAttribute);
    const highlightAttribute = new THREE.InstancedBufferAttribute(new Float32Array(MAX_CROP_INSTANCES), 1);
    merged.setAttribute("instanceHighlight", highlightAttribute);
    const batch = { mesh, cropIds: [], phaseAttribute, windResponseAttribute, highlightAttribute };
    mesh.userData.cropBatch = batch;
    this.pickMeshes.push(mesh);
    batches.push(batch);
    this.group.add(mesh);
    for (const geometry of geometries) {
      if (geometry !== merged) geometry.dispose();
    }
    this.templates.set(assetId, { batches });
    this.templateRevision += 1;
  }

  public sync(
    state: Readonly<GameState>,
    timeSeconds: number,
    weatherMotion?: Readonly<WeatherMotionSignal>,
    isFarmGisMode: boolean = false
  ): void {
    this.presentationTime = timeSeconds;
    for (const [id, start] of this.harvestPunches) if (timeSeconds - start > 0.32) this.harvestPunches.delete(id);
    this.updateWind(timeSeconds, state, weatherMotion);
    const crops = Object.values(state.crops);

    if (!this.initialSyncDone) {
      this.initialSyncDone = true;
      for (const crop of crops) {
        this.lastStages.set(crop.id, crop.stage);
        this.lastCrops.set(crop.id, { ...crop });
      }
    } else {
      for (const crop of crops) {
        if (!this.lastCrops.has(crop.id) && !this.plantedTransitions.has(crop.id)) {
          this.plantedTransitions.set(crop.id, timeSeconds);
        }
      }
    }

    for (const [id, startedAt] of this.plantedTransitions) {
      if (timeSeconds - startedAt >= PLANTED_SETTLE_SECONDS) {
        this.plantedTransitions.delete(id);
      }
    }

    const signature = this.computeCropSignature(crops, isFarmGisMode);
    const animationActive =
      this.transitions.size > 0 ||
      this.harvestTransitions.size > 0 ||
      this.harvestPunches.size > 0 ||
      this.highlightedId !== null ||
      this.plantedTransitions.size > 0;
    if (
      signature === this.cropSignature
      && !animationActive
      && this.renderedTemplateRevision === this.templateRevision
    ) return;
    this.cropSignature = signature;
    this.renderedTemplateRevision = this.templateRevision;

    const entriesByAsset = new Map<AssetId, RenderEntry[]>();
    const activeIds = new Set(crops.map((crop) => crop.id));
    for (const id of [...this.lastStages.keys()]) {
      if (!activeIds.has(id)) {
        const previousCrop = this.lastCrops.get(id);
        if (previousCrop && CROP_STAGE_ASSETS[previousCrop.cropId]) {
          this.harvestTransitions.set(id, {
            crop: { ...previousCrop },
            startedAtSeconds: timeSeconds
          });
        }
        this.lastStages.delete(id);
        this.lastCrops.delete(id);
        this.transitions.delete(id);
      }
    }

    for (const crop of crops) {
      const previous = this.lastStages.get(crop.id);
      if (previous && previous !== crop.stage) {
        this.transitions.set(crop.id, { from: previous, to: crop.stage, startedAtSeconds: timeSeconds });
      }
      this.lastStages.set(crop.id, crop.stage);
      this.lastCrops.set(crop.id, { ...crop });
      const family = CROP_STAGE_ASSETS[crop.cropId];
      if (!family) continue;
      const transition = this.transitions.get(crop.id);
      if (transition) {
        const progress = smoothstep((timeSeconds - transition.startedAtSeconds) / TRANSITION_SECONDS);
        if (progress >= 1) {
          this.transitions.delete(crop.id);
        } else {
          const fromAsset = family[transition.from];
          const toAsset = family[transition.to];
          const outgoing = entriesByAsset.get(fromAsset) ?? [];
          outgoing.push({ crop, weight: 1 - progress, isIncoming: false });
          entriesByAsset.set(fromAsset, outgoing);
          const incoming = entriesByAsset.get(toAsset) ?? [];
          incoming.push({ crop, weight: progress, isIncoming: true });
          entriesByAsset.set(toAsset, incoming);
          continue;
        }
      }
      const assetId = family[crop.stage];
      const entries = entriesByAsset.get(assetId) ?? [];
      entries.push({ crop, weight: 1, isIncoming: true });
      entriesByAsset.set(assetId, entries);
    }

    for (const [cropId, transition] of this.harvestTransitions) {
      const progress = smoothstep((timeSeconds - transition.startedAtSeconds) / HARVEST_CUT_SECONDS);
      if (progress >= 1) {
        this.harvestTransitions.delete(cropId);
        continue;
      }
      const assetId = CROP_STAGE_ASSETS[transition.crop.cropId]?.[transition.crop.stage];
      if (!assetId) continue;
      const entries = entriesByAsset.get(assetId) ?? [];
      entries.push({
        crop: transition.crop,
        weight: 1 - progress,
        isIncoming: false,
        cutProgress: progress
      });
      entriesByAsset.set(assetId, entries);
    }

    for (const [assetId, template] of this.templates) {
      const entries = entriesByAsset.get(assetId) ?? [];
      for (const batch of template.batches) {
        this.updateBatch(batch, entries);
      }
    }
    this.updateMoistureBatch(crops, state, isFarmGisMode);
  }

  private updateWind(
    timeSeconds: number,
    state: Readonly<GameState>,
    weatherMotion?: Readonly<WeatherMotionSignal>
  ): void {
    const shader = this.cropMaterial.userData.nevaCropWindShader as
      { uniforms: CropWindUniforms } | undefined;
    if (!shader) return;
    shader.uniforms.uTime.value = timeSeconds;
    shader.uniforms.uWindDir.value.set(
      weatherMotion?.directionX ?? 0.7,
      weatherMotion?.directionZ ?? 0.7
    ).normalize();
    shader.uniforms.uWindStrength.value = weatherMotion
      ? 0.5 + weatherMotion.normalizedStrength * 1.05 + weatherMotion.gust * 0.08
      : Math.min(1.6, 0.55 + state.weather.windSpeed * 0.12);
  }

  private computeCropSignature(crops: readonly PlacedCropState[], isFarmGisMode: boolean = false): number {
    let hash = (crops.length ^ (isFarmGisMode ? 0x5a5a5a5a : 0x811c9dc5)) >>> 0;
    for (const crop of crops) {
      const values = `${crop.id}|${crop.cropId}|${crop.stage}|${crop.farmId}|${crop.x}|${crop.z}|${crop.rotationRadians}|${crop.effectiveGrowthMinutes}|${cropMoistureBand(crop.moisture)}`;
      for (let index = 0; index < values.length; index += 1) {
        hash ^= values.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
      }
    }
    return hash >>> 0;
  }

  private updateBatch(
    batch: TemplateBatch,
    entries: readonly RenderEntry[]
  ): void {
    this.ensureBatchCapacity(batch, entries.length, `${batch.mesh.name}_dynamic`);
    batch.cropIds.length = 0;
    const count = entries.length;
    for (let index = 0; index < count; index++) {
      const entry = entries[index];
      const crop = entry.crop;
      const cropDef = ContentRegistry.crops.get(crop.cropId)!;
      const world = farmLocalToWorld(crop.farmId, crop);
      const growth = crop.effectiveGrowthMinutes / Math.max(1, cropDef.baseGrowthMinutes);
      const range = STAGE_RANGE[crop.stage];
      const withinStage = THREE.MathUtils.clamp((growth - range.start) / Math.max(0.001, range.end - range.start), 0, 1);
      const variation = 0.93 + hashUnit(`${crop.id}:scale`) * 0.14;
      const continuousScale = variation * THREE.MathUtils.lerp(0.94, 1.04, withinStage);
      const transitionScale = entry.isIncoming
        ? THREE.MathUtils.lerp(0.82, 1, entry.weight)
        : THREE.MathUtils.lerp(0.82, 1, entry.weight);
      const windResponse = crop.stage === "seeded" ? 0 : crop.stage === "sprout" ? 0.015 : 0.035;

      const plantedStart = this.plantedTransitions.get(crop.id);
      let plantedElevation = 1;
      let plantedScaleX = 1;
      let plantedScaleY = 1;
      if (plantedStart !== undefined) {
        const progress = THREE.MathUtils.clamp(
          (this.presentationTime - plantedStart) / PLANTED_SETTLE_SECONDS,
          0,
          1
        );
        const bounce = Math.sin(progress * Math.PI);
        plantedElevation = Math.min(1, progress * 1.35) + bounce * 0.15;
        plantedScaleY = Math.min(1, progress * 1.3) + bounce * 0.22;
        plantedScaleX = 1 - bounce * 0.10;
      }

      const cut = entry.cutProgress ?? 0;
      const elevationScale = entry.cutProgress != null ? Math.max(0, 1 - smoothstep(cut)) : plantedElevation;
      const cropElevation = MOUND_APEX_HEIGHT * elevationScale;
      this.position.set(world.x, WorldLayout.terrainHeight(world.x, world.z) + cropElevation, world.z);

      const cutLean = smoothstep(cut) * (0.82 + hashUnit(`${crop.id}:cut`) * 0.24);
      this.euler.set(
        cutLean,
        crop.rotationRadians,
        cutLean * 0.28,
        "YXZ"
      );
      this.quaternion.setFromEuler(this.euler);
      const seededBoost = crop.stage === "seeded" ? 1.95 : 1.0;
      this.scale.set(
        continuousScale * transitionScale * seededBoost * plantedScaleX,
        continuousScale * THREE.MathUtils.lerp(0.96, 1.05, withinStage) * transitionScale *
          THREE.MathUtils.lerp(1, 0.24, smoothstep(cut)) * seededBoost * plantedScaleY,
        continuousScale * transitionScale * seededBoost * plantedScaleX
      );
      const selected = crop.id === this.highlightedId;
      const breathe = this.reducedFeedbackMotion ? 0 : Math.sin(this.presentationTime * 3);
      const punchStart = this.harvestPunches.get(crop.id);
      const punch = punchStart === undefined ? 0 : Math.sin(Math.PI * Math.min(1, (this.presentationTime - punchStart) / 0.32)) * 0.14;
      this.scale.multiplyScalar(1 + punch + (selected && !this.reducedFeedbackMotion ? 0.015 * (1 + breathe) : 0));
      batch.highlightAttribute?.setX(index, selected ? 0.13 + breathe * 0.035 : 0);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      batch.mesh.setMatrixAt(index, this.matrix);
      this.instanceTint(crop, entry.weight, this.color);
      batch.mesh.setColorAt(index, this.color);
      batch.phaseAttribute?.setX(index, hashUnit(`${crop.id}:wind`) * Math.PI * 2);
      batch.windResponseAttribute?.setX(index, windResponse);
      batch.cropIds.push(entry.cutProgress == null ? crop.id : "");
    }
    batch.mesh.count = count;
    batch.mesh.instanceMatrix.needsUpdate = count > 0;
    if (batch.mesh.instanceColor) batch.mesh.instanceColor.needsUpdate = count > 0;
    if (batch.phaseAttribute) batch.phaseAttribute.needsUpdate = count > 0;
    if (batch.windResponseAttribute) batch.windResponseAttribute.needsUpdate = count > 0;
    if (batch.highlightAttribute) batch.highlightAttribute.needsUpdate = count > 0;
  }

  private instanceTint(crop: PlacedCropState, transitionWeight: number, target: THREE.Color): void {
    const band = cropMoistureBand(crop.moisture);
    if (band === "dry") target.setRGB(1, 0.86, 0.7);
    else if (band === "wet") target.setRGB(0.82, 0.93, 1);
    else target.setRGB(1, 1, 1);
    if (crop.stage === "overripe") target.multiply(new THREE.Color(1, 0.88, 0.72));
    if (crop.stage === "withered") target.multiply(new THREE.Color(0.72, 0.63, 0.52));
    target.multiplyScalar(THREE.MathUtils.lerp(0.62, 1, transitionWeight));
  }

  private updateMoistureBatch(
    crops: readonly PlacedCropState[],
    state?: Readonly<GameState>,
    isFarmGisMode: boolean = false
  ): void {
    const batch = this.moistureBatch;
    const activeCount = crops.length;
    const harvestCount = this.harvestTransitions.size;
    const totalCount = activeCount + harvestCount;
    this.ensureBatchCapacity(batch, totalCount, "crop_disturbed_soil_instances_dynamic");
    batch.cropIds.length = 0;

    let index = 0;

    // 1. Render active crop mounds
    for (let i = 0; i < activeCount; i++) {
      const crop = crops[i];
      const definition = ContentRegistry.crops.get(crop.cropId);
      if (!definition) continue;
      const world = farmLocalToWorld(crop.farmId, crop);
      const variation = 0.88 + hashUnit(`${crop.id}:soil`) * 0.16;

      const plantedStart = this.plantedTransitions.get(crop.id);
      let scaleY = 1;
      let scaleXZ = 1;
      if (plantedStart !== undefined) {
        const progress = THREE.MathUtils.clamp(
          (this.presentationTime - plantedStart) / PLANTED_SETTLE_SECONDS,
          0,
          1
        );
        const bounce = Math.sin(progress * Math.PI);
        scaleY = Math.min(1, progress * 1.3) + bounce * 0.25;
        scaleXZ = 1 - bounce * 0.12;
      }

      this.position.set(world.x, WorldLayout.terrainHeight(world.x, world.z), world.z);
      // Furrow-aligned oblong mound: subtle organic variation around furrow Z axis
      const furrowJitter = (hashUnit(`${crop.id}:rot`) - 0.5) * 0.08;
      this.quaternion.setFromEuler(this.euler.set(0, furrowJitter, 0));
      this.scale.set(
        definition.footprint.width * variation * scaleXZ,
        scaleY,
        definition.footprint.depth * variation * scaleXZ
      );
      this.matrix.compose(this.position, this.quaternion, this.scale);
      batch.mesh.setMatrixAt(index, this.matrix);

      const band = cropMoistureBand(crop.moisture);
      if (isFarmGisMode) {
        const farm = state?.farms[crop.farmId];
        const fertility = farm?.soil.fertility ?? 50;
        // GIS moisture base
        const moistureHex =
          band === "wet"
            ? PALETTE_HEX.accent_teal_01
            : band === "dry"
              ? PALETTE_HEX.accent_ochre_01
              : PALETTE_HEX.foliage_sage_01;
        this.color.set(moistureHex);
        // Modulate with fertility
        if (fertility >= 80) {
          this.color.lerp(new THREE.Color(PALETTE_HEX.stone_golden_01), 0.35);
        } else if (fertility < 30) {
          this.color.lerp(new THREE.Color(PALETTE_HEX.stone_cool_01), 0.45);
        }
      } else {
        this.color.set(
          PALETTE_HEX[band === "wet" ? "soil_damp_01" : band === "dry" ? "soil_dry_01" : "soil_warm_01"]
        );
      }
      batch.mesh.setColorAt(index, this.color);
      batch.cropIds.push(crop.id);
      index++;
    }

    // 2. Render mounds sinking during harvest cut
    for (const [, transition] of this.harvestTransitions) {
      const crop = transition.crop;
      const definition = ContentRegistry.crops.get(crop.cropId);
      if (!definition) continue;
      const world = farmLocalToWorld(crop.farmId, crop);
      const variation = 0.88 + hashUnit(`${crop.id}:soil`) * 0.16;
      const harvestProgress = THREE.MathUtils.clamp(
        (this.presentationTime - transition.startedAtSeconds) / HARVEST_CUT_SECONDS,
        0,
        1
      );
      const sinkScaleY = Math.max(0.001, 1 - smoothstep(harvestProgress));

      this.position.set(world.x, WorldLayout.terrainHeight(world.x, world.z), world.z);
      const furrowJitter = (hashUnit(`${crop.id}:rot`) - 0.5) * 0.08;
      this.quaternion.setFromEuler(this.euler.set(0, furrowJitter, 0));
      this.scale.set(
        definition.footprint.width * variation,
        sinkScaleY,
        definition.footprint.depth * variation
      );
      this.matrix.compose(this.position, this.quaternion, this.scale);
      batch.mesh.setMatrixAt(index, this.matrix);

      const band = cropMoistureBand(crop.moisture);
      if (isFarmGisMode) {
        this.color.set(PALETTE_HEX.accent_ochre_01);
      } else {
        this.color.set(
          PALETTE_HEX[band === "wet" ? "soil_damp_01" : band === "dry" ? "soil_dry_01" : "soil_warm_01"]
        );
      }
      batch.mesh.setColorAt(index, this.color);
      batch.cropIds.push(""); // non-pickable during cut
      index++;
    }

    batch.mesh.count = index;
    batch.mesh.instanceMatrix.needsUpdate = index > 0;
    if (batch.mesh.instanceColor) batch.mesh.instanceColor.needsUpdate = index > 0;
  }

  private ensureBatchCapacity(batch: TemplateBatch, required: number, name: string): void {
    const currentCapacity = batch.mesh.instanceMatrix.count;
    if (required <= currentCapacity) return;

    const previous = batch.mesh;
    const capacity = Math.max(required, currentCapacity * 2, MAX_CROP_INSTANCES);
    const replacement = new THREE.InstancedMesh(previous.geometry, previous.material, capacity);
    replacement.name = name;
    replacement.count = 0;
    replacement.castShadow = previous.castShadow;
    replacement.receiveShadow = previous.receiveShadow;
    replacement.frustumCulled = previous.frustumCulled;
    this.group.remove(previous);
    this.group.add(replacement);
    batch.mesh = replacement;
    replacement.userData.cropBatch = batch;
    const pickIndex = this.pickMeshes.indexOf(previous);
    if (pickIndex >= 0) this.pickMeshes[pickIndex] = replacement;
    if (batch.highlightAttribute) {
      batch.highlightAttribute = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
      previous.geometry.setAttribute("instanceHighlight", batch.highlightAttribute);
    }
    if (batch.phaseAttribute) {
      batch.phaseAttribute = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
      previous.geometry.setAttribute("instanceWindPhase", batch.phaseAttribute);
    }
    if (batch.windResponseAttribute) {
      batch.windResponseAttribute = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
      previous.geometry.setAttribute("instanceWindResponse", batch.windResponseAttribute);
    }
  }

  public pick(camera: THREE.Camera, pointerNdc: { x: number; y: number }): string | null {
    this.pickRaycaster.setFromCamera(this.pickPointer.set(pointerNdc.x, pointerNdc.y), camera);
    this.pickHits.length = 0;
    this.pickRaycaster.intersectObjects(this.pickMeshes, false, this.pickHits);
    for (const hit of this.pickHits) {
      if (hit.instanceId == null) continue;
      const batch = hit.object.userData.cropBatch as TemplateBatch | undefined;
      const cropId = batch?.cropIds[hit.instanceId];
      if (cropId) return cropId;
    }
    return null;
  }

  /**
   * Resolves a cursor against the authored ground footprint as well as the
   * crop mesh. Seeded and early-stage crops can be smaller than a practical
   * gameplay cursor, so mesh-only raycasts may select a neighboring instance
   * even when the pointer is visibly over this crop's soil.
   */
  public pickByGroundPoint(
    groundPoint: { x: number; z: number },
    maxDistanceMeters: number = 0.72
  ): string | null {
    const batch = this.moistureBatch;
    let nearestId: string | null = null;
    let nearestDistance = maxDistanceMeters;
    for (let index = 0; index < batch.mesh.count; index++) {
      const cropId = batch.cropIds[index];
      if (!cropId) continue;
      batch.mesh.getMatrixAt(index, this.pickMatrix);
      this.pickCenter.setFromMatrixPosition(this.pickMatrix).applyMatrix4(batch.mesh.matrixWorld);
      const distance = Math.hypot(this.pickCenter.x - groundPoint.x, this.pickCenter.z - groundPoint.z);
      if (distance <= nearestDistance) {
        nearestDistance = distance;
        nearestId = cropId;
      }
    }
    return nearestId;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const template of this.templates.values()) {
      for (const batch of template.batches) {
        batch.mesh.removeFromParent();
        batch.mesh.geometry.dispose();
      }
    }
    this.templates.clear();
    this.loading.clear();
    this.pickMeshes.length = 0;
    this.pickHits.length = 0;
    this.moistureBatch.mesh.removeFromParent();
    this.moistureBatch.mesh.geometry.dispose();
    this.cropMaterial.dispose();
  }
}
