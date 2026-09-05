import { describe, expect, it } from "vitest";
import { castWindEffect, type CastWindInput } from "../../src/simulation/fishing/castWind";
import { FISHING_TUNING } from "../../src/simulation/fishing/FishingTuning";
import { BasicFishingMinigame } from "../../src/simulation/fishing/BasicFishingMinigame";
import { SeededRng } from "../../src/simulation/core/Rng";
import { ContentRegistry } from "../../src/content/ContentRegistry";

const TUNING = FISHING_TUNING.castWind;
/** Facing +Z, so forward is (0, 1) and the caster's right hand is (1, 0). */
const FACING_NORTH = 0;

const cast = (overrides: Partial<CastWindInput> = {}) =>
  castWindEffect({
    windDirectionDeg: 0,
    windSpeed: 0,
    castHeadingRadians: FACING_NORTH,
    castPower: 1,
    ...overrides
  });

describe("wind on a bank cast", () => {
  it("splits the wind into along-cast and across-cast shares", () => {
    // The world blows wind toward (sin d, cos d) and the caster faces (sin h, cos h).
    expect(cast({ windDirectionDeg: 0 }).along).toBeCloseTo(1, 6); // straight behind
    expect(cast({ windDirectionDeg: 180 }).along).toBeCloseTo(-1, 6); // straight into
    expect(cast({ windDirectionDeg: 90 }).across).toBeCloseTo(1, 6); // toward their right
    expect(cast({ windDirectionDeg: 270 }).across).toBeCloseTo(-1, 6); // toward their left
    // A pure crosswind has no along-cast share, and vice versa.
    expect(cast({ windDirectionDeg: 90 }).along).toBeCloseTo(0, 6);
    expect(cast({ windDirectionDeg: 0 }).across).toBeCloseTo(0, 6);
  });

  it("reads the wind relative to the caster, not to the world", () => {
    // The same world wind is a tailwind or a headwind depending on which way
    // the angler turns to face the water.
    const worldWind = 90;
    const facingWithIt = cast({ windDirectionDeg: worldWind, castHeadingRadians: Math.PI / 2 });
    const facingIntoIt = cast({ windDirectionDeg: worldWind, castHeadingRadians: -Math.PI / 2 });
    expect(facingWithIt.along).toBeCloseTo(1, 6);
    expect(facingIntoIt.along).toBeCloseTo(-1, 6);
  });

  it("carries a downwind cast further and drops an upwind one short", () => {
    const blow = TUNING.referenceWindSpeed;
    const tail = cast({ windDirectionDeg: 0, windSpeed: blow });
    const head = cast({ windDirectionDeg: 180, windSpeed: blow });
    expect(tail.distanceScale).toBeCloseTo(1 + TUNING.carryScale, 6);
    expect(head.distanceScale).toBeCloseTo(1 - TUNING.carryScale, 6);
    expect(tail.distanceScale).toBeGreaterThan(head.distanceScale);
  });

  it("sets a crosswind cast down off the aim line, signed to the caster's right", () => {
    const blow = TUNING.referenceWindSpeed;
    expect(cast({ windDirectionDeg: 90, windSpeed: blow }).lateralDriftMeters)
      .toBeCloseTo(TUNING.driftMeters, 6);
    expect(cast({ windDirectionDeg: 270, windSpeed: blow }).lateralDriftMeters)
      .toBeCloseTo(-TUNING.driftMeters, 6);
    // A soft cast is not pushed as far off line as a hard one.
    const soft = cast({ windDirectionDeg: 90, windSpeed: blow, castPower: 0.25 });
    const hard = cast({ windDirectionDeg: 90, windSpeed: blow, castPower: 1 });
    expect(Math.abs(soft.lateralDriftMeters)).toBeLessThan(Math.abs(hard.lateralDriftMeters));
  });

  it("leaves a still day exactly as it found it", () => {
    const calm = cast({ windSpeed: 0 });
    expect(calm.load).toBe(0);
    expect(calm.distanceScale).toBe(1);
    expect(calm.lateralDriftMeters).toBe(0);
  });

  it("fishes best on a ripple, worse in a glassy calm and worse again in a blow", () => {
    const ripple = cast({ windSpeed: TUNING.referenceWindSpeed * TUNING.idealLoad });
    const glassy = cast({ windSpeed: 0 });
    const gale = cast({ windSpeed: TUNING.referenceWindSpeed });
    expect(ripple.waitMultiplier).toBeCloseTo(TUNING.bestWaitMultiplier, 6);
    expect(ripple.waitMultiplier).toBeLessThan(1);
    expect(glassy.waitMultiplier).toBeGreaterThan(ripple.waitMultiplier);
    expect(gale.waitMultiplier).toBeGreaterThan(ripple.waitMultiplier);
    // The wait swing stays inside the authored band whatever the wind does.
    for (const speed of [0, 1, 3, 4.2, 7, 12, 40]) {
      const { waitMultiplier } = cast({ windSpeed: speed });
      expect(waitMultiplier).toBeGreaterThanOrEqual(TUNING.bestWaitMultiplier);
      expect(waitMultiplier).toBeLessThanOrEqual(TUNING.worstWaitMultiplier);
    }
  });

  it("clamps a freak gale to the reference blow and survives junk input", () => {
    const hurricane = cast({ windDirectionDeg: 0, windSpeed: 500 });
    const reference = cast({ windDirectionDeg: 0, windSpeed: TUNING.referenceWindSpeed });
    expect(hurricane.load).toBe(1);
    expect(hurricane.distanceScale).toBeCloseTo(reference.distanceScale, 6);
    const broken = cast({ windSpeed: Number.NaN });
    expect(broken.load).toBe(0);
    expect(Number.isFinite(broken.distanceScale)).toBe(true);
    expect(Number.isFinite(broken.lateralDriftMeters)).toBe(true);
  });

  it("is pure: the same conditions always take the cast the same way", () => {
    const input: CastWindInput = {
      windDirectionDeg: 137,
      windSpeed: 6.4,
      castHeadingRadians: 0.7,
      castPower: 0.8
    };
    expect(castWindEffect(input)).toEqual(castWindEffect(input));
  });
});

describe("a cast carries its wind into the encounter", () => {
  const buildCast = (windDirectionDeg: number, windSpeed: number) => {
    ContentRegistry.initializeAndValidate();
    return BasicFishingMinigame.createInitialState(
      "river",
      ContentRegistry.items.keys().next().value as string,
      1,
      "rod.willow",
      0,
      false,
      new SeededRng(42),
      "clear",
      "day",
      "ecology.neva",
      castWindEffect({
        windDirectionDeg,
        windSpeed,
        castHeadingRadians: FACING_NORTH,
        castPower: 1
      })
    );
  };

  it("records the wind-set reach and drift on the encounter, from one seed", () => {
    const blow = TUNING.referenceWindSpeed;
    const calm = buildCast(0, 0);
    const tail = buildCast(0, blow);
    const head = buildCast(180, blow);
    const cross = buildCast(90, blow);

    // Same seed and same cast power: only the wind differs.
    expect(tail.castDistanceMeters!).toBeGreaterThan(calm.castDistanceMeters!);
    expect(head.castDistanceMeters!).toBeLessThan(calm.castDistanceMeters!);
    expect(calm.castLateralDriftMeters).toBe(0);
    expect(cross.castLateralDriftMeters!).toBeGreaterThan(0);
    // A crosswind takes the line sideways without lengthening the cast.
    expect(cross.castDistanceMeters!).toBeCloseTo(calm.castDistanceMeters!, 6);
  });

  it("brings the fish on faster in a ripple than in a flat calm", () => {
    const ripple = buildCast(0, TUNING.referenceWindSpeed * TUNING.idealLoad);
    const glassy = buildCast(0, 0);
    expect(ripple.remainingSeconds).toBeLessThan(glassy.remainingSeconds);
  });
});
