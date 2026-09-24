import * as THREE from "three";
import { fishMarketMaterial } from "./materials";
import { extrude as extrudeProfile, lathe, type Point2D } from "./geom";
import {
  attachFishAnatomy,
  buildCarvedSignEmblem,
  buildSculptedFishBody,
  buildSculptedTailFin,
  type FishSpecies
} from "./fish";
import type { ProceduralModelOptions } from "./createFishMarketShopModel";

export interface PartContext {
  root: THREE.Group;
  nodes: Map<string, THREE.Group>;
  options: ProceduralModelOptions;
}

interface Part {
  parent: string;
  key: string;
  name: string;
  mat: string;
  at: [number, number, number];
  rot: [number, number, number];
}

function place(
  ctx: PartContext,
  part: Part,
  geometry: THREE.BufferGeometry,
  meshAt?: [number, number, number]
): THREE.Mesh {
  const node = new THREE.Group();
  node.name = `${part.name}__pivot`;
  node.position.set(...part.at);
  node.rotation.set(...part.rot);
  (ctx.nodes.get(part.parent) ?? ctx.root).add(node);
  ctx.nodes.set(part.key, node);
  const mesh = new THREE.Mesh(geometry, fishMarketMaterial(part.mat));
  mesh.name = part.name;
  if (meshAt) mesh.position.set(...meshAt);
  mesh.castShadow = ctx.options.castShadow ?? true;
  mesh.receiveShadow = ctx.options.receiveShadow ?? true;
  node.add(mesh);
  return mesh;
}

/**
 * The reconstruction's source template built each part's geometry into a local,
 * then ran a scale pass over it (usually identity) before meshing. That pass
 * also renormalizes the geometry normals, so it is part of the approved surface
 * and is reproduced here. `slat`, `fishBody` and `emblem` are the exceptions:
 * their source geometry was constructed without that pass.
 */
function scaled(geometry: THREE.BufferGeometry, scale?: [number, number, number]): THREE.BufferGeometry {
  geometry.scale(...(scale ?? [1, 1, 1]));
  return geometry;
}

function box(ctx: PartContext, part: Part & { size: [number, number, number, number?, number?, number?]; scale?: [number, number, number] }): void {
  place(ctx, part, scaled(new THREE.BoxGeometry(...part.size), part.scale));
}

function extrude(
  ctx: PartContext,
  part: Part & { profile: Point2D[]; depth: number; scale?: [number, number, number] }
): void {
  place(ctx, part, scaled(extrudeProfile(part.profile, part.depth), part.scale));
}

function ball(ctx: PartContext, part: Part & { size: [number, number, number]; scale?: [number, number, number] }): void {
  place(ctx, part, scaled(new THREE.SphereGeometry(...part.size), part.scale));
}

function hoop(ctx: PartContext, part: Part & { size: [number, number, number, number]; scale?: [number, number, number] }): void {
  place(ctx, part, scaled(new THREE.TorusGeometry(...part.size), part.scale));
}

function turned(ctx: PartContext, part: Part & { profile: Point2D[]; segments: number; scale?: [number, number, number] }): void {
  place(ctx, part, scaled(lathe(part.profile, part.segments), part.scale));
}

function band(
  ctx: PartContext,
  part: Part & { size: [number, number, number, number, number]; meshAt?: [number, number, number] }
): void {
  place(ctx, part, scaled(new THREE.CylinderGeometry(...part.size)), part.meshAt);
}

/** Window lattice slats: the source built these boxes without the scale pass. */
function slat(ctx: PartContext, part: Part & { size: [number, number, number] }): void {
  place(ctx, part, new THREE.BoxGeometry(...part.size));
}

function fishBody(ctx: PartContext, part: Part & { species: FishSpecies; size: [number, number, number] }): THREE.Mesh {
  const mesh = place(ctx, part, buildSculptedFishBody(part.species, ...part.size));
  attachFishAnatomy(mesh, part.species, ...part.size, fishMarketMaterial(part.mat));
  return mesh;
}

function fishTail(ctx: PartContext, part: Part & { species: FishSpecies; scale?: [number, number, number] }): void {
  place(ctx, part, scaled(buildSculptedTailFin(part.species), part.scale));
}

function emblem(ctx: PartContext, part: Part): void {
  place(ctx, part, buildCarvedSignEmblem());
}

/** Tail fin hung off a landed fish body (the ground-crate fish), authored transform. */
function tailOnBody(ctx: PartContext, bodyKey: string, name: string): void {
  const body = ctx.nodes.get(bodyKey)?.children.find((child): child is THREE.Mesh => (child as THREE.Mesh).isMesh);
  if (!body) throw new Error(`tailOnBody: no mesh under ${bodyKey}`);
  const tail = new THREE.Mesh(buildSculptedTailFin("mackerel"), fishMarketMaterial("fish-blue"));
  tail.name = name;
  tail.position.set(0, 0, -0.21);
  tail.rotation.set(-Math.PI / 2, 0, -Math.PI / 2);
  tail.scale.set(0.68, 0.68, 0.68);
  tail.castShadow = ctx.options.castShadow ?? true;
  tail.receiveShadow = ctx.options.receiveShadow ?? true;
  body.add(tail);
}

/** Named attachment socket as an empty child of a part node. */
function socketOn(ctx: PartContext, nodeKey: string, name: string): void {
  const node = ctx.nodes.get(nodeKey);
  if (!node) throw new Error(`socketOn: missing node ${nodeKey}`);
  const socket = new THREE.Object3D();
  socket.name = name;
  node.add(socket);
}

/** All 274 shop parts in authored order. Values migrated from the approved reconstruction. */
export function buildFishMarketParts(ctx: PartContext): void {
const TILE_COURSE_E_1: Point2D[] = [[-2.345,0.62],[2.495,0.62],[2.495,0.03],[2.465,0.0],[2.0585,0.0],[2.0285,0.03],[2.0285,0.52],[1.9935,0.52],[1.9935,0.03],[1.9635,0.0],[1.5745,0.0],[1.5445,0.03],[1.5445,0.52],[1.5095,0.52],[1.5095,0.03],[1.4795,0.0],[1.0905,0.0],[1.0605,0.03],[1.0605,0.52],[1.0255,0.52],[1.0255,0.03],[0.9955,0.0],[0.6065,0.0],[0.5765,0.03],[0.5765,0.52],[0.5415,0.52],[0.5415,0.03],[0.5115,0.0],[0.1225,0.0],[0.0925,0.03],[0.0925,0.52],[0.0575,0.52],[0.0575,0.03],[0.0275,0.0],[-0.3615,0.0],[-0.3915,0.03],[-0.3915,0.52],[-0.4265,0.52],[-0.4265,0.03],[-0.4565,0.0],[-0.8455,0.0],[-0.8755,0.03],[-0.8755,0.52],[-0.9105,0.52],[-0.9105,0.03],[-0.9405,0.0],[-1.3295,0.0],[-1.3595,0.03],[-1.3595,0.52],[-1.3945,0.52],[-1.3945,0.03],[-1.4245,0.0],[-1.8135,0.0],[-1.8435,0.03],[-1.8435,0.52],[-1.8785,0.52],[-1.8785,0.03],[-1.9085,0.0],[-2.315,0.0],[-2.345,0.03]]; // roof tile course (east), 4 parts (first: Roof tile course E1)
const TILE_COURSE_E_2: Point2D[] = [[-2.345,0.62],[2.495,0.62],[2.495,0.03],[2.495,0.0],[2.3005,0.0],[2.2705,0.03],[2.2705,0.52],[2.2355,0.52],[2.2355,0.03],[2.2055,0.0],[1.8165,0.0],[1.7865,0.03],[1.7865,0.52],[1.7515,0.52],[1.7515,0.03],[1.7215,0.0],[1.3325,0.0],[1.3025,0.03],[1.3025,0.52],[1.2675,0.52],[1.2675,0.03],[1.2375,0.0],[0.8485,0.0],[0.8185,0.03],[0.8185,0.52],[0.7835,0.52],[0.7835,0.03],[0.7535,0.0],[0.3645,0.0],[0.3345,0.03],[0.3345,0.52],[0.2995,0.52],[0.2995,0.03],[0.2695,0.0],[-0.1195,0.0],[-0.1495,0.03],[-0.1495,0.52],[-0.1845,0.52],[-0.1845,0.03],[-0.2145,0.0],[-0.6035,0.0],[-0.6335,0.03],[-0.6335,0.52],[-0.6685,0.52],[-0.6685,0.03],[-0.6985,0.0],[-1.0875,0.0],[-1.1175,0.03],[-1.1175,0.52],[-1.1525,0.52],[-1.1525,0.03],[-1.1825,0.0],[-1.5715,0.0],[-1.6015,0.03],[-1.6015,0.52],[-1.6365,0.52],[-1.6365,0.03],[-1.6665,0.0],[-2.0555,0.0],[-2.0855,0.03],[-2.0855,0.52],[-2.1205,0.52],[-2.1205,0.03],[-2.1505,0.0],[-2.345,0.0],[-2.345,0.03]]; // roof tile course (east), 4 parts (first: Roof tile course E2)
const TILE_COURSE_W_1: Point2D[] = [[-2.495,0.62],[2.345,0.62],[2.345,0.03],[2.315,0.0],[1.9085,0.0],[1.8785,0.03],[1.8785,0.52],[1.8435,0.52],[1.8435,0.03],[1.8135,0.0],[1.4245,0.0],[1.3945,0.03],[1.3945,0.52],[1.3595,0.52],[1.3595,0.03],[1.3295,0.0],[0.9405,0.0],[0.9105,0.03],[0.9105,0.52],[0.8755,0.52],[0.8755,0.03],[0.8455,0.0],[0.4565,0.0],[0.4265,0.03],[0.4265,0.52],[0.3915,0.52],[0.3915,0.03],[0.3615,0.0],[-0.0275,0.0],[-0.0575,0.03],[-0.0575,0.52],[-0.0925,0.52],[-0.0925,0.03],[-0.1225,0.0],[-0.5115,0.0],[-0.5415,0.03],[-0.5415,0.52],[-0.5765,0.52],[-0.5765,0.03],[-0.6065,0.0],[-0.9955,0.0],[-1.0255,0.03],[-1.0255,0.52],[-1.0605,0.52],[-1.0605,0.03],[-1.0905,0.0],[-1.4795,0.0],[-1.5095,0.03],[-1.5095,0.52],[-1.5445,0.52],[-1.5445,0.03],[-1.5745,0.0],[-1.9635,0.0],[-1.9935,0.03],[-1.9935,0.52],[-2.0285,0.52],[-2.0285,0.03],[-2.0585,0.0],[-2.465,0.0],[-2.495,0.03]]; // roof tile course (west), 4 parts (first: Roof tile course W1)
const TILE_COURSE_W_2: Point2D[] = [[-2.495,0.62],[2.345,0.62],[2.345,0.03],[2.345,0.0],[2.1505,0.0],[2.1205,0.03],[2.1205,0.52],[2.0855,0.52],[2.0855,0.03],[2.0555,0.0],[1.6665,0.0],[1.6365,0.03],[1.6365,0.52],[1.6015,0.52],[1.6015,0.03],[1.5715,0.0],[1.1825,0.0],[1.1525,0.03],[1.1525,0.52],[1.1175,0.52],[1.1175,0.03],[1.0875,0.0],[0.6985,0.0],[0.6685,0.03],[0.6685,0.52],[0.6335,0.52],[0.6335,0.03],[0.6035,0.0],[0.2145,0.0],[0.1845,0.03],[0.1845,0.52],[0.1495,0.52],[0.1495,0.03],[0.1195,0.0],[-0.2695,0.0],[-0.2995,0.03],[-0.2995,0.52],[-0.3345,0.52],[-0.3345,0.03],[-0.3645,0.0],[-0.7535,0.0],[-0.7835,0.03],[-0.7835,0.52],[-0.8185,0.52],[-0.8185,0.03],[-0.8485,0.0],[-1.2375,0.0],[-1.2675,0.03],[-1.2675,0.52],[-1.3025,0.52],[-1.3025,0.03],[-1.3325,0.0],[-1.7215,0.0],[-1.7515,0.03],[-1.7515,0.52],[-1.7865,0.52],[-1.7865,0.03],[-1.8165,0.0],[-2.2055,0.0],[-2.2355,0.03],[-2.2355,0.52],[-2.2705,0.52],[-2.2705,0.03],[-2.3005,0.0],[-2.495,0.0],[-2.495,0.03]]; // roof tile course (west), 4 parts (first: Roof tile course W2)
const TIMBER_2: Point2D[] = [[-0.055,-0.135],[0.055,-0.135],[0.09,-0.1],[0.09,0.1],[0.055,0.135],[-0.055,0.135],[-0.09,0.1],[-0.09,-0.1]]; // timber member, 2 parts (first: Front tie beam (gable, eave level))
const TIMBER_3: Point2D[] = [[-0.06,-0.13],[0.06,-0.13],[0.09,-0.1],[0.09,0.1],[0.06,0.13],[-0.06,0.13],[-0.09,0.1],[-0.09,-0.1]]; // timber member, 2 parts (first: East wall plate)
const TIMBER_4: Point2D[] = [[-0.1,-0.075],[0.1,-0.075],[0.13,-0.045],[0.13,0.045],[0.1,0.075],[-0.1,0.075],[-0.13,0.045],[-0.13,-0.045]]; // timber member, 4 parts (first: Gable stud center)
const TIMBER_6: Point2D[] = [[-0.125,-0.075],[0.125,-0.075],[0.155,-0.045],[0.155,0.045],[0.125,0.075],[-0.125,0.075],[-0.155,0.045],[-0.155,-0.045]]; // timber member, 4 parts (first: Gable stud left)
const PROFILE_2: Point2D[] = [[-0.153,-0.06],[0.153,-0.06],[0.18,-0.033],[0.18,0.033],[0.153,0.06],[-0.153,0.06],[-0.18,0.033],[-0.18,-0.033]]; // shared section, 4 parts (first: Bargeboard front left)
const TIMBER_7: Point2D[] = [[-0.07,-0.07],[0.07,-0.07],[0.1,-0.04],[0.1,0.04],[0.07,0.07],[-0.07,0.07],[-0.1,0.04],[-0.1,-0.04]]; // timber member, 6 parts (first: East wall knee brace 1)
const TIMBER_11: Point2D[] = [[-0.0607,-0.065],[0.0607,-0.065],[0.09,-0.0358],[0.09,0.0358],[0.0607,0.065],[-0.0607,0.065],[-0.09,0.0358],[-0.09,-0.0358]]; // timber member, 2 parts (first: Lower gable brace a)
const TIMBER_13: Point2D[] = [[-0.04,-0.06],[0.04,-0.06],[0.06,-0.04],[0.06,0.04],[0.04,0.06],[-0.04,0.06],[-0.06,0.04],[-0.06,-0.04]]; // timber member, 2 parts (first: Awning mounting rail)
const AWNING_STRIPE_1: Point2D[] = [[0.0,-0.0],[0.1813,-0.1703],[0.3625,-0.2766],[0.5438,-0.3674],[0.725,-0.4494],[0.9063,-0.5253],[1.0875,-0.5969],[1.2688,-0.6649],[1.45,-0.73],[1.48,-0.76],[1.485,-0.82],[1.44,-0.82],[1.45,-0.775],[1.2688,-0.7099],[1.0875,-0.6419],[0.9063,-0.5703],[0.725,-0.4944],[0.5438,-0.4124],[0.3625,-0.3216],[0.1813,-0.2153],[0.0,-0.045]]; // awning canvas stripe, 7 parts (first: Awning canvas stripe 1)
const AWNING_TONGUE_1: Point2D[] = [[-0.2657,0.0],[0.2657,0.0],[0.2657,-0.26],[0.1957,-0.33],[-0.1957,-0.33],[-0.2657,-0.26]]; // awning valance tongue, 7 parts (first: Awning valance tongue 1)
const PROFILE_15: Point2D[] = [[-0.07,-0.1],[0.07,-0.1],[0.1,-0.07],[0.1,0.07],[0.07,0.1],[-0.07,0.1],[-0.1,0.07],[-0.1,-0.07]]; // shared section, 2 parts (first: Awning support post (front-left))
const PROFILE_18: Point2D[] = [[-0.06,-0.08],[0.06,-0.08],[0.08,-0.06],[0.08,0.06],[0.06,0.08],[-0.06,0.08],[-0.08,0.06],[-0.08,-0.06]]; // shared section, 6 parts (first: Counter leg front 1)
const TIMBER_15: Point2D[] = [[-0.04,-0.035],[0.04,-0.035],[0.05,-0.025],[0.05,0.025],[0.04,0.035],[-0.04,0.035],[-0.05,0.025],[-0.05,-0.025]]; // timber member, 2 parts (first: Counter diagonal brace 1)
const NET_STRAND_1: Point2D[] = [[-0.005,-0.009],[0.005,-0.009],[0.009,-0.005],[0.009,0.005],[0.005,0.009],[-0.005,0.009],[-0.009,0.005],[-0.009,-0.005]]; // fishing net strand, 5 parts (first: Fishing net strand 1)


  // ---- House shell ----
  extrude(ctx, { parent: "root", key: "house-body", name: "House body (plaster walls + gables)", mat: "plaster-lime", at: [0.0, 0.0, -2.025], rot: [-0.0, 0.0, -0.0], profile: [[-2.025,0.0],[2.025,0.0],[2.025,3.266698974996726],[0.0,5.680000000000001],[-2.025,3.266698974996726]], depth: 4.05 }); // node_house_body_0

  // ---- Roof ----
  extrude(ctx, { parent: "root", key: "roof-deck", name: "Roof deck slab (under the tile courses)", mat: "terracotta-deck", at: [0.0, 0.0, -2.475], rot: [-0.0, 0.0, -0.0], profile: [[-2.37,3.0355],[0.0,5.86],[2.37,3.0355],[2.37,2.8755],[0.0,5.7],[-2.37,2.8755]], depth: 4.8 }); // node_roof_deck_1
  extrude(ctx, { parent: "roof-deck", key: "tile-course-e1", name: "Roof tile course E1", mat: "terracotta-tile", at: [2.45576, 3.04224, 2.475], rot: [-1.570796, 0.760237, 1.570796], profile: TILE_COURSE_E_1, depth: 0.07 }); // node_tile_course_e1_2
  extrude(ctx, { parent: "roof-deck", key: "tile-course-e2", name: "Roof tile course E2", mat: "terracotta-tile", at: [2.17392, 3.40623, 2.475], rot: [-1.570796, 0.731569, 1.570796], profile: TILE_COURSE_E_2, depth: 0.07 }); // node_tile_course_e2_3
  extrude(ctx, { parent: "roof-deck", key: "tile-course-e3", name: "Roof tile course E3", mat: "terracotta-tile", at: [1.87824, 3.75861, 2.475], rot: [-1.570796, 0.731569, 1.570796], profile: TILE_COURSE_E_1, depth: 0.07 }); // node_tile_course_e3_4
  extrude(ctx, { parent: "roof-deck", key: "tile-course-e4", name: "Roof tile course E4", mat: "terracotta-tile", at: [1.58255, 4.11099, 2.475], rot: [-1.570796, 0.731569, 1.570796], profile: TILE_COURSE_E_2, depth: 0.07 }); // node_tile_course_e4_5
  extrude(ctx, { parent: "roof-deck", key: "tile-course-e5", name: "Roof tile course E5", mat: "terracotta-tile", at: [1.28687, 4.46337, 2.475], rot: [-1.570796, 0.731569, 1.570796], profile: TILE_COURSE_E_1, depth: 0.07 }); // node_tile_course_e5_6
  extrude(ctx, { parent: "roof-deck", key: "tile-course-e6", name: "Roof tile course E6", mat: "terracotta-tile", at: [0.99119, 4.81575, 2.475], rot: [-1.570796, 0.731569, 1.570796], profile: TILE_COURSE_E_2, depth: 0.07 }); // node_tile_course_e6_7
  extrude(ctx, { parent: "roof-deck", key: "tile-course-e7", name: "Roof tile course E7", mat: "terracotta-tile", at: [0.69551, 5.16813, 2.475], rot: [-1.570796, 0.731569, 1.570796], profile: TILE_COURSE_E_1, depth: 0.07 }); // node_tile_course_e7_8
  extrude(ctx, { parent: "roof-deck", key: "tile-course-e8", name: "Roof tile course E8", mat: "terracotta-tile", at: [0.39982, 5.52051, 2.475], rot: [-1.570796, 0.731569, 1.570796], profile: TILE_COURSE_E_2, depth: 0.07 }); // node_tile_course_e8_9
  extrude(ctx, { parent: "roof-deck", key: "tile-course-w1", name: "Roof tile course W1", mat: "terracotta-tile", at: [-2.45576, 3.04224, 2.475], rot: [-1.570796, -0.760237, -1.570796], profile: TILE_COURSE_W_1, depth: 0.07 }); // node_tile_course_w1_10
  extrude(ctx, { parent: "roof-deck", key: "tile-course-w2", name: "Roof tile course W2", mat: "terracotta-tile", at: [-2.17392, 3.40623, 2.475], rot: [-1.570796, -0.731569, -1.570796], profile: TILE_COURSE_W_2, depth: 0.07 }); // node_tile_course_w2_11
  extrude(ctx, { parent: "roof-deck", key: "tile-course-w3", name: "Roof tile course W3", mat: "terracotta-tile", at: [-1.87824, 3.75861, 2.475], rot: [-1.570796, -0.731569, -1.570796], profile: TILE_COURSE_W_1, depth: 0.07 }); // node_tile_course_w3_12
  extrude(ctx, { parent: "roof-deck", key: "tile-course-w4", name: "Roof tile course W4", mat: "terracotta-tile", at: [-1.58255, 4.11099, 2.475], rot: [-1.570796, -0.731569, -1.570796], profile: TILE_COURSE_W_2, depth: 0.07 }); // node_tile_course_w4_13
  extrude(ctx, { parent: "roof-deck", key: "tile-course-w5", name: "Roof tile course W5", mat: "terracotta-tile", at: [-1.28687, 4.46337, 2.475], rot: [-1.570796, -0.731569, -1.570796], profile: TILE_COURSE_W_1, depth: 0.07 }); // node_tile_course_w5_14
  extrude(ctx, { parent: "roof-deck", key: "tile-course-w6", name: "Roof tile course W6", mat: "terracotta-tile", at: [-0.99119, 4.81575, 2.475], rot: [-1.570796, -0.731569, -1.570796], profile: TILE_COURSE_W_2, depth: 0.07 }); // node_tile_course_w6_15
  extrude(ctx, { parent: "roof-deck", key: "tile-course-w7", name: "Roof tile course W7", mat: "terracotta-tile", at: [-0.69551, 5.16813, 2.475], rot: [-1.570796, -0.731569, -1.570796], profile: TILE_COURSE_W_1, depth: 0.07 }); // node_tile_course_w7_16
  extrude(ctx, { parent: "roof-deck", key: "tile-course-w8", name: "Roof tile course W8", mat: "terracotta-tile", at: [-0.39982, 5.52051, 2.475], rot: [-1.570796, -0.731569, -1.570796], profile: TILE_COURSE_W_2, depth: 0.07 }); // node_tile_course_w8_17
  extrude(ctx, { parent: "roof-deck", key: "ridge-beam", name: "Ridge beam", mat: "timber-oak", at: [0.0, 5.92, -0.02], rot: [-0.0, 0.0, -0.0], profile: [[-0.09,-0.12],[0.09,-0.12],[0.12,-0.09],[0.12,0.09],[0.09,0.12],[-0.09,0.12],[-0.12,0.09],[-0.12,-0.09]], depth: 4.86 }); // node_ridge_beam_18
  box(ctx, { parent: "root", key: "chimney-stack", name: "Chimney stack (stone core)", mat: "stone-ashlar", at: [0.68, 5.275, -1.435], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.56, 1.35, 0.63] }); // node_chimney_stack_19
  box(ctx, { parent: "chimney-stack", key: "chimney-cap", name: "Chimney cap slab", mat: "stone-dark", at: [0.0, 0.875, 0.0], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.72, 0.4, 0.79] }); // node_chimney_cap_20

  // ---- Timber frame ----
  box(ctx, { parent: "house-body", key: "corner-post-fr", name: "Corner post FR", mat: "timber-oak", at: [1.945, 1.62, 3.97], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.27, 3.24, 0.27] }); // node_corner_post_fr_21
  box(ctx, { parent: "house-body", key: "corner-post-fl", name: "Corner post FL", mat: "timber-oak", at: [-1.945, 1.62, 3.97], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.27, 3.24, 0.27] }); // node_corner_post_fl_22
  box(ctx, { parent: "house-body", key: "corner-post-br", name: "Corner post BR", mat: "timber-oak", at: [1.945, 1.62, 0.08], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.27, 3.24, 0.27] }); // node_corner_post_br_23
  box(ctx, { parent: "house-body", key: "corner-post-bl", name: "Corner post BL", mat: "timber-oak", at: [-1.945, 1.62, 0.08], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.27, 3.24, 0.27] }); // node_corner_post_bl_24
  extrude(ctx, { parent: "house-body", key: "tie-beam-front", name: "Front tie beam (gable, eave level)", mat: "timber-oak", at: [-2.03, 3.3, 4.07], rot: [0.0, 1.570796, 0.0], profile: TIMBER_2, depth: 4.06 }); // node_tie_beam_front_25
  extrude(ctx, { parent: "house-body", key: "tie-beam-back", name: "Rear tie beam", mat: "timber-oak", at: [-2.03, 3.3, -0.02], rot: [0.0, 1.570796, 0.0], profile: TIMBER_2, depth: 4.06 }); // node_tie_beam_back_26
  extrude(ctx, { parent: "house-body", key: "wall-plate-east", name: "East wall plate", mat: "timber-oak", at: [2.045, 3.17, 4.225], rot: [-3.141593, 0.0, -3.141593], profile: TIMBER_3, depth: 4.4 }); // node_wall_plate_east_27
  extrude(ctx, { parent: "house-body", key: "wall-plate-west", name: "West wall plate", mat: "timber-oak", at: [-2.045, 3.17, 4.225], rot: [-3.141593, 0.0, -3.141593], profile: TIMBER_3, depth: 4.4 }); // node_wall_plate_west_28
  extrude(ctx, { parent: "tie-beam-front", key: "gable-stud-center", name: "Gable stud center", mat: "timber-oak", at: [0.0, 1.32, 2.06], rot: [-1.570796, -0.0, 1.570796], profile: TIMBER_4, depth: 0.6842 }); // node_gable_stud_center_29
  extrude(ctx, { parent: "tie-beam-back", key: "rear-gable-stud-center", name: "Rear gable stud center", mat: "timber-oak", at: [0.0, 0.13, 2.0], rot: [-1.570796, -0.0, 1.570796], profile: TIMBER_4, depth: 1.8742 }); // node_rear_gable_stud_center_30
  extrude(ctx, { parent: "tie-beam-front", key: "gable-window-head-brace", name: "Brace above the gable window", mat: "timber-oak", at: [0.0, 1.36, 1.35], rot: [-0.0, 0.0, -0.0], profile: [[-0.05,-0.09],[0.05,-0.09],[0.08,-0.06],[0.08,0.06],[0.05,0.09],[-0.05,0.09],[-0.08,0.06],[-0.08,-0.06]], depth: 1.38 }); // node_gable_window_head_brace_31
  extrude(ctx, { parent: "tie-beam-front", key: "gable-stud-left", name: "Gable stud left", mat: "timber-oak", at: [0.0, 0.13, 1.125], rot: [-1.570796, -0.0, 1.570796], profile: TIMBER_6, depth: 0.8314 }); // node_gable_stud_left_32
  extrude(ctx, { parent: "tie-beam-back", key: "rear-gable-stud-left", name: "Rear gable stud left", mat: "timber-oak", at: [0.0, 0.13, 2.935], rot: [-1.570796, -0.0, 1.570796], profile: TIMBER_6, depth: 0.8314 }); // node_rear_gable_stud_left_33
  extrude(ctx, { parent: "tie-beam-front", key: "gable-stud-right", name: "Gable stud right", mat: "timber-oak", at: [0.0, 0.13, 3.015], rot: [-1.570796, -0.0, 1.570796], profile: TIMBER_6, depth: 0.7361 }); // node_gable_stud_right_34
  extrude(ctx, { parent: "tie-beam-back", key: "rear-gable-stud-right", name: "Rear gable stud right", mat: "timber-oak", at: [0.0, 0.13, 1.045], rot: [-1.570796, -0.0, 1.570796], profile: TIMBER_6, depth: 0.7361 }); // node_rear_gable_stud_right_35

  // ---- Roof ----
  extrude(ctx, { parent: "roof-deck", key: "bargeboard-front-left", name: "Bargeboard front left", mat: "timber-oak", at: [0.0, 5.55997, 4.73], rot: [1.570796, -0.698132, -0.0], profile: PROFILE_2, depth: 3.7337 }); // node_bargeboard_front_left_36
  extrude(ctx, { parent: "roof-deck", key: "bargeboard-front-right", name: "Bargeboard front right", mat: "timber-oak", at: [0.0, 5.55997, 4.73], rot: [1.570796, 0.698132, -0.0], profile: PROFILE_2, depth: 3.7337 }); // node_bargeboard_front_right_37
  extrude(ctx, { parent: "roof-deck", key: "bargeboard-back-left", name: "Bargeboard back left", mat: "timber-oak", at: [0.0, 5.55997, 0.07], rot: [1.570796, -0.698132, -0.0], profile: PROFILE_2, depth: 3.7337 }); // node_bargeboard_back_left_38
  extrude(ctx, { parent: "roof-deck", key: "bargeboard-back-right", name: "Bargeboard back right", mat: "timber-oak", at: [0.0, 5.55997, 0.07], rot: [1.570796, 0.698132, -0.0], profile: PROFILE_2, depth: 3.7337 }); // node_bargeboard_back_right_39
  box(ctx, { parent: "roof-deck", key: "ridge-end-block-front", name: "Front ridge-end post block", mat: "timber-oak", at: [-0.05, 5.72, 4.82], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.46, 0.74, 0.42] }); // node_ridge_end_block_front_40
  box(ctx, { parent: "ridge-end-block-front", key: "ridge-end-cap-front", name: "Front ridge beam end cap", mat: "timber-oak", at: [-0.25, -0.12, 0.18], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.34, 0.42, 0.26] }); // node_ridge_end_cap_front_41
  box(ctx, { parent: "roof-deck", key: "ridge-end-block-back", name: "Rear ridge-end post block", mat: "timber-oak", at: [-0.05, 5.72, -0.02], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.46, 0.74, 0.42] }); // node_ridge_end_block_back_42

  // ---- Timber frame ----
  box(ctx, { parent: "tie-beam-front", key: "knee-block-front-left", name: "Knee block front left", mat: "timber-oak", at: [-0.08, -0.22, -0.03], rot: [0.0, -1.570796, 0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.26, 0.36, 0.22] }); // node_knee_block_front_left_43
  box(ctx, { parent: "tie-beam-front", key: "knee-block-front-right", name: "Knee block front right", mat: "timber-oak", at: [-0.08, -0.22, 4.09], rot: [0.0, -1.570796, 0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.26, 0.36, 0.22] }); // node_knee_block_front_right_44
  extrude(ctx, { parent: "wall-plate-east", key: "east-mid-post", name: "East wall mid post", mat: "timber-oak", at: [-0.0, -1.92, 2.75], rot: [-1.570796, 0.0, 1.570796], profile: TIMBER_4, depth: 1.8 }); // node_east_mid_post_45
  extrude(ctx, { parent: "wall-plate-east", key: "east-brace-1", name: "East wall knee brace 1", mat: "timber-oak", at: [0.0, -0.73, 0.25], rot: [-0.837076, 0.0, 1.570796], profile: TIMBER_7, depth: 0.8213 }); // node_east_brace_1_46
  extrude(ctx, { parent: "wall-plate-east", key: "east-brace-2", name: "East wall knee brace 2", mat: "timber-oak", at: [0.0, -0.12, 1.98], rot: [0.737049, -0.0, 1.570796], profile: TIMBER_7, depth: 0.8778 }); // node_east_brace_2_47
  extrude(ctx, { parent: "wall-plate-east", key: "east-brace-3", name: "East wall knee brace 3", mat: "timber-oak", at: [0.0, -0.12, 3.75], rot: [0.958894, -0.0, 1.570796], profile: TIMBER_7, depth: 0.6963 }); // node_east_brace_3_48
  extrude(ctx, { parent: "wall-plate-west", key: "west-mid-post", name: "West wall mid post", mat: "timber-oak", at: [-0.0, -3.12, 2.75], rot: [-1.570796, 0.0, -1.570796], profile: TIMBER_4, depth: 3.0 }); // node_west_mid_post_49
  extrude(ctx, { parent: "wall-plate-west", key: "west-brace-1", name: "West wall knee brace 1", mat: "timber-oak", at: [0.0, -0.73, 0.25], rot: [-0.837076, 0.0, -1.570796], profile: TIMBER_7, depth: 0.8213 }); // node_west_brace_1_50
  extrude(ctx, { parent: "wall-plate-west", key: "west-brace-2", name: "West wall knee brace 2", mat: "timber-oak", at: [0.0, -0.12, 2.3], rot: [0.975012, -0.0, -1.570796], profile: TIMBER_7, depth: 0.7128 }); // node_west_brace_2_51
  extrude(ctx, { parent: "wall-plate-west", key: "west-brace-3", name: "West wall knee brace 3", mat: "timber-oak", at: [0.0, -0.12, 3.75], rot: [0.958894, -0.0, -1.570796], profile: TIMBER_7, depth: 0.6963 }); // node_west_brace_3_52
  extrude(ctx, { parent: "tie-beam-front", key: "gable-lower-post-a", name: "Lower gable post a", mat: "timber-oak", at: [0.0, -2.4, 1.04], rot: [-1.570796, -0.0, 1.570796], profile: [[-0.08,-0.075],[0.08,-0.075],[0.11,-0.045],[0.11,0.045],[0.08,0.075],[-0.08,0.075],[-0.11,0.045],[-0.11,-0.045]], depth: 2.29 }); // node_gable_lower_post_a_53
  extrude(ctx, { parent: "tie-beam-front", key: "gable-lower-post-b", name: "Lower gable post b", mat: "timber-oak", at: [0.0, -2.4, 1.62], rot: [-1.570796, -0.0, 1.570796], profile: [[-0.095,-0.075],[0.095,-0.075],[0.125,-0.045],[0.125,0.045],[0.095,0.075],[-0.095,0.075],[-0.125,0.045],[-0.125,-0.045]], depth: 2.29 }); // node_gable_lower_post_b_54
  extrude(ctx, { parent: "tie-beam-front", key: "gable-lower-post-c", name: "Lower gable post c", mat: "timber-oak", at: [0.0, -2.4, 2.65], rot: [-1.570796, -0.0, 1.570796], profile: [[-0.09,-0.075],[0.09,-0.075],[0.12,-0.045],[0.12,0.045],[0.09,0.075],[-0.09,0.075],[-0.12,0.045],[-0.12,-0.045]], depth: 2.29 }); // node_gable_lower_post_c_55
  extrude(ctx, { parent: "tie-beam-front", key: "gable-lower-brace-a", name: "Lower gable brace a", mat: "timber-oak", at: [-0.01, -0.15, 1.03], rot: [0.968509, -0.0, 1.570796], profile: TIMBER_11, depth: 0.9708 }); // node_gable_lower_brace_a_56
  extrude(ctx, { parent: "tie-beam-front", key: "gable-lower-brace-b", name: "Lower gable brace b", mat: "timber-oak", at: [-0.01, -0.15, 1.63], rot: [0.927295, -0.0, 1.570796], profile: TIMBER_11, depth: 1.0 }); // node_gable_lower_brace_b_57
  extrude(ctx, { parent: "tie-beam-front", key: "gable-counter-rail", name: "Counter-height rail across the gable", mat: "timber-oak", at: [0.0, -2.35, 0.56], rot: [-0.0, 0.0, -0.0], profile: [[-0.05,-0.1],[0.05,-0.1],[0.08,-0.07],[0.08,0.07],[0.05,0.1],[-0.05,0.1],[-0.08,0.07],[-0.08,-0.07]], depth: 3.37 }); // node_gable_counter_rail_58
  box(ctx, { parent: "tie-beam-front", key: "gable-window-sill", name: "Gable window sill", mat: "timber-oak", at: [-0.08, 0.29, 2.04], rot: [0.0, -1.570796, 0.0], size: [1, 1, 1, 4, 4, 4], scale: [1.36, 0.3, 0.24] }); // node_gable_window_sill_59
  box(ctx, { parent: "gable-window-sill", key: "gable-window-lintel", name: "Gable window lintel", mat: "timber-oak", at: [0.0, 0.865, -0.01], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [1.32, 0.3, 0.22] }); // node_gable_window_lintel_60
  box(ctx, { parent: "gable-window-sill", key: "gable-window-jamb-left", name: "Gable window left jamb", mat: "timber-oak", at: [-0.405, 0.43, -0.02], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.32, 0.58, 0.19] }); // node_gable_window_jamb_left_61
  box(ctx, { parent: "gable-window-sill", key: "gable-window-jamb-right", name: "Gable window right jamb", mat: "timber-oak", at: [0.455, 0.43, -0.02], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.28, 0.58, 0.19] }); // node_gable_window_jamb_right_62
  box(ctx, { parent: "gable-window-sill", key: "gable-window-glass", name: "Gable window glass", mat: "glass-dark", at: [0.04, 0.43, -0.08], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.6, 0.6, 0.04] }); // node_gable_window_glass_63
  slat(ctx, { parent: "gable-window-sill", key: "gable-window-lattice-1", name: "gable-window lattice slat 1", mat: "timber-oak", at: [-0.078, 0.543, -0.052], rot: [0, 0, Math.PI / 4], size: [0.022, 0.58, 0.016] }); // node_gable_window_lattice_1_64
  slat(ctx, { parent: "gable-window-sill", key: "gable-window-lattice-2", name: "gable-window lattice slat 2", mat: "timber-oak", at: [0.035, 0.43, -0.052], rot: [0, 0, Math.PI / 4], size: [0.022, 0.78, 0.016] }); // node_gable_window_lattice_2_65
  slat(ctx, { parent: "gable-window-sill", key: "gable-window-lattice-3", name: "gable-window lattice slat 3", mat: "timber-oak", at: [0.148, 0.317, -0.052], rot: [0, 0, Math.PI / 4], size: [0.022, 0.58, 0.016] }); // node_gable_window_lattice_3_66
  slat(ctx, { parent: "gable-window-sill", key: "gable-window-lattice-4", name: "gable-window lattice slat 4", mat: "timber-oak", at: [-0.078, 0.317, -0.048], rot: [0, 0, -Math.PI / 4], size: [0.022, 0.58, 0.016] }); // node_gable_window_lattice_4_67
  slat(ctx, { parent: "gable-window-sill", key: "gable-window-lattice-5", name: "gable-window lattice slat 5", mat: "timber-oak", at: [0.035, 0.43, -0.048], rot: [0, 0, -Math.PI / 4], size: [0.022, 0.78, 0.016] }); // node_gable_window_lattice_5_68
  slat(ctx, { parent: "gable-window-sill", key: "gable-window-lattice-6", name: "gable-window lattice slat 6", mat: "timber-oak", at: [0.148, 0.543, -0.048], rot: [0, 0, -Math.PI / 4], size: [0.022, 0.58, 0.016] }); // node_gable_window_lattice_6_69

  // ---- Windows ----
  box(ctx, { parent: "wall-plate-east", key: "east-window-sill", name: "East window sill", mat: "timber-oak", at: [-0.07, -1.61, 3.29], rot: [-3.141593, 0.0, -3.141593], size: [1, 1, 1, 4, 4, 4], scale: [0.22, 0.22, 0.92] }); // node_east_window_sill_70
  box(ctx, { parent: "east-window-sill", key: "east-window-head", name: "East window head", mat: "timber-oak", at: [-0.01, 0.83, 0.0], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.2, 0.2, 0.9] }); // node_east_window_head_71
  box(ctx, { parent: "east-window-sill", key: "east-window-jamb-front", name: "East window front jamb", mat: "timber-oak", at: [-0.02, 0.41, 0.35], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.18, 0.66, 0.16] }); // node_east_window_jamb_front_72
  box(ctx, { parent: "east-window-sill", key: "east-window-jamb-back", name: "East window rear jamb", mat: "timber-oak", at: [-0.02, 0.41, -0.24], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.18, 0.66, 0.34] }); // node_east_window_jamb_back_73
  box(ctx, { parent: "east-window-sill", key: "east-window-glass", name: "East window glass", mat: "glass-dark", at: [-0.08, 0.42, 0.1], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.04, 0.66, 0.46] }); // node_east_window_glass_74
  slat(ctx, { parent: "east-window-sill", key: "east-window-lattice-1", name: "east-window lattice slat 1", mat: "timber-oak", at: [-0.052, 0.512, 0.008], rot: [Math.PI / 4, 0, 0], size: [0.016, 0.48, 0.022] }); // node_east_window_lattice_1_75
  slat(ctx, { parent: "east-window-sill", key: "east-window-lattice-2", name: "east-window lattice slat 2", mat: "timber-oak", at: [-0.052, 0.42, 0.10], rot: [Math.PI / 4, 0, 0], size: [0.016, 0.64, 0.022] }); // node_east_window_lattice_2_76
  slat(ctx, { parent: "east-window-sill", key: "east-window-lattice-3", name: "east-window lattice slat 3", mat: "timber-oak", at: [-0.052, 0.328, 0.192], rot: [Math.PI / 4, 0, 0], size: [0.016, 0.48, 0.022] }); // node_east_window_lattice_3_77
  slat(ctx, { parent: "east-window-sill", key: "east-window-lattice-4", name: "east-window lattice slat 4", mat: "timber-oak", at: [-0.048, 0.328, 0.008], rot: [-Math.PI / 4, 0, 0], size: [0.016, 0.48, 0.022] }); // node_east_window_lattice_4_78
  slat(ctx, { parent: "east-window-sill", key: "east-window-lattice-5", name: "east-window lattice slat 5", mat: "timber-oak", at: [-0.048, 0.42, 0.10], rot: [-Math.PI / 4, 0, 0], size: [0.016, 0.64, 0.022] }); // node_east_window_lattice_5_79
  slat(ctx, { parent: "east-window-sill", key: "east-window-lattice-6", name: "east-window lattice slat 6", mat: "timber-oak", at: [-0.048, 0.512, 0.192], rot: [-Math.PI / 4, 0, 0], size: [0.016, 0.48, 0.022] }); // node_east_window_lattice_6_80
  box(ctx, { parent: "east-window-sill", key: "east-window-ledge", name: "Timber ledge on the plinth under the east window", mat: "timber-oak", at: [0.01, -0.2, 0.23], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.22, 0.14, 0.66] }); // node_east_window_ledge_81

  // ---- Timber frame ----
  box(ctx, { parent: "corner-post-fl", key: "gable-pillar-stone-1", name: "Gable pillar stone 1", mat: "stone-ashlar", at: [0.165, -1.39, 0.15], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.6, 0.44, 0.24] }); // node_gable_pillar_stone_1_82
  box(ctx, { parent: "corner-post-fl", key: "gable-pillar-stone-2", name: "Gable pillar stone 2", mat: "stone-ashlar", at: [0.215, -0.92, 0.15], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.6, 0.42, 0.24] }); // node_gable_pillar_stone_2_83
  box(ctx, { parent: "corner-post-fl", key: "gable-pillar-stone-3", name: "Gable pillar stone 3", mat: "stone-ashlar", at: [0.165, -0.47, 0.15], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.6, 0.4, 0.24] }); // node_gable_pillar_stone_3_84
  box(ctx, { parent: "corner-post-fl", key: "gable-pillar-stone-4", name: "Gable pillar stone 4", mat: "stone-ashlar", at: [0.215, -0.025, 0.15], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.6, 0.41, 0.24] }); // node_gable_pillar_stone_4_85
  box(ctx, { parent: "corner-post-fl", key: "gable-pillar-cap", name: "Timber cap on the gable pillar", mat: "timber-oak", at: [0.185, 0.31, 0.17], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.62, 0.22, 0.26] }); // node_gable_pillar_cap_86

  // ---- Masonry and steps ----
  box(ctx, { parent: "corner-post-fr", key: "plinth-front-1-1", name: "East plinth stone front c1 s1", mat: "stone-ashlar", at: [0.14, -1.41, -0.495], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.22, 0.4, 0.32] }); // node_plinth_front_1_1_87
  box(ctx, { parent: "corner-post-fr", key: "plinth-front-1-2", name: "East plinth stone front c1 s2", mat: "stone-ashlar", at: [0.14, -1.41, -0.175], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.22, 0.4, 0.24] }); // node_plinth_front_1_2_88
  box(ctx, { parent: "corner-post-br", key: "plinth-rear-1-1", name: "East plinth stone rear c1 s1", mat: "stone-ashlar", at: [0.14, -1.41, 1.725], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.22, 0.4, 0.38] }); // node_plinth_rear_1_1_89
  box(ctx, { parent: "corner-post-br", key: "plinth-rear-1-2", name: "East plinth stone rear c1 s2", mat: "stone-ashlar", at: [0.14, -1.41, 1.295], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.22, 0.4, 0.4] }); // node_plinth_rear_1_2_90
  box(ctx, { parent: "corner-post-br", key: "plinth-rear-1-3", name: "East plinth stone rear c1 s3", mat: "stone-ashlar", at: [0.14, -1.41, 0.855], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.22, 0.4, 0.4] }); // node_plinth_rear_1_3_91
  box(ctx, { parent: "corner-post-br", key: "plinth-rear-1-4", name: "East plinth stone rear c1 s4", mat: "stone-ashlar", at: [0.14, -1.41, 0.425], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.22, 0.4, 0.38] }); // node_plinth_rear_1_4_92
  box(ctx, { parent: "corner-post-br", key: "plinth-rear-1-5", name: "East plinth stone rear c1 s5", mat: "stone-ashlar", at: [0.14, -1.41, 0.025], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.22, 0.4, 0.34] }); // node_plinth_rear_1_5_93
  box(ctx, { parent: "corner-post-fr", key: "plinth-front-2-1", name: "East plinth stone front c2 s1", mat: "stone-ashlar", at: [0.14, -0.97, -0.555], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.22, 0.4, 0.2] }); // node_plinth_front_2_1_94
  box(ctx, { parent: "corner-post-fr", key: "plinth-front-2-2", name: "East plinth stone front c2 s2", mat: "stone-ashlar", at: [0.14, -0.97, -0.235], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.22, 0.4, 0.36] }); // node_plinth_front_2_2_95
  box(ctx, { parent: "corner-post-br", key: "plinth-rear-2-1", name: "East plinth stone rear c2 s1", mat: "stone-ashlar", at: [0.14, -0.97, 1.825], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.22, 0.4, 0.18] }); // node_plinth_rear_2_1_96
  box(ctx, { parent: "corner-post-br", key: "plinth-rear-2-2", name: "East plinth stone rear c2 s2", mat: "stone-ashlar", at: [0.14, -0.97, 1.505], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.22, 0.4, 0.38] }); // node_plinth_rear_2_2_97
  box(ctx, { parent: "corner-post-br", key: "plinth-rear-2-3", name: "East plinth stone rear c2 s3", mat: "stone-ashlar", at: [0.14, -0.97, 1.075], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.22, 0.4, 0.4] }); // node_plinth_rear_2_3_98
  box(ctx, { parent: "corner-post-br", key: "plinth-rear-2-4", name: "East plinth stone rear c2 s4", mat: "stone-ashlar", at: [0.14, -0.97, 0.635], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.22, 0.4, 0.4] }); // node_plinth_rear_2_4_99
  box(ctx, { parent: "corner-post-br", key: "plinth-rear-2-5", name: "East plinth stone rear c2 s5", mat: "stone-ashlar", at: [0.14, -0.97, 0.205], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.22, 0.4, 0.38] }); // node_plinth_rear_2_5_100
  box(ctx, { parent: "corner-post-br", key: "plinth-rear-2-6", name: "East plinth stone rear c2 s6", mat: "stone-ashlar", at: [0.14, -0.97, -0.085], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.22, 0.4, 0.12] }); // node_plinth_rear_2_6_101
  box(ctx, { parent: "corner-post-fr", key: "plinth-front-3-1", name: "East plinth stone front c3 s1", mat: "stone-ashlar", at: [0.14, -0.54, -0.495], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.22, 0.38, 0.32] }); // node_plinth_front_3_1_102
  box(ctx, { parent: "corner-post-fr", key: "plinth-front-3-2", name: "East plinth stone front c3 s2", mat: "stone-ashlar", at: [0.14, -0.54, -0.175], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.22, 0.38, 0.24] }); // node_plinth_front_3_2_103
  box(ctx, { parent: "corner-post-br", key: "plinth-rear-3-1", name: "East plinth stone rear c3 s1", mat: "stone-ashlar", at: [0.14, -0.54, 1.725], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.22, 0.38, 0.38] }); // node_plinth_rear_3_1_104
  box(ctx, { parent: "corner-post-br", key: "plinth-rear-3-2", name: "East plinth stone rear c3 s2", mat: "stone-ashlar", at: [0.14, -0.54, 1.295], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.22, 0.38, 0.4] }); // node_plinth_rear_3_2_105
  box(ctx, { parent: "corner-post-br", key: "plinth-rear-3-3", name: "East plinth stone rear c3 s3", mat: "stone-ashlar", at: [0.14, -0.54, 0.855], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.22, 0.38, 0.4] }); // node_plinth_rear_3_3_106
  box(ctx, { parent: "corner-post-br", key: "plinth-rear-3-4", name: "East plinth stone rear c3 s4", mat: "stone-ashlar", at: [0.14, -0.54, 0.425], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.22, 0.38, 0.38] }); // node_plinth_rear_3_4_107
  box(ctx, { parent: "corner-post-br", key: "plinth-rear-3-5", name: "East plinth stone rear c3 s5", mat: "stone-ashlar", at: [0.14, -0.54, 0.025], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.22, 0.38, 0.34] }); // node_plinth_rear_3_5_108

  // ---- Door ----
  extrude(ctx, { parent: "corner-post-fr", key: "door-plank-1", name: "Door plank 1", mat: "timber-door", at: [0.06, -1.62, -1.945], rot: [0.0, 1.570796, 0.0], profile: [[-0.246,0.4],[-0.454,0.4],[-0.454,2.2875],[-0.4193,2.2645],[-0.3847,2.2362],[-0.35,2.201],[-0.3153,2.1562],[-0.2807,2.0948],[-0.246,1.9824]], depth: 0.09 }); // node_door_plank_1_109
  socketOn(ctx, "door-plank-1", "door-hinge-axis");
  extrude(ctx, { parent: "door-plank-1", key: "door-plank-2", name: "Door plank 2", mat: "timber-door", at: [0.0, 0.0, 0.0], rot: [-0.0, 0.0, -0.0], profile: [[-0.466,0.4],[-0.674,0.4],[-0.674,2.35],[-0.6393,2.3481],[-0.6047,2.3435],[-0.57,2.336],[-0.5353,2.3255],[-0.5007,2.3118],[-0.466,2.2945]], depth: 0.09 }); // node_door_plank_2_110
  extrude(ctx, { parent: "door-plank-1", key: "door-plank-3", name: "Door plank 3", mat: "timber-door", at: [0.0, 0.0, 0.0], rot: [-0.0, 0.0, -0.0], profile: [[-0.686,0.4],[-0.894,0.4],[-0.894,2.2945],[-0.8593,2.3118],[-0.8247,2.3255],[-0.79,2.336],[-0.7553,2.3435],[-0.7207,2.3481],[-0.686,2.35]], depth: 0.09 }); // node_door_plank_3_111
  extrude(ctx, { parent: "door-plank-1", key: "door-plank-4", name: "Door plank 4", mat: "timber-door", at: [0.0, 0.0, 0.0], rot: [-0.0, 0.0, -0.0], profile: [[-0.906,0.4],[-1.114,0.4],[-1.114,1.9824],[-1.0793,2.0948],[-1.0447,2.1562],[-1.01,2.201],[-0.9753,2.2362],[-0.9407,2.2645],[-0.906,2.2875]], depth: 0.09 }); // node_door_plank_4_112
  box(ctx, { parent: "door-plank-1", key: "door-hinge-1", name: "Door strap hinge 1", mat: "iron-wrought", at: [-0.71, 2.02, 0.105], rot: [0.0, -1.570796, 0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.03, 0.1, 0.82] }); // node_door_hinge_1_113
  ball(ctx, { parent: "door-hinge-1", key: "door-hinge-1-nail-1", name: "Hinge nail head 1.1", mat: "iron-wrought", at: [0.015, 0.0, -0.28], rot: [-0.0, 0.0, -0.0], size: [0.5, 32, 20], scale: [0.04, 0.04, 0.04] }); // node_door_hinge_1_nail_1_114
  ball(ctx, { parent: "door-hinge-1", key: "door-hinge-1-nail-2", name: "Hinge nail head 1.2", mat: "iron-wrought", at: [0.015, 0.0, 0.0], rot: [-0.0, 0.0, -0.0], size: [0.5, 32, 20], scale: [0.04, 0.04, 0.04] }); // node_door_hinge_1_nail_2_115
  ball(ctx, { parent: "door-hinge-1", key: "door-hinge-1-nail-3", name: "Hinge nail head 1.3", mat: "iron-wrought", at: [0.015, 0.0, 0.28], rot: [-0.0, 0.0, -0.0], size: [0.5, 32, 20], scale: [0.04, 0.04, 0.04] }); // node_door_hinge_1_nail_3_116
  box(ctx, { parent: "door-plank-1", key: "door-hinge-2", name: "Door strap hinge 2", mat: "iron-wrought", at: [-0.71, 0.93, 0.105], rot: [0.0, -1.570796, 0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.03, 0.1, 0.82] }); // node_door_hinge_2_117
  ball(ctx, { parent: "door-hinge-2", key: "door-hinge-2-nail-1", name: "Hinge nail head 2.1", mat: "iron-wrought", at: [0.015, 0.0, -0.28], rot: [-0.0, 0.0, -0.0], size: [0.5, 32, 20], scale: [0.04, 0.04, 0.04] }); // node_door_hinge_2_nail_1_118
  ball(ctx, { parent: "door-hinge-2", key: "door-hinge-2-nail-2", name: "Hinge nail head 2.2", mat: "iron-wrought", at: [0.015, 0.0, 0.0], rot: [-0.0, 0.0, -0.0], size: [0.5, 32, 20], scale: [0.04, 0.04, 0.04] }); // node_door_hinge_2_nail_2_119
  ball(ctx, { parent: "door-hinge-2", key: "door-hinge-2-nail-3", name: "Hinge nail head 2.3", mat: "iron-wrought", at: [0.015, 0.0, 0.28], rot: [-0.0, 0.0, -0.0], size: [0.5, 32, 20], scale: [0.04, 0.04, 0.04] }); // node_door_hinge_2_nail_3_120
  hoop(ctx, { parent: "door-plank-1", key: "door-ring", name: "Door ring knocker", mat: "iron-wrought", at: [-0.36, 1.2, 0.12], rot: [-0.0, 0.0, -0.0], size: [0.45, 0.135, 12, 48], scale: [0.2, 0.2, 0.2] }); // node_door_ring_121
  box(ctx, { parent: "door-ring", key: "door-ring-plate", name: "Door ring back plate", mat: "iron-wrought", at: [0.0, 0.1, -0.02], rot: [0.0, -1.570796, 0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.02, 0.1, 0.07] }); // node_door_ring_plate_122
  box(ctx, { parent: "corner-post-fr", key: "door-jamb-front-1", name: "Door jamb stone front 1", mat: "stone-ashlar", at: [0.18, -1.06, -0.665], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.2, 0.38, 0.28] }); // node_door_jamb_front_1_123
  box(ctx, { parent: "corner-post-fr", key: "door-jamb-front-2", name: "Door jamb stone front 2", mat: "stone-ashlar", at: [0.18, -0.63, -0.6902], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.2, 0.4, 0.2296] }); // node_door_jamb_front_2_124
  box(ctx, { parent: "corner-post-fr", key: "door-jamb-front-3", name: "Door jamb stone front 3", mat: "stone-ashlar", at: [0.18, -0.22, -0.665], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.2, 0.34, 0.28] }); // node_door_jamb_front_3_125
  box(ctx, { parent: "corner-post-fr", key: "door-jamb-front-4", name: "Door jamb stone front 4", mat: "stone-ashlar", at: [0.18, 0.15, -0.6902], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.2, 0.32, 0.2296] }); // node_door_jamb_front_4_126
  box(ctx, { parent: "corner-post-fr", key: "door-jamb-rear-1", name: "Door jamb stone rear 1", mat: "stone-ashlar", at: [0.18, -1.06, -1.865], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.2, 0.38, 0.28] }); // node_door_jamb_rear_1_127
  box(ctx, { parent: "corner-post-fr", key: "door-jamb-rear-2", name: "Door jamb stone rear 2", mat: "stone-ashlar", at: [0.18, -0.63, -1.8398], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.2, 0.4, 0.2296] }); // node_door_jamb_rear_2_128
  box(ctx, { parent: "corner-post-fr", key: "door-jamb-rear-3", name: "Door jamb stone rear 3", mat: "stone-ashlar", at: [0.18, -0.22, -1.865], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.2, 0.34, 0.28] }); // node_door_jamb_rear_3_129
  box(ctx, { parent: "corner-post-fr", key: "door-jamb-rear-4", name: "Door jamb stone rear 4", mat: "stone-ashlar", at: [0.18, 0.15, -1.8398], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.2, 0.32, 0.2296] }); // node_door_jamb_rear_4_130

  // ---- Masonry and steps ----
  extrude(ctx, { parent: "corner-post-fr", key: "door-voussoir-1", name: "Door arch voussoir 1", mat: "stone-ashlar", at: [0.08, -1.62, -1.945], rot: [0.0, 1.570796, 0.0], profile: [[-1.4599,1.9194],[-1.4508,2.0293],[-1.4263,2.1369],[-1.3868,2.24],[-1.0968,2.1046],[-1.1201,2.0438],[-1.1346,1.9804],[-1.14,1.9155]], depth: 0.2 }); // node_door_voussoir_1_131
  extrude(ctx, { parent: "corner-post-fr", key: "door-voussoir-2", name: "Door arch voussoir 2", mat: "stone-ashlar", at: [0.08, -1.62, -1.945], rot: [0.0, 1.570796, 0.0], profile: [[-1.3786,2.2568],[-1.3227,2.352],[-1.2539,2.4382],[-1.1736,2.5139],[-0.9711,2.2662],[-1.0185,2.2215],[-1.059,2.1706],[-1.092,2.1145]], depth: 0.2 }); // node_door_voussoir_2_132
  extrude(ctx, { parent: "corner-post-fr", key: "door-voussoir-3", name: "Door arch voussoir 3", mat: "stone-ashlar", at: [0.08, -1.62, -1.945], rot: [0.0, 1.570796, 0.0], profile: [[-1.159,2.5256],[-1.0673,2.5871],[-0.9679,2.6349],[-0.8627,2.6683],[-0.7877,2.3572],[-0.8498,2.3375],[-0.9084,2.3093],[-0.9625,2.2731]], depth: 0.2 }); // node_door_voussoir_3_133
  extrude(ctx, { parent: "corner-post-fr", key: "door-voussoir-4", name: "Door arch voussoir 4", mat: "stone-ashlar", at: [0.08, -1.62, -1.945], rot: [0.0, 1.570796, 0.0], profile: [[-0.8444,2.6725],[-0.7352,2.688],[-0.6248,2.688],[-0.5156,2.6725],[-0.583,2.3597],[-0.6475,2.3688],[-0.7125,2.3688],[-0.777,2.3597]], depth: 0.2 }); // node_door_voussoir_4_134
  extrude(ctx, { parent: "corner-post-fr", key: "door-voussoir-5", name: "Door arch voussoir 5", mat: "stone-ashlar", at: [0.08, -1.62, -1.945], rot: [0.0, 1.570796, 0.0], profile: [[-0.4973,2.6683],[-0.3921,2.6349],[-0.2927,2.5871],[-0.201,2.5256],[-0.3975,2.2731],[-0.4516,2.3093],[-0.5102,2.3375],[-0.5723,2.3572]], depth: 0.2 }); // node_door_voussoir_5_135
  extrude(ctx, { parent: "corner-post-fr", key: "door-voussoir-6", name: "Door arch voussoir 6", mat: "stone-ashlar", at: [0.08, -1.62, -1.945], rot: [0.0, 1.570796, 0.0], profile: [[-0.1864,2.5139],[-0.1061,2.4382],[-0.0373,2.352],[0.0186,2.2568],[-0.268,2.1145],[-0.301,2.1706],[-0.3415,2.2215],[-0.3889,2.2662]], depth: 0.2 }); // node_door_voussoir_6_136
  extrude(ctx, { parent: "corner-post-fr", key: "door-voussoir-7", name: "Door arch voussoir 7", mat: "stone-ashlar", at: [0.08, -1.62, -1.945], rot: [0.0, 1.570796, 0.0], profile: [[0.0268,2.24],[0.0663,2.1369],[0.0908,2.0293],[0.0999,1.9194],[-0.22,1.9155],[-0.2254,1.9804],[-0.2399,2.0438],[-0.2632,2.1046]], depth: 0.2 }); // node_door_voussoir_7_137
  box(ctx, { parent: "root", key: "entrance-steps", name: "Entrance steps (core)", mat: "stone-ashlar", at: [2.3, 0.18, 0.56], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.52, 0.34, 1.7] }); // node_entrance_steps_138
  box(ctx, { parent: "entrance-steps", key: "step-lower-1", name: "Lower step block 1", mat: "stone-ashlar", at: [0.03, -0.08, 0.645], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.6, 0.2, 0.55] }); // node_step_lower_1_139
  box(ctx, { parent: "entrance-steps", key: "step-lower-2", name: "Lower step block 2", mat: "stone-ashlar", at: [0.03, -0.08, 0.04], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.6, 0.2, 0.58] }); // node_step_lower_2_140
  box(ctx, { parent: "entrance-steps", key: "step-lower-3", name: "Lower step block 3", mat: "stone-ashlar", at: [0.03, -0.08, -0.59], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.6, 0.2, 0.6] }); // node_step_lower_3_141
  box(ctx, { parent: "entrance-steps", key: "step-upper-1", name: "Upper step block 1", mat: "stone-ashlar", at: [-0.1, 0.12, 0.515], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.34, 0.2, 0.53] }); // node_step_upper_1_142
  box(ctx, { parent: "entrance-steps", key: "step-upper-2", name: "Upper step block 2", mat: "stone-ashlar", at: [-0.1, 0.12, -0.06], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.34, 0.2, 0.54] }); // node_step_upper_2_143
  box(ctx, { parent: "entrance-steps", key: "step-upper-3", name: "Upper step block 3", mat: "stone-ashlar", at: [-0.1, 0.12, -0.56], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.34, 0.2, 0.38] }); // node_step_upper_3_144

  // ---- Awning ----
  extrude(ctx, { parent: "tie-beam-front", key: "awning-rail", name: "Awning mounting rail", mat: "timber-oak", at: [-0.05, -0.16, 0.0], rot: [-0.0, 0.0, -0.0], profile: TIMBER_13, depth: 4.03 }); // node_awning_rail_145
  extrude(ctx, { parent: "awning-rail", key: "awning-stripe-1", name: "Awning canvas stripe 1", mat: "canvas-cream", at: [-0.03, 0.02, 0.60743], rot: [-3.141593, -0.0, -3.141593], profile: AWNING_STRIPE_1, depth: 0.5534 }); // node_awning_stripe_1_146
  extrude(ctx, { parent: "awning-stripe-1", key: "awning-tongue-1", name: "Awning valance tongue 1", mat: "canvas-cream", at: [1.46, -0.75, 0.27671], rot: [0.0, 1.570796, 0.0], profile: AWNING_TONGUE_1, depth: 0.045 }); // node_awning_tongue_1_147
  extrude(ctx, { parent: "awning-rail", key: "awning-stripe-2", name: "Awning canvas stripe 2", mat: "canvas-teal", at: [-0.03, 0.02, 1.16886], rot: [-3.141593, -0.0, -3.141593], profile: AWNING_STRIPE_1, depth: 0.5534 }); // node_awning_stripe_2_148
  extrude(ctx, { parent: "awning-stripe-2", key: "awning-tongue-2", name: "Awning valance tongue 2", mat: "canvas-teal", at: [1.46, -0.75, 0.27671], rot: [0.0, 1.570796, 0.0], profile: AWNING_TONGUE_1, depth: 0.045 }); // node_awning_tongue_2_149
  extrude(ctx, { parent: "awning-rail", key: "awning-stripe-3", name: "Awning canvas stripe 3", mat: "canvas-cream", at: [-0.03, 0.02, 1.73029], rot: [-3.141593, -0.0, -3.141593], profile: AWNING_STRIPE_1, depth: 0.5534 }); // node_awning_stripe_3_150
  extrude(ctx, { parent: "awning-stripe-3", key: "awning-tongue-3", name: "Awning valance tongue 3", mat: "canvas-cream", at: [1.46, -0.75, 0.27671], rot: [0.0, 1.570796, 0.0], profile: AWNING_TONGUE_1, depth: 0.045 }); // node_awning_tongue_3_151
  extrude(ctx, { parent: "awning-rail", key: "awning-stripe-4", name: "Awning canvas stripe 4", mat: "canvas-teal", at: [-0.03, 0.02, 2.29171], rot: [-3.141593, -0.0, -3.141593], profile: AWNING_STRIPE_1, depth: 0.5534 }); // node_awning_stripe_4_152
  extrude(ctx, { parent: "awning-stripe-4", key: "awning-tongue-4", name: "Awning valance tongue 4", mat: "canvas-teal", at: [1.46, -0.75, 0.27671], rot: [0.0, 1.570796, 0.0], profile: AWNING_TONGUE_1, depth: 0.045 }); // node_awning_tongue_4_153
  extrude(ctx, { parent: "awning-rail", key: "awning-stripe-5", name: "Awning canvas stripe 5", mat: "canvas-cream", at: [-0.03, 0.02, 2.85314], rot: [-3.141593, -0.0, -3.141593], profile: AWNING_STRIPE_1, depth: 0.5534 }); // node_awning_stripe_5_154
  extrude(ctx, { parent: "awning-stripe-5", key: "awning-tongue-5", name: "Awning valance tongue 5", mat: "canvas-cream", at: [1.46, -0.75, 0.27671], rot: [0.0, 1.570796, 0.0], profile: AWNING_TONGUE_1, depth: 0.045 }); // node_awning_tongue_5_155
  extrude(ctx, { parent: "awning-rail", key: "awning-stripe-6", name: "Awning canvas stripe 6", mat: "canvas-teal", at: [-0.03, 0.02, 3.41457], rot: [-3.141593, -0.0, -3.141593], profile: AWNING_STRIPE_1, depth: 0.5534 }); // node_awning_stripe_6_156
  extrude(ctx, { parent: "awning-stripe-6", key: "awning-tongue-6", name: "Awning valance tongue 6", mat: "canvas-teal", at: [1.46, -0.75, 0.27671], rot: [0.0, 1.570796, 0.0], profile: AWNING_TONGUE_1, depth: 0.045 }); // node_awning_tongue_6_157
  extrude(ctx, { parent: "awning-rail", key: "awning-stripe-7", name: "Awning canvas stripe 7", mat: "canvas-cream", at: [-0.03, 0.02, 3.976], rot: [-3.141593, -0.0, -3.141593], profile: AWNING_STRIPE_1, depth: 0.5534 }); // node_awning_stripe_7_158
  extrude(ctx, { parent: "awning-stripe-7", key: "awning-tongue-7", name: "Awning valance tongue 7", mat: "canvas-cream", at: [1.46, -0.75, 0.27671], rot: [0.0, 1.570796, 0.0], profile: AWNING_TONGUE_1, depth: 0.045 }); // node_awning_tongue_7_159
  extrude(ctx, { parent: "awning-rail", key: "awning-front-batten", name: "Awning front batten", mat: "timber-oak", at: [-1.42, -0.77, -0.01], rot: [-0.0, 0.0, -0.0], profile: [[-0.02,-0.045],[0.02,-0.045],[0.035,-0.03],[0.035,0.03],[0.02,0.045],[-0.02,0.045],[-0.035,0.03],[-0.035,-0.03]], depth: 4.01 }); // node_awning_front_batten_160
  extrude(ctx, { parent: "awning-rail", key: "awning-post", name: "Awning support post (front-left)", mat: "timber-oak", at: [-0.025, -3.14, -0.22], rot: [-1.570796, -0.0, 1.570796], profile: PROFILE_15, depth: 2.35 }); // node_awning_post_161
  extrude(ctx, { parent: "awning-post", key: "awning-strut", name: "Awning diagonal strut", mat: "timber-oak", at: [0.0, 0.08, 1.72], rot: [-1.128598, -0.168094, -3.062545], profile: [[-0.05,-0.07],[0.05,-0.07],[0.07,-0.05],[0.07,0.05],[0.05,0.07],[-0.05,0.07],[-0.07,0.05],[-0.07,-0.05]], depth: 1.3747 }); // node_awning_strut_162
  extrude(ctx, { parent: "corner-post-fr", key: "awning-bracket-arm", name: "Awning bracket arm (right)", mat: "timber-oak", at: [-0.045, 0.68, 0.13], rot: [-0.0, 0.0, -0.0], profile: PROFILE_15, depth: 1.55 }); // node_awning_bracket_arm_163
  extrude(ctx, { parent: "awning-bracket-arm", key: "awning-bracket-strut", name: "Awning bracket strut (right)", mat: "timber-oak", at: [0.0, -0.75, 0.07], rot: [-0.742567, 0.0, -0.0], profile: [[-0.055,-0.08],[0.055,-0.08],[0.08,-0.055],[0.08,0.055],[0.055,0.08],[-0.055,0.08],[-0.08,0.055],[-0.08,-0.055]], depth: 0.9909 }); // node_awning_bracket_strut_164

  // ---- Sales counter ----
  box(ctx, { parent: "root", key: "sales-counter", name: "Sales counter top board", mat: "timber-oak", at: [0.82, 0.73, 2.77], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [3.28, 0.1, 0.94] }); // node_sales_counter_165
  extrude(ctx, { parent: "sales-counter", key: "counter-front-rail", name: "Counter front rail", mat: "timber-oak", at: [-1.66, -0.12, 0.49], rot: [0.0, 1.570796, 0.0], profile: [[-0.03,-0.08],[0.03,-0.08],[0.05,-0.06],[0.05,0.06],[0.03,0.08],[-0.03,0.08],[-0.05,0.06],[-0.05,-0.06]], depth: 3.32 }); // node_counter_front_rail_166
  extrude(ctx, { parent: "sales-counter", key: "counter-leg-front-1", name: "Counter leg front 1", mat: "timber-oak", at: [-1.32, -0.73, 0.43], rot: [-1.570796, 0.0, -3.141593], profile: PROFILE_18, depth: 0.68 }); // node_counter_leg_front_1_167
  extrude(ctx, { parent: "sales-counter", key: "counter-leg-back-1", name: "Counter leg back 1", mat: "timber-oak", at: [-1.32, -0.73, -0.41], rot: [-1.570796, 0.0, -3.141593], profile: PROFILE_18, depth: 0.68 }); // node_counter_leg_back_1_168
  extrude(ctx, { parent: "sales-counter", key: "counter-leg-front-2", name: "Counter leg front 2", mat: "timber-oak", at: [-0.0, -0.73, 0.43], rot: [-1.570796, 0.0, -3.141593], profile: PROFILE_18, depth: 0.68 }); // node_counter_leg_front_2_169
  extrude(ctx, { parent: "sales-counter", key: "counter-leg-back-2", name: "Counter leg back 2", mat: "timber-oak", at: [-0.0, -0.73, -0.41], rot: [-1.570796, 0.0, -3.141593], profile: PROFILE_18, depth: 0.68 }); // node_counter_leg_back_2_170
  extrude(ctx, { parent: "sales-counter", key: "counter-leg-front-3", name: "Counter leg front 3", mat: "timber-oak", at: [1.23, -0.73, 0.43], rot: [-1.570796, 0.0, -3.141593], profile: PROFILE_18, depth: 0.68 }); // node_counter_leg_front_3_171
  extrude(ctx, { parent: "sales-counter", key: "counter-leg-back-3", name: "Counter leg back 3", mat: "timber-oak", at: [1.23, -0.73, -0.41], rot: [-1.570796, 0.0, -3.141593], profile: PROFILE_18, depth: 0.68 }); // node_counter_leg_back_3_172
  extrude(ctx, { parent: "sales-counter", key: "counter-stretcher-front", name: "Counter lower stretcher", mat: "timber-oak", at: [-1.64, -0.43, 0.42], rot: [0.0, 1.570796, 0.0], profile: [[-0.025,-0.06],[0.025,-0.06],[0.04,-0.045],[0.04,0.045],[0.025,0.06],[-0.025,0.06],[-0.04,0.045],[-0.04,-0.045]], depth: 3.28 }); // node_counter_stretcher_front_173

  // ---- Timber frame ----
  extrude(ctx, { parent: "sales-counter", key: "counter-brace-1", name: "Counter diagonal brace 1", mat: "timber-oak", at: [-1.27, -0.37, 0.44], rot: [-1.570796, 1.384932, 1.570796], profile: TIMBER_15, depth: 1.1905 }); // node_counter_brace_1_174
  extrude(ctx, { parent: "sales-counter", key: "counter-brace-2", name: "Counter diagonal brace 2", mat: "timber-oak", at: [0.08, -0.37, 0.44], rot: [-1.570796, 1.369842, 1.570796], profile: TIMBER_15, depth: 1.1022 }); // node_counter_brace_2_175

  // ---- Fish crates and ice ----
  box(ctx, { parent: "sales-counter", key: "fish-crate-1", name: "Fish crate 1 (tray base)", mat: "timber-plank", at: [-1.09333, 0.30565, 0.05], rot: [0.610865, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [1.013, 0.05, 0.82] }); // node_fish_crate_1_176
  box(ctx, { parent: "fish-crate-1", key: "fish-crate-1-front", name: "Fish crate 1 front board", mat: "timber-plank", at: [0.0, 0.11, 0.385], rot: [0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [1.013, 0.27, 0.05] }); // node_fish_crate_1_front_177
  box(ctx, { parent: "fish-crate-1", key: "fish-crate-1-back", name: "Fish crate 1 back board", mat: "timber-plank", at: [0.0, 0.11, -0.385], rot: [0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [1.013, 0.27, 0.05] }); // node_fish_crate_1_back_178
  box(ctx, { parent: "fish-crate-1", key: "fish-crate-1-left", name: "Fish crate 1 left board", mat: "timber-plank", at: [-0.48167, 0.11, 0.0], rot: [0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.05, 0.27, 0.82] }); // node_fish_crate_1_left_179
  box(ctx, { parent: "fish-crate-1", key: "fish-crate-1-right", name: "Fish crate 1 right board", mat: "timber-plank", at: [0.48167, 0.11, 0.0], rot: [0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.05, 0.27, 0.82] }); // node_fish_crate_1_right_180
  box(ctx, { parent: "fish-crate-1", key: "fish-crate-1-ice", name: "Crushed ice bed 1", mat: "ice-crushed", at: [0.0, 0.1, 0.0], rot: [0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.913, 0.1, 0.72] }); // node_fish_crate_1_ice_181
  ball(ctx, { parent: "fish-crate-1", key: "fish-crate-1-ice-chunk-1", name: "Ice chunk 1.1", mat: "ice-crushed", at: [-0.304, 0.155, -0.1722], rot: [-0.610865, 0.0, -0.0], size: [0.5, 32, 20], scale: [0.16, 0.1, 0.13] }); // node_fish_crate_1_ice_chunk_1_182
  ball(ctx, { parent: "fish-crate-1", key: "fish-crate-1-ice-chunk-2", name: "Ice chunk 1.2", mat: "ice-crushed", at: [0.0, 0.155, -0.1722], rot: [-0.610865, 0.6, -0.0], size: [0.5, 32, 20], scale: [0.19, 0.1, 0.13] }); // node_fish_crate_1_ice_chunk_2_183
  ball(ctx, { parent: "fish-crate-1", key: "fish-crate-1-ice-chunk-3", name: "Ice chunk 1.3", mat: "ice-crushed", at: [0.304, 0.155, -0.1722], rot: [-0.610865, 1.2, -0.0], size: [0.5, 32, 20], scale: [0.16, 0.1, 0.13] }); // node_fish_crate_1_ice_chunk_3_184
  ball(ctx, { parent: "fish-crate-1", key: "fish-crate-1-ice-chunk-4", name: "Ice chunk 1.4", mat: "ice-crushed", at: [-0.304, 0.155, 0.1722], rot: [2.530727, 1.341593, -3.141593], size: [0.5, 32, 20], scale: [0.19, 0.1, 0.13] }); // node_fish_crate_1_ice_chunk_4_185
  ball(ctx, { parent: "fish-crate-1", key: "fish-crate-1-ice-chunk-5", name: "Ice chunk 1.5", mat: "ice-crushed", at: [0.0, 0.155, 0.1722], rot: [2.530727, 0.741593, -3.141593], size: [0.5, 32, 20], scale: [0.16, 0.1, 0.13] }); // node_fish_crate_1_ice_chunk_5_186
  ball(ctx, { parent: "fish-crate-1", key: "fish-crate-1-ice-chunk-6", name: "Ice chunk 1.6", mat: "ice-crushed", at: [0.304, 0.155, 0.1722], rot: [2.530727, 0.141593, -3.141593], size: [0.5, 32, 20], scale: [0.19, 0.1, 0.13] }); // node_fish_crate_1_ice_chunk_6_187

  // ---- Fish ----
  fishBody(ctx, { parent: "fish-crate-1", key: "fish-1-1", name: "Fish 1.1 body", mat: "fish-blue", at: [-0.28148, 0.2095, 0.0], rot: [0.0, -0.610865, 0.0], species: "mackerel", size: [0.62, 0.17, 0.136] }); // node_fish_1_1_188
  fishTail(ctx, { parent: "fish-1-1", key: "fish-1-1-tail", name: "Fish 1.1 tail fin", mat: "fish-blue", at: [0.0, 0.0, -0.37], rot: [-1.570796, 0.0, -1.570796], species: "mackerel" }); // node_fish_1_1_tail_189
  fishBody(ctx, { parent: "fish-crate-1", key: "fish-1-2", name: "Fish 1.2 body", mat: "fish-blue", at: [0.0, 0.2095, 0.0], rot: [0.0, -0.610865, 0.0], species: "mackerel", size: [0.58, 0.16, 0.13] }); // node_fish_1_2_190
  fishTail(ctx, { parent: "fish-1-2", key: "fish-1-2-tail", name: "Fish 1.2 tail fin", mat: "fish-blue", at: [0.0, 0.0, -0.37], rot: [-1.570796, 0.0, -1.570796], species: "mackerel" }); // node_fish_1_2_tail_191
  fishBody(ctx, { parent: "fish-crate-1", key: "fish-1-3", name: "Fish 1.3 body", mat: "fish-blue", at: [0.28148, 0.2095, 0.0], rot: [0.0, -0.610865, 0.0], species: "mackerel", size: [0.56, 0.15, 0.125] }); // node_fish_1_3_192
  fishTail(ctx, { parent: "fish-1-3", key: "fish-1-3-tail", name: "Fish 1.3 tail fin", mat: "fish-blue", at: [0.0, 0.0, -0.37], rot: [-1.570796, 0.0, -1.570796], species: "mackerel" }); // node_fish_1_3_tail_193

  // ---- Fish crates and ice ----
  box(ctx, { parent: "sales-counter", key: "fish-crate-2", name: "Fish crate 2 (tray base)", mat: "timber-plank", at: [-0.0, 0.30565, 0.05], rot: [0.610865, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [1.013, 0.05, 0.82] }); // node_fish_crate_2_194
  box(ctx, { parent: "fish-crate-2", key: "fish-crate-2-front", name: "Fish crate 2 front board", mat: "timber-plank", at: [0.0, 0.11, 0.385], rot: [0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [1.013, 0.27, 0.05] }); // node_fish_crate_2_front_195
  box(ctx, { parent: "fish-crate-2", key: "fish-crate-2-back", name: "Fish crate 2 back board", mat: "timber-plank", at: [0.0, 0.11, -0.385], rot: [0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [1.013, 0.27, 0.05] }); // node_fish_crate_2_back_196
  box(ctx, { parent: "fish-crate-2", key: "fish-crate-2-left", name: "Fish crate 2 left board", mat: "timber-plank", at: [-0.48167, 0.11, 0.0], rot: [0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.05, 0.27, 0.82] }); // node_fish_crate_2_left_197
  box(ctx, { parent: "fish-crate-2", key: "fish-crate-2-right", name: "Fish crate 2 right board", mat: "timber-plank", at: [0.48167, 0.11, 0.0], rot: [0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.05, 0.27, 0.82] }); // node_fish_crate_2_right_198
  box(ctx, { parent: "fish-crate-2", key: "fish-crate-2-ice", name: "Crushed ice bed 2", mat: "ice-crushed", at: [0.0, 0.1, 0.0], rot: [0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.913, 0.1, 0.72] }); // node_fish_crate_2_ice_199
  ball(ctx, { parent: "fish-crate-2", key: "fish-crate-2-ice-chunk-1", name: "Ice chunk 2.1", mat: "ice-crushed", at: [-0.304, 0.155, -0.1722], rot: [-0.610865, 0.0, -0.0], size: [0.5, 32, 20], scale: [0.16, 0.1, 0.13] }); // node_fish_crate_2_ice_chunk_1_200
  ball(ctx, { parent: "fish-crate-2", key: "fish-crate-2-ice-chunk-2", name: "Ice chunk 2.2", mat: "ice-crushed", at: [0.0, 0.155, -0.1722], rot: [-0.610865, 0.6, -0.0], size: [0.5, 32, 20], scale: [0.19, 0.1, 0.13] }); // node_fish_crate_2_ice_chunk_2_201
  ball(ctx, { parent: "fish-crate-2", key: "fish-crate-2-ice-chunk-3", name: "Ice chunk 2.3", mat: "ice-crushed", at: [0.304, 0.155, -0.1722], rot: [-0.610865, 1.2, -0.0], size: [0.5, 32, 20], scale: [0.16, 0.1, 0.13] }); // node_fish_crate_2_ice_chunk_3_202
  ball(ctx, { parent: "fish-crate-2", key: "fish-crate-2-ice-chunk-4", name: "Ice chunk 2.4", mat: "ice-crushed", at: [-0.304, 0.155, 0.1722], rot: [2.530727, 1.341593, -3.141593], size: [0.5, 32, 20], scale: [0.19, 0.1, 0.13] }); // node_fish_crate_2_ice_chunk_4_203
  ball(ctx, { parent: "fish-crate-2", key: "fish-crate-2-ice-chunk-5", name: "Ice chunk 2.5", mat: "ice-crushed", at: [0.0, 0.155, 0.1722], rot: [2.530727, 0.741593, -3.141593], size: [0.5, 32, 20], scale: [0.16, 0.1, 0.13] }); // node_fish_crate_2_ice_chunk_5_204
  ball(ctx, { parent: "fish-crate-2", key: "fish-crate-2-ice-chunk-6", name: "Ice chunk 2.6", mat: "ice-crushed", at: [0.304, 0.155, 0.1722], rot: [2.530727, 0.141593, -3.141593], size: [0.5, 32, 20], scale: [0.19, 0.1, 0.13] }); // node_fish_crate_2_ice_chunk_6_205

  // ---- Fish ----
  fishBody(ctx, { parent: "fish-crate-2", key: "fish-2-1", name: "Fish 2.1 body", mat: "fish-red", at: [-0.19487, 0.227, 0.0], rot: [0.0, -0.523599, -0.0], species: "snapper", size: [0.66, 0.22, 0.176] }); // node_fish_2_1_206
  fishTail(ctx, { parent: "fish-2-1", key: "fish-2-1-tail", name: "Fish 2.1 tail fin", mat: "fish-red", at: [0.0, -0.0, -0.39], rot: [-1.570796, 0.0, -1.570796], species: "snapper" }); // node_fish_2_1_tail_207
  fishBody(ctx, { parent: "fish-crate-2", key: "fish-2-2", name: "Fish 2.2 body", mat: "fish-red", at: [0.19487, 0.227, 0.0], rot: [0.0, -0.523599, -0.0], species: "snapper", size: [0.66, 0.22, 0.176] }); // node_fish_2_2_208
  fishTail(ctx, { parent: "fish-2-2", key: "fish-2-2-tail", name: "Fish 2.2 tail fin", mat: "fish-red", at: [0.0, -0.0, -0.39], rot: [-1.570796, 0.0, -1.570796], species: "snapper" }); // node_fish_2_2_tail_209

  // ---- Fish crates and ice ----
  box(ctx, { parent: "sales-counter", key: "fish-crate-3", name: "Fish crate 3 (tray base)", mat: "timber-plank", at: [1.09333, 0.30565, 0.05], rot: [0.610865, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [1.013, 0.05, 0.82] }); // node_fish_crate_3_210
  box(ctx, { parent: "fish-crate-3", key: "fish-crate-3-front", name: "Fish crate 3 front board", mat: "timber-plank", at: [0.0, 0.11, 0.385], rot: [0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [1.013, 0.27, 0.05] }); // node_fish_crate_3_front_211
  box(ctx, { parent: "fish-crate-3", key: "fish-crate-3-back", name: "Fish crate 3 back board", mat: "timber-plank", at: [0.0, 0.11, -0.385], rot: [0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [1.013, 0.27, 0.05] }); // node_fish_crate_3_back_212
  box(ctx, { parent: "fish-crate-3", key: "fish-crate-3-left", name: "Fish crate 3 left board", mat: "timber-plank", at: [-0.48167, 0.11, 0.0], rot: [0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.05, 0.27, 0.82] }); // node_fish_crate_3_left_213
  box(ctx, { parent: "fish-crate-3", key: "fish-crate-3-right", name: "Fish crate 3 right board", mat: "timber-plank", at: [0.48167, 0.11, 0.0], rot: [0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.05, 0.27, 0.82] }); // node_fish_crate_3_right_214
  box(ctx, { parent: "fish-crate-3", key: "fish-crate-3-ice", name: "Crushed ice bed 3", mat: "ice-crushed", at: [0.0, 0.1, 0.0], rot: [0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.913, 0.1, 0.72] }); // node_fish_crate_3_ice_215
  ball(ctx, { parent: "fish-crate-3", key: "fish-crate-3-ice-chunk-1", name: "Ice chunk 3.1", mat: "ice-crushed", at: [-0.304, 0.155, -0.1722], rot: [-0.610865, 0.0, -0.0], size: [0.5, 32, 20], scale: [0.16, 0.1, 0.13] }); // node_fish_crate_3_ice_chunk_1_216
  ball(ctx, { parent: "fish-crate-3", key: "fish-crate-3-ice-chunk-2", name: "Ice chunk 3.2", mat: "ice-crushed", at: [0.0, 0.155, -0.1722], rot: [-0.610865, 0.6, -0.0], size: [0.5, 32, 20], scale: [0.19, 0.1, 0.13] }); // node_fish_crate_3_ice_chunk_2_217
  ball(ctx, { parent: "fish-crate-3", key: "fish-crate-3-ice-chunk-3", name: "Ice chunk 3.3", mat: "ice-crushed", at: [0.304, 0.155, -0.1722], rot: [-0.610865, 1.2, -0.0], size: [0.5, 32, 20], scale: [0.16, 0.1, 0.13] }); // node_fish_crate_3_ice_chunk_3_218
  ball(ctx, { parent: "fish-crate-3", key: "fish-crate-3-ice-chunk-4", name: "Ice chunk 3.4", mat: "ice-crushed", at: [-0.304, 0.155, 0.1722], rot: [2.530727, 1.341593, -3.141593], size: [0.5, 32, 20], scale: [0.19, 0.1, 0.13] }); // node_fish_crate_3_ice_chunk_4_219
  ball(ctx, { parent: "fish-crate-3", key: "fish-crate-3-ice-chunk-5", name: "Ice chunk 3.5", mat: "ice-crushed", at: [0.0, 0.155, 0.1722], rot: [2.530727, 0.741593, -3.141593], size: [0.5, 32, 20], scale: [0.16, 0.1, 0.13] }); // node_fish_crate_3_ice_chunk_5_220
  ball(ctx, { parent: "fish-crate-3", key: "fish-crate-3-ice-chunk-6", name: "Ice chunk 3.6", mat: "ice-crushed", at: [0.304, 0.155, 0.1722], rot: [2.530727, 0.141593, -3.141593], size: [0.5, 32, 20], scale: [0.19, 0.1, 0.13] }); // node_fish_crate_3_ice_chunk_6_221

  // ---- Fish ----
  fishBody(ctx, { parent: "fish-crate-3", key: "fish-3-1", name: "Fish 3.1 body", mat: "fish-brown", at: [-0.19487, 0.241, 0.0], rot: [0.0, -0.610865, 0.0], species: "flatfish", size: [0.6, 0.26, 0.117] }); // node_fish_3_1_222
  fishTail(ctx, { parent: "fish-3-1", key: "fish-3-1-tail", name: "Fish 3.1 tail fin", mat: "fish-brown", at: [0.0, 0.0, -0.36], rot: [-1.570796, 0.0, -1.570796], species: "flatfish" }); // node_fish_3_1_tail_223
  fishBody(ctx, { parent: "fish-crate-3", key: "fish-3-2", name: "Fish 3.2 body", mat: "fish-brown", at: [0.19487, 0.241, 0.0], rot: [0.0, -0.610865, 0.0], species: "flatfish", size: [0.6, 0.26, 0.117] }); // node_fish_3_2_224
  fishTail(ctx, { parent: "fish-3-2", key: "fish-3-2-tail", name: "Fish 3.2 tail fin", mat: "fish-brown", at: [0.0, 0.0, -0.36], rot: [-1.570796, 0.0, -1.570796], species: "flatfish" }); // node_fish_3_2_tail_225

  // ---- Fish crates and ice ----
  box(ctx, { parent: "sales-counter", key: "crate-riser", name: "Crate riser board (holds the tilted crates' back edges)", mat: "timber-oak", at: [0.0, 0.28267, -0.26585], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [3.22, 0.4653, 0.09] }); // node_crate_riser_226

  // ---- Sign and chains ----
  extrude(ctx, { parent: "bargeboard-front-left", key: "sign-arm", name: "Sign bracket arm", mat: "timber-oak", at: [-0.43823, -0.02209, 1.22925], rot: [-0.953092, -0.604134, 0.896322], profile: [[-0.065,-0.1],[0.065,-0.1],[0.09,-0.075],[0.09,0.075],[0.065,0.1],[-0.065,0.1],[-0.09,0.075],[-0.09,-0.075]], depth: 1.636 }); // node_sign_arm_227
  socketOn(ctx, "sign-arm", "sign-chain-front");
  socketOn(ctx, "sign-arm", "sign-chain-back");
  extrude(ctx, { parent: "sign-arm", key: "sign-arm-root", name: "Sign bracket root post", mat: "timber-oak", at: [-0.0, -0.62, 0.1], rot: [-1.570796, 0.0, -2.306236], profile: [[-0.075,-0.1],[0.075,-0.1],[0.1,-0.075],[0.1,0.075],[0.075,0.1],[-0.075,0.1],[-0.1,0.075],[-0.1,-0.075]], depth: 0.74 }); // node_sign_arm_root_228

  // ---- Timber frame ----
  extrude(ctx, { parent: "sign-arm", key: "sign-arm-brace", name: "Sign bracket brace", mat: "timber-oak", at: [-0.0, -0.5, 0.15], rot: [-0.721655, 0.0, 0.0], profile: TIMBER_13, depth: 0.666 }); // node_sign_arm_brace_229

  // ---- Sign and chains ----
  extrude(ctx, { parent: "sign-arm", key: "sign-board", name: "Hanging sign board", mat: "timber-plank", at: [0.05, -0.98, 0.80799], rot: [-0.0, -1.570796, 0.0], profile: [[-0.62,-0.32],[-0.48,-0.48],[0.62,-0.48],[0.62,0.48],[-0.62,0.48]], depth: 0.1 }); // node_sign_board_230
  box(ctx, { parent: "sign-board", key: "sign-board-plank-1", name: "Sign board plank 1", mat: "timber-plank", at: [-0.0, 0.31, -0.01], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [1.18, 0.29, 0.02] }); // node_sign_board_plank_1_231
  box(ctx, { parent: "sign-board", key: "sign-board-plank-2", name: "Sign board plank 2", mat: "timber-plank", at: [-0.0, -0.0, -0.01], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [1.18, 0.29, 0.02] }); // node_sign_board_plank_2_232
  box(ctx, { parent: "sign-board", key: "sign-board-plank-3", name: "Sign board plank 3", mat: "timber-plank", at: [-0.0, -0.31, -0.01], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [1.18, 0.29, 0.02] }); // node_sign_board_plank_3_233
  emblem(ctx, { parent: "sign-board", key: "sign-fish-emblem", name: "Carved fish emblem", mat: "emblem-teal", at: [-0.0, -0.03, -0.05], rot: [-0.0, 0.0, -0.0] }); // node_sign_fish_emblem_234
  hoop(ctx, { parent: "sign-arm", key: "sign-chain-1-link-1", name: "Sign chain 1 link 1", mat: "iron-wrought", at: [-0.0, -0.15, 0.49647], rot: [-0.0, -0.0, 1.570796], size: [0.45, 0.126, 12, 48], scale: [0.13, 0.13, 0.13] }); // node_sign_chain_1_link_1_235
  hoop(ctx, { parent: "sign-arm", key: "sign-chain-1-link-2", name: "Sign chain 1 link 2", mat: "iron-wrought", at: [-0.0, -0.25, 0.49647], rot: [1.570796, 1.570796, 0.0], size: [0.45, 0.126, 12, 48], scale: [0.13, 0.13, 0.13] }); // node_sign_chain_1_link_2_236
  hoop(ctx, { parent: "sign-arm", key: "sign-chain-1-link-3", name: "Sign chain 1 link 3", mat: "iron-wrought", at: [-0.0, -0.35, 0.49647], rot: [-0.0, -0.0, 1.570796], size: [0.45, 0.126, 12, 48], scale: [0.13, 0.13, 0.13] }); // node_sign_chain_1_link_3_237
  hoop(ctx, { parent: "sign-arm", key: "sign-chain-1-link-4", name: "Sign chain 1 link 4", mat: "iron-wrought", at: [-0.0, -0.45, 0.49647], rot: [1.570796, 1.570796, 0.0], size: [0.45, 0.126, 12, 48], scale: [0.13, 0.13, 0.13] }); // node_sign_chain_1_link_4_238
  hoop(ctx, { parent: "sign-arm", key: "sign-chain-2-link-1", name: "Sign chain 2 link 1", mat: "iron-wrought", at: [-0.0, -0.15, 1.11951], rot: [-0.0, -0.0, 1.570796], size: [0.45, 0.126, 12, 48], scale: [0.13, 0.13, 0.13] }); // node_sign_chain_2_link_1_239
  hoop(ctx, { parent: "sign-arm", key: "sign-chain-2-link-2", name: "Sign chain 2 link 2", mat: "iron-wrought", at: [-0.0, -0.25, 1.11951], rot: [1.570796, 1.570796, 0.0], size: [0.45, 0.126, 12, 48], scale: [0.13, 0.13, 0.13] }); // node_sign_chain_2_link_2_240
  hoop(ctx, { parent: "sign-arm", key: "sign-chain-2-link-3", name: "Sign chain 2 link 3", mat: "iron-wrought", at: [-0.0, -0.35, 1.11951], rot: [-0.0, -0.0, 1.570796], size: [0.45, 0.126, 12, 48], scale: [0.13, 0.13, 0.13] }); // node_sign_chain_2_link_3_241
  hoop(ctx, { parent: "sign-arm", key: "sign-chain-2-link-4", name: "Sign chain 2 link 4", mat: "iron-wrought", at: [-0.0, -0.45, 1.11951], rot: [1.570796, 1.570796, 0.0], size: [0.45, 0.126, 12, 48], scale: [0.13, 0.13, 0.13] }); // node_sign_chain_2_link_4_242

  // ---- Barrels ----
  turned(ctx, { parent: "root", key: "barrel-left", name: "Barrel left", mat: "timber-barrel", at: [-2.75, 0.0, 2.45], rot: [-0.0, 0.0, -0.0], profile: [[0.0001,0.0],[0.408,0.0],[0.4386,0.1224],[0.4794,0.51],[0.4386,0.8976],[0.408,1.02],[0.3672,1.02],[0.3672,0.9894],[0.0001,0.9894]], segments: 20 }); // node_barrel_left_243
  hoop(ctx, { parent: "barrel-left", key: "barrel-left-hoop-1", name: "Barrel left iron hoop 1", mat: "iron-wrought", at: [0.0, 0.204, 0.0], rot: [1.570796, 0.0, -0.0], size: [0.45, 0.0333, 12, 48], scale: [1.020421052631579, 1.020421052631579, 1.0] }); // node_barrel_left_hoop_1_244
  hoop(ctx, { parent: "barrel-left", key: "barrel-left-hoop-2", name: "Barrel left iron hoop 2", mat: "iron-wrought", at: [0.0, 0.816, 0.0], rot: [1.570796, 0.0, -0.0], size: [0.45, 0.0333, 12, 48], scale: [1.020421052631579, 1.020421052631579, 1.0] }); // node_barrel_left_hoop_2_245
  turned(ctx, { parent: "root", key: "barrel-right", name: "Barrel right", mat: "timber-barrel", at: [2.42, 0.0, -1.35], rot: [-0.0, 0.0, -0.0], profile: [[0.0001,0.0],[0.32,0.0],[0.344,0.096],[0.376,0.4],[0.344,0.704],[0.32,0.8],[0.288,0.8],[0.288,0.776],[0.0001,0.776]], segments: 20 }); // node_barrel_right_246
  hoop(ctx, { parent: "barrel-right", key: "barrel-right-hoop-1", name: "Barrel right iron hoop 1", mat: "iron-wrought", at: [0.0, 0.16, 0.0], rot: [1.570796, 0.0, -0.0], size: [0.45, 0.0422, 12, 48], scale: [0.8060818713450293, 0.8060818713450293, 1.0] }); // node_barrel_right_hoop_1_247
  hoop(ctx, { parent: "barrel-right", key: "barrel-right-hoop-2", name: "Barrel right iron hoop 2", mat: "iron-wrought", at: [0.0, 0.64, 0.0], rot: [1.570796, 0.0, -0.0], size: [0.45, 0.0422, 12, 48], scale: [0.8060818713450293, 0.8060818713450293, 1.0] }); // node_barrel_right_hoop_2_248

  // ---- Yard props ----
  box(ctx, { parent: "root", key: "ground-crate", name: "Ground fish crate", mat: "timber-plank", at: [-1.5, 0.3, 2.75], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [1.0, 0.6, 0.6] }); // node_ground_crate_249
  box(ctx, { parent: "ground-crate", key: "ground-crate-slat-1", name: "Ground crate slat 1", mat: "timber-plank", at: [0.0, -0.16, 0.305], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.98, 0.16, 0.02] }); // node_ground_crate_slat_1_250
  box(ctx, { parent: "ground-crate", key: "ground-crate-slat-2", name: "Ground crate slat 2", mat: "timber-plank", at: [0.0, 0.0, 0.305], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.98, 0.16, 0.02] }); // node_ground_crate_slat_2_251
  box(ctx, { parent: "ground-crate", key: "ground-crate-slat-3", name: "Ground crate slat 3", mat: "timber-plank", at: [0.0, 0.16, 0.305], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.98, 0.16, 0.02] }); // node_ground_crate_slat_3_252

  // ---- Fish ----
  fishBody(ctx, { parent: "ground-crate", key: "ground-crate-fish-1", name: "Ground crate fish 1", mat: "fish-blue", at: [-0.27, 0.31, -0.02], rot: [-0.0, 1.22173, -0.0], species: "mackerel", size: [0.42, 0.12, 0.1] }); // node_ground_crate_fish_1_253
  tailOnBody(ctx, "ground-crate-fish-1", "Ground crate fish 1 tail");
  fishBody(ctx, { parent: "ground-crate", key: "ground-crate-fish-2", name: "Ground crate fish 2", mat: "fish-blue", at: [0.0, 0.31, -0.02], rot: [-0.0, 1.22173, -0.0], species: "mackerel", size: [0.42, 0.12, 0.1] }); // node_ground_crate_fish_2_254
  tailOnBody(ctx, "ground-crate-fish-2", "Ground crate fish 2 tail");
  fishBody(ctx, { parent: "ground-crate", key: "ground-crate-fish-3", name: "Ground crate fish 3", mat: "fish-blue", at: [0.27, 0.31, -0.02], rot: [-0.0, 1.22173, -0.0], species: "mackerel", size: [0.42, 0.12, 0.1] }); // node_ground_crate_fish_3_255
  tailOnBody(ctx, "ground-crate-fish-3", "Ground crate fish 3 tail");

  // ---- Yard props ----
  box(ctx, { parent: "root", key: "rope-bollard", name: "Mooring bollard post", mat: "timber-oak", at: [2.72, 0.52, 2.85], rot: [-0.0, 0.0, -0.0], size: [1, 1, 1, 4, 4, 4], scale: [0.26, 1.04, 0.26] }); // node_rope_bollard_256
  hoop(ctx, { parent: "rope-bollard", key: "bollard-rope-1", name: "Bollard rope turn 1", mat: "rope-hemp", at: [0.0, 0.26, 0.0], rot: [1.570796, 0.0, -0.0], size: [0.45, 0.09, 12, 48], scale: [0.44, 0.44, 0.44] }); // node_bollard_rope_1_257
  hoop(ctx, { parent: "rope-bollard", key: "bollard-rope-2", name: "Bollard rope turn 2", mat: "rope-hemp", at: [0.0, 0.33, 0.0], rot: [1.570796, 0.0, -0.0], size: [0.45, 0.09, 12, 48], scale: [0.44, 0.44, 0.44] }); // node_bollard_rope_2_258
  hoop(ctx, { parent: "rope-bollard", key: "bollard-rope-3", name: "Bollard rope turn 3", mat: "rope-hemp", at: [0.0, 0.4, 0.0], rot: [1.570796, 0.0, -0.0], size: [0.45, 0.09, 12, 48], scale: [0.44, 0.44, 0.44] }); // node_bollard_rope_3_259
  hoop(ctx, { parent: "root", key: "rope-coil", name: "Coiled rope (ground)", mat: "rope-hemp", at: [2.95, 0.07, 3.55], rot: [1.570796, 0.0, -0.0], size: [0.45, 0.099, 12, 48], scale: [0.62, 0.62, 0.62] }); // node_rope_coil_260
  hoop(ctx, { parent: "rope-coil", key: "rope-coil-turn-2", name: "Coiled rope turn 2", mat: "rope-hemp", at: [0.0, 0.0, -0.12], rot: [-0.0, 0.0, -0.0], size: [0.45, 0.099, 12, 48], scale: [0.57, 0.57, 0.62] }); // node_rope_coil_turn_2_261
  hoop(ctx, { parent: "rope-coil", key: "rope-coil-turn-3", name: "Coiled rope turn 3", mat: "rope-hemp", at: [0.0, 0.0, -0.24], rot: [-0.0, 0.0, -0.0], size: [0.45, 0.099, 12, 48], scale: [0.54, 0.54, 0.62] }); // node_rope_coil_turn_3_262
  turned(ctx, { parent: "rope-bollard", key: "buoy-ground", name: "Buoy leaning at the bollard", mat: "buoy-paint", at: [0.3, -0.52, 0.15], rot: [-0.0, 0.0, 0.139626], profile: [[0.0001,0.0],[0.09,0.02],[0.13,0.1],[0.14,0.3],[0.13,0.48],[0.09,0.56],[0.0001,0.58]], segments: 16 }); // node_buoy_ground_263
  band(ctx, { parent: "buoy-ground", key: "buoy-ground-band", name: "Buoy teal band", mat: "buoy-teal", at: [0.0, 0.04, 0.0], rot: [-0.0, 0.0, -0.139626], size: [0.145, 0.145, (0.24 - 0.04), 16, 6], meshAt: [0, (0.24 - 0.04) * 0.5, 0] }); // node_buoy_ground_band_264
  turned(ctx, { parent: "root", key: "sack", name: "Burlap sack", mat: "burlap", at: [3.25, 0.0, 2.55], rot: [-0.0, 0.0, -0.087266], profile: [[0.0001,0.0],[0.26,0.02],[0.33,0.2],[0.31,0.45],[0.2,0.62],[0.09,0.7],[0.12,0.8],[0.0001,0.83]], segments: 18 }); // node_sack_265
  hoop(ctx, { parent: "sack", key: "sack-tie", name: "Sack neck tie", mat: "rope-hemp", at: [0.00051, 0.68264, 0.0], rot: [1.570796, 0.087266, 0.0], size: [0.45, 0.1125, 12, 48], scale: [0.24, 0.24, 0.24] }); // node_sack_tie_266
  turned(ctx, { parent: "corner-post-fr", key: "buoy-hanging", name: "Hanging buoy", mat: "buoy-paint", at: [0.235, -0.34, 0.375], rot: [-0.0, 0.0, -0.0], profile: [[0.0001,0.0],[0.09,0.02],[0.13,0.1],[0.14,0.3],[0.13,0.48],[0.09,0.56],[0.0001,0.58]], segments: 16, scale: [0.85, 0.85, 0.85] }); // node_buoy_hanging_267
  band(ctx, { parent: "buoy-hanging", key: "buoy-hanging-band", name: "Hanging buoy teal band", mat: "buoy-teal", at: [0.0, 0.13, 0.0], rot: [-0.0, 0.0, -0.0], size: [0.124, 0.124, (0.29 - 0.13), 16, 6], meshAt: [0, (0.29 - 0.13) * 0.5, 0] }); // node_buoy_hanging_band_268
  extrude(ctx, { parent: "corner-post-fr", key: "net-strand-1", name: "Fishing net strand 1", mat: "rope-hemp", at: [0.155, 0.73, 0.255], rot: [1.354246, 0.097356, -0.416037], profile: NET_STRAND_1, depth: 1.0288 }); // node_net_strand_1_269
  extrude(ctx, { parent: "corner-post-fr", key: "net-strand-2", name: "Fishing net strand 2", mat: "rope-hemp", at: [0.195, 0.68, 0.505], rot: [1.841743, -0.064146, 2.914794], profile: NET_STRAND_1, depth: 0.936 }); // node_net_strand_2_270
  extrude(ctx, { parent: "corner-post-fr", key: "net-strand-3", name: "Fishing net strand 3", mat: "rope-hemp", at: [0.155, 0.38, 0.255], rot: [1.012197, 0.208907, -0.320392], profile: NET_STRAND_1, depth: 0.4822 }); // node_net_strand_3_271
  extrude(ctx, { parent: "corner-post-fr", key: "net-strand-4", name: "Fishing net strand 4", mat: "rope-hemp", at: [0.255, 0.43, 0.505], rot: [2.092631, -0.213426, 2.788653], profile: NET_STRAND_1, depth: 0.4721 }); // node_net_strand_4_272
  extrude(ctx, { parent: "corner-post-fr", key: "net-strand-5", name: "Fishing net strand 5", mat: "rope-hemp", at: [0.175, 0.73, 0.375], rot: [1.553407, 0.017387, -0.785247], profile: NET_STRAND_1, depth: 1.1503 }); // node_net_strand_5_273
}
