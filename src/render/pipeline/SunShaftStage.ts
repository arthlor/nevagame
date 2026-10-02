import * as THREE from "three";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import { aerialPerspectiveUniforms } from "../atmosphere/AerialPerspective";
import { CANONICAL_RENDER_CONFIG } from "../config/VisualRenderConfig";
import { assertProgramsRunnable } from "./programHealth";

/** Bounded screen-space scattering; borrows the world's depth and lighting. */
export class SunShaftStage {
  public readonly target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false
  });
  public readonly material: THREE.ShaderMaterial;
  private readonly quad: FullScreenQuad;
  private readonly projectedSun = new THREE.Vector4();
  public active = false;

  public constructor() {
    const config = CANONICAL_RENDER_CONFIG.postProcessing.sunShafts;
    this.target.texture.name = "atmosphere.sunShafts";
    this.material = new THREE.ShaderMaterial({
      name: "neva_sun_shafts",
      defines: { SHAFT_SAMPLES: config.samples },
      uniforms: {
        tDepth: { value: null },
        uSun: { value: new THREE.Vector2() },
        uAspect: { value: 1 },
        uRadius: { value: config.radius },
        uReach: { value: config.reach },
        uRadiance: { value: new THREE.Color() }
      },
      vertexShader: `varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `
        varying vec2 vUv;
        uniform sampler2D tDepth;
        uniform vec2 uSun;
        uniform float uAspect, uRadius, uReach;
        uniform vec3 uRadiance;
        void main() {
          vec2 delta = uSun - vUv;
          float light = 0.0;
          // Midpoint quadrature: fixed positions need no jitter or history.
          // Only uncovered sky emits, so bright walls cannot become light sources.
          for (int i = 0; i < SHAFT_SAMPLES; i++) {
            float t = (float(i) + 0.5) / float(SHAFT_SAMPLES);
            vec2 sampleUv = vUv + delta * t * uReach;
            vec2 offset = (sampleUv - uSun) * vec2(uAspect, 1.0);
            float source = exp(-dot(offset, offset) / (uRadius * uRadius));
            float sky = step(0.999999, texture2D(tDepth, sampleUv).r);
            light += sky * source * (1.0 - t * 0.5);
          }
          gl_FragColor = vec4(uRadiance * light / float(SHAFT_SAMPLES), 1.0);
        }`,
      depthTest: false, depthWrite: false, toneMapped: false
    });
    this.quad = new FullScreenQuad(this.material);
  }

  public setSize(width: number, height: number): void {
    const scale = CANONICAL_RENDER_CONFIG.postProcessing.sunShafts.resolutionScale;
    this.target.setSize(Math.max(1, Math.ceil(width * scale)), Math.max(1, Math.ceil(height * scale)));
    this.material.uniforms.uAspect.value = width / Math.max(1, height);
  }

  public async prepare(renderer: THREE.WebGLRenderer): Promise<void> {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    try {
      await renderer.compileAsync(mesh, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1));
      assertProgramsRunnable(renderer, [this.material]);
    } catch (error) {
      this.dispose();
      throw error;
    } finally { mesh.geometry.dispose(); }
  }

  public render(renderer: THREE.WebGLRenderer, camera: THREE.Camera, source: THREE.WebGLRenderTarget): THREE.Texture | null {
    this.active = false;
    const sky = aerialPerspectiveUniforms;
    const sun = sky.nevaAerialSun.value;
    const color = sky.nevaAerialSunScatter.value;
    if (!source.depthTexture || sky.nevaAerialEnabled.value < 0.5 || sun.y <= 0 || Math.max(color.r, color.g, color.b) < 0.001) return null;
    // w=0 projects a direction: translating the camera must never move the sun.
    const clip = this.projectedSun.set(sun.x, sun.y, sun.z, 0)
      .applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
    if (clip.w <= 0) return null;
    const x = clip.x / clip.w * 0.5 + 0.5;
    const y = clip.y / clip.w * 0.5 + 0.5;
    const edge = Math.min(x, y, 1 - x, 1 - y);
    // Fade before the edge, so no clamped depth samples invent off-screen rays.
    const visibility = THREE.MathUtils.smoothstep(edge, 0, 0.12)
      * THREE.MathUtils.smoothstep(sun.y, 0, 0.08);
    if (visibility <= 0) return null;
    const uniforms = this.material.uniforms;
    uniforms.tDepth.value = source.depthTexture;
    uniforms.uSun.value.set(x, y);
    uniforms.uRadiance.value.copy(color).multiplyScalar(visibility * CANONICAL_RENDER_CONFIG.postProcessing.sunShafts.strength);
    renderer.setRenderTarget(this.target);
    this.quad.render(renderer);
    this.active = true;
    return this.target.texture;
  }

  public dispose(): void {
    this.active = false;
    this.target.dispose();
    this.material.dispose();
    this.quad.dispose();
  }
}
