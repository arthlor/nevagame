"""Render deterministic staged asset-review and gameplay-distance evidence."""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def parse_args() -> argparse.Namespace:
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--asset", action="append", default=[])
    parser.add_argument("--asset-id", action="append", default=[])
    parser.add_argument("--read-distance", action="append", default=[], type=float)
    args = parser.parse_args(arguments)
    if not args.asset or not (len(args.asset) == len(args.asset_id) == len(args.read_distance)):
        raise ValueError("Preview asset paths, IDs, and read distances must be complete and aligned")
    return args


def look_at(obj: bpy.types.Object, target: Vector) -> None:
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def material(name: str, color: tuple[float, float, float, float], roughness: float = 0.9):
    value = bpy.data.materials.new(name)
    value.diffuse_color = color
    value.use_nodes = True
    principled = value.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = color
    principled.inputs["Roughness"].default_value = roughness
    return value


def validate_asset_path(value: str) -> Path:
    filename = Path(value).resolve()
    if not filename.is_file() or filename.suffix.lower() != ".glb":
        raise ValueError(f"Unsafe or missing preview asset: {filename}")
    return filename


def import_asset(filename: Path, anchor_name: str):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(filename))
    imported = [obj for obj in bpy.context.scene.objects if obj not in before]
    anchor = bpy.data.objects.new(anchor_name, None)
    bpy.context.collection.objects.link(anchor)
    for obj in imported:
        if obj.parent is None:
            world = obj.matrix_world.copy()
            obj.parent = anchor
            obj.matrix_world = world
        if obj.name.startswith("COL_"):
            obj.hide_render = True
    return anchor, imported


def bounds(imported) -> tuple[Vector, Vector]:
    meshes = [obj for obj in imported if obj.type == "MESH" and not obj.hide_render]
    corners = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
    if not corners:
        return Vector((-0.5, -0.5, 0)), Vector((0.5, 0.5, 1))
    minimum = Vector(tuple(min(point[axis] for point in corners) for axis in range(3)))
    maximum = Vector(tuple(max(point[axis] for point in corners) for axis in range(3)))
    return minimum, maximum


def setup_scene() -> bpy.types.Object:
    world = bpy.context.scene.world or bpy.data.worlds.new("Neva Preview World")
    bpy.context.scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.52, 0.68, 0.76, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.55

    bpy.ops.object.light_add(type="SUN", location=(0, -8, 18))
    sun = bpy.context.active_object
    sun.name = "preview_sun"
    sun.data.energy = 2.4
    sun.rotation_euler = (math.radians(28), math.radians(-24), math.radians(-32))
    bpy.ops.object.light_add(type="AREA", location=(-10, -12, 16))
    fill = bpy.context.active_object
    fill.name = "preview_fill"
    fill.data.energy = 1100
    fill.data.shape = "DISK"
    fill.data.size = 10
    look_at(fill, Vector((0, 0, 2)))

    bpy.ops.object.camera_add()
    camera = bpy.context.active_object
    camera.name = "preview_camera"
    camera.data.lens = 48
    bpy.context.scene.camera = camera

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.resolution_percentage = 100
    scene.view_settings.look = "AgX - Medium High Contrast"
    return camera


def add_ground(size: float = 100.0) -> None:
    bpy.ops.mesh.primitive_plane_add(size=size, location=(0, 0, -0.04))
    ground = bpy.context.active_object
    ground.name = "review_ground"
    ground.data.materials.append(material("review_ground_material", (0.34, 0.43, 0.32, 1)))


def render(output: Path, width: int, height: int) -> None:
    scene = bpy.context.scene
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.filepath = str(output.resolve())
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.render.render(write_still=True)


def render_yard(entries, output_dir: Path) -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    count = len(entries)
    columns = min(5, count)
    rows = math.ceil(count / columns)
    for index, (filename, asset_id, _) in enumerate(entries):
        anchor, imported = import_asset(filename, f"yard_{asset_id}")
        column = index % columns
        row = index // columns
        anchor.location = ((column - (columns - 1) * 0.5) * 8.2, (row - (rows - 1) * 0.5) * 8.0, 0)
        minimum, maximum = bounds(imported)
        dimensions = maximum - minimum
        scale = min(1.0, 6.0 / max(*dimensions, 0.001))
        anchor.scale = (scale, scale, scale)
        anchor.location.z -= minimum.z * scale

    yard_width = max(12.0, columns * 8.2)
    yard_depth = max(12.0, rows * 8.0)
    camera = setup_scene()
    add_ground(max(yard_width + 8, yard_depth + 10))
    framing_extent = max(yard_width, yard_depth)
    camera.location = (0, -max(30, framing_extent * 1.35), max(19, framing_extent * 0.70))
    camera.data.lens = 38
    look_at(camera, Vector((0, 0, 2.2)))
    render(output_dir / "asset-review-yard.png", 1440, 900)


def render_asset_views(filename: Path, asset_id: str, read_distance: float, output_dir: Path) -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _, imported = import_asset(filename, f"review_{asset_id}")
    minimum, maximum = bounds(imported)
    dimensions = maximum - minimum
    center = (minimum + maximum) * 0.5
    center.z = max(center.z, dimensions.z * 0.36)
    extent = max(*dimensions, 0.35)
    camera = setup_scene()
    add_ground(max(100, extent * 10))

    hero_distance = max(2.6, extent * 2.45)
    hero_views = {
        "front": Vector((0, -1, 0.22)),
        "rear": Vector((0, 1, 0.22)),
        "side": Vector((1, 0, 0.22)),
        "three-quarter": Vector((0.72, -0.72, 0.28)),
    }
    for name, direction in hero_views.items():
        camera.location = center + direction.normalized() * hero_distance
        camera.data.lens = 52
        look_at(camera, center)
        render(output_dir / "hero" / asset_id / f"{name}.png", 720, 720)

    gameplay_distances = (
        ("8m", 8.0),
        ("15m", 15.0),
        ("30m", 30.0),
        (f"read-{read_distance:g}m", read_distance),
    )
    gameplay_direction = Vector((0.46, -0.86, 0.20)).normalized()
    for name, distance in gameplay_distances:
        camera.location = center + gameplay_direction * distance
        camera.data.lens = 50
        look_at(camera, center)
        render(output_dir / "gameplay" / asset_id / f"{name}.png", 720, 450)


def render_gameplay_scenes(entries, output_dir: Path) -> None:
    by_id = {asset_id: filename for filename, asset_id, _ in entries}
    scenes = {
        "bridge": (
            (("bridge_stone_a", (0, 0, 0), 0, 1.0), ("foliage_reeds_a", (-4, -3, 0), 0.2, 1.0),
             ("foliage_reeds_a", (4.5, 2.8, 0), -0.3, 1.0), ("rock_coastal_a", (-5.5, 2.2, 0), 0.4, 1.0),
             ("tree_oak_a", (-7, 4.5, 0), 0.2, 1.0), ("tree_oak_b", (7, 5, 0), -0.2, 0.9)),
            Vector((15, -21, 12)), Vector((0, 0, 2.2)),
        ),
        "farm": (
            (("house_farmhouse_a", (0, 4, 0), 0, 1.0), ("prop_water_well_a", (-4.2, 0, 0), 0.2, 1.0),
             ("prop_pumpkin_patch_a", (3.8, -0.5, 0), -0.25, 1.0), ("prop_fence_wood_a", (-1.5, -3.2, 0), 0, 1.0),
             ("prop_fence_wood_a", (2.0, -3.2, 0), 0.04, 1.0), ("prop_hay_bale_a", (5.2, 2.3, 0), 0.5, 1.0),
             ("tree_apple_a", (-6, 4, 0), 0.2, 1.0), ("crop_wheat_mature", (0, -1.2, 0), 0, 1.0)),
            Vector((15, -20, 11)), Vector((0, 1.2, 2.0)),
        ),
        "harbor": (
            (("dock_straight_a", (0, 0, 0), 0, 1.0), ("building_fish_market_a", (0, 6, 0), 0, 1.0),
             ("boat_rowboat_a", (-5.0, -2.0, 0.5), 0.15, 1.0), ("boat_skiff_a", (5.5, -1.5, 0.55), -0.18, 0.9),
             ("prop_crate_wood_a", (-3.0, 2.0, 1.55), 0.2, 1.0), ("prop_barrel_wood_a", (3.0, 2.0, 1.55), 0, 1.0),
             ("prop_lobster_trap_a", (-1.5, 2.0, 1.55), 0.2, 1.0), ("prop_lamp_post_a", (5.0, 4.0, 0), 0, 1.0)),
            Vector((17, -23, 13)), Vector((0, 1.5, 2.2)),
        ),
        "coast": (
            (("building_lighthouse_a", (0, 3, 0), 0, 1.0), ("rock_coastal_a", (-4.0, 0, 0), 0.4, 1.2),
             ("rock_coastal_a", (4.5, 1.2, 0), -0.3, 0.9), ("rock_boulder_a", (3.0, 5.0, 0), 0.2, 0.8),
             ("tree_pine_a", (-6.5, 4.0, 0), 0.15, 0.9), ("cloud_lowpoly_a", (-4, 9, 12), 0, 0.8)),
            Vector((18, -25, 15)), Vector((0, 3, 5.0)),
        ),
    }
    for scene_name, (placements, camera_location, target) in scenes.items():
        if not all(asset_id in by_id for asset_id, *_ in placements):
            continue
        bpy.ops.wm.read_factory_settings(use_empty=True)
        for asset_id, location, rotation, scale in placements:
            filename = by_id.get(asset_id)
            if filename is None:
                raise ValueError(f"Gameplay preview requires staged asset {asset_id}")
            anchor, _ = import_asset(filename, f"{scene_name}_{asset_id}")
            anchor.location = location
            anchor.rotation_euler.z = rotation
            anchor.scale = (scale, scale, scale)
        camera = setup_scene()
        add_ground(120)
        camera.location = camera_location
        camera.data.lens = 44
        look_at(camera, target)
        render(output_dir / "gameplay-candidates" / f"{scene_name}-candidate.png", 1440, 900)


def main() -> None:
    args = parse_args()
    output_dir = Path(args.output_dir).resolve()
    entries = [
        (validate_asset_path(filename), asset_id, distance)
        for filename, asset_id, distance in zip(args.asset, args.asset_id, args.read_distance, strict=True)
    ]
    render_yard(entries, output_dir)
    for filename, asset_id, read_distance in entries:
        render_asset_views(filename, asset_id, read_distance, output_dir)
    render_gameplay_scenes(entries, output_dir)
    print(f"[NEVA ART] Preview package rendered to {output_dir}")


if __name__ == "__main__":
    main()
