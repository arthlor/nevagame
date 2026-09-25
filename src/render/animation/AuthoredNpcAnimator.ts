import * as THREE from "three";
import type { ClockState } from "../../simulation/core/types";
import type { WorldReactionKind } from "../presentation/SocialReactionPresentation";
import type {
  CharacterAnimationContext,
  CharacterGroundSurfaceSample,
  CharacterMotionFrame,
  PlayerAnimation
} from "./AnimationController";

export interface NpcAnimationCue {
  timeOfDay: ClockState["timeOfDay"];
  nearPlayer: boolean;
  reactionKind: WorldReactionKind | null;
  reactionAttention: number;
}

export interface NpcAnimatorContract {
  update(
    deltaSeconds: number,
    context: CharacterAnimationContext,
    reducedMotion?: boolean,
    cue?: NpcAnimationCue
  ): CharacterMotionFrame;
  lookTowardHeading(relativeWorldYaw: number, deltaSeconds: number): void;
  resetSpatialState(): void;
  wantsStationPause?(): boolean;
  activeClipName?(): string | null;
  resolveGroundContacts(
    context: CharacterAnimationContext,
    sampleSurface: (x: number, z: number) => CharacterGroundSurfaceSample,
    deltaSeconds?: number
  ): void;
  dispose(): void;
}

type AnimatorState = "idle" | "walk" | "talking" | "ambient" | "reaction" | "farewell";

/** The scene moves the actor; substantial baked hip travel must not move it again. */
export function removeNpcClipRootTravel(clip: THREE.AnimationClip): THREE.AnimationClip {
  let changed = false;
  const tracks = clip.tracks.map((track) => {
    if (!(track instanceof THREE.VectorKeyframeTrack)
      || track.values.length !== track.times.length * 3
      || !track.name.endsWith(".position")) return track;
    const joint = track.name.slice(0, track.name.lastIndexOf("."))
      .split("/").at(-1)?.split(":").at(-1)?.toLowerCase();
    if (joint !== "root" && joint !== "pelvis" && joint !== "hips"
      && joint !== "mixamorighips") return track;
    const firstX = track.values[0];
    const firstZ = track.values[2];
    const lastX = track.values[track.values.length - 3];
    const lastZ = track.values[track.values.length - 1];
    if (Math.hypot(lastX - firstX, lastZ - firstZ) < 0.25) return track;

    const inPlace = track.clone();
    for (let index = 0; index < inPlace.values.length; index += 3) {
      inPlace.values[index] = firstX;
      inPlace.values[index + 2] = firstZ;
    }
    changed = true;
    return inPlace;
  });
  return changed ? new THREE.AnimationClip(clip.name, clip.duration, tracks, clip.blendMode) : clip;
}

function stableNpcOffset(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash = Math.imul(hash ^ id.charCodeAt(index), 16777619);
  }
  return hash >>> 0;
}

export class AuthoredNpcAnimator implements NpcAnimatorContract {
  private readonly mixer: THREE.AnimationMixer;
  private readonly clips: THREE.AnimationClip[] = [];
  private readonly actions = new Map<string, THREE.AnimationAction>();

  private idleAction: THREE.AnimationAction | null = null;
  private walkAction: THREE.AnimationAction | null = null;
  private greetingAction: THREE.AnimationAction | null = null;
  private farewellAction: THREE.AnimationAction | null = null;
  private readonly talkingActions: THREE.AnimationAction[] = [];
  private readonly ambientActions: THREE.AnimationAction[] = [];

  private headBone: THREE.Object3D | null = null;
  private neckBone: THREE.Object3D | null = null;
  private headLookYaw = 0;

  private state: AnimatorState = "idle";
  private currentAction: THREE.AnimationAction | null = null;

  private holdSeconds = 0;
  private ambientReady = false;
  private ambientIndex = 0;
  private talkingGestureTimer = 0;
  private talkingGestureIndex = 0;
  private lastReactionKind: WorldReactionKind | null = null;

  // Scratch objects for zero allocation in lookTowardHeading
  private readonly scratchUpVector = new THREE.Vector3(0, 1, 0);
  private readonly scratchLookQuat = new THREE.Quaternion();
  private readonly scratchWorldQuat = new THREE.Quaternion();
  private readonly scratchParentQuat = new THREE.Quaternion();

  constructor(
    model: THREE.Group,
    public readonly npcId: string
  ) {
    this.mixer = new THREE.AnimationMixer(model);

    // Retrieve animation clips from model userData or model root
    const rawClips: THREE.AnimationClip[] =
      (model.userData?.animationClips as THREE.AnimationClip[] | undefined) ||
      model.animations ||
      [];
    this.clips = rawClips.map(removeNpcClipRootTravel);

    // Find neck and head bones (supports Tripo and Mixamo naming)
    model.traverse((child) => {
      const lower = child.name.toLowerCase();
      if (lower.includes("head") && !lower.includes("top")) {
        this.headBone = child;
      } else if (lower.includes("neck")) {
        this.neckBone = child;
      }
    });

    this.setupActions();
  }

  private setupActions(): void {
    if (this.clips.length === 0) return;

    for (const clip of this.clips) {
      const action = this.mixer.clipAction(clip);
      this.actions.set(clip.name, action);
    }

    // Locate core idle and walk
    for (const [name, action] of this.actions) {
      if (/idle/i.test(name) && !this.idleAction) {
        this.idleAction = action;
        action.setLoop(THREE.LoopRepeat, Infinity);
      } else if (/walk/i.test(name) && !this.walkAction) {
        this.walkAction = action;
        action.setLoop(THREE.LoopRepeat, Infinity);
      }
    }

    this.greetingAction = this.findAction("greet");
    this.farewellAction = this.findAction("wave_goodbye");
    for (const name of ["agree", "laugh", "fold_arms"]) {
      const action = this.findAction(name);
      if (action) this.talkingActions.push(action);
    }
    // Seat and tool clips require matching world props. Celebration belongs to
    // committed social events, so ordinary station pauses stay low-key.
    for (const name of ["look_around", "standing_relax", "wait", "scratch", "fold_arms"]) {
      const action = this.findAction(name);
      if (action) this.ambientActions.push(action);
    }

    // Start with idle
    if (this.idleAction) {
      this.idleAction.play();
      this.currentAction = this.idleAction;
      this.state = "idle";
    }

    this.ambientIndex = stableNpcOffset(this.npcId);
  }

  private findAction(namePattern: string): THREE.AnimationAction | null {
    if (this.actions.has(namePattern)) return this.actions.get(namePattern)!;
    const lower = namePattern.toLowerCase();
    for (const [name, action] of this.actions) {
      if (name.toLowerCase().startsWith(lower)) return action;
    }
    return null;
  }

  private crossFadeTo(
    nextAction: THREE.AnimationAction | null,
    durationSeconds: number,
    loop: THREE.AnimationActionLoopStyles = THREE.LoopRepeat
  ): void {
    if (!nextAction || nextAction === this.currentAction) return;

    nextAction.setLoop(loop, loop === THREE.LoopRepeat ? Infinity : 1);
    nextAction.clampWhenFinished = loop === THREE.LoopOnce;
    // Short station legs should not restart the same foot on every departure.
    if (nextAction !== this.walkAction) nextAction.reset();
    else nextAction.enabled = true;

    if (this.currentAction) {
      this.currentAction.crossFadeTo(nextAction, durationSeconds, false);
    } else {
      nextAction.fadeIn(durationSeconds);
    }

    nextAction.play();
    this.currentAction = nextAction;
  }

  private startOnce(action: THREE.AnimationAction, state: AnimatorState): void {
    if (action === this.currentAction) {
      action.reset();
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();
    } else {
      this.crossFadeTo(action, 0.28, THREE.LoopOnce);
    }
    this.state = state;
    this.holdSeconds = action.getClip().duration;
  }

  private returnToIdle(): void {
    this.crossFadeTo(this.idleAction, 0.3);
    this.state = "idle";
    this.holdSeconds = 0;
  }

  private chooseAmbientAction(timeOfDay: ClockState["timeOfDay"] | undefined): THREE.AnimationAction | null {
    const calm = timeOfDay === "night"
      ? this.ambientActions.filter((action) => /standing_relax|wait|fold_arms/i.test(action.getClip().name))
      : this.ambientActions;
    const choices = calm.length ? calm : this.ambientActions;
    if (!choices.length) return null;
    const action = choices[this.ambientIndex % choices.length];
    this.ambientIndex += 1;
    return action;
  }

  private chooseReactionAction(kind: WorldReactionKind): THREE.AnimationAction | null {
    if (kind === "milestone") {
      return this.findAction("cheer") ?? this.findAction("clap") ?? this.findAction("agree");
    }
    if (kind === "homecoming") return this.greetingAction ?? this.findAction("agree");
    if (kind === "trade" || kind === "ready") return this.findAction("agree") ?? this.greetingAction;
    return null;
  }

  public wantsStationPause(): boolean {
    return (this.state === "ambient" || this.state === "reaction" || this.state === "farewell")
      && this.holdSeconds > 0.35;
  }

  public activeClipName(): string | null {
    return this.currentAction?.getClip().name ?? null;
  }

  public update(
    deltaSeconds: number,
    context: CharacterAnimationContext,
    reducedMotion = false,
    cue?: NpcAnimationCue
  ): CharacterMotionFrame {
    const elapsed = Math.max(0, deltaSeconds);
    const isMoving = context.motion.speedMetersPerSecond > 0.06;
    const isTalking = Boolean(context.talking);
    if (cue && !cue.reactionKind) this.lastReactionKind = null;

    if (isMoving) {
      if (this.state !== "walk") this.crossFadeTo(this.walkAction, 0.18);
      this.state = "walk";
      this.ambientReady = true;
      this.holdSeconds = 0;
      if (this.walkAction) {
        this.walkAction.timeScale = THREE.MathUtils.clamp(
          context.motion.speedMetersPerSecond / 1.2, 0.65, 1.55
        );
      }
    } else if (isTalking) {
      if (this.state !== "talking") {
        const first = this.greetingAction ?? this.talkingActions[0] ?? this.idleAction;
        this.crossFadeTo(first, 0.22, first === this.idleAction ? THREE.LoopRepeat : THREE.LoopOnce);
        this.talkingGestureTimer = first ? first.getClip().duration + 0.35 : 2;
        this.talkingGestureIndex = first === this.talkingActions[0] ? 1 : 0;
        this.state = "talking";
      } else {
        this.talkingGestureTimer -= elapsed;
        if (this.talkingGestureTimer <= 0) {
          const next = this.talkingActions.length
            ? this.talkingActions[this.talkingGestureIndex++ % this.talkingActions.length]
            : this.idleAction;
          const takeBreath = next === this.currentAction && next !== this.idleAction;
          this.crossFadeTo(takeBreath ? this.idleAction : next, 0.3,
            next === this.idleAction || takeBreath ? THREE.LoopRepeat : THREE.LoopOnce);
          this.talkingGestureTimer = takeBreath ? 2.2 : next ? next.getClip().duration + 0.5 : 2;
        }
      }
    } else if (this.state === "talking") {
      if (!reducedMotion && cue?.nearPlayer && this.farewellAction) {
        this.startOnce(this.farewellAction, "farewell");
      } else {
        this.returnToIdle();
      }
    } else {
      const reaction = cue?.reactionKind;
      const newReaction = !reducedMotion && reaction && reaction !== this.lastReactionKind
        && (cue?.reactionAttention ?? 0) >= 0.28;
      if (newReaction) {
        this.lastReactionKind = reaction;
        const action = this.chooseReactionAction(reaction);
        if (action) {
          this.startOnce(action, "reaction");
          this.ambientReady = false;
        }
      } else if (this.state === "ambient" || this.state === "reaction" || this.state === "farewell") {
        this.holdSeconds -= elapsed;
        if (reducedMotion || this.holdSeconds <= 0.35) this.returnToIdle();
      } else if (this.state === "walk") {
        const action = !reducedMotion && this.ambientReady
          ? this.chooseAmbientAction(cue?.timeOfDay) : null;
        this.ambientReady = false;
        if (action) this.startOnce(action, "ambient");
        else this.returnToIdle();
      }
    }

    this.mixer.update(elapsed);

    const activeClip: PlayerAnimation = this.state === "walk" ? "walk" : "idle";
    return {
      bobY: 0,
      leanX: 0,
      leanZ: 0,
      groundPitch: 0,
      groundRoll: 0,
      leftFootOffsetY: 0,
      rightFootOffsetY: 0,
      clip: activeClip,
      events: []
    };
  }

  public lookTowardHeading(relativeWorldYaw: number, deltaSeconds: number): void {
    this.headLookYaw = THREE.MathUtils.damp(
      this.headLookYaw,
      THREE.MathUtils.clamp(relativeWorldYaw, -0.65, 0.65),
      8,
      Math.max(0, deltaSeconds)
    );

    if (Math.abs(this.headLookYaw) < 0.001) return;

    if (this.headBone) {
      this.headBone.updateWorldMatrix(true, false);
      this.scratchLookQuat.setFromAxisAngle(this.scratchUpVector, this.headLookYaw * 0.7);
      this.headBone.getWorldQuaternion(this.scratchWorldQuat).premultiply(this.scratchLookQuat);
      if (this.headBone.parent) {
        this.headBone.parent.getWorldQuaternion(this.scratchParentQuat).invert();
      } else {
        this.scratchParentQuat.identity();
      }
      this.headBone.quaternion.copy(
        this.scratchParentQuat.multiply(this.scratchWorldQuat)
      ).normalize();
      this.headBone.updateWorldMatrix(false, true);
    }

    if (this.neckBone) {
      this.neckBone.updateWorldMatrix(true, false);
      this.scratchLookQuat.setFromAxisAngle(this.scratchUpVector, this.headLookYaw * 0.3);
      this.neckBone.getWorldQuaternion(this.scratchWorldQuat).premultiply(this.scratchLookQuat);
      if (this.neckBone.parent) {
        this.neckBone.parent.getWorldQuaternion(this.scratchParentQuat).invert();
      } else {
        this.scratchParentQuat.identity();
      }
      this.neckBone.quaternion.copy(
        this.scratchParentQuat.multiply(this.scratchWorldQuat)
      ).normalize();
      this.neckBone.updateWorldMatrix(false, true);
    }
  }

  public resetSpatialState(): void {
    this.headLookYaw = 0;
  }

  public resolveGroundContacts(
    _context: CharacterAnimationContext,
    _sampleSurface: (x: number, z: number) => CharacterGroundSurfaceSample,
    _deltaSeconds = 1 / 60
  ): void {
    // Model base position is aligned with ground traversal height
  }

  public dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot());
    this.actions.clear();
    this.talkingActions.length = 0;
    this.ambientActions.length = 0;
  }
}
