"""Farm and harbor prop generators."""

from __future__ import annotations

import math

from common.geometry import (
    add_beam,
    add_box,
    add_collision_primitives,
    add_cone,
    add_conforming_shell,
    add_limb_tube,
    add_cylinder,
    add_ico,
    add_lofted_form,
    add_grip_marker,
    add_marker,
    add_ring,
    add_tapered_beam,
    add_tri_prism,
    seeded_rng,
)
from common.authored import (
    add_burlap_sack,
    add_catenary_rope,
    add_cylindrical_masonry,
    add_fasteners,
    add_lattice,
    add_masonry_courses,
    add_plank_field,
    add_profiled_vessel,
    add_rope_line,
    add_shingle_rows,
)
from common.lod import consolidate_lod_level

GOLDEN_ANGLE = 2.39996322972865332


def water_well(spec: dict, root) -> None:
    """Chunky octagonal stone well with thick timber posts, planked gable, and hanging bucket."""
    stone, wood, roof, metal = spec["palette"]
    radius = spec["parameters"].get("radius", 0.95)
    seed = spec["seed"]

    basin_h = 0.92
    add_profiled_vessel("well_stone_basin", (0, 0, 0),
        ((0, radius * .86), (basin_h, radius * .86)), .14, stone, root, sides=8)
    add_cylindrical_masonry(
        "well_stone_masonry",
        0.0,
        basin_h,
        radius,
        radius * 0.94,
        (stone,),
        root,
        courses=3,
        blocks_per_course=9,
        seed=seed + 7,
        block_depth=0.20,
    )
    add_ring(
        "well_stone_coping",
        (0, 0, basin_h + 0.05),
        radius - 0.02,
        0.11,
        stone,
        root,
        major_segments=8,
        minor_segments=4,
    )
    add_cylinder(
        "well_water_surface",
        (0, 0, 0.40),
        radius * 0.72,
        0.05,
        stone,
        root,
        vertices=8,
    )

    post_x = radius * 0.72
    post_h = spec["parameters"].get("postHeight", 1.42)
    post_size = 0.26
    for p_idx, px in enumerate((-post_x, post_x)):
        add_box(
            f"well_post_{p_idx}",
            (px, 0, basin_h + post_h * 0.5 - 0.12),
            (post_size, post_size, post_h),
            wood,
            root,
            bevel=0.03,
        )
        sign = 1 if px < 0 else -1
        add_beam(
            f"well_post_brace_{p_idx}",
            (px, 0, basin_h + post_h - 0.70),
            (px + sign * 0.38, 0, basin_h + post_h - 0.12),
            0.07,
            wood,
            root,
            vertices=6,
        )
        add_fasteners(
            f"well_post_peg_{p_idx}",
            ((px, -post_size * 0.55, basin_h + 0.18), (px, -post_size * 0.55, basin_h + post_h - 0.28)),
            0.022,
            wood,
            root,
            depth=0.08,
        )

    add_box(
        "well_crossbeam",
        (0, 0, basin_h + post_h - 0.10),
        (radius * 2.05, 0.22, 0.22),
        wood,
        root,
        bevel=0.025,
    )
    axle_z = basin_h + 0.88
    add_cylinder(
        "well_axle",
        (0, 0, axle_z),
        0.10,
        radius * 1.55,
        wood,
        root,
        vertices=8,
        rotation=(0, math.pi / 2, 0),
        bevel=0.014,
    )
    add_cylinder(
        "well_rope_coil",
        (0, 0, axle_z),
        0.16,
        0.22,
        metal,
        root,
        vertices=8,
        rotation=(0, math.pi / 2, 0),
        bevel=0.01,
    )
    add_box(
        "well_crank_arm",
        (post_x + 0.22, 0.12, axle_z),
        (0.06, 0.28, 0.06),
        metal,
        root,
        bevel=0.008,
    )
    add_cylinder(
        "well_crank_handle",
        (post_x + 0.22, 0.28, axle_z - 0.10),
        0.028,
        0.22,
        wood,
        root,
        vertices=6,
        bevel=0.006,
    )

    roof_w = radius * 2.28
    roof_d = radius * 1.95
    roof_base_z = basin_h + post_h - 0.02
    roof_pitch = math.radians(32)
    half_rw = roof_w * 0.5
    slope_len = half_rw / math.cos(roof_pitch)
    roof_rise = math.sin(roof_pitch) * slope_len

    for side, pitch, name in ((-1, -roof_pitch, "left"), (1, roof_pitch, "right")):
        add_box(
            f"well_roof_slab_{name}",
            (side * half_rw * 0.50, 0, roof_base_z + roof_rise * 0.50),
            (slope_len, roof_d, 0.10),
            wood,
            root,
            rotation=(0, pitch, 0),
            bevel=0.014,
        )
        for plank in range(5):
            along = -roof_d * 0.42 + plank * roof_d * 0.21
            add_box(
                f"well_roof_plank_{name}_{plank}",
                (side * half_rw * 0.50, along, roof_base_z + roof_rise * 0.52),
                (slope_len * 0.96, roof_d * 0.18, 0.08),
                wood if plank % 2 else roof,
                root,
                rotation=(0, pitch, 0),
                bevel=0.01,
            )
    add_box(
        "well_roof_ridge",
        (0, 0, roof_base_z + roof_rise + 0.05),
        (0.20, roof_d + 0.10, 0.16),
        roof,
        root,
        bevel=0.018,
    )
    add_tri_prism(
        "well_gable_front",
        (0, -roof_d * 0.5 + 0.03, roof_base_z + roof_rise * 0.5),
        (roof_w - 0.12, 0.12, roof_rise * 0.98),
        wood,
        root,
    )
    add_tri_prism(
        "well_gable_back",
        (0, roof_d * 0.5 - 0.03, roof_base_z + roof_rise * 0.5),
        (roof_w - 0.12, 0.12, roof_rise * 0.98),
        wood,
        root,
    )

    rope_points = [(0, 0, axle_z), (0.04, 0, axle_z - 0.50), (0.04, 0, basin_h + 0.42)]
    add_rope_line("well_bucket_rope", rope_points, 0.028, metal, root, vertices=6)
    add_profiled_vessel("well_bucket", (.04, 0, basin_h + .02),
        ((0, .16), (.32, .20)), .022, wood, root, sides=8)
    add_ring(
        "well_bucket_band",
        (0.04, 0, basin_h + 0.10),
        0.21,
        0.022,
        metal,
        root,
        major_segments=8,
        minor_segments=4,
    )
    add_ring(
        "well_bucket_handle",
        (0.04, 0, basin_h + 0.36),
        0.17,
        0.022,
        metal,
        root,
        major_segments=8,
        minor_segments=4,
        rotation=(math.pi / 2, 0, 0),
    )

    add_tapered_beam(
        "well_shovel_handle",
        (radius * 0.78, -radius * 0.62, 0.08),
        (radius * 0.58, -radius * 0.42, 1.22),
        0.038,
        0.028,
        wood,
        root,
        vertices=6,
    )
    add_box(
        "well_shovel_blade",
        (radius * 0.82, -radius * 0.66, 0.14),
        (0.18, 0.05, 0.24),
        metal,
        root,
        rotation=(0.18, 0.22, 0.4),
        bevel=0.012,
    )
    for index, (sx, sy, ss) in enumerate((
        (radius * 0.72, radius * 0.55, 0.16),
        (-radius * 0.62, radius * 0.48, 0.13),
        (-radius * 0.78, -radius * 0.18, 0.12),
    )):
        add_box(
            f"well_ground_stone_{index}",
            (sx, sy, ss * 0.45),
            (ss * 1.4, ss * 1.1, ss * 0.9),
            stone,
            root,
            rotation=(0, 0, index * 0.7),
            bevel=0.02,
        )

    add_collision_primitives(spec, root)


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
    """Working wooden lobster pot: thick laths, rope bridle, weights, and a funnel entry."""
    wood, metal, rope = spec["palette"]
    length = spec["parameters"]["length"]
    ribs = spec["parameters"]["ribs"]
    half = length * 0.5
    cage_r = 0.28
    cage_z = 0.30

    for index, y in enumerate((-0.22, 0.22)):
        add_box(
            f"lobster_trap_skid_{index}",
            (0, y, 0.05),
            (length + 0.16, 0.10, 0.10),
            wood,
            root,
            bevel=0.016,
        )

    for index in range(ribs):
        x = -half + index * length / max(1, ribs - 1)
        add_ring(
            f"lobster_trap_rib_{index:02d}",
            (x, 0, cage_z),
            cage_r,
            0.048,
            wood,
            root,
            major_segments=10,
            minor_segments=5,
            rotation=(0, math.pi / 2, 0),
        )

    lath_count = 8
    for index in range(lath_count):
        angle = index * math.tau / lath_count
        y = math.cos(angle) * cage_r
        z = cage_z + math.sin(angle) * cage_r
        add_box(
            f"lobster_trap_lath_{index:02d}",
            (0, y, z),
            (length + 0.10, 0.07, 0.055),
            wood,
            root,
            bevel=0.01,
        )

    add_ring(
        "lobster_trap_entry",
        (half * 0.92, 0, cage_z),
        0.18,
        0.038,
        rope,
        root,
        major_segments=9,
        minor_segments=4,
        rotation=(0, math.pi / 2, 0),
    )
    add_cone(
        "lobster_trap_funnel",
        (half * 0.62, 0, cage_z),
        0.20,
        0.08,
        0.36,
        rope,
        root,
        vertices=8,
        rotation=(0, math.pi / 2, 0),
    )
    add_lattice(
        "lobster_trap_end_net",
        (-half * 0.02, -cage_r * 0.15, cage_z),
        length * 0.72,
        cage_r * 1.55,
        rope,
        root,
        columns=spec["parameters"]["netColumns"],
        rows=spec["parameters"]["netRows"],
        depth=0.032,
    )
    add_box(
        "lobster_trap_door",
        (-half * 0.12, -cage_r - 0.02, cage_z + 0.02),
        (0.52, 0.08, 0.42),
        wood,
        root,
        bevel=0.014,
    )
    add_box(
        "lobster_trap_latch",
        (-half * 0.12, -cage_r - 0.07, cage_z + 0.20),
        (0.18, 0.07, 0.09),
        metal,
        root,
        bevel=0.008,
    )
    add_catenary_rope(
        "lobster_trap_bridle",
        (-half * 0.42, 0, cage_z + cage_r + 0.02),
        (half * 0.42, 0, cage_z + cage_r + 0.02),
        -0.08,
        0.024,
        rope,
        root,
        segments=6,
        vertices=5,
    )
    add_ring(
        "lobster_trap_lift_loop",
        (0, 0, cage_z + cage_r + 0.10),
        0.07,
        0.02,
        rope,
        root,
        major_segments=8,
        minor_segments=4,
        rotation=(math.pi / 2, 0, 0),
    )
    for index, x in enumerate((-half * 0.78, half * 0.78)):
        add_ico(
            f"lobster_trap_weight_{index}",
            (x, 0.28, 0.12),
            (0.12, 0.10, 0.10),
            metal,
            root,
            subdivisions=1,
        )
        add_catenary_rope(
            f"lobster_trap_weight_line_{index}",
            (x, 0.08, cage_z + 0.08),
            (x, 0.24, 0.20),
            0.02,
            0.016,
            rope,
            root,
            segments=3,
            vertices=4,
        )


def fishing_net_rack(spec: dict, root) -> None:
    """Build a compact harbor net-drying rack with a hanging net and buoy accents."""
    wood, rope, metal, buoy = spec["palette"]
    params = spec["parameters"]
    width = params["width"]
    height = params["height"]
    depth = params["depth"]
    post_height = height * 0.88
    for index, x in enumerate((-width * 0.5, width * 0.5)):
        add_tapered_beam(
            f"net_rack_post_{index}", (x, 0, 0.02), (x, 0, post_height),
            0.085, 0.055, wood, root, vertices=6,
        )
        add_box(
            f"net_rack_foot_{index}", (x, 0, 0.06), (0.34, depth * 0.72, 0.12),
            wood, root, bevel=0.018,
        )
    add_box("net_rack_top", (0, 0, post_height), (width + 0.18, 0.14, 0.14), wood, root, bevel=0.02)
    add_box("net_rack_lower_bar", (0, 0, height * 0.32), (width - 0.12, 0.09, 0.09), wood, root, bevel=0.014)
    add_lattice(
        "net_rack_net", (0, -depth * 0.30, height * 0.59), width - 0.18, height * 0.56, rope, root,
        columns=params["netColumns"], rows=params["netRows"], depth=0.018,
    )
    add_catenary_rope(
        "net_rack_top_rope", (-width * 0.48, -depth * 0.37, post_height - 0.08),
        (width * 0.48, -depth * 0.37, post_height - 0.08), 0.12, 0.018, rope, root, segments=8, vertices=5,
    )
    for index in range(params["buoys"]):
        t = (index + 1) / (params["buoys"] + 1)
        x = -width * 0.40 + width * 0.80 * t
        z = height * (0.29 + 0.05 * (index % 2))
        add_ico(
            f"net_rack_buoy_{index:02d}", (x, -depth * 0.42, z), (0.10, 0.10, 0.13),
            buoy if index % 2 else metal, root, subdivisions=1,
        )
        add_beam(
            f"net_rack_buoy_line_{index:02d}", (x, -depth * 0.40, z + 0.10),
            (x, -depth * 0.38, height * 0.52), 0.008, rope, root, vertices=4,
        )
    consolidate_lod_level(root, f"{spec['id']}_rack")


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
        add_box(
            f"fish_drying_top_rail_{y_index}",
            (0, y, top_z),
            (width + 0.16, 0.10, 0.11),
            wood,
            root,
            bevel=0.016,
        )
    for x_index, x in enumerate((-half_width, half_width)):
        add_box(
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


def wood_fence(spec: dict, root) -> None:
    wood, dark = spec["palette"]
    length = spec["parameters"]["length"]
    posts = spec["parameters"]["posts"]
    has_gate = spec["parameters"]["hasGate"]
    bay = length / max(1, posts - 1)
    for index in range(posts):
        x = -length * 0.5 + index * bay
        lean = math.radians((-2, 1, -1)[index % 3])
        add_box(f"fence_post_{index:02d}", (x, 0, 0.58), (0.18, 0.20, 1.16), dark, root, rotation=(0, lean, 0), bevel=0.025)
        add_tri_prism(f"fence_post_cap_{index:02d}", (x, 0, 1.20), (0.24, 0.22, 0.22), dark, root)
    for index in range(spec["parameters"]["rails"]):
        z = 0.38 + index * 0.42
        remaining = length - bay
        if has_gate and remaining > 0.35:
            add_box(
                f"fence_rail_{index:02d}",
                (bay * 0.5, 0, z),
                (remaining, 0.12, 0.15),
                wood,
                root,
                rotation=(0, math.radians(1.5 * (index - 0.5)), 0),
                bevel=0.02,
            )
        elif not has_gate:
            add_box(f"fence_rail_{index:02d}", (0, 0, z), (length, 0.12, 0.15), wood, root, rotation=(0, math.radians(1.5 * (index - 0.5)), 0), bevel=0.02)
        segments = spec["parameters"]["railSegments"]
        for segment in range(segments):
            if has_gate and (segment + 0.5) / segments < bay / length:
                continue
            x = -length * 0.5 + length * (segment + 0.5) / segments
            add_box(
                f"fence_rail_face_{index:02d}_{segment:02d}",
                (x, -0.075, z + math.sin((segment + index) * 1.7) * 0.018),
                (length / segments * 0.90, 0.055, 0.19), wood if segment % 3 else dark, root,
                rotation=(0, math.radians((segment % 3) - 1), 0), bevel=0.012,
            )
    if has_gate:
        gate_x = -length * 0.5 + bay * 0.5
        add_box("fence_gate_leaf", (gate_x, 0.02, 0.62), (bay * 0.82, 0.08, 1.02), wood, root, rotation=(0, 0, math.radians(8)), bevel=0.018)
        add_box("fence_gate_brace", (gate_x, 0.0, 0.62), (bay * 0.72, 0.05, 0.10), dark, root, rotation=(0, math.radians(-28), math.radians(8)), bevel=0.01)
        add_fasteners(
            "fence_gate_hinge",
            ((-length * 0.5 + 0.08, -0.12, 0.38), (-length * 0.5 + 0.08, -0.12, 0.80)),
            0.02,
            dark,
            root,
            depth=0.06,
        )
    fasteners = []
    for index in range(posts):
        x = -length * 0.5 + index * bay
        for rail in range(spec["parameters"]["rails"]):
            fasteners.append((x, -0.13, 0.38 + rail * 0.42))
    add_fasteners("fence_fastener", fasteners, 0.018, dark, root, depth=0.055)
    add_collision_primitives(spec, root)


def clay_oven(spec: dict, root) -> None:
    """Chunky clay-and-stone bake oven with a thick plinth, arched mouth, and flue pot."""
    stone, clay, wood = spec["palette"][:3]
    width = spec["parameters"]["width"]
    depth = spec["parameters"]["depth"]
    height = spec["parameters"]["height"]
    seed = spec["seed"]
    plinth_h = height * 0.28
    add_box("clay_oven_plinth", (0, 0, plinth_h * 0.5), (width, depth, plinth_h), stone, root, bevel=0.04)
    add_masonry_courses(
        "clay_oven_plinth_masonry",
        (0, 0, plinth_h * 0.5),
        width + 0.12,
        depth + 0.12,
        plinth_h,
        (stone,),
        root,
        courses=2,
        blocks_per_long_side=3,
        seed=seed + 11,
        block_depth=0.10,
        bevel=0.012,
    )
    dome_z = plinth_h + height * 0.34
    add_box("clay_oven_body", (0, 0.04, dome_z), (width * 0.78, depth * 0.72, height * 0.52), clay, root, bevel=0.06)
    add_ico("clay_oven_dome", (0, 0.02, plinth_h + height * 0.62), (width * 0.34, depth * 0.30, height * 0.22), clay, root, subdivisions=1)
    add_box("clay_oven_mouth_frame", (0, -depth * 0.38, plinth_h + height * 0.22), (width * 0.42, 0.12, height * 0.36), wood, root, bevel=0.016)
    add_box("clay_oven_mouth", (0, -depth * 0.42, plinth_h + height * 0.22), (width * 0.30, 0.06, height * 0.24), wood, root, bevel=0.01)
    add_box("clay_oven_flue", (0.0, depth * 0.12, plinth_h + height * 0.78), (0.18, 0.18, height * 0.18), stone, root, bevel=0.012)
    add_fasteners("clay_oven_pegs", ((-width * 0.16, -depth * 0.40, plinth_h + 0.18), (width * 0.16, -depth * 0.40, plinth_h + 0.18)), 0.016, wood, root, depth=0.05)
    add_collision_primitives(spec, root)


def hay_bale(spec: dict, root) -> None:
    """Stacked rectangular straw bales with jagged fiber edges matching the farm-props sheet."""
    hay, twine = spec["palette"]
    length = spec["parameters"]["length"]
    radius = spec["parameters"]["radius"]
    bands = spec["parameters"]["bands"]
    fiber_bands = spec["parameters"]["fiberBands"]
    bale_w = radius * 1.55
    bale_h = radius * 1.15
    bale_d = length * 0.92
    stack = (
        (-bale_w * 0.52, 0.0, bale_h * 0.5),
        (bale_w * 0.52, 0.04, bale_h * 0.5),
        (0.0, 0.02, bale_h * 1.52),
    )
    for bale_index, (cx, cy, cz) in enumerate(stack):
        add_box(
            f"hay_bale_body_{bale_index:02d}", (cx, cy, cz),
            (bale_w, bale_d, bale_h), hay, root, bevel=0.04,
        )
        band_span = bale_d * 0.62
        for band_index in range(bands):
            y = cy - band_span * 0.5 + band_span * band_index / max(1, bands - 1)
            add_box(
                f"hay_bale_twine_{bale_index:02d}_{band_index}",
                (cx, y, cz), (bale_w + 0.04, 0.04, bale_h + 0.04), twine, root, bevel=0.0,
            )
        for fiber in range(fiber_bands):
            angle = fiber * 2.39996 + bale_index
            edge = (fiber % 4)
            along = ((fiber // 4) % 5 - 2) * 0.11
            if edge == 0:
                loc = (cx + bale_w * 0.50, cy + along, cz + bale_h * 0.38)
                dim = (0.10, 0.12, 0.18)
            elif edge == 1:
                loc = (cx - bale_w * 0.50, cy + along, cz + bale_h * 0.36)
                dim = (0.10, 0.12, 0.18)
            elif edge == 2:
                loc = (cx + along, cy + bale_d * 0.50, cz + bale_h * 0.38)
                dim = (0.12, 0.10, 0.18)
            else:
                loc = (cx + along, cy - bale_d * 0.50, cz + bale_h * 0.34)
                dim = (0.12, 0.10, 0.18)
            add_tri_prism(
                f"hay_bale_fiber_{bale_index:02d}_{fiber:02d}",
                loc, dim, hay, root, rotation=(0.15 * (fiber % 3 - 1), 0, angle * 0.08),
            )
        for tuft in range(4):
            t_angle = tuft * 1.7 + bale_index
            add_ico(
                f"hay_bale_tuft_{bale_index:02d}_{tuft}",
                (
                    cx + math.cos(t_angle) * bale_w * 0.42,
                    cy + math.sin(t_angle) * bale_d * 0.38,
                    cz + bale_h * 0.48,
                ),
                (0.12, 0.10, 0.10), hay, root, subdivisions=2,
            )
    for straw in range(4):
        angle = straw * 1.7 + 0.4
        add_box(
            f"hay_bale_loose_{straw:02d}",
            (math.cos(angle) * (bale_w * 0.55), math.sin(angle) * (bale_d * 0.42), 0.03),
            (0.22, 0.04, 0.03), hay, root, bevel=0.0, rotation=(0, 0, angle),
        )
    consolidate_lod_level(root, spec["id"])
    add_collision_primitives(spec, root)


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
    add_collision_primitives(spec, root)


def worm_compost_bin(spec: dict, root) -> None:
    rng = seeded_rng(spec["seed"])
    wood, dark_wood, soil, metal = spec["palette"]

    width = spec["parameters"]["width"]
    depth = spec["parameters"]["depth"]
    height = spec["parameters"]["height"]
    slat_count = spec["parameters"]["slatCount"]
    lid_angle_deg = spec["parameters"]["lidAngleDeg"]
    soil_fill_ratio = spec["parameters"]["soilFillRatio"]

    # 1. Sturdy Corner Posts with Chamfered Caps
    post_w = 0.11
    post_d = 0.11
    post_h = height * 1.04
    hx = width * 0.5 - post_w * 0.45
    hy = depth * 0.5 - post_d * 0.45
    for index, (px, py) in enumerate(((-hx, -hy), (hx, -hy), (-hx, hy), (hx, hy))):
        add_box(
            f"compost_post_{index:02d}",
            (px, py, post_h * 0.5),
            (post_w, post_d, post_h),
            dark_wood,
            root,
            bevel=0.015,
        )
        add_tri_prism(
            f"compost_post_cap_{index:02d}",
            (px, py, post_h + 0.03),
            (post_w * 1.15, post_d * 1.15, 0.07),
            dark_wood,
            root,
            rotation=(0, 0, (math.pi * 0.5 if index % 2 else 0)),
        )

    # 2. Bottom Floor
    add_box(
        "compost_floor",
        (0, 0, 0.04),
        (width * 0.88, depth * 0.88, 0.06),
        dark_wood,
        root,
        bevel=0.012,
    )

    # 3. Horizontal Aeration Slats (Front, Back, Left, Right)
    slat_h = (height * 0.88) / slat_count * 0.78
    gap_h = (height * 0.88) / slat_count * 0.22
    slat_thick = 0.045

    for tier in range(slat_count):
        sz = 0.08 + (slat_h + gap_h) * (tier + 0.5)
        for face_name, fy in (("front", -depth * 0.5 + slat_thick * 0.4), ("back", depth * 0.5 - slat_thick * 0.4)):
            token = wood if (tier + (0 if face_name == "front" else 1)) % 3 != 2 else dark_wood
            slat_len = width - post_w * 0.6
            add_box(
                f"compost_slat_{face_name}_{tier:02d}",
                (0, fy, sz + rng.uniform(-0.005, 0.005)),
                (slat_len, slat_thick, slat_h),
                token,
                root,
                bevel=0.008,
            )
        for side_name, fx in (("left", -width * 0.5 + slat_thick * 0.4), ("right", width * 0.5 - slat_thick * 0.4)):
            token = wood if (tier + (1 if side_name == "left" else 0)) % 3 != 2 else dark_wood
            slat_len = depth - post_d * 0.6
            add_box(
                f"compost_slat_{side_name}_{tier:02d}",
                (fx, 0, sz + rng.uniform(-0.005, 0.005)),
                (slat_thick, slat_len, slat_h),
                token,
                root,
                bevel=0.008,
            )

    # 4. Interior Vermicompost Bedding (Faceted dark soil mounds)
    soil_bed_h = height * soil_fill_ratio
    add_box(
        "compost_soil_base",
        (0, 0, soil_bed_h * 0.5),
        (width * 0.82, depth * 0.82, soil_bed_h),
        soil,
        root,
        bevel=0.02,
    )
    mound_coords = [
        (-width * 0.22, -depth * 0.20, 0.16, 0.28),
        (width * 0.24, -depth * 0.18, 0.15, 0.26),
        (-width * 0.18, depth * 0.22, 0.17, 0.30),
        (width * 0.20, depth * 0.20, 0.14, 0.25),
        (0.0, 0.0, 0.18, 0.34),
    ]
    for m_idx, (mx, my, mh, mr) in enumerate(mound_coords):
        jitter_x = rng.uniform(-0.02, 0.02)
        jitter_y = rng.uniform(-0.02, 0.02)
        rot_z = rng.uniform(-0.5, 0.5)
        add_ico(
            f"compost_soil_mound_{m_idx:02d}",
            (mx + jitter_x, my + jitter_y, soil_bed_h * 0.92 + mh * 0.5),
            (mr * 0.95, mr * 0.85, mh * 0.75),
            soil,
            root,
            subdivisions=2,
            rotation=(0, 0, rot_z),
        )

    # 5. Propped Open Angled Lid
    lid_angle = math.radians(lid_angle_deg)
    lid_w = width * 1.06
    lid_len = depth * 1.05
    lid_thick = 0.04

    hinge_y = depth * 0.5 + 0.02
    hinge_z = height * 1.02

    lid_mid_dist = lid_len * 0.5
    lid_cy = hinge_y - lid_mid_dist * math.cos(lid_angle)
    lid_cz = hinge_z + lid_mid_dist * math.sin(lid_angle)

    board_count = 4
    board_w = lid_w / board_count
    for b_idx in range(board_count):
        bx = -lid_w * 0.5 + board_w * (b_idx + 0.5)
        b_token = wood if b_idx % 2 == 0 else dark_wood
        add_box(
            f"compost_lid_board_{b_idx:02d}",
            (bx, lid_cy, lid_cz),
            (board_w * 0.94, lid_len, lid_thick),
            b_token,
            root,
            rotation=(-lid_angle, 0, 0),
            bevel=0.008,
        )

    for batten_idx, batten_along in enumerate((0.22, 0.78)):
        batten_dist = lid_len * batten_along
        batten_y = hinge_y - batten_dist * math.cos(lid_angle) + math.sin(lid_angle) * (lid_thick * 0.7)
        batten_z = hinge_z + batten_dist * math.sin(lid_angle) + math.cos(lid_angle) * (lid_thick * 0.7)
        add_box(
            f"compost_lid_batten_{batten_idx:02d}",
            (0, batten_y, batten_z),
            (lid_w * 0.92, 0.06, 0.035),
            dark_wood,
            root,
            rotation=(-lid_angle, 0, 0),
            bevel=0.006,
        )

    front_lip_dist = lid_len * 0.98
    lip_y = hinge_y - front_lip_dist * math.cos(lid_angle) - math.sin(lid_angle) * (lid_thick * 0.6)
    lip_z = hinge_z + front_lip_dist * math.sin(lid_angle) - math.cos(lid_angle) * (lid_thick * 0.6)
    add_box(
        "compost_lid_handle_lip",
        (0, lip_y, lip_z),
        (lid_w * 0.45, 0.05, 0.04),
        dark_wood,
        root,
        rotation=(-lid_angle, 0, 0),
        bevel=0.008,
    )

    # 6. Diagonal Lid Prop Arm
    prop_base = (width * 0.46, depth * 0.12, height * 0.98)
    prop_reach_dist = lid_len * 0.58
    prop_top = (
        width * 0.46,
        hinge_y - prop_reach_dist * math.cos(lid_angle) - 0.02,
        hinge_z + prop_reach_dist * math.sin(lid_angle) - 0.03,
    )
    add_beam("compost_prop_arm", prop_base, prop_top, 0.022, dark_wood, root, vertices=6)

    # 7. Dark Metal Hardware
    for h_idx, hx_pos in enumerate((-width * 0.32, width * 0.32)):
        add_box(
            f"compost_hinge_mount_{h_idx:02d}",
            (hx_pos, hinge_y - 0.02, hinge_z - 0.04),
            (0.09, 0.035, 0.10),
            metal,
            root,
            bevel=0.005,
        )
        add_box(
            f"compost_hinge_strap_{h_idx:02d}",
            (hx_pos, hinge_y - lid_len * 0.15 * math.cos(lid_angle), hinge_z + lid_len * 0.15 * math.sin(lid_angle) + 0.025),
            (0.075, lid_len * 0.28, 0.025),
            metal,
            root,
            rotation=(-lid_angle, 0, 0),
            bevel=0.005,
        )

    bracket_positions = []
    for cx_side in (-hx, hx):
        for cy_side in (-hy, hy):
            for b_z in (0.16, height * 0.84):
                add_box(
                    f"compost_bracket_fb_{len(bracket_positions)}",
                    (cx_side, cy_side + (0.055 if cy_side > 0 else -0.055), b_z),
                    (0.08, 0.02, 0.08),
                    metal,
                    root,
                    bevel=0.004,
                )
                bracket_positions.append((cx_side, cy_side + (0.07 if cy_side > 0 else -0.07), b_z))

    add_fasteners("compost_fastener", bracket_positions, 0.012, metal, root, depth=0.04)

    # 8. Collision Box
    add_collision_primitives(spec, root)


def wagon_cart(spec: dict, root) -> None:
    """Build a two-wheel timber farm cart with thick planks and stacked sacks."""
    params = spec["parameters"]
    honey, dark, sack_token, rope_token = spec["palette"]
    length, width, height = params.get("length", 2.6), params.get("width", 1.4), params.get("height", 1.2)
    wheel_radius = min(0.62, height * 0.52)
    axle_y = length * 0.18
    bed_z = wheel_radius + 0.16

    for side in (-width * 0.34, width * 0.34):
        add_box(
            f"wagon_chassis_{'l' if side < 0 else 'r'}",
            (side, 0.05, bed_z - 0.16), (0.14, length * 0.92, 0.16), dark, root, bevel=0.02,
        )
    add_cylinder(
        "wagon_axle", (0, axle_y, wheel_radius), 0.07, width + 0.52, dark, root,
        vertices=8, rotation=(0, math.pi / 2, 0),
    )

    spoke_count = 10
    for side, sign in (("left", -1), ("right", 1)):
        x = sign * (width * 0.5 + 0.14)
        add_ring(
            f"wagon_wheel_rim_{side}", (x, axle_y, wheel_radius),
            wheel_radius, 0.06, dark, root,
            major_segments=14, minor_segments=6, rotation=(0, math.pi / 2, 0),
        )
        add_ring(
            f"wagon_wheel_iron_{side}", (x, axle_y, wheel_radius),
            wheel_radius + 0.02, 0.03, dark, root,
            major_segments=14, minor_segments=4, rotation=(0, math.pi / 2, 0),
        )
        add_cylinder(
            f"wagon_wheel_hub_{side}", (x, axle_y, wheel_radius),
            0.12, 0.20, honey, root,
            vertices=8, rotation=(0, math.pi / 2, 0), bevel=0.016,
        )
        for spoke in range(spoke_count):
            spoke_angle = spoke * math.tau / spoke_count
            add_beam(
                f"wagon_spoke_{side}_{spoke:02d}",
                (x, axle_y, wheel_radius),
                (
                    x,
                    axle_y + math.cos(spoke_angle) * (wheel_radius - 0.05),
                    wheel_radius + math.sin(spoke_angle) * (wheel_radius - 0.05),
                ),
                0.028, honey, root, vertices=6,
            )

    add_plank_field(
        "wagon_bed_plank", (0, 0.05, bed_z), width, length * 0.88, 0.10,
        (honey, dark), root, count=8, axis="y", bevel=0.014,
    )
    for side, side_x in (("left", -width * 0.48), ("right", width * 0.48)):
        add_plank_field(
            f"wagon_side_{side}", (side_x, 0.08, bed_z + 0.28), 0.10, length * 0.82, 0.46,
            (honey, dark), root, count=5, axis="y", bevel=0.012,
        )
        add_box(f"wagon_side_cap_{side}", (side_x, 0.08, bed_z + 0.52), (0.08, length * 0.84, 0.08), dark, root, bevel=0.01)
    add_box("wagon_front_board", (0, -length * 0.40, bed_z + 0.28), (width * 0.92, 0.10, 0.50), honey, root, bevel=0.016)
    add_box("wagon_tail_board", (0, length * 0.42, bed_z + 0.22), (width * 0.92, 0.10, 0.38), dark, root, bevel=0.016)

    for side, sign in (("left", -1), ("right", 1)):
        add_beam(
            f"wagon_shaft_{side}",
            (sign * width * 0.22, -length * 0.38, bed_z - 0.06),
            (sign * width * 0.18, -length * 0.92, 0.42),
            0.055, honey, root, vertices=7,
        )
    add_box("wagon_yoke", (0, -length * 0.90, 0.44), (width * 0.46, 0.10, 0.10), dark, root, bevel=0.012)

    sack_positions = [
        (-0.28, -0.18, bed_z + 0.02, 0.10),
        (0.28, -0.12, bed_z + 0.02, -0.08),
        (-0.26, 0.22, bed_z + 0.02, -0.05),
        (0.26, 0.28, bed_z + 0.02, 0.07),
        (0.00, 0.02, bed_z + 0.34, 0.12),
        (-0.18, 0.18, bed_z + 0.34, -0.10),
        (0.18, -0.06, bed_z + 0.34, 0.06),
    ]
    for s_idx, (sx, sy, sz, syaw) in enumerate(sack_positions):
        add_burlap_sack(
            f"wagon_sack_{s_idx:02d}", (sx, sy, sz), (0.50, 0.42, 0.38),
            sack_token, rope_token, root, rotation=(0, 0, syaw),
        )
    add_catenary_rope(
        "wagon_tie_rope_01",
        (-width * 0.46, -0.10, bed_z + 0.62), (width * 0.46, 0.22, bed_z + 0.62),
        0.10, 0.022, rope_token, root, segments=6,
    )
    add_catenary_rope(
        "wagon_tie_rope_02",
        (width * 0.46, -0.16, bed_z + 0.62), (-width * 0.46, 0.26, bed_z + 0.62),
        0.10, 0.022, rope_token, root, segments=6,
    )
    consolidate_lod_level(root, spec["id"])
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
            add_box(f"p_crate_{face}_slat_{index:02d}", (0, y, z), (size, 0.075, spacing * 0.82), wood, root, bevel=0.012)
    for side, x in (("left", -size * 0.48), ("right", size * 0.48)):
        for index in range(slats):
            z = spacing * (index + 0.5)
            add_box(f"p_crate_{side}_slat_{index:02d}", (x, 0, z), (0.075, size, spacing * 0.82), wood, root, bevel=0.012)
    for index, (x, y) in enumerate(((-size * 0.44, -size * 0.44), (size * 0.44, -size * 0.44), (-size * 0.44, size * 0.44), (size * 0.44, size * 0.44))):
        add_box(f"p_crate_corner_{index}", (x, y, size * 0.5), (0.09, 0.09, size), dark, root, bevel=0.015)
    add_box("p_crate_bottom", (0, 0, 0.045), (size, size, 0.09), wood, root, bevel=0.012)

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


def farm_workbench(spec: dict, root) -> None:
    """Chunky farm workbench with authored top planks, a real vise, and distinct tools."""
    wood, dark, metal, canvas = spec["palette"]
    width = spec["parameters"]["width"]
    depth = spec["parameters"]["depth"]
    top_height = spec["parameters"]["topHeight"]
    top_thickness = 0.18
    seed = spec["seed"]
    leg_x = width * 0.40
    leg_y = depth * 0.34
    for index, (x, y) in enumerate(((-leg_x, -leg_y), (leg_x, -leg_y), (-leg_x, leg_y), (leg_x, leg_y))):
        add_box(
            f"workbench_leg_{index}",
            (x, y, top_height * 0.48),
            (0.18, 0.18, top_height * 0.96),
            dark,
            root,
            bevel=0.024,
        )
    add_plank_field(
        "workbench_top_planks",
        (0, 0, top_height),
        width,
        depth,
        top_thickness,
        (wood, dark),
        root,
        count=7,
        axis="x",
        seed=seed + 13,
        bevel=0.014,
    )
    add_fasteners(
        "workbench_top_peg",
        (
            (-width * 0.36, -depth * 0.32, top_height + top_thickness * 0.52),
            (width * 0.12, -depth * 0.32, top_height + top_thickness * 0.52),
            (width * 0.36, -depth * 0.32, top_height + top_thickness * 0.52),
            (-width * 0.36, depth * 0.32, top_height + top_thickness * 0.52),
            (width * 0.36, depth * 0.32, top_height + top_thickness * 0.52),
        ),
        0.022,
        wood,
        root,
        depth=0.08,
    )
    add_box(
        "workbench_lower_shelf",
        (0, 0.04, top_height * 0.32),
        (width * 0.78, depth * 0.78, 0.12),
        wood,
        root,
        bevel=0.016,
    )
    add_beam(
        "workbench_front_brace",
        (-leg_x, -leg_y, top_height * 0.32),
        (leg_x, -leg_y, top_height * 0.58),
        0.06,
        dark,
        root,
        vertices=6,
    )
    add_box(
        "workbench_backboard",
        (0, depth * 0.44, top_height + 0.46),
        (width * 0.90, 0.12, 0.78),
        dark,
        root,
        bevel=0.02,
    )
    add_box(
        "workbench_tool_rail",
        (0, depth * 0.38, top_height + 0.58),
        (width * 0.72, 0.08, 0.08),
        dark,
        root,
        bevel=0.01,
    )

    # Distinct hanging tools: mallet, chisel, hand plane — not three identical rods.
    add_tapered_beam(
        "workbench_mallet_handle",
        (-width * 0.28, depth * 0.30, top_height + 0.22),
        (-width * 0.28, depth * 0.30, top_height + 0.58),
        0.032,
        0.026,
        wood,
        root,
        vertices=6,
    )
    add_cylinder(
        "workbench_mallet_head",
        (-width * 0.28, depth * 0.30, top_height + 0.22),
        0.07,
        0.16,
        canvas,
        root,
        vertices=8,
        rotation=(0, math.pi / 2, 0),
        bevel=0.012,
    )
    add_tapered_beam(
        "workbench_chisel_handle",
        (0.0, depth * 0.30, top_height + 0.28),
        (0.0, depth * 0.30, top_height + 0.58),
        0.028,
        0.022,
        wood,
        root,
        vertices=6,
    )
    add_box(
        "workbench_chisel_blade",
        (0.0, depth * 0.30, top_height + 0.22),
        (0.045, 0.02, 0.14),
        metal,
        root,
        bevel=0.006,
    )
    add_box(
        "workbench_plane_body",
        (width * 0.26, depth * 0.28, top_height + 0.34),
        (0.28, 0.10, 0.08),
        wood,
        root,
        bevel=0.014,
    )
    add_box(
        "workbench_plane_blade",
        (width * 0.18, depth * 0.28, top_height + 0.30),
        (0.04, 0.08, 0.10),
        metal,
        root,
        bevel=0.006,
    )
    add_box(
        "workbench_plane_tote",
        (width * 0.34, depth * 0.28, top_height + 0.42),
        (0.05, 0.04, 0.12),
        canvas,
        root,
        bevel=0.008,
    )

    vise_x = width * 0.34
    vise_y = -depth * 0.48
    add_box(
        "workbench_vise_fixed_jaw",
        (vise_x, vise_y + 0.08, top_height + 0.06),
        (0.32, 0.10, 0.26),
        metal,
        root,
        bevel=0.016,
    )
    add_box(
        "workbench_vise_moving_jaw",
        (vise_x, vise_y - 0.10, top_height + 0.06),
        (0.32, 0.10, 0.26),
        metal,
        root,
        bevel=0.016,
    )
    add_cylinder(
        "workbench_vise_screw",
        (vise_x, vise_y - 0.02, top_height - 0.02),
        0.028,
        0.28,
        metal,
        root,
        vertices=6,
        rotation=(math.pi / 2, 0, 0),
        bevel=0.004,
    )
    add_cylinder(
        "workbench_vise_handle",
        (vise_x, vise_y - 0.22, top_height - 0.02),
        0.018,
        0.36,
        wood,
        root,
        vertices=6,
        rotation=(0, math.pi / 2, 0),
        bevel=0.004,
    )
    add_box(
        "workbench_drawer",
        (-width * 0.22, -depth * 0.42, top_height * 0.62),
        (0.46, 0.14, 0.16),
        dark,
        root,
        bevel=0.014,
    )
    add_box(
        "workbench_drawer_pull",
        (-width * 0.22, -depth * 0.50, top_height * 0.62),
        (0.10, 0.04, 0.04),
        metal,
        root,
        bevel=0.006,
    )
    add_collision_primitives(spec, root)


def produce_stall(spec: dict, root) -> None:
    """Working dock produce stall: thick posts, hanging canvas, and a filled counter."""
    wood, dark, canvas, produce, sign = spec["palette"]
    width = spec["parameters"]["width"]
    depth = spec["parameters"]["depth"]
    roof_height = spec["parameters"]["roofHeight"]
    seed = spec["seed"]
    post_x = width * 0.42
    post_y = depth * 0.36
    post_size = 0.22

    for index, (x, y) in enumerate(((-post_x, -post_y), (post_x, -post_y), (-post_x, post_y), (post_x, post_y))):
        add_box(
            f"produce_stall_post_{index}",
            (x, y, roof_height * 0.48),
            (post_size, post_size, roof_height * 0.96),
            dark,
            root,
            bevel=0.028,
        )
        add_fasteners(
            f"produce_stall_post_peg_{index}",
            ((x, y - post_size * 0.55, 0.90), (x, y - post_size * 0.55, roof_height * 0.72)),
            0.02,
            wood,
            root,
            depth=0.07,
        )

    # Short knee braces and exposed canopy rafters make the stall read as
    # assembled carpentry rather than four poles holding a paper canopy.
    for side, x in ((-1, -post_x), (1, post_x)):
        add_beam(
            f"produce_stall_knee_front_{'l' if side < 0 else 'r'}",
            (x, -post_y, roof_height * 0.68),
            (x - side * width * 0.18, -post_y, roof_height * 0.92),
            0.045,
            dark,
            root,
            vertices=4,
        )
        add_beam(
            f"produce_stall_knee_back_{'l' if side < 0 else 'r'}",
            (x, post_y, roof_height * 0.68),
            (x - side * width * 0.18, post_y, roof_height * 0.92),
            0.045,
            dark,
            root,
            vertices=4,
        )

    add_plank_field(
        "produce_stall_back_wall",
        (0, post_y + 0.02, roof_height * 0.42),
        width * 0.90,
        0.12,
        roof_height * 0.78,
        (dark, wood),
        root,
        count=6,
        axis="x",
        seed=seed + 21,
        bevel=0.012,
    )
    add_tri_prism(
        "produce_stall_back_gable",
        (0, post_y + 0.02, roof_height * 0.86),
        (width * 0.92, 0.12, 0.42),
        dark,
        root,
    )
    add_plank_field(
        "produce_stall_base_planks",
        (0, 0, 0.08),
        width * 0.96,
        depth * 0.92,
        0.10,
        (dark, wood),
        root,
        count=5,
        axis="y",
        seed=seed + 17,
        bevel=0.014,
    )

    add_plank_field(
        "produce_stall_counter",
        (0, -depth * 0.28, 0.94),
        width * 0.94,
        depth * 0.42,
        0.16,
        (wood,),
        root,
        count=6,
        axis="x",
        seed=seed + 19,
        bevel=0.016,
    )
    add_plank_field(
        "produce_stall_front_apron",
        (0, -depth * 0.46, 0.50),
        width * 0.90,
        0.12,
        0.68,
        (wood, dark),
        root,
        count=5,
        axis="x",
        seed=seed + 23,
        bevel=0.012,
    )

    add_box(
        "produce_stall_ridge",
        (0, 0, roof_height + 0.04),
        (width * 1.02, 0.14, 0.12),
        dark,
        root,
        bevel=0.016,
    )
    # Canvas canopy with hang: three draped panels, not a paper sheet.
    for index, (y_off, sag, z_off) in enumerate((
        (-depth * 0.22, math.radians(16), -0.04),
        (0.0, math.radians(4), 0.04),
        (depth * 0.22, math.radians(-10), -0.02),
    )):
        add_box(
            f"produce_stall_canopy_panel_{index}",
            (0, y_off, roof_height - 0.08 + z_off),
            (width * 1.08, depth * 0.46, 0.07),
            canvas,
            root,
            rotation=(sag, 0, 0),
            bevel=0.012,
        )
    for rafter in range(5):
        rx = -width * 0.42 + width * 0.84 * rafter / 4
        add_box(
            f"produce_stall_canopy_rafter_{rafter}",
            (rx, 0, roof_height - 0.15),
            (0.08, depth * 1.10, 0.08),
            dark,
            root,
            bevel=0.007,
        )
    for index in range(5):
        x = -width * 0.40 + index * width * 0.20
        add_box(
            f"produce_stall_canopy_flap_{index}",
            (x, -depth * 0.58, roof_height - 0.22),
            (width * 0.12, 0.05, 0.36),
            sign if index % 2 else canvas,
            root,
            rotation=(math.radians(-28), 0, 0),
            bevel=0.008,
        )
    add_catenary_rope(
        "produce_stall_canopy_tie",
        (-post_x, -post_y, roof_height - 0.18),
        (post_x, -post_y, roof_height - 0.18),
        0.10,
        0.018,
        dark,
        root,
        segments=6,
        vertices=5,
    )

    # Side ladder with thick rails and rungs.
    ladder_x = -width * 0.52
    add_box("produce_stall_ladder_rail_a", (ladder_x, -0.12, 1.15), (0.08, 0.08, 2.20), dark, root, bevel=0.012)
    add_box("produce_stall_ladder_rail_b", (ladder_x, 0.18, 1.15), (0.08, 0.08, 2.20), dark, root, bevel=0.012)
    for rung in range(6):
        add_box(
            f"produce_stall_ladder_rung_{rung}",
            (ladder_x, 0.03, 0.28 + rung * 0.34),
            (0.08, 0.34, 0.06),
            wood,
            root,
            bevel=0.008,
        )

    add_box(
        "produce_stall_sign",
        (0, -depth * 0.52, roof_height - 0.58),
        (width * 0.46, 0.08, 0.32),
        sign,
        root,
        bevel=0.02,
    )
    add_catenary_rope(
        "produce_stall_sign_hang",
        (-width * 0.16, -depth * 0.50, roof_height - 0.22),
        (width * 0.16, -depth * 0.50, roof_height - 0.22),
        0.08,
        0.016,
        dark,
        root,
        segments=4,
        vertices=4,
    )

    crate_spots = (
        (-width * 0.28, -depth * 0.34, 1.12, 0.36),
        (width * 0.08, -depth * 0.30, 1.12, 0.32),
        (width * 0.32, -depth * 0.38, 1.12, 0.30),
    )
    for crate_i, (cx, cy, cz, size) in enumerate(crate_spots):
        add_box(f"produce_stall_crate_{crate_i}", (cx, cy, cz), (size, size * 0.86, 0.22), wood, root, bevel=0.014)
        add_box(
            f"produce_stall_crate_brace_{crate_i}",
            (cx, cy - size * 0.40, cz),
            (size * 0.82, 0.04, 0.18),
            dark,
            root,
            bevel=0.006,
        )

    # Tomatoes (accent_red) and apples/squash (accent_ochre) using catalog tokens only.
    tomato_spots = (
        (-width * 0.28, -depth * 0.34, 1.32),
        (-width * 0.22, -depth * 0.30, 1.30),
        (-width * 0.32, -depth * 0.38, 1.30),
        (-width * 0.26, -depth * 0.36, 1.42),
        (-width * 0.18, -depth * 0.44, 1.10),
        (-width * 0.12, -depth * 0.40, 1.10),
        (width * 0.06, -depth * 0.28, 1.30),
        (width * 0.12, -depth * 0.34, 1.30),
        (width * 0.04, -depth * 0.32, 1.40),
    )
    for index, (px, py, pz) in enumerate(tomato_spots):
        add_ico(
            f"produce_stall_tomato_{index:02d}",
            (px, py, pz),
            (0.09, 0.08, 0.08),
            produce,
            root,
            subdivisions=1,
        )
    apple_spots = (
        (width * 0.30, -depth * 0.36, 1.30),
        (width * 0.36, -depth * 0.40, 1.28),
        (width * 0.28, -depth * 0.42, 1.28),
        (width * 0.34, -depth * 0.34, 1.38),
        (width * 0.22, -depth * 0.46, 1.10),
        (0.0, -depth * 0.48, 1.10),
        (width * 0.10, -depth * 0.50, 1.10),
        (-width * 0.04, -depth * 0.46, 1.10),
    )
    for index, (px, py, pz) in enumerate(apple_spots):
        add_ico(
            f"produce_stall_apple_{index:02d}",
            (px, py, pz),
            (0.08, 0.075, 0.08),
            sign,
            root,
            subdivisions=1,
        )
    add_box(
        "produce_stall_squash",
        (width * 0.18, -depth * 0.20, 1.18),
        (0.22, 0.16, 0.14),
        sign,
        root,
        bevel=0.04,
    )
    add_box(
        "produce_stall_melon",
        (-width * 0.08, -depth * 0.22, 1.18),
        (0.20, 0.16, 0.16),
        produce,
        root,
        bevel=0.04,
    )
    for index, x in enumerate((-width * 0.36, width * 0.40)):
        add_ring(
            f"produce_stall_rope_coil_{index}",
            (x, depth * 0.18, 0.22),
            0.16,
            0.04,
            dark,
            root,
            major_segments=8,
            minor_segments=4,
        )
    add_collision_primitives(spec, root)


def seed_pouch(spec: dict, root) -> None:
    burlap, tie = spec["palette"]
    add_burlap_sack("seed_pouch", (0, 0, 0.22), (0.36, 0.18, 0.44), burlap, tie, root, rotation=(0.08, 0.0, -0.10))
    add_catenary_rope("seed_pouch_loop", (-0.13, 0, 0.40), (0.13, 0, 0.40), 0.10, 0.018, tie, root, segments=5, vertices=5)
    add_box("seed_pouch_front_flap", (0, -0.105, 0.43), (0.28, 0.035, 0.14), tie, root, rotation=(0.08, 0, 0), bevel=0.012)
    add_box("seed_pouch_front_pocket", (0, -0.112, 0.30), (0.27, 0.028, 0.12), tie, root, bevel=0.010)
    add_box("seed_pouch_pocket_seam", (0, -0.132, 0.36), (0.29, 0.018, 0.025), tie, root, bevel=0.004)


def watering_can(spec: dict, root) -> None:
    """Side-handle watering can. Origin is the grip.

    Blender +Z (glTF +Y) is the handle axis. Body sits in +X (outward of the
    right palm at rest with identity socket rotation). Spout points Blender -Y
    (glTF +Z, forward), never through the forearm.
    """
    metal, dark, accent = spec["palette"]
    add_grip_marker("tool_primary_grip", (-0.016, 0, 0), root,
                    fingers=(0, -1, 0), contact_normal=(1, 0, 0))
    add_cylinder("watering_can_handle", (0, 0, 0), 0.016, 0.12, dark, root, vertices=6, bevel=0.003)
    add_cylinder(
        "watering_can_handle_top",
        (0.06, 0, 0.05),
        0.012,
        0.10,
        dark,
        root,
        vertices=6,
        rotation=(0, math.pi / 2, 0),
        bevel=0.002,
    )
    add_cylinder(
        "watering_can_handle_bot",
        (0.06, 0, -0.05),
        0.012,
        0.10,
        dark,
        root,
        vertices=6,
        rotation=(0, math.pi / 2, 0),
        bevel=0.002,
    )
    add_profiled_vessel("watering_can_body", (.16, 0, 0),
        ((-.10, .095), (-.06, .110), (.065, .105), (.10, .070)), .009, metal, root, sides=10)
    add_beam("watering_can_carry_handle_a", (0.07, 0, 0.08), (0.14, 0, 0.24), 0.015, dark, root, vertices=6)
    add_beam("watering_can_carry_handle_b", (0.14, 0, 0.24), (0.25, 0, 0.08), 0.015, dark, root, vertices=6)
    add_cylinder("watering_can_lid", (0.16, 0, 0.11), 0.07, 0.035, accent, root, vertices=8, bevel=0.005)
    add_cylinder("watering_can_lid_knob", (0.16, 0, 0.145), 0.018, 0.025, dark, root, vertices=6, bevel=0.003)
    add_cone(
        "watering_can_spout",
        (0.16, -0.16, 0.02),
        0.045,
        0.022,
        0.22,
        metal,
        root,
        vertices=8,
        rotation=(math.pi / 2, 0, 0),
    )
    add_cylinder(
        "watering_can_rose",
        (0.16, -0.28, 0.02),
        0.055,
        0.04,
        accent,
        root,
        vertices=10,
        rotation=(math.pi / 2, 0, 0),
        bevel=0.005,
    )


def sickle(spec: dict, root) -> None:
    """Sickle with the grip at the origin. Handle along Blender +Z (glTF +Y);
    blade curves in +X (away from the body on the right palm).
    """
    wood, metal = spec["palette"]
    add_grip_marker("tool_primary_grip", (0.05, 0, 0), root,
                    fingers=(0, 1, 0), contact_normal=(-1, 0, 0))
    grip = 0.16
    # A 0.055 radius is an 11cm shaft: that is a fence post, not something a hand
    # closes around.
    add_tapered_beam("sickle_handle", (0, 0, -grip), (0, 0, 0.40 - grip), 0.026, 0.021, wood, root, vertices=7)
    add_cylinder("sickle_ferrule", (0, 0, 0.38 - grip), 0.026, 0.045, metal, root, vertices=7, bevel=0.004)

    # The blade is a lamina: broad across the crescent, thin through it. Four
    # round beams gave a bent wire, which is why the tool read as a plank with a
    # scribble floating over it.
    blade_points = [
        (0.012, 0.0, 0.400 - grip),
        (0.160, 0.0, 0.512 - grip),
        (0.330, 0.0, 0.552 - grip),
        (0.470, 0.0, 0.512 - grip),
        (0.542, 0.0, 0.410 - grip),
        (0.522, 0.0, 0.300 - grip),
        (0.438, 0.0, 0.236 - grip),
    ]
    for index in range(len(blade_points) - 1):
        start, end = blade_points[index], blade_points[index + 1]
        run, rise = end[0] - start[0], end[2] - start[2]
        span = math.hypot(run, rise)
        add_box(
            f"sickle_blade_{index}",
            ((start[0] + end[0]) * 0.5, 0.0, (start[2] + end[2]) * 0.5),
            (span * 1.12, 0.011, 0.086 - index * 0.0112),
            metal,
            root,
            rotation=(0, -math.atan2(rise, run), 0),
            bevel=0.004,
        )


def crop_bundle(spec: dict, root) -> None:
    crop, tie, leaf = spec["palette"]
    for index in range(9):
        angle = index * GOLDEN_ANGLE
        x = math.cos(angle) * (0.035 + 0.012 * (index % 3))
        y = math.sin(angle) * (0.035 + 0.012 * (index % 3))
        add_tapered_beam(
            f"crop_bundle_stem_{index:02d}",
            (x, y, -0.34),
            (x + math.cos(angle) * 0.05, y + math.sin(angle) * 0.05, 0.36 + 0.025 * (index % 3)),
            0.018,
            0.011,
            crop,
            root,
            vertices=4,
        )
        add_tri_prism(
            f"crop_bundle_leaf_{index:02d}",
            (x + math.cos(angle) * 0.08, y + math.sin(angle) * 0.08, 0.18 + 0.03 * (index % 2)),
            (0.10, 0.025, 0.28),
            leaf,
            root,
            rotation=(0.32, 0, angle),
        )
    add_ring("crop_bundle_tie", (0, 0, -0.02), 0.12, 0.022, tie, root, major_segments=9, minor_segments=4)


def harvest_basket(spec: dict, root) -> None:
    wicker, dark, produce = spec["palette"]
    add_cylinder("harvest_basket_base", (0, 0, 0.09), 0.31, 0.15, dark, root, vertices=10, bevel=0.018)
    for index in range(10):
        angle = index * math.tau / 10
        add_tapered_beam(
            f"harvest_basket_weave_{index:02d}",
            (math.cos(angle) * 0.28, math.sin(angle) * 0.28, 0.10),
            (math.cos(angle) * 0.36, math.sin(angle) * 0.36, 0.48),
            0.028,
            0.022,
            wicker,
            root,
            vertices=5,
        )
    for index, z in enumerate((0.20, 0.36, 0.50)):
        add_ring(f"harvest_basket_ring_{index}", (0, 0, z), 0.30 + index * 0.025, 0.024, dark, root, major_segments=10, minor_segments=4)
    add_catenary_rope("harvest_basket_handle", (-0.34, 0, 0.48), (0.34, 0, 0.48), -0.42, 0.035, wicker, root, segments=7, vertices=6)
    for index in range(5):
        angle = index * GOLDEN_ANGLE
        add_ico(
            f"harvest_basket_produce_{index:02d}",
            (math.cos(angle) * 0.16, math.sin(angle) * 0.16, 0.52 + 0.035 * (index % 2)),
            (0.11, 0.10, 0.10),
            produce,
            root,
            subdivisions=1,
        )


def workstation_scoop(spec: dict, root) -> None:
    """Scoop with the grip at the origin. Handle along Blender +Z (glTF +Y)."""
    wood, metal = spec["palette"]
    add_grip_marker("tool_primary_grip", (0.04, 0, 0), root,
                    fingers=(0, 1, 0), contact_normal=(-1, 0, 0))
    grip = 0.14
    add_tapered_beam("workstation_scoop_handle", (0, 0, -grip), (0, 0, 0.50 - grip), 0.032, 0.026, wood, root, vertices=7)
    add_cylinder("workstation_scoop_ferrule", (0, 0, 0.39), 0.038, 0.06, metal, root, vertices=7, bevel=0.005)

    # A flat floor with an upright back panel reads as a small chair, not a
    # scoop. The spec allows 0.34 across but only 0.16 of depth, so the bowl is
    # a wide, shallow flare -- which is the shape a grain scoop actually has --
    # lofted as one elliptical cup with an iron rim band around the mouth.
    add_lofted_form(
        "workstation_scoop_bowl",
        (
            ((0.0, 0.020, 0.436), 0.062, 0.034),
            ((0.0, 0.006, 0.492), 0.124, 0.062),
            ((0.0, -0.028, 0.578), 0.160, 0.078),
            ((0.0, -0.028, 0.578), 0.150, 0.068),
            ((0.0, 0.006, 0.496), 0.114, 0.052),
            ((0.0, 0.020, 0.448), 0.052, 0.024),
        ),
        wood,
        root,
        sides=10,
    )
    add_conforming_shell(
        "workstation_scoop_rim",
        (
            ((0.0, -0.026, 0.566), 0.161, 0.079),
            ((0.0, -0.030, 0.590), 0.165, 0.081),
        ),
        metal,
        root,
        arc=(0, math.tau), offset=0, thickness=.006, segments=10,
    )


def fishing_rod(spec: dict, root) -> None:
    """Authored coastal casting rod with contoured timber grip, classic brass reel, flexed blank, and bobber."""
    wood_honey, wood_dark, brass, terracotta, foam = spec["palette"]
    params = spec.get("parameters", {})
    total_length = params.get("length", 2.25)
    guide_count = params.get("guideCount", 5)
    bend_factor = params.get("bendFactor", 0.08)
    spool_radius = params.get("reelSpoolRadius", 0.055)

    # 1. Butt Cap and Ergonomic Contoured Grip
    add_cylinder("rod_butt_cap", (0, 0, -0.34), 0.024, 0.04, brass, root, vertices=6, bevel=0.005)
    add_limb_tube("rod_rear_grip", ((0, 0, -.32), (0, 0, -.15), (0, 0, .05)),
                  (.022, .026, .023), wood_honey, root, sides=6)
    add_cylinder("rod_check_rear", (0, 0, 0.055), 0.024, 0.008, brass, root, vertices=6)

    # 2. Reel Seat and Compression Locking Hoods
    add_cylinder("rod_reel_seat_body", (0, 0, 0.15), 0.020, 0.17, wood_dark, root, vertices=6)
    add_cylinder("rod_seat_hood_rear", (0, 0, 0.08), 0.023, 0.016, brass, root, vertices=6)
    add_cylinder("rod_seat_hood_front", (0, 0, 0.22), 0.023, 0.016, brass, root, vertices=6)
    add_cylinder("rod_seat_lock_ring", (0, 0, 0.235), 0.025, 0.008, brass, root, vertices=6)
    add_cylinder("rod_check_front", (0, 0, 0.25), 0.022, 0.008, brass, root, vertices=6)
    add_tapered_beam("rod_foregrip", (0, 0, 0.255), (0, 0, 0.36), 0.023, 0.018, wood_honey, root, vertices=6)
    # Authored anchors keep both hands and the live line independent from mesh bounds.
    add_grip_marker("rod_primary_grip", (0.024, 0, 0), root,
                    fingers=(0, 1, 0), contact_normal=(-1, 0, 0))
    add_grip_marker("rod_secondary_grip", (0.035, -0.095, 0.195), root,
                    fingers=(0, 0, -1), contact_normal=(-1, 0, 0))

    # 3. Classic Coastal Fly/Centerpin Reel
    reel_y = -0.095
    reel_z = 0.15
    add_beam("rod_reel_stem", (0, -0.02, reel_z), (0, -0.075, reel_z), 0.008, brass, root, vertices=4)
    add_box("rod_reel_foot", (0, -0.022, reel_z), (0.016, 0.008, 0.13), brass, root, bevel=0.002)
    add_cylinder(
        "rod_reel_frame",
        (0, reel_y, reel_z),
        spool_radius * 1.15,
        0.038,
        brass,
        root,
        vertices=8,
        rotation=(0, math.pi / 2, 0),
        bevel=0.003,
    )
    add_cylinder(
        "rod_reel_spool",
        (0, reel_y, reel_z),
        spool_radius * 0.90,
        0.030,
        wood_dark,
        root,
        vertices=8,
        rotation=(0, math.pi / 2, 0),
    )
    add_cylinder(
        "rod_reel_line_coil",
        (0, reel_y, reel_z),
        spool_radius * 0.78,
        0.026,
        foam,
        root,
        vertices=8,
        rotation=(0, math.pi / 2, 0),
    )
    add_box("rod_reel_crank_arm", (0.026, reel_y, reel_z + 0.022), (0.007, 0.012, 0.055), brass, root, bevel=0.002)
    add_cylinder(
        "rod_reel_handle_knob",
        (0.035, reel_y, reel_z + 0.045),
        0.010,
        0.018,
        wood_honey,
        root,
        vertices=6,
        rotation=(0, math.pi / 2, 0),
        bevel=0.002,
    )
    add_cylinder(
        "rod_reel_drag_dial",
        (-0.022, reel_y, reel_z),
        0.015,
        0.008,
        brass,
        root,
        vertices=5,
        rotation=(0, math.pi / 2, 0),
    )

    # 4. Multi-Stage Flexible Blank with Dynamic Casting Arc
    blank_base_z = 0.36
    blank_height = total_length - blank_base_z

    def blank_point(t: float) -> tuple[float, float, float]:
        z = blank_base_z + t * blank_height
        y = -(t ** 1.8) * bend_factor
        return (0.0, y, z)

    # Section 1: Butt section
    p0 = blank_point(0.0)
    p1 = blank_point(0.35)
    p2 = blank_point(0.70)
    p3 = blank_point(1.0)

    add_tapered_beam("rod_blank_section_1", p0, p1, 0.017, 0.012, wood_dark, root, vertices=6)
    add_cylinder("rod_ferrule_1", p1, 0.0135, 0.024, brass, root, vertices=6)
    add_tapered_beam("rod_blank_section_2", p1, p2, 0.012, 0.008, wood_dark, root, vertices=5)
    add_cylinder("rod_ferrule_2", p2, 0.0095, 0.020, brass, root, vertices=5)
    add_tapered_beam("rod_blank_section_3", p2, p3, 0.008, 0.004, wood_dark, root, vertices=5)

    # 5. Graduated Line Guides and Thread Whippings
    guide_t_values = [0.12 + (i / max(1, guide_count - 1)) * 0.88 for i in range(guide_count)]
    guide_centers = []

    for idx, gt in enumerate(guide_t_values):
        bp = blank_point(gt)
        guide_scale = 1.0 - gt * 0.58
        ring_r = 0.020 * guide_scale
        tube_r = 0.0028 * guide_scale
        guide_center = (bp[0], bp[1] - ring_r - 0.005, bp[2])
        guide_centers.append(guide_center)

        if idx < guide_count - 1:
            add_ring(
                f"rod_guide_ring_{idx:02d}",
                guide_center,
                ring_r,
                tube_r,
                brass,
                root,
                major_segments=6,
                minor_segments=3,
                rotation=(math.pi / 2, 0, 0),
            )
            add_beam(f"rod_guide_foot_{idx:02d}", bp, (bp[0], bp[1] - ring_r * 0.8, bp[2]), 0.003, brass, root, vertices=3)
            add_cylinder(f"rod_guide_wrap_{idx:02d}", bp, 0.014 * (1.0 - gt * 0.5) + 0.002, 0.018, terracotta, root, vertices=5)
        else:
            # Tip-Top Guide
            add_ring(
                "rod_guide_tiptop",
                guide_center,
                ring_r * 1.1,
                tube_r * 1.1,
                brass,
                root,
                major_segments=6,
                minor_segments=3,
                rotation=(math.pi / 2, 0, 0),
            )
            add_cylinder("rod_tiptop_sleeve", bp, 0.0055, 0.016, brass, root, vertices=4)

    add_marker("rod_line_exit", guide_centers[-1], root, marker_type="line_exit")

    # 6. Tensioned Fishing Line threaded through graduated guides to Tip-Top
    line_start = (0.0, reel_y, reel_z + spool_radius * 0.70)
    prev_pt = line_start
    for idx, g_pt in enumerate(guide_centers):
        add_beam(f"rod_line_segment_{idx:02d}", prev_pt, g_pt, 0.0018, foam, root, vertices=3)
        prev_pt = g_pt


def driftwood_cluster(spec: dict, root) -> None:
    params = spec["parameters"]
    rng = seeded_rng(spec["seed"])
    wood, pale = spec["palette"]
    for index in range(params["logCount"]):
        angle = params["angle"] + index * rng.uniform(0.42, 0.78)
        length = params["length"] * rng.uniform(0.62, 1.0)
        center_x = math.cos(angle + 1.2) * index * 0.16
        center_y = math.sin(angle + 1.2) * index * 0.13
        start = (
            center_x - math.cos(angle) * length * 0.5,
            center_y - math.sin(angle) * length * 0.5,
            0.08 + index * 0.025,
        )
        end = (
            center_x + math.cos(angle) * length * 0.5,
            center_y + math.sin(angle) * length * 0.5,
            0.11 + index * 0.035,
        )
        add_beam(
            f"driftwood_log_{index:02d}", start, end,
            params["radius"] * rng.uniform(0.72, 1.12),
            pale if index % 2 else wood, root, vertices=7,
        )
        branch_angle = angle + rng.uniform(0.72, 1.18)
        branch_start = (
            start[0] * 0.35 + end[0] * 0.65,
            start[1] * 0.35 + end[1] * 0.65,
            end[2],
        )
        branch_end = (
            branch_start[0] + math.cos(branch_angle) * length * 0.28,
            branch_start[1] + math.sin(branch_angle) * length * 0.28,
            branch_start[2] + length * 0.08,
        )
        add_beam(
            f"driftwood_branch_{index:02d}", branch_start, branch_end,
            params["radius"] * 0.48, pale, root, vertices=6,
        )
    consolidate_lod_level(root, f"{spec['id']}_cluster")
