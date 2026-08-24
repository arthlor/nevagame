import * as THREE from "three";

export interface WaterSample {
  height: number;
  normal: THREE.Vector3;
}

/** CPU mirror of the faceted-water wave layers used by boats and wakes. */
export class WaterSurface {
  public static height(x: number, z: number, timeSeconds: number, roughness: number): number {
    const scale = 1 + THREE.MathUtils.clamp(roughness, 0, 1) * 1.5;
    const primary = Math.sin(x * 0.1 + z * 0.05 + timeSeconds * 0.72) * 0.16;
    const cross = Math.cos(z * 0.17 + x * 0.07 - timeSeconds * 1.05) * 0.08;
    const small = Math.sin((x + z) * 0.31 + timeSeconds * 1.55) * 0.028;
    return (primary + cross + small) * scale;
  }

  public static sample(x: number, z: number, timeSeconds: number, roughness: number): WaterSample {
    const step = 0.15;
    const height = this.height(x, z, timeSeconds, roughness);
    const dx = this.height(x + step, z, timeSeconds, roughness) - height;
    const dz = this.height(x, z + step, timeSeconds, roughness) - height;
    return { height, normal: new THREE.Vector3(-dx / step, 1, -dz / step).normalize() };
  }
}
