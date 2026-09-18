import * as THREE from "three";
import { OBB } from "three/examples/jsm/math/OBB.js";
import { describe, expect, it, vi } from "vitest";
import { WATER_SURFACE, WorldLayout } from "../../src/world/WorldLayout";
import { HARBOR_BEACH_PATH, HARBOR_LANDING_PATH } from "../../src/world/HarborCoast";
import { harborCoastCollisionProxies } from "../../src/world/HarborCoastLayout";
import { createWorldEnvironmentLayout } from "../../src/world/WorldEnvironmentLayout";
import catalog from "../../assets/specs/asset-catalog.json";
import { staticPoseIsClear } from "../../src/physics/StaticCollision";
import { projectAssetCollision } from "../../src/physics/CollisionCatalogAdapter";
import { boatAssetId } from "../../src/render/assets/AssetCatalog";
import { HARBOR_DOCK, HARBOR_SKIFF_MOORING } from "../../src/world/WorldAnchors";
import { SUNREACH_ANCHORS } from "../../src/world/WorldIslands";
import { createWaterDepthMap } from "../../src/render/water/CoastalOptics";
import { FacetedWater } from "../../src/render/water/FacetedWater";
import { coastalVegetationDepthMaterial, vegetationInstanceTintMaterial, disposeVegetationTintMaterials, updateVegetationWind } from "../../src/render/materials/VegetationTintMaterial";
import type { WeatherMotionSignal } from "../../src/render/motion/WeatherMotionSignal";

describe("harbor coast shared support and optical fields", () => {
  it("has continuous dry beach, wash and submerged shelf at all three coves", () => {
    for (const x of [106,116,132,143]) {
      const shore = WorldLayout.coastlineZ(x);
      const heights = Array.from({length:81},(_,i)=>WorldLayout.terrainBaseSurfaceHeight(x,shore-5+i*.25));
      for (let i=1;i<heights.length;i++) expect(Math.abs(heights[i]-heights[i-1]),`${x}/${i}`).toBeLessThan(.17);
      expect(heights[0]).toBeGreaterThan(0);
      expect(heights.at(-1)).toBeLessThan(-1);
      for (const distance of [2,6,12]) {
        const z = shore + distance;
        expect(WorldLayout.marineSampleAt(x,z).bathymetryMeters).toBeCloseTo(-WorldLayout.terrainBaseSurfaceHeight(x,z),1);
      }
    }
  });

  it("derives render depth from the actual indexed collision bed", () => {
    const bounds = new THREE.Vector4(108,75,30,20);
    const texture = createWaterDepthMap(bounds,7,5);
    const data = texture.image.data as Uint16Array;
    for (let z=0;z<5;z++) for(let x=0;x<7;x++) {
      const wx=108+x*5,wz=75+z*5,index=(z*7+x)*4;
      const bed=WorldLayout.terrainBaseSurfaceHeight(wx,wz);
      expect(THREE.DataUtils.fromHalfFloat(data[index])).toBeCloseTo(WorldLayout.waterSurfaceElevation(wx,wz)-bed,2);
      expect(THREE.DataUtils.fromHalfFloat(data[index+1])).toBeCloseTo(bed,2);
    }
    texture.dispose();
  });

  it("keeps the preserved coral group fully submerged below the clear shallow shelf",()=>{
    const placements=createWorldEnvironmentLayout(12345).staticPlacements;
    for(const id of ["authored.coast.coral-pillar","authored.coast.coral-staghorn","authored.coast.coral-table"]){
      const placement=placements.find(p=>p.id===id)!;
      expect(placement,id).toBeDefined();
      const asset=catalog.assets.find(a=>a.id===placement.assetId)!;
      const top=(placement.y??WorldLayout.terrainHeight(placement.x,placement.z))+asset.dimensions.height*placement.scale[1];
      expect(top,id).toBeLessThan(WorldLayout.waterSurfaceElevation(placement.x,placement.z)-.6);
    }
  });

  it("reserves a 2.8 m passage through the new colliding habitat", () => {
    const boxes=harborCoastCollisionProxies();
    for(const route of [HARBOR_BEACH_PATH,HARBOR_LANDING_PATH]) for(let i=1;i<route.length;i++) {
      const a=route[i-1],b=route[i];
      for(let t=0;t<=1;t+=.1) {
        const point={x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t};
        expect(WorldLayout.isWalkable(point.x,point.z)).toBe(true);
        expect(staticPoseIsClear(boxes,point,WorldLayout.traversalSurfaceHeight(point.x,point.z),1.4),JSON.stringify(point)).toBe(true);
      }
    }
  });

  it("keeps the published rowboat and skiff hulls clear of coastal rock through each fixed berth and departure",()=>{
    const obb=(box:ReturnType<typeof projectAssetCollision>[number])=>new OBB(
      new THREE.Vector3(box.center.x,box.center.y,box.center.z),
      new THREE.Vector3(box.halfExtents.x,box.halfExtents.y,box.halfExtents.z),
      new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(
        new THREE.Quaternion(box.rotation.x,box.rotation.y,box.rotation.z,box.rotation.w)))
    );
    const rocks=harborCoastCollisionProxies().filter(box=>box.id.includes("rock-"));
    expect(rocks.length).toBeGreaterThan(0);
    for(const [type,mooring] of [["boat.rowboat",HARBOR_DOCK],["boat.skiff",HARBOR_SKIFF_MOORING]] as const){
      for(const departure of [0,2,4,6]){
        const root=new THREE.Object3D();root.position.set(mooring.boatPosition.x,mooring.boatPosition.y,mooring.boatPosition.z+departure);
        const hulls=projectAssetCollision(boatAssetId(type),root,type);
        expect(hulls.length).toBeGreaterThan(0);
        for(const hull of hulls)for(const rock of rocks)
          expect(obb(hull).intersectsOBB(obb(rock)),`${type} +${departure}m / ${rock.id}`).toBe(false);
      }
    }
  });

  it("shares one depth/time field across quality changes and disposes its texture once", () => {
    const water=new FacetedWater({width:12,depth:12,segmentsX:4,segmentsZ:4});
    const dispose=vi.spyOn(water.depthMap,"dispose");
    for(const tier of ["low","medium","high","low","high"] as const) {
      water.setQuality(tier);
      expect(water.mesh.material.uniforms.uWaterDepthMap).toBe(water.nearPatch.mesh.material.uniforms.uWaterDepthMap);
      expect(water.mesh.material.uniforms.uCoastTime).toBe(water.nearPatch.mesh.material.uniforms.uCoastTime);
    }
    water.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("aligns the near-water lattice with both coarse chunks at the harbor and Sunreach",()=>{
    const water=new FacetedWater();
    try{
      const gridX=WATER_SURFACE.width/WATER_SURFACE.segmentsX;
      const gridZ=WATER_SURFACE.depth/WATER_SURFACE.segmentsZ;
      const originX=WATER_SURFACE.centerX-WATER_SURFACE.width*.5;
      const originZ=WATER_SURFACE.centerZ-WATER_SURFACE.depth*.5;
      for(const [x,z] of [[132,70],[SUNREACH_ANCHORS.dockPlayer.x,SUNREACH_ANCHORS.dockPlayer.z]]){
        water.update(17,{seaRoughness:.1,windDirectionDeg:0,windSpeed:4},new THREE.Vector3(x,0,z));
        const mesh=water.nearPatch.mesh,positions=mesh.geometry.getAttribute("position");
        expect(water.mesh.material.uniforms.uNearPatchCenter.value.toArray()).toEqual(
          mesh.material.uniforms.uPatchCenter.value.toArray()
        );
        for(let i=0;i<positions.count;i++){
          const gx=(positions.getX(i)+mesh.position.x-originX)/gridX;
          const gz=(positions.getZ(i)+mesh.position.z-originZ)/gridZ;
          expect(Math.abs(gx-Math.round(gx))).toBeLessThan(.00005);
          expect(Math.abs(gz-Math.round(gz))).toBeLessThan(.00005);
        }
      }
    }finally{water.dispose();}
  });

  it("uses the exported leaf weights in both visible and shadow programs with shared motion", () => {
    const source=new THREE.MeshStandardMaterial({name:"foliage_coastal_01"});
    const color=vegetationInstanceTintMaterial(source,true);
    const depth=coastalVegetationDepthMaterial(color);
    const compile=(material:THREE.Material,lib:typeof THREE.ShaderLib.standard)=>{
      const shader={vertexShader:lib.vertexShader,fragmentShader:lib.fragmentShader,uniforms:{} as Record<string,{value:unknown}>};
      (material.onBeforeCompile as (shader:unknown)=>void)(shader);return shader;
    };
    const a=compile(color,THREE.ShaderLib.standard),b=compile(depth,THREE.ShaderLib.depth);
    for(const shader of [a,b]) expect(shader.vertexShader).toContain("nevaCanopy = clamp(_neva_wind, 0.0, 1.0)");
    updateVegetationWind({directionX:1,directionZ:0,normalizedStrength:.6,gust:.2,effectiveWindSpeed:5} as WeatherMotionSignal,14,1);
    expect(a.uniforms.nevaWindTime.value).toBe(14);
    expect(b.uniforms.nevaWindTime.value).toBe(14);
    expect(b.uniforms.nevaWindAmplitude.value).toBe(a.uniforms.nevaWindAmplitude.value);
    disposeVegetationTintMaterials();source.dispose();
  });
});
