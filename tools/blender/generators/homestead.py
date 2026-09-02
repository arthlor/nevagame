"""Farmstead prop generators: apiary, potting bench, tools, and soil tiles.

Every builder here is authored so the silhouette reads as a working object:
loads sit on supports, tools balance on their heads, and soil beds keep their
frame above the fill. Palette order is fixed by the catalog entry.
"""

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
    add_tri_prism,
    seeded_rng,
)
from common.authored import add_plank_field, add_rope_line


def apiary_hive(spec: dict, root) -> None:
    """Stacked Langstroth supers on a hive stand with a landing board and gable roof."""
    body, frame, roof, metal = spec["palette"]
    rng = seeded_rng(spec["seed"])
    width, depth = 0.42, 0.40

    stand_h = 0.10
    for index, (sx, sy) in enumerate((
        (-width * 0.42, -depth * 0.40), (width * 0.42, -depth * 0.40),
        (-width * 0.42, depth * 0.40), (width * 0.42, depth * 0.40),
    )):
        add_box(f"hive_stand_leg_{index}", (sx, sy, stand_h * 0.5), (0.06, 0.06, stand_h), frame, root, bevel=0.0)

    # Bottom board overhangs to the front so the landing ramp has something to sit on.
    board_z = stand_h + 0.025
    add_box("hive_bottom_board", (0, 0.02, board_z), (width + 0.06, depth + 0.10, 0.05), frame, root, bevel=0.012)
    add_box(
        "hive_landing_board", (0, -depth * 0.5 - 0.11, board_z + 0.004),
        (width * 0.72, 0.20, 0.028), frame, root, rotation=(math.radians(-9), 0, 0), bevel=0.008,
    )
    # Entrance reducer slot, dark so the hive mouth reads at a distance.
    add_box("hive_entrance", (0, -depth * 0.5 + 0.01, board_z + 0.042), (width * 0.52, 0.05, 0.030), metal, root, bevel=0.0)

    super_h = 0.195
    base_z = board_z + 0.025
    for index in range(3):
        z = base_z + super_h * index
        add_box(f"hive_super_{index}", (0, 0, z + super_h * 0.5), (width, depth, super_h), body, root, bevel=0.010)
        # Routed hand-hold on both long sides: the detail that makes it a beehive, not a crate.
        for side_index, sign in enumerate((-1, 1)):
            add_box(
                f"hive_handhold_{index}_{side_index}",
                (sign * (width * 0.5 - 0.008), 0, z + super_h * 0.62),
                (0.022, depth * 0.56, 0.036), frame, root, bevel=0.0,
            )
        # Frame rebate lip reads as the joint between boxes.
        add_box(f"hive_rebate_{index}", (0, 0, z + 0.008), (width + 0.022, depth + 0.022, 0.016), frame, root, bevel=0.006)

    lid_z = base_z + super_h * 3
    add_box("hive_inner_cover", (0, 0, lid_z + 0.02), (width + 0.03, depth + 0.03, 0.04), frame, root, bevel=0.008)
    for side_index, sign in enumerate((-1, 1)):
        add_box(
            f"hive_roof_slope_{side_index}",
            (sign * width * 0.27, 0, lid_z + 0.105),
            (width * 0.62, depth + 0.08, 0.035), roof, root,
            rotation=(0, sign * math.radians(-19), 0), bevel=0.010,
        )
    add_box("hive_roof_ridge", (0, 0, lid_z + 0.145), (0.07, depth + 0.09, 0.045), metal, root, bevel=0.010)
    add_box("hive_roof_band", (0, 0, lid_z + 0.055), (width + 0.10, depth + 0.10, 0.030), metal, root, bevel=0.008)

    # A weighting stone keeps the telescoping lid on in wind.
    add_ico("hive_lid_stone", (rng.uniform(-0.05, 0.05), 0.06, lid_z + 0.185), (0.055, 0.048, 0.032), frame, root)


def potting_bench(spec: dict, root) -> None:
    """Slatted work surface with a soil trough, lower shelf, and a backsplash rail."""
    wood, dark, soil, foliage = spec["palette"]
    rng = seeded_rng(spec["seed"])
    width, depth, top_h = 1.44, 0.56, 0.84

    for index, (sx, sy) in enumerate((
        (-width * 0.46, -depth * 0.38), (width * 0.46, -depth * 0.38),
        (-width * 0.46, depth * 0.38), (width * 0.46, depth * 0.38),
    )):
        add_box(f"bench_leg_{index}", (sx, sy, top_h * 0.5), (0.075, 0.075, top_h), dark, root, bevel=0.012)

    # Lower shelf carries the weight that would otherwise rack the legs.
    add_plank_field(
        "bench_shelf_plank", (0, 0, 0.26), width - 0.10, depth - 0.10, 0.030,
        (wood, dark), root, count=4, axis="y", seed=spec["seed"] + 3, bevel=0.008,
    )
    for index, sy in enumerate((-depth * 0.38, depth * 0.38)):
        add_box(f"bench_shelf_rail_{index}", (0, sy, 0.235), (width - 0.05, 0.055, 0.055), dark, root, bevel=0.010)
        add_box(f"bench_apron_{index}", (0, sy, top_h - 0.10), (width - 0.05, 0.05, 0.09), dark, root, bevel=0.010)

    # Work surface: front half is solid boards, back third is an open soil trough.
    add_plank_field(
        "bench_top_plank", (0, -depth * 0.22, top_h + 0.02), width, depth * 0.52, 0.036,
        (wood, dark), root, count=6, axis="x", seed=spec["seed"] + 11, bevel=0.008,
    )
    trough_y = depth * 0.28
    add_box("bench_trough_floor", (0, trough_y, top_h - 0.045), (width * 0.92, depth * 0.40, 0.030), dark, root, bevel=0.008)
    add_box("bench_trough_back", (0, trough_y + depth * 0.20, top_h + 0.02), (width * 0.92, 0.035, 0.16), dark, root, bevel=0.008)
    add_box("bench_trough_lip", (0, trough_y - depth * 0.20, top_h + 0.01), (width * 0.92, 0.035, 0.13), wood, root, bevel=0.008)
    add_box("bench_trough_soil", (0, trough_y, top_h - 0.015), (width * 0.86, depth * 0.36, 0.045), soil, root, bevel=0.0)
    for index in range(5):
        add_ico(
            f"bench_soil_clod_{index}",
            (-width * 0.34 + index * width * 0.17 + rng.uniform(-0.02, 0.02), trough_y + rng.uniform(-0.06, 0.06), top_h + 0.012),
            (0.045, 0.040, 0.022), soil, root, rotation=(0, 0, rng.uniform(0, math.pi)),
        )

    # Backsplash with a hanging rail: the reason the bench faces one way.
    for index, sx in enumerate((-width * 0.46, width * 0.46)):
        add_box(f"bench_back_post_{index}", (sx, depth * 0.46, top_h + 0.17), (0.06, 0.06, 0.34), dark, root, bevel=0.010)
    add_box("bench_back_rail", (0, depth * 0.46, top_h + 0.30), (width - 0.02, 0.05, 0.07), dark, root, bevel=0.010)
    add_box("bench_back_panel", (0, depth * 0.48, top_h + 0.14), (width - 0.10, 0.028, 0.22), wood, root, bevel=0.006)

    # Two seedling pots on the boards, so scale reads instantly.
    for index, px in enumerate((-width * 0.30, -width * 0.10)):
        add_cone(f"bench_pot_{index}", (px, -depth * 0.22, top_h + 0.10), 0.055, 0.070, 0.12, soil, root, vertices=8)
        add_cone(f"bench_sprout_{index}", (px, -depth * 0.22, top_h + 0.20), 0.055, 0.010, 0.10, foliage, root, vertices=6)


def rustic_watering_can(spec: dict, root) -> None:
    """Galvanised body with a braced rose spout, strap handle, and carry grip."""
    metal, brass, wood = spec["palette"]
    body_r, body_h = 0.085, 0.22
    base_z = 0.015

    add_cylinder("can_body", (0, 0, base_z + body_h * 0.5), body_r, body_h, metal, root, vertices=10, bevel=0.008)
    add_cylinder("can_base_rim", (0, 0, base_z + 0.012), body_r + 0.010, 0.024, brass, root, vertices=10, bevel=0.006)
    add_cylinder("can_shoulder", (0, 0, base_z + body_h - 0.012), body_r + 0.008, 0.024, brass, root, vertices=10, bevel=0.006)
    add_cylinder("can_neck", (0, -0.012, base_z + body_h + 0.045), body_r * 0.52, 0.075, metal, root, vertices=8, bevel=0.006)
    add_ring("can_neck_lip", (0, -0.012, base_z + body_h + 0.082), body_r * 0.52, 0.010, brass, root, major_segments=8, minor_segments=4)

    # The spout rises from the base so water can reach the rose: physically right.
    spout_start = (0, 0.06, base_z + 0.045)
    spout_end = (0, 0.215, base_z + body_h + 0.020)
    add_beam("can_spout", spout_start, spout_end, 0.020, metal, root, vertices=8)
    add_cone("can_rose", (0, 0.225, base_z + body_h + 0.035), 0.024, 0.046, 0.045, brass, root, vertices=10,
             rotation=(math.radians(-64), 0, 0))
    add_beam("can_spout_brace", (0, 0.055, base_z + body_h - 0.02), (0, 0.150, base_z + body_h + 0.005), 0.009, metal, root, vertices=6)

    # Rear strap handle, plus the top carry bar every real can has.
    add_beam("can_handle_lower", (0, -body_r - 0.005, base_z + 0.055), (0, -body_r - 0.075, base_z + 0.130), 0.012, metal, root, vertices=6)
    add_beam("can_handle_back", (0, -body_r - 0.075, base_z + 0.130), (0, -body_r - 0.062, base_z + body_h + 0.010), 0.012, metal, root, vertices=6)
    add_beam("can_handle_upper", (0, -body_r - 0.062, base_z + body_h + 0.010), (0, -body_r * 0.35, base_z + body_h + 0.012), 0.012, metal, root, vertices=6)
    add_beam("can_carry_bar", (-body_r * 0.72, -0.030, base_z + body_h + 0.070), (body_r * 0.72, -0.030, base_z + body_h + 0.070), 0.010, metal, root, vertices=6)
    add_cylinder("can_carry_grip", (0, -0.030, base_z + body_h + 0.070), 0.017, 0.070, wood, root, vertices=8,
                 rotation=(0, math.radians(90), 0), bevel=0.005)


def garden_hoe(spec: dict, root) -> None:
    """Leaning draw hoe: shaft, forged neck, blade, and a leather hang loop."""
    wood, metal, leather = spec["palette"]
    lean = math.radians(9.0)
    shaft_len = 1.42
    top = (math.sin(lean) * shaft_len, 0.0, math.cos(lean) * shaft_len)

    add_beam("hoe_shaft", (0.012, 0.0, 0.055), top, 0.019, wood, root, vertices=8)
    add_cylinder("hoe_grip", (top[0] * 0.93, 0, top[2] * 0.93), 0.024, 0.13, wood, root, vertices=8,
                 rotation=(0, lean, 0), bevel=0.006)
    add_ring("hoe_hang_loop", (top[0] * 0.995, 0, top[2] * 0.995 + 0.030), 0.026, 0.007, leather, root,
             major_segments=8, minor_segments=4, rotation=(math.radians(90), 0, 0))

    # Ferrule, swan neck, then the blade set at a working angle to the shaft.
    add_cylinder("hoe_ferrule", (0.010, 0, 0.145), 0.026, 0.085, metal, root, vertices=8, bevel=0.006)
    add_beam("hoe_neck", (0.008, 0, 0.115), (-0.052, 0, 0.052), 0.015, metal, root, vertices=6)
    add_box("hoe_blade", (-0.105, 0, 0.028), (0.135, 0.175, 0.020), metal, root,
            rotation=(0, math.radians(22), 0), bevel=0.006)
    add_box("hoe_blade_edge", (-0.160, 0, 0.014), (0.040, 0.175, 0.010), metal, root,
            rotation=(0, math.radians(22), 0), bevel=0.004)


def wheelbarrow(spec: dict, root) -> None:
    """Tapered tray on two legs and one forked wheel: the real three-point stance."""
    wood, dark, metal, brass = spec["palette"]
    tray_len, tray_w = 0.86, 0.50
    tray_z = 0.42

    # Two side rails run the full length and become the handles at the back.
    for index, sign in enumerate((-1, 1)):
        add_beam(
            f"barrow_rail_{index}",
            (sign * tray_w * 0.46, -0.62, 0.30), (sign * tray_w * 0.34, 0.60, 0.53),
            0.030, wood, root, vertices=8,
        )
        add_cylinder(
            f"barrow_grip_{index}", (sign * tray_w * 0.345, 0.545, 0.517), 0.035, 0.15, dark, root,
            vertices=8, rotation=(math.radians(80), 0, 0), bevel=0.008,
        )
        # Both legs: a wheelbarrow parks on two, not one.
        add_box(
            f"barrow_leg_{index}", (sign * tray_w * 0.40, 0.31, 0.135), (0.055, 0.055, 0.27), dark, root,
            rotation=(0, sign * math.radians(-5), 0), bevel=0.008,
        )
        add_box(f"barrow_foot_{index}", (sign * tray_w * 0.40, 0.31, 0.018), (0.085, 0.13, 0.036), dark, root, bevel=0.008)
        add_beam(
            f"barrow_leg_brace_{index}",
            (sign * tray_w * 0.40, 0.29, 0.24), (sign * tray_w * 0.42, 0.05, 0.36),
            0.016, dark, root, vertices=6,
        )

    add_box("barrow_tray_floor", (0, 0.0, tray_z - 0.075), (tray_w * 0.86, tray_len, 0.032), wood, root,
            rotation=(math.radians(-7), 0, 0), bevel=0.010)
    for index, sign in enumerate((-1, 1)):
        add_box(
            f"barrow_tray_side_{index}", (sign * tray_w * 0.45, 0.0, tray_z + 0.010),
            (0.030, tray_len, 0.20), wood, root, rotation=(math.radians(-7), sign * math.radians(11), 0), bevel=0.010,
        )
    add_box("barrow_tray_back", (0, tray_len * 0.5 - 0.02, tray_z + 0.030), (tray_w * 0.90, 0.030, 0.20), wood, root,
            rotation=(math.radians(-10), 0, 0), bevel=0.010)
    add_box("barrow_tray_front", (0, -tray_len * 0.5 + 0.02, tray_z - 0.075), (tray_w * 0.80, 0.030, 0.15), wood, root,
            rotation=(math.radians(12), 0, 0), bevel=0.010)
    # Iron edging caps the rim of the tray; it must not close over the opening.
    for index, sign in enumerate((-1, 1)):
        add_box(
            f"barrow_tray_edge_{index}", (sign * tray_w * 0.45, 0.0, tray_z + 0.105),
            (0.048, tray_len, 0.022), metal, root,
            rotation=(math.radians(-7), sign * math.radians(11), 0), bevel=0.005,
        )
    add_box("barrow_tray_edge_back", (0, tray_len * 0.5 - 0.02, tray_z + 0.128), (tray_w * 0.92, 0.048, 0.022), metal, root,
            rotation=(math.radians(-10), 0, 0), bevel=0.005)

    # Wheel captured between two fork cheeks on a real axle.
    axle_y = -0.535
    axle_z = 0.175
    for index, sign in enumerate((-1, 1)):
        add_box(
            f"barrow_fork_{index}", (sign * 0.085, axle_y + 0.03, axle_z + 0.075), (0.022, 0.115, 0.165), metal, root,
            rotation=(math.radians(16), 0, 0), bevel=0.005,
        )
    add_cylinder("barrow_axle", (0, axle_y, axle_z), 0.016, 0.20, brass, root, vertices=6,
                 rotation=(0, math.radians(90), 0))
    add_cylinder("barrow_wheel_tyre", (0, axle_y, axle_z), 0.168, 0.075, dark, root, vertices=12,
                 rotation=(0, math.radians(90), 0), bevel=0.010)
    add_cylinder("barrow_wheel_rim", (0, axle_y, axle_z), 0.128, 0.082, wood, root, vertices=12,
                 rotation=(0, math.radians(90), 0))
    add_cylinder("barrow_wheel_hub", (0, axle_y, axle_z), 0.046, 0.095, brass, root, vertices=8,
                 rotation=(0, math.radians(90), 0), bevel=0.006)
    for index in range(4):
        angle = index * math.pi / 4
        add_box(
            f"barrow_spoke_{index}", (0, axle_y, axle_z), (0.022, 0.240, 0.022), wood, root,
            rotation=(angle, 0, 0), bevel=0.0,
        )


def water_trough(spec: dict, root) -> None:
    """Hewn plank trough on stone-cut feet, half full, with an iron strap girdle."""
    wood, dark, water, metal = spec["palette"]
    rng = seeded_rng(spec["seed"])
    length, width, wall_h = 1.52, 0.54, 0.42

    for index, sx in enumerate((-length * 0.36, length * 0.36)):
        add_box(f"trough_foot_{index}", (sx, 0, 0.045), (0.16, width + 0.04, 0.09), dark, root, bevel=0.012)

    floor_z = 0.11
    add_box("trough_floor", (0, 0, floor_z), (length, width, 0.06), dark, root, bevel=0.012)
    for index, sign in enumerate((-1, 1)):
        add_box(f"trough_side_{index}", (0, sign * (width * 0.5 - 0.03), floor_z + wall_h * 0.5),
                (length, 0.06, wall_h), wood, root, bevel=0.012)
        add_box(f"trough_end_{index}", (sign * (length * 0.5 - 0.03), 0, floor_z + wall_h * 0.5),
                (0.06, width, wall_h), wood, root, bevel=0.012)
        # Iron strap girdles: what stops a plank trough from splitting open.
        add_box(f"trough_strap_{index}", (sign * length * 0.28, 0, floor_z + wall_h * 0.52),
                (0.045, width + 0.03, wall_h * 0.86), metal, root, bevel=0.006)
    add_box("trough_rim", (0, 0, floor_z + wall_h + 0.02), (length + 0.05, width + 0.05, 0.045), wood, root, bevel=0.012)

    # Water sits below the rim with a rippled surface, not flush to the top.
    add_box("trough_water", (0, 0, floor_z + wall_h * 0.62), (length - 0.11, width - 0.11, 0.028), water, root, bevel=0.0)
    for index in range(3):
        add_box(
            f"trough_ripple_{index}",
            (-length * 0.26 + index * length * 0.26, rng.uniform(-0.08, 0.08), floor_z + wall_h * 0.62 + 0.016),
            (0.20, 0.10, 0.010), water, root, rotation=(0, 0, rng.uniform(-0.35, 0.35)), bevel=0.0,
        )


def firewood_stack(spec: dict, root) -> None:
    """Split rounds cross-stacked between end braces under a weighted tarp."""
    warm, dark, weathered, canvas = spec["palette"]
    rng = seeded_rng(spec["seed"])
    length, height = 1.90, 0.92
    log_r, log_len = 0.072, 0.80

    # Ground runners keep the bottom course out of the wet.
    for index, sy in enumerate((-0.30, 0.30)):
        add_box(f"woodpile_runner_{index}", (0, sy, 0.035), (length, 0.10, 0.07), dark, root, bevel=0.010)
    # End braces: the vertical stakes that stop a rick from spilling sideways.
    for index, sx in enumerate((-length * 0.5 + 0.05, length * 0.5 - 0.05)):
        for jindex, sy in enumerate((-0.36, 0.36)):
            add_box(f"woodpile_stake_{index}_{jindex}", (sx, sy, height * 0.5), (0.055, 0.055, height), weathered, root, bevel=0.008)

    tokens = (warm, dark, weathered)
    rows = 5
    row_h = (height - 0.09) / rows
    for row in range(rows):
        z = 0.09 + row_h * (row + 0.5)
        columns = 11 if row % 2 == 0 else 10
        for column in range(columns):
            x = -length * 0.44 + (length * 0.88) * (column + 0.5) / columns
            add_cylinder(
                f"woodpile_log_{row:02d}_{column:02d}",
                (x + rng.uniform(-0.012, 0.012), rng.uniform(-0.03, 0.03), z),
                log_r * rng.uniform(0.86, 1.06), log_len, tokens[(row + column) % 3], root,
                vertices=6, rotation=(math.radians(90), rng.uniform(-0.06, 0.06), 0),
            )

    # Tarp drapes over the top course and is held down by two stones.
    add_box("woodpile_tarp", (0, 0, height + 0.035), (length + 0.10, 0.94, 0.030), canvas, root,
            rotation=(math.radians(1.5), 0, 0), bevel=0.010)
    for index, sx in enumerate((-length * 0.28, length * 0.24)):
        add_ico(f"woodpile_tarp_weight_{index}", (sx, rng.uniform(-0.12, 0.12), height + 0.085), (0.085, 0.075, 0.052), weathered, root)

    add_collision_primitives(spec, root)


def milk_churn(spec: dict, root) -> None:
    """Shouldered dairy churn with lid clasp, carry lugs, and a painted band."""
    metal, brass, cream = spec["palette"]
    base_r, body_h = 0.185, 0.44
    base_z = 0.02

    add_cylinder("churn_foot", (0, 0, base_z + 0.020), base_r + 0.012, 0.040, brass, root, vertices=12, bevel=0.008)
    add_cylinder("churn_body", (0, 0, base_z + 0.045 + body_h * 0.5), base_r, body_h, metal, root, vertices=12, bevel=0.010)
    add_box("churn_band", (0, 0, base_z + 0.045 + body_h * 0.42), (base_r * 2.06, base_r * 2.06, 0.055), cream, root, bevel=0.0)
    shoulder_z = base_z + 0.045 + body_h
    add_cone("churn_shoulder", (0, 0, shoulder_z + 0.075), base_r, base_r * 0.52, 0.15, metal, root, vertices=12)
    neck_z = shoulder_z + 0.15
    add_cylinder("churn_neck", (0, 0, neck_z + 0.045), base_r * 0.52, 0.09, metal, root, vertices=10, bevel=0.008)
    add_ring("churn_neck_ring", (0, 0, neck_z + 0.020), base_r * 0.55, 0.014, brass, root, major_segments=10, minor_segments=4)
    add_cylinder("churn_lid", (0, 0, neck_z + 0.105), base_r * 0.58, 0.035, brass, root, vertices=10, bevel=0.008)
    add_cylinder("churn_lid_knob", (0, 0, neck_z + 0.140), base_r * 0.16, 0.045, brass, root, vertices=8, bevel=0.006)

    # Carry lugs on the shoulder and a swing bail between them.
    for index, sign in enumerate((-1, 1)):
        add_box(f"churn_lug_{index}", (sign * base_r * 0.80, 0, shoulder_z + 0.055), (0.055, 0.030, 0.070), brass, root, bevel=0.008)
    add_beam("churn_bail", (-base_r * 0.80, 0, shoulder_z + 0.085), (0, 0, neck_z + 0.070), 0.010, brass, root, vertices=6)
    add_beam("churn_bail_r", (base_r * 0.80, 0, shoulder_z + 0.085), (0, 0, neck_z + 0.070), 0.010, brass, root, vertices=6)


def fence_section(spec: dict, root) -> None:
    """Three-rail post-and-rail run with mortised posts and a diagonal brace."""
    wood, weathered, metal = spec["palette"]
    rng = seeded_rng(spec["seed"])
    length, height = 1.94, 1.02

    posts = (-length * 0.5 + 0.06, 0.0, length * 0.5 - 0.06)
    for index, px in enumerate(posts):
        lean = rng.uniform(-0.022, 0.022)
        add_box(f"fence_post_{index}", (px, 0, height * 0.5 - 0.02), (0.11, 0.11, height + 0.04), wood, root,
                rotation=(lean, 0, rng.uniform(-0.05, 0.05)), bevel=0.014)
        # Weathered chamfered cap sheds rain off the end grain.
        add_cone(f"fence_post_cap_{index}", (px, 0, height + 0.03), 0.075, 0.045, 0.055, weathered, root, vertices=6)

    for index, rail_z in enumerate((0.30, 0.62, 0.92)):
        add_box(f"fence_rail_{index}", (0, 0.0, rail_z), (length, 0.055, 0.105), weathered, root,
                rotation=(0, rng.uniform(-0.012, 0.012), 0), bevel=0.010)
        for jindex, px in enumerate(posts):
            add_cylinder(f"fence_nail_{index}_{jindex}", (px, -0.048, rail_z), 0.010, 0.030, metal, root,
                         vertices=6, rotation=(math.radians(90), 0, 0))

    # One diagonal brace: the member that keeps a rail fence from racking.
    add_beam("fence_brace", (-length * 0.44, 0.03, 0.10), (-0.03, 0.03, 0.88), 0.035, weathered, root, vertices=6)


def vegetable_bed_tile(spec: dict, root) -> None:
    """A four-metre planting tile: hilled rows, walked furrows, and edging boards.

    The catalog entry is a flat ground tile, so everything here stays inside a
    few centimetres and reads from directly above.
    """
    soil, warm_soil, wood, foliage = spec["palette"]
    rng = seeded_rng(spec["seed"])
    size = 3.86

    add_box("bed_ground", (0, 0, 0.008), (size, size, 0.016), soil, root, bevel=0.0)
    # Edging boards laid flat around the plot rather than standing as a frame.
    for index, sign in enumerate((-1, 1)):
        add_box(f"bed_edge_x_{index}", (0, sign * size * 0.485, 0.019), (size, 0.13, 0.022), wood, root, bevel=0.006)
        add_box(f"bed_edge_y_{index}", (sign * size * 0.485, 0, 0.019), (0.13, size - 0.26, 0.022), wood, root, bevel=0.006)

    rows = 5
    for row in range(rows):
        y = -size * 0.34 + (size * 0.68) * row / (rows - 1)
        # Low hilled row with a shadowed furrow either side of it.
        add_tri_prism(
            f"bed_row_{row}", (0, y, 0.020), (size - 0.36, size / rows * 0.52, 0.026), warm_soil, root,
            rotation=(0, 0, rng.uniform(-0.006, 0.006)),
        )
        for index in range(6):
            x = -size * 0.32 + (size * 0.64) * index / 5
            add_ico(
                f"bed_sprout_{row}_{index}", (x, y + rng.uniform(-0.03, 0.03), 0.030),
                (0.085, 0.075, 0.020), foliage if index % 3 else warm_soil, root,
                rotation=(0, 0, rng.uniform(0, math.pi)),
            )
    for index in range(4):
        add_ico(
            f"bed_clod_{index}", (rng.uniform(-1.6, 1.6), rng.uniform(-1.6, 1.6), 0.020),
            (0.10, 0.085, 0.014), soil, root, rotation=(0, 0, rng.uniform(0, math.pi)),
        )


def tilled_soil_tile(spec: dict, root) -> None:
    """One metre of worked ground: parallel furrows with shadowed troughs."""
    damp, shadow, dry = spec["palette"]
    rng = seeded_rng(spec["seed"])
    size = 0.98

    add_box("soil_pan", (0, 0, 0.012), (size, size, 0.024), shadow, root, bevel=0.0)
    ridges = 6
    for index in range(ridges):
        y = -size * 0.5 + size * (index + 0.5) / ridges
        token = damp if index % 2 == 0 else dry
        add_tri_prism(
            f"soil_ridge_{index}", (0, y, 0.030), (size, size / ridges * 0.96, 0.034), token, root,
            rotation=(0, 0, rng.uniform(-0.010, 0.010)),
        )
    # A few turned clods break the perfect corduroy.
    for index in range(4):
        add_ico(
            f"soil_clod_{index}",
            (rng.uniform(-0.34, 0.34), rng.uniform(-0.34, 0.34), 0.040),
            (0.055, 0.048, 0.026), damp, root, rotation=(0, 0, rng.uniform(0, math.pi)),
        )
