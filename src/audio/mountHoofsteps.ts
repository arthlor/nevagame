/**
 * Hoof plants taken from the clips the animals actually play.
 * Donkey walk and trot use the catalog hoofstep marks. Donkey gallop and the
 * draft horse have no marks, so those times are the frames their hoof bones
 * arrive on the ground.
 */
export const DONKEY_HOOF_TIMES: Record<"walk" | "trot" | "gallop", readonly number[]> = {
  walk: [0, 0.133333, 0.266667, 0.4],
  trot: [0, 0.133333],
  gallop: [0, 0.033333, 0.166667, 0.2]
};

export const HORSE_HOOF_TIMES: Record<"walk" | "trot", readonly number[]> = {
  walk: [0.367, 0.5, 0.933, 1.033],
  trot: [0.3, 0.333, 0.633, 0.667]
};

/** Plants a listener should hear: a walk's left and right, or one tap for a close pair. */
export function audibleHoofTimes(
  times: readonly number[],
  gait: "walk" | "trot" | "gallop"
): readonly number[] {
  if (gait === "walk") return times.filter((_, index) => index % 2 === 0);
  const kept: number[] = [];
  for (const time of times) {
    const previous = kept[kept.length - 1];
    if (previous == null || time - previous >= 0.08) kept.push(time);
  }
  return kept;
}
export function hoofContactsCrossed(
  times: readonly number[],
  duration: number,
  before: number,
  after: number
): number {
  if (!(duration > 0) || times.length === 0) return 0;
  const span = after - before;
  const distance = Math.abs(span);
  if (!(distance > 0) || distance > duration) return 0;
  const start = modulo(before, duration);
  const end = modulo(after, duration);
  const forward = span > 0;
  const wrapped = forward ? end < start - 1e-4 : start < end - 1e-4;
  let count = 0;
  for (const time of times) {
    if (forward) {
      if (wrapped ? time > start || time <= end : time > start && time <= end) count += 1;
    } else if (wrapped ? time < start || time >= end : time < start && time >= end) {
      count += 1;
    }
  }
  return count;
}

const modulo = (value: number, duration: number): number =>
  ((value % duration) + duration) % duration;
