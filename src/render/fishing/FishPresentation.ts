import * as THREE from "three";
import { CANONICAL_RENDER_CONFIG } from "../config/VisualRenderConfig";
import { PALETTE_HEX } from "../materials/PaletteTokens";
import type { SchoolFishMotion } from "./FishSchoolMotion";

const FISH_WATER_TINT = new THREE.Color(PALETTE_HEX.water_deep_01);

export type FishAnimationClip = "swim" | "turn" | "burst" | "struggle";

export interface FishPresentationMember {
  root: THREE.Group;
  phase: number;
  mixer: THREE.AnimationMixer | null;
  actions: Map<FishAnimationClip, THREE.AnimationAction>;
  activeClip: FishAnimationClip | null;
  tailPivot?: THREE.Object3D;
  visibilityMaterials: FishVisibilityMaterial[];
  lastFeedingCycle?: number;
  schoolMotion?: SchoolFishMotion;
}

export interface FishVisibilityMaterial {
  material: THREE.Material & { color?: THREE.Color };
  baseColor: THREE.Color | null;
  baseOpacity: number;
  baseTransparent: boolean;
  baseDepthTest: boolean;
  baseDepthWrite: boolean;
}


  /**
   * Fish GLB clones share catalog materials, so clone just the materials before
   * applying the water-visibility treatment. The treatment is presentation-only:
   * it never changes the simulation-owned fish depth or position.
   */

export function prepareFishVisibility(root: THREE.Group): FishVisibilityMaterial[] {
  const tracked: FishVisibilityMaterial[] = [];
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const originals = Array.isArray(object.material) ? object.material : [object.material];
    const clones = originals.map((material) => material.clone());
    object.material = Array.isArray(object.material) ? clones : clones[0];
    for (const material of clones) {
      const colored = material as THREE.Material & { color?: THREE.Color };
      tracked.push({
        material: colored,
        baseColor: colored.color?.clone() ?? null,
        baseOpacity: material.opacity,
        baseTransparent: material.transparent,
        baseDepthTest: material.depthTest,
        baseDepthWrite: material.depthWrite
      });
    }
  });
  return tracked;
}

export function updateFishVisibility(
  member: FishPresentationMember,
  depthMeters: number,
  prominence: number
): void {
  const submerged = depthMeters > 0.035;
  const depthFade = THREE.MathUtils.clamp(1 - depthMeters / 7, 0, 1);
  const opacity = THREE.MathUtils.lerp(0.42, 0.82, depthFade) * prominence;
  member.root.traverse((object) => {
    if (object instanceof THREE.Mesh) object.renderOrder = submerged ? 4 : 0;
  });
  for (const tracked of member.visibilityMaterials) {
    const { material } = tracked;
    material.transparent = submerged || tracked.baseTransparent;
    material.opacity = submerged ? Math.min(tracked.baseOpacity, opacity) : tracked.baseOpacity;
    // The water mesh is intentionally opaque and depth-writing. Let the fish
    // read through it as a soft teal silhouette instead of moving the fish out
    // of the simulation-owned depth.
    material.depthTest = submerged ? false : tracked.baseDepthTest;
    material.depthWrite = submerged ? false : tracked.baseDepthWrite;
    if (tracked.baseColor && material.color) {
      material.color.copy(tracked.baseColor);
      if (submerged) material.color.lerp(FISH_WATER_TINT, 0.24 + (1 - depthFade) * 0.22);
    }
  }
}

export function disposeFishVisibility(member: FishPresentationMember | null): void {
  member?.mixer?.stopAllAction();
  for (const tracked of member?.visibilityMaterials ?? []) tracked.material.dispose();
}

function setFishAnimation(member: FishPresentationMember, clipName: FishAnimationClip): void {
  if (member.activeClip === clipName) return;
  const next = member.actions.get(clipName) ?? member.actions.get("swim");
  if (!next) return;
  const resolvedClip = next === member.actions.get("swim") ? "swim" : clipName;
  const previous = member.activeClip ? member.actions.get(member.activeClip) : undefined;
  previous?.fadeOut(0.1);
  next.reset().fadeIn(0.1).play();
  member.activeClip = resolvedClip;
}

export function updateFishAnimation(
  member: FishPresentationMember,
  clipName: FishAnimationClip,
  delta: number,
  timeSeconds: number,
  prefersReducedMotion: boolean,
  beatScale = 1
): void {
  setFishAnimation(member, clipName);
  const beat = prefersReducedMotion
    ? CANONICAL_RENDER_CONFIG.motion.reducedMotionScale
    : beatScale;
  if (member.mixer) {
    member.mixer.timeScale = beat;
  }
  member.mixer?.update(delta);
  if (!member.mixer && member.tailPivot) {
    member.tailPivot.rotation.y = Math.sin(timeSeconds * 8.5 * beat + member.phase * Math.PI * 2)
      * 0.28
      * (prefersReducedMotion ? CANONICAL_RENDER_CONFIG.motion.reducedMotionScale : 1);
  }
}
