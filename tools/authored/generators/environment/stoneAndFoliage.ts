import * as THREE from "three";
import { SurfaceBuilder, addCollisionMarkers, assembleLodLevels, mulberry32, type AuthoredModel, type GeneratorContext, type V3 } from "../../kit";
import { rope } from "../props/parts";

/** Metres, Y up. Broad bedding planes and offset shoulders carry the silhouette.
 * Fractures belong to whole slabs; no painted cracks or floating stone ornaments. */
export function createStoneModel({ spec, parameters: p, seed }: GeneratorContext): AuthoredModel {
  const root = new THREE.Group(); root.name = spec.rootNode;
  const build = (lod: number): THREE.Object3D => {
    const random = mulberry32(seed);
    const surface = new SurfaceBuilder(spec.palette);
    const pebble = spec.generator === "pebble_cluster";
    const tall = ["sea_stack", "rock_spire"].includes(spec.generator) || p.silhouette === "stack";
    const shape = String(p.form ?? p.silhouette ?? (tall ? "stack" : "cluster"));
    const width = Number(p.width ?? spec.dimensions.width);
    const depth = Number(p.depth ?? spec.dimensions.depth);
    const height = Number(p.height ?? spec.dimensions.height);
    const count = pebble ? Number(p.count) : tall ? 5 : shape === "cleft" ? 3 : 3;
    for (let i = 0; i < count; i++) {
      const angle = i * 2.399963 + random() * .24;
      const size = pebble ? Number(p.size) * (.65 + random() * .4) : 1;
      const radius = pebble ? Number(p.spread) * (.2 + .65 * i / Math.max(1, count - 1)) : 0;
      const x = pebble ? Math.cos(angle) * radius : tall ? width * .055 * Math.sin(i * 1.7) : (i - 1) * width * .22;
      const z = pebble ? Math.sin(angle) * radius * .7 : depth * .055 * Math.cos(i * 2.1);
      const y = pebble ? 0 : tall ? height * i * .17 : 0;
      const w = pebble ? size : tall ? width * (.46 - i * .055) : width * (i === 1 ? .36 : .27);
      const d = pebble ? size * (.62 + random() * .18) : depth * (tall ? .44 - i * .045 : .44);
      const h = pebble ? size * .65 : tall ? height * .32 : height * (i === 1 ? .96 : i === 0 ? .69 : .49);
      const shear = Number(p.shear ?? p.tilt ?? .07);
      const rings = lod ? [[0,.90],[1,.68]] : pebble ? [[0,.85],[.35,1],[1,.66]] : [[0,.9],[.08,1],[.43,.95],[.49,.88],[.88,.80],[1,.68]];
      surface.addLoft(rings.map(([t, k]) => ({ p: [x + h*t*shear, y+h*t, z+h*t*.045] as V3, w:w*k, h:d*k, n:pebble ? 2.4 : 4.2 })), {
        sides: lod ? 5 : pebble ? 6 : 8, ref:[0,0,1], capStart:0, capEnd:0, flat:true,
        radial: (_, theta) => 1 + .08*Math.sin(theta*3+angle) + .035*Math.cos(theta*5-angle),
        token: ({u, normal}) => {
          if (spec.palette.length === 1) return 0;
          if (spec.palette.length > 2 && normal.y > .65 && i === count-1) return 2;
          return u < 1 ? 0 : i % 2;
        },
        shade: ({u}) => u < 1 ? .79 : .92 + .07*(i % 3)/2,
      });
    }
    const mesh = surface.buildMesh(`${spec.id}_LOD${lod}_stone`);
    // Preserve the catalog's placement footprint without allowing incidental talus
    // or palette accents to determine gameplay collision.
    mesh.geometry.computeBoundingBox(); const box = mesh.geometry.boundingBox!;
    const size = box.getSize(new THREE.Vector3()); const center = box.getCenter(new THREE.Vector3());
    mesh.geometry.translate(-center.x,-box.min.y,-center.z);
    mesh.geometry.scale(spec.dimensions.width*.94/size.x,spec.dimensions.height*.96/size.y,spec.dimensions.depth*.94/size.z);
    return mesh;
  };
  if (spec.lodLevels?.length) assembleLodLevels(spec,root,build); else root.add(build(0));
  addCollisionMarkers(spec,root); return {root,clips:[]};
}

/** Leafy rounded shrub with a dark connected heart and asymmetrical leaf fans. */
export function createRoundBushModel({spec,seed}: GeneratorContext): AuthoredModel {
  const root=new THREE.Group();root.name=spec.rootNode;
  const surface=new SurfaceBuilder(spec.palette);const random=mulberry32(seed);
  for(let i=0;i<8;i++) {
    const a=i*2.399963, reach=i===7?0:.2+random()*.06;
    const x=Math.cos(a)*reach,z=Math.sin(a)*reach*.82,h=i===7?.55:.28+random()*.16;
    rope(surface,[[0,.015,0],[x*.5,h*.55,z*.5],[x,h,z]],.018,3,{sides:5,taper:[1,.45]});
    const r=.17+random()*.035;
    surface.addLoft([{p:[x,h-r*.6,z],w:r*.65,h:r*.63},{p:[x,h,z],w:r,h:r*.88},{p:[x+.018,h+r*.6,z],w:r*.75,h:r*.65}],{sides:7,ref:[0,0,1],capStart:.2,capEnd:.3,flat:true,token:({normal})=>normal.y>.2?0:2,shade:.93});
    // Broad folded leaves break the cluster edge and make it botanical at close range.
    for(let j=0;j<5;j++) {
      const b=a+j*1.256, length=.11+random()*.045;
      const base=new THREE.Vector3(x+Math.cos(b)*r*.62,h+.035,z+Math.sin(b)*r*.62);
      const axis=new THREE.Vector3(Math.cos(b),.5,Math.sin(b)).normalize();
      const side=new THREE.Vector3(-Math.sin(b),0,Math.cos(b));
      surface.addPanel({cols:2,rows:2,thickness:.004,point:(u,v)=>base.clone().addScaledVector(axis,v*length).addScaledVector(side,(u-.5)*.07*Math.sin(Math.PI*(.06+.9*v))).add(new THREE.Vector3(0,Math.abs(u-.5)*-.025,0)),token:()=>j%3===0?1:0,shade:()=>.95});
    }
  }
  root.add(surface.buildMesh(`${spec.id}_mesh`));return {root,clips:[]};
}

/** Reed roots cluster at waterline; tapering stems lean together, blades arch outward. */
export function createReedsModel({spec,seed,parameters:p}:GeneratorContext):AuthoredModel {
 const root=new THREE.Group();root.name=spec.rootNode;
 const build=(lod:number):THREE.Object3D=>{
  const s=new SurfaceBuilder(spec.palette),random=mulberry32(seed),count=Number(p.stalks),height=Number(p.height);
  for(let i=0;i<count;i++) {
   const a=i*2.399963,reach=.08+random()*.22,x=Math.cos(a)*reach,z=Math.sin(a)*reach*.7,h=height*(.65+random()*.35);
   const tip:V3=[x+.10,h,z+.04];
   if(lod && i%2)continue;
   rope(s,[[x,0,z],[x+.025,h*.55,z+.01],tip],.009,0,{sides:3,taper:[1,.45]});
   const blades=lod?2:3;
   for(let j=0;j<blades;j++) {
    const b=a+j*2.1,base=new THREE.Vector3(x+.02,h*(.18+j*.17),z),len=.28+random()*.2;
    const side=new THREE.Vector3(-Math.sin(b),0,Math.cos(b));
    s.addPanel({cols:1,rows:lod?1:2,thickness:.003,point:(u,v)=>base.clone().add(new THREE.Vector3(Math.cos(b)*len*v,len*(1.6*v-1.3*v*v),Math.sin(b)*len*v)).addScaledVector(side,(u-.5)*.04*(1-v*.94)),token:()=>0,shade:()=>.87+j*.05});
   }
   if(i%3===0)rope(s,[[tip[0]-.006,h-.16,tip[2]],[tip[0],h,tip[2]]],.023,1,{sides:4,taper:[.8,.6]});
  }
  return s.buildMesh(`${spec.id}_LOD${lod}_reeds`);
 };
 assembleLodLevels(spec,root,build);return {root,clips:[]};
}
