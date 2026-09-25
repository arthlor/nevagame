/**
 * Browser-side entry for the authored (code -> GLB) build.
 *
 * `tools/authored/export.mjs` bundles this file with esbuild and evaluates it inside a headless
 * Chromium page, because the factories build their textures through a 2D canvas and therefore need
 * a DOM at generation time. Nothing here runs at game runtime; it only produces the catalog GLBs.
 *
 * The emitted scene follows Neva's architecture contract:
 *   <id>_root
 *     <id>_LOD0     full-detail content
 *     <id>_LOD1     meshoptimizer-decimated content
 *     COL_<id>      box collider (hidden by AssetLoader)
 *
 * `adaptToPalette` re-skins the factories' textured materials onto Neva's shared palette: every mesh
 * ends up on one of <=16 shared palette-token materials with `vertexColors` on, textures dropped, and
 * COLOR_0 carrying the true authored colour. The loader's white base factor times COLOR_0 reproduces
 * the original colour, so the asset stays faithful while it stops being a per-factory material zoo.
 */
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { MeshoptSimplifier } from "meshoptimizer/simplifier";

import palette from "../../art/palettes/neva.palette.json";
import { createMedievalCottageModel } from "./medieval-cottage/createMedievalCottageModel";
import { createMedievalMarketStallModel } from "./medieval-market-stall/createMedievalMarketStallModel";
import { createThatchedCottageModel } from "./thatched-cottage/createThatchedCottageModel";
import { createWoodenOuthouseModel } from "./wooden-outhouse/createWoodenOuthouseModel";
import { createFishMarketShopModel } from "./fish-market-shop/createFishMarketShopModel";
import { createSunreachMarketStallModel } from "./sunreach-market-stall/createSunreachMarketStallModel";

const FACTORIES: Readonly<Record<string, () => THREE.Group>> = {
  building_thatched_cottage_a: createThatchedCottageModel,
  building_wooden_outhouse_a: createWoodenOuthouseModel,
  building_medieval_timber_cottage_a: createMedievalCottageModel,
  building_medieval_market_stall_a: createMedievalMarketStallModel,
  building_fish_market_coastal_a: createFishMarketShopModel,
  building_sunreach_cove_market_a: createSunreachMarketStallModel
};

interface PaletteTokenSpec {
  hex: string;
  roughness: number;
  metalness: number;
  family: string;
  emissiveStrength?: number;
}

const TOKEN_SPECS = palette.tokens as Record<string, PaletteTokenSpec>;
const TOKEN_COLORS = new Map(
  Object.keys(TOKEN_SPECS).map((token) => [token, new THREE.Color(TOKEN_SPECS[token].hex)])
);
/**
 * Craft tokens a building may be skinned with. Restricting the nearest-colour search to these keeps
 * the result semantically sensible (a plaster wall never becomes a water-foam token) even though
 * every palette token is technically valid. Emissive tokens are excluded here: they are only ever
 * assigned by the emissive branch, so a lit and an unlit material can never share a token name.
 */
const CANDIDATE_TOKENS = [
  "stone_warm_01", "stone_golden_01", "stone_cool_01", "plaster_cream_01", "plaster_warm_01",
  "wood_dark_01", "wood_weathered_01", "wood_warm_01", "roof_turf_01", "roof_warm_orange_01",
  "roof_terracotta_01", "soil_dry_01", "foliage_sage_01", "foliage_leaf_01", "foliage_shadow_01",
  "metal_iron_01", "metal_dark_01", "accent_ochre_01", "accent_red_01"
] as const;
/** Palette tokens are a closed set; the catalog schema caps an asset at 16 materials. */
const MAX_MATERIALS = 16;
/** Geometries below this many indices are left untouched by decimation. */
const LOD1_MIN_INDICES = 60;
/**
 * Per-model LOD plan: each entry is one decimated level below LOD0, holding the fraction of LOD0
 * triangles to keep and the distance (metres) at which the runtime switches to it. An empty plan
 * ships LOD0 only. The runtime shortens these distances by the quality tier's `lodDistanceScale`
 * (low 0.7 / medium 0.85 / high 0.95), so a declared 40 m is ~28 m on low.
 */
const LOD_PLANS: Readonly<Record<string, ReadonlyArray<{ ratio: number; distance: number }>>> = {
  building_thatched_cottage_a: [{ ratio: 0.35, distance: 40 }],
  // A 4.6k-triangle lot: decimating only saved 17%, so it ships LOD0 + collider like the other outhouse.
  building_wooden_outhouse_a: [],
  // Inn/farmhouse weight (225k triangles): three levels so mid- and far-distance cost drops hard.
  building_medieval_timber_cottage_a: [
    { ratio: 0.35, distance: 40 },
    { ratio: 0.12, distance: 90 }
  ],
  // 47k triangles: one level, like the thatched cottage, keeps mid-distance cost down without the
  // hero cottage's three-level plan.
  building_medieval_market_stall_a: [{ ratio: 0.35, distance: 40 }],
  building_fish_market_coastal_a: [{ ratio: 0.35, distance: 40 }],
  building_sunreach_cove_market_a: [{ ratio: 0.35, distance: 40 }]
};

/**
 * Decorative lot nodes (garden, fences, stored props). They are excluded from the collider: the
 * physics volume must be the building itself, or the placed garden becomes an invisible wall and the
 * player cannot walk up to the door.
 */
const LOT_NODES: Readonly<Record<string, readonly string[]>> = {
  building_thatched_cottage_a: ["climbing-ivy", "garden-vegetation", "barrel-planter", "woodshed-lean-to", "fences", "rocks"],
  building_wooden_outhouse_a: ["ground-mound", "garden-vegetation", "barrel", "fence-post", "log-pile"],
  building_medieval_timber_cottage_a: ["props-group", "foliage-group"],
  // Ground dressing and the sign boom overhang the building; the collider stays the building itself
  // so the player can walk up to the stall counter and the door.
  building_medieval_market_stall_a: ["props-group", "trade-sign-group"],
  building_sunreach_cove_market_a: ["props-group", "trade-sign-group"],
  building_fish_market_coastal_a: [
    "Ground fish crate__pivot",
    "Barrel 1 (coopered oak)__pivot",
    "Barrel 2 (coopered oak)__pivot",
    "Barrel 3 (coopered oak)__pivot",
    "Ground grain sack (burlap)__pivot",
    "Sign bracket arm__pivot"
  ]
};

function buildingBounds(id: string, root: THREE.Object3D): THREE.Box3 {
  const lot = new Set(LOT_NODES[id] ?? []);
  const box = new THREE.Box3();
  const visit = (node: THREE.Object3D): void => {
    if (lot.has(node.name)) return;
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.updateWorldMatrix(true, false);
      const geometry = mesh.geometry;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      if (geometry.boundingBox) {
        box.union(geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
      }
    }
    for (const child of node.children) visit(child);
  };
  visit(root);
  return box;
}

function nearestToken(colour: THREE.Color, candidates: readonly string[]): string {
  let best = candidates[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const token of candidates) {
    const candidate = TOKEN_COLORS.get(token)!;
    const distance = (candidate.r - colour.r) ** 2 + (candidate.g - colour.g) ** 2 + (candidate.b - colour.b) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = token;
    }
  }
  return best;
}

/** Average the canvas-backed texture a factory generated, or null when there is nothing to sample. */
function averageTextureColour(texture: THREE.Texture | null | undefined): THREE.Color | null {
  const image = texture?.image as
    | (HTMLCanvasElement & { getContext?: (id: string) => CanvasRenderingContext2D | null })
    | undefined;
  const context = image && typeof image.getContext === "function" ? image.getContext("2d") : null;
  if (!image || !context || !image.width || !image.height) return null;
  const { data } = context.getImageData(0, 0, image.width, image.height);
  const stride = Math.max(1, Math.floor((image.width * image.height) / 4096)) * 4;
  let r = 0;
  let g = 0;
  let b = 0;
  let samples = 0;
  for (let i = 0; i < data.length; i += stride) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    samples += 1;
  }
  if (!samples) return null;
  return new THREE.Color().setRGB(r / samples / 255, g / samples / 255, b / samples / 255, THREE.SRGBColorSpace);
}

/** De-lit authored color from a sculpt-spec factory material, or null when it carries none. */
function sculptSpecColour(material: THREE.MeshStandardMaterial): THREE.Color | null {
  const spec = (material.userData as { sculptMaterial?: unknown } | null)?.sculptMaterial as
    | { color?: unknown; baseColor?: unknown; albedo?: unknown } | null;
  if (!spec || typeof spec !== "object") return null;
  const candidates: unknown[] = [spec.color, spec.baseColor];
  const albedo = spec.albedo as { dominant?: unknown } | null;
  if (albedo && typeof albedo === "object") candidates.push(albedo.dominant);
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !candidate) continue;
    try {
      const colour = new THREE.Color(candidate);
      if (Number.isFinite(colour.r + colour.g + colour.b)) return colour;
    } catch {
      continue;
    }
  }
  return null;
}

function adaptToPalette(root: THREE.Object3D): void {
  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    if ((object as THREE.Mesh).isMesh) meshes.push(object as THREE.Mesh);
  });

  interface Pick {
    mesh: THREE.Mesh;
    token: string;
    base: THREE.Color;
    vertexColours: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | null;
    emissive: THREE.Color | null;
  }
  const picks: Pick[] = [];
  for (const mesh of meshes) {
    const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
    const geometry = mesh.geometry;
    // Reference-PBR factories (fish-market shop) declare white material color with an async URL
    // map that can never load in the offline export page, so the canvas average falls back to
    // white and the whole asset bakes white. The sculpt spec's de-lit color survives on
    // material.userData and is the correct bake in that case.
    const textureAverage = averageTextureColour(material.map)
      ?? sculptSpecColour(material)
      ?? new THREE.Color(1, 1, 1);
    // The visible colour is material tint x texture x per-vertex tint; capture all three before the
    // texture is dropped and the vertex colour attribute is overwritten with the baked result.
    const base = (material.color ? material.color.clone() : new THREE.Color(1, 1, 1)).multiply(textureAverage);
    const vertexColours = geometry?.getAttribute("color") ?? null;
    const emissive = material.emissive && material.emissiveIntensity > 0
      && (material.emissive.r > 0 || material.emissive.g > 0 || material.emissive.b > 0)
      ? material.emissive.clone()
      : null;
    // Emissive parts always take an emissive token; the rest match their average crafted colour.
    const token = emissive
      ? (emissive.r > emissive.g ? "emissive_lantern_01" : "emissive_window_01")
      : nearestToken(base, CANDIDATE_TOKENS);
    picks.push({ mesh, token, base, vertexColours, emissive });
  }

  // Collapse the least-used tokens until the asset fits the 16-material cap, remapping each dropped
  // token to its nearest surviving colour so the look degrades gracefully instead of arbitrarily.
  const counts = new Map<string, number>();
  for (const pick of picks) counts.set(pick.token, (counts.get(pick.token) ?? 0) + 1);
  while (counts.size > MAX_MATERIALS) {
    let least = "";
    let leastCount = Number.POSITIVE_INFINITY;
    for (const [token, count] of counts) {
      if (count < leastCount) {
        leastCount = count;
        least = token;
      }
    }
    const survivors = [...counts.keys()].filter((token) => token !== least);
    const replacement = nearestToken(TOKEN_COLORS.get(least)!, survivors);
    counts.delete(least);
    for (const pick of picks) if (pick.token === least) pick.token = replacement;
    counts.set(replacement, (counts.get(replacement) ?? 0) + leastCount);
  }

  const shared = new Map<string, THREE.MeshStandardMaterial>();
  const materialFor = (token: string, emissive: THREE.Color | null): THREE.MeshStandardMaterial => {
    const key = emissive ? `${token}:emissive` : token;
    const existing = shared.get(key);
    if (existing) return existing;
    const spec = TOKEN_SPECS[token];
    const isEmissive = spec.family === "emissive";
    const material = new THREE.MeshStandardMaterial({
      name: token,
      // White factor: COLOR_0 already holds the full authored colour (Neva's "replace" convention).
      color: new THREE.Color(0xffffff),
      roughness: spec.roughness,
      metalness: spec.metalness,
      vertexColors: true,
      // The factories rely on double-sided thatch/foliage/panel materials; preserve that or the
      // shells and leaf blades lose their backfaces.
      side: THREE.DoubleSide,
      emissive: isEmissive ? new THREE.Color(spec.hex) : new THREE.Color(0, 0, 0),
      emissiveIntensity: isEmissive ? spec.emissiveStrength ?? 1 : 0
    });
    shared.set(key, material);
    return material;
  };

  for (const { mesh, token, base, vertexColours, emissive } of picks) {
    const geometry = mesh.geometry;
    const vertexCount = geometry?.getAttribute("position")?.count ?? 0;
    if (vertexCount) {
      const colours = new Float32Array(vertexCount * 3);
      for (let i = 0; i < vertexCount; i += 1) {
        const scaleR = vertexColours ? vertexColours.getX(i) : 1;
        const scaleG = vertexColours ? vertexColours.getY(i) : 1;
        const scaleB = vertexColours ? vertexColours.getZ(i) : 1;
        colours[i * 3] = Math.min(1, base.r * scaleR);
        colours[i * 3 + 1] = Math.min(1, base.g * scaleG);
        colours[i * 3 + 2] = Math.min(1, base.b * scaleB);
      }
      geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
    }
    mesh.material = materialFor(token, emissive);
  }
}

/**
 * Build a decimated copy of a geometry, or null when it cannot be usefully reduced.
 *
 * meshopt can only collapse edges shared by two triangles, but three's primitives duplicate every
 * face vertex, so an unwelded box or wall offers nothing to collapse. Weld first; then simplify;
 * then keep the welded+reduced geometry (its attributes are equivalent, just shared).
 */
function simplifyGeometry(geometry: THREE.BufferGeometry, ratio: number): THREE.BufferGeometry | null {
  const source = geometry.clone();
  // Bake the (constant, per-mesh) vertex colour so it can be restored after welding.
  const colour = source.getAttribute("color");
  const baked = colour ? [colour.getX(0), colour.getY(0), colour.getZ(0)] : null;
  // Weld by position alone. Keeping normals/UVs would stop the weld on flat-shaded primitives whose
  // per-face normals differ at every seam, leaving meshopt nothing to collapse. Normals are rebuilt
  // afterwards; UVs are dropped with the textures.
  for (const attribute of Object.keys(source.attributes)) {
    if (attribute !== "position") source.deleteAttribute(attribute);
  }
  let welded: THREE.BufferGeometry;
  try {
    welded = mergeVertices(source, 1e-4);
  } catch {
    return null;
  }
  const position = welded.getAttribute("position");
  const index = welded.getIndex();
  if (!position || position.itemSize !== 3 || !index || index.count < LOD1_MIN_INDICES) return null;
  const vertexCount = position.count;
  const indices = Uint32Array.from(index.array as ArrayLike<number>);
  if (indices.length % 3 !== 0) return null;
  for (let i = 0; i < indices.length; i += 1) {
    if (indices[i] >= vertexCount) return null;
  }
  const target = Math.max(3, Math.floor((indices.length * ratio) / 3) * 3);
  if (target >= indices.length) return null;
  const positions = position.array instanceof Float32Array
    ? position.array
    : new Float32Array(position.array as ArrayLike<number>);
  try {
    // meshoptimizer expects the stride in elements (it multiplies by 4 internally).
    const [simplified] = MeshoptSimplifier.simplify(indices, positions, position.itemSize, target, 1e-2);
    if (simplified.length < 3 || simplified.length >= indices.length) return null;
    welded.setIndex(new THREE.BufferAttribute(simplified, 1));
    welded.computeVertexNormals();
    if (baked) {
      const colours = new Float32Array(welded.getAttribute("position").count * 3);
      for (let i = 0; i < colours.length; i += 3) {
        colours[i] = baked[0];
        colours[i + 1] = baked[1];
        colours[i + 2] = baked[2];
      }
      welded.setAttribute("color", new THREE.BufferAttribute(colours, 3));
    }
    return welded;
  } catch (error) {
    console.warn(`[authored] LOD1 decimation failed for ${geometry.name || "geometry"}: ${(error as Error).message}`);
    return null;
  }
}

interface SubtreeMetric {
  triangles: number;
  instancedTriangles: number;
  meshes: number;
}

function measureSubtree(object: THREE.Object3D, skip: (node: THREE.Object3D) => boolean): SubtreeMetric {
  let triangles = 0;
  let instancedTriangles = 0;
  let meshes = 0;
  object.traverse((node) => {
    if (skip(node)) return;
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    meshes += 1;
    const geometry = mesh.geometry;
    const index = geometry?.getIndex() ?? null;
    const position = geometry?.getAttribute("position") ?? null;
    const vertices = index ? index.count : position ? position.count : 0;
    const unique = Math.floor(vertices / 3);
    const instances = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh).count : 1;
    triangles += unique;
    instancedTriangles += unique * instances;
  });
  return { triangles, instancedTriangles, meshes };
}

function hashSeed(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Sculpt-spec factories use Math.random for procedural canvas detail; seed it per model id. */
function installSeededRandom(seed: number): void {
  let state = seed || 1;
  Math.random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildContent(id: string, adapt: boolean): THREE.Group {
  const factory = FACTORIES[id];
  if (!factory) throw new Error(`Unknown authored model: ${id}`);
  installSeededRandom(hashSeed(id));
  const content = factory();
  // The factories hang a circular `sculptRuntime` inspector payload off `userData`; Object3D.clone
  // JSON-round-trips userData and would throw, and we strip glTF `extras` anyway.
  content.traverse((node) => {
    node.userData = {};
  });
  if (adapt) adaptToPalette(content);
  content.updateMatrixWorld(true);
  return content;
}

interface BuiltScene {
  root: THREE.Group;
  lod0: THREE.Group;
  /** Decimated levels in order; `name` is `<id>_LOD<n>` for n = 1, 2, ... */
  levels: Array<{ name: string; object: THREE.Group; triangles: number }>;
}

async function buildScene(id: string, adapt: boolean, lod: boolean): Promise<BuiltScene> {
  const content = buildContent(id, adapt);

  const lod0 = content;
  lod0.name = `${id}_LOD0`;

  const plan = lod ? LOD_PLANS[id] ?? [] : [];
  const levels: BuiltScene["levels"] = [];
  if (plan.length) await MeshoptSimplifier.ready;
  plan.forEach((level, index) => {
    const decimated = content.clone(true) as THREE.Group;
    decimated.name = `${id}_LOD${index + 1}`;
    let reduced = 0;
    let candidates = 0;
    decimated.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      // clone() shares geometry with LOD0; clone it before decimating so LOD0 is untouched.
      const geometry = mesh.geometry.clone();
      const source = geometry.getIndex();
      const position = geometry.getAttribute("position");
      const indexCount = source ? source.count : position ? position.count : 0;
      if (indexCount >= LOD1_MIN_INDICES) candidates += 1;
      const simplified = simplifyGeometry(geometry, level.ratio);
      if (simplified) {
        mesh.geometry = simplified;
        reduced += 1;
      } else {
        mesh.geometry = geometry;
      }
    });
    console.info(`[authored] ${decimated.name} decimated ${reduced}/${candidates} eligible mesh(es)`);
    levels.push({
      name: decimated.name,
      object: decimated,
      triangles: measureSubtree(decimated, (node) => node.name.startsWith("COL_")).triangles
    });
  });

  // Collision proxy. AssetLoader hides any node whose name starts with COL_, so this only has to
  // carry the footprint; it reuses a palette material so it never adds a material slot. The box is
  // the building's own bounds, not the whole lot, so the garden stays walkable.
  let collisionMaterial: THREE.Material | null = null;
  lod0.traverse((node) => {
    if (collisionMaterial) return;
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh) collisionMaterial = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  });
  const collisionBounds = buildingBounds(id, lod0);
  const collisionSize = collisionBounds.getSize(new THREE.Vector3());
  const collisionCentre = collisionBounds.getCenter(new THREE.Vector3());
  const collider = new THREE.Mesh(
    new THREE.BoxGeometry(collisionSize.x, collisionSize.y, collisionSize.z),
    collisionMaterial ?? new THREE.MeshStandardMaterial({ color: 0x000000 })
  );
  collider.name = `COL_${id}`;
  collider.position.copy(collisionCentre);

  const root = new THREE.Group();
  root.name = `${id}_root`;
  root.add(lod0);
  for (const level of levels) root.add(level.object);
  root.add(collider);
  root.updateMatrixWorld(true);
  return { root, lod0, levels };
}

declare global {
  interface Window {
    __nevaAuthoredExport?: (id: string, adapt?: boolean, lod?: boolean) => Promise<ArrayBuffer>;
    __nevaAuthoredMetrics?: (id: string, adapt?: boolean, lod?: boolean) => Promise<AuthoredMetrics>;
  }
}

export interface AuthoredMetrics {
  width: number;
  depth: number;
  height: number;
  minY: number;
  /** Unique geometry triangles of LOD0 — the count Neva's validator and Art Yard report. */
  triangles: number;
  /** Rendered LOD0 triangles with GPU instances expanded; the artist-facing scene cost. */
  instancedTriangles: number;
  /** Unique geometry triangles of each decimated level, in order (empty when the plan has none). */
  lodTriangles: number[];
  meshes: number;
  materials: number;
  textures: number;
  /** Palette tokens actually used after adaptation (empty when `adapt` is false). */
  palette: string[];
  /** Building-only collider box (lot excluded), in model space. */
  collision: { center: [number, number, number]; halfExtents: [number, number, number] };
}

window.__nevaAuthoredExport = async (id: string, adapt = true, lod = true): Promise<ArrayBuffer> => {
  const { root } = await buildScene(id, adapt, lod);
  const output = await new GLTFExporter().parseAsync(root, {
    binary: true,
    trs: true,
    // COL_ and the LOD levels are required by the catalog but not all visible; export everything.
    onlyVisible: false,
    includeCustomExtensions: false
  });
  if (!(output instanceof ArrayBuffer)) {
    throw new Error(`Authored export for ${id} did not produce binary GLB data`);
  }
  return output;
};

// Catalog authoring numbers (dimensions, triangle count, material/texture counts) come from the
// built model rather than being copied by hand, so they cannot silently drift from the asset.
window.__nevaAuthoredMetrics = async (id: string, adapt = true, lod = true): Promise<AuthoredMetrics> => {
  const { root, lod0, levels } = await buildScene(id, adapt, lod);
  const bounds = new THREE.Box3().setFromObject(root);
  const size = bounds.getSize(new THREE.Vector3());
  const skipCollider = (node: THREE.Object3D): boolean => node.name.startsWith("COL_");
  const lod0Metrics = measureSubtree(lod0, skipCollider);

  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || skipCollider(node)) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of list) {
      materials.add(material);
      const map = (material as THREE.MeshStandardMaterial).map;
      if (map) textures.add(map);
    }
  });

  return {
    width: Number(size.x.toFixed(3)),
    depth: Number(size.z.toFixed(3)),
    height: Number(size.y.toFixed(3)),
    minY: Number(bounds.min.y.toFixed(3)),
    triangles: lod0Metrics.triangles,
    instancedTriangles: lod0Metrics.instancedTriangles,
    lodTriangles: levels.map((level) => level.triangles),
    meshes: lod0Metrics.meshes,
    materials: materials.size,
    textures: textures.size,
    palette: adapt ? [...materials].map((material) => material.name).sort() : [],
    collision: collisionFootprint(id, lod0)
  };
};

function collisionFootprint(id: string, lod0: THREE.Object3D): AuthoredMetrics["collision"] {
  const box = buildingBounds(id, lod0);
  const centre = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  return {
    center: [Number(centre.x.toFixed(3)), Number(centre.y.toFixed(3)), Number(centre.z.toFixed(3))],
    halfExtents: [Number((size.x / 2).toFixed(3)), Number((size.y / 2).toFixed(3)), Number((size.z / 2).toFixed(3))]
  };
}
