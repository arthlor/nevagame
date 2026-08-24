"""Deterministic low-poly geometry helpers shared by all asset families."""

from __future__ import annotations

import random
from collections.abc import Iterable

import bpy
from mathutils import Vector

from .materials import get_or_create_material


def seeded_rng(seed: int) -> random.Random:
    return random.Random(seed)


def _finish_mesh(
    obj: bpy.types.Object,
    name: str,
    token: str,
    parent: bpy.types.Object,
    *,
    bevel: float = 0.0,
    flat: bool = True,
    vertex_values: bool = True,
) -> bpy.types.Object:
    obj.name = name
    obj.data.name = f"{name}_mesh"
    obj.data.materials.append(get_or_create_material(token))
    obj.parent = parent
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

    if bevel > 0:
        modifier = obj.modifiers.new(name="NEVA_Chamfer", type="BEVEL")
        modifier.width = bevel
        modifier.segments = 1
        modifier.limit_method = "ANGLE"
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)

    for polygon in obj.data.polygons:
        polygon.use_smooth = not flat
    if vertex_values:
        apply_vertex_values(obj)
    return obj


def apply_vertex_values(obj: bpy.types.Object) -> None:
    """Bake semantic base color plus bounded COLOR_0 planar modulation."""
    mesh = obj.data
    if not mesh.polygons or not mesh.loops:
        return
    attribute = mesh.color_attributes.get("Color")
    if attribute is None:
        attribute = mesh.color_attributes.new(name="Color", type="BYTE_COLOR", domain="CORNER")
    mesh.color_attributes.active_color = attribute

    z_values = [vertex.co.z for vertex in mesh.vertices]
    z_min = min(z_values, default=0.0)
    z_max = max(z_values, default=1.0)
    z_span = max(0.001, z_max - z_min)
    for polygon in mesh.polygons:
        normal_light = max(-0.08, min(0.08, polygon.normal.z * 0.08))
        material = mesh.materials[polygon.material_index] if mesh.materials else None
        base_color = material.diffuse_color if material is not None else (1.0, 1.0, 1.0, 1.0)
        for loop_index in polygon.loop_indices:
            vertex = mesh.vertices[mesh.loops[loop_index].vertex_index]
            height_light = ((vertex.co.z - z_min) / z_span - 0.5) * 0.06
            value = max(0.78, min(1.0, 0.9 + normal_light + height_light))
            attribute.data[loop_index].color = (
                base_color[0] * value,
                base_color[1] * value,
                base_color[2] * value,
                1.0,
            )


def add_box(name, location, dimensions, token, parent, *, rotation=(0.0, 0.0, 0.0), bevel=0.025, flat=True):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.dimensions = dimensions
    return _finish_mesh(obj, name, token, parent, bevel=bevel, flat=flat)


def add_cylinder(name, location, radius, depth, token, parent, *, vertices=8, rotation=(0.0, 0.0, 0.0), bevel=0.0, flat=True):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation
    )
    return _finish_mesh(bpy.context.active_object, name, token, parent, bevel=bevel, flat=flat)


def add_cone(name, location, radius1, radius2, depth, token, parent, *, vertices=8, rotation=(0.0, 0.0, 0.0), flat=True):
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices, radius1=radius1, radius2=radius2, depth=depth,
        location=location, rotation=rotation
    )
    return _finish_mesh(bpy.context.active_object, name, token, parent, flat=flat)


def add_ico(name, location, scale, token, parent, *, subdivisions=1, rotation=(0.0, 0.0, 0.0), flat=True):
    bpy.ops.mesh.primitive_ico_sphere_add(
        subdivisions=subdivisions, radius=1.0, location=location, rotation=rotation
    )
    obj = bpy.context.active_object
    obj.scale = scale
    return _finish_mesh(obj, name, token, parent, flat=flat)


def add_beam(name, start, end, radius, token, parent, *, vertices=6, flat=True):
    start_vec = Vector(start)
    end_vec = Vector(end)
    direction = end_vec - start_vec
    midpoint = (start_vec + end_vec) * 0.5
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=direction.length, location=midpoint
    )
    obj = bpy.context.active_object
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    return _finish_mesh(obj, name, token, parent, flat=flat)


def add_tri_prism(name, center, size, token, parent, *, rotation=(0.0, 0.0, 0.0)):
    width, depth, height = size
    x, y, z = width / 2, depth / 2, height / 2
    vertices = [(-x, -y, -z), (x, -y, -z), (0, -y, z), (-x, y, -z), (x, y, -z), (0, y, z)]
    faces = [(0, 1, 2), (3, 5, 4), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)]
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = center
    obj.rotation_euler = rotation
    return _finish_mesh(obj, name, token, parent, flat=True)


def add_ring(name, location, major_radius, minor_radius, token, parent, *, major_segments=12, minor_segments=4, rotation=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius, minor_radius=minor_radius,
        major_segments=major_segments, minor_segments=minor_segments,
        location=location, rotation=rotation
    )
    return _finish_mesh(bpy.context.active_object, name, token, parent, flat=True)


def add_marker(name, location, parent, *, marker_type="interaction"):
    marker = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(marker)
    marker.empty_display_type = "PLAIN_AXES"
    marker.location = location
    marker.parent = parent
    marker["neva_marker"] = marker_type
    return marker


def add_collision_box(name, location, dimensions, parent):
    marker = add_marker(name, location, parent, marker_type="collision")
    marker["shape"] = "box"
    marker["dimensions"] = list(dimensions)
    return marker


def join_meshes(objects: Iterable[bpy.types.Object], name: str):
    objects = [obj for obj in objects if obj is not None and obj.type == "MESH"]
    if not objects:
        return None
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    objects[0].name = name
    objects[0].data.name = f"{name}_mesh"
    return objects[0]
