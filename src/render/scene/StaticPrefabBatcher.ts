import * as THREE from "three";
import { ASSET_BY_ID, type AssetId } from "../assets/AssetCatalog";
import { WorldLayout } from "../../world/WorldLayout";
import { configureStaticBatchSubmission } from "./staticBatchSubmission";
import type { EditableStaticSources } from "./EditableStaticSources";

export interface StaticBatchInstance {
  batch: THREE.BatchedMesh;
  instanceId: number;
  chunk: StaticBatchChunk;
  lodVisible: boolean;
  visible: boolean;
}

export interface StaticLodBatchInstance extends StaticBatchInstance {
  levelIndex: number;
  distances: readonly number[];
  position: THREE.Vector3;
}

interface StaticBatchSource {
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  chunkKey: string;
  detail: boolean;
  lod?: { key: string; levelIndex: number; distances: readonly number[]; position: THREE.Vector3 };
}

export interface StaticLodPlacement {
  position: THREE.Vector3;
  distances: readonly number[];
  instances: StaticLodBatchInstance[];
  selectedLevel: number;
}

export interface StaticBatchChunk {
  batch: THREE.BatchedMesh;
  instances: StaticBatchInstance[];
  center: THREE.Vector3;
  radius: number;
  visible: boolean;
  detail: boolean;
}

export const STATIC_BATCH_CHUNK_SIZE_METERS = 80;
export const STATIC_BATCH_FOG_MARGIN_METERS = 24;

export interface StaticPrefabBatchContext {
  staticPrefabGroup: THREE.Group;
  staticLodBatchInstances: StaticLodBatchInstance[];
  staticLodPlacements: Map<string, StaticLodPlacement>;
  editableStaticSources: EditableStaticSources;
  staticPrefabBatches: Set<THREE.BatchedMesh>;
  staticBatchChunks: StaticBatchChunk[];
}

export function batchCompatibleMeshes(
root: THREE.Group,
shouldSkip: (object: THREE.Mesh) => boolean,
context: StaticPrefabBatchContext
): void {
  root.updateMatrixWorld(true);
  const rootWorldInverse = root.matrixWorld.clone().invert();
  const trackStaticLods = root === context.staticPrefabGroup;
  const compatibleGroups = new Map<
    string,
    {
      material: THREE.Material;
      sources: StaticBatchSource[];
    }
  >();
  const uvStrippedGeometries = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || object instanceof THREE.BatchedMesh || !object.visible) return;
    if (Array.isArray(object.material)) return;
    if ((object as THREE.SkinnedMesh).isSkinnedMesh || object.morphTargetInfluences) return;
    let lod: StaticBatchSource["lod"];
    let detail = false;
    let child: THREE.Object3D = object;
    let ancestor: THREE.Object3D | null = object.parent;
    while (ancestor && ancestor !== root) {
      const assetId = ancestor.userData.assetId as AssetId | undefined;
      const spec = assetId ? ASSET_BY_ID.get(assetId) : undefined;
      if (spec) {
        // Structural silhouettes remain present at every tier; a bush or
        // small rock need not pay horizon-distance cost in a dense forest.
        detail = (spec.family === "vegetation" && !assetId!.startsWith("tree_"))
          || (spec.family === "rock" && spec.lod === "small")
          || (spec.family === "prop" && spec.collision === "none" && spec.readDistanceMeters <= 12);
      }
      if (ancestor instanceof THREE.LOD && trackStaticLods) {
        const levelIndex = ancestor.levels.findIndex((level) => level.object === child);
        if (levelIndex >= 0) {
          lod = {
            key: ancestor.uuid,
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
    let batchGeometry = object.geometry;
    if (!hasTexture && object.geometry.getAttribute("uv")) {
      let geometry = uvStrippedGeometries.get(object.geometry);
      if (!geometry) {
        const stripped = object.geometry.clone();
        stripped.deleteAttribute("uv");
        uvStrippedGeometries.set(object.geometry, stripped);
        geometry = stripped;
      }
      batchGeometry = geometry;
    }
    const attributes = (Object.entries(batchGeometry.attributes) as Array<
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
      ? `${islandBatchKey}:${detail ? "detail" : "structure"}:${Math.floor(worldX / STATIC_BATCH_CHUNK_SIZE_METERS)}:${Math.floor(worldZ / STATIC_BATCH_CHUNK_SIZE_METERS)}`
      : "unbounded";
    const batchRegion = trackStaticLods ? islandBatchKey : "unbounded";
    const signature = `${batchRegion}|${object.material.uuid}|cast:${object.castShadow}|receive:${object.receiveShadow}|indexed:${Boolean(batchGeometry.index)}|${attributes}`;
    const group = compatibleGroups.get(signature) ?? {
      material: object.material,
      sources: [] as StaticBatchSource[]
    };
    group.sources.push({ mesh: object, geometry: batchGeometry, lod, chunkKey, detail });
    compatibleGroups.set(signature, group);
  });

  let batchIndex = 0;
  for (const { material, sources } of compatibleGroups.values()) {
    if (sources.length < 2 && !(trackStaticLods && sources.some((source) => source.lod))) continue;
    const uniqueGeometries = new Map<string, THREE.BufferGeometry>();
    for (const { geometry } of sources) uniqueGeometries.set(geometry.uuid, geometry);
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
    for (const { mesh, geometry, lod, chunkKey, detail } of sources) {
      const geometryId = geometryIds.get(geometry.uuid);
      if (geometryId === undefined) continue;
      const instanceId = batched.addInstance(geometryId);
      const relativeMatrix = new THREE.Matrix4().multiplyMatrices(rootWorldInverse, mesh.matrixWorld);
      batched.setMatrixAt(instanceId, relativeMatrix);
      if (trackStaticLods) {
        let chunkRecord = chunks.get(chunkKey);
        if (!chunkRecord) {
          chunkRecord = {
            chunk: { batch: batched, instances: [], center: new THREE.Vector3(), radius: 0, visible: true, detail },
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
        if (lod) {
          const lodInstance = Object.assign(instance, lod);
          context.staticLodBatchInstances.push(lodInstance);
          let placement = context.staticLodPlacements.get(lod.key);
          if (!placement) {
            placement = { position: lod.position, distances: lod.distances, instances: [], selectedLevel: -1 };
            context.staticLodPlacements.set(lod.key, placement);
          }
          placement.instances.push(lodInstance);
        }
      }
      if (trackStaticLods && import.meta.env.DEV) context.editableStaticSources.hide(mesh);
      else mesh.parent?.remove(mesh);
    }
    batched.name = `runtime_batch_${batchIndex++}`;
    batched.computeBoundingBox();
    batched.computeBoundingSphere();
    batched.frustumCulled = true;
    batched.castShadow = sources[0].mesh.castShadow;
    batched.customDepthMaterial = sources[0].mesh.customDepthMaterial;
    batched.receiveShadow = sources[0]?.mesh.receiveShadow ?? true;
    if (trackStaticLods) {
      configureStaticBatchSubmission(batched);
      context.staticPrefabBatches.add(batched);
    }
    root.add(batched);
    for (const { chunk, bounds } of chunks.values()) {
      bounds.applyMatrix4(root.matrixWorld);
      chunk.center.copy(bounds.center);
      chunk.radius = bounds.radius;
      context.staticBatchChunks.push(chunk);
    }
  }
  for (const geometry of uvStrippedGeometries.values()) geometry.dispose();
}

