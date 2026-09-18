import * as THREE from "three";
import { sampleWorldComposition } from "../../world/WorldCompositionField";
import { WorldLayout } from "../../world/WorldLayout";
import {
  HEADWATER_GRAYBOX_ENVELOPE,
} from "../../world/HeadwaterWaterfallGraybox";
import { NEVA_HEADWATERS } from "../../world/NevaHeadwaters";

export type WorldFieldOverlay =
  | "district"
  | "habitat"
  | "route"
  | "density"
  | "opening"
  | "river-profile"
  | "wetness"
  | "erosion-deposition"
  | "fishing-access"
  | "island"
  | "climate"
  | "marine"
  | "drainage"
  | "graybox-envelope";

export const WORLD_FIELD_OVERLAYS: readonly WorldFieldOverlay[] = [
  "district",
  "habitat",
  "route",
  "density",
  "opening",
  "river-profile",
  "wetness",
  "erosion-deposition",
  "fishing-access",
  "island",
  "climate",
  "marine",
  "drainage",
  "graybox-envelope"
] as const;

function colorFor(mode: WorldFieldOverlay, worldSeed: number, x: number, z: number): THREE.Color {
  const composition = sampleWorldComposition(worldSeed, x, z);
  const river = WorldLayout.riverBankSample(x, z);
  const drainage = WorldLayout.drainageSampleAt(x, z);
  const color = new THREE.Color();
  if (mode === "district") {
    color.setRGB(
      composition.district.farm * 0.75 + composition.district.headland * 0.28,
      composition.district.village * 0.55 + composition.district.coast * 0.28 + composition.district.farm * 0.35,
      composition.district.harbor * 0.78 + composition.district.coast * 0.6 + composition.district.riverCorridor * 0.45
    );
  } else if (mode === "habitat") {
    color.setRGB(
      composition.habitat.orchard * 0.78 + composition.habitat.exposed * 0.62,
      composition.habitat.woodland * 0.68 + composition.habitat.meadow * 0.76 + composition.habitat.riparian * 0.35,
      composition.habitat.riparian * 0.84 + composition.habitat["working-edge"] * 0.48
    );
  } else if (mode === "route") {
    color.setRGB(composition.route.clearance, composition.route.gateway, composition.route.frame);
  } else if (mode === "density") {
    color.setRGB(
      composition.density.rock,
      Math.max(composition.density.tree, composition.density.bush, composition.density["short-cover"]),
      Math.max(composition.density.flower, composition.density.reed)
    );
  } else if (mode === "opening") {
    color.setRGB(composition.opening, composition.opening * 0.86, 1 - composition.opening * 0.45);
  } else if (mode === "river-profile") {
    color.setRGB(river.upperBank + river.erosion * 0.25, river.floodplain + river.deposition * 0.35, river.channel + river.lowerBank * 0.55);
  } else if (mode === "wetness") {
    const wetness = drainage.islandId === "island.sunreach" ? drainage.moisturePotential : river.wetness;
    color.setRGB(wetness * 0.12, wetness * 0.72, wetness);
  } else if (mode === "erosion-deposition") {
    color.setRGB(drainage.erosion, drainage.deposition * 0.72, drainage.deposition * 0.22);
  } else if (mode === "fishing-access") {
    const access = WorldLayout.fishingAccessAt(x, z);
    color.setRGB(access.accessible ? 0.12 : 0.52, access.accessible ? 0.95 : 0.08, access.accessible ? 0.3 : 0.08);
  } else if (mode === "island") {
    color.set(WorldLayout.islandAt(x, z) === "island.sunreach" ? 0xd6a24f : 0x6f9a69);
  } else if (mode === "climate") {
    const climate = WorldLayout.climateSampleAt(x, z, {
      temperatureC: 20,
      precipitation: 0.5,
      windSpeed: 7,
      windDirectionDeg: 230,
      seaRoughness: 0.35
    });
    color.setRGB(
      Math.min(1, (climate.temperatureC - 12) / 18),
      climate.effectivePrecipitation,
      Math.min(1, climate.evaporationMultiplier / 1.8)
    );
  } else if (mode === "marine") {
    const marine = WorldLayout.marineSampleAt(x, z);
    color.setRGB(marine.reefInfluence, marine.shallowWaterInfluence, marine.openWaterExposure);
  } else {
    color.setRGB(drainage.erosion, drainage.moisturePotential, drainage.deposition);
  }
  return color;
}

function createPatchOverlay(
  mode: WorldFieldOverlay,
  worldSeed: number,
  bounds: Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number }>
): THREE.Mesh {
  const step = 4;
  const columns = Math.floor((bounds.maxX - bounds.minX) / step) + 1;
  const rows = Math.floor((bounds.maxZ - bounds.minZ) / step) + 1;
  const positions = new Float32Array(columns * rows * 3);
  const colors = new Float32Array(columns * rows * 3);
  const indices: number[] = [];
  const color = new THREE.Color();
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const index = row * columns + column;
      const x = bounds.minX + column * step;
      const z = bounds.minZ + row * step;
      positions[index * 3] = x;
      positions[index * 3 + 1] = WorldLayout.terrainHeight(x, z) + 0.16;
      positions[index * 3 + 2] = z;
      color.copy(colorFor(mode, worldSeed, x, z));
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
      if (row >= rows - 1 || column >= columns - 1) continue;
      const nextRow = index + columns;
      indices.push(index, nextRow, index + 1, index + 1, nextRow, nextRow + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.76,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `world-field-overlay-patch:${mode}`;
  mesh.renderOrder = 900;
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * W05.1: the local geometry-change envelope and its surrounding continuity
 * band, drawn on live terrain so a reviewer can see where the headwater slice
 * was allowed to edit and where the surrounding valley had to hold. The
 * overlay only draws the declared envelope; it never edits terrain.
 */
const GRAYBOX_OVERLAY_STYLE = Object.freeze({
  envelopeColor: 0x35c7ff,
  continuityColor: 0xffa53a,
  sourceColor: 0x7dff9b,
  handoffColor: 0xff5e5e,
  fallColor: 0xff6ad5,
  bandWidthMeters: 0.9,
  heightOffsetMeters: 0.3,
  edgeSampleStepMeters: 4,
  markerRadiusMeters: 0.75,
  markerHeightMeters: 3.4
});

interface GrayboxBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** A flat terrain-following band ringing a rectangle; inward edge stays inside the bounds. */
function createTerrainBandMesh(
  bounds: GrayboxBounds,
  color: number,
  opacity: number,
  name: string
): THREE.Mesh {
  const halfWidth = GRAYBOX_OVERLAY_STYLE.bandWidthMeters * 0.5;
  const offset = GRAYBOX_OVERLAY_STYLE.heightOffsetMeters;
  const step = GRAYBOX_OVERLAY_STYLE.edgeSampleStepMeters;
  const edges = [
    { from: { x: bounds.minX, z: bounds.minZ }, to: { x: bounds.maxX, z: bounds.minZ }, inward: { x: 0, z: 1 } },
    { from: { x: bounds.maxX, z: bounds.minZ }, to: { x: bounds.maxX, z: bounds.maxZ }, inward: { x: -1, z: 0 } },
    { from: { x: bounds.maxX, z: bounds.maxZ }, to: { x: bounds.minX, z: bounds.maxZ }, inward: { x: 0, z: -1 } },
    { from: { x: bounds.minX, z: bounds.maxZ }, to: { x: bounds.minX, z: bounds.minZ }, inward: { x: 1, z: 0 } }
  ] as const;

  const positions: number[] = [];
  const indices: number[] = [];
  for (const edge of edges) {
    const length = Math.hypot(edge.to.x - edge.from.x, edge.to.z - edge.from.z);
    const segments = Math.max(1, Math.ceil(length / step));
    for (let segment = 0; segment < segments; segment += 1) {
      const t0 = segment / segments;
      const t1 = (segment + 1) / segments;
      const outerA = {
        x: edge.from.x + (edge.to.x - edge.from.x) * t0,
        z: edge.from.z + (edge.to.z - edge.from.z) * t0
      };
      const outerB = {
        x: edge.from.x + (edge.to.x - edge.from.x) * t1,
        z: edge.from.z + (edge.to.z - edge.from.z) * t1
      };
      const innerA = {
        x: outerA.x + edge.inward.x * halfWidth * 2,
        z: outerA.z + edge.inward.z * halfWidth * 2
      };
      const innerB = {
        x: outerB.x + edge.inward.x * halfWidth * 2,
        z: outerB.z + edge.inward.z * halfWidth * 2
      };
      const base = positions.length / 3;
      for (const point of [outerA, outerB, innerA, innerB]) {
        positions.push(
          point.x,
          WorldLayout.terrainHeight(point.x, point.z) + offset,
          point.z
        );
      }
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.renderOrder = 900;
  mesh.frustumCulled = false;
  return mesh;
}

/** Vertical post marking one locked endpoint or the fall lip/landing station. */
function createGrayboxMarkerMesh(x: number, z: number, color: number, name: string): THREE.Mesh {
  const height = GRAYBOX_OVERLAY_STYLE.markerHeightMeters;
  const geometry = new THREE.CylinderGeometry(
    GRAYBOX_OVERLAY_STYLE.markerRadiusMeters,
    GRAYBOX_OVERLAY_STYLE.markerRadiusMeters,
    height,
    12,
    1,
    true
  );
  geometry.translate(0, height * 0.5, 0);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, WorldLayout.terrainHeight(x, z), z);
  mesh.name = name;
  mesh.renderOrder = 901;
  mesh.frustumCulled = false;
  return mesh;
}

function createGrayboxEnvelopeOverlay(): THREE.Group {
  const envelope = HEADWATER_GRAYBOX_ENVELOPE;
  const margin = envelope.continuityMarginMeters;
  const group = new THREE.Group();
  group.name = "world-field-overlay:graybox-envelope";
  group.add(createTerrainBandMesh(
    envelope,
    GRAYBOX_OVERLAY_STYLE.envelopeColor,
    0.85,
    "graybox-envelope:local-envelope"
  ));
  group.add(createTerrainBandMesh(
    {
      minX: envelope.minX - margin,
      maxX: envelope.maxX + margin,
      minZ: envelope.minZ - margin,
      maxZ: envelope.maxZ + margin
    },
    GRAYBOX_OVERLAY_STYLE.continuityColor,
    0.7,
    "graybox-envelope:continuity-band"
  ));

  const fall = NEVA_HEADWATERS.fall;
  const lipX = WorldLayout.riverCenterX(fall.lipZ);
  const landingX = WorldLayout.riverCenterX(fall.landingZ);
  group.add(createGrayboxMarkerMesh(
    envelope.lockedSourceXZ.x,
    envelope.lockedSourceXZ.z,
    GRAYBOX_OVERLAY_STYLE.sourceColor,
    "graybox-envelope:locked-source"
  ));
  group.add(createGrayboxMarkerMesh(
    lipX,
    fall.lipZ,
    GRAYBOX_OVERLAY_STYLE.fallColor,
    "graybox-envelope:fall-lip"
  ));
  group.add(createGrayboxMarkerMesh(
    landingX,
    fall.landingZ,
    GRAYBOX_OVERLAY_STYLE.fallColor,
    "graybox-envelope:fall-landing"
  ));
  group.add(createGrayboxMarkerMesh(
    envelope.lockedSourceXZ.x,
    envelope.lockedHandoffZ,
    GRAYBOX_OVERLAY_STYLE.handoffColor,
    "graybox-envelope:locked-handoff"
  ));
  return group;
}

export function createWorldDiagnosticOverlay(mode: WorldFieldOverlay, worldSeed: number): THREE.Group {
  if (mode === "graybox-envelope") return createGrayboxEnvelopeOverlay();
  const group = new THREE.Group();
  group.name = `world-field-overlay:${mode}`;
  for (const patch of WorldLayout.terrainPatches()) {
    group.add(createPatchOverlay(mode, worldSeed, patch.bounds));
  }
  return group;
}
