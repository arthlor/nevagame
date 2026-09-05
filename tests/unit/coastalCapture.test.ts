import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RendererPipeline, renderTargetDiagnostic } from "../../src/render/pipeline/RendererPipeline";
import { createCoastalUniforms } from "../../src/render/water/CoastalOptics";

afterEach(()=>vi.unstubAllGlobals());

describe("opaque water snapshot ownership",()=>{
  it("copies color/depth once per frame without re-rendering the world, and releases each resized/tier target",async()=>{
    vi.stubGlobal("window",{devicePixelRatio:1});
    const snapshots:THREE.WebGLRenderTarget[]=[];
    let active:THREE.WebGLRenderTarget|null=null;
    const renderer={
      info:{autoReset:true,reset:vi.fn(),memory:{geometries:0,textures:0}},
      getContext:()=>({}),getPixelRatio:()=>1,compileAsync:async()=>{},shadowMap:{needsUpdate:false},
      getRenderTarget:()=>active,setRenderTarget:(target:THREE.WebGLRenderTarget)=>{active=target;},
      initRenderTarget:(target:THREE.WebGLRenderTarget)=>snapshots.push(target),
      copyTextureToTexture:vi.fn(),render:vi.fn()
    };
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
    const uniforms=createCoastalUniforms(null,new THREE.Vector4(0,0,20,20));
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(),new THREE.ShaderMaterial());
    scene.add(mesh);
    const pipeline=new RendererPipeline(renderer as unknown as THREE.WebGLRenderer,scene,"high");
    pipeline.bindWaterCapture([mesh],uniforms);
    const disposals:ReturnType<typeof vi.spyOn>[]=[];
    try{
      for(let cycle=0;cycle<3;cycle++){
        pipeline.setQuality("high");pipeline.resize(320+cycle*80,180);
        await pipeline.prepareForCapture(camera);
        const composer=(pipeline as unknown as {composer:EffectComposer}).composer;
        active=composer.renderTarget1;
        const draw=()=>mesh.onBeforeRender(renderer as unknown as THREE.WebGLRenderer,scene,camera,mesh.geometry,mesh.material,null!);
        composer.render=()=>{draw();draw();draw();};
        const copies=renderer.copyTextureToTexture.mock.calls.length;
        pipeline.render(camera);
        expect(renderer.copyTextureToTexture.mock.calls.length-copies).toBe(2);
        expect(renderer.render).not.toHaveBeenCalled();
        expect(uniforms.uSceneCaptureEnabled.value).toBe(1);
        expect(uniforms.uOpaqueColor.value).not.toBe(active.texture);
        expect(uniforms.uOpaqueDepth.value).not.toBe(active.depthTexture);
        expect(uniforms.uOpticsViewport.value.toArray()).toEqual([320+cycle*80,180]);
        disposals.push(vi.spyOn(snapshots.at(-1)!,"dispose"));
        pipeline.setQuality("medium");
        expect(uniforms.uSceneCaptureEnabled.value).toBe(0);
        expect(uniforms.uOpaqueColor.value).toBeNull();
        expect(uniforms.uOpaqueDepth.value).toBeNull();
        expect(pipeline.diagnostics().renderTargets).toHaveLength(0);
      }
    }finally{pipeline.dispose();mesh.geometry.dispose();mesh.material.dispose();}
    for(const dispose of disposals)expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("accounts for RGBA16F color and the actual 32-bit sampled depth allocation",()=>{
    const target=new THREE.WebGLRenderTarget(320,180,{type:THREE.HalfFloatType,depthTexture:new THREE.DepthTexture(320,180,THREE.UnsignedIntType)});
    expect(renderTargetDiagnostic("water",target).estimatedBytes).toBe(320*180*12);
    target.dispose();
  });
});
