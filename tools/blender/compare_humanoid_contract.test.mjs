import assert from "node:assert/strict";
import test from "node:test";
import { Document } from "@gltf-transform/core";
import { Matrix4 } from "three";
import { compareDocuments, compareNativeAnimations, compareTriangleSurfaces, maxArrayError } from "./compare_humanoid_contract.mjs";

function fixture() {
  const doc=new Document(),buffer=doc.createBuffer(),joint=doc.createNode("Root");
  const scene=doc.createScene();scene.addChild(joint);
  const accessor=(type,array)=>doc.createAccessor().setType(type).setArray(new Float32Array(array)).setBuffer(buffer);
  const bind=accessor("MAT4",[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
  const skin=doc.createSkin().addJoint(joint).setInverseBindMatrices(bind);
  const position=accessor("VEC3",[0,0,0,1,0,0,0,1,0]);
  const normals=accessor("VEC3",[0,0,1,0,0,1,0,0,1]);
  const uv=accessor("VEC2",[0,0,1,0,0,1]);
  const weights=accessor("VEC4",[1,0,0,0,1,0,0,0,1,0,0,0]);
  const joints=doc.createAccessor().setType("VEC4").setArray(new Uint16Array(12)).setBuffer(buffer);
  const material=doc.createMaterial("skin_warm_01");
  const primitive=doc.createPrimitive().setAttribute("POSITION",position).setAttribute("NORMAL",normals).setAttribute("TEXCOORD_0",uv).setAttribute("WEIGHTS_0",weights).setAttribute("JOINTS_0",joints).setMaterial(material);
  const mesh=doc.createNode("BodyMesh").setMesh(doc.createMesh().addPrimitive(primitive)).setSkin(skin);scene.addChild(mesh);
  return {doc,joint,mesh,position,normals,uv,weights,material,bind};
}

test("decoded identity and a uniform coordinate conversion preserve the source",()=>{
  assert.equal(compareDocuments(fixture().doc,fixture().doc).passed,true);
  const target=fixture();target.mesh.setScale([2,2,2]).setTranslation([0,1,0]);
  assert.equal(compareDocuments(fixture().doc,target.doc).passed,true);
});

test("rejects anatomy, normals, UVs, weights and material-region corruption",()=>{
  for(const mutate of [
    f=>f.position.getArray()[3]=1.2,
    f=>f.normals.getArray().set([0,1,0],3),
    f=>f.uv.getArray()[2]=0.8,
    f=>f.weights.getArray()[0]=0.8,
    f=>f.material.setName("plaster_warm_01"),
    f=>f.mesh.setScale([2,1,1])
  ]) {const target=fixture();mutate(target);assert.equal(compareDocuments(fixture().doc,target.doc).passed,false);}
});

test("explicit palette mapping permits recoloring without applying color twice",()=>{
  const source=fixture(),target=fixture();target.material.setName("canvas_cream_01").setBaseColorFactor([.5,.5,.5,1]);
  const options={materialMap:{"BodyMesh/skin_warm_01":"canvas_cream_01"},palette:{canvas_cream_01:[.5,.5,.5]}};
  assert.equal(compareDocuments(source.doc,target.doc,options).passed,true);
  target.material.setBaseColorFactor([.25,.25,.25,1]);
  assert.equal(compareDocuments(source.doc,target.doc,options).passed,false);
});

test("triangle matching accepts cyclic reindexing but rejects winding and removed topology",()=>{
  const v=(position)=>({position,normal:[0,0,1],uv:position.slice(0,2),skin:[["Root",1]],material:"skin",baseColor:[1,1,1,1],color:null});
  const a=v([0,0,0]),b=v([1,0,0]),c=v([0,1,0]);
  assert.equal(compareTriangleSurfaces([[a,b,c]],[[b,c,a]]).passed,true);
  assert.equal(compareTriangleSurfaces([[a,b,c]],[[c,b,a]]).passed,false);
  assert.equal(compareTriangleSurfaces([[a,b,c]],[]).passed,false);
});

test("invalid numeric data cannot compare equal",()=>{
  assert.equal(maxArrayError([0,NaN],[0,1]),Infinity);
  assert.equal(maxArrayError([0],[0,1]),Infinity);
  assert.equal(maxArrayError([0,0,0,1],[0,0,0,-1],true),0);
});

test("declared cleanup cannot conceal removal of visible source geometry",()=>{
  const options={removedDegenerateTriangles:[{part:"BodyMesh",triangleIndex:0,areaMetersSquared:0}]};
  const report=compareDocuments(fixture().doc,fixture().doc,options);
  assert.equal(report.passed,false);
  assert.ok(report.issues.some(issue=>issue.includes("visible triangle")));
  const tiny=fixture();tiny.position.getArray()[3]=1e-9;
  const preserved=compareDocuments(tiny.doc,tiny.doc,options);
  assert.equal(preserved.passed,false,"declared removal must match actual output topology");
});

test("native performance verification catches retiming and pose replacement",()=>{
  const animate=(f)=>{
    const buffer=f.doc.getRoot().listBuffers()[0];
    const input=f.doc.createAccessor().setType("SCALAR").setArray(new Float32Array([0,1])).setBuffer(buffer);
    const output=f.doc.createAccessor().setType("VEC3").setArray(new Float32Array([0,0,0,0,.2,0])).setBuffer(buffer);
    const sampler=f.doc.createAnimationSampler().setInput(input).setOutput(output);
    const channel=f.doc.createAnimationChannel().setTargetNode(f.joint).setTargetPath("translation").setSampler(sampler);
    f.doc.createAnimation("idle").addSampler(sampler).addChannel(channel);
    return {input,output};
  };
  const source=fixture(),candidate=fixture();animate(source);const altered=animate(candidate);
  const clips=[{name:"idle",motionSource:{kind:"native",sourceClip:"idle"}}];
  assert.equal(compareNativeAnimations(source.doc,candidate.doc,clips,new Matrix4())[0].passed,true);
  altered.output.getArray()[4]=.4;
  assert.equal(compareNativeAnimations(source.doc,candidate.doc,clips,new Matrix4())[0].passed,false);
  altered.output.getArray()[4]=.2;altered.input.getArray()[1]=2;
  assert.equal(compareNativeAnimations(source.doc,candidate.doc,clips,new Matrix4())[0].passed,false);
});
