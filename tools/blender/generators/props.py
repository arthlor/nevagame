"""Farm and harbor prop generators."""

from __future__ import annotations

import math

from common.geometry import (
    add_beam,
    add_box,
    add_collision_box,
    add_cone,
    add_cylinder,
    add_ico,
    add_ring,
    add_tri_prism,
    seeded_rng,
)
from common.authored import (
    add_cylindrical_masonry,
    add_fasteners,
    add_lattice,
    add_rope_line,
    add_shingle_rows,
)


def water_well(spec: dict, root) -> None:
    stone, wood, roof, metal = spec["palette"]
    radius = spec["parameters"]["radius"]
    for index in range(10):
        angle = index * math.tau / 10
        add_box(
            f"well_stone_{index:02d}",
            (math.cos(angle) * radius * 0.78, math.sin(angle) * radius * 0.78, 0.36),
            (0.58, 0.32, 0.68), stone, root,
            rotation=(0, 0, angle), bevel=0.07,
        )
    add_cylindrical_masonry(
        "well_masonry", 0.04, 0.78, radius * 0.92, radius * 0.88,
        (stone,), root, courses=spec["parameters"]["masonryCourses"],
        blocks_per_course=spec["parameters"]["blocksPerCourse"], seed=spec["seed"] + 1,
        block_depth=0.18,
    )
    for index, x in enumerate((-0.72, 0.72)):
        add_box(f"well_post_{index}", (x, 0, 1.45), (0.18, 0.20, 2.2), wood, root, bevel=0.03)
    add_box("well_crossbeam", (0, 0, 2.42), (1.75, 0.22, 0.22), wood, root, bevel=0.03)
    add_cylinder("well_axle", (0, -0.05, 1.72), 0.10, 1.65, wood, root, vertices=8, rotation=(0, math.pi / 2, 0), bevel=0.015)
    add_ring("well_crank", (0.94, -0.05, 1.72), 0.20, 0.035, metal, root, major_segments=10, minor_segments=4, rotation=(0, math.pi / 2, 0))
    add_tri_prism("well_roof", (0, 0, 2.72), (2.15, 1.75, 0.72), roof, root, rotation=(math.pi / 2, 0, math.pi / 2))
    add_shingle_rows(
        "well_shingle", 2.05, 1.65, 2.42, 34, (roof, wood), root,
        rows=spec["parameters"]["roofRows"], columns=spec["parameters"]["roofColumns"],
        seed=spec["seed"] + 2,
    )
    rope_points = [(0, -0.05, 1.70), (0, -0.05, 1.26), (0.04, -0.05, 0.94)]
    add_rope_line("well_bucket_rope", rope_points, 0.026, metal, root, vertices=6)
    add_cylinder("well_bucket", (0.04, -0.05, 0.82), 0.18, 0.28, wood, root, vertices=8, bevel=0.015)
    add_ring("well_bucket_handle", (0.04, -0.05, 0.99), 0.18, 0.018, metal, root, major_segments=8, minor_segments=4, rotation=(math.pi / 2, 0, 0))
    add_collision_box(f"COL_{spec['id']}", (0, 0, 0.55), (1.75, 1.75, 1.1), root)


def pumpkin_patch(spec: dict, root) -> None:
    rng = seeded_rng(spec["seed"])
    soil, pumpkin, vine = spec["palette"]
    add_box("pumpkin_patch_soil", (0, 0, 0.06), (3.0, 2.0, 0.12), soil, root, bevel=0.035)
    count = spec["parameters"]["pumpkins"]
    positions = [(-1.0, -0.52), (-0.42, 0.48), (0.2, -0.3), (0.75, 0.5), (1.05, -0.45), (-0.9, 0.3), (0.35, 0.52)]
    for index, (x, y) in enumerate(positions[:count]):
        scale = 0.25 + rng.uniform(-0.03, 0.05)
        rotation = rng.uniform(-0.5, 0.5)
        for lobe in range(spec["parameters"]["lobes"]):
            angle = lobe * math.tau / spec["parameters"]["lobes"] + rotation
            add_ico(
                f"pumpkin_{index:02d}_lobe_{lobe:02d}",
                (x + math.cos(angle) * scale * 0.18, y + math.sin(angle) * scale * 0.18, 0.20 + scale * 0.42),
                (scale * 0.62, scale * 0.58, scale * 0.82), pumpkin, root,
                subdivisions=2, rotation=(0, 0, angle),
            )
        add_cone(f"pumpkin_stem_{index:02d}", (x, y, 0.20 + scale * 1.15), 0.045, 0.025, 0.16, vine, root, vertices=5)
        for leaf in range(2):
            leaf_angle = rotation + leaf * 2.3
            add_tri_prism(
                f"pumpkin_leaf_{index:02d}_{leaf}",
                (x + math.cos(leaf_angle) * scale * 0.72, y + math.sin(leaf_angle) * scale * 0.72, 0.18),
                (scale * 0.56, scale * 0.12, scale * 0.42), vine, root,
                rotation=(math.pi / 2, 0, leaf_angle),
            )
    for index in range(spec["parameters"]["vineSegments"]):
        start_x = -1.3 + index * 2.6 / spec["parameters"]["vineSegments"]
        add_beam(
            f"pumpkin_vine_{index:02d}", (start_x, math.sin(index * 1.4) * 0.48, 0.14),
            (start_x + 0.32, math.sin((index + 1) * 1.4) * 0.48, 0.15),
            0.018, vine, root, vertices=5,
        )
    for index in range(spec["parameters"]["blossomCount"]):
        angle = index * 2.39996 + 0.3
        radius = 0.42 + 0.72 * ((index * 3) % max(2, spec["parameters"]["blossomCount"])) / max(1, spec["parameters"]["blossomCount"] - 1)
        add_ico(
            f"pumpkin_blossom_{index:02d}",
            (math.cos(angle) * radius, math.sin(angle) * radius * 0.68, 0.20),
            (0.10, 0.10, 0.055), pumpkin, root, subdivisions=2,
            rotation=(0, 0, angle),
        )


def lobster_trap(spec: dict, root) -> None:
    wood, metal, rope = spec["palette"]
    length = spec["parameters"]["length"]
    ribs = spec["parameters"]["ribs"]
    for index in range(ribs):
        x = -length * 0.5 + index * length / max(1, ribs - 1)
        add_ring(
            f"lobster_trap_rib_{index:02d}", (x, 0, 0.36), 0.34, 0.035, metal, root,
            major_segments=10, minor_segments=4, rotation=(0, math.pi / 2, 0),
        )
    for index, angle in enumerate((0, math.pi / 2, math.pi, math.pi * 1.5)):
        y = math.cos(angle) * 0.34
        z = 0.36 + math.sin(angle) * 0.34
        add_box(f"lobster_trap_rail_{index}", (0, y, z), (length + 0.08, 0.055, 0.055), wood, root, bevel=0.01)
    add_ring("lobster_trap_entry", (length * 0.51, 0, 0.36), 0.19, 0.028, rope, root, major_segments=9, minor_segments=4, rotation=(0, math.pi / 2, 0))
    add_lattice(
        "lobster_trap_side_net", (0, -0.34, 0.36), length, 0.62, rope, root,
        columns=spec["parameters"]["netColumns"], rows=spec["parameters"]["netRows"], depth=0.024,
    )
    add_box("lobster_trap_door", (-length * 0.18, -0.37, 0.38), (0.46, 0.06, 0.38), wood, root, bevel=0.012)
    add_box("lobster_trap_latch", (-length * 0.18, -0.42, 0.56), (0.16, 0.06, 0.08), metal, root, bevel=0.008)


def wood_crate(spec: dict, root) -> None:
    wood, dark = spec["palette"]
    size = spec["parameters"]["size"]
    slats = spec["parameters"]["slats"]
    spacing = size / slats
    for face, y in (("front", -size * 0.48), ("back", size * 0.48)):
        for index in range(slats):
            z = spacing * (index + 0.5)
            add_box(f"crate_{face}_slat_{index:02d}", (0, y, z), (size, 0.075, spacing * 0.82), wood, root, bevel=0.015)
    for side, x in (("left", -size * 0.48), ("right", size * 0.48)):
        for index in range(3):
            z = size * (0.18 + index * 0.32)
            add_box(f"crate_{side}_slat_{index:02d}", (x, 0, z), (0.075, size, size * 0.20), wood, root, bevel=0.015)
    for index, (x, y) in enumerate(((-0.36, -0.36), (0.36, -0.36), (-0.36, 0.36), (0.36, 0.36))):
        add_box(f"crate_corner_{index}", (x, y, size * 0.5), (0.10, 0.10, size), dark, root, bevel=0.018)
    add_box("crate_bottom", (0, 0, 0.045), (size, size, 0.09), wood, root, bevel=0.012)
    for face, y, direction in (("front", -size * 0.535, 1), ("back", size * 0.535, -1)):
        add_beam(f"crate_{face}_brace_a", (-size * 0.38, y, size * 0.16), (size * 0.38, y, size * 0.84), 0.035, dark, root, vertices=6)
        add_beam(f"crate_{face}_brace_b", (size * 0.38, y, size * 0.16), (-size * 0.38, y, size * 0.84), 0.035, dark, root, vertices=6)
    fasteners = []
    for y in (-size * 0.55, size * 0.55):
        for x in (-size * 0.35, size * 0.35):
            for z in (size * 0.18, size * 0.82):
                fasteners.append((x, y, z))
    add_fasteners("crate_fastener", fasteners, 0.018, dark, root, depth=0.06)
    add_collision_box(f"COL_{spec['id']}", (0, 0, size * 0.5), (size, size, size), root)


def wood_barrel(spec: dict, root) -> None:
    wood, metal = spec["palette"]
    height = spec["parameters"]["height"]
    radius = spec["parameters"]["radius"]
    staves = spec["parameters"]["staves"]
    for index in range(staves):
        angle = index * math.tau / staves
        add_box(
            f"barrel_stave_{index:02d}",
            (math.cos(angle) * radius * 0.86, math.sin(angle) * radius * 0.86, height * 0.5),
            (0.17, 0.10, height), wood, root,
            rotation=(0, 0, angle), bevel=0.025,
        )
    for index, z in enumerate((height * 0.18, height * 0.50, height * 0.82)):
        add_ring(f"barrel_band_{index}", (0, 0, z), radius * 0.91, 0.035, metal, root, major_segments=staves, minor_segments=4)
    add_cylinder("barrel_top", (0, 0, height - 0.02), radius * 0.84, 0.07, wood, root, vertices=staves)
    add_cylinder("barrel_bottom", (0, 0, 0.035), radius * 0.84, 0.07, wood, root, vertices=staves)
    add_ring("barrel_top_rim", (0, 0, height - 0.015), radius * 0.84, 0.025, metal, root, major_segments=staves, minor_segments=4)
    add_cylinder("barrel_bung", (radius * 0.32, 0, height + 0.025), 0.045, 0.08, metal, root, vertices=8)
    add_collision_box(f"COL_{spec['id']}", (0, 0, height * 0.5), (radius * 1.8, radius * 1.8, height), root)


def wood_fence(spec: dict, root) -> None:
    wood, dark = spec["palette"]
    length = spec["parameters"]["length"]
    posts = spec["parameters"]["posts"]
    for index in range(posts):
        x = -length * 0.5 + index * length / max(1, posts - 1)
        lean = math.radians((-2, 1, -1)[index % 3])
        add_box(f"fence_post_{index:02d}", (x, 0, 0.58), (0.18, 0.20, 1.16), dark, root, rotation=(0, lean, 0), bevel=0.025)
        add_tri_prism(f"fence_post_cap_{index:02d}", (x, 0, 1.20), (0.24, 0.22, 0.22), dark, root)
    for index in range(spec["parameters"]["rails"]):
        z = 0.38 + index * 0.42
        add_box(f"fence_rail_{index:02d}", (0, 0, z), (length, 0.12, 0.15), wood, root, rotation=(0, math.radians(1.5 * (index - 0.5)), 0), bevel=0.02)
        segments = spec["parameters"]["railSegments"]
        for segment in range(segments):
            x = -length * 0.5 + length * (segment + 0.5) / segments
            add_box(
                f"fence_rail_face_{index:02d}_{segment:02d}",
                (x, -0.075, z + math.sin((segment + index) * 1.7) * 0.018),
                (length / segments * 0.90, 0.055, 0.19), wood if segment % 3 else dark, root,
                rotation=(0, math.radians((segment % 3) - 1), 0), bevel=0.012,
            )
    fasteners = []
    for index in range(posts):
        x = -length * 0.5 + index * length / max(1, posts - 1)
        for rail in range(spec["parameters"]["rails"]):
            fasteners.append((x, -0.13, 0.38 + rail * 0.42))
    add_fasteners("fence_fastener", fasteners, 0.018, dark, root, depth=0.055)
    add_collision_box(f"COL_{spec['id']}", (0, 0, 0.58), (length, 0.22, 1.16), root)


def hay_bale(spec: dict, root) -> None:
    hay, twine = spec["palette"]
    length = spec["parameters"]["length"]
    radius = spec["parameters"]["radius"]
    add_cylinder("hay_bale_body", (0, 0, radius), radius, length, hay, root, vertices=12, rotation=(math.pi / 2, 0, 0), bevel=0.02)
    for index, x in enumerate((-length * 0.28, length * 0.28)):
        add_ring(f"hay_bale_twine_{index}", (0, x, radius), radius * 0.94, 0.025, twine, root, major_segments=12, minor_segments=4, rotation=(math.pi / 2, 0, 0))
    for index in range(spec["parameters"]["fiberBands"]):
        angle = index * math.tau / spec["parameters"]["fiberBands"]
        add_box(
            f"hay_bale_fiber_{index:02d}",
            (math.cos(angle) * radius * 0.86, 0, radius + math.sin(angle) * radius * 0.86),
            (0.055, length * 0.94, 0.10), hay, root,
            rotation=(0, angle * 0.15, angle), bevel=0.006,
        )
    for side, y in (("front", -length * 0.51), ("back", length * 0.51)):
        for ring_index in range(3):
            add_ring(f"hay_bale_end_{side}_{ring_index}", (0, y, radius), radius * (0.24 + ring_index * 0.24), 0.018, twine, root, major_segments=10, minor_segments=4, rotation=(math.pi / 2, 0, 0))
    add_collision_box(f"COL_{spec['id']}", (0, 0, radius), (radius * 1.8, length, radius * 1.8), root)


def lamp_post(spec: dict, root) -> None:
    wood, brass, glow = spec["palette"]
    height = spec["parameters"]["height"]
    add_cylinder("lamp_post_base", (0, 0, 0.12), 0.24, 0.24, wood, root, vertices=8, bevel=0.035)
    add_cone("lamp_post_column", (0, 0, height * 0.48), 0.15, 0.09, height * 0.96, wood, root, vertices=8)
    add_beam("lamp_post_arm", (0, 0, height * 0.84), (spec["parameters"]["armLength"], 0, height * 0.92), 0.065, brass, root, vertices=7)
    lamp_x = spec["parameters"]["armLength"]
    add_box("lamp_post_lantern_frame", (lamp_x, 0, height * 0.80), (0.42, 0.42, 0.62), brass, root, bevel=0.035)
    add_ico("lamp_post_glow", (lamp_x, 0, height * 0.80), (0.16, 0.16, 0.24), glow, root, subdivisions=2)
    add_tri_prism("lamp_post_cap", (lamp_x, 0, height * 0.80 + 0.43), (0.58, 0.58, 0.30), brass, root, rotation=(math.pi / 2, 0, math.pi / 2))
    for side, (x, y) in enumerate(((-0.20, -0.20), (0.20, -0.20), (-0.20, 0.20), (0.20, 0.20))):
        add_box(f"lamp_post_lantern_corner_{side}", (lamp_x + x, y, height * 0.80), (0.055, 0.055, 0.66), brass, root, bevel=0.008)
    for side, (x, y, w, d) in enumerate(((lamp_x, -0.215, 0.32, 0.035), (lamp_x, 0.215, 0.32, 0.035), (lamp_x - 0.215, 0, 0.035, 0.32), (lamp_x + 0.215, 0, 0.035, 0.32))):
        add_box(f"lamp_post_lantern_pane_{side}", (x, y, height * 0.80), (w, d, 0.48), glow, root, bevel=0.008)
    add_ring("lamp_post_hanging_loop", (lamp_x, 0, height * 0.80 + 0.62), 0.16, 0.025, brass, root, major_segments=8, minor_segments=4, rotation=(math.pi / 2, 0, 0))
    add_ring("lamp_post_lantern_base_rim", (lamp_x, 0, height * 0.80 - 0.34), 0.24, 0.022, brass, root, major_segments=8, minor_segments=4)
    add_ring("lamp_post_lantern_top_rim", (lamp_x, 0, height * 0.80 + 0.34), 0.24, 0.022, brass, root, major_segments=8, minor_segments=4)
    add_beam("lamp_post_arm_brace_left", (0.10, 0, height * 0.78), (lamp_x * 0.58, 0, height * 0.91), 0.035, brass, root, vertices=6)
    add_beam("lamp_post_arm_brace_right", (0.10, 0, height * 0.90), (lamp_x * 0.58, 0, height * 0.82), 0.035, brass, root, vertices=6)
    for index, (x, y) in enumerate(((-0.16, -0.16), (0.16, -0.16), (-0.16, 0.16), (0.16, 0.16))):
        add_beam(
            f"lamp_post_roof_brace_{index:02d}",
            (lamp_x + x, y, height * 0.80 + 0.32),
            (lamp_x, 0, height * 0.80 + 0.54),
            0.022, brass, root, vertices=6,
        )
