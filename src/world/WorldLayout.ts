import * as THREE from "three";
import { PALETTE_HEX, type PaletteToken } from "../render/materials/PaletteTokens";

export interface WorldBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface StaticColliderLayout {
  id: string;
  center: readonly [number, number, number];
  halfExtents: readonly [number, number, number];
}

export type LandmarkId =
  | "farmhouse"
  | "well"
  | "bridge"
  | "fish-market"
  | "lighthouse"
  | "windmill"
  | "dock";

export interface LandmarkLayout {
  id: LandmarkId;
  x: number;
  z: number;
  yOffset: number;
  rotationY: number;
  scale: number;
}

export type TerrainSurface = "grass" | "soil" | "path" | "beach" | "riverbed" | "cliff";
export type FishingHabitatId = "river" | "lake" | "coast" | "offshore";

export const WORLD_BOUNDS: WorldBounds = { minX: -70, maxX: 70, minZ: -70, maxZ: 41.5 };
export const SAILABLE_BOUNDS: WorldBounds = { minX: -62, maxX: 62, minZ: -94, maxZ: 132 };
export const TERRAIN_RESOLUTION = 96;
export const TERRAIN_SIZE_METERS = 320;

const BRIDGE_CENTER = { x: -16, z: 5 };
const BRIDGE_LENGTH = 14.2;
const BRIDGE_WIDTH = 3.8;

function clamp01(value: number): number {
  return THREE.MathUtils.clamp(value, 0, 1);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const amount = clamp01((value - edge0) / Math.max(0.0001, edge1 - edge0));
  return amount * amount * (3 - 2 * amount);
}

function boxPlateauWeight(
  x: number,
  z: number,
  centerX: number,
  centerZ: number,
  halfWidth: number,
  halfDepth: number,
  feather: number
): number {
  const dx = Math.max(0, Math.abs(x - centerX) - halfWidth);
  const dz = Math.max(0, Math.abs(z - centerZ) - halfDepth);
  return 1 - smoothstep(0, feather, Math.hypot(dx, dz));
}

/**
 * Canonical compact-world layout. Rendering, physics and interactions consume
 * this module; it contains no mutable simulation or Three.js scene state.
 */
export class WorldLayout {
  public static riverCenterX(z: number): number {
    return Math.sin(z * 0.04) * 6 - 16;
  }

  public static riverDistance(x: number, z: number): number {
    return Math.abs(x - this.riverCenterX(z));
  }

  public static isBridgeDeck(x: number, z: number): boolean {
    return (
      Math.abs(x - BRIDGE_CENTER.x) <= BRIDGE_LENGTH * 0.52 &&
      Math.abs(z - BRIDGE_CENTER.z) <= BRIDGE_WIDTH * 0.56
    );
  }

  public static isWater(x: number, z: number): boolean {
    return z > 42 || (z <= 42 && this.riverDistance(x, z) < 6.65 && !this.isBridgeDeck(x, z));
  }

  /** Resolves the physical water at a point; UI callers must not infer habitats. */
  public static fishingHabitatAt(x: number, z: number): FishingHabitatId | null {
    if (!this.isWater(x, z)) return null;
    if (z <= 42) return "river";
    if (z <= 58) return "lake";
    return "coast";
  }

  /** Returns the nearest fishable habitat reachable from dry land or a boat. */
  public static nearbyFishingHabitat(x: number, z: number, reachMeters: number = 4.5): FishingHabitatId | null {
    const direct = this.fishingHabitatAt(x, z);
    if (direct) return direct;
    if (z <= 42 && !this.isBridgeDeck(x, z) && this.riverDistance(x, z) <= 6.65 + reachMeters) return "river";
    if (z <= 42 && 42 - z <= reachMeters) return "lake";
    return null;
  }

  public static regionAt(x: number, z: number): "region.village" | "region.farm" | "region.coast" {
    if (z >= 28) return "region.coast";
    if (x <= -5 && z <= 0) return "region.farm";
    return "region.village";
  }

  public static isWalkable(x: number, z: number): boolean {
    return (
      x >= WORLD_BOUNDS.minX &&
      x <= WORLD_BOUNDS.maxX &&
      z >= WORLD_BOUNDS.minZ &&
      z <= WORLD_BOUNDS.maxZ &&
      (!this.isWater(x, z) || this.isBridgeDeck(x, z))
    );
  }

  public static isSailable(x: number, z: number): boolean {
    return (
      x >= SAILABLE_BOUNDS.minX &&
      x <= SAILABLE_BOUNDS.maxX &&
      z >= SAILABLE_BOUNDS.minZ &&
      z <= SAILABLE_BOUNDS.maxZ &&
      (z > 40 || this.isWater(x, z)) &&
      !this.isBridgeDeck(x, z)
    );
  }

  private static applyPlateau(
    height: number,
    x: number,
    z: number,
    targetHeight: number,
    centerX: number,
    centerZ: number,
    halfWidth: number,
    halfDepth: number,
    feather: number
  ): number {
    return THREE.MathUtils.lerp(
      height,
      targetHeight,
      boxPlateauWeight(x, z, centerX, centerZ, halfWidth, halfDepth, feather)
    );
  }

  public static terrainHeight(x: number, z: number): number {
    const broadLand =
      Math.sin(x * 0.024) * 0.72 +
      Math.cos(z * 0.031) * 0.58 +
      Math.sin((x + z) * 0.018) * 0.46;
    const authoredFacetScale = Math.sin(x * 0.078 + z * 0.046) * 0.22;
    let height = 1.05 + broadLand + authoredFacetScale;

    const riverDistance = this.riverDistance(x, z);
    const riverBed = -1.62 + Math.sin(z * 0.055) * 0.1;
    height = THREE.MathUtils.lerp(riverBed, height, smoothstep(6.1, 14.4, riverDistance));

    if (z > 42) {
      height = -0.55 - Math.min(8.5, (z - 42) * 0.2);
    } else if (z > 28) {
      const coastShelf = 0.2 + Math.sin(x * 0.035) * 0.16;
      height = THREE.MathUtils.lerp(height, coastShelf, smoothstep(28, 42, z));
    }

    // Deliberate working plateaus keep gameplay assets grounded while the
    // surrounding land retains broad low-poly planes.
    height = this.applyPlateau(height, x, z, 0.78, 0, 0, 5.5, 5.5, 4.5);
    height = this.applyPlateau(height, x, z, 0.95, 9.5, -1.5, 4.2, 3.4, 4.2);
    height = this.applyPlateau(height, x, z, 0.42, 21, 33.5, 5.2, 4.2, 4.8);
    const lighthousePlateau =
      boxPlateauWeight(x, z, 10, 34, 7.2, 5.4, 9.2) *
      (1 - smoothstep(36.5, 42, z));
    height = THREE.MathUtils.lerp(height, 3.15, lighthousePlateau);
    height = this.applyPlateau(height, x, z, 2.1, -30, 18, 4.2, 4.2, 5.2);

    // Raised approach shoulders meet the authored bridge deck without a
    // collision step or a flat artificial riverbank.
    const approachZ = 1 - smoothstep(2.1, 4.4, Math.abs(z - BRIDGE_CENTER.z));
    const leftApproach = 1 - smoothstep(0, 4.6, Math.abs(x - (BRIDGE_CENTER.x - 8.4)));
    const rightApproach = 1 - smoothstep(0, 4.6, Math.abs(x - (BRIDGE_CENTER.x + 8.4)));
    const approachWeight = approachZ * Math.max(leftApproach, rightApproach);
    height = THREE.MathUtils.lerp(height, 1.75, approachWeight * 0.82);

    return height;
  }

  public static terrainNormal(x: number, z: number, sampleDistance: number = 0.45): THREE.Vector3 {
    const left = this.terrainHeight(x - sampleDistance, z);
    const right = this.terrainHeight(x + sampleDistance, z);
    const back = this.terrainHeight(x, z - sampleDistance);
    const front = this.terrainHeight(x, z + sampleDistance);
    return new THREE.Vector3(left - right, sampleDistance * 2, back - front).normalize();
  }

  public static terrainSurface(x: number, z: number): TerrainSurface {
    const height = this.terrainHeight(x, z);
    if (this.isWater(x, z)) return height < -0.35 ? "riverbed" : "soil";
    if (x >= -5 && x <= 5 && z >= -5 && z <= 5) return "soil";
    const onBridgePath = Math.abs(z - (x * -0.3 + 1)) < 1.85 && x >= -26 && x <= 0;
    const onHarborPath = Math.abs(z - (x * 0.8 + 15)) < 2.05 && x >= 0 && x <= 27;
    if (onBridgePath || onHarborPath) return "path";
    if (z > 39) return "beach";
    if (this.riverDistance(x, z) < 8.0) return "soil";
    if (z > 27 && this.terrainNormal(x, z).y < 0.64) return "cliff";
    return "grass";
  }

  public static landmark(id: LandmarkId): LandmarkLayout {
    const layouts: Record<LandmarkId, Omit<LandmarkLayout, "id">> = {
      farmhouse: { x: 9.5, z: -1.5, yOffset: 0, rotationY: Math.PI + 0.05, scale: 1.12 },
      well: { x: 11.5, z: 1, yOffset: 0, rotationY: 0, scale: 1 },
      bridge: { x: -16, z: 5, yOffset: 0.1, rotationY: 0.05, scale: 1 },
      "fish-market": { x: 21, z: 33.5, yOffset: 0, rotationY: Math.PI - 0.18, scale: 0.82 },
      lighthouse: { x: 10, z: 34, yOffset: 0, rotationY: 0, scale: 0.56 },
      windmill: { x: -30, z: 18, yOffset: 0, rotationY: 0.35, scale: 0.82 },
      dock: { x: 24, z: 40, yOffset: -0.2, rotationY: 0, scale: 1 }
    };
    return { id, ...layouts[id] };
  }

  public static terrainHeightfield(): Float32Array {
    const samples = new Float32Array((TERRAIN_RESOLUTION + 1) * (TERRAIN_RESOLUTION + 1));
    for (let row = 0; row <= TERRAIN_RESOLUTION; row++) {
      for (let column = 0; column <= TERRAIN_RESOLUTION; column++) {
        const x = (column / TERRAIN_RESOLUTION - 0.5) * TERRAIN_SIZE_METERS;
        const z = (row / TERRAIN_RESOLUTION - 0.5) * TERRAIN_SIZE_METERS;
        samples[row * (TERRAIN_RESOLUTION + 1) + column] = this.terrainHeight(x, z);
      }
    }
    return samples;
  }

  public static staticColliders(): readonly StaticColliderLayout[] {
    const collider = (
      id: LandmarkId,
      halfExtents: readonly [number, number, number],
      centerYOffset: number
    ): StaticColliderLayout => {
      const layout = this.landmark(id);
      return {
        id,
        center: [
          layout.x,
          this.terrainHeight(layout.x, layout.z) + centerYOffset,
          layout.z
        ],
        halfExtents
      };
    };
    const bridgeSegments: StaticColliderLayout[] = [];
    const segmentCount = 13;
    for (let index = 0; index < segmentCount; index++) {
      const localX = -BRIDGE_LENGTH * 0.5 + (BRIDGE_LENGTH / segmentCount) * (index + 0.5);
      const crown = 0.82 * (1 - (localX / (BRIDGE_LENGTH * 0.5)) ** 2);
      bridgeSegments.push({
        id: `bridge-deck-${index}`,
        center: [BRIDGE_CENTER.x + localX, 2.05 + crown, BRIDGE_CENTER.z],
        halfExtents: [BRIDGE_LENGTH / segmentCount * 0.53, 0.29, BRIDGE_WIDTH * 0.48]
      });
    }
    return [
      collider("farmhouse", [3.45, 3.25, 3.05], 3.25),
      collider("well", [0.92, 1.35, 0.82], 1.35),
      collider("fish-market", [3.1, 2.55, 2.35], 2.55),
      collider("lighthouse", [1.25, 3.85, 1.25], 3.85),
      collider("windmill", [1.9, 3.2, 1.9], 3.2),
      collider("dock", [4, 1.15, 1.85], 0.95),
      ...bridgeSegments
    ];
  }

  private static surfaceColor(surface: TerrainSurface): THREE.Color {
    const tokens: Record<TerrainSurface, PaletteToken> = {
      grass: "grass_yellow_01",
      soil: "soil_warm_01",
      path: "stone_golden_01",
      beach: "plaster_warm_01",
      riverbed: "stone_cool_01",
      cliff: "stone_warm_01"
    };
    return new THREE.Color(PALETTE_HEX[tokens[surface]]);
  }

  public static buildTerrainGeometry(): THREE.BufferGeometry {
    const indexed = new THREE.PlaneGeometry(
      TERRAIN_SIZE_METERS,
      TERRAIN_SIZE_METERS,
      TERRAIN_RESOLUTION,
      TERRAIN_RESOLUTION
    );
    indexed.rotateX(-Math.PI / 2);
    const geometry = indexed.toNonIndexed();
    indexed.dispose();
    const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
    const colors = new Float32Array(positions.count * 3);
    const sunDirection = new THREE.Vector3(0.58, 0.68, 0.44).normalize();
    const grassOlive = new THREE.Color(PALETTE_HEX.foliage_olive_01);
    const grassSage = new THREE.Color(PALETTE_HEX.foliage_sage_01);
    const stoneWarm = new THREE.Color(PALETTE_HEX.stone_warm_01);
    const soilWarm = new THREE.Color(PALETTE_HEX.soil_warm_01);
    const coastalRock = new THREE.Color(PALETTE_HEX.rock_coastal_dark_01);

    for (let index = 0; index < positions.count; index++) {
      const x = positions.getX(index);
      const z = positions.getZ(index);
      positions.setY(index, this.terrainHeight(x, z));
    }

    for (let index = 0; index < positions.count; index += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(positions, index);
      const b = new THREE.Vector3().fromBufferAttribute(positions, index + 1);
      const c = new THREE.Vector3().fromBufferAttribute(positions, index + 2);
      const center = a.clone().add(b).add(c).multiplyScalar(1 / 3);
      const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      if (normal.y < 0) normal.multiplyScalar(-1);
      const surface = this.terrainSurface(center.x, center.z);
      const color = this.surfaceColor(surface);

      const riverDist = this.riverDistance(center.x, center.z);

      if (surface === "grass") {
        const broadVariation = (Math.sin(center.x * 0.055) + Math.cos(center.z * 0.047)) * 0.5;
        color.lerp(broadVariation > 0 ? grassSage : grassOlive, 0.14 + Math.abs(broadVariation) * 0.12);
        // Soft damp earth transition near river corridor
        if (riverDist < 12.5 && center.z <= 40) {
          const riverFringe = 1 - smoothstep(7.5, 12.5, riverDist);
          color.lerp(soilWarm, riverFringe * 0.45);
        }
      } else if (surface === "soil") {
        if (riverDist < 7.5 && center.z <= 40) {
          color.lerp(stoneWarm, 0.28);
        }
      } else if (surface === "cliff" || normal.y < 0.72) {
        color.lerp(stoneWarm, 0.32);
        color.lerp(coastalRock, surface === "cliff" ? 0.16 : 0.08);
      }

      const neighborAverage =
        (this.terrainHeight(center.x - 1.2, center.z) +
          this.terrainHeight(center.x + 1.2, center.z) +
          this.terrainHeight(center.x, center.z - 1.2) +
          this.terrainHeight(center.x, center.z + 1.2)) /
        4;
      const contactOcclusion = clamp01((neighborAverage - center.y) * 0.08);
      const planeLight = THREE.MathUtils.clamp(
        0.98 + normal.dot(sunDirection) * 0.08 - contactOcclusion * 0.06,
        0.9,
        1.08
      );
      const authoredVariation = 0.975 + (Math.sin(index * 0.731) * 0.5 + 0.5) * 0.05;
      color.multiplyScalar(planeLight * authoredVariation);
      for (let vertex = 0; vertex < 3; vertex++) {
        colors.set([color.r, color.g, color.b], (index + vertex) * 3);
      }
    }

    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }
}
