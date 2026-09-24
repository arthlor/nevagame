import { describe, expect, it } from "vitest";
import { createTerraceProfile } from "../../src/world/TerraceProfile";
import { SUNREACH_FARM_LAYOUT } from "../../src/world/FarmLayout";

const heights = [4.15, 4.75, 5.35];
const profile = () => createTerraceProfile(
  SUNREACH_FARM_LAYOUT.plantableAreas, SUNREACH_FARM_LAYOUT.farmBounds, heights, 8
);

describe("cultivated terrace profile", () => {
  it("levels every complete bed, including the former rounded-off corners", () => {
    const sample = profile();
    SUNREACH_FARM_LAYOUT.plantableAreas.forEach((bed, index) => {
      for (let x = bed.minX; x <= bed.maxX; x += 0.5) {
        for (let z = bed.minZ; z <= bed.maxZ; z += 0.5) {
          expect(sample(x, z, Math.sin(x) * 4 + Math.cos(z) * 3)).toBeCloseTo(heights[index], 10);
        }
      }
    });
  });

  it("ramps only through the unplanted gaps with bounded grade and no height jumps", () => {
    const sample = profile();
    const beds = SUNREACH_FARM_LAYOUT.plantableAreas;
    for (let index = 1; index < beds.length; index += 1) {
      const from = beds[index - 1].maxZ, to = beds[index].minZ;
      let previous = sample(0, from, 3);
      expect(previous).toBeCloseTo(heights[index - 1], 10);
      for (let step = 1; step <= 200; step += 1) {
        const z = from + (to - from) * step / 200;
        const next = sample(0, z, 3);
        expect(next).toBeGreaterThanOrEqual(previous);
        expect((next - previous) / ((to - from) / 200)).toBeLessThanOrEqual(0.226);
        previous = next;
      }
      expect(previous).toBeCloseTo(heights[index], 10);
      expect(sample(0, from + 1e-5, 3) - sample(0, from - 1e-5, 3)).toBeLessThan(1e-7);
      expect(sample(0, to + 1e-5, 3) - sample(0, to - 1e-5, 3)).toBeLessThan(1e-7);
    }
  });

  it("leaves the landscape beyond the feather unchanged", () => {
    const sample = profile();
    for (const [x, z] of [[-50, 0], [50, 0], [0, -50], [0, 50], [-40, -45], [40, 45]]) {
      expect(sample(x, z, 19.37)).toBe(19.37);
    }
  });

  it("does not mutate or retain mutable authoring inputs", () => {
    const beds = SUNREACH_FARM_LAYOUT.plantableAreas.map(bed => ({ ...bed }));
    const bounds = { ...SUNREACH_FARM_LAYOUT.farmBounds };
    const levels = [...heights];
    const before = JSON.stringify({ beds, bounds, levels });
    const sample = createTerraceProfile(beds, bounds, levels, 8);
    expect(JSON.stringify({ beds, bounds, levels })).toBe(before);
    const expected = sample(0, -14, 0);
    beds[0].maxZ = -28;
    levels[0] = 999;
    bounds.maxX = -100;
    expect(sample(0, -14, 0)).toBe(expected);
  });

  it("rejects unordered, overlapping or malformed authoring data", () => {
    const { plantableAreas: beds, farmBounds: bounds } = SUNREACH_FARM_LAYOUT;
    expect(() => createTerraceProfile([], bounds, [], 8)).toThrow();
    expect(() => createTerraceProfile(beds, bounds, [4], 8)).toThrow();
    expect(() => createTerraceProfile([...beds].reverse(), bounds, heights, 8)).toThrow();
    expect(() => createTerraceProfile(beds, bounds, heights, 0)).toThrow();
    expect(() => createTerraceProfile(beds, bounds, [4, NaN, 5], 8)).toThrow();
    expect(() => createTerraceProfile(beds, { ...bounds, maxX: 0 }, heights, 8)).toThrow();
  });
});
