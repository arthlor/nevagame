"""Rock generators authored as stacked, bedded, eroded stone.

Every form here has a wide bedded base and narrows upward, so nothing looks
balanced on a point. Wave-cut notches and moss lines mark the height the sea or
the weather actually reaches.
"""

from __future__ import annotations

import math

from common.geometry import add_box, add_collision_primitives, add_cone, add_cylinder, add_ico, seeded_rng


def _faceted_mass(name, center, scale, token, root, *, rng, subdivisions=1):
    add_ico(name, center, scale, token, root, subdivisions=subdivisions,
            rotation=(rng.uniform(-0.35, 0.35), rng.uniform(-0.35, 0.35), rng.uniform(0, math.pi)))


def sea_stack(spec: dict, root) -> None:
    """Wave-cut column: an irregular eroded remnant, not a stack of even drums.

    The mass is built from faceted blocks that shrink and wander off-axis as they
    climb, so the silhouette leans and steps the way a real stack weathers. Only
    the tide line gets a clean horizontal cut.
    """
    dark, cool, moss, wet = spec["palette"]
    rng = seeded_rng(spec["seed"])

    # Bedded plinth wider than the shaft: the stack is a remnant, not a spike.
    _faceted_mass("stack_plinth", (0, 0, 0.26), (0.86, 0.84, 0.30), wet, root, rng=rng)
    _faceted_mass("stack_foot", (0.04, -0.03, 0.62), (0.74, 0.70, 0.36), dark, root, rng=rng)
    # The one clean horizontal in the whole form: the undercut the sea cuts.
    add_cylinder("stack_wave_notch", (0, 0, 0.98), 0.52, 0.17, wet, root, vertices=9, bevel=0.040)

    # A continuous tapered core carries the column; the faceted blocks below
    # break its surface without ever leaving a gap between them.
    add_cone("stack_core", (0.02, 0.0, 2.44), 0.56, 0.24, 2.96, dark, root, vertices=7,
             rotation=(0, math.radians(1.4), 0.4))

    # Blocks climb with a wandering axis so the column leans and steps.
    blocks = (
        (1.20, 0.06, -0.04, 0.62, 0.58, 0.40, dark),
        (1.58, -0.05, 0.06, 0.58, 0.55, 0.38, cool),
        (1.96, 0.07, 0.03, 0.54, 0.50, 0.36, dark),
        (2.32, -0.04, -0.05, 0.50, 0.46, 0.34, dark),
        (2.66, 0.05, 0.02, 0.45, 0.42, 0.32, cool),
        (2.98, -0.03, 0.04, 0.40, 0.37, 0.30, dark),
        (3.28, 0.04, -0.03, 0.34, 0.31, 0.28, dark),
        (3.58, -0.02, 0.03, 0.28, 0.26, 0.26, cool),
    )
    for index, (z, ox, oy, sx, sy, sz, token) in enumerate(blocks):
        _faceted_mass(f"stack_block_{index}", (ox, oy, z), (sx, sy, sz), token, root, rng=rng)
        # A shallow ledge on alternating sides, never a full band around the column.
        if index % 2 == 0:
            angle = index * 1.7
            add_box(
                f"stack_ledge_{index}",
                (ox + math.cos(angle) * sx * 0.72, oy + math.sin(angle) * sy * 0.72, z - sz * 0.30),
                (sx * 0.85, sy * 0.55, 0.075), wet, root,
                rotation=(0, rng.uniform(-0.12, 0.12), angle), bevel=0.020,
            )
    _faceted_mass("stack_crown", (0.02, 0.02, 3.88), (0.24, 0.22, 0.24), dark, root, rng=rng)

    for index in range(3):
        angle = index * 2.1 + 0.4
        _faceted_mass(
            f"stack_moss_{index}", (math.cos(angle) * 0.18, math.sin(angle) * 0.16, 4.00 + rng.uniform(-0.07, 0.07)),
            (0.16, 0.14, 0.060), moss, root, rng=rng,
        )
    # Fallen blocks bedded at the foot, from the column that used to be taller.
    for index in range(3):
        angle = index * 2.4 + 1.1
        _faceted_mass(
            f"stack_talus_{index}", (math.cos(angle) * 0.72, math.sin(angle) * 0.70, 0.16),
            (0.28, 0.24, 0.16), cool, root, rng=rng,
        )
    add_collision_primitives(spec, root)


def coastal_boulder(spec: dict, root) -> None:
    """Half-buried erratic: one long axis, a flat bedded underside, mossed lee side."""
    dark, cool, moss = spec["palette"]
    rng = seeded_rng(spec["seed"])

    _faceted_mass("boulder_core", (0, 0, 0.60), (1.05, 0.76, 0.62), dark, root, rng=rng)
    _faceted_mass("boulder_shoulder", (-0.42, 0.08, 0.44), (0.60, 0.52, 0.42), cool, root, rng=rng)
    _faceted_mass("boulder_haunch", (0.48, -0.10, 0.38), (0.52, 0.46, 0.36), cool, root, rng=rng)
    # Flattened skirt where the boulder sits into the ground.
    add_cylinder("boulder_bedding", (0, 0, 0.075), 1.02, 0.15, dark, root, vertices=8, bevel=0.045)

    for index in range(3):
        angle = index * 2.2 + 0.5
        add_box(
            f"boulder_fracture_{index}",
            (math.cos(angle) * 0.36, math.sin(angle) * 0.28, 0.62 + rng.uniform(-0.16, 0.16)),
            (1.02, 0.055, 0.16), cool, root, rotation=(0, rng.uniform(-0.25, 0.25), angle), bevel=0.0,
        )
    for index in range(3):
        angle = index * 2.0 + 2.4
        _faceted_mass(
            f"boulder_moss_{index}", (math.cos(angle) * 0.42, math.sin(angle) * 0.30, 0.92),
            (0.30, 0.26, 0.085), moss, root, rng=rng,
        )


def boulder_large(spec: dict, root) -> None:
    """Inland glacial boulder: broad, low, split by one deep joint, lichen on top."""
    warm, cool, moss = spec["palette"]
    rng = seeded_rng(spec["seed"])

    _faceted_mass("erratic_core", (0, 0, 0.56), (0.96, 0.86, 0.54), warm, root, rng=rng)
    _faceted_mass("erratic_lobe_west", (-0.52, 0.10, 0.38), (0.52, 0.48, 0.38), cool, root, rng=rng)
    _faceted_mass("erratic_lobe_east", (0.55, -0.08, 0.34), (0.46, 0.44, 0.34), warm, root, rng=rng)
    add_cylinder("erratic_bedding", (0, 0, 0.070), 0.95, 0.14, cool, root, vertices=8, bevel=0.040)

    # One through-going joint that splits the mass, plus two shallow ones.
    add_box("erratic_joint_main", (0.05, 0, 0.66), (0.075, 1.10, 0.70), cool, root,
            rotation=(0, math.radians(9), math.radians(14)), bevel=0.0)
    for index in range(2):
        add_box(
            f"erratic_joint_{index}", (rng.uniform(-0.35, 0.35), rng.uniform(-0.20, 0.20), 0.52 + index * 0.20),
            (1.05, 0.048, 0.11), warm, root, rotation=(0, rng.uniform(-0.20, 0.20), rng.uniform(0, math.pi)), bevel=0.0,
        )
    for index in range(3):
        angle = index * 2.3 + 0.9
        _faceted_mass(
            f"erratic_lichen_{index}", (math.cos(angle) * 0.36, math.sin(angle) * 0.30, 0.92),
            (0.28, 0.24, 0.070), moss, root, rng=rng,
        )
    add_collision_primitives(spec, root)


def rock_spire(spec: dict, root) -> None:
    """Leaning finger of rock on a talus skirt, tapering through bedded steps."""
    dark, cool, moss = spec["palette"]
    rng = seeded_rng(spec["seed"])
    height = 3.34
    lean = math.radians(5.5)

    add_cone("spire_talus", (0, 0, 0.16), 0.66, 0.50, 0.32, cool, root, vertices=8)
    for index in range(4):
        angle = index * 1.9 + 0.6
        _faceted_mass(
            f"spire_talus_block_{index}", (math.cos(angle) * 0.52, math.sin(angle) * 0.50, 0.14),
            (0.24, 0.20, 0.14), dark, root, rng=rng,
        )

    steps = ((0.30, 0.52, 0.44, 0.62, dark), (0.90, 0.44, 0.36, 0.68, cool),
             (1.56, 0.36, 0.27, 0.72, dark), (2.24, 0.27, 0.15, 0.78, cool),
             (2.94, 0.15, 0.045, 0.52, dark))
    for index, (base_z, radius_bottom, radius_top, section_h, token) in enumerate(steps):
        offset = math.sin(lean) * base_z
        add_cone(
            f"spire_step_{index}", (offset, rng.uniform(-0.03, 0.03), base_z + section_h * 0.5),
            radius_bottom, radius_top, section_h, token, root, vertices=7,
            rotation=(rng.uniform(-0.03, 0.03), lean, index * 0.7),
        )
        if index < 4:
            add_cylinder(f"spire_bed_{index}", (offset, 0, base_z + section_h), radius_top + 0.050, 0.055, cool, root, vertices=7)

    for index in range(2):
        _faceted_mass(
            f"spire_moss_{index}", (rng.uniform(-0.30, 0.30), rng.uniform(-0.30, 0.30), 0.34 + index * 0.24),
            (0.20, 0.17, 0.065), moss, root, rng=rng,
        )
    add_collision_primitives(spec, root)


def reef_small(spec: dict, root) -> None:
    """Low reef knuckle: bedded lumps under a weed-darkened, wave-worn crown."""
    dark, moss, wet = spec["palette"]
    rng = seeded_rng(spec["seed"])

    add_cylinder("reef_bedding", (0, 0, 0.030), 0.235, 0.060, wet, root, vertices=8, bevel=0.020)
    _faceted_mass("reef_core", (0, 0, 0.155), (0.215, 0.190, 0.155), dark, root, rng=rng)
    for index in range(3):
        angle = index * 2.2 + 0.6
        _faceted_mass(
            f"reef_knuckle_{index}", (math.cos(angle) * 0.115, math.sin(angle) * 0.105, 0.095 + rng.uniform(0, 0.055)),
            (0.105, 0.095, 0.080), dark if index % 2 else wet, root, rng=rng,
        )
    for index in range(3):
        angle = index * 2.0 + 1.6
        _faceted_mass(
            f"reef_weed_{index}", (math.cos(angle) * 0.090, math.sin(angle) * 0.080, 0.245),
            (0.085, 0.075, 0.030), moss, root, rng=rng,
        )
