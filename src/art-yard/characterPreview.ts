import type { CharacterAnimationContext } from "../render/animation/AnimationController";
import type { RuntimeAssetSpec } from "../render/assets/AssetCatalog";
type PreviewAsset = Pick<RuntimeAssetSpec, "animationClips" | "additionalAnimationClips">;

/** Diagnostic inputs for the same controller used by game characters. */
export function characterPreviewContext(
  name: string,
  spec: PreviewAsset,
  companion: string | null
): CharacterAnimationContext {
  const clip = [...(spec.animationClips ?? []), ...(spec.additionalAnimationClips ?? [])]
    .find((entry) => entry.name === name);
  const moving = /^(walk|run|carry_walk|carry_run|mounted_walk|mounted_trot|mounted_gallop)/.test(name);
  const speed = moving ? clip?.referenceSpeedMetersPerSecond ?? 0 : 0;
  const airborne = ["jump", "jump_start", "fall"].includes(name);
  const fishing = ["fishing_idle", "reel", "slack", "brace", "hookset", "cast", "skiff_fishing"].includes(name);
  const boatTypeId = companion === "boat_rowboat_a" ? "boat.rowboat"
    : companion === "boat_skiff_a" ? "boat.skiff" : null;
  return {
    mode: companion === "fauna_donkey_a" ? "mounted"
      : fishing ? "sport-fishing" : boatTypeId ? "boat-driving" : "on-foot",
    carrying: name.startsWith("carry_"),
    talking: name === "talk_gesture",
    facingRadians: 0,
    motion: {
      velocity: { x: 0, y: 0, z: speed }, speedMetersPerSecond: speed,
      accelerationMetersPerSecondSquared: 0,
      turnRateRadiansPerSecond: name === "turn_left" ? 1.5 : name === "turn_right" ? -1.5 : 0,
      isGrounded: !airborne, groundNormal: { x: 0, y: 1, z: 0 }, slopeRadians: 0,
      airbornePhase: name === "fall" ? "falling" : airborne ? "rising" : "grounded",
      contactEvent: "none", landingImpactStrength: name === "land_hard" ? 1 : 0,
      contactSurface: "grass", isCollisionBlocked: false,
      requestedGait: name.includes("run") ? "run" : moving ? "walk" : "idle"
    },
    fishingInput: fishing ? {
      isReeling: name === "reel", isSlacking: name === "slack", isBracing: name === "brace",
      loadRatio: name === "brace" ? 0.85 : name === "slack" ? 0.1 : 0.4,
      rodDirectionAngle: 0, retrievalMetersPerSecond: name === "reel" ? 0.5 : 0
    } : undefined,
    boatInput: boatTypeId ? { boatTypeId, throttle: name === "row" || name === "skiff_drive" ? 0.7 : 0, steering: 0 } : undefined
  };
}

export function clipLoops(spec: PreviewAsset | null, name: string): boolean {
  return [...(spec?.animationClips ?? []), ...(spec?.additionalAnimationClips ?? [])]
    .find((clip) => clip.name === name)?.loop ?? false;
}

/** Keep the endpoint inspectable for one-shots, including scrub position 1. */
export function displayedClipTime(time: number, duration: number, loop: boolean): number {
  if (duration <= 0) return 0;
  return loop && time > duration ? time % duration : Math.min(duration, Math.max(0, time));
}
