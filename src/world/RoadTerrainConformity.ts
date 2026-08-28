import * as THREE from "three";

interface RoadTerrainGrid {
  sizeMeters: number;
  resolution: number;
  heightAt: (x: number, z: number) => number;
}

// Interpolating the whole vertex keeps the authored shoulder/color field intact
// when a road face crosses a terrain cell or the two supporting planes meet.
type RoadVertex = [x: number, y: number, z: number, r: number, g: number, b: number, a: number];
type ClipPlane = (vertex: RoadVertex) => number;

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
      result.push(previous.map((value, component) =>
        value + (current[component] - value) * amount
      ) as RoadVertex);
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
  const sourcePositions = source.getAttribute("position");
  const sourceColors = source.getAttribute("color");
  const sourceIndex = source.getIndex();
  if (!sourceIndex || sourceColors.itemSize !== 4) {
    throw new Error("Road terrain conformity requires the indexed RGBA road geometry");
  }

  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  let vertexCache = new Map<string, number>();
  const cellSize = grid.sizeMeters / grid.resolution;
  const minimum = -grid.sizeMeters * 0.5;
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
    const x = Math.fround(minimum + column * cellSize);
    const z = Math.fround(minimum + row * cellSize);
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
    vertexCache.set(key, index);
    return index;
  };

  const appendPolygon = (
    polygon: readonly RoadVertex[],
    kind: keyof typeof counts,
    heightAt?: (x: number, z: number) => number
  ): void => {
    if (polygon.length < 3) return;
    const projected = polygon.map((vertex) => {
      const result = vertex.slice() as RoadVertex;
      result[0] = Math.fround(result[0]);
      result[2] = Math.fround(result[2]);
      if (heightAt) result[1] = heightAt(result[0], result[2]);
      return result;
    });
    for (let index = 1; index < projected.length - 1; index++) {
      const a = projected[0];
      const b = projected[index];
      const c = projected[index + 1];
      const area = areaTwice(a, b, c);
      if (Math.abs(area) <= CLIP_EPSILON) continue;
      const ai = appendVertex(a);
      const bi = appendVertex(b);
      const ci = appendVertex(c);
      // Up-facing winding in X/Z, including newly clipped polygon fans.
      if (area > 0) indices.push(ai, ci, bi);
      else indices.push(ai, bi, ci);
      counts[kind]++;
    }
  };

  for (let triangle = 0; triangle < sourceIndex.count / 3; triangle++) {
    const vertices = [0, 1, 2].map((corner): RoadVertex => {
      const index = sourceIndex.getX(triangle * 3 + corner);
      return [
        sourcePositions.getX(index), sourcePositions.getY(index), sourcePositions.getZ(index),
        sourceColors.getX(index), sourceColors.getY(index), sourceColors.getZ(index), sourceColors.getW(index)
      ];
    });
    const kind = triangle < roadTriangleEnd ? "road" : triangle < junctionTriangleEnd ? "junction" : "gateway";
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

    const firstColumn = Math.max(0, Math.floor((Math.min(...vertices.map((vertex) => vertex[0])) - minimum) / cellSize));
    const lastColumn = Math.min(grid.resolution - 1, Math.floor((Math.max(...vertices.map((vertex) => vertex[0])) - minimum) / cellSize));
    const firstRow = Math.max(0, Math.floor((Math.min(...vertices.map((vertex) => vertex[2])) - minimum) / cellSize));
    const lastRow = Math.min(grid.resolution - 1, Math.floor((Math.max(...vertices.map((vertex) => vertex[2])) - minimum) / cellSize));

    for (let row = firstRow; row <= lastRow; row++) {
      for (let column = firstColumn; column <= lastColumn; column++) {
        const x0 = minimum + column * cellSize;
        const z0 = minimum + row * cellSize;
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
          if (differences.every((difference) => difference >= -CLIP_EPSILON)) {
            appendPolygon(half, kind, terrainHeight);
          } else if (differences.every((difference) => difference <= CLIP_EPSILON)) {
            appendPolygon(half, kind);
          } else {
            appendPolygon(clipPolygon(half, terrainAboveRoad), kind, terrainHeight);
            appendPolygon(clipPolygon(half, (vertex) => -terrainAboveRoad(vertex)), kind);
          }
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
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
      sampledTerrainVertices: heightCache.size
    }
  };
  return geometry;
}
