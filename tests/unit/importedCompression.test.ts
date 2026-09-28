import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Document } from "@gltf-transform/core";
// @ts-expect-error gltf-validator has no bundled type declarations
import { validateBytes } from "gltf-validator";
import { describe, expect, it } from "vitest";
import { compressImportedAsset, createNodeIO, ensureMeshoptReady } from "../../tools/art/optimize.mjs";

async function fixture() {
  await ensureMeshoptReady();
  const document = new Document();
  const buffer = document.createBuffer();
  const accessor = (name: string, type: "SCALAR" | "VEC3" | "VEC4" | "MAT4", array: Float32Array | Uint16Array) =>
    document.createAccessor(name).setBuffer(buffer).setType(type).setArray(array);
  const position = accessor("position", "VEC3", new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]));
  const weights = accessor("weights", "VEC4", new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]));
  const joints = accessor("joints", "VEC4", new Uint16Array(12));
  const indices = accessor("indices", "SCALAR", new Uint16Array([2, 0, 1]));
  const primitive = document.createPrimitive().setAttribute("POSITION", position).setAttribute("JOINTS_0", joints).setAttribute("WEIGHTS_0", weights).setIndices(indices);
  const bone = document.createNode("rig_hand").setTranslation([0.27, 0.91, -0.05]);
  const socket = document.createNode("tool_socket").setExtras({ neva_marker: "socket" });
  bone.addChild(socket);
  const inverse = accessor("bind", "MAT4", new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -0.27, -0.91, 0.05, 1]));
  const skin = document.createSkin("rig").addJoint(bone).setInverseBindMatrices(inverse);
  const node = document.createNode("LOD0").setMesh(document.createMesh().addPrimitive(primitive)).setSkin(skin);
  const times = accessor("times", "SCALAR", new Float32Array([0, 0.333333343, 0.733333349]));
  const rotations = accessor("rotation", "VEC4", new Float32Array([0, 0, 0, 1, 0.3, 0, 0, Math.sqrt(0.91), 0, 0, 0, 1]));
  const sampler = document.createAnimationSampler().setInput(times).setOutput(rotations);
  const channel = document.createAnimationChannel().setTargetNode(bone).setTargetPath("rotation").setSampler(sampler);
  document.createAnimation("plant").addSampler(sampler).addChannel(channel).setExtras({ neva_commit_marker_seconds: 0.333333 });
  document.createScene().addChild(bone).addChild(node);
  return createNodeIO().writeBinary(document);
}

/** Rewrites a GLB so every accessor owns a buffer view, as Tripo exports are laid out. */
function viewPerAccessor(glb: Uint8Array): Uint8Array {
  const bytes = Buffer.from(glb);
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8"));
  const binary = bytes.subarray(28 + jsonLength);
  const size = { 5121: 1, 5123: 2, 5126: 4 } as Record<number, number>;
  const count = { SCALAR: 1, VEC3: 3, VEC4: 4, MAT4: 16 } as Record<string, number>;
  const chunks: Buffer[] = [];
  let total = 0;
  const views = json.accessors.map((accessor: { bufferView: number; byteOffset?: number; componentType: number; type: string; count: number }) => {
    const view = json.bufferViews[accessor.bufferView];
    const length = accessor.count * size[accessor.componentType] * count[accessor.type];
    const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const offset = total;
    chunks.push(binary.subarray(start, start + length), Buffer.alloc((4 - length % 4) % 4));
    total += length + (4 - length % 4) % 4;
    return { buffer: 0, byteOffset: offset, byteLength: length, ...(view.target ? { target: view.target } : {}) };
  });
  json.accessors.forEach((accessor: { bufferView: number; byteOffset?: number }, index: number) => {
    accessor.bufferView = index;
    delete accessor.byteOffset;
  });
  json.bufferViews = views;
  json.buffers[0].byteLength = total;
  const text = Buffer.from(JSON.stringify(json));
  const padded = Buffer.concat([text, Buffer.alloc((4 - text.length % 4) % 4, 0x20)]);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + padded.length + total, 8);
  header.writeUInt32LE(padded.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  const binaryHeader = Buffer.alloc(8);
  binaryHeader.writeUInt32LE(total, 0);
  binaryHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, padded, binaryHeader, ...chunks]);
}

async function multiClipFixture() {
  await ensureMeshoptReady();
  const document = new Document();
  const buffer = document.createBuffer();
  const accessor = (name: string, type: "SCALAR" | "VEC3" | "VEC4", array: Float32Array | Uint16Array) =>
    document.createAccessor(name).setBuffer(buffer).setType(type).setArray(array);
  const primitive = document.createPrimitive()
    .setAttribute("POSITION", accessor("position", "VEC3", new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])))
    .setIndices(accessor("indices", "SCALAR", new Uint16Array([0, 1, 2])));
  const hip = document.createNode("hip").setMesh(document.createMesh().addPrimitive(primitive));
  const knee = document.createNode("knee").setTranslation([0, -0.4, 0]);
  hip.addChild(knee);
  for (const [name, frames] of [["walk", 4], ["idle", 2], ["wave", 3]] as const) {
    const animation = document.createAnimation(name);
    const times = accessor(`${name}_times`, "SCALAR", Float32Array.from({ length: frames }, (_, i) => i / 3));
    for (const [node, path, type, width] of [[hip, "rotation", "VEC4", 4], [knee, "translation", "VEC3", 3], [knee, "rotation", "VEC4", 4]] as const) {
      const values = Float32Array.from({ length: frames * width }, (_, i) => Math.sin(i + frames) * 0.1);
      // Rotations are unit quaternions: w completes each small x, y, z.
      if (width === 4) for (let key = 0; key < frames; key++) {
        const [x, y, z] = values.subarray(key * 4, key * 4 + 3);
        values[key * 4 + 3] = Math.sqrt(1 - x * x - y * y - z * z);
      }
      const sampler = document.createAnimationSampler().setInput(times).setOutput(accessor(`${name}_${path}`, type, values));
      animation.addSampler(sampler).addChannel(document.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(sampler));
    }
  }
  document.createScene().addChild(hip);
  return viewPerAccessor(await createNodeIO().writeBinary(document));
}

describe("lossless Meshopt packaging for skinned authored GLBs", () => {
  it("gives animation keyframes one buffer view per element size without changing a decoded value", async () => {
    const original = await multiClipFixture();
    const sourceViews = JSON.parse(Buffer.from(original).subarray(20, 20 + Buffer.from(original).readUInt32LE(12)).toString()).bufferViews;
    expect(sourceViews.length).toBeGreaterThan(12);
    const packed = await compressImportedAsset(original);
    const json = JSON.parse(Buffer.from(packed).subarray(20, 20 + Buffer.from(packed).readUInt32LE(12)).toString());
    const animationAccessors = new Set<number>(json.animations.flatMap((animation: { samplers: { input: number; output: number }[] }) =>
      animation.samplers.flatMap((sampler) => [sampler.input, sampler.output])));
    const animationViews = new Set([...animationAccessors].map((index) => json.accessors[index].bufferView));
    // Keyframe times, translations and rotations: one view each.
    expect(animationViews.size).toBe(3);
    const io = createNodeIO();
    const before = (await io.readBinary(original)).getRoot();
    const after = (await io.readBinary(packed)).getRoot();
    expect(after.listAccessors().map((item) => [item.getName(), item.getType(), Array.from(item.getArray()!)]))
      .toEqual(before.listAccessors().map((item) => [item.getName(), item.getType(), Array.from(item.getArray()!)]));
    expect(after.listAnimations().map((animation) => animation.listChannels().map((channel) =>
      [channel.getTargetNode()!.getName(), channel.getTargetPath(), channel.getSampler()!.getOutput()!.getName()])))
      .toEqual(before.listAnimations().map((animation) => animation.listChannels().map((channel) =>
        [channel.getTargetNode()!.getName(), channel.getTargetPath(), channel.getSampler()!.getOutput()!.getName()])));
    const validation = await validateBytes(packed);
    expect(validation.issues.messages.filter((m: { severity: number }) => m.severity === 0)).toEqual([]);
    expect(Buffer.from(await compressImportedAsset(original))).toEqual(Buffer.from(packed));
  });

  it("preserves exact decoded accessor values, triangle order, animation and sockets", async () => {
    const original = await fixture();
    const packed = await compressImportedAsset(original);
    const io = createNodeIO();
    const before = (await io.readBinary(original)).getRoot();
    const after = (await io.readBinary(packed)).getRoot();
    expect(after.listAccessors()).toHaveLength(before.listAccessors().length);
    for (const [i, item] of before.listAccessors().entries()) {
      expect(after.listAccessors()[i].getType()).toBe(item.getType());
      expect(after.listAccessors()[i].getComponentType()).toBe(item.getComponentType());
      expect(Array.from(after.listAccessors()[i].getArray()!)).toEqual(Array.from(item.getArray()!));
    }
    expect(after.listNodes().map(n => [n.getName(), n.getTranslation(), n.getExtras(), n.listChildren().map(c => c.getName())]))
      .toEqual(before.listNodes().map(n => [n.getName(), n.getTranslation(), n.getExtras(), n.listChildren().map(c => c.getName())]));
    expect(after.listAnimations().map(a => [a.getName(), a.getExtras()])).toEqual(before.listAnimations().map(a => [a.getName(), a.getExtras()]));
    const validation = await validateBytes(packed);
    expect(validation.issues.messages.filter((m: { severity: number }) => m.severity === 0)).toEqual([]);
  });

  it("writes deterministic files and refuses compressed or malformed input", async () => {
    const original = await fixture();
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "neva-compress-test-"));
    const destination = path.join(directory, "adapted.glb");
    try {
      expect(await compressImportedAsset(original, destination)).toBe(destination);
      expect(fs.readFileSync(destination)).toEqual(Buffer.from(await compressImportedAsset(original)));
      await expect(compressImportedAsset(fs.readFileSync(destination))).rejects.toThrow("embed one buffer");
      await expect(compressImportedAsset(new Uint8Array(30))).rejects.toThrow("complete GLB");
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
