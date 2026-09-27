import type * as THREE from "three";

interface ProgramRecord {
  currentProgram?: { getUniforms(): unknown; diagnostics?: { runnable: boolean } };
}

/**
 * Throws when a warmed post-processing program failed to compile or link, so
 * its stage is reported and left off instead of drawing garbage over the
 * world. Relies on the renderer's default `debug.checkShaderErrors`.
 */
export function assertProgramsRunnable(renderer: THREE.WebGLRenderer, materials: readonly THREE.Material[]): void {
  for (const material of materials) {
    const program = (renderer.properties.get(material) as ProgramRecord).currentProgram;
    if (!program) continue;
    // Linking status is checked on first use; ask for it now rather than mid-frame.
    program.getUniforms();
    if (program.diagnostics && !program.diagnostics.runnable) {
      throw new Error(`Post-processing program ${material.name || material.type} is not runnable`);
    }
  }
}
