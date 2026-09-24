import * as THREE from "three";
import { afterEach, describe, expect, it } from "vitest";
import { CANONICAL_RENDER_CONFIG } from "../../src/render/config/VisualRenderConfig";
import { createWeatherMotionSignal } from "../../src/render/motion/WeatherMotionSignal";
import { meadowColorUniforms } from "../../src/render/vegetation/MeadowColorField";
import {
  buildMeadowBladeGeometry,
  MEADOW_FIELD_PROGRAM_CACHE_KEY,
  MeadowField,
  meadowBladeTriangles,
  meadowFieldLevel,
  meadowTileDetail,
  patchMeadowFieldShader
} from "../../src/render/vegetation/MeadowField";
import { createUniformMeadowPatchData } from "../../src/render/vegetation/MeadowFieldSource";

const FIELD = CANONICAL_RENDER_CONFIG.meadow.field;
const fields: MeadowField[] = [];

function uniformField(density = 1, center = { x: 0, z: 0 }): MeadowField {
  const field = new MeadowField("high");
  fields.push(field);
  field.addPatchData(createUniformMeadowPatchData(
    { id: "test.meadow", islandId: "island.test", center, sizeMeters: 160, resolution: 40 },
    { density, meadowShare: 0.3, dry: 0, damp: 0 },
    FIELD.exclusionTexelMeters
  ));
  field.build([]);
  return field;
}

function cameraAt(position: THREE.Vector3, target: THREE.Vector3): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 400);
  camera.position.copy(position);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  return camera;
}

function submittedTiles(field: MeadowField): Array<{ detail: "near" | "far"; x: number; z: number }> {
  const tiles: Array<{ detail: "near" | "far"; x: number; z: number }> = [];
  const matrix = new THREE.Matrix4();
  for (const mesh of field.group.children as THREE.InstancedMesh[]) {
    for (let index = 0; index < mesh.count; index += 1) {
      mesh.getMatrixAt(index, matrix);
      tiles.push({ detail: mesh.name.endsWith("_near") ? "near" : "far", x: matrix.elements[12], z: matrix.elements[14] });
    }
  }
  return tiles;
}

function nearestDistance(tile: { x: number; z: number }, anchor: { x: number; z: number }): number {
  const size = FIELD.tileSizeMeters;
  const x = Math.min(Math.max(anchor.x, tile.x), tile.x + size);
  const z = Math.min(Math.max(anchor.z, tile.z), tile.z + size);
  return Math.hypot(x - anchor.x, z - anchor.z);
}

afterEach(() => {
  for (const field of fields.splice(0)) field.dispose();
});

describe("meadow blade geometry", () => {
  it("builds tapered strips closed by one tip vertex with in-range blade data", () => {
    const geometry = buildMeadowBladeGeometry(12, 3);
    const position = geometry.getAttribute("position");
    expect(position.count).toBe(12 * 7);
    expect(geometry.getIndex()!.count).toBe(12 * meadowBladeTriangles(3) * 3);
    expect(meadowBladeTriangles(3)).toBe(5);
    expect(meadowBladeTriangles(2)).toBe(3);
    const index = geometry.getIndex()!;
    for (let cursor = 0; cursor < index.count; cursor += 1) {
      expect(index.getX(cursor)).toBeLessThan(position.count);
      // Every triangle stays inside one blade.
      expect(Math.floor(index.getX(cursor) / 7)).toBe(Math.floor(index.getX(cursor - (cursor % 3)) / 7));
    }
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      expect(position.getX(vertex)).toBeGreaterThanOrEqual(0);
      expect(position.getX(vertex)).toBeLessThanOrEqual(1);
      expect(Math.abs(position.getY(vertex))).toBeLessThanOrEqual(1);
      expect(position.getZ(vertex)).toBe(Math.floor(vertex / 7));
    }
    expect(position.getX(6)).toBe(1);
    expect(position.getY(6)).toBe(0);
    geometry.dispose();
  });
});

describe("meadow field membership", () => {
  it("chooses tile detail by player distance and drops tiles past the carpet radius", () => {
    const level = meadowFieldLevel(2);
    expect(meadowTileDetail(0, level)).toBe("near");
    expect(meadowTileDetail(level.nearRadius + FIELD.nearFadeMeters, level)).toBe("near");
    expect(meadowTileDetail(level.nearRadius + FIELD.nearFadeMeters + 0.01, level)).toBe("far");
    expect(meadowTileDetail(level.radius + 0.01, level)).toBeNull();
  });

  it("submits near tiles around the player, far tiles beyond, and nothing past the radius", () => {
    const field = uniformField();
    const anchor = { x: 3, z: -2 };
    field.update(anchor.x, anchor.z);
    field.updateRenderVisibility(cameraAt(new THREE.Vector3(3, 60, -2.01), new THREE.Vector3(3, 0, -2)));
    const tiles = submittedTiles(field);
    const level = field.currentLevel();
    expect(tiles.some((tile) => tile.detail === "near")).toBe(true);
    expect(tiles.some((tile) => tile.detail === "far")).toBe(true);
    for (const tile of tiles) {
      const distance = nearestDistance(tile, anchor);
      expect(distance).toBeLessThanOrEqual(level.radius);
      if (tile.detail === "near") expect(distance).toBeLessThanOrEqual(level.nearRadius + FIELD.nearFadeMeters);
      else expect(distance).toBeGreaterThan(level.nearRadius + FIELD.nearFadeMeters);
      expect(tile.x / FIELD.tileSizeMeters).toBe(Math.round(tile.x / FIELD.tileSizeMeters));
    }
    // The shared colour field learns where live blades stand.
    expect(meadowColorUniforms.nevaMeadowField.value.toArray()).toEqual([3, -2, level.radius, FIELD.outerFadeMeters]);
  });

  it("culls tiles behind the camera without changing player-anchored membership", () => {
    const field = uniformField();
    field.update(0, 0);
    const lookingNorth = cameraAt(new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, 1, -10));
    field.updateRenderVisibility(lookingNorth);
    const north = submittedTiles(field);
    expect(north.length).toBeGreaterThan(0);
    expect(north.every((tile) => tile.z < 4)).toBe(true);
    const lookingSouth = cameraAt(new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, 1, 10));
    field.updateRenderVisibility(lookingSouth);
    const south = submittedTiles(field);
    expect(south.every((tile) => tile.z > -8)).toBe(true);
    field.updateRenderVisibility(lookingNorth);
    expect(submittedTiles(field)).toEqual(north);
  });

  it("keeps empty ground off the GPU", () => {
    const field = uniformField(0);
    field.update(0, 0);
    field.updateRenderVisibility(cameraAt(new THREE.Vector3(0, 60, 0.01), new THREE.Vector3(0, 0, 0)));
    expect(submittedTiles(field)).toEqual([]);
    expect(field.group.children.every((mesh) => !mesh.visible)).toBe(true);
  });

  it("draws a stable density prefix per tier and stages shadow receiving with the tier", () => {
    const field = uniformField();
    const [near, far] = field.group.children as THREE.InstancedMesh[];
    field.setQualityLevel(2);
    const high = meadowFieldLevel(2);
    expect(near.geometry.drawRange.count).toBe(high.nearBlades * meadowBladeTriangles(FIELD.nearSegments) * 3);
    expect(far.geometry.drawRange.count).toBe(high.farBlades * meadowBladeTriangles(FIELD.farSegments) * 3);
    expect(near.receiveShadow).toBe(true);
    field.setQualityLevel(0);
    const low = meadowFieldLevel(0);
    expect(near.geometry.drawRange.count).toBe(low.nearBlades * meadowBladeTriangles(FIELD.nearSegments) * 3);
    expect(near.geometry.drawRange.count).toBeLessThan(high.nearBlades * meadowBladeTriangles(FIELD.nearSegments) * 3);
    expect(near.receiveShadow).toBe(false);
    expect(near.castShadow).toBe(false);
    expect(far.castShadow).toBe(false);
  });

  it("never lets a picking ray hit the shader-only blade strip", () => {
    const field = uniformField();
    field.update(0, 0);
    field.updateRenderVisibility(cameraAt(new THREE.Vector3(0, 60, 0.01), new THREE.Vector3(0, 0, 0)));
    const raycaster = new THREE.Raycaster(new THREE.Vector3(0, 10, 0), new THREE.Vector3(0, -1, 0));
    expect(raycaster.intersectObject(field.group, true)).toEqual([]);
  });

  it("drives wind, presence and time through shared uniforms", () => {
    const field = uniformField();
    const material = (field.group.children[0] as THREE.InstancedMesh).material as THREE.MeshStandardMaterial;
    const shader = {
      uniforms: { ...THREE.ShaderLib.standard.uniforms } as Record<string, { value: unknown }>,
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader
    };
    (material.onBeforeCompile as unknown as (source: typeof shader) => void)(shader);
    field.updateWind({ ...createWeatherMotionSignal(), normalizedStrength: 1, directionX: 1, directionZ: 0 }, 12.5, 0.5, { x: 4, z: 5, moving: true });
    expect(shader.uniforms.meadowTime.value).toBe(12.5);
    expect((shader.uniforms.meadowWindDir.value as THREE.Vector2).toArray()).toEqual([1, 0]);
    expect(shader.uniforms.meadowWindStrength.value).toBeGreaterThan(1);
    expect(shader.uniforms.meadowMotionScale.value).toBe(0.5);
    expect((shader.uniforms.meadowPresence.value as THREE.Vector4).toArray().slice(0, 3)).toEqual([4, 5, 1]);
    expect(shader.uniforms.nevaMeadowPatch).toBe(meadowColorUniforms.nevaMeadowPatch);
    expect(meadowColorUniforms.nevaMeadowPatch.value.toArray()).toEqual([...CANONICAL_RENDER_CONFIG.meadow.field.patchResponse]);
  });
});

describe("meadow field shader", () => {
  it("builds blades in the vertex stage and keeps both faces on the up-biased normal", () => {
    const shader = {
      uniforms: {} as Record<string, unknown>,
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader
    };
    patchMeadowFieldShader(shader, { meadowTime: { value: 0 } });
    expect(shader.vertexShader).toContain("vec3 transformed = meadowLocalPosition;");
    expect(shader.vertexShader).toContain("objectNormal = normalize(mix(rounded, terrainNormal, meadowShading.x));");
    expect(shader.vertexShader).toContain("nevaLandscapeGust(rootXZ, windDirection, meadowTime)");
    expect(shader.vertexShader).toContain("nevaMeadowSample(rootXZ, cover.g, cover.b, cover.a)");
    expect(shader.vertexShader).toContain("mix(nevaMeadowPatch.x, 1.0, meadowColor.growth)");
    expect(shader.vertexShader).not.toContain("#include <begin_vertex>");
    expect(shader.fragmentShader).toContain("normal = normalize(vNormal);");
    expect(shader.fragmentShader).toContain("#define RE_Direct RE_Direct_Meadow");
    expect(shader.fragmentShader).toContain("diffuseColor.rgb = meadowBladeColor;");
    expect(shader.uniforms.meadowTime).toBeDefined();
  });

  it("fails loudly when a patched standard chunk drifts", () => {
    const shader = {
      uniforms: {},
      vertexShader: "void main() { #include <common> #include <begin_vertex> }",
      fragmentShader: THREE.ShaderLib.standard.fragmentShader
    };
    expect(() => patchMeadowFieldShader(shader, {})).toThrow(/shader chunk drift/);
  });

  it("uses one stable program across islands and composes the shared world atmosphere", () => {
    const field = uniformField();
    const material = (field.group.children[0] as THREE.InstancedMesh).material as THREE.MeshStandardMaterial;
    expect(material.side).toBe(THREE.DoubleSide);
    expect(material.customProgramCacheKey()).toContain(MEADOW_FIELD_PROGRAM_CACHE_KEY);
    expect(material.customProgramCacheKey()).toContain("world-atmosphere");
  });

  it("releases its meshes, geometries, textures and materials", () => {
    const field = uniformField();
    const meshes = [...field.group.children] as THREE.InstancedMesh[];
    const disposed: string[] = [];
    for (const mesh of meshes) {
      mesh.geometry.addEventListener("dispose", () => disposed.push("geometry"));
      (mesh.material as THREE.Material).addEventListener("dispose", () => disposed.push("material"));
    }
    field.dispose();
    fields.splice(fields.indexOf(field), 1);
    expect(field.group.children).toEqual([]);
    expect(disposed.filter((entry) => entry === "geometry").length).toBeGreaterThanOrEqual(2);
    expect(disposed).toContain("material");
    expect(meadowColorUniforms.nevaMeadowField.value.z).toBe(0);
  });
});
