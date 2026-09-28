import fs from "node:fs";
import path from "node:path";
import { AnimationMixer, LoopOnce, Quaternion, Vector3 } from "three";
import { withoutTextures } from "./glb.mjs";

/** Source-relative gate for retained rigs; never treats native capture defects as newly authored motion. */
export async function nativeNpcContract(spec, gltf, loader) {
  const clips = spec.animationClips ?? [];
  if (!spec.skinnedAuthoring?.uniformScale || !clips.every(clip => clip.motionSource?.kind === "native")) return null;
  // The retained source embeds its texture; the rig check never reads pixels.
  const bytes = withoutTextures(fs.readFileSync(path.resolve(spec.skinnedAuthoring.sourceFile)));
  const source = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
  const scale = spec.skinnedAuthoring.uniformScale;
  const fail = message => { throw new Error(`${spec.id}: native NPC fidelity: ${message}`); };
  const sourceNames = source.animations.map(clip => clip.name).sort();
  const declaredNames = clips.map(clip => clip.motionSource.sourceClip).sort();
  if (JSON.stringify(sourceNames) !== JSON.stringify(declaredNames)
    || JSON.stringify(clips.map(clip => clip.name).sort()) !== JSON.stringify(gltf.animations.map(clip => clip.name).sort())) {
    fail("source animation library changed");
  }
  const sourceBones = [];
  source.scene.traverse(node => { if (node.isBone) sourceBones.push(node); });
  const targetBones = [];
  gltf.scene.traverse(node => { if (node.isBone) targetBones.push(node); });
  if (sourceBones.length !== targetBones.length) fail("source joint count changed");
  const pairs = sourceBones.map(bone => {
    const target = gltf.scene.getObjectByName(bone.name);
    if (!target?.isBone || (bone.parent?.isBone && target.parent?.name !== bone.parent.name)) fail(`source hierarchy changed at ${bone.name}`);
    return [bone, target];
  });
  // UVs are retained by the adapter. Compare named-joint weights independently
  // of Blender's vertex/split-normal ordering and Meshopt's packing.
  const weights = mesh => {
    const geometry = mesh.geometry, uv = geometry.getAttribute("uv"), joint = geometry.getAttribute("skinIndex"), weight = geometry.getAttribute("skinWeight");
    return Array.from({length: uv.count}, (_, i) => ({
      key: `${Math.round(uv.getX(i)*1e5)},${Math.round(uv.getY(i)*1e5)}`,
      weights: Array.from({length:4}, (_, j) => [mesh.skeleton.bones[joint.array[i*4+j]].name, weight.array[i*4+j]])
        .filter(([,w]) => w > 1e-5).sort(([a],[b]) => a.localeCompare(b))
    }));
  };
  const sourceMeshes=[]; source.scene.traverse(node => { if(node.isSkinnedMesh) sourceMeshes.push(node); });
  const body = gltf.scene.getObjectByName(`${spec.id}_body`);
  if (!body?.isSkinnedMesh || sourceMeshes.length !== 1) fail("expected a retained source skin");
  const byUv = new Map(weights(sourceMeshes[0]).map(vertex => [vertex.key,vertex.weights]));
  for (const vertex of weights(body)) {
    const original = byUv.get(vertex.key);
    if (!original || original.length !== vertex.weights.length || original.some(([bone,w],i) => bone !== vertex.weights[i][0] || Math.abs(w-vertex.weights[i][1]) > .0001)) fail(`source weights changed at UV ${vertex.key}`);
  }
  const bindRotations = pairs.map(([sourceBone, targetBone]) => {
    const originalSkin = sourceMeshes[0].skeleton, targetSkin = body.skeleton;
    return [
      new Quaternion().setFromRotationMatrix(originalSkin.boneInverses[originalSkin.bones.indexOf(sourceBone)]).normalize(),
      new Quaternion().setFromRotationMatrix(targetSkin.boneInverses[targetSkin.bones.indexOf(targetBone)]).normalize()
    ];
  });
  const mixer = new AnimationMixer(source.scene);
  const a = new Vector3(), b = new Vector3(), qa = new Quaternion(), qb = new Quaternion();
  let sourceAction = null;
  return {
    body,
    begin(clip) {
      mixer.stopAllAction();
      const contract=clips.find(c=>c.name===clip.name);
      const original=source.animations.find(c=>c.name===contract?.motionSource.sourceClip);
      if (!original || Math.abs(original.duration-clip.duration)>.0001) fail(`${clip.name} source timing changed`);
      sourceAction=mixer.clipAction(original).setLoop(LoopOnce,1);
      sourceAction.clampWhenFinished=true; sourceAction.play();
    },
    sample(time) {
      mixer.setTime(time); source.scene.updateMatrixWorld(true);
      for(const [index, [sourceBone,targetBone]] of pairs.entries()){
        sourceBone.getWorldPosition(a).multiplyScalar(scale); targetBone.getWorldPosition(b);
        sourceBone.getWorldQuaternion(qa).multiply(bindRotations[index][0]).normalize(); targetBone.getWorldQuaternion(qb).multiply(bindRotations[index][1]).normalize();
        if(a.distanceTo(b)>.0002 || qa.angleTo(qb)>.001) fail(`${targetBone.name} source performance changed at ${time}`);
      }
    },
    dispose(){mixer.stopAllAction();mixer.uncacheRoot(source.scene);}
  };
}
