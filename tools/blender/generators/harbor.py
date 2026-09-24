"""Dock, mooring, and cargo prop generators for Neva's working waterfront.

Harbour gear is authored around load paths: piles carry the deck, ropes hang in
catenaries, and the anchor balances on its crown rather than floating.
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
    add_conforming_shell,
    add_ring,
    add_tapered_beam,
    add_tri_prism,
    seeded_rng,
)
from common.authored import (
    add_burlap_sack,
    add_catenary_rope,
    add_fasteners,
    add_mooring_cleat,
    add_plank_field,
    add_rope_line,
    grow_branch,
)


def dock_platform(spec: dict, root) -> None:
    """Planked deck on four piles with cross bracing, a bull rail, and a cleat."""
    weathered, dark, wet, metal = spec["palette"]
    rng = seeded_rng(spec["seed"])
    width, depth = 1.94, 1.54
    deck_z = 0.50

    # Piles run from the waterline up through the deck: the deck rests on them.
    pile_positions = (
        (-width * 0.40, -depth * 0.36), (width * 0.40, -depth * 0.36),
        (-width * 0.40, depth * 0.36), (width * 0.40, depth * 0.36),
    )
    for index, (px, py) in enumerate(pile_positions):
        add_cylinder(f"dock_pile_{index}", (px, py, deck_z * 0.5), 0.075, deck_z + 0.04, dark, root, vertices=8, bevel=0.008)
        # Wet, weed-darkened band at the splash zone.
        add_cylinder(f"dock_pile_wet_{index}", (px, py, 0.085), 0.082, 0.17, wet, root, vertices=8, bevel=0.006)

    # Bearers span between piles and carry the deck boards.
    for index, py in enumerate((-depth * 0.36, depth * 0.36)):
        add_box(f"dock_bearer_{index}", (0, py, deck_z - 0.055), (width + 0.04, 0.085, 0.10), dark, root, bevel=0.010)
    # Diagonal sway braces stop the frame from racking with the swell.
    for index, sign in enumerate((-1, 1)):
        add_beam(
            f"dock_brace_{index}",
            (sign * width * 0.40, -depth * 0.36, 0.16), (sign * width * 0.40, depth * 0.36, deck_z - 0.10),
            0.032, dark, root, vertices=6,
        )

    add_plank_field(
        "dock_deck_plank", (0, 0, deck_z + 0.020), width, depth, 0.040,
        (weathered, dark), root, count=9, axis="x", seed=spec["seed"] + 5, bevel=0.008,
    )
    # Bull rail along the outer edge: what a line gets thrown over.
    add_crafted_box("dock_bull_rail", (0, -depth * 0.5 + 0.02, deck_z + 0.095), (width, 0.075, 0.11), weathered, root, bevel=0.010)
    add_fasteners(
        "dock_deck_spike",
        tuple((-width * 0.36 + index * width * 0.24, -depth * 0.5 + 0.02, deck_z + 0.135) for index in range(4)),
        0.010, metal, root, depth=0.05,
    )
    add_mooring_cleat("dock_cleat", (width * 0.26, depth * 0.30, deck_z + 0.040), 0.24, metal, root, yaw=math.radians(90))

    for index in range(3):
        add_box(
            f"dock_wear_patch_{index}",
            (rng.uniform(-width * 0.30, width * 0.30), rng.uniform(-depth * 0.26, depth * 0.26), deck_z + 0.042),
            (0.22, 0.18, 0.008), wet, root, rotation=(0, 0, rng.uniform(0, math.pi)), bevel=0.0,
        )


def pier_railing(spec: dict, root) -> None:
    """Four posts carrying two swagged rope rails, the way harbour railings hang."""
    weathered, dark, rope = spec["palette"]
    rng = seeded_rng(spec["seed"])
    length, height = 3.88, 0.98

    posts = [-length * 0.5 + length * index / 3 for index in range(4)]
    for index, px in enumerate(posts):
        add_cylinder(f"railing_post_{index}", (px, 0, height * 0.5 - 0.03), 0.070, height - 0.06, weathered, root,
                     vertices=8, rotation=(rng.uniform(-0.012, 0.012), 0, 0), bevel=0.010)
        add_cone(f"railing_post_cap_{index}", (px, 0, height - 0.005), 0.078, 0.048, 0.055, dark, root, vertices=8)
        add_crafted_box(f"railing_post_base_{index}", (px, 0, 0.030), (0.16, 0.16, 0.06), dark, root, bevel=0.010)

    # Ropes sag between posts under their own weight instead of running dead straight.
    for span in range(3):
        start_x, end_x = posts[span], posts[span + 1]
        for rail_index, (rail_z, sag) in enumerate(((height - 0.13, 0.055), (height * 0.55, 0.075))):
            add_catenary_rope(
                f"railing_rope_{span}_{rail_index}",
                (start_x, 0, rail_z), (end_x, 0, rail_z), sag, 0.022, rope, root, segments=5, vertices=6,
            )
    # Whipped rope collars where each line lands on a post.
    for index, px in enumerate(posts):
        for rail_index, rail_z in enumerate((height - 0.13, height * 0.55)):
            add_cylinder(f"railing_collar_{index}_{rail_index}", (px, 0, rail_z), 0.082, 0.055, rope, root, vertices=8)


def mooring_post(spec: dict, root) -> None:
    """Squat bollard pile with an iron cap band and a coiled line laid over it."""
    weathered, dark, rope, metal = spec["palette"]
    rng = seeded_rng(spec["seed"])
    height = 1.02

    add_cylinder("bollard_base_plate", (0, 0, 0.030), 0.26, 0.06, dark, root, vertices=10, bevel=0.010)
    add_cone("bollard_shaft", (0, 0, height * 0.5 + 0.03), 0.155, 0.130, height - 0.06, weathered, root, vertices=10)
    add_cylinder("bollard_wet_band", (0, 0, 0.14), 0.162, 0.16, dark, root, vertices=10, bevel=0.006)
    add_ring("bollard_iron_band", (0, 0, height - 0.16), 0.140, 0.024, metal, root, major_segments=10, minor_segments=4)
    # Mushroom head keeps a looped line from lifting off.
    add_cone("bollard_head", (0, 0, height - 0.045), 0.128, 0.185, 0.075, weathered, root, vertices=10)
    add_cylinder("bollard_head_cap", (0, 0, height + 0.005), 0.185, 0.030, metal, root, vertices=10, bevel=0.008)

    # Three coils of line dropped over the head, each one slightly offset.
    for index in range(3):
        add_ring(
            f"bollard_coil_{index}",
            (rng.uniform(-0.012, 0.012), rng.uniform(-0.012, 0.012), height - 0.115 - index * 0.045),
            0.168 + index * 0.010, 0.021, rope, root, major_segments=10, minor_segments=4,
            rotation=(rng.uniform(-0.05, 0.05), rng.uniform(-0.05, 0.05), 0),
        )
    add_catenary_rope("bollard_tail", (0.15, 0.05, height - 0.20), (0.30, 0.24, 0.025), 0.06, 0.021, rope, root, segments=4)


def gangplank(spec: dict, root) -> None:
    """Cleated ramp from quay height to deck, with a rope handline on stanchions."""
    weathered, dark, rope, metal = spec["palette"]
    length, width = 3.30, 0.80
    rise = 1.34
    pitch = math.atan2(rise, length)

    # Ramp body, sloped along +Y and resting on a hooked lip at each end.
    # Rotating by +pitch about X raises the surface toward +Y, which is where the
    # ship end and every cleat below are placed.
    add_crafted_box("plank_ramp", (0, 0, rise * 0.5 + 0.10), (width, math.hypot(length, rise), 0.075), weathered, root,
            rotation=(pitch, 0, 0), bevel=0.012)
    for index, sign in enumerate((-1, 1)):
        add_crafted_box(f"plank_stringer_{index}", (sign * (width * 0.5 - 0.03), 0, rise * 0.5 + 0.08),
                (0.055, math.hypot(length, rise), 0.13), dark, root, rotation=(pitch, 0, 0), bevel=0.010)

    # Anti-slip cleats spaced along the run: what makes it walkable, not a board.
    cleats = 8
    for index in range(cleats):
        t = (index + 0.5) / cleats
        y = -length * 0.5 + length * t
        z = 0.10 + rise * t + 0.055
        add_crafted_box(f"plank_cleat_{index}", (0, y, z), (width - 0.06, 0.055, 0.030), dark, root,
                rotation=(pitch, 0, 0), bevel=0.006)

    # Hooked landing lip low end, iron shoe high end.
    add_crafted_box("plank_shore_lip", (0, -length * 0.5 - 0.06, 0.055), (width, 0.20, 0.045), metal, root,
            rotation=(math.radians(6), 0, 0), bevel=0.008)
    add_crafted_box("plank_ship_hook", (0, length * 0.5 + 0.04, rise + 0.115), (width, 0.16, 0.055), metal, root, bevel=0.008)

    # Two stanchions and a hand line only on the outboard side.
    for index, t in enumerate((0.30, 0.72)):
        y = -length * 0.5 + length * t
        z = 0.10 + rise * t + 0.10
        add_cylinder(f"plank_stanchion_{index}", (-width * 0.5 + 0.05, y, z + 0.24), 0.024, 0.50, metal, root, vertices=6)
    y0, z0 = -length * 0.5 + length * 0.30, 0.10 + rise * 0.30 + 0.56
    y1, z1 = -length * 0.5 + length * 0.72, 0.10 + rise * 0.72 + 0.56
    add_catenary_rope("plank_handline", (-width * 0.5 + 0.05, y0, z0), (-width * 0.5 + 0.05, y1, z1), 0.07, 0.020, rope, root, segments=5)


def admiralty_anchor(spec: dict, root) -> None:
    """Stocked anchor stood on its flukes, arms across the width, close stock fore-aft.

    The catalog footprint is wide and shallow, so the arms and flukes carry the
    span while the stock is the short close-stock pattern that folds against the
    shank rather than a full crossbar.
    """
    metal, wood, brass, rope = spec["palette"]
    shank_len = 2.02
    lean = math.radians(9.0)

    def along_shank(t):
        """Point t metres up the shank, which leans aft in +Y."""
        return (0.0, math.sin(lean) * t, math.cos(lean) * t)

    crown = along_shank(0.30)
    shank_top = along_shank(shank_len)
    add_tapered_beam("anchor_shank", crown, shank_top, 0.080, 0.050, metal, root, vertices=8)
    add_cone("anchor_crown_boss", (crown[0], crown[1], crown[2]), 0.110, 0.075, 0.16, metal, root,
             vertices=8, rotation=(lean, 0, 0))

    # Arms sweep down and out across the width, each ending in a flat palm that
    # takes the anchor's weight on the ground.
    for index, sign in enumerate((-1, 1)):
        arm_end = (sign * 0.78, crown[1] - 0.03, 0.16)
        add_tapered_beam(f"anchor_arm_{index}", crown, arm_end, 0.068, 0.034, metal, root, vertices=6)
        add_tri_prism(
            f"anchor_fluke_{index}", (sign * 0.90, crown[1] - 0.03, 0.19),
            (0.34, 0.26, 0.40), metal, root, rotation=(math.radians(90), 0, math.radians(90 + 24 * sign)),
        )
        add_box(f"anchor_palm_{index}", (sign * 0.95, crown[1] - 0.03, 0.055), (0.22, 0.20, 0.045), metal, root,
                bevel=0.010)

    # Close stock: a short wooden crossbar set fore-and-aft below the ring.
    stock = along_shank(shank_len - 0.34)
    add_box("anchor_stock", (0, stock[1], stock[2]), (0.115, 0.62, 0.115), wood, root,
            rotation=(lean, 0, 0), bevel=0.014)
    for index, sign in enumerate((-1, 1)):
        add_box(f"anchor_stock_hoop_{index}", (0, stock[1] + sign * 0.26, stock[2] - sign * 0.04), (0.135, 0.070, 0.135),
                brass, root, rotation=(lean, 0, 0), bevel=0.010)
    add_box("anchor_stock_collar", (0, stock[1], stock[2]), (0.140, 0.16, 0.140), brass, root,
            rotation=(lean, 0, 0), bevel=0.010)

    add_ring("anchor_ring", (0, shank_top[1] + 0.045, shank_top[2] + 0.13), 0.140, 0.028, metal, root,
             major_segments=12, minor_segments=4, rotation=(0, math.radians(90), 0))
    # Five segments and a shallow sag drew a straight pale strut corner to
    # corner. More segments and real sag make it read as slack cable.
    add_catenary_rope(
        "anchor_cable", (0.03, shank_top[1] + 0.06, shank_top[2] + 0.14), (0.52, shank_top[1] + 0.30, 0.030),
        0.34, 0.024, rope, root, segments=8,
    )


def marker_buoy(spec: dict, root) -> None:
    """Ballasted spar buoy: float, mast, topmark, and a mooring chain to the water."""
    red, cream, metal, rope = spec["palette"]
    float_z = 0.30

    # Counterweight keel below the float is why a spar buoy floats upright.
    add_cone("buoy_keel", (0, 0, 0.055), 0.055, 0.085, 0.11, metal, root, vertices=8)
    add_cylinder("buoy_keel_shaft", (0, 0, 0.19), 0.032, 0.17, metal, root, vertices=6)
    # The float has to have real bulk against a 2.6m mast, otherwise the whole
    # thing reads as a lamp post rather than something that floats.
    add_ico("buoy_float", (0, 0, float_z + 0.095), (0.190, 0.190, 0.168), red, root, subdivisions=2)
    add_ring("buoy_float_band", (0, 0, float_z + 0.095), 0.184, 0.032, cream, root, major_segments=12, minor_segments=4)
    add_cone("buoy_float_taper", (0, 0, float_z + 0.268), 0.150, 0.052, 0.14, red, root, vertices=8)

    mast_base = float_z + 0.33
    mast_top = 2.62
    add_tapered_beam("buoy_mast", (0, 0, mast_base), (0, 0, mast_top), 0.036, 0.024, metal, root, vertices=6)
    for index, z in enumerate((1.05, 1.62)):
        add_ring(f"buoy_mast_band_{index}", (0, 0, z), 0.030, 0.010, cream, root, major_segments=6, minor_segments=4)

    # Two cones point-to-point: a readable cardinal topmark.
    add_cone("buoy_topmark_lower", (0, 0, mast_top - 0.11), 0.115, 0.014, 0.20, red, root, vertices=8)
    add_cone("buoy_topmark_upper", (0, 0, mast_top + 0.10), 0.014, 0.115, 0.20, red, root, vertices=8)
    add_cylinder("buoy_topmark_tip", (0, 0, mast_top + 0.215), 0.020, 0.045, metal, root, vertices=6)

    add_ring("buoy_chain_eye", (0, 0, float_z - 0.03), 0.055, 0.014, metal, root, major_segments=8, minor_segments=4,
             rotation=(math.radians(90), 0, 0))
    add_catenary_rope("buoy_chain", (0, 0.02, float_z - 0.05), (0.10, 0.14, 0.025), 0.05, 0.018, rope, root, segments=4)
