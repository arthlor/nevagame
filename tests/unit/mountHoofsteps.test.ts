import { describe, expect, it } from "vitest";
import { audibleHoofTimes, DONKEY_HOOF_TIMES, hoofContactsCrossed, HORSE_HOOF_TIMES } from "../../src/audio/mountHoofsteps";

describe("mount hoof contacts", () => {
  it("counts only the donkey plants the walk clip passes", () => {
    const duration = 0.5;
    expect(hoofContactsCrossed(DONKEY_HOOF_TIMES.walk, duration, 0.1, 0.2)).toBe(1);
    expect(hoofContactsCrossed(DONKEY_HOOF_TIMES.walk, duration, 0.39, 0.55)).toBe(2);
    expect(hoofContactsCrossed(DONKEY_HOOF_TIMES.walk, duration, 0.2, 0.2)).toBe(0);
    expect(hoofContactsCrossed(DONKEY_HOOF_TIMES.gallop, 0.266667, 0, 0.266667)).toBe(0);
  });

  it("counts a full horse walk cycle as four plants", () => {
    expect(hoofContactsCrossed(HORSE_HOOF_TIMES.walk, 1.0666666666666667, 0.2, 1.26)).toBe(4);
    expect(hoofContactsCrossed(HORSE_HOOF_TIMES.trot, 0.6666666666666666, 0.29, 0.34)).toBe(2);
    expect(hoofContactsCrossed(HORSE_HOOF_TIMES.walk, 1.0666666666666667, 0.55, 0.45)).toBe(1);
  });

  it("voices the stride instead of every plant", () => {
    expect(audibleHoofTimes(DONKEY_HOOF_TIMES.walk, "walk")).toEqual([0, 0.266667]);
    expect(audibleHoofTimes(DONKEY_HOOF_TIMES.gallop, "gallop")).toEqual([0, 0.166667]);
    expect(audibleHoofTimes(HORSE_HOOF_TIMES.trot, "trot")).toEqual([0.3, 0.633]);
    expect(audibleHoofTimes(HORSE_HOOF_TIMES.walk, "walk")).toEqual([0.367, 0.933]);
  });
});
