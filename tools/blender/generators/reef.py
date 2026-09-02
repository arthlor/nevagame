"""Coral generators: colonies that branch from one holdfast on a rock base."""

from __future__ import annotations

import math

from common.geometry import add_cone, add_cylinder, add_ico, add_tapered_beam, seeded_rng

GOLDEN_ANGLE = 2.39996322972865332


def coral_pillar(spec: dict, root) -> None:
    """Column colony: stacked lobes swelling and pinching up from a rock foot."""
    teal, red, cream, rock = spec["palette"]
    rng = seeded_rng(spec["seed"])
    height = 1.66

    add_ico("pillar_holdfast", (0, 0, 0.085), (0.38, 0.36, 0.13), rock, root)
    lobes = 7
    for index in range(lobes):
        t = index / (lobes - 1)
        z = 0.16 + (height - 0.30) * t
        radius = 0.26 * (1.0 - 0.42 * t) * (1.0 + 0.18 * math.sin(index * 1.7))
        token = teal if index % 3 != 2 else red
        add_ico(
            f"pillar_lobe_{index}", (rng.uniform(-0.03, 0.03), rng.uniform(-0.03, 0.03), z),
            (radius, radius * rng.uniform(0.88, 1.05), radius * 0.72), token, root,
            rotation=(rng.uniform(-0.2, 0.2), rng.uniform(-0.2, 0.2), index * GOLDEN_ANGLE),
        )
        # Pinched waist between lobes: the growth ring of a pillar coral.
        if index < lobes - 1:
            add_cylinder(f"pillar_waist_{index}", (0, 0, z + (height - 0.30) / (lobes - 1) * 0.5),
                         radius * 0.56, 0.045, cream, root, vertices=8)
    # Two side branches, each springing from a lobe rather than mid-air.
    for index, base_t in enumerate((0.38, 0.62)):
        z = 0.16 + (height - 0.30) * base_t
        angle = index * 2.4 + 0.6
        tip = (math.cos(angle) * 0.30, math.sin(angle) * 0.28, z + 0.34)
        add_tapered_beam(f"pillar_branch_{index}", (0, 0, z), tip, 0.075, 0.048, teal, root, vertices=6)
        add_ico(f"pillar_branch_tip_{index}", tip, (0.105, 0.100, 0.085), red if index else teal, root)
    add_ico("pillar_crown", (0, 0, height - 0.05), (0.185, 0.175, 0.135), cream, root)


def coral_staghorn(spec: dict, root) -> None:
    """Antler colony: a trunk that forks twice, every tip a blunt growing point."""
    ochre, teal, cream = spec["palette"]
    rng = seeded_rng(spec["seed"])

    # Irregular encrusted rock foot rather than one flat plate.
    add_ico("staghorn_base", (0, 0, 0.060), (0.26, 0.21, 0.075), teal, root)
    for index in range(3):
        angle = index * 2.2 + 0.5
        add_ico(
            f"staghorn_base_lump_{index}",
            (math.cos(angle) * 0.135, math.sin(angle) * 0.115, 0.045 + rng.uniform(0, 0.030)),
            (0.105, 0.095, 0.060), teal if index % 2 else cream, root,
            rotation=(0, 0, angle),
        )
    trunk_top = (0.02, 0.0, 0.46)
    add_tapered_beam("staghorn_trunk", (0, 0, 0.08), trunk_top, 0.105, 0.070, teal, root, vertices=7)

    tips = []
    for index in range(3):
        angle = index * math.tau / 3 + 0.4
        reach = rng.uniform(0.34, 0.50)
        tip = (trunk_top[0] + math.cos(angle) * reach, math.sin(angle) * reach * 0.72, trunk_top[2] + rng.uniform(0.28, 0.44))
        add_tapered_beam(f"staghorn_limb_{index}", trunk_top, tip, 0.062, 0.038, teal, root, vertices=6)
        tips.append((tip, angle))

    for index, (tip, angle) in enumerate(tips):
        for jindex, spread in enumerate((-0.75, 0.75)):
            branch_angle = angle + spread
            reach = rng.uniform(0.18, 0.30)
            fork = (
                tip[0] + math.cos(branch_angle) * reach,
                tip[1] + math.sin(branch_angle) * reach * 0.72,
                tip[2] + rng.uniform(0.14, 0.28),
            )
            add_tapered_beam(f"staghorn_fork_{index}_{jindex}", tip, fork, 0.034, 0.020, ochre, root, vertices=6)
            # Pale blunt tip: the living growing edge of a staghorn.
            add_ico(f"staghorn_tip_{index}_{jindex}", fork, (0.038, 0.036, 0.042), cream, root)
        add_ico(f"staghorn_node_{index}", tip, (0.048, 0.046, 0.044), ochre, root)


def coral_table(spec: dict, root) -> None:
    """Plate colony: a broad tabletop of fused plates cantilevered off one stalk."""
    teal, sage, cream, rock = spec["palette"]
    rng = seeded_rng(spec["seed"])
    plate_z = 0.50

    add_ico("table_rock_foot", (0, 0, 0.070), (0.34, 0.32, 0.11), rock, root)
    add_tapered_beam("table_stalk", (0, 0, 0.09), (0.02, 0.0, plate_z), 0.135, 0.185, sage, root, vertices=8)

    # Plates radiate from the stalk head and overlap into one table.
    add_cylinder("table_plate_core", (0.02, 0, plate_z + 0.045), 0.34, 0.055, teal, root, vertices=10, bevel=0.014)
    for index in range(6):
        angle = index * math.tau / 6 + 0.3
        radius = rng.uniform(0.30, 0.42)
        add_cylinder(
            f"table_plate_{index}",
            (0.02 + math.cos(angle) * radius * 0.72, math.sin(angle) * radius * 0.72, plate_z + 0.050 + rng.uniform(-0.02, 0.02)),
            radius, 0.042, teal if index % 2 else sage, root, vertices=8,
            rotation=(math.sin(angle) * 0.12, -math.cos(angle) * 0.12, angle), bevel=0.012,
        )
    # Upturned pale rim, the way a table coral's growing margin lifts.
    for index in range(8):
        angle = index * math.tau / 8
        add_cone(
            f"table_rim_{index}",
            (0.02 + math.cos(angle) * 0.70, math.sin(angle) * 0.68, plate_z + 0.085),
            0.115, 0.075, 0.055, cream, root, vertices=6,
            rotation=(math.sin(angle) * 0.30, -math.cos(angle) * 0.30, angle),
        )
    for index in range(3):
        angle = index * 2.2 + 0.8
        add_ico(f"table_knob_{index}", (0.02 + math.cos(angle) * 0.24, math.sin(angle) * 0.22, plate_z + 0.115),
                (0.070, 0.065, 0.055), cream, root)
