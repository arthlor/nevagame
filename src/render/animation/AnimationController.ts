import * as THREE from "three";
import type { PlayerMotionSample } from "../../simulation/core/PhysicsAdapter";
import type { GameMode } from "../../simulation/core/types";
import {
  ASSET_BY_ID,
  type AssetId,
  type RuntimeAnimationClipSpec
} from "../assets/AssetCatalog";
import { CANONICAL_RENDER_CONFIG } from "../config/VisualRenderConfig";

export type PlayerAnimation =
  | "idle"
  | "walk_start"
  | "walk"
  | "run_start"
  | "run"
  | "stop"
  | "turn_left"
  | "turn_right"
  | "jump"
  | "plant"
  | "water"
  | "harvest"
  | "pickup"
  | "carry_idle"
  | "carry_walk"
  | "carry_run"
  | "place"
  | "workstation"
  | "cast"
  | "fishing_idle"
  | "reel"
  | "slack"
  | "brace"
  | "board"
  | "dock"
  | "rowboat_idle"
  | "row";

export interface BoatAnimationInput {
  boatTypeId: string;
  throttle: number;
  steering: number;
}

export interface CharacterAnimationContext {
  mode: GameMode;
  motion: PlayerMotionSample;
  carrying: boolean;
  fishingInput?: {
    isReeling: boolean;
    isSlacking: boolean;
    isBracing: boolean;
  };
  boatInput?: BoatAnimationInput;
}

export interface CharacterAnimationEvent {
  name: string;
  clip: PlayerAnimation;
}

export interface CharacterMotionFrame {
  bobY: number;
  leanX: number;
  leanZ: number;
  clip: PlayerAnimation;
  events: readonly CharacterAnimationEvent[];
}

interface RigPart {
  object: THREE.Object3D;
  position: THREE.Vector3;
  rotation: THREE.Euler;
}

interface ManagedTransition {
  clip: PlayerAnimation;
  next: PlayerAnimation;
  elapsed: number;
}

const LOOPING_CLIPS = new Set<PlayerAnimation>([
  "idle", "walk", "run", "carry_idle", "carry_walk", "carry_run",
  "fishing_idle", "reel", "slack", "brace", "rowboat_idle", "row"
]);
const MOVING_CLIPS = new Set<PlayerAnimation>([
  "walk", "run", "carry_walk", "carry_run"
]);

const RIG_ALIASES: Record<string, readonly string[]> = {
  arm_left: ["character_upper_arm_left", "arm_left"],
  arm_right: ["character_upper_arm_right", "arm_right"],
  forearm_left: ["character_forearm_left", "forearm_left", "char_player_hand_left"],
  forearm_right: ["character_forearm_right", "forearm_right", "char_player_hand_right"],
  thigh_left: ["character_thigh_left", "thigh_left"],
  thigh_right: ["character_thigh_right", "thigh_right"],
  shin_left: ["character_shin_left", "shin_left"],
  shin_right: ["character_shin_right", "shin_right"],
  boot_left: ["character_boot_left", "boot_left"],
  boot_right: ["character_boot_right", "boot_right"]
};

export function isPlayerRigObjectName(name: string): boolean {
  return Object.values(RIG_ALIASES).some((aliases) =>
    aliases.some((alias) => name === alias || name.includes(`__${alias}_`))
  );
}

/** Catalog-driven clip state machine. Game state never depends on this class. */
export class AnimationController {
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<PlayerAnimation, THREE.AnimationAction>();
  private readonly specs = new Map<PlayerAnimation, RuntimeAnimationClipSpec>();
  private readonly rigParts = new Map<string, RigPart>();
  private activeClip: PlayerAnimation = "idle";
  private activeClipElapsed = 0;
  private activePlaybackScale = 1;
  private activeAction: PlayerAnimation | null = null;
  private actionElapsed = 0;
  private transition: ManagedTransition | null = null;
  private lastDesired: PlayerAnimation = "idle";
  private elapsed = 0;

  public constructor(root: THREE.Object3D) {
    this.mixer = new THREE.AnimationMixer(root);
    const asset = ASSET_BY_ID.get(root.userData.assetId as AssetId);
    for (const spec of asset?.animationClips ?? []) {
      if (this.isAnimationName(spec.name)) this.specs.set(spec.name, spec);
    }
    const clips = (root.userData.animationClips as THREE.AnimationClip[] | undefined) ?? [];
    for (const clip of clips) {
      if (!this.isAnimationName(clip.name)) continue;
      this.actions.set(clip.name, this.mixer.clipAction(clip));
      if (!this.specs.has(clip.name)) {
        this.specs.set(clip.name, {
          name: clip.name,
          durationSeconds: clip.duration,
          loop: LOOPING_CLIPS.has(clip.name)
        });
      }
    }
    root.traverse((object) => {
      for (const [semantic, aliases] of Object.entries(RIG_ALIASES)) {
        if (!aliases.some((alias) => object.name === alias || object.name.includes(`__${alias}_`))) continue;
        if (!this.rigParts.has(semantic)) {
          this.rigParts.set(semantic, {
            object,
            position: object.position.clone(),
            rotation: object.rotation.clone()
          });
        }
      }
    });
  }

  public play(action: PlayerAnimation): void {
    if (action === "idle") {
      this.cancelAction();
      return;
    }
    const spec = this.specs.get(action);
    if (spec?.loop) return;
    this.activeAction = action;
    this.actionElapsed = 0;
    this.transition = null;
  }

  public cancelAction(): void {
    this.activeAction = null;
    this.actionElapsed = 0;
  }

  public currentClip(): PlayerAnimation {
    return this.activeClip;
  }

  public playbackState(): Readonly<{
    clip: PlayerAnimation;
    playbackScale: number;
    activeAction: PlayerAnimation | null;
  }> {
    return {
      clip: this.activeClip,
      playbackScale: this.activePlaybackScale,
      activeAction: this.activeAction
    };
  }

  public update(
    deltaSeconds: number,
    context: CharacterAnimationContext,
    reducedMotion: boolean = false
  ): CharacterMotionFrame {
    const dt = THREE.MathUtils.clamp(deltaSeconds, 0, 0.1);
    this.elapsed += dt;
    const desired = this.desiredClip(context);
    this.updateAction(dt);

    let selected = this.activeAction ?? desired;
    if (!this.activeAction) selected = this.resolveTransition(selected, context.motion, dt);
    this.lastDesired = desired;
    this.setClip(selected, context.motion.speedMetersPerSecond, context.boatInput);

    const before = this.activeClipElapsed;
    const spec = this.specs.get(this.activeClip);
    const duration = spec?.durationSeconds ?? this.actions.get(this.activeClip)?.getClip().duration ?? 1;
    this.activeClipElapsed += dt * this.activePlaybackScale;
    const events = this.collectEvents(
      spec,
      before,
      this.activeClipElapsed,
      duration,
      context.motion,
      this.activePlaybackScale
    );
    if (spec?.loop && duration > 0) {
      this.activeClipElapsed = ((this.activeClipElapsed % duration) + duration) % duration;
    }

    if (this.actions.has(this.activeClip)) {
      this.restoreProceduralRig(dt);
      this.mixer.update(dt);
      return {
        bobY: reducedMotion ? 0 : this.additiveBob(context),
        leanX: reducedMotion ? 0 : this.additiveLean(context),
        leanZ: 0,
        clip: this.activeClip,
        events
      };
    }
    this.fadeOutClip();
    this.mixer.update(dt);
    return this.applyProceduralPose(dt, this.activeClip, context.motion, reducedMotion, events);
  }

  private desiredClip(context: CharacterAnimationContext): PlayerAnimation {
    const { mode, motion, carrying, fishingInput, boatInput } = context;
    if (!motion.isGrounded && mode === "on-foot") return "jump";
    if (mode === "sport-fishing") {
      if (fishingInput?.isBracing) return "brace";
      if (fishingInput?.isSlacking) return "slack";
      if (fishingInput?.isReeling) return "reel";
      return "fishing_idle";
    }
    if (mode === "basic-fishing") return "fishing_idle";
    if (mode === "boat-driving") {
      if (boatInput?.boatTypeId !== "boat.rowboat") return "idle";
      return Math.abs(boatInput.throttle) > 0.05 ? "row" : "rowboat_idle";
    }
    if (motion.speedMetersPerSecond <= 0.1 || motion.isCollisionBlocked) {
      return carrying ? "carry_idle" : "idle";
    }
    const running = motion.requestedGait === "run";
    if (carrying) return running ? "carry_run" : "carry_walk";
    return running ? "run" : "walk";
  }

  private resolveTransition(
    desired: PlayerAnimation,
    motion: PlayerMotionSample,
    dt: number
  ): PlayerAnimation {
    if (this.transition) {
      this.transition.elapsed += dt;
      this.transition.next = desired;
      const duration = this.specs.get(this.transition.clip)?.durationSeconds ?? 0;
      if (duration > 0 && this.transition.elapsed < duration) return this.transition.clip;
      const next = this.transition.next;
      this.transition = null;
      return next;
    }
    if (desired === this.lastDesired) return desired;
    const wasMoving = MOVING_CLIPS.has(this.lastDesired);
    const isMoving = MOVING_CLIPS.has(desired);
    const wasStationaryGait = this.lastDesired === "idle" || this.lastDesired === "carry_idle";
    const isStationaryGait = desired === "idle" || desired === "carry_idle";
    if (wasStationaryGait && isMoving) {
      const clip = desired === "run" || desired === "carry_run" ? "run_start" : "walk_start";
      if (this.actions.has(clip)) {
        this.transition = { clip, next: desired, elapsed: 0 };
        return clip;
      }
    }
    if (wasMoving && isStationaryGait && this.actions.has("stop")) {
      this.transition = { clip: "stop", next: desired, elapsed: 0 };
      return "stop";
    }
    if (!isMoving && Math.abs(motion.turnRateRadiansPerSecond) > 0.8) {
      const clip = motion.turnRateRadiansPerSecond > 0 ? "turn_left" : "turn_right";
      if (this.actions.has(clip)) {
        this.transition = { clip, next: desired, elapsed: 0 };
        return clip;
      }
    }
    return desired;
  }

  private updateAction(dt: number): void {
    if (!this.activeAction) return;
    this.actionElapsed += dt;
    const spec = this.specs.get(this.activeAction);
    const duration = spec?.durationSeconds ?? this.actions.get(this.activeAction)?.getClip().duration ?? 0.6;
    if (this.actionElapsed >= duration) this.cancelAction();
  }

  private setClip(
    next: PlayerAnimation,
    speed: number,
    boatInput?: BoatAnimationInput
  ): void {
    const spec = this.specs.get(next);
    const scale = next === "row" && boatInput
      ? (boatInput.throttle < 0 ? -1 : 1)
        * THREE.MathUtils.clamp(0.68 + Math.abs(boatInput.throttle) * 0.62, 0.68, 1.3)
      : spec?.referenceSpeedMetersPerSecond
        ? THREE.MathUtils.clamp(speed / spec.referenceSpeedMetersPerSecond, 0.65, 1.35)
        : 1;
    if (next === this.activeClip) {
      this.activePlaybackScale = scale;
      this.actions.get(next)?.setEffectiveTimeScale(scale);
      return;
    }
    const blend = CANONICAL_RENDER_CONFIG.motion.locomotionBlendSeconds;
    this.actions.get(this.activeClip)?.fadeOut(blend);
    const nextAction = this.actions.get(next);
    if (nextAction) {
      nextAction.reset();
      if (scale < 0) nextAction.time = Math.max(0, (spec?.durationSeconds ?? nextAction.getClip().duration) - 0.0001);
      nextAction.clampWhenFinished = !spec?.loop;
      nextAction.setLoop(spec?.loop ? THREE.LoopRepeat : THREE.LoopOnce, spec?.loop ? Infinity : 1);
      nextAction.setEffectiveTimeScale(scale).fadeIn(blend).play();
    }
    this.activeClip = next;
    this.activeClipElapsed = scale < 0 ? spec?.durationSeconds ?? 0 : 0;
    this.activePlaybackScale = scale;
  }

  private collectEvents(
    spec: RuntimeAnimationClipSpec | undefined,
    before: number,
    after: number,
    duration: number,
    motion: PlayerMotionSample,
    playbackScale: number
  ): CharacterAnimationEvent[] {
    const rowing = this.activeClip === "row";
    if (
      !spec?.events?.length
      || (!rowing && motion.speedMetersPerSecond <= 0.15)
      || !motion.isGrounded
      || motion.isCollisionBlocked
    ) {
      return [];
    }
    const forward = playbackScale >= 0;
    const wrapped = spec.loop && (forward ? after >= duration : after < 0);
    return spec.events
      .filter((event) => {
        if (forward) {
          return wrapped
            ? event.timeSeconds > before || event.timeSeconds <= after % duration
            : event.timeSeconds > before && event.timeSeconds <= after;
        }
        const wrappedAfter = duration + after;
        return wrapped
          ? event.timeSeconds < before || event.timeSeconds >= wrappedAfter
          : event.timeSeconds < before && event.timeSeconds >= after;
      })
      .map((event) => ({ name: event.name, clip: this.activeClip }));
  }

  private additiveBob(context: CharacterAnimationContext): number {
    if (!MOVING_CLIPS.has(this.activeClip)) return 0;
    return Math.abs(Math.sin(this.elapsed * 8.2)) * 0.012 *
      THREE.MathUtils.clamp(context.motion.speedMetersPerSecond / 5.6, 0, 1);
  }

  private additiveLean(context: CharacterAnimationContext): number {
    if (!MOVING_CLIPS.has(this.activeClip)) return 0;
    return -0.025 * THREE.MathUtils.clamp(
      context.motion.accelerationMetersPerSecondSquared / 18,
      0,
      1
    );
  }

  private isAnimationName(value: string): value is PlayerAnimation {
    return [
      "idle", "walk_start", "walk", "run_start", "run", "stop", "turn_left", "turn_right",
      "jump", "plant", "water", "harvest", "pickup", "carry_idle", "carry_walk", "carry_run",
      "place", "workstation", "cast", "fishing_idle", "reel", "slack", "brace", "board", "dock",
      "rowboat_idle", "row"
    ].includes(value);
  }

  private fadeOutClip(): void {
    this.actions.get(this.activeClip)?.fadeOut(CANONICAL_RENDER_CONFIG.motion.locomotionBlendSeconds);
  }

  private restoreProceduralRig(deltaSeconds: number): void {
    const smoothing = 1 - Math.exp(-18 * Math.max(0, deltaSeconds));
    for (const part of this.rigParts.values()) {
      part.object.position.lerp(part.position, smoothing);
      part.object.rotation.x = THREE.MathUtils.lerp(part.object.rotation.x, part.rotation.x, smoothing);
      part.object.rotation.y = THREE.MathUtils.lerp(part.object.rotation.y, part.rotation.y, smoothing);
      part.object.rotation.z = THREE.MathUtils.lerp(part.object.rotation.z, part.rotation.z, smoothing);
    }
  }

  private posePart(name: string, pivotY: number, angleX: number, smoothing: number): void {
    const part = this.rigParts.get(name);
    if (!part) return;
    const cosine = Math.cos(angleX);
    const sine = Math.sin(angleX);
    const relativeY = part.position.y - pivotY;
    const relativeZ = part.position.z;
    part.object.position.lerp(new THREE.Vector3(
      part.position.x,
      pivotY + relativeY * cosine - relativeZ * sine,
      relativeY * sine + relativeZ * cosine
    ), smoothing);
    part.object.rotation.x = THREE.MathUtils.lerp(
      part.object.rotation.x,
      part.rotation.x + angleX,
      smoothing
    );
  }

  private applyProceduralPose(
    dt: number,
    clip: PlayerAnimation,
    motion: PlayerMotionSample,
    reducedMotion: boolean,
    events: readonly CharacterAnimationEvent[]
  ): CharacterMotionFrame {
    const smoothing = 1 - Math.exp(-18 * Math.max(0, dt));
    const rate = clip === "run" || clip === "carry_run" ? 11.2 : 8.2;
    const strength = clip === "run" || clip === "carry_run" ? 0.5 : MOVING_CLIPS.has(clip) ? 0.34 : 0;
    const step = Math.sin(this.elapsed * rate) * strength;
    let leftArm = step;
    let rightArm = -step;
    let leftLeg = -step * 0.76;
    let rightLeg = step * 0.76;
    if (clip === "jump") {
      leftArm = 0.18;
      rightArm = -0.18;
      leftLeg = -0.32;
      rightLeg = -0.2;
    } else if (clip === "rowboat_idle" || clip === "row") {
      const stroke = clip === "row" ? Math.sin(this.elapsed * 4.2) : 0;
      leftArm = rightArm = -0.58 + stroke * 0.34;
      leftLeg = rightLeg = 1.12;
    } else if (clip === "reel" || clip === "brace" || clip === "slack") {
      leftArm = -0.58;
      rightArm = -0.72 + Math.cos(this.elapsed * 5.4) * 0.16;
    } else if (this.activeAction) {
      const duration = this.specs.get(this.activeAction)?.durationSeconds ?? 0.6;
      const contact = Math.sin(THREE.MathUtils.clamp(this.actionElapsed / duration, 0, 1) * Math.PI);
      leftArm = rightArm = -0.82 * contact;
      leftLeg += 0.2 * contact;
    }
    this.posePart("arm_left", 1.48, leftArm, smoothing);
    this.posePart("forearm_left", 1.48, leftArm * 0.72, smoothing);
    this.posePart("arm_right", 1.48, rightArm, smoothing);
    this.posePart("forearm_right", 1.48, rightArm * 0.72, smoothing);
    this.posePart("thigh_left", 0.84, leftLeg, smoothing);
    this.posePart("shin_left", 0.84, leftLeg * 0.72, smoothing);
    this.posePart("boot_left", 0.84, leftLeg * 0.42, smoothing);
    this.posePart("thigh_right", 0.84, rightLeg, smoothing);
    this.posePart("shin_right", 0.84, rightLeg * 0.72, smoothing);
    this.posePart("boot_right", 0.84, rightLeg * 0.42, smoothing);
    const moving = MOVING_CLIPS.has(clip) && motion.speedMetersPerSecond > 0.1;
    return {
      bobY: reducedMotion || clip === "jump" || !moving
        ? 0
        : Math.abs(Math.sin(this.elapsed * rate)) * 0.026,
      leanX: reducedMotion ? 0 : clip === "jump" ? -0.045 : -0.02,
      leanZ: 0,
      clip,
      events
    };
  }
}
