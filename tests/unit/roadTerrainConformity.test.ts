import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { conformRoadGeometryToTerrain } from "../../src/world/RoadTerrainConformity";

type Point = [number, number];
type Vertex = [number, number, number];

function sourceGeometry(vertices: readonly Vertex[], gateway = false): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices.flat(), 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(vertices.flatMap(([x, , z]) => [0.4 + x * 0.001, 0.5 + z * 0.01, 0.6, 0.75]), 4));
  geometry.setAttribute("roadFrame", new THREE.Float32BufferAttribute(vertices.flatMap(([x, , z]) => [x, z]), 2));
  geometry.setAttribute("roadClass", new THREE.Float32BufferAttribute(vertices.map(() => 1), 1));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(vertices.flatMap(() => [0, 1, 0]), 3));
  const [a, b, c] = vertices;
  const area = (b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0]);
  geometry.setIndex(area > 0 ? [0, 2, 1] : [0, 1, 2]);
  geometry.userData = { roadTriangleCount: gateway ? 0 : 1, junctionTriangleCount: 0, bridgeGatewayTriangleCount: gateway ? 1 : 0 };
  return geometry;
}

function triangles(geometry: THREE.BufferGeometry): Vertex[][] {
  const positions = geometry.getAttribute("position"), indices = geometry.getIndex()!;
  return Array.from({ length: indices.count / 3 }, (_, triangle) => [0, 1, 2].map(corner => {
    const index = indices.getX(triangle * 3 + corner);
    return [positions.getX(index), positions.getY(index), positions.getZ(index)] as Vertex;
  }));
}

function cross(a: Point, b: Point, c: Point): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function polygonArea(points: readonly Point[]): number {
  let doubled = 0;
  for (let index = 1; index < points.length - 1; index++) doubled += cross(points[0], points[index], points[index + 1]);
  return Math.abs(doubled) * 0.5;
}

// Independent convex clipping measures interior overlap rather than counting
// boundary contacts, including the sub-micrometre faces in the regression.
function overlapArea(first: readonly Vertex[], second: readonly Vertex[]): number {
  let polygon = first.map(([x, , z]): Point => [x, z]);
  const clip = second.map(([x, , z]): Point => [x, z]);
  const orientation = Math.sign(cross(clip[0], clip[1], clip[2]));
  for (let edge = 0; edge < 3 && polygon.length; edge++) {
    const a = clip[edge], b = clip[(edge + 1) % 3];
    const next: Point[] = [];
    for (let index = 0; index < polygon.length; index++) {
      const previous = polygon[(index + polygon.length - 1) % polygon.length], current = polygon[index];
      const previousDistance = cross(a, b, previous) * orientation, currentDistance = cross(a, b, current) * orientation;
      if ((previousDistance >= 0) !== (currentDistance >= 0)) {
        const amount = previousDistance / (previousDistance - currentDistance);
        next.push([previous[0] + (current[0] - previous[0]) * amount, previous[1] + (current[1] - previous[1]) * amount]);
      }
      if (currentDistance >= 0) next.push(current);
    }
    polygon = next;
  }
  return polygonArea(polygon);
}

function expectDisjointUpwardFaces(geometry: THREE.BufferGeometry): void {
  const faces = triangles(geometry);
  expect(faces.length).toBeGreaterThan(0);
  for (const [index, face] of faces.entries()) {
    expect(face.flat().every(Number.isFinite)).toBe(true);
    const points = face.map(([x, , z]): Point => [x, z]);
    expect(cross(points[0], points[1], points[2])).toBeLessThan(0);
    for (const other of faces.slice(index + 1)) expect(overlapArea(face, other)).toBeLessThan(1e-11);
  }
}

describe("Road terrain conformity", () => {
  it("retains a representable thin face instead of confusing area with clipping-distance tolerance", () => {
    const source = sourceGeometry([
      [-396.6875, 6, 55.15625],
      [-396.6875305175781, 6, 55.15625],
      [-396.6875, 6, 55.156280517578125]
    ]);
    const geometry = conformRoadGeometryToTerrain(source, { sizeMeters: 2, resolution: 2, centerX: -396.5, centerZ: 55, heightAt: () => 1 });
    expect(triangles(geometry)).toEqual(triangles(source));
    expect(geometry.getIndex()!.count).toBe(3);
    expectDisjointUpwardFaces(geometry);
    source.dispose(); geometry.dispose();
  });

  it("keeps an already-supported steep source plane without redundant grid cuts", () => {
    const source = sourceGeometry([
      [-620.4378662109375, 1.5071855783462524, -147.54637145996094],
      [-620.4271850585938, 1.4932689666748047, -147.52610778808594],
      [-621.6927490234375, 1.4204528331756592, -150.14683532714844]
    ]);
    const geometry = conformRoadGeometryToTerrain(source, { sizeMeters: 4, resolution: 4, centerX: -621, centerZ: -149, heightAt: () => 1 });
    expect(triangles(geometry)).toEqual(triangles(source));
    expect(geometry.getIndex()!.count).toBe(3);
    expectDisjointUpwardFaces(geometry);
    source.dispose(); geometry.dispose();
  });

  it("gives adjacent source planes one height at rounded grid contacts while retaining their upper support", () => {
    const source = sourceGeometry([
      [1288.4000244140625, 5.582584381103516, -8.497661590576172],
      [1288.4000244140625, 5.5546088218688965, -8.422239303588867],
      [1288.5712890625, 5.448537349700928, -10.585128784179688],
      [1288.68, 5.45, -8.9]
    ]);
    source.setIndex([0, 2, 1, 1, 3, 2]);
    source.userData.roadTriangleCount = 2;
    const grid = { sizeMeters: 5.625, resolution: 4, centerX: 1288, centerZ: -9, heightAt: () => 5.52 };
    const first = conformRoadGeometryToTerrain(source, grid), second = conformRoadGeometryToTerrain(source, grid);
    expectDisjointUpwardFaces(first);
    const positions = first.getAttribute("position"), contacts = new Map<string, Set<number>>();
    for (let index = 0; index < positions.count; index++) {
      const key = `${positions.getX(index)},${positions.getZ(index)}`, heights = contacts.get(key) ?? new Set<number>();
      heights.add(positions.getY(index)); contacts.set(key, heights);
      expect(positions.getY(index)).toBeGreaterThanOrEqual(Math.fround(5.52) - 0.00002);
    }
    expect([...contacts.values()].every(heights => heights.size === 1)).toBe(true);
    expect(Array.from(first.getIndex()!.array)).toEqual(Array.from(second.getIndex()!.array));
    for (const name of Object.keys(first.attributes)) expect(Array.from(first.getAttribute(name).array)).toEqual(Array.from(second.getAttribute(name).array));
    source.dispose(); first.dispose(); second.dispose();
  });
  it("partitions a contour that becomes reflex when its clipped corners round to Float32", () => {
    // A narrow source face crosses a grid boundary and diagonal. Rounding its
    // five clipped corners creates a reflex corner and collapses one pair;
    // blindly fanning the result stacked a skinny face on its neighbour.
    const source = sourceGeometry([
      [-31.716110229492188, 1.120050311088562, -2.299072742462158],
      [-32.71310043334961, 1, -5.435430526733398],
      [-32.27726364135742, 1.0524803400039673, -4.064371109008789]
    ]);
    const grid = { sizeMeters: 2, resolution: 1, centerX: -32, centerZ: -4, heightAt: () => 1 };
    const first = conformRoadGeometryToTerrain(source, grid), second = conformRoadGeometryToTerrain(source, grid);
    expectDisjointUpwardFaces(first);
    expect(Array.from(first.getIndex()!.array)).toEqual(Array.from(second.getIndex()!.array));
    for (const name of Object.keys(first.attributes)) expect(Array.from(first.getAttribute(name).array)).toEqual(Array.from(second.getAttribute(name).array));
    source.dispose(); first.dispose(); second.dispose();
  });

  it("retains the upper support envelope, area and interpolated attributes across grid and height cuts", () => {
    const source = sourceGeometry([[-0.75, 0.2, -0.75], [0.75, 0.2, -0.75], [0, 0.2, 0.75]]);
    const geometry = conformRoadGeometryToTerrain(source, { sizeMeters: 2, resolution: 2, heightAt: x => 0.1 + x * 0.5 });
    expectDisjointUpwardFaces(geometry);
    let area = 0;
    for (const face of triangles(geometry)) {
      area += polygonArea(face.map(([x, , z]): Point => [x, z]));
      const x = face.reduce((sum, vertex) => sum + vertex[0], 0) / 3, y = face.reduce((sum, vertex) => sum + vertex[1], 0) / 3;
      expect(y).toBeCloseTo(Math.max(Math.fround(0.2), 0.1 + x * 0.5), 6);
    }
    expect(area).toBeCloseTo(1.125, 7);
    const positions = geometry.getAttribute("position"), colors = geometry.getAttribute("color"), frames = geometry.getAttribute("roadFrame"), classes = geometry.getAttribute("roadClass"), normals = geometry.getAttribute("normal");
    for (let index = 0; index < positions.count; index++) {
      const x = positions.getX(index), y = positions.getY(index), z = positions.getZ(index);
      expect(y).toBeCloseTo(Math.max(Math.fround(0.2), 0.1 + x * 0.5), 6);
      expect(colors.getX(index)).toBeCloseTo(0.4 + x * 0.001, 6);
      expect(colors.getY(index)).toBeCloseTo(0.5 + z * 0.01, 6);
      expect(colors.getZ(index)).toBeCloseTo(0.6, 6);
      expect(colors.getW(index)).toBe(0.75);
      expect([frames.getX(index), frames.getY(index)]).toEqual([x, z]);
      expect(classes.getX(index)).toBe(1);
      expect([normals.getX(index), normals.getY(index), normals.getZ(index)]).toEqual([0, 1, 0]);
    }
    source.dispose(); geometry.dispose();
  });

  it("keeps gateway slabs on their authored plane and outside terrain subdivision", () => {
    const source = sourceGeometry([[-0.75, 0.2, -0.75], [0.75, 0.2, -0.75], [0, 0.2, 0.75]], true);
    const geometry = conformRoadGeometryToTerrain(source, { sizeMeters: 2, resolution: 2, heightAt: () => 3 });
    expect(triangles(geometry)).toEqual(triangles(source));
    expect(geometry.userData.bridgeGatewayTriangleCount).toBe(1);
    expect(geometry.userData.roadTriangleCount).toBe(0);
    expect(geometry.userData.bridgeGatewayVertexStart).toBe(0);
    expect(geometry.userData.bridgeGatewayVertexCount).toBe(3);
    expect(geometry.userData.terrainConformity.sampledTerrainVertices).toBe(0);
    source.dispose(); geometry.dispose();
  });
});
