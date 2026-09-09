"""Create an editable Blender workshop from selected registered pack assets.

Run in Blender's Python console with build_workshop([...]). Publication remains
the ordinary art CLI; this helper neither exports GLBs nor edits the catalog.
"""
import json
import sys
from pathlib import Path

import bpy
from mathutils import Quaternion

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools/blender'))
from common.pipeline import create_root
from generators.registry import resolve_generator


def build_workshop(asset_ids):
    catalog = json.loads((ROOT / 'assets/specs/asset-catalog.json').read_text())
    by_id = {asset['id']: asset for asset in catalog['assets']}
    selected = [by_id[asset_id] for asset_id in asset_ids]
    if not selected or any(a['generator'] not in ('fish_trade_pack', 'crop_trade_pack') for a in selected):
        raise ValueError('Select explicit fish/crop trade pack catalog IDs')
    previous = bpy.data.scenes.get('Neva Trade Pack Workshop')
    if previous:
        previous.name = 'Previous Trade Pack Workshop'
    scene = bpy.data.scenes.new('Neva Trade Pack Workshop')
    bpy.context.window.scene = scene
    results = []
    roots = []
    for index, spec in enumerate(selected):
        root = create_root(spec['rootNode'])
        roots.append(root)
        resolve_generator(spec['generator'])(spec, root)
        root.location = ((index % 5) * 1.65, (index // 5) * 1.65, 0)
        for obj in root.children_recursive:
            if '_LOD1' in obj.name:
                obj.hide_set(True)
                obj.hide_render = True
        results.append(spec['id'])
    for obj in scene.objects:
        obj.select_set(False)
    first = roots[0]
    first.select_set(True)
    bpy.context.view_layer.objects.active = first
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == 'VIEW_3D':
                area.spaces.active.shading.color_type = 'MATERIAL'
                area.spaces.active.region_3d.view_location = (3.3, 2.45, .5)
                area.spaces.active.region_3d.view_distance = 11
                area.spaces.active.region_3d.view_rotation = Quaternion((.88,.34,.13,.29)).normalized()
    output = ROOT / 'art/workshops/trade-packs.blend'
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output))
    report = ROOT / 'output/trade-packs/computer-workshop.json'
    report.write_text(json.dumps({'assets': results, 'blenderVersion': bpy.app.version_string,
                                 'source': str(output), 'scene': scene.name}, indent=2)+'\n')
    print(f'Created {len(results)} registered trade packs in {output}')
