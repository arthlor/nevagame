"""Farm and harbor prop generators."""

from __future__ import annotations

from common.design_primitives import add_crafted_box

import math

from common.geometry import (
    add_beam,
    add_box,
    add_collision_primitives,
    add_cone,
    add_conforming_shell,
    add_cylinder,
    add_ico,
    add_ring,
    add_tapered_beam,
    add_tri_prism,
)
from common.authored import (
    add_fasteners,
    add_shingle_rows,
)
from common.lod import consolidate_lod_level

GOLDEN_ANGLE = 2.39996322972865332


def fish_drying_rack(spec: dict, root) -> None:
    """Build a working coastal drying rack with clearly visible hanging fish."""
    wood, cord, fish = spec["palette"]
    params = spec["parameters"]
    width = params["width"]
    depth = params["depth"]
    height = params["height"]
    half_width = width * 0.5
    half_depth = depth * 0.5
    top_z = height * 0.90

    # A shallow four-post frame gives the prop a readable profile from the
    # front and side, while keeping the fish on the camera-facing plane.
    for x_index, x in enumerate((-half_width, half_width)):
        for y_index, y in enumerate((-half_depth, half_depth)):
            add_tapered_beam(
                f"fish_drying_post_{x_index}_{y_index}",
                (x, y, 0.04),
                (x, y, top_z),
                0.065,
                0.045,
                wood,
                root,
                vertices=6,
            )
            add_box(
                f"fish_drying_foot_{x_index}_{y_index}",
                (x, y, 0.07),
                (0.24, 0.22, 0.14),
                wood,
                root,
                bevel=0.014,
            )
    for y_index, y in enumerate((-half_depth, half_depth)):
        add_crafted_box(
            f"fish_drying_top_rail_{y_index}",
            (0, y, top_z),
            (width + 0.16, 0.10, 0.11),
            wood,
            root,
            bevel=0.016,
        )
    for x_index, x in enumerate((-half_width, half_width)):
        add_crafted_box(
            f"fish_drying_side_rail_{x_index}",
            (x, 0, height * 0.52),
            (0.09, depth, 0.09),
            wood,
            root,
            bevel=0.012,
        )
    for bar_index, z in enumerate((height * 0.42, height * 0.64)):
        add_box(
            f"fish_drying_bar_{bar_index}",
            (0, -half_depth, z),
            (width - 0.16, 0.07, 0.07),
            wood,
            root,
            bevel=0.010,
        )

    fish_count = params["fishCount"]
    for index in range(fish_count):
        t = (index + 1) / (fish_count + 1)
        fish_x = -width * 0.43 + width * 0.86 * t
        fish_y = -half_depth - 0.045
        fish_z = height * (0.47 + 0.13 * (index % 2))
        tail_direction = 1 if index % 2 == 0 else -1
        head_direction = -tail_direction
        add_ico(
            f"fish_drying_body_{index:02d}",
            (fish_x, fish_y, fish_z),
            (0.17, 0.045, 0.075),
            fish,
            root,
            subdivisions=1,
        )
        add_tri_prism(
            f"fish_drying_tail_{index:02d}",
            (fish_x + tail_direction * 0.20, fish_y, fish_z),
            (0.17, 0.045, 0.14),
            fish,
            root,
            rotation=(0, tail_direction * math.pi * 0.5, 0),
        )
        add_tri_prism(
            f"fish_drying_fin_{index:02d}",
            (fish_x - tail_direction * 0.01, fish_y, fish_z + 0.08),
            (0.10, 0.035, 0.07),
            fish,
            root,
        )
        head_x = fish_x + head_direction * 0.12
        add_ico(
            f"fish_drying_eye_{index:02d}",
            (head_x, fish_y - 0.045, fish_z + 0.012),
            (0.018, 0.012, 0.018),
            cord,
            root,
            subdivisions=1,
        )
        add_beam(
            f"fish_drying_hanger_{index:02d}",
            (head_x, -half_depth * 0.98, top_z - 0.04),
            (head_x, fish_y, fish_z + 0.075),
            0.007,
            cord,
            root,
            vertices=4,
        )
        add_beam(
            f"fish_drying_gill_{index:02d}",
            (head_x, fish_y - 0.048, fish_z - 0.045),
            (head_x, fish_y - 0.048, fish_z + 0.045),
            0.006,
            cord,
            root,
            vertices=4,
        )
    add_collision_primitives(spec, root)
    consolidate_lod_level(root, f"{spec['id']}_rack")


def wood_crate(spec: dict, root) -> None:
    wood, dark = spec["palette"]
    size = spec["parameters"]["size"]
    slats = spec["parameters"]["slats"]
    spacing = size / slats
    for face, y in (("front", -size * 0.48), ("back", size * 0.48)):
        for index in range(slats):
            z = spacing * (index + 0.5)
            add_crafted_box(f"crate_{face}_slat_{index:02d}", (0, y, z), (size, 0.075, spacing * 0.82), wood, root, bevel=0.015)
    for side, x in (("left", -size * 0.48), ("right", size * 0.48)):
        for index in range(3):
            z = size * (0.18 + index * 0.32)
            add_crafted_box(f"crate_{side}_slat_{index:02d}", (x, 0, z), (0.075, size, size * 0.20), wood, root, bevel=0.015)
    for index, (x, y) in enumerate(((-0.36, -0.36), (0.36, -0.36), (-0.36, 0.36), (0.36, 0.36))):
        add_crafted_box(f"crate_corner_{index}", (x, y, size * 0.5), (0.10, 0.10, size), dark, root, bevel=0.018)
    add_crafted_box("crate_bottom", (0, 0, 0.045), (size, size, 0.09), wood, root, bevel=0.012)
    for face, y, direction in (("front", -size * 0.535, 1), ("back", size * 0.535, -1)):
        add_beam(f"crate_{face}_brace_a", (-size * 0.38, y, size * 0.16), (size * 0.38, y, size * 0.84), 0.035, dark, root, vertices=6)
        add_beam(f"crate_{face}_brace_b", (size * 0.38, y, size * 0.16), (-size * 0.38, y, size * 0.84), 0.035, dark, root, vertices=6)
    fasteners = []
    for y in (-size * 0.55, size * 0.55):
        for x in (-size * 0.35, size * 0.35):
            for z in (size * 0.18, size * 0.82):
                fasteners.append((x, y, z))
    add_fasteners("crate_fastener", fasteners, 0.018, dark, root, depth=0.06)
    add_collision_primitives(spec, root)


def wood_barrel(spec: dict, root) -> None:
    wood, metal = spec["palette"]
    height = spec["parameters"]["height"]
    radius = spec["parameters"]["radius"]
    staves = spec["parameters"]["staves"]
    profile = [((0, 0, height * z), radius * r, radius * r)
               for z, r in ((0, .84), (.18, .91), (.5, 1), (.82, .91), (1, .84))]
    for index in range(staves):
        angle = index * math.tau / staves
        add_conforming_shell(f"barrel_stave_{index:02d}", profile, wood, root,
            arc=(angle + .006, angle + math.tau / staves - .006),
            offset=-radius * .055, thickness=radius * .055, segments=1)
    for index, z in enumerate((height * 0.18, height * 0.50, height * 0.82)):
        add_ring(f"barrel_band_{index}", (0, 0, z), radius * (1 if index == 1 else .91), 0.025, metal, root, major_segments=staves, minor_segments=4)
    add_cylinder("barrel_top", (0, 0, height - 0.02), radius * 0.84, 0.07, wood, root, vertices=staves)
    add_cylinder("barrel_bottom", (0, 0, 0.035), radius * 0.84, 0.07, wood, root, vertices=staves)
    add_ring("barrel_top_rim", (0, 0, height - 0.015), radius * 0.84, 0.025, metal, root, major_segments=staves, minor_segments=4)
    add_cylinder("barrel_bung", (radius * 0.32, 0, height + 0.025), 0.045, 0.08, metal, root, vertices=8)
    add_collision_primitives(spec, root)


def produce_crate(spec: dict, root) -> None:
    """Build an open timber harvest crate overflowing with pumpkins, apples, or fish."""
    params = spec["parameters"]
    wood, dark, fill_token = spec["palette"]
    size = params.get("size", 0.88)
    content = params.get("content", "pumpkins")

    # Outer crate slats
    slats = 4
    spacing = size / slats
    for face, y in (("front", -size * 0.48), ("back", size * 0.48)):
        for index in range(slats):
            z = spacing * (index + 0.5)
            add_crafted_box(f"p_crate_{face}_slat_{index:02d}", (0, y, z), (size, 0.075, spacing * 0.82), wood, root, bevel=0.012)
    for side, x in (("left", -size * 0.48), ("right", size * 0.48)):
        for index in range(slats):
            z = spacing * (index + 0.5)
            add_crafted_box(f"p_crate_{side}_slat_{index:02d}", (x, 0, z), (0.075, size, spacing * 0.82), wood, root, bevel=0.012)
    for index, (x, y) in enumerate(((-size * 0.44, -size * 0.44), (size * 0.44, -size * 0.44), (-size * 0.44, size * 0.44), (size * 0.44, size * 0.44))):
        add_crafted_box(f"p_crate_corner_{index}", (x, y, size * 0.5), (0.09, 0.09, size), dark, root, bevel=0.015)
    add_crafted_box("p_crate_bottom", (0, 0, 0.045), (size, size, 0.09), wood, root, bevel=0.012)

    # Produce Fill
    if content == "pumpkins":
        for p_idx, (px, py, pz, pscale) in enumerate(((-0.18, -0.18, 0.38, 0.22), (0.18, -0.18, 0.42, 0.24), (-0.18, 0.18, 0.40, 0.23), (0.18, 0.18, 0.38, 0.21), (0.0, 0.0, 0.58, 0.26))):
            add_ico(f"p_crate_pumpkin_{p_idx}", (px, py, pz), (pscale * 0.65, pscale * 0.65, pscale * 0.85), fill_token, root, subdivisions=2)
            add_cone(f"p_crate_stem_{p_idx}", (px, py, pz + pscale * 0.42), 0.025, 0.012, 0.08, dark, root, vertices=5)
    elif content == "apples":
        for a_idx in range(16):
            ax = -0.26 + (a_idx % 4) * 0.17
            ay = -0.26 + ((a_idx // 4) % 4) * 0.17
            az = 0.48 + (0.10 if a_idx in (5, 6, 9, 10) else 0.0)
            add_ico(f"p_crate_apple_{a_idx:02d}", (ax, ay, az), (0.09, 0.09, 0.08), fill_token, root, subdivisions=1)
    add_collision_primitives(spec, root)
