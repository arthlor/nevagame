import { describe, expect, it } from "vitest";

import {
  selectNearestGroundCoverIndices,
  selectStableGroundCoverIndices
} from "../../src/render/scene/groundCoverVisibility";

describe("selectNearestGroundCoverIndices", () => {
  const instances = [
    { x: 100, z: 0 },
    { x: 2, z: 0 },
    { x: 6, z: 0 },
    { x: 4, z: 0 },
    { x: -80, z: 12 }
  ];

  it("keeps the nearest in-range clumps even when they sit after a world-list prefix", () => {
    expect(selectNearestGroundCoverIndices(instances, 0, 0, 10, 2)).toEqual([1, 3]);
  });

  it("returns every in-range clump when the quality cap is larger than the neighborhood", () => {
    expect(selectNearestGroundCoverIndices(instances, 0, 0, 10, 8)).toEqual([1, 3, 2]);
  });

  it("returns nothing when the cap or draw distance is empty", () => {
    expect(selectNearestGroundCoverIndices(instances, 0, 0, 10, 0)).toEqual([]);
    expect(selectNearestGroundCoverIndices(instances, 0, 0, 0, 4)).toEqual([]);
  });
});

describe("selectStableGroundCoverIndices", () => {
  const instances = [
    { x: 100, z: 0 },
    { x: 2, z: 0 },
    { x: 6, z: 0 },
    { x: 4, z: 0 },
    { x: -80, z: 12 }
  ];

  it("holds already-drawn clumps while the focus slides within keep distance", () => {
    expect(selectStableGroundCoverIndices(instances, 0, 0, 10, 2, [2, 1], 12)).toEqual([2, 1]);
  });

  it("fills remaining slots with the nearest unused in-range clumps", () => {
    expect(selectStableGroundCoverIndices(instances, 0, 0, 10, 2, [1], 12)).toEqual([1, 3]);
  });

  it("drops sticky clumps only after they leave the keep envelope", () => {
    expect(selectStableGroundCoverIndices(instances, 0, 0, 10, 2, [0], 12)).toEqual([1, 3]);
  });
});
