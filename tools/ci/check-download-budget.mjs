// tools/ci/check-download-budget.mjs
//
// The asset catalog has always declared `downloadBudgetBytes` and nothing has
// ever enforced it, which is how dist reached ~5x the declared figure.
//
// Two different numbers matter and conflating them would make this gate lie:
//
//   1. The CODE bundle (html + entry js + css). This is unambiguously part of
//      the initial download and is gated hard against `downloadBudgetBytes`.
//   2. TOTAL dist. Audio, models and UI atlas pages are fetched on demand or
//      during the boot preload, so total dist is NOT the initial download and
//      cannot be compared to `downloadBudgetBytes` directly. It is ratcheted
//      instead: it may shrink freely, but growth past the committed baseline
//      fails.
//
// The ratchet is deliberate. A hard 20 MB gate on total dist would be red on
// its first run and would train everyone to ignore it. The ratchet blocks
// regression today and tightens as the UI atlas duplication is removed.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DIST = path.join(ROOT, "dist");
const BASELINE_PATH = path.join(ROOT, "tools/ci/download-budget.baseline.json");

const MB = 1024 * 1024;
const mb = (bytes) => `${(bytes / MB).toFixed(2)} MB`;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push({ path: full, size: statSync(full).size });
  }
  return out;
}

function main() {
  if (!existsSync(DIST)) {
    console.error("[NEVA BUDGET] dist/ not found — run the build first.");
    process.exitCode = 1;
    return;
  }

  const catalog = JSON.parse(
    readFileSync(path.join(ROOT, "assets/specs/asset-catalog.json"), "utf8")
  );
  const declaredBudget = catalog.downloadBudgetBytes;
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));

  const files = walk(DIST);
  const total = files.reduce((sum, file) => sum + file.size, 0);
  const code = files
    .filter((file) => /\.(js|css|html)$/.test(file.path))
    .reduce((sum, file) => sum + file.size, 0);

  const byGroup = new Map();
  for (const file of files) {
    const rel = path.relative(DIST, file.path);
    const key = rel.includes(path.sep) ? rel.split(path.sep).slice(0, 2).join("/") : "(root)";
    byGroup.set(key, (byGroup.get(key) ?? 0) + file.size);
  }

  console.info("[NEVA BUDGET]");
  console.info(`  code bundle   ${mb(code).padStart(10)}  (budget ${mb(declaredBudget)})`);
  console.info(`  total dist    ${mb(total).padStart(10)}  (baseline ${mb(baseline.totalBytes)})`);
  console.info("  largest groups:");
  for (const [group, size] of [...byGroup.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)) {
    console.info(`    ${mb(size).padStart(10)}  ${group}`);
  }

  let failed = false;

  if (code > declaredBudget) {
    console.error(
      `[NEVA BUDGET] FAIL code bundle ${mb(code)} exceeds downloadBudgetBytes ${mb(declaredBudget)}`
    );
    failed = true;
  }

  if (total > baseline.totalBytes) {
    console.error(
      `[NEVA BUDGET] FAIL total dist ${mb(total)} grew past the baseline ` +
        `${mb(baseline.totalBytes)} (+${mb(total - baseline.totalBytes)}).`
    );
    console.error("  Shrink it, or update tools/ci/download-budget.baseline.json deliberately.");
    failed = true;
  } else if (total < baseline.totalBytes) {
    console.info(
      `[NEVA BUDGET] dist shrank ${mb(baseline.totalBytes - total)} below the baseline — ` +
        "lower the baseline to lock the win in."
    );
  }

  if (failed) process.exitCode = 1;
  else console.info("[NEVA BUDGET] pass");
}

main();
