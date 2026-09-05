"""Trailside and campsite prop generators.

Seating carries weight through legs onto feet, the fire pit is ringed by stones
that sit into the ground, and the smoke plume widens and dissipates as it rises.
"""

from __future__ import annotations

import math

from common.geometry import (
    add_beam,
    add_box,
    add_cone,
    add_cylinder,
    add_ico,
    add_limb_tube,
    add_tapered_beam,
    add_tri_prism,
    seeded_rng,
)
from common.authored import add_plank_field, add_shingle_rows, grow_branch


def fallen_log(spec: dict, root) -> None:
    """Toppled trunk resting on its root plate and one broken limb."""
    dark, weathered, moss, shadow = spec["palette"]
    rng = seeded_rng(spec["seed"])
    length = 2.94

    joints = [(-length * 0.50, -0.06, 0.34), (-length * 0.16, 0.05, 0.38), (length * 0.18, 0.02, 0.33), (length * 0.50, -0.08, 0.25)]
    radii = (0.30, 0.315, 0.275, 0.205)
    trunk = add_limb_tube("log_trunk", joints, radii, dark, root, sides=8)

    # Root plate at the uphill end: what a wind-thrown tree tears up with it.
    add_cone("log_root_plate", (-length * 0.54, -0.06, 0.36), 0.31, 0.44, 0.20, weathered, root, vertices=8,
             rotation=(0, math.radians(-84), 0))
    for index in range(5):
        angle = index * 1.35
        add_tapered_beam(
            f"log_root_{index}", (-length * 0.55, -0.06, 0.36),
            (-length * 0.62 - 0.10, -0.06 + math.cos(angle) * 0.36, 0.36 + math.sin(angle) * 0.34),
            0.055, 0.020, weathered, root, vertices=5,
        )
    # Broken limb props the far end off the ground.
    grow_branch(trunk, (length * .30, .08, .30), (length * .36, .34, .03), .075, .045)
    add_cone("log_break_end", (length * 0.53, -0.08, 0.25), 0.195, 0.075, 0.16, shadow, root, vertices=7,
             rotation=(0, math.radians(80), 0))

    # Moss only on the shaded upper side, never all round.
    for index in range(5):
        add_ico(
            f"log_moss_{index}", (-1.10 + index * 0.58, rng.uniform(-0.10, 0.10), 0.56),
            (0.30, 0.22, 0.055), moss, root, rotation=(0, 0, rng.uniform(0, math.pi)),
        )
    for index in range(3):
        add_cone(f"log_shelf_fungus_{index}", (-0.62 + index * 0.66, -0.28, 0.36 + rng.uniform(-0.08, 0.08)),
                 0.010, 0.105, 0.035, weathered, root, vertices=7, rotation=(math.radians(76), 0, 0))


def smoke_plume(spec: dict, root) -> None:
    """Rising column: tight and dense low, wider and softer with height."""
    pale, cream, warm = spec["palette"]
    rng = seeded_rng(spec["seed"])
    height = 2.72

    puffs = 12
    drift = 0.30
    for index in range(puffs):
        t = index / (puffs - 1)
        z = 0.10 + (height - 0.20) * t
        # Puffs have to overlap or the column reads as a stack of loose rocks,
        # and only the very base carries any ember warmth -- a warm lower half
        # made a chimney look like it was on fire.
        radius = 0.17 + 0.40 * t ** 0.85
        token = warm if t < 0.06 else (cream if t < 0.45 else pale)
        add_ico(
            f"smoke_puff_{index:02d}",
            (drift * t * t + rng.uniform(-0.05, 0.05), rng.uniform(-0.05, 0.05) + drift * 0.5 * t * t, z),
            (radius, radius * rng.uniform(0.86, 1.06), radius * rng.uniform(0.72, 0.95)),
            token, root, subdivisions=1,
            rotation=(rng.uniform(-0.4, 0.4), rng.uniform(-0.4, 0.4), index * 0.9),
         flat=False)
        # Small trailing wisps shed off the column near the top.
        if t > 0.45:
            add_ico(
                f"smoke_wisp_{index:02d}",
                (drift * t * t + rng.uniform(0.18, 0.34), rng.uniform(-0.20, 0.20), z + rng.uniform(-0.10, 0.10)),
                (radius * 0.40, radius * 0.34, radius * 0.26), pale, root,
                rotation=(rng.uniform(-0.5, 0.5), rng.uniform(-0.5, 0.5), 0),
             flat=False)


def fire_pit(spec: dict, root) -> None:
    """Stone ring bedded into scorched ground, with a collapsed teepee of logs."""
    cool, warm, wood, ember = spec["palette"]
    rng = seeded_rng(spec["seed"])
    ring_radius = 0.48

    add_cylinder("firepit_scorch", (0, 0, 0.010), ring_radius + 0.09, 0.020, wood, root, vertices=12)
    add_cylinder("firepit_ash_bed", (0, 0, 0.035), ring_radius * 0.78, 0.045, cool, root, vertices=10)

    stones = 9
    for index in range(stones):
        angle = index * math.tau / stones + rng.uniform(-0.10, 0.10)
        # Stones sit into the ground, not on top of it.
        add_ico(
            f"firepit_stone_{index}",
            (math.cos(angle) * ring_radius, math.sin(angle) * ring_radius, 0.075 + rng.uniform(-0.015, 0.020)),
            (0.135, 0.115, 0.105), cool if index % 2 else warm, root,
            rotation=(rng.uniform(-0.25, 0.25), rng.uniform(-0.25, 0.25), angle),
        )

    # Logs lean in on each other, the way a burnt-down teepee collapses.
    for index in range(4):
        angle = index * math.tau / 4 + 0.5
        base = (math.cos(angle) * 0.30, math.sin(angle) * 0.30, 0.055)
        tip = (math.cos(angle) * 0.055, math.sin(angle) * 0.055, 0.30)
        add_tapered_beam(f"firepit_log_{index}", base, tip, 0.048, 0.036, wood, root, vertices=6)
    add_cylinder("firepit_log_fallen", (0.10, -0.12, 0.075), 0.045, 0.52, wood, root, vertices=6,
                 rotation=(0, math.radians(90), rng.uniform(0, math.pi)))

    add_ico("firepit_embers", (0, 0, 0.052), (0.085, 0.078, 0.022), ember, root)
    for index in range(3):
        angle = index * 2.1 + 0.3
        add_ico(f"firepit_ember_{index}", (math.cos(angle) * 0.105, math.sin(angle) * 0.095, 0.062),
                (0.028, 0.025, 0.016), ember, root)


def trail_kiosk(spec: dict, root) -> None:
    """Two-post noticeboard under a shingled pent roof, with a map panel and pinned notes."""
    wood, dark, roof, paper = spec["palette"]
    rng = seeded_rng(spec["seed"])
    width, post_h = 1.32, 1.62

    for index, sx in enumerate((-width * 0.5 + 0.07, width * 0.5 - 0.07)):
        add_box(f"kiosk_post_{index}", (sx, 0, post_h * 0.5 + 0.05), (0.10, 0.10, post_h), dark, root, bevel=0.012)
        add_box(f"kiosk_post_foot_{index}", (sx, 0, 0.045), (0.18, 0.20, 0.09), dark, root, bevel=0.012)
        # Knee brace from post to head rail: what stops the board racking.
        add_beam(f"kiosk_brace_{index}", (sx, 0.02, post_h * 0.72), (sx * 0.42, 0.02, post_h + 0.02), 0.024, dark, root, vertices=6)

    board_z = post_h * 0.66
    add_box("kiosk_board_back", (0, 0.035, board_z), (width - 0.06, 0.045, 0.86), wood, root, bevel=0.012)
    add_box("kiosk_board_face", (0, -0.005, board_z), (width - 0.16, 0.020, 0.76), paper, root, bevel=0.006)
    for index, sign in enumerate((-1, 1)):
        add_box(f"kiosk_board_frame_{index}", (sign * (width * 0.5 - 0.07), 0.010, board_z), (0.055, 0.055, 0.90), dark, root, bevel=0.010)
        add_box(f"kiosk_board_rail_{index}", (0, 0.010, board_z + sign * 0.445), (width - 0.06, 0.055, 0.055), dark, root, bevel=0.010)
    # Pinned notices at slight angles: the reason a noticeboard exists.
    for index in range(3):
        add_box(
            f"kiosk_notice_{index}", (-0.36 + index * 0.36, -0.020, board_z + rng.uniform(-0.16, 0.16)),
            (0.22, 0.010, 0.26), wood, root, rotation=(0, rng.uniform(-0.10, 0.10), 0), bevel=0.0,
        )

    head_z = post_h + 0.08
    add_box("kiosk_head_rail", (0, 0, head_z), (width + 0.06, 0.12, 0.075), dark, root, bevel=0.010)
    add_shingle_rows("kiosk_shingle", width + 0.22, 0.16, head_z + 0.02, 24.0, (roof, dark), root,
                     rows=3, columns=4, seed=spec["seed"] + 5)
    add_box("kiosk_ridge", (0, 0, head_z + 0.20), (width + 0.26, 0.09, 0.055), dark, root, bevel=0.010)


def trail_signpost(spec: dict, root) -> None:
    """Fingerpost: three pointed arms at different heights and bearings, on one braced post."""
    wood, dark, cream, metal = spec["palette"]
    post_h = 1.80

    add_cone("signpost_cairn", (0, 0, 0.085), 0.30, 0.20, 0.17, dark, root, vertices=8)
    add_box("signpost_post", (0, 0, post_h * 0.5 + 0.10), (0.115, 0.115, post_h), wood, root, bevel=0.012)
    add_cone("signpost_finial", (0, 0, post_h + 0.20), 0.095, 0.020, 0.14, dark, root, vertices=6)

    arms = ((post_h - 0.06, math.radians(0), 0.52), (post_h - 0.34, math.radians(128), 0.46), (post_h - 0.60, math.radians(233), 0.42))
    for index, (z, yaw, length) in enumerate(arms):
        cx = math.cos(yaw) * length * 0.5
        cy = math.sin(yaw) * length * 0.5
        add_box(f"signpost_arm_{index}", (cx, cy, z), (length, 0.045, 0.145), wood, root, rotation=(0, 0, yaw), bevel=0.010)
        add_box(f"signpost_arm_face_{index}", (cx, cy, z), (length * 0.82, 0.020, 0.095), cream, root, rotation=(0, 0, yaw), bevel=0.0)
        # Pointed tip is what makes a fingerpost point.
        add_tri_prism(
            f"signpost_arm_tip_{index}",
            (math.cos(yaw) * (length + 0.055), math.sin(yaw) * (length + 0.055), z),
            (0.145, 0.045, 0.115), wood, root, rotation=(math.radians(90), 0, yaw + math.pi * 0.5),
        )
        add_cylinder(f"signpost_arm_bolt_{index}", (math.cos(yaw) * 0.055, math.sin(yaw) * 0.055, z), 0.014, 0.135, metal, root,
                     vertices=6, rotation=(math.radians(90), 0, yaw + math.pi * 0.5))


def picnic_table(spec: dict, root) -> None:
    """A-frame picnic table: benches and top share the same splayed legs and stretcher."""
    wood, dark, metal = spec["palette"]
    length, top_h, bench_h = 1.86, 0.72, 0.44

    for index, sy in enumerate((-0.62, 0.62)):
        # One A-frame per end carries both the top and the benches.
        for jindex, sign in enumerate((-1, 1)):
            add_box(
                f"picnic_leg_{index}_{jindex}", (sign * 0.36, sy, top_h * 0.5 - 0.02),
                (0.075, 0.085, top_h + 0.16), dark, root, rotation=(0, sign * math.radians(-19), 0), bevel=0.012,
            )
        add_box(f"picnic_bench_bearer_{index}", (0, sy, bench_h - 0.045), (1.52, 0.10, 0.070), dark, root, bevel=0.010)
        add_box(f"picnic_top_bearer_{index}", (0, sy, top_h - 0.055), (0.90, 0.10, 0.075), dark, root, bevel=0.010)
        add_cylinder(f"picnic_bolt_{index}", (0, sy, bench_h - 0.045), 0.016, 0.13, metal, root, vertices=6,
                     rotation=(math.radians(90), 0, 0))

    # Central stretcher ties the two frames together.
    add_box("picnic_stretcher", (0, 0, 0.30), (0.075, 1.30, 0.075), dark, root, bevel=0.010)

    add_plank_field("picnic_top_plank", (0, 0, top_h), length, 0.72, 0.040, (wood, dark), root,
                    count=5, axis="y", seed=spec["seed"] + 3, bevel=0.008)
    for index, sy in enumerate((-0.60, 0.60)):
        add_plank_field(f"picnic_bench_plank_{index}", (0, sy, bench_h), length * 0.92, 0.30, 0.036,
                        (wood, dark), root, count=2, axis="y", seed=spec["seed"] + 11 + index, bevel=0.008)


def wood_bench(spec: dict, root) -> None:
    """Park bench: slatted seat and raked back on cast end frames with a stretcher."""
    wood, dark, metal = spec["palette"]
    length, seat_h = 1.70, 0.44

    for index, sx in enumerate((-length * 0.5 + 0.07, length * 0.5 - 0.07)):
        # Front and rear legs of the end frame, plus a foot pad.
        add_box(f"bench_leg_front_{index}", (sx, -0.16, seat_h * 0.5), (0.065, 0.075, seat_h), dark, root, bevel=0.010)
        add_box(f"bench_leg_rear_{index}", (sx, 0.17, seat_h * 0.5 + 0.02), (0.065, 0.075, seat_h + 0.04), dark, root,
                rotation=(math.radians(4), 0, 0), bevel=0.010)
        add_box(f"bench_foot_{index}", (sx, 0.0, 0.030), (0.085, 0.50, 0.060), dark, root, bevel=0.010)
        add_box(f"bench_seat_bearer_{index}", (sx, 0.0, seat_h + 0.020), (0.075, 0.46, 0.055), dark, root,
                rotation=(math.radians(-4), 0, 0), bevel=0.010)
        # Raked back stile continues the rear leg upward.
        add_box(f"bench_back_stile_{index}", (sx, 0.24, seat_h + 0.24), (0.065, 0.070, 0.46), dark, root,
                rotation=(math.radians(11), 0, 0), bevel=0.010)
        add_cylinder(f"bench_bolt_{index}", (sx, 0.0, seat_h + 0.020), 0.014, 0.10, metal, root, vertices=6,
                     rotation=(0, math.radians(90), 0))

    add_box("bench_stretcher", (0, 0.0, 0.16), (length - 0.22, 0.060, 0.060), dark, root, bevel=0.010)
    add_plank_field("bench_seat_slat", (0, -0.02, seat_h + 0.060), length, 0.42, 0.035, (wood, dark), root,
                    count=3, axis="y", seed=spec["seed"] + 4, bevel=0.008)
    for index, z in enumerate((seat_h + 0.20, seat_h + 0.32, seat_h + 0.44)):
        add_box(f"bench_back_slat_{index}", (0, 0.235 + index * 0.026, z), (length - 0.14, 0.032, 0.095), wood, root,
                rotation=(math.radians(11), 0, 0), bevel=0.008)


def path_stone_round(spec: dict, root) -> None:
    """Sunken stepping stone: worn crown, bedded rim, moss creeping in at the edge."""
    warm, cool, moss = spec["palette"]
    rng = seeded_rng(spec["seed"])

    add_cylinder("stepper_bed", (0, 0, 0.012), 0.335, 0.024, cool, root, vertices=9, bevel=0.008)
    add_cone("stepper_body", (0, 0, 0.034), 0.322, 0.290, 0.030, warm, root, vertices=9)
    add_cylinder("stepper_crown", (0, 0, 0.053), 0.245, 0.016, warm, root, vertices=9)
    for index in range(4):
        angle = index * math.tau / 4 + 0.6
        add_ico(
            f"stepper_moss_{index}", (math.cos(angle) * 0.275, math.sin(angle) * 0.255, 0.030),
            (0.085, 0.070, 0.018), moss, root, rotation=(0, 0, angle),
        )
    for index in range(2):
        add_box(f"stepper_chip_{index}", (rng.uniform(-0.16, 0.16), rng.uniform(-0.14, 0.14), 0.056),
                (0.13, 0.045, 0.010), cool, root, rotation=(0, 0, rng.uniform(0, math.pi)), bevel=0.0)


def path_stone_slab(spec: dict, root) -> None:
    """Rectangular flag with squared-off riven edges and a dished, walked-on centre."""
    cool, warm, moss = spec["palette"]
    rng = seeded_rng(spec["seed"])
    width, depth = 1.04, 0.64

    add_box("slab_bed", (0, 0, 0.012), (width, depth, 0.024), warm, root, bevel=0.010)
    add_box("slab_body", (0, 0, 0.036), (width - 0.03, depth - 0.03, 0.028), cool, root, bevel=0.010)
    # Dished centre from years of footfall.
    add_box("slab_wear", (0, 0, 0.050), (width * 0.62, depth * 0.62, 0.012), cool, root, bevel=0.0)
    # Riven edge chips along the long sides.
    for index in range(4):
        sx = -width * 0.35 + index * width * 0.235
        add_box(f"slab_chip_{index}", (sx, rng.choice((-1, 1)) * depth * 0.47, 0.036),
                (0.16, 0.055, 0.026), warm, root, rotation=(0, 0, rng.uniform(-0.14, 0.14)), bevel=0.0)
    for index in range(3):
        angle = index * 2.2 + 0.4
        add_ico(f"slab_moss_{index}", (math.cos(angle) * width * 0.38, math.sin(angle) * depth * 0.38, 0.036),
                (0.11, 0.075, 0.016), moss, root, rotation=(0, 0, angle))
