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
import { PALETTE_HEX } from "../materials/PaletteTokens";
import type { WeatherMotionSignal } from "../motion/WeatherMotionSignal";

const MAX_CROP_INSTANCES = 160;
const TRANSITION_SECONDS = 0.28;
const HARVEST_CUT_SECONDS = 0.32;

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

const APPLE_TREE_STAGE_ASSET: Readonly<Record<CropStage, AssetId>> = {
  seeded: WHEAT_STAGE_ASSET.seeded,
  sprout: WHEAT_STAGE_ASSET.sprout,
  growing: WHEAT_STAGE_ASSET.growing,
  mature: ASSET_IDS.TREE_APPLE_A,
  overripe: ASSET_IDS.TREE_APPLE_A,
  withered: WHEAT_STAGE_ASSET.withered
};

/**
 * Every playable crop has a presentation binding. Wheat, tomato, and potato
 * have dedicated Blender stage families. Barley, corn, and flax reuse the
 * wheat meshes and carrot reuses potato until those generators exist — these
 * are silhouette stand-ins, not distinct crop models. Apple uses the wheat
 * early stages plus the apple-tree mesh at mature/overripe.
 */
export const CROP_STAGE_ASSETS: Readonly<Record<string, Readonly<Record<CropStage, AssetId>>>> = {
  "crop.wheat": WHEAT_STAGE_ASSET,
  "crop.tomato": TOMATO_STAGE_ASSET,
  "crop.potato": POTATO_STAGE_ASSET,
  "crop.barley": WHEAT_STAGE_ASSET,
  "crop.corn": WHEAT_STAGE_ASSET,
  "crop.carrot": POTATO_STAGE_ASSET,
  "crop.flax": WHEAT_STAGE_ASSET,
  "crop.apple_tree": APPLE_TREE_STAGE_ASSET
};

export function cropStageAsset(cropId: string, stage: CropStage): AssetId | null {
  return CROP_STAGE_ASSETS[cropId]?.[stage] ?? null;
}

interface TemplateBatch {
  mesh: THREE.InstancedMesh;
  cropIds: string[];
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

function makeDisturbedSoilGeometry(): THREE.BufferGeometry {
  const points = [
    [-0.5, -0.08],
    [-0.33, -0.45],
    [0.08, -0.5],
    [0.46, -0.31],
    [0.5, 0.12],
    [0.28, 0.47],
    [-0.14, 0.5],
    [-0.48, 0.27]
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const geometry = new THREE.ShapeGeometry(new THREE.Shape(points));
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

/**
 * Presentation-only crop batching. Canonical IDs, stages, moisture and transforms
 * remain in simulation; instance indices are rebuilt from that truth every frame.
 */
export class CropInstanceRenderer {
  public readonly group = new THREE.Group();
  private readonly templates = new Map<AssetId, CropTemplate>();
  private readonly loading = new Map<AssetId, Promise<void>>();
  private readonly lastStages = new Map<string, CropStage>();
  private readonly lastCrops = new Map<string, PlacedCropState>();
  private readonly transitions = new Map<string, CropTransition>();
  private readonly harvestTransitions = new Map<string, { crop: PlacedCropState; startedAtSeconds: number }>();
  private readonly moistureBatch: TemplateBatch;
  private readonly cropMaterial = PaletteMaterials.standard("foliage_sage_01", {
    vertexColors: true,
    vertexColorMode: "replace",
    flatShading: true,
    roughness: 0.94
  });
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly euler = new THREE.Euler(0, 0, 0, "YXZ");
  private readonly color = new THREE.Color();

  public constructor() {
    this.group.name = "crop_instance_renderer";
    const moistureMaterial = PaletteMaterials.standard("soil_dry_01", {
      flatShading: true,
      roughness: 1,
      transparent: true,
      opacity: 0.82
    });
    const moistureMesh = new THREE.InstancedMesh(
      makeDisturbedSoilGeometry(),
      moistureMaterial,
      MAX_CROP_INSTANCES
    );
    moistureMesh.name = "crop_disturbed_soil_instances";
    moistureMesh.count = 0;
    moistureMesh.receiveShadow = true;
    moistureMesh.frustumCulled = false;
    this.moistureBatch = { mesh: moistureMesh, cropIds: [] };
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
    const batch = { mesh, cropIds: [] };
    batches.push(batch);
    this.group.add(mesh);
    for (const geometry of geometries) {
      if (geometry !== merged) geometry.dispose();
    }
    this.templates.set(assetId, { batches });
  }

  public sync(
    state: Readonly<GameState>,
    timeSeconds: number,
    weatherMotion?: Readonly<WeatherMotionSignal>
  ): void {
    const entriesByAsset = new Map<AssetId, RenderEntry[]>();
    const activeIds = new Set(Object.keys(state.crops));
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

    for (const crop of Object.values(state.crops)) {
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
        this.updateBatch(batch, entries, state, timeSeconds, weatherMotion);
      }
    }
    this.updateMoistureBatch(Object.values(state.crops));
  }

  private updateBatch(
    batch: TemplateBatch,
    entries: readonly RenderEntry[],
    state: Readonly<GameState>,
    timeSeconds: number,
    weatherMotion?: Readonly<WeatherMotionSignal>
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
      const phase = hashUnit(`${crop.id}:wind`) * Math.PI * 2;
      const windStrength = weatherMotion
        ? 0.5 + weatherMotion.normalizedStrength * 1.05 + weatherMotion.gust * 0.08
        : Math.min(1.6, 0.55 + state.weather.windSpeed * 0.12);
      const sway = Math.sin(timeSeconds * (1.05 + hashUnit(`${crop.id}:rate`) * 0.45) + phase) *
        windResponse * windStrength;
      const windX = weatherMotion?.directionX ?? 0.7;
      const windZ = weatherMotion?.directionZ ?? 0.7;
      this.position.set(world.x, WorldLayout.terrainHeight(world.x, world.z), world.z);
      const cut = entry.cutProgress ?? 0;
      const cutLean = smoothstep(cut) * (0.82 + hashUnit(`${crop.id}:cut`) * 0.24);
      this.euler.set(
        sway * windZ + cutLean,
        crop.rotationRadians,
        sway * windX + cutLean * 0.28,
        "YXZ"
      );
      this.quaternion.setFromEuler(this.euler);
      this.scale.set(
        continuousScale * transitionScale,
        continuousScale * THREE.MathUtils.lerp(0.96, 1.05, withinStage) * transitionScale *
          THREE.MathUtils.lerp(1, 0.24, smoothstep(cut)),
        continuousScale * transitionScale
      );
      this.matrix.compose(this.position, this.quaternion, this.scale);
      batch.mesh.setMatrixAt(index, this.matrix);
      this.instanceTint(crop, entry.weight, this.color);
      batch.mesh.setColorAt(index, this.color);
      batch.cropIds.push(entry.cutProgress == null ? crop.id : "");
    }
    batch.mesh.count = count;
    batch.mesh.instanceMatrix.needsUpdate = count > 0;
    if (batch.mesh.instanceColor) batch.mesh.instanceColor.needsUpdate = count > 0;
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

  private updateMoistureBatch(crops: readonly PlacedCropState[]): void {
    const batch = this.moistureBatch;
    this.ensureBatchCapacity(batch, crops.length, "crop_disturbed_soil_instances_dynamic");
    batch.cropIds.length = 0;
    const count = crops.length;
    for (let index = 0; index < count; index++) {
      const crop = crops[index];
      const definition = ContentRegistry.crops.get(crop.cropId);
      if (!definition) continue;
      const world = farmLocalToWorld(crop.farmId, crop);
      const variation = 0.82 + hashUnit(`${crop.id}:soil`) * 0.18;
      this.position.set(world.x, WorldLayout.terrainHeight(world.x, world.z) + 0.018, world.z);
      this.quaternion.setFromEuler(this.euler.set(0, crop.rotationRadians + hashUnit(crop.id) * 0.3, 0));
      this.scale.set(definition.footprint.width * variation, 1, definition.footprint.depth * variation);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      batch.mesh.setMatrixAt(index, this.matrix);
      const band = cropMoistureBand(crop.moisture);
      this.color.set(
        PALETTE_HEX[band === "wet" ? "soil_damp_01" : band === "dry" ? "soil_dry_01" : "soil_warm_01"]
      );
      batch.mesh.setColorAt(index, this.color);
      batch.cropIds.push(crop.id);
    }
    batch.mesh.count = count;
    batch.mesh.instanceMatrix.needsUpdate = count > 0;
    if (batch.mesh.instanceColor) batch.mesh.instanceColor.needsUpdate = count > 0;
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
  }

  public pick(camera: THREE.Camera, pointerNdc: { x: number; y: number }): string | null {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(pointerNdc.x, pointerNdc.y), camera);
    const batches = [
      this.moistureBatch,
      ...[...this.templates.values()].flatMap((template) => template.batches)
    ].filter((batch) => batch.mesh.count > 0);
    const hits = raycaster.intersectObjects(batches.map((batch) => batch.mesh), false);
    for (const hit of hits) {
      if (hit.instanceId == null) continue;
      const batch = batches.find((entry) => entry.mesh === hit.object);
      const cropId = batch?.cropIds[hit.instanceId];
      if (cropId) return cropId;
    }
    return null;
  }

  public dispose(): void {
    for (const template of this.templates.values()) {
      for (const batch of template.batches) {
        batch.mesh.removeFromParent();
        batch.mesh.geometry.dispose();
      }
    }
    this.templates.clear();
    this.loading.clear();
    this.moistureBatch.mesh.removeFromParent();
    this.moistureBatch.mesh.geometry.dispose();
  }
}
