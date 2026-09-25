/**
 * Deterministic procedural noise for canonical landforms.
 *
 * Geography is authored data, so every function here is a pure function of
 * world metres and a fixed integer salt: no `Math.random`, no world seed, no
 * lookup tables that depend on evaluation order. The same coordinates return
 * the same height in the renderer, Rapier, save recovery and tests.
 */

/** 32-bit integer lattice hash; exact on every JavaScript engine. */
export function latticeHash(ix: number, iz: number, salt: number): number {
  let h = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iz | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Unit value in [0, 1) from a lattice hash. */
export function latticeUnit(ix: number, iz: number, salt: number): number {
  return latticeHash(ix, iz, salt) / 0x100000000;
}

// Sixteen fixed unit gradients (22.5 degree steps), written out so no
// platform trigonometry participates in the lattice.
const GRADIENT_X = [
  1, 0.9238795325112867, 0.7071067811865476, 0.3826834323650898,
  0, -0.3826834323650898, -0.7071067811865476, -0.9238795325112867,
  -1, -0.9238795325112867, -0.7071067811865476, -0.3826834323650898,
  0, 0.3826834323650898, 0.7071067811865476, 0.9238795325112867
] as const;
const GRADIENT_Z = [
  0, 0.3826834323650898, 0.7071067811865476, 0.9238795325112867,
  1, 0.9238795325112867, 0.7071067811865476, 0.3826834323650898,
  0, -0.3826834323650898, -0.7071067811865476, -0.9238795325112867,
  -1, -0.9238795325112867, -0.7071067811865476, -0.3826834323650898
] as const;

/** Scales raw 2D gradient noise to roughly [-1, 1]. */
const GRADIENT_NOISE_SCALE = 1.4142135623730951;

/**
 * Quintic 2D gradient noise in lattice units, approximately in [-1, 1].
 * When `derivative` is supplied it receives d/dx and d/dz in lattice units.
 */
export function gradientNoise(x: number, z: number, salt: number, derivative?: Float64Array): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const h00 = latticeHash(ix, iz, salt) & 15, h10 = latticeHash(ix + 1, iz, salt) & 15;
  const h01 = latticeHash(ix, iz + 1, salt) & 15, h11 = latticeHash(ix + 1, iz + 1, salt) & 15;
  const ax = GRADIENT_X[h00], az = GRADIENT_Z[h00];
  const bx = GRADIENT_X[h10], bz = GRADIENT_Z[h10];
  const cx = GRADIENT_X[h01], cz = GRADIENT_Z[h01];
  const dx = GRADIENT_X[h11], dz = GRADIENT_Z[h11];
  const va = ax * fx + az * fz;
  const vb = bx * (fx - 1) + bz * fz;
  const vc = cx * fx + cz * (fz - 1);
  const vd = dx * (fx - 1) + dz * (fz - 1);
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const v = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const k = va - vb - vc + vd;
  const value = va + u * (vb - va) + v * (vc - va) + u * v * k;
  if (derivative) {
    const du = 30 * fx * fx * (fx * (fx - 2) + 1);
    const dv = 30 * fz * fz * (fz * (fz - 2) + 1);
    derivative[0] = (ax + u * (bx - ax) + v * (cx - ax) + u * v * (ax - bx - cx + dx)
      + du * (vb - va + v * k)) * GRADIENT_NOISE_SCALE;
    derivative[1] = (az + u * (bz - az) + v * (cz - az) + u * v * (az - bz - cz + dz)
      + dv * (vc - va + u * k)) * GRADIENT_NOISE_SCALE;
  }
  return value * GRADIENT_NOISE_SCALE;
}

/**
 * Fractal sum of gradient noise over world metres. Octaves rotate by a fixed
 * 3-4-5 angle so their lattices never align into a visible grid.
 */
export function fractalNoise(
  x: number,
  z: number,
  wavelengthMeters: number,
  octaves: number,
  salt: number,
  gain = 0.5,
  lacunarity = 2.03
): number {
  let frequency = 1 / wavelengthMeters;
  let amplitude = 1, total = 0, norm = 0;
  let px = x, pz = z;
  for (let octave = 0; octave < octaves; octave++) {
    total += gradientNoise(px * frequency, pz * frequency, salt + octave * 101) * amplitude;
    norm += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
    const rx = px * 0.8 - pz * 0.6;
    pz = px * 0.6 + pz * 0.8;
    px = rx;
  }
  return total / norm;
}

/**
 * Drainage-aligned stripe noise ("phacelle" noise). Each jittered cell emits a
 * plane wave whose crests run along `downslope`; the weighted complex sum keeps
 * a unit amplitude and blends phases continuously, so valleys and spurs follow
 * the slope without shearing coordinates around a distant origin. Where the
 * waves cancel the amplitude eases to zero, so a phase vortex leaves a smooth
 * neutral patch instead of a pit.
 *
 * Returns the stripe value in [-1, 1]; -1 is a gully floor, +1 a spur crest.
 */
export function drainageStripe(
  x: number,
  z: number,
  downslopeX: number,
  downslopeZ: number,
  spacingMeters: number,
  salt: number
): number {
  // Waves vary across the slope (along the contour) so stripes run downhill.
  const acrossX = -downslopeZ, acrossZ = downslopeX;
  const cell = spacingMeters * 1.35;
  const gx = Math.floor(x / cell), gz = Math.floor(z / cell);
  // Jittered centres stay inside [0.2, 0.8] of their cell, so every kernel
  // outside the 3x3 block is at least 1.2 cells away: the radius must not
  // exceed that or the field steps at cell borders.
  const radius = cell * 1.2, radiusSquared = radius * radius;
  const angular = (Math.PI * 2) / spacingMeters;
  let cosine = 0, sine = 0, total = 0;
  for (let oz = -1; oz <= 1; oz++) {
    for (let ox = -1; ox <= 1; ox++) {
      const cx = gx + ox, cz = gz + oz;
      const hash = latticeHash(cx, cz, salt);
      const centerX = (cx + 0.2 + ((hash & 0xffff) / 0x10000) * 0.6) * cell;
      const centerZ = (cz + 0.2 + ((hash >>> 16) / 0x10000) * 0.6) * cell;
      const offsetX = x - centerX, offsetZ = z - centerZ;
      const distanceSquared = offsetX * offsetX + offsetZ * offsetZ;
      if (distanceSquared >= radiusSquared) continue;
      const falloff = 1 - distanceSquared / radiusSquared;
      const weight = falloff * falloff * falloff;
      const phase = (offsetX * acrossX + offsetZ * acrossZ) * angular
        + latticeUnit(cx, cz, salt ^ 0x5bd1e995) * Math.PI * 2;
      cosine += Math.cos(phase) * weight;
      sine += Math.sin(phase) * weight;
      total += weight;
    }
  }
  const magnitude = Math.sqrt(cosine * cosine + sine * sine);
  // Where the waves cancel, the phase winds through every value within a few
  // metres (a phase vortex) and carved a pit or pimple into the flank. The
  // stripe fades to the neutral contour there instead.
  const coherence = total > 0 ? Math.min(1, magnitude / (total * STRIPE_COHERENCE_FLOOR)) : 0;
  const fade = coherence * coherence * (3 - 2 * coherence);
  return magnitude > 1e-12 ? cosine / magnitude * fade : 0;
}

/** Relative wave-sum magnitude below which a stripe fades toward neutral. */
const STRIPE_COHERENCE_FLOOR = 0.3;

/**
 * Converts a stripe value into an eroded cross-section: V-shaped gully floors
 * and rounded spurs, in [-1, 1].
 */
export function gullyProfile(stripe: number): number {
  return 2 * Math.sqrt(Math.max(0, (1 + stripe) * 0.5)) - 1;
}
