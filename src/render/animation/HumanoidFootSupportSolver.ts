import * as THREE from "three";
import { resolveHumanoidRig, type HumanoidLegBinding, type HumanoidSide } from "./HumanoidRig";
import { TwoBoneConstraintSolver } from "./TwoBoneConstraintSolver";

/** Leg endpoint solving works with both hierarchical and source IK feet. */
export class HumanoidFootSupportSolver {
  private readonly rig;
  private readonly solver = new TwoBoneConstraintSolver();
  private readonly ankle = new THREE.Vector3();
  private readonly hip = new THREE.Vector3();
  private readonly knee = new THREE.Vector3();
  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  private readonly pole = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly offset = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly parent = new THREE.Quaternion();
  private readonly rootWorld = new THREE.Quaternion();
  private readonly footWorld = new THREE.Quaternion();
  private readonly desiredFootWorld = new THREE.Quaternion();

  public constructor(private readonly root: THREE.Object3D) {
    this.rig = resolveHumanoidRig(root);
  }

  public alignFeet(leftTarget: THREE.Vector3, rightTarget: THREE.Vector3,
    leftNormal: Readonly<{ x: number; y: number; z: number }> = THREE.Object3D.DEFAULT_UP,
    rightNormal: Readonly<{ x: number; y: number; z: number }> = leftNormal): void {
    this.alignSole("left", leftTarget, leftNormal);
    this.alignSole("right", rightTarget, rightNormal);
  }

  public soleWorldPosition(side: HumanoidSide, result: THREE.Vector3): boolean {
    const leg = this.rig.legs[side];
    if (!leg) return false;
    leg.foot.updateWorldMatrix(true, false);
    result.copy(leg.soleOffset).applyMatrix4(leg.foot.matrixWorld);
    return true;
  }

  /** Constrains the contact point and normal without replacing the source pose. */
  public alignSole(side: HumanoidSide, target: THREE.Vector3, normal: Readonly<{ x: number; y: number; z: number }>, weight = 1): void {
    const leg = this.prepareSoleTarget(side, target, normal, weight);
    if (leg) this.solve(leg, this.target, this.footWorld);
  }

  /** Vertical body adaptation needed to reach a contact without stretching. */
  public requiredPelvisDrop(side: HumanoidSide, target: THREE.Vector3, normal: Readonly<{ x: number; y: number; z: number }>, weight: number): number {
    const leg = this.prepareSoleTarget(side, target, normal, weight);
    if (!leg) return 0;
    leg.thigh.getWorldPosition(this.hip);
    leg.shin.getWorldPosition(this.knee);
    this.ankle.copy(leg.shinTip).applyMatrix4(leg.shin.matrixWorld);
    const reach = this.hip.distanceTo(this.knee) + this.knee.distanceTo(this.ankle) - 0.002;
    const horizontalSq = (this.hip.x - this.target.x) ** 2 + (this.hip.z - this.target.z) ** 2;
    const verticalReach = Math.sqrt(Math.max(0, reach * reach - horizontalSq));
    return Math.max(0, this.hip.y - this.target.y - verticalReach) * weight;
  }

  private prepareSoleTarget(side: HumanoidSide, target: THREE.Vector3, normal: Readonly<{ x: number; y: number; z: number }>, weight: number): HumanoidLegBinding | undefined {
    const leg = this.rig.legs[side];
    if (!leg) return undefined;
    this.root.updateWorldMatrix(true, true);
    leg.foot.getWorldQuaternion(this.footWorld);
    this.desiredFootWorld.copy(this.footWorld);
    if (leg.soleNormal.lengthSq() > 0.000001) {
      this.from.copy(leg.soleNormal).normalize().applyQuaternion(this.footWorld);
      this.to.set(normal.x, normal.y, normal.z).normalize();
      this.rotation.setFromUnitVectors(this.from, this.to);
      this.desiredFootWorld.premultiply(this.rotation);
      this.footWorld.slerp(this.desiredFootWorld, THREE.MathUtils.clamp(weight, 0, 1));
    }
    leg.foot.getWorldScale(this.offset);
    this.offset.multiply(leg.soleOffset).applyQuaternion(this.footWorld);
    this.target.copy(target).sub(this.offset);
    return leg;
  }

  private solve(leg: HumanoidLegBinding, target: THREE.Vector3, footRotation: THREE.Quaternion): void {
    this.root.getWorldQuaternion(this.rootWorld);
    this.pole.copy(leg.bendDirection).applyQuaternion(this.rootWorld).normalize();
    const endpoint = this.solver.solve(leg.thigh, leg.shin, leg.shinTip, target, this.pole);
    if (!endpoint) return;
    if (leg.detachedFoot) {
      this.ankle.copy(leg.shinTip).applyMatrix4(leg.shin.matrixWorld);
      if (leg.foot.parent) leg.foot.parent.worldToLocal(this.ankle);
      leg.foot.position.copy(this.ankle);
    }
    if (leg.foot.parent) leg.foot.parent.getWorldQuaternion(this.parent).invert();
    else this.parent.identity();
    leg.foot.quaternion.copy(this.parent.multiply(footRotation));
    leg.foot.updateWorldMatrix(false, true);
  }

}
