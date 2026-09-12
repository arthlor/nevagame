import * as THREE from "three";
import { CANONICAL_RENDER_CONFIG, type QualityTier } from "../config/VisualRenderConfig";
import { CLOUD_FIELD_GLSL } from "./cloudFieldGlsl";
import { SKY_QUAD_VERTEX } from "./atmosphereSkyShader";

const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
white.needsUpdate = true;

/** Shared with palette, terrain, vegetation and both water tessellations. */
export const cloudShadowUniforms = {
  nevaCloudShadowMap: { value: white as THREE.Texture },
  nevaCloudShadowBounds: { value: new THREE.Vector4(0, 0, 1, 1) },
  nevaCloudSunDirection: { value: new THREE.Vector3(0, 1, 0) },
  nevaCloudShadowStrength: { value: 0 }
};

export const CLOUD_SHADOW_RECEIVER_GLSL = /* glsl */ `
uniform sampler2D nevaCloudShadowMap;
uniform vec4 nevaCloudShadowBounds;
uniform vec3 nevaCloudSunDirection;
uniform float nevaCloudShadowStrength;
float nevaCloudSunlight(vec3 worldPosition) {
  if (nevaCloudShadowStrength <= 0.0) return 1.0;
  vec2 groundProjection = worldPosition.xz - worldPosition.y
    * nevaCloudSunDirection.xz / max(0.12, nevaCloudSunDirection.y);
  vec2 uv = (groundProjection - nevaCloudShadowBounds.xy) / nevaCloudShadowBounds.zw + 0.5;
  float edge = max(abs(uv.x - 0.5), abs(uv.y - 0.5));
  float fade = 1.0 - smoothstep(0.4, 0.5, edge);
  return mix(1.0, texture2D(nevaCloudShadowMap, clamp(uv, 0.0, 1.0)).r,
    nevaCloudShadowStrength * fade);
}
`;

/** A small world-space transmittance map, independent of camera perspective. */
export class CloudShadows {
  public readonly target = new THREE.WebGLRenderTarget(1, 1, {
    depthBuffer: false, stencilBuffer: false, minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter, generateMipmaps: false
  });
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.Camera();
  private readonly geometry = new THREE.PlaneGeometry(2, 2);
  private readonly material: THREE.ShaderMaterial;
  private quality: QualityTier;

  constructor(skyUniforms: Record<string, THREE.IUniform>, quality: QualityTier) {
    this.quality = quality;
    this.target.texture.name = "atmosphere.cloudSunlight";
    this.material = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false, toneMapped: false,
      uniforms: {
        uCloudOffset: skyUniforms.uCloudOffset, uCloudLayer: skyUniforms.uCloudLayer,
        uWeather: skyUniforms.uWeather, uErosion: skyUniforms.uErosion, uSeed: skyUniforms.uSeed,
        uSunDirection: skyUniforms.uSunDirection,
        uBounds: cloudShadowUniforms.nevaCloudShadowBounds
      },
      vertexShader: SKY_QUAD_VERTEX,
      fragmentShader: /* glsl */ `
        ${CLOUD_FIELD_GLSL}
        uniform vec3 uSunDirection;
        uniform vec4 uBounds;
        varying vec2 vUv;
        void main() {
          vec2 ground = uBounds.xy + (vUv - 0.5) * uBounds.zw;
          float depth = 0.0;
          float stepHeight = uCloudLayer.y / 4.0;
          for (int i = 0; i < 4; i++) {
            float height = uCloudLayer.x + (float(i) + 0.5) * stepHeight;
            vec3 point = vec3(ground.x, 0.0, ground.y)
              + uSunDirection * height / max(0.12, uSunDirection.y);
            depth += cloudDensity(point, true) * stepHeight / max(0.12, uSunDirection.y);
          }
          float transmittance = exp(-depth * uCloudLayer.w);
          gl_FragColor = vec4(vec3(transmittance), 1.0);
        }`
    });
    const mesh = new THREE.Mesh(this.geometry, this.material);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  public setQuality(quality: QualityTier): void { this.quality = quality; }

  public async prepare(renderer: THREE.WebGLRenderer): Promise<void> {
    await renderer.compileAsync(this.scene, this.camera);
  }

  /** AtmosphereSky owns render-state save/restore around both atmosphere targets. */
  public render(renderer: THREE.WebGLRenderer, eye: THREE.Vector3): void {
    const config = CANONICAL_RENDER_CONFIG.atmosphere;
    const resolution = config.quality[this.quality].shadowResolution;
    if (this.target.width !== resolution) this.target.setSize(resolution, resolution);
    const span = config.cloudShadowSpanMeters;
    const texel = span / resolution;
    cloudShadowUniforms.nevaCloudShadowBounds.value.set(
      Math.round(eye.x / texel) * texel, Math.round(eye.z / texel) * texel, span, span
    );
    const sun = this.material.uniforms.uSunDirection.value as THREE.Vector3;
    cloudShadowUniforms.nevaCloudSunDirection.value.copy(sun);
    cloudShadowUniforms.nevaCloudShadowStrength.value = config.cloudShadowStrength
      * THREE.MathUtils.smoothstep(sun.y, 0.06, 0.2);
    renderer.setRenderTarget(this.target);
    renderer.render(this.scene, this.camera);
    cloudShadowUniforms.nevaCloudShadowMap.value = this.target.texture;
  }

  public dispose(): void {
    if (cloudShadowUniforms.nevaCloudShadowMap.value === this.target.texture) {
      cloudShadowUniforms.nevaCloudShadowMap.value = white;
      cloudShadowUniforms.nevaCloudShadowStrength.value = 0;
    }
    this.target.dispose(); this.geometry.dispose(); this.material.dispose();
  }
}
