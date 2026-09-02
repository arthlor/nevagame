import type RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import {
  type CharacterPoseSnapshot,
  type RagdollMode,
  type RagdollRecoverySample,
  RAGDOLL_BODIES,
  RAGDOLL_JOINTS
} from "./RagdollBoneMapping";
import { RagdollMotorController } from "./RagdollMotorController";
import { RagdollPoseBlender } from "./RagdollPoseBlender";

export interface HumanoidRagdollInterface {
  readonly mode: RagdollMode;
  initialize(world: RAPIER.World, initialPose?: CharacterPoseSnapshot, rapierInstance?: typeof RAPIER): void;
  updateActiveTracking(targetPose: CharacterPoseSnapshot, dt: number): void;
  triggerPhysicalRagdoll(
    linearVelocity: THREE.Vector3 | { x: number; y: number; z: number },
    angularVelocity: THREE.Vector3 | { x: number; y: number; z: number }
  ): void;
  stepPhysicalSimulation(dt: number, groundHeight?: number): void;
  updateRecovery(targetPose: CharacterPoseSnapshot, dt: number): RagdollRecoverySample | null;
  updateRecovery(dt: number): RagdollRecoverySample | null;
  checkImpactTrigger(speed: number, contactEvent: string, impactStrength?: number): boolean;
  determineOrientation(): "prone" | "supine";
  getBoneTransforms(): Map<string, { position: [number, number, number]; quaternion: [number, number, number, number] }>;
  dispose(world?: RAPIER.World): void;
}

/**
 * HumanoidRagdollSystem
 *
 * Standalone/deferred character physics support. The live Neva MVP is
 * no-combat and `PhysicsWorld` does not instantiate this system; callers that
 * opt into it own the fixed-step world lifecycle explicitly.
 */
export class HumanoidRagdollSystem implements HumanoidRagdollInterface {
  public mode: RagdollMode = "kinematic-active";
  public linearVelocity = new THREE.Vector3();
  public angularVelocity = new THREE.Vector3();
  public rootPosition = new THREE.Vector3(0, 0, 0);
  public rootQuaternion = new THREE.Quaternion();
  public boneTransforms = new Map<string, { position: THREE.Vector3; quaternion: THREE.Quaternion }>();

  private readonly motorController: RagdollMotorController;
  private readonly poseBlender: RagdollPoseBlender;

  // Optional Rapier handles when connected to active physics world
  private rapierWorld: RAPIER.World | null = null;
  private rapierInstance: typeof RAPIER | null = null;
  private readonly rapierBodies = new Map<string, RAPIER.RigidBody>();
  private readonly rapierColliders = new Map<string, RAPIER.Collider>();
  private readonly rapierJoints: RAPIER.ImpulseJoint[] = [];
  private lastTargetPose: CharacterPoseSnapshot | null = null;

  public constructor() {
    this.motorController = new RagdollMotorController();
    this.poseBlender = new RagdollPoseBlender();
    this.resetToTpose();
  }

  /**
   * Initializes or resets all 12 rigid body transforms to default humanoid T-pose.
   */
  public resetToTpose(): void {
    this.boneTransforms.clear();
    for (const body of RAGDOLL_BODIES) {
      this.boneTransforms.set(body.boneName, {
        position: new THREE.Vector3(0, 1.0, 0),
        quaternion: new THREE.Quaternion(0, 0, 0, 1)
      });
    }
    this.rootPosition.set(0, 0, 0);
    this.rootQuaternion.set(0, 0, 0, 1);
  }

  /**
   * Initializes Rapier multi-body rigid bodies, colliders, and anatomical joint constraints.
   *
   * @param world Rapier world instance
   * @param initialPose Optional initial pose snapshot
   * @param rapierInstance Optional Rapier namespace
   */
  public initialize(
    world: RAPIER.World,
    initialPose?: CharacterPoseSnapshot,
    rapierInstance?: typeof RAPIER
  ): void {
    const resolvedRapierInstance = rapierInstance ?? this.rapierInstance;
    if (this.rapierWorld || this.rapierBodies.size > 0 || this.rapierJoints.length > 0) {
      this.dispose();
    }
    this.rapierWorld = world;
    this.rapierInstance = resolvedRapierInstance;

    if (initialPose) {
      this.lastTargetPose = initialPose;
      this.rootPosition.set(...initialPose.rootPosition);
      this.rootQuaternion.set(...initialPose.rootRotation);
      for (const [boneName, transform] of Object.entries(initialPose.bones)) {
        const bone = this.boneTransforms.get(boneName);
        if (bone) {
          bone.position.set(...transform.position);
          bone.quaternion.set(...transform.rotation);
        }
      }
    }

    if (!this.rapierInstance) return;

    // Create Rapier rigid bodies and colliders for each bone
    for (const bodySpec of RAGDOLL_BODIES) {
      const transform = this.boneTransforms.get(bodySpec.boneName);
      const posX = transform ? transform.position.x : 0;
      const posY = transform ? transform.position.y : 1.0;
      const posZ = transform ? transform.position.z : 0;
      const rot = transform ? transform.quaternion : this.rootQuaternion;

      const bodyDesc = this.rapierInstance.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(posX, posY, posZ)
        .setRotation({ x: rot.x, y: rot.y, z: rot.z, w: rot.w })
        .setLinearDamping(bodySpec.linearDamping)
        .setAngularDamping(bodySpec.angularDamping)
        .setCanSleep(false);

      const body = world.createRigidBody(bodyDesc);
      this.rapierBodies.set(bodySpec.boneName, body);

      // Create collider based on shape
      let colliderDesc: RAPIER.ColliderDesc;
      if (bodySpec.shape === "capsule") {
        colliderDesc = this.rapierInstance.ColliderDesc.capsule(
          bodySpec.halfExtents[1],
          bodySpec.halfExtents[0]
        );
      } else if (bodySpec.shape === "box") {
        colliderDesc = this.rapierInstance.ColliderDesc.cuboid(
          bodySpec.halfExtents[0],
          bodySpec.halfExtents[1],
          bodySpec.halfExtents[2]
        );
      } else {
        // sphere
        colliderDesc = this.rapierInstance.ColliderDesc.ball(bodySpec.halfExtents[0]);
      }

      colliderDesc
        .setMass(bodySpec.massKg)
        .setFriction(bodySpec.friction)
        .setRestitution(bodySpec.restitution);

      const collider = world.createCollider(colliderDesc, body);
      this.rapierColliders.set(bodySpec.boneName, collider);
    }

    // Create Rapier joint constraints
    for (const jointSpec of RAGDOLL_JOINTS) {
      const parentBody = this.rapierBodies.get(jointSpec.parentBone);
      const childBody = this.rapierBodies.get(jointSpec.childBone);
      if (!parentBody || !childBody) continue;

      let jointData: RAPIER.JointData;
      const anchor1 = { x: jointSpec.anchor[0], y: jointSpec.anchor[1], z: jointSpec.anchor[2] };
      const anchor2 = { x: 0, y: 0, z: 0 };

      if (jointSpec.type === "revolute" && jointSpec.axis) {
        const axis = { x: jointSpec.axis[0], y: jointSpec.axis[1], z: jointSpec.axis[2] };
        jointData = this.rapierInstance.JointData.revolute(anchor1, anchor2, axis);
        jointData.limitsEnabled = true;
        jointData.limits = [jointSpec.minAngleLimitRad, jointSpec.maxAngleLimitRad];
      } else {
        jointData = this.rapierInstance.JointData.spherical(anchor1, anchor2);
      }

      const joint = world.createImpulseJoint(jointData, parentBody, childBody, true);
      this.rapierJoints.push(joint);
    }
  }

  /**
   * Updates active motorized joint tracking following animation poses with spring-damper compliance.
   */
  public updateActiveTracking(targetPose: CharacterPoseSnapshot, dt: number): void {
    if (this.mode !== "kinematic-active") return;
    this.lastTargetPose = targetPose;
    const safeDt = Math.max(0, Number.isFinite(dt) ? dt : 0);

    // Update internal transforms using PD motor controller
    this.motorController.updateTracking(this.boneTransforms, targetPose, safeDt);

    // Synchronize Rapier kinematic bodies if initialized
    if (this.rapierWorld) {
      for (const [boneName, transform] of this.boneTransforms) {
        const body = this.rapierBodies.get(boneName);
        if (body) {
          body.setNextKinematicTranslation({
            x: transform.position.x,
            y: transform.position.y,
            z: transform.position.z
          });
          body.setNextKinematicRotation({
            x: transform.quaternion.x,
            y: transform.quaternion.y,
            z: transform.quaternion.z,
            w: transform.quaternion.w
          });
        }
      }
    }
  }

  /**
   * Evaluates impact conditions to determine if physical ragdoll should be triggered.
   *
   * @param speed Speed of impact in m/s
   * @param contactEvent Contact event type
   * @param impactStrength Landing or collision impact strength [0, 1]
   */
  public checkImpactTrigger(speed: number, contactEvent: string, impactStrength: number = 0): boolean {
    const isHighSpeedImpact = speed > 10.0;
    const isHardLanding = speed >= 8.5 && (contactEvent === "land-hard" || impactStrength > 0.8);
    const isKnockback = contactEvent === "knockback";

    return isHighSpeedImpact || isHardLanding || isKnockback;
  }

  /**
   * Switches the ragdoll from kinematic tracking to unconstrained physical ragdoll simulation.
   */
  public triggerPhysicalRagdoll(
    linearVel: THREE.Vector3 | { x: number; y: number; z: number },
    angularVel: THREE.Vector3 | { x: number; y: number; z: number }
  ): void {
    this.mode = "physical-ragdoll";
    this.linearVelocity.set(linearVel.x, linearVel.y, linearVel.z);
    this.angularVelocity.set(angularVel.x, angularVel.y, angularVel.z);
    this.poseBlender.reset();

    // If Rapier world is active, switch all bodies to Dynamic mode and transfer impulses
    if (this.rapierWorld && this.rapierInstance) {
      for (const body of this.rapierBodies.values()) {
        body.setBodyType(this.rapierInstance.RigidBodyType.Dynamic, true);
        body.setLinvel({ x: this.linearVelocity.x, y: this.linearVelocity.y, z: this.linearVelocity.z }, true);
        body.setAngvel({ x: this.angularVelocity.x, y: this.angularVelocity.y, z: this.angularVelocity.z }, true);
        body.wakeUp();
      }
    }
  }

  /**
   * Steps physical ragdoll multi-body simulation and checks settle criteria.
   */
  public stepPhysicalSimulation(dt: number, groundHeight: number = 0): void {
    if (this.mode !== "physical-ragdoll") return;
    const safeDt = Math.min(0.1, Math.max(0, Number.isFinite(dt) ? dt : 0));

    if (this.rapierWorld) {
      // Synchronize transforms from Rapier dynamic bodies
      const pelvisBody = this.rapierBodies.get("rig_pelvis");
      if (pelvisBody) {
        const pTrans = pelvisBody.translation();
        const pRot = pelvisBody.rotation();
        const pLinVel = pelvisBody.linvel();
        const pAngVel = pelvisBody.angvel();

        this.rootPosition.set(pTrans.x, pTrans.y, pTrans.z);
        this.rootQuaternion.set(pRot.x, pRot.y, pRot.z, pRot.w);
        this.linearVelocity.set(pLinVel.x, pLinVel.y, pLinVel.z);
        this.angularVelocity.set(pAngVel.x, pAngVel.y, pAngVel.z);
      }

      for (const [boneName, body] of this.rapierBodies) {
        const transform = this.boneTransforms.get(boneName);
        if (transform) {
          const trans = body.translation();
          const rot = body.rotation();
          transform.position.set(trans.x, trans.y, trans.z);
          transform.quaternion.set(rot.x, rot.y, rot.z, rot.w);
        }
      }
    } else {
      // Deterministic standalone numerical integration
      // Apply gravity
      this.linearVelocity.y -= 18.0 * safeDt;

      // Apply linear & angular damping
      this.linearVelocity.multiplyScalar(Math.max(0, 1.0 - 0.6 * safeDt));
      this.angularVelocity.multiplyScalar(Math.max(0, 1.0 - 1.2 * safeDt));

      // Advance root position
      this.rootPosition.addScaledVector(this.linearVelocity, safeDt);

      // Ground collision plane response
      if (this.rootPosition.y <= groundHeight + 0.3) {
        this.rootPosition.y = groundHeight + 0.3;
        if (this.linearVelocity.y < 0) {
          this.linearVelocity.y = -this.linearVelocity.y * 0.1; // Restitution
        }
        // Ground friction response
        this.linearVelocity.x *= Math.max(0, 1.0 - 0.86 * safeDt * 10);
        this.linearVelocity.z *= Math.max(0, 1.0 - 0.86 * safeDt * 10);
        this.angularVelocity.multiplyScalar(Math.max(0, 1.0 - 0.9 * safeDt * 10));
      }
    }

    // Check settle criteria via pose blender
    const linearSpeed = this.linearVelocity.length();
    const angularSpeed = this.angularVelocity.length();
    const settled = this.poseBlender.checkSettle(linearSpeed, angularSpeed, safeDt);

    if (settled) {
      this.mode = "recovering";
    }
  }

  /**
   * Classifies the resting orientation of the ragdoll as "prone" (face down) or "supine" (face up).
   */
  public determineOrientation(): "prone" | "supine" {
    const chestTransform = this.boneTransforms.get("rig_chest");
    return this.poseBlender.determineOrientation(chestTransform?.quaternion);
  }

  /**
   * Updates smooth Slerp pose recovery blending towards the target get-up / idle pose.
   */
  public updateRecovery(
    arg0: CharacterPoseSnapshot | number,
    arg1?: number | CharacterPoseSnapshot
  ): RagdollRecoverySample | null {
    if (this.mode !== "recovering") return null;

    let targetPose: CharacterPoseSnapshot;
    let dt: number;

    if (typeof arg0 === "number") {
      dt = arg0;
      targetPose = (typeof arg1 === "object" && arg1 !== null ? arg1 : this.lastTargetPose) ?? {
        rootPosition: [this.rootPosition.x, this.rootPosition.y, this.rootPosition.z],
        rootRotation: [0, 0, 0, 1],
        bones: {}
      };
    } else {
      targetPose = arg0;
      dt = typeof arg1 === "number" ? arg1 : 1 / 60;
    }

    this.lastTargetPose = targetPose;
    const orientation = this.determineOrientation();
    const sample = this.poseBlender.updateRecovery(
      this.boneTransforms,
      this.rootPosition,
      targetPose,
      dt,
      orientation
    );

    if (sample.progress >= 1.0) {
      this.mode = "kinematic-active";
      this.linearVelocity.set(0, 0, 0);
      this.angularVelocity.set(0, 0, 0);

      // Restore Kinematic mode in Rapier world
      if (this.rapierWorld && this.rapierInstance) {
        for (const body of this.rapierBodies.values()) {
          body.setBodyType(this.rapierInstance.RigidBodyType.KinematicPositionBased, true);
        }
      }
    }

    return sample;
  }

  /**
   * Retrieves serializable map of bone transforms.
   */
  public getBoneTransforms(): Map<string, { position: [number, number, number]; quaternion: [number, number, number, number] }> {
    const result = new Map<string, { position: [number, number, number]; quaternion: [number, number, number, number] }>();
    for (const [boneName, transform] of this.boneTransforms) {
      result.set(boneName, {
        position: [transform.position.x, transform.position.y, transform.position.z],
        quaternion: [transform.quaternion.x, transform.quaternion.y, transform.quaternion.z, transform.quaternion.w]
      });
    }
    return result;
  }

  /**
   * Disposes all Rapier bodies, colliders, and joints from the physics world.
   */
  public dispose(world?: RAPIER.World): void {
    const targetWorld = world ?? this.rapierWorld;
    if (targetWorld) {
      for (const joint of this.rapierJoints) {
        targetWorld.removeImpulseJoint(joint, true);
      }
      for (const collider of this.rapierColliders.values()) {
        targetWorld.removeCollider(collider, false);
      }
      for (const body of this.rapierBodies.values()) {
        targetWorld.removeRigidBody(body);
      }
    }
    this.rapierJoints.length = 0;
    this.rapierColliders.clear();
    this.rapierBodies.clear();
    this.rapierWorld = null;
    this.rapierInstance = null;
    this.lastTargetPose = null;
    this.mode = "kinematic-active";
    this.linearVelocity.set(0, 0, 0);
    this.angularVelocity.set(0, 0, 0);
  }
}

/**
 * SimulatedRagdollSystem
 *
 * Exported alias matching unit test suite naming convention.
 */
export const SimulatedRagdollSystem = HumanoidRagdollSystem;
export type SimulatedRagdollSystem = HumanoidRagdollSystem;
