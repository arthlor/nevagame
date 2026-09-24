import * as THREE from "three";
import { WorldLayout } from "../../world/WorldLayout";
import { worldIslandDefinitions } from "../../world/WorldIslands";
import { harborCoastInfluence } from "../../world/HarborCoast";

/*
 * Shore-foam placement. The water shader owns every rendered foam — the swash
 * lip, surf, contact and whitecaps — so these patches are no longer drawn as
 * separate quads (on smooth water they read as paper cut-outs). They remain
 * the deterministic record of where the coast is exposed enough for broken
 * wash, which the world diagnostic overlay and the coast tests audit.
 */

export interface ShoreFoamPatch {
  source: "coast";
  center: Readonly<{ x: number; z: number }>;
  tangent: Readonly<{ x: number; z: number }>;
  waterNormal: Readonly<{ x: number; z: number }>;
  length: number;
  width: number;
  phase: number;
  exposure: number;
}

export const SHORE_FOAM_STYLE = Object.freeze({
  coastSpacing: 4.6,
  minLength: 1.8,
  maxLength: 5.2,
  minWidth: 0.22,
  maxWidth: 0.64,
  maxAlpha: 0.42
});

function deterministicUnit(index: number, salt: number): number {
  const value = Math.sin(index * 91.731 + salt * 37.113) * 43758.5453;
  return value - Math.floor(value);
}

/**
 * Deterministic broken coastal wash. Patch placement walks every island's own
 * coast loop and takes boundary point, tangent and waterward normal from the
 * shared shore projection (W04.2): no global-X sweep, no southern-coast
 * special case. The continuous optical wash stays the primary foam owner on
 * every shore; these patches keep only the restrained broken accent where it
 * already owns the same water, and river/estuary banks stay foam-free.
 */
export function buildShoreFoamPatches(): ShoreFoamPatch[] {
  const patches: ShoreFoamPatch[] = [];
  let index = 0;
  for (const island of worldIslandDefinitions()) {
    const loop = island.coastLoop;
    for (let segment = 0; segment < loop.length; segment += 1) {
      const from = loop[segment];
      const to = loop[(segment + 1) % loop.length];
      const dx = to.x - from.x;
      const dz = to.z - from.z;
      const segmentLength = Math.hypot(dx, dz);
      const steps = Math.max(1, Math.round(segmentLength / SHORE_FOAM_STYLE.coastSpacing));
      for (let step = 0; step < steps; step += 1) {
        const sampleT = (step + 0.5) / steps;
        const sampleX = from.x + dx * sampleT;
        const sampleZ = from.z + dz * sampleT;
        index += 1;

        const shore = WorldLayout.shoreProjectionAt(sampleX, sampleZ);
        const boundary = shore.boundaryPointXZ;

        // The reference harbor is a protected comparison region: the
        // continuous harbor treatment owns it bit-exact.
        if (harborCoastInfluence(boundary.x, boundary.z) > 0.001) continue;

        // The estuary mouth keeps its own treatment; river banks stay clear.
        if (WorldLayout.estuaryInfluence(boundary.x, boundary.z) > 0.06) continue;

        // Zero contact means freshwater bank, deep land or open water; the
        // shared weight already resolves those reaches.
        const contact = WorldLayout.coastalContactWeightAt(boundary.x, boundary.z);
        if (contact <= 0) continue;

        const includeThreshold = 0.34 + contact * 0.34;
        if (deterministicUnit(index, 1) > includeThreshold) continue;

        const alongOffset = (deterministicUnit(index, 5) - 0.5) * 1.2;
        const waterOffset = 0.24 + deterministicUnit(index, 4) * 0.68;
        const length = THREE.MathUtils.lerp(
          SHORE_FOAM_STYLE.minLength,
          SHORE_FOAM_STYLE.maxLength,
          deterministicUnit(index, 2) * (0.56 + contact * 0.44)
        );
        const width = THREE.MathUtils.lerp(
          SHORE_FOAM_STYLE.minWidth,
          SHORE_FOAM_STYLE.maxWidth,
          deterministicUnit(index, 3) * contact
        );
        const center = {
          x: boundary.x + shore.tangentXZ.x * alongOffset + shore.waterwardNormalXZ.x * waterOffset,
          z: boundary.z + shore.tangentXZ.z * alongOffset + shore.waterwardNormalXZ.z * waterOffset
        };
        // The canonical water field and the projection can disagree by a metre
        // or two along the legacy southern coast; a foam quad that the field
        // calls dry ground is exactly the spill W04 forbids, so the whole
        // footprint has to clear the waterline.
        if (WorldLayout.waterSignedDistance(center.x, center.z) <= width * 0.5) continue;

        patches.push({
          source: "coast",
          center,
          tangent: shore.tangentXZ,
          waterNormal: shore.waterwardNormalXZ,
          length,
          width,
          phase: deterministicUnit(index, 6) * Math.PI * 2,
          // Restrained accent wherever the continuous treatment owns the shore.
          exposure: contact * (1 - contact * 0.82)
        });
      }
    }
  }

  return patches;
}
