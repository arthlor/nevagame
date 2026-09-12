"""Editable six-stage crop studies built from the registered catalog generators.

Load with runpy in Blender and call build_workshop(["wheat", "tomato"]).
Each species receives a scene; previous scenes remain available. The workshop
is an inspection artifact. The ordinary selected art CLI owns GLB publication.
"""
import importlib
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/blender"))
from common.pipeline import create_root
from common.geometry import finish_authored_surface
from generators import crops, registry


def show_crop(species):
    scene = bpy.data.scenes[f"Crops | {species}"]
    bpy.context.window.scene = scene
    camera = scene.camera
    for screen in bpy.data.screens:
        for area in screen.areas:
            for space in area.spaces:
                if space.type != "VIEW_3D":
                    continue
                space.shading.type = "SOLID"
                space.shading.color_type = "MATERIAL"
                space.shading.light = "STUDIO"
                space.overlay.show_overlays = False
                space.camera = camera
                space.region_3d.view_perspective = "CAMERA"
                space.region_3d.view_camera_zoom = 25
    return scene.name


def build_workshop(species_names, *, save=True):
    for module in (crops, registry):
        importlib.reload(module)
    catalog = json.loads((ROOT / "assets/specs/asset-catalog.json").read_text())
    stages = ("seeded", "sprout", "growing", "mature", "overripe", "withered")
    by_id = {a["id"]: a for a in catalog["assets"] if a["family"] == "crop"}
    selected = [[by_id[f"crop_{species}_{stage}"] for stage in stages]
                for species in species_names]
    if not selected:
        raise ValueError("Select crop species with six catalog stages")
    for species, specs in zip(species_names, selected):
        name = f"Crops | {species}"
        previous = bpy.data.scenes.get(name)
        if previous:
            previous.name = f"Previous | {species}"
        scene = bpy.data.scenes.new(name)
        bpy.context.window.scene = scene
        spacing = max(a["dimensions"]["width"] for a in specs) + .35
        height = max(a["dimensions"]["height"] for a in specs)
        for i, spec in enumerate(specs):
            root = create_root(spec["rootNode"])
            registry.resolve_generator(spec["generator"])(spec, root)
            bpy.context.view_layer.update()
            for obj in root.children_recursive:
                if obj.type == "MESH" and spec.get("surfaceAuthoring"):
                    finish_authored_surface(obj, root)
                obj.select_set(False)
            root.location.x = (i - 2.5) * spacing
            root.select_set(False)
            label_data = bpy.data.curves.new(f"{species}_{stages[i]}_label", "FONT")
            label_data.body = stages[i].title()
            label_data.align_x = "CENTER"
            label_data.size = spacing * .082
            label = bpy.data.objects.new(label_data.name, label_data)
            scene.collection.objects.link(label)
            label.location = (root.location.x, -.22, -.26)
            label.rotation_euler = (1.5708, 0, 0)
        camera_data = bpy.data.cameras.new(f"{species}_review_camera")
        camera = bpy.data.objects.new(camera_data.name, camera_data)
        scene.collection.objects.link(camera)
        target = Vector((0, 0, height * .43))
        camera.location = (0, -14, 6.0)
        camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
        camera_data.type = "ORTHO"
        camera_data.ortho_scale = spacing * 6.25
        scene.camera = camera
        scene.render.engine = "BLENDER_WORKBENCH"
        scene.render.resolution_x = 1800
        scene.render.resolution_y = 750
        scene.render.resolution_percentage = 100
        scene.display.shading.light = "STUDIO"
        scene.display.shading.color_type = "MATERIAL"
        scene.display.shading.show_shadows = True
        scene.display.shading.show_cavity = True
        scene.display.shading.cavity_type = "BOTH"
        scene.display.shading.background_type = "WORLD"
        world = bpy.data.worlds.new(f"{species}_review_world")
        world.color = (.72, .72, .72)
        scene.world = world
        scene.view_settings.view_transform = "Standard"
        scene.view_settings.look = "None"
    show_crop(species_names[0])
    if save:
        output = ROOT / "art/workshops/crops.blend"
        output.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(output))
        print(f"Created editable crop stages in {output}")
    return [scene[0]["id"].rsplit("_", 1)[0] for scene in selected]
