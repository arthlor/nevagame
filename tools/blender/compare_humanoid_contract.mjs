/** Decoded source preservation gate. This file never edits or publishes an asset. */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Matrix3, Matrix4, Quaternion, Vector3 } from "three";
import { createNodeIO, ensureMeshoptReady } from "./optimize.mjs";

export function maxArrayError(a, b, quaternion = false) {
  if (a.length !== b.length || ![...a, ...b].every(Number.isFinite)) return Infinity;
  const error = Math.max(0, ...a.map((value, index) => Math.abs(value - b[index])));
  return quaternion ? Math.min(error, Math.max(0, ...a.map((value, index) => Math.abs(value + b[index])))) : error;
}

function bindJoints(document) {
  const result = new Map();
  for (const node of document.getRoot().listNodes()) {
    const skin = node.getSkin();
    if (!skin) continue;
    const inverse = skin.getInverseBindMatrices();
    if (!inverse) throw new Error(`Skin ${skin.getName()} has no inverse bind matrices`);
    const meshWorld = new Matrix4().fromArray(node.getWorldMatrix());
    skin.listJoints().forEach((joint, index) => {
      const bind = meshWorld.clone().multiply(new Matrix4().fromArray(inverse.getElement(index, [])).invert());
      if (result.has(joint.getName()) && maxArrayError(result.get(joint.getName()).bind.elements, bind.elements) > 1e-4) throw new Error(`Inconsistent source bind for ${joint.getName()}`);
      result.set(joint.getName(), { node: joint, bind });
    });
  }
  return result;
}

function transformError(expected, actual) {
  const p = new Vector3(), q = new Quaternion(), s = new Vector3();
  const ap = new Vector3(), aq = new Quaternion(), as = new Vector3();
  expected.decompose(p, q, s); actual.decompose(ap, aq, as);
  return { positionMeters: p.distanceTo(ap), rotationRadians: q.normalize().angleTo(aq.normalize()), relativeScale: Math.max(...s.toArray().map((value, index) => Math.abs(value-as.toArray()[index])/Math.max(Math.abs(value),1e-9))) };
}

function mergeTransformError(result, error) {
  for (const key of Object.keys(error)) result[key]=Math.max(result[key]??0,error[key]);
}

// Original provider inverse binds have small nonorthogonality. Blender's bone
// basis storage normalizes this; preserve position/orientation while bounding
// that measured representation change rather than comparing arbitrary entries.
const validTransformError = (error) => error.positionMeters < 0.0001 && error.rotationRadians < 0.001 && error.relativeScale < 0.002;

function vertex(primitive, index, node, transform) {
  const position = primitive.getAttribute("POSITION");
  const normal = primitive.getAttribute("NORMAL");
  const uv = primitive.getAttribute("TEXCOORD_0");
  const joints = primitive.getAttribute("JOINTS_0");
  const weights = primitive.getAttribute("WEIGHTS_0");
  if (![position, normal, uv, joints, weights].every(Boolean)) throw new Error(`${node.getName()} loses positions, normals, UVs or skin attributes`);
  const world = transform.clone().multiply(new Matrix4().fromArray(node.getWorldMatrix()));
  const jointIndices = joints.getElement(index, []), values = weights.getElement(index, []);
  const skinJoints = node.getSkin().listJoints();
  const skin = values.map((weight, i) => [skinJoints[jointIndices[i]]?.getName(), weight])
    .filter(([, weight]) => weight > 1e-7).sort(([a], [b]) => a.localeCompare(b));
  return {
    position: new Vector3().fromArray(position.getElement(index, [])).applyMatrix4(world).toArray(),
    normal: new Vector3().fromArray(normal.getElement(index, [])).applyMatrix3(new Matrix3().getNormalMatrix(world)).normalize().toArray(),
    uv: uv.getElement(index, []), skin,
    material: primitive.getMaterial()?.getName() ?? "",
    color: primitive.getAttribute("COLOR_0")?.getElement(index, []) ?? null,
    baseColor: primitive.getMaterial()?.getBaseColorFactor() ?? [1, 1, 1, 1]
  };
}

function triangles(node, transform) {
  const result = [];
  for (const primitive of node.getMesh().listPrimitives()) {
    const indices = primitive.getIndices(), count = indices?.getCount() ?? primitive.getAttribute("POSITION").getCount();
    const cache = new Map();
    const at = (index) => {
      const vertexIndex = indices?.getScalar(index) ?? index;
      if (!cache.has(vertexIndex)) cache.set(vertexIndex, vertex(primitive, vertexIndex, node, transform));
      return cache.get(vertexIndex);
    };
    for (let i = 0; i < count; i += 3) result.push([at(i), at(i + 1), at(i + 2)]);
  }
  return result;
}

const cellSize = 0.0001;
const cell = (position) => position.map((v) => Math.floor(v / cellSize));
const key = (value) => value.join(",");

function sampleChannel(sampler, time, rotation) {
  const input = sampler.getInput(), output = sampler.getOutput(), count = input.getCount();
  let index = 0;
  while (index + 1 < count && input.getScalar(index + 1) <= time) index++;
  const next = Math.min(index + 1, count - 1), interpolation = sampler.getInterpolation();
  const cubic = interpolation === "CUBICSPLINE", at = (i) => output.getElement(cubic ? i * 3 + 1 : i, []);
  const a = at(index), b = at(next), span = input.getScalar(next) - input.getScalar(index);
  const t = span > 0 ? Math.max(0, Math.min(1, (time - input.getScalar(index)) / span)) : 0;
  if (interpolation === "STEP" || index === next) return a;
  if (cubic) {
    const outTangent = output.getElement(index * 3 + 2, []), inTangent = output.getElement(next * 3, []);
    const result = a.map((v, i) => (2*t**3-3*t*t+1)*v+(t**3-2*t*t+t)*span*outTangent[i]+(-2*t**3+3*t*t)*b[i]+(t**3-t*t)*span*inTangent[i]);
    return rotation ? new Quaternion().fromArray(result).normalize().toArray() : result;
  }
  if (rotation) return new Quaternion().fromArray(a).slerp(new Quaternion().fromArray(b), t).toArray();
  return a.map((v, i) => v + (b[i] - v) * t);
}

function sampleWorldPose(document, animation, time) {
  const local = new Map(), world = new Map();
  for (const node of document.getRoot().listNodes()) local.set(node, { translation: node.getTranslation(), rotation: node.getRotation(), scale: node.getScale() });
  for (const channel of animation.listChannels()) {
    const property = channel.getTargetPath();
    if (property === "weights") continue;
    local.get(channel.getTargetNode())[property] = sampleChannel(channel.getSampler(), time, property === "rotation");
  }
  const visit = (node) => {
    if (world.has(node)) return world.get(node);
    const pose = local.get(node), parent = node.getParentNode();
    const matrix = new Matrix4().compose(new Vector3().fromArray(pose.translation), new Quaternion().fromArray(pose.rotation), new Vector3().fromArray(pose.scale));
    if (parent) matrix.premultiply(visit(parent));
    world.set(node, matrix); return matrix;
  };
  for (const node of local.keys()) visit(node);
  return new Map([...world].map(([node, matrix]) => [node.getName(), matrix]));
}

/** Validate peaceful performances independently of Blender's action labels. */
export function compareNativeAnimations(source, candidate, clips, transform, repairedLoops = new Map()) {
  const rows = [], sourceJoints = bindJoints(source);
  for (const clip of clips.filter((entry) => entry.motionSource?.kind === "native")) {
    const original = source.getRoot().listAnimations().find((animation) => animation.getName().split("|").at(-1) === clip.motionSource.sourceClip);
    const prepared = candidate.getRoot().listAnimations().find((animation) => animation.getName() === clip.name);
    if (!original || !prepared) { rows.push({ name: clip.name, passed: false, issue: "Missing native source or exported animation" }); continue; }
    const duration = Math.max(...original.listSamplers().map((sampler) => sampler.getInput().getScalar(sampler.getInput().getCount()-1)));
    const outputDuration = Math.max(...prepared.listSamplers().map((sampler) => sampler.getInput().getScalar(sampler.getInput().getCount()-1)));
    const times = new Set([0, duration]);
    for (const sampler of original.listSamplers()) for (const time of sampler.getInput().getArray()) times.add(Number(time));
    let poseError = 0, sampleCount = 0;
    const components = { positionMeters: 0, rotationRadians: 0, relativeScale: 0 };
    const closure = repairedLoops.get(clip.name);
    const closureValid = !closure || (closure.endSeconds - closure.startSeconds <= duration * 0.15 + 1e-5 && Math.abs(closure.endSeconds-duration)<1e-5);
    for (const time of [...times].sort((a,b)=>a-b)) {
      // A source loop repair must declare its bounded terminal window; every
      // earlier source sample still has to preserve the original performance.
      if (closure && time > closure.startSeconds + 1e-5) continue;
      const before = sampleWorldPose(source, original, time), after = sampleWorldPose(candidate, prepared, time);
      for (const name of sourceJoints.keys()) {
        if (!after.has(name)) { poseError = Infinity; continue; }
        const expected=transform.clone().multiply(before.get(name));
        poseError = Math.max(poseError, maxArrayError(expected.elements, after.get(name).elements));
        mergeTransformError(components,transformError(expected,after.get(name)));
      }
      sampleCount++;
    }
    let closureError = 0;
    if (closure) {
      const startPose = sampleWorldPose(candidate, prepared, 0), endPose = sampleWorldPose(candidate, prepared, duration);
      for (const name of sourceJoints.keys()) closureError=Math.max(closureError,maxArrayError(startPose.get(name).elements,endPose.get(name).elements));
    }
    rows.push({ name: clip.name, sourceClip: clip.motionSource.sourceClip, sourceDurationSeconds: duration, exportedDurationSeconds: outputDuration, sampleCount, poseMaxError: poseError, transformError: components, loopClosure: closure ?? null, closureMaxError: closureError, passed: Math.abs(duration-outputDuration)<0.00002 && Number.isFinite(poseError) && validTransformError(components) && closureError<0.001 && closureValid });
  }
  return rows;
}

/** Matches oriented triangles, allowing only export reindexing and float error. */
export function compareTriangleSurfaces(source, candidate, materialMap = {}, palette = {}) {
  const buckets = new Map(), used = new Set();
  candidate.forEach((triangle, index) => triangle.forEach((v, corner) => {
    const id = key(cell(v.position));
    if (!buckets.has(id)) buckets.set(id, []);
    buckets.get(id).push({ index, corner });
  }));
  const errors = { position: 0, normal: 0, normalRadians: 0, uv: 0, weight: 0, color: 0, material: 0, missingTriangles: 0 };
  for (const triangle of source) {
    const center = cell(triangle[0].position), matches = [];
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) matches.push(...(buckets.get(key([center[0]+x, center[1]+y, center[2]+z])) ?? []));
    let best = null;
    for (const match of matches) {
      if (used.has(match.index)) continue;
      const target = candidate[match.index];
      const positionError = Math.max(...triangle.map((v, i) => maxArrayError(v.position, target[(match.corner+i)%3].position)));
      if (positionError > 0.00002) continue;
      const normalError = Math.max(...triangle.map((v, i) => maxArrayError(v.normal, target[(match.corner+i)%3].normal)));
      if (!best || positionError+normalError < best.score) best = { ...match, positionError, normalError, score: positionError+normalError };
    }
    if (!best) { errors.missingTriangles++; continue; }
    used.add(best.index);
    errors.position = Math.max(errors.position, best.positionError);
    errors.normal = Math.max(errors.normal, best.normalError);
    triangle.forEach((v, i) => {
      const target = candidate[best.index][(best.corner+i)%3];
      errors.normalRadians=Math.max(errors.normalRadians,new Vector3().fromArray(v.normal).angleTo(new Vector3().fromArray(target.normal)));
      errors.uv = Math.max(errors.uv, maxArrayError(v.uv, target.uv));
      const sourceWeights = new Map(v.skin), targetWeights = new Map(target.skin);
      for (const name of new Set([...sourceWeights.keys(), ...targetWeights.keys()])) {
        errors.weight = Math.max(errors.weight, Math.abs((sourceWeights.get(name) ?? 0) - (targetWeights.get(name) ?? 0)));
      }
      const expected = materialMap[v.material] ?? v.material;
      if (target.material !== expected) errors.material++;
      if (palette[expected]) {
        const displayed = target.baseColor.slice(0, 3).map((value, channel) => value * (target.color?.[channel] ?? 1));
        errors.color = Math.max(errors.color, maxArrayError(displayed, palette[expected]));
      }
    });
  }
  return { sourceTriangles: source.length, candidateTriangles: candidate.length, ...errors,
    // Blender's split-normal storage introduces sub-degree quantization; this
    // bound is 0.2 degrees and still rejects replacing authored smooth normals.
    passed: source.length === candidate.length && errors.missingTriangles === 0 && errors.normalRadians <= Math.PI/900 && errors.uv <= 0.00002 && errors.weight <= 0.0001 && errors.color <= 0.004 && errors.material === 0 };
}

/** Full source skeleton equality replaces the obsolete fixed donor bone count. */
export function compareDocuments(source, candidate, options = {}) {
  const issues = [], parts = [];
  const sourceJoints = bindJoints(source), candidateJoints = bindJoints(candidate);
  if (!sourceJoints.size || !candidateJoints.size) return { passed: false, issues: ["Missing skinned source or candidate"], parts };
  const first = sourceJoints.keys().next().value;
  if (!candidateJoints.has(first)) return { passed: false, issues: [`Missing source root ${first}`], parts };
  const transform = candidateJoints.get(first).bind.clone().multiply(sourceJoints.get(first).bind.clone().invert());
  const translation = new Vector3(), rotation = new Quaternion(), scale = new Vector3();
  transform.decompose(translation, rotation, scale);
  const reconstructed = new Matrix4().compose(translation, rotation, scale);
  if (Math.min(...scale.toArray()) <= 0 || Math.max(...scale.toArray())-Math.min(...scale.toArray()) > 1e-5 || maxArrayError(transform.elements,reconstructed.elements)>1e-5) issues.push("Source transform is not a uniform scale and coordinate conversion");
  let bindError = 0;
  const bindTransformError={positionMeters:0,rotationRadians:0,relativeScale:0};
  for (const [name, entry] of sourceJoints) {
    const target = candidateJoints.get(name);
    if (!target) { issues.push(`Source deforming joint removed: ${name}`); continue; }
    const sourceParent = entry.node.getParentNode()?.getName();
    if (sourceJoints.has(sourceParent) && target.node.getParentNode()?.getName() !== sourceParent) issues.push(`Source joint parent changed: ${name}`);
    const expected=transform.clone().multiply(entry.bind);
    bindError = Math.max(bindError, maxArrayError(expected.elements, target.bind.elements));
    mergeTransformError(bindTransformError,transformError(expected,target.bind));
  }
  if (!validTransformError(bindTransformError)) issues.push(`Source bind transforms changed: ${JSON.stringify(bindTransformError)}`);
  const candidates = candidate.getRoot().listNodes().filter((node) => node.getMesh() && node.getSkin());
  const originalNodes = options.sourceNodes ?? source.getRoot().listNodes().filter((node) => node.getMesh() && node.getSkin());
  for (const node of originalNodes) {
    if (options.omittedParts?.includes(node.getName())) continue;
    const expectedName = options.assetId ? `${options.assetId}_${node.getName().replace(/[^A-Za-z0-9_]/g,"_")}_LOD0` : node.getName();
    const target = candidates.find((candidateNode) => candidateNode.getName() === expectedName);
    if (!target) { issues.push(`Source mesh missing: ${node.getName()} -> ${expectedName}`); continue; }
    const mapping = Object.fromEntries(Object.entries(options.materialMap ?? {}).filter(([name]) => name.startsWith(`${node.getName()}/`)).map(([name, token]) => [name.slice(node.getName().length+1),token]));
    const originalTriangles=triangles(node, transform);
    const removed=new Set();
    for (const deletion of options.removedDegenerateTriangles??[]) {
      if (deletion.part!==node.getName()) continue;
      const triangle=originalTriangles[deletion.triangleIndex];
      if (!triangle) {issues.push(`Unknown declared source triangle ${node.getName()}/${deletion.triangleIndex}`);continue;}
      const [a,b,c]=triangle.map((corner)=>new Vector3().fromArray(corner.position));
      const area=new Vector3().subVectors(b,a).cross(new Vector3().subVectors(c,a)).length()/2;
      if (area>=1e-8) {issues.push(`Declared cleanup removes visible triangle ${node.getName()}/${deletion.triangleIndex}`);continue;}
      removed.add(deletion.triangleIndex);
    }
    const report = compareTriangleSurfaces(originalTriangles.filter((_,index)=>!removed.has(index)),triangles(target,new Matrix4()),mapping,options.palette);
    report.removedSourceDegenerateTriangles=[...removed];
    parts.push({ sourcePart: node.getName(), candidatePart: target.getName(), ...report });
    if (!report.passed) issues.push(`Source surface differs: ${node.getName()}`);
  }
  return { passed: issues.length===0, issues, sourceJointCount: sourceJoints.size, candidateJointCount: candidateJoints.size, uniformScale: scale.x, sourceToCandidate: transform.toArray(), bindMaxError:bindError,bindTransformError,parts };
}

async function main() {
  const args = process.argv.slice(2), argument = (name) => { const i=args.indexOf(name); return i>=0 ? args[i+1] : undefined; };
  const assetId=argument("--asset"), candidatePath=argument("--candidate"), reportPath=argument("--report");
  if (!assetId || !candidatePath || !reportPath) throw new Error("Usage: node tools/blender/compare_humanoid_contract.mjs --asset ID --candidate model.glb --report report.json");
  const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
  const spec=JSON.parse(fs.readFileSync(path.join(repo,"assets/specs/asset-catalog.json"),"utf8")).assets.find((asset)=>asset.id===assetId);
  if (!spec?.humanoidAuthoring) throw new Error(`No immutable source for ${assetId}`);
  await ensureMeshoptReady(); const io=createNodeIO();
  const source=await io.read(path.join(repo,spec.humanoidAuthoring.sourceFile)), candidate=await io.read(candidatePath);
  const nodes=source.getRoot().listNodes().filter((node)=>node.getMesh()&&node.getSkin());
  if (spec.humanoidAuthoring.headSourceFile) {
    const head=await io.read(path.join(repo,spec.humanoidAuthoring.headSourceFile));
    nodes.splice(0,nodes.length,...nodes.filter((node)=>!node.getName().includes("Head")),...head.getRoot().listNodes().filter((node)=>node.getMesh()&&node.getName().includes("Head")));
  }
  const preparationPath=argument("--preparation")??candidatePath.replace(/\.glb$/,".report.json");
  const preparation=fs.existsSync(preparationPath)?JSON.parse(fs.readFileSync(preparationPath,"utf8")):null;
  const materialMap=spec.humanoidAuthoring.materialMap??preparation?.materials;
  if (!materialMap) throw new Error("Explicit source material map is missing");
  const paletteSource=JSON.parse(fs.readFileSync(path.join(repo,"art/palettes/neva.palette.json"),"utf8"));
  const linear=(value)=>value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4;
  const palette=Object.fromEntries(Object.entries(paletteSource.tokens ?? paletteSource).filter(([,value])=>value?.hex).map(([name,value])=>[name,[1,3,5].map((start)=>linear(parseInt(value.hex.slice(start,start+2),16)/255))]));
  const report=compareDocuments(source,candidate,{assetId,sourceNodes:nodes,omittedParts:spec.humanoidAuthoring.omitParts,materialMap,palette,removedDegenerateTriangles:preparation?.sourceCleanup?.removedDegenerateTriangles});
  const sha256=(file)=>createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  report.inputs={sourceFile:spec.humanoidAuthoring.sourceFile,sourceSha256:sha256(path.join(repo,spec.humanoidAuthoring.sourceFile)),candidateSha256:sha256(candidatePath)};
  if(report.inputs.sourceSha256!==spec.humanoidAuthoring.sourceSha256)report.issues.push("Immutable source hash differs from catalog");
  if(spec.humanoidAuthoring.headSourceFile){
    report.inputs.headSourceSha256=sha256(path.join(repo,spec.humanoidAuthoring.headSourceFile));
    if(report.inputs.headSourceSha256!==spec.humanoidAuthoring.headSourceSha256)report.issues.push("Immutable head source hash differs from catalog");
  }
  if (report.sourceToCandidate) {
    const closures=new Map(preparation?.motions?.filter((motion)=>motion.sourceRunLoopClosure).map((motion)=>[motion.name,{startSeconds:motion.loopClosureStartSeconds ?? motion.durationSeconds,endSeconds:motion.loopClosureEndSeconds ?? motion.durationSeconds}]) ?? []);
    report.nativeAnimations=compareNativeAnimations(source,candidate,[...spec.animationClips,...(spec.additionalAnimationClips??[])],new Matrix4().fromArray(report.sourceToCandidate),closures);
    for (const motion of report.nativeAnimations) if (!motion.passed) report.issues.push(`Source performance differs: ${motion.name}`);
    report.passed=report.issues.length===0;
  }
  fs.mkdirSync(path.dirname(reportPath),{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify({assetId,passed:report.passed,issues:report.issues,parts:report.parts.map((part)=>({name:part.sourcePart,passed:part.passed,normal:part.normal,uv:part.uv,weight:part.weight,material:part.material,missingTriangles:part.missingTriangles}))},null,2));
  if (!report.passed) process.exitCode=1;
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) main().catch((error)=>{console.error(error);process.exitCode=1;});
