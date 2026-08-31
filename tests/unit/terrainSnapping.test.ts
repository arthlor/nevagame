import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  TerrainSnappingSystem,
  calculateSlopeDegrees,
  isSlopeAcceptable,
  alignNormalToSurface,
  snapToTerrain
} from "../../src/layout-editor/TerrainSnapping";
import { WorldLayout } from "../../src/world/WorldLayout";

describe("Terrain Snapping & Surface Alignment (TerrainSnapping.ts)", () => {
  describe("Slope and Normal Calculations", () => {
    it("calculates accurate slope angles in degrees from normal vectors", () => {
      // Flat ground (normal pointing straight up)
      const flatNormal = new THREE.Vector3(0, 1, 0);
      expect(calculateSlopeDegrees(flatNormal)).toBeCloseTo(0.0, 4);

      // 45-degree slope
      const slope45 = new THREE.Vector3(1, 1, 0).normalize();
      expect(calculateSlopeDegrees(slope45)).toBeCloseTo(45.0, 4);

      // Vertical wall (90-degree slope)
      const wallNormal = new THREE.Vector3(1, 0, 0);
      expect(calculateSlopeDegrees(wallNormal)).toBeCloseTo(90.0, 4);

      // Gentle slope (normal y = 0.95 -> ~18.19 degrees)
      const gentleNormal = new THREE.Vector3(0.3122, 0.95, 0).normalize();
      expect(calculateSlopeDegrees(gentleNormal)).toBeCloseTo(18.19, 1);
    });

    it("evaluates slope acceptability against configurable threshold", () => {
      const flatNormal = new THREE.Vector3(0, 1, 0);
      expect(isSlopeAcceptable(flatNormal, 35)).toBe(true);

      const steepNormal = new THREE.Vector3(1, 1, 0).normalize(); // 45 deg
      expect(isSlopeAcceptable(steepNormal, 35)).toBe(false);
      expect(isSlopeAcceptable(steepNormal, 50)).toBe(true);
    });

    it("aligns Object3D quaternion to surface normal while preserving yaw", () => {
      const object = new THREE.Object3D();
      object.rotation.y = Math.PI / 4; // 45 deg yaw

      const slopeNormal = new THREE.Vector3(0.5, 0.866, 0).normalize(); // tilted surface
      alignNormalToSurface(object, slopeNormal, true);

      // Transformed object up vector should match target normal
      const objectUp = new THREE.Vector3(0, 1, 0).applyQuaternion(object.quaternion);
      expect(objectUp.x).toBeCloseTo(slopeNormal.x, 3);
      expect(objectUp.y).toBeCloseTo(slopeNormal.y, 3);
      expect(objectUp.z).toBeCloseTo(slopeNormal.z, 3);
    });
  });

  describe("BVH-Accelerated Terrain Snapping System", () => {
    it("registers a synthetic terrain mesh, constructs BVH, and raycasts accurate contact points", () => {
      // Build a synthetic slope plane geometry
      const geometry = new THREE.PlaneGeometry(100, 100, 10, 10);
      geometry.rotateX(-Math.PI / 2); // lie horizontal in XZ plane

      // Elevate center vertices
      const posAttr = geometry.attributes.position!;
      for (let i = 0; i < posAttr.count; i++) {
        const x = posAttr.getX(i);
        // Height formula: y = 5 + 0.1*x
        posAttr.setY(i, 5.0 + 0.1 * x);
      }
      geometry.computeVertexNormals();

      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
      mesh.position.set(0, 0, 0);
      mesh.updateMatrixWorld(true);

      const snapper = new TerrainSnappingSystem();
      snapper.registerTerrain(mesh);

      expect(mesh.geometry.boundsTree).toBeDefined();
      expect(snapper.getTerrainMesh()).toBe(mesh);

      // Snap at world coordinate (10, 20)
      const hit = snapper.snapToSurface(10, 20);
      expect(hit).not.toBeNull();
      expect(hit.source).toBe("bvh");
      expect(hit.point.x).toBeCloseTo(10, 2);
      expect(hit.point.z).toBeCloseTo(20, 2);
      expect(hit.point.y).toBeCloseTo(6.0, 1); // 5 + 0.1*10 = 6.0
      expect(hit.worldNormal.y).toBeGreaterThan(0.9);
      expect(hit.isSlopeAcceptable).toBe(true);
    });

    it("transforms local triangle normal into world space using NormalMatrix", () => {
      const geometry = new THREE.PlaneGeometry(20, 20, 2, 2);
      geometry.rotateX(-Math.PI / 2);
      geometry.computeVertexNormals();

      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
      // Rotate mesh around Z axis by 30 degrees (tilt surface)
      mesh.rotation.z = Math.PI / 6;
      mesh.updateMatrixWorld(true);

      const snapper = new TerrainSnappingSystem();
      snapper.registerTerrain(mesh);

      const hit = snapper.snapToSurface(0, 0);
      expect(hit).not.toBeNull();
      expect(hit.worldNormal.x).not.toBeCloseTo(0, 1);
      expect(hit.worldNormal.y).toBeCloseTo(Math.cos(Math.PI / 6), 2);
    });

    it("falls back to analytical WorldLayout traversal grid when mesh is unregistered", () => {
      const snapper = new TerrainSnappingSystem(); // No terrain mesh registered

      const sampleX = -65;
      const sampleZ = -55;
      const expectedHeight = WorldLayout.traversalSurfaceSample(sampleX, sampleZ).height;

      const hit = snapper.snapToSurface(sampleX, sampleZ);
      expect(hit.source).toBe("analytical-grid");
      expect(hit.point.x).toBe(sampleX);
      expect(hit.point.z).toBe(sampleZ);
      expect(hit.point.y).toBeCloseTo(expectedHeight, 4);
    });

    it("snaps a Vector3 in place using functional snapToTerrain helper", () => {
      const pos = new THREE.Vector3(0, 999, 0);
      const hit = snapToTerrain(pos, false, { yOffset: 0.25 });

      expect(pos.x).toBe(0);
      expect(pos.z).toBe(0);
      expect(pos.y).toBeCloseTo(hit.point.y, 4);
      expect(hit.worldNormal).toBeDefined();
    });
  });
});
