import { fractalNoise } from "./ProceduralNoise";

/**
 * Shared coastal geology for the Neva mainland. One field decides both where
 * the outer shoreline juts out and what the shore is made of: hard rock
 * resists the sea, so it stands as headlands with cliffs, while the softer
 * ground between them erodes back into bays that hold beaches.
 */
const HEADLAND_WAVELENGTH_METERS = 230;
const HEADLAND_SALT = 0x4e455641;

/** Hard-rock headland (+1) to soft embayment (-1). Pure function of world metres. */
export function nevaHeadlandAt(x: number, z: number): number {
  return Math.max(-1, Math.min(1, fractalNoise(x, z, HEADLAND_WAVELENGTH_METERS, 3, HEADLAND_SALT) * 1.7));
}

/**
 * The protected inner cove below Pinewatch keeps landings and beaches: its
 * water never builds the fetch that cuts cliffs. Continuous everywhere.
 */
export function nevaCoveShelterAt(x: number, z: number): number {
  const east = 1 - smoothstep(-205, -150, x);
  const west = smoothstep(-565, -505, x);
  const north = smoothstep(62, 104, z);
  const south = 1 - smoothstep(505, 565, z);
  return east * west * north * south;
}

function smoothstep(a: number, b: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
