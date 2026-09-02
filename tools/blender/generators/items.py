"""Hand-held item generators: food, purse, instrument, and the treasure chest.

These read at inventory scale and in a character's hand, so each one leans on a
single unmistakable silhouette cue rather than surface detail.
"""

from __future__ import annotations

import math

from common.geometry import (
    add_box,
    add_cone,
    add_cylinder,
    add_ico,
    add_ring,
    add_tapered_beam,
    add_tri_prism,
    seeded_rng,
)


def item_carrot(spec: dict, root) -> None:
    """Tapered root with a shoulder ring set and a three-frond top, centre pivot."""
    orange, leaf, shadow = spec["palette"]
    rng = seeded_rng(spec["seed"])
    root_len = 0.185

    add_cone("carrot_body", (0, 0, -0.145 + root_len * 0.5), 0.048, 0.016, root_len, orange, root, vertices=8)
    add_cone("carrot_tip", (0, 0, -0.145 - 0.020), 0.016, 0.002, 0.042, orange, root, vertices=6)
    add_cylinder("carrot_shoulder", (0, 0, -0.145 + root_len - 0.006), 0.050, 0.020, orange, root, vertices=8, bevel=0.004)
    # Growth rings around the shoulder are the read that says "root vegetable".
    for index in range(3):
        add_ring(f"carrot_ring_{index}", (0, 0, -0.10 + index * 0.032), 0.042 - index * 0.007, 0.004, shadow, root,
                 major_segments=8, minor_segments=4)

    crown_z = -0.145 + root_len + 0.010
    add_cylinder("carrot_crown", (0, 0, crown_z), 0.026, 0.020, leaf, root, vertices=6)
    for index in range(3):
        angle = index * math.tau / 3 + 0.3
        lean = rng.uniform(0.24, 0.42)
        tip = (math.cos(angle) * math.sin(lean) * 0.10, math.sin(angle) * math.sin(lean) * 0.10, crown_z + 0.095)
        add_tapered_beam(f"carrot_stem_{index}", (0, 0, crown_z), tip, 0.008, 0.005, leaf, root, vertices=5)
        add_tri_prism(
            f"carrot_frond_{index}", (tip[0] * 1.10, tip[1] * 1.10, tip[2] + 0.018),
            (0.030, 0.075, 0.012), leaf if index % 2 else shadow, root,
            rotation=(math.radians(66), 0, angle),
        )


def item_corn_cob(spec: dict, root) -> None:
    """Husked cob: kernel rows on the ear with two peeled husk leaves and silk."""
    yellow, leaf, shadow = spec["palette"]
    rng = seeded_rng(spec["seed"])
    cob_h = 0.145

    add_cone("corn_cob_body", (0, 0, 0.008), 0.038, 0.030, cob_h, yellow, root, vertices=9)
    add_cone("corn_cob_tip", (0, 0, cob_h * 0.5 + 0.020), 0.030, 0.008, 0.038, yellow, root, vertices=8)
    add_cone("corn_cob_butt", (0, 0, -cob_h * 0.5 - 0.006), 0.038, 0.026, 0.024, shadow, root, vertices=8)
    # Kernel rows: horizontal bands crossed by vertical ribs.
    for index in range(5):
        add_ring(f"corn_row_{index}", (0, 0, -0.052 + index * 0.028), 0.036, 0.006, shadow, root,
                 major_segments=9, minor_segments=4)
    for index in range(3):
        angle = index * math.tau / 3
        add_box(f"corn_rib_{index}", (math.cos(angle) * 0.036, math.sin(angle) * 0.036, 0.005),
                (0.010, 0.010, cob_h * 0.86), shadow, root, rotation=(0, 0, angle), bevel=0.0)

    # Two husk leaves peeled down, still attached at the butt.
    for index, sign in enumerate((-1, 1)):
        add_tri_prism(
            f"corn_husk_{index}", (sign * 0.040, 0.008, -0.030),
            (0.030, 0.048, 0.150), leaf if index == 0 else shadow, root,
            rotation=(rng.uniform(-0.12, 0.12), sign * math.radians(22), sign * 0.5),
        )
    add_cone("corn_silk", (0, 0, cob_h * 0.5 + 0.048), 0.012, 0.026, 0.030, shadow, root, vertices=6)


def item_apple(spec: dict, root) -> None:
    """Apple with the dimpled stem well, a woody stalk, and one leaf on that stalk."""
    red, leaf, wood = spec["palette"]

    add_ico("apple_body", (0, 0, -0.004), (0.058, 0.058, 0.052), red, root, subdivisions=1)
    add_ico("apple_cheek", (0.018, -0.012, 0.002), (0.048, 0.046, 0.044), red, root, subdivisions=1)
    # The pinched wells at top and bottom are what separate an apple from a ball.
    add_cone("apple_stem_well", (0, 0, 0.043), 0.030, 0.014, 0.018, wood, root, vertices=8)
    add_cone("apple_calyx", (0, 0, -0.049), 0.022, 0.008, 0.014, wood, root, vertices=6)
    add_tapered_beam("apple_stalk", (0, 0, 0.046), (0.006, 0.004, 0.075), 0.005, 0.0035, wood, root, vertices=5)
    add_tri_prism("apple_leaf", (0.026, 0.008, 0.070), (0.020, 0.042, 0.008), leaf, root,
                  rotation=(math.radians(72), 0, math.radians(28)))


def item_bread_loaf(spec: dict, root) -> None:
    """Risen cottage loaf: domed crumb, floured top, and three slashed vents."""
    crust, flour, dark = spec["palette"]
    rng = seeded_rng(spec["seed"])

    add_ico("bread_body", (0, 0, -0.012), (0.085, 0.115, 0.055), crust, root, subdivisions=1)
    add_ico("bread_dome", (0, 0, 0.012), (0.072, 0.100, 0.045), crust, root, subdivisions=1)
    # Flat bottom crust: a loaf sits on a board, it does not roll.
    add_box("bread_base", (0, 0, -0.058), (0.155, 0.215, 0.018), dark, root, bevel=0.006)
    add_box("bread_flour_dust", (0, 0, 0.043), (0.115, 0.155, 0.010), flour, root, bevel=0.0)
    # Baker's slashes across the top, angled and evenly spaced.
    for index in range(3):
        add_box(
            f"bread_slash_{index}", (-0.030 + index * 0.030, rng.uniform(-0.008, 0.008), 0.046),
            (0.014, 0.095, 0.014), dark, root, rotation=(0, 0, math.radians(-24)), bevel=0.0,
        )
    add_box("bread_end_crust", (0, 0.104, -0.010), (0.100, 0.018, 0.060), dark, root, bevel=0.006)


def item_pie(spec: dict, root) -> None:
    """Pie in a tin: crimped rim, latticed top, and filling showing through."""
    pastry, filling, glaze, tin = spec["palette"]

    add_cylinder("pie_tin", (0, 0, -0.028), 0.115, 0.024, tin, root, vertices=12, bevel=0.006)
    add_cone("pie_tin_wall", (0, 0, -0.006), 0.112, 0.126, 0.030, tin, root, vertices=12)
    add_cylinder("pie_base_pastry", (0, 0, -0.004), 0.116, 0.026, pastry, root, vertices=12)
    add_cylinder("pie_filling", (0, 0, 0.010), 0.104, 0.018, filling, root, vertices=12)

    # Lattice: two crossing sets of strips, so filling shows between them.
    for index in range(4):
        offset = -0.066 + index * 0.044
        half = math.sqrt(max(0.0001, 0.104 ** 2 - offset ** 2))
        add_box(f"pie_lattice_a_{index}", (offset, 0, 0.020), (0.020, half * 2, 0.012), glaze, root, bevel=0.0)
        add_box(f"pie_lattice_b_{index}", (0, offset, 0.026), (half * 2, 0.020, 0.012), pastry, root, bevel=0.0)
    # Crimped rim: the fluted edge that says "pie" at a glance.
    for index in range(12):
        angle = index * math.tau / 12
        add_ico(
            f"pie_crimp_{index}", (math.cos(angle) * 0.116, math.sin(angle) * 0.116, 0.022),
            (0.024, 0.024, 0.014), pastry, root, rotation=(0, 0, angle),
        )


def item_coin_pouch(spec: dict, root) -> None:
    """Drawstring purse: bulged body, gathered neck, cord ties, and one spilled coin."""
    leather, burlap, brass = spec["palette"]
    rng = seeded_rng(spec["seed"])

    add_ico("pouch_body", (0, 0, -0.055), (0.115, 0.115, 0.100), leather, root, subdivisions=1)
    # Lumps of coin pressing out from the inside.
    for index in range(4):
        angle = index * math.tau / 4 + 0.4
        add_ico(
            f"pouch_bulge_{index}", (math.cos(angle) * 0.070, math.sin(angle) * 0.070, -0.060 + rng.uniform(-0.020, 0.020)),
            (0.052, 0.050, 0.044), leather, root,
        )
    add_cone("pouch_gather", (0, 0, 0.038), 0.098, 0.042, 0.075, leather, root, vertices=9)
    add_ring("pouch_drawstring", (0, 0, 0.062), 0.048, 0.011, burlap, root, major_segments=9, minor_segments=4)
    add_cone("pouch_neck_ruffle", (0, 0, 0.098), 0.040, 0.058, 0.045, leather, root, vertices=9)

    # Two cord tails hanging from the drawstring, not floating beside it.
    for index, sign in enumerate((-1, 1)):
        add_tapered_beam(
            f"pouch_cord_{index}", (sign * 0.045, 0.010, 0.062), (sign * 0.085, 0.038, 0.005),
            0.008, 0.005, burlap, root, vertices=5,
        )
        add_ico(f"pouch_cord_bead_{index}", (sign * 0.088, 0.040, -0.004), (0.014, 0.014, 0.014), brass, root)
    add_cylinder("pouch_spilled_coin", (0.105, -0.060, -0.150), 0.028, 0.008, brass, root, vertices=10)


def item_compass(spec: dict, root) -> None:
    """Hinged pocket compass: open lid, dial, needle, and a lanyard ring."""
    brass, dial, needle, dark = spec["palette"]

    add_cylinder("compass_case", (0, 0, -0.014), 0.024, 0.020, brass, root, vertices=12, bevel=0.004)
    add_ring("compass_case_rim", (0, 0, -0.004), 0.022, 0.005, dark, root, major_segments=12, minor_segments=4)
    add_cylinder("compass_dial", (0, 0, -0.001), 0.019, 0.006, dial, root, vertices=12)
    # Cardinal ticks around the dial: the detail that makes it navigational.
    for index in range(4):
        angle = index * math.tau / 4
        add_box(f"compass_tick_{index}", (math.cos(angle) * 0.014, math.sin(angle) * 0.014, 0.003),
                (0.005, 0.008, 0.004), dark, root, rotation=(0, 0, angle), bevel=0.0)
    # Needle: one red half, one dark half, pivoting on a centre pin.
    add_tri_prism("compass_needle_north", (0, 0.008, 0.006), (0.007, 0.018, 0.004), needle, root,
                  rotation=(0, 0, math.radians(18)))
    add_tri_prism("compass_needle_south", (0, -0.008, 0.006), (0.007, 0.018, 0.004), dark, root,
                  rotation=(0, 0, math.radians(198)))
    add_cylinder("compass_pivot", (0, 0, 0.007), 0.004, 0.006, brass, root, vertices=6)

    # Lid hinged open behind the case, plus the lanyard ring.
    add_cylinder("compass_hinge", (0, 0.026, -0.008), 0.005, 0.022, brass, root, vertices=6,
                 rotation=(0, math.radians(90), 0))
    add_cylinder("compass_lid", (0, 0.040, 0.012), 0.023, 0.007, brass, root, vertices=12,
                 rotation=(math.radians(66), 0, 0), bevel=0.003)
    add_ring("compass_lanyard_ring", (0, -0.030, -0.010), 0.008, 0.003, brass, root, major_segments=8, minor_segments=4,
             rotation=(math.radians(90), 0, 0))


def treasure_chest(spec: dict, root) -> None:
    """Banded chest with a barrel lid propped open on its hinges over a coin pile."""
    dark, wood, brass, iron = spec["palette"]
    rng = seeded_rng(spec["seed"])
    width, depth, body_h = 0.80, 0.48, 0.34

    add_box("chest_plinth", (0, 0, 0.030), (width + 0.03, depth + 0.03, 0.060), iron, root, bevel=0.010)
    add_box("chest_body", (0, 0, 0.060 + body_h * 0.5), (width, depth, body_h), wood, root, bevel=0.012)
    for index, sign in enumerate((-1, 1)):
        add_box(f"chest_corner_post_{index}", (sign * width * 0.5, 0, 0.060 + body_h * 0.5),
                (0.050, depth + 0.02, body_h + 0.02), dark, root, bevel=0.010)
    # Iron bands wrap the body and continue over the lid: one continuous strap.
    for index, sx in enumerate((-width * 0.28, width * 0.28)):
        add_box(f"chest_band_{index}", (sx, 0, 0.060 + body_h * 0.5), (0.045, depth + 0.03, body_h + 0.03), iron, root, bevel=0.0)
    for index, (cx, cy) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        add_box(f"chest_corner_plate_{index}", (cx * width * 0.5, cy * depth * 0.5, 0.085), (0.085, 0.085, 0.055), iron, root, bevel=0.006)

    # Lid stands open, hinged at the back edge, leaning back past vertical.
    lid_pivot_z = 0.060 + body_h
    tilt = math.radians(-108)
    hinge_y = depth * 0.5
    lid_len = 0.30
    lid_cx = 0.0
    lid_cy = hinge_y + math.cos(tilt) * lid_len * 0.5
    lid_cz = lid_pivot_z - math.sin(tilt) * lid_len * 0.5
    add_box("chest_lid", (lid_cx, lid_cy, lid_cz), (width, lid_len, 0.075), wood, root, rotation=(tilt, 0, 0), bevel=0.012)
    add_cylinder("chest_lid_barrel", (0, hinge_y - 0.02, lid_pivot_z + 0.030), 0.055, width, dark, root,
                 vertices=8, rotation=(0, math.radians(90), 0))
    for index, sx in enumerate((-width * 0.28, width * 0.28)):
        add_box(f"chest_lid_band_{index}", (sx, lid_cy, lid_cz + 0.006), (0.045, lid_len + 0.02, 0.090), iron, root,
                rotation=(tilt, 0, 0), bevel=0.0)
    for index, sx in enumerate((-width * 0.30, width * 0.30)):
        add_cylinder(f"chest_hinge_{index}", (sx, hinge_y, lid_pivot_z + 0.030), 0.024, 0.075, brass, root,
                     vertices=6, rotation=(0, math.radians(90), 0))

    add_box("chest_lock_plate", (0, -depth * 0.5 - 0.012, 0.060 + body_h - 0.055), (0.115, 0.024, 0.115), brass, root, bevel=0.008)
    add_cylinder("chest_keyhole", (0, -depth * 0.5 - 0.026, 0.060 + body_h - 0.055), 0.016, 0.014, iron, root, vertices=6,
                 rotation=(math.radians(90), 0, 0))
    add_box("chest_hasp", (0, -depth * 0.5 - 0.018, 0.060 + body_h + 0.010), (0.055, 0.020, 0.060), brass, root, bevel=0.006)

    # Coins heaped inside, mounded above the rim so the chest reads as full.
    add_ico("chest_hoard", (0, 0.0, 0.060 + body_h + 0.010), (width * 0.40, depth * 0.34, 0.105), brass, root)
    for index in range(5):
        add_cylinder(
            f"chest_coin_{index}",
            (rng.uniform(-0.22, 0.22), rng.uniform(-0.12, 0.12), 0.060 + body_h + 0.060),
            0.046, 0.012, brass, root, vertices=8,
            rotation=(rng.uniform(-0.5, 0.5), rng.uniform(-0.5, 0.5), rng.uniform(0, math.pi)),
        )
