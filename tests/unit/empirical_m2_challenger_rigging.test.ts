import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { NodeIO, type Document } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { beforeAll, describe, expect, it } from "vitest";
import { ASSET_BY_ID, type AssetId } from "../../src/render/assets/AssetCatalog";
import { CHARACTER_ASSET_IDS } from "../helpers/humanoidAssets";

const rootDirectory = path.resolve(import.meta.dirname, "../..");
const docs = new Map<AssetId, Document>();
const rawCatalog = JSON.parse(fs.readFileSync(path.join(rootDirectory, "assets/specs/asset-catalog.json"), "utf8"));

beforeAll(async () => {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
  for (const id of CHARACTER_ASSET_IDS) docs.set(id, await io.read(path.join(rootDirectory, "public/assets/models", ASSET_BY_ID.get(id)!.file)));
}, 120000);

describe("actual exported humanoid geometry, bindings and actions", () => {
  it.each(CHARACTER_ASSET_IDS)("%s retains a source rig and resolves every semantic bone and socket", (id) => {
    const doc = docs.get(id)!;
    const spec = ASSET_BY_ID.get(id)!;
    const nodes = new Map(doc.getRoot().listNodes().map((node) => [node.getName(), node]));
    const authoring = rawCatalog.assets.find((entry: { id: string }) => entry.id === id);
    expect(authoring.generator).toBe("imported_blend");
    expect(authoring.humanoidAuthoring.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(spec.humanoidRig).toBeTruthy();
    for (const [semantic, name] of Object.entries(spec.humanoidRig!.bones)) {
      expect(nodes.has(name), `${id}/${semantic}: ${name}`).toBe(true);
    }
    const joints = doc.getRoot().listSkins()[0]!.listJoints();
    // Finger deformation must survive source intake; a reduced donor skeleton fails.
    expect(joints.some((joint) => /finger|thumb|index/i.test(joint.getName()))).toBe(true);
    for (const side of ["left", "right"] as const) {
      const foot = nodes.get(spec.humanoidRig!.bones[`foot_${side}`]!)!;
      const shin = nodes.get(spec.humanoidRig!.bones[`shin_${side}`]!)!;
      expect(foot.getParentNode()?.getName()).toBe(spec.humanoidRig!.bones.root);
      expect(foot.getParentNode()?.getName()).not.toBe(shin.getName());
      // Original sources use different local units; anatomical length is measured
      // after the retained parent scale, just as the runtime limb solver does.
      const shinWorld = new THREE.Matrix4().fromArray(shin.getWorldMatrix());
      const ankle = new THREE.Vector3().fromArray(spec.humanoidRig!.legs[side].shinTip).applyMatrix4(shinWorld);
      const knee = new THREE.Vector3().setFromMatrixPosition(shinWorld);
      expect(ankle.distanceTo(knee)).toBeGreaterThan(0.1);
    }
    for (const name of spec.socketNodes ?? []) expect(nodes.has(name), `${id}/${name}`).toBe(true);
    for (const skin of doc.getRoot().listSkins()) {
      const inverse = skin.getInverseBindMatrices()!;
      expect(inverse.getCount()).toBe(skin.listJoints().length);
      const matrix = new THREE.Matrix4();
      for (let index = 0; index < inverse.getCount(); index++) {
        matrix.fromArray(inverse.getElement(index, []));
        expect(matrix.elements.every(Number.isFinite)).toBe(true);
        expect(Math.abs(matrix.determinant())).toBeGreaterThan(1e-9);
      }
    }
  });

  it.each(CHARACTER_ASSET_IDS)("%s preserves finite normalized weights, UVs, split normals and material regions in both LODs", (id) => {
    const doc = docs.get(id)!;
    const spec = ASSET_BY_ID.get(id)!;
    const nodes = doc.getRoot().listNodes();
    for (const lod of spec.lodLevels!) {
      const lodNode = nodes.find((node) => node.getName() === lod.node);
      expect(lodNode, `${id}/${lod.node}`).toBeTruthy();
    }
    let vertices = 0;
    const materials = new Set<string>();
    let smoothedCorners = 0;
    for (const node of nodes) {
      if (!node.getSkin() || !node.getMesh()) continue;
      const jointCount = node.getSkin()!.listJoints().length;
      for (const primitive of node.getMesh()!.listPrimitives()) {
        const position = primitive.getAttribute("POSITION")!;
        const weights = primitive.getAttribute("WEIGHTS_0")!;
        const joints = primitive.getAttribute("JOINTS_0")!;
        const normals = primitive.getAttribute("NORMAL")!;
        const uv = primitive.getAttribute("TEXCOORD_0")!;
        expect(Boolean(position && weights && joints && normals && uv), `${id}/${node.getName()}`).toBe(true);
        expect(weights.getCount()).toBe(position.getCount());
        expect(normals.getCount()).toBe(position.getCount());
        expect(uv.getCount()).toBe(position.getCount());
        materials.add(primitive.getMaterial()!.getName());
        const w: number[] = [], j: number[] = [], n: number[] = [];
        for (let index = 0; index < position.getCount(); index++) {
          weights.getElement(index, w); joints.getElement(index, j); normals.getElement(index, n);
          expect(w.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
          expect(w.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 4);
          expect(j.every((value) => Number.isInteger(value) && value >= 0 && value < jointCount)).toBe(true);
          expect(Math.hypot(...n)).toBeCloseTo(1, 3);
        }
        const indices = primitive.getIndices();
        const count = indices?.getCount() ?? position.getCount();
        const p = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
        const face = new THREE.Vector3(), edge = new THREE.Vector3(), normal = new THREE.Vector3();
        for (let index = 0; index < count; index += 3) {
          const a = indices?.getScalar(index) ?? index;
          const b = indices?.getScalar(index + 1) ?? index + 1;
          const c = indices?.getScalar(index + 2) ?? index + 2;
          p[0]!.fromArray(position.getElement(a, [])); p[1]!.fromArray(position.getElement(b, [])); p[2]!.fromArray(position.getElement(c, []));
          face.subVectors(p[1]!, p[0]!).cross(edge.subVectors(p[2]!, p[0]!)).normalize();
          normal.fromArray(normals.getElement(a, []));
          if (face.lengthSq() > 0 && Math.abs(face.dot(normal)) < 0.995) smoothedCorners++;
        }
        vertices += position.getCount();
      }
    }
    expect(vertices).toBeGreaterThan(1000);
    expect(materials.size).toBeGreaterThanOrEqual(4);
    expect(smoothedCorners, `${id} must retain selective source smoothing`).toBeGreaterThan(100);
    expect([...materials].some((name) => name.startsWith("skin_"))).toBe(true);
  });

  it.each(CHARACTER_ASSET_IDS)("%s exports every peaceful catalog action with real tracks and exact timing", (id) => {
    const spec = ASSET_BY_ID.get(id)!;
    const clips = [...spec.animationClips!, ...(spec.additionalAnimationClips ?? [])];
    const animations = docs.get(id)!.getRoot().listAnimations();
    expect(animations.map((animation) => animation.getName()).sort()).toEqual(clips.map((clip) => clip.name).sort());
    for (const clip of clips) {
      const animation = animations.find((entry) => entry.getName() === clip.name)!;
      expect(animation.listChannels().length).toBeGreaterThan(0);
      let end = 0;
      for (const sampler of animation.listSamplers()) {
        const input = sampler.getInput()!;
        const times = Array.from(input.getArray()! as ArrayLike<number>);
        expect(times.every((time, index) => Number.isFinite(time) && time >= 0 && (index === 0 || time > times[index - 1]!))).toBe(true);
        expect(Array.from(sampler.getOutput()!.getArray()!).every(Number.isFinite)).toBe(true);
        end = Math.max(end, times.at(-1)!);
      }
      expect(end, `${id}/${clip.name}`).toBeCloseTo(clip.durationSeconds, 4);
      for (const intervals of Object.values(clip.contacts ?? {})) for (const interval of intervals) {
        expect(interval.start).toBeGreaterThanOrEqual(0);
        expect(interval.end).toBeGreaterThan(interval.start);
        expect(interval.end).toBeLessThanOrEqual(clip.durationSeconds + 1e-5);
      }
      if (clip.commitMarkerSeconds !== undefined) {
        expect(clip.commitMarkerSeconds).toBeGreaterThan(0);
        expect(clip.commitMarkerSeconds).toBeLessThanOrEqual(clip.durationSeconds);
      }
    }
  });
});
