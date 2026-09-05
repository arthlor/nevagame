import assert from "node:assert/strict";
import test from "node:test";
import { Document, NodeIO } from "@gltf-transform/core";
import { optimizeAsset } from "./optimize.mjs";
import { validateSurfaceContract } from "./surface_contract.mjs";

const spec = {
  id: "surface_fixture", generator: "fauna_chicken", family: "prop",
  surfaceAuthoring: { normalPolicy: "authored", facetColors: "rest_face" },
  animationClips: [{ name: "idle", loop: true }],
  lodLevels: [{ node: "lod0" }, { node: "lod1" }],
};

// A second material and reduced skin catch checks that accidentally inspect
// only the first primitive, the unreduced surface, or the bind pose.
async function fixture({ defect, scale = 1 } = {}) {
  const doc = new Document(), buffer = doc.createBuffer();
  const access = (name, type, data) => doc.createAccessor(name).setType(type).setArray(data).setBuffer(buffer);
  const scene = doc.createScene();
  const root = doc.createNode("model_root").setScale([scale, scale, scale]);
  scene.addChild(root);
  const bone = doc.createNode("bone");
  root.addChild(bone);
  const skin = doc.createSkin("skin").addJoint(bone);
  const inverse = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
  skin.setInverseBindMatrices(access("inverse", "MAT4", inverse));
  for (let lod = 0; lod < 2; lod++) {
    const mesh = doc.createMesh(`mesh${lod}`);
    for (let region = 0; region < 2; region++) {
      const target = lod === 1 && region === 1;
      const colors = new Float32Array([.4,.3,.2, .4,.3,.2, .4,.3,.2]);
      if (target && defect === "color seam") colors[3] = .7;
      if (target && defect === "nonfinite color") colors[3] = NaN;
      const normals = new Float32Array([0,0,1, .6,0,.8, 0,.6,.8]);
      if (target && defect === "normal") normals.fill(0);
      if (target && defect === "winding") for (let i = 0; i < normals.length; i++) normals[i] *= -1;
      const weights = new Float32Array([1,0,0,0, 1,0,0,0, 1,0,0,0]);
      if (target && defect === "weights") weights[0] = .3;
      const joints = new Uint16Array(12);
      if (target && defect === "joint") joints[0] = 9;
      const primitive = doc.createPrimitive()
        .setAttribute("POSITION", access(`position${lod}${region}`, "VEC3", new Float32Array([0,0,0, 1,0,0, 0,1,0])))
        .setAttribute("NORMAL", access(`normal${lod}${region}`, "VEC3", normals))
        .setAttribute("COLOR_0", access(`color${lod}${region}`, "VEC3", colors))
        .setAttribute("JOINTS_0", access(`joints${lod}${region}`, "VEC4", joints))
        .setAttribute("WEIGHTS_0", access(`weights${lod}${region}`, "VEC4", weights))
        .setMaterial(doc.createMaterial(`region${lod}${region}`));
      if (target && defect === "missing color") primitive.setAttribute("COLOR_0", null);
      mesh.addPrimitive(primitive);
    }
    const node = doc.createNode(`lod${lod}`).setMesh(mesh).setSkin(skin);
    root.addChild(node);
  }
  const end = defect === "loop" ? [0, .3, 0, Math.sqrt(.91)] : [0,0,0,1];
  const sampler = doc.createAnimationSampler()
    .setInput(access("time", "SCALAR", new Float32Array([0,.5,1])))
    .setOutput(access("rotations", "VEC4", new Float32Array([0,0,0,1, 0,.3,0,Math.sqrt(.91), ...end])));
  doc.createAnimation("idle").addSampler(sampler).addChannel(doc.createAnimationChannel().setSampler(sampler).setTargetNode(bone).setTargetPath("rotation"));
  return new NodeIO().writeBinary(doc);
}

test("surface and loop invariants survive Meshopt on every material and LOD", async () => {
  const raw = await fixture();
  const before = await validateSurfaceContract(raw, spec);
  const optimized = await optimizeAsset(raw, null, spec);
  const after = await validateSurfaceContract(optimized, spec);
  assert.equal(before.triangles, 4);
  assert.equal(after.triangles, before.triangles);
  assert.equal(after.interpolatedTriangles, before.interpolatedTriangles);
  assert.ok(after.skinVertices > 0);
  assert.ok(after.deformation[0].samples >= 17);
  assert.equal(after.deformation[0].loopSeamMeters, 0);
});

for (const [defect, message] of [
  ["color seam", /nonconstant facet color/], ["nonfinite color", /invalid color/],
  ["missing color", /missing color\/normal/], ["normal", /invalid normal/],
  ["winding", /normals oppose triangle winding/],
  ["weights", /unnormalized skin/], ["joint", /invalid joint/], ["loop", /loop seam/],
]) test(`surface gate rejects ${defect} in exported data`, async () => {
  await assert.rejects(() => fixture({ defect }).then((bytes) => validateSurfaceContract(bytes, spec)), message);
});

test("imported sources keep their own surface contract", async () => {
  assert.equal(await validateSurfaceContract(new Uint8Array(), { id: "imported" }), null);
});

test("animated imports get post-LOD deformation checks without procedural recoloring rules", async () => {
  const imported = {...spec, generator: "imported_blend", surfaceAuthoring: undefined};
  const result = await validateSurfaceContract(await fixture({defect: "color seam"}), imported);
  assert.equal(result.deformation.length, 1);
  await assert.rejects(() => fixture({defect: "loop"}).then(bytes => validateSurfaceContract(bytes, imported)), /loop seam/);
});

test("loop seam tolerance is measured in world meters after scaled bind transforms", async () => {
  const result = await validateSurfaceContract(await fixture({defect: "loop", scale: .001}), spec);
  assert.ok(result.deformation[0].loopSeamMeters > .0005);
  assert.ok(result.deformation[0].loopSeamMeters < .001);
});
