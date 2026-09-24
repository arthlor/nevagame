/**
 * Sample the published companions the player's clips must meet, for offline authoring.
 *
 *   node tools/blender/sample_player_companions.mjs output/<directory>
 *
 * Writes `companions.json` for `author_player_performances.py --companions`: the
 * rowboat's seat, footrests and oar grips through the runtime stroke; the skiff's
 * stations, footrests and helm grips; the donkey's stirrups and reins relative to
 * its rider socket through each gait; and the default rod's grips. Everything is
 * read from the published GLBs through the runtime loader and the runtime oar
 * owner, then expressed in the player's armature axes (+X left, -Y forward, +Z up,
 * metres) relative to the anchor the player is attached to.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { AnimationMixer, Box3, Euler, Group, Matrix4, Quaternion, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "meshoptimizer";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const output = process.argv[2];
if (!output) throw new Error("Usage: node tools/blender/sample_player_companions.mjs output/<directory>");
const directory = path.resolve(repo, output);
if (!directory.startsWith(path.join(repo, "output") + path.sep)) throw new Error("Samples must stay under output/");
fs.mkdirSync(directory, { recursive: true });

// The runtime owns the oar stroke; transpile that one function rather than copying it.
const owner = "src/render/animation/CharacterEquipment.ts";
const source = ts.createSourceFile(owner, fs.readFileSync(path.join(repo, owner), "utf8"), ts.ScriptTarget.Latest, true);
const stroke = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "rowboatOarRotation");
if (!stroke) throw new Error("Runtime oar motion owner is missing");
const strokePath = path.join(directory, "rowboat-oar-motion.mjs");
fs.writeFileSync(strokePath, ts.transpileModule(stroke.getText(source), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
}).outputText);
const { rowboatOarRotation } = await import(pathToFileURL(strokePath).href);

await MeshoptDecoder.ready;
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  .register(() => ({ name: "neva_skip_textures", loadTexture: () => Promise.resolve(null) }));
async function load(id) {
  const bytes = fs.readFileSync(path.join(repo, "public/assets/models", `${id}.glb`));
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
  const root = new Group();
  root.add(gltf.scene);
  root.updateMatrixWorld(true);
  return { root, clips: gltf.animations };
}
function node(root, name) {
  const found = root.getObjectByName(name);
  if (!found) throw new Error(`Missing node ${name}`);
  return found;
}
/** A node's frame relative to an anchor, in the player's armature axes. */
function relative(anchor, target) {
  anchor.updateWorldMatrix(true, false);
  target.updateWorldMatrix(true, false);
  const local = new Matrix4().copy(anchor.matrixWorld).invert().multiply(target.matrixWorld);
  const position = new Vector3(), rotation = new Quaternion(), scale = new Vector3();
  local.decompose(position, rotation, scale);
  // glTF (x, y up, z forward) -> armature (x, -z, y).
  const toArmature = (v) => [v.x, -v.z, v.y];
  const axis = (x, y, z) => toArmature(new Vector3(x, y, z).applyQuaternion(rotation));
  return {
    position: toArmature(position),
    // The node's own glTF axes, in armature axes. For a palm-frame grip, +Y is
    // the fingers and +Z the palm contact normal (into the handle); for a
    // support socket +Y is the sole's contact normal.
    x: axis(1, 0, 0), y: axis(0, 1, 0), z: axis(0, 0, 1)
  };
}

const result = { source: "published GLBs", generatedBy: "tools/blender/sample_player_companions.mjs" };

{
  const { root } = await load("boat_rowboat_a");
  const seat = node(root, "boat_rowboat_rower_seat");
  const oars = {};
  for (const side of ["left", "right"]) {
    const oar = node(root, `boat_rowboat_oar_${side}_root`);
    const lock = node(root, `boat_rowboat_oarlock_${side}`);
    const grip = node(root, `boat_rowboat_oar_${side}_grip`);
    const pivot = new Group();
    oar.parent.add(pivot);
    pivot.position.copy(oar.parent.worldToLocal(lock.getWorldPosition(new Vector3())));
    pivot.updateMatrixWorld(true);
    pivot.attach(oar);
    const strokeFrames = [];
    for (let i = 0; i <= 60; i += 1) {
      pivot.rotation.copy(rowboatOarRotation(i / 60, true, side, new Euler()));
      pivot.updateMatrixWorld(true);
      strokeFrames.push({ phase: i / 60, ...relative(seat, grip) });
    }
    pivot.rotation.set(0, 0, 0);
    pivot.updateMatrixWorld(true);
    oars[side] = { rest: relative(seat, grip), lock: relative(seat, lock).position, stroke: strokeFrames };
  }
  result.rowboat = {
    anchor: "boat_rowboat_rower_seat",
    anchorInRoot: relative(root, seat),
    feet: Object.fromEntries(["left", "right"].map((side) => [side, relative(seat, node(root, `boat_rowboat_foot_${side}_socket`))])),
    oars
  };
}

{
  const { root } = await load("boat_skiff_a");
  const driver = node(root, "boat_skiff_driver_station");
  const fishing = node(root, "boat_skiff_fishing_station");
  result.skiff = {
    driver: {
      anchor: "boat_skiff_driver_station",
      anchorInRoot: relative(root, driver),
      feet: Object.fromEntries(["left", "right"].map((side) => [side, relative(driver, node(root, `boat_skiff_foot_${side}_socket`))])),
      helm: { right: relative(driver, node(root, "boat_skiff_helm_grip")), left: relative(driver, node(root, "boat_skiff_helm_grip_left")) }
    },
    fishing: {
      anchor: "boat_skiff_fishing_station",
      feet: Object.fromEntries(["left", "right"].map((side) => [side, relative(fishing, node(root, `boat_skiff_foot_${side}_socket`))]))
    }
  };
}

{
  const { root, clips } = await load("fauna_donkey_a");
  const rider = node(root, "fauna_donkey_a_rider_socket");
  const mixer = new AnimationMixer(root);
  const donkeyRoot = root.children[0];
  const gaits = {};
  for (const name of ["idle", "walk", "trot", "gallop", "mount", "dismount"]) {
    const clip = clips.find((candidate) => candidate.name === name);
    if (!clip) throw new Error(`Donkey clip ${name} is missing`);
    mixer.stopAllAction();
    const action = mixer.clipAction(clip);
    action.reset().play();
    const frames = [];
    for (let i = 0; i <= 32; i += 1) {
      action.time = (i / 32) * clip.duration;
      mixer.update(0);
      root.updateMatrixWorld(true);
      frames.push({
        phase: i / 32,
        rider: relative(donkeyRoot, rider),
        stirrups: Object.fromEntries(["left", "right"].map((side) => [side, relative(rider, node(root, `fauna_donkey_a_stirrup_${side}_socket`))])),
        reins: Object.fromEntries(["left", "right"].map((side) => [side, relative(rider, node(root, `fauna_donkey_a_rein_grip_${side}`))]))
      });
    }
    gaits[name] = { duration: clip.duration, frames };
  }
  mixer.stopAllAction();
  root.updateMatrixWorld(true);
  result.donkey = { anchor: "fauna_donkey_a_rider_socket", anchorInRoot: relative(root, rider), gaits };
}

{
  const { root } = await load("tool_fishing_rod_a");
  const primary = node(root, "rod_primary_grip");
  // The runtime docks the rod's primary palm frame to the hand at this scale.
  const attach = fs.readFileSync(path.join(repo, "src/render/assets/ToolSocketAttach.ts"), "utf8");
  const scale = Number(attach.match(/TOOL_FISHING_ROD_A\]:\s*\{[^}]*scale:\s*([0-9.]+)/)?.[1]);
  if (!Number.isFinite(scale)) throw new Error("ToolSocketAttach no longer declares the fishing rod's scale");
  // In the primary palm frame's own glTF axes (x thumb, y fingers, z palm contact).
  const local = (target) => {
    const m = new Matrix4().copy(primary.matrixWorld).invert().multiply(target.matrixWorld);
    const p = new Vector3(), q = new Quaternion(), k = new Vector3();
    m.decompose(p, q, k);
    const axis = (x, y, z) => new Vector3(x, y, z).applyQuaternion(q).toArray();
    return { position: p.toArray(), x: axis(1, 0, 0), y: axis(0, 1, 0), z: axis(0, 0, 1) };
  };
  const spoolCenter = new Box3().setFromObject(node(root, "rod_reel_spool")).getCenter(new Vector3());
  const centerInGrip = primary.worldToLocal(spoolCenter);
  const rootInGrip = primary.getWorldQuaternion(new Quaternion()).invert().multiply(root.getWorldQuaternion(new Quaternion()));
  result.rod = {
    scale,
    secondary: relative(primary, node(root, "rod_secondary_grip")),
    lineExit: relative(primary, node(root, "rod_line_exit")),
    inGripFrame: {
      secondary: local(node(root, "rod_secondary_grip")), lineExit: local(node(root, "rod_line_exit")),
      reelCenter: centerInGrip.toArray(), reelAxis: new Vector3(1, 0, 0).applyQuaternion(rootInGrip).toArray()
    }
  };
}

fs.writeFileSync(path.join(directory, "companions.json"), JSON.stringify(result, null, 1) + "\n");
console.log(`Wrote ${path.relative(repo, path.join(directory, "companions.json"))}`);
