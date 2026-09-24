import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { loadHumanoidAsset, characterMotion, characterContext } from '../helpers/humanoidAssets';
import { CarriagePresentation } from '../../src/render/presentation/CarriagePresentation';
import { HumanoidAnimator } from '../../src/render/animation/AnimationController';
import { resolveHumanoidRig } from '../../src/render/animation/HumanoidRig';
import { alignMarkerHand, alignSupportFeet } from '../../src/render/animation/CharacterEquipment';
import { advanceCarriagePose, carriagePoint, carriageFootprint, CARRIAGE_TUNING } from '../../src/simulation/mounts/Carriage';
import type { MountState } from '../../src/simulation/core/types';
import type { PresentedPlayerFrame } from '../../src/render/presentation/PlayerPresentationBuffer';

const position = (node: THREE.Object3D) => node.getWorldPosition(new THREE.Vector3());
const mount: MountState = { id: 'test.carriage', mountTypeId: 'mount.horse_carriage', x: 0, y: 0, z: 0, rotationY: 0,
  gallopStamina: 100, gallopRecoveryDelaySeconds: 0, gallopExhausted: false, fishCargoSlotIds: [null, null] };
const frame = (speed = 0, turnRate = 0): PresentedPlayerFrame => ({ x: 0, y: .5, z: 0, rotationY: 0,
  motion: characterMotion({ speedMetersPerSecond: Math.abs(speed), velocity: { x: 0, y: 0, z: speed },
    turnRateRadiansPerSecond: turnRate, requestedGait: speed > 2 ? 'trot' : speed ? 'walk' : 'idle' }),
  discontinuityReason: 'none', discontinuitySequence: 0 } as PresentedPlayerFrame);
async function assembly() {
  const [cart, horse] = await Promise.all([loadHumanoidAsset('prop_merchant_carriage_a'), loadHumanoidAsset('fauna_horse_draft_a')]);
  return new CarriagePresentation(cart, horse);
}

describe('carriage rolling and physical contacts', () => {
  it('keeps broad boards, seamless rolling loops and rigid shafts aligned with the harness on crests', async () => {
    const c = await assembly();
    try {
      const gate = c.cart.getObjectByName('prop_merchant_carriage_a_tailgate')!;
      const size = new THREE.Box3().setFromObject(gate).getSize(new THREE.Vector3());
      expect(size.x).toBeGreaterThan(size.y * 2.5);
      for (const clip of c.cart.userData.animationClips as THREE.AnimationClip[]) {
        if (!['walk', 'trot'].includes(clip.name)) continue;
        const wheels = clip.tracks.filter(t => t.name.includes('_wheel.quaternion'));
        expect(wheels).toHaveLength(4);
        for (const track of wheels) {
          const first = new THREE.Quaternion().fromArray(track.values, 0);
          const last = new THREE.Quaternion().fromArray(track.values, track.values.length - 4);
          expect(first.angleTo(last)).toBeLessThan(.001);
        }
      }
      const shaft = c.cart.getObjectByName('prop_merchant_carriage_a_shafts')!;
      const rest = new THREE.Vector3().fromArray(shaft.userData.neva_shaft_tip);
      const tugs = ['left','right'].map(side => c.root.getObjectByName(`prop_merchant_carriage_a_shaft_tug_${side}`)!);
      for (const slope of [-.2, .2]) for (let n = 0; n < 90; n++) {
        const f = frame(1.6, .18); f.z = n / 30;
        c.update(mount, f, true, 1/60, 1, (_x,z) => slope * z + .12 * Math.sin(z));
        const origin = position(shaft), tip = shaft.localToWorld(rest.clone());
        const tug = position(tugs[0]).add(position(tugs[1])).multiplyScalar(.5);
        expect(tip.distanceTo(origin)).toBeCloseTo(rest.length(), 5);
        expect(tip.sub(origin).angleTo(tug.sub(origin))).toBeLessThan(.001);
      }
    } finally { c.dispose(); }
  });

  it('turns around the rolling rear axle, reverses its arc, and cannot pivot in place', () => {
    const before = { x: 2, z: 3, rotationY: .7 }, speed = 2, steer = .3, dt = 1/60;
    expect(advanceCarriagePose(before, 0, steer, dt)).toEqual(before);
    const after = advanceCarriagePose(before, speed, steer, dt);
    const a = carriagePoint(before, 0, CARRIAGE_TUNING.rearAxleOffset);
    const b = carriagePoint(after, 0, CARRIAGE_TUNING.rearAxleOffset);
    expect(Math.hypot(b.x-a.x,b.z-a.z)).toBeCloseTo(speed*dt, 8);
    expect(Math.atan2(b.x-a.x,b.z-a.z)).toBeCloseTo((before.rotationY+after.rotationY)/2, 8);
    const reverse = advanceCarriagePose(after, -speed, steer, dt);
    expect(reverse.x).toBeCloseTo(before.x, 8); expect(reverse.z).toBeCloseTo(before.z, 8);
    expect(reverse.rotationY).toBeCloseTo(before.rotationY, 8);
    expect(carriageFootprint(mount, steer).at(-1)!.x).toBeGreaterThan(.8);
  });

  it('keeps both palms on the reins and both soles on the footboard on either slope', async () => {
    const c = await assembly(), player = await loadHumanoidAsset('char_player_a');
    const animator = new HumanoidAnimator(player), rig = resolveHumanoidRig(player);
    animator.setPreviewClip('rowboat_idle');
    try { for (const slope of [0,.15,-.15]) {
      c.update(mount, frame(), true, 1, 1, (_x,z)=>slope*z);
      animator.update(1/60, characterContext());
      player.position.copy(position(c.seat)); player.updateMatrixWorld(true);
      animator.alignPelvisSupport(position(c.seat));
      alignSupportFeet(animator,c.feet.left,c.feet.right);
      for (const side of ['left','right'] as const) {
        alignMarkerHand(animator,side,c.grips[side]);
        expect(position(rig.arms[side]!.grip!).distanceTo(position(c.grips[side]))).toBeLessThan(.01);
        const leg=rig.legs[side]!;
        expect(leg.foot.localToWorld(leg.soleOffset.clone()).distanceTo(position(c.feet[side]))).toBeLessThan(.01);
      }
    } } finally { animator.dispose(); c.dispose(); }
  });

  it.each([.12,-.12])('supports the horse independently on slope %s without burying the animated hoof mesh', async slope => {
    const c=await assembly(); const samples: {mesh:THREE.SkinnedMesh; indices:number[]}[]=[];
    c.horse.traverse(node=>{if(node instanceof THREE.SkinnedMesh){
      const a=node.geometry.getAttribute('position'),indices:number[]=[];
      for(let i=0;i<a.count;i++) if(new THREE.Vector3().fromBufferAttribute(a,i).applyMatrix4(node.matrixWorld).y<.08)indices.push(i);
      if(indices.length)samples.push({mesh:node,indices});
    }});
    expect(samples.length).toBeGreaterThan(0);
    const v=new THREE.Vector3();
    try {for(const speed of [0,1.6,3.2,-1.6])for(let n=0;n<48;n++){
      const f=frame(speed);f.z=n*Math.abs(speed)/60; f.y=.5+slope*f.z;
      c.update(mount,f,true,1/60,1,(_x,z)=>slope*z);
      expect(c.horse.position.y).toBeCloseTo(slope*CARRIAGE_TUNING.horseOffset,1);
      for(const {mesh,indices} of samples){mesh.skeleton.update();for(const i of indices){
        v.fromBufferAttribute(mesh.geometry.getAttribute('position'),i); mesh.applyBoneTransform(i,v);v.applyMatrix4(mesh.matrixWorld);
        expect(v.y-slope*v.z,`slope ${slope} speed ${speed} frame ${n}`).toBeGreaterThan(-.045);
      }}
    }} finally {c.dispose();}
  });

  it('deforms packed or interleaved published rein vertices into bounded ropes and rolls wheels backwards', async () => {
    const c=await assembly();
    try {c.update(mount,frame(-1.6),true,1/60,1,()=>0);
      const wheel=c.cart.getObjectByName('prop_merchant_carriage_a_front_left_wheel')!;
      expect(wheel.rotation.x).toBeLessThan(0);
      for(const side of ['left','right']){
        const rein=c.cart.getObjectByName(`prop_merchant_carriage_a_rein_${side}`) as THREE.Mesh;
        rein.geometry.computeBoundingBox(); const bounds=rein.geometry.boundingBox!.clone().applyMatrix4(rein.matrixWorld);
        expect(bounds.getSize(new THREE.Vector3()).x).toBeLessThan(1);
        expect(bounds.min.y).toBeGreaterThan(1.4);expect(bounds.max.y).toBeLessThan(2.6);
        expect(bounds.getSize(new THREE.Vector3()).z).toBeLessThan(4);
      }
    } finally {c.dispose();}
  });
});
