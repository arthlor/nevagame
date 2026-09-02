import * as THREE from "three";
import { sampleWorldComposition } from "../../world/WorldCompositionField";
import { WorldLayout } from "../../world/WorldLayout";

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
  | "drainage";

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
  "drainage"
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

export function createWorldDiagnosticOverlay(mode: WorldFieldOverlay, worldSeed: number): THREE.Group {
  const group = new THREE.Group();
  group.name = `world-field-overlay:${mode}`;
  for (const patch of WorldLayout.terrainPatches()) {
    group.add(createPatchOverlay(mode, worldSeed, patch.bounds));
  }
  return group;
}
