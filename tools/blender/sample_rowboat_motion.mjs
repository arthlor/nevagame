/** Sample the runtime-owned oar motion for offline player animation fitting. */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import ts from "typescript";
import { Euler, Matrix4 } from "three";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const output = process.argv[2];
if (!output) throw new Error("Usage: node tools/blender/sample_rowboat_motion.mjs output/<directory>");
const directory = path.resolve(repo, output);
if (!directory.startsWith(path.join(repo, "output") + path.sep)) throw new Error("Samples must stay under output/");
fs.mkdirSync(directory, { recursive: true });
const owner = "src/render/animation/CharacterEquipment.ts";
const source = ts.createSourceFile(owner, fs.readFileSync(path.join(repo, owner), "utf8"), ts.ScriptTarget.Latest, true);
const motion = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "rowboatOarRotation");
if (!motion) throw new Error("Runtime oar motion owner is missing");
const modulePath = path.join(directory, "rowboat-motion.mjs");
fs.writeFileSync(modulePath, ts.transpileModule(motion.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
const { rowboatOarRotation } = await import(pathToFileURL(modulePath).href);
const spec = JSON.parse(fs.readFileSync(path.join(repo, "assets/specs/asset-catalog.json"), "utf8")).assets.find(a => a.id === "char_player_a");
const duration = spec.animationClips.find(a => a.name === "row").durationSeconds;
const frames = [...Array(Math.ceil(duration * 30)).keys(), duration * 30];
fs.writeFileSync(path.join(directory, "stroke-samples.json"), JSON.stringify({
  owner: `${owner}#rowboatOarRotation`, duration,
  frames: frames.map(frame => ({ frame, phase: frame / (duration * 30), rotations: Object.fromEntries(
    ["left", "right"].map(side => [side, new Matrix4().makeRotationFromEuler(rowboatOarRotation(frame / (duration * 30), true, side, new Euler())).toArray()])
  ) }))
}, null, 2) + "\n");
console.log(`Sampled ${frames.length} frames from the runtime oar owner.`);
