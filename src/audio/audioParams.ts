export const finiteAudioValue = (value: number, fallback: number): number =>
  Number.isFinite(value) ? value : fallback;

export const computePlaybackRate = (seed: number, pitchMin: number, pitchMax: number): number => {
  const min = finiteAudioValue(pitchMin, 0.97);
  const max = finiteAudioValue(pitchMax, 1.03);
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const safeSeed = Number.isFinite(seed) ? Math.abs(seed) : 0;
  const t = ((safeSeed * 997) % 1000) / 1000;
  const rate = lo + t * (hi - lo);
  return rate > 0 && Number.isFinite(rate) ? rate : 1;
};

export const setAudioParam = (param: AudioParam, value: number, at: number): void => {
  if (!Number.isFinite(value) || !Number.isFinite(at)) {
    return;
  }
  param.cancelScheduledValues(at);
  param.setTargetAtTime(value, at, 0.025);
};

export const setAudioParamNow = (param: AudioParam, value: number, at: number, fallback: number): void => {
  const next = finiteAudioValue(value, fallback);
  const time = finiteAudioValue(at, 0);
  param.setValueAtTime(next, time);
};
