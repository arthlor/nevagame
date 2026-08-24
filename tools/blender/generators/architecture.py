"""Coastal architecture, bridge, and dock generators."""

from __future__ import annotations

import math

from common.geometry import (
    add_beam,
    add_box,
    add_collision_box,
    add_cone,
    add_cylinder,
    add_ico,
    add_marker,
    add_ring,
    add_tri_prism,
)
from common.authored import (
    add_arch_ring,
    add_cylindrical_masonry,
    add_fasteners,
    add_lattice,
    add_masonry_courses,
    add_plank_field,
    add_rope_line,
    add_shingle_rows,
)


def _gable_roof(prefix, width, depth, wall_top, pitch_deg, roof_token, trim_token, root) -> None:
    pitch = math.radians(pitch_deg)
    slope_length = width * 0.57 / math.cos(pitch)
    rise = math.sin(pitch) * slope_length * 0.5
    add_box(
        f"{prefix}_roof_left", (-width * 0.25, 0, wall_top + rise),
        (slope_length, depth + 0.72, 0.28), roof_token, root,
        rotation=(0, -pitch, 0), bevel=0.035,
    )
    add_box(
        f"{prefix}_roof_right", (width * 0.25, 0, wall_top + rise),
        (slope_length, depth + 0.72, 0.28), roof_token, root,
        rotation=(0, pitch, 0), bevel=0.035,
    )
    add_box(f"{prefix}_roof_ridge", (0, 0, wall_top + rise * 2.02), (0.30, depth + 0.88, 0.32), trim_token, root, bevel=0.035)
    add_tri_prism(
        f"{prefix}_gable_front", (0, -depth * 0.5 - 0.02, wall_top + rise * 0.52),
        (width - 0.45, 0.20, rise * 1.55), trim_token, root,
    )
    add_tri_prism(
        f"{prefix}_gable_back", (0, depth * 0.5 + 0.02, wall_top + rise * 0.52),
        (width - 0.45, 0.20, rise * 1.55), trim_token, root,
    )


def _timber_frame(prefix, width, depth, wall_base, wall_height, token, root) -> None:
    z = wall_base + wall_height * 0.5
    for side, y in (("front", -depth * 0.51), ("back", depth * 0.51)):
        for index, x in enumerate((-width * 0.47, -width * 0.24, 0, width * 0.24, width * 0.47)):
            add_box(f"{prefix}_{side}_post_{index:02d}", (x, y, z), (0.20, 0.18, wall_height), token, root, bevel=0.025)
        for index, level in enumerate((wall_base + 0.18, wall_base + wall_height * 0.54, wall_base + wall_height - 0.15)):
            add_box(f"{prefix}_{side}_beam_{index:02d}", (0, y, level), (width, 0.20, 0.20), token, root, bevel=0.025)
    for index, (x, y) in enumerate(((-width * 0.49, 0), (width * 0.49, 0))):
        add_box(
            f"{prefix}_side_post_{index:02d}",
            (x, y, z),
            (0.20, 0.20, wall_height),
            token,
            root,
            bevel=0.025,
        )


def farmhouse(spec: dict, root) -> None:
    params = spec["parameters"]
    stone, plaster, timber, dark, roof = spec["palette"]
    width, depth, wall_height = params["width"], params["depth"], params["wallHeight"]
    add_box("farmhouse_foundation", (0, 0, 0.38), (width + 0.65, depth + 0.62, 0.76), stone, root, bevel=0.08)
    add_masonry_courses(
        "farmhouse_foundation_block", (0, 0, 0.38), width + 0.55, depth + 0.52, 0.72,
        (stone,), root, courses=params["foundationCourses"],
        blocks_per_long_side=params["foundationBlocks"], seed=spec["seed"] + 1,
    )
    add_box("farmhouse_walls", (0, 0, 0.76 + wall_height * 0.5), (width, depth, wall_height), plaster, root, bevel=0.055)
    _timber_frame("farmhouse", width, depth, 0.76, wall_height, timber, root)
    _gable_roof("farmhouse", width, depth, 0.76 + wall_height, params["roofPitchDeg"], roof, dark, root)
    add_shingle_rows(
        "farmhouse_shingle", width, depth, 0.76 + wall_height, params["roofPitchDeg"],
        (roof, dark), root, rows=params["roofRows"], columns=params["roofColumns"], seed=spec["seed"] + 2,
    )

    front_y = -depth * 0.52
    add_box("farmhouse_door", (0, front_y - 0.05, 1.66), (1.25, 0.18, 2.25), dark, root, bevel=0.04)
    for side, x in (("left", -2.05), ("right", 2.05)):
        add_box(f"farmhouse_window_{side}", (x, front_y - 0.07, 2.15), (1.15, 0.15, 1.15), dark, root, bevel=0.03)
        add_box(f"farmhouse_window_{side}_cross_v", (x, front_y - 0.17, 2.15), (0.10, 0.10, 1.0), plaster, root, bevel=0.01)
        add_box(f"farmhouse_window_{side}_cross_h", (x, front_y - 0.18, 2.15), (1.0, 0.10, 0.10), plaster, root, bevel=0.01)
    add_box("farmhouse_porch_deck", (0, front_y - 0.72, 0.92), (4.6, 1.35, 0.22), dark, root, bevel=0.035)
    add_plank_field(
        "farmhouse_porch_plank", (0, front_y - 0.72, 1.055), 4.55, 1.30, 0.08,
        (timber, dark), root, count=params["porchPlanks"], axis="x", seed=spec["seed"] + 3,
    )
    for index, x in enumerate((-2.0, 2.0)):
        add_box(f"farmhouse_porch_post_{index}", (x, front_y - 0.98, 2.05), (0.22, 0.22, 2.25), timber, root, bevel=0.03)
    add_box("farmhouse_porch_canopy", (0, front_y - 0.78, 3.14), (4.7, 1.6, 0.22), roof, root, rotation=(math.radians(8), 0, 0), bevel=0.03)
    for index in range(3):
        add_box(f"farmhouse_step_{index:02d}", (0, front_y - 1.52 - index * 0.20, 0.78 - index * 0.20), (1.75 + index * 0.20, 0.42, 0.18), timber, root, bevel=0.025)
    for side, x in (("left", -2.05), ("right", 2.05)):
        add_box(f"farmhouse_porch_rail_{side}", (x, front_y - 0.72, 1.40), (0.14, 1.22, 0.14), timber, root, bevel=0.02)
        for index in range(3):
            add_box(f"farmhouse_porch_baluster_{side}_{index:02d}", (x, front_y - 1.12 + index * 0.40, 1.23), (0.10, 0.10, 0.62), timber, root, bevel=0.012)
    add_box("farmhouse_bench_seat", (-1.22, front_y - 1.10, 1.32), (1.40, 0.35, 0.14), dark, root, bevel=0.025)
    add_box("farmhouse_bench_back", (-1.22, front_y - 1.28, 1.68), (1.40, 0.12, 0.58), dark, root, bevel=0.025)
    for index, x in enumerate((-1.72, -0.72)):
        add_box(f"farmhouse_bench_leg_{index}", (x, front_y - 1.08, 1.12), (0.12, 0.28, 0.42), timber, root, bevel=0.012)
    add_box("farmhouse_chimney", (2.25, 1.1, 4.55), (0.82, 0.82, 2.85), stone, root, bevel=0.06)
    add_masonry_courses(
        "farmhouse_chimney_block", (2.25, 1.1, 4.55), 0.82, 0.82, 2.74,
        (stone,), root, courses=params["chimneyCourses"], blocks_per_long_side=3,
        seed=spec["seed"] + 4, block_depth=0.14, bevel=0.018,
    )
    add_box("farmhouse_lantern_frame", (0.72, front_y - 1.04, 2.32), (0.30, 0.30, 0.46), dark, root, bevel=0.018)
    add_ico("farmhouse_lantern_glow", (0.72, front_y - 1.04, 2.32), (0.10, 0.10, 0.16), plaster, root, subdivisions=2)
    add_collision_box(f"COL_{spec['id']}", (0, 0, 2.1), (width, depth, 4.2), root)


def fish_market(spec: dict, root) -> None:
    params = spec["parameters"]
    stone, timber, roof, teal, canvas = spec["palette"]
    width, depth, wall_height = params["width"], params["depth"], params["wallHeight"]
    add_box("fish_market_foundation", (0, 0, 0.38), (width + 0.65, depth + 0.6, 0.76), stone, root, bevel=0.08)
    add_masonry_courses(
        "fish_market_foundation_block", (0, 0, 0.38), width + 0.55, depth + 0.50, 0.72,
        (stone,), root, courses=params["foundationCourses"], blocks_per_long_side=params["foundationBlocks"],
        seed=spec["seed"] + 1,
    )
    add_box("fish_market_body", (0, 0, 0.76 + wall_height * 0.5), (width, depth, wall_height), timber, root, bevel=0.06)
    _timber_frame("fish_market", width, depth, 0.76, wall_height, timber, root)
    _gable_roof("fish_market", width, depth, 0.76 + wall_height, params["roofPitchDeg"], roof, timber, root)
    add_shingle_rows(
        "fish_market_shingle", width, depth, 0.76 + wall_height, params["roofPitchDeg"],
        (roof, timber), root, rows=params["roofRows"], columns=params["roofColumns"], seed=spec["seed"] + 2,
    )

    front_y = -depth * 0.52
    add_box("fish_market_counter", (0, front_y - 0.38, 1.45), (5.0, 0.68, 0.86), teal, root, bevel=0.04)
    add_plank_field(
        "fish_market_counter_board", (0, front_y - 0.74, 1.91), 4.95, 0.68, 0.10,
        (timber, teal), root, count=params["counterSlats"], axis="x", seed=spec["seed"] + 3,
    )
    for index, x in enumerate((-2.35, 2.35)):
        add_box(f"fish_market_awning_post_{index}", (x, front_y - 0.88, 2.35), (0.22, 0.22, 2.9), timber, root, bevel=0.025)
    add_box("fish_market_awning", (0, front_y - 0.92, 3.72), (5.7, 1.75, 0.20), canvas, root, rotation=(math.radians(12), 0, 0), bevel=0.02)
    for index, x in enumerate((-1.9, 0, 1.9)):
        add_box(f"fish_market_awning_stripe_{index}", (x, front_y - 0.95, 3.75), (0.42, 1.78, 0.07), roof, root, rotation=(math.radians(12), 0, 0), bevel=0.01)
    for index, x in enumerate((-1.45, 1.45)):
        add_box(f"fish_market_loading_door_{index}", (x, front_y - 0.12, 2.15), (2.25, 0.18, 2.65), teal, root, bevel=0.035)
        for slat in range(5):
            add_box(f"fish_market_loading_door_{index}_slat_{slat:02d}", (x, front_y - 0.24, 1.12 + slat * 0.52), (2.05, 0.08, 0.12), timber, root, bevel=0.012)
    for index, x in enumerate((-2.35, -0.78, 0.78, 2.35)):
        add_box(f"fish_market_display_crate_{index:02d}", (x, front_y - 0.86, 1.35), (1.18, 0.72, 0.42), timber if index % 2 else teal, root, bevel=0.025)
        for slat in range(3):
            add_box(f"fish_market_display_crate_{index:02d}_slat_{slat:02d}", (x, front_y - 1.24, 1.24 + slat * 0.15), (1.08, 0.06, 0.08), stone, root, bevel=0.008)
    add_box("fish_market_sign_arm", (width * 0.56, front_y - 0.35, 4.1), (1.45, 0.16, 0.16), timber, root, bevel=0.02)
    add_beam("fish_market_sign_chain", (width * 0.62, front_y - 0.35, 4.1), (width * 0.62, front_y - 0.35, 3.25), 0.045, timber, root, vertices=6)
    add_ico("fish_market_sign_body", (width * 0.62, front_y - 0.35, 2.94), (0.65, 0.12, 0.30), teal, root, subdivisions=2)
    add_tri_prism("fish_market_sign_tail", (width * 0.72, front_y - 0.35, 2.94), (0.52, 0.20, 0.62), teal, root, rotation=(0, math.pi / 2, 0))
    add_collision_box(f"COL_{spec['id']}", (0, 0, 2.2), (width, depth, 4.4), root)


def lighthouse(spec: dict, root) -> None:
    params = spec["parameters"]
    stone, plaster, red, brass, glow = spec["palette"]
    sides, height, base_radius = params["sides"], params["height"], params["baseRadius"]
    add_cylinder("lighthouse_foundation", (0, 0, 0.6), base_radius, 1.2, stone, root, vertices=sides, bevel=0.05)
    band_count = 7
    band_height = (height - 3.1) / band_count
    for index in range(band_count):
        progress = index / band_count
        radius1 = base_radius * (0.88 - progress * 0.35)
        radius2 = base_radius * (0.88 - (progress + 1 / band_count) * 0.35)
        token = plaster if index % 2 == 0 else red
        add_cone(
            f"lighthouse_tower_band_{index:02d}",
            (0, 0, 1.2 + band_height * (index + 0.5)),
            radius1, radius2, band_height + 0.025, token, root, vertices=sides,
        )
    add_cylindrical_masonry(
        "lighthouse_masonry", 1.20, height - 3.15, base_radius * 0.88, base_radius * 0.54,
        (plaster, red), root, courses=params["masonryCourses"], blocks_per_course=params["blocksPerCourse"],
        seed=spec["seed"] + 1, block_depth=0.18,
    )
    for index, z in enumerate((2.05, 4.55, 7.05)):
        window_y = -base_radius * (0.88 - z / height * 0.34) - 0.10
        add_box(f"lighthouse_window_{index:02d}", (0, window_y, z), (0.62, 0.18, 0.82), brass, root, bevel=0.025)
        add_box(f"lighthouse_window_{index:02d}_pane", (0, window_y - 0.10, z), (0.36, 0.08, 0.54), glow, root, bevel=0.015)
        for frame, (x, frame_z, frame_width, frame_height) in enumerate((
            (-0.34, z, 0.10, 0.96), (0.34, z, 0.10, 0.96),
            (0, z - 0.45, 0.78, 0.10), (0, z + 0.45, 0.78, 0.10),
        )):
            add_box(
                f"lighthouse_window_{index:02d}_frame_{frame:02d}",
                (x, window_y - 0.04, frame_z), (frame_width, 0.16, frame_height),
                stone, root, bevel=0.012,
            )
    add_box("lighthouse_entry", (0, -base_radius * 0.91, 1.35), (1.05, 0.20, 1.95), red, root, bevel=0.035)
    entry_y = -base_radius * 0.91 - 0.05
    add_box("lighthouse_entry_frame_left", (-0.61, entry_y, 1.37), (0.13, 0.22, 2.18), stone, root, bevel=0.015)
    add_box("lighthouse_entry_frame_right", (0.61, entry_y, 1.37), (0.13, 0.22, 2.18), stone, root, bevel=0.015)
    add_box("lighthouse_entry_lintel", (0, entry_y, 2.43), (1.35, 0.22, 0.16), stone, root, bevel=0.015)
    deck_z = height - 1.72
    add_ring(
        "lighthouse_stone_trim",
        (0, 0, deck_z - 0.72),
        1.18,
        0.055,
        stone,
        root,
        major_segments=sides,
        minor_segments=4,
    )
    add_cylinder("lighthouse_balcony", (0, 0, deck_z), 1.65, 0.22, stone, root, vertices=sides, bevel=0.025)
    for index in range(sides):
        angle = index * math.tau / sides
        add_tri_prism(
            f"lighthouse_balcony_bracket_{index:02d}",
            (math.cos(angle) * 1.28, math.sin(angle) * 1.28, deck_z - 0.30),
            (0.20, 0.52, 0.62), stone, root, rotation=(math.pi / 2, 0, angle),
        )
    for index in range(sides):
        angle = index * math.tau / sides
        x, y = math.cos(angle) * 1.45, math.sin(angle) * 1.45
        add_cylinder(f"lighthouse_rail_post_{index:02d}", (x, y, deck_z + 0.42), 0.035, 0.82, brass, root, vertices=6)
    add_ring("lighthouse_rail_top", (0, 0, deck_z + 0.82), 1.45, 0.035, brass, root, major_segments=sides, minor_segments=4)
    add_cylinder("lighthouse_lantern_room", (0, 0, deck_z + 0.92), 0.92, 1.35, glow, root, vertices=sides)
    for index in range(sides):
        angle = index * math.tau / sides
        add_cylinder(f"lighthouse_lantern_frame_{index:02d}", (math.cos(angle) * 0.9, math.sin(angle) * 0.9, deck_z + 0.92), 0.025, 1.36, brass, root, vertices=5)
        next_angle = (index + 1) * math.tau / sides
        add_beam(
            f"lighthouse_lantern_brace_{index:02d}",
            (math.cos(angle) * 0.9, math.sin(angle) * 0.9, deck_z + 0.34),
            (math.cos(next_angle) * 0.9, math.sin(next_angle) * 0.9, deck_z + 1.50),
            0.018, brass, root, vertices=6,
        )
    add_cone("lighthouse_roof", (0, 0, height - 0.25), 1.15, 0.08, 1.3, red, root, vertices=sides)
    add_cylinder("lighthouse_spire", (0, 0, height + 0.48), 0.04, 0.55, brass, root, vertices=6)
    add_collision_box(f"COL_{spec['id']}", (0, 0, height * 0.42), (base_radius * 1.6, base_radius * 1.6, height * 0.84), root)


def windmill(spec: dict, root) -> None:
    params = spec["parameters"]
    stone, timber, turf, canvas = spec["palette"]
    height, radius, sides = params["height"], params["baseRadius"], params["sides"]
    add_cone("windmill_tower", (0, 0, height * 0.42), radius, radius * 0.68, height * 0.84, stone, root, vertices=sides)
    add_cylindrical_masonry(
        "windmill_masonry", 0.10, height * 0.82, radius * 0.98, radius * 0.70,
        (stone,), root, courses=params["masonryCourses"], blocks_per_course=params["blocksPerCourse"],
        seed=spec["seed"] + 1, block_depth=0.20,
    )
    add_cone("windmill_roof", (0, 0, height + 0.45), radius * 0.82, 0.08, 1.75, turf, root, vertices=sides)
    for index in range(5):
        progress = (index + 1) / 6
        z = height * 0.12 + progress * height * 0.68
        band_radius = radius * (1.0 - progress * 0.28)
        add_ring(
            f"windmill_timber_band_{index:02d}",
            (0, 0, z),
            band_radius,
            0.045,
            timber,
            root,
            major_segments=sides,
            minor_segments=4,
        )
    add_box("windmill_door", (0, -radius - 0.04, 1.45), (1.15, 0.18, 2.25), timber, root, bevel=0.04)
    for index, x in enumerate((-0.72, 0.72)):
        add_box(
            f"windmill_door_trim_{index}",
            (x, -radius - 0.10, 1.48),
            (0.16, 0.14, 2.45),
            timber,
            root,
            bevel=0.025,
        )
    for index, z in enumerate((2.7, 4.5)):
        add_box(f"windmill_window_{index}", (0, -radius * 0.83, z), (0.75, 0.14, 0.9), timber, root, bevel=0.03)
    rotor = add_marker("windmill_rotor", (0, 0, 0), root, marker_type="animation_pivot")
    rotor["pivot"] = [0, -radius - 0.22, height * 0.78]
    hub = (0, -radius - 0.24, height * 0.78)
    add_cylinder("windmill_hub", hub, 0.32, 0.52, timber, root, vertices=10, rotation=(math.pi / 2, 0, 0), bevel=0.025)
    for index in range(4):
        angle = index * math.pi / 2
        direction = (math.cos(angle), 0, math.sin(angle))
        end = (direction[0] * 3.6, hub[1], hub[2] + direction[2] * 3.6)
        add_beam(f"windmill_spar_{index}", hub, end, 0.105, timber, root, vertices=6)
        center = (direction[0] * 2.15, hub[1] - 0.05, hub[2] + direction[2] * 2.15)
        add_box(
            f"windmill_sail_{index}", center, (0.86, 0.10, 2.7), canvas, root,
            rotation=(0, angle, angle), bevel=0.018,
        )
        for batten in range(params["sailBattens"]):
            distance = 0.85 + batten * 2.35 / max(1, params["sailBattens"] - 1)
            center = (direction[0] * distance, hub[1] - 0.12, hub[2] + direction[2] * distance)
            add_box(
                f"windmill_sail_batten_{index}_{batten:02d}", center,
                (0.78, 0.08, 0.10), timber, root,
                rotation=(0, angle, angle), bevel=0.012,
            )
    add_collision_box(f"COL_{spec['id']}", (0, 0, height * 0.42), (radius * 1.7, radius * 1.7, height * 0.84), root)


def stone_bridge(spec: dict, root) -> None:
    params = spec["parameters"]
    stone, shadow, timber = spec["palette"]
    length, width = params["length"], params["width"]
    deck_segments = params["deckSegments"]
    segment_length = length / deck_segments
    for index in range(deck_segments):
        x = -length * 0.5 + segment_length * (index + 0.5)
        crown = 0.82 * (1.0 - (x / (length * 0.5)) ** 2)
        slope = math.atan((-3.28 * x) / (length * length))
        add_box(
            f"bridge_deck_{index:02d}", (x, 0, 2.05 + crown),
            (segment_length + 0.08, width, 0.58), stone if index % 4 else shadow, root,
            rotation=(0, slope, 0), bevel=0.045,
        )
        for lane in range(params["cobbleLanes"]):
            y = -width * 0.39 + lane * width * 0.78 / max(1, params["cobbleLanes"] - 1)
            add_box(
                f"bridge_cobble_{index:02d}_{lane:02d}",
                (x, y, 2.39 + crown),
                (segment_length * 0.82, width * 0.16, 0.16),
                stone if (index + lane) % 3 else shadow, root,
                rotation=(0, slope, math.radians((index + lane) % 2 * 2 - 1)), bevel=0.022,
            )
    pier_x = (-length * 0.40, 0, length * 0.40)
    for index, x in enumerate(pier_x):
        add_box(f"bridge_pier_{index}", (x, 0, 0.95), (1.35, width + 0.16, 1.9), shadow, root, bevel=0.08)
        add_box(f"bridge_pier_cap_{index}", (x, 0, 1.92), (1.65, width + 0.32, 0.28), stone, root, bevel=0.05)
    for side, x in (("left", -length * 0.47), ("right", length * 0.47)):
        add_masonry_courses(
            f"bridge_abutment_{side}", (x, 0, 1.25), length * 0.075, width + 0.10, 2.45,
            (stone, shadow), root, courses=params["abutmentCourses"], blocks_per_long_side=3,
            seed=spec["seed"] + (1 if side == "left" else 2), block_depth=0.18,
        )
    for arch_index, center_x in enumerate((-length * 0.20, length * 0.20)):
        for face_index, y in enumerate((-width * 0.50, width * 0.50)):
            add_arch_ring(
                f"bridge_voussoir_{arch_index}_{face_index}", center_x, y, length * 0.158,
                stone, shadow, root, blocks=params["voussoirBlocks"], block_depth=0.36, block_size=0.48,
                start_deg=params["voussoirStartDeg"], end_deg=params["voussoirEndDeg"],
            )
    for side_index, y in enumerate((-width * 0.49, width * 0.49)):
        add_box(f"bridge_rail_top_{side_index}", (0, y, 3.45), (length + 0.3, 0.17, 0.17), timber, root, bevel=0.025)
        add_box(f"bridge_rail_mid_{side_index}", (0, y, 3.0), (length + 0.1, 0.13, 0.13), timber, root, bevel=0.02)
        for post_index in range(8):
            x = -length * 0.47 + post_index * length * 0.94 / 7
            crown = 0.82 * (1.0 - (x / (length * 0.5)) ** 2)
            add_box(f"bridge_rail_post_{side_index}_{post_index:02d}", (x, y, 2.72 + crown), (0.20, 0.20, 1.25), timber, root, bevel=0.025)
    add_collision_box(f"COL_{spec['id']}", (0, 0, 2.25), (length, width, 0.85), root)


def working_dock(spec: dict, root) -> None:
    params = spec["parameters"]
    honey, weathered, red, canvas = spec["palette"]
    length, width, planks = params["length"], params["width"], params["planks"]
    add_plank_field(
        "dock_surface_board", (0, 0, 1.56), length, width, 0.10,
        (honey, weathered), root, count=params["surfaceBoards"], axis="x", seed=spec["seed"] + 1,
    )
    plank_length = length / planks
    for index in range(planks):
        x = -length * 0.5 + plank_length * (index + 0.5)
        offset = math.sin(index * 1.77) * 0.025
        add_box(f"dock_plank_{index:02d}", (x, offset, 1.42), (plank_length - 0.025, width, 0.18), honey if index % 4 else weathered, root, bevel=0.018)
    for index, x in enumerate((-length * 0.46, -length * 0.15, length * 0.16, length * 0.46)):
        for side, y in enumerate((-width * 0.46, width * 0.46)):
            add_cylinder(f"dock_piling_{index}_{side}", (x, y, 0.75), 0.20, 1.5, weathered, root, vertices=7)
            add_box(f"dock_piling_foot_{index}_{side}", (x, y, 0.08), (0.62, 0.62, 0.16), weathered, root, bevel=0.05)
            add_box(f"dock_piling_cap_{index}_{side}", (x, y, 1.58), (0.48, 0.48, 0.20), honey, root, bevel=0.035)
            for collar, z in enumerate((0.34, 1.24)):
                add_ring(
                    f"dock_piling_collar_{index}_{side}_{collar}", (x, y, z), 0.22, 0.025,
                    weathered, root, major_segments=8, minor_segments=4,
                )
    for index in range(params["underBeams"]):
        x = -length * 0.46 + index * length * 0.92 / max(1, params["underBeams"] - 1)
        add_box(f"dock_underbeam_{index:02d}", (x, 0, 1.28), (0.18, width + 0.22, 0.24), weathered, root, bevel=0.018)
    for index, x in enumerate((-length * 0.44, length * 0.44)):
        for side, y in enumerate((-width * 0.42, width * 0.42)):
            add_beam(f"dock_crossbrace_{index}_{side}_a", (x - 0.7, y, 0.28), (x + 0.7, y, 1.28), 0.07, weathered, root, vertices=6)
            add_beam(f"dock_crossbrace_{index}_{side}_b", (x + 0.7, y, 0.28), (x - 0.7, y, 1.28), 0.07, weathered, root, vertices=6)
    add_box("dock_counter", (0.8, 0, 1.92), (2.8, 1.35, 0.82), honey, root, bevel=0.035)
    add_plank_field(
        "dock_counter_slat", (0.8, -0.70, 1.94), 2.72, 0.10, 0.72,
        (honey, weathered), root, count=params["counterSlats"], axis="x", seed=spec["seed"] + 2,
    )
    add_plank_field(
        "dock_counter_shelf", (0.8, 0, 1.55), 2.56, 1.04, 0.09,
        (weathered, honey), root, count=18, axis="x", seed=spec["seed"] + 3,
    )
    for index, (x, y) in enumerate((( -1.0, -1.2), (-1.0, 1.2), (2.6, -1.2), (2.6, 1.2))):
        add_cylinder(f"dock_canopy_post_{index}", (x, y, 2.65), 0.075, 2.5, weathered, root, vertices=6)
    canopy_pitch = math.radians(14)
    for side, x in (("left", -0.22), ("right", 1.82)):
        slope = canopy_pitch if side == "left" else -canopy_pitch
        add_box(
            f"dock_canopy_{side}", (x, 0, 4.04), (2.18, 3.0, 0.16), red, root,
            rotation=(0, slope, 0), bevel=0.018,
        )
        for index, y in enumerate((-1.0, 0, 1.0)):
            add_box(
                f"dock_canopy_stripe_{side}_{index}", (x, y, 4.08),
                (1.76, 0.30, 0.07), canvas, root,
                rotation=(0, slope, 0), bevel=0.01,
            )
    add_box("dock_canopy_ridge", (0.8, 0, 4.34), (0.20, 3.12, 0.20), weathered, root, bevel=0.02)
    for index, x in enumerate((-length * 0.42, length * 0.42)):
        add_ring(f"dock_cleat_{index}", (x, -width * 0.42, 1.64), 0.13, 0.035, weathered, root, major_segments=8, minor_segments=4, rotation=(math.pi / 2, 0, 0))
    for side, x in (("left", -length * 0.28), ("right", length * 0.28)):
        for rung in range(5):
            add_box(f"dock_ladder_{side}_rung_{rung:02d}", (x, -width * 0.53, 0.30 + rung * 0.27), (0.62, 0.10, 0.08), weathered, root, bevel=0.01)
        for rail, rail_x in enumerate((x - 0.34, x + 0.34)):
            add_box(f"dock_ladder_{side}_rail_{rail}", (rail_x, -width * 0.53, 0.84), (0.10, 0.10, 1.45), weathered, root, bevel=0.012)
    add_rope_line(
        "dock_mooring_rope", [(-length * 0.42, -width * 0.45, 1.74), (-length * 0.18, -width * 0.56, 1.40), (0.10, -width * 0.48, 1.62)],
        0.045, canvas, root, vertices=7,
    )
    add_collision_box(f"COL_{spec['id']}", (0, 0, 1.42), (length, width, 0.32), root)
