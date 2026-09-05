import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Matrix4, Quaternion, Vector3 } from "three";
import { createNodeIO, ensureMeshoptReady } from "./optimize.mjs";

export const SOURCE_HUMANOID_BONES = Object.freeze({
  root: "Root", pelvis: "Body", hips: "Hips", spine: "Abdomen", spine_02: "Torso",
  chest: "Chest", neck: "Neck", head: "Head",
  clavicle_left: "Shoulder.L", upper_arm_left: "UpperArm.L", forearm_left: "LowerArm.L", hand_left: "Wrist.L",
  clavicle_right: "Shoulder.R", upper_arm_right: "UpperArm.R", forearm_right: "LowerArm.R", hand_right: "Wrist.R",
  thigh_left: "UpperLeg.L", shin_left: "LowerLeg.L", foot_left: "Foot.L",
  thigh_right: "UpperLeg.R", shin_right: "LowerLeg.R", foot_right: "Foot.R"
});

const vector = (values) => new Vector3().fromArray(values);
const worldPosition = (node) => vector(node.getWorldTranslation());
const worldMatrix = (node) => new Matrix4().fromArray(node.getWorldMatrix());
const localPoint = (node, point) => point.clone().applyMatrix4(worldMatrix(node).invert()).toArray();

/** Extract the FINAL exported coordinate frames, including armature scale. */
export function extractHumanoidBinding(document) {
  const nodes = document.getRoot().listNodes();
  const byName = new Map(nodes.map((node) => [node.getName(), node]));
  const requireNode = (name) => {
    const node = byName.get(name);
    if (!node) throw new Error(`Humanoid bind extraction: missing ${name}`);
    return node;
  };
  for (const name of Object.values(SOURCE_HUMANOID_BONES)) requireNode(name);
  const legs = {};
  const arms = {};
  const grips = {};
  for (const side of ["left", "right"]) {
    const sign = side === "left" ? 1 : -1;
    const foot = requireNode(SOURCE_HUMANOID_BONES[`foot_${side}`]);
    const shin = requireNode(SOURCE_HUMANOID_BONES[`shin_${side}`]);
    let soleY = Infinity;
    let weightedVertices = 0;
    for (const node of nodes) {
      if (!node.getMesh() || !node.getSkin() || node.getName().includes("LOD1")) continue;
      const jointIndex = node.getSkin().listJoints().indexOf(foot);
      if (jointIndex < 0) continue;
      const meshWorld = worldMatrix(node);
      for (const primitive of node.getMesh().listPrimitives()) {
        const positions = primitive.getAttribute("POSITION");
        if (!positions) continue;
        const channels = [0, 1].map((index) => ({
          joints: primitive.getAttribute(`JOINTS_${index}`), weights: primitive.getAttribute(`WEIGHTS_${index}`)
        })).filter((channel) => channel.joints && channel.weights);
        for (let index = 0; index < positions.getCount(); index += 1) {
          let weight = 0;
          for (const channel of channels) {
            const joints = channel.joints.getElement(index, []);
            const weights = channel.weights.getElement(index, []);
            for (let slot = 0; slot < joints.length; slot += 1) if (joints[slot] === jointIndex) weight += weights[slot];
          }
          if (weight < 0.05) continue;
          const point = vector(positions.getElement(index, [])).applyMatrix4(meshWorld);
          soleY = Math.min(soleY, point.y);
          weightedVertices += 1;
        }
      }
    }
    if (!weightedVertices || !Number.isFinite(soleY)) throw new Error(`Humanoid bind extraction: ${side} foot has no weighted sole geometry`);
    const ankle = worldPosition(foot);
    const sole = ankle.clone();
    sole.y = soleY;
    const footWorldRotation = new Quaternion().fromArray(foot.getWorldRotation());
    legs[side] = {
      shinTip: localPoint(shin, ankle),
      soleOffset: localPoint(foot, sole),
      soleNormal: new Vector3(0, 1, 0).applyQuaternion(footWorldRotation.invert()).normalize().toArray(),
      bendDirection: new Vector3(sign * 0.14, 0, 1).normalize().toArray()
    };
    const upper = worldPosition(requireNode(SOURCE_HUMANOID_BONES[`upper_arm_${side}`]));
    const elbow = worldPosition(requireNode(SOURCE_HUMANOID_BONES[`forearm_${side}`]));
    const wrist = worldPosition(requireNode(SOURCE_HUMANOID_BONES[`hand_${side}`]));
    const axis = wrist.clone().sub(upper).normalize();
    const bend = elbow.clone().sub(upper);
    bend.addScaledVector(axis, -bend.dot(axis));
    // Straight source arms do not define a stable elbow plane. Prefer elbows
    // outside the torso and behind the palms, not a name-derived bone axis.
    if (bend.lengthSq() < 0.0004) bend.set(sign * 0.7, 0, -1);
    arms[side] = { bendDirection: bend.normalize().toArray() };
    const socket = nodes.find((node) => node.getName().endsWith(`hand_socket_${side}`));
    if (!socket) throw new Error(`Humanoid bind extraction: missing ${side} palm socket`);
    if (socket.getParentNode() !== requireNode(SOURCE_HUMANOID_BONES[`hand_${side}`])) {
      throw new Error(`Humanoid bind extraction: ${socket.getName()} must be parented to its semantic wrist`);
    }
    const wristRotation = new Quaternion().fromArray(requireNode(SOURCE_HUMANOID_BONES[`hand_${side}`]).getWorldRotation()).normalize();
    const palmRotation = new Quaternion().fromArray(socket.getWorldRotation()).normalize();
    const fingerDot = new Vector3(0, 1, 0).applyQuaternion(wristRotation).dot(new Vector3(0, 1, 0).applyQuaternion(palmRotation));
    const inwardDot = new Vector3(0, 0, -1).applyQuaternion(wristRotation).dot(new Vector3(0, 0, 1).applyQuaternion(palmRotation));
    if (fingerDot < 0.99995 || inwardDot < 0.99995) {
      throw new Error(`Humanoid bind extraction: ${socket.getName()} exported anatomical axes disagree with wrist (fingers ${fingerDot}, inward ${inwardDot})`);
    }
    grips[side] = socket.getName();
  }
  return { bones: { ...SOURCE_HUMANOID_BONES }, forwardAxis: "+Z", legs, arms, grips };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [input, output] = process.argv.slice(2);
  if (!input) throw new Error("Usage: node tools/blender/extract_humanoid_binding.mjs input.glb [output.json]");
  await ensureMeshoptReady();
  const binding = extractHumanoidBinding(await createNodeIO().read(input));
  const json = `${JSON.stringify(binding, null, 2)}\n`;
  if (output) await fs.writeFile(output, json);
  else process.stdout.write(json);
}
