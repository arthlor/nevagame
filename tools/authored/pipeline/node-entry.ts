/**
 * Node-side producer for authored generators.
 *
 * `producer.mjs` bundles this module for Node and calls `buildAuthoredAsset` for every catalog asset
 * whose generator is in the authored registry. It plays the part Blender plays for the legacy
 * generators: build the scene, enforce the semantic art contract (the same checks
 * `tools/blender/common/pipeline.py` makes), export a raw GLB, and report the metrics the stage
 * report and manifest record. Optimisation, Khronos validation, caching and publication happen
 * afterwards in `tools/blender/cli.mjs`, identically for both producers.
 */
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

import { PALETTE_TOKENS, tokenLinearColor } from "../kit/palette";
import type { AuthoredModel, CatalogAssetSpec } from "../kit/types";
import { AUTHORED_GENERATORS } from "../generators/registry";
import { buildAuthoredModel } from "./build";

installFileReader();

export interface AuthoredAssetReport {
  id: string;
  file: string;
  nodes: number;
  meshes: number;
  triangles: number;
  packagedTriangles: number;
  lodLevels: Array<{ node: string; distanceMeters: number; triangles: number; ratio: number }>;
  qualityStatus: "on_target" | "below_target";
  budget: CatalogAssetSpec["budget"];
  fileSizeBytes: number;
  materials: string[];
  paletteTokensUsed: string[];
  vertexColorLoops: number;
  vertexColorSpace: "linear-srgb";
  artContractStatus: "passed";
  /** Rest-pose bounds in the Blender report convention: X right, Y back (-glTF Z), Z up. */
  bounds: { min: [number, number, number]; max: [number, number, number] };
  /** [width, depth, height] in metres. */
  dimensions: [number, number, number];
  requiredNodes: string[];
  animationClips: Array<{ name: string; durationSeconds: number }>;
  producer: "authored";
}

export function authoredGeneratorNames(): string[] {
  return Object.keys(AUTHORED_GENERATORS).sort();
}

export async function buildAuthoredAsset(spec: CatalogAssetSpec): Promise<{ glb: Uint8Array; report: Omit<AuthoredAssetReport, "fileSizeBytes"> }> {
  const model = buildAuthoredModel(spec);
  const report = checkArtContract(spec, model);
  const output = await new GLTFExporter().parseAsync(model.root, {
    binary: true,
    trs: true,
    onlyVisible: false,
    animations: model.clips,
    includeCustomExtensions: false
  });
  if (!(output instanceof ArrayBuffer)) throw new Error(`${spec.id}: authored export did not produce a binary GLB`);
  return { glb: new Uint8Array(output), report };
}

function fail(spec: CatalogAssetSpec, message: string): never {
  throw new Error(`${spec.id}: ${message}`);
}

/** The semantic art contract, mirroring `tools/blender/common/pipeline.py`. */
function checkArtContract(spec: CatalogAssetSpec, model: AuthoredModel): Omit<AuthoredAssetReport, "fileSizeBytes"> {
  const { root, clips } = model;
  const names = new Map<string, number>();
  const meshes: THREE.Mesh[] = [];
  root.traverse((node) => {
    names.set(node.name, (names.get(node.name) ?? 0) + 1);
    if ((node as THREE.Mesh).isMesh) meshes.push(node as THREE.Mesh);
  });
  const missing = spec.requiredNodes.filter((name) => !names.has(name));
  if (missing.length) fail(spec, `missing required nodes ${missing.join(", ")}`);
  const duplicated = [...names].filter(([name, count]) => count > 1 && name).map(([name]) => name);
  if (duplicated.length) fail(spec, `node names must be unique; duplicated ${duplicated.join(", ")}`);
  if (!meshes.length) fail(spec, "contains no meshes");

  const materialNames = new Set<string>();
  const trianglesByMesh = new Map<THREE.Mesh, number>();
  let colourCorners = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (const mesh of meshes) {
    const geometry = mesh.geometry;
    const position = geometry.getAttribute("position");
    const colour = geometry.getAttribute("color");
    const index = geometry.getIndex();
    if (!position || !geometry.getAttribute("normal")) fail(spec, `${mesh.name} is missing POSITION or NORMAL`);
    if (!colour) fail(spec, `${mesh.name} is missing semantic COLOR_0`);
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const groups = geometry.groups.length
      ? geometry.groups
      : [{ start: 0, count: index ? index.count : position.count, materialIndex: 0 }];
    let triangles = 0;
    for (const group of groups) {
      const material = materials[group.materialIndex ?? 0] as THREE.MeshStandardMaterial | undefined;
      const token = material?.name;
      if (!token || !PALETTE_TOKENS[token]) fail(spec, `${mesh.name} uses unknown material ${token ?? "<none>"}`);
      if (!spec.palette.includes(token)) fail(spec, `generator used undeclared palette token ${token}`);
      if (material!.side === THREE.DoubleSide) fail(spec, `${mesh.name} material ${token} must not be double-sided`);
      materialNames.add(token);
      const expected = tokenLinearColor(token);
      const expectedLengthSquared = expected.r ** 2 + expected.g ** 2 + expected.b ** 2;
      for (let corner = group.start; corner < group.start + group.count; corner += 3) {
        const ia = index ? index.getX(corner) : corner;
        const ib = index ? index.getX(corner + 1) : corner + 1;
        const ic = index ? index.getX(corner + 2) : corner + 2;
        a.fromBufferAttribute(position, ia);
        b.fromBufferAttribute(position, ib);
        c.fromBufferAttribute(position, ic);
        if (b.clone().sub(a).cross(c.clone().sub(a)).lengthSq() < 1e-16) fail(spec, `${mesh.name} has degenerate triangles`);
        for (const vertex of [ia, ib, ic]) {
          // COLOR_0 carries the token colour, optionally darkened as a value mask (0.70..1.06).
          const r = colour.getX(vertex);
          const g = colour.getY(vertex);
          const bl = colour.getZ(vertex);
          const value = (r * expected.r + g * expected.g + bl * expected.b) / expectedLengthSquared;
          const residual = Math.hypot(r - expected.r * value, g - expected.g * value, bl - expected.b * value);
          if (!(value >= 0.7 && value <= 1.06) || residual > 0.025) {
            fail(spec, `${mesh.name} COLOR_0 does not carry its ${token} token colour`);
          }
        }
        triangles += 1;
        colourCorners += 3;
      }
    }
    trianglesByMesh.set(mesh, triangles);
  }
  if (materialNames.size > spec.budget.materialsMax) {
    fail(spec, `${materialNames.size} materials exceeds ${spec.budget.materialsMax}`);
  }

  const packagedTriangles = [...trianglesByMesh.values()].reduce((sum, count) => sum + count, 0);
  let triangles = packagedTriangles;
  const lodLevels: AuthoredAssetReport["lodLevels"] = [];
  if (spec.lodLevels?.length) {
    const owned = new Map<THREE.Mesh, string>();
    for (const level of spec.lodLevels) {
      const node = root.getObjectByName(level.node);
      if (!node) fail(spec, `missing LOD node ${level.node}`);
      let levelTriangles = 0;
      node.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        if (owned.has(mesh)) fail(spec, `${mesh.name} belongs to both ${owned.get(mesh)} and ${level.node}`);
        owned.set(mesh, level.node);
        levelTriangles += trianglesByMesh.get(mesh) ?? 0;
      });
      lodLevels.push({ node: level.node, distanceMeters: level.distanceMeters, triangles: levelTriangles, ratio: 0 });
    }
    const outside = meshes.filter((mesh) => !owned.has(mesh)).map((mesh) => mesh.name);
    if (outside.length) fail(spec, `rendered meshes are outside declared LOD levels: ${outside.join(", ")}`);
    triangles = lodLevels[0].triangles;
    if (triangles <= 0) fail(spec, "LOD0 contains no triangles");
    spec.lodLevels.forEach((level, index) => {
      const ratio = lodLevels[index].triangles / triangles;
      lodLevels[index].ratio = ratio;
      if (ratio < level.triangleRatioMin || ratio > level.triangleRatioMax) {
        fail(spec, `${level.node} triangle ratio ${ratio.toFixed(3)} is outside ${level.triangleRatioMin}..${level.triangleRatioMax}`);
      }
    });
  }
  const { budget } = spec;
  if (triangles < budget.trianglesMin || triangles > budget.trianglesMax) {
    fail(spec, `${triangles} triangles outside ${budget.trianglesMin}..${budget.trianglesMax}`);
  }

  // Rest-pose bounds, with skinned vertices placed by their skeleton.
  const box = new THREE.Box3();
  const vertex = new THREE.Vector3();
  for (const mesh of meshes) {
    if (spec.lodLevels?.length) {
      let inLod0 = false;
      mesh.traverseAncestors((ancestor) => { if (ancestor.name === spec.lodLevels![0].node) inLod0 = true; });
      if (!inLod0) continue;
    }
    const skinned = mesh as THREE.SkinnedMesh;
    if (skinned.isSkinnedMesh) skinned.skeleton.update();
    const position = mesh.geometry.getAttribute("position");
    for (let i = 0; i < position.count; i += 1) {
      if (skinned.isSkinnedMesh) skinned.getVertexPosition(i, vertex);
      else vertex.fromBufferAttribute(position, i);
      box.expandByPoint(vertex.applyMatrix4(mesh.matrixWorld));
    }
  }
  const dimensions: [number, number, number] = [box.max.x - box.min.x, box.max.z - box.min.z, box.max.y - box.min.y];
  const expected = [spec.dimensions.width, spec.dimensions.depth, spec.dimensions.height];
  ["width", "depth", "height"].forEach((axis, i) => {
    if (dimensions[i] > expected[i] * 1.35 || dimensions[i] < expected[i] * 0.25) {
      fail(spec, `generated ${axis} ${dimensions[i].toFixed(3)} is incompatible with spec ${expected[i].toFixed(3)}`);
    }
  });
  if (spec.pivot === "ground_center" && !(box.min.y >= -0.12 && box.min.y <= 0.18)) {
    fail(spec, `ground pivot is invalid; minimum height is ${box.min.y.toFixed(3)}`);
  }

  const animationClips: AuthoredAssetReport["animationClips"] = [];
  for (const declared of spec.animationClips ?? []) {
    const clip = clips.find((candidate) => candidate.name === declared.name);
    if (!clip) fail(spec, `missing authored clip ${declared.name}`);
    if (Math.abs(clip.duration - declared.durationSeconds) > 1 / 60 + 0.002) {
      fail(spec, `clip ${declared.name} lasts ${clip.duration.toFixed(3)}s, the catalog declares ${declared.durationSeconds}s`);
    }
    for (const track of clip.tracks) {
      const target = track.name.slice(0, track.name.lastIndexOf("."));
      if (!names.has(target)) fail(spec, `clip ${declared.name} animates missing node ${target}`);
    }
    animationClips.push({ name: clip.name, durationSeconds: clip.duration });
  }

  let nodes = 0;
  root.traverse(() => { nodes += 1; });
  return {
    id: spec.id,
    file: spec.file,
    nodes,
    meshes: meshes.length,
    triangles,
    packagedTriangles,
    lodLevels,
    qualityStatus: triangles >= budget.trianglesTarget ? "on_target" : "below_target",
    budget,
    materials: [...materialNames].sort(),
    paletteTokensUsed: [...materialNames].sort(),
    vertexColorLoops: colourCorners,
    vertexColorSpace: "linear-srgb",
    artContractStatus: "passed",
    bounds: {
      min: [box.min.x, -box.max.z, box.min.y],
      max: [box.max.x, -box.min.z, box.max.y]
    },
    dimensions,
    requiredNodes: spec.requiredNodes,
    animationClips,
    producer: "authored"
  };
}

/** GLTFExporter hands its binary through a Blob and a FileReader; Node has Blob but no FileReader. */
function installFileReader(): void {
  const scope = globalThis as unknown as { FileReader?: unknown };
  if (scope.FileReader) return;
  class NodeFileReader {
    public result: ArrayBuffer | string | null = null;
    public onload: ((event: { target: NodeFileReader }) => void) | null = null;
    public onloadend: ((event: { target: NodeFileReader }) => void) | null = null;
    public onerror: ((error: unknown) => void) | null = null;

    public readAsArrayBuffer(blob: Blob): void {
      blob.arrayBuffer().then((buffer) => this.finish(buffer), (error) => this.onerror?.(error));
    }

    public readAsDataURL(blob: Blob): void {
      blob.arrayBuffer().then((buffer) => {
        this.finish(`data:${blob.type || "application/octet-stream"};base64,${Buffer.from(buffer).toString("base64")}`);
      }, (error) => this.onerror?.(error));
    }

    private finish(result: ArrayBuffer | string): void {
      this.result = result;
      this.onload?.({ target: this });
      this.onloadend?.({ target: this });
    }
  }
  scope.FileReader = NodeFileReader;
}
