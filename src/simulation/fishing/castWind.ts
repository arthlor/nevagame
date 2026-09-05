import { FISHING_TUNING } from "./FishingTuning";

/**
 * How the wind takes a bank cast.
 *
 * Pure and deterministic: every input is already canonical simulation state
 * (persisted weather plus the caster's facing), so the same cast in the same
 * conditions always lands the same way and nothing here needs the RNG.
 *
 * The world uses one angle convention for both wind and facing — a heading of
 * `t` is the vector `(sin t, cos t)`, with the caster's right hand at
 * `(cos t, -sin t)`. That makes the along/across split fall out of a single
 * angle difference rather than needing vector bookkeeping.
 */
export interface CastWindInput {
  /** Direction the wind blows toward, degrees, matching `WeatherState`. */
  windDirectionDeg: number;
  /** Metres per second, matching `WeatherState`. */
  windSpeed: number;
  /** The caster's facing; the cast travels along `(sin, cos)` of this. */
  castHeadingRadians: number;
  /** 0..1 charge on the cast. A harder cast is carried further off line. */
  castPower: number;
}

export interface CastWindEffect {
  /** +1 is a pure tailwind behind the cast, -1 a pure headwind into it. */
  along: number;
  /** +1 is wind pushing across to the caster's right, -1 to their left. */
  across: number;
  /** Wind strength as a 0..1 fraction of the reference blow. */
  load: number;
  /** Multiplier on the cast's reach: a tailwind carries, a headwind drops it short. */
  distanceScale: number;
  /** Metres the bobber lands to the caster's right of the aim line; may be negative. */
  lateralDriftMeters: number;
  /** Multiplier on the wait for a bite. */
  waitMultiplier: number;
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

export function castWindEffect(input: CastWindInput): CastWindEffect {
  const tuning = FISHING_TUNING.castWind;
  const windSpeed = Number.isFinite(input.windSpeed) ? Math.max(0, input.windSpeed) : 0;
  const load = clamp(windSpeed / tuning.referenceWindSpeed, 0, 1);
  // One angle difference carries both components: the cosine is the along-cast
  // share and the sine is the across-cast share.
  const delta = (input.windDirectionDeg * Math.PI) / 180 - input.castHeadingRadians;
  const along = Math.cos(delta);
  const across = Math.sin(delta);
  const power = clamp(input.castPower, 0, 1);

  // Glassy calm and a hard blow are both poor fishing; the ripple between them
  // is the best of it. `detune` is 0 at that ripple and reaches 1 at whichever
  // end of the range lies further from it.
  const detune = clamp(
    Math.abs(load - tuning.idealLoad) / Math.max(tuning.idealLoad, 1 - tuning.idealLoad),
    0,
    1
  );

  return {
    along,
    across,
    load,
    distanceScale: 1 + along * load * tuning.carryScale,
    lateralDriftMeters: across * load * power * tuning.driftMeters,
    waitMultiplier:
      tuning.bestWaitMultiplier
      + (tuning.worstWaitMultiplier - tuning.bestWaitMultiplier) * detune
  };
}
