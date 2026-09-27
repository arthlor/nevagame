import * as THREE from "three";
import { removeNpcClipRootTravel } from "../animation/AuthoredNpcAnimator";
import { rowboatOarRotation } from "../animation/CharacterEquipment";
import { TwoBoneConstraintSolver } from "../animation/TwoBoneConstraintSolver";

const SIDES = ["left", "right"] as const;
type Limb = { upper: THREE.Object3D; lower: THREE.Object3D; end: THREE.Object3D; tip: THREE.Vector3; palm?: THREE.Quaternion; palmOffset?: THREE.Vector3; restRotation?: THREE.Quaternion; ankleHeight?: number };

/** Scenery only. Retained rigs dock to the same boat contacts as the player. */
export class AmbientBoatPresentation {
  private readonly mixer: THREE.AnimationMixer;
  private readonly idle: THREE.AnimationAction;
  private readonly pelvis: THREE.Object3D;
  private readonly spine: THREE.Object3D;
  private readonly leanAxis = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly controlCenter = new THREE.Vector3();
  private readonly anchor: THREE.Object3D;
  private readonly solver = new TwoBoneConstraintSolver();
  private readonly rest: { bone: THREE.Bone; position: THREE.Vector3; quaternion: THREE.Quaternion }[] = [];
  private readonly arms: Limb[];
  private readonly legs: Limb[];
  private readonly grips: THREE.Object3D[];
  private readonly feet: THREE.Object3D[];
  private readonly oars: { pivot: THREE.Group; side: "left" | "right" }[] = [];
  private readonly target = new THREE.Vector3();
  private readonly point = new THREE.Vector3();
  private readonly bend = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly parentRotation = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();

  constructor(readonly boat: THREE.Group, readonly driver: THREE.Group, readonly rowing: boolean) {
    const required = (root: THREE.Object3D, name: string): THREE.Object3D => {
      const node = root.getObjectByName(name);
      if (!node) throw new Error(`Ambient boat assembly is missing ${name}`);
      return node;
    };
    const bone = (name: string) => required(driver, `mixamorig${name}`);
    this.pelvis = bone("Hips");
    this.spine = bone("Spine");
    this.anchor = required(boat, rowing ? "boat_rowboat_rower_seat" : "boat_skiff_driver_station");
    boat.add(driver);
    driver.userData.dynamicPresentation = true;
    boat.updateMatrixWorld(true);
    driver.traverse(node => {
      if (node instanceof THREE.Bone) this.rest.push({ bone: node, position: node.position.clone(), quaternion: node.quaternion.clone() });
    });
    this.arms = SIDES.map(side => {
      const name = side === "left" ? "Left" : "Right";
      const upper = bone(`${name}Arm`), lower = bone(`${name}ForeArm`), end = bone(`${name}Hand`);
      const middle = bone(`${name}HandMiddle1`), index = bone(`${name}HandIndex1`), pinky = bone(`${name}HandPinky1`);
      const wrist = end.getWorldPosition(new THREE.Vector3());
      const fingers = middle.getWorldPosition(new THREE.Vector3()).sub(wrist).normalize();
      const across = index.getWorldPosition(new THREE.Vector3()).sub(pinky.getWorldPosition(new THREE.Vector3())).normalize();
      const normal = new THREE.Vector3().crossVectors(across, fingers).multiplyScalar(side === "left" ? 1 : -1).normalize();
      const palm = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(
        new THREE.Vector3().crossVectors(fingers, normal).normalize(), fingers, normal
      ));
      palm.premultiply(end.getWorldQuaternion(new THREE.Quaternion()).invert());
      const contact = middle.getWorldPosition(new THREE.Vector3()).lerp(wrist, .45);
      return { upper, lower, end, tip: lower.worldToLocal(wrist.clone()),
        palm: palm.invert(), palmOffset: end.worldToLocal(contact) };
    });
    this.legs = SIDES.map(side => {
      const name = side === "left" ? "Left" : "Right";
      const upper = bone(`${name}UpLeg`), lower = bone(`${name}Leg`), end = bone(`${name}Foot`);
      return { upper, lower, end, tip: lower.worldToLocal(end.getWorldPosition(new THREE.Vector3())),
        restRotation: driver.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(end.getWorldQuaternion(new THREE.Quaternion())),
        ankleHeight: driver.worldToLocal(end.getWorldPosition(new THREE.Vector3())).y };
    });
    this.feet = SIDES.map(side => required(boat, `${rowing ? "boat_rowboat" : "boat_skiff"}_foot_${side}_socket`));
    this.grips = SIDES.map(side => required(boat, rowing ? `boat_rowboat_oar_${side}_grip` : side === "left" ? "boat_skiff_helm_grip_left" : "boat_skiff_helm_grip"));
    if (rowing) {
      for (const side of SIDES) {
        const oar = required(boat, `boat_rowboat_oar_${side}_root`);
        const lock = required(boat, `boat_rowboat_oarlock_${side}`);
        const pivot = new THREE.Group();
        boat.add(pivot);
        pivot.position.copy(boat.worldToLocal(lock.getWorldPosition(this.point)));
        pivot.updateMatrixWorld(true);
        pivot.attach(oar);
        this.oars.push({ pivot, side });
      }
    }
    const clips = driver.userData.animationClips as THREE.AnimationClip[];
    const clip = clips.find(candidate => candidate.name === "idle");
    if (!clip) throw new Error("Ambient boat driver is missing its retained idle clip");
    this.mixer = new THREE.AnimationMixer(driver);
    this.idle = this.mixer.clipAction(removeNpcClipRootTravel(clip));
    this.idle.play();
    this.update(0, false);
  }

  update(seconds: number, reducedMotion: boolean): void {
    for (const { bone, position, quaternion } of this.rest) {
      bone.position.copy(position); bone.quaternion.copy(quaternion);
    }
    // Absolute time keeps a newly visible driver in phase without a large mixer step.
    this.idle.time = reducedMotion ? 0 : seconds % this.idle.getClip().duration;
    this.mixer.update(0);
    const phase = reducedMotion ? 0 : seconds / 2.4;
    for (const oar of this.oars) oar.pivot.rotation.copy(rowboatOarRotation(phase, !reducedMotion, oar.side, this.euler));
    this.driver.position.set(0, 0, 0);
    this.anchor.getWorldQuaternion(this.rotation);
    this.driver.quaternion.copy(this.boat.getWorldQuaternion(this.parentRotation).invert().multiply(this.rotation));
    this.boat.updateMatrixWorld(true);
    this.anchor.getWorldPosition(this.target);
    if (this.rowing) {
      // The seat is a contact surface; pelvis stays above it by the hip cushion.
      this.pelvis.getWorldPosition(this.point);
      this.target.add(this.point.set(0, .10, 0).applyQuaternion(this.boat.getWorldQuaternion(this.rotation)));
      this.pelvis.getWorldPosition(this.point);
      this.target.sub(this.point);
      this.driver.position.copy(this.boat.worldToLocal(this.driver.getWorldPosition(this.point).add(this.target)));
    } else {
      this.driver.position.copy(this.boat.worldToLocal(this.target));
    }
    this.boat.updateMatrixWorld(true);
    // Lean from the waist toward the controls before solving the arms. This
    // preserves bone lengths and seat/foot contacts across different body sizes.
    this.controlCenter.set(0, 0, 0);
    for (const grip of this.grips) this.controlCenter.add(grip.getWorldPosition(this.point));
    this.controlCenter.multiplyScalar(.5);
    this.spine.getWorldPosition(this.point);
    this.controlCenter.sub(this.point);
    this.up.set(0, 1, 0).applyQuaternion(this.boat.getWorldQuaternion(this.rotation));
    this.controlCenter.addScaledVector(this.up, -this.controlCenter.dot(this.up)).normalize();
    this.leanAxis.crossVectors(this.up, this.controlCenter).normalize();
    this.rotation.setFromAxisAngle(this.leanAxis, this.rowing ? .48 : .38);
    this.spine.getWorldQuaternion(this.parentRotation).premultiply(this.rotation);
    this.spine.parent!.getWorldQuaternion(this.rotation).invert();
    this.spine.quaternion.copy(this.rotation.multiply(this.parentRotation));
    this.spine.updateWorldMatrix(false, true);
    for (let i = 0; i < SIDES.length; i++) {
      const leg = this.legs[i];
      this.feet[i].getWorldPosition(this.target);
      // Retained foot origins are at the ankles. Keep the soles above the deck.
      this.target.add(this.point.set(0, leg.ankleHeight!, 0).applyQuaternion(this.driver.getWorldQuaternion(this.rotation)));
      this.bend.set(i === 0 ? .12 : -.12, 0, 1).applyQuaternion(this.driver.getWorldQuaternion(this.rotation));
      this.solver.solve(leg.upper, leg.lower, leg.tip, this.target, this.bend);
      this.driver.getWorldQuaternion(this.rotation).multiply(leg.restRotation!);
      leg.end.parent!.getWorldQuaternion(this.parentRotation).invert();
      leg.end.quaternion.copy(this.parentRotation.multiply(this.rotation));
      leg.end.updateWorldMatrix(false, true);
      const arm = this.arms[i];
      this.grips[i].getWorldQuaternion(this.rotation).multiply(arm.palm!);
      this.grips[i].getWorldPosition(this.target);
      this.target.sub(this.point.copy(arm.palmOffset!).applyQuaternion(this.rotation));
      this.bend.set(i === 0 ? 1 : -1, -.4, -.3).applyQuaternion(this.driver.getWorldQuaternion(this.rotation));
      this.solver.solve(arm.upper, arm.lower, arm.tip, this.target, this.bend);
      this.grips[i].getWorldQuaternion(this.rotation);
      this.rotation.multiply(arm.palm!);
      arm.end.parent!.getWorldQuaternion(this.parentRotation).invert();
      arm.end.quaternion.copy(this.parentRotation.multiply(this.rotation));
      arm.end.updateWorldMatrix(false, true);
    }
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.driver);
    this.driver.removeFromParent();
  }
}
