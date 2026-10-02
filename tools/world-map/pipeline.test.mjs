import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { contours } from "./contours.ts";
import { ROOT, RECEIPT_PATH, OUTPUT_PATHS, collectInputs, fingerprint, checkFreshness, hash } from "./inputs.mjs";

/** Exercise hashes in an isolated copy; never mutate the current world or outputs. */
function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "neva-map-check-test-"));
  try {
    for (const input of collectInputs()) {
      const target = path.join(root, input.path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(ROOT, input.path), target);
    }
    const inputs = collectInputs(root);
    const outputs = {};
    for (const filename of OUTPUT_PATHS) {
      const content = Buffer.from(`fixture output ${filename}`);
      fs.mkdirSync(path.dirname(path.join(root, filename)), { recursive: true });
      fs.writeFileSync(path.join(root, filename), content);
      outputs[filename] = hash(content);
    }
    fs.writeFileSync(path.join(root, RECEIPT_PATH), JSON.stringify({ inputFingerprint: fingerprint(inputs), inputs, outputs }));
    run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("freshness checks are independent of checkout path, git and Python", () => {
  fixture(root => {
    assert.equal(checkFreshness(root).inputCount, collectInputs(root).length);
    assert.ok(!fs.existsSync(path.join(root, ".git")));
    assert.ok(!fs.existsSync(path.join(root, "node_modules")));
  });
});

test("source, recipe, catalog and new transitive imports invalidate the map", () => {
  fixture(root => {
    for (const filename of ["src/world/WorldAnchors.ts", "tools/world-map/render.py", "assets/specs/asset-catalog.json"]) {
      const absolute = path.join(root, filename);
      const original = fs.readFileSync(absolute);
      fs.appendFileSync(absolute, "\n ");
      assert.throws(() => checkFreshness(root), /stale source inputs/);
      fs.writeFileSync(absolute, original);
      assert.doesNotThrow(() => checkFreshness(root));
    }
    fs.writeFileSync(path.join(root, "src/world/NewMapInput.ts"), "export const newMapInput = 1;\n");
    fs.appendFileSync(path.join(root, "src/world/WorldAnchors.ts"), "\nimport './NewMapInput';\n");
    assert.ok(collectInputs(root).some(input => input.path === "src/world/NewMapInput.ts"));
    assert.throws(() => checkFreshness(root), /NewMapInput.ts/);
  });
});

test("missing or edited output cannot pass the saved receipt", () => {
  fixture(root => {
    const filename = path.join(root, OUTPUT_PATHS[1]);
    const original = fs.readFileSync(filename);
    fs.appendFileSync(filename, "modified");
    assert.throws(() => checkFreshness(root), /missing or modified output/);
    fs.writeFileSync(filename, original);
    assert.doesNotThrow(() => checkFreshness(root));
    fs.unlinkSync(filename);
    assert.throws(() => checkFreshness(root), /missing or modified output/);
  });
});

test("water contours are deterministic, closed and source-positioned", () => {
  const field = (x, z) => 4 - Math.hypot(x - 3, z + 2);
  const bounds = { minX: -3, maxX: 9, minZ: -8, maxZ: 4 };
  const result = contours(field, bounds, 0.5);
  assert.equal(result.length, 1);
  assert.deepEqual(result, contours(field, bounds, 0.5));
  const first = result[0][0], last = result[0].at(-1);
  assert.ok(Math.hypot(first.x - last.x, first.z - last.z) < 1e-5);
  for (const point of result[0]) assert.ok(Math.abs(field(point.x, point.z)) < 0.02);
});

test("water contours fail rather than publish clipped or invalid geography", () => {
  const bounds = { minX: -1, maxX: 1, minZ: -1, maxZ: 1 };
  assert.throws(() => contours(() => 1, bounds, 0.5), /sampling bounds/);
  assert.throws(() => contours(x => x, bounds, 0.5), /sampling bounds/);
  assert.throws(() => contours(() => NaN, bounds, 0.5), /non-finite/);
  assert.throws(() => contours(() => -1, bounds, 0), /positive sampling steps/);
});
