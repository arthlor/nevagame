import * as THREE from "three";
import type { ClockState } from "../../simulation/core/types";
import { WorldLayout } from "../../world/WorldLayout";
import { CANONICAL_RENDER_CONFIG } from "../config/VisualRenderConfig";
import type { WeatherMotionSignal } from "../motion/WeatherMotionSignal";
import type { PlayerPresence } from "../presentation/PlayerPresence";
import {
  acknowledgeHeadYaw,
  ACKNOWLEDGE_HEAD_TURN_RADIUS_METERS,
  presenceFalloff
} from "../presentation/WorldAcknowledgment";
import { sampleAmbientTownsfolkPose, type AmbientAnimalRoute } from "./ambientTownsfolk";
import type { RigidAnimationBatch } from "./RigidAnimationBatch";

export interface FaunaMotionNode {
  object: THREE.Object3D;
  basePosition: THREE.Vector3;
  baseRotation: THREE.Euler;
}

export type FaunaAnimationClip = "idle" | "graze" | "peck" | "look" | "hop" | "paddle" | "dabble";
export type FaunaKind = "cow" | "chicken" | "rabbit" | "donkey" | "sheep" | "duck";

/** Catalog-fauna counterpart to `AmbientTownsfolkPresentation`. */
export interface AmbientAnimalPresentation {
  route: AmbientAnimalRoute;
  object: THREE.Group;
  mixer: THREE.AnimationMixer | null;
  actions: Map<string, THREE.AnimationAction>;
  activeClip: string | null;
  lastAnimationUpdateSeconds: number;
}

export interface FaunaPresentation {
  id: string;
  kind: Exclude<FaunaKind, "donkey">;
  phase: number;
  root: THREE.Group;
  body: FaunaMotionNode;
  head?: FaunaMotionNode;
  tail?: FaunaMotionNode;
  wings: readonly FaunaMotionNode[];
  mixer: THREE.AnimationMixer | null;
  actions: Map<FaunaAnimationClip, THREE.AnimationAction>;
  activeClip: FaunaAnimationClip | null;
  lastMotionUpdateSeconds: number;
}


interface FaunaMotionContext {
  faunaPresentations: readonly FaunaPresentation[];
  ambientAnimals: readonly AmbientAnimalPresentation[];
  visibilityAnchor: THREE.Vector3;
  rigidAnimationBatches: ReadonlyMap<THREE.Object3D, RigidAnimationBatch>;
  weatherMotion: WeatherMotionSignal;
  playerPresence: PlayerPresence;
  prefersReducedMotion: boolean;
}

function setFaunaAnimation(fauna: FaunaPresentation, clipName: FaunaAnimationClip): void {
  if (fauna.activeClip === clipName) return;
  const next = fauna.actions.get(clipName) ?? fauna.actions.get("idle");
  if (!next) return;
  const resolvedClip = next === fauna.actions.get("idle") ? "idle" : clipName;
  const previous = fauna.activeClip ? fauna.actions.get(fauna.activeClip) : undefined;
  previous?.fadeOut(0.18);
  next.reset().fadeIn(0.18).play();
  fauna.activeClip = resolvedClip;
}

export function updateFaunaMotion(context: FaunaMotionContext, timeSeconds: number, delta: number, motionScale: number): void {
  const windLean = context.weatherMotion.directionX
    * context.weatherMotion.normalizedStrength
    * (0.025 + context.weatherMotion.gust * 0.004)
    * motionScale;
  for (const fauna of context.faunaPresentations) {
    const dx = fauna.root.position.x - context.visibilityAnchor.x;
    const dz = fauna.root.position.z - context.visibilityAnchor.z;
    const distanceSq = dx * dx + dz * dz;
    const visible = distanceSq <= 150 * 150;
    if (visible !== fauna.root.visible) {
      fauna.root.visible = visible;
      context.rigidAnimationBatches.get(fauna.root)?.markDirty();
    }
    if (!visible) continue;
    const interval = distanceSq <= 36 * 36 ? 0 : distanceSq <= 85 * 85 ? 1 / 12 : 0.4;
    if (timeSeconds - fauna.lastMotionUpdateSeconds < interval) continue;
    context.rigidAnimationBatches.get(fauna.root)?.markDirty();
    const faunaDelta = fauna.lastMotionUpdateSeconds > 0
      ? Math.min(0.4, timeSeconds - fauna.lastMotionUpdateSeconds)
      : delta;
    fauna.lastMotionUpdateSeconds = timeSeconds;
    const localTime = timeSeconds + fauna.phase * 9.7;
    const cycle = localTime % (
      fauna.kind === "cow" ? 13
        : fauna.kind === "sheep" ? 12
          : fauna.kind === "duck" ? 8.4
            : fauna.kind === "rabbit" ? 6.4 : 7.5
    );
    const breathing = Math.sin(localTime * (fauna.kind === "cow" || fauna.kind === "sheep" ? 1.25 : 2.1));
    const activity = fauna.kind === "cow"
      ? smoothPresentationWindow(cycle, 3.2, 8.4, 0.9)
      : fauna.kind === "rabbit"
        ? smoothPresentationWindow(cycle, 1.4, 2.4, 0.22)
        : fauna.kind === "sheep"
          // A sheep grazes far more of its cycle than it does anything else;
          // a flock that mostly stands still reads as a row of statues.
          ? smoothPresentationWindow(cycle, 1.6, 8.2, 0.8)
          : fauna.kind === "duck"
            ? smoothPresentationWindow(cycle, 2.2, 4.6, 0.5)
            : smoothPresentationWindow(cycle, 1.1, 4.3, 0.32);
    const lookActivity = fauna.kind === "cow"
      ? smoothPresentationWindow(cycle, 10.1, 12.2, 0.35)
      : fauna.kind === "rabbit"
        ? smoothPresentationWindow(cycle, 3.6, 5.2, 0.28)
        : fauna.kind === "sheep"
          ? smoothPresentationWindow(cycle, 9.4, 11.1, 0.3)
          : fauna.kind === "duck"
            ? smoothPresentationWindow(cycle, 6.1, 7.4, 0.3)
            : smoothPresentationWindow(cycle, 5.2, 7, 0.25);
    const acknowledgesPlayer = !context.prefersReducedMotion
      && presenceFalloff(context.playerPresence, fauna.root.position.x, fauna.root.position.z,
        ACKNOWLEDGE_HEAD_TURN_RADIUS_METERS) > 0.2;
    const restingClip: FaunaAnimationClip = fauna.kind === "duck" ? "paddle" : "idle";
    const desiredClip: FaunaAnimationClip = context.prefersReducedMotion
      ? restingClip
      : acknowledgesPlayer && fauna.kind !== "duck"
        ? "look"
        : activity > 0.05
          ? fauna.kind === "cow" || fauna.kind === "sheep"
            ? "graze"
            : fauna.kind === "rabbit"
              ? "hop"
              : fauna.kind === "duck" ? "dabble" : "peck"
          : lookActivity > 0.05 && fauna.kind !== "duck" ? "look" : restingClip;
    setFaunaAnimation(fauna, desiredClip);
    if (fauna.mixer) {
      fauna.mixer.timeScale = context.prefersReducedMotion
        ? CANONICAL_RENDER_CONFIG.motion.reducedMotionScale
        : 1;
    }
    fauna.mixer?.update(faunaDelta);

    if (!fauna.mixer) {
      fauna.body.object.position.y = fauna.body.basePosition.y
        + breathing * (fauna.kind === "cow" ? 0.012 : 0.009) * motionScale;
      fauna.body.object.rotation.x = fauna.body.baseRotation.x;
      fauna.body.object.rotation.y = fauna.body.baseRotation.y
        + Math.sin(localTime * 0.31) * (fauna.kind === "cow" ? 0.035 : 0.08) * motionScale;
      fauna.body.object.rotation.z = fauna.body.baseRotation.z + windLean;
    }

    if (fauna.head && !fauna.mixer) {
      const peck = fauna.kind === "chicken"
        ? Math.max(0, Math.sin((cycle - 1.1) * Math.PI * 3.2)) * activity
        : activity;
      fauna.head.object.rotation.x = fauna.head.baseRotation.x
        + (fauna.kind === "cow" ? 0.72 * activity : 0.86 * peck) * motionScale;
      fauna.head.object.rotation.y = fauna.head.baseRotation.y
        + Math.sin(localTime * 0.67 + fauna.phase) * 0.18 * (1 - activity * 0.65) * motionScale
        + acknowledgeHeadYaw(
          context.playerPresence,
          fauna.root.position.x,
          fauna.root.position.z,
          fauna.root.rotation.y
        ) * 0.6 * (1 - activity * 0.5);
      fauna.head.object.rotation.z = fauna.head.baseRotation.z - windLean * 0.45;
    }
    if (fauna.tail) {
      fauna.tail.object.rotation.y = fauna.tail.baseRotation.y
        + Math.sin(localTime * 1.7 + fauna.phase) * 0.22 * motionScale;
    }
    for (const [index, wing] of fauna.wings.entries()) {
      const wingSign = index === 0 ? -1 : 1;
      wing.object.rotation.y = wing.baseRotation.y
        + wingSign * Math.sin(localTime * 2.4 + fauna.phase) * 0.08 * motionScale;
      wing.object.rotation.z = wing.baseRotation.z + wingSign * windLean * 1.8;
    }
  }
}


export function updateAmbientAnimals(
  context: FaunaMotionContext,
  clock: Pick<ClockState, "timeOfDay">,
  timeSeconds: number,
  delta: number,
  motionScale: number
): void {
  for (const animal of context.ambientAnimals) {
    const { route } = animal;
    const dx = animal.object.position.x - context.visibilityAnchor.x;
    const dz = animal.object.position.z - context.visibilityAnchor.z;
    const distanceSq = dx * dx + dz * dz;
    const visible = distanceSq <= 140 * 140;
    if (visible !== animal.object.visible) {
      animal.object.visible = visible;
      context.rigidAnimationBatches.get(animal.object)?.markDirty();
    }
    if (!visible) continue;

    const pose = sampleAmbientTownsfolkPose(route, clock, timeSeconds, motionScale);
    animal.object.position.set(
      pose.x,
      WorldLayout.traversalSurfaceHeight(pose.x, pose.z),
      pose.z
    );
    animal.object.rotation.y = pose.heading;
    context.rigidAnimationBatches.get(animal.object)?.markDirty();

    const settled = clock.timeOfDay === "night" && !pose.walking;
    const desired = pose.walking
      ? route.walkClip
      : settled ? route.restClip : route.idleClip;
    if (desired !== animal.activeClip) {
      const next = animal.actions.get(desired) ?? animal.actions.get(route.idleClip);
      if (next) {
        const previous = animal.activeClip ? animal.actions.get(animal.activeClip) : undefined;
        // The rest clips are held poses (the dog sat, the cat curled), so settling into or
        // getting up out of one takes a beat longer than a gait change does.
        const fade = desired === route.restClip || animal.activeClip === route.restClip ? 0.7 : 0.22;
        previous?.fadeOut(fade);
        next.reset().fadeIn(fade).play();
        animal.activeClip = desired;
      }
    }
    if (!animal.mixer) continue;
    // Keep the authored stride matched to the drift speed, so the paws do not
    // skate: the drift covers its ring in `loopSeconds` minus the rest hold.
    const ringLength = route.waypoints.reduce((total, from, index) => {
      const to = route.waypoints[(index + 1) % route.waypoints.length];
      return total + Math.hypot(to.dx - from.dx, to.dz - from.dz);
    }, 0);
    const walkSeconds = Math.max(0.001, route.loopSeconds * (1 - route.restFraction));
    const driftSpeed = ringLength / walkSeconds;
    animal.mixer.timeScale = context.prefersReducedMotion
      ? CANONICAL_RENDER_CONFIG.motion.reducedMotionScale
      : animal.activeClip === route.walkClip
        ? Math.min(1.8, Math.max(0.6, driftSpeed / route.walkReferenceSpeed))
        : 1;
    const interval = distanceSq <= 40 * 40 ? 0 : distanceSq <= 90 * 90 ? 1 / 12 : 0.4;
    if (timeSeconds - animal.lastAnimationUpdateSeconds < interval) continue;
    const animalDelta = animal.lastAnimationUpdateSeconds > 0
      ? Math.min(0.4, timeSeconds - animal.lastAnimationUpdateSeconds)
      : delta;
    animal.lastAnimationUpdateSeconds = timeSeconds;
    animal.mixer.update(animalDelta);
  }
}


function smoothPresentationWindow(
value: number,
start: number,
end: number,
edge: number
): number {
const enter = THREE.MathUtils.smoothstep(value, start, start + edge);
const exit = 1 - THREE.MathUtils.smoothstep(value, end - edge, end);
return Math.min(enter, exit);
}
