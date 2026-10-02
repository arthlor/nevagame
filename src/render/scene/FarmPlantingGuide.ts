import * as THREE from "three";
import { ContentRegistry } from "../../content/ContentRegistry";
import type { GameState } from "../../simulation/core/types";
import { farmLocalToWorld, getFarmLayout, type FarmLayoutDefinition } from "../../world/FarmLayout";
import { WorldLayout } from "../../world/WorldLayout";
import { CANONICAL_RENDER_CONFIG } from "../config/VisualRenderConfig";
import { PALETTE_HEX } from "../materials/PaletteTokens";

type Point = { x: number; z: number };
type OccupiedPlot = Point & { cropId: string; rotationRadians: number };
type FarmGuide = {
  group: THREE.Group;
  occupied: THREE.Mesh;
  signature: string;
};

/** Soil membership and crop space are hints; only FarmingDomain can accept a placement. */
export class FarmPlantingGuide {
  public readonly group = new THREE.Group();
  private readonly guides = new Map<string, FarmGuide>();
  private readonly soilMaterial = material(PALETTE_HEX.foliage_coastal_sun_01, CANONICAL_RENDER_CONFIG.plantingGuide.soilTintOpacity);
  private readonly edgeMaterial = material(PALETTE_HEX.foam_warm_01, CANONICAL_RENDER_CONFIG.plantingGuide.outlineOpacity);
  private readonly occupiedMaterial = material(PALETTE_HEX.accent_ochre_01, CANONICAL_RENDER_CONFIG.plantingGuide.occupiedOpacity);

  constructor() {
    this.group.name = "farm_planting_guide";
    this.group.visible = false;
  }

  public update(state: GameState, active: boolean): void {
    this.group.visible = active;
    if (!active) return;
    const range = CANONICAL_RENDER_CONFIG.plantingGuide.nearbyFarmDistanceMeters;
    for (const farm of Object.values(state.farms)) {
      const layout = getFarmLayout(farm.id);
      if (!layout) continue;
      const x = state.player.x - layout.origin.x;
      const z = state.player.z - layout.origin.z;
      const dx = Math.max(layout.farmBounds.minX - x, 0, x - layout.farmBounds.maxX);
      const dz = Math.max(layout.farmBounds.minZ - z, 0, z - layout.farmBounds.maxZ);
      const nearby = dx * dx + dz * dz <= range * range;
      let guide = this.guides.get(farm.id);
      if (!nearby) {
        if (guide) guide.group.visible = false;
        continue;
      }
      if (!guide) {
        guide = this.createGuide(layout);
        this.guides.set(farm.id, guide);
        this.group.add(guide.group);
      }
      guide.group.visible = true;
      const crops = farm.placedCropIds.flatMap((id) => {
        const crop = state.crops[id];
        return crop ? [{ ...farmLocalToWorld(farm.id, crop), cropId: crop.cropId, rotationRadians: crop.rotationRadians }] : [];
      });
      // Growth, weather and pointer motion cannot invalidate these static ground buffers.
      const signature = crops.map((crop) => `${crop.cropId}:${crop.x}:${crop.z}:${crop.rotationRadians}`).join("|");
      if (signature === guide.signature) continue;
      const decorations = (layout.visualCropDecorations ?? []).map((crop) => ({
        ...farmLocalToWorld(farm.id, crop), cropId: crop.cropId, rotationRadians: crop.rotationRadians
      }));
      const geometry = occupiedGeometry([...crops, ...decorations]);
      guide.occupied.geometry.dispose();
      guide.occupied.geometry = geometry;
      guide.occupied.visible = geometry.getAttribute("position").count > 0;
      guide.signature = signature;
    }
  }

  public dispose(): void {
    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    });
    this.guides.clear();
    this.soilMaterial.dispose();
    this.edgeMaterial.dispose();
    this.occupiedMaterial.dispose();
    this.group.removeFromParent();
  }

  private createGuide(layout: FarmLayoutDefinition): FarmGuide {
    const fill: number[] = [];
    const edges: number[] = [];
    for (const area of layout.plantableAreas) {
      const corners = [
        { x: area.minX, z: area.minZ }, { x: area.maxX, z: area.minZ },
        { x: area.maxX, z: area.maxZ }, { x: area.minX, z: area.maxZ }
      ].map((point) => farmLocalToWorld(layout.farmId, point));
      const columns = Math.ceil((area.maxX - area.minX) / 0.8);
      const rows = Math.ceil((area.maxZ - area.minZ) / 0.8);
      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          const x0 = layout.origin.x + THREE.MathUtils.lerp(area.minX, area.maxX, column / columns);
          const x1 = layout.origin.x + THREE.MathUtils.lerp(area.minX, area.maxX, (column + 1) / columns);
          const z0 = layout.origin.z + THREE.MathUtils.lerp(area.minZ, area.maxZ, row / rows);
          const z1 = layout.origin.z + THREE.MathUtils.lerp(area.minZ, area.maxZ, (row + 1) / rows);
          for (const point of [{ x: x0, z: z0 }, { x: x1, z: z1 }, { x: x1, z: z0 },
            { x: x0, z: z0 }, { x: x0, z: z1 }, { x: x1, z: z1 }]) pushGround(fill, point);
        }
      }
      for (let edge = 0; edge < 4; edge++) {
        // Short segments follow the terrain; a long straight line would disappear under a slope.
        const a = corners[edge]!;
        const b = corners[(edge + 1) % 4]!;
        const count = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.6);
        for (let segment = 0; segment < count; segment++) {
          ribbon(edges, interpolate(a, b, segment / count), interpolate(a, b, (segment + 1) / count), 0.045);
        }
      }
    }
    const group = new THREE.Group();
    group.name = `planting_soil:${layout.farmId}`;
    group.add(mesh(geometry(fill), this.soilMaterial, "planting_soil_fill"));
    group.add(mesh(geometry(edges), this.edgeMaterial, "planting_soil_edges"));
    const occupied = mesh(geometry([]), this.occupiedMaterial, "planting_crop_spacing");
    group.add(occupied);
    return { group, occupied, signature: "unbuilt" };
  }
}

function occupiedGeometry(crops: readonly OccupiedPlot[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const segments = CANONICAL_RENDER_CONFIG.plantingGuide.spacingRingSegments;
  for (const crop of crops) {
    const definition = ContentRegistry.crops.get(crop.cropId);
    if (!definition) continue;
    const { width, depth } = definition.footprint;
    const radius = Math.max(width, depth) * 0.5;
    for (let index = 0; index < segments; index++) {
      const a = index / segments * Math.PI * 2;
      const b = (index + 1) / segments * Math.PI * 2;
      ribbon(positions,
        { x: crop.x + Math.cos(a) * radius, z: crop.z + Math.sin(a) * radius },
        { x: crop.x + Math.cos(b) * radius, z: crop.z + Math.sin(b) * radius }, 0.035);
    }
    const cos = Math.cos(crop.rotationRadians), sin = Math.sin(crop.rotationRadians);
    const corners = [[-width / 2, -depth / 2], [width / 2, -depth / 2],
      [width / 2, depth / 2], [-width / 2, depth / 2]].map(([x, z]) => ({
      x: crop.x + x! * cos - z! * sin, z: crop.z + x! * sin + z! * cos
    }));
    for (let edge = 0; edge < 4; edge++) ribbon(positions, corners[edge]!, corners[(edge + 1) % 4]!, 0.018);
  }
  return geometry(positions);
}

function interpolate(a: Point, b: Point, t: number): Point {
  return { x: THREE.MathUtils.lerp(a.x, b.x, t), z: THREE.MathUtils.lerp(a.z, b.z, t) };
}

function ribbon(positions: number[], a: Point, b: Point, width: number): void {
  const length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  const x = -(b.z - a.z) / length * width / 2;
  const z = (b.x - a.x) / length * width / 2;
  const points = [{ x: a.x + x, z: a.z + z }, { x: b.x + x, z: b.z + z },
    { x: b.x - x, z: b.z - z }, { x: a.x - x, z: a.z - z }];
  for (const index of [0, 1, 2, 0, 2, 3]) pushGround(positions, points[index]!);
}

function pushGround(positions: number[], point: Point): void {
  positions.push(point.x, WorldLayout.terrainHeight(point.x, point.z) + 0.09, point.z);
}

function geometry(positions: number[]): THREE.BufferGeometry {
  const result = new THREE.BufferGeometry();
  result.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  result.computeBoundingSphere();
  return result;
}

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, name: string): THREE.Mesh {
  const result = new THREE.Mesh(geometry, material);
  result.name = name;
  result.renderOrder = 3;
  result.raycast = () => undefined;
  return result;
}

function material(color: string, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, opacity, transparent: true, depthWrite: false,
    side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
}
