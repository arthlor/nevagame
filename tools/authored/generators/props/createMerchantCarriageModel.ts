import * as THREE from "three";
import { SurfaceBuilder, addGripMarker, addMarker, posTrack, rotTrack, type AuthoredModel, type GeneratorContext, type V3 } from "../../kit";
import { rope, timber, wheel } from "./parts";

const TOKENS = ["wood_honey_01", "wood_dark_01", "accent_teal_01", "metal_dark_01", "metal_brass_01"] as const;

/** Working four-wheel cart: retained bed/seat/cargo envelope, articulated forecarriage. */
export function createMerchantCarriageModel(context: GeneratorContext): AuthoredModel {
  const { spec, parameters: p } = context;
  const id = spec.id, width = Number(p.bedWidth), length = Number(p.bedLength), radius = Number(p.wheelRadius);
  const bed = radius + 0.22;
  const root = new THREE.Group(); root.name = `${id}_root`;
  const group = (suffix: string, parent: THREE.Object3D, at: V3 = [0, 0, 0]) => {
    const node = new THREE.Group(); node.name = `${id}_${suffix}`; node.position.set(...at); parent.add(node); return node;
  };
  const body = group("body", root);
  const surface = new SurfaceBuilder(TOKENS);
  const box = (s: SurfaceBuilder, at: V3, size: V3, token = 0) => timber(s,
    [at[0], at[1], at[2] - size[2] / 2], [at[0], at[1], at[2] + size[2] / 2],
    [size[0] / 2, size[1] / 2], token, { ref: [0, 1, 0], bevel: token === 3 ? 0.003 : 0.009 });
  for (const side of [-1, 1]) {
    box(surface, [side * width * 0.33, bed - 0.20, 0], [0.14, 0.19, length + 0.28], 1);
    for (let row = 0; row < 3; row++) box(surface, [side * (width / 2 + 0.015), bed + 0.14 + row * 0.17, 0], [0.075, 0.135, length + 0.12], row === 1 ? 2 : 0);
    box(surface, [side * (width / 2 + 0.015), bed + 0.60, 0], [0.12, 0.09, length + 0.20], 1);
    for (const z of [-length * 0.46, 0, length * 0.46]) box(surface, [side * (width / 2 + 0.045), bed + 0.30, z], [0.10, 0.69, 0.11], 1);
    box(surface, [side * width * 0.37, bed + 0.43, length * 0.4], [0.10, 0.67, 0.12], 1);
    box(surface, [side * (width * 0.5 + 0.15), bed - 0.18, length * 0.34], [0.30, 0.06, 0.40], 3);
  }
  for (let i = 0; i < 9; i++) box(surface, [-width / 2 + (i + 0.5) * width / 9, bed, 0], [width / 9 - 0.012, 0.095, length]);
  box(surface, [0, bed + 0.28, length / 2], [width, 0.54, 0.09]);
  box(surface, [0, bed + 0.79, length * 0.4], [width + 0.07, 0.10, 0.46], 1);
  // Two horizontal back slats, with a slight rake and restrained painted trim.
  for (const y of [bed + 0.96, bed + 1.13]) box(surface, [0, y, length * 0.28 - (y-bed-.9)*.12], [width + 0.02, 0.13, 0.055], y > bed+1 ? 0 : 2);
  for (const sign of [-1,1]) {
    timber(surface,[sign*width*.44,bed+.74,length*.28],[sign*width*.44,bed+1.24,length*.28-.055],[.035,.032],1,{ref:[1,0,0]});
    // Iron straps join the corner stakes and slatted sides; short bolt heads
    // read at the gameplay camera without covering timber in micro-detail.
    for(const z of [-length*.46,length*.46]) {
      box(surface,[sign*(width/2+.092),bed+.27,z],[.018,.63,.075],3);
      for(const y of [bed+.08,bed+.45]) box(surface,[sign*(width/2+.107),y,z],[.018,.033,.033],4);
    }
    timber(surface,[sign*.43,bed-.28,-length*.37],[sign*.43,bed-.28,length*.39],[.065,.07],1,{ref:[0,1,0]});
    for(const z of [-length*.37,length*.39]) box(surface,[sign*.43,bed-.15,z],[.16,.24,.20],1);
    // Boarding step and its two bent brackets.
    box(surface,[sign*(width/2+.21),bed-.11,length*.36],[.29,.045,.38],1);
    for(const z of [length*.36-.13,length*.36+.13]) timber(surface,[sign*width*.46,bed-.02,z],[sign*(width/2+.28),bed-.13,z],[.024,.022],3);
  }
  box(surface,[0,bed-.27,0],[.16,.14,length*.92],1);
  // A real footboard ahead of the bench, above the rotating forecarriage.
  box(surface, [0, bed + 0.18, length * 0.4 + 0.49], [0.78, 0.075, 0.45], 1);
  for (const side of [-1, 1]) box(surface, [side * 0.34, bed + 0.05, length * 0.4 + 0.45], [0.06, 0.28, 0.07], 3);
  body.add(surface.buildMesh(`${id}_body_mesh`));
  const seat = addMarker(`${id}_driver_socket`, [0, bed + 0.85, length * 0.4], "socket", body);
  for (const [side, sign] of [["left", 1], ["right", -1]] as const) {
    addMarker(`${id}_foot_${side}`, [sign * 0.19, bed + 0.218, length * 0.4 + 0.49], "socket", body);
    addGripMarker(`${id}_rein_grip_${side}`, [sign * 0.20, 0.28, 0.38], [0, -0.95, 0.31], [-sign, 0, 0], seat);
  }
  for (const [index, z] of [[1, 0.08], [2, -length * 0.29]]) addMarker(`${id}_cargo_0${index}`, [0, bed + 0.049, z], "socket", body);
  const gate = group("tailgate", body, [0, bed + 0.06, -length / 2]);
  const gateSurface = new SurfaceBuilder(TOKENS);
  box(gateSurface, [0, 0.21, 0], [width, 0.42, 0.075], 2);
  for (const side of [-1, 1]) box(gateSurface, [side * width * 0.34, 0.20, -0.045], [0.075, 0.44, 0.025], 3);
  gate.add(gateSurface.buildMesh(`${id}_tailgate_mesh`));
  const wheels: THREE.Object3D[] = [];
  for (const [axle, z] of [["front", length * 0.39], ["rear", -length * 0.37]] as const) {
    const wheelRadius = axle === "front" ? radius * 0.75 : radius;
    const pivot = group(`${axle}_axle`, root, [0, wheelRadius, z]);
    const axleSurface = new SurfaceBuilder(TOKENS);
    timber(axleSurface, [-width / 2 - 0.25, 0, 0], [width / 2 + 0.25, 0, 0], [0.055, 0.055], 3);
    if (axle === "front") {
      // Fifth-wheel plates and vertical kingpin transfer the pull into the chassis.
      for(const y of [bed-.28-wheelRadius,bed-.23-wheelRadius]) axleSurface.addLoft([
        {p:[0,y,0],w:.24,h:.24},{p:[0,y+.024,0],w:.24,h:.24}
      ],{sides:16,ref:[1,0,0],capStart:0,capEnd:0,token:3});
      timber(axleSurface,[0,0,0],[0,bed-.20-wheelRadius,0],[.055,.055],3,{ref:[1,0,0]});
      // Hinged shafts pitch independently of the cart on changing terrain.
      const shaftStart = length * 0.44;
      const shaftHeight = bed - 0.17;
      const shaftTipZ = length * 0.5 + Number(p.shaftLength);
      const shafts = group("shafts", pivot, [0, shaftHeight - wheelRadius, shaftStart - z]);
      shafts.userData.neva_shaft_tip = [0, 1.33 - shaftHeight, shaftTipZ - shaftStart];
      const shaftSurface = new SurfaceBuilder(TOKENS);
      for (const sign of [-1, 1]) rope(shaftSurface, [
        [sign * 0.49, 0, 0],
        [sign * 0.51, bed - 0.05 - shaftHeight, length * 0.75 - shaftStart],
        [sign * 0.51, 1.22 - shaftHeight, length * 0.98 - shaftStart],
        [sign * 0.48, 1.33 - shaftHeight, shaftTipZ - shaftStart]
      ], 0.05, 0, { sides: 8, taper: [1.1, 0.7] });
      shafts.add(shaftSurface.buildMesh(`${id}_shafts_mesh`));
    }
    pivot.add(axleSurface.buildMesh(`${id}_${axle}_axle_mesh`));
    for (const [side, sign] of [["left", 1], ["right", -1]] as const) {
      const node = group(`${axle}_${side}_wheel`, pivot, [sign * (width / 2 + 0.24), 0, 0]);
      const s = new SurfaceBuilder(TOKENS);
      // Shared wheel helper's tyre extends 4.4% beyond its nominal rim.
      wheel(s, [0, 0, 0], wheelRadius / 1.044, 0.11, axle === "front" ? 10 : 12, { rim: 0, spoke: 0, hub: 1, tyre: 3 }, { segments: 24 });
      for(const face of [-1,1]) s.addLoft([
        {p:[face*.105,0,0],w:wheelRadius*.125,h:wheelRadius*.125},
        {p:[face*.14,0,0],w:wheelRadius*.11,h:wheelRadius*.11}
      ],{sides:8,ref:[0,1,0],capStart:0,capEnd:0,token:3});
      node.userData.neva_wheel_radius = wheelRadius;
      node.add(s.buildMesh(`${node.name}_mesh`)); wheels.push(node);
    }
  }
  // Authored flexible reins: runtime bends these retained tubes between the
  // bench palm contacts and the horse's moving bit, without creating static art.
  for (const [side, sign] of [["left", 1], ["right", -1]] as const) {
    const s = new SurfaceBuilder(TOKENS);
    rope(s, Array.from({ length: 17 }, (_, i) => [sign * 0.20, bed + 1.13 - Math.sin(i / 16 * Math.PI) * 0.16, length * 0.4 + 0.38 + i / 16 * 3.4] as V3), 0.013, 1, { sides: 5 });
    root.add(s.buildMesh(`${id}_rein_${side}`));
  }
  // Separate harness parts are docked to the horse body/head bones by the
  // assembly. The collar and traces show how the horse pulls the shafts.
  const harness = group("harness_body", root, [0, 0, 3.5]);
  const leather = new SurfaceBuilder(TOKENS);
  const loop = (cx: number, cy: number, cz: number, rx: number, ry: number, tilt: number, thickness: number) => {
    leather.addLoft(Array.from({ length: 25 }, (_, i) => {
      const a = i / 24 * Math.PI * 2;
      return { p: [cx + rx * Math.cos(a), cy + ry * Math.sin(a), cz + tilt * Math.sin(a)] as V3, w: thickness, h: thickness };
    }), { sides: 6, ref: [0, 0, 1], token: 1 });
  };
  loop(0.02, 1.48, -0.12, 0.41, 0.44, 0, 0.026);
  loop(0.04, 1.66, 0.62, 0.43, 0.53, -0.24, 0.036);
  for (const sign of [-1, 1]) {
    rope(leather, [[sign * 0.44, 1.35, 0.75], [sign * 0.48, 1.33, 0.10], [sign * 0.49, 1.22, -0.78]], 0.021, 1, { sides: 6 });
    rope(leather, [[sign * 0.40, 1.60, -0.12], [sign * 0.49, 1.36, 0.10], [sign * 0.46, 1.22, 0.10]], 0.024, 1, { sides: 6 });
  }
  for (const [side, sign] of [["left", 1], ["right", -1]] as const) {
    addMarker(`${id}_shaft_tug_${side}`, [sign * .48, 1.33, 0], "socket", harness);
  }
  harness.add(leather.buildMesh(`${id}_harness_body_mesh`));
  const bridle = group("harness_head", root, [0, 0, 3.5]), headLeather = new SurfaceBuilder(TOKENS);
  for (const sign of [-1, 1]) rope(headLeather, [[sign * 0.16, 1.91, 1.51], [sign * 0.20, 2.16, 1.35], [sign * 0.21, 2.46, 1.16], [0.02, 2.57, 1.13]], 0.018, 1, { sides: 6 });
  headLeather.addLoft(([[-0.16, 1.91, 1.51], [-0.12, 1.84, 1.56], [0.13, 1.84, 1.58], [0.23, 1.94, 1.53], [0.18, 2.02, 1.50], [-0.11, 2.02, 1.47], [-0.16, 1.91, 1.51]] as V3[]).map(p => ({ p, w: 0.020, h: 0.020 })), { sides: 6, ref: [0, 0, 1], token: 1 });
  bridle.add(headLeather.buildMesh(`${id}_harness_head_mesh`));
  const clips = (spec.animationClips ?? []).map(c => {
    const d = c.durationSeconds, tracks: THREE.KeyframeTrack[] = [];
    tracks.push(posTrack(body.name, [0, 0, 0], Array.from({ length: 25 }, (_, i) => [i / 24 * d, 0, c.name === "idle" ? 0 : 0.006 * Math.sin(i / 24 * Math.PI * 2), 0] as const)));
    if (c.name === "load") tracks.push(rotTrack(gate.name, [[0, 0, 0, 0], [d * 0.5, 90, 0, 0], [d, 90, 0, 0]]));
    else for (const w of wheels) tracks.push(rotTrack(w.name, Array.from({ length: 49 }, (_, i) => [i / 48 * d, (c.referenceSpeedMetersPerSecond ?? 0) * i / 48 * d / Number(w.userData.neva_wheel_radius) * 180 / Math.PI, 0, 0] as const)));
    return new THREE.AnimationClip(c.name, d, tracks);
  });
  return { root, clips };
}
