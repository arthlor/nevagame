"""Scene lifecycle, validation, export, and report helpers."""

from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector

from .materials import MATERIAL_SPECS


def clean_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def create_root(name: str) -> bpy.types.Object:
    root = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(root)
    root.empty_display_type = "PLAIN_AXES"
    root["neva_asset_root"] = True
    return root


def _scene_bounds(meshes: list[bpy.types.Object]) -> tuple[list[float], list[float]]:
    points: list[Vector] = []
    for obj in meshes:
        points.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    minimum = [min(point[index] for point in points) for index in range(3)]
    maximum = [max(point[index] for point in points) for index in range(3)]
    return minimum, maximum


def validate_and_export(spec: dict, output_path: Path) -> dict:
    asset_id = spec["id"]
    objects = list(bpy.context.scene.objects)
    meshes = [obj for obj in objects if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError(f"{asset_id}: generator produced no meshes")

    node_names = [obj.name for obj in objects]
    if len(node_names) != len(set(node_names)):
        raise RuntimeError(f"{asset_id}: duplicate node names")
    anonymous_prefixes = ("Cube", "Cylinder", "Cone", "Icosphere", "Sphere", "Torus")
    anonymous = [name for name in node_names if name.startswith(anonymous_prefixes) or "." in name]
    if anonymous:
        raise RuntimeError(f"{asset_id}: anonymous or unstable node names: {anonymous}")

    missing_nodes = sorted(set(spec["requiredNodes"]) - set(node_names))
    if missing_nodes:
        raise RuntimeError(f"{asset_id}: missing required nodes: {missing_nodes}")

    material_names: set[str] = set()
    triangle_count = 0
    degenerate_count = 0
    for obj in meshes:
        if not all(math.isfinite(value) for value in (*obj.location, *obj.scale, *obj.rotation_euler)):
            raise RuntimeError(f"{asset_id}: {obj.name} has non-finite transform data")
        if any(abs(value - 1.0) > 0.0001 for value in obj.scale):
            raise RuntimeError(f"{asset_id}: {obj.name} has unapplied scale {tuple(obj.scale)}")
        obj.data.calc_loop_triangles()
        triangle_count += len(obj.data.loop_triangles)
        for triangle in obj.data.loop_triangles:
            vertices = [obj.data.vertices[index].co for index in triangle.vertices]
            if (vertices[1] - vertices[0]).cross(vertices[2] - vertices[0]).length < 1e-8:
                degenerate_count += 1
        for material in obj.data.materials:
            if material is None:
                continue
            material_names.add(material.name)
            if material.name not in MATERIAL_SPECS:
                raise RuntimeError(f"{asset_id}: unknown material {material.name!r}")

    if degenerate_count:
        raise RuntimeError(f"{asset_id}: contains {degenerate_count} degenerate triangles")
    budget = spec["budget"]
    if not budget["trianglesMin"] <= triangle_count <= budget["trianglesMax"]:
        raise RuntimeError(
            f"{asset_id}: {triangle_count} triangles outside "
            f"{budget['trianglesMin']}..{budget['trianglesMax']}"
        )
    if len(material_names) > budget["materialsMax"]:
        raise RuntimeError(f"{asset_id}: {len(material_names)} materials exceeds {budget['materialsMax']}")
    undeclared = sorted(material_names - set(spec["palette"]))
    if undeclared:
        raise RuntimeError(f"{asset_id}: generator used undeclared palette tokens {undeclared}")

    minimum, maximum = _scene_bounds(meshes)
    actual_dimensions = [maximum[index] - minimum[index] for index in range(3)]
    expected_dimensions = [
        spec["dimensions"]["width"], spec["dimensions"]["depth"], spec["dimensions"]["height"]
    ]
    for actual, expected, axis in zip(actual_dimensions, expected_dimensions, ("width", "depth", "height")):
        if actual > expected * 1.35 or actual < expected * 0.25:
            raise RuntimeError(
                f"{asset_id}: generated {axis} {actual:.3f} is incompatible with spec {expected:.3f}"
            )
    if spec["pivot"] == "ground_center" and not -0.12 <= minimum[2] <= 0.18:
        raise RuntimeError(f"{asset_id}: ground pivot is invalid; minimum Z is {minimum[2]:.3f}")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=str(output_path),
        export_format="GLB",
        use_selection=False,
        export_apply=True,
        export_yup=True,
        export_attributes=True,
        export_cameras=False,
        export_lights=False,
    )
    quality_status = "on_target" if triangle_count >= budget["trianglesTarget"] else "below_target"
    return {
        "id": asset_id,
        "file": spec["file"],
        "nodes": len(objects),
        "meshes": len(meshes),
        "triangles": triangle_count,
        "qualityStatus": quality_status,
        "budget": budget,
        "fileSizeBytes": output_path.stat().st_size,
        "materials": sorted(material_names),
        "bounds": {"min": minimum, "max": maximum},
        "dimensions": actual_dimensions,
        "requiredNodes": spec["requiredNodes"],
    }
