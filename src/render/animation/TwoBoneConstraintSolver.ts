import * as THREE from "three";

/** Rotation-only two-bone solve. The endpoint is independent of hierarchy. */
export class TwoBoneConstraintSolver {
  private readonly origin = new THREE.Vector3();
  private readonly joint = new THREE.Vector3();
  private readonly endpoint = new THREE.Vector3();
  private readonly reachable = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly bend = new THREE.Vector3();
  private readonly desiredJoint = new THREE.Vector3();
  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly world = new THREE.Quaternion();
  private readonly parent = new THREE.Quaternion();

  public solve(upper: THREE.Object3D, lower: THREE.Object3D, lowerTip: THREE.Vector3, targetWorld: THREE.Vector3, preferredBendWorld: THREE.Vector3): THREE.Vector3 | null {
    upper.getWorldPosition(this.origin);
    lower.getWorldPosition(this.joint);
    this.endpoint.copy(lowerTip).applyMatrix4(lower.matrixWorld);
    const a = this.origin.distanceTo(this.joint);
    const b = this.joint.distanceTo(this.endpoint);
    if (a < 0.001 || b < 0.001) return null;
    this.direction.subVectors(targetWorld, this.origin);
    const distance = THREE.MathUtils.clamp(this.direction.length(), Math.abs(a - b) + 0.001, a + b - 0.001);
    if (this.direction.lengthSq() < 0.000001) this.direction.subVectors(this.endpoint, this.origin);
    this.direction.normalize();
    this.reachable.copy(this.origin).addScaledVector(this.direction, distance);
    this.bend.subVectors(this.joint, this.origin);
    this.bend.addScaledVector(this.direction, -this.bend.dot(this.direction));
    if (this.bend.lengthSq() < 0.00001 || this.bend.dot(preferredBendWorld) < 0) {
      this.bend.copy(preferredBendWorld).addScaledVector(this.direction, -preferredBendWorld.dot(this.direction));
    }
    if (this.bend.lengthSq() < 0.00001) {
      this.bend.set(Math.abs(this.direction.x) < 0.9 ? 1 : 0, Math.abs(this.direction.x) < 0.9 ? 0 : 1, 0);
      this.bend.addScaledVector(this.direction, -this.bend.dot(this.direction));
    }
    this.bend.normalize();
    const along = (a * a - b * b + distance * distance) / (2 * distance);
    this.desiredJoint.copy(this.origin).addScaledVector(this.direction, along)
      .addScaledVector(this.bend, Math.sqrt(Math.max(0, a * a - along * along)));
    this.from.subVectors(this.joint, this.origin).normalize();
    this.to.subVectors(this.desiredJoint, this.origin).normalize();
    this.rotateBone(upper);
    lower.getWorldPosition(this.joint);
    this.endpoint.copy(lowerTip).applyMatrix4(lower.matrixWorld);
    this.from.subVectors(this.endpoint, this.joint).normalize();
    this.to.subVectors(this.reachable, this.joint).normalize();
    this.rotateBone(lower);
    return this.endpoint.copy(lowerTip).applyMatrix4(lower.matrixWorld);
  }

  private rotateBone(bone: THREE.Object3D): void {
    this.rotation.setFromUnitVectors(this.from, this.to);
    bone.getWorldQuaternion(this.world).premultiply(this.rotation);
    if (bone.parent) bone.parent.getWorldQuaternion(this.parent).invert();
    else this.parent.identity();
    bone.quaternion.copy(this.parent.multiply(this.world)).normalize();
    bone.updateWorldMatrix(false, true);
  }
}
