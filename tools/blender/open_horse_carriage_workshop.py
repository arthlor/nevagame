"""Editable assembly review through the registered catalog generators."""
import json
import sys
from pathlib import Path
import bpy
from mathutils import Quaternion, Vector

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools/blender'))
from common.pipeline import create_root
from generators.registry import resolve_generator
from common.geometry import finish_authored_surface, authored_rest_transforms


def build_workshop():
    catalog=json.loads((ROOT/'assets/specs/asset-catalog.json').read_text())
    by_id={a['id']:a for a in catalog['assets']}
    scene=bpy.data.scenes.new('Horse and merchant carriage | workshop')
    bpy.context.window.scene=scene
    roots=[]
    for id,position in [('fauna_horse_draft_a',(0,-3.50,0)),('prop_merchant_carriage_a',(0,0,0)),
                        ('prop_trade_pack_wheat_a',(0,-.08,.929)),('prop_trade_pack_barley_a',(0,.858,.929))]:
        spec=by_id[id]; root=create_root(spec['rootNode']); roots.append(root)
        resolve_generator(spec['generator'])(spec,root)
        objects=[root,*root.children_recursive]
        rest=authored_rest_transforms(objects)
        for obj in objects:
            if obj.type=='MESH' and spec.get('surfaceAuthoring'):
                finish_authored_surface(obj,root,object_to_asset=rest[root].inverted()@rest[obj])
            if '_LOD1' in obj.name or '_far' in obj.name:
                obj.hide_set(True); obj.hide_render=True
            if obj.animation_data:
                for track in obj.animation_data.nla_tracks:
                    track.mute=track.name!='walk'
                    for strip in track.strips:
                        if track.name=='walk': strip.repeat=12
        root.location=position
    # Loaded packs follow the actual cargo markers, including suspension motion.
    carriage=roots[1]
    for index,pack in enumerate(roots[2:],1):
        socket=next(o for o in carriage.children_recursive if ('_cargo_%02d'%index) in o.name)
        pack.parent=socket; pack.location=(0,0,0)
    scene.render.fps=25; scene.frame_start=0; scene.frame_end=239; scene.frame_set(0)
    for obj in scene.objects: obj.select_set(False)
    for root in roots: root.select_set(True)
    bpy.context.view_layer.objects.active=roots[0]
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':
                area.spaces.active.shading.color_type='MATERIAL'
                area.spaces.active.region_3d.view_location=(0,-1.6,1.1)
                area.spaces.active.region_3d.view_distance=10
                area.spaces.active.region_3d.view_rotation=Quaternion((.84,.36,.17,.36)).normalized()
    camera_data=bpy.data.cameras.new('Carriage review camera')
    camera_data.type='ORTHO'; camera_data.ortho_scale=8.6
    camera=bpy.data.objects.new('Carriage review camera',camera_data)
    scene.collection.objects.link(camera); camera.location=(7,-10,6)
    camera.rotation_euler=(Vector((0,-1.8,1.1))-camera.location).to_track_quat('-Z','Y').to_euler()
    scene.camera=camera
    for name,location,energy,size,color in [
        ('Warm key',(1,-5,7),1700,5,(1,.86,.69)),
        ('Cool fill',(-5,-2,4),1100,5,(.69,.82,1)),
        ('Edge light',(2,5,6),1500,4,(1,.91,.77))]:
        data=bpy.data.lights.new(name,'AREA'); data.energy=energy; data.shape='DISK'; data.size=size; data.color=color
        light=bpy.data.objects.new(name,data); scene.collection.objects.link(light); light.location=location
        light.rotation_euler=(Vector((0,-1.5,1))-light.location).to_track_quat('-Z','Y').to_euler()
    world=bpy.data.worlds.new('Carriage studio'); scene.world=world
    background=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND')
    background.inputs['Color'].default_value=(.18,.21,.25,1); background.inputs['Strength'].default_value=.5
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.006))
    ground=bpy.context.object; ground.name='Review ground'
    material=bpy.data.materials.new('Review ground matte')
    shader=next(n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    shader.inputs['Base Color'].default_value=(.17,.195,.19,1); shader.inputs['Roughness'].default_value=.9
    ground.data.materials.append(material)
    scene.render.resolution_x=1500; scene.render.resolution_y=1150; scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'
    scene.render.filepath=str(ROOT/'output/horse-carriage-20260916/horse-carriage.png')
    note=bpy.data.texts.new('Horse and carriage — review guide')
    note.write('Horse: idle, walk, trot. Carriage: idle, walk, trot, load.\n'
               'Use NLA track mute/solo to choose a clip. The workshop opens on repeating walk.\n'
               'Horse is a skinned 18-bone rig with baked two-link hoof placement.\n'
               'Wheels rotate on local X; front axle turns on local Z; tailgate pivots on local X.\n'
               'Two trade packs are parented to cargo_01 and cargo_02.\n'
               'Simulation cargo capacity and drivable transport are separate gameplay work.\n')
    out=ROOT/'art/workshops/horse-carriage.blend'; out.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(out))
    print('Saved editable workshop:',out)


if __name__=='__main__':
    build_workshop()
