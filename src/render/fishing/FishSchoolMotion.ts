import { CANONICAL_RENDER_CONFIG } from "../config/VisualRenderConfig";

export interface SchoolBoatObstacle {
  x: number;
  z: number;
  radius: number;
}

export interface SchoolMotionContext {
  x: number;
  z: number;
  radius: number;
  feeding: number;
  boats: readonly SchoolBoatObstacle[];
  isWater: (x: number, z: number) => boolean;
}

const TAU = Math.PI * 2;

export interface SchoolFishMotion {
  x: number;
  z: number;
  vx: number;
  vz: number;
  depth: number;
}

/** Follow the feeding path with inertia; slide around hulls instead of snapping
 * across them when a moving boat crosses an individual fish's desired path.
 */
export function advanceSchoolFish(
  motion: SchoolFishMotion | undefined, delta: number, time: number, phase: number, context: SchoolMotionContext
) {
  const target = sampleSchoolFish(time, phase, context);
  const state = motion ?? { x: target.x, z: target.z, depth: target.depth, vx: 0, vz: 0 };
  let remaining = Math.min(Math.max(delta, 0), 0.25);
  while (remaining > 1e-6) {
    const dt = Math.min(remaining, 1 / 60);
    remaining -= dt;
    let vx = (target.x - state.x) * 2;
    let vz = (target.z - state.z) * 2;
    for (const boat of context.boats) {
      const dx = state.x - boat.x;
      const dz = state.z - boat.z;
      const distance = Math.max(0.001, Math.hypot(dx, dz));
      const safe = boat.radius + CANONICAL_RENDER_CONFIG.fishSchools.hullClearanceMeters;
      const influence = Math.max(0, Math.min(1, (safe + 1.2 - distance) / 1.2));
      const inward = Math.min(0, (vx * dx + vz * dz) / distance);
      vx -= inward * dx / distance * influence;
      vz -= inward * dz / distance * influence;
      const side = Math.sign(vx * -dz + vz * dx) || 1;
      vx += (-dz * side + dx * 0.3) / distance * influence;
      vz += (dx * side + dz * 0.3) / distance * influence;
    }
    const limit = Math.max(1, Math.hypot(vx, vz) / 1.65);
    const response = 1 - Math.exp(-5 * dt);
    state.vx += (vx / limit - state.vx) * response;
    state.vz += (vz / limit - state.vz) * response;
    let x = state.x + state.vx * dt;
    let z = state.z + state.vz * dt;
    for (const boat of context.boats) {
      const dx = x - boat.x;
      const dz = z - boat.z;
      const distance = Math.hypot(dx, dz);
      const safe = boat.radius + CANONICAL_RENDER_CONFIG.fishSchools.hullClearanceMeters;
      if (distance < safe) {
        const angle = distance > 0.001 ? Math.atan2(dz, dx) : phase * TAU;
        x = boat.x + Math.cos(angle) * safe;
        z = boat.z + Math.sin(angle) * safe;
      }
    }
    if (context.isWater(x, z)) {
      state.x = x;
      state.z = z;
    } else {
      state.vx = 0;
      state.vz = 0;
    }
    state.depth += (target.depth - state.depth) * response;
  }
  const visible = context.isWater(state.x, state.z) && context.boats.every(boat =>
    Math.hypot(state.x - boat.x, state.z - boat.z)
      >= boat.radius + CANONICAL_RENDER_CONFIG.fishSchools.hullClearanceMeters - 1e-5);
  return { motion: state, surface: target.surface, cycle: target.cycle, visible };
}

/** A quiet cruise, individual approach to food, surface sip, then a deeper return.
 * Absolute presentation time keeps culling and render frame rate out of the path.
 */
export function sampleSchoolFish(time: number, phase: number, context: SchoolMotionContext) {
  const cycleSeconds = 9 + phase * 4;
  const progress = time / cycleSeconds + phase;
  const cycle = Math.floor(progress);
  const beat = (progress - cycle) * TAU;
  const feedingPass = Math.pow((1 + Math.cos(beat)) * 0.5, 5);
  const reach = Math.min(context.radius * 0.8, CANONICAL_RENDER_CONFIG.fishSchools.roamingRadiusMeters);
  const angle = time * (0.16 + phase * 0.055) + phase * TAU
    + Math.sin(time * 0.13 + phase * 13) * 0.38;
  const radius = reach * (0.76 + 0.12 * Math.sin(time * 0.27 + phase * 17))
    * (1 - feedingPass * context.feeding * 0.5);
  let x = context.x + Math.cos(angle) * radius;
  let z = context.z + Math.sin(angle) * radius * 0.84;
  let clearance = 1;
  for (const boat of context.boats) {
    const dx = x - boat.x;
    const dz = z - boat.z;
    const distance = Math.hypot(dx, dz);
    const safeRadius = boat.radius + CANONICAL_RENDER_CONFIG.fishSchools.hullClearanceMeters;
    // Smooth positive part: the trajectory bends before reaching the hull,
    // without the hard corner of a clamped circular orbit.
    const deficit = safeRadius - distance;
    const push = (deficit + Math.sqrt(deficit * deficit + 0.16)) * 0.5;
    if (distance < safeRadius + 2) clearance = Math.min(clearance, Math.max(0, (distance - safeRadius + 1) / 3));
    const bearing = distance > 0.001 ? Math.atan2(dz, dx) : angle;
    x += Math.cos(bearing) * push;
    z += Math.sin(bearing) * push;
  }
  // If a shore confines the school, shorten the excursion toward its existing
  // water anchor. Never project through a boat to reach that anchor.
  if (!context.isWater(x, z)) {
    for (let step = 1; step <= 8; step++) {
      const fraction = 1 - step / 8;
      const candidateX = context.x + (x - context.x) * fraction;
      const candidateZ = context.z + (z - context.z) * fraction;
      if (context.isWater(candidateX, candidateZ) && context.boats.every(boat =>
        Math.hypot(candidateX - boat.x, candidateZ - boat.z)
          >= boat.radius + CANONICAL_RENDER_CONFIG.fishSchools.hullClearanceMeters)) {
        x = candidateX;
        z = candidateZ;
        break;
      }
    }
  }
  const visible = context.isWater(x, z) && context.boats.every(boat =>
    Math.hypot(x - boat.x, z - boat.z) >= boat.radius + CANONICAL_RENDER_CONFIG.fishSchools.hullClearanceMeters);
  const surface = feedingPass * (0.22 + context.feeding * 0.78) * (0.55 + clearance * 0.45);
  const depth = 0.65 + phase * 0.3 + (1 - Math.cos(beat)) * 0.18 - surface * 0.65;
  return { x, z, depth: Math.max(0.12, depth), surface, cycle, visible };
}
