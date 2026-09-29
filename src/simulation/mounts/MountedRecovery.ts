import type { MountState } from "../core/types";
import { WorldLayout } from "../../world/WorldLayout";
import { carriageFootprint, isCarriage, isCarriageGround } from "./Carriage";
import { isMountableTraversalPoint, isValidMountPose } from "./Mounts";
import { MOUNT_RECALL_TUNING } from "./MountRecall";

/** Local depenetration only: never a route to a landing or an unloaded wagon. */
export const MOUNTED_RECOVERY_TUNING = Object.freeze({
  candidateRadiiMeters: [0.14, 0.28, 0.45, 0.7, 1.05, 1.5, 2.05] as const,
  headings: 16,
  maximumHeightStepMeters: 0.9,
  riderRadiusMeters: 0.62,
  donkeyBodyRadiusMeters: 0.42
});

export type MountPoseClearQuery = (mount: Readonly<MountState>, from?: Readonly<MountState>) => boolean;

export function mountedFootprint(mount: Readonly<MountState>): Array<{ x: number; z: number; radius: number }> {
  if (isCarriage(mount)) return carriageFootprint(mount);
  const reach = MOUNT_RECALL_TUNING.bodyHalfLengthMeters;
  const dx = Math.sin(mount.rotationY) * reach;
  const dz = Math.cos(mount.rotationY) * reach;
  return [
    { x: mount.x, z: mount.z, radius: MOUNTED_RECOVERY_TUNING.riderRadiusMeters },
    { x: mount.x - dx, z: mount.z - dz, radius: MOUNTED_RECOVERY_TUNING.donkeyBodyRadiusMeters },
    { x: mount.x + dx, z: mount.z + dz, radius: MOUNTED_RECOVERY_TUNING.donkeyBodyRadiusMeters }
  ];
}

export function isMountedFootprintSupported(mount: Readonly<MountState>): boolean {
  if (!isValidMountPose(mount)) return false;
  if (isCarriage(mount) && !isCarriageGround(mount)) return false;
  return mountedFootprint(mount).every(p => [
    [p.x, p.z], [p.x + p.radius, p.z], [p.x - p.radius, p.z],
    [p.x, p.z + p.radius], [p.x, p.z - p.radius]
  ].every(([x, z]) => isMountableTraversalPoint(x, z)
    && Math.abs(WorldLayout.traversalSurfaceHeight(x, z) - mount.y) <= MOUNTED_RECOVERY_TUNING.maximumHeightStepMeters));
}

export function resolveMountedRecovery(
  mount: Readonly<MountState>, clear: MountPoseClearQuery
): { success: true; pose: Pick<MountState, "x" | "y" | "z" | "rotationY"> } | { success: false; reason: string } {
  if (isMountedFootprintSupported(mount) && clear(mount)) {
    return { success: false, reason: "Your mount is already on clear ground" };
  }
  const island = WorldLayout.islandAt(mount.x, mount.z);
  const ground = WorldLayout.traversalSurfaceHeight(mount.x, mount.z);
  if (island) for (const radius of MOUNTED_RECOVERY_TUNING.candidateRadiiMeters) {
    for (let i = 0; i < MOUNTED_RECOVERY_TUNING.headings; i++) {
      const heading = mount.rotationY + i * Math.PI * 2 / MOUNTED_RECOVERY_TUNING.headings;
      const x = mount.x + Math.sin(heading) * radius;
      const z = mount.z + Math.cos(heading) * radius;
      const y = WorldLayout.traversalSurfaceHeight(x, z);
      const candidate = { ...mount, x, y, z };
      if (WorldLayout.islandAt(x, z) !== island
        || Math.abs(y - ground) > MOUNTED_RECOVERY_TUNING.maximumHeightStepMeters
        || !isMountedFootprintSupported(candidate) || !clear(candidate, mount)) continue;
      // A nearby dry endpoint must not let a loaded assembly cross a wet gap or steep bank.
      const steps = Math.ceil(radius / 0.2);
      if (!Array.from({ length: steps }, (_, step) => {
        const t = (step + 1) / steps;
        const px = mount.x + (x - mount.x) * t, pz = mount.z + (z - mount.z) * t;
        return isMountedFootprintSupported({ ...mount, x: px, z: pz, y: WorldLayout.traversalSurfaceHeight(px, pz) });
      }).every(Boolean)) continue;
      return { success: true, pose: { x, y, z, rotationY: mount.rotationY } };
    }
  }
  return { success: false, reason: "No clear ground nearby for your mount. Try backing out or dismounting." };
}
