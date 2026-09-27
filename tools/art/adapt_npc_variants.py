"""Prepare retained B-cast rigs and distinct ambient derivatives; never publish.

Run in a fresh background Blender process. Sources are immutable local captures;
the resulting collections are inputs to the registered imported_blend generator.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import re
import struct
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools/blender'))
from common.materials import MATERIAL_SPECS, get_or_create_material, hex_to_linear_rgba

# These are authoring recipes, not runtime identities or a second asset catalog.
VARIATIONS = {
    'male_01': ('tomas', 1.86, 'cloth_olive_01', 'cloth_slate_01', 'hair_silver_01', 'swept'),
    'male_02': ('rowan', 1.98, 'cloth_ochre_01', 'cloth_olive_01', 'hair_brown_01', 'swept'),
    'male_03': ('silas', 1.82, 'cloth_teal_01', 'cloth_rust_01', 'hair_silver_01', 'swept'),
    'female_01': ('ines', 1.82, 'cloth_rust_01', 'cloth_slate_01', 'hair_silver_01', 'bun'),
    'female_02': ('mara', 1.91, 'cloth_olive_01', 'cloth_ochre_01', 'hair_brown_01', 'swept'),
    'female_03': ('ada', 1.78, 'cloth_ochre_01', 'cloth_teal_01', 'hair_brown_01', 'bun'),
}
HEIGHTS = dict(barnaby=2.0, elspeth=1.95, silas=1.90, maeve=1.88, tomas=1.95, ines=1.95, rowan=2.0, mara=1.90, ada=1.88)


def curves(action):
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                yield from bag.fcurves


def recolor_surface(mesh, image, recipe):
    """Rasterize rest-space garment/hair regions into the retained source UVs.

    Face and hand regions stay untouched. Original luminance carries broad
    folds; palette hues define each outfit. No whole-character tint is used.
    """
    w, h = image.size
    pixels = np.array(image.pixels[:], dtype=np.float32).reshape(h, w, 4)
    original = pixels.copy()
    uv = mesh.data.uv_layers.active.data
    mesh.data.calc_loop_triangles()
    for tri in mesh.data.loop_triangles:
        verts = np.array([mesh.data.vertices[v].co[:] for v in tri.vertices])
        center = verts.mean(axis=0)
        x, y, z = center
        token = None
        if .21 < z < .76 and (abs(x) < .24 or z < .65):
            token = recipe[2] if z > .50 else recipe[3]
        elif z > .89 and (y > .005 or z > .93):
            token = recipe[4]
        if token is None:
            continue
        coords = np.array([uv[i].uv[:] for i in tri.loops]) * [w - 1, h - 1]
        lo = np.maximum(np.floor(coords.min(axis=0)).astype(int), 0)
        hi = np.minimum(np.ceil(coords.max(axis=0)).astype(int), [w - 1, h - 1])
        if np.any(hi < lo): continue
        xx, yy = np.meshgrid(np.arange(lo[0], hi[0] + 1), np.arange(lo[1], hi[1] + 1))
        p = np.stack([xx, yy], axis=-1)
        a,b,c = coords
        denom = (b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
        if abs(denom) < 1e-7: continue
        u = ((b[1]-c[1])*(p[:,:,0]-c[0])+(c[0]-b[0])*(p[:,:,1]-c[1]))/denom
        v = ((c[1]-a[1])*(p[:,:,0]-c[0])+(a[0]-c[0])*(p[:,:,1]-c[1]))/denom
        mask = (u >= -.025) & (v >= -.025) & (u+v <= 1.025)
        block = pixels[lo[1]:hi[1]+1, lo[0]:hi[0]+1, :3]
        # Packed image pixels are encoded sRGB; vertex colors use linear values.
        rgb = MATERIAL_SPECS[token]['hex'].lstrip('#')
        color = np.array([int(rgb[i:i+2], 16)/255 for i in (0,2,4)])
        source = original[lo[1]:hi[1]+1, lo[0]:hi[0]+1, :3]
        lum = source @ np.array([.2126,.7152,.0722])
        shade = np.clip(.72 + lum*.8, .72, 1.04)
        block[mask] = (shade[:,:,None] * color)[mask]
    image.pixels.foreach_set(pixels.ravel())
    image.pack()


def head_piece(rig, mesh, asset_id, style, token):
    """An adapted crown or tied hair mass, fully weighted to the retained head."""
    head = next(b for b in rig.data.bones if b.name in ('head', 'mixamorig:Head'))
    if style == 'swept':
        # Broaden the crown asymmetrically without touching facial geometry.
        for v in mesh.data.vertices:
            if v.co.z > .947:
                t = min(1, (v.co.z-.947)/.052)
                v.co.x += .013*t
                v.co.z += .014*t
        return
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, location=(.012,.104,.927))
    obj=bpy.context.object; obj.name=asset_id+'_hair_bun'; obj.scale=(.047,.041,.045)
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    mat=get_or_create_material(token)
    mat['neva_source_material']=token
    mat['neva_palette_token']=token
    obj.data.materials.append(mat)
    col=obj.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
    for datum in col.data: datum.color=hex_to_linear_rgba(MATERIAL_SPECS[token]['hex'])
    obj.vertex_groups.new(name=head.name).add(list(range(len(obj.data.vertices))),1,'REPLACE')
    mod=obj.modifiers.new('Retained head binding','ARMATURE'); mod.object=rig
    obj.parent=rig


def prepare(asset_id):
    variant = asset_id.removeprefix('char_npc_ambient_') if asset_id.startswith('char_npc_ambient_') else None
    recipe=VARIATIONS[variant] if variant else None
    donor=recipe[0] if recipe else asset_id.removeprefix('char_npc_').removesuffix('_b')
    height=recipe[1] if recipe else HEIGHTS[donor]
    source=ROOT/f'art/imported/tripo/sources/npc-b/char_npc_{donor}_b.glb'
    raw=source.read_bytes(); doc=json.loads(raw[20:20+struct.unpack_from('<I',raw,12)[0]])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps=30
    bpy.ops.import_scene.gltf(filepath=str(source), import_scene_as_collection=False)
    rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
    mesh=next(o for o in bpy.context.scene.objects if o.type=='MESH' and any(m.type=='ARMATURE' for m in o.modifiers))
    # glTF's importer creates a bone-display helper outside the asset hierarchy.
    for obj in list(bpy.context.scene.objects):
        if obj not in (rig,mesh): bpy.data.objects.remove(obj,do_unlink=True)
    rig.name=asset_id+'_rig'; mesh.name=asset_id+'_body'
    material=mesh.data.materials[0]; material.name='npc_surface'; material['neva_palette_token']='cloth_slate_01'; material['neva_source_material']='npc_surface'
    image=next(n.image for n in material.node_tree.nodes if n.type=='TEX_IMAGE' and n.image)
    if recipe:
        image=image.copy(); image.name=asset_id+'_outfit'
        for node in material.node_tree.nodes:
            if node.type=='TEX_IMAGE' and node.image: node.image=image
        recolor_surface(mesh,image,recipe)
        # Ambient figures are read at gameplay distance. Keep their diffuse
        # maps bounded; copying an edited source image otherwise embeds a huge PNG.
        image.scale(1024, 1024)
        texture_path = ROOT / f'output/npc-ambient/{asset_id}.jpg'
        image.filepath_raw = str(texture_path)
        image.file_format = 'JPEG'
        image.save()
        image = bpy.data.images.load(str(texture_path), check_existing=False)
        for node in material.node_tree.nodes:
            if node.type == 'TEX_IMAGE' and node.image: node.image = image
        head_piece(rig,mesh,asset_id,recipe[5],recipe[4])
    image.pack()
    # Uniform metre conversion applies to mesh/rest joints and every translation
    # channel together, preserving bind space and the full native performance.
    rig.data.transform(Matrix.Scale(height,4))
    for obj in bpy.context.scene.objects:
        if obj.type=='MESH': obj.data.transform(Matrix.Scale(height,4))
    clip_specs=[]
    for action in bpy.data.actions:
        source_name=action.name
        action.name=re.sub(r'\.\d+$','',action.name)
        for curve in curves(action):
            if curve.data_path.endswith('location'):
                for key in curve.keyframe_points:
                    key.co.y*=height; key.handle_left.y*=height; key.handle_right.y*=height
        # The retained captures include anticipation and recovery, not guaranteed
        # closed loops. Runtime playback policy is separate from source evidence.
        action['neva_loop']=False
        clip_specs.append(dict(name=action.name,durationSeconds=(action.frame_range[1]-action.frame_range[0])/30,loop=False, motionSource=dict(kind='native',sourceTimebase='seconds',sourceClip=source_name,sourceDurationSeconds=(action.frame_range[1]-action.frame_range[0])/30)))
    for track in rig.animation_data.nla_tracks:
        track.name=re.sub(r'\.\d+$','',track.name)
        track.mute=True
        for strip in track.strips: strip.name=strip.action.name
    rig.animation_data.action=None
    for bone in rig.pose.bones: bone.matrix_basis=Matrix.Identity(4)
    root=bpy.data.objects.new(asset_id+'_root',None); bpy.context.collection.objects.link(root); rig.parent=root
    sockets=[]
    for side in ['left','right']:
        hand=next(b for b in rig.data.bones if b.name in (f'hand_{side}',f'hand_{side[0]}',f'mixamorig:{side.title()}Hand'))
        socket=bpy.data.objects.new(asset_id+'_hand_socket_'+side,None); bpy.context.collection.objects.link(socket)
        socket.parent=rig; socket.parent_type='BONE'; socket.parent_bone=hand.name
        socket['neva_marker']='socket'; sockets.append(socket.name)
    collection=bpy.data.collections.new(asset_id); bpy.context.scene.collection.children.link(collection)
    for obj in list(bpy.context.scene.objects):
        for old in list(obj.users_collection): old.objects.unlink(obj)
        collection.objects.link(obj)
    bpy.context.scene.frame_set(0); bpy.context.view_layer.update()
    path=ROOT/f'art/imported/tripo/npcs/{asset_id}.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(path), check_existing=False)
    points=[v.co for o in collection.all_objects if o.type=='MESH' for v in o.data.vertices]
    dims=[max(v[i] for v in points)-min(v[i] for v in points) for i in range(3)]
    triangles=sum(len(o.data.polygons) for o in collection.all_objects if o.type=='MESH')
    palette=['cloth_slate_01'] + ([recipe[4]] if recipe and recipe[5]=='bun' else [])
    spec=dict(id=asset_id,file=asset_id+'.glb',family='character',generator='imported_blend',seed=801,
      dimensions=dict(width=dims[0],depth=dims[1],height=dims[2]),palette=list(dict.fromkeys(palette)),
      budget=dict(trianglesMin=7500,trianglesTarget=18000,trianglesMax=25000,materialsMax=2),
      pivot='ground_center',collision='none',instancing=False,lod='small',rootNode=root.name,
      requiredNodes=[root.name,rig.name,mesh.name,*sockets],rigNode=rig.name,socketNodes=sockets,
      animationClips=clip_specs,readDistanceMeters=30,
      parameters=dict(sourceBlend=str(path.relative_to(ROOT)),sourceCollection=asset_id),
      sourceProvenance=dict(provider='tripo',modelId=doc['meshes'][0]['name'].removeprefix('tripo_mesh_'),
        sourceUrl='https://www.tripo3d.ai/',author='Neva project owner',license='Tripo-Terms',licenseUrl='https://www.tripo3d.ai/terms',
        sourceBlend=str(path.relative_to(ROOT)),sourceSha256=hashlib.sha256(path.read_bytes()).hexdigest(),
        attribution=f'Local {donor} B-cast Tripo capture, retaining the source rig and all native performances.' + (f' Ambient {variant}: palette outfit, hair and headwear adapted by adapt_npc_variants.py.' if variant else '')),
      skinnedAuthoring=dict(uniformScale=height,sourceFile=str(source.relative_to(ROOT)),sourceSha256=hashlib.sha256(raw).hexdigest(),adapter='tools/blender/adapt_npc_variants.py',
        materialMap=dict(npc_surface=dict(sourceMaterial=doc['materials'][0]['name'],token='cloth_slate_01',value=1,texturePolicy='preserve'))))
    if recipe and recipe[5]!='swept':
        token=recipe[4]
        spec['skinnedAuthoring']['materialMap'][token]=dict(sourceMaterial='authored_headwear',token=token,value=1,texturePolicy='none')
    (ROOT/f'output/npc-ambient/{asset_id}.json').write_text(json.dumps(spec,indent=2)+'\n')
    print('NPC_PREPARED',asset_id,len(rig.data.bones),len(clip_specs),dims)

if __name__=='__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--asset',action='append',required=True)
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    for asset_id in args.asset: prepare(asset_id)
