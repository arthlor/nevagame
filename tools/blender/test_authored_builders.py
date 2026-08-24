"""Blender-side deterministic smoke tests for every shared authored builder."""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy


SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from common.authored import (
    add_arch_ring,
    add_cylindrical_masonry,
    add_fasteners,
    add_lattice,
    add_masonry_courses,
    add_plank_field,
    add_root_flare,
    add_rope_line,
    add_shingle_rows,
)
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

    meshes = sorted((obj for obj in bpy.context.scene.objects if obj.type == "MESH"), key=lambda obj: obj.name)
    prefixes = {
        "test_masonry", "test_tower", "test_shingle", "test_plank", "test_lattice",
        "test_rope", "test_arch", "test_root", "test_fastener",
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
        signature.append((obj.name, len(obj.data.vertices), len(obj.data.loop_triangles), tuple(round(value, 6) for value in values)))
    return signature


def main() -> None:
    first = build_signature()
    second = build_signature()
    if first != second:
        raise AssertionError("Authored builders are not deterministic")
    print(f"[NEVA ART] Authored builder tests passed for 9 builders and {len(first)} meshes")


if __name__ == "__main__":
    main()
