import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { authoredToolchainHash, loadAuthoredProducer } from "./pipeline/producer.mjs";

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "neva-producer-cache-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (name, content) => {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };
  write("art/palettes/neva.palette.json", "{}");
  write("package.json", '{"type":"module"}');
  write("package-lock.json", '{"lockfileVersion":3}');
  write("node_modules/esbuild/package.json", '{"version":"0.25.12"}');
  write("node_modules/three/package.json", '{"type":"module","main":"index.js","version":"0.174.0"}');
  write("node_modules/three/index.js", 'export const REVISION = "174";');
  write("tools/authored/pipeline/node-entry.ts", 'export { REVISION } from "three";');
  return { root, write };
}

test("producer identity is stable and tracks dependency and build inputs", (t) => {
  const { root, write } = fixture(t);
  let previous = authoredToolchainHash(root);
  assert.equal(authoredToolchainHash(root), previous);
  for (const [file, content] of [
    ["package.json", '{"type":"module","dependencies":{"three":"0.186.1"}}'],
    ["package-lock.json", '{"lockfileVersion":3,"version":"changed"}'],
    ["npm-shrinkwrap.json", '{"lockfileVersion":3}'],
    ["node_modules/three/package.json", '{"version":"0.186.1"}'],
    ["node_modules/esbuild/package.json", '{"version":"0.26.0"}'],
    ["tools/authored/pipeline/producer.mjs", 'export const target = "node22";']
  ]) {
    write(file, content);
    const next = authoredToolchainHash(root);
    assert.notEqual(next, previous, file);
    previous = next;
  }
  fs.unlinkSync(path.join(root, "node_modules/three/package.json"));
  assert.throws(() => authoredToolchainHash(root), /ENOENT/);
});

test("dependency upgrade bypasses both loaded-module and on-disk bundle caches", async (t) => {
  const { root, write } = fixture(t);
  const first = await loadAuthoredProducer(root);
  assert.equal(first.REVISION, "174");
  assert.equal(await loadAuthoredProducer(root), first);
  write("node_modules/three/package.json", '{"type":"module","main":"index.js","version":"0.186.1"}');
  write("node_modules/three/index.js", 'export const REVISION = "186";');
  const upgraded = await loadAuthoredProducer(root);
  assert.notEqual(upgraded, first);
  assert.equal(upgraded.REVISION, "186");
  assert.equal(fs.readdirSync(path.join(root, "generated/.cache/authored")).length, 2);
});
