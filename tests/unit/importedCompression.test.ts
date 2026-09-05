import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Document } from "@gltf-transform/core";
// @ts-expect-error gltf-validator has no bundled type declarations
import { validateBytes } from "gltf-validator";
import { describe, expect, it } from "vitest";
import { compressImportedAsset, createNodeIO, ensureMeshoptReady } from "../../tools/blender/optimize.mjs";

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

describe("adapted Blender lossless compression", () => {
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
