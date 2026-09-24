import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import * as THREE from "three";
import {
  WORLD_FIELD_OVERLAYS,
  createWorldDiagnosticOverlay
} from "../../src/render/scene/WorldDiagnosticOverlay";
import {
  HEADWATER_GRAYBOX_ENVELOPE,
  HEADWATER_GRAYBOX_VIEWPOINTS
} from "../../src/world/HeadwaterWaterfallGraybox";
import { WorldLayout } from "../../src/world/WorldLayout";
import { resolveArtViewPreset } from "../../src/app/GameApp";

const REPO_ROOT = join(__dirname, "..", "..");
const GRAYBOX_IMPORT_ALLOWLIST = new Set([
  "src/app/GameApp.ts",
  "src/persistence/migrateHeadwaterFall47.ts",
  "src/persistence/migrateHeadwaterSpring55.ts",
  "src/render/scene/WorldDiagnosticOverlay.ts"
]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name))
    .map((entry) => join(entry.parentPath ?? directory, entry.name));
}

function meshVertices(mesh: THREE.Mesh): THREE.Vector3[] {
  const position = mesh.geometry.getAttribute("position");
  const vertices: THREE.Vector3[] = [];
  for (let index = 0; index < position.count; index += 1) {
    vertices.push(new THREE.Vector3().fromBufferAttribute(position, index));
  }
  return vertices;
}

function findMesh(group: THREE.Group, name: string): THREE.Mesh {
  const found = group.getObjectByName(name);
  expect(found, name).toBeInstanceOf(THREE.Mesh);
  return found as THREE.Mesh;
}

function disposeOverlay(group: THREE.Group): void {
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const material = object.material;
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
    else material.dispose();
  });
}

describe("W05 graybox review surface", () => {
  it("registers the graybox envelope as a DEV field overlay", () => {
    expect(WORLD_FIELD_OVERLAYS).toContain("graybox-envelope");
  });

  it("draws the local geometry envelope and continuity band on live terrain", () => {
    const group = createWorldDiagnosticOverlay("graybox-envelope", 42);
    expect(group.name).toBe("world-field-overlay:graybox-envelope");

    const envelope = HEADWATER_GRAYBOX_ENVELOPE;
    const margin = envelope.continuityMarginMeters;
    const envelopeBand = findMesh(group, "graybox-envelope:local-envelope");
    const continuityBand = findMesh(group, "graybox-envelope:continuity-band");

    const envelopeBox = new THREE.Box3().setFromObject(envelopeBand);
    expect(envelopeBox.min.x).toBeLessThanOrEqual(envelope.minX + 0.001);
    expect(envelopeBox.max.x).toBeGreaterThanOrEqual(envelope.maxX - 0.001);
    expect(envelopeBox.min.z).toBeLessThanOrEqual(envelope.minZ + 0.001);
    expect(envelopeBox.max.z).toBeGreaterThanOrEqual(envelope.maxZ - 0.001);

    const continuityBox = new THREE.Box3().setFromObject(continuityBand);
    expect(continuityBox.min.x).toBeLessThanOrEqual(envelope.minX - margin + 0.001);
    expect(continuityBox.max.x).toBeGreaterThanOrEqual(envelope.maxX + margin - 0.001);
    expect(continuityBox.min.z).toBeLessThanOrEqual(envelope.minZ - margin + 0.001);
    expect(continuityBox.max.z).toBeGreaterThanOrEqual(envelope.maxZ + margin - 0.001);

    // The band follows the rendered terrain instead of floating as one plane.
    for (const vertex of meshVertices(envelopeBand)) {
      expect(vertex.y).toBeGreaterThanOrEqual(WorldLayout.terrainHeight(vertex.x, vertex.z));
    }
    const bandHeights = meshVertices(envelopeBand).map((vertex) => vertex.y);
    expect(Math.max(...bandHeights) - Math.min(...bandHeights)).toBeGreaterThan(1);

    for (const name of [
      "graybox-envelope:locked-source",
      "graybox-envelope:locked-handoff",
      "graybox-envelope:fall-lip",
      "graybox-envelope:fall-landing"
    ]) {
      const marker = findMesh(group, name);
      expect(marker.position.y).toBeCloseTo(
        WorldLayout.terrainHeight(marker.position.x, marker.position.z),
        5
      );
    }
    const source = findMesh(group, "graybox-envelope:locked-source");
    const handoff = findMesh(group, "graybox-envelope:locked-handoff");
    expect(source.position.x).toBe(envelope.lockedSourceXZ.x);
    expect(source.position.z).toBe(envelope.lockedSourceXZ.z);
    expect(handoff.position.z).toBe(envelope.lockedHandoffZ);

    disposeOverlay(group);
  });

  it("derives every W05 review preset from the viewpoint owner", () => {
    const ids = new Set(HEADWATER_GRAYBOX_VIEWPOINTS.map((viewpoint) => viewpoint.artViewId));
    expect(ids.size).toBe(HEADWATER_GRAYBOX_VIEWPOINTS.length);

    for (const viewpoint of HEADWATER_GRAYBOX_VIEWPOINTS) {
      const preset = resolveArtViewPreset(viewpoint.artViewId);
      expect(preset, viewpoint.artViewId).toBeDefined();
      expect(preset!.cameraPosition).toEqual({
        x: viewpoint.cameraPosition.x,
        y: viewpoint.cameraPosition.y,
        z: viewpoint.cameraPosition.z
      });
      expect(preset!.cameraTarget).toEqual({
        x: viewpoint.targetPosition.x,
        y: viewpoint.targetPosition.y,
        z: viewpoint.targetPosition.z
      });
      // The avatar stands on valid ground along the view axis — never at the
      // camera (which would put the lens inside the model), never in water.
      const pose = preset!.playerPose;
      expect(WorldLayout.isWater(pose.x, pose.z), `${viewpoint.artViewId} pose in water`).toBe(false);
      expect(WorldLayout.isWalkable(pose.x, pose.z), viewpoint.artViewId).toBe(true);
      expect(WorldLayout.terrainNormalY(pose.x, pose.z)).toBeGreaterThanOrEqual(0.7);
      const axisX = viewpoint.targetPosition.x - viewpoint.cameraPosition.x;
      const axisZ = viewpoint.targetPosition.z - viewpoint.cameraPosition.z;
      const axisLength = Math.hypot(axisX, axisZ);
      const alongAxis = ((pose.x - viewpoint.cameraPosition.x) * axisX
        + (pose.z - viewpoint.cameraPosition.z) * axisZ) / axisLength;
      const lateral = Math.hypot(
        pose.x - (viewpoint.cameraPosition.x + (axisX / axisLength) * alongAxis),
        pose.z - (viewpoint.cameraPosition.z + (axisZ / axisLength) * alongAxis)
      );
      // Either in front of the stance or behind it, but never inside the lens.
      expect(Math.abs(alongAxis), `${viewpoint.artViewId} pose at the camera`).toBeGreaterThanOrEqual(1.75);
      expect(Math.abs(alongAxis)).toBeLessThanOrEqual(4.01);
      expect(lateral).toBeLessThan(0.05);
      expect(preset!.playerPose.y).toBeCloseTo(
        WorldLayout.traversalSurfaceHeight(pose.x, pose.z) + 1.7,
        5
      );
    }

    expect(resolveArtViewPreset("not-a-view")).toBeUndefined();
  });

  it("keeps the review surface out of the live geography owners", () => {
    const offenders = sourceFiles(join(REPO_ROOT, "src"))
      .filter((file) => readFileSync(file, "utf8").includes("HeadwaterWaterfallGraybox"))
      .map((file) => relative(REPO_ROOT, file).split("\\").join("/"))
      .filter((file) => !GRAYBOX_IMPORT_ALLOWLIST.has(file));
    expect(offenders).toEqual([]);
  });
});
