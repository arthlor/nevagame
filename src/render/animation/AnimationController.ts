import * as THREE from "three";
import type { GameMode } from "../../simulation/core/types";
import { CANONICAL_RENDER_CONFIG } from "../config/VisualRenderConfig";

export type PlayerAnimation =
  | "idle"
  | "walk"
  | "run"
  | "plant"
  | "water"
  | "harvest"
  | "cast"
  | "reel"
  | "brace"
  | "board"
  | "dock"
  | "row"
  | "sail";

export interface CharacterMotionFrame {
  bobY: number;
  leanX: number;
  leanZ: number;
}

interface RigPart {
  object: THREE.Object3D;
  position: THREE.Vector3;
  rotation: THREE.Euler;
}

const ACTION_DURATION: Partial<Record<PlayerAnimation, number>> = {
  plant: 0.72,
  water: 0.86,
  harvest: 0.62,
  cast: 0.72,
  brace: 0.48,
  board: 0.64,
  dock: 0.58
};

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

/**
 * Clip-aware character motion with a procedural fallback for the current
 * articulated GLB. All state remains presentation-only and interruptible.
 */
export class AnimationController {
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<PlayerAnimation, THREE.AnimationAction>();
  private readonly rigParts = new Map<string, RigPart>();
  private activeClip: PlayerAnimation | null = null;
  private activeAction: PlayerAnimation | null = null;
  private actionElapsed = 0;
  private elapsed = 0;

  public constructor(root: THREE.Object3D) {
    this.mixer = new THREE.AnimationMixer(root);
    const clips = (root.userData.animationClips as THREE.AnimationClip[] | undefined) ?? [];
    for (const clip of clips) {
      const name = clip.name as PlayerAnimation;
      if (this.isAnimationName(name)) this.actions.set(name, this.mixer.clipAction(clip));
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

  private isAnimationName(value: string): value is PlayerAnimation {
    return [
      "idle",
      "walk",
      "run",
      "plant",
      "water",
      "harvest",
      "cast",
      "reel",
      "brace",
      "board",
      "dock",
      "row",
      "sail"
    ].includes(value);
  }

  public play(action: PlayerAnimation): void {
    if (!ACTION_DURATION[action]) return;
    this.activeAction = action;
    this.actionElapsed = 0;
  }

  private transitionClip(next: PlayerAnimation): void {
    if (next === this.activeClip) return;
    const blend = CANONICAL_RENDER_CONFIG.motion.locomotionBlendSeconds;
    this.actions.get(this.activeClip ?? "idle")?.fadeOut(blend);
    this.actions.get(next)?.reset().fadeIn(blend).play();
    this.activeClip = next;
  }

  private posePart(
    name: string,
    pivotY: number,
    angleX: number,
    angleZ: number,
    smoothing: number
  ): void {
    const part = this.rigParts.get(name);
    if (!part) return;
    const cosine = Math.cos(angleX);
    const sine = Math.sin(angleX);
    const relativeY = part.position.y - pivotY;
    const relativeZ = part.position.z;
    const targetPosition = new THREE.Vector3(
      part.position.x,
      pivotY + relativeY * cosine - relativeZ * sine,
      relativeY * sine + relativeZ * cosine
    );
    part.object.position.lerp(targetPosition, smoothing);
    part.object.rotation.x = THREE.MathUtils.lerp(
      part.object.rotation.x,
      part.rotation.x + angleX,
      smoothing
    );
    part.object.rotation.z = THREE.MathUtils.lerp(
      part.object.rotation.z,
      part.rotation.z + angleZ,
      smoothing
    );
  }

  private applyProceduralPose(
    deltaSeconds: number,
    base: PlayerAnimation,
    speed: number,
    reducedMotion: boolean
  ): CharacterMotionFrame {
    const reducedScale = reducedMotion ? CANONICAL_RENDER_CONFIG.motion.reducedMotionScale : 1;
    const smoothing = 1 - Math.exp(-18 * Math.max(0, deltaSeconds));
    const locomotionRate = base === "run" ? 11.2 : 8.2;
    const locomotionStrength = base === "run" ? 0.5 : base === "walk" ? 0.34 : 0;
    const step = Math.sin(this.elapsed * locomotionRate) * locomotionStrength * reducedScale;
    const idle = base === "idle" ? Math.sin(this.elapsed * 1.35) * 0.025 * reducedScale : 0;
    let leftArm = step + idle;
    let rightArm = -step - idle;
    let leftLeg = -step * 0.76;
    let rightLeg = step * 0.76;
    let leanX = base === "run" ? -0.055 * reducedScale : 0;
    let leanZ = base === "walk" || base === "run" ? Math.sin(this.elapsed * locomotionRate * 0.5) * 0.012 * reducedScale : 0;

    if (base === "row") {
      const rowCycle = Math.sin(this.elapsed * 3.8);
      leftArm = rightArm = -0.48 + rowCycle * 0.42 * reducedScale;
      leanX = rowCycle * 0.06 * reducedScale;
    } else if (base === "reel") {
      leftArm = -0.52 + Math.sin(this.elapsed * 5.4) * 0.12 * reducedScale;
      rightArm = -0.82 + Math.cos(this.elapsed * 5.4) * 0.18 * reducedScale;
      leanX = -0.035 * reducedScale;
    }

    if (this.activeAction) {
      const duration = ACTION_DURATION[this.activeAction] ?? 0.6;
      const phase = THREE.MathUtils.clamp(this.actionElapsed / duration, 0, 1);
      const contact = Math.sin(phase * Math.PI);
      switch (this.activeAction) {
        case "plant":
          leftArm = rightArm = -0.88 * contact * reducedScale;
          leftLeg += 0.36 * contact * reducedScale;
          rightLeg += 0.18 * contact * reducedScale;
          leanX = -0.22 * contact * reducedScale;
          break;
        case "water":
          leftArm = -0.62 * contact * reducedScale;
          rightArm = -0.96 * contact * reducedScale;
          leanZ = 0.08 * contact * reducedScale;
          break;
        case "harvest":
          rightArm = THREE.MathUtils.lerp(0.62, -1.02, smoothStep(phase)) * reducedScale;
          leftArm = -0.18 * contact * reducedScale;
          leanZ = -0.08 * contact * reducedScale;
          break;
        case "cast": {
          const cast = phase < 0.36 ? phase / 0.36 : 1 - (phase - 0.36) / 0.64;
          const direction = phase < 0.36 ? 0.72 : -1.08;
          leftArm = rightArm = direction * smoothStep(cast) * reducedScale;
          leanX = (phase < 0.36 ? 0.08 : -0.11) * contact * reducedScale;
          break;
        }
        case "brace":
          leftArm = -0.68 * contact * reducedScale;
          rightArm = -0.42 * contact * reducedScale;
          leanX = 0.12 * contact * reducedScale;
          break;
        case "board":
        case "dock":
          leftArm += 0.28 * contact * reducedScale;
          rightArm -= 0.28 * contact * reducedScale;
          leftLeg += 0.42 * contact * reducedScale;
          leanZ = 0.08 * contact * reducedScale;
          break;
      }
    }

    this.posePart("arm_left", 1.48, leftArm, 0, smoothing);
    this.posePart("forearm_left", 1.48, leftArm * 0.72, -Math.max(0, -leftArm) * 0.08, smoothing);
    this.posePart("arm_right", 1.48, rightArm, 0, smoothing);
    this.posePart("forearm_right", 1.48, rightArm * 0.72, Math.max(0, -rightArm) * 0.08, smoothing);
    this.posePart("thigh_left", 0.84, leftLeg, 0, smoothing);
    this.posePart("shin_left", 0.84, leftLeg * 0.72, 0, smoothing);
    this.posePart("boot_left", 0.84, leftLeg * 0.42, 0, smoothing);
    this.posePart("thigh_right", 0.84, rightLeg, 0, smoothing);
    this.posePart("shin_right", 0.84, rightLeg * 0.72, 0, smoothing);
    this.posePart("boot_right", 0.84, rightLeg * 0.42, 0, smoothing);

    const moving = speed > 0.1 && (base === "walk" || base === "run");
    const bobY = moving
      ? Math.abs(Math.sin(this.elapsed * locomotionRate)) * 0.036 * reducedScale
      : Math.sin(this.elapsed * 1.7) * 0.007 * reducedScale;
    return { bobY, leanX, leanZ };
  }

  public update(
    deltaSeconds: number,
    mode: GameMode,
    speed: number,
    reducedMotion: boolean = false
  ): CharacterMotionFrame {
    const dt = THREE.MathUtils.clamp(deltaSeconds, 0, 0.1);
    this.elapsed += dt;
    if (this.activeAction) {
      this.actionElapsed += dt;
      if (this.actionElapsed >= (ACTION_DURATION[this.activeAction] ?? 0.6)) {
        this.activeAction = null;
        this.actionElapsed = 0;
      }
    }

    const base: PlayerAnimation =
      mode === "sport-fishing"
        ? "reel"
        : mode === "boat-driving"
          ? Math.abs(speed) > 0.2
            ? "row"
            : "idle"
          : speed > 6
            ? "run"
            : speed > 0.1
              ? "walk"
              : "idle";
    const clip = this.activeAction && this.actions.has(this.activeAction) ? this.activeAction : base;
    this.transitionClip(clip);
    this.mixer.update(dt);
    return this.actions.size > 0
      ? { bobY: 0, leanX: 0, leanZ: 0 }
      : this.applyProceduralPose(dt, base, speed, reducedMotion);
  }
}

function smoothStep(value: number): number {
  const clamped = THREE.MathUtils.clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}
