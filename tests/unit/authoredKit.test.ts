import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  SurfaceBuilder, addCollisionMarkers, addMarker, assembleLodLevels, cyclicTrack, lodDetail, solveSagittalChain,
  tokenLinearColor, tokenMaterial, type CatalogAssetSpec
} from "../../tools/authored/kit";

/** Every triangle of a mesh group, as [a, b, c] vertex positions plus its stored-normal average. */
function triangles(mesh: THREE.Mesh): Array<{ corners: THREE.Vector3[]; normal: THREE.Vector3; group: number }> {
  const geometry = mesh.geometry;
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const index = geometry.getIndex()!;
  const result: Array<{ corners: THREE.Vector3[]; normal: THREE.Vector3; group: number }> = [];
  geometry.groups.forEach((group, groupIndex) => {
    for (let corner = group.start; corner < group.start + group.count; corner += 3) {
      const ids = [index.getX(corner), index.getX(corner + 1), index.getX(corner + 2)];
      const corners = ids.map((id) => new THREE.Vector3().fromBufferAttribute(position, id));
      const stored = ids.reduce((sum, id) => sum.add(new THREE.Vector3().fromBufferAttribute(normal, id)), new THREE.Vector3());
      result.push({ corners, normal: stored.normalize(), group: groupIndex });
    }
  });
  return result;
}

function windingNormal([a, b, c]: THREE.Vector3[]): THREE.Vector3 {
  return new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
}

describe("authored kit surfaces", () => {
  it("winds every loft face outward from its path, caps included", () => {
    const builder = new SurfaceBuilder(["wood_warm_01"]);
    builder.addLoft([
      { p: [0, 0, 0], w: 0.2, h: 0.1 },
      { p: [0, 0.2, 0.3], w: 0.3, h: 0.15, hb: 0.2 },
      { p: [0, 0.1, 0.7], w: 0.1, h: 0.08 }
    ], { sides: 8, ref: [0, 1, 0], capStart: 0, capEnd: 0.8, token: 0 });
    const mesh = builder.buildMesh("loft");
    const centre = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());
    for (const { corners, normal } of triangles(mesh)) {
      const winding = windingNormal(corners);
      const centroid = corners.reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(1 / 3);
      // A convex-ish tube: every face looks away from the solid's centre and agrees with its normals.
      expect(winding.dot(centroid.clone().sub(centre))).toBeGreaterThan(0);
      expect(winding.dot(normal)).toBeGreaterThan(0);
    }
  });

  it("closes a cloth panel so both faces point away from the cloth", () => {
    const builder = new SurfaceBuilder(["cloth_rust_01"]);
    builder.addPanel({
      cols: 4, rows: 3, thickness: 0.02,
      point: (u, v) => new THREE.Vector3(u - 0.5, -v, 0),
      token: () => 0
    });
    const faces = triangles(builder.buildMesh("panel"));
    const front = faces.filter(({ corners }) => corners.every((p) => p.z > 0.009));
    const back = faces.filter(({ corners }) => corners.every((p) => p.z < -0.009));
    expect(front.length).toBe(4 * 3 * 2);
    expect(back.length).toBe(4 * 3 * 2);
    for (const face of front) expect(windingNormal(face.corners).z).toBeGreaterThan(0.99);
    for (const face of back) expect(windingNormal(face.corners).z).toBeLessThan(-0.99);
    // Rim walls close the slab: two triangles per boundary edge.
    expect(faces.length - front.length - back.length).toBe(2 * 2 * (4 + 3));
  });

  it("paints markings per quad, splits vertices at a marking edge and keeps the normal continuous", () => {
    const builder = new SurfaceBuilder(["soil_dry_01", "wood_dark_01"]);
    builder.addLoft([
      { p: [0, 0, 0], w: 0.2, h: 0.2 },
      { p: [0, 0, 0.5], w: 0.2, h: 0.2 },
      { p: [0, 0, 1], w: 0.2, h: 0.2 }
    ], { sides: 8, ref: [0, 1, 0], token: ({ normal }) => (normal.y > 0.3 ? 1 : 0) });
    const mesh = builder.buildMesh("marked");
    const geometry = mesh.geometry;
    expect(geometry.groups.map((group) => group.materialIndex)).toEqual([0, 1]);
    // Quads never split between tokens: each group holds whole quads.
    for (const group of geometry.groups) expect(group.count % 6).toBe(0);

    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    const colour = geometry.getAttribute("color");
    const index = geometry.getIndex()!;
    const tokenOf = new Map<number, number>();
    geometry.groups.forEach((group) => {
      for (let i = group.start; i < group.start + group.count; i += 1) tokenOf.set(index.getX(i), group.materialIndex!);
    });
    const coat = tokenLinearColor("soil_dry_01");
    const saddle = tokenLinearColor("wood_dark_01");
    const byPosition = new Map<string, number[]>();
    for (const [vertex, token] of tokenOf) {
      const expected = token === 0 ? coat : saddle;
      expect(colour.getX(vertex)).toBeCloseTo(expected.r, 5);
      expect(colour.getY(vertex)).toBeCloseTo(expected.g, 5);
      expect(colour.getZ(vertex)).toBeCloseTo(expected.b, 5);
      const key = [position.getX(vertex), position.getY(vertex), position.getZ(vertex)].map((x) => x.toFixed(5)).join();
      byPosition.set(key, [...(byPosition.get(key) ?? []), vertex]);
    }
    const shared = [...byPosition.values()].filter((vertices) => new Set(vertices.map((v) => tokenOf.get(v))).size > 1);
    expect(shared.length).toBeGreaterThan(0);
    for (const [first, ...rest] of shared) {
      for (const other of rest) {
        expect(normal.getX(other)).toBeCloseTo(normal.getX(first), 6);
        expect(normal.getY(other)).toBeCloseTo(normal.getY(first), 6);
        expect(normal.getZ(other)).toBeCloseTo(normal.getZ(first), 6);
      }
    }
  });

  it("shares one white, vertex-coloured material per palette token", () => {
    const material = tokenMaterial("cloth_teal_01");
    expect(tokenMaterial("cloth_teal_01")).toBe(material);
    expect(material.name).toBe("cloth_teal_01");
    expect(material.vertexColors).toBe(true);
    expect(material.color.getHex()).toBe(0xffffff);
    expect(() => tokenMaterial("not_a_token")).toThrow("Unknown palette token");
  });
});

describe("authored kit rigs and markers", () => {
  it("names collision markers the way the runtime and the Blender generators do", () => {
    const parent = new THREE.Group();
    const spec = {
      id: "prop_test_a", collision: "box",
      collisionPrimitives: [
        { id: "main", center: [0, 1, 0], halfExtents: [1, 1, 1] },
        { id: "step", center: [0, 0.1, 1], halfExtents: [0.5, 0.1, 0.2], yawDegrees: 90 }
      ]
    } as unknown as CatalogAssetSpec;
    const markers = addCollisionMarkers(spec, parent);
    expect(markers.map((marker) => marker.name)).toEqual(["COL_prop_test_a", "COL_prop_test_a_step"]);
    expect(markers[1].rotation.y).toBeCloseTo(Math.PI / 2, 6);
    expect(() => addCollisionMarkers({ ...spec, collision: "none" }, parent)).toThrow("nonblocking");
  });

  it("tags a typed point marker the way Blender's add_marker does", () => {
    const marker = addMarker("rod_line_exit", [0, 2.2, 0.05], "line_exit", new THREE.Group());
    expect(marker.position.toArray()).toEqual([0, 2.2, 0.05]);
    expect(marker.userData.neva_marker).toBe("line_exit");
  });

  it("closes looping gait tracks exactly and solves planar limb chains", () => {
    const track = cyclicTrack("leg", [[0, -20], [0.5, 20]], 0.25, 1);
    const first = track.values.slice(0, 4);
    const last = track.values.slice(-4);
    for (let i = 0; i < 4; i += 1) expect(last[i]).toBeCloseTo(first[i], 9);
    expect(track.times[0]).toBe(0);
    expect(track.times[track.times.length - 1]).toBe(1);

    // A straight-down segment rotated to point straight forward is a quarter turn about X.
    const [rotation] = solveSagittalChain([[-1, 0]], [[0, 1]], 0);
    expect(Math.abs(rotation)).toBeCloseTo(90, 6);
  });
});

describe("authored kit LOD levels", () => {
  it("builds one sibling node per catalog level, each owning only its own detail", () => {
    const spec = {
      id: "tree_test_a",
      lodLevels: [
        { node: "tree_test_a_LOD0", distanceMeters: 0, triangleRatioMin: 1, triangleRatioMax: 1 },
        { node: "tree_test_a_LOD1", distanceMeters: 40, triangleRatioMin: 0.3, triangleRatioMax: 0.6 }
      ]
    } as unknown as CatalogAssetSpec;
    const parent = new THREE.Group();
    const built: number[] = [];
    const nodes = assembleLodLevels(spec, parent, (level) => {
      built.push(level);
      const builder = new SurfaceBuilder(["wood_warm_01"]);
      builder.addLoft([{ p: [0, 0, 0], w: 0.2, h: 0.2 }, { p: [0, 1, 0], w: 0.1, h: 0.1 }], {
        sides: lodDetail(12, level), ref: [0, 0, 1], token: 0
      });
      return builder.buildMesh(`trunk_${level}`);
    });
    expect(built).toEqual([0, 1]);
    expect(nodes.map((node) => node.name)).toEqual(["tree_test_a_LOD0", "tree_test_a_LOD1"]);
    expect(nodes.every((node) => node.parent === parent)).toBe(true);
    const triangles = nodes.map((node) => {
      let count = 0;
      node.traverse((child) => { if ((child as THREE.Mesh).isMesh) count += (child as THREE.Mesh).geometry.getIndex()!.count / 3; });
      return count;
    });
    expect(triangles[1] / triangles[0]).toBeGreaterThan(0.3);
    expect(triangles[1] / triangles[0]).toBeLessThan(0.6);
    expect(() => assembleLodLevels({ ...spec, lodLevels: [] }, parent, () => new THREE.Group())).toThrow("lodLevels");
  });
});

describe("authored kit profiles and shade", () => {
  it("sweeps a custom section and chamfers a box without changing its outline", () => {
    const builder = new SurfaceBuilder(["wood_warm_01"]);
    builder.addBox([0, 0, 0], [0, 0, 1], [0.1, 0.05], { token: 0, bevel: 0.02 });
    const mesh = builder.buildMesh("plank");
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox!;
    expect(box.max.x - box.min.x).toBeCloseTo(0.2, 6);
    expect(box.max.y - box.min.y).toBeCloseTo(0.1, 6);
    // Eight sides plus two flat eight-fan caps, every face wound outward.
    const faces = triangles(mesh);
    expect(faces).toHaveLength(32);
    for (const { corners } of faces) {
      const centroid = corners[0].clone().add(corners[1]).add(corners[2]).divideScalar(3);
      const geometric = corners[1].clone().sub(corners[0]).cross(corners[2].clone().sub(corners[0]));
      const outward = Math.abs(geometric.clone().normalize().z) > 0.9
        ? new THREE.Vector3(0, 0, centroid.z - 0.5)
        : new THREE.Vector3(centroid.x, centroid.y, 0);
      expect(geometric.dot(outward)).toBeGreaterThan(0);
    }
  });

  it("closes a wrapped panel into a tube with rims only at its open ends", () => {
    const ring = (wrap: boolean): THREE.Mesh => {
      const builder = new SurfaceBuilder(["metal_brass_01"]);
      builder.addPanel({
        cols: 8, rows: 1, thickness: 0.01, wrap,
        point: (u, v) => new THREE.Vector3(Math.cos(u * Math.PI * 2) * 0.1, v * 0.05, Math.sin(u * Math.PI * 2) * 0.1),
        token: () => 0
      });
      return builder.buildMesh("ring");
    };
    // Two sheets of 8 cells, plus rim walls: open, round all four sides of the strip; wrapped, only
    // along the top and bottom, with no seam where column 8 meets column 0.
    expect(triangles(ring(false))).toHaveLength(8 * 4 + (8 + 8 + 1 + 1) * 2);
    const faces = triangles(ring(true));
    expect(faces).toHaveLength(8 * 4 + (8 + 8) * 2);
    for (const { corners } of faces) expect(Math.min(...corners.map((c) => Math.hypot(c.x, c.z)))).toBeGreaterThan(0.09);
  });

  it("darkens COLOR_0 as a value mask per face, clamped to the pipeline contract", () => {
    const builder = new SurfaceBuilder(["wood_warm_01"]);
    builder.addLoft([{ p: [0, 0, 0], w: 0.1, h: 0.1 }, { p: [0, 1, 0], w: 0.1, h: 0.1 }], {
      sides: 4, ref: [0, 0, 1], token: 0, shade: ({ theta }) => (Math.cos(theta) > 0 ? 0.8 : 0.1)
    });
    const colour = builder.buildMesh("post").geometry.getAttribute("color");
    const token = tokenLinearColor("wood_warm_01");
    const values = new Set<number>();
    for (let i = 0; i < colour.count; i += 1) {
      const value = colour.getX(i) / token.r;
      expect(colour.getY(i)).toBeCloseTo(token.g * value, 6);
      expect(colour.getZ(i)).toBeCloseTo(token.b * value, 6);
      values.add(Math.round(value * 100) / 100);
    }
    expect([...values].sort()).toEqual([0.72, 0.8]);
  });
});
