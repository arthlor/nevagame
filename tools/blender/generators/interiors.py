"""Cozy farmhouse interior architecture and furniture prop generators."""

from __future__ import annotations

import math

from common.geometry import (
    add_beam,
    add_box,
    add_collision_primitives,
    add_cylinder,
    add_ico,
    add_ring,
    seeded_rng,
)
from common.authored import (
    add_masonry_courses,
    add_plank_field,
    add_profiled_vessel,
)


def _add_inner_stone_band(
    prefix: str,
    center: tuple[float, float, float],
    span: float,
    height: float,
    token: str,
    root,
    *,
    axis: str,
    blocks: int,
    courses: int,
    seed: int,
) -> None:
    """Staggered interior plinth blocks that respect doorway/opening segments."""
    rng = seeded_rng(seed)
    cx, cy, cz = center
    course_h = height / courses
    block_span = span / blocks
    for course in range(courses):
        offset = block_span * 0.5 if course % 2 else 0.0
        for index in range(blocks):
            along = -span * 0.5 + block_span * (index + 0.5) + offset
            if along > span * 0.5 - block_span * 0.25:
                along -= span
            z = cz - height * 0.5 + course_h * (course + 0.5) + rng.uniform(-0.012, 0.012)
            if axis == "x":
                location = (cx + along, cy, z)
                dimensions = (block_span * 0.90, 0.12, course_h * 0.84)
                rotation = (0, rng.uniform(-0.010, 0.010), rng.uniform(-0.014, 0.014))
            else:
                location = (cx, cy + along, z)
                dimensions = (0.12, block_span * 0.90, course_h * 0.84)
                rotation = (rng.uniform(-0.010, 0.010), 0, rng.uniform(-0.014, 0.014))
            add_box(
                f"{prefix}_{course:02d}_{index:02d}",
                location,
                dimensions,
                token,
                root,
                rotation=rotation,
                bevel=0.012,
            )


def interior_farmhouse_shell(spec: dict, root) -> None:
    """Authored low-poly farmhouse interior room shell with timber frame, plank floor, and window/door openings."""
    params = spec["parameters"]
    stone, plaster, timber, dark_wood, emissive_win = spec["palette"]
    width = params["width"]
    depth = params["depth"]
    wall_height = params["wallHeight"]

    # 1. Sturdy Timber Plank Floor
    add_box(
        "interior_floor_base",
        (0, 0, 0.08),
        (width + 0.3, depth + 0.3, 0.16),
        dark_wood,
        root,
        bevel=0.02,
    )
    add_plank_field(
        "interior_floor_plank",
        (0, 0, 0.17),
        width,
        depth,
        0.04,
        (timber,),
        root,
        count=params["floorPlanks"],
        axis="x",
        seed=spec["seed"] + 1,
    )

    # 2. Baseboards along walls
    base_h = 0.22
    base_t = 0.10
    add_box("baseboard_back", (0, depth * 0.5 - base_t * 0.5, 0.28), (width - 0.2, base_t, base_h), dark_wood, root, bevel=0.015)
    add_box("baseboard_left", (-width * 0.5 + base_t * 0.5, 0, 0.28), (base_t, depth - 0.2, base_h), dark_wood, root, bevel=0.015)
    add_box("baseboard_right", (width * 0.5 - base_t * 0.5, 0, 0.28), (base_t, depth - 0.2, base_h), dark_wood, root, bevel=0.015)
    # Front baseboards (leaving doorway open at x=0)
    door_w = 1.3
    front_half_w = (width - door_w) * 0.5
    add_box("baseboard_front_left", (-(door_w * 0.5 + front_half_w * 0.5), -depth * 0.5 + base_t * 0.5, 0.28), (front_half_w, base_t, base_h), dark_wood, root, bevel=0.015)
    add_box("baseboard_front_right", (door_w * 0.5 + front_half_w * 0.5, -depth * 0.5 + base_t * 0.5, 0.28), (front_half_w, base_t, base_h), dark_wood, root, bevel=0.015)

    # 3. Walls (Plaster with timber posts)
    wall_t = 0.18
    half_w = width * 0.5
    half_d = depth * 0.5

    # Back Wall (contains fireplace opening)
    hearth_w = 2.4
    back_side_w = (width - hearth_w) * 0.5
    add_box("wall_back_left", (-(hearth_w * 0.5 + back_side_w * 0.5), half_d, wall_height * 0.5 + 0.18), (back_side_w, wall_t, wall_height), plaster, root, bevel=0.03)
    add_box("wall_back_right", (hearth_w * 0.5 + back_side_w * 0.5, half_d, wall_height * 0.5 + 0.18), (back_side_w, wall_t, wall_height), plaster, root, bevel=0.03)
    add_box("wall_back_hearth_top", (0, half_d, wall_height - 0.35), (hearth_w + 0.1, wall_t, 0.7), plaster, root, bevel=0.03)
    # Stone surround around hearth opening
    add_box("wall_back_hearth_stone_top", (0, half_d - 0.04, 2.5), (hearth_w + 0.08, 0.12, 0.22), stone, root, bevel=0.025)
    add_box("wall_back_hearth_stone_l", (-hearth_w * 0.5, half_d - 0.04, 1.25), (0.16, 0.12, 2.5), stone, root, bevel=0.025)
    add_box("wall_back_hearth_stone_r", (hearth_w * 0.5, half_d - 0.04, 1.25), (0.16, 0.12, 2.5), stone, root, bevel=0.025)

    # Left Wall (contains cozy window)
    win_w = 1.4
    win_h = 1.2
    win_z = 1.7
    side_part_d = (depth - win_w) * 0.5
    add_box("wall_left_front", (-half_w, -half_d + side_part_d * 0.5, wall_height * 0.5 + 0.18), (wall_t, side_part_d, wall_height), plaster, root, bevel=0.03)
    add_box("wall_left_back", (-half_w, half_d - side_part_d * 0.5, wall_height * 0.5 + 0.18), (wall_t, side_part_d, wall_height), plaster, root, bevel=0.03)
    add_box("wall_left_win_bottom", (-half_w, 0, (win_z - win_h * 0.5) * 0.5 + 0.09), (wall_t, win_w, win_z - win_h * 0.5), plaster, root, bevel=0.02)
    add_box("wall_left_win_top", (-half_w, 0, win_z + win_h * 0.5 + (wall_height - (win_z + win_h * 0.5)) * 0.5 + 0.18), (wall_t, win_w, wall_height - (win_z + win_h * 0.5)), plaster, root, bevel=0.02)

    # Window Frame & Emissive Glass on Left Wall
    add_box("window_left_frame_h_bot", (-half_w, 0, win_z - win_h * 0.5), (wall_t + 0.08, win_w + 0.12, 0.08), dark_wood, root, bevel=0.015)
    add_box("window_left_frame_h_top", (-half_w, 0, win_z + win_h * 0.5), (wall_t + 0.08, win_w + 0.12, 0.08), dark_wood, root, bevel=0.015)
    add_box("window_left_frame_v_left", (-half_w, -win_w * 0.5, win_z), (wall_t + 0.08, 0.08, win_h), dark_wood, root, bevel=0.015)
    add_box("window_left_frame_v_right", (-half_w, win_w * 0.5, win_z), (wall_t + 0.08, 0.08, win_h), dark_wood, root, bevel=0.015)
    add_box("window_left_mullion_v", (-half_w, 0, win_z), (wall_t + 0.04, 0.06, win_h - 0.06), timber, root, bevel=0.01)
    add_box("window_left_mullion_h", (-half_w, 0, win_z), (wall_t + 0.04, win_w - 0.06, 0.06), timber, root, bevel=0.01)
    add_box("window_left_glass", (-half_w, 0, win_z), (0.04, win_w - 0.08, win_h - 0.08), emissive_win, root, bevel=0.01)

    # Right Wall (solid cozy wall with timber framing)
    add_box("wall_right", (half_w, 0, wall_height * 0.5 + 0.18), (wall_t, depth, wall_height), plaster, root, bevel=0.03)

    # Front Wall (Doorway in center)
    door_h = 2.25
    add_box("wall_front_left", (-(door_w * 0.5 + front_half_w * 0.5), -half_d, wall_height * 0.5 + 0.18), (front_half_w, wall_t, wall_height), plaster, root, bevel=0.03)
    add_box("wall_front_right", (door_w * 0.5 + front_half_w * 0.5, -half_d, wall_height * 0.5 + 0.18), (front_half_w, wall_t, wall_height), plaster, root, bevel=0.03)
    add_box("wall_front_door_top", (0, -half_d, door_h + (wall_height - door_h) * 0.5 + 0.18), (door_w + 0.1, wall_t, wall_height - door_h), plaster, root, bevel=0.03)

    # Door Frame at Front Wall
    add_box("door_frame_post_left", (-door_w * 0.5, -half_d, door_h * 0.5 + 0.18), (wall_t + 0.06, 0.12, door_h), dark_wood, root, bevel=0.02)
    add_box("door_frame_post_right", (door_w * 0.5, -half_d, door_h * 0.5 + 0.18), (wall_t + 0.06, 0.12, door_h), dark_wood, root, bevel=0.02)
    add_box("door_frame_lintel", (0, -half_d, door_h + 0.22), (door_w + 0.16, wall_t + 0.06, 0.12), dark_wood, root, bevel=0.02)
    add_box("door_threshold_step", (0, -half_d, 0.18), (door_w + 0.1, wall_t + 0.12, 0.06), timber, root, bevel=0.015)

    # A continuous but doorway-aware masonry wainscot carries the exterior
    # farmhouse plinth language inside and gives the shell real contact weight.
    stone_band_h = 0.58
    stone_band_z = 0.18 + stone_band_h * 0.5
    _add_inner_stone_band("interior_stone_back", (0, half_d - 0.12, stone_band_z), width - 0.34, stone_band_h, stone, root, axis="x", blocks=10, courses=3, seed=spec["seed"] + 11)
    _add_inner_stone_band("interior_stone_left", (-half_w + 0.12, 0, stone_band_z), depth - 0.34, stone_band_h, stone, root, axis="y", blocks=8, courses=3, seed=spec["seed"] + 17)
    _add_inner_stone_band("interior_stone_right", (half_w - 0.12, 0, stone_band_z), depth - 0.34, stone_band_h, stone, root, axis="y", blocks=8, courses=3, seed=spec["seed"] + 23)
    front_segment_span = max(0.6, front_half_w - 0.12)
    _add_inner_stone_band("interior_stone_front_left", (-(door_w * 0.5 + front_half_w * 0.5), -half_d + 0.12, stone_band_z), front_segment_span, stone_band_h, stone, root, axis="x", blocks=4, courses=3, seed=spec["seed"] + 29)
    _add_inner_stone_band("interior_stone_front_right", (door_w * 0.5 + front_half_w * 0.5, -half_d + 0.12, stone_band_z), front_segment_span, stone_band_h, stone, root, axis="x", blocks=4, courses=3, seed=spec["seed"] + 31)

    # 4. Timber Framing Corner Posts and Ceiling Crossbeams
    post_size = 0.22
    for px in (-half_w, half_w):
        for py in (-half_d, half_d):
            add_box(f"timber_post_{int(px)}_{int(py)}", (px, py, wall_height * 0.5 + 0.18), (post_size, post_size, wall_height), timber, root, bevel=0.025)

    # Wall bays and knee braces expose the post-and-beam structure instead of
    # leaving large plaster planes as an empty box.
    for index, px in enumerate((-width * 0.25, 0.0, width * 0.25)):
        add_box(f"timber_bay_post_back_{index}", (px, half_d - 0.07, wall_height * 0.5 + 0.18), (0.15, 0.14, wall_height - 0.08), dark_wood, root, bevel=0.014)
    for side, name in ((-1, "left"), (1, "right")):
        for index, py in enumerate((-depth * 0.27, 0.0, depth * 0.27)):
            add_box(f"timber_bay_post_{name}_{index}", (side * (half_w - 0.07), py, wall_height * 0.5 + 0.18), (0.14, 0.15, wall_height - 0.08), dark_wood, root, bevel=0.014)
        add_beam(
            f"timber_knee_brace_{name}_front",
            (side * (half_w - 0.10), -half_d + 0.10, wall_height - 0.74),
            (side * (half_w - 0.10), -half_d + 0.82, wall_height + 0.04),
            0.055,
            timber,
            root,
            vertices=6,
        )
        add_beam(
            f"timber_knee_brace_{name}_back",
            (side * (half_w - 0.10), half_d - 0.10, wall_height - 0.74),
            (side * (half_w - 0.10), half_d - 0.82, wall_height + 0.04),
            0.055,
            timber,
            root,
            vertices=6,
        )

    # Continuous rails divide the lime finish into human-scale bays. They sit
    # slightly proud of the plaster, exposing the actual frame instead of
    # leaving room-sized cream planes.
    for rail_index, rail_z in enumerate((1.22, 2.40)):
        add_box(
            f"timber_wall_rail_back_{rail_index}",
            (0, half_d - 0.075, rail_z),
            (width - 0.26, 0.14, 0.16),
            dark_wood if rail_index == 0 else timber,
            root,
            bevel=0.012,
        )
        add_box(
            f"timber_wall_rail_right_{rail_index}",
            (half_w - 0.075, 0, rail_z),
            (0.14, depth - 0.26, 0.16),
            dark_wood if rail_index == 0 else timber,
            root,
            bevel=0.012,
        )
        # The front rail respects the doorway rather than crossing it.
        add_box(
            f"timber_wall_rail_front_left_{rail_index}",
            (-(door_w * 0.5 + front_half_w * 0.5), -half_d + 0.075, rail_z),
            (front_half_w - 0.10, 0.14, 0.16),
            dark_wood if rail_index == 0 else timber,
            root,
            bevel=0.012,
        )
        add_box(
            f"timber_wall_rail_front_right_{rail_index}",
            (door_w * 0.5 + front_half_w * 0.5, -half_d + 0.075, rail_z),
            (front_half_w - 0.10, 0.14, 0.16),
            dark_wood if rail_index == 0 else timber,
            root,
            bevel=0.012,
        )

    # A small repaired wattle/lath bay makes the wall history legible without
    # covering the room in noisy micro-detail.
    repair_y = depth * 0.18
    repair_w = 1.25
    repair_h = 1.34
    repair_z = 1.70
    add_box(
        "interior_wattle_repair_recess",
        (half_w - 0.115, repair_y, repair_z),
        (0.07, repair_w + 0.16, repair_h + 0.16),
        dark_wood,
        root,
        bevel=0.010,
    )
    for lath in range(7):
        lath_z = repair_z - repair_h * 0.5 + repair_h * (lath + 0.5) / 7
        add_box(
            f"interior_wattle_lath_{lath:02d}",
            (half_w - 0.155, repair_y, lath_z),
            (0.055, repair_w, 0.075),
            timber if lath % 3 else dark_wood,
            root,
            rotation=(0.0, 0.0, 0.006 if lath % 2 else -0.006),
            bevel=0.006,
        )
    for upright, y in enumerate((repair_y - repair_w * 0.31, repair_y, repair_y + repair_w * 0.31)):
        add_box(
            f"interior_wattle_upright_{upright}",
            (half_w - 0.175, y, repair_z),
            (0.06, 0.075, repair_h),
            dark_wood,
            root,
            bevel=0.006,
        )

    # Top Wall Plates
    add_box("timber_plate_back", (0, half_d, wall_height + 0.14), (width, post_size, 0.16), timber, root, bevel=0.02)
    add_box("timber_plate_front", (0, -half_d, wall_height + 0.14), (width, post_size, 0.16), timber, root, bevel=0.02)
    add_box("timber_plate_left", (-half_w, 0, wall_height + 0.14), (post_size, depth, 0.16), timber, root, bevel=0.02)
    add_box("timber_plate_right", (half_w, 0, wall_height + 0.14), (post_size, depth, 0.16), timber, root, bevel=0.02)

    # Ceiling Beams spanning X axis
    num_beams = params["ceilingBeams"]
    for index in range(num_beams):
        by = -half_d + (depth / (num_beams + 1)) * (index + 1)
        add_box(f"ceiling_beam_{index:02d}", (0, by, wall_height + 0.10), (width - 0.1, 0.18, 0.20), dark_wood, root, bevel=0.02)

    # Two longitudinal purlins and short pegged ends make the ceiling framing
    # read as a carried structure rather than independent floating bars.
    for side, x in (("left", -width * 0.27), ("right", width * 0.27)):
        add_box(f"ceiling_purlin_{side}", (x, 0, wall_height + 0.03), (0.16, depth - 0.18, 0.16), timber, root, bevel=0.018)
        for end, y in (("front", -half_d + 0.20), ("back", half_d - 0.20)):
            add_cylinder(f"ceiling_peg_{side}_{end}", (x, y, wall_height - 0.07), 0.035, 0.18, dark_wood, root, vertices=6, bevel=0.006)

    add_collision_primitives(spec, root)


def cozy_bed(spec: dict, root) -> None:
    """Rustic cozy wooden bedstead with plush mattress, folded quilt, and soft pillow."""
    wood, canvas_cream, accent_quilt, dark_wood = spec["palette"]

    # Dimensions
    bed_w = 1.5
    bed_d = 2.1
    post_h_head = 1.15
    post_h_foot = 0.75
    post_size = 0.12

    # 4 Corner Posts
    for x in (-bed_w * 0.5, bed_w * 0.5):
        # Headboard posts
        add_box(f"bed_post_head_{int(x*10)}", (x, bed_d * 0.5, post_h_head * 0.5), (post_size, post_size, post_h_head), wood, root, bevel=0.02)
        add_cylinder(f"bed_finial_head_{int(x*10)}", (x, bed_d * 0.5, post_h_head + 0.05), 0.05, 0.10, dark_wood, root, vertices=6, bevel=0.01)
        # Footboard posts
        add_box(f"bed_post_foot_{int(x*10)}", (x, -bed_d * 0.5, post_h_foot * 0.5), (post_size, post_size, post_h_foot), wood, root, bevel=0.02)
        add_cylinder(f"bed_finial_foot_{int(x*10)}", (x, -bed_d * 0.5, post_h_foot + 0.04), 0.045, 0.08, dark_wood, root, vertices=6, bevel=0.01)

    # Side Rails
    rail_h = 0.14
    rail_z = 0.32
    add_box("bed_rail_left", (-bed_w * 0.5, 0, rail_z), (0.06, bed_d - post_size, rail_h), wood, root, bevel=0.015)
    add_box("bed_rail_right", (bed_w * 0.5, 0, rail_z), (0.06, bed_d - post_size, rail_h), wood, root, bevel=0.015)
    add_box("bed_rail_foot", (0, -bed_d * 0.5, rail_z), (bed_w - post_size, 0.06, rail_h), wood, root, bevel=0.015)

    # Headboard Planks
    add_box("bed_headboard_panel", (0, bed_d * 0.5, 0.72), (bed_w - post_size, 0.05, 0.55), dark_wood, root, bevel=0.02)
    add_box("bed_headboard_top_trim", (0, bed_d * 0.5, 1.02), (bed_w + 0.04, 0.08, 0.07), wood, root, bevel=0.015)

    # Footboard Planks
    add_box("bed_footboard_panel", (0, -bed_d * 0.5, 0.52), (bed_w - post_size, 0.05, 0.28), dark_wood, root, bevel=0.02)
    add_box("bed_footboard_top_trim", (0, -bed_d * 0.5, 0.68), (bed_w + 0.04, 0.08, 0.06), wood, root, bevel=0.015)

    # Slats & Base
    add_box("bed_base_board", (0, 0, 0.30), (bed_w - 0.08, bed_d - 0.08, 0.06), dark_wood, root, bevel=0.01)

    # Mattress
    matt_h = 0.24
    matt_z = 0.44
    add_box("bed_mattress", (0, 0, matt_z), (bed_w - 0.12, bed_d - 0.12, matt_h), canvas_cream, root, bevel=0.035, flat=False)

    # Soft Low-Poly Pillow
    add_box("bed_pillow", (0, bed_d * 0.5 - 0.35, matt_z + matt_h * 0.5 + 0.06), (bed_w - 0.35, 0.45, 0.12), canvas_cream, root, rotation=(-0.08, 0, 0), bevel=0.03, flat=False)

    # Cozy Folded Quilt at Foot of Bed
    quilt_l = bed_d * 0.55
    add_box("bed_quilt_main", (0, -bed_d * 0.5 + quilt_l * 0.5 + 0.06, matt_z + matt_h * 0.5 + 0.03), (bed_w - 0.08, quilt_l, 0.08), accent_quilt, root, bevel=0.025)
    # Folded turnover layer
    add_box("bed_quilt_fold", (0, -bed_d * 0.5 + quilt_l + 0.02, matt_z + matt_h * 0.5 + 0.05), (bed_w - 0.08, 0.18, 0.07), canvas_cream, root, bevel=0.02)

    add_collision_primitives(spec, root)


def fireplace_hearth(spec: dict, root) -> None:
    """Masonry stone fireplace hearth with glowing embers, firewood logs, mantel clock, and warm practical light."""
    stone, stone_golden, dark_wood, metal, emissive_fire = spec["palette"]

    width = spec["parameters"].get("width", 2.2)
    depth = spec["parameters"].get("depth", 1.0)
    height = spec["parameters"].get("height", 2.5)

    # 1. Hearth Stone Platform
    add_box("hearth_stone_base", (0, 0, 0.15), (width + 0.25, depth + 0.3, 0.30), stone, root, bevel=0.04)

    # 2. Fireplace Stone Columns and Opening
    recess_w = 1.15
    recess_h = 1.25
    side_w = (width - recess_w) * 0.5

    # Left & Right Stone Piers
    add_box("hearth_pier_left", (-(recess_w * 0.5 + side_w * 0.5), 0, recess_h * 0.5 + 0.30), (side_w, depth, recess_h), stone, root, bevel=0.04)
    add_box("hearth_pier_right", (recess_w * 0.5 + side_w * 0.5, 0, recess_h * 0.5 + 0.30), (side_w, depth, recess_h), stone, root, bevel=0.04)

    # Course masonry blocks on piers
    add_masonry_courses(
        "hearth_pier_stone_left", (-(recess_w * 0.5 + side_w * 0.5), 0, recess_h * 0.5 + 0.30),
        side_w, depth, recess_h, (stone, stone_golden), root, courses=4, blocks_per_long_side=2, seed=spec["seed"] + 1, block_depth=0.10, bevel=0.015,
    )
    add_masonry_courses(
        "hearth_pier_stone_right", (recess_w * 0.5 + side_w * 0.5, 0, recess_h * 0.5 + 0.30),
        side_w, depth, recess_h, (stone, stone_golden), root, courses=4, blocks_per_long_side=2, seed=spec["seed"] + 2, block_depth=0.10, bevel=0.015,
    )

    # Firebox Back & Arch Top
    add_box("hearth_firebox_back", (0, depth * 0.35, recess_h * 0.5 + 0.30), (recess_w, depth * 0.3, recess_h), stone, root, bevel=0.03)
    add_box("hearth_arch_lintel", (0, 0, recess_h + 0.40), (width, depth + 0.05, 0.28), stone_golden, root, bevel=0.03)

    # Chimney Breast above lintel
    chimney_h = height - (recess_h + 0.54)
    if chimney_h > 0.2:
        add_box("hearth_chimney_breast", (0, 0.02, recess_h + 0.54 + chimney_h * 0.5), (width - 0.2, depth - 0.1, chimney_h), stone, root, bevel=0.04)

    # 3. Chunky Rustic Wooden Mantelpiece
    mantel_z = recess_h + 0.54
    add_box("hearth_mantel_shelf", (0, -0.06, mantel_z), (width + 0.35, depth + 0.22, 0.14), dark_wood, root, bevel=0.025)

    # Mantel Props: Cozy Brass Clock & Candlestick
    add_box("mantel_clock_body", (0, -0.06, mantel_z + 0.16), (0.28, 0.12, 0.22), metal, root, bevel=0.015)
    add_cylinder("mantel_clock_face", (0, -0.13, mantel_z + 0.16), 0.07, 0.02, stone_golden, root, vertices=8, rotation=(math.pi / 2, 0, 0), bevel=0.005)
    add_cylinder("mantel_candle_holder", (0.55, -0.06, mantel_z + 0.10), 0.06, 0.04, metal, root, vertices=6, bevel=0.008)
    add_cylinder("mantel_candle_wax", (0.55, -0.06, mantel_z + 0.20), 0.025, 0.16, stone_golden, root, vertices=6, bevel=0.005)
    add_ico("mantel_candle_flame", (0.55, -0.06, mantel_z + 0.30), (0.025, 0.025, 0.045), emissive_fire, root, subdivisions=1)

    # 4. Cast Iron Fire Grate, Glowing Embers, Firewood Logs
    add_box("hearth_grate_base", (0, 0, 0.34), (0.75, 0.45, 0.06), metal, root, bevel=0.01)
    for gi in range(5):
        gx = -0.30 + gi * 0.15
        add_box(f"hearth_grate_bar_{gi}", (gx, 0, 0.42), (0.04, 0.48, 0.08), metal, root, bevel=0.008)

    # Glowing Embers Mesh
    add_box("hearth_ember_bed", (0, 0, 0.38), (0.60, 0.35, 0.08), emissive_fire, root, bevel=0.02)

    # Firewood Logs
    for index, (lx, ly, lz, rot_z, rot_y) in enumerate([
        (-0.15, -0.05, 0.45, 0.18, 0.08),
        (0.12, 0.02, 0.46, -0.22, -0.06),
        (0.0, -0.02, 0.54, 0.05, 0.12),
    ]):
        add_cylinder(f"hearth_fire_log_{index}", (lx, ly, lz), 0.055, 0.52, dark_wood, root, vertices=6, rotation=(rot_y, math.pi / 2, rot_z), bevel=0.01)

    # Layered flame tongues keep the fire readable as a fire rather than a
    # single over-bright emissive blob in the dark interior.
    add_ico("hearth_flame_outer_center", (0, -0.12, 0.66), (0.18, 0.09, 0.25), stone_golden, root, subdivisions=1)
    add_ico("hearth_flame_outer_left", (-0.13, -0.10, 0.59), (0.09, 0.07, 0.16), stone_golden, root, subdivisions=1)
    add_ico("hearth_flame_outer_right", (0.14, -0.09, 0.61), (0.08, 0.065, 0.18), stone_golden, root, subdivisions=1)
    add_ico("hearth_flame_inner", (0, -0.18, 0.67), (0.075, 0.045, 0.16), emissive_fire, root, subdivisions=1)

    # Practical Light Anchor: hearth_fire_glow
    add_ico("hearth_fire_glow", (0, -0.05, 0.54), (0.11, 0.11, 0.15), emissive_fire, root, subdivisions=2)

    add_collision_primitives(spec, root)


def dining_table(spec: dict, root) -> None:
    """Heavy timber kitchen / dining table with tabletop details."""
    wood, dark_wood, ceramic = spec["palette"]

    width = spec["parameters"].get("width", 1.8)
    depth = spec["parameters"].get("depth", 1.0)
    table_h = 0.88
    top_t = 0.08

    # 4 Legs with corner chamfer
    leg_size = 0.10
    leg_h = table_h - top_t
    lx = (width - leg_size) * 0.5 - 0.06
    ly = (depth - leg_size) * 0.5 - 0.06
    for sx in (-1, 1):
        for sy in (-1, 1):
            add_box(f"table_leg_{sx}_{sy}", (sx * lx, sy * ly, leg_h * 0.5), (leg_size, leg_size, leg_h), dark_wood, root, bevel=0.015)

    # Leg Stretchers / Apron
    apron_h = 0.10
    apron_z = leg_h - apron_h * 0.5
    add_box("table_apron_x_pos", (0, ly, apron_z), (width - 0.24, 0.04, apron_h), dark_wood, root, bevel=0.01)
    add_box("table_apron_x_neg", (0, -ly, apron_z), (width - 0.24, 0.04, apron_h), dark_wood, root, bevel=0.01)
    add_box("table_apron_y_pos", (lx, 0, apron_z), (0.04, depth - 0.24, apron_h), dark_wood, root, bevel=0.01)
    add_box("table_apron_y_neg", (-lx, 0, apron_z), (0.04, depth - 0.24, apron_h), dark_wood, root, bevel=0.01)

    # Lower Foot Stretcher
    add_box("table_foot_stretcher", (0, 0, 0.20), (width - 0.24, 0.05, 0.06), dark_wood, root, bevel=0.01)

    # Tabletop Planks
    add_box("tabletop_main", (0, 0, table_h - top_t * 0.5), (width, depth, top_t), wood, root, bevel=0.02)
    # Tabletop edge trims
    add_box("tabletop_trim_x1", (0, depth * 0.5, table_h - top_t * 0.5), (width + 0.02, 0.03, top_t + 0.01), dark_wood, root, bevel=0.008)
    add_box("tabletop_trim_x2", (0, -depth * 0.5, table_h - top_t * 0.5), (width + 0.02, 0.03, top_t + 0.01), dark_wood, root, bevel=0.008)

    # Tabletop Props: Ceramic Fruit Bowl & Tea Mug
    add_profiled_vessel("table_ceramic_bowl", (-.35, .05, table_h + .01),
        ((0, .075), (.035, .120), (.10, .160)), .012, ceramic, root, sides=10)
    add_profiled_vessel("table_tea_mug", (.35, -.12, table_h),
        ((0, .050), (.018, .060), (.12, .060)), .008, ceramic, root, sides=8)
    add_ring("table_tea_mug_handle", (0.42, -0.12, table_h + 0.06), 0.035, 0.012, ceramic, root, major_segments=6, minor_segments=3, rotation=(0, math.pi / 2, 0))

    add_collision_primitives(spec, root)


def rustic_chair(spec: dict, root) -> None:
    """Low-poly wooden ladderback chair with splayed legs and solid seat."""
    wood, dark_wood = spec["palette"]

    seat_w = 0.52
    seat_d = 0.48
    seat_h = 0.50
    seat_t = 0.05
    back_h = 0.52

    # 4 Legs
    leg_size = 0.055
    lx = (seat_w - leg_size) * 0.5 - 0.03
    ly = (seat_d - leg_size) * 0.5 - 0.03
    # Front legs
    for sx in (-1, 1):
        add_box(f"chair_leg_front_{sx}", (sx * lx, -ly, seat_h * 0.5), (leg_size, leg_size, seat_h), dark_wood, root, bevel=0.008)
    # Back legs (extend up into backrest posts)
    for sx in (-1, 1):
        total_back_leg_h = seat_h + back_h
        add_box(f"chair_leg_back_{sx}", (sx * lx, ly, total_back_leg_h * 0.5), (leg_size, leg_size, total_back_leg_h), dark_wood, root, bevel=0.008)

    # Lower Stretchers
    add_box("chair_stretcher_front", (0, -ly, 0.16), (seat_w - 0.12, 0.03, 0.03), dark_wood, root, bevel=0.005)
    add_box("chair_stretcher_left", (-lx, 0, 0.18), (0.03, seat_d - 0.12, 0.03), dark_wood, root, bevel=0.005)
    add_box("chair_stretcher_right", (lx, 0, 0.18), (0.03, seat_d - 0.12, 0.03), dark_wood, root, bevel=0.005)

    # Seat
    add_box("chair_seat", (0, 0, seat_h + seat_t * 0.5), (seat_w, seat_d, seat_t), wood, root, bevel=0.015)

    # Ladder Back Slats
    slat_w = seat_w - leg_size * 2 - 0.02
    add_box("chair_back_slat_top", (0, ly, seat_h + back_h - 0.05), (slat_w + 0.04, 0.025, 0.08), wood, root, bevel=0.01)
    add_box("chair_back_slat_mid", (0, ly, seat_h + back_h * 0.55), (slat_w, 0.025, 0.06), wood, root, bevel=0.008)

    add_collision_primitives(spec, root)


def woven_rug(spec: dict, root) -> None:
    """Faceted woven area rug with decorative low-poly geometric pattern and fringe."""
    ochre, red, cream, teal = spec["palette"]

    width = spec["parameters"].get("width", 2.6)
    depth = spec["parameters"].get("depth", 1.8)
    thickness = 0.03

    # Main Rug Body
    add_box("rug_body", (0, 0, thickness * 0.5), (width, depth, thickness), ochre, root, bevel=0.008)

    # Inset Border Pattern
    border_t = 0.14
    add_box("rug_border_top", (0, depth * 0.5 - border_t * 0.5 - 0.08, thickness * 0.5 + 0.002), (width - 0.25, border_t, thickness), red, root, bevel=0.005)
    add_box("rug_border_bot", (0, -depth * 0.5 + border_t * 0.5 + 0.08, thickness * 0.5 + 0.002), (width - 0.25, border_t, thickness), red, root, bevel=0.005)
    add_box("rug_border_left", (-width * 0.5 + border_t * 0.5 + 0.08, 0, thickness * 0.5 + 0.002), (border_t, depth - 0.25, thickness), red, root, bevel=0.005)
    add_box("rug_border_right", (width * 0.5 - border_t * 0.5 - 0.08, 0, thickness * 0.5 + 0.002), (border_t, depth - 0.25, thickness), red, root, bevel=0.005)

    # Center Medallion / Diamond
    add_box("rug_center_patch", (0, 0, thickness * 0.5 + 0.004), (0.75, 0.75, thickness), cream, root, rotation=(0, 0, math.pi / 4), bevel=0.005)
    add_box("rug_center_gem", (0, 0, thickness * 0.5 + 0.006), (0.35, 0.35, thickness), teal, root, rotation=(0, 0, math.pi / 4), bevel=0.005)

    # Braided Fringe Ends along Left & Right
    fringe_l = 0.10
    fringe_count = 10
    for i in range(fringe_count):
        fy = -depth * 0.5 + (depth / fringe_count) * (i + 0.5)
        add_box(f"rug_fringe_left_{i}", (-width * 0.5 - fringe_l * 0.5, fy, thickness * 0.5), (fringe_l, depth / fringe_count * 0.7, thickness * 0.8), cream, root, bevel=0.003)
        add_box(f"rug_fringe_right_{i}", (width * 0.5 + fringe_l * 0.5, fy, thickness * 0.5), (fringe_l, depth / fringe_count * 0.7, thickness * 0.8), cream, root, bevel=0.003)

    add_collision_primitives(spec, root)


def cupboard_shelves(spec: dict, root) -> None:
    """Rustic kitchen/pantry cupboard with storage cabinets, open shelves, jars, dishes, and books."""
    wood, dark_wood, ceramic, stone = spec["palette"]

    width = spec["parameters"].get("width", 1.6)
    depth = spec["parameters"].get("depth", 0.6)
    height = spec["parameters"].get("height", 2.2)

    # 1. Main Outer Frame & Base Plinth
    add_box("cupboard_plinth", (0, 0, 0.10), (width + 0.06, depth + 0.04, 0.20), dark_wood, root, bevel=0.02)
    # Side panels
    add_box("cupboard_side_left", (-width * 0.5 + 0.03, 0, height * 0.5), (0.06, depth, height), wood, root, bevel=0.02)
    add_box("cupboard_side_right", (width * 0.5 - 0.03, 0, height * 0.5), (0.06, depth, height), wood, root, bevel=0.02)
    # Back panel
    add_box("cupboard_back_panel", (0, depth * 0.5 - 0.02, height * 0.5), (width - 0.06, 0.04, height), dark_wood, root, bevel=0.01)
    # Top cornice
    add_box("cupboard_top_cornice", (0, -0.02, height + 0.05), (width + 0.10, depth + 0.08, 0.10), dark_wood, root, bevel=0.02)

    # 2. Lower Cabinet Doors (z: 0.20 -> 0.90)
    counter_z = 0.90
    add_box("cupboard_counter_shelf", (0, -0.02, counter_z), (width + 0.04, depth + 0.06, 0.06), dark_wood, root, bevel=0.015)
    door_w = (width - 0.12) * 0.5
    door_h = counter_z - 0.22
    add_box("cupboard_door_left", (-door_w * 0.5 - 0.01, -depth * 0.5 + 0.03, 0.20 + door_h * 0.5), (door_w, 0.04, door_h), wood, root, bevel=0.015)
    add_box("cupboard_door_right", (door_w * 0.5 + 0.01, -depth * 0.5 + 0.03, 0.20 + door_h * 0.5), (door_w, 0.04, door_h), wood, root, bevel=0.015)
    # Door knobs
    add_cylinder("cupboard_knob_left", (-0.06, -depth * 0.5 - 0.01, 0.20 + door_h * 0.5), 0.02, 0.04, dark_wood, root, vertices=6, rotation=(math.pi / 2, 0, 0), bevel=0.005)
    add_cylinder("cupboard_knob_right", (0.06, -depth * 0.5 - 0.01, 0.20 + door_h * 0.5), 0.02, 0.04, dark_wood, root, vertices=6, rotation=(math.pi / 2, 0, 0), bevel=0.005)

    # 3. Upper Shelves (z: 1.35, 1.75)
    shelf_t = 0.04
    for index, sz in enumerate([1.35, 1.75]):
        add_box(f"cupboard_shelf_{index}", (0, 0, sz), (width - 0.06, depth - 0.06, shelf_t), wood, root, bevel=0.01)

    # 4. Shelf Contents (Clay Jars, Preserve Jars, Books, Stacked Plates)
    # Countertop items (z: 0.93)
    add_cylinder("prop_crock_large", (-0.45, 0.02, 1.10), 0.14, 0.34, ceramic, root, vertices=8, bevel=0.015)
    add_cylinder("prop_crock_lid", (-0.45, 0.02, 1.28), 0.12, 0.05, dark_wood, root, vertices=8, bevel=0.008)

    # Middle Shelf items (z: 1.37)
    for bi, (bx, col) in enumerate([(-0.45, dark_wood), (-0.35, ceramic), (-0.25, wood)]):
        add_box(f"prop_book_{bi}", (bx, 0.05, 1.50), (0.07, 0.26, 0.22), col, root, rotation=(0, 0.08 if bi == 2 else 0, 0), bevel=0.008)
    add_cylinder("prop_preserve_jar_1", (0.25, 0.02, 1.47), 0.09, 0.18, ceramic, root, vertices=8, bevel=0.01)
    add_cylinder("prop_preserve_jar_2", (0.48, 0.02, 1.45), 0.08, 0.15, stone, root, vertices=8, bevel=0.01)

    # Top Shelf items (z: 1.77)
    for pi in range(3):
        add_cylinder(f"prop_stacked_plate_{pi}", (-0.38, 0.02, 1.79 + pi * 0.035), 0.15, 0.03, ceramic, root, vertices=8, bevel=0.005)
    add_cylinder("prop_spice_pot_1", (0.18, 0.02, 1.87), 0.06, 0.14, dark_wood, root, vertices=6, bevel=0.008)
    add_cylinder("prop_spice_pot_2", (0.35, 0.02, 1.86), 0.06, 0.13, stone, root, vertices=6, bevel=0.008)
    add_cylinder("prop_spice_pot_3", (0.50, 0.02, 1.88), 0.055, 0.15, ceramic, root, vertices=6, bevel=0.008)

    add_collision_primitives(spec, root)


def cozy_armchair(spec: dict, root) -> None:
    """Low-poly comfortable cushioned armchair with wooden feet and cozy cushion."""
    fabric, dark_wood, fabric_accent = spec["palette"]

    width = 0.95
    depth = 0.90
    height = 0.92

    # 4 Stubby Wooden Feet
    foot_size = 0.09
    foot_h = 0.12
    fx = (width - foot_size) * 0.5 - 0.06
    fy = (depth - foot_size) * 0.5 - 0.06
    for sx in (-1, 1):
        for sy in (-1, 1):
            add_box(f"chair_foot_{sx}_{sy}", (sx * fx, sy * fy, foot_h * 0.5), (foot_size, foot_size, foot_h), dark_wood, root, bevel=0.012)

    # Armchair Main Base Plinth
    add_box("armchair_base", (0, 0, foot_h + 0.14), (width, depth, 0.28), fabric, root, bevel=0.04)

    # Thick Soft Seat Cushion
    seat_z = foot_h + 0.32
    add_box("armchair_cushion", (0, -0.04, seat_z), (width - 0.28, depth - 0.22, 0.16), fabric_accent, root, bevel=0.035, flat=False)

    # Rounded Armrests Left & Right
    arm_w = 0.18
    arm_h = 0.38
    arm_z = seat_z + 0.08
    add_box("armchair_arm_left", (-width * 0.5 + arm_w * 0.5, -0.02, arm_z), (arm_w, depth - 0.08, arm_h), fabric, root, bevel=0.04, flat=False)
    add_box("armchair_arm_right", (width * 0.5 - arm_w * 0.5, -0.02, arm_z), (arm_w, depth - 0.08, arm_h), fabric, root, bevel=0.04, flat=False)

    # Padded Backrest
    back_t = 0.22
    back_h = 0.52
    back_z = seat_z + back_h * 0.5
    add_box("armchair_backrest", (0, depth * 0.5 - back_t * 0.5, back_z), (width - 0.06, back_t, back_h), fabric, root, rotation=(-0.08, 0, 0), bevel=0.045, flat=False)

    add_collision_primitives(spec, root)
