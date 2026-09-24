import * as THREE from "three";

export type Point2D = [number, number];

/** Flat prism from a 2D profile (sharp corners, square-cut ends). */
export function extrude(points: Point2D[], depth: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) {
    shape.lineTo(points[i][0], points[i][1]);
  }
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 });
}

/** Surface of revolution around +Y (x is clamped off-axis like the lathe needs). */
export function lathe(points: Point2D[], segments = 24): THREE.LatheGeometry {
  const profile = points.map(([x, y]) => new THREE.Vector2(Math.max(0.0001, x), y));
  return new THREE.LatheGeometry(profile, segments);
}
