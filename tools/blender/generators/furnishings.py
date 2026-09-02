"""Interior case-goods and houseplants for Neva's cottage sets."""

from __future__ import annotations

import math

from common.geometry import add_box, add_cone, add_cylinder, add_ico, add_ring, add_tri_prism, seeded_rng
from common.authored import add_plank_field


def wood_bookcase(spec: dict, root) -> None:
    """Plinth, four shelves in a rebated carcass, cornice, and leaning book runs."""
    wood, dark, red, cream = spec["palette"]
    rng = seeded_rng(spec["seed"])
    width, depth, height = 0.94, 0.34, 1.72

    add_box("bookcase_plinth", (0, 0, 0.055), (width + 0.05, depth + 0.03, 0.11), dark, root, bevel=0.012)
    for index, sign in enumerate((-1, 1)):
        add_box(f"bookcase_side_{index}", (sign * (width * 0.5 - 0.020), 0, height * 0.5 + 0.06),
                (0.040, depth, height - 0.10), wood, root, bevel=0.010)
    add_box("bookcase_back", (0, depth * 0.5 - 0.012, height * 0.5 + 0.06), (width - 0.05, 0.022, height - 0.12), dark, root, bevel=0.006)
    add_box("bookcase_cornice", (0, 0, height + 0.015), (width + 0.07, depth + 0.05, 0.070), dark, root, bevel=0.012)

    shelf_zs = (0.16, 0.55, 0.94, 1.33)
    for index, z in enumerate(shelf_zs):
        add_box(f"bookcase_shelf_{index}", (0, 0, z), (width - 0.08, depth - 0.03, 0.030), wood, root, bevel=0.008)
        # Books: a full run leaning against a shorter stack, never floating.
        run = rng.randint(5, 7)
        x = -width * 0.42
        for book in range(run):
            book_w = rng.uniform(0.035, 0.058)
            book_h = rng.uniform(0.20, 0.29)
            lean = 0.0 if book < run - 1 else rng.uniform(0.16, 0.26)
            token = (red, dark, cream, wood)[(index + book) % 4]
            add_box(
                f"bookcase_book_{index}_{book}",
                (x + book_w * 0.5 + math.sin(lean) * book_h * 0.5, -0.015, z + 0.015 + book_h * 0.5 * math.cos(lean)),
                (book_w, depth - 0.10, book_h), token, root, rotation=(0, lean, 0), bevel=0.0,
            )
            x += book_w * math.cos(lean) + 0.004
        # A couple of volumes laid flat on the remaining shelf run.
        if index % 2 == 0:
            add_box(f"bookcase_stack_{index}", (width * 0.26, -0.015, z + 0.045), (0.20, depth - 0.11, 0.060), cream, root, bevel=0.0)


def wood_sideboard(spec: dict, root) -> None:
    """Two-door sideboard on tapered legs, with brass pulls and a runner on top."""
    wood, dark, brass, cream = spec["palette"]
    width, depth, carcass_h = 1.32, 0.42, 0.56
    leg_h = 0.20

    for index, (sx, sy) in enumerate((
        (-width * 0.44, -depth * 0.34), (width * 0.44, -depth * 0.34),
        (-width * 0.44, depth * 0.34), (width * 0.44, depth * 0.34),
    )):
        add_cone(f"sideboard_leg_{index}", (sx, sy, leg_h * 0.5), 0.038, 0.024, leg_h, dark, root, vertices=6)

    body_z = leg_h + carcass_h * 0.5
    add_box("sideboard_carcass", (0, 0, body_z), (width, depth, carcass_h), wood, root, bevel=0.012)
    add_box("sideboard_top", (0, 0, leg_h + carcass_h + 0.020), (width + 0.06, depth + 0.05, 0.040), dark, root, bevel=0.012)
    add_box("sideboard_rail", (0, 0, leg_h + 0.030), (width - 0.04, depth + 0.01, 0.055), dark, root, bevel=0.010)

    # Two doors with a central stile between them, plus brass pulls at the meeting edges.
    for index, sign in enumerate((-1, 1)):
        add_box(f"sideboard_door_{index}", (sign * width * 0.24, -depth * 0.5 - 0.008, body_z),
                (width * 0.42, 0.022, carcass_h - 0.09), wood, root, bevel=0.008)
        add_box(f"sideboard_door_panel_{index}", (sign * width * 0.24, -depth * 0.5 - 0.020, body_z),
                (width * 0.30, 0.010, carcass_h - 0.19), dark, root, bevel=0.0)
        add_cylinder(f"sideboard_pull_{index}", (sign * 0.045, -depth * 0.5 - 0.032, body_z), 0.016, 0.030, brass, root,
                     vertices=6, rotation=(math.radians(90), 0, 0))
        add_cylinder(f"sideboard_hinge_{index}", (sign * (width * 0.46), -depth * 0.5 - 0.006, body_z), 0.011, carcass_h * 0.4, brass, root, vertices=6)
    add_box("sideboard_stile", (0, -depth * 0.5 - 0.010, body_z), (0.030, 0.026, carcass_h - 0.07), dark, root, bevel=0.006)

    add_box("sideboard_runner", (0, 0.02, leg_h + carcass_h + 0.048), (width * 0.66, depth * 0.52, 0.014), cream, root, bevel=0.0)
    add_cylinder("sideboard_bowl", (-width * 0.22, 0.02, leg_h + carcass_h + 0.078), 0.085, 0.050, brass, root, vertices=10, bevel=0.010)


def floor_plant(spec: dict, root) -> None:
    """Potted houseplant: soil below the rim, arching stems, leaves on those stems."""
    terracotta, leaf, shadow, soil = spec["palette"]
    rng = seeded_rng(spec["seed"])
    pot_h = 0.34

    add_cone("plant_pot_body", (0, 0, pot_h * 0.5 + 0.015), 0.150, 0.205, pot_h, terracotta, root, vertices=10)
    add_cylinder("plant_pot_rim", (0, 0, pot_h + 0.020), 0.218, 0.050, terracotta, root, vertices=10, bevel=0.010)
    add_cylinder("plant_pot_foot", (0, 0, 0.012), 0.160, 0.024, shadow, root, vertices=10, bevel=0.006)
    # Soil sits below the rim, the way a potted plant is actually filled.
    add_cylinder("plant_soil", (0, 0, pot_h + 0.010), 0.190, 0.040, soil, root, vertices=10)

    # Each frond is one arching blade rooted in the soil. add_tri_prism extrudes
    # along its local +Y, and a (rise, 0, yaw) euler sends that axis to
    # (-sin yaw cos rise, cos yaw cos rise, sin rise) — the blade is centred half
    # a length along exactly that vector, so it starts at the soil every time.
    soil_z = pot_h + 0.030
    fronds = (
        (0.00, 66, 0.70), (0.90, 62, 0.62), (1.80, 70, 0.74), (2.69, 60, 0.58),
        (3.59, 68, 0.66), (4.49, 63, 0.60), (5.39, 72, 0.78), (2.20, 80, 0.82),
    )
    for index, (yaw, rise_deg, length) in enumerate(fronds):
        rise = math.radians(rise_deg)
        dx = -math.sin(yaw) * math.cos(rise)
        dy = math.cos(yaw) * math.cos(rise)
        dz = math.sin(rise)
        add_tri_prism(
            f"plant_frond_{index}",
            (dx * length * 0.5, dy * length * 0.5, soil_z + dz * length * 0.5),
            (0.105, length, 0.016), leaf if index % 3 else shadow, root,
            rotation=(rise, 0, yaw),
        )
        # A short shadowed blade tucked under each long one adds depth at the base.
        if index % 2 == 0:
            short = length * 0.46
            add_tri_prism(
                f"plant_frond_inner_{index}",
                (dx * short * 0.5, dy * short * 0.5, soil_z + dz * short * 0.5 + 0.010),
                (0.075, short, 0.014), shadow, root,
                rotation=(rise + rng.uniform(-0.12, 0.12), 0, yaw + rng.uniform(-0.22, 0.22)),
            )


def wood_side_table(spec: dict, root) -> None:
    """Round-top side table on three splayed legs tied by a low stretcher ring."""
    wood, dark, brass = spec["palette"]
    top_h = 0.50
    top_radius = 0.235

    for index in range(3):
        angle = index * math.tau / 3 + 0.4
        splay = 0.11
        add_cone(
            f"table_leg_{index}",
            (math.cos(angle) * splay, math.sin(angle) * splay, top_h * 0.5),
            0.026, 0.017, top_h, dark, root, vertices=6,
            rotation=(math.sin(angle) * 0.13, -math.cos(angle) * 0.13, 0),
        )
        add_cylinder(f"table_foot_{index}", (math.cos(angle) * splay * 1.55, math.sin(angle) * splay * 1.55, 0.012),
                     0.022, 0.024, brass, root, vertices=6)
    # Stretcher ring keeps the splayed legs from spreading under load.
    add_ring("table_stretcher", (0, 0, 0.15), 0.115, 0.014, dark, root, major_segments=9, minor_segments=4)

    add_cylinder("table_apron", (0, 0, top_h - 0.030), top_radius * 0.72, 0.045, dark, root, vertices=10, bevel=0.008)
    add_cylinder("table_top", (0, 0, top_h + 0.012), top_radius, 0.032, wood, root, vertices=12, bevel=0.010)
    add_ring("table_top_edge", (0, 0, top_h + 0.012), top_radius - 0.008, 0.014, dark, root, major_segments=12, minor_segments=4)
