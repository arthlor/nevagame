import { runSync } from "../utils/CooperativeTask";
import * as THREE from "three";

interface RoadTerrainGrid {
  sizeMeters: number;
  resolution: number;
  centerX?: number;
  centerZ?: number;
  heightAt: (x: number, z: number) => number;
}

// Interpolating the whole vertex keeps the authored shoulder/color field intact
// when a road face crosses a terrain cell or the two supporting planes meet.
// Position and RGBA come first; any further per-vertex attributes the source
// carries (the road frame and class) follow in `EXTRA_ATTRIBUTES` order. They
// are linear across a source triangle, so the split keeps them exact.
type RoadVertex = number[] & { sourceEdge?: readonly [RoadVertex, RoadVertex]; sourceCorner?: boolean };
type ClipPlane = (vertex: RoadVertex) => number;

const EXTRA_ATTRIBUTES = ["roadFrame", "roadClass", "normal"] as const;

const CLIP_EPSILON = 1e-9;

function clipPolygon(polygon: readonly RoadVertex[], distance: ClipPlane): RoadVertex[] {
  const result: RoadVertex[] = [];
  for (let index = 0; index < polygon.length; index++) {
    const previous = polygon[(index + polygon.length - 1) % polygon.length];
    const current = polygon[index];
    const previousRawDistance = distance(previous);
    const currentRawDistance = distance(current);
    const previousDistance = Math.abs(previousRawDistance) <= CLIP_EPSILON ? 0 : previousRawDistance;
    const currentDistance = Math.abs(currentRawDistance) <= CLIP_EPSILON ? 0 : currentRawDistance;
    const previousInside = previousDistance >= 0;
    const currentInside = currentDistance >= 0;
    if (previousInside !== currentInside) {
      const amount = previousDistance / (previousDistance - currentDistance);
      const cut = previous.map((value, component) =>
        value + (current[component] - value) * amount
      ) as RoadVertex;
      const edge = previous.sourceEdge;
      const currentEdge = current.sourceEdge;
      // Keep the source-edge datum through successive grid/height cuts. Its
      // two incident planes must evaluate a rounded cut from the same line.
      if (edge && (edge.includes(current) || (currentEdge && edge.includes(currentEdge[0]) && edge.includes(currentEdge[1])))) cut.sourceEdge = edge;
      else if (currentEdge && currentEdge.includes(previous)) cut.sourceEdge = currentEdge;
      else if (previous.sourceCorner && current.sourceCorner) cut.sourceEdge = [previous, current];
      result.push(cut);
    }
    if (currentInside) result.push(current);
  }
  return result;
}

function areaTwice(a: RoadVertex, b: RoadVertex, c: RoadVertex): number {
  return (b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0]);
}

/**
 * Makes the shared road/collider mesh follow the upper of its authored surface
 * and the rendered/Rapier base-terrain triangles. Endpoint height samples alone
 * are insufficient: a coarse terrain face can pass through a road's interior.
 * Splitting at both grids and plane intersections removes those cutouts without
 * lowering the crown or the explicit bridge entry, or adding a depth offset.
 * The collision envelope is unchanged: max(base, max(road, base)) is still
 * max(base, road). Only the overlapping surfaces are made explicit in the mesh.
 */
export function conformRoadGeometryToTerrain(
  source: THREE.BufferGeometry,
  grid: RoadTerrainGrid
): THREE.BufferGeometry {
  return runSync(roadTerrainConformitySteps(source, grid));
}

export function* roadTerrainConformitySteps(source: THREE.BufferGeometry, grid: RoadTerrainGrid): Generator<void, THREE.BufferGeometry, void> {
  const sourcePositions = source.getAttribute("position");
  const sourceColors = source.getAttribute("color");
  const sourceIndex = source.getIndex();
  const sourceNodeHeights = new Map<string, number>();
  for (let index = 0; index < sourcePositions.count; index++) {
    const key = `${sourcePositions.getX(index)},${sourcePositions.getZ(index)}`;
    sourceNodeHeights.set(key, Math.max(sourceNodeHeights.get(key) ?? -Infinity, sourcePositions.getY(index)));
  }
  if (!sourceIndex || sourceColors.itemSize !== 4) {
    throw new Error("Road terrain conformity requires the indexed RGBA road geometry");
  }

  const extras = EXTRA_ATTRIBUTES.flatMap((name) => {
    const attribute = source.getAttribute(name);
    return attribute ? [{ name, attribute, values: [] as number[] }] : [];
  });
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  let vertexCache = new Map<string, number>();
  const cellSize = grid.sizeMeters / grid.resolution;
  const minimumX = (grid.centerX ?? 0) - grid.sizeMeters * 0.5;
  const minimumZ = (grid.centerZ ?? 0) - grid.sizeMeters * 0.5;
  const maximumX = minimumX + grid.sizeMeters;
  const maximumZ = minimumZ + grid.sizeMeters;
  const stride = grid.resolution + 1;
  const heightCache = new Map<number, number>();
  const roadTriangleEnd = source.userData.roadTriangleCount as number;
  const junctionTriangleEnd = roadTriangleEnd + (source.userData.junctionTriangleCount as number);
  const counts = { road: 0, junction: 0, gateway: 0 };
  let gatewayVertexStart = 0;

  const gridHeight = (column: number, row: number): number => {
    const key = row * stride + column;
    const cached = heightCache.get(key);
    if (cached !== undefined) return cached;
    // PlaneGeometry and its height attribute store float32, not the original
    // analytic doubles. Use those same samples for exact surface agreement.
    const x = Math.fround(minimumX + column * cellSize);
    const z = Math.fround(minimumZ + row * cellSize);
    const height = Math.fround(grid.heightAt(x, z));
    heightCache.set(key, height);
    return height;
  };

  const appendVertex = (vertex: RoadVertex): number => {
    const quantized = vertex.map(Math.fround) as RoadVertex;
    const key = quantized.join(",");
    const existing = vertexCache.get(key);
    if (existing !== undefined) return existing;
    const index = positions.length / 3;
    positions.push(quantized[0], quantized[1], quantized[2]);
    colors.push(quantized[3], quantized[4], quantized[5], quantized[6]);
    let offset = 7;
    for (const extra of extras) {
      for (let component = 0; component < extra.attribute.itemSize; component++) {
        extra.values.push(quantized[offset++]);
      }
    }
    vertexCache.set(key, index);
    return index;
  };

  const appendTriangle = (a: RoadVertex, b: RoadVertex, c: RoadVertex, kind: keyof typeof counts): void => {
    const area = areaTwice(a, b, c);
    if (area === 0) return;
    const ai = appendVertex(a), bi = appendVertex(b), ci = appendVertex(c);
    // Up-facing winding in X/Z, including newly clipped contours.
    if (area > 0) indices.push(ai, ci, bi);
    else indices.push(ai, bi, ci);
    counts[kind]++;
  };

  const appendPolygon = (
    polygon: readonly RoadVertex[],
    kind: keyof typeof counts,
    heightAt?: (x: number, z: number, vertex: RoadVertex) => number
  ): void => {
    if (polygon.length < 3) return;
    const projected = polygon.map((vertex) => {
      const result = vertex.slice() as RoadVertex;
      result[0] = Math.fround(result[0]);
      result[2] = Math.fround(result[2]);
      if (heightAt) result[1] = heightAt(result[0], result[2], vertex);
      return result;
    }).filter((vertex, index, all) => !index || vertex[0] !== all[index - 1][0] || vertex[2] !== all[index - 1][2]);
    if (projected.length > 1 && projected[0][0] === projected.at(-1)![0] && projected[0][2] === projected.at(-1)![2]) projected.pop();
    if (projected.length < 3) return;
    let signedArea = 0;
    for (let index = 1; index < projected.length - 1; index++) signedArea += areaTwice(projected[0], projected[index], projected[index + 1]);
    const orientation = Math.sign(signedArea);
    const convex = orientation !== 0 && projected.every((vertex, index) => areaTwice(vertex, projected[(index + 1) % projected.length], projected[(index + 2) % projected.length]) * orientation >= 0);
    // Rounding an added cut to Float32 can turn a collinear contour locally
    // concave. A fan would then stack a skinny face on its neighbour. Partition
    // the final contour; keep the common convex case allocation-light.
    if (convex) {
      for (let index = 1; index < projected.length - 1; index++) appendTriangle(projected[0], projected[index], projected[index + 1], kind);
    } else {
      const triangles = THREE.ShapeUtils.triangulateShape(projected.map(vertex => new THREE.Vector2(vertex[0], vertex[2])), []);
      for (const [a, b, c] of triangles) appendTriangle(projected[a], projected[b], projected[c], kind);
    }
  };

  for (let triangle = 0; triangle < sourceIndex.count / 3; triangle++) {
    if (triangle % 32 === 0) yield;
    const vertices = [0, 1, 2].map((corner): RoadVertex => {
      const index = sourceIndex.getX(triangle * 3 + corner);
      const vertex: RoadVertex = [
        sourcePositions.getX(index), sourcePositions.getY(index), sourcePositions.getZ(index),
        sourceColors.getX(index), sourceColors.getY(index), sourceColors.getZ(index), sourceColors.getW(index)
      ];
      for (const extra of extras) {
        for (let component = 0; component < extra.attribute.itemSize; component++) {
          vertex.push(extra.attribute.getComponent(index, component));
        }
      }
      vertex.sourceCorner = true;
      return vertex;
    });
    const kind = triangle < roadTriangleEnd ? "road" : triangle < junctionTriangleEnd ? "junction" : "gateway";
    const [roadA, roadB, roadC] = vertices;
    const roadDxB = roadB[0] - roadA[0], roadDzB = roadB[2] - roadA[2], roadDyB = roadB[1] - roadA[1];
    const roadDxC = roadC[0] - roadA[0], roadDzC = roadC[2] - roadA[2], roadDyC = roadC[1] - roadA[1];
    const roadDeterminant = roadDxB * roadDzC - roadDzB * roadDxC;
    const roadGradientX = (roadDyB * roadDzC - roadDyC * roadDzB) / roadDeterminant;
    const roadGradientZ = (roadDxB * roadDyC - roadDxC * roadDyB) / roadDeterminant;
    const roadHeight = (x: number, z: number, vertex: RoadVertex): number => {
      // A rounded new cut can coincide with an existing source contact. That
      // authored datum takes precedence over projection along another edge.
      const sourceHeight = sourceNodeHeights.get(`${x},${z}`);
      if (sourceHeight !== undefined) return sourceHeight;
      if (vertex.sourceCorner) return vertex[1];
      if (vertex.sourceEdge) {
        let [a, b] = vertex.sourceEdge;
        if (a[0] > b[0] || (a[0] === b[0] && a[2] > b[2])) [a, b] = [b, a];
        const dx = b[0] - a[0], dz = b[2] - a[2];
        const amount = THREE.MathUtils.clamp(((x - a[0]) * dx + (z - a[2]) * dz) / (dx * dx + dz * dz), 0, 1);
        return a[1] + amount * (b[1] - a[1]);
      }
      return roadA[1] + (x - roadA[0]) * roadGradientX + (z - roadA[2]) * roadGradientZ;
    };
    const triangleMinimumX = Math.min(...vertices.map((vertex) => vertex[0]));
    const triangleMaximumX = Math.max(...vertices.map((vertex) => vertex[0]));
    const triangleMinimumZ = Math.min(...vertices.map((vertex) => vertex[2]));
    const triangleMaximumZ = Math.max(...vertices.map((vertex) => vertex[2]));
    if (
      triangleMaximumX < minimumX
      || triangleMinimumX > maximumX
      || triangleMaximumZ < minimumZ
      || triangleMinimumZ > maximumZ
    ) continue;
    if (kind === "gateway") {
      if (counts.gateway === 0) {
        gatewayVertexStart = positions.length / 3;
        // Keep the gateway's existing contiguous vertex range inspectable even
        // if an identically colored road vertex touches a slab corner.
        vertexCache = new Map();
      }
      appendPolygon(vertices, kind);
      continue;
    }

    const firstColumn = Math.max(0, Math.floor((triangleMinimumX - minimumX) / cellSize));
    const lastColumn = Math.min(grid.resolution - 1, Math.floor((triangleMaximumX - minimumX) / cellSize));
    const firstRow = Math.max(0, Math.floor((triangleMinimumZ - minimumZ) / cellSize));
    const lastRow = Math.min(grid.resolution - 1, Math.floor((triangleMaximumZ - minimumZ) / cellSize));

    const sections: Array<{ polygon: RoadVertex[]; heightAt: (x: number, z: number) => number; differences: number[] }> = [];
    let requiresDrape = false;
    for (let row = firstRow; row <= lastRow; row++) {
      for (let column = firstColumn; column <= lastColumn; column++) {
        const x0 = minimumX + column * cellSize;
        const z0 = minimumZ + row * cellSize;
        let cell = clipPolygon(vertices, (vertex) => vertex[0] - x0);
        cell = clipPolygon(cell, (vertex) => x0 + cellSize - vertex[0]);
        cell = clipPolygon(cell, (vertex) => vertex[2] - z0);
        cell = clipPolygon(cell, (vertex) => z0 + cellSize - vertex[2]);
        if (cell.length < 3) continue;

        const a = gridHeight(column, row);
        const b = gridHeight(column, row + 1);
        const c = gridHeight(column + 1, row + 1);
        const d = gridHeight(column + 1, row);
        for (const firstHalf of [true, false]) {
          const half = clipPolygon(cell, (vertex) =>
            (firstHalf ? -1 : 1) * (vertex[0] + vertex[2] - x0 - z0 - cellSize)
          );
          if (half.length < 3) continue;
          const terrainHeight = (x: number, z: number): number => {
            const u = (x - x0) / cellSize;
            const v = (z - z0) / cellSize;
            return firstHalf
              ? a + u * (d - a) + v * (b - a)
              : c + (1 - u) * (b - c) + (1 - v) * (d - c);
          };
          const terrainAboveRoad = (vertex: RoadVertex): number => terrainHeight(vertex[0], vertex[2]) - vertex[1];
          const differences = half.map(terrainAboveRoad);
          requiresDrape ||= differences.some(difference => difference > CLIP_EPSILON);
          sections.push({ polygon: half, heightAt: terrainHeight, differences });
        }
      }
    }
    // Grid lines have no geometric role when every terrain plane remains
    // below this face. Retain its exact authored plane rather than rounding
    // redundant cuts through thin ownership triangles.
    if (!requiresDrape && triangleMinimumX >= minimumX && triangleMaximumX <= maximumX && triangleMinimumZ >= minimumZ && triangleMaximumZ <= maximumZ) {
      appendPolygon(vertices, kind);
    } else for (const section of sections) {
      const upperHeight = (x: number, z: number, vertex: RoadVertex): number => Math.max(roadHeight(x, z, vertex), section.heightAt(x, z));
      const terrainAboveRoad = (vertex: RoadVertex): number => section.heightAt(vertex[0], vertex[2]) - vertex[1];
      if (section.differences.every(difference => difference >= -CLIP_EPSILON) || section.differences.every(difference => difference <= CLIP_EPSILON)) {
        appendPolygon(section.polygon, kind, upperHeight);
      } else {
        appendPolygon(clipPolygon(section.polygon, terrainAboveRoad), kind, upperHeight);
        appendPolygon(clipPolygon(section.polygon, vertex => -terrainAboveRoad(vertex)), kind, upperHeight);
      }
    }
  }

  // Independent source planes can round separate contour cuts to the same
  // stored X/Z. That stored contact has one upper-envelope height, even when
  // colors/frames require distinct vertices. Canonicalize only coincident
  // contacts; do not sample a different road or terrain surface here.
  const coincidentHeights = new Map<string, number>();
  const roadVertexEnd = counts.gateway ? gatewayVertexStart : positions.length / 3;
  for (let index = 0; index < roadVertexEnd; index++) {
    const key = `${positions[index * 3]},${positions[index * 3 + 2]}`;
    coincidentHeights.set(key, Math.max(coincidentHeights.get(key) ?? -Infinity, positions[index * 3 + 1]));
  }
  let maximumCoincidentHeightLiftMeters = 0;
  for (let index = 0; index < roadVertexEnd; index++) {
    const key = `${positions[index * 3]},${positions[index * 3 + 2]}`;
    const height = coincidentHeights.get(key)!;
    maximumCoincidentHeightLiftMeters = Math.max(maximumCoincidentHeightLiftMeters, height - positions[index * 3 + 1]);
    positions[index * 3 + 1] = height;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 4));
  for (const extra of extras) {
    geometry.setAttribute(extra.name, new THREE.Float32BufferAttribute(extra.values, extra.attribute.itemSize));
  }
  geometry.setIndex(indices);
  // Shade with the road's own crowned surface. Where a coarse terrain face
  // rises above the ribbon near its edge the split follows that face, and its
  // tilted normal drew light wedges along the road; the carried normal keeps
  // the lighting on the road's smooth form. Positions still follow the terrain.
  const carried = geometry.getAttribute("normal");
  if (carried) {
    for (let index = 0; index < carried.count; index++) {
      const length = Math.hypot(carried.getX(index), carried.getY(index), carried.getZ(index)) || 1;
      carried.setXYZ(index, carried.getX(index) / length, carried.getY(index) / length, carried.getZ(index) / length);
    }
  } else {
    geometry.computeVertexNormals();
  }
  // COLOR_0 may split an otherwise shared vertex. Smooth those coincident
  // corners together so the new terrain-cell boundaries do not become facets.
  const normals = geometry.getAttribute("normal");
  const sharedNormals = new Map<string, THREE.Vector3>();
  for (let index = 0; index < positions.length / 3; index++) {
    const key = `${positions[index * 3]},${positions[index * 3 + 1]},${positions[index * 3 + 2]}`;
    const normal = sharedNormals.get(key) ?? new THREE.Vector3();
    normal.x += normals.getX(index);
    normal.y += normals.getY(index);
    normal.z += normals.getZ(index);
    sharedNormals.set(key, normal);
  }
  for (const normal of sharedNormals.values()) normal.normalize();
  for (let index = 0; index < positions.length / 3; index++) {
    const key = `${positions[index * 3]},${positions[index * 3 + 1]},${positions[index * 3 + 2]}`;
    const normal = sharedNormals.get(key)!;
    normals.setXYZ(index, normal.x, normal.y, normal.z);
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData = {
    ...source.userData,
    roadTriangleCount: counts.road,
    junctionTriangleCount: counts.junction,
    bridgeGatewayTriangleCount: counts.gateway,
    bridgeGatewayVertexStart: gatewayVertexStart,
    bridgeGatewayVertexCount: positions.length / 3 - gatewayVertexStart,
    terrainConformity: {
      sourceTriangleCount: sourceIndex.count / 3,
      sourceRoadTriangleCount: roadTriangleEnd,
      sourceJunctionTriangleCount: junctionTriangleEnd - roadTriangleEnd,
      triangleCount: indices.length / 3,
      sampledTerrainVertices: heightCache.size,
      maximumCoincidentHeightLiftMeters
    }
  };
  return geometry;
}
