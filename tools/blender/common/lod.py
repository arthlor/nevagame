"""Shared deterministic hierarchy helpers for generated GLB LOD levels."""

from __future__ import annotations

from collections import defaultdict

import bpy

from .geometry import apply_vertex_values, join_meshes


def create_lod_roots(spec: dict, root) -> list[tuple[int, bpy.types.Object]]:
    levels = spec.get("lodLevels")
    if not levels:
        return [(0, root)]
    result = []
    for index, level in enumerate(levels):
        level_root = bpy.data.objects.new(level["node"], None)
        bpy.context.collection.objects.link(level_root)
        level_root.parent = root
        level_root["neva_lod_index"] = index
        level_root["neva_lod_distance_meters"] = level["distanceMeters"]
        result.append((index, level_root))
    return result


def consolidate_lod_level(parent: bpy.types.Object, prefix: str) -> None:
    """Join same-material parts within one LOD without crossing level boundaries."""
    groups = defaultdict(list)
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH" or obj.parent is not parent:
            continue
        material_key = tuple(material.name for material in obj.data.materials if material is not None)
        groups[material_key].append(obj)
    for group_index, objects in enumerate(groups.values()):
        joined_name = f"{prefix}_material_{group_index:02d}"
        if len(objects) == 1:
            joined = objects[0]
            joined.name = joined_name
            joined.data.name = f"{joined_name}_mesh"
        else:
            joined = join_meshes(objects, joined_name)
        if joined is None:
            continue
        joined.parent = parent
        apply_vertex_values(joined)
