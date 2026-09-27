import * as THREE from "three";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import { CANONICAL_RENDER_CONFIG } from "../config/VisualRenderConfig";
import { assertProgramsRunnable } from "./programHealth";

type BloomConfig = typeof CANONICAL_RENDER_CONFIG.postProcessing.hdrBloom;

const QUAD_VERTEX = /* glsl */`
  precision highp float;
  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  attribute vec3 position;
  attribute vec2 uv;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Half-resolution prefilter. Four bilinear taps cover the 4x4 source texels
// behind each output texel; Karis weighting (1 / (1 + luma)) keeps a single
// sun glint on the water from flickering the whole halo. The soft knee starts
// the response below the threshold so highlights ease in, measured on exposed
// luminance so brightness and time of day keep the same threshold.
const PREFILTER_FRAGMENT = /* glsl */`
  precision highp float;
  uniform sampler2D tSource;
  uniform vec2 uSourceTexel;
  uniform vec3 uThreshold; // x: threshold, y: knee, z: exposure
  varying vec2 vUv;

  vec3 fetch(vec2 uv) {
    return min(texture2D(tSource, uv).rgb, vec3(64.0));
  }

  float karis(vec3 color) {
    return 1.0 / (1.0 + dot(color * uThreshold.z, vec3(0.2126, 0.7152, 0.0722)));
  }

  void main() {
    vec3 a = fetch(vUv + uSourceTexel * vec2(-1.0, -1.0));
    vec3 b = fetch(vUv + uSourceTexel * vec2(1.0, -1.0));
    vec3 c = fetch(vUv + uSourceTexel * vec2(-1.0, 1.0));
    vec3 d = fetch(vUv + uSourceTexel * vec2(1.0, 1.0));
    float wa = karis(a); float wb = karis(b); float wc = karis(c); float wd = karis(d);
    vec3 color = (a * wa + b * wb + c * wc + d * wd) / (wa + wb + wc + wd);
    float brightness = max(color.r, max(color.g, color.b)) * uThreshold.z;
    float knee = max(uThreshold.y, 1e-4);
    float soft = clamp(brightness - uThreshold.x + knee, 0.0, 2.0 * knee);
    soft = soft * soft / (4.0 * knee);
    float contribution = max(soft, brightness - uThreshold.x) / max(brightness, 1e-4);
    gl_FragColor = vec4(color * contribution, 1.0);
  }
`;

const DOWNSAMPLE_FRAGMENT = /* glsl */`
  precision highp float;
  uniform sampler2D tSource;
  uniform vec2 uSourceTexel;
  varying vec2 vUv;
  void main() {
    vec3 color = texture2D(tSource, vUv + uSourceTexel * vec2(-1.0, -1.0)).rgb
      + texture2D(tSource, vUv + uSourceTexel * vec2(1.0, -1.0)).rgb
      + texture2D(tSource, vUv + uSourceTexel * vec2(-1.0, 1.0)).rgb
      + texture2D(tSource, vUv + uSourceTexel * vec2(1.0, 1.0)).rgb;
    gl_FragColor = vec4(color * 0.25, 1.0);
  }
`;

// 3x3 tent over the coarser level, added onto the finer level.
const UPSAMPLE_FRAGMENT = /* glsl */`
  precision highp float;
  uniform sampler2D tSource;
  uniform vec2 uSourceTexel;
  uniform float uScatter;
  varying vec2 vUv;
  void main() {
    vec2 t = uSourceTexel;
    vec3 color = texture2D(tSource, vUv).rgb * 4.0;
    color += (texture2D(tSource, vUv + vec2(-t.x, 0.0)).rgb + texture2D(tSource, vUv + vec2(t.x, 0.0)).rgb
      + texture2D(tSource, vUv + vec2(0.0, -t.y)).rgb + texture2D(tSource, vUv + vec2(0.0, t.y)).rgb) * 2.0;
    color += texture2D(tSource, vUv + vec2(-t.x, -t.y)).rgb + texture2D(tSource, vUv + vec2(t.x, -t.y)).rgb
      + texture2D(tSource, vUv + vec2(-t.x, t.y)).rgb + texture2D(tSource, vUv + vec2(t.x, t.y)).rgb;
    gl_FragColor = vec4(color * (uScatter / 16.0), 1.0);
  }
`;

function createMaterial(name: string, fragmentShader: string, uniforms: Record<string, THREE.IUniform>, additive = false): THREE.RawShaderMaterial {
  return new THREE.RawShaderMaterial({
    name,
    uniforms,
    vertexShader: QUAD_VERTEX,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
    ...(additive
      ? { transparent: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation }
      : { blending: THREE.NoBlending })
  });
}

/**
 * Optional High-only bloom of genuine HDR highlights (sun glints, lanterns,
 * lit windows at night, lightning). It reads the linear scene once at half
 * resolution and never re-renders the scene or substitutes materials. The
 * final-colour pass adds the result before its single tone map.
 */
export class HdrBloomStage {
  private readonly mips: THREE.WebGLRenderTarget[] = [];
  private readonly quad = new FullScreenQuad(null);
  private readonly prefilter: THREE.RawShaderMaterial;
  private readonly downsample: THREE.RawShaderMaterial;
  private readonly upsample: THREE.RawShaderMaterial;

  public constructor(private readonly config: BloomConfig = CANONICAL_RENDER_CONFIG.postProcessing.hdrBloom) {
    this.prefilter = createMaterial("neva_bloom_prefilter", PREFILTER_FRAGMENT, {
      tSource: { value: null }, uSourceTexel: { value: new THREE.Vector2() }, uThreshold: { value: new THREE.Vector3() }
    });
    this.downsample = createMaterial("neva_bloom_downsample", DOWNSAMPLE_FRAGMENT, {
      tSource: { value: null }, uSourceTexel: { value: new THREE.Vector2() }
    });
    this.upsample = createMaterial("neva_bloom_upsample", UPSAMPLE_FRAGMENT, {
      tSource: { value: null }, uSourceTexel: { value: new THREE.Vector2() }, uScatter: { value: config.scatter }
    }, true);
    for (let level = 0; level < Math.max(1, config.levels); level += 1) {
      const target = new THREE.WebGLRenderTarget(1, 1, {
        type: THREE.HalfFloatType,
        depthBuffer: false,
        stencilBuffer: false,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        generateMipmaps: false
      });
      target.texture.name = `bloom.mip${level}`;
      this.mips.push(target);
    }
  }

  public get strength(): number {
    return this.config.strength;
  }

  public get targets(): readonly THREE.WebGLRenderTarget[] {
    return this.mips;
  }

  public setSize(sceneWidth: number, sceneHeight: number): void {
    this.mips.forEach((target, level) => {
      const divisor = 2 ** (level + 1);
      target.setSize(Math.max(1, Math.floor(sceneWidth / divisor)), Math.max(1, Math.floor(sceneHeight / divisor)));
    });
  }

  public async prepare(renderer: THREE.WebGLRenderer): Promise<void> {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    try {
      for (const material of [this.prefilter, this.downsample, this.upsample]) {
        mesh.material = material;
        await renderer.compileAsync(mesh, camera);
      }
      assertProgramsRunnable(renderer, [this.prefilter, this.downsample, this.upsample]);
    } finally {
      mesh.geometry.dispose();
    }
  }

  /** Returns the half-resolution bloom texture for the final pass. */
  public render(renderer: THREE.WebGLRenderer, source: THREE.WebGLRenderTarget, exposure: number): THREE.Texture {
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    try {
      (this.prefilter.uniforms.uThreshold.value as THREE.Vector3).set(this.config.threshold, this.config.knee, exposure);
      this.draw(renderer, this.prefilter, source.texture, source.width, source.height, this.mips[0]!);
      this.quad.render(renderer);
      for (let level = 1; level < this.mips.length; level += 1) {
        const from = this.mips[level - 1]!;
        this.draw(renderer, this.downsample, from.texture, from.width, from.height, this.mips[level]!);
        this.quad.render(renderer);
      }
      for (let level = this.mips.length - 2; level >= 0; level -= 1) {
        const from = this.mips[level + 1]!;
        this.draw(renderer, this.upsample, from.texture, from.width, from.height, this.mips[level]!);
        this.quad.render(renderer);
      }
    } finally {
      renderer.autoClear = autoClear;
    }
    return this.mips[0]!.texture;
  }

  public dispose(): void {
    for (const target of this.mips) target.dispose();
    this.prefilter.dispose();
    this.downsample.dispose();
    this.upsample.dispose();
    this.quad.dispose();
  }

  private draw(
    renderer: THREE.WebGLRenderer,
    material: THREE.RawShaderMaterial,
    texture: THREE.Texture,
    width: number,
    height: number,
    target: THREE.WebGLRenderTarget
  ): void {
    material.uniforms.tSource.value = texture;
    (material.uniforms.uSourceTexel.value as THREE.Vector2).set(1 / Math.max(1, width), 1 / Math.max(1, height));
    this.quad.material = material;
    renderer.setRenderTarget(target);
  }
}
