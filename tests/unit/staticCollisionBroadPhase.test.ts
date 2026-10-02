import { describe, expect, it } from "vitest";
import { staticPoseIsClear, type StaticCollisionProxy } from "../../src/physics/StaticCollision";

/** Independent pre-optimization narrow phase, retained as a differential oracle. */
function reference(boxes: readonly StaticCollisionProxy[], point: { x: number; z: number }, ground: number, radius: number): boolean {
  return boxes.every(box => {
    const q = box.rotation;
    const tilted = Math.abs(q.x) > 1e-6 || Math.abs(q.z) > 1e-6;
    const h = box.halfExtents;
    const e = tilted ? {
      x: Math.abs(1 - 2 * (q.y * q.y + q.z * q.z)) * h.x + Math.abs(2 * (q.x * q.y - q.z * q.w)) * h.y + Math.abs(2 * (q.x * q.z + q.y * q.w)) * h.z,
      y: Math.abs(2 * (q.x * q.y + q.z * q.w)) * h.x + Math.abs(1 - 2 * (q.x * q.x + q.z * q.z)) * h.y + Math.abs(2 * (q.y * q.z - q.x * q.w)) * h.z,
      z: Math.abs(2 * (q.x * q.z - q.y * q.w)) * h.x + Math.abs(2 * (q.y * q.z + q.x * q.w)) * h.y + Math.abs(1 - 2 * (q.x * q.x + q.y * q.y)) * h.z
    } : h;
    if (box.center.y + e.y <= ground + 0.3 || box.center.y - e.y >= ground + 1.9) return true;
    const dx = point.x - box.center.x, dz = point.z - box.center.z;
    const yaw = 2 * Math.atan2(q.y, q.w);
    const x = tilted ? dx : dx * Math.cos(yaw) - dz * Math.sin(yaw);
    const z = tilted ? dz : dx * Math.sin(yaw) + dz * Math.cos(yaw);
    const ox = Math.max(0, Math.abs(x) - e.x), oz = Math.max(0, Math.abs(z) - e.z);
    return ox * ox + oz * oz > radius * radius;
  });
}

function box(yaw = 0): StaticCollisionProxy {
  return { kind: "box", id: "test", center: { x: 0, y: 1, z: 0 }, halfExtents: { x: 2, y: 1, z: 1 },
    rotation: { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) } };
}

describe("static collision conservative broad phase", () => {
  it("retains face/corner tangencies, zero-radius contacts and vertical step/head thresholds", () => {
    const b = box();
    for (const ground of [-2, -0.9, 0, 1.7, 2]) {
      for (const radius of [0, 0.4, 0.7, 2, -0.4]) {
        for (const epsilon of [-1e-10, 0, 1e-10]) {
          for (const point of [
            { x: 2 + Math.abs(radius) + epsilon, z: 0 },
            { x: 2 + Math.abs(radius) / Math.SQRT2 + epsilon, z: 1 + Math.abs(radius) / Math.SQRT2 },
            { x: 0, z: 1 + Math.abs(radius) + epsilon },
            { x: 10000, z: -10000 }
          ]) expect(staticPoseIsClear([b], point, ground, radius)).toBe(reference([b], point, ground, radius));
        }
      }
    }
    expect(staticPoseIsClear([b], { x: 2.5, z: 0 }, 0, 0.5)).toBe(false);
    expect(staticPoseIsClear([], { x: 0, z: 0 }, 0, 0.4)).toBe(true);
  });

  it("matches the old query across deterministic yawed, tilted, slender and degenerate boxes", () => {
    let seed = 9472;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 15000; i++) {
      const b = box(random() * Math.PI * 2);
      b.center = { x: random() * 2000 - 1000, y: random() * 8 - 4, z: random() * 2000 - 1000 };
      b.halfExtents = { x: i % 11 === 0 ? 0 : random() * 10, y: random() * 4, z: i % 7 === 0 ? 0 : random() * 10 };
      if (i % 3 === 0) {
        const q = [random() - 0.5, random() - 0.5, random() - 0.5, random() - 0.5];
        const length = Math.hypot(...q);
        b.rotation = { x: q[0] / length, y: q[1] / length, z: q[2] / length, w: q[3] / length };
      }
      const reach = i % 2 ? 40 : 4000;
      const point = { x: b.center.x + (random() - 0.5) * reach, z: b.center.z + (random() - 0.5) * reach };
      const ground = random() * 6 - 3, radius = random() * 2;
      expect(staticPoseIsClear([b], point, ground, radius)).toBe(reference([b], point, ground, radius));
    }
  });

  it("does not cache mutable proxies or change early-blocker behavior", () => {
    const b = box();
    const boxes = [b, box(Math.PI / 4)];
    const point = { x: 100, z: 100 };
    expect(staticPoseIsClear(boxes, point, 0, 0.4)).toBe(true);
    b.center.x = 100; b.center.z = 100;
    expect(staticPoseIsClear(boxes, point, 0, 0.4)).toBe(false);
    boxes.shift();
    expect(staticPoseIsClear(boxes, point, 0, 0.4)).toBe(true);
  });
});
