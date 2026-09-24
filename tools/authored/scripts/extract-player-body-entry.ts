/**
 * Browser half of `extract-player-body.mjs`: loads the published player GLB with three's loader
 * (which resolves quantization, meshopt and the skin for us) and samples its LOD0 surface (the detail that renders up close) at bind
 * pose, in the character root frame, with each vertex's strongest skin weights by bone name.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

const REGIONS = ["Head", "Body", "Pants", "Feet"] as const;

async function extractPlayerBody(b64: string) {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.parseAsync(bytes.buffer, "");
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const bones: Array<[string, number, number, number]> = [];
  const boneIndex = new Map<string, number>();
  root.traverse((object) => {
    if (!(object as THREE.Bone).isBone) return;
    const p = new THREE.Vector3().setFromMatrixPosition(object.matrixWorld).applyMatrix4(toRoot);
    boneIndex.set(object.name, bones.length);
    bones.push([object.name, +p.x.toFixed(4), +p.y.toFixed(4), +p.z.toFixed(4)]);
  });
  const tags: string[] = [];
  const positions: number[] = [];
  const normals: number[] = [];
  const joints: number[] = [];
  const weights: number[] = [];
  const tagOf: number[] = [];
  // Seams split vertices; one sample per position and region is all the fitting needs.
  const seen = new Set<string>();
  for (const region of REGIONS) {
    const node = root.getObjectByName(`char_player_a_Farmer_${region}_LOD0`);
    if (!node) throw new Error(`player GLB lacks char_player_a_Farmer_${region}_LOD0`);
    node.traverse((object) => {
      const mesh = object as THREE.SkinnedMesh;
      if (!mesh.isSkinnedMesh) return;
      const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material).name;
      const tag = `${region.toLowerCase()}.${material}`;
      if (!tags.includes(tag)) tags.push(tag);
      const geometry = mesh.geometry;
      const position = geometry.getAttribute("position");
      const normal = geometry.getAttribute("normal");
      const skinIndex = geometry.getAttribute("skinIndex");
      const skinWeight = geometry.getAttribute("skinWeight");
      const p = new THREE.Vector3();
      const n = new THREE.Vector3();
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(new THREE.Matrix4().multiplyMatrices(toRoot, mesh.matrixWorld));
      for (let i = 0; i < position.count; i += 1) {
        mesh.getVertexPosition(i, p);
        p.applyMatrix4(mesh.matrixWorld).applyMatrix4(toRoot);
        n.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize();
        const key = `${tag}:${Math.round(p.x * 1000)},${Math.round(p.y * 1000)},${Math.round(p.z * 1000)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        positions.push(Math.round(p.x * 1000), Math.round(p.y * 1000), Math.round(p.z * 1000));
        normals.push(Math.round(n.x * 127), Math.round(n.y * 127), Math.round(n.z * 127));
        const entries = [0, 1, 2, 3]
          .map((k) => [boneIndex.get(mesh.skeleton.bones[skinIndex.getComponent(i, k)].name)!, skinWeight.getComponent(i, k)] as const)
          .filter(([, w]) => w > 0.01)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3);
        const total = entries.reduce((sum, [, w]) => sum + w, 0);
        for (let k = 0; k < 3; k += 1) {
          joints.push(entries[k]?.[0] ?? 0);
          weights.push(entries[k] ? Math.round((entries[k][1] / total) * 255) : 0);
        }
        tagOf.push(tags.indexOf(tag));
      }
    });
  }
  return { bones, tags, positions, normals, joints, weights, tagOf };
}

(window as unknown as { extractPlayerBody: typeof extractPlayerBody }).extractPlayerBody = extractPlayerBody;
