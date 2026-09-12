"""Editable vegetation studies built from the registered catalog generators.

Run build_workshop(asset_ids) in Blender's Python console. Each selected asset
gets its own scene at metre scale; show_asset(id) frames its visible LOD0.
The ordinary art CLI owns validation and publication, never this workshop.
"""
import importlib
import json
import sys
from pathlib import Path

import bpy
from mathutils import Quaternion, Vector

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/blender"))
from common.pipeline import create_root
from common.geometry import finish_authored_surface
from common import authored
from generators import vegetation, woodland, coastal, registry


def show_asset(asset_id):
    scene = bpy.data.scenes[f"Vegetation | {asset_id}"]
    bpy.context.window.scene = scene
    bpy.context.view_layer.update()
    points = [obj.matrix_world @ Vector(corner) for obj in scene.objects
              if obj.type == "MESH" and not obj.hide_get() for corner in obj.bound_box]
    lower = Vector(tuple(min(p[i] for p in points) for i in range(3)))
    upper = Vector(tuple(max(p[i] for p in points) for i in range(3)))
    for screen in bpy.data.screens:
        for area in screen.areas:
            # Console workspaces retain their previous 3D space.
            for space in area.spaces:
                if space.type != "VIEW_3D":
                    continue
                space.shading.type = "SOLID"
                space.shading.color_type = "MATERIAL"
                space.shading.light = "STUDIO"
                space.overlay.show_overlays = False
                space.region_3d.view_location = (lower + upper) / 2
                space.region_3d.view_distance = max(upper-lower) * 1.65
                space.region_3d.view_rotation = Quaternion((.88,.34,.13,.29)).normalized()
                space.region_3d.view_perspective = "ORTHO"
    return scene.name


def build_workshop(asset_ids):
    for module in (authored, vegetation, woodland, coastal, registry):
        importlib.reload(module)
    catalog = json.loads((ROOT / "assets/specs/asset-catalog.json").read_text())
    by_id = {a["id"]: a for a in catalog["assets"]}
    selected = [by_id[asset_id] for asset_id in asset_ids]
    if not selected or any(a["family"] != "vegetation" for a in selected):
        raise ValueError("Select vegetation catalog IDs")
    for spec in selected:
        name = f"Vegetation | {spec['id']}"
        previous = bpy.data.scenes.get(name)
        if previous:
            previous.name = f"Previous | {spec['id']}"
        scene = bpy.data.scenes.new(name)
        bpy.context.window.scene = scene
        root = create_root(spec["rootNode"])
        registry.resolve_generator(spec["generator"])(spec, root)
        bpy.context.view_layer.update()
        for obj in root.children_recursive:
            if obj.type == "MESH" and spec.get("surfaceAuthoring"):
                finish_authored_surface(obj, root)
            ancestors = [obj]
            parent = obj.parent
            while parent:
                ancestors.append(parent)
                parent = parent.parent
            if any("_LOD1" in p.name or p.name.startswith("COL_") for p in ancestors):
                obj.hide_set(True)
                obj.hide_render = True
            obj.select_set(False)
        root.select_set(False)
    show_asset(selected[0]["id"])
    output = ROOT / "art/workshops/vegetation.blend"
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output))
    print(f"Created {len(selected)} editable vegetation scenes in {output}")
    return [a["id"] for a in selected]
