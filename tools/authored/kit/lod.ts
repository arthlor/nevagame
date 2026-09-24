import * as THREE from "three";

import type { CatalogAssetSpec } from "./types";

/**
 * Authored LOD levels.
 *
 * Rather than decimating LOD0 after the fact, a generator builds itself once per catalog LOD level at
 * decreasing detail (fewer loft sides and stations, small parts dropped or merged). Every level keeps
 * clean silhouettes, whole palette faces and a valid `COLOR_0`, which mesh decimation cannot promise.
 *
 * Each level's content goes under a node named for that level (`spec.lodLevels[i].node`), all as
 * siblings under `parent`: the ownership contract the pipeline validates (every mesh belongs to
 * exactly one level, triangle ratios within the catalog's bounds) and the runtime turns into a
 * `THREE.LOD` distance switch.
 */
export function assembleLodLevels(
  spec: CatalogAssetSpec,
  parent: THREE.Object3D,
  buildLevel: (levelIndex: number) => THREE.Object3D
): THREE.Group[] {
  const levels = spec.lodLevels ?? [];
  if (!levels.length) throw new Error(`${spec.id}: assembleLodLevels needs catalog lodLevels`);
  return levels.map((level, index) => {
    const node = new THREE.Group();
    node.name = level.node;
    node.add(buildLevel(index));
    parent.add(node);
    return node;
  });
}

/** Scales a detail count (sides, stations, blades) for a LOD level, never below `minimum`. */
export function lodDetail(base: number, levelIndex: number, falloff = 0.55, minimum = 3): number {
  return Math.max(minimum, Math.round(base * falloff ** levelIndex));
}
