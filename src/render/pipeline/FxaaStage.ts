import * as THREE from "three";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import { assertProgramsRunnable } from "./programHealth";

/**
 * Fast edge smoothing for the enhanced path, whose linear HDR scene target
 * has no multisampling (the canvas's native antialiasing only covers what is
 * drawn directly to it). It reads the final pass's sRGB-encoded output, as
 * FXAA's luma edge detection expects, and writes the canvas. The shader does
 * not include the tone-map or colour-space chunks, so nothing is converted
 * twice.
 */
export class FxaaStage {
  private readonly quad: FullScreenQuad;

  private constructor(private readonly material: THREE.ShaderMaterial) {
    this.quad = new FullScreenQuad(material);
  }

  public static async create(): Promise<FxaaStage> {
    const { FXAAShader } = await import("three/examples/jsm/shaders/FXAAShader.js");
    return new FxaaStage(new THREE.ShaderMaterial({
      name: "neva_fxaa",
      uniforms: THREE.UniformsUtils.clone(FXAAShader.uniforms),
      vertexShader: FXAAShader.vertexShader,
      fragmentShader: FXAAShader.fragmentShader,
      depthTest: false,
      depthWrite: false
    }));
  }

  public async prepare(renderer: THREE.WebGLRenderer): Promise<void> {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    const previous = renderer.getRenderTarget();
    try {
      renderer.setRenderTarget(null);
      await renderer.compileAsync(mesh, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1));
      assertProgramsRunnable(renderer, [this.material]);
    } finally {
      renderer.setRenderTarget(previous);
      mesh.geometry.dispose();
    }
  }

  public render(renderer: THREE.WebGLRenderer, source: THREE.WebGLRenderTarget, target: THREE.WebGLRenderTarget | null): void {
    this.material.uniforms.tDiffuse.value = source.texture;
    (this.material.uniforms.resolution.value as THREE.Vector2).set(1 / source.width, 1 / source.height);
    renderer.setRenderTarget(target);
    this.quad.render(renderer);
  }

  public dispose(): void {
    this.material.dispose();
    this.quad.dispose();
  }
}
