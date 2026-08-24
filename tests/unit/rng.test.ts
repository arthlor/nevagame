// tests/unit/rng.test.ts
import { describe, it, expect } from "vitest";
import { SeededRng } from "../../src/simulation/core/Rng";

describe("SeededRng", () => {
  it("produces deterministic sequence with fixed seed", () => {
    const rng1 = new SeededRng(12345);
    const rng2 = new SeededRng(12345);

    const seq1 = [rng1.nextFloat(), rng1.intInclusive(1, 10), rng1.range(5, 20)];
    const seq2 = [rng2.nextFloat(), rng2.intInclusive(1, 10), rng2.range(5, 20)];

    expect(seq1).toEqual(seq2);
  });

  it("respects inclusive int bounds", () => {
    const rng = new SeededRng(999);
    for (let i = 0; i < 100; i++) {
      const val = rng.intInclusive(3, 7);
      expect(val).toBeGreaterThanOrEqual(3);
      expect(val).toBeLessThanOrEqual(7);
    }
  });

  it("respects weighted selections", () => {
    const rng = new SeededRng(555);
    const result = rng.weighted([
      { value: "rare", weight: 0.0001 },
      { value: "common", weight: 1000 }
    ]);
    expect(result).toBe("common");
  });

  it("skips zero-weight entries even when the roll is zero", () => {
    const rng = new SeededRng(1);
    for (let i = 0; i < 200; i++) {
      const result = rng.weighted([
        { value: "zero", weight: 0 },
        { value: "positive", weight: 1 }
      ]);
      expect(result).toBe("positive");
    }
  });

  it("restores internal state via constructor and getState", () => {
    const rng = new SeededRng(42);
    rng.nextFloat();
    rng.intInclusive(1, 10);
    const restored = new SeededRng(999, rng.getState());
    expect(restored.nextFloat()).toBe(rng.nextFloat());
  });
});
