import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { BoatWakePool } from "../../src/render/water/BoatWakePool";
import { FacetedWater } from "../../src/render/water/FacetedWater";
import { ShoreFoam } from "../../src/render/water/ShoreFoam";

/**
 * Static link check for the water shaders.
 *
 * The other water tests string-match shader source, which cannot tell whether
 * the program would actually compile. That gap shipped a real defect: the
 * near-detail patch's fragment stage called the scrolling-normal helper with
 * `uTime`, but `uTime` is declared in WATER_WAVE_UNIFORMS_GLSL, which is only
 * interpolated into the *vertex* stage. Every high-tier water program failed to
 * compile and the surface rendered as nothing.
 *
 * These assertions reproduce the three things a GLSL linker checks that a
 * substring match cannot, without needing a GL context:
 *
 *   1. every `uName` a stage references is declared in that same stage;
 *   2. every declared `uName` has a matching entry in `material.uniforms`,
 *      so a renamed uniform cannot silently read a default;
 *   3. every `in` the fragment stage consumes is written as an `out` by the
 *      vertex stage, with the same type.
 *
 * The project's uniform naming convention (`u` + CapitalLetter) is what makes
 * (1) and (2) decidable by inspection: it separates our uniforms from the ones
 * three.js injects itself (`modelMatrix`, `cameraPosition`, `projectionMatrix`).
 */

/** Strip comments and preprocessor lines so they cannot supply a declaration. */
function stripNonCode(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/^\s*#.*$/gm, " ");
}

function declaredUniforms(source: string): Set<string> {
  const declarations = new Set<string>();
  const pattern = /\buniform\s+\w+\s+([A-Za-z_]\w*)\s*(?:\[[^\]]*\])?\s*;/g;
  for (const match of stripNonCode(source).matchAll(pattern)) {
    declarations.add(match[1]!);
  }
  return declarations;
}

/** Project-convention uniform references: `u` followed by a capital. */
function referencedUniforms(source: string): Set<string> {
  const references = new Set<string>();
  for (const match of stripNonCode(source).matchAll(/\bu[A-Z]\w*\b/g)) {
    references.add(match[0]);
  }
  return references;
}

/** `out vec3 vWorldPosition;` / `in vec3 vWorldPosition;` → name → type. */
function stageVaryings(source: string, direction: "in" | "out"): Map<string, string> {
  const varyings = new Map<string, string>();
  const pattern = new RegExp(`(?:^|[;{}\\s])${direction}\\s+(\\w+)\\s+([A-Za-z_]\\w*)\\s*;`, "g");
  for (const match of stripNonCode(source).matchAll(pattern)) {
    // Vertex inputs are attributes, not varyings; only `v`-prefixed names are
    // the stage-to-stage contract this check is about.
    if (match[2]!.startsWith("v")) varyings.set(match[2]!, match[1]!);
  }
  return varyings;
}

interface WaterProgram {
  readonly label: string;
  readonly material: THREE.ShaderMaterial;
}

function waterPrograms(): { programs: WaterProgram[]; dispose: () => void } {
  const water = new FacetedWater({ width: 12, depth: 12, segmentsX: 4, segmentsZ: 4 });
  const foam = new ShoreFoam({
    waterProfileMap: water.waterProfileMap,
    waterProfileBounds: water.waterProfileBounds
  });
  // One wake mesh is enough: the pool builds every entry from the same
  // `createDisturbanceMaterial` source.
  const wakes = new BoatWakePool(1);
  const wakeMesh = wakes.group.children[0] as THREE.Mesh<
    THREE.BufferGeometry,
    THREE.ShaderMaterial
  >;
  return {
    programs: [
      { label: "FacetedWater", material: water.mesh.material },
      { label: "NearWaterPatch", material: water.nearPatch.mesh.material },
      { label: "ShoreFoam", material: foam.mesh.material },
      { label: "BoatWakePool", material: wakeMesh.material }
    ],
    dispose: () => {
      wakes.dispose();
      foam.dispose();
      water.dispose();
    }
  };
}

describe("water shader linkage", () => {
  it("declares every uniform each shader stage references", () => {
    const { programs, dispose } = waterPrograms();
    try {
      const undeclared: string[] = [];
      for (const { label, material } of programs) {
        const stages = [
          { stage: "vertex", source: material.vertexShader },
          { stage: "fragment", source: material.fragmentShader }
        ] as const;
        for (const { stage, source } of stages) {
          const declared = declaredUniforms(source);
          for (const reference of referencedUniforms(source)) {
            if (!declared.has(reference)) undeclared.push(`${label}.${stage}: ${reference}`);
          }
        }
      }
      expect(undeclared).toEqual([]);
    } finally {
      dispose();
    }
  });

  it("backs every declared uniform with a value on the material", () => {
    const { programs, dispose } = waterPrograms();
    try {
      const unbacked: string[] = [];
      for (const { label, material } of programs) {
        const declared = new Set([
          ...declaredUniforms(material.vertexShader),
          ...declaredUniforms(material.fragmentShader)
        ]);
        for (const name of declared) {
          // three.js supplies its own built-ins; only check ours.
          if (!/^u[A-Z]/.test(name)) continue;
          if (material.uniforms[name] === undefined) unbacked.push(`${label}: ${name}`);
        }
      }
      expect(unbacked).toEqual([]);
    } finally {
      dispose();
    }
  });

  it("matches fragment-stage varyings to vertex-stage outputs", () => {
    const { programs, dispose } = waterPrograms();
    try {
      const mismatched: string[] = [];
      for (const { label, material } of programs) {
        const produced = stageVaryings(material.vertexShader, "out");
        const consumed = stageVaryings(material.fragmentShader, "in");
        for (const [name, type] of consumed) {
          const producedType = produced.get(name);
          if (producedType === undefined) {
            mismatched.push(`${label}: fragment reads ${name}, vertex never writes it`);
          } else if (producedType !== type) {
            mismatched.push(`${label}: ${name} is ${producedType} out / ${type} in`);
          }
        }
      }
      expect(mismatched).toEqual([]);
    } finally {
      dispose();
    }
  });

  it("catches an undeclared uniform, so the check cannot silently pass", () => {
    // Guards the detector itself: this is the exact shape of the shipped bug.
    const brokenStage = `
      uniform float uDetailNormalScrollSpeed;
      void main() { float s = uDetailNormalScrollSpeed * uTime; }
    `;
    const declared = declaredUniforms(brokenStage);
    const missing = [...referencedUniforms(brokenStage)].filter((name) => !declared.has(name));
    expect(missing).toEqual(["uTime"]);
  });
});
