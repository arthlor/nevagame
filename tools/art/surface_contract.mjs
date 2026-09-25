import { AnimationMixer, LoopOnce, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "meshoptimizer";
import { createNodeIO } from "./optimize.mjs";
import { encodeGlb, parseGlb } from "./glb.mjs";

const TEXTURE_SLOTS = ["normalTexture", "occlusionTexture", "emissiveTexture"];
const PBR_TEXTURE_SLOTS = ["baseColorTexture", "metallicRoughnessTexture"];

/**
 * The contract reads geometry, skins and clips only. Strip texture references so the loader never
 * needs an image decoder (Node has none, and three's WebP support probe is browser-only).
 */
function withoutTextures(bytes) {
  const { json, bin } = parseGlb(bytes);
  if (!json.textures?.length && !json.images?.length) return bytes;
  for (const material of json.materials ?? []) {
    for (const slot of TEXTURE_SLOTS) delete material[slot];
    for (const slot of PBR_TEXTURE_SLOTS) delete material.pbrMetallicRoughness?.[slot];
    if (material.extensions) {
      for (const extension of Object.values(material.extensions)) {
        if (!extension || typeof extension !== "object") continue;
        for (const key of Object.keys(extension)) if (key.endsWith("Texture")) delete extension[key];
      }
    }
  }
  delete json.textures;
  delete json.images;
  delete json.samplers;
  for (const key of ["extensionsUsed", "extensionsRequired"]) {
    if (!json[key]) continue;
    json[key] = json[key].filter((name) => name !== "EXT_texture_webp" && name !== "KHR_texture_basisu");
    if (!json[key].length) delete json[key];
  }
  return encodeGlb(json, bin);
}

/** Verify decoded render attributes, including every primitive and reduced skin. */
export async function validateSurfaceContract(bytes, spec) {
  const authoredSurface = Boolean(spec.surfaceAuthoring);
  // Authored GLBs with catalog clips (adapted characters and animals) keep their
  // skin and clip checks after packaging.
  const importedAnimation = spec.generator === "authored_glb" && spec.animationClips?.length;
  if (!authoredSurface && !importedAnimation) return null;
  await MeshoptDecoder.ready;
  const fail = (message) => { throw new Error(`${spec.id}: surface contract: ${message}`); };
  // GLTFLoader normalizes weights on load. Inspect decoded accessors first so
  // that runtime repair cannot conceal an invalid exported or reduced skin.
  const document = await createNodeIO().readBinary(bytes);
  for (const node of document.getRoot().listNodes()) {
    const skin = node.getSkin();
    if (!skin || !node.getMesh()) continue;
    for (const primitive of node.getMesh().listPrimitives()) {
      const weights = primitive.getAttribute("WEIGHTS_0"), joints = primitive.getAttribute("JOINTS_0");
      if (!weights || !joints || weights.getElementSize() !== 4) fail(`${node.getName()}: missing four-influence skin`);
      for (let i = 0; i < weights.getCount(); i++) {
        const ws = weights.getElement(i, []), js = joints.getElement(i, []);
        if (ws.some((w) => !Number.isFinite(w) || w < 0) || Math.abs(ws.reduce((x, y) => x + y, 0) - 1) > .002) fail(`${node.getName()}: unnormalized skin at ${i}`);
        if (js.some((j) => !Number.isInteger(j) || j < 0 || j >= skin.listJoints().length)) fail(`${node.getName()}: invalid joint at ${i}`);
      }
    }
  }
  // Geometry, skin and clip checks never read pixels, and Node has no image
  // decoder for a texture-preserving import; skip texture loading entirely.
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const geometryOnly = withoutTextures(bytes);
  const buffer = geometryOnly.buffer.slice(geometryOnly.byteOffset, geometryOnly.byteOffset + geometryOnly.byteLength);
  const gltf = await loader.parseAsync(buffer, "");
  const meshes = [];
  gltf.scene.traverse((node) => { if (node.isMesh) meshes.push(node); });
  gltf.scene.updateMatrixWorld(true);
  let triangles = 0, interpolatedTriangles = 0, skinVertices = 0;
  const normal = new Vector3(), a = new Vector3(), b = new Vector3();
  const c = new Vector3(), faceNormal = new Vector3(), meanNormal = new Vector3();
  const skins = [];
  for (const mesh of meshes) {
    const geometry = mesh.geometry;
    const position = geometry.getAttribute("position");
    const colors = geometry.getAttribute("color");
    const normals = geometry.getAttribute("normal");
    if (!normals || (authoredSurface && !colors)) fail(`${mesh.name} is missing color/normal data`);
    for (let i = 0; i < position.count; i++) {
      normal.fromBufferAttribute(normals, i);
      if (!Number.isFinite(normal.length()) || Math.abs(normal.length() - 1) > .03) fail(`${mesh.name}: invalid normal at ${i}`);
      if (![position.getX(i), position.getY(i), position.getZ(i)].every(Number.isFinite)) fail(`${mesh.name}: invalid position`);
      if (colors && ![colors.getX(i), colors.getY(i), colors.getZ(i)].every(Number.isFinite)) fail(`${mesh.name}: invalid color at ${i}`);
    }
    const indices = geometry.index;
    const count = indices ? indices.count : position.count;
    const vertex = (i) => indices ? indices.getX(i) : i;
    for (let i = 0; i < count; i += 3) {
      const ids = [vertex(i), vertex(i + 1), vertex(i + 2)];
      if (authoredSurface) {
        a.fromBufferAttribute(position, ids[0]);
        b.fromBufferAttribute(position, ids[1]);
        c.fromBufferAttribute(position, ids[2]);
        faceNormal.crossVectors(b.sub(a), c.sub(a));
        meanNormal.set(0, 0, 0);
        for (const id of ids) meanNormal.add(normal.fromBufferAttribute(normals, id));
        if (faceNormal.lengthSq() > 1e-18 && faceNormal.normalize().dot(meanNormal.normalize()) < -.001) {
          fail(`${mesh.name}: normals oppose triangle winding at ${i / 3}`);
        }
      }
      if (authoredSurface) {
        a.fromBufferAttribute(colors, ids[0]);
        if (ids.some((id) => a.distanceTo(b.fromBufferAttribute(colors, id)) > .000002)) fail(`${mesh.name}: nonconstant facet color at triangle ${i / 3}`);
      }
      normal.fromBufferAttribute(normals, ids[0]);
      if (ids.some((id) => normal.distanceTo(b.fromBufferAttribute(normals, id)) > .002)) interpolatedTriangles++;
      triangles++;
    }
    if (mesh.isSkinnedMesh) {
      const weights = geometry.getAttribute("skinWeight"), joints = geometry.getAttribute("skinIndex");
      if (!weights || !joints || weights.itemSize !== 4) fail(`${mesh.name}: missing four-influence skin`);
      for (let i = 0; i < position.count; i++) {
        const ws = [weights.getX(i), weights.getY(i), weights.getZ(i), weights.getW(i)];
        const js = [joints.getX(i), joints.getY(i), joints.getZ(i), joints.getW(i)];
        if (ws.some((w) => !Number.isFinite(w) || w < 0) || Math.abs(ws.reduce((x, y) => x + y, 0) - 1) > .002) fail(`${mesh.name}: unnormalized skin at ${i}`);
        if (js.some((j) => !Number.isInteger(j) || j < 0 || j >= mesh.skeleton.bones.length)) fail(`${mesh.name}: invalid joint at ${i}`);
      }
      skinVertices += position.count;
      mesh.skeleton.update();
      const edges = new Map();
      for (let i = 0; i < count; i += 3) {
        const ids = [vertex(i), vertex(i + 1), vertex(i + 2)];
        for (let corner = 0; corner < 3; corner++) {
          const x = ids[corner], y = ids[(corner + 1) % 3], key = `${Math.min(x, y)}:${Math.max(x, y)}`;
          // Quantization may move the scale into bind matrices. Measure the
          // decoded bind pose using the same skin evaluation as animated poses.
          mesh.getVertexPosition(x, a); mesh.getVertexPosition(y, b);
          a.applyMatrix4(mesh.matrixWorld); b.applyMatrix4(mesh.matrixWorld);
          const length = a.distanceTo(b);
          if (length > 1e-6) edges.set(key, { x, y, length });
        }
      }
      skins.push({ mesh, edges: [...edges.values()] });
    }
  }
  const creature = /^fauna_(donkey|chicken|rabbit|gull|butterfly)$/.test(spec.generator);
  if (creature && !skins.length) fail("creature export lost its skin");
  const deformation = [];
  if (skins.length) {
    const mixer = new AnimationMixer(gltf.scene);
    const point = new Vector3();
    const capture = () => skins.map(({ mesh }) => {
      mesh.skeleton.update();
      const positions = [];
      for (let i = 0; i < mesh.geometry.getAttribute("position").count; i++) {
        mesh.getVertexPosition(i, point);
        point.applyMatrix4(mesh.matrixWorld);
        if (![point.x, point.y, point.z].every(Number.isFinite)) fail(`${mesh.name}: nonfinite deformation`);
        positions.push(point.clone());
      }
      return positions;
    });
    for (const clip of gltf.animations) {
      mixer.stopAllAction();
      const action = mixer.clipAction(clip).reset().setLoop(LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();
      const times = new Set([0, clip.duration]);
      // Include exported key times as well as interpolated midpoints. This runs
      // on the raw candidate and again after Meshopt packaging.
      for (const track of clip.tracks) for (let i = 0; i < track.times.length; i++) times.add(track.times[i]);
      for (let i = 1; i < 16; i++) times.add(clip.duration * i / 16);
      let first, last, maximumStretch = 1;
      for (const time of [...times].sort((x, y) => x - y)) {
        mixer.setTime(time);
        gltf.scene.updateMatrixWorld(true);
        const positions = capture();
        first ??= positions;
        last = positions;
        skins.forEach(({ mesh, edges }, index) => {
          for (const edge of edges) {
            const stretch = positions[index][edge.x].distanceTo(positions[index][edge.y]) / edge.length;
            maximumStretch = Math.max(maximumStretch, stretch);
            if (stretch > 5 || stretch < .01) fail(`${mesh.name}: ${clip.name} deforms an edge by ${stretch.toFixed(3)} at ${time.toFixed(3)}s`);
          }
        });
      }
      const contract = [...(spec.animationClips ?? []), ...(spec.additionalAnimationClips ?? [])].find((entry) => entry.name === clip.name);
      let loopSeamMeters = 0;
      if (contract?.loop) {
        first.forEach((points, index) => points.forEach((p, vertex) => {
          loopSeamMeters = Math.max(loopSeamMeters, p.distanceTo(last[index][vertex]));
        }));
        if (loopSeamMeters > .001) fail(`${clip.name}: loop seam ${loopSeamMeters.toFixed(5)}m`);
      }
      deformation.push({ clip: clip.name, samples: times.size, maximumStretch, loopSeamMeters });
    }
    mixer.stopAllAction();
    mixer.uncacheRoot(gltf.scene);
  }
  for (const mesh of meshes) {
    mesh.geometry.dispose();
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.dispose();
  }
  return { primitives: meshes.length, triangles, interpolatedTriangles, skinVertices, deformation };
}
