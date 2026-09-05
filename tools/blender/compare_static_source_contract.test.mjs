import assert from "node:assert/strict";
import test from "node:test";

import { compareRegionTriangles } from "./compare_static_source_contract.mjs";

const corner = (position, normal = [0, 1, 0], uv = [0, 0]) => ({
  position,
  normal,
  uv,
  color: null,
});

const source = [[
  corner([0, 0, 0], [0, 1, 0], [0, 0]),
  corner([1, 0, 0], [0, 1, 0], [1, 0]),
  corner([0, 0, 1], [0, 1, 0], [0, 1]),
]];

test("static source comparison permits exporter reindexing and float noise inside contract", () => {
  const candidate = [[
    corner([1.00001, 0, 0], [0, 1, 0], [1, 0]),
    corner([0, 0, 1.00001], [0, 1, 0], [0, 1]),
    corner([0.00001, 0, 0], [0, 1, 0], [0, 0]),
  ]];
  const report = compareRegionTriangles(source, candidate);
  assert.equal(report.passed, true);
  assert.equal(report.matchedTriangles, 1);
});

test("static source comparison rejects winding, normal, and UV drift", () => {
  const reversed = [[source[0][0], source[0][2], source[0][1]]];
  assert.equal(compareRegionTriangles(source, reversed).passed, false);

  const wrongNormal = [[
    source[0][0],
    corner([1, 0, 0], [0.01, 0.99995, 0], [1, 0]),
    source[0][2],
  ]];
  assert.equal(compareRegionTriangles(source, wrongNormal).passed, false);

  const wrongUv = [[
    source[0][0],
    corner([1, 0, 0], [0, 1, 0], [0.99, 0]),
    source[0][2],
  ]];
  assert.equal(compareRegionTriangles(source, wrongUv).passed, false);
});
