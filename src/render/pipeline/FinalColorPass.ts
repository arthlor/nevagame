import * as THREE from "three";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import { CANONICAL_RENDER_CONFIG } from "../config/VisualRenderConfig";
import type { ColorFinish } from "../config/GraphicsEffectSettings";

const TONE_MAPPING_DEFINES = new Map<THREE.ToneMapping, string>([
  [THREE.LinearToneMapping, "LINEAR_TONE_MAPPING"],
  [THREE.ReinhardToneMapping, "REINHARD_TONE_MAPPING"],
  [THREE.CineonToneMapping, "CINEON_TONE_MAPPING"],
  [THREE.ACESFilmicToneMapping, "ACES_FILMIC_TONE_MAPPING"],
  [THREE.AgXToneMapping, "AGX_TONE_MAPPING"],
  [THREE.NeutralToneMapping, "NEUTRAL_TONE_MAPPING"],
  [THREE.CustomToneMapping, "CUSTOM_TONE_MAPPING"]
]);

const FINAL_COLOR_VERTEX = /* glsl */`
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

const FINAL_COLOR_FRAGMENT = /* glsl */`
  precision highp float;
  uniform sampler2D tDiffuse;
  uniform sampler2D tDepth;
  uniform sampler2D tAo;
  uniform sampler2D tBloom;
  uniform sampler2D tSunShafts;
  uniform float uSunShafts;
  uniform vec2 uShaftNearFade;
  // x: AO on, y: intensity, z: relative depth tolerance
  uniform vec3 uAo;
  uniform vec2 uAoSize;
  // Perspective near/far of the frame's camera.
  uniform vec2 uCameraRange;
  uniform float uBloomStrength;
  // x: finish on, y: saturation, z: contrast, w: warmth
  uniform vec4 uFinish;
  varying vec2 vUv;

  #include <tonemapping_pars_fragment>
  #include <colorspace_pars_fragment>

  float viewDistance(float depth) {
    float ndc = depth * 2.0 - 1.0;
    return 2.0 * uCameraRange.x * uCameraRange.y
      / (uCameraRange.y + uCameraRange.x - ndc * (uCameraRange.y - uCameraRange.x));
  }

  // Joint bilateral upsample of the reduced-resolution AO: each of the four
  // nearest AO texels counts only as far as its scene depth matches this
  // pixel's, so occlusion never bleeds across a silhouette. Where no texel
  // matches (a thin post against distant ground) the pixel stays unoccluded
  // rather than borrowing its background's AO.
  float reconstructAo(vec2 uv) {
    float depth = texture2D(tDepth, uv).r;
    if (depth >= 0.99999) return 1.0;
    float center = viewDistance(depth);
    vec2 position = uv * uAoSize - 0.5;
    vec2 base = floor(position);
    vec2 fraction = position - base;
    float occlusion = 0.0;
    float weights = 0.0;
    for (int y = 0; y < 2; y++) {
      for (int x = 0; x < 2; x++) {
        vec2 offset = vec2(float(x), float(y));
        vec2 texelUv = (base + offset + 0.5) / uAoSize;
        vec2 bilinear = mix(1.0 - fraction, fraction, offset);
        float texelDistance = viewDistance(texture2D(tDepth, texelUv).r);
        float similarity = max(0.0, 1.0 - abs(texelDistance - center) / (center * uAo.z));
        float weight = bilinear.x * bilinear.y * similarity;
        occlusion += texture2D(tAo, texelUv).r * weight;
        weights += weight;
      }
    }
    float confidence = clamp(weights * 4.0, 0.0, 1.0);
    return mix(1.0, occlusion / max(weights, 1e-5), confidence);
  }

  // Display-referred finish between tone mapping and encoding. Warmth moves
  // white balance at constant luminance, saturation mixes about luminance, and
  // contrast is an endpoint-preserving S-curve on perceptual luminance, so
  // black and white — cream plaster, foam — never clip.
  vec3 applyFinish(vec3 color) {
    const vec3 lumaWeights = vec3(0.2126, 0.7152, 0.0722);
    float luma = dot(color, lumaWeights);
    vec3 warmed = color * vec3(1.0 + uFinish.w, 1.0, 1.0 - uFinish.w);
    color = warmed * (luma / max(dot(warmed, lumaWeights), 1e-5));
    color = mix(vec3(luma), color, uFinish.y);
    float perceptual = sqrt(clamp(luma, 0.0, 1.0));
    float curved = perceptual + 2.0 * (uFinish.z - 1.0) * (2.0 * perceptual - 1.0) * perceptual * (1.0 - perceptual);
    curved = clamp(curved, 0.0, 1.0);
    color *= (curved * curved) / max(luma, 1e-5);
    return clamp(color, 0.0, 1.0);
  }

  void main() {
    vec4 color = texture2D(tDiffuse, vUv);
    if (uAo.x > 0.5) color.rgb *= mix(1.0, reconstructAo(vUv), uAo.y);
    // Bloom joins the linear HDR scene, so the single tone map rolls it off.
    if (uBloomStrength > 0.0) color.rgb += texture2D(tBloom, vUv).rgb * uBloomStrength;
    // Full-resolution depth suppresses scatter over nearby actors/interiors;
    // the low-resolution light field cannot soften their silhouettes.
    if (uSunShafts > 0.5) {
      float distance = viewDistance(texture2D(tDepth, vUv).r);
      color.rgb += texture2D(tSunShafts, vUv).rgb * smoothstep(uShaftNearFade.x, uShaftNearFade.y, distance);
    }
    gl_FragColor = color;

    #ifdef LINEAR_TONE_MAPPING
      gl_FragColor.rgb = LinearToneMapping(gl_FragColor.rgb);
    #elif defined(REINHARD_TONE_MAPPING)
      gl_FragColor.rgb = ReinhardToneMapping(gl_FragColor.rgb);
    #elif defined(CINEON_TONE_MAPPING)
      gl_FragColor.rgb = CineonToneMapping(gl_FragColor.rgb);
    #elif defined(ACES_FILMIC_TONE_MAPPING)
      gl_FragColor.rgb = ACESFilmicToneMapping(gl_FragColor.rgb);
    #elif defined(AGX_TONE_MAPPING)
      gl_FragColor.rgb = AgXToneMapping(gl_FragColor.rgb);
    #elif defined(NEUTRAL_TONE_MAPPING)
      gl_FragColor.rgb = NeutralToneMapping(gl_FragColor.rgb);
    #elif defined(CUSTOM_TONE_MAPPING)
      gl_FragColor.rgb = CustomToneMapping(gl_FragColor.rgb);
    #endif

    if (uFinish.x > 0.5) gl_FragColor.rgb = applyFinish(gl_FragColor.rgb);

    #ifdef SRGB_TRANSFER
      gl_FragColor = sRGBTransferOETF(gl_FragColor);
    #endif
  }
`;

export interface FinalColorInputs {
  scene: THREE.WebGLRenderTarget;
  camera: THREE.Camera;
  /** Reduced-resolution AO visibility, or null when AO is off. */
  ambientOcclusion: THREE.Texture | null;
  aoSize: { width: number; height: number };
  aoIntensity: number;
  aoEdgeTolerance: number;
  sunShafts: THREE.Texture | null;
  bloom: THREE.Texture | null;
  bloomStrength: number;
  finish: Readonly<ColorFinish> | null;
}

/**
 * The enhanced path's single output conversion: AO composite, optional HDR
 * bloom and sunlight, exposure, the renderer's tone map, an optional colour finish and the
 * sRGB transfer, in that order and exactly once. Its tone-map and colour-space
 * defines follow the renderer, as `OutputPass` does; every optional term is a
 * uniform branch, so toggling an effect never recompiles this program.
 */
export class FinalColorPass {
  public readonly material: THREE.RawShaderMaterial;
  private readonly quad: FullScreenQuad;
  private toneMapping: THREE.ToneMapping | null = null;
  private outputColorSpace: THREE.ColorSpace | null = null;

  public constructor() {
    this.material = new THREE.RawShaderMaterial({
      name: "neva_final_color",
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: null },
        tAo: { value: null },
        tBloom: { value: null },
        tSunShafts: { value: null },
        uSunShafts: { value: 0 },
        uShaftNearFade: { value: new THREE.Vector2(
          CANONICAL_RENDER_CONFIG.atmosphere.aerialPerspective.nearFadeStartMeters,
          CANONICAL_RENDER_CONFIG.atmosphere.aerialPerspective.nearFadeEndMeters
        ) },
        toneMappingExposure: { value: 1 },
        uAo: { value: new THREE.Vector3() },
        uAoSize: { value: new THREE.Vector2(1, 1) },
        uCameraRange: { value: new THREE.Vector2(0.1, 1000) },
        uBloomStrength: { value: 0 },
        uFinish: { value: new THREE.Vector4(0, 1, 1, 0) }
      },
      vertexShader: FINAL_COLOR_VERTEX,
      fragmentShader: FINAL_COLOR_FRAGMENT,
      depthTest: false,
      depthWrite: false
    });
    this.quad = new FullScreenQuad(this.material);
  }

  /** Warms the program before it takes over from the direct path. */
  public async prepare(renderer: THREE.WebGLRenderer): Promise<void> {
    this.syncDefines(renderer);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    try {
      await renderer.compileAsync(mesh, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1));
    } finally {
      mesh.geometry.dispose();
    }
  }

  public render(renderer: THREE.WebGLRenderer, inputs: FinalColorInputs, target: THREE.WebGLRenderTarget | null): void {
    this.syncDefines(renderer);
    const uniforms = this.material.uniforms;
    uniforms.tDiffuse.value = inputs.scene.texture;
    uniforms.tDepth.value = inputs.scene.depthTexture;
    uniforms.toneMappingExposure.value = renderer.toneMappingExposure;
    const perspective = inputs.camera as THREE.PerspectiveCamera;
    (uniforms.uCameraRange.value as THREE.Vector2).set(perspective.near ?? 0.1, perspective.far ?? 1000);
    const ao = inputs.ambientOcclusion;
    uniforms.tAo.value = ao;
    (uniforms.uAo.value as THREE.Vector3).set(ao && inputs.aoIntensity > 0 ? 1 : 0, inputs.aoIntensity, inputs.aoEdgeTolerance);
    (uniforms.uAoSize.value as THREE.Vector2).set(inputs.aoSize.width, inputs.aoSize.height);
    uniforms.tSunShafts.value = inputs.sunShafts;
    uniforms.uSunShafts.value = inputs.sunShafts ? 1 : 0;
    uniforms.tBloom.value = inputs.bloom;
    uniforms.uBloomStrength.value = inputs.bloom ? inputs.bloomStrength : 0;
    const finish = inputs.finish;
    const finishActive = finish !== null && (finish.saturation !== 1 || finish.contrast !== 1 || finish.warmth !== 0);
    (uniforms.uFinish.value as THREE.Vector4).set(
      finishActive ? 1 : 0,
      finish?.saturation ?? 1,
      finish?.contrast ?? 1,
      finish?.warmth ?? 0
    );
    renderer.setRenderTarget(target);
    this.quad.render(renderer);
  }

  public dispose(): void {
    this.material.dispose();
    this.quad.dispose();
  }

  private syncDefines(renderer: THREE.WebGLRenderer): void {
    if (this.toneMapping === renderer.toneMapping && this.outputColorSpace === renderer.outputColorSpace) return;
    this.toneMapping = renderer.toneMapping;
    // The renderer getter is typed as a plain string; the pass only branches on the named spaces.
    this.outputColorSpace = renderer.outputColorSpace as THREE.ColorSpace;
    const defines: Record<string, string> = {};
    if (THREE.ColorManagement.getTransfer(renderer.outputColorSpace) === THREE.SRGBTransfer) defines.SRGB_TRANSFER = "";
    const toneMapping = TONE_MAPPING_DEFINES.get(renderer.toneMapping);
    if (toneMapping) defines[toneMapping] = "";
    this.material.defines = defines;
    this.material.needsUpdate = true;
  }
}
