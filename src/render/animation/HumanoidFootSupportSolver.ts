import * as THREE from "three";

type LegSide = "left" | "right";

interface LegChain {
  thigh: THREE.Object3D;
  shin: THREE.Object3D;
  foot: THREE.Object3D;
}

export class HumanoidFootSupportSolver {
  private readonly legs: Partial<Record<LegSide, LegChain>> = {};
  private readonly hip = new THREE.Vector3();
  private readonly knee = new THREE.Vector3();
  private readonly ankle = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly bend = new THREE.Vector3();
  private readonly desiredKnee = new THREE.Vector3();
  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  private readonly pole = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly world = new THREE.Quaternion();
  private readonly parent = new THREE.Quaternion();
  private readonly rootWorld = new THREE.Quaternion();

  public constructor(private readonly root: THREE.Object3D) {
    for (const side of ["left", "right"] as const) {
      const thigh = root.getObjectByName(`rig_thigh_${side}`);
      const shin = root.getObjectByName(`rig_shin_${side}`);
      const foot = root.getObjectByName(`rig_foot_${side}`);
      if (thigh && shin && foot) this.legs[side] = { thigh, shin, foot };
    }
  }

  public alignFeet(leftTarget: THREE.Vector3, rightTarget: THREE.Vector3): void {
    this.root.updateWorldMatrix(true, true);
    this.root.getWorldQuaternion(this.rootWorld);
    this.alignLeg("left", leftTarget);
    this.alignLeg("right", rightTarget);
  }

  private alignLeg(side: LegSide, target: THREE.Vector3): void {
    const chain = this.legs[side];
    if (!chain) return;
    // Blender -Y is exported as model-local +Z. Keep the pole in that same
    // forward hemisphere so mounted and fixed-seat knees cannot solve behind
    // the pelvis while the feet remain locked to authored supports.
    this.pole.set(side === "left" ? -0.14 : 0.14, 0, 1)
      .applyQuaternion(this.rootWorld)
      .normalize();
    this.solveTwoBoneChain(chain, target, this.pole, side === "left" ? -1 : 1);
  }

  private solveTwoBoneChain(
    chain: LegChain,
    target: THREE.Vector3,
    preferredBendWorld: THREE.Vector3,
    fallbackBendX: number
  ): void {
    chain.thigh.getWorldPosition(this.hip);
    chain.shin.getWorldPosition(this.knee);
    chain.foot.getWorldPosition(this.ankle);
    const thighLength = this.hip.distanceTo(this.knee);
    const shinLength = this.knee.distanceTo(this.ankle);
    if (thighLength < 0.001 || shinLength < 0.001) return;

    this.direction.subVectors(target, this.hip);
    const rawDistance = this.direction.length();
    if (rawDistance < 0.0001) return;
    const distance = THREE.MathUtils.clamp(
      rawDistance,
      Math.abs(thighLength - shinLength) + 0.001,
      thighLength + shinLength - 0.001
    );
    this.direction.normalize();
    this.bend.copy(preferredBendWorld)
      .addScaledVector(this.direction, -preferredBendWorld.dot(this.direction));
    if (this.bend.lengthSq() < 0.00001) {
      this.bend.subVectors(this.knee, this.hip)
        .addScaledVector(this.direction, -this.bend.dot(this.direction));
    }
    if (this.bend.lengthSq() < 0.00001) {
      this.bend.set(fallbackBendX, 0, 0)
        .addScaledVector(this.direction, -fallbackBendX * this.direction.x);
    }
    this.bend.normalize();

    const along = (
      thighLength * thighLength - shinLength * shinLength + distance * distance
    ) / (2 * distance);
    const bendDistance = Math.sqrt(Math.max(0, thighLength * thighLength - along * along));
    this.desiredKnee.copy(this.hip)
      .addScaledVector(this.direction, along)
      .addScaledVector(this.bend, bendDistance);

    this.from.subVectors(this.knee, this.hip).normalize();
    this.to.subVectors(this.desiredKnee, this.hip).normalize();
    this.rotateBone(chain.thigh, this.from, this.to);

    chain.shin.getWorldPosition(this.knee);
    chain.foot.getWorldPosition(this.ankle);
    this.from.subVectors(this.ankle, this.knee).normalize();
    this.to.subVectors(target, this.knee).normalize();
    this.rotateBone(chain.shin, this.from, this.to);
  }

  private rotateBone(bone: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3): void {
    this.rotation.setFromUnitVectors(from, to);
    bone.getWorldQuaternion(this.world).premultiply(this.rotation);
    if (bone.parent) bone.parent.getWorldQuaternion(this.parent).invert();
    else this.parent.identity();
    bone.quaternion.copy(this.parent.multiply(this.world));
    bone.updateWorldMatrix(false, true);
  }
}
