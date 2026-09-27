import * as THREE from 'three';
import { SurfaceBuilder, assembleLodLevels, type AuthoredModel, type GeneratorContext, type V3 } from '../../kit';
import { rope, sack, timber } from './parts';

/** Ground-centred carry frame, +Z outward, -Z padded harness; metres. */
export function createCraftedTradePackModel(context: GeneratorContext): AuthoredModel {
  const { spec, parameters: p } = context;
  const root = new THREE.Group(); root.name = `${spec.id}_root`;
  const token = (name: string) => {
    const i = spec.palette.indexOf(name);
    if (i < 0) throw new Error(`${spec.id}: missing ${name}`);
    return i;
  };
  const wood = token('wood_honey_01'), dark = token('wood_dark_01'), cloth = token('canvas_cream_01');
  const cord = token('burlap_grain_01'), leather = token('leather_harness_01'), brass = token('metal_brass_01');
  const accent = token(String(p.stripeToken));
  assembleLodLevels(spec, root, level => {
    const detail = level === 0, s = new SurfaceBuilder(spec.palette);
    const group = new THREE.Group();
    const loop = (x: number, y: number, z: number, radius: number, turns: number, material: number) =>
      rope(s, Array.from({ length: (detail ? 12 : 7) * turns + 1 }, (_, i) => {
        const a = i / (detail ? 12 : 7) * Math.PI * 2;
        return [x + Math.cos(a) * radius, y + i * .0014, z + Math.sin(a) * radius] as V3;
      }), .012, material, { sides: detail ? 6 : 4, caps: false });
    // Load-bearing runners, floor, tall harness posts and three braced box walls.
    for (const x of [-.33, .33]) {
      timber(s, [x,.035,-.30], [x,.035,.30], [.035,.035], dark);
      timber(s, [x,.06,-.23], [x,.99,-.23], [.037,.037], wood);
      timber(s, [x,.06,.23], [x,.55,.23], [.035,.035], wood);
      for (const y of [.22,.43]) timber(s, [x,y,-.23], [x,y,.23], [.025,.075], wood);
      loop(x,.44,.23,.052,detail ? 3 : 1,cord);
      loop(x,.85,-.23,.052,detail ? 3 : 1,cord);
    }
    for (const z of [-.18,0,.18]) timber(s, [-.33,.13,z], [.33,.13,z], [.082,.027], wood, { ref:[0,1,0] });
    for (const y of [.23,.43,.88]) timber(s, [-.33,y,-.23], [.33,y,-.23], [.025,.07], dark, { ref:[0,1,0] });
    for (const y of [.22,.43]) timber(s, [-.33,y,.23], [.33,y,.23], [.024,.075], wood, { ref:[0,1,0] });
    for (const x of [-.22,.22]) {
      timber(s, [x,.3,-.28], [-x,.83,-.28], [.019,.025], wood);
      const path: V3[] = [[x,.87,-.29],[x,.91,-.40],[x,.72,-.46],[x,.38,-.46],[x,.24,-.36],[x,.29,-.27]];
      s.addLoft(path.map(p => ({p,w:.043,h:.012})), { sides:4,ref:[1,0,0],capStart:0,capEnd:0,token:leather });
      timber(s, [x-.046,.30,-.405], [x+.046,.30,-.405], [.012,.012], brass);
    }
    s.addPanel({ cols:detail ? 10 : 5, rows:3, thickness:.018,
      point:(u,v) => new THREE.Vector3((u-.5)*.58,.52-v*(.25+.045*(1-Math.abs(u-.5)*2)),.265+.018*Math.sin(u*Math.PI*4)*v),
      token:u=>Math.abs(u-.25)<.065 || Math.abs(u-.75)<.065 ? accent : cloth });
    s.addDisc([0,.37,.291],[0,0,1],.054,{token:brass,sides:detail?12:6,dome:.007});
    // Contents rest on the same floor datum; the open top communicates the family.
    if (p.load === 'provisions') {
      sack(s,[-.15,.16,0],[.29,.31,.60],cloth,cord,{seed:context.seed,lean:-.035});
      sack(s,[.15,.16,.02],[.27,.30,.52],cord,leather,{seed:context.seed+1,lean:.07});
      sack(s,[0,.16,-.13],[.25,.20,.68],cloth,cord,{seed:context.seed+2,lean:.04});
    } else if (p.load === 'textiles') {
      for (const [x,y] of [[-.15,.33],[.15,.33],[0,.60]]) {
        s.addLoft([{p:[x,y,-.17],w:.13,h:.13},{p:[x,y,.18],w:.13,h:.13}],
          {sides:detail?16:8,ref:[0,1,0],capStart:.1,capEnd:.1,token:x===0?accent:cloth});
        for (const z of [-.13,.13]) rope(s,Array.from({length:detail?25:13},(_,i)=>{
          const a=i/(detail?24:12)*Math.PI*2;return [x+Math.cos(a)*.135,y+Math.sin(a)*.135,z] as V3;
        }),.013,leather,{sides:4,caps:false});
        s.addDisc([x,y,.20],[0,0,1],.04,{token:cord,sides:detail?10:6,dome:.005});
      }
    } else if (p.load === 'workshop') {
      for (const x of [-.22,-.11,0,.11,.22]) {
        timber(s,[x,.17,-.11],[x+.02,.82,-.11],[.047,.06],x>0?brass:dark,{bevel:.008});
      }
      for(const z of [.05,.15]) {
        timber(s,[-.26,.3,z],[.26,.3,z],[.044,.035],brass,{bevel:.008});
        timber(s,[-.26,.4,z],[.26,.4,z],[.044,.035],dark,{bevel:.008});
      }
      for (const y of [.52,.71]) rope(s,[[-.27,y,-.19],[.28,y,-.19],[.28,y,-.03],[-.27,y,-.03],[-.27,y,-.19]],.019,leather,{sides:4,caps:false});
    } else {
      sack(s,[-.18,.16,-.01],[.28,.34,.56],accent,leather,{seed:context.seed});
      for (const y of [.20,.25,.30,.35,.40,.45]) loop(.15,y,.02,.12,1,cord);
      s.addLoft([{p:[.16,.48,.02],w:.105,h:.09},{p:[.16,.68,.02],w:.12,h:.105},{p:[.16,.77,.02],w:.07,h:.055}],
        {sides:detail?12:6,ref:[0,0,1],capStart:0,capEnd:.2,token:cloth});
      loop(.16,.66,.02,.117,1,accent);
    }
    const mesh = s.buildMesh(`${spec.id}_freight_${level}`);
    // Shared sack parts have a vertex tone gradient; this asset declares one
    // rest colour per face. Split faces also give the tightly rolled ends
    // their own outward normals instead of averaging across the cap seam.
    const original = mesh.geometry;
    mesh.geometry = original.index ? original.toNonIndexed() : original;
    if (mesh.geometry !== original) original.dispose();
    mesh.geometry.computeVertexNormals();
    const colors = mesh.geometry.getAttribute('color');
    for (let i = 0; i < colors.count; i += 3) {
      const r = (colors.getX(i) + colors.getX(i+1) + colors.getX(i+2)) / 3;
      const g = (colors.getY(i) + colors.getY(i+1) + colors.getY(i+2)) / 3;
      const b = (colors.getZ(i) + colors.getZ(i+1) + colors.getZ(i+2)) / 3;
      for (let j = 0; j < 3; j++) colors.setXYZ(i+j,r,g,b);
    }
    group.add(mesh);
    return group;
  });
  return { root, clips:[] };
}
