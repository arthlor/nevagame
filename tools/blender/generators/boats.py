"""Working rowboat and fishing-skiff generators."""

from __future__ import annotations

import math

from common.geometry import add_beam, add_box, add_collision_box, add_cylinder, add_ico, add_marker, add_ring, add_tri_prism
from common.authored import add_lattice, add_plank_field, add_rope_line


def _hull_half_width(y: float, half_length: float, beam: float, fullness: float = 0.72) -> float:
    normalized = min(1.0, abs(y) / half_length)
    return beam * 0.5 * max(0.12, (1.0 - normalized**1.8) ** fullness)


def _planked_hull(prefix: str, length: float, beam: float, segments: int, levels: int, tokens: tuple[str, str], root) -> None:
    half_length = length * 0.5
    segment_length = length / segments
    for segment in range(segments):
        y = -half_length + segment_length * (segment + 0.5)
        width = _hull_half_width(y, half_length, beam)
        next_width = _hull_half_width(y + segment_length * 0.5, half_length, beam)
        yaw = math.atan2(next_width - width, segment_length * 0.5)
        for side in (-1, 1):
            for level in range(levels):
                z = -0.22 + level * 0.28
                x = side * width * (0.72 + level * 0.12)
                roll = side * math.radians(10 + level * 5)
                add_box(
                    f"{prefix}_plank_{segment:02d}_{'l' if side < 0 else 'r'}_{level}",
                    (x, y, z), (0.16, segment_length + 0.08, 0.34),
                    tokens[(segment + level) % len(tokens)], root,
                    rotation=(roll, 0, -side * yaw), bevel=0.035,
                )
    add_beam(f"{prefix}_keel", (0, -half_length, -0.46), (0, half_length, -0.42), 0.11, tokens[1], root, vertices=7)
    for index in range(segments + 1):
        y = -half_length + index * segment_length
        width = _hull_half_width(y, half_length, beam) * 0.82
        add_beam(f"{prefix}_rib_{index:02d}", (-width, y, -0.28), (width, y, -0.28), 0.06, tokens[1], root, vertices=6)


def rowboat(spec: dict, root) -> None:
    honey, warm, dark = spec["palette"]
    params = spec["parameters"]
    length, beam = params["length"], params["beam"]
    _planked_hull("rowboat", length, beam, params["ribCount"], 3, (honey, warm), root)
    half_length = length * 0.5
    for segment in range(params["innerPlanks"]):
        y = -half_length * 0.82 + segment * length * 0.82 / max(1, params["innerPlanks"] - 1)
        width = _hull_half_width(y, half_length, beam) * 0.74
        for side in (-1, 1):
            add_box(
                f"rowboat_inner_plank_{segment:02d}_{'left' if side < 0 else 'right'}",
                (side * width, y, 0.02), (0.13, length / params["innerPlanks"] * 0.90, 0.42),
                warm if segment % 3 else dark, root,
                rotation=(side * math.radians(18), 0, 0), bevel=0.022,
            )
    for side in (-1, 1):
        points = []
        for index in range(params["gunwaleSegments"] + 1):
            y = -half_length * 0.92 + index * length * 0.92 / params["gunwaleSegments"]
            points.append((side * _hull_half_width(y, half_length, beam) * 0.98, y, 0.52))
        add_rope_line(f"rowboat_gunwale_{'left' if side < 0 else 'right'}", points, 0.07, dark, root, vertices=7)
    add_beam("rowboat_stem", (0, -half_length * 0.98, -0.35), (0, -half_length * 1.02, 0.62), 0.085, dark, root, vertices=7)
    add_beam("rowboat_stern", (0, half_length * 0.98, -0.35), (0, half_length * 1.02, 0.62), 0.085, dark, root, vertices=7)
    for index, y in enumerate((-0.78, 0.18, 0.92)):
        width = _hull_half_width(y, length * 0.5, beam) * 1.55
        add_box(f"rowboat_bench_{index}", (0, y, 0.36), (width, 0.32, 0.10), dark, root, bevel=0.028)
    add_plank_field(
        "rowboat_floorboard", (0, 0.05, -0.12), beam * 0.54, length * 0.58, 0.07,
        (honey, warm), root, count=10, axis="y", bevel=0.014,
    )
    for index, (x, y, angle) in enumerate(((-0.48, 0.12, -0.24), (0.48, 0.12, 0.24))):
        add_beam(
            f"rowboat_oar_{index}", (x, y - 1.1, 0.44), (x + math.sin(angle) * 0.5, y + 1.4, 0.54),
            0.045, warm, root, vertices=7,
        )
        add_box(f"rowboat_oar_blade_{index}", (x + math.sin(angle) * 0.45, y + 1.55, 0.56), (0.25, 0.55, 0.07), warm, root, rotation=(0, 0, angle), bevel=0.025)
        add_ring(f"rowboat_oarlock_{index}", (x, y, 0.57), 0.09, 0.022, dark, root, major_segments=8, minor_segments=4, rotation=(math.pi / 2, 0, 0))
    add_box("rowboat_storage", (0, -1.35, 0.30), (beam * 0.62, 0.65, 0.38), dark, root, bevel=0.045)
    add_marker("boat_rowboat_storage_01", (0, -1.35, 0.52), root, marker_type="storage")
    add_rope_line(
        "rowboat_painter", [(0, -half_length, 0.52), (0.08, -half_length - 0.38, 0.34), (-0.12, -half_length - 0.72, 0.18)],
        0.035, warm, root, vertices=7,
    )
    add_collision_box(f"COL_{spec['id']}", (0, 0, -0.05), (beam * 0.85, length * 0.9, 0.8), root)


def fishing_skiff(spec: dict, root) -> None:
    honey, dark, red, canvas = spec["palette"]
    params = spec["parameters"]
    length, beam = params["length"], params["beam"]
    _planked_hull("skiff", length, beam, params["ribCount"], 4, (honey, dark), root)
    half_length = length * 0.5
    for strake in range(params["outerStrakes"]):
        z = -0.30 + strake * 0.24
        for segment in range(params["hullSegments"]):
            y = -half_length * 0.92 + segment * length * 0.92 / max(1, params["hullSegments"] - 1)
            width = _hull_half_width(y, half_length, beam) * (0.72 + strake * 0.09)
            for side in (-1, 1):
                add_box(
                    f"skiff_strake_{strake:02d}_{segment:02d}_{'left' if side < 0 else 'right'}",
                    (side * width, y, z), (0.12, length / params["hullSegments"] * 0.88, 0.28),
                    honey if (segment + strake) % 4 else dark, root,
                    rotation=(side * math.radians(12 + strake * 3), 0, 0), bevel=0.024,
                )

    deck_count = params["deckBoards"]
    for index in range(deck_count):
        y = -length * 0.43 + index * length * 0.86 / max(1, deck_count - 1)
        width = _hull_half_width(y, length * 0.5, beam) * 1.35
        add_box(f"skiff_deck_{index:02d}", (0, y, 0.58), (width, 0.28, 0.09), honey if index % 4 else dark, root, bevel=0.018)
    add_box("skiff_gunwale_left", (-beam * 0.48, 0, 0.56), (0.16, length * 0.88, 0.16), red, root, bevel=0.025)
    add_box("skiff_gunwale_right", (beam * 0.48, 0, 0.56), (0.16, length * 0.88, 0.16), red, root, bevel=0.025)

    add_box("skiff_hold", (0, 0.62, 0.72), (beam * 0.62, 1.55, 0.44), dark, root, bevel=0.055)
    add_box("skiff_hold_lid_left", (-beam * 0.18, 0.62, 0.98), (beam * 0.30, 1.45, 0.12), honey, root, bevel=0.025)
    add_box("skiff_hold_lid_right", (beam * 0.18, 0.62, 0.98), (beam * 0.30, 1.45, 0.12), honey, root, bevel=0.025)
    for divider_index, divider in enumerate((-0.38, 0.0, 0.38)):
        add_box(f"skiff_hold_divider_{divider_index:02d}", (0, 0.62 + divider, 0.86), (beam * 0.58, 0.08, 0.30), dark, root, bevel=0.012)
        add_box(f"skiff_hold_crossrail_{divider_index:02d}", (0, 0.62 + divider, 1.06), (beam * 0.72, 0.10, 0.10), red, root, bevel=0.012)
    for side, x in (("left", -beam * 0.34), ("right", beam * 0.34)):
        for slat in range(6):
            y = -0.08 + slat * 0.28
            add_box(
                f"skiff_hold_coaming_{side}_{slat:02d}", (x, y, 1.04),
                (0.09, 0.24, 0.26), red if slat in (0, 5) else dark, root, bevel=0.012,
            )
    add_marker("boat_skiff_cargo_01", (-beam * 0.2, 0.62, 1.08), root, marker_type="cargo")
    add_marker("boat_skiff_cargo_02", (beam * 0.2, 0.62, 1.08), root, marker_type="cargo")

    add_box("skiff_console", (0, -0.75, 1.28), (0.88, 0.72, 1.18), dark, root, bevel=0.06)
    add_box("skiff_console_face", (0, -1.13, 1.48), (0.68, 0.08, 0.42), red, root, bevel=0.035)
    add_cylinder("skiff_wheel_hub", (0, -1.20, 1.53), 0.08, 0.14, honey, root, vertices=8, rotation=(math.pi / 2, 0, 0), bevel=0.012)
    add_ring("skiff_wheel_rim", (0, -1.26, 1.53), 0.24, 0.025, honey, root, major_segments=10, minor_segments=4, rotation=(math.pi / 2, 0, 0))
    for index in range(5):
        angle = index * math.tau / 5
        add_beam("skiff_wheel_spoke_%02d" % index, (0, -1.27, 1.53), (math.cos(angle) * 0.22, -1.27, 1.53 + math.sin(angle) * 0.22), 0.018, honey, root, vertices=6)
    add_box("skiff_supply_chest", (0, -2.0, 0.86), (beam * 0.62, 0.82, 0.54), honey, root, bevel=0.045)
    for side, x in (("left", -beam * 0.29), ("right", beam * 0.29)):
        for rail in range(4):
            add_box(
                f"skiff_supply_chest_frame_{side}_{rail:02d}",
                (x, -2.0 + (rail - 1.5) * 0.19, 0.88), (0.075, 0.15, 0.58),
                dark, root, bevel=0.010,
            )

    mast_height = params["mastHeight"]
    add_beam("skiff_mast", (0, 0.0, 0.62), (0, 0.0, mast_height), 0.13, dark, root, vertices=8)
    add_beam("skiff_boom", (0, 0, mast_height * 0.63), (0, 2.35, mast_height * 0.63), 0.085, dark, root, vertices=7)
    add_tri_prism("skiff_sail", (0, 1.05, mast_height * 0.62), (0.14, 3.65, mast_height * 0.58), canvas, root)
    add_box("skiff_sail_stripe", (0.08, 1.2, mast_height * 0.62), (0.05, 2.9, 0.32), red, root, rotation=(0, 0, math.radians(-18)), bevel=0.015)
    for row in range(params["sailRows"]):
        z = mast_height * (0.38 + row * 0.43 / max(1, params["sailRows"] - 1))
        width = max(0.45, 2.90 * (1.0 - row / (params["sailRows"] + 1)))
        add_box(f"skiff_sail_seam_{row:02d}", (0.08, 0.48 + width * 0.38, z), (0.055, width, 0.055), red if row % 3 == 0 else canvas, root, rotation=(0, 0, math.radians(-18)), bevel=0.008)
    for index in range(4):
        add_rope_line(
            f"skiff_rigging_{index:02d}",
            [
                (0, 0, mast_height * (0.35 + index * 0.13)),
                ((-1 if index % 2 else 1) * beam * 0.48, -1.8 + index * 0.75, 0.72),
            ],
            0.025, canvas, root, vertices=6,
        )

    for side, x in (("left", -beam * 0.56), ("right", beam * 0.56)):
        add_beam(f"skiff_hook_rail_{side}", (x, 1.5, 0.72), (x, 2.35, 0.72), 0.055, dark, root, vertices=7)
        add_marker(f"boat_skiff_hook_{side}", (x, 2.35, 0.62), root, marker_type="cargo_hook")
        for fender in range(2):
            y = -0.9 + fender * 1.8
            add_ico(f"skiff_fender_{side}_{fender}", (x, y, 0.35), (0.16, 0.12, 0.30), canvas, root, subdivisions=2)
            add_rope_line(f"skiff_fender_rope_{side}_{fender}", [(x, y, 0.74), (x, y, 0.58)], 0.022, canvas, root, vertices=6)
    add_lattice("skiff_net", (beam * 0.42, 1.55, 1.02), 0.72, 0.92, canvas, root, columns=4, rows=4, depth=0.025, rotation=(0, math.radians(12), 0))
    for index, y in enumerate((-2.10, -1.72, 1.65)):
        add_box(f"skiff_supply_box_{index:02d}", (-0.52 + index * 0.48, y, 0.88), (0.56, 0.52, 0.46), honey if index % 2 else dark, root, bevel=0.028)
    add_collision_box(f"COL_{spec['id']}", (0, 0, -0.02), (beam * 0.88, length * 0.9, 1.05), root)
