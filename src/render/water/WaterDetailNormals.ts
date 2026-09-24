import * as THREE from "three";

/**
 * Procedural, tileable water detail texture: the small ripples no lattice
 * can carry as geometry.
 *
 * The field is a sum of plane waves whose wave vectors are whole numbers of
 * cycles per tile, so it tiles exactly with no seam and needs no asset file.
 * Wave vectors are importance-sampled from a falling power spectrum with a
 * directional spread about +X, and each amplitude is Rayleigh-distributed, so
 * the sum approaches a Gaussian random surface: a few dozen sines draw
 * visible interference fringes (a wood-grain look), a few hundred do not.
 * The shader turns the tile to the local wind or current, so the ripples
 * lean the way the water moves. RGB is the unit normal of that height
 * field, A its normalised height (a crest mask for foam).
 *
 * Mipmaps are generated from the encoded normals, so a distant texel averages
 * several normals and decodes shorter than unit length. The shader reads that
 * shortfall as slope variance (Toksvig), which is how distant water turns
 * rough instead of sparkling.
 *
 * Deterministic: a fixed integer hash picks the waves; no gameplay RNG.
 */

export interface WaterDetailSpectrum {
  size: number;
  waves: number;
  minCycles: number;
  maxCycles: number;
  /** Amplitude falls as k^-exponent (slope spectrum as k^(1-exponent)). */
  exponent: number;
  /** cos^spread directional weighting about +X; 0 is isotropic. */
  spread: number;
  /** Peak slope the normals are scaled to. */
  peakSlope: number;
}

export const WATER_DETAIL_SPECTRUM: WaterDetailSpectrum = Object.freeze({
  size: 128,
  waves: 320,
  minCycles: 2,
  maxCycles: 30,
  exponent: 1.55,
  spread: 2.5,
  peakSlope: 0.85
});

function hash(value: number): number {
  let x = Math.imul(value ^ 0x9e3779b9, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** Height and slope field on the tile, separable per wave so it stays cheap. */
export function waterDetailField(spectrum: WaterDetailSpectrum = WATER_DETAIL_SPECTRUM): {
  height: Float32Array; slopeX: Float32Array; slopeY: Float32Array;
} {
  const n = spectrum.size;
  const height = new Float32Array(n * n);
  const slopeX = new Float32Array(n * n);
  const slopeY = new Float32Array(n * n);
  const sinX = new Float32Array(n);
  const cosX = new Float32Array(n);
  const sinY = new Float32Array(n);
  const cosY = new Float32Array(n);
  let accepted = 0;
  const used = new Set<number>();
  for (let attempt = 0; accepted < spectrum.waves && attempt < spectrum.waves * 40; attempt += 1) {
    const radius = spectrum.minCycles + (spectrum.maxCycles - spectrum.minCycles) * Math.pow(hash(attempt * 5 + 1), 1.6);
    // Directional spread about +X, leaning the ripples the way the water
    // travels; some energy is allowed to run across it, as real chop does.
    const angle = (hash(attempt * 5 + 2) - 0.5) * Math.PI * 1.8;
    const weight = Math.pow(Math.max(0, Math.cos(angle)), spectrum.spread);
    if (hash(attempt * 7 + 5) > 0.12 + 0.88 * weight) continue;
    const m = Math.round(Math.cos(angle) * radius);
    const k = Math.round(Math.sin(angle) * radius);
    if (m === 0 && k === 0) continue;
    // One component per lattice point; a repeat would only beat against itself.
    const key = (m + 512) * 1024 + (k + 512);
    if (used.has(key)) continue;
    used.add(key);
    const cycles = Math.hypot(m, k);
    const rayleigh = Math.sqrt(-2 * Math.log(Math.max(1e-6, hash(attempt * 5 + 4))));
    const amplitude = Math.pow(cycles, -spectrum.exponent) * rayleigh;
    const phase = hash(attempt * 5 + 3) * Math.PI * 2;
    for (let index = 0; index < n; index += 1) {
      const ax = (2 * Math.PI * m * index) / n;
      const ay = (2 * Math.PI * k * index) / n + phase;
      sinX[index] = Math.sin(ax); cosX[index] = Math.cos(ax);
      sinY[index] = Math.sin(ay); cosY[index] = Math.cos(ay);
    }
    // Slopes per unit tile: d/dx sin(2π(m x + k y)/n + φ) = 2π m/n cos(...).
    const gx = amplitude * 2 * Math.PI * m;
    const gy = amplitude * 2 * Math.PI * k;
    for (let y = 0; y < n; y += 1) {
      const sy = sinY[y]!, cy = cosY[y]!;
      const row = y * n;
      for (let x = 0; x < n; x += 1) {
        const s = sinX[x]! * cy + cosX[x]! * sy;
        const c = cosX[x]! * cy - sinX[x]! * sy;
        height[row + x]! += amplitude * s;
        slopeX[row + x]! += gx * c;
        slopeY[row + x]! += gy * c;
      }
    }
    accepted += 1;
  }
  return { height, slopeX, slopeY };
}

let cached: THREE.DataTexture | null = null;

/** The shared detail texture; built once per session and never disposed by consumers. */
export function waterDetailNormalTexture(spectrum: WaterDetailSpectrum = WATER_DETAIL_SPECTRUM): THREE.DataTexture {
  if (cached) return cached;
  const n = spectrum.size;
  const { height, slopeX, slopeY } = waterDetailField(spectrum);
  let peak = 1e-6;
  let low = Infinity;
  let high = -Infinity;
  for (let index = 0; index < n * n; index += 1) {
    peak = Math.max(peak, Math.hypot(slopeX[index]!, slopeY[index]!));
    low = Math.min(low, height[index]!);
    high = Math.max(high, height[index]!);
  }
  const scale = spectrum.peakSlope / peak;
  const data = new Uint8Array(n * n * 4);
  for (let index = 0; index < n * n; index += 1) {
    const sx = -slopeX[index]! * scale;
    const sy = -slopeY[index]! * scale;
    const length = Math.hypot(sx, sy, 1);
    data[index * 4] = Math.round((sx / length * 0.5 + 0.5) * 255);
    data[index * 4 + 1] = Math.round((sy / length * 0.5 + 0.5) * 255);
    data[index * 4 + 2] = Math.round((1 / length * 0.5 + 0.5) * 255);
    data[index * 4 + 3] = Math.round(((height[index]! - low) / Math.max(1e-6, high - low)) * 255);
  }
  const texture = new THREE.DataTexture(data, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = "water_detail_normals";
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  // Water is seen at grazing angles far more than any other surface.
  texture.anisotropy = 8;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  cached = texture;
  return texture;
}
