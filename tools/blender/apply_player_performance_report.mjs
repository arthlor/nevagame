/**
 * Apply an `author_player_performances.py` report to the player's catalog clips.
 *
 *   node tools/blender/apply_player_performance_report.mjs output/<dir>/char_player_a-performance-report.json
 *
 * Writes only the fields the recipes own (duration, loop, reference speed,
 * contact intervals, footstep events and the authored motion source) for the
 * clips in the report, and the adapted library's provenance digest when the
 * report's output library has been promoted to the catalog's source path.
 * Commit markers and every other clip field stay as the catalog has them.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const reportPath = process.argv[2];
if (!reportPath) throw new Error("Usage: node tools/blender/apply_player_performance_report.mjs <report.json>");
const report = JSON.parse(fs.readFileSync(path.resolve(repo, reportPath), "utf8"));
const catalogPath = path.join(repo, "assets/specs/asset-catalog.json");
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const asset = catalog.assets.find((entry) => entry.id === report.assetId);
if (!asset) throw new Error(`Catalog has no ${report.assetId}`);
const clips = new Map([...(asset.animationClips ?? []), ...(asset.additionalAnimationClips ?? [])]
  .map((clip) => [clip.name, clip]));
const updated = [];
for (const [name, metrics] of Object.entries(report.clips)) {
  const clip = clips.get(name);
  if (!clip) throw new Error(`${name} is not a catalog clip of ${report.assetId}`);
  const fields = metrics.catalog;
  if (clip.loop !== fields.loop) throw new Error(`${name}: recipe loop ${fields.loop} differs from the catalog`);
  if (clip.commitMarkerSeconds !== undefined && clip.commitMarkerSeconds >= fields.durationSeconds) {
    throw new Error(`${name}: the commit marker must stay inside the recipe's duration`);
  }
  clip.durationSeconds = fields.durationSeconds;
  if (fields.referenceSpeedMetersPerSecond !== undefined) clip.referenceSpeedMetersPerSecond = fields.referenceSpeedMetersPerSecond;
  if (fields.events !== undefined) clip.events = fields.events;
  clip.contacts = fields.contacts;
  clip.motionSource = fields.motionSource;
  updated.push(name);
}
const source = path.join(repo, asset.parameters.sourceBlend);
const digest = crypto.createHash("sha256").update(fs.readFileSync(source)).digest("hex");
const promoted = digest === report.outputSha256;
if (promoted) asset.sourceProvenance.sourceSha256 = digest;
fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + "\n");
console.log(`Updated ${updated.length} ${report.assetId} clips${promoted ? " and the source digest" : "; the source library is not the report's output, digest unchanged"}.`);
