import * as THREE from "three";

import type { V3 } from "./types";

/** Animation authoring: Euler-keyed tracks, looping gait tracks and small posing solvers. */

const DEG = Math.PI / 180;

/** Quaternion track from [time, x, y, z] Euler degrees (XYZ order). */
export function rotTrack(node: string, keys: ReadonlyArray<readonly [number, number, number, number]>): THREE.QuaternionKeyframeTrack {
  const times: number[] = [];
  const values: number[] = [];
  const q = new THREE.Quaternion();
  for (const [t, x, y, z] of keys) {
    times.push(t);
    q.setFromEuler(new THREE.Euler(x * DEG, y * DEG, z * DEG, "XYZ"));
    values.push(q.x, q.y, q.z, q.w);
  }
  return new THREE.QuaternionKeyframeTrack(`${node}.quaternion`, times, values);
}

/** Position track as offsets from `base`, keyed [time, dx, dy, dz]. */
export function posTrack(node: string, base: V3, keys: ReadonlyArray<readonly [number, number, number, number]>): THREE.VectorKeyframeTrack {
  const times: number[] = [];
  const values: number[] = [];
  for (const [t, x, y, z] of keys) {
    times.push(t);
    values.push(base[0] + x, base[1] + y, base[2] + z);
  }
  return new THREE.VectorKeyframeTrack(`${node}.position`, times, values);
}

/**
 * A looping single-axis rotation track from normalised keys [phase 0..1, degrees]. `phase` offsets
 * the whole cycle, which is how the four legs of one gait share one key list. The loop closes exactly
 * because t=0 and t=1 sample the same point of the periodic curve.
 */
export function cyclicTrack(
  node: string,
  keys: ReadonlyArray<readonly [number, number]>,
  phase: number,
  duration: number,
  axis: "x" | "y" | "z" = "x"
): THREE.QuaternionKeyframeTrack {
  const sample = (t: number): number => {
    const x = ((t % 1) + 1) % 1;
    for (let i = 0; i < keys.length; i += 1) {
      const [t0, a0] = keys[i];
      const [t1, a1] = i + 1 < keys.length ? keys[i + 1] : [keys[0][0] + 1, keys[0][1]];
      const xx = x < t0 ? x + 1 : x;
      if (xx >= t0 && xx <= t1) return a0 + ((a1 - a0) * (xx - t0)) / (t1 - t0);
    }
    return keys[0][1];
  };
  const times = [...new Set([0, 1, ...keys.map(([t]) => (((t - phase) % 1) + 1) % 1)])].sort((l, r) => l - r);
  return rotTrack(node, times.map((u) => {
    const angle = sample(u + phase);
    return [u * duration, axis === "x" ? angle : 0, axis === "y" ? angle : 0, axis === "z" ? angle : 0] as const;
  }));
}

/**
 * Motion-root transform that pitches the body by `pitchDeg` about a model-space `pivot` (a hip, a
 * breast at the waterline) and then shifts it. The motion root turns about its own origin, so the
 * pivot is folded into the translation.
 */
export function pivotPitch(pivot: V3, pitchDeg: number, shift: V3): V3 {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitchDeg * DEG, 0, 0));
  const p = new THREE.Vector3(...pivot);
  const offset = p.clone().sub(p.clone().applyQuaternion(q)).add(new THREE.Vector3(...shift));
  return [offset.x, offset.y, offset.z];
}

/**
 * Solves a planar (sagittal) limb chain. Every bone has identity rest rotation and turns about X, so
 * a segment's direction angle in the YZ plane is just the sum of the rotations above it. Given each
 * segment's rest vector and the vector it should point along, returns the per-bone X rotations,
 * with `inherited` the rotation already applied by the parents (a pitched body, say).
 */
export function solveSagittalChain(
  rest: ReadonlyArray<readonly [number, number]>,
  want: ReadonlyArray<readonly [number, number]>,
  inherited: number
): number[] {
  const angle = ([y, z]: readonly [number, number]): number => (Math.atan2(z, y) * 180) / Math.PI;
  const rotations: number[] = [];
  let accumulated = inherited;
  rest.forEach((segment, index) => {
    const rotation = angle(want[index]) - angle(segment) - accumulated;
    rotations.push(rotation);
    accumulated += rotation;
  });
  return rotations;
}

