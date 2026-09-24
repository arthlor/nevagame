import * as THREE from 'three';
import { ASSET_IDS, ASSET_BY_ID } from '../assets/AssetCatalog';
import { CARRIAGE_TUNING } from '../../simulation/mounts/Carriage';
import type { MountState } from '../../simulation/core/types';
import type { PresentedPlayerFrame } from './PlayerPresentationBuffer';
import { resolveMountPresentationPose } from './MountPresentation';
import { WorldLayout } from '../../world/WorldLayout';
import { TwoBoneConstraintSolver } from '../animation/TwoBoneConstraintSolver';

const SIDES = ['left', 'right'] as const;
const v = new THREE.Vector3(), q = new THREE.Quaternion(), parentQ = new THREE.Quaternion();

/** Loaded catalog assembly; terrain and attachments remain presentation of accepted motion. */
export class CarriagePresentation {
  readonly root = new THREE.Group();
  readonly seat: THREE.Object3D;
  readonly sockets: THREE.Object3D[];
  readonly feet: Record<'left' | 'right', THREE.Object3D>;
  readonly grips: Record<'left' | 'right', THREE.Object3D>;
  private readonly mixers: THREE.AnimationMixer[] = [];
  private readonly actions: Map<string, THREE.AnimationAction>[] = [];
  private readonly fades = new Map<THREE.AnimationAction, { from: number; to: number; age: number }>();
  private clip = '';
  private readonly frontAxle: THREE.Object3D;
  private readonly shafts: THREE.Object3D;
  private readonly shaftTip: THREE.Vector3;
  private readonly shaftTugs: THREE.Object3D[];
  private readonly wheels: { node: THREE.Object3D; angle: number; side: number; front: boolean; radius: number }[];
  private readonly legs: { upper: THREE.Object3D; lower: THREE.Object3D; hoof: THREE.Object3D; tip: THREE.Vector3; sole: THREE.Vector3 }[];
  private readonly bonePose: { node: THREE.Object3D; position: THREE.Vector3; quaternion: THREE.Quaternion }[] = [];
  private readonly solver = new TwoBoneConstraintSolver();
  private readonly reins: { mesh: THREE.Mesh; rest: Float32Array; sign: number; grip: THREE.Object3D; bit: THREE.Object3D; minZ: number; span: number; origin: THREE.Vector3 }[];
  private initialized = false;
  private steering = 0;

  constructor(readonly cart: THREE.Group, readonly horse: THREE.Group) {
    this.root.name = 'horse_carriage_transport';
    this.root.add(cart, horse);
    horse.position.z = CARRIAGE_TUNING.horseOffset;
    const required = (root: THREE.Object3D, name: string) => {
      const node = root.getObjectByName(name);
      if (!node) throw new Error(`Carriage is missing ${name}`);
      return node;
    };
    const cartNode = (suffix: string) => required(cart, `${ASSET_IDS.PROP_MERCHANT_CARRIAGE_A}_${suffix}`);
    this.seat = cartNode('driver_socket');
    this.sockets = [1, 2].map(i => cartNode(`cargo_0${i}`));
    this.feet = { left: cartNode('foot_left'), right: cartNode('foot_right') };
    this.grips = { left: cartNode('rein_grip_left'), right: cartNode('rein_grip_right') };
    this.frontAxle = cartNode('front_axle');
    this.shafts = cartNode('shafts');
    this.shaftTip = new THREE.Vector3().fromArray(this.shafts.userData.neva_shaft_tip);
    this.shaftTugs = SIDES.map(side => cartNode(`shaft_tug_${side}`));
    this.wheels = ['front', 'rear'].flatMap(axle => SIDES.map(side => {
      const node = cartNode(`${axle}_${side}_wheel`);
      const radius = Number(node.userData.neva_wheel_radius);
      if (!(radius > 0)) throw new Error(`Carriage wheel ${node.name} has no rolling radius`);
      return { node, radius, angle: 0, side: side === 'left' ? 1 : -1, front: axle === 'front' };
    }));
    horse.updateMatrixWorld(true);
    this.legs = ['front_left', 'front_right', 'rear_left', 'rear_right'].map(name => {
      const upper = required(horse, `horse_${name}_upper`), lower = required(horse, `horse_${name}_lower`), hoof = required(horse, `horse_${name}_hoof`);
      const ankle = hoof.getWorldPosition(new THREE.Vector3());
      const tip = lower.worldToLocal(ankle.clone());
      const sole = hoof.worldToLocal(new THREE.Vector3(ankle.x, 0, ankle.z));
      return { upper, lower, hoof, tip, sole };
    });
    horse.traverse(node => { if ((node as THREE.Bone).isBone) this.bonePose.push({ node, position: node.position.clone(), quaternion: node.quaternion.clone() }); });
    horse.updateMatrixWorld(true); cart.updateMatrixWorld(true);
    required(horse, 'horse_body').attach(cartNode('harness_body'));
    required(horse, 'horse_head').attach(cartNode('harness_head'));
    this.reins = SIDES.map(side => {
      const node = cartNode(`rein_${side}`);
      let mesh: THREE.Mesh | undefined;
      node.traverse(n => { if (!mesh && (n as THREE.Mesh).isMesh) mesh = n as THREE.Mesh; });
      if (!mesh) throw new Error(`Carriage rein ${side} has no authored tube`);
      mesh.geometry = mesh.geometry.clone(); // Never deform a cached asset's geometry.
      mesh.frustumCulled = false;
      const positions = mesh.geometry.getAttribute('position');
      const rest = new Float32Array(positions.count * 3);
      for (let i = 0; i < positions.count; i++) {
        const point = cart.worldToLocal(mesh.localToWorld(new THREE.Vector3().fromBufferAttribute(positions, i)));
        rest.set(point.toArray(), i * 3);
      }
      let minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < positions.count; i++) { minZ = Math.min(minZ, rest[i * 3 + 2]); maxZ = Math.max(maxZ, rest[i * 3 + 2]); }
      return { mesh, rest, sign: side === 'left' ? 1 : -1, grip: this.grips[side], bit: required(horse, `${ASSET_IDS.FAUNA_HORSE_DRAFT_A}_bit_${side}`), minZ, span: maxZ - minZ, origin: cart.worldToLocal(this.grips[side].getWorldPosition(new THREE.Vector3())) };
    });
    for (const model of [cart, horse]) {
      const mixer = new THREE.AnimationMixer(model);
      const clips = model.userData.animationClips as THREE.AnimationClip[];
      const actions = new Map<string, THREE.AnimationAction>();
      for (const name of ['idle', 'walk', 'trot']) {
        const clip = clips?.find(c => c.name === name);
        if (!clip) throw new Error(`Carriage assembly is missing ${name} animation`);
        actions.set(name, mixer.clipAction(clip));
      }
      this.mixers.push(mixer); this.actions.push(actions);
    }
  }

  update(mount: MountState, player: PresentedPlayerFrame, active: boolean, dt: number, locomotionScale: number,
    heightAt: (x: number, z: number) => number = (x, z) => WorldLayout.traversalSurfaceHeight(x, z)): void {
    dt = Math.max(0, dt);
    const pose = resolveMountPresentationPose(mount, player, active);
    const discontinuity = !this.initialized || Math.hypot(pose.x - this.root.position.x, pose.z - this.root.position.z) > 2;
    this.root.position.set(pose.x, pose.y, pose.z);
    this.root.rotation.y = pose.rotationY;
    const speed = active ? player.motion.speedMetersPerSecond : 0;
    const signedSpeed = active ? player.motion.velocity.x * Math.sin(pose.rotationY) + player.motion.velocity.z * Math.cos(pose.rotationY) : 0;
    const desiredSteering = Math.abs(signedSpeed) > 0.025
      ? Math.atan(player.motion.turnRateRadiansPerSecond * CARRIAGE_TUNING.wheelbase / signedSpeed) : discontinuity ? 0 : this.steering;
    this.steering = discontinuity ? desiredSteering : THREE.MathUtils.damp(this.steering, desiredSteering, 14, dt);
    this.frontAxle.rotation.y = this.steering;
    const horseArm = CARRIAGE_TUNING.horseOffset - CARRIAGE_TUNING.frontAxleOffset;
    this.horse.position.set(Math.sin(this.steering) * horseArm, this.horse.position.y, CARRIAGE_TUNING.frontAxleOffset + Math.cos(this.steering) * horseArm);
    this.horse.rotation.y = this.steering;
    this.fitSupport(this.cart, 0.94, CARRIAGE_TUNING.rearAxleOffset, CARRIAGE_TUNING.frontAxleOffset, heightAt, dt, discontinuity);
    this.fitSupport(this.horse, 0.25, -0.52, 0.78, heightAt, dt, discontinuity);
    const name = speed < 0.025 ? 'idle' : signedSpeed > 0 && player.motion.requestedGait === 'trot' ? 'trot' : 'walk';
    if (name !== this.clip) {
      for (const actions of this.actions) {
        const previous = actions.get(this.clip), next = actions.get(name)!;
        const reuse = next.isScheduled() && next.getEffectiveWeight() > 0;
        const weight = reuse ? next.getEffectiveWeight() : 0;
        if (!reuse) {
          next.reset();
          if (previous && this.clip !== 'idle' && name !== 'idle') next.time = previous.time / previous.getClip().duration * next.getClip().duration;
        }
        next.setEffectiveWeight(weight).play();
        for (const action of actions.values()) if (action.isScheduled()) this.fades.set(action, { from: action.getEffectiveWeight(), to: action === next ? 1 : 0, age: discontinuity ? 0.18 : 0 });
      }
      this.clip = name;
    }
    for (const [action, fade] of this.fades) {
      fade.age = Math.min(0.18, fade.age + dt); const t = fade.age / 0.18;
      action.setEffectiveWeight(THREE.MathUtils.lerp(fade.from, fade.to, t * t * (3 - 2 * t)));
      if (t === 1) { this.fades.delete(action); if (!fade.to) action.stop(); }
    }
    for (const saved of this.bonePose) { saved.node.position.copy(saved.position); saved.node.quaternion.copy(saved.quaternion); }
    this.mixers.forEach((mixer, index) => {
      const id = index === 0 ? ASSET_IDS.PROP_MERCHANT_CARRIAGE_A : ASSET_IDS.FAUNA_HORSE_DRAFT_A;
      for (const [clip, action] of this.actions[index]) {
        const reference = ASSET_BY_ID.get(id)?.animationClips?.find(c => c.name === clip)?.referenceSpeedMetersPerSecond;
        action.setEffectiveTimeScale(reference ? signedSpeed / reference * locomotionScale : 1);
      }
      mixer.update(dt);
    });
    for (const saved of this.bonePose) { saved.position.copy(saved.node.position); saved.quaternion.copy(saved.node.quaternion); }
    const yawRate = active ? player.motion.turnRateRadiansPerSecond : 0;
    for (const wheel of this.wheels) {
      const wheelSpeed = (signedSpeed - yawRate * wheel.side * 0.94) / (wheel.front ? Math.cos(this.steering) : 1);
      wheel.angle += wheelSpeed * dt * locomotionScale / wheel.radius;
      wheel.node.rotation.x = wheel.angle;
    }
    this.root.updateMatrixWorld(true);
    this.groundHooves(heightAt);
    const tug = this.shaftTugs[0].getWorldPosition(new THREE.Vector3())
      .add(this.shaftTugs[1].getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5);
    this.frontAxle.worldToLocal(tug).sub(this.shafts.position);
    this.shafts.quaternion.setFromUnitVectors(this.shaftTip.clone().normalize(), tug.normalize());
    this.shafts.updateWorldMatrix(false, true);
    this.updateReins();
    this.initialized = true;
  }

  private fitSupport(model: THREE.Object3D, halfWidth: number, rearZ: number, frontZ: number,
    heightAt: (x: number, z: number) => number, dt: number, snap: boolean): void {
    this.root.updateMatrixWorld(true);
    const center = this.root.localToWorld(new THREE.Vector3(model.position.x, 0, model.position.z));
    const yaw = this.root.rotation.y + model.rotation.y, c = Math.cos(yaw), s = Math.sin(yaw);
    const at = (x: number, z: number) => heightAt(center.x + c * x + s * z, center.z - s * x + c * z);
    const fl = at(halfWidth, frontZ), fr = at(-halfWidth, frontZ), rl = at(halfWidth, rearZ), rr = at(-halfWidth, rearZ);
    const front = (fl + fr) / 2, rear = (rl + rr) / 2;
    const y = THREE.MathUtils.lerp(rear, front, -rearZ / (frontZ - rearZ)) - this.root.position.y;
    const pitch = -Math.atan2(front - rear, frontZ - rearZ), roll = Math.atan2((fl + rl - fr - rr) / 2, halfWidth * 2);
    model.position.y = snap ? y : THREE.MathUtils.damp(model.position.y, y, 24, dt);
    model.rotation.set(snap ? pitch : THREE.MathUtils.damp(model.rotation.x, pitch, 14, dt), model.rotation.y,
      snap ? roll : THREE.MathUtils.damp(model.rotation.z, roll, 14, dt), 'YXZ');
  }

  private groundHooves(heightAt: (x: number, z: number) => number): void {
    const origin = this.horse.getWorldPosition(new THREE.Vector3());
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.horse.getWorldQuaternion(q));

    for (const leg of this.legs) {
      const sole = leg.hoof.localToWorld(leg.sole.clone());
      const plane = origin.y - (up.x * (sole.x - origin.x) + up.z * (sole.z - origin.z)) / Math.max(0.5, up.y);
      const lift = Math.max(0, sole.y - plane);
      const target = leg.hoof.getWorldPosition(v).clone(); target.y += heightAt(sole.x, sole.z) + lift - sole.y;
      const top = leg.upper.getWorldPosition(new THREE.Vector3());
      const axis = leg.hoof.getWorldPosition(new THREE.Vector3()).sub(top).normalize();
      const bend = leg.lower.getWorldPosition(new THREE.Vector3()).sub(top);
      bend.addScaledVector(axis, -bend.dot(axis)).normalize();
      leg.hoof.getWorldQuaternion(q);
      this.solver.solve(leg.upper, leg.lower, leg.tip, target, bend, 0.025);
      leg.hoof.parent!.getWorldQuaternion(parentQ).invert();
      leg.hoof.quaternion.copy(parentQ.multiply(q));
      leg.hoof.updateWorldMatrix(false, true);
    }
  }

  private updateReins(): void {
    for (const rein of this.reins) {
      const start = this.cart.worldToLocal(rein.grip.getWorldPosition(new THREE.Vector3()));
      const end = this.cart.worldToLocal(rein.bit.getWorldPosition(new THREE.Vector3()));
      const a = start.clone().lerp(end, 0.3); a.x += rein.sign * 0.25; a.y -= 0.12;
      const b = start.clone().lerp(end, 0.7); b.x += rein.sign * 0.28; b.y -= 0.12;
      const curve = new THREE.CatmullRomCurve3([start, a, b, end]);
      const position = rein.mesh.geometry.getAttribute('position');
      const toMesh = new THREE.Matrix4().copy(rein.mesh.matrixWorld).invert().multiply(this.cart.matrixWorld);
      for (let i = 0; i < position.count; i++) {
        const t = THREE.MathUtils.clamp((rein.rest[i * 3 + 2] - rein.minZ) / rein.span, 0, 1);
        const point = curve.getPoint(t);
        const dx = rein.rest[i * 3] - rein.origin.x;
        const dy = rein.rest[i * 3 + 1] - (rein.origin.y - Math.sin(t * Math.PI) * 0.16);
        point.x += dx; point.y += dy; point.applyMatrix4(toMesh);
        position.setXYZ(i, point.x, point.y, point.z);
      }
      position.needsUpdate = true;
      rein.mesh.geometry.computeVertexNormals();
    }
  }

  dispose(): void {
    this.mixers.forEach((mixer, i) => { mixer.stopAllAction(); mixer.uncacheRoot(i === 0 ? this.cart : this.horse); });
    this.reins.forEach(rein => rein.mesh.geometry.dispose());
    this.root.removeFromParent();
  }
}
