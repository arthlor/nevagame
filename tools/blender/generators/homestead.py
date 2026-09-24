"""Farmstead prop generators: apiary, potting bench, tools, and soil tiles.

Every builder here is authored so the silhouette reads as a working object:
loads sit on supports, tools balance on their heads, and soil beds keep their
frame above the fill. Palette order is fixed by the catalog entry.
"""

from __future__ import annotations

from common.design_primitives import add_crafted_box

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
from common.authored import add_plank_field, add_rope_line, add_profiled_vessel


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
        add_crafted_box(
            f"barrow_leg_{index}", (sign * tray_w * 0.40, 0.31, 0.135), (0.055, 0.055, 0.27), dark, root,
            rotation=(0, sign * math.radians(-5), 0), bevel=0.008,
        )
        add_crafted_box(f"barrow_foot_{index}", (sign * tray_w * 0.40, 0.31, 0.018), (0.085, 0.13, 0.036), dark, root, bevel=0.008)
        add_beam(
            f"barrow_leg_brace_{index}",
            (sign * tray_w * 0.40, 0.29, 0.24), (sign * tray_w * 0.42, 0.05, 0.36),
            0.016, dark, root, vertices=6,
        )

    add_crafted_box("barrow_tray_floor", (0, 0.0, tray_z - 0.075), (tray_w * 0.86, tray_len, 0.032), wood, root,
            rotation=(math.radians(-7), 0, 0), bevel=0.010)
    for index, sign in enumerate((-1, 1)):
        add_crafted_box(
            f"barrow_tray_side_{index}", (sign * tray_w * 0.45, 0.0, tray_z + 0.010),
            (0.030, tray_len, 0.20), wood, root, rotation=(math.radians(-7), sign * math.radians(11), 0), bevel=0.010,
        )
    add_crafted_box("barrow_tray_back", (0, tray_len * 0.5 - 0.02, tray_z + 0.030), (tray_w * 0.90, 0.030, 0.20), wood, root,
            rotation=(math.radians(-10), 0, 0), bevel=0.010)
    add_crafted_box("barrow_tray_front", (0, -tray_len * 0.5 + 0.02, tray_z - 0.075), (tray_w * 0.80, 0.030, 0.15), wood, root,
            rotation=(math.radians(12), 0, 0), bevel=0.010)
    # Iron edging caps the rim of the tray; it must not close over the opening.
    for index, sign in enumerate((-1, 1)):
        add_crafted_box(
            f"barrow_tray_edge_{index}", (sign * tray_w * 0.45, 0.0, tray_z + 0.105),
            (0.048, tray_len, 0.022), metal, root,
            rotation=(math.radians(-7), sign * math.radians(11), 0), bevel=0.005,
        )
    add_crafted_box("barrow_tray_edge_back", (0, tray_len * 0.5 - 0.02, tray_z + 0.128), (tray_w * 0.92, 0.048, 0.022), metal, root,
            rotation=(math.radians(-10), 0, 0), bevel=0.005)

    # Wheel captured between two fork cheeks on a real axle.
    axle_y = -0.535
    axle_z = 0.175
    for index, sign in enumerate((-1, 1)):
        add_crafted_box(
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
        add_crafted_box(
            f"barrow_spoke_{index}", (0, axle_y, axle_z), (0.022, 0.240, 0.022), wood, root,
            rotation=(angle, 0, 0), bevel=0.0,
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


def fence_section(spec: dict, root) -> None:
    """Three-rail post-and-rail run with mortised posts and a diagonal brace."""
    wood, weathered, metal = spec["palette"]
    rng = seeded_rng(spec["seed"])
    length, height = 1.94, 1.02

    posts = (-length * 0.5 + 0.06, 0.0, length * 0.5 - 0.06)
    for index, px in enumerate(posts):
        lean = rng.uniform(-0.022, 0.022)
        add_crafted_box(f"fence_post_{index}", (px, 0, height * 0.5 - 0.02), (0.11, 0.11, height + 0.04), wood, root,
                rotation=(lean, 0, rng.uniform(-0.05, 0.05)), bevel=0.014)
        # Weathered chamfered cap sheds rain off the end grain.
        add_cone(f"fence_post_cap_{index}", (px, 0, height + 0.03), 0.075, 0.045, 0.055, weathered, root, vertices=6)

    for index, rail_z in enumerate((0.30, 0.62, 0.92)):
        add_crafted_box(f"fence_rail_{index}", (0, 0.0, rail_z), (length, 0.055, 0.105), weathered, root,
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
