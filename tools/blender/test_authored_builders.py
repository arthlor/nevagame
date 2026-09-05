"""Blender-side deterministic smoke tests for every shared authored builder."""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from common.authored import (
    add_arch_ring,
    add_banded_tapered_tower,
    add_cylindrical_masonry,
    add_fasteners,
    add_lattice,
    add_masonry_courses,
    add_mullioned_window,
    add_plank_field,
    add_root_flare,
    add_rope_line,
    add_shingle_rows,
    add_timber_corner_frame,
)
from common.geometry import (
    add_box,
    add_caudal_fin,
    add_flower_head,
    add_leaf_blade,
    apply_vertex_values,
)
from common.materials import get_or_create_material, hex_to_linear_rgba
from common.pipeline import clean_scene, create_root


TOKENS = ("stone_warm_01", "stone_cool_01")


def build_signature():
    clean_scene()
    root = create_root("authored_builder_test_root")
    add_masonry_courses("test_masonry", (0, 0, 1), 2, 1.4, 2, TOKENS, root, courses=3, blocks_per_long_side=4, seed=11)
    add_cylindrical_masonry("test_tower", 0, 2, 1, 0.75, TOKENS, root, courses=3, blocks_per_course=8, seed=12)
    add_shingle_rows("test_shingle", 2, 2, 1, 35, TOKENS, root, rows=3, columns=4, seed=13)
    add_plank_field("test_plank", (0, 0, 0.2), 2, 1.5, 0.1, TOKENS, root, count=5, seed=14)
    add_lattice("test_lattice", (0, 0, 1), 2, 2, TOKENS[0], root, columns=3, rows=3)
    add_rope_line("test_rope", ((0, 0, 0), (1, 0, 0.5), (1.5, 0.5, 0.8)), 0.04, TOKENS[1], root)
    add_arch_ring("test_arch", 0, 0, 1.5, *TOKENS, root, blocks=9, block_depth=0.2, block_size=0.3, start_deg=28, end_deg=152)
    add_root_flare("test_root", (0, 0, 0), 1, 0.5, TOKENS[1], root, count=5, seed=15)
    add_fasteners("test_fastener", ((-0.2, 0, 0.5), (0.2, 0, 0.5)), 0.03, TOKENS[1], root)
    add_timber_corner_frame("test_timber", 1.6, 1.2, 0.2, 1.4, TOKENS[1], root, post_w=0.12)
    add_mullioned_window("test_window", (0, -0.7, 1.0), 0.5, 0.6, TOKENS[1], TOKENS[0], TOKENS[1], root)
    add_banded_tapered_tower("test_bands", 0.0, 1.8, 0.6, 0.35, TOKENS, root, bands=4, sides=8)
    # Every caudal form, because the notch is exactly where a fan degenerates.
    for index, form in enumerate(("forked", "lunate", "rounded", "square", "heterocercal")):
        add_caudal_fin(f"test_caudal_{form}", (index * 0.6, 0, 2), 0.30, 0.44, form, TOKENS[0], root)
    add_leaf_blade("test_leaf_straight", (0, 0, 3), (0, 0.5, 3.2), 0.18, TOKENS[1], root)
    add_leaf_blade("test_leaf_bent", (0, 0, 3), (0.4, 0.2, 2.7), 0.22, TOKENS[1], root, bend=(0.05, 0, 0.18))
    add_flower_head("test_flower", (0, 0, 4), 0.14, TOKENS[0], TOKENS[1], TOKENS[0], root, petals=8, nod=0.6, yaw=0.9)
    multi_material = add_box("test_multi_material", (0, 0, 0.5), (0.5, 0.5, 0.5), TOKENS[0], root)
    multi_material.data.materials.append(get_or_create_material(TOKENS[1]))
    multi_material.data.polygons[0].material_index = 1
    apply_vertex_values(multi_material)

    meshes = sorted((obj for obj in bpy.context.scene.objects if obj.type == "MESH"), key=lambda obj: obj.name)
    prefixes = {
        "test_masonry", "test_tower", "test_shingle", "test_plank", "test_lattice",
        "test_rope", "test_arch", "test_root", "test_fastener",
        "test_timber", "test_window", "test_bands",
        "test_multi_material",
        "test_caudal_forked", "test_caudal_lunate", "test_caudal_rounded",
        "test_caudal_square", "test_caudal_heterocercal",
        "test_leaf_straight", "test_leaf_bent", "test_flower",
    }
    for prefix in prefixes:
        if not any(obj.name.startswith(prefix) for obj in meshes):
            raise AssertionError(f"{prefix} produced no mesh")
    signature = []
    for obj in meshes:
        obj.data.calc_loop_triangles()
        if not obj.data.loop_triangles or not obj.data.vertices:
            raise AssertionError(f"{obj.name} is empty")
        for triangle in obj.data.loop_triangles:
            vertices = [obj.data.vertices[index].co for index in triangle.vertices]
            if (vertices[1] - vertices[0]).cross(vertices[2] - vertices[0]).length < 1e-8:
                raise AssertionError(f"{obj.name} contains a degenerate triangle")
        values = (*obj.location, *obj.rotation_euler, *obj.dimensions)
        if not all(math.isfinite(value) for value in values):
            raise AssertionError(f"{obj.name} contains a non-finite transform")
        color = obj.data.color_attributes.get("Color")
        if color is None or color.domain != "CORNER" or len(color.data) != len(obj.data.loops):
            raise AssertionError(f"{obj.name} has incomplete semantic COLOR_0 data")
        for polygon in obj.data.polygons:
            material = obj.data.materials[polygon.material_index]
            if not material.use_backface_culling:
                raise AssertionError(f"{obj.name} material {material.name} should be back-face culled")
            expected = Vector(material.diffuse_color[:3])
            for loop_index in polygon.loop_indices:
                actual = Vector(color.data[loop_index].color[:3])
                value = actual.dot(expected) / expected.length_squared
                residual = (actual - expected * value).length
                if not 0.70 <= value <= 1.04 or residual > 0.025:
                    raise AssertionError(f"{obj.name} COLOR_0 does not follow material {material.name}")
        signature.append((obj.name, len(obj.data.vertices), len(obj.data.loop_triangles), tuple(round(value, 6) for value in values)))
    return signature


def main() -> None:
    midpoint = hex_to_linear_rgba("#808080")[0]
    if not math.isclose(midpoint, 0.215861, rel_tol=0, abs_tol=0.00001):
        raise AssertionError(f"sRGB palette conversion is not scene-linear: {midpoint}")
    first = build_signature()
    second = build_signature()
    if first != second:
        raise AssertionError("Authored builders are not deterministic")
    print(f"[NEVA ART] Authored builder tests passed for 12 builders, COLOR_0, and {len(first)} meshes")
    from test_surface_builders import test_surface_builders
    test_surface_builders()


if __name__ == "__main__":
    main()
