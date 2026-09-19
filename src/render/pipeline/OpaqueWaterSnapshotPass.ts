import * as THREE from "three";

/** A same-size GPU copy; texelFetch preserves linear color and hardware depth. */
export class OpaqueWaterSnapshotPass {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material = new THREE.ShaderMaterial({
    name: "neva_opaque_water_snapshot",
    glslVersion: THREE.GLSL3,
    uniforms: { uSourceColor: { value: null }, uSourceDepth: { value: null } },
    vertexShader: /* glsl */`
      void main() {
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D uSourceColor;
      uniform sampler2D uSourceDepth;
      out vec4 snapshotColor;
      void main() {
        ivec2 pixel = ivec2(gl_FragCoord.xy);
        snapshotColor = texelFetch(uSourceColor, pixel, 0);
        gl_FragDepth = texelFetch(uSourceDepth, pixel, 0).r;
      }
    `,
    toneMapped: false,
    blending: THREE.NoBlending,
    depthTest: true,
    depthFunc: THREE.AlwaysDepth,
    depthWrite: true
  });
  private readonly quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);

  public constructor() {
    this.quad.frustumCulled = false;
    this.scene.name = "opaque_water_snapshot_pass";
    this.scene.add(this.quad);
  }

  /** Compile against the linear render target used at runtime, before entry. */
  public async prepare(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget): Promise<void> {
    const previousTarget = renderer.getRenderTarget();
    const previousFace = renderer.getActiveCubeFace();
    const previousLevel = renderer.getActiveMipmapLevel();
    try {
      renderer.setRenderTarget(target);
      await renderer.compileAsync(this.scene, this.camera);
    } finally {
      renderer.setRenderTarget(previousTarget, previousFace, previousLevel);
    }
  }

  public copy(
    renderer: THREE.WebGLRenderer,
    source: THREE.WebGLRenderTarget,
    target: THREE.WebGLRenderTarget
  ): void {
    if (!source.depthTexture || !target.depthTexture || source === target
      || source.texture === target.texture || source.depthTexture === target.depthTexture
      || source.width !== target.width || source.height !== target.height) {
      throw new Error("Water snapshot requires separate, same-sized color and depth targets");
    }
    const previousTarget = renderer.getRenderTarget();
    const previousFace = renderer.getActiveCubeFace();
    const previousLevel = renderer.getActiveMipmapLevel();
    const autoClear = renderer.autoClear;
    const xrEnabled = renderer.xr.enabled;
    const shadowsEnabled = renderer.shadowMap.enabled;
    this.material.uniforms.uSourceColor.value = source.texture;
    this.material.uniforms.uSourceDepth.value = source.depthTexture;
    try {
      // A full target draw writes every color/depth pixel, including depth=1.
      // Disabling depthTest would also disable depth writes in WebGL.
      renderer.autoClear = false;
      renderer.xr.enabled = false;
      renderer.shadowMap.enabled = false;
      renderer.setRenderTarget(target);
      renderer.render(this.scene, this.camera);
    } finally {
      renderer.setRenderTarget(previousTarget, previousFace, previousLevel);
      renderer.autoClear = autoClear;
      renderer.xr.enabled = xrEnabled;
      renderer.shadowMap.enabled = shadowsEnabled;
      this.material.uniforms.uSourceColor.value = null;
      this.material.uniforms.uSourceDepth.value = null;
    }
  }

  public dispose(): void {
    this.material.uniforms.uSourceColor.value = null;
    this.material.uniforms.uSourceDepth.value = null;
    this.quad.geometry.dispose();
    this.material.dispose();
    this.scene.clear();
  }
}
