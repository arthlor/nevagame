import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CANONICAL_RENDER_CONFIG } from "../config/VisualRenderConfig";
import { PaletteMaterials } from "../materials/PaletteMaterials";
import { PALETTE_HEX } from "../materials/PaletteTokens";
import type { FarmPoint, FarmRect } from "../../world/FarmLayout";

export interface StarterFarmGroundOptions {
  origin: FarmPoint;
  plantableArea: FarmRect;
  heightAt: (worldX: number, worldZ: number) => number;
}

function hashUnit(value: number): number {
  const sine = Math.sin(value * 91.173 + 17.731) * 43_758.545_312_3;
  return sine - Math.floor(sine);
}

function buildCultivatedBed({
  origin,
  plantableArea,
  heightAt
}: StarterFarmGroundOptions): THREE.BufferGeometry {
  const config = CANONICAL_RENDER_CONFIG.farmGround;
  const segments = config.gridSegments;
  const margin = config.cultivationMarginMeters;
  const minX = plantableArea.minX - margin;
  const maxX = plantableArea.maxX + margin;
  const minZ = plantableArea.minZ - margin;
  const maxZ = plantableArea.maxZ + margin;
  const centerX = (minX + maxX) * 0.5;
  const centerZ = (minZ + maxZ) * 0.5;
  const halfSizeX = (maxX - minX) * 0.5;
  const halfSizeZ = (maxZ - minZ) * 0.5;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let row = 0; row <= segments; row += 1) {
    const rowProgress = row / segments;
    for (let column = 0; column <= segments; column += 1) {
      const columnProgress = column / segments;
      const vertexIndex = row * (segments + 1) + column;
      let localX = THREE.MathUtils.lerp(minX, maxX, columnProgress);
      let localZ = THREE.MathUtils.lerp(minZ, maxZ, rowProgress);

      // A soft superellipse keeps the complete 8x8 planting area while rounding
      // and wandering the worked perimeter into an authored field patch.
      const interiorJitter = 0.035;
      localX += (hashUnit(vertexIndex + 2.1) - 0.5) * interiorJitter;
      localZ += (hashUnit(vertexIndex + 7.7) - 0.5) * interiorJitter;
      const normalizedX = (localX - centerX) / halfSizeX;
      const normalizedZ = (localZ - centerZ) / halfSizeZ;
      const exponent = 4.2;
      const superellipseRadius = Math.pow(
        Math.pow(Math.abs(normalizedX), exponent) + Math.pow(Math.abs(normalizedZ), exponent),
        1 / exponent
      );
      const angle = Math.atan2(normalizedZ, normalizedX);
      const boundary = 0.965
        + Math.sin(angle * 3 + 0.42) * 0.022
        + (hashUnit(vertexIndex + 31.7) - 0.5) * 0.022;
      if (superellipseRadius > boundary) {
        const scale = boundary / superellipseRadius;
        localX = centerX + normalizedX * scale * halfSizeX;
        localZ = centerZ + normalizedZ * scale * halfSizeZ;
      }

      const worldX = origin.x + localX;
      const worldZ = origin.z + localZ;
      const workedSoilRelief = (hashUnit(vertexIndex + 101.3) - 0.5) * 0.022;
      positions.push(worldX, heightAt(worldX, worldZ) + 0.028 + workedSoilRelief, worldZ);
    }
  }

  for (let row = 0; row < segments; row += 1) {
    for (let column = 0; column < segments; column += 1) {
      const topLeft = row * (segments + 1) + column;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + segments + 1;
      const bottomRight = bottomLeft + 1;
      if ((row + column) % 2 === 0) {
        indices.push(topLeft, bottomLeft, topRight, topRight, bottomLeft, bottomRight);
      } else {
        indices.push(topLeft, bottomLeft, bottomRight, topLeft, bottomRight, topRight);
      }
    }
  }

  // Sparse shoulder fragments dissolve the rectangular edge into the surrounding grass.
  const appendShoulder = (side: "north" | "south" | "west" | "east", index: number) => {
    const acrossCount = 6;
    const startProgress = (index + 0.08 + hashUnit(index + side.length) * 0.16) / acrossCount;
    const endProgress = Math.min(1, startProgress + 0.08 + hashUnit(index + 81) * 0.055);
    const outward = 0.18 + hashUnit(index + side.charCodeAt(0)) * 0.34;
    let points: Array<[number, number]>;
    if (side === "north" || side === "south") {
      const edgeZ = side === "north" ? maxZ : minZ;
      const direction = side === "north" ? 1 : -1;
      points = [
        [THREE.MathUtils.lerp(minX, maxX, startProgress), edgeZ],
        [THREE.MathUtils.lerp(minX, maxX, endProgress), edgeZ],
        [THREE.MathUtils.lerp(minX, maxX, (startProgress + endProgress) * 0.5), edgeZ + outward * direction]
      ];
    } else {
      const edgeX = side === "east" ? maxX : minX;
      const direction = side === "east" ? 1 : -1;
      points = [
        [edgeX, THREE.MathUtils.lerp(minZ, maxZ, startProgress)],
        [edgeX, THREE.MathUtils.lerp(minZ, maxZ, endProgress)],
        [edgeX + outward * direction, THREE.MathUtils.lerp(minZ, maxZ, (startProgress + endProgress) * 0.5)]
      ];
    }
    const baseIndex = positions.length / 3;
    for (const [localX, localZ] of points) {
      const worldX = origin.x + localX;
      const worldZ = origin.z + localZ;
      positions.push(worldX, heightAt(worldX, worldZ) + 0.024, worldZ);
    }
    indices.push(baseIndex, baseIndex + 1, baseIndex + 2);
  };

  for (const side of ["north", "south", "west", "east"] as const) {
    for (let index = 0; index < 6; index += 1) appendShoulder(side, index);
  }

  const indexed = new THREE.BufferGeometry();
  indexed.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  indexed.setIndex(indices);
  const geometry = indexed.toNonIndexed();
  indexed.dispose();

  const palette = [
    new THREE.Color(PALETTE_HEX.soil_dry_01),
    new THREE.Color(PALETTE_HEX.soil_dry_01).lerp(new THREE.Color(PALETTE_HEX.soil_warm_01), 0.16),
    new THREE.Color(PALETTE_HEX.soil_dry_01).lerp(new THREE.Color(PALETTE_HEX.soil_warm_01), 0.3),
    new THREE.Color(PALETTE_HEX.soil_dry_01).lerp(new THREE.Color(PALETTE_HEX.soil_damp_01), 0.12),
    new THREE.Color(PALETTE_HEX.soil_dry_01).lerp(new THREE.Color(PALETTE_HEX.soil_warm_01), 0.22)
  ];
  const colorValues = new Float32Array(geometry.getAttribute("position").count * 3);
  for (let triangle = 0; triangle < colorValues.length / 9; triangle += 1) {
    const color = palette[Math.floor(hashUnit(triangle + 211) * palette.length)]!;
    for (let vertex = 0; vertex < 3; vertex += 1) {
      color.toArray(colorValues, triangle * 9 + vertex * 3);
    }
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colorValues, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function buildFurrowTroughs({
  origin,
  plantableArea,
  heightAt
}: StarterFarmGroundOptions): THREE.BufferGeometry | null {
  const config = CANONICAL_RENDER_CONFIG.farmGround;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let furrow = 0; furrow < config.furrowCount; furrow += 1) {
    const progressX = (furrow + 1) / (config.furrowCount + 1);
    const baseX = THREE.MathUtils.lerp(plantableArea.minX, plantableArea.maxX, progressX);
    for (let segment = 0; segment < config.furrowSegments; segment += 1) {
      const startProgress = segment / config.furrowSegments;
      const endProgress = (segment + 1) / config.furrowSegments;
      const startZ = THREE.MathUtils.lerp(plantableArea.minZ - 0.18, plantableArea.maxZ + 0.18, startProgress);
      const endZ = THREE.MathUtils.lerp(plantableArea.minZ - 0.18, plantableArea.maxZ + 0.18, endProgress);
      const startBend = Math.sin(startProgress * Math.PI * 2 + furrow * 0.73) * 0.055;
      const endBend = Math.sin(endProgress * Math.PI * 2 + furrow * 0.73) * 0.055;
      const halfWidth = 0.14 + hashUnit(furrow * 29 + segment) * 0.045;
      const localPoints: Array<[number, number]> = [
        [baseX + startBend - halfWidth, startZ],
        [baseX + startBend + halfWidth, startZ],
        [baseX + endBend - halfWidth, endZ],
        [baseX + endBend + halfWidth, endZ]
      ];
      const baseIndex = positions.length / 3;
      for (const [localX, localZ] of localPoints) {
        const worldX = origin.x + localX;
        const worldZ = origin.z + localZ;
        positions.push(worldX, heightAt(worldX, worldZ) + 0.044, worldZ);
      }
      indices.push(baseIndex, baseIndex + 2, baseIndex + 1, baseIndex + 2, baseIndex + 3, baseIndex + 1);
    }
  }

  if (positions.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildSoilClods({
  origin,
  plantableArea,
  heightAt
}: StarterFarmGroundOptions): THREE.BufferGeometry | null {
  const geometries: THREE.BufferGeometry[] = [];
  const count = CANONICAL_RENDER_CONFIG.farmGround.clodCount;
  for (let index = 0; index < count; index += 1) {
    const localX = THREE.MathUtils.lerp(
      plantableArea.minX - 0.32,
      plantableArea.maxX + 0.32,
      hashUnit(index * 3 + 5)
    );
    const localZ = THREE.MathUtils.lerp(
      plantableArea.minZ - 0.32,
      plantableArea.maxZ + 0.32,
      hashUnit(index * 3 + 6)
    );
    const worldX = origin.x + localX;
    const worldZ = origin.z + localZ;
    const clod = new THREE.TetrahedronGeometry(1, 0);
    clod.scale(
      0.045 + hashUnit(index + 301) * 0.055,
      0.022 + hashUnit(index + 401) * 0.026,
      0.04 + hashUnit(index + 501) * 0.05
    );
    clod.rotateY(hashUnit(index + 601) * Math.PI);
    clod.translate(worldX, heightAt(worldX, worldZ) + 0.046, worldZ);
    geometries.push(clod);
  }
  const merged = mergeGeometries(geometries, false);
  for (const geometry of geometries) geometry.dispose();
  return merged;
}

export function buildStarterFarmGround(options: StarterFarmGroundOptions): THREE.Group {
  const group = new THREE.Group();
  group.name = "starter_farm_cultivated_ground";

  const bed = new THREE.Mesh(
    buildCultivatedBed(options),
    PaletteMaterials.standard("soil_dry_01", {
      vertexColors: true,
      vertexColorMode: "replace",
      roughness: 0.98,
      flatShading: true
    })
  );
  bed.name = "starter_farm_faceted_soil_bed";
  bed.receiveShadow = true;
  group.add(bed);

  const troughGeometry = buildFurrowTroughs(options);
  if (troughGeometry) {
    const troughs = new THREE.Mesh(
      troughGeometry,
      PaletteMaterials.standard("soil_warm_01", { roughness: 0.98, flatShading: true })
    );
    troughs.name = "starter_farm_broken_furrow_troughs";
    troughs.receiveShadow = true;
    group.add(troughs);
  }

  const clodGeometry = buildSoilClods(options);
  if (clodGeometry) {
    const clods = new THREE.Mesh(
      clodGeometry,
      PaletteMaterials.standard("soil_dry_01", { roughness: 1, flatShading: true })
    );
    clods.name = "starter_farm_soil_clods";
    clods.receiveShadow = true;
    group.add(clods);
  }

  return group;
}
