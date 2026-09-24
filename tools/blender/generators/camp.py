"""Trailside and campsite prop generators.

Seating carries weight through legs onto feet, the fire pit is ringed by stones
that sit into the ground, and the smoke plume widens and dissipates as it rises.
"""

from __future__ import annotations

from common.design_primitives import add_crafted_box

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
