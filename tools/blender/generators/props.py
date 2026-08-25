"""Farm and harbor prop generators."""

from __future__ import annotations

import math

from common.geometry import (
    add_beam,
    add_box,
    add_collision_primitives,
    add_cone,
    add_cylinder,
    add_ico,
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
    add_plank_field,
    add_rope_line,
    add_shingle_rows,
)
from common.lod import consolidate_lod_level

GOLDEN_ANGLE = 2.39996322972865332


def water_well(spec: dict, root) -> None:
    """Authored village octagonal stone well with timber gabled roof and bucket matching art-reference.png."""
    stone, wood, roof, metal = spec["palette"]
    radius = spec["parameters"].get("radius", 0.95)

    # 1. Smooth Faceted Octagonal Stone Well Basin
    basin_h = 0.85
    add_cylinder(
        "well_stone_basin",
        (0, 0, basin_h * 0.5),
        radius,
        basin_h,
        stone,
        root,
        vertices=8,
        bevel=0.04,
    )
    # Octagonal stone coping rim
    add_ring(
        "well_stone_coping",
        (0, 0, basin_h + 0.04),
        radius - 0.04,
        0.09,
        stone,
        root,
        major_segments=8,
        minor_segments=4,
    )
    # Interior water surface
    add_cylinder(
        "well_water_surface",
        (0, 0, 0.42),
        radius * 0.76,
        0.04,
        stone,
        root,
        vertices=8,
    )

    # 2. Sturdy Timber Uprights & Diagonal Braces
    post_x = radius * 0.75
    post_h = 2.15
    for p_idx, px in enumerate((-post_x, post_x)):
        add_box(
            f"well_post_{p_idx}",
            (px, 0, basin_h + post_h * 0.5 - 0.15),
            (0.18, 0.18, post_h),
            wood,
            root,
            bevel=0.025,
        )
        # Diagonal bracket brace to crossbeam
        sign = 1 if px < 0 else -1
        add_beam(
            f"well_post_brace_{p_idx}",
            (px, 0, basin_h + post_h - 0.65),
            (px + sign * 0.35, 0, basin_h + post_h - 0.15),
            0.045,
            wood,
            root,
            vertices=6,
        )

    # Top Crossbeam
    add_box(
        "well_crossbeam",
        (0, 0, basin_h + post_h - 0.12),
        (radius * 1.95, 0.18, 0.18),
        wood,
        root,
        bevel=0.02,
    )
    # Winding wooden axle & iron crank
    axle_z = basin_h + 0.85
    add_cylinder(
        "well_axle",
        (0, 0, axle_z),
        0.08,
        radius * 1.50,
        wood,
        root,
        vertices=8,
        rotation=(0, math.pi / 2, 0),
        bevel=0.012,
    )
    add_ring(
        "well_crank_handle",
        (post_x + 0.18, 0, axle_z),
        0.18,
        0.028,
        metal,
        root,
        major_segments=8,
        minor_segments=4,
        rotation=(0, math.pi / 2, 0),
    )

    # 3. Clean Gabled Terracotta/Wood Roof
    roof_w = radius * 2.20
    roof_d = radius * 1.85
    roof_base_z = basin_h + post_h - 0.05
    roof_pitch = math.radians(34)
    half_rw = roof_w * 0.5
    slope_len = half_rw / math.cos(roof_pitch)
    roof_rise = math.sin(roof_pitch) * slope_len

    # Left and right roof tile slabs
    add_box(
        "well_roof_left",
        (-half_rw * 0.5, 0, roof_base_z + roof_rise * 0.5),
        (slope_len, roof_d, 0.12),
        roof,
        root,
        rotation=(0, -roof_pitch, 0),
        bevel=0.02,
    )
    add_box(
        "well_roof_right",
        (half_rw * 0.5, 0, roof_base_z + roof_rise * 0.5),
        (slope_len, roof_d, 0.12),
        roof,
        root,
        rotation=(0, roof_pitch, 0),
        bevel=0.02,
    )
    # Ridge cap
    add_box(
        "well_roof_ridge",
        (0, 0, roof_base_z + roof_rise + 0.04),
        (0.16, roof_d + 0.08, 0.14),
        wood,
        root,
        bevel=0.015,
    )
    # Gable end triangles
    add_tri_prism(
        "well_gable_front",
        (0, -roof_d * 0.5 + 0.02, roof_base_z + roof_rise * 0.5),
        (roof_w - 0.15, 0.10, roof_rise * 0.98),
        wood,
        root,
    )
    add_tri_prism(
        "well_gable_back",
        (0, roof_d * 0.5 - 0.02, roof_base_z + roof_rise * 0.5),
        (roof_w - 0.15, 0.10, roof_rise * 0.98),
        wood,
        root,
    )

    # 4. Hanging Bucket & Rope
    rope_points = [(0, 0, axle_z), (0.05, 0, axle_z - 0.45), (0.05, 0, basin_h + 0.38)]
    add_rope_line("well_bucket_rope", rope_points, 0.022, metal, root, vertices=6)
    add_cylinder(
        "well_bucket",
        (0.05, 0, basin_h + 0.16),
        0.18,
        0.28,
        wood,
        root,
        vertices=8,
        bevel=0.015,
    )
    add_ring(
        "well_bucket_handle",
        (0.05, 0, basin_h + 0.32),
        0.16,
        0.018,
        metal,
        root,
        major_segments=8,
        minor_segments=4,
        rotation=(math.pi / 2, 0, 0),
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
    add_collision_primitives(spec, root)


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
    add_collision_primitives(spec, root)


def hay_bale(spec: dict, root) -> None:
    hay, twine = spec["palette"]
    length = spec["parameters"]["length"]
    radius = spec["parameters"]["radius"]
    add_cylinder("hay_bale_body", (0, 0, radius), radius, length, hay, root, vertices=12, rotation=(math.pi / 2, 0, 0), bevel=0.02)
    bands = spec["parameters"]["bands"]
    band_positions = (
        (0.0,) if bands == 1 else
        tuple(-length * 0.28 + index * length * 0.56 / (bands - 1) for index in range(bands))
    )
    for index, x in enumerate(band_positions):
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
    """Build a 4-wheeled timber farm wagon with stacked grain sacks."""
    params = spec["parameters"]
    honey, dark, sack_token, rope_token = spec["palette"]
    length, width, height = params.get("length", 2.6), params.get("width", 1.4), params.get("height", 1.2)
    wheel_radius = 0.42
    front_wheel_radius = 0.36

    # Chassis longitudinal beams
    for side in (-width * 0.36, width * 0.36):
        add_box(f"wagon_chassis_{'l' if side < 0 else 'r'}", (side, 0, 0.46), (0.12, length, 0.14), dark, root, bevel=0.02)
    # Axles
    add_cylinder("wagon_axle_rear", (0, length * 0.35, wheel_radius), 0.06, width + 0.38, dark, root, vertices=8, rotation=(0, math.pi / 2, 0))
    add_cylinder("wagon_axle_front", (0, -length * 0.35, front_wheel_radius), 0.06, width + 0.38, dark, root, vertices=8, rotation=(0, math.pi / 2, 0))

    # 4 Spoked Wheels
    for side, sign in (("rear_left", -1), ("rear_right", 1)):
        x = sign * (width * 0.5 + 0.12)
        add_ring(f"wagon_wheel_rim_{side}", (x, length * 0.35, wheel_radius), wheel_radius, 0.045, dark, root, major_segments=12, minor_segments=6, rotation=(0, math.pi / 2, 0))
        add_cylinder(f"wagon_wheel_hub_{side}", (x, length * 0.35, wheel_radius), 0.10, 0.18, dark, root, vertices=8, rotation=(0, math.pi / 2, 0), bevel=0.015)
        for spoke in range(6):
            spoke_angle = spoke * math.pi / 3
            add_beam(f"wagon_spoke_{side}_{spoke}", (x, length * 0.35, wheel_radius), (x, length * 0.35 + math.cos(spoke_angle) * (wheel_radius - 0.03), wheel_radius + math.sin(spoke_angle) * (wheel_radius - 0.03)), 0.022, honey, root, vertices=5)

    for side, sign in (("front_left", -1), ("front_right", 1)):
        x = sign * (width * 0.5 + 0.12)
        add_ring(f"wagon_wheel_rim_{side}", (x, -length * 0.35, front_wheel_radius), front_wheel_radius, 0.045, dark, root, major_segments=12, minor_segments=6, rotation=(0, math.pi / 2, 0))
        add_cylinder(f"wagon_wheel_hub_{side}", (x, -length * 0.35, front_wheel_radius), 0.09, 0.18, dark, root, vertices=8, rotation=(0, math.pi / 2, 0), bevel=0.015)
        for spoke in range(6):
            spoke_angle = spoke * math.pi / 3
            add_beam(f"wagon_spoke_{side}_{spoke}", (x, -length * 0.35, front_wheel_radius), (x, -length * 0.35 + math.cos(spoke_angle) * (front_wheel_radius - 0.03), front_wheel_radius + math.sin(spoke_angle) * (front_wheel_radius - 0.03)), 0.022, honey, root, vertices=5)

    # Wagon Bed Deck & Slat Side Stakes
    bed_z = 0.54
    add_plank_field("wagon_bed_plank", (0, 0, bed_z), width, length, 0.08, (honey, dark), root, count=12, axis="y", bevel=0.012)
    # Side stakes
    for side, side_x in (("left", -width * 0.48), ("right", width * 0.48)):
        for stake in range(5):
            y = -length * 0.44 + stake * length * 0.88 / 4
            add_box(f"wagon_stake_{side}_{stake}", (side_x, y, bed_z + 0.32), (0.07, 0.07, 0.60), dark, root, bevel=0.0)
        for rail in (bed_z + 0.22, bed_z + 0.52):
            add_box(f"wagon_side_rail_{side}_{int(rail * 100)}", (side_x, 0, rail), (0.05, length * 0.94, 0.09), honey, root, bevel=0.0)

    # Front Pulling Tongue / Harness Beam
    add_beam("wagon_tongue", (0, -length * 0.48, 0.42), (0, -length * 0.95, 0.32), 0.065, dark, root, vertices=6)

    # Stacked Burlap Cargo Sacks
    sack_positions = [
        (-0.24, -0.65, bed_z + 0.02, 0.08),
        (0.24, -0.65, bed_z + 0.02, -0.06),
        (-0.24, -0.05, bed_z + 0.02, -0.04),
        (0.24, -0.05, bed_z + 0.02, 0.07),
        (-0.24, 0.55, bed_z + 0.02, 0.05),
        (0.24, 0.55, bed_z + 0.02, -0.08),
        (0.0, -0.35, bed_z + 0.34, 0.12),
        (0.0, 0.25, bed_z + 0.34, -0.10),
    ]
    for s_idx, (sx, sy, sz, syaw) in enumerate(sack_positions):
        add_burlap_sack(f"wagon_sack_{s_idx:02d}", (sx, sy, sz), (0.52, 0.44, 0.36), sack_token, rope_token, root, rotation=(0, 0, syaw))

    # Tie-down rope across sacks
    add_catenary_rope("wagon_tie_rope_01", (-width * 0.48, -0.35, bed_z + 0.56), (width * 0.48, -0.35, bed_z + 0.56), 0.08, 0.018, rope_token, root)
    add_catenary_rope("wagon_tie_rope_02", (-width * 0.48, 0.25, bed_z + 0.56), (width * 0.48, 0.25, bed_z + 0.56), 0.08, 0.018, rope_token, root)
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
    """A sturdy, readable farm workbench with an open working face."""
    wood, dark, metal, canvas = spec["palette"]
    width = spec["parameters"]["width"]
    depth = spec["parameters"]["depth"]
    top_height = spec["parameters"]["topHeight"]
    top_thickness = 0.16
    leg_x = width * 0.40
    leg_y = depth * 0.34
    for index, (x, y) in enumerate(((-leg_x, -leg_y), (leg_x, -leg_y), (-leg_x, leg_y), (leg_x, leg_y))):
        add_box(
            f"workbench_leg_{index}",
            (x, y, top_height * 0.48),
            (0.16, 0.16, top_height * 0.96),
            dark,
            root,
            bevel=0.022,
        )
    # Solid uniform top worktable surface
    add_box(
        "workbench_top_surface",
        (0, 0, top_height),
        (width, depth, top_thickness),
        wood,
        root,
        bevel=0.018,
    )
    add_box("workbench_lower_shelf", (0, 0.05, top_height * 0.33), (width * 0.78, depth * 0.76, 0.10), wood, root, bevel=0.015)
    add_beam("workbench_front_brace", (-leg_x, -leg_y, top_height * 0.34), (leg_x, -leg_y, top_height * 0.62), 0.045, dark, root, vertices=6)
    add_box("workbench_backboard", (0, depth * 0.44, top_height + 0.42), (width * 0.88, 0.10, 0.74), dark, root, bevel=0.018)
    for index, x in enumerate((-width * 0.27, 0, width * 0.27)):
        add_box(f"workbench_tool_rail_{index}", (x, depth * 0.37, top_height + 0.43), (0.035, 0.08, 0.46), metal, root, bevel=0.008)
        add_ico(f"workbench_tool_handle_{index}", (x, depth * 0.30, top_height + 0.24), (0.055, 0.045, 0.09), canvas, root, subdivisions=1)
    add_box("workbench_vise_jaw", (width * 0.34, -depth * 0.50, top_height + 0.05), (0.34, 0.12, 0.22), metal, root, bevel=0.018)
    add_cylinder("workbench_vise_handle", (width * 0.34, -depth * 0.62, top_height - 0.04), 0.025, 0.42, metal, root, vertices=6, rotation=(0, math.pi / 2, 0))
    add_fasteners(
        "workbench_top_fastener",
        (
            (-width * 0.38, -depth * 0.36, top_height + top_thickness * 0.52),
            (width * 0.38, -depth * 0.36, top_height + top_thickness * 0.52),
            (-width * 0.38, depth * 0.36, top_height + top_thickness * 0.52),
            (width * 0.38, depth * 0.36, top_height + top_thickness * 0.52),
        ),
        0.018,
        metal,
        root,
        depth=0.07,
    )
    add_collision_primitives(spec, root)


def produce_stall(spec: dict, root) -> None:
    """An unmistakable open produce stall with canopy, counter and seed display."""
    wood, dark, canvas, produce, sign = spec["palette"]
    width = spec["parameters"]["width"]
    depth = spec["parameters"]["depth"]
    roof_height = spec["parameters"]["roofHeight"]
    post_x = width * 0.43
    post_y = depth * 0.36
    for index, (x, y) in enumerate(((-post_x, -post_y), (post_x, -post_y), (-post_x, post_y), (post_x, post_y))):
        add_box(f"produce_stall_post_{index}", (x, y, roof_height * 0.48), (0.16, 0.16, roof_height * 0.96), dark, root, bevel=0.025)
    add_box("produce_stall_counter", (0, -depth * 0.31, 0.92), (width * 0.94, depth * 0.38, 0.18), wood, root, bevel=0.025)
    # Solid uniform wooden counter front
    add_box(
        "produce_stall_front_face",
        (0, -depth * 0.40, 0.50),
        (width * 0.90, 0.10, 0.62),
        wood,
        root,
        bevel=0.014,
    )
    add_tri_prism(
        "produce_stall_canopy",
        (0, 0, roof_height),
        (width * 1.05, depth * 1.05, 0.55),
        canvas,
        root,
        rotation=(0, 0, 0),
    )
    for index in range(4):
        x = -width * 0.36 + index * width * 0.24
        add_box(f"produce_stall_canopy_stripe_{index}", (x, -depth * 0.56, roof_height - 0.06), (width * 0.13, 0.06, 0.48), sign, root, rotation=(math.radians(-22), 0, 0), bevel=0.008)
    for index, x in enumerate((-width * 0.28, 0, width * 0.28)):
        add_box(f"produce_stall_seed_bin_{index}", (x, -depth * 0.46, 1.12), (width * 0.22, depth * 0.22, 0.22), wood, root, bevel=0.018)
        for seed_index in range(4):
            add_ico(
                f"produce_stall_display_{index}_{seed_index}",
                (x + (seed_index % 2 - 0.5) * 0.12, -depth * 0.48, 1.25 + (seed_index // 2) * 0.06),
                (0.075, 0.065, 0.07),
                produce if index != 1 else sign,
                root,
                subdivisions=1,
            )
    add_box("produce_stall_sign", (0, -depth * 0.49, roof_height - 0.52), (width * 0.48, 0.08, 0.34), sign, root, bevel=0.025)
    add_fasteners(
        "produce_stall_sign_fastener",
        ((-width * 0.18, -depth * 0.54, roof_height - 0.52), (width * 0.18, -depth * 0.54, roof_height - 0.52)),
        0.022,
        dark,
        root,
        depth=0.06,
    )
    add_collision_primitives(spec, root)


def seed_pouch(spec: dict, root) -> None:
    burlap, tie = spec["palette"]
    add_burlap_sack("seed_pouch", (0, 0, 0.22), (0.36, 0.18, 0.44), burlap, tie, root, rotation=(0.08, 0.0, -0.10))
    add_catenary_rope("seed_pouch_loop", (-0.13, 0, 0.40), (0.13, 0, 0.40), 0.10, 0.018, tie, root, segments=5, vertices=5)


def watering_can(spec: dict, root) -> None:
    metal, dark, accent = spec["palette"]
    add_cylinder("watering_can_body", (0, 0, 0.13), 0.13, 0.24, metal, root, vertices=10, bevel=0.015)
    add_ring("watering_can_handle", (0, 0, 0.25), 0.15, 0.020, dark, root, major_segments=10, minor_segments=4, rotation=(math.pi / 2, 0, 0))
    add_cone("watering_can_spout", (0.22, 0, 0.17), 0.06, 0.03, 0.32, metal, root, vertices=8, rotation=(0, math.pi / 2, 0))
    add_cylinder("watering_can_rose", (0.38, 0, 0.17), 0.07, 0.055, accent, root, vertices=10, rotation=(0, math.pi / 2, 0), bevel=0.007)


def sickle(spec: dict, root) -> None:
    wood, metal = spec["palette"]
    add_tapered_beam("sickle_handle", (0, 0, 0), (0, 0, 0.52), 0.055, 0.042, wood, root, vertices=7)
    curve_points = [
        (0, 0, 0.50),
        (0.18, 0, 0.64),
        (0.38, 0, 0.66),
        (0.54, 0, 0.56),
        (0.61, 0, 0.40),
    ]
    for index in range(len(curve_points) - 1):
        add_tapered_beam(
            f"sickle_blade_{index}",
            curve_points[index],
            curve_points[index + 1],
            0.040 - index * 0.006,
            0.033 - index * 0.006,
            metal,
            root,
            vertices=4,
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
    wood, metal = spec["palette"]
    add_tapered_beam("workstation_scoop_handle", (0, 0, 0), (0, 0, 0.58), 0.045, 0.032, wood, root, vertices=7)
    add_box("workstation_scoop_bowl", (0, 0, 0.70), (0.28, 0.11, 0.26), metal, root, rotation=(0.18, 0, 0), bevel=0.045)


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
    add_tapered_beam("rod_rear_grip_lower", (0, 0, -0.32), (0, 0, -0.15), 0.022, 0.026, wood_honey, root, vertices=6)
    add_tapered_beam("rod_rear_grip_upper", (0, 0, -0.15), (0, 0, 0.05), 0.026, 0.023, wood_honey, root, vertices=6)
    add_cylinder("rod_check_rear", (0, 0, 0.055), 0.024, 0.008, brass, root, vertices=6)

    # 2. Reel Seat and Compression Locking Hoods
    add_cylinder("rod_reel_seat_body", (0, 0, 0.15), 0.020, 0.17, wood_dark, root, vertices=6)
    add_cylinder("rod_seat_hood_rear", (0, 0, 0.08), 0.023, 0.016, brass, root, vertices=6)
    add_cylinder("rod_seat_hood_front", (0, 0, 0.22), 0.023, 0.016, brass, root, vertices=6)
    add_cylinder("rod_seat_lock_ring", (0, 0, 0.235), 0.025, 0.008, brass, root, vertices=6)
    add_cylinder("rod_check_front", (0, 0, 0.25), 0.022, 0.008, brass, root, vertices=6)
    add_tapered_beam("rod_foregrip", (0, 0, 0.255), (0, 0, 0.36), 0.023, 0.018, wood_honey, root, vertices=6)

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
