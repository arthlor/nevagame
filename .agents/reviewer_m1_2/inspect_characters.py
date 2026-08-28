import sys
sys.path.insert(0, 'tools/blender')
import bpy
import json
import bmesh
from generators.characters import coastal_worker, npc_character, _rig_bone_for_mesh

with open('assets/specs/asset-catalog.json') as f:
    catalog = json.load(f)

character_assets = [a for a in catalog['assets'] if a['family'] == 'character']

for spec in character_assets:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    root = bpy.data.objects.new(spec['rootNode'], None)
    bpy.context.scene.collection.objects.link(root)
    generator_fn = coastal_worker if spec['generator'] == 'coastal_worker' else npc_character
    generator_fn(spec, root)
    bpy.context.view_layer.update()
    
    print(f"\n================ ASSET: {spec['id']} ================")
    # Check sockets
    for socket in spec.get('socketNodes', []):
        obj = bpy.data.objects.get(socket)
        if obj is None:
            print(f"MISSING SOCKET: {socket}")
        else:
            print(f"Socket {socket}: parent={obj.parent.name if obj.parent else None}, parent_type={obj.parent_type}, parent_bone={obj.parent_bone}")
    
    # Check mesh objects and vertex groups
    mesh_objs = [obj for obj in bpy.data.objects if obj.type == 'MESH']
    print(f"Total mesh objects: {len(mesh_objs)}")
    for obj in mesh_objs:
        vg_names = [vg.name for vg in obj.vertex_groups]
        # Check for duplicate vertex group names
        if len(vg_names) != len(set(vg_names)):
            print(f"DUPLICATE VERTEX GROUPS in {obj.name}: {vg_names}")
        
        # Check vertex color layers (COLOR_0)
        color_layers = list(obj.data.color_attributes.keys())
        print(f"Mesh: {obj.name} | parent: {obj.parent.name if obj.parent else None} | VGs: {vg_names} | Colors: {color_layers} | Vertices: {len(obj.data.vertices)} | Polygons: {len(obj.data.polygons)}")
        
        # Check non-manifold geometry using bmesh
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        non_manifold_verts = [v for v in bm.verts if not v.is_manifold]
        non_manifold_edges = [e for e in bm.edges if not e.is_manifold]
        if non_manifold_verts or non_manifold_edges:
            print(f"  [GEOM NOTICE] {obj.name}: {len(non_manifold_verts)} non-manifold verts, {len(non_manifold_edges)} non-manifold edges")
        bm.free()

