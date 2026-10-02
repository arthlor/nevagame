import * as THREE from "three";
import type { CropPlacementResult } from "../../simulation/core/contracts";
import { isPlantableFarmSurface, worldToFarmLocal } from "../../world/FarmLayout";
import { WorldLayout } from "../../world/WorldLayout";
import { PALETTE_HEX } from "../materials/PaletteTokens";

const RING_SEGMENTS = 64;
const STROKE_METERS = 0.055;
const LIFT_METERS = 0.07;
const CURSOR_AVAILABLE_COLOR = "#48c738";

type PreviewShape = Pick<CropPlacementResult, "farmId" | "worldX" | "worldZ" | "valid" | "reasonCode"> & {
  radius: number;
  width: number;
  depth: number;
  rotationRadians: number;
};

/**
 * One crop's ground ring. It exists only while the pointer is on plantable
 * soil, and a segment is drawn only when that part of the ring is still on
 * the plot. Paths, yards and the grass outside the soil get no circle.
 */
export class CropPlacementCursor {
  public readonly group = new THREE.Group();
  private readonly shadowMaterial = groundMaterial("#14100c", 0.22);
  private readonly accentMaterial = groundMaterial(CURSOR_AVAILABLE_COLOR, 0.96);
  private readonly footprintMaterial = groundMaterial(CURSOR_AVAILABLE_COLOR, 0.42);
  private readonly lineMaterial = new THREE.LineBasicMaterial({
    color: CURSOR_AVAILABLE_COLOR,
    transparent: true,
    opacity: 0.75,
    depthWrite: false
  });
  private readonly shadow = new THREE.Mesh(dynamicGeometry(RING_SEGMENTS * 6), this.shadowMaterial);
  private readonly stroke = new THREE.Mesh(dynamicGeometry(RING_SEGMENTS * 6), this.accentMaterial);
  private readonly seed = new THREE.Mesh(
    new THREE.CircleGeometry(0.045, 18).rotateX(-Math.PI / 2),
    this.accentMaterial
  );
  private readonly ticks = new THREE.LineSegments(dynamicGeometry(8), this.lineMaterial);
  private readonly cross = new THREE.Mesh(dynamicGeometry(12), this.accentMaterial);
  private readonly nest = new THREE.Mesh(dynamicGeometry(RING_SEGMENTS * 6), this.accentMaterial);
  private readonly footprint = new THREE.Mesh(dynamicGeometry(16 * 6), this.footprintMaterial);
  private readonly sampledHeights = new Map<string, number>();
  private lastPreview: PreviewShape | undefined;

  public constructor() {
    this.group.name = "crop_placement_cursor";
    this.group.visible = false;
    this.group.renderOrder = 4;
    this.shadow.name = "crop_placement_shadow";
    this.stroke.name = "crop_placement_hoop";
    this.seed.name = "crop_placement_seed";
    this.ticks.name = "crop_placement_ticks";
    this.cross.name = "crop_placement_cross";
    this.nest.name = "crop_placement_nest";
    this.footprint.name = "crop_placement_footprint";
    for (const mesh of [this.shadow, this.stroke, this.seed, this.nest, this.cross, this.footprint]) {
      mesh.renderOrder = 5;
      mesh.frustumCulled = false;
      mesh.raycast = () => undefined;
    }
    this.cross.renderOrder = 6;
    this.ticks.renderOrder = 6;
    this.ticks.frustumCulled = false;
    this.ticks.raycast = () => undefined;
    this.group.add(this.shadow, this.stroke, this.seed, this.ticks, this.cross, this.nest, this.footprint);
  }

  public update(result: CropPlacementResult | null): void {
    if (!result) {
      this.group.visible = false;
      this.lastPreview = undefined;
      return;
    }
    const center = { x: result.worldX, z: result.worldZ };
    const centerLocal = worldToFarmLocal(result.farmId, center);
    if (!isPlantableFarmSurface(result.farmId, centerLocal)) {
      this.group.visible = false;
      this.lastPreview = undefined;
      return;
    }

    const radius = Math.max(result.footprint.width, result.footprint.depth, 0.4) * 0.5;
    const previous = this.lastPreview;
    // The caller still validates every frame; only identical presentation work is skipped.
    if (previous
      && previous.farmId === result.farmId
      && previous.worldX === result.worldX
      && previous.worldZ === result.worldZ
      && previous.radius === radius
      && previous.width === result.footprint.width
      && previous.depth === result.footprint.depth
      && previous.rotationRadians === result.rotationRadians
      && previous.valid === result.valid
      && previous.reasonCode === result.reasonCode) return;
    this.sampledHeights.clear();
    const onSoil = (localX: number, localZ: number): boolean => isPlantableFarmSurface(
      result.farmId,
      worldToFarmLocal(result.farmId, { x: center.x + localX, z: center.z + localZ })
    );
    const outer: Array<{ x: number; z: number; onSoil: boolean }> = [];
    for (let index = 0; index < RING_SEGMENTS; index += 1) {
      const angle = (index / RING_SEGMENTS) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      outer.push({ x, z, onSoil: onSoil(x, z) });
    }
    const complete = outer.every((point) => point.onSoil);
    const affirmative = result.valid;
    const tooFar = !result.valid && result.reasonCode === "too-far";
    const occupied = !result.valid && result.reasonCode === "overlaps-crop";
    const color = affirmative
      ? CURSOR_AVAILABLE_COLOR
      : tooFar
        ? PALETTE_HEX.accent_ochre_01
        : PALETTE_HEX.roof_terracotta_01;
    this.accentMaterial.color.set(color);
    this.accentMaterial.opacity = tooFar ? 0.72 : 0.96;
    this.lineMaterial.color.set(color);
    this.lineMaterial.opacity = affirmative ? 0.75 : 0.6;
    this.footprintMaterial.color.set(color);
    this.footprintMaterial.opacity = affirmative
      ? 0.42
      : tooFar
        ? 0.25
        : occupied
          ? 0.55
          : 0.40;

    const keep = (index: number): boolean => {
      const current = outer[index]?.onSoil ?? false;
      const next = outer[(index + 1) % RING_SEGMENTS]?.onSoil ?? false;
      if (!current || !next) return false;
      if (tooFar) return index % 2 === 0;
      if (!affirmative && !occupied && complete) return index % 5 !== 0;
      return true;
    };

    this.replaceStrip(this.shadow, center, outer, radius, Math.max(0.04, radius - STROKE_METERS - 0.02), keep);
    this.replaceStrip(this.stroke, center, outer, radius, Math.max(0.04, radius - STROKE_METERS), keep);
    this.replaceFootprint(result, center, onSoil);
    this.group.visible = true;
    this.group.position.set(center.x, 0, center.z);
    this.group.rotation.set(0, 0, 0);
    this.group.scale.set(1, 1, 1);

    const groundY = this.sampleHeight(center, 0, 0) + LIFT_METERS + 0.012;
    this.seed.visible = affirmative;
    this.seed.position.y = groundY;
    this.ticks.visible = affirmative;
    if (affirmative) this.replaceTicks(center, radius, result.rotationRadians);
    this.cross.visible = !affirmative && !tooFar && !occupied;
    if (this.cross.visible) this.replaceCross(center, radius, onSoil);
    this.nest.visible = occupied;
    if (occupied) this.replaceStrip(
      this.nest,
      center,
      outer.map((point) => ({ ...point, onSoil: onSoil(point.x * 0.34, point.z * 0.34) })),
      radius * 0.34,
      radius * 0.22,
      (index) => (outer[index]?.onSoil ?? false)
    );
    this.lastPreview = {
      farmId: result.farmId,
      worldX: result.worldX,
      worldZ: result.worldZ,
      valid: result.valid,
      reasonCode: result.reasonCode,
      radius,
      width: result.footprint.width,
      depth: result.footprint.depth,
      rotationRadians: result.rotationRadians
    };
  }

  public dispose(): void {
    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) object.geometry.dispose();
    });
    this.shadowMaterial.dispose();
    this.accentMaterial.dispose();
    this.footprintMaterial.dispose();
    this.lineMaterial.dispose();
    this.group.removeFromParent();
  }

  private replaceTicks(center: { x: number; z: number }, radius: number, rotationRadians: number): void {
    const positions: number[] = [];
    for (let quadrant = 0; quadrant < 4; quadrant += 1) {
      const angle = rotationRadians + quadrant * (Math.PI / 2);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      this.pushLifted(positions, center, cos * (radius - 0.11), sin * (radius - 0.11));
      this.pushLifted(positions, center, cos * (radius - 0.02), sin * (radius - 0.02));
    }
    setPositions(this.ticks.geometry, positions);
  }

  private replaceFootprint(
    result: CropPlacementResult,
    center: { x: number; z: number },
    onSoil: (x: number, z: number) => boolean
  ): void {
    const { width, depth } = result.footprint;
    const cos = Math.cos(result.rotationRadians), sin = Math.sin(result.rotationRadians);
    const corners = [[-width / 2, -depth / 2], [width / 2, -depth / 2],
      [width / 2, depth / 2], [-width / 2, depth / 2]].map(([x, z]) => ({
      x: x! * cos - z! * sin, z: x! * sin + z! * cos
    }));
    const positions: number[] = [];
    for (let edge = 0; edge < 4; edge++) {
      const a = corners[edge]!, b = corners[(edge + 1) % 4]!;
      for (let segment = 0; segment < 4; segment++) {
        const start = positions.length;
        this.pushBar(positions, center,
          THREE.MathUtils.lerp(a.x, b.x, segment / 4), THREE.MathUtils.lerp(a.z, b.z, segment / 4),
          THREE.MathUtils.lerp(a.x, b.x, (segment + 1) / 4), THREE.MathUtils.lerp(a.z, b.z, (segment + 1) / 4), 0.018);
        for (let index = start; index < positions.length; index += 3) {
          if (!onSoil(positions[index]!, positions[index + 2]!)) {
            positions.length = start;
            break;
          }
        }
      }
    }
    this.footprint.visible = positions.length > 0;
    setPositions(this.footprint.geometry, positions);
  }

  private replaceCross(
    center: { x: number; z: number },
    radius: number,
    onSoil: (localX: number, localZ: number) => boolean
  ): void {
    const reach = Math.min(0.2, radius * 0.5);
    const corners = [
      [-reach, -reach],
      [reach, reach],
      [-reach, reach],
      [reach, -reach]
    ];
    if (corners.some(([x, z]) => !onSoil(x, z))) {
      this.cross.visible = false;
      return;
    }
    const positions: number[] = [];
    this.pushBar(positions, center, -reach, -reach, reach, reach);
    this.pushBar(positions, center, -reach, reach, reach, -reach);
    for (let index = 0; index < positions.length; index += 3) {
      const localX = positions[index] ?? 0;
      const localZ = positions[index + 2] ?? 0;
      if (!onSoil(localX, localZ)) {
        this.cross.visible = false;
        return;
      }
    }
    setPositions(this.cross.geometry, positions);
  }

  private pushBar(
    positions: number[],
    center: { x: number; z: number },
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    halfWidth: number = 0.028
  ): void {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const length = Math.hypot(dx, dz) || 1;
    const px = (-dz / length) * halfWidth;
    const pz = (dx / length) * halfWidth;
    const quad = [
      { x: x0 + px, z: z0 + pz },
      { x: x1 + px, z: z1 + pz },
      { x: x1 - px, z: z1 - pz },
      { x: x0 + px, z: z0 + pz },
      { x: x1 - px, z: z1 - pz },
      { x: x0 - px, z: z0 - pz }
    ];
    for (const point of quad) this.pushLifted(positions, center, point.x, point.z);
  }

  private replaceStrip(
    mesh: THREE.Mesh,
    center: { x: number; z: number },
    outer: ReadonlyArray<{ x: number; z: number }>,
    outerRadius: number,
    innerRadius: number,
    keep: (index: number) => boolean
  ): void {
    const positions: number[] = [];
    const scale = (point: { x: number; z: number }, radius: number): { x: number; z: number } => {
      const length = Math.hypot(point.x, point.z) || 1;
      return { x: (point.x / length) * radius, z: (point.z / length) * radius };
    };
    for (let index = 0; index < outer.length; index += 1) {
      if (!keep(index)) continue;
      const current = outer[index];
      const next = outer[(index + 1) % outer.length];
      if (!current || !next) continue;
      const inner0 = scale(current, innerRadius);
      const outer0 = scale(current, outerRadius);
      const inner1 = scale(next, innerRadius);
      const outer1 = scale(next, outerRadius);
      const quad = [inner0, outer0, outer1, inner0, outer1, inner1];
      for (const point of quad) this.pushLifted(positions, center, point.x, point.z);
    }
    mesh.visible = positions.length > 0;
    setPositions(mesh.geometry, positions);
  }

  private pushLifted(positions: number[], center: { x: number; z: number }, localX: number, localZ: number): void {
    const y = this.sampleHeight(center, localX, localZ) + LIFT_METERS;
    positions.push(localX, y, localZ);
  }

  private sampleHeight(center: { x: number; z: number }, localX: number, localZ: number): number {
    // Triangle corners and the two ring strips share terrain samples within this update.
    const key = `${localX}:${localZ}`;
    const cached = this.sampledHeights.get(key);
    if (cached !== undefined) return cached;
    const height = WorldLayout.terrainHeight(center.x + localX, center.z + localZ);
    this.sampledHeights.set(key, height);
    return height;
  }
}

function dynamicGeometry(vertexCapacity: number): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(vertexCapacity * 3), 3)
    .setUsage(THREE.DynamicDrawUsage));
  geometry.setDrawRange(0, 0);
  geometry.boundingBox = new THREE.Box3();
  geometry.boundingSphere = new THREE.Sphere();
  return geometry;
}

function setPositions(geometry: THREE.BufferGeometry, positions: number[]): void {
  const attribute = geometry.getAttribute("position") as THREE.BufferAttribute;
  attribute.array.set(positions);
  geometry.setDrawRange(0, positions.length / 3);
  if (positions.length === 0) return;
  attribute.clearUpdateRanges();
  attribute.addUpdateRange(0, positions.length);
  attribute.needsUpdate = true;
  // Transparent sorting must use the drawn vertices, not the unused buffer tail.
  const bounds = geometry.boundingBox!;
  bounds.makeEmpty();
  for (let index = 0; index < geometry.drawRange.count; index += 1) {
    const x = attribute.getX(index);
    const y = attribute.getY(index);
    const z = attribute.getZ(index);
    bounds.min.x = Math.min(bounds.min.x, x);
    bounds.min.y = Math.min(bounds.min.y, y);
    bounds.min.z = Math.min(bounds.min.z, z);
    bounds.max.x = Math.max(bounds.max.x, x);
    bounds.max.y = Math.max(bounds.max.y, y);
    bounds.max.z = Math.max(bounds.max.z, z);
  }
  const sphere = geometry.boundingSphere!;
  bounds.getCenter(sphere.center);
  let radiusSquared = 0;
  for (let index = 0; index < geometry.drawRange.count; index += 1) {
    const dx = attribute.getX(index) - sphere.center.x;
    const dy = attribute.getY(index) - sphere.center.y;
    const dz = attribute.getZ(index) - sphere.center.z;
    radiusSquared = Math.max(radiusSquared, dx * dx + dy * dy + dz * dz);
  }
  sphere.radius = Math.sqrt(radiusSquared);
}

function groundMaterial(color: string, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -8,
    polygonOffsetUnits: -8
  });
}
