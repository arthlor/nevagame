import * as THREE from 'three';
import { ASSET_IDS } from '../assets/AssetCatalog';
import { CARRIAGE_TUNING } from '../../simulation/mounts/Carriage';
import type { MountState } from '../../simulation/core/types';
import type { PresentedPlayerFrame } from './PlayerPresentationBuffer';
import { resolveMountPresentationPose } from './MountPresentation';

/** Loaded catalog assembly; every pose and occupied socket follows simulation. */
export class CarriagePresentation {
  readonly root = new THREE.Group();
  readonly seat: THREE.Object3D;
  readonly sockets: THREE.Object3D[];
  private readonly mixers: THREE.AnimationMixer[] = [];
  private readonly actions: Map<string, THREE.AnimationAction>[] = [];
  private clip = '';
  private readonly wheels: THREE.Object3D[];
  private wheelAngle = 0;

  constructor(readonly cart: THREE.Group, readonly horse: THREE.Group) {
    this.root.name = 'horse_carriage_transport';
    this.root.add(cart, horse);
    horse.position.z = CARRIAGE_TUNING.horseOffset;
    const required = (name: string) => {
      const node = cart.getObjectByName(name);
      if (!node) throw new Error(`Carriage is missing ${name}`);
      return node;
    };
    this.seat = required(`${ASSET_IDS.PROP_MERCHANT_CARRIAGE_A}_driver_socket`);
    this.sockets = [1, 2].map(i => required(`${ASSET_IDS.PROP_MERCHANT_CARRIAGE_A}_cargo_0${i}`));
    this.wheels = ['front_left', 'front_right', 'rear_left', 'rear_right'].map(side => required(`${ASSET_IDS.PROP_MERCHANT_CARRIAGE_A}_${side}_wheel`));
    for (const root of [cart, horse]) {
      const mixer = new THREE.AnimationMixer(root);
      const clips = root.userData.animationClips as THREE.AnimationClip[];
      const actions = new Map<string, THREE.AnimationAction>();
      for (const name of ['idle', 'walk', 'trot']) {
        const clip = clips?.find(c => c.name === name);
        if (!clip) throw new Error(`Carriage assembly is missing ${name} animation`);
        actions.set(name, mixer.clipAction(clip));
      }
      this.mixers.push(mixer);
      this.actions.push(actions);
    }
  }

  update(mount: MountState, player: PresentedPlayerFrame, active: boolean, dt: number, locomotionScale: number): void {
    const pose = resolveMountPresentationPose(mount, player, active);
    this.root.position.set(pose.x, pose.y, pose.z);
    this.root.rotation.y = pose.rotationY;
    const speed = active ? player.motion.speedMetersPerSecond : 0;
    const name = speed < 0.025 ? 'idle' : player.motion.requestedGait === 'trot' ? 'trot' : 'walk';
    if (name !== this.clip) {
      for (const actions of this.actions) {
        const previous = actions.get(this.clip);
        const next = actions.get(name)!;
        const phase = previous && this.clip !== 'idle' && name !== 'idle'
          ? previous.time / previous.getClip().duration
          : 0;
        next.reset();
        next.time = phase * next.getClip().duration;
        next.play();
        if (previous) next.crossFadeFrom(previous, 0.16, false);
      }
      this.clip = name;
    }
    for (const mixer of this.mixers) {
      // Authored cadence, not live tuning: the walk/trot clips were baked for
      // 1.1/2.1 m/s, so the reference stays pinned here until the carriage
      // assembly is regenerated for the 1.6/3.2 m/s retune. Playback above 1.0
      // keeps the hooves planted at the cost of a brisker leg cycle.
      const reference = name === 'trot' ? 2.1 : 1.1;
      mixer.timeScale = name === 'idle' ? 1 : speed / reference * locomotionScale;
      mixer.update(Math.max(0, dt));
    }
    // Wheel rotation follows signed resolved distance even while reversing;
    // authored body suspension remains in the catalog animation.
    const signedSpeed = active ? player.motion.velocity.x * Math.sin(pose.rotationY) + player.motion.velocity.z * Math.cos(pose.rotationY) : 0;
    this.wheelAngle += signedSpeed * dt * locomotionScale / 0.56;
    for (const wheel of this.wheels) wheel.rotation.x = this.wheelAngle;
    this.root.updateMatrixWorld(true);
  }

  dispose(): void {
    this.mixers.forEach((mixer, i) => { mixer.stopAllAction(); mixer.uncacheRoot(i === 0 ? this.cart : this.horse); });
    this.root.removeFromParent();
  }
}
