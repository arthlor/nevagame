#!/usr/bin/env node
/**
 * Summarise a V8 `.cpuprofile` captured from a production bundle (for example
 * `NEVA_PERF_CPU_PROFILE=1 npm run perf:baseline` against a `--sourcemap`
 * build). Frames are mapped back to original source functions through the
 * build's `.map` files, then reported by self and inclusive time.
 *
 *   node tools/perf/cpu-profile-summary.mjs <profile.cpuprofile> <dist-dir> [--top 30] [--focus name]
 *
 * `--focus` limits the report to samples whose stack contains that source
 * function (for example `render` or `update`), so one phase can be read alone.
 */
import fs from "node:fs";
import path from "node:path";
import { SourceMapConsumer } from "source-map-js";

const [profilePath, distDirectory] = process.argv.slice(2);
if (!profilePath || !distDirectory) {
  console.error("usage: cpu-profile-summary.mjs <profile.cpuprofile> <dist-dir> [--top N] [--focus function]");
  process.exit(2);
}
const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
};
const top = Number(option("--top", 30));
const focus = option("--focus", null);

const profile = JSON.parse(fs.readFileSync(profilePath, "utf8"));
const consumers = new Map();
function consumerFor(url) {
  if (consumers.has(url)) return consumers.get(url);
  let consumer = null;
  const match = url.match(/\/assets\/([^/?#]+\.js)/);
  if (match) {
    const mapPath = path.join(distDirectory, "assets", `${match[1]}.map`);
    if (fs.existsSync(mapPath)) consumer = new SourceMapConsumer(JSON.parse(fs.readFileSync(mapPath, "utf8")));
  }
  consumers.set(url, consumer);
  return consumer;
}

const labels = new Map();
function labelOf(node) {
  if (labels.has(node.id)) return labels.get(node.id);
  const frame = node.callFrame;
  let label = frame.functionName ? `${frame.functionName} (${frame.url.replace(/^.*\//, "") || "native"})` : `(${frame.url ? "anonymous" : "program"})`;
  const consumer = frame.url ? consumerFor(frame.url) : null;
  if (consumer && frame.lineNumber >= 0) {
    const original = consumer.originalPositionFor({ line: frame.lineNumber + 1, column: frame.columnNumber });
    if (original.source) {
      const source = original.source.replace(/^.*?\/(src|node_modules)\//, "$1/");
      label = `${original.name ?? frame.functionName ?? "(anonymous)"} ${source}:${original.line}`;
    }
  }
  labels.set(node.id, label);
  return label;
}

const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
const parent = new Map();
for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id);
const selfTime = new Map();
profile.samples.forEach((id, index) => selfTime.set(id, (selfTime.get(id) ?? 0) + (profile.timeDeltas[index] ?? 0)));

const selfByLabel = new Map();
const inclusiveByLabel = new Map();
let total = 0;
for (const [id, microseconds] of selfTime) {
  const stack = [];
  for (let current = id; current !== undefined; current = parent.get(current)) stack.push(labelOf(nodes.get(current)));
  if (focus && !stack.some((label) => label.startsWith(`${focus} `))) continue;
  total += microseconds;
  selfByLabel.set(stack[0], (selfByLabel.get(stack[0]) ?? 0) + microseconds);
  for (const label of new Set(stack)) inclusiveByLabel.set(label, (inclusiveByLabel.get(label) ?? 0) + microseconds);
}
const durationMs = (profile.endTime - profile.startTime) / 1000;
const rows = (map) => [...map.entries()].sort((left, right) => right[1] - left[1]).slice(0, top)
  .map(([label, microseconds]) => `${(100 * microseconds / total).toFixed(1).padStart(5)}%  ${(microseconds / 1000 / durationMs * 1000).toFixed(2).padStart(7)} ms/s  ${label}`);
console.info(`profile ${path.basename(profilePath)}: ${durationMs.toFixed(1)} ms wall, ${(total / 1000).toFixed(1)} ms sampled${focus ? ` under ${focus}` : ""}`);
console.info("--- self ---");
console.info(rows(selfByLabel).join("\n"));
console.info("--- inclusive ---");
console.info(rows(inclusiveByLabel).join("\n"));
